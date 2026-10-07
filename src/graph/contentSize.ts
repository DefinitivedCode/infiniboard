import { MAX_SIZE, MIN_SIZE, PRESETS } from './model'
import type { Preset } from './model'

export type TextMeasure = (text: string, kind: 'title' | 'body', preset: Preset) => number
let context: CanvasRenderingContext2D | null | undefined
const measureText: TextMeasure = (text, kind, preset) => {
  const scale = PRESETS[preset], fontSize = kind === 'title' ? scale.titleSize : scale.bodySize
  if (context === undefined && typeof document !== 'undefined') context = document.createElement('canvas').getContext('2d')
  if (context) {
    context.font = `${fontSize}px ${kind === 'title' ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Arial, sans-serif'}`
    return context.measureText(text).width
  }
  // Deterministic fallback for Node tests/non-DOM consumers; the browser uses actual font metrics.
  return Array.from(text).reduce((width, char) => width + fontSize * (char.codePointAt(0)! > 0x24f ? 1 : .58), 0)
}

function lineCount(text: string, width: number, measure: (text: string) => number): number {
  return text.split('\n').reduce((total, paragraph) => {
    let lines = 1, used = 0
    for (const token of paragraph.match(/\S+|[^\S\n]+/gu) ?? []) {
      const length = measure(token)
      if (length <= width) {
        if (used && used + length > width) { lines++; used = 0 }
        // Spaces at a wrap boundary do not create an extra line.
        if (used || token.trim()) used += length
      } else {
        if (used) { lines++; used = 0 }
        for (const char of token) {
          const length = measure(char)
          if (used && used + length > width) { lines++; used = 0 }
          used += length
        }
      }
    }
    return total + lines
  }, 0)
}

export function contentHeight(title: string, body: string, width: number, preset: Preset, measure: TextMeasure = measureText): number {
  const scale = PRESETS[preset], chrome = scale.padding * 2 + 2
  const inner = width - chrome
  const titleHeight = lineCount(title, inner, text => measure(text, 'title', preset)) * scale.titleSize * 1.2
  const bodyHeight = body ? lineCount(body, inner, text => measure(text, 'body', preset)) * scale.bodySize * 1.45 : 0
  // Match the title's 60% cap when a body exists; reserve a small font-rounding allowance.
  return Math.ceil(chrome + Math.max(titleHeight + (body ? 12 + bodyHeight : 0), body ? titleHeight / .6 : titleHeight) + 8)
}

// Call only for new generated cards or an explicit preset action. Stored dimensions remain authoritative.
export function fitNodeContent(title: string, body: string, preset: Preset, measure: TextMeasure = measureText): { width: number; height: number } {
  const scale = PRESETS[preset], chrome = scale.padding * 2 + 2
  const titleWidth = measure(title, 'title', preset), bodyWidth = measure(body, 'body', preset)
  const textArea = titleWidth * scale.titleSize * 1.2 + bodyWidth * scale.bodySize * 1.45
  const desired = body ? Math.sqrt(textArea * 1.8) + chrome : Math.min(titleWidth + chrome, Math.max(scale.width, 384))
  let width = Math.min(MAX_SIZE.width, Math.ceil(Math.max(scale.width, desired) / 24) * 24)
  let required = contentHeight(title, body, width, preset, measure)
  while (required > MAX_SIZE.height && width < MAX_SIZE.width) {
    width = Math.min(MAX_SIZE.width, width + 24)
    required = contentHeight(title, body, width, preset, measure)
  }
  const minimumHeight = Math.max(MIN_SIZE.height, scale.padding * 2 + scale.titleSize * 2.4)
  const height = Math.min(MAX_SIZE.height, Math.ceil(Math.max(minimumHeight, required) / 24) * 24)
  return { width, height }
}
