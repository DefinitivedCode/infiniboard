import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Project } from '../data/types'
import { parseProjectFile, projectFilename, serializeProject } from '../data/projectFile'
import { Icon } from './Icon'
import styles from './App.module.css'

function download(project: Project, backup = false) {
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = projectFilename(backup)
  document.body.append(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}

type Notice = { kind: 'error'; message: string } | { kind: 'confirm'; project: Project; filename: string }

export function ProjectFiles({ snapshot, replace }: { snapshot: () => Project; replace: (project: Project) => void }) {
  const [menu, setMenu] = useState(false)
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (notice && !dialog.current?.open) dialog.current?.showModal()
    if (!notice) dialog.current?.close()
  }, [notice])
  const chooseFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReading(true); setMenu(false)
    try { setNotice({ kind: 'confirm', project: parseProjectFile(await file.text()), filename: file.name }) }
    catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'This file could not be read. Choose an Infiniboard JSON export.' }) }
    finally { setReading(false) }
  }
  const exportFile = () => {
    setMenu(false)
    try { download(snapshot()) }
    catch { setNotice({ kind: 'error', message: 'The project could not be downloaded. Your current project is unchanged.' }) }
  }
  const confirmImport = () => {
    if (notice?.kind !== 'confirm') return
    try {
      download(snapshot(), true)
      replace(notice.project)
      setNotice(null)
    } catch { setNotice({ kind: 'error', message: 'The backup could not be downloaded. Your current project has not been replaced.' }) }
  }
  return <div className={styles.files} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false) }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setMenu(false) }}>
    <button className={styles.iconButton} aria-label="Project files" title={reading ? 'Reading project…' : 'Project files'} aria-expanded={menu} aria-controls="project-files-menu" disabled={reading} onClick={() => setMenu(!menu)}><Icon name="file" /></button>
    {menu && <div id="project-files-menu" className={styles.fileMenu} aria-label="Project file actions">
      <button onClick={exportFile}><Icon name="export" />Export JSON</button>
      <button onClick={() => input.current?.click()}><Icon name="import" />Import JSON</button>
    </div>}
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Import project file" onChange={e => { void chooseFile(e) }} />
    <dialog ref={dialog} className={styles.fileDialog} onCancel={() => setNotice(null)} aria-labelledby="file-dialog-title" onKeyDown={e => e.stopPropagation()}>
      <div className={styles.dialogHeading}><h2 id="file-dialog-title">{notice?.kind === 'confirm' ? 'Replace project?' : 'Could not open file'}</h2><button className={styles.iconButton} aria-label="Close project file dialog" onClick={() => setNotice(null)}><Icon name="close" /></button></div>
      {notice?.kind === 'confirm' ? <>
        <p className={styles.filename}>{notice.filename}</p>
        <p><strong>{notice.project.title || 'Untitled project'}</strong><br />{notice.project.board.order.length} Board {notice.project.board.order.length === 1 ? 'item' : 'items'} · {notice.project.graph.nodeOrder.length} {notice.project.graph.nodeOrder.length === 1 ? 'node' : 'nodes'} · {notice.project.graph.edgeOrder.length} {notice.project.graph.edgeOrder.length === 1 ? 'connection' : 'connections'}</p>
        <p>This replaces both canvases, viewports, and settings. Your current project downloads as a backup first. Undo history and selections will clear.</p>
        <div className={styles.dialogActions}><button autoFocus onClick={() => setNotice(null)}>Cancel</button><button className={styles.confirmButton} onClick={confirmImport}>Download backup and replace</button></div>
      </> : <><p role="alert">{notice?.message}</p><div className={styles.dialogActions}><button autoFocus onClick={() => setNotice(null)}>Close</button></div></>}
    </dialog>
  </div>
}
