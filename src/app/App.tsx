import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Board } from '../board/Board'
import type { BoardApi } from '../board/Board'
import { Toolbar } from '../board/Toolbar'
import { Inspector } from '../board/Inspector'
import { StatusBar } from '../board/StatusBar'
import { initializePersistence } from '../data/persistence'
import { useProject } from '../store/useProject'
import { Icon } from './Icon'
import { Shortcuts } from './Shortcuts'
import { useGraph } from '../store/useGraph'
import type { GraphApi } from '../graph/Graph'
import { ProjectFiles } from './ProjectFiles'
import { GraphContext } from '../graph/GraphContext'
import { replaceProject } from '../data/replaceProject'
import type { Project } from '../data/types'
import styles from './App.module.css'

const Graph = lazy(() => import('../graph/Graph').then(module => ({ default: module.Graph })))

function HistoryControls({ graph }: { graph: boolean }) {
  const boardUndo = useProject(s => s.past.length > 0)
  const boardRedo = useProject(s => s.future.length > 0)
  const graphUndo = useGraph(s => s.past.length > 0)
  const graphRedo = useGraph(s => s.future.length > 0)
  const canUndo = graph ? graphUndo : boardUndo
  const canRedo = graph ? graphRedo : boardRedo
  return <div className={styles.history}>
    <button className={styles.iconButton} disabled={!canUndo} aria-label="Undo" title="Undo · Ctrl/Cmd + Z" onClick={() => (graph ? useGraph : useProject).getState().undo()}><Icon name="undo" /></button>
    <button className={styles.iconButton} disabled={!canRedo} aria-label="Redo" title="Redo · Ctrl/Cmd + Shift + Z" onClick={() => (graph ? useGraph : useProject).getState().redo()}><Icon name="redo" /></button>
  </div>
}

function OrganizeControl({ onClick }: { onClick: () => void }) {
  const empty = useProject(s => s.project.graph.nodeOrder.length === 0)
  return <button className={styles.organizeButton} disabled={empty} title="Automatically organize graph" onClick={onClick}><Icon name="branch" /><span>Organize</span></button>
}

export function App() {
  const [tab, setTab] = useState<'board' | 'graph'>('board')
  const [replacing, setReplacing] = useState(false)
  const boardApi = useRef<BoardApi>(null)
  const graphApi = useRef<GraphApi>(null)
  const api = tab === 'board' ? boardApi : graphApi
  const ready = useProject(s => s.ready)
  const theme = useProject(s => s.project.settings.theme)
  const title = useProject(s => s.project.title)
  const snap = useProject(s => s.project.settings.snap)
  useEffect(() => { void initializePersistence() }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())
  }, [theme])
  useEffect(() => { document.title = `${title || 'Untitled project'} — Infiniboard` }, [title])
  const snapshot = () => { api.current?.flushViewport(); return useProject.getState().project }
  const importProject = (project: Project) => {
    // Flush old canvas cleanup before replacing its data, then mount at imported viewports.
    flushSync(() => setReplacing(true))
    replaceProject(project)
    setReplacing(false)
  }
  return <div className={styles.app}>
    <header className={styles.header}>
      <div className={styles.projectControls}>
        <span className={styles.brand}>infiniboard<span className={styles.brandDot}>.</span></span>
        <span className={styles.divider} />
        <input className={styles.projectTitle} aria-label="Project title" value={title} disabled={!ready} maxLength={120} onChange={e => useProject.getState().setTitle(e.target.value)} onBlur={() => { if (!title.trim()) useProject.getState().setTitle('Untitled project') }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
      <nav className={styles.tabs} aria-label="Project views">
        <button aria-current={tab === 'board' ? 'page' : undefined} className={tab === 'board' ? styles.activeTab : ''} onClick={() => setTab('board')}>Board</button>
        <button aria-current={tab === 'graph' ? 'page' : undefined} className={tab === 'graph' ? styles.activeTab : ''} onClick={() => setTab('graph')}>Graph</button>
      </nav>
      <div className={styles.actions}>
        {ready && <ProjectFiles snapshot={snapshot} replace={importProject} />}
        <div className={styles.actionStrip}>
          {ready && <><HistoryControls graph={tab === 'graph'} />{tab === 'graph' && <><OrganizeControl onClick={() => graphApi.current?.organize()} /><GraphContext /></>}<button className={`${styles.gridButton} ${snap ? styles.gridActive : ''}`} aria-label="Grid and snapping (G)" aria-pressed={snap} title="Grid and snapping · G" onClick={() => useProject.getState().toggleSnap()}><Icon name="grid" /><span>Snap</span></button><Shortcuts graph={tab === 'graph'} /></>}
          <button className={styles.iconButton} disabled={!ready} aria-label={theme === 'dark' ? 'Use paper theme' : 'Use charcoal theme'} title={theme === 'dark' ? 'Paper theme' : 'Charcoal theme'} onClick={() => useProject.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
      </div>
    </header>
    <main className={styles.main}>
      {!ready || replacing ? <div className={styles.loading}>Opening local workspace…</div> : tab === 'board' ? <><Board ref={boardApi} /><Toolbar /><Inspector /></> : <Suspense fallback={<div className={styles.loading}>Opening graph…</div>}><Graph ref={graphApi} /></Suspense>}
    </main>
    <footer className={styles.footer}><StatusBar api={api} board={tab === 'board'} /></footer>
  </div>
}
