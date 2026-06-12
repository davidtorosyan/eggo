import { APPS_SCRIPT_URL } from './config.js'

const ENTRIES_KEY = 'eggo-entries'

// All entries live in localStorage as the local source of truth for the UI.
// Each entry: { id, timestamp, weight, color, chicken, synced, seeded? }.
// `synced: false` marks entries still waiting to be POSTed to the Sheet.

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

// Returns { entry, queued } — queued means the entry is saved locally but not
// yet in the Sheet (endpoint unconfigured, or offline in the coop).
export async function saveEgg(data) {
  const entry = { id: crypto.randomUUID(), synced: false, ...data }
  setEntries([...getEntries(), entry])
  const allSynced = await trySync()
  return { entry, queued: !allSynced }
}

// Local-only: entries already synced to the Sheet stay in the Sheet for now.
export function deleteEgg(id) {
  setEntries(getEntries().filter((e) => e.id !== id))
}

// Push all unsynced entries; returns true if everything is synced after.
export async function trySync() {
  if (!APPS_SCRIPT_URL) return false
  const entries = getEntries()
  for (const entry of entries) {
    if (entry.synced) continue
    try {
      await postEgg(entry)
      entry.synced = true
    } catch {
      setEntries(entries)
      return false
    }
  }
  setEntries(entries)
  return true
}

async function postEgg(entry) {
  const { timestamp, weight, color, chicken } = entry
  // text/plain avoids a CORS preflight, which Apps Script doesn't handle.
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ timestamp, weight, color, chicken }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
