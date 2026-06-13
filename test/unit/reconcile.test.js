// Pure unit tests for the sync reconcile() — the heart of cross-device merging.
// No network, no localStorage. Covers every case in the design matrix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcile } from '../../src/sync.js'

// remote entry (as doGet returns it) and local entry helpers.
const remote = (id, extra = {}) => ({
  id,
  timestamp: `t-${id}`,
  weight: null,
  color: 'brown',
  chicken: null,
  ...extra,
})
const local = (id, synced, extra = {}) => ({ ...remote(id), synced, ...extra })
const ids = (arr) => arr.map((e) => e.id).sort()

test('new device: empty local pulls all remote entries (synced)', () => {
  const { entries, added, removed, pendingDeletes } = reconcile(
    [],
    [remote('a'), remote('b')],
    [],
  )
  assert.deepEqual(ids(entries), ['a', 'b'])
  assert.ok(entries.every((e) => e.synced === true))
  assert.equal(added, 2)
  assert.equal(removed, 0)
  assert.deepEqual(pendingDeletes, [])
})

test('first push: unsynced local with empty remote is kept unsynced', () => {
  const { entries, added, removed } = reconcile(
    [local('a', false), local('b', false)],
    [],
    [],
  )
  assert.deepEqual(ids(entries), ['a', 'b'])
  assert.ok(entries.every((e) => e.synced === false))
  assert.equal(added, 0)
  assert.equal(removed, 0)
})

test('synced local present in remote is kept', () => {
  const { entries, removed } = reconcile([local('a', true)], [remote('a')], [])
  assert.deepEqual(ids(entries), ['a'])
  assert.equal(removed, 0)
})

test('synced local missing from remote is pruned (remote delete propagates)', () => {
  const { entries, removed } = reconcile([local('a', true)], [], [])
  assert.deepEqual(entries, [])
  assert.equal(removed, 1)
})

test('unsynced local that already exists in remote flips to synced', () => {
  const { entries } = reconcile([local('a', false)], [remote('a')], [])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].synced, true)
})

test('pending delete still in remote: excluded locally, kept in the queue', () => {
  const { entries, pendingDeletes } = reconcile([], [remote('a')], ['a'])
  assert.deepEqual(entries, [])
  assert.deepEqual(pendingDeletes, ['a'])
})

test('pending delete already gone from remote is dropped from the queue', () => {
  const { entries, pendingDeletes } = reconcile([], [], ['a'])
  assert.deepEqual(entries, [])
  assert.deepEqual(pendingDeletes, [])
})

test('seeded local entries are always kept, even when absent from remote', () => {
  const { entries, removed, added } = reconcile(
    [local('s', true, { seeded: true })],
    [],
    [],
  )
  assert.deepEqual(ids(entries), ['s'])
  assert.equal(removed, 0)
  assert.equal(added, 0)
})

test('mixed: keep / prune / push / flip / pull-in / seed all at once', () => {
  const loc = [
    local('keep', true), // in remote -> kept
    local('gone', true), // not in remote -> pruned
    local('new', false), // not in remote -> kept unsynced (to push)
    local('landed', false), // in remote -> flip to synced
    local('seed', true, { seeded: true }), // always kept
  ]
  const rem = [remote('keep'), remote('landed'), remote('pulled')]
  const { entries, added, removed, pendingDeletes } = reconcile(loc, rem, [])

  assert.deepEqual(ids(entries), ['keep', 'landed', 'new', 'pulled', 'seed'])
  assert.equal(added, 1) // pulled
  assert.equal(removed, 1) // gone
  assert.deepEqual(pendingDeletes, [])
  assert.equal(entries.find((e) => e.id === 'landed').synced, true)
  assert.equal(entries.find((e) => e.id === 'new').synced, false)
})
