import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { useProject } = require('../.verification/unit/src/store/useProject.js')
const { createProject } = require('../.verification/unit/src/data/types.js')
const { worldPoint, zoomAt, snap, boundsOf, resizeItems, intersects } = require('../.verification/unit/src/board/geometry.js')
const { textBoxHeight } = require('../.verification/unit/src/board/textHeight.js')
const note = (id, x = 0, y = 0) => ({ id, type: 'sticky', x, y, width: 216, height: 192, text: 'An idea', fontSize: 20, swatch: 'oat' })
const state = () => useProject.getState()
const reset = () => useProject.setState({ project: createProject(), ready: true, selected: [], editing: null, past: [], future: [], gesture: null, draft: null, marquee: null })

test('text heights include exact chrome, round up, and preserve the user minimum', () => {
  assert.equal(textBoxHeight(29.1, 'text', 40), 40)
  assert.equal(textBoxHeight(100.2, 'text', 40), 109)
  assert.equal(textBoxHeight(200.2, 'sticky', 192), 235)
  assert.equal(textBoxHeight(58, 'sticky', 192), 192)
  assert.equal(textBoxHeight(300, 'sticky', 192), 334)
  assert.equal(textBoxHeight(100, 'sticky', 192), 192)
})

test('zoom preserves the world position beneath the pointer and clamps limits', () => {
  const viewport = { x: -312, y: 120, zoom: .75 }
  const pointer = { x: 417, y: 283 }
  for (const factor of [.0001, .5, 2, 1000]) {
    const next = zoomAt(viewport, pointer, viewport.zoom * factor)
    const before = worldPoint(pointer, viewport)
    const after = worldPoint(pointer, next)
    assert.ok(Math.abs(before.x - after.x) < 1e-8)
    assert.ok(Math.abs(before.y - after.y) < 1e-8)
    assert.ok(next.zoom >= .1 && next.zoom <= 4)
  }
})

test('snap handles negative world coordinates independently of zoom', () => {
  assert.equal(snap(-37, true), -48)
  assert.equal(snap(37, true), 48)
  assert.equal(snap(37.25, false), 37.25)
  for (const zoom of [.1, .5, 2, 4]) {
    assert.equal(snap(worldPoint({ x: -37 * zoom + 10, y: 0 }, { x: 10, y: 0, zoom }).x, true), -48)
  }
})

test('group resize preserves relative positions and normalized stroke points', () => {
  const stroke = { id: 'stroke', type: 'pen', x: 100, y: 100, width: 200, height: 100, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
  const items = [note('note'), stroke]
  const from = boundsOf(items)
  const to = { x: -40, y: 24, width: from.width * 2, height: from.height * 3 }
  const result = resizeItems(items, from, to)
  assert.equal(result[1].x, 160)
  assert.equal(result[1].y, 324)
  assert.equal(result[1].width, 400)
  assert.equal(result[1].height, 300)
  assert.deepEqual(result[1].points, stroke.points)
  assert.equal(intersects(to, result[0]), true)
})

test('a drag with many updates creates one undo entry and preserves viewport/settings', () => {
  reset(); state().addItems([note('a')]); state().beginGesture()
  for (let x = 1; x <= 40; x++) state().updateItems([{ ...state().project.board.items.a, x }], false)
  state().setViewport({ x: 120, y: -300, zoom: .5 }); state().toggleSnap(); state().endGesture()
  assert.equal(state().past.length, 2)
  state().undo()
  assert.equal(state().project.board.items.a.x, 0)
  assert.equal(state().project.board.viewport.zoom, .5)
  assert.equal(state().project.settings.snap, true)
  state().redo()
  assert.equal(state().project.board.items.a.x, 40)
})

test('cancelled gestures restore content without adding history', () => {
  reset(); state().addItems([note('a')]); const initial = state().project.board.items
  state().beginGesture(); state().updateItems([{ ...initial.a, x: 100, width: 500 }], false); state().endGesture(true)
  assert.equal(state().project.board.items, initial)
  assert.equal(state().past.length, 1)
})

test('multi-selection delete and duplicate undo atomically; new changes discard redo', () => {
  reset(); state().addItems([note('a'), note('b', 240)])
  state().duplicateSelected()
  assert.equal(state().project.board.order.length, 4)
  assert.equal(new Set(state().project.board.order).size, 4)
  state().undo(); assert.equal(state().project.board.order.length, 2)
  state().select(['a', 'b']); state().deleteSelected()
  assert.equal(state().project.board.order.length, 0)
  assert.equal(state().future.length, 0)
  state().undo(); assert.equal(state().project.board.order.length, 2)
})

test('1,200 items retain identities and order during viewport updates and single-item edits', () => {
  reset(); state().addItems(Array.from({ length: 1200 }, (_, i) => note(`item-${i}`, (i % 40) * 240, Math.floor(i / 40) * 216)))
  const items = state().project.board.items
  const order = state().project.board.order
  let contentChanges = 0
  const unsubscribe = useProject.subscribe((s, previous) => { if (s.project.board.items !== previous.project.board.items) contentChanges++ })
  for (let i = 0; i < 120; i++) state().setViewport({ x: i * 5, y: i * -3, zoom: 1 + i / 100 })
  assert.equal(contentChanges, 0)
  assert.equal(state().project.board.items, items)
  assert.equal(state().project.board.order, order)
  state().updateItems([{ ...items['item-500'], text: 'Changed' }])
  assert.equal(contentChanges, 1)
  assert.equal(state().project.board.order, order)
  for (const id of order) if (id !== 'item-500') assert.equal(state().project.board.items[id], items[id])
  unsubscribe()
})

test('history is bounded to the most recent 100 actions', () => {
  reset(); state().addItems([note('a')])
  for (let x = 1; x < 150; x++) state().updateItems([{ ...state().project.board.items.a, x }])
  assert.equal(state().past.length, 100)
})
