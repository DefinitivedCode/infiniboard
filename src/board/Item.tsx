import { memo, useEffect, useRef, useState } from 'react'
import type { BoardItem } from '../data/types'
import { useProject } from '../store/useProject'
import styles from './Board.module.css'

export function ItemVisual({ item }: { item: BoardItem }) {
  if (item.type === 'text' || item.type === 'sticky') return <div className={styles.itemText} style={{ fontSize: item.fontSize }}>{item.text}</div>
  if (item.type === 'rect' || item.type === 'ellipse') return <div className={`${styles.shape} ${item.type === 'ellipse' ? styles.ellipse : ''}`} />
  const width = Math.max(1, item.width)
  const height = Math.max(1, item.height)
  if (item.type === 'line' || item.type === 'arrow') {
    const x1 = item.start.x * width
    const y1 = item.start.y * height
    const x2 = item.end.x * width
    const y2 = item.end.y * height
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const length = Math.min(14, Math.hypot(x2 - x1, y2 - y1) * .4)
    const head = `M${x2 - length * Math.cos(angle - .5)},${y2 - length * Math.sin(angle - .5)} L${x2},${y2} L${x2 - length * Math.cos(angle + .5)},${y2 - length * Math.sin(angle + .5)}`
    return <svg className={styles.drawing} width={width} height={height}><path className={styles.hitStroke} d={`M${x1},${y1} L${x2},${y2}`} /><path d={`M${x1},${y1} L${x2},${y2}`} />{item.type === 'arrow' && <path d={head} />}</svg>
  }
  if (item.type === 'pen') {
    const d = item.points.map((point, i) => `${i ? 'L' : 'M'}${point.x * width},${point.y * height}`).join(' ')
    return <svg className={styles.drawing} width={width} height={height}><path className={styles.hitStroke} d={d} /><path d={d} /></svg>
  }
}

function TextEditor({ item }: { item: Extract<BoardItem, { type: 'text' | 'sticky' }> }) {
  const [value, setValue] = useState(item.text)
  const editor = useRef<HTMLTextAreaElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    const state = useProject.getState()
    state.beginGesture()
    const baseline = useProject.getState().gesture
    editor.current?.focus(); editor.current?.select()
    return () => { if (useProject.getState().gesture === baseline) useProject.getState().endGesture() }
  }, [])
  const finish = () => {
    const state = useProject.getState()
    state.endGesture(cancelled.current)
    if (state.editing === item.id) state.setEditing(null)
  }
  return <textarea ref={editor} className={styles.textEditor} style={{ fontSize: item.fontSize }} aria-label={item.type === 'sticky' ? 'Sticky note text' : 'Text content'} value={value} spellCheck onChange={e => {
    setValue(e.target.value)
    const current = useProject.getState().project.board.items[item.id]
    if (current && (current.type === 'text' || current.type === 'sticky')) useProject.getState().updateItems([{ ...current, text: e.target.value }], false)
  }} onBlur={finish} onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation()
    if (e.key === 'Escape') { cancelled.current = true; finish(); useProject.getState().setEditing(null) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish() }
  }} />
}

export const Item = memo(function Item({ id }: { id: string }) {
  const item = useProject(s => s.project.board.items[id])
  const selected = useProject(s => s.selected.includes(id))
  const multi = useProject(s => s.selected.length > 1 && s.selected.includes(id))
  const editing = useProject(s => s.editing === id)
  if (!item) return null
  const swatch = 'swatch' in item ? item.swatch : 'none'
  const drawing = item.type === 'line' || item.type === 'arrow' || item.type === 'pen'
  return <div data-item-id={id} data-item-type={item.type} data-selected={selected} data-multi={multi} className={`${styles.item} ${styles[item.type] ?? ''} ${drawing ? styles.strokeItem : ''}`} style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: item.height, background: !drawing && swatch !== 'none' ? `var(--${swatch === 'paper' ? 'note-paper' : swatch})` : undefined }}>
    {editing && (item.type === 'text' || item.type === 'sticky') ? <TextEditor item={item} /> : <ItemVisual item={item} />}
  </div>
})
