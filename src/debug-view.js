// Dev-only Debug tab: seed/inspect/wipe local data from the phone, where
// there's no browser console. Excluded from production builds (loaded via
// a dynamic import guarded by import.meta.env.DEV in main.js).
import { seed, clearSeed, clearAll } from './seed.js'
import { getEntries, setEntries } from './storage.js'
import { parseImport } from './import.js'

export function renderDebug(view) {
  const entries = getEntries()
  const seeded = entries.filter((e) => e.seeded).length
  const unsynced = entries.filter((e) => !e.synced).length

  view.innerHTML = `
    <div class="stat-tiles">
      <div class="tile"><strong>${entries.length}</strong><span>entries</span></div>
      <div class="tile"><strong>${seeded}</strong><span>seeded</span></div>
      <div class="tile"><strong>${unsynced}</strong><span>unsynced</span></div>
    </div>
    <div class="debug-actions">
      <button type="button" class="debug-btn" id="d-seed">Seed 21 days of fake eggs</button>
      <button type="button" class="debug-btn" id="d-clear-seed">Remove seeded entries</button>
      <button type="button" class="debug-btn danger" id="d-wipe">Wipe ALL local data</button>
    </div>
    <div class="field-label">Import eggs</div>
    <textarea id="d-import-text" rows="7" spellcheck="false"
      placeholder="June 12&#10;Egg (brown) - 46g - Goldilocks&#10;Egg (olive) - 30g"></textarea>
    <button type="button" class="debug-btn" id="d-import">Import</button>
    <p class="debug-note" id="d-note"></p>
  `

  function rerender(message) {
    renderDebug(view)
    view.querySelector('#d-note').textContent = message
  }

  view.querySelector('#d-seed').addEventListener('click', () => {
    const added = seed(21)
    rerender(`Seeded ${added} fake eggs.`)
  })

  view.querySelector('#d-clear-seed').addEventListener('click', () => {
    const kept = clearSeed()
    rerender(`Seeded entries removed — ${kept} real entries kept.`)
  })

  view.querySelector('#d-import').addEventListener('click', () => {
    const text = view.querySelector('#d-import-text').value
    const { entries, errors } = parseImport(text)
    const note = view.querySelector('#d-note')
    if (errors.length) {
      // Keep the textarea so the user can fix the lines in place
      note.textContent = `Nothing imported:\n${errors.join('\n')}`
      return
    }
    if (entries.length === 0) {
      note.textContent = 'Nothing to import.'
      return
    }
    setEntries(
      [...getEntries(), ...entries].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      ),
    )
    rerender(`Imported ${entries.length} eggs.`)
  })

  // Two-tap wipe, same pattern as history delete.
  view.querySelector('#d-wipe').addEventListener('click', (e) => {
    const btn = e.currentTarget
    if (!btn.classList.contains('arm')) {
      btn.classList.add('arm')
      btn.textContent = 'Tap again to wipe everything'
      setTimeout(() => {
        btn.classList.remove('arm')
        btn.textContent = 'Wipe ALL local data'
      }, 3000)
      return
    }
    clearAll()
    rerender('All local entries wiped.')
  })
}
