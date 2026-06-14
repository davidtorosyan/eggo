import {
  APPS_SCRIPT_URL,
  COLORS,
  CHICKENS,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from './config.js'
import { saveEgg, deleteEgg, getEntries, importEntries } from './storage.js'
import { eggSpan, eggCluster } from './egg-icon.js'
import { parseImport } from './import.js'

const TENS = []
for (let t = Math.floor(WEIGHT_MIN / 10); t <= Math.floor(WEIGHT_MAX / 10); t++) {
  TENS.push(t)
}
const ONES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export function renderLog(view, signal) {
  // Two-tap keyboard-free weight entry: a tens button (20s..70s) plus an
  // optional ones digit. Tens-only saves as a round weight (50s -> 50g).
  let tens = null
  let ones = null

  view.innerHTML = `
    <form id="egg-form" autocomplete="off">
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

      <div class="field-label">Chicken <span class="optional">(optional — tap again to clear)</span></div>
      <div class="chicken-row" id="chicken-row"></div>

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

      <button type="submit" id="save">Save egg</button>
    </form>

    <p id="status" role="status"></p>

    <section class="today">
      <h2 id="today-line"></h2>
      <ul id="history"></ul>
    </section>

    <section class="import-panel">
      <button type="button" class="import-toggle" id="import-toggle" aria-expanded="false">
        Import eggs ▾
      </button>
      <div class="import-body hidden" id="import-body">
        <textarea class="import-text" id="import-text" rows="5" spellcheck="false"
          placeholder="June 12&#10;Egg (brown) - 46g - Goldilocks&#10;Egg (olive) - 30g"></textarea>
        <button type="button" class="import-go" id="import-go">Import</button>
        <p class="import-note" id="import-note" role="status"></p>
      </div>
    </section>
  `

  const form = view.querySelector('#egg-form')
  const weightValue = view.querySelector('#w-value')
  const chickenRow = view.querySelector('#chicken-row')
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
    view.querySelectorAll('[data-ones]').forEach((b) => {
      b.classList.toggle('active', ones !== null && Number(b.dataset.ones) === ones)
      // Digits only mean something once a tens range is picked
      b.disabled = tens === null
    })
  }
  view.querySelectorAll('[data-tens]').forEach((btn) =>
    btn.addEventListener('click', () => {
      tens = Number(btn.dataset.tens)
      updateWeight()
    }),
  )
  view.querySelectorAll('[data-ones]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (tens === null) return
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

  // --- Chicken picker: the hens that lay the selected color, as toggle
  // buttons. Tap to select, tap again to clear; color change resets any
  // cross-color selection. ---
  let chicken = null
  function renderChickens() {
    const color = form.elements.color.value
    const hens = CHICKENS.filter((c) => c.color === color)
    if (chicken !== null && !hens.some((c) => c.name === chicken)) chicken = null
    chickenRow.innerHTML = hens
      .map(
        (c) =>
          `<button type="button" class="key hen ${c.name === chicken ? 'active' : ''}"
                   data-hen="${c.name}">${c.name}</button>`,
      )
      .join('')
  }
  chickenRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hen]')
    if (!btn) return
    chicken = chicken === btn.dataset.hen ? null : btn.dataset.hen
    renderChickens()
  })
  form.querySelectorAll('input[name="color"]').forEach((radio) =>
    radio.addEventListener('change', renderChickens),
  )
  renderChickens()

  // --- Save + undo ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    // Weight is optional: no tens selected saves a weightless egg.
    const weight = tens === null ? null : tens * 10 + (ones ?? 0)

    let entry
    try {
      // Saves locally and returns instantly; the push happens in the background.
      ;({ entry } = saveEgg({
        timestamp: new Date().toISOString(),
        weight,
        color: form.elements.color.value,
        chicken,
      }))
    } catch (err) {
      showStatus(`Couldn't save: ${err.message}`)
      return
    }

    const offlineNote =
      APPS_SCRIPT_URL && !navigator.onLine ? ' (offline — will sync later)' : ''
    showStatus(`Saved${weight === null ? '' : ` ${weight}g`}${offlineNote}`, entry.id)

    // Reset for the next egg: keep color (clutches often match), clear weight.
    tens = null
    ones = null
    chicken = null
    updateWeight()
    renderChickens()
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

    const CAP = 8
    const todayEntries = entries.filter(isToday)
    const todayCount = todayEntries.length
    // One egg per egg in its real color (oldest→newest). Past the cap, the first
    // slot becomes a "many eggs" cluster (same width, so the line doesn't shift).
    const recent = todayEntries.slice(0, CAP).reverse()
    const eggs =
      todayCount > CAP
        ? eggCluster() + recent.slice(1).map((e) => eggSpan(swatchFor(e.color))).join('')
        : recent.map((e) => eggSpan(swatchFor(e.color))).join('')
    todayLine.innerHTML =
      todayCount === 0
        ? 'No eggs yet today'
        : `${eggs} <span class="today-n">${todayCount} today</span>`

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

  // --- Import: a collapsible textarea, same parser as the Debug tab ---
  const importToggle = view.querySelector('#import-toggle')
  const importBody = view.querySelector('#import-body')
  const importText = view.querySelector('#import-text')
  const importNote = view.querySelector('#import-note')

  importToggle.addEventListener('click', () => {
    const open = !importBody.classList.toggle('hidden')
    importToggle.setAttribute('aria-expanded', String(open))
    importToggle.textContent = open ? 'Import eggs ▴' : 'Import eggs ▾'
    if (open) importText.focus()
  })

  view.querySelector('#import-go').addEventListener('click', () => {
    const { entries: imported, errors } = parseImport(importText.value)
    if (errors.length) {
      importNote.textContent = `Nothing imported:\n${errors.join('\n')}`
      return
    }
    if (imported.length === 0) {
      importNote.textContent = 'Nothing to import.'
      return
    }
    importEntries(imported)
    importText.value = ''
    importNote.textContent = `Imported ${imported.length} egg${imported.length === 1 ? '' : 's'}.`
    refreshHistory()
  })

  refreshHistory()

  // A background sync that changed local data refreshes the history list only,
  // leaving any in-progress form entry untouched. The signal unbinds this when
  // the view is torn down (tab switch).
  window.addEventListener('eggo:historychanged', refreshHistory, { signal })
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
