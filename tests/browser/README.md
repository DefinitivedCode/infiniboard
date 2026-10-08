# Browser fixtures

Run `npm ci` and `npm run dev -- --port 5192 --strictPort`, then open a fixture path on that disposable local origin. Use a fresh profile/origin for persistence/privacy checks. Never enter a real API key into a fixture.

| Path | Purpose |
| --- | --- |
| `/tests/browser/graph-performance.html` | 500-node / 700-edge memoization and interaction checks |
| `/tests/browser/graph-geometry.html` | Measured edge endpoints after zoom, resizing, auto-size, layout and Organize; content overflow |
| `/tests/browser/ai-assistant.html` | Synthetic assistant responses through mocked fetch |
| `/tests/browser/privacy.html` | Real local autosave and credential migration with all API requests mocked |
| `/tests/browser/showcase.html` | Real app, no debug chrome; freshly authored synthetic README content |

The showcase seeds only if the project database does not exist. Reloading it preserves saved state. Do not use your personal-project origin for screenshots. Click Graph, then Organize, clear selection, and capture the actual UI at 1440×900. The showcase makes no AI calls. Other geometry/performance fixtures use in-memory state rather than autosave.

## Wheel regression

On the Graph canvas, scroll up/down over empty space without modifiers: zoom increases/decreases around the pointer. At each extreme, zoom stays between 10% and 400%. Space/middle/right drag and H still pan; normal selection/drag/connection/reconnection still work.

In the geometry fixture, Load content examples → Fit nodes. Scroll over the Long archive card's body: its scrollTop changes while the canvas viewport stays fixed. Measure attachments after wheel zoom, programmatic sizes, Auto-size first node, Radial re-layout, Organize and manual movement/resize: every endpoint must lie within its handle (tolerance 1 screen pixel). Pinch remains enabled through React Flow's native handling; check real trackpad/touch hardware when available.

On Board, wheel still pans and Ctrl/Cmd+wheel zooms. Canvas shortcuts do not run inside node editors or dialogs.

These are development-only HTML entry points; Vite's production entry remains the root index.html.

## Assistant Phase 1

The assistant fixture uses mocked fetch and synthetic workshop notes. It covers New tree, Place in map, Under selected, subtree checkboxes, placement search/re-parenting, Restore, Regenerate/Tweak, cancellation and invalid responses, and local preset/history controls. Add `?indexeddb` to use the isolated `infiniboard-assistant-verification` library and verify persistence across reloads. This never reads the production assistant library or stores a real credential.

For a production boundary check, run `npm run build` and `npm run preview` on a disposable origin, open Graph → Assistant, and verify there is no Assistant verification harness. `dist` must contain neither fixture entry points nor harness strings.
