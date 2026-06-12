import {
  APPS_SCRIPT_URL,
  COLORS,
  CHICKENS,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from './config.js'
import { saveEgg, deleteEgg, getEntries } from './storage.js'

const TENS = []
for (let t = Math.floor(WEIGHT_MIN / 10); t <= Math.floor(WEIGHT_MAX / 10); t++) {
  TENS.push(t)
}
const ONES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export function renderLog(view) {
  // Two-tap keyboard-free weight entry: a tens button (20s..70s) plus an
  // optional ones digit. Tens-only saves as a round weight (50s -> 50g).
  let tens = null
  let ones = null

  view.innerHTML = `
    <form id="egg-form" autocomplete="off">
      <div class="field-label weight-head">
        <span>Weight <span class="optional">(optional)</span></span>
        <span class="weight-readout">
          <span id="w-value">—</span><span class="unit">g</span>
          <button type="button" id="w-clear" class="w-clear hidden" aria-label="Clear weight">×</button>
        </span>
      </div>
      <div class="tens-row">
        ${TENS.map(
          (t) => `<button type="button" class="key" data-tens="${t}">${t}0s</button>`,
        ).join('')}
      </div>
      <div class="ones-row">
        ${ONES.map(
          (o) => `<button type="button" class="key" data-ones="${o}">${o}</button>`,
        ).join('')}
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
  const weightValue = view.querySelector('#w-value')
  const chickenSelect = view.querySelector('#chicken')
  const saveButton = view.querySelector('#save')
  const statusEl = view.querySelector('#status')
  const todayLine = view.querySelector('#today-line')
  const historyEl = view.querySelector('#history')

  // --- Weight picker ---
  const clearButton = view.querySelector('#w-clear')
  function updateWeight() {
    weightValue.textContent = tens === null ? '—' : String(tens * 10 + (ones ?? 0))
    weightValue.classList.toggle('placeholder', tens === null)
    clearButton.classList.toggle('hidden', tens === null && ones === null)
    view
      .querySelectorAll('[data-tens]')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.tens) === tens))
    view
      .querySelectorAll('[data-ones]')
      .forEach((b) =>
        b.classList.toggle('active', ones !== null && Number(b.dataset.ones) === ones),
      )
  }
  view.querySelectorAll('[data-tens]').forEach((btn) =>
    btn.addEventListener('click', () => {
      tens = Number(btn.dataset.tens)
      updateWeight()
    }),
  )
  view.querySelectorAll('[data-ones]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ones = Number(btn.dataset.ones)
      updateWeight()
    }),
  )
  clearButton.addEventListener('click', () => {
    tens = null
    ones = null
    updateWeight()
  })
  updateWeight()

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

  // --- Save + undo ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    // Weight is optional: no tens selected saves a weightless egg.
    const weight = tens === null ? null : tens * 10 + (ones ?? 0)

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

    const offlineNote = APPS_SCRIPT_URL && queued ? ' (offline — will sync later)' : ''
    showStatus(`Saved${weight === null ? '' : ` ${weight}g`}${offlineNote}`, entry.id)

    // Reset for the next egg: keep color (clutches often match), clear weight.
    tens = null
    ones = null
    updateWeight()
    fillChickenOptions()
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
          <span class="h-weight">${e.weight != null ? `${e.weight}g` : '—'}</span>
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
