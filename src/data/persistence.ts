import Dexie from 'dexie'
import type { Table } from 'dexie'
import { createProject } from './types'
import type { Project } from './types'
import { useProject } from '../store/useProject'
import { migrateProject } from './migration'
import type { LegacyProject } from './migration'

class InfiniboardDatabase extends Dexie {
  projects!: Table<Project, string>
  constructor() {
    super('infiniboard')
    this.version(1).stores({ projects: 'id' })
    this.version(2).stores({ projects: 'id, version' }).upgrade(transaction =>
      transaction.table<LegacyProject | Project>('projects').toCollection().modify(project => {
        if (project.version === 1) Object.assign(project, migrateProject(project))
      }),
    )
  }
}

const db = new InfiniboardDatabase()
let initialization: Promise<void> | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let writing = false
let requested = false

export async function flushSave(): Promise<void> {
  if (!useProject.getState().ready) return
  clearTimeout(timer)
  requested = true
  if (writing) return
  writing = true
  while (requested) {
    requested = false
    const project = useProject.getState().project
    useProject.getState().setSaveStatus('saving')
    try {
      await db.projects.put(project)
      useProject.getState().setSaveStatus(useProject.getState().project === project ? 'saved' : 'pending')
    } catch {
      useProject.getState().setSaveStatus('error', 'Could not save in browser storage. Export a JSON backup and check available storage.')
      requested = false
      break
    }
  }
  writing = false
}

export function initializePersistence(): Promise<void> {
  initialization ??= (async () => {
    let project: Project = createProject()
    try {
      const saved = await db.projects.get('local-project')
      if (saved) project = saved
      useProject.getState().hydrate(project)
      useProject.getState().setSaveStatus('saved')
    } catch {
      useProject.getState().hydrate(project)
      useProject.getState().setSaveStatus('error', 'Could not open browser storage. Check browser storage permissions before editing.')
    }
    useProject.subscribe((state, previous) => {
      if (state.project === previous.project) return
      if (state.saveStatus !== 'error') state.setSaveStatus('pending')
      clearTimeout(timer)
      timer = setTimeout(() => { void flushSave() }, 500)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && useProject.getState().saveStatus !== 'saved') void flushSave()
    })
    window.addEventListener('pagehide', () => { if (useProject.getState().saveStatus !== 'saved') void flushSave() })
  })()
  return initialization
}
