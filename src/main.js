import './style.css'
import { renderLog } from './log-view.js'
import { renderStats } from './stats-view.js'

if (import.meta.env.DEV) import('./seed.js')

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
const tabs = [...document.querySelectorAll('.tab')]
const views = { log: renderLog, stats: renderStats }

function show(name) {
  if (!views[name]) name = 'log'
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name))
  history.replaceState(null, '', name === 'log' ? '#' : `#${name}`)
  views[name](view)
}

tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)))
show(location.hash.replace('#', '') || 'log')
