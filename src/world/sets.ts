/* ============================================================
   sets — the physical worlds. Built, lit, dressed. No stock.
   ============================================================ */

import * as THREE from 'three'
import {
  makeBeam, animateBeam, makeDust, animateDust, makeHaze, makeLightPool,
  metalMat, matteMat, concreteMat, floorMat, velvetMat, foilMat,
  emissiveMat, glassMat, screenMat, noiseMat,
} from '../gfx/atmos'
import { labelPlate, filmStrip, screenFrame, brushedMetal, emulsion, foil, discSurface, glowSprite } from '../gfx/textures'
import { clamp, lerp, fbm1, smooth } from '../core/timeline'

export { animateBeam, animateDust }

export interface SetRefs {
  root: THREE.Group
  beams: THREE.Object3D[]
  dust: THREE.Points[]
  lights: THREE.Light[]
  anim: Array<(t: number, dt: number) => void>
  grade: { warm: number; lift: number; exposure: number; bloom: number; vignette: number }
  fogColor: THREE.Color
  fogDensity: number
}

function refs(root: THREE.Group): SetRefs {
  return {
    root, beams: [], dust: [], lights: [], anim: [],
    grade: { warm: 0.34, lift: 0.2, exposure: 1.06, bloom: 0.5, vignette: 0.62 },
    fogColor: new THREE.Color(0x05070c),
    fogDensity: 0.035,
  }
}

/* ============================================================
   1 · THE DISC — studio ident void
   ============================================================ */
export function buildDiscSet(): SetRefs {
  const g = new THREE.Group()
  const R = refs(g)

  g.add(new THREE.AmbientLight(0x2a2620, 0.55))
  const key = new THREE.SpotLight(0xffd2a0, 30, 30, 0.42, 0.55, 1.2)
  key.position.set(-4.2, 5.4, 4.6)
  g.add(key); R.lights.push(key)
  const rim = new THREE.SpotLight(0x9ab4d0, 7, 30, 0.5, 0.6, 1.4)
  rim.position.set(5.0, 1.4, -3.4)
  rim.target.position.set(0, 0, 0)
  g.add(rim, rim.target); R.lights.push(rim)
  const fill = new THREE.PointLight(0xffc98a, 4.2, 14, 2)
  fill.position.set(0.6, -1.8, 2.4)
  g.add(fill); R.lights.push(fill)

  // the disc
  const disc = new THREE.Group()
  const face = discSurface()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.02, 0.028, 128),
    new THREE.MeshStandardMaterial({
      map: face,
      roughnessMap: face,
      color: 0xc8c2b8,
      roughness: 0.30,
      metalness: 0.94,
      envMapIntensity: 2.4,
    })
  )
  body.rotation.x = Math.PI / 2
  disc.add(body)

  // iridescent sheen — three thin offset rings read as a rainbow diffraction
  const hues: Array<[number, number, number, number]> = [
    [0x8fd8ff, 0.90, 0.985, 0.16],
    [0xff9ad2, 0.855, 0.945, 0.13],
    [0xffe08a, 0.945, 0.995, 0.18],
    [0xa8ffd0, 0.80, 0.865, 0.11],
  ]
  for (const [col, r0, r1, op] of hues) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r0, r1, 128),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      })
    )
    ring.position.z = 0.017
    disc.add(ring)
  }

  // a soft catch-light arc so the disc reads as an object, not a coin
  const arcMat = new THREE.MeshBasicMaterial({
    map: glowSprite(0.0, 0.30),
    color: 0xffe6b8, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  })
  const arc = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), arcMat)
  arc.position.set(-0.30, 0.34, 0.022)
  disc.add(arc)

  // hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.235, 0.235, 0.042, 48),
    metalMat({ warm: true, rough: 0.28, metal: 0.92, color: 0xd6b273 })
  )
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.008
  disc.add(hub)
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.115, 0.05, 32),
    matteMat(0x05060a, 1)
  )
  hole.rotation.x = Math.PI / 2
  hole.position.z = 0.01
  disc.add(hole)

  disc.position.set(0, 0.15, 0)
  g.add(disc)

  // key beam through the void
  const beam = makeBeam({
    from: new THREE.Vector3(-2.6, 3.4, 2.6),
    to: new THREE.Vector3(0.2, 0, 0),
    r0: 0.16, r1: 1.9,
    color: 0xffd0a0, intensity: 1.25, slices: 20,
  })
  g.add(beam); R.beams.push(beam)

  const dust = makeDust(900, new THREE.Vector3(8, 6, 6), 0xffe2b8, 0.028)
  dust.position.set(-0.6, 1.0, 1.0)
  g.add(dust); R.dust.push(dust)

  const haze = makeHaze(0x2a3550, 14, 9, 0.05)
  haze.position.set(0, 0, -3)
  g.add(haze)

  R.anim.push((t) => {
    disc.rotation.z = t * 0.22
    disc.rotation.x = Math.sin(t * 0.3) * 0.07 - 0.16
    disc.position.y = 0.15 + Math.sin(t * 0.5) * 0.04
  })

  R.grade = { warm: 0.5, lift: 0.14, exposure: 1.1, bloom: 0.62, vignette: 0.7 }
  R.fogDensity = 0.03
  return R
}

/* ============================================================
   2 · THE BENCH — trailer: the restoration
   ============================================================ */
export function buildBenchSet(): SetRefs {
  const g = new THREE.Group()
  const R = refs(g)

  g.add(new THREE.AmbientLight(0x1a2230, 0.7))
  const lamp = new THREE.SpotLight(0xffc887, 60, 12, 0.5, 0.45, 1.4)
  lamp.position.set(-1.5, 2.5, 1.3)
  lamp.target.position.set(0, 0, 0)
  g.add(lamp, lamp.target); R.lights.push(lamp)
  const fillL = new THREE.PointLight(0x6f90b4, 2.4, 8, 2)
  fillL.position.set(2.2, 0.4, -1.2)
  g.add(fillL); R.lights.push(fillL)

  // bench top
  const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 3.2), concreteMat(0x4a4540))
  bench.position.set(0, -0.5, 0)
  g.add(bench)

  // film strip running through a gate
  const stripMat = new THREE.MeshStandardMaterial({
    map: filmStrip(), roughness: 0.55, metalness: 0.1,
    emissive: 0x2a1c10, emissiveIntensity: 0.35,
  })
  stripMat.map!.wrapS = THREE.RepeatWrapping
  stripMat.map!.wrapT = THREE.RepeatWrapping
  stripMat.map!.repeat.set(3, 1)
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.5), stripMat)
  strip.position.set(0, 0.1, 0.2)
  strip.rotation.x = -Math.PI / 2 + 0.32
  g.add(strip)

  // gate frame
  const gate = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 12, 40), metalMat({ warm: false, rough: 0.3 }))
  frame.scale.set(1.5, 1.0, 1)
  gate.add(frame)
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), glassMat(0xcfe0ee))
  glass.position.z = 0.01
  gate.add(glass)
  gate.position.set(-0.35, 0.42, 0.35)
  gate.rotation.y = 0.3
  g.add(gate)

  // loupe / second lens
  const loupe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), glassMat(0xd6e4f2))
  loupe.position.set(1.1, 0.28, 0.5)
  g.add(loupe)
  const loupeRing = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 10, 32), metalMat({ warm: true, rough: 0.25 }))
  loupeRing.position.copy(loupe.position)
  g.add(loupeRing)

  // a couple of cans stacked
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 48), metalMat({ warm: true, rough: 0.42, color: 0x8d8478 }))
  can.rotation.x = Math.PI / 2
  can.position.set(-1.9, 0.05, -0.7)
  g.add(can)
  const can2 = can.clone(); can2.position.set(-1.9, 0.2, -0.7); g.add(can2)
  const canLabel = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 48),
    new THREE.MeshStandardMaterial({ map: labelPlate(['REEL 3 / 4', 'NIGHT SHIFT', '16mm NEG', 'AFTER INSPECTION']), roughness: 0.8 })
  )
  canLabel.rotation.x = -Math.PI / 2
  canLabel.position.set(-1.9, 0.28, -0.7)
  g.add(canLabel)

  // work-lamp housing
  const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 0.3, 24), metalMat({ warm: true, rough: 0.4 }))
  lampHead.position.set(-1.5, 1.5, 1.0)
  lampHead.lookAt(0, 0, 0)
  g.add(lampHead)

  const beam = makeBeam({
    from: new THREE.Vector3(-1.5, 1.5, 1.0),
    to: new THREE.Vector3(0.1, 0, 0.2),
    r0: 0.12, r1: 0.95, color: 0xffc07a, intensity: 1.5, slices: 18,
  })
  g.add(beam); R.beams.push(beam)

  const dust = makeDust(700, new THREE.Vector3(4, 2.4, 3), 0xffd9a8, 0.022)
  dust.position.set(-0.2, 0.7, 0.3)
  g.add(dust); R.dust.push(dust)

  // scanning light bar that wipes the damage away
  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  bar.position.set(-2.6, 0.1, 0.22)
  bar.rotation.x = strip.rotation.x
  g.add(bar)

  R.anim.push((t, dt) => {
    stripMat.map!.offset.x -= dt * 0.24
    // the scan bar wipes across every 3 seconds
    const c = (t * 0.32) % 1
    bar.position.x = lerp(-2.7, 2.7, c)
    const on = c > 0.02 && c < 0.98 ? 1 : 0
    ;(bar.material as THREE.MeshBasicMaterial).opacity = 0.35 * on * (0.6 + 0.4 * Math.sin(t * 40))
    // damage fades as the scan passes
    const cleaned = smooth(clamp(c * 1.2))
    stripMat.emissiveIntensity = lerp(0.5, 0.18, cleaned)
    loupe.position.y = 0.28 + Math.sin(t * 0.7) * 0.02
  })

  R.grade = { warm: 0.55, lift: 0.1, exposure: 1.12, bloom: 0.58, vignette: 0.72 }
  R.fogColor = new THREE.Color(0x0a0c12)
  R.fogDensity = 0.05
  return R
}

/* ============================================================
   3 · THE AUDITORIUM — trailer, main menu, and the feature end
   ============================================================ */
export function buildAuditoriumSet(): SetRefs {
  const g = new THREE.Group()
  const R = refs(g)

  g.add(new THREE.HemisphereLight(0x2a3548, 0x0a0806, 0.55))
  const house = new THREE.PointLight(0x8a3a2c, 2.2, 16, 2)
  house.position.set(0, 2.4, -3.2)
  g.add(house); R.lights.push(house)
  const exitL = new THREE.PointLight(0xd63c2c, 3.2, 6, 2)
  exitL.position.set(-3.6, 1.5, -2.4)
  g.add(exitL); R.lights.push(exitL)
  const projLight = new THREE.SpotLight(0xfff0d0, 90, 30, 0.34, 0.5, 1.1)
  projLight.position.set(0, 2.3, 6.2)
  projLight.target.position.set(0, 1.2, -8)
  g.add(projLight, projLight.target); R.lights.push(projLight)

  // --- room shell ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 34), floorMat(0x141820))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -0.02, -2)
  g.add(floor)

  const wallMat = concreteMat(0x33302c)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), wallMat)
  back.position.set(0, 5, -10)
  g.add(back)
  const left = new THREE.Mesh(new THREE.PlaneGeometry(34, 10), wallMat)
  left.rotation.y = Math.PI / 2
  left.position.set(-7.2, 5, -2)
  g.add(left)
  const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = 7.2
  g.add(right)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 34), matteMat(0x0b0d12, 1))
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, 5.6, -2)
  g.add(ceil)

  // --- the screen ---
  const screenFrameGeo = new THREE.Mesh(new THREE.BoxGeometry(11.2, 6.2, 0.16), matteMat(0x0c0d10, 0.8))
  screenFrameGeo.position.set(0, 2.6, -9.85)
  g.add(screenFrameGeo)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 5.4), screenMat())
  screen.position.set(0, 2.6, -9.74)
  g.add(screen)
  // screen spill onto the floor
  const spill = makeLightPool(5.4, 0x8fb0d0, 0.12)
  spill.position.set(0, 0.02, -5.4)
  g.add(spill)

  // --- seats (silhouettes) ---
  const seatBackGeo = new THREE.BoxGeometry(0.62, 0.72, 0.12)
  const seatBaseGeo = new THREE.BoxGeometry(0.62, 0.14, 0.5)
  const seatMat = velvetMat(0x3a1a1e)
  const rows = 6, cols = 9
  const backs = new THREE.InstancedMesh(seatBackGeo, seatMat, rows * cols)
  const bases = new THREE.InstancedMesh(seatBaseGeo, seatMat, rows * cols)
  const m = new THREE.Matrix4()
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * 1.05
      const z = -6.2 + r * 1.28
      // gentle curve to the rows
      const y = 0.55 + r * 0.1
      const zz = z + Math.abs(c - (cols - 1) / 2) * 0.04
      m.makeTranslation(x, y, zz)
      backs.setMatrixAt(idx, m)
      m.makeTranslation(x, y - 0.4, zz + 0.22)
      bases.setMatrixAt(idx, m)
      idx++
    }
  }
  backs.instanceMatrix.needsUpdate = true
  bases.instanceMatrix.needsUpdate = true
  g.add(backs, bases)

  // aisle steps (leading lines toward the screen)
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.2), matteMat(0x1c1a18, 0.9))
    step.position.set(0, 0.03 + r * 0.1, -6.3 + r * 1.28)
    g.add(step)
  }

  // --- projector + beam ---
  const projBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.9), metalMat({ warm: false, rough: 0.4 }))
  projBody.position.set(0, 2.3, 6.4)
  g.add(projBody)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.2, 24), glassMat(0xd8e8f6))
  lens.rotation.x = Math.PI / 2
  lens.position.set(0, 2.3, 5.85)
  g.add(lens)
  const lensGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  )
  lensGlow.position.copy(lens.position)
  g.add(lensGlow)

  const beam = makeBeam({
    from: new THREE.Vector3(0, 2.3, 5.8),
    to: new THREE.Vector3(0, 2.6, -9.6),
    r0: 0.16, r1: 4.4,
    color: 0xffe6bc, intensity: 1.1, slices: 26,
  })
  g.add(beam); R.beams.push(beam)

  const dust = makeDust(1400, new THREE.Vector3(9, 5, 15), 0xffe4bc, 0.03)
  dust.position.set(0, 2.2, -1.5)
  g.add(dust); R.dust.push(dust)

  const haze = makeHaze(0x3a4258, 18, 10, 0.045)
  haze.position.set(0, 2.4, -4)
  g.add(haze)

  // exit sign
  const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), emissiveMat(0xd63c2c, 4))
  exitSign.position.set(-3.7, 1.6, -3.2)
  g.add(exitSign)

  // wall sconces
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), emissiveMat(0xffb070, 2.2))
    const side = i < 2 ? -1 : 1
    s.position.set(side * 7.0, 2.2 + (i % 2) * 0.5, -1.5 - (i % 2) * 3.5)
    g.add(s)
  }

  R.anim.push((t) => {
    // projector shutter flicker on the lens
    const fl = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 24.0) * Math.sin(t * 11.3))
    lensGlow.scale.setScalar(fl)
    ;(lensGlow.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * fl
    // screen content slowly drifts
    const mm = (screen.material as THREE.MeshStandardMaterial)
    if (mm.map) mm.map.offset.x = Math.sin(t * 0.05) * 0.02
    if (mm.emissiveMap) mm.emissiveMap.offset.x = Math.sin(t * 0.05) * 0.02
  })

  R.grade = { warm: 0.42, lift: 0.2, exposure: 1.04, bloom: 0.55, vignette: 0.66 }
  R.fogColor = new THREE.Color(0x06080e)
  R.fogDensity = 0.038
  return R
}

/* ============================================================
   4 · THE PRESS — trailer: the pressing
   ============================================================ */
export function buildPressSet(): SetRefs {
  const g = new THREE.Group()
  const R = refs(g)

  g.add(new THREE.AmbientLight(0x2a2418, 0.7))
  const sodium = new THREE.PointLight(0xff9a4a, 24, 14, 2)
  sodium.position.set(1.8, 3.2, 1.4)
  g.add(sodium); R.lights.push(sodium)
  const cool = new THREE.SpotLight(0x8fb4d8, 22, 14, 0.5, 0.5, 1.3)
  cool.position.set(-2.6, 2.4, 1.6)
  cool.target.position.set(0, 0.4, 0)
  g.add(cool, cool.target); R.lights.push(cool)

  // floor + back wall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat(0x181818))
  floor.rotation.x = -Math.PI / 2
  g.add(floor)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), concreteMat(0x2e2a26))
  back.position.set(0, 4, -3)
  g.add(back)

  // the press: two platens
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), metalMat({ warm: true, rough: 0.42, color: 0x6a5f52 }))
  plinth.position.set(0, 0.45, 0)
  g.add(plinth)

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.16, 64), metalMat({ warm: true, rough: 0.3, metal: 0.95, color: 0xc0a070 }))
  lower.position.set(0, 1.0, 0)
  g.add(lower)

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.16, 64), metalMat({ warm: true, rough: 0.3, metal: 0.95, color: 0xc0a070 }))
  upper.position.set(0, 1.7, 0)
  g.add(upper)

  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 24), metalMat({ warm: false, rough: 0.25 }))
  ram.position.set(0, 2.5, 0)
  g.add(ram)

  // the disc being pressed
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.03, 64),
    new THREE.MeshStandardMaterial({ map: foil(), color: 0xd8c8a0, roughness: 0.2, metalness: 0.9, envMapIntensity: 2 })
  )
  disc.rotation.x = Math.PI / 2
  disc.position.set(0, 1.12, 0)
  g.add(disc)

  // stack of finished sleeves
  const sleeveGeo = new THREE.BoxGeometry(0.9, 0.06, 1.2)
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(sleeveGeo, foilMat())
    s.position.set(1.55 + (i % 2) * 0.03, 0.04 + i * 0.065, -0.3 + (i % 3) * 0.04)
    s.rotation.y = (Math.random() - 0.5) * 0.06
    g.add(s)
  }
  // a standing sleeve catching the key
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 0.05), foilMat())
  stand.position.set(-1.5, 0.55, 0.4)
  stand.rotation.y = 0.5
  g.add(stand)
  const standLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.8),
    new THREE.MeshStandardMaterial({ map: labelPlate(['EDITION No. 0401', 'NIGHT SHIFT', 'MIRA VOSS · 1998', '2000 NUMBERED'], { bg: '#0e1219', accent: '#E9CE7E' }), roughness: 0.6 })
  )
  standLabel.position.set(-1.5, 0.55, 0.43)
  standLabel.rotation.y = 0.5
  g.add(standLabel)

  const beam = makeBeam({
    from: new THREE.Vector3(1.8, 3.2, 1.4),
    to: new THREE.Vector3(0, 1.1, 0),
    r0: 0.14, r1: 1.3, color: 0xffa860, intensity: 1.4, slices: 18,
  })
  g.add(beam); R.beams.push(beam)

  const dust = makeDust(600, new THREE.Vector3(6, 4, 5), 0xffc890, 0.026)
  dust.position.set(0.4, 1.6, 0.4)
  g.add(dust); R.dust.push(dust)

  R.anim.push((t) => {
    // press cycle
    const c = (t * 0.35) % 1
    const down = smooth(clamp((c - 0.1) / 0.22)) * (1 - smooth(clamp((c - 0.45) / 0.22)))
    upper.position.y = lerp(1.7, 1.2, down)
    ram.position.y = lerp(2.5, 2.0, down)
    disc.material = disc.material
    disc.position.y = lerp(1.12, 1.08, down)
    disc.rotation.y = t * 0.6
  })

  R.grade = { warm: 0.6, lift: 0.1, exposure: 1.08, bloom: 0.6, vignette: 0.7 }
  R.fogColor = new THREE.Color(0x0a0806)
  R.fogDensity = 0.04
  return R
}

/* ============================================================
   5 · THE ARCHIVE — the feature: a corridor of five bays
   ============================================================ */
export interface BayRef {
  anchor: THREE.Vector3
  light: THREE.SpotLight
  obj: THREE.Group
}

export function buildArchiveSet(): SetRefs & { bays: BayRef[]; length: number; screen: THREE.Mesh } {
  const g = new THREE.Group()
  const R = refs(g) as SetRefs & { bays: BayRef[]; length: number; screen: THREE.Mesh }
  R.bays = []
  R.length = 42

  g.add(new THREE.HemisphereLight(0x1c2434, 0x080604, 0.4))

  // --- corridor shell ---
  const L = R.length
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.2, L + 12), floorMat(0x161a22))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -L / 2 + 2)
  g.add(floor)

  const wallM = concreteMat(0x35322e)
  const mkWall = (x: number, rotY: number) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L + 12, 5.6), wallM)
    w.rotation.y = rotY
    w.position.set(x, 2.8, -L / 2 + 2)
    g.add(w)
  }
  mkWall(-3.6, Math.PI / 2)
  mkWall(3.6, -Math.PI / 2)

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(7.2, L + 12), matteMat(0x0a0c10, 1))
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, 4.4, -L / 2 + 2)
  g.add(ceil)

  // ceiling strip lights — leading lines down the corridor
  for (let i = 0; i < 14; i++) {
    const z = 3 - i * 3.2
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 1.6), emissiveMat(0xffd6a0, 1.4))
    s.position.set(0, 4.34, z)
    g.add(s)
    const p = new THREE.PointLight(0xffc890, 1.6, 7, 2)
    p.position.set(0, 4.0, z)
    g.add(p)
    R.lights.push(p)
  }

  // --- the five bays ---
  const bayZ = (t: number) => 2.5 - t * (L - 6)

  const makePlinth = () => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.0, 0.7), concreteMat(0x2c2926))
    return p
  }

  // BAY 01 — the find: a film can + reel
  {
    const t = 0.02
    const z = bayZ(t)
    const grp = new THREE.Group()
    const plinth = makePlinth(); plinth.position.set(-2.3, 0.5, z); g.add(plinth)
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.13, 48), metalMat({ warm: true, rough: 0.45, color: 0x8a8074 }))
    can.rotation.x = Math.PI / 2
    can.position.set(-2.3, 1.12, z)
    grp.add(can)
    const label = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 48),
      new THREE.MeshStandardMaterial({ map: labelPlate(['BOX 1 OF 3', 'UNPRINTED', '16mm NEGATIVE', 'DO NOT PULL'], { bg: '#12161d', accent: '#C9A227' }), roughness: 0.8 })
    )
    label.rotation.x = -Math.PI / 2
    label.position.set(-2.3, 1.19, z)
    grp.add(label)
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48), matteMat(0x1a1512, 0.7))
    reel.rotation.x = Math.PI / 2
    reel.position.set(-2.05, 1.28, z + 0.1)
    reel.rotation.z = 0.3
    grp.add(reel)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 48), emissiveMat(0xffc070, 0.7))
    rim.position.copy(reel.position)
    grp.add(rim)
    g.add(grp)
    const light = new THREE.SpotLight(0xffd2a0, 40, 6, 0.34, 0.4, 1.4)
    light.position.set(-2.3, 3.2, z + 0.6)
    light.target.position.set(-2.3, 1.1, z)
    g.add(light, light.target); R.lights.push(light)
    R.bays.push({ anchor: new THREE.Vector3(-2.3, 1.5, z), light, obj: grp })
  }

  // BAY 02 — the gate: a scanner gate + strip
  {
    const t = 0.24
    const z = bayZ(t)
    const grp = new THREE.Group()
    const plinth = makePlinth(); plinth.position.set(2.3, 0.5, z); g.add(plinth)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.5), metalMat({ warm: false, rough: 0.35 }))
    body.position.set(2.3, 1.3, z)
    grp.add(body)
    const stripM = new THREE.MeshStandardMaterial({ map: filmStrip(), roughness: 0.5, emissive: 0x2a1c10, emissiveIntensity: 0.5 })
    stripM.map!.repeat.set(2, 1)
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), stripM)
    strip.position.set(2.3, 1.5, z + 0.28)
    grp.add(strip)
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), emissiveMat(0xbfe0ff, 3))
    gl.position.set(2.3, 1.5, z + 0.3)
    grp.add(gl)
    g.add(grp)
    const light = new THREE.SpotLight(0xbfd8f0, 34, 6, 0.34, 0.4, 1.4)
    light.position.set(2.3, 3.2, z + 0.6)
    light.target.position.set(2.3, 1.3, z)
    g.add(light, light.target); R.lights.push(light)
    R.bays.push({ anchor: new THREE.Vector3(2.3, 1.7, z), light, obj: grp })
    R.anim.push((t2, dt) => { stripM.map!.offset.x -= dt * 0.2 })
  }

  // BAY 03 — the bench: a grade monitor + colour chips
  {
    const t = 0.46
    const z = bayZ(t)
    const grp = new THREE.Group()
    const plinth = makePlinth(); plinth.position.set(-2.3, 0.5, z); g.add(plinth)
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), matteMat(0x101418, 0.7))
    mon.position.set(-2.3, 1.5, z)
    grp.add(mon)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.52),
      new THREE.MeshStandardMaterial({ map: screenFrame(7), emissive: 0xffffff, emissiveMap: screenFrame(7), emissiveIntensity: 1.2, color: 0x000000, roughness: 1 }))
    face.position.set(-2.3, 1.5, z + 0.04)
    grp.add(face)
    // colour chips
    const chipCols = [0xd8b465, 0x8fb4d8, 0xc4382c, 0xede7da]
    chipCols.forEach((c, i) => {
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), emissiveMat(c, 1.1))
      chip.position.set(-2.3 - 0.3 + i * 0.2, 1.08, z + 0.3)
      grp.add(chip)
    })
    g.add(grp)
    const light = new THREE.SpotLight(0xd0e0f4, 36, 6, 0.34, 0.4, 1.4)
    light.position.set(-2.3, 3.2, z + 0.6)
    light.target.position.set(-2.3, 1.3, z)
    g.add(light, light.target); R.lights.push(light)
    R.bays.push({ anchor: new THREE.Vector3(-2.3, 1.8, z), light, obj: grp })
  }

  // BAY 04 — the press: a disc + sleeve stack
  {
    const t = 0.68
    const z = bayZ(t)
    const grp = new THREE.Group()
    const plinth = makePlinth(); plinth.position.set(2.3, 0.5, z); g.add(plinth)
    const d = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.02, 48),
      new THREE.MeshStandardMaterial({ map: foil(), color: 0xd8c8a0, roughness: 0.18, metalness: 0.92, envMapIntensity: 2 })
    )
    d.rotation.x = Math.PI / 2
    d.position.set(2.3, 1.4, z)
    d.rotation.z = 0.4
    grp.add(d)
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.65), foilMat())
      s.position.set(2.3, 1.05 + i * 0.04, z + 0.02)
      s.rotation.y = (Math.random() - 0.5) * 0.08
      grp.add(s)
    }
    g.add(grp)
    const light = new THREE.SpotLight(0xffc890, 42, 6, 0.34, 0.4, 1.4)
    light.position.set(2.3, 3.2, z + 0.6)
    light.target.position.set(2.3, 1.2, z)
    g.add(light, light.target); R.lights.push(light)
    R.bays.push({ anchor: new THREE.Vector3(2.3, 1.6, z), light, obj: grp })
    R.anim.push((t2) => { d.rotation.z = 0.4 + t2 * 0.3 })
  }

  // BAY 05 — the screen: the corridor opens onto a small screen
  {
    const t = 0.92
    const z = bayZ(t)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.1, 0.14), matteMat(0x0b0c10, 0.8))
    frame.position.set(0, 2.0, z - 1.4)
    g.add(frame)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 2.6), screenMat())
    screen.position.set(0, 2.0, z - 1.32)
    g.add(screen)
    R.screen = screen
    const spill = makeLightPool(2.6, 0x8fb0d0, 0.14)
    spill.position.set(0, 0.02, z + 0.6)
    g.add(spill)
    const beam = makeBeam({
      from: new THREE.Vector3(0, 3.2, z + 3.4),
      to: new THREE.Vector3(0, 2.0, z - 1.3),
      r0: 0.12, r1: 2.1, color: 0xffe6bc, intensity: 1.0, slices: 18,
    })
    g.add(beam); R.beams.push(beam)
    R.bays.push({ anchor: new THREE.Vector3(0, 2.3, z - 1.2), light: null as unknown as THREE.SpotLight, obj: new THREE.Group() })
  }

  // dust down the whole corridor
  const dust = makeDust(1600, new THREE.Vector3(6, 4, R.length + 8), 0xffe0b4, 0.024)
  dust.position.set(0, 2.2, -R.length / 2 + 2)
  g.add(dust); R.dust.push(dust)

  // end cap behind the camera — so the corridor has a back
  const endCap = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5.6), concreteMat(0x232018))
  endCap.position.set(0, 2.8, 4.4)
  endCap.rotation.y = Math.PI
  g.add(endCap)

  R.anim.push((t2) => {
    for (const b of R.bays) {
      if (!b.light) continue
      b.light.intensity = 38 + Math.sin(t2 * 1.3 + b.anchor.z) * 5
    }
  })

  R.grade = { warm: 0.4, lift: 0.18, exposure: 1.06, bloom: 0.5, vignette: 0.64 }
  R.fogColor = new THREE.Color(0x05070c)
  R.fogDensity = 0.045
  return R
}

export { fbm1 }