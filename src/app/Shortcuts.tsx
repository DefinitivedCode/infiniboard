import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ignoreShortcut } from './keyboard'
import styles from './App.module.css'

const common = [
  ['V / H', 'Select / pan tool'], ['Space + drag / middle drag', 'Pan temporarily'],
  ['+ / âˆ’ / 0', 'Zoom in / out / 100%'], ['F', 'Fit selection or canvas'],
  ['G', 'Grid and snapping'], ['Click / drag canvas', 'Select / box-select'], ['Shift + click / drag', 'Add to selection'],
  ['Ctrl/Cmd + A / D', 'Select all / duplicate'], ['Arrows / Shift + arrows', 'Nudge 1 / 10 units (24 on grid)'],
  ['Delete / Backspace', 'Delete selection'], ['Ctrl/Cmd + Z', 'Undo'], ['Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y', 'Redo'],
  ['Double-click / Enter', 'Edit selected text'], ['Click away / Ctrl/Cmd + Enter', 'Commit text or node edit'], ['Escape', 'Cancel edit / clear selection'], ['?', 'Keyboard reference'],
]

const boardShortcuts = [
  ['Wheel / Shift + wheel', 'Pan / horizontal pan'], ['Ctrl/Cmd + wheel', 'Zoom about pointer'],
  ['T / S', 'Text / sticky note'], ['R / O', 'Rectangle / ellipse'], ['L / A / P', 'Line / arrow / pen'],
  ['Shift + draw', 'Constrain shapes / line angle'], ['Shift + resize', 'Keep proportions'], ['Escape during drag', 'Cancel Board gesture'],
]
const graphShortcuts = [
  ['Wheel / pinch', 'Zoom about pointer'],
  ['N / double-click canvas', 'Add node'], ['1 / 2 / 3 / 4', 'Size S / M / L / XL'],
  ['Drag between handles', 'Connect nodes'], ['Drag edge endpoint', 'Reconnect edge'], ['Enter in label field', 'Commit edge label'],
]

export function Shortcuts({ graph = false }: { graph?: boolean }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || ignoreShortcut(e)) return
      e.preventDefault(); setOpen(true)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); if (!open) dialog.current?.close() }, [open])
  return <>
    <button className={styles.iconButton} aria-label="Keyboard shortcuts" title="Keyboard shortcuts Â· ?" onClick={() => setOpen(true)}><Icon name="help" /></button>
    <dialog ref={dialog} className={styles.shortcuts} onKeyDown={e => e.stopPropagation()} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setOpen(false) } }} aria-labelledby="shortcut-title">
      <div className={styles.dialogHeading}><h2 id="shortcut-title">Keyboard reference</h2><button className={styles.iconButton} aria-label="Close keyboard reference" onClick={() => setOpen(false)}><Icon name="close" /></button></div>
      <div className={styles.shortcutRows}><h3>Both canvases</h3>{common.map(([key, label]) => <div key={key}><span>{label}</span><kbd>{key}</kbd></div>)}<h3>{graph ? 'Graph' : 'Board'}</h3>{(graph ? graphShortcuts : boardShortcuts).map(([key, label]) => <div key={key}><span>{label}</span><kbd>{key}</kbd></div>)}</div>
      <p>Canvas shortcuts pause while typing. Text fields keep their own editing keys. Esc closes this reference.</p>
    </dialog>
  </>
}
