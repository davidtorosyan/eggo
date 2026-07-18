import './style.css'
import { renderLog } from './log-view.js'
import { renderStats } from './stats-view.js'
import { getEntries, isDebugBackend } from './storage.js'
import { pull } from './sync.js'
import { eggLogo } from './egg-icon.js'
import { loadOneSignal } from './push.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="card">
    <header class="top">
      <h1>
        <span class="logo">${eggLogo()}</span> Eggo
        <span id="debug-badge" class="debug-badge" hidden>DEBUG 🧪</span>
        <span id="sync-meter" class="sync-meter" hidden></span>
        <span id="sync-status" class="sync-status" role="status" aria-live="polite"></span>
      </h1>
      <nav class="tabs">
        <button type="button" class="tab" data-tab="log">Log</button>
        <button type="button" class="tab" data-tab="stats">Stats</button>
      </nav>
    </header>
    <div id="view"></div>
  </main>
  <div id="ptr" class="ptr"><div class="ptr-badge"><span class="ptr-icon">↻</span></div></div>
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

// Persistent "DEBUG" badge by the logo whenever sync targets the debug backend
// (set via the Debug tab). Never shows in prod — the flag can't be set there.
const debugBadge = document.querySelector('#debug-badge')
function updateDebugBadge() {
  const on = isDebugBackend()
  debugBadge.hidden = !on
  if (!on) hideMeter() // leaving debug clears any lingering meter
}

// Live sync-duration meter (debug mode only): shows ↑/↓ with a ticking timer
// while a push/pull runs, then the final duration. Visible on every screen.
const syncMeter = document.querySelector('#sync-meter')
let meterTick
let meterHide
function hideMeter() {
  clearInterval(meterTick)
  clearTimeout(meterHide)
  syncMeter.hidden = true
}
window.addEventListener('eggo:sync', ({ detail }) => {
  if (!isDebugBackend()) return
  const arrow = detail.kind === 'pull' ? '↓' : '↑'
  if (detail.phase === 'start') {
    clearTimeout(meterHide)
    clearInterval(meterTick)
    const t0 = Date.now()
    syncMeter.hidden = false
    syncMeter.className = 'sync-meter active'
    const render = () => {
      syncMeter.textContent = `${arrow} ${((Date.now() - t0) / 1000).toFixed(1)}s`
    }
    render()
    meterTick = setInterval(render, 80)
  } else {
    clearInterval(meterTick)
    syncMeter.className = `sync-meter ${detail.ok ? 'done' : 'fail'}`
    syncMeter.textContent = `${arrow} ${(detail.ms / 1000).toFixed(1)}s${detail.ok ? '' : ' ✗'}`
    meterHide = setTimeout(hideMeter, 4000) // linger so the duration is readable
  }
})

updateDebugBadge()
window.addEventListener('eggo:backendchanged', updateDebugBadge)

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

async function runSync(initial = false, manual = false) {
  const fresh = initial && getEntries().length === 0
  setSync('syncing')
  if (fresh) toast('Loading your eggs…')
  const { added, removed, changed, ok } = await pull()
  setSync(ok ? 'idle' : 'offline')
  if (!ok) {
    if (manual) toast('Offline — no connection')
    else if (fresh) toast('Offline — your eggs will load when reconnected')
    return
  }
  if (added || removed || changed) refreshAfterSync()
  if (fresh) toast(`Loaded ${added} egg${added === 1 ? '' : 's'} from the cloud`)
  else if (added || removed || changed) toast(syncSummary(added, removed, changed))
  else if (manual) toast('Up to date')
}

function syncSummary(added, removed, changed) {
  const parts = []
  if (added) parts.push(`${added} added`)
  if (removed) parts.push(`${removed} removed`)
  if (changed) parts.push(`${changed} updated`)
  return `Synced — ${parts.join(', ')}`
}

runSync(true)
// Load the OneSignal SDK so an already-subscribed device stays subscribed and the
// opt-in control can work. No-op until ONESIGNAL_APP_ID is set + on insecure/LAN.
loadOneSignal()
window.addEventListener('online', () => runSync())
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) runSync()
})

// --- Pull-to-refresh: a standalone PWA has no browser chrome / native
// pull-to-refresh, so implement it. Drag down from the top past a threshold to
// trigger a sync. ---
const ptr = document.querySelector('#ptr')
const ptrBadge = ptr.querySelector('.ptr-badge')
const ptrIcon = ptr.querySelector('.ptr-icon')
const PTR_TRIGGER = 60
const PTR_MAX = 96
let ptrStartY = null
let ptrDist = 0
let ptrBusy = false

const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0

function setPtr(dist) {
  ptrDist = dist
  const shown = Math.min(dist, PTR_MAX)
  ptrBadge.style.transform = `translateY(${-52 + Math.min(shown, 62)}px)`
  ptrBadge.style.opacity = String(Math.min(shown / PTR_TRIGGER, 1))
  ptrIcon.style.transform = `rotate(${shown * 2.5}deg)`
  ptr.classList.toggle('ready', dist >= PTR_TRIGGER)
}

window.addEventListener(
  'touchstart',
  (e) => {
    ptrStartY = !ptrBusy && atTop() && e.touches.length === 1 ? e.touches[0].clientY : null
  },
  { passive: true },
)
window.addEventListener(
  'touchmove',
  (e) => {
    if (ptrStartY === null) return
    const dy = e.touches[0].clientY - ptrStartY
    if (dy <= 0 || !atTop()) {
      if (ptrDist) setPtr(0)
      return
    }
    e.preventDefault() // take over the gesture from native scroll/bounce
    setPtr(dy * 0.5) // resistance
  },
  { passive: false },
)
window.addEventListener('touchend', async () => {
  if (ptrStartY === null) return
  const trigger = ptrDist >= PTR_TRIGGER
  ptrStartY = null
  if (!trigger) return setPtr(0)
  ptrBusy = true
  ptr.classList.add('refreshing')
  setPtr(PTR_TRIGGER) // hold the badge in view while it spins
  ptrIcon.style.transform = '' // let the CSS spin animation drive it
  try {
    await runSync(false, true)
  } finally {
    ptr.classList.remove('refreshing')
    setPtr(0)
    ptrBusy = false
  }
})

// Debug tab. Always present in dev builds. In prod it's opt-in via a `?debug`
// URL param, made sticky in localStorage so it survives reloads and tab
// navigation on a phone — the point is to reach the sync / notification tools
// on the live site, where there's no dev server. Load `?debug=off` to hide it.
//
// Safe for prod: the destructive backend tools inside the tab only render in
// debug-backend mode, and those ops target the throwaway debug Sheet (never
// production). The prod-facing actions here are Pull/Push (idempotent), Send
// test push, Enable notifications, Import (local), and Wipe local (recoverable).
const DEBUG_TAB_KEY = 'eggo-show-debug'
function debugTabEnabled() {
  const param = new URLSearchParams(location.search).get('debug')
  if (param != null) {
    const on = param !== 'off' && param !== '0' && param !== 'false'
    localStorage.setItem(DEBUG_TAB_KEY, on ? 'true' : 'false')
  }
  return import.meta.env.DEV || localStorage.getItem(DEBUG_TAB_KEY) === 'true'
}

if (debugTabEnabled()) {
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
