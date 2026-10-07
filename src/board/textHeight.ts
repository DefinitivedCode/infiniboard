import type { BoardItem, StickyItem, TextItem } from '../data/types'

type TextBox = TextItem | StickyItem
let measurement: HTMLDivElement | undefined

export function textBoxHeight(contentHeight: number, type: TextBox['type'], minimum: number): number {
  // Sticky padding + border is 34px; plain text padding is 8px.
  return Math.max(minimum, Math.ceil(contentHeight + (type === 'sticky' ? 34 : 8)))
}

export function fitTextHeight(item: BoardItem, previous?: BoardItem): BoardItem {
  if (item.type !== 'text' && item.type !== 'sticky') return item
  if (previous && (previous.type === 'text' || previous.type === 'sticky') && previous.text === item.text && previous.width === item.width && previous.height === item.height && previous.fontSize === item.fontSize) return item
  if (typeof document === 'undefined') return item
  const before = previous && (previous.type === 'text' || previous.type === 'sticky') ? previous : undefined
  const minimum = before && before.width === item.width && before.height !== item.height
    ? item.height : before?.minHeight ?? item.minHeight ?? before?.height ?? item.height
  measurement ??= document.createElement('div')
  if (!measurement.isConnected) document.body.append(measurement)
  Object.assign(measurement.style, {
    position: 'fixed', left: '-20000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '0', border: '0',
    fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: `${item.fontSize}px`, lineHeight: '1.45',
    width: `${Math.max(1, item.width - (item.type === 'sticky' ? 34 : 8))}px`,
  })
  measurement.textContent = `${item.text}\u200b`
  const height = textBoxHeight(measurement.getBoundingClientRect().height, item.type, minimum)
  return { ...item, minHeight: minimum, height }
}
