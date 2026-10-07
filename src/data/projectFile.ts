import type { Project } from './types'
import { MIN_SIZE, MAX_SIZE } from '../graph/model'

export const FILE_VERSION = 2
type ObjectValue = Record<string, unknown>

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function object(value: unknown, name: string): ObjectValue {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `The file has an invalid ${name}.`)
  return value as ObjectValue
}

function fields(value: ObjectValue, allowed: string[], name: string) {
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `The file has unrecognized fields in ${name}.`)
}

function number(value: unknown, name: string, minimum = -Infinity, maximum = Infinity): asserts value is number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum, `The file has an invalid ${name}.`)
}

function text(value: unknown, name: string): asserts value is string {
  requireValue(typeof value === 'string', `The file has invalid ${name}; it must be text.`)
}

function point(value: unknown, name: string, normalized = false) {
  const p = object(value, name)
  fields(p, ['x', 'y'], name)
  number(p.x, `${name} horizontal position`, normalized ? 0 : -Infinity, normalized ? 1 : Infinity)
  number(p.y, `${name} vertical position`, normalized ? 0 : -Infinity, normalized ? 1 : Infinity)
}

function viewport(value: unknown, name: string) {
  const v = object(value, `${name} viewport`)
  fields(v, ['x', 'y', 'zoom'], `${name} viewport`)
  number(v.x, `${name} viewport position`); number(v.y, `${name} viewport position`)
  number(v.zoom, `${name} zoom level`, .1, 4)
}

function record(value: unknown, order: unknown, name: string, validate: (item: ObjectValue, id: string) => void): ObjectValue {
  const items = object(value, `${name} collection`)
  const keys = Object.keys(items)
  requireValue(Array.isArray(order) && order.every(id => typeof id === 'string') && new Set(order).size === order.length && order.length === keys.length && order.every(id => Object.hasOwn(items, id)), `The file has an invalid ${name} order or missing items.`)
  for (const id of keys) {
    requireValue(id.length > 0 && id !== '__proto__' && !Object.hasOwn(Object.prototype, id), `The file has an invalid ${name} identifier.`)
    const item = object(items[id], name)
    requireValue(item.id === id, `The file has a mismatched ${name} identifier.`)
    validate(item, id)
  }
  return items
}

function boardItem(item: ObjectValue) {
  const base = ['id', 'type', 'x', 'y', 'width', 'height']
  const name = 'Board item'
  number(item.x, 'Board item position'); number(item.y, 'Board item position')
  number(item.width, 'Board item width', Number.MIN_VALUE); number(item.height, 'Board item height', Number.MIN_VALUE)
  if (item.type === 'text' || item.type === 'sticky') {
    fields(item, [...base, 'text', 'fontSize', 'minHeight', ...(item.type === 'sticky' ? ['swatch'] : [])], name)
    text(item.text, 'Board text'); number(item.fontSize, 'text size', Number.MIN_VALUE)
    if (item.minHeight !== undefined) number(item.minHeight, 'minimum text height', Number.MIN_VALUE, item.height)
  } else if (item.type === 'rect' || item.type === 'ellipse') {
    fields(item, [...base, 'swatch'], name)
  } else if (item.type === 'line' || item.type === 'arrow') {
    fields(item, [...base, 'start', 'end'], name)
    point(item.start, 'line start', true); point(item.end, 'line end', true)
  } else if (item.type === 'pen') {
    fields(item, [...base, 'points'], name)
    requireValue(Array.isArray(item.points) && item.points.length > 0, 'The file has an invalid pen stroke.')
    item.points.forEach(p => point(p, 'pen point', true))
  } else throw new Error('The file contains an unsupported Board item type.')
  if (item.type === 'sticky' || item.type === 'rect' || item.type === 'ellipse') {
    requireValue(typeof item.swatch === 'string' && ['oat', 'sage', 'rose', 'paper', ...(item.type === 'sticky' ? [] : ['none'])].includes(item.swatch), 'The file has an invalid Board fill color.')
  }
}

export function parseProjectFile(contents: string): Project {
  let parsed: unknown
  try { parsed = JSON.parse(contents) } catch { throw new Error('This file is not valid JSON. Choose an Infiniboard JSON export.') }
  const file = object(parsed, 'project file')
  requireValue(file.format === 'infiniboard', 'This is not an Infiniboard project file.')
  requireValue(typeof file.version === 'number' && Number.isInteger(file.version), 'The file is missing a valid version number.')
  requireValue(file.version === FILE_VERSION, `This file uses version ${file.version}. This app can open version ${FILE_VERSION}.`)
  fields(file, ['format', 'version', 'project'], 'project file')
  const p = object(file.project, 'project')
  fields(p, ['id', 'version', 'title', 'updatedAt', 'board', 'graph', 'settings'], 'project')
  requireValue(p.id === 'local-project' && p.version === 2, 'The file is missing a valid local project or uses an unsupported project version.')
  text(p.title, 'project title'); number(p.updatedAt, 'project date', 0)
  const board = object(p.board, 'Board canvas')
  fields(board, ['items', 'order', 'viewport'], 'Board canvas')
  record(board.items, board.order, 'Board item', boardItem); viewport(board.viewport, 'Board')
  const graph = object(p.graph, 'Graph canvas')
  fields(graph, ['nodes', 'nodeOrder', 'edges', 'edgeOrder', 'viewport'], 'Graph canvas')
  const nodes = record(graph.nodes, graph.nodeOrder, 'Graph node', node => {
    fields(node, ['id', 'title', 'body', 'x', 'y', 'width', 'height', 'importance'], 'Graph node')
    text(node.title, 'node title'); text(node.body, 'node body')
    number(node.x, 'node position'); number(node.y, 'node position')
    number(node.width, 'node width', MIN_SIZE.width, MAX_SIZE.width)
    number(node.height, 'node height', MIN_SIZE.height, MAX_SIZE.height)
    if (node.importance !== undefined) requireValue([1, 2, 3, 4].includes(node.importance as number), 'The file has an invalid node importance.')
  })
  record(graph.edges, graph.edgeOrder, 'Graph edge', edge => {
    fields(edge, ['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'label'], 'Graph edge')
    requireValue(typeof edge.source === 'string' && typeof edge.target === 'string' && Object.hasOwn(nodes, edge.source) && Object.hasOwn(nodes, edge.target) && edge.source !== edge.target, 'The file has a connection with a missing or invalid node.')
    for (const handle of [edge.sourceHandle, edge.targetHandle]) requireValue(handle === undefined || (typeof handle === 'string' && ['left', 'right', 'top', 'bottom'].includes(handle)), 'The file has an invalid connection handle.')
    if (edge.label !== undefined) text(edge.label, 'connection label')
  })
  viewport(graph.viewport, 'Graph')
  const settings = object(p.settings, 'settings')
  fields(settings, ['theme', 'snap'], 'settings')
  requireValue(typeof settings.snap === 'boolean' && (settings.theme === 'light' || settings.theme === 'dark'), 'The file has invalid theme or grid settings.')
  // Validation is complete before callers can replace any live state. Preserve every stored value.
  return p as Project
}

export function serializeProject(project: Project): string {
  // Whitelist fields so local assistant preferences cannot hitch a ride in exports.
  const { id, version, title, updatedAt, board, graph } = project
  const settings = { theme: project.settings.theme, snap: project.settings.snap }
  return JSON.stringify({ format: 'infiniboard', version: FILE_VERSION, project: { id, version, title, updatedAt, board, graph, settings } }, null, 2)
}

export function projectFilename(backup = false, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `infiniboard-${day}${backup ? '-backup' : ''}.json`
}
