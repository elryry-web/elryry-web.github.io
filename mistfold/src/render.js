// Renderer + illustrated post pass (light brush smear, ink outlines from depth, hatching, paper grain, grading).
// Pixels from a land's painting arrive with alpha 0 and only get the grade, never the brush or the pen.
import * as THREE from 'three';

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float depthRange;
uniform vec2 resolution;
uniform float time;
uniform float painterly;
uniform vec3 shadowTint;
uniform vec3 lightTint;
uniform float fade;
uniform vec3 fadeColor;
uniform float flash;
// 0 plays; 1 the colour guide, 2 the line guide, 3 depth packed into red and green (see paint.js)
uniform float captureMode;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

vec3 kuwahara(vec2 uv, vec2 px) {
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  // wobble the sampling grid a little so strokes don't align to pixels
  float a = vnoise(uv * resolution * 0.02) * 6.2831;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  for (int j = 0; j <= 2; j++) {
    for (int i = 0; i <= 2; i++) {
      vec2 o = rot * vec2(float(i), float(j)) * px;
      vec3 c;
      c = texture2D(tDiffuse, uv + vec2(-o.x, -o.y)).rgb; m0 += c; s0 += c * c;
      c = texture2D(tDiffuse, uv + vec2( o.x, -o.y)).rgb; m1 += c; s1 += c * c;
      c = texture2D(tDiffuse, uv + vec2( o.x,  o.y)).rgb; m2 += c; s2 += c * c;
      c = texture2D(tDiffuse, uv + vec2(-o.x,  o.y)).rgb; m3 += c; s3 += c * c;
    }
  }
  float n = 9.0;
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  float v0 = dot(abs(s0 / n - m0 * m0), vec3(1.0));
  float v1 = dot(abs(s1 / n - m1 * m1), vec3(1.0));
  float v2 = dot(abs(s2 / n - m2 * m2), vec3(1.0));
  float v3 = dot(abs(s3 / n - m3 * m3), vec3(1.0));
  vec3 r = m0; float mv = v0;
  if (v1 < mv) { mv = v1; r = m1; }
  if (v2 < mv) { mv = v2; r = m2; }
  if (v3 < mv) { mv = v3; r = m3; }
  return r;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float dep(vec2 uv) { return texture2D(tDepth, uv).r * depthRange; }
// ink on the near side of a depth step: silhouettes against whatever is behind
float silhouette(vec2 uv, vec2 o) {
  float d0 = dep(uv);
  float s = dep(uv + vec2(o.x, 0.0)) + dep(uv - vec2(o.x, 0.0)) + dep(uv + vec2(0.0, o.y)) + dep(uv - vec2(0.0, o.y)) - 4.0 * d0;
  float s2 = dep(uv + o) + dep(uv - o) + dep(uv + vec2(o.x, -o.y)) + dep(uv - vec2(o.x, -o.y)) - 4.0 * d0;
  return smoothstep(0.5, 1.2, max(s, s2 * 0.7));
}

void main() {
  vec2 px = 1.0 / resolution;
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 base = src.rgb;
  vec3 col = base;
  float ink = 0.0;
  // how much of this pixel is the 3D world rather than the painting
  float live = clamp(src.a, 0.0, 1.0);
  if (captureMode > 2.5) {
    float d = texture2D(tDepth, vUv).r * 65535.0;
    gl_FragColor = vec4(floor(d / 256.0) / 255.0, mod(floor(d), 256.0) / 255.0, 0.0, 1.0);
    return;
  }
  if (painterly > 0.5 || captureMode > 1.5) {
    col = mix(base, kuwahara(vUv, px), live);
    // the pen wobbles a little
    vec2 wob = (vec2(vnoise(vUv * resolution * 0.05), vnoise(vUv * resolution * 0.05 + 9.0)) - 0.5) * px * 1.2;
    vec2 o = px * 1.25;
    ink = silhouette(vUv + wob, o);
    // creases and colour boundaries, from the raw image
    float l = luma(texture2D(tDiffuse, vUv + wob + vec2(o.x, 0.0)).rgb) - luma(texture2D(tDiffuse, vUv + wob - vec2(o.x, 0.0)).rgb);
    float l2 = luma(texture2D(tDiffuse, vUv + wob + vec2(0.0, o.y)).rgb) - luma(texture2D(tDiffuse, vUv + wob - vec2(0.0, o.y)).rgb);
    ink = max(ink, smoothstep(0.1, 0.3, length(vec2(l, l2))) * 0.55) * live;
  }
  if (captureMode > 1.5) { gl_FragColor = vec4(vec3(clamp(ink, 0.0, 1.0)), 1.0); return; }
  // pigment pooling: subtle darkening on low-frequency noise, like wet paper drying unevenly
  float pool = vnoise(vUv * resolution * 0.006 + 3.1) * 0.6 + vnoise(vUv * resolution * 0.02) * 0.4;
  col *= 0.94 + 0.1 * pool;
  // grading: shadows lean to tint, highlights warm
  float L = luma(col);
  col = mix(col, col * shadowTint * 1.6, (1.0 - smoothstep(0.0, 0.55, L)) * 0.35);
  col = mix(col, col * lightTint * 1.15, smoothstep(0.55, 1.0, L) * 0.3);
  // storybook colour: richer saturation and a gentle S-curve
  col = mix(vec3(L), col, 1.06);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
  // cross-hatching where the shadows are deepest
  vec2 fc = gl_FragCoord.xy;
  float dark = 1.0 - smoothstep(0.08, 0.3, L);
  float h1 = 1.0 - smoothstep(0.1, 0.3, abs(fract((fc.x + fc.y) * 0.16) - 0.5));
  float h2 = 1.0 - smoothstep(0.1, 0.3, abs(fract((fc.x - fc.y) * 0.16) - 0.5));
  col *= 1.0 - (h1 * smoothstep(0.0, 0.5, dark) + h2 * smoothstep(0.5, 1.0, dark)) * 0.22 * painterly * live;
  // the ink itself: warm sepia-black
  col = mix(col, vec3(0.13, 0.08, 0.06), clamp(ink, 0.0, 1.0) * 0.88);
  if (captureMode > 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  // paper grain + fibres
  float g = hash(floor(vUv * resolution) + floor(time * 8.0) * 0.0) - 0.5;
  float fib = vnoise(vec2(vUv.x * resolution.x * 0.5, vUv.y * resolution.y * 0.06)) - 0.5;
  col += g * 0.035 + fib * 0.02;
  // vignette
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(q * vec2(1.0, 1.15)));
  col *= mix(vec3(0.62, 0.55, 0.6), vec3(1.0), vig);
  col = mix(col, vec3(1.0, 0.98, 0.9), flash);
  // fade with a paper-ish ragged threshold
  float rag = vnoise(vUv * 9.0) * 0.25;
  float f = smoothstep(0.0, 1.0, clamp(fade * 1.25 - rag + (length(q) * 0.3), 0.0, 1.0));
  col = mix(col, fadeColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    // the camera is orthographic, so depth is linear and the ink pass can read it in world units
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        depthRange: { value: 600 },
        resolution: { value: new THREE.Vector2(4, 4) },
        time: { value: 0 },
        painterly: { value: 1 },
        shadowTint: { value: new THREE.Color(0.55, 0.5, 0.78) },
        lightTint: { value: new THREE.Color(1.0, 0.93, 0.8) },
        fade: { value: 0 },
        fadeColor: { value: new THREE.Color(0.95, 0.91, 0.82) },
        flash: { value: 0 },
        captureMode: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  get painterly() { return this.post.uniforms.painterly.value > 0.5; }
  set painterly(v) { this.post.uniforms.painterly.value = v ? 1 : 0; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const pw = Math.floor(w * this.pixelRatio), ph = Math.floor(h * this.pixelRatio);
    this.rt.setSize(pw, ph);
    this.post.uniforms.resolution.value.set(pw, ph);
    this.aspect = w / h;
    if (this.onResize) this.onResize(this.aspect);
  }
  // tints are raw sRGB multipliers, so skip colour management
  setGrade(shadow, light) {
    const raw = (c, hex) => { c.r = ((hex >> 16) & 255) / 255; c.g = ((hex >> 8) & 255) / 255; c.b = (hex & 255) / 255; };
    raw(this.post.uniforms.shadowTint.value, shadow);
    raw(this.post.uniforms.lightTint.value, light);
  }
  render(scene, camera, t) {
    this.post.uniforms.time.value = t;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}

// Fixed isometric orthographic camera that eases toward a target.
export class IsoCamera {
  constructor(viewSize = 22) {
    this.viewSize = viewSize;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.offset = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.shake = 0;
    this.zoom = 1;
    this.zoomGoal = 1;
    this.setAspect(window.innerWidth / window.innerHeight);
  }
  setAspect(a) {
    this.aspect = a;
    const h = this.viewSize / this.zoom, w = h * a;
    this.cam.left = -w / 2; this.cam.right = w / 2; this.cam.top = h / 2; this.cam.bottom = -h / 2;
    this.cam.updateProjectionMatrix();
  }
  snap(v) { this.target.copy(v); this.goal.copy(v); this.apply(0); }
  update(dt) {
    this.target.lerp(this.goal, 1 - Math.pow(0.0025, dt));
    if (Math.abs(this.zoom - this.zoomGoal) > 0.001) {
      this.zoom += (this.zoomGoal - this.zoom) * (1 - Math.pow(0.02, dt));
      this.setAspect(this.aspect);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.apply(this.shake);
  }
  apply(sh) {
    const s = sh * sh * 0.6;
    this.cam.position.copy(this.target).add(this.offset);
    this.cam.position.x += (Math.random() - 0.5) * s;
    this.cam.position.y += (Math.random() - 0.5) * s;
    this.cam.lookAt(this.target.x + (Math.random() - 0.5) * s * 0.3, this.target.y, this.target.z);
  }
  // camera-relative movement axes on the ground plane
  axes() {
    const fwd = new THREE.Vector3(-this.offset.x, 0, -this.offset.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }
}
