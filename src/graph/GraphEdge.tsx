import { memo, useEffect, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from '@xyflow/react'
import type { ConnectionLineComponentProps, EdgeProps } from '@xyflow/react'
import { useProject } from '../store/useProject'
import { useGraph } from '../store/useGraph'
import type { FlowEdge } from './flowTypes'
import { RECONNECT_RADIUS } from './flowTypes'
import styles from './Graph.module.css'

// React Flow's endpoint hit areas sit outward from the port. Match the visible rings to them.
const endpoint = (x: number, y: number, position: Position) => ({
  x: x + (position === Position.Left ? -RECONNECT_RADIUS : position === Position.Right ? RECONNECT_RADIUS : 0),
  y: y + (position === Position.Top ? -RECONNECT_RADIUS : position === Position.Bottom ? RECONNECT_RADIUS : 0),
})

function LabelEditor({ id, label }: { id: string; label: string }) {
  const [value, setValue] = useState(label)
  const input = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  const finish = (cancel = false) => {
    if (finished.current) return
    finished.current = true
    const edge = useProject.getState().project.graph.edges[id]
    if (!cancel && edge) useGraph.getState().updateEdge({ ...edge, label: value.trim() })
    useGraph.getState().setEditing(null)
  }
  return <input ref={input} className={styles.labelInput} aria-label="Edge label" maxLength={120} value={value} placeholder="Label (optional)" onChange={e => setValue(e.target.value)} onBlur={() => finish()} onKeyDown={e => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); finish(true) }
    if (e.key === 'Enter') { e.preventDefault(); finish() }
  }} />
}

export const GraphEdgeView = memo(function GraphEdgeView(props: EdgeProps<FlowEdge>) {
  const { id, selected } = props
  const edge = useProject(s => s.project.graph.edges[id])
  const editing = useGraph(s => s.editing?.kind === 'edge' && s.editing.id === id)
  const [path, x, y] = getBezierPath(props)
  const source = endpoint(props.sourceX, props.sourceY, props.sourcePosition)
  const target = endpoint(props.targetX, props.targetY, props.targetPosition)
  if (!edge) return null
  const edit = () => { useGraph.getState().select([], [id]); useGraph.getState().setEditing({ kind: 'edge', id }) }
  return <>
    <BaseEdge id={id} path={path} interactionWidth={20} className={`${styles.edge} ${selected ? styles.selectedEdge : ''}`} />
    {selected && <><circle className={styles.endpoint} cx={source.x} cy={source.y} r="4" /><circle className={styles.endpoint} cx={target.x} cy={target.y} r="4" /></>}
    {(edge.label || selected || editing) && <EdgeLabelRenderer><div className={`${styles.edgeLabel} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
      {editing ? <LabelEditor id={id} label={edge.label ?? ''} /> : <button aria-label={edge.label ? `Edit edge label: ${edge.label}` : 'Add edge label'} onClick={edit} onDoubleClick={edit}>{edge.label || 'Add label'}</button>}
    </div></EdgeLabelRenderer>}
  </>
})

export const ConnectionPreview = memo(function ConnectionPreview({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus }: ConnectionLineComponentProps) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition })
  return <path d={path} className={styles.connectionPreview} data-invalid={connectionStatus === 'invalid'} />
})
