import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { validateProposal } = require('../.verification/unit/src/ai/schema.js')
const { chooseHandles, layoutProposal, RADIAL_THRESHOLD, restoreItems } = require('../.verification/unit/src/ai/layout.js')
const { createProject } = require('../.verification/unit/src/data/types.js')
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const { useGraph } = require('../.verification/unit/src/store/useGraph.js')
const { generateMap, receiptFor } = require('../.verification/unit/src/ai/client.js')
const { DEFAULT_SETTINGS } = require('../.verification/unit/src/ai/settings.js')
const { SYSTEM_PROMPT } = require('../.verification/unit/src/ai/prompt.js')
const { serializeProject, parseProjectFile } = require('../.verification/unit/src/data/projectFile.js')
const { fitNodeContent, contentHeight } = require('../.verification/unit/src/graph/contentSize.js')
const { MAX_SIZE, MIN_SIZE, nodeSizeStep } = require('../.verification/unit/src/graph/model.js')
const options = { fixSpelling: true, omitRepeatsAndOffTopic: true }
const build = { kind: 'build' }
const node = (id, parentId, importance = 2) => ({ id, parentId, title: id, body: '', importance })
const sample = () => ({ nodes: [node('root', null, 4), node('a', 'root', 3), node('b', 'root', 3), node('detail', 'a')], links: [{ fromId: 'detail', toId: 'b', label: 'supports' }], omitted: [{ text: 'anyway', reason: 'filler' }, { text: 'same point again', reason: 'repeat' }] })
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
function noOverlap(nodes) { for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.equal(overlaps(nodes[i], nodes[j]), false, `${nodes[i].title} overlaps ${nodes[j].title}`) }

const roomNotes = 'Workshop participants meet in the hall to plan the activity. One table is reserved for quiet discussion and another for supplies. The hall is available on different days, so the organisers agreed on a fallback room and check bookings before each session. Everyone needs enough space to prepare materials without interrupting the neighbouring events. '
test('generated title-only and short cards are compact; substantial text gets room without changing importance', () => {
  const p = { nodes: [node('root', null, 4),
    { ...node('title', 'root'), title: 'Workshop routine and shared preparations' },
    { ...node('short', 'root'), title: 'Meeting room', body: 'Meet here during breaks.' },
    { ...node('long', 'root'), title: 'Workshop room arrangements', body: roomNotes.repeat(2) },
  ], omitted: [] }
  const result = layoutProposal(p, build, createProject().graph, true)
  const byTitle = new Map(result.nodes.map(n => [n.title, n]))
  const root = byTitle.get('root'), title = byTitle.get(p.nodes[1].title), short = byTitle.get(p.nodes[2].title), long = byTitle.get(p.nodes[3].title)
  assert.equal(nodeSizeStep(root), 'XL')
  for (const n of [title, short, long]) assert.equal(nodeSizeStep(n), 'M')
  assert.ok(title.height < 192 && short.height < 192)
  assert.ok(long.width > title.width && long.height > title.height)
  assert.ok(long.width >= long.height, 'body does not become a narrow column')
  for (const n of result.nodes) {
    assert.ok(n.width >= MIN_SIZE.width && n.width <= MAX_SIZE.width)
    assert.ok(n.height >= MIN_SIZE.height && n.height <= MAX_SIZE.height)
    assert.ok(contentHeight(n.title, n.body, n.width, nodeSizeStep(n)) <= n.height, 'all ordinary text fits')
  }
  noOverlap(result.nodes)
})

test('content fit handles wrapping, line breaks and long words, and scrolls only at the size cap', () => {
  const measure = (text, kind) => Array.from(text).length * (kind === 'title' ? 14 : 8)
  for (const body of [roomNotes, 'First line\nSecond line\n\nFourth line', 'unbroken'.repeat(30), '文字とメモ'.repeat(40)]) {
    const size = fitNodeContent('Notes', body, 'M', measure)
    assert.ok(contentHeight('Notes', body, size.width, 'M', measure) <= size.height)
  }
  const body = roomNotes.repeat(100)
  const size = fitNodeContent('Long archive', body, 'XL', measure)
  assert.deepEqual(size, MAX_SIZE)
  assert.ok(contentHeight('Long archive', body, size.width, 'XL', measure) > size.height)
  const wideTitle = fitNodeContent('An unnecessarily long title that needs several lines', '', 'S', measure)
  assert.ok(wideTitle.width <= 384, 'long title wraps rather than making a single-line banner')
})

test('manual generated-node resizing survives text edits, measurement, history and JSON round trips', () => {
  const project = createProject(), additions = layoutProposal(sample(), build, project.graph, true)
  useProject.getState().hydrate(project)
  useGraph.getState().addNodes(additions.nodes, additions.edges)
  const id = additions.nodes[1].id
  useGraph.getState().beginGesture()
  useGraph.getState().applyNodeChanges([{ id, type: 'dimensions', dimensions: { width: 612, height: 348 }, resizing: true }])
  useGraph.getState().endGesture()
  const resized = useProject.getState().project.graph.nodes[id]
  assert.equal(nodeSizeStep(resized), 'L', 'manual size does not erase semantic importance')
  useGraph.getState().updateNodes([{ ...resized, body: roomNotes.repeat(3) }])
  useGraph.getState().applyNodeChanges([{ id, type: 'dimensions', dimensions: { width: 384, height: 264 } }])
  const saved = useProject.getState().project
  assert.equal(saved.graph.nodes[id].width, 612)
  assert.equal(saved.graph.nodes[id].height, 348)
  assert.deepEqual(parseProjectFile(serializeProject(saved)), saved)
  useGraph.getState().undo()
  assert.deepEqual(useProject.getState().project.graph.nodes[id], resized)
  useGraph.getState().undo()
  assert.deepEqual(useProject.getState().project.graph.nodes[id], additions.nodes[1])
  useGraph.getState().redo(); useGraph.getState().redo()
  assert.deepEqual(useProject.getState().project.graph, saved.graph)
  useProject.getState().hydrate(parseProjectFile(serializeProject(saved)))
  assert.deepEqual(useProject.getState().project.graph, saved.graph)
})

test('explicit presets refit text and change semantic importance as one undoable edit', () => {
  useProject.getState().hydrate(createProject())
  const n = { id: 'preset', title: 'Workshop room arrangements', body: roomNotes.repeat(2), x: 0, y: 0, width: 600, height: 300, importance: 2 }
  useGraph.getState().addNodes([n])
  useGraph.getState().preset('S')
  const small = useProject.getState().project.graph.nodes[n.id]
  assert.equal(nodeSizeStep(small), 'S')
  assert.ok(contentHeight(small.title, small.body, small.width, 'S') <= small.height)
  assert.notDeepEqual([small.width, small.height], [192, 120], 'preset fits its actual content')
  useGraph.getState().undo()
  assert.deepEqual(useProject.getState().project.graph.nodes[n.id], n)
  useGraph.getState().redo()
  assert.deepEqual(useProject.getState().project.graph.nodes[n.id], small)
})

test('mixed-content radial layouts avoid overlap and pick handles from fitted dimensions', () => {
  const p = tree60()
  p.nodes.forEach((n, i) => { n.body = i % 3 ? roomNotes.repeat(i % 3) : ''; n.title = `Topic ${i}` })
  for (const grid of [false, true]) {
    const result = layoutProposal(p, build, createProject().graph, grid), nodes = new Map(result.nodes.map(n => [n.id, n]))
    noOverlap(result.nodes)
    for (const e of result.edges) assert.deepEqual({ sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }, chooseHandles(nodes.get(e.source), nodes.get(e.target)))
    if (grid) for (const n of result.nodes) { assert.equal(Math.abs(n.x % 24), 0); assert.equal(Math.abs(n.y % 24), 0) }
  }
})

test('project files reject invalid importance but preserve legacy explicit dimensions', () => {
  const project = createProject()
  project.graph.nodes.legacy = { id: 'legacy', title: 'Legacy card', body: roomNotes, x: 0, y: 0, width: 401, height: 299 }
  project.graph.nodeOrder = ['legacy']
  assert.deepEqual(parseProjectFile(serializeProject(project)), project)
  for (const importance of [0, 5, 1.5, '2', null]) {
    project.graph.nodes.legacy.importance = importance
    assert.throws(() => parseProjectFile(serializeProject(project)))
  }
})

test('hierarchy instructions prioritise semantic outlines without enforcing a root-child limit', () => {
  const prompt = SYSTEM_PROMPT.replace(/\s+/gu, ' ')
  for (const rule of ['major topic -> subtopic -> specific fact/event/question', 'Semantic hierarchy wins over source formatting and visual balance', 'Section headings are clues, NOT automatic root children', 'roughly 3-8 major children', 'guidance, not a numeric limit', 'Never create root-level siblings merely to balance', 'Relationships, shared subjects, causality and chronology', 'preserve genuinely distinct major topics', 'Venue arrangements']) assert.ok(prompt.includes(rule), rule)
  // Guidance must not become a validator cap or silently drop genuinely distinct topics.
  const p = { nodes: [node('root', null), ...Array.from({ length: 10 }, (_, i) => node(`topic${i}`, 'root'))], omitted: [] }
  assert.deepEqual(validateProposal(p, build, options), p)
})

test('AI schema accepts build and selected-node expansion, optional text, and cross-branch links', () => {
  assert.deepEqual(validateProposal(sample(), build, options), sample())
  const expanded = sample(); expanded.nodes[0].parentId = 'SELECTED'
  assert.deepEqual(validateProposal(expanded, { kind: 'expand', selectedId: 'existing', title: 'Existing', body: '' }, options), expanded)
  const p = { nodes: [node('a', 'SELECTED'), node('b', 'a')], omitted: [] }
  delete p.nodes[0].body
  assert.equal(validateProposal(p, { kind: 'expand', selectedId: 'existing', title: 'Existing', body: '' }, options).nodes.length, 2)
})
test('AI schema rejects cycles, dangling parents, duplicate IDs, multiple roots, and invalid omissions', () => {
  const changes = [p => p.nodes.push(node('second', null)), p => p.nodes.push(node('a', 'root')), p => { p.nodes[1].parentId = 'absent' }, p => { p.nodes[1].parentId = 'detail' }, p => { p.nodes[0].parentId = 'SELECTED' }, p => p.links.push({ fromId: 'root', toId: 'missing' }), p => { p.nodes[0].title = 'one two three four five six seven eight nine' }]
  for (const change of changes) { const p = sample(); change(p); assert.throws(() => validateProposal(p, build, options)) }
  assert.throws(() => validateProposal(sample(), build, { ...options, omitRepeatsAndOffTopic: false }), /switched off/)
  assert.throws(() => validateProposal(sample(), build, options, 'different original text'), /original text/)
  assert.throws(() => validateProposal(sample(), { kind: 'expand', selectedId: 'x', title: '', body: '' }, options), /attach/)
})

test('AI validation silently drops parent/child and ancestor links in both directions', () => {
  for (const mode of [build, { kind: 'expand', selectedId: 'existing', title: 'Existing', body: '' }]) {
    const p = sample()
    if (mode.kind === 'expand') p.nodes[0].parentId = 'SELECTED'
    p.links.push(...[
      { fromId: 'root', toId: 'a' }, { fromId: 'a', toId: 'root' },
      { fromId: 'root', toId: 'detail' }, { fromId: 'detail', toId: 'root' },
      { fromId: 'a', toId: 'detail' }, { fromId: 'detail', toId: 'a' },
    ])
    const original = structuredClone(p)
    const cleaned = validateProposal(p, mode, options)
    assert.deepEqual(cleaned.links, sample().links)
    assert.deepEqual(cleaned.nodes, p.nodes)
    assert.deepEqual(p, original)
  }
})
test('variable-size 60-node tree has no overlaps at either grid setting and uses XL root', () => {
  const p = { nodes: Array.from({ length: 60 }, (_, i) => node(`n${i}`, i ? `n${Math.floor((i - 1) / 4)}` : null, (i % 4) + 1)), links: [], omitted: [] }
  validateProposal(p, build, options)
  for (const grid of [false, true]) {
    const result = layoutProposal(p, build, createProject().graph, grid)
    noOverlap(result.nodes)
    assert.equal(result.nodes[0].width, 528)
    assert.equal(result.edges.length, 59)
    if (grid) for (const n of result.nodes) { assert.equal(Math.abs(n.x % 24), 0); assert.equal(Math.abs(n.y % 24), 0) }
  }
})

const center = n => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })
const tree60 = () => ({ nodes: Array.from({ length: 60 }, (_, i) => node(`n${i}`, i ? `n${Math.floor((i - 1) / 4)}` : null, (i % 4) + 1)), links: [], omitted: [] })

test('60-node radial map has subtree-weighted sectors and outward, overlap-free descendants', () => {
  const p = tree60(), graph = createProject().graph
  graph.nodes.old = { id: 'old', title: 'Old', body: '', x: -300, y: 180, width: 768, height: 576 }
  graph.nodeOrder = ['old']
  const original = structuredClone(graph)
  const kids = id => p.nodes.filter(n => n.parentId === id)
  const weight = id => 1 + kids(id).reduce((sum, n) => sum + weight(n.id), 0)
  for (const grid of [false, true]) {
    const result = layoutProposal(p, build, graph, grid), byTitle = new Map(result.nodes.map(n => [n.title, n]))
    const origin = center(byTitle.get('n0')), vector = id => {
      const c = center(byTitle.get(id)); return { x: c.x - origin.x, y: c.y - origin.y }
    }
    noOverlap([...Object.values(graph.nodes), ...result.nodes])
    assert.deepEqual(graph, original)
    const main = kids('n0'), total = weight('n0') - 1
    let angle = -Math.PI
    for (const n of main) {
      const sector = 2 * Math.PI * weight(n.id) / total, v = vector(n.id)
      if (!grid) assert.ok(Math.abs(Math.atan2(v.y, v.x) - angle - sector / 2) < 1e-9)
      angle += sector
    }
    const quadrants = new Set(p.nodes.slice(1).map(n => { const v = vector(n.id); return `${Math.sign(v.x)},${Math.sign(v.y)}` }))
    for (const quadrant of ['-1,-1', '1,-1', '1,1', '-1,1']) assert.ok(quadrants.has(quadrant))
    for (const n of p.nodes.filter(n => n.parentId && n.parentId !== 'n0')) {
      const v = vector(n.id), parent = vector(n.parentId)
      assert.ok(Math.hypot(v.x, v.y) > Math.hypot(parent.x, parent.y))
      assert.ok((v.x - parent.x) * parent.x + (v.y - parent.y) * parent.y > 0, 'child continues outward from parent')
    }
    if (grid) for (const n of result.nodes) { assert.equal(Math.abs(n.x % 24), 0); assert.equal(Math.abs(n.y % 24), 0) }
  }
})

test('build maps below 8 nodes split to both sides; 8 nodes radiate close to the root', () => {
  assert.equal(RADIAL_THRESHOLD, 8)
  for (const count of [7, 8]) {
    const p = { nodes: [node('root', null), ...Array.from({ length: count - 1 }, (_, i) => node(`child${i}`, 'root', 1))], omitted: [] }
    const result = layoutProposal(p, build, createProject().graph, false), origin = center(result.nodes[0])
    noOverlap(result.nodes)
    const offsets = result.nodes.slice(1).map(n => { const c = center(n); return { x: c.x - origin.x, y: c.y - origin.y } })
    assert.ok(offsets.some(v => v.x < 0) && offsets.some(v => v.x > 0))
    if (count === 7) assert.ok(offsets.every(v => Math.abs(v.x) > Math.abs(v.y)))
    else {
      const radii = offsets.map(v => Math.hypot(v.x, v.y))
      assert.ok(Math.max(...radii) < 800)
      assert.ok(offsets.some(v => Math.abs(v.y) > Math.abs(v.x)))
    }
  }
})

test('60-node expansions fan away from their existing parent and clear obstacles in every direction', () => {
  for (const grid of [false, true]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const graph = createProject().graph
    const selected = { id: 'selected', title: 'Selected', body: '', x: 0, y: 0, width: 288, height: 192 }
    const parent = { ...selected, id: 'parent', title: 'Parent', x: -dx * 1500, y: -dy * 1500 }
    const blocker = { ...selected, id: 'blocker', title: 'Blocker', x: center(selected).x + dx * 900 - 384, y: center(selected).y + dy * 900 - 288, width: 768, height: 576 }
    graph.nodes = { selected, parent, blocker }; graph.nodeOrder = ['parent', 'selected', 'blocker']
    graph.edges.incoming = { id: 'incoming', source: 'parent', target: 'selected', sourceHandle: 'right', targetHandle: 'left', label: '' }
    graph.edgeOrder = ['incoming']
    const original = structuredClone(graph), p = tree60()
    // Four main branches attach directly to the existing selected node.
    p.nodes.shift()
    p.nodes.forEach(n => { if (n.parentId === 'n0') n.parentId = 'SELECTED' })
    p.nodes.push(node('extra', 'n1', 4))
    const mode = { kind: 'expand', selectedId: 'selected', title: selected.title, body: '' }
    const result = layoutProposal(validateProposal(p, mode, options), mode, graph, grid), origin = center(selected)
    assert.equal(result.nodes.length, 60)
    noOverlap([...Object.values(graph.nodes), ...result.nodes])
    assert.deepEqual(graph, original)
    for (const n of result.nodes) {
      const c = center(n), outward = (c.x - origin.x) * dx + (c.y - origin.y) * dy
      assert.ok(outward > 0, 'new nodes stay on the side away from the parent')
      if (grid) { assert.equal(Math.abs(n.x % 24), 0); assert.equal(Math.abs(n.y % 24), 0) }
    }
    assert.equal(result.edges.filter(e => e.source === 'selected').length, 4)
  }
})

const structuredMap = detailed => {
  const p = { nodes: [node('root', null, 4)], omitted: [] }
  for (let branch = 0; branch < 6; branch++) {
    const id = `branch${branch}`
    p.nodes.push(node(id, 'root', 3))
    if (!detailed) { p.nodes.push(node(`${id}-summary`, id, 2)); continue }
    for (let sub = 0; sub < 3; sub++) {
      const topic = `${id}-sub${sub}`
      p.nodes.push(node(topic, id, 2))
      for (let fact = 0; fact < (sub === 2 ? 3 : 4); fact++) p.nodes.push(node(`${topic}-fact${fact}`, topic, 1))
    }
  }
  return p
}
test('91-node structured map stays compact without moving its six major topics away from the root', () => {
  const p = structuredMap(true), shallow = structuredMap(false), graph = createProject().graph
  const original = structuredClone(p)
  validateProposal(p, build, options)
  for (const grid of [false, true]) {
    const result = layoutProposal(p, build, graph, grid), baseline = layoutProposal(shallow, build, graph, grid)
    noOverlap(result.nodes)
    assert.equal(result.nodes.length, 91)
    const origin = center(result.nodes[0]), smallOrigin = center(baseline.nodes[0])
    for (const major of result.nodes.filter(n => /^branch\d$/u.test(n.title))) {
      const c = center(major), small = center(baseline.nodes.find(n => n.title === major.title))
      assert.ok(Math.hypot(c.x - origin.x, c.y - origin.y) < 850, 'first-level topics stay close')
      assert.ok(Math.abs(c.x - origin.x - small.x + smallOrigin.x) < 1e-9)
      assert.ok(Math.abs(c.y - origin.y - small.y + smallOrigin.y) < 1e-9)
    }
    const width = Math.max(...result.nodes.map(n => n.x + n.width)) - Math.min(...result.nodes.map(n => n.x))
    const height = Math.max(...result.nodes.map(n => n.y + n.height)) - Math.min(...result.nodes.map(n => n.y))
    assert.ok(width < 5000 && height < 5000, `compact footprint: ${width} × ${height}`)
    const positions = value => value.nodes.map(({ title, x, y, width, height }) => ({ title, x, y, width, height }))
    assert.deepEqual(positions(layoutProposal(p, build, graph, grid)), positions(result), 'positions are deterministic despite fresh identifiers')
    const byTitle = new Map(result.nodes.map(n => [n.title, n]))
    for (let branch = 0; branch < 6; branch++) {
      const major = center(byTitle.get(`branch${branch}`)), angle = Math.atan2(major.y - origin.y, major.x - origin.x)
      for (const n of result.nodes.filter(n => n.title.startsWith(`branch${branch}-`))) {
        const c = center(n), delta = Math.atan2(Math.sin(Math.atan2(c.y - origin.y, c.x - origin.x) - angle), Math.cos(Math.atan2(c.y - origin.y, c.x - origin.x) - angle))
        assert.ok(Math.abs(delta) <= Math.PI / 6 + .03, 'descendants stay inside their major topic sector, allowing grid rounding')
      }
    }
  }
  assert.deepEqual(p, original)
})

test('a wide root staggers only colliding topics instead of enlarging one hollow ring', () => {
  const p = { nodes: [node('root', null, 4), ...Array.from({ length: 90 }, (_, i) => node(`topic${i}`, 'root', 2))], omitted: [] }
  for (const grid of [false, true]) {
    const result = layoutProposal(p, build, createProject().graph, grid), origin = center(result.nodes[0])
    noOverlap(result.nodes)
    const radii = result.nodes.slice(1).map(n => { const c = center(n); return Math.hypot(c.x - origin.x, c.y - origin.y) })
    assert.ok(Math.min(...radii) < 800)
    assert.ok(Math.max(...radii) / Math.min(...radii) > 2, 'crowded siblings occupy different radii')
  }
})

test('AI handles follow the center vector in all four directions, with horizontal ties', () => {
  const source = { id: 'source', title: '', body: '', x: 0, y: 0, width: 528, height: 360 }
  // Unequal sizes and a negative top-left x check that centers, not top-left corners, decide.
  const target = { ...source, id: 'target', width: 192, height: 120 }
  for (const [dx, dy, sourceHandle, targetHandle] of [
    [600, 100, 'right', 'left'], [-600, 100, 'left', 'right'],
    [100, 600, 'bottom', 'top'], [100, -600, 'top', 'bottom'],
    [200, 200, 'right', 'left'], [-200, -200, 'left', 'right'],
    [0, 0, 'right', 'left'], [80, 0, 'right', 'left'],
  ]) {
    const end = { ...target, x: source.x + source.width / 2 + dx - target.width / 2, y: source.y + source.height / 2 + dy - target.height / 2 }
    assert.deepEqual(chooseHandles(source, end), { sourceHandle, targetHandle })
  }
})

test('every assistant tree edge and cross-link uses its positioned endpoints to choose handles', () => {
  const graph = createProject().graph
  graph.nodes.existing = { id: 'existing', title: 'Existing', body: '', x: 100, y: 0, width: 192, height: 120 }
  graph.nodeOrder = ['existing']
  const p = sample(); p.nodes[0].parentId = 'SELECTED'
  const result = layoutProposal(p, { kind: 'expand', selectedId: 'existing', title: 'Existing', body: '' }, graph, true)
  const nodes = new Map([...Object.values(graph.nodes), ...result.nodes].map(n => [n.id, n]))
  for (const e of result.edges) {
    assert.deepEqual({ sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }, chooseHandles(nodes.get(e.source), nodes.get(e.target)))
  }
  assert.equal(result.edges.find(e => e.label === 'supports').label, 'supports')
})
test('expansion clears all existing nodes, preserves them, and resolves SELECTED attachment', () => {
  const graph = createProject().graph
  const existing = { id: 'existing', title: 'Existing', body: '', x: -120, y: 99, width: 528, height: 360 }
  const obstacle = { ...existing, id: 'obstacle', x: 1500, y: 250, width: 768 }
  graph.nodes = { existing, obstacle }; graph.nodeOrder = ['existing', 'obstacle']
  const original = structuredClone(graph)
  const mode = { kind: 'expand', selectedId: 'existing', title: existing.title, body: '' }
  const p = { nodes: [node('a', 'SELECTED', 4), node('b', 'a'), node('c', 'SELECTED', 3)], omitted: [] }
  const result = layoutProposal(validateProposal(p, mode, options), mode, graph, true)
  noOverlap([...Object.values(graph.nodes), ...result.nodes])
  assert.deepEqual(graph, original)
  assert.equal(result.edges.filter(e => e.source === 'existing').length, 2)
  delete graph.nodes.existing
  assert.throws(() => layoutProposal(p, mode, graph, false), /removed/)
})
test('restores share one Left out parent under the root or selection and preserve original text', () => {
  for (const mode of [build, { kind: 'expand', selectedId: 'existing', title: '', body: '' }]) {
    const p = sample()
    if (mode.kind === 'expand') p.nodes[0].parentId = 'SELECTED'
    const original = structuredClone(p)
    const restored = restoreItems(p, new Set([0, 1]), mode)
    const groups = restored.nodes.filter(n => n.title === 'Left out')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].parentId, mode.kind === 'expand' ? 'SELECTED' : 'root')
    assert.deepEqual(restored.nodes.filter(n => n.parentId === groups[0].id).map(n => n.body), p.omitted.map(n => n.text))
    assert.deepEqual(p, original)
  }
})
test('Apply including restores uses one graph history entry; discard makes no edit', () => {
  const original = createProject()
  useProject.setState({ project: original })
  useGraph.setState({ past: [], future: [], gesture: null, selectedNodes: [], selectedEdges: [] })
  const restored = restoreItems(sample(), new Set([0, 1]), build)
  const additions = layoutProposal(restored, build, original.graph, true)
  assert.equal(useGraph.getState().past.length, 0)
  assert.equal(useProject.getState().project, original)
  useGraph.getState().addNodes(additions.nodes, additions.edges)
  assert.equal(useGraph.getState().past.length, 1)
  const applied = useProject.getState().project.graph
  useGraph.getState().undo()
  assert.deepEqual(useProject.getState().project.graph, original.graph)
  useGraph.getState().redo()
  assert.deepEqual(useProject.getState().project.graph, applied)
  assert.equal(useProject.getState().project.board, original.board)
})

const input = () => ({ text: 'anyway\nsame point again\nGraph notes', instruction: 'group by project', options, mode: build })
// Runtime-generated disposable credentials only: never a real key or a literal key in fixtures.
const preferences = () => ({ ...DEFAULT_SETTINGS, apiKey: crypto.randomUUID() })
const response = (p = sample()) => new Response(JSON.stringify({ status: 'completed', model: 'gpt-6-luna', usage: { input_tokens: 1000, output_tokens: 600, input_tokens_details: { cached_tokens: 200 } }, output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(p) }] }] }), { status: 200 })
test('mocked Responses request uses strict schema, checkbox options, reasoning, store false, and reports usage', async () => {
  const receipts = [], settings = preferences()
  let calls = 0
  const mock = async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(init.headers.Authorization, `Bearer ${settings.apiKey}`)
    assert.equal(init.credentials, 'omit')
    assert.equal(init.redirect, 'error')
    assert.equal(init.referrerPolicy, 'no-referrer')
    const body = JSON.parse(init.body)
    assert.equal(body.input[0].role, 'system')
    assert.equal(body.input[0].content, SYSTEM_PROMPT)
    assert.equal(body.store, false); assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.reasoning.effort, 'low')
    assert.equal(body.text.format.strict, true)
    assert.deepEqual(JSON.parse(body.input[1].content).options, options)
    assert.equal(JSON.parse(body.input[1].content).instruction, 'group by project')
    return response()
  }
  assert.deepEqual(await generateMap(input(), settings, new AbortController().signal, r => receipts.push(r), mock), sample())
  assert.equal(calls, 1); assert.equal(receipts.length, 1)
  assert.ok(Math.abs(receipts[0].cost - .000382) < 1e-10)
  assert.equal(receiptFor({ input_tokens: 1, output_tokens: 1 }, 'unknown-model').cost, null)
})
test('one automatic retry on malformed JSON/schema, with usage for both attempts; no graph writes', async () => {
  const original = useProject.getState().project
  const receipts = []; let calls = 0
  const mock = async () => { calls++; const bad = sample(); bad.nodes[1].parentId = 'missing'; return response(calls === 1 ? bad : sample()) }
  assert.deepEqual(await generateMap(input(), preferences(), new AbortController().signal, r => receipts.push(r), mock), sample())
  assert.equal(calls, 2); assert.equal(receipts.length, 2); assert.equal(useProject.getState().project, original)
  calls = 0
  await assert.rejects(generateMap(input(), preferences(), new AbortController().signal, () => {}, async () => { calls++; return new Response('{'); }), /invalid map twice/)
  assert.equal(calls, 2)
})
test('missing key, HTTP errors, network, and refusals have plain messages and do not retry', async () => {
  let calls = 0
  await assert.rejects(generateMap(input(), DEFAULT_SETTINGS, new AbortController().signal, () => {}, async () => { calls++; return response() }), /Add your OpenAI API key/)
  assert.equal(calls, 0)
  for (const [status, message] of [[401, /did not accept/], [429, /quota/], [403, /permissions/], [400, /model settings/], [500, /Try again later/]]) {
    calls = 0
    await assert.rejects(generateMap(input(), preferences(), new AbortController().signal, () => {}, async () => { calls++; return new Response('', { status }) }), message)
    assert.equal(calls, 1)
  }
  await assert.rejects(generateMap(input(), preferences(), new AbortController().signal, () => {}, async () => { throw new TypeError('network') }), /Could not reach/)
  calls = 0
  await assert.rejects(generateMap(input(), preferences(), new AbortController().signal, () => {}, async () => { calls++; return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })) }), /declined/)
  assert.equal(calls, 1)
})
test('cancel aborts pending fetch without retry or project changes', async () => {
  const controller = new AbortController(); let calls = 0
  const pending = generateMap(input(), preferences(), controller.signal, () => {}, async (_, init) => {
    calls++
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
  })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls, 1)
})
test('unexpected network and provider errors cannot reflect credentials or graph text into app errors', async () => {
  const settings = preferences(), notes = 'Synthetic private marker ' + crypto.randomUUID()
  for (const mock of [async () => { throw new Error(settings.apiKey + notes) }, async () => new Response(settings.apiKey + notes, { status: 500 })]) {
    await assert.rejects(generateMap({ ...input(), text: notes }, settings, new AbortController().signal, () => {}, mock), error => {
      assert.ok(!error.message.includes(settings.apiKey)); assert.ok(!error.message.includes(notes)); return true
    })
  }
})
test('export excludes separate credentials and accidental extra assistant fields', () => {
  const secret = crypto.randomUUID()
  const project = createProject()
  project.aiSettings = { apiKey: secret }
  project.settings.apiKey = secret
  const exported = serializeProject(project)
  assert.equal(exported.includes(secret), false)
  assert.equal(exported.includes('apiKey'), false)
  assert.equal(exported.includes('aiSettings'), false)
  assert.deepEqual(parseProjectFile(exported).settings, { theme: 'light', snap: false })
})
