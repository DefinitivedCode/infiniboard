import type { BoardItem, CubicSegment, PenItem, Point } from '../data/types'
import { createPenFromSegments, getStrokeSegments } from './strokes'

type Interval = [number, number]
type Sweep = { from: Point; to: Point }
export type ErasureResult = { items: Record<string, BoardItem>; order: string[]; changed: boolean }

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

// De Casteljau subdivision keeps the surviving path exactly on the original curve.
function split(curve: CubicSegment, t: number): [CubicSegment, CubicSegment] {
  const a = lerp(curve.start, curve.control1, t)
  const b = lerp(curve.control1, curve.control2, t)
  const c = lerp(curve.control2, curve.end, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const middle = lerp(d, e, t)
  return [
    { start: curve.start, control1: a, control2: d, end: middle },
    { start: middle, control1: e, control2: c, end: curve.end },
  ]
}

function slice(curve: CubicSegment, from: number, to: number): CubicSegment {
  const prefix = to < 1 ? split(curve, to)[0] : curve
  return from > 0 ? split(prefix, from / to)[1] : prefix
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - from.x - dx * t, point.y - from.y - dy * t)
}

function circleInterval(from: Point, to: Point, center: Point, radius: number): Interval[] {
  const dx = to.x - from.x, dy = to.y - from.y
  const x = from.x - center.x, y = from.y - center.y
  const a = dx * dx + dy * dy
  const c = x * x + y * y - radius * radius
  if (a < 1e-16) return c <= 0 ? [[0, 1]] : []
  const b = 2 * (x * dx + y * dy)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  const low = Math.max(0, (-b - root) / (2 * a))
  const high = Math.min(1, (-b + root) / (2 * a))
  return high - low > 1e-10 ? [[low, high]] : []
}

function slab(value: number, delta: number, low: number, high: number): Interval | null {
  if (Math.abs(delta) < 1e-12) return value >= low && value <= high ? [0, 1] : null
  const a = (low - value) / delta, b = (high - value) / delta
  const start = Math.max(0, Math.min(a, b)), end = Math.min(1, Math.max(a, b))
  return end - start > 1e-10 ? [start, end] : null
}

function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.sort((a, b) => a[0] - b[0])
  const result: Interval[] = []
  for (const interval of sorted) {
    const previous = result.at(-1)
    if (previous && interval[0] <= previous[1] + 1e-8) previous[1] = Math.max(previous[1], interval[1])
    else result.push([...interval])
  }
  return result
}

// A pointer segment sweeps a capsule: two end disks and their connecting strip.
// This prevents fast eraser gestures from jumping over thin strokes.
function capsuleIntervals(start: Point, end: Point, from: Point, to: Point, radius: number): Interval[] {
  const intervals = [...circleInterval(start, end, from, radius), ...circleInterval(start, end, to, radius)]
  const dx = to.x - from.x, dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length > 1e-8) {
    const ux = dx / length, uy = dy / length
    const x = start.x - from.x, y = start.y - from.y
    const vx = end.x - start.x, vy = end.y - start.y
    const along = slab(x * ux + y * uy, vx * ux + vy * uy, 0, length)
    const across = slab(-x * uy + y * ux, -vx * uy + vy * ux, -radius, radius)
    if (along && across) {
      const low = Math.max(along[0], across[0]), high = Math.min(along[1], across[1])
      if (high - low > 1e-10) intervals.push([low, high])
    }
  }
  return merge(intervals)
}

function outside(points: Point[], from: Point, to: Point, radius: number): boolean {
  const minX = Math.min(from.x, to.x) - radius, maxX = Math.max(from.x, to.x) + radius
  const minY = Math.min(from.y, to.y) - radius, maxY = Math.max(from.y, to.y) + radius
  return points.every(p => p.x < minX) || points.every(p => p.x > maxX) || points.every(p => p.y < minY) || points.every(p => p.y > maxY)
}

function removedIntervals(curve: CubicSegment, from: Point, to: Point, radius: number, tolerance: number): Interval[] {
  const intervals: Interval[] = []
  const visit = (part: CubicSegment, low: number, high: number, depth: number) => {
    if (outside([part.start, part.control1, part.control2, part.end], from, to, radius + tolerance)) return
    // Also bound parameter distortion along a straight curve. Collinear controls
    // alone do not guarantee that chord fractions equal the cubic's t values.
    const first = lerp(part.start, part.end, 1 / 3), second = lerp(part.start, part.end, 2 / 3)
    const flatness = Math.max(Math.hypot(part.control1.x - first.x, part.control1.y - first.y), Math.hypot(part.control2.x - second.x, part.control2.y - second.y))
    if (flatness <= tolerance || depth >= 18) {
      for (const [a, b] of capsuleIntervals(part.start, part.end, from, to, radius + tolerance)) intervals.push([low + (high - low) * a, low + (high - low) * b])
      return
    }
    const [left, right] = split(part, .5)
    const middle = (low + high) / 2
    visit(left, low, middle, depth + 1)
    visit(right, middle, high, depth + 1)
  }
  visit(curve, 0, 1, 0)
  return merge(intervals)
}

function hasVisibleLength(curves: CubicSegment[], minimum: number): boolean {
  let length = 0
  for (const curve of curves) {
    let previous = curve.start
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t
      const point = { x: u ** 3 * curve.start.x + 3 * u * u * t * curve.control1.x + 3 * u * t * t * curve.control2.x + t ** 3 * curve.end.x, y: u ** 3 * curve.start.y + 3 * u * u * t * curve.control1.y + 3 * u * t * t * curve.control2.y + t ** 3 * curve.end.y }
      length += Math.hypot(point.x - previous.x, point.y - previous.y)
      if (length >= minimum) return true
      previous = point
    }
  }
  return false
}

function erasePen(item: PenItem, sweeps: Sweep[], radius: number): PenItem[] | null {
  // Existing pen ink is two world units wide. Include its round cap in hit testing.
  const inkRadius = radius + 1
  const bounds = [{ x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height }]
  const candidates = sweeps.filter(({ from, to }) => !outside(bounds, from, to, inkRadius))
  if (!candidates.length) return null
  const curves = getStrokeSegments(item)
  if (!curves.length) {
    const point = item.points[0]
    const world = { x: item.x + point.x * item.width, y: item.y + point.y * item.height }
    return candidates.some(({ from, to }) => distanceToSegment(world, from, to) <= inkRadius) ? [] : null
  }
  const tolerance = Math.max(.001, Math.min(.12, radius / 128))
  const deleted: Interval[] = []
  for (let index = 0; index < curves.length; index++) {
    for (const { from, to } of candidates) {
      for (const [a, b] of removedIntervals(curves[index], from, to, inkRadius, tolerance)) deleted.push([index + a, index + b])
    }
  }
  const removed = merge(deleted)
  if (!removed.length) return null
  const remaining: Interval[] = []
  let cursor = 0
  for (const [low, high] of removed) {
    if (low - cursor > 1e-8) remaining.push([cursor, low])
    cursor = Math.max(cursor, high)
  }
  if (curves.length - cursor > 1e-8) remaining.push([cursor, curves.length])
  const fragments: PenItem[] = []
  for (const [low, high] of remaining) {
    const segments: CubicSegment[] = []
    for (let index = Math.floor(low); index < Math.ceil(high); index++) {
      const a = Math.max(0, low - index), b = Math.min(1, high - index)
      if (b - a > 1e-8) segments.push(slice(curves[index], a, b))
    }
    // Discard clipping specks smaller than roughly one screen pixel.
    if (segments.length && hasVisibleLength(segments, radius * .06)) fragments.push(createPenFromSegments(fragments.length ? crypto.randomUUID() : item.id, segments, item))
  }
  return fragments
}

/** Clip the entire sampled pointer trajectory before allocating surviving geometry.
 * Coalesced samples retain curved motion without rebuilding long strokes per sample.
 * Callers group successive frame updates into one undoable gesture.
 */
export function eraseStrokePath(items: Record<string, BoardItem>, order: string[], points: readonly Point[], radius: number): ErasureResult {
  if (!Number.isFinite(radius) || radius <= 0 || !points.length || !points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return { items, order, changed: false }
  const sweeps = points.length === 1 ? [{ from: points[0], to: points[0] }] : points.slice(1).map((to, index) => ({ from: points[index], to }))
  let nextItems = items
  const nextOrder: string[] = []
  for (const id of order) {
    const item = items[id]
    const fragments = item?.type === 'pen' ? erasePen(item, sweeps, radius) : null
    if (fragments === null) { nextOrder.push(id); continue }
    if (nextItems === items) nextItems = { ...items }
    delete nextItems[id]
    for (const fragment of fragments) { nextItems[fragment.id] = fragment; nextOrder.push(fragment.id) }
  }
  return nextItems === items ? { items, order, changed: false } : { items: nextItems, order: nextOrder, changed: true }
}

/** Erase one swept pointer segment using world coordinates. */
export function eraseStrokes(items: Record<string, BoardItem>, order: string[], from: Point, to: Point, radius: number): ErasureResult {
  return eraseStrokePath(items, order, [from, to], radius)
}
