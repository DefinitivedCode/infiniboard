import type { RefObject } from 'react'
import { Icon } from '../app/Icon'
import { flushSave } from '../data/persistence'
import { useProject } from '../store/useProject'
import type { Tool } from '../store/useProject'
import type { BoardApi } from './Board'
import styles from './Chrome.module.css'

const hints: Record<Tool, string> = {
  select: 'Shift + click to add · Drag to select · Space + drag to pan', hand: 'Drag to pan · Ctrl/Cmd + wheel to zoom',
  text: 'Click to add text · Drag for a custom text box', sticky: 'Click to add a note · Drag for a custom size',
  rect: 'Drag a rectangle · Shift for a square', ellipse: 'Drag an ellipse · Shift for a circle',
  line: 'Drag a line · Shift to constrain angle', arrow: 'Drag an arrow · Shift to constrain angle', pen: 'Draw freely · Escape to cancel stroke',
}

export function StatusBar({ api, board }: { api: RefObject<BoardApi | null>; board: boolean }) {
  const status = useProject(s => s.saveStatus)
  const error = useProject(s => s.saveError)
  const tool = useProject(s => s.tool)
  const count = useProject(s => s.project.board.order.length)
  const nodeCount = useProject(s => s.project.graph.nodeOrder.length)
  const edgeCount = useProject(s => s.project.graph.edgeOrder.length)
  const zoom = useProject(s => (board ? s.project.board : s.project.graph).viewport.zoom)
  return <div className={styles.statusBar}>
    <span className={styles.guidance}>{board ? hints[tool] : 'N to add · 1–4 for size · Drag handles to connect · Space + drag to pan'}</span>
    <div className={styles.statusRight}>
      <span>{board ? `${count} ${count === 1 ? 'item' : 'items'}` : `${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} · ${edgeCount} ${edgeCount === 1 ? 'edge' : 'edges'}`}</span>
      <span className={styles.save} data-status={status} title={error || 'Autosaved in IndexedDB on this browser'} role="status"><span className={styles.saveDot} />{status === 'saved' ? 'Saved locally' : status === 'error' ? <button className={styles.retry} onClick={() => { void flushSave() }}>Save failed · Retry</button> : status === 'loading' ? 'Opening…' : status === 'saving' ? 'Saving…' : 'Unsaved changes'}</span>
      <div className={styles.zoom}>
        <button aria-label="Zoom out" title="Zoom out · −" onClick={() => api.current?.zoom(1 / 1.2)}><Icon name="minus" /></button>
        <button className={styles.percentage} aria-label="Reset zoom to 100%" title="Reset zoom · 0" onClick={() => api.current?.resetZoom()}>{Math.round(zoom * 100)}%</button>
        <button aria-label="Zoom in" title="Zoom in · +" onClick={() => api.current?.zoom(1.2)}><Icon name="plus" /></button>
        <button className={styles.fit} aria-label="Fit selection or all items" title="Fit selection or all items · F" onClick={() => api.current?.fit()}><Icon name="fit" /></button>
      </div>
    </div>
  </div>
}
