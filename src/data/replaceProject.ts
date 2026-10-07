import type { Project } from './types'
import { useProject } from '../store/useProject'
import { useGraph } from '../store/useGraph'

// Call after unmounting the current canvas, so its viewport cleanup cannot overwrite imported data.
export function replaceProject(project: Project) {
  useGraph.setState({ selectedNodes: [], selectedEdges: [], editing: null, tool: 'select', past: [], future: [], gesture: null })
  useProject.setState({ project, ready: true, saveStatus: 'pending', saveError: '', tool: 'select', selected: [], editing: null, past: [], future: [], gesture: null, draft: null, marquee: null })
}
