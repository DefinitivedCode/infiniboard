import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../app/Icon'
import { useGraph } from '../store/useGraph'
import { useProject } from '../store/useProject'
import { AiError, generateMap } from './client'
import type { Receipt } from './client'
import { restoreItems, layoutProposal } from './layout'
import type { Mode, Proposal } from './schema'
import { AiSettingsDialog } from './AiSettingsDialog'
import { DEFAULT_SETTINGS } from './settings'
import type { AiSettings } from './settings'
import { readAiSettings, saveAiSettings } from './settingsStorage'
import styles from './Assistant.module.css'

// Injection is used only by the development browser fixture: no real calls or IndexedDB writes there.
export type AssistantProps = { request?: typeof fetch; loadSettings?: () => Promise<AiSettings>; storeSettings?: (settings: AiSettings) => Promise<void> }
type Preview = { proposal: Proposal; mode: Mode }
function Outline({ nodes, parent }: { nodes: Proposal['nodes']; parent: string | null }) {
  const children = nodes.filter(n => n.parentId === parent)
  if (!children.length) return null
  return <ul className={styles.outline}>{children.map(n => <li key={n.id}><div><strong>{n.title}</strong><span>{n.parentId === null ? 'XL' : n.importance === 4 ? 'XL' : n.importance === 3 ? 'L' : n.importance === 2 ? 'M' : 'S'}</span></div>{n.body && <p>{n.body}</p>}<Outline nodes={nodes} parent={n.id} /></li>)}</ul>
}
function Panel({ close, request, loadSettings = readAiSettings, storeSettings = saveAiSettings }: AssistantProps & { close: () => void }) {
  const selected = useGraph(s => s.selectedNodes)
  const selectedEdges = useGraph(s => s.selectedEdges)
  const selectedNode = useProject(s => selected.length === 1 ? s.project.graph.nodes[selected[0]] : undefined)
  const mode: Mode | null = selectedNode ? { kind: 'expand', selectedId: selectedNode.id, title: selectedNode.title, body: selectedNode.body } : !selected.length && !selectedEdges.length ? { kind: 'build' } : null
  const [text, setText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [fixSpelling, setFixSpelling] = useState(true)
  const [omit, setOmit] = useState(true)
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [restored, setRestored] = useState<Set<number>>(new Set())
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let alive = true
    void loadSettings().then(value => { if (alive) { setSettings(value); setReady(true) } }).catch(() => { if (alive) { setError('Could not read AI settings. Open settings and save them again.'); setReady(true) } })
    return () => { alive = false; controller.current?.abort() }
  }, [loadSettings])
  const proposed = useMemo(() => preview ? restoreItems(preview.proposal, restored, preview.mode) : null, [preview, restored])
  const cancel = () => { controller.current?.abort(); controller.current = null; setBusy(false); setPendingMode(null); setNotice('Generation cancelled. Nothing was added.') }
  const generate = async () => {
    if (!mode || busy || !ready) return
    const abort = new AbortController()
    controller.current = abort; setBusy(true); setPendingMode(mode); setError(''); setNotice(''); setReceipts([])
    try {
      const proposal = await generateMap({ text, instruction, options: { fixSpelling, omitRepeatsAndOffTopic: omit }, mode }, settings, abort.signal, receipt => {
        if (controller.current === abort && !abort.signal.aborted) setReceipts(list => [...list, receipt])
      }, request)
      if (controller.current === abort && !abort.signal.aborted) { setPreview({ proposal, mode }); setRestored(new Set()) }
    } catch (error) {
      if (!abort.signal.aborted && controller.current === abort) setError(error instanceof AiError ? error.message : 'Could not generate the map. Nothing was added.')
    } finally { if (controller.current === abort) { controller.current = null; setBusy(false); setPendingMode(null) } }
  }
  const apply = () => {
    if (!preview || !proposed) return
    try {
      const project = useProject.getState().project
      const additions = layoutProposal(proposed, preview.mode, project.graph, project.settings.snap)
      useGraph.getState().endGesture()
      useGraph.getState().addNodes(additions.nodes, additions.edges)
      setPreview(null); setRestored(new Set()); setError(''); setNotice(`Added ${additions.nodes.length} nodes as one undo step. Press F on the canvas to fit them.`)
    } catch { setError('The attachment node is no longer available. Discard this preview and generate again.') }
  }
  const activeMode = preview?.mode ?? (busy ? pendingMode : mode)
  const modeLabel = activeMode?.kind === 'expand' ? `Expand under ${activeMode.title || 'Untitled node'}` : activeMode ? 'Build new map' : 'Select one node, or clear the selection.'
  return <aside className={styles.panel} aria-label="Graph AI assistant" onKeyDown={e => e.stopPropagation()}>
    <div className={styles.heading}><h2>Graph assistant</h2><div><button disabled={!ready || busy} onClick={() => setShowSettings(true)}>Settings</button><button aria-label="Close graph assistant" onClick={close}><Icon name="close" /></button></div></div>
    <div className={styles.content}>
      <p className={styles.mode}>{modeLabel}</p>
      {!preview ? <>
        <label className={styles.field}>Notes<textarea autoFocus value={text} maxLength={200000} disabled={busy} placeholder="Paste the notes to organize…" onChange={e => setText(e.target.value)} /></label>
        <label className={styles.field}>Instruction <span className={styles.optional}>(optional)</span><input value={instruction} maxLength={1000} disabled={busy} placeholder="e.g. group by project" onChange={e => setInstruction(e.target.value)} /></label>
        <label className={styles.check}><input type="checkbox" checked={fixSpelling} disabled={busy} onChange={e => setFixSpelling(e.target.checked)} />Fix spelling &amp; wording</label>
        <label className={styles.check}><input type="checkbox" checked={omit} disabled={busy} onChange={e => setOmit(e.target.checked)} />Leave out repeats &amp; off-topic</label>
        <p className={styles.hint}>Generate sends these notes{activeMode?.kind === 'expand' ? ' and the selected node’s text' : ''} to OpenAI. Preview changes nothing until Apply.</p>
      </> : <>
        <div className={styles.previewHeading}><h3>Proposed map</h3><span>{proposed?.nodes.length} nodes · {(preview.proposal.links ?? []).length} cross-connections</span></div>
        <Outline nodes={proposed!.nodes} parent={preview.mode.kind === 'expand' ? 'SELECTED' : null} />
        {!!preview.proposal.links?.length && <details><summary>Cross-connections: {preview.proposal.links.length}</summary><ul className={styles.links}>{preview.proposal.links.map((link, i) => <li key={i}>{preview.proposal.nodes.find(n => n.id === link.fromId)?.title} → {preview.proposal.nodes.find(n => n.id === link.toId)?.title}{link.label ? ` · ${link.label}` : ''}</li>)}</ul></details>}
        <details className={styles.omitted}><summary>Left out: {preview.proposal.omitted.length} items{restored.size ? ` · ${restored.size} restored` : ''}</summary>
          {!!preview.proposal.omitted.length && <button disabled={restored.size === preview.proposal.omitted.length} onClick={() => setRestored(new Set(preview.proposal.omitted.map((_, i) => i)))}>Restore all</button>}
          {preview.proposal.omitted.map((item, i) => <div className={styles.omittedItem} key={i}><p>{item.text}</p><div><span>{item.reason}</span><button disabled={restored.has(i)} onClick={() => setRestored(ids => new Set([...ids, i]))}>{restored.has(i) ? 'Restored' : 'Restore'}</button></div></div>)}
        </details>
        <p className={styles.hint}>New nodes are placed clear of existing content. Restores go under one “Left out” branch.</p>
      </>}
      {receipts.length > 0 && <div className={styles.usage} aria-label="AI token usage">{receipts.map((r, i) => <p key={i}>Call {i + 1} · {r.input.toLocaleString()} input ({r.cached.toLocaleString()} cached) · {r.output.toLocaleString()} output<br />{r.cost === null ? 'Cost unavailable for this model' : `Approx. $${r.cost.toFixed(6)} USD`} · {r.model}</p>)}<small>Standard token rates, checked 7 Oct 2026. Estimates may differ from billing.</small></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.hint}>{notice}</p>}
    </div>
    <div className={styles.actions}>{preview ? <><button onClick={() => { setPreview(null); setRestored(new Set()); setError(''); setNotice('Preview discarded. Nothing was added.') }}>Discard</button><button className={styles.primary} onClick={apply}>Apply</button></> : busy ? <><span role="status">Generating…</span><button onClick={cancel}>Cancel generation</button></> : <button className={styles.primary} disabled={!mode || !ready || !text.trim()} onClick={() => { void generate() }}>Generate</button>}</div>
    {showSettings && <AiSettingsDialog settings={settings} save={storeSettings} saved={setSettings} close={() => setShowSettings(false)} />}
  </aside>
}
export function Assistant(props: AssistantProps) {
  const [open, setOpen] = useState(false)
  return open ? <Panel {...props} close={() => setOpen(false)} /> : <button className={styles.launcher} aria-label="Open graph assistant" onClick={() => setOpen(true)}><Icon name="branch" /><span>Assistant</span></button>
}
