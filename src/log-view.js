import {
  APPS_SCRIPT_URL,
  COLORS,
  CHICKENS,
  CONDITIONS,
  HEALTHY,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from './config.js'
import { saveEgg, updateEgg, deleteEgg, getEntries, importEntries } from './storage.js'
import { eggSpan, eggCluster } from './egg-icon.js'
import { parseImport } from './import.js'
import {
  notifyNewEgg,
  notificationsState,
  enableNotifications,
  unsubscribeNotifications,
  resubscribeNotifications,
  sendTestNotification,
} from './push.js'

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

      <div class="save-row">
        <button type="submit" id="save">Save egg</button>
        <button type="button" id="cancel-edit" class="cancel-edit hidden">Cancel</button>
        <div class="cond-control">
          <button type="button" class="cond-btn" id="cond-btn"
                  aria-haspopup="menu" aria-expanded="false" aria-label="Egg condition">
            <span id="cond-emoji">${HEALTHY.emoji}</span><span class="cond-caret">▾</span>
          </button>
          <div class="cond-pop hidden" id="cond-pop" role="menu">
            <button type="button" class="cond-opt" data-cond="" role="menuitem">${HEALTHY.emoji} ${HEALTHY.label}</button>
            ${CONDITIONS.map(
              (c) => `<button type="button" class="cond-opt" data-cond="${c.id}" role="menuitem">${c.emoji} ${c.label}</button>`,
            ).join('')}
          </div>
        </div>
      </div>
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

    <section class="notify-panel" id="notify-panel" hidden></section>
  `

  const form = view.querySelector('#egg-form')
  const weightValue = view.querySelector('#w-value')
  const chickenRow = view.querySelector('#chicken-row')
  const condBtn = view.querySelector('#cond-btn')
  const condPop = view.querySelector('#cond-pop')
  const condEmoji = view.querySelector('#cond-emoji')
  const saveButton = view.querySelector('#save')
  const cancelButton = view.querySelector('#cancel-edit')
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

  // --- Condition picker: rare, so it hides behind a small emoji button that
  // opens a popup menu. Healthy (🥚, null) by default; picking a problem tints
  // the button so it stands out. ---
  let condition = null
  function closeCondPop() {
    condPop.classList.add('hidden')
    condBtn.setAttribute('aria-expanded', 'false')
  }
  function updateCondition() {
    const c = CONDITIONS.find((x) => x.id === condition)
    condEmoji.textContent = c ? c.emoji : HEALTHY.emoji
    condBtn.classList.toggle('flagged', condition !== null)
    condBtn.setAttribute(
      'aria-label',
      `Egg condition: ${c ? c.label : HEALTHY.label}`,
    )
    condPop
      .querySelectorAll('[data-cond]')
      .forEach((b) => b.classList.toggle('active', (b.dataset.cond || null) === condition))
  }
  condBtn.addEventListener('click', () => {
    const open = condPop.classList.toggle('hidden')
    condBtn.setAttribute('aria-expanded', String(!open))
  })
  condPop.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-cond]')
    if (!opt) return
    condition = opt.dataset.cond || null
    updateCondition()
    closeCondPop()
  })
  // Close the popup on an outside tap (cleaned up on view teardown via signal).
  document.addEventListener(
    'click',
    (e) => {
      if (!condPop.classList.contains('hidden') && !e.target.closest('.cond-control')) {
        closeCondPop()
      }
    },
    { signal },
  )
  updateCondition()

  // --- Edit mode: when editingId is set, the form edits an existing entry
  // (prefilled) instead of adding a new one. Reuses every picker above. ---
  let editingId = null
  function setFormFrom(entry) {
    // Color first (it drives which hens show), then chicken, weight, condition.
    form.elements.color.value = entry.color
    chicken = entry.chicken ?? null
    renderChickens()
    if (entry.weight == null) {
      tens = null
      ones = null
    } else {
      tens = Math.floor(entry.weight / 10)
      ones = entry.weight % 10
    }
    updateWeight()
    condition = entry.condition ?? null
    updateCondition()
  }
  function enterEdit(id) {
    const entry = getEntries().find((e) => e.id === id)
    if (!entry) return
    editingId = id
    setFormFrom(entry)
    saveButton.textContent = 'Update' // short: fits one line beside Cancel + condition at 320
    cancelButton.classList.remove('hidden')
    form.classList.add('editing')
    statusEl.classList.remove('visible')
    view.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function exitEdit() {
    editingId = null
    saveButton.textContent = 'Save egg'
    cancelButton.classList.add('hidden')
    form.classList.remove('editing')
  }
  function resetForm({ keepColor = true } = {}) {
    tens = null
    ones = null
    chicken = null
    condition = null
    if (!keepColor) form.elements.color.value = COLORS[0].id
    updateWeight()
    renderChickens()
    updateCondition()
  }
  cancelButton.addEventListener('click', () => {
    exitEdit()
    resetForm({ keepColor: false })
    showStatus('Edit cancelled')
  })

  // --- Save (or update) + undo ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    // Weight is optional: no tens selected saves a weightless egg.
    const weight = tens === null ? null : tens * 10 + (ones ?? 0)
    const color = form.elements.color.value

    // --- Edit: apply the change to the existing entry (no new egg, no notify). ---
    if (editingId) {
      updateEgg(editingId, { weight, color, chicken, condition })
      exitEdit()
      resetForm({ keepColor: false })
      showStatus('Updated')
      refreshHistory()
      return
    }

    let entry
    try {
      // Saves locally and returns instantly; the push happens in the background.
      ;({ entry } = saveEgg({
        timestamp: new Date().toISOString(),
        weight,
        color,
        chicken,
        condition,
      }))
    } catch (err) {
      showStatus(`Couldn't save: ${err.message}`)
      return
    }

    const offlineNote =
      APPS_SCRIPT_URL && !navigator.onLine ? ' (offline — will sync later)' : ''
    showStatus(`Saved${weight === null ? '' : ` ${weight}g`}${offlineNote}`, entry.id)

    // Best-effort: tell the other devices a new egg was logged. Live-save only —
    // imports/undo/sync never call this, so it can't fan out a flood.
    notifyNewEgg(entry)

    // Reset for the next egg: keep color (clutches often match), clear the rest.
    resetForm({ keepColor: true })
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
        <li${e.condition ? ' class="bad"' : ''}>
          <span class="swatch" style="--swatch:${swatchFor(e.color)}"></span>
          <span class="h-weight">${e.weight != null ? `${e.weight}g` : '—'}</span>
          <span class="h-meta">${e.condition ? `<span class="h-cond" role="button" tabindex="0" data-label="${conditionLabel(e.condition)}" title="${conditionLabel(e.condition)}" aria-label="${conditionLabel(e.condition)}">${conditionEmoji(e.condition)}</span> ` : ''}${e.chicken ?? ''}</span>
          <span class="h-time">${formatWhen(e.timestamp)}</span>
          <button type="button" class="h-edit" data-id="${e.id}" aria-label="Edit entry">✎</button>
          <button type="button" class="h-del" data-id="${e.id}" aria-label="Delete entry">×</button>
        </li>`,
      )
      .join('')
  }

  // A tapped condition emoji explains itself (titles don't work on touch).
  let condTipTimer
  function showCondTip(el) {
    document.querySelectorAll('.cond-tip').forEach((t) => t.remove())
    const tip = document.createElement('div')
    tip.className = 'cond-tip'
    tip.textContent = el.dataset.label
    document.body.appendChild(tip) // body, not the row: h-meta clips overflow
    const r = el.getBoundingClientRect()
    tip.style.left = `${r.left + r.width / 2}px`
    tip.style.top = `${r.top}px`
    clearTimeout(condTipTimer)
    condTipTimer = setTimeout(() => tip.remove(), 2200)
  }

  // Row actions: explain a condition emoji, edit (prefill the form), or two-tap
  // delete (arm, then confirm).
  historyEl.addEventListener('click', (e) => {
    const cond = e.target.closest('.h-cond')
    if (cond) return showCondTip(cond)

    const edit = e.target.closest('.h-edit')
    if (edit) return enterEdit(edit.dataset.id)

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
    // If deleting the row currently being edited, drop out of edit mode.
    if (editingId === btn.dataset.id) {
      exitEdit()
      resetForm({ keepColor: false })
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

  // --- Notifications opt-in: only meaningful on the installed PWA in a secure
  // context with OneSignal configured. iOS needs a user tap to prompt. ---
  const notifyPanel = view.querySelector('#notify-panel')
  function renderNotify() {
    const s = notificationsState()
    if (!s.supported) {
      notifyPanel.hidden = true // nothing we can do here; stay out of the way
      return
    }
    notifyPanel.hidden = false
    if (s.denied) {
      notifyPanel.innerHTML = `<p class="notify-hint">🔔 Notifications are blocked — turn them on for Eggo in your device settings.</p>`
      return
    }
    if (s.needsInstall) {
      notifyPanel.innerHTML = `<p class="notify-hint">🔔 Add Eggo to your home screen to get an alert when a new egg is logged.</p>`
      return
    }

    // Primary alerts button + a tools drawer (Test / Resubscribe / Unsubscribe)
    // revealed by a long-press — or a tap when alerts are already on. The drawer
    // is deliberately out of the way (bottom of the Log view) so the fast entry
    // path stays uncluttered; it's for the rare "push stopped working" reset.
    const on = s.enabled
    notifyPanel.innerHTML = `
      <button type="button" class="notify-btn" id="notify-main"
              aria-haspopup="true" aria-expanded="false">
        ${on ? '🔔 Egg alerts are on' : '🔔 Enable egg alerts'}<span class="notify-caret"> ▾</span>
      </button>
      <div class="notify-tools hidden" id="notify-tools">
        <button type="button" class="notify-tool" id="notify-test">Test this device</button>
        <button type="button" class="notify-tool" id="notify-resub">Resubscribe</button>
        <button type="button" class="notify-tool danger" id="notify-unsub">Unsubscribe</button>
      </div>
      <p class="notify-status" id="notify-status" role="status"></p>
    `

    const mainBtn = notifyPanel.querySelector('#notify-main')
    const tools = notifyPanel.querySelector('#notify-tools')
    const statusLine = notifyPanel.querySelector('#notify-status')
    const setStatus = (m) => {
      statusLine.textContent = m
    }
    const openTools = () => {
      tools.classList.remove('hidden')
      mainBtn.setAttribute('aria-expanded', 'true')
    }

    // Long-press (press & hold ~500ms) reveals the tools drawer. Suppress the
    // iOS text-callout so the hold doesn't pop a selection menu instead.
    let holdTimer = null
    let longFired = false
    mainBtn.addEventListener('contextmenu', (e) => e.preventDefault())
    mainBtn.addEventListener('pointerdown', () => {
      longFired = false
      holdTimer = setTimeout(() => {
        longFired = true
        openTools()
      }, 500)
    })
    const cancelHold = () => clearTimeout(holdTimer)
    mainBtn.addEventListener('pointerup', cancelHold)
    mainBtn.addEventListener('pointerleave', cancelHold)
    mainBtn.addEventListener('pointercancel', cancelHold)

    mainBtn.addEventListener('click', async () => {
      if (longFired) {
        longFired = false // the hold already opened the drawer; swallow the click
        return
      }
      if (on) {
        // Already on: a tap just toggles the tools drawer (nothing else to do).
        const open = tools.classList.toggle('hidden')
        mainBtn.setAttribute('aria-expanded', String(!open))
        return
      }
      mainBtn.disabled = true
      mainBtn.textContent = 'Enabling…'
      await enableNotifications()
      renderNotify()
    })

    // A tool button: disable during its async op, then report via the status line
    // (we don't re-render the panel, so the status message survives).
    const wireTool = (id, busy, run) => {
      notifyPanel.querySelector(id).addEventListener('click', async (e) => {
        e.currentTarget.disabled = true
        setStatus(busy)
        const msg = await run()
        e.currentTarget.disabled = false
        setStatus(msg)
      })
    }
    wireTool('#notify-test', 'Sending a test to this device…', async () => {
      const r = await sendTestNotification()
      if (r.ok) return 'Test sent — you should see a notification on this device.'
      if (r.reason === 'permission') return 'Enable alerts first, then test.'
      return "Couldn't show a test notification on this device."
    })
    wireTool('#notify-resub', 'Re-subscribing this device…', async () => {
      const ok = await resubscribeNotifications()
      return ok
        ? 'Re-subscribed. Try "Test this device", or log an egg on another device.'
        : 'Re-subscribe failed — check that alerts are allowed for Eggo.'
    })
    wireTool('#notify-unsub', 'Unsubscribing this device…', async () => {
      const ok = await unsubscribeNotifications()
      return ok
        ? 'Unsubscribed on this device. Press Resubscribe to turn it back on.'
        : 'Unsubscribe failed.'
    })
  }
  renderNotify()

  // A background sync that changed local data refreshes the history list only,
  // leaving any in-progress form entry untouched. The signal unbinds this when
  // the view is torn down (tab switch).
  window.addEventListener('eggo:historychanged', refreshHistory, { signal })
  // Drop any lingering condition tooltip when the view is torn down (tab switch).
  signal.addEventListener('abort', () =>
    document.querySelectorAll('.cond-tip').forEach((t) => t.remove()),
  )
}

function isToday(entry) {
  return new Date(entry.timestamp).toDateString() === new Date().toDateString()
}

function swatchFor(colorId) {
  return COLORS.find((c) => c.id === colorId)?.swatch ?? '#ccc'
}

function conditionLabel(id) {
  return CONDITIONS.find((c) => c.id === id)?.label ?? id
}

function conditionEmoji(id) {
  return CONDITIONS.find((c) => c.id === id)?.emoji ?? '⚠'
}

function formatWhen(timestamp) {
  const date = new Date(timestamp)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
