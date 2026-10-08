import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || 'shots'
const URL = process.argv[3] || 'http://127.0.0.1:5180/'
const STAGE = process.argv[4] || 'all' // all | pre | menu | feature
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const dbg = () => page.evaluate(() => window.__hl.debug())
const wait = (ms) => page.waitForTimeout(ms)
const shot = async (name) => {
  const d = await dbg()
  console.log(`  ${name} @ ${JSON.stringify(d)}`)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

/** wait until the show reaches a phase (and optionally a trailer index) */
async function waitPhase(phase, trailer, timeout = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const d = await dbg()
    if (d.phase === phase && (trailer === undefined || d.trailer === trailer)) return d
    await wait(90)
  }
  throw new Error(`timeout waiting for ${phase}/${trailer}`)
}

/** wait until a specific shot index is live */
async function waitShot(trailer, shotIdx, timeout = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const d = await dbg()
    if (d.trailer === trailer && d.shot === shotIdx) return d
    await wait(70)
  }
  throw new Error(`timeout waiting for shot ${trailer}/${shotIdx}`)
}

await page.goto(URL, { waitUntil: 'networkidle' })
await wait(1800)
await shot('00-gate')

if (STAGE === 'all' || STAGE === 'pre') {
  await page.click('#startBtn')
  await waitPhase('boot')
  await wait(350); await shot('01-boot-tray')
  await wait(900); await shot('02-boot-read')

  await waitPhase('ident')
  await wait(700); await shot('03-ident')
  await wait(2200); await shot('04-ident-b')

  await waitPhase('leader')
  await wait(350); await shot('05-leader')

  for (let t = 0; t < 3; t++) {
    await waitPhase('trailer', t)
    await waitShot(t, 0); await wait(250); await shot(`06-t${t + 1}-a`)
    await waitShot(t, 1); await wait(250); await shot(`07-t${t + 1}-b`)
    await waitShot(t, 2); await wait(250); await shot(`08-t${t + 1}-c`)
    // shot 2 runs 1.7s, then the title card lands on the same set
    await wait(1900); await shot(`09-t${t + 1}-card`)
  }

  await waitPhase('title')
  await wait(900); await shot('10-title')
  await wait(1800); await shot('11-title-b')
}

if (STAGE === 'all' || STAGE === 'menu') {
  if (STAGE === 'menu') {
    await page.click('#startBtn').catch(() => {})
    await wait(1200)
    console.log('  pre-skip', JSON.stringify(await dbg()))
    await page.evaluate(() => window.__hl.skipToMenu())
    await wait(400)
    console.log('  post-skip', JSON.stringify(await dbg()))
  }
  await waitPhase('menu')
  await wait(1200); await shot('12-menu')

  await page.evaluate(() => {
    const items = document.querySelectorAll('.mi')
    if (items[1]) items[1].dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
  })
  await wait(900); await shot('13-menu-hover')

  await page.evaluate(() => window.__hl.overlay.openPanel('scenes'))
  await wait(800); await shot('14-panel-scenes')
  await page.evaluate(() => window.__hl.overlay.openPanel('behind'))
  await wait(800); await shot('15-panel-behind')
  await page.evaluate(() => window.__hl.overlay.openPanel('special'))
  await wait(800); await shot('16-panel-special')
  await page.evaluate(() => window.__hl.overlay.openPanel('settings'))
  await wait(800); await shot('17-panel-settings')
  await page.evaluate(() => window.__hl.overlay.closePanel())
  await wait(800)
}

if (STAGE === 'all' || STAGE === 'feature') {
  await page.evaluate(() => { window.__hl.overlay.closePanel(); window.__hl.toMenu() })
  await wait(900)
  await page.evaluate(() => window.__hl.startFeature())
  await wait(1800); await shot('18-feature-start')

  const stops = [0.04, 0.12, 0.22, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 0.97]
  let i = 0
  for (const s of stops) {
    await page.evaluate((v) => {
      window.__hl.input.scroll = v
      window.__hl.input.scrollTarget = v
    }, s)
    await wait(1600)
    await shot(`19-feature-${String(i++).padStart(2, '0')}-${Math.round(s * 100)}`)
  }
  await page.evaluate(() => {
    window.__hl.input.scroll = 1
    window.__hl.input.scrollTarget = 1
  })
  await wait(2200)
  await shot('20-end')
  await wait(600)
  console.log('end-state', JSON.stringify(await dbg()))
}

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
