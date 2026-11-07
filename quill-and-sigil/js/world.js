'use strict';
/* =====================================================================
   QUILL & SIGIL — world.js
   Isometric terrain, bodies & physics, spell effects, particles, rendering
   ===================================================================== */

const TW = 64, TH = 32, TZ = 30;
const STEP = 0.26, GRAV = 22;
const cam = { s: 1, ox: 0, oy: 0, shake: 0, tx: 0, ty: 0 };

const World = {
  W: 0, H: 0, cells: [], deco: [], bodies: [], fonts: [], braziers: [],
  gateOpen: false, t: 0, pending: [], seals: [], level: null, respawns: [], wisps: [],
};

function proj(x, y, z) { return [cam.ox + (x - y) * TW * 0.5 * cam.s, cam.oy + (x + y) * TH * 0.5 * cam.s - z * TZ * cam.s]; }
function unproj(sx, sy, z) {
  const a = (sx - cam.ox) / (TW * 0.5 * cam.s), b = (sy - cam.oy + z * TZ * cam.s) / (TH * 0.5 * cam.s);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
function cellI(x, y) { if (x < 0 || y < 0 || x >= World.W || y >= World.H) return null; return World.cells[y * World.W + x]; }
function cellAt(x, y) { return cellI(Math.floor(x), Math.floor(y)); }
function floorTop(c) {
  if (!c || c.void) return -Infinity;
  return (c.water != null && c.ice) ? Math.max(c.h, c.water) : c.h;
}
function featH(c) {
  switch (c.feat) {
    case 'bramble': return 0.85 * (1 - (c.burn ? clamp((c.burnT - 0.45) / 0.55, 0, 1) : 0));
    case 'iceblock': return 0.95 * (1 - c.melt);
    case 'brazier': return 0.78;
    case 'gate': return 1.6 * (1 - c.open);
  }
  return 0;
}
function solidTop(c) { const f = floorTop(c); return f === -Infinity ? f : f + featH(c); }
function surfaceTop(c) { if (!c || c.void) return 0; return c.water != null ? Math.max(c.h, c.water) : c.h; }

/* ---------------- Level loading ---------------- */
function loadWorld(lv) {
  World.level = lv; World.H = lv.t.length; World.W = lv.t[0].length;
  World.cells = []; World.deco = []; World.bodies = []; World.pending = []; World.seals = []; World.respawns = []; World.wisps = [];
  World.gateOpen = false; World.t = 0;
  for (let y = 0; y < World.H; y++) for (let x = 0; x < World.W; x++) {
    const tc = lv.t[y][x] || ' ', oc = (lv.o[y] && lv.o[y][x]) || '.';
    const c = { x, y, void: false, h: 0, th: 0, water: null, ice: false, frost: 0, flow: null, feat: null, lit: false, burn: 0, burnT: 0, spread: false, melt: 0, ash: 0, open: 0, wet: 0, rise: 0 };
    if (tc === ' ') c.void = true;
    else if (tc === '_') c.h = -1;
    else if (tc === '=') c.h = -2;
    else if (tc === '~') { c.h = -1; c.water = 0; }
    else if (tc === '*') { c.h = -1; c.water = 0; c.ice = true; }
    else if (/[0-9]/.test(tc)) c.h = +tc;
    c.th = c.h;
    if (oc === '#') c.feat = 'bramble';
    else if (oc === 'I') c.feat = 'iceblock';
    else if (oc === 'B') c.feat = 'brazier';
    else if (oc === 'D') c.feat = 'gate';
    else if (oc === 'G') c.feat = 'font';
    else if (oc === 'f') c.frost = 1;
    World.cells.push(c);
    // decorations
    const R = mulberry(x * 7919 + y * 104729 + 13);
    const d = { tone: R(), tufts: [], vines: [], cracks: [], depth: 1.1 + R() * 0.9 };
    const nt = 2 + Math.floor(R() * 4);
    for (let i = 0; i < nt; i++) d.tufts.push({ u: 0.15 + R() * 0.7, v: 0.15 + R() * 0.7, k: R() < 0.18 ? 'flower' : R() < 0.3 ? 'pebble' : 'tuft', c: R() });
    for (let i = 0; i < 7; i++) d.vines.push({ u: 0.22 + R() * 0.56, v: 0.22 + R() * 0.56, h: 0.45 + R() * 0.5, a: R() * TAU, curl: (R() < 0.5 ? -1 : 1) * (0.6 + R()), ph: R() * TAU });
    for (let i = 0; i < 4; i++) d.cracks.push({ u: R(), v: R(), a: R() * TAU, l: 0.15 + R() * 0.3 });
    World.deco.push(d);
    if (oc === 'O') World.bodies.push(makeBody('orb', x + 0.5, y + 0.5, surfaceTop(c)));
    if (oc === 'C') World.bodies.push(makeBody('crate', x + 0.5, y + 0.5, surfaceTop(c)));
  }
  for (const f of (lv.flows || [])) {
    for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) {
      const c = cellI(x, y); if (c && c.water != null) c.flow = { x: f.dx, y: f.dy, s: f.s };
    }
  }
  indexFeatures();
}
function indexFeatures() {
  World.fonts = World.cells.filter(c => c.feat === 'font');
  World.braziers = World.cells.filter(c => c.feat === 'brazier');
}
function makeBody(kind, x, y, z) {
  const b = { kind, x, y, z, vx: 0, vy: 0, vz: 0, alive: true, lev: 0, drift: null, burn: 0, spread: false, spin: 0, rx: 0, ry: 1, home: { x, y, z }, cap: 0, captured: false, hover: z, id: Math.random() };
  if (kind === 'orb') Object.assign(b, { r: 0.27, hgt: 0.54, mass: 1, floats: true, burnable: false });
  else if (kind === 'slab') Object.assign(b, { r: 0.47, hgt: 0.25, mass: 4, floats: true, burnable: false });
  else Object.assign(b, { r: 0.4, hgt: 0.86, mass: 2, floats: true, burnable: true });
  return b;
}

/* ---------------- Snapshots for rewind ---------------- */
function snapshot() {
  return JSON.stringify({ cells: World.cells, bodies: World.bodies, gateOpen: World.gateOpen });
}
function restore(s) {
  const o = JSON.parse(s);
  World.cells = o.cells; World.bodies = o.bodies; World.gateOpen = o.gateOpen;
  World.pending = []; World.respawns = []; World.seals = []; World.wisps = [];
  indexFeatures();
}

/* ---------------- Physics ---------------- */
function supportFor(b) {
  let s = solidTop(cellAt(b.x, b.y)); b.onBody = null;
  for (const o of World.bodies) {
    if (o === b || !o.alive) continue;
    if (Math.abs(o.x - b.x) < o.r + b.r * 0.35 && Math.abs(o.y - b.y) < o.r + b.r * 0.35 && b.z >= o.z + o.hgt - 0.32 && o.z + o.hgt > s) { s = o.z + o.hgt; b.onBody = o; }
  }
  return s;
}
const effMass = b => b.mass * (b.imb && b.imb.stone ? 3 : 1);
/* returns the cell that blocks the move, or null; imbued bodies may burn or smash through features */
function blockedAt(b, nx, ny) {
  const rr = b.r * 0.82;
  for (let i = 0; i < 4; i++) {
    const c = cellAt(nx + (i & 1 ? rr : -rr), ny + (i & 2 ? rr : -rr));
    if (solidTop(c) > b.z + STEP) { if (b.imb && breakThrough(b, c)) continue; return c; }
  }
  return null;
}
function breakThrough(b, c) {
  if (!c || !c.feat || floorTop(c) > b.z + STEP) return false;
  if (c.feat !== 'bramble' && c.feat !== 'iceblock') return false;
  if (b.imb.flame) {
    if (c.feat === 'bramble') { c.feat = null; c.burn = 0; c.ash = 1; for (let i = 0; i < 18; i++) flameP(c.x + Math.random(), c.y + Math.random(), c.h + Math.random() * 0.6, 1.4); smoke(c.x + .5, c.y + .5, c.h + .4, 5); Sfx.play('catch'); }
    else { c.feat = null; c.melting = false; c.wet = 1; steam(c.x + .5, c.y + .5, c.h + .5, 14); }
    return true;
  }
  if (b.imb.stone) {
    const ice = c.feat === 'iceblock'; c.feat = null; c.burn = 0; c.melting = false;
    for (let i = 0; i < 16; i++) emit({ x: c.x + Math.random(), y: c.y + Math.random(), z: c.h + Math.random() * 0.8, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, vz: 2 + Math.random() * 3, grav: 14, life: 1.1, size: 2 + Math.random() * 2, color: ice ? '#cfefff' : '#5a4a2a', kind: ice ? 'shard' : 'chunk', vr: (Math.random() - .5) * 10 });
    Sfx.play('bump', 1); cam.shake = Math.max(cam.shake, 0.2);
    return true;
  }
  return false;
}
/* ---------- imbued bodies: carrying an element as they move ---------- */
function freezeCell(c) {
  if (!c || c.void) return;
  if (c.water != null) c.ice = true; else c.frost = 1;
  if (c.burn) { c.burn = 0; steam(c.x + .5, c.y + .5, c.h + .5, 8); }
  if (c.feat === 'brazier' && c.lit) { c.lit = false; steam(c.x + .5, c.y + .5, c.h + 0.9, 10); }
}
function douseCell(c) {
  if (!c || c.void) return;
  if (c.burn) { c.burn = 0; steam(c.x + .5, c.y + .5, c.h + .5, 8); }
  c.frost = 0; c.wet = 1;
}
const TOUCH = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]];
function imbueTick(b, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  for (const id in b.imb) {
    const e = b.imb[id]; e.t -= dt; e.age += dt;
    if (e.t <= 0 || (e.untilStop && e.age > 0.4 && sp < 0.5 && b.lev <= 0)) { delete b.imb[id]; continue; }
    if (id === 'flame') {
      for (const [dx, dy] of TOUCH) { const c = cellAt(b.x + dx, b.y + dy); if (c && !c.void && Math.abs(surfaceTop(c) + featH(c) * 0.5 - b.z) < 1.7) ignite(c, true); }
      if (Math.random() < dt * 30) flameP(b.x + (Math.random() - .5) * 0.4, b.y + (Math.random() - .5) * 0.4, b.z + b.hgt * 0.6, 0.8);
    } else if (id === 'frost') {
      const c = cellAt(b.x, b.y);
      if (c && !c.void) {
        if (c.water != null && !c.ice && b.z < c.water + 1.7) { c.ice = true; for (let i = 0; i < 6; i++) emit({ x: c.x + Math.random(), y: c.y + Math.random(), z: c.water + 0.05, vz: 1 + Math.random(), grav: 3, life: 0.8, size: 3, color: '#bfeeff', kind: 'shard', vr: 5 }); }
        else if (c.water == null && b.z < c.h + 0.6) c.frost = Math.max(c.frost, 0.85);
      }
      if (Math.random() < dt * 20) emit({ x: b.x, y: b.y, z: b.z + b.hgt, vx: (Math.random() - .5), vy: (Math.random() - .5), vz: 0.3, life: 1, size: 3, color: '#ffffff', kind: 'flake', vr: 3 });
    } else if (id === 'tide') {
      for (const [dx, dy] of TOUCH) douseCell(cellAt(b.x + dx, b.y + dy));
      if (Math.random() < dt * 20) emit({ x: b.x, y: b.y, z: b.z + b.hgt, vx: (Math.random() - .5), vy: (Math.random() - .5), vz: 1, grav: 8, life: 0.6, size: 2, color: '#9fd6ff', kind: 'drop' });
    } else if (id === 'stone') {
      if (Math.random() < dt * 8) emit({ x: b.x, y: b.y, z: b.z + 0.1, vx: (Math.random() - .5), vy: (Math.random() - .5), vz: 0.5, grav: 6, life: 0.6, size: 2, color: '#8a7a68', kind: 'chunk' });
    }
  }
  if (!Object.keys(b.imb).length) b.imb = null;
}
function arrivalCheck(b, dt) {
  b.arriveT += dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (!(b.captured || (b.arriveT > 0.3 && sp < 0.6 && b.lev <= 0) || (b.arriveT > 0.15 && b.offEdge) || b.arriveT > 7)) return;
  const list = b.arrive; b.arrive = null;
  for (const a of list) arriveEffect(b, a.id, a.n, a.dir);
}
function arriveEffect(b, id, n, dir = null) {
  const x = b.x, y = b.y, z = b.z;
  ring(x, y, z, SIGILS[id].color, 0.9 + 0.3 * n);
  Sfx.play(id, {});
  switch (id) {
    case 'gale': if (!b.captured) { const dv = (3 + 3 * n) / Math.pow(effMass(b), 0.7), dx = dir ? dir.x : b.ldx || 0, dy = dir ? dir.y : b.ldy || 0; b.vx += dx * dv; b.vy += dy * dv; b.vz += 1.2; } break;
    case 'luna': if (!b.captured) { b.lev = 3 + 2 * n; b.drift = null; b.vz += 2.5; } break;
    case 'flame': for (const c of cellsNear(x, y, 1.3 + 0.3 * n)) { ignite(c, true); for (let i = 0; i < 5; i++) flameP(c.x + Math.random(), c.y + Math.random(), surfaceTop(c) + 0.2, 1.4); } break;
    case 'frost': for (const c of cellsNear(x, y, 1.4 + 0.3 * n)) freezeCell(c); for (let i = 0; i < 30; i++) emit({ x: x + (Math.random() - .5) * 3, y: y + (Math.random() - .5) * 3, z: z + Math.random(), vz: -0.4, life: 1.6, size: 3, color: '#ffffff', kind: 'flake', vr: 3 }); break;
    case 'tide': { const cs = cellsNear(x, y, 1.2 + 0.3 * n); floodAt(cs, null, 0); cs.forEach(douseCell); splash(x, y, z, 20); break; }
    case 'stone': {
      if (b.captured) break;
      const c = cellAt(x, y);
      if (!c || (c.feat && c.feat !== 'bramble')) break;
      if (c.void) { const th = Math.round(b.hover || 0); c.void = false; c.water = null; c.flow = null; c.th = th; c.h = Math.min(th, z - 0.02); }
      else c.th = Math.min(3, Math.round(c.th) + n);
      dust(x, y, c.th, 10); cam.shake = Math.max(cam.shake, 0.3);
      break;
    }
  }
}
function cellsNear(x, y, R) {
  const out = [];
  for (let cy = Math.floor(y - R) - 1; cy <= y + R + 1; cy++) for (let cx = Math.floor(x - R) - 1; cx <= x + R + 1; cx++) {
    const c = cellI(cx, cy); if (c && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= R) out.push(c);
  }
  return out;
}
function stepBody(b, dt) {
  if (!b.alive) return;
  // a Luna float (v63) is measured in tiles carried, not seconds: b.levRange is what is left of it
  if (b.levRange != null && b.lev <= 0) b.levRange = null;
  const x0 = b.x, y0 = b.y;
  if (b.arrive) arrivalCheck(b, dt);
  if (b.imb) imbueTick(b, dt);
  if (b.captured) {
    const f = b.captured;
    const ft = f.h + 0.32 + Math.sin(World.t * 2.4) * 0.06;
    b.cap += dt;
    const k = 1 - Math.exp(-5 * dt);
    b.x += (f.x + 0.5 - b.x) * k; b.y += (f.y + 0.5 - b.y) * k; b.z += (ft - b.z) * k;
    b.vx = b.vy = b.vz = 0; b.spin += dt * 2;
    return;
  }
  const c = cellAt(b.x, b.y);
  const sup = supportFor(b);
  const fin = sup > -1e8;
  const water = c && !c.void && c.water != null && !c.ice && c.water > c.h + 0.01 ? c.water : null;
  const inWater = water != null && b.z < water + 0.03 && b.lev <= 0;
  const heavy = !!(b.imb && b.imb.stone);
  let grounded = false;
  const z0 = b.z;
  if (b.lev > 0) {
    if (b.levRange == null) b.lev -= dt; // a distance float hangs as long as it is left alone
    b.levAge = (b.levAge || 0) + dt;
    if (b.levUntilStop && b.levAge > 0.5 && Math.hypot(b.vx, b.vy) < 0.5) b.lev = 0;
    if (fin) b.hover = Math.max(sup, water != null ? water : -1e9);
    const slab = b.kind === 'slab';
    const target = b.hover + (slab ? 0 : 1.3) + Math.sin(World.t * 3 + b.id * 9) * (slab ? 0.02 : 0.07);
    b.vz += ((target - b.z) * 16 - b.vz * 7) * dt;
    if (b.drift) { const r = 1 - Math.exp(-1.8 * dt); b.vx += (b.drift.x - b.vx) * r; b.vy += (b.drift.y - b.vy) * r; }
    if (Math.random() < dt * 14) emit({ x: b.x + (Math.random() - 0.5) * 0.4, y: b.y + (Math.random() - 0.5) * 0.4, z: b.z, vz: -0.4 - Math.random() * 0.4, life: 0.9, size: 5, color: '#cdb0ff', kind: 'glow' });
  } else if (inWater && b.floats && !heavy) {
    const fz = water - b.hgt * 0.24;
    b.vz += ((fz - b.z) * 40 - b.vz * 8) * dt;
  } else b.vz -= GRAV * dt;
  b.z += b.vz * dt;
  if (fin && b.z <= sup) {
    if (b.vz < -4.5) { b.vz = -b.vz * 0.28; Sfx.play('bump', Math.min(1, -b.vz / 6)); dust(b.x, b.y, sup, 4); }
    else b.vz = Math.max(0, b.vz);
    if (sup - z0 > 0.004 && sup - z0 < 0.06) b.vz = Math.max(b.vz, Math.min(3, (sup - z0) / dt * 0.5)); // rising ground gives a gentle pop
    b.z = sup; grounded = true;
  }
  if (grounded && b.lev <= 0) b.hover = sup;
  b.offEdge = !grounded && b.lev <= 0 && (!fin || sup < b.z - 0.8);
  // riding another body (a floating slab) carries you along
  if (grounded && b.onBody && b.onBody.alive) { b.x += b.onBody.vx * dt; b.y += b.onBody.vy * dt; }
  const sp = Math.hypot(b.vx, b.vy);
  let k = 0, cc = 0;
  if (inWater) {
    const fl = heavy ? null : c.flow, r = 1 - Math.exp(-3 * dt);
    b.vx += ((fl ? fl.x * fl.s : 0) - b.vx) * r; b.vy += ((fl ? fl.y * fl.s : 0) - b.vy) * r;
    if (sp > 0.6 && Math.random() < dt * 20) emit({ x: b.x, y: b.y, z: water, vz: 1.2, vx: (Math.random() - .5), vy: (Math.random() - .5), grav: 6, life: 0.5, size: 2.2, color: '#bfe6ff', kind: 'drop' });
  } else if (b.lev > 0) { if (!b.drift) { k = 0.85; cc = 0.1; } } // the air slows a lifted thing: the gust's barbs decide how far it glides
  else if (grounded) {
    const slick = c && (c.ice || c.frost > 0.3 || c.icy);
    if (b.kind === 'orb') { k = slick ? 0.1 : 0.9; cc = slick ? 0.18 : 0.8; }
    else { k = slick ? 0.3 : 3.2; cc = slick ? 0.4 : 2.6; }
  } else k = 0.04;
  if (k || cc) { const ns = Math.max(0, sp - (k * sp + cc) * dt), f = sp > 0 ? ns / sp : 0; b.vx *= f; b.vy *= f; }
  const stuck = blockedAt(b, b.x, b.y);
  const nx = b.x + b.vx * dt;
  if (stuck || !blockedAt(b, nx, b.y)) b.x = nx;
  else { if (Math.abs(b.vx) > 1.5) Sfx.play('bump', Math.min(1, Math.abs(b.vx) / 8)); b.vx = -b.vx * 0.22; }
  const ny = b.y + b.vy * dt;
  if (stuck || !blockedAt(b, b.x, ny)) b.y = ny;
  else { if (Math.abs(b.vy) > 1.5) Sfx.play('bump', Math.min(1, Math.abs(b.vy) / 8)); b.vy = -b.vy * 0.22; }
  if (b.levRange != null && b.lev > 0) {
    b.levRange -= Math.hypot(b.x - x0, b.y - y0);
    // carried its full distance: Luna lets go and it settles where it is (no coasting on to somewhere the float never reached)
    if (b.levRange <= 0) { b.lev = 0; b.levRange = null; b.vx *= 0.15; b.vy *= 0.15; b.drift = null; }
  }
  // rolling
  const s2 = Math.hypot(b.vx, b.vy);
  if (s2 > 0.01 && b.kind === 'orb') { b.spin += s2 * dt / b.r; b.rx = b.vx / s2; b.ry = b.vy / s2; }
  if (s2 > 0.5) { b.ldx = b.vx / s2; b.ldy = b.vy / s2; }
  // fonts
  if (b.kind === 'orb') {
    for (const f of World.fonts) {
      const d = Math.hypot(f.x + 0.5 - b.x, f.y + 0.5 - b.y);
      if (d < 0.52 && b.z >= f.h - 0.3 && b.z <= f.h + 2.4 && s2 < 14) {
        b.captured = { x: f.x, y: f.y, h: f.h }; b.lev = 0; b.cap = 0;
        Sfx.play('capture');
        for (let i = 0; i < 40; i++) emit({ x: f.x + 0.5, y: f.y + 0.5, z: f.h + 0.3, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, vz: 1 + Math.random() * 3, drag: 2, life: 1.2, size: 6, color: '#8ff4ff', kind: 'glow' });
      }
    }
  }
  if (b.z < -7) {
    b.alive = false;
    if (b.kind === 'orb') { World.respawns.push({ b, t: 0.9 }); Game.toast('The orb is lost to the abyss… it re-forms where it began.'); Sfx.play('lost'); }
  }
}
function collideBodies() {
  const B = World.bodies;
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if (!a.alive || !b.alive || a.captured || b.captured) continue;
    if (!(a.z < b.z + b.hgt - 0.3 && b.z < a.z + a.hgt - 0.3)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
    if (d >= m || d < 1e-6) continue;
    const nx = dx / d, ny = dy / d, pen = m - d, tm = a.mass + b.mass;
    const ax = a.x - nx * pen * (b.mass / tm), ay = a.y - ny * pen * (b.mass / tm);
    const bx = b.x + nx * pen * (a.mass / tm), by = b.y + ny * pen * (a.mass / tm);
    if (!blockedAt(a, ax, ay)) { a.x = ax; a.y = ay; }
    if (!blockedAt(b, bx, by)) { b.x = bx; b.y = by; }
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const jm = -(1 + 0.4) * rv / (1 / a.mass + 1 / b.mass);
      a.vx -= jm * nx / a.mass; a.vy -= jm * ny / a.mass;
      b.vx += jm * nx / b.mass; b.vy += jm * ny / b.mass;
      if (-rv > 1.5) Sfx.play('bump', Math.min(1, -rv / 6));
    }
  }
}

/* ---------------- Fire, ice & world updates ---------------- */
function ignite(c, direct) {
  if (!c || c.void) return;
  if (c.feat === 'bramble' && !c.burn) { c.burn = 1; c.burnT = 0; c.spread = false; if (!direct) Sfx.play('catch'); }
  if (c.feat === 'brazier' && !c.lit) { c.lit = true; Sfx.play('kindle'); burst(c.x + 0.5, c.y + 0.5, c.h + 0.9, '#ffb060', 24, 3); }
  if (c.feat === 'iceblock' && !c.melting) { c.melting = true; }
  if (c.water != null && c.ice) { c.ice = false; steam(c.x + 0.5, c.y + 0.5, c.water, 14); }
  if (c.frost > 0) { c.frost = 0; steam(c.x + 0.5, c.y + 0.5, c.h, 6); }
  if (c.icy) { const pv = c.icyBase || { th: c.th - 1 }; c.icy = false; if (pv.void) { c.th = -4; c.meltToVoid = true; } else c.th = pv.th; steam(c.x + .5, c.y + .5, c.h, 18); Sfx.play('catch'); }
  for (const b of World.bodies) if (b.alive && b.burnable && !b.burn && Math.floor(b.x) === c.x && Math.floor(b.y) === c.y) { b.burn = 0.001; b.spread = false; }
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function updateCells(dt) {
  for (const c of World.cells) {
    if (c.h !== c.th) {
      const d = c.th - c.h, st = Math.sign(d) * Math.min(Math.abs(d), dt * (c.h < -0.5 && c.th >= 0 ? 6 : 2.6));
      c.h += st;
      if (c.meltToVoid && c.h <= -3.9) { c.void = true; c.meltToVoid = false; }
      if (Math.random() < dt * 30) emit({ x: c.x + Math.random(), y: c.y + (Math.random() < .5 ? 1 : Math.random()), z: c.h - Math.random() * 0.5, vz: -0.5, vx: 0, vy: 0, life: 0.8, size: 2 + Math.random() * 2, color: '#8a7a68', kind: 'chunk', grav: 12 });
    }
    if (c.burn) {
      c.burnT += dt / 1.5;
      if (Math.random() < dt * 26) flameP(c.x + 0.2 + Math.random() * 0.6, c.y + 0.2 + Math.random() * 0.6, c.h + featH(c) * Math.random());
      if (!c.spread && c.burnT > 0.32) {
        c.spread = true;
        for (const [dx, dy] of N4) ignite(cellI(c.x + dx, c.y + dy), false);
      }
      if (c.burnT >= 1) { c.feat = null; c.burn = 0; c.ash = 1; smoke(c.x + 0.5, c.y + 0.5, c.h + 0.3, 8); }
    }
    if (c.melting) {
      c.melt = Math.min(1, c.melt + dt / 0.9);
      if (Math.random() < dt * 20) steam(c.x + Math.random(), c.y + Math.random(), c.h + 0.9 * (1 - c.melt), 1);
      if (c.melt >= 1) { c.feat = null; c.melting = false; c.wet = 1; }
    }
    if (c.feat === 'gate' && World.gateOpen && c.open < 1) {
      c.open = Math.min(1, c.open + dt / 1.6);
      if (Math.random() < dt * 30) dust(c.x + Math.random(), c.y + Math.random(), c.h, 1);
    }
    if (c.wet > 0) c.wet = Math.max(0, c.wet - dt * 0.05);
  }
  // gate check
  if (!World.gateOpen && World.braziers.length && World.braziers.every(b => b.lit) && World.cells.some(c => c.feat === 'gate')) {
    World.gateOpen = true; Sfx.play('gate'); Game.toast('Every brazier burns — the rune gate yields.');
    cam.shake = 0.5;
  }
  // burning bodies
  for (const b of World.bodies) {
    if (!b.alive || !b.burn) continue;
    const c = cellAt(b.x, b.y);
    if (c && c.water != null && !c.ice && b.z < c.water + 0.1) { b.burn = 0; steam(b.x, b.y, b.z + 0.5, 8); continue; }
    b.burn += dt / 2;
    if (Math.random() < dt * 30) flameP(b.x + (Math.random() - .5) * 0.7, b.y + (Math.random() - .5) * 0.7, b.z + Math.random() * b.hgt);
    if (!b.spread && b.burn > 0.4) { b.spread = true; const cx = Math.floor(b.x), cy = Math.floor(b.y); for (const [dx, dy] of N4) ignite(cellI(cx + dx, cy + dy), false); }
    if (b.burn >= 1) { b.alive = false; smoke(b.x, b.y, b.z + 0.4, 14); for (let i = 0; i < 20; i++) emit({ x: b.x, y: b.y, z: b.z + 0.3, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, vz: Math.random() * 3, grav: 6, life: 1.4, size: 2, color: '#ff8a3a', kind: 'glow' }); }
  }
}

function worldStep(dt) {
  World.t += dt;
  for (let i = World.pending.length - 1; i >= 0; i--) {
    const p = World.pending[i]; p.t -= dt;
    if (p.t <= 0) { World.pending.splice(i, 1); p.fn(); }
  }
  updateCells(dt);
  for (const b of World.bodies) stepBody(b, dt);
  collideBodies();
  updateWisps(dt);
  World.bodies = World.bodies.filter(b => b.alive || b.kind === 'orb');
  for (let i = World.respawns.length - 1; i >= 0; i--) {
    const r = World.respawns[i]; r.t -= dt;
    if (r.t <= 0) {
      World.respawns.splice(i, 1);
      const b = r.b; Object.assign(b, { x: b.home.x, y: b.home.y, z: b.home.z + 1.2, vx: 0, vy: 0, vz: 0, alive: true, lev: 0, drift: null, captured: false });
      for (let k = 0; k < 40; k++) { const a = Math.random() * TAU, rr = 0.8 + Math.random(); emit({ x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr, z: b.z + Math.random(), vx: -Math.cos(a) * rr * 2, vy: -Math.sin(a) * rr * 2, life: 0.5, size: 4, color: '#ffd27a', kind: 'glow' }); }
      Sfx.play('reform');
    }
  }
}

/* ---------------- Spells ---------------- */
const BASE_R = { gale: 1.6, stone: 0, flame: 1.3, tide: 1.4, frost: 1.5, luna: 1.4 };
function spellRadius(sp) {
  let r = BASE_R[sp.sigil];
  if (sp.sigil === 'luna') return r; // Luna's reach is fixed: its outer circle lengthens the float instead, and its sign only aims its ring
  if (sp.radial) r += 0.35 * sp.s;
  if (sp.amp) r *= 1.5;
  if (sp.reach && r > 0) r += sp.reach * 0.5;
  return r;
}
// how long Luna holds a thing aloft (v62): only the outer circle changes it, doubling the float. Luna's sign and barbs
// never touch Luna itself: they aim, and give strength to, whatever rides on its ring
// v63: the float is a distance — a lifted thing hangs where it rose until moved, and settles once carried this far
const LUNA_RANGE = 10, LUNA_RANGE_RING = 20;
function lunaRange(sp) { return sp.amp ? LUNA_RANGE_RING : LUNA_RANGE; }
// The placing sigils — Petra, Ignis, Gelu and Unda — all set their element by the same shapes (petraShape):
// bare, a single tile (3×3 with the outer ring); each sign its own arm — a line, a line through the mark,
// or the ground between two signs at right angles. (Unda's signs also still make a current, along their averaged way.)
// isLine: Ignis, Gelu and Unda, which are placed by shape rather than spread by a radius.
function isLine(sp) { return sp.sigil === 'flame' || sp.sigil === 'frost' || sp.sigil === 'tide'; }
// the bodies a spell touches: those on its placed tiles (or right at the mark), else those within its radius
function spellBodies(sp, tx, ty) {
  if (!isLine(sp)) return bodiesInRadius(tx, ty, spellRadius(sp));
  const set = new Set(spellCells(sp, tx, ty).map(([x, y]) => x + ',' + y));
  return World.bodies.filter(b => b.alive && (set.has(Math.floor(b.x) + ',' + Math.floor(b.y)) || Math.hypot(b.x - tx, b.y - ty) <= 0.7));
}
function placedArms(sp) { return sp.arms && sp.arms.length ? sp.arms : sp.dir ? [{ x: sp.dir.x, y: sp.dir.y, f: sp.s }] : []; }
function spellCells(sp, tx, ty) {
  const ix = Math.floor(tx), iy = Math.floor(ty), out = [];
  if (isLine(sp) || sp.sigil === 'stone') {
    // (older spells without arms fall back to their averaged direction)
    const arms = placedArms(sp);
    // (applySpell sets sp.reach; before the cast — the aim preview — it is worked out the same way)
    const reach = sp.reach != null ? sp.reach : placeReach(sp);
    for (const [x, y] of petraShape(arms, sp.amp, arms.length ? reach : 0).cells) out.push([ix + x, iy + y]);
  } else {
    const R = spellRadius(sp);
    for (let y = Math.floor(ty - R) - 1; y <= ty + R + 1; y++) for (let x = Math.floor(tx - R) - 1; x <= tx + R + 1; x++)
      if (Math.hypot(x + 0.5 - tx, y + 0.5 - ty) <= R) out.push([x, y]);
  }
  const seen = new Set();
  return out.filter(([x, y]) => x >= 0 && y >= 0 && x < World.W && y < World.H && !seen.has(x + ',' + y) && seen.add(x + ',' + y));
}
function bodiesInRadius(tx, ty, R) { return World.bodies.filter(b => b.alive && Math.hypot(b.x - tx, b.y - ty) <= R + b.r * 0.5); }

function castSpell(sp, tx, ty, tz) {
  World.seals.push({ sp, x: tx, y: ty, z: tz, t: 0, R: Math.max(0.9, spellRadius(sp) || 0.8) });
  Sfx.play('cast'); Sfx.play(sp.sigil, sp);
  for (const s of sp.sats || []) setTimeout(() => Sfx.play(s.id, sp), 120);
  World.pending.push({ t: 0.42, fn: () => applySpell(sp, tx, ty, tz) });
}
function baseSpell(sp, tx, ty, tz, out) {
  const col = sp.color;
  const p = Math.max(1, sp.s); // strength comes from barbs alone; the ring only widens
  switch (sp.sigil) {
    case 'gale': {
      const R = spellRadius(sp), mag = 3 + 3 * p;
      for (const b of bodiesInRadius(tx, ty, R)) {
        if (b.captured) continue;
        let dx, dy;
        if (sp.dir) { dx = sp.dir.x; dy = sp.dir.y; }
        else { dx = b.x - tx; dy = b.y - ty; const L = Math.hypot(dx, dy); if (L < 0.05) { const a = Math.random() * TAU; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= L; dy /= L; } }
        const fall = 1 - 0.25 * Math.min(1, Math.hypot(b.x - tx, b.y - ty) / Math.max(R, 0.1));
        const dv = mag * fall / Math.pow(effMass(b), 0.7);
        b.vx += dx * dv; b.vy += dy * dv; b.vz += 1.2;
        out.bodies.push(b);
      }
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * TAU, r = Math.random() * R;
        let vx, vy;
        if (sp.dir) { vx = sp.dir.x * (5 + Math.random() * 5); vy = sp.dir.y * (5 + Math.random() * 5); }
        else { vx = Math.cos(a) * (3 + Math.random() * 5); vy = Math.sin(a) * (3 + Math.random() * 5); }
        emit({ x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, z: tz + 0.1 + Math.random() * 1.2, vx, vy, vz: (Math.random() - 0.3) * 1.5, drag: 1.4, life: 0.6 + Math.random() * 0.6, size: 1.6, color: i % 4 ? '#e8fff6' : col, kind: 'streak' });
      }
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU;
        emit({ x: tx + Math.cos(a) * 0.5, y: ty + Math.sin(a) * 0.5, z: tz + 0.2, vx: (sp.dir ? sp.dir.x * 4 : Math.cos(a) * 3) + (Math.random() - .5) * 2, vy: (sp.dir ? sp.dir.y * 4 : Math.sin(a) * 3) + (Math.random() - .5) * 2, vz: 1 + Math.random() * 2, grav: 2, drag: 1, life: 1.6, size: 3, color: Math.random() < .5 ? '#9fbf5a' : '#d8b24a', kind: 'leaf', vr: (Math.random() - .5) * 12 });
      }
      ring(tx, ty, tz, col, R);
      break;
    }
    case 'stone': {
      const cells = spellCells(sp, tx, ty);
      for (const [x, y] of cells) {
        const c = cellI(x, y);
        if (c.feat === 'brazier' || c.feat === 'gate' || c.feat === 'font') continue;
        out.prev.set(c, { th: c.th, void: c.void });
        if (c.void) { c.void = false; c.h = -4; c.th = 0; c.water = null; c.ice = false; c.flow = null; }
        else {
          c.th = Math.min(3, Math.round(c.th) + 1);
          if (c.water != null && c.th >= c.water) { c.water = null; c.ice = false; c.flow = null; splash(x + 0.5, y + 0.5, c.h + 0.5, 10); }
        }
        for (let i = 0; i < 10; i++) emit({ x: x + Math.random(), y: y + Math.random(), z: c.th + 0.1, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, vz: 2 + Math.random() * 4, grav: 18, life: 1.2, size: 2 + Math.random() * 3, color: Math.random() < .5 ? '#9a8a74' : '#6e6258', kind: 'chunk', vr: (Math.random() - .5) * 10 });
        dust(x + 0.5, y + 0.5, Math.max(0, c.th), 8);
      }
      cam.shake = Math.max(cam.shake, 0.35);
      break;
    }
    case 'flame': {
      const cells = spellCells(sp, tx, ty);
      for (const [x, y] of cells) {
        const c = cellI(x, y);
        ignite(c, true);
        const z = c.void ? tz : surfaceTop(c);
        for (let i = 0; i < 16; i++) flameP(x + Math.random(), y + Math.random(), z + Math.random() * 0.4, 1.6);
        for (let i = 0; i < 4; i++) emit({ x: x + 0.5, y: y + 0.5, z: z + 0.2, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, vz: 3 + Math.random() * 3, grav: 4, life: 1.5, size: 2, color: '#ffcf70', kind: 'glow' });
      }
      ring(tx, ty, tz, col, spellRadius(sp) || 1);
      break;
    }
    case 'tide': {
      const R = spellRadius(sp);
      const shape = spellCells(sp, tx, ty), cells = shape.map(([x, y]) => cellI(x, y)).filter(c => !c.void);
      // the signs only shape the water; it flows only with Ventus on the ring (tideCurrent)
      const cur = tideCurrent(sp) ? sp.dir : null;
      out.cells.push(...floodAt(cells, cur, sp.s, shape.length)); // one tile of water for each tile of the shape
      for (const c of cells) {
        if (c.burn) { c.burn = 0; steam(c.x + .5, c.y + .5, c.h + .5, 8); }
        if (c.feat === 'brazier' && c.lit) { /* braziers are hooded; water does not reach them */ }
        c.frost = 0; c.wet = 1;
        if (cur && c.water != null && !c.ice) c.flow = { x: cur.x, y: cur.y, s: 1.2 + 0.9 * sp.s };
      }
      for (const b of spellBodies(sp, tx, ty)) {
        if (b.captured) continue;
        if (b.burn) { b.burn = 0; steam(b.x, b.y, b.z + .4, 8); }
        if (cur) { const dv = (1.5 + 1.5 * p) / Math.pow(effMass(b), 0.7); b.vx += sp.dir.x * dv; b.vy += sp.dir.y * dv; out.bodies.push(b); }
      }
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * TAU, r = Math.random() * R, sp2 = 1 + Math.random() * 3;
        emit({ x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, z: tz + 0.1, vx: Math.cos(a) * sp2 + (cur ? cur.x * 3 : 0), vy: Math.sin(a) * sp2 + (cur ? cur.y * 3 : 0), vz: 2 + Math.random() * 4, grav: 14, life: 1.1, size: 2 + Math.random() * 2, color: Math.random() < .5 ? '#9fd6ff' : '#e8f6ff', kind: 'drop' });
      }
      ring(tx, ty, tz, col, R); ring(tx, ty, tz, '#e8f6ff', R * 0.6);
      break;
    }
    case 'frost': {
      const cells = spellCells(sp, tx, ty);
      for (const [x, y] of cells) {
        const c = cellI(x, y);
        if (c.void) continue;
        freezeCell(c);
        const z = surfaceTop(c);
        for (let i = 0; i < 8; i++) emit({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random() * 1.2, vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6, vz: -0.3 - Math.random() * 0.5, life: 1.8, size: 3 + Math.random() * 2, color: '#ffffff', kind: 'flake', vr: (Math.random() - .5) * 3 });
        for (let i = 0; i < 4; i++) emit({ x: x + Math.random(), y: y + Math.random(), z: z + 0.05, vx: 0, vy: 0, vz: 1 + Math.random() * 2, grav: 3, life: 0.9, size: 3, color: '#bfeeff', kind: 'shard', vr: (Math.random() - .5) * 8 });
        for (const b of World.bodies) {
          if (!b.alive || Math.floor(b.x) !== x || Math.floor(b.y) !== y) continue;
          if (b.burn) { b.burn = 0; steam(b.x, b.y, b.z + .4, 8); }
          if (c.water != null && b.z < c.water + 0.2 && !b.captured) { b.z = Math.max(c.h, c.water); b.vx = b.vy = b.vz = 0; }
        }
      }
      ring(tx, ty, tz, col, spellRadius(sp) || 1);
      break;
    }
    case 'luna': {
      const R = spellRadius(sp);
      for (const b of bodiesInRadius(tx, ty, R)) {
        if (b.captured) continue;
        b.lev = 1e6; b.levRange = lunaRange(sp); b.levAge = 0; b.levUntilStop = false; // (1e6, not Infinity: rewind snapshots are JSON)
        out.bodies.push(b);
        b.drift = null; b.vx *= 0.3; b.vy *= 0.3; // Luna lifts; it does not lead — only wind or water moves what it holds
        b.vz += 3;
        for (let i = 0; i < 26; i++) { const a = Math.random() * TAU; emit({ x: b.x + Math.cos(a) * 0.5, y: b.y + Math.sin(a) * 0.5, z: b.z, vx: -Math.cos(a) * 0.4, vy: -Math.sin(a) * 0.4, vz: 1.5 + Math.random() * 2, drag: 1.5, life: 1.4, size: 5, color: '#d8c2ff', kind: 'glow' }); }
      }
      for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, r = Math.random() * R; emit({ x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, z: tz, vx: 0, vy: 0, vz: 0.8 + Math.random() * 2, life: 1.8, size: 4, color: Math.random() < .5 ? '#cdb0ff' : '#fff2c0', kind: 'glow' }); }
      ring(tx, ty, tz, col, R);
      break;
    }
  }
}

/* flood the deepest enclosed hollow among the given cells; returns the flooded cells */
/* Unda's water has volume: each tile of its shape brings one tile of water, one step deep. The water runs to the lowest
   place among those tiles and spreads over that hollow's whole floor, so the level rises by volume ÷ floor area; anything
   above the rim spills away. Water poured onto a standing pool raises it the same way. Returns the cells it filled. */
/* where the water would go, without pouring it (floodAt pours it; the aim preview shows it first):
   the pool's floor, its level, the rim, and whether it runs off instead */
function planFlood(cells, vol) {
  const cands = cells.filter(c => c && !c.void && !c.feat && !c.ice).sort((a, b) => (a.water ?? a.h) - (b.water ?? b.h));
  if (!cands.length || vol <= 0) return null;
  const s0 = cands[0], wet = s0.water != null, h0 = wet ? s0.water : s0.h, region = [s0], seen = new Set([s0]);
  // the pool's floor: dry tiles at the same height, or the tiles of the same standing water
  const same = n => !n.feat && !n.ice && (wet ? n.water != null && Math.abs(n.water - h0) < 0.01 : n.water == null && Math.abs(n.h - h0) < 0.01);
  let rim = Infinity, spill = false;
  for (let i = 0; i < region.length && region.length < 60; i++) {
    const c = region[i];
    for (const [dx, dy] of N4) {
      const n = cellI(c.x + dx, c.y + dy);
      if (!n || n.void) { spill = true; continue; }
      if (seen.has(n)) continue;
      if (same(n)) { seen.add(n); region.push(n); }
      else { const t = solidTop(n); if ((n.water ?? n.h) < h0 - 0.01) spill = true; else rim = Math.min(rim, n.water != null ? Math.max(n.h, n.water) : t); }
    }
  }
  const ok = !spill && rim > h0 + 0.05 && rim < Infinity, want = h0 + vol / region.length;
  return { s0, wet, h0, region, rim, spill, ok, want, lvl: Math.min(rim, want) };
}
function floodAt(cells, dir, s, vol = cells.length) {
  const P = planFlood(cells, vol);
  if (!P) return [];
  const { s0, region, rim, spill, want, lvl } = P;
  if (P.ok) {
    for (const c of region) { c.water = lvl; c.ice = false; c.frost = 0; if (dir) c.flow = { x: dir.x, y: dir.y, s: 1.2 + 0.9 * s }; splash(c.x + 0.5, c.y + 0.5, lvl, 10); }
    if (want > rim + 0.3) Game.toast('The hollow brims over — the extra water spills away.');
    return region;
  }
  if (spill && s0.h < 0) Game.toast('The water spills away — that hollow cannot hold it.');
  return [];
}

/* ---------- compound seals: the centre acts first, then each ring-sigil in turn ---------- */
function applySpell(sp, tx, ty, tz) {
  const inf = (sp.sats || []).slice().sort((a, b) => a.order - b.order);
  const cnt = id => inf.filter(s => s.id === id).reduce((a, s) => a + s.n, 0);
  const mover = sp.sigil === 'gale' || sp.sigil === 'luna' || tideCurrent(sp);
  if (cnt('gale') && !mover) sp = { ...sp, reach: 2 * cnt('gale') };
  // Petra shapes the stone and Luna on its ring makes it float in place; Luna at the centre with Petra on the ring is a ferry that sails along the sign
  if (sp.sigil === 'stone' && cnt('luna')) return spawnSlabs(sp, tx, ty, tz, cnt('luna'));
  if (sp.sigil === 'luna' && cnt('stone')) return spawnFerry(sp, tx, ty, tz, cnt('stone'), cnt('gale'));
  // the ferry (v60): Ventus at the centre with Luna and Petra both on its ring at once (behind the sign) raises a
  // floating slab beneath what you touch, and the wind sails it the way of the sign, rider and all
  const now = id => inf.filter(s => s.id === id && s.rel === 'now').reduce((a, s) => a + s.n, 0);
  if (sp.sigil === 'gale' && sp.dir && now('stone') && now('luna')) return spawnFerry(sp, tx, ty, tz, now('stone'), 1, now('luna'));
  if ((sp.sigil === 'flame' || sp.sigil === 'frost') && cnt('luna')) return spawnWisps(sp, tx, ty, tz, cnt('luna'));
  const out = { bodies: [], cells: [], prev: new Map() };
  baseSpell(sp, tx, ty, tz, out);
  const cells = [...new Set([...spellCells(sp, tx, ty).map(([x, y]) => cellI(x, y)), ...out.cells])].filter(Boolean);
  for (const s of inf) {
    if (mover && out.bodies.length) { for (const b of out.bodies) infuseBody(b, s, sp); continue; }
    infuseCells(s, cells, sp, tx, ty, tz, out);
  }
}
function bodiesOn(cells) { const set = new Set(cells); return World.bodies.filter(b => b.alive && !b.captured && set.has(cellAt(b.x, b.y))); }
function infuseBody(b, s, sp) {
  if (b.captured) return;
  const T = 3 + 2 * s.n, col = SIGILS[s.id].color;
  for (let i = 0; i < 18; i++) { const a = Math.random() * TAU; emit({ x: b.x + Math.cos(a) * 0.4, y: b.y + Math.sin(a) * 0.4, z: b.z + 0.3, vx: -Math.cos(a), vy: -Math.sin(a), vz: 1, drag: 2, life: 0.8, size: 4, color: col, kind: 'glow' }); }
  if (s.rel === 'arrive') {
    // on Luna, a sigil ahead of the sign waits for the landing; it keeps Luna's sign (its way) and barbs (its strength)
    const luna = sp.sigil === 'luna' && sp.dir;
    b.arrive = (b.arrive || []).concat([{ id: s.id, n: luna ? Math.max(s.n, sp.s) : s.n, dir: luna ? sp.dir : null }]); b.arriveT = 0; return;
  }
  const until = s.rel === 'along';
  switch (s.id) {
    case 'gale': {
      // Ventus on Luna's ring bears the lifted thing along the sign
      if (sp.sigil === 'luna') { if (sp.dir) { const v = (0.7 + 0.7 * sp.s) * (1 + 0.4 * (s.n - 1)); b.drift = { x: sp.dir.x * v, y: sp.dir.y * v }; } break; }
      const dx = sp.dir ? sp.dir.x : b.vx, dy = sp.dir ? sp.dir.y : b.vy, L = Math.hypot(dx, dy) || 1, dv = 2.5 * s.n / Math.pow(effMass(b), 0.7);
      b.vx += dx / L * dv; b.vy += dy / L * dv; break;
    }
    case 'luna': b.lev = Math.max(b.lev, T); b.levAge = 0; b.levUntilStop = until; if (sp.sigil !== 'luna') b.drift = null; b.vz += 2; break;
    default: b.imb = b.imb || {}; b.imb[s.id] = { t: T, n: s.n, untilStop: until, age: 0 };
  }
}
function infuseCells(s, cells, sp, tx, ty, tz, out) {
  const n = s.n;
  switch (s.id) {
    case 'gale':
      for (const b of bodiesOn(cells)) {
        let dx = sp.dir ? sp.dir.x : b.x - tx, dy = sp.dir ? sp.dir.y : b.y - ty; const L = Math.hypot(dx, dy) || 1;
        const dv = (2 + 2 * n) / Math.pow(effMass(b), 0.7); b.vx += dx / L * dv; b.vy += dy / L * dv; b.vz += 1;
      }
      break;
    case 'luna': // e.g. Unda + Luna: a bubble that lifts whatever it holds
      for (const b of bodiesOn(cells)) {
        b.lev = Math.max(b.lev, 3 + 2 * n); b.levAge = 0; b.levUntilStop = false; b.vz += 2;
        b.drift = sp.dir ? { x: sp.dir.x * (0.8 + 0.5 * n), y: sp.dir.y * (0.8 + 0.5 * n) } : null;
        for (let i = 0; i < 12; i++) emit({ x: b.x, y: b.y, z: b.z + 0.3, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, vz: 1 + Math.random(), drag: 2, life: 1.2, size: 6, color: '#cfe8ff', kind: 'glow' });
      }
      break;
    case 'flame':
      for (const c of cells) { ignite(c, true); const z = c.void ? tz : surfaceTop(c); for (let i = 0; i < 6; i++) flameP(c.x + Math.random(), c.y + Math.random(), z + 0.2, 1.3); }
      break;
    case 'frost':
      if (sp.sigil === 'stone') { for (const [c, pv] of out.prev) { c.icy = true; c.icyBase = pv; } }
      else cells.forEach(freezeCell);
      for (const c of cells) for (let i = 0; i < 4; i++) emit({ x: c.x + Math.random(), y: c.y + Math.random(), z: surfaceTop(c) + Math.random(), vz: -0.4, life: 1.5, size: 3, color: '#ffffff', kind: 'flake', vr: 3 });
      break;
    case 'tide':
      out.cells.push(...floodAt(cells, sp.dir, sp.s));
      cells.forEach(douseCell);
      for (const c of cells) splash(c.x + 0.5, c.y + 0.5, surfaceTop(c), 3);
      break;
    case 'stone': {
      const c = cellAt(tx, ty);
      if (c && !c.feat) {
        if (c.void) { c.void = false; c.h = -4; c.th = 0; c.water = null; c.flow = null; }
        else c.th = Math.min(3, Math.round(c.th) + n);
        dust(c.x + .5, c.y + .5, Math.max(0, c.th), 8);
      }
      break;
    }
  }
}
/* a floating stone slab on one tile (drift: how it sails, or null to hang in place) */
function raiseSlab(x, y, tz, T, drift) {
  const c = cellI(x, y);
  if (!c || (c.feat && c.feat !== 'font')) return;
  const z = c.void ? tz : surfaceTop(c);
  const b = makeBody('slab', x + 0.5, y + 0.5, z);
  Object.assign(b, { lev: T, levAge: 0, hover: z, drift });
  World.bodies.push(b);
  for (let i = 0; i < 14; i++) emit({ x: x + Math.random(), y: y + Math.random(), z: z - 0.4, vx: 0, vy: 0, vz: 1 + Math.random() * 2, life: 1.2, size: 4, color: i % 2 ? '#cdb0ff' : '#c8bca8', kind: 'glow' });
}
/* Petra + Luna on the ring: Petra's shape, raised as stone that floats where it stands */
function spawnSlabs(sp, tx, ty, tz, n) {
  for (const [x, y] of spellCells(sp, tx, ty)) raiseSlab(x, y, tz, 6 + 2 * n, null);
  ring(tx, ty, tz, '#cdb0ff', 1.1); cam.shake = Math.max(cam.shake, 0.15);
}
/* Luna + Petra on the ring: a floating slab beneath the target, riders and all — and with Ventus on the ring too, it sails the way of the sign */
function spawnFerry(sp, tx, ty, tz, n, gale = 0, luna = 0) {
  // it floats 6s, +2s for each Petra and each extra Luna; the wind's barbs set how fast it sails
  const T = 6 + 2 * n + 2 * Math.max(0, luna - 1), v = sp.dir && gale ? (0.8 + 0.6 * sp.s) * (1 + 0.4 * (gale - 1)) : 0, drift = v ? { x: sp.dir.x * v, y: sp.dir.y * v } : null;
  const ix = Math.floor(tx), iy = Math.floor(ty);
  const tiles = sp.amp ? [-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => [ix + a, iy + b])) : [[ix, iy]];
  for (const [x, y] of tiles) if (x >= 0 && y >= 0 && x < World.W && y < World.H) raiseSlab(x, y, tz, T, drift && { ...drift });
  ring(tx, ty, tz, '#cdb0ff', sp.amp ? 1.8 : 1.1); cam.shake = Math.max(cam.shake, 0.15);
}
/* Ignis / Gelu + Luna: a drifting wisp that carries the element along the signs, over walls */
function spawnWisps(sp, tx, ty, tz, n) {
  const len = 4 + 2 * n + (sp.reach || 0);
  const dirs = sp.dir ? [[sp.dir.x, sp.dir.y]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) World.wisps.push({ el: sp.sigil, x: tx, y: ty, z: tz + 0.9, ground: tz, dx, dy, left: len, key: '' });
  ring(tx, ty, tz, SIGILS[sp.sigil].color, 1);
}
function updateWisps(dt) {
  for (let i = World.wisps.length - 1; i >= 0; i--) {
    const w = World.wisps[i];
    w.x += w.dx * 3 * dt; w.y += w.dy * 3 * dt;
    const c = cellAt(w.x, w.y);
    if (c && !c.void) w.ground = Math.max(solidTop(c), floorTop(c));
    w.z += (w.ground + 0.9 - w.z) * Math.min(1, dt * 6);
    const key = c ? c.x + ',' + c.y : '';
    if (c && key !== w.key) { w.key = key; w.left--; if (w.el === 'flame') ignite(c, true); else freezeCell(c); }
    if (w.el === 'flame') { flameP(w.x, w.y, w.z, 1); if (Math.random() < 0.5) flameP(w.x, w.y, w.z, 1); }
    else { emit({ x: w.x, y: w.y, z: w.z, vz: -0.3, life: 1.2, size: 3, color: '#ffffff', kind: 'flake', vr: 3 }); emit({ x: w.x, y: w.y, z: w.z, life: 0.4, size: 7, color: '#bfeeff', kind: 'glow' }); }
    if (!c || w.left <= 0) { World.wisps.splice(i, 1); burst(w.x, w.y, w.z, w.el === 'flame' ? '#ffb060' : '#dff6ff', 16, 2); }
  }
}

/* ---------------- Particles ---------------- */
const parts = [];
const MAXP = 3000;
let smokeN = 0;
function emit(o) {
  if (parts.length >= MAXP) return;
  if (o.kind === 'smoke') { if (smokeN >= 36) return; smokeN++; }
  parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 4, color: '#fff', kind: 'glow', grav: 0, drag: 0, rot: Math.random() * TAU, vr: 0, ...o });
}
function flameP(x, y, z, k = 1) {
  emit({ x, y, z, vx: (Math.random() - .5) * 0.4, vy: (Math.random() - .5) * 0.4, vz: 1.2 + Math.random() * 1.6 * k, drag: 1, life: 0.5 + Math.random() * 0.5, size: 7 + Math.random() * 6, color: Math.random() < 0.5 ? '#ff7a2a' : '#ffb347', kind: 'fire' });
  if (Math.random() < 0.25) emit({ x, y, z: z + 0.3, vx: (Math.random() - .5), vy: (Math.random() - .5), vz: 2 + Math.random() * 2, drag: 0.5, life: 1.2, size: 1.6, color: '#ffd08a', kind: 'glow' });
  if (Math.random() < 0.12) smoke(x, y, z + 0.6, 1);
}
function smoke(x, y, z, n) { for (let i = 0; i < n; i++) emit({ x: x + (Math.random() - .5) * .5, y: y + (Math.random() - .5) * .5, z, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, vz: 0.6 + Math.random() * 0.8, drag: 0.6, life: 1.6 + Math.random(), size: 8 + Math.random() * 8, color: '#3a3040', kind: 'smoke' }); }
function steam(x, y, z, n) { for (let i = 0; i < n; i++) emit({ x: x + (Math.random() - .5) * .6, y: y + (Math.random() - .5) * .6, z, vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4, vz: 0.8 + Math.random(), drag: 0.8, life: 1.2 + Math.random(), size: 8 + Math.random() * 8, color: '#e8eef8', kind: 'smoke' }); }
function dust(x, y, z, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; emit({ x: x + Math.cos(a) * .3, y: y + Math.sin(a) * .3, z: z + 0.05, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vz: 0.3 + Math.random() * 0.5, drag: 2.5, life: 0.9 + Math.random() * .5, size: 6 + Math.random() * 6, color: '#b8a88a', kind: 'smoke' }); } }
function splash(x, y, z, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; emit({ x, y, z, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vz: 2 + Math.random() * 3, grav: 14, life: 0.9, size: 2 + Math.random() * 2, color: '#bfe6ff', kind: 'drop' }); } }
function burst(x, y, z, col, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; emit({ x, y, z, vx: Math.cos(a) * sp * Math.random(), vy: Math.sin(a) * sp * Math.random(), vz: Math.random() * sp, drag: 2, life: 0.8 + Math.random() * .6, size: 4, color: col, kind: 'glow' }); } }
function ring(x, y, z, col, R) { emit({ x, y, z: z + 0.03, life: 0.8, size: R, color: col, kind: 'ring' }); }
function updateParticles(dt) {
  smokeN = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    if (p.kind === 'smoke') smokeN++;
    if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
    p.vz -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
    if ((p.kind === 'chunk' || p.kind === 'drop' || p.kind === 'leaf') && p.vz < 0) {
      const t = floorTop(cellAt(p.x, p.y));
      if (p.z < t && p.z > t - 0.4) {
        if (p.kind === 'drop') { p.age = p.life; }
        else { p.z = t; p.vz = -p.vz * 0.3; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; }
      }
    }
  }
}
const glowCache = {};
function glowSprite(col) {
  if (glowCache[col]) return glowCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, hexA(col, 0.9)); gr.addColorStop(0.5, hexA(col, 0.25)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowCache[col] = c;
}
const softCache = {};
function softSprite(col) {
  if (softCache[col]) return softCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(0.6, hexA(col, 0.2)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return softCache[col] = c;
}
function drawParticles(g, additivePass) {
  const s = cam.s;
  for (const p of parts) {
    const add = p.kind === 'glow' || p.kind === 'fire' || p.kind === 'streak' || p.kind === 'ring' || p.kind === 'rune';
    if (add !== additivePass) continue;
    const t = p.age / p.life, a = 1 - t;
    const [sx, sy] = proj(p.x, p.y, p.z);
    switch (p.kind) {
      case 'glow': { const r = p.size * s * (0.4 + a * 0.8); g.globalAlpha = a; g.drawImage(glowSprite(p.color), sx - r * 2, sy - r * 2, r * 4, r * 4); break; }
      case 'fire': { const r = p.size * s * (0.3 + 0.9 * (1 - t * t)); g.globalAlpha = a * 0.75; g.drawImage(glowSprite(t < 0.5 ? p.color : '#c0381a'), sx - r, sy - r * 1.3, r * 2, r * 2.4); break; }
      case 'streak': {
        const [ex, ey] = proj(p.x - p.vx * 0.07, p.y - p.vy * 0.07, p.z - p.vz * 0.07);
        g.globalAlpha = a * 0.7; g.strokeStyle = p.color; g.lineWidth = p.size * s; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); break;
      }
      case 'ring': {
        const R = p.size * (0.3 + ease(t) * 0.9);
        g.globalAlpha = a * 0.9; g.strokeStyle = p.color; g.lineWidth = 2.5 * s * a + 0.5;
        g.beginPath(); g.ellipse(sx, sy, R * TW * 0.7071 * s, R * TH * 0.7071 * s, 0, 0, TAU); g.stroke(); break;
      }
      case 'smoke': { const r = p.size * s * (0.6 + t * 1.4); g.globalAlpha = a * 0.5; g.drawImage(softSprite(p.color), sx - r, sy - r, r * 2, r * 2); break; }
      case 'chunk': {
        g.globalAlpha = Math.min(1, a * 3); g.fillStyle = p.color;
        g.save(); g.translate(sx, sy); g.rotate(p.rot); const r = p.size * s;
        g.beginPath(); g.moveTo(-r, -r * .6); g.lineTo(r * .8, -r); g.lineTo(r, r * .5); g.lineTo(-r * .4, r); g.closePath(); g.fill(); g.restore(); break;
      }
      case 'drop': { g.globalAlpha = Math.min(1, a * 2); g.fillStyle = p.color; g.beginPath(); g.arc(sx, sy, p.size * s * 0.6, 0, TAU); g.fill(); break; }
      case 'flake': {
        g.globalAlpha = Math.min(1, a * 2); g.strokeStyle = p.color; g.lineWidth = 1;
        const r = p.size * s; g.save(); g.translate(sx, sy); g.rotate(p.rot);
        g.beginPath(); for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3; g.moveTo(-Math.cos(an) * r, -Math.sin(an) * r); g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.stroke(); g.restore(); break;
      }
      case 'shard': {
        g.globalAlpha = a; g.fillStyle = p.color; const r = p.size * s;
        g.save(); g.translate(sx, sy); g.rotate(p.rot); g.beginPath(); g.moveTo(0, -r * 1.6); g.lineTo(r * .45, 0); g.lineTo(0, r * .6); g.lineTo(-r * .45, 0); g.closePath(); g.fill(); g.restore(); break;
      }
      case 'leaf': {
        g.globalAlpha = Math.min(1, a * 2); g.fillStyle = p.color;
        g.save(); g.translate(sx, sy); g.rotate(p.rot); g.beginPath(); g.ellipse(0, 0, p.size * s, p.size * s * 0.45, 0, 0, TAU); g.fill(); g.restore(); break;
      }
    }
  }
  g.globalAlpha = 1;
}

/* ---------------- Rendering ---------------- */
/* The twilight sky: a cached deep layer (gradient, nebula, dust of stars, sigil constellations) and live layers
   (twinkling stars, the moon, shooting stars, two depths of floating isles, a sea of cloud lit from below, rising motes) */
const SKY = { stars: [], isles: [], sea: [], motes: [], shoot: null, base: null };
(function () {
  const R = mulberry(99);
  for (let i = 0; i < 170; i++) SKY.stars.push({ x: R(), y: R() * 0.7, s: R() * 1.5 + 0.4, ph: R() * TAU, sp: 0.5 + R() * 2, bright: R() < 0.08 });
  // floating isles: small ragged chunks of land. Layer 0: far, hazy, drifting. Layer 1: placed by hand, dressed like a storybook.
  const mkIsle = o => {
    const n = 12, bot = [], tn = 7, tf = [], tb = [];
    const twin = R() < 0.35;
    for (let k = 0; k <= n; k++) {
      const u = k / n, env = Math.sin(u * Math.PI), lobe = twin ? 0.55 + 0.6 * Math.abs(Math.sin(u * Math.PI * 2)) : 1;
      bot.push(Math.max(0.03, (1.15 + R() * 0.4) * Math.pow(env, 1.5) * lobe + (R() - 0.5) * 0.3 * env));
    }
    // the top's outline: few vertices, each pulled in or out, so it reads as a broken chunk rather than a disc
    for (let k = 0; k <= tn; k++) { tf.push(0.6 + R() * 0.5); tb.push(0.55 + R() * 0.55); }
    const roots = []; for (let k = 0; k < 6; k++) roots.push({ u: 0.15 + R() * 0.7, l: 0.2 + R() * 0.6, moss: R() < 0.4 });
    return Object.assign({ ph: R() * TAU, sp: 0.6 + R(), bot, tf, tb, roots, ry: 0.36 + R() * 0.08, feats: [], fall: false, crystal: false }, o);
  };
  for (let i = 0; i < 6; i++) {
    const feats = []; const nf = 1 + Math.floor(R() * 3);
    for (let k = 0; k < nf; k++) feats.push({ type: R() < 0.5 ? 'pine' : R() < 0.6 ? 'tree' : 'pillar', u: (R() - 0.5) * 1.1, v: (R() - 0.5) * 0.7, h: 0.7 + R() * 0.5 });
    SKY.isles.push(mkIsle({ layer: 0, x: R(), y: 0.2 + R() * 0.42, s: 0.3 + R() * 0.35, feats, fall: R() < 0.4 }));
  }
  const F = (type, u, v, h = 1) => ({ type, u, v, h });
  SKY.isles.push(
    mkIsle({ layer: 1, x: 0.075, y: 0.78, s: 1.15, fall: true, feats: [F('arch', -0.25, -0.2, 1.3), F('pillar', 0.35, -0.1, 1.0), F('tree', 0.05, -0.35, 1.25), F('rock', 0.4, 0.3, 0.8), F('bush', -0.45, 0.25, 0.8)] }),
    mkIsle({ layer: 1, x: 0.93, y: 0.76, s: 1.1, fall: true, crystal: true, feats: [F('pillar', -0.45, -0.15, 0.9), F('bigtree', 0.1, -0.1, 1.5), F('bush', 0.45, 0.3, 0.7)] }),
    mkIsle({ layer: 1, x: 0.215, y: 0.43, s: 0.6, fall: true, crystal: true, feats: [F('tower', -0.1, -0.1, 1.3), F('bush', 0.4, 0.2, 0.8)] }),
    mkIsle({ layer: 1, x: 0.6, y: 0.31, s: 0.5, fall: true, feats: [F('pillar', -0.25, -0.1, 1.1), F('pillar', 0.2, -0.15, 0.8), F('bush', 0.1, 0.25, 0.9)] }),
    mkIsle({ layer: 1, x: 0.8, y: 0.22, s: 0.55, fall: true, crystal: true, feats: [F('tree', 0.05, -0.2, 1.3), F('rock', -0.4, 0.2, 0.8)] }),
  );
  for (const I of SKY.isles) I.feats.sort((a, b) => a.v - b.v);
  // the sea of cloud: three bands of puffs
  for (let b = 0; b < 3; b++) for (let i = 0; i < 16; i++) SKY.sea.push({ band: b, x: i / 16 + R() * 0.05, w: 0.12 + R() * 0.12, dy: R() * 0.03 });
  SKY.ribbons = [];
  for (let i = 0; i < 4; i++) SKY.ribbons.push({ y: 0.3 + i * 0.13 + R() * 0.06, a: 0.04 + R() * 0.05, f: 1.5 + R() * 2, f2: 3 + R() * 3, ph: R() * TAU, sp: 0.04 + R() * 0.06, w: 1 + R() * 1.6, al: 0.1 + R() * 0.08 });
  for (let i = 0; i < 28; i++) SKY.motes.push({ x: R(), y: R(), sp: 0.008 + R() * 0.02, sw: R() * TAU, s: 1 + R() * 2, col: R() < 0.6 ? '#ffd9a0' : '#c9b6ff' });
})();
/* A painted backdrop (art/sky-wide.jpg for landscape screens, art/sky-tall.jpg for portrait ones). When one has
   loaded for the screen's shape it replaces the drawn sky's still parts (gradient, nebula, stars, moon, isles,
   cloud sea); the shooting stars, wind ribbons and drifting motes still move over it. A missing file simply
   leaves the drawn sky in place. */
const PAINTED = {};
for (const k of ['wide', 'tall']) {
  if (typeof Image === 'undefined') break;
  const im = new Image();
  im.onload = () => { PAINTED[k] = im; SKY.base = null; };
  im.src = `art/sky-${k}.jpg?v=1`;
}
function paintedSky(w, h) {
  const want = w >= h ? 'wide' : 'tall';
  return PAINTED[want] || PAINTED[want === 'wide' ? 'tall' : 'wide'] || null;
}
/* the deep, unchanging part of the sky, drawn once per screen size */
function skyBase(w, h) {
  if (SKY.base && SKY.base.w === w && SKY.base.h === h) return SKY.base.c;
  const dpr = Math.min(2, typeof DPR !== 'undefined' ? DPR : 1);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d'), R = mulberry(7), m = Math.min(w, h);
  g.scale(dpr, dpr);
  const P = paintedSky(w, h);
  if (P) {
    // Fit the full width when that still fills most of the height, so the moon and corner isles stay in view;
    // the painting sits on the bottom (the cloud sea) and its night sky is carried up to the top of the screen.
    // On a much taller screen it covers instead, cropping the sides.
    const nw = P.naturalWidth, nh = P.naturalHeight;
    const k = Math.max(w / nw, 0.62 * h / nh), pw = nw * k, ph = nh * k;
    const x0 = (w - pw) / 2, y0 = ph >= h ? h - ph + (ph - h) * 0.35 : h - ph;
    g.imageSmoothingQuality = 'high';
    if (y0 > 0) {
      // the night colour of the painting's top edge (its darkest stretch, so the moon's glow doesn't tint it),
      // filled over the gap above it; the painting's top then fades in over that colour
      const band = document.createElement('canvas'); band.width = 8; band.height = 1;
      const bg = band.getContext('2d', { willReadFrequently: true }); bg.imageSmoothingQuality = 'high';
      bg.drawImage(P, 0, 0, nw, Math.max(2, nh * 0.02), 0, 0, 8, 1);
      const px = bg.getImageData(0, 0, 8, 1).data; let best = 0, lum = 1e9;
      for (let i = 0; i < 8; i++) { const L = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]; if (L < lum) { lum = L; best = i; } }
      const top = `rgb(${px[best * 4]},${px[best * 4 + 1]},${px[best * 4 + 2]})`;
      g.fillStyle = top; g.fillRect(0, 0, w, y0 + 1);
      // and a scatter of faint stars, thinning toward the seam
      for (let i = 0; i < Math.round(w * y0 / 2200); i++) {
        const x = R() * w, y = R() * y0;
        g.globalAlpha = (0.2 + R() * 0.5) * Math.min(1, (y0 - y) / (y0 * 0.4)); g.fillStyle = R() < 0.25 ? '#cfe0ff' : '#fff2dc';
        const s = R() < 0.92 ? 1 : 1.6; g.fillRect(x, y, s, s);
      }
      g.globalAlpha = 1;
      // draw the painting, then melt its top edge into that colour
      g.drawImage(P, x0, y0, pw, ph);
      const fade = ph * 0.06, fg = g.createLinearGradient(0, y0 - 1, 0, y0 + fade);
      fg.addColorStop(0, top); fg.addColorStop(1, top.replace('rgb', 'rgba').replace(')', ',0)'));
      g.fillStyle = fg; g.fillRect(0, y0 - 1, w, fade + 1);
      SKY.base = { w, h, c, painted: true };
      return c;
    }
    g.drawImage(P, x0, y0, pw, ph);
    SKY.base = { w, h, c, painted: true };
    return c;
  }
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#060515'); gr.addColorStop(0.32, '#16123c'); gr.addColorStop(0.58, '#33245e'); gr.addColorStop(0.8, '#6c3f6e'); gr.addColorStop(0.93, '#b8656a'); gr.addColorStop(1, '#e08a6a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // nebula: a soft river of colour slanting across the upper sky
  g.globalCompositeOperation = 'lighter';
  const cols = ['#7a52ff', '#3fc6c0', '#ff6fae', '#5a7bff'];
  for (let i = 0; i < 46; i++) {
    const u = R(), x = (0.02 + u * 0.96) * w, y = (0.42 - u * 0.3 + (R() - 0.5) * 0.12) * h, r = (0.06 + R() * 0.12) * m * (1.4 - Math.abs(u - 0.5));
    g.globalAlpha = 0.035 + R() * 0.045; g.drawImage(softSprite(cols[i % cols.length]), x - r, y - r * 0.6, r * 2, r * 1.2);
  }
  // star dust, thicker along the nebula
  for (let i = 0; i < 900; i++) {
    const u = R(), near = R() < 0.6, x = u * w, y = near ? (0.42 - u * 0.3 + (R() - 0.5) * 0.16) * h : R() * h * 0.75;
    g.globalAlpha = (0.15 + R() * 0.45) * (1 - y / h); g.fillStyle = R() < 0.2 ? '#cfe0ff' : '#fff2dc'; g.fillRect(x, y, R() < 0.9 ? 1 : 1.6, R() < 0.9 ? 1 : 1.6);
  }
  g.globalCompositeOperation = 'source-over';
  // constellations of the sigils, faintly drawn between their stars
  const cons = [['triangle', 0.1, 0.13, 0.05], ['star', 0.36, 0.08, 0.055], ['moon', 0.58, 0.27, 0.045], ['square', 0.2, 0.36, 0.04], ['wave', 0.7, 0.07, 0.05]];
  for (const [gl, cx, cy, sz] of cons) {
    const pts = glyphLines(gl)[0], step = gl === 'wave' || gl === 'moon' ? 6 : 1, S = sz * m;
    const P = pts.filter((_, k) => k % step === 0).map(([x, y]) => [cx * w + x * S, cy * h + y * S]);
    g.globalAlpha = 0.16; g.strokeStyle = '#cdbfff'; g.lineWidth = 0.8; g.setLineDash([2, 4]);
    g.beginPath(); P.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
    g.globalAlpha = 0.75; g.fillStyle = '#fff6e0';
    for (const [x, y] of P) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
  }
  // warm glow rising from beneath the cloud sea
  g.globalAlpha = 1;
  const hg = g.createRadialGradient(w * 0.5, h * 1.15, 0, w * 0.5, h * 1.15, h * 0.75);
  hg.addColorStop(0, 'rgba(255,170,120,0.45)'); hg.addColorStop(1, 'rgba(255,170,120,0)');
  g.fillStyle = hg; g.fillRect(0, 0, w, h);
  SKY.base = { w, h, c };
  return c;
}
function mixHex(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), ch = sh => Math.round(lerp((A >> sh) & 255, (B >> sh) & 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
/* a small floating isle, seen a little from above: a ragged chunk of turf over layered rock tapering to a point,
   roots and moss hanging below, shards floating loose, sometimes a waterfall trailing sparkles,
   and on top trees, ruined arches, pillars and towers, crystals. Far isles are washed into the haze.
   The still parts (rock and turf and what stands on top) are painted once into a sprite per size;
   only what moves (water, roots, shards, fireflies, crystals) is drawn every frame. */
function drawIsle(g, I, x, y, s, t, haze) {
  isleLayer(g, I, x, y, s, t, haze, 'back');
  const S = isleSprite(I, s, haze);
  g.drawImage(S.c, x - S.ox, y - S.oy, S.w, S.h);
  isleLayer(g, I, x, y, s, t, haze, 'front');
}
function isleSprite(I, s, haze) {
  const dpr = Math.min(2, typeof DPR !== 'undefined' ? DPR : 1);
  if (I.spr && I.spr.s === s && I.spr.dpr === dpr) return I.spr;
  // room for the tallest tree above and the deepest point of rock below
  const ox = s * 1.4 + 4, oy = s * 1.75 + 4, w = ox * 2, h = oy + s * (I.ry * 1.15 + 0.12) + Math.max(...I.bot) * s * 1.1 + 6;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.lineCap = 'round';
  isleLayer(g, I, ox, oy, s, 0, haze, 'still');
  I.spr = { s, dpr, c, ox, oy, w: c.width / dpr, h: c.height / dpr };
  return I.spr;
}
const HAZE = {};
function isleLayer(g, I, x, y, s, t, haze, part) {
  const P = hex => haze ? (HAZE[hex] || (HAZE[hex] = mixHex(hex, '#4a3c78', 0.55))) : hex;
  const W = s, ry = s * I.ry, n = I.bot.length - 1, tn = I.tf.length - 1, lip = s * 0.09;
  const X = u => x - W + 2 * W * u;
  const Ek = k => 0.32 + 0.68 * Math.pow(Math.sin(Math.PI * k / tn), 0.6);
  const fy = k => y + ry * Ek(k) * I.tf[k], by = k => y - ry * Ek(k) * I.tb[k];
  const frontAt = u => { const f = u * tn, k = Math.min(tn - 1, Math.floor(f)), r = f - k; return fy(k) * (1 - r) + fy(k + 1) * r; };
  const under = k => frontAt(k / n) + lip + I.bot[k] * s * 1.1;
  // waterfall spilling from the lip, behind the rock
  if (part === 'back' && I.fall) {
    const wx = X(0.62), wy = frontAt(0.62) + lip * 0.3, L = s * 3.2, fw = s * 0.16;
    // the curtain widens a little as it falls
    const fg = g.createLinearGradient(0, wy, 0, wy + L);
    fg.addColorStop(0, haze ? 'rgba(170,190,240,0.55)' : 'rgba(215,238,255,0.9)'); fg.addColorStop(0.3, haze ? 'rgba(150,175,235,0.4)' : 'rgba(150,205,250,0.7)'); fg.addColorStop(1, 'rgba(190,220,255,0)');
    g.fillStyle = fg; g.beginPath(); g.moveTo(wx - fw / 2, wy); g.lineTo(wx + fw / 2, wy); g.lineTo(wx + fw * 0.8, wy + L); g.lineTo(wx - fw * 0.8, wy + L); g.closePath(); g.fill();
    // streaks pouring down
    g.save(); g.clip(); g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const ox = (k / 3 - 0.5) * fw * 0.8;
      g.setLineDash([s * (0.14 + k * 0.03), s * 0.1]); g.lineDashOffset = -t * s * (1.1 + k * 0.25) - k * 7;
      g.strokeStyle = `rgba(245,252,255,${haze ? 0.35 : 0.7})`; g.lineWidth = Math.max(0.6, s * 0.018);
      g.beginPath(); g.moveTo(wx + ox, wy); g.lineTo(wx + ox * 1.6, wy + L); g.stroke();
    }
    g.setLineDash([]); g.restore();
    // foam at the lip, mist far below
    g.fillStyle = haze ? 'rgba(230,236,255,0.6)' : 'rgba(255,255,255,0.92)'; g.beginPath(); g.ellipse(wx, wy + s * 0.01, fw * 0.62, s * 0.035, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = haze ? 0.15 : 0.3; g.drawImage(softSprite('#e2f0ff'), wx - s * 0.45, wy + L * 0.55, s * 0.9, s * 0.7);
    for (let k = 0; k < 8; k++) {
      const ph = (t * 0.22 + k / 8 + I.ph) % 1, px = wx + Math.sin(k * 3.1 + t) * s * 0.14, py = wy + L * (0.3 + ph * 1.0);
      g.globalAlpha = (1 - ph) * (haze ? 0.4 : 0.85); g.drawImage(glowSprite('#cfeaff'), px - s * 0.07, py - s * 0.07, s * 0.14, s * 0.14);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  if (part === 'still') {
  // rock body
  const body = g.createLinearGradient(0, y, 0, y + s * 1.4);
  body.addColorStop(0, P('#6b4a34')); body.addColorStop(0.25, P('#4a3428')); body.addColorStop(0.6, P('#33243c')); body.addColorStop(1, P('#1b1129'));
  g.fillStyle = body; g.beginPath(); g.moveTo(X(0), fy(0));
  for (let k = 0; k <= n; k++) g.lineTo(X(k / n), frontAt(k / n) + lip);
  for (let k = n; k >= 0; k--) g.lineTo(X(k / n), under(k));
  g.closePath(); g.fill();
  // strata
  g.strokeStyle = P('#1c1230'); g.globalAlpha = 0.4; g.lineWidth = Math.max(0.6, s * 0.012);
  for (const j of [0.2, 0.42, 0.66]) {
    g.beginPath();
    for (let k = 1; k < n; k++) { const yy = frontAt(k / n) + lip + I.bot[k] * s * 1.1 * j; k > 1 ? g.lineTo(X(k / n), yy) : g.moveTo(X(k / n), yy); }
    g.stroke();
  }
  g.globalAlpha = 1;
  // moonlight along the right-hand edge
  g.strokeStyle = P('#c2b2f0'); g.globalAlpha = 0.45; g.lineWidth = Math.max(0.8, s * 0.018);
  g.beginPath(); g.moveTo(X(1), fy(tn) + lip);
  for (let k = n; k >= Math.round(n * 0.62); k--) g.lineTo(X(k / n) - s * 0.01, under(k) - s * 0.01);
  g.stroke(); g.globalAlpha = 1;
  }
  if (part === 'front') {
  // hanging roots and moss (they hang well below the turf, so drawing them over the sprite changes nothing)
  g.lineCap = 'round';
  for (const r of I.roots) {
    const k = Math.round(r.u * n), rx = X(r.u), r0 = frontAt(r.u) + lip + I.bot[k] * s * 0.5, L = r.l * s * 1.2, sw = Math.sin(t * 0.6 + r.u * 9) * s * 0.05;
    g.strokeStyle = r.moss ? P('#5a7f4a') : P('#3a2a24'); g.lineWidth = Math.max(0.6, s * (r.moss ? 0.02 : 0.026));
    g.beginPath(); g.moveTo(rx, r0); g.bezierCurveTo(rx + s * 0.05, r0 + L * 0.35, rx - s * 0.05 + sw, r0 + L * 0.7, rx + sw, r0 + L); g.stroke();
    if (r.moss) { g.fillStyle = P('#78a05e'); for (const q of [0.5, 0.8]) { g.beginPath(); g.ellipse(rx + sw * q, r0 + L * q, s * 0.03, s * 0.017, q * 2, 0, TAU); g.fill(); } }
  }
  // shards of rock floating loose beneath the point
  {
    let kMax = 0; for (let k = 1; k <= n; k++) if (I.bot[k] > I.bot[kMax]) kMax = k;
    const tipX = X(kMax / n), tipY = under(kMax);
    g.fillStyle = P('#2e2140');
    for (let j = 0; j < 3; j++) {
      const sx = tipX + (j - 1) * s * 0.3 + Math.sin(t * 0.5 + j * 2 + I.ph) * s * 0.03, sy = tipY + s * (0.16 + j * 0.15) + Math.sin(t * 0.8 + j + I.ph) * s * 0.05, r = s * (0.07 - j * 0.015);
      g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r * 0.8, sy - r * 0.2); g.lineTo(sx + r * 0.2, sy + r * 1.1); g.lineTo(sx - r * 0.7, sy); g.closePath(); g.fill();
    }
  }
  }
  if (part === 'still') {
  // the turf: a lip of grass over the earth, then the ragged top
  g.fillStyle = P('#3d6a36'); g.beginPath(); g.moveTo(X(0), fy(0));
  for (let k = 0; k <= tn; k++) g.lineTo(X(k / tn), fy(k));
  for (let k = tn; k >= 0; k--) g.lineTo(X(k / tn), fy(k) + lip);
  g.closePath(); g.fill();
  const top = g.createLinearGradient(0, y - ry, 0, y + ry);
  top.addColorStop(0, P('#8cb466')); top.addColorStop(1, P('#5a8a48'));
  g.fillStyle = top; g.beginPath(); g.moveTo(X(0), by(0));
  for (let k = 1; k <= tn; k++) g.lineTo(X(k / tn), by(k));
  for (let k = tn; k >= 0; k--) g.lineTo(X(k / tn), fy(k));
  g.closePath(); g.fill();
  g.strokeStyle = P('#a8cc7a'); g.globalAlpha = 0.5; g.lineWidth = Math.max(0.6, s * 0.012); g.beginPath(); g.moveTo(X(0), by(0));
  for (let k = 1; k <= tn; k++) g.lineTo(X(k / tn), by(k));
  g.stroke(); g.globalAlpha = 1;
  // grass fringe over the lip
  g.fillStyle = P('#3d6a36');
  for (let k = 1; k < 16; k++) { const u = k / 16, gx = X(u), gy = frontAt(u) + lip; g.beginPath(); g.moveTo(gx - s * 0.03, gy - 1); g.lineTo(gx, gy + lip * (0.5 + 0.5 * Math.abs(Math.sin(k * 7.3)))); g.lineTo(gx + s * 0.03, gy - 1); g.closePath(); g.fill(); }
  // what stands on top, back to front
  const stone = P('#c6bece'), stoneD = P('#8f86a0'), stoneL = P('#ded8e4');
  for (const f of I.feats) {
    const px = x + f.u * W * 0.8, py = y + f.v * ry * 0.7, fs = s * (haze ? 0.3 : 0.42) * f.h;
    switch (f.type) {
      case 'pine': {
        g.fillStyle = P('#3a2a22'); g.fillRect(px - fs * 0.05, py - fs * 0.25, fs * 0.1, fs * 0.25);
        for (let k = 0; k < 3; k++) {
          const yb = py - fs * (0.2 + k * 0.38), bw = fs * (0.42 - k * 0.1), th = fs * 0.62;
          g.fillStyle = P(k % 2 ? '#2f5238' : '#284632'); g.beginPath(); g.moveTo(px - bw, yb); g.lineTo(px, yb - th); g.lineTo(px + bw, yb); g.closePath(); g.fill();
          g.fillStyle = P('#4c7a52'); g.beginPath(); g.moveTo(px, yb - th); g.lineTo(px + bw, yb); g.lineTo(px + bw * 0.45, yb); g.closePath(); g.fill();
        }
        break;
      }
      case 'tree': {
        g.strokeStyle = P('#4a3426'); g.lineWidth = Math.max(0.9, fs * 0.11); g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - fs * 0.08, py - fs * 0.35, px, py - fs * 0.7); g.stroke();
        for (const [ox, oy, r, c] of [[-0.25, -0.85, 0.32, '#3b6a3c'], [0.25, -0.88, 0.3, '#3b6a3c'], [0, -1.08, 0.38, '#477a42'], [0.1, -1.18, 0.2, '#6a9a52']]) { g.fillStyle = P(c); g.beginPath(); g.arc(px + ox * fs, py + oy * fs, r * fs, 0, TAU); g.fill(); }
        break;
      }
      case 'bigtree': {
        // a gnarled old tree: a twisting trunk, reaching branches, a broad crown in clumps
        g.strokeStyle = P('#4a3426'); g.lineCap = 'round';
        g.lineWidth = fs * 0.2; g.beginPath(); g.moveTo(px - fs * 0.1, py); g.bezierCurveTo(px + fs * 0.25, py - fs * 0.4, px - fs * 0.3, py - fs * 0.75, px + fs * 0.05, py - fs * 1.1); g.stroke();
        g.lineWidth = fs * 0.08;
        for (const [ex, ey] of [[-0.6, -1.25], [0.6, -1.3], [0.25, -1.55], [-0.3, -1.5]]) { g.beginPath(); g.moveTo(px + fs * 0.03, py - fs * 1.0); g.quadraticCurveTo(px + ex * fs * 0.4, py + ey * fs * 0.85, px + ex * fs, py + ey * fs); g.stroke(); }
        g.lineWidth = fs * 0.06; g.beginPath(); g.moveTo(px - fs * 0.1, py); g.quadraticCurveTo(px - fs * 0.35, py + fs * 0.02, px - fs * 0.45, py + fs * 0.08); g.moveTo(px - fs * 0.05, py); g.quadraticCurveTo(px + fs * 0.25, py + fs * 0.03, px + fs * 0.4, py + fs * 0.1); g.stroke();
        for (const [ox, oy, r, c] of [[-0.6, -1.3, 0.32, '#365f38'], [0.6, -1.35, 0.32, '#365f38'], [-0.25, -1.55, 0.38, '#3f6c3e'], [0.3, -1.6, 0.38, '#3f6c3e'], [0, -1.78, 0.34, '#4a7c46'], [-0.5, -1.45, 0.18, '#6a9a54'], [0.45, -1.55, 0.18, '#6a9a54'], [0.08, -1.9, 0.16, '#78a85e']]) { g.fillStyle = P(c); g.beginPath(); g.arc(px + ox * fs, py + oy * fs, r * fs, 0, TAU); g.fill(); }
        break;
      }
      case 'bush': {
        for (const [ox, oy, r, c] of [[-0.2, -0.15, 0.24, '#3b6a3c'], [0.18, -0.15, 0.22, '#3b6a3c'], [0, -0.3, 0.26, '#4a7c46'], [0.05, -0.38, 0.12, '#6e9e56']]) { g.fillStyle = P(c); g.beginPath(); g.arc(px + ox * fs, py + oy * fs, r * fs, 0, TAU); g.fill(); }
        break;
      }
      case 'rock': {
        g.fillStyle = P('#6f6680'); g.beginPath(); g.ellipse(px, py - fs * 0.1, fs * 0.28, fs * 0.17, 0, 0, TAU); g.fill();
        g.fillStyle = P('#a59bb6'); g.beginPath(); g.ellipse(px - fs * 0.06, py - fs * 0.17, fs * 0.13, fs * 0.07, 0, 0, TAU); g.fill();
        break;
      }
      case 'pillar': {
        // a lone column, its top broken off
        const pw = fs * 0.2, H = fs * 1.2;
        g.fillStyle = stone; g.fillRect(px - pw / 2, py - H, pw, H);
        g.fillStyle = stoneD; g.fillRect(px, py - H, pw / 2, H);
        g.fillStyle = stoneL; g.fillRect(px - pw * 0.7, py - fs * 0.08, pw * 1.4, fs * 0.08);
        g.fillStyle = stone; g.beginPath(); g.moveTo(px - pw / 2, py - H); g.lineTo(px - pw * 0.15, py - H - fs * 0.12); g.lineTo(px + pw * 0.1, py - H - fs * 0.04); g.lineTo(px + pw / 2, py - H - fs * 0.1); g.lineTo(px + pw / 2, py - H); g.closePath(); g.fill();
        break;
      }
      case 'arch': {
        // a ruined arch: two columns and a half-fallen span between them
        const pw = fs * 0.17, gap = fs * 0.42, H = fs * 1.1;
        for (const [ox, hh] of [[-gap, H], [gap, H * 0.8]]) {
          g.fillStyle = stone; g.fillRect(px + ox - pw / 2, py - hh, pw, hh);
          g.fillStyle = stoneD; g.fillRect(px + ox, py - hh, pw / 2, hh);
        }
        g.strokeStyle = stone; g.lineWidth = pw; g.lineCap = 'butt';
        g.beginPath(); g.arc(px, py - H, gap, Math.PI, Math.PI * 1.72); g.stroke();
        g.strokeStyle = stoneL; g.lineWidth = pw * 0.25; g.beginPath(); g.arc(px, py - H, gap + pw * 0.38, Math.PI, Math.PI * 1.7); g.stroke();
        g.fillStyle = stoneD; g.fillRect(px + gap * 0.7, py - fs * 0.1, pw * 1.2, fs * 0.1);
        break;
      }
      case 'tower': {
        // a ruined tower with a broken crown and a dark window
        const tw = fs * 0.36, H = fs * 1.5;
        g.fillStyle = stone; g.fillRect(px - tw, py - H, tw * 2, H);
        g.fillStyle = stoneD; g.fillRect(px, py - H, tw, H);
        g.fillStyle = stone;
        for (const [ox, hh] of [[-1, 0.18], [-0.35, 0.1], [0.35, 0.22]]) g.fillRect(px + ox * tw, py - H - fs * hh, tw * 0.55, fs * hh);
        g.fillStyle = P('#2a2038'); g.beginPath(); g.moveTo(px - tw * 0.3, py - H * 0.45); g.lineTo(px - tw * 0.3, py - H * 0.62); g.arc(px, py - H * 0.62, tw * 0.3, Math.PI, 0); g.lineTo(px + tw * 0.3, py - H * 0.45); g.closePath(); g.fill();
        g.strokeStyle = P('#4f7a44'); g.lineWidth = Math.max(0.7, fs * 0.05);
        g.beginPath(); g.moveTo(px + tw * 0.9, py - H * 0.95); g.quadraticCurveTo(px + tw * 0.6, py - H * 0.6, px + tw * 0.85, py - H * 0.2); g.stroke();
        break;
      }
    }
  }
  }
  if (part !== 'front') return;
  // fireflies about the trees of the nearer isles
  if (!haze && I.feats.some(f => f.type === 'tree' || f.type === 'bigtree')) {
    g.globalCompositeOperation = 'lighter';
    const big = I.feats.some(f => f.type === 'bigtree');
    for (let k = 0; k < (big ? 12 : 6); k++) {
      const a = t * (0.3 + k * 0.05) + k * 1.7 + I.ph, fx = x + Math.cos(a) * W * (0.3 + 0.2 * Math.sin(k)), fyy = y - s * (0.3 + 0.25 * Math.sin(a * 1.3 + k)) + Math.sin(a) * ry * 0.5;
      g.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + k * 2); g.drawImage(glowSprite('#e8ff9a'), fx - s * 0.05, fyy - s * 0.05, s * 0.1, s * 0.1);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  // glowing crystals
  if (I.crystal) {
    const cx = x + W * 0.45, cy = y + ry * 0.05, ch = s * 0.18;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + I.ph);
    g.drawImage(glowSprite('#b9a6ff'), cx - ch * 1.6, cy - ch * 2, ch * 3.2, ch * 3.2);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    for (const [ox, hh, wd] of [[0, 1, 0.26], [0.32, 0.6, 0.18], [-0.28, 0.5, 0.16]]) {
      g.fillStyle = P('#cdbfff'); g.beginPath(); g.moveTo(cx + ox * ch, cy - ch * hh); g.lineTo(cx + ox * ch + ch * wd, cy); g.lineTo(cx + ox * ch - ch * wd, cy); g.closePath(); g.fill();
      g.fillStyle = P('#f2ecff'); g.beginPath(); g.moveTo(cx + ox * ch, cy - ch * hh); g.lineTo(cx + ox * ch + ch * wd, cy); g.lineTo(cx + ox * ch, cy); g.closePath(); g.fill();
    }
  }
}
let _moon = null;
function moonSprite(r) {
  r = Math.round(r);
  if (_moon && _moon.r === r) return _moon.c;
  const c = document.createElement('canvas'); c.width = c.height = r * 2 + 2;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(r * 0.8, r * 0.9, 0, r, r, r);
  gr.addColorStop(0, '#fff8e6'); gr.addColorStop(1, '#efd9a8');
  g.fillStyle = gr; g.beginPath(); g.arc(r + 1, r + 1, r, 0, TAU); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(r + 1 + r * 0.45, r + 1 - r * 0.2, r * 0.92, 0, TAU); g.fill();
  _moon = { r, c };
  return c;
}
/* the sea of cloud: three bands of soft puffs. Each band is painted once per screen size into a strip that tiles
   seamlessly (a puff crossing one end is also drawn at the other); being all soft, it is painted at half scale. */
const SEA = { col: ['#9b6fa6', '#d48d9e', '#f4b39c'], y: [0.82, 0.9, 0.99], a: [0.5, 0.6, 0.75], sp: [0.003, 0.006, 0.011], bands: [] };
function seaBand(b, w, h) {
  const old = SEA.bands[b];
  if (old && old.w === w && old.h0 === h) return old;
  const span = 1.3 * w, puffs = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const P of SKY.sea) if (P.band === b) {
    const x = (P.x % 1) * span, y = (SEA.y[b] + P.dy) * h, pw = P.w * w * (1 + b * 0.3);
    puffs.push([x, y, pw]); y0 = Math.min(y0, y - pw * 0.3); y1 = Math.max(y1, y + pw * 0.3);
  }
  const q = 0.5, c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(span * q)); c.height = Math.max(2, Math.round((y1 - y0) * q));
  const g = c.getContext('2d'), spr = softSprite(SEA.col[b]);
  g.scale(c.width / span, c.height / (y1 - y0)); g.translate(0, -y0);
  g.globalAlpha = SEA.a[b];
  for (const [x, y, pw] of puffs) for (const dx of [-span, 0, span]) g.drawImage(spr, x + dx - pw, y - pw * 0.3, pw * 2, pw * 0.6);
  return (SEA.bands[b] = { w, h0: h, c, span, y0, h: y1 - y0 });
}
function drawSky(g, w, h, t) {
  const m = Math.min(w, h);
  g.drawImage(skyBase(w, h), 0, 0, w, h);
  const painted = SKY.base && SKY.base.painted;
  if (!painted) drawnSkyStill(g, w, h, t, m);
  // now and then, a shooting star
  // a rare treat: one every twenty to forty-five seconds
  if (SKY.nextShoot == null || SKY.nextShoot > t + 60) SKY.nextShoot = t + 12 + Math.random() * 20;
  if (!SKY.shoot && t >= SKY.nextShoot) { SKY.shoot = { x: 0.1 + Math.random() * 0.6, y: 0.04 + Math.random() * 0.25, t0: t, dx: 0.9 + Math.random() * 0.4, dy: 0.35 + Math.random() * 0.2 }; SKY.nextShoot = t + 20 + Math.random() * 25; }
  if (SKY.shoot) {
    const S = SKY.shoot, k = (t - S.t0) / 0.9;
    if (k > 1 || k < 0) SKY.shoot = null;
    else {
      const hx = (S.x + S.dx * 0.25 * k) * w, hy = (S.y + S.dy * 0.25 * k) * h, tx = hx - S.dx * 0.08 * w, ty = hy - S.dy * 0.08 * h;
      const sg = g.createLinearGradient(tx, ty, hx, hy); const al = Math.sin(k * Math.PI);
      sg.addColorStop(0, 'rgba(255,240,220,0)'); sg.addColorStop(1, `rgba(255,240,220,${0.85 * al})`);
      g.strokeStyle = sg; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
    }
  }
  // far isles, hazy
  if (!painted) for (const I of SKY.isles) if (I.layer === 0) {
    const x = ((I.x + t * 0.002 * I.sp) % 1.2 - 0.1) * w, y = I.y * h + Math.sin(t * 0.35 + I.ph) * 5;
    drawIsle(g, I, x, y, I.s * m * 0.06, t, true);
  }
  drawSkyMoving(g, w, h, t, m, painted);
}
// the drawn sky's stars and moon (left out under a painted backdrop, which has its own)
function drawnSkyStill(g, w, h, t, m) {
  // twinkling stars; the brightest wear a small cross of light
  g.fillStyle = 'rgb(255,245,220)'; g.strokeStyle = 'rgb(255,240,210)'; g.lineWidth = 0.8;
  for (const s of SKY.stars) {
    const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))) * (1 - s.y * 0.9);
    const x = s.x * w, y = s.y * h;
    g.globalAlpha = a; g.fillRect(x, y, s.s, s.s);
    if (s.bright) {
      const L = 4 + s.s * 3; g.globalAlpha = a * 0.55;
      g.beginPath(); g.moveTo(x - L, y + s.s / 2); g.lineTo(x + L, y + s.s / 2); g.moveTo(x + s.s / 2, y - L); g.lineTo(x + s.s / 2, y + L); g.stroke();
    }
  }
  g.globalAlpha = 1;
  // the moon, with a halo and two faint rings
  const mx = w * 0.82, my = h * 0.16, mr = m * 0.05;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.5; g.drawImage(glowSprite('#ffe8c0'), mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,232,190,0.07)'; g.lineWidth = 1;
  for (const k of [2.2, 3.1]) { g.beginPath(); g.arc(mx, my, mr * k, 0, TAU); g.stroke(); }
  g.drawImage(moonSprite(mr), mx - mr, my - mr);
}
// wind ribbons, the cloud sea with the near isles (drawn sky only) and the lantern motes
function drawSkyMoving(g, w, h, t, m, painted) {
  // ribbons of wind, luminous, drifting slowly across the dusk
  // (their broad soft glow is the costliest thing in the sky, so it goes into a half-scale layer laid over in one go)
  const RG = SKY.ribbonGlow || (SKY.ribbonGlow = document.createElement('canvas'));
  const rw = Math.max(2, Math.round(w * 0.5)), rh = Math.max(2, Math.round(h * 0.5));
  if (RG.width !== rw || RG.height !== rh) { RG.width = rw; RG.height = rh; }
  const rg = RG.getContext('2d');
  rg.setTransform(1, 0, 0, 1, 0, 0); rg.clearRect(0, 0, rw, rh); rg.setTransform(rw / w, 0, 0, rh / h, 0, 0);
  rg.globalCompositeOperation = 'lighter'; rg.lineCap = 'round'; rg.globalAlpha = 0.25;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  const ribbonGrad = (cx, Rb) => {
    const lg = cx.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, 'rgba(200,210,255,0)'); lg.addColorStop(0.3, `rgba(200,210,255,${Rb.al})`); lg.addColorStop(0.7, `rgba(230,200,255,${Rb.al * 0.8})`); lg.addColorStop(1, 'rgba(200,210,255,0)');
    return lg;
  };
  for (const Rb of SKY.ribbons) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48 * 1.3 - 0.15;
      pts.push([u * w, (Rb.y + Rb.a * Math.sin(u * Rb.f * TAU / 2 + Rb.ph + t * Rb.sp) + Rb.a * 0.4 * Math.sin(u * Rb.f2 * TAU / 2 - t * Rb.sp * 1.7)) * h]);
    }
    const path = cx => { cx.beginPath(); pts.forEach(([px, py], i) => i ? cx.lineTo(px, py) : cx.moveTo(px, py)); };
    rg.strokeStyle = ribbonGrad(rg, Rb); rg.lineWidth = Rb.w * 14; path(rg); rg.stroke();
    g.strokeStyle = ribbonGrad(g, Rb); g.globalAlpha = 1; g.lineWidth = Rb.w; path(g); g.stroke();
  }
  g.globalAlpha = 1; g.drawImage(RG, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  // the sea of cloud, lit warm from below: far band first
  if (!painted) for (let b = 0; b < 3; b++) {
    // each band drifts as one piece: a strip that repeats every 1.3 screen widths, laid twice side by side
    const B = seaBand(b, w, h), x0 = ((t * SEA.sp[b]) % 1) * B.span - 0.15 * w;
    g.globalAlpha = 1;
    g.drawImage(B.c, x0, B.y0, B.span, B.h);
    g.drawImage(B.c, x0 - B.span, B.y0, B.span, B.h);
    // the nearer isles rise out of the middle of the sea
    if (b === 1) { g.globalAlpha = 1; for (const I of SKY.isles) if (I.layer === 1) { const x = I.x * w + Math.sin(t * 0.05 + I.ph) * 8, y = I.y * h + Math.sin(t * 0.3 + I.ph) * 7; drawIsle(g, I, x, y, I.s * m * 0.06, t, false); } }
  }
  g.globalAlpha = 1;
  // lantern motes drifting up through the dusk
  g.globalCompositeOperation = 'lighter';
  for (const M of SKY.motes) {
    const y = (1.05 - ((M.y + t * M.sp) % 1.1)) * h, x = (M.x + Math.sin(t * 0.4 + M.sw) * 0.01) * w, a = Math.min(1, (h - y) / (h * 0.3)) * 0.55;
    g.globalAlpha = a; g.drawImage(glowSprite(M.col), x - M.s * 4, y - M.s * 4, M.s * 8, M.s * 8);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// the land's extent on screen at scale 1 (blocks counted at the height they are rising to)
function landBox() {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const c of World.cells) {
    if (c.void) continue;
    const u = c.x - c.y, v = c.x + c.y;
    minX = Math.min(minX, (u - 1) * TW / 2); maxX = Math.max(maxX, (u + 1) * TW / 2);
    minY = Math.min(minY, v * TH / 2 - (Math.max(c.h, c.th || 0) + featH(c)) * TZ - 20);
    maxY = Math.max(maxY, (v + 2) * TH / 2 + 2 * TZ);
  }
  if (minX > maxX) return [-World.H * TW / 2, World.W * TW / 2, -20, (World.W + World.H) * TH / 2 + 2 * TZ];
  return [minX, maxX, minY, maxY];
}
function fitCamera(vw, vh, pads, grow) {
  if (!World.W) return;
  if (!grow) cam.fit = [vw, vh, pads], cam.goal = null;
  if (!pads && World.level && World.level.name === 'Title') pads = [vh * 0.4, 10];
  const [minX, maxX, minY, maxY] = landBox();
  // short screens (a phone held sideways) keep the HUD tight to the edges; narrow ones stack it above the land
  const short = vh < 500 && vw > vh;
  const topPad = pads ? pads[0] : short ? 58 : vw < 520 ? 185 : vw < 700 ? 150 : 120;
  const botPad = pads ? pads[1] : short ? 70 : 110;
  const side = vw < 520 ? 36 : 60;
  const s = clamp(Math.min((vw - side) / (maxX - minX), (vh - topPad - botPad) / (maxY - minY)), 0.25, 1.9);
  const ox = vw / 2 - (minX + maxX) / 2 * s, oy = topPad + (vh - topPad - botPad) / 2 - (minY + maxY) / 2 * s;
  if (!grow) { cam.s = s; cam.ox = ox; cam.oy = oy; return; }
  // during play the view only ever widens, gently, when land has risen beyond it
  const C = cam.goal || cam, out = C.ox + minX * C.s < side * 0.25 || C.ox + maxX * C.s > vw - side * 0.25
    || C.oy + minY * C.s < topPad * 0.5 || C.oy + maxY * C.s > vh - botPad * 0.4;
  if (out && s < C.s + 1e-3) cam.goal = { s, ox, oy };
}
function easeCamera() {
  if (cam.fit && frameNo % 20 === 0) fitCamera(cam.fit[0], cam.fit[1], cam.fit[2], true);
  const G = cam.goal; if (!G) return;
  const k = 0.07;
  cam.s += (G.s - cam.s) * k; cam.ox += (G.ox - cam.ox) * k; cam.oy += (G.oy - cam.oy) * k;
  if (Math.abs(G.s - cam.s) < 1e-4 && Math.abs(G.ox - cam.ox) < 0.3 && Math.abs(G.oy - cam.oy) < 0.3) { cam.s = G.s; cam.ox = G.ox; cam.oy = G.oy; cam.goal = null; }
}

function growQuad(q, px) {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  return q.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * px * 1.8, p[1] + dy / L * px]; });
}
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round((n >> 16 & 255) * f), 0, 255), gg = clamp(Math.round((n >> 8 & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${gg},${b})`;
}
function prism(g, x0, y0, x1, y1, z0, z1, top, left, right, edge, ink = INK) {
  const A = proj(x0, y0, z1), B = proj(x1, y0, z1), C = proj(x1, y1, z1), D = proj(x0, y1, z1);
  const Bb = proj(x1, y0, z0), Cb = proj(x1, y1, z0), Db = proj(x0, y1, z0);
  g.fillStyle = right; poly(g, [B, C, Cb, Bb]); g.fill();
  g.fillStyle = left; poly(g, [D, C, Cb, Db]); g.fill();
  g.fillStyle = top; poly(g, [A, B, C, D]); g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = 1; poly(g, [A, B, C, D]); g.stroke(); }
  if (ink) {
    // the storybook outline: the whole silhouette, then the three edges that meet at the near corner
    const sd = x0 * 3.1 + y0 * 5.7 + z0 * 2.3;
    g.beginPath();
    inkPath(g, A, B, sd); inkPath(g, B, Bb, sd + 1, true); inkPath(g, Bb, Cb, sd + 2, true); inkPath(g, Cb, Db, sd + 3, true); inkPath(g, Db, D, sd + 4, true); inkPath(g, D, A, sd + 5, true);
    inkPath(g, B, C, sd + 6); inkPath(g, C, D, sd + 7); inkPath(g, C, Cb, sd + 8);
    inkStroke(g, ink, 1.6);
  }
}

/* Ink: the storybook outline drawn round land and things. Each line bows a little, the same way every frame
   (seeded by where it is), as if drawn by hand. */
const INK = 'rgba(40,24,22,0.82)';
function hash2(a, b) { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }
function inkPath(g, p, q, seed, cont) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
  if (cont) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
  if (L < 5) { g.lineTo(q[0], q[1]); return; }
  const o = (hash2(seed, 1.7) - 0.5) * Math.min(2.4 * cam.s, L * 0.05), k = 0.35 + hash2(seed, 4.1) * 0.3;
  g.quadraticCurveTo(p[0] + dx * k - dy / L * o, p[1] + dy * k + dx / L * o, q[0], q[1]);
}
function inkStroke(g, col, w) {
  g.strokeStyle = col; g.lineWidth = w * cam.s; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
}

/* Light that falls on the land: lit braziers, fire, the orb and the font each throw a soft pool of their colour
   onto the faces near them (drawn per face, clipped to it, so nearer land still hides it). Gathered once a frame. */
let LIGHTS = [];
const lightCache = {};
function lightSprite(col) {
  if (lightCache[col]) return lightCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.3, hexA(col, 0.6)); gr.addColorStop(0.65, hexA(col, 0.18)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return lightCache[col] = c;
}
function gatherLights(t) {
  const L = [];
  for (const c of World.cells) {
    if (c.void) continue;
    if (c.feat === 'brazier' && c.lit) L.push({ x: c.x + .5, y: c.y + .5, z: c.h + brazierBowlZ() + 0.1, col: '#ffa04a', r: 2.8, a: 0.62 + 0.06 * Math.sin(t * 11 + c.x * 3) });
    else if (c.burn) L.push({ x: c.x + .5, y: c.y + .5, z: c.h + 0.4, col: '#ff7a36', r: 1.9, a: 0.4 + 0.05 * Math.sin(t * 13 + c.y * 5) });
    if (c.feat === 'font') L.push({ x: c.x + .5, y: c.y + .5, z: c.h + 0.2, col: '#78e6ff', r: 2.0, a: 0.4 });
  }
  for (const b of World.bodies) if (b.alive && b.kind === 'orb') L.push({ x: b.x, y: b.y, z: b.z + b.r, col: '#ffc45e', r: 2.2, a: b.captured ? 0.6 : 0.42 });
  L.sort((p, q) => q.a - p.a);
  LIGHTS = L.slice(0, 10);
}
// pools of light on a top face at height z (corners A..D already projected)
let NO_LIGHT = false;
function lightTop(g, c, z, quad) {
  if (NO_LIGHT) return;
  let on = false;
  for (const l of LIGHTS) {
    const dh = l.z - z; if (dh < -0.2) continue;
    const dx = c.x + 0.5 - l.x, dy = c.y + 0.5 - l.y; if (dx * dx + dy * dy > (l.r + 0.8) ** 2) continue;
    if (!on) { g.save(); poly(g, quad); g.clip(); g.globalCompositeOperation = 'lighter'; on = true; }
    const [px, py] = proj(l.x, l.y, z), R = l.r * TW * 0.7071 * cam.s;
    g.globalAlpha = l.a * clamp(1.15 - dh / 3, 0.3, 1);
    g.drawImage(lightSprite(l.col), px - R, py - R * 0.5, R * 2, R);
  }
  if (on) g.restore();
}
// and on a side face (R: the plane x = c.x + 1, L: the plane y = c.y + 1), lit only from in front of it
function lightSide(g, c, R, za, zb, quad) {
  if (NO_LIGHT) return;
  let on = false;
  for (const l of LIGHTS) {
    const d = R ? l.x - (c.x + 1) : l.y - (c.y + 1); if (d < 0.05 || d > l.r) continue;
    const u = R ? l.y - (c.y + 0.5) : l.x - (c.x + 0.5); if (Math.abs(u) > (l.r - d) * 1.2 + 0.55) continue;
    if (l.z < zb - 0.2) continue;
    if (!on) { g.save(); poly(g, quad); g.clip(); g.globalCompositeOperation = 'lighter'; on = true; }
    const zc = clamp(l.z, zb, za), [px, py] = R ? proj(c.x + 1, l.y, zc) : proj(l.x, c.y + 1, zc), Rr = (l.r - d) * TW * 0.6 * cam.s;
    g.globalAlpha = l.a * 0.8;
    g.drawImage(lightSprite(l.col), px - Rr, py - Rr, Rr * 2, Rr * 2);
  }
  if (on) g.restore();
}

/* Textures: painted detail laid over the land's flat colours, so tone, wetness, frost and light still come from
   the colours underneath. Each is painted once into a seamless square covering 4×4 tiles (TEXU texels a tile) and
   pinned to the world (tops by x and y, walls by their run along the edge and by height), so the grass runs on
   unbroken from tile to tile and stone courses and soil layers line up all round the island. */
const TEXN = 512, TEXU = 128;
const texPats = new WeakMap();
let texOK = typeof DOMMatrix !== 'undefined' && typeof CanvasPattern !== 'undefined' && !!CanvasPattern.prototype.setTransform;
function texWrap(x, y, r, fn) {
  for (const ox of [-TEXN, 0, TEXN]) for (const oy of [-TEXN, 0, TEXN]) {
    const X = x + ox, Y = y + oy;
    if (X + r < 0 || X - r > TEXN || Y + r < 0 || Y - r > TEXN) continue;
    fn(X, Y);
  }
}
function rgbaOf(rgb, a) { return `rgba(${rgb},${a})`; }
function texBlotches(g, R, n, r0, r1, light, dark, la, da) {
  for (let i = 0; i < n; i++) {
    const x = R() * TEXN, y = R() * TEXN, r = r0 + R() * (r1 - r0), L = R() < 0.5, col = L ? light : dark, a = (L ? la : da) * (0.5 + R() * 0.5);
    texWrap(x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, rgbaOf(col, a)); gr.addColorStop(1, rgbaOf(col, 0));
      g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }
}
function texSpecks(g, R, n, col, a0, a1, s0, s1) {
  for (let i = 0; i < n; i++) {
    const x = R() * TEXN, y = R() * TEXN, s = s0 + R() * (s1 - s0), sy = s * (0.6 + R() * 0.4), rot = R() * 3;
    g.fillStyle = rgbaOf(col, a0 + R() * (a1 - a0));
    texWrap(x, y, s, (X, Y) => { g.beginPath(); g.ellipse(X, Y, s, sy, rot, 0, TAU); g.fill(); });
  }
}
function texPebbles(g, R, n, rx0, rx1) {
  for (let i = 0; i < n; i++) {
    const x = R() * TEXN, y = R() * TEXN, rx = rx0 + R() * (rx1 - rx0), ry = rx * (0.55 + R() * 0.25), rot = (R() - 0.5) * 0.6;
    texWrap(x, y, rx + 3, (X, Y) => {
      g.fillStyle = 'rgba(20,12,8,0.35)'; g.beginPath(); g.ellipse(X + 1.5, Y + 2, rx, ry, rot, 0, TAU); g.fill();
      g.fillStyle = 'rgba(150,128,104,0.5)'; g.beginPath(); g.ellipse(X, Y, rx, ry, rot, 0, TAU); g.fill();
      g.fillStyle = 'rgba(235,215,185,0.32)'; g.beginPath(); g.ellipse(X - rx * 0.25, Y - ry * 0.35, rx * 0.5, ry * 0.4, rot, 0, TAU); g.fill();
    });
  }
}
// Slabs for the raised stone. On tops, light falls from the back corner (texture top-left) to the front one;
// on walls, from the top edge down. Each slab is painted inside its own clip, so nothing spills into the next.
/* ?bond in the address lays the walls' slabs in running bond (each course offset half a block from the next), so a
   wall of several blocks reads as one piece of masonry rather than a stack of cubes */
const STONE_BOND = typeof location !== 'undefined' && /[?&]bond(=|&|$)/.test(location.search);
// how mossy a stone wall is: walls in shade (R) usually, walls in the light now and then; and each block's own tone
const wallMossy = (x, y, R) => hash2(x * 3.7 + y * 5.3 + (R ? 0 : 9), 4.2) < (R ? 0.78 : 0.38);
function blockTone(x, y) { const h = hash2(x * 1.31 + 0.7, y * 7.9 + 2.1); return h < 0.34 ? 'rgba(205,165,115,0.09)' : h < 0.67 ? 'rgba(105,115,132,0.1)' : 'rgba(100,122,70,0.08)'; }
function texSlabs(g, R, wall, U = TEXU, N = TEXN, light = false) {
  const n = Math.round(N / U), kk = U / 128, bond = wall && STONE_BOND;
  for (let j = 0; j < n; j++) for (let i = bond ? -1 : 0; i < n; i++) {
    const x0 = i * U + (bond && j % 2 ? U / 2 : 0), y0 = j * U;
    g.save(); g.beginPath(); g.rect(x0, y0, U, U); g.clip();
    // the broad shading
    const gr = wall ? g.createLinearGradient(0, y0, 0, y0 + U) : g.createLinearGradient(x0, y0, x0 + U, y0 + U);
    gr.addColorStop(0, rgbaOf('255,253,240', wall ? 0.13 : 0.18)); gr.addColorStop(0.45, 'rgba(255,253,240,0)'); gr.addColorStop(1, 'rgba(22,28,34,0.26)');
    g.fillStyle = gr; g.fillRect(x0, y0, U, U);
    // soft mottling, and a faint grain (left out over a painted stone, which has its own surface)
    if (!light) for (let k = 0; k < 6; k++) {
      const x = x0 + R() * U, y = y0 + R() * U, r = 18 + R() * 40, col = R() < 0.5 ? '255,250,235' : '30,42,40', a = 0.05 + R() * 0.08;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgbaOf(col, a)); rg.addColorStop(1, rgbaOf(col, 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (!light) for (let k = 0; k < 50; k++) { g.fillStyle = R() < 0.5 ? 'rgba(30,36,40,0.16)' : 'rgba(255,250,235,0.14)'; g.fillRect(x0 + R() * U, y0 + R() * U, 1.5 + R(), 1.5 + R()); }
    // now and then a hairline crack, cut in: a dark line with a lit lip beside it
    if (!light && R() < 0.38) {
      const e = R() * 4 | 0, u = 0.25 + R() * 0.5;
      let p = e === 0 ? [x0 + u * U, y0] : e === 1 ? [x0 + U, y0 + u * U] : e === 2 ? [x0 + u * U, y0 + U] : [x0, y0 + u * U];
      let an = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][e] + (R() - 0.5) * 0.8;
      const pts = [p];
      for (let k = 0, m = 3 + (R() * 3 | 0); k < m; k++) { an += (R() - 0.5) * 1.1; p = [p[0] + Math.cos(an) * (8 + R() * 12), p[1] + Math.sin(an) * (8 + R() * 12)]; pts.push(p); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [dx, dy, col, w] of [[1.4, 1.4, 'rgba(255,250,235,0.2)', 1.4], [0, 0, 'rgba(34,38,46,0.5)', 1.5]]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo : g.moveTo).call(g, q[0] + dx, q[1] + dy)); g.stroke();
      }
    }
    // a chipped corner
    if (!light && R() < 0.3) {
      const cx = R() < 0.5 ? x0 : x0 + U, cy = R() < 0.5 ? y0 : y0 + U, sx = cx === x0 ? 1 : -1, sy = cy === y0 ? 1 : -1, a = 9 + R() * 10, b = 9 + R() * 10;
      g.fillStyle = 'rgba(28,32,38,0.32)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * a, cy); g.lineTo(cx + sx * a * 0.35, cy + sy * b * 0.45); g.lineTo(cx, cy + sy * b); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,250,235,0.22)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx + sx * a, cy); g.lineTo(cx + sx * a * 0.35, cy + sy * b * 0.45); g.lineTo(cx, cy + sy * b); g.stroke();
    }
    // the rounded edge: lit along the top (and, on tops, the left), shadowed along the others
    const bw = 7 * kk;
    g.lineCap = 'butt';
    g.lineWidth = bw;
    g.strokeStyle = 'rgba(255,255,245,0.26)'; g.beginPath(); g.moveTo(x0, y0 + bw / 2); g.lineTo(x0 + U, y0 + bw / 2); g.stroke();
    g.strokeStyle = wall ? 'rgba(255,255,245,0.1)' : 'rgba(255,255,245,0.22)'; g.beginPath(); g.moveTo(x0 + bw / 2, y0); g.lineTo(x0 + bw / 2, y0 + U); g.stroke();
    g.strokeStyle = 'rgba(20,26,32,0.28)'; g.beginPath(); g.moveTo(x0, y0 + U - bw / 2); g.lineTo(x0 + U, y0 + U - bw / 2); g.stroke();
    g.strokeStyle = wall ? 'rgba(20,26,32,0.14)' : 'rgba(20,26,32,0.24)'; g.beginPath(); g.moveTo(x0 + U - bw / 2, y0); g.lineTo(x0 + U - bw / 2, y0 + U); g.stroke();
    // moss creeping in from an edge (on walls, only from the top)
    if (!light && R() < (wall ? 0.3 : 0.45)) {
      const e = wall ? 0 : R() * 4 | 0, c0 = 0.1 + R() * 0.4, c1 = c0 + 0.25 + R() * 0.35;
      for (let k = 0; k < 22; k++) {
        const u = c0 + R() * (c1 - c0), dep = Math.pow(R(), 1.8) * 16, r = 3 + R() * 5 * (1 - dep / 20);
        const [x, y] = e === 0 ? [x0 + u * U, y0 + dep] : e === 1 ? [x0 + U - dep, y0 + u * U] : e === 2 ? [x0 + u * U, y0 + U - dep] : [x0 + dep, y0 + u * U];
        g.fillStyle = 'rgba(30,48,22,0.3)'; g.beginPath(); g.ellipse(x + 1.2, y + 1.6, r, r * 0.75, 0, 0, TAU); g.fill();
        g.fillStyle = R() < 0.4 ? 'rgba(160,190,96,0.62)' : 'rgba(104,140,62,0.62)'; g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, TAU); g.fill();
      }
    }
    // the joint to the next slab
    g.strokeStyle = 'rgba(40,46,50,0.2)'; g.lineWidth = 2 * kk; g.strokeRect(x0, y0, U, U);
    g.restore();
  }
}
const TEX_PAINT = {
  // grass: broad patches of lighter and darker growth, clumps of leafy dabs each with its own shadow, seed specks
  grass(g, R) {
    texBlotches(g, R, 70, 30, 95, '214,236,130', '16,38,10', 0.16, 0.2);
    for (let i = 0; i < 300; i++) {
      const cx = R() * TEXN, cy = R() * TEXN, n = 5 + (R() * 8 | 0), tone = R(), dabs = [];
      for (let j = 0; j < n; j++) {
        const a = R() * TAU, rr = R() * 13, L = 6 + R() * 8, an = R() * TAU;
        dabs.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, dx: Math.cos(an) * L / 2, dy: Math.sin(an) * L / 2, w0: 3 + R() * 1.5, w1: 2.5 + R() * 1.5, a: R() });
      }
      g.lineCap = 'round';
      texWrap(cx, cy, 30, (X, Y) => {
        for (const b of dabs) {
          const x = X + b.x, y = Y + b.y;
          g.strokeStyle = 'rgba(24,46,14,0.32)'; g.lineWidth = b.w0;
          g.beginPath(); g.moveTo(x - b.dx + 2, y - b.dy + 2.5); g.lineTo(x + b.dx + 2, y + b.dy + 2.5); g.stroke();
          g.strokeStyle = tone < 0.45 ? `rgba(196,222,112,${0.3 + b.a * 0.25})` : tone < 0.85 ? `rgba(138,172,72,${0.35 + b.a * 0.25})` : `rgba(226,232,140,${0.35 + b.a * 0.2})`;
          g.lineWidth = b.w1;
          g.beginPath(); g.moveTo(x - b.dx, y - b.dy); g.lineTo(x + b.dx, y + b.dy); g.stroke();
        }
      });
    }
    texSpecks(g, R, 500, '20,34,12', 0.2, 0.4, 1, 2.2);
    texSpecks(g, R, 90, '250,240,170', 0.25, 0.5, 1, 1.8);
  },
  // the low, sunken ground: bare earth with pebbles
  dirt(g, R) {
    texBlotches(g, R, 50, 40, 120, '200,150,104', '40,20,14', 0.2, 0.26);
    texSpecks(g, R, 160, '30,16,10', 0.15, 0.35, 1.5, 3);
    texPebbles(g, R, 14, 5, 11);
  },
  // the raised stone, as in the storybook: one big smooth slab to a tile on top, and one to each unit of height
  // on the walls, softly shaded from a lit edge to a shadowed one, bevelled, with the odd crack, chip and moss
  stoneTop(g, R) { texSlabs(g, R, false); },
  stoneSide(g, R) { texSlabs(g, R, true); },
  // the earth under the grass: wavy layers of lighter and darker soil, pebbles, and fine roots
  soil(g, R) {
    let y = 0, dark = false;
    const lines = [];
    while (y < TEXN) {
      const hgt = y > TEXN - 70 ? TEXN - y : 30 + R() * 40, k = 1 + (R() * 3 | 0), A = 3 + R() * 6, ph = R() * TAU;
      lines.push({ y, k, A, ph, hgt, dark });
      y += hgt; dark = !dark;
    }
    const wave = (l, x) => l.y + Math.sin(x / TEXN * TAU * l.k + l.ph) * l.A * (l.y === 0 ? 0 : 1);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], n = lines[i + 1] || { y: TEXN, k: 1, A: 0, ph: 0 };
      g.beginPath(); g.moveTo(0, wave(l, 0));
      for (let x = 0; x <= TEXN; x += 8) g.lineTo(x, wave(l, x));
      for (let x = TEXN; x >= 0; x -= 8) g.lineTo(x, n.y === TEXN ? TEXN : wave(n, x));
      g.closePath(); g.fillStyle = l.dark ? `rgba(24,14,8,${0.08 + R() * 0.12})` : `rgba(200,160,110,${0.06 + R() * 0.1})`; g.fill();
      if (l.y > 0) {
        g.beginPath(); for (let x = 0; x <= TEXN; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, wave(l, x));
        g.strokeStyle = 'rgba(28,16,10,0.35)'; g.lineWidth = 2; g.stroke();
        g.beginPath(); for (let x = 0; x <= TEXN; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, wave(l, x) + 2.5);
        g.strokeStyle = 'rgba(210,170,120,0.12)'; g.lineWidth = 1.5; g.stroke();
      }
    }
    texSpecks(g, R, 600, '18,10,6', 0.2, 0.45, 1, 2.2);
    texSpecks(g, R, 200, '220,190,150', 0.12, 0.3, 1, 1.8);
    texPebbles(g, R, 55, 3, 9);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = R() * TEXN, y = R() * TEXN, an = Math.PI / 2 + (R() - 0.5) * 1.6;
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { an += (R() - 0.5) * 0.9; x += Math.cos(an) * 8; y += Math.sin(an) * 8; pts.push([x, y]); }
      g.strokeStyle = `rgba(36,22,14,${0.3 + R() * 0.25})`; g.lineWidth = 1 + R() * 1.2;
      texWrap(pts[0][0], pts[0][1], 50, (X, Y) => { const dx = X - pts[0][0], dy = Y - pts[0][1]; g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo : g.moveTo).call(g, p[0] + dx, p[1] + dy)); g.stroke(); });
    }
  },
  // still water: a luminous blue with soft deeper and paler pools and faint swirls
  water(g, R) {
    g.fillStyle = '#4b98d2'; g.fillRect(0, 0, TEXN, TEXN);
    texBlotches(g, R, 46, 40, 120, '160,222,248', '22,70,140', 0.3, 0.28);
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = R() * TEXN, y = R() * TEXN, r = 18 + R() * 40, a0 = R() * TAU, a1 = a0 + 0.6 + R() * 1.2, col = R() < 0.6 ? 'rgba(190,235,255,0.16)' : 'rgba(20,60,120,0.16)', w = 2 + R() * 3;
      texWrap(x, y, r + 4, (X, Y) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.ellipse(X, Y, r, r * 0.6, 0, a0, a1); g.stroke(); });
    }
  },
  // ice: pale, frosted, with a few soft cracks
  ice(g, R) {
    g.fillStyle = '#cdeaf6'; g.fillRect(0, 0, TEXN, TEXN);
    texBlotches(g, R, 40, 30, 100, '255,255,255', '120,180,215', 0.4, 0.25);
    texSpecks(g, R, 200, '255,255,255', 0.3, 0.7, 1, 2.5);
  },
  // glints on the surface, drifted across it to make it move
  ripple(g, R) {
    g.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = R() * TEXN, y = R() * TEXN, L = 8 + R() * 26, bend = (R() - 0.5) * 10, w = 1.5 + R() * 2.5, a = 0.25 + R() * 0.45;
      texWrap(x, y, L + 12, (X, Y) => {
        g.strokeStyle = `rgba(235,250,255,${a})`; g.lineWidth = w;
        g.beginPath(); g.moveTo(X - L / 2, Y); g.quadraticCurveTo(X, Y + bend, X + L / 2, Y); g.stroke();
      });
    }
    texSpecks(g, R, 60, '255,255,255', 0.5, 0.9, 1.2, 2.4);
  },
  // the rock the island hangs from, for walls over the void (L lit, R in shade): above the soil line it only
  // darkens the soil toward the rock; below, opaque rock in layers fading into the sky by about 3.4 units down
  // wooden planks for crates: four boards to a unit, grain running along them, dark gaps, a nail at each end
  wood(g, R) {
    const bh = TEXU / 4;
    for (let j = 0; j < TEXN / bh; j++) {
      const y0 = j * bh, tone = R();
      g.fillStyle = `rgb(${Math.round(150 + tone * 30)},${Math.round(100 + tone * 22)},${Math.round(58 + tone * 14)})`; g.fillRect(0, y0, TEXN, bh);
      for (let k = 0; k < 7; k++) {
        const yy = y0 + 4 + R() * (bh - 8), A = 1 + R() * 2, f = 1 + (R() * 3 | 0), ph = R() * TAU;
        g.strokeStyle = R() < 0.5 ? 'rgba(80,46,22,0.35)' : 'rgba(230,190,140,0.25)'; g.lineWidth = 1 + R() * 1.5;
        g.beginPath(); for (let x = 0; x <= TEXN; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, yy + Math.sin(x / TEXN * TAU * f + ph) * A); g.stroke();
      }
      g.fillStyle = 'rgba(255,230,190,0.25)'; g.fillRect(0, y0 + 1, TEXN, 2);
      g.fillStyle = 'rgba(40,22,10,0.6)'; g.fillRect(0, y0 + bh - 3, TEXN, 3);
      for (const nx of [TEXU * 0.12, TEXU * 0.88, TEXU * 1.12, TEXU * 1.88, TEXU * 2.12, TEXU * 2.88, TEXU * 3.12, TEXU * 3.88]) {
        g.fillStyle = 'rgba(40,30,26,0.7)'; g.beginPath(); g.arc(nx, y0 + bh / 2, 2.2, 0, TAU); g.fill();
      }
    }
    for (let i = 0; i <= 4; i++) { g.fillStyle = 'rgba(40,22,10,0.5)'; g.fillRect(i * TEXU - 2, 0, 4, TEXN); }
  },
  // soot left where grass burned: soft dark patches and grey flecks
  ash(g, R) {
    texBlotches(g, R, 40, 18, 60, '40,32,30', '14,10,10', 0.55, 0.6);
    texSpecks(g, R, 400, '120,110,104', 0.3, 0.6, 1, 2.4);
    texSpecks(g, R, 300, '10,8,8', 0.3, 0.6, 1, 2.6);
  },
  // broad patches over the cliffs, many tiles across, so long cliffs don't look the same all along
  soilMacro(g, R) {
    texBlotches(g, R, 26, 50, 150, '220,170,120', '24,12,18', 0.3, 0.42);
    texBlotches(g, R, 10, 60, 140, '150,66,36', '150,66,36', 0.16, 0.16);
    texBlotches(g, R, 8, 40, 110, '96,128,64', '96,128,64', 0.18, 0.18);
  },
  underL(g, R) { texUnder(g, R, false, TEXU, TEXN, null); },
  underR(g, R) { texUnder(g, R, true, TEXU, TEXN, null); },
};
// U texels to a world unit; the texture is W wide and 4 units tall (z 0 at the top row, −4 at the bottom)
function texUnder(g, R, dark, U, W, soil) {
  const top = U, end = U * 3.4, H = U * 4;
  g.save(); g.beginPath(); g.rect(0, top, W, H - top); g.clip();
  if (soil) {
    // the painted soil, carried on down and dimmed toward the rock's shadowed underside
    for (let y = 0; y < H; y += soil.naturalHeight) g.drawImage(soil, 0, y, W, soil.naturalHeight);
    const dg = g.createLinearGradient(0, top, 0, end); dg.addColorStop(0, 'rgba(26,14,30,0.42)'); dg.addColorStop(1, 'rgba(26,14,30,0.8)');
    g.fillStyle = dg; g.fillRect(0, top, W, H - top);
    if (dark) { g.fillStyle = 'rgba(20,10,24,0.22)'; g.fillRect(0, top, W, H - top); }
  } else {
    g.fillStyle = dark ? '#2e2230' : '#3c2c3a'; g.fillRect(0, top, W, H - top);
    for (let k = 0; k < 9; k++) {
      const y0 = top + 14 + k * 34 + R() * 10, A = 3 + R() * 5, f = 1 + (R() * 3 | 0), ph = R() * TAU;
      g.beginPath(); for (let x = 0; x <= W; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, y0 + Math.sin(x / W * TAU * f + ph) * A);
      g.strokeStyle = R() < 0.5 ? 'rgba(120,96,110,0.35)' : 'rgba(14,8,16,0.4)'; g.lineWidth = 2 + R() * 3; g.stroke();
    }
    texBlotches(g, R, 40, 20, 60, '140,110,120', '10,6,14', 0.15, 0.25);
    texSpecks(g, R, 300, '10,6,12', 0.2, 0.4, 1, 2);
  }
  g.restore();
  // fade it out downward
  const m = g.createLinearGradient(0, top, 0, end);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.5, 'rgba(0,0,0,0.78)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(0, top, W, H - top);
  g.globalCompositeOperation = 'source-over';
  // above the soil line: the soil itself (painted version only), darkening toward the rock
  if (soil) {
    g.drawImage(soil, 0, 0, W, soil.naturalHeight);
    if (dark) { g.fillStyle = 'rgba(20,10,24,0.22)'; g.fillRect(0, 0, W, top); }
  }
  const sg = g.createLinearGradient(0, 0, 0, top);
  sg.addColorStop(0, 'rgba(16,8,20,0)'); sg.addColorStop(1, dark ? 'rgba(16,8,20,0.5)' : 'rgba(16,8,20,0.42)');
  g.fillStyle = sg; g.fillRect(0, 0, W, top);
}
/* Painted textures (art/tex-*.jpg, made in the storybook painting's style) take over from the drawn ones as
   they load. `span` is how many world units one copy of a painting covers. Stone keeps the drawn slab edges and
   shading over the painting; the soil also makes the painted rock below the rim. */
const TEX_SRC = {};
const TEX_ART = { grass: { file: 'tex-grass', span: 3 }, stone: { file: 'tex-stone', span: 2 }, soil: { file: 'tex-soil', span: 2.5 }, water: { file: 'tex-water', span: 5 }, ice: { file: 'tex-ice', span: 2 }, fall: { file: 'tex-fall', span: 2 }, wood: { file: 'tex-wood', span: 1 }, runestone: { file: 'tex-runestone', span: 1.6 } };
for (const k in TEX_ART) {
  if (typeof Image === 'undefined') break;
  const im = new Image();
  im.onload = () => { try { paintedTex(k, im); } catch (e) { console.warn('texture', k, e); } };
  im.src = `art/${TEX_ART[k].file}.jpg?v=3`;
}
let TEX_VER = 0;
function paintedTex(k, im) {
  TEX_VER++;
  const span = TEX_ART[k].span, W = im.naturalWidth, H = im.naturalHeight, U = W / span;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  if (k === 'grass' || k === 'water' || k === 'ice' || k === 'fall' || k === 'wood' || k === 'runestone') TEX_SRC[k] = { c: im, u: U };
  else if (k === 'stone') {
    for (const wall of [false, true]) {
      const c = mk(W, H), g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = wall ? '#b4ae8c' : '#e6d6aa'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      texSlabs(g, mulberry(wall ? 31 : 17), wall, U, W, true);
      TEX_SRC[wall ? 'stoneSide' : 'stoneTop'] = { c, u: U };
    }
  } else if (k === 'soil') {
    TEX_SRC.soil = { c: im, u: U };
    for (const dark of [false, true]) {
      const c = mk(W, Math.round(U * 4)), g = c.getContext('2d');
      texUnder(g, null, dark, U, W, im);
      TEX_SRC[dark ? 'underR' : 'underL'] = { c, u: U };
    }
  }
}
function texSource(name) {
  if (TEX_SRC[name]) return TEX_SRC[name];
  const c = document.createElement('canvas'); c.width = c.height = TEXN;
  TEX_PAINT[name](c.getContext('2d'), mulberry(name.length * 977 + name.charCodeAt(0) * 31));
  return TEX_SRC[name] = { c, u: name === 'soilMacro' ? 56 : TEXU, drawn: true };
}
function texPattern(g, name) {
  if (!texOK) return null;
  let M = texPats.get(g); if (!M) texPats.set(g, M = {});
  const S = texSource(name);
  if (M[name] && M[name].src === S) return M[name].p;
  try { M[name] = { src: S, p: g.createPattern(S.c, 'repeat') }; } catch (e) { texOK = false; return null; }
  return M[name].p;
}
const texUnit = name => texSource(name).u;
// lay a texture on a top face at height z
function texTop(g, name, z, quad, alpha = 1, ox = 0, oy = 0) {
  const P = texPattern(g, name); if (!P) return;
  const s = cam.s / texUnit(name), o = proj(ox, oy, z);
  P.setTransform(new DOMMatrix([TW * 0.5 * s, TH * 0.5 * s, -TW * 0.5 * s, TH * 0.5 * s, o[0], o[1]]));
  const ga = g.globalAlpha; g.globalAlpha = ga * alpha; g.fillStyle = P; poly(g, quad); g.fill(); g.globalAlpha = ga;
}
// and on a wall: R the plane x = c.x + 1 (running along y), otherwise the plane y = c.y + 1 (running along x)
function texSide(g, name, c, R, quad, alpha = 1, wave = null) {
  texWall(g, name, R, R ? c.x + 1 : c.y + 1, quad, alpha, wave, R ? c.y : c.x);
}
// a texture on any upright plane: R the plane x = pc, otherwise y = pc; `a0` is where a waved face starts along it.
// Across, the texture runs by u = x - y (how far across the screen a point is), not by distance along the wall, and
// down by height: so two faces meeting at any corner, outward or inward, carry it on unbroken round the turn.
function texWall(g, name, R, pc, quad, alpha = 1, wave = null, a0 = 0) {
  const P = texPattern(g, name); if (!P) return;
  const s = cam.s / texUnit(name), o = proj(pc, pc, 0), sl = R ? -TH * 0.5 : TH * 0.5;
  if (wave) {
    // the texture is lifted by w(u) world units, w running straight from wave[0] at the face's start to wave[1] at
    // its end; with the same heights at shared ends, the layers flow on unbroken from face to face
    const us = R ? pc - a0 : a0 - pc, k = (wave[1] - wave[0]) * (R ? -1 : 1), w0 = wave[0] - k * us;
    P.setTransform(new DOMMatrix([TW * 0.5 * s, (sl - k * TZ) * s, 0, TZ * s, o[0], o[1] - w0 * TZ * cam.s]));
  } else
  P.setTransform(new DOMMatrix([TW * 0.5 * s, sl * s, 0, TZ * s, o[0], o[1]]));
  const ga = g.globalAlpha; g.globalAlpha = ga * alpha; g.fillStyle = P; poly(g, quad); g.fill(); g.globalAlpha = ga;
}
// the same, laid on a curved strip of wall: mapped exactly at the strip's two ends (world points e0 and e1, lifted
// by wave[0] and wave[1]), so it meets the flat walls either side without a break
function texChord(g, name, e0, e1, quad, alpha = 1, wave = null) {
  const P = texPattern(g, name); if (!P) return;
  const s = cam.s / texUnit(name), u0 = e0[0] - e0[1], u1 = e1[0] - e1[1], du = u1 - u0;
  const Y0 = (e0[0] + e0[1]) * TH * 0.5 - (wave ? wave[0] : 0) * TZ, Y1 = (e1[0] + e1[1]) * TH * 0.5 - (wave ? wave[1] : 0) * TZ;
  const m = Math.abs(du) > 1e-3 ? (Y1 - Y0) / du : 0;
  P.setTransform(new DOMMatrix([TW * 0.5 * s, m * s, 0, TZ * s, cam.ox, cam.oy + (Y0 - u0 * m) * cam.s]));
  const ga = g.globalAlpha; g.globalAlpha = ga * alpha; g.fillStyle = P; poly(g, quad); g.fill(); g.globalAlpha = ga;
}
/* A block drawn like the land: textured top and walls, the far wall in shade, darker toward the foot, light catching
   its near edges, no ink. Used for things that stand on the land: ice blocks, raised slabs, the gate, crates. */
function texturedBox(g, x0, y0, x1, y1, z0, z1, o) {
  const s = cam.s, A = proj(x0, y0, z1), B = proj(x1, y0, z1), C = proj(x1, y1, z1), D = proj(x0, y1, z1);
  const Bb = proj(x1, y0, z0), Cb = proj(x1, y1, z0), Db = proj(x0, y1, z0), Rf = [B, C, Cb, Bb], Lf = [D, C, Cb, Db], Tf = [A, B, C, D];
  const ga = g.globalAlpha; if (o.alpha != null) g.globalAlpha = ga * o.alpha;
  for (const [R, F, col, dark] of [[true, Rf, o.colR, 0.3], [false, Lf, o.colL, 0.08]]) {
    g.fillStyle = col; poly(g, F); g.fill();
    if (o.side) texWall(g, o.side, R, R ? x1 : y1, F, o.sideAlpha ?? 1);
    const sg = g.createLinearGradient(0, Math.min(F[0][1], F[1][1]), 0, Math.max(F[2][1], F[3][1]));
    sg.addColorStop(0, `rgba(14,10,20,${dark * 0.5})`); sg.addColorStop(1, `rgba(14,10,20,${dark + 0.3})`);
    g.fillStyle = sg; poly(g, F); g.fill();
    if (o.tint) { g.fillStyle = o.tint; poly(g, F); g.fill(); }
  }
  g.fillStyle = o.colT; poly(g, Tf); g.fill();
  if (o.top) texTop(g, o.top, z1, Tf, o.topAlpha ?? 1);
  if (o.tint) { g.fillStyle = o.tint; poly(g, Tf); g.fill(); }
  // light along the rounded near edges
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = o.rim || 'rgba(255,245,220,0.4)'; g.lineWidth = 1.4 * s;
  g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]); g.stroke();
  g.globalAlpha *= 0.55; g.beginPath(); g.moveTo(C[0], C[1]); g.lineTo(Cb[0], Cb[1]); g.moveTo(D[0], D[1]); g.lineTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  g.globalAlpha = ga;
}

/* The island's shape. Its middle (in world units) and reach, so the rock beneath can hang deepest under the
   middle and taper to the rim. Worked out once per level. */
function isleShape() {
  if (World._isleFor === World.cells && World._isle) return World._isle;
  let sx = 0, sy = 0, n = 0;
  for (const c of World.cells) if (!c.void) { sx += c.x + 0.5; sy += c.y + 0.5; n++; }
  const cx = n ? sx / n : 0, cy = n ? sy / n : 0;
  let m = 0;
  for (const c of World.cells) if (!c.void) m = Math.max(m, Math.hypot(c.x + 0.5 - cx, c.y + 0.5 - cy));
  World._isleFor = World.cells;
  return World._isle = { cx, cy, m: m + 0.8 };
}
// a point of the rock's lower edge, hanging under the world point (wx, wy): how far it drops, and where it ends
// up after leaning in toward the middle. The same point gives the same answer from both faces that share it.
function rockAt(wx, wy) {
  const I = isleShape(), dx = I.cx - wx, dy = I.cy - wy, dd = Math.hypot(dx, dy), k = clamp(1 - dd / I.m, 0, 1);
  const L = 0.3 + 2.0 * Math.pow(k, 1.15);
  const sh = dd > 0 ? Math.min(dd, L * 0.35) / dd : 0;
  return [wx + dx * sh, wy + dy * sh, L];
}
// draw in a wall's own plane: x runs along the wall in world units × TEXU, y is height × −TEXU (so textures
// and gradients line up from one tile's wall to the next)
function onPlane(g, c, R, fn) {
  const s = cam.s / TEXU, o = R ? proj(c.x + 1, 0, 0) : proj(0, c.y + 1, 0), ux = R ? -TW * 0.5 : TW * 0.5;
  g.save(); g.transform(ux * s, TH * 0.5 * s, 0, TZ * s, o[0], o[1]); fn(TEXU); g.restore();
}
const SOIL_DEPTH = 1.0, ROCK_FLOOR = -3.5;
// the foot of a tile's soil over the void: a depth below its ground, or (under a pool) below the water's surface,
// so a pool's bed sitting a little low doesn't leave its earth hanging lower than the land's beside it
// Sunken ground (a trench, a pit) is a groove cut into the land: under its floor is the island's rock, not a slab of
// soil of its own hanging lower than the land around it. So its soil stops at its floor, or at the land's soil foot.
const soilBot = c => c.water != null && c.water > c.h ? Math.min(Math.max(c.water, c.h), 0) - SOIL_DEPTH : Math.min(c.h, -SOIL_DEPTH);
// the rock's lower edge under world point (wx, wy): measured from the land's soil foot, so it is one line all round the
// island whatever the ground above it does; at least a little below `bot`, and never below the floor
function rockBottom(wx, wy, bot) { const L = rockAt(wx, wy)[2] * rockKnot(wx, wy); return Math.max(ROCK_FLOOR, Math.min(-SOIL_DEPTH - L, bot - 0.12)); }
// how far the rock hangs at a point on the rim, as a share of its usual reach: soft lumps that run on unbroken
// from wall to wall and round every corner
function rockKnot(wx, wy) { return 1 + 0.17 * Math.sin(wx * 2.9 + wy * 1.3 + 0.4) + 0.12 * Math.sin(wy * 3.7 - wx * 1.7 + 2.1); }
// how far the soil's layers are lifted at a world point on the island's rim: two slow, crossing swells
function soilWave(wx, wy) { return 0.38 * Math.sin(wx * 0.8 + wy * 0.55) + 0.22 * Math.sin(wx * 0.31 - wy * 1.3 + 2); }
function soilWaveFor(c, R) {
  return R ? [soilWave(c.x + 1, c.y), soilWave(c.x + 1, c.y + 1)] : [soilWave(c.x, c.y + 1), soilWave(c.x + 1, c.y + 1)];
}
// a stone bedded in the soil here and there, kept clear of the wall's rounded ends (where the curve is drawn over it)
function cliffDetails(g, c, R, st, bot, t, su0 = 0, su1 = 1) {
  const x = c.x, y = c.y, a0 = R ? y : x, sd = x * 5.13 + y * 2.71 + (R ? 0.37 : 0.91);
  if (hash2(sd, 1.1) < 0.42 && st - bot > 0.5) {
    const r = 0.1 + 0.09 * hash2(sd, 4.4), lo = su0 + r + 0.06, hi = su1 - r - 0.06;
    if (hi <= lo) return;
    const u = lo + (hi - lo) * hash2(sd, 2.2), zc = st - 0.32 - Math.min(0.5, st - bot - 0.45) * hash2(sd, 3.3);
    onPlane(g, c, R, U => {
      const cx = (a0 + u) * U, cy = -zc * U, pts = [];
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, j = 0.82 + 0.3 * hash2(sd + i, 5.5); pts.push([cx + Math.cos(a) * r * U * j, cy + Math.sin(a) * r * U * 0.72 * j]); }
      g.fillStyle = 'rgba(16,10,8,0.4)'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p[0] + 3, p[1] + 7)); g.closePath(); g.fill();
      const gr = g.createLinearGradient(cx - r * U, cy - r * U * 0.7, cx + r * U * 0.6, cy + r * U * 0.7);
      gr.addColorStop(0, '#b3ab8e'); gr.addColorStop(0.5, '#7c7660'); gr.addColorStop(1, '#4a4436');
      g.fillStyle = gr; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p[0], p[1])); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(34,22,16,0.45)'; g.lineWidth = 4; g.stroke();
      g.fillStyle = 'rgba(255,245,220,0.3)'; g.beginPath(); g.ellipse(cx - r * U * 0.3, cy - r * U * 0.35, r * U * 0.35, r * U * 0.16, -0.3, 0, TAU); g.fill();
    });
  }
}
/* Raised stone is drawn as rounded blocks: wherever the land drops away across both edges of a top corner, that
   corner is rounded off (radius ROUND_R), and the upright corner below it becomes a curve. The bit of tile the
   rounding leaves open is filled with the ground beside it. Corners are A, B, C, D (k = 0..3). */
const ROUND_R = 0.24;
function stoneCorners(c) {
  if (!texOK || c.icy || c.h < 1 || c.void) return null;
  const x = c.x, y = c.y, z = c.h, drop = n => !n || n.void || n.h < z - 0.01;
  const e = [drop(cellI(x, y - 1)), drop(cellI(x + 1, y)), drop(cellI(x, y + 1)), drop(cellI(x - 1, y))];
  const k = [e[3] && e[0], e[0] && e[1], e[1] && e[2], e[2] && e[3]];
  return k.some(v => v) ? k : null;
}
// Where stone blocks of one height stand side by side, each still reads as its own block: their shared corners are
// nicked (radius NOTCH_R) into a small dark gap, a groove runs along the shared top edge, and another down the
// walls where they run on from one block into the next.
const NOTCH_R = 0.1;
const sameStone = (c, n) => !!n && !n.void && !n.icy && n.h >= 1 && Math.abs(n.h - c.h) < 0.01;
function stoneJoins(c, rc) {
  if (!texOK || c.icy || c.h < 1 || c.void) return null;
  const x = c.x, y = c.y, e = [cellI(x, y - 1), cellI(x + 1, y), cellI(x, y + 1), cellI(x - 1, y)].map(n => sameStone(c, n));
  const jc = [0, 1, 2, 3].map(k => !(rc && rc[k]) && (e[(k + 3) % 4] || e[k]));
  return jc.some(v => v) ? { jc, e } : null;
}
// does this stone wall run straight on into the next block's (so a groove marks the join)?
function stoneWallGoesOn(c, R, step) {
  const m = R ? cellI(c.x, c.y + step) : cellI(c.x + step, c.y);
  if (!sameStone(c, m)) return false;
  const n = R ? cellI(c.x + 1, c.y + step) : cellI(c.x + step, c.y + 1);
  return !n || n.void || n.h < c.h - 0.001;
}
// The island's own outer corners round off too: where a grass tile's two edges both open onto the sky, its top,
// its soil wall, the grass lip and the rock below all turn the corner in a curve of radius SOIL_R.
const SOIL_R = 0.24;
function soilCorners(c) {
  if (!texOK || c.icy || c.void || c.h < 0 || c.h >= 1) return null;
  const x = c.x, y = c.y, open = n => !n || n.void;
  const e = [open(cellI(x, y - 1)), open(cellI(x + 1, y)), open(cellI(x, y + 1)), open(cellI(x - 1, y))];
  const k = [e[3] && e[0], e[0] && e[1], e[1] && e[2], e[2] && e[3]];
  return k.some(v => v) ? k : null;
}
function soilCornerCurve(g, c, k) {
  // drawn as whole strips round the curve (one fill per layer), not slice by slice: these corners are many on
  // spiky islands, and each fill of a texture costs
  const x = c.x, y = c.y, st = Math.min(c.h, 0), bot = soilBot(c), r = SOIL_R, s = cam.s, C = [[0, 0], [1, 0], [1, 1], [0, 1]][k];
  const ox = C[0] ? C[0] - r : r, oy = C[1] ? C[1] - r : r;
  const span = { 1: [-Math.PI / 4, 0], 2: [0, Math.PI / 2], 3: [Math.PI / 2, Math.PI * 3 / 4] }[k]; if (!span) return;
  const N = k === 2 ? 6 : 3, A = [], ext = Math.min(0.14, 1.6 / (r * TW * 0.5 * s));
  for (let i = 0; i <= N; i++) A.push(span[0] + (span[1] - span[0]) * i / N + (i === N ? 0.02 : 0));
  // lap over the flat wall at each end that meets one (not the end that is the island's silhouette)
  if (k !== 1) A[0] -= ext;
  if (k !== 3) A[N] += ext;
  const wx = a => x + ox + Math.cos(a) * r, wy = a => y + oy + Math.sin(a) * r, P = (a, z) => proj(wx(a), wy(a), z);
  const strip = (z0, z1) => [...A.map(a => P(a, z0)), ...A.slice().reverse().map(a => P(a, z1))];
  const plane = k === 1, wv = soilWaveFor(c, plane);
  const p0 = P(A[0], st), p1 = P(A[N], st);
  // which way it faces: across the curve, from the shaded R side to the lit L side
  const fR = clamp(span[0] / (Math.PI / 2), 0, 1), fL = clamp(span[1] / (Math.PI / 2), 0, 1), mix = f => [Math.round(86 + 24 * f), Math.round(58 + 18 * f), Math.round(40 + 11 * f)];
  const grad = (cA, cB) => { const gr = g.createLinearGradient(p0[0], 0, p1[0], 0); gr.addColorStop(0, cA); gr.addColorStop(1, cB); return gr; };
  // the soil
  const soil = strip(st, bot), cA = mix(fR), cB = mix(fL);
  g.fillStyle = grad(`rgb(${cA})`, `rgb(${cB})`); poly(g, soil); g.fill();
  // the soil's textures: each half of the curve carries on the textures of the flat wall it turns from, mapped as on
  // that wall, so the layers run on unbroken from each wall and meet only at the corner's tip
  const e0 = [wx(span[0]), wy(span[0])], e1 = [wx(span[1] + 0.02), wy(span[1] + 0.02)]; // the lip's grass is laid on this chord
  const halves = k === 2 ? [[A[0], Math.PI / 4 + 0.03, true], [Math.PI / 4, A[N], false]] : [[A[0], A[N], k === 1]];
  const room = bot - ROCK_FLOOR;
  for (const [h0, h1, Rh] of halves) {
    const as = [0, 1, 2, 3, 4].map(i => h0 + (h1 - h0) * i / 4), wv = soilWaveFor(c, Rh), un = Rh ? 'underR' : 'underL';
    const Q = [...as.map(a => P(a, st)), ...as.slice().reverse().map(a => P(a, bot))];
    texSide(g, 'soil', c, Rh, Q, 1, wv); texSide(g, 'soilMacro', c, Rh, Q); texSide(g, un, c, Rh, Q, 1, wv);
    // the rock below, leaning in and fading like the rest
    if (room > 0.05) {
      const low = as.slice().reverse().map(a => { const q = rockAt(wx(a), wy(a)); return proj(q[0], q[1], rockBottom(wx(a), wy(a), bot)); });
      texSide(g, un, c, Rh, [...as.map(a => P(a, bot)), ...low], 1, wv);
    }
  }
  // the grass lip rolling round it, with its shadow
  const lo = Math.max(bot, st - 0.45), sh = strip(st - 0.06, lo), sg = g.createLinearGradient(0, P(A[0], st - 0.06)[1], 0, P(A[0], lo)[1]); // as on the flat walls
  sg.addColorStop(0, 'rgba(14,8,18,0.5)'); sg.addColorStop(1, 'rgba(14,8,18,0)');
  g.fillStyle = sg; poly(g, sh); g.fill();
  const dz = A.map(a => 0.13 + 0.05 * Math.sin(a * 9 + x * 1.7 + y));
  const lip = [...A.map(a => P(a, st)), ...A.slice().reverse().map((a, i) => P(a, st - dz[N - i]))];
  const lg = g.createLinearGradient(0, p0[1], 0, P(A[0], st - 0.2)[1]);
  lg.addColorStop(0, fL > 0.5 ? '#8aae4a' : '#78993f'); lg.addColorStop(1, fL > 0.5 ? '#557636' : '#45632a');
  g.fillStyle = lg; poly(g, lip); g.fill();
  texChord(g, 'grass', e0, e1, lip, 0.7);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(26,40,16,0.32)'; g.lineWidth = 1.5 * s; g.beginPath(); A.forEach((a, i) => { const q = P(a, st - dz[i]); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1]); }); g.stroke();
  g.strokeStyle = 'rgba(214,236,150,0.45)'; g.beginPath(); A.forEach((a, i) => { const q = P(a, st); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1] + 0.8 * s); }); g.stroke();
}
// The island's inward corners are filled in with a curve too. Seen from the front, an inward corner is where one
// tile's R wall meets the L wall of the tile up and to its right across an empty cell; each wall stops SOIL_R short of
// the corner, and soilFillet fills the gap with grass, soil, lip and rock curving round from one wall to the other.
function soilConcave(c, R) {
  if (!texOK || c.icy || c.void || c.h < 0 || c.h >= 1) return false;
  const x = c.x, y = c.y, N = R ? cellI(x + 1, y) : cellI(x, y + 1);
  if (N && !N.void) return false;
  const Q = R ? cellI(x + 1, y - 1) : cellI(x - 1, y + 1), M = R ? cellI(x, y - 1) : cellI(x - 1, y);
  return !!Q && !Q.void && !Q.icy && Math.abs(Q.h - c.h) < 0.01 && !!M && !M.void;
}
// drawn with the tile whose L wall turns the corner (the later of the two in drawing order)
function soilFillet(g, c) {
  const X = c.x, Y = c.y + 1, r = SOIL_R, st = Math.min(c.h, 0), bot = soilBot(c), s = cam.s, N = 5, A = [], ext = Math.min(0.14, 1.6 / (r * TW * 0.5 * s));
  for (let i = 0; i <= N; i++) A.push(Math.PI + Math.PI / 2 * i / N);
  A[0] -= ext; A[N] += ext; // lapping over both walls it joins
  const wx = a => X + r + Math.cos(a) * r, wy = a => Y + r + Math.sin(a) * r, P = (a, z) => proj(wx(a), wy(a), z);
  const strip = (z0, z1) => [...A.map(a => P(a, z0)), ...A.slice().reverse().map(a => P(a, z1))], wv = soilWaveFor(c, false);
  // the grass filling the corner
  const T = growPoly([[X, Y], ...A.map(a => [wx(a), wy(a)])].map(([u, v]) => proj(u, v, st)), 0.5);
  g.fillStyle = shade('#6f8a44', 1); poly(g, T); g.fill(); texTop(g, 'grass', st, T);
  // the soil curving from the one wall round to the other, shaded like the R wall at one end and the L at the other
  const soil = strip(st, bot), pa = P(A[0], st), pb = P(A[N], st), gr = g.createLinearGradient(pa[0], 0, pb[0], 0);
  gr.addColorStop(0, '#563a28'); gr.addColorStop(1, '#6e4c33');
  g.fillStyle = gr; poly(g, soil); g.fill();
  // the textures carried on from each wall it joins (see soilCornerCurve): the R wall of the tile down and to the
  // left (the plane x = X) on the one half, this tile's L wall on the other
  const e0 = [wx(Math.PI), wy(Math.PI)], e1 = [wx(Math.PI * 1.5), wy(Math.PI * 1.5)]; // the lip's grass is laid on this chord
  const room = bot - ROCK_FLOOR, wQ = [soilWave(X, Y), soilWave(X, Y + 1)], wL = soilWaveFor(c, false);
  for (const [h0, h1, Rh] of [[A[0], Math.PI * 1.25 + 0.03, true], [Math.PI * 1.25, A[N], false]]) {
    const as = [0, 1, 2, 3].map(i => h0 + (h1 - h0) * i / 3), wv = Rh ? wQ : wL, un = Rh ? 'underR' : 'underL';
    const tex = (name, Q, w) => Rh ? texWall(g, name, true, X, Q, 1, w, Y) : texSide(g, name, c, false, Q, 1, w);
    const Q = [...as.map(a => P(a, st)), ...as.slice().reverse().map(a => P(a, bot))];
    tex('soil', Q, wv); tex('soilMacro', Q, null); tex(un, Q, wv);
    if (room > 0.05) {
      const low = as.slice().reverse().map(a => { const q = rockAt(wx(a), wy(a)); return proj(q[0], q[1], rockBottom(wx(a), wy(a), bot)); });
      tex(un, [...as.map(a => P(a, bot)), ...low], wv);
    }
  }
  // the lip and its shadow
  const lo = Math.max(bot, st - 0.45), sh = strip(st - 0.06, lo), sg = g.createLinearGradient(0, P(A[0], st - 0.06)[1], 0, P(A[0], lo)[1]); // as on the flat walls
  sg.addColorStop(0, 'rgba(14,8,18,0.5)'); sg.addColorStop(1, 'rgba(14,8,18,0)');
  g.fillStyle = sg; poly(g, sh); g.fill();
  const dz = A.map(a => 0.13 + 0.05 * Math.sin(a * 9 + X * 1.7 + Y));
  const lip = [...A.map(a => P(a, st)), ...A.slice().reverse().map((a, i) => P(a, st - dz[N - i]))];
  const lg = g.createLinearGradient(0, pa[1], 0, P(A[0], st - 0.2)[1]); lg.addColorStop(0, '#80a344'); lg.addColorStop(1, '#4d6c30');
  g.fillStyle = lg; poly(g, lip); g.fill(); texChord(g, 'grass', e0, e1, lip, 0.7);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(26,40,16,0.32)'; g.lineWidth = 1.5 * s; g.beginPath(); A.forEach((a, i) => { const q = P(a, st - dz[i]); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1]); }); g.stroke();
  g.strokeStyle = 'rgba(214,236,150,0.45)'; g.beginPath(); A.forEach((a, i) => { const q = P(a, st); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1] + 0.8 * s); }); g.stroke();
}
// the dark nick between blocks at a shared corner
function cornerNotch(g, c, k) {
  const x = c.x, y = c.y, z = c.h, C = [[0, 0], [1, 0], [1, 1], [0, 1]][k], r = NOTCH_R;
  const ox = C[0] ? C[0] - r : r, oy = C[1] ? C[1] - r : r, a0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][k];
  const pts = [[C[0], C[1]]];
  for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); }
  g.fillStyle = 'rgba(26,24,18,0.85)'; poly(g, growPoly(pts.map(([u, v]) => proj(x + u, y + v, z)), 0.4)); g.fill();
}
// the ground level beside corner k: the highest neighbour there that is lower than the block (or the soil's top)
function cornerBase(c, k) {
  const [dx, dy] = DIAG[k];
  let zb = 0;
  for (const n of [cellI(c.x + dx, c.y), cellI(c.x, c.y + dy), cellI(c.x + dx, c.y + dy)]) if (n && !n.void && n.h < c.h - 0.01) zb = Math.max(zb, n.h);
  return zb;
}
// a top's outline in its unit square, corners rounded where asked; each point remembers which edge (or arc) it ends
function roundedOutline(radii) {
  const pts = [], C = [[0, 0], [1, 0], [1, 1], [0, 1]], a0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
  for (let k = 0; k < 4; k++) {
    const [cx, cy] = C[k], r = radii[k];
    if (!r) { pts.push([cx, cy]); continue; }
    const ox = cx ? cx - r : r, oy = cy ? cy - r : r;
    for (let i = 0; i <= 6; i++) { const a = a0[k] + i / 6 * Math.PI / 2; pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); }
  }
  return pts;
}
function growPoly(P, px) {
  let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; } cx /= P.length; cy /= P.length;
  return P.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * px * 1.8, p[1] + dy / L * px]; });
}
// the open bit of tile beside a rounded corner, filled with the ground that lies there
function cornerGround(g, c, k) {
  const zb = cornerBase(c, k), x = c.x, y = c.y, C = [[0, 0], [1, 0], [1, 1], [0, 1]][k], r = ROUND_R;
  const ox = C[0] ? C[0] - r : r, oy = C[1] ? C[1] - r : r, a0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][k];
  const pts = [[C[0], C[1]]];
  for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); }
  const P = growPoly(pts.map(([u, v]) => proj(x + u, y + v, zb)), 0.5);
  const fake = { h: zb, icy: false };
  g.fillStyle = topColor(fake, { tone: 0.5 }); poly(g, P); g.fill();
  texTop(g, zb >= 1 ? 'stoneTop' : zb < -0.01 ? 'dirt' : 'grass', zb, P);
  // the block's foot shades the ground round the curve
  const [cx, cy] = proj(x + ox, y + oy, zb), R = r * 1.9 * TW * 0.7071 * cam.s;
  g.save(); poly(g, P); g.clip();
  const sg = g.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
  sg.addColorStop(0, 'rgba(18,10,30,0.4)'); sg.addColorStop(1, 'rgba(18,10,30,0)');
  g.fillStyle = sg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
}
// the curved upright corner of a rounded block, from its top down to the ground beside it; only the part turned
// toward the viewer (between the R and L walls' facings) is drawn
function cornerCurve(g, c, k) {
  const x = c.x, y = c.y, top = c.h, zb = cornerBase(c, k), r = ROUND_R, C = [[0, 0], [1, 0], [1, 1], [0, 1]][k];
  const ox = C[0] ? C[0] - r : r, oy = C[1] ? C[1] - r : r;
  const span = { 1: [-Math.PI / 4, 0], 2: [0, Math.PI / 2], 3: [Math.PI / 2, Math.PI * 3 / 4] }[k]; if (!span) return;
  const N = k === 2 ? 8 : 4, colR = [87, 90, 72], colL = [108, 111, 88];
  for (let i = 0; i < N; i++) {
    const a1 = span[0] + (span[1] - span[0]) * i / N, a2 = span[0] + (span[1] - span[0]) * (i + 1) / N, am = (a1 + a2) / 2;
    const P = (a, z) => proj(x + ox + Math.cos(a) * r, y + oy + Math.sin(a) * r, z);
    const q = [P(a1, top), P(a2 + 0.02, top), P(a2 + 0.02, zb), P(a1, zb)];
    // shade by facing: turned toward +x it matches the shaded R wall, toward +y the lit L wall, with a soft
    // highlight where it faces the light most
    const f = clamp(am / (Math.PI / 2), 0, 1), hl = Math.max(0, Math.sin((f - 0.45) * Math.PI)) * 18;
    const col = colR.map((v, j) => Math.round(v + (colL[j] - v) * f + hl));
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; poly(g, q); g.fill();
    texSide(g, 'stoneSide', c, f < 0.5, q, 0.85);
    const gy0 = q[0][1], gy1 = q[3][1], sg = g.createLinearGradient(0, gy0, 0, gy1);
    sg.addColorStop(0, `rgba(16,14,24,${0.18 * (1 - f)})`); sg.addColorStop(1, `rgba(16,14,24,${0.55 - 0.13 * f})`);
    g.fillStyle = sg; poly(g, q); g.fill();
    const cap = Math.min(0.16, (top - zb) * 0.3), q2 = [P(a1, top), P(a2 + 0.02, top), P(a2 + 0.02, top - cap), P(a1, top - cap)];
    const cg = g.createLinearGradient(0, q2[0][1], 0, q2[3][1]); cg.addColorStop(0, 'rgba(255,240,205,0.45)'); cg.addColorStop(1, 'rgba(255,240,205,0.06)');
    g.fillStyle = cg; poly(g, q2); g.fill();
  }
  if (texOK && SPRITE['moss-lip']) {
    // the moss along the top and at the foot carries on round the corner (in shade on the half turned toward +x)
    const ew = a => [x + ox + Math.cos(a) * r, y + oy + Math.sin(a) * r], P = (a, z) => proj(x + ox + Math.cos(a) * r, y + oy + Math.sin(a) * r, z);
    const mid = (span[0] + span[1]) / 2, halves = k === 2 ? [[span[0], Math.PI / 4, true], [Math.PI / 4, span[1] + 0.02, false]] : [[span[0], span[1] + 0.02, k === 1]];
    const tall = top - zb;
    for (const [b0, b1, Rs] of halves) {
      if (!wallMossy(x, y, Rs)) continue;
      const As = [0, 1, 2, 3, 4].map(i => b0 + (b1 - b0) * i / 4), e0 = ew(b0), e1 = ew(b1);
      const strip = (z0, z1) => [...As.map(a => P(a, z0)), ...As.slice().reverse().map(a => P(a, z1))];
      const hz = Math.min(0.5, tall * 0.6);
      mossOn(g, Rs ? 0.32 : 0, false, e0, e1, strip(top, Math.max(zb, top - hz - 0.02)), top, hz);
      if (tall >= 0.3) { const hf = Math.min(0.34, tall * 0.35); mossOn(g, Rs ? 0.45 : 0.2, true, e0, e1, strip(zb + hf, zb), zb, hf); }
    }
  }
}

// the curved stretches of a tile's walls (its rounded corners, and the inward corner it fills), each as a polygon
// with the flat wall it turns from (a tile and side), so light falls on it as on that wall
function curveLightQuads(c) {
  const out = [], rc = stoneCorners(c), sc = soilCorners(c), x = c.x, y = c.y;
  const arcQ = (X, Y, r, ox, oy, a0, a1, z0, z1) => {
    const as = [0, 1, 2, 3, 4].map(i => a0 + (a1 - a0) * i / 4), P = (a, z) => proj(X + ox + Math.cos(a) * r, Y + oy + Math.sin(a) * r, z);
    return [...as.map(a => P(a, z0)), ...as.slice().reverse().map(a => P(a, z1))];
  };
  const corner = (k, r, z0, z1) => {
    const C = CORN[k], ox = C[0] ? C[0] - r : r, oy = C[1] ? C[1] - r : r;
    if (k === 2) { out.push([c, true, arcQ(x, y, r, ox, oy, 0, Math.PI / 4 + 0.03, z0, z1), z0, z1], [c, false, arcQ(x, y, r, ox, oy, Math.PI / 4, Math.PI / 2 + 0.02, z0, z1), z0, z1]); }
    else if (k === 1) out.push([c, true, arcQ(x, y, r, ox, oy, -Math.PI / 4, 0.02, z0, z1), z0, z1]);
    else if (k === 3) out.push([c, false, arcQ(x, y, r, ox, oy, Math.PI / 2, Math.PI * 0.75, z0, z1), z0, z1]);
  };
  if (rc && c.h > 0.01) for (const k of [1, 2, 3]) if (rc[k]) corner(k, ROUND_R, c.h, cornerBase(c, k));
  if (sc) for (const k of [1, 2, 3]) if (sc[k]) corner(k, SOIL_R, Math.min(c.h, 0), soilBot(c));
  if (soilConcave(c, false)) {
    const X = x, Y = y + 1, r = SOIL_R, z0 = Math.min(c.h, 0), z1 = soilBot(c);
    out.push([{ x: X - 1, y: Y }, true, arcQ(X, Y, r, r, r, Math.PI, Math.PI * 1.25 + 0.03, z0, z1), z0, z1], [c, false, arcQ(X, Y, r, r, r, Math.PI * 1.25, Math.PI * 1.5, z0, z1), z0, z1]);
  }
  return out;
}
function lightCurves(g, c) { for (const [o, R, Q, z0, z1] of curveLightQuads(c)) lightSide(g, o, R, z0, z1, Q); }
function drawSideFaces(g, c, d, t) {
  const x = c.x, y = c.y, top = c.h, rc = stoneCorners(c), sc = soilCorners(c), cr = rc || sc, R0 = rc ? ROUND_R : SOIL_R;
  let fillet = false;
  for (const side of ['R', 'L']) {
    const n = side === 'R' ? cellI(x + 1, y) : cellI(x, y + 1);
    let bot, toVoid = false;
    if (!n || n.void) { bot = soilBot(c); toVoid = true; }
    else bot = n.h;
    if (bot >= top - 0.001 && !(toVoid && bot > ROCK_FLOOR + 0.05)) continue; // (a groove's floor over the void still has its rock below)
    const P = side === 'R' ? [proj(x + 1, y, top), proj(x + 1, y + 1, top), proj(x + 1, y + 1, bot), proj(x + 1, y, bot)]
      : [proj(x, y + 1, top), proj(x + 1, y + 1, top), proj(x + 1, y + 1, bot), proj(x, y + 1, bot)];
    const face = (za, zb) => side === 'R' ? [proj(x + 1, y, za), proj(x + 1, y + 1, za), proj(x + 1, y + 1, zb), proj(x + 1, y, zb)]
      : [proj(x, y + 1, za), proj(x + 1, y + 1, za), proj(x + 1, y + 1, zb), proj(x, y + 1, zb)];
    const R = side === 'R', s = cam.s, a0 = R ? y : x;
    // where a rounded block's wall starts and ends along its edge
    let u0 = cr && (R ? cr[1] : cr[3]) ? R0 : 0, u1 = cr && cr[2] ? 1 - R0 : 1, su0 = sc ? u0 : 0, su1 = sc ? u1 : 1;
    const cc = soilConcave(c, R);
    if (cc) { u0 = SOIL_R; su0 = SOIL_R; if (!R) fillet = true; }
    const faceS = (za, zb) => side === 'R' ? [proj(x + 1, y + u0, za), proj(x + 1, y + u1, za), proj(x + 1, y + u1, zb), proj(x + 1, y + u0, zb)]
      : [proj(x + u0, y + 1, za), proj(x + u1, y + 1, za), proj(x + u1, y + 1, zb), proj(x + u0, y + 1, zb)];
    // light, once the face is painted (the land carries no ink outlines: faces are told apart by their shading)
    const finish = () => lightSide(g, c, R, top, bot, P);
    if (c.icy) {
      g.fillStyle = R ? '#7fb4d0' : '#a6d6ea'; poly(g, P); g.fill();
      if (texOK) { texSide(g, 'ice', c, R, P, 0.8); const sg = g.createLinearGradient(0, P[0][1], 0, P[2][1]); sg.addColorStop(0, 'rgba(255,255,255,0.25)'); sg.addColorStop(1, `rgba(30,70,110,${R ? 0.35 : 0.2})`); g.fillStyle = sg; poly(g, P); g.fill(); }
      else { g.fillStyle = R ? '#9cd0e6' : '#c4e8f6'; poly(g, face(top, Math.max(bot, top - 0.18))); g.fill(); }
      finish(); continue;
    }
    // raised stone: smooth slabs above the ground line, with moss spilling over the top
    if (top > 0.01) {
      const sb = Math.max(bot, 0);
      g.fillStyle = R ? '#575a48' : '#6c6f58'; poly(g, faceS(top, sb)); g.fill();
      // below the ground beside a rounded corner (a lower block's top), the wall runs on square to its corner:
      // the curve stops there, and cutting the wall short below it would leave a notch open to the sky
      for (const [k, ua, ub] of [[R ? 1 : 3, 0, u0], [2, u1, 1]]) {
        if (!(rc && rc[k]) || ub - ua < 0.001) continue;
        const zc = Math.min(cornerBase(c, k), top); if (zc <= sb + 0.01) continue;
        const at = (u, z) => R ? proj(x + 1, y + u, z) : proj(x + u, y + 1, z), Q = [at(ua, zc), at(ub, zc), at(ub, sb), at(ua, sb)];
        g.fillStyle = R ? '#575a48' : '#6c6f58'; poly(g, Q); g.fill();
        if (texOK) texSide(g, 'stoneSide', c, R, Q);
        const qg = g.createLinearGradient(0, Q[0][1], 0, Q[2][1]);
        qg.addColorStop(0, `rgba(16,14,24,${R ? 0.3 : 0.14})`); qg.addColorStop(1, `rgba(16,14,24,${R ? 0.55 : 0.42})`);
        g.fillStyle = qg; poly(g, Q); g.fill();
      }
      const mossy = wallMossy(x, y, R), tall = top - sb;
      if (texOK) {
        texSide(g, 'stoneSide', c, R, faceS(top, sb));
        g.fillStyle = blockTone(x, y); poly(g, faceS(top, sb)); g.fill();
        // light falls off down the wall into the shade at its foot, the shaded side darker all over, and the rounded
        // top edge catches the light
        onPlane(g, c, R, U => {
          const Z = z => -z * U, a = (R ? y : x) * U;
          const sg = g.createLinearGradient(0, Z(top), 0, Z(sb));
          sg.addColorStop(0, R ? 'rgba(16,14,24,0.18)' : 'rgba(16,14,24,0)'); sg.addColorStop(0.55, R ? 'rgba(16,14,24,0.3)' : 'rgba(16,14,24,0.12)'); sg.addColorStop(1, R ? 'rgba(16,14,24,0.55)' : 'rgba(16,14,24,0.42)');
          g.fillStyle = sg; g.fillRect(a + u0 * U, Z(top), (u1 - u0) * U, Z(sb) - Z(top));
          // the top slab: a band lighter than the block below, rounded over at its top edge, casting a soft
          // shadow onto the block just beneath its lip
          const cap = Math.min(0.16, (top - sb) * 0.3);
          if (cap > 0.04) {
            const cg = g.createLinearGradient(0, Z(top), 0, Z(top - cap));
            cg.addColorStop(0, 'rgba(255,240,205,0.5)'); cg.addColorStop(0.3, 'rgba(255,240,205,0.2)'); cg.addColorStop(1, 'rgba(255,240,205,0.08)');
            g.fillStyle = cg; g.fillRect(a + u0 * U, Z(top), (u1 - u0) * U, Z(top - cap) - Z(top));
            const ug = g.createLinearGradient(0, Z(top - cap), 0, Z(top - cap - 0.14));
            ug.addColorStop(0, 'rgba(18,14,10,0.42)'); ug.addColorStop(1, 'rgba(18,14,10,0)');
            g.fillStyle = ug; g.fillRect(a + u0 * U, Z(top - cap), (u1 - u0) * U, Z(top - cap - 0.14) - Z(top - cap));
          }
          // damp rising from the foot: darker and a little green low down, fading up the wall
          const dh = Math.min(0.7, tall * 0.5), dmp = g.createLinearGradient(0, Z(sb), 0, Z(sb + dh));
          dmp.addColorStop(0, `rgba(30,44,24,${R ? 0.32 : 0.24})`); dmp.addColorStop(1, 'rgba(30,44,24,0)');
          g.fillStyle = dmp; g.fillRect(a + u0 * U, Z(sb + dh), (u1 - u0) * U, Z(sb) - Z(sb + dh));
          // under moss, a few faint streaks where water has run down the stone
          if (mossy && tall > 0.4) for (let k = 0; k < 3; k++) {
            const hs = x * 5.1 + y * 2.3 + (R ? 3 : 7) + k * 1.7; if (hash2(hs, 1.4) > 0.65) continue;
            const us = a + (u0 + (u1 - u0) * (0.12 + 0.76 * hash2(hs, 2.8))) * U, w = (0.025 + 0.03 * hash2(hs, 3.9)) * U, len = tall * (0.35 + 0.4 * hash2(hs, 5.2));
            const st2 = g.createLinearGradient(0, Z(top - 0.06), 0, Z(top - len));
            st2.addColorStop(0, 'rgba(28,36,22,0.2)'); st2.addColorStop(1, 'rgba(28,36,22,0)');
            g.fillStyle = st2;
            g.fillRect(us - w, Z(top - 0.06), w * 2, Z(top - len) - Z(top - 0.06));
            g.fillRect(us - w * 0.4, Z(top - 0.06), w * 0.8, Z(top - len) - Z(top - 0.06));
          }
          // rounded upright corners: where the block turns a corner toward us, the lit wall brightens and the
          // shaded wall darkens as they roll round it
          const nearOpen = R ? (() => { const n = cellI(x, y + 1); return !n || n.void || n.h < top - 0.01; })()
            : (() => { const n = cellI(x + 1, y); return !n || n.void || n.h < top - 0.01; })();
          // a groove down the wall where it runs on into the next block's
          // (shallow and soft, as an old joint is; in running bond, left to the slabs' own joints)
          if (!STONE_BOND) for (const [step, ue] of [[-1, 0], [1, 1]]) {
            if (!stoneWallGoesOn(c, R, step)) continue;
            const ex = (a0 + ue) * U, dir = ue ? -1 : 1;
            const dg = g.createLinearGradient(ex, 0, ex + dir * 0.06 * U, 0);
            dg.addColorStop(0, 'rgba(22,20,14,0.38)'); dg.addColorStop(1, 'rgba(22,20,14,0)');
            g.fillStyle = dg; g.fillRect(Math.min(ex, ex + dir * 0.06 * U), Z(top), 0.06 * U, Z(sb) - Z(top));
            const lg = g.createLinearGradient(ex + dir * 0.05 * U, 0, ex + dir * 0.17 * U, 0);
            lg.addColorStop(0, 'rgba(255,240,205,0.07)'); lg.addColorStop(1, 'rgba(255,240,205,0)');
            g.fillStyle = lg; g.fillRect(Math.min(ex + dir * 0.05 * U, ex + dir * 0.17 * U), Z(top), 0.12 * U, Z(sb) - Z(top));
            // dirt and a thread of moss settled into the joint's foot
            const hj = x * 2.2 + y * 4.7 + ue * 3.1 + (R ? 1 : 5);
            if (hash2(hj, 6.1) < 0.6) {
              const zt = sb + tall * (0.12 + 0.22 * hash2(hj, 2.9)), jg = g.createLinearGradient(0, Z(sb), 0, Z(zt));
              jg.addColorStop(0, 'rgba(62,78,40,0.55)'); jg.addColorStop(1, 'rgba(62,78,40,0)');
              g.fillStyle = jg; g.fillRect(Math.min(ex, ex + dir * 0.05 * U), Z(zt), 0.05 * U, Z(sb) - Z(zt));
            }
          }
          if (nearOpen && !(rc && rc[2])) {
            const e = (R ? y : x) + 1, rg = g.createLinearGradient(e * U, 0, (e - 0.16) * U, 0);
            if (R) { rg.addColorStop(0, 'rgba(14,10,12,0.3)'); rg.addColorStop(1, 'rgba(14,10,12,0)'); }
            else { rg.addColorStop(0, 'rgba(255,240,205,0.3)'); rg.addColorStop(1, 'rgba(255,240,205,0)'); }
            g.fillStyle = rg; g.fillRect((e - 0.16) * U, Z(top), 0.16 * U, Z(sb) - Z(top));
          }
        });
      } else {
        g.strokeStyle = 'rgba(40,32,30,0.25)'; g.lineWidth = 1;
        for (let z = top - 0.5; z > sb + 0.05; z -= 0.5) { const a = face(z, z)[0], b = face(z, z)[1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      }
      if (!texOK) { g.fillStyle = R ? '#4f6a32' : '#62803c'; poly(g, faceS(top, Math.max(sb, top - 0.1))); g.fill(); }
      else {
        const sd = x * 3.7 + y * 5.3 + (R ? 0 : 9), lip = Math.max(sb, top - 0.04);
        // moss grows where it's damp and shaded: most walls in shade have it at the top and the foot, walls in the
        // light seldom do (the bare edges are what keep it from reading as trim)
        if (mossy || hash2(sd, 6.6) < 0.22) {
          mossFoot(g, c, R, top, sb, u0, u1);
          // and along the foot of the squared-off wall below a rounded corner
          for (const [k, ua, ub] of [[R ? 1 : 3, 0, u0], [2, u1, 1]]) if (rc && rc[k] && ub - ua > 0.001 && Math.min(cornerBase(c, k), top) > sb + 0.01) mossFoot(g, c, R, top, sb, ua, ub);
        }
        if (SPRITE['moss-lip']) { if (mossy) mossLip(g, c, R, top, sb, u0, u1); }
        else {
        g.fillStyle = R ? '#56743a' : '#6a8a44'; poly(g, faceS(top, lip)); g.fill();
        for (let k = 0; k < 5; k++) {
          if (hash2(sd + k, 2.3) < 0.35) continue;
          const u = u0 + (u1 - u0) * (k + 0.2 + hash2(sd + k, 5.1) * 0.6) / 5, wd = 0.05 + hash2(sd + k, 7.7) * 0.06, dz = Math.min(top - sb - 0.02, 0.08 + hash2(sd + k, 9.9) * 0.26);
          const at = (uu, zz) => R ? proj(x + 1, y + uu, zz) : proj(x + uu, y + 1, zz);
          const a = at(u - wd, top - 0.02), b = at(u + wd, top - 0.02), m = at(u, top - dz), w = (b[0] - a[0]) * 0.55;
          g.beginPath(); g.moveTo(a[0], a[1]);
          g.bezierCurveTo(a[0], a[1] + (m[1] - a[1]) * 0.6, m[0] - w, m[1], m[0], m[1]);
          g.bezierCurveTo(m[0] + w, m[1], b[0], b[1] + (m[1] - b[1]) * 0.6, b[0], b[1]);
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(190,215,130,0.35)'; poly(g, faceS(top, Math.max(sb, top - 0.015))); g.fill();
        }
        const vs = x * 2.93 + y * 6.11 + (R ? 1.3 : 4.1), span = u1 - u0;
        const onW = (u, z) => R ? proj(x + 1, y + u, z) : proj(x + u, y + 1, z);
        // a drape of moss toward one end of the wall, an ivy sprig toward the other
        const drape = mossy && SPRITE['moss-drape'] && hash2(vs, 6.3) < 0.3 && tall > 0.45 && span > 0.5, ivy = hash2(vs, 3.7) < 0.32 && tall > 0.6 ? ivyFor(vs) : null;
        const side = hash2(vs, 2.7) < 0.5, uD = u0 + span * (side ? 0.3 : 0.7) + (hash2(vs, 2.2) - 0.5) * 0.12 * span;
        const uV = drape ? u0 + span * (side ? 0.78 : 0.22) : u0 + span * (0.2 + 0.6 * hash2(vs, 8.1));
        if (drape) hangDrape(g, R, onW(uD, top + 0.005), Math.min(span * 0.75, 0.42 + 0.2 * hash2(vs, 4.4)), Math.min(tall * 0.8, 0.38 + 0.4 * hash2(vs, 5.7)), hash2(vs, 7.9) < 0.5);
        if (ivy) hangVine(g, ivy, onW(uV, top - 0.02), tall * (0.5 + 0.35 * hash2(vs, 9.2)), t, vs * 5, hash2(vs, 1.9) < 0.5);
      }
    }
    // the earth beneath
    const st = Math.min(top, 0);
    if (bot < st - 0.001 || (toVoid && bot > ROCK_FLOOR + 0.05)) {
      const Q = (sc || cc) ? faceS(st, bot) : face(st, bot), low = c.h < 0, soilFace = bot < st - 0.001;
      const wv = soilWaveFor(c, R);
      if (soilFace) { g.fillStyle = low ? (R ? '#3e3226' : '#4c3e2e') : (R ? '#563a28' : '#6e4c33'); poly(g, Q); g.fill(); }
      if (!soilFace) { /* a groove's floor sits right on the rock */ }
      else if (texOK) {
        texSide(g, 'soil', c, R, Q, 1, wv);
        texSide(g, 'soilMacro', c, R, Q);
        if (toVoid) texSide(g, R ? 'underR' : 'underL', c, R, Q, 1, wv);
        if (c.h >= 0) cliffDetails(g, c, R, st, bot, t, su0, su1);
      } else {
        g.strokeStyle = 'rgba(30,18,10,0.3)'; g.lineWidth = 1;
        for (let z = st - 0.32; z > bot + 0.25; z -= 0.38) { const a = face(z, z)[0], b = face(z + (R ? 0.04 : -0.04), 0)[1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      }
      // over the void, the rock the island grew from hangs below the soil, tapering to the rim and fading into the sky
      if (toVoid) {
        // the rock's lower edge, in soft lumps: a gentle swell between knots at each quarter of the edge, eased from
        // one to the next (the corners take no swell, so neighbouring faces meet)
        const pts = [], room = bot - ROCK_FLOOR;
        for (let i = 16; i >= 0; i--) {
          const u = su0 + (su1 - su0) * i / 16, wpx = R ? x + 1 : x + u, wpy = R ? y + u : y + 1;
          const [rx, ry] = rockAt(wpx, wpy);
          pts.push([rx, ry, rockBottom(wpx, wpy, bot)]);
        }
        if (room > 0.05) {
          const end = u => R ? proj(x + 1, y + u, bot) : proj(x + u, y + 1, bot);
          const poly5 = [end(su0), end(su1), ...pts.map(p => proj(p[0], p[1], p[2]))];
          if (texOK) texSide(g, R ? 'underR' : 'underL', c, R, poly5, 1, wv);
          else { g.fillStyle = 'rgba(46,32,42,0.8)'; poly(g, poly5); g.fill(); }
        }
      }
      // roots and mossy strands hanging from the underside of the island's rim
      const vines = SPRITE['vine-leafy'] && SPRITE['vine-moss'] && SPRITE['vine-roots'];
      if (toVoid && c.h >= 0 && vines) {
        // now and then a leafy vine or a mossy strand spills from under the grass lip, or a tangle of roots hangs
        // from the soil's foot over the rock
        const sd = x * 4.31 + y * 7.17 + (R ? 0.5 : 2.5);
        for (let k = 0; k < 2; k++) {
          if (hash2(sd + k * 3.3, 1.7) > (k ? 0.22 : 0.5)) continue;
          const kind = k ? 2 : hash2(sd, 2.9) < 0.38 ? 0 : hash2(sd, 2.9) < 0.68 ? 1 : 2;
          const u = su0 + (su1 - su0) * (0.18 + 0.64 * hash2(sd + k, 4.4));
          const im = kind === 0 ? ivyFor(sd + k * 0.7) || SPRITE['vine-leafy'] : SPRITE[['vine-leafy', 'vine-moss', 'vine-roots'][kind]];
          const zt = kind === 2 ? bot + 0.18 : st - 0.07, len = [1.9 + 1.2 * hash2(sd, 5.5), 1.5 + 1.0 * hash2(sd, 5.5), 1.1 + 0.6 * hash2(sd + k, 5.5)][kind];
          HANG.push({ k: x + y, im, p: R ? proj(x + 1, y + u, zt) : proj(x + u, y + 1, zt), len, ph: sd * 3 + k, flip: hash2(sd, 6.6) < 0.5 });
        }
        if (SPRITE['moss-drape'] && hash2(sd, 8.8) < 0.2 && su1 - su0 > 0.5) {
          const u = su0 + (su1 - su0) * (0.3 + 0.4 * hash2(sd, 3.9));
          HANG.push({ k: x + y, drape: true, R, p: R ? proj(x + 1, y + u, st - 0.05) : proj(x + u, y + 1, st - 0.05), wU: 0.45 + 0.2 * hash2(sd, 7.1), hZ: 0.55 + 0.45 * hash2(sd, 2.4), flip: hash2(sd, 5.2) < 0.5 });
        }
      } else if (toVoid && c.h >= 0) {
        // a root or a mossy vine now and then, hanging from the soil over the rock: thick where it leaves the earth,
        // curling as it hangs, thinning and fading to its tip, swaying a little
        g.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const cr = d.cracks[k + (R ? 0 : 2)];
          if (hash2(x * 3.1 + k, y * 2.3 + (R ? 1 : 5)) > (k ? 0.25 : 0.6)) continue;
          const u = 0.15 + cr.u * 0.7, z0 = bot + 0.25 + cr.v * 0.3, len = 0.45 + cr.l * 1.6, moss = cr.a > 3.6;
          const p0 = R ? proj(x + 1, y + u, z0) : proj(x + u, y + 1, z0), L = len * TZ * s;
          const sw = Math.sin(t * 0.7 + cr.a * 3) * 2.5 * s, curl = (hash2(cr.a, 7.7) - 0.5) * 14 * s;
          const pt = q => {
            const a = 1 - q, b0 = a * a * a, b1 = 3 * a * a * q, b2 = 3 * a * q * q, b3 = q * q * q;
            return [p0[0] * b0 + (p0[0] + curl) * b1 + (p0[0] - curl * 0.8 + sw) * b2 + (p0[0] + curl * 0.3 + sw * 1.4) * b3,
              p0[1] * b0 + (p0[1] + L * 0.3) * b1 + (p0[1] + L * 0.7) * b2 + (p0[1] + L) * b3];
          };
          const w0 = (moss ? 2.2 : 3.0) * s, col = moss ? [84, 118, 64] : [74, 52, 38], SEG = 10;
          let prev = pt(0);
          for (let i = 1; i <= SEG; i++) {
            const q = i / SEG, p = pt(q);
            g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.95 * (1 - q * q * 0.85)).toFixed(3)})`;
            g.lineWidth = Math.max(0.6 * s, w0 * (1 - q * 0.8));
            g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
            prev = p;
          }
          if (moss) {
            g.fillStyle = 'rgba(118,158,86,0.85)';
            for (const q of [0.3, 0.5, 0.68, 0.85]) { const p = pt(q), sd = q > 0.55 ? -1 : 1; g.beginPath(); g.ellipse(p[0] + sd * 2.6 * s, p[1], 2.6 * s * (1.1 - q * 0.5), 1.3 * s, sd * 0.6, 0, TAU); g.fill(); }
          }
        }
      }
      // the grass rolls over the edge in a thick, rounded lip, scalloped along its lower edge, with a soft shadow beneath
      if (top <= 0.01 && c.h >= 0) {
        if (texOK) onPlane(g, c, R, U => {
          const Z = z => -z * U, A = a => a * U, lo = Math.max(bot, st - 0.45);
          // the shadow the overhang throws on the soil
          const sg = g.createLinearGradient(0, Z(st - 0.06), 0, Z(lo));
          sg.addColorStop(0, 'rgba(14,8,18,0.5)'); sg.addColorStop(1, 'rgba(14,8,18,0)');
          g.fillStyle = sg; g.fillRect(A(a0 + su0), Z(st - 0.06), (su1 - su0) * U, Z(lo) - Z(st - 0.06));
          // the lip: three rounded bumps an edge, each its own depth, meeting at the tile corners at a shared depth
          // two to four bumps an edge, of uneven widths and depths, so the lip doesn't read as a row of scallops
          const d0 = 0.1, hs = (R ? x : y) * 1.9 + a0 * 3.7, nB = 2 + (hash2(hs, R ? 1.3 : 2.9) * 3 | 0), knots = [a0 + su1];
          for (let k = 1; k < nB; k++) knots.push(a0 + su1 - (su1 - su0) * (k + (hash2(hs + k, 6.1) - 0.5) * 0.5) / nB);
          knots.push(a0 + su0);
          const bumps = () => {
            for (let k = 0; k < knots.length - 1; k++) {
              const u1 = knots[k], u0 = knots[k + 1], w = u1 - u0, db = Math.min(st - bot - 0.01, 0.12 + 0.14 * hash2(hs + k * 1.7, R ? 4.1 : 8.3) * Math.min(1, w * 3));
              g.bezierCurveTo(A(u1 - w * 0.2), Z(st - db * 1.3), A(u0 + w * 0.2), Z(st - db * 1.3), A(u0), Z(st - d0));
            }
          };
          const path = () => {
            g.beginPath(); g.moveTo(A(a0 + su0), Z(st)); g.lineTo(A(a0 + su1), Z(st)); g.lineTo(A(a0 + su1), Z(st - d0));
            bumps(); g.closePath();
          };
          const lg = g.createLinearGradient(0, Z(st), 0, Z(st - 0.26));
          lg.addColorStop(0, R ? '#78993f' : '#8aae4a'); lg.addColorStop(1, R ? '#45632a' : '#557636');
          path(); g.fillStyle = lg; g.fill();
          const GP = texPattern(g, 'grass'); if (GP) { const k = TEXU / texUnit('grass'); GP.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); g.globalAlpha = 0.7; g.fillStyle = GP; g.fill(); g.globalAlpha = 1; }
          // ink round the lip's underside, and a lit rim where it rolls over
          g.lineJoin = 'round'; g.lineCap = 'round';
          g.strokeStyle = 'rgba(26,40,16,0.32)'; g.lineWidth = 6;
          g.beginPath(); g.moveTo(A(a0 + su1), Z(st - d0)); bumps(); g.stroke();
          g.strokeStyle = 'rgba(214,236,150,0.45)'; g.lineWidth = 6;
          g.beginPath(); g.moveTo(A(a0 + su0), Z(st) + 3); g.lineTo(A(a0 + su1), Z(st) + 3); g.stroke();
        });
        else {
          const L = face(st, st - 0.13);
          g.fillStyle = R ? '#4d6a30' : '#5e7e38'; poly(g, L); g.fill();
        }
      }
    }
    finish();
  }
  if (rc && top > 0.01) for (const k of [1, 3, 2]) if (rc[k]) cornerCurve(g, c, k);
  if (sc) for (const k of [1, 3, 2]) if (sc[k]) soilCornerCurve(g, c, k);
  if (fillet) soilFillet(g, c);
  if (!NO_LIGHT && LIGHTS.length) lightCurves(g, c);
}

function topColor(c, d) {
  if (c.icy) return shade('#cdeefa', 0.92 + d.tone * 0.12);
  if (c.h < -0.01) return shade('#6a4a34', 0.95 + d.tone * 0.1);
  if (c.h >= 1) return shade('#a29f80', 0.9 + d.tone * 0.16);
  return shade('#6f8a44', 0.97 + d.tone * 0.06);
}

/* Soft bands along a top face's edges (shade at the foot of a wall, a lit chamfer, light where water laps the
   bank), drawn in the face's own unit square so they run true to the edges. Edges are AB, BC, CD, DA (0..3);
   `on[i]` says which edges get one. Where two banded edges meet they are mitred, so the corner isn't doubled;
   `diag[k]` adds a quarter-round at corner k (A, B, C, D) where only the diagonal neighbour calls for one, so a
   band carries on round the end of a bank instead of stopping dead. */
function edgeBands(g, x, y, z, on, diag, w, stops) {
  const s = cam.s, o = proj(x, y, z);
  g.save(); g.transform(TW * 0.5 * s, TH * 0.5 * s, -TW * 0.5 * s, TH * 0.5 * s, o[0], o[1]);
  const fill = (gr) => { for (const [k, col] of stops) gr.addColorStop(k, col); g.fillStyle = gr; };
  for (let i = 0; i < 4; i++) {
    if (!on[i]) continue;
    const pv = on[(i + 3) % 4], nx = on[(i + 1) % 4];
    const pts = [
      [[0, 0], [1, 0], [nx ? 1 - w : 1, w], [pv ? w : 0, w]],
      [[1, 0], [1, 1], [1 - w, nx ? 1 - w : 1], [1 - w, pv ? w : 0]],
      [[1, 1], [0, 1], [nx ? w : 0, 1 - w], [pv ? 1 - w : 1, 1 - w]],
      [[0, 1], [0, 0], [w, nx ? w : 0], [w, pv ? 1 - w : 1]]][i];
    const [mx, my, ix, iy] = [[0.5, 0, 0, 1], [1, 0.5, -1, 0], [0.5, 1, 0, -1], [0, 0.5, 1, 0]][i];
    fill(g.createLinearGradient(mx, my, mx + ix * w, my + iy * w)); poly(g, pts); g.fill();
  }
  for (let k = 0; k < 4; k++) {
    if (!diag[k] || on[k] || on[(k + 3) % 4]) continue;
    const [cx, cy] = [[0, 0], [1, 0], [1, 1], [0, 1]][k];
    fill(g.createRadialGradient(cx, cy, 0, cx, cy, w));
    g.fillRect(cx ? 1 - w : 0, cy ? 1 - w : 0, w, w);
  }
  g.restore();
}
const DIAG = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
function drawCell(g, c, t, part) {
  const d = World.deco[c.y * World.W + c.x];
  if (part === 'top') { drawCellTop(g, c, d, t); return; }
  const x = c.x, y = c.y, s = cam.s;
  const rc = stoneCorners(c), sj = stoneJoins(c, rc), sc = soilCorners(c);
  if (rc) for (let k = 0; k < 4; k++) if (rc[k]) cornerGround(g, c, k);
  if (c.water != null && c.water > c.h && !c.ice && sheetsOn()) drawSheets(g, c, d, t, false);
  drawSideFaces(g, c, d, t);
  const z = c.h;
  const A = proj(x, y, z), B = proj(x + 1, y, z), C = proj(x + 1, y + 1, z), D = proj(x, y + 1, z);
  // grown a hair past its edges, so neighbouring tops overlap instead of leaving a faint seam between them
  // (a rounded block's top follows its rounded outline)
  const lw = landWaterCorners(c);
  const radii = [0, 1, 2, 3].map(k => rc && rc[k] ? ROUND_R : sj && sj.jc[k] ? NOTCH_R : sc && sc[k] ? SOIL_R : lw && lw[k] ? WATER_R : 0), rounded = rc || sj || sc || lw;
  if (sj) for (let k = 0; k < 4; k++) if (sj.jc[k]) cornerNotch(g, c, k);
  const outline = rounded ? roundedOutline(radii) : null;
  const big = rounded ? growPoly(outline.map(([u, v]) => proj(x + u, y + v, z)), 0.6) : growQuad([A, B, C, D], 0.6);
  g.fillStyle = topColor(c, d); poly(g, big); g.fill();
  texTop(g, c.icy ? 'ice' : c.h >= 1 ? 'stoneTop' : c.h < -0.01 ? 'dirt' : 'grass', z, big);
  if (c.h >= 1 && !c.icy && texOK) { g.fillStyle = blockTone(x, y); poly(g, big); g.fill(); }
  // the neighbours across each top edge: AB, BC, CD, DA
  const nb = [cellI(x, y - 1), cellI(x + 1, y), cellI(x, y + 1), cellI(x - 1, y)], E = [[A, B], [B, C], [C, D], [D, A]];
  // soft shadow at the foot of a higher neighbour's wall (only the two back edges have a wall in view)
  {
    const higher = n => n && !n.void && n.h > z + 0.01;
    const on = [higher(nb[0]), false, false, higher(nb[3])], dg = [higher(cellI(x - 1, y - 1)), false, false, false];
    if (on[0] || on[3] || dg[0]) edgeBands(g, x, y, z, on, dg, 0.3, [[0, 'rgba(18,10,30,0.38)'], [1, 'rgba(18,10,30,0)']]);
  }
  // raised stone: a rounded, lit chamfer just inside each edge where the block drops away
  if (c.h >= 1 && !c.icy && texOK) {
    const drops = n => !n || n.void || n.h < z - 0.01;
    g.save(); poly(g, big); g.clip();
    edgeBands(g, x, y, z, nb.map(drops), [false, false, false, false], 0.1,
      [[0, 'rgba(255,240,205,0.3)'], [0.4, 'rgba(255,240,205,0.1)'], [1, 'rgba(255,240,205,0)']]);
    if (sj) {
      // a groove where this block meets the next: dark in the joint, with a rounded, lit edge just inside it
      const nf = [false, false, false, false];
      edgeBands(g, x, y, z, sj.e, nf, 0.16, [[0, 'rgba(255,240,205,0)'], [0.3, 'rgba(255,240,205,0.1)'], [1, 'rgba(255,240,205,0)']]);
      edgeBands(g, x, y, z, sj.e, nf, 0.05, [[0, 'rgba(24,22,16,0.42)'], [1, 'rgba(24,22,16,0)']]);
    }
    g.restore();
  }
  lightTop(g, c, z, big);
  // a soft lit rim wherever the land steps or ends (none between tiles level with each other), and along the
  // island's back edges. Where the grass rolls over a front edge in its lip, the lip has its own lit rim.
  const lipped = texOK && !c.icy && c.h >= 0 && c.h <= 0.01;
  g.strokeStyle = 'rgba(255,240,210,0.16)'; g.lineWidth = 1.2;
  for (const i of [0, 3]) { const n = nb[i]; if (n && !n.void && n.h >= z - 0.01) continue; g.beginPath(); g.moveTo(E[i][0][0], E[i][0][1]); g.lineTo(E[i][1][0], E[i][1][1]); g.stroke(); }
  g.beginPath();
  let inked = false;
  if (rounded) {
    // along the rounded outline: every arc, and every straight run on an edge where the land drops
    const drop = i => { const n = nb[i]; return !n || n.void || Math.abs(n.h - z) >= 0.01; };
    for (let j = 0; j < outline.length; j++) {
      const [u1, v1] = outline[j], [u2, v2] = outline[(j + 1) % outline.length], mu = (u1 + u2) / 2, mv = (v1 + v2) / 2;
      const e = mv < 0.001 ? 0 : mu > 0.999 ? 1 : mv > 0.999 ? 2 : mu < 0.001 ? 3 : -1;
      if (e >= 0 && !drop(e)) continue;
      if (lipped && (e === 1 || e === 2 || (e < 0 && mu > 0.5 && mv > 0.5))) continue; // the lip has its own rim there
      const p = proj(x + u1, y + v1, z), q = proj(x + u2, y + v2, z);
      g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); inked = true;
    }
  } else for (let i = 0; i < 4; i++) {
    const n = nb[i]; if (n && !n.void && Math.abs(n.h - z) < 0.01) continue;
    if (lipped && (i === 1 || i === 2) && (!n || n.void || n.h < z)) continue;
    let p = E[i][0], q = E[i][1];
    const pc = n && poolCorners(n);
    if (pc) {
      // where the pool's corner is rounded, its own curve carries the rim; this edge's stops short of it
      const k0 = i, k1 = (i + 1) % 4, mate = k => CORN.findIndex(m => m[0] === CORN[k][0] - EDGE_D[i][0] && m[1] === CORN[k][1] - EDGE_D[i][1]);
      const along = (ka, kb, f) => proj(x + CORN[ka][0] + (CORN[kb][0] - CORN[ka][0]) * f, y + CORN[ka][1] + (CORN[kb][1] - CORN[ka][1]) * f, z);
      if (pc[mate(k0)]) p = along(k0, k1, WATER_R);
      if (pc[mate(k1)]) q = along(k1, k0, WATER_R);
    }
    inkPath(g, p, q, x * 7.3 + y * 13.1 + i * 2.9 + 100); inked = true;
  }
  if (inked) inkStroke(g, 'rgba(255,244,214,0.26)', 1.3);
  // moss rolling over a stone block's edges onto its top (over the lit rim, so it reads as one with the wall's moss)
  if (c.h >= 1 && !c.icy && texOK && SPRITE['moss-lip']) {
    const mt = [hash2(x * 2.9 + y * 4.1, 7.3) < 0.4, wallMossy(x, y, true), wallMossy(x, y, false), hash2(x * 2.9 + y * 4.1 + 3, 7.3) < 0.4];
    mossTop(g, c, z, big, nb.map((n, i) => mt[i] && (!n || n.void || n.h < z - 0.01)));
  }
  if (c.h >= 1 && !texOK) { // stone cracks & moss (the flagstone texture has its own)
    g.strokeStyle = 'rgba(60,50,70,0.35)';
    for (const k of d.cracks.slice(0, 2)) { const p = proj(x + k.u, y + k.v, z), q = proj(x + clamp(k.u + Math.cos(k.a) * k.l, 0, 1), y + clamp(k.v + Math.sin(k.a) * k.l, 0, 1), z); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  }
  if (c.wet > 0) {
    // damp ground darkens most in the middle of the tile, fading toward its edges, so no square shows
    const [px, py] = proj(x + 0.5, y + 0.5, z), R = TW * 0.62 * s, wg2 = g.createRadialGradient(px, py, 0, px, py, R);
    wg2.addColorStop(0, `rgba(20,30,50,${c.wet * 0.32})`); wg2.addColorStop(0.7, `rgba(20,30,50,${c.wet * 0.2})`); wg2.addColorStop(1, 'rgba(20,30,50,0)');
    g.save(); g.translate(px, py); g.scale(1, 0.5); g.translate(-px, -py); g.fillStyle = wg2; g.fillRect(px - R, py - R, R * 2, R * 2); g.restore();
  }
  if (c.ash > 0) {
    if (texOK) texTop(g, 'ash', z, big, Math.min(1, c.ash) * 0.85);
    else {
      g.fillStyle = 'rgba(30,22,20,0.55)';
      for (const k of d.tufts) { const p = proj(x + k.u, y + k.v, z); g.beginPath(); g.ellipse(p[0], p[1], 9 * s, 4.5 * s, 0, 0, TAU); g.fill(); }
    }
  }
  // decorations
  if (!c.feat && c.water == null && c.h >= 0 && !c.ash) {
    for (const k of d.tufts) {
      const p = proj(x + k.u, y + k.v, z);
      if (k.k === 'tuft') {
        g.strokeStyle = c.h >= 1 ? 'rgba(110,140,80,0.8)' : shade('#9bbd5c', 0.8 + k.c * 0.4); g.lineWidth = 1.1 * s;
        g.beginPath();
        for (let j = -1; j <= 1; j++) { g.moveTo(p[0] + j * 2 * s, p[1]); g.quadraticCurveTo(p[0] + j * 3 * s, p[1] - 5 * s, p[0] + j * 4.5 * s + Math.sin(t * 1.5 + k.c * 9) * s, p[1] - 7 * s); }
        g.stroke();
      } else if (k.k === 'flower') {
        g.fillStyle = k.c < 0.5 ? '#f0d0f0' : '#ffe9a0'; g.beginPath(); g.arc(p[0], p[1] - 2 * s, 1.8 * s, 0, TAU); g.fill();
      } else { g.fillStyle = 'rgba(60,55,70,0.5)'; g.beginPath(); g.ellipse(p[0], p[1], 2.5 * s, 1.4 * s, 0, 0, TAU); g.fill(); }
    }
  }
  if (c.frost > 0 && c.water == null) {
    // a skin of frost: the ice painting laid thin over the ground, with a few glints
    if (texOK) {
      // soft rounded patches of rime, not a square: a few overlapping frosty blooms, the ice painting showing in them
      g.save(); g.beginPath();
      for (let k = 0; k < 5; k++) {
        const q = d.cracks[k % d.cracks.length], u = 0.3 + 0.4 * ((q.u + k * 0.37) % 1), v = 0.3 + 0.4 * ((q.v + k * 0.61) % 1), [px, py] = proj(x + u, y + v, z), R = (0.26 + 0.12 * ((q.a * 7 + k) % 1)) * TW * 0.7071 * s;
        g.moveTo(px + R, py); g.ellipse(px, py, R, R * 0.5, 0, 0, TAU);
      }
      g.clip();
      texTop(g, 'ice', z, big, 0.62 * c.frost);
      g.restore();
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        const q = d.cracks[k % d.cracks.length], u = 0.3 + 0.4 * ((q.u + k * 0.37) % 1), v = 0.3 + 0.4 * ((q.v + k * 0.61) % 1), [px, py] = proj(x + u, y + v, z), R = (0.34 + 0.12 * ((q.a * 7 + k) % 1)) * TW * 0.7071 * s;
        g.globalAlpha = 0.18 * c.frost; g.drawImage(softSprite('#e8f8ff'), px - R, py - R * 0.5, R * 2, R);
      }
      g.restore();
    } else { g.fillStyle = `rgba(230,246,255,${0.6 * c.frost})`; poly(g, [A, B, C, D]); g.fill(); }
    g.strokeStyle = `rgba(255,255,255,${0.7 * c.frost})`; g.lineWidth = 1;
    for (const k of d.cracks) { const p = proj(x + k.u, y + k.v, z); const r = (2 + Math.sin(t * 3 + k.a * 5) * 1.5) * s; g.beginPath(); g.moveTo(p[0] - r, p[1]); g.lineTo(p[0] + r, p[1]); g.moveTo(p[0], p[1] - r); g.lineTo(p[0], p[1] + r); g.stroke(); }
  }
  if (part !== 'base') drawCellTop(g, c, d, t);
}
// what moves on a tile: its water, and whatever stands on it
function drawCellTop(g, c, d, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  if (texOK && !isPool(c)) landShoreWater(g, c, t);
  // water / ice
  if (c.water != null && c.water > c.h) drawWater(g, c, d, t);
  // features
  switch (c.feat) {
    case 'bramble': drawBramble(g, c, d, t); break;
    case 'brazier': drawBrazier(g, c, t); break;
    case 'gate': drawGate(g, c, t); break;
    case 'iceblock': {
      const hh = 0.95 * (1 - c.melt);
      if (hh > 0.02) {
        if (texOK) texturedBox(g, x + 0.06, y + 0.06, x + 0.94, y + 0.94, z, z + hh, { colT: '#dff4fc', colL: '#a9daf0', colR: '#86bedc', top: 'ice', side: 'ice', sideAlpha: 0.75, alpha: 0.9, rim: 'rgba(255,255,255,0.8)' });
        else prism(g, x + 0.06, y + 0.06, x + 0.94, y + 0.94, z, z + hh, 'rgba(225,248,255,0.85)', 'rgba(170,220,245,0.75)', 'rgba(130,190,230,0.75)', 'rgba(255,255,255,0.9)', 'rgba(50,100,140,0.75)');
        const p = proj(x + 0.3, y + 0.94, z + hh * 0.7), q = proj(x + 0.7, y + 0.94, z + hh * 0.3);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
      }
      break;
    }
    case 'font': drawFont(g, c, t); break;
  }
}

// A waterfall's sheet rolls over a rounded lip (radius FALL_R) and drops, bowing out a little as it falls. For a
// distance L down the sheet: [how far out from the edge it is, how far below the pool's surface].
const FALL_R = 0.17, FALL_ARC = FALL_R * Math.PI / 2;
function fallProfile(L) {
  if (L <= FALL_ARC) { const a = L / FALL_R; return [FALL_R * Math.sin(a), FALL_R * (1 - Math.cos(a))]; }
  const dd = L - FALL_ARC; return [FALL_R + 0.1 * Math.sqrt(dd) + 0.04 * dd, FALL_R + dd];
}
// Water pours over every edge that opens onto the sky, back edges too, so its top never ends in a bare edge.
// Edges N (−y), R (+x), L (+y), W (−x) are s = 0..3; corners A, B, C, D are k = 0..3 (edge s runs from corner s to
// corner s + 1). A corner whose two edges both pour is rounded (WATER_R), top and curtain alike.
const WATER_R = 0.24, EDGE_D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* Shores. Where water meets land level with it, neither keeps a sharp corner:
   - a pool's corner that turns into the land (land on both its sides) is rounded, the land filling in behind the
     curve (poolCorners: drawn by the pool, after its water);
   - a land tile's corner that juts into the water (water on both its sides and beyond) is rounded, the water
     filling in round it (landWaterCorners: the land's top is rounded, and it draws the water in the corner).
   The pale light where water laps the bank follows each curve, drawn by every tile it crosses. */
const CORN = [[0, 0], [1, 0], [1, 1], [0, 1]], DIAGK = [[-1, -1], [1, -1], [1, 1], [-1, 1]], ARC0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
const isPool = n => !!n && !n.void && !n.ice && n.water != null && n.water > n.h + 0.01;
const flushLand = (n, z) => !!n && !n.void && !n.icy && !isPool(n) && Math.abs(n.h - z) < 0.06;
function poolCorners(c) {
  if (!texOK || !isPool(c)) return null;
  const z = c.water, at = d => cellI(c.x + d[0], c.y + d[1]);
  const r = [0, 1, 2, 3].map(k => flushLand(at(EDGE_D[(k + 3) % 4]), z) && flushLand(at(EDGE_D[k]), z) && !isPool(at(DIAGK[k])) ? WATER_R : 0);
  return r.some(v => v) ? r : null;
}
function landWaterCorners(c) {
  if (!texOK || !c || c.void || c.icy || isPool(c)) return null;
  const at = d => cellI(c.x + d[0], c.y + d[1]), wet = n => isPool(n) && Math.abs(n.water - c.h) < 0.06;
  const r = [0, 1, 2, 3].map(k => wet(at(EDGE_D[(k + 3) % 4])) && wet(at(EDGE_D[k])) && wet(at(DIAGK[k])) ? WATER_R : 0);
  return r.some(v => v) ? r : null;
}
// corner k's quarter arc (world points, from the edge before the corner round to the edge after) and its centre
function cornerArc(X, Y, k, r, n = 6) {
  const ox = CORN[k][0] ? CORN[k][0] - r : r, oy = CORN[k][1] ? CORN[k][1] - r : r, pts = [];
  for (let i = 0; i <= n; i++) { const a = ARC0[k] + i / n * Math.PI / 2; pts.push([X + ox + Math.cos(a) * r, Y + oy + Math.sin(a) * r]); }
  return { pts, cx: X + ox, cy: Y + oy };
}
// the cell beside c that shares c's corner k, and that cell's own number for the corner
function cornerMate(c, d, k) {
  const n = cellI(c.x + d[0], c.y + d[1]); if (!n) return null;
  const px = CORN[k][0] - d[0], py = CORN[k][1] - d[1];
  return { n, k: CORN.findIndex(q => q[0] === px && q[1] === py) };
}
// how the shore runs at a pool's corner k: round its own curve (inside), round a land tile's jutting corner
// (outside), or not curved at all (null)
function shoreAt(c, k, pc) {
  if (pc && pc[k]) return { X: c.x, Y: c.y, k, inside: true };
  for (const d of [EDGE_D[(k + 3) % 4], EDGE_D[k], DIAGK[k]]) {
    const m = cornerMate(c, d, k); if (!m || m.k < 0) continue;
    const lw = landWaterCorners(m.n); if (lw && lw[m.k]) return { X: m.n.x, Y: m.n.y, k: m.k, inside: false };
  }
  return null;
}
// the band of pale light along a curved shore, round centre (cx, cy) at radius r: inside it (the water within a
// pool's rounded corner) or outside it (the water round a land tile's rounded corner); clipped to `clip`
function shoreBand(g, cx, cy, z, r, inside, clip) {
  const [px, py] = proj(cx, cy, z), K = TW * 0.7071 * cam.s, w = 0.2;
  g.save(); poly(g, clip); g.clip(); g.translate(px, py); g.scale(1, 0.5);
  const gr = inside ? g.createRadialGradient(0, 0, (r - w) * K, 0, 0, r * K) : g.createRadialGradient(0, 0, r * K, 0, 0, (r + w) * K);
  if (inside) { gr.addColorStop(0, 'rgba(200,238,255,0)'); gr.addColorStop(0.65, 'rgba(200,238,255,0.18)'); gr.addColorStop(1, 'rgba(230,248,255,0.55)'); }
  else { gr.addColorStop(0, 'rgba(230,248,255,0.55)'); gr.addColorStop(0.35, 'rgba(200,238,255,0.18)'); gr.addColorStop(1, 'rgba(200,238,255,0)'); }
  const R = (r + w) * K; g.fillStyle = gr; g.fillRect(-R, -R, 2 * R, 2 * R);
  g.restore();
}
// the painted water laid on a polygon P at height z, moving with the current fl, lit like a pool
function waterSurface(g, c, P, z, fl, t) {
  g.fillStyle = '#4b98d2'; poly(g, P); g.fill();
  texTop(g, 'water', z, P);
  const sp = fl ? fl.s * 0.35 : 0, ox = fl ? fl.x * t * sp : t * 0.05, oy = fl ? fl.y * t * sp : t * 0.03;
  const gk = texSource('water').drawn ? 1 : 0.55;
  texTop(g, 'ripple', z, P, (0.5 + 0.12 * Math.sin(t * 0.9)) * gk, ox, oy);
  texTop(g, 'ripple', z, P, 0.3 * gk, -oy * 0.8 + 0.37, ox * 0.7 + 0.61);
  lightTop(g, c, z, P);
}
// a land tile's jutting corners, filled with the water round them (drawn live, over its top)
function landShoreWater(g, c, t) {
  const lw = landWaterCorners(c); if (!lw) return;
  for (let k = 0; k < 4; k++) {
    if (!lw[k]) continue;
    const W = cellI(c.x + DIAGK[k][0], c.y + DIAGK[k][1]), z = W.water, A = cornerArc(c.x, c.y, k, lw[k]);
    const P = growPoly([[c.x + CORN[k][0], c.y + CORN[k][1]], ...A.pts].map(([u, v]) => proj(u, v, z)), 0.6);
    waterSurface(g, c, P, z, W.flow, t);
    shoreBand(g, A.cx, A.cy, z, lw[k], false, P);
  }
}
const pours = (c, e) => { if (!c || c.void || c.ice || c.water == null || c.water <= c.h) return false; const n = cellI(c.x + EDGE_D[e][0], c.y + EDGE_D[e][1]); return !n || n.void; };
function waterRound(c) {
  if (!texOK || c.ice) return null;
  const e = [0, 1, 2, 3].map(k => pours(c, k));
  const r = [0, 1, 2, 3].map(k => e[(k + 3) % 4] && e[k] ? WATER_R : 0);
  return r.some(v => v) ? r : null;
}
// the curtain's path round a tile: lip points [wx, wy, nx, ny] (the outward normal), in runs that pour; each run also
// says whether it fades out at its start or end (where it stops beside land rather than running on into more falls)
function sheetRuns(c) {
  const x = c.x, y = c.y, op = [0, 1, 2, 3].map(k => pours(c, k)), r = waterRound(c) || [0, 0, 0, 0];
  const C = [[0, 0], [1, 0], [1, 1], [0, 1]], a0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2], runs = [];
  let cur = null;
  const push = (pt) => { if (!cur) { cur = { pts: [], fadeA: false, fadeB: false }; runs.push(cur); } cur.pts.push(pt); };
  // go round from corner A; a run that is still open at the end joins the first
  for (let k = 0; k < 4; k++) {
    if (r[k]) {
      const ox = C[k][0] ? C[k][0] - r[k] : r[k], oy = C[k][1] ? C[k][1] - r[k] : r[k];
      for (let i = 0; i <= 3; i++) { const an = a0[k] + i / 3 * Math.PI / 2, nx = Math.cos(an), ny = Math.sin(an); push([x + ox + nx * r[k], y + oy + ny * r[k], nx, ny]); }
    }
    // the straight edge from corner k to k + 1
    const e = k, k2 = (k + 1) % 4, [nx, ny] = EDGE_D[e];
    if (!op[e]) { cur = null; continue; }
    if (!r[k]) {
      cur = null;
      const ad = EDGE_D[(e + 3) % 4];
      push([x + C[k][0], y + C[k][1], nx, ny]);
      cur.fadeA = !pours(cellI(x + ad[0], y + ad[1]), e);
    }
    if (!r[k2]) {
      push([x + C[k2][0], y + C[k2][1], nx, ny]);
      const ad = EDGE_D[(e + 1) % 4];
      cur.fadeB = !pours(cellI(x + ad[0], y + ad[1]), e);
      cur = null;
    } else {
      const ox = C[k2][0] ? C[k2][0] - r[k2] : r[k2], oy = C[k2][1] ? C[k2][1] - r[k2] : r[k2], an = a0[k2];
      push([x + ox + Math.cos(an) * r[k2], y + oy + Math.sin(an) * r[k2], nx, ny]);
    }
  }
  if (cur && runs.length > 1 && runs[0] !== cur && !runs[0].fadeA && op[3] && r[0]) {
    // the loop closed through corner A: the last run carries on into the first
    const first = runs.shift(); cur.pts.push(...first.pts.slice(1)); cur.fadeB = first.fadeB;
  }
  return runs;
}
// the painted fall, scrolling, as a strip one texture-repeat wide and as tall as the curtain (shared each frame by
// every curtain of that height): the pool's blue and a bright crest over the lip, fading into mist far below
const SHEET_PX = 64, _sheetC = {};
let _sheetF = -1;
function sheetPattern(g, hU, t) {
  if (_sheetF !== frameNo) { _sheetF = frameNo; for (const k in _sheetC) _sheetC[k].fresh = false; }
  const key = Math.round(hU * 10);
  let E = _sheetC[key];
  if (!E) E = _sheetC[key] = { c: document.createElement('canvas'), fresh: false, pats: new WeakMap() };
  if (!E.fresh) {
    const S = texSource('fall'), PX = SHEET_PX, period = S.c.width / texUnit('fall'), cw = Math.round(PX * period), ch = Math.max(8, Math.round(PX * key / 10));
    if (E.c.width !== cw || E.c.height !== ch) { E.c.width = cw; E.c.height = ch; }
    const og = E.c.getContext('2d'), FP = texPattern(og, 'fall'), k = PX / texUnit('fall'), ra = FALL_ARC * PX;
    og.globalCompositeOperation = 'copy';
    FP.setTransform(new DOMMatrix([k, 0, 0, k, 0, t * 1.7 * PX]));
    og.fillStyle = FP; og.fillRect(0, 0, cw, ch);
    og.globalCompositeOperation = 'source-over';
    const lg = og.createLinearGradient(0, 0, 0, ra * 2.6);
    lg.addColorStop(0, 'rgba(75,152,210,0.75)'); lg.addColorStop(0.18, 'rgba(150,215,245,0.5)'); lg.addColorStop(0.34, 'rgba(255,255,255,0.6)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.15)'); lg.addColorStop(0.66, 'rgba(24,70,110,0.22)'); lg.addColorStop(1, 'rgba(24,70,110,0)');
    og.fillStyle = lg; og.fillRect(0, 0, cw, Math.min(ch, ra * 2.6));
    og.globalCompositeOperation = 'destination-in';
    const m = og.createLinearGradient(0, 0, 0, ch);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.3, 'rgba(0,0,0,0.9)'); m.addColorStop(0.75, 'rgba(0,0,0,0.45)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    og.fillStyle = m; og.fillRect(0, 0, cw, ch);
    og.globalCompositeOperation = 'source-over';
    E.fresh = true; E.pats = new WeakMap();
  }
  let P = E.pats.get(g); if (!P) { P = g.createPattern(E.c, 'repeat-x'); E.pats.set(g, P); }
  return P;
}
// a tile's curtains: the back ones (turned away from us) before its earth is drawn, the front ones after
function drawSheets(g, c, d, t, front) {
  const z = c.water, zb = Math.min(c.h, 0) - SOIL_DEPTH - 2.3, hU = Math.round((FALL_ARC + (z - FALL_R - zb)) * 10) / 10, s = cam.s, PX = SHEET_PX;
  const runs = sheetRuns(c); if (!runs.length) return;
  const P = sheetPattern(g, hU, t); if (!P) return;
  // the sheet's outline follows its curve closely; the painting is laid on it in one piece, mapped along the
  // straight line from its top to its foot (the curve is gentle enough that the painting doesn't show the difference)
  const rest = hU - FALL_ARC, Ls = [0, 0.33, 0.67, 1].map(f => FALL_ARC * f);
  for (const f of [0.04, 0.12, 0.25, 0.42, 0.62, 0.82, 1]) Ls.push(FALL_ARC + rest * f);
  // q[4], where set, draws the sheet in toward the cliff (0: flush with it), for the end of a fall beside land
  const at = (q, L) => { const [o0, dz] = fallProfile(L), o = o0 * (q[4] ?? 1); return proj(q[0] + q[2] * o, q[1] + q[3] * o, z - dz); };
  const lerpQ = (q1, q2, f) => q1.map((v, i) => v + (q2[i] - v) * f);
  const ga = g.globalAlpha, segs = [];
  for (const run of runs) {
    // where a run stops beside land, its last stretch draws in to lie flush against the cliff (so no gap opens
    // between the water and the earth beside it), softening a little at the very end
    const pts = run.pts, list = [], NP = 4;
    const piece = (q1, q2, f0, f1, k0, k1, al) => { const a = lerpQ(q1, q2, f0), b = lerpQ(q1, q2, f1); a[4] = k0; b[4] = k1; list.push([a, b, al]); };
    for (let i = 0; i + 1 < pts.length; i++) {
      const q1 = pts[i], q2 = pts[i + 1], len = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]);
      const fa = run.fadeA && i === 0, fb = run.fadeB && i + 2 === pts.length, T = Math.min(0.3, len * (fa && fb ? 0.45 : 0.9)) / len;
      let f0 = 0, f1 = 1;
      if (fa) { for (let j = 0; j < NP; j++) piece(q1, q2, j * T / NP, (j + 1) * T / NP, j / NP, (j + 1) / NP, j ? 1 : 0.8); f0 = T; }
      if (fb) f1 = 1 - T;
      piece(q1, q2, f0, f1, 1, 1, 1);
      if (fb) for (let j = 0; j < NP; j++) piece(q1, q2, f1 + j * T / NP, f1 + (j + 1) * T / NP, 1 - j / NP, 1 - (j + 1) / NP, j < NP - 1 ? 1 : 0.8);
    }
    for (const [q1, q2, al] of list) {
      // which way this piece faces: toward us (front) or away (back)
      const fr = (q1[2] + q2[2]) + (q1[3] + q2[3]) > 0.001;
      if (fr !== front) continue;
      const c1 = (q1[0] - q1[1]) * PX, c2 = (q2[0] - q2[1]) * PX;
      if (Math.abs(c2 - c1) < 0.3) continue;
      segs.push([q1, q2]);
      g.globalAlpha = ga * al * (front ? 1 : 0.85); g.fillStyle = P;
      {
        const a0 = at(q1, 0), b0 = at(q2, 0), a1 = at(q1, hU), r1 = hU * PX;
        const ax = (b0[0] - a0[0]) / (c2 - c1), ay = (b0[1] - a0[1]) / (c2 - c1), rx = (a1[0] - a0[0]) / r1, ry = (a1[1] - a0[1]) / r1;
        P.setTransform(new DOMMatrix([ax, ay, rx, ry, a0[0] - c1 * ax, a0[1] - c1 * ay]));
        g.beginPath();
        Ls.forEach((L, i) => { const q = at(q1, L); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1]); });
        for (let i = Ls.length - 1; i >= 0; i--) { const q = at(q2, Ls[i]); g.lineTo(q[0], q[1]); }
        g.closePath(); g.fill();
      }
    }
  }
  g.globalAlpha = ga;
  if (!front || !segs.length) return;
  // the bright thread along the crest, foam churning where the sheet turns down, mist where it vanishes, and spray
  g.lineCap = 'round'; g.strokeStyle = 'rgba(240,252,255,0.55)'; g.lineWidth = 1.6 * s;
  const cL = FALL_ARC * 0.42;
  for (const [q1, q2] of segs) { const p1 = at(q1, cL), p2 = at(q2, cL); g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  segs.forEach(([q1, q2], si) => {
    const len = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]), n = Math.max(1, Math.round(len * 7));
    for (let j = 0; j < n; j++) {
      const ph = (t * 0.9 + j * 0.37 + si * 0.29 + c.x * 0.21 + c.y * 0.13) % 1, f = clamp((j + 0.5 + 0.3 * Math.sin(j * 3.1 + t)) / n, 0.05, 0.95);
      const q = at(lerpQ(q1, q2, f), FALL_ARC * 0.8 + ph * 0.35), r = (5 + 5 * Math.sin(ph * Math.PI)) * s;
      g.globalAlpha = 0.3 * Math.sin(ph * Math.PI); g.drawImage(softSprite('#f4fbff'), q[0] - r, q[1] - r * 0.7, r * 2, r * 1.4);
    }
    if (len > 0.5) for (let j = 0; j < 3; j++) {
      const ph = (t * 0.3 + j * 0.33 + d.tone + si * 0.17) % 1, q = at(lerpQ(q1, q2, 0.2 + j * 0.3), hU - 1.4 + ph * 0.6), r = (22 + ph * 18) * s;
      g.globalAlpha = 0.16 * Math.sin(ph * Math.PI); g.drawImage(softSprite('#dceeff'), q[0] - r, q[1] - r * 0.6, r * 2, r * 1.2);
    }
    if (Math.random() < 0.5 * len) {
      const q = lerpQ(q1, q2, Math.random()), o = FALL_R + 0.03, out = 0.2 + Math.random() * 0.35;
      emit({ x: q[0] + q[2] * o, y: q[1] + q[3] * o, z: z - FALL_R - 0.05, vx: q[2] * out, vy: q[3] * out, vz: -0.8 - Math.random() * 1.2, grav: 6, life: 0.8 + Math.random() * 0.6, size: 0.9 + Math.random() * 0.8, color: Math.random() < 0.6 ? '#f4fbff' : '#cdeaff', kind: 'streak' });
      if (Math.random() < 0.06) emit({ x: q[0] + q[2] * 0.4, y: q[1] + q[3] * 0.4, z: z - 1.4 - Math.random(), vx: q[2] * 0.15, vy: q[3] * 0.15, vz: -0.25, drag: 0.3, life: 2.2, size: 14, color: '#eef7ff', kind: 'smoke' });
    }
  });
  g.restore();
}
const sheetsOn = () => texOK && !!TEX_SRC.fall;
function drawWater(g, c, d, t) {
  const x = c.x, y = c.y, z = c.water, s = cam.s;
  const A = proj(x, y, z), B = proj(x + 1, y, z), C = proj(x + 1, y + 1, z), D = proj(x, y + 1, z);
  // water faces toward void / lower neighbours (waterfall lip)
  for (const side of ['R', 'L']) {
    const n = side === 'R' ? cellI(x + 1, y) : cellI(x, y + 1);
    if (n && !n.void && (n.h >= z || (n.water != null && n.water >= z - 0.01))) continue;
    const P = side === 'R' ? [B, C, proj(x + 1, y + 1, c.h), proj(x + 1, y, c.h)] : [D, C, proj(x + 1, y + 1, c.h), proj(x, y + 1, c.h)];
    if (!c.ice && (!n || n.void)) {
      // a proper waterfall: foam where it tips over, bright streaks pouring down, fading far below into mist
      const zb = Math.min(c.h, 0) - SOIL_DEPTH - 2.3, at = (u, zz) => side === 'R' ? proj(x + 1, y + u, zz) : proj(x + u, y + 1, zz);
      const Pf = [at(0, z), at(1, z), at(1, zb), at(0, zb)];
      if (sheetsOn()) { /* the curtains are drawn round the whole tile, below */ }
      else {
      const fg = g.createLinearGradient(0, Pf[0][1], 0, Pf[3][1]);
      fg.addColorStop(0, 'rgba(170,220,255,0.9)'); fg.addColorStop(0.25, 'rgba(110,175,235,0.75)'); fg.addColorStop(0.7, 'rgba(120,180,240,0.35)'); fg.addColorStop(1, 'rgba(140,190,240,0)');
      g.fillStyle = fg; poly(g, Pf); g.fill();
      g.save(); poly(g, Pf); g.clip(); g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const u = (i + 0.5) / 9 + Math.sin(i * 7.1 + x * 3 + y) * 0.03, a = at(u, z), b = at(u, zb);
        const sp = 70 + (i % 3) * 22;
        g.setLineDash([(10 + (i % 4) * 6) * s, (8 + (i % 3) * 5) * s]); g.lineDashOffset = -t * sp * s - i * 13;
        g.strokeStyle = i % 2 ? 'rgba(235,248,255,0.55)' : 'rgba(200,232,255,0.4)'; g.lineWidth = (i % 3 ? 1.4 : 2.2) * s;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      g.setLineDash([]); g.restore();
      // the white lip of foam where the water curls over the edge
      const fb = [at(0, z + 0.01), at(1, z + 0.01), at(1, z - 0.2), at(0, z - 0.2)], fgr = g.createLinearGradient(0, fb[0][1], 0, fb[3][1]);
      fgr.addColorStop(0, 'rgba(250,254,255,0.85)'); fgr.addColorStop(0.45, 'rgba(235,248,255,0.45)'); fgr.addColorStop(1, 'rgba(235,248,255,0)');
      g.fillStyle = fgr; poly(g, fb); g.fill();
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 7; k++) {
        const ph = (t * 0.9 + k * 0.37 + x * 0.21 + y * 0.13) % 1, u = (k + 0.5 + 0.3 * Math.sin(k * 3.1 + t)) / 7;
        const p = at(clamp(u, 0.05, 0.95), z - 0.04 - ph * 0.22), r = (6 + 5 * Math.sin(ph * Math.PI)) * s;
        g.globalAlpha = 0.35 * Math.sin(ph * Math.PI); g.drawImage(softSprite('#f4fbff'), p[0] - r, p[1] - r * 0.7, r * 2, r * 1.4);
      }
      g.restore();
      // mist rising where it vanishes
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) { const u = 0.2 + k * 0.3, ph = (t * 0.3 + k * 0.33 + d.tone) % 1, p = at(u, zb + 0.9 + ph * 0.6); g.globalAlpha = 0.18 * Math.sin(ph * Math.PI); const r = (22 + ph * 18) * s; g.drawImage(softSprite('#dceeff'), p[0] - r, p[1] - r * 0.6, r * 2, r * 1.2); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    } else { g.fillStyle = c.ice ? 'rgba(190,230,250,0.8)' : 'rgba(70,140,210,0.55)'; poly(g, P); g.fill(); }
    if (!c.ice && (!n || n.void) && !sheetsOn() && Math.random() < 0.5) {
      // spray: fine white streaks thrown off the lip, falling a little ahead of the sheet; now and then a drift of mist
      const R = side === 'R', wr0 = waterRound(c), u0 = (wr0 ? wr0[R ? 1 : 3] : 0) + 0.05, u = u0 + Math.random() * (0.95 - u0), o = FALL_R + 0.03, out = 0.2 + Math.random() * 0.35;
      const px = R ? x + 1 + o : x + u, py = R ? y + u : y + 1 + o;
      emit({ x: px, y: py, z: z - FALL_R - 0.05, vx: R ? out : 0, vy: R ? 0 : out, vz: -0.8 - Math.random() * 1.2, grav: 6, life: 0.8 + Math.random() * 0.6, size: 0.9 + Math.random() * 0.8, color: Math.random() < 0.6 ? '#f4fbff' : '#cdeaff', kind: 'streak' });
      if (Math.random() < 0.06) emit({ x: px + (R ? 0.25 : 0), y: py + (R ? 0 : 0.25), z: z - 1.4 - Math.random(), vx: R ? 0.15 : 0, vy: R ? 0 : 0.15, vz: -0.25, drag: 0.3, life: 2.2, size: 14, color: '#eef7ff', kind: 'smoke' });
    }
  }
  if (!c.ice && sheetsOn()) drawSheets(g, c, d, t, true);
  if (c.ice && texOK) {
    const big = growQuad([A, B, C, D], 0.6);
    g.fillStyle = '#cdeaf6'; poly(g, big); g.fill();
    texTop(g, 'ice', z, big);
    lightTop(g, c, z, big);
    const gl = (t * 0.35 + (x + y) * 0.12) % 1.6;
    if (gl < 1) { const p = proj(x + gl, y, z), q = proj(x, y + gl, z); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  } else if (c.ice) {
    const gr = g.createLinearGradient(A[0], A[1], C[0], C[1]);
    gr.addColorStop(0, '#eaf8ff'); gr.addColorStop(1, '#a8d8f0');
    g.fillStyle = gr; poly(g, [A, B, C, D]); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
    for (const k of d.cracks) { const p = proj(x + k.u, y + k.v, z), q = proj(x + clamp(k.u + Math.cos(k.a) * k.l, 0, 1), y + clamp(k.v + Math.sin(k.a) * k.l, 0, 1), z); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
    const gl = (t * 0.35 + (x + y) * 0.12) % 1.6;
    if (gl < 1) { const p = proj(x + gl, y, z), q = proj(x, y + gl, z); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  } else if (texOK) {
    // one sheet of water across the tiles: an opaque, world-pinned surface (so tiles can overlap without seams),
    // glints drifting over it (along the current where it flows), and pale light where it laps against land
    const wr = waterRound(c), pc = poolCorners(c), fl = c.flow;
    const rr = wr || pc ? [0, 1, 2, 3].map(k => Math.max(wr ? wr[k] : 0, pc ? pc[k] : 0)) : null;
    const big = rr ? growPoly(roundedOutline(rr).map(([u, v]) => proj(x + u, y + v, z)), 0.6) : growQuad([A, B, C, D], 0.6);
    waterSurface(g, c, big, z, fl, t);
    // a bank is land at or above the water (open edges, over the void or lower ground, have the fall's foam instead)
    const bank = n => !!n && !n.void && !(n.water != null && n.water > n.h && Math.abs(n.water - z) < 0.02) && n.h >= z - 0.01;
    const nb = [cellI(x, y - 1), cellI(x + 1, y), cellI(x, y + 1), cellI(x - 1, y)];
    const shores = [0, 1, 2, 3].map(k => shoreAt(c, k, pc)), sq = k => {
      const [cx, cy] = CORN[k], r = WATER_R, ex = cx ? -r : r, ey = cy ? -r : r;
      return [[cx, cy], [cx + ex, cy], [cx + ex, cy + ey], [cx, cy + ey]].map(([u, v]) => proj(x + u, y + v, z));
    };
    const curved = shores.some(Boolean);
    if (curved) {
      // the straight bands kept out of the corners where the shore curves
      g.save(); g.beginPath();
      big.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, q[0], q[1])); g.closePath();
      shores.forEach((sh, k) => { if (!sh) return; const Q = sq(k); g.moveTo(Q[0][0], Q[0][1]); for (let i = 3; i >= 1; i--) g.lineTo(Q[i][0], Q[i][1]); g.closePath(); });
      g.clip('evenodd');
    }
    edgeBands(g, x, y, z, nb.map(bank), DIAG.map(([dx, dy]) => bank(cellI(x + dx, y + dy))), 0.2,
      [[0, 'rgba(230,248,255,0.55)'], [0.35, 'rgba(200,238,255,0.18)'], [1, 'rgba(200,238,255,0)']]);
    if (curved) {
      g.restore();
      shores.forEach((sh, k) => {
        if (!sh) return;
        const A2 = cornerArc(sh.X, sh.Y, sh.k, WATER_R);
        g.save(); poly(g, big); g.clip(); shoreBand(g, A2.cx, A2.cy, z, WATER_R, sh.inside, sq(k)); g.restore();
      });
    }
    // behind each of its own rounded corners, the land fills in, level with the land beside it
    if (pc) for (let k = 0; k < 4; k++) {
      if (!pc[k]) continue;
      const L = cellI(x + EDGE_D[(k + 3) % 4][0], y + EDGE_D[(k + 3) % 4][1]), zl = L.h, Ar = cornerArc(x, y, k, pc[k]);
      const T = growPoly([[x + CORN[k][0], y + CORN[k][1]], ...Ar.pts].map(([u, v]) => proj(u, v, zl)), 0.5);
      g.fillStyle = topColor(L, World.deco[L.y * World.W + L.x]); poly(g, T); g.fill();
      texTop(g, 'grass', zl, T); lightTop(g, L, zl, T);
      g.beginPath(); Ar.pts.forEach(([u, v], i) => { const q = proj(u, v, zl); (i ? g.lineTo : g.moveTo).call(g, q[0], q[1]); });
      inkStroke(g, 'rgba(255,244,214,0.26)', 1.3);
    }
  } else {
    g.fillStyle = 'rgba(52,118,196,0.72)'; poly(g, [A, B, C, D]); g.fill();
    g.save(); poly(g, [A, B, C, D]); g.clip();
    g.strokeStyle = 'rgba(200,235,255,0.45)'; g.lineWidth = 1.2 * s;
    const fl = c.flow;
    for (let i = 0; i < 4; i++) {
      let u, v;
      if (fl) { const ph = ((t * fl.s * 0.5 + i * 0.25 + d.tone) % 1); u = fl.x ? ph : 0.15 + i * 0.22; v = fl.y ? ph : 0.15 + i * 0.22; if (fl.x < 0) u = 1 - u; if (fl.y < 0) v = 1 - v; }
      else { u = 0.2 + i * 0.2; v = 0.5 + Math.sin(t * 1.3 + i * 2 + d.tone * 6) * 0.3; }
      const p = proj(x + u, y + v, z), q = proj(x + u + (fl ? fl.x * 0.18 : 0.12), y + v + (fl ? fl.y * 0.18 : -0.06), z);
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(220,245,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(D[0], D[1]); g.lineTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  }
}

/* Painted props (art/*.png, cut out from the storybook paintings). Each is drawn standing on its tile; until
   one loads, the drawn version stands in. */
const SPRITE = {};
for (const k of ['bramble1', 'bramble2', 'bramble3', 'brazier', 'goal', 'vine-leafy', 'vine-moss', 'vine-roots', 'ivy1', 'ivy2', 'ivy3', 'moss-drape', 'moss-lip']) {
  if (typeof Image === 'undefined') break;
  const im = new Image(); im.onload = () => { SPRITE[k] = im; }; im.src = `art/${k}.png?v=7`;
}
// a painting darkened to sit on a wall in shade (made once each)
const shadeCache = {};
function shadedSprite(k, f) {
  const im = SPRITE[k]; if (!im) return null;
  const key = k + '|' + f; if (shadeCache[key]) return shadeCache[key];
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(18,16,30,${f})`; g.fillRect(0, 0, c.width, c.height);
  return (shadeCache[key] = c);
}
// the climbing plants a wall may wear: the leafy vine and the three ivy sprigs
function ivyFor(seed) {
  const all = ['vine-leafy', 'ivy1', 'ivy2', 'ivy3'].filter(k => SPRITE[k]);
  return all.length ? SPRITE[all[Math.floor(hash2(seed, 1.13) * all.length)]] : null;
}
/* Moss along a stone block's top edge: the painted strip, repeating along the wall (by u = x - y, so it runs on
   unbroken from block to block), its dense band just at the edge and its drips hanging down the stone. */
const lipPats = new WeakMap(), LIP_EDGE = 34;
// the moss strip as a pattern on this canvas, darkened by f (for walls in shade, and the shadowed foot of a wall)
function mossPat(g, f) {
  const src = f ? shadedSprite('moss-lip', f) : SPRITE['moss-lip']; if (!src) return null;
  let m = lipPats.get(g); if (!m) lipPats.set(g, m = {});
  return m[f] || (m[f] = g.createPattern(src, 'repeat-x'));
}
// lays the strip on a stretch of upright wall between world points e0 and e1, filling `quad`: its dense edge at
// height zEdge, hanging hz down from it, or at a wall's foot (foot) growing hz up from it. Across, it runs by
// u = x - y like the wall textures, so it carries on unbroken from wall to wall and round a curved corner.
function mossOn(g, f, foot, e0, e1, quad, zEdge, hz) {
  const P = mossPat(g, f); if (!P) return false;
  const im = SPRITE['moss-lip'], W = im.naturalWidth, H = im.naturalHeight, UX = W / (foot ? 2.6 : 3), UY = H / hz, s = cam.s;
  const u0 = e0[0] - e0[1], du = (e1[0] - e1[1]) - u0, Y0 = (e0[0] + e0[1]) * TH * 0.5, Y1 = (e1[0] + e1[1]) * TH * 0.5;
  const m = Math.abs(du) > 1e-4 ? (Y1 - Y0) / du : 0, zo = foot ? zEdge - LIP_EDGE / UY : zEdge + LIP_EDGE / UY;
  const a = TW * 0.5 * s / UX, b = m * s / UX, sh = foot ? 0.37 * UX : 0;
  P.setTransform(new DOMMatrix([a, b, 0, (foot ? -TZ : TZ) * s / UY, cam.ox + sh * a, cam.oy + (Y0 - u0 * m) * s - zo * TZ * s + sh * b]));
  g.fillStyle = P; poly(g, quad); g.fill();
  return true;
}
function mossLip(g, c, R, top, sb, u0, u1) {
  if (!SPRITE['moss-lip']) return false;
  // near the painting's own proportions (stretched taller, its clumps turn to strings)
  const hz = Math.min(0.5, (top - sb) * 0.6), at = (u, z) => R ? proj(c.x + 1, c.y + u, z) : proj(c.x + u, c.y + 1, z), w = u => R ? [c.x + 1, c.y + u] : [c.x + u, c.y + 1];
  const zb = Math.max(sb, top - hz - 0.02);
  return mossOn(g, R ? 0.32 : 0, false, w(u0), w(u1), [at(u0, top), at(u1, top), at(u1, zb), at(u0, zb)], top, hz);
}
/* Moss creeping over a stone block's top from each edge where the block drops away: the same strip laid flat on the
   top, its dense band along the edge and its drips reaching a little way in as soft lobes, so the moss on the wall
   below reads as one growth rolling over the corner. Along each edge it runs by the world axis the edge follows, so
   it carries on from block to block. `top` is the top's outline (it is clipped to it). */
function mossTop(g, c, z, top, drops) {
  const P = mossPat(g, 0); if (!P) return;
  const im = SPRITE['moss-lip'], W = im.naturalWidth, H = im.naturalHeight, s = cam.s, UX = W / 3;
  const J = (wx, wy) => [(wx - wy) * TW * 0.5 * s, (wx + wy) * TH * 0.5 * s];
  g.save(); poly(g, top); g.clip();
  for (let i = 0; i < 4; i++) {
    if (!drops[i]) continue;
    const dep = 0.2 + 0.12 * hash2(c.x * 3.1 + i, c.y * 5.7 + 1.3), UY = (H - LIP_EDGE) / dep;
    const along = i === 0 || i === 2 ? [1, 0] : [0, 1], n = [-EDGE_D[i][0], -EDGE_D[i][1]];
    // a point on the edge line where the along-coordinate is 0, stepped out so the strip's dense edge lies on the edge
    const e = i === 0 ? [0, c.y] : i === 2 ? [0, c.y + 1] : i === 1 ? [c.x + 1, 0] : [c.x, 0];
    const o = [e[0] - n[0] * LIP_EDGE / UY, e[1] - n[1] * LIP_EDGE / UY];
    const ax = J(along[0] / UX, along[1] / UX), ay = J(n[0] / UY, n[1] / UY), oo = J(o[0], o[1]);
    P.setTransform(new DOMMatrix([ax[0], ax[1], ay[0], ay[1], cam.ox + oo[0], cam.oy + oo[1] - z * TZ * s]));
    g.fillStyle = P; poly(g, top); g.fill();
  }
  g.restore();
}
// moss and grass creeping up the foot of a stone wall from the ground it stands on
function mossFoot(g, c, R, top, sb, u0, u1) {
  if (!SPRITE['moss-lip'] || top - sb < 0.3 || u1 - u0 < 0.01) return;
  const hz = Math.min(0.34, (top - sb) * 0.35), at = (u, z) => R ? proj(c.x + 1, c.y + u, z) : proj(c.x + u, c.y + 1, z), w = u => R ? [c.x + 1, c.y + u] : [c.x + u, c.y + 1];
  mossOn(g, R ? 0.45 : 0.2, true, w(u0), w(u1), [at(u0, sb + hz), at(u1, sb + hz), at(u1, sb), at(u0, sb)], sb, hz);
}
// a drape of moss hanging from a wall's top edge at p: wU wide along the edge, hZ tall, sheared to lie on the wall
function hangDrape(g, R, p, wU, hZ, flip) {
  const im = R ? shadedSprite('moss-drape', 0.32) : SPRITE['moss-drape']; if (!im) return;
  const W = im.width, H = im.height, s = cam.s, f = flip ? -1 : 1;
  const ax = TW * 0.5 * s * wU / W, ay = (R ? -TH : TH) * 0.5 * s * wU / W;
  g.save(); g.transform(ax * f, ay * f, 0, hZ * TZ * s / H, p[0], p[1]); g.drawImage(im, -W / 2, -H * 0.02); g.restore();
}
// vines waiting to be hung, in drawing order; each is drawn once the row of tiles after its own is down
const HANG = [];
let hangAt = 0;
function flushHang(g, t, upTo) {
  while (hangAt < HANG.length && HANG[hangAt].k <= upTo) {
    const v = HANG[hangAt++];
    if (v.drape) hangDrape(g, v.R, v.p, v.wU, v.hZ, v.flip); else hangVine(g, v.im, v.p, v.len, t, v.ph, v.flip);
  }
  if (hangAt >= HANG.length) { HANG.length = 0; hangAt = 0; }
}
// a painted vine hanging from a point on a wall, `len` world units long, swaying a little from where it hangs
function hangVine(g, im, p, len, t, ph, flip) {
  const h = len * TZ * cam.s, w = h * im.naturalWidth / im.naturalHeight;
  g.save(); g.translate(p[0], p[1]); g.rotate(Math.sin(t * 0.8 + ph) * 0.035); if (flip) g.scale(-1, 1);
  g.drawImage(im, -w / 2, -h * 0.02, w, h);
  g.restore();
}
// one of the bush paintings for a tile, chosen by where it is, so neighbours differ
function bushFor(x, y) {
  const all = ['bramble1', 'bramble2', 'bramble3'].map(k => SPRITE[k]).filter(Boolean);
  return all.length ? all[Math.floor(hash2(x * 1.7 + 0.3, y * 2.9 + 0.7) * all.length)] : null;
}
// the bramble scorched to one of six depths as it burns (made once each)
const charCache = {};
function charred(im, bf) {
  const lv = Math.round(bf * 5); if (!lv) return im;
  const key = lv + im.src;
  if (charCache[key]) return charCache[key];
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(150,60,20,${0.25 * Math.sin(lv / 5 * Math.PI)})`; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = `rgba(26,14,8,${0.9 * lv / 5})`; g.fillRect(0, 0, c.width, c.height);
  return charCache[key] = c;
}
// a sprite washed in a light's colour, laid over it additively where firelight reaches (made once per colour)
const litCache = {};
function litSprite(im, col) {
  const key = col + (im.src || '');
  if (litCache[key]) return litCache[key];
  const c = document.createElement('canvas'); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, col); gr.addColorStop(1, hexA(col, 0.35));
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return litCache[key] = c;
}
// the strongest light reaching a point on the ground, as [strength, colour]
function lightAt(px, py) {
  let la = 0, lc = null;
  for (const l of LIGHTS) {
    const dd = Math.hypot(px - l.x, py - l.y), R = l.r + 0.5; if (dd > R) continue;
    const k = l.a * (1 - dd / R); if (k > la) { la = k; lc = l.col; }
  }
  return [la, lc];
}
// how high the brazier's bowl sits above its tile (the painted one is taller than the drawn one)
const BRAZ_W = 0.5;
function brazierBowlZ() {
  const im = SPRITE.brazier; if (!im) return 0.62;
  const W = im.naturalWidth, H = im.naturalHeight, k = BRAZ_W * TW / W;
  return (H - W / 4 - 0.145 * H) * k / TZ;
}
function drawBramble(g, c, d, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  const bf = c.burn ? clamp(c.burnT, 0, 1) : 0;
  const hk = 1 - clamp((bf - 0.45) / 0.55, 0, 1);
  const bush = bushFor(x, y);
  if (bush) {
    const im = bush, W = im.naturalWidth, H = im.naturalHeight, k = 1.02 * TW * s / W * (0.55 + 0.45 * hk);
    const w = W * k, h = H * k * (0.6 + 0.4 * hk), G = proj(x + 0.5, y + 0.5, z), by = G[1] + 9 * s;
    {
      const rx = w * 0.4, cy = G[1] + 4 * s, sg = g.createRadialGradient(G[0], cy, 0, G[0], cy, rx);
      sg.addColorStop(0, 'rgba(8,16,10,0.42)'); sg.addColorStop(0.6, 'rgba(8,16,10,0.22)'); sg.addColorStop(1, 'rgba(8,16,10,0)');
      g.save(); g.translate(G[0], cy); g.scale(1, 0.5); g.translate(-G[0], -cy); g.fillStyle = sg; g.fillRect(G[0] - rx, cy - rx, rx * 2, rx * 2); g.restore();
    }
    // it leans a little in the wind, from the root
    const sk = Math.sin(t * 1.1 + x * 1.7 + y * 0.9) * 0.03;
    g.save(); g.translate(G[0], by); g.transform(1, 0, -sk, 1, 0, 0);
    g.drawImage(charred(im, bf), -w / 2, -h, w, h);
    // firelight nearby warms the side of the bush
    const [la, lc] = lightAt(x + 0.5, y + 0.5);
    if (la > 0.02 && bf < 0.5) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = la * 0.42; g.drawImage(litSprite(im, lc), -w / 2, -h, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    g.restore();
    if (bf > 0) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const v of d.vines) {
        const px = G[0] + (v.u - 0.5) * w * 0.8, py = by - h * (0.25 + v.h * 0.5), r = w * (0.12 + v.h * 0.1);
        g.globalAlpha = 0.7 * Math.sin(bf * Math.PI) * (0.6 + 0.4 * Math.sin(t * 9 + v.ph * 3));
        g.drawImage(glowSprite('#ff7a30'), px - r, py - r, r * 2, r * 2);
      }
      g.restore();
    }
    return;
  }
  // a mounded briar: clumps of dark foliage, a few thorny canes arching out, and small wild roses; it chars as it burns
  const mixc = (a, b, k) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const ch = sh => Math.round(lerp((A >> sh) & 255, (B >> sh) & 255, k)); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  const dark = mixc('#1f3020', '#1a120c', bf), mid = mixc('#35532f', '#2a1a10', bf), hi = mixc('#6a8f46', '#4a2a14', bf), cane = mixc('#5b3442', '#24140c', bf);
  const sway = k => Math.sin(t * 1.1 + k) * 0.012;
  const [sx0, sy0] = proj(x + 0.5, y + 0.5, z);
  g.fillStyle = 'rgba(8,16,10,0.28)'; g.beginPath(); g.ellipse(sx0, sy0 + 2 * s, 25 * s, 11 * s, 0, 0, TAU); g.fill();
  const canes = (front) => {
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const v = d.vines[k], isFront = Math.sin(v.a) + Math.cos(v.a) > 0; if (isFront !== front) continue;
      const bx = x + v.u, by = y + v.v, ca = Math.cos(v.a), sa = Math.sin(v.a);
      const p0 = proj(bx, by, z + 0.15 * hk), p1 = proj(bx + ca * 0.22 + sway(v.ph), by + sa * 0.22, z + (0.75 + v.h * 0.35) * hk), p2 = proj(bx + ca * 0.42, by + sa * 0.42, z + 0.35 * hk);
      g.strokeStyle = cane; g.lineWidth = 1.7 * s;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke();
      g.fillStyle = cane;
      for (const u of [0.32, 0.55, 0.78]) {
        const qx = (1 - u) * (1 - u) * p0[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0], qy = (1 - u) * (1 - u) * p0[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1];
        const side = u === 0.55 ? -1 : 1;
        g.beginPath(); g.moveTo(qx - 1.1 * s, qy); g.lineTo(qx + side * 2.6 * s, qy - 3 * s); g.lineTo(qx + 1.1 * s, qy); g.fill();
      }
    }
  };
  canes(false);
  // foliage clumps, back to front
  const puffs = d.vines.slice().sort((a, b) => (a.u + a.v) - (b.u + b.v));
  for (const p of puffs) {
    const [px, py] = proj(x + p.u + sway(p.ph), y + p.v, z + (0.16 + p.h * 0.4) * hk), r = (8.5 + p.h * 6) * s * (0.5 + 0.5 * hk);
    // ink round each clump first; the next clump covers the inside of it, leaving a scalloped outline
    g.beginPath(); g.arc(px, py + r * 0.18, r, 0, TAU); g.strokeStyle = bf > 0.5 ? 'rgba(20,12,8,0.85)' : INK; g.lineWidth = 2.8 * s; g.stroke();
    g.fillStyle = dark; g.beginPath(); g.arc(px, py + r * 0.18, r, 0, TAU); g.fill();
    g.fillStyle = mid; g.beginPath(); g.arc(px, py, r * 0.88, 0, TAU); g.fill();
    g.fillStyle = hi; g.globalAlpha = 0.75; g.beginPath(); g.arc(px - r * 0.28, py - r * 0.32, r * 0.42, 0, TAU); g.fill();
    // leaf speckles
    g.globalAlpha = 0.5; g.fillStyle = hi;
    for (let k = 0; k < 3; k++) { const a = p.a + k * 2.1; g.beginPath(); g.ellipse(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.4, r * 0.16, r * 0.08, a, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    if (bf > 0) { g.fillStyle = `rgba(255,${Math.round(150 - bf * 70)},50,${0.55 * Math.sin(bf * Math.PI)})`; g.beginPath(); g.arc(px + r * 0.2, py - r * 0.1, r * 0.35, 0, TAU); g.fill(); }
  }
  canes(true);
  // wild roses on the near side of the bush
  if (!c.burn) {
    for (const p of puffs.slice(-3)) {
      if (p.ph > 4.2) continue;
      const [fx, fy] = proj(x + p.u + sway(p.ph), y + p.v, z + (0.2 + p.h * 0.5) * hk), fr = 2.1 * s;
      g.fillStyle = p.ph < 2 ? '#f3c2cf' : '#fbeee6';
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + p.a; g.beginPath(); g.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr * 0.8, fr * 0.75, 0, TAU); g.fill(); }
      g.fillStyle = '#e8b84a'; g.beginPath(); g.arc(fx, fy, fr * 0.5, 0, TAU); g.fill();
    }
  }
}

function drawBrazier(g, c, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  if (SPRITE.brazier) {
    const im = SPRITE.brazier, W = im.naturalWidth, H = im.naturalHeight, k = BRAZ_W * TW * s / W, w = W * k, h = H * k;
    const G = proj(x + 0.5, y + 0.5, z), left = G[0] - w / 2, topY = G[1] - (H - W / 4) * k;
    g.fillStyle = 'rgba(10,8,16,0.3)'; g.beginPath(); g.ellipse(G[0], G[1], w * 0.62, w * 0.3, 0, 0, TAU); g.fill();
    g.drawImage(im, left, topY, w, h);
    // the bowl's mouth: embers when lit, a slow ember ring when not
    const bx = left + 0.487 * w, byy = topY + 0.145 * h, rx = 0.36 * w, ry = 0.16 * w, bz = z + brazierBowlZ();
    if (c.lit) {
      g.save(); g.beginPath(); g.ellipse(bx, byy, rx, ry, 0, 0, TAU); g.clip();
      const eg = g.createRadialGradient(bx, byy + ry * 0.2, 0, bx, byy + ry * 0.2, rx);
      eg.addColorStop(0, '#fff0b0'); eg.addColorStop(0.35, '#ffa040'); eg.addColorStop(1, 'rgba(160,50,20,0.9)');
      g.fillStyle = eg; g.fillRect(bx - rx, byy - ry, rx * 2, ry * 2);
      g.restore();
      if (Math.random() < 0.9) flameP(x + 0.5 + (Math.random() - .5) * 0.22, y + 0.5 + (Math.random() - .5) * 0.22, bz + 0.05, 1.1);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + c.x);
      g.strokeStyle = `rgba(255,170,80,${0.3 + pulse * 0.4})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(bx, byy, rx * 0.9, ry * 0.9, 0, 0, TAU); g.stroke();
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.15 + pulse * 0.2;
      g.strokeStyle = '#ffb060'; g.lineWidth = 2 * s;
      g.beginPath(); g.ellipse(G[0], G[1], (26 + pulse * 6) * s, (13 + pulse * 3) * s, 0, 0, TAU); g.stroke();
      g.restore();
      if (Math.random() < 0.04) emit({ x: c.x + 0.5 + (Math.random() - .5) * 0.3, y: c.y + 0.5 + (Math.random() - .5) * 0.3, z: bz, vz: 0.6, life: 1.2, size: 2.2, color: '#ffb060', kind: 'glow' });
    }
    return;
  }
  prism(g, x + 0.3, y + 0.3, x + 0.7, y + 0.7, z, z + 0.5, '#9a8fa8', '#6e6380', '#4e4560');
  prism(g, x + 0.22, y + 0.22, x + 0.78, y + 0.78, z, z + 0.08, '#8a7f98', '#5e5470', '#443c55');
  const P = proj(x + 0.5, y + 0.5, z + 0.62);
  g.fillStyle = '#3a2c3a'; g.beginPath(); g.ellipse(P[0], P[1] + 3 * s, 15 * s, 8 * s, 0, 0, Math.PI); g.fill();
  g.fillStyle = '#7a6a5a'; g.beginPath(); g.ellipse(P[0], P[1], 16 * s, 7 * s, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(P[0], P[1], 16 * s, 7 * s, 0, 0, TAU); g.moveTo(P[0] + 15 * s, P[1] + 2 * s); g.ellipse(P[0], P[1] + 3 * s, 15 * s, 8 * s, 0, 0.3, Math.PI - 0.3); inkStroke(g, INK, 1.3);
  g.fillStyle = c.lit ? '#ff9a3a' : '#2a2026'; g.beginPath(); g.ellipse(P[0], P[1], 12.5 * s, 5 * s, 0, 0, TAU); g.fill();
  if (c.lit) {
    if (Math.random() < 0.9) flameP(x + 0.5 + (Math.random() - .5) * 0.25, y + 0.5 + (Math.random() - .5) * 0.25, z + 0.72, 1.1);
  } else {
    // unlit: a faint, slow-pulsing ember so it can be found at a glance
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + c.x);
    g.strokeStyle = `rgba(255,170,80,${0.3 + pulse * 0.4})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(P[0], P[1], 12.5 * s, 5 * s, 0, 0, TAU); g.stroke();
    const G = proj(c.x + 0.5, c.y + 0.5, z);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.15 + pulse * 0.2;
    g.strokeStyle = '#ffb060'; g.lineWidth = 2 * s;
    g.beginPath(); g.ellipse(G[0], G[1], (26 + pulse * 6) * s, (13 + pulse * 3) * s, 0, 0, TAU); g.stroke();
    g.restore();
    if (Math.random() < 0.04) emit({ x: c.x + 0.5 + (Math.random() - .5) * 0.3, y: c.y + 0.5 + (Math.random() - .5) * 0.3, z: z + 0.7, vz: 0.6, life: 1.2, size: 2.2, color: '#ffb060', kind: 'glow' });
  }
}

function drawGate(g, c, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s, hh = 1.6 * (1 - c.open);
  if (hh < 0.02) {
    const P = proj(x + 0.5, y + 0.5, z);
    g.strokeStyle = 'rgba(255,210,120,0.5)'; g.lineWidth = 1.5 * s; g.beginPath(); g.ellipse(P[0], P[1], 18 * s, 9 * s, 0, 0, TAU); g.stroke();
    return;
  }
  if (texOK) {
    const rs = TEX_SRC.runestone && !TEX_SRC.runestone.drawn;
    texturedBox(g, x + 0.08, y + 0.08, x + 0.92, y + 0.92, z, z + hh, rs
      ? { colT: '#6a6478', colL: '#5c5670', colR: '#4a4560', top: 'runestone', side: 'runestone', tint: 'rgba(40,24,70,0.12)', rim: 'rgba(220,200,255,0.4)' }
      : { colT: '#8c84a8', colL: '#5c5280', colR: '#443a66', top: 'stoneTop', side: 'stoneSide', tint: 'rgba(70,46,120,0.32)', rim: 'rgba(220,200,255,0.4)' });
  }
  else prism(g, x + 0.08, y + 0.08, x + 0.92, y + 0.92, z, z + hh, '#8c84a8', '#5c5280', '#443a66', 'rgba(255,255,255,0.12)');
  // runes on faces
  const lit = World.braziers.filter(b => b.lit).length, tot = World.braziers.length;
  const col = World.gateOpen ? '#ffd27a' : '#7fe8ff';
  g.save(); g.globalCompositeOperation = 'lighter';
  g.strokeStyle = hexA(col, 0.6 + 0.3 * Math.sin(t * 3)); g.lineWidth = 1.6 * s;
  for (let k = 0; k < 3; k++) {
    const zz = z + hh * (0.25 + k * 0.25);
    if (zz > z + hh - 0.1) continue;
    const p = proj(x + 0.92, y + 0.3 + k * 0.2, zz), q = proj(x + 0.3 + k * 0.2, y + 0.92, zz);
    g.beginPath(); g.moveTo(p[0], p[1] - 5 * s); g.lineTo(p[0] + 3 * s, p[1]); g.lineTo(p[0], p[1] + 5 * s); g.lineTo(p[0] - 3 * s, p[1]); g.closePath(); g.stroke();
    g.beginPath(); g.arc(q[0], q[1], 4 * s, 0, TAU); g.moveTo(q[0], q[1] - 6 * s); g.lineTo(q[0], q[1] + 6 * s); g.stroke();
  }
  // brazier counter pips on top
  const T = proj(x + 0.5, y + 0.5, z + hh);
  for (let i = 0; i < tot; i++) {
    g.fillStyle = i < lit ? '#ffb050' : 'rgba(127,232,255,0.4)';
    g.beginPath(); g.arc(T[0] + (i - (tot - 1) / 2) * 9 * s, T[1], 3 * s, 0, TAU); g.fill();
  }
  g.restore();
}

// where the painted ring's dark well sits in its picture (fractions of its width and height; radii of its width),
// and how much to flatten it so it lies flush on the tile
const GOAL = { cx: 0.5009, cy: 0.4943, rx: 0.326, ry: 0.1975, squash: 0.83, w: 0.8 };
function drawFont(g, c, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  const P = proj(x + 0.5, y + 0.5, z);
  if (SPRITE.goal) {
    const im = SPRITE.goal, w = GOAL.w * TW * s, h = w * im.naturalHeight / im.naturalWidth * GOAL.squash;
    const left = P[0] - GOAL.cx * w, topY = P[1] - GOAL.cy * h, irx = GOAL.rx * w, iry = GOAL.ry * w * GOAL.squash;
    g.fillStyle = 'rgba(10,8,16,0.3)'; g.beginPath(); g.ellipse(P[0], P[1] + 2 * s, w * 0.52, w * 0.27, 0, 0, TAU); g.fill();
    g.drawImage(im, left, topY, w, h);
    // the well of light
    const gr = g.createRadialGradient(P[0], P[1] + iry * 0.2, 0, P[0], P[1], irx * 1.05);
    gr.addColorStop(0, '#f0ffff'); gr.addColorStop(0.35, '#7fe4f5'); gr.addColorStop(0.8, '#1d5d80'); gr.addColorStop(1, 'rgba(20,40,70,0.75)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(P[0], P[1], irx, iry, 0, 0, TAU); g.fill();
    // its inner rim, shaded where the stone overhangs it
    g.strokeStyle = 'rgba(20,24,40,0.45)'; g.lineWidth = 2 * s; g.beginPath(); g.ellipse(P[0], P[1] + 0.6 * s, irx, iry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    // the rune ring turning slowly in the light
    g.save(); g.translate(P[0], P[1]); g.scale(1, iry / irx); g.rotate(t * 0.4);
    g.strokeStyle = 'rgba(200,250,255,0.85)'; g.lineWidth = 1.2 * s;
    g.beginPath(); g.arc(0, 0, irx * 0.72, 0, TAU); g.stroke();
    for (let k = 0; k < 8; k++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(irx * 0.58, 0); g.lineTo(irx * 0.84, 0); g.moveTo(irx * 0.71, -3 * s); g.lineTo(irx * 0.71, 3 * s); g.stroke(); }
    g.restore();
    if (Math.random() < 0.25) emit({ x: x + 0.5 + (Math.random() - .5) * 0.45, y: y + 0.5 + (Math.random() - .5) * 0.45, z: z + 0.05, vz: 0.8 + Math.random(), life: 1.6, size: 3, color: '#8ff4ff', kind: 'glow' });
    return;
  }
  const rx = 0.42 * TW * 0.7071 * s * 1.25, ry = rx * 0.5;
  // a gilded ring set into the ground around a well of light
  g.fillStyle = '#5a3f1c'; g.beginPath(); g.ellipse(P[0], P[1] + 3 * s, rx * 1.06, ry * 1.06, 0, 0, TAU); g.fill();
  const rim = g.createLinearGradient(P[0] - rx, P[1] - ry, P[0] + rx, P[1] + ry);
  rim.addColorStop(0, '#fff1c2'); rim.addColorStop(0.45, '#e2b45e'); rim.addColorStop(1, '#93621f');
  g.beginPath(); g.ellipse(P[0], P[1] + 1.5 * s, rx * 1.06, ry * 1.06 + 1.5 * s, 0, 0, TAU); inkStroke(g, INK, 1.4);
  g.fillStyle = rim; g.beginPath(); g.ellipse(P[0], P[1], rx, ry, 0, 0, TAU); g.fill();
  g.fillStyle = '#1c1530'; g.beginPath(); g.ellipse(P[0], P[1] + 0.5 * s, rx * 0.8, ry * 0.8, 0, 0, TAU); g.fill();
  const gr = g.createRadialGradient(P[0], P[1] + ry * 0.2, 0, P[0], P[1], rx * 0.78);
  gr.addColorStop(0, '#f0ffff'); gr.addColorStop(0.35, '#7fe4f5'); gr.addColorStop(0.8, '#1d5d80'); gr.addColorStop(1, 'rgba(20,40,70,0.6)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(P[0], P[1], rx * 0.74, ry * 0.74, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,245,210,0.7)'; g.lineWidth = 1; g.beginPath(); g.ellipse(P[0], P[1], rx * 0.97, ry * 0.97, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  // rotating rune ring
  g.save(); g.translate(P[0], P[1]); g.scale(1, 0.5); g.rotate(t * 0.4);
  g.strokeStyle = 'rgba(200,250,255,0.85)'; g.lineWidth = 1.2 * s;
  g.beginPath(); g.arc(0, 0, rx * 0.62, 0, TAU); g.stroke();
  for (let k = 0; k < 8; k++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(rx * 0.5, 0); g.lineTo(rx * 0.7, 0); g.moveTo(rx * 0.6, -3 * s); g.lineTo(rx * 0.6, 3 * s); g.stroke(); }
  g.restore();
  if (Math.random() < 0.25) emit({ x: x + 0.5 + (Math.random() - .5) * 0.5, y: y + 0.5 + (Math.random() - .5) * 0.5, z: z + 0.05, vz: 0.8 + Math.random(), life: 1.6, size: 3, color: '#8ff4ff', kind: 'glow' });
}

function drawShadow(g, b) {
  const sup = supportFor(b); if (sup < -50) return;
  const h = b.z - sup, P = proj(b.x, b.y, sup), s = cam.s;
  const k = clamp(1 - h / 4, 0.2, 1);
  g.fillStyle = `rgba(10,5,20,${0.35 * k})`;
  g.beginPath(); g.ellipse(P[0], P[1], b.r * TW * 0.75 * s * (1.2 - k * 0.2), b.r * TH * 0.75 * s * (1.2 - k * 0.2), 0, 0, TAU); g.fill();
}
function drawBody(g, b, t) {
  const s = cam.s;
  drawShadow(g, b);
  if (b.imb || b.arrive) { // elemental aura of an imbued body
    const [cx, cy] = proj(b.x, b.y, b.z + b.hgt * 0.5);
    g.save(); g.globalCompositeOperation = 'lighter';
    let k = 0;
    for (const id of [...Object.keys(b.imb || {}), ...(b.arrive || []).map(a => a.id)]) {
      const r = (34 + 6 * Math.sin(t * 6 + k)) * s; g.globalAlpha = 0.5;
      g.drawImage(glowSprite(SIGILS[id].color), cx - r, cy - r, r * 2, r * 2);
      const a = t * 3 + k * 2.1; g.globalAlpha = 0.9; g.fillStyle = SIGILS[id].color;
      g.beginPath(); g.arc(cx + Math.cos(a) * 16 * s, cy + Math.sin(a) * 8 * s, 2.5 * s, 0, TAU); g.fill();
      k++;
    }
    g.restore();
  }
  if (b.kind === 'slab') {
    const r = b.r;
    if (b.lev > 0) { const [gx, gy] = proj(b.x, b.y, b.z); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + 0.15 * Math.sin(t * 4); g.drawImage(glowSprite('#cdb0ff'), gx - 40 * s, gy - 14 * s, 80 * s, 40 * s); g.restore(); }
    if (texOK) texturedBox(g, b.x - r, b.y - r, b.x + r, b.y + r, b.z, b.z + b.hgt, { colT: '#a29f80', colL: '#6c6f58', colR: '#575a48', top: 'stoneTop', side: 'stoneSide', tint: 'rgba(150,110,210,0.16)' });
    else prism(g, b.x - r, b.y - r, b.x + r, b.y + r, b.z, b.z + b.hgt, '#bcb2cc', '#857a98', '#665c7a', 'rgba(255,255,255,0.25)');
    const P = proj(b.x, b.y, b.z + b.hgt);
    g.strokeStyle = `rgba(205,176,255,${0.5 + 0.3 * Math.sin(t * 3)})`; g.lineWidth = 1.2 * s;
    g.beginPath(); g.ellipse(P[0], P[1], 13 * s, 6.5 * s, 0, 0, TAU); g.stroke();
    return;
  }
  if (b.kind === 'orb') {
    const [cx, cy] = proj(b.x, b.y, b.z + b.r);
    const r = b.r * TW * 0.78 * s;
    // a tight halo here; its glow on the ground is drawn in the light pass, once the land is down (drawn here, the
    // tiles in front would cut it off square)
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.55 + (b.captured ? 0.35 : 0); g.drawImage(glowSprite('#ffc860'), cx - r * 1.8, cy - r * 1.8, r * 3.6, r * 3.6); g.restore();
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    gr.addColorStop(0, '#fffbea'); gr.addColorStop(0.35, '#ffd77a'); gr.addColorStop(0.8, '#d4862c'); gr.addColorStop(1, '#8a4a1a');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    // inner swirl rotating with roll
    g.save(); g.beginPath(); g.arc(cx, cy, r * 0.92, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(255,255,230,0.75)'; g.lineWidth = 1.4 * s;
    const sx = (b.rx - b.ry), sy = (b.rx + b.ry) * 0.5;
    for (let k = 0; k < 3; k++) {
      const ph = b.spin + k * TAU / 3, off = Math.sin(ph) * r * 0.75;
      const ex = cx + sx * off, ey = cy + sy * off;
      const vis = Math.cos(ph);
      if (vis < -0.2) continue;
      g.globalAlpha = 0.3 + vis * 0.5;
      g.beginPath(); g.ellipse(ex, ey, r * 0.18 * (0.4 + 0.6 * Math.abs(vis)), r * 0.5, Math.atan2(sy, sx), 0, TAU); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,240,200,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.45, r * 0.16, r * 0.1, -0.6, 0, TAU); g.fill();
  } else {
    const r = b.r, burnt = b.burn ? clamp(b.burn, 0, 1) : 0;
    if (texOK) {
      texturedBox(g, b.x - r, b.y - r, b.x + r, b.y + r, b.z, b.z + b.hgt, { colT: '#b98a52', colL: '#8a6238', colR: '#6a4628', top: 'wood', side: 'wood', tint: burnt ? `rgba(26,14,8,${(burnt * 0.75).toFixed(3)})` : null, rim: 'rgba(255,230,190,0.35)' });
      return;
    }
    const top = burnt ? shade('#b98a52', 1 - burnt * 0.6) : '#b98a52', left = burnt ? shade('#8a6238', 1 - burnt * 0.6) : '#8a6238', right = burnt ? shade('#6a4628', 1 - burnt * 0.6) : '#6a4628';
    prism(g, b.x - r, b.y - r, b.x + r, b.y + r, b.z, b.z + b.hgt, top, left, right, 'rgba(40,20,10,0.6)');
    g.strokeStyle = 'rgba(50,25,10,0.55)'; g.lineWidth = 1.2 * s;
    for (const k of [0.33, 0.66]) {
      let p = proj(b.x + r, b.y - r, b.z + b.hgt * k), q = proj(b.x + r, b.y + r, b.z + b.hgt * k); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
      p = proj(b.x - r, b.y + r, b.z + b.hgt * k); q = proj(b.x + r, b.y + r, b.z + b.hgt * k); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    let p = proj(b.x + r, b.y - r, b.z), q = proj(b.x + r, b.y + r, b.z + b.hgt); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    p = proj(b.x - r, b.y + r, b.z); q = proj(b.x + r, b.y + r, b.z + b.hgt); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
}

/* Spell seal projected onto the ground */
function drawSeal(g, sp, x, y, z, R, alpha, rot, prog, t) {
  const [cx, cy] = proj(x, y, z), k = R * TW * 0.7071 * cam.s;
  g.save(); g.translate(cx, cy); g.scale(k, k * 0.5); g.rotate(rot);
  g.globalAlpha = alpha;
  const lw = 1 / k;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = sp.color;
  // each line stroked wide and faint, then narrower, then sharp: a soft glow (canvas shadowBlur is very slow on phones)
  const glow = (w) => { for (const [k, a] of [[5, 0.12], [2.6, 0.25], [1, 1]]) { g.globalAlpha = alpha * a; g.lineWidth = w * k * lw; g.stroke(); } g.globalAlpha = alpha; };
  g.beginPath(); g.arc(0, 0, 1.0, 0, TAU * Math.min(1, prog * 1.5)); glow(2);
  g.beginPath(); g.arc(0, 0, 1.16, 0, TAU); glow(1);
  g.fillStyle = hexA(sp.color, 0.9);
  g.save(); g.scale(1 / 100, 1 / 100); textOnCircle(g, SIGILS[sp.sigil].words, 0, 0, 108, -rot * 2, 9); g.restore();
  // the caster's own strokes
  for (const st of sp.art) {
    const n = Math.max(2, Math.floor(st.pts.length * clamp(prog * 1.4, 0, 1)));
    g.beginPath();
    for (let i = 0; i < n; i++) { const p = st.pts[i]; i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
    glow(2.2);
  }
  g.restore();
}

/* The goal must never be lost behind the land: blocks standing in front of it, tall enough to hide it, are drawn
   into a layer of their own, a soft window is rubbed out of that layer round the goal, and the layer laid down. */
function xrayFor() {
  const f = World.cells.find(c => c.feat === 'font'); if (!f) return null;
  const set = new Set();
  for (const c of World.cells) {
    if (c.void || c === f) continue;
    const di = c.x - f.x, dj = c.y - f.y;
    if (di < 0 || dj < 0 || Math.abs(di - dj) > 1) continue;
    if ((c.h - f.h) * TZ > (di + dj) * TH * 0.5 - 12) set.add(c);
  }
  if (!set.size) return null;
  const [cx, cy] = proj(f.x + 0.5, f.y + 0.5, f.h);
  return { set, cx, cy: cy - 14 * cam.s, R: TW * cam.s * 1.15 };
}
let _xrC = null;
function drawXray(g, c, t, xr) {
  const m = g.getTransform(), W = g.canvas.width, H = g.canvas.height;
  if (!_xrC) _xrC = document.createElement('canvas');
  if (_xrC.width !== W || _xrC.height !== H) { _xrC.width = W; _xrC.height = H; }
  // only the block's own box on screen is cleared and laid down
  const pts = [];
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) for (const z of [c.h + 0.2, ROCK_FLOOR - 0.5]) pts.push(proj(c.x + u, c.y + v, z));
  const pad = 24 * cam.s, X0 = Math.min(...pts.map(p => p[0])) - pad, X1 = Math.max(...pts.map(p => p[0])) + pad;
  const Y0 = Math.min(...pts.map(p => p[1])) - pad, Y1 = Math.max(...pts.map(p => p[1])) + pad;
  const dx0 = Math.max(0, Math.floor(m.a * X0 + m.e)), dy0 = Math.max(0, Math.floor(m.d * Y0 + m.f));
  const dx1 = Math.min(W, Math.ceil(m.a * X1 + m.e)), dy1 = Math.min(H, Math.ceil(m.d * Y1 + m.f));
  if (dx1 <= dx0 || dy1 <= dy0) { drawCell(g, c, t); return; }
  const lg = _xrC.getContext('2d');
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
  lg.setTransform(m); lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
  drawCell(lg, c, t);
  lg.globalCompositeOperation = 'destination-out';
  const gr = lg.createRadialGradient(xr.cx, xr.cy, 0, xr.cx, xr.cy, xr.R);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  lg.fillStyle = gr; lg.fillRect(xr.cx - xr.R, xr.cy - xr.R, xr.R * 2, xr.R * 2);
  lg.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(_xrC, dx0, dy0, dx1 - dx0, dy1 - dy0, dx0, dy0, dx1 - dx0, dy1 - dy0);
  g.restore();
}
/* The tile cache. Most of the land holds still from frame to frame, yet painting a tile (its textured top, walls,
   soil, rock, moss and vines) takes dozens of fills. So a still tile is painted once into a small bitmap of its own
   and laid down from it each frame; its light, its water and whatever stands on it are still drawn live over it.
   A tile is painted afresh when it or a tile near it changes (once things settle), or the view moves or rescales. */
const TC = { on: true, gkey: '', cells: null, map: new Map(), keys: [], calm: new Map() };
const cellStateKey = c => c.void ? 'v' : c.h.toFixed(3) + '|' + c.th + '|' + (c.water == null ? '' : c.water.toFixed(3)) + '|' + c.ice + '|' + c.icy + '|' + c.frost + '|' +
  (c.wet || 0).toFixed(2) + '|' + (c.ash || 0).toFixed(2) + '|' + c.feat + '|' + c.burn;
function tileCacheFrame() {
  const D = typeof DPR !== 'undefined' ? DPR : 1;
  const gk = cam.s + '|' + cam.ox.toFixed(2) + '|' + cam.oy.toFixed(2) + '|' + D + '|' + Object.keys(SPRITE).length + '|' + TEX_VER + '|' + texOK;
  if (gk !== TC.gkey || TC.cells !== World.cells) { TC.gkey = gk; TC.cells = World.cells; for (const e of TC.map.values()) tileDrop(e); TC.map.clear(); TC.keys = []; }
  const cs = World.cells;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i], k = cellStateKey(c);
    if (TC.keys[i] === k) continue;
    TC.keys[i] = k;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const n = cellI(c.x + dx, c.y + dy); if (!n) continue;
      tileDrop(TC.map.get(n)); TC.map.delete(n); TC.calm.set(n, frameNo);
    }
  }
  TC.built = 0;
}
// canvases let go by the cache, kept to be reused (fewer new canvases, and less for the browser to clear up)
const TC_POOL = [];
function tileDrop(e) { if (e && TC_POOL.length < 64) TC_POOL.push(e.cv); else if (e) { e.cv.width = 1; e.cv.height = 1; } }
/* Lets go of the world's big drawing buffers (tile bitmaps, bloom, the see-through layer, the waterfall strips, the
   sky's glow layer) while a card hides the world: on phones the browser then has the memory to draw the card. Each
   is made again as it's next needed. */
function releaseBuffers() {
  for (const e of TC.map.values()) { e.cv.width = 1; e.cv.height = 1; }
  for (const c of TC_POOL) { c.width = 1; c.height = 1; }
  TC_POOL.length = 0; TC.map.clear(); TC.keys = []; TC.gkey = '';
  for (const k of ['a', 'b']) if (BLOOM[k]) { BLOOM[k].width = 1; BLOOM[k].height = 1; }
  if (_xrC) { _xrC.width = 1; _xrC.height = 1; }
  for (const k in _sheetC) { _sheetC[k].c.width = 1; _sheetC[k].c.height = 1; _sheetC[k].fresh = false; }
  if (SKY.ribbonGlow) { SKY.ribbonGlow.width = 1; SKY.ribbonGlow.height = 1; }
}
function buildTile(c, t) {
  const s = cam.s, D = typeof DPR !== 'undefined' ? DPR : 1;
  let zLow = c.h;
  for (const R of [true, false]) { const n = R ? cellI(c.x + 1, c.y) : cellI(c.x, c.y + 1); zLow = Math.min(zLow, !n || n.void ? ROCK_FLOOR - 0.4 : n.h); }
  const X0 = Math.floor((proj(c.x, c.y + 1, 0)[0] - 0.4 * TW * s) * D) / D, X1 = Math.ceil((proj(c.x + 1, c.y, 0)[0] + 0.4 * TW * s) * D) / D;
  const Y0 = Math.floor((proj(c.x, c.y, c.h)[1] - 26 * s - 4) * D) / D, Y1 = Math.ceil((proj(c.x + 1, c.y + 1, zLow)[1] + 18 * s + 4) * D) / D;
  const w = Math.round((X1 - X0) * D), h = Math.round((Y1 - Y0) * D); if (w < 1 || h < 1 || w * h > 4e6) return null;
  const cv = TC_POOL.pop() || document.createElement('canvas'); cv.width = w; cv.height = h;
  const lg = cv.getContext('2d'); lg.setTransform(D, 0, 0, D, -X0 * D, -Y0 * D);
  const h0 = HANG.length; NO_LIGHT = true;
  try { drawCell(lg, c, t, 'base'); } finally { NO_LIGHT = false; }
  const e = { cv, X0, Y0, w: w / D, h: h / D, hang: HANG.slice(h0) };
  TC.map.set(c, e); TC.built++;
  return e;
}
// the light falling on a tile laid from its bitmap: on its two walls in view, then its top (as drawCell lights them)
function tileLights(g, c) {
  let near = false;
  for (const l of LIGHTS) { const dx = c.x + 0.5 - l.x, dy = c.y + 0.5 - l.y; if (dx * dx + dy * dy < (l.r + 1.2) ** 2) { near = true; break; } }
  if (!near) return;
  const x = c.x, y = c.y, z = c.h;
  const rc0 = stoneCorners(c), sc0 = soilCorners(c), cr = rc0 || sc0, R0 = rc0 ? ROUND_R : SOIL_R;
  for (const R of [true, false]) {
    if (c.icy) continue;
    const n = R ? cellI(x + 1, y) : cellI(x, y + 1), bot = !n || n.void ? soilBot(c) : n.h;
    if (bot >= z - 0.001) continue;
    // the straight stretch of the wall (its curved ends take their light in lightCurves)
    let u0 = cr && (R ? cr[1] : cr[3]) ? R0 : 0, u1 = cr && cr[2] ? 1 - R0 : 1;
    if (soilConcave(c, R)) u0 = SOIL_R;
    lightSide(g, c, R, z, bot, R ? [proj(x + 1, y + u0, z), proj(x + 1, y + u1, z), proj(x + 1, y + u1, bot), proj(x + 1, y + u0, bot)]
      : [proj(x + u0, y + 1, z), proj(x + u1, y + 1, z), proj(x + u1, y + 1, bot), proj(x + u0, y + 1, bot)]);
  }
  if (!c.icy) lightCurves(g, c);
  const rc = stoneCorners(c), sj = stoneJoins(c, rc), sc = soilCorners(c), lw = landWaterCorners(c), rounded = rc || sj || sc || lw;
  const radii = [0, 1, 2, 3].map(k => rc && rc[k] ? ROUND_R : sj && sj.jc[k] ? NOTCH_R : sc && sc[k] ? SOIL_R : lw && lw[k] ? WATER_R : 0);
  const big = rounded ? growPoly(roundedOutline(radii).map(([u, v]) => proj(x + u, y + v, z)), 0.6)
    : growQuad([proj(x, y, z), proj(x + 1, y, z), proj(x + 1, y + 1, z), proj(x, y + 1, z)], 0.6);
  lightTop(g, c, z, big);
}
function drawTile(g, c, t) {
  const still = TC.on && !(c.water != null && c.water > c.h) && !(c.frost > 0) && !c.burn && Math.abs(c.h - c.th) < 1e-3
    && frameNo - (TC.calm.get(c) ?? -99) > 8;
  let e = still ? TC.map.get(c) : null;
  if (still && !e && TC.built < 8) e = buildTile(c, t); // a few a frame, so settling never makes one long frame
  else if (e) for (const v of e.hang) HANG.push(v);
  if (!e) { drawCell(g, c, t); return; }
  g.drawImage(e.cv, e.X0, e.Y0, e.w, e.h);
  tileLights(g, c);
  drawCell(g, c, t, 'top');
}
let frameNo = 0;
function render(g, w, h, t, overlay) {
  frameNo++;
  drawSky(g, w, h, t);
  if (!World.W) return;
  easeCamera();
  tileCacheFrame();
  gatherLights(t);
  g.save();
  if (cam.shake > 0) g.translate((Math.random() - .5) * cam.shake * 14, (Math.random() - .5) * cam.shake * 10);
  // ordered draw list
  const items = [];
  for (const c of World.cells) if (!c.void) items.push({ k: c.x + c.y, sub: c.x, c });
  for (const b of World.bodies) {
    if (!b.alive) continue;
    const fx = Math.floor(b.x + b.r * 0.7), fy = Math.floor(b.y + b.r * 0.7);
    items.push({ k: fx + fy, sub: fx + 0.5, b });
  }
  items.sort((a, b) => a.k - b.k || a.sub - b.sub);
  // ground-plane seals underneath bodies: draw seals (normal) after terrain items of their diagonal — simpler: draw all terrain, then seals, but bodies keep order
  HANG.length = 0; hangAt = 0;
  const xr = xrayFor();
  for (const it of items) {
    if (hangAt < HANG.length) flushHang(g, t, it.k - 2);
    if (it.c) { if (xr && xr.set.has(it.c)) drawXray(g, it.c, t, xr); else drawTile(g, it.c, t); }
    else drawBody(g, it.b, t);
  }
  flushHang(g, t, Infinity);
  // overlay (aim preview) & casting seals
  if (overlay) overlay(g, t);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = World.seals.length - 1; i >= 0; i--) {
    const S = World.seals[i];
    const a = S.t < 0.4 ? S.t / 0.4 : 1 - clamp((S.t - 0.8) / 0.8, 0, 1);
    drawSeal(g, S.sp, S.x, S.y, S.z + 0.04, S.R * (1 + S.t * 0.15), a, t * 0.6, S.t / 0.4, t);
  }
  g.restore();
  drawParticles(g, false);
  g.globalCompositeOperation = 'lighter';
  drawParticles(g, true);
  // light pass
  const s = cam.s;
  for (const b of World.bodies) {
    if (!b.alive || b.kind !== 'orb') continue;
    const [cx, cy] = proj(b.x, b.y, b.z + 0.3), r = 120 * s;
    g.globalAlpha = 0.22; g.drawImage(glowSprite('#ffb850'), cx - r, cy - r * 0.6, r * 2, r * 1.2);
    const [hx, hy] = proj(b.x, b.y, b.z), hr = b.r * TW * 0.78 * s * 3.4;
    g.globalAlpha = 0.32 + (b.captured ? 0.25 : 0); g.drawImage(glowSprite('#ffc860'), hx - hr, hy - hr * 0.5, hr * 2, hr);
  }
  for (const c of World.cells) {
    if (c.feat === 'brazier' && c.lit) { const [cx, cy] = proj(c.x + .5, c.y + .5, c.h + brazierBowlZ() + 0.3), r = (110 + Math.sin(t * 13 + c.x) * 6) * s; g.globalAlpha = 0.3; g.drawImage(glowSprite('#ff8a3a'), cx - r, cy - r * 0.7, r * 2, r * 1.4); }
    if (c.burn) { const [cx, cy] = proj(c.x + .5, c.y + .5, c.h + .5), r = 90 * s; g.globalAlpha = 0.25; g.drawImage(glowSprite('#ff7030'), cx - r, cy - r * 0.7, r * 2, r * 1.4); }
    if (c.feat === 'font') {
      const [cx, cy] = proj(c.x + .5, c.y + .5, c.h), r = 70 * s;
      g.globalAlpha = 0.35; g.drawImage(glowSprite('#7ff0ff'), cx - r, cy - r * 0.6, r * 2, r * 1.2);
      // a faint column of light, and rings of it rising from the well and widening as they fade
      const bw = 10 * s, bh = 170 * s;
      const gr = g.createLinearGradient(0, cy, 0, cy - bh);
      gr.addColorStop(0, 'rgba(140,240,255,0.22)'); gr.addColorStop(1, 'rgba(140,240,255,0)');
      g.globalAlpha = 0.5 + 0.15 * Math.sin(t * 2); g.fillStyle = gr; g.fillRect(cx - bw / 2, cy - bh, bw, bh);
      const rx0 = 0.42 * TW * 0.7071 * s * 1.25;
      for (let k = 0; k < 4; k++) {
        const ph = ((t * 0.32 + k / 4) % 1), yy = cy - ph * 120 * s, rr = rx0 * (0.75 + ph * 0.75), al = Math.sin(ph * Math.PI) * 0.75;
        g.globalAlpha = al; g.strokeStyle = 'rgba(175,235,255,0.9)'; g.lineWidth = 1.6 * s;
        g.beginPath(); g.ellipse(cx, yy, rr, rr * 0.5, 0, 0, TAU); g.stroke();
        g.globalAlpha = al * 0.35; g.lineWidth = 5 * s; g.beginPath(); g.ellipse(cx, yy, rr, rr * 0.5, 0, 0, TAU); g.stroke();
        g.globalAlpha = al * 0.5; g.lineWidth = 1 * s; g.beginPath(); g.ellipse(cx, yy, rr * 0.6, rr * 0.3, 0, 0, TAU); g.stroke();
      }
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.restore();
  // the storybook's soft glow: light bleeds gently from bright things, and the scene sits in a faint warm haze
  bloom(g);
  // vignette
  g.drawImage(vignette(w, h), 0, 0, w, h);
}
/* Bloom: the frame is shrunk twice into small buffers (the shrinking blurs it), each squared by multiplying it with
   itself so mostly the bright parts survive, then laid back over the frame with 'screen', which only lightens. */
const BLOOM = { on: true, a: null, b: null };
function bloomBuf(k, w, h) {
  let c = BLOOM[k];
  if (!c) c = BLOOM[k] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
function bloom(g) {
  if (!BLOOM.on || !g.canvas) return;
  const cv = g.canvas, W = cv.width, H = cv.height; if (W < 16 || H < 16) return;
  const a = bloomBuf('a', Math.max(2, Math.round(W / 6)), Math.max(2, Math.round(H / 6))), ag = a.getContext('2d');
  const b = bloomBuf('b', Math.max(2, Math.round(W / 24)), Math.max(2, Math.round(H / 24))), bg = b.getContext('2d');
  ag.imageSmoothingQuality = 'high'; bg.imageSmoothingQuality = 'high';
  ag.globalCompositeOperation = 'copy'; ag.drawImage(cv, 0, 0, a.width, a.height);
  ag.globalCompositeOperation = 'multiply'; ag.drawImage(a, 0, 0);
  bg.globalCompositeOperation = 'copy'; bg.drawImage(a, 0, 0, b.width, b.height);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.36; g.drawImage(a, 0, 0, W, H);
  g.globalAlpha = 0.5; g.drawImage(b, 0, 0, W, H);
  // a faint warm haze, strongest low in the frame where the sunset glows
  const hz = g.createLinearGradient(0, 0, 0, H);
  hz.addColorStop(0, 'rgba(120,90,160,0.03)'); hz.addColorStop(0.6, 'rgba(255,170,130,0.05)'); hz.addColorStop(1, 'rgba(255,180,140,0.09)');
  g.globalAlpha = 1; g.fillStyle = hz; g.fillRect(0, 0, W, H);
  g.restore();
}
/* the vignette is a smooth gradient, so it is painted once per screen size at a quarter scale and stretched */
let _vig = null;
function vignette(w, h) {
  if (_vig && _vig.w === w && _vig.h === h) return _vig.c;
  const q = 0.25, c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w * q)); c.height = Math.max(2, Math.round(h * q));
  const g = c.getContext('2d'); g.scale(c.width / w, c.height / h);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,3,16,0.6)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  _vig = { w, h, c };
  return c;
}

/* Ambient motes */
function ambient(dt) {
  if (!World.W) return;
  if (Math.random() < dt * 5) {
    const x = Math.random() * World.W, y = Math.random() * World.H;
    const c = cellAt(x, y);
    if (c && !c.void) emit({ x, y, z: c.h + 0.3 + Math.random(), vx: (Math.random() - .5) * 0.3, vy: (Math.random() - .5) * 0.3, vz: 0.1, life: 3 + Math.random() * 3, size: 2.2, color: Math.random() < 0.6 ? '#f8e7a0' : '#c8ffb0', kind: 'glow' });
  }
}

/* Picking: screen -> world point on the visible surface */
function pick(sx, sy) {
  // a click on (or near) a body aims at that body, even when it floats above the ground
  let best = null, bd = Infinity;
  for (const b of World.bodies) {
    if (!b.alive || b.captured) continue;
    if (b.lev <= 0 && b.z - supportFor(b) < 0.4) continue; // resting bodies are aimed at through the ground as usual
    const [bx, by] = proj(b.x, b.y, b.z + b.r);
    const r = Math.max(b.r * TW * 0.78 * cam.s * 1.8, 22), d = Math.hypot(sx - bx, sy - by);
    if (d < r && d < bd) { bd = d; best = b; }
  }
  if (best) return { x: best.x, y: best.y, z: best.z, c: cellAt(best.x, best.y), body: best };
  for (let d = World.W + World.H - 2; d >= 0; d--) {
    for (let x = Math.min(World.W - 1, d); x >= 0; x--) {
      const y = d - x; if (y < 0 || y >= World.H) continue;
      const c = cellI(x, y); if (c.void) continue;
      const z = surfaceTop(c);
      const p = unproj(sx, sy, z);
      if (p.x >= x && p.x < x + 1 && p.y >= y && p.y < y + 1) return { x: p.x, y: p.y, z, c };
    }
  }
  const p = unproj(sx, sy, 0);
  return { x: p.x, y: p.y, z: 0, c: null };
}
