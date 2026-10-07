import { z } from 'zod'

export type Mode = { kind: 'build' } | { kind: 'expand'; selectedId: string; title: string; body: string }
export type Options = { fixSpelling: boolean; omitRepeatsAndOffTopic: boolean }
const id = z.string().min(1).max(100).refine(value => value !== 'SELECTED', 'SELECTED is reserved for the attachment point.')
const nodeSchema = z.object({
  id, parentId: z.string().min(1).max(100).nullable(),
  title: z.string().trim().min(1).max(180).refine(value => value.split(/\s+/u).length <= 8, 'Titles must have at most eight words.'),
  body: z.string().max(1200).nullable().optional(), importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
}).strict()
export const proposalSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(500),
  links: z.array(z.object({ fromId: id, toId: id, label: z.string().max(180).nullable().optional() }).strict()).max(1000).optional(),
  omitted: z.array(z.object({ text: z.string().min(1).max(20000), reason: z.enum(['repeat', 'off-topic', 'filler']) }).strict()).max(2000),
}).strict()
export type Proposal = z.infer<typeof proposalSchema>

// The wire schema requires nullable optional fields, as strict Structured Outputs requires every property.
export const outputSchema = {
  type: 'object', additionalProperties: false, required: ['nodes', 'links', 'omitted'],
  properties: {
    nodes: { type: 'array', minItems: 1, maxItems: 500, items: {
      type: 'object', additionalProperties: false, required: ['id', 'parentId', 'title', 'body', 'importance'],
      properties: { id: { type: 'string' }, parentId: { type: ['string', 'null'] }, title: { type: 'string' }, body: { type: ['string', 'null'] }, importance: { type: 'integer', enum: [1, 2, 3, 4] } },
    } },
    links: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false, required: ['fromId', 'toId', 'label'], properties: { fromId: { type: 'string' }, toId: { type: 'string' }, label: { type: ['string', 'null'] } } } },
    omitted: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: false, required: ['text', 'reason'], properties: { text: { type: 'string' }, reason: { type: 'string', enum: ['repeat', 'off-topic', 'filler'] } } } },
  },
} as const

export class ProposalError extends Error {}
export function validateProposal(value: unknown, mode: Mode, options: Options, source?: string): Proposal {
  const parsed = proposalSchema.safeParse(value)
  if (!parsed.success) throw new ProposalError('The response did not match the map format. Try generating again.')
  const p = parsed.data
  const nodes = new Map(p.nodes.map(n => [n.id, n]))
  if (nodes.size !== p.nodes.length) throw new ProposalError('The response contains duplicate node identifiers.')
  if (!options.omitRepeatsAndOffTopic && p.omitted.length) throw new ProposalError('The response left out text even though omission is switched off.')
  if (source !== undefined && p.omitted.some(item => !source.includes(item.text))) throw new ProposalError('The left-out list does not preserve the original text.')
  const roots = p.nodes.filter(n => n.parentId === null)
  if (mode.kind === 'build' && roots.length !== 1) throw new ProposalError('The response needs exactly one master node.')
  if (mode.kind === 'expand' && (roots.length || !p.nodes.some(n => n.parentId === 'SELECTED'))) throw new ProposalError('The new branches must attach to the selected node.')
  const ancestors = new Map<string, Set<string>>()
  for (const node of p.nodes) {
    const visited = new Set<string>()
    let current = node
    while (true) {
      if (visited.has(current.id)) throw new ProposalError('The response contains a parent cycle.')
      visited.add(current.id)
      if (current.parentId === null) break
      if (current.parentId === 'SELECTED') {
        if (mode.kind !== 'expand') throw new ProposalError('The response references a selected node in a new map.')
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
