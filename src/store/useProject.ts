import { create } from 'zustand'
import { createProject } from '../data/types'
import { fitTextHeight } from '../board/textHeight'
import type { BoardItem, Project, Swatch, Theme, Viewport } from '../data/types'

export type Tool = 'select' | 'hand' | BoardItem['type']
export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error'
type Content = Project['board']
type Snapshot = Pick<Content, 'items' | 'order'>

interface ProjectState {
  project: Project
  ready: boolean
  saveStatus: SaveStatus
  saveError: string
  tool: Tool
  selected: string[]
  editing: string | null
  past: Snapshot[]
  future: Snapshot[]
  gesture: Snapshot | null
  draft: BoardItem | null
  marquee: { x: number; y: number; width: number; height: number } | null
  hydrate: (project: Project) => void
  setSaveStatus: (status: SaveStatus, error?: string) => void
  setTitle: (title: string) => void
  setTheme: (theme: Theme) => void
  toggleSnap: () => void
  setViewport: (viewport: Viewport) => void
  setTool: (tool: Tool) => void
  select: (ids: string[]) => void
  setEditing: (id: string | null) => void
  setDraft: (item: BoardItem | null) => void
  setMarquee: (bounds: ProjectState['marquee']) => void
  addItems: (items: BoardItem[]) => void
  updateItems: (items: BoardItem[], historical?: boolean) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  setSwatch: (swatch: Swatch | 'none') => void
  beginGesture: () => void
  endGesture: (cancel?: boolean) => void
  undo: () => void
  redo: () => void
}

const snapshot = (project: Project): Snapshot => ({ items: project.board.items, order: project.board.order })
const timestamp = (project: Project): Project => ({ ...project, updatedAt: Date.now() })
const history = (past: Snapshot[], current: Snapshot) => [...past.slice(-99), current]

export const useProject = create<ProjectState>((set, get) => ({
  project: createProject(), ready: false, saveStatus: 'loading', saveError: '',
  tool: 'select', selected: [], editing: null, past: [], future: [], gesture: null, draft: null, marquee: null,
  hydrate: project => set({ project, ready: true }),
  setSaveStatus: (saveStatus, saveError = '') => set({ saveStatus, saveError }),
  setTitle: title => set(s => ({ project: timestamp({ ...s.project, title }) })),
  setTheme: theme => set(s => ({ project: timestamp({ ...s.project, settings: { ...s.project.settings, theme } }) })),
  toggleSnap: () => set(s => ({ project: timestamp({ ...s.project, settings: { ...s.project.settings, snap: !s.project.settings.snap } }) })),
  setViewport: viewport => set(s => {
    const previous = s.project.board.viewport
    if (previous.x === viewport.x && previous.y === viewport.y && previous.zoom === viewport.zoom) return s
    return { project: timestamp({ ...s.project, board: { ...s.project.board, viewport } }) }
  }),
  setTool: tool => set({ tool, editing: null }),
  select: selected => set({ selected }),
  setEditing: editing => set({ editing }),
  setDraft: draft => set({ draft }),
  setMarquee: marquee => set({ marquee }),
  addItems: additions => set(s => {
    const items = { ...s.project.board.items }
    additions.forEach(item => { items[item.id] = fitTextHeight(item) })
    return { project: timestamp({ ...s.project, board: { ...s.project.board, items, order: [...s.project.board.order, ...additions.map(item => item.id)] } }), past: history(s.past, snapshot(s.project)), future: [], selected: additions.map(item => item.id) }
  }),
  updateItems: (updates, historical = true) => set(s => {
    if (!updates.length || updates.every(item => s.project.board.items[item.id] === item)) return s
    const items = { ...s.project.board.items }
    updates.forEach(item => { if (items[item.id]) items[item.id] = fitTextHeight(item, items[item.id]) })
    return { project: timestamp({ ...s.project, board: { ...s.project.board, items } }), ...(historical ? { past: history(s.past, snapshot(s.project)), future: [] } : {}) }
  }),
  deleteSelected: () => set(s => {
    if (!s.selected.length) return s
    const ids = new Set(s.selected)
    const items = { ...s.project.board.items }
    ids.forEach(id => { delete items[id] })
    return { project: timestamp({ ...s.project, board: { ...s.project.board, items, order: s.project.board.order.filter(id => !ids.has(id)) } }), past: history(s.past, snapshot(s.project)), future: [], selected: [], editing: null }
  }),
  duplicateSelected: () => {
    const s = get()
    const items = s.selected.flatMap(id => {
      const item = s.project.board.items[id]
      return item ? [{ ...item, id: crypto.randomUUID(), x: item.x + 24, y: item.y + 24 }] : []
    })
    if (items.length) s.addItems(items)
  },
  setSwatch: swatch => {
    const s = get()
    s.updateItems(s.selected.flatMap<BoardItem>(id => {
      const item = s.project.board.items[id]
      if (item?.type === 'sticky' && swatch !== 'none') return [{ ...item, swatch }]
      if (item?.type === 'rect' || item?.type === 'ellipse') return [{ ...item, swatch }]
      return []
    }))
  },
  beginGesture: () => set(s => ({ gesture: snapshot(s.project) })),
  endGesture: (cancel = false) => set(s => {
    if (!s.gesture) return { draft: null, marquee: null }
    const changed = s.gesture.items !== s.project.board.items
    return {
      ...(cancel && changed ? { project: timestamp({ ...s.project, board: { ...s.project.board, ...s.gesture } }) } : {}),
      ...(!cancel && changed ? { past: history(s.past, s.gesture), future: [] } : {}),
      gesture: null, draft: null, marquee: null,
    }
  }),
  undo: () => set(s => {
    const previous = s.past.at(-1)
    if (!previous) return s
    return { project: timestamp({ ...s.project, board: { ...s.project.board, ...previous } }), past: s.past.slice(0, -1), future: [...s.future, snapshot(s.project)], selected: s.selected.filter(id => previous.items[id]), editing: null }
  }),
  redo: () => set(s => {
    const next = s.future.at(-1)
    if (!next) return s
    return { project: timestamp({ ...s.project, board: { ...s.project.board, ...next } }), past: history(s.past, snapshot(s.project)), future: s.future.slice(0, -1), selected: s.selected.filter(id => next.items[id]), editing: null }
  }),
}))
