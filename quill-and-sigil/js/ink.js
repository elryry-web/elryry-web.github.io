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
  plain: 'A sign is a stroke drawn outward through one of the eight small circles: it points the spell as the world lies. A short barb across it adds strength — two for the most. Unadorned, stone, fire, ice and water set one tile; each sign is its own arm: opposite signs make one line through your mark; signs at right angles fill the ground between.',
  // added to the plain notes only once Featherfall II has taught the outer circle (ringTaught)
  ring: ' A second ring around the seal widens the spell; around Luna, it doubles how far the float carries.',
  combos: 'A sign points the spell as the world lies; each barb across it adds strength. On Luna, the sign and barbs aim and strengthen only what rides on its ring. Each place on the ring holds one mark. A small sigil in a slot infuses the spell — behind the sign (red) it acts at once; beside it (blue), along the way; ahead of it (green), on arrival.',
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
  stone: { id: 'stone', name: 'Petra',  en: 'Stone', color: '#ecc890', glyph: 'square',   words: 'PETRA · FVNDAMENTVM · TERRAE · ',  desc: 'The square. Raises stone — even from empty air.' },
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
  add('frost', glyphLines('star')[0].slice(0, 5), true, 'small');
  // Luna — closed crescent & open C, both facings
  const moon = glyphLines('moon')[0];
  add('luna', moon, true, 'mid'); add('luna', mx(moon), true, 'mid');
  const arc = [];
  for (let i = 0; i <= 40; i++) { const a = (45 + 270 * i / 40) * Math.PI / 180; arc.push([Math.cos(a), Math.sin(a)]); }
  // (any turn, as the closed crescents: v72 — an open C opening up or down went unread)
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
/* A closed shape is often drawn with a little hook or overshoot where the pen comes back to its start (user report, v72:
   a crescent read as Ignis because its hook counted as a third corner). Keep just the loop: from the point near the
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
function recognize(raw) {
  if (raw.length < 4 || pathLen(raw) < 0.05) return null;
  raw = trimLoop(raw);
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
  if (sp.turns > 1.25 && sp.corr > 0.75) best.gale = Math.min(best.gale, 0.04 + Math.max(0, 0.9 - sp.corr) * 0.2);
  // corners: a square must have them; circles and crescents must not
  const sharp = maxTurn(raw);
  if (sharp < 0.85) {
    best.stone += 0.08; best.flame += 0.05; best.frost += 0.05;
  } else if (sharp > 1.15) best.none += 0.06;
  // an open stroke (ends far apart) is never a plain circle
  const gap = endGap(raw);
  // (0.42 ≈ a circle left open by 50°: less open than that it is still a circle, never an open-C Luna — v72)
  if (gap > 0.42) best.none += 0.1;
  // closed polygons: count the corners so a triangle is a triangle whichever way it points
  if (gap < 0.3 && sp.turns < 1.25) {
    const cc = cornerCount(raw);
    if (cc === 2) { best.luna = Math.min(best.luna, 0.05 + Math.max(0, best.luna - 0.05) * 0.5); best.none += 0.06; }
    else if (cc === 3) { best.flame = Math.min(best.flame, 0.05 + Math.max(0, best.flame - 0.05) * 0.25); best.stone += 0.06; }
    else if (cc === 4) { best.stone = Math.min(best.stone, 0.05 + Math.max(0, best.stone - 0.05) * 0.4); best.flame += 0.06; }
  }
  let id = null, d = 1e9;
  for (const k in best) if (best[k] < d) { d = best[k]; id = k; }
  if (id === 'none') return { id: null, d, ok: false, circle: true, scores: best };
  return { id, d, ok: d < SIGIL_ACCEPT, scores: best };
}

/* A closed, roundish stroke qualifies as a seal */
function circleFit(pts) {
  if (pts.length < 8) return null;
  let cx = 0, cy = 0;
  const rs = resample(pts, 64);
  for (const p of rs) { cx += p.x; cy += p.y; }
  cx /= rs.length; cy /= rs.length;
  let m = 0; const rr = rs.map(p => Math.hypot(p.x - cx, p.y - cy));
  for (const r of rr) m += r; m /= rr.length;
  let sd = 0; for (const r of rr) sd += (r - m) ** 2; sd = Math.sqrt(sd / rr.length);
  let ang = 0;
  for (let i = 1; i < rs.length; i++) {
    let a0 = Math.atan2(rs[i - 1].y - cy, rs[i - 1].x - cx), a1 = Math.atan2(rs[i].y - cy, rs[i].x - cx);
    let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; ang += da;
  }
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return { cx, cy, r: m, round: sd / m, cover: Math.abs(ang), gap: gap / m };
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
    const plainSigil = j => { const r = recognize(this.strokes[j].pts); return !!(r && r.ok && r.id !== 'none'); };
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
      // (a closed shape is never an arrow)
      if ((!rec || !rec.ok) && idx.length === 1 && endGap(ptsOf(idx[0])) > 0.3) {
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
const SLOT_R = 1.45, SLOT_SIZE = 0.27, GUIDE_R = 0.52; // GUIDE_R: the dotted seal guide on the page (in page half-widths)
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
  return { centers: L.centers || L.sigils, sats: L.sats || L.sigils, combos: !!L.combos };
}
const REL_NAME = { now: 'at once', along: 'along the way', arrive: 'on arrival' };
// the small circles' colours in the second folio: when a ring-sigil there would act
const REL_COL = { now: '#b3392a', along: '#2d6fb3', arrive: '#2f8a4c' };
const REL_WORD = { now: 'red', along: 'blue', arrive: 'green' };

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

function buildSpell(draft, rules) {
  const A = draft.a;
  if (Array.isArray(rules)) rules = { centers: rules, sats: rules };
  if (!A.seal) return { err: 'Every spell begins with a seal — one closed circle.' };
  if (!A.sigil) return { err: 'The seal stands empty. Inscribe a sigil within it.' };
  if (!A.sigil.ok) return { err: 'The sigil is unclear — the ink will not answer.' };
  const id = A.sigil.id;
  if (rules && !rules.centers.includes(id)) {
    return { err: rules.sats.includes(id) ? `${SIGILS[id].name} may only whisper from the ring in this lesson.` : `${SIGILS[id].name} is not yet written in this lesson's folio.` };
  }
  if (rules && rules.combos === false && A.sats.length) return { err: 'Only signs may enter the small circles for now — draw your sign out from the seal into one. Sigils in the circles belong to the second folio.' };
  for (const s of A.sats) {
    if (!s.ok) return { err: 'A ring-sigil is unclear — redraw it inside its slot.' };
    if (rules && !rules.sats.includes(s.id)) return { err: `${SIGILS[s.id].name} cannot be set upon the ring in this lesson.` };
  }
  // each of the eight positions holds one mark: a sign or a ring-sigil
  for (const s of A.sats) if (A.signs.some(g => g.pos === s.slot)) return { err: 'Each place on the ring holds one mark — a sign or a ring-sigil, not both.' };
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
  const groups = {};
  for (const s of A.sats) {
    let rel = 'now';
    if (dir) {
      const c = Math.cos(s.slot * TAU / 8 - Math.atan2(sy, sx));
      rel = c > 0.38 ? 'arrive' : c < -0.38 ? 'now' : 'along';
    }
    const k = s.id + ':' + rel;
    groups[k] = groups[k] || { id: s.id, rel, n: 0, order: s.slot };
    groups[k].n = Math.min(3, groups[k].n + 1);
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
// Ventus with Luna and Petra both on its ring at once: the ferry (applySpell in world.js)
function isFerry(sp) { const now = id => (sp.sats || []).some(s => s.id === id && s.rel === 'now'); return sp.sigil === 'gale' && !!sp.dir && now('luna') && now('stone'); }
// short: the aim bar's compact form (v75: on a phone the full read-back filled a third of the screen); the grimoire keeps it whole
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
  else if (isFerry(sp)) t += short ? ` · a ferry sails ${force} ${worldDirArrow(sp.dir)}` : ` · a ferry: a floating slab sails ${force} ${worldDirArrow(sp.dir)}, rider and all`;
  else if (sp.dir) t += ` · ${force} ${{ gale: 'gust', tide: 'current' }[sp.sigil] || 'push'} ${worldDirArrow(sp.dir)}`;
  else if (sp.radial) t += ` · ${force}, balanced (outward)`;
  if (sp.amp && !line && sp.sigil !== 'stone' && sp.sigil !== 'luna') t += ' · widened';
  for (const s of sp.sats || []) {
    if (isFerry(sp) && s.rel === 'now' && (s.id === 'luna' || s.id === 'stone')) continue;
    if (short && sp.sigil === 'luna' && s.id === 'gale' && sp.dir) continue; // already said: "Ventus bears it …"
    t += ` · + ${SIGILS[s.id].name}${s.n > 1 ? ' ×' + s.n : ''} ${REL_NAME[s.rel]}`;
  }
  return t;
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
      e._info = sp.err ? { label: 'Smudged spell', img: '' } : { label: shortSpell(sp), img: spellThumb(e.strokes, sp), sigil: sp.sigil, color: sp.color };
    }
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
function drawGlyph(g, id, cx, cy, r, col, w) {
  g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const line of glyphLines(SIGILS[id].glyph)) {
    g.beginPath(); line.forEach(([x, y], i) => i ? g.lineTo(cx + x * r, cy + y * r) : g.moveTo(cx + x * r, cy + y * r)); g.stroke();
  }
  g.restore();
}
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
    // a phone held sideways: one wide page, the drawing circle on the left, everything else in a column beside it
    const side = vh < 560 && vw > vh * 1.25;
    const single = side || vw < 900 || vh > vw * 0.95;
    const L = { single, side: null };
    if (side) {
      // the height is all a sideways phone has: the book runs nearly edge to edge and the circle fills the page's height
      const bh = vh - 8, bw = Math.min(vw - 16, bh * 2.6);
      L.bx = (vw - bw) / 2; L.by = 4; L.bw = bw; L.bh = bh;
      const pad = 5;
      L.right = { x: L.bx + pad, y: L.by + pad, w: bw - pad * 2, h: bh - pad * 2 };
      L.left = null;
      const P = L.right;
      // the whole drawing circle stays inside the page's border (margin m, plus room for the vine's leaves)
      const m = Math.min(P.w, P.h) * 0.035;
      const size = Math.min(P.h - 2 * (m + 9), P.w * 0.5);
      L.area = { x: P.x + Math.max(m + 14, P.w * 0.04), y: P.y + (P.h - size) / 2, size };
      const sx = L.area.x + size + 22;
      L.side = { x: sx, y: P.y + 14, w: P.x + P.w - sx - 18, h: P.h - 28 };
    } else if (!single) {
      const bw = Math.min(vw - 40, (vh - 30) * 1.52, 1500), bh = bw / 1.52;
      L.bx = (vw - bw) / 2; L.by = (vh - bh) / 2; L.bw = bw; L.bh = bh;
      const pad = bw * 0.018;
      L.left = { x: L.bx + pad, y: L.by + pad, w: bw / 2 - pad, h: bh - pad * 2 };
      L.right = { x: L.bx + bw / 2, y: L.by + pad, w: bw / 2 - pad, h: bh - pad * 2 };
      const P = L.right;
      const size = Math.min(P.w - P.w * 0.24, P.h - P.h * 0.34);
      L.area = { x: P.x + (P.w - size) / 2, y: P.y + P.h * 0.13, size };
    } else {
      // upright: the circle takes nearly the page's full width (the width is what limits it) and the book grows
      // as tall as it needs — header 120, circle, then status and two rows of buttons below
      const HEAD = 140, FOOT = 175, pad = 6;
      const bw = Math.min(vw - 10, 640), pw = bw - pad * 2;
      // the whole drawing circle stays inside the page's border (margin m, plus room for the vine's leaves)
      const m = pw * 0.035;
      const size = Math.max(160, Math.min(pw - 2 * (m + 9), vh - 10 - pad * 2 - HEAD - FOOT));
      const bh = Math.min(vh - 10, HEAD + size + FOOT + pad * 2);
      L.bx = (vw - bw) / 2; L.by = (vh - bh) / 2; L.bw = bw; L.bh = bh;
      L.right = { x: L.bx + pad, y: L.by + pad, w: pw, h: bh - pad * 2 };
      L.left = null;
      const P = L.right;
      L.area = { x: P.x + (P.w - size) / 2, y: P.y + HEAD, size };
    }
    L.area.cx = L.area.x + L.area.size / 2; L.area.cy = L.area.y + L.area.size / 2; L.area.half = L.area.size / 2;
    this.L = L;
    // position HTML buttons under the drawing area
    const pb = document.getElementById('pagebtns');
    if (pb) {
      pb.classList.toggle('single', single);
      if (L.side) {
        pb.style.left = L.side.x + 'px'; pb.style.width = L.side.w + 'px';
        pb.style.top = 'auto'; pb.style.bottom = (vh - (L.side.y + L.side.h)) + 'px';
      } else {
        pb.style.left = (L.right.x) + 'px'; pb.style.width = L.right.w + 'px';
        pb.style.bottom = 'auto';
        pb.style.top = (L.area.y + L.area.size + (single ? 70 : L.right.h * 0.1)) + 'px'; // room for the name and two lines of the read-back
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
    if (name === 'area') { const R = r * (SLOT_R + SLOT_SIZE) + 6; return { x: A.cx - R, y: A.cy - R, w: R * 2, h: R * 2 }; }
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
      const SD = L.side, P = SD || L.right, s = SD ? Math.min(0.9, P.w / 380) : Math.min(P.w, P.h) / 520;
      const sy = SD ? SD.y + 134 : A.y + A.size + (L.single ? 26 : 22 * s);
      const w = P.w * 0.8;
      return { x: P.x + (P.w - w) / 2, y: sy - 30 * s - 4, w, h: 30 * s + 44 * s + 8 };
    }
    if (name.startsWith('codex:')) { const c = this.codexRects.find(c => c.id === name.slice(6)); return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null; }
    return null;
  },
  slotRel(k) {
    const D = this.draft.a; let sx = 0, sy = 0;
    for (const s of D.signs) { sx += Math.cos(s.pos * TAU / 8); sy += Math.sin(s.pos * TAU / 8); }
    if (!D.signs.length || Math.hypot(sx, sy) < 0.5 * D.signs.length) return null;
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
    this.bookDirty = true; this.inkDirty = true;
    this.updateStatus();
    Sfx.play('page');
  },
  hide() {
    this.closing = true; this.open = false;
    document.getElementById('pagebtns').style.display = 'none';
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
    const sp = buildSpell(this.draft, null);
    if (sp.err) { this.status = 'Only a finished spell can be kept — ' + sp.err.charAt(0).toLowerCase() + sp.err.slice(1); this.statusCol = '#8a2a1a'; this.shake = 0.3; Sfx.play('fizzle'); return false; }
    const A = this.draft.a;
    const strokes = this.draft.strokes.filter((s, i) => A.roles[i] !== 'stray');
    if (!Satchel.add(strokes)) { this.status = 'Thy satchel is full — let a kept spell go first.'; this.statusCol = '#8a2a1a'; Sfx.play('fizzle'); return false; }
    Sfx.play('sigil', sp.sigil);
    this.status = isTouch()
      ? `Kept in thy satchel as spell ${Satchel.list.length} — tap its slot beside the grimoire button to cast it.`
      : `Kept in thy satchel as spell ${Satchel.list.length} — press ${Satchel.list.length} in the world to cast it.`;
    this.statusCol = '#2b2040';
    this.flash = 0.6;
    return true;
  },
  updateStatus() {
    const A = this.draft.a, allowed = lessonRules();
    this.statusCol = '#4a3220';
    if (!this.draft.strokes.length) { this.status = 'Begin with the seal — draw one closed circle.'; return; }
    if (!A.seal && A.loneSigil) { this.status = `${SIGILS[A.loneSigil].name} is written. Now draw the seal around it: one closed circle, on the dotted ring.`; return; }
    if (!A.seal) { this.status = 'The seal must close upon itself — a round, unbroken circle.'; this.statusCol = '#8a2a1a'; return; }
    if (!A.sigil) { this.status = 'The seal is set. Now inscribe a sigil within it.'; return; }
    const sp = buildSpell(this.draft, allowed);
    if (sp.err) {
      this.status = sp.err; this.statusCol = '#8a2a1a';
      if (!A.sigil.ok && A.sigil.id) this.status += `  (Closest: ${SIGILS[A.sigil.id].name}?)`;
      return;
    }
    this.status = describeSpell(sp);
    if (A.notes.includes('dupSign')) this.status += ' · one sign to a place — the extra is ignored';
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
    // leather cover
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 40; g.shadowOffsetY = 16;
    const cvx = L.bx - 14, cvy = L.by - 12, cw = L.bw + 28, ch = L.bh + 24;
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
    const pages = L.single ? [L.right] : [L.left, L.right];
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
      const cx = L.bx + L.bw / 2;
      const gg = g.createLinearGradient(cx - 40, 0, cx + 40, 0);
      gg.addColorStop(0, 'rgba(60,35,15,0)'); gg.addColorStop(0.45, 'rgba(60,35,15,0.32)'); gg.addColorStop(0.5, 'rgba(40,20,8,0.5)');
      gg.addColorStop(0.55, 'rgba(60,35,15,0.32)'); gg.addColorStop(1, 'rgba(60,35,15,0)');
      g.fillStyle = gg; g.fillRect(cx - 40, L.by, 80, L.bh);
      this.codex(g, L.left);
    } else this.codexStrip(g, L.side || L.right);
    this.drawingFrame(g);
    this.bookDirty = false;
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
    g.fillText(`LESSON ${lv.roman}`, P.x + P.w / 2, y); y += 34 * s;
    g.fillStyle = ink; g.font = `700 ${Math.round(26 * s)}px "Cinzel Decorative", serif`;
    g.fillText(lv.name, P.x + P.w / 2, y); y += 14 * s;
    fleuron(g, P.x + P.w / 2, y + 6 * s, s * 0.8, ink, gold); y += 30 * s;
    // master's note with illuminated initial
    g.textAlign = 'left';
    const capS = 46 * s;
    const first = lv.lesson[0], rest = lv.lesson.slice(1);
    g.save();
    g.fillStyle = '#f3dfa8'; g.strokeStyle = gold; g.lineWidth = 1.5;
    g.fillRect(x0, y, capS, capS); g.strokeRect(x0, y, capS, capS);
    g.strokeStyle = red; g.lineWidth = 0.8; g.strokeRect(x0 + 3, y + 3, capS - 6, capS - 6);
    g.strokeStyle = 'rgba(46,107,62,0.8)'; g.lineWidth = 1;
    g.beginPath(); curl(g, x0 + capS * 0.22, y + capS * 0.78, capS * 0.14, 1.2, 0, 1); g.stroke();
    g.beginPath(); curl(g, x0 + capS * 0.8, y + capS * 0.22, capS * 0.12, 1.2, Math.PI, 1); g.stroke();
    g.fillStyle = red; g.font = `700 ${Math.round(capS * 0.78)}px "Cinzel Decorative", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(first, x0 + capS / 2, y + capS * 0.54);
    g.restore();
    g.fillStyle = ink; g.font = `italic ${Math.round(14.5 * s)}px "IM Fell English", Georgia, serif`; g.textBaseline = 'alphabetic';
    const lh = 19 * s;
    // first lines flow beside the initial
    const words = rest.split(' '); let line = '', ly = y + lh * 0.95, lx = x0 + capS + 8 * s, lw = w - capS - 8 * s, lines = 0;
    let i = 0;
    for (; i < words.length; i++) {
      const t = line ? line + ' ' + words[i] : words[i];
      const maxW = lines < 2 ? lw : w;
      if (g.measureText(t).width > maxW && line) {
        g.fillText(line, lines < 2 ? lx : x0, ly); ly += lh; lines++; line = words[i];
      } else line = t;
    }
    if (line) { g.fillText(line, lines < 2 ? lx : x0, ly); ly += lh; }
    y = Math.max(ly, y + capS + lh) + 10 * s;
    // sigil codex
    g.strokeStyle = 'rgba(74,46,26,0.5)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
    y += 18 * s;
    g.fillStyle = red; g.font = `${Math.round(11.5 * s)}px Cinzel, serif`; g.textAlign = 'center';
    g.fillText('SIGILS OF THIS FOLIO  ·  tap one to trace it', P.x + P.w / 2, y); y += 12 * s;
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
    const FR = 44 * s, US = unknown.length ? 30 * s : 0;
    const twoCol = known.length * FR + US > avail; // a crowded page: two columns, names only
    const rows = twoCol ? Math.ceil(known.length / 2) : known.length, rowH0 = twoCol ? 32 * s : FR;
    const k = clamp(avail / (rows * rowH0 + US), 0.72, 1); // and smaller still if even that will not fit
    const rowH = rowH0 * k, colW = twoCol ? w / 2 : w;
    known.forEach((id, n) => {
      const S = SIGILS[id], col = twoCol ? n % 2 : 0, row = twoCol ? Math.floor(n / 2) : n;
      const rx = x0 + col * colW, ry = y + row * rowH, r = 15 * s * k, cx = rx + r + 4, cy = ry + rowH / 2;
      g.strokeStyle = ink; g.lineWidth = 1.1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      g.strokeStyle = gold; g.lineWidth = 0.6; g.beginPath(); g.arc(cx, cy, r + 3, 0, TAU); g.stroke();
      drawGlyph(g, id, cx, cy, r * 0.82, '#2a1830', 1.6);
      const tx = cx + r + 12 * s;
      g.textAlign = 'left'; g.fillStyle = '#2a1830'; g.font = `${Math.round(22 * s * k)}px "Pinyon Script", cursive`;
      const nameY = twoCol ? cy + 6 * s * k : ry + 19 * s * k;
      g.fillText(S.name, tx, nameY);
      const nw = g.measureText(S.name).width;
      g.fillStyle = red; g.font = `${Math.round(10 * s * k)}px Cinzel, serif`;
      g.fillText(S.en.toUpperCase(), tx + Math.max(nw + 10 * s, twoCol ? 0 : 96 * s * k), nameY - 2 * s);
      if (!twoCol) {
        g.fillStyle = ink; g.font = `italic ${Math.round(12 * s * k)}px "IM Fell English", serif`;
        const ringOnly = lv.centers && !lv.centers.includes(id);
        g.fillText((ringOnly ? 'Ring only, this lesson. ' : '') + S.desc, tx, ry + 36 * s * k);
      }
      this.codexRects.push({ id, x: rx, y: ry, w: colW, h: rowH });
    });
    y += rows * rowH;
    if (unknown.length) {
      g.globalAlpha = 0.32;
      const r = 10 * s * k, cy = y + US * k / 2;
      unknown.forEach((id, n) => {
        const cx = x0 + r + 4 + n * (r * 2 + 10 * s);
        g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        drawGlyph(g, id, cx, cy, r * 0.8, ink, 1.2);
      });
      g.fillStyle = ink; g.font = `italic ${Math.round(12 * s * k)}px "IM Fell English", serif`; g.textAlign = 'left';
      g.fillText('not yet learned', x0 + unknown.length * (r * 2 + 10 * s) + 10 * s, cy + 4 * s);
      g.globalAlpha = 1;
      y += US * k;
    }
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
    const end = wrapText(g, signNotes(lv), dx + dr * 2.4, y + 10 * s, w - dr * 2.6 - 12 * s, 15 * s);
    this.codexInfo = { k, twoCol, rowH, notesEnd: end, pageEnd: P.y + P.h - Math.min(P.w, P.h) * 0.035 }; // for checking the layout
  },
  codexStrip(g, P) {
    const lv = Game.level; if (!lv) return;
    const s = Math.min(1, P.w / 520), ink = '#3a2414', red = '#8e2f22';
    // upright, the name sits below the page's top vine and its centre ornament
    const side = !!this.L.side, top = side ? P.y + 32 : P.y + 54;
    g.textAlign = 'center'; g.fillStyle = ink;
    g.font = `700 ${Math.round(20 * s + 4)}px "Cinzel Decorative", serif`;
    g.fillText(lv.name, P.x + P.w / 2, top);
    this.codexRects = [];
    const ids = lv.sigils, cw = Math.min(70, (P.w - 20) / ids.length);
    const x0 = P.x + P.w / 2 - cw * ids.length / 2;
    ids.forEach((id, k) => {
      const cx = x0 + cw * (k + 0.5), cy = top + (side ? 30 : 36), r = Math.min(16, cw * 0.36);
      g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      drawGlyph(g, id, cx, cy, r * 0.8, '#2a1830', 1.4);
      g.fillStyle = red; g.font = `${cw < 54 ? 8 : 10}px Cinzel, serif`; g.fillText(SIGILS[id].name.toUpperCase(), cx, cy + r + 12);
      this.codexRects.push({ id, x: cx - cw / 2, y: cy - r, w: cw, h: r * 2 + 16 });
    });
  },
  drawingFrame(g) {
    const A = this.L.area, ink = '#4a2e1a';
    // on one-page layouts the circle is drawn snug so it fits within the page border
    const fr = this.L.single ? 0.99 : 1.04;
    g.save();
    g.fillStyle = 'rgba(255,250,232,0.18)';
    g.beginPath(); g.arc(A.cx, A.cy, A.half * fr, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(74,46,26,0.18)'; g.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      g.beginPath(); g.moveTo(A.cx + Math.cos(a) * A.half * (fr - 0.06), A.cy + Math.sin(a) * A.half * (fr - 0.06));
      g.lineTo(A.cx + Math.cos(a) * A.half * (fr + 0.01), A.cy + Math.sin(a) * A.half * (fr + 0.01)); g.stroke();
    }
    g.setLineDash([3, 6]); g.beginPath(); g.arc(A.cx, A.cy, A.half * fr, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
    if (!this.L.single) {
      const P = this.L.right, s = Math.min(P.w, P.h) / 520;
      g.fillStyle = '#2a1830'; g.textAlign = 'center';
      g.font = `${Math.round(34 * s)}px "Pinyon Script", cursive`;
      g.fillText('Draft thy Seal', P.x + P.w / 2, P.y + P.h * 0.085);
    }
  },
  renderInk() {
    const g = this.inkLayer.getContext('2d'), dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const A = this.draft.a;
    this.draft.strokes.forEach((st, i) => this.strokeInk(g, st.pts, A.roles[i] === 'stray' ? 'rgba(70,50,60,0.28)' : '#20142e'));
    this.inkDirty = false; this.glowDirty = true;
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
      // closed, its full-page layers are let go (on phones the memory is wanted elsewhere); show() lays them out afresh
      for (const c of [this.cv, this.book, this.inkLayer, this.glowLayer]) if (c) { c.width = 1; c.height = 1; }
      return;
    }
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
    this.drawMiniMap(g, t);
    const D = this.draft.a;
    // guide circle
    if (!D.seal) {
      g.save(); g.strokeStyle = 'rgba(140,100,60,0.28)'; g.lineWidth = 1.5; g.setLineDash([2, 9]);
      g.lineDashOffset = -t * 12;
      g.beginPath(); g.arc(A.cx, A.cy, A.half * GUIDE_R, 0, TAU); g.stroke();
      // the eight places around the seal, waiting for signs (and, later, ring-sigils)
      g.setLineDash([3, 4]); g.lineDashOffset = 0; g.strokeStyle = 'rgba(201,150,62,0.5)'; g.lineWidth = 1.4;
      const r = A.half * GUIDE_R;
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; g.beginPath(); g.arc(A.cx + Math.cos(a) * r * SLOT_R, A.cy + Math.sin(a) * r * SLOT_R, r * SLOT_SIZE, 0, TAU); g.stroke(); }
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
    const sp = D.seal ? buildSpell(this.draft, lessonRules()) : null;
    if (D.seal) this.gild(g, D, sp, t);
    // ink
    const valid = sp && !sp.err;
    if (valid) {
      // the glow is blurred once into its own layer and only faded here — a full-page blur every frame is ruinous on large screens
      if (this.glowDirty || this.glowCol !== sp.color) this.renderGlow(sp.color);
      const ga = g.globalAlpha;
      g.globalAlpha = ga * clamp(0.72 + Math.sin(t * 4) * 0.22 + this.flash, 0, 1);
      g.drawImage(this.glowLayer, 0, 0, innerWidth, innerHeight);
      g.globalAlpha = ga;
    }
    g.drawImage(this.inkLayer, 0, 0, innerWidth, innerHeight);
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
    // status
    const SD = this.L.side, P = SD || this.L.right, s = SD ? Math.min(0.9, P.w / 380) : Math.min(P.w, P.h) / 520;
    g.textAlign = 'center'; g.fillStyle = this.statusCol;
    const sy = SD ? SD.y + 134 : A.y + A.size + (this.L.single ? 26 : 22 * s);
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
    const words = D.sigil && D.sigil.ok ? SIGILS[D.sigil.id].words : 'SIGILLVM · SIGNVM · ';
    textOnCircle(g, words, cx, cy, r * 1.08, t * 0.08, Math.max(7, r * 0.075));
    if (D.sigil && D.sigil.ok) {
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
    // always drawn: in the first folio they are plain gold marks for the eight places a sign may go;
    // from the second folio (ring-sigils), once a sign gives the spell a way, each takes the colour of when a sigil there would act
    {
      const ringSigils = !!(Game.level && Game.level.combos);
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8, px = cx + Math.cos(a) * r * SLOT_R, py = cy + Math.sin(a) * r * SLOT_R, sr = r * SLOT_SIZE;
        const sat = D.sats.find(s => s.slot === k), signHere = D.signs.some(s => s.pos === k);
        const rel = this.slotRel(k), coloured = ringSigils && rel;
        const col = coloured ? REL_COL[rel] : gold;
        if (coloured && !signHere) { g.fillStyle = hexA(col, sat ? 0.1 : 0.14); g.beginPath(); g.arc(px, py, sr, 0, TAU); g.fill(); }
        g.setLineDash(coloured ? [] : [3, 4]);
        g.strokeStyle = hexA(sat && !sat.ok ? '#a02a1a' : col, coloured ? (signHere ? 0.35 : 0.85) : (sat ? 0.75 : 0.55));
        g.lineWidth = coloured ? 1.8 : 1.4;
        g.beginPath(); g.arc(px, py, sr, 0, TAU); g.stroke(); g.setLineDash([]);
        if (sat && sat.ok) {
          g.globalAlpha = 0.55; drawGlyph(g, sat.id, px, py, sr * 0.75, hexA(SIGILS[sat.id].color, 0.9), 4); drawGlyph(g, sat.id, px, py, sr * 0.75, hexA(gold, 0.9), 1); g.globalAlpha = 1;
        }
        // its time, written beneath: for every coloured circle, and for any ring-sigil
        if ((coloured && !signHere) || (sat && sat.ok)) {
          g.fillStyle = hexA(coloured ? col : '#5a3a1a', sat ? 0.95 : 0.75); g.font = `italic ${Math.max(9, Math.round(r * 0.075))}px "IM Fell English", serif`; g.textAlign = 'center';
          g.fillText(REL_NAME[rel || 'now'], px, py + sr + Math.max(10, r * 0.09));
        }
      }
    }
    g.restore();
  },
  drawMiniMap(g, t) {
    if (!World.W || this.L.single) return;
    const P = this.L.right, s = Math.min(P.w, P.h) / 520;
    const size = 7 * s * Math.min(1, 11 / Math.max(World.W, World.H));
    const ox = P.x + P.w - 78 * s - (World.W - World.H) * size * 0.5, oy = P.y + P.h * 0.13;
    const tw = size, th = size * 0.5;
    g.save();
    for (let y = 0; y < World.H; y++) for (let x = 0; x < World.W; x++) {
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
    g.fillText('the land as it lies', ox, oy - 8 * s);
    g.restore();
  },
};
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
