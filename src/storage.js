import { APPS_SCRIPT_URL } from './config.js'

const QUEUE_KEY = 'eggo-queue'

// Returns { ok, queued } — queued means saved locally because the endpoint
// is unconfigured or unreachable (offline in the coop, etc.).
export async function saveEgg(entry) {
  if (!APPS_SCRIPT_URL) {
    enqueue(entry)
    return { ok: true, queued: true }
  }
  try {
    await postEgg(entry)
    await flushQueue()
    return { ok: true, queued: false }
  } catch {
    enqueue(entry)
    return { ok: true, queued: true }
  }
}

async function postEgg(entry) {
  // text/plain avoids a CORS preflight, which Apps Script doesn't handle.
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) ?? []
  } catch {
    return []
  }
}

function enqueue(entry) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...getQueue(), entry]))
}

export async function flushQueue() {
  if (!APPS_SCRIPT_URL) return
  const queue = getQueue()
  while (queue.length > 0) {
    await postEgg(queue[0])
    queue.shift()
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }
}
