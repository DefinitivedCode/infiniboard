import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Graph } from '../../src/graph/Graph'
import { useProject } from '../../src/store/useProject'
import { useGraph } from '../../src/store/useGraph'
import { createProject } from '../../src/data/types'
import { DEFAULT_SETTINGS } from '../../src/ai/settings'
import type { AiSettings } from '../../src/ai/settings'
import type { Proposal } from '../../src/ai/schema'
import { createAssistantLibrary } from '../../src/ai/library'
import type { LibraryRecord } from '../../src/ai/library'
import { createLibraryStorage } from '../../src/ai/libraryStorage'
import { serializeProject } from '../../src/data/projectFile'
import '../../src/app/tokens.css'
import styles from './AssistantFixture.module.css'

let preferences: AiSettings = { ...DEFAULT_SETTINGS, apiKey: crypto.randomUUID() }
const loadSettings = async () => ({ ...preferences })
const storeSettings = async (next: AiSettings) => { preferences = { ...next } }
let scenario = 'success'
let calls = 0
let libraryRecord: LibraryRecord | undefined
const persistentFixture = new URLSearchParams(location.search).has('indexeddb')
const library = persistentFixture ? createLibraryStorage('infiniboard-assistant-verification') : createAssistantLibrary({ get: async () => structuredClone(libraryRecord), put: async value => { libraryRecord = structuredClone(value) } })
let lastRequest = ''
const request: typeof fetch = async (_, init) => {
  calls++
  if (scenario === 'cancel') return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
  if (scenario === '401' || scenario === '429') return new Response('', { status: Number(scenario) })
  if (scenario === 'network') throw new TypeError('Network unavailable')
  const body = JSON.parse(String(init?.body))
  const user = JSON.parse(body.input[1].content)
  const expanded = user.mode.mode === 'expand'
  const placed = user.mode.mode === 'place'
  lastRequest = `${user.mode.mode} · ${user.existingGraph?.length ?? 0} context nodes · instruction: ${user.instruction}`
  const proposal: Proposal = {
    nodes: [
      { id: 'root', parentId: expanded ? user.mode.attachmentParentId : placed ? user.existingGraph[0]?.id ?? null : null, title: expanded ? 'Next steps' : 'Workshop plan', body: 'Organize the notes into a practical plan.', importance: 4, reason: 'Supports existing planning', confidence: 'high' },
      { id: 'materials', parentId: 'root', title: 'Materials', body: 'Prepare paper and pens.', importance: 3, reason: 'Workshop preparation', confidence: 'high' },
      { id: 'schedule', parentId: 'root', title: 'Schedule', body: 'Set a date for the workshop.', importance: 2, reason: 'Workshop timing', confidence: 'medium' },
      { id: 'paper', parentId: 'materials', title: 'Paper and pens', body: '', importance: 1, reason: 'Materials detail', confidence: 'high' },
    ], links: user.options.crossLinks ? [{ fromId: 'paper', toId: 'schedule', label: 'prepare before' }] : [],
    omitted: user.options.omitRepeatsAndOffTopic ? [{ text: 'anyway', reason: 'filler' }, { text: 'paper again', reason: 'repeat' }] : [],
    alreadyInMap: placed && user.existingGraph.length ? [{ text: 'Planning already covered', existingId: user.existingGraph[0].id }] : [],
  }
  if (scenario === 'invalid' || (scenario === 'retry' && calls === 1)) proposal.nodes[1].parentId = 'missing'
  const content = scenario === 'refusal' ? [{ type: 'refusal', refusal: 'Declined' }] : [{ type: 'output_text', text: JSON.stringify(proposal) }]
  return new Response(JSON.stringify({ status: 'completed', model: body.model, output: [{ type: 'message', content }], usage: { input_tokens: 1000, output_tokens: 600, input_tokens_details: { cached_tokens: 200 } } }))
}
const assistantProps = { request, loadSettings, storeSettings, library }
const project = createProject()
project.graph.nodes.existing = { id: 'existing', title: 'Existing planning', body: 'Keep this node unchanged.', x: 80, y: 100, width: 288, height: 192 }
project.graph.nodeOrder = ['existing']
project.graph.nodes.other = { ...project.graph.nodes.existing, id: 'other', title: 'Other branch', x: 600 }
project.graph.nodes.child = { ...project.graph.nodes.existing, id: 'child', title: 'Planning detail', x: 80, y: 500 }
project.graph.nodeOrder.push('other', 'child')
project.graph.edges.branch = { id: 'branch', source: 'existing', target: 'child', sourceHandle: 'bottom', targetHandle: 'top', label: '' }
project.graph.edgeOrder = ['branch']
useProject.getState().hydrate(project)

export function Fixture() {
  const graph = useProject(s => s.project.graph)
  const past = useGraph(s => s.past.length)
  const [, refresh] = useState(0)
  return <>
    <Graph assistantProps={assistantProps} />
    <aside className={styles.metrics}>
      <h1>Assistant verification</h1><p>Mocked fetch / {persistentFixture ? 'separate test IndexedDB library' : 'memory only'}. Saved projects and keys are untouched.</p>
      <label>Response scenario<select value={scenario} onChange={e => { scenario = e.target.value; calls = 0; refresh(n => n + 1) }}>{['success', 'retry', 'invalid', 'cancel', '401', '429', 'network', 'refusal'].map(value => <option key={value}>{value}</option>)}</select></label>
      <output>{graph.nodeOrder.length} nodes · {graph.edgeOrder.length} edges · {past} undo steps</output>
      <button onClick={() => useGraph.getState().select([])}>Clear selection</button><button onClick={() => useGraph.getState().select(['existing'])}>Select existing node</button>
      <button onClick={() => useGraph.getState().select(graph.nodeOrder)}>Select all nodes</button>
      <button onClick={() => useGraph.getState().undo()}>Undo graph</button><button onClick={() => useGraph.getState().redo()}>Redo graph</button>
      <button onClick={() => { useProject.getState().toggleSnap(); refresh(n => n + 1) }}>Toggle grid</button>
      <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }}>Toggle theme</button>
      <button onClick={() => { refresh(n => n + 1) }}>Refresh diagnostics</button>
      <output>Mocked calls: {calls} · Credential stored: {preferences.apiKey ? 'yes' : 'no'}</output>
      <output>Last request: {lastRequest}</output>
      <output>Export contains credentials: {serializeProject(useProject.getState().project).includes(preferences.apiKey) && preferences.apiKey ? 'yes' : 'no'}</output>
    </aside>
  </>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Fixture />)
