import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createAiSettingsStore } = require('../.verification/unit/src/ai/settingsStore.js')
const { DEFAULT_SETTINGS } = require('../.verification/unit/src/ai/settings.js')
const { createProject } = require('../.verification/unit/src/data/types.js')
const { graphContext } = require('../.verification/unit/src/graph/context.js')
const { serializeProject } = require('../.verification/unit/src/data/projectFile.js')
function storage(initial) {
  let record = initial
  return { get: async () => record && structuredClone(record), put: async value => { record = structuredClone(value) } }
}
test('session keys stay in memory, survive panel reopening, and disappear in a new page session', async () => {
  const disk = storage(), store = createAiSettingsStore(disk), apiKey = crypto.randomUUID()
  assert.equal((await store.read()).rememberKey, false)
  await store.save({ ...DEFAULT_SETTINGS, apiKey, model: 'custom-model' })
  assert.equal((await disk.get()).apiKey, '')
  assert.equal((await store.read()).apiKey, apiKey)
  const freshPage = await createAiSettingsStore(disk).read()
  assert.equal(freshPage.apiKey, '')
  assert.equal(freshPage.model, 'custom-model')
})
test('remembering is explicit and clearing removes both persisted and session credentials', async () => {
  const disk = storage(), store = createAiSettingsStore(disk), apiKey = crypto.randomUUID()
  await store.save({ ...DEFAULT_SETTINGS, apiKey, rememberKey: true })
  assert.equal((await createAiSettingsStore(disk).read()).apiKey, apiKey)
  await store.save({ ...DEFAULT_SETTINGS, apiKey: '', rememberKey: false })
  assert.equal((await disk.get()).apiKey, '')
  assert.equal((await store.read()).apiKey, '')
  assert.equal((await createAiSettingsStore(disk).read()).apiKey, '')
})
test('legacy credentials without consent are purged while model preferences survive', async () => {
  const disk = storage({ id: 'preferences', apiKey: crypto.randomUUID(), model: 'custom-model', effort: 'high' })
  const read = await createAiSettingsStore(disk).read()
  assert.deepEqual(read, { ...DEFAULT_SETTINGS, model: 'custom-model', effort: 'high' })
  assert.equal((await disk.get()).apiKey, '')
  assert.equal((await disk.get()).rememberKey, false)
})
test('a failed persistence write does not partially change session preferences', async () => {
  const store = createAiSettingsStore({ get: async () => undefined, put: async () => { throw new Error('storage unavailable') } })
  await assert.rejects(store.save({ ...DEFAULT_SETTINGS, apiKey: crypto.randomUUID(), rememberKey: true }), /storage unavailable/)
  assert.deepEqual(await store.read(), DEFAULT_SETTINGS)
})
test('separate browser storage adapters remain independent; project files and Context exclude keys', async () => {
  const profileA = createAiSettingsStore(storage()), profileB = createAiSettingsStore(storage())
  const apiKey = crypto.randomUUID()
  await profileA.save({ ...DEFAULT_SETTINGS, apiKey, rememberKey: true })
  assert.equal((await profileB.read()).apiKey, '')
  assert.ok(!serializeProject(createProject()).includes(apiKey))
  assert.ok(!graphContext(createProject()).includes(apiKey))
})
