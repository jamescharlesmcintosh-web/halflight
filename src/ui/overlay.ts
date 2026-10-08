/* ============================================================
   overlay — title cards, tracked type, DVD sub-menus, end card
   ============================================================ */

import * as THREE from 'three'
import { BRAND, MENU, CHAPTERS, TRAILERS, TITLES, FEATURES, NOTES, PLACEMENTS, BAYS, CREDITS } from '../data/brand'
import { clamp, ease, damp } from '../core/timeline'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export interface TrackRec {
  el: HTMLElement
  pos: THREE.Vector3
  /** world-space height the type should occupy */
  scale: number
  opacity: number
  visible: boolean
  /** 0..1 hover/intensity that callers can drive */
  hot: number
}

export interface MenuRec extends TrackRec {
  index: number
  item: HTMLElement
  hover: number
  target: number
}

export class Overlay {
  cardsEl = $('cards')
  trackEl = $('track')
  chromeEl = $('chrome')
  panelEl = $('panel')
  panelBody = $('panelBody')
  panelTitle = $('panelTitle')
  panelKicker = $('panelKicker')
  panelFoot = $('panelFoot')
  endEl = $('endcard')
  srLive = $('srLive')
  stateEl = $('chromeState')
  hintEl = $('chromeHint')

  private live: HTMLElement | null = null
  private liveAt = 0
  private liveHold = 0
  private liveOnHide: null | (() => void) = null

  private tracks: TrackRec[] = []

  panelOpen = false
  onPanelClose: () => void = () => {}

  constructor() {
    this.buildEndCard()
  }

  /* ---------------- announcements ---------------- */
  say(text: string) {
    this.srLive.textContent = text
  }

  state(text: string) {
    this.stateEl.textContent = text
  }

  hint(show: boolean) {
    this.hintEl.style.opacity = show ? '1' : '0'
    this.hintEl.style.transition = 'opacity .6s ease'
  }

  /* ---------------- title cards ---------------- */

  /**
   * Show a title card. Returns a promise that resolves when it should leave.
   * The caller decides duration; this handles the in / hold / out motion.
   */
  card(opts: {
    kicker?: string
    title: string
    sub?: string
    log?: string
    foot?: string
    flash?: boolean
  }): { el: HTMLElement; hide: (fade?: number) => Promise<void> } {
    const el = document.createElement('div')
    el.className = 'card' + (opts.flash ? ' card--flash' : '')
    el.innerHTML = `
      <div class="card__inner">
        ${opts.kicker ? `<div class="card__kicker">${opts.kicker}</div>` : ''}
        <h2 class="card__title">${opts.title}</h2>
        ${opts.sub ? `<div class="card__rule"></div><div class="card__sub">${opts.sub}</div>` : ''}
        ${opts.log ? `<p class="card__log">${opts.log}</p>` : ''}
        ${opts.foot ? `<div class="card__foot">${opts.foot}</div>` : ''}
      </div>`
    this.cardsEl.appendChild(el)

    // in
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .85s cubic-bezier(.16,1,.3,1), transform 1.15s cubic-bezier(.16,1,.3,1), filter .85s ease'
      el.style.opacity = '1'
      const inner = el.querySelector('.card__inner') as HTMLElement
      inner.style.transition = 'transform 1.15s cubic-bezier(.16,1,.3,1), opacity .9s ease'
      inner.style.transform = 'translateY(0) scale(1)'
      inner.style.opacity = '1'
    })
    const inner = el.querySelector('.card__inner') as HTMLElement
    inner.style.transform = 'translateY(18px) scale(1.02)'
    inner.style.opacity = '0'

    return {
      el,
      hide: (fade = 0.7) =>
        new Promise<void>((res) => {
          el.style.transition = `opacity ${fade}s ease, filter ${fade}s ease`
          el.style.opacity = '0'
          el.style.filter = 'blur(6px)'
          setTimeout(() => { el.remove(); res() }, fade * 1000 + 30)
        }),
    }
  }

  /** a flash frame */
  flash(on = true) {
    let el = this.cardsEl.querySelector('.card--flash') as HTMLElement | null
    if (!on) { if (el) el.remove(); return }
    if (el) return
    el = document.createElement('div')
    el.className = 'card card--flash'
    el.style.opacity = '1'
    this.cardsEl.appendChild(el)
  }

  /* ---------------- tracked (3D-anchored) type ---------------- */

  addTrack(html: string, pos: THREE.Vector3, scale = 1, cls = ''): TrackRec {
    const el = document.createElement('div')
    el.className = 'track-item ' + cls
    el.innerHTML = html
    this.trackEl.appendChild(el)
    const rec: TrackRec = { el, pos: pos.clone(), scale, opacity: 1, visible: true, hot: 0 }
    this.tracks.push(rec)
    return rec
  }

  clearTracks() {
    for (const t of this.tracks) t.el.remove()
    this.tracks.length = 0
  }

  /**
   * Project 3D anchors onto the viewport.
   * Scale is perspective-correct: `scale` is the world-space height the
   * type should occupy, so text shrinks with distance like real geometry.
   */
  updateTracks(camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth, h = window.innerHeight
    const v = new THREE.Vector3()
    const camPos = camera.position
    // pixels per world unit at one unit of distance
    const k = h * 0.5 / Math.tan((camera.fov * Math.PI) / 360)

    for (const t of this.tracks) {
      if (!t.visible) { t.el.classList.add('is-dead'); continue }
      t.el.classList.remove('is-dead')

      v.copy(t.pos).project(camera)
      const dist = camPos.distanceTo(t.pos)
      const behind = v.z > 1 || dist < 0.02
      const x = (v.x * 0.5 + 0.5) * w
      const y = (-v.y * 0.5 + 0.5) * h
      // world-height → screen-height
      const px = (t.scale * k) / Math.max(dist, 0.02)
      const s = clamp(px / 100, 0.02, 12)

      t.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%,-50%) scale(${s.toFixed(4)})`
      // fade out as the anchor leaves the frustum laterally
      const edge = clamp(1.35 - Math.abs(v.x) * 0.85, 0, 1) * clamp(1.35 - Math.abs(v.y) * 0.85, 0, 1)
      const op = behind ? 0 : clamp(t.opacity * edge)
      t.el.style.opacity = op.toFixed(3)
      t.el.style.pointerEvents = op > 0.3 ? 'auto' : 'none'
    }
  }

  /* ---------------- panels ---------------- */

  openPanel(kind: 'scenes' | 'behind' | 'special' | 'settings' | 'catalogue' | 'notes') {
    this.panelKicker.textContent = ({
      scenes: 'Chapter Index',
      behind: 'Behind the Scenes',
      special: 'Special Features',
      settings: 'Player Settings',
      catalogue: 'Catalogue 2025',
      notes: 'Production Notes',
    } as Record<string, string>)[kind]

    this.panelTitle.innerHTML = ({
      scenes: 'Scene<br>Selections',
      behind: 'How the<br>disc is made',
      special: 'Special<br>Features',
      settings: 'Audio<br>& Settings',
      catalogue: 'Eight titles<br>in print',
      notes: 'Production<br>notes',
    } as Record<string, string>)[kind]

    this.panelBody.innerHTML = this.panelHTML(kind)
    this.panelFoot.textContent = ({
      scenes: '5 chapters · 92 min',
      behind: 'Restoration 2024–25',
      special: '6 supplements',
      settings: 'Saved to this device',
      catalogue: 'Ship Thursdays',
      notes: '4 notes',
    } as Record<string, string>)[kind]

    this.panelEl.hidden = false
    // force reflow then open
    void this.panelEl.offsetWidth
    this.panelEl.classList.add('is-open')
    this.panelOpen = true
    this.say(this.panelTitle.textContent || '')
    const c = $('panelClose') as HTMLElement
    setTimeout(() => c.focus?.(), 60)
  }

  closePanel() {
    if (!this.panelOpen) return
    this.panelEl.classList.remove('is-open')
    this.panelOpen = false
    setTimeout(() => {
      this.panelEl.hidden = true
      this.onPanelClose()
    }, 420)
  }

  private panelHTML(kind: string): string {
    switch (kind) {
      case 'scenes': {
        return `<div class="pgrid pgrid--chapters">` + CHAPTERS.map((c, i) => `
          <button class="pcard pcard--select" data-ch="${i}">
            <div class="pcard__num">${c.n}</div>
            <div class="pcard__k">Chapter ${c.n} &nbsp;/&nbsp; ${c.time}</div>
            <div class="pcard__t">${c.title}</div>
            <div class="pcard__d">${c.note}</div>
            <div class="pcard__m"><span>${BRAND.feature}</span><span>${c.time}</span></div>
          </button>`).join('') + `</div>`
      }
      case 'behind': {
        return NOTES.map((n) => `
          <div class="pnote">
            <div class="pnote__i">${n.i}</div>
            <div>
              <h3 class="pnote__t">${n.t}</h3>
              <p class="pnote__p">${n.p}</p>
            </div>
          </div>`).join('') + `
          <div class="pnote">
            <div class="pnote__i">Specification</div>
            <div>
              <table class="ptable">
                <tr><th>Source</th><td>Original 16mm negative, ${BRAND.featureYear}</td></tr>
                <tr><th>Scan</th><td>4K wet-gate, dust &amp; scratch pass</td></tr>
                <tr><th>Repair</th><td>Hand frame repair — dirt, tears, tape damage</td></tr>
                <tr><th>Grain</th><td>Preserved. Not denoised.</td></tr>
                <tr><th>Aspect</th><td>${BRAND.featureAspect} — as photographed</td></tr>
                <tr><th>Sound</th><td>Optical track, restored. Hiss and traffic retained.</td></tr>
                <tr><th>Format</th><td>${BRAND.disc} · run of ${BRAND.runs}</td></tr>
                <tr><th>Sleeve</th><td>Foil-stamped, numbered 001–2000 by hand</td></tr>
              </table>
            </div>
          </div>`
      }
      case 'special': {
        return `<div class="pgrid pgrid--2">
          <button class="pcard pcard--select" data-replay="1">
            <div class="pcard__num">R</div>
            <div class="pcard__k">Coming Attractions &nbsp;/&nbsp; 01:12</div>
            <div class="pcard__t">Replay the Opening</div>
            <div class="pcard__d">The studio ident, the leader and all three coming attractions, exactly as they played before the main menu.</div>
            <div class="pcard__m"><span>Plays from the top</span></div>
          </button>` + FEATURES.map((f) => `
          <article class="pcard">
            <div class="pcard__k">Supplement &nbsp;/&nbsp; ${f.run}</div>
            <div class="pcard__t">${f.title}</div>
            <div class="pcard__d">${f.desc}</div>
            <div class="pcard__m"><span>${f.rest}</span></div>
          </article>`).join('') + `</div>`
      }
      case 'catalogue': {
        return `<div class="pgrid pgrid--2">` + TITLES.map((t) => `
          <article class="pcard">
            <div class="pcard__num">${t.ed.replace('No. ', '')}</div>
            <div class="pcard__k">${t.year} &nbsp;/&nbsp; ${t.dir}</div>
            <div class="pcard__t">${t.title}</div>
            <div class="pcard__d">${t.blurb}</div>
            <div class="pcard__m">
              <span>${t.run}</span><span>${t.aspect}</span><span>${t.format}</span>
              <span class="badge badge--${t.stock}">${
                t.stock === 'in' ? 'In stock' : t.stock === 'low' ? 'Low stock'
                : t.stock === 'pre' ? 'Pre-order' : 'Out of print'}</span>
            </div>
          </article>`).join('') + `</div>`
      }
      case 'settings': {
        return `<div class="psettings">
          ${this.segRow('Sound', 'Master output', 'audio', ['On', 'Off'])}
          ${this.segRow('Level', 'Output trim', 'vol', ['Low', 'Standard', 'High'])}
          ${this.segRow('Picture', 'Render quality', 'quality', ['Auto', 'Ultra', 'High', 'Medium', 'Low'])}
          ${this.segRow('Motion', 'Camera drift & transitions', 'motion', ['Full', 'Reduced'])}
          ${this.segRow('Grain', 'Film grain & gate weave', 'grain', ['On', 'Off'])}
          ${this.segRow('Letterbox', 'Cinema bars', 'lb', ['Auto', 'Always', 'Never'])}
        </div>
        <div class="pnote" style="margin-top:22px">
          <div class="pnote__i">Keyboard</div>
          <div>
            <table class="ptable">
              <tr><th>Navigate</th><td>&uarr; &darr; &nbsp;/&nbsp; Tab &nbsp;/&nbsp; pointer</td></tr>
              <tr><th>Select</th><td>Enter &nbsp;/&nbsp; Space</td></tr>
              <tr><th>Back</th><td>Esc</td></tr>
              <tr><th>Mute</th><td>M</td></tr>
              <tr><th>Skip previews</th><td>Esc &nbsp;/&nbsp; the Skip control</td></tr>
              <tr><th>Scrub the feature</th><td>&uarr; &darr; &nbsp;/&nbsp; scroll &nbsp;/&nbsp; drag</td></tr>
            </table>
          </div>
        </div>`
      }
      case 'notes':
      default: {
        return PLACEMENTS.map((p) => `
          <div class="pnote">
            <div class="pnote__i">${p.k}</div>
            <div>
              <h3 class="pnote__t">${p.v}</h3>
              <p class="pnote__p">${p.d}</p>
            </div>
          </div>`).join('') + `
          <div class="pnote">
            <div class="pnote__i">Contact</div>
            <div>
              <h3 class="pnote__t">${BRAND.email}</h3>
              <p class="pnote__p">${BRAND.address}. Licensing enquiries are answered within two working days.</p>
            </div>
          </div>`
      }
    }
  }

  private segRow(k: string, v: string, group: string, opts: string[]) {
    return `<div class="prow">
      <div class="prow__l"><div class="prow__k">${k}</div><div class="prow__v">${v}</div></div>
      <div class="seg" data-seg="${group}">
        ${opts.map((o, i) => `<button class="seg__b${i === 0 ? ' is-on' : ''}" data-val="${o}">${o}</button>`).join('')}
      </div>
    </div>`
  }

  /* ---------------- end card ---------------- */

  private buildEndCard() {
    const rows = $('endRows')
    rows.innerHTML = CREDITS.map(([k, v]) => `
      <div class="endrow"><div class="endrow__k">${k}</div><div class="endrow__v">${v}</div></div>`).join('')
    const cr = $('endCredits')
    cr.innerHTML = BAYS.map((b) => `${b.n} &nbsp; ${b.title}`).join(' &nbsp;·&nbsp; ') +
      '<br>Half-Light Video BV &nbsp;·&nbsp; Katshoek 12, Rotterdam &nbsp;·&nbsp; Catalogue 2025'
  }

  showEnd() {
    this.endEl.hidden = false
    void this.endEl.offsetWidth
    this.endEl.classList.add('is-open')
  }
  hideEnd() {
    this.endEl.classList.remove('is-open')
    setTimeout(() => { this.endEl.hidden = true }, 900)
  }
}

/* ---------------- the menu bar (DVD-style vertical list) ---------------- */

/**
 * Menu items are real 3D anchors: the glow plate lives in the WebGL scene
 * and the typography is projected onto it, so it stays razor sharp at any DPI
 * while still catching the room's light and depth.
 */
export function buildMenu(host: Overlay, platePositions: THREE.Vector3[], worldHeight = 0.30): MenuRec[] {
  host.clearTracks()
  const recs: MenuRec[] = []
  MENU.forEach((m, i) => {
    const el = document.createElement('div')
    el.className = 'mi'
    el.dataset.i = String(i)
    el.innerHTML = `
      <span class="mi__code">${m.code}</span>
      <span class="mi__label">${m.label}</span>
      <span class="mi__sub">${m.sub}</span>
      <span class="mi__bar"></span>`
    const rec = host.addTrack(el.outerHTML, platePositions[i], worldHeight, 'mi-track') as unknown as MenuRec
    rec.index = i
    rec.item = rec.el.firstElementChild as HTMLElement
    rec.hover = 0
    rec.target = 0
    recs.push(rec)
  })
  return recs
}

export function setMenuHot(recs: MenuRec[], active: number) {
  for (const r of recs) {
    const on = r.index === active
    r.item.classList.toggle('is-hot', on)
    r.target = on ? 1 : 0
  }
}

export function tickMenu(recs: MenuRec[], dt: number) {
  for (const r of recs) {
    r.hover = damp(r.hover, r.target, 11, dt)
    r.item.style.setProperty('--hot', r.hover.toFixed(3))
    r.item.style.transform = `translate3d(${(r.hover * 10).toFixed(2)}px,0,0)`
  }
}

export { ease, clamp }
