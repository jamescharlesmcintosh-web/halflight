/* ============================================================
   device — capability detection + live quality governor
   ============================================================ */

export type Tier = 'ultra' | 'high' | 'medium' | 'low'

export interface Quality {
  tier: Tier
  /** render target scale relative to CSS pixels */
  pixelRatioCap: number
  /** particle budget for the atmospheric dust */
  dust: number
  /** extra volumetric cone pass */
  volumetrics: boolean
  /** bloom blur iterations (2 = wide halation) */
  bloomPasses: number
  /** animated film grain */
  grain: boolean
  /** depth-of-field style blur on the composite */
  softFocus: boolean
  /** shadows on key lights */
  shadows: boolean
  /** antialias on the base render */
  antialias: boolean
}

const PRESETS: Record<Tier, Quality> = {
  ultra:  { tier: 'ultra',  pixelRatioCap: 2.0,  dust: 2600, volumetrics: true,  bloomPasses: 2, grain: true,  softFocus: true,  shadows: true,  antialias: true },
  high:   { tier: 'high',   pixelRatioCap: 1.6,  dust: 1500, volumetrics: true,  bloomPasses: 2, grain: true,  softFocus: true,  shadows: true,  antialias: true },
  medium: { tier: 'medium', pixelRatioCap: 1.15, dust: 700,  volumetrics: false, bloomPasses: 1, grain: true,  softFocus: false, shadows: false, antialias: true },
  low:    { tier: 'low',    pixelRatioCap: 1.0,  dust: 280,  volumetrics: false, bloomPasses: 1, grain: false, softFocus: false, shadows: false, antialias: false },
}

const ORDER: Tier[] = ['low', 'medium', 'high', 'ultra']

export function detectTier(): Tier {
  if (typeof window === 'undefined') return 'high'
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
  const mem = nav.deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 8
  const save = nav.connection?.saveData === true
  const slowNet = /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')

  const ua = navigator.userAgent
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100)
  const isTablet = /iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth >= 1100)

  // crude GPU sniff — string match on the debug renderer info
  let gpu = ''
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
    if (gl) {
      const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
      if (dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
    }
  } catch { /* ignore */ }

  const weakGpu = /Mali-[4T]|Adreno [3-5]\d\d\b|Intel\(R\) HD Graphics [3-5]\d{3}|SwiftShader|llvmpipe|Software/i.test(gpu)

  if (save || slowNet) return 'low'
  if (weakGpu) return isMobile ? 'low' : 'medium'
  if (isMobile) return mem <= 3 || cores <= 4 ? 'medium' : 'high'
  if (isTablet) return 'high'
  if (mem <= 4 || cores <= 4) return 'medium'
  return 'ultra'
}

export function qualityFor(tier: Tier): Quality {
  return { ...PRESETS[tier] }
}

/** Rolling frame-time governor. Drops the tier when the page cannot hold frame budget. */
export class Governor {
  tier: Tier
  quality: Quality
  private samples: number[] = []
  private windows = 0
  private locked = false
  onChange: (q: Quality) => void = () => {}

  constructor(tier: Tier) {
    this.tier = tier
    this.quality = qualityFor(tier)
  }

  /** hard-set a tier (user preference) — disables auto-governor */
  set(tier: Tier) {
    this.locked = true
    this.tier = tier
    this.quality = qualityFor(tier)
    this.onChange(this.quality)
  }

  unlock() {
    this.locked = false
    this.windows = 0
    this.samples.length = 0
  }

  tick(dt: number) {
    if (this.locked || dt <= 0) return
    this.samples.push(dt)
    if (this.samples.length < 55) return
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    this.samples.length = 0
    const fps = 1 / avg
    if (fps >= 46) { this.windows = 0; return }
    this.windows++
    if (this.windows < 2) return
    this.windows = 0
    const i = ORDER.indexOf(this.tier)
    if (i <= 0) return
    this.tier = ORDER[i - 1]
    this.quality = qualityFor(this.tier)
    this.onChange(this.quality)
  }
}
