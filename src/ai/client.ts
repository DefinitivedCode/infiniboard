import { z } from 'zod'
import { SYSTEM_PROMPT } from './prompt'
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
export async function generateMap(input: GenerationInput, settings: AiSettings, signal: AbortSignal, onReceipt: (receipt: Receipt) => void, request: typeof fetch = fetch): Promise<Proposal> {
  if (!settings.apiKey.trim()) throw new AiError('Add your OpenAI API key in AI settings before generating.')
  if (!input.text.trim()) throw new AiError('Paste some notes before generating.')
  if (input.text.length > 200000) throw new AiError('These notes are too long. Use fewer than 200,000 characters per map.')
  const message = JSON.stringify({ mode: input.mode.kind === 'expand' ? { mode: 'expand', selectedNode: { title: input.mode.title, body: input.mode.body }, attachmentParentId: 'SELECTED' } : { mode: 'build', rootCount: 1 }, notes: input.text, instruction: input.instruction, options: input.options })
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    let response: Response
    try {
      response = await request(RESPONSES_URL, { method: 'POST', signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, reasoning: { effort: settings.effort }, store: false, max_output_tokens: 16000,
          input: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: message }, ...(attempt ? [{ role: 'user', content: 'The previous response failed validation. Return a complete map with unique IDs, no missing parents or cycles, the required root/SELECTED attachment, original omitted text, and only cross-branch links. Respect the supplied options.' }] : [])],
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
      if (attempt === 1) throw new AiError('OpenAI returned an invalid map twice. Nothing was added. Try shorter notes or different instructions.')
    }
  }
  throw new AiError('The map could not be generated.')
}
