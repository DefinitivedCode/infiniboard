import { useEffect, useRef } from 'react'
import { useStoreApi, useUpdateNodeInternals } from '@xyflow/react'
import { GRID } from '../board/geometry'
import styles from './Graph.module.css'

export function Grid({ visible }: { visible: boolean }) {
  const api = useStoreApi()
  const updateNodeInternals = useUpdateNodeInternals()
  const pattern = useRef<SVGPatternElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  const root = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const paint = () => {
      const [x, y, zoom] = api.getState().transform
      const step = GRID * zoom * (zoom < .35 ? 4 : zoom < .65 ? 2 : 1)
      pattern.current?.setAttribute('width', String(step))
      pattern.current?.setAttribute('height', String(step))
      pattern.current?.setAttribute('x', String((((x - 1) % step) + step) % step))
      pattern.current?.setAttribute('y', String((((y - 1) % step) + step) % step))
      dot.current?.setAttribute('r', zoom < .5 ? '.8' : '1')
      root.current?.parentElement?.style.setProperty('--inverse-zoom', String(1 / zoom))
    }
    paint()
    return api.subscribe((s, previous) => {
      if (s.transform === previous.transform) return
      paint()
      // Ports stay 8 screen pixels wide. Their world bounds change on zoom, even
      // though node dimensions do not, so React Flow's ResizeObserver cannot detect it.
      if (s.transform[2] !== previous.transform[2]) updateNodeInternals([...s.nodeLookup.keys()])
    })
  }, [api, updateNodeInternals])
  return <svg ref={root} className={styles.grid} style={{ display: visible ? 'block' : 'none' }} aria-hidden="true"><defs><pattern ref={pattern} id="graph-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle ref={dot} cx="1" cy="1" r="1" fill="var(--grid)" /></pattern></defs><rect width="100%" height="100%" fill="url(#graph-grid)" /></svg>
}
