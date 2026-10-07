# Infiniboard / design system

An editing instrument with the visual rhythm of a notebook index. The canvas is the primary surface; chrome is quiet, compact, and precise.

## Palette tokens

| Token | Paper theme | Charcoal theme | Use |
| --- | --- | --- | --- |
| paper | #f5f3ec | #222420 | canvas |
| surface | #fcfbf7 | #2b2e28 | chrome |
| ink | #242722 | #e9e8de | primary text |
| muted | #6b7066 | #b0b4a6 | secondary text |
| line | #d5d7cd | #494e43 | hairline borders |
| accent | #b7472c | #ed9477 | selection and active tools |
| accent-soft | #f4e6df | #45362d | active backgrounds |
| grid | #d3d5ca | #45493f | world grid dots |

Sticky swatches are content colors, not interface accents: oat #efe3b0, sage #d4dfc4, rose #efd4ca, paper #fcfbf7. In charcoal mode they become #514c32, #3c4c37, #543f36, #34382f, with light text. Shape fills follow the same swatches. Stroke uses ink.

## Typography
- Headings and brand: Georgia / Times New Roman serif, regular, slightly tight tracking. Local system faces keep the app offline and avoid font requests.
- UI and item body: system sans (Segoe UI, Arial, sans-serif).
- Coordinates and keyboard hints: Consolas / ui-monospace.
- Scale: 11px metadata; 12px secondary UI; 13px controls; 16px item body; 20px sticky body; 22px headings.
- Line height: UI 1.35; item text 1.45. Sentence case labels. No all-caps except compact section metadata.

## Spacing and geometry
- Spacing unit 4px. Use 4 / 8 / 12 / 16 / 24 / 32.
- Header 52px; footer 30px; tool buttons 36px square; minimum pointer controls 32px.
- Borders 1px; content strokes 2px; selection frame 1px accent.
- Radius 0 for canvas content, 3px for small controls, 4px for floating chrome. No pill cards.
- No gradients, opacity blur, glass, glow, or ornamental shadows.

## Components
- Header: serif wordmark and editable project title left, compact underlined tabs center, utility actions right.
- Toolbar: narrow flat vertical strip, monochrome line icons; active tool uses accent-soft background and accent ink.
- All icons share 24Ã—24 coordinates, 1.7px strokes, round caps and joins, no emoji.
- Panels: flat surface, hairline border, compact title and content. A keyboard reference may use a native dialog with opaque backdrop.
- Project files: one compact header menu for JSON export/import. Replacement confirmation states the incoming contents and automatic backup clearly. Dialogs use opaque paper backdrops and no shadow; long keyboard lists scroll inside the panel.
- Buttons: transparent at rest, subtle surface on hover, explicit accent focus ring. Disabled controls only when real functionality is temporarily unavailable.
- Canvas content: flat notes, transparent text, thin outlined shapes. Selection bounds and resize handles appear only for selected content.
- Empty board: small contextual instructions in a corner, never a centered hero.
- Footer: tool guidance on left, save state and zoom controls on right.
- Grid: 24 world-unit dots. Zoom scales spacing with the world; dense levels reduce dot frequency.
- Graph nodes: flat surface, square corners, 1px ink border; serif title and sans body. No shadows.
- Importance presets: S 192Ã—120, M 288Ã—192, L 384Ã—264, XL 528Ã—360; clamp to 144Ã—96 through 768Ã—576. Title sizes 18 / 24 / 32 / 40px; body 14 / 16 / 18 / 20px. Step typography by node area.
- Generated cards and explicit preset actions retain semantic importance for typography and minimum width. Fit their initial height and extra width to measured title/body content within 768Ã—576; title-only cards use compact heights. Legacy nodes without importance retain typography by area. Manual resizing and later edits preserve explicit dimensions; fitting is never a render-time effect.
- Graph handles: 8px outlined square on each side, paper fill; accent on hover/connection. Selection and resize handles use the existing accent and square geometry.
- Graph edges: one bezier style, 1.7px ink stroke; accent when selected. Curves stay legible across varied node positions. Label is a small flat surface on the curve, editable inline. Connection preview uses the same curve with a dashed accent stroke.
- Graph chrome: compact add/pan strip and selection inspector. Custom footer zoom; no default React Flow controls or minimap. Grid uses the Board's dot geometry and density rules.
- Graph header: visible Organize text with the branch icon beside history/Snap. Enabled for nonempty graphs; arrangement is an explicit, undoable action and never runs during manual editing.
- Graph Context: visible Context text and file icon in the header. Flat native dialog, opaque paper backdrop, read-only mono textarea, Copy with inline status and Close. No AI request or editable rich text.
- Graph assistant: a small branch-icon button at bottom right opens a 408px flat side panel. Header and Apply/Discard footer stay visible while notes and outline scroll. Preview uses indented hairline branches, size markers, and expandable original omissions. Settings use an opaque native dialog with masked key input. No sparkle icon, shadows, or decorative loading effects.
- Theme changes preserve readable content through semantic swatches, not blanket inversion.

## Interaction and accessibility
- Tooltips and accessible labels for icon controls. Always show focus-visible outlines.
- Space-drag or middle-button drag pans. Board wheel pans; Ctrl/Cmd+wheel zooms about pointer. Graph wheel and pinch zoom about pointer without a modifier; scrollable node text retains native scrolling. Toolbar zoom centers on canvas.
- Selected items use handles. Double-click text or sticky content to edit. Escape finishes editing or cancels current gesture.
- Visible grid toggle controls snapping. World coordinatesâ€”not screen pixelsâ€”are rounded to the nearest 24 units.
- Undo groups a complete drag, resize, stroke, or text edit into one action.
- Resize and move remain in world coordinates at every zoom.
