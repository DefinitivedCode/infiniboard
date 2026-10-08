import type { Project } from '../data/types'
import type { Mode } from './schema'

export type Scope = 'whole' | 'branch'
export type ContextNode = { id: string; parentId: string | null; depth?: number; title: string; body?: string }
export const CONTEXT_TOKEN_LIMIT = 60000

// A graph can have cross-links and cycles. Pick the first incoming tree edge and
// traverse iteratively with visited sets rather than assuming a saved map is a tree.
export function compactContext(graph: Project['graph'], selectedId?: string): ContextNode[] {
  const parents = new Map<string, string>()
  const children = new Map<string, string[]>()
  for (const id of graph.edgeOrder) {
    const edge = graph.edges[id]
    if (!graph.nodes[edge.source] || !graph.nodes[edge.target] || parents.has(edge.target)) continue
    parents.set(edge.target, edge.source)
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target])
  }
  const included = new Set<string>()
  if (selectedId && graph.nodes[selectedId]) {
    const pending = [selectedId]
    while (pending.length) {
      const id = pending.pop()!
      if (included.has(id)) continue
      included.add(id); pending.push(...(children.get(id) ?? []))
    }
  } else if (!selectedId) graph.nodeOrder.forEach(id => included.add(id))
  const depths = new Map<string, number>()
  for (const id of included) {
    const path: string[] = [], seen = new Set<string>()
    let current: string | undefined = id
    while (current && included.has(current) && !depths.has(current) && !seen.has(current)) {
      path.push(current); seen.add(current); current = parents.get(current)
    }
    let depth = current && depths.has(current) ? depths.get(current)! + 1 : 0
    for (const part of path.reverse()) depths.set(part, depth++)
  }
  const nodes = graph.nodeOrder.filter(id => included.has(id)).map(id => {
    const n = graph.nodes[id], parent = parents.get(id)
    return { id, parentId: parent && included.has(parent) ? parent : null, depth: depths.get(id) ?? 0, title: n.title, body: n.body.slice(0, 160) }
  })
  return JSON.stringify(nodes).length / 4 > CONTEXT_TOKEN_LIMIT ? nodes.map(({ id, parentId, title }) => ({ id, parentId, title })) : nodes
}

export function makeMode(kind: Mode['kind'], graph: Project['graph'], selectedId?: string, scope: Scope = 'whole'): Mode {
  if (kind === 'build') return { kind }
  if (kind === 'expand') {
    const node = selectedId ? graph.nodes[selectedId] : undefined
    if (!node) throw new Error('Select one node for Under selected.')
    return { kind, selectedId: node.id, title: node.title, body: node.body, context: compactContext(graph, node.id) }
  }
  if (scope === 'branch' && (!selectedId || !graph.nodes[selectedId])) throw new Error('Select one node for Selected branch scope.')
  return { kind, context: compactContext(graph, scope === 'branch' ? selectedId : undefined) }
}

export function defaultMode(nodeCount: number, selectedCount: number): Mode['kind'] {
  return nodeCount === 0 ? 'build' : selectedCount === 1 ? 'expand' : 'place'
}
