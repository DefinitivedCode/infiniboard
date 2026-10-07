import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { ConnectionMode, ReactFlow, ReactFlowProvider, SelectionMode, getViewportForBounds, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import type { Connection, NodeTypes, OnMove } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useProject } from '../store/useProject'
import { useGraph } from '../store/useGraph'
import { GRID, snap } from '../board/geometry'
import type { BoardApi } from '../board/Board'
import { createNode } from './model'
import { nodeBounds } from './organize'
import type { Preset } from './model'
import { createFlowAdapters, RECONNECT_RADIUS } from './flowTypes'
import type { FlowEdge, FlowNode } from './flowTypes'
import { GraphNodeView } from './GraphNode'
import { ConnectionPreview, GraphEdgeView } from './GraphEdge'
import { Grid } from './Grid'
import { ignoreShortcut } from '../app/keyboard'
import { GraphInspector, GraphToolbar } from './GraphChrome'
import { Assistant } from '../ai/Assistant'
import type { AssistantProps } from '../ai/Assistant'
import styles from './Graph.module.css'

const nodeTypes = { idea: GraphNodeView }
const edgeTypes = { connection: GraphEdgeView }
const snapGrid: [number, number] = [GRID, GRID]
const panButtons = [1, 2]
const onNodesChange = useGraph.getState().applyNodeChanges
const onEdgesChange = useGraph.getState().applyEdgeChanges
const onConnect = useGraph.getState().connect
const beginGesture = () => useGraph.getState().beginGesture()
const endGesture = () => useGraph.getState().endGesture()
const reconnect = (edge: FlowEdge, connection: Connection) => useGraph.getState().reconnect(edge.id, connection)
const onMoveEnd: OnMove = (_, viewport) => useGraph.getState().setViewport(viewport)
const validConnection = (connection: Connection | FlowEdge) => useGraph.getState().validConnection({ source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? null, targetHandle: connection.targetHandle ?? null })
const editEdge = (_: unknown, edge: FlowEdge) => { useGraph.getState().select([], [edge.id]); useGraph.getState().setEditing({ kind: 'edge', id: edge.id }) }

// Optional type injection is used by the development performance fixture to count actual renders.
type GraphProps = { nodeTypes?: NodeTypes; assistant?: boolean; assistantProps?: AssistantProps }
export type GraphApi = BoardApi & { organize: () => void }

const GraphCanvas = forwardRef<GraphApi, GraphProps>(function GraphCanvas({ nodeTypes: suppliedTypes = nodeTypes }, ref) {
  const models = useProject(s => s.project.graph.nodes)
  const nodeOrder = useProject(s => s.project.graph.nodeOrder)
  const edgeModels = useProject(s => s.project.graph.edges)
  const edgeOrder = useProject(s => s.project.graph.edgeOrder)
  const snapping = useProject(s => s.project.settings.snap)
  const selectedNodes = useGraph(s => s.selectedNodes)
  const selectedEdges = useGraph(s => s.selectedEdges)
  const tool = useGraph(s => s.tool)
  const adapters = useRef(createFlowAdapters())
  const nodes = useMemo(() => adapters.current.nodes(models, nodeOrder, selectedNodes), [models, nodeOrder, selectedNodes])
  const edges = useMemo(() => adapters.current.edges(edgeModels, edgeOrder, selectedEdges), [edgeModels, edgeOrder, selectedEdges])
  const defaultViewport = useRef(useProject.getState().project.graph.viewport)
  const stage = useRef<HTMLDivElement>(null)
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const updateNodeInternals = useUpdateNodeInternals()
  const latestViewport = useRef(defaultViewport.current)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onMove = useCallback<OnMove>((_, viewport) => {
    latestViewport.current = viewport
    clearTimeout(timer.current)
    timer.current = setTimeout(() => useGraph.getState().setViewport(viewport), 120)
  }, [])
  const zoom = useCallback((factor: number, absolute?: number) => {
    void flow.zoomTo(absolute ?? flow.getZoom() * factor).then(() => useGraph.getState().setViewport(flow.getViewport()))
  }, [flow])
  const fit = useCallback(() => {
    const s = useGraph.getState()
    const ids = s.selectedNodes.length ? s.selectedNodes : useProject.getState().project.graph.nodeOrder
    if (!ids.length) { void flow.setViewport({ x: 0, y: 0, zoom: 1 }).then(() => s.setViewport(flow.getViewport())); return }
    void flow.fitView({ nodes: ids.map(id => ({ id })), padding: .2, minZoom: .1, maxZoom: 2 }).then(() => s.setViewport(flow.getViewport()))
  }, [flow])
  const organize = useCallback(() => {
    if (!useProject.getState().project.graph.nodeOrder.length) return
    flushSync(() => useGraph.getState().organize())
    const graph = useProject.getState().project.graph
    updateNodeInternals(graph.nodeOrder)
    // Fit explicit, newly committed bounds rather than a previous React Flow snapshot
    // or just the current selection. Moving and zooming remain available immediately.
    const rect = stage.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = getViewportForBounds(nodeBounds(graph.nodeOrder.map(id => graph.nodes[id])), rect.width, rect.height, .1, 2, .2)
    void flow.setViewport(viewport).then(() => {
      latestViewport.current = flow.getViewport()
      useGraph.getState().setViewport(latestViewport.current)
    })
  }, [flow, updateNodeInternals])
  const addAtCenter = useCallback(() => {
    const rect = stage.current?.getBoundingClientRect()
    if (!rect) return
    const point = flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    const node = createNode({ x: point.x - 144, y: point.y - 96 }, useProject.getState().project.settings.snap)
    useGraph.getState().addNodes([node])
    useGraph.getState().setEditing({ kind: 'node', id: node.id })
  }, [flow])
  useImperativeHandle(ref, () => ({ zoom, fit, organize, resetZoom: () => zoom(1, 1), flushViewport: () => useGraph.getState().setViewport(flow.getViewport()) }), [zoom, fit, organize, flow])

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return
      const s = useGraph.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (e.code === 'Space') { e.preventDefault(); return }
      if (key === 'escape') { s.endGesture(true); s.select([]); s.setEditing(null); s.setTool('select'); return }
      if (s.gesture) return
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if (mod && key === 'y') { e.preventDefault(); s.redo(); return }
      if (mod && key === 'a') { e.preventDefault(); const graph = useProject.getState().project.graph; s.select(graph.nodeOrder, graph.edgeOrder); return }
      if (mod && key === 'd') { e.preventDefault(); s.duplicateSelected(); return }
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); s.deleteSelected(); return }
      if (key === 'enter') {
        e.preventDefault()
        if (s.selectedNodes.length === 1 && !s.selectedEdges.length) s.setEditing({ kind: 'node', id: s.selectedNodes[0] })
        else if (s.selectedEdges.length === 1 && !s.selectedNodes.length) s.setEditing({ kind: 'edge', id: s.selectedEdges[0] })
        return
      }
      if (key.startsWith('arrow') && s.selectedNodes.length) {
        e.preventDefault()
        const project = useProject.getState().project
        const step = project.settings.snap ? GRID : e.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        s.updateNodes(s.selectedNodes.map(id => ({ ...project.graph.nodes[id], x: snap(project.graph.nodes[id].x + dx, project.settings.snap), y: snap(project.graph.nodes[id].y + dy, project.settings.snap) })))
        return
      }
      if (mod || e.altKey) return
      if (key === 'n') { e.preventDefault(); addAtCenter() }
      if (key === 'v') s.setTool('select')
      if (key === 'h') s.setTool('hand')
      if (key === 'g') { e.preventDefault(); useProject.getState().toggleSnap() }
      if (key === 'f') { e.preventDefault(); fit() }
      if (key === '+' || key === '=') { e.preventDefault(); zoom(1.2) }
      if (key === '-') { e.preventDefault(); zoom(1 / 1.2) }
      if (key === '0') { e.preventDefault(); zoom(1, 1) }
      const presets: Record<string, Preset> = { '1': 'S', '2': 'M', '3': 'L', '4': 'XL' }
      if (presets[key]) { e.preventDefault(); s.preset(presets[key]) }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('keydown', keydown)
      clearTimeout(timer.current)
      useGraph.getState().endGesture()
      useGraph.getState().setViewport(latestViewport.current)
    }
  }, [addAtCenter, fit, zoom])

  return <div ref={stage} className={styles.stage} aria-label="Graph canvas" tabIndex={0} onPointerDownCapture={e => {
    if ((e.target as HTMLElement).closest('input, textarea, button')) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    stage.current?.focus({ preventScroll: true })
  }} onDoubleClick={e => {
    if (!(e.target as HTMLElement).closest('.react-flow__pane')) return
    const node = createNode(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }), useProject.getState().project.settings.snap)
    useGraph.getState().addNodes([node]); useGraph.getState().setEditing({ kind: 'node', id: node.id })
  }}>
    <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={suppliedTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={reconnect}
      onNodeDragStart={beginGesture} onNodeDragStop={endGesture} onSelectionDragStart={beginGesture} onSelectionDragStop={endGesture}
      onMove={onMove} onMoveEnd={onMoveEnd} onEdgeDoubleClick={editEdge} isValidConnection={validConnection}
      defaultViewport={defaultViewport.current} minZoom={.1} maxZoom={4} snapToGrid={snapping} snapGrid={snapGrid}
      connectionMode={ConnectionMode.Loose} connectionLineComponent={ConnectionPreview} reconnectRadius={RECONNECT_RADIUS}
      selectionOnDrag={tool === 'select'} selectionMode={SelectionMode.Partial} selectionKeyCode="Shift" multiSelectionKeyCode="Shift"
      panActivationKeyCode="Space" panOnDrag={tool === 'hand' ? true : panButtons} panOnScroll={false}
      zoomOnScroll zoomActivationKeyCode={null} zoomOnDoubleClick={false} zoomOnPinch
      nodesDraggable={tool === 'select'} nodesConnectable={tool === 'select'} elementsSelectable={tool === 'select'} elevateEdgesOnSelect
      deleteKeyCode={null} disableKeyboardA11y autoPanOnNodeDrag={false} autoPanOnSelection={false}>
      <Grid visible={snapping} />
    </ReactFlow>
    {!nodeOrder.length && <div className={styles.empty}><span>02 / Graph</span><p>Add a node.</p><small>Double-click the canvas or press N.<br />Drag between square handles to connect nodes.</small></div>}
    <GraphToolbar addNode={addAtCenter} /><GraphInspector />
  </div>
})

export const Graph = forwardRef<GraphApi, GraphProps>(function Graph(props, ref) {
  return <ReactFlowProvider><GraphCanvas nodeTypes={props.nodeTypes} ref={ref} />{props.assistant !== false && <Assistant {...props.assistantProps} />}</ReactFlowProvider>
})
