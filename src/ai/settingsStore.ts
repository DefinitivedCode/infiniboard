import { DEFAULT_SETTINGS, settingsSchema } from './settings'
import type { AiSettings } from './settings'

export type SettingsRecord = Omit<AiSettings, 'rememberKey'> & { id: string; rememberKey?: boolean }
type Storage = { get: () => Promise<SettingsRecord | undefined>; put: (record: SettingsRecord) => Promise<unknown> }

/** Session keys stay in memory; only explicitly opted-in keys enter IndexedDB. */
export function createAiSettingsStore(storage: Storage) {
  let session: AiSettings | undefined
  return {
    async read(): Promise<AiSettings> {
      if (session) return { ...session }
      const record = await storage.get()
      if (!record) return { ...DEFAULT_SETTINGS }
      const settings = settingsSchema.parse({ apiKey: record.rememberKey === true ? record.apiKey : '',
        model: record.model, effort: record.effort, rememberKey: record.rememberKey === true })
      // Purge legacy credentials that were saved without an explicit opt-in.
      if (record.apiKey && record.rememberKey !== true) await storage.put({ ...settings, id: 'preferences' })
      session = settings
      return { ...settings }
    },
    async save(value: AiSettings): Promise<void> {
      const settings = settingsSchema.parse(value)
      await storage.put({ ...settings, apiKey: settings.rememberKey ? settings.apiKey : '', id: 'preferences' })
      session = settings
    },
  }
}
