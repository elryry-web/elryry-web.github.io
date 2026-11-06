// Painted lands. `capture` photographs a land from the game's own camera angle and saves guide images
// for a painter (or an image generator) to work over; once a painting comes back, `wear` maps it onto the
// land, so every surface that was there when it was painted shows the painting instead of its 3D look.
// Files live in art/<land id>/: capture.json, depth16.png (for the game), color.png, depth.png and
// lines.png (for the painter), and painting.png (or painting-<phase>.png for a time of day of its own).
import * as THREE from 'three';
import { PAINT } from './style.js';
import { PALETTES } from './land.js';

// how far (world units) a surface may sit from where it was painted and still wear the painting
const TOL = 0.3;
const PAINT_EXT = ['png', 'jpg', 'webp'];
const cache = new Map();

// everything that moves about or comes and goes: none of it belongs in the painting
function transient(L) {
  const out = [L.pObj, L.chargeRing, L.fx.points, L.dust.points, ...(L.butterflies || [])];
  for (const n of L.npcs) out.push(n.obj, n.obj.userData.blob);
  for (const e of L.enemies) out.push(e.obj, e.obj.userData.blob);
  for (const k of L.pickups) out.push(k.obj);
  for (const s of L.shots) out.push(s.blob, s.marker);
  for (const e of L.effects) out.push(e.obj);
  L.scene.traverse((o) => { if (o.isSprite || o.isPoints) out.push(o); });
  if (L.pObj.userData.blob) out.push(L.pObj.userData.blob);
  return out.filter(Boolean);
}

// An orthographic camera looking the same way as the game's, framing the whole land.
function frame(L, cam, longSide) {
  // the island itself (down to where the mist swallows the cliffs), plus whatever stands on it
  const pts = [];
  const R = (L.def.radius || 21) + 6;
  for (let x = -R; x <= R; x += 0.5) for (let z = -R; z <= R; z += 0.5) {
    if (L.mask(x, z) <= 0.02) continue;
    pts.push(new THREE.Vector3(x, L.heightAt(x, z), z), new THREE.Vector3(x, -3, z));
  }
  for (const o of L.scene.children) {
    if (!o.visible || o === L.mist || o === L.terrain || o === L.waterMesh || o.isLight) continue;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty() || Math.abs(b.min.x) > 80 || Math.abs(b.min.z) > 80) continue;
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  }
  const center = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  c.position.copy(center).add(cam.offset);
  c.lookAt(center);
  c.updateMatrixWorld();
  const inv = c.matrixWorldInverse, v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of pts) {
    v.copy(q).applyMatrix4(inv);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
  }
  const pad = 1.2;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  // pixel sizes in multiples of 64, which image generators prefer
  const k = longSide / Math.max(x1 - x0, y1 - y0);
  const W = Math.ceil(((x1 - x0) * k) / 64) * 64, H = Math.ceil(((y1 - y0) * k) / 64) * 64;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  c.left = cx - W / k / 2; c.right = cx + W / k / 2; c.bottom = cy - H / k / 2; c.top = cy + H / k / 2;
  c.near = -z1 - 2; c.far = -z0 + 2;
  c.updateProjectionMatrix();
  return { c, W, H, pxPerUnit: k };
}

function toCanvas(W, H, fill) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  return cv;
}
const pngOf = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

async function save(path, body) {
  const r = await fetch('/__save?path=' + encodeURIComponent(path), { method: 'POST', body });
  if (!r.ok) throw new Error(`Couldn't save ${path}: ${r.status}. Captures need the local server (node serve.mjs).`);
}

// Photograph the current land for painting. Run it in a land at midday, from the console with ?dev.
export async function capture(game, longSide = 2048) {
  const L = game.land, R = game.renderer, gl = R.renderer.getContext();
  if (!L) throw new Error('Go into a land first.');
  PAINT.paintOn.value = 0;
  const hidden = transient(L).filter((o) => o.visible);
  hidden.forEach((o) => { o.visible = false; });
  const fog = L.scene.fog; L.scene.fog = null;
  const { c, W, H, pxPerUnit } = frame(L, game.cam, longSide);
  const u = R.post.uniforms, pr = R.pixelRatio;
  R.renderer.setPixelRatio(1);
  R.renderer.setSize(W, H, false);
  R.rt.setSize(W, H);
  u.resolution.value.set(W, H);
  const range = u.depthRange.value;
  u.depthRange.value = c.far - c.near;
  const shot = (mode) => {
    u.captureMode.value = mode;
    R.render(L.scene, c, game.time);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  let color, lines, depth;
  try {
    // the mist reaches past the edge of the picture...
    const far = c.far;
    L.mist.scale.setScalar(4);
    c.far = far + 600; c.updateProjectionMatrix(); u.depthRange.value = c.far - c.near;
    color = shot(1); lines = shot(2);
    c.far = far; c.updateProjectionMatrix(); u.depthRange.value = c.far - c.near;
    L.mist.scale.setScalar(1);
    // ...but isn't part of the land, nor is anything under it, so the depth leaves them out
    L.mist.visible = false;
    R.renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -L.mist.position.y)];
    depth = shot(3);
  } finally {
    R.renderer.clippingPlanes = [];
    L.mist.visible = true;
    L.mist.scale.setScalar(1);
    u.captureMode.value = 0;
    u.depthRange.value = range;
    R.renderer.setPixelRatio(pr);
    R.resize();
    L.scene.fog = fog;
    hidden.forEach((o) => { o.visible = true; });
  }
  // readPixels rows run bottom-up, images top-down
  const flip = (src, fn) => (d) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fn(d, (y * W + x) * 4, ((H - 1 - y) * W + x) * 4, src); };
  const copy = (d, o, i, s) => { d[o] = s[i]; d[o + 1] = s[i + 1]; d[o + 2] = s[i + 2]; d[o + 3] = 255; };
  // depth guide: near is white, the empty air black, stretched over what's actually there
  let lo = 1, hi = 0;
  for (let i = 0; i < W * H; i++) { const d = (depth[i * 4] * 256 + depth[i * 4 + 1]) / 65535; if (d < 0.999) { lo = Math.min(lo, d); hi = Math.max(hi, d); } }
  const vis = (d, o, i, s) => {
    const v = (s[i] * 256 + s[i + 1]) / 65535;
    const g = v >= 0.999 ? 0 : 255 * (1 - (v - lo) / Math.max(1e-6, hi - lo)) * 0.9 + 25;
    d[o] = d[o + 1] = d[o + 2] = g; d[o + 3] = 255;
  };
  const dir = `art/${L.id}/`;
  const meta = {
    land: L.id, phase: L.phase, width: W, height: H, pxPerUnit,
    viewProjection: new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements,
    depthRange: c.far - c.near, made: new Date().toISOString(),
  };
  await save(dir + 'color.png', await pngOf(toCanvas(W, H, flip(color, copy))));
  await save(dir + 'lines.png', await pngOf(toCanvas(W, H, flip(lines, copy))));
  await save(dir + 'depth.png', await pngOf(toCanvas(W, H, flip(depth, vis))));
  await save(dir + 'depth16.png', await pngOf(toCanvas(W, H, flip(depth, copy))));
  await save(dir + 'capture.json', JSON.stringify(meta, null, 1));
  cache.delete(L.id);
  return `Saved ${dir}: ${W} x ${H}, ${L.phase}. Paint over color.png and save it as ${dir}painting.png.`;
}

const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function firstImage(names) {
  for (const n of names) { try { return await loadImage(n); } catch { /* try the next */ } }
  return null;
}

// Everything a land needs to wear its painting, or null if it hasn't one.
async function load(id, phase) {
  const key = id + ':' + phase;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const r = await fetch(`art/${id}/capture.json`).catch(() => null);
    if (!r || !r.ok) return null;
    const meta = await r.json();
    const dir = `art/${id}/`;
    const img = await firstImage([...PAINT_EXT.map((e) => `${dir}painting-${phase}.${e}`), ...PAINT_EXT.map((e) => `${dir}painting.${e}`)]);
    const dimg = img && await firstImage([dir + 'depth16.png']);
    if (!img || !dimg) return null;
    const map = new THREE.Texture(img);
    // the scene's render target holds display values as they are, so the painting goes in untouched
    map.colorSpace = THREE.NoColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;
    // unpack the depth into floats, bottom row first like a texture
    const W = dimg.width, H = dimg.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(dimg, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data, f = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; f[(H - 1 - y) * W + x] = (px[i] * 256 + px[i + 1]) / 65535; }
    const depth = new THREE.DataTexture(f, W, H, THREE.RedFormat, THREE.FloatType);
    depth.magFilter = depth.minFilter = THREE.NearestFilter;
    depth.needsUpdate = true;
    const own = img.src.includes(`painting-${phase}.`);
    return { meta, map, depth, W, H, own };
  })();
  cache.set(key, job);
  return job;
}

// roughly how much light falls on open ground at a time of day, so one painting can be dimmed for another
function light(phase) {
  const p = PALETTES[phase], d = new THREE.Vector3(...p.dir).normalize();
  const sky = new THREE.Color(p.hemiSky).multiplyScalar(p.hemiI);
  return sky.add(new THREE.Color(p.sun).multiplyScalar(p.sunI * Math.max(0, d.y)));
}

// Put the land's painting on, if it has one. Called whenever a land is built.
export async function wear(L) {
  PAINT.paintOn.value = 0;
  if (L.def.paper || L.game.noPainting) return false;
  const P = await load(L.id, L.phase);
  if (!P || L.game.land !== L) return false;
  PAINT.paintMap.value = P.map;
  PAINT.paintDepth.value = P.depth;
  PAINT.paintVP.value.fromArray(P.meta.viewProjection);
  PAINT.paintTexel.value.set(1 / P.W, 1 / P.H);
  PAINT.paintTol.value = TOL / P.meta.depthRange;
  const t = PAINT.paintTint.value.setRGB(1, 1, 1);
  if (!P.own && P.meta.phase !== L.phase) {
    const a = light(L.phase), b = light(P.meta.phase);
    t.setRGB(Math.min(1.2, a.r / b.r), Math.min(1.2, a.g / b.g), Math.min(1.2, a.b / b.b));
  }
  PAINT.paintOn.value = 1;
  L.painted = true;
  // the painting has its grass, its water and its stillness painted in
  for (const g of L.grassFields) g.visible = false;
  L.swayers.forEach((s) => { s.rotation.z = 0; });
  if (L.waterMesh) { L.waterMesh.material.transparent = false; L.waterMesh.material.needsUpdate = true; }
  return true;
}
