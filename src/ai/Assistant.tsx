import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../app/Icon'
import { useGraph } from '../store/useGraph'
import { useProject } from '../store/useProject'
import { AiError, estimateGeneration, generateMap } from './client'
import type { GenerationInput, Receipt } from './client'
import { restoreItems, layoutProposal } from './layout'
import type { Mode, Proposal } from './schema'
import { defaultMode, makeMode } from './context'
import type { Scope } from './context'
import { checkedProposal, proposalSummary, reparentProposal, toggleSubtree } from './preview'
import { DEFAULT_OPTIONS } from './options'
import type { OutputOptions } from './options'
import { assistantLibrary } from './libraryStorage'
import { BUILTIN_PRESETS } from './library'
import type { AssistantLibrary, AssistantPreset, GenerationRecord, SavedInputs } from './library'
import { AiSettingsDialog } from './AiSettingsDialog'
import { DEFAULT_SETTINGS } from './settings'
import type { AiSettings } from './settings'
import { readAiSettings, saveAiSettings } from './settingsStorage'
import styles from './Assistant.module.css'

// Injected adapters let the fixture use mocked fetch and memory storage.
export type AssistantProps = { request?: typeof fetch; loadSettings?: () => Promise<AiSettings>; storeSettings?: (settings: AiSettings) => Promise<void>; library?: AssistantLibrary }
type Preview = { proposal: Proposal; input: GenerationInput; saved: SavedInputs }
const MODE_LABELS: Record<Mode['kind'], string> = { build: 'New tree', place: 'Place in map', expand: 'Under selected' }

function OutputControls({ options, update, kind }: { options: OutputOptions; update: (options: OutputOptions) => void; kind: Mode['kind'] }) {
  return <details className={styles.options}><summary>Options</summary><div className={styles.dials}>
    <label className={styles.field}>Depth<select value={options.depth} onChange={e => update({ ...options, depth: e.target.value as OutputOptions['depth'] })}><option value="shallow">Shallow · 2 levels</option><option value="balanced">Balanced · 3–4 levels</option><option value="deep">Deep · 5+ levels</option></select></label>
    <label className={styles.field}>Branching<select value={options.branching} onChange={e => update({ ...options, branching: e.target.value as OutputOptions['branching'] })}><option value="broad">Broad</option><option value="granular">Granular</option></select></label>
    <label className={styles.field}>Node detail<select value={options.detail} onChange={e => update({ ...options, detail: e.target.value as OutputOptions['detail'] })}><option value="titles">Titles only</option><option value="short">Short bodies</option><option value="detailed">Detailed bodies</option></select></label>
    <label className={styles.field}>Grouping<select value={options.grouping} onChange={e => update({ ...options, grouping: e.target.value as OutputOptions['grouping'] })}><option value="topic">By topic</option><option value="chronological">Chronological</option><option value="person">By person</option><option value="custom">Custom · instruction</option></select></label>
    <label className={styles.field}>Max nodes<input type="number" min={1} max={500} step={1} value={Number.isNaN(options.maxNodes) ? '' : options.maxNodes} onChange={e => update({ ...options, maxNodes: e.target.valueAsNumber })} /></label>
    <label className={styles.check}><input type="checkbox" checked={options.crossLinks} onChange={e => update({ ...options, crossLinks: e.target.checked })} />Cross-links</label>
  </div>{kind === 'place' && <label className={styles.check}><input type="checkbox" checked={options.allowNewBranches} onChange={e => update({ ...options, allowNewBranches: e.target.checked })} />Allow new top-level branches</label>}</details>
}

function Placement({ node, context, change }: { node: Proposal['nodes'][number]; context: Extract<Mode, { kind: 'place' }>['context']; change: (id: string, parent: string | null) => void }) {
  const [search, setSearch] = useState('')
  const matches = context.filter(n => n.id === node.parentId || n.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div className={styles.placement}>
    <label className={styles.field}>Find parent<input type="search" aria-label={`Find parent for ${node.title}`} value={search} placeholder="Search existing nodes" onChange={e => setSearch(e.target.value)} /></label>
    <label className={styles.field}>Placed under<select aria-label={`Placed under for ${node.title}`} value={node.parentId ?? ''} onChange={e => change(node.id, e.target.value || null)}><option value="">Make separate branch</option>{matches.map(n => <option key={n.id} value={n.id}>{n.title || 'Untitled node'} · {n.id.slice(0, 8)}</option>)}</select></label>
  </div>
}

function Outline({ proposal, nodes, checked, mode, toggle, place }: { proposal: Proposal; nodes: Proposal['nodes']; checked: ReadonlySet<string>; mode: Mode; toggle: (id: string, include: boolean) => void; place: (id: string, parent: string | null) => void }) {
  return <ul className={styles.outline}>{nodes.map(n => {
    const parent = mode.kind === 'place' ? mode.context.find(p => p.id === n.parentId) : undefined
    const top = n.parentId === null || !proposal.nodes.some(p => p.id === n.parentId)
    const children = proposal.nodes.filter(child => child.parentId === n.id)
    return <li key={n.id}>
      <div className={styles.nodeHeading}><label className={styles.check}><input type="checkbox" checked={checked.has(n.id)} aria-label={`Include ${n.title}`} onChange={e => toggle(n.id, e.target.checked)} /><strong>{n.title}</strong></label><span>{n.parentId === null ? 'XL' : ['S', 'M', 'L', 'XL'][n.importance - 1]}</span></div>
      {mode.kind === 'place' && <p className={styles.metadata}>{parent ? `under ${parent.title || 'Untitled node'} · ` : top ? 'separate branch · ' : ''}{n.confidence ? `[${n.confidence}] ` : ''}{n.reason}</p>}
      {n.body && <p>{n.body}</p>}
      {mode.kind === 'place' && top && <details className={styles.placeDetails}><summary>Change placement</summary><Placement node={n} context={mode.context} change={place} /></details>}
      {!!children.length && <Outline proposal={proposal} nodes={children} checked={checked} mode={mode} toggle={toggle} place={place} />}
    </li>
  })}</ul>
}

function Panel({ close, request, loadSettings = readAiSettings, storeSettings = saveAiSettings, library = assistantLibrary }: AssistantProps & { close: () => void }) {
  const selected = useGraph(s => s.selectedNodes)
  const graph = useProject(s => s.project.graph)
  const snapping = useProject(s => s.project.settings.snap)
  const [recalledTarget, setRecalledTarget] = useState<{ id?: string; selection: string } | null>(null)
  const selection = selected.join('\0')
  const targetId = recalledTarget?.selection === selection ? recalledTarget.id : selected.length === 1 ? selected[0] : undefined
  const selectedId = targetId && graph.nodes[targetId] ? targetId : undefined
  const [override, setOverride] = useState<Mode['kind'] | null>(null)
  const kind = override ?? defaultMode(graph.nodeOrder.length, selected.length)
  const [scope, setScope] = useState<Scope>('whole')
  const [text, setText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [options, setOptions] = useState<OutputOptions>({ ...DEFAULT_OPTIONS })
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [restored, setRestored] = useState<Set<number>>(new Set())
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [placements, setPlacements] = useState<Map<string, string | null>>(new Map())
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [tweak, setTweak] = useState('')
  const [presets, setPresets] = useState<AssistantPreset[]>([])
  const [history, setHistory] = useState<GenerationRecord[]>([])
  const [presetId, setPresetId] = useState('')
  const [presetName, setPresetName] = useState('')
  const controller = useRef<AbortController | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const previewHeading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    let alive = true
    void loadSettings().then(value => { if (alive) { setSettings(value); setReady(true) } }).catch(() => { if (alive) { setError('Could not read AI settings. Open settings and save them again.'); setReady(true) } })
    void library.read().then(value => { if (alive) { setPresets(value.presets); setHistory(value.history) } }).catch(() => { if (alive) setError('Could not read local presets or history. Generation is still available.') })
    return () => { alive = false; controller.current?.abort() }
  }, [loadSettings, library])

  const mode = useMemo(() => {
    try { return makeMode(kind, graph, selectedId, scope) } catch { return null }
  }, [kind, graph, selectedId, scope])
  const validOptions = Number.isInteger(options.maxNodes) && options.maxNodes >= 1 && options.maxNodes <= 500
  const estimate = useMemo(() => mode && validOptions ? estimateGeneration({ text, instruction, options, mode }, settings.model) : null, [mode, validOptions, text, instruction, options, settings.model])
  const proposed = useMemo(() => {
    if (!preview) return null
    const proposal = restoreItems(preview.proposal, restored, preview.input.mode)
    return { ...proposal, nodes: proposal.nodes.map(n => placements.has(n.id) ? { ...n, parentId: placements.get(n.id)!, reason: 'Placement chosen by you', confidence: 'high' as const } : n) }
  }, [preview, restored, placements])
  const checked = useMemo(() => new Set(proposed?.nodes.filter(n => !excluded.has(n.id)).map(n => n.id)), [proposed, excluded])
  const included = useMemo(() => proposed ? checkedProposal(proposed, checked) : null, [proposed, checked])
  const existingIds = useMemo(() => new Set(preview && preview.input.mode.kind !== 'build' ? preview.input.mode.context?.map(n => n.id) : []), [preview])
  const summary = useMemo(() => included ? proposalSummary(included, existingIds) : null, [included, existingIds])
  const planned = useMemo(() => {
    if (!preview || !included) return null
    try { return layoutProposal(included, preview.input.mode, graph, snapping) } catch { return null }
  }, [preview, included, graph, snapping])
  const refreshLibrary = async () => { const value = await library.read(); setPresets(value.presets); setHistory(value.history) }
  const cancel = () => { controller.current?.abort(); controller.current = null; setBusy(false); setNotice('Generation cancelled. Nothing was added.') }

  const generate = async (previous?: Preview, extra = '') => {
    if (busy || !ready || (!previous && (!mode || !validOptions))) return
    const input: GenerationInput = previous ? { ...previous.input, instruction: [previous.input.instruction, extra].filter(Boolean).join('\n') } : { text, instruction, options: { ...options }, mode: mode! }
    if (input.instruction.length > 1000) { setError('Keep the instruction and tweak together below 1,000 characters.'); return }
    const saved: SavedInputs = previous ? { ...previous.saved, instruction: input.instruction } : { text, instruction, options: { ...options }, kind, scope, selectedId }
    const abort = new AbortController(), usage: Receipt[] = []
    controller.current = abort; setBusy(true); setError(''); setNotice(''); setReceipts([])
    try {
      const proposal = await generateMap(input, settings, abort.signal, receipt => {
        usage.push(receipt)
        if (controller.current === abort && !abort.signal.aborted) setReceipts([...usage])
      }, request)
      if (controller.current !== abort || abort.signal.aborted) return
      setPreview({ proposal, input, saved }); setRestored(new Set()); setExcluded(new Set()); setPlacements(new Map()); setTweak('')
      requestAnimationFrame(() => { if (content.current && previewHeading.current) { content.current.scrollTop = previewHeading.current.offsetTop - content.current.offsetTop; previewHeading.current.focus() } })
      try {
        await library.addGeneration({ timestamp: Date.now(), inputs: saved, nodeCount: proposal.nodes.length, cost: usage.length && usage.every(r => r.cost !== null) ? usage.reduce((sum, r) => sum + r.cost!, 0) : null })
        if (controller.current === abort) await refreshLibrary()
      } catch { if (controller.current === abort) setNotice('Preview ready. Local history could not be saved.') }
    } catch (error) {
      if (!abort.signal.aborted && controller.current === abort) setError(error instanceof AiError ? error.message : 'Could not generate the map. Nothing was added.')
    } finally { if (controller.current === abort) { controller.current = null; setBusy(false) } }
  }
  const apply = () => {
    if (!preview || !planned || !planned.nodes.length || busy) return
    useGraph.getState().endGesture()
    useGraph.getState().addNodes(planned.nodes, planned.edges)
    setPreview(null); setRestored(new Set()); setExcluded(new Set()); setPlacements(new Map()); setError(''); setNotice(`Added ${planned.nodes.length} nodes as one undo step. Press F on the canvas to fit them.`)
  }
  const restore = (indices: number[]) => {
    if (!preview) return
    const next = new Set([...restored, ...indices])
    if (preview.proposal.nodes.length + next.size + 1 > (preview.input.options.maxNodes ?? 60)) { setError('Restoring these items would exceed Max nodes. Increase the limit and regenerate, or restore fewer items.'); return }
    setRestored(next)
  }
  const toggle = (id: string, include: boolean) => {
    if (!proposed) return
    const next = toggleSubtree(proposed, checked, id, include)
    setExcluded(new Set(proposed.nodes.filter(n => !next.has(n.id)).map(n => n.id)))
  }
  const place = (id: string, parent: string | null) => {
    if (!proposed) return
    try { reparentProposal(proposed, id, parent, existingIds); setPlacements(previous => new Map(previous).set(id, parent)) } catch { setError('This parent is no longer available. Generate again.') }
  }
  const choosePreset = (id: string) => {
    setPresetId(id)
    const preset = [...BUILTIN_PRESETS, ...presets].find(p => p.id === id)
    if (preset) { setOptions({ ...preset.options }); setInstruction(preset.instruction); setPresetName(preset.id.startsWith('builtin:') ? `${preset.name} copy` : preset.name) }
  }
  const editPreset = async (action: 'copy' | 'save' | 'rename' | 'delete') => {
    try {
      if (action === 'delete') { await library.deletePreset(presetId); setPresetId(''); setPresetName('') }
      else if (action === 'rename') await library.renamePreset(presetId, presetName)
      else {
        const preset = await library.savePreset(presetName, options, instruction, action === 'save' ? presetId : undefined)
        setPresetId(preset.id)
      }
      await refreshLibrary(); setNotice('Local presets updated.')
    } catch { setError('Could not update the preset. Use a name of 1–80 characters and valid options; check browser storage.') }
  }
  const loadHistory = (record: GenerationRecord) => {
    const input = record.inputs
    setText(input.text); setInstruction(input.instruction); setOptions({ ...input.options }); setOverride(input.kind); setScope(input.scope); setPresetId(''); setPresetName('')
    setRecalledTarget({ id: input.selectedId, selection })
    setPreview(null); setRestored(new Set()); setExcluded(new Set()); setPlacements(new Map()); setError('')
    setNotice('History inputs restored. The canvas is unchanged. Choose a canvas node to change the recalled attachment or branch.'); content.current?.scrollTo({ top: 0 })
  }
  const customPreset = presets.some(p => p.id === presetId)
  const roots = proposed?.nodes.filter(n => n.parentId === null || !proposed.nodes.some(p => p.id === n.parentId)) ?? []
  return <aside className={styles.panel} aria-label="Graph AI assistant" onKeyDown={e => e.stopPropagation()}>
    <div className={styles.heading}><h2>Graph assistant</h2><div><button disabled={!ready || busy} onClick={() => setShowSettings(true)}>Settings</button><button aria-label="Close graph assistant" onClick={close}><Icon name="close" /></button></div></div>
    <div className={styles.content} ref={content}>
      <fieldset disabled={busy} className={styles.inputs}>
        <div className={styles.segmented} role="group" aria-label="Generation mode">{(['build', 'place', 'expand'] as const).map(value => <button key={value} aria-pressed={kind === value} onClick={() => setOverride(value)}>{MODE_LABELS[value]}</button>)}</div>
        <div className={styles.scope}>
          {kind === 'place' ? <label>Scope<select aria-label="Context scope" value={scope} onChange={e => setScope(e.target.value as Scope)}><option value="whole">Whole map</option><option value="branch">Selected branch</option></select></label> : <span>{kind === 'build' ? 'Standalone · no map sent' : selectedId ? `Under ${graph.nodes[selectedId].title || 'Untitled node'}` : 'Select one node on the canvas'}</span>}
          {mode && <span>{mode.kind === 'build' ? '0' : mode.context?.length ?? 1} context nodes</span>}
        </div>
        {!mode && kind === 'place' && <p className={styles.hint}>Select one node for Selected branch scope.</p>}
        <label className={styles.field}>Notes<textarea autoFocus value={text} maxLength={200000} placeholder="Paste the notes to organize…" onChange={e => setText(e.target.value)} /></label>
        <div className={styles.presetRow}><label className={styles.field}>Preset<select value={presetId} onChange={e => choosePreset(e.target.value)}><option value="">Custom controls</option><optgroup label="Built-in · save a copy">{BUILTIN_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>{!!presets.length && <optgroup label="Your presets">{presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}</select></label><details><summary>Manage</summary><div className={styles.presetManager}><label className={styles.field}>Preset name<input maxLength={80} value={presetName} onChange={e => setPresetName(e.target.value)} /></label><div className={styles.buttonRow}><button disabled={!presetName.trim() || !validOptions} onClick={() => { void editPreset('copy') }}>Save copy</button>{customPreset && <><button disabled={!presetName.trim() || !validOptions} onClick={() => { void editPreset('save') }}>Update</button><button disabled={!presetName.trim()} onClick={() => { void editPreset('rename') }}>Rename</button><button onClick={() => { void editPreset('delete') }}>Delete</button></>}</div></div></details></div>
        <OutputControls options={options} update={setOptions} kind={kind} />
        <label className={styles.check}><input type="checkbox" checked={options.fixSpelling} onChange={e => setOptions({ ...options, fixSpelling: e.target.checked })} />Fix spelling &amp; wording</label>
        <label className={styles.check}><input type="checkbox" checked={options.omitRepeatsAndOffTopic} onChange={e => setOptions({ ...options, omitRepeatsAndOffTopic: e.target.checked })} />Leave out repeats &amp; off-topic</label>
        <label className={styles.field}>Instruction <span className={styles.optional}>(optional)</span><input value={instruction} maxLength={1000} placeholder="e.g. group by project" onChange={e => setInstruction(e.target.value)} /></label>
        {!validOptions && <p role="alert" className={styles.error}>Max nodes must be a whole number from 1 to 500.</p>}
        <div className={styles.generateRow}><p className={styles.estimate}>{estimate ? <>~{estimate.tokens.toLocaleString()} input tokens · {estimate.scopeCount} context nodes<br />{estimate.cost === null ? 'Cost unavailable for this model' : `Approx. $${estimate.cost.toFixed(4)} USD incl. ~${estimate.output.toLocaleString()} output tokens`}</> : 'Choose a valid scope and node limit.'}</p><button className={styles.primary} disabled={!mode || !ready || !text.trim() || !validOptions} onClick={() => { void generate() }}>Generate</button></div>
        <p className={styles.hint}>Generate sends notes, instructions and the scope shown above to OpenAI. Preview changes nothing until Apply. Token and cost estimates use approximate lengths and known model rates.</p>
      </fieldset>
      {busy && <div className={styles.generateRow}><span role="status">Generating…</span><button onClick={cancel}>Cancel generation</button></div>}
      {preview && proposed && included && summary && <section className={styles.preview} aria-label="Generation preview">
        <div className={styles.previewHeading}><h3 tabIndex={-1} ref={previewHeading}>Proposed map · {MODE_LABELS[preview.input.mode.kind]}</h3><span>{included.nodes.length}/{proposed.nodes.length} nodes · max depth {summary.maxDepth} · {included.links?.length ?? 0} cross-links · {preview.proposal.omitted.length} left out · {preview.proposal.alreadyInMap?.length ?? 0} already in map{preview.input.mode.kind === 'place' ? ` · ${summary.placed} placed in existing branches · ${summary.branches} new branches` : ''}</span></div>
        <fieldset disabled={busy} className={styles.inputs}>
          <div className={styles.buttonRow}><button onClick={() => { void generate(preview) }}>Regenerate</button></div>
          <div className={styles.tweak}><label className={styles.field}>Tweak<input maxLength={200} value={tweak} onChange={e => setTweak(e.target.value)} placeholder="e.g. make it deeper" /></label><button disabled={!tweak.trim()} onClick={() => { void generate(preview, tweak.trim()) }}>Run tweak</button></div>
          <Outline proposal={proposed} nodes={roots} checked={checked} mode={preview.input.mode} toggle={toggle} place={place} />
          <details><summary>Already in map: {preview.proposal.alreadyInMap?.length ?? 0}</summary>{preview.proposal.alreadyInMap?.map((item, i) => <p className={styles.metadata} key={i}>{item.text} · {graph.nodes[item.existingId]?.title ?? 'Node removed'}</p>)}</details>
          {!!preview.proposal.links?.length && <details><summary>Cross-links: {included.links?.length ?? 0} included</summary><ul className={styles.links}>{included.links?.map((link, i) => <li key={i}>{proposed.nodes.find(n => n.id === link.fromId)?.title} → {proposed.nodes.find(n => n.id === link.toId)?.title}{link.label ? ` · ${link.label}` : ''}</li>)}</ul></details>}
          <details className={styles.omitted}><summary>Left out: {preview.proposal.omitted.length} items{restored.size ? ` · ${restored.size} restored` : ''}</summary>
            {!!preview.proposal.omitted.length && <button disabled={restored.size === preview.proposal.omitted.length} onClick={() => restore(preview.proposal.omitted.map((_, i) => i))}>Restore all</button>}
            {preview.proposal.omitted.map((item, i) => <div className={styles.omittedItem} key={i}><p>{item.text}</p><div><span>{item.reason}</span><button disabled={restored.has(i)} onClick={() => restore([i])}>{restored.has(i) ? 'Restored' : 'Restore'}</button></div></div>)}
          </details>
        </fieldset>
        {!planned && <p role="alert" className={styles.error}>An attachment is no longer available. Discard this preview and generate again.</p>}
        <p className={styles.hint}>Only checked nodes are added. Unchecking a node excludes its subtree. Placement changes recalculate layout around existing content.</p>
      </section>}
      {!!receipts.length && <div className={styles.usage} aria-label="AI token usage">{receipts.map((r, i) => <p key={i}>Call {i + 1} · {r.input.toLocaleString()} input ({r.cached.toLocaleString()} cached) · {r.output.toLocaleString()} output<br />{r.cost === null ? 'Cost unavailable for this model' : `Approx. $${r.cost.toFixed(6)} USD`} · {r.model}</p>)}<small>Known standard token rates, checked 7 Oct 2026. Estimates may differ from billing.</small></div>}
      <details className={styles.history}><summary>History · last {history.length} generations</summary><p className={styles.hint}>Local notes and controls only. Loading an entry does not change the canvas.</p>{history.map(record => <button key={record.id} disabled={busy} onClick={() => loadHistory(record)}>{new Date(record.timestamp).toLocaleString()} · {MODE_LABELS[record.inputs.kind]} · {record.nodeCount} nodes · {record.cost === null ? 'cost unavailable' : `$${record.cost.toFixed(6)}`}</button>)}</details>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.hint}>{notice}</p>}
    </div>
    {preview && <div className={styles.actions}><span>{included?.nodes.length ?? 0} checked</span><button disabled={busy} onClick={() => { setPreview(null); setRestored(new Set()); setExcluded(new Set()); setError(''); setNotice('Preview discarded. Nothing was added.') }}>Discard</button><button className={styles.primary} disabled={busy || !planned?.nodes.length} onClick={apply}>Apply</button></div>}
    {showSettings && <AiSettingsDialog settings={settings} save={storeSettings} saved={setSettings} close={() => setShowSettings(false)} />}
  </aside>
}
export function Assistant(props: AssistantProps) {
  const [open, setOpen] = useState(false)
  return open ? <Panel {...props} close={() => setOpen(false)} /> : <button className={styles.launcher} aria-label="Open graph assistant" onClick={() => setOpen(true)}><Icon name="branch" /><span>Assistant</span></button>
}
