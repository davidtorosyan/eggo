// End-to-end sync tests against the LIVE Apps Script / Sheet. Destructive: the
// Sheet is cleared before and after (its data is disposable — see CLAUDE.md).
// Drives the real storage + sync modules with an in-memory localStorage shim
// and Node's global fetch. Run with: npm run test:e2e
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Install the localStorage shim before the modules' functions are called.
// (storage.js touches localStorage only inside functions, never at load.)
globalThis.localStorage = (() => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  }
})()

const { getEntries, setEntries, getPendingDeletes, deleteEgg, setDebugBackend } =
  await import('../../src/storage.js')
const { pull, flush } = await import('../../src/sync.js')
const { DEBUG_APPS_SCRIPT_URL: endpoint } = await import('../../src/config.js')

const post = (body) =>
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })
const backendRows = () => fetch(endpoint).then((r) => r.json())
const clearBackend = () => post({ action: 'clear' })

const entry = (id, extra = {}) => ({
  id,
  synced: false,
  timestamp: `2026-06-13T10:0${id.slice(-1)}:00.000Z`,
  weight: 42,
  color: 'blue',
  chicken: null,
  ...extra,
})

test('sync engine round-trips against the live Sheet', async (t) => {
  assert.ok(endpoint, 'DEBUG_APPS_SCRIPT_URL must be configured')
  localStorage.clear()
  // After the clear, so the flag survives: route ALL sync at the debug backend.
  setDebugBackend(true)
  await clearBackend()

  await t.test('flush pushes unsynced local entries', async () => {
    setEntries([entry('e1', { chicken: 'Gimpy' }), entry('e2', { weight: null })])
    const ok = await flush()
    assert.equal(ok, true)
    assert.deepEqual((await backendRows()).map((r) => r.id).sort(), ['e1', 'e2'])
    assert.ok(getEntries().every((e) => e.synced))
  })

  await t.test('flush is idempotent — re-pushing makes no duplicates', async () => {
    // attempted:true => these go via the upsert path (already on the backend),
    // mirroring the debug "Mark unsynced" tool.
    setEntries(getEntries().map((e) => ({ ...e, synced: false, attempted: true })))
    await flush()
    assert.equal((await backendRows()).length, 2)
  })

  await t.test('pull adds a backend-only entry (phantom row)', async () => {
    await post({
      id: 'phantom',
      timestamp: '2026-06-13T11:00:00.000Z',
      weight: 55,
      color: 'olive',
      chicken: 'Toni',
    })
    const { added } = await pull()
    assert.equal(added, 1)
    assert.ok(getEntries().some((e) => e.id === 'phantom' && e.synced))
  })

  await t.test('deleting a synced entry propagates to the backend', async () => {
    deleteEgg('e1') // synced -> queues a tombstone + fires flush
    await flush() // join the in-flight flush, ensure the delete drained
    assert.ok(!(await backendRows()).some((r) => r.id === 'e1'))
    assert.deepEqual(getPendingDeletes(), [])
  })

  await t.test('pull prunes a synced entry deleted on the backend', async () => {
    await post({ action: 'delete', id: 'phantom' })
    const { removed } = await pull()
    assert.equal(removed, 1)
    assert.ok(!getEntries().some((e) => e.id === 'phantom'))
  })

  await clearBackend() // leave the Sheet clean
})
