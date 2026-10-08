/* ============================================================
   textures — every surface in this film is drawn, not sourced.
   ============================================================ */

import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

export function cv(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

/* ---------- hash + value noise ---------- */
const fract = (x: number) => x - Math.floor(x)
function hash2(x: number, y: number, seed: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123)
}
function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
export function fbm(x: number, y: number, oct = 5, seed = 0) {
  let s = 0, a = 0.5, f = 1
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); a *= 0.5; f *= 2.03 }
  return s
}

function px(img: ImageData, i: number, r: number, g: number, b: number, a = 255) {
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a
}

/* ---------- 1. dust sprite (soft additive mote) ---------- */
export function dustSprite() {
  return memo('dust', () => {
    const S = 64
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.16, 'rgba(255,255,255,0.62)')
    g.addColorStop(0.42, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return tex(c, false, false)
  })
}

/* ---------- 2. soft glow disc (for light pools / halos) ---------- */
export function glowSprite(inner = 0.0, mid = 0.22) {
  return memo(`glow:${inner}:${mid}`, () => {
    const S = 256
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(inner, 'rgba(255,255,255,1)')
    g.addColorStop(mid, 'rgba(255,255,255,0.30)')
    g.addColorStop(0.62, 'rgba(255,255,255,0.07)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
    return tex(c, false, false)
  })
}

/* ---------- 3. film emulsion — grain, dirt, hairline scratches ---------- */
export function emulsion(seed = 1, intensity = 1) {
  return memo(`emulsion:${seed}:${intensity}`, () => {
    const S = 512
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(S, S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 42, y / 42, 5, seed) * 0.62 + fbm(x / 7, y / 7, 3, seed + 5) * 0.38
        const g = Math.floor(128 + (n - 0.5) * 190 * intensity)
        px(img, (y * S + x) * 4, g, g, g, 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    // dirt specks
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 120 * intensity; i++) {
      const r = Math.random() * 2.6 + 0.4
      ctx.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.32})`
      ctx.beginPath()
      ctx.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // hairline scratches
    ctx.globalCompositeOperation = 'overlay'
    for (let i = 0; i < 16 * intensity; i++) {
      const x = Math.random() * S
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.16})`
      ctx.lineWidth = Math.random() * 1.4 + 0.3
      ctx.beginPath()
      ctx.moveTo(x, -10)
      ctx.bezierCurveTo(x + (Math.random() - 0.5) * 26, S * 0.33, x + (Math.random() - 0.5) * 26, S * 0.66, x + (Math.random() - 0.5) * 18, S + 10)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    return tex(c)
  })
}

/* ---------- 4. 16mm film strip (sprockets, frame lines, gate) ---------- */
export function filmStrip() {
  return memo('filmstrip', () => {
    const W = 512, H = 256
    const c = cv(W, H)
    const ctx = c.getContext('2d')!
    // base — dark emulsion
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#100c08'); g.addColorStop(0.5, '#241a10'); g.addColorStop(1, '#0d0a07')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    // sprocket rails (top + bottom)
    const rail = (y: number) => {
      ctx.fillStyle = '#070604'
      ctx.fillRect(0, y, W, 34)
      const holeW = 22, gap = 30
      for (let x = -20; x < W; x += holeW + gap) {
        ctx.fillStyle = '#2b2118'
        roundRect(ctx, x, y + 8, holeW, 18, 4); ctx.fill()
        ctx.fillStyle = 'rgba(255,225,180,0.07)'
        roundRect(ctx, x, y + 8, holeW, 3, 2); ctx.fill()
      }
    }
    rail(0); rail(H - 34)

    // frame line + image area
    ctx.fillStyle = '#151009'
    ctx.fillRect(0, 38, W, H - 76)
    // fake image content — abstract night street
    const gg = ctx.createLinearGradient(0, 38, 0, H - 38)
    gg.addColorStop(0, '#1b2230'); gg.addColorStop(0.55, '#2c2016'); gg.addColorStop(1, '#120d0a')
    ctx.fillStyle = gg; ctx.fillRect(6, 42, W - 12, H - 84)
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * W
      const w = 4 + Math.random() * 26
      const h = 20 + Math.random() * 90
      ctx.fillStyle = `rgba(${180 + Math.random() * 60},${120 + Math.random() * 70},${40 + Math.random() * 40},${0.06 + Math.random() * 0.16})`
      ctx.fillRect(x, 44 + Math.random() * 40, w, h)
    }
    // key light streak
    const kg = ctx.createLinearGradient(0, 40, W, H - 40)
    kg.addColorStop(0, 'rgba(255,190,110,0)')
    kg.addColorStop(0.42, 'rgba(255,190,110,0.13)')
    kg.addColorStop(0.55, 'rgba(255,190,110,0.02)')
    kg.addColorStop(1, 'rgba(255,190,110,0)')
    ctx.fillStyle = kg; ctx.fillRect(6, 42, W - 12, H - 84)

    // frame separators
    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    for (let x = 0; x < W; x += 170) ctx.fillRect(x, 38, 4, H - 76)

    return tex(c)
  })
}

/* ---------- 5. brushed / milled metal ---------- */
export function brushedMetal(seed = 3, warm = false) {
  return memo(`metal:${seed}:${warm}`, () => {
    const S = 512
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = warm ? '#2a2118' : '#22262e'
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * S
      const w = 40 + Math.random() * 420
      const a = 0.012 + Math.random() * 0.055
      ctx.strokeStyle = Math.random() > 0.5
        ? `rgba(${warm ? '255,214,160' : '220,232,255'},${a})`
        : `rgba(0,0,0,${a * 1.5})`
      ctx.lineWidth = 0.6 + Math.random() * 1.6
      ctx.beginPath()
      ctx.moveTo(Math.random() * S, y)
      ctx.lineTo(Math.random() * S + w, y + (Math.random() - 0.5) * 2)
      ctx.stroke()
    }
    const n = ctx.getImageData(0, 0, S, S)
    for (let i = 0; i < n.data.length; i += 4) {
      const j = (Math.random() - 0.5) * 12
      n.data[i] += j; n.data[i + 1] += j; n.data[i + 2] += j
    }
    ctx.putImageData(n, 0, 0)
    return tex(c)
  })
}

/* ---------- 6. concrete / plaster wall ---------- */
export function concrete(seed = 7) {
  return memo(`concrete:${seed}`, () => {
    const S = 512
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(S, S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 90, y / 90, 5, seed)
        const m = fbm(x / 18, y / 18, 4, seed + 9)
        const v = 28 + n * 52 + m * 22
        px(img, (y * S + x) * 4, v * 1.02, v * 1.0, v * 0.94)
      }
    }
    ctx.putImageData(img, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    for (let i = 0; i < 90; i++) {
      const r = 20 + Math.random() * 120
      ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.1})`
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    return tex(c)
  })
}

/* ---------- 7. wet asphalt / gloss floor ---------- */
export function asphalt(seed = 11) {
  return memo(`asphalt:${seed}`, () => {
    const S = 512
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(S, S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 26, y / 26, 5, seed)
        const g = fbm(x / 5, y / 5, 3, seed + 3)
        const v = 10 + n * 30 + g * 16
        px(img, (y * S + x) * 4, v * 0.92, v * 0.98, v * 1.12)
      }
    }
    ctx.putImageData(img, 0, 0)
    // puddle-ish bright patches
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 26; i++) {
      const r = 30 + Math.random() * 130
      const g = ctx.createRadialGradient(Math.random() * S, Math.random() * S, 0, Math.random() * S, Math.random() * S, r)
      g.addColorStop(0, 'rgba(120,150,190,0.10)')
      g.addColorStop(1, 'rgba(120,150,190,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
    }
    ctx.globalCompositeOperation = 'source-over'
    return tex(c)
  })
}

/* ---------- 8. velvet (auditorium seating) ---------- */
export function velvet(seed = 21, hue = [58, 16, 22]) {
  return memo(`velvet:${seed}:${hue.join('-')}`, () => {
    const S = 256
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(S, S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const nap = fbm(x / 2.2, y / 14, 3, seed)
        const body = fbm(x / 40, y / 40, 4, seed + 4)
        const k = 0.55 + nap * 0.32 + body * 0.3
        px(img, (y * S + x) * 4, hue[0] * k, hue[1] * k, hue[2] * k)
      }
    }
    ctx.putImageData(img, 0, 0)
    return tex(c)
  })
}

/* ---------- 9. foil-stamped sleeve ---------- */
export function foil() {
  return memo('foil', () => {
    const S = 512
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#161208'; ctx.fillRect(0, 0, S, S)
    // brush anisotropy
    for (let i = 0; i < 1600; i++) {
      const y = Math.random() * S
      ctx.strokeStyle = `rgba(232,196,110,${0.02 + Math.random() * 0.07})`
      ctx.lineWidth = 0.5 + Math.random() * 2
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (Math.random() - 0.5) * 6); ctx.stroke()
    }
    // stamped medallion
    const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.42)
    g.addColorStop(0, 'rgba(240,208,132,0.5)')
    g.addColorStop(0.6, 'rgba(180,140,58,0.16)')
    g.addColorStop(1, 'rgba(120,90,30,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
    // concentric stamp rings
    ctx.strokeStyle = 'rgba(245,214,140,0.34)'
    for (let r = 40; r < 220; r += 18) {
      ctx.lineWidth = r % 36 === 0 ? 1.6 : 0.7
      ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke()
    }
    return tex(c)
  })
}

/* ---------- 10. typographic plate — film can label ---------- */
export function labelPlate(lines: string[], opts: { bg?: string; fg?: string; accent?: string } = {}) {
  const key = 'label:' + lines.join('|') + JSON.stringify(opts)
  return memo(key, () => {
    const W = 1024, H = 512
    const c = cv(W, H)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = opts.bg ?? '#0e1219'; ctx.fillRect(0, 0, W, H)
    // paper-ish grain
    const img = ctx.getImageData(0, 0, W, H)
    for (let i = 0; i < img.data.length; i += 4) {
      const j = (Math.random() - 0.5) * 16
      img.data[i] += j; img.data[i + 1] += j; img.data[i + 2] += j
    }
    ctx.putImageData(img, 0, 0)

    const accent = opts.accent ?? '#C9A227'
    ctx.strokeStyle = accent; ctx.lineWidth = 3
    ctx.strokeRect(38, 38, W - 76, H - 76)
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5
    ctx.strokeRect(54, 54, W - 108, H - 108)
    ctx.globalAlpha = 1

    ctx.fillStyle = accent
    ctx.fillRect(38, 38, W - 76, 8)

    const fg = opts.fg ?? '#EDE7DA'
    ctx.textAlign = 'left'
    ctx.fillStyle = accent
    ctx.font = '500 26px "IBM Plex Mono", monospace'
    ctx.fillText(lines[0] ?? '', 86, 150)

    ctx.fillStyle = fg
    ctx.font = '500 82px "Bodoni Moda", Georgia, serif'
    ctx.fillText(lines[1] ?? '', 84, 250)

    ctx.fillStyle = 'rgba(237,231,218,0.62)'
    ctx.font = '500 28px "Archivo", Helvetica, sans-serif'
    for (let i = 2; i < lines.length; i++) {
      ctx.fillText(lines[i], 86, 318 + (i - 2) * 44)
    }
    return tex(c, false)
  })
}

/* ---------- 11. light-shaft / beam falloff mask ---------- */
export function beamMask() {
  return memo('beam', () => {
    const W = 256, H = 256
    const c = cv(W, H)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.34)')
    g.addColorStop(0.8, 'rgba(255,255,255,0.05)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    return tex(c, false, false)
  })
}

/* ---------- 12. noise tile for shaders (R8-ish, tileable-ish) ---------- */
export function noiseTile(size = 256) {
  return memo(`noiseTile:${size}`, () => {
    const c = cv(size, size)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255)
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return tex(c)
  })
}

/* ---------- 13. gradient ramp (for env light + fog cards) ---------- */
export function ramp(stops: Array<[number, string]>, w = 256, h = 4) {
  const key = 'ramp:' + stops.map((s) => s.join(':')).join(',') + w + 'x' + h
  return memo(key, () => {
    const c = cv(w, h)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, w, 0)
    for (const [p, col] of stops) g.addColorStop(p, col)
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    return tex(c, false)
  })
}

/* ---------- 14. screen content — an abstract looping "film frame" ---------- */
export function screenFrame(seed = 42) {
  return memo(`screen:${seed}`, () => {
    const W = 1024, H = 576
    const c = cv(W, H)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#12202e'); g.addColorStop(0.5, '#2a1d16'); g.addColorStop(1, '#0b1018')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    // sodium streetlights receding
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 108 + (hash2(i, 3, seed) - 0.5) * 40
      const y = 150 + i * 26
      const r = 26 + i * 6
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
      rg.addColorStop(0, `rgba(255,186,96,${0.5 - i * 0.04})`)
      rg.addColorStop(0.3, `rgba(255,160,70,${0.14 - i * 0.012})`)
      rg.addColorStop(1, 'rgba(255,150,60,0)')
      ctx.fillStyle = rg; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8)
    }
    // wet ground reflection band
    const wg = ctx.createLinearGradient(0, H * 0.58, 0, H)
    wg.addColorStop(0, 'rgba(255,170,90,0)')
    wg.addColorStop(0.5, 'rgba(255,170,90,0.12)')
    wg.addColorStop(1, 'rgba(255,170,90,0.02)')
    ctx.fillStyle = wg; ctx.fillRect(0, H * 0.58, W, H * 0.42)
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.86)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    return tex(c, false)
  })
}

/* ---------- 15. disc surface — concentric grooves + radial anisotropy ---------- */
export function discSurface(seed = 5) {
  return memo(`disc:${seed}`, () => {
    const S = 1024
    const c = cv(S, S)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(S, S)
    const half = S / 2
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - half, dy = y - half
        const r = Math.sqrt(dx * dx + dy * dy) / half          // 0..1
        const a = Math.atan2(dy, dx)
        // concentric grooves — the pit/land structure
        const groove = Math.sin(r * 210.0) * 0.5 + 0.5
        // radial anisotropy: fine streaks running along the radius
        const streak = vnoise(a * 34 + r * 3.0, r * 620, seed)
        // broad, slow banding so the light sweeps as it turns
        const band = vnoise(r * 5.5, a * 1.4, seed + 9)
        let v = 0.42 + groove * 0.13 + (streak - 0.5) * 0.30 + (band - 0.5) * 0.34
        // slight falloff at the very edge and at the hub
        v *= 0.78 + 0.34 * smoothstepT(0.06, 0.2, r) * smoothstepT(1.0, 0.88, r)
        v = clamp01(v)
        const g = Math.floor(v * 255)
        px(img, (y * S + x) * 4, g, g, g, 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    return tex(c)
  })
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
function smoothstepT(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/* ---------- helpers ---------- */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function memo<T>(key: string, make: () => T): T {
  const hit = cache.get(key) as unknown as T | undefined
  if (hit) return hit
  const v = make()
  cache.set(key, v as unknown as THREE.Texture)
  return v
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}
