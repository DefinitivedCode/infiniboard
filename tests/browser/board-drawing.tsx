import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { App } from '../../src/app/App'
import { ItemVisual } from '../../src/board/Item'
import { createProject } from '../../src/data/types'
import type { Point, Project } from '../../src/data/types'
import { createPenItem } from '../../src/board/strokes'
import { flushSave } from '../../src/data/persistence'
import { parseProjectFile, serializeProject } from '../../src/data/projectFile'
import { useProject } from '../../src/store/useProject'
import '../../src/app/tokens.css'
import styles from './DrawingFixture.module.css'

const point = (x: number, y: number): Point => ({ x, y })
const samples: Point[][] = [
  [point(20, 20), point(100, 20), point(240, 20), point(440, 20)],
  Array.from({ length: 17 }, (_, i) => point(95 + Math.cos(i / 16 * Math.PI * 2) * 55, 110 + Math.sin(i / 16 * Math.PI * 2) * 55)),
  Array.from({ length: 48 }, (_, i) => { const a = i / 8 * Math.PI; return point(300 + Math.cos(a) * i, 110 + Math.sin(a) * i) }),
  [point(20, 230), point(60, 180), point(90, 250), point(130, 180), point(165, 230), point(205, 190), point(245, 240), point(285, 180), point(335, 230), point(440, 180)],
  [point(20, 370), point(20, 300), point(50, 330), point(80, 300), point(80, 370)],
  [point(125, 325), point(110, 345), point(125, 370), point(150, 350), point(140, 325), point(125, 325), point(125, 345), point(150, 345)],
  [point(195, 300), point(190, 360), point(200, 370), point(220, 365)],
  [point(255, 300), point(250, 360), point(260, 370), point(280, 365)],
  Array.from({ length: 12 }, (_, i) => point(305 + Math.cos(i / 11 * Math.PI * 2) * 24, 345 + Math.sin(i / 11 * Math.PI * 2) * 24)),
  [point(20, 470), point(140, 390), point(300, 475), point(440, 400)],
  [point(20, 400), point(140, 475), point(300, 390), point(440, 470)],
  [point(70, 535)], [point(120, 535), point(120.1, 535.1)],
]

let remount: (project: Project) => void = () => {}

// The automation launches this fixture in a fresh, disposable browser context.
// Real application persistence is exercised without deleting any database.
const fixture = {
  ready: () => useProject.getState().ready,
  snapshot: () => {
    const s = useProject.getState()
    return { project: s.project, selected: s.selected, tool: s.tool, past: s.past.length, future: s.future.length, draft: s.draft, gesture: s.gesture, saveStatus: s.saveStatus }
  },
  reset: (project: Project = createProject()) => remount(project),
  load: (contents: string) => remount(parseProjectFile(contents)),
  export: () => serializeProject(useProject.getState().project),
  save: flushSave,
  select: (ids: string[]) => useProject.getState().select(ids),
  synthetic: (count = 400, longPoints = 5000) => {
    const project = createProject()
    for (let i = 0; i < count; i++) {
      const x = 110 + i % 30 * 24, y = 90 + Math.floor(i / 30) * 30
      const stroke = createPenItem(`sample-${i}`, [point(x, y), point(x + 5, y - 8), point(x + 10, y + 6), point(x + 17, y)])
      project.board.items[stroke.id] = stroke; project.board.order.push(stroke.id)
    }
    const stroke = createPenItem('long', Array.from({ length: longPoints }, (_, i) => point(100 + i * .12, 540 + Math.sin(i * .02) * 32)))
    project.board.items.long = stroke; project.board.order.push('long')
    project.board.items.shape = { id: 'shape', type: 'rect', x: 830, y: 110, width: 130, height: 100, swatch: 'none' }
    project.board.items.note = { id: 'note', type: 'sticky', x: 830, y: 260, width: 216, height: 192, text: 'Synthetic note', fontSize: 20, swatch: 'oat' }
    project.board.items.arrow = { id: 'arrow', type: 'arrow', x: 830, y: 500, width: 150, height: 60, start: point(0, 0), end: point(1, 1) }
    project.board.order.push('shape', 'note', 'arrow')
    remount(project)
  },
}

declare global { interface Window { drawingFixture: typeof fixture } }

export function Comparison() {
  return <main className={styles.comparison}><h1>Freehand geometry comparison</h1><p>Identical synthetic samples: straight line, circle, spiral, sparse fast curves, handwriting, crossing strokes, dot and tiny stroke.</p><div className={styles.columns}>
    {[false, true].map(smooth => <section key={String(smooth)}><h2>{smooth ? 'Smooth vector curves' : 'Previous straight segments'}</h2><div className={styles.samples}>{samples.map((points, i) => {
      const item = createPenItem(`visual-${i}`, points)
      return <div key={item.id} className={styles.sample} style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>{smooth ? <ItemVisual item={item} /> : <svg width={item.width} height={item.height}><path d={points.map((p, j) => `${j ? 'L' : 'M'}${p.x - item.x},${p.y - item.y}`).join(' ')} /></svg>}</div>
    })}</div></section>)}
  </div></main>
}

if (import.meta.env.DEV) {
  window.drawingFixture = fixture
  const root = createRoot(document.getElementById('root')!)
  remount = project => {
    flushSync(() => root.render(null))
    useProject.setState({ project, ready: true, tool: 'select', selected: [], editing: null, past: [], future: [], gesture: null, draft: null, marquee: null })
    flushSync(() => root.render(<App />))
  }
  root.render(new URLSearchParams(location.search).has('compare') ? <Comparison /> : <App />)
  import.meta.hot?.dispose(() => root.unmount())
}
