import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { smoothStroke, cubicPoint, createPenItem, createPenFromSegments, getStrokeSegments, strokePath } = require('../.verification/unit/src/board/strokes.js')
const { eraseStrokes, eraseStrokePath } = require('../.verification/unit/src/board/eraser.js')
const { createProject } = require('../.verification/unit/src/data/types.js')
const { parseProjectFile, serializeProject } = require('../.verification/unit/src/data/projectFile.js')
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const p = (x, y) => ({ x, y })
const close = (actual, expected, epsilon = 1e-8) => { assert.ok(Math.abs(actual.x - expected.x) < epsilon); assert.ok(Math.abs(actual.y - expected.y) < epsilon) }
const stroke = (id = 'stroke') => createPenItem(id, [p(0, 0), p(50, 0), p(100, 0), p(150, 0), p(200, 0)])
const erase = (item, from, to = from, radius = 10) => eraseStrokes({ [item.id]: item }, [item.id], from, to, radius)
const reset = () => useProject.setState({ project: createProject(), ready: true, tool: 'select', selected: [], editing: null, past: [], future: [], gesture: null, draft: null, marquee: null })
const state = () => useProject.getState()

test('smooth interpolating curves pass through all samples without mutating them', () => {
  const points = [p(0, 10), p(10, 3), p(22, 0), p(35, 10), p(60, 30)]
  const before = structuredClone(points), curves = smoothStroke(points)
  assert.equal(curves.length, points.length - 1)
  curves.forEach((s, i) => { close(s.start, points[i]); close(s.end, points[i + 1]); close(cubicPoint(s, 0), points[i]); close(cubicPoint(s, 1), points[i + 1]) })
  assert.deepEqual(points, before)
  assert.match(strokePath(createPenItem('curve', points)), /C/)
})

test('straight sparse, vertical, diagonal and reversed strokes stay exactly straight', () => {
  for (const points of [[p(0, 0), p(3, 0), p(100, 0)], [p(2, -10), p(2, 12), p(2, 80)], [p(0, 0), p(4, 8), p(40, 80)], [p(100, 50), p(30, 15), p(0, 0)]]) {
    const first = points[0], last = points.at(-1)
    for (const s of smoothStroke(points)) for (let i = 0; i <= 20; i++) {
      const value = cubicPoint(s, i / 20)
      assert.ok(Math.abs((value.x - first.x) * (last.y - first.y) - (value.y - first.y) * (last.x - first.x)) < 1e-7)
    }
  }
})

test('ordinary curves share tangent directions and intentionally sharp handwriting corners do not overshoot', () => {
  const curves = smoothStroke([p(0, 0), p(10, 8), p(22, 13), p(45, 14)])
  for (let i = 0; i < curves.length - 1; i++) {
    const a = curves[i], b = curves[i + 1]
    const left = p(a.end.x - a.control2.x, a.end.y - a.control2.y), right = p(b.control1.x - b.start.x, b.control1.y - b.start.y)
    assert.ok(Math.hypot(left.x, left.y) > 0)
    assert.ok(Math.abs(left.x * right.y - left.y * right.x) < 1e-8)
  }
  const letters = [p(0, 5), p(2, 0), p(4, 5), p(6, 0), p(8, 5)]
  for (const s of smoothStroke(letters)) for (let i = 0; i <= 50; i++) {
    const value = cubicPoint(s, i / 50)
    assert.ok(value.x >= Math.min(s.start.x, s.end.x) - 1e-9 && value.x <= Math.max(s.start.x, s.end.x) + 1e-9)
    assert.ok(value.y >= 0 && value.y <= 5)
  }
})

test('single points, duplicate samples and extremely short handwriting strokes remain finite', () => {
  for (const points of [[p(5, 7)], [p(5, 7), p(5, 7)], [p(5, 7), p(5.000001, 7.000002)]]) {
    const item = createPenItem('tiny', points)
    assert.ok(item.width > 0 && item.height > 0)
    assert.ok(!/NaN|Infinity/.test(strokePath(item)))
    close(p(item.x + item.points[0].x * item.width, item.y + item.points[0].y * item.height), points[0])
  }
  assert.deepEqual(smoothStroke([p(1, 1)]), [])
  assert.equal(getStrokeSegments(createPenItem('tiny', [p(0, 0), p(.01, .02)])).length, 1)
})

test('whole erasure removes dots and strokes but near misses retain original identities', () => {
  const item = stroke()
  const miss = erase(item, p(100, 40))
  assert.equal(miss.changed, false); assert.equal(miss.items.stroke, item)
  assert.deepEqual(erase(item, p(-20, 0), p(220, 0)).order, [])
  const dot = createPenItem('dot', [p(12, 15)])
  assert.equal(erase(dot, p(40, 40)).changed, false)
  assert.deepEqual(erase(dot, p(12, 15)).order, [])
})

test('partial erasing splits a line with a real gap and preserves unaffected geometry', () => {
  const item = stroke(), result = erase(item, p(100, 0))
  assert.equal(result.changed, true); assert.equal(result.order.length, 2)
  assert.equal(result.order[0], item.id)
  const left = getStrokeSegments(result.items[result.order[0]]), right = getStrokeSegments(result.items[result.order[1]])
  close(left[0].start, p(0, 0)); close(right.at(-1).end, p(200, 0))
  assert.ok(left.at(-1).end.x < 90 && right[0].start.x > 110)
  for (const id of result.order) assert.ok(result.items[id].curves.length > 0)
})

test('eraser hits the curved centerline instead of its bounding box', () => {
  const item = createPenItem('arch', [p(0, 100), p(30, 20), p(60, 0), p(100, 100)])
  assert.equal(erase(item, p(10, 10), undefined, 3).changed, false)
  const curvePoint = cubicPoint(getStrokeSegments(item)[1], .5)
  const result = erase(item, curvePoint, curvePoint, 3)
  assert.equal(result.changed, true); assert.equal(result.order.length, 2)
})

test('fast swept erasing crosses multiple strokes and leaves shapes, notes and arrows untouched', () => {
  const items = { a: createPenItem('a', [p(0, 20), p(200, 20)]), b: createPenItem('b', [p(0, 80), p(200, 80)]), rect: { id: 'rect', type: 'rect', x: 20, y: 20, width: 60, height: 60, swatch: 'none' }, note: { id: 'note', type: 'sticky', x: 20, y: 20, width: 216, height: 192, text: '', fontSize: 20, swatch: 'oat' }, arrow: { id: 'arrow', type: 'arrow', x: 0, y: 0, width: 100, height: 100, start: p(0, 0), end: p(1, 1) } }
  const result = eraseStrokes(items, Object.keys(items), p(100, -100), p(100, 200), 10)
  assert.equal(result.changed, true)
  assert.equal(result.order.length, 7)
  for (const id of ['rect', 'note', 'arrow']) assert.equal(result.items[id], items[id])
})

test('screen-sized eraser radius maps correctly into world coordinates at every zoom', () => {
  for (const zoom of [.1, .5, 1, 2, 4]) {
    const item = createPenItem('zoom', [p(0, 0), p(1000, 0)])
    assert.equal(erase(item, p(500, 10 / zoom), undefined, 12 / zoom).changed, true)
    assert.equal(erase(item, p(500, 18 / zoom + 2), undefined, 12 / zoom).changed, false)
  }
})

test('batched erasing follows every bend of the pointer trajectory instead of its endpoints chord', () => {
  const target = createPenItem('target', [p(50, 95), p(50, 105)])
  const chord = createPenItem('chord', [p(45, 0), p(55, 0)])
  const items = { target, chord }, order = ['target', 'chord']
  const result = eraseStrokePath(items, order, [p(0, 0), p(0, 100), p(100, 100), p(100, 0)], 6)
  assert.equal(result.changed, true); assert.deepEqual(result.order, ['chord']); assert.equal(result.items.chord, chord)
  assert.equal(eraseStrokePath(items, order, [], 6).changed, false)
  assert.equal(eraseStrokePath(items, order, [p(NaN, 0)], 6).changed, false)
})

test('a miss-only eraser gesture creates no history and preserves redo', () => {
  reset(); state().addItems([stroke()], false); state().addItems([stroke('second')], false); state().undo()
  const items = state().project.board.items, future = state().future
  state().beginGesture(); state().eraseStrokes(p(40, 100), p(160, 100), 10); state().endGesture()
  assert.equal(state().past.length, 1); assert.equal(state().project.board.items, items); assert.equal(state().future, future)
})

test('drawing and continuous erasing each undo/redo atomically and cancelled erasing restores exact data', () => {
  reset(); state().setTool('pen'); state().addItems([stroke()], false)
  assert.equal(state().tool, 'pen'); assert.deepEqual(state().selected, [])
  const initial = state().project.board.items
  state().setTool('eraser'); state().beginGesture()
  for (let x = 70; x <= 130; x += 5) state().eraseStrokes(p(x - 5, 0), p(x, 0), 10)
  state().endGesture()
  const erased = state().project.board.items
  assert.equal(state().past.length, 2); assert.equal(state().tool, 'eraser')
  state().undo(); assert.equal(state().project.board.items, initial)
  state().redo(); assert.equal(state().project.board.items, erased)
  state().beginGesture(); state().eraseStrokes(p(-10, 0), p(220, 0), 20); state().endGesture(true)
  assert.equal(state().project.board.items, erased); assert.equal(state().past.length, 2)
  state().undo(); state().undo(); assert.equal(state().project.board.order.length, 0)
  state().redo(); assert.equal(state().project.board.items, initial)
})

test('legacy points, intact strokes and exact partial curves survive JSON round trips', () => {
  const project = createProject(), legacy = { id: 'legacy', type: 'pen', x: -40, y: -30, width: 100, height: 80, points: [p(0, 0), p(.25, 1), p(1, .2)] }
  const partial = erase(stroke(), p(100, 0))
  project.board.items = { legacy, ...partial.items }; project.board.order = ['legacy', ...partial.order]
  const imported = parseProjectFile(serializeProject(project))
  assert.deepEqual(imported, project)
  assert.match(strokePath(imported.board.items.legacy), /C/)
  for (const id of partial.order) assert.deepEqual(getStrokeSegments(imported.board.items[id]), getStrokeSegments(partial.items[id]))
  const rebuilt = createPenFromSegments('rebuilt', getStrokeSegments(legacy))
  assert.equal(getStrokeSegments(rebuilt).length, legacy.points.length - 1)
})

test('malformed or disconnected saved curves are rejected before replacement', () => {
  const project = createProject(), exact = createPenFromSegments('exact', smoothStroke([p(0, 0), p(50, 30), p(100, 0)]))
  project.board.items.exact = exact; project.board.order = ['exact']
  for (const mutate of [i => { i.curves[0].control1.x = NaN }, i => { i.curves[1].start = p(.6, .6) }, i => { i.curves[0].end.y = 5 }]) {
    const invalid = structuredClone(project); mutate(invalid.board.items.exact)
    assert.throws(() => parseProjectFile(serializeProject(invalid)))
  }
})

test('large projects preserve unrelated identities and long stroke geometry is cached', () => {
  const long = createPenItem('long', Array.from({ length: 10000 }, (_, i) => p(i * .2, Math.sin(i * .03) * 40)))
  assert.equal(getStrokeSegments(long).length, 9999)
  assert.equal(getStrokeSegments(long), getStrokeSegments(long))
  const items = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => { const item = createPenItem(`short-${i}`, [p(i * 30, 100), p(i * 30 + 10, 120)]); return [item.id, item] }))
  items.long = long
  const result = eraseStrokes(items, Object.keys(items), p(15000, 100), p(15010, 120), 5)
  assert.equal(result.changed, true)
  for (const id of Object.keys(items)) if (id !== 'short-500') assert.equal(result.items[id], items[id])
})
