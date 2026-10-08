import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildRules, DEFAULT_OPTIONS } = require('../.verification/unit/src/ai/options.js')
const { compactContext, makeMode, defaultMode } = require('../.verification/unit/src/ai/context.js')
const { validateProposal, outputSchema } = require('../.verification/unit/src/ai/schema.js')
const { generateMap, generationMessage, estimateGeneration } = require('../.verification/unit/src/ai/client.js')
const { layoutProposal, restoreItems } = require('../.verification/unit/src/ai/layout.js')
const { toggleSubtree, checkedProposal, reparentProposal } = require('../.verification/unit/src/ai/preview.js')
const { createAssistantLibrary, BUILTIN_PRESETS } = require('../.verification/unit/src/ai/library.js')
const { createProject } = require('../.verification/unit/src/data/types.js')
const { serializeProject, parseProjectFile } = require('../.verification/unit/src/data/projectFile.js')
const { DEFAULT_SETTINGS } = require('../.verification/unit/src/ai/settings.js')
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const { useGraph } = require('../.verification/unit/src/store/useGraph.js')
const node = (id, parentId, confidence = 'high') => ({ id, parentId, title: id, body: null, importance: 2, reason: 'Related topic', confidence })
const proposal = () => ({ nodes: [node('new', 'old'), node('child', 'new')], links: [], omitted: [], alreadyInMap: [{ text: 'Covered', existingId: 'old' }] })
function graphFixture(count = 3) {
  const graph = createProject().graph
  for (let i = 0; i < count; i++) {
    const id = i === 0 ? 'old' : `e${i}`
    graph.nodes[id] = { id, title: id, body: 'Existing body '.repeat(30), x: (i % 20) * 500, y: Math.floor(i / 20) * 400, width: 288, height: 192 }
    graph.nodeOrder.push(id)
    if (i) {
      const parent = i === 1 ? 'old' : `e${i - 1}`, edgeId = `edge${i}`
      graph.edges[edgeId] = { id: edgeId, source: parent, target: id, sourceHandle: 'right', targetHandle: 'left', label: '' }
      graph.edgeOrder.push(edgeId)
    }
  }
  return graph
}
function noOverlap(nodes, existing) {
  for (let i = 0; i < nodes.length; i++) for (const b of [...existing, ...nodes.slice(i + 1)]) {
    const a = nodes[i]
    assert.ok(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), `${a.title} / ${b.title}`)
  }
}

test('every option value has a concrete rule and default maximum is 60', () => {
  const cases = {
    depth: { shallow: /at most 2 levels/, balanced: /3 to 4 levels/, deep: /5 or more levels/ },
    branching: { broad: /more direct children/, granular: /distinct nodes/ },
    detail: { titles: /body as null/, short: /at most 2 short sentences/, detailed: /at most 4 sentences/ },
    grouping: { topic: /shared subject/, chronological: /earliest to latest/, person: /named person/, custom: /instruction field/ },
    crossLinks: { true: /meaningful relationships/, false: /empty array/ },
    fixSpelling: { true: /Correct spelling/, false: /Do not correct typos/ },
    omitRepeatsAndOffTopic: { true: /exact original text/, false: /Do not omit or merge/ },
    allowNewBranches: { true: /Do not force a bad fit/, false: /one new branch titled Unsorted/ },
  }
  for (const [key, values] of Object.entries(cases)) for (let [value, pattern] of Object.entries(values)) {
    if (value === 'true' || value === 'false') value = value === 'true'
    const options = { ...DEFAULT_OPTIONS, [key]: value }, original = structuredClone(options)
    assert.match(buildRules(options, 'place').join('\n'), pattern)
    assert.deepEqual(options, original)
  }
  assert.equal(DEFAULT_OPTIONS.maxNodes, 60)
  assert.match(buildRules({ ...DEFAULT_OPTIONS, maxNodes: 7 }, 'build').join('\n'), /no more than 7 new nodes/)
  assert.ok(!buildRules(DEFAULT_OPTIONS, 'build').join('\n').includes('existing node'))
})

test('mode defaults, scoped context, titles-only fallback and estimates', () => {
  assert.equal(defaultMode(0, 0), 'build'); assert.equal(defaultMode(3, 1), 'expand'); assert.equal(defaultMode(3, 0), 'place')
  const graph = graphFixture(), before = structuredClone(graph)
  assert.equal(compactContext(graph, 'e1').length, 2)
  assert.equal(compactContext(graph)[2].depth, 2)
  assert.equal(compactContext(graph)[0].body.length, 160)
  assert.throws(() => makeMode('place', graph, undefined, 'branch'), /Select one/)
  const huge = graphFixture(1500), context = compactContext(huge)
  assert.equal(context.length, 1500)
  assert.ok(context.every(n => Object.keys(n).sort().join(',') === 'id,parentId,title'))
  assert.deepEqual(graph, before)
  const input = { text: 'notes', instruction: '', options: DEFAULT_OPTIONS, mode: makeMode('place', graph) }
  assert.equal(estimateGeneration(input, 'unknown').cost, null)
  assert.equal(estimateGeneration(input, 'gpt-6-luna').scopeCount, 3)
  assert.ok(estimateGeneration(input, 'gpt-6-luna').tokens > estimateGeneration({ ...input, mode: { kind: 'build' } }, 'gpt-6-luna').tokens)
})

test('mocked requests send no context for New tree, whole scope for Place and subtree for Under selected', async () => {
  const graph = graphFixture(), settings = { ...DEFAULT_SETTINGS, apiKey: crypto.randomUUID() }
  for (const kind of ['build', 'place', 'expand']) {
    const mode = makeMode(kind, graph, 'e1'), p = proposal()
    p.alreadyInMap = []; p.nodes[0].parentId = kind === 'build' ? null : kind === 'place' ? 'old' : 'e1'
    const input = { text: 'notes', instruction: '', options: DEFAULT_OPTIONS, mode }
    const result = await generateMap(input, settings, new AbortController().signal, () => {}, async (_, init) => {
      const message = JSON.parse(JSON.parse(init.body).input[1].content)
      if (kind === 'build') {
        assert.equal(message.existingGraph, undefined)
        assert.ok(!init.body.includes('Existing body'))
      } else assert.equal(message.existingGraph.length, kind === 'place' ? 3 : 2)
      assert.ok(!JSON.stringify(message).includes(settings.apiKey))
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(p) }] }] }))
    })
    assert.deepEqual(result, p)
  }
  const large = makeMode('place', graphFixture(1500))
  assert.ok(JSON.parse(generationMessage({ text: 'notes', instruction: '', options: DEFAULT_OPTIONS, mode: large })).existingGraph.every(n => !('body' in n)))
})

test('max nodes, existing parent ids, alreadyInMap, cycles and placement metadata are validated', () => {
  const mode = makeMode('place', graphFixture()), p = proposal()
  assert.deepEqual(validateProposal(p, mode, DEFAULT_OPTIONS), p)
  assert.throws(() => validateProposal(p, mode, { ...DEFAULT_OPTIONS, maxNodes: 1 }), /hard limit/)
  for (const change of [
    p => { p.nodes[0].parentId = 'bogus' }, p => { p.nodes[0].id = 'old' },
    p => { p.alreadyInMap[0].existingId = 'bogus' }, p => { p.nodes[0].parentId = 'child' },
    p => { p.nodes[0].reason = null }, p => { p.nodes[0].confidence = null },
  ]) { const invalid = proposal(); change(invalid); assert.throws(() => validateProposal(invalid, mode, DEFAULT_OPTIONS)) }
  const covered = { ...p, nodes: [] }
  assert.deepEqual(validateProposal(covered, mode, DEFAULT_OPTIONS), covered)
  const low = proposal(); low.nodes[0].confidence = 'low'
  assert.throws(() => validateProposal(low, mode, { ...DEFAULT_OPTIONS, allowNewBranches: false }), /Unsorted/)
  low.nodes[0].title = 'Unsorted'
  validateProposal(low, mode, { ...DEFAULT_OPTIONS, allowNewBranches: false })
  assert.ok(outputSchema.properties.nodes.items.required.includes('reason'))
  assert.deepEqual(outputSchema.properties.nodes.items.properties.reason.type, ['string', 'null'])
  const links = { ...p, links: [{ fromId: 'new', toId: 'child' }] }
  assert.throws(() => validateProposal(links, mode, { ...DEFAULT_OPTIONS, crossLinks: false }), /switched off/)
})

test('subtree check, reparent and 60 additions at multiple anchors on a 200-node graph preserve existing content', () => {
  const graph = graphFixture(200), before = structuredClone(graph), mode = makeMode('place', graph)
  const p = { nodes: Array.from({ length: 60 }, (_, i) => node(`n${i}`, i % 6 === 0 ? (i % 12 ? 'e80' : 'e40') : `n${i - 1}`)), links: [], omitted: [], alreadyInMap: [] }
  validateProposal(p, mode, DEFAULT_OPTIONS)
  const ids = new Set(graph.nodeOrder), checked = new Set(p.nodes.map(n => n.id))
  const unchecked = toggleSubtree(p, checked, 'n0', false)
  assert.equal(unchecked.size, 54)
  assert.equal(toggleSubtree(p, unchecked, 'n3', true).size, 60)
  const changed = reparentProposal(p, 'n6', 'e120', ids)
  assert.equal(changed.nodes[6].parentId, 'e120'); assert.equal(changed.nodes[7].parentId, 'n6')
  assert.throws(() => reparentProposal(p, 'n7', 'e120', ids), /top-level/)
  assert.throws(() => reparentProposal(p, 'n6', 'bogus', ids), /does not exist/)
  for (const snapping of [false, true]) {
    const additions = layoutProposal(changed, mode, graph, snapping)
    assert.equal(additions.nodes.length, 60)
    noOverlap(additions.nodes, Object.values(graph.nodes))
    if (snapping) for (const n of additions.nodes) { assert.equal(Math.abs(n.x % 24), 0); assert.equal(Math.abs(n.y % 24), 0) }
    const separate = layoutProposal(reparentProposal(changed, 'n6', null, ids), mode, graph, snapping)
    noOverlap(separate.nodes, Object.values(graph.nodes))
  }
  assert.deepEqual(graph, before)
  const project = createProject(); project.graph = graph
  useProject.getState().hydrate(project)
  const additions = layoutProposal(checkedProposal(changed, unchecked), mode, graph, true)
  useGraph.getState().addNodes(additions.nodes, additions.edges)
  assert.equal(useGraph.getState().past.length, 1)
  assert.equal(useProject.getState().project.graph.nodeOrder.length, 254)
  for (const id of graph.nodeOrder) assert.deepEqual(useProject.getState().project.graph.nodes[id], graph.nodes[id])
  useGraph.getState().undo(); assert.deepEqual(useProject.getState().project.graph, graph)
  assert.deepEqual(useProject.getState().project.board, project.board)
})

test('local library CRUD, built-in copies, last 10 history inputs, failures, concurrency and export exclusion', async () => {
  let disk
  const storage = { get: async () => structuredClone(disk), put: async record => { disk = structuredClone(record) } }
  const library = createAssistantLibrary(storage), builtin = structuredClone(BUILTIN_PRESETS)
  await assert.rejects(library.savePreset('Bad', DEFAULT_OPTIONS, '', BUILTIN_PRESETS[0].id), /editable copy/)
  await assert.rejects(library.renamePreset(BUILTIN_PRESETS[0].id, 'Bad'), /cannot/)
  await assert.rejects(library.deletePreset(BUILTIN_PRESETS[0].id), /cannot/)
  const copy = await library.savePreset('My meeting', BUILTIN_PRESETS[0].options, BUILTIN_PRESETS[0].instruction)
  await library.savePreset('Updated', { ...DEFAULT_OPTIONS, depth: 'deep' }, 'Keep dates', copy.id)
  await library.renamePreset(copy.id, 'Renamed')
  assert.equal((await createAssistantLibrary(storage).read()).presets[0].name, 'Renamed')
  const inputs = { text: 'Synthetic history notes', instruction: '', options: DEFAULT_OPTIONS, kind: 'place', scope: 'whole' }
  await Promise.all(Array.from({ length: 12 }, (_, i) => library.addGeneration({ timestamp: i, nodeCount: i, cost: null, inputs })))
  assert.equal((await library.read()).history.length, 10)
  assert.equal((await library.read()).history[0].nodeCount, 11)
  assert.deepEqual((await library.read()).history[0].inputs, inputs)
  assert.ok(!JSON.stringify(disk).includes('apiKey'))
  const project = createProject(); project.assistantLibrary = disk; project.settings.presets = disk.presets
  const exported = serializeProject(project)
  assert.ok(!exported.includes('Synthetic history notes')); assert.ok(!exported.includes('Renamed'))
  assert.deepEqual(parseProjectFile(exported).settings, { theme: 'light', snap: false })
  await library.deletePreset(copy.id); assert.equal((await library.read()).presets.length, 0)
  assert.deepEqual(BUILTIN_PRESETS, builtin)
  const failing = createAssistantLibrary({ get: async () => undefined, put: async () => { throw new Error('Unavailable') } })
  await assert.rejects(failing.savePreset('Test', DEFAULT_OPTIONS, ''), /Unavailable/)
  assert.equal((await failing.read()).presets.length, 0)
})

test('restored items retain checkbox identity when more items are restored or placement changes', () => {
  const p = proposal(), mode = makeMode('place', graphFixture())
  p.omitted = [{ text: 'first', reason: 'filler' }, { text: 'second', reason: 'repeat' }]
  const restored = restoreItems(p, new Set([1]), mode)
  const second = restored.nodes.find(n => n.body === 'second')
  const unchecked = toggleSubtree(restored, new Set(restored.nodes.map(n => n.id)), second.id, false)
  const more = restoreItems(p, new Set([0, 1]), mode)
  assert.equal(more.nodes.find(n => n.body === 'second').id, second.id)
  const placed = reparentProposal(more, 'new', 'e1', new Set(mode.context.map(n => n.id)))
  assert.equal(placed.nodes.find(n => n.body === 'second').id, second.id)
  assert.ok(!checkedProposal(restored, unchecked).nodes.some(n => n.id === second.id))
  const covered = { ...p, nodes: [] }
  const restoredCovered = restoreItems(covered, new Set([0]), mode)
  assert.equal(restoredCovered.nodes[0].parentId, 'old')
  noOverlap(layoutProposal(restoredCovered, mode, graphFixture(), true).nodes, Object.values(graphFixture().nodes))
})

test('mocked max-node violations reject twice with a visible limit message and no graph changes', async () => {
  const before = useProject.getState().project, p = proposal(), mode = makeMode('place', graphFixture())
  let calls = 0
  await assert.rejects(generateMap({ text: 'notes', instruction: '', options: { ...DEFAULT_OPTIONS, maxNodes: 1 }, mode }, { ...DEFAULT_SETTINGS, apiKey: crypto.randomUUID() }, new AbortController().signal, () => {}, async () => {
    calls++
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(p) }] }] }))
  }), /hard limit of 1 new nodes/)
  assert.equal(calls, 2); assert.equal(useProject.getState().project, before)
})

test('Place accepts real saved ids even if long or equal to the legacy attachment sentinel', () => {
  for (const id of ['SELECTED', 'saved-'.repeat(30)]) {
    const graph = graphFixture(1), old = graph.nodes.old
    graph.nodes = { [id]: { ...old, id } }; graph.nodeOrder = [id]
    const mode = makeMode('place', graph), p = proposal()
    p.nodes[0].parentId = id; p.alreadyInMap[0].existingId = id
    validateProposal(p, mode, DEFAULT_OPTIONS)
    const additions = layoutProposal(p, mode, graph, true)
    assert.equal(additions.edges[0].source, id)
    noOverlap(additions.nodes, Object.values(graph.nodes))
  }
})
