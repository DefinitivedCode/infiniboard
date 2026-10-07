import type { GraphNode, Point } from '../data/types'
import { snap } from '../board/geometry'

export const MIN_SIZE = { width: 144, height: 96 }
export const MAX_SIZE = { width: 768, height: 576 }
export const PRESETS = {
  S: { width: 192, height: 120, titleSize: 18, bodySize: 14, padding: 12 },
  M: { width: 288, height: 192, titleSize: 24, bodySize: 16, padding: 16 },
  L: { width: 384, height: 264, titleSize: 32, bodySize: 18, padding: 20 },
  XL: { width: 528, height: 360, titleSize: 40, bodySize: 20, padding: 24 },
} as const
export type Preset = keyof typeof PRESETS
export const IMPORTANCE_PRESETS: Record<NonNullable<GraphNode['importance']>, Preset> = { 1: 'S', 2: 'M', 3: 'L', 4: 'XL' }

export function nodeSizeStep(node: GraphNode): Preset {
  return node.importance ? IMPORTANCE_PRESETS[node.importance] : sizeStep(node.width, node.height)
}

export function sizeStep(width: number, height: number): Preset {
  const area = width * height
  if (area >= PRESETS.XL.width * PRESETS.XL.height) return 'XL'
  if (area >= PRESETS.L.width * PRESETS.L.height) return 'L'
  if (area >= PRESETS.M.width * PRESETS.M.height) return 'M'
  return 'S'
}

export function clampNode(node: GraphNode): GraphNode {
  const width = Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, node.width))
  const height = Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, node.height))
  return width === node.width && height === node.height ? node : { ...node, width, height }
}

export function createNode(point: Point, snapping: boolean): GraphNode {
  return { id: crypto.randomUUID(), title: 'Untitled node', body: '', x: snap(point.x, snapping), y: snap(point.y, snapping), width: PRESETS.M.width, height: PRESETS.M.height }
}
