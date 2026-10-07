import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { graphContext } = require('../.verification/unit/src/graph/context.js')
const { createProject } = require('../.verification/unit/src/data/types.js')

function fixture() {
  const project = createProject()
  project.title = 'Workshop plan'
  for (const [id, title, body, importance] of [['leaf-uuid', 'Materials', 'Paper\n\nPens', 1], ['root-uuid', 'Workshop', '', 4], ['other-uuid', 'Materials', 'Extra stock', 2], ['isolated-uuid', 'Later', '', 1]]) {
    project.graph.nodes[id] = { id, title, body, importance, x: 12345, y: -9876, width: 288, height: 192 }
    project.graph.nodeOrder.push(id)
  }
  for (const [id, source, target, label] of [['edge-a', 'root-uuid', 'leaf-uuid', 'prepare'], ['edge-b', 'root-uuid', 'other-uuid', ''], ['edge-cross', 'leaf-uuid', 'other-uuid', 'shared\nstock']]) {
    project.graph.edges[id] = { id, source, target, label, sourceHandle: 'right', targetHandle: 'left' }
    project.graph.edgeOrder.push(id)
  }
  return project
}
test('context includes every node, body, semantic size and directed labeled connection with root first', () => {
  const text = graphContext(fixture())
  assert.match(text, /^GRAPH\nWorkshop plan\n\nNODES\n\n\[N1\] Workshop\nImportance\/size: XL/)
  assert.match(text, /\[N2\] Materials\nImportance\/size: S\nBody:\n {2}Paper\n {2}\n {2}Pens/)
  assert.match(text, /\[N3\] Materials\nImportance\/size: M\nBody:\n {2}Extra stock/)
  assert.match(text, /\[N4\] Later/)
  assert.equal((text.match(/^\[N\d+\]/gm) ?? []).length, 4)
  assert.deepEqual(text.split('CONNECTIONS\n')[1].split('\n'), ['N1 -> N2 : prepare', 'N1 -> N3', 'N2 -> N3 : shared', '  stock'])
})
test('context is deterministic, does not mutate, and excludes UUIDs and canvas internals', () => {
  const project = fixture(), before = structuredClone(project), text = graphContext(project)
  assert.equal(graphContext(project), text)
  assert.deepEqual(project, before)
  for (const unwanted of ['uuid', '12345', '-9876', 'width', 'height', 'viewport', 'sourceHandle', 'right', 'updatedAt']) assert.ok(!text.includes(unwanted))
  project.graph.nodes['leaf-uuid'].x += 100
  assert.equal(graphContext(project), text)
})
test('context preserves cycles, cross-links and disconnected components exactly once', () => {
  const project = fixture()
  project.graph.edges.cycle = { id: 'cycle', source: 'other-uuid', target: 'root-uuid', label: 'returns to' }
  project.graph.edgeOrder.push('cycle')
  const text = graphContext(project)
  assert.equal((text.match(/^\[N\d+\]/gm) ?? []).length, 4)
  assert.equal((text.match(/^N\d+ -> N\d+/gm) ?? []).length, 4)
  assert.match(text, / : returns to/)
  assert.match(text, /Later/)
})
test('empty graph context is useful and body-free nodes do not invent content', () => {
  assert.equal(graphContext(createProject()), 'GRAPH\nUntitled project\n\nNODES\n(No nodes)\n\nCONNECTIONS\n(No connections)')
  const text = graphContext(fixture())
  assert.ok(!text.split('[N1]')[1].split('[N2]')[0].includes('Body:'))
})
