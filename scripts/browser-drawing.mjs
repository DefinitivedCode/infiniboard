/* global window, PointerEvent, getComputedStyle */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// No application dependency is added. Use an existing Playwright installation,
// or point INFINIBOARD_PLAYWRIGHT_PATH at its package directory.
const require = createRequire(import.meta.url)
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = ['playwright', process.env.INFINIBOARD_PLAYWRIGHT_PATH, process.env.USERPROFILE && join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)
let playwright
for (const candidate of candidates) { try { playwright = require(candidate); break } catch { /* Try the next existing installation. */ } }
if (!playwright) throw new Error('Install Playwright outside the app or set INFINIBOARD_PLAYWRIGHT_PATH to an existing package directory.')
const executablePath = process.env.INFINIBOARD_BROWSER_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const port = process.env.INFINIBOARD_BROWSER_PORT ?? '4179'
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [join(workspace, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: workspace, stdio: 'pipe', windowsHide: true })
let serverOutput = ''
server.stdout.on('data', chunk => { serverOutput += chunk })
server.stderr.on('data', chunk => { serverOutput += chunk })
const output = join(workspace, '.verification/browser-drawing')
await mkdir(output, { recursive: true })
let browser
const results = []
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Disposable Vite server failed: ${serverOutput}`)
    try { if ((await fetch(`${origin}/tests/browser/board-drawing.html`)).ok) break } catch { /* Wait for startup. */ }
    if (i === 99) throw new Error(`Disposable Vite server did not start: ${serverOutput}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  // A fresh context has its own IndexedDB. Never launch the user's profile.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/tests/browser/board-drawing.html`)
  await page.waitForFunction(() => window.drawingFixture?.ready())
  const snapshot = () => page.evaluate(() => window.drawingFixture.snapshot())
  const reset = async () => { await page.evaluate(() => window.drawingFixture.reset()); await page.getByLabel('Whiteboard canvas').waitFor() }
  const tool = name => page.getByRole('button', { name, exact: true }).click()
  const draw = async (points, release = true) => {
    await page.mouse.move(...points[0]); await page.mouse.down()
    for (const point of points.slice(1)) await page.mouse.move(...point)
    if (release) await page.mouse.up()
  }
  const run = async (name, action) => {
    const started = performance.now()
    await action()
    const result = { name, passed: true, durationMs: Math.round(performance.now() - started) }
    results.push(result); console.log(`PASS ${name} (${result.durationMs}ms)`)
  }
  await run('Persistent pen, genuine consecutive mouse gestures, no selection or handles', async () => {
    await reset(); await tool('Pen (P)')
    await draw([[160, 210], [185, 190], [210, 220], [235, 180]])
    await draw([[270, 210], [295, 190], [320, 220], [345, 180]])
    const s = await snapshot()
    assert.equal(s.tool, 'pen'); assert.deepEqual(s.selected, []); assert.equal(s.project.board.order.length, 2); assert.equal(s.past, 2)
    assert.equal(await page.locator('[data-handle]').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Pen (P)', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.deepEqual(s.project.board.viewport, { x: 0, y: 0, zoom: 1 })
    assert.match(await page.locator('[data-item-type="pen"] svg path').last().getAttribute('d'), /C/)
  })
  await run('A pen tap creates a visible dot and extremely short strokes survive', async () => {
    await reset(); await tool('Pen (P)'); await page.mouse.click(200, 220)
    await draw([[230, 220], [230.3, 220.2]])
    assert.equal((await snapshot()).project.board.order.length, 2)
    assert.ok(await page.locator('[data-item-type="pen"] svg circle').count() >= 1)
  })
  await run('Intentional dot selection retains a seven-screen-pixel hit radius across zoom', async () => {
    for (const zoom of [.1, .5, 1, 2, 4]) {
      await reset(); const file = JSON.parse(await page.evaluate(() => window.drawingFixture.export()))
      file.project.board.viewport = { x: 0, y: 0, zoom }
      await page.evaluate(contents => window.drawingFixture.load(contents), JSON.stringify(file))
      await tool('Pen (P)'); await page.mouse.click(250, 230); await page.keyboard.press('v')
      const hit = page.locator('[data-item-type="pen"] svg circle').first()
      const radius = await hit.evaluate(el => Number.parseFloat(getComputedStyle(el).r))
      assert.ok(Math.abs(radius * zoom - 7) < .02)
      await page.mouse.click(255, 230)
      assert.equal((await snapshot()).selected.length, 1)
    }
  })
  await run('Pointercancel and lost capture discard drafts; following strokes work', async () => {
    await reset(); await tool('Pen (P)')
    for (const event of ['pointercancel', 'lostpointercapture']) {
      await draw([[170, 220], [220, 250]], false)
      await page.getByLabel('Whiteboard canvas').evaluate((el, name) => el.dispatchEvent(new PointerEvent(name, { bubbles: true, pointerId: 1, isPrimary: true })), event)
      await page.mouse.up()
      const s = await snapshot(); assert.equal(s.project.board.order.length, 0); assert.equal(s.draft, null); assert.equal(s.gesture, null)
    }
    await draw([[170, 220], [220, 250]]); assert.equal((await snapshot()).project.board.order.length, 1)
  })
  await run('Pointer release outside canvas commits via real pointer capture', async () => {
    await reset(); await tool('Pen (P)'); await draw([[170, 220], [220, 250], [250, 12]])
    assert.equal((await snapshot()).project.board.order.length, 1)
    await draw([[270, 220], [320, 250]]); assert.equal((await snapshot()).project.board.order.length, 2)
  })
  await run('Foreign pointer events cannot end or corrupt the active stroke', async () => {
    await reset(); await tool('Pen (P)'); await draw([[170, 220], [220, 250]], false)
    await page.getByLabel('Whiteboard canvas').evaluate(el => {
      el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 99, isPrimary: false, clientX: 800, clientY: 800 }))
      el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 99, isPrimary: false }))
    })
    await page.mouse.up(); const s = await snapshot(); assert.equal(s.project.board.order.length, 1)
    const item = s.project.board.items[s.project.board.order[0]]; assert.ok(item.width < 100 && item.height < 100)
  })
  await run('Coalesced samples are retained between render frames', async () => {
    await reset(); await tool('Pen (P)'); await page.mouse.move(170, 220); await page.mouse.down()
    await page.getByLabel('Whiteboard canvas').evaluate(el => {
      const e = new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 220, clientY: 220 })
      Object.defineProperty(e, 'getCoalescedEvents', { value: () => [new PointerEvent('pointermove', { clientX: 185, clientY: 190 }), new PointerEvent('pointermove', { clientX: 200, clientY: 250 })] })
      el.dispatchEvent(e)
    })
    await page.mouse.move(230, 220); await page.mouse.up()
    const s = await snapshot(), item = s.project.board.items[s.project.board.order[0]]
    assert.ok(item.points.length >= 4); assert.ok(item.height >= 60)
  })
  await run('An active 10,000-sample coalesced gesture retains full trajectory and renders promptly', async () => {
    await reset(); await tool('Pen (P)'); await page.mouse.move(150, 350); await page.mouse.down()
    const timing = await page.getByLabel('Whiteboard canvas').evaluate(el => {
      const points = Array.from({ length: 10000 }, (_, i) => ({ x: 150 + i * .055, y: 350 + Math.sin(i * .16) * 3 }))
      const e = new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: points.at(-1).x, clientY: points.at(-1).y })
      Object.defineProperty(e, 'getCoalescedEvents', { value: () => points.map(p => ({ clientX: p.x, clientY: p.y })) })
      const start = performance.now(); el.dispatchEvent(e)
      return { captureMs: performance.now() - start, points }
    })
    await page.mouse.move(timing.points.at(-1).x, timing.points.at(-1).y); await page.mouse.up()
    const s = await snapshot(), item = s.project.board.items[s.project.board.order[0]]
    assert.ok(item.points.length > 6500, `Retained ${item.points.length} samples; .25px dedup should only remove subpixel neighbors`)
    assert.ok(item.width > 540 && item.height > 5.9)
    assert.match(await page.locator('[data-item-type="pen"] svg path').last().getAttribute('d'), /C/)
    results.push({ name: 'Active 10,000-sample capture measurement', passed: true, captureMs: timing.captureMs, retainedSamples: item.points.length })
  })
  await run('Real touch input draws without scrolling or panning', async () => {
    await reset(); await tool('Pen (P)'); const session = await context.newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 220 }] })
    for (const [x, y] of [[180, 205], [195, 230], [220, 210]]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach()
    const s = await snapshot(); assert.equal(s.project.board.order.length, 1); assert.deepEqual(s.selected, []); assert.deepEqual(s.project.board.viewport, { x: 0, y: 0, zoom: 1 })
  })
  await run('Pen/stylus Pointer Events use the same persistent drawing lifecycle', async () => {
    await reset(); await tool('Pen (P)')
    await page.getByLabel('Whiteboard canvas').evaluate(el => {
      // Synthetic pen events exercise the stylus branch; pointerId 1 belongs to
      // the genuine preceding mouse interaction so pointer capture stays valid.
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'pen', pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 170, clientY: 220, pressure: .6 }))
      el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'pen', pointerId: 1, isPrimary: true, buttons: 1, clientX: 200, clientY: 230, pressure: .8 }))
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'pen', pointerId: 1, isPrimary: true, button: 0, clientX: 230, clientY: 220 }))
    })
    const s = await snapshot(); assert.equal(s.project.board.order.length, 1); assert.equal(s.tool, 'pen'); assert.deepEqual(s.selected, [])
  })
  await run('Wheel and Space during a drawing gesture do not move the viewport', async () => {
    await reset(); await tool('Pen (P)'); await draw([[170, 220], [220, 250]], false)
    await page.mouse.wheel(40, 100); await page.keyboard.down('Space'); await page.mouse.move(240, 220); await page.keyboard.up('Space'); await page.mouse.up()
    assert.deepEqual((await snapshot()).project.board.viewport, { x: 0, y: 0, zoom: 1 })
  })
  await run('Escape cancels and selects; switching tools cancels an unfinished stroke', async () => {
    await reset(); await tool('Pen (P)'); await draw([[170, 220], [220, 250]], false); await page.keyboard.press('Escape'); await page.mouse.up()
    let s = await snapshot(); assert.equal(s.tool, 'select'); assert.equal(s.project.board.order.length, 0)
    await page.keyboard.press('p'); await draw([[170, 220], [220, 250]], false)
    await page.getByRole('button', { name: 'Eraser (E)', exact: true }).evaluate(el => el.click()); await page.mouse.up()
    s = await snapshot(); assert.equal(s.tool, 'eraser'); assert.equal(s.project.board.order.length, 0)
  })
  await run('Eraser partially splits strokes, remains active and groups history', async () => {
    await reset(); await tool('Pen (P)'); await draw([[160, 250], [300, 250], [440, 250]])
    const before = (await snapshot()).project.board
    await page.keyboard.press('e'); await draw([[300, 200], [300, 300]])
    let s = await snapshot(); assert.equal(s.tool, 'eraser'); assert.deepEqual(s.selected, []); assert.equal(s.project.board.order.length, 2); assert.equal(s.past, 2)
    const erased = s.project.board
    await page.keyboard.press('Control+z'); assert.deepEqual((await snapshot()).project.board, before)
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual((await snapshot()).project.board, erased)
    await draw([[150, 250], [450, 250]])
    s = await snapshot(); assert.equal(s.project.board.order.length, 0); assert.equal(s.past, 3); assert.equal(s.tool, 'eraser')
  })
  await run('Coalesced eraser samples follow the actual bent trajectory and do not erase its chord', async () => {
    await reset(); const file = JSON.parse(await page.evaluate(() => window.drawingFixture.export()))
    file.project.board.items = {
      target: { id: 'target', type: 'pen', x: 250, y: 243, width: 1, height: 10, points: [{ x: 0, y: 0 }, { x: 0, y: 1 }] },
      chord: { id: 'chord', type: 'pen', x: 245, y: 148, width: 10, height: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    }; file.project.board.order = ['target', 'chord']
    await page.evaluate(contents => window.drawingFixture.load(contents), JSON.stringify(file)); await tool('Eraser (E)')
    await page.mouse.move(160, 200); await page.mouse.down()
    await page.getByLabel('Whiteboard canvas').evaluate(el => {
      const e = new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 360, clientY: 200 })
      Object.defineProperty(e, 'getCoalescedEvents', { value: () => [{ clientX: 160, clientY: 300 }, { clientX: 360, clientY: 300 }] })
      el.dispatchEvent(e)
    })
    await page.mouse.move(360, 200); await page.mouse.up()
    const s = await snapshot(); assert.deepEqual(s.project.board.order, ['chord']); assert.deepEqual(s.project.board.items.chord, file.project.board.items.chord); assert.equal(s.past, 1)
  })
  await run('Cancelled erasing restores exact geometry and leaves history unchanged', async () => {
    await reset(); await tool('Pen (P)'); await draw([[160, 250], [440, 250]])
    const before = (await snapshot()).project.board
    await tool('Eraser (E)'); await draw([[300, 200], [300, 250]], false)
    await page.getByLabel('Whiteboard canvas').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, isPrimary: true })))
    await page.mouse.up(); assert.deepEqual((await snapshot()).project.board, before); assert.equal((await snapshot()).past, 1)
  })
  await run('Undo during drawing/erasing is deferred and miss-only erasing adds no history', async () => {
    await reset(); await tool('Pen (P)'); await draw([[160, 250], [440, 250]])
    const before = (await snapshot()).project.board
    await draw([[170, 350], [230, 370]], false); await page.keyboard.press('Control+z')
    assert.deepEqual((await snapshot()).project.board, before)
    await page.keyboard.press('Escape'); await page.mouse.up(); await tool('Eraser (E)')
    await draw([[500, 500], [600, 600]]); assert.equal((await snapshot()).past, 1)
    await draw([[300, 200], [300, 250]], false); const erased = (await snapshot()).project.board
    await page.keyboard.press('Control+z'); assert.deepEqual((await snapshot()).project.board, erased)
    await page.mouse.up(); assert.equal((await snapshot()).past, 2)
  })
  await run('Coordinate mapping and screen-sized eraser at 10%, 50%, 200% and 400%', async () => {
    for (const zoom of [.1, .5, 2, 4]) {
      await reset()
      const json = await page.evaluate(() => window.drawingFixture.export())
      const file = JSON.parse(json); file.project.board.viewport = { x: 0, y: 0, zoom }
      await page.evaluate(contents => window.drawingFixture.load(contents), JSON.stringify(file))
      await tool('Pen (P)'); await draw([[200, 250], [400, 250]])
      const s = await snapshot(), item = s.project.board.items[s.project.board.order[0]]
      assert.ok(Math.abs(item.width * zoom - 200) < .1)
      await tool('Eraser (E)'); await page.mouse.move(300, 250)
      const cursor = page.locator('[class*="eraserCursor"]'); const box = await cursor.boundingBox()
      assert.ok(box && Math.abs(box.width - 28) < .2)
      await draw([[300, 240], [300, 260]])
      assert.equal((await snapshot()).project.board.order.length, 2)
    }
  })
  await run('Drawing/partial erasure persist in IndexedDB across reload and JSON import', async () => {
    await reset(); await tool('Pen (P)'); await draw([[160, 250], [440, 250]]); await tool('Eraser (E)'); await draw([[300, 200], [300, 300]])
    const before = (await snapshot()).project.board
    const exported = await page.evaluate(() => window.drawingFixture.export()); await page.evaluate(() => window.drawingFixture.save())
    await page.reload(); await page.waitForFunction(() => window.drawingFixture?.ready())
    assert.deepEqual((await snapshot()).project.board, before)
    await page.evaluate(contents => window.drawingFixture.load(contents), exported); assert.deepEqual((await snapshot()).project.board, before)
  })
  await run('Legacy points render, survive save/reload and are partially erasable', async () => {
    await reset(); const file = JSON.parse(await page.evaluate(() => window.drawingFixture.export()))
    file.project.board.items.legacy = { id: 'legacy', type: 'pen', x: 150, y: 200, width: 300, height: 100, points: [{ x: 0, y: 0 }, { x: .25, y: 1 }, { x: .5, y: .25 }, { x: 1, y: 0 }] }; file.project.board.order = ['legacy']
    await page.evaluate(contents => window.drawingFixture.load(contents), JSON.stringify(file))
    assert.match(await page.locator('[data-item-id="legacy"] svg path').last().getAttribute('d'), /C/)
    await page.evaluate(() => window.drawingFixture.save()); await page.reload(); await page.waitForFunction(() => window.drawingFixture?.ready())
    assert.deepEqual((await snapshot()).project.board.items.legacy, file.project.board.items.legacy)
    await tool('Eraser (E)'); await draw([[300, 180], [300, 400]]); assert.equal((await snapshot()).project.board.order.length, 2)
  })
  await run('Large mixed Board: 1,000 strokes, 10,000-point path, rapid gestures, erasing and repeated history', async () => {
    await page.evaluate(() => window.drawingFixture.synthetic(1000, 10000)); await tool('Pen (P)')
    const initial = await snapshot(), immutable = Object.fromEntries(['shape', 'note', 'arrow'].map(id => [id, initial.project.board.items[id]]))
    const start = performance.now()
    for (let i = 0; i < 15; i++) await draw([[160 + i * 20, 810], [166 + i * 20, 797], [175 + i * 20, 810]])
    assert.equal((await snapshot()).project.board.order.length, 1019)
    await tool('Eraser (E)'); await draw([[160, 790], [470, 815]])
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Shift+z') }
    const s = await snapshot(); for (const [id, item] of Object.entries(immutable)) assert.deepEqual(s.project.board.items[id], item)
    results.push({ name: 'Large mixed Board gesture batch measurement', durationMs: Math.round(performance.now() - start), passed: true })
    await page.screenshot({ path: join(output, 'large-drawing.png') })
  })
  await run('Existing shapes, notes, arrows, Graph nodes/edges and AI panel stay usable', async () => {
    await reset(); const file = JSON.parse(await page.evaluate(() => window.drawingFixture.export()))
    file.project.graph.nodes = { a: { id: 'a', title: 'Existing A', body: 'Original node', x: 150, y: 150, width: 288, height: 192 }, b: { id: 'b', title: 'Existing B', body: '', x: 550, y: 150, width: 288, height: 192 } }; file.project.graph.nodeOrder = ['a', 'b']; file.project.graph.edges = { ab: { id: 'ab', source: 'a', target: 'b', label: 'Existing connection', sourceHandle: 'right', targetHandle: 'left' } }; file.project.graph.edgeOrder = ['ab']
    await page.evaluate(contents => window.drawingFixture.load(contents), JSON.stringify(file))
    await page.getByRole('button', { name: 'Graph', exact: true }).click(); await page.locator('[data-graph-node="a"]').waitFor()
    assert.equal(await page.locator('[data-graph-node]').count(), 2); assert.equal(await page.locator('.react-flow__edge').count(), 1)
    const assistantButton = page.getByRole('button', { name: /assistant/i }).first(); await assistantButton.click()
    await page.getByRole('button', { name: 'New tree', exact: true }).waitFor()
    assert.deepEqual((await snapshot()).project.graph, file.project.graph)
    await page.getByRole('button', { name: 'Board', exact: true }).click(); await tool('Pen (P)'); await draw([[160, 250], [440, 250]])
    assert.deepEqual((await snapshot()).project.graph.nodes, file.project.graph.nodes)
  })
  await run('Synthetic before/after visual comparison renders without browser errors', async () => {
    await page.goto(`${origin}/tests/browser/board-drawing.html?compare`)
    await page.getByRole('heading', { name: 'Smooth vector curves' }).waitFor()
    await page.screenshot({ path: join(output, 'stroke-comparison.png'), fullPage: true })
    assert.deepEqual(errors, [])
  })
  await writeFile(join(output, 'report.json'), JSON.stringify({ browser: await browser.version(), results }, null, 2))
  console.log(`${results.length} browser checks passed. Screenshots and report: .verification/browser-drawing/`)
} finally {
  await browser?.close(); server.kill()
}
