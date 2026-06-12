import './style.css'
import { COLORS, CHICKENS, WEIGHT_MIN, WEIGHT_MAX } from './config.js'
import { saveEgg, getQueue } from './storage.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="card">
    <h1><span class="egg">🥚</span> Eggo</h1>

    <form id="egg-form" autocomplete="off">
      <label class="field-label" for="weight">Weight</label>
      <div class="weight-row">
        <input id="weight" type="number" inputmode="decimal" step="0.1"
               min="${WEIGHT_MIN}" max="${WEIGHT_MAX}" placeholder="0"
               autofocus required />
        <span class="unit">g</span>
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
      <select id="chicken">
        <option value="">Not sure</option>
        ${CHICKENS.map((name) => `<option value="${name}">${name}</option>`).join('')}
      </select>

      <button type="submit" id="save">Save egg</button>
    </form>

    <p id="status" role="status"></p>
  </main>
`

const form = document.querySelector('#egg-form')
const weightInput = document.querySelector('#weight')
const chickenSelect = document.querySelector('#chicken')
const saveButton = document.querySelector('#save')
const status = document.querySelector('#status')

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const entry = {
    timestamp: new Date().toISOString(),
    weight: Number(weightInput.value),
    color: form.elements.color.value,
    chicken: chickenSelect.value || null,
  }

  saveButton.disabled = true
  const { queued } = await saveEgg(entry)
  saveButton.disabled = false

  showStatus(
    queued
      ? `Saved locally (${getQueue().length} queued — endpoint not set up yet)`
      : 'Egg saved! 🐔',
  )

  // Reset for the next egg: keep color (clutches often match), clear weight.
  weightInput.value = ''
  chickenSelect.value = ''
  weightInput.focus()
})

let statusTimer
function showStatus(message) {
  status.textContent = message
  status.classList.add('visible')
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => status.classList.remove('visible'), 3000)
}
