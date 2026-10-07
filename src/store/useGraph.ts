import { create } from 'zustand'
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react'
import type { GraphEdge, GraphNode, Project, Viewport } from '../data/types'
import { useProject } from './useProject'
import { clampNode } from '../graph/model'
import { fitNodeContent } from '../graph/contentSize'
import { organizeGraph } from '../graph/organize'
import type { Preset } from '../graph/model'

type Graph = Project['graph']
type Snapshot = Omit<Graph, 'viewport'>
type Editing = { kind: 'node' | 'edge'; id: string } | null
const snapshot = (): Snapshot => {
  const { nodes, edges, nodeOrder, edgeOrder } = useProject.getState().project.graph
  return { nodes, edges, nodeOrder, edgeOrder }
}
const history = (past: Snapshot[], entry: Snapshot) => [...past.slice(-99), entry]

interface GraphState {
  selectedNodes: string[]
  selectedEdges: string[]
  editing: Editing
  tool: 'select' | 'hand'
  past: Snapshot[]
  future: Snapshot[]
  gesture: Snapshot | null
  select: (nodes: string[], edges?: string[]) => void
  setEditing: (editing: Editing) => void
  setTool: (tool: GraphState['tool']) => void
  setViewport: (viewport: Viewport) => void
  addNodes: (nodes: GraphNode[], edges?: GraphEdge[]) => void
  updateNodes: (nodes: GraphNode[], historical?: boolean) => void
  updateEdge: (edge: GraphEdge) => void
  connect: (connection: Connection) => void
  reconnect: (id: string, connection: Connection) => void
  validConnection: (connection: Connection | GraphEdge, except?: string) => boolean
  applyNodeChanges: (changes: NodeChange[]) => void
  applyEdgeChanges: (changes: EdgeChange[]) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  preset: (size: Preset) => void
  organize: () => void
  beginGesture: () => void
  endGesture: (cancel?: boolean) => void
  undo: () => void
  redo: () => void
}

function writeGraph(graph: Graph, historical = true) {
  const project = useProject.getState().project
  if (graph === project.graph) return
  const state = useGraph.getState()
  if (historical) useGraph.setState({ past: history(state.past, snapshot()), future: [] })
  useProject.setState({ project: { ...project, graph, updatedAt: Date.now() } })
}

export const useGraph = create<GraphState>((set, get) => ({
  selectedNodes: [], selectedEdges: [], editing: null, tool: 'select', past: [], future: [], gesture: null,
  select: (selectedNodes, selectedEdges = []) => set(s => {
    if (s.selectedNodes.join(',') === selectedNodes.join(',') && s.selectedEdges.join(',') === selectedEdges.join(',')) return s
    return { selectedNodes, selectedEdges }
  }),
  setEditing: editing => set({ editing }),
  setTool: tool => set({ tool }),
  setViewport: viewport => {
    const project = useProject.getState().project
    const before = project.graph.viewport
    if (before.x === viewport.x && before.y === viewport.y && before.zoom === viewport.zoom) return
    writeGraph({ ...project.graph, viewport }, false)
  },
  addNodes: (additions, edgeAdditions = []) => {
    const graph = useProject.getState().project.graph
    const nodes = { ...graph.nodes }
    const edges = { ...graph.edges }
    additions.forEach(node => { nodes[node.id] = clampNode(node) })
    edgeAdditions.forEach(edge => { edges[edge.id] = edge })
    writeGraph({ ...graph, nodes, edges, nodeOrder: [...graph.nodeOrder, ...additions.map(n => n.id)], edgeOrder: [...graph.edgeOrder, ...edgeAdditions.map(e => e.id)] })
    get().select(additions.map(n => n.id))
  },
  updateNodes: (updates, historical = true) => {
    const graph = useProject.getState().project.graph
    const nodes = { ...graph.nodes }
    let changed = false
    updates.forEach(update => {
      const previous = nodes[update.id]
      if (!previous) return
      const next = clampNode(update)
      if (previous.x === next.x && previous.y === next.y && previous.width === next.width && previous.height === next.height && previous.title === next.title && previous.body === next.body && previous.importance === next.importance) return
      nodes[update.id] = next; changed = true
    })
    if (changed) writeGraph({ ...graph, nodes }, historical)
  },
  updateEdge: edge => {
    const graph = useProject.getState().project.graph
    const previous = graph.edges[edge.id]
    if (!previous || JSON.stringify(previous) === JSON.stringify(edge)) return
    writeGraph({ ...graph, edges: { ...graph.edges, [edge.id]: edge } })
  },
  validConnection: (connection, except) => {
    const graph = useProject.getState().project.graph
    if (!graph.nodes[connection.source] || !graph.nodes[connection.target] || connection.source === connection.target) return false
    return !graph.edgeOrder.some(id => {
      const e = graph.edges[id]
      return id !== except && e.source === connection.source && e.target === connection.target && e.sourceHandle === (connection.sourceHandle ?? undefined) && e.targetHandle === (connection.targetHandle ?? undefined)
    })
  },
  connect: connection => {
    if (!get().validConnection(connection)) return
    const graph = useProject.getState().project.graph
    const edge: GraphEdge = { id: crypto.randomUUID(), source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? undefined, targetHandle: connection.targetHandle ?? undefined, label: '' }
    writeGraph({ ...graph, edges: { ...graph.edges, [edge.id]: edge }, edgeOrder: [...graph.edgeOrder, edge.id] })
    get().select([], [edge.id])
  },
  reconnect: (id, connection) => {
    const edge = useProject.getState().project.graph.edges[id]
    if (!edge || !get().validConnection(connection, id)) return
    get().updateEdge({ ...edge, source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? undefined, targetHandle: connection.targetHandle ?? undefined })
  },
  applyNodeChanges: changes => {
    const graph = useProject.getState().project.graph
    const updates = new Map<string, GraphNode>()
    const selected = new Set(get().selectedNodes)
    for (const change of changes) {
      if (change.type === 'select') { if (change.selected) selected.add(change.id); else selected.delete(change.id) }
      const node = 'id' in change ? updates.get(change.id) ?? graph.nodes[change.id] : undefined
      if (!node) continue
      if (change.type === 'position' && change.position) updates.set(node.id, { ...node, x: change.position.x, y: change.position.y })
      if (change.type === 'dimensions' && change.dimensions && (change.resizing || change.setAttributes)) updates.set(node.id, { ...node, width: change.dimensions.width, height: change.dimensions.height })
    }
    get().select([...selected], get().selectedEdges)
    if (updates.size) get().updateNodes([...updates.values()], !get().gesture)
  },
  applyEdgeChanges: changes => {
    const selected = new Set(get().selectedEdges)
    changes.forEach(change => { if (change.type === 'select') { if (change.selected) selected.add(change.id); else selected.delete(change.id) } })
    get().select(get().selectedNodes, [...selected])
  },
  deleteSelected: () => {
    const graph = useProject.getState().project.graph
    const nodeIds = new Set(get().selectedNodes)
    const edgeIds = new Set(get().selectedEdges)
    if (!nodeIds.size && !edgeIds.size) return
    const nodes = { ...graph.nodes }
    nodeIds.forEach(id => { delete nodes[id] })
    const edgeOrder = graph.edgeOrder.filter(id => !edgeIds.has(id) && !nodeIds.has(graph.edges[id].source) && !nodeIds.has(graph.edges[id].target))
    const edges = Object.fromEntries(edgeOrder.map(id => [id, graph.edges[id]]))
    writeGraph({ ...graph, nodes, nodeOrder: graph.nodeOrder.filter(id => !nodeIds.has(id)), edges, edgeOrder })
    set({ selectedNodes: [], selectedEdges: [], editing: null })
  },
  duplicateSelected: () => {
    const graph = useProject.getState().project.graph
    const ids = new Map(get().selectedNodes.map(id => [id, crypto.randomUUID()]))
    if (!ids.size) return
    const nodes = [...ids].map(([id, next]) => ({ ...graph.nodes[id], id: next, x: graph.nodes[id].x + 24, y: graph.nodes[id].y + 24 }))
    const edges = graph.edgeOrder.flatMap(id => {
      const edge = graph.edges[id]
      return ids.has(edge.source) && ids.has(edge.target) ? [{ ...edge, id: crypto.randomUUID(), source: ids.get(edge.source)!, target: ids.get(edge.target)! }] : []
    })
    get().addNodes(nodes, edges)
  },
  preset: size => {
    const graph = useProject.getState().project.graph
    const importance = ({ S: 1, M: 2, L: 3, XL: 4 } as const)[size]
    get().updateNodes(get().selectedNodes.flatMap(id => {
      const node = graph.nodes[id]
      return node ? [{ ...node, importance, ...fitNodeContent(node.title, node.body, size) }] : []
    }))
  },
  organize: () => {
    const project = useProject.getState().project
    writeGraph(organizeGraph(project.graph, project.settings.snap))
  },
  beginGesture: () => { if (!get().gesture) set({ gesture: snapshot() }) },
  endGesture: (cancel = false) => {
    const state = get()
    if (!state.gesture) return
    const graph = useProject.getState().project.graph
    const changed = state.gesture.nodes !== graph.nodes || state.gesture.edges !== graph.edges
    if (cancel && changed) writeGraph({ ...graph, ...state.gesture }, false)
    set({ gesture: null, ...(!cancel && changed ? { past: history(state.past, state.gesture), future: [] } : {}) })
  },
  undo: () => {
    const state = get()
    const entry = state.past.at(-1)
    if (!entry) return
    const current = snapshot()
    writeGraph({ ...useProject.getState().project.graph, ...entry }, false)
    set({ past: state.past.slice(0, -1), future: [...state.future, current], selectedNodes: state.selectedNodes.filter(id => entry.nodes[id]), selectedEdges: state.selectedEdges.filter(id => entry.edges[id]), editing: null })
  },
  redo: () => {
    const state = get()
    const entry = state.future.at(-1)
    if (!entry) return
    const current = snapshot()
    writeGraph({ ...useProject.getState().project.graph, ...entry }, false)
    set({ past: history(state.past, current), future: state.future.slice(0, -1), selectedNodes: state.selectedNodes.filter(id => entry.nodes[id]), selectedEdges: state.selectedEdges.filter(id => entry.edges[id]), editing: null })
  },
}))
