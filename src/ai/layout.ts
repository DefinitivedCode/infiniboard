import type { GraphEdge, GraphNode, Project } from '../data/types'
import { IMPORTANCE_PRESETS } from '../graph/model'
import { fitNodeContent } from '../graph/contentSize'
import { chooseHandles, layoutTree } from '../graph/layout'
import type { Mode, Proposal } from './schema'

export { chooseHandles, RADIAL_THRESHOLD } from '../graph/layout'

export function restoreItems(proposal: Proposal, indices: ReadonlySet<number>, mode: Mode): Proposal {
  const restored = proposal.omitted.filter((_, i) => indices.has(i))
  if (!restored.length) return proposal
  const used = new Set([...proposal.nodes.map(n => n.id), ...(mode.kind === 'build' ? [] : mode.context?.map(n => n.id) ?? [])])
  let index = 0
  const nextId = () => { let id = ''; do { id = `restored-${index++}` } while (used.has(id)); used.add(id); return id }
  const groupId = nextId()
  const parentId = mode.kind === 'expand' ? 'SELECTED' : proposal.nodes.find(n => n.parentId === null)?.id ?? (mode.kind === 'place' ? mode.context.find(n => n.parentId === null)?.id ?? null : null)
  return { ...proposal, nodes: [...proposal.nodes,
    { id: groupId, parentId, title: 'Left out', body: '', importance: 1, reason: 'Restored by you', confidence: 'low' },
    ...proposal.omitted.flatMap((item, i) => {
      const id = nextId()
      return indices.has(i) ? [{ id, parentId: groupId, title: item.text.trim().split(/\s+/u).slice(0, 8).join(' '), body: item.text, importance: 1 as const, reason: 'Restored by you', confidence: 'low' as const }] : []
    }),
  ] }
}

export function layoutProposal(proposal: Proposal, mode: Mode, graph: Project['graph'], snapping: boolean): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const selected = mode.kind === 'expand' ? graph.nodes[mode.selectedId] : undefined
  if (mode.kind === 'expand' && !selected) throw new Error('The selected node was removed. Discard this preview and generate again.')
  const ids = new Map<string, string>(proposal.nodes.map(n => [n.id, crypto.randomUUID()]))
  const models: GraphNode[] = proposal.nodes.map(n => ({
    id: ids.get(n.id)!, title: n.title, body: n.body ?? '', importance: n.parentId === null ? 4 : n.importance, x: 0, y: 0,
    ...fitNodeContent(n.title, n.body ?? '', IMPORTANCE_PRESETS[n.parentId === null ? 4 : n.importance]),
  }))
  const resolveParent = (id: string | null) => id === null ? null : mode.kind === 'expand' && id === 'SELECTED' ? selected!.id : ids.get(id) ?? id
  const parents = new Map(proposal.nodes.map(n => [ids.get(n.id)!, resolveParent(n.parentId)]))
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
  let nodes: GraphNode[]
  if (mode.kind === 'place') {
    // Each external parent is an anchor; later groups avoid every earlier group.
    // Neither the stored graph nor its positions are ever modified.
    proposal.nodes.forEach(n => parents.set(ids.get(n.id)!, n.parentId === null ? null : ids.get(n.parentId) ?? n.parentId))
    const anchors = [...new Set(proposal.nodes.filter(n => n.parentId === null || !ids.has(n.parentId)).map(n => n.parentId))]
    nodes = []
    for (const anchorId of anchors) {
      const anchor = anchorId ? graph.nodes[anchorId] : undefined
      if (anchorId && !anchor) throw new Error('An attachment node was removed.')
      const groupIds = new Set<string>(proposal.nodes.filter(n => n.parentId === anchorId).map(n => ids.get(n.id)!))
      let changed = true
      while (changed) {
        changed = false
        for (const n of models) if (!groupIds.has(n.id) && groupIds.has(parents.get(n.id)!)) { groupIds.add(n.id); changed = true }
      }
      const group = models.filter(n => groupIds.has(n.id))
      if (anchor) {
        const incoming = graph.edgeOrder.map(id => graph.edges[id]).find(e => e.target === anchor.id && graph.nodes[e.source])
        const from = incoming ? graph.nodes[incoming.source] : undefined
        const angle = from ? Math.atan2(anchor.y + anchor.height / 2 - from.y - from.height / 2, anchor.x + anchor.width / 2 - from.x - from.width / 2) : 0
        nodes.push(...layoutTree(group, parents, snapping, [...existing, ...nodes], anchor, angle))
      } else {
        // layoutTree builds one standalone root at a time.
        for (const root of proposal.nodes.filter(n => n.parentId === null)) {
          const branch = new Set<string>([ids.get(root.id)!])
          let added = true
          while (added) { added = false; for (const n of group) if (!branch.has(n.id) && branch.has(parents.get(n.id)!)) { branch.add(n.id); added = true } }
          nodes.push(...layoutTree(group.filter(n => branch.has(n.id)), parents, snapping, [...existing, ...nodes]))
        }
      }
    }
  } else {
    if (mode.kind === 'expand') proposal.nodes.forEach(n => { if (n.parentId === mode.selectedId) parents.set(ids.get(n.id)!, mode.selectedId) })
    nodes = layoutTree(models, parents, snapping, existing, selected, direction)
  }
  const positioned = new Map(nodes.map(n => [n.id, n]))
  existing.forEach(n => positioned.set(n.id, n))
  const edge = (source: string, target: string, label = ''): GraphEdge => ({ id: crypto.randomUUID(), source, target, ...chooseHandles(positioned.get(source)!, positioned.get(target)!), label })
  const edges = proposal.nodes.flatMap(n => n.parentId === null ? [] : [edge(resolveParent(n.parentId)!, ids.get(n.id)!)])
  edges.push(...(proposal.links ?? []).map(link => edge(ids.get(link.fromId)!, ids.get(link.toId)!, link.label ?? '')))
  return { nodes, edges }
}
