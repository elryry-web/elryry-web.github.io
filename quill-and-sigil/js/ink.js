'use strict';
/* =====================================================================
   QUILL & SIGIL — ink.js
   Sigil definitions, stroke recognizer, spell drafting & the Grimoire page
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// true while the player is using a finger rather than a mouse (main.js keeps the body class current)
const isTouch = () => document.body.classList.contains('touch');
// Unda's signs only shape the water it places; it flows (a current along the signs' averaged way) only when Ventus
// is set upon its ring — as Luna only lifts, and Ventus on its ring makes it sail
const tideCurrent = sp => sp.sigil === 'tide' && !!sp.dir && (sp.sats || []).some(s => s.id === 'gale');
// how signs work — shown on the grimoire's left page, and on the Notes leaf on phones
const SIGN_NOTES = {
  plain: 'A sign is a stroke drawn outward through one of the eight small circles: it points the spell as the world lies. A short barb across it adds strength, two at most. Unadorned, stone, fire, ice and water set one tile; each sign is its own arm: opposite signs make one line through your mark; signs at right angles fill the ground between.',
  // added to the plain notes only once Featherfall II has taught the outer circle (ringTaught)
  ring: ' An outer circle around the seal widens the spell; around Luna, it doubles how far the float carries.',
  combos: 'A sign points the spell as the world lies; each barb across it adds strength. On Luna, the sign and barbs aim and strengthen only what rides on its ring. Each place on the ring holds one mark. A small sigil in a slot infuses the spell: behind the sign (red) it acts at once, where what the spell moves stands as the spell takes hold; beside it (blue), along the way, once it has left that spot and until it comes to rest; ahead of it (green), on arrival, where it comes to rest. Fire, frost, water or stone at once or on arrival flares once, round that spot; along the way it rides with what the spell moves and touches what it passes. On the ring of a gust, Petra along the way turns what the wind moves to stone; at once or on arrival, stone rises under it. Luna on a ring floats what the spell holds ten tiles for each Luna. On the ring of fire, stone, ice or water, each Ventus carries every arm two tiles farther. Only Ventus and Luna in the centre keep time: around stone, fire, ice or water the slots stay gold.',
};
// has the outer circle been taught yet? (Featherfall II teaches it; before that nothing mentions or shows it)
function ringTaught(L = Game.level) {
  if (!L || typeof LEVELS === 'undefined') return true;
  const at = LEVELS.findIndex(l => l.name === 'Featherfall II');
  return at < 0 || LEVELS.indexOf(L) >= at;
}
const signNotes = L => L && L.combos ? SIGN_NOTES.combos : SIGN_NOTES.plain + (ringTaught(L) ? SIGN_NOTES.ring : '');
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------------- Sigils ---------------- */
const SIGILS = {
  gale:  { id: 'gale',  name: 'Ventus', en: 'Gale',  color: '#9ff0d6', glyph: 'spiral',   words: 'VENTVS · AERIS · SPIRITVS · ',     desc: 'The spiral. Wind thrusts all within the seal.' },
  stone: { id: 'stone', name: 'Petra',  en: 'Stone', color: '#ecc890', glyph: 'square',   words: 'PETRA · FVNDAMENTVM · TERRAE · ',  desc: 'The square. Raises stone, even from empty air.' },
  flame: { id: 'flame', name: 'Ignis',  en: 'Flame', color: '#ffa04d', glyph: 'triangle', words: 'IGNIS · ARDOR · FLAMMA · ',         desc: 'The triangle. Kindles what burns; melts ice.' },
  tide:  { id: 'tide',  name: 'Unda',   en: 'Tide',  color: '#6fc2ff', glyph: 'wave',     words: 'VNDA · FLVMEN · MARIS · ',          desc: 'The wave. Fills hollows; Ventus on its ring makes it flow.' },
  frost: { id: 'frost', name: 'Gelu',   en: 'Frost', color: '#d6f2ff', glyph: 'star',     words: 'GELV · GLACIES · HIEMS · ',         desc: 'The star. Freezes water and rimes the ground.' },
  luna:  { id: 'luna',  name: 'Luna',   en: 'Float', color: '#cdb0ff', glyph: 'moon',     words: 'LVNA · LEVITAS · AETHER · ',        desc: 'The crescent. Lifts what rests; only wind or water moves it.' },
};
const SIGIL_ORDER = ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'];

/* Ideal glyph polylines in unit space (-1..1, y down) */
function glyphLines(g) {
  const P = [];
  switch (g) {
    case 'spiral':
      for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * TAU * 2.2, r = 0.05 + 0.8 * t; P.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return [P];
    case 'square': return [[[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [-0.6, -0.6]]];
    case 'triangle': return [[[0, -0.72], [0.68, 0.52], [-0.68, 0.52], [0, -0.72]]];
    case 'wave':
      for (let i = 0; i <= 60; i++) { const t = i / 60; P.push([-0.8 + 1.6 * t, -0.3 * Math.sin(t * TAU * 1.5)]); }
      return [P];
    case 'star':
      for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * TAU * 2 / 5; P.push([Math.cos(a) * 0.78, Math.sin(a) * 0.78 + 0.06]); }
      return [P];
    case 'moon':
      for (let i = 0; i <= 40; i++) { const a = (40 + 280 * i / 40) * Math.PI / 180; P.push([Math.cos(a) * 0.72 - 0.08, Math.sin(a) * 0.72]); }
      for (let i = 0; i <= 30; i++) { const a = (300 - 240 * i / 30) * Math.PI / 180; P.push([0.14 + 0.52 * Math.cos(a), 0.52 * Math.sin(a)]); }
      return [P];
  }
  return [];
}

/* ---------------- Recognizer ($1-style, rotation-limited, start-invariant for closed shapes) ---------------- */
const RN = 48;
function pathLen(p) { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return d; }
function resample(pts, n) {
  const L = pathLen(pts), I = L / (n - 1);
  const out = [{ x: pts[0].x, y: pts[0].y }];
  if (I <= 1e-9) { while (out.length < n) out.push({ x: pts[0].x, y: pts[0].y }); return out; }
  let D = 0, prev = { x: pts[0].x, y: pts[0].y };
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    let d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    while (D + d >= I && out.length < n) {
      const t = (I - D) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q); prev = q; D = 0;
      d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    }
    D += d; prev = { x: cur.x, y: cur.y };
  }
  const last = pts[pts.length - 1];
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}
function normalizePts(p) {
  let cx = 0, cy = 0;
  for (const q of p) { cx += q.x; cy += q.y; }
  cx /= p.length; cy /= p.length;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const s = Math.max(x1 - x0, y1 - y0) || 1;
  return p.map(q => ({ x: (q.x - cx) / s, y: (q.y - cy) / s }));
}
const prepOpen = raw => normalizePts(resample(raw, RN));
function prepClosed(raw) { const r = resample(raw.concat([raw[0]]), RN + 1); r.pop(); return normalizePts(r); }

const ROTS = {
  small: [-0.3, -0.15, 0, 0.15, 0.3],
  mid: [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75],
  all: Array.from({ length: 16 }, (_, i) => i * TAU / 16),
};
const TEMPLATES = [];
(function buildTemplates() {
  const toPts = a => a.map(([x, y]) => ({ x, y }));
  const mx = a => a.map(([x, y]) => [-x, y]);
  const add = (sigil, pts, closed, rot) => TEMPLATES.push({ sigil, closed, rot: ROTS[rot], pts: closed ? prepClosed(toPts(pts)) : prepOpen(toPts(pts)) });
  // Gale — spirals of various tightness, both chiralities
  for (const turns of [1.6, 2.2, 3]) {
    const p = [];
    for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * TAU * turns, r = 0.05 + t; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
    add('gale', p, false, 'all'); add('gale', mx(p), false, 'all');
  }
  // Stone — square and diamond
  add('stone', glyphLines('square')[0].slice(0, 4), true, 'small');
  add('stone', [[0, -1], [1, 0], [0, 1], [-1, 0]], true, 'small');
  // Flame — triangle
  add('flame', glyphLines('triangle')[0].slice(0, 3), true, 'small');
  // Tide — waves
  for (const per of [1, 1.5, 2, 2.5]) for (const sg of [1, -1]) {
    const p = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60; p.push([-1 + 2 * t, -sg * 0.32 * Math.sin(t * TAU * per)]); }
    add('tide', p, false, 'small');
  }
  // Frost — pentagram
  // (a pentagram repeats every 72°, so ±43° covers any tilt)
  add('frost', glyphLines('star')[0].slice(0, 5), true, 'mid');
  // Luna — closed crescent & open C, both facings
  const moon = glyphLines('moon')[0];
  add('luna', moon, true, 'mid'); add('luna', mx(moon), true, 'mid');
  const arc = [];
  for (let i = 0; i <= 40; i++) { const a = (45 + 270 * i / 40) * Math.PI / 180; arc.push([Math.cos(a), Math.sin(a)]); }
  // (any turn, as the closed crescents, so an open C opening up or down still reads)
  add('luna', arc, false, 'all'); add('luna', mx(arc), false, 'all');
  // thin, banana-like crescents (outer circle r=1, bitten by a circle offset d with radius ri), any orientation
  for (const [d, ri] of [[0.3, 0.92], [0.45, 0.95], [0.2, 0.98], [0.55, 0.85]]) {
    const xi = (1 + d * d - ri * ri) / (2 * d), yi = Math.sqrt(Math.max(0, 1 - xi * xi));
    const a0 = Math.atan2(yi, xi), b0 = Math.atan2(yi, xi - d), p = [];
    for (let i = 0; i <= 30; i++) { const a = a0 + (TAU - 2 * a0) * i / 30; p.push([Math.cos(a), Math.sin(a)]); }
    for (let i = 1; i < 30; i++) { const a = -b0 - (TAU - 2 * b0) * i / 30; p.push([d + ri * Math.cos(a), ri * Math.sin(a)]); }
    add('luna', p, true, 'all');
  }
  // a plain circle is a seal, never a sigil
  const circ = [];
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; circ.push([Math.cos(a), Math.sin(a)]); }
  add('none', circ, true, 'small');
})();

/* Sharpest turn along the stroke (radians over a short window), after light smoothing */
function maxTurn(raw) {
  const r = resample(raw, 64);
  const s = r.map((p, i) => {
    const a = r[Math.max(0, i - 1)], b = r[Math.min(63, i + 1)];
    return { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
  });
  let mx = 0;
  for (let i = 4; i < 60; i++) {
    const a1 = Math.atan2(s[i].y - s[i - 4].y, s[i].x - s[i - 4].x), a2 = Math.atan2(s[i + 4].y - s[i].y, s[i + 4].x - s[i].x);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = TAU - d;
    mx = Math.max(mx, d);
  }
  return mx;
}
/* How far apart a stroke's ends are, relative to its size (small = closed shape) */
function endGap(raw) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of raw) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return Math.hypot(raw[0].x - raw[raw.length - 1].x, raw[0].y - raw[raw.length - 1].y) / (Math.max(x1 - x0, y1 - y0) || 1);
}
/* Corners of a closed shape: peaks of turning around the loop (a triangle has 3, a square 4) */
function cornerCount(raw) {
  const N = 72, r = resample(raw.concat([raw[0]]), N + 1); r.pop();
  const w = 3, turn = [];
  for (let i = 0; i < N; i++) {
    const a = r[(i - w + N) % N], p = r[i], b = r[(i + w) % N];
    let d = Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x);
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    turn.push(Math.abs(d));
  }
  // greedy peak picking: strongest turns first, keep peaks well apart
  const order = turn.map((t, i) => i).sort((i, j) => turn[j] - turn[i]), peaks = [];
  for (const i of order) {
    if (turn[i] < 0.75) break;
    if (peaks.every(j => Math.min(Math.abs(i - j), N - Math.abs(i - j)) > 7)) peaks.push(i);
  }
  return peaks.length;
}
/* How well a closed stroke fits a triangle and a quadrilateral: the best polygon with its corners on the stroke,
   scored by how far the stroke strays from it at worst (over the shape's size). cornerCount looks for sharp turns,
   and a corner drawn soft (a fingertip, or the pen smoothing in a small ring slot) spreads its turn out until it
   isn't one; a soft square then counted 3 and read as Ignis. A square can't be fitted by any triangle (b3 ≈ 0.2–0.3)
   but fits four sides closely (b4 ≲ 0.1) however round its corners; a triangle fits three (b3 ≲ 0.1); a circle
   fits neither (b3 ≈ 0.25, b4 ≈ 0.14). */
function polyFit(raw) {
  const M = 36, r = resample(raw.concat([raw[0]]), M + 1); r.pop();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  // E[i][j]: the worst stray of the stroke from i on to j off the straight side i–j
  const E = Array.from({ length: M }, () => new Float64Array(M));
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    if (i === j) continue;
    const a = r[i], b = r[j], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1e-12;
    let m = 0;
    for (let k = (i + 1) % M; k !== j; k = (k + 1) % M) {
      const p = r[k], t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
      m = Math.max(m, Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy));
    }
    E[i][j] = m / size;
  }
  let b3 = 1e9, b4 = 1e9;
  for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
    const eij = E[i][j];
    if (eij >= b3 && eij >= b4) continue;
    for (let k = j + 1; k < M; k++) {
      const e3 = Math.max(eij, E[j][k]);
      b3 = Math.min(b3, Math.max(e3, E[k][i]));
      if (e3 >= b4) continue;
      for (let l = k + 1; l < M; l++) b4 = Math.min(b4, Math.max(e3, E[k][l], E[l][i]));
    }
  }
  return { b3, b4 };
}
/* Spirals are best told by their winding: steady turning while the radius grows */
function spiralTest(raw) {
  const rs = resample(raw, 64);
  let cx = 0, cy = 0; for (const p of rs) { cx += p.x; cy += p.y; } cx /= 64; cy /= 64;
  let wind = 0;
  const R = rs.map(p => Math.hypot(p.x - cx, p.y - cy));
  for (let i = 1; i < 64; i++) {
    let da = Math.atan2(rs[i].y - cy, rs[i].x - cx) - Math.atan2(rs[i - 1].y - cy, rs[i - 1].x - cx);
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; wind += da;
  }
  // correlation of radius with progress along the stroke
  let mi = 31.5, mr = R.reduce((a, b) => a + b, 0) / 64, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < 64; i++) { sxy += (i - mi) * (R[i] - mr); sxx += (i - mi) ** 2; syy += (R[i] - mr) ** 2; }
  const corr = sxy / Math.sqrt(sxx * syy || 1);
  return { turns: Math.abs(wind) / TAU, corr: Math.abs(corr) };
}

function tplDist(c, t, shift, cs, sn) {
  let d = 0;
  for (let i = 0; i < RN; i++) {
    const p = c[(i + shift) % RN];
    const x = p.x * cs - p.y * sn, y = p.x * sn + p.y * cs;
    d += Math.hypot(x - t[i].x, y - t[i].y);
  }
  return d / RN;
}
const SIGIL_ACCEPT = 0.135;
/* A closed shape is often drawn with a little hook or overshoot where the pen comes back to its start (a crescent
   once read as Ignis because its hook counted as a third corner). Keep just the loop: from the point near the
   start to the point near the end where the stroke closes best — only when that closes it much better than its own ends,
   and only within the first and last fifth of the stroke, so open shapes (spirals, waves, an open C) are never cut. */
function trimLoop(raw) {
  const n = raw.length;
  if (n < 12) return raw;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of raw) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const size = Math.max(x1 - x0, y1 - y0) || 1, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  const L = cum[n - 1], d0 = Math.hypot(raw[0].x - raw[n - 1].x, raw[0].y - raw[n - 1].y);
  let best = Infinity, bi = 0, bj = n - 1;
  for (let i = 0; i < n && cum[i] <= 0.2 * L; i++) for (let j = n - 1; j > i && cum[j] >= 0.8 * L; j--) {
    const d = Math.hypot(raw[i].x - raw[j].x, raw[i].y - raw[j].y);
    if (d < best) { best = d; bi = i; bj = j; }
  }
  if (best > 0.12 * size || best > d0 - 0.04 * size || (bi === 0 && bj === n - 1)) return raw;
  return raw.slice(bi, bj + 1);
}
/* a spiral has its eye in the middle: one end near the centre of the shape, the other out on its rim.
   (A hand spiral is often a round loop with a short curl inside, so its radius barely grows until the end.) */
function spiralEye(raw) {
  const rs = resample(raw, 64);
  let cx = 0, cy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of rs) { cx += p.x; cy += p.y; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  cx /= 64; cy /= 64;
  const size = Math.max(x1 - x0, y1 - y0) || 1, a = raw[0], b = raw[raw.length - 1];
  const d0 = Math.hypot(a.x - cx, a.y - cy) / size, d1 = Math.hypot(b.x - cx, b.y - cy) / size;
  return Math.min(d0, d1) < 0.3 && Math.max(d0, d1) > 0.36;
}
function recognize(raw) {
  if (raw.length < 4 || pathLen(raw) < 0.05) return null;
  // a star: a closed stroke with five sharp points. (It winds twice round its middle like a spiral does, so it
  // must be told apart first; hand stars often missed the template, or read as Ventus.)
  // (a star winds about twice and its radius doesn't grow; a tight spiral's eye can show five sharp spots too)
  const tr = trimLoop(raw), sp0 = spiralTest(raw);
  const starry = sp0.turns < 2.5 && sp0.corr < 0.75 && endGap(tr) < 0.45 && maxTurn(tr) > 1.6 && cornerCount(tr) === 5;
  // a loop that goes on curling inward is a spiral, not a closed shape with a hook: keep its curl
  const curled = !starry && sp0.turns > 1.3 && spiralEye(raw);
  if (!curled) raw = trimLoop(raw);
  const open = prepOpen(raw), closed = prepClosed(raw);
  const V = { open: [open, open.slice().reverse()], closed: [closed, closed.slice().reverse()] };
  const best = {};
  for (const T of TEMPLATES) {
    const cands = T.closed ? V.closed : V.open;
    for (const c of cands) {
      for (let s = 0; s < (T.closed ? RN : 1); s += 2) {
        for (const a of T.rot) {
          const d = tplDist(c, T.pts, s, Math.cos(a), Math.sin(a));
          if (best[T.sigil] === undefined || d < best[T.sigil]) best[T.sigil] = d;
        }
      }
    }
  }
  const sp = spiralTest(raw);
  if (starry) { best.frost = Math.min(best.frost, 0.05 + Math.max(0, best.frost - 0.05) * 0.3); best.gale += 0.06; }
  else if (sp.turns > 1.25 && (sp.corr > 0.75 || curled)) best.gale = Math.min(best.gale, 0.04 + Math.max(0, 0.9 - Math.max(sp.corr, 0.75)) * 0.2);
  // an open stroke (ends far apart) is never a plain circle
  const gap = endGap(raw);
  // closed polygons: a triangle is three straight sides and a square four, however soft their corners and whichever
  // way they point (polyFit). Only a shape that is neither falls back on counting its sharp corners.
  const closedPoly = gap < 0.3 && sp.turns < 1.25, pf = closedPoly ? polyFit(raw) : null;
  const tri = !!pf && pf.b3 < 0.14, quad = !!pf && pf.b3 > 0.17 && pf.b4 < 0.115;
  // corners: a square must have them; circles and crescents must not (a fitted square or triangle has them,
  // even when drawn too softly for a sharp turn)
  const sharp = maxTurn(raw);
  if (sharp < 0.85) {
    if (!quad) best.stone += 0.08;
    if (!tri) best.flame += 0.05;
    best.frost += 0.05;
  } else if (sharp > 1.15) best.none += 0.06;
  // (0.42 ≈ a circle left open by 50°: less open than that it is still a circle, never an open-C Luna)
  if (gap > 0.42) best.none += 0.1;
  if (closedPoly) {
    const cc = tri || quad ? 0 : cornerCount(raw);
    if (tri) { best.flame = Math.min(best.flame, 0.05 + Math.max(0, best.flame - 0.05) * 0.25); best.stone += 0.06; }
    else if (quad) { best.stone = Math.min(best.stone, 0.05 + Math.max(0, best.stone - 0.05) * 0.4); best.flame += 0.06; best.none += 0.06; }
    else if (cc === 2) { best.luna = Math.min(best.luna, 0.05 + Math.max(0, best.luna - 0.05) * 0.5); best.none += 0.06; }
  }
  let id = null, d = 1e9;
  for (const k in best) if (best[k] < d) { d = best[k]; id = k; }
  if (id === 'none') return { id: null, d, ok: false, circle: true, scores: best };
  return { id, d, ok: d < SIGIL_ACCEPT, scores: best };
}

/* A closed, roundish stroke qualifies as a seal */
function circleFit(pts) {
  if (pts.length < 8) return null;
  const rs = resample(pts, 64);
  const centre = q => { let x = 0, y = 0; for (const p of q) { x += p.x; y += p.y; } return { x: x / q.length, y: y / q.length }; };
  // the running angle swept about c, point by point
  const sweep = c => { const cum = [0]; let ang = 0; for (let i = 1; i < rs.length; i++) { let da = Math.atan2(rs[i].y - c.y, rs[i].x - c.x) - Math.atan2(rs[i - 1].y - c.y, rs[i - 1].x - c.x); while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; cum.push(ang += da); } return cum; };
  // A hand that closes its circle by running on past the start (v175: Ryan's Moon Road seal was refused) is judged on its
  // first full turn: the overshoot neither drags the centre toward itself nor counts as an end left far from the start.
  // Two passes, since the overshoot first skews the centre the turn is measured about.
  let c = centre(rs), cum = sweep(c), k = cum.findIndex(a => Math.abs(a) >= TAU);
  if (k > 0) { c = centre(rs.slice(0, k + 1)); cum = sweep(c); k = cum.findIndex(a => Math.abs(a) >= TAU); }
  const turn = k > 0 ? rs.slice(0, k + 1) : rs;
  if (k > 0) c = centre(turn);
  const rad = p => Math.hypot(p.x - c.x, p.y - c.y);
  let m = 0; for (const p of turn) m += rad(p); m /= turn.length;
  let sd = 0; for (const p of turn) sd += (rad(p) - m) ** 2; sd = Math.sqrt(sd / turn.length);
  // how far it is from closing, in radii: the end's distance from the start; or, for an overshoot, how far the second pass
  // strays from the first at the same angle, scaled so a stray of 0.2 radius sits at the 0.75 limit a gap has — an overshoot
  // that rides back over its start closes, a spiral whose second turn grows away from the first does not
  let gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) / m;
  if (k > 0) {
    let st = 0, n = 0, i = 0;
    for (let j = k; j < rs.length; j++) {
      const want = cum[j] - Math.sign(cum[j]) * TAU;
      while (i < k && Math.abs(cum[i + 1]) <= Math.abs(want)) i++;
      st += Math.abs(rad(rs[j]) - rad(rs[i])); n++;
    }
    gap = Math.min(gap, st / n / m * 3.75);
  }
  return { cx: c.x, cy: c.y, r: m, round: sd / m, cover: Math.abs(cum[cum.length - 1]), gap };
}

/* ---------------- Draft: strokes -> structure -> spell ---------------- */
class Draft {
  constructor() { this.strokes = []; this.a = this.analyze(); }
  clear() { this.strokes = []; this.a = this.analyze(); }
  add(s) { this.strokes.push(s); this.a = this.analyze(); return this.a; }
  undo() { this.strokes.pop(); this.a = this.analyze(); }
  analyze() {
    const A = { seal: null, sealIdx: -1, sigilPts: [], sigilIdx: [], signs: [], amp: false, sigil: null, roles: [], notes: [], slotStrokes: {}, sats: [] };
    const cands = [];
    // the seal may come in any order: a sigil drawn first is read once its seal goes around it.
    // The seal is a closed circle that holds another stroke inside it, or failing that one of seal size;
    // of several, the one nearest the page's guide (so an outer ring drawn first is not taken for it)
    const round = this.strokes.map(s => { const f = circleFit(s.pts); return f && f.r > 0.16 && f.round < 0.2 && f.cover > TAU * 0.83 && f.gap < 0.75 ? f : null; });
    const holds = (f, j) => this.strokes.some((o, k) => k !== j && o.pts.every(p => Math.hypot(p.x - f.cx, p.y - f.cy) < f.r * 0.95));
    const nearGuide = f => Math.abs(Math.log(f.r / GUIDE_R));
    let pick = -1;
    // A lone round stroke on the dotted ring (0.8× its size or more) is the seal, however squarish the hand;
    // a smaller one that reads plainly as a sigil is a sigil traced first (the faint trace is drawn at about 0.6–0.7×)
    // — but never Petra: a squarish loop that size alone is a boxy seal (v175: since Petra reads soft squares, a lone boxy
    // seal flashed "Petra" until something was drawn inside it); a Petra traced first is read once its seal goes around it
    const plainSigil = j => { const r = recognize(this.strokes[j].pts); return !!(r && r.ok && r.id !== 'none' && r.id !== 'stone'); };
    const lone = j => round[j].r >= 0.8 * GUIDE_R || (round[j].r >= 0.55 * GUIDE_R && !plainSigil(j));
    for (const want of [j => holds(round[j], j), lone]) {
      for (let j = 0; j < round.length; j++) if (round[j] && want(j) && (pick < 0 || nearGuide(round[j]) < nearGuide(round[pick]))) pick = j;
      if (pick >= 0) break;
    }
    if (pick >= 0) {
      const f = round[pick];
      // a seal drawn roughly on the page's guide is read as the guide itself, so the eight places stay where they were shown
      const onGuide = Math.hypot(f.cx, f.cy) < 0.3 * GUIDE_R && f.r > 0.6 * GUIDE_R && f.r < 1.35 * GUIDE_R;
      A.seal = onGuide ? { ...f, cx: 0, cy: 0, r: GUIDE_R, drawn: f } : f; A.sealIdx = pick; A.roles[pick] = 'seal';
    } else if (this.strokes.length) {
      // no seal yet: perhaps the sigil came first
      const rec = recognize(this.strokes.flatMap(s => s.pts));
      if (rec && rec.ok) A.loneSigil = rec.id;
    }
    for (let i = 0; i < this.strokes.length; i++) {
      if (i === A.sealIdx) continue;
      const st = this.strokes[i].pts;
      if (!A.seal) { A.roles[i] = 'stray'; continue; }
      const S = A.seal, Dn = S.drawn || S;
      const ds = st.map(p => Math.hypot(p.x - S.cx, p.y - S.cy));
      const md = ds.reduce((a, b) => a + b, 0) / ds.length;
      // inside the seal as it was actually drawn: the sigil
      const dd = st.map(p => Math.hypot(p.x - Dn.cx, p.y - Dn.cy)), dmd = dd.reduce((a, b) => a + b, 0) / dd.length, dmx = Math.max(...dd);
      if (dmd < 0.84 * Dn.r && dmx < 1.12 * Dn.r) { A.roles[i] = 'sigil'; A.sigilIdx.push(i); A.sigilPts.push(...st); continue; }
      // outer ring (amplifier)?
      const f = circleFit(st);
      if (f && md > 1.1 * S.r && md < 2.4 * S.r && f.cover > TAU * 0.78 && f.round < 0.28 && Math.hypot(f.cx - S.cx, f.cy - S.cy) < 0.35 * S.r) {
        A.roles[i] = 'ring'; A.amp = true; continue;
      }
      const g = strokeGeom(st), dc = Math.hypot(g.cx - S.cx, g.cy - S.cy);
      // a short bar laid across (not along) the spokes may be a barb on a sign — decided once all signs are known
      if (barbish(st, g, dc, S)) { A.roles[i] = 'cand'; cands.push(i); continue; }
      // ring-sigil: a small, non-straight mark sitting in one of the eight slots around the seal
      if (satish(g, dc, S)) {
        const slot = slotOf(g.cx - S.cx, g.cy - S.cy);
        A.roles[i] = 'sat'; (A.slotStrokes[slot] = A.slotStrokes[slot] || []).push(i); continue;
      }
      // sign: a stroke leading outward from the ring
      const sg = signOf(st, ds, S);
      if (sg) { A.roles[i] = 'sign'; A.signs.push({ ...sg, i }); continue; }
      A.roles[i] = 'stray';
    }
    if (A.sigilPts.length) A.sigil = recognize(A.sigilPts);
    const S = A.seal;
    if (!S) return A;
    const ptsOf = i => this.strokes[i].pts;
    const dsOf = st => st.map(p => Math.hypot(p.x - S.cx, p.y - S.cy));
    // recognise each occupied slot; an unreadable single open stroke that looks like an arrow becomes a sign
    const slotRec = {};
    for (const k in A.slotStrokes) {
      const idx = A.slotStrokes[k], rec = recognize(idx.flatMap(ptsOf));
      // (a closed shape is never an arrow, nor is a loop or curl: an arrow runs fairly straight)
      if ((!rec || !rec.ok) && idx.length === 1 && endGap(ptsOf(idx[0])) > 0.3 && strokeGeom(ptsOf(idx[0])).straight > 0.6) {
        const sg = signOf(ptsOf(idx[0]), dsOf(ptsOf(idx[0])), S);
        if (sg) { A.roles[idx[0]] = 'sign'; A.signs.push({ ...sg, i: idx[0] }); delete A.slotStrokes[k]; continue; }
      }
      slotRec[k] = rec;
    }
    // one sign to a position: a second sign in the same place is ignored
    A.signs.sort((a, b) => a.i - b.i);
    const kept = [];
    for (const sg of A.signs) {
      sg.pos = slotOf(sg.dx, sg.dy); sg.barbs = 0;
      if (kept.some(o => o.pos === sg.pos)) { A.roles[sg.i] = 'stray'; A.notes.push('dupSign'); continue; }
      kept.push(sg);
    }
    A.signs = kept;
    // barbs: short bars crossing a sign — each adds one strength (a sign holds two)
    for (const i of cands) {
      const st = ptsOf(i), g = strokeGeom(st);
      let best = null, bd = 1e9;
      for (const sg of A.signs) {
        const d = polyGap(st, ptsOf(sg.i)), along = Math.abs(((st[st.length - 1].x - st[0].x) * sg.dx + (st[st.length - 1].y - st[0].y) * sg.dy) / (pathLen(st) || 1));
        if (d < 0.12 * S.r && along < 0.7 && d < bd) { bd = d; best = sg; }
      }
      if (best) {
        if (best.barbs < 2) { best.barbs++; A.roles[i] = 'barb'; }
        else { A.roles[i] = 'stray'; A.notes.push('tooManyBarbs'); }
        continue;
      }
      // not a barb after all: a ring-sigil, an arrow of its own, or nothing
      const dc = Math.hypot(g.cx - S.cx, g.cy - S.cy);
      if (satish(g, dc, S)) {
        const k = slotOf(g.cx - S.cx, g.cy - S.cy);
        A.roles[i] = 'sat'; (A.slotStrokes[k] = A.slotStrokes[k] || []).push(i);
        slotRec[k] = recognize(A.slotStrokes[k].flatMap(ptsOf));
        continue;
      }
      const sg = signOf(st, dsOf(st), S), pos = sg && slotOf(sg.dx, sg.dy);
      if (sg && !A.signs.some(o => o.pos === pos)) { A.roles[i] = 'sign'; A.signs.push({ ...sg, i, pos, barbs: 0 }); continue; }
      A.roles[i] = 'stray';
    }
    for (const k in A.slotStrokes) {
      const rec = slotRec[k], idx = A.slotStrokes[k];
      A.sats.push({ slot: +k, id: rec ? rec.id : null, ok: !!(rec && rec.ok), idx });
    }
    A.sats.sort((a, b) => a.slot - b.slot);
    A.signs.sort((a, b) => a.pos - b.pos);
    return A;
  }
}
/* closest approach between two strokes */
function polyGap(a, b) {
  const ra = resample(a, 24), rb = resample(b, 32);
  let m = 1e9;
  for (const p of ra) for (let j = 1; j < rb.length; j++) {
    const q0 = rb[j - 1], q1 = rb[j], vx = q1.x - q0.x, vy = q1.y - q0.y, L2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - q0.x) * vx + (p.y - q0.y) * vy) / L2));
    m = Math.min(m, Math.hypot(p.x - q0.x - t * vx, p.y - q0.y - t * vy));
  }
  return m;
}
function satish(g, dc, S) { return g.straight < 0.8 && dc > 1.12 * S.r && dc < 1.95 * S.r && g.size < 0.95 * S.r; }
/* a short, fairly straight bar lying across the spoke it sits on */
function barbish(st, g, dc, S) {
  // (generous on length: a hand-drawn barb often runs long, and one that touches no sign is reconsidered below)
  if (g.straight < 0.65 || g.size > 1.0 * S.r || dc < 1.0 * S.r || dc > 2.8 * S.r) return false;
  const ex = st[st.length - 1].x - st[0].x, ey = st[st.length - 1].y - st[0].y, L = Math.hypot(ex, ey) || 1;
  const rx = (g.cx - S.cx) / dc, ry = (g.cy - S.cy) / dc;
  return Math.abs((ex * rx + ey * ry) / L) < 0.6;
}
function strokeGeom(st) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, cx = 0, cy = 0;
  for (const p of st) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); cx += p.x; cy += p.y; }
  const L = pathLen(st), chord = Math.hypot(st[0].x - st[st.length - 1].x, st[0].y - st[st.length - 1].y);
  return { cx: cx / st.length, cy: cy / st.length, size: Math.max(x1 - x0, y1 - y0), straight: chord / (L || 1) };
}
const SLOT_R = 1.45, GUIDE_R = 0.52;
let SLOT_SIZE = 0.27; // (the slots' guide circles: bigger on one-page layouts, set in layout()) // GUIDE_R: the dotted seal guide on the page (in page half-widths)
function slotOf(dx, dy) { return ((Math.round(Math.atan2(dy, dx) / (TAU / 8)) % 8) + 8) % 8; }
function signOf(st, ds, S) {
  let ni = 0, fi = 0;
  for (let k = 0; k < ds.length; k++) { if (ds[k] < ds[ni]) ni = k; if (ds[k] > ds[fi]) fi = k; }
  const dx = st[fi].x - st[ni].x, dy = st[fi].y - st[ni].y, L = Math.hypot(dx, dy);
  // a sign leads outward: a stroke lying across the spokes (a long barb) gains little distance from the seal
  if (ds[ni] < 1.5 * S.r && ds[fi] > 1.18 * S.r && L > 0.22 * S.r && ds[fi] - ds[ni] > 0.45 * L) return { dx: dx / L, dy: dy / L };
  return null;
}
/* the active lesson's rules: which sigils may sit at the centre, which upon the ring */
function lessonRules() {
  const L = typeof Game !== 'undefined' && Game.level; if (!L) return null;
  return { centers: L.centers || L.sigils, sats: L.sats || L.sigils, combos: !!L.combos, ringOf: L.ringOf || null };
}
/* (v178) has the player met this sigil? Yes if a lesson up to the one in play brings it in, or a lesson they have won
   does (back on an early lesson, they still know what they learned later). With no lesson in play, or in a custom
   level (custom.js counts it as after every lesson), every sigil is known. A sigil not yet met is never named or shown. */
function sigilKnown(id, L = typeof Game !== 'undefined' && Game.level) {
  if (!L || typeof LEVELS === 'undefined') return true;
  const at = LEVELS.indexOf(L); if (at < 0) return true;
  const won = i => typeof Save !== 'undefined' && !!Save.starsAt && Save.starsAt(i) > 0;
  return LEVELS.some((l, i) => l.sigils.includes(id) && (i <= at || won(i)));
}
const UNLEARNED = 'That mark isn’t one you’ve learned yet.';
// the rules for a spell put in the satchel: any sigil the player has met, anywhere on the seal (null: all are known)
function knownRules() {
  const k = SIGIL_ORDER.filter(id => sigilKnown(id));
  return k.length === SIGIL_ORDER.length ? null : { centers: k, sats: k, combos: true, ringOf: null };
}
/* (v177) the lesson's ring rules as the player is shown them, before drawing (the card, the Notes leaf, the codex):
   for each sigil that may stand in the centre, the ring-sigils it takes, checked as buildSpell checks them (the
   lesson's ring list, narrowed by ringOf), and the sigils that may only go on a ring. null when the lesson sets no
   rules (every centre takes every sigil of the lesson). */
function ringRules(L = typeof Game !== 'undefined' && Game.level) {
  if (!L || !L.combos) return null;
  const cen = L.centers || L.sigils, sats = L.sats || L.sigils, of = L.ringOf || {};
  const rows = L.sigils.filter(c => cen.includes(c)).map(c => ({ id: c, takes: L.sigils.filter(s => sats.includes(s) && (!of[c] || of[c].includes(s))) }));
  const ringOnly = L.sigils.filter(s => !cen.includes(s));
  if (!ringOnly.length && rows.every(r => r.takes.length === L.sigils.length)) return null;
  return { rows, ringOnly, takes: c => { const r = rows.find(q => q.id === c); return r ? r.takes : null; } };
}
// a small sigil for the ring legends: its coloured disc, a hairline rim and the glyph in ink
function miniGlyph(g, id, cx, cy, r) {
  g.fillStyle = SIGILS[id].color; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(42,24,48,0.75)'; g.lineWidth = 0.7; g.stroke();
  drawGlyph(g, id, cx, cy, r * 0.78, '#2a1830', Math.max(0.7, r * 0.16));
}
// a centre's ring in the legends: a dashed pill (the ring's small circles are dashed too) holding the sigils it takes,
// or "none"; a ring-only sigil gets "ring only" instead (takes === 'only'). Centred on x (or starting there, if left),
// at most maxW wide; returns its width
function ringTag(g, takes, x, cy, maxW, h, left) {
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  const ink = '#5a3a1a', fs = Math.max(8, Math.round(h * 0.78));
  g.font = `italic ${fs}px "IM Fell English", serif`;
  if (takes === 'only') { const w = g.measureText('ring only').width; g.fillStyle = hexA(ink, 0.85); g.fillText('ring only', left ? x + w / 2 : x, cy + 0.5); g.restore(); return w; }
  const n = takes.length, r0 = h * 0.42, pitch = n ? Math.min(2 * r0 + 2.5, (maxW - h * 0.7) / n) : 0, r = Math.max(2.5, (pitch - 2) / 2);
  const inner = n ? n * pitch : g.measureText('none').width + 2, w = Math.min(maxW, inner + h * 0.7), cx = left ? x + w / 2 : x;
  g.strokeStyle = hexA(ink, 0.55); g.lineWidth = 0.9; g.setLineDash([2.5, 2.5]);
  roundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2); g.stroke(); g.setLineDash([]);
  if (!n) { g.fillStyle = hexA(ink, 0.8); g.fillText('none', cx, cy + 0.5); }
  else takes.forEach((id, k) => miniGlyph(g, id, cx - inner / 2 + pitch * (k + 0.5), cy, r));
  g.restore(); return w;
}
const REL_NAME = { now: 'at once', along: 'along the way', arrive: 'on arrival' };
// the small circles' colours from the third folio on: when a ring-sigil there would act
// (softened in v142: muted inks that sit on the parchment rather than over it)
const REL_COL = { now: '#b0614f', along: '#5a80a8', arrive: '#5d8a63' };

/* Convert a page-space direction into a world direction (inverse isometric), snapped to 8 ways */
const DIR8 = [];
for (let k = 0; k < 8; k++) { const a = k * TAU / 8; DIR8.push({ x: Math.round(Math.cos(a) * 1000) / 1000, y: Math.round(Math.sin(a) * 1000) / 1000 }); }
function pageToWorldDir(dx, dy) {
  const wx = dx / 64 + dy / 32, wy = dy / 32 - dx / 64;
  const a = Math.atan2(wy, wx);
  const k = ((Math.round(a / (TAU / 8)) % 8) + 8) % 8;
  const d = DIR8[k];
  const L = Math.hypot(d.x, d.y);
  return { x: d.x / L, y: d.y / L };
}
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
function worldDirArrow(d) {
  const sx = (d.x - d.y), sy = (d.x + d.y) * 0.5;
  const a = Math.atan2(sy, sx);
  return ARROWS[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
}

/* the slots whose ring-sigils go beyond three of one kind in a spell: the ones drawn last are ignored (v143) */
const RING_MAX = 3;
function ringExtras(A) {
  const out = new Set(), seen = {};
  const drawn = A.sats.filter(s => s.ok && s.id).sort((a, b) => Math.min(...a.idx) - Math.min(...b.idx));
  for (const s of drawn) { seen[s.id] = (seen[s.id] || 0) + 1; if (seen[s.id] > RING_MAX) out.add(s.slot); }
  return out;
}
function buildSpell(draft, rules) {
  const A = draft.a;
  if (Array.isArray(rules)) rules = { centers: rules, sats: rules };
  if (!A.seal) return { err: 'Every spell begins with a seal: one closed circle.' };
  if (!A.sigil) return { err: 'The seal stands empty. Inscribe a sigil within it.' };
  if (!A.sigil.ok) return { err: 'The sigil is unclear. Draw it again, closer to its shape.' };
  const id = A.sigil.id;
  if (rules && !rules.centers.includes(id)) {
    return { err: rules.sats.includes(id) ? `${SIGILS[id].name} can only go on the ring in this lesson.` : sigilKnown(id) ? `${SIGILS[id].name} is not used in this lesson.` : UNLEARNED };
  }
  if (rules && rules.combos === false && A.sats.length) return { err: 'Only signs may enter the small circles for now: draw your sign out from the seal into one. Sigils in the circles belong to the third folio.' };
  for (const s of A.sats) {
    if (!s.ok) return { err: 'A ring-sigil is unclear. Redraw it inside its slot.' };
    if (rules && !rules.sats.includes(s.id)) return { err: sigilKnown(s.id) ? `${SIGILS[s.id].name} cannot be set upon the ring in this lesson.` : 'A mark on the ring isn’t one you’ve learned yet.' };
    // a lesson may say which ring-sigils each centre may carry (v155, the sixth folio)
    const allow = rules && rules.ringOf && rules.ringOf[id];
    if (allow && !allow.includes(s.id)) return { err: allow.length ? `${SIGILS[s.id].name} cannot ride the ring of ${SIGILS[id].name} in this lesson.` : `${SIGILS[id].name} carries nothing upon its ring in this lesson: signs alone.` };
  }
  // each of the eight positions holds one mark: a sign or a ring-sigil
  for (const s of A.sats) if (A.signs.some(g => g.pos === s.slot)) return { err: 'Each place on the ring holds one mark: a sign or a ring-sigil, not both.' };
  // signs give the way (several are averaged); barbs give the strength
  const signs = A.signs;
  let sx = 0, sy = 0;
  // a sign points the way of the circle it is drawn through (its position), so a stroke between two circles
  // takes the nearer one's way — never a way of its own read from the land's skewed grid
  const way = s => ({ x: Math.cos(s.pos * TAU / 8), y: Math.sin(s.pos * TAU / 8) });
  for (const s of signs) { const w = way(s); sx += w.x; sy += w.y; }
  const n = signs.length ? Math.min(3, 1 + Math.max(...signs.map(s => s.barbs))) : 0;
  let dir = null, radial = false;
  if (signs.length) {
    if (Math.hypot(sx, sy) >= 0.5 * signs.length) dir = pageToWorldDir(sx, sy);
    else radial = true;
  }
  // ring-sigils: behind the signs act at once, beside them along the way, ahead of them on arrival
  // a ring holds three of one sigil at most, counted over the whole spell (whatever their timing); later ones are ignored
  const extra = ringExtras(A);
  const groups = {};
  for (const s of A.sats) {
    if (extra.has(s.slot)) continue;
    let rel = 'now';
    if (dir) {
      const c = Math.cos(s.slot * TAU / 8 - Math.atan2(sy, sx));
      rel = c > 0.38 ? 'arrive' : c < -0.38 ? 'now' : 'along';
    }
    const k = s.id + ':' + rel;
    groups[k] = groups[k] || { id: s.id, rel, n: 0, order: s.slot };
    groups[k].n++;
  }
  const sats = Object.values(groups);
  // Petra reads each sign as its own arm of stone (no averaging): lines, lines through the mark, rectangles
  const arms = signs.map(s => { const w = way(s), d = pageToWorldDir(w.x, w.y); return { x: d.x, y: d.y, f: Math.min(3, 1 + s.barbs) }; });
  // stone, fire and ice are placed by their signs (arms), never spread outward by balanced signs
  if (id === 'stone' || id === 'flame' || id === 'frost' || id === 'tide' || id === 'luna') radial = false;
  // normalized art for projecting the seal into the world
  const S = A.seal;
  const art = draft.strokes.map((st, i) => ({
    role: A.roles[i],
    pts: st.pts.map(p => ({ x: (p.x - S.cx) / S.r, y: (p.y - S.cy) / S.r, w: p.w / S.r })),
  })).filter(s => s.role !== 'stray');
  return { sigil: id, s: n, dir, radial, amp: A.amp, art, color: SIGILS[id].color, sats, arms };
}

/* The stone Petra raises, as tile offsets from the mark.
   One sign: a wall that way. Opposite signs: one wall through the mark. Signs at right angles: the rectangle between them.
   Each arm reaches one tile per measure of strength; the outer ring widens (a wall three wide, a block one tile larger all round). */
function petraShape(arms, amp, reach = 0) {
  const out = [], add = (x, y) => { if (!out.some(([a, b]) => a === x && b === y)) out.push([x, y]); };
  arms = (arms || []).map(a => ({ ...a, f: a.f + reach }));
  const axis = arms.every(a => Math.abs(a.x) < 0.2 || Math.abs(a.y) < 0.2);
  if (!arms.length || axis) {
    const e = { px: 0, nx: 0, py: 0, ny: 0 };
    for (const a of arms) {
      if (a.x > 0.5) e.px = Math.max(e.px, a.f); else if (a.x < -0.5) e.nx = Math.max(e.nx, a.f);
      else if (a.y > 0.5) e.py = Math.max(e.py, a.f); else if (a.y < -0.5) e.ny = Math.max(e.ny, a.f);
    }
    const hasX = e.px || e.nx, hasY = e.py || e.ny;
    // the outer ring adds breadth, never length: bare → 3×3; a line → three wide; a block grows one tile only on the
    // sides behind the mark (where no sign points), never past a sign's end
    if (amp) {
      if (!hasX && !hasY) { e.px++; e.nx++; e.py++; e.ny++; }
      else if (hasX && hasY) { if (!e.px) e.px++; if (!e.nx) e.nx++; if (!e.py) e.py++; if (!e.ny) e.ny++; }
      else if (hasX) { e.py++; e.ny++; } else { e.px++; e.nx++; }
    }
    for (let y = -e.ny; y <= e.py; y++) for (let x = -e.nx; x <= e.px; x++) add(x, y);
    const W = e.nx + e.px + 1, H = e.ny + e.py + 1;
    return { cells: out, W, H, kind: hasX && hasY ? 'block' : hasX || hasY ? 'wall' : 'tile', len: hasX ? W : H };
  }
  // signs along the land's diagonals (the page's right, left, up and down): the same rules, turned 45°.
  // s runs along (1,-1), t along (1,1); a cell sits in the shape when its (s, t) falls inside the arms' reach,
  // and the half-steps between diagonal tiles fill the gaps, so right-angle signs give a solid block.
  const snap = a => [Math.abs(a.x) > 0.3 ? Math.sign(a.x) : 0, Math.abs(a.y) > 0.3 ? Math.sign(a.y) : 0];
  if (arms.every(a => { const [sx, sy] = snap(a); return sx && sy; })) {
    const e = { ps: 0, ns: 0, pt: 0, nt: 0 };
    for (const a of arms) {
      const [sx, sy] = snap(a);
      if (sx === sy) { if (sx > 0) e.pt = Math.max(e.pt, a.f); else e.nt = Math.max(e.nt, a.f); }
      else if (sx > 0) e.ps = Math.max(e.ps, a.f); else e.ns = Math.max(e.ns, a.f);
    }
    const hasS = e.ps || e.ns, hasT = e.pt || e.nt;
    // the outer ring, as on the tile rows: a line is thickened on both sides (the half-steps beside it);
    // a diamond grows one step only behind the mark, never past a sign's end
    let s0 = -e.ns, s1 = e.ps, t0 = -e.nt, t1 = e.pt;
    if (amp) {
      if (hasS && hasT) { if (!e.ps) s1 += 1; if (!e.ns) s0 -= 1; if (!e.pt) t1 += 1; if (!e.nt) t0 -= 1; }
      else if (hasS) { t0 -= 0.5; t1 += 0.5; if (e.ps) s1 += 0.5; if (e.ns) s0 -= 0.5; }
      else { s0 -= 0.5; s1 += 0.5; if (e.pt) t1 += 0.5; if (e.nt) t0 -= 0.5; }
    }
    const R = Math.ceil(Math.max(-s0, s1) + Math.max(-t0, t1)) + 1, eps = 1e-6;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const s = (x - y) / 2, t = (x + y) / 2;
      if (s >= s0 - eps && s <= s1 + eps && t >= t0 - eps && t <= t1 + eps) add(x, y);
    }
    const W = e.ns + e.ps + 1, H = e.nt + e.pt + 1;
    // right-angle signs along the diagonals fill a diamond on the tile grid (a "+" of 5 for plain signs), not a W×H block
    return { cells: out, W, H, kind: hasS && hasT ? 'diamond' : 'wall', len: hasS ? W : H };
  }
  // signs both along the tile rows and along the land's diagonals: the same rule as above, in general —
  // each arm sweeps the mark its own way, and the stone fills all the ground the arms sweep together
  // (one sign: a line; opposite: a line through the mark; right angles: a block; otherwise the solid,
  // slanted shape between them). The outer ring grows it one tile on each side behind the mark.
  const segs = arms.map(a => { const [sx, sy] = snap(a); return [sx * a.f, sy * a.f]; });
  if (amp) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    if (!arms.some(a => { const [sx, sy] = snap(a); return sx * dx + sy * dy > 0; })) segs.push([dx, dy]);
  const hull = zonoHull(segs);
  let R = 0; for (const [x, y] of hull) R = Math.max(R, Math.ceil(Math.abs(x)), Math.ceil(Math.abs(y)));
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (inHull(hull, x, y)) add(x, y);
  return { cells: out, kind: 'field', len: 1 + Math.max(...arms.map(a => a.f)) };
}
/* the corners of the ground swept by several segments from the mark (their Minkowski sum), as a convex hull */
function zonoHull(segs) {
  let pts = [[0, 0]];
  for (const [dx, dy] of segs) pts = pts.concat(pts.map(([x, y]) => [x + dx, y + dy]));
  pts = pts.filter((p, i) => pts.findIndex(q => q[0] === p[0] && q[1] === p[1]) === i).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function inHull(h, x, y) {
  if (h.length === 1) return h[0][0] === x && h[0][1] === y;
  if (h.length === 2) { // a bare segment
    const [[ax, ay], [bx, by]] = h, c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    return Math.abs(c) < 1e-6 && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(ay, by) <= y && y <= Math.max(ay, by);
  }
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i], [bx, by] = h[(i + 1) % h.length];
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -1e-6) return false;
  }
  return true;
}

// Ventus on the ring of a placing sigil (Petra, Ignis, Gelu, or Unda that does not flow) carries each arm two tiles
// farther per Ventus — the same rule applySpell (world.js) uses, so the read-back and the aim preview show the real shape
function placeReach(sp) {
  const placing = sp.sigil === 'stone' || sp.sigil === 'flame' || sp.sigil === 'frost' || (sp.sigil === 'tide' && !tideCurrent(sp));
  return placing ? 2 * (sp.sats || []).filter(s => s.id === 'gale').reduce((a, s) => a + s.n, 0) : 0;
}
// No spell lasts a length of time (a hard rule since v161): what floats or carries an element does so for a distance in
// tiles, and keeps it for as long as it is left alone. world.js reads these; the aim bar says them.
// One number for every ring-sigil (v165): Luna on any ring floats what it holds 10 tiles per Luna (on a gust, on
// arrival, or Unda's bubble). Ignis, Gelu, Unda or Petra along the way ride what a gust moves from the tile it leaves until it
// comes to rest, with no count; at once or on arrival they flare once where it starts or stops (v176). (Luna on Petra's
// ring is Petra's own pairing: the stones hang for good. Luna at the centre floats 10, 20 with the outer circle.)
const RING_TILES = 10;
// the ferry's slab sails as far as it used to in (6 + 2 per Petra + 2 per extra Luna) seconds, gathering speed from rest
// (0.55s lost): about 10 / 15 / 19 tiles for no barb / one / two, so The Ferry's one barb still lands short of the font
function ferrySpeed(s, gale) { return gale ? (0.8 + 0.6 * s) * (1 + 0.4 * (gale - 1)) : 0; }
function ferryTiles(s, petra, gale, luna) { return Math.round((6 + 2 * petra + 2 * Math.max(0, luna - 1) - 0.55) * ferrySpeed(s, gale)); }
function ferryOf(sp) { // the counts applySpell passes to spawnFerry
  const sum = f => (sp.sats || []).filter(f).reduce((a, s) => a + s.n, 0);
  if (sp.sigil === 'luna') return ferryTiles(sp.s, sum(s => s.id === 'stone'), sum(s => s.id === 'gale'), 0);
  return ferryTiles(sp.s, sum(s => s.id === 'stone' && s.rel === 'now'), 1, sum(s => s.id === 'luna' && s.rel === 'now'));
}
// Ventus with Luna and Petra both on its ring at once: the ferry (applySpell in world.js)
function isFerry(sp) { const now = id => (sp.sats || []).some(s => s.id === id && s.rel === 'now'); return sp.sigil === 'gale' && !!sp.dir && now('luna') && now('stone'); }
// short: the aim bar's compact form (on a phone the full read-back would fill a third of the screen); the grimoire keeps it whole
function describeSpell(sp, short = false) {
  const S = SIGILS[sp.sigil];
  let t = short ? S.name : `${S.name} — ${S.en}`;
  const force = ['', 'gentle', 'firm', 'strong'][sp.s];
  // stone, fire and ice given signs are placed by the same shapes (petraShape); name the shape that will appear
  const placedArms = sp.arms && sp.arms.length ? sp.arms : sp.dir ? [{ x: sp.dir.x, y: sp.dir.y, f: sp.s }] : [];
  const line = sp.sigil === 'flame' || sp.sigil === 'frost' || sp.sigil === 'tide';
  const word = {
    stone: { one: 'a single pillar', line: 'wall', lines: 'walls', block: 'block', unit: 'stones' },
    flame: { one: 'a single tile of fire', line: 'line of fire', lines: 'lines of fire', block: 'field of fire', unit: 'tiles of fire' },
    frost: { one: 'a single tile of ice', line: 'path of ice', lines: 'paths of ice', block: 'sheet of ice', unit: 'tiles of ice' },
    tide: { one: 'a single tile of water', line: 'run of water', lines: 'runs of water', block: 'pool', unit: 'tiles of water' },
  }[sp.sigil];
  // a bare placing sigil sets one tile; the outer ring makes it 3×3
  if (word && !placedArms.length) t += sp.amp ? ` · a 3×3 ${word.block}` : ` · ${word.one}`;
  else if (word) {
    const P = petraShape(placedArms, sp.amp, placeReach(sp)), arrows = placedArms.map(a => worldDirArrow(a)).join('');
    const wide = sp.amp ? ', three wide' : '';
    if (P.kind === 'block') t += ` · a ${P.W}×${P.H} ${word.block}`;
    else if (P.kind === 'diamond') t += ` · a diamond of ${P.cells.length} ${word.unit} ${arrows}`;
    else if (P.kind === 'field') t += ` · a ${placedArms.length === 2 ? 'slanted ' : ''}patch of ${P.cells.length} ${word.unit} ${arrows}`;
    else if (P.kind === 'wall') t += ` · ${/^(8|11|18)$/.test(String(P.len)) ? 'an' : 'a'} ${P.len}-tile ${word.line} ${arrows}${wide}`; // "an 11-tile line"
    else t += ` · ${word.lines} ${arrows}${wide}`;
    // Ventus on Unda's ring sets the water flowing along the signs' averaged way
    if (tideCurrent(sp)) t += ` · flowing ${worldDirArrow(sp.dir)}`;
  }
  else if (sp.sigil === 'luna') {
    // only the outer circle changes Luna's float; its sign and barbs aim and strengthen what rides on its ring
    const tiles = sp.amp ? 20 : 10; // matches lunaRange() in world.js
    const ring = sp.sats || [], borne = ring.some(s => s.id === 'gale' && s.rel !== 'arrive'), late = ring.some(s => s.id === 'gale' && s.rel === 'arrive');
    t += short ? ` · floats ${tiles} tiles` : ` · lifts it until it has been carried ${tiles} tiles${sp.amp ? ' (the outer circle doubles it)' : ''}`;
    if (sp.dir && borne) t += ` · Ventus bears it ${force} ${worldDirArrow(sp.dir)}`;
    else if (sp.dir && late) t += short ? ` · blown ${force} ${worldDirArrow(sp.dir)} on landing` : ` · when it lands, Ventus blows it ${force} ${worldDirArrow(sp.dir)}`;
    else if (sp.dir && !ring.length && !short) t += ' · its sign aims only what rides on Luna’s ring';
  }
  else if (isFerry(sp)) t += short ? ` · a ferry sails ${ferryOf(sp)} tiles ${worldDirArrow(sp.dir)}` : ` · a ferry: a floating slab sails ${ferryOf(sp)} tiles ${worldDirArrow(sp.dir)}, rider and all`;
  else if (sp.dir) t += ` · ${force} ${{ gale: 'gust', tide: 'current' }[sp.sigil] || 'push'} ${worldDirArrow(sp.dir)}`;
  else if (sp.radial) t += ` · ${force}, balanced (outward)`;
  if (sp.amp && !line && sp.sigil !== 'stone' && sp.sigil !== 'luna') t += ' · widened';
  // Ventus on the ring of a placed spell (stone, fire, ice, still water) carries every arm farther, whatever its slot:
  // say how far, not when
  const reach = placeReach(sp);
  if (reach) t += ` · + Ventus${reach > 2 ? ' ×' + reach / 2 : ''}: every arm ${reach} tiles farther`;
  // on a gust, say where each ring-sigil acts (v176: three parts of the trip, no overlap): at once where the orb stands as
  // the spell takes hold, along the way once it has left that tile until it comes to rest (Petra: it turns to stone), on
  // arrival where it comes to rest (a bounce is not an arrival)
  const gust = sp.sigil === 'gale' && !isFerry(sp) && !short;
  for (const s of sp.sats || []) {
    if (isFerry(sp) && s.rel === 'now' && (s.id === 'luna' || s.id === 'stone')) continue;
    if (short && sp.sigil === 'luna' && s.id === 'gale' && sp.dir) continue; // already said: "Ventus bears it …"
    if (reach && s.id === 'gale') continue; // already said: "every arm … farther"
    // (and how long what rides on the orb lasts: a Luna float a distance, anything else until the orb comes to rest; never a time)
    // (Luna along the way lifts once the orb has left its tile and floats its own tiles from there: v176)
    const far = ` ${RING_TILES * s.n} tiles${s.rel === 'along' ? ' once it has left its tile' : ''}`, rest = ' until it comes to rest';
    const start = ' where it stands as the spell takes hold', road = ' from the tile it leaves' + rest;
    const what = !gust ? (short ? '' : placedWhat(sp, s)) : s.id === 'stone' ? (s.rel === 'arrive' ? ': stone rises under it where it comes to rest' : s.rel === 'now' ? ': stone rises under it' + start : ': turns it to stone' + road)
      : s.rel === 'arrive' ? (s.id === 'luna' ? `: where it comes to rest it floats ${RING_TILES * s.n} tiles` : s.id === 'gale' ? ': a push where it comes to rest' : ': where it comes to rest')
      : s.id === 'luna' ? ': floats it' + far : s.id === 'gale' ? ': a harder push' : s.rel === 'now' ? ':' + start : ': it carries the element' + road;
    t += ` · + ${SIGILS[s.id].name}${s.n > 1 ? ' ×' + s.n : ''}${relMatters(sp, s) ? ' ' + REL_NAME[s.rel] : ''}${what}`;
  }
  return t;
}

// v177 (call 2): does this ring-sigil's slot (its time) change what it does? Only a mover keeps time (Ventus or Luna in the
// centre: applySpell sends their ring to infuseBody). A placing centre (Petra, Ignis, Gelu, Unda, flowing or still) uses
// infuseCells, which ignores the slot. On a mover, Ventus at once and along the way are the same push (or Luna's drift);
// only on arrival differs. On Luna with Petra (the ferry) Petra and Ventus only build and sail it.
function timedCentre(id) { return id === 'gale' || id === 'luna'; }
function relMatters(sp, s) {
  if (!timedCentre(sp.sigil) || !s.rel) return false;
  if (s.id === 'gale' && s.rel !== 'arrive') return false;
  if (sp.sigil === 'luna' && (s.id === 'stone' || s.id === 'gale') && (sp.sats || []).some(q => q.id === 'stone')) return false;
  return true;
}
/* what a ring-sigil does to a placed spell (the sixth folio's pairings), for the aim preview */
function placedWhat(sp, s) {
  if (sp.sigil === 'stone' && s.id === 'luna') return ': the stone hangs one step above the ground';
  if (sp.sigil === 'stone' && s.id === 'frost') return ': raised as ice, slick underfoot';
  if (sp.sigil === 'tide' && s.id === 'frost') return ': the water freezes as it pours';
  if (sp.sigil === 'tide' && s.id === 'luna') return `: a bubble lifts what the water holds${sp.dir ? ' and drifts ' + RING_TILES * s.n + ' tiles ' + worldDirArrow(sp.dir) : ' and floats it ' + RING_TILES * s.n + ' tiles'}`;
  if ((sp.sigil === 'flame' || sp.sigil === 'frost') && s.id === 'luna') return `: lifts what stands there and floats it ${RING_TILES * s.n} tiles`;
  return '';
}
function shortSpell(sp) {
  let t = SIGILS[sp.sigil].name;
  if ((sp.sigil === 'stone' || sp.sigil === 'flame' || sp.sigil === 'frost' || sp.sigil === 'tide') && sp.arms && sp.arms.length) { const P = petraShape(sp.arms, sp.amp, placeReach(sp)); t += P.kind === 'block' ? ` ${P.W}×${P.H}` : P.kind === 'diamond' ? ` ◇${P.cells.length}` : P.kind === 'field' ? ` ▱${P.cells.length}` : ' ' + sp.arms.map(a => worldDirArrow(a)).join('') + P.len; }
  else if (sp.dir) t += ' ' + worldDirArrow(sp.dir) + sp.s;
  else if (sp.radial) t += ' ✶' + sp.s;
  if (sp.amp) t += ' ◎';
  for (const s of sp.sats || []) t += ' +' + SIGILS[s.id].name.slice(0, 2);
  return t;
}

/* =====================================================================
   The Satchel — spells kept for reuse (persisted in localStorage)
   ===================================================================== */
const Satchel = {
  list: [], max: 9, KEY: 'quillsigil.satchel.v1',
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY));
      if (Array.isArray(s)) this.list = s.filter(e => e && Array.isArray(e.strokes) && e.strokes.length).slice(0, this.max);
    } catch (e) { }
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.list.map(e => ({ strokes: e.strokes })))); } catch (e) { } },
  draftOf(strokes) { const d = new Draft(); for (const s of strokes) d.add(JSON.parse(JSON.stringify(s))); return d; },
  add(strokes) {
    if (this.list.length >= this.max) return false;
    const pack = strokes.map(s => ({ pts: s.pts.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), w: +p.w.toFixed(4) })) }));
    this.list.push({ strokes: pack }); this.save(); return true;
  },
  remove(i) { this.list.splice(i, 1); this.save(); },
  spell(i, allowed) { const e = this.list[i]; return e ? buildSpell(this.draftOf(e.strokes), allowed) : null; },
  info(i) {
    const e = this.list[i];
    if (!e._info) {
      const sp = this.spell(i, null);
      e._info = sp.err ? { label: 'Smudged spell', img: '' } : { label: shortSpell(sp), img: spellThumb(e.strokes, sp), sigil: sp.sigil, color: sp.color, ids: [sp.sigil, ...(sp.sats || []).map(q => q.id)] };
    }
    // (v178) a kept spell holding a sigil the player has not met here is not named
    if (e._info.ids && !e._info.ids.every(id => sigilKnown(id))) return { label: 'A mark not yet learned', img: e._info.img, sigil: null, color: null };
    return e._info;
  },
};
function spellThumb(strokes, sp, size = 112) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2;
  const S = Satchel.draftOf(strokes).a.seal;
  const bg = g.createRadialGradient(h, h * 0.8, 0, h, h, h);
  bg.addColorStop(0, '#fbf2da'); bg.addColorStop(1, '#dcc597');
  g.fillStyle = bg; g.beginPath(); g.arc(h, h, h - 1, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(h, h, h - 2, 0, TAU); g.clip();
  const k = size * 0.29 / S.r, ox = h - S.cx * k, oy = h - S.cy * k;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = sp.color; g.shadowBlur = 6;
  g.strokeStyle = '#20142e';
  for (const st of strokes) {
    const p = st.pts;
    for (let i = 1; i < p.length; i++) {
      g.lineWidth = Math.max(1, (p[i].w + p[i - 1].w) * 0.5 * k * 1.3);
      g.beginPath(); g.moveTo(ox + p[i - 1].x * k, oy + p[i - 1].y * k); g.lineTo(ox + p[i].x * k, oy + p[i].y * k); g.stroke();
    }
  }
  g.restore();
  g.strokeStyle = '#b8893e'; g.lineWidth = 2; g.beginPath(); g.arc(h, h, h - 2, 0, TAU); g.stroke();
  return c.toDataURL();
}

/* =====================================================================
   Ornament helpers (scrollwork) — shared by the book and the UI
   ===================================================================== */
function curl(g, cx, cy, r0, turns, a0, dir) {
  g.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
  const steps = Math.ceil(turns * 40);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, a = a0 + dir * t * turns * TAU, r = r0 * (1 - t * 0.85);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}
function leaf(g, x, y, len, ang, wid = 0.35) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * wid, len, 0);
  g.quadraticCurveTo(len * 0.5, len * wid, 0, 0);
  g.fill(); g.restore();
}
/* A corner flourish: two scrolls running along the edges with curls & leaves */
function cornerFlourish(g, x, y, s, sx, sy, ink, gold) {
  g.save(); g.translate(x, y); g.scale(s * sx, s * sy);
  const pass = (col, w, off) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(4 + off, 4 + off);
    g.bezierCurveTo(40, 0, 70, 30, 110, 12); g.bezierCurveTo(130, 4, 150, 12, 150, 26);
    g.stroke();
    g.beginPath(); curl(g, 138, 22, 12, 1.2, 0, -1); g.stroke();
    g.beginPath();
    g.moveTo(4 + off, 4 + off);
    g.bezierCurveTo(0, 40, 30, 70, 12, 110); g.bezierCurveTo(4, 130, 12, 150, 26, 150);
    g.stroke();
    g.beginPath(); curl(g, 22, 138, 12, 1.2, Math.PI / 2, 1); g.stroke();
    g.beginPath(); curl(g, 34, 34, 22, 1.6, Math.PI * 1.25, 1); g.stroke();
    g.beginPath(); g.moveTo(60, 20); g.quadraticCurveTo(75, 40, 64, 52); g.stroke();
    g.beginPath(); g.moveTo(20, 60); g.quadraticCurveTo(40, 75, 52, 64); g.stroke();
  };
  pass(ink, 3.2, 0);
  pass(gold, 1.1, 0.5);
  g.fillStyle = ink;
  leaf(g, 76, 22, 16, -0.6); leaf(g, 96, 16, 12, 0.5); leaf(g, 22, 76, 16, 2.17); leaf(g, 16, 96, 12, 1.07);
  leaf(g, 50, 50, 18, Math.PI / 4, 0.45);
  g.fillStyle = gold;
  leaf(g, 52, 52, 12, Math.PI / 4, 0.3);
  g.beginPath(); g.arc(8, 8, 4, 0, TAU); g.fill();
  g.restore();
}
/* A vine running along an edge with alternating curls */
function edgeVine(g, x0, y0, x1, y1, ink, gold, seed) {
  const L = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
  const n = Math.max(2, Math.floor(L / 70));
  g.save(); g.translate(x0, y0); g.rotate(ang);
  g.lineCap = 'round';
  for (const [col, w] of [[ink, 1.6], [gold, 0.6]]) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i <= 200; i++) { const t = i / 200; const x = t * L, y = Math.sin(t * n * Math.PI) * 4; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    for (let k = 0; k < n; k++) {
      const x = (k + 0.5) / n * L, side = k % 2 ? 1 : -1;
      g.beginPath(); g.moveTo(x, side * 4);
      g.quadraticCurveTo(x + 8, side * 14, x + 2, side * 18);
      g.stroke();
      g.beginPath(); curl(g, x + 1, side * 14, 4.5, 1, side > 0 ? 0 : Math.PI, side); g.stroke();
    }
  }
  g.fillStyle = ink;
  for (let k = 0; k < n; k++) { const x = (k + 0.5) / n * L + 14, side = k % 2 ? -1 : 1; leaf(g, x, side * 4, 9, side * 0.7, 0.4); }
  g.restore();
}
function fleuron(g, x, y, s, ink, gold) {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const sx of [-1, 1]) {
    g.save(); g.scale(sx, 1);
    for (const [col, w] of [[ink, 2.4], [gold, 0.8]]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(14, -10, 34, -8, 46, 0); g.stroke();
      g.beginPath(); curl(g, 50, 4, 7, 1.1, -Math.PI / 2, 1); g.stroke();
      g.beginPath(); g.moveTo(8, 0); g.bezierCurveTo(16, 10, 30, 12, 34, 6); g.stroke();
      g.beginPath(); curl(g, 32, 9, 4, 1, 0, 1); g.stroke();
    }
    g.fillStyle = ink; leaf(g, 22, -8, 10, -0.4); leaf(g, 60, 0, 10, 0.2, 0.3);
    g.restore();
  }
  g.fillStyle = ink; g.beginPath(); g.moveTo(0, -10); g.lineTo(5, 0); g.lineTo(0, 10); g.lineTo(-5, 0); g.closePath(); g.fill();
  g.fillStyle = gold; g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill();
  g.restore();
}
// the crescent's lines sit left of its centre (its bounds run -0.80 to +0.47): drawn, it is moved right to sit in its ring
// (the recognizer still matches against glyphLines as they are)
const GLYPH_NUDGE = { moon: 0.165 };
function drawGlyph(g, id, cx, cy, r, col, w) {
  g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  const gl = SIGILS[id].glyph; cx += (GLYPH_NUDGE[gl] || 0) * r;
  for (const line of glyphLines(gl)) {
    g.beginPath(); line.forEach(([x, y], i) => i ? g.lineTo(cx + x * r, cy + y * r) : g.moveTo(cx + x * r, cy + y * r)); g.stroke();
  }
  g.restore();
}
// Cinzel Decorative fuses a lowercase h to an e after it (one shared stem: Featherfall read as FEAT-HE-RFALL), and no font
// feature switch turns it off; so in that face every h is set as plain Cinzel's capital H (that face's lowercase letters
// are capitals of the same height, and its own capital H is a tall swash that stood above The Hanging Stones).
// paint(t, x, y) draws a run (fillText / strokeText) left-aligned; decoText honours g.textAlign for the whole string.
function decoRuns(g, text) {
  const deco = g.font, plain = deco.replace(/"Cinzel Decorative"/, 'Cinzel');
  if (deco === plain || !/h/i.test(text)) return null;
  return String(text).split(/(h+)/i).filter(Boolean).map(t => {
    const isH = /h/i.test(t[0]), f = isH ? plain : deco; if (isH) t = t.toUpperCase();
    g.font = f; const w = g.measureText(t).width; g.font = deco;
    return { t, f, w };
  });
}
function decoWidth(g, text) {
  const runs = decoRuns(g, text);
  return runs ? runs.reduce((a, r) => a + r.w, 0) : g.measureText(text).width;
}
function decoText(g, text, x, y, paint) {
  const runs = decoRuns(g, text);
  if (!runs) { paint(text, x, y); return; }
  const deco = g.font, align = g.textAlign, w = runs.reduce((a, r) => a + r.w, 0);
  let cx = x - (align === 'center' ? w / 2 : align === 'right' || align === 'end' ? w : 0);
  g.textAlign = 'left';
  for (const r of runs) { g.font = r.f; paint(r.t, cx, y); cx += r.w; }
  g.font = deco; g.textAlign = align;
}
// the same for the page: a name for innerHTML, its h's in a span set as Cinzel capitals (.dh)
const decoHTML = t => String(t).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`).replace(/h+/gi, '<span class="dh">$&</span>');
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}
// wrapText at a font that shrinks (to 72% at most) until the text fits in maxLines
function fitWrap(g, text, x, y, maxW, size, font, lhK, maxLines) {
  const count = () => { let n = 1, line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { n++; line = w; } else line = t; } return n; };
  let sz = size;
  for (; sz > size * 0.72; sz -= 0.5) { g.font = font(sz); if (count() <= maxLines) break; }
  g.font = font(sz);
  return wrapText(g, text, x, y, maxW, sz * lhK);
}
function textOnCircle(g, text, cx, cy, r, a0, size) {
  g.save(); g.translate(cx, cy);
  g.font = `600 ${size}px Cinzel, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const circ = TAU * r;
  let full = text; while (g.measureText(full).width < circ * 0.97) full += text;
  let a = a0;
  for (const ch of full) {
    const w = g.measureText(ch).width; const da = w / r;
    if (a - a0 + da > TAU * 0.995) break;
    g.save(); g.rotate(a + da / 2); g.translate(0, -r); g.fillText(ch, 0, 0); g.restore();
    a += da;
  }
  g.restore();
}

/* Parchment texture (cached) */
let _parch = null;
// (let go when the page comes back from the background, in case the browser wiped it)
document.addEventListener('visibilitychange', () => { if (!document.hidden) { _parch = null; Grim._mmKey = null; } });
function parchment() {
  if (_parch) return _parch;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#efe0bd'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data, R = mulberry(7);
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 18;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.7;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 26; i++) {
    const x = R() * 512, y = R() * 512, r = 20 + R() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(150,105,50,${0.04 + R() * 0.05})`); gr.addColorStop(1, 'rgba(150,105,50,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(120,85,40,0.06)';
  for (let i = 0; i < 180; i++) {
    const x = R() * 512, y = R() * 512, a = R() * TAU, l = 6 + R() * 26;
    g.lineWidth = 0.6 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  _parch = c; return c;
}

/* The painted grimoire (art/grim-*, cut from paintings): each piece takes over from its drawn version as it loads,
   and the old look (◐) keeps the drawn book. (v152: an illuminated manuscript: every piece in one family of red,
   green and gold Insular knotwork, each thing on the page in its own frame: knot border, corner bosses, a title
   cartouche, a framed map, roundels round the sigils and the seal's eight places, a lapis drop cap, a triskele
   tailpiece. The v150 vine, rosettes, rim, ribbon, medals and plaques stay in art/ but are no longer loaded.) */
const GART = {};
for (const f of ['page.jpg', 'knot.png', 'boss.png', 'title.png', 'frame.png', 'roundel.png', 'capframe.png', 'triskele.png']) {
  const k = f.split('.')[0], im = new Image();
  im.onload = () => { GART[k] = im; Grim.bookDirty = true; };
  im.src = `art/grim-${f}?v=1`;
}
function gart(k) { return typeof CLASSIC !== 'undefined' && CLASSIC.on ? null : GART[k] || null; }
/* The book itself: the owner's painting of an open book, the one the folio of lessons shows, cut into slices
   so its cover, gilt corners, block of leaves and fold keep their shape and only the plain parchment stretches (book:
   the spread; page: the right-hand page alone, for one page). Measured in the pictures' own pixels: rx / ry, the
   middles of each page's double ruled border (painted out once the picture loads: the knotwork is the page's one
   border); spine, the fold; cx / cy, where the fixed slices end and the stretched ones begin; leaf, the plain
   parchment inside the page's ruled border, untouched by the painting-out (the turning leaf, the Notes leaf). */
const FOLIO_ART = {
  book: { src: 'folio-book.jpg', w: 2000, h: 1116, spine: 999, rx: [213, 908.5, 1090.75, 1786.5], ry: [128.75, 983.5], cx: [243, 870, 1130, 1757], cy: [167, 944] },
  page: { src: 'folio-page.jpg', w: 1000, h: 1051, spine: 58, rx: [144, 798.75], ry: [121, 926], cx: [175, 773], cy: [157, 890], leaf: [156, 134, 630, 780] },
};
const FOLIO = {};
for (const k in FOLIO_ART) {
  const im = new Image();
  im.onload = () => { FOLIO[k] = folioClean(im, FOLIO_ART[k]); Grim.bookDirty = true; };
  im.src = `art/${FOLIO_ART[k].src}?v=1`;
}
function folioArt(k) { return typeof CLASSIC !== 'undefined' && CLASSIC.on ? null : FOLIO[k] || null; }
// a leaf of the painted book's parchment laid in a box (fill: stretched to it whole, edges and all; otherwise its
// middle cropped to the box's shape), turned over by flip. False until the picture has loaded (and in the old look)
function folioLeaf(g, x, y, w, h, flip, fill) {
  const im = folioArt('page'); if (!im) return false;
  let [sx, sy, sw, sh] = FOLIO_ART.page.leaf;
  if (!fill) { const k = Math.max(w / sw, h / sh), cw = w / k, ch = h / k; sx += (sw - cw) / 2; sy += (sh - ch) / 2; sw = cw; sh = ch; }
  g.save(); g.translate(x + (flip ? w : 0), y); if (flip) g.scale(-1, 1);
  g.drawImage(im, sx, sy, sw, sh, 0, 0, w, h); g.restore();
  return true;
}
// the picture with its ruled borders painted out: each rule (both its lines) covered by the parchment just inside it,
// then each corner's little squares and quarter-rounds by a patch from further in
function folioClean(im, A) {
  const c = document.createElement('canvas'); c.width = A.w; c.height = A.h;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const hw = 10, off = hw * 2 + 4, ext = 30, cr = 32, co = 70, [t, b] = A.ry; // (the rules wander a few pixels)
  const copy = (sx, sy, w, h, dx, dy) => g.drawImage(c, sx, sy, w, h, dx, dy, w, h);
  for (let p = 0; p < A.rx.length; p += 2) {
    const l = A.rx[p], r = A.rx[p + 1];
    for (const [x, d] of [[l, 1], [r, -1]]) copy(x - hw + d * off, t - ext, hw * 2, b - t + ext * 2, x - hw, t - ext);
    for (const [y, d] of [[t, 1], [b, -1]]) copy(l - ext, y - hw + d * off, r - l + ext * 2, hw * 2, l - ext, y - hw);
    for (const [x, dx] of [[l, 1], [r, -1]]) for (const [y, dy] of [[t, 1], [b, -1]]) copy(x - cr + dx * co, y - cr + dy * co, cr * 2, cr * 2, x - cr, y - cr);
  }
  return c;
}
// the picture laid out in slices: xs / ys, each slice's span in the picture (a0, a1) and on the screen (d0, d1); a
// stretched slice laid n times (n odd: every other one mirrored, so they join, and the last meets the next slice)
function folioSlices(g, im, xs, ys, dpr) {
  const r = v => Math.round(v * dpr) / dpr;
  for (const X of xs) for (const Y of ys) {
    const nx = X.n || 1, ny = Y.n || 1, dw = (X.d1 - X.d0) / nx, dh = (Y.d1 - Y.d0) / ny;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x0 = r(X.d0 + i * dw), x1 = r(X.d0 + (i + 1) * dw), y0 = r(Y.d0 + j * dh), y1 = r(Y.d0 + (j + 1) * dh);
      if (x1 <= x0 || y1 <= y0) continue;
      const fx = i % 2, fy = j % 2;
      g.save(); g.translate(fx ? x1 : x0, fy ? y1 : y0); g.scale(fx ? -1 : 1, fy ? -1 : 1);
      g.drawImage(im, X.a0, Y.a0, X.a1 - X.a0, Y.a1 - Y.a0, 0, 0, x1 - x0, y1 - y0);
      g.restore();
    }
  }
}
// an image with its corner at (x, y), turned outwards by fx/fy = ±1 (for the four corners of a page)
function drawFlip(g, im, x, y, w, h, fx, fy) { g.save(); g.translate(x, y); g.scale(fx, fy); g.drawImage(im, 0, 0, w, h); g.restore(); }
// an image cropped to fill a box without stretching
function drawCover(g, im, x, y, w, h, flip) {
  const iw = im.naturalWidth, ih = im.naturalHeight, k = Math.max(w / iw, h / ih), sw = w / k, sh = h / k;
  g.save(); g.translate(x + (flip ? w : 0), y); if (flip) g.scale(-1, 1);
  g.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h); g.restore();
}
// a painted frame stretched to a box, its corners kept square (b: the corner's size in the painting, d: on the page)
function nineSlice(g, im, x, y, w, h, b, d) {
  const iw = im.naturalWidth, ih = im.naturalHeight; d = Math.min(d, w / 2, h / 2);
  const sx = [0, b, iw - b, iw], sy = [0, b, ih - b, ih], dx = [x, x + d, x + w - d, x + w], dy = [y, y + d, y + h - d, y + h];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1) continue;
    g.drawImage(im, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
  }
}
// the painted roundel round a circle of radius r (its open middle is 60% of it)
function roundelAt(g, cx, cy, r) { const R = r / 0.6; g.drawImage(GART.roundel, cx - R, cy - R, R * 2, R * 2); return R; }
// the painted knotwork laid along a line from (x0, y0) to (x1, y1), centred on it, fading out briefly at both ends
function vineRun(g, x0, y0, x1, y1, h, dpr) {
  const V = GART.knot, len = Math.hypot(x1 - x0, y1 - y0); if (!V || len < h) return;
  const c = document.createElement('canvas'); c.width = Math.ceil(len * dpr); c.height = Math.ceil(h * dpr);
  const q = c.getContext('2d'); q.scale(dpr, dpr);
  const tw = V.naturalWidth * h / V.naturalHeight, n = Math.ceil(len / tw) + 1, sx = (len - n * tw) / 2;
  for (let i = 0; i < n; i++) q.drawImage(V, sx + i * tw - 0.5 * i, 0, tw, h);
  q.globalCompositeOperation = 'destination-in';
  const f = Math.min(0.12, h * 0.8 / len), gr = q.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(f, '#000'); gr.addColorStop(1 - f, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  q.fillStyle = gr; q.fillRect(0, 0, len, h);
  g.save(); g.translate(x0, y0); g.rotate(Math.atan2(y1 - y0, x1 - x0)); g.drawImage(c, 0, -h / 2, len, h); g.restore();
}
// gilded lettering, painted the way a miniature painter paints gold without metal paint, on letters cut the way a
// chisel cuts them: every stroke rises from both its edges to a sharp spine down its middle (where strokes meet, the
// spines mitre), so it has two faces, and the light, from the upper left and a little from in front, falls on each
// face by the way it turns: a stem's left face bright and its right face in shadow, a bar's top bright and its
// underside dark, each diagonal and each curve its own way, so no two letters catch it alike. Lit faces run to pale
// gold and the turned-away ones through ochre to a deep red-brown, never grey; a little warm light is thrown back
// into the shadowed faces, and the sky above is a touch brighter than the ground. A dark brown lining holds the word,
// and a pinpoint dot of near-white or two sits on its brightest spots (chosen from the text, so they never shimmer).
// The word is built once on its own canvas (keyed by text, font and pixel ratio), worked out on a grid finer than the
// screen's so a phone's narrow strokes still have room for both faces, and laid on the page from there.
// (each point's distance from the edge of the letters, plus inside, minus outside: the edge found to a fraction of a
// pixel from the letters' own soft rim (a rim pixel's coverage says how far the edge lies from its centre, its
// neighbours which way), then carried inwards by passing each point's nearest edge point on to its neighbours, a
// sweep down and a sweep back, only in and just round the letters. Measured to true edge points rather than to whole pixels, a slanting or
// curving stroke has no staircase in it, so its faces come out even.)
function edgeDist(A, W, H) {
  const N = W * H, sx = new Float32Array(N), sy = new Float32Array(N), d2 = new Float32Array(N).fill(1e12);
  for (let y = 1; y < H - 1; y++) for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) {
    const a = A[o], inn = a >= 128;
    if (!(a > 0 && a < 255) && inn === (A[o - 1] >= 128) && inn === (A[o + 1] >= 128) && inn === (A[o - W] >= 128) && inn === (A[o + W] >= 128)) continue;
    const gx = A[o - W + 1] + 2 * A[o + 1] + A[o + W + 1] - A[o - W - 1] - 2 * A[o - 1] - A[o + W - 1];
    const gy = A[o + W - 1] + 2 * A[o + W] + A[o + W + 1] - A[o - W - 1] - 2 * A[o - W] - A[o - W + 1];
    const gl = Math.hypot(gx, gy); if (!gl) continue;
    const t = (a / 255 - 0.5) / gl, ex = gx * t, ey = gy * t;
    sx[o] = x - ex; sy[o] = y - ey; d2[o] = ex * ex + ey * ey;
  }
  // only the letters and a few pixels round them need a distance (the shading never looks further out)
  const M = new Uint8Array(N), R = 4;
  for (let y = 0; y < H; y++) {
    let r = 99; for (let x = 0, o = y * W; x < W; x++, o++) { r = A[o] ? 0 : r + 1; if (r <= R) M[o] = 1; }
    r = 99; for (let x = W - 1, o = y * W + x; x >= 0; x--, o--) { r = A[o] ? 0 : r + 1; if (r <= R) M[o] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let r = 99; for (let y = 0, o = x; y < H; y++, o += W) { r = M[o] === 1 ? 0 : r + 1; if (r <= R && !M[o]) M[o] = 2; }
    r = 99; for (let y = H - 1, o = y * W + x; y >= 0; y--, o -= W) { r = M[o] === 1 ? 0 : r + 1; if (r <= R && !M[o]) M[o] = 2; }
  }
  const take = (o, n, x, y) => {
    if (d2[n] >= 1e12) return;
    const ex = x - sx[n], ey = y - sy[n], e = ex * ex + ey * ey;
    if (e < d2[o]) { d2[o] = e; sx[o] = sx[n]; sy[o] = sy[n]; }
  };
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) if (M[o]) { take(o, o - W - 1, x, y); take(o, o - W, x, y); take(o, o - W + 1, x, y); take(o, o - 1, x, y); }
    for (let x = W - 2, o = y * W + x; x > 0; x--, o--) if (M[o]) take(o, o + 1, x, y);
  }
  for (let y = H - 2; y > 0; y--) {
    for (let x = W - 2, o = y * W + x; x > 0; x--, o--) if (M[o]) { take(o, o + W + 1, x, y); take(o, o + W, x, y); take(o, o + W - 1, x, y); take(o, o + 1, x, y); }
    for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) if (M[o]) take(o, o - 1, x, y);
  }
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = d2[i] >= 1e12 ? (A[i] >= 128 ? 99 : -99) : (A[i] >= 128 ? 1 : -1) * Math.sqrt(d2[i]);
  return h;
}
// the gold's colours, from the deepest shadow to the brightest light (a value of 0 to 1.25, in 256 steps)
let _goldRamp = null;
function goldRamp() {
  if (_goldRamp) return _goldRamp;
  const st = [[0, '#3a1407'], [0.12, '#5e2510'], [0.27, '#86411a'], [0.41, '#b06a2a'], [0.54, '#d0963c'], [0.66, '#e6b552'],
    [0.78, '#f2cf72'], [0.9, '#f8e2a0'], [1, '#fbecbf'], [1.25, '#fffbec']].map(([v, c]) => [v, parseInt(c.slice(1), 16)]);
  const r = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const v = i / 204; let j = 0; while (j < st.length - 2 && st[j + 1][0] < v) j++;
    const [v0, c0] = st[j], [v1, c1] = st[j + 1], t = Math.max(0, Math.min(1, (v - v0) / (v1 - v0)));
    for (let ch = 0; ch < 3; ch++) { const a = c0 >> (16 - ch * 8) & 255, b = c1 >> (16 - ch * 8) & 255; r[i * 3 + ch] = Math.round(a + (b - a) * t); }
  }
  return (_goldRamp = r);
}
const _gold = new Map();
function goldWord(g, text, size) {
  const m = g.getTransform(), k = Math.max(1, Math.hypot(m.a, m.b)), font = g.font, base = g.textBaseline;
  const key = `${text}|${font}|${base}|${size}|${k}`;
  let w = _gold.get(key); if (w) return w;
  const t0 = performance.now();
  const pad = size * 0.32, y0 = size * 1.25, H = size * 2.3;
  const mk = () => { const c = document.createElement('canvas'), q = c.getContext('2d'); q.font = font; return [c, q]; };
  const [mc, mq] = mk(), tw = decoWidth(mq, text), W = tw + pad * 2, DW = Math.ceil(W * k), DH = Math.ceil(H * k);
  // (the finer grid: enough that the main strokes are a dozen or so of its pixels across)
  const ss = Math.max(1, Math.min(4, Math.ceil(100 / (size * k)))), sk = k * ss, SW = DW * ss, SH = DH * ss;
  const [sc, sq] = mk(), [oc, oq] = mk();
  for (const [c, q, d] of [[mc, mq, k], [oc, oq, k], [sc, sq, sk]]) {
    c.width = DW * d / k; c.height = DH * d / k; q.setTransform(d, 0, 0, d, 0, 0); q.font = font; q.textBaseline = base; q.textAlign = 'left';
  }
  // the light is set by the capitals' own head and foot (plain Cinzel's H: the decorative face's own H is a tall
  // swash); where the browser cannot say, by the drawn letters themselves
  mq.font = font.replace(/"Cinzel Decorative"/, 'Cinzel'); const hm = mq.measureText('H'); mq.font = font;
  sq.fillStyle = '#000'; decoText(sq, text, pad, y0, (t, x, y) => sq.fillText(t, x, y));
  const sa = sq.getImageData(0, 0, SW, SH).data;
  let top, bot;
  if (hm.actualBoundingBoxAscent > 0) { top = y0 - hm.actualBoundingBoxAscent; bot = y0 + hm.actualBoundingBoxDescent; }
  else {
    let r0 = SH, r1 = 0;
    for (let iy = 0; iy < SH; iy++) for (let ix = 0, o = iy * SW * 4 + 3; ix < SW; ix++, o += 4) if (sa[o] > 100) { r0 = Math.min(r0, iy); r1 = iy; break; }
    if (r1 <= r0) { r0 = (y0 - size * 0.75) * sk; r1 = y0 * sk; }
    top = r0 / sk; bot = (r1 + 1) / sk;
  }
  const ch = bot - top;
  let seed = 7; for (const c of String(text)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const R = mulberry(seed);
  // (worked only over the rows the letters touch, and a few more)
  let Y0 = SH, Y1 = 0;
  for (let y = 0; y < SH; y++) for (let x = 0, o = y * SW * 4 + 3; x < SW; x++, o += 4) if (sa[o]) { if (y < Y0) Y0 = y; Y1 = y; break; }
  Y0 = Math.max(0, Y0 - 4); Y1 = Math.min(SH - 1, Math.max(Y0, Y1 + 4));
  const GH = Y1 - Y0 + 1, N = SW * GH, A = new Uint8Array(N);
  for (let i = 0, o = Y0 * SW * 4 + 3; i < N; i++, o += 4) A[i] = sa[o];
  // each stroke's height is its distance in from the nearest edge: so it rises to a spine down its middle (smoothed
  // over a pixel, which evens the faces; the spine is kept sharp below by turning each face fully as soon as it leans)
  const h = edgeDist(A, SW, GH), h2 = new Float32Array(N);
  for (let y = 0; y < GH; y++) for (let x = 1, o = y * SW + 1; x < SW - 1; x++, o++) h2[o] = (h[o - 1] + 2 * h[o] + h[o + 1]) / 4;
  for (let y = 1; y < GH - 1; y++) for (let x = 0, o = y * SW; x < SW; x++, o++) h[o] = (h2[o - SW] + 2 * h2[o] + h2[o + SW]) / 4;
  // the light: from the upper left and a little in front (L), its glare (Hh, half way to the eye), and warm light
  // thrown back from the lower right into the shadowed faces (B)
  const nz = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const [Lx, Ly, Lz] = nz(-0.72, -0.5, 0.5), [Hx, Hy, Hz] = nz(Lx, Ly, Lz + 1), [Bx, By, Bz] = nz(0.6, 0.55, 0.35);
  const S = 1.15, ramp = goldRamp(), V = new Float32Array(N);
  // which way each face leans is taken from the slope smoothed over a few pixels (so an edge's stair-steps don't
  // streak the faces); the smoothed slope still flips sign right on the spine, so the spine stays a sharp line
  const fx = new Float32Array(N), fy = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
  for (let y = 1; y < GH - 1; y++) for (let x = 1, o = y * SW + 1; x < SW - 1; x++, o++) { fx[o] = h[o + 1] - h[o - 1]; fy[o] = h[o + SW] - h[o - SW]; }
  for (let p = 0; p < 2; p++) {
    for (let y = 0; y < GH; y++) for (let x = 1, o = y * SW + 1; x < SW - 1; x++, o++) { tx[o] = fx[o - 1] + 2 * fx[o] + fx[o + 1]; ty[o] = fy[o - 1] + 2 * fy[o] + fy[o + 1]; }
    for (let y = 1; y < GH - 1; y++) for (let x = 0, o = y * SW; x < SW; x++, o++) { fx[o] = tx[o - SW] + 2 * tx[o] + tx[o + SW]; fy[o] = ty[o - SW] + 2 * ty[o] + ty[o + SW]; }
  }
  for (let y = 1; y < GH - 1; y++) {
    const tY = Math.max(0, Math.min(1, ((y + Y0 + 0.5) / sk - top) / ch)), bias = 0.08 * (0.5 - tY);
    for (let x = 1, o = y * SW + 1; x < SW - 1; x++, o++) {
      if (!A[o]) continue;
      const gl = Math.hypot(h[o + 1] - h[o - 1], h[o + SW] - h[o - SW]) / 2, fl = Math.hypot(fx[o], fy[o]) || 1, tl = S * Math.min(1, gl / 0.3) / fl;
      let nx = -tl * fx[o], ny = -tl * fy[o], l = Math.hypot(nx, ny, 1); nx /= l; ny /= l; const nzz = 1 / l;
      const dl = nx * Lx + ny * Ly + nzz * Lz, sp = Math.max(0, nx * Hx + ny * Hy + nzz * Hz), bk = Math.max(0, nx * Bx + ny * By + nzz * Bz);
      let v = 0.6 + 0.8 * (dl - Lz) + 0.14 * -ny + 0.16 * bk * bk + 0.5 * sp ** 24 + bias;
      // (the deepest shadows held up a little: still red-brown, never black)
      V[o] = v < 0.22 ? 0.22 - (0.22 - v) * 0.45 : v;
    }
  }
  // down to the screen's grid: each pixel the average of its little block (by how much of it is letter)
  const out = oq.createImageData(DW, DH), od = out.data, VO = new Float32Array(DW * DH), s2 = ss * ss;
  for (let Y = Math.floor(Y0 / ss); Y <= Math.floor(Y1 / ss); Y++) for (let X = 0; X < DW; X++) {
    let r = 0, gg = 0, b = 0, a = 0, vv = 0;
    for (let j = 0; j < ss; j++) {
      const gy = Y * ss + j - Y0; if (gy < 0 || gy >= GH) continue;
      for (let i = 0, o = gy * SW + X * ss; i < ss; i++, o++) {
        const al = A[o]; if (!al) continue;
        const v = V[o], c = Math.max(0, Math.min(255, Math.round(v * 204))) * 3;
        r += ramp[c] * al; gg += ramp[c + 1] * al; b += ramp[c + 2] * al; a += al; vv += v * al;
      }
    }
    if (!a) continue;
    const p = (Y * DW + X) * 4; od[p] = r / a; od[p + 1] = gg / a; od[p + 2] = b / a; od[p + 3] = a / s2;
    if (a >= 250 * s2) VO[Y * DW + X] = vv / a;
  }
  const [gc, gq] = mk(); gc.width = DW; gc.height = DH; gq.putImageData(out, 0, 0);
  // the word: a soft shadow on the page, the dark brown lining, the gold on it
  oq.save(); oq.lineJoin = 'round';
  oq.shadowColor = 'rgba(45,14,6,0.3)'; oq.shadowOffsetX = size * 0.02 * k; oq.shadowOffsetY = size * 0.035 * k; oq.shadowBlur = size * 0.05 * k;
  oq.strokeStyle = '#3e140a'; oq.lineWidth = Math.max(1.1, size * 0.062);
  decoText(oq, text, pad, y0, (t, x, y) => oq.strokeText(t, x, y)); oq.restore();
  oq.save(); oq.setTransform(1, 0, 0, 1, 0, 0); oq.drawImage(gc, 0, 0); oq.restore();
  // pinpoint highlights: a dot of near-white on the brightest spots of the lit faces, well apart
  const want = Math.max(1, Math.min(3, Math.round(String(text).replace(/\s/g, '').length / 4)));
  let vmax = 0; for (let i = 0; i < VO.length; i++) if (VO[i] > vmax) vmax = VO[i];
  const cand = [];
  // (rather on the letters' upper parts, under the sky)
  for (let i = 0; i < VO.length; i++) if (VO[i] > vmax - 0.15) {
    const tY = ((Math.floor(i / DW) + 0.5) / k - top) / ch; cand.push([VO[i] - 0.12 * tY + R() * 0.04, i]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  const got = [];
  for (const [, i] of cand) {
    if (got.length >= want) break;
    const x = (i % DW + 0.5) / k, y = (Math.floor(i / DW) + 0.5) / k;
    if (got.some(p => Math.abs(p[0] - x) < size * 1.6)) continue;
    got.push([x, y]);
  }
  // (a solid dot, its edge only just softened: about three screen pixels across on a phone's title)
  const px1 = 1 / k, rd = Math.max(0.6, size * 0.032), rr = rd + 0.7 * px1;
  for (const [x, y] of got) {
    const rg = oq.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, 'rgba(255,254,246,1)'); rg.addColorStop(rd / rr * 0.7, 'rgba(255,253,240,1)'); rg.addColorStop(1, 'rgba(255,246,210,0)');
    oq.fillStyle = rg; oq.beginPath(); oq.arc(x, y, rr, 0, Math.PI * 2); oq.fill();
  }
  goldWord.ms = performance.now() - t0;
  w = { c: oc, W: DW / k, H: DH / k, ox: pad, oy: y0, tw };
  // (built before the fonts arrive it would keep the fallback face, so then it is built again next time)
  if (!document.fonts || document.fonts.check(font)) { if (_gold.size > 40) _gold.clear(); _gold.set(key, w); }
  return w;
}
function goldText(g, text, x, y, size) {
  if (!text) return;
  const w = goldWord(g, text, size), al = g.textAlign, m = g.getTransform();
  let lx = x - w.ox - (al === 'center' ? w.tw / 2 : al === 'right' || al === 'end' ? w.tw : 0), ty = y - w.oy;
  // (laid on whole pixels, so it stays crisp)
  if (!m.b && !m.c && m.a && m.d) { lx = (Math.round(m.a * lx + m.e) - m.e) / m.a; ty = (Math.round(m.d * ty + m.f) - m.f) / m.d; }
  g.drawImage(w.c, lx, ty, w.W, w.H);
}
// where a capital's body lies, as fractions of its size from its centred, baseline origin: the letter is drawn large
// offscreen and its ink counted down each column and along each row; the columns and rows holding at least 35% of the
// fullest one are its body (the stems, bowls and bars), so a thin swash, tail or serif reaching out does not count.
// Also its whole ink box, so the swashes can still be kept inside the frame.
const _capBody = new Map();
function capBody(ch) {
  const font = '700 200px "Cinzel Decorative", serif';
  let b = _capBody.get(ch); if (b) return b;
  const c = document.createElement('canvas'), q = c.getContext('2d'), S = 200, W = 3 * S, H = 3 * S, ox = 1.5 * S, oy = 2 * S;
  c.width = W; c.height = H; q.font = font; q.textAlign = 'center'; q.textBaseline = 'alphabetic'; q.fillStyle = '#000';
  decoText(q, ch, ox, oy, (t, x, y) => q.fillText(t, x, y));
  const d = q.getImageData(0, 0, W, H).data, col = new Float32Array(W), row = new Float32Array(H);
  for (let y = 0, o = 3; y < H; y++) for (let x = 0; x < W; x++, o += 4) if (d[o]) { const a = d[o] / 255; col[x] += a; row[y] += a; }
  const span = (v, n) => {
    let mx = 0, i0 = -1, i1 = -1, b0 = -1, b1 = -1;
    for (let i = 0; i < n; i++) { if (v[i] > mx) mx = v[i]; if (v[i] > 0) { if (i0 < 0) i0 = i; i1 = i; } }
    for (let i = 0; i < n; i++) if (v[i] >= mx * 0.35) { if (b0 < 0) b0 = i; b1 = i; }
    return [i0, i1 + 1, b0, b1 + 1];
  };
  const [x0, x1, bx0, bx1] = span(col, W), [y0, y1, by0, by1] = span(row, H);
  if (x0 < 0) return null; // (nothing drawn)
  b = { x0: (x0 - ox) / S, x1: (x1 - ox) / S, y0: (y0 - oy) / S, y1: (y1 - oy) / S, bx: ((bx0 + bx1) / 2 - ox) / S, by: ((by0 + by1) / 2 - oy) / S };
  // (measured before the font arrives it would be the fallback face's, so then it is measured again next time)
  if (!document.fonts || document.fonts.check(font)) _capBody.set(ch, b);
  return b;
}
// a single capital of chiselled gold on the lapis field of a drop cap (the field box px square, its middle at cx, cy):
// large enough that each stroke's spine reads, and centred on the letter's body, not on its swashes or serifs (a W's
// long tail would pull it aside). The decorative face's swashes make A, G, L, N, U, V and W much wider or taller than E
// or T, so a capital is made smaller until its ink fits 80% of the field, and smaller again (by an eighth at most) if,
// centred on its body, a swash would reach past 42% of the field from its middle (the frame's inner rule is just
// beyond). A swash longer still (the L's long foot) moves its body off the middle just enough to keep inside.
function goldCap(g, ch, cx, cy, box) {
  const b = capBody(ch);
  let size = box * 0.72, dx = 0, dy = size * 0.36;
  if (b) {
    size = Math.min(size, box * 0.8 / Math.max(b.x1 - b.x0, b.y1 - b.y0));
    const reach = Math.max(b.bx - b.x0, b.x1 - b.bx, b.by - b.y0, b.y1 - b.by);
    size = Math.round(Math.max(size * 0.875, Math.min(size, box * 0.42 / reach)));
    // the body's middle, then the letter slid back toward the field's middle only as far as its ink needs
    const lim = box * 0.42, clamp = (c, a0, a1) => Math.min(Math.max(c, a1 * size - lim), a0 * size + lim);
    dx = -clamp(b.bx * size, b.x0, b.x1); dy = -clamp(b.by * size, b.y0, b.y1);
  } else size = Math.round(size);
  g.save(); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `700 ${size}px "Cinzel Decorative", serif`;
  goldText(g, ch, cx + dx, cy + dy, size); g.restore();
}
// the same capital on a small canvas of its own, for a drop cap written in the page's HTML (the Notes leaf); drawn
// again once the font has arrived, if it had not yet
function goldCapCanvas(ch, box) {
  const k = Math.max(1, window.devicePixelRatio || 1), c = document.createElement('canvas'), q = c.getContext('2d');
  c.width = c.height = Math.ceil(box * k); c.style.width = c.style.height = box + 'px';
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', ch);
  const draw = () => { q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, c.width, c.height); q.setTransform(k, 0, 0, k, 0, 0); goldCap(q, ch, box / 2, box / 2, box); };
  draw();
  const font = `700 ${Math.round(box * 0.72)}px "Cinzel Decorative"`;
  if (document.fonts && !document.fonts.check(font)) document.fonts.load(font).then(draw, () => { });
  return c;
}
// a sigil in its knotwork roundel (whose outer edge is (r + 3) / 0.6). With `tint`, the roundel's open middle is
// filled with the sigil's own colour and a thin ink ring sits inside it, as the phone's notes leaf shows it
// (glyphIcon: a coloured disc filling the roundel's middle, an ink ring at 0.87 of it, the glyph at about 0.68)
function medalGlyph(g, id, cx, cy, r, lw, tint) {
  const m = r + 3; // the roundel's open middle
  if (tint) { // (the disc runs a hair under the roundel's inner gold rim, so no parchment shows between them)
    g.fillStyle = SIGILS[id].color; g.beginPath(); g.arc(cx, cy, m + 0.8, 0, TAU); g.fill();
  }
  roundelAt(g, cx, cy, m);
  if (tint) { g.strokeStyle = '#2a1830'; g.lineWidth = lw * 0.7; g.beginPath(); g.arc(cx, cy, m * 0.87, 0, TAU); g.stroke(); }
  drawGlyph(g, id, cx, cy, r * 0.82, '#2a1830', lw);
}

/* =====================================================================
   The Grimoire — drawing page overlay
   ===================================================================== */
const Grim = {
  cv: null, g: null, dpr: 1,
  open: false, anim: 0, closing: false,
  draft: new Draft(), live: null, lastStrokes: null,
  ghost: null, book: null, bookDirty: true, inkLayer: null, inkDirty: true,
  L: null, sparks: [], status: '', statusCol: '#3a2a1a', flash: 0, shake: 0, codexRects: [],
  lastPt: null, lastTime: 0, pointerId: null,

  init(cv) {
    this.cv = cv; this.g = cv.getContext('2d');
    this.book = document.createElement('canvas');
    this.inkLayer = document.createElement('canvas');
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // the page buttons are measured, not assumed: a phone's text-size setting or the satchel's count can make them
    // run wider and taller than planned, and the upright page then makes room for them
    const pb = document.getElementById('pagebtns');
    if (pb && window.ResizeObserver) new ResizeObserver(() => this.placeButtons()).observe(pb);
    this.resize();
  },
  resize() {
    const dpr = this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    for (const c of [this.cv, this.book, this.inkLayer]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.layout(); this.bookDirty = true; this.inkDirty = true;
  },
  layout() {
    const vw = innerWidth, vh = innerHeight;
    // a phone held sideways: the book open at two pages, the drawing circle on the right one (where the desktop
    // spread has it), everything else in a column on the left one
    const side = vh < 560 && vw > vh * 1.25;
    const single = side || vw < 900 || vh > vw * 0.95;
    // (the ring round the drawing circle, in half-widths: snug on one page, and snugger upright, where the width
    // is all there is — so the circle, and its slots drawn larger, get what the ring gives up)
    const L = { single, side: null, fr: side ? 0.99 : single ? 0.97 : 1.04 };
    L.legend = !!ringRules(); // (v177) the codex strip's line of ring rules under the sigils' names
    SLOT_SIZE = single ? 0.32 : 0.27;
    if (side) {
      // the height is all a sideways phone has: the book runs nearly edge to edge (leaving the painted cover room at
      // the sides), the right page just wide enough for the circle, which fills its height inside the knotwork border
      // (the frame's rules a few pixels clear of it); the left page takes the rest, up to half as wide again as tall
      // (v169: the pages swapped, so the circle stands on the right as on the desktop spread)
      const bh = vh - 8, pad = 5, ph = bh - pad * 2;
      const B = { m: ph * 0.035, vh: Math.max(9, ph * 0.03) }; // (as borderSize gives for both pages: neither is narrower than tall)
      const half = (ph / 2 - B.m - B.vh - 6) / L.fr, lw = Math.ceil(2 * half * L.fr + 2 * (B.m + B.vh) + 24);
      const bw = Math.min(vw - 2 * Math.round(vh * 0.055), lw + pad * 2 + ph * 1.5);
      L.bx = (vw - bw) / 2; L.by = 4; L.bw = bw; L.bh = bh;
      const cw = bw - pad * 2 - lw;
      L.left = { x: L.bx + pad, y: L.by + pad, w: cw, h: ph };
      L.right = { x: L.left.x + cw, y: L.by + pad, w: lw, h: ph };
      L.area = { x: L.right.x + lw / 2 - half, y: L.right.y + ph / 2 - half, size: half * 2 };
      // the column inside the left page's border (its bottom, where the buttons stand, just above the knotwork)
      const P = L.left, inset = B.m + B.vh + 8;
      L.side = { x: P.x + inset, y: P.y + 14, w: P.w - inset * 2, h: P.h - 14 - (B.m + B.vh + 4) };
    } else if (!single) {
      const bw = Math.min(vw - 40, (vh - 30) * 1.52, 1500), bh = bw / 1.52;
      L.bx = (vw - bw) / 2; L.by = (vh - bh) / 2; L.bw = bw; L.bh = bh;
      const pad = 6; // the pages run out to the cover (only a sliver of the leaves beneath shows): more room on each
      L.left ={ x: L.bx + pad, y: L.by + pad, w: bw / 2 - pad, h: bh - pad * 2 };
      L.right = { x: L.bx + bw / 2, y: L.by + pad, w: bw / 2 - pad, h: bh - pad * 2 };
      const P = L.right, mn = Math.min(P.w, P.h), s = mn / 520;
      const B = { m: mn * 0.035, vh: Math.max(9, mn * 0.03) }; // (as borderSize gives, before this.L exists)
      // the page is the circle's (no heading, the map on the lesson page): from just under the top border, as wide
      // as clears the corner bosses; under it (its ring 4% outside the box) the name, two lines of read-back, then
      // the buttons (as tall as they measured) above the bottom border — on a short page the circle gives that up
      const top = P.y + B.m + B.vh + 10 * s;
      const room = (P.y + P.h - B.m - B.vh - 8 - (this.spreadBtnH || 90) - 78 * s - 12 - top) / 1.02;
      const size = Math.min(P.w * 0.8, room);
      // (any height to spare is shared above and below)
      L.area = { x: P.x + (P.w - size) / 2, y: top + Math.max(0, room - size) * 0.5, size };
    } else {
      // upright: the circle takes nearly the page's full width (the width is what limits it) and the book grows
      // as tall as it needs — header, circle, then the status, the buttons' two rows (as tall as they measured)
      // and the bottom border: the last row sits between the bottom corner bosses, just above the vine
      const HEAD = 128 + (L.legend ? 14 : 0), pad = 4;
      const bw = Math.min(vw - 4, 640), pw = bw - pad * 2;
      // (the status: the name clear of the ring and two lines of read-back, as statusAt places them — more on wider pages)
      const FOOT = Math.max(64, 78 * pw / 520 + 15) + (this.btnH || 88) + pw * 0.035 + Math.max(9, pw * 0.03) + 6;
      // the whole drawing circle stays inside the page's border (margin m, plus room for the vine's leaves)
      const m = pw * 0.035;
      const size = Math.max(160, Math.min((pw - 2 * (m + 9)) * 0.99 / L.fr, vh - 4 - pad * 2 - HEAD - FOOT));
      const bh = Math.min(vh - 4, HEAD + size + FOOT + pad * 2);
      // the painted page's fold (left) and cover with its gilt corners (right) both stand outside the page, the cover
      // twice as far: the page is laid so the whole painting fits (as folioBook scales it), the fold and a sliver of the
      // facing page on the left, the cover's corners whole on the right, the page centred when there is room (v168:
      // centred on a phone, the cover ran off the screen and its corners showed as slivers)
      const FA = FOLIO_ART.page, kL = FA.rx[0] - FA.spine, kR = FA.w - FA.rx[1];
      const mn = Math.min(pw, bh - pad * 2), mc = mn * 0.035 + Math.max(9, mn * 0.03) / 2;
      const sk = Math.min(mc / kL, (vw - 4 - (pw - 2 * mc)) / (kL + kR));
      const px = Math.max(sk * kL + 3 - mc, Math.min((vw - pw) / 2, vw - 1 - sk * kR - pw + mc));
      L.bx = px - pad; L.by = (vh - bh) / 2; L.bw = bw; L.bh = bh;
      L.right = { x: L.bx + pad, y: L.by + pad, w: pw, h: bh - pad * 2 };
      L.left = null;
      const P = L.right;
      L.area = { x: P.x + (P.w - size) / 2, y: P.y + HEAD, size };
    }
    L.area.cx = L.area.x + L.area.size / 2; L.area.cy = L.area.y + L.area.size / 2; L.area.half = L.area.size / 2;
    this.L = L;
    document.getElementById('pagebtns')?.classList.remove('tight'); // (tried afresh at each size)
    this.placeButtons();
  },
  // where the spell's name and read-back sit (sy + 2 is the name's baseline): under the circle, the name's tall
  // script capitals (about 0.8 of its size) kept clear of the ring, which on the spread is drawn 4% outside the box
  statusAt() {
    const L = this.L, A = L.area, SD = L.side, P = SD || L.right, s = SD ? Math.min(0.9, P.w / 380) : Math.min(P.w, P.h) / 520;
    if (SD) return { SD, P, s, sy: SD.y + 134 + (L.legend ? 14 : 0) };
    const ring = A.cy + A.half * L.fr + 4;
    const sy = Math.max(A.y + A.size + (L.single ? 26 : 22 * s), ring + 6 * s + 0.8 * (30 * s + 4) - 2);
    // (end: below the read-back's second line, with a little air before the buttons)
    return { SD, P, s, sy, end: sy + 22 * s + 4 + (15 * s + 3) + 11 * s };
  },
  // the HTML page buttons under the drawing area
  // (v168) an upright phone's book stands over the dark page's lesson header (its top cut through it) and carries the
  // lesson's name itself, so the header fades while the book is open there (CSS #lesson.under-book); on a short phone
  // the book's top stands over the tool buttons too, which showed as slivers above it, so they fade then as well
  headUnder() {
    const el = document.getElementById('lesson'), tl = document.getElementById('tools'), L = this.L;
    const up = !!(this.open && L && L.single && !L.side);
    if (el) el.classList.toggle('under-book', up);
    if (tl) tl.classList.toggle('under-book', up && tl.getBoundingClientRect().bottom > L.by + 2);
  },
  placeButtons() {
    const pb = document.getElementById('pagebtns'), L = this.L; if (!pb || !L) return;
    this.headUnder();
    pb.classList.toggle('single', L.single);
    // (a phone held sideways sets them out as upright, at the foot of its left-hand page, the column's)
    pb.classList.toggle('upright', L.single);
    this.fitButtons();
    pb.style.bottom = 'auto';
    if (!L.single) {
      pb.style.left = L.right.x + 'px'; pb.style.width = L.right.w + 'px';
      // room for the name and two lines of the read-back, the big Inscribe kept above the bottom border
      const P = L.right, B = this.borderSize(P), h = pb.style.display === 'flex' ? pb.offsetHeight : 0;
      if (h && Math.abs(h - (this.spreadBtnH || 90)) > 2 && (this._relaid = (this._relaid || 0) + 1) < 4) {
        this.spreadBtnH = h; this.layout(); this.bookDirty = true; this.inkDirty = true; this._relaid = 0;
        return;
      }
      pb.style.top = Math.min(Math.max(L.area.y + L.area.size + P.h * 0.1, this.statusAt().end), P.y + P.h - B.m - B.vh - 8 - h) + 'px';
      return;
    }
    // upright: inside the knotwork border, always two rows (CSS: Notes, Undo, Blot, Recall and a ✕ for Close
    // across the page; Keep, Satchel and Inscribe between the bottom corner bosses, just above the vine), the
    // first row clear of the bosses' tops; the labels shrink to fit (large system text) rather than wrap to a third row
    // (sideways, on the left page: the column's, the circle having the right one)
    const P = L.side ? L.left : L.right, B = this.borderSize(P), inset = B.m + B.vh + 4;
    pb.style.left = (P.x + inset) + 'px'; pb.style.width = (P.w - inset * 2) + 'px';
    pb.style.setProperty('--bx', Math.max(0, B.m + B.bs * 0.9 + 4 - inset) + 'px');
    pb.style.rowGap = Math.max(4, B.bs * 0.9 - B.vh - 42) / 2 + 'px'; // (halved: the row break is an empty line of its own)
    this.fitButtons(); // (again, now the row has its width: measured before it, the plaques were still as wide as the last layout left them)
    if (pb.style.display === 'flex') {
      const h = pb.offsetHeight;
      if (h && Math.abs(h - (this.btnH || 88)) > 2 && (this._relaid = (this._relaid || 0) + 1) < 4) {
        this.btnH = h; this.layout(); this.bookDirty = true; this.inkDirty = true; this._relaid = 0;
        return;
      }
    }
    pb.style.top = (P.y + P.h - inset - (this.btnH || 88)) + 'px';
  },
  // upright, each page button's label shrinks until it fits its plaque (Firefox for Android scales text up with the
  // system font size, which used to wrap the buttons to a third row and shrink the circle); elsewhere they keep the CSS size
  // (v168: measured by the label's own drawn width, not scrollWidth: a centred label that overflows spills out both
  // sides, which scrollWidth does not see, so Ryan's phone showed UNDO as "UNDC"; and kept a few pixels clear of the
  // plaque's inner frame, which NOTES touched. The letters close up first, then the type shrinks.)
  fitButtons() {
    const pb = document.getElementById('pagebtns'); if (!pb) return;
    for (const b of pb.children) { b.style.fontSize = ''; b.style.letterSpacing = ''; }
    if (!pb.classList.contains('upright') || pb.style.display !== 'flex') return;
    const r = document.createRange();
    for (const b of pb.children) {
      if (!b.offsetParent || b.id === 'pClose') continue;
      r.selectNodeContents(b);
      const room = b.clientWidth - 6; // (the field inside the knotwork, less 3px each side)
      if (r.getBoundingClientRect().width > room) b.style.letterSpacing = '0px';
      for (let n = 0; n < 6; n++) {
        const w = r.getBoundingClientRect().width; if (!w || w <= room) break;
        const fs = parseFloat(getComputedStyle(b).fontSize); if (fs <= 7.01) break;
        b.style.fontSize = Math.max(7, fs * room / w * 0.98).toFixed(2) + 'px';
      }
    }
  },
  /* screen rects of things on the page, for the tips (js/tips.js): 'guide', 'centre', 'slot:k', 'sign', 'status',
     'codex:id', 'area' (the whole drawing circle with its eight places) */
  anchor(name) {
    const L = this.L; if (!L || !this.open) return null;
    const A = L.area, r = A.half * GUIDE_R;
    if (name === 'guide') return { x: A.cx - r, y: A.cy - r, w: r * 2, h: r * 2, round: true };
    if (name === 'centre') return { x: A.cx - r * 0.55, y: A.cy - r * 0.55, w: r * 1.1, h: r * 1.1, round: true };
    // (the whole seal, ringed where its outer circle goes, just beyond the small circles)
    if (name === 'area') { const R = r * (SLOT_R + SLOT_SIZE) + 6; return { x: A.cx - R, y: A.cy - R, w: R * 2, h: R * 2, round: true }; }
    if (name.startsWith('slot:')) {
      const k = +name.slice(5), a = k * TAU / 8, sr = r * SLOT_SIZE + 4;
      return { x: A.cx + Math.cos(a) * r * SLOT_R - sr, y: A.cy + Math.sin(a) * r * SLOT_R - sr, w: sr * 2, h: sr * 2, round: true };
    }
    if (name === 'sign') {
      const D = this.draft.a, sg = D.signs[0]; if (!sg) return null;
      const pts = this.draft.strokes[sg.i].pts;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { const X = A.cx + p.x * A.half, Y = A.cy + p.y * A.half; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
      return { x: x0 - 12, y: y0 - 12, w: x1 - x0 + 24, h: y1 - y0 + 24 };
    }
    if (name === 'status') {
      const { P, s, sy } = this.statusAt();
      const w = P.w * 0.8;
      return { x: P.x + (P.w - w) / 2, y: sy - 30 * s - 4, w, h: 30 * s + 44 * s + 8 };
    }
    if (name.startsWith('codex:')) { const c = this.codexRects.find(c => c.id === name.slice(6)); return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null; }
    return null;
  },
  // (v177) the ring-sigils the drawn centre takes in this lesson, or null (no ring rules, or no centre a ring here can have)
  ringTakes() {
    const R = ringRules(), S = this.draft.a.sigil;
    return R && S && S.ok ? R.takes(S.id) : null;
  },
  // (v177) is this sigil one the drawn centre won't take on its ring? (the centre itself stays bright)
  ringRefuses(id) { const t = this.ringTakes(); return !!t && !t.includes(id) && id !== this.draft.a.sigil.id; },
  slotRel(k) {
    const D = this.draft.a; let sx = 0, sy = 0;
    for (const s of D.signs) { sx += Math.cos(s.pos * TAU / 8); sy += Math.sin(s.pos * TAU / 8); }
    if (!D.signs.length) return null;
    // signs that balance out (opposite arms) give the spell no single way: every ring-sigil then acts at once, as buildSpell has it
    if (Math.hypot(sx, sy) < 0.5 * D.signs.length) return 'now';
    const c = Math.cos(k * TAU / 8 - Math.atan2(sy, sx)); // the same rule buildSpell uses
    return c > 0.38 ? 'arrive' : c < -0.38 ? 'now' : 'along';
  },
  toArea(e) { const A = this.L.area; return { x: (e.clientX - A.cx) / A.half, y: (e.clientY - A.cy) / A.half }; },
  inArea(e) { const p = this.toArea(e); return Math.abs(p.x) <= 1.22 && Math.abs(p.y) <= 1.22; },

  show() {
    // the window may have been sized after load (embedded views): lay the book out afresh
    if (this.cv.width !== Math.round(innerWidth * Math.min(2, window.devicePixelRatio || 1)) || !this.L || this.L.bw <= 0) this.resize();
    this.open = true; this.closing = false; this.cv.style.display = 'block';
    document.getElementById('pagebtns').style.display = 'flex';
    this.headUnder();
    // (the page itself is painted again only when its lesson or the screen changes, not at every opening)
    this.inkDirty = true;
    this.updateStatus();
    Sfx.play('page');
  },
  // while a card covers the game, the closed book's full-page layers are let go; show() lays them out afresh
  releaseLayers() {
    if (this.open || this.closing) return;
    for (const c of [this.cv, this.book, this.inkLayer, this.glowLayer]) if (c) { c.width = 1; c.height = 1; }
  },
  hide() {
    this.closing = true; this.open = false;
    document.getElementById('pagebtns').style.display = 'none';
    this.headUnder();
    document.getElementById('notes').classList.remove('show');
    Sfx.pen(0);
  },

  down(e) {
    if (!this.open) return;
    Sfx.init();
    // codex clicks
    for (const r of this.codexRects) {
      if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
        this.ghost = this.ghost === r.id ? null : r.id; Sfx.play('tick'); return;
      }
    }
    const B = this.L;
    const inBook = e.clientX >= B.bx && e.clientX <= B.bx + B.bw && e.clientY >= B.by && e.clientY <= B.by + B.bh;
    if (!inBook) { Game.closeGrimoire(); return; }
    if (!this.inArea(e)) return;
    try { this.cv.setPointerCapture(e.pointerId); } catch (err) { }
    this.pointerId = e.pointerId;
    const p = this.toArea(e);
    this.live = { pts: [{ x: p.x, y: p.y, w: 0.012 }] };
    this.lastPt = p; this.lastTime = performance.now(); this.smooth = p;
  },
  move(e) {
    if (!this.live || e.pointerId !== this.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const raw = this.toArea(ev);
      const sm = this.smooth = { x: lerp(this.smooth.x, raw.x, 0.55), y: lerp(this.smooth.y, raw.y, 0.55) };
      const last = this.live.pts[this.live.pts.length - 1];
      const dx = sm.x - last.x, dy = sm.y - last.y, d = Math.hypot(dx, dy);
      if (d < 0.006) continue;
      const now = performance.now(), dt = Math.max(1, now - this.lastTime); this.lastTime = now;
      const speed = d * this.L.area.half / dt; // px/ms
      const ang = Math.atan2(dy, dx), nib = -0.7;
      let w = (0.0045 + 0.0135 * Math.abs(Math.sin(ang - nib))) * clamp(1.25 - speed * 0.18, 0.55, 1.2);
      w = lerp(last.w, w, 0.35);
      this.live.pts.push({ x: sm.x, y: sm.y, w });
      Sfx.pen(speed);
      if (Math.random() < 0.35) this.sparks.push({ x: sm.x, y: sm.y, vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08 - 0.04, t: 0, life: 0.5 + Math.random() * 0.6 });
    }
  },
  up(e) {
    if (!this.live) return;
    Sfx.pen(0);
    const st = this.live; this.live = null;
    if (pathLen(st.pts) < 0.04) return;
    // taper the tail
    const n = st.pts.length;
    for (let i = Math.max(0, n - 6); i < n; i++) st.pts[i].w *= lerp(1, 0.45, (i - (n - 6)) / 6);
    const before = this.draft.a;
    const A = this.draft.add(st);
    const role = A.roles[A.roles.length - 1];
    if (role === 'seal' && !before.seal) Sfx.play('seal');
    else if (role === 'sigil' && A.sigil && A.sigil.ok && !(before.sigil && before.sigil.ok && before.sigil.id === A.sigil.id)) Sfx.play('sigil', A.sigil.id);
    else if (role === 'sign' || role === 'barb') Sfx.play('sign');
    else if (role === 'ring') Sfx.play('seal');
    else if (role === 'stray') Sfx.play('smudge');
    this.inkDirty = true;
    this.updateStatus();
  },
  undo() { this.draft.undo(); this.inkDirty = true; this.updateStatus(); Sfx.play('smudge'); },
  blot() { this.draft.clear(); this.inkDirty = true; this.updateStatus(); Sfx.play('page'); },
  recall() {
    if (!this.lastStrokes) { this.status = 'No spell has yet been cast this lesson.'; return; }
    this.loadStrokes(this.lastStrokes);
  },
  loadStrokes(strokes) {
    this.draft.clear(); for (const s of strokes) this.draft.add(JSON.parse(JSON.stringify(s)));
    this.inkDirty = true; this.updateStatus(); Sfx.play('page');
  },
  keep() {
    const sp = buildSpell(this.draft, knownRules()); // (v178: a sigil not yet learned can't be kept, so the satchel never names it)
    if (sp.err) { this.status = 'Only a finished spell can be kept: ' + sp.err.charAt(0).toLowerCase() + sp.err.slice(1); this.statusCol = '#8a2a1a'; this.shake = 0.3; Sfx.play('fizzle'); return false; }
    const A = this.draft.a;
    const strokes = this.draft.strokes.filter((s, i) => A.roles[i] !== 'stray');
    if (!Satchel.add(strokes)) { this.status = 'Your satchel is full. Let a kept spell go first.'; this.statusCol = '#8a2a1a'; Sfx.play('fizzle'); return false; }
    Sfx.play('sigil', sp.sigil);
    this.status = isTouch()
      ? `Kept in your satchel as spell ${Satchel.list.length}. Tap its slot beside the grimoire button to cast it.`
      : `Kept in your satchel as spell ${Satchel.list.length}. Press ${Satchel.list.length} in the world to cast it.`;
    this.statusCol = '#2b2040';
    this.flash = 0.6;
    return true;
  },
  updateStatus() {
    const A = this.draft.a, allowed = lessonRules();
    this.statusCol = '#4a3220';
    if (!this.draft.strokes.length) { this.status = 'Begin with the seal: draw one closed circle.'; return; }
    if (!A.seal && A.loneSigil) { this.status = `${sigilKnown(A.loneSigil) ? SIGILS[A.loneSigil].name : 'Your mark'} is written. Now draw the seal around it: one closed circle, on the dotted ring.`; return; }
    if (!A.seal) { this.status = 'The seal must close upon itself: a round, unbroken circle.'; this.statusCol = '#8a2a1a'; return; }
    if (!A.sigil) { this.status = 'The seal is set. Now inscribe a sigil within it.'; return; }
    const sp = buildSpell(this.draft, allowed);
    if (sp.err) {
      this.status = sp.err; this.statusCol = '#8a2a1a';
      // (v178: only a sigil the player has met is offered as the closest)
      if (!A.sigil.ok && A.sigil.id) { if (sigilKnown(A.sigil.id)) this.status += `  (Closest: ${SIGILS[A.sigil.id].name}?)`; }
      else { const u = A.sats.find(s => !s.ok && s.id); if (A.sigil.ok && u && sigilKnown(u.id)) this.status += `  (Closest: ${SIGILS[u.id].name}?)`; }
      return;
    }
    this.status = describeSpell(sp);
    if (ringExtras(A).size) this.status += ` · a ring holds ${['', 'one', 'two', 'three'][RING_MAX]} of one sigil; the rest is ignored`;
    else if (A.notes.includes('dupSign')) this.status += ' · one sign to a place; the extra is ignored';
    else if (A.notes.includes('tooManyBarbs')) this.status += ' · a sign bears but two barbs';
    else if (A.roles.includes('stray')) this.status += ' · stray marks are ignored';
    this.statusCol = '#2b2040';
  },
  inscribe() {
    const sp = buildSpell(this.draft, lessonRules());
    if (sp.err) { this.shake = 0.4; this.status = sp.err; this.statusCol = '#8a2a1a'; Sfx.play('fizzle'); return; }
    this.lastStrokes = JSON.parse(JSON.stringify(this.draft.strokes));
    this.flash = 1;
    Sfx.play('inscribe');
    const A = this.L.area, S = this.draft.a.seal;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, r = S.r * (0.9 + Math.random() * 0.25);
      this.sparks.push({ x: S.cx + Math.cos(a) * r, y: S.cy + Math.sin(a) * r, vx: Math.cos(a) * 0.4 * Math.random(), vy: Math.sin(a) * 0.4 * Math.random() - 0.1, t: 0, life: 0.7 + Math.random() * 0.5, col: sp.color });
    }
    setTimeout(() => { this.draft.clear(); this.inkDirty = true; Game.holdSpell(sp); }, 380);
  },

  /* ---------- rendering ---------- */
  renderBook() {
    const g = this.book.getContext('2d'), L = this.L, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const t0 = performance.now();
    this._classic = typeof CLASSIC !== 'undefined' && CLASSIC.on;
    document.getElementById('pagebtns')?.classList.toggle('plaques', !this._classic); // the painted brass plaques (CSS) follow the look
    // the painted book (until its picture has loaded, and in the old look, the drawn one)
    // (two pages — the open spread, or a phone held sideways — the whole book; one, the right-hand page alone)
    const fk = L.left ? 'book' : 'page', fa = folioArt(fk);
    if (fa) this.folioBook(g, fa, FOLIO_ART[fk]); else this.drawnBook(g);
    if (!L.single) this.codex(g, L.left);
    else this.codexStrip(g, L.side || L.right);
    this.drawingFrame(g);
    this._bookMs = performance.now() - t0;
    this.bookDirty = false;
  },
  // the painting round the pages, which stay where they are: its fixed slices are scaled (s) so its ruled borders,
  // painted out, would lie under the knotwork, and so its parchment reaches each page's edges; where the screen has
  // no room for the cover round them it gives (smaller), so the cover and its gilt corners always show whole (one
  // page: the fold, and a sliver of the facing page beyond it, too; layout() places that page to leave the room).
  // The fold stays on the spine, and only each page's plain middle stretches (laid more than once on a long page)
  folioBook(g, im, A) {
    const L = this.L, P = L.right, F = L.left || P, { m, vh } = this.borderSize(P), mc = m + vh / 2;
    const x0 = F.x + mc, x1 = P.x + P.w - mc, y0 = P.y + mc, y1 = P.y + P.h - mc, n = A.rx.length, rx1 = A.rx[n - 1];
    const ideal = mc / (!L.left ? A.rx[0] - A.spine : (A.rx[2] - A.rx[1]) / 2);
    let fit = Math.min((innerWidth - x1) / (A.w - rx1), y0 / A.ry[0], (innerHeight - y1) / (A.h - A.ry[1]));
    fit = Math.min(fit, L.left ? x0 / A.rx[0] : (x0 - 3) / (A.rx[0] - A.spine));
    const s = Math.max(ideal * 0.35, Math.min(ideal, fit));
    const fixed = (a0, a1, a, d) => ({ a0, a1, d0: d + (a0 - a) * s, d1: d + (a1 - a) * s });
    const xf = [fixed(0, A.cx[0], A.rx[0], x0)];
    // (the fold on the spine, where the right page begins: the pages either side of it may differ in width, each
    // middle stretched on its own)
    if (L.left) xf.push(fixed(A.cx[1], A.cx[2], A.spine, P.x));
    xf.push(fixed(A.cx[A.cx.length - 1], A.w, rx1, x1));
    const yf = [fixed(0, A.cy[0], A.ry[0], y0), fixed(A.cy[1], A.h, A.ry[1], y1)];
    const fill = f => { const o = [f[0]]; for (let i = 1; i < f.length; i++) o.push({ a0: f[i - 1].a1, a1: f[i].a0, d0: f[i - 1].d1, d1: f[i].d0, st: 1 }, f[i]); return o; };
    const xs = fill(xf), ys = fill(yf), Y = ys[1], ky = (Y.d1 - Y.d0) / (Y.a1 - Y.a0);
    // (a page much longer one way than the painting's: its middle laid an odd number of times, mirrored in turn)
    const odd = r => r > 2.2 ? 2 * Math.round((r - 1) / 2) + 1 : 1;
    let kx = Infinity;
    for (const X of xs) if (X.st) { const k = (X.d1 - X.d0) / (X.a1 - X.a0); kx = Math.min(kx, k); X.n = odd(k / ky); }
    Y.n = odd(ky / kx);
    // its shadow: soft layers spreading out below it (a canvas blur this size is very slow on phones)
    const bx = xs[0].d0, bw = xs[xs.length - 1].d1 - bx, by = ys[0].d0, bh = ys[2].d1 - by;
    for (let k = 8; k >= 1; k--) { g.fillStyle = 'rgba(0,0,0,0.075)'; roundRect(g, bx - k * 3, by + 16 - k * 2.5, bw + k * 6, bh + k * 5, 8 + k * 3); g.fill(); }
    folioSlices(g, im, xs, ys, this.dpr);
    for (const Pg of (L.left ? [L.left, P] : [P])) this.pageBorderArt(g, Pg);
  },
  // the drawn book: a leather cover with gold rules, a few leaves beneath, parchment pages with an inked border and a
  // shaded gutter (the old look, ◐)
  drawnBook(g) {
    const L = this.L;
    g.save();
    const cm = 14, cvx = L.bx - cm, cvy = L.by - 12, cw = L.bw + cm * 2, ch = L.bh + 24;
    // its shadow: soft layers spreading out below it (a canvas blur this size is very slow on phones)
    for (let k = 8; k >= 1; k--) { g.fillStyle = `rgba(0,0,0,${0.075})`; roundRect(g, cvx - k * 3, cvy + 16 - k * 2.5, cw + k * 6, ch + k * 5, 14 + k * 3); g.fill(); }
    const lg = g.createLinearGradient(cvx, cvy, cvx, cvy + ch);
    lg.addColorStop(0, '#4a2232'); lg.addColorStop(1, '#2a1020');
    g.fillStyle = lg; roundRect(g, cvx, cvy, cw, ch, 14); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(232,194,122,0.55)'; g.lineWidth = 1.5; roundRect(g, cvx + 6, cvy + 6, cw - 12, ch - 12, 10); g.stroke();
    g.strokeStyle = 'rgba(232,194,122,0.25)'; g.lineWidth = 1; roundRect(g, cvx + 10, cvy + 10, cw - 20, ch - 20, 8); g.stroke();
    // page stack edges
    for (let i = 3; i > 0; i--) {
      g.fillStyle = i % 2 ? '#d9c597' : '#e8d6ab';
      g.fillRect(L.bx - i * 1.5 + 2, L.by + i * 1.6, L.bw + i * 3 - 4, L.bh - i * 1.2);
    }
    // (a phone held sideways keeps its one wide page in this look, across both pages' room)
    const pages = !L.single ? [L.left, L.right] : L.left ? [{ x: L.left.x, y: L.left.y, w: L.right.x + L.right.w - L.left.x, h: L.left.h }] : [L.right];
    const pat = g.createPattern(parchment(), 'repeat');
    for (const P of pages) {
      g.save();
      g.fillStyle = pat; g.fillRect(P.x, P.y, P.w, P.h);
      // vignette
      const vg = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, Math.min(P.w, P.h) * 0.3, P.x + P.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) * 0.75);
      vg.addColorStop(0, 'rgba(255,248,225,0.12)'); vg.addColorStop(1, 'rgba(120,75,30,0.38)');
      g.fillStyle = vg; g.fillRect(P.x, P.y, P.w, P.h);
      g.restore();
      this.pageBorder(g, P);
    }
    if (!L.single) {
      // a plain shaded stripe down the gutter
      const cx = L.bx + L.bw / 2, gw = 40, gg = g.createLinearGradient(cx - gw, 0, cx + gw, 0);
      gg.addColorStop(0, 'rgba(60,35,15,0)'); gg.addColorStop(0.45, 'rgba(60,35,15,0.32)'); gg.addColorStop(0.5, 'rgba(40,20,8,0.5)');
      gg.addColorStop(0.55, 'rgba(60,35,15,0.32)'); gg.addColorStop(1, 'rgba(60,35,15,0)');
      g.fillStyle = gg; g.fillRect(cx - gw, L.by, gw * 2, L.bh);
    }
  },
  // the illuminated border: a band of knotwork between two inked rules, a round knotwork boss on each corner
  // (sizes in borderSize, so the page's contents can keep clear of it)
  borderSize(P) {
    const mn = Math.min(P.w, P.h);
    return { m: mn * 0.035, vh: Math.max(9, mn * 0.03), bs: mn * (this.L && this.L.side ? 0.12 : 0.14) };
  },
  // the Notes leaf (phones) as a page of this book: the parchment on bg, the knotwork border and bosses on fr (which
  // lies over the writing). Returns the border's inner edge, so the writing can keep inside it; 0 without the art.
  notesBackdrop(bg, fr) {
    const w = bg.offsetWidth, h = bg.offsetHeight, pim = gart('page'); if (!w || !h || !pim) return 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), P = { x: 0, y: 0, w, h };
    for (const c of [bg, fr]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
    const g = bg.getContext('2d');
    if (!folioLeaf(g, 0, 0, w, h)) drawCover(g, pim, 0, 0, w, h);
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(255,248,225,0.12)'); vg.addColorStop(1, 'rgba(120,75,30,0.24)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    const cg = g.createRadialGradient(w * 0.2, h * 0.12, 0, w * 0.2, h * 0.12, Math.max(w, h) * 1.05);
    cg.addColorStop(0, 'rgba(255,214,140,0.16)'); cg.addColorStop(0.55, 'rgba(255,190,110,0.04)'); cg.addColorStop(1, 'rgba(70,35,10,0.14)');
    g.fillStyle = cg; g.fillRect(0, 0, w, h);
    const keep = this.dpr; this.dpr = dpr; this.pageBorderArt(fr.getContext('2d'), P); this.dpr = keep;
    // how far in the corner bosses reach (the writing scrolls clear of them, not in under their open knotwork)
    const { m, vh, bs } = this.borderSize(P); this.notesBoss = GART.boss ? m + bs * 0.9 + 2 : 0; return m + vh;
  },
  pageBorderArt(g, P) {
    const ink = '#4a2e1a', dpr = this.dpr, { m, vh, bs } = this.borderSize(P);
    const x0 = P.x + m, y0 = P.y + m, x1 = P.x + P.w - m, y1 = P.y + P.h - m, c = vh / 2;
    g.save();
    if (GART.knot) {
      vineRun(g, x0 + bs * 0.7, y0 + c, x1 - bs * 0.7, y0 + c, vh, dpr); vineRun(g, x1 - bs * 0.7, y1 - c, x0 + bs * 0.7, y1 - c, vh, dpr);
      vineRun(g, x0 + c, y1 - bs * 0.7, x0 + c, y0 + bs * 0.7, vh, dpr); vineRun(g, x1 - c, y0 + bs * 0.7, x1 - c, y1 - bs * 0.7, vh, dpr);
    }
    g.strokeStyle = hexA(ink, 0.65); g.lineWidth = 1; g.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
    g.strokeStyle = hexA(ink, 0.45); g.strokeRect(x0 + vh + 1.5, y0 + vh + 1.5, x1 - x0 - vh * 2 - 3, y1 - y0 - vh * 2 - 3);
    const B = GART.boss;
    if (B) {
      const o = bs * 0.1; // the boss stands a little out over the corner of the rules
      drawFlip(g, B, x0 - o, y0 - o, bs, bs, 1, 1); drawFlip(g, B, x1 + o, y0 - o, bs, bs, -1, 1);
      drawFlip(g, B, x0 - o, y1 + o, bs, bs, 1, -1); drawFlip(g, B, x1 + o, y1 + o, bs, bs, -1, -1);
    }
    g.restore();
  },
  pageBorder(g, P) {
    const ink = '#4a2e1a', gold = '#b8893e', red = '#8e2f22';
    const m = Math.min(P.w, P.h) * 0.035;
    g.strokeStyle = ink; g.lineWidth = 1.6; g.strokeRect(P.x + m, P.y + m, P.w - m * 2, P.h - m * 2);
    g.strokeStyle = red; g.lineWidth = 0.8; g.strokeRect(P.x + m + 5, P.y + m + 5, P.w - m * 2 - 10, P.h - m * 2 - 10);
    g.strokeStyle = gold; g.lineWidth = 0.8; g.strokeRect(P.x + m - 3, P.y + m - 3, P.w - m * 2 + 6, P.h - m * 2 + 6);
    const s = Math.min(P.w, P.h) / 520;
    cornerFlourish(g, P.x + m - 2, P.y + m - 2, s, 1, 1, ink, gold);
    cornerFlourish(g, P.x + P.w - m + 2, P.y + m - 2, s, -1, 1, ink, gold);
    cornerFlourish(g, P.x + m - 2, P.y + P.h - m + 2, s, 1, -1, ink, gold);
    cornerFlourish(g, P.x + P.w - m + 2, P.y + P.h - m + 2, s, -1, -1, ink, gold);
    const inset = 160 * s;
    edgeVine(g, P.x + m + inset, P.y + m, P.x + P.w - m - inset, P.y + m, ink, gold, 1);
    edgeVine(g, P.x + P.w - m - inset, P.y + P.h - m, P.x + m + inset, P.y + P.h - m, ink, gold, 2);
    edgeVine(g, P.x + m, P.y + P.h - m - inset, P.x + m, P.y + m + inset, ink, gold, 3);
    edgeVine(g, P.x + P.w - m, P.y + m + inset, P.x + P.w - m, P.y + P.h - m - inset, ink, gold, 4);
    fleuron(g, P.x + P.w / 2, P.y + m, s * 1.2, ink, gold);
    fleuron(g, P.x + P.w / 2, P.y + P.h - m, s * 1.2, ink, gold);
  },
  codex(g, P) {
    const lv = Game.level; if (!lv) return;
    const ink = '#3a2414', gold = '#b8893e', red = '#8e2f22';
    const s = Math.min(P.w, P.h) / 520;
    const x0 = P.x + P.w * 0.12, w = P.w * 0.76;
    let y = P.y + P.h * 0.1;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = red; g.font = `${Math.round(13 * s)}px Cinzel, serif`;
    g.fillText(`LESSON ${lv.roman}`, P.x + P.w / 2, y);
    const BAND = gart('title'), IN = gart('capframe'), MD = gart('roundel'), TRI = gart('triskele');
    if (BAND) {
      // the lesson's name on the cream panel of the title box, ivy and beasts in the knotwork round it (v157; smaller type for a long name)
      const bw = w * 0.84, bh = bw * BAND.naturalHeight / BAND.naturalWidth, by = y + 8 * s;
      g.drawImage(BAND, P.x + (P.w - bw) / 2, by, bw, bh);
      let fs = Math.min(22 * s, bh * 0.3);
      g.font = `700 ${Math.round(fs)}px "Cinzel Decorative", serif`;
      const tw = decoWidth(g, lv.name); if (tw > bw * 0.5) { fs *= bw * 0.5 / tw; g.font = `700 ${Math.round(fs)}px "Cinzel Decorative", serif`; }
      // centred on the letters' own ink, not the font's em box (Cinzel's 'middle' sits the capitals high on the panel)
      g.fillStyle = '#7a1c12'; g.textBaseline = 'middle'; // (the folio headings' rubric ink)
      const nm = g.measureText(lv.name), lift = (nm.actualBoundingBoxAscent - nm.actualBoundingBoxDescent) / 2 || 0;
      decoText(g, lv.name, P.x + P.w / 2, by + bh * 0.5 + lift, (t, x, y) => g.fillText(t, x, y)); g.textBaseline = 'alphabetic';
      y = by + bh + 16 * s;
    } else {
      y += 34 * s;
      g.font = `700 ${Math.round(26 * s)}px "Cinzel Decorative", serif`;
      g.fillStyle = ink; decoText(g, lv.name, P.x + P.w / 2, y, (t, x, y) => g.fillText(t, x, y));
      y += 14 * s; fleuron(g, P.x + P.w / 2, y + 6 * s, s * 0.8, ink, gold); y += 30 * s;
    }
    // master's note with illuminated initial
    g.textAlign = 'left';
    const capS = (IN ? 58 : 46) * s, capGap = IN ? capS * 0.19 + 9 * s : 8 * s; // (the painted frame stands out 19% past the blue)
    const first = lv.lesson[0], rest = lv.lesson.slice(1);
    g.save();
    if (IN) {
      // the lapis field in its knotwork frame (the blue is the middle 72.5% of the painting), a gilded capital on it
      const D = capS / 0.725;
      g.drawImage(IN, x0 - D * 0.14, y - D * 0.14, D, D);
      goldCap(g, first, x0 - D * 0.14 + D / 2, y - D * 0.14 + D / 2, capS);
    } else {
      g.fillStyle = '#f3dfa8'; g.strokeStyle = gold; g.lineWidth = 1.5;
      g.fillRect(x0, y, capS, capS); g.strokeRect(x0, y, capS, capS);
      g.strokeStyle = red; g.lineWidth = 0.8; g.strokeRect(x0 + 3, y + 3, capS - 6, capS - 6);
      g.strokeStyle = 'rgba(46,107,62,0.8)'; g.lineWidth = 1;
      g.beginPath(); curl(g, x0 + capS * 0.22, y + capS * 0.78, capS * 0.14, 1.2, 0, 1); g.stroke();
      g.beginPath(); curl(g, x0 + capS * 0.8, y + capS * 0.22, capS * 0.12, 1.2, Math.PI, 1); g.stroke();
      g.fillStyle = red; g.font = `700 ${Math.round(capS * 0.78)}px "Cinzel Decorative", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(first, x0 + capS / 2, y + capS * 0.54);
    }
    g.restore();
    g.fillStyle = ink; g.font = `italic ${Math.round(14.5 * s)}px "IM Fell English", Georgia, serif`; g.textBaseline = 'alphabetic';
    const lh = 19 * s;
    // first lines flow beside the initial
    // the painted panel hangs a little lower than the drawn one, so three lines sit beside it
    const nIn = IN ? 4 : 2, capBot = IN ? capS / 0.725 * 0.86 - 4 * s : capS;
    const words = rest.split(' '); let line = '', ly = y + lh * 0.95, lx = x0 + capS + capGap, lw = w - capS - capGap, lines = 0;
    let i = 0;
    for (; i < words.length; i++) {
      const t = line ? line + ' ' + words[i] : words[i];
      const maxW = lines < nIn ? lw : w;
      if (g.measureText(t).width > maxW && line) {
        g.fillText(line, lines < nIn ? lx : x0, ly); ly += lh; lines++; line = words[i];
      } else line = t;
    }
    if (line) { g.fillText(line, lines < nIn ? lx : x0, ly); ly += lh; }
    y = Math.max(ly, y + capBot + lh) + 10 * s;
    // sigil codex
    g.fillStyle = red; g.font = `${Math.round(11.5 * s)}px Cinzel, serif`; g.textAlign = 'center';
    const head = 'SIGILS OF THIS FOLIO  ·  tap one to trace it';
    if (gart('knot')) {
      // its heading between two short bands of knotwork
      const hy = y + 8 * s, tw = g.measureText(head).width, kh = 10 * s, gap = 10 * s;
      vineRun(g, x0, hy, P.x + P.w / 2 - tw / 2 - gap, hy, kh, this.dpr); vineRun(g, x0 + w, hy, P.x + P.w / 2 + tw / 2 + gap, hy, kh, this.dpr);
      g.textBaseline = 'middle'; g.fillText(head, P.x + P.w / 2, hy + 1); g.textBaseline = 'alphabetic';
      y = hy + 14 * s;
    } else {
      g.strokeStyle = 'rgba(74,46,26,0.5)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
      y += 18 * s;
      g.fillText(head, P.x + P.w / 2, y); y += 12 * s;
    }
    this.codexRects = [];
    // the room left above the signs note at the foot of the page (measured, not guessed)
    const notesText = signNotes(lv), dr0 = 14 * s;
    g.font = `italic ${Math.round(12.2 * s)}px "IM Fell English", serif`;
    const notesW = w - dr0 * 2.6 - 12 * s;
    let nl = 1, ln = '';
    for (const wd of notesText.split(' ')) { const t = ln ? ln + ' ' + wd : wd; if (g.measureText(t).width > notesW && ln) { nl++; ln = wd; } else ln = t; }
    const notesH = Math.max(nl * 15 * s + 10 * s, 50 * s);
    const avail = P.y + P.h * 0.93 - notesH - 8 * s - y;
    // learned sigils get a full row each (name, then its line beneath); unlearned ones wait faded in one short row
    const known = SIGIL_ORDER.filter(id => lv.sigils.includes(id)), unknown = SIGIL_ORDER.filter(id => !lv.sigils.includes(id));
    const R = ringRules(lv);
    const FR = 44 * s, US = unknown.length ? 30 * s : 0;
    const twoCol = known.length * FR + US > avail; // a crowded page: two columns, names only
    // (a gold medallion needs a taller row than a drawn ring, or the medallions stack into one another)
    const rows = twoCol ? Math.ceil(known.length / 2) : known.length, rowH0 = twoCol ? (MD ? 40 : 32) * s : FR;
    const k = clamp(avail / (rows * rowH0 + US), 0.72, 1); // and smaller still if even that will not fit
    const rowH = rowH0 * k, colW = twoCol ? w / 2 : w, rowsTop = y;
    let textR = x0; // (how far the codex's writing reaches: the room beside it may take the map)
    known.forEach((id, n) => {
      const S = SIGILS[id], col = twoCol ? n % 2 : 0, row = twoCol ? Math.floor(n / 2) : n;
      g.globalAlpha = this.ringRefuses(id) ? 0.3 : 1; // (v177) not on the drawn centre's ring
      // (in its medallion the sigil is drawn smaller, so the gold rim fits the row)
      // (a roundel's outer edge is (r + 3) / 0.6: kept to 84% of the row, so neighbours never touch)
      const r = MD ? Math.min(12.5 * s * k, rowH * 0.42 * 0.6 - 3) : 15 * s * k;
      const rx = x0 + col * colW, ry = y + row * rowH, cx = rx + (MD ? (r + 3) / 0.6 + 2 : r + 4), cy = ry + rowH / 2;
      if (MD) medalGlyph(g, id, cx, cy, r, 1.6, true); // in the sigil's colour, as on the phone's notes leaf
      else {
        g.strokeStyle = ink; g.lineWidth = 1.1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        g.strokeStyle = gold; g.lineWidth = 0.6; g.beginPath(); g.arc(cx, cy, r + 3, 0, TAU); g.stroke();
        drawGlyph(g, id, cx, cy, r * 0.82, '#2a1830', 1.6);
      }
      const tx = cx + (MD ? (r + 3) / 0.6 + 8 * s : r + 12 * s);
      g.textAlign = 'left'; g.fillStyle = '#2a1830'; g.font = `${Math.round(22 * s * k)}px "Pinyon Script", cursive`;
      const nameY = twoCol ? cy + 6 * s * k : ry + 19 * s * k;
      g.fillText(S.name, tx, nameY);
      const nw = g.measureText(S.name).width;
      g.fillStyle = red; g.font = `${Math.round(10 * s * k)}px Cinzel, serif`;
      const ex = tx + Math.max(nw + 10 * s, twoCol ? 0 : 96 * s * k);
      // (v177) a lesson with ring rules writes beside each name what its ring takes; on a crowded page the rules take
      // the place of the English name
      const tagW = 110 * s, tagX = twoCol && R ? tx + nw + 8 * s : ex + g.measureText(S.en.toUpperCase()).width + 12 * s;
      if (!(twoCol && R)) { g.fillText(S.en.toUpperCase(), ex, nameY - 2 * s); textR = Math.max(textR, ex + g.measureText(S.en.toUpperCase()).width); }
      if (R) textR = Math.max(textR, tagX + ringTag(g, R.ringOnly.includes(id) ? 'only' : R.takes(id), tagX, nameY - 6 * s * k, Math.min(tagW, rx + colW - tagX - 4), 13 * s * k, true));
      if (!twoCol) {
        g.fillStyle = ink; g.font = `italic ${Math.round(12 * s * k)}px "IM Fell English", serif`;
        const ringOnly = !R && lv.centers && !lv.centers.includes(id), d = (ringOnly ? 'Ring only, this lesson. ' : '') + S.desc;
        g.fillText(d, tx, ry + 36 * s * k);
        textR = Math.max(textR, tx + g.measureText(d).width);
      }
      g.globalAlpha = 1;
      this.codexRects.push({ id, x: rx, y: ry, w: colW, h: rowH });
    });
    y += rows * rowH;
    if (unknown.length) {
      g.globalAlpha = 0.32;
      const r = 10 * s * k, cy = y + US * k / 2;
      // a sigil some earlier lesson taught is only unused here, not unlearned (the user: "not yet learned" was wrong for those)
      const at = typeof LEVELS === 'undefined' ? -1 : LEVELS.indexOf(lv);
      // (v178) one the player has not met yet is an empty circle: its shape and name wait for its lesson
      const taught = id => at > 0 && sigilKnown(id, lv);
      const groups = [[unknown.filter(taught), 'unused this lesson'], [unknown.filter(id => !taught(id)), 'not yet learned']].filter(q => q[0].length);
      g.fillStyle = ink; g.font = `italic ${Math.round(12 * s * k)}px "IM Fell English", serif`; g.textAlign = 'left';
      let gx = x0;
      for (const [ids, label] of groups) {
        ids.forEach((id, n) => {
          const cx = gx + r + 4 + n * (r * 2 + 10 * s);
          g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
          if (taught(id)) drawGlyph(g, id, cx, cy, r * 0.8, ink, 1.2);
        });
        const lx = gx + ids.length * (r * 2 + 10 * s) + 10 * s;
        g.fillText(label, lx, cy + 4 * s);
        gx = lx + g.measureText(label).width + 22 * s;
        textR = Math.max(textR, gx - 22 * s);
      }
      g.globalAlpha = 1;
      y += US * k;
    }
    const B = this.borderSize(P), rowsEnd = y;
    // signs explanation with tiny diagram
    y += 8 * s;
    const dx = x0 + 22 * s, dy = y + 22 * s, dr = 14 * s;
    g.strokeStyle = ink; g.lineWidth = 1.2;
    g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.stroke();
    drawGlyph(g, 'gale', dx, dy, dr * 0.75, ink, 1);
    g.beginPath(); g.moveTo(dx + dr * 0.75, dy + dr * 0.75); g.lineTo(dx + dr * 1.6, dy + dr * 1.6); g.stroke();
    g.beginPath(); g.moveTo(dx + dr * 1.6, dy + dr * 1.6); g.lineTo(dx + dr * 1.2, dy + dr * 1.55); g.moveTo(dx + dr * 1.6, dy + dr * 1.6); g.lineTo(dx + dr * 1.55, dy + dr * 1.2); g.stroke();
    g.beginPath(); g.moveTo(dx + dr * 0.95, dy + dr * 1.35); g.lineTo(dx + dr * 1.35, dy + dr * 0.95); g.stroke(); // a barb
    if (ringTaught(lv)) { g.setLineDash([2, 3]); g.beginPath(); g.arc(dx, dy, dr * 1.35, 0, TAU); g.stroke(); g.setLineDash([]); } // the outer ring, once it is taught
    g.fillStyle = ink; g.font = `italic ${Math.round(12.2 * s)}px "IM Fell English", serif`; g.textAlign = 'left';
    if (lv.combos) {
      // a small ring-sigil in a slot beside the diagram
      g.setLineDash([2, 3]); g.beginPath(); g.arc(dx - dr * 1.0, dy - dr * 1.0, dr * 0.42, 0, TAU); g.stroke(); g.setLineDash([]);
      drawGlyph(g, 'flame', dx - dr * 1.0, dy - dr * 1.0, dr * 0.32, ink, 1);
    }
    const nx = dx + dr * 2.4, ny = y + 10 * s, foot = P.y + P.h - B.m - B.vh - 10 * s, fullW = w - dr * 2.6 - 12 * s;
    // the notes laid out in lines: full width, or, beside a map in the corner, narrower once they reach its top
    const layNotes = (sc, M) => {
      const lh = 15 * s * sc, out = []; let yy = ny, ln = '';
      g.font = `italic ${Math.round(12.2 * s * sc)}px "IM Fell English", serif`;
      const wAt = yy => M && yy + 4 * s > M.y - 4 * s ? M.x - 10 * s - nx : fullW;
      for (const wd of notesText.split(' ')) {
        const t = ln ? ln + ' ' + wd : wd;
        if (g.measureText(t).width > wAt(yy) && ln) { out.push([ln, yy]); yy += lh; ln = wd; } else ln = t;
      }
      if (ln) { out.push([ln, yy]); yy += lh; }
      return { lines: out, end: yy, sc };
    };
    let N = layNotes(1, null);
    // on the spread the map of the land lies on this page (the drawing page kept free): centred at the foot of the
    // page, or beside the sigils when the writing leaves no room at the foot, or, on a page crowded with both, in the
    // corner at the foot with the notes running round it, a little smaller if they must (the late lessons had lost
    // their map altogether)
    this.mapAt = null;
    if (!this.L.single && World.W) {
      const right = Math.min(x0 + w + P.w * 0.05, P.x + P.w - B.m - B.vh - 10 * s);
      const beside = twoCol ? null : { x0: textR + 14 * s, x1: right, y0: rowsTop - 4 * s, y1: rowsEnd + 2 * s };
      const atFoot = { x0: x0, x1: x0 + w, y0: N.end + 4 * s, y1: foot };
      this.mapAt = this.mapFit(atFoot, true, s) || (beside && this.mapFit(beside, false, s));
      corner: for (const sc of [1, 0.95, 0.9, 0.85]) for (const f of [0.5, 0.44, 0.38, 0.32, 0.27]) {
        if (this.mapAt) break corner;
        const R = { x0: right - w * f, x1: right, y0: rowsEnd + 6 * s, y1: foot }, C = this.mapFit(R, true, s);
        if (!C || C.x - 10 * s - nx < w * 0.3) continue;
        C.x = R.x1 - C.w; C.y = R.y1 - C.h; // tucked into the corner
        const T = layNotes(sc, C);
        if (T.end - 15 * s * sc + 4 * s <= foot) { this.mapAt = C; N = T; }
      }
    }
    g.font = `italic ${Math.round(12.2 * s * N.sc)}px "IM Fell English", serif`;
    for (const [t, yy] of N.lines) g.fillText(t, nx, yy);
    const end = N.end;
    this.codexInfo = { k, twoCol, rowH, notesEnd: end, notesScale: N.sc, rowsEnd, foot, pageEnd: P.y + P.h - Math.min(P.w, P.h) * 0.035 }; // for checking the layout
    const free = foot - end - 6 * s;
    if (TRI && !(this.mapAt && this.mapAt.foot)) {
      // a spiral tailpiece in the room left at the foot of the page, if there is room for one
      if (free > 70 * s) {
        const ts = Math.min(free * 0.8, w * 0.36), th = ts * TRI.naturalHeight / TRI.naturalWidth;
        g.drawImage(TRI, P.x + (P.w - ts) / 2, end + 6 * s + (free - th) / 2, ts, th);
      }
    }
  },
  codexStrip(g, P) {
    const lv = Game.level; if (!lv) return;
    const s = Math.min(1, P.w / 520), ink = '#3a2414', red = '#8e2f22';
    // upright, the name sits below the page's top vine and its centre ornament
    const side = !!this.L.side, top = side ? P.y + 32 : P.y + 54;
    const MD = gart('roundel');
    // the name in flat rubric ink, as the folio's own headings are set (.bk-head: Cinzel Decorative 700, #7a1c12); v167's
    // chiselled gold here looked chunky and busy on the parchment (gold stays for the drop cap on its lapis ground)
    g.textAlign = 'center'; g.fillStyle = MD ? '#7a1c12' : ink;
    g.font = `700 ${Math.round(20 * s + 4)}px "Cinzel Decorative", serif`;
    decoText(g, lv.name, P.x + P.w / 2, top, (t, x, y) => g.fillText(t, x, y));
    this.codexRects = [];
    // the row keeps inside the knotwork border (its first and last names were clipped by it)
    const B = this.borderSize(P), inner = MD ? P.w - 2 * (B.m + B.vh) - 14 : P.w - 20;
    const ids = lv.sigils, cw = Math.min(70, inner / ids.length);
    const x0 = P.x + P.w / 2 - cw * ids.length / 2;
    // (v177) the lesson's ring rules under each name: what that centre takes on its ring, or "ring only"; once a
    // centre is drawn, the sigils its ring will not take are greyed
    const R = ringRules(lv);
    ids.forEach((id, k) => {
      const cx = x0 + cw * (k + 0.5), cy = top + (side ? 30 : 36), r = MD ? Math.min(11, cw * 0.27 - 3) : Math.min(16, cw * 0.36);
      g.globalAlpha = this.ringRefuses(id) ? 0.3 : 1;
      if (MD) medalGlyph(g, id, cx, cy, r, 1.4, true); // in the sigil's colour, as in the wide codex
      else { g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); drawGlyph(g, id, cx, cy, r * 0.8, '#2a1830', 1.4); }
      const ny = cy + (MD ? (r + 3) / 0.6 + 9 : r + 12);
      g.fillStyle = red; g.font = `${cw < 54 ? 8 : 10}px Cinzel, serif`; g.fillText(SIGILS[id].name.toUpperCase(), cx, ny); // clear of the roundel's knotwork
      if (R) ringTag(g, R.ringOnly.includes(id) ? 'only' : R.takes(id), cx, ny + 11, cw - 6, 12);
      g.globalAlpha = 1;
      this.codexRects.push({ id, x: cx - cw / 2, y: cy - r, w: cw, h: r * 2 + 16 + (R ? 14 : 0) });
    });
  },
  drawingFrame(g) {
    const A = this.L.area, ink = '#4a2e1a';
    // on one-page layouts the circle is drawn snug so it fits within the page border
    const fr = this.L.fr;
    g.save();
    g.fillStyle = 'rgba(255,250,232,0.18)';
    g.beginPath(); g.arc(A.cx, A.cy, A.half * fr, 0, TAU); g.fill();
    if (gart('knot')) {
      // ruled like the page: an inked hairline, a gold band, a red hairline
      const R = A.half * fr;
      g.strokeStyle = 'rgba(74,46,26,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(A.cx, A.cy, R - 3.5, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(184,137,62,0.75)'; g.lineWidth = 2.5; g.beginPath(); g.arc(A.cx, A.cy, R, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(142,47,34,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.arc(A.cx, A.cy, R + 3.5, 0, TAU); g.stroke();
    } else {
    g.strokeStyle = 'rgba(74,46,26,0.18)'; g.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      g.beginPath(); g.moveTo(A.cx + Math.cos(a) * A.half * (fr - 0.06), A.cy + Math.sin(a) * A.half * (fr - 0.06));
      g.lineTo(A.cx + Math.cos(a) * A.half * (fr + 0.01), A.cy + Math.sin(a) * A.half * (fr + 0.01)); g.stroke();
    }
    g.setLineDash([3, 6]); g.beginPath(); g.arc(A.cx, A.cy, A.half * fr, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    g.restore();
    // (no heading on the drawing page: it is all the circle's — user's call, v154)
  },
  renderInk() {
    const g = this.inkLayer.getContext('2d'), dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const A = this.draft.a;
    this.draft.strokes.forEach((st, i) => this.strokeInk(g, st.pts, A.roles[i] === 'stray' ? 'rgba(70,50,60,0.28)' : '#20142e'));
    this.inkDirty = false; this.glowDirty = true; this.inkVer = (this.inkVer || 0) + 1;
  },
  // a full-page layer drawn over just the drawing area (with a margin), where the ink can be
  blitArea(g, src) {
    const A = this.L.area, m = A.size * 0.12, x0 = Math.max(0, A.x - m), y0 = Math.max(0, A.y - m);
    const x1 = Math.min(innerWidth, A.x + A.size + m), y1 = Math.min(innerHeight, A.y + A.size + m);
    if (x1 <= x0 || y1 <= y0) return;
    const kx = src.width / innerWidth, ky = src.height / innerHeight;
    g.drawImage(src, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0);
  },
  renderGlow(col) {
    // blurred at a third of the page's resolution (the glow is soft anyway, and a full-size blur stalls phones)
    const src = this.inkLayer, L = this.glowLayer || (this.glowLayer = document.createElement('canvas')), q = 3;
    const w = Math.max(1, Math.round(src.width / q)), h = Math.max(1, Math.round(src.height / q));
    if (L.width !== w || L.height !== h) { L.width = w; L.height = h; }
    const g = L.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.shadowColor = col; g.shadowBlur = 13 * this.dpr / q;
    g.drawImage(src, 0, 0, w, h);
    g.shadowBlur = 0;
    this.glowCol = col; this.glowDirty = false;
  },
  strokeInk(g, pts, col) {
    const A = this.L.area, sc = A.half;
    const X = p => A.cx + p.x * sc, Y = p => A.cy + p.y * sc;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // soft bleed
    g.strokeStyle = col.startsWith('#') ? hexA(col, 0.12) : col;
    for (let i = 1; i < pts.length; i++) {
      g.lineWidth = (pts[i].w + pts[i - 1].w) * sc * 1.35;
      g.beginPath(); g.moveTo(X(pts[i - 1]), Y(pts[i - 1])); g.lineTo(X(pts[i]), Y(pts[i])); g.stroke();
    }
    g.strokeStyle = col;
    for (let i = 1; i < pts.length; i++) {
      g.lineWidth = (pts[i].w + pts[i - 1].w) * 0.5 * sc;
      g.beginPath(); g.moveTo(X(pts[i - 1]), Y(pts[i - 1])); g.lineTo(X(pts[i]), Y(pts[i])); g.stroke();
    }
    if (pts.length) { g.fillStyle = col; g.beginPath(); g.arc(X(pts[0]), Y(pts[0]), pts[0].w * sc * 0.9, 0, TAU); g.fill(); }
  },
  frame(dt, t) {
    if (!this.open && !this.closing) return;
    this.anim = clamp(this.anim + (this.open ? dt : -dt) / 0.32, 0, 1);
    if (!this.open && this.anim <= 0) {
      this.closing = false; this.cv.style.display = 'none';
      return;
    }
    if (typeof CLASSIC !== 'undefined' && CLASSIC.on !== this._classic) this.bookDirty = true; // the look was switched (◐)
    // (v177) the codex greys what the drawn centre's ring will not take, and a lesson with ring rules gives the upright
    // page's header a line more for them
    if (this.L && this.L.legend !== !!ringRules()) { this.layout(); this.bookDirty = true; this.inkDirty = true; }
    const rk = String(this.ringTakes());
    if (rk !== this._ringKey) { this._ringKey = rk; this.bookDirty = true; }
    if (this.bookDirty) this.renderBook();
    if (this.inkDirty) this.renderInk();
    const g = this.g, dpr = this.dpr, e = ease(this.anim), A = this.L.area;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.fillStyle = `rgba(8,5,18,${0.62 * e})`; g.fillRect(0, 0, innerWidth, innerHeight);
    this.shake = Math.max(0, this.shake - dt);
    const sx = Math.sin(t * 70) * this.shake * 14;
    g.save();
    g.globalAlpha = e;
    g.translate(sx, (1 - e) * 80);
    g.drawImage(this.book, 0, 0, innerWidth, innerHeight);
    if (this.open && this.anim < 1) this.pageTurn(g, e);
    this.drawMiniMap(g, t);
    // sideways, everything of the circle's (a large seal's rune ring and places, the ink) stays inside the right
    // page's knotwork border
    const clip = this.L.side && this.L.right;
    if (clip) { const Q = this.L.right, b = this.borderSize(Q), k = b.m + b.vh; g.save(); g.beginPath(); g.rect(Q.x + k, Q.y + k, Q.w - k * 2, Q.h - k * 2); g.clip(); }
    const D = this.draft.a;
    // guide circle
    if (!D.seal) {
      g.save(); g.strokeStyle = 'rgba(140,100,60,0.28)'; g.lineWidth = 1.5; g.setLineDash([2, 9]);
      g.lineDashOffset = -t * 12;
      g.beginPath(); g.arc(A.cx, A.cy, A.half * GUIDE_R, 0, TAU); g.stroke();
      // the eight places around the seal, waiting for signs (and, later, ring-sigils)
      g.setLineDash([3, 4]); g.lineDashOffset = 0; g.strokeStyle = 'rgba(201,150,62,0.5)'; g.lineWidth = 1.4;
      const r = A.half * GUIDE_R;
      // plain dashed rings: the drawing circle is kept free of ornament (user's call, v153)
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8, px = A.cx + Math.cos(a) * r * SLOT_R, py = A.cy + Math.sin(a) * r * SLOT_R;
        g.beginPath(); g.arc(px, py, r * SLOT_SIZE, 0, TAU); g.stroke();
      }
      g.restore();
    }
    // ghost trace
    if (this.ghost) {
      const cx = D.seal ? A.cx + D.seal.cx * A.half : A.cx, cy = D.seal ? A.cy + D.seal.cy * A.half : A.cy;
      const r = D.seal ? D.seal.r * A.half * 0.6 : A.half * 0.36;
      g.save(); g.setLineDash([4, 6]); g.lineDashOffset = -t * 20;
      drawGlyph(g, this.ghost, cx, cy, r, 'rgba(140,90,40,0.45)', 2.5); g.restore();
    }
    // gilded beautification
    // (read afresh only when the ink changes, not every frame)
    if (this._spInk !== this.inkVer || this._spSeal !== D.seal) { this._sp = D.seal ? buildSpell(this.draft, lessonRules()) : null; this._spInk = this.inkVer; this._spSeal = D.seal; }
    const sp = this._sp;
    if (D.seal) this.gild(g, D, sp, t);
    // ink
    const valid = sp && !sp.err;
    if (valid) {
      // the glow is blurred once into its own layer and only faded here — a full-page blur every frame is ruinous on large screens
      if (this.glowDirty || this.glowCol !== sp.color) this.renderGlow(sp.color);
      const ga = g.globalAlpha;
      g.globalAlpha = ga * clamp(0.72 + Math.sin(t * 4) * 0.22 + this.flash, 0, 1);
      this.blitArea(g, this.glowLayer);
      g.globalAlpha = ga;
    }
    this.blitArea(g, this.inkLayer);
    if (this.live) this.strokeInk(g, this.live.pts, '#20142e');
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.2);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = this.flash * 0.8;
      g.drawImage(this.inkLayer, 0, 0, innerWidth, innerHeight); g.restore();
    }
    // sparks
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i]; p.t += dt;
      if (p.t > p.life) { this.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      g.fillStyle = hexA(p.col || '#ffd27a', a * 0.9);
      g.beginPath(); g.arc(A.cx + p.x * A.half, A.cy + p.y * A.half, 1.2 + a * 1.8, 0, TAU); g.fill();
    }
    g.restore();
    if (clip) g.restore();
    // status
    const { SD, P, s, sy } = this.statusAt();
    g.textAlign = 'center'; g.fillStyle = this.statusCol;
    if (valid) {
      const S = SIGILS[sp.sigil];
      g.font = `${Math.round(30 * s + 4)}px "Pinyon Script", cursive`;
      g.fillText(S.name, P.x + P.w / 2, sy + 2);
      // kept inside the page's border, and to two lines (smaller type for a long spell) so it never meets the buttons
      const fs = Math.round(13 * s + 2);
      fitWrap(g, this.status.replace(S.name + ' — ', ''), P.x + P.w / 2, sy + 22 * s + 4, P.w * (SD ? 0.94 : 0.8), fs,
        z => `italic ${z}px "IM Fell English", serif`, (15 * s + 3) / fs, SD ? 4 : 2);
    } else {
      const fs = Math.round(14 * s + 2);
      fitWrap(g, this.status, P.x + P.w / 2, sy + 4, P.w * (SD ? 0.94 : 0.8), fs, z => `italic ${z}px "IM Fell English", serif`, (18 * s + 2) / fs, SD ? 4 : 2);
    }
    g.restore();
  },
  gildRing(words, r) {
    const dpr = this.dpr || 1, key = words + '|' + Math.round(r) + '|' + dpr;
    if (this._ring && this._ring.key === key) return this._ring;
    if (document.fonts && !document.fonts.check('600 9px Cinzel')) return null;
    const R = r * 1.25, c = document.createElement('canvas'); c.width = c.height = Math.ceil(R * 2 * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = hexA('#8a5a20', 0.55);
    textOnCircle(g, words, R, R, r * 1.08, 0, Math.max(7, r * 0.075));
    return (this._ring = { key, c, R });
  },
  gild(g, D, sp, t) {
    const A = this.L.area, S = D.seal;
    const cx = A.cx + S.cx * A.half, cy = A.cy + S.cy * A.half, r = S.r * A.half;
    const col = sp && !sp.err ? sp.color : '#c9963e';
    const gold = '#c9963e';
    g.save();
    g.strokeStyle = hexA(gold, 0.55); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r * 1.0, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 1.16, 0, TAU); g.stroke();
    g.strokeStyle = hexA(gold, 0.35);
    for (let k = 0; k < 36; k++) {
      const a = k * TAU / 36 + t * 0.05;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.16);
      g.lineTo(cx + Math.cos(a) * r * (k % 3 ? 1.2 : 1.25), cy + Math.sin(a) * r * (k % 3 ? 1.2 : 1.25)); g.stroke();
    }
    g.fillStyle = hexA('#8a5a20', 0.55);
    const met = D.sigil && D.sigil.ok && sigilKnown(D.sigil.id); // (v178: a sigil not yet learned gets no name or gilding)
    const words = met ? SIGILS[D.sigil.id].words : 'SIGILLVM · SIGNVM · ';
    const ring = this.gildRing(words, r);
    if (ring) { g.save(); g.translate(cx, cy); g.rotate(t * 0.08); g.drawImage(ring.c, -ring.R, -ring.R, ring.R * 2, ring.R * 2); g.restore(); }
    else textOnCircle(g, words, cx, cy, r * 1.08, t * 0.08, Math.max(7, r * 0.075));
    if (met) {
      g.globalAlpha = 0.5;
      drawGlyph(g, D.sigil.id, cx, cy, r * 0.62, hexA(col, 0.9), 6);
      drawGlyph(g, D.sigil.id, cx, cy, r * 0.62, hexA(gold, 0.8), 1.2);
      g.globalAlpha = 1;
    }
    for (const sg of D.signs) {
      // one gilded chevron per measure of strength
      const a = sg.pos * TAU / 8, R1 = r * 1.3; // on the circle the sign was read as
      g.save(); g.translate(cx + Math.cos(a) * R1, cy + Math.sin(a) * R1); g.rotate(a);
      g.strokeStyle = hexA(gold, 0.8); g.lineWidth = 2;
      for (let k = 0; k <= Math.min(2, sg.barbs || 0); k++) { g.beginPath(); g.moveTo(-7 + k * 6, -7); g.lineTo(2 + k * 6, 0); g.lineTo(-7 + k * 6, 7); g.stroke(); }
      g.restore();
    }
    if (D.amp) {
      g.fillStyle = hexA(gold, 0.7);
      for (let k = 0; k < 24; k++) { const a = k * TAU / 24 - t * 0.1; g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.85, cy + Math.sin(a) * r * 1.85, 2, 0, TAU); g.fill(); }
    }
    // the eight ring-sigil slots
    // always drawn: in the first two folios they are plain gold marks for the eight places a sign may go;
    // from the third folio (ring-sigils), once a sign gives the spell a way, each takes the colour of when a sigil there would act
    {
      const ringSigils = !!(Game.level && Game.level.combos), extra = ringExtras(D), takes = ringSigils ? this.ringTakes() : null;
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8, px = cx + Math.cos(a) * r * SLOT_R, py = cy + Math.sin(a) * r * SLOT_R, sr = r * SLOT_SIZE;
        const sat = D.sats.find(s => s.slot === k), signHere = D.signs.some(s => s.pos === k);
        const rel = this.slotRel(k), coloured = ringSigils && rel && D.sigil && D.sigil.ok && timedCentre(D.sigil.id); // v177: only a centre that keeps time
        const col = coloured ? REL_COL[rel] : gold;
        if (coloured && !signHere) { g.fillStyle = hexA(col, sat ? 0.05 : 0.08); g.beginPath(); g.arc(px, py, sr, 0, TAU); g.fill(); }
        g.setLineDash(coloured ? [] : [3, 4]);
        g.strokeStyle = hexA(sat && !sat.ok ? '#a02a1a' : col, coloured ? (signHere ? 0.25 : 0.6) : (sat ? 0.75 : 0.55));
        g.lineWidth = 1.4;
        g.beginPath(); g.arc(px, py, sr, 0, TAU); g.stroke(); g.setLineDash([]);
        // (a ring-sigil past the third of its kind is ignored: no glow, and the circle says so)
        const ignored = extra.has(k);
        if (sat && sat.ok && !ignored && sigilKnown(sat.id)) {
          g.globalAlpha = 0.55; drawGlyph(g, sat.id, px, py, sr * 0.75, hexA(SIGILS[sat.id].color, 0.9), 4); drawGlyph(g, sat.id, px, py, sr * 0.75, hexA(gold, 0.9), 1); g.globalAlpha = 1;
        }
        if (ignored) { g.fillStyle = 'rgba(120,105,90,0.22)'; g.beginPath(); g.arc(px, py, sr, 0, TAU); g.fill(); }
        // (v177) a centre whose ring takes nothing here: a faint stroke through each empty circle; a ring-sigil this
        // centre will not take: struck through in red
        const refused = takes && sat && sat.ok && !takes.includes(sat.id);
        if (takes && (refused || (!takes.length && !sat && !signHere))) {
          const d = sr * 0.62;
          g.strokeStyle = refused ? 'rgba(160,42,26,0.75)' : 'rgba(110,80,50,0.4)'; g.lineWidth = refused ? 1.8 : 1.2;
          g.beginPath(); g.moveTo(px - d, py + d); g.lineTo(px + d, py - d); g.stroke();
        }
        // its time, written on the circle's outer side (above the upper three, beneath the rest, so it never
        // lies on the seal's rune ring): for every coloured circle, and for any ring-sigil
        if (ignored || (coloured && (!signHere || (sat && sat.ok)))) {
          g.fillStyle = ignored ? 'rgba(110,95,80,0.85)' : hexA(coloured ? col : '#5a3a1a', sat ? 0.95 : 0.75); g.font = `italic ${Math.max(9, Math.round(r * 0.075))}px "IM Fell English", serif`; g.textAlign = 'center';
          const up = Math.sin(a) < -0.5;
          g.fillText(ignored ? 'ignored' : REL_NAME[rel || 'now'], px, up ? py - sr - Math.max(5, r * 0.035) : py + sr + Math.max(10, r * 0.09));
        }
      }
    }
    g.restore();
  },
  // as the book opens, the last leaf turns over onto the left page (on one page, it turns away to the left)
  pageTurn(g, e) {
    const pim = gart('page'); if (!pim) return;
    const L = this.L, P = L.right, a = ease(clamp(this.anim * 1.15, 0, 1));
    let hx, wd;
    // (two pages: hinged on the fold, landing on the left page, which sideways may be narrower than the right)
    if (!L.left) { hx = P.x; wd = P.w * Math.cos(a * Math.PI / 2); }
    else { hx = P.x; const c = Math.cos(a * Math.PI); wd = (c >= 0 ? P.w : L.left.w) * c; }
    if (Math.abs(wd) < 1) return;
    const x = wd > 0 ? hx : hx + wd, w = Math.abs(wd);
    g.save();
    // its shadow on the page beneath, then the leaf itself, darkening as it stands up edge-on
    g.fillStyle = `rgba(40,20,5,${0.18 * (1 - w / P.w)})`; g.fillRect(x - 6, P.y + 4, w + 12, P.h);
    if (!folioLeaf(g, x, P.y, w, P.h, wd < 0, true)) drawCover(g, pim, x, P.y, w, P.h, wd < 0);
    const sh = g.createLinearGradient(hx, 0, hx + wd, 0);
    sh.addColorStop(0, 'rgba(50,25,8,0.45)'); sh.addColorStop(0.25, 'rgba(50,25,8,0.12)'); sh.addColorStop(1, `rgba(40,20,5,${0.35 * (1 - w / P.w)})`);
    g.fillStyle = sh; g.fillRect(x, P.y, w, P.h);
    g.strokeStyle = 'rgba(120,85,40,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, P.y + 0.5, w - 1, P.h - 1);
    g.restore();
  },
  // the land, from the painted textures, cached until something on it changes
  renderMiniMap(ox, oy, tw, th) {
    const W = World.W, Hh = World.H, cells = World.cells, dpr = this.dpr;
    let lo = 0, hi = 0; for (const c of cells) if (!c.void) { lo = Math.min(lo, c.h); hi = Math.max(hi, c.h); }
    const bx = ox - Hh * tw - tw - 2, by = oy - (hi + 1) * th * 0.9 - 2;
    const bw = (W + Hh) * tw + tw * 2 + 4, bh = (W + Hh) * th + th * 2 + (hi - lo + 2) * th * 0.9 + 8;
    const M = this._mm || (this._mm = { c: document.createElement('canvas') });
    M.c.width = Math.ceil(bw * dpr); M.c.height = Math.ceil(bh * dpr); M.x = bx; M.y = by; M.w = bw; M.h = bh;
    const g = M.c.getContext('2d'); g.scale(dpr, dpr); g.translate(-bx, -by);
    const pats = {};
    const pat = k => {
      if (k in pats) return pats[k];
      const im = TEX_IMAGES[k]; if (!im) return pats[k] = null;
      const p = g.createPattern(im, 'repeat');
      if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(2 * tw * TEX_ART[k].span / im.naturalWidth));
      return pats[k] = p;
    };
    const top = (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + tw, py + th); g.lineTo(px, py + th * 2); g.lineTo(px - tw, py + th); g.closePath(); };
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const c = cells[y * W + x]; if (c.void) continue;
      const px = ox + (x - y) * tw, py = oy + (x + y) * th - c.h * th * 0.9, d = (c.h - lo) * th * 0.9 + th * 0.6;
      const water = c.water != null, base = water ? (c.ice ? '#b8d8e0' : '#7ea7c4') : c.feat === 'bramble' ? '#6a7050' : c.h > 0 ? '#bfae90' : '#8f9a5e';
      const tex = water ? (c.ice ? 'ice' : 'water') : c.h > 0 ? 'stone' : 'grass';
      // the two faces below the top, shaded
      for (const R of [0, 1]) {
        g.beginPath();
        if (R) { g.moveTo(px, py + th * 2); g.lineTo(px + tw, py + th); g.lineTo(px + tw, py + th + d); g.lineTo(px, py + th * 2 + d); }
        else { g.moveTo(px - tw, py + th); g.lineTo(px, py + th * 2); g.lineTo(px, py + th * 2 + d); g.lineTo(px - tw, py + th + d); }
        g.closePath(); g.fillStyle = water ? '#5a7a90' : '#8a7454'; g.fill();
        g.fillStyle = `rgba(30,18,8,${R ? 0.42 : 0.24})`; g.fill();
      }
      top(px, py); g.fillStyle = base; g.fill();
      const p = pat(tex); if (p) { g.globalAlpha = 0.7; g.fillStyle = p; g.fill(); g.globalAlpha = 1; }
      if (c.feat === 'bramble') { g.fillStyle = 'rgba(50,60,30,0.45)'; g.fill(); }
      g.strokeStyle = 'rgba(255,240,205,0.22)'; g.lineWidth = 0.6; g.stroke();
      if (c.feat === 'font') { g.fillStyle = '#2a8a9a'; g.beginPath(); g.arc(px, py + th, tw * 0.35, 0, TAU); g.fill(); }
      if (c.feat === 'brazier') { g.fillStyle = c.lit ? '#e0701a' : '#4a3020'; g.beginPath(); g.arc(px, py + th, tw * 0.3, 0, TAU); g.fill(); }
    }
  },
  // the largest the map of the land (in its panel, caption inside) will draw within a rect of the lesson page,
  // centred there: { tw (a tile's half-width), x, y, w, h (the panel), foot } — null if it would be too small to read
  mapFit(R, foot, s) {
    const W = World.W, H = World.H, d = 15 * s, pad = d * 0.9;
    let hi = 0, lo = 0; for (const c of World.cells) if (!c.void) { hi = Math.max(hi, c.h); lo = Math.min(lo, c.h); }
    const fixW = 4 + 2 * pad, fixH = 2 * pad + 21 * s + 8, perW = W + H + 2, perH = (W + H) / 2 + 1 + 0.45 * (hi - lo + 2);
    const tw = Math.min(8.5 * s * Math.min(1, 12 / Math.max(W, H)), (R.x1 - R.x0 - fixW) / perW, (R.y1 - R.y0 - fixH) / perH);
    if (!(tw >= 2.6 * s)) return null;
    // the panel no narrower than its caption (a small map beside the sigils left the words standing out past the frame)
    const mg = this._mg || (this._mg = document.createElement('canvas').getContext('2d'));
    mg.font = `italic ${Math.round(11 * s)}px "IM Fell English", serif`;
    const w = Math.max(fixW + perW * tw, mg.measureText('the land as it lies').width + 2 * d + 8 * s), h = fixH + perH * tw;
    if (w > R.x1 - R.x0) return null;
    return { tw, w, h, x: (R.x0 + R.x1 - w) / 2, y: (R.y0 + R.y1 - h) / 2, foot, hi, d, pad };
  },
  drawMiniMap(g, t) {
    // (on the spread only, on the lesson page — placed by mapFit when that page was drawn — the drawing page kept free)
    const MA = this.mapAt;
    if (!World.W || this.L.single || !MA) return;
    const P = this.L.left, s = Math.min(P.w, P.h) / 520;
    const FR = gart('frame') && gart('page') && typeof TEX_IMAGES !== 'undefined' ? GART.frame : null;
    const W = World.W, size = MA.tw, tw = size, th = tw * 0.5, { d, pad } = MA;
    const right = MA.x + MA.w, fy = MA.y;
    const ox = right - pad - (W + 1) * tw - 2, oy = fy + pad + 21 * s + (MA.hi + 1) * th * 0.9 + 2;
    const fr = FR ? { right, fy, d, pad } : null;
    g.save();
    if (gart('page') && typeof TEX_IMAGES !== 'undefined') {
      let key = `${World.W},${World.H},${ox.toFixed(1)},${oy.toFixed(1)},${size.toFixed(2)},${this.dpr},${Object.keys(TEX_IMAGES).length}|`;
      for (const c of World.cells) key += c.void ? 'v' : `${c.h},${c.water != null ? 1 : 0}${c.ice ? 1 : 0}${c.feat || ''}${c.lit ? 1 : 0};`;
      if (this._mmKey !== key) { this._mmKey = key; this.renderMiniMap(ox, oy, tw, th); }
      const M = this._mm;
      if (fr) {
        // the panel, its caption inside it with the land
        const { d, pad, fy } = fr, fx = Math.min(M.x - pad, MA.x), fw = fr.right - fx, fh = M.y + M.h + pad - fy;
        // solid parchment, so a corner boss the panel sits over never shows through it (the user: all beige inside)
        g.fillStyle = '#f3e6c6'; g.fillRect(fx + d * 0.5, fy + d * 0.5, fw - d, fh - d);
        nineSlice(g, FR, fx, fy, fw, fh, 96, d);
        fr.lx = fx + fw / 2;
      }
      g.save(); g.shadowColor = 'rgba(60,30,10,0.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
      g.drawImage(M.c, M.x, M.y, M.w, M.h); g.restore();
    } else for (let y = 0; y < World.H; y++) for (let x = 0; x < World.W; x++) {
      const c = World.cells[y * World.W + x]; if (c.void) continue;
      const px = ox + (x - y) * tw, py = oy + (x + y) * th - c.h * th * 0.9;
      g.fillStyle = c.water != null ? (c.ice ? '#b8d8e0' : '#7ea7c4') : c.feat === 'bramble' ? '#6a7050' : c.h > 0 ? '#bfae90' : '#a99a6e';
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + tw, py + th); g.lineTo(px, py + th * 2); g.lineTo(px - tw, py + th); g.closePath(); g.fill();
      if (c.feat === 'font') { g.fillStyle = '#2a8a9a'; g.beginPath(); g.arc(px, py + th, size * 0.35, 0, TAU); g.fill(); }
      if (c.feat === 'brazier') { g.fillStyle = c.lit ? '#d0601a' : '#4a3020'; g.beginPath(); g.arc(px, py + th, size * 0.3, 0, TAU); g.fill(); }
    }
    for (const b of World.bodies) {
      if (!b.alive || b.kind !== 'orb') continue;
      const px = ox + (b.x - b.y) * tw, py = oy + (b.x + b.y) * th - b.z * th * 0.9;
      g.fillStyle = '#d99a20'; g.beginPath(); g.arc(px, py, size * 0.4 + Math.sin(t * 4) * 0.6, 0, TAU); g.fill();
    }
    g.fillStyle = '#4a2e1a'; g.font = `italic ${Math.round(11 * s)}px "IM Fell English", serif`; g.textAlign = 'center';
    g.fillText('the land as it lies', fr ? fr.lx : MA.x + MA.w / 2, fy + pad + 15 * s); // (the caption kept clear of the frame's top edge)
    g.restore();
  },
};
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
