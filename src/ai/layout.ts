import type { GraphEdge, GraphNode, Project } from '../data/types'
import { IMPORTANCE_PRESETS } from '../graph/model'
import { fitNodeContent } from '../graph/contentSize'
import { chooseHandles, layoutTree } from '../graph/layout'
import type { Mode, Proposal } from './schema'

export { chooseHandles, RADIAL_THRESHOLD } from '../graph/layout'

export function restoreItems(proposal: Proposal, indices: ReadonlySet<number>, mode: Mode): Proposal {
  const restored = proposal.omitted.filter((_, i) => indices.has(i))
  if (!restored.length) return proposal
  const used = new Set(proposal.nodes.map(n => n.id))
  const nextId = () => { let id = ''; do { id = crypto.randomUUID() } while (used.has(id)); used.add(id); return id }
  const groupId = nextId()
  const parentId = mode.kind === 'expand' ? 'SELECTED' : proposal.nodes.find(n => n.parentId === null)!.id
  return { ...proposal, nodes: [...proposal.nodes,
    { id: groupId, parentId, title: 'Left out', body: '', importance: 1 },
    ...restored.map(item => ({ id: nextId(), parentId: groupId, title: item.text.trim().split(/\s+/u).slice(0, 8).join(' '), body: item.text, importance: 1 as const })),
  ] }
}

export function layoutProposal(proposal: Proposal, mode: Mode, graph: Project['graph'], snapping: boolean): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const selected = mode.kind === 'expand' ? graph.nodes[mode.selectedId] : undefined
  if (mode.kind === 'expand' && !selected) throw new Error('The selected node was removed. Discard this preview and generate again.')
  const ids = new Map(proposal.nodes.map(n => [n.id, crypto.randomUUID()]))
  const models: GraphNode[] = proposal.nodes.map(n => ({
    id: ids.get(n.id)!, title: n.title, body: n.body ?? '', importance: n.parentId === null ? 4 : n.importance, x: 0, y: 0,
    ...fitNodeContent(n.title, n.body ?? '', IMPORTANCE_PRESETS[n.parentId === null ? 4 : n.importance]),
  }))
  const parents = new Map(proposal.nodes.map(n => [ids.get(n.id)!, n.parentId === null ? null : n.parentId === 'SELECTED' ? selected!.id : ids.get(n.parentId)!]))
  const existing = graph.nodeOrder.map(id => graph.nodes[id])
  let direction = 0
  if (selected) {
    const center = (n: GraphNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })
    const origin = center(selected)
    const incoming = graph.edgeOrder.map(id => graph.edges[id]).find(e => e.target === selected.id && graph.nodes[e.source])
    const neighbours = existing.filter(n => n.id !== selected.id)
    const from = incoming ? center(graph.nodes[incoming.source]) : neighbours.length ? {
      x: neighbours.reduce((sum, n) => sum + center(n).x, 0) / neighbours.length,
      y: neighbours.reduce((sum, n) => sum + center(n).y, 0) / neighbours.length,
    } : undefined
    if (from) direction = Math.atan2(origin.y - from.y, origin.x - from.x)
  }
  const nodes = layoutTree(models, parents, snapping, existing, selected, direction)
  const positioned = new Map(nodes.map(n => [n.id, n]))
  if (selected) positioned.set(selected.id, selected)
  const edge = (source: string, target: string, label = ''): GraphEdge => ({ id: crypto.randomUUID(), source, target, ...chooseHandles(positioned.get(source)!, positioned.get(target)!), label })
  const edges = proposal.nodes.flatMap(n => n.parentId === null ? [] : [edge(n.parentId === 'SELECTED' ? selected!.id : ids.get(n.parentId)!, ids.get(n.id)!)])
  edges.push(...(proposal.links ?? []).map(link => edge(ids.get(link.fromId)!, ids.get(link.toId)!, link.label ?? '')))
  return { nodes, edges }
}
