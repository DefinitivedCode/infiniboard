import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { useProject } from '../../src/store/useProject'
import Dexie from 'dexie'
import '../../src/app/tokens.css'
import styles from './Performance.module.css'

// Serve on a disposable origin/profile: exercises real autosave without touching
// the user's workspace. All API requests are intercepted; no real key is needed.
let apiCalls = 0, otherCalls = 0, credentialInBody = false, credentialInUrl = false
const request: typeof fetch = async (input, init) => {
  const url = String(input)
  const authorization = new Headers(init?.headers).get('Authorization') ?? ''
  const credential = authorization.replace(/^Bearer /, '')
  credentialInBody ||= !!credential && String(init?.body).includes(credential)
  credentialInUrl ||= !!credential && url.includes(credential)
  if (url !== 'https://api.openai.com/v1/responses') {
    otherCalls++
    throw new Error('Unexpected application network request blocked by privacy fixture.')
  }
  apiCalls++
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ nodes: [
    { id: 'root', parentId: null, title: 'Workshop', body: 'A synthetic test plan.', importance: 4 },
    { id: 'venue', parentId: 'root', title: 'Venue', body: 'A room for the workshop.', importance: 3 },
    { id: 'materials', parentId: 'root', title: 'Materials', body: 'Paper and pens.', importance: 2 },
  ], links: [{ fromId: 'venue', toId: 'materials', label: 'store here' }], omitted: [] }) }] }] }))
}

export function PrivacyFixture() {
  const project = useProject(s => s.project)
  const [report, setReport] = useState('Not measured')
  const seedLegacy = async () => {
    if (await Dexie.exists('infiniboard-assistant')) { setReport('Use a fresh disposable origin for the migration check.'); return }
    const db = new Dexie('infiniboard-assistant')
    db.version(1).stores({ settings: 'id' })
    try {
      await db.table('settings').put({ id: 'preferences', apiKey: crypto.randomUUID(), model: 'migration-test-model', effort: 'high' })
      setReport('Synthetic legacy v1 preferences saved. Open Assistant settings to upgrade.')
    } finally { db.close() }
  }
  const measure = async () => {
    const db = new Dexie('infiniboard-assistant')
    db.version(2).stores({ settings: 'id' })
    try {
      const preferences = await db.table('settings').get('preferences') as { apiKey?: string; rememberKey?: boolean } | undefined
      const names = await Dexie.getDatabaseNames()
      setReport(`OpenAI calls (mocked): ${apiCalls}\nOther application requests: ${otherCalls}\nCredential in request body/URL: ${credentialInBody || credentialInUrl ? 'FAIL' : 'no'}\nRemember opted in: ${preferences?.rememberKey === true ? 'yes' : 'no'}\nCredential in IndexedDB: ${preferences?.apiKey ? 'yes' : 'no'}\nLocal project database: ${names.includes('infiniboard') ? 'yes' : 'no'}`)
    } finally { db.close() }
  }
  return <><App /><aside className={styles.metrics} style={{ left: 16, right: 'auto', bottom: 48, width: 300 }}>
    <h1>Privacy verification</h1><p>Disposable origin/profile. Real local autosave, mocked API. Never enter a real key here.</p>
    <output>{project.board.order.length} Board items · {project.graph.nodeOrder.length} nodes · {project.graph.edgeOrder.length} connections</output>
    <button onClick={() => { void measure() }}>Measure privacy</button>
    <button onClick={() => { void seedLegacy() }}>Seed legacy AI settings</button>
    <output aria-label="Privacy result" style={{ whiteSpace: 'pre-line' }}>{report}</output>
  </aside></>
}

if (import.meta.env.DEV) {
  window.fetch = request
  const root = createRoot(document.getElementById('root')!)
  root.render(<PrivacyFixture />)
  import.meta.hot?.dispose(() => root.unmount())
}
