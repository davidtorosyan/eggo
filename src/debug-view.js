// Dev-only Debug tab: seed/inspect/wipe local data and exercise sync from the
// phone, where there's no browser console. Excluded from production builds
// (loaded via a dynamic import guarded by import.meta.env.DEV in main.js).
import { seed, clearSeed, clearAll } from './seed.js'
import {
  getEntries,
  setEntries,
  getPendingDeletes,
  setPendingDeletes,
  getLastPull,
  isDebugBackend,
  setDebugBackend,
  uid,
} from './storage.js'
import {
  pull,
  flush,
  remoteCount,
  clearRemote,
  upsertRemote,
  deleteRemoteById,
} from './sync.js'
import { parseImport } from './import.js'
import { CHICKENS } from './config.js'

export function renderDebug(view) {
  const entries = getEntries()
  const seeded = entries.filter((e) => e.seeded).length
  const unsynced = entries.filter((e) => !e.synced).length
  const pending = getPendingDeletes().length
  const debug = isDebugBackend()
  const lastPull = getLastPull()
  const lastPullText = lastPull
    ? new Date(lastPull).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '—'

  view.innerHTML = `
    <div class="stat-tiles">
      <div class="tile"><strong>${entries.length}</strong><span>entries</span></div>
      <div class="tile"><strong>${unsynced}</strong><span>unsynced</span></div>
      <div class="tile"><strong>${pending}</strong><span>pending del</span></div>
      <div class="tile"><strong id="d-backend">…</strong><span>backend</span></div>
      <div class="tile"><strong>${seeded}</strong><span>seeded</span></div>
      <div class="tile"><strong>${lastPullText}</strong><span>last pull</span></div>
    </div>

    <div class="field-label">Backend</div>
    <label class="backend-switch">
      <span class="bs-opt ${debug ? '' : 'active'}">PROD</span>
      <span class="bs-track ${debug ? 'on' : ''}"><span class="bs-knob"></span></span>
      <span class="bs-opt ${debug ? 'active' : ''}">DEBUG 🧪</span>
      <input type="checkbox" id="d-toggle-backend" ${debug ? 'checked' : ''} hidden />
    </label>

    <div class="field-label">Sync</div>
    <div class="debug-actions">
      <button type="button" class="debug-btn" id="d-pull">Pull</button>
      <button type="button" class="debug-btn" id="d-push">Push</button>
      <button type="button" class="debug-btn danger wide" id="d-clear-backend">Clear backend rows</button>
    </div>

    <div class="field-label">Simulate divergence</div>
    <div class="debug-actions">
      <button type="button" class="debug-btn" id="d-clear-local">Clear local</button>
      <button type="button" class="debug-btn" id="d-phantom">Phantom row</button>
      <button type="button" class="debug-btn" id="d-del-backend">Drop 1 on backend</button>
      <button type="button" class="debug-btn" id="d-unsync">Mark unsynced</button>
    </div>

    <div class="field-label">Local data</div>
    <div class="debug-actions">
      <button type="button" class="debug-btn" id="d-seed">Seed 21 days</button>
      <button type="button" class="debug-btn" id="d-clear-seed">Remove seeded</button>
      <button type="button" class="debug-btn danger wide" id="d-wipe">Wipe ALL local data</button>
    </div>

    <div class="field-label">Import</div>
    <textarea id="d-import-text" rows="4" spellcheck="false"
      placeholder="June 12&#10;Egg (brown) - 46g - Goldilocks&#10;Egg (olive) - 30g"></textarea>
    <button type="button" class="debug-btn wide" id="d-import">Import</button>
    <p class="debug-note" id="d-note"></p>
  `

  const note = view.querySelector('#d-note')
  function rerender(message) {
    renderDebug(view)
    if (message != null) view.querySelector('#d-note').textContent = message
  }
  const on = (id, fn) => view.querySelector(id).addEventListener('click', fn)

  // Backend row count fills in asynchronously (network).
  remoteCount().then(
    (n) => setBackend(String(n)),
    () => setBackend('?'),
  )
  function setBackend(text) {
    const el = view.querySelector('#d-backend')
    if (el) el.textContent = text
  }

  // --- Backend toggle: switch endpoint, then reload local from it so you see a
  // clean view of the selected backend (clears local — fine for a dev tool). ---
  view.querySelector('#d-toggle-backend').addEventListener('change', async () => {
    const toDebug = !isDebugBackend()
    setDebugBackend(toDebug)
    setEntries([])
    setPendingDeletes([])
    window.dispatchEvent(new Event('eggo:backendchanged')) // update the header badge
    note.textContent = `Switching to ${toDebug ? 'DEBUG' : 'PROD'}…`
    await pull()
    rerender(
      `Now on ${toDebug ? 'DEBUG 🧪' : 'PROD'} backend — local cleared and reloaded from it.`,
    )
  })

  // --- Sync ---
  on('#d-pull', async () => {
    note.textContent = 'Pulling…'
    const { added, removed, ok } = await pull()
    rerender(ok ? `Pulled: +${added} / −${removed}.` : 'Pull failed (offline?).')
  })
  on('#d-push', async () => {
    note.textContent = 'Pushing…'
    const ok = await flush()
    rerender(ok ? 'Pushed unsynced entries + deletes.' : 'Push incomplete (offline?).')
  })
  on('#d-clear-backend', (e) => {
    armOr(e.currentTarget, 'Tap again to clear backend', 'Clear backend rows', async () => {
      note.textContent = 'Clearing backend…'
      try {
        await clearRemote()
        rerender('Backend rows cleared.')
      } catch {
        rerender('Clear failed (offline?).')
      }
    })
  })

  // --- Simulate divergence (force local ≠ backend, then Pull/Push to resolve) ---
  on('#d-clear-local', () => {
    setEntries([])
    setPendingDeletes([])
    rerender('Local cleared (backend kept). Reload to test a new-device pull.')
  })
  on('#d-phantom', async () => {
    const hen = CHICKENS[Math.floor(Math.random() * CHICKENS.length)]
    note.textContent = 'Adding phantom…'
    try {
      await upsertRemote({
        id: uid(),
        timestamp: new Date().toISOString(),
        weight: 40 + Math.floor(Math.random() * 20),
        color: hen.color,
        chicken: hen.name,
      })
      rerender(`Phantom row added to backend (${hen.name}). Pull to see it appear.`)
    } catch {
      rerender('Add failed (offline?).')
    }
  })
  on('#d-del-backend', async () => {
    const synced = getEntries().find((e) => e.synced && !e.seeded)
    if (!synced) {
      note.textContent = 'No synced entry to delete on the backend.'
      return
    }
    note.textContent = 'Deleting on backend…'
    try {
      await deleteRemoteById(synced.id)
      rerender('Deleted one row on the backend only. Pull to see it pruned locally.')
    } catch {
      rerender('Delete failed (offline?).')
    }
  })
  on('#d-unsync', () => {
    setEntries(getEntries().map((e) => (e.seeded ? e : { ...e, synced: false })))
    rerender('Marked all (non-seeded) local entries unsynced. Push to re-upload.')
  })

  // --- Seed & import ---
  on('#d-seed', () => rerender(`Seeded ${seed(21)} fake eggs.`))
  on('#d-clear-seed', () =>
    rerender(`Seeded entries removed — ${clearSeed()} real entries kept.`),
  )
  on('#d-import', () => {
    const text = view.querySelector('#d-import-text').value
    const { entries: imported, errors } = parseImport(text)
    if (errors.length) {
      note.textContent = `Nothing imported:\n${errors.join('\n')}`
      return
    }
    if (imported.length === 0) {
      note.textContent = 'Nothing to import.'
      return
    }
    setEntries(
      [...getEntries(), ...imported].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      ),
    )
    rerender(`Imported ${imported.length} egg${imported.length === 1 ? '' : 's'}.`)
  })
  on('#d-wipe', (e) => {
    armOr(e.currentTarget, 'Tap again to wipe everything', 'Wipe ALL local data', () => {
      clearAll()
      rerender('All local entries wiped.')
    })
  })
}

// Two-tap confirm: first tap arms (and auto-disarms after 3s), second tap fires.
function armOr(btn, armText, restoreText, action) {
  if (!btn.classList.contains('arm')) {
    btn.classList.add('arm')
    btn.textContent = armText
    setTimeout(() => {
      btn.classList.remove('arm')
      btn.textContent = restoreText
    }, 3000)
    return
  }
  action()
}
