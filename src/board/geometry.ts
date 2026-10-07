import type { BoardItem, Point, Viewport } from '../data/types'

export const GRID = 24
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export type Bounds = Point & { width: number; height: number }

export function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID) * GRID : value
}

export function worldPoint(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
}

export function zoomAt(viewport: Viewport, point: Point, zoom: number): Viewport {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  const world = worldPoint(point, viewport)
  return { x: point.x - world.x * next, y: point.y - world.y * next, zoom: next }
}

export function boundsOf(items: BoardItem[]): Bounds | null {
  if (!items.length) return null
  const x = Math.min(...items.map(item => item.x))
  const y = Math.min(...items.map(item => item.y))
  return { x, y, width: Math.max(...items.map(item => item.x + item.width)) - x, height: Math.max(...items.map(item => item.y + item.height)) - y }
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function rectangle(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

export function resizeItems(items: BoardItem[], from: Bounds, to: Bounds): BoardItem[] {
  const scaleX = to.width / Math.max(from.width, 1)
  const scaleY = to.height / Math.max(from.height, 1)
  return items.map(item => ({ ...item, x: to.x + (item.x - from.x) * scaleX, y: to.y + (item.y - from.y) * scaleY, width: Math.max(1, item.width * scaleX), height: Math.max(1, item.height * scaleY) }))
}
