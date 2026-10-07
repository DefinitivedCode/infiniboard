import { Icon } from '../app/Icon'
import { useProject } from '../store/useProject'
import { useGraph } from '../store/useGraph'
import { PRESETS, nodeSizeStep } from './model'
import type { Preset } from './model'
import styles from './Graph.module.css'

export function GraphToolbar({ addNode }: { addNode: () => void }) {
  const tool = useGraph(s => s.tool)
  return <div className={styles.toolbar} role="toolbar" aria-label="Graph tools">
    <button aria-label="Select graph items (V)" title="Select · V" aria-pressed={tool === 'select'} onClick={() => useGraph.getState().setTool('select')}><Icon name="select" /></button>
    <button aria-label="Pan graph (H)" title="Pan · H" aria-pressed={tool === 'hand'} onClick={() => useGraph.getState().setTool('hand')}><Icon name="hand" /></button>
    <button className={styles.addButton} aria-label="Add node (N)" title="Add node · N" onClick={addNode}><Icon name="plus" /></button>
  </div>
}

export function GraphInspector() {
  const selectedNodes = useGraph(s => s.selectedNodes)
  const selectedEdges = useGraph(s => s.selectedEdges)
  const nodes = useProject(s => s.project.graph.nodes)
  const edges = useProject(s => s.project.graph.edges)
  if (!selectedNodes.length && !selectedEdges.length) return null
  const node = selectedNodes.length === 1 ? nodes[selectedNodes[0]] : undefined
  const edge = !selectedNodes.length && selectedEdges.length === 1 ? edges[selectedEdges[0]] : undefined
  const preset = node ? nodeSizeStep(node) : undefined
  const edit = () => {
    if (node) useGraph.getState().setEditing({ kind: 'node', id: node.id })
    if (edge) useGraph.getState().setEditing({ kind: 'edge', id: edge.id })
  }
  return <aside className={styles.inspector} aria-label="Graph selection properties">
    <div className={styles.inspectorHeading}><span>{node ? 'Node' : edge ? 'Connection' : `${selectedNodes.length + selectedEdges.length} items`}</span><div>
      {!!selectedNodes.length && <button aria-label="Duplicate graph selection" title="Duplicate · Ctrl/Cmd + D" onClick={() => useGraph.getState().duplicateSelected()}><Icon name="copy" /></button>}
      <button aria-label="Delete graph selection" title="Delete · Delete" onClick={() => useGraph.getState().deleteSelected()}><Icon name="trash" /></button>
    </div></div>
    {!!selectedNodes.length && <><span className={styles.propertyLabel}>Importance / size</span><div className={styles.presets} role="group" aria-label="Node size presets">{(Object.keys(PRESETS) as Preset[]).map((size, index) => <button key={size} aria-label={`Node size ${size}`} aria-pressed={preset === size} title={`${size} · ${index + 1}`} onClick={() => useGraph.getState().preset(size)}>{size}</button>)}</div>{node && <p className={styles.measure}>{Math.round(node.width)} × {Math.round(node.height)} <span>world units</span></p>}</>}
    {(node || edge) && <button className={styles.editButton} onClick={edit}>{node ? 'Edit node' : edge?.label ? 'Edit label' : 'Add label'}</button>}
    <p className={styles.inspectorHint}>{selectedNodes.length ? 'Drag corners to resize. 1–4 sets importance.' : 'Drag either endpoint to reconnect.'}</p>
  </aside>
}
