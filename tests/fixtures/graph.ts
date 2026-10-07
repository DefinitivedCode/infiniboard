import { createProject } from '../../src/data/types'
import type { GraphEdge, GraphNode } from '../../src/data/types'

export function graphFixture() {
  const project = createProject()
  const nodes: GraphNode[] = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, title: `Idea ${i + 1}`, body: `A thought in row ${Math.floor(i / 25) + 1}.`, x: 96 + (i % 25) * 384, y: 96 + Math.floor(i / 25) * 288, width: 288, height: 192 }))
  const edges: GraphEdge[] = Array.from({ length: 700 }, (_, i) => ({ id: `e${i}`, source: `n${i % 500}`, target: `n${(i % 500 + (i < 500 ? 1 : 7)) % 500}`, sourceHandle: i < 500 ? 'right' : 'bottom', targetHandle: i < 500 ? 'left' : 'top', label: '' }))
  project.graph = { nodes: Object.fromEntries(nodes.map(n => [n.id, n])), nodeOrder: nodes.map(n => n.id), edges: Object.fromEntries(edges.map(e => [e.id, e])), edgeOrder: edges.map(e => e.id), viewport: { x: 40, y: 40, zoom: .15 } }
  return project
}
