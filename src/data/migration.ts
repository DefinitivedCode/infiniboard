import type { GraphEdge, GraphNode, Project, Viewport } from './types'

export type LegacyProject = Omit<Project, 'version' | 'graph'> & {
  version: 1
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; viewport: Viewport }
}

export function migrateProject(project: LegacyProject): Project {
  return {
    ...project,
    version: 2,
    graph: {
      nodes: Object.fromEntries(project.graph.nodes.map(node => [node.id, node])),
      nodeOrder: project.graph.nodes.map(node => node.id),
      edges: Object.fromEntries(project.graph.edges.map(edge => [edge.id, { ...edge, sourceHandle: edge.sourceHandle ?? 'right', targetHandle: edge.targetHandle ?? 'left' }])),
      edgeOrder: project.graph.edges.map(edge => edge.id),
      viewport: project.graph.viewport,
    },
  }
}
