import {
  APPS_SCRIPT_URL,
  COLORS,
  CHICKENS,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from './config.js'
import { saveEgg, deleteEgg, getEntries } from './storage.js'

const LAST_WEIGHT_KEY = 'eggo-last-weight'

export function renderLog(view) {
  view.innerHTML = `
    <form id="egg-form" autocomplete="off">
      <label class="field-label" for="weight">Weight</label>
      <div class="weight-row">
        <button type="button" class="nudge" data-nudge="-1" aria-label="One gram less">−</button>
        <input id="weight" type="number" inputmode="decimal" step="0.1"
               min="${WEIGHT_MIN}" max="${WEIGHT_MAX}" placeholder="0" required />
        <span class="unit">g</span>
        <button type="button" class="nudge" data-nudge="1" aria-label="One gram more">+</button>
      </div>

      <label class="field-label">Color</label>
      <div class="color-row" role="radiogroup" aria-label="Egg color">
        ${COLORS.map(
          (c, i) => `
          <label class="color-chip">
            <input type="radio" name="color" value="${c.id}" ${i === 0 ? 'checked' : ''} />
            <span class="chip-body" style="--swatch:${c.swatch}">
              <span class="swatch"></span>${c.label}
            </span>
          </label>`,
        ).join('')}
      </div>

      <label class="field-label" for="chicken">Chicken <span class="optional">(optional)</span></label>
      <select id="chicken"></select>

      <button type="submit" id="save">Save egg</button>
    </form>

    <p id="status" role="status"></p>

    <section class="today">
      <h2 id="today-line"></h2>
      <ul id="history"></ul>
    </section>
  `

  const form = view.querySelector('#egg-form')
  const weightInput = view.querySelector('#weight')
  const chickenSelect = view.querySelector('#chicken')
  const saveButton = view.querySelector('#save')
  const statusEl = view.querySelector('#status')
  const todayLine = view.querySelector('#today-line')
  const historyEl = view.querySelector('#history')

  // --- Smart chicken picker: hens that lay the selected color come first ---
  function fillChickenOptions() {
    const color = form.elements.color.value
    const layers = CHICKENS.filter((c) => c.color === color)
    const others = CHICKENS.filter((c) => c.color !== color)
    chickenSelect.innerHTML = `
      <option value="">Not sure</option>
      ${layers.map((c) => `<option>${c.name}</option>`).join('')}
      <optgroup label="Other hens">
        ${others.map((c) => `<option>${c.name}</option>`).join('')}
      </optgroup>
    `
  }
  form.querySelectorAll('input[name="color"]').forEach((radio) =>
    radio.addEventListener('change', fillChickenOptions),
  )
  fillChickenOptions()

  // --- Weight nudges: ±1g; from empty, start at the last saved weight ---
  view.querySelectorAll('.nudge').forEach((btn) =>
    btn.addEventListener('click', () => {
      const current = parseFloat(weightInput.value)
      const base = Number.isFinite(current)
        ? current
        : Number(localStorage.getItem(LAST_WEIGHT_KEY)) || 50
      const next = base + Number(btn.dataset.nudge)
      weightInput.value = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(next * 10) / 10))
    }),
  )

  // --- Save + undo ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const weight = Number(weightInput.value)

    saveButton.disabled = true
    let entry, queued
    try {
      ;({ entry, queued } = await saveEgg({
        timestamp: new Date().toISOString(),
        weight,
        color: form.elements.color.value,
        chicken: chickenSelect.value || null,
      }))
    } catch (err) {
      showStatus(`Couldn't save: ${err.message}`)
      return
    } finally {
      saveButton.disabled = false
    }

    localStorage.setItem(LAST_WEIGHT_KEY, weight)
    const offlineNote = APPS_SCRIPT_URL && queued ? ' (offline — will sync later)' : ''
    showStatus(`Saved ${weight}g${offlineNote}`, entry.id)

    // Reset for the next egg: keep color (clutches often match), clear weight.
    weightInput.value = ''
    fillChickenOptions()
    weightInput.focus()
    refreshHistory()
  })

  let statusTimer
  function showStatus(message, undoId) {
    statusEl.innerHTML = undoId
      ? `${message} <button type="button" class="undo">Undo</button>`
      : message
    statusEl.classList.add('visible')
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => statusEl.classList.remove('visible'), undoId ? 6000 : 3000)
    statusEl.querySelector('.undo')?.addEventListener('click', () => {
      deleteEgg(undoId)
      refreshHistory()
      showStatus('Removed')
    })
  }

  // --- Today count + recent history ---
  function refreshHistory() {
    const entries = getEntries()
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    const todayCount = entries.filter(isToday).length
    todayLine.textContent =
      todayCount === 0
        ? 'No eggs yet today'
        : `${'🥚'.repeat(Math.min(todayCount, 8))} ${todayCount} today`

    historyEl.innerHTML = entries
      .slice(0, 12)
      .map(
        (e) => `
        <li>
          <span class="swatch" style="--swatch:${swatchFor(e.color)}"></span>
          <span class="h-weight">${e.weight}g</span>
          <span class="h-meta">${e.chicken ?? ''}</span>
          <span class="h-time">${formatWhen(e.timestamp)}</span>
          <button type="button" class="h-del" data-id="${e.id}" aria-label="Delete entry">×</button>
        </li>`,
      )
      .join('')
  }

  // Two-tap delete: first tap arms the button, second tap deletes.
  historyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.h-del')
    if (!btn) return
    if (!btn.classList.contains('arm')) {
      btn.classList.add('arm')
      btn.textContent = 'Sure?'
      setTimeout(() => {
        btn.classList.remove('arm')
        btn.textContent = '×'
      }, 2500)
      return
    }
    deleteEgg(btn.dataset.id)
    refreshHistory()
  })

  refreshHistory()
  weightInput.focus()
}

function isToday(entry) {
  return new Date(entry.timestamp).toDateString() === new Date().toDateString()
}

function swatchFor(colorId) {
  return COLORS.find((c) => c.id === colorId)?.swatch ?? '#ccc'
}

function formatWhen(timestamp) {
  const date = new Date(timestamp)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
