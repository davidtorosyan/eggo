import './style.css'
import { renderLog } from './log-view.js'
import { renderStats } from './stats-view.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="card">
    <header class="top">
      <h1><span class="egg">🥚</span> Eggo</h1>
      <nav class="tabs">
        <button type="button" class="tab" data-tab="log">Log</button>
        <button type="button" class="tab" data-tab="stats">Stats</button>
      </nav>
    </header>
    <div id="view"></div>
  </main>
`

const view = document.querySelector('#view')
const nav = document.querySelector('.tabs')
const views = { log: renderLog, stats: renderStats }

function show(name) {
  if (!views[name]) name = 'log'
  document
    .querySelectorAll('.tab')
    .forEach((t) => t.classList.toggle('active', t.dataset.tab === name))
  history.replaceState(null, '', name === 'log' ? '#' : `#${name}`)
  views[name](view)
}

nav.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab')
  if (tab) show(tab.dataset.tab)
})

show(location.hash.replace('#', '') || 'log')

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
    if (location.hash === '#debug') show('debug')
  })
}
