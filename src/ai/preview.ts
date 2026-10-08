import type { Proposal } from './schema'

export function toggleSubtree(proposal: Proposal, checked: ReadonlySet<string>, id: string, include: boolean): Set<string> {
  const next = new Set(checked), pending = [id]
  const visited = new Set<string>()
  while (pending.length) {
    const current = pending.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    if (include) next.add(current); else next.delete(current)
    pending.push(...proposal.nodes.filter(n => n.parentId === current).map(n => n.id))
  }
  if (include) {
    let parent = proposal.nodes.find(n => n.id === id)?.parentId
    while (parent && proposal.nodes.some(n => n.id === parent) && !visited.has(parent)) {
      visited.add(parent); next.add(parent); parent = proposal.nodes.find(n => n.id === parent)?.parentId
    }
  }
  return next
}

export function checkedProposal(proposal: Proposal, checked: ReadonlySet<string>): Proposal {
  // Guard against orphaned descendants even if a caller supplied an inconsistent set.
  const ids = new Set(proposal.nodes.map(n => n.id))
  const kept = new Set<string>()
  const include = (id: string): boolean => {
    if (!checked.has(id)) return false
    if (kept.has(id)) return true
    const parent = proposal.nodes.find(n => n.id === id)?.parentId
    if (parent && ids.has(parent) && !include(parent)) return false
    kept.add(id); return true
  }
  const nodes = proposal.nodes.filter(n => include(n.id))
  return { ...proposal, nodes, links: proposal.links?.filter(l => kept.has(l.fromId) && kept.has(l.toId)) }
}

export function reparentProposal(proposal: Proposal, id: string, parentId: string | null, existingIds: ReadonlySet<string>): Proposal {
  const node = proposal.nodes.find(n => n.id === id)
  if (!node || (node.parentId !== null && !existingIds.has(node.parentId))) throw new Error('Only top-level additions can be placed.')
  if (parentId !== null && !existingIds.has(parentId)) throw new Error('The placement parent does not exist.')
  return { ...proposal, nodes: proposal.nodes.map(n => n.id === id ? { ...n, parentId, reason: 'Placement chosen by you', confidence: 'high' } : n) }
}

export function proposalSummary(proposal: Proposal, existingIds: ReadonlySet<string>) {
  const byId = new Map(proposal.nodes.map(n => [n.id, n]))
  let maxDepth = 0
  for (const n of proposal.nodes) {
    let depth = 0, parent = n.parentId
    while (parent && byId.has(parent)) { depth++; parent = byId.get(parent)!.parentId }
    maxDepth = Math.max(maxDepth, depth)
  }
  const top = proposal.nodes.filter(n => n.parentId === null || !byId.has(n.parentId))
  return { maxDepth, placed: top.filter(n => n.parentId && existingIds.has(n.parentId)).length, branches: top.filter(n => n.parentId === null || n.confidence === 'low').length }
}
