// Everything you see is built here from primitives: vertex-painted, merged, and a little crooked on purpose.
import * as THREE from 'three';
import { fbm, mulberry32 } from './util.js';
import { stylize, TEX } from './style.js';

// ---------- shared materials & textures ----------
export const VC = stylize(new THREE.MeshLambertMaterial({ vertexColors: true }));
const matCache = new Map();
export function basic(color, opts = {}) {
  const key = 'b' + color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  return matCache.get(key);
}
export function lambert(color, opts = {}) {
  const key = 'l' + color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

let _dot;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
export function glow(color, size = 1, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// ---------- geometry helpers ----------
const LIGHT = new THREE.Vector3(-0.4, 1, 0.3).normalize();
export function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  m.compose(new THREE.Vector3(...p), q, sc);
  geo.applyMatrix4(m);
  return geo;
}
// Paint vertex colours: cool shadowed undersides, warm tops, mottled noise.
export function paint(geo, color, { jitter = 0.09, cool = 0.35, seed = 0, top = 0.12, nscale = 1.7, tex = 'plain' } = {}) {
  const c = new THREE.Color(color);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const cols = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(n.getX(i), n.getY(i), n.getZ(i));
    const d = v.dot(LIGHT) * 0.5 + 0.5;
    const nz = fbm(pos.getX(i) * nscale + seed, pos.getZ(i) * nscale + pos.getY(i) * nscale * 0.7 - seed, 2);
    const k = 1 + nz * jitter * 2.2;
    let r = c.r * k, g = c.g * k, b = c.b * k;
    // shadow side drifts toward violet-blue, light side toward warm cream
    const sh = (1 - d) * cool;
    r = r * (1 - sh) + r * 0.62 * sh; g = g * (1 - sh) + g * 0.7 * sh; b = b * (1 - sh) + Math.min(1, b * 1.05 + 0.06) * sh;
    const tp = Math.max(0, d - 0.6) * top * 2.5;
    r += tp * 0.9; g += tp * 0.8; b += tp * 0.5;
    cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const st = new Float32Array(pos.count * 2), kind = TEX[tex] ?? 0, sd = (seed * 7.31) % 50;
  for (let i = 0; i < pos.count; i++) { st[i * 2] = kind; st[i * 2 + 1] = sd; }
  geo.setAttribute('style', new THREE.BufferAttribute(st, 2));
  return geo;
}
// Merge painted geometries into one (non-indexed) buffer.
export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), sty = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    if (g.attributes.style) sty.set(g.attributes.style.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('style', new THREE.BufferAttribute(sty, 2));
  out.computeBoundingSphere();
  return out;
}
export function vmesh(geos, { shadow = true, receive = true } = {}) {
  const geo = Array.isArray(geos) ? merge(geos) : geos;
  if (!geo.attributes.style) geo.setAttribute('style', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const m = new THREE.Mesh(geo, VC);
  m.castShadow = shadow; m.receiveShadow = receive;
  return m;
}
// A lumpy, organic sphere.
export function blobGeo(r, seed = 0, wob = 0.22, w = 10, h = 8) {
  const g = new THREE.SphereGeometry(r, w, h);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + fbm(x * 1.3 + seed, z * 1.3 + y * 0.9 - seed, 2) * wob * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 8) => new THREE.ConeGeometry(r, h, s),
  sph: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  tor: (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
};
export { G };
const P = (geo, color, o) => paint(geo, color, o);

// ---------- flora ----------
export function makeTree(rng, { kind = 'round', leaf = 0x6f9a52, trunk = 0x6b4a36, size = 1, fruit = null, fruitGlow = false } = {}) {
  const parts = [];
  const seed = rng() * 100;
  const s = size * (0.68 + rng() * 0.4);
  const lean = (rng() - 0.5) * 0.18;
  const group = new THREE.Group();
  if (kind === 'pine') {
    parts.push(P(xf(G.cyl(0.12, 0.2, 1.2, 6), [0, 0.6, 0]), trunk, { tex: 'bark' }));
    for (let i = 0; i < 3; i++) {
      const r = (1.25 - i * 0.32) * s, y = (1.1 + i * 0.85) * s;
      parts.push(P(xf(G.cone(r, 1.5 * s, 7), [0, y, 0], [0, rng() * 3, 0]), leaf, { seed: seed + i, jitter: 0.12, tex: 'leaf' }));
    }
  } else if (kind === 'willow') {
    parts.push(P(xf(G.cyl(0.18, 0.34, 2.2 * s, 7), [0, 1.1 * s, 0], [lean, 0, lean]), trunk, { tex: 'bark' }));
    parts.push(P(xf(blobGeo(1.5 * s, seed, 0.25), [0, 2.6 * s, 0], [0, 0, 0], [1.2, 0.7, 1.2]), leaf, { seed, tex: 'leaf' }));
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.3;
      const rr = 1.3 * s + rng() * 0.4;
      const len = (1.4 + rng() * 1.0) * s;
      parts.push(P(xf(G.cone(0.22 * s, len, 4), [Math.cos(a) * rr, 2.45 * s - len / 2, Math.sin(a) * rr], [Math.PI, 0, 0]), leaf, { seed: seed + i, cool: 0.5, tex: 'leaf' }));
    }
  } else if (kind === 'dead') {
    parts.push(P(xf(G.cyl(0.1, 0.25, 2.2 * s, 6), [0, 1.1 * s, 0], [lean, 0, -lean]), trunk, { tex: 'bark' }));
    for (let i = 0; i < 4; i++) {
      const a = rng() * 6.28, h = (1.2 + rng() * 0.9) * s;
      parts.push(P(xf(G.cyl(0.03, 0.08, 1.1 * s, 5), [Math.cos(a) * 0.35, h + 0.3, Math.sin(a) * 0.35], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]), trunk, { tex: 'bark' }));
    }
  } else if (kind === 'birch') {
    parts.push(P(xf(G.cyl(0.12, 0.17, 2.8 * s, 7), [0, 1.4 * s, 0], [lean, 0, 0]), 0xe8e2d4, { jitter: 0.2, tex: 'bark' }));
    for (let i = 0; i < 3; i++) parts.push(P(xf(blobGeo((0.75 + rng() * 0.3) * s, seed + i), [(rng() - 0.5) * 0.9, (2.6 + i * 0.5) * s, (rng() - 0.5) * 0.9]), leaf, { seed: seed + i, tex: 'leaf' }));
  } else if (kind === 'mushroom') {
    const h = (1.6 + rng()) * s;
    parts.push(P(xf(G.cyl(0.22 * s, 0.35 * s, h, 8), [0, h / 2, 0], [lean, 0, 0]), 0xeee4cf));
    const cap = new THREE.SphereGeometry(1.2 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(P(xf(cap, [0, h - 0.1, 0], [0, 0, 0], [1, 0.6, 1]), leaf, { seed }));
    for (let i = 0; i < 6; i++) {
      const a = rng() * 6.28, rr = rng() * 0.8 * s;
      parts.push(P(xf(G.sph(0.12 * s, 5, 4), [Math.cos(a) * rr, h + 0.55 * s - rr * 0.4, Math.sin(a) * rr]), 0xfff6e8));
    }
  } else {
    // round, painterly crown
    const th = 1.5 * s;
    parts.push(P(xf(G.cyl(0.15 * s, 0.3 * s, th + 0.4, 7), [0, th / 2, 0], [lean, 0, lean * 0.5]), trunk, { tex: 'bark' }));
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rng();
      const rr = i === 0 ? 0 : (0.5 + rng() * 0.4) * s;
      const r = (i === 0 ? 1.2 : 0.75 + rng() * 0.35) * s;
      parts.push(P(xf(blobGeo(r, seed + i * 3), [Math.cos(a) * rr + lean, th + 0.8 * s + (i === 0 ? 0.3 : rng() * 0.6) * s, Math.sin(a) * rr]), leaf, { seed: seed + i, jitter: 0.11, tex: 'leaf' }));
    }
  }
  const m = vmesh(parts);
  group.add(m);
  if (fruit) {
    const fm = fruitGlow ? basic(fruit) : lambert(fruit);
    const count = 5 + Math.floor(rng() * 5);
    group.userData.fruits = [];
    for (let i = 0; i < count; i++) {
      const a = rng() * 6.28, rr = (0.7 + rng() * 0.5) * s;
      const f = new THREE.Mesh(G.sph(fruitGlow ? 0.13 : 0.14, 6, 5), fm);
      f.position.set(Math.cos(a) * rr, (1.6 + rng() * 1.2) * s, Math.sin(a) * rr);
      group.add(f);
      if (fruitGlow) {
        const gl = glow(fruit, 0.9, 0.55);
        gl.position.copy(f.position);
        group.add(gl);
        group.userData.fruits.push(gl);
      }
    }
  }
  group.userData.sway = rng() * 6.28;
  return group;
}

export function makeBush(rng, color = 0x5d8a4a, size = 1) {
  const parts = [];
  const n = 2 + Math.floor(rng() * 3), seed = rng() * 50;
  for (let i = 0; i < n; i++) {
    parts.push(P(xf(blobGeo((0.45 + rng() * 0.25) * size, seed + i, 0.3, 8, 6), [(rng() - 0.5) * 0.8 * size, 0.35 * size, (rng() - 0.5) * 0.8 * size]), color, { seed: seed + i, tex: 'leaf' }));
  }
  return vmesh(parts);
}
export function makeRock(rng, color = 0x9a9488, size = 1) {
  const g = new THREE.DodecahedronGeometry(0.7 * size, 1);
  const p = g.attributes.position, seed = rng() * 40;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + fbm(x * 2 + seed, z * 2 + y, 2) * 0.5;
    p.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  xf(g, [0, 0.25 * size, 0], [0, rng() * 6, 0]);
  const m = vmesh([P(g, color, { jitter: 0.14, seed, cool: 0.45, tex: 'rock' })]);
  return m;
}
export function makeFlower(rng, petal = 0xf2b6c8, center = 0xffe08a, scale = 1) {
  const parts = [];
  const h = (0.35 + rng() * 0.25) * scale;
  parts.push(P(xf(G.cyl(0.015, 0.02, h, 3), [0, h / 2, 0]), 0x5a8a45));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    parts.push(P(xf(G.sph(0.07 * scale, 4, 3), [Math.cos(a) * 0.07 * scale, h, Math.sin(a) * 0.07 * scale], [0, 0, 0], [1, 0.4, 1]), petal, { jitter: 0.05 }));
  }
  parts.push(P(xf(G.sph(0.045 * scale, 4, 3), [0, h + 0.02, 0]), center));
  return vmesh(parts, { shadow: false });
}
// Understory plants, as painted parts in local space (the land merges hundreds of them into one mesh).
export function fernParts(rng, color, size = 1) {
  const parts = [], n = 9 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rng() * 0.4, len = (0.8 + rng() * 0.45) * size, tilt = 0.7 + rng() * 0.5;
    const f = xf(G.cone(0.17 * size, len, 4), [0, len / 2, 0], [0, 0, 0], [1, 1, 0.35]);
    xf(f, [0, 0.05, 0], [tilt, a, 0]);
    parts.push(P(f, color, { jitter: 0.14, seed: i, top: 0.25 }));
  }
  return parts;
}
export function broadleafParts(rng, color, size = 1) {
  const parts = [], n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rng() * 0.5, out = (0.38 + rng() * 0.15) * size, y = (0.25 + rng() * 0.4) * size;
    const leaf = xf(G.sph(0.45 * size, 8, 5), [0, 0, 0], [0, 0, 0], [0.55, 0.1, 1]);
    xf(leaf, [Math.sin(a) * out, y, Math.cos(a) * out], [-0.5 - rng() * 0.4, a, 0]);
    parts.push(P(leaf, color, { jitter: 0.12, seed: i, top: 0.08, cool: 0.45 }));
    parts.push(P(xf(G.cyl(0.015, 0.025, y + 0.05, 3), [Math.sin(a) * out * 0.4, y / 2, Math.cos(a) * out * 0.4], [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]), color));
  }
  return parts;
}
export function flowerClumpParts(rng, leaf, petal, size = 1) {
  const parts = [P(xf(blobGeo(0.32 * size, rng() * 20, 0.3, 7, 5), [0, 0.16 * size, 0], [0, 0, 0], [1, 0.6, 1]), leaf, { tex: 'leaf', seed: rng() * 9 })];
  const n = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.28, r = rng() * 0.28 * size;
    parts.push(P(xf(G.sph((0.06 + rng() * 0.04) * size, 5, 4), [Math.cos(a) * r, (0.3 + rng() * 0.12) * size, Math.sin(a) * r], [0, 0, 0], [1, 0.7, 1]), petal, { jitter: 0.06, top: 0.35 }));
  }
  return parts;
}
// foxglove-ish spikes: a stalk with bells shrinking toward the tip
export function flowerSpikeParts(rng, leaf, petal, size = 1) {
  const parts = [], n = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const ox = (rng() - 0.5) * 0.35 * size, oz = (rng() - 0.5) * 0.35 * size, h = (0.8 + rng() * 0.5) * size;
    parts.push(P(xf(G.cyl(0.015, 0.025, h, 3), [ox, h / 2, oz]), leaf));
    for (let i = 0; i < 7; i++) {
      const t = i / 7, y = h * (0.45 + t * 0.55);
      parts.push(P(xf(G.sph(0.075 * size * (1 - t * 0.55), 5, 4), [ox + Math.cos(i * 2.4) * 0.04, y, oz + Math.sin(i * 2.4) * 0.04]), petal, { jitter: 0.08, top: 0.3 }));
    }
  }
  parts.push(...fernParts(rng, leaf, 0.45 * size));
  return parts;
}
export function makeMushroom(rng, cap = 0xd0533e, size = 1, glowy = false) {
  const g = new THREE.Group();
  const h = 0.3 * size;
  g.add(vmesh([P(xf(G.cyl(0.05 * size, 0.08 * size, h, 6), [0, h / 2, 0]), 0xf1e6d0)]));
  const capG = new THREE.SphereGeometry(0.2 * size, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const capM = glowy ? new THREE.Mesh(xf(capG, [0, h, 0], [0, 0, 0], [1, 0.75, 1]), basic(cap)) : vmesh([P(xf(capG, [0, h, 0], [0, 0, 0], [1, 0.75, 1]), cap)]);
  g.add(capM);
  if (glowy) { const gl = glow(cap, 0.8 * size, 0.5); gl.position.y = h + 0.05; g.add(gl); }
  return g;
}

// Instanced grass tufts with wind in the vertex shader.
export function makeGrassField(points, { colorFn, height = 0.5, windRef }) {
  const blade = new THREE.BufferGeometry();
  const v = [], c = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + 0.3;
    const dx = Math.cos(a) * 0.08, dz = Math.sin(a) * 0.08;
    const ox = Math.cos(a + 1.57) * 0.1 * (i - 1), oz = Math.sin(a + 1.57) * 0.1 * (i - 1);
    v.push(-dx + ox, 0, -dz + oz, dx + ox, 0, dz + oz, ox * 1.6, 1, oz * 1.6);
    c.push(0.78, 0.8, 0.85, 0.78, 0.8, 0.85, 1.12, 1.1, 0.96);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  blade.computeVertexNormals();
  const n = blade.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windRef;
    // blades are double-sided but always lit as if facing the sky
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.25) * 0.5 + sin(uTime * 3.1 + wp.x * 1.3) * 0.18;
      transformed.x += sway * 0.22 * position.y;
      transformed.z += sway * 0.12 * position.y;
    `);
  };
  const mesh = new THREE.InstancedMesh(blade, mat, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const rng = mulberry32(points.length);
  points.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    const s = height * (0.6 + rng() * 0.8);
    m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(s * 1.4, s, s * 1.4));
    mesh.setMatrixAt(i, m);
    col.setHex(colorFn(p, rng));
    mesh.setColorAt(i, col);
  });
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- buildings & things ----------
function roof(w, d, h, color) {
  // a triangular prism roof
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
  xf(g, [0, 0, 0], [0, 0, Math.PI / 2], 1);
  xf(g, [0, 0, 0], [0, Math.PI / 2, 0], [d * 0.62, h, w * 1.05]);
  const hsl = new THREE.Color(color).getHSL({});
  return P(g, color, { jitter: 0.12, tex: hsl.h > 0.07 && hsl.h < 0.17 && hsl.l > 0.4 ? 'thatch' : 'tile' });
}
function windowPane(lit) { return lit ? basic(0xffd27a) : lambert(0x3d4a66); }

export function makeCottage({ wall = 0xe9dcc0, roofC = 0x9a4f3d, lit = false, w = 3.2, d = 2.6, h = 2 } = {}) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.box(w, h, d), [0, h / 2, 0]), wall, { jitter: 0.06, tex: 'stone' }));
  parts.push(P(xf(G.box(w + 0.15, 0.25, d + 0.15), [0, 0.12, 0]), 0x8d8475, { tex: 'stone' }));
  const r = roof(w, d, 1.4, roofC); xf(r, [0, h + 0.38, 0]); parts.push(r);
  parts.push(P(xf(G.box(0.45, 1.3, 0.45), [w * 0.28, h + 1, -d * 0.18]), 0x8a7a6a, { tex: 'stone' }));
  parts.push(P(xf(G.box(0.7, 1.2, 0.08), [0, 0.6, d / 2 + 0.03]), 0x6b4a36, { tex: 'wood' }));
  for (const x of [-0.8, 1.0]) parts.push(P(xf(G.box(0.62, 0.62, 0.06), [x * w * 0.32, 1.2, d / 2 + 0.02]), 0x7a5a42, { tex: 'wood' }));
  g.add(vmesh(parts));
  const wins = [];
  for (const x of [-0.8, 1.0]) {
    const wm = new THREE.Mesh(G.box(0.48, 0.48, 0.05), windowPane(lit));
    wm.position.set(x * w * 0.32, 1.2, d / 2 + 0.05);
    g.add(wm); wins.push(wm);
  }
  if (lit) for (const wm of wins) { const gl = glow(0xffc46a, 1.6, 0.45); gl.position.copy(wm.position); gl.position.z += 0.2; g.add(gl); }
  g.userData.chimney = new THREE.Vector3(w * 0.28, h + 1.7, -d * 0.18);
  return g;
}

export function makeLighthouse(lit = false) {
  const g = new THREE.Group();
  const parts = [];
  const H = 7;
  for (let i = 0; i < 6; i++) {
    const y0 = (i / 6) * H, r0 = 1.3 - (i / 6) * 0.55, r1 = 1.3 - ((i + 1) / 6) * 0.55;
    parts.push(P(xf(G.cyl(r1, r0, H / 6, 12), [0, y0 + H / 12, 0]), i % 2 ? 0xb84a3e : 0xf1e9dc, { jitter: 0.07 }));
  }
  parts.push(P(xf(G.cyl(1.0, 1.0, 0.2, 12), [0, H + 0.1, 0]), 0x3c3a40));
  parts.push(P(xf(G.cone(0.85, 0.9, 12), [0, H + 1.75, 0]), 0x3c3a40));
  parts.push(P(xf(G.cyl(1.5, 1.6, 0.4, 12), [0, 0.2, 0]), 0x9a948a, { tex: 'stone' }));
  parts.push(P(xf(G.box(0.6, 1.1, 0.1), [0, 0.75, 1.27]), 0x5a4030, { tex: 'wood' }));
  g.add(vmesh(parts));
  const lamp = new THREE.Mesh(G.cyl(0.6, 0.6, 1.1, 10), lit ? basic(0xfff1b8) : lambert(0x45506a, { transparent: true, opacity: 0.85 }));
  lamp.position.y = H + 0.75; g.add(lamp);
  g.userData.lampY = H + 0.75;
  if (lit) {
    const gl = glow(0xffe7a0, 6, 0.8); gl.position.y = H + 0.75; g.add(gl);
    // the sweeping beam
    const beamG = new THREE.ConeGeometry(2.2, 18, 16, 1, true);
    xf(beamG, [0, -9, 0]);
    xf(beamG, [0, 0, 0], [0, 0, Math.PI / 2]);
    const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const pivot = new THREE.Group(); pivot.position.y = H + 0.75; pivot.add(beam);
    g.add(pivot);
    g.userData.beam = pivot;
  }
  return g;
}

export function makeWindmill() {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.cyl(0.9, 1.5, 5, 8), [0, 2.5, 0]), 0xe2d2b0, { jitter: 0.08, tex: 'stone' }));
  parts.push(P(xf(G.cone(1.25, 1.6, 8), [0, 5.8, 0]), 0x7d4b3a, { tex: 'tile' }));
  parts.push(P(xf(G.box(0.7, 1.2, 0.1), [0, 0.6, 1.42], [0.08, 0, 0]), 0x5a4030, { tex: 'wood' }));
  g.add(vmesh(parts));
  const blades = new THREE.Group();
  const bp = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const b = xf(G.box(0.55, 3.0, 0.05), [0, 1.7, 0]);
    xf(b, [0, 0, 0], [0, 0, a]);
    bp.push(P(b, 0xf3ead8, { jitter: 0.1 }));
    const sp = xf(G.box(0.08, 3.3, 0.08), [0, 1.65, 0.04]); xf(sp, [0, 0, 0], [0, 0, a]); bp.push(P(sp, 0x6b4a36, { tex: 'wood' }));
  }
  bp.push(P(G.sph(0.25, 6, 5), 0x6b4a36));
  blades.add(vmesh(bp));
  blades.position.set(0, 4.8, 1.25);
  g.add(blades);
  g.userData.blades = blades;
  return g;
}

export function makeTeapotHouse({ body = 0x8fb7c9, trim = 0xf3e7cf, lit = true } = {}) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(blobGeo(1.9, 3, 0.04, 16, 12), [0, 1.7, 0], [0, 0, 0], [1, 0.85, 1]), body, { jitter: 0.05 }));
  parts.push(P(xf(G.cyl(0.9, 1.1, 0.35, 14), [0, 3.25, 0]), trim));
  parts.push(P(xf(G.sph(0.3, 8, 6), [0, 3.6, 0]), body));
  const spout = xf(G.cyl(0.18, 0.42, 2.0, 8), [0, 1, 0]);
  xf(spout, [1.9, 1.6, 0], [0, 0, -0.85]);
  parts.push(P(spout, body));
  const handle = xf(G.tor(0.85, 0.16, 6, 12, Math.PI * 1.2), [0, 0, 0], [0, 0, -Math.PI * 0.6]);
  xf(handle, [-1.85, 1.9, 0]);
  parts.push(P(handle, trim));
  parts.push(P(xf(G.box(0.75, 1.15, 0.2), [0, 0.6, 1.72]), 0x6b4a36, { tex: 'wood' }));
  parts.push(P(xf(G.tor(1.95, 0.08, 4, 24), [0, 1.0, 0], [Math.PI / 2, 0, 0], [1, 1, 1]), trim));
  g.add(vmesh(parts));
  for (const a of [-0.7, 0.7]) {
    const w = new THREE.Mesh(G.sph(0.24, 8, 6), windowPane(lit));
    w.position.set(Math.sin(a) * 1.78, 2.0, Math.cos(a) * 1.5);
    g.add(w);
    if (lit) { const gl = glow(0xffc46a, 1.3, 0.4); gl.position.copy(w.position); g.add(gl); }
  }
  g.userData.chimney = new THREE.Vector3(2.6, 2.6, 0);
  return g;
}
export function makeCupHouse({ body = 0xe9c9c0, trim = 0xc97a6a } = {}) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.cyl(1.5, 1.1, 2.2, 16), [0, 1.1, 0]), body, { jitter: 0.05 }));
  parts.push(P(xf(G.tor(1.5, 0.1, 4, 24), [0, 2.2, 0], [Math.PI / 2, 0, 0]), trim));
  parts.push(P(xf(G.tor(0.6, 0.14, 6, 12, Math.PI * 1.3), [-1.6, 1.2, 0], [0, 0, Math.PI * 0.35]), body));
  parts.push(P(xf(G.cone(1.7, 1.3, 16), [0, 2.9, 0]), trim));
  parts.push(P(xf(G.box(0.6, 1.0, 0.15), [0, 0.5, 1.3]), 0x6b4a36, { tex: 'wood' }));
  parts.push(P(xf(G.cyl(2.0, 2.0, 0.15, 18), [0, 0.07, 0]), 0xf3efe8));
  g.add(vmesh(parts));
  return g;
}

export function makeBookshelf(rng, h = 2.6) {
  const parts = [];
  parts.push(P(xf(G.box(2.2, h, 0.6), [0, h / 2, 0]), 0x5e4334, { tex: 'wood' }));
  const bookCols = [0x8a3b3b, 0x3b5a8a, 0x5c7a3a, 0xc9a24a, 0x6a4a7a, 0xa86a3a, 0x2f6b66];
  for (let shelf = 0; shelf < 3; shelf++) {
    let x = -0.95;
    while (x < 0.9) {
      const bw = 0.08 + rng() * 0.1, bh = 0.45 + rng() * 0.25;
      if (rng() > 0.15) parts.push(P(xf(G.box(bw, bh, 0.42), [x + bw / 2, 0.2 + shelf * (h / 3.2) + bh / 2, 0.12], [0, 0, rng() > 0.85 ? 0.3 : 0]), bookCols[Math.floor(rng() * bookCols.length)], { jitter: 0.05 }));
      x += bw + 0.01;
    }
  }
  return vmesh(parts);
}
export function makeBook(rng) {
  const cols = [0x8a3b3b, 0x3b5a8a, 0x5c7a3a, 0xc9a24a, 0x6a4a7a];
  const parts = [P(xf(G.box(0.5, 0.12, 0.38), [0, 0.06, 0], [0, rng() * 3, 0]), cols[Math.floor(rng() * cols.length)]), P(xf(G.box(0.46, 0.08, 0.36), [0, 0.07, 0.01]), 0xf3ead6)];
  return vmesh(parts);
}

export function makeStandingStone(rng, glowOn = false, color = 0x9e9a92) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 3, 0.8, 2, 4, 2);
  const p = geo.attributes.position, seed = rng() * 30;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + fbm(x + seed, y * 0.7 + z, 2) * 0.35;
    p.setXYZ(i, x * k * (1 - y * 0.06), y, z * k);
  }
  geo.computeVertexNormals();
  xf(geo, [0, 1.4, 0], [0.04, rng(), 0.05]);
  g.add(vmesh([P(geo, color, { jitter: 0.14, seed, cool: 0.5, tex: 'rock' })]));
  const rune = new THREE.Mesh(G.tor(0.24, 0.05, 4, 12), glowOn ? basic(0x9ff2e0) : lambert(0x6e6a64));
  rune.position.set(0, 1.7, 0.43);
  g.add(rune);
  if (glowOn) { const gl = glow(0x8ff0d8, 2.2, 0.6); gl.position.copy(rune.position); g.add(gl); }
  g.userData.rune = rune;
  return g;
}

export function makeWaystone() {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.cyl(0.9, 1.1, 0.3, 8), [0, 0.15, 0]), 0x8f8a80, { tex: 'stone' }));
  const ob = xf(G.cyl(0.18, 0.38, 2.2, 4), [0, 1.4, 0], [0, Math.PI / 4, 0]);
  parts.push(P(ob, 0xb3aca0, { jitter: 0.12, tex: 'rock' }));
  g.add(vmesh(parts));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), basic(0xbfe8ff));
  gem.position.y = 2.9; g.add(gem);
  const gl = glow(0xa8dcff, 2.2, 0.7); gl.position.y = 2.9; g.add(gl);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.45, 32), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; g.add(ring);
  g.userData.gem = gem; g.userData.ring = ring;
  return g;
}

export function makeBoat(color = 0x8a5a3c) {
  const parts = [];
  const hull = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  xf(hull, [0, 0.45, 0], [0, 0, 0], [0.8, 0.5, 2]);
  parts.push(P(hull, color, { jitter: 0.12, tex: 'wood' }));
  parts.push(P(xf(G.box(1.4, 0.06, 0.25), [0, 0.42, 0.3]), 0x6b4a36, { tex: 'wood' }));
  return vmesh(parts);
}
export function makePaperBoat(color = 0xf6f0e2) {
  const parts = [];
  const hull = new THREE.CylinderGeometry(0.5, 0.2, 0.25, 4, 1);
  xf(hull, [0, 0.12, 0], [0, Math.PI / 4, 0], [1.4, 1, 0.6]);
  parts.push(P(hull, color, { jitter: 0.04 }));
  parts.push(P(xf(G.cone(0.32, 0.6, 4), [0, 0.5, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]), color, { jitter: 0.04 }));
  return vmesh(parts);
}

export function makeLamppost(lit = true, color = 0xffd48a) {
  const g = new THREE.Group();
  g.add(vmesh([P(xf(G.cyl(0.06, 0.1, 2.4, 6), [0, 1.2, 0]), 0x3a3a44), P(xf(G.cone(0.3, 0.3, 6), [0, 2.75, 0]), 0x3a3a44)]));
  const bulb = new THREE.Mesh(G.sph(0.17, 8, 6), lit ? basic(color) : lambert(0x555566));
  bulb.position.y = 2.5; g.add(bulb);
  if (lit) { const gl = glow(color, 2.6, 0.6); gl.position.y = 2.5; g.add(gl); }
  return g;
}
export function makeFencePost(rng) {
  return vmesh([P(xf(G.box(0.14, 0.9, 0.14), [0, 0.45, 0], [(rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2]), 0x7a5e44, { tex: 'wood' })]);
}
export function makeMailbox(hasMail = false) {
  const g = new THREE.Group();
  g.add(vmesh([P(xf(G.box(0.1, 1.1, 0.1), [0, 0.55, 0]), 0x6b4a36, { tex: 'wood' }), P(xf(G.cyl(0.25, 0.25, 0.6, 10, 1), [0, 1.25, 0], [Math.PI / 2, 0, 0], [1, 1, 1]), 0x5d7fa3), P(xf(G.box(0.5, 0.25, 0.6), [0, 1.13, 0]), 0x5d7fa3)]));
  const flag = new THREE.Mesh(G.box(0.04, 0.35, 0.2), lambert(0xd8473a));
  flag.position.set(0.28, hasMail ? 1.45 : 1.2, 0.05);
  flag.rotation.x = hasMail ? 0 : Math.PI / 2;
  g.add(flag);
  if (hasMail) { const gl = glow(0xffd27a, 1.2, 0.55); gl.position.set(0.3, 1.6, 0); g.add(gl); g.userData.flagGlow = gl; }
  return g;
}
export function makeRuinWall(rng, w = 3, h = 2.4) {
  const parts = [];
  const cols = Math.ceil(w / 0.6);
  for (let i = 0; i < cols; i++) {
    const hh = h * (0.4 + rng() * 0.6);
    parts.push(P(xf(G.box(0.62, hh, 0.6), [-w / 2 + i * 0.6 + 0.3, hh / 2, 0], [0, (rng() - 0.5) * 0.08, 0]), 0xa49d90, { jitter: 0.15, cool: 0.5, tex: 'stone' }));
  }
  return vmesh(parts);
}
export function makeArch(color = 0xa8a194) {
  const parts = [];
  parts.push(P(xf(G.box(0.6, 3, 0.6), [-1.3, 1.5, 0]), color, { jitter: 0.15, tex: 'stone' }));
  parts.push(P(xf(G.box(0.6, 2.2, 0.6), [1.3, 1.1, 0]), color, { jitter: 0.15, tex: 'stone' }));
  parts.push(P(xf(G.tor(1.3, 0.3, 5, 10, Math.PI * 0.62), [0, 3, 0], [0, 0, Math.PI * 0.25]), color, { jitter: 0.15, tex: 'rock' }));
  return vmesh(parts);
}
export function makeBell(color = 0xc79a4a) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.15 + Math.pow(t, 2.2) * 0.55, 1 - t)); }
  const g = new THREE.LatheGeometry(pts, 14);
  return vmesh([P(g, color, { jitter: 0.08, top: 0.3 })]);
}
export function makeTent(color = 0xc98a5a) {
  return vmesh([P(xf(G.cone(1.3, 1.8, 6), [0, 0.9, 0]), color, { jitter: 0.1 }), P(xf(G.box(0.5, 0.8, 0.1), [0, 0.4, 1.0], [0.5, 0, 0]), 0x4a3424, { tex: 'wood' })]);
}
export function makeScaffold() {
  const parts = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push(P(xf(G.box(0.1, 2.4, 0.1), [x, 1.2, z]), 0xa07a52, { tex: 'wood' }));
  for (const y of [0.8, 1.7]) { parts.push(P(xf(G.box(2.2, 0.08, 0.1), [0, y, 1]), 0xa07a52, { tex: 'wood' })); parts.push(P(xf(G.box(0.1, 0.08, 2.2), [1, y, 0]), 0xa07a52, { tex: 'wood' })); }
  parts.push(P(xf(G.box(1.6, 0.6, 1.6), [0, 0.3, 0]), 0xc9b48a, { tex: 'stone' }));
  return vmesh(parts);
}
export function makeMushroomHouse(cap = 0xc8553f, lit = false) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.cyl(1.0, 1.25, 2.2, 12), [0, 1.1, 0]), 0xefe3c8, { jitter: 0.06 }));
  const capG = new THREE.SphereGeometry(2.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(P(xf(capG, [0, 2.0, 0], [0, 0, 0], [1, 0.75, 1]), cap));
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.6 + (i % 3) * 0.45; parts.push(P(xf(G.sph(0.18, 5, 4), [Math.cos(a) * r, 3.5 - r * 0.42, Math.sin(a) * r]), 0xfff6e8)); }
  parts.push(P(xf(G.box(0.6, 1.0, 0.1), [0, 0.5, 1.2]), 0x6b4a36, { tex: 'wood' }));
  g.add(vmesh(parts));
  const w = new THREE.Mesh(G.sph(0.2, 8, 6), windowPane(lit)); w.position.set(0.6, 1.45, 1.0); g.add(w);
  if (lit) { const gl = glow(0xffc46a, 1.5, 0.5); gl.position.copy(w.position); g.add(gl); }
  return g;
}
export function makeClockTower(lit = false) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(G.box(1.6, 4.5, 1.6), [0, 2.25, 0]), 0xc9b79a, { jitter: 0.07, tex: 'stone' }));
  parts.push(P(xf(G.cone(1.4, 1.8, 4), [0, 5.4, 0], [0, Math.PI / 4, 0]), 0x4f6a7a, { tex: 'tile' }));
  parts.push(P(xf(G.cyl(0.62, 0.62, 0.1, 18), [0, 3.5, 0.81], [Math.PI / 2, 0, 0]), 0xf6efdf));
  parts.push(P(xf(G.box(0.6, 1.0, 0.1), [0, 0.5, 0.81]), 0x5a4030, { tex: 'wood' }));
  g.add(vmesh(parts));
  const hand1 = new THREE.Mesh(G.box(0.05, 0.45, 0.03), lambert(0x2a2a30)); hand1.geometry = xf(G.box(0.05, 0.45, 0.03), [0, 0.2, 0]);
  const hand2 = new THREE.Mesh(xf(G.box(0.07, 0.3, 0.03), [0, 0.13, 0]), lambert(0x2a2a30));
  for (const h of [hand1, hand2]) { h.position.set(0, 3.5, 0.88); g.add(h); }
  g.userData.hands = [hand1, hand2];
  if (lit) { const gl = glow(0xfff0c0, 2.2, 0.4); gl.position.set(0, 3.5, 1.0); g.add(gl); }
  return g;
}
export function makeShellShop() {
  const g = new THREE.Group();
  const parts = [];
  const shell = new THREE.ConeGeometry(1.6, 3.2, 14, 6);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const a = y * 1.8; const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)); }
  shell.computeVertexNormals();
  parts.push(P(xf(shell, [0, 1.6, 0], [0.25, 0, 0]), 0xf0c8a8, { jitter: 0.15 }));
  parts.push(P(xf(G.box(2.4, 0.15, 1.0), [0, 0.9, 1.4]), 0x8a5a3c, { tex: 'wood' }));
  parts.push(P(xf(G.box(0.1, 0.9, 0.1), [-1.1, 0.45, 1.8]), 0x8a5a3c, { tex: 'wood' }));
  parts.push(P(xf(G.box(0.1, 0.9, 0.1), [1.1, 0.45, 1.8]), 0x8a5a3c, { tex: 'wood' }));
  const awning = xf(G.box(2.6, 0.08, 1.2), [0, 2.0, 1.5], [0.3, 0, 0]);
  parts.push(P(awning, 0xd06a5a));
  g.add(vmesh(parts));
  return g;
}
export function makeBed() {
  return vmesh([P(xf(G.box(1.2, 0.4, 2), [0, 0.2, 0]), 0x7a5a42, { tex: 'wood' }), P(xf(G.box(1.1, 0.2, 1.4), [0, 0.5, 0.25]), 0xd8a6a6), P(xf(G.box(0.9, 0.18, 0.4), [0, 0.5, -0.7]), 0xf3ece0)]);
}
export function makeGardenPlot() {
  const parts = [P(xf(G.box(3, 0.25, 2), [0, 0.12, 0]), 0x6a4a34, { jitter: 0.2, tex: 'wood' })];
  for (let i = 0; i < 4; i++) parts.push(P(xf(G.box(2.8, 0.06, 0.18), [0, 0.27, -0.7 + i * 0.47]), 0x4f3626));
  return vmesh(parts);
}
export function makeSignpost(rng) {
  return vmesh([P(xf(G.box(0.12, 1.6, 0.12), [0, 0.8, 0]), 0x6b4a36, { tex: 'wood' }), P(xf(G.box(1.0, 0.3, 0.06), [0.3, 1.35, 0], [0, 0, 0.08]), 0xb08a5a, { tex: 'wood' }), P(xf(G.box(0.9, 0.26, 0.06), [-0.25, 1.0, 0.02], [0, 0.3, -0.1]), 0xa07a4a, { tex: 'wood' })]);
}
export function makeStall(color = 0xd06a5a) {
  return vmesh([
    P(xf(G.box(2, 0.9, 1), [0, 0.45, 0]), 0x8a5a3c, { tex: 'wood' }),
    P(xf(G.box(0.08, 2.2, 0.08), [-0.95, 1.1, 0.45]), 0x6b4a36, { tex: 'wood' }), P(xf(G.box(0.08, 2.2, 0.08), [0.95, 1.1, 0.45]), 0x6b4a36, { tex: 'wood' }),
    P(xf(G.box(2.3, 0.08, 1.3), [0, 2.2, 0.2], [0.25, 0, 0]), color),
    P(xf(G.sph(0.18, 6, 5), [-0.5, 1.0, 0.1]), 0xe8a040), P(xf(G.sph(0.16, 6, 5), [0, 1.0, 0.15]), 0xc84a3a), P(xf(G.sph(0.17, 6, 5), [0.5, 1.0, 0.05]), 0x9ac04a),
  ]);
}
export function makeTable() {
  const parts = [P(xf(G.cyl(1.4, 1.4, 0.12, 14), [0, 0.8, 0]), 0xf2ebe0), P(xf(G.cyl(0.12, 0.2, 0.8, 6), [0, 0.4, 0]), 0x7a5a42, { tex: 'wood' })];
  for (let i = 0; i < 5; i++) { const a = i * 1.25; parts.push(P(xf(G.cyl(0.13, 0.1, 0.16, 8), [Math.cos(a) * 0.9, 0.94, Math.sin(a) * 0.9]), [0xe9c9c0, 0x8fb7c9, 0xf3e7cf, 0xc9d9a0, 0xd8b0e0][i])); }
  parts.push(P(xf(blobGeo(0.35, 2, 0.05), [0, 1.15, 0], [0, 0, 0], [1, 0.8, 1]), 0x8fb7c9));
  return vmesh(parts);
}

// The giant: a hill with a face. Built at land scale.
export function makeGiantHead(awake = 0) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(P(xf(blobGeo(6, 7, 0.08, 24, 18), [0, 0, 0], [0, 0, 0], [1, 0.62, 1.1]), 0x7f9a62, { jitter: 0.12, nscale: 0.5 }));
  parts.push(P(xf(blobGeo(1.3, 3, 0.1), [0, 2.6, 5.4], [0, 0, 0], [0.9, 0.8, 1.2]), 0x8fa86e));
  for (const x of [-2.3, 2.3]) {
    const brow = xf(G.tor(1.1, 0.22, 5, 10, Math.PI), [x, 3.0, 4.6], [-0.45, 0, 0]);
    parts.push(P(brow, 0x5f7a4a));
  }
  // beard of grass and stone
  for (let i = 0; i < 18; i++) {
    const a = -1.2 + (i / 17) * 2.4;
    parts.push(P(xf(blobGeo(0.9 + (i % 3) * 0.2, i, 0.3, 8, 6), [Math.sin(a) * 5.4, -1.2 + Math.cos(i) * 0.3, Math.cos(a) * 5.8 - 0.2]), i % 4 === 0 ? 0x8f8a80 : 0x5d7d46));
  }
  g.add(vmesh(parts));
  const eyes = [];
  for (const x of [-2.3, 2.3]) {
    const lid = new THREE.Mesh(xf(G.tor(0.75, 0.13, 4, 10, Math.PI), [0, 0, 0], [0.2 + Math.PI, 0, 0]), lambert(0x3f5234));
    lid.position.set(x, 2.35, 5.0);
    g.add(lid); eyes.push(lid);
    if (awake > 0) {
      const eye = new THREE.Mesh(G.sph(0.42, 10, 8), basic(0xd9f5e9));
      eye.position.set(x, 2.25, 4.95); g.add(eye);
      const gl = glow(0xbff5dd, 2.2, 0.5); gl.position.copy(eye.position); g.add(gl);
    }
  }
  const mouth = new THREE.Mesh(xf(G.tor(1.1, 0.16, 4, 12, Math.PI), [0, 0, 0], [Math.PI + 0.3, 0, 0]), lambert(0x3f5234));
  mouth.position.set(0, 0.7, 5.75); g.add(mouth);
  g.userData.mouth = mouth;
  return g;
}

// ---------- characters ----------
function eyes(g, y, z, sep = 0.13, size = 0.055, color = 0x2a2230) {
  const mat = lambert(color);
  const hi = basic(0xffffff);
  const list = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(G.sph(size, 8, 6), mat);
    e.position.set(s * sep, y, z);
    e.scale.set(1, 1.25, 0.6);
    const h = new THREE.Mesh(G.sph(size * 0.35, 5, 4), hi);
    h.position.set(size * 0.3, size * 0.4, size * 0.6);
    e.add(h);
    g.add(e); list.push(e);
  }
  return list;
}
function cheeks(g, y, z, sep = 0.2, color = 0xf0a0a0) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(G.sph(0.05, 6, 4), m); c.position.set(s * sep, y, z); c.scale.set(1.3, 0.7, 0.4); g.add(c); }
}

// Generic little person. Returns a group with userData.parts for animation.
export function makePerson({ skin = 0xf0c8a0, cloth = 0x6a8fb0, cloth2 = 0xe9dcc0, hair = 0x5a4030, hat = null, hatColor = 0x8a5a3c, scale = 1, height = 1, bun = false, beard = false, apron = null } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const torsoG = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.36, 0.02), new THREE.Vector2(0.34, 0.3), new THREE.Vector2(0.25, 0.62 * height), new THREE.Vector2(0.12, 0.72 * height), new THREE.Vector2(0, 0.74 * height)], 10);
  const torso = vmesh([P(xf(torsoG, [0, 0.14, 0]), cloth, { jitter: 0.06 })]);
  body.add(torso);
  if (apron) body.add(vmesh([P(xf(G.box(0.4, 0.45, 0.05), [0, 0.42, 0.29], [-0.15, 0, 0]), apron)]));
  const head = new THREE.Group();
  head.position.y = 0.95 * height;
  head.add(vmesh([P(G.sph(0.3, 12, 10), skin, { jitter: 0.03, cool: 0.25 })]));
  head.add(vmesh([P(xf(new THREE.SphereGeometry(0.315, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), [0, 0.02, -0.03], [-0.25, 0, 0]), hair, { jitter: 0.1 })]));
  if (bun) head.add(vmesh([P(xf(G.sph(0.14, 8, 6), [0, 0.28, -0.2]), hair)]));
  if (beard) head.add(vmesh([P(xf(blobGeo(0.2, 1, 0.2, 8, 6), [0, -0.2, 0.18], [0, 0, 0], [1.2, 1, 0.7]), hair)]));
  const ey = eyes(head, 0.0, 0.27);
  cheeks(head, -0.08, 0.25);
  if (hat === 'wide') {
    head.add(vmesh([P(xf(G.cyl(0.62, 0.62, 0.05, 16), [0, 0.2, 0], [-0.08, 0, 0.05]), hatColor, { jitter: 0.08 }), P(xf(G.cone(0.3, 0.55, 10), [0, 0.47, -0.02], [-0.25, 0, 0.12]), hatColor, { jitter: 0.08 })]));
  } else if (hat === 'cap') {
    head.add(vmesh([P(xf(new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.08, 0]), hatColor), P(xf(G.box(0.4, 0.04, 0.25), [0, 0.1, 0.33]), hatColor)]));
  } else if (hat === 'witch') {
    head.add(vmesh([P(xf(G.cyl(0.5, 0.5, 0.04, 14), [0, 0.18, 0]), hatColor), P(xf(G.cone(0.28, 0.8, 10), [0, 0.58, -0.05], [-0.35, 0, 0]), hatColor)]));
  }
  body.add(head);
  const feet = [];
  for (const s of [-1, 1]) {
    const f = vmesh([P(xf(G.sph(0.11, 6, 5), [0, 0.06, 0.04], [0, 0, 0], [1, 0.7, 1.4]), 0x4a3a30)]);
    f.position.x = s * 0.15; root.add(f); feet.push(f);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.3, 0.68 * height, 0);
    a.add(vmesh([P(xf(G.cyl(0.06, 0.07, 0.42, 6), [0, -0.2, 0]), cloth, { jitter: 0.05 }), P(xf(G.sph(0.075, 6, 5), [0, -0.43, 0]), skin)]));
    a.rotation.z = s * 0.25;
    body.add(a); arms.push(a);
  }
  root.scale.setScalar(scale);
  root.userData.parts = { body, head, feet, arms, eyes: ey };
  root.userData.blink = Math.random() * 4;
  return root;
}

export function makePlayer() {
  const p = makePerson({ skin: 0xf3cfa8, cloth: 0x4f6f8f, hair: 0x6b3f2a, hat: 'wide', hatColor: 0xb0603e });
  const { body, arms } = p.userData.parts;
  // scarf with a trailing tail that flutters
  body.add(vmesh([P(xf(G.tor(0.22, 0.08, 6, 14), [0, 0.78, 0], [Math.PI / 2, 0, 0]), 0xd8473a)]));
  const tail = [];
  let parent = body;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(i === 0 ? 0.12 : 0, i === 0 ? 0.74 : -0.02, i === 0 ? -0.18 : -0.17);
    seg.add(vmesh([P(xf(G.box(0.14, 0.05, 0.18), [0, 0, -0.08]), 0xd8473a, { jitter: 0.06 })], { shadow: true }));
    parent.add(seg); tail.push(seg); parent = seg;
  }
  // satchel
  body.add(vmesh([P(xf(G.box(0.22, 0.24, 0.12), [-0.33, 0.35, 0.05]), 0x8a6a42)]));
  // staff in right hand
  const staff = new THREE.Group();
  staff.add(vmesh([P(xf(G.cyl(0.035, 0.045, 1.5, 6), [0, 0.35, 0]), 0x7a5232)]));
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), basic(0xbfe8ff));
  tip.position.y = 1.15; staff.add(tip);
  const tg = glow(0xa8dcff, 0.9, 0.7); tg.position.y = 1.15; staff.add(tg);
  staff.position.set(0, -0.42, 0.05);
  arms[1].add(staff);
  p.userData.parts.tail = tail;
  p.userData.parts.staff = staff;
  return p;
}

export function makePell(lit = true) {
  // Pell: an old stone lantern with a face in its light-box
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const stone = 0xa9a396;
  body.add(vmesh([
    P(xf(G.cyl(0.55, 0.65, 0.25, 6), [0, 0.12, 0]), stone, { jitter: 0.15 }),
    P(xf(G.cyl(0.18, 0.24, 0.9, 6), [0, 0.7, 0]), stone, { jitter: 0.15 }),
    P(xf(G.cyl(0.5, 0.42, 0.18, 6), [0, 1.2, 0]), stone, { jitter: 0.15 }),
    P(xf(G.box(0.62, 0.5, 0.62), [0, 1.55, 0]), stone, { jitter: 0.15 }),
    P(xf(G.cone(0.75, 0.5, 6), [0, 2.05, 0]), 0x8f897c, { jitter: 0.15 }),
    P(xf(G.sph(0.12, 6, 5), [0, 2.38, 0]), 0x8f897c),
    P(xf(blobGeo(0.32, 4, 0.3, 8, 6), [0.25, 2.0, 0.2], [0, 0, 0], [1, 0.4, 1]), 0x6f8f4a),
    P(xf(blobGeo(0.2, 9, 0.3, 8, 6), [-0.4, 0.25, 0.3], [0, 0, 0], [1, 0.5, 1]), 0x6f8f4a),
  ]));
  const light = new THREE.Mesh(G.box(0.48, 0.32, 0.05), lit ? basic(0xffd690) : lambert(0x4a4a50));
  light.position.set(0, 1.55, 0.3); body.add(light);
  const head = new THREE.Group(); head.position.set(0, 1.55, 0.33); body.add(head);
  const ey = eyes(head, 0.02, 0.0, 0.11, 0.045, 0x5a3a20);
  if (lit) { const gl = glow(0xffcf7a, 2.0, 0.6); gl.position.set(0, 1.55, 0.4); body.add(gl); g.userData.glow = gl; }
  g.userData.parts = { body, head, eyes: ey };
  g.userData.blink = 2;
  return g;
}

export function makeScarecrow() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([
    P(xf(G.cyl(0.05, 0.06, 1.4, 5), [0, 0.7, 0]), 0x7a5a3a),
    P(xf(G.cyl(0.04, 0.04, 1.7, 5), [0, 1.25, 0], [0, 0, Math.PI / 2]), 0x7a5a3a),
    P(xf(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.4, 0.05), new THREE.Vector2(0.3, 0.6), new THREE.Vector2(0.15, 0.7), new THREE.Vector2(0, 0.72)], 8), [0, 0.6, 0]), 0x6f7d4a, { jitter: 0.12 }),
    P(xf(G.box(0.16, 0.16, 0.05), [0.12, 0.95, 0.27]), 0xb85a3a),
    P(xf(G.box(0.14, 0.12, 0.05), [-0.15, 0.75, 0.26]), 0xd8b04a),
  ]));
  const straw = [];
  for (let i = 0; i < 6; i++) straw.push(P(xf(G.cone(0.05, 0.3, 3), [(i < 3 ? -0.9 : 0.9) + (i % 3 - 1) * 0.03, 1.2 + (i % 3 - 1) * 0.05, 0], [0, 0, (i < 3 ? 1 : -1) * 1.6 + (i % 3 - 1) * 0.3]), 0xe2c56a));
  body.add(vmesh(straw));
  const head = new THREE.Group(); head.position.y = 1.62; body.add(head);
  head.add(vmesh([P(blobGeo(0.32, 2, 0.1), 0xd9c39a, { jitter: 0.15 })]));
  head.add(vmesh([P(xf(G.cyl(0.5, 0.5, 0.04, 12), [0, 0.2, 0], [0.1, 0, -0.1]), 0x5a4a3a), P(xf(G.cyl(0.25, 0.3, 0.35, 10), [0, 0.38, 0], [0.1, 0, -0.12]), 0x5a4a3a)]));
  const ey = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(G.box(0.1, 0.02, 0.02), lambert(0x2a2220));
    e.position.set(s * 0.12, 0.05, 0.3); e.rotation.z = s * 0.6; head.add(e); ey.push(e);
    const e2 = e.clone(); e2.rotation.z = -s * 0.6; head.add(e2);
  }
  const mouth = new THREE.Mesh(xf(G.tor(0.1, 0.015, 3, 8, Math.PI), [0, 0, 0], [Math.PI, 0, 0]), lambert(0x2a2220));
  mouth.position.set(0, -0.1, 0.3); head.add(mouth);
  g.userData.parts = { body, head, eyes: [] };
  return g;
}

export function makeToad() {
  // Auntie Brine: a broad old toad in a shawl, leaning on a lantern-pole
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([
    P(xf(blobGeo(0.75, 5, 0.07, 14, 10), [0, 0.65, 0], [0, 0, 0], [1.1, 0.85, 1]), 0x6f8a5a, { jitter: 0.15 }),
    P(xf(new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), [0, 0.75, -0.05], [-0.15, 0, 0], [1.15, 0.9, 1.05]), 0x8a5a8a, { jitter: 0.1 }),
    P(xf(G.sph(0.4, 10, 8), [0, 1.35, 0.2], [0, 0, 0], [1.3, 0.8, 1.1]), 0x7a9a64, { jitter: 0.12 }),
    P(xf(G.sph(0.18, 6, 5), [-0.55, 0.2, 0.35], [0, 0, 0], [1, 0.5, 1.4]), 0x6f8a5a),
    P(xf(G.sph(0.18, 6, 5), [0.55, 0.2, 0.35], [0, 0, 0], [1, 0.5, 1.4]), 0x6f8a5a),
    P(xf(G.cyl(0.04, 0.04, 2.4, 5), [0.85, 1.2, 0.2]), 0x5a4030),
  ]));
  const head = new THREE.Group(); head.position.set(0, 1.4, 0.2); body.add(head);
  const ey = [];
  for (const s of [-1, 1]) {
    const bulb = vmesh([P(xf(G.sph(0.14, 8, 6), [s * 0.28, 0.18, 0.15]), 0x7a9a64)]);
    head.add(bulb);
    const e = new THREE.Mesh(G.sph(0.08, 8, 6), lambert(0xd9a83a)); e.position.set(s * 0.28, 0.2, 0.26); head.add(e);
    const pu = new THREE.Mesh(G.box(0.1, 0.03, 0.02), lambert(0x201a18)); pu.position.set(0, 0, 0.07); e.add(pu);
    ey.push(e);
  }
  head.add(new THREE.Mesh(xf(G.tor(0.3, 0.02, 3, 12, Math.PI * 0.8), [0, -0.05, 0.33], [Math.PI, 0, Math.PI * 0.1]), lambert(0x3a2a20)));
  const lamp = new THREE.Mesh(G.sph(0.12, 8, 6), basic(0xb8f0ff)); lamp.position.set(0.85, 2.45, 0.2); body.add(lamp);
  const gl = glow(0x9fe0ff, 1.8, 0.7); gl.position.copy(lamp.position); body.add(gl);
  g.userData.parts = { body, head, eyes: ey };
  return g;
}

export function makeGhost(solid = 0) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const op = 0.55 + solid * 0.35;
  const mat = new THREE.MeshLambertMaterial({ color: solid > 0 ? 0xc6d8f0 : 0xb8d0ee, transparent: true, opacity: op, emissive: 0x334466, depthWrite: true });
  const robe = new THREE.LatheGeometry([new THREE.Vector2(0, 0.15), new THREE.Vector2(0.45, 0.1), new THREE.Vector2(0.32, 0.6), new THREE.Vector2(0.22, 1.0), new THREE.Vector2(0, 1.05)], 12);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.2) p.setY(i, p.getY(i) + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5) * 0.06);
  robe.computeVertexNormals();
  body.add(new THREE.Mesh(robe, mat));
  const head = new THREE.Group(); head.position.y = 1.25; body.add(head);
  head.add(new THREE.Mesh(G.sph(0.28, 12, 10), mat));
  const ey = eyes(head, 0.02, 0.25, 0.11, 0.04, 0x2a3450);
  for (const s of [-1, 1]) { const sp = new THREE.Mesh(G.tor(0.08, 0.012, 4, 12), lambert(0xc9a24a)); sp.position.set(s * 0.11, 0.02, 0.29); head.add(sp); }
  head.add(new THREE.Mesh(xf(G.cone(0.22, 0.4, 8), [0, 0.32, -0.05], [-0.4, 0, 0]), mat));
  const gl = glow(0xa8c8ff, 2.4, 0.35); gl.position.y = 0.8; body.add(gl);
  g.userData.parts = { body, head, eyes: ey };
  g.userData.float = true;
  return g;
}

export function makeTeapotLady() {
  // Madame Saucerelle: a lady whose head is a small, steaming teapot
  const p = makePerson({ skin: 0xf3d6c0, cloth: 0xc06a8a, cloth2: 0xf3e7cf, hair: 0xf3e7cf, apron: 0xf6efe4 });
  const { head } = p.userData.parts;
  head.clear();
  head.add(vmesh([
    P(xf(blobGeo(0.34, 2, 0.03, 12, 10), [0, 0.02, 0], [0, 0, 0], [1, 0.85, 1]), 0x8fb7c9),
    P(xf(G.cyl(0.18, 0.22, 0.08, 10), [0, 0.3, 0]), 0xf3e7cf),
    P(xf(G.sph(0.06, 6, 5), [0, 0.37, 0]), 0x8fb7c9),
    P(xf(G.cyl(0.04, 0.09, 0.35, 6), [0.38, 0.05, 0], [0, 0, -0.9]), 0x8fb7c9),
    P(xf(G.tor(0.13, 0.03, 4, 10, Math.PI * 1.2), [-0.36, 0.05, 0], [0, 0, -Math.PI * 0.6]), 0xf3e7cf),
  ]));
  const ey = eyes(head, 0.04, 0.3, 0.12, 0.05);
  cheeks(head, -0.05, 0.3, 0.2);
  p.userData.parts.eyes = ey;
  p.userData.steam = new THREE.Vector3(0.55, 0.3, 0);
  return p;
}

export function makeMailboxMan() {
  // Gus Postwick: a walking blue mailbox with a cap and very thin legs
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([
    P(xf(G.box(0.7, 0.85, 0.6), [0, 0.95, 0]), 0x4f78a8, { jitter: 0.06 }),
    P(xf(G.cyl(0.35, 0.35, 0.6, 12, 1), [0, 1.38, 0], [Math.PI / 2, 0, 0], [1, 1, 1]), 0x4f78a8),
    P(xf(G.box(0.4, 0.06, 0.02), [0, 1.15, 0.31]), 0x22304a),
    P(xf(G.box(0.08, 0.5, 0.04), [0.36, 1.2, 0.2]), 0xd8473a),
  ]));
  const head = new THREE.Group(); head.position.set(0, 1.4, 0.0); body.add(head);
  head.add(vmesh([P(xf(new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.3, 0]), 0x2a3a5a), P(xf(G.box(0.36, 0.04, 0.2), [0, 0.32, 0.3]), 0x2a3a5a)]));
  const ey = eyes(head, -0.2, 0.31, 0.14, 0.06);
  const feet = [];
  for (const s of [-1, 1]) {
    const f = vmesh([P(xf(G.cyl(0.03, 0.03, 0.55, 4), [0, 0.3, 0]), 0x2a2a30), P(xf(G.sph(0.09, 6, 5), [0, 0.05, 0.05], [0, 0, 0], [1, 0.6, 1.5]), 0x2a2a30)]);
    f.position.x = s * 0.18; g.add(f); feet.push(f);
  }
  g.userData.parts = { body, head, eyes: ey, feet };
  return g;
}

export function makeMushroomFolk(cap = 0xc8553f, size = 1) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([P(xf(G.cyl(0.22, 0.3, 0.6, 10), [0, 0.32, 0]), 0xf1e6d0, { jitter: 0.05 })]));
  const head = new THREE.Group(); head.position.y = 0.62; body.add(head);
  head.add(vmesh([P(xf(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.0, 0], [0, 0, 0], [1, 0.75, 1]), cap), P(xf(G.sph(0.07, 5, 4), [0.2, 0.3, 0.15]), 0xfff6e8), P(xf(G.sph(0.06, 5, 4), [-0.22, 0.25, -0.1]), 0xfff6e8), P(xf(G.sph(0.08, 5, 4), [0, 0.36, -0.15]), 0xfff6e8)]));
  const ey = eyes(body, 0.45, 0.24, 0.1, 0.045);
  cheeks(body, 0.38, 0.24, 0.17);
  const feet = [];
  for (const s of [-1, 1]) { const f = vmesh([P(xf(G.sph(0.09, 6, 5), [0, 0.04, 0.03], [0, 0, 0], [1, 0.6, 1.3]), 0xd9c8a8)]); f.position.x = s * 0.13; g.add(f); feet.push(f); }
  g.scale.setScalar(size);
  g.userData.parts = { body, head, eyes: ey, feet };
  return g;
}

export function makeWisp(color = 0xbfe8ff) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const core = new THREE.Mesh(G.sph(0.18, 10, 8), basic(color));
  core.position.y = 1.0; body.add(core);
  const flame = new THREE.Mesh(G.cone(0.14, 0.36, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  flame.position.y = 1.25; body.add(flame);
  const gl = glow(color, 1.8, 0.85); gl.position.y = 1.05; body.add(gl);
  const head = new THREE.Group(); head.position.y = 1.0; body.add(head);
  const ey = eyes(head, 0.02, 0.16, 0.06, 0.03, 0x2a3a5a);
  g.userData.parts = { body, head, eyes: ey };
  g.userData.float = true;
  g.userData.glow = gl;
  return g;
}

export function makeHermitCrab() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const shell = new THREE.ConeGeometry(0.5, 1.1, 10, 4);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const a = y * 2.2; const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)); }
  shell.computeVertexNormals();
  body.add(vmesh([P(xf(shell, [0, 0.75, -0.15], [-0.5, 0, 0]), 0xe8b088, { jitter: 0.15 }), P(xf(G.sph(0.3, 8, 6), [0, 0.35, 0.18], [0, 0, 0], [1.2, 0.8, 1]), 0xd86a4a)]));
  for (const s of [-1, 1]) body.add(vmesh([P(xf(G.sph(0.14, 6, 5), [s * 0.35, 0.3, 0.42], [0, 0, 0], [1.2, 0.8, 1]), 0xd86a4a)]));
  const head = new THREE.Group(); head.position.set(0, 0.6, 0.3); body.add(head);
  const ey = [];
  for (const s of [-1, 1]) {
    head.add(vmesh([P(xf(G.cyl(0.02, 0.02, 0.25, 4), [s * 0.1, 0.1, 0]), 0xd86a4a)]));
    const e = new THREE.Mesh(G.sph(0.06, 6, 5), lambert(0x201a18)); e.position.set(s * 0.1, 0.24, 0.02); head.add(e); ey.push(e);
  }
  const mono = new THREE.Mesh(G.tor(0.07, 0.012, 4, 10), lambert(0xd9b84a)); mono.position.set(0.1, 0.24, 0.07); head.add(mono);
  g.userData.parts = { body, head, eyes: ey };
  return g;
}

export function makeTortoise() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([
    P(xf(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.3, 0], [0, 0, 0], [1, 0.75, 1.2]), 0x9a7a4a, { jitter: 0.1 }),
    P(xf(G.tor(0.45, 0.06, 4, 16), [0, 0.82, 0], [Math.PI / 2, 0, 0]), 0xc9a24a, { top: 0.4 }),
    P(xf(G.cyl(0.12, 0.12, 0.1, 8), [0, 0.88, 0]), 0xc9a24a),
    P(xf(G.cyl(0.78, 0.8, 0.12, 14), [0, 0.3, 0], [0, 0, 0], [1, 1, 1.2]), 0x7a6a3a),
  ]));
  for (const [x, z] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]]) body.add(vmesh([P(xf(G.cyl(0.13, 0.15, 0.3, 6), [x, 0.15, z]), 0x8a9a6a)]));
  const key = new THREE.Group(); key.position.set(0, 0.95, -0.2);
  key.add(vmesh([P(xf(G.cyl(0.03, 0.03, 0.3, 5), [0, 0.12, 0]), 0xc9a24a), P(xf(G.tor(0.12, 0.03, 4, 10), [0, 0.32, 0]), 0xc9a24a)]));
  body.add(key);
  const head = new THREE.Group(); head.position.set(0, 0.45, 1.0); body.add(head);
  head.add(vmesh([P(G.sph(0.22, 10, 8), 0x8a9a6a)]));
  const ey = eyes(head, 0.06, 0.18, 0.1, 0.035);
  g.userData.parts = { body, head, eyes: ey, key };
  return g;
}

export function makePaperWoman() {
  const p = makePerson({ skin: 0xf7f3ea, cloth: 0xefe9dc, hair: 0xd9d2c4, bun: true, height: 1.1 });
  const { head } = p.userData.parts;
  head.add(vmesh([P(xf(G.cyl(0.015, 0.02, 0.5, 5), [0.05, 0.35, -0.22], [0.9, 0, 0.3]), 0xd8a03a)]));
  p.traverse((o) => { if (o.isMesh && o.material === VC) o.material = INK_PAPER; });
  return p;
}
const INK_PAPER = new THREE.MeshBasicMaterial({ vertexColors: true });

export function makeCat(color = 0xe0a060) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(vmesh([P(xf(blobGeo(0.32, 3, 0.05, 10, 8), [0, 0.25, 0], [0, 0, 0], [1, 0.75, 1.4]), color, { jitter: 0.12 })]));
  const tail = new THREE.Group(); tail.position.set(0, 0.25, -0.4); body.add(tail);
  tail.add(vmesh([P(xf(G.cyl(0.04, 0.06, 0.5, 5), [0, 0.15, -0.15], [-0.9, 0, 0]), color)]));
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.38); body.add(head);
  head.add(vmesh([P(G.sph(0.2, 10, 8), color, { jitter: 0.1 }), P(xf(G.cone(0.07, 0.15, 4), [-0.12, 0.2, 0], [0, 0, 0.3]), color), P(xf(G.cone(0.07, 0.15, 4), [0.12, 0.2, 0], [0, 0, -0.3]), color), P(xf(G.sph(0.08, 6, 5), [0, -0.05, 0.13], [0, 0, 0], [1.2, 0.7, 0.7]), 0xf7ecdc)]));
  const ey = [];
  for (const s of [-1, 1]) { const e = new THREE.Mesh(xf(G.tor(0.035, 0.012, 3, 8, Math.PI), [0, 0, 0], [0, 0, 0]), lambert(0x2a2220)); e.position.set(s * 0.08, 0.03, 0.18); head.add(e); ey.push(e); }
  g.userData.parts = { body, head, eyes: [], tail };
  return g;
}

// ---------- enemies ----------
export function makeEnemy(kind) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const parts = { body };
  const tintables = [];
  const add = (m) => { body.add(m); tintables.push(m); return m; };
  if (kind === 'mistling' || kind === 'mireling') {
    const c = kind === 'mistling' ? 0xc8d4ea : 0x6a4a7a;
    const m = new THREE.Mesh(blobGeo(0.45, 3, 0.05, 12, 10), new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.85, emissive: kind === 'mireling' ? 0x2a1030 : 0x30384a }));
    m.position.y = 0.42; m.scale.set(1, 0.8, 1); add(m);
    const ey = [];
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.07, 6, 5), basic(kind === 'mireling' ? 0xffd27a : 0x2a3450)); e.position.set(s * 0.15, 0.5, 0.38); body.add(e); ey.push(e); }
    parts.eyes = ey;
  } else if (kind === 'crab') {
    add(vmesh([P(xf(G.sph(0.42, 10, 6), [0, 0.32, 0], [0, 0, 0], [1.3, 0.55, 1]), 0xd8604a, { jitter: 0.1 })]));
    for (const s of [-1, 1]) {
      add(vmesh([P(xf(G.sph(0.17, 6, 5), [s * 0.6, 0.35, 0.3], [0, 0, 0], [1, 0.7, 1.3]), 0xe8705a)]));
      for (let i = 0; i < 3; i++) add(vmesh([P(xf(G.cyl(0.03, 0.03, 0.4, 4), [s * 0.45, 0.15, -0.2 + i * 0.2], [0, 0, s * 1.1]), 0xc8503a)]));
    }
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.06, 6, 5), lambert(0x201a18)); e.position.set(s * 0.12, 0.6, 0.25); body.add(e); }
  } else if (kind === 'jackdaw') {
    add(vmesh([P(xf(G.sph(0.3, 10, 8), [0, 0.0, 0], [0, 0, 0], [0.9, 0.85, 1.3]), 0x3a3a4a, { jitter: 0.12 }), P(xf(G.sph(0.2, 8, 6), [0, 0.2, 0.32]), 0x4a4a5a), P(xf(G.cone(0.07, 0.25, 5), [0, 0.18, 0.58], [Math.PI / 2, 0, 0]), 0xd9b84a), P(xf(G.box(0.25, 0.04, 0.3), [0, 0.05, -0.45], [0.3, 0, 0]), 0x2a2a3a)]));
    const wings = [];
    for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.22, 0.1, 0); w.add(vmesh([P(xf(G.box(0.55, 0.04, 0.35), [s * 0.28, 0, 0]), 0x2f2f3e)])); body.add(w); wings.push(w); tintables.push(w); }
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.045, 6, 5), basic(0xf3e7cf)); e.position.set(s * 0.1, 0.28, 0.48); body.add(e); }
    parts.wings = wings;
    body.position.y = 1.1;
  } else if (kind === 'moth') {
    add(vmesh([P(xf(G.cyl(0.08, 0.06, 0.5, 6), [0, 0, 0], [Math.PI / 2, 0, 0]), 0x6a5a4a), P(xf(G.sph(0.1, 6, 5), [0, 0.02, 0.28]), 0x6a5a4a)]));
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.add(vmesh([P(xf(G.box(0.5, 0.02, 0.62), [s * 0.27, 0, 0]), 0xf3ead6, { jitter: 0.03 }), P(xf(G.box(0.4, 0.025, 0.04), [s * 0.27, 0.01, 0.1]), 0x6a5a4a), P(xf(G.box(0.4, 0.025, 0.04), [s * 0.27, 0.01, -0.1]), 0x6a5a4a)]));
      body.add(w); wings.push(w); tintables.push(w);
    }
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.04, 6, 5), basic(0xffd27a)); e.position.set(s * 0.05, 0.06, 0.36); body.add(e); }
    const gl = glow(0xffe8b0, 1.0, 0.4); body.add(gl);
    parts.wings = wings;
    body.position.y = 1.2;
  } else if (kind === 'rootling') {
    add(vmesh([P(xf(G.cyl(0.25, 0.35, 0.6, 8), [0, 0.35, 0]), 0x7a5a3a, { jitter: 0.15 }), P(xf(G.cyl(0.26, 0.26, 0.04, 8), [0, 0.66, 0]), 0xc9a878), P(xf(G.cone(0.12, 0.35, 4), [0.05, 0.85, 0], [0, 0, 0.3]), 0x7aa84a), P(xf(G.cone(0.1, 0.3, 4), [-0.08, 0.82, 0], [0, 0, -0.5]), 0x8ab85a)]));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.05, 6, 5), basic(0xe8f0a0)); e.position.set(s * 0.1, 0.45, 0.28); body.add(e); }
  } else if (kind === 'beetle') {
    add(vmesh([P(xf(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.2, 0], [0, 0, 0], [1, 0.8, 1.25]), 0x6a7a8a, { jitter: 0.15 }), P(xf(G.box(0.03, 0.42, 1.2), [0, 0.42, 0], [0, 0, 0]), 0x4a5a6a), P(xf(G.sph(0.22, 8, 6), [0, 0.25, 0.65]), 0x3a4a5a)]));
    const rune = new THREE.Mesh(G.tor(0.15, 0.03, 4, 10), basic(0x9ff2e0)); rune.position.set(0, 0.62, 0); rune.rotation.x = Math.PI / 2; body.add(rune);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.05, 6, 5), basic(0x9ff2e0)); e.position.set(s * 0.1, 0.32, 0.84); body.add(e); }
  } else if (kind === 'smudgeling') {
    // a crumb rubbed off the Smudge, still cross about it
    add(vmesh([P(xf(roundBox(0.8, 0.52, 0.7, 0.18, 3), [0, 0.3, 0], [0.1, 0.4, 0.15]), 0xc49aa4, { jitter: 0.15, cool: 0.5 })]));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.07, 6, 5), lambert(0x3a3440)); e.position.set(s * 0.15, 0.42, 0.34); body.add(e); }
  } else if (kind === 'inkblot') {
    const m = new THREE.Mesh(blobGeo(0.42, 7, 0.12, 12, 10), new THREE.MeshLambertMaterial({ color: 0x2a3060, emissive: 0x0a0c20 }));
    m.position.y = 0.36; m.scale.set(1.1, 0.75, 1.1); add(m);
    const drip = new THREE.Mesh(G.cone(0.14, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0x2a3060, emissive: 0x0a0c20 })); drip.position.y = 0.82; add(drip);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.07, 6, 5), basic(0xf3ead6)); e.position.set(s * 0.15, 0.48, 0.36); body.add(e); }
    parts.drip = drip;
  } else if (kind === 'ruler') {
    // a pencil stub in armour, behind a wooden ruler
    add(vmesh([
      P(xf(G.cyl(0.26, 0.26, 0.9, 6), [0, 0.65, 0]), 0xe8b84a, { jitter: 0.06 }),
      P(xf(G.cyl(0.27, 0.27, 0.16, 8), [0, 1.16, 0]), 0xb8b8c0),
      P(xf(roundBox(0.5, 0.26, 0.5, 0.1, 3), [0, 1.34, 0]), 0xe8a0a8),
      P(xf(G.cone(0.26, 0.3, 6), [0, 0.06, 0], [Math.PI, 0, 0]), 0xf0d8a8),
    ]));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.045, 6, 5), lambert(0x3a3440)); e.position.set(s * 0.1, 0.85, 0.25); body.add(e); }
    const shield = new THREE.Group(); shield.position.set(0.05, 0.7, 0.42);
    const marks = [P(G.box(0.9, 1.2, 0.07), 0xd8b070, { jitter: 0.08 })];
    for (let i = 0; i < 8; i++) marks.push(P(xf(G.box(i % 2 ? 0.12 : 0.24, 0.02, 0.02), [-0.33 + (i % 2 ? 0 : 0.06), -0.5 + i * 0.14, 0.045]), 0x5a4030));
    shield.add(vmesh(marks)); body.add(shield); tintables.push(shield);
    parts.shield = shield;
  }
  g.userData.parts = parts;
  g.userData.tint = tintables;
  return g;
}

// ---------- keepsake / pickup ----------
export function makeShard(color = 0xfff1b8) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), basic(color));
  m.scale.set(0.7, 1.3, 0.7);
  g.add(m);
  const gl = glow(color, 1.6, 0.8); g.add(gl);
  g.userData.spin = m;
  return g;
}
export function makeLetterGlyph(color = 0xffe0a0) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(G.tor(0.18, 0.05, 6, 14, Math.PI * 1.5), basic(color));
  g.add(m);
  const gl = glow(color, 1.5, 0.8); g.add(gl);
  g.userData.spin = m;
  return g;
}

// ---------- the Smudge and the things from Ines's desk ----------
// a box with soft, rubbed-down corners
export function roundBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const c = new THREE.Vector3(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-6) off.setLength(r);
    p.setXYZ(i, c.x + off.x, c.y + off.y, c.z + off.z);
  }
  g.computeVertexNormals();
  return g;
}
// a sad, soft face drawn on in pencil
function sadFace(g, y, z, s = 1, color = 0x3a3440) {
  const m = lambert(color);
  const eyes = [];
  for (const k of [-1, 1]) {
    const e = new THREE.Mesh(G.sph(0.07 * s, 6, 5), m); e.position.set(k * 0.22 * s, y, z); e.scale.set(1, 1.3, 0.6); g.add(e); eyes.push(e);
    const b = new THREE.Mesh(G.box(0.2 * s, 0.03 * s, 0.03 * s), m); b.position.set(k * 0.24 * s, y + 0.16 * s, z); b.rotation.z = k * 0.35; g.add(b);
  }
  const mouth = new THREE.Mesh(G.tor(0.08 * s, 0.018 * s, 4, 10, Math.PI), m); mouth.position.set(0, y - 0.2 * s, z); g.add(mouth);
  return eyes;
}
export function makeSmudge(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  // worn at one end, the way an eraser goes
  const rub = roundBox(1.5, 1.0, 2.4, 0.32, 5);
  const p = rub.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z < -0.6) p.setY(i, y * (1 - (-0.6 - z) * 0.35) - (-0.6 - z) * 0.12); }
  rub.computeVertexNormals();
  body.add(vmesh([
    P(xf(rub, [0, 0.62, 0]), 0xd8b4b0, { jitter: 0.12, cool: 0.4 }),
    P(xf(G.box(1.56, 0.86, 1.1), [0, 0.62, 0.55]), 0x6f84a8, { jitter: 0.06 }),
    P(xf(G.box(1.58, 0.36, 0.5), [0, 0.66, 0.55]), 0xf3ead6, { jitter: 0.03 }),
  ]));
  const eyes = sadFace(body, 0.72, 1.23, 1.2);
  body.position.y = 0;
  g.userData.parts = { body, eyes };
  g.scale.setScalar(scale);
  return g;
}
export function makePage(color = 0xfff6dc) {
  const g = new THREE.Group();
  const m = vmesh([P(xf(G.box(0.42, 0.02, 0.56), [0, 0, 0], [0.3, 0, 0.15]), 0xf6efe0, { jitter: 0.03 }), P(xf(G.box(0.3, 0.025, 0.02), [0, 0.01, -0.1], [0.3, 0, 0.15]), 0x8a7a6a), P(xf(G.box(0.25, 0.025, 0.02), [0, 0.01, 0.02], [0.3, 0, 0.15]), 0x8a7a6a)], { shadow: false });
  const holder = new THREE.Group(); holder.add(m); g.add(holder);
  g.add(glow(color, 1.8, 0.85));
  g.userData.spin = holder;
  return g;
}
export function makeCharm(color = 0xffe0a0) {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(new THREE.Mesh(G.tor(0.16, 0.035, 6, 14), basic(0xe8c87a)));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), basic(color)); gem.position.y = -0.2; holder.add(gem);
  g.add(holder); g.add(glow(color, 1.6, 0.8));
  g.userData.spin = holder;
  return g;
}
export function makeSeaGlass(color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), lambert(color, { transparent: true, opacity: 0.85, emissive: color, emissiveIntensity: 0.35 }));
  m.scale.set(1.2, 0.5, 0.9); g.add(m); g.add(glow(color, 0.9, 0.7));
  g.userData.spin = m;
  return g;
}
export function makeLanternApple() {
  const g = new THREE.Group();
  g.add(vmesh([P(G.sph(0.17, 8, 6), 0xffc860, { jitter: 0.05 }), P(xf(G.cyl(0.015, 0.015, 0.12, 4), [0, 0.2, 0]), 0x6a4a2a)], { shadow: false }));
  g.children[0].material = basic(0xffd27a);
  g.add(glow(0xffc860, 1.4, 0.7));
  return g;
}
export function makeColorBook(color) {
  return vmesh([P(G.box(0.5, 0.14, 0.38), color, { jitter: 0.05 }), P(xf(G.box(0.46, 0.1, 0.36), [0.03, 0, 0]), 0xf3ead6, { jitter: 0.02 })]);
}
export function makeTeaCup() {
  const g = new THREE.Group();
  g.add(vmesh([P(xf(G.cyl(0.16, 0.11, 0.2, 10), [0, 0.1, 0]), 0xf6efe8), P(xf(G.tor(0.07, 0.02, 4, 8), [0.17, 0.11, 0], [0, 0, 0]), 0xf6efe8), P(xf(G.cyl(0.24, 0.22, 0.03, 12), [0, 0, 0]), 0xf6efe8)], { shadow: false }));
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lambert(0x9a6a3a)); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.18; g.add(tea);
  return g;
}
export function makeBramble(rng) {
  const geos = [P(blobGeo(0.38, rng() * 9, 0.25, 8, 6), 0x5a4a32, { jitter: 0.2 })];
  for (let i = 0; i < 9; i++) { const a = rng() * 6.28, b = rng() * 3; geos.push(P(xf(G.cone(0.05, 0.28, 4), [Math.cos(a) * Math.sin(b) * 0.38, Math.cos(b) * 0.38, Math.sin(a) * Math.sin(b) * 0.38], [b, a, 0]), 0x7a6a42)); }
  for (let i = 0; i < 3; i++) geos.push(P(xf(G.sph(0.07, 5, 4), [(rng() - 0.5) * 0.5, 0.3, (rng() - 0.5) * 0.5]), 0x8a3a5a));
  return vmesh(geos);
}
// things the grey took, given back
export function makeBench(color = 0x8a6a4a) {
  return vmesh([P(xf(G.box(1.8, 0.1, 0.5), [0, 0.5, 0]), color), P(xf(G.box(1.8, 0.4, 0.08), [0, 0.8, -0.24], [-0.15, 0, 0]), color), ...[-0.75, 0.75].map((x) => P(xf(G.box(0.1, 0.5, 0.45), [x, 0.25, 0]), 0x5a4030))]);
}
export function makeSwing() {
  const g = new THREE.Group();
  g.add(vmesh([P(xf(G.cyl(0.08, 0.1, 3, 6), [-1.2, 1.5, 0], [0, 0, 0.12]), 0x6a4a36), P(xf(G.cyl(0.08, 0.1, 3, 6), [1.2, 1.5, 0], [0, 0, -0.12]), 0x6a4a36), P(xf(G.cyl(0.07, 0.07, 2.6, 6), [0, 2.9, 0], [0, 0, Math.PI / 2]), 0x6a4a36)]));
  const seat = new THREE.Group(); seat.position.y = 2.85;
  seat.add(vmesh([P(xf(G.cyl(0.015, 0.015, 2.1, 3), [-0.35, -1.05, 0]), 0xd8c8a8), P(xf(G.cyl(0.015, 0.015, 2.1, 3), [0.35, -1.05, 0]), 0xd8c8a8), P(xf(G.box(0.85, 0.06, 0.3), [0, -2.1, 0]), 0xb8503a)]));
  g.add(seat); g.userData.seat = seat;
  return g;
}
export function makeCairn(rng) {
  const geos = [];
  let y = 0;
  for (let i = 0; i < 5; i++) { const r = 0.5 - i * 0.07; geos.push(P(xf(blobGeo(r, i * 3 + rng() * 5, 0.12, 8, 6), [(rng() - 0.5) * 0.1, y + r * 0.6, 0], [0, 0, 0], [1, 0.6, 1]), 0x9a9488)); y += r * 1.1; }
  geos.push(P(xf(G.cyl(0.025, 0.025, 1.4, 4), [0, y + 0.6, 0]), 0x6a4a36), P(xf(G.box(0.5, 0.3, 0.02), [0.25, y + 1.1, 0]), 0xd86a6a));
  return vmesh(geos);
}
export function makeReadingNook() {
  const g = new THREE.Group();
  g.add(vmesh([
    P(xf(roundBox(1.1, 0.5, 1, 0.15), [0, 0.45, 0]), 0x8a4a5a), P(xf(roundBox(1.1, 0.9, 0.3, 0.12), [0, 0.95, -0.4]), 0x8a4a5a),
    P(xf(roundBox(0.25, 0.5, 1, 0.1), [-0.55, 0.75, 0]), 0x7a3a4a), P(xf(roundBox(0.25, 0.5, 1, 0.1), [0.55, 0.75, 0]), 0x7a3a4a),
    P(xf(G.cyl(0.35, 0.35, 0.06, 10), [1.3, 0.7, 0.2]), 0x6a4a36), P(xf(G.cyl(0.05, 0.08, 0.7, 6), [1.3, 0.35, 0.2]), 0x5a3e2e),
    P(xf(G.box(0.3, 0.08, 0.22), [1.25, 0.77, 0.15]), 0x4a6a8a),
  ]));
  const lamp = makeLamppost(true, 0xffd27a); lamp.scale.setScalar(0.55); lamp.position.set(-1.1, 0, -0.3); g.add(lamp);
  return g;
}
export function makeShrine() {
  const g = new THREE.Group();
  g.add(vmesh([P(xf(G.box(1.6, 0.2, 1.6), [0, 0.1, 0]), 0x8a8478), ...[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z]) => P(xf(G.cyl(0.07, 0.08, 1.8, 6), [x, 1.0, z]), 0x6a5a4a)), P(xf(G.cone(1.3, 0.8, 4), [0, 2.2, 0], [0, Math.PI / 4, 0]), 0x5a6a5a)]));
  const bell = makeBell(0x9fb8c8); bell.scale.setScalar(0.45); bell.position.y = 1.6; g.add(bell);
  const gl = glow(0x9fe0ff, 2.2, 0.5); gl.position.y = 1.4; g.add(gl);
  return g;
}
