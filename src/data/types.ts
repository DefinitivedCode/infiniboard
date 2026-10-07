export type Point = { x: number; y: number }
export type Viewport = Point & { zoom: number }
export type Swatch = 'oat' | 'sage' | 'rose' | 'paper'
export type Theme = 'light' | 'dark'

type ItemBase = Point & { id: string; width: number; height: number }
export type TextItem = ItemBase & { type: 'text'; text: string; fontSize: number; minHeight?: number }
export type StickyItem = ItemBase & { type: 'sticky'; text: string; swatch: Swatch; fontSize: number; minHeight?: number }
export type ShapeItem = ItemBase & { type: 'rect' | 'ellipse'; swatch: Swatch | 'none' }
// Stroke coordinates are normalized to the item's box, making group resizing uniform.
export type LineItem = ItemBase & { type: 'line' | 'arrow'; start: Point; end: Point }
export type PenItem = ItemBase & { type: 'pen'; points: Point[] }
export type BoardItem = TextItem | StickyItem | ShapeItem | LineItem | PenItem
export type GraphNode = Point & { id: string; title: string; body: string; width: number; height: number; importance?: 1 | 2 | 3 | 4 }
export type GraphEdge = { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string; label?: string }
export type Project = {
  id: string
  version: 2
  title: string
  updatedAt: number
  board: { items: Record<string, BoardItem>; order: string[]; viewport: Viewport }
  graph: { nodes: Record<string, GraphNode>; nodeOrder: string[]; edges: Record<string, GraphEdge>; edgeOrder: string[]; viewport: Viewport }
  settings: { snap: boolean; theme: Theme }
}

export function createProject(): Project {
  return {
    id: 'local-project', version: 2, title: 'Untitled project', updatedAt: Date.now(),
    board: { items: {}, order: [], viewport: { x: 0, y: 0, zoom: 1 } },
    graph: { nodes: {}, nodeOrder: [], edges: {}, edgeOrder: [], viewport: { x: 0, y: 0, zoom: 1 } },
    settings: { snap: false, theme: 'light' },
  }
}
