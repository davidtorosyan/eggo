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
// Exported so the push module posts notifications to the same active backend.
export function endpoint() {
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

// Mutable fields the backend owns. If a synced entry's remote copy differs on any
// of these, it was edited elsewhere and we adopt the remote value.
const MUTABLE = ['timestamp', 'weight', 'color', 'chicken', 'condition']
const mutated = (a, b) => MUTABLE.some((k) => (a[k] ?? null) !== (b[k] ?? null))

// --- Pure core (no I/O): merge local + remote into the new local state, and
// prune tombstones (pendingDeletes) already gone from the backend.
// Returns { entries, pendingDeletes, added, removed, changed }: added/removed/changed
// count what a pull changed, so the UI can refresh and decide whether to notify.
export function reconcile(local, remote, pendingDeletes = []) {
  const pending = new Set(pendingDeletes)
  const remoteById = new Map(remote.map((e) => [e.id, e]))
  const localIds = new Set(local.map((e) => e.id))
  const entries = []
  let removed = 0
  let changed = 0

  for (const e of local) {
    if (pending.has(e.id)) continue // tombstoned; awaiting remote delete
    const r = remoteById.get(e.id)
    if (e.synced) {
      if (r) {
        // Backend is the source of truth for an already-synced entry: adopt a
        // field change made elsewhere (e.g. edited to broken shell on another
        // device). Preserve the local-only `seeded` marker.
        if (mutated(e, r)) changed++
        entries.push(e.seeded ? { ...r, synced: true, seeded: true } : { ...r, synced: true })
      } else {
        removed++ // remote-deleted elsewhere → drop
      }
    } else {
      // A local add or not-yet-pushed edit: local wins (flush will upsert it).
      entries.push(r ? { ...e, synced: true } : e)
    }
  }

  let added = 0
  for (const r of remote) {
    if (localIds.has(r.id) || pending.has(r.id)) continue
    entries.push({ ...r, synced: true }) // pulled from the backend
    added++
  }

  // Keep only tombstones still present remotely; the rest are already gone.
  const newPending = pendingDeletes.filter((id) => remoteById.has(id))
  return { entries, pendingDeletes: newPending, added, removed, changed }
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
  condition: e.condition ?? null,
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

// Merge flag changes into the CURRENT stored entries by id. Re-reads storage so
// a save that lands while a flush is awaiting the network isn't clobbered by a
// stale whole-array write (the race that could lose eggs on rapid adds).
function setFlags(ids, flags) {
  const set = new Set(ids)
  const cur = getEntries()
  let changed = false
  for (const e of cur) {
    if (set.has(e.id)) {
      Object.assign(e, flags)
      changed = true
    }
  }
  if (changed) setEntries(cur)
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
    const ids = unsynced.map((e) => e.id)
    setFlags(ids, { attempted: true }) // persist intent before the network: a lost
    // response turns these into `attempted` resends next time, never dup appends.
    try {
      if (fresh.length) await appendRemote(fresh)
      if (resend.length) await batchUpsert(resend)
      setFlags(ids, { synced: true })
    } catch {
      ok = false // network down — `attempted` stays set, so the retry upserts
    }
  }

  if (ok && pending.length) {
    const failed = []
    for (const id of pending) {
      try {
        await deleteRemote(id)
      } catch {
        failed.push(id)
      }
    }
    const cleared = new Set(pending.filter((id) => !failed.includes(id)))
    setPendingDeletes(getPendingDeletes().filter((id) => !cleared.has(id)))
    if (failed.length) ok = false
  }

  emit({ kind: 'push', phase: 'end', ok, ms: Date.now() - t0 })
  return ok
}

// --- pull: fetch the backend, reconcile into local, then flush local changes.
// Returns { added, removed, changed, ok }. Serialized like flush.
let pulling = null

export function pull() {
  if (!endpoint()) return Promise.resolve({ added: 0, removed: 0, changed: 0, ok: false })
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
    return { added: 0, removed: 0, changed: 0, ok: false }
  }
  const { entries, pendingDeletes, added, removed, changed } = reconcile(
    getEntries(),
    remote,
    getPendingDeletes(),
  )
  setEntries(entries)
  setPendingDeletes(pendingDeletes)
  setLastPull(new Date().toISOString())
  emit({ kind: 'pull', phase: 'end', ok: true, ms: Date.now() - t0 })
  await flush() // push anything still local-only + drain deletes (emits its own)
  return { added, removed, changed, ok: true }
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
