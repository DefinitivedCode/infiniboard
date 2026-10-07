import { Icon } from '../app/Icon'
import type { IconName } from '../app/Icon'
import { useProject } from '../store/useProject'
import type { Tool } from '../store/useProject'
import styles from './Chrome.module.css'

const tools: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select', key: 'V' },
  { tool: 'hand', icon: 'hand', label: 'Pan', key: 'H' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T' },
  { tool: 'sticky', icon: 'sticky', label: 'Sticky note', key: 'S' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'O' },
  { tool: 'line', icon: 'line', label: 'Line', key: 'L' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A' },
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
]

export function Toolbar() {
  const active = useProject(s => s.tool)
  return <div className={styles.toolbar} role="toolbar" aria-label="Board tools">
    {tools.map(({ tool, icon, label, key }, i) => <button key={tool} aria-label={`${label} (${key})`} title={`${label} · ${key}`} aria-pressed={active === tool} className={`${styles.tool} ${active === tool ? styles.active : ''} ${i === 2 ? styles.sectionStart : ''}`} onClick={() => useProject.getState().setTool(tool)}><Icon name={icon} /><span className={styles.toolKey}>{key}</span></button>)}
  </div>
}
