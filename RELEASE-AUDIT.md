# Clean release checkpoint — 7 October 2026

This checkpoint covers the sanitized source and public documentation prepared for an entirely new release repository. It does not authorize a visibility change or claim that a production site has been deployed.

## Repository boundary

The release directory was created separately from a previously reviewed source archive. No development .git directory, branches, tags, historical commits, environment files, browser data, private screenshots or verification output were transferred. The original development checkout and its detailed history remain local and untouched.

The candidate includes source, tests and development-only fixtures, package/lock files, MIT license, design/contributor conventions, README assets, favicon and static Cloudflare headers. New screenshots were captured from freshly authored fictional game-planning data through the real application; no AI request was used. The public GitHub noreply identity is used for the initial commit. The target repository was verified private and empty before preparing the new history; visibility must remain private during this task.

Secret/privacy scanning covers the exact staged blobs that become the initial commit, including new documentation and image metadata, rather than only working-tree text. The ignored local credential from the development directory is compared in memory without printing/copying it. Dependency/build/test output is excluded. No credentials or private live-test wording were found in the release source/assets.

## Application privacy

- There is no project backend, shared database, account, cloud sync, analytics, content logger or AI proxy. Dexie autosave writes only to browser IndexedDB.
- Generate is the only application API path: user input goes directly to OpenAI Responses. Authorization stays in its HTTPS header. Requests reject redirects, omit cookies/referrers and set store: false. Error messages do not reflect keys, input or provider bodies.
- Keys default to tab memory. Remember on this device requires consent and stores only in separate browser-local IndexedDB. Clear key clears both saved and current-tab copies. Legacy credentials without consent are purged. Keys never enter project JSON or Graph Context.
- Browser credentials are accessible to page code; the UI and README state this limitation. Provider retention and billing still apply to explicit requests.
- Context generation/copying and Organize run locally. Copy places text on the system clipboard.

## Privacy evidence

| Check | Evidence |
| --- | --- |
| Fresh browser profiles begin empty | User manually verified two actual profiles against the same site origin. Fresh disposable-origin checks also passed. |
| Profiles retain independent projects | User manually verified actual profile separation. Independent storage-adapter tests and disposable-origin checks also passed. |
| Editing/autosave does not upload project contents | Source/storage audit and mocked-network browser fixture: ordinary edits, autosave, Organize, Context and reload cause no application upload. |
| Key is not sent to the host | Direct OpenAI-only request path; tests verify credential exclusion from request body/URL, exports and Context. No live key or paid call used in verification. |
| Text leaves only for an explicit feature | Generate causes a mocked OpenAI request; ordinary editing/autosave and local graph tools do not. |
| Context is local | Pure Context generation tests and real local Copy verification pass. |

These are local/source/profile checks. Repeat them on the final HTTPS deployment, including host-injected scripts and headers, before claiming deployed-site privacy verification. No deployment, DNS or visibility changes are part of this task.

## Validation

Locked dependencies installed with npm ci; no dependency additions or upgrades. Typecheck, lint, all 66 tests and production build pass. npm audit reports no known vulnerabilities in the installed lock. Two existing Zod comment-annotation warnings are nonfatal build warnings.

Graph wheel zoom uses native React Flow cursor-centered handling without Ctrl/Cmd. Wheel up/down changes zoom in the expected direction; 10%–400% limits are preserved. Native pinch remains enabled. Space/middle/right drag and H retain panning. A genuinely overflowing node body scrolls without moving/zooming the canvas. Zoom/resizing/auto-size/layout geometry is checked against actual handle bounds. Board implementation files are unchanged.

README relative paths/anchors and four Shields SVG badges are verified. Four real 1440×900 screenshots are metadata-free WebP. Asset provenance and synthetic source are retained; private material and temporary capture files are excluded. Production output excludes fixtures, docs assets, source maps and the local credential.

## Hosting / publication

Cloudflare Workers Builds uses repository root, npm run build, npx wrangler@4.148.0 deploy and NODE_VERSION=22. wrangler.toml deploys ./dist as static assets with SPA navigation fallback. No Worker entrypoint, application logic, backend, server persistence, bindings or runtime secrets are configured. Wrangler metrics/dependency instrumentation are disabled. public/_headers provides CSP/referrer/frame/content-type protections, permitting API connections only to OpenAI. Leave Web Analytics disabled. Custom-domain DNS/HTTPS setup is manual.

Only the new clean history may be pushed to the verified private target. Do not import or merge the original local history later. Inspect the remote commit/tree and confirm private visibility after push. The final task report records the pushed commit and repository-publication decision; making it public remains a separate user action.

## Workers Static Assets follow-up

The release repository now has an explicit assets-only wrangler.toml for infiniboard, compatibility date 2026-10-07, ./dist and single-page-application fallback. No source application files, package dependencies, Worker entrypoint or bindings changed. Wrangler 4.148.0 is invoked through pinned npx commands; CLI metrics and dependency instrumentation are disabled. Generated .wrangler state and local .dev.vars files are ignored; ESLint excludes generated Wrangler code.

npm run build and npx wrangler@4.148.0 deploy --dry-run pass. The dry run prepares the dist assets without uploading/deploying; Wrangler's internal no-op stub is generated outside the repository and is not application code. The local-only Workers runtime parses the existing wildcard header rule. All six public HTML/JS/CSS/favicon assets match dist byte-for-byte, and a nested HTML navigation returns the exact index.html with HTTP 200. All five security headers match public/_headers on every checked response; that file itself is copied unchanged. Typecheck, lint and all 66 tests pass. No direct Cloudflare deploy command, DNS change or repository visibility change was performed by this follow-up. A push to main can trigger Workers Builds if the user has already connected this repository.
