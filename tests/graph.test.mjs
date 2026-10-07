import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createProject } = require('../.verification/unit/src/data/types.js')
const { migrateProject } = require('../.verification/unit/src/data/migration.js')
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const { useGraph } = require('../.verification/unit/src/store/useGraph.js')
const { PRESETS, clampNode, sizeStep, createNode } = require('../.verification/unit/src/graph/model.js')
const { createFlowAdapters } = require('../.verification/unit/src/graph/flowTypes.js')
const { graphFixture } = require('../.verification/unit/tests/fixtures/graph.js')
const { organizeGraph } = require('../.verification/unit/src/graph/organize.js')
const { chooseHandles } = require('../.verification/unit/src/graph/layout.js')
const { layoutProposal } = require('../.verification/unit/src/ai/layout.js')
const { serializeProject, parseProjectFile } = require('../.verification/unit/src/data/projectFile.js')
const graph = () => useProject.getState().project.graph
const state = () => useGraph.getState()
const node = (id, x = 0) => ({ id, title: id, body: '', x, y: 0, width: 288, height: 192 })
const connection = (source, target) => ({ source, target, sourceHandle: 'right', targetHandle: 'left' })
const reset = (project = createProject()) => {
  useProject.setState({ project, selected: [], past: [], future: [], gesture: null })
  useGraph.setState({ selectedNodes: [], selectedEdges: [], editing: null, past: [], future: [], gesture: null })
}

function noOverlap(nodes) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j]
    assert.equal(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y, false, `${a.id} overlaps ${b.id}`)
  }
}

test('Organize uses the same compact layout as generation, preserves every card/connection and is deterministic', () => {
  const project = createProject()
  const p = { nodes: Array.from({ length: 91 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${Math.floor((i - 1) / 4)}` : null, title: `Topic ${i}`, body: i % 3 ? 'Original details, kept verbatim.' : '', importance: (i % 4) + 1 })), links: [{ fromId: 'n7', toId: 'n23', label: 'Original relation' }], omitted: [] }
  for (const snap of [false, true]) {
    const generated = layoutProposal(p, { kind: 'build' }, project.graph, snap)
    const initial = { ...project.graph, nodes: Object.fromEntries(generated.nodes.map(n => [n.id, n])), nodeOrder: generated.nodes.map(n => n.id), edges: Object.fromEntries(generated.edges.map(e => [e.id, e])), edgeOrder: generated.edges.map(e => e.id) }
    const scattered = { ...initial, nodes: Object.fromEntries(generated.nodes.map((n, i) => [n.id, { ...n, x: 5000 - i * 23, y: -2000 + i * 13 }])) }
    const before = structuredClone(scattered), result = organizeGraph(scattered, snap)
    assert.deepEqual(result, initial, 'generation and organization share placement and handle geometry')
    assert.deepEqual(scattered, before)
    assert.equal(organizeGraph(result, snap), result, 'repeating Organization is a no-op')
    noOverlap(Object.values(result.nodes))
  }
})

test('Organize uses manually resized dimensions without fitting text or recreating IDs', () => {
  reset(); state().addNodes(Array.from({ length: 60 }, (_, i) => ({ ...node(`n${i}`), title: 'Same title', body: `Unedited body ${i}`, x: i * 41, y: -i * 19, width: 144 + (i % 6) * 100.5, height: 96 + (i % 5) * 91.5 })))
  for (let i = 1; i < 60; i++) state().connect(connection(`n${Math.floor((i - 1) / 4)}`, `n${i}`))
  const before = structuredClone(graph())
  for (const snap of [false, true]) {
    const result = organizeGraph(before, snap)
    noOverlap(Object.values(result.nodes))
    assert.deepEqual(result.nodeOrder, before.nodeOrder)
    assert.deepEqual(result.edgeOrder, before.edgeOrder)
    for (const id of before.nodeOrder) {
      assert.deepEqual({ ...result.nodes[id], x: before.nodes[id].x, y: before.nodes[id].y }, before.nodes[id], 'only node coordinates change')
      if (snap) { assert.equal(Math.abs(result.nodes[id].x % 24), 0); assert.equal(Math.abs(result.nodes[id].y % 24), 0) }
    }
    for (const id of before.edgeOrder) assert.deepEqual(result.edges[id], { ...before.edges[id], ...chooseHandles(result.nodes[before.edges[id].source], result.nodes[before.edges[id].target]) })
  }
})

test('Organize handles cycles, cross-links, disconnected groups and isolated nodes without dropping anything', () => {
  reset(); state().addNodes(['a', 'b', 'c', 'd', 'e', 'isolated'].map(id => node(id)))
  for (const [source, target] of [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'c'], ['d', 'e']]) state().connect(connection(source, target))
  const before = structuredClone(graph())
  for (const snap of [false, true]) {
    const result = organizeGraph(before, snap)
    noOverlap(Object.values(result.nodes))
    assert.deepEqual(result.nodeOrder, before.nodeOrder); assert.deepEqual(result.edgeOrder, before.edgeOrder)
    assert.deepEqual(organizeGraph(result, snap), result)
    for (const n of Object.values(result.nodes)) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y))
  }
  reset(); state().addNodes(Array.from({ length: 500 }, (_, i) => node(`isolated${i}`)))
  noOverlap(Object.values(organizeGraph(graph(), true).nodes))
})

test('Organize is one undo step, saves normally, preserves selections/Board, and manual edits stay authoritative', () => {
  reset(); state().addNodes([node('a', -900), node('b', 900), node('c', 1700)])
  state().connect(connection('a', 'b')); state().connect(connection('a', 'c'))
  state().select(['b'], [graph().edgeOrder[0]])
  const project = useProject.getState().project, before = graph(), past = state().past.length
  let projectWrites = 0
  const unsubscribe = useProject.subscribe((s, old) => { if (s.project !== old.project) projectWrites++ })
  const oldFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Organize must not call a server') }
  try { state().organize() } finally { globalThis.fetch = oldFetch; unsubscribe() }
  const organized = graph()
  assert.equal(projectWrites, 1, 'one project update uses the existing autosave subscription')
  assert.equal(state().past.length, past + 1)
  assert.equal(useProject.getState().project.board, project.board)
  assert.deepEqual(state().selectedNodes, ['b']); assert.deepEqual(state().selectedEdges, [before.edgeOrder[0]])
  assert.deepEqual(parseProjectFile(serializeProject(useProject.getState().project)).graph, organized)
  state().undo(); assert.deepEqual(graph(), before)
  state().redo(); assert.deepEqual(graph(), organized)
  const manual = { ...graph().nodes.b, x: 731, y: -287 }
  state().updateNodes([manual])
  state().updateNodes([{ ...graph().nodes.a, title: 'Later edit' }])
  state().setViewport({ x: 100, y: -100, zoom: .5 })
  assert.deepEqual(graph().nodes.b, manual, 'editing and viewport changes never organize silently')
})

test('Organize is harmless on an empty graph and does not create history for an unchanged arrangement', () => {
  reset(); const empty = graph(); state().organize()
  assert.equal(graph(), empty); assert.equal(state().past.length, 0)
  state().addNodes([{ ...node('a'), x: 400, y: 300 }]); state().organize()
  const organized = graph(), past = state().past.length
  state().organize()
  assert.equal(graph(), organized); assert.equal(state().past.length, past)
})

test('v1 migration retains Board content/settings/viewport and migrates graph arrays with handle defaults', () => {
  const old = { ...createProject(), version: 1, graph: { nodes: [node('a'), node('b', 300)], edges: [{ id: 'edge', source: 'a', target: 'b', label: 'relationship' }], viewport: { x: -12, y: 99, zoom: .75 } } }
  old.board.items.note = { id: 'note', type: 'sticky', x: -30, y: 10, width: 216, height: 400, minHeight: 192, text: 'Existing board content', fontSize: 20, swatch: 'sage' }
  old.board.order = ['note']
  const migrated = migrateProject(old)
  assert.equal(migrated.version, 2)
  assert.equal(migrated.board, old.board)
  assert.equal(migrated.settings, old.settings)
  assert.deepEqual(migrated.graph.nodeOrder, ['a', 'b'])
  assert.equal(migrated.graph.nodes.a, old.graph.nodes[0])
  assert.equal(migrated.graph.edges.edge.label, 'relationship')
  assert.equal(migrated.graph.edges.edge.sourceHandle, 'right')
  assert.equal(migrated.graph.edges.edge.targetHandle, 'left')
  assert.equal(migrated.graph.viewport, old.graph.viewport)
  assert.equal(Array.isArray(old.graph.nodes), true)
})

test('importance presets have deliberate type steps and arbitrary dimensions are clamped', () => {
  for (const [size, preset] of Object.entries(PRESETS)) assert.equal(sizeStep(preset.width, preset.height), size)
  assert.ok(PRESETS.XL.titleSize > PRESETS.L.titleSize && PRESETS.L.titleSize > PRESETS.M.titleSize)
  assert.deepEqual([clampNode({ ...node('a'), width: 0, height: -1 }).width, clampNode({ ...node('a'), width: 0, height: -1 }).height], [144, 96])
  assert.deepEqual([clampNode({ ...node('a'), width: 5000, height: 9000 }).width, clampNode({ ...node('a'), width: 5000, height: 9000 }).height], [768, 576])
  const created = createNode({ x: -37, y: 37 }, true)
  assert.equal(created.x, -48); assert.equal(created.y, 48)
})

test('a drag/resize groups repeated position and dimension changes into one undo action', () => {
  reset(); state().addNodes([node('a'), node('b', 300)])
  state().beginGesture()
  for (let i = 1; i <= 20; i++) state().applyNodeChanges([{ id: 'a', type: 'position', position: { x: i * 24, y: i * 24 }, dragging: true }, { id: 'a', type: 'dimensions', dimensions: { width: 288 + i * 12, height: 192 + i * 8 }, resizing: true }])
  state().endGesture()
  assert.equal(state().past.length, 2)
  state().undo(); assert.equal(graph().nodes.a.x, 0); assert.equal(graph().nodes.a.width, 288)
  state().redo(); assert.equal(graph().nodes.a.x, 480); assert.equal(graph().nodes.a.width, 528)
})

test('measurement and selection callbacks do not change the persisted graph or history', () => {
  reset(); state().addNodes([node('a')]); const before = graph()
  state().applyNodeChanges([{ id: 'a', type: 'dimensions', dimensions: { width: 287, height: 191 } }, { id: 'a', type: 'select', selected: false }])
  assert.equal(graph(), before); assert.equal(state().past.length, 1)
  assert.deepEqual(state().selectedNodes, [])
})

test('cancelled graph gestures restore dimensions/positions without affecting Board or viewport', () => {
  reset(); state().addNodes([node('a')]); const before = graph().nodes; const board = useProject.getState().project.board
  state().beginGesture(); state().updateNodes([{ ...graph().nodes.a, x: 99, height: 500 }], false)
  state().setViewport({ x: 200, y: -30, zoom: .5 }); state().endGesture(true)
  assert.equal(graph().nodes, before); assert.equal(graph().viewport.zoom, .5)
  assert.equal(useProject.getState().project.board, board); assert.equal(state().past.length, 1)
})

test('connect/reconnect rejects duplicates and self edges, preserves label/id, and undoes atomically', () => {
  reset(); state().addNodes([node('a'), node('b'), node('c')])
  state().connect(connection('a', 'b')); const id = graph().edgeOrder[0]
  state().connect(connection('a', 'b')); state().connect(connection('a', 'a'))
  assert.equal(graph().edgeOrder.length, 1)
  state().updateEdge({ ...graph().edges[id], label: 'because' })
  state().reconnect(id, connection('c', 'b'))
  assert.equal(graph().edges[id].source, 'c'); assert.equal(graph().edges[id].label, 'because')
  assert.equal(graph().edgeOrder[0], id)
  state().undo(); assert.equal(graph().edges[id].source, 'a')
  state().redo(); assert.equal(graph().edges[id].source, 'c')
})

test('node deletion removes incident edges as one action; duplicate maps internal connections', () => {
  reset(); state().addNodes([node('a'), node('b'), node('c')]); state().connect(connection('a', 'b')); state().connect(connection('b', 'c'))
  state().select(['a', 'b']); state().duplicateSelected()
  assert.equal(graph().nodeOrder.length, 5); assert.equal(graph().edgeOrder.length, 3)
  state().undo(); assert.equal(graph().nodeOrder.length, 3)
  state().select(['b']); state().deleteSelected()
  assert.equal(graph().nodeOrder.length, 2); assert.equal(graph().edgeOrder.length, 0)
  state().undo(); assert.equal(graph().nodeOrder.length, 3); assert.equal(graph().edgeOrder.length, 2)
})

test('Board and Graph retain independent selection, content, history, and viewports', () => {
  reset(); const board = useProject.getState()
  board.addItems([{ id: 'note', type: 'text', x: 0, y: 0, width: 240, height: 80, text: 'Board', fontSize: 20 }])
  board.setViewport({ x: 123, y: -99, zoom: 2 })
  state().addNodes([node('a')]); state().setViewport({ x: -12, y: 50, zoom: .75 }); state().preset('XL')
  state().undo()
  assert.equal(useProject.getState().project.board.items.note.text, 'Board')
  assert.deepEqual(useProject.getState().selected, ['note'])
  assert.deepEqual(state().selectedNodes, ['a'])
  assert.equal(useProject.getState().project.board.viewport.zoom, 2)
  assert.equal(graph().viewport.zoom, .75)
  useProject.getState().undo()
  assert.equal(useProject.getState().project.board.order.length, 0)
  assert.equal(graph().nodes.a.title, 'a')
})

test('500 nodes / 700 edges: adapters and immutable models isolate changes to the affected node', () => {
  reset(graphFixture()); const adapters = createFlowAdapters()
  const before = graph()
  const initialNodes = adapters.nodes(before.nodes, before.nodeOrder, [])
  const initialEdges = adapters.edges(before.edges, before.edgeOrder, [])
  for (let i = 0; i < 60; i++) state().setViewport({ x: i, y: -i, zoom: 1 + i / 100 })
  assert.equal(graph().nodes, before.nodes); assert.equal(graph().edges, before.edges)
  state().beginGesture()
  for (let i = 1; i <= 60; i++) state().updateNodes([{ ...graph().nodes.n250, x: i * 24 }], false)
  state().endGesture()
  const after = graph()
  const nextNodes = adapters.nodes(after.nodes, after.nodeOrder, [])
  const nextEdges = adapters.edges(after.edges, after.edgeOrder, [])
  assert.equal(nextNodes.length, 500); assert.equal(nextEdges.length, 700)
  initialNodes.forEach((item, i) => { if (i !== 250) assert.equal(nextNodes[i], item) })
  assert.equal(nextNodes[250].data, initialNodes[250].data)
  assert.equal(nextNodes[250].style, initialNodes[250].style)
  initialEdges.forEach((edge, i) => assert.equal(nextEdges[i], edge))
  assert.equal(state().past.length, 1)
})

test('graph history is bounded and fresh edits discard redo', () => {
  reset(); state().addNodes([node('a')])
  for (let i = 1; i < 140; i++) state().updateNodes([{ ...graph().nodes.a, title: `Edit ${i}` }])
  assert.equal(state().past.length, 100)
  state().undo(); assert.equal(state().future.length, 1)
  state().preset('XL'); assert.equal(state().future.length, 0)
})
