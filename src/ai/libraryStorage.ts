import Dexie from 'dexie'
import type { Table } from 'dexie'
import { createAssistantLibrary } from './library'
import type { LibraryRecord } from './library'

// Separate from projects and credentials; upgrading this DB cannot migrate keys.
class LibraryDatabase extends Dexie {
  library!: Table<LibraryRecord, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ library: 'id' })
  }
}
export function createLibraryStorage(name = 'infiniboard-assistant-library') {
  const db = new LibraryDatabase(name)
  return createAssistantLibrary({ get: () => db.library.get('library'), put: record => db.library.put(record) })
}
export const assistantLibrary = createLibraryStorage()
