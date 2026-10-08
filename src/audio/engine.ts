/* ============================================================
   audio — every sound in this film is synthesised on the spot.
   Servo, projector, clicks, beds, stings. No samples.
   ============================================================ */

export class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  private bus!: GainNode
  private verb!: ConvolverNode
  private verbSend!: GainNode
  private hum: { osc: OscillatorNode[]; gain: GainNode } | null = null
  private room: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private pad: { nodes: OscillatorNode[]; gain: GainNode; filt: BiquadFilterNode } | null = null
  private muted = false
  private _volume = 0.85
  ready = false

  async start(muted = false) {
    if (this.ready) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ latencyHint: 'interactive' })
    this.ctx = ctx
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch { /* ignore */ } }

    this.master = ctx.createGain()
    this.master.gain.value = muted ? 0 : this._volume

    // gentle glue compressor so hits never clip
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 22
    comp.ratio.value = 3.4
    comp.attack.value = 0.004
    comp.release.value = 0.18

    this.bus = ctx.createGain()
    this.bus.gain.value = 1

    this.verb = ctx.createConvolver()
    this.verb.buffer = this.makeIR(2.6, 2.4)
    this.verbSend = ctx.createGain()
    this.verbSend.gain.value = 0.24

    this.bus.connect(comp)
    this.bus.connect(this.verbSend)
    this.verbSend.connect(this.verb)
    this.verb.connect(comp)
    comp.connect(this.master)
    this.master.connect(ctx.destination)

    this.muted = muted
    this.ready = true
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0 }

  setMuted(m: boolean) {
    this.muted = m
    if (!this.ctx) return
    const g = m ? 0 : this._volume
    this.master.gain.cancelScheduledValues(this.t)
    this.master.gain.setTargetAtTime(g, this.t, 0.05)
  }
  get isMuted() { return this.muted }

  setVolume(v: number) {
    this._volume = v
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.t, 0.05)
  }

  send(node: AudioNode, amount = 0.3) {
    if (!this.ctx) return
    const g = this.ctx.createGain()
    g.gain.value = amount
    node.connect(g)
    g.connect(this.verbSend)
  }

  /* ---------------- buffers ---------------- */

  private makeIR(seconds: number, decay: number) {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        const t = i / len
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2)
      }
    }
    return buf
  }

  private noiseBuffer(seconds = 2, type: 'white' | 'pink' | 'brown' = 'white') {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(1, len, rate)
    const d = buf.getChannelData(0)
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    } else {
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    return buf
  }

  /* ---------------- primitives ---------------- */

  private tone(opts: {
    freq: number
    to?: number
    dur: number
    type?: OscillatorType
    gain?: number
    attack?: number
    release?: number
    pan?: number
    send?: number
    filt?: { type: BiquadFilterType; freq: number; q?: number; toFreq?: number }
    delay?: number
  }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const dur = opts.dur
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(opts.freq, t0)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur)

    const g = ctx.createGain()
    const peak = opts.gain ?? 0.2
    const at = opts.attack ?? 0.004
    const rel = opts.release ?? dur * 0.7
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + at)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + rel)

    let node: AudioNode = osc
    if (opts.filt) {
      const f = ctx.createBiquadFilter()
      f.type = opts.filt.type
      f.frequency.setValueAtTime(opts.filt.freq, t0)
      if (opts.filt.toFreq) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filt.toFreq), t0 + dur)
      f.Q.value = opts.filt.q ?? 1
      node.connect(f); node = f
    }

    let out: AudioNode = g
    if (opts.pan !== undefined) {
      const p = ctx.createStereoPanner()
      p.pan.value = opts.pan
      g.connect(p)
      out = p
    }

    node.connect(g)
    out.connect(this.bus)
    if (opts.send) this.send(out, opts.send)

    osc.start(t0)
    osc.stop(t0 + at + rel + 0.05)
  }

  private noise(opts: {
    dur: number
    gain?: number
    type?: 'white' | 'pink' | 'brown'
    filt?: { type: BiquadFilterType; freq: number; q?: number; toFreq?: number }
    attack?: number
    release?: number
    pan?: number
    send?: number
    delay?: number
    rate?: number
  }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const dur = opts.dur
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(Math.max(dur + 0.1, 0.4), opts.type ?? 'white')
    if (opts.rate) src.playbackRate.value = opts.rate
    src.loop = true

    const g = ctx.createGain()
    const peak = opts.gain ?? 0.12
    const at = opts.attack ?? 0.005
    const rel = opts.release ?? dur * 0.8
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + at)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + rel)

    let node: AudioNode = src
    if (opts.filt) {
      const f = ctx.createBiquadFilter()
      f.type = opts.filt.type
      f.frequency.setValueAtTime(opts.filt.freq, t0)
      if (opts.filt.toFreq) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filt.toFreq), t0 + dur)
      f.Q.value = opts.filt.q ?? 1
      node.connect(f); node = f
    }

    let out: AudioNode = g
    if (opts.pan !== undefined) {
      const p = ctx.createStereoPanner()
      p.pan.value = opts.pan
      g.connect(p); out = p
    }

    node.connect(g)
    out.connect(this.bus)
    if (opts.send) this.send(out, opts.send)

    src.start(t0)
    src.stop(t0 + at + rel + 0.06)
  }

  /* ---------------- the show ---------------- */

  /** disc tray servo — mechanical, slightly ratchety */
  servo(dur = 0.55) {
    this.noise({ dur, gain: 0.05, type: 'brown', filt: { type: 'bandpass', freq: 240, q: 3.2, toFreq: 420 }, attack: 0.03, release: dur * 0.6 })
    for (let i = 0; i < 9; i++) {
      this.tone({ freq: 62 + i * 3, to: 84, dur: 0.05, type: 'square', gain: 0.018, delay: i * (dur / 11), filt: { type: 'lowpass', freq: 480, q: 2 } })
    }
  }

  /** disc spin-up — the platter finds speed */
  spinUp(dur = 1.1) {
    this.noise({ dur, gain: 0.055, type: 'white', filt: { type: 'bandpass', freq: 320, q: 1.4, toFreq: 3400 }, attack: 0.18, release: dur * 0.5 })
    this.tone({ freq: 55, to: 140, dur, type: 'triangle', gain: 0.05, attack: 0.22, release: 0.4, filt: { type: 'lowpass', freq: 260 } })
    // the seek chatter
    for (let i = 0; i < 5; i++) {
      this.tone({ freq: 1200 + Math.random() * 900, dur: 0.02, type: 'square', gain: 0.012, delay: 0.25 + i * 0.08 })
    }
  }

  /** the laser pickup finds the disc */
  seek() {
    this.tone({ freq: 2400, to: 1200, dur: 0.07, type: 'square', gain: 0.03, filt: { type: 'bandpass', freq: 2200, q: 6 } })
    this.tone({ freq: 310, dur: 0.05, type: 'sine', gain: 0.05, delay: 0.08 })
    this.noise({ dur: 0.1, gain: 0.03, filt: { type: 'highpass', freq: 2600 }, delay: 0.06, release: 0.08 })
  }

  /** CRT power-on */
  crtOn() {
    this.tone({ freq: 60, to: 180, dur: 0.35, type: 'sine', gain: 0.14, attack: 0.002, release: 0.3, send: 0.2 })
    this.noise({ dur: 0.4, gain: 0.08, type: 'white', filt: { type: 'highpass', freq: 1800 }, attack: 0.001, release: 0.38, send: 0.3 })
    this.tone({ freq: 15600, to: 15200, dur: 1.6, type: 'sine', gain: 0.006, attack: 0.2, release: 1.2 })
  }

  /** film leader pop + beep */
  leaderBeep() {
    this.tone({ freq: 1000, dur: 0.033, type: 'square', gain: 0.09, attack: 0.001, release: 0.03, filt: { type: 'bandpass', freq: 1000, q: 3 } })
    this.noise({ dur: 0.02, gain: 0.05, filt: { type: 'highpass', freq: 3000 }, attack: 0.001, release: 0.02 })
  }

  /** menu cursor move */
  tick(pan = 0) {
    this.tone({ freq: 1650, to: 1280, dur: 0.035, type: 'triangle', gain: 0.05, pan, attack: 0.001, release: 0.03, filt: { type: 'bandpass', freq: 1800, q: 2 } })
    this.noise({ dur: 0.02, gain: 0.02, filt: { type: 'highpass', freq: 4000 }, pan, attack: 0.001, release: 0.02 })
  }

  /** menu selection */
  select() {
    this.tone({ freq: 784, dur: 0.14, type: 'sine', gain: 0.1, attack: 0.002, release: 0.12, send: 0.35 })
    this.tone({ freq: 1175, dur: 0.18, type: 'sine', gain: 0.07, delay: 0.03, attack: 0.002, release: 0.15, send: 0.35 })
    this.tone({ freq: 90, to: 55, dur: 0.3, type: 'sine', gain: 0.14, attack: 0.004, release: 0.26, send: 0.15 })
    this.noise({ dur: 0.12, gain: 0.03, type: 'pink', filt: { type: 'bandpass', freq: 2600, q: 1.2 }, attack: 0.001, release: 0.11 })
  }

  /** leaving a panel */
  back() {
    this.tone({ freq: 520, to: 330, dur: 0.16, type: 'triangle', gain: 0.07, attack: 0.003, release: 0.13, send: 0.3 })
  }

  /** trailer transition */
  whoosh(dur = 0.7, panFrom = -0.8, panTo = 0.8) {
    if (!this.ctx) return
    this.noise({ dur, gain: 0.07, type: 'white', filt: { type: 'bandpass', freq: 380, q: 0.8, toFreq: 2800 }, attack: dur * 0.35, release: dur * 0.5, pan: panFrom, send: 0.4 })
    this.noise({ dur, gain: 0.05, type: 'white', filt: { type: 'bandpass', freq: 2800, q: 0.9, toFreq: 420 }, attack: dur * 0.4, release: dur * 0.45, pan: panTo, send: 0.3 })
    this.tone({ freq: 90, to: 42, dur: dur * 0.7, type: 'sine', gain: 0.06, attack: 0.01, release: dur * 0.5, send: 0.2 })
  }

  /** low-frequency impact — the trailer hit */
  impact(strength = 1) {
    this.tone({ freq: 82, to: 28, dur: 1.3, type: 'sine', gain: 0.22 * strength, attack: 0.004, release: 1.1, send: 0.45 })
    this.tone({ freq: 164, to: 52, dur: 0.5, type: 'triangle', gain: 0.08 * strength, attack: 0.003, release: 0.4 })
    this.noise({ dur: 0.5, gain: 0.11 * strength, type: 'brown', filt: { type: 'lowpass', freq: 220, toFreq: 60 }, attack: 0.002, release: 0.45, send: 0.5 })
  }

  /** title card flash */
  sting() {
    this.tone({ freq: 392, dur: 0.5, type: 'sine', gain: 0.06, attack: 0.01, release: 0.45, send: 0.6 })
    this.tone({ freq: 587.33, dur: 0.6, type: 'sine', gain: 0.05, delay: 0.05, attack: 0.01, release: 0.5, send: 0.6 })
    this.tone({ freq: 98, to: 62, dur: 0.9, type: 'sine', gain: 0.08, attack: 0.005, release: 0.8, send: 0.3 })
  }

  /** stamping press */
  stamp() {
    this.noise({ dur: 0.18, gain: 0.12, type: 'brown', filt: { type: 'lowpass', freq: 700, toFreq: 120 }, attack: 0.001, release: 0.16, send: 0.25 })
    this.tone({ freq: 70, to: 40, dur: 0.28, type: 'sine', gain: 0.16, attack: 0.002, release: 0.24 })
  }

  /** projector shutter tick (one frame) */
  shutter() {
    this.noise({ dur: 0.03, gain: 0.02, filt: { type: 'bandpass', freq: 2600, q: 2 }, attack: 0.001, release: 0.025 })
    this.tone({ freq: 210, dur: 0.02, type: 'square', gain: 0.014, filt: { type: 'lowpass', freq: 900 } })
  }

  /* ---------------- continuous beds ---------------- */

  /** room tone — the space the viewer is sitting in */
  startRoom(level = 0.05) {
    if (!this.ctx || this.room) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(4, 'pink')
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.7
    const g = ctx.createGain(); g.gain.value = 0
    g.gain.setTargetAtTime(level, ctx.currentTime, 1.2)
    src.connect(f); f.connect(g); g.connect(this.bus)
    src.start()
    this.room = { src, gain: g }
  }

  /** the projector — motor hum + lamp + shutter flicker */
  startProjector(level = 0.07) {
    if (!this.ctx || this.hum) return
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(level, ctx.currentTime, 0.8)
    gain.connect(this.bus)

    const parts: OscillatorNode[] = []
    for (const [f, a, type] of [[24.5, 0.5, 'sine'], [49, 0.22, 'sine'], [98, 0.1, 'triangle'], [7.2, 0.3, 'sine']] as Array<[number, number, OscillatorType]>) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const og = ctx.createGain(); og.gain.value = a
      o.connect(og); og.connect(gain)
      o.start()
      parts.push(o)
    }

    // lamp hiss
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(3, 'white')
    src.loop = true
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.5
    const ng = ctx.createGain(); ng.gain.value = 0.06
    src.connect(nf); nf.connect(ng); ng.connect(gain)
    src.start()

    // slow shutter flicker on the gain
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'; lfo.frequency.value = 24
    const lg = ctx.createGain(); lg.gain.value = 0.012
    lfo.connect(lg); lg.connect(gain.gain)
    lfo.start()
    parts.push(lfo)

    this.hum = { osc: parts, gain }
  }

  stopProjector(fade = 0.6) {
    if (!this.ctx || !this.hum) return
    this.hum.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade * 0.35)
    const h = this.hum
    this.hum = null
    setTimeout(() => { try { h.osc.forEach((o) => o.stop()) } catch { /* ignore */ } }, fade * 1000 + 400)
  }

  /** a chord bed — the score. Cheap, warm, evolving. */
  startPad(root = 110, level = 0.05) {
    if (!this.ctx || this.pad) return
    const ctx = this.ctx
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 420
    filt.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.6)
    filt.connect(gain); gain.connect(this.bus)
    this.send(gain, 0.55)

    const ratios = [1, 1.5, 2, 2.5, 3]
    const nodes: OscillatorNode[] = []
    for (const r of ratios) {
      for (const det of [-5, 4]) {
        const o = ctx.createOscillator()
        o.type = r === 1 ? 'sawtooth' : 'triangle'
        o.frequency.value = root * r
        o.detune.value = det
        const og = ctx.createGain()
        og.gain.value = 0.14 / ratios.length
        o.connect(og); og.connect(filt)
        o.start()
        nodes.push(o)
      }
    }
    // slow filter breathing
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lg = ctx.createGain(); lg.gain.value = 180
    lfo.connect(lg); lg.connect(filt.frequency)
    lfo.start()
    nodes.push(lfo)

    this.pad = { nodes, gain, filt }
  }

  setPadRoot(root: number) {
    if (!this.pad) return
    // glide the partials — one at a time for a subtle smear
    const ratios = [1, 1.5, 2, 2.5, 3]
    let i = 0
    for (const n of this.pad.nodes) {
      if (n.type === 'sine' && n.frequency.value < 40) continue
      const r = ratios[i % ratios.length]
      n.frequency.setTargetAtTime(root * r, this.t, 1.4)
      i++
    }
  }

  stopPad(fade = 1.6) {
    if (!this.ctx || !this.pad) return
    this.pad.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade * 0.35)
    const p = this.pad
    this.pad = null
    setTimeout(() => { try { p.nodes.forEach((o) => o.stop()) } catch { /* ignore */ } }, fade * 1000 + 600)
  }

  /** tape hiss / static bed */
  startStatic(level = 0.03) {
    if (!this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(3, 'white')
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 0.4
    const g = ctx.createGain(); g.gain.value = level
    src.connect(f); f.connect(g); g.connect(this.bus)
    src.start()
    return { src, gain: g }
  }

  /** crackle — vinyl / splice dust */
  crackle(count = 10, spread = 0.8) {
    for (let i = 0; i < count; i++) {
      this.noise({
        dur: 0.012, gain: 0.02 + Math.random() * 0.03,
        filt: { type: 'highpass', freq: 1800 + Math.random() * 3000 },
        delay: Math.random() * spread, attack: 0.0008, release: 0.012,
        pan: (Math.random() - 0.5) * 1.4,
      })
    }
  }

  /** distant, room-lapped tag on a title card */
  voiceTag() {
    this.tone({ freq: 130, dur: 0.5, type: 'sawtooth', gain: 0.03, attack: 0.05, release: 0.4, filt: { type: 'bandpass', freq: 340, q: 2 }, send: 0.5 })
  }
}