import type { GraphNode, Project } from '../data/types'
import { GRID } from '../board/geometry'
import { chooseHandles, layoutTree } from './layout'

type Graph = Project['graph']
export function nodeBounds(nodes: GraphNode[]) {
  const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y))
  return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) - x, height: Math.max(...nodes.map(n => n.y + n.height)) - y }
}

export function organizeGraph(graph: Graph, snapping: boolean): Graph {
  if (!graph.nodeOrder.length) return graph
  const parents = new Map<string, string | null>(graph.nodeOrder.map(id => [id, null]))
  // Keep the first available incoming edge as a placement parent. Cross-links and
  // cycle-closing edges remain in the graph, but cannot give a card a second parent.
  for (const id of graph.edgeOrder) {
    const e = graph.edges[id]
    if (!parents.has(e.source) || !parents.has(e.target) || parents.get(e.target) !== null) continue
    let ancestor: string | null = e.source
    while (ancestor !== null && ancestor !== e.target) ancestor = parents.get(ancestor) ?? null
    if (ancestor !== e.target) parents.set(e.target, e.source)
  }
  const children = new Map<string, string[]>()
  for (const [id, parent] of parents) if (parent !== null) children.set(parent, [...(children.get(parent) ?? []), id])
  const groups = graph.nodeOrder.filter(id => parents.get(id) === null).map(root => {
    const models: GraphNode[] = [], pending = [root]
    while (pending.length) {
      const id = pending.pop()!
      models.push(graph.nodes[id]); pending.push(...(children.get(id) ?? []).slice().reverse())
    }
    return layoutTree(models, parents, snapping)
  })
  // Pack disconnected trees into rows instead of making one excessively wide strip.
  if (groups.length > 1) {
    const bounds = groups.map(nodeBounds), gap = 144
    const rowWidth = Math.max(...bounds.map(b => b.width), Math.sqrt(bounds.reduce((area, b) => area + (b.width + gap) * (b.height + gap), 0)))
    const ceil = (value: number) => snapping ? Math.ceil(value / GRID) * GRID : value
    let x = 0, y = 0, rowHeight = 0
    groups.forEach((nodes, i) => {
      const b = bounds[i]
      if (x && x + b.width > rowWidth) { x = 0; y = ceil(y + rowHeight + gap); rowHeight = 0 }
      const dx = ceil(x - b.x), dy = ceil(y - b.y)
      nodes.forEach(n => { n.x += dx; n.y += dy })
      x = ceil(b.x + dx + b.width + gap)
      rowHeight = Math.max(rowHeight, b.y + dy + b.height - y)
    })
  }
  const nodes = { ...graph.nodes }, edges = { ...graph.edges }
  let changed = false
  for (const n of groups.flat()) {
    const old = graph.nodes[n.id]
    if (old.x !== n.x || old.y !== n.y) { nodes[n.id] = n; changed = true }
  }
  for (const id of graph.edgeOrder) {
    const e = graph.edges[id], handles = chooseHandles(nodes[e.source], nodes[e.target])
    if (e.sourceHandle !== handles.sourceHandle || e.targetHandle !== handles.targetHandle) { edges[id] = { ...e, ...handles }; changed = true }
  }
  return changed ? { ...graph, nodes, edges } : graph
}
