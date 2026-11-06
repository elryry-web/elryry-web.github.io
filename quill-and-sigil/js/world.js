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
function emit(o) {
  if (parts.length >= MAXP) return;
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
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
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
/* the deep, unchanging part of the sky, drawn once per screen size */
function skyBase(w, h) {
  if (SKY.base && SKY.base.w === w && SKY.base.h === h) return SKY.base.c;
  const dpr = Math.min(2, typeof DPR !== 'undefined' ? DPR : 1);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d'), R = mulberry(7), m = Math.min(w, h);
  g.scale(dpr, dpr);
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
  for (const I of SKY.isles) if (I.layer === 0) {
    const x = ((I.x + t * 0.002 * I.sp) % 1.2 - 0.1) * w, y = I.y * h + Math.sin(t * 0.35 + I.ph) * 5;
    drawIsle(g, I, x, y, I.s * m * 0.06, t, true);
  }
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
  for (let b = 0; b < 3; b++) {
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

function fitCamera(vw, vh, pads) {
  if (!World.W) return;
  if (!pads && World.level && World.level.name === 'Title') pads = [vh * 0.4, 10];
  let maxH = 0; for (const c of World.cells) if (!c.void) maxH = Math.max(maxH, c.h + featH(c));
  const minX = -World.H * TW / 2, maxX = World.W * TW / 2;
  const minY = -maxH * TZ - 20, maxY = (World.W + World.H) * TH / 2 + 2 * TZ;
  // short screens (a phone held sideways) keep the HUD tight to the edges; narrow ones stack it above the land
  const short = vh < 500 && vw > vh;
  const topPad = pads ? pads[0] : short ? 58 : vw < 520 ? 185 : vw < 700 ? 150 : 120;
  const botPad = pads ? pads[1] : short ? 70 : 110;
  const s = clamp(Math.min((vw - 60) / (maxX - minX), (vh - topPad - botPad) / (maxY - minY)), 0.25, 1.9);
  cam.s = s;
  cam.ox = vw / 2 - (minX + maxX) / 2 * s;
  cam.oy = topPad + (vh - topPad - botPad) / 2 - (minY + maxY) / 2 * s;
}

function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round((n >> 16 & 255) * f), 0, 255), gg = clamp(Math.round((n >> 8 & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${gg},${b})`;
}
function prism(g, x0, y0, x1, y1, z0, z1, top, left, right, edge) {
  const A = proj(x0, y0, z1), B = proj(x1, y0, z1), C = proj(x1, y1, z1), D = proj(x0, y1, z1);
  const Bb = proj(x1, y0, z0), Cb = proj(x1, y1, z0), Db = proj(x0, y1, z0);
  g.fillStyle = right; poly(g, [B, C, Cb, Bb]); g.fill();
  g.fillStyle = left; poly(g, [D, C, Cb, Db]); g.fill();
  g.fillStyle = top; poly(g, [A, B, C, D]); g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = 1; poly(g, [A, B, C, D]); g.stroke(); }
}

function drawSideFaces(g, c, d, t) {
  const x = c.x, y = c.y, top = c.h;
  for (const side of ['R', 'L']) {
    const n = side === 'R' ? cellI(x + 1, y) : cellI(x, y + 1);
    let bot, toVoid = false;
    if (!n || n.void) { bot = top - d.depth - (top > 0 ? top * 0.4 : 0); toVoid = true; }
    else bot = n.h;
    if (bot >= top - 0.001) continue;
    const P = side === 'R' ? [proj(x + 1, y, top), proj(x + 1, y + 1, top), proj(x + 1, y + 1, bot), proj(x + 1, y, bot)]
      : [proj(x, y + 1, top), proj(x + 1, y + 1, top), proj(x + 1, y + 1, bot), proj(x, y + 1, bot)];
    const face = (za, zb) => side === 'R' ? [proj(x + 1, y, za), proj(x + 1, y + 1, za), proj(x + 1, y + 1, zb), proj(x + 1, y, zb)]
      : [proj(x, y + 1, za), proj(x + 1, y + 1, za), proj(x + 1, y + 1, zb), proj(x, y + 1, zb)];
    const R = side === 'R', s = cam.s;
    if (c.icy) { g.fillStyle = R ? '#7fb4d0' : '#a6d6ea'; poly(g, P); g.fill(); g.fillStyle = R ? '#9cd0e6' : '#c4e8f6'; poly(g, face(top, Math.max(bot, top - 0.18))); g.fill(); continue; }
    // raised stone: pale, mossy blocks above the ground line
    if (top > 0.01) {
      const sb = Math.max(bot, 0);
      g.fillStyle = R ? '#77716a' : '#97907f'; poly(g, face(top, sb)); g.fill();
      g.strokeStyle = 'rgba(40,32,30,0.25)'; g.lineWidth = 1;
      for (let z = top - 0.5; z > sb + 0.05; z -= 0.5) { const a = face(z, z)[0], b = face(z, z)[1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      g.fillStyle = R ? '#4f6a32' : '#62803c'; poly(g, face(top, Math.max(sb, top - 0.1))); g.fill();
    }
    // the earth beneath: a grass lip, brown soil in bands, and below it dark root-shot earth fading into the sky
    const st = Math.min(top, 0);
    if (bot < st - 0.001) {
      const Q = face(st, bot);
      if (toVoid) {
        const gy0 = Q[0][1], gy1 = Q[2][1] + 8;
        const gr = g.createLinearGradient(0, gy0, 0, gy1);
        gr.addColorStop(0, R ? '#5d3f2b' : '#7a5538'); gr.addColorStop(0.35, R ? '#4a3224' : '#5f412d'); gr.addColorStop(0.75, R ? '#2f2030' : '#3c2a36'); gr.addColorStop(1, 'rgba(30,20,40,0)');
        g.fillStyle = gr;
      } else g.fillStyle = R ? '#4a3224' : '#5f412d';
      if (c.h < 0) g.fillStyle = R ? '#3e3226' : '#4c3e2e';
      poly(g, Q); g.fill();
      // soil bands and pebbles
      g.strokeStyle = 'rgba(30,18,10,0.3)'; g.lineWidth = 1;
      for (let z = st - 0.32; z > bot + 0.25; z -= 0.38) { const a = face(z, z)[0], b = face(z + (R ? 0.04 : -0.04), 0)[1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      g.fillStyle = 'rgba(150,120,90,0.35)';
      for (const k of d.cracks) { if (k.l > 0.33) continue; const zz = st - 0.2 - k.v * Math.min(1, st - bot - 0.3); if (zz < bot + 0.15) continue; const p = R ? proj(x + 1, y + k.u, zz) : proj(x + k.u, y + 1, zz); g.beginPath(); g.ellipse(p[0], p[1], 2 * s, 1.3 * s, 0, 0, TAU); g.fill(); }
      // the grass lip, with a ragged fringe hanging over the soil
      if (top <= 0.01 && c.h >= 0) {
        const L = face(st, st - 0.13);
        g.fillStyle = R ? '#4d6a30' : '#5e7e38'; poly(g, L); g.fill();
        g.fillStyle = R ? '#4d6a30' : '#5e7e38';
        for (let k = 0; k < 6; k++) {
          const u = (k + 0.5) / 6, dz = 0.13 + 0.07 * Math.abs(Math.sin(k * 2.7 + x * 1.3 + y));
          const a = R ? proj(x + 1, y + u - 0.07, st - 0.12) : proj(x + u - 0.07, y + 1, st - 0.12), b = R ? proj(x + 1, y + u + 0.07, st - 0.12) : proj(x + u + 0.07, y + 1, st - 0.12), m = R ? proj(x + 1, y + u, st - dz) : proj(x + u, y + 1, st - dz);
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(m[0], m[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fill();
        }
      }
      // roots and mossy strands hanging from the underside of the island's rim
      if (toVoid && c.h >= 0) {
        g.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const cr = d.cracks[k + (R ? 0 : 2)], u = 0.2 + cr.u * 0.6, z0 = bot + (st - bot) * 0.45, len = 0.6 + cr.l * 2.2;
          const p0 = R ? proj(x + 1, y + u, z0) : proj(x + u, y + 1, z0);
          const sw = Math.sin(t * 0.8 + cr.a * 3) * 3 * s, L = len * TZ * s;
          const moss = cr.a > 3.5;
          g.strokeStyle = moss ? 'rgba(84,120,70,0.85)' : 'rgba(78,56,40,0.9)'; g.lineWidth = (moss ? 1.6 : 2.2) * s;
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.bezierCurveTo(p0[0] + 4 * s, p0[1] + L * 0.35, p0[0] - 4 * s + sw, p0[1] + L * 0.7, p0[0] + sw, p0[1] + L); g.stroke();
          if (moss) { g.fillStyle = 'rgba(110,150,90,0.8)'; for (const q of [0.45, 0.7, 0.92]) { g.beginPath(); g.ellipse(p0[0] + sw * q + (q > 0.6 ? -2 : 2) * s, p0[1] + L * q, 2.4 * s, 1.3 * s, q * 2, 0, TAU); g.fill(); } }
        }
      }
    }
  }
}

function topColor(c, d) {
  if (c.icy) return shade('#cdeefa', 0.92 + d.tone * 0.12);
  if (c.h < -0.01) return shade('#4a4536', 0.9 + d.tone * 0.2);
  if (c.h >= 1) return shade('#b3ad9c', 0.88 + d.tone * 0.2);
  return shade('#6f8a44', 0.85 + d.tone * 0.25);
}

function drawCell(g, c, t) {
  const d = World.deco[c.y * World.W + c.x];
  const x = c.x, y = c.y, s = cam.s;
  drawSideFaces(g, c, d, t);
  const z = c.h;
  const A = proj(x, y, z), B = proj(x + 1, y, z), C = proj(x + 1, y + 1, z), D = proj(x, y + 1, z);
  g.fillStyle = topColor(c, d); poly(g, [A, B, C, D]); g.fill();
  // rim light on back edges
  g.strokeStyle = 'rgba(255,240,210,0.13)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(D[0], D[1]); g.lineTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  g.strokeStyle = 'rgba(10,5,20,0.18)';
  g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]); g.stroke();
  if (c.h >= 1) { // stone cracks & moss
    g.strokeStyle = 'rgba(60,50,70,0.35)';
    for (const k of d.cracks.slice(0, 2)) { const p = proj(x + k.u, y + k.v, z), q = proj(x + clamp(k.u + Math.cos(k.a) * k.l, 0, 1), y + clamp(k.v + Math.sin(k.a) * k.l, 0, 1), z); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  }
  if (c.wet > 0) { g.fillStyle = `rgba(20,30,50,${c.wet * 0.25})`; poly(g, [A, B, C, D]); g.fill(); }
  if (c.ash > 0) {
    g.fillStyle = 'rgba(30,22,20,0.55)';
    for (const k of d.tufts) { const p = proj(x + k.u, y + k.v, z); g.beginPath(); g.ellipse(p[0], p[1], 9 * s, 4.5 * s, 0, 0, TAU); g.fill(); }
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
    g.fillStyle = `rgba(230,246,255,${0.6 * c.frost})`; poly(g, [A, B, C, D]); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.7 * c.frost})`; g.lineWidth = 1;
    for (const k of d.cracks) { const p = proj(x + k.u, y + k.v, z); const r = (2 + Math.sin(t * 3 + k.a * 5) * 1.5) * s; g.beginPath(); g.moveTo(p[0] - r, p[1]); g.lineTo(p[0] + r, p[1]); g.moveTo(p[0], p[1] - r); g.lineTo(p[0], p[1] + r); g.stroke(); }
  }
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
        prism(g, x + 0.06, y + 0.06, x + 0.94, y + 0.94, z, z + hh, 'rgba(225,248,255,0.85)', 'rgba(170,220,245,0.75)', 'rgba(130,190,230,0.75)', 'rgba(255,255,255,0.9)');
        const p = proj(x + 0.3, y + 0.94, z + hh * 0.7), q = proj(x + 0.7, y + 0.94, z + hh * 0.3);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
      }
      break;
    }
    case 'font': drawFont(g, c, t); break;
  }
}

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
      const zb = c.h - d.depth - 2.6, at = (u, zz) => side === 'R' ? proj(x + 1, y + u, zz) : proj(x + u, y + 1, zz);
      const Pf = [at(0, z), at(1, z), at(1, zb), at(0, zb)];
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
      const l0 = at(0, z - 0.04), l1 = at(1, z - 0.04);
      g.strokeStyle = 'rgba(245,252,255,0.9)'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(l0[0], l0[1]); g.lineTo(l1[0], l1[1]); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 6; k++) { const u = (k + 0.5) / 6, p = at(u, z - 0.1 - 0.06 * Math.abs(Math.sin(t * 4 + k * 2 + x))); g.beginPath(); g.arc(p[0], p[1], (1.5 + Math.abs(Math.sin(t * 3 + k)) * 1.2) * s, 0, TAU); g.fill(); }
      // mist rising where it vanishes
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) { const u = 0.2 + k * 0.3, ph = (t * 0.3 + k * 0.33 + d.tone) % 1, p = at(u, zb + 0.9 + ph * 0.6); g.globalAlpha = 0.18 * Math.sin(ph * Math.PI); const r = (22 + ph * 18) * s; g.drawImage(softSprite('#dceeff'), p[0] - r, p[1] - r * 0.6, r * 2, r * 1.2); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    } else { g.fillStyle = c.ice ? 'rgba(190,230,250,0.8)' : 'rgba(70,140,210,0.55)'; poly(g, P); g.fill(); }
    if (!c.ice && (!n || n.void) && Math.random() < 0.3) {
      const u = Math.random();
      const px = side === 'R' ? x + 1.02 : x + u, py = side === 'R' ? y + u : y + 1.02;
      emit({ x: px, y: py, z: z - 0.05, vx: side === 'R' ? 0.6 : 0, vy: side === 'L' ? 0.6 : 0, vz: -0.5, grav: 10, life: 1, size: 1.6 + Math.random(), color: Math.random() < .5 ? '#bfe6ff' : '#78b8ee', kind: 'drop' });
      if (Math.random() < 0.1) emit({ x: px, y: py, z: z - 1.2, vx: 0, vy: 0, vz: -0.3, life: 1.5, size: 10, color: '#cfe6ff', kind: 'smoke' });
    }
  }
  if (c.ice) {
    const gr = g.createLinearGradient(A[0], A[1], C[0], C[1]);
    gr.addColorStop(0, '#eaf8ff'); gr.addColorStop(1, '#a8d8f0');
    g.fillStyle = gr; poly(g, [A, B, C, D]); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
    for (const k of d.cracks) { const p = proj(x + k.u, y + k.v, z), q = proj(x + clamp(k.u + Math.cos(k.a) * k.l, 0, 1), y + clamp(k.v + Math.sin(k.a) * k.l, 0, 1), z); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
    const gl = (t * 0.35 + (x + y) * 0.12) % 1.6;
    if (gl < 1) { const p = proj(x + gl, y, z), q = proj(x, y + gl, z); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
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

function drawBramble(g, c, d, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  const bf = c.burn ? clamp(c.burnT, 0, 1) : 0;
  const hk = 1 - clamp((bf - 0.45) / 0.55, 0, 1);
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
  prism(g, x + 0.3, y + 0.3, x + 0.7, y + 0.7, z, z + 0.5, '#9a8fa8', '#6e6380', '#4e4560');
  prism(g, x + 0.22, y + 0.22, x + 0.78, y + 0.78, z, z + 0.08, '#8a7f98', '#5e5470', '#443c55');
  const P = proj(x + 0.5, y + 0.5, z + 0.62);
  g.fillStyle = '#3a2c3a'; g.beginPath(); g.ellipse(P[0], P[1] + 3 * s, 15 * s, 8 * s, 0, 0, Math.PI); g.fill();
  g.fillStyle = '#7a6a5a'; g.beginPath(); g.ellipse(P[0], P[1], 16 * s, 7 * s, 0, 0, TAU); g.fill();
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
  prism(g, x + 0.08, y + 0.08, x + 0.92, y + 0.92, z, z + hh, '#8c84a8', '#5c5280', '#443a66', 'rgba(255,255,255,0.12)');
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

function drawFont(g, c, t) {
  const x = c.x, y = c.y, z = c.h, s = cam.s;
  const P = proj(x + 0.5, y + 0.5, z);
  const rx = 0.42 * TW * 0.7071 * s * 1.25, ry = rx * 0.5;
  // a gilded ring set into the ground around a well of light
  g.fillStyle = '#5a3f1c'; g.beginPath(); g.ellipse(P[0], P[1] + 3 * s, rx * 1.06, ry * 1.06, 0, 0, TAU); g.fill();
  const rim = g.createLinearGradient(P[0] - rx, P[1] - ry, P[0] + rx, P[1] + ry);
  rim.addColorStop(0, '#fff1c2'); rim.addColorStop(0.45, '#e2b45e'); rim.addColorStop(1, '#93621f');
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
    prism(g, b.x - r, b.y - r, b.x + r, b.y + r, b.z, b.z + b.hgt, '#bcb2cc', '#857a98', '#665c7a', 'rgba(255,255,255,0.25)');
    const P = proj(b.x, b.y, b.z + b.hgt);
    g.strokeStyle = `rgba(205,176,255,${0.5 + 0.3 * Math.sin(t * 3)})`; g.lineWidth = 1.2 * s;
    g.beginPath(); g.ellipse(P[0], P[1], 13 * s, 6.5 * s, 0, 0, TAU); g.stroke();
    return;
  }
  if (b.kind === 'orb') {
    const [cx, cy] = proj(b.x, b.y, b.z + b.r);
    const r = b.r * TW * 0.78 * s;
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.6 + (b.captured ? 0.4 : 0); g.drawImage(glowSprite('#ffc860'), cx - r * 3, cy - r * 3, r * 6, r * 6); g.restore();
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
  g.strokeStyle = sp.color; g.shadowColor = sp.color; g.shadowBlur = 12;
  g.lineWidth = 2 * lw; g.beginPath(); g.arc(0, 0, 1.0, 0, TAU * Math.min(1, prog * 1.5)); g.stroke();
  g.lineWidth = 1 * lw; g.beginPath(); g.arc(0, 0, 1.16, 0, TAU); g.stroke();
  g.fillStyle = hexA(sp.color, 0.9); g.shadowBlur = 0;
  g.save(); g.scale(1 / 100, 1 / 100); textOnCircle(g, SIGILS[sp.sigil].words, 0, 0, 108, -rot * 2, 9); g.restore();
  g.shadowBlur = 10;
  // the caster's own strokes
  for (const st of sp.art) {
    const n = Math.max(2, Math.floor(st.pts.length * clamp(prog * 1.4, 0, 1)));
    g.beginPath();
    for (let i = 0; i < n; i++) { const p = st.pts[i]; i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
    g.lineWidth = 2.2 * lw; g.stroke();
  }
  g.restore();
}

function render(g, w, h, t, overlay) {
  drawSky(g, w, h, t);
  if (!World.W) return;
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
  for (const it of items) {
    if (it.c) drawCell(g, it.c, t);
    else drawBody(g, it.b, t);
  }
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
  }
  for (const c of World.cells) {
    if (c.feat === 'brazier' && c.lit) { const [cx, cy] = proj(c.x + .5, c.y + .5, c.h + .9), r = (110 + Math.sin(t * 13 + c.x) * 6) * s; g.globalAlpha = 0.3; g.drawImage(glowSprite('#ff8a3a'), cx - r, cy - r * 0.7, r * 2, r * 1.4); }
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
  // vignette
  g.drawImage(vignette(w, h), 0, 0, w, h);
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
