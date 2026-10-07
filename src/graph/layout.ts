import type { GraphEdge, GraphNode, Point } from '../data/types'
import { GRID } from '../board/geometry'

export function chooseHandles(source: GraphNode, target: GraphNode): Pick<GraphEdge, 'sourceHandle' | 'targetHandle'> {
  const dx = target.x + target.width / 2 - source.x - source.width / 2
  const dy = target.y + target.height / 2 - source.y - source.height / 2
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' }
  return dy >= 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' }
}

export const RADIAL_THRESHOLD = 8
const GAP = 72
const FAN_SPAN = 2 * Math.PI / 3
const center = (node: GraphNode): Point => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 })
const extentAlong = (node: { width: number; height: number }, angle: number) => (Math.abs(Math.cos(angle)) * node.width + Math.abs(Math.sin(angle)) * node.height) / 2

// Intersect a center ray with inflated rectangles. Skip only occupied radial intervals,
// rather than increasing a shared ring for every node when just one pair collides.
function clearRadius(origin: Point, angle: number, radius: number, size: { width: number; height: number }, obstacles: GraphNode[], snapping: boolean): number {
  const padding = GAP / 2 + (snapping ? GRID / 2 : 0)
  const intervals: [number, number][] = []
  for (const old of obstacles) {
    let enter = -Infinity, exit = Infinity
    for (const [axis, delta, half] of [['x', Math.cos(angle), size.width / 2], ['y', Math.sin(angle), size.height / 2]] as const) {
      const min = old[axis] - half - padding - origin[axis]
      const max = old[axis] + (axis === 'x' ? old.width : old.height) + half + padding - origin[axis]
      if (Math.abs(delta) < 1e-12) { if (min > 0 || max < 0) { exit = -Infinity; break } }
      else { enter = Math.max(enter, Math.min(min / delta, max / delta)); exit = Math.min(exit, Math.max(min / delta, max / delta)) }
    }
    if (enter <= exit && exit >= radius) intervals.push([enter, exit])
  }
  intervals.sort((a, b) => a[0] - b[0])
  for (const [enter, exit] of intervals) if (radius >= enter && radius <= exit) radius = exit + 1
  return radius
}

// Shared placement uses explicit model dimensions; it never fits content or changes topology.
export function layoutTree(models: GraphNode[], parents: ReadonlyMap<string, string | null>, snapping: boolean, existing: GraphNode[] = [], selected?: GraphNode, direction = 0): GraphNode[] {
  if (!models.length) return []
  const byId = new Map(models.map(n => [n.id, n]))
  const children = new Map<string | null, string[]>()
  for (const n of models) {
    const parent = parents.get(n.id) ?? null
    children.set(parent, [...(children.get(parent) ?? []), n.id])
  }
  const roots = children.get(selected?.id ?? null) ?? []
  const snap = (value: number) => snapping ? Math.round(value / GRID) * GRID || 0 : value
  const sizes = new Map(models.map(n => [n.id, { width: n.width, height: n.height }]))
  const weights = new Map<string, number>()
  const countSubtree = (id: string): number => {
    const kids = children.get(id) ?? []
    const count = 1 + kids.reduce((sum, child) => sum + countSubtree(child), 0)
    weights.set(id, count); return count
  }
  roots.forEach(countSubtree)
  const nodes: GraphNode[] = []
  const makeNode = (id: string, x: number, y: number): GraphNode => {
    return { ...byId.get(id)!, x: snap(x), y: snap(y) }
  }
  const rootId = selected ? selected.id : roots[0]
  const anchor = selected ?? makeNode(rootId, 0, 0)
  const origin = center(anchor)
  if (!selected) nodes.push(anchor)

  if (!selected && models.length < RADIAL_THRESHOLD) {
    // Tiny maps read more clearly in two columns. Keep each main branch on its chosen side.
    const bands = new Map<string, number>(), columns: number[] = []
    const measure = (id: string, depth: number): number => {
      const size = sizes.get(id)!, kids = children.get(id) ?? []
      columns[depth] = Math.max(columns[depth] ?? 0, size.width)
      const height = Math.max(size.height, kids.reduce((sum, child) => sum + measure(child, depth + 1), 0) + Math.max(0, kids.length - 1) * GAP)
      bands.set(id, height); return height
    }
    const sides: string[][] = [[], []], heights = [0, 0]
    for (const id of children.get(rootId) ?? []) {
      const height = measure(id, 0), side = heights[0] <= heights[1] ? 0 : 1
      sides[side].push(id); heights[side] += height + GAP
    }
    const offsets = columns.map((_, depth) => columns.slice(0, depth).reduce((sum, width) => sum + width + GAP, 0))
    const place = (id: string, depth: number, top: number, right: boolean) => {
      const size = sizes.get(id)!
      const x = right ? anchor.x + anchor.width + GAP + offsets[depth] : anchor.x - GAP - offsets[depth] - size.width
      nodes.push(makeNode(id, x, top + (bands.get(id)! - size.height) / 2))
      let childTop = top
      for (const child of children.get(id) ?? []) { place(child, depth + 1, childTop, right); childTop += bands.get(child)! + GAP }
    }
    sides.forEach((side, i) => {
      let top = origin.y - Math.max(0, heights[i] - GAP) / 2
      for (const id of side) { place(id, 0, top, i === 0); top += bands.get(id)! + GAP }
    })
  } else {
    type Ray = { id: string; angle: number }
    const levels: Ray[][] = [[]]
    const divide = (branchIds: string[], start: number, span: number, depth: number) => {
      const total = branchIds.reduce((sum, id) => sum + weights.get(id)!, 0)
      let cursor = start
      for (const id of branchIds) {
        const sector = span * weights.get(id)! / total, angle = cursor + sector / 2
        const level = levels[depth] ??= []
        level.push({ id, angle })
        // Descendants stay within their branch, in an outward-facing fan rather than wrapping back.
        const childSpan = Math.min(sector, FAN_SPAN)
        divide(children.get(id) ?? [], angle - childSpan / 2, childSpan, depth + 1)
        cursor += sector
      }
    }
    const span = selected ? FAN_SPAN : 2 * Math.PI
    divide(children.get(rootId) ?? [], direction - span / 2, span, 1)
    const placedById = new Map([[rootId, anchor]])
    // Reserve major topics near the root before placing any descendants. Each child
    // starts one size-aware step beyond its parent; only its own collisions move it out.
    const snapMargin = snapping ? Math.SQRT2 * GRID : 0
    for (let depth = 1; depth < levels.length; depth++) {
      for (const ray of levels[depth]) {
        const size = sizes.get(ray.id)!
        const parent = placedById.get(parents.get(ray.id)!)!, p = center(parent)
        const dx = p.x - origin.x, dy = p.y - origin.y, parentRadius = Math.hypot(dx, dy)
        const projection = dx * Math.cos(ray.angle) + dy * Math.sin(ray.angle)
        let radius = projection + extentAlong(parent, ray.angle) + extentAlong(size, ray.angle) + GAP + snapMargin
        if (parentRadius) {
          const outward = projection / parentRadius
          radius = Math.max(radius, (parentRadius + GAP + snapMargin) / outward)
        }
        radius = clearRadius(origin, ray.angle, radius, size, selected ? [...existing, ...nodes] : nodes, snapping)
        const n = makeNode(ray.id, origin.x + radius * Math.cos(ray.angle) - size.width / 2, origin.y + radius * Math.sin(ray.angle) - size.height / 2)
        nodes.push(n); placedById.set(ray.id, n)
      }
    }
  }
  if (!selected && existing.length) {
    // Translate the complete new map, preserving its center/sectors, clear of existing content.
    const clearance = Math.max(...existing.map(n => n.x + n.width)) + GAP * 2 - Math.min(...nodes.map(n => n.x))
    const dx = snapping ? Math.ceil(clearance / GRID) * GRID : clearance
    const dy = snap(Math.min(...existing.map(n => n.y)) - Math.min(...nodes.map(n => n.y)))
    nodes.forEach(n => { n.x += dx; n.y += dy })
  }
  return nodes
}
