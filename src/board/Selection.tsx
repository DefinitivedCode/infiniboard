import { useProject } from '../store/useProject'
import { boundsOf } from './geometry'
import { ItemVisual } from './Item'
import styles from './Board.module.css'

export function Selection() {
  const selected = useProject(s => s.selected)
  const items = useProject(s => s.project.board.items)
  const editing = useProject(s => s.editing)
  const bounds = boundsOf(selected.flatMap(id => items[id] ? [items[id]] : []))
  if (!bounds || editing) return null
  return <div className={styles.selection} style={{ transform: `translate(${bounds.x}px, ${bounds.y}px)`, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) }}>
    {['nw', 'ne', 'se', 'sw'].map(handle => <span key={handle} data-handle={handle} className={`${styles.handle} ${styles[handle]}`} />)}
  </div>
}

export function Draft() {
  const item = useProject(s => s.draft)
  if (!item) return null
  return <div className={`${styles.item} ${styles[item.type] ?? ''} ${styles.draft}`} style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: item.height, background: item.type === 'sticky' ? 'var(--oat)' : undefined }}><ItemVisual item={item} /></div>
}

export function Marquee() {
  const bounds = useProject(s => s.marquee)
  return bounds ? <div className={styles.marquee} style={{ transform: `translate(${bounds.x}px, ${bounds.y}px)`, width: bounds.width, height: bounds.height }} /> : null
}
