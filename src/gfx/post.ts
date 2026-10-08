/* ============================================================
   post — the lab work. HDR bloom, halation, gate weave, grain,
   chromatic aberration, grade, letterbox. One composite pass.
   ============================================================ */

import * as THREE from 'three'
import type { Quality } from '../core/device'

const VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BRIGHT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = uKnee;
  float soft = clamp(l - uThreshold + k, 0.0, 2.0 * k);
  soft = soft * soft / (4.0 * k + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`

const BLUR = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;      // texel * radius
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  s += texture2D(tSrc, vUv + o1).rgb * 0.3162162162;
  s += texture2D(tSrc, vUv - o1).rgb * 0.3162162162;
  s += texture2D(tSrc, vUv + o2).rgb * 0.0702702703;
  s += texture2D(tSrc, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tBloomA;   // tight
uniform sampler2D tBloomB;   // wide / halation
uniform vec2  uRes;
uniform float uTime;

uniform float uExposure;
uniform float uBloom;
uniform float uHalation;
uniform float uGrain;
uniform float uVignette;
uniform float uChroma;
uniform float uWeave;
uniform float uFlicker;
uniform float uLetterbox;
uniform float uScan;
uniform float uFade;        // 0 = image, 1 = black
uniform float uFlash;       // 0 = normal, 1 = white
uniform float uDamage;      // vertical scratches / gate dirt
uniform float uWarm;        // colour grade temperature
uniform float uLift;
uniform float uSoft;        // soft-focus diffusion

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Narkowicz ACES-ish
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUv;

  // ---- gate weave: the frame never sits perfectly still ----
  float wob = uWeave;
  uv.x += (hash21(vec2(floor(uTime * 24.0), 1.0)) - 0.5) * 0.0016 * wob;
  uv.y += (hash21(vec2(floor(uTime * 24.0), 7.0)) - 0.5) * 0.0026 * wob;

  // ---- very slight barrel (CRT / anamorphic-ish) ----
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + r2 * 0.026);

  // ---- chromatic aberration, radial ----
  float ca = uChroma * (0.0016 + r2 * 0.0065);
  vec3 col;
  col.r = texture2D(tScene, uv + cc * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - cc * ca).b;

  // ---- soft-focus diffusion (halation of the base image) ----
  if (uSoft > 0.001) {
    vec3 blur = vec3(0.0);
    blur += texture2D(tScene, uv + vec2( 0.0018,  0.0012)).rgb;
    blur += texture2D(tScene, uv + vec2(-0.0018, -0.0012)).rgb;
    blur += texture2D(tScene, uv + vec2( 0.0012, -0.0018)).rgb;
    blur += texture2D(tScene, uv + vec2(-0.0012,  0.0018)).rgb;
    blur *= 0.25;
    col = mix(col, max(col, blur), 0.34 * uSoft);
  }

  // ---- bloom + halation ----
  vec3 bA = texture2D(tBloomA, uv).rgb;
  vec3 bB = texture2D(tBloomB, uv).rgb;
  // halation bleeds red further than blue — film stock behaviour
  vec3 hal = vec3(bB.r * 1.35, bB.g * 0.86, bB.b * 0.52);
  col += bA * uBloom;
  col += hal * uHalation;

  // ---- gate dirt / vertical damage streaks ----
  if (uDamage > 0.001) {
    float band = floor(uv.x * 220.0);
    float on = step(0.982, hash21(vec2(band, floor(uTime * 6.0))));
    float streak = on * (0.35 + 0.65 * hash21(vec2(band, 3.0)));
    col += vec3(streak * 0.16) * uDamage;
  }

  // ---- grade: temperature, lift, contrast ----
  col *= mix(vec3(1.0), vec3(1.075, 1.0, 0.905), uWarm);
  col += uLift * vec3(0.020, 0.026, 0.042);
  float l = luma(col);
  col = mix(vec3(l), col, 1.08);

  // ---- projector flicker (very small, 24fps-ish) ----
  float fl = 1.0 + (hash11(floor(uTime * 24.0)) - 0.5) * 0.030 * uFlicker;
  col *= fl;

  // ---- exposure + filmic tone ----
  col = aces(col * uExposure);

  // ---- vignette ----
  float vig = smoothstep(1.28, 0.24, length(cc * vec2(1.06, 1.0)));
  col *= mix(1.0, vig, uVignette);

  // ---- grain (luminance-weighted, animated) ----
  if (uGrain > 0.001) {
    float g = hash21(uv * uRes + fract(uTime) * 331.7) - 0.5;
    float lg = mix(0.35, 1.0, 1.0 - luma(col));
    col += g * uGrain * lg;
  }

  // ---- scanline / aperture grille (delicate) ----
  if (uScan > 0.001) {
    float s = sin(vUv.y * uRes.y * 1.5708) * 0.5 + 0.5;
    col *= 1.0 - s * 0.052 * uScan;
  }

  // ---- letterbox ----
  float lb = uLetterbox;
  if (lb > 0.001) {
    float bar = smoothstep(0.0, 0.0015, vUv.y - lb * 0.5) * smoothstep(0.0, 0.0015, (1.0 - lb * 0.5) - vUv.y);
    col *= mix(1.0, bar, 1.0);
  }

  // ---- fades ----
  col = mix(col, vec3(0.0), clamp(uFade, 0.0, 1.0));
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`

export class Post {
  readonly sceneRT: THREE.WebGLRenderTarget
  private brightRT: THREE.WebGLRenderTarget
  private aRT: THREE.WebGLRenderTarget
  private bRT: THREE.WebGLRenderTarget
  private cRT: THREE.WebGLRenderTarget
  private dRT: THREE.WebGLRenderTarget

  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh
  private brightMat: THREE.ShaderMaterial
  private blurMat: THREE.ShaderMaterial
  private compMat: THREE.ShaderMaterial
  private scene = new THREE.Scene()

  private w = 1
  private h = 1
  private scale = 1

  constructor(renderer: THREE.WebGLRenderer) {
    const dpr = renderer.getPixelRatio()
    void dpr

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    }
    const rtOptsNoDepth: THREE.RenderTargetOptions = { ...rtOpts, depthBuffer: false }

    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, rtOpts)
    this.brightRT = new THREE.WebGLRenderTarget(2, 2, rtOptsNoDepth)
    this.aRT = new THREE.WebGLRenderTarget(2, 2, rtOptsNoDepth)
    this.bRT = new THREE.WebGLRenderTarget(2, 2, rtOptsNoDepth)
    this.cRT = new THREE.WebGLRenderTarget(2, 2, rtOptsNoDepth)
    this.dRT = new THREE.WebGLRenderTarget(2, 2, rtOptsNoDepth)

    for (const rt of [this.sceneRT, this.brightRT, this.aRT, this.bRT, this.cRT, this.dRT]) {
      rt.texture.colorSpace = THREE.NoColorSpace
    }

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BRIGHT, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: this.sceneRT.texture }, uThreshold: { value: 0.72 }, uKnee: { value: 0.42 } },
    })
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    })
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tBloomA: { value: this.dRT.texture },
        tBloomB: { value: this.bRT.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uExposure: { value: 1.06 },
        uBloom: { value: 0.52 },
        uHalation: { value: 0.34 },
        uGrain: { value: 0.030 },
        uVignette: { value: 0.62 },
        uChroma: { value: 1.0 },
        uWeave: { value: 1.0 },
        uFlicker: { value: 1.0 },
        uLetterbox: { value: 0.0 },
        uScan: { value: 0.5 },
        uFade: { value: 0 },
        uFlash: { value: 0 },
        uDamage: { value: 0.22 },
        uWarm: { value: 0.34 },
        uLift: { value: 0.22 },
        uSoft: { value: 1.0 },
      },
    })

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brightMat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  get u() { return this.compMat.uniforms }

  setQuality(q: Quality) {
    this.u.uGrain.value = q.grain ? 0.030 : 0.012
    this.u.uSoft.value = q.softFocus ? 1.0 : 0.0
    this.u.uScan.value = q.tier === 'low' ? 0.22 : 0.42
    this.u.uDamage.value = q.tier === 'low' ? 0.10 : 0.22
    this.u.uVignette.value = q.tier === 'low' ? 0.5 : 0.62
  }

  setSize(w: number, h: number, scale: number) {
    this.w = Math.max(2, Math.floor(w))
    this.h = Math.max(2, Math.floor(h))
    this.scale = scale
    const sw = Math.max(2, Math.floor(this.w * scale))
    const sh = Math.max(2, Math.floor(this.h * scale))

    this.sceneRT.setSize(sw, sh)
    const h2 = [Math.max(2, sw >> 1), Math.max(2, sh >> 1)]
    const h4 = [Math.max(2, sw >> 2), Math.max(2, sh >> 2)]
    this.brightRT.setSize(h2[0], h2[1])
    this.aRT.setSize(h2[0], h2[1])
    this.bRT.setSize(h2[0], h2[1])
    this.cRT.setSize(h4[0], h4[1])
    this.dRT.setSize(h4[0], h4[1])
    ;(this.compMat.uniforms.uRes.value as THREE.Vector2).set(sw, sh)
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, renderer: THREE.WebGLRenderer) {
    this.quad.material = mat
    renderer.setRenderTarget(target)
    renderer.clear(true, true, true)
    renderer.render(this.scene, this.cam)
  }

  render(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, time: number, passes: number) {
    // 1 — scene
    renderer.setRenderTarget(this.sceneRT)
    renderer.clear(true, true, true)
    renderer.render(scene, camera)

    // 2 — bright pass
    this.brightMat.uniforms.tSrc.value = this.sceneRT.texture
    this.blit(this.brightMat, this.aRT, renderer)

    // 3 — tight bloom (half res, 1 pair)
    this.blurMat.uniforms.tSrc.value = this.aRT.texture
    ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1.6 / this.aRT.width, 0)
    this.blit(this.blurMat, this.bRT, renderer)
    this.blurMat.uniforms.tSrc.value = this.bRT.texture
    ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1.6 / this.aRT.height)
    this.blit(this.blurMat, this.aRT, renderer)

    // 4 — wide bloom (quarter res) → the halation
    this.blurMat.uniforms.tSrc.value = this.aRT.texture
    ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(2.2 / this.cRT.width, 0)
    this.blit(this.blurMat, this.cRT, renderer)
    this.blurMat.uniforms.tSrc.value = this.cRT.texture
    ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 2.2 / this.cRT.height)
    this.blit(this.blurMat, this.dRT, renderer)

    if (passes > 1) {
      this.blurMat.uniforms.tSrc.value = this.dRT.texture
      ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(3.4 / this.cRT.width, 0)
      this.blit(this.blurMat, this.cRT, renderer)
      this.blurMat.uniforms.tSrc.value = this.cRT.texture
      ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 3.4 / this.cRT.height)
      this.blit(this.blurMat, this.dRT, renderer)
      this.blurMat.uniforms.tSrc.value = this.dRT.texture
      ;(this.blurMat.uniforms.uDir.value as THREE.Vector2).set(4.6 / this.bRT.width, 0)
      this.blit(this.blurMat, this.bRT, renderer)
    }

    // 5 — composite
    this.compMat.uniforms.tBloomA.value = this.aRT.texture
    this.compMat.uniforms.tBloomB.value = passes > 1 ? this.dRT.texture : this.aRT.texture
    this.compMat.uniforms.uTime.value = time
    this.quad.material = this.compMat
    renderer.setRenderTarget(null)
    renderer.clear(true, true, true)
    renderer.render(this.scene, this.cam)
  }

  dispose() {
    for (const rt of [this.sceneRT, this.brightRT, this.aRT, this.bRT, this.cRT, this.dRT]) rt.dispose()
    this.brightMat.dispose(); this.blurMat.dispose(); this.compMat.dispose()
    ;(this.quad.geometry as THREE.BufferGeometry).dispose()
  }
}
