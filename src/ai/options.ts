import { z } from 'zod'

export const optionsSchema = z.object({
  depth: z.enum(['shallow', 'balanced', 'deep']).default('balanced'),
  branching: z.enum(['broad', 'granular']).default('granular'),
  detail: z.enum(['titles', 'short', 'detailed']).default('short'),
  grouping: z.enum(['topic', 'chronological', 'person', 'custom']).default('topic'),
  maxNodes: z.number().int().min(1).max(500).default(60),
  crossLinks: z.boolean().default(true),
  allowNewBranches: z.boolean().default(true),
  fixSpelling: z.boolean(), omitRepeatsAndOffTopic: z.boolean(),
}).strict()
export type Options = z.input<typeof optionsSchema>
export type OutputOptions = z.output<typeof optionsSchema>
export const DEFAULT_OPTIONS: OutputOptions = optionsSchema.parse({ fixSpelling: true, omitRepeatsAndOffTopic: true })

// One pure translation point for all output dials, including placement rules.
export function buildRules(options: Options, mode: 'build' | 'expand' | 'place'): string[] {
  const o = optionsSchema.parse(options)
  const rules = [
    { shallow: 'Use at most 2 levels below the root or attachment point.', balanced: 'Use 3 to 4 levels below the root or attachment point when supported by the notes.', deep: 'Use 5 or more levels below the root or attachment point where the material supports meaningful nesting. Do not invent categories to reach a depth.' }[o.depth],
    o.branching === 'broad' ? 'Combine closely related facts into broader nodes; give each topic more direct children instead of inserting narrow intermediate categories.' : 'Separate specific facts, tasks and questions into distinct nodes; nest them under the most specific meaningful topic.',
    { titles: 'Return body as null for every node. Put all retained information in concise titles.', short: 'Use bodies of at most 2 short sentences; put supporting facts in bodies instead of long titles.', detailed: 'Use bodies of at most 4 sentences, retaining supporting facts, dates and qualifications.' }[o.detail],
    { topic: 'Group branches by shared subject or topic.', chronological: 'Group branches by time period or event, ordered from earliest to latest; retain unknown dates without inventing them.', person: 'Group branches by the named person responsible or discussed; use a shared topic branch when no person is identified.', custom: 'Use the grouping requested in the instruction field; if it specifies no grouping, group by shared topic.' }[o.grouping],
    `Return no more than ${o.maxNodes} new nodes in total, including roots and category nodes. This is a hard limit. Consolidate details into bodies within that limit.`,
    o.crossLinks ? 'Use links only for meaningful relationships across separate branches, never between ancestors or duplicates.' : 'Return links as an empty array. Create no cross-links.',
    o.fixSpelling ? 'Correct spelling and obvious grammar only. Preserve meaning, tone, proper nouns, usernames, code and uncertain foreign words exactly.' : 'Keep the original spelling and wording. Do not correct typos or rewrite for style.',
    o.omitRepeatsAndOffTopic ? 'Consolidate repeats without losing extra facts. List every removed repeat, unrelated stray thought or filler in omitted with its exact original text and reason. Keep uncertain points and all facts, tasks, names, dates and decisions.' : 'Do not omit or merge any input points. Return omitted as an empty array. Put unrelated points under Other thoughts.',
  ]
  if (mode === 'place') rules.push(
    'Match by meaning, not wording. Attach each new point under the most specific existing node it belongs to, even deep in the tree.',
    'Never create a node that duplicates an existing point. List that point in alreadyInMap with its real existingId.',
    'Prefer an existing branch over a new top-level topic whenever one reasonably fits.',
    o.allowNewBranches ? 'If nothing fits well, create a new branch under the existing root if there is a single root, otherwise standalone, with confidence low. Do not force a bad fit.' : 'If no existing topic fits with high or medium confidence, put those points in one new branch titled Unsorted under the existing root if there is a single root, otherwise standalone. Use confidence low; create no other low-confidence new branches.',
    'Do not edit, rename, move, delete or restructure any existing node. Return only new nodes, each with a new unique id.',
    'Every new node must include a reason of at most 12 words explaining its placement and confidence high, medium or low.',
  )
  return rules
}
