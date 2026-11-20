/* Old Light: battle engine. Deterministic, seeded, no DOM.
 * UMD: window.OL_ENGINE in the browser (needs OL_DATA first), require('./engine.js') in node.
 *
 * w = create(scenario, seed); step(w, seconds) advances on a fixed 1 s tick (sub-steps near interactions).
 * Ships are flown by their helm/gunnery computers (ai.js), attached as w.control, which read only view(w, side).
 * Truth lives in w.ships / w.missiles / w.drones / w.slugs; each side's picture is w.sides[side].tl, built from
 * light-lagged, noisy observations. Motion is 3D, but z is a small hidden axis used only for dodging and hits:
 * orders, the plot and planets are 2D.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.OL_ENGINE = factory(root.OL_DATA);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var N = D.NUM, G = N.G, C = N.C, HULLS = D.HULLS, MODS = D.MODS, DR = D.DRONES, PI = Math.PI;
  var BUCKETS = [1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6];
  var SIDES = ['A', 'B'], DTYPES = ['picket', 'lancer', 'striker', 'interceptor', 'decoy'];
  var HW = 11; // history stride: t x y z vx vy vz ax ay az burn

  // ---------------------------------------------------------------- rng (mulberry32) and maths
  function rndS(o, k) {
    var t = (o[k] = (o[k] + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rnd(w) { return rndS(w, 'rng'); }
  function arand(w) { return rndS(w, 'arng'); }   // the AI's own stream, so AI choices never shift physics draws
  function gauss(w) { var u = rnd(w) || 1e-12, v = rnd(w); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v); }
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  // a turn of exactly half a circle always goes the positive way: which way the sign fell used to depend on the
  // start heading, so a ship facing +x and one facing -x turned opposite ways to brake (a fixed-axis bias)
  function angDiff(a, b) { var d = (b - a) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; if (Math.abs(d) > PI - 1e-9) d = PI; return d; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function hyp3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  function sqr(x) { return x * x; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function bucket(r) { for (var i = 0; i < BUCKETS.length; i++) if (r < BUCKETS[i]) return i; return BUCKETS.length; }
  function enemyOf(side) { return side === 'A' ? 'B' : 'A'; }
  // unit vectors across a line of fire d (unit): lat is in the plane, up is as near +z as possible
  function basis(dx, dy, dz) {
    var lx = -dy, ly = dx, l = hyp(lx, ly) || 1; lx /= l; ly /= l;
    var ux = -dz * dx, uy = -dz * dy, uz = 1 - dz * dz, u = hyp3(ux, uy, uz) || 1;
    return { lx: lx, ly: ly, ux: ux / u, uy: uy / u, uz: uz / u };
  }

  // ---------------------------------------------------------------- history ring (light lag)
  function newHist() { return { buf: new Float64Array(N.hist * HW), n: 0, head: 0 }; }
  function pushHist(w, o) {
    var h = o.hist, i = h.head * HW, b = h.buf;
    b[i] = w.t; b[i + 1] = o.x; b[i + 2] = o.y; b[i + 3] = o.z; b[i + 4] = o.vx; b[i + 5] = o.vy; b[i + 6] = o.vz;
    b[i + 7] = o.ax; b[i + 8] = o.ay; b[i + 9] = o.az; b[i + 10] = o.burnT > 0 ? 1 : 0;
    h.head = (h.head + 1) % N.hist; if (h.n < N.hist) h.n++;
  }
  // state at time tq: from the oldest sample taken at or after tq, run back with that tick's acceleration (exact)
  var HS = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, burn: 0 };
  function histAt(o, tq) {
    var h = o.hist, b = h.buf, best = -1;
    for (var k = 0; k < h.n; k++) {
      var i = (((h.head - 1 - k) % N.hist) + N.hist) % N.hist * HW;
      best = i; if (b[i] <= tq + 1e-9) break;
    }
    if (best < 0) { HS.x = o.x; HS.y = o.y; HS.z = o.z; HS.vx = o.vx; HS.vy = o.vy; HS.vz = o.vz; HS.ax = o.ax; HS.ay = o.ay; HS.az = o.az; HS.burn = o.burnT > 0 ? 1 : 0; return HS; }
    var dt = tq - b[best];
    HS.ax = b[best + 7]; HS.ay = b[best + 8]; HS.az = b[best + 9]; HS.burn = b[best + 10];
    HS.x = b[best + 1] + b[best + 4] * dt + 0.5 * HS.ax * dt * dt;
    HS.y = b[best + 2] + b[best + 5] * dt + 0.5 * HS.ay * dt * dt;
    HS.z = b[best + 3] + b[best + 6] * dt + 0.5 * HS.az * dt * dt;
    HS.vx = b[best + 4] + HS.ax * dt; HS.vy = b[best + 5] + HS.ay * dt; HS.vz = b[best + 6] + HS.az * dt;
    return HS;
  }

  // ---------------------------------------------------------------- building ships
  function sysMod(id, name) { return { id: id, key: id, kind: 'sys', name: name, state: 0, dc: 0 }; }
  function makeShip(w, spec) {
    var L = typeof spec.load === 'string' ? D.LOADOUTS[spec.load] : spec.load, H = HULLS[L.hull];
    var s = { id: 's' + (w.nid++), kind: 'ship', side: spec.side, name: spec.name || L.name, load: typeof spec.load === 'string' ? spec.load : 'custom', hull: L.hull, H: H,
      x: spec.x, y: spec.y, z: spec.z || 0, vx: spec.vx || 0, vy: spec.vy || 0, vz: spec.vz || 0, ax: 0, ay: 0, az: 0, px: spec.x, py: spec.y, pz: spec.z || 0,
      heading: (spec.h || 0) * PI / 180, omega: H.turn * PI / 180, F: (H.fit || H.mass) * H.g * G * N.driveMul, r: H.r,
      mods: [], tiers: { sensors: L.sensors || 1, helm: L.helm || 1, gunnery: L.gunnery || 1 }, autonomy: L.autonomy || 1, has: {},
      orders: { man: { type: 'coast' }, gLimit: 'combat', evasion: 'off', radiators: 'auto' },
      ctl: { ax: 0, ay: 0, az: 0, point: null }, status: 'ok', burnT: 0, gNow: 0, gSum: 0, gN: 0, gTick: 0, gPeak: 0, strain: 0, crisis: false, eff: 1, heat: 0,
      radOut: false, lasAcc: 0, capT: 0, ward: 100, wardDown: false, lastHit: -1e9, lasered: -1e9, dvUsed: 0, lastT: w.t,
      stock: {}, wing: {}, hist: newHist() };
    DTYPES.forEach(function (t) { s.stock[t] = (L.drones && L.drones[t]) || 0; s.wing[t] = { mode: DR[t].mode, target: null, point: null }; });
    var dry = H.mass, slots = L.mods || {};
    Object.keys(slots).forEach(function (slot) {
      slots[slot].forEach(function (key, i) {
        var d = MODS[key]; if (!d) throw new Error('unknown module ' + key);
        var m = { id: slot + i, key: key, def: d, kind: d.kind, slot: slot, name: d.name, state: 0, dc: 0, cd: 0, q: [], target: null, pending: null, burst: null, firing: 0, service: [] };
        if (d.ammo) m.ammo = d.ammo;
        if (d.load) m.load = d.load;
        if (d.charges) m.charges = d.charges;
        dry += d.mass; s.mods.push(m);
        if (d.kind === 'int') s.has[key] = m;
      });
    });
    var A = L.armour || { type: 'composite', nose: 0, flank: 0, tail: 0 };
    var TF = N.tough;   // toughness: tough x the listed armour and hull points (the armour's mass is from the listed points)
    s.ar = { type: A.type, nose: A.nose * TF, flank: A.flank * TF, tail: A.tail * TF }; s.ar0 = { nose: A.nose * TF, flank: A.flank * TF, tail: A.tail * TF };
    dry += (A.nose + A.flank + A.tail) * H.arMass;
    s.nRad = L.radiators || 1; s.nTanks = L.tanks || 1;
    dry += s.nRad * N.radMass + s.nTanks * N.tankMass;
    ['sensors', 'helm', 'gunnery'].forEach(function (k) { dry += D.TIERS[k][s.tiers[k]] || 0; });
    dry += L.cargo || 0;   // a loaded hold (t): the ship accelerates, and so dodges, worse
    s.dryBase = dry;
    s.fuel = s.fuel0 = spec.fuel != null ? spec.fuel : s.nTanks * N.tankCap;
    s.sys = { drive: sysMod('drive', 'Drive'), reactor: sysMod('reactor', 'Reactor'), sensors: sysMod('sensors', 'Sensors'), radiators: sysMod('radiators', 'Radiators'), quarters: sysMod('quarters', 'Crew quarters'), tanks: sysMod('tanks', 'Fuel tanks') };
    s.hp = s.hpMax = H.hp * TF;
    s.crew = s.crew0 = H.crew;
    s.need = H.crew * (s.has.automation ? N.autoNeed : 1);
    crewShip(w, s, spec);
    if (spec.orders) Object.keys(spec.orders).forEach(function (k) { s.orders[k] = spec.orders[k]; });
    s.mass0 = mass(s);
    return s;
  }
  function mass(s) {
    var m = s.dryBase + s.fuel;
    for (var i = 0; i < s.mods.length; i++) {
      var d = s.mods[i];
      if (d.kind === 'rack') m += d.load * N.mMass;
      else if (d.kind === 'bay') for (var j = 0; j < d.service.length; j++) m += DR[d.service[j].type].mass;
    }
    for (i = 0; i < DTYPES.length; i++) m += s.stock[DTYPES[i]] * DR[DTYPES[i]].mass;
    return m;
  }
  function dvLeft(s) { var m = mass(s); return N.ve * Math.log(m / (m - s.fuel)); }
  function thrustAvail(s) {
    var d = s.sys.drive.state; if (d === 2 || s.status === 'destroyed' || s.status === 'captured' || s.status === 'disabled') return 0;
    var f = s.F * (d === 1 ? 0.5 : 1);
    if (s.sys.reactor.state === 2) f *= 0.5;
    if (s.heat > 100) f *= 0.5;
    return f;
  }
  function gCap(s) { return N.gCap[s.orders.gLimit] || 4; }
  function accLimit(s) { return Math.min(thrustAvail(s) / mass(s), gCap(s) * G); }
  function maxAcc(s) { return thrustAvail(s) / mass(s); }
  function alive(o) { return o.kind === 'ship' ? o.status !== 'destroyed' && o.status !== 'captured' : o.alive && !o.docked; }
  function active(s) { return s.status === 'ok' || s.status === 'crippled'; }

  // ---------------------------------------------------------------- create
  function create(scn, seed) {
    if (typeof scn === 'string') scn = D.SCENARIOS[scn];
    scn = clone(scn);
    var w = { t: 0, acc: 0, nTick: 0, seed: seed >>> 0, rng: (seed >>> 0) ^ 0x9E3779B9, arng: ((seed >>> 0) * 2654435761) | 0, nid: 1,
      scn: scn, ships: [], missiles: [], drones: [], slugs: [], beams: [], clouds: [], idx: {},
      planets: (scn.planets || []).map(function (p) { return { name: p.name, x: p.x, y: p.y, r: p.r, quiet: p.quiet || 0 }; }),
      sides: {}, ev: [], log: [], over: false, winner: null, endReason: null, control: null, sub: 1,
      stats: { by: {}, crewLost: { A: 0, B: 0 }, pdKills: { A: 0, B: 0 }, flakKills: { A: 0, B: 0 }, droneFlakKills: { A: 0, B: 0 }, launched: { A: 0, B: 0 },
        dronesLaunched: { A: 0, B: 0 }, droneLost: { A: {}, B: {} }, dronesDocked: { A: 0, B: 0 }, dmgBy: { A: {}, B: {} }, gone: { A: {}, B: {} },
        dodge: { A: { dv: 0, strain: 0, held: 0, sec: 0 }, B: { dv: 0, strain: 0, held: 0, sec: 0 } }, cal: {},
        bandT: { A: { cruise: 0, combat: 0, brace: 0, crash: 0 }, B: { cruise: 0, combat: 0, brace: 0, crash: 0 } }, bandC: { A: { cruise: 0, combat: 0, brace: 0, crash: 0 }, B: { cruise: 0, combat: 0, brace: 0, crash: 0 } } }, calM: [] };
    SIDES.forEach(function (S) { w.sides[S] = { tracks: {}, tl: [], next: 1, threats: {}, doctrine: (scn.sides && scn.sides[S] && scn.sides[S].doctrine) || 'auto', newMissiles: 0 }; });
    // each ship's slot within its side and its faction seed its generated crew
    var slots = { A: 0, B: 0 };
    scn.ships.forEach(function (sp) {
      if (sp.slot == null) sp.slot = slots[sp.side] = (slots[sp.side] || 0) + 1;
      if (!sp.faction) sp.faction = (scn.sides && scn.sides[sp.side] && scn.sides[sp.side].faction) || 'arbitration';
      w.ships.push(makeShip(w, sp));
    });
    w.intel = {};
    SIDES.forEach(function (S) { var x = 0, y = 0, n = 0; scn.ships.forEach(function (sp) { if (sp.side !== S) { x += sp.x; y += sp.y; n++; } }); w.intel[S] = n ? { x: x / n, y: y / n } : null; });
    // a scenario can say where a side believes the other to be (scn.intel[side]: { x, y }): an ambush starts unknown
    if (scn.intel) Object.keys(scn.intel).forEach(function (S) { w.intel[S] = scn.intel[S]; });
    reindex(w);
    w.ships.forEach(function (s) { pushHist(w, s); });
    sense(w, 0);
    return w;
  }
  function reindex(w) {
    var I = w.idx = {};
    w.ships.forEach(function (s) { I[s.id] = s; });
    w.drones.forEach(function (d) { I[d.id] = d; });
    w.missiles.forEach(function (m) { I[m.id] = m; });
  }
  function stat(w, k) { var b = w.stats.by[k]; if (!b) b = w.stats.by[k] = { fired: 0, hits: 0, pts: 0, rng: [0, 0, 0, 0, 0, 0, 0, 0], rsum: 0, mods: 0, modsDead: 0 }; return b; }
  function emit(w, e) { e.t = w.t; w.ev.push(e); w.log.push(e); if (w.log.length > 600) w.log.splice(0, 100); }
  function byId(w, id) { return w.idx[id] || null; }
  function modOf(s, id) { if (typeof id === 'number') return s.mods[id]; for (var i = 0; i < s.mods.length; i++) if (s.mods[i].id === id) return s.mods[i]; return null; }
  function trackOf(w, side, cid) { var tl = w.sides[side].tl; for (var i = 0; i < tl.length; i++) if (tl[i].id === cid) return tl[i]; return null; }

  // ---------------------------------------------------------------- the step loop
  function step(w, dt) {
    w.acc += dt;
    while (w.acc >= N.tick - 1e-9 && !w.over) { w.acc -= N.tick; tick(w); }
    if (w.over) w.acc = 0;
  }
  function needSub(w) {
    for (var i = 0; i < w.missiles.length; i++) if (w.missiles[i].phase === 'term') return true;
    for (i = 0; i < w.drones.length; i++) if (w.drones[i].near) return true;
    for (i = 0; i < w.ships.length; i++) {
      var a = w.ships[i]; if (a.status === 'destroyed') continue;
      for (var j = i + 1; j < w.ships.length; j++) { var b = w.ships[j]; if (b.side !== a.side && Math.abs(a.x - b.x) < 200 && Math.abs(a.y - b.y) < 200) return true; }
    }
    return false;
  }
  function tick(w) {
    if (w.control) w.control(w);
    reindex(w);
    w.ships.forEach(function (s) { s.burnT = 0; s.gSum = 0; s.gN = 0; });
    w.drones.forEach(function (d) { d.burnT = 0; });
    w.missiles.forEach(function (m) { m.burnT = 0; });
    var n = needSub(w) ? N.sub : 1, h = N.tick / n; w.sub = n;
    for (var k = 0; k < n; k++) substep(w, h);
    slowTick(w, N.tick);
    w.nTick++;
  }
  function substep(w, h) {
    var i;
    for (i = 0; i < w.ships.length; i++) shipMove(w, w.ships[i], h);
    for (i = 0; i < w.drones.length; i++) droneMove(w, w.drones[i], h);
    for (i = w.missiles.length - 1; i >= 0; i--) missileMove(w, w.missiles[i], h);
    w.t += h;
    slugsMove(w, h);
    beams(w);
    pointDefence(w, h);
    weapons(w, h);
    for (i = w.missiles.length - 1; i >= 0; i--) if (!w.missiles[i].alive) w.missiles.splice(i, 1);
    for (i = w.drones.length - 1; i >= 0; i--) if (!w.drones[i].alive) w.drones.splice(i, 1);
  }

  // ---------------------------------------------------------------- ship motion
  // ctl.ax/ay: wanted in-plane acceleration (thrust only along the axis, after turning); ctl.az: hidden-axis
  // acceleration (the ship pitches for it; it shares the G limit); ctl.point: heading to hold (spinal aim).
  function shipMove(w, s, h) {
    s.px = s.x; s.py = s.y; s.pz = s.z;
    var c = s.ctl, a = 0, az = 0;
    if (s.status !== 'destroyed' && s.status !== 'captured' && s.status !== 'disabled') {
      var amag = hyp(c.ax, c.ay);
      var want = c.point != null ? c.point : (amag > 1e-7 ? Math.atan2(c.ay, c.ax) : s.heading);
      var d = angDiff(s.heading, want), turn = s.omega * h * stE(s, 'helm');
      s.heading += Math.abs(d) <= turn ? d : (d > 0 ? turn : -turn);
      if (s.fuel > 0) {
        var lim = accLimit(s);
        if (amag > 1e-9) { var off = Math.abs(angDiff(s.heading, Math.atan2(c.ay, c.ax))); if (off < N.thrustCone) a = Math.min(amag * Math.cos(off), lim); }
        if (c.az) { var zl = Math.sqrt(Math.max(0, lim * lim - a * a)); az = Math.max(-zl, Math.min(zl, c.az)); }
      }
    }
    s.ax = Math.cos(s.heading) * a; s.ay = Math.sin(s.heading) * a; s.az = az;
    var at = Math.sqrt(a * a + az * az);
    if (at > 0) {
      // the helm's abilities: a light touch on the dodge burns, a long burn on the rest
      var aj = c.ev && c.ev !== 'off' ? Math.min(c.jm || 0, at) : 0, ab = s.ab || {};
      var af = aj * (ab.lightTouch ? ab.lightTouch.jinkDv : 1) + (at - aj) * (ab.longBurn ? ab.longBurn.burnDv : 1);
      s.fuel = Math.max(0, s.fuel - mass(s) * af * h / N.ve); s.burnT += h; s.dvUsed += at * h;
    }
    if (c.evWhy === 'slug' && c.ev && c.ev !== 'off') { var dg = w.stats.dodge[s.side]; dg.dv += Math.min(c.jm || 0, at) * h; dg.sec += h; }
    s.x += s.vx * h + 0.5 * s.ax * h * h; s.y += s.vy * h + 0.5 * s.ay * h * h; s.z += s.vz * h + 0.5 * az * h * h;
    s.vx += s.ax * h; s.vy += s.ay * h; s.vz += az * h;
    s.gNow = at / G; s.gSum += s.gNow * h; s.gN += h;
  }

  // ---------------------------------------------------------------- missiles (rack missiles and striker payloads)
  function spawnMissile(w, side, from, x, y, z, vx, vy, vz, spec) {
    var m = { id: 'm' + (w.nid++), kind: 'missile', side: side, from: from, x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, ax: 0, ay: 0, az: 0, px: x, py: y, pz: z,
      acc: spec.acc, dv: spec.dv, dv0: spec.dv, boost: spec.boost || 0, dir: spec.dir || null, phase: spec.phase, hp: spec.hp, alive: true, tgt: spec.tgt, seek: spec.seek || null,
      warhead: spec.warhead, pen: spec.pen, penKg: spec.penKg, fan: spec.fan, wk: spec.wk, life: spec.life, born: w.t, nextCorr: w.t + N.mCorrEvery, corr: null,
      jx: 0, jy: 0, jz: 0, jt: 0, r: 0.005, burnT: 0, lastT: w.t, hist: newHist(), lr: spec.lr, hitAny: false, light: !!spec.light, keep: spec.keep != null ? spec.keep : N.mKeep, slot: 0 };
    // missiles from one ship are numbered in turn: in a salvo each one aims at its own point of a ring round the
    // target (slot 0 at the middle), so together they cover a late break the seeker cannot follow
    if (!spec.light && w.idx[from]) { var fs = w.idx[from]; m.slot = (fs.mSlot = ((fs.mSlot || 0) + 1)) % N.mFanN; }
    pushHist(w, m);
    w.missiles.push(m); w.idx[m.id] = m;
    stat(w, m.wk).fired++;
    return m;
  }
  function launchMissile(w, s, rack, tgtCid) {
    var tr = trackOf(w, s.side, tgtCid); if (!tr) return null;
    var sol = solve(w, s, tr, N.mBoostDv);
    var dir = sol ? { x: sol.dx, y: sol.dy, z: sol.dz } : (function () { var dx = tr.ex - s.x, dy = tr.ey - s.y, l = hyp(dx, dy) || 1; return { x: dx / l, y: dy / l, z: 0 }; })();
    var nuke = rack.def.warhead === 'nuke';
    w.stats.launched[s.side]++;
    var me = hitEstimate(w, s, rack.id != null ? rack.id : s.mods.indexOf(rack), tgtCid, {});
    var mm = spawnMissile(w, s.side, s.id, s.x, s.y, s.z, s.vx, s.vy, s.vz, { acc: N.mAcc * G, dv: N.mDv, boost: N.mBoostDv, dir: dir, phase: 'boost', hp: N.mHp, tgt: tgtCid,
      warhead: rack.def.warhead, pen: N.mPen, penKg: N.mPenKg, fan: N.mFan, wk: nuke ? 'nuke' : 'missile', life: N.mMaxLife, lr: hyp(tr.ex - s.x, tr.ey - s.y) });
    if (mm && me && me.ok) { mm.est = me.chance; w.calM.push(mm); }
    return mm;
  }
  function missileMove(w, m, h) {
    m.px = m.x; m.py = m.y; m.pz = m.z;
    var aMax = m.acc, ax = 0, ay = 0, az = 0;
    if (m.phase === 'boost') {
      ax = m.dir.x * aMax; ay = m.dir.y * aMax; az = m.dir.z * aMax; m.boost -= aMax * h;
      if (m.boost <= 0) m.phase = 'coast';
    } else if (m.phase === 'coast') {
      if (m.corr) { var cl = Math.min(aMax, m.corr.left / h); ax = m.corr.x * cl; ay = m.corr.y * cl; az = m.corr.z * cl; m.corr.left -= cl * h; if (m.corr.left <= 1e-6) m.corr = null; }
    } else if (m.phase === 'term') {
      var T = m.seek;
      if (!T || !alive(T)) T = m.seek = seekPick(w, m, m.x + m.vx * 10, m.y + m.vy * 10);
      if (T) {
        // the target has already moved this sub-step: guide on where it was at the missile's own time
        var rx = T.px - m.x, ry = T.py - m.y, rz = T.pz - m.z, vx = T.vx - m.vx, vy = T.vy - m.vy, vz = T.vz - m.vz, r = hyp3(rx, ry, rz);
        var vc = -(rx * vx + ry * vy + rz * vz) / r, tgo = r / Math.max(vc, 0.5);
        // zero-effort miss across the line of sight, flown out by proportional navigation
        // the seeker reads bearing and bearing rate, not the target's thrust: a burn it has to see happen first
        var zx = rx + vx * tgo, zy = ry + vy * tgo, zz = rz + vz * tgo;
        var ux = rx / r, uy = ry / r, uz = rz / r, zl = zx * ux + zy * uy + zz * uz; zx -= ux * zl; zy -= uy * zl; zz -= uz * zl;
        if (m.slot && N.mRing > 0) {
          // its point on the salvo ring, in the frame of the line of sight
          var LB = basis(ux, uy, uz), ra = 2 * PI * (m.slot - 1) / (N.mFanN - 1), ro = T.kind === 'ship' ? N.mRing * Math.min(1, maxAcc(T) / (N.gCap.brace * G)) : 0;
          zx -= (LB.lx * Math.cos(ra) + LB.ux * Math.sin(ra)) * ro; zy -= (LB.ly * Math.cos(ra) + LB.uy * Math.sin(ra)) * ro; zz -= LB.uz * Math.sin(ra) * ro;
        }
        var k = N.mPN / (tgo * tgo); ax = zx * k; ay = zy * k; az = zz * k;
        if (w.t >= m.jt) { var jm = N.mJink * aMax * rnd(w), ja = rnd(w) * 2 * PI, je = (rnd(w) * 2 - 1), jc = Math.sqrt(1 - je * je); m.jx = Math.cos(ja) * jm * jc; m.jy = Math.sin(ja) * jm * jc; m.jz = je * jm; m.jt = w.t + 1 + rnd(w); }
        // jink only in the last stretch (inside the defences), and never into the dv the final corrections need
        if (tgo > 4 && tgo < N.mTermT && m.dv > m.dv0 * 0.15) { ax += m.jx; ay += m.jy; az += m.jz; }
        var al = hyp3(ax, ay, az); if (al > aMax) { ax *= aMax / al; ay *= aMax / al; az *= aMax / al; al = aMax; }
        if (m.dv > m.dv0 * m.keep && tgo > 3) { var sp = Math.sqrt(Math.max(0, aMax * aMax - al * al)); ax += ux * sp; ay += uy * sp; az += uz * sp; }
        if (m.warhead === 'nuke') {
          // a nuke goes off at closest approach: inside this sub-step, move to that point first
          if (tgo <= h * 1.5 || r < N.nukeR) { var tc = Math.min(Math.max(tgo, 0), h); m.x += m.vx * tc; m.y += m.vy * tc; m.z += m.vz * tc; warheadGo(w, m, T, tgo); return; }
        } else if (tgo < N.mSplitT || r < 0.3) { warheadGo(w, m, T, tgo); return; }
      }
    }
    var a = hyp3(ax, ay, az);
    if (a * h > m.dv) { var f = m.dv / (a * h); ax *= f; ay *= f; az *= f; a *= f; }
    m.dv -= a * h; if (a > 0) m.burnT += h;
    m.ax = ax; m.ay = ay; m.az = az;
    m.x += m.vx * h + 0.5 * ax * h * h; m.y += m.vy * h + 0.5 * ay * h * h; m.z += m.vz * h + 0.5 * az * h * h;
    m.vx += ax * h; m.vy += ay * h; m.vz += az * h;
    if (w.t - m.born > m.life) killSmall(w, m, 'life');
    else if (w.planets.length && blocked(w, m.px, m.py, m.x, m.y)) killSmall(w, m, 'planet');
  }
  // the seeker locks on the true object nearest where it was told to look (a decoy can take it)
  function seekPick(w, m, px, py) {
    var best = null, bd = 2e4;
    w.ships.forEach(function (s) { if (s.side !== m.side && alive(s)) { var d = hyp(s.x - px, s.y - py); if (d < bd) { bd = d; best = s; } } });
    w.drones.forEach(function (s) { if (s.side !== m.side && alive(s) && (s.type === 'decoy' || bd > 5000)) { var d = hyp(s.x - px, s.y - py) * (s.type === 'decoy' ? 1 : 3); if (d < bd) { bd = d; best = s; } } });
    return best;
  }
  function warheadGo(w, m, T, tgo) {
    m.alive = false; goneStat(w, m, 'warhead');
    if (m.warhead === 'nuke') {
      w.ships.forEach(function (s) {
        if (s.side === m.side || s.status === 'destroyed') return;
        var d = hyp3(s.x - m.x, s.y - m.y, s.z - m.z); if (d > 40) return;
        var pts = N.nukePts * Math.min(1, sqr(N.nukeR / Math.max(d, 0.01)));
        var rad = pts * N.nukeRad * (s.has.magscreen && s.has.magscreen.state < 2 ? N.magNuke : 1);
        if (!m.hitAny) { m.hitAny = true; stat(w, 'nuke').hits++; }
        var tk = damage(w, s, pts * (1 - N.nukeRad), 'nuke', facing(s, m.x - s.x, m.y - s.y), 'nuke') + (s.status !== 'destroyed' ? rad : 0);
        m.pts = (m.pts || 0) + tk; hitRecord(w, 'nuke', m.lr, tk, m.side);
        if (s.status !== 'destroyed') { kill(w, s, rad * N.crewPerPt * s.crew0 * 2); updStatus(w, s); }
      });
      w.drones.forEach(function (d) { if (d.side !== m.side && d.alive && hyp3(d.x - m.x, d.y - m.y, d.z - m.z) < 10) killSmall(w, d, 'nuke', m.from); });
      misLog(w, m, m.hitAny ? 'hit' : 'miss');
      return;
    }
    // kinetic bus: penetrators in a grid across the relative velocity (a disc, in 3D)
    var rvx = m.vx - T.vx, rvy = m.vy - T.vy, rvz = m.vz - T.vz, rl = hyp3(rvx, rvy, rvz) || 1, B = basis(rvx / rl, rvy / rl, rvz / rl);
    var n = m.pen; m.penLeft = n; var nl = Math.ceil(Math.sqrt(n)), nu = Math.ceil(n / nl), t = Math.max(tgo, 0.2), k = 0;
    // the pattern is spaced to the target's size (1.6 radii), never wider than the fan
    var sp = Math.min(1.6 * (T.r || 0.05), 2 * m.fan / Math.max(nl - 1, 1));
    for (var i = 0; i < nl && k < n; i++) for (var j = 0; j < nu && k < n; j++, k++) {
      var ol = (i - (nl - 1) / 2) * sp / t, ou = (j - (nu - 1) / 2) * sp / t;
      addSlug(w, { kind: 'pen', wk: m.wk, side: m.side, src: m.from, x: m.x, y: m.y, z: m.z,
        vx: m.vx + B.lx * ol + B.ux * ou, vy: m.vy + B.ly * ol + B.uy * ou, vz: m.vz + B.uz * ou, kg: m.penKg, tgt: T.id, lr: m.lr, mis: m });
    }
  }

  // ---------------------------------------------------------------- drones
  function launchDrone(w, s, type) {
    var def = DR[type], wo = s.wing[type];
    var d = { id: 'd' + (w.nid++), kind: 'drone', type: type, def: def, side: s.side, mother: s.id, name: def.name || type,
      x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, ax: 0, ay: 0, az: 0, px: s.x, py: s.y, pz: s.z,
      acc: def.acc * G, dv: def.dv, dv0: def.dv, dvUse: s.ab && s.ab.thriftyWings ? s.ab.thriftyWings.wingDv : 1, hp: def.hp, alive: true, docked: false, aut: s.autonomy,
      mode: wo.mode, tgt: wo.target, point: wo.point, inbox: [], payload: def.payload ? def.n : 0, ammo: def.flak ? def.flak.ammo : 0,
      sx: s.x, sy: s.y, svx: s.vx, svy: s.vy, vmax: 10, spoof: def.decoy ? s.hull : null, revealed: false, r: 0.012, burnT: 0, lastT: w.t,
      hist: newHist(), side2: rnd(w) < 0.5 ? 1 : -1, jx: 0, jy: 0, jz: 0, jt: 0, evade: false, near: false, lasered: -1e9, hunt: null };
    pushHist(w, d);
    w.drones.push(d); w.idx[d.id] = d;
    w.stats.dronesLaunched[s.side]++;
    return d;
  }
  // a wing order reaches each drone when the carrier's light does
  function wingOrder(w, s, type, o) {
    var wo = s.wing[type]; wo.mode = o.mode; wo.target = o.target || null; wo.point = o.point || null;
    w.drones.forEach(function (d) {
      if (d.mother !== s.id || d.type !== type || !d.alive) return;
      d.inbox.push({ at: w.t + hyp(d.x - s.x, d.y - s.y) / C * (s.ab && s.ab.longLeash ? s.ab.longLeash.lag : 1), mode: wo.mode, target: wo.target, point: wo.point });
    });
  }
  function enemyCentre(w, side, fx, fy) {
    var tl = w.sides[side].tl, ex = 0, ey = 0, n = 0;
    for (var i = 0; i < tl.length; i++) if (tl[i].kind === 'ship') { ex += tl[i].ex; ey += tl[i].ey; n++; }
    // no ship track yet: face where the enemy was at the start (never a fixed axis, or the side whose enemy lies that way is favoured)
    if (!n) { var I = w.intel && w.intel[side], il = I ? hyp(I.x - fx, I.y - fy) : 0; return il > 1 ? { ux: (I.x - fx) / il, uy: (I.y - fy) / il, d: 1e9 } : { ux: 1, uy: 0, d: 1e9 }; }
    ex /= n; ey /= n; var l = hyp(ex - fx, ey - fy) || 1;
    return { ux: (ex - fx) / l, uy: (ey - fy) / l, d: l, x: ex, y: ey };
  }
  function nearestTrack(w, side, x, y, range, pred) {
    var tl = w.sides[side].tl, best = null, bd = range;
    for (var i = 0; i < tl.length; i++) { var c = tl[i]; if (!c.firm || !pred(c)) continue; var d = hyp(c.ex - x, c.ey - y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  // read orders that have arrived, decide alone where autonomy allows, pick a station to fly to
  function droneThink(w, d) {
    for (var i = d.inbox.length - 1; i >= 0; i--) { var o = d.inbox[i]; if (o.at <= w.t) { d.mode = o.mode; d.tgt = o.target; d.point = o.point; d.inbox.splice(i, 1); } }
    var M = w.idx[d.mother]; if (M && !alive(M)) M = null;
    var mx = M ? M.x : d.x, my = M ? M.y : d.y, mvx = M ? M.vx : d.vx, mvy = M ? M.vy : d.vy;
    // autonomy 1 heads home only when nearly dry; 2+ keeps a margin for the trip back
    if (M && d.mode !== 'return' && d.dv < d.dv0 * (d.aut >= 2 ? N.dRecall : N.dRecall * 0.5)) d.mode = 'return';
    if (d.type === 'striker' && d.payload <= 0 && d.mode !== 'return' && M) d.mode = 'return';
    var E = enemyCentre(w, d.side, mx, my);
    d.near = !!nearestTrack(w, d.side, d.x, d.y, 4000, function (c) { return true; });
    // evasion: autonomy 1 dodges only once lasered; 2+ whenever an enemy ship is near
    d.evade = d.dv > d.dv0 * 0.35 && (w.t - d.lasered < 20 || (d.aut >= 2 && !!nearestTrack(w, d.side, d.x, d.y, 8000, function (c) { return c.kind === 'ship'; })));  // never jinks itself dry
    if (d.mode === 'return') { d.sx = mx; d.sy = my; d.svx = mvx; d.svy = mvy; d.vmax = Math.max(0.5, Math.min(12, d.dv * 0.45)); return; }  // keep enough to brake at the bay
    if (d.mode === 'strike') {
      var tr = d.tgt && trackOf(w, d.side, d.tgt);
      if (!tr && d.aut >= 2) { var nt = nearestTrack(w, d.side, d.x, d.y, 1e7, function (c) { return c.kind === 'ship' && !c.disabled; }); if (nt) { d.tgt = nt.id; tr = nt; } }
      if (!tr) { d.mode = M ? 'return' : 'screen'; return droneThink(w, d); }
      var dx = tr.ex - d.x, dy = tr.ey - d.y, dl = hyp(dx, dy) || 1;
      var stand = d.type === 'lancer' ? N.lancerRange * 0.5 : d.type === 'striker' ? N.strikeRelease * 0.6 : 3000;
      // strikers go in as one wave: each waits at the rally ring until the wave's other strikers are there too,
      // so the payloads arrive together and the target's point defence has more to shoot at than it can
      if (d.type === 'striker' && !d.go) {
        var mates = 0, at = 0, go = false;
        for (var q = 0; q < w.drones.length; q++) {
          var x = w.drones[q]; if (!x.alive || x.type !== 'striker' || x.mother !== d.mother || x.mode !== 'strike' || x.tgt !== d.tgt || !(x.payload > 0)) continue;
          mates++; if (x.go) go = true; else if (hyp(tr.ex - x.x, tr.ey - x.y) < N.strikeRally * 1.08) at++;
        }
        if (dl < N.strikeRally * 1.08 && d.rallyT == null) d.rallyT = w.t;
        if (go || at >= mates || (d.rallyT != null && w.t - d.rallyT > N.rallyWait)) d.go = true;
        else stand = Math.max(stand, N.strikeRally);
      }
      d.sx = tr.ex - dx / dl * stand; d.sy = tr.ey - dy / dl * stand; d.vmax = d.dv0 * N.strikeVFrac;
      // fly at the target's smoothed velocity: chasing every jink and every noisy fix would drain the tank
      d.svx = tr.vex != null ? tr.vex : tr.vx; d.svy = tr.vey != null ? tr.vey : tr.vy;
      if (d.type === 'striker' && dl < N.strikeRelease && d.payload > 0) release(w, d, tr);
      return;
    }
    // lancers on screen or intercept with nothing small to hunt go and laser the nearest enemy ship in reach
    // harass (ordered): go straight for the nearest enemy ship in reach of the carrier, whatever small stuff is about
    // a lancer picking at ships keeps the fuel to get home: it closes no faster than a share of what it has left,
    // and below harassKeep of a full tank it goes back to the bay rather than chase
    if (d.type === 'lancer' && d.mode === 'harass' && M && d.dv < d.dv0 * N.harassKeep) { d.mode = 'return'; return droneThink(w, d); }
    if (d.type === 'lancer' && d.mode === 'harass') {
      var hz = nearestTrack(w, d.side, mx, my, N.harassRange, function (c) { return c.kind === 'ship' && !c.disabled; });
      if (hz) {
        var zx = hz.ex - d.x, zy = hz.ey - d.y, zl = hyp(zx, zy) || 1, zs = N.lancerRange * N.harassStand;
        d.sx = hz.ex - zx / zl * zs; d.sy = hz.ey - zy / zl * zs; d.vmax = Math.min(d.dv0 * N.strikeVFrac * 0.6, d.dv * 0.3);
        // far out it closes from the carrier's own frame; it matches the target's velocity only once nearly in reach
        // (matching an enemy fleet's velocity from the start would spend the tank before it got there)
        var zm = zl < N.lancerRange * 1.5 || !M; d.svx = zm ? (hz.vex != null ? hz.vex : hz.vx) : mvx; d.svy = zm ? (hz.vey != null ? hz.vey : hz.vy) : mvy; return;
      }
    }
    if (d.type === 'lancer' && (d.mode === 'intercept' || d.mode === 'screen') && d.aut >= 2) {
      var isS = function (c) { return c.kind === 'missile' || c.kind === 'drone'; }, hr0 = N.huntRange * (0.5 + 0.25 * d.aut);
      if (!(nearestTrack(w, d.side, d.x, d.y, hr0, isS) || (M && nearestTrack(w, d.side, mx, my, hr0, isS)))) {
        var hs = nearestTrack(w, d.side, mx, my, N.harassRange, function (c) { return c.kind === 'ship' && !c.disabled; });
        if (hs) {
          var hx = hs.ex - d.x, hy = hs.ey - d.y, hl = hyp(hx, hy) || 1, st = N.lancerRange * N.harassStand;
          d.sx = hs.ex - hx / hl * st; d.sy = hs.ey - hy / hl * st; d.vmax = Math.min(d.dv0 * N.strikeVFrac * 0.6, d.dv * 0.3);
          var hm = hl < N.lancerRange * 1.5 || !M; d.svx = hm ? (hs.vex != null ? hs.vex : hs.vx) : mvx; d.svy = hm ? (hs.vey != null ? hs.vey : hs.vy) : mvy; return;
        }
      }
    }
    if (d.mode === 'intercept') {
      var hr = N.huntRange * (0.5 + 0.25 * d.aut), isT = function (c) { return c.kind === 'missile' || c.kind === 'drone'; };
      var h1 = nearestTrack(w, d.side, d.x, d.y, hr, isT) || (M && nearestTrack(w, d.side, mx, my, hr, isT));
      if (h1) {
        // sit across the threat's path a little ahead of it
        var lead = d.type === 'interceptor' ? 40 : 0;
        d.sx = h1.ex + h1.vx * lead; d.sy = h1.ey + h1.vy * lead; d.svx = h1.vx * 0.5 + mvx * 0.5; d.svy = h1.vy * 0.5 + mvy * 0.5; d.vmax = 20; d.hunt = h1.id; return;
      }
      d.hunt = null;
      var id = Math.min(N.interceptDist, E.d * 0.5);
      d.sx = mx + E.ux * id; d.sy = my + E.uy * id; d.svx = mvx; d.svy = mvy; d.vmax = 10; return;
    }
    if (d.mode === 'picket') {
      if (d.point) { d.sx = d.point.x; d.sy = d.point.y; d.svx = 0; d.svy = 0; }
      // out far enough that a cold ship at the enemy's estimated centre falls inside its own cold range
      else { var pd = Math.min(E.d * 0.8, Math.max(N.picketDist, E.d - N.coldShip * N.picketMul * 0.6)); d.sx = mx + E.ux * pd; d.sy = my + E.uy * pd; d.svx = mvx; d.svy = mvy; }
      d.vmax = N.picketVmax; return;
    }
    // screen: stay with a ship (the given one, else the carrier), between it and the enemy
    var S = d.tgt && w.idx[d.tgt] && w.idx[d.tgt].side === d.side ? w.idx[d.tgt] : M;
    var sx = S ? S.x : mx, sy = S ? S.y : my;
    if (d.type === 'decoy') { var off = N.decoyOff; d.sx = sx + E.ux * off * 0.3 - E.uy * off * d.side2; d.sy = sy + E.uy * off * 0.3 + E.ux * off * d.side2; }
    else { d.sx = sx + E.ux * N.screenDist; d.sy = sy + E.uy * N.screenDist; }
    d.svx = S ? S.vx : mvx; d.svy = S ? S.vy : mvy; d.vmax = 10;
  }
  function release(w, d, tr) {
    var T = seekPick(w, { side: d.side }, tr.ex, tr.ey); if (!T) return;
    var dl = hyp(tr.ex - d.x, tr.ey - d.y), rod = d.def.payload === 'rod';
    for (var i = 0; i < d.payload; i++) {
      spawnMissile(w, d.side, d.mother, d.x, d.y, d.z, d.vx, d.vy, d.vz, rod
        ? { acc: N.rodAcc * G, dv: N.rodDv, hp: N.rodHp, phase: 'term', seek: T, tgt: tr.id, warhead: 'kinetic', pen: 1, penKg: N.rodKg, fan: 0, wk: 'striker-rod', life: N.rodLife, lr: dl, light: true, keep: N.lmKeep }
        : { acc: N.lmAcc * G, dv: N.lmDv, hp: N.lmHp, phase: 'term', seek: T, tgt: tr.id, warhead: 'kinetic', pen: N.lmPen, penKg: N.lmPenKg, fan: N.mFan * 0.5, wk: 'striker-lm', life: N.lmLife, lr: dl, light: true, keep: N.lmKeep });
    }
    d.payload = 0;
    emit(w, { type: 'strikerRelease', side: d.side, drone: d.id, target: tr.id, range: Math.round(dl) });
  }
  function droneMove(w, d, h) {
    d.px = d.x; d.py = d.y; d.pz = d.z;
    if (!d.alive || d.docked) return;
    // a strike, a hunt or the last leg home flies hard; keeping station is lazy: the station point is smoothed
    // over two minutes (noisy far tracks swing it about), it closes in a few minutes, and it has a dead zone
    // a picket going out to a station tens of thousands of km off flies there, not at station-keeping pace
    var hard = d.mode === 'strike' || (d.mode === 'intercept' && d.hunt) || (d.mode === 'return' && hyp(d.sx - d.x, d.sy - d.y) < 2000) || (d.mode === 'picket' && hyp(d.sx - d.x, d.sy - d.y) > N.picketHard);
    if (hard || d.fsx == null) { d.fsx = d.sx; d.fsy = d.sy; } else { var kf = Math.min(1, h / 120); d.fsx += (d.sx - d.fsx) * kf; d.fsy += (d.sy - d.fsy) * kf; }
    var aMax = d.acc, rx = d.fsx - d.x, ry = d.fsy - d.y, r = hyp(rx, ry), ax = 0, ay = 0, az = 0;
    // (see above), a hunt or the last leg home flies hard; keeping station is lazy (a few minutes to close, a dead zone)
    var sp = hard ? Math.min(d.vmax, Math.sqrt(2 * 0.3 * aMax * r)) : r < N.dStationTol ? 0 : Math.min(d.vmax, 5, r / 300);
    var ux = r > 1e-6 ? rx / r : 0, uy = r > 1e-6 ? ry / r : 0;
    var dvx = d.svx + ux * sp - d.vx, dvy = d.svy + uy * sp - d.vy, dl = hyp(dvx, dvy);
    if (dl > (hard ? 0.03 : 0.1)) { var a = Math.min(aMax, dl / 4); ax = dvx / dl * a; ay = dvy / dl * a; }
    // jinks in and out of the plane when threatened; otherwise drift back to z = 0
    if (d.evade && d.dv > d.dv0 * 0.35) {
      // a jink is a one-second kick at the start of each 2-5 s leg, so it shifts velocity rather than burning all the time
      if (w.t >= d.jt) { var jm = N.dJink * aMax, ja = rnd(w) * 2 * PI; d.jx = Math.cos(ja) * jm * 0.7; d.jy = Math.sin(ja) * jm * 0.7; d.jz = (2 * rnd(w) - 1) * jm * 0.7; d.jt = w.t + 2 + 3 * rnd(w); d.jEnd = w.t + 1; }
      if (w.t < d.jEnd) { ax += d.jx; ay += d.jy; az += d.jz; }
    } else az = -(d.z * 0.01 + d.vz * 0.2);
    var am = hyp3(ax, ay, az); if (am > aMax) { ax *= aMax / am; ay *= aMax / am; az *= aMax / am; am = aMax; }
    if (am * h > d.dv) { var f = d.dv / (am * h); ax *= f; ay *= f; az *= f; am *= f; }
    d.dv -= am * h * (d.dvUse || 1); if (am > 0) d.burnT += h;
    d.ax = ax; d.ay = ay; d.az = az;
    d.x += d.vx * h + 0.5 * ax * h * h; d.y += d.vy * h + 0.5 * ay * h * h; d.z += d.vz * h + 0.5 * az * h * h;
    d.vx += ax * h; d.vy += ay * h; d.vz += az * h;
    if (d.mode === 'return') {
      var M = w.idx[d.mother];
      if (M && alive(M) && hyp(M.x - d.x, M.y - d.y) < N.dockRange && hyp(M.vx - d.vx, M.vy - d.vy) < N.dockVel) dock(w, d, M);
    }
  }
  function dock(w, d, M) {
    var bays = M.mods.filter(function (m) { return m.kind === 'bay' && m.state < 2; }); if (!bays.length) return;
    bays.sort(function (a, b) { return a.service.length - b.service.length; });
    bays[0].service.push({ type: d.type, left: N.service });
    d.alive = false; d.docked = true; goneStat(w, d, 'docked');
    w.stats.dronesDocked[d.side]++;
    emit(w, { type: 'docked', side: d.side, ship: M.id, drone: d.type });
  }
  function droneDied(w, d, by) {
    var L = w.stats.droneLost[d.side]; L[d.type] = (L[d.type] || 0) + 1;
    emit(w, { type: 'droneKilled', side: d.side, id: d.id, drone: d.type, by: by, who: d.diedTo || null });
  }

  // ---------------------------------------------------------------- slugs (railgun rounds, fragments, penetrators)
  function addSlug(w, p) { p.id = 's' + (w.sid = (w.sid || 0) + 1); p.born = w.t; p.alive = true; if (p.z == null) p.z = 0; if (p.sv) p.sv.left++; w.slugs.push(p); return p; }
  // the UI's shot log: how each missile ended (hit, missed, or shot down and by what)
  function misLog(w, m, out, by, who) {
    if (w.shotLog) w.shotLog.push({ k: 'mis', t: w.t, side: m.side, src: m.from, tgt: m.seek ? m.seek.id : null, wk: m.wk, out: out, by: by || null, who: who || null, pts: m.pts || 0 });
  }
  function slugGone(w, p) { if (p.mis && --p.mis.penLeft === 0) misLog(w, p.mis, p.mis.hitAny ? 'hit' : 'miss'); var sv = p.sv; if (!sv) return; sv.left--; if (sv.left <= 0 && sv.closed) salvoDone(w, sv); }
  var TG = [];
  function slugsMove(w, h) {
    var L = w.slugs, cull = (w.nTick % 10 === 0), tg = TG; tg.length = 0;
    for (var i = 0; i < w.ships.length; i++) if (alive(w.ships[i])) tg.push(w.ships[i]);
    for (i = 0; i < w.drones.length; i++) if (alive(w.drones[i])) tg.push(w.drones[i]);
    for (i = L.length - 1; i >= 0; i--) {
      var p = L[i], nx = p.x + p.vx * h, ny = p.y + p.vy * h, nz = p.z + p.vz * h, hit = null, hitTau = 2;
      for (var j = 0; j < tg.length; j++) {
        var T = tg[j]; if (T.side === p.side) continue;
        var d0x = p.x - T.px, d0y = p.y - T.py, d1x = nx - T.x, d1y = ny - T.y, ex = d1x - d0x, ey = d1y - d0y;
        var reach = Math.abs(ex) + Math.abs(ey) + T.r + (p.sv && T.id === p.tgt ? 200 : 0.01);
        if (Math.abs(d0x) > reach || Math.abs(d0y) > reach) continue;
        var d0z = p.z - T.pz, d1z = nz - T.z, ez = d1z - d0z;
        var ee = ex * ex + ey * ey + ez * ez, tau = ee > 0 ? -(d0x * ex + d0y * ey + d0z * ez) / ee : 0;
        var inside = tau > 0 && tau < 1;
        if (tau < 0) tau = 0; else if (tau > 1) tau = 1;
        var cx = d0x + ex * tau, cy = d0y + ey * tau, cz = d0z + ez * tau, cc = cx * cx + cy * cy + cz * cz;
        if (cc < T.r * T.r) { if (tau < hitTau) { hit = T; hitTau = tau; } }
        else if (inside && p.sv && T.id === p.tgt && !p.passed) { p.passed = true; missNote(p, T, cx, cy, cz, ex, ey, ez); }
      }
      if (hit) { slugHit(w, p, hit); L[i] = L[L.length - 1]; L.pop(); slugGone(w, p); continue; }
      if (w.planets.length && blocked(w, p.x, p.y, nx, ny)) { L[i] = L[L.length - 1]; L.pop(); slugGone(w, p); continue; }
      p.x = nx; p.y = ny; p.z = nz;
      if (p.burst && w.t >= p.burst) { L[i] = L[L.length - 1]; L.pop(); burstCanister(w, p); slugGone(w, p); continue; }
      if (cull && !slugLive(w, p, tg)) { L[i] = L[L.length - 1]; L.pop(); slugGone(w, p); }
    }
  }
  // closest approach of a round to its own target: split into height and across-track parts
  function missNote(p, T, cx, cy, cz, ex, ey, ez) {
    var el = hyp3(ex, ey, ez) || 1, B = basis(ex / el, ey / el, ez / el);
    var lat = cx * B.lx + cy * B.ly, up = cx * B.ux + cy * B.uy + cz * B.uz;
    // the side is named from the target's own heading, so 'to port' reads from aboard
    var port = Math.cos(T.heading || 0) * cy - Math.sin(T.heading || 0) * cx, dd = Math.sqrt(lat * lat + up * up);
    var sv = p.sv; sv.mUp += up; sv.mLat += port; sv.mN++; sv.mD += dd;
    if (dd < sv.best) sv.best = dd;
  }
  function salvoDone(w, sv) {
    if (sv.reported) return; sv.reported = true;
    calAdd(w, sv.wk, sv.side, sv.est, sv.hits > 0);
    // the UI's shot log (only when it asked for one): what the salvo or canister really did
    if (w.shotLog) w.shotLog.push({ k: 'rail', t: w.t, side: sv.side, src: sv.src, tgt: sv.tgt, wk: sv.wk, n: sv.n, r: sv.r || 1, hits: sv.hits, pts: sv.pts || 0,
      up: sv.mN ? sv.mUp / sv.mN : 0, lat: sv.mN ? sv.mLat / sv.mN : 0, mN: sv.mN, mD: sv.mD });
    if (w.calTrace && sv.info) { var Ti = w.idx[sv.tgt]; sv.info.wk = sv.wk; sv.info.est = sv.est; sv.info.hit = sv.hits > 0; sv.info.n = sv.n; sv.info.miss = sv.mN ? sv.mD / sv.mN : null; sv.info.best = sv.best; sv.info.evEnd = Ti && Ti.ctl ? Ti.ctl.ev : null; w.calTrace.push(sv.info); }
    if (sv.hits || !sv.mN) return;
    var up = sv.mUp / sv.mN, side = sv.mLat / sv.mN, d = Math.sqrt(up * up + side * side), T = w.idx[sv.tgt];
    var where = Math.abs(up) >= Math.abs(side) ? (up > 0 ? 'above' : 'below') : (side > 0 ? 'to port of' : 'to starboard of');
    var km = d < 10 ? d.toFixed(1) : String(Math.round(d));
    emit(w, { type: 'miss', side: sv.side, target: sv.tgt, wk: sv.wk, n: sv.n, dist: d, up: up, lat: side, best: sv.best,
      text: (sv.n > 1 ? 'Salvo' : 'Round') + ' passed ' + km + ' km ' + where + ' ' + (T ? T.name || T.id : 'the target') });
  }
  function slugLive(w, p, tg) {
    if (w.t - p.born > N.slugLife || (p.die && w.t > p.die)) return false;
    for (var j = 0; j < tg.length; j++) {
      var T = tg[j]; if (T.side === p.side) continue;
      var rx = p.x - T.x, ry = p.y - T.y;
      if (rx * (p.vx - T.vx) + ry * (p.vy - T.vy) < 0 || rx * rx + ry * ry < N.cullRange * N.cullRange) return true;
    }
    return false;
  }
  function burstCanister(w, p) {
    var n = p.canN || N.canN, rvx = p.vx - p.tvx, rvy = p.vy - p.tvy, rvz = p.vz - p.tvz, rl = hyp3(rvx, rvy, rvz) || 1, B = basis(rvx / rl, rvy / rl, rvz / rl);
    var nl = Math.ceil(Math.sqrt(n)), nu = Math.ceil(n / nl), k = 0, sp = (p.canR || 1) / Math.max(0.5, (p.canT || w.t + N.canLeadMin) - w.t), die = (p.canT || w.t) + N.fragLife;
    for (var i = 0; i < nl; i++) for (var j = 0; j < nu && k < n; j++, k++) {
      // the fragments scatter at random across the cloud (one per cell of the grid), so the cloud has no safe gaps a target can know of
      var ol = (nl === 1 ? 0 : ((i + rnd(w)) / nl) * 2 - 1) * sp, ou = (nu === 1 ? 0 : ((j + rnd(w)) / nu) * 2 - 1) * sp;
      addSlug(w, { kind: 'frag', wk: 'canister', side: p.side, src: p.src, x: p.x, y: p.y, z: p.z, vx: p.vx + B.lx * ol + B.ux * ou, vy: p.vy + B.ly * ol + B.uy * ou, vz: p.vz + B.uz * ou,
        kg: p.kg / n, tgt: p.tgt, lr: p.lr, sv: p.sv, known: p.known, die: die, par: p.id });
    }
  }
  function slugHit(w, p, T) {
    var rvx = p.vx - T.vx, rvy = p.vy - T.vy, rvz = p.vz - T.vz, v2 = rvx * rvx + rvy * rvy + rvz * rvz;
    var pts = 0.5 * p.kg * v2 / 1000 * N.kinPts * (p.kind === 'frag' ? N.fragK : 1);
    if (p.kind === 'pen') { if (p.mis && !p.mis.hitAny) { p.mis.hitAny = true; stat(w, p.wk).hits++; } }
    else if (p.sv) { if (!p.sv.hits) stat(w, p.wk).hits++; p.sv.hits++; }
    if (T.kind !== 'ship') { T.hp -= pts; if (T.hp <= 0) killSmall(w, T, p.wk, p.src); return; }
    if (w.hitLog) w.hitKey = p.kind === 'frag' ? 'c' + p.par : 'r' + p.id;
    var took = damage(w, T, pts, p.kind === 'frag' ? 'frag' : 'kin', facing(T, -rvx, -rvy), p.wk);
    if (w.hitLog) w.hitKey = null;
    if (p.sv) p.sv.pts = (p.sv.pts || 0) + took; else if (p.mis) p.mis.pts = (p.mis.pts || 0) + took;
    hitRecord(w, p.wk, p.lr, took, p.side);
  }
  // calibration: every shot is filed under the hit chance its gunnery computer gave it when it fired
  var CALB = [0.05, 0.15, 0.3, 0.6];
  function calAdd(w, wk, side, est, hit) {
    if (est == null || !(est >= 0)) return;
    var C2 = w.stats.cal, b = 0; while (b < CALB.length && est >= CALB[b]) b++;
    [wk, wk + '.' + side].forEach(function (k) { var a = C2[k] || (C2[k] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]); a[b][0]++; a[b][1] += hit ? 1 : 0; a[b][2] += est; });
  }
  function hitRecord(w, wk, range, pts, side) {
    if (!(pts > 0)) return;
    var b = stat(w, wk); b.pts += pts; b.rng[bucket(range)] += pts; b.rsum += pts * range;
    if (side) { var m = w.stats.dmgBy[side]; m[wk] = (m[wk] || 0) + pts; }
  }
  // every small craft that leaves the battle is tagged with why: the weapon that killed it, 'life' (ran out of
  // time), 'planet', 'warhead' (a missile that reached its target and split or went off) or 'docked'
  function goneStat(w, T, cause) {
    var cls = T.kind === 'drone' ? T.type : (T.wk || 'missile'), G2 = w.stats.gone[T.side], b = G2[cls] || (G2[cls] = {});
    b[cause] = (b[cause] || 0) + 1;
  }
  // who: the ship or drone whose weapon did it, when there is one (for the UI's shot log)
  function killSmall(w, T, by, who) {
    if (!T.alive) return;
    T.alive = false; goneStat(w, T, by);
    T.diedBy = by; T.diedTo = who || null;
    if (T.kind === 'missile') misLog(w, T, by === 'life' || by === 'planet' ? 'miss' : 'down', by, who);
    if (T.kind === 'drone') droneDied(w, T, by);
    else emit(w, { type: 'missileKilled', side: T.side, id: T.id, by: by, who: who || null });
  }
  function blocked(w, x0, y0, x1, y1) {
    for (var i = 0; i < w.planets.length; i++) {
      var P = w.planets[i], dx = x1 - x0, dy = y1 - y0, fx = x0 - P.x, fy = y0 - P.y, dd = dx * dx + dy * dy;
      var t = dd > 0 ? -(fx * dx + fy * dy) / dd : 0; if (t < 0) t = 0; else if (t > 1) t = 1;
      var cx = fx + dx * t, cy = fy + dy * t; if (cx * cx + cy * cy < P.r * P.r) return true;
    }
    return false;
  }
  function facing(s, dx, dy) {
    var a = Math.abs(angDiff(s.heading, Math.atan2(dy, dx)));
    return a <= PI / 6 ? 'nose' : a >= PI * 5 / 6 ? 'tail' : 'flank';
  }

  // ---------------------------------------------------------------- lasers (1 s pulses that travel at c)
  function emitLaser(w, s, ldef, tr, dps, wk, obj) {
    // a wreck draws no more fire: its track is dropped at the next look, but no pulse is spent on it meanwhile
    if (obj && !alive(obj)) return false;
    var sol = solve(w, s, tr, C); if (!sol) return false;
    var range = sol.range;
    var err = N.aimErr * range * crewAim(s) * aimMul(s);
    var ax = sol.px + gauss(w) * err, ay = sol.py + gauss(w) * err, az = sol.pz + gauss(w) * err;
    if (w.planets.length && blocked(w, s.x, s.y, ax, ay)) return false;
    // the beam director re-points only as fast as light brings word back: whatever the target does that the
    // track did not foresee drags the spot across the hull for that long, and a smeared spot heats, not cuts
    var lf = laserFall(ldef, range), sf = smearF(hyp3(obj.vx - sol.tvx, obj.vy - sol.tvy, obj.vz - sol.tvz), range), fall = lf * sf;
    var att = w.clouds.length ? sandAtt(w, s.x, s.y, ax, ay) : 1;
    s.beamT = w.t; s.beamX = ax; s.beamY = ay;  // for the dev view: the last beam this shooter fired, and where
    var rr = (tr.r || 0.06) + range * N.laserDiv, est = laserChance(tr, sol, rr, spreadOf(w, s, tr, sol), spreadOf(w, s, tr, sol, 0, 0, false, true), readOf(s));
    w.beams.push({ side: s.side, src: s.id, wk: wk, tArr: w.t + sol.t, ax: ax, ay: ay, az: az, pts: dps * N.tick * fall * att, lf: lf, sf: sf, obj: obj, range: range, spot: range * N.laserDiv, est: est });
    stat(w, wk).fired++;
    return true;
  }
  function beams(w) {
    for (var i = w.beams.length - 1; i >= 0; i--) {
      var b = w.beams[i]; if (b.tArr > w.t + 1e-9) continue;
      w.beams.splice(i, 1);
      var T = b.obj; if (!T || !alive(T)) continue;
      var lag = w.t - b.tArr, tx = T.x - T.vx * lag, ty = T.y - T.vy * lag, tz = T.z - T.vz * lag;
      var bh = hyp3(tx - b.ax, ty - b.ay, tz - b.az) <= T.r + b.spot;
      calAdd(w, b.wk, b.side, b.est, bh);
      if (w.calTrace && b.wk !== 'pdLaser') w.calTrace.push({ lz: 1, wk: b.wk, est: b.est, hit: bh, kind: T.kind, type: T.type, miss: hyp3(tx - b.ax, ty - b.ay, tz - b.az) / (T.r + b.spot) });
      var lzRec = w.shotLog && T.kind === 'ship' ? { k: 'lz', t: w.t, side: b.side, src: b.src, tgt: T.id, wk: b.wk, hit: bh, pts: 0, shed: bh && !(b.lf > 0), smear: bh && b.lf > 0 && b.sf < 0.5 } : null;
      if (lzRec) w.shotLog.push(lzRec);
      if (!bh) continue;
      stat(w, b.wk).hits++;
      if (T.kind !== 'ship') {
        T.hp -= b.pts * (T.kind === 'missile' ? N.laserMis : 1); if (T.kind === 'drone') T.lasered = w.t;   // a missile's skin is thin
        if (T.hp <= 0) { killSmall(w, T, b.wk, b.src); if (T.kind === 'missile') w.stats.pdKills[b.side]++; }
        continue;
      }
      var S = w.idx[b.src];
      T.lasered = w.t; T.laseredBy = b.src;
      // a lancer's beam is too weak to cut armour; it picks at the gear outside it, and the hull takes only a little
      if (b.wk === 'lancer') { var fl = facing(T, b.ax - T.x, b.ay - T.y); var mk = modRoll(w, T, 0, fl, 'lancer', b.pts * N.lancerModPerPt / N.tough); var lt = damage(w, T, b.pts * N.lancerHull, 'laser', fl, 'lancer'); if (lzRec) { lzRec.pts = lt; lzRec.mod = !!mk; } hitRecord(w, 'lancer', b.range, lt + (mk ? N.modWorth : 0), b.side); continue; }
      var bt = damage(w, T, b.pts, 'laser', S ? facing(T, S.x - T.x, S.y - T.y) : 'flank', b.wk);
      if (lzRec) lzRec.pts = bt;
      hitRecord(w, b.wk, b.range, bt, b.side);
    }
  }
  function sandAtt(w, x0, y0, x1, y1) {
    var f = 1;
    for (var i = 0; i < w.clouds.length; i++) {
      var c = w.clouds[i], dx = x1 - x0, dy = y1 - y0, fx = x0 - c.x, fy = y0 - c.y, dd = dx * dx + dy * dy;
      var t = dd > 0 ? -(fx * dx + fy * dy) / dd : 0; if (t < 0) t = 0; else if (t > 1) t = 1;
      var cx = fx + dx * t, cy = fy + dy * t; if (cx * cx + cy * cy < c.r * c.r) f *= 1 - N.sandBlock * c.dens;
    }
    return f;
  }

  // ---------------------------------------------------------------- point defence (automatic, statistical)
  function pointDefence(w, h) {
    var i, k, c;
    for (i = 0; i < w.ships.length; i++) {
      var s = w.ships[i]; if (!active(s)) continue;
      var cand = null;
      for (k = 0; k < s.mods.length; k++) {
        var m = s.mods[k]; if ((m.kind !== 'pdl' && m.kind !== 'flak') || m.state === 2) continue;
        if (!cand) cand = pdCandidates(w, s.side, s.x, s.y, s.z, 3000, true);
        if (!cand.length) break;
        var reach = m.def.range, pick = null, pn = 0;
        // spread mounts across targets: the k-th mount takes the k-th nearest threat in reach if there is one
        for (c = 0; c < cand.length; c++) if (cand[c].d < reach) { if (pn === (k % 3)) { pick = cand[c]; break; } pn++; }
        if (!pick) for (c = 0; c < cand.length; c++) if (cand[c].d < reach) { pick = cand[c]; break; }
        if (!pick) continue;
        var T = pick.o, e = stE(s, 'guns') * (m.state === 1 ? 0.5 : 1);
        if (m.kind === 'pdl') {
          if (s.sys.reactor.state === 2) continue;
          var heatF = s.heat > N.heatThrottle ? Math.max(0, (100 - s.heat) / (100 - N.heatThrottle)) : 1;
          // a jinking missile in its terminal burn is harder to hold a beam on
          var jk = T.kind === 'missile' && T.phase === 'term' ? 1 - N.mJink : 1;
          T.hp -= m.def.dps * e * heatF * jk * laserFall(m.def, pick.d) * h * (s.sys.reactor.state === 1 ? 0.6 : 1);
          s.heat += m.def.heat * h; m.firing = 1;
          if (T.kind === 'drone') T.lasered = w.t;
          if (T.hp <= 0 && T.alive) { if (T.kind === 'missile') w.stats.pdKills[s.side]++; killSmall(w, T, 'pdLaser', s.id); }
        } else {
          if (m.ammo <= 0) continue;
          m.ammo -= m.def.rate * h; m.firing = 1;
          if (rnd(w) < flakP(m.def.rate, h, e, T)) { killSmall(w, T, 'flak', s.id); if (T.kind === 'missile') w.stats.flakKills[s.side]++; }
        }
      }
    }
    // interceptor drones: a flak screen ahead of the fleet, against missiles only
    for (i = 0; i < w.drones.length; i++) {
      var d = w.drones[i]; if (!alive(d) || d.type !== 'interceptor' || d.ammo <= 0) continue;
      var fl = d.def.flak, cd = pdCandidates(w, d.side, d.x, d.y, d.z, fl.range, false);
      if (!cd.length) continue;
      var Tm = cd[0].o; d.ammo -= fl.rate * h;
      if (rnd(w) < flakP(fl.rate, h, 1, Tm)) { killSmall(w, Tm, 'interceptor', d.id); w.stats.droneFlakKills[d.side]++; }
    }
  }
  function flakP(rate, h, e, T) { return 1 - Math.exp(-rate * h * e * (T.kind === 'missile' && T.phase === 'term' ? 1 - N.mJink : 1) * N.flakK); }
  function pdCandidates(w, side, x, y, z, R, drones) {
    var out = [], st = w.sides[side].tracks;
    function add(o) {
      if (!o.alive || o.side === side || o.docked) return;
      var dx = o.x - x, dy = o.y - y; if (Math.abs(dx) > R || Math.abs(dy) > R) return;
      var d = hyp3(dx, dy, o.z - z); if (d > R) return;
      var tr = st[o.id]; if (!tr || !tr.firm) return;
      var close = -(dx * o.vx + dy * o.vy) / d;
      out.push({ o: o, d: d, tgo: o.kind === 'missile' ? d / Math.max(close, 0.1) : 1e6 + d });
    }
    for (var i = 0; i < w.missiles.length; i++) add(w.missiles[i]);
    if (drones) for (i = 0; i < w.drones.length; i++) add(w.drones[i]);
    out.sort(function (a, b) { return a.tgo - b.tgo; });
    return out;
  }

  // ---------------------------------------------------------------- weapons: queues, reloads, firing
  function weapons(w, h) {
    for (var i = 0; i < w.ships.length; i++) {
      var s = w.ships[i]; if (!active(s)) continue;
      s.ctl.point = null;
      for (var k = 0; k < s.mods.length; k++) {
        var m = s.mods[k]; if (m.state === 2) continue;
        if (m.cd > 0) m.cd -= h * (m.kind === 'bay' ? stE(s, 'flight') * (s.ab.tightDeck ? s.ab.tightDeck.deck : 1) : stE(s, 'guns') * (s.ab.quickHands ? s.ab.quickHands.reload : 1)) * (m.state === 1 ? 0.5 : 1);
        if (m.kind === 'rail') {
          if (m.def.spinal) {
            if (m.pending) {
              if (w.t > m.pending.until || m.ammo <= 0) { closeJob(w, m.pending); m.pending = null; continue; }
              var sol = m.pending.sol; if (!sol) continue;
              var want = Math.atan2(sol.dy, sol.dx);
              s.ctl.point = want;
              // a hard jink throws the nose about: the spinal cannot be laid (the shot waits, and is counted once)
              if (s.ctl.ev === 'hard') { if (!m.pending.held) { m.pending.held = true; w.stats.dodge[s.side].held++; } continue; }
              if (m.cd <= 0 && Math.abs(angDiff(s.heading, want)) < N.spinalTol) { var pj = m.pending; m.pending = null; fireSlug(w, s, m, sol, pj.offs[0], pj); closeJob(w, pj); }
            }
          } else if (m.burst && m.cd <= 0 && m.ammo > 0 && m.burst.sol) {
            var bu = m.burst; fireSlug(w, s, m, bu.sol, bu.offs[bu.i], bu); bu.i++;
            if (bu.i >= bu.offs.length) { closeJob(w, bu); m.burst = null; }
          } else if (m.burst && m.ammo <= 0) { closeJob(w, m.burst); m.burst = null; }
        } else if (m.kind === 'rack') {
          // a missile cannot be released from a hard jink: the salvo waits for the helm to steady
          if (m.q.length && m.cd <= 0 && m.load > 0 && s.ctl.ev !== 'hard') { var job = m.q.shift(); if (launchMissile(w, s, m, job.target)) { m.load--; m.cd = m.def.cycle; } }
        } else if (m.kind === 'bay') {
          if (m.q.length && m.cd <= 0) { var dj = m.q.shift(); if (s.stock[dj] > 0) { s.stock[dj]--; launchDrone(w, s, dj); m.cd = N.launchCycle; } }
        }
      }
    }
  }
  // pointing error from the shooter's own dodge (rad): turret rails lose accuracy, a spinal cannot be laid at Hard
  function jinkAim(s, m) { var ev = s.ctl.ev || 'off', t = N.jinkAim[m.def.spinal ? 'spinal' : 'turret']; return (t && t[ev]) || 0; }
  // the gunner's part of the aim error (0 at full effectiveness) and the Patient eye cut to the whole pointing error
  function crewAim(s) { return 1 / Math.max(stE(s, 'guns'), 0.2) - 1; }
  function aimMul(s) { return s.ab && s.ab.patientEye ? s.ab.patientEye.aim : 1; }
  // how much of the target's jink the gunnery solution filters out
  function readOf(s) { var tier = s.tiers ? s.tiers.gunnery : 1; return Math.min(0.95, (N.readEv[tier] || 0) + (s.ab && s.ab.readJink ? s.ab.readJink.read : 0)); }
  function closeJob(w, job) { var sv = job.sv; if (!sv || sv.closed) return; sv.closed = true; if (sv.left <= 0) salvoDone(w, sv); }
  function fireSlug(w, s, m, sol, off, job) {
    // re-solve at the moment of firing: the stored solution can be a sub-step old
    var trf = trackOf(w, s.side, job.target), fresh = trf && solve(w, s, trf, m.def.muzzle); if (fresh) sol = fresh;
    // a pattern offset (km at the target, across and up) becomes a small change of direction
    var B = basis(sol.dx, sol.dy, sol.dz), L = sol.L || 1, err = Math.sqrt(sqr(N.aimErr * crewAim(s)) + sqr(jinkAim(s, m))) * aimMul(s);
    var ol = (off ? off[0] : 0) / L + gauss(w) * err, ou = (off ? off[1] : 0) / L + gauss(w) * err;
    var dx = sol.dx + B.lx * ol + B.ux * ou, dy = sol.dy + B.ly * ol + B.uy * ou, dz = sol.dz + B.uz * ou, dl = hyp3(dx, dy, dz);
    var u = m.def.muzzle; dx /= dl; dy /= dl; dz /= dl;
    var canister = job.ammo === 'canister', wk = canister ? 'canister' : m.def.spinal ? 'spinal' : 'rail';
    if (!job.sv) {
      // a spinal is laid some seconds after it was ordered: its estimate is the one at the moment it fires
      var est = job.est;
      if (m.def.spinal) { var ef = hitEstimate(w, s, m.id, job.target, { n: 1, steady: true, ammo: job.ammo }); if (ef && ef.ok) { est = ef.chance; if (canister) { job.canR = ef.canR; job.canN = ef.canN; job.canLead = ef.canLead; } if (job.e) { job.e.parts = ef.parts; job.e.pm = ef.pm; job.e.s0 = ef.s0; job.e.T = ef.tT; job.e.offs = ef.offsets; } } }
      job.sv = { side: s.side, src: s.id, tgt: job.tobj, wk: wk, n: 0, left: 0, hits: 0, closed: false, mUp: 0, mLat: 0, mN: 0, mD: 0, best: 1e9, est: est, pts: 0, r: 0 };
      if (w.calTrace) { var Tg = w.idx[job.tobj]; job.sv.info = { t: w.t, range: sol.range, T: sol.t, cls: Tg && (Tg.hull || Tg.type || Tg.kind), src: s.hull, tg: Tg ? Tg.gNow : null, man: Tg && Tg.orders && Tg.orders.man ? Tg.orders.man.type : null, ev: Tg && Tg.ctl ? Tg.ctl.ev : null, sev: s.ctl.ev, e: job.e || null }; }
    }
    // the launch flash: the enemy learns of the round when the light reaches its nearest sensor
    var E = enemyOf(s.side), best = 1e12;
    for (var i = 0; i < w.ships.length; i++) { var o = w.ships[i]; if (o.side === E && o.status !== 'destroyed') best = Math.min(best, hyp(o.x - s.x, o.y - s.y)); }
    var p = addSlug(w, { kind: canister ? 'can' : 'slug', wk: wk, side: s.side, src: s.id, x: s.x, y: s.y, z: s.z, vx: s.vx + dx * u, vy: s.vy + dy * u, vz: s.vz + dz * u,
      kg: m.def.kg, tgt: job.tobj, lr: sol.range, sv: job.sv, known: w.t + best / C });
    job.sv.n += canister ? (job.canN || N.canN) : 1; job.sv.r++;
    if (canister) { p.canT = w.t + sol.t; p.burst = w.t + Math.max(Math.min(1, sol.t / 2), sol.t - (job.canLead || N.canLeadMin)); p.canR = job.canR || 1; p.canN = job.canN || N.canN; p.tvx = sol.tvx; p.tvy = sol.tvy; p.tvz = sol.tvz; }
    m.ammo--; m.cd = m.def.cycle;
    stat(w, wk).fired++;
    s.heat += 0.2;
  }

  // ---------------------------------------------------------------- once per tick
  function slowTick(w, dt) {
    var i, k, s, m;
    // lasers fire in 1 s pulses
    for (i = 0; i < w.ships.length; i++) {
      s = w.ships[i]; s.laserOn = false; if (!active(s)) continue;
      for (k = 0; k < s.mods.length; k++) {
        m = s.mods[k]; m.firing = 0;
        if (m.kind !== 'laser' || m.state === 2 || !m.target || s.sys.reactor.state === 2) continue;
        var tr = trackOf(w, s.side, m.target), tob = tr && w.idx[tr.oid]; if (!tr || !tr.firm || !tob || !alive(tob)) { m.target = null; continue; }
        var heatF = s.heat > N.heatThrottle ? Math.max(0, (100 - s.heat) / (100 - N.heatThrottle)) : 1; if (heatF <= 0) continue;
        var dps = m.def.dps * heatF * (m.state === 1 ? 0.5 : 1) * (s.sys.reactor.state === 1 ? 0.6 : 1);
        if (tr.kind !== 'ship') dps *= N.pdTrack;
        var obj = w.idx[tr.oid]; if (!obj) continue;
        if (emitLaser(w, s, m.def, tr, dps, 'laser', obj)) { s.heat += m.def.heat * heatF; m.firing = 1; s.laserOn = true; }
      }
    }
    // drones think every few ticks; lancers pick their own shots (missiles, then drones, then ships)
    for (i = 0; i < w.drones.length; i++) {
      var d = w.drones[i]; if (!alive(d)) continue;
      if ((w.nTick + i) % 4 === 0 || d.mode === 'strike' || d.inbox.length) droneThink(w, d);
      if (d.type === 'lancer' && d.mode !== 'return') {
        var ld = d.def.laser, bestC = null, bs = 1e18, tl = w.sides[d.side].tl;
        for (var t = 0; t < tl.length; t++) {
          var c = tl[t]; if (!c.firm) continue; var dd = hyp(c.ex - d.x, c.ey - d.y); if (dd > N.lancerRange) continue;
          var sc = dd * (d.mode === 'harass' ? (c.kind === 'ship' ? (c.disabled ? 2 : 0.2) : 3) : c.kind === 'missile' ? 0.3 : c.kind === 'drone' ? 0.6 : 1); if (sc < bs) { bs = sc; bestC = c; }
        }
        if (bestC) { var o2 = w.idx[bestC.oid]; if (o2) emitLaser(w, d, ld, bestC, ld.dps, 'lancer', o2); }
      }
    }
    // spinal and burst solutions refresh from the current picture
    for (i = 0; i < w.ships.length; i++) {
      s = w.ships[i];
      for (k = 0; k < s.mods.length; k++) {
        m = s.mods[k]; var job = m.pending || m.burst; if (!job) continue;
        var trj = trackOf(w, s.side, job.target);
        job.sol = trj ? solve(w, s, trj, m.def.muzzle) : null;
        if (!job.sol) { closeJob(w, job); m.pending = m.burst = null; } else job.tobj = trj.oid;
      }
    }
    for (i = 0; i < w.missiles.length; i++) missileGuide(w, w.missiles[i]);
    for (i = w.clouds.length - 1; i >= 0; i--) {
      var cl = w.clouds[i], age = w.t - cl.t0; cl.x += cl.vx * dt; cl.y += cl.vy * dt;
      cl.r = N.sandR0 + (N.sandR1 - N.sandR0) * Math.min(1, age / 60); cl.dens = Math.max(0, 1 - age / N.sandLife);
      if (age > N.sandLife) w.clouds.splice(i, 1);
    }
    for (i = 0; i < w.ships.length; i++) shipSlow(w, w.ships[i], dt);
    for (i = 0; i < w.ships.length; i++) { w.ships[i].lastT = w.t; pushHist(w, w.ships[i]); }
    for (i = 0; i < w.drones.length; i++) { w.drones[i].lastT = w.t; pushHist(w, w.drones[i]); }
    for (i = 0; i < w.missiles.length; i++) { w.missiles[i].lastT = w.t; pushHist(w, w.missiles[i]); }
    sense(w, dt);
    threats(w);
    capture(w, dt);
    checkEnd(w);
  }
  function missileGuide(w, m) {
    if (!m.alive || m.phase !== 'coast') return;
    var tr = trackOf(w, m.side, m.tgt);
    if (!tr) { var T = seekPick(w, m, m.x + m.vx * 60, m.y + m.vy * 60); if (T) { m.phase = 'term'; m.seek = T; } return; }
    var rx = tr.ex - m.x, ry = tr.ey - m.y, rz = tr.ez - m.z, vx = tr.vx - m.vx, vy = tr.vy - m.vy, vz = tr.vz - m.vz, r = hyp3(rx, ry, rz);
    var vv = vx * vx + vy * vy + vz * vz, tca = vv > 0 ? -(rx * vx + ry * vy + rz * vz) / vv : 0;
    if (tca < N.mTermT || r < 6000) { m.phase = 'term'; m.seek = seekPick(w, m, tr.ex, tr.ey); return; }
    if (w.t >= m.nextCorr) {
      m.nextCorr = w.t + N.mCorrEvery;
      var zx = rx + vx * tca, zy = ry + vy * tca, zz = rz + vz * tca, z = hyp3(zx, zy, zz);
      if (z > N.mCorrMiss && m.dv > m.dv0 * 0.4) {
        var need = Math.min(z / tca, m.dv - m.dv0 * 0.35);
        if (need > 0.01) m.corr = { x: zx / z, y: zy / z, z: zz / z, left: need };
      }
    }
  }
  function bandOf(g) { return g <= N.gCap.cruise + 1e-6 ? 'cruise' : g <= N.gCap.combat + 1e-6 ? 'combat' : g <= N.gCap.brace + 1e-6 ? 'brace' : 'crash'; }
  function shipSlow(w, s, dt) {
    if (s.status === 'destroyed') return;
    var g = s.gN > 0 ? s.gSum / s.gN : 0; s.gTick = g;
    // the ship's planned path, as threat previews read it: its velocity and thrust with the jink smoothed out
    var kp = Math.min(1, dt / N.tpSmooth);
    if (s.pvx == null) { s.pvx = s.vx; s.pvy = s.vy; s.pvz = s.vz; s.pax = s.ax || 0; s.pay = s.ay || 0; s.paz = s.az || 0; s.pdv = 0; }
    s.pvx += (s.vx - s.pvx) * kp; s.pvy += (s.vy - s.pvy) * kp; s.pvz += (s.vz - s.pvz) * kp;
    s.pax += ((s.ax || 0) - s.pax) * kp; s.pay += ((s.ay || 0) - s.pay) * kp; s.paz += ((s.az || 0) - s.paz) * kp;
    // a steady burn leaves the smoothed velocity a(tau - dt) behind: that lag is the plan, not a weave
    var lg = s.pLag = Math.max(0, N.tpSmooth - dt);
    s.pdv += ((sqr(s.vx - s.pvx - s.pax * lg) + sqr(s.vy - s.pvy - s.pay * lg) + sqr(s.vz - s.pvz - s.paz * lg)) / 3 - s.pdv) * kp;
    s.gPeak = Math.max(g, s.gPeak - 0.2 * dt);
    var band = bandOf(g), med = s.has.medbay && s.has.medbay.state < 2;
    if (s.status !== 'captured') w.stats.bandT[s.side][band] += dt;
    // combat phase: an active enemy ship within combatR (the band stats a balance pass reads)
    if (s.status !== 'captured') for (var ci = 0; ci < w.ships.length; ci++) { var e = w.ships[ci]; if (e.side !== s.side && active(e) && hyp(e.x - s.x, e.y - s.y) < N.combatR) { w.stats.bandC[s.side][band] += dt; break; } }
    // officers: strain, health, downs; s.st / s.ab / s.eff / s.strain come out of this
    var before = s.strain;
    crewStep(w, s, g, dt);
    if (s.ctl.evWhy === 'slug' && s.ctl.ev && s.ctl.ev !== 'off' && s.strain > before && band !== 'cruise') w.stats.dodge[s.side].strain += s.strain - before;
    if (s.strain >= 100 && !s.crisis) { s.crisis = true; emit(w, { type: 'strainCritical', side: s.side, ship: s.id }); }
    else if (before < 80 && s.strain >= 80) emit(w, { type: 'strainHigh', side: s.side, ship: s.id });
    if (s.crisis && s.strain < N.crisisExit) s.crisis = false;
    // ratings in the crash band: a slow trickle of injuries among the hands
    if (band === 'crash') kill(w, s, s.crew * N.crashInjPerMin / 60 * dt * (med ? N.medCasMul : 1));
    s.band = bandOf(s.gPeak);
    var rs = s.sys.radiators.state, shed = s.nRad * (s.radOut ? N.radExt : N.radRet) * (rs === 0 ? 1 : rs === 1 ? 0.5 : 0.1) * stE(s, 'engineering') * (s.ab.coldIron ? s.ab.coldIron.shed : 1);
    s.heat = Math.max(0, Math.min(N.heatMax, s.heat + (N.heatBase + N.driveHeat * Math.max(0, g - 1.5)) * dt - shed * dt));
    var ro = s.orders.radiators;
    if (s.orders.man.type === 'cold') s.radOut = false;
    else if (ro === 'extend') s.radOut = true; else if (ro === 'retract') s.radOut = false;
    else { if (s.heat > 40 || s.laserOn) s.radOut = true; else if (s.heat < 15) s.radOut = false; }
    if (s.has.wardline) { s.ward = Math.min(100, s.ward + N.wardRegen * dt * (s.has.wardline.state === 0 ? 1 : 0.5)); if (s.wardDown && s.ward >= N.wardRestart) s.wardDown = false; }
    // drone service: only while the carrier holds a steady, gentle course
    s.servicing = false;
    if (active(s)) s.mods.forEach(function (m) {
      if (m.kind !== 'bay' || m.state === 2 || !m.service.length) return;
      if (g >= N.serviceG) { s.serviceHeld = true; return; }
      s.servicing = true;
      var job = m.service[0]; job.left -= dt * stE(s, 'flight') * (s.ab.tightDeck ? s.ab.tightDeck.deck : 1) * (m.state === 1 ? 0.5 : 1);
      if (job.left <= 0) { m.service.shift(); s.stock[job.type]++; emit(w, { type: 'droneReady', side: s.side, ship: s.id, drone: job.type }); }
    });
    if (s.status !== 'captured' && s.crew > 0) {
      var teams = (s.crew0 >= 80 ? 2 : 1) + (s.ab.spareHands ? s.ab.spareHands.teams : 0), list = [];
      s.mods.forEach(function (m) { if (m.state === 1) list.push(m); });
      Object.keys(s.sys).forEach(function (k) { if (s.sys[k].state === 1) list.push(s.sys[k]); });
      for (var i = 0; i < list.length && i < teams; i++) {
        var m = list[i]; m.dc += N.dcRate * stE(s, 'engineering') * (s.ab.patchCrew ? s.ab.patchCrew.dc : 1) * dt;
        if (m.dc >= 1) { m.state = 0; m.dc = 0; emit(w, { type: 'repaired', side: s.side, ship: s.id, module: m.name }); updStatus(w, s); }
      }
      if (s.sys.tanks.state === 1) s.fuel *= 1 - 0.01 / 60 * dt;
    }
  }
  function kill(w, s, n) { n = Math.min(n, s.crew); s.crew -= n; w.stats.crewLost[s.side] += n; }

  // ---------------------------------------------------------------- crew: officers, strain, health
  // One officer per station. Generated crews come from their own stream (seed, side slot, loadout), never from w.rng,
  // so they are the same for the same seed and the same in both halves of a mirror match.
  function hashStr(h, str) { h = h >>> 0; for (var i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0; return h; }
  function crewRng(seed) {
    var st = seed >>> 0;
    return function () { st = (st + 0x6D2B79F5) | 0; var t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function stationsOf(s) { return D.STATIONS.filter(function (k) { return k !== 'flight' || s.mods.some(function (m) { return m.kind === 'bay'; }); }); }
  function newOfficer(s, def, k) {
    var O = D.ORIGINS[def.origin], A = D.ABILITIES[def.ability];
    var o = { id: s.id + '.' + def.station, ship: s.id, name: def.name, station: def.station, origin: def.origin, originName: O.name,
      comfort0: def.comfort != null ? def.comfort : O.comfort, limit0: def.limit != null ? def.limit : O.limit, comfort: 0, limit: 0,
      strain: def.strain || 0, health: def.health != null ? def.health : 100, health0: 0, effectiveness: 1, ability: def.ability, abilityName: A ? A.name : null,
      down: false, wentDown: false, story: !!def.story, hurt: 0, idx: k };
    o.health0 = o.health; if (o.health <= 0) { o.health = 0; o.down = true; }
    return o;
  }
  // spec.officers (campaign: carried between missions), else spec.cast (the story cast), else generated from the faction's mix
  function crewShip(w, s, spec) {
    var sts = stationsOf(s), fac = D.FACTIONS[spec.faction] || D.FACTIONS.arbitration, mix = fac.mix;
    var rng = crewRng(hashStr((w.seed || 0) ^ 0x51ED270B, 'crew|' + (spec.slot || 0) + '|' + s.load + '|' + (spec.faction || '')));
    var used = {};
    s.officers = sts.map(function (k, i) {
      var def = null;
      if (spec.officers) spec.officers.forEach(function (d) { if (d.station === k) def = d; });
      if (!def && spec.cast) D.CAST.forEach(function (c) { if (c.station === k) def = { name: c.name, station: k, origin: c.origin, ability: c.ability, story: true }; });
      // the stream is drawn the same way whether or not a cast member takes the post, so the other posts do not shift
      var r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
      if (!def) {
        var ori = 'hearth', acc = 0, tot = 0, ok = Object.keys(mix);
        ok.forEach(function (q) { tot += mix[q]; });
        for (var j = 0; j < ok.length; j++) { acc += mix[ok[j]] / tot; if (r1 < acc) { ori = ok[j]; break; } }
        var pool = Object.keys(D.ABILITIES).filter(function (a) { return D.ABILITIES[a].station === k; });
        var NM = D.NAMES[ori], nm, tries = 0;
        do { nm = NM.first[Math.floor(r2 * NM.first.length + tries) % NM.first.length] + ' ' + NM.last[Math.floor(r3 * NM.last.length + tries * 5) % NM.last.length]; tries++; } while (used[nm] && tries < 12);
        var O = D.ORIGINS[ori], dv = Math.round((r4 * 2 - 1) * N.originVary * 10) / 10;
        def = { name: nm, station: k, origin: ori, comfort: O.comfort + dv, limit: O.limit + dv, ability: pool[Math.floor(r5 * pool.length)], story: false };
      }
      used[def.name] = 1;
      return newOfficer(s, def, i);
    });
    crewCache(s);
  }
  function upG(s) { var c = s.has.couches, g = s.has.gel; return (c && c.state < 2) || (g && g.state < 2) ? N.couchG : 0; }
  // strain per s at x G over comfort
  function strainRate(x) {
    var K = N.strainKnots; if (x <= 0) return 0;
    if (x <= K[0][0]) return K[0][1] * x / K[0][0];
    for (var i = 1; i < K.length; i++) if (x <= K[i][0]) { var f = (x - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return Math.exp(Math.log(K[i - 1][1]) + f * (Math.log(K[i][1]) - Math.log(K[i - 1][1]))); }
    var a = K[K.length - 2], b = K[K.length - 1]; return b[1] * Math.pow(b[1] / a[1], (x - b[0]) / (b[0] - a[0]));
  }
  // health lost per minute at G g
  function hurtRate(o, g) { var x = g - o.limit; return x > 0 ? N.hurtLin * x + N.hurtSq * x * x : 0; }
  function officerEff(o) {
    if (o.down) return N.ratingEff;
    var sf = o.strain <= N.effStrainAt ? 1 : 1 - (1 - N.effStrainMin) * (o.strain - N.effStrainAt) / (100 - N.effStrainAt);
    var hf = o.health >= N.effHealthAt ? 1 : N.effHealthMin + (1 - N.effHealthMin) * o.health / N.effHealthAt;
    return hf * sf;
  }
  // per-station effectiveness (s.st, with the ratings' numbers folded in), live abilities (s.ab), and the old
  // ship-level fields kept for readers: s.eff (mean of the stations), s.strain (highest officer strain)
  function crewCache(s) {
    var cf = s.need > 0 ? Math.min(1, s.crew / s.need) : 1, st = { helm: cf, guns: cf, sensors: cf, engineering: cf, flight: cf }, ab = {}, sum = 0, n = 0, ms = 0;
    var up = upG(s);
    for (var i = 0; i < s.officers.length; i++) {
      var o = s.officers[i];
      o.comfort = o.comfort0 + up; o.limit = o.limit0 + up;
      o.effectiveness = officerEff(o); st[o.station] = o.effectiveness * cf; sum += st[o.station]; n++;
      if (!o.down) { if (o.ability && D.ABILITIES[o.ability]) ab[o.ability] = D.ABILITIES[o.ability]; if (o.strain > ms) ms = o.strain; }
    }
    s.st = st; s.ab = ab; s.eff = n ? sum / n : cf; s.strain = ms;
  }
  function stE(s, k) { return s.st ? s.st[k] : 1; }
  function hurtOfficer(w, s, o, amt, cause) {
    if (o.down || amt <= 0) return;
    var h0 = o.health; o.health = Math.max(0, h0 - amt); o.hurt += h0 - o.health;
    if (cause === 'g' || cause === 'strain') o.hurtG = (o.hurtG || 0) + h0 - o.health;
    if (cause === 'hit' || h0 >= 100 && o.health < 100 || Math.floor(h0 / 25) > Math.floor(o.health / 25) && o.health > 0)
      emit(w, { type: 'officerHurt', side: s.side, ship: s.id, officer: o.id, name: o.name, station: o.station, health: Math.round(o.health), cause: cause });
    if (o.health <= 0) {
      o.down = true; o.wentDown = true; o.strain = 0; o.downBy = cause;
      emit(w, { type: 'officerDown', side: s.side, ship: s.id, officer: o.id, name: o.name, station: o.station, cause: cause });
      emit(w, { type: 'ratingCovers', side: s.side, ship: s.id, station: o.station, eff: N.ratingEff });
    }
  }
  // the module a hit landed on, as the station it injures
  function stationOfHit(s, m) {
    if (m === s.sys.quarters) return 'helm';
    if (m === s.sys.sensors) return 'sensors';
    if (m === s.sys.reactor || m === s.sys.drive || m === s.sys.radiators || m === s.sys.tanks) return 'engineering';
    if (m.kind === 'bay') return 'flight';
    if (m.kind === 'rail' || m.kind === 'laser' || m.kind === 'rack' || m.kind === 'pdl' || m.kind === 'flak') return 'guns';
    return null;
  }
  function crewStep(w, s, g, dt) {
    var med = s.has.medbay && s.has.medbay.state < 2, up = upG(s);
    for (var i = 0; i < s.officers.length; i++) {
      var o = s.officers[i]; if (o.down) continue;
      o.comfort = o.comfort0 + up; o.limit = o.limit0 + up;
      if (g < N.recG) o.strain = Math.max(0, o.strain - N.strainRec * (med ? N.medRecMul : 1) * dt);
      else o.strain = Math.min(100, o.strain + strainRate(g - o.comfort) * dt);
      // spent: once at 100, and not again until the officer has rested back under crisisExit
      if (o.strain >= 100 && !o.spent) { o.spent = true; emit(w, { type: 'officerStrain', side: s.side, ship: s.id, officer: o.id, name: o.name, station: o.station }); }
      else if (o.spent && o.strain < N.crisisExit) o.spent = false;
      var over = g > o.limit, loss = hurtRate(o, g) + (o.strain >= 100 ? N.hurtStrain : 0);
      if (loss > 0) hurtOfficer(w, s, o, loss / 60 * dt, over ? 'g' : 'strain');
    }
    crewCache(s);
  }
  // per band, which officers would gain strain and which would be hurt, at the G this ship can really pull in it
  function bandHarm(w, side, shipId) {
    var s = w.idx[shipId]; if (!s || s.kind !== 'ship' || (side && s.side !== side) || !s.officers) return null;
    var gMax = maxAcc(s) / G, out = {};
    ['cruise', 'combat', 'brace', 'crash'].forEach(function (b) {
      var g = Math.min(N.gCap[b], gMax), r = { g: Math.round(g * 10) / 10, strain: [], hurt: [] };
      s.officers.forEach(function (o) {
        if (o.down) return;
        var sr = g < N.recG ? 0 : strainRate(g - o.comfort), hr = hurtRate(o, g);
        var who = { officer: o.id, name: o.name, station: o.station };
        if (sr > 0) r.strain.push({ officer: o.id, name: o.name, station: o.station, toFull: o.strain >= 100 ? 0 : Math.round((100 - o.strain) / sr) });
        if (hr > 0) { who.perMin = Math.round(hr * 10) / 10; who.cause = 'g'; r.hurt.push(who); }
        else if (sr > 0 && o.strain >= 100) { who.perMin = N.hurtStrain; who.cause = 'strain'; r.hurt.push(who); }
      });
      out[b] = r;
    });
    return out;
  }
  // end of battle: every officer's health and whether they went down
  function crewReport(w) {
    return w.ships.map(function (s) {
      return { ship: s.id, name: s.name, side: s.side, status: s.status, medbay: !!(s.has.medbay && s.has.medbay.state < 2),
        officers: (s.officers || []).map(function (o) {
          var r = { officer: o.id, name: o.name, station: o.station, origin: o.origin, ability: o.ability, story: o.story,
            health: Math.round(o.health), healthStart: Math.round(o.health0), hurt: Math.round(o.hurt), down: o.down, wentDown: o.wentDown };
          // a lost ship's officers: the story cast always reach the pods, hurt; the rest roll killed / down / fine, seeded from the battle seed
          if (s.status === 'destroyed') {
            var rng = crewRng(hashStr((w.seed || 0) ^ 0x0FA7E5ED, 'fate|' + s.id + '|' + o.name)), roll = o.story ? N.fateKilled : rng(), hp = 5 + Math.floor(rng() * 21);
            r.fate = roll < N.fateKilled ? 'killed' : roll < N.fateKilled + N.fateDown ? 'down' : 'fine';
            if (r.fate !== 'fine') { r.health = Math.min(r.health, r.fate === 'killed' ? 0 : hp); r.hurt = Math.max(r.hurt, r.healthStart - r.health); r.down = true; r.wentDown = true; }
          }
          return r; }) };
    });
  }
  // campaign hook, pure: what happens to an officer after the battle. opts { medbay, roll in [0,1) } or { medbay, seed }.
  // A lost ship's fate decides first (killed dies, down misses the next mission). Otherwise a downed officer misses the next mission; a non-story one dies with deathChance (deathChanceMed with a working medical bay).
  function aftermath(o, opts) {
    opts = opts || {};
    if (o.fate === 'killed') return { officer: o.officer || o.id, name: o.name, dies: true, missNext: false, status: 'dead', chance: 1 };
    if (o.fate === 'down') return { officer: o.officer || o.id, name: o.name, dies: false, missNext: true, status: 'wounded' };
    if (!o.down && !o.wentDown) return { officer: o.officer || o.id, name: o.name, dies: false, missNext: false, status: o.health < 100 ? 'wounded' : 'fit' };
    if (o.story) return { officer: o.officer || o.id, name: o.name, dies: false, missNext: true, status: 'wounded' };
    var p = opts.medbay ? N.deathChanceMed : N.deathChance;
    var roll = opts.roll != null ? opts.roll : crewRng(hashStr(opts.seed || 0, o.name || ''))();
    var dies = roll < p;
    return { officer: o.officer || o.id, name: o.name, dies: dies, missNext: !dies, status: dies ? 'dead' : 'wounded', chance: p };
  }

  // ---------------------------------------------------------------- damage
  // returns the points the hit really took off the ship (armour worn plus hull lost, no overkill), for the stats
  function damage(w, s, pts, type, face, by) {
    if (s.status === 'destroyed' || pts <= 0) return 0;
    if ((type === 'kin' || type === 'frag') && s.has.wardline && s.has.wardline.state < 2 && !s.wardDown) {
      s.ward -= pts * N.wardDrain; pts *= 1 - N.wardCut;
      if (s.ward <= 0) { s.ward = 0; s.wardDown = true; emit(w, { type: 'wardlineDown', side: s.side, ship: s.id }); }
    }
    if (type === 'frag' && s.has.magscreen && s.has.magscreen.state < 2) pts *= N.magFrag;
    if (type === 'kin') pts = thruPts(s, pts);
    var A = s.ar[face], mul = N.armourMul[s.ar.type][type], soak = pts * (1 - N.bleed), cost = soak * mul, hullD;
    if (A >= cost) { s.ar[face] = A - cost; hullD = pts * N.bleed; }
    else { var f = cost > 0 ? A / cost : 1; s.ar[face] = 0; hullD = pts * N.bleed + soak * (1 - f); }
    var took = (Math.min(A, cost) / (mul || 1)) + Math.min(hullD, Math.max(0, s.hp));
    if (w.hitLog) w.hitLog.push({ t: w.t, ship: s.id, by: by, key: w.hitKey, hull: Math.min(hullD, Math.max(0, s.hp)), took: took });   // sim.js only
    s.hp -= hullD; s.lastHit = w.t;
    // the shooting side sees its own hits land: the energy it put on the hull, filed on its track (hitPts) for the AI's
    // read of how hurt the target is. Not what got through the armour, which it cannot see.
    var hT = w.sides[enemyOf(s.side)].tracks[s.id]; if (hT) hT.hitPts = (hT.hitPts || 0) + pts;
    emit(w, { type: 'impact', side: s.side, ship: s.id, by: by, pts: Math.round(pts * 10) / 10, face: face });
    kill(w, s, hullD * N.crewPerPt / N.tough * s.crew0 * (s.has.medbay && s.has.medbay.state < 2 ? N.medCasMul : 1));
    if (type === 'laser') { s.lasAcc += hullD; while (s.lasAcc >= N.tough) { s.lasAcc -= N.tough; modRoll(w, s, N.tough, face, by); } }
    else modRoll(w, s, hullD, face, by);
    updStatus(w, s);
    return took;
  }
  // a solid slug with more energy than the structure along its path can take goes through: past thruK of the
  // ship's hull points, only thruF of the rest stays in the ship
  function thruPts(s, pts) { var c = N.thruK * s.hpMax; return pts > c ? c + (pts - c) * N.thruF : pts; }
  // exp: a lancer's precise beam on the outboard gear (radiators, sensors, PD and turrets) rather than through the hull
  function modRoll(w, s, hullD, face, by, exp) {
    if (rnd(w) > Math.min(0.95, exp ? exp : hullD * N.modHitPerPt / N.tough)) return;
    var opts = [], tot = 0;
    function add(m, wt) { if (m.state < 2 && wt > 0) { opts.push([m, wt]); tot += wt; } }
    if (exp) {
      s.mods.forEach(function (m) { add(m, m.slot === 'pd' || m.slot === 'turret' ? 1 : 0); });
      add(s.sys.sensors, 1); add(s.sys.radiators, s.radOut ? 3 : 1);
    } else s.mods.forEach(function (m) {
      var wt = face === 'nose' ? (m.slot === 'spinal' ? 3 : m.slot === 'turret' ? 2 : 1) : face === 'flank' ? (m.slot === 'turret' || m.slot === 'pd' || m.slot === 'bay' ? 2 : 1) : (m.slot === 'internal' ? 1 : 0.6);
      add(m, wt);
    });
    if (!exp) {
      add(s.sys.drive, face === 'tail' ? 6 : 0.3);
      add(s.sys.reactor, face === 'tail' ? 2 : 0.6);
      add(s.sys.sensors, face === 'nose' ? 2 : 0.6);
      add(s.sys.radiators, (face === 'flank' ? 2 : 1) * (s.radOut ? 3 : 0.5));
      add(s.sys.quarters, face === 'flank' ? 2 : 1);
      add(s.sys.tanks, face === 'tail' || face === 'flank' ? 2 : 0.5);
    }
    var r = rnd(w) * tot, pick = null;
    for (var i = 0; i < opts.length; i++) { r -= opts[i][1]; if (r <= 0) { pick = opts[i][0]; break; } }
    if (!pick) pick = opts.length ? opts[opts.length - 1][0] : null;
    if (!pick) return;
    var dead = pick.state === 1 || hullD > N.modKillPts * N.tough || rnd(w) < (exp ? 0.15 : 0.3);
    pick.state = dead ? 2 : 1; pick.dc = 0;
    if (by) { var sb = stat(w, by); sb.mods++; if (dead) sb.modsDead++; }
    if (pick === s.sys.quarters) kill(w, s, s.crew * (dead ? 0.25 : 0.1));
    if (pick === s.sys.tanks && dead) s.fuel *= 0.5;
    // the officer at the post that was hit takes a fixed injury (no draw, so the physics stream is untouched)
    var hs = stationOfHit(s, pick);
    if (hs && s.officers) s.officers.forEach(function (o) { if (o.station === hs) { hurtOfficer(w, s, o, N.hitHurt[pick.state], 'hit'); crewCache(s); } });
    if (pick.kind !== 'sys' && dead) {
      pick.q = []; if (pick.burst) closeJob(w, pick.burst); if (pick.pending) closeJob(w, pick.pending); pick.burst = null; pick.pending = null; pick.target = null;
      if (pick.service && pick.service.length) { pick.service = []; }
    }
    emit(w, { type: dead ? 'moduleDestroyed' : 'moduleDamaged', side: s.side, ship: s.id, module: pick.name });
    return pick;
  }
  // lancers and strikers still able to fight, aboard or out
  function wingStrength(w, s) {
    var n = s.stock.lancer + s.stock.striker;
    for (var i = 0; i < s.mods.length; i++) if (s.mods[i].kind === 'bay' && s.mods[i].state < 2) s.mods[i].service.forEach(function (j) { if (j.type === 'lancer' || j.type === 'striker') n++; });
    for (i = 0; i < w.drones.length; i++) { var d = w.drones[i]; if (d.mother === s.id && d.alive && (d.type === 'lancer' || (d.type === 'striker' && d.payload > 0))) n++; }
    return n;
  }
  function offensive(s, w) {
    for (var i = 0; i < s.mods.length; i++) {
      var m = s.mods[i]; if (m.state === 2) continue;
      if (m.kind === 'rail' && m.ammo > 0) return true;
      if (m.kind === 'laser' && s.sys.reactor.state < 2) return true;
      if (m.kind === 'rack' && m.load > 0) return true;
    }
    if (w) for (i = 0; i < w.drones.length; i++) { var d = w.drones[i]; if (d.mother === s.id && d.alive && (d.type === 'lancer' || (d.type === 'striker' && d.payload > 0))) return true; }
    if (w && s.mods.some(function (m) { return m.kind === 'bay' && m.state < 2; }) && wingStrength(w, s) > 0) return true;
    return false;
  }
  function updStatus(w, s) {
    if (s.status === 'destroyed' || s.status === 'captured') return;
    var old = s.status;
    if (s.hp <= 0) { s.hp = 0; s.status = 'destroyed'; emit(w, { type: 'destroyed', side: s.side, ship: s.id }); return; }
    var driveDead = s.sys.drive.state === 2, armed = false;
    for (var i = 0; i < s.mods.length; i++) { var m = s.mods[i]; if (m.state < 2 && (m.kind === 'rail' || m.kind === 'laser' || m.kind === 'rack' || m.kind === 'bay')) armed = true; }
    if (s.crew < 0.5 || (driveDead && !armed)) s.status = 'disabled';
    else if (driveDead) s.status = 'crippled';
    else s.status = 'ok';
    if (s.status !== old && (s.status === 'disabled' || s.status === 'crippled')) emit(w, { type: s.status, side: s.side, ship: s.id });
  }
  function capture(w, dt) {
    w.ships.forEach(function (s) {
      if (s.status !== 'disabled') { s.capT = 0; return; }
      var near = w.ships.some(function (o) { return o.side !== s.side && active(o) && hyp(o.x - s.x, o.y - s.y) < N.capRange && hyp(o.vx - s.vx, o.vy - s.vy) < N.capVel; });
      s.capT = near ? s.capT + dt : 0;
      if (s.capT >= N.capTime) { s.status = 'captured'; s.capturedBy = enemyOf(s.side); emit(w, { type: 'captured', side: s.side, ship: s.id }); }
    });
  }
  function capable(s, w) { return active(s) && !s.outT && offensive(s, w); }
  // a ship below the helm's reserve (dryDv) will not close; if no enemy able to fight is within dryReach and it
  // has nothing of its own still out, it is out of the battle: it withdraws while it has fleeDv to run on, or
  // else strikes its colours. Either way it no longer counts as able to fight.
  function dryCheck(w) {
    w.ships.forEach(function (s) {
      if (s.outT || !active(s) || dvLeft(s) >= N.dryDv) return;
      if (w.drones.some(function (d) { return d.alive && d.mother === s.id && d.mode !== 'return'; })) return;
      if (w.missiles.some(function (m) { return m.alive && m.from === s.id; })) return;
      var near = w.ships.some(function (o) { return o.side !== s.side && active(o) && !o.outT && offensive(o, w) && hyp(o.x - s.x, o.y - s.y) < N.dryReach; });
      if (near) return;
      // still on a course that brings it within reach of an able enemy before the battle's time runs out: it is
      // closing on its own momentum (or being closed on), so it is still in the fight
      var left = (w.scn.maxTime || N.maxTime) - w.t;
      if (w.ships.some(function (o) {
        if (o.side === s.side || !active(o) || o.outT || !offensive(o, w)) return false;
        var rx = o.x - s.x, ry = o.y - s.y, vx = o.vx - s.vx, vy = o.vy - s.vy, vv = vx * vx + vy * vy;
        var tca = vv > 0 ? -(rx * vx + ry * vy) / vv : -1;
        return tca > 0 && tca < left && hyp(rx + vx * tca, ry + vy * tca) < N.dryReach;
      })) return;
      // enemy missiles still coming at it: it is still fighting them off
      if (w.missiles.some(function (m) { if (!m.alive || m.side === s.side) return false; if (m.seek === s) return true; var tr = trackOf(w, m.side, m.tgt); return !!tr && tr.oid === s.id; })) return;
      s.outT = w.t; s.outWhy = dvLeft(s) >= N.fleeDv ? 'withdrew' : 'struck';
      emit(w, { type: s.outWhy, side: s.side, ship: s.id });
    });
  }
  function checkEnd(w) {
    if (w.over) return;
    var obj = w.scn.objective, live = { A: 0, B: 0 }, maxT = w.scn.maxTime || N.maxTime;
    if (w.nTick % 60 === 0) dryCheck(w);
    w.ships.forEach(function (s) { if (capable(s, w)) live[s.side]++; });
    // missiles still in flight keep a side in the fight while it has a ship left to fly
    w.missiles.forEach(function (m) { if (m.alive && w.ships.some(function (s) { return s.side === m.side && active(s); })) live[m.side] += 0.01; });
    // so do penetrators a missile has just let go (a strike's last seconds)
    w.slugs.forEach(function (p) { if (p.kind === 'pen' && live[p.side] < 0.01) live[p.side] += 0.01; });
    if (obj && obj.type === 'convoy') {
      var conv = w.ships.filter(function (s) { return s.side === obj.side && obj.loads.indexOf(s.load) >= 0 && active(s); });
      if (conv.some(function (s) { return s.x >= obj.lineX; })) return end(w, obj.side, 'convoy through');
      if (!conv.length) return end(w, enemyOf(obj.side), 'convoy stopped');
      if (!live[enemyOf(obj.side)]) return end(w, obj.side, 'raiders beaten');
      if (w.t >= maxT) return end(w, null, 'time');
      return;
    }
    if (!live.A && !live.B) return end(w, null, 'mutual');
    if (!live.A) return end(w, 'B', 'A out of the fight');
    if (!live.B) return end(w, 'A', 'B out of the fight');
    if (w.t >= maxT) return end(w, null, 'time');
    if (w.nTick % 60 === 0) {
      var minD = 1e15, opening = true;
      w.ships.forEach(function (a) { if (a.side !== 'A' || !capable(a, w)) return; w.ships.forEach(function (b) { if (b.side !== 'B' || !capable(b, w)) return;
        var rx = b.x - a.x, ry = b.y - a.y, d = hyp(rx, ry); minD = Math.min(minD, d); if (rx * (b.vx - a.vx) + ry * (b.vy - a.vy) < 0) opening = false; }); });
      if (minD > N.disengage && opening && !w.missiles.length && !w.drones.length) return end(w, null, 'disengaged');
    }
  }
  function end(w, winner, why) { (w.calM || []).forEach(function (m) { calAdd(w, m.wk, m.side, m.est, m.hitAny); }); w.calM = []; w.over = true; w.winner = winner; w.endReason = why; emit(w, { type: 'end', winner: winner, reason: why }); }

  // ---------------------------------------------------------------- sensors and light lag
  function coldRange(o, sen, w) {
    var base = o.kind === 'ship' ? N.coldShip : o.kind === 'missile' ? N.coldMissile : N.coldDrone;
    if (o.radOut) base *= N.radOutMul;
    // a quiet moon (planet quiet: km, Hush): a cold object inside that range of it is seen only quietK as far
    if (w) for (var q = 0; q < w.planets.length; q++) { var pq = w.planets[q]; if (pq.quiet && hyp(o.x - pq.x, o.y - pq.y) < pq.quiet) { base *= N.quietK; break; } }
    if (sen.kind === 'drone') return base * (sen.type === 'picket' ? N.picketMul : 1);
    var st = sen.sys.sensors.state;
    return base * N.sensorTier[sen.tiers.sensors] * (st === 0 ? 1 : st === 1 ? 0.6 : 0.25) * stE(sen, 'sensors') * (sen.ab && sen.ab.longEars ? sen.ab.longEars.range : 1);
  }
  // the sensor officer's effectiveness behind a sensor (a drone reports through its carrier's sensor station)
  function sensEff(w, sen) {
    var o = sen.kind === 'drone' ? w.idx[sen.mother] : sen;
    var e = o && o.st ? o.st.sensors : 1;
    return { e: Math.max(0.2, e), look: o && o.ab && o.ab.secondLook ? o.ab.secondLook.regain : 1 };
  }
  function resOf(sen) {
    if (sen.kind === 'drone') return sen.type === 'picket' ? N.picketRes : N.angRes[1];
    var st = sen.sys.sensors.state;
    return N.angRes[sen.tiers.sensors] * (st === 0 ? 1 : st === 1 ? 3 : 10) / Math.max(0.2, stE(sen, 'sensors')) * (sen.ab && sen.ab.fineRing ? sen.ab.fineRing.ring : 1);
  }
  var SENS = [];
  function sense(w, dt) {
    for (var si = 0; si < 2; si++) {
      var S = SIDES[si], side = w.sides[S], sens = SENS; sens.length = 0;
      for (var a = 0; a < w.ships.length; a++) if (w.ships[a].side === S && alive(w.ships[a]) && w.ships[a].status !== 'disabled') sens.push(w.ships[a]);
      for (a = 0; a < w.drones.length; a++) if (w.drones[a].side === S && alive(w.drones[a])) sens.push(w.drones[a]);
      var seen = {}, objs = [w.ships, w.drones, w.missiles];
      for (var oi = 0; oi < 3; oi++) {
        var L = objs[oi];
        for (var j = 0; j < L.length; j++) {
          var o = L[j];
          if (o.side === S || !alive(o)) continue;
          var bsig = 1e18, bd = 0, minD = 1e18, minS = 1e18, found = false, bsn = null;
          for (var k = 0; k < sens.length; k++) {
            var sn = sens[k], d = hyp(o.x - sn.x, o.y - sn.y);
            if (d < minD) minD = d;
            if (sn.kind === 'ship' && d < minS) minS = d;
            var sig = resOf(sn) * d; if (sig >= bsig) continue;
            if (d > (histAt(o, w.t - d / C).burn > 0 ? N.burnDetect : coldRange(o, sn, w))) continue;
            if (w.planets.length && blocked(w, sn.x, sn.y, o.x, o.y)) continue;
            // a drone's sighting reaches the fleet only after its report has crossed back: count that leg too
            var link = 0;
            if (sn.kind === 'drone') { var Mo = w.idx[sn.mother]; link = Mo && alive(Mo) ? hyp(Mo.x - sn.x, Mo.y - sn.y) : 0; }
            bsig = sig; bd = d + link; found = true; bsn = sn;
          }
          if (found) {
            observe(w, S, side, o, bd, bsig, dt, minD, bsn); seen[o.id] = 1;
            // a firm ship track inside identifyRange of one of our ships is identified: its officers become known
            var trI = side.tracks[o.id];
            if (o.kind === 'ship' && trI && trI.firm && !trI.identified && minS < N.identifyRange) { trI.identified = true; emit(w, { type: 'identified', side: S, contact: trI.id, ship: o.id }); }
          }
        }
      }
      for (var t = side.tl.length - 1; t >= 0; t--) {
        var tr = side.tl[t], ob = w.idx[tr.oid];
        if (!ob || !alive(ob) || w.t - tr.tObs > N.lostDrop) { side.tl.splice(t, 1); delete side.tracks[tr.oid]; continue; }
        // hysteresis: a firm track survives firmHold s of missed looks (a contact on the edge of detection, or
        // one whose drive flickers, would otherwise blink between firm and tentative)
        if (seen[tr.oid]) tr.unseen = 0;
        else { tr.unseen = (tr.unseen || 0) + dt; if (tr.firm && tr.unseen > N.firmHold) { tr.firm = false; if (tr.kind === 'ship') emit(w, { type: 'lost', side: S, contact: tr.id }); } }
        var age = w.t - tr.tObs;
        tr.age = age;
        // a lost contact most likely went cold (a burning drive shows across the battle): carry it on coasting, not still burning
        var ka = tr.firm ? 0.5 : 0;
        tr.ex = tr.x + tr.vx * age + ka * tr.ax * age * age; tr.ey = tr.y + tr.vy * age + ka * tr.ay * age * age; tr.ez = tr.z + tr.vz * age + ka * tr.az * age * age;
        tr.ring = tr.sig + 0.5 * tr.aMax * age * age;
      }
      if (side.newMissiles) { emit(w, { type: 'launch', side: S, n: side.newMissiles }); side.newMissiles = 0; }
    }
  }
  function observe(w, S, side, o, d, sig, dt, minD, sen) {
    var tr = side.tracks[o.id], tq = w.t - d / C, st = histAt(o, tq), isNew = !tr, gap = isNew ? 0 : tq - tr.tObs;
    if (isNew) {
      tr = side.tracks[o.id] = { id: S + (side.next++), oid: o.id, kind: o.kind, side: o.side, firm: true,
        x: st.x, y: st.y, z: st.z, vx: st.vx, vy: st.vy, vz: st.vz, ax: st.ax, ay: st.ay, az: st.az,
        vex: st.vx, vey: st.vy, vez: st.vz, aex: st.ax, aey: st.ay, aez: st.az, vj: 0, nx: 0, ny: 0, nz: 0, nvx: 0, nvy: 0, nvz: 0,
        tObs: tq, first: w.t, sig: sig, age: 0, ex: st.x, ey: st.y, ez: st.z, ring: sig };
      side.tl.push(tr);
    }
    // correlated position and velocity error, the same on every axis (z included)
    var rho = Math.exp(-Math.max(dt, gap, 0.5) / N.errCorr), q = Math.sqrt(1 - rho * rho), sv = sig / N.velBaseline;
    if (N.perfectSensors) { tr.nx = tr.ny = tr.nz = tr.nvx = tr.nvy = tr.nvz = 0; }
    else {
      tr.nx = tr.nx * rho + q * sig * gauss(w); tr.ny = tr.ny * rho + q * sig * gauss(w); tr.nz = tr.nz * rho + q * sig * gauss(w);
      tr.nvx = tr.nvx * rho + q * sv * gauss(w); tr.nvy = tr.nvy * rho + q * sv * gauss(w); tr.nvz = tr.nvz * rho + q * sv * gauss(w);
    }
    tr.x = st.x + tr.nx; tr.y = st.y + tr.ny; tr.z = st.z + tr.nz; tr.vx = st.vx + tr.nvx; tr.vy = st.vy + tr.nvy; tr.vz = st.vz + tr.nvz;
    tr.ax = st.ax; tr.ay = st.ay; tr.az = st.az;
    tr.tObs = tq; tr.sig = N.perfectSensors ? 0 : sig; tr.burning = st.burn > 0;
    // a lost track firms up again only after the sensor officer has had a steady look at it
    if (tr.firm) tr.regain = 0;
    else if (!sen) tr.firm = true;
    else { var se = sensEff(w, sen); tr.regain = (tr.regain || 0) + Math.max(dt, 0); if (tr.regain >= N.regainT / (se.e * se.look)) { tr.firm = true; tr.regain = 0; } }
    var k = Math.min(1, Math.max(dt, 0.5) / 30);
    // re-acquired after a spell unseen: what it did meanwhile is not a jink or a wander, so the smoothed state
    // starts again from this fix (left alone, the stale smoothed velocity took a minute to catch up)
    if (gap > N.reacqGap) {
      tr.vex = tr.vx; tr.vey = tr.vy; tr.vez = tr.vz; tr.aex = tr.ax; tr.aey = tr.ay; tr.aez = tr.az;
      tr.pax = null; if (tr.wt != null) { tr.wt = tq; tr.wsx = tr.vx; tr.wsy = tr.vy; tr.wsz = tr.vz; tr.wax = tr.ax; tr.way = tr.ay; tr.waz = tr.az; }
    }
    // the smoothed velocity is carried forward by the smoothed acceleration, so a steady burn does not read as a jink
    tr.vex += tr.aex * dt; tr.vey += tr.aey * dt; tr.vez += tr.aez * dt;
    tr.vex += (tr.vx - tr.vex) * k; tr.vey += (tr.vy - tr.vey) * k; tr.vez += (tr.vz - tr.vez) * k;
    tr.aex += (tr.ax - tr.aex) * k; tr.aey += (tr.ay - tr.aey) * k; tr.aez += (tr.az - tr.aez) * k;
    var jit = hyp3(tr.vx - tr.vex, tr.vy - tr.vey, tr.vz - tr.vez); tr.vj += (jit - tr.vj) * Math.min(1, Math.max(dt, 0.5) / 20);
    // jink activity: how fast the observed thrust keeps changing (a steady burn, or one turn-on, barely counts;
    // dodging changes it every few seconds). Read as the dodge velocity that would produce it (jinkK), with the
    // hardest recent dodge (fading over jinkMem) and how much of the recent time it was dodging.
    var dtt = Math.max(dt, 0.5), dA = tr.pax == null ? 0 : hyp3(tr.ax - tr.pax, tr.ay - tr.pay, tr.az - tr.paz);
    tr.pax = tr.ax; tr.pay = tr.ay; tr.paz = tr.az;
    tr.jr = (tr.jr || 0) + (dA / dtt - (tr.jr || 0)) * Math.min(1, dtt / 30);
    // how often it changes its burn at all: most rounds find a target just where its burn put it, a few find
    // it gone, so the gunnery's error is a mixture of the two (see mixOf)
    tr.bcr = (tr.bcr || 0) + ((dA > N.burnChg ? 1 / dtt : 0) - (tr.bcr || 0)) * Math.min(1, dtt / N.burnChgMem);
    var fade = Math.exp(-dtt / N.jinkMem), vjNow = N.jinkK * tr.jr;
    tr.vjPk = Math.max((tr.vjPk || 0) * fade, vjNow);
    tr.jf = (tr.jf || 0) * fade + (vjNow > 0.5 * tr.vjPk && vjNow > 1e-4 ? 1 - fade : 0);
    // how much its burn has been changing: the smoothed thrust against a slower average of it (a steady burn or a
    // long coast reads as nothing), the biggest recent change fading over manMem. The gunnery's manoeuvre term.
    var k2 = Math.min(1, dtt / N.manSlow);
    if (tr.asx == null) { tr.asx = tr.aex; tr.asy = tr.aey; }
    tr.asx += (tr.aex - tr.asx) * k2; tr.asy += (tr.aey - tr.asy) * k2;
    tr.aPk = Math.max((tr.aPk || 0) * Math.exp(-dtt / N.manMem), hyp(tr.aex - tr.asx, tr.aey - tr.asy));
    // wander: every wanderStep s the tracker checks how far the velocity has moved from what its last fix
    // predicted (that velocity carried on by the seen burn). Read as a velocity walk that persists for
    // wanderTau s, its scale is what a round's flight must allow for. Kept for the plane and out of it apart,
    // since a helm weaves in the plane far more than out of it.
    if (tr.wt == null) { tr.wt = tq; tr.wsx = tr.vx; tr.wsy = tr.vy; tr.wsz = tr.vz; tr.wax = tr.aex; tr.way = tr.aey; tr.waz = tr.aez; tr.wP = 0; tr.wZ = 0; }
    else if (tq - tr.wt >= N.wanderStep) {
      var wd = tq - tr.wt, we = accVel(wd), wf = 1 / wd, kv = Math.min(1, wd / N.wanderMem);
      var ix = tr.vx - tr.wsx - tr.wax * we, iy = tr.vy - tr.wsy - tr.way * we, iz = tr.vz - tr.wsz - tr.waz * we;
      tr.wP += ((ix * ix + iy * iy) / 2 * wf - tr.wP) * kv; tr.wZ += (iz * iz * wf - tr.wZ) * kv;
      tr.wt = tq; tr.wsx = tr.vx; tr.wsy = tr.vy; tr.wsz = tr.vz; tr.wax = tr.aex; tr.way = tr.aey; tr.waz = tr.aez;
    }
    if (o.kind === 'ship') { tr.cls = o.hull; tr.name = o.name; tr.aMax = Math.min(o.F / o.dryBase, N.gCap.brace * G); tr.aTop = o.F / o.dryBase; tr.r = o.r; tr.disabled = o.status === 'disabled'; tr.crippled = o.status === 'crippled'; }
    else if (o.kind === 'drone') {
      if (o.type === 'decoy' && !o.revealed && minD > N.decoyDiscrim && o.hp >= o.def.hp && o.dv > 0.5) {  // a decoy mimics a ship's drive: dry, it is plainly a dead drone
      tr.cls = o.spoof; tr.kind = 'ship'; tr.r = HULLS[o.spoof].r; tr.aMax = 5 * G; tr.name = 'Unknown ' + o.spoof; }
      else { if (o.type === 'decoy' && !o.revealed) { o.revealed = true; if (tr.kind === 'ship') emit(w, { type: 'decoyRevealed', side: S, contact: tr.id }); } tr.cls = o.type; tr.kind = 'drone'; tr.r = o.r; tr.aMax = o.acc; }
    } else { tr.cls = o.light ? 'light missile' : 'missile'; tr.aMax = o.acc; tr.r = o.r; }
    if (isNew) {
      if (o.kind === 'missile') side.newMissiles++;
      else emit(w, { type: 'contact', side: S, contact: tr.id, cls: tr.cls, kind: tr.kind });
    }
  }
  // what each own ship can see coming at it: known enemy rounds and tracked missiles
  function threats(w) {
    SIDES.forEach(function (S) {
      var th = w.sides[S].threats = {};
      w.ships.forEach(function (s) {
        if (s.side !== S || s.status === 'destroyed') return;
        var t = th[s.id] = { slugEta: 1e9, slugN: 0, missEta: 1e9, missN: 0, lasered: w.t - s.lasered < 10 ? s.laseredBy : null };
        for (var i = 0; i < w.slugs.length; i++) {
          var p = w.slugs[i]; if (p.side === S || p.known > w.t || p.kind === 'pen') continue;
          var rx = p.x - s.x, ry = p.y - s.y, ux = p.vx - s.vx, uy = p.vy - s.vy, uu = ux * ux + uy * uy;
          var tca = -(rx * ux + ry * uy) / uu; if (tca <= 0) continue;
          var mx = rx + ux * tca, my = ry + uy * tca;
          if (mx * mx + my * my < 400) { t.slugN++; if (tca < t.slugEta) t.slugEta = tca; }
        }
        var tl = w.sides[S].tl;
        for (i = 0; i < tl.length; i++) {
          var c = tl[i]; if (c.kind !== 'missile') continue;
          var dx = c.ex - s.x, dy = c.ey - s.y, d = hyp(dx, dy), cl = -(dx * (c.vx - s.vx) + dy * (c.vy - s.vy)) / d;
          if (cl <= 0) continue; var eta = d / cl;
          t.missN++; if (eta < t.missEta) t.missEta = eta;
        }
      });
    });
  }

  // ---------------------------------------------------------------- the gunnery computer
  function predictor(w, s, tr) {
    var tier = s.tiers ? s.tiers.gunnery : 1, rd = readOf(s);
    // a helm's burn is carried on for at most accHold s; out of the plane there is only jink noise (the helm holds
    // the plane), so no z acceleration is carried at all: extrapolating either over a long flight threw rounds wide
    return { x: tr.x, y: tr.y, z: tr.z, vx: tr.vx + (tr.vex - tr.vx) * rd, vy: tr.vy + (tr.vey - tr.vy) * rd, vz: tr.vz + (tr.vez - tr.vz) * rd,
      ax: tr.aex, ay: tr.aey, az: 0, age: w.t - tr.tObs };
  }
  function accPos(T) { var te = Math.min(T, N.accHold); return 0.5 * te * te + te * (T - te); }
  function accVel(T) { return Math.min(T, N.accHold); }
  // intercept of a round of speed u (relative to the shooter) with the contact's predicted track, in 3D
  function solve(w, s, tr, u) {
    var P = predictor(w, s, tr), t = hyp3(P.x - s.x, P.y - s.y, P.z - s.z) / u, px, py, pz, ok = false;
    for (var it = 0; it < 30; it++) {
      var T = P.age + t;
      var kp = accPos(T); px = P.x + P.vx * T + P.ax * kp; py = P.y + P.vy * T + P.ay * kp; pz = P.z + P.vz * T + P.az * kp;
      var nt = hyp3(px - s.x - s.vx * t, py - s.y - s.vy * t, pz - s.z - s.vz * t) / u;
      if (Math.abs(nt - t) < 1e-4 * Math.max(1, t)) { t = nt; ok = true; break; }
      t = nt;
      if (t > 3e4) break;
    }
    if (!ok) return null;
    var T2 = P.age + t;
    var kp2 = accPos(T2), kv2 = accVel(T2); px = P.x + P.vx * T2 + P.ax * kp2; py = P.y + P.vy * T2 + P.ay * kp2; pz = P.z + P.vz * T2 + P.az * kp2;
    var dx = px - s.x - s.vx * t, dy = py - s.y - s.vy * t, dz = pz - s.z - s.vz * t, L = hyp3(dx, dy, dz);
    return { t: t, T: T2, px: px, py: py, pz: pz, dx: dx / L, dy: dy / L, dz: dz / L, L: L, range: hyp(px - s.x, py - s.y),
      tvx: P.vx + P.ax * kv2, tvy: P.vy + P.ay * kv2, tvz: P.vz + P.az * kv2 };
  }
  // beam damage by range: full inside focus, then the spot spreads (intensity ~ 1/r^2); armour sheds heat below an
  // ablation threshold (laserThr of the focused intensity), so only the excess over it does harm
  function smearF(dv, range) { return 1 / (1 + dv * (2 * range / C + N.beamLag) / N.laserDwell); }
  function laserFall(def, range) {
    if (range <= def.focus) return 1;
    var I = sqr(def.focus / range); return I <= N.laserThr ? 0 : (I - N.laserThr) / (1 - N.laserThr);
  }
  // the gunnery computer's read of how hard this target dodges: what it is doing now, or what it did lately
  // (the hardest recent dodge, weighted by how often it has been dodging), whichever is more
  function jinkEst(tr) { return Math.max(N.jinkK * (tr.jr || 0), (tr.vjPk || 0) * (0.4 + 0.6 * Math.min(1, 2 * (tr.jf || 0)))); }
  // one-axis spread at the target (the same across the line of fire and out of the plane)
  // the chance the target changes its burn in a flight of T s: the weight of the wide part of the mixture
  // A ship with fuel that sees the launch flash can also dodge the round itself: the longer the flight, the likelier
  function mixOf(tr, T) {
    if (!N.gunMix) return 0;
    var see = tr.kind === 'ship' && !tr.disabled ? 1 - Math.exp(-Math.max(0, T - N.dodgeLead) / N.dodgeT) : 0;
    // a target that is burning, or has lately changed its burn, will change it again within most flights: its
    // helm is flying a profile (closing, braking, station-keeping), not holding one thrust for minutes
    var bm = manAcc(tr) > 0 ? 1 - Math.exp(-T / N.burnT) : 0;
    return Math.min(1, Math.max(N.mixFloor, see, bm, 1 - Math.exp(-N.bcrK * (tr.bcr || 0) * T)));
  }
  // how hard the target can be expected to manoeuvre off its predicted path (km/s^2): its recent burn changes,
  // and a share (burnK) of the burn it is making now, which the predictor carries for accHold s only
  function manAcc(tr) {
    if (tr.kind !== 'ship' && tr.kind !== 'drone') return 0;
    var a = Math.max(0, (tr.aPk || 0) - N.manFloor), b = hyp(tr.aex || 0, tr.aey || 0);
    return hyp(a, b > N.burnSeen ? N.burnK * b : 0);
  }
  var SPP = null;
  function spreadOf(w, s, tr, sol, vjMin, ownAim, up, steady) {
    if (!N.gunMix) steady = false;
    var T = sol.T, tier = s.tiers ? s.tiers.gunnery : 1;
    var sp = tr.sig, sv = tr.sig / N.velBaseline * T;
    var ev = steady ? 0 : (!N.gunMix ? 1 : tr.kind === 'ship' ? N.gunEvK : N.smallEvK) * Math.max(jinkEst(tr), vjMin || 0) * T / Math.sqrt(1 + T / N.evSegEst) * (1 - 0.5 * readOf(s));
    var aim = N.aimErr * sol.range * crewAim(s) * aimMul(s), own = (ownAim || 0) * sol.L * aimMul(s);
    // a ship under helm control can change its burn while the round is in flight: the more its burn has been
    // changing lately (aPk), the further it can be from where its present burn puts it
    // (the term grows with the whole flight squared: a burn the helm changes after accHold s still moves it)
    var man = steady ? 0 : N.gunMix ? N.gunManK * manAcc(tr) * 0.5 * T * T : N.manK * Math.max(0, (tr.aPk || 0) - N.manFloor) * accPos(T);
    var wd = steady || !N.gunMix ? 0 : N.gunWandK * wanderOf(tr, T, up) / Math.sqrt(mixOf(tr, T));
    // a ship that sees the round coming can burn off its path: in the manoeuvring case allow for a share (capK)
    // of its drive over the flight after it sees the launch (dodgeLead s)
    var cap = steady || !N.gunMix || tr.kind !== 'ship' || tr.disabled ? 0 : N.capK * N.capA * Math.pow((tr.aMax || 0) / N.capA, N.capExp) * 0.5 * sqr(Math.max(0, T - N.capLead));
    if (!steady) { var pp = { sp: sp, sv: sv, ev: ev, aim: aim, own: own, man: man, wd: wd, cap: cap, aPk: tr.aPk || 0, A: hyp(tr.aex || 0, tr.aey || 0), bcr: tr.bcr || 0, T: T }; if (up) SPP.wdU = wd; else SPP = pp; }
    return Math.sqrt(sp * sp + sv * sv + ev * ev + aim * aim + own * own + man * man + wd * wd + cap * cap);
  }
  // position error from wander: the velocity error walks (variance q per s, q read by the tracker) for up to
  // wanderTau s and then holds; its integral over the flight is the extra miss
  function wanderOf(tr, T, up) {
    var q = up ? (tr.wZ || 0) : (tr.wP || 0), c = N.wanderTau, v;
    if (T <= c) v = q * T * T * T / 3; else { var e = T - c; v = q * (c * c * c / 3 + c * c * e + c * e * e); }
    return N.wanderK * Math.sqrt(v);
  }
  function laserChance(tr, sol, rr, sg, s0, rd) {
    // the predictor leans the velocity toward the smoothed one by the gunnery's read (rd): right against a jink, but
    // after a hard burn ends (a striker braking dry) the smoothed velocity lags, and the spot lands that far behind
    var bl = (rd || 0) * hyp3(tr.vx - (tr.vex != null ? tr.vex : tr.vx), tr.vy - (tr.vey != null ? tr.vey : tr.vy), tr.vz - (tr.vez != null ? tr.vez : tr.vz)) * sol.T;
    bl *= N.lasLagK * Math.max(0, 1 - 2 * (tr.jf || 0));   // a target that keeps jinking: the lean is what cancels the jink
    if (bl > 0) { sg = hyp(sg, bl); s0 = hyp(s0, bl); }
    // the beam hits when the spot lands within rr of the target in all three axes: the chance a 3-D normal error
    // of sd q per axis falls inside a sphere of radius rr
    // a burning target (a homing missile, a drone on its run, a ship at helm) changes its burn faster than the track
    // can follow: allow lasAccK of its burn or its recent burn change over the track's age, for any kind of target
    // (a coasting target that burns in short pulses between looks: as likely as its burn-change rate over that age)
    var aN = hyp(tr.burning ? N.lasBurnK * hyp(tr.aex || 0, tr.aey || 0) : 0, tr.aPk || 0), pm = mixOf(tr, sol.T);
    if (aN > N.burnSeen) { sg = hyp(hyp(sg, N.lasAccK * aN * 0.5 * sol.T * sol.T), N.lasVK * (tr.aPk || 0) * sol.T); pm = tr.burning || (tr.aPk || 0) > N.lasPk ? 1 : Math.max(pm, 1 - Math.exp(-(tr.bcr || 0) * sol.T)); }
    // a jinking target pulls up to its band cap in a fresh direction every few seconds (out of the plane too): the
    // spot misses by what that pull moves it over the beam's lag, read from its dodge velocity (jink accel ~ vj / evTau)
    var aJ = tr.kind === 'ship' && !tr.disabled ? jinkEst(tr) / N.evTau : 0;
    if (aJ > N.burnSeen) { sg = hyp(sg, N.lasJK * aJ * 0.5 * sol.T * sol.T); pm = Math.max(pm, Math.min(1, (tr.jf || 0) * 2)); }
    var f = function (q) { if (q < 1e-9) return 1; var k = rr / q; return Math.max(0, erf(k / Math.SQRT2) - Math.sqrt(2 / PI) * k * Math.exp(-k * k / 2)); };
    return (1 - pm) * f(s0) + pm * f(sg);
  }
  function pInterval(a, b, sig) { if (sig < 1e-12) return (a <= 0 && b >= 0) ? 1 : 0; return 0.5 * (erf(b / (sig * Math.SQRT2)) - erf(a / (sig * Math.SQRT2))); }
  // chance a set of offsets on one axis covers the error, as the union of [o - r, o + r]; exp = expected count
  function axisChance(offs, r, sig) {
    var iv = offs.map(function (o) { return [o - r, o + r]; }).sort(function (a, b) { return a[0] - b[0]; });
    var any = 0, exp = 0, cur = null;
    iv.forEach(function (x) {
      exp += pInterval(x[0], x[1], sig);
      if (!cur) cur = x.slice(); else if (x[0] <= cur[1]) cur[1] = Math.max(cur[1], x[1]); else { any += pInterval(cur[0], cur[1], sig); cur = x.slice(); }
    });
    if (cur) any += pInterval(cur[0], cur[1], sig);
    return { any: any, exp: exp };
  }
  // A salvo is a grid across (lat) and out of the plane (up). The target disc is treated as a box r across by
  // r*pi/4 up (half-widths; the same area), so the chance is the product of the two one-axis chances.
  function gridAxes(n) { var nl = Math.max(1, Math.round(Math.sqrt(n))), nu = Math.max(1, Math.floor(n / nl)); return [nl, nu]; }
  function axisOffs(k, r, sig) {
    // spread the rounds to cover the error, but never wider than needed; with a tight solution all aim at the centre
    var sp = Math.min(3 * sig / Math.max(1, k), 2.2 * sig), o = [];
    if (sp < 1.6 * r) sp = sig < 0.4 * r ? 0 : 1.6 * r; for (var i = 0; i < k; i++) o.push((i - (k - 1) / 2) * sp); return o; }
  function patternChance(lat, up, r, sigL, sigU) {
    var a = axisChance(lat, r, sigL), b = axisChance(up, r * PI / 4, sigU);
    return { any: a.any * b.any, exp: a.exp * b.exp, lat: a.any, up: b.any };
  }
  function gridOffsets(lat, up) { var o = []; lat.forEach(function (l) { up.forEach(function (u) { o.push([l, u]); }); }); return o; }
  // ---- canister
  // a canister's cloud: n fragments spread evenly over a square +-R (across and up) centred (ol, ou) from where the
  // target is expected; the target's error is normal (sx across, sy up). Inside the square the target's outline
  // (r across, r*pi/4 up) meets lam = n x outline / cloud area fragments on average: (r/R)^2 falls off fast with R
  function canChance(R, n, r, ol, ou, sx, sy) {
    var rU = r * PI / 4, hx = Math.max(R, r), hy = Math.max(R, rU);
    var pin = pInterval(ol - hx, ol + hx, sx) * pInterval(ou - hy, ou + hy, sy), lam = n * Math.min(1, r / R) * Math.min(1, rU / R);
    return { any: pin * (1 - Math.exp(-lam)), exp: pin * lam, lam: lam };
  }
  // one-axis spread of a ship's place after t s of a Hard jink in band b (top acceleration aTop): the same
  // random-walk model the threat preview uses; 'off' = no jink
  function bandSig(aTop, b, t) {
    if (b === 'off' || !N.gCap[b]) return 0;
    var vj = N.evVel.hard * Math.min(aTop, N.gCap[b] * G) * Math.SQRT1_2, te = Math.max(0, t - N.evTau / 2);
    return vj * te / Math.sqrt(1 + te / N.tpSeg);
  }
  // the band a track's jink reads as (the track shows about canRead of the band's jink)
  function readBand(tr) {
    if (tr.kind !== 'ship' || tr.disabled) return 'off';
    // a ship seen holding steady is still assumed to jink at Combat once it sees the round (the band a helm
    // dodges in unless told otherwise)
    var g = jinkEst(tr) / (N.canRead * N.evVel.hard * G);
    return g <= N.gCap.combat * 1.15 ? 'combat' : g <= N.gCap.brace * 1.15 ? 'brace' : 'crash';
  }
  // the gunner picks the cloud size (a few multiples of the error, never under canMinR target radii) that most
  // likely puts a fragment on the hull; the round holds canN fragments whatever the size, so a wider cloud is a
  // thinner one: expected fragments on the hull fall as (r/R)^2
  // The error is a mixture: (1 - pm) of the time the target keeps its burn (spread a), pm of the time it changes
  // it (spread b); the cloud is sized against the error the target most likely has
  function canDesign(r, T, a, b, pm) {
    var best = null, e = Math.max(a[0], a[1]) * (1 - pm) + Math.max(b[0], b[1]) * pm;
    for (var k = 0.5; k <= 2.5; k += 0.5) {
      var R = Math.max(N.canMinR * r, k * e), n = N.canN;
      var ca = canChance(R, n, r, 0, 0, a[0], a[1]), cb = canChance(R, n, r, 0, 0, b[0], b[1]);
      var c = { any: (1 - pm) * ca.any + pm * cb.any, exp: (1 - pm) * ca.exp + pm * cb.exp };
      if (!best || c.any > best.c.any + 1e-9) best = { R: R, n: n, c: c };
    }
    best.lead = Math.max(Math.min(N.canLeadMin, T / 2), Math.min(best.R / N.canV, T - 1));
    return best;
  }
  // hitEstimate(w, shooterId, weaponId, contactId, {n, ammo}) -> what the gunnery computer believes
  function hitEstimate(w, shooterId, weaponId, cid, opt) {
    opt = opt || {};
    var s = typeof shooterId === 'object' ? shooterId : w.idx[shooterId], m = s && modOf(s, weaponId), tr = s && trackOf(w, s.side, cid);
    if (!s || !m || !tr) return null;
    var r = tr.r || 0.06, out;
    if (m.kind === 'rail') {
      var sol = solve(w, s, tr, m.def.muzzle); if (!sol) return { ok: false, chance: 0 };
      // two cases: the target holds its burn (the error is sensing and aim only), or it changes it (pm of the time)
      var ja = opt.steady ? 0 : jinkAim(s, m), pm = mixOf(tr, sol.T), lat, up, pc;
      var sig = spreadOf(w, s, tr, sol, opt.vj, ja), sigU = spreadOf(w, s, tr, sol, opt.vj, ja, true), spp = SPP;
      var s0 = spreadOf(w, s, tr, sol, 0, ja, false, true), s0U = spreadOf(w, s, tr, sol, 0, ja, true, true);
      var mix = function (la, ua) { var a = patternChance(la, ua, r, s0, s0U), b = patternChance(la, ua, r, sig, sigU); return { any: (1 - pm) * a.any + pm * b.any, exp: (1 - pm) * a.exp + pm * b.exp }; };
      if (opt.ammo === 'canister') {
        // the cloud is sized to the dodge the gunner reads from the track: that band's jink over the flight, on top
        // of the steady error; the quote is the chance at least one fragment lands if the target keeps that band
        var rb = opt.band || readBand(tr), sb = tr.kind === 'ship' && !tr.disabled ? bandSig(tr.aTop || tr.aMax || 0, rb, sol.T) : 0;
        // the target's own burn changes (pm of the time) still count; only the jink part of the error is replaced
        var evL = spp ? spp.ev : 0, mL = Math.sqrt(Math.max(0, sig * sig - evL * evL)), mU = Math.sqrt(Math.max(0, sigU * sigU - evL * evL));
        var cd = canDesign(r, sol.T, [hyp(sb, s0), hyp(sb, s0U)], [hyp(sb, mL), hyp(sb, mU)], pm);
        pc = cd.c; out = { canR: cd.R, canN: cd.n, canLead: cd.lead, band: rb, offsets: [[0, 0]], fragPts: 0.5 * m.def.kg / cd.n * sqr(relSpeed(s, sol, m.def.muzzle)) / 1000 * N.fragK };
      } else {
        var ga = m.def.spinal ? [1, 1] : gridAxes(opt.n || 1);
        // the pattern: of a few spacings (all on the centre, touching, or opened to the wide error) the one most likely to hit
        var bestP = null;
        if (!N.gunMix) { lat = axisOffs(ga[0], r, sig); up = axisOffs(ga[1], r * PI / 4, sig); bestP = mix(lat, up); }
        else [0, 1, 1.6, 2.6].map(function (f) { return [f * r, f * r * PI / 4]; }).concat([[0.5 * sig, 0.5 * sigU], [sig, sigU], [2 * sig / ga[0], 2 * sigU / ga[1]]]).forEach(function (sp) {
          var la = [], ua = [], i2;
          for (i2 = 0; i2 < ga[0]; i2++) la.push((i2 - (ga[0] - 1) / 2) * sp[0]);
          for (i2 = 0; i2 < ga[1]; i2++) ua.push((i2 - (ga[1] - 1) / 2) * sp[1]);
          var c2 = mix(la, ua); if (!bestP || c2.any > bestP.any + 1e-9) { bestP = c2; lat = la; up = ua; }
        });
        pc = bestP; out = { offsets: gridOffsets(lat, up) };
      }
      out.ok = true; out.chance = pc.any; out.expHits = pc.exp; out.spread = sig; out.spreadUp = sigU; out.pm = pm; out.s0 = s0; out.parts = spp; out.tT = sol.T; out.radius = r; out.rounds = out.offsets.length;
      // the shooter's own dodge: a spinal will not fire at Hard; steadyChance is the chance if the helm held steady
      out.jink = s.ctl.ev || 'off';
      if (m.def.spinal && out.jink === 'hard' && !opt.steady) { out.blocked = 'jink'; out.chance = 0; out.expHits = 0; }
      if (!opt.steady) { var st = ja > 0 || out.blocked ? hitEstimate(w, s, m.id, cid, { n: opt.n, ammo: opt.ammo, vj: opt.vj, steady: true }) : out; out.steadyChance = st && st.ok ? st.chance : 0; }
      out.ix = sol.px; out.iy = sol.py; out.iz = sol.pz; out.tti = sol.t; out.range = sol.range; out.dir = { x: sol.dx, y: sol.dy, z: sol.dz };
      out.slugPts = 0.5 * m.def.kg * sqr(relSpeed(s, sol, m.def.muzzle)) / 1000;
      return out;
    }
    if (m.kind === 'laser') {
      var sl = solve(w, s, tr, C); if (!sl) return { ok: false, chance: 0 };
      var sg = spreadOf(w, s, tr, sl, opt.vj), spot = sl.range * N.laserDiv, rr = r + spot;
      var fall = laserFall(m.def, sl.range) * smearF(jinkEst(tr), sl.range);
      return { ok: true, chance: laserChance(tr, sl, rr, sg, spreadOf(w, s, tr, sl, 0, 0, false, true), readOf(s)), spread: sg, radius: r, ix: sl.px, iy: sl.py, iz: sl.pz, tti: sl.t, range: sl.range, dmgFactor: fall, dps: m.def.dps * fall };
    }
    if (m.kind === 'rack') {
      var sm = solve(w, s, tr, N.mBoostDv); if (!sm) return { ok: false, chance: 0 };
      return { ok: true, chance: sm.t < N.mMaxLife * 0.8 ? 0.6 : 0, ix: sm.px, iy: sm.py, iz: sm.pz, tti: sm.t, range: sm.range, spread: tr.ring };
    }
    return null;
  }
  // rateAt(s, T, R): points a second ship s expects to put on ship T held R km away, from the same models the
  // gunnery quotes with (no live track: a steady target that dodges at Combat when it sees a round, Hard against
  // a ship with rails, Light under lasers alone). Each rail takes the better of a canister and a solid round and
  // only counts when the gunner would fire it (canMinHits fragments, or the doctrine's 3% for a solid); lasers
  // lose intensity past focus (laserThr) and smear on the dodge. Armour sheds by type. PD only shoots small craft.
  function rateAt(s, T, R) {
    var r = T.r || 0.06, aT = Math.min(maxAcc(T), N.gCap.combat * G), sig = (N.angRes[s.tiers.sensors] || 2e-6) * R, aim = N.aimErr * R * crewAim(s) * aimMul(s);
    var am = N.armourMul[(T.ar && T.ar.type) || 'composite'], rails = false, out = 0, i, m;
    for (i = 0; i < s.mods.length; i++) if (s.mods[i].kind === 'rail' && s.mods[i].state < 2 && s.mods[i].ammo > 0) rails = true;
    for (i = 0; i < s.mods.length; i++) {
      m = s.mods[i]; if (m.state === 2) continue;
      var k = m.state === 1 ? 0.5 : 1;
      if (m.kind === 'rail' && m.ammo > 0) {
        var u = m.def.muzzle, Tf = R / u, s0 = hyp3(sig, sig / N.velBaseline * Tf, aim);
        var see = 1 - Math.exp(-Math.max(0, Tf - N.dodgeLead) / N.dodgeT), pm = Math.max(N.mixFloor, see);
        var cap = N.capK * N.capA * Math.pow(Math.max(maxAcc(T), 1e-9) / N.capA, N.capExp) * 0.5 * sqr(Math.max(0, Tf - N.capLead));
        var sb = bandSig(aT, 'combat', Tf), cd = canDesign(r, Tf, [hyp(sb, s0), hyp(sb, s0)], [hyp3(sb, s0, cap), hyp3(sb, s0, cap)], pm);
        var e = 0.5 * m.def.kg * u * u / 1000, can = cd.c.exp >= N.canMinHits ? cd.c.exp * e / cd.n * N.fragK / am.frag : 0;
        var vj = N.evVel.hard * aT * Math.SQRT1_2, ev = N.gunEvK * vj * Tf / Math.sqrt(1 + Tf / N.evSegEst) * (1 - 0.5 * readOf(s)), sw = hyp3(s0, hyp(ev, sb), cap);
        var pS = pInterval(-r, r, sw) * pInterval(-r * PI / 4, r * PI / 4, sw);   // a round in flight is dodged: the jink is always in the spread
        var sol = pS >= 0.03 ? pS * thruPts(T, e * N.kinPts) / am.kin : 0;
        out += k * Math.max(can, sol) / m.def.cycle;
      } else if (m.kind === 'laser') {
        var vl = (rails ? N.evVel.hard : N.evVel.light) * aT, tl = 2 * R / C + N.beamLag;
        var q = hyp(sig, N.lasJK * vl / N.evTau * 0.5 * tl * tl), kk = (r + R * N.laserDiv) / Math.max(q, 1e-9);
        var pl = Math.max(0, erf(kk / Math.SQRT2) - Math.sqrt(2 / PI) * kk * Math.exp(-kk * kk / 2));
        out += k * m.def.dps * laserFall(m.def, R) * smearF(vl, R) * pl / am.laser;
      }
    }
    return out * (1 - N.bleed);
  }
  function relSpeed(s, sol, u) { return hyp3(s.vx + sol.dx * u - sol.tvx, s.vy + sol.dy * u - sol.tvy, s.vz + sol.dz * u - sol.tvz); }

  // ---------------------------------------------------------------- orders
  // order(w, shipId, o). Standing: man {type: close|hold|break|match|cold|manual|coast, target, range, dv}, gLimit, evasion, radiators.
  // One-shot: fireNow {weapon, target, n, ammo}, laser {weapon|'all', target|null}, launch {target, n},
  // drones {type, n} (launch from bays), wing {type, mode, target, point} (light-lagged), sand {target}.
  function order(w, id, o) {
    var s = w.idx[id]; if (!s || s.kind !== 'ship') return false;
    ['man', 'gLimit', 'evasion', 'radiators'].forEach(function (k) { if (o[k] !== undefined) s.orders[k] = o[k]; });
    if (o.fireNow) fire(w, s, o.fireNow.weapon, o.fireNow);
    if (o.laser) s.mods.forEach(function (m) { if (m.kind === 'laser' && (o.laser.weapon === 'all' || o.laser.weapon === m.id || o.laser.weapon == null)) m.target = o.laser.target || null; });
    if (o.launch) {
      var left = o.launch.n || 1, racks = s.mods.filter(function (m) { return m.kind === 'rack' && m.state < 2; });
      for (var guard = 0; left > 0 && guard < 50; guard++) { var any = false; racks.forEach(function (m) { if (left > 0 && m.load > m.q.length) { m.q.push({ target: o.launch.target }); left--; any = true; } }); if (!any) break; }
    }
    if (o.wing) wingOrder(w, s, o.wing.type, o.wing);
    if (o.drones) {
      var bays = s.mods.filter(function (m) { return m.kind === 'bay' && m.state < 2; }), nd = Math.min(o.drones.n || 1, s.stock[o.drones.type] - queued(s, o.drones.type));
      for (var i = 0; i < nd && bays.length; i++) { bays.sort(function (a, b) { return a.q.length - b.q.length; }); bays[0].q.push(o.drones.type); }
    }
    if (o.sand) sand(w, s, o.sand.target);
    return true;
  }
  function queued(s, type) { var n = 0; s.mods.forEach(function (m) { if (m.kind === 'bay') m.q.forEach(function (t) { if (t === type) n++; }); }); return n; }
  function fire(w, s, wid, o) {
    s = typeof s === 'object' ? s : w.idx[s];
    var m = modOf(s, wid); if (!m || s.outT || m.state === 2 || m.kind !== 'rail' || m.ammo <= 0 || m.burst || m.pending) return false;
    var est = hitEstimate(w, s, m.id, o.target, { n: m.def.spinal ? 1 : (o.n || 1), ammo: o.ammo, vj: o.vj }); if (!est || !est.ok) return false;
    var tr = trackOf(w, s.side, o.target);
    var job = { target: o.target, tobj: tr.oid, ammo: o.ammo || 'slug', canR: est.canR, canN: est.canN, canLead: est.canLead, sol: solve(w, s, tr, m.def.muzzle), offs: est.offsets, i: 0, est: est.chance, e: w.calTrace ? { sig: est.spread, sigU: est.spreadUp, r: est.radius, pm: est.pm, s0: est.s0, A: hyp(tr.aex, tr.aey), parts: est.parts, offs: est.offsets, aMax: tr.aMax, kind: tr.kind, dis: tr.disabled, T: est.tT, manA: manAcc(tr), aPk: tr.aPk, bcr: tr.bcr, wP: tr.wP, burn: tr.burning } : null };
    if (m.def.spinal) { job.until = w.t + N.pendingLife; m.pending = job; } else m.burst = job;
    return true;
  }
  function sand(w, s, cid) {
    var m = s.has.sandcaster; if (!m || m.state === 2 || !(m.charges > 0)) return false;
    var tr = trackOf(w, s.side, cid); if (!tr) return false;
    var dx = tr.ex - s.x, dy = tr.ey - s.y, l = hyp(dx, dy) || 1; dx /= l; dy /= l;
    m.charges--;
    w.clouds.push({ x: s.x + dx * N.sandDist, y: s.y + dy * N.sandDist, vx: s.vx + dx * N.sandVel, vy: s.vy + dy * N.sandVel, r: N.sandR0, dens: 1, t0: w.t, side: s.side });
    emit(w, { type: 'sand', side: s.side, ship: s.id });
    return true;
  }


  // ---------------------------------------------------------------- threat preview: what is coming at one ship
  // threatPreview(w, side, shipId) -> [{ id, kind, eta, hit: { off, cruise, combat, brace, crash }, n, src }]
  // Only what that side can see: known rounds (from their launch light) and its own tracks of missiles and strikers.
  // hit[band] is the chance the threat hits if the helm dodges Hard within that G cap from now on, given the
  // ship's turn rate (in-plane dodges need the nose brought round; out of the plane is free), the fuel above the
  // evasion floor and the time left. off = no dodge. Point defence is not counted: these are the odds it gets through.
  var TPB = ['cruise', 'combat', 'brace', 'crash'];
  function tpDodge(s) {
    var out = {}, aMax = maxAcc(s), dvA = Math.max(0, dvLeft(s) - N.reserveDv * 0.5);
    var latEff = Math.min(1, (s.omega || 0) * N.evSegEst / (PI / 2));
    TPB.forEach(function (b) {
      var a = Math.min(aMax, N.gCap[b] * G), J = N.evVel.hard * a;
      // a jink is redrawn every evSegEst s, and each redraw changes the velocity by about 4/pi J: fuel at 0.32 J/s
      out[b] = { vj: J * Math.SQRT1_2, tFuel: J > 0 ? dvA / (0.32 * J) : 0, latEff: latEff, J: J };
    });
    return out;
  }
  // one-axis spread of the ship's position after t s of dodging (the gunnery computer's own random-walk model)
  function tpSig(D, t) { var te = Math.min(Math.max(0, t - N.evTau / 2), D.tFuel); return D.vj * te / Math.sqrt(1 + te / N.tpSeg); }
  // a homing warhead follows the dodge; only what changes inside its last split window is not followed
  function tpEnd(D, tw) { if (D.tFuel <= 0) return 0; return D.vj * 0.5 * (4 / PI / N.evTau) * tw * tw * Math.sqrt(Math.min(1, tw / N.evSegEst)); }
  // a late break: a burn flat out across the missile's line from lbT s out; the seeker sees it late and the
  // penetrators split before it ends, so the ship ends lbK s^2 x its acceleration from the aim point, in a
  // direction the helm drew at random (the mean over the circle)
  function tpBreak(D, per) {
    if (D.tFuel <= 0) return per(0, 0);
    var d = N.lbK * D.J / N.evVel.hard, sum = 0;
    for (var k = 0; k < 16; k++) { var a = (k + 0.5) * PI / 8; sum += per(d * Math.cos(a), d * Math.sin(a)); }
    return sum / 16;
  }
  function tpGrid(n, r, fan) {
    var nl = Math.ceil(Math.sqrt(n)), nu = Math.ceil(n / nl), sp = Math.min(1.6 * r, 2 * fan / Math.max(nl - 1, 1)), lat = [], up = [];
    for (var i = 0; i < nl; i++) lat.push((i - (nl - 1) / 2) * sp);
    for (var j = 0; j < nu; j++) up.push((j - (nu - 1) / 2) * sp);
    return { lat: lat, up: up };
  }
  function threatPreview(w, side, shipId) {
    var s = w.idx[shipId], res = [];
    if (!s || s.kind !== 'ship' || s.side !== side || !alive(s)) return res;
    var D = tpDodge(s), r = s.r, groups = null, gi, i;
    function tpCan(id, src, wk, kg, eta, R, n, ol, ou) {
      var e = Math.max(0, eta), s0c = s0At(e), c0 = canChance(R, n, r, ol, ou, s0c, s0c), hit = { off: c0.any }, ex = { off: c0.exp };
      TPB.forEach(function (b) {
        var sg = hyp(tpSig(D[b], e), s0c), c = canChance(R, n, r, ol, ou, sg * D[b].latEff + 1e-9, sg + 1e-9);
        hit[b] = Math.min(c0.any, c.any); ex[b] = Math.min(c0.exp, c.exp);
      });
      return { id: id, kind: 'can', eta: eta, hit: hit, exp: ex, n: n, src: src, wk: wk, kg: kg };
    }
    // known rounds: closest approach of each, against the ship's planned path (its velocity and thrust with the
    // jink smoothed out, so the odds do not swing with every weave)
    var sax = s.pax != null ? s.pax : s.ax || 0, say = s.pay != null ? s.pay : s.ay || 0, saz = s.paz != null ? s.paz : s.az || 0, sdv = Math.sqrt(s.pdv || 0), lg = s.pLag || 0;
    var svx = s.pvx != null ? s.pvx + sax * lg : s.vx, svy = s.pvy != null ? s.pvy + say * lg : s.vy, svz = s.pvz != null ? s.pvz + saz * lg : s.vz;
    // holding the planned path still leaves the ship's own weave about it, and the plan itself will not be kept
    // to the second: the ship trims its burn as the fight moves (tpPlan: a share of the burn, and a floor)
    var sPl = hyp(N.tpPlan[0] * Math.sqrt(sax * sax + say * say + saz * saz), N.tpPlan[1]);
    function s0At(e) { return hyp(Math.max(0.15 * r, sdv * e / Math.sqrt(1 + e / N.tpSeg)), sPl * accPos(e)); }
    for (i = 0; i < w.slugs.length; i++) {
      var p = w.slugs[i]; if (p.side === side || p.known > w.t || p.kind === 'pen') continue;
      var rx = p.x - s.x, ry = p.y - s.y, rz = p.z - s.z, ux = p.vx - svx, uy = p.vy - svy, uz = p.vz - svz, uu = ux * ux + uy * uy + uz * uz;
      if (uu < 1e-12) continue;
      var tca = -(rx * ux + ry * uy + rz * uz) / uu; if (tca <= 0) continue;
      // the ship's planned burn carried for accHold s, as the enemy's predictor carries it (a plan is not kept longer)
      // (a burn along the line moves the meeting time: two Newton steps on it)
      var ul = Math.sqrt(uu), kq, mx, my, mz;
      for (var it = 0; it < 3; it++) {
        kq = accPos(tca); mx = rx + ux * tca - sax * kq; my = ry + uy * tca - say * kq; mz = rz + uz * tca - saz * kq;
        if (it < 2) tca = Math.max(0.1, tca - (mx * ux + my * uy + mz * uz) / uu);
      }
      var B = basis(ux / ul, uy / ul, uz / ul);
      var ol = mx * B.lx + my * B.ly, ou = mx * B.ux + my * B.uy + mz * B.uz;
      if (ol * ol + ou * ou > 400) continue;
      if (p.kind === 'can') {
        // a canister round not yet burst: quoted as the cloud it will make (canR about its own path, canN fragments)
        // against the ship's jink in each band from now to the cloud: the harder it jinks, the likelier it is
        // outside the cloud, and the thinner the cloud is that it meets
        res.push(tpCan(p.id, p.src, p.wk, p.kg, tca, p.canR || 1, p.canN || N.canN, ol, ou));
        continue;
      }
      var key = p.sv || p; if (!groups) groups = new Map();
      var g = groups.get(key); if (!g) { g = { id: 'v' + p.id, first: p.id, src: p.src, wk: p.wk, kg: p.kg, n: 0, eta: 0, lat: [], up: [], offs: [], frag: p.kind === 'frag' }; groups.set(key, g); }
      g.n++; g.eta += tca; g.offs.push([ol, ou]);
    }
    if (groups) groups.forEach(function (g) {
      var eta = g.eta / g.n, hit = {};
      if (g.frag) {
        // a burst cloud: its middle and its half-width from the fragments themselves
        var mL = 0, mU = 0, R = 0; g.offs.forEach(function (o) { mL += o[0] / g.n; mU += o[1] / g.n; });
        g.offs.forEach(function (o) { R = Math.max(R, Math.abs(o[0] - mL), Math.abs(o[1] - mU)); });
        res.push(tpCan(g.id, g.src, g.wk, g.kg * g.n, eta, Math.max(R, 0.01), g.n, mL, mU)); return;
      }
      // rounds of one salvo arrive together and the ship's dodge moves it against all of them at once
      function chance(sL, sU) {
        if (g.n === 1) return pInterval(g.offs[0][0] - r, g.offs[0][0] + r, sL) * pInterval(g.offs[0][1] - r * PI / 4, g.offs[0][1] + r * PI / 4, sU);
        // a salvo is a grid: the union across times the union out of the plane
        var la = [], ua = []; g.offs.forEach(function (o) { la.push(o[0]); ua.push(o[1]); });
        return Math.min(1, axisChance(dedupe(la, r * 0.2), r, sL).any * axisChance(dedupe(ua, r * 0.2), r * PI / 4, sU).any);
      }
      // no band can beat not dodging
      var s0 = s0At(eta);
      TPB.forEach(function (b) { var sg = Math.hypot(tpSig(D[b], eta), s0); hit[b] = chance(sg * D[b].latEff + 1e-9, sg + 1e-9); });
      hit.off = chance(s0, s0);
      TPB.forEach(function (b) { if (hit[b] > hit.off) hit[b] = hit.off; });
      res.push({ id: g.n > 1 ? g.id : g.first, kind: g.n > 1 ? 'salvo' : 'slug', eta: eta, hit: hit, n: g.n, src: g.src, wk: g.wk, kg: g.kg });
    });
    // tracked missiles and strikers, each counted against the own ship it is closing on most squarely
    var tl = w.sides[side].tl, own = [];
    for (i = 0; i < w.ships.length; i++) if (w.ships[i].side === side && alive(w.ships[i])) own.push(w.ships[i]);
    for (i = 0; i < tl.length; i++) {
      var c = tl[i], isM = c.kind === 'missile', isS = c.kind === 'drone' && c.cls === 'striker';
      if (!isM && !isS) continue;
      var age = w.t - (c.tObs || w.t), cz = (c.z || 0) + (c.vz || 0) * age, best = null, bm = 1e18, bt = 0;
      for (var k = 0; k < own.length; k++) {
        var o = own[k], dx = c.ex - o.x, dy = c.ey - o.y, dz = cz - o.z, vx = c.vx - o.vx, vy = c.vy - o.vy, vz = (c.vz || 0) - o.vz, vv = vx * vx + vy * vy + vz * vz;
        if (vv < 1e-12) continue;
        var tc = -(dx * vx + dy * vy + dz * vz) / vv; if (tc <= 0) continue;
        var ex = dx + vx * tc, ey = dy + vy * tc, ez = dz + vz * tc, m2 = (ex * ex + ey * ey + ez * ez) / (tc + 1);
        if (m2 < bm) { bm = m2; best = o; bt = tc; }
      }
      if (best !== s) continue;
      var light = c.cls === 'light missile', hitm = {};
      var pat = isS || light ? tpGrid(N.lmPen, r, N.mFan * 0.5) : tpGrid(N.mPen, r, N.mFan);
      // the warhead's own scatter about its aim point, then the late break carried out of the pattern
      var sgM = N.mScat * r;
      var per = function (dL, dU) {
        var la = pat.lat.map(function (o) { return o - dL; }), ua = pat.up.map(function (o) { return o - dU; });
        return axisChance(la, r, sgM).any * axisChance(ua, r * PI / 4, sgM).any;
      };
      var nPay = isS ? (DR.striker.n || 1) : 1;
      hitm.off = 1 - Math.pow(1 - per(0, 0), nPay);
      TPB.forEach(function (b) { hitm[b] = Math.min(hitm.off, 1 - Math.pow(1 - tpBreak(D[b], per), nPay)); });
      res.push({ id: c.id, kind: isS ? 'drone' : light ? 'payload' : 'missile', eta: bt, hit: hitm, n: nPay, src: null, wk: c.cls });
    }
    res.sort(function (a, b) { return a.eta - b.eta; });
    return res;
  }
  function dedupe(a, tol) { a.sort(function (x, y) { return x - y; }); var o = []; for (var i = 0; i < a.length; i++) if (!o.length || a[i] - o[o.length - 1] > tol) o.push(a[i]); return o; }

  // ---------------------------------------------------------------- the view: what one side knows
  function view(w, side) {
    var sd = w.sides[side], slugs = [], officers = {}, enemyOfficers = {};
    for (var i = 0; i < w.slugs.length; i++) { var p = w.slugs[i]; if (p.side !== side && p.known <= w.t && p.kind !== 'pen') slugs.push(p); }
    for (i = 0; i < w.ships.length; i++) if (w.ships[i].side === side) officers[w.ships[i].id] = w.ships[i].officers;
    // identified enemy ships: who holds each post and what they are good at (not how strained or hurt they are)
    for (i = 0; i < sd.tl.length; i++) {
      var tr = sd.tl[i], es = tr.identified && w.idx[tr.oid];
      if (es && es.kind === 'ship' && es.officers) enemyOfficers[tr.id] = es.officers.map(function (o) { return { station: o.station, name: o.name, origin: o.origin, ability: o.ability, abilityName: o.abilityName }; });
    }
    return {
      officers: officers, enemyOfficers: enemyOfficers,
      t: w.t, side: side, over: w.over, winner: w.winner,
      own: w.ships.filter(function (s) { return s.side === side; }),
      drones: w.drones.filter(function (d) { return d.side === side && d.alive; }),
      missiles: w.missiles.filter(function (m) { return m.side === side && m.alive; }),
      contacts: sd.tl, threats: sd.threats, slugs: slugs, planets: w.planets, clouds: w.clouds,
      doctrine: sd.doctrine, objective: w.scn.objective || null, intel: w.intel[side]
    };
  }
  function events(w) { var e = w.ev; w.ev = []; return e; }

  return {
    create: create, step: step, order: order, view: view, events: events, hitEstimate: hitEstimate, fire: fire, threatPreview: threatPreview, rateAt: rateAt,
    mass: mass, dvLeft: dvLeft, accLimit: accLimit, maxAcc: maxAcc, gCap: gCap, thrustAvail: thrustAvail, capable: capable, offensive: offensive, active: active,
    wingStrength: wingStrength, queued: queued, byId: byId, modOf: modOf, trackOf: trackOf, arand: arand, erf: erf, hyp: hyp, hyp3: hyp3, angDiff: angDiff, bandOf: bandOf,
    solve: solve, spreadOf: spreadOf, axisChance: axisChance, patternChance: patternChance, gridAxes: gridAxes, histAt: histAt, makeShip: makeShip, enemyOf: enemyOf, reindex: reindex,
    crewStep: crewStep, bandHarm: bandHarm, crewReport: crewReport, aftermath: aftermath, strainRate: strainRate, officerEff: officerEff, crewShip: crewShip,
    stationEff: function (s, k) { return stE(s, k); }, hurtRate: hurtRate,
    BUCKETS: BUCKETS, DTYPES: DTYPES, DATA: D
  };
});
