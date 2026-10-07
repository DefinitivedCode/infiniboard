# Infiniboard conventions

## Product and scope
- Personal, single-user brainstorming tool. No accounts, collaboration, or backend. Optional Graph AI calls OpenAI directly with the user's key.
- Two project views: Board (custom whiteboard) and Graph (@xyflow/react with custom nodes and edges).
- Completed features include Graph AI preview/restore/apply, local AI settings, strict validation, compact layout and explicit Organize.
- Release scope: local Graph Context, BYOK privacy safeguards, repository audit, documentation and static deployment preparation. Commit in logical chunks. Stop after the requested scope; do not redesign unrelated UI or change Board behavior.
- AI is BYOK, direct to OpenAI, with no shared application key or proxy. Keys default to tab memory; only explicit "Remember on this device" consent permits separate IndexedDB storage. Clear key removes both copies. Credentials never enter projects, JSON, Context, logs, errors, URLs, analytics, examples, or test fixtures. Automated API tests use mocked fetch only.
- Project autosave is browser-local only. No accounts, project database on the server, cloud sync, or content telemetry. Graph Context generation/copying is entirely local. Browser credentials are accessible to page code; do not claim perfect security.
- Audit tracked files AND history before publication. Do not push private test data or credentials in historical commits, and do not change repository visibility or DNS without explicit authorization.
- No placeholder controls or inactive feature buttons.
- Board and Graph share settings and a project, but have independent content, viewports, selections, and undo histories.

## Stack and implementation
- Vite, React, strict TypeScript. Zustand state. Dexie IndexedDB with debounced autosave.
- Plain CSS variables and CSS modules. No Tailwind or component libraries.
- Board uses a CSS-transformed world layer, with viewport transformations applied directly to the DOM. Pan/zoom must not rerender the item tree.
- Keep item updates granular and support 1,000+ items. Prefer readable code over abstractions.
- Shared optional visible grid and snapping. Keyboard shortcuts, undo/redo, project JSON import/export.
- Board: text, sticky notes, rect, ellipse, line/arrow, pen; selection, multi-selection, move, resize, delete.
- Graph: title/body nodes, explicit resizable importance and presets, draggable connections, labeled edges.

## Design
- Read and follow DESIGN.md before adding UI.
- Flat editorial chrome, warm paper, near-black ink, one restrained accent, hairline borders, tight spacing.
- Designed dark theme. Distinctive headings paired with clean sans/mono UI. One consistent custom SVG line icon set.
- No gradients, blur, glow, purple/violet accents, emoji icons, large rounded cards, soft shadows, hero empty states, or welcome copy.
- Accessible labeled controls, visible focus, usable pointer and keyboard input.

## Milestones and verification
- M1: scaffold, two-tab shell, DESIGN.md, theme tokens.
- M2: complete Board interactions, grid/snap, history, persistence.
- M3 (requires user authorization): Graph implementation.
- M4: JSON import/export, shortcuts, polish.
- M5: optional Graph AI assistant. Zod validates every proposal before Graph writes; Apply is one history entry.
- Run npm run typecheck, npm run lint, npm run build for each milestone; fix failures before committing/reporting.
- Commit each milestone. Keep dependencies minimal and report additions.
