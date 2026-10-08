/* ============================================================
   experience — the show. Boot → ident → trailers → menu → feature.
   ============================================================ */

import * as THREE from 'three'
import { Post } from './gfx/post'
import { Governor, qualityFor, detectTier, type Quality, type Tier } from './core/device'
import { Input } from './core/input'
import { Timeline, clamp, lerp, damp, ease, smooth, smoother, fbm1, noise1, type EaseFn } from './core/timeline'
import { AudioEngine } from './audio/engine'
import { Overlay, buildMenu, setMenuHot, tickMenu, type MenuRec, type TrackRec } from './ui/overlay'
import {
  buildDiscSet, buildBenchSet, buildAuditoriumSet, buildPressSet, buildArchiveSet,
  animateBeam, animateDust, type SetRefs,
} from './world/sets'
import { BRAND, MENU, TRAILERS, BAYS, CHAPTERS } from './data/brand'
import { hasSeenIntro, markIntroSeen, forgetIntro, playCount } from './core/persist'

type Phase = 'idle' | 'boot' | 'ident' | 'leader' | 'trailer' | 'title' | 'menu' | 'feature' | 'end'

interface Cam { p: [number, number, number]; l: [number, number, number]; fov?: number }
interface Shot { dur: number; a: Cam; b: Cam; ease?: EaseFn }

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const T1_SHOTS: Shot[] = [
  { dur: 1.75, a: { p: [-0.30, 1.15, 2.95], l: [0.05, 0.05, 0.10], fov: 32 }, b: { p: [-0.10, 1.00, 2.42], l: [0.00, 0.05, 0.10], fov: 30 }, ease: ease.inOutSine },
  { dur: 1.75, a: { p: [2.60, 1.85, 3.45], l: [-0.30, 0.15, 0.00], fov: 44 }, b: { p: [2.05, 1.55, 3.02], l: [-0.35, 0.15, 0.00], fov: 42 }, ease: ease.inOutSine },
  { dur: 1.70, a: { p: [-2.15, 1.55, 2.25], l: [0.15, 0.15, 0.15], fov: 38 }, b: { p: [-1.55, 1.28, 1.92], l: [0.10, 0.10, 0.15], fov: 35 }, ease: ease.outCubic },
]
const T2_SHOTS: Shot[] = [
  { dur: 1.85, a: { p: [0.35, 2.35, 8.40], l: [0, 2.50, -8.0], fov: 47 }, b: { p: [0.15, 2.22, 6.60], l: [0, 2.50, -8.0], fov: 43 }, ease: ease.inOutSine },
  { dur: 1.75, a: { p: [-0.65, 0.80, 1.30], l: [0, 2.50, -9.0], fov: 43 }, b: { p: [-0.18, 1.05, -0.50], l: [0, 2.50, -9.0], fov: 38 }, ease: ease.outCubic },
  { dur: 1.65, a: { p: [0, 2.55, -2.80], l: [0, 2.60, -9.7], fov: 37 }, b: { p: [0, 2.58, -4.40], l: [0, 2.60, -9.7], fov: 30 }, ease: ease.inOutSine },
]
const T3_SHOTS: Shot[] = [
  { dur: 1.75, a: { p: [1.15, 1.05, 2.90], l: [0, 1.15, 0], fov: 34 }, b: { p: [0.80, 1.25, 2.50], l: [0, 1.15, 0], fov: 31 }, ease: ease.outCubic },
  { dur: 1.75, a: { p: [3.30, 1.05, 2.20], l: [1.55, 0.35, -0.30], fov: 38 }, b: { p: [2.90, 0.85, 1.70], l: [1.55, 0.30, -0.30], fov: 35 }, ease: ease.inOutSine },
  { dur: 1.70, a: { p: [0, 1.85, 3.30], l: [0, 1.30, 0], fov: 34 }, b: { p: [0, 1.65, 2.70], l: [0, 1.15, 0], fov: 30 }, ease: ease.outCubic },
]
const TRAILER_SHOTS = [T1_SHOTS, T2_SHOTS, T3_SHOTS]

export interface Prefs {
  audio: boolean
  volume: 'Low' | 'Standard' | 'High'
  quality: 'Auto' | 'Ultra' | 'High' | 'Medium' | 'Low'
  motion: 'Full' | 'Reduced'
  grain: 'On' | 'Off'
  letterbox: 'Auto' | 'Always' | 'Never'
}

export class Experience {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  post: Post
  audio = new AudioEngine()
  input: Input
  overlay = new Overlay()
  gov: Governor

  prefs: Prefs = {
    audio: true,
    volume: 'Standard',
    quality: 'Auto',
    motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduced' : 'Full',
    grain: 'On',
    letterbox: 'Auto',
  }

  phase: Phase = 'idle'
  private set: SetRefs | null = null
  private tl = new Timeline()
  private time = 0
  private shotIdx = 0
  private shotT = 0
  private trailerIdx = 0
  private menuRecs: MenuRec[] = []
  private bayTracks: TrackRec[] = []
  private menuActive = 0
  private featureStart = 0
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private camFov = 38
  private targetPos = new THREE.Vector3()
  private targetLook = new THREE.Vector3()
  private targetFov = 38
  private featureCurve!: THREE.CatmullRomCurve3
  private lookCurve!: THREE.CatmullRomCurve3
  private ready = false
  private skipping = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    })
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x05060a, 1)

    this.gov = new Governor(detectTier())
    this.post = new Post(this.renderer)
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200)
    this.input = new Input(document.body)

    this.gov.onChange = (q) => this.applyQuality(q)
    this.applyQuality(this.gov.quality)
    this.resize()

    addEventListener('resize', () => this.resize())
    this.wireKeys()
    this.buildFeaturePath()
  }

  /* ---------------- setup ---------------- */

  private applyQuality(q: Quality) {
    this.post.setQuality(q)
    this.post.u.uGrain.value = this.prefs.grain === 'Off' ? 0.01 : (q.grain ? 0.052 : 0.02)
    this.resize()
    this.overlay.state(`Quality ${q.tier}`)
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight
    const q = this.gov.quality
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatioCap)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.post.setSize(w, h, dpr)
  }

  private buildFeaturePath() {
    // camera track down the archive corridor, swinging to each bay
    const pts: THREE.Vector3[] = [
      v(0, 1.62, 3.4),
      v(-1.0, 1.55, 1.4),
      v(-0.6, 1.5, -1.6),
      v(0.9, 1.55, -5.4),
      v(0.5, 1.5, -8.6),
      v(-0.9, 1.55, -13.2),
      v(-0.5, 1.5, -16.4),
      v(0.9, 1.55, -22.4),
      v(0.4, 1.5, -25.8),
      v(0, 1.6, -30.4),
      v(0, 1.7, -34.2),
    ]
    const looks: THREE.Vector3[] = [
      v(0, 1.5, -1),
      v(-2.3, 1.35, 0.1),
      v(-1.4, 1.4, -4),
      v(2.3, 1.4, -7.4),
      v(1.2, 1.4, -11),
      v(-2.3, 1.5, -16.6),
      v(-1.4, 1.5, -19),
      v(2.3, 1.35, -24.6),
      v(1.0, 1.5, -28),
      v(0, 2.1, -36),
      v(0, 2.1, -38.4),
    ]
    this.featureCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4)
    this.lookCurve = new THREE.CatmullRomCurve3(looks, false, 'centripetal', 0.4)
  }

  private wireKeys() {
    addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        this.setAudio(!this.prefs.audio)
        return
      }
      if (this.overlay.panelOpen) {
        if (e.key === 'Escape') { this.audio.back(); this.overlay.closePanel() }
        return
      }
      if (e.key === 'Escape') {
        if (this.phase === 'boot' || this.phase === 'ident' || this.phase === 'leader' || this.phase === 'trailer' || this.phase === 'title') {
          this.skipToMenu()
        } else if (this.phase === 'feature') {
          this.toMenu()
        } else if (this.phase === 'end') {
          this.overlay.hideEnd()
          this.toMenu()
        }
        return
      }
      if (this.phase === 'menu') {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.moveMenu(-1) }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.moveMenu(1) }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.activateMenu() }
      }
    })
  }

  setAudio(on: boolean) {
    this.prefs.audio = on
    this.audio.setMuted(!on)
    const b = document.getElementById('audioBtn')
    if (b) b.setAttribute('aria-pressed', String(on))
    this.overlay.say(on ? 'Sound on' : 'Sound off')
  }

  /** snapshot for tooling / debugging */
  debug() {
    return {
      phase: this.phase,
      trailer: this.trailerIdx,
      shot: this.shotIdx,
      quality: this.gov.quality.tier,
      flash: this.post.u.uFlash.value as number,
      scroll: this.input.scroll,
      cam: this.camera.position.toArray().map((n) => +n.toFixed(2)),
      log: this.trace.slice(-12),
    }
  }

  private trace: string[] = []
  private mark(s: string) {
    this.trace.push(`${s}#${this.tlTick}`)
    if (this.trace.length > 60) this.trace.shift()
  }
  private tlTick = 0

  /* ---------------- the show ---------------- */

  /** called from the "Insert disc" button */
  async begin(muted: boolean) {
    if (this.ready) return
    this.ready = true
    this.prefs.audio = !muted
    await this.audio.start(muted)
    this.audio.setVolume(this.prefs.volume === 'Low' ? 0.45 : this.prefs.volume === 'High' ? 1.0 : 0.8)
    this.setAudio(!muted)
    this.audio.startRoom(0.045)
    if (hasSeenIntro()) {
      // a returning visitor has already sat through the previews A? skip them
      this.mark('resume')
      this.overlay.chromeEl.hidden = false
      requestAnimationFrame(() => this.overlay.chromeEl.classList.add('is-on'))
      this.overlay.state('Resume')
      this.overlay.say('Welcome back. Taking you to the main menu.')
      this.runResume()
    } else {
      this.runBoot()
    }
  }

  /** the short path for a returning visitor: a breath, then the menu */
  private runResume() {
    this.loadSet(buildDiscSet())
    this.phase = 'boot'
    this.camera.position.set(0, 0.35, 8.6)
    this.camLook.set(0, 0.15, 0)
    this.camFov = 30
    this.targetPos.set(0, 0.35, 8.6)
    this.targetLook.set(0, 0.15, 0)
    this.targetFov = 30
    const tl = this.tl
    tl.stop()
    tl.at(0.0, () => { this.audio.spinUp(1.0); this.overlay.state('Reading disc') })
    tl.tweenAt(0.0, { from: 8.6, to: 6.2, dur: 0.85, ease: ease.outCubic, on: (val) => { this.targetPos.set(0, 0.32, val) } })
    tl.at(0.75, () => { this.audio.crtOn(); this.overlay.flash(true); this.post.u.uFlash.value = 1 })
    tl.tweenAt(0.75, { from: 1, to: 0, dur: 0.7, ease: ease.outCubic, on: (val) => { this.post.u.uFlash.value = val } })
    tl.at(1.35, () => this.toMenu())
    tl.play()
  }

  /** replay the full opening from the top (Special Features A? Coming Attractions) */
  replayOpening() {
    forgetIntro()
    this.ready = true
    this.overlay.hideEnd()
    this.overlay.closePanel()
    this.runBoot()
  }

  skipToMenu() {
    this.mark('skip')
    if (this.phase === 'menu') return
    this.skipping = true
    this.tl.finish()
    this.overlay.flash(false)
    markIntroSeen()
    this.toMenu()
    this.skipping = false
  }

  /* ---------- phase 1 · boot ---------- */
  private runBoot() {
    this.mark('boot')
    this.loadSet(buildDiscSet())
    this.phase = 'boot'
    this.overlay.chromeEl.hidden = false
    requestAnimationFrame(() => this.overlay.chromeEl.classList.add('is-on'))
    this.overlay.state('Tray open')
    this.overlay.say('Disc loading')

    this.camera.position.set(0, 0.35, 8.6)
    this.camLook.set(0, 0.15, 0)
    this.camFov = 30
    this.targetPos.set(0, 0.35, 8.6)
    this.targetLook.set(0, 0.15, 0)
    this.targetFov = 30

    const tl = this.tl
    tl.stop()
    tl.at(0.0, () => { this.audio.servo(0.6); this.overlay.state('Tray open') })
    tl.tweenAt(0.0, { from: 8.6, to: 6.4, dur: 0.9, ease: ease.outCubic, on: (val) => { this.targetPos.set(0, 0.32, val) } })
    tl.at(0.85, () => { this.overlay.state('Reading disc'); this.audio.spinUp(1.2) })
    tl.at(1.55, () => { this.audio.seek() })
    tl.at(2.10, () => {
      this.audio.crtOn()
      this.overlay.flash(true)
      this.overlay.state('Picture start')
      this.post.u.uFlash.value = 1
    })
    tl.tweenAt(2.22, { from: 1, to: 0, dur: 0.55, ease: ease.outQuad, on: (val) => { this.post.u.uFlash.value = val } })
    tl.at(2.72, () => this.overlay.flash(false))
    tl.at(2.95, () => this.runIdent())
    tl.play()
  }

  /* ---------- phase 2 · studio ident ---------- */
  private runIdent() {
    this.mark('ident')
    if (this.skipping) return
    this.phase = 'ident'
    this.overlay.state('Half-Light Video')

    this.targetPos.set(0, 0.22, 6.4)
    this.targetLook.set(0, 0.15, 0)
    this.targetFov = 30

    const card = this.overlay.card({
      kicker: BRAND.cat,
      title: 'Half-Light <em>Video</em>',
      sub: BRAND.strap,
      foot: `${BRAND.city} &nbsp;·&nbsp; ${BRAND.disc} &nbsp;·&nbsp; ${BRAND.featureCat}`,
    })
    this.audio.impact(0.8)
    this.audio.sting()
    this.audio.crackle(14, 1.4)
    this.audio.startPad(82.4, 0.035)

    const tl = this.tl
    tl.stop()
    tl.tweenAt(0, { from: 6.4, to: 5.15, dur: 3.6, ease: ease.inOutSine, on: (val) => { this.targetPos.set(0, 0.22, val) } })
    tl.tweenAt(0, { from: 30, to: 28, dur: 3.6, ease: ease.inOutSine, on: (val) => { this.targetFov = val } })
    tl.at(3.62, async () => { await card.hide(0.6) })
    tl.at(4.25, () => this.runLeader())
    tl.play()
  }

  /* ---------- phase 3 · leader ---------- */
  private runLeader() {
    this.mark('leader')
    if (this.skipping) return
    this.phase = 'leader'
    this.overlay.state('Coming attractions')
    this.audio.stopPad(0.8)

    const tl = this.tl
    tl.stop()
    for (let n = 3; n >= 1; n--) {
      tl.at((3 - n) * 0.52, () => {
        this.audio.leaderBeep()
        const el = document.createElement('div')
        el.className = 'leader'
        el.innerHTML = `<div class="leader__cross"></div><div class="leader__num">${n}</div>`
        this.overlay.cardsEl.appendChild(el)
        el.style.opacity = '1'
        setTimeout(() => {
          el.style.transition = 'opacity .12s'
          el.style.opacity = '0'
          setTimeout(() => el.remove(), 160)
        }, 420)
      })
    }
    tl.at(1.62, () => { this.audio.crackle(8, 0.4); this.runTrailer(0) })
    tl.play()
  }

  /* ---------- phase 4 · coming attractions ---------- */
  private runTrailer(i: number) {
    this.mark('trailer' + i)
    if (this.skipping) return
    this.trailerIdx = i
    const spec = TRAILERS[i]
    this.phase = 'trailer'
    this.overlay.state(spec.title)
    this.overlay.say(`${spec.kicker}: ${spec.title}`)

    // swap the set
    if (i === 0) this.loadSet(buildBenchSet())
    else if (i === 1) this.loadSet(buildAuditoriumSet())
    else this.loadSet(buildPressSet())

    this.audio.whoosh(0.6, -0.7, 0.7)
    this.audio.startPad([73.4, 87.3, 98][i], 0.03)
    this.post.u.uDamage.value = 0.3
    this.post.u.uWarm.value = i === 0 ? 0.55 : i === 1 ? 0.4 : 0.62

    const shots = TRAILER_SHOTS[i]
    this.shotIdx = 0
    this.shotT = 0
    this.applyShot(shots[0], 0)

    const tl = this.tl
    tl.stop()
    // cuts — all cues at absolute times so the script cannot drift
    let t = 0
    for (let s = 0; s < shots.length; s++) {
      const shot = shots[s]
      tl.at(t, () => {
        if (s > 0) { this.audio.whoosh(0.32, (s % 2 ? 0.6 : -0.6), 0); this.audio.shutter() }
        this.shotIdx = s
        this.shotT = 0
      })
      tl.tweenAt(t, {
        from: 0, to: 1, dur: shot.dur, ease: shot.ease ?? ease.inOutSine,
        on: (p) => { this.shotT = p; this.applyShot(shot, p) },
      })
      t += shot.dur
    }

    // title card
    tl.at(t, () => {
      this.audio.impact(0.9)
      this.audio.sting()
      this.audio.crackle(10, 0.6)
      this.post.u.uFlash.value = 0.7
    })
    tl.tweenAt(t + 0.04, { from: 0.7, to: 0, dur: 0.42, ease: ease.outQuad, on: (val) => { this.post.u.uFlash.value = val } })
    tl.at(t + 0.02, () => {
      this.overlay.card({
        kicker: spec.kicker,
        title: spec.title,
        sub: spec.sub,
        log: spec.log,
        foot: `${BRAND.name} &nbsp;·&nbsp; ${BRAND.city}`,
      })
    })
    tl.at(t + 1.75, () => {
      const cards = this.overlay.cardsEl.querySelectorAll('.card')
      cards.forEach((c) => {
        const el = c as HTMLElement
        el.style.transition = 'opacity .45s ease'
        el.style.opacity = '0'
        setTimeout(() => el.remove(), 480)
      })
    })
    tl.at(t + 2.25, () => {
      if (i + 1 < TRAILERS.length) this.runTrailer(i + 1)
      else this.runTitle()
    })
    tl.play()
  }

  private applyShot(shot: Shot, p: number) {
    const e = (shot.ease ?? ease.inOutSine)(clamp(p))
    this.targetPos.set(
      lerp(shot.a.p[0], shot.b.p[0], e),
      lerp(shot.a.p[1], shot.b.p[1], e),
      lerp(shot.a.p[2], shot.b.p[2], e),
    )
    this.targetLook.set(
      lerp(shot.a.l[0], shot.b.l[0], e),
      lerp(shot.a.l[1], shot.b.l[1], e),
      lerp(shot.a.l[2], shot.b.l[2], e),
    )
    this.targetFov = lerp(shot.a.fov ?? 36, shot.b.fov ?? 36, e)
  }

  /* ---------- phase 5 · feature presentation ---------- */
  private runTitle() {
    this.mark('title')
    if (this.skipping) return
    this.phase = 'title'
    this.overlay.state('Feature presentation')
    this.loadSet(buildDiscSet())
    this.audio.stopPad(0.7)
    this.audio.impact(0.7)
    this.post.u.uWarm.value = 0.5
    this.post.u.uDamage.value = 0.18

    this.targetPos.set(0, 0.22, 5.6)
    this.targetLook.set(0, 0.15, 0)
    this.targetFov = 28

    const card = this.overlay.card({
      kicker: 'Feature presentation',
      title: 'Night <em>Shift</em>',
      sub: `${BRAND.featureDir} &nbsp;·&nbsp; ${BRAND.featureYear} &nbsp;·&nbsp; ${BRAND.featureRun}`,
      log: 'A parking attendant works the last shift of the year. At 02:17 the structure empties, and one car never leaves.',
      foot: `${BRAND.featureAspect} &nbsp;·&nbsp; ${BRAND.disc} &nbsp;·&nbsp; ${BRAND.featureCat}`,
    })
    this.audio.sting()
    this.audio.crackle(16, 1.6)
    this.audio.startPad(65.4, 0.04)

    const tl = this.tl
    tl.stop()
    tl.tweenAt(0, { from: 5.6, to: 4.35, dur: 3.2, ease: ease.inOutSine, on: (val) => { this.targetPos.set(0, 0.22, val) } })
    tl.at(3.25, async () => { await card.hide(0.7) })
    tl.at(3.95, () => { markIntroSeen(); this.toMenu() })
    tl.play()
  }

  /* ---------- phase 6 · main menu ---------- */
  toMenu() {
    this.mark('toMenu')
    this.phase = 'menu'
    this.tl.stop()
    this.overlay.flash(false)
    this.overlay.cardsEl.innerHTML = ''
    this.overlay.clearTracks()
    this.overlay.hideEnd()
    this.overlay.state('Main menu')
    this.overlay.say('Main menu. Use arrow keys to navigate.')
    this.overlay.hint(true)

    this.loadSet(buildAuditoriumSet())
    this.post.u.uWarm.value = 0.42
    this.post.u.uDamage.value = 0.14
    this.post.u.uBloom.value = 0.58
    this.audio.stopPad(0.8)
    this.audio.startPad(55, 0.028)
    this.audio.startProjector(0.06)

    // menu items — a vertical list on the left third, tracked in 3D
    const positions = MENU.map((_, i) => new THREE.Vector3(-1.58, 1.86 - i * 0.265, 1.42))
    this.menuRecs = buildMenu(this.overlay, positions, 0.26)
    this.menuRecs.forEach((rec, i) => {
      rec.item.addEventListener('pointerenter', () => {
        if (this.menuActive === i) return
        this.menuActive = i
        this.audio.tick(-0.2)
        setMenuHot(this.menuRecs, i)
      })
      rec.item.addEventListener('click', () => { this.menuActive = i; this.activateMenu() })
    })
    setMenuHot(this.menuRecs, this.menuActive)

    this.targetPos.set(0, 1.62, 5.25)
    this.targetLook.set(0, 2.0, -8.0)
    this.targetFov = 40
    this.camPos.copy(this.targetPos)
    this.camLook.copy(this.targetLook)
    this.camFov = this.targetFov
    this.overlay.hint(true)
    setTimeout(() => this.overlay.hint(false), 6000)
  }

  private moveMenu(d: number) {
    this.menuActive = (this.menuActive + d + MENU.length) % MENU.length
    setMenuHot(this.menuRecs, this.menuActive)
    this.audio.tick(d > 0 ? 0.18 : -0.18)
    this.overlay.say(MENU[this.menuActive].label)
  }

  private activateMenu() {
    const item = MENU[this.menuActive]
    this.audio.select()
    switch (item.id) {
      case 'play':
        this.overlay.clearTracks()
        this.menuRecs = []
        this.startFeature()
        break
      case 'scenes':
        this.overlay.openPanel('scenes')
        break
      case 'behind':
        this.overlay.openPanel('behind')
        break
      case 'special':
        this.overlay.openPanel('special')
        break
      case 'catalogue':
        this.overlay.openPanel('catalogue')
        break
      case 'settings':
        this.overlay.openPanel('settings')
        break
    }
  }

  /* ---------- phase 7 · the feature ---------- */
  startFeature() {
    this.mark('feature')
    this.phase = 'feature'
    this.overlay.state('Playing feature')
    this.overlay.say('Playing the feature. Scroll to travel.')
    this.input.scroll = 0
    this.input.scrollTarget = 0
    this.featureStart = this.time

    // the archive: the corridor of five bays
    const set = buildArchiveSet()
    this.loadSet(set)
    this.post.u.uWarm.value = 0.4
    this.post.u.uDamage.value = 0.2
    this.audio.stopPad(0.5)
    this.audio.startPad(49, 0.032)

    // white-out into the feature, then recover
    this.post.u.uFlash.value = 1
    this.audio.impact(0.85)
    this.audio.whoosh(0.9, 0, 0)
    const tl = this.tl
    tl.stop()
    tl.tweenAt(0.12, { from: 1, to: 0, dur: 1.05, ease: ease.outCubic, on: (val) => { this.post.u.uFlash.value = val } })
    tl.play()

    // chapter captions, tracked at each bay
    this.overlay.clearTracks()
    this.bayTracks = []
    BAYS.forEach((b, i) => {
      const worldY = 2.28
      const worldZ = 2.5 - b.t * (42 - 6)
      const side = i % 2 === 0 ? -1.55 : 1.55
      const rec = this.overlay.addTrack(
        `<div class="bay-cap">
          <div class="bay-cap__k">${b.kicker}</div>
          <div class="bay-cap__n">${b.n}</div>
          <div class="bay-cap__t">${b.title}</div>
          <div class="bay-cap__l">${b.line}</div>
          <div class="bay-cap__b">${b.body}</div>
        </div>`,
        v(side, worldY, worldZ + 1.1),
        0.42,
        'bay'
      )
      rec.opacity = 0
      this.bayTracks.push(rec)
    })

    // style for bay captions (injected once)
    if (!document.getElementById('bay-style')) {
      const s = document.createElement('style')
      s.id = 'bay-style'
      s.textContent = `
        .bay-cap{ width:min(330px,44vw); }
        .bay-cap__k{font-family:var(--f-mono);font-size:10px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold-2);}
        .bay-cap__n{font-family:var(--f-mono);font-size:11px;letter-spacing:.3em;color:rgba(237,231,218,.32);margin-top:10px;}
        .bay-cap__t{font-family:var(--f-display);font-weight:500;font-size:clamp(28px,3.4vw,46px);line-height:.98;letter-spacing:-.026em;margin:8px 0 14px;}
        .bay-cap__l{font-family:var(--f-display);font-style:italic;font-size:clamp(14px,1.4vw,18px);line-height:1.5;color:rgba(237,231,218,.72);text-wrap:balance;}
        .bay-cap__b{margin-top:14px;font-family:var(--f-ui);font-size:clamp(12px,1.15vw,14px);line-height:1.7;color:rgba(237,231,218,.44);text-wrap:pretty;}
      `
      document.head.appendChild(s)
    }
  }

  private updateFeature(dt: number) {
    const u = clamp(this.input.scroll)
    // ease the travel
    const t = u
    const p = this.featureCurve.getPointAt(t)
    const l = this.lookCurve.getPointAt(t)

    // parallax
    const par = 0.22
    this.targetPos.set(
      p.x + this.input.sx * par,
      p.y + this.input.sy * par * 0.5,
      p.z,
    )
    this.targetLook.copy(l)
    this.targetFov = 36 + Math.sin(t * Math.PI) * 3

    // which bay are we at
    let nearest = 0
    let best = 99
    BAYS.forEach((b, i) => {
      const d = Math.abs(b.t - t)
      if (d < best) { best = d; nearest = i }
    })
    const key = `Chapter ${BAYS[nearest].n}`
    if (this._lastChapter !== key) {
      this._lastChapter = key
      this.overlay.state(`${BAYS[nearest].n} · ${BAYS[nearest].title}`)
      this.overlay.say(`${BAYS[nearest].title}. ${BAYS[nearest].line}`)
      this.audio.tick(0)
      this.audio.setPadRoot([49, 55, 58.27, 65.41, 73.42][nearest])
    }

    // fade bay captions by proximity — they bloom as you arrive and dissolve as you leave
    const zNow = p.z
    for (const rec of this.bayTracks) {
      const d = Math.abs(rec.pos.z - zNow)
      const near = 1 - clamp((d - 1.4) / 4.2)
      rec.opacity = smooth(near)
    }

    // end of the corridor
    if (t > 0.985) {
      this.toEnd()
    }
    void dt
  }
  private _lastChapter = ''

  /* ---------- phase 8 · end ---------- */
  private toEnd() {
    this.mark('end')
    if (this.phase === 'end') return
    this.phase = 'end'
    this.tl.stop()
    this.audio.impact(0.7)
    this.audio.stopPad(1.4)
    this.audio.stopProjector(0.8)
    this.overlay.clearTracks()
    this.overlay.state('End of feature')
    this.overlay.say('End of feature.')
    this.post.u.uFlash.value = 0.55
    const tl = this.tl
    tl.stop()
    tl.tweenAt(0, { from: 0.55, to: 0, dur: 1.0, ease: ease.outQuad, on: (val) => { this.post.u.uFlash.value = val } })
    tl.at(0.45, () => this.overlay.showEnd())
    tl.play()
    this.wireEnd()
  }

  private wireEnd() {
    const menu = document.getElementById('endMenu')
    const scenes = document.getElementById('endScenes')
    menu?.addEventListener('click', () => { this.audio.select(); this.overlay.hideEnd(); this.toMenu() }, { once: true })
    scenes?.addEventListener('click', () => { this.audio.select(); this.overlay.hideEnd(); this.toMenu(); setTimeout(() => this.overlay.openPanel('scenes'), 350) }, { once: true })
  }

  /* ---------------- set management ---------------- */

  private loadSet(s: SetRefs) {
    if (this.set) {
      this.scene.remove(this.set.root)
      this.disposeSet(this.set)
    }
    this.set = s
    this.scene.add(s.root)
    this.scene.fog = new THREE.FogExp2(s.fogColor.getHex(), s.fogDensity)
    this.scene.background = new THREE.Color(0x04050a)
    this.post.u.uWarm.value = s.grade.warm
    this.post.u.uLift.value = s.grade.lift
    this.post.u.uExposure.value = s.grade.exposure
    this.post.u.uBloom.value = s.grade.bloom
    this.post.u.uVignette.value = s.grade.vignette
  }

  private disposeSet(s: SetRefs) {
    s.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    const pts = s.root as unknown as { isPoints?: boolean }
    void pts
  }

  /* ---------------- frame ---------------- */

  update(dt: number) {
    this.tlTick++
    this.time += dt
    const t = this.time
    this.input.update(dt)
    this.tl.update(dt)

    // set animation
    if (this.set) {
      for (const a of this.set.anim) a(t, dt)
      for (const b of this.set.beams) animateBeam(b, t, this.phase === 'menu' ? 1 : 0.6)
      for (const d of this.set.dust) animateDust(d, t, this.prefs.motion === 'Reduced' ? 0.3 : 1)
    }

    // ---- phase behaviour ----
    if (this.phase === 'menu') this.updateMenu(dt)
    if (this.phase === 'feature') this.updateFeature(dt)

    // ---- camera: drift + parallax + damping ----
    const drift = this.prefs.motion === 'Reduced' ? 0.15 : 1
    const idleX = fbm1(t * 0.07, 3, 1) * 0.06 * drift
    const idleY = fbm1(t * 0.055, 3, 7) * 0.04 * drift
    const parX = this.input.sx2 * 0.16 * drift
    const parY = this.input.sy2 * 0.09 * drift

    const lambda = this.phase === 'feature' ? 9 : this.phase === 'menu' ? 4.2 : 3.2
    this.camPos.x = damp(this.camPos.x, this.targetPos.x + idleX + parX, lambda, dt)
    this.camPos.y = damp(this.camPos.y, this.targetPos.y + idleY + parY, lambda, dt)
    this.camPos.z = damp(this.camPos.z, this.targetPos.z, lambda, dt)
    this.camLook.x = damp(this.camLook.x, this.targetLook.x + idleX * 0.3, lambda * 0.8, dt)
    this.camLook.y = damp(this.camLook.y, this.targetLook.y + idleY * 0.3, lambda * 0.8, dt)
    this.camLook.z = damp(this.camLook.z, this.targetLook.z, lambda * 0.8, dt)
    this.camFov = damp(this.camFov, this.targetFov, 4, dt)

    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camLook)
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
      this.camera.fov = this.camFov
      this.camera.updateProjectionMatrix()
    }

    // letterbox
    const wantBars =
      this.prefs.letterbox === 'Always' ? 1 :
      this.prefs.letterbox === 'Never' ? 0 :
      (this.phase === 'boot' || this.phase === 'ident' || this.phase === 'leader' ||
       this.phase === 'trailer' || this.phase === 'title' || this.phase === 'feature') ? 1 : 0.28
    this.post.u.uLetterbox.value = damp(this.post.u.uLetterbox.value, wantBars * 0.085, 4, dt)

    // gate weave only when grain is on
    this.post.u.uWeave.value = damp(this.post.u.uWeave.value, this.prefs.grain === 'On' ? 1 : 0.2, 3, dt)

    this.gov.tick(dt)

    // ---- render ----
    this.post.render(this.scene, this.camera, this.renderer, t, this.gov.quality.bloomPasses)

    // ---- DOM tracks ----
    this.overlay.updateTracks(this.camera)
    if (this.menuRecs.length) tickMenu(this.menuRecs, dt)

    this.input.endFrame()
  }

  private updateMenu(dt: number) {
    // the menu arc breathes with the hover state — the selected plate
    // pushes toward the camera and its plate light swells
    for (const rec of this.menuRecs) {
      rec.pos.x = -1.58 + rec.hover * 0.11
      rec.pos.y = 1.86 - rec.index * 0.265 + rec.hover * 0.010
      rec.pos.z = 1.42 + rec.hover * 0.26
      rec.opacity = 0.84 + rec.hover * 0.16
    }
    void dt
  }
}