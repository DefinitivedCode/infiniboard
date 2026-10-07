import { z } from 'zod'
export const settingsSchema = z.object({
  apiKey: z.string().trim().max(1000), model: z.string().trim().min(1).max(100),
  effort: z.enum(['none', 'low', 'medium', 'high']),
  rememberKey: z.boolean().default(false),
}).strict()
export type AiSettings = z.infer<typeof settingsSchema>
export const DEFAULT_SETTINGS: AiSettings = { apiKey: '', model: 'gpt-6-luna', effort: 'low', rememberKey: false }
