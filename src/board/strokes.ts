import type { CubicSegment, PenItem, Point } from '../data/types'

type StrokeGeometry = { local: CubicSegment[]; segments?: CubicSegment[]; path?: string }
const cache = new WeakMap<PenItem, StrokeGeometry>()
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const mix = (a: Point, b: Point, amount: number): Point => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount })

/** Interpolating cubic Hermite curves with centripetal Catmull–Rom tangents.
 * Shared, component-limited tangents prevent overshoot at handwriting extrema,
 * preserve intentional corners, and leave straight strokes exactly straight.
 * Every original sample lies on the curve; no moving-average input delay.
 */
export function smoothStroke(samples: readonly Point[]): CubicSegment[] {
  const points: Point[] = []
  for (const point of samples) if (!points.length || !samePoint(point, points[points.length - 1])) points.push(point)
  if (points.length < 2) return []
  const intervals = points.slice(1).map((point, i) => Math.sqrt(Math.hypot(point.x - points[i].x, point.y - points[i].y)))
  const slopes = points.slice(1).map((point, i) => ({ x: (point.x - points[i].x) / intervals[i], y: (point.y - points[i].y) / intervals[i] }))
  const tangent = (before: Point, after: Point, left: number, right: number): Point => {
    const component = (a: number, b: number) => {
      if (a * b <= 0) return 0
      const estimate = (a * right + b * left) / (left + right)
      return Math.sign(estimate) * Math.min(Math.abs(estimate), 3 * Math.min(Math.abs(a), Math.abs(b)))
    }
    return { x: component(before.x, after.x), y: component(before.y, after.y) }
  }
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === points.length - 1 ? slopes[slopes.length - 1] : tangent(slopes[i - 1], slopes[i], intervals[i - 1], intervals[i]))
  if (points.length > 3 && samePoint(points[0], points[points.length - 1])) {
    const shared = tangent(slopes[slopes.length - 1], slopes[0], intervals[intervals.length - 1], intervals[0])
    tangents[0] = shared
    tangents[tangents.length - 1] = shared
  }
  return points.slice(1).map((end, i) => {
    const start = points[i]
    const scale = intervals[i] / 3
    return {
      start: { ...start }, end: { ...end },
      control1: { x: start.x + tangents[i].x * scale, y: start.y + tangents[i].y * scale },
      control2: { x: end.x - tangents[i + 1].x * scale, y: end.y - tangents[i + 1].y * scale },
    }
  })
}

export function cubicPoint(segment: CubicSegment, t: number): Point {
  const a = mix(segment.start, segment.control1, t)
  const b = mix(segment.control1, segment.control2, t)
  const c = mix(segment.control2, segment.end, t)
  return mix(mix(a, b, t), mix(b, c, t), t)
}

function mapSegment(segment: CubicSegment, transform: (point: Point) => Point): CubicSegment {
  return { start: transform(segment.start), control1: transform(segment.control1), control2: transform(segment.control2), end: transform(segment.end) }
}

function geometry(item: PenItem): StrokeGeometry {
  const previous = cache.get(item)
  if (previous) return previous
  const local = (point: Point): Point => ({ x: point.x * item.width, y: point.y * item.height })
  const result = { local: item.curves ? item.curves.map(segment => mapSegment(segment, local)) : smoothStroke(item.points.map(local)) }
  cache.set(item, result)
  return result
}

/** Exact rendered centerline in world coordinates, also used by the eraser. */
export function getStrokeSegments(item: PenItem): CubicSegment[] {
  const result = geometry(item)
  result.segments ??= result.local.map(segment => mapSegment(segment, point => ({ x: point.x + item.x, y: point.y + item.y })))
  return result.segments
}
export function strokePath(item: PenItem): string {
  const result = geometry(item)
  if (result.path === undefined) {
    const segments = result.local
    // Keep precision in the path: even tiny strokes remain accurate at high zoom.
    // Eraser hit-testing never builds this string; only rendered items need it.
    result.path = segments.length ? `M${segments[0].start.x},${segments[0].start.y} ${segments.map(segment => `C${segment.control1.x},${segment.control1.y} ${segment.control2.x},${segment.control2.y} ${segment.end.x},${segment.end.y}`).join(' ')}` : ''
  }
  return result.path
}

function pointBounds(points: Iterable<Point>) {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of points) { x = Math.min(x, point.x); y = Math.min(y, point.y); right = Math.max(right, point.x); bottom = Math.max(bottom, point.y) }
  if (x === Infinity) return { x: 0, y: 0, width: 1, height: 1 }
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

export function createPenItem(id: string, samples: readonly Point[]): PenItem {
  const points: Point[] = []
  for (const point of samples) if (!points.length || !samePoint(point, points[points.length - 1])) points.push(point)
  if (!points.length) points.push({ x: 0, y: 0 })
  const bounds = pointBounds(points)
  return { id, type: 'pen', ...bounds, points: points.map(point => ({ x: (point.x - bounds.x) / bounds.width, y: (point.y - bounds.y) / bounds.height })) }
}

/** Normalize split curves without changing their control points or trajectory. */
export function createPenFromSegments(id: string, segments: readonly CubicSegment[], source?: PenItem): PenItem {
  function* controls() { for (const segment of segments) { yield segment.start; yield segment.control1; yield segment.control2; yield segment.end } }
  const bounds = pointBounds(controls())
  const normalized = (point: Point): Point => ({ x: (point.x - bounds.x) / bounds.width, y: (point.y - bounds.y) / bounds.height })
  const points = segments.length ? [normalized(segments[0].start), ...segments.map(segment => normalized(segment.end))] : [{ x: 0, y: 0 }]
  return { ...source, id, type: 'pen', ...bounds, points, curves: segments.map(segment => mapSegment(segment, normalized)) }
}
