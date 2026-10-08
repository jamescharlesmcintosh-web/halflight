/* ============================================================
   input — pointer, keys, wheel, touch. One source of truth.
   ============================================================ */

import { clamp, damp } from './timeline'

export class Input {
  /** raw pointer in CSS pixels */
  px = 0
  py = 0
  /** normalised -1..1, y up */
  nx = 0
  ny = 0
  /** smoothed normalised (what the camera actually uses) */
  sx = 0
  sy = 0
  /** smoothed -1..1 with a slower pole — for heavy parallax layers */
  sx2 = 0
  sy2 = 0
  /** 0..1 across the viewport */
  ux = 0.5
  uy = 0.5

  down = false
  justDown = false
  justUp = false
  /** total drag distance while down */
  dragDist = 0

  wheel = 0
  wheelSmooth = 0
  /** scroll position driver — driven by wheel/touch/keys, 0..1 */
  scroll = 0
  scrollTarget = 0

  keys = new Set<string>()
  /** one-shot key events this frame */
  pressed = new Set<string>()

  private el: HTMLElement
  private touchY = 0
  private touchX = 0
  private lastTap = 0

  constructor(el: HTMLElement) {
    this.el = el
    this.bind()
  }

  private bind() {
    const e = this.el

    window.addEventListener('pointermove', (ev) => {
      this.px = ev.clientX
      this.py = ev.clientY
      this.ux = clamp(ev.clientX / Math.max(window.innerWidth, 1))
      this.uy = clamp(ev.clientY / Math.max(window.innerHeight, 1))
      this.nx = this.ux * 2 - 1
      this.ny = -(this.uy * 2 - 1)
    }, { passive: true })

    window.addEventListener('pointerdown', (ev) => {
      this.down = true
      this.justDown = true
      this.dragDist = 0
      this.touchX = ev.clientX
      this.touchY = ev.clientY
      this.px = ev.clientX; this.py = ev.clientY
    }, { passive: true })

    window.addEventListener('pointermove', (ev) => {
      if (!this.down) return
      const dx = ev.clientX - this.touchX
      const dy = ev.clientY - this.touchY
      this.touchX = ev.clientX
      this.touchY = ev.clientY
      this.dragDist += Math.abs(dx) + Math.abs(dy)
      // drag acts like a scrub of the scroll driver
      this.scrollTarget = clamp(this.scrollTarget - dy / (window.innerHeight * 2.6))
    }, { passive: true })

    window.addEventListener('pointerup', (ev) => {
      this.down = false
      this.justUp = true
      const now = performance.now()
      if (now - this.lastTap < 320) this.pressed.add('double')
      this.lastTap = now
      void ev
    }, { passive: true })

    window.addEventListener('pointercancel', () => { this.down = false }, { passive: true })

    window.addEventListener('wheel', (ev) => {
      if (ev.ctrlKey) return
      ev.preventDefault()
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? window.innerHeight : 1
      const d = ev.deltaY * unit
      this.wheel += d
      this.scrollTarget = clamp(this.scrollTarget + d / (window.innerHeight * 5.2))
    }, { passive: false })

    window.addEventListener('keydown', (ev) => {
      const k = ev.key
      if (!this.keys.has(k)) this.pressed.add(k)
      this.keys.add(k)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown'].includes(k)) {
        ev.preventDefault()
      }
      if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') this.scrollTarget = clamp(this.scrollTarget - 0.055)
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') this.scrollTarget = clamp(this.scrollTarget + 0.055)
    })

    window.addEventListener('keyup', (ev) => { this.keys.delete(ev.key) })
    window.addEventListener('blur', () => { this.keys.clear(); this.down = false })
  }

  /** call once at the top of each frame */
  update(dt: number) {
    this.sx = damp(this.sx, this.nx, 6.5, dt)
    this.sy = damp(this.sy, this.ny, 6.5, dt)
    this.sx2 = damp(this.sx2, this.nx, 2.1, dt)
    this.sy2 = damp(this.sy2, this.ny, 2.1, dt)
    this.scroll = damp(this.scroll, this.scrollTarget, 7.5, dt)
    this.wheelSmooth = damp(this.wheelSmooth, this.wheel, 8, dt)
    this.wheel = 0
  }

  /** call once at the end of each frame */
  endFrame() {
    this.justDown = false
    this.justUp = false
    this.pressed.clear()
  }

  was(...keys: string[]) {
    return keys.some((k) => this.pressed.has(k))
  }
}
