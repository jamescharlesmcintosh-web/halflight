/* ============================================================
   main — bootstrap, the player gate, chrome wiring
   ============================================================ */

import { Experience } from './experience'
import type { Tier } from './core/device'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/* ---------- WebGL guard ---------- */
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

if (!hasWebGL()) {
  $('fallback').hidden = false
  $('player').style.display = 'none'
} else {
  boot()
}

function boot() {
  const canvas = $<HTMLCanvasElement>('gl')
  let exp: Experience
  try {
    exp = new Experience(canvas)
  } catch (err) {
    console.error(err)
    $('fallback').hidden = false
    $('player').style.display = 'none'
    return
  }

  /* ---------- the render loop ---------- */
  let last = performance.now()
  let raf = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now
    exp.update(dt)
  }
  raf = requestAnimationFrame(frame)
  window.addEventListener('pagehide', () => cancelAnimationFrame(raf))

  /* ---------- the player gate ---------- */
  const player = $('player')
  const startBtn = $('startBtn')
  const startMute = $('startMute')
  let muted = false

  startMute.addEventListener('click', (e) => {
    e.stopPropagation()
    muted = !muted
    startMute.setAttribute('aria-pressed', String(muted))
    startMute.textContent = muted ? 'Starting muted' : 'Start muted'
  })

  const launch = () => {
    player.classList.add('is-out')
    const boot = $('playerBoot')
    boot.style.opacity = '1'
    boot.style.transition = 'opacity .12s linear'
    setTimeout(() => {
      boot.style.transition = 'opacity .5s ease'
      boot.style.opacity = '0'
    }, 140)
    setTimeout(() => { player.style.display = 'none' }, 1000)
    exp.begin(muted)
  }
  startBtn.addEventListener('click', launch)
  startBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch() }
  })

  /* ---------- chrome ---------- */
  $('skipBtn').addEventListener('click', () => {
    exp.audio.back()
    exp.skipToMenu()
  })
  $('audioBtn').addEventListener('click', () => {
    exp.setAudio(!exp.prefs.audio)
  })
  $('settingsBtn').addEventListener('click', () => {
    exp.audio.tick()
    exp.overlay.openPanel('settings')
    syncSettings()
  })
  $('panelClose').addEventListener('click', () => {
    exp.audio.back()
    exp.overlay.closePanel()
  })
  $('panelScrim').addEventListener('click', () => {
    exp.audio.back()
    exp.overlay.closePanel()
  })

  exp.overlay.onPanelClose = () => { /* nothing to restore */ }

  /* ---------- scene-selection cards jump into the feature ---------- */
  $('panelBody').addEventListener('click', (e) => {
    const replay = (e.target as HTMLElement).closest('[data-replay]') as HTMLElement | null
    if (replay) {
      exp.audio.select()
      exp.overlay.closePanel()
      setTimeout(() => {
        exp.overlay.clearTracks()
        exp.replayOpening()
      }, 320)
      return
    }
    const t = (e.target as HTMLElement).closest('[data-ch]') as HTMLElement | null
    if (!t) return
    const idx = Number(t.dataset.ch)
    exp.audio.select()
    exp.overlay.closePanel()
    setTimeout(() => {
      exp.overlay.clearTracks()
      // start the feature and scrub to that chapter
      const jump = () => {
        exp.input.scroll = 0
        exp.input.scrollTarget = 0
        // chapter t values sit between the bay anchors
        const target = [0.02, 0.2, 0.42, 0.64, 0.9][idx] ?? 0.02
        setTimeout(() => {
          exp.input.scroll = target
          exp.input.scrollTarget = target
        }, 60)
      }
      if (exp.phase === 'menu') {
        exp.startFeature()
        jump()
      }
    }, 380)
  })

  /* ---------- settings panel ---------- */
  function syncSettings() {
    const map: Record<string, string> = {
      audio: exp.prefs.audio ? 'On' : 'Off',
      vol: exp.prefs.volume,
      quality: exp.prefs.quality,
      motion: exp.prefs.motion,
      grain: exp.prefs.grain,
      lb: exp.prefs.letterbox,
    }
    document.querySelectorAll<HTMLDivElement>('.seg').forEach((seg) => {
      const key = seg.dataset.seg!
      const val = map[key]
      seg.querySelectorAll<HTMLButtonElement>('.seg__b').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.val === val)
      })
    })
  }

  $('panelBody').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.seg__b') as HTMLButtonElement | null
    if (!b) return
    const seg = b.parentElement as HTMLElement
    const key = seg.dataset.seg
    const val = b.dataset.val as string
    exp.audio.tick()
    seg.querySelectorAll('.seg__b').forEach((x) => x.classList.remove('is-on'))
    b.classList.add('is-on')

    switch (key) {
      case 'audio':
        exp.setAudio(val === 'On')
        break
      case 'vol':
        exp.prefs.volume = val as 'Low' | 'Standard' | 'High'
        exp.audio.setVolume(val === 'Low' ? 0.45 : val === 'High' ? 1.0 : 0.8)
        break
      case 'quality':
        exp.prefs.quality = val as 'Auto' | 'Ultra' | 'High' | 'Medium' | 'Low'
        if (val === 'Auto') {
          exp.gov.unlock()
          exp.overlay.state('Quality auto')
        } else {
          exp.gov.set(val as Tier)
          exp.overlay.state(`Quality ${val.toLowerCase()}`)
        }
        break
      case 'motion':
        exp.prefs.motion = val as 'Full' | 'Reduced'
        break
      case 'grain':
        exp.prefs.grain = val as 'On' | 'Off'
        exp.post.u.uGrain.value = val === 'On' ? 0.030 : 0.012
        exp.post.u.uWeave.value = val === 'On' ? 1 : 0.2
        break
      case 'lb':
        exp.prefs.letterbox = val as 'Auto' | 'Always' | 'Never'
        break
    }
  })

  /* ---------- end card ---------- */
  $('endMenu')?.addEventListener('click', () => exp.audio.select())

  /* ---------- accessibility: announce the first interaction ---------- */
  document.addEventListener('pointerdown', () => exp.overlay.hint(true), { once: true })

  // expose for debugging
  ;(window as unknown as { __hl: Experience }).__hl = exp
}
