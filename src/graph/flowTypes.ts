import type { Edge, Node } from '@xyflow/react'
import type { Project } from '../data/types'

export type FlowNode = Node<{ id: string }, 'idea'>
export type FlowEdge = Edge<{ id: string }, 'connection'>
export const RECONNECT_RADIUS = 12

// Adapters retain object identities for every unchanged node/edge, including data and style.
export function createFlowAdapters() {
  const nodes = new Map<string, { model: Project['graph']['nodes'][string]; selected: boolean; flow: FlowNode }>()
  const edges = new Map<string, { model: Project['graph']['edges'][string]; selected: boolean; flow: FlowEdge }>()
  return {
    nodes(models: Project['graph']['nodes'], order: string[], selection: string[]): FlowNode[] {
      const selected = new Set(selection)
      const present = new Set(order)
      for (const id of nodes.keys()) if (!present.has(id)) nodes.delete(id)
      return order.map(id => {
        const model = models[id]
        const cached = nodes.get(id)
        const active = selected.has(id)
        if (cached?.model === model && cached.selected === active) return cached.flow
        const flow: FlowNode = {
          id, type: 'idea', position: cached && cached.model.x === model.x && cached.model.y === model.y ? cached.flow.position : { x: model.x, y: model.y },
          data: cached?.flow.data ?? { id },
          style: cached && cached.model.width === model.width && cached.model.height === model.height ? cached.flow.style : { width: model.width, height: model.height },
          width: model.width, height: model.height, selected: active,
        }
        nodes.set(id, { model, selected: active, flow })
        return flow
      })
    },
    edges(models: Project['graph']['edges'], order: string[], selection: string[]): FlowEdge[] {
      const selected = new Set(selection)
      const present = new Set(order)
      for (const id of edges.keys()) if (!present.has(id)) edges.delete(id)
      return order.map(id => {
        const model = models[id]
        const cached = edges.get(id)
        const active = selected.has(id)
        if (cached?.model === model && cached.selected === active) return cached.flow
        const flow: FlowEdge = { id, type: 'connection', source: model.source, target: model.target, sourceHandle: model.sourceHandle, targetHandle: model.targetHandle, data: cached?.flow.data ?? { id }, selected: active, reconnectable: true }
        edges.set(id, { model, selected: active, flow })
        return flow
      })
    },
  }
}
