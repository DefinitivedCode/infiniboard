import { z } from 'zod'
import { DEFAULT_OPTIONS, optionsSchema } from './options'
import type { OutputOptions } from './options'

const presetSchema = z.object({ id: z.string(), name: z.string().trim().min(1).max(80), options: optionsSchema, instruction: z.string().max(1000) }).strict()
export type AssistantPreset = z.infer<typeof presetSchema>
export const inputsSchema = z.object({
  text: z.string().max(200000), instruction: z.string().max(1000), options: optionsSchema,
  kind: z.enum(['build', 'expand', 'place']), scope: z.enum(['whole', 'branch']), selectedId: z.string().optional(),
}).strict()
export type SavedInputs = z.infer<typeof inputsSchema>
const generationSchema = z.object({
  id: z.string(), timestamp: z.number(), inputs: inputsSchema, nodeCount: z.number().int().nonnegative(), cost: z.number().nonnegative().nullable(),
}).strict()
export type GenerationRecord = z.infer<typeof generationSchema>
const recordSchema = z.object({ id: z.literal('library'), presets: z.array(presetSchema), history: z.array(generationSchema).max(10) }).strict()
export type LibraryRecord = z.infer<typeof recordSchema>
const builtin = (id: string, name: string, instruction: string, options: Partial<OutputOptions> = {}): AssistantPreset => ({ id: `builtin:${id}`, name, instruction, options: { ...DEFAULT_OPTIONS, ...options } })
export const BUILTIN_PRESETS: readonly AssistantPreset[] = [
  builtin('meeting', 'Meeting notes', 'Keep decisions, action owners, deadlines and unresolved questions. Prefix decision titles with Decision: and question titles with Question:.'),
  builtin('brainstorm', 'Brainstorm dump', 'Group related ideas, retain alternative approaches and open questions. Do not turn tentative ideas into commitments.', { branching: 'broad' }),
  builtin('chat', 'Chat or conversation extraction', 'Extract concrete points from conversation. Group by topic. Prefix decisions with Decision: and questions with Question:. Drop chat tags and speaker labels from titles; put relevant notes and attribution into bodies.', { fixSpelling: false, grouping: 'topic' }),
  builtin('study', 'Study notes', 'Organize concepts, definitions and supporting examples. Preserve qualifications and put explanations in bodies.', { depth: 'deep', detail: 'detailed' }),
]

type Storage = { get: () => Promise<LibraryRecord | undefined>; put: (record: LibraryRecord) => Promise<unknown> }
// The storage adapter contains no settings or graph snapshot. A serialized queue
// prevents preset edits and generation receipts from overwriting one another.
export function createAssistantLibrary(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve()
  const read = async () => recordSchema.parse(await storage.get() ?? { id: 'library', presets: [], history: [] })
  const mutate = (change: (record: LibraryRecord) => void) => {
    const operation = queue.then(async () => { const record = await read(); change(record); await storage.put(recordSchema.parse(record)) })
    queue = operation.catch(() => {})
    return operation
  }
  return {
    async read() { await queue; return read() },
    async savePreset(name: string, options: OutputOptions, instruction: string, id: string = crypto.randomUUID()) {
      if (id.startsWith('builtin:')) throw new Error('Save an editable copy of a built-in preset.')
      const preset = presetSchema.parse({ id, name, options, instruction })
      await mutate(record => { record.presets = [...record.presets.filter(p => p.id !== id), preset] })
      return preset
    },
    async renamePreset(id: string, name: string) {
      if (id.startsWith('builtin:')) throw new Error('Built-in presets cannot be renamed.')
      await mutate(record => {
        const preset = record.presets.find(p => p.id === id)
        if (!preset) throw new Error('Preset not found.')
        preset.name = presetSchema.shape.name.parse(name)
      })
    },
    async deletePreset(id: string) {
      if (id.startsWith('builtin:')) throw new Error('Built-in presets cannot be deleted.')
      await mutate(record => { record.presets = record.presets.filter(p => p.id !== id) })
    },
    async addGeneration(value: Omit<GenerationRecord, 'id'>) {
      const generation = generationSchema.parse({ ...value, id: crypto.randomUUID() })
      await mutate(record => { record.history = [generation, ...record.history].slice(0, 10) })
    },
  }
}
export type AssistantLibrary = ReturnType<typeof createAssistantLibrary>
