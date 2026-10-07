import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useProject } from '../store/useProject'
import type { Tool } from '../store/useProject'
import type { BoardItem, Point, Viewport } from '../data/types'
import { boundsOf, GRID, intersects, rectangle, resizeItems, snap, worldPoint, zoomAt } from './geometry'
import type { Bounds } from './geometry'
import { Item } from './Item'
import { ignoreShortcut } from '../app/keyboard'
import { Draft, Marquee, Selection } from './Selection'
import styles from './Board.module.css'

export interface BoardApi { zoom: (factor: number) => void; fit: () => void; resetZoom: () => void; flushViewport: () => void }
type DrawingTool = Exclude<Tool, 'select' | 'hand'>
type Gesture =
  | { type: 'pan'; client: Point; viewport: Viewport }
  | { type: 'move'; anchor: Point; items: BoardItem[]; bounds: Bounds; moved: boolean }
  | { type: 'resize'; anchor: Point; items: BoardItem[]; bounds: Bounds; handle: string; moved: boolean }
  | { type: 'marquee'; anchor: Point; original: string[] }
  | { type: 'create'; anchor: Point; tool: DrawingTool; id: string; points: Point[]; moved: boolean }

function newItem(tool: DrawingTool, id: string, anchor: Point, end: Point, click: boolean, points: Point[]): BoardItem {
  const defaults = { width: tool === 'sticky' ? 216 : 240, height: tool === 'text' ? 80 : tool === 'sticky' ? 192 : 144 }
  let box = click ? { ...anchor, ...defaults } : rectangle(anchor, end)
  box = { ...box, width: Math.max(1, box.width), height: Math.max(1, box.height) }
  const base = { id, ...box }
  if (tool === 'text') return { ...base, width: Math.max(80, box.width), height: Math.max(40, box.height), type: tool, text: '', fontSize: 20 }
  if (tool === 'sticky') return { ...base, width: Math.max(72, box.width), height: Math.max(72, box.height), type: tool, text: '', swatch: 'oat', fontSize: 20 }
  if (tool === 'rect' || tool === 'ellipse') return { ...base, width: Math.max(24, box.width), height: Math.max(24, box.height), type: tool, swatch: 'none' }
  if (tool === 'line' || tool === 'arrow') {
    const start = click ? { x: 0, y: 1 } : { x: (anchor.x - box.x) / box.width, y: (anchor.y - box.y) / box.height }
    const finish = click ? { x: 1, y: 0 } : { x: (end.x - box.x) / box.width, y: (end.y - box.y) / box.height }
    return { ...base, type: tool, start, end: finish }
  }
  const strokePoints = points.length > 1 ? points : [anchor, { x: anchor.x + .1, y: anchor.y + .1 }]
  const xs = strokePoints.map(p => p.x)
  const ys = strokePoints.map(p => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const width = Math.max(1, Math.max(...xs) - x)
  const height = Math.max(1, Math.max(...ys) - y)
  return { id, type: 'pen', x, y, width, height, points: strokePoints.map(p => ({ x: (p.x - x) / width, y: (p.y - y) / height })) }
}

export const Board = forwardRef<BoardApi>(function Board(_, apiRef) {
  const order = useProject(s => s.project.board.order)
  const tool = useProject(s => s.tool)
  const grid = useProject(s => s.project.settings.snap)
  const stage = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const pattern = useRef<SVGPatternElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  const viewport = useRef(useProject.getState().project.board.viewport)
  const gesture = useRef<Gesture | null>(null)
  const lastPointerItem = useRef<string | null>(null)
  const space = useRef(false)
  const publishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)
  const nextPointer = useRef<{ point: Point; shift: boolean } | null>(null)

  // Imperative transforms keep the React item tree out of the pan/zoom path.
  const paintViewport = (next: Viewport) => {
    viewport.current = next
    if (world.current) world.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`
    stage.current?.style.setProperty('--inverse-zoom', String(1 / next.zoom))
    const step = GRID * next.zoom * (next.zoom < .35 ? 4 : next.zoom < .65 ? 2 : 1)
    pattern.current?.setAttribute('width', String(step))
    pattern.current?.setAttribute('height', String(step))
    pattern.current?.setAttribute('x', String((((next.x - 1) % step) + step) % step))
    pattern.current?.setAttribute('y', String((((next.y - 1) % step) + step) % step))
    dot.current?.setAttribute('r', next.zoom < .5 ? '.8' : '1')
  }
  const publishViewport = () => {
    clearTimeout(publishTimer.current)
    useProject.getState().setViewport({ ...viewport.current })
  }
  const scheduleViewport = () => {
    clearTimeout(publishTimer.current)
    publishTimer.current = setTimeout(publishViewport, 120)
  }
  const localPoint = (client: Point) => {
    const rect = stage.current!.getBoundingClientRect()
    return { x: client.x - rect.left, y: client.y - rect.top }
  }
  const zoomCenter = (factor: number, absolute?: number) => {
    const el = stage.current
    if (!el) return
    paintViewport(zoomAt(viewport.current, { x: el.clientWidth / 2, y: el.clientHeight / 2 }, absolute ?? viewport.current.zoom * factor))
    publishViewport()
  }
  const fit = () => {
    const el = stage.current
    if (!el) return
    const s = useProject.getState()
    const ids = s.selected.length ? s.selected : s.project.board.order
    const bounds = boundsOf(ids.flatMap(id => s.project.board.items[id] ? [s.project.board.items[id]] : []))
    if (!bounds) { paintViewport({ x: 0, y: 0, zoom: 1 }); publishViewport(); return }
    const zoom = Math.max(.1, Math.min(2, (el.clientWidth - 180) / Math.max(bounds.width, 1), (el.clientHeight - 120) / Math.max(bounds.height, 1)))
    paintViewport({ x: el.clientWidth / 2 - (bounds.x + bounds.width / 2) * zoom, y: el.clientHeight / 2 - (bounds.y + bounds.height / 2) * zoom, zoom })
    publishViewport()
  }
  useImperativeHandle(apiRef, () => ({ zoom: zoomCenter, fit, resetZoom: () => zoomCenter(1, 1), flushViewport: publishViewport }))

  useEffect(() => {
    const el = stage.current!
    paintViewport(viewport.current)
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('textarea')) return
      e.preventDefault()
      if (gesture.current) return
      if (e.ctrlKey || e.metaKey) {
        paintViewport(zoomAt(viewport.current, localPoint({ x: e.clientX, y: e.clientY }), viewport.current.zoom * Math.exp(-e.deltaY * .008)))
      } else {
        const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
        paintViewport({ ...viewport.current, x: viewport.current.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * multiplier, y: viewport.current.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * multiplier })
      }
      scheduleViewport()
    }
    el.addEventListener('wheel', wheel, { passive: false })
    const keyDown = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return
      const s = useProject.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (e.code === 'Space') { e.preventDefault(); space.current = true; el.dataset.space = 'true'; return }
      if (key === 'escape') {
        if (gesture.current) {
          if (gesture.current.type === 'pan') { paintViewport(gesture.current.viewport); publishViewport() }
          gesture.current = null; nextPointer.current = null
          if (frame.current !== undefined) cancelAnimationFrame(frame.current)
          frame.current = undefined; s.endGesture(true)
        }
        s.select([]); s.setEditing(null); s.setTool('select'); delete el.dataset.dragging; return
      }
      if (gesture.current) return
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if (mod && key === 'y') { e.preventDefault(); s.redo(); return }
      if (mod && key === 'a') { e.preventDefault(); s.select(s.project.board.order); return }
      if (mod && key === 'd') { e.preventDefault(); s.duplicateSelected(); return }
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); s.deleteSelected(); return }
      if (key.startsWith('arrow') && s.selected.length) {
        e.preventDefault()
        const step = s.project.settings.snap ? GRID : e.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        s.updateItems(s.selected.map(id => ({ ...s.project.board.items[id], x: snap(s.project.board.items[id].x + dx, s.project.settings.snap), y: snap(s.project.board.items[id].y + dy, s.project.settings.snap) })))
        return
      }
      if (key === 'enter' && s.selected.length === 1) {
        const item = s.project.board.items[s.selected[0]]
        if (item && (item.type === 'sticky' || item.type === 'text')) { e.preventDefault(); s.setEditing(item.id) }
        return
      }
      if (mod || e.altKey) return
      const tools: Record<string, Tool> = { v: 'select', h: 'hand', t: 'text', s: 'sticky', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', p: 'pen' }
      if (tools[key]) { e.preventDefault(); s.setTool(tools[key]) }
      if (key === 'g') { e.preventDefault(); s.toggleSnap() }
      if (key === 'f') { e.preventDefault(); fit() }
      if (key === '=' || key === '+') { e.preventDefault(); zoomCenter(1.2) }
      if (key === '-') { e.preventDefault(); zoomCenter(1 / 1.2) }
      if (key === '0') { e.preventDefault(); zoomCenter(1, 1) }
    }
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { space.current = false; delete el.dataset.space } }
    const blur = () => {
      space.current = false; delete el.dataset.space
      if (gesture.current) {
        if (gesture.current.type === 'pan') { paintViewport(gesture.current.viewport); publishViewport() }
        gesture.current = null; nextPointer.current = null; sCancel(); delete el.dataset.dragging
      }
    }
    const sCancel = () => useProject.getState().endGesture(true)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
      clearTimeout(publishTimer.current)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      if (gesture.current) useProject.getState().endGesture(true)
      useProject.getState().setViewport({ ...viewport.current })
    }
    // This controller deliberately reads live state and refs instead of subscribing to viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    if ((e.target as HTMLElement).closest('textarea') || gesture.current) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    stage.current?.focus({ preventScroll: true })
    const state = useProject.getState()
    lastPointerItem.current = state.tool === 'select' ? (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]')?.dataset.itemId ?? null : null
    const client = { x: e.clientX, y: e.clientY }
    const point = worldPoint(localPoint(client), viewport.current)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (space.current || e.button === 1 || state.tool === 'hand') {
      e.preventDefault(); gesture.current = { type: 'pan', client, viewport: { ...viewport.current } }; e.currentTarget.dataset.dragging = 'true'; return
    }
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle
    const selectedItems = state.selected.flatMap(id => state.project.board.items[id] ? [state.project.board.items[id]] : [])
    const selectedBounds = boundsOf(selectedItems)
    if (handle && selectedBounds) {
      state.beginGesture(); gesture.current = { type: 'resize', anchor: point, items: selectedItems, bounds: selectedBounds, handle, moved: false }; return
    }
    if (state.tool !== 'select') {
      const anchor = state.tool === 'pen' ? point : { x: snap(point.x, grid), y: snap(point.y, grid) }
      gesture.current = { type: 'create', anchor, tool: state.tool, id: crypto.randomUUID(), points: [point], moved: false }
      state.select([])
      return
    }
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (id) {
      if (e.shiftKey && state.selected.includes(id)) { state.select(state.selected.filter(existing => existing !== id)); return }
      const ids = state.selected.includes(id) ? state.selected : e.shiftKey ? [...state.selected, id] : [id]
      state.select(ids)
      const items = ids.map(itemId => state.project.board.items[itemId])
      state.beginGesture(); gesture.current = { type: 'move', anchor: point, items, bounds: boundsOf(items)!, moved: false }
    } else {
      const original = e.shiftKey ? state.selected : []
      state.select(original)
      gesture.current = { type: 'marquee', anchor: point, original }
    }
  }

  const processPointer = (client: Point, shift: boolean) => {
    const current = gesture.current
    if (!current) return
    const state = useProject.getState()
    if (current.type === 'pan') {
      paintViewport({ ...current.viewport, x: current.viewport.x + client.x - current.client.x, y: current.viewport.y + client.y - current.client.y }); return
    }
    const point = worldPoint(localPoint(client), viewport.current)
    const snapping = state.project.settings.snap
    if (current.type === 'move' || current.type === 'resize') {
      current.moved ||= Math.hypot(point.x - current.anchor.x, point.y - current.anchor.y) * viewport.current.zoom > 2
      if (!current.moved) return
    }
    if (current.type === 'move') {
      const dx = snap(current.bounds.x + point.x - current.anchor.x, snapping) - current.bounds.x
      const dy = snap(current.bounds.y + point.y - current.anchor.y, snapping) - current.bounds.y
      if (!dx && !dy) return
      state.updateItems(current.items.map(item => ({ ...item, x: item.x + dx, y: item.y + dy })), false)
    } else if (current.type === 'resize') {
      const { bounds, handle } = current
      const dx = point.x - current.anchor.x
      const dy = point.y - current.anchor.y
      const west = handle.includes('w')
      const north = handle.includes('n')
      const opposite = { x: west ? bounds.x + bounds.width : bounds.x, y: north ? bounds.y + bounds.height : bounds.y }
      let x = snap((west ? bounds.x : bounds.x + bounds.width) + dx, snapping)
      let y = snap((north ? bounds.y : bounds.y + bounds.height) + dy, snapping)
      x = west ? Math.min(x, opposite.x - 12) : Math.max(x, opposite.x + 12)
      y = north ? Math.min(y, opposite.y - 12) : Math.max(y, opposite.y + 12)
      let to = rectangle(opposite, { x, y })
      if (shift) {
        const scale = Math.max(to.width / Math.max(bounds.width, 1), to.height / Math.max(bounds.height, 1))
        const width = Math.max(12, bounds.width * scale)
        const height = Math.max(12, bounds.height * scale)
        to = { x: west ? opposite.x - width : opposite.x, y: north ? opposite.y - height : opposite.y, width, height }
      }
      state.updateItems(resizeItems(current.items, bounds, to), false)
    } else if (current.type === 'marquee') {
      const bounds = rectangle(current.anchor, point)
      state.setMarquee(bounds)
      state.select([...new Set([...current.original, ...state.project.board.order.filter(id => intersects(bounds, state.project.board.items[id]))])])
    } else {
      let end = current.tool === 'pen' ? point : { x: snap(point.x, snapping), y: snap(point.y, snapping) }
      if (shift && current.tool !== 'pen' && current.tool !== 'text' && current.tool !== 'sticky') {
        const dx = end.x - current.anchor.x
        const dy = end.y - current.anchor.y
        const length = Math.max(Math.abs(dx), Math.abs(dy))
        if (current.tool === 'line' || current.tool === 'arrow') {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
          const distance = Math.hypot(dx, dy)
          end = { x: current.anchor.x + Math.cos(angle) * distance, y: current.anchor.y + Math.sin(angle) * distance }
        } else end = { x: current.anchor.x + Math.sign(dx || 1) * length, y: current.anchor.y + Math.sign(dy || 1) * length }
      }
      if (current.tool === 'pen') {
        const last = current.points.at(-1)!
        if (Math.hypot(point.x - last.x, point.y - last.y) > 1 / viewport.current.zoom) current.points.push(point)
      }
      current.moved ||= Math.hypot(end.x - current.anchor.x, end.y - current.anchor.y) * viewport.current.zoom > 4
      state.setDraft(newItem(current.tool, current.id, current.anchor, end, !current.moved, current.points))
    }
  }
  const pointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!gesture.current) return
    if (gesture.current.type === 'create' && gesture.current.tool === 'pen') {
      const stroke = gesture.current
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? []
      for (const sample of samples) {
        const point = worldPoint(localPoint({ x: sample.clientX, y: sample.clientY }), viewport.current)
        const last = stroke.points.at(-1)!
        if (Math.hypot(point.x - last.x, point.y - last.y) > 1 / viewport.current.zoom) stroke.points.push(point)
      }
    }
    nextPointer.current = { point: { x: e.clientX, y: e.clientY }, shift: e.shiftKey }
    if (frame.current !== undefined) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      if (nextPointer.current) processPointer(nextPointer.current.point, nextPointer.current.shift)
      nextPointer.current = null
    })
  }
  const pointerUp = (e: ReactPointerEvent<HTMLDivElement>, cancel = false) => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined; nextPointer.current = null
    const current = gesture.current
    if (!current) return
    if (!cancel) processPointer({ x: e.clientX, y: e.clientY }, e.shiftKey)
    gesture.current = null
    delete e.currentTarget.dataset.dragging
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const state = useProject.getState()
    if (current.type === 'pan') { if (cancel) paintViewport(current.viewport); publishViewport(); return }
    if (current.type === 'create') {
      const draft = state.draft
      state.setDraft(null)
      if (!cancel && draft) {
        state.addItems([draft])
        if (draft.type !== 'pen') state.setTool('select')
        if (draft.type === 'text' || draft.type === 'sticky') state.setEditing(draft.id)
      }
    } else {
      if (cancel && current.type === 'marquee') state.select(current.original)
      state.endGesture(cancel)
    }
  }

  const doubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('textarea')) return
    const state = useProject.getState()
    const item = lastPointerItem.current ? state.project.board.items[lastPointerItem.current] : undefined
    if (state.tool !== 'select' || space.current || !item || (item.type !== 'text' && item.type !== 'sticky')) return
    state.select([item.id])
    state.setEditing(item.id)
  }

  return <div ref={stage} className={styles.stage} data-tool={tool} tabIndex={0} aria-label="Whiteboard canvas" onDoubleClick={doubleClick} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e => pointerUp(e)} onPointerCancel={e => pointerUp(e, true)} onLostPointerCapture={e => { if (gesture.current) pointerUp(e, true) }}>
    <svg className={styles.grid} aria-hidden="true" style={{ display: grid ? 'block' : 'none' }}><defs><pattern ref={pattern} id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle ref={dot} cx="1" cy="1" r="1" fill="var(--grid)" /></pattern></defs><rect width="100%" height="100%" fill="url(#board-grid)" /></svg>
    {!order.length && <div className={styles.empty}><span>01 / Board</span><p>Choose a tool.</p><small>Click or drag to add text, notes, and shapes.<br />Space + drag to pan. Ctrl/Cmd + wheel to zoom.</small></div>}
    <div ref={world} className={styles.world}>{order.map(id => <Item key={id} id={id} />)}<Draft /><Marquee /><Selection /></div>
  </div>
})
