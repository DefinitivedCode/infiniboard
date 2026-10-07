import Dexie from 'dexie'
import type { Table } from 'dexie'
import { createAiSettingsStore } from './settingsStore'
import type { SettingsRecord } from './settingsStore'
import type { AiSettings } from './settings'

// Credentials are isolated from project snapshots, import/export, and undo history.
class AssistantDatabase extends Dexie {
  settings!: Table<SettingsRecord, string>
  constructor() {
    super('infiniboard-assistant')
    this.version(1).stores({ settings: 'id' })
    this.version(2).stores({ settings: 'id' }).upgrade(transaction =>
      transaction.table<SettingsRecord>('settings').toCollection().modify(record => {
        record.apiKey = ''; record.rememberKey = false
      }),
    )
  }
}
const db = new AssistantDatabase()
const preferences = createAiSettingsStore({ get: () => db.settings.get('preferences'), put: record => db.settings.put(record) })
export async function readAiSettings(): Promise<AiSettings> {
  return preferences.read()
}
export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await preferences.save(settings)
}
