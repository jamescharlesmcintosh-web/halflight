/* ============================================================
   timeline — a tiny cinematic sequencer + the motion maths
   ============================================================ */

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const inv = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))
export const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x) }
export const smoother = (t: number) => { const x = clamp(t); return x * x * x * (x * (x * 6 - 15) + 10) }
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, inv(a, b, v))

/** frame-rate independent damping (Freya Holmér form) */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt))

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => --t * t * t + 1,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
}

export type EaseFn = (t: number) => number

interface TweenSpec {
  dur: number
  from: number
  to: number
  ease?: EaseFn
  on: (v: number, t: number) => void
  delay?: number
}

type Cb = () => void

/**
 * A sequential cue list. Play it, stop it, or await it.
 * `now` is driven by the caller so the sequencer follows the render clock,
 * not `setTimeout` drift.
 */
export class Timeline {
  private items: Array<{ at: number; run: (t: number) => boolean }> = []
  private t = 0
  private cursor = 0
  private playing = false
  private done = false
  private resolveDone: null | (() => void) = null
  /** bumped whenever the script is torn down — guards cue re-entrancy */
  private gen = 0
  /** total scripted duration (for the chrome readout) */
  length = 0

  private push(at: number, run: (t: number) => boolean) {
    this.items.push({ at, run })
    this.items.sort((a, b) => a.at - b.at)
    this.length = Math.max(this.length, at)
    return this
  }

  /** absolute-time cue */
  at(time: number, cb: Cb) {
    let fired = false
    return this.push(time, () => {
      if (!fired) { fired = true; cb() }
      return true
    })
  }

  /** absolute-time tween — does not touch the append cursor */
  tweenAt(time: number, spec: Omit<TweenSpec, 'delay'>) {
    const e = spec.ease ?? ease.inOutCubic
    let last = -1
    return this.push(time + spec.dur, (t) => {
      const p = clamp((t - time) / Math.max(spec.dur, 1e-4))
      if (p !== last) { last = p; spec.on(lerp(spec.from, spec.to, e(p)), p) }
      return p >= 1
    })
  }

  /** relative wait, appended to the current end of the script */
  wait(dur: number) {
    return this.push(this.length + dur, () => true)
  }

  /** tween appended to the current end of the script */
  tween(spec: TweenSpec) {
    const start = this.length + (spec.delay ?? 0)
    const e = spec.ease ?? ease.inOutCubic
    let last = -1
    const r = this.push(start + spec.dur, (t) => {
      const p = clamp((t - start) / Math.max(spec.dur, 1e-4))
      if (p !== last) { last = p; spec.on(lerp(spec.from, spec.to, e(p)), p) }
      return p >= 1
    })
    this.length = Math.max(this.length, start + spec.dur)
    return r
  }

  /** a repeating tick until stopped — returns a stop handle */
  every(interval: number, cb: (i: number, t: number) => void) {
    let i = 0
    let next = 0
    let live = true
    this.push(Infinity, (t) => {
      if (!live) return true
      if (t >= next) { cb(i++, t); next = t + interval }
      return false
    })
    return { stop: () => { live = false } }
  }

  play() {
    this.playing = true
    this.done = false
    return new Promise<void>((res) => {
      if (this.done) return res()
      this.resolveDone = res
    })
  }

  stop() {
    this.gen++
    this.playing = false
    this.done = true
    if (this.resolveDone) { this.resolveDone(); this.resolveDone = null }
    this.items.length = 0
    this.length = 0
    this.t = 0
    this.cursor = 0
  }

  /** skip to the end of the script — fires every remaining cue */
  finish() {
    const g = this.gen
    const end = this.length
    this.t = end
    for (const it of this.items) {
      it.run(end)
      if (g !== this.gen) return // a cue restarted the script
    }
    this.cursor = this.items.length
    this.playing = false
    this.done = true
    if (this.resolveDone) { this.resolveDone(); this.resolveDone = null }
  }

  get time() { return this.t }
  get isPlaying() { return this.playing }

  /** drive from the render loop */
  update(dt: number) {
    if (!this.playing) return
    const g = this.gen
    this.t += dt
    while (this.cursor < this.items.length) {
      const it = this.items[this.cursor]
      if (this.t < it.at && it.at !== Infinity) break
      const finished = it.run(this.t)
      if (g !== this.gen) return // a cue restarted the script — bail cleanly
      if (it.at === Infinity) { if (finished) this.cursor++; break }
      if (finished) this.cursor++
      else break
    }
    if (this.cursor >= this.items.length) {
      this.playing = false
      this.done = true
      if (this.resolveDone) { this.resolveDone(); this.resolveDone = null }
    }
  }
}

/** Critically-damped spring — for camera and parallax that should feel physical. */
export class Spring {
  value: number
  target: number
  velocity = 0
  constructor(value = 0, public stiffness = 120, public damping = 22) {
    this.value = value
    this.target = value
  }
  update(dt: number) {
    const d = clamp(dt, 0, 1 / 20)
    const f = (this.target - this.value) * this.stiffness
    this.velocity += (f - this.velocity * this.damping) * d
    this.value += this.velocity * d
    return this.value
  }
}

/** 1D value noise — used for idle camera drift */
const HASH = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453123
  return s - Math.floor(s)
}
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return lerp(HASH(i + seed), HASH(i + 1 + seed), u) * 2 - 1
}
export function fbm1(x: number, octaves = 3, seed = 0) {
  let a = 0.5, f = 1, s = 0
  for (let i = 0; i < octaves; i++) { s += a * noise1(x * f, seed + i * 31); a *= 0.5; f *= 2.02 }
  return s
}
