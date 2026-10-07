import type { Project } from '../data/types'
import { nodeSizeStep } from './model'

/** Plain text only: no credentials, layout metadata, or inferred relationships. */
export function graphContext(project: Pick<Project, 'title' | 'graph'>): string {
  const { graph } = project
  const ids = [...new Set([...graph.nodeOrder, ...Object.keys(graph.nodes).sort()])].filter(id => graph.nodes[id])
  const edges = [...new Set([...graph.edgeOrder, ...Object.keys(graph.edges).sort()])].map(id => graph.edges[id]).filter(Boolean)
  const incoming = new Set(edges.map(edge => edge.target))
  const children = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = children.get(edge.source) ?? []
    targets.push(edge.target)
    children.set(edge.source, targets)
  }
  const ordered: string[] = []
  const visited = new Set<string>()
  const visit = (start: string) => {
    const stack = [start]
    while (stack.length) {
      const id = stack.pop()!
      if (visited.has(id) || !graph.nodes[id]) continue
      visited.add(id); ordered.push(id)
      stack.push(...(children.get(id) ?? []).slice().reverse())
    }
  }
  // Traverse roots first; remaining components include isolated nodes and cycles.
  for (const id of ids) if (!incoming.has(id)) visit(id)
  for (const id of ids) visit(id)
  const refs = new Map(ordered.map((id, index) => [id, `N${index + 1}`]))
  const lines = ['GRAPH', project.title || 'Untitled project', '', 'NODES']
  for (const id of ordered) {
    const node = graph.nodes[id]
    lines.push('', `[${refs.get(id)}] ${node.title}`, `Importance/size: ${nodeSizeStep(node)}`)
    if (node.body) lines.push('Body:', ...node.body.replace(/\r\n?/g, '\n').split('\n').map(line => `  ${line}`))
  }
  if (!ordered.length) lines.push('(No nodes)')
  lines.push('', 'CONNECTIONS')
  for (const edge of edges) {
    const from = refs.get(edge.source), to = refs.get(edge.target)
    if (from && to) lines.push(`${from} -> ${to}${edge.label ? ` : ${edge.label.replace(/\r\n?/g, '\n').replace(/\n/g, '\n  ')}` : ''}`)
  }
  if (!edges.length) lines.push('(No connections)')
  return lines.join('\n')
}
