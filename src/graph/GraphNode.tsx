import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { GraphNode } from '../data/types'
import { useProject } from '../store/useProject'
import { useGraph } from '../store/useGraph'
import { MAX_SIZE, MIN_SIZE, PRESETS, nodeSizeStep } from './model'
import type { FlowNode } from './flowTypes'
import styles from './Graph.module.css'

const beginResize = () => useGraph.getState().beginGesture()
const endResize = () => useGraph.getState().endGesture()
const handles = [
  { id: 'left', position: Position.Left }, { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top }, { id: 'bottom', position: Position.Bottom },
]

function NodeEditor({ node }: { node: GraphNode }) {
  const [title, setTitle] = useState(node.title)
  const [body, setBody] = useState(node.body)
  const titleInput = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => { titleInput.current?.focus(); titleInput.current?.select() }, [])
  const finish = (cancel = false) => {
    if (finished.current) return
    finished.current = true
    const current = useProject.getState().project.graph.nodes[node.id]
    if (!cancel && current) useGraph.getState().updateNodes([{ ...current, title: title.trim() || 'Untitled node', body }])
    useGraph.getState().setEditing(null)
  }
  return <div className={`${styles.nodeEditor} nodrag nopan nowheel`} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) finish() }} onKeyDown={e => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); finish(true) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish() }
  }} onDoubleClick={e => e.stopPropagation()}>
    <input ref={titleInput} aria-label="Node title" className={styles.titleInput} value={title} maxLength={500} onChange={e => setTitle(e.target.value)} />
    <textarea aria-label="Node body" className={styles.bodyInput} value={body} placeholder="Body (optional)" onChange={e => setBody(e.target.value)} />
    <span className={styles.editHint}>Click away to save · Esc to cancel</span>
  </div>
}

export const GraphNodeView = memo(function GraphNodeView({ id, selected }: NodeProps<FlowNode>) {
  const node = useProject(s => s.project.graph.nodes[id])
  const editing = useGraph(s => s.editing?.kind === 'node' && s.editing.id === id)
  const updateNodeInternals = useUpdateNodeInternals()
  // Presets, undo/import, and AI sizing can change geometry without a resize gesture.
  useLayoutEffect(() => { updateNodeInternals(id) }, [id, node?.width, node?.height, updateNodeInternals])
  if (!node) return null
  const step = nodeSizeStep(node)
  const scale = PRESETS[step]
  return <div className={styles.node} data-graph-node={id} data-size={step} style={{ '--title-size': `${scale.titleSize}px`, '--body-size': `${scale.bodySize}px`, '--node-padding': `${scale.padding}px` } as React.CSSProperties} onDoubleClick={e => {
    e.stopPropagation(); useGraph.getState().select([id]); useGraph.getState().setEditing({ kind: 'node', id })
  }}>
    <NodeResizer isVisible={selected && !editing} minWidth={MIN_SIZE.width} minHeight={MIN_SIZE.height} maxWidth={MAX_SIZE.width} maxHeight={MAX_SIZE.height} color="var(--accent)" handleClassName={styles.resizeHandle} lineClassName={styles.resizeLine} onResizeStart={beginResize} onResizeEnd={endResize} />
    {handles.map(handle => <Handle key={handle.id} id={handle.id} type="source" position={handle.position} className={styles.handle} aria-label={`${handle.id} connection handle`} />)}
    {editing ? <NodeEditor node={node} /> : <div className={`${styles.nodeContent} ${node.body ? styles.withBody : ''}`}><div className={`${styles.nodeTitle} nowheel`}>{node.title}</div>{node.body && <div className={`${styles.nodeBody} nowheel`}>{node.body}</div>}</div>}
  </div>
})
