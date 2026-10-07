import { memo, Profiler, useEffect, useRef } from 'react'
import type { ProfilerOnRenderCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { createRoot } from 'react-dom/client'
import { Graph } from '../../src/graph/Graph'
import { GraphNodeView } from '../../src/graph/GraphNode'
import type { FlowNode } from '../../src/graph/flowTypes'
import { useProject } from '../../src/store/useProject'
import { graphFixture } from '../fixtures/graph'
import '../../src/app/tokens.css'
import styles from './Performance.module.css'

const renders = new Map<string, number>()
let flush: number | undefined
let sampling = false
let lastFrame = 0
let gaps: number[] = []

function renderMetrics() {
  const output = document.querySelector('[data-render-metrics]')
  if (output) output.textContent = `${renders.size} nodes rendered · ${[...renders.values()].reduce((sum, count) => sum + count, 0)} commits`
  const ids = document.querySelector('[data-render-ids]')
  if (ids) ids.textContent = renders.size > 10 ? 'More than 10 nodes' : [...renders.keys()].join(', ') || 'None'
}

const record: ProfilerOnRenderCallback = id => {
  renders.set(id, (renders.get(id) ?? 0) + 1)
  if (flush === undefined) flush = requestAnimationFrame(() => { flush = undefined; renderMetrics() })
}
export const ProfiledNode = memo(function ProfiledNode(props: NodeProps<FlowNode>) {
  return <Profiler id={props.id} onRender={record}><GraphNodeView {...props} /></Profiler>
})
const types = { idea: ProfiledNode }
useProject.getState().hydrate(graphFixture())

export function Fixture() {
  const frame = useRef(0)
  useEffect(() => {
    const tick = (now: number) => {
      if (sampling && lastFrame) gaps.push(now - lastFrame)
      lastFrame = now
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [])
  return <><Graph nodeTypes={types} /><aside className={styles.metrics}>
    <h1>500 nodes / 700 edges</h1>
    <p>In-memory fixture. Your saved project is untouched.</p>
    <output data-render-metrics aria-label="Render metrics">Mounting…</output><small data-render-ids />
    <div><button onClick={() => { renders.clear(); renderMetrics() }}>Reset render counts</button><button onClick={() => { sampling = true; lastFrame = 0; gaps = [] }}>Start frame sample</button><button onClick={() => {
      sampling = false
      const sorted = [...gaps].sort((a, b) => a - b)
      const output = document.querySelector('[data-frame-metrics]')
      if (output) output.textContent = sorted.length ? `${sorted.length} frames · median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}ms · p95 ${sorted[Math.floor(sorted.length * .95)].toFixed(1)}ms` : 'No sampled frames'
    }}>Stop frame sample</button></div>
    <output data-frame-metrics aria-label="Frame metrics">No sample yet</output>
  </aside></>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
