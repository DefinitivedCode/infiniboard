import { z } from 'zod'
import { optionsSchema } from './options'
import type { ContextNode } from './context'
import type { Options } from './options'

export type Mode = { kind: 'build' } | { kind: 'expand'; selectedId: string; title: string; body: string; context?: ContextNode[] } | { kind: 'place'; context: ContextNode[] }
export type { Options } from './options'
const id = z.string().min(1).max(100).refine(value => value !== 'SELECTED', 'SELECTED is reserved for the attachment point.')
const nodeSchema = z.object({
  id, parentId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(180).refine(value => value.split(/\s+/u).length <= 8, 'Titles must have at most eight words.'),
  body: z.string().max(1200).nullable().optional(), importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  reason: z.string().trim().min(1).max(200).refine(value => value.split(/\s+/u).length <= 12).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
}).strict()
export const proposalSchema = z.object({
  nodes: z.array(nodeSchema).max(500),
  links: z.array(z.object({ fromId: id, toId: id, label: z.string().max(180).nullable().optional() }).strict()).max(1000).optional(),
  omitted: z.array(z.object({ text: z.string().min(1).max(20000), reason: z.enum(['repeat', 'off-topic', 'filler']) }).strict()).max(2000),
  alreadyInMap: z.array(z.object({ text: z.string().min(1).max(20000), existingId: z.string().min(1) }).strict()).max(2000).optional(),
}).strict()
export type Proposal = z.infer<typeof proposalSchema>

// The wire schema requires nullable optional fields, as strict Structured Outputs requires every property.
export const outputSchema = {
  type: 'object', additionalProperties: false, required: ['nodes', 'links', 'omitted', 'alreadyInMap'],
  properties: {
    nodes: { type: 'array', maxItems: 500, items: {
      type: 'object', additionalProperties: false, required: ['id', 'parentId', 'title', 'body', 'importance', 'reason', 'confidence'],
      properties: { id: { type: 'string' }, parentId: { type: ['string', 'null'] }, title: { type: 'string' }, body: { type: ['string', 'null'] }, importance: { type: 'integer', enum: [1, 2, 3, 4] }, reason: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] } },
    } },
    links: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false, required: ['fromId', 'toId', 'label'], properties: { fromId: { type: 'string' }, toId: { type: 'string' }, label: { type: ['string', 'null'] } } } },
    omitted: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: false, required: ['text', 'reason'], properties: { text: { type: 'string' }, reason: { type: 'string', enum: ['repeat', 'off-topic', 'filler'] } } } },
    alreadyInMap: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: false, required: ['text', 'existingId'], properties: { text: { type: 'string' }, existingId: { type: 'string' } } } },
  },
} as const

export class ProposalError extends Error {}
export function validateProposal(value: unknown, mode: Mode, options: Options, source?: string): Proposal {
  const parsed = proposalSchema.safeParse(value)
  if (!parsed.success) throw new ProposalError('The response did not match the map format. Try generating again.')
  const p = parsed.data
  const o = optionsSchema.parse(options)
  if (p.nodes.length > o.maxNodes) throw new ProposalError(`The response exceeds the hard limit of ${o.maxNodes} new nodes. Nothing was added.`)
  if (!o.crossLinks && p.links?.length) throw new ProposalError('The response includes cross-links although they are switched off.')
  const existing = new Set(mode.kind === 'build' ? [] : mode.context?.map(n => n.id) ?? (mode.kind === 'expand' ? [mode.selectedId] : []))
  const nodes = new Map(p.nodes.map(n => [n.id, n]))
  if (nodes.size !== p.nodes.length) throw new ProposalError('The response contains duplicate node identifiers.')
  if (p.nodes.some(n => existing.has(n.id))) throw new ProposalError('The response attempts to replace an existing node.')
  if (p.alreadyInMap?.some(item => !existing.has(item.existingId))) throw new ProposalError('Already in map references a missing existing node.')
  if (!p.nodes.length && !p.alreadyInMap?.length) throw new ProposalError('The response contains no new or already-covered points.')
  if (mode.kind === 'place' && p.nodes.some(n => !n.reason || !n.confidence)) throw new ProposalError('Every placed node needs a reason and confidence.')
  if (mode.kind === 'place' && !o.allowNewBranches) {
    const top = p.nodes.filter(n => n.parentId === null || (n.parentId !== null && existing.has(n.parentId)))
    const low = top.filter(n => n.confidence === 'low')
    if (low.some(n => n.title !== 'Unsorted') || low.length > 1) throw new ProposalError('Low-confidence new branches must share one Unsorted branch.')
  }
  if (!options.omitRepeatsAndOffTopic && p.omitted.length) throw new ProposalError('The response left out text even though omission is switched off.')
  if (source !== undefined && p.omitted.some(item => !source.includes(item.text))) throw new ProposalError('The left-out list does not preserve the original text.')
  const roots = p.nodes.filter(n => n.parentId === null)
  if (mode.kind === 'build' && roots.length !== 1) throw new ProposalError('The response needs exactly one master node.')
  if (mode.kind === 'expand' && p.nodes.length && (roots.length || !p.nodes.some(n => n.parentId === 'SELECTED' || n.parentId === mode.selectedId))) throw new ProposalError('The new branches must attach to the selected node.')
  const ancestors = new Map<string, Set<string>>()
  for (const node of p.nodes) {
    const visited = new Set<string>()
    let current = node
    while (true) {
      if (visited.has(current.id)) throw new ProposalError('The response contains a parent cycle.')
      visited.add(current.id)
      if (current.parentId === null) break
      if (current.parentId === 'SELECTED' && mode.kind === 'expand') break
      if (existing.has(current.parentId)) {
        if (mode.kind === 'expand' && current.parentId !== mode.selectedId) throw new ProposalError('Under selected must attach only to the selected node.')
        break
      }
      const parent = nodes.get(current.parentId)
      if (!parent) throw new ProposalError('The response references a missing parent.')
      current = parent
    }
    visited.delete(node.id)
    ancestors.set(node.id, visited)
  }
  const seen = new Set<string>()
  const links: NonNullable<Proposal['links']> = []
  for (const link of p.links ?? []) {
    const from = nodes.get(link.fromId), to = nodes.get(link.toId)
    if (!from || !to || from === to) throw new ProposalError('A cross-connection references a missing or identical node.')
    // Tree edges already express these relationships. Ignore redundant links in either direction.
    if (ancestors.get(from.id)?.has(to.id) || ancestors.get(to.id)?.has(from.id)) continue
    const pair = [from.id, to.id].sort().join('\0')
    if (seen.has(pair)) throw new ProposalError('The response repeats a cross-connection.')
    seen.add(pair)
    links.push(link)
  }
  return p.links === undefined ? p : { ...p, links }
}
