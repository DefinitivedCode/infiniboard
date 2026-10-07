import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createProject } = require('../.verification/unit/src/data/types.js')
const { serializeProject, parseProjectFile, projectFilename } = require('../.verification/unit/src/data/projectFile.js')
const { replaceProject } = require('../.verification/unit/src/data/replaceProject.js')
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const { useGraph } = require('../.verification/unit/src/store/useGraph.js')

function fixture() {
  const p = createProject()
  p.title = 'Notes & connections'; p.updatedAt = 1700000000000
  const box = { x: -24.5, y: 48, width: 216, height: 192 }
  const items = [
    { id: 'text', type: 'text', ...box, text: 'Line one\nLine two — ?', fontSize: 20, minHeight: 80 },
    { id: 'sticky', type: 'sticky', ...box, text: 'A note', fontSize: 24, swatch: 'sage' },
    { id: 'rect', type: 'rect', ...box, swatch: 'none' }, { id: 'ellipse', type: 'ellipse', ...box, swatch: 'rose' },
    { id: 'line', type: 'line', ...box, start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
    { id: 'arrow', type: 'arrow', ...box, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    { id: 'pen', type: 'pen', ...box, points: [{ x: 0, y: 0 }, { x: .25, y: .75 }, { x: 1, y: 1 }] },
  ]
  p.board = { items: Object.fromEntries(items.map(i => [i.id, i])), order: items.map(i => i.id), viewport: { x: 241.25, y: -199.5, zoom: .65 } }
  p.graph = {
    nodes: { a: { id: 'a', x: -24, y: 48, width: 528, height: 360, title: 'Main idea', body: 'Details\nMore details' }, b: { id: 'b', x: 768, y: 192, width: 192, height: 120, title: 'Try it', body: '' } },
    nodeOrder: ['b', 'a'], edges: { edge: { id: 'edge', source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top', label: 'test with' } }, edgeOrder: ['edge'], viewport: { x: -200.5, y: 150, zoom: 1.5 },
  }
  p.settings = { theme: 'dark', snap: true }
  return p
}

test('JSON export/import round trips every Board type, Graph data, order, viewport, settings and metadata exactly', () => {
  const original = fixture()
  const contents = serializeProject(original)
  assert.equal(JSON.parse(contents).format, 'infiniboard')
  assert.equal(JSON.parse(contents).version, 2)
  const imported = parseProjectFile(contents)
  assert.deepEqual(imported, original)
  assert.notEqual(imported, original)
  assert.equal(serializeProject(imported), contents)
})

test('empty projects and optional edge/text properties round trip', () => {
  const empty = createProject()
  assert.deepEqual(parseProjectFile(serializeProject(empty)), empty)
  const p = fixture()
  delete p.graph.edges.edge.label; delete p.graph.edges.edge.sourceHandle; delete p.graph.edges.edge.targetHandle
  delete p.board.items.text.minHeight
  assert.deepEqual(parseProjectFile(serializeProject(p)), p)
})

test('malformed JSON, unrelated formats, and unsupported versions are rejected with plain messages', () => {
  assert.throws(() => parseProjectFile('{broken'), /not valid JSON/)
  assert.throws(() => parseProjectFile('null'), /invalid project file/)
  assert.throws(() => parseProjectFile('{"format":"something-else","version":2}'), /not an Infiniboard/)
  const file = JSON.parse(serializeProject(fixture()))
  file.version = 999
  assert.throws(() => parseProjectFile(JSON.stringify(file)), /version 999.*version 2/)
  file.version = '2'
  assert.throws(() => parseProjectFile(JSON.stringify(file)), /valid version number/)
})

test('bad structure and inconsistent references never change the live project or either history', () => {
  const previous = fixture()
  replaceProject(previous)
  useGraph.getState().select(['a'])
  useProject.getState().select(['text'])
  const beforeBoard = useProject.getState(); const beforeGraph = useGraph.getState()
  const invalidChanges = [
    p => { delete p.settings }, p => { p.settings.snap = 'yes' }, p => { p.version = 1 },
    p => { p.board.items.sticky.text = 4 }, p => { p.board.items.rect.swatch = 'blue' },
    p => { p.board.items.sticky.swatch = ['oat'] },
    p => { p.board.items.pen.points[0].x = -1 }, p => { p.board.viewport.zoom = 0 },
    p => { p.board.order.push('text') }, p => { p.board.order[0] = 'missing' },
    p => { p.board.items.text.id = 'wrong' }, p => { p.board.items.text.width = -1 },
    p => { p.graph.nodes.a.width = 9999 }, p => { p.graph.nodes.a.body = {} },
    p => { p.graph.edges.edge.target = 'missing' }, p => { p.graph.edges.edge.sourceHandle = 'invalid' },
    p => { p.graph.edges.edge.targetHandle = ['left'] },
    p => { p.graph.edgeOrder = [] }, p => { p.extra = 'unknown field' },
    p => { Object.defineProperty(p.graph.nodes, '__proto__', { value: { ...p.graph.nodes.a, id: '__proto__' }, enumerable: true }); p.graph.nodeOrder.push('__proto__') },
  ]
  for (const change of invalidChanges) {
    const p = fixture(); change(p)
    assert.throws(() => parseProjectFile(JSON.stringify({ format: 'infiniboard', version: 2, project: p })))
    assert.equal(useProject.getState(), beforeBoard)
    assert.equal(useGraph.getState(), beforeGraph)
  }
})

test('replacement clears stale histories, tools, selections and gestures while preserving imported values', () => {
  replaceProject(fixture())
  useProject.getState().updateItems([{ ...useProject.getState().project.board.items.text, text: 'Old edit' }])
  useGraph.getState().select(['a']); useGraph.getState().preset('S')
  useProject.getState().beginGesture(); useGraph.getState().beginGesture()
  const imported = parseProjectFile(serializeProject(fixture()))
  replaceProject(imported)
  assert.deepEqual(useProject.getState().project, fixture())
  for (const state of [useProject.getState(), useGraph.getState()]) {
    assert.deepEqual(state.past, []); assert.deepEqual(state.future, []); assert.equal(state.gesture, null); assert.equal(state.editing, null); assert.equal(state.tool, 'select')
  }
  assert.deepEqual(useProject.getState().selected, []); assert.deepEqual(useGraph.getState().selectedNodes, []); assert.deepEqual(useGraph.getState().selectedEdges, [])
  useProject.getState().undo(); useGraph.getState().undo()
  assert.equal(useProject.getState().project, imported)
})

test('filenames use a dated JSON name and distinguish the automatic backup', () => {
  const date = new Date(2026, 9, 7, 12)
  assert.equal(projectFilename(false, date), 'infiniboard-2026-10-07.json')
  assert.equal(projectFilename(true, date), 'infiniboard-2026-10-07-backup.json')
})
