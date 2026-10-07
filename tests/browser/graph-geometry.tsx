import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Graph } from '../../src/graph/Graph'
import type { GraphApi } from '../../src/graph/Graph'
import { createProject } from '../../src/data/types'
import { useProject } from '../../src/store/useProject'
import { useGraph } from '../../src/store/useGraph'
import { chooseHandles, layoutProposal } from '../../src/ai/layout'
import type { Proposal } from '../../src/ai/schema'
import { fitNodeContent } from '../../src/graph/contentSize'
import { nodeSizeStep } from '../../src/graph/model'
import { serializeProject, parseProjectFile } from '../../src/data/projectFile'
import '../../src/app/tokens.css'
import styles from './Performance.module.css'

const project = createProject()
for (const [id, x, y] of [['a', 100, 100], ['b', 650, 100], ['c', 100, 450], ['d', 650, 450], ['e', 1100, 100], ['f', 1100, 450], ['g', 100, 800], ['h', 650, 800]] as const) {
  project.graph.nodes[id] = { id, title: id, body: '', x, y, width: 288, height: 192 }
  project.graph.nodeOrder.push(id)
}
for (const [source, target] of [['a', 'b'], ['a', 'c'], ['d', 'b'], ['d', 'c']]) {
  const id = `${source}-${target}`
  project.graph.edges[id] = { id, source, target, ...chooseHandles(project.graph.nodes[source], project.graph.nodes[target]) }
  project.graph.edgeOrder.push(id)
}
useProject.getState().hydrate(project)
const notes = 'Workshop participants meet in the hall to plan the activity. One table is reserved for quiet discussion and another for supplies. The hall is available on different days, so the organisers agreed on a fallback room and check bookings before each session. Everyone needs enough space to prepare materials without interrupting the neighbouring events. '

function contentAudit() {
  const graph = useProject.getState().project.graph
  return graph.nodeOrder.map(id => {
    const n = graph.nodes[id], element = document.querySelector(`[data-graph-node="${id}"]`)
    const title = element?.querySelector('[class*="nodeTitle"]'), body = element?.querySelector('[class*="nodeBody"]')
    const overflow = (content: Element | null | undefined) => content ? content.scrollHeight > content.clientHeight + 1 : false
    return `${id}: ${n.width} × ${n.height} (${nodeSizeStep(n)}) · title ${overflow(title) ? 'scrolls' : 'fits'} · body ${overflow(body) ? 'scrolls' : 'fits'}`
  }).join('\n')
}

// Compare the actual rendered path endpoints with the current DOM handle rectangles.
// A test fails when either endpoint floats outside its handle by more than 1 screen pixel.
function audit() {
  let maxGap = 0, checked = 0
  const graph = useProject.getState().project.graph
  for (const id of graph.edgeOrder) {
    const edge = graph.edges[id]
    const path = document.getElementById(id) as unknown as SVGPathElement | null
    if (!path?.getScreenCTM()) continue
    for (const [nodeId, handleId, distance] of [[edge.source, edge.sourceHandle, 0], [edge.target, edge.targetHandle, path.getTotalLength()]] as const) {
      const handle = document.querySelector(`[data-graph-node="${nodeId}"] [data-handleid="${handleId}"]`)
      if (!handle) continue
      const point = path.getPointAtLength(distance).matrixTransform(path.getScreenCTM()!)
      const rect = handle.getBoundingClientRect()
      const gap = Math.hypot(Math.max(rect.left - point.x, 0, point.x - rect.right), Math.max(rect.top - point.y, 0, point.y - rect.bottom))
      maxGap = Math.max(maxGap, gap); checked++
    }
  }
  return `${checked} endpoints · max gap ${maxGap.toFixed(3)}px · ${checked === graph.edgeOrder.length * 2 && checked > 0 && maxGap <= 1 ? 'PASS' : 'FAIL'}`
}

export function Fixture() {
  const ref = useRef<GraphApi>(null), [result, setResult] = useState('Not measured')
  const [content, setContent] = useState('Not measured')
  const graph = useProject(s => s.project.graph)
  const zoom = (value: number) => ref.current?.zoom(value / useProject.getState().project.graph.viewport.zoom)
  const change = (width: number, height: number) => {
    const current = useProject.getState().project.graph
    const node = current.nodes[current.nodeOrder[0]]
    useGraph.getState().updateNodes([{ ...node, width, height }])
  }
  const relayout = () => {
    const current = useProject.getState().project.graph
    const p: Proposal = { nodes: current.nodeOrder.map((id, i) => ({ id, title: current.nodes[id].title, body: current.nodes[id].body, parentId: i ? current.nodeOrder[0] : null, importance: i ? 2 : 4 })), omitted: [] }
    const laid = layoutProposal(p, { kind: 'build' }, createProject().graph, false)
    const idMap = new Map(laid.nodes.map(n => [n.id, current.nodeOrder.find(id => current.nodes[id].title === n.title)!]))
    useGraph.getState().updateNodes(laid.nodes.map(n => ({ ...n, id: idMap.get(n.id)! })))
    for (const edge of Object.values(current.edges)) {
      const next = useProject.getState().project.graph
      useGraph.getState().updateEdge({ ...edge, ...chooseHandles(next.nodes[edge.source], next.nodes[edge.target]) })
    }
    ref.current?.fit()
  }
  const autosize = () => {
    const current = useProject.getState().project.graph.nodes.a
    const title = 'Workshop meeting notes'
    useGraph.getState().updateNodes([{ ...current, title, body: notes.repeat(2), importance: 2, ...fitNodeContent(title, notes.repeat(2), 'M') }])
  }
  const contentExamples = () => {
    const current = useProject.getState().project.graph
    const cases = [
      ['a', 'Workshop routine and shared preparations', '', 2],
      ['b', 'Workshop room arrangements', notes.repeat(2), 2],
      ['c', 'Room schedule', 'Meet here during breaks.', 1],
      ['d', 'Long archive', notes.repeat(100), 4],
    ] as const
    useGraph.getState().updateNodes(cases.map(([id, title, body, importance]) => ({ ...current.nodes[id], title, body, importance, ...fitNodeContent(title, body, ({ 1: 'S', 2: 'M', 4: 'XL' } as const)[importance]) })))
  }
  return <><Graph ref={ref} assistant={false} /><aside className={styles.metrics}>
    <h1>Graph geometry regression</h1><p>In-memory fixture. Saved project untouched.</p>
    <button onClick={() => setResult(audit())}>Measure attachments</button><output aria-label="Attachment result">{result}</output>
    <button onClick={() => zoom(.35)}>Zoom 35%</button><button onClick={() => zoom(1)}>Zoom 100%</button><button onClick={() => zoom(2)}>Zoom 200%</button>
    <button onClick={() => change(528, 360)}>Programmatic large size</button><button onClick={() => change(192, 120)}>Programmatic small size</button>
    <button onClick={() => useGraph.getState().select([graph.nodeOrder[0]])}>Select first node</button><button onClick={() => useGraph.getState().select([])}>Clear selection</button>
    <button onClick={relayout}>Radial re-layout</button><button onClick={() => ref.current?.fit()}>Fit nodes</button>
    <button onClick={() => ref.current?.organize()}>Organize</button><button onClick={() => useGraph.getState().undo()}>Undo organization</button>
    <button onClick={autosize}>Auto-size first node</button><button onClick={contentExamples}>Load content examples</button>
    <button onClick={() => setContent(contentAudit())}>Measure content</button><output aria-label="Content result" style={{ whiteSpace: 'pre-line' }}>{content}</output>
    <button onClick={() => useProject.getState().hydrate(parseProjectFile(serializeProject(useProject.getState().project)))}>Round-trip in memory</button>
  </aside></>
}
if (import.meta.env.DEV) {
  const root = createRoot(document.getElementById('root')!)
  root.render(<Fixture />)
  import.meta.hot?.dispose(() => root.unmount())
}
