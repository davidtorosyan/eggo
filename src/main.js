import './style.css'
import { renderLog } from './log-view.js'
import { renderStats } from './stats-view.js'
import { getEntries } from './storage.js'
import { pull } from './sync.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="card">
    <header class="top">
      <h1>
        <span class="egg">🥚</span> Eggo
        <span id="sync-status" class="sync-status" role="status" aria-live="polite"></span>
      </h1>
      <nav class="tabs">
        <button type="button" class="tab" data-tab="log">Log</button>
        <button type="button" class="tab" data-tab="stats">Stats</button>
      </nav>
    </header>
    <div id="view"></div>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
`

const view = document.querySelector('#view')
const nav = document.querySelector('.tabs')
const views = { log: renderLog, stats: renderStats }

let current = 'log'
// Each render gets a fresh AbortController; switching views aborts the old one,
// cleaning up any window listeners the view registered (see log-view).
let viewAbort

function show(name) {
  if (!views[name]) name = 'log'
  current = name
  document
    .querySelectorAll('.tab')
    .forEach((t) => t.classList.toggle('active', t.dataset.tab === name))
  history.replaceState(null, '', name === 'log' ? '#' : `#${name}`)
  viewAbort?.abort()
  viewAbort = new AbortController()
  views[name](view, viewAbort.signal)
}

nav.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab')
  if (tab) show(tab.dataset.tab)
})

const requested = location.hash.replace('#', '') || 'log'
show(requested)

// --- Background sync (quiet by default) -----------------------------------
const syncEl = document.querySelector('#sync-status')
const toastEl = document.querySelector('#toast')
let toastTimer

function setSync(state) {
  syncEl.className = `sync-status ${state}`
  syncEl.title =
    state === 'offline'
      ? 'Offline — will sync when reconnected'
      : state === 'syncing'
        ? 'Syncing…'
        : ''
}

function toast(message) {
  toastEl.textContent = message
  toastEl.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 3500)
}

// Refresh data-dependent UI after a pull changed local entries. The log form is
// preserved (history refreshes via event); stats/debug fully re-render.
function refreshAfterSync() {
  if (current === 'log') window.dispatchEvent(new Event('eggo:historychanged'))
  else views[current]?.(view, viewAbort?.signal)
}

async function runSync(initial = false) {
  const fresh = initial && getEntries().length === 0
  setSync('syncing')
  if (fresh) toast('Loading your eggs…')
  const { added, removed, ok } = await pull()
  setSync(ok ? 'idle' : 'offline')
  if (!ok) {
    if (fresh) toast('Offline — your eggs will load when reconnected')
    return
  }
  if (added || removed) refreshAfterSync()
  if (fresh) toast(`Loaded ${added} egg${added === 1 ? '' : 's'} from the cloud`)
  else if (added || removed) toast(syncSummary(added, removed))
}

function syncSummary(added, removed) {
  const parts = []
  if (added) parts.push(`${added} added`)
  if (removed) parts.push(`${removed} removed`)
  return `Synced — ${parts.join(', ')}`
}

runSync(true)
window.addEventListener('online', () => runSync())
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) runSync()
})

// Debug tab — dev builds only; the whole chunk is dropped from prod.
if (import.meta.env.DEV) {
  import('./debug-view.js').then(({ renderDebug }) => {
    views.debug = renderDebug
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tab'
    btn.dataset.tab = 'debug'
    btn.textContent = 'Debug'
    nav.append(btn)
    // The initial show() fell back to Log if #debug was requested before
    // this chunk loaded — honor the original deep link now.
    if (requested === 'debug') show('debug')
  })
}
