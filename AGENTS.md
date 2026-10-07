# Infiniboard development conventions

## Architecture and privacy
- A personal, local-first application: no accounts, collaboration, project backend, cloud sync or content telemetry.
- Board and Graph are independent canvases in one project, with separate content, viewports, selections and undo histories. Shared settings control theme and the 24-unit snap grid.
- Autosave writes only to browser IndexedDB through Dexie. JSON export/import is the portability and backup mechanism; Graph Context generation and copying are local.
- Optional Graph AI calls OpenAI directly with the user's key. Never add a shared key, proxy, build-time credential or credential logging.
- Keys default to tab memory. Only explicit Remember on this device consent permits storage in the separate assistant database. Clear key removes both copies. Credentials must never enter projects, exports, Context, URLs, errors or fixtures.
- Browser-side credentials are accessible to page code. Preserve honest security disclosures and provider-retention caveats.

## Implementation
- Vite, React and strict TypeScript; Zustand state; Dexie with debounced autosave. Plain CSS variables and CSS modules, without component libraries or external font services.
- Board uses a custom CSS-transformed world layer. Apply viewport transforms directly to the DOM so pan/zoom does not rerender the item tree.
- Graph uses @xyflow/react with memoized custom nodes/edges and stable adapter identities. Keep updates granular for large canvases.
- Manual node dimensions and positions remain authoritative. Content fitting is an explicit creation/preset action; organization runs only when intentionally requested.
- Validate AI proposals before writing graph state. Preview changes nothing until Apply, which is one undo step. Preserve original omitted text for restoration.
- Keep code readable, dependencies minimal, and controls functional. Avoid unrelated refactoring when making focused fixes.

## Design and accessibility
- Follow [docs/DESIGN.md](docs/DESIGN.md): flat editorial chrome, warm paper and designed charcoal themes, hairline borders, tight spacing and one restrained accent.
- Use the existing line icons, labeled controls and visible keyboard focus. No gradients, blur, glow, emoji icons or decorative shadows.
- Canvas shortcuts yield to text editing, composition and dialogs. Preserve native scrolling inside long node text.
- Retain React Flow's visible attribution and the MIT license notice.

## Verification
- Install locked dependencies with `npm ci`.
- Before submitting changes, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; fix failures.
- AI tests use mocked requests and runtime-generated disposable credentials only. Never enter a real key in a browser fixture.
- See [tests/browser/README.md](tests/browser/README.md) for geometry, performance and privacy fixtures. Use a disposable origin/profile for persistence checks and screenshots.
- Keep generated output, local environment files, browser data and temporary artifacts out of Git. Test output lives in ignored `.verification/`; production output lives in ignored `dist/`.
