import { flush } from './sync.js'

const ENTRIES_KEY = 'eggo-entries'
const PENDING_KEY = 'eggo-pending-deletes'
const LASTPULL_KEY = 'eggo-last-pull'
const DEBUG_BACKEND_KEY = 'eggo-debug-backend'

// All entries live in localStorage as the local source of truth for the UI.
// Each entry: { id, timestamp, weight, color, chicken, synced, seeded? }.
// `synced: false` marks a local add not yet pushed to the Sheet. Sync itself
// lives in sync.js; this module is the local-storage primitive layer.

export function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY)) ?? []
  } catch {
    return []
  }
}

export function setEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries))
}

// Ids of entries that were synced and then deleted locally — a tombstone queue
// so a pull won't re-add them before the backend delete lands.
export function getPendingDeletes() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) ?? []
  } catch {
    return []
  }
}

export function setPendingDeletes(ids) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ids))
}

export function getLastPull() {
  return localStorage.getItem(LASTPULL_KEY)
}

export function setLastPull(iso) {
  localStorage.setItem(LASTPULL_KEY, iso)
}

// When true, sync targets the throwaway debug backend instead of production.
// Only ever set via the dev-only Debug tab (never present in prod builds), so
// a real user's app always uses the production endpoint.
export function isDebugBackend() {
  return localStorage.getItem(DEBUG_BACKEND_KEY) === 'true'
}

export function setDebugBackend(on) {
  localStorage.setItem(DEBUG_BACKEND_KEY, on ? 'true' : 'false')
}

// crypto.randomUUID is unavailable in insecure contexts (plain-HTTP LAN
// testing on a phone), so fall back to a timestamp+random id.
export function uid() {
  return (
    crypto.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  )
}

// Save locally and return immediately; the push happens in the background so
// the Save button never waits on the network. Returns { entry }.
export function saveEgg(data) {
  const entry = { id: uid(), synced: false, ...data }
  setEntries([...getEntries(), entry])
  void flush()
  return { entry }
}

// Add a batch of already-parsed entries (bulk import) and sync them in the
// background, keeping the list time-ordered.
export function importEntries(entries) {
  setEntries(
    [...getEntries(), ...entries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    ),
  )
  void flush()
}

// Edit an existing entry's fields (weight/color/chicken/condition) in place.
// Entries used to be immutable; an edit re-pushes by id via the idempotent upsert
// path — mark a previously-synced entry unsynced + attempted so flush() upserts
// the changed row instead of appending a duplicate. Returns the updated entry.
export function updateEgg(id, fields) {
  const entries = getEntries()
  const entry = entries.find((e) => e.id === id)
  if (!entry) return null
  Object.assign(entry, fields)
  if (entry.synced) {
    entry.synced = false
    entry.attempted = true // already on the backend → re-push must upsert, not append
  }
  setEntries(entries)
  void flush()
  return entry
}

// Remove locally. If the entry was already on the backend, queue a remote
// delete so the deletion propagates to other devices.
export function deleteEgg(id) {
  const entries = getEntries()
  const entry = entries.find((e) => e.id === id)
  setEntries(entries.filter((e) => e.id !== id))
  if (entry && entry.synced) {
    const pending = getPendingDeletes()
    if (!pending.includes(id)) setPendingDeletes([...pending, id])
  }
  void flush()
}
