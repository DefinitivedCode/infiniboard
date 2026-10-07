import { createProject } from '../../src/data/types'
import type { BoardItem, GraphNode, Project } from '../../src/data/types'
import { fitTextHeight } from '../../src/board/textHeight'
import { chooseHandles } from '../../src/graph/layout'

// Fictional public documentation content, authored from scratch. No AI request.
export function showcaseProject(): Project {
  const project = createProject()
  project.title = 'Weekend game jam'
  project.updatedAt = 1791331200000
  project.settings.snap = true
  project.board.viewport = { x: 120, y: 95, zoom: 1 }
  const items: BoardItem[] = [
    { id: 'showcase-title', type: 'text', x: 72, y: 20, width: 800, height: 70, fontSize: 42, text: 'A small game. One good idea.' },
    { id: 'showcase-subtitle', type: 'text', x: 76, y: 92, width: 860, height: 40, fontSize: 18, text: 'WEEKEND GAME JAM  /  48 HOURS  /  BUILD SOMETHING PLAYABLE' },
    { id: 'showcase-ideas', type: 'text', x: 76, y: 168, width: 280, height: 44, fontSize: 26, text: '01  Find the loop' },
    { id: 'showcase-lantern', type: 'sticky', x: 72, y: 228, width: 240, height: 224, fontSize: 22, swatch: 'oat', text: 'Lantern trail\n\nCarry a light through a forest that changes when you look away.' },
    { id: 'showcase-courier', type: 'sticky', x: 340, y: 228, width: 240, height: 224, fontSize: 22, swatch: 'sage', text: 'Cloud courier\n\nDeliver parcels between floating islands. One button to glide.' },
    { id: 'showcase-build', type: 'text', x: 660, y: 168, width: 340, height: 44, fontSize: 26, text: '02  Keep it small' },
    { id: 'showcase-frame', type: 'rect', x: 644, y: 216, width: 380, height: 236, swatch: 'none' },
    { id: 'showcase-checklist', type: 'text', x: 668, y: 236, width: 332, height: 198, fontSize: 22, text: 'Playable by Saturday evening\n\n[ ] One room, one mechanic\n[ ] A clear beginning and ending\n[ ] Sound before extra levels\n[ ] Test with fresh eyes' },
    { id: 'showcase-arrow', type: 'arrow', x: 596, y: 312, width: 32, height: 4, start: { x: 0, y: .5 }, end: { x: 1, y: .5 } },
    { id: 'showcase-cut', type: 'sticky', x: 340, y: 508, width: 240, height: 140, fontSize: 20, swatch: 'rose', text: 'Save for later\n\nMultiplayer, crafting, endless procedural worlds.' },
    { id: 'showcase-circle', type: 'ellipse', x: 656, y: 514, width: 356, height: 120, swatch: 'none' },
    { id: 'showcase-play', type: 'text', x: 700, y: 538, width: 274, height: 72, fontSize: 23, text: 'Make the first 30 seconds feel good.' },
    { id: 'showcase-note', type: 'text', x: 76, y: 510, width: 238, height: 88, fontSize: 19, text: 'Pick one by noon.\nA finished tiny game beats an unfinished big one.' },
    { id: 'showcase-pen', type: 'pen', x: 78, y: 460, width: 218, height: 16, points: [{x:0,y:.55},{x:.2,y:.2},{x:.4,y:.4},{x:.6,y:.25},{x:.8,y:.45},{x:1,y:.1}] },
  ]
  for (const item of items) { project.board.items[item.id] = fitTextHeight(item); project.board.order.push(item.id) }
  const specs: [string, string, string, GraphNode['importance'], string | null][] = [
    ['game', 'Build an indie game', 'A small exploration game, ready to share.', 3, null],
    ['design', 'Design', 'Explore, collect a light, open a path. One satisfying loop.', 2, 'game'],
    ['engineering', 'Engineering', 'Reliable controls and a playable build.', 2, 'game'],
    ['release', 'Release', 'Test early. Ship something finished.', 2, 'game'],
    ['craft', 'Art & audio', 'One forest clearing. Quiet music, clear cues.', 1, 'design'],
    ['input', 'Input & saves', 'Keyboard and controller. Save progress locally.', 1, 'engineering'],
    ['test', 'Playtesting', 'Watch someone play without instructions.', 1, 'release'],
  ]
  for (const [id, title, body, importance] of specs) {
    const node: GraphNode = { id: `showcase-${id}`, title, body, importance, x: 0, y: 0, width: importance === 3 ? 384 : importance === 2 ? 288 : 216, height: importance === 3 ? 168 : importance === 2 ? 144 : 120 }
    project.graph.nodes[node.id] = node; project.graph.nodeOrder.push(node.id)
  }
  for (const [id, , , , parent] of specs) if (parent) {
    const source = `showcase-${parent}`, target = `showcase-${id}`, edgeId = `showcase-edge-${id}`
    project.graph.edges[edgeId] = { id: edgeId, source, target, ...chooseHandles(project.graph.nodes[source], project.graph.nodes[target]), ...(id === 'test' ? { label: 'before launch' } : {}) }
    project.graph.edgeOrder.push(edgeId)
  }
  return project
}
