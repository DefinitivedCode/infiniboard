import { Icon } from '../app/Icon'
import { useProject } from '../store/useProject'
import type { BoardItem, Swatch } from '../data/types'
import { boundsOf } from './geometry'
import styles from './Chrome.module.css'

function Dimension({ item, property }: { item: BoardItem; property: 'width' | 'height' }) {
  return <label className={styles.dimension}><span>{property === 'width' ? 'W' : 'H'}</span><input key={`${item.id}-${item[property]}`} aria-label={property === 'width' ? 'Item width' : 'Item height'} type="number" min="12" max="10000" defaultValue={Math.round(item[property])} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={e => {
    const value = Number(e.currentTarget.value)
    if (Number.isFinite(value) && value >= 12 && value <= 10000 && value !== Math.round(item[property])) useProject.getState().updateItems([{ ...item, [property]: value }])
    else e.currentTarget.value = String(Math.round(item[property]))
  }} /></label>
}

export function Inspector() {
  const selected = useProject(s => s.selected)
  const items = useProject(s => s.project.board.items)
  const selection = selected.flatMap(id => items[id] ? [items[id]] : [])
  const item = selection.length === 1 ? selection[0] : null
  if (!selection.length) return null
  const colorable = selection.some(i => 'swatch' in i)
  const allowNone = selection.every(i => i.type !== 'sticky')
  const swatches: (Swatch | 'none')[] = [...(allowNone ? ['none' as const] : []), 'oat', 'sage', 'rose', 'paper']
  const bounds = boundsOf(selection)!
  return <aside className={styles.inspector} aria-label="Selection properties">
    <div className={styles.inspectorHeading}><span>{item ? item.type === 'rect' ? 'Rectangle' : item.type === 'sticky' ? 'Sticky note' : item.type[0].toUpperCase() + item.type.slice(1) : `${selection.length} items`}</span><div className={styles.inspectorActions}>
      <button aria-label="Duplicate selection" title="Duplicate · Ctrl/Cmd + D" onClick={() => useProject.getState().duplicateSelected()}><Icon name="copy" /></button>
      <button aria-label="Delete selection" title="Delete selection · Delete" onClick={() => useProject.getState().deleteSelected()}><Icon name="trash" /></button>
    </div></div>
    {item ? <div className={styles.dimensions}><Dimension item={item} property="width" /><Dimension item={item} property="height" /></div> : <div className={styles.measure}>{Math.round(bounds.width)} × {Math.round(bounds.height)} <span>world units</span></div>}
    {colorable && <div className={styles.swatches} aria-label="Fill color">{swatches.map(swatch => <button key={swatch} title={swatch === 'none' ? 'No fill' : `${swatch} fill`} aria-label={swatch === 'none' ? 'No fill' : `${swatch} fill`} aria-pressed={!!item && 'swatch' in item && item.swatch === swatch} style={{ background: swatch === 'none' ? 'transparent' : `var(--${swatch === 'paper' ? 'note-paper' : swatch})` }} onClick={() => useProject.getState().setSwatch(swatch)}>{swatch === 'none' && <Icon name="line" />}</button>)}</div>}
    {item && (item.type === 'text' || item.type === 'sticky') && <div className={styles.textControls}><label>Text size <select aria-label="Text size" value={item.fontSize} onChange={e => useProject.getState().updateItems([{ ...item, fontSize: Number(e.target.value) }])}>{[14, 16, 20, 24, 32, 48].map(size => <option key={size} value={size}>{size}</option>)}</select></label><button onClick={() => useProject.getState().setEditing(item.id)}>Edit text</button></div>}
    <p className={styles.inspectorHint}>{item?.type === 'text' || item?.type === 'sticky' ? 'Double-click to edit. ' : ''}Drag corners to resize.</p>
  </aside>
}
