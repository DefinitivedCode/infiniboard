import { z } from 'zod'
import { buildRules, SYSTEM_PROMPT } from './prompt'
import { outputSchema, ProposalError, validateProposal } from './schema'
import type { Mode, Options, Proposal } from './schema'
import type { AiSettings } from './settings'

export const RESPONSES_URL = 'https://api.openai.com/v1/responses'
const usageSchema = z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).passthrough().optional() }).passthrough()
const responseSchema = z.object({
  model: z.string().optional(), status: z.string().optional(), usage: usageSchema.nullable().optional(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() }).passthrough()).optional() }).passthrough()),
}).passthrough()
export type Receipt = { input: number; cached: number; output: number; cost: number | null; model: string }
// Standard USD / million tokens, verified 2026-10-07 against official model documentation.
// Approximate: excludes regional premiums, cache-write charges, and account-specific tiers.
const prices: Record<string, [number, number, number]> = { 'gpt-6-luna': [.10, .01, .50], 'gpt-6-sol': [2, .20, 10], 'gpt-6-astra': [10, 1, 50] }
export function receiptFor(usage: z.infer<typeof usageSchema>, model: string): Receipt {
  const cached = Math.min(usage.input_tokens, usage.input_tokens_details?.cached_tokens ?? 0)
  const rate = prices[model]
  const multiplier = usage.input_tokens > 272000 ? [2, 2, 1.5] : [1, 1, 1]
  return { input: usage.input_tokens, cached, output: usage.output_tokens, model,
    cost: rate ? ((usage.input_tokens - cached) * rate[0] * multiplier[0] + cached * rate[1] * multiplier[1] + usage.output_tokens * rate[2] * multiplier[2]) / 1000000 : null }
}
export class AiError extends Error {}
function httpError(status: number): AiError {
  if (status === 401) return new AiError('OpenAI did not accept this API key. Check it in AI settings.')
  if (status === 429) return new AiError('OpenAI is limiting requests or your API quota is exhausted. Check your account and try again later.')
  if (status === 403) return new AiError('This account cannot access the requested model. Check your API permissions.')
  if (status === 400 || status === 404) return new AiError('OpenAI could not use these model settings. Check the model ID and reasoning effort.')
  return new AiError('OpenAI could not complete the request. Try again later.')
}
export type GenerationInput = { text: string; instruction: string; options: Options; mode: Mode }
export function generationMessage(input: GenerationInput): string {
  const mode = input.mode
  return JSON.stringify({
    mode: mode.kind === 'build' ? { mode: 'build', rootCount: 1 } : mode.kind === 'expand' ? { mode: 'expand', attachmentParentId: mode.selectedId } : { mode: 'place' },
    ...(mode.kind === 'build' ? {} : { existingGraph: mode.kind === 'place' ? mode.context : mode.context ?? [{ id: mode.selectedId, parentId: null, depth: 0, title: mode.title, body: mode.body.slice(0, 160) }] }),
    notes: input.text, instruction: input.instruction, options: input.options, rules: buildRules(input.options, mode.kind),
  })
}
export function estimateGeneration(input: GenerationInput, model: string) {
  const tokens = Math.ceil((SYSTEM_PROMPT.length + generationMessage(input).length) / 4)
  const output = (input.options.maxNodes ?? 60) * (input.options.detail === 'detailed' ? 180 : input.options.detail === 'titles' ? 65 : 110)
  return { tokens, output, cost: receiptFor({ input_tokens: tokens, output_tokens: output }, model).cost,
    scopeCount: input.mode.kind === 'build' ? 0 : input.mode.context?.length ?? 1 }
}
export async function generateMap(input: GenerationInput, settings: AiSettings, signal: AbortSignal, onReceipt: (receipt: Receipt) => void, request: typeof fetch = fetch): Promise<Proposal> {
  if (!settings.apiKey.trim()) throw new AiError('Add your OpenAI API key in AI settings before generating.')
  if (!input.text.trim()) throw new AiError('Paste some notes before generating.')
  if (input.text.length > 200000) throw new AiError('These notes are too long. Use fewer than 200,000 characters per map.')
  const message = generationMessage(input)
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    let response: Response
    try {
      response = await request(RESPONSES_URL, { method: 'POST', signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, reasoning: { effort: settings.effort }, store: false, max_output_tokens: 16000,
          input: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: message }, ...(attempt ? [{ role: 'user', content: 'The previous response failed validation. Return unique new IDs, valid parents without cycles, the required root/attachment, original omitted text, valid alreadyInMap IDs, placement reason/confidence, and only allowed cross-branch links. Respect every supplied rule, especially maxNodes.' }] : [])],
          text: { format: { type: 'json_schema', name: 'mind_map', strict: true, schema: outputSchema } },
        }),
      })
    } catch {
      signal.throwIfAborted()
      throw new AiError('Could not reach OpenAI. Check your connection and browser network access, then try again.')
    }
    if (!response.ok) throw httpError(response.status)
    try {
      const raw: unknown = await response.json()
      const envelope = responseSchema.safeParse(raw)
      if (!envelope.success) throw new ProposalError('The response did not match the map format.')
      const data = envelope.data
      if (data.usage) onReceipt(receiptFor(data.usage, data.model ?? settings.model))
      const content = data.output.flatMap(item => item.type === 'message' ? item.content ?? [] : [])
      if (content.some(item => item.type === 'refusal')) throw new AiError('OpenAI declined to process these notes. Try changing the input.')
      if (data.status && data.status !== 'completed') throw new ProposalError('OpenAI returned an unfinished map.')
      const text = content.filter(item => item.type === 'output_text').map(item => item.text ?? '').join('')
      return validateProposal(JSON.parse(text), input.mode, input.options, input.text)
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof AiError) throw error
      if (attempt === 1) throw new AiError(`OpenAI returned an invalid map twice. Nothing was added.${error instanceof ProposalError ? ` ${error.message}` : ' Try shorter notes or different instructions.'}`)
    }
  }
  throw new AiError('The map could not be generated.')
}
