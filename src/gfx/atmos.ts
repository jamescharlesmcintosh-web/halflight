/* ============================================================
   atmos — volumetrics, dust, materials, light helpers
   ============================================================ */

import * as THREE from 'three'
import { dustSprite, glowSprite, brushedMetal, concrete, asphalt, velvet, foil, beamMask, emulsion, noiseTile, screenFrame } from './textures'

export interface BeamOpts {
  from: THREE.Vector3
  to: THREE.Vector3
  r0: number
  r1: number
  color: THREE.ColorRepresentation
  intensity?: number
  slices?: number
  length?: number
}

/**
 * A projector beam built from stacked, camera-facing soft slices.
 * Cheap, additive, and reads as genuine volumetric light once dust
 * is moving through it.
 */
export function makeBeam(opts: BeamOpts) {
  const {
    from, to, r0, r1,
    color,
    intensity = 1,
    slices = 22,
  } = opts

  const g = new THREE.Group()
  g.name = 'beam'
  const mask = beamMask()
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  dir.normalize()

  // orient the group along from → to
  g.position.copy(from)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.quaternion.copy(q)

  const col = new THREE.Color(color)
  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices
    const r = THREE.MathUtils.lerp(r0, r1, t * t * 0.72 + t * 0.28)
    const m = new THREE.MeshBasicMaterial({
      map: mask,
      color: col,
      transparent: true,
      opacity: (1 - t * 0.72) * 0.072 * intensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4), m)
    p.position.y = t * len
    p.rotation.x = Math.PI / 2
    p.renderOrder = 4
    p.userData.baseOpacity = m.opacity
    p.userData.t = t
    g.add(p)
  }
  g.userData.len = len
  return g
}

/** Soft, slow shimmer along the beam — call every frame. */
export function animateBeam(beam: THREE.Object3D, time: number, flicker = 1) {
  for (const c of beam.children) {
    const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial
    const base = (c.userData.baseOpacity as number) ?? 0.05
    const t = (c.userData.t as number) ?? 0
    const n = 0.82 + 0.18 * Math.sin(time * 3.1 + t * 9.0) * Math.sin(time * 1.7 + t * 4.0)
    const fl = 1 + (Math.sin(time * 27.0) * 0.5 + Math.sin(time * 13.7)) * 0.03 * flicker
    m.opacity = base * n * fl
    c.lookAt(c.parent!.localToWorld(new THREE.Vector3(0, 0, 10)))
  }
}

/** Dust motes drifting in a box. Additive points. */
export function makeDust(count: number, bounds: THREE.Vector3, color: THREE.ColorRepresentation = 0xffe2b0, size = 0.03) {
  const pos = new Float32Array(count * 3)
  const rnd = new Float32Array(count * 3) // speed + phase + scale
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * bounds.x
    pos[i * 3 + 1] = (Math.random() - 0.5) * bounds.y
    pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z
    rnd[i * 3] = 0.2 + Math.random() * 0.8
    rnd[i * 3 + 1] = Math.random() * 100
    rnd[i * 3 + 2] = 0.4 + Math.random() * 1.4
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3))
  const mat = new THREE.PointsMaterial({
    map: dustSprite(),
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.userData.base = pos.slice()
  pts.userData.bounds = bounds.clone()
  pts.frustumCulled = false
  return pts
}

export function animateDust(pts: THREE.Points, time: number, drift = 1) {
  const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute
  const base = pts.userData.base as Float32Array
  const rnd = pts.geometry.getAttribute('aRnd') as THREE.BufferAttribute
  const b = pts.userData.bounds as THREE.Vector3
  const a = attr.array as Float32Array
  for (let i = 0; i < attr.count; i++) {
    const sp = rnd.getX(i), ph = rnd.getY(i)
    const k = i * 3
    a[k]     = base[k]     + Math.sin(time * 0.23 * sp + ph) * 0.34 * drift
    a[k + 1] = base[k + 1] + Math.sin(time * 0.17 * sp + ph * 1.7) * 0.42 * drift + (time * 0.028 * sp * drift) % b.y - b.y * 0.0
    a[k + 2] = base[k + 2] + Math.cos(time * 0.21 * sp + ph) * 0.30 * drift
    // wrap Y slowly
    if (a[k + 1] > b.y * 0.5) a[k + 1] -= b.y
  }
  attr.needsUpdate = true
}

/** A wide, soft atmospheric haze card. */
export function makeHaze(color: THREE.ColorRepresentation, w: number, h: number, opacity = 0.1) {
  const m = new THREE.MeshBasicMaterial({
    map: glowSprite(0.0, 0.3),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  mesh.renderOrder = 3
  return mesh
}

/** A pool of light on the floor. */
export function makeLightPool(r: number, color: THREE.ColorRepresentation, opacity = 0.4) {
  const m = new THREE.MeshBasicMaterial({
    map: glowSprite(0.0, 0.26),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), m)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 2
  return mesh
}

/* ---------------- shared materials ---------------- */

export function metalMat(opts: { warm?: boolean; rough?: number; metal?: number; color?: THREE.ColorRepresentation } = {}) {
  return new THREE.MeshStandardMaterial({
    map: brushedMetal(opts.warm ? 3 : 4, opts.warm ?? false),
    color: opts.color ?? (opts.warm ? 0xb99a68 : 0x9aa3b2),
    roughness: opts.rough ?? 0.34,
    metalness: opts.metal ?? 0.92,
    envMapIntensity: 1.25,
  })
}

export function matteMat(color: THREE.ColorRepresentation, rough = 0.86) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 })
}

export function concreteMat(tint = 0x6a6a6a) {
  return new THREE.MeshStandardMaterial({
    map: concrete(),
    color: tint,
    roughness: 0.94,
    metalness: 0.0,
  })
}

export function floorMat(tint: 0x1a1e26 | number = 0x1a1e26) {
  return new THREE.MeshStandardMaterial({
    map: asphalt(),
    color: tint,
    roughness: 0.28,
    metalness: 0.22,
    envMapIntensity: 1.6,
  })
}

export function velvetMat(tint: THREE.ColorRepresentation = 0x3a1218) {
  return new THREE.MeshStandardMaterial({ map: velvet(21, [58, 16, 22]), color: tint, roughness: 0.98, metalness: 0 })
}

export function foilMat() {
  return new THREE.MeshStandardMaterial({
    map: foil(),
    color: 0xd8b465,
    roughness: 0.28,
    metalness: 0.86,
    envMapIntensity: 1.6,
  })
}

export function emulsionMat() {
  return new THREE.MeshStandardMaterial({
    map: emulsion(2, 0.8),
    roughness: 0.6,
    metalness: 0,
    transparent: true,
    opacity: 0.94,
  })
}

export function emissiveMat(color: THREE.ColorRepresentation, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color: 0x05060a,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 1,
    metalness: 0,
    toneMapped: true,
  })
}

export function glassMat(color: THREE.ColorRepresentation = 0xbfd4e4) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.06,
    transmission: 0.86,
    thickness: 0.4,
    ior: 1.5,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.8,
  })
}

export function screenMat() {
  return new THREE.MeshStandardMaterial({
    map: screenFrame(),
    emissive: 0xffffff,
    emissiveMap: screenFrame(),
    emissiveIntensity: 1.15,
    color: 0x000000,
    roughness: 1,
    metalness: 0,
    toneMapped: true,
  })
}

export function noiseMat(scale = 1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      tN: { value: noiseTile(128) },
      uTime: { value: 0 },
      uScale: { value: scale },
      uColor: { value: new THREE.Color(0xffd9a0) },
      uOpacity: { value: 0.3 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D tN;
      uniform float uTime, uScale, uOpacity;
      uniform vec3 uColor;
      void main(){
        float n = texture2D(tN, vUv * uScale + vec2(uTime * 0.013, -uTime * 0.021)).r;
        float n2 = texture2D(tN, vUv * uScale * 2.1 - vec2(uTime * 0.017, uTime * 0.009)).r;
        float a = n * n2 * uOpacity;
        float edge = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.7, vUv.y)
                   * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(uColor, a * edge);
      }
    `,
  })
}

/* ---------------- a tiny studio environment for reflections ---------------- */
export function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#1b2233')
  g.addColorStop(0.35, '#2a2a34')
  g.addColorStop(0.52, '#3a2c1c')
  g.addColorStop(0.62, '#1a140e')
  g.addColorStop(1, '#05070a')
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
  // a couple of practicals — soft key + cold fill
  const k = ctx.createRadialGradient(S * 0.28, S * 0.34, 2, S * 0.28, S * 0.34, S * 0.32)
  k.addColorStop(0, 'rgba(255,214,150,1)'); k.addColorStop(1, 'rgba(255,214,150,0)')
  ctx.fillStyle = k; ctx.fillRect(0, 0, S, S)
  const f = ctx.createRadialGradient(S * 0.78, S * 0.28, 2, S * 0.78, S * 0.28, S * 0.24)
  f.addColorStop(0, 'rgba(150,190,230,0.9)'); f.addColorStop(1, 'rgba(150,190,230,0)')
  ctx.fillStyle = f; ctx.fillRect(0, 0, S, S)

  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(t).texture
  pmrem.dispose()
  t.dispose()
  return env
}