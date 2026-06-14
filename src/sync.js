// Background sync between localStorage and the Apps Script / Sheet backend.
//
// Design: saving writes locally and returns instantly; pushing happens here in
// the background. The backend is the shared source of truth — a previously
// synced entry that is gone from the backend was deleted on another device, so
// we drop it locally. Never-synced local entries are always preserved + pushed.
// Dev-only `seeded` entries are local fake data, outside the sync domain.
import { APPS_SCRIPT_URL, DEBUG_APPS_SCRIPT_URL } from './config.js'
import {
  getEntries,
  setEntries,
  getPendingDeletes,
  setPendingDeletes,
  setLastPull,
  isDebugBackend,
} from './storage.js'

// Resolved per call so the Debug-tab backend toggle takes effect immediately.
function endpoint() {
  return isDebugBackend() && DEBUG_APPS_SCRIPT_URL
    ? DEBUG_APPS_SCRIPT_URL
    : APPS_SCRIPT_URL
}

// Broadcast sync activity so the UI can show it live (the debug duration meter).
// kind: 'push' | 'pull'; phase: 'start' | 'end' (end carries ok + ms).
function emit(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eggo:sync', { detail }))
  }
}

// --- Pure core (no I/O): merge local + remote into the new local state, and
// prune tombstones (pendingDeletes) already gone from the backend.
// Returns { entries, pendingDeletes, added, removed } where added/removed count
// what a pull changed, so the UI can decide whether to notify.
export function reconcile(local, remote, pendingDeletes = []) {
  const pending = new Set(pendingDeletes)
  const remoteIds = new Set(remote.map((e) => e.id))
  const localIds = new Set(local.map((e) => e.id))
  const entries = []
  let removed = 0

  for (const e of local) {
    if (pending.has(e.id)) continue // tombstoned; awaiting remote delete
    const inRemote = remoteIds.has(e.id)
    if (e.synced) {
      if (inRemote) entries.push(e) // unchanged (entries are immutable)
      else removed++ // remote-deleted elsewhere → drop
    } else {
      entries.push(inRemote ? { ...e, synced: true } : e) // new local add
    }
  }

  let added = 0
  for (const r of remote) {
    if (localIds.has(r.id) || pending.has(r.id)) continue
    entries.push({ ...r, synced: true }) // pulled from the backend
    added++
  }

  // Keep only tombstones still present remotely; the rest are already gone.
  const newPending = pendingDeletes.filter((id) => remoteIds.has(id))
  return { entries, pendingDeletes: newPending, added, removed }
}

// --- Network helpers (text/plain avoids a CORS preflight Apps Script can't
// handle). Use the global fetch so Node tests can drive these directly.
async function fetchRemote() {
  const res = await fetch(endpoint())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function post(body) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

const strip = (e) => ({
  id: e.id,
  timestamp: e.timestamp,
  weight: e.weight ?? null,
  color: e.color,
  chicken: e.chicken ?? null,
})

// Brand-new entries: append without an id-scan — O(1) regardless of sheet size.
// Exported so the Debug tab can bulk-load the backend.
export function appendRemote(entries) {
  return post({ action: 'append', entries: entries.map(strip) })
}

// Re-sent entries (a retry, or a debug re-sync): upsert by id so it's idempotent.
function batchUpsert(entries) {
  return post({ action: 'batch', entries: entries.map(strip) })
}

function deleteRemote(id) {
  return post({ action: 'delete', id })
}

// --- flush: push unsynced entries, then drain queued deletes. Serialized so
// overlapping triggers (save + online event) don't double-run; a flush request
// that arrives mid-flight re-runs once after, to pick up newly queued work.
let flushing = null
let flushAgain = false

export function flush() {
  if (!endpoint()) return Promise.resolve(false)
  if (flushing) {
    flushAgain = true
    return flushing
  }
  flushing = (async () => {
    let ok = false
    do {
      flushAgain = false
      ok = await doFlush()
    } while (flushAgain && ok)
    return ok
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function doFlush() {
  const entries = getEntries()
  const unsynced = entries.filter((e) => !e.synced)
  const pending = getPendingDeletes()
  if (!unsynced.length && !pending.length) return true // nothing to push

  const t0 = Date.now()
  emit({ kind: 'push', phase: 'start' })
  let ok = true

  if (unsynced.length) {
    // Fresh entries (never sent) append in O(1); anything sent before — or a
    // retry, or a debug re-sync — upserts so it can't duplicate.
    const fresh = unsynced.filter((e) => !e.attempted)
    const resend = unsynced.filter((e) => e.attempted)
    for (const e of unsynced) e.attempted = true
    setEntries(entries) // persist intent before the network: a lost response
    // turns these into `attempted` resends next time, never duplicate appends.
    try {
      if (fresh.length) await appendRemote(fresh)
      if (resend.length) await batchUpsert(resend)
      for (const e of unsynced) e.synced = true
      setEntries(entries)
    } catch {
      ok = false // network down — `attempted` stays set, so the retry upserts
    }
  }

  if (ok && pending.length) {
    const remaining = []
    for (const id of pending) {
      try {
        await deleteRemote(id)
      } catch {
        remaining.push(id)
      }
    }
    setPendingDeletes(remaining)
    if (remaining.length) ok = false
  }

  emit({ kind: 'push', phase: 'end', ok, ms: Date.now() - t0 })
  return ok
}

// --- pull: fetch the backend, reconcile into local, then flush local changes.
// Returns { added, removed, ok }. Serialized like flush.
let pulling = null

export function pull() {
  if (!endpoint()) return Promise.resolve({ added: 0, removed: 0, ok: false })
  if (pulling) return pulling
  pulling = doPull().finally(() => {
    pulling = null
  })
  return pulling
}

async function doPull() {
  const t0 = Date.now()
  emit({ kind: 'pull', phase: 'start' })
  let remote
  try {
    remote = await fetchRemote()
  } catch {
    emit({ kind: 'pull', phase: 'end', ok: false, ms: Date.now() - t0 })
    return { added: 0, removed: 0, ok: false }
  }
  const { entries, pendingDeletes, added, removed } = reconcile(
    getEntries(),
    remote,
    getPendingDeletes(),
  )
  setEntries(entries)
  setPendingDeletes(pendingDeletes)
  setLastPull(new Date().toISOString())
  emit({ kind: 'pull', phase: 'end', ok: true, ms: Date.now() - t0 })
  await flush() // push anything still local-only + drain deletes (emits its own)
  return { added, removed, ok: true }
}

// Backend row count, for the Debug tab. Throws if unreachable.
export async function remoteCount() {
  const rows = await fetchRemote()
  return rows.length
}

// --- Debug-only backend pokes (used by the dev Debug tab to force divergence
// between local and the Sheet). Not used by the normal app flow.
export function clearRemote() {
  return post({ action: 'clear' })
}

export function upsertRemote(entry) {
  return post(entry)
}

export function deleteRemoteById(id) {
  return post({ action: 'delete', id })
}
