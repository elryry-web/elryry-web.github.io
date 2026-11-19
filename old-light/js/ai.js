/* Old Light: ship computers and the fleet commander.
 * UMD: window.OL_AI in the browser (after OL_DATA and OL_ENGINE), require('./ai.js') in node.
 *
 * attach(w, cfg) installs w.control. Each tick, for each side, it reads only E.view(w, side) and gives orders:
 *   helm (every ship, every tick): flies the standing man order, jinks when evading, holds z near the plane.
 *   gunnery (every 2 s): picks shots from hitEstimate, salvo patterns, ammo, lasers, missiles.
 *   commander (every 10 s): doctrine sets man orders, G limits, evasion, targets and drone wings.
 * cfg: { commander: {A: true, B: true}, gunnery: {A: true, B: true} } (default all on). A player side turns
 * its commander off and gives orders itself; the helm and gunnery computers still serve it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./engine.js'));
  else root.OL_AI = factory(root.OL_DATA, root.OL_ENGINE);
})(typeof self !== 'undefined' ? self : this, function (D, E) {
  'use strict';
  var N = D.NUM, MODS = D.MODS, G = N.G, PI = Math.PI, hyp = E.hyp;
  var SIDES = ['A', 'B'];

  // doctrine settings: ranges in km, thresholds as hit chance
  var DOC = {
    missile: { hold: 600000, breakAt: 250000, launchAt: 900000, salvo: 6, salvoGap: 300, vmax: 15, rail: 0.05, spinal: 0.05, laserAt: 60000, gLimit: 'combat' },
    brawler: { hold: 12000, vmax: 30, rail: 0.04, spinal: 0.04, laserAt: 120000, gLimit: 'combat', launchAt: 400000, salvo: 4, salvoGap: 300 },
    sniper: { hold: 2500, vmax: 30, rail: 0.03, spinal: 0.03, laserAt: 60000, gLimit: 'combat', launchAt: 400000, salvo: 4, salvoGap: 300 },
    carrier: { hold: 120000, breakAt: 50000, vmax: 30, holdV: 8, breakV: 12, stopK: 0.5, rail: 0.04, spinal: 0.04, laserAt: 40000, gLimit: 'cruise', strikeAt: 260000 },
    escort: { hold: 3000, vmax: 35, rail: 0.03, spinal: 0.03, laserAt: 60000, gLimit: 'combat', guard: 120000 },
    cargo: { vmax: 0, rail: 1, spinal: 1, laserAt: 0, gLimit: 'cruise' }
  };

  function attach(w, cfg) {
    cfg = cfg || {};
    w.ai = { cfg: { commander: cfg.commander || { A: true, B: true }, gunnery: cfg.gunnery || { A: true, B: true } }, side: { A: null, B: null } };
    w.control = think;
    return w;
  }
  function think(w) {
    for (var si = 0; si < 2; si++) {
      var S = (w.aiOrder || SIDES)[si], v = E.view(w, S), M = w.ai.side[S];
      if (!M) M = w.ai.side[S] = initSide(w, v);
      if (w.ai.cfg.commander[S] && w.nTick % 10 === 0) commander(w, v, M);
      for (var i = 0; i < v.own.length; i++) {
        var s = v.own[i], mem = M.ship[s.id] || (M.ship[s.id] = newMem());
        if (!E.active(s)) { s.ctl.ax = s.ctl.ay = s.ctl.az = 0; continue; }
        if (w.ai.cfg.gunnery[S] && (w.nTick + i) % 2 === 0) gunnery(w, v, M, s, mem);
        helm(w, v, M, s, mem);
      }
    }
  }
  function newMem() { return { jt: 0, jcur: { x: 0, y: 0, z: 0 }, ja: { x: 0, y: 0, z: 0 }, jaUntil: 0, lastSalvo: -1e9, tgt: null, evLevel: 'off' }; }
  function roleOf(s) {
    var n = { rail: 0, laser: 0, rack: 0, bay: 0 };
    s.mods.forEach(function (m) { if (n[m.kind] != null) n[m.kind]++; });
    if (n.bay) return 'carrier';
    if (n.rack) return 'missile';
    if (!n.rail && !n.laser) return 'cargo';
    return n.laser > n.rail ? 'brawler' : 'sniper';
  }
  function initSide(w, v) {
    var M = { ship: {}, role: {}, doctrine: v.doctrine };
    v.own.forEach(function (s) {
      var r = roleOf(s), d = v.doctrine;
      if (d === 'escort') r = r === 'cargo' ? 'cargo' : 'escort';
      else if (d === 'carrier') r = r === 'carrier' ? 'carrier' : r === 'cargo' ? 'cargo' : 'escort';
      else if (d !== 'auto' && r !== 'cargo' && r !== 'carrier') r = d;
      M.role[s.id] = r;
      s.orders.evasion = 'auto';
      s.orders.gLimit = DOC[r].gLimit;
    });
    return M;
  }

  // ---------------------------------------------------------------- picture helpers
  function enemyShips(v) { return v.contacts.filter(function (c) { return c.kind === 'ship'; }); }
  function nearest(list, x, y, pred) {
    var best = null, bd = 1e18;
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (pred && !pred(c)) continue; var d = hyp(c.ex - x, c.ey - y); if (d < bd) { bd = d; best = c; } }
    return best ? { c: best, d: bd } : null;
  }
  // a target worth shooting: firm, not already disabled, nearest first; stay on the one we had if still good
  function pickTarget(v, s, mem) {
    var list = enemyShips(v), keep = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === mem.tgt && !list[i].disabled) keep = list[i];
    var n = nearest(list, s.x, s.y, function (c) { return !c.disabled; });
    if (keep && (!n || hyp(keep.ex - s.x, keep.ey - s.y) < n.d * 1.5)) return keep;
    return n ? n.c : null;
  }

  // ---------------------------------------------------------------- the helm
  function helm(w, v, M, s, mem) {
    var c = s.ctl, o = s.orders.man || { type: 'coast' }, aL = E.accLimit(s), ax = 0, ay = 0, az = 0;
    if (o.gMax != null) aL = Math.min(aL, o.gMax * G);   // a gentle course: a carrier servicing drones steers under the service G
    // Approach and Hold on a ship: the range fight sets the range (Auto) and decides who pays for the stop
    var trS = (o.type === 'close' || o.type === 'hold') && o.target ? E.trackOf(w, s.side, o.target) : null, pass = null;
    if (trS && trS.kind === 'ship') {
      var rf = rangeFight(w, s, trS, mem);
      if (o.auto && rf && rf.R) o.range = rf.R;
      pass = rangeHelm(w, s, mem, o, trS, aL);
    } else if (mem.ps) mem.ps.mode = null;
    var g = pass ? null : goal(w, v, s, o);
    if (pass) { ax = pass.ax; ay = pass.ay; }
    else if (g && g.manual) { ax = g.ax; ay = g.ay; }
    else if (g) {
      if (g.ship && mem.ps && mem.ps.ret) g.vmax = Math.min(g.vmax != null ? g.vmax : N.vmax, N.passRetV);
      var rx = g.x - s.x, ry = g.y - s.y, r = hyp(rx, ry);
      // a stand-off point read off a light-lagged track wanders with the track noise: near enough is good enough, or the helm chases the noise and burns its fuel
      var rr = Math.max(0, r - (g.tol || 0));
      var vb = Math.sqrt(2 * aL * N.planFrac * rr), vm = Math.min(g.vmax != null ? g.vmax : N.vmax, vb);
      var ux = r > 1e-6 ? rx / r : 0, uy = r > 1e-6 ? ry / r : 0;
      // closing on a ship that is closing on us, this helm never burns against the speed the other ship brings:
      // it keeps that closing speed up to what it can still brake from, and past the stop curve it brakes only when
      // rangeHelm has decided this ship pays for the stop. It adds only its own half of the closing speed it wants
      // (up to vm / 2 of its own), so two helms that want different speeds settle instead of chasing each other's
      // velocity and burning their tanks dry side by side.
      if (g.ship && g.cT > 1) { var vrel = (s.vx - g.vx) * ux + (s.vy - g.vy) * uy; if (vrel > vm) vm = Math.min(vrel, Math.max(vm, vb)); else vm = Math.min(vm, Math.max(vrel, g.cT + vm / 2)); }
      var dvx = g.vx + ux * vm - s.vx, dvy = g.vy + uy * vm - s.vy, dl = hyp(dvx, dvy);
      if (dl > N.deadband) { var a = Math.min(aL, dl / N.helmTau); ax = dvx / dl * a; ay = dvy / dl * a; }
    }
    var dvl = E.dvLeft(s);
    // a chase stops chaseDv above the reserve: a ship that cannot catch its prey keeps the fuel to dodge with
    if (dvl < N.reserveDv + (o.type === 'close' ? N.chaseDv : 0) && o.type !== 'break') ax = ay = 0;
    // evasion: jink velocity offsets in the disc across the threat line, re-drawn every few seconds
    mem.evWhy = null;
    var lvl = s.orders.evasion === 'auto' ? autoEvasion(w, v, s, mem) : s.orders.evasion;
    if (o.type === 'cold') lvl = 'off';
    var lvl0 = lvl;
    if (dvl < N.reserveDv * 0.5) lvl = 'off';
    if (w.ai.cfg.commander[s.side] && s.orders.evasion === 'auto') dodgeBand(w, v, s, mem, lvl);
    mem.evLevel = lvl; c.ev = lvl || 'off'; c.evWhy = mem.evWhy || (lvl && lvl !== 'off' ? 'order' : null); c.jm = 0;
    var dt = N.tick, gx = ax, gy = ay;
    if (lvl !== 'off' && lvl) {
      if (w.t >= mem.jt) {
        var J = N.evVel[lvl] * aL * (s.st ? s.st.helm : 1), th = threatDir(v, s), ang = E.arand(w) * 2 * PI;
        var lx = -th.y, ly = th.x, jl = Math.cos(ang) * J, jz = Math.sin(ang) * J * N.evZ;
        mem.jcur = { x: lx * jl, y: ly * jl, z: jz };
        mem.jt = w.t + N.evSeg[0] + E.arand(w) * (N.evSeg[1] - N.evSeg[0]);
      }
      if (!mem.vb) mem.vb = { x: s.vx, y: s.vy, z: s.vz };
      mem.jOn = w.t + 4 * N.evTau;
    } else if (mem.jcur.x || mem.jcur.y || mem.jcur.z) { mem.jcur = { x: 0, y: 0, z: 0 }; mem.jt = 0; }
    // the jink is flown as a velocity offset from a base velocity that moves with the helm's own goal thrust:
    // closed loop, so a nose that is slow to come round, or a clipped burn, does not leave a drift behind
    if (mem.vb && w.t < mem.jOn) {
      var jx = (mem.vb.x + mem.jcur.x - s.vx) / N.evTau, jy = (mem.vb.y + mem.jcur.y - s.vy) / N.evTau, jzz = (mem.vb.z + mem.jcur.z - s.vz) / N.evTau;
      var jm = Math.sqrt(jx * jx + jy * jy + jzz * jzz), jcap = 2 * N.evVel.hard * aL / N.evTau;
      if (jm > jcap) { jx *= jcap / jm; jy *= jcap / jm; jzz *= jcap / jm; }
      ax += jx; ay += jy; az += jzz; c.jm = Math.min(jm, jcap);
      var gl = hyp(gx, gy), gk = gl > aL ? aL / gl : 1;
      mem.vb.x += gx * gk * dt + (s.vx - mem.jcur.x - mem.vb.x) * dt / N.evBase;
      mem.vb.y += gy * gk * dt + (s.vy - mem.jcur.y - mem.vb.y) * dt / N.evBase;
      mem.vb.z += (s.vz - mem.jcur.z - mem.vb.z) * dt / N.evBase - (N.zHome * N.zHome * s.z + 2 * N.zHome * s.vz) * dt;
    } else mem.vb = null;
    // late break: inside lbT s of a missile the helm burns flat out across its line, in one direction it keeps (it
    // spends the reserve on it, down to lbDv),
    // so the seeker has to see the burn before it can follow it and the warhead splits before it has
    var brk = lvl0 && lvl0 !== 'off' && dvl > N.lbDv ? lateBreak(w, v, s, mem) : null;
    if (brk) { c.ax = brk.x * aL; c.ay = brk.y * aL; c.az = brk.z * aL; c.ev = 'hard'; c.evWhy = 'break'; c.jm = aL; return; }
    // hold the hidden axis near the plane (critically damped); exactly zero at z = 0, vz = 0
    az += -(N.zHome * N.zHome * s.z + 2 * N.zHome * s.vz);
    var al = Math.sqrt(ax * ax + ay * ay + az * az);
    if (al > aL && al > 0) { ax *= aL / al; ay *= aL / al; az *= aL / al; }
    c.ax = ax; c.ay = ay; c.az = az;
  }
  // the nearest missile or striker payload due inside lbT s: a direction across its line, drawn once per missile.
  // (not a canister: its cloud is sized to the jink already, so the jink itself is the dodge)
  // A helm with Late break leans it out of the plane, where a warhead's pattern is thinnest.
  function lateBreak(w, v, s, mem) {
    var th = v.threats[s.id];
    if (mem.brk && w.t < mem.brk.till) return mem.brk;
    if (!th || (th.missEta > N.lbT && th.slugEta > N.lbT)) { mem.brk = null; return null; }
    var best = null, bt = N.lbT;
    for (var i = 0; i < v.contacts.length; i++) {
      var c = v.contacts[i]; if (c.kind !== 'missile') continue;
      var age = w.t - (c.tObs || w.t), dx = c.ex - s.x, dy = c.ey - s.y, dz = (c.z || 0) + (c.vz || 0) * age - s.z, vx = c.vx - s.vx, vy = c.vy - s.vy, vz = (c.vz || 0) - s.vz, vv = vx * vx + vy * vy + vz * vz;
      if (vv < 1e-12) continue;
      var tc = -(dx * vx + dy * vy + dz * vz) / vv; if (tc <= 0 || tc > bt) continue;
      var mx = dx + vx * tc, my = dy + vy * tc, mz = dz + vz * tc; if (mx * mx + my * my + mz * mz > 4) continue;
      best = { dx: -vx, dy: -vy, dz: -vz, id: c.id }; bt = tc;
    }
    if (!best || (mem.brk && mem.brk.id === best.id)) return null;
    var l = Math.sqrt(best.dx * best.dx + best.dy * best.dy + best.dz * best.dz), ux = best.dx / l, uy = best.dy / l, uz = best.dz / l;
    var lx = -uy, ly = ux, ll = hyp(lx, ly) || 1; lx /= ll; ly /= ll;
    var zx = -uz * ux, zy = -uz * uy, zz = 1 - uz * uz, zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var ang = E.arand(w) * 2 * PI, cl = Math.cos(ang), cu = Math.sin(ang);
    if (s.ab && s.ab.lateBreak && Math.abs(cu) < N.lbOut) { cu = (cu < 0 ? -1 : 1) * N.lbOut; cl = (cl < 0 ? -1 : 1) * Math.sqrt(1 - cu * cu); }
    mem.brk = { x: lx * cl + zx * cu, y: ly * cl + zy * cu, z: zz * cu, till: w.t + bt + 1, id: best.id };
    return mem.brk;
  }
  function goal(w, v, s, o) {
    var t = o.type;
    if (t === 'coast' || t === 'cold' || !t) return null;
    if (t === 'manual') { var h = (o.heading || 0) * PI / 180, a = (o.g || 0) * G; return { manual: true, ax: Math.cos(h) * a, ay: Math.sin(h) * a }; }
    // a station moves with the ship it was set from: carry the point on from when the order was given
    if (t === 'station') { var ago = o.t != null ? w.t - o.t : 0; return { x: o.x + (o.vx || 0) * ago, y: o.y + (o.vy || 0) * ago, vx: o.vx || 0, vy: o.vy || 0, vmax: o.vmax, tol: 500 }; }
    var tr = o.target ? E.trackOf(w, s.side, o.target) : null, T;
    if (tr) T = { x: tr.ex, y: tr.ey, vx: tr.vx, vy: tr.vy };
    else if (o.point) T = { x: o.point.x, y: o.point.y, vx: 0, vy: 0 };
    else if (v.intel) T = { x: v.intel.x, y: v.intel.y, vx: 0, vy: 0 };
    else return null;
    var dx = s.x - T.x, dy = s.y - T.y, d = hyp(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (t === 'match') return { x: s.x, y: s.y, vx: T.vx, vy: T.vy, vmax: 0 };
    if (t === 'break') return { x: s.x + ux * 1e9, y: s.y + uy * 1e9, vx: T.vx, vy: T.vy, vmax: o.vmax || 40 };
    var R = o.range != null ? o.range : 5000;
    // cT: the target's own closing speed (its velocity toward us)
    return { x: T.x + ux * R, y: T.y + uy * R, vx: T.vx, vy: T.vy, vmax: o.vmax, tol: R * N.holdTol, ship: !!(tr && tr.kind === 'ship'), cT: T.vx * ux + T.vy * uy };
  }

  // ---------------------------------------------------------------- the range fight
  // Each gun ship works out where it wants to fight its target: at each candidate range, the share of the target's
  // health it deals a second (engine rateAt, from both ships' working guns) less the share of its own it takes,
  // plus rfTie x the share dealt. Cached; refreshed every rfRefresh s or when either ship's guns, ammo, health or
  // gunnery crew change. reach: past this neither ship does much, and a pass is over once the range opens past it.
  var RCAND = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000, 25000, 30000];
  function gunKey(s) {
    var k = '';
    for (var i = 0; i < s.mods.length; i++) { var m = s.mods[i]; if (m.kind === 'rail' || m.kind === 'laser') k += m.state + (m.kind === 'laser' || m.ammo > 0 ? 'a' : 'd'); }
    return k + Math.round(4 * s.hp / s.hpMax) + Math.round(4 * (s.st ? s.st.guns : 1));
  }
  function rangeFight(w, s, tr, mem) {
    var T = tr && tr.kind === 'ship' ? w.idx[tr.oid] : null; if (!T || T.kind !== 'ship') return null;
    var key = tr.id + '|' + gunKey(s) + '|' + gunKey(T), c = mem.rf;
    if (c && c.key === key && w.t - c.t < N.rfRefresh) return c;
    var hs = Math.max(1, s.hp), ht = Math.max(1, T.hp), best = null, bt = null, top = 0, topO = 0, rows = [];
    for (var i = 0; i < RCAND.length; i++) {
      var R = RCAND[i], o = E.rateAt(s, T, R), n = E.rateAt(T, s, R), e = o / ht - n / hs, a = e + N.rfTie * o / ht, b = -e + N.rfTie * n / hs;
      rows.push([R, o, n]); top = Math.max(top, o, n); topO = Math.max(topO, o);
      if (!best || a > best.a + 1e-12) best = { R: R, a: a, e: e, o: o, n: n };
      if (!bt || b > bt.b + 1e-12) bt = { R: R, b: b };
    }
    // outgunned at every range, the best score is out of everyone's reach, which is no fight at all. Breaking off is
    // the commander's call, so the helm fights where the trade is least bad: the most dealt for each share taken.
    function trade(j, k) { var q = null; for (var r = 0; r < rows.length; r++) { var x = rows[r][j] / (j === 1 ? ht : hs), y = rows[r][k] / (k === 1 ? ht : hs), v = x / (y + 1e-9); if (x > 0 && (!q || v > q.v * (1 + 1e-6))) q = { R: rows[r][0], v: v, o: rows[r][1], n: rows[r][2] }; } return q; }
    if (best.o <= 0) { var q = trade(1, 2); if (q) best = { R: q.R, e: q.o / ht - q.n / hs, o: q.o, n: q.n }; }
    if (!(rows.filter(function (r) { return r[0] === bt.R; })[0][2] > 0)) { var q2 = trade(2, 1); if (q2) bt = { R: q2.R }; }
    var reach = RCAND[0];
    for (i = 0; i < rows.length; i++) if (Math.max(rows[i][1], rows[i][2]) > 0.05 * top) reach = rows[i][0];
    // guns that cannot hurt the target at any range give no best range, and the doctrine band holds
    mem.rf = topO > 0 ? { key: key, t: w.t, tgt: tr.id, R: best.R, edge: best.e, deal: best.o / ht, out: best.o, inn: best.n, theirs: bt.R, reach: 1.2 * Math.max(reach, best.R, bt.R) }
      : { key: key, t: w.t, tgt: tr.id, R: null, theirs: top > 0 ? bt.R : null, reach: top > 0 ? 1.2 * Math.max(reach, bt.R) : 0, noHurt: top > 0 };
    return mem.rf;
  }
  // Closing on a ship that is also closing, no helm brakes for the other side. This helm stops at its own range only
  // when the stop is worth its cost (the whole closing speed, since the other ship may not brake). Auto stops when
  // the edge at its range is at least rfEdge of what it deals and it keeps reserveDv + passMargin after the stop,
  // when the stop is cheap (under stopFree), or after passMax passes (the anti-stalemate rule). Else it passes:
  // it holds its course and slides passOff x its range wide of the line for the dodge. It fires as it goes. Once the
  // range opens past reach it turns back at passRetV and decides again. The order's pass ('auto', 'brake', 'pass')
  // is the player's override. Returns a burn for a pass, or null to fly the Approach or Hold as usual.
  function rangeHelm(w, s, mem, o, tr, aL) {
    var P = mem.ps || (mem.ps = { n: 0, tgt: null, mode: null, ret: false, why: null });
    if (P.tgt !== tr.id) { P.tgt = tr.id; P.n = 0; P.mode = null; P.ret = false; }
    var dx = tr.ex - s.x, dy = tr.ey - s.y, d = hyp(dx, dy) || 1, ux = dx / d, uy = dy / d;
    var rvx = s.vx - tr.vx, rvy = s.vy - tr.vy, Vc = rvx * ux + rvy * uy, vr = hyp(rvx, rvy), cT = -(tr.vx * ux + tr.vy * uy);
    var R = o.range || 5000, rf = mem.rf && mem.rf.tgt === tr.id ? mem.rf : null, reach = Math.max(rf && rf.reach || 0, 2 * R);
    P.Vc = Vc; P.vr = vr; P.d = d; P.cT = cT;
    if (P.ret && d < 1.5 * R) P.ret = false;
    var st = w.stats.rf || (w.stats.rf = { pass: { A: 0, B: 0 }, brake: { A: 0, B: 0 } });
    if (P.mode === 'pass') {
      if (vr < 4) P.mode = null;   // the other ship paid for the stop
      else if (Vc < -1 && d > reach) { P.mode = null; P.n++; P.ret = true; st.pass[s.side]++; }
    }
    var vb = Math.sqrt(2 * aL * N.planFrac * Math.max(0, d - R));
    if (P.mode !== 'pass') {
      if (Vc <= N.stopFree || d <= R || cT <= 1) { if (P.mode) P.mode = null; return null; }   // not a closing engagement worth a choice
      // until the stop curve comes up, fly the approach as usual; at the curve choose, and hold the choice
      // (half a stop wastes what was paid for it)
      if (!P.mode && Vc < 0.9 * vb) return null;
      if (!P.mode) {
        var pick = o.pass === 'brake' || o.pass === 'pass' ? o.pass : null, why = 'order';
        if (!pick) {
          var spare = E.dvLeft(s) - vr - N.reserveDv;
          if (P.n >= N.passMax) { pick = 'brake'; why = 'passes'; }
          else if (spare < N.passMargin) { pick = 'pass'; why = 'fuel'; }
          else if (rf && rf.R && rf.edge >= N.rfEdge * rf.deal) { pick = 'brake'; why = 'edge'; }
          else { pick = 'pass'; why = 'even'; }
        }
        if (pick === 'brake' && P.mode !== 'brake') st.brake[s.side]++;
        P.mode = pick; P.why = why;
      }
      if (P.mode !== 'pass') return null;
    }
    // the pass: no burn along the line; slide wide of it so the closest approach is about passOff x the range. The
    // slide is spread over the time left (1.5 x the constant push that would just make it), not a hard jink.
    var tc = vr > 1e-6 ? (dx * rvx + dy * rvy) / (vr * vr) : 0, mx = dx - rvx * tc, my = dy - rvy * tc, m = hyp(mx, my);
    var b = Math.max(300, Math.min(3000, N.passOff * R)), ax = 0, ay = 0;
    if (tc > 20 && m < b) {
      var lx = m > 1 ? -mx / m : uy, ly = m > 1 ? -my / m : -ux, a = Math.min(aL, 3 * (b - m) / (tc * tc));
      ax = lx * a; ay = ly * a;
    }
    return { ax: ax, ay: ay };
  }
  // what the helm is doing about the range fight, for the UI: { R, theirs, mode, why, passes, Vc, vr, d, cT }
  function helmInfo(w, s) {
    var M = w.ai && w.ai.side && w.ai.side[s.side], mem = M && M.ship && M.ship[s.id]; if (!mem) return null;
    var rf = mem.rf, P = mem.ps || {}, tg = s.orders.man && s.orders.man.target;
    return { R: rf && rf.tgt === tg ? rf.R : null, theirs: rf && rf.tgt === tg ? rf.theirs : null, noHurt: !!(rf && rf.tgt === tg && rf.noHurt), mode: P.tgt === tg ? P.mode : null, why: P.why, passes: P.n || 0, Vc: P.Vc, vr: P.vr, d: P.d, cT: P.cT };
  }
  // dodging costs: a hard jink lays no spinal and launches no missiles, and a jinking turret shoots wide.
  // Against slugs the helm weighs what dodging saves (engine threatPreview, in heavy-slug units) against what
  // holding steady is worth right now (a spinal shot it could take, a salvo waiting in the racks).
  function autoEvasion(w, v, s, mem) {
    var th = v.threats[s.id]; if (!th) return 'off';
    var lvl = 'off';
    // a homing missile follows a weave; only the late break beats it, so the helm saves its fuel for that and
    // goes Hard only in the last missHard s (time for the band to be set first)
    if (th.missEta < N.missHard) { lvl = 'hard'; mem.evWhy = 'missile'; }
    // once the helm dodges a round it keeps dodging until that round has gone by: its own jink is what makes
    // the round look like a miss, and stopping would put the ship back in its path
    // a helm with Late break commits to the dodge later, once the round's path is plainer
    if (th.slugN > 0 && th.slugEta < N.evLook * (s.ab && s.ab.lateBreak ? s.ab.lateBreak.window : 1) && lvl !== 'hard') {
      var r = slugRisk(w, s, mem), gain = r.off - r.dodge;
      if (gain > N.evMin && gain > steadyValue(w, s, mem) * N.evTrade) mem.dodgeTill = Math.max(mem.dodgeTill || 0, w.t + r.eta + 3);
    }
    if (lvl !== 'hard' && w.t < (mem.dodgeTill || 0)) { lvl = 'hard'; mem.evWhy = 'slug'; }
    // under a beam a light jink drags its spot across the hull; it is not worth spoiling a shot for
    if (lvl === 'off' && th.lasered && steadyValue(w, s, mem) < N.evKeep) { lvl = 'light'; mem.evWhy = 'laser'; }
    return lvl;
  }
  // the AI's G band while it dodges: the highest band above its doctrine band where each step up still saves at
  // least bandGain of weighted hits, and either hurts nobody or the danger is worth it (as gGuard reads it).
  // Crash only when it hurts nobody, or the ship is badly hurt and the rounds are likelier than not to land.
  // When the dodge ends the doctrine band comes back.
  function dodgeBand(w, v, s, mem, lvl) {
    var cur = s.orders.gLimit || 'combat';
    if (lvl !== 'hard' || (mem.evWhy !== 'slug' && mem.evWhy !== 'missile')) {
      if (mem.dBase) { if (cur === mem.dBand) E.order(w, s.id, { gLimit: mem.dBase }); mem.dBase = mem.dBand = null; }
      mem.dPick = null; return;
    }
    if (mem.dBand && cur !== mem.dBand) mem.dBase = cur;   // the commander re-issued its band this tick
    var base = mem.dBase || cur, bi = BANDS.indexOf(base); if (bi < 0) return;
    if (!mem.dPick || w.t - mem.dPick.t >= N.evThink) {
      var th = v.threats[s.id] || {}, r = slugRisk(w, s, mem), harm = E.bandHarm(w, s.side, s.id), pick = base;
      var danger = th.missEta < N.guardMiss || (r && r.off > N.guardRisk);
      for (var b = bi + 1; b < BANDS.length && harm; b++) {
        var B = BANDS[b], lo = r ? r.by[BANDS[b - 1]] : 0, gain = r ? lo - r.by[B] : (b <= 2 ? 1 : 0);
        if (harm[B].g <= harm[BANDS[b - 1]].g + 0.2) break;   // the drive cannot pull more here
        // mild: the G bruises an officer who is still well (bandHurt health a minute at most, health over bandWell);
        // a dodge flies the cap only in bursts, so that is a few points over a dodge. Spent officers are not mild.
        var hurts = harm[B].hurt.length > 0, mild = harm[B].hurt.every(function (h) { var o = offOf(s, h.officer); return h.cause === 'g' && h.perMin <= N.bandHurt && o && o.health > N.bandWell; });
        // a band that only strains or mildly bruises is worth it for a real cut in what still gets through; one
        // that hurts worse needs the full bandGain and real danger
        if (gain < N.bandGain && (!mild || !r || lo < N.bandLow || r.by[B] > N.bandCut * lo)) break;
        if (mild) hurts = false;
        if (B === 'crash' && hurts && !(s.hp < 0.4 * s.hpMax && r && r.dodge > 0.5)) break;
        if (hurts && !danger) break;
        pick = B;
      }
      // the risk a dodge reads falls as its own jink works: hold the band picked for this dodge until it ends
      if (mem.dPick && mem.dBase && BANDS.indexOf(mem.dPick.band) > BANDS.indexOf(pick) && !(harm && harm[mem.dPick.band] && harm[mem.dPick.band].hurt.length && !danger)) pick = mem.dPick.band;
      mem.dPick = { t: w.t, band: pick };
    }
    var want = mem.dPick.band;
    if (want === base) { if (mem.dBase && cur === mem.dBand) E.order(w, s.id, { gLimit: mem.dBase }); mem.dBase = mem.dBand = null; return; }
    if (!mem.dBase) mem.dBase = base;
    mem.dBand = want;
    if (cur !== want) E.order(w, s.id, { gLimit: want });
  }
  function offOf(s, id) { for (var i = 0; i < (s.officers || []).length; i++) if (s.officers[i].id === id) return s.officers[i]; return null; }
  function slugRisk(w, s, mem) {
    if (mem.risk && w.t - mem.risk.t < N.evThink) return mem.risk;
    var band = s.orders.gLimit || 'combat', tp = E.threatPreview(w, s.side, s.id), off = 0, dodge = 0, eta = 0, by = { cruise: 0, combat: 0, brace: 0, crash: 0 };
    for (var i = 0; i < tp.length; i++) {
      var e = tp[i]; if (e.eta > N.evLook) continue;
      // weights in heavy-slug units: a round by its own mass (e.wk is 'rail' or 'spinal', not a module key), a
      // canister by the fragments expected to land (each its share of the round's mass, x fragK), a warhead by its penetrators
      var can = e.kind === 'can', q = can ? e.exp : e.hit;
      var wt = e.kind === 'slug' || e.kind === 'salvo' ? (e.kg || 12) / 40 : can ? (e.kg || 12) / 40 * N.fragK / (e.n || 1) : e.kind === 'payload' ? N.mWt * 0.3 : N.mWt;
      var hb = q[band] != null ? q[band] : q.combat;
      off += q.off * wt; dodge += hb * wt; if ((q.off - hb) * (can ? wt / ((e.kg || 12) / 40) : 1) > N.evMin && e.eta > eta) eta = e.eta;
      for (var b in by) by[b] += (q[b] != null ? q[b] : q.combat) * wt;
    }
    return (mem.risk = { t: w.t, off: off, dodge: dodge, eta: eta, by: by });
  }
  function steadyValue(w, s, mem) {
    var val = 0;
    for (var k = 0; k < s.mods.length; k++) {
      var m = s.mods[k]; if (m.state === 2) continue;
      if (m.kind === 'rail' && m.def.spinal && m.ammo > 0 && (m.pending || (m.cd <= 30 && mem.spin && w.t - mem.spin.t < 30))) val += mem.spin ? mem.spin.p * (m.def.kg / 40) : 0.2;
      if (m.kind === 'rack' && m.q.length) val += N.evKeep;
    }
    if (s.servicing || s.serviceHeld) val += N.evKeep;
    return val;
  }
  // unit in-plane direction the danger comes from: nearest known round, else nearest missile, else nearest enemy
  function threatDir(v, s) {
    var best = null, bd = 1e18, i;
    for (i = 0; i < v.slugs.length; i++) { var p = v.slugs[i], d = hyp(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; best = { x: p.x - s.x, y: p.y - s.y }; } }
    if (!best) for (i = 0; i < v.contacts.length; i++) { var c = v.contacts[i]; if (c.kind !== 'missile' && c.kind !== 'ship') continue; var dc = hyp(c.ex - s.x, c.ey - s.y) * (c.kind === 'missile' ? 0.2 : 1); if (dc < bd) { bd = dc; best = { x: c.ex - s.x, y: c.ey - s.y }; } }
    if (!best) return { x: Math.cos(s.heading), y: Math.sin(s.heading) };
    var l = hyp(best.x, best.y) || 1; return { x: best.x / l, y: best.y / l };
  }

  // ---------------------------------------------------------------- gunnery
  function gunnery(w, v, M, s, mem) {
    var role = M.role[s.id], P = DOC[role] || DOC.sniper;
    var tgt = pickTarget(v, s, mem); mem.tgt = tgt ? tgt.id : null;
    var missiles = v.contacts.filter(function (c) { return c.kind === 'missile' && c.firm; });
    var drones = v.contacts.filter(function (c) { return c.kind === 'drone' && c.firm; });
    for (var k = 0; k < s.mods.length; k++) {
      var m = s.mods[k]; if (m.state === 2) continue;
      if (m.kind === 'rail' && m.ammo > 0 && !m.burst && !m.pending && m.cd <= 0) {
        // a turret is quick to slew: it takes whichever ship it can actually hit, which is the one holding steady
        // (a carrier servicing drones, a boat launching, a cripple) rather than the one jinking at the front
        var rt = m.def.spinal ? tgt : railTarget(w, s, m, v, tgt);
        if (rt && rt.firm) railShot(w, s, m, rt, P);
      }
      else if (m.kind === 'laser') laserPick(w, s, m, tgt, missiles, drones, P);
    }
    // missiles: salvos at the target when in band and the last salvo has had time to tell
    if (tgt && tgt.firm && P.launchAt && w.t - mem.lastSalvo > (P.salvoGap || 300)) {
      var d = hyp(tgt.ex - s.x, tgt.ey - s.y), load = 0;
      s.mods.forEach(function (m) { if (m.kind === 'rack' && m.state < 2) load += m.load - m.q.length; });
      if (load > 0 && d < P.launchAt && d > 20000) { E.order(w, s.id, { launch: { target: tgt.id, n: Math.min(P.salvo || 4, load) } }); mem.lastSalvo = w.t; }
    }
    // sand against a laser that is hurting us
    var th = v.threats[s.id];
    if (th && th.lasered && s.has.sandcaster && s.has.sandcaster.charges > 0 && w.t - (mem.lastSand || -1e9) > 120) {
      var src = null; v.contacts.forEach(function (c) { if (c.oid === th.lasered) src = c; });
      if (src) { E.order(w, s.id, { sand: { target: src.id } }); mem.lastSand = w.t; }
    }
  }
  // the gunnery computer reads the target's dodging from its track (engine jinkEst): no blanket assumption
  // a fixed coin per battle seed and key, so the AI stays deterministic without touching the shared rngs
  function coin(seed, key) { var h = (seed || 0) >>> 0; for (var i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function M_spin(w, s, e) { var mem = AIM(w, s); if (mem) mem.spin = { t: w.t, p: e.steadyChance != null ? e.steadyChance : e.chance }; }
  function AIM(w, s) { var M = w.ai && w.ai.side[s.side]; return M && M.ship ? M.ship[s.id] : null; }
  function railShot(w, s, m, tgt, P) {
    var vj = 0, thr = m.def.spinal ? P.spinal : P.rail, n = m.def.spinal ? 1 : Math.min(4, m.ammo);
    var es = E.hitEstimate(w, s, m.id, tgt.id, { n: n, vj: vj });
    if (!es || !es.ok) return;
    if (m.def.spinal) M_spin(w, s, es);
    // solid or canister, per shot, by the damage each round is expected to do (a canister's fragments at their
    // share of the round's energy); canister only when at least canMinHits fragments are expected on the hull.
    // A spinal holds either until the helm steadies (the steady chance stands in while it jinks).
    var ec = E.hitEstimate(w, s, m.id, tgt.id, { ammo: 'canister', vj: vj });
    var sc = es.blocked ? es.steadyChance : es.chance, ce = ec && ec.ok ? (ec.blocked ? ec.steadyChance : ec.chance) : 0;
    var hitsC = ec && ec.ok ? (ec.blocked ? -Math.log(Math.max(1e-9, 1 - ce)) : ec.expHits) : 0;
    var slugVal = (es.blocked ? sc : es.expHits / n) * es.slugPts, canVal = ec && ec.ok ? hitsC * ec.fragPts : 0;
    var mem = AIM(w, s); if (mem && hitsC >= N.canMinHits) mem.canOk = w.t;
    if (hitsC >= N.canMinHits && canVal > slugVal) { E.order(w, s.id, { fireNow: { weapon: m.id, target: tgt.id, n: 1, ammo: 'canister', vj: vj } }); return; }
    if (sc >= thr) E.order(w, s.id, { fireNow: { weapon: m.id, target: tgt.id, n: n, vj: vj } });
  }
  function railTarget(w, s, m, v, tgt) {
    var list = enemyShips(v).filter(function (c) { return c.firm && !c.disabled; }), best = tgt, bv = -1;
    list.sort(function (a, b) { return hyp(a.ex - s.x, a.ey - s.y) - hyp(b.ex - s.x, b.ey - s.y); });
    for (var i = 0; i < Math.min(5, list.length); i++) {
      var e = E.hitEstimate(w, s, m.id, list[i].id, { n: 1, vj: 0 });
      var val = e && e.ok ? e.chance * (list[i].id === (tgt && tgt.id) ? 1.2 : 1) : 0;
      if (val > bv) { bv = val; best = list[i]; }
    }
    return best;
  }
  function laserPick(w, s, m, tgt, missiles, drones, P) {
    // inbound missiles inside 25,000 km come first, then drones close by, then the ship target in band
    var mn = nearest(missiles, s.x, s.y), dn = nearest(drones, s.x, s.y), pick = null;
    if (mn && mn.d < 25000) pick = mn.c;
    else if (dn && dn.d < 12000) pick = dn.c;
    else if (tgt && tgt.firm && hyp(tgt.ex - s.x, tgt.ey - s.y) < P.laserAt) {
      var e = E.hitEstimate(w, s, m.id, tgt.id, {});
      if (e && e.ok && e.chance * e.dmgFactor > 0.004) pick = tgt;
    }
    m.target = pick ? pick.id : null;
  }

  // ---------------------------------------------------------------- the commander
  function commander(w, v, M) {
    var ships = enemyShips(v);
    v.own.forEach(function (s) { order1(s); if (E.active(s) && M.ship[s.id]) gGuard(w, v, s, M.ship[s.id], ships); });
    function order1(s) {
      if (!E.active(s)) return;
      var role = M.role[s.id], P = DOC[role], mem = M.ship[s.id] || (M.ship[s.id] = newMem());
      var n = nearest(ships, s.x, s.y, function (c) { return !c.disabled; }), tgt = n && n.c, d = n ? n.d : 1e18;
      var spent = !E.offensive(s, w);
      if (role === 'cargo') { cargo(w, v, s); return; }
      if (spent) { E.order(w, s.id, { man: { type: 'break', target: tgt ? tgt.id : null, vmax: 30 }, gLimit: 'combat' }); return; }
      if (role === 'carrier') { carrier(w, v, M, s, tgt, d); return; }
      if (role === 'escort') { escort(w, v, M, s, tgt, d); return; }
      if (role === 'missile') {
        var man = !tgt ? { type: 'close', range: P.hold, vmax: P.vmax }
          : d < P.breakAt ? { type: 'break', target: tgt.id, vmax: 30 }
          : { type: 'hold', target: tgt.id, range: P.hold, vmax: P.vmax };
        E.order(w, s.id, { man: man, gLimit: d < P.breakAt ? 'brace' : P.gLimit });
        return;
      }
      // the range fight sets the range against this target; without one, the doctrine band
      var rf = tgt ? rangeFight(w, s, tgt, mem) : null, R = rf && rf.R ? rf.R : P.hold;
      if (!(rf && rf.R) && role === 'sniper' && !s.mods.some(function (m) { return m.kind === 'rail' && m.state < 2 && m.ammo > 0; })) R = DOC.brawler.hold;
      // a bold captain (seeded per ship), or one pressing a worse-hurt foe, pushes at Brace to close from well outside its band;
      // a ship with loaded rails pushes at Brace until its canister reaches (the gunner has lately seen canMinHits
      // fragments on the hull); gGuard weighs the crew
      // a scenario side with bold: false (the tutorial's enemy) never draws a bold captain
      if (mem.bold == null) { var sd = w.scn && w.scn.sides && w.scn.sides[s.side]; mem.bold = !(sd && sd.bold === false) && coin(w.seed, 'bold|' + s.id) < N.boldP; }
      var kin = s.mods.some(function (m) { return m.kind === 'rail' && m.state < 2 && m.ammo > 0; });
      var canIn = mem.canOk != null && w.t - mem.canOk < N.canHold;
      var boldPush = tgt && d < N.pushR && d > 2 * R && (mem.bold || tgt.hp / tgt.hpMax < s.hp / s.hpMax - 0.1);
      var push = boldPush || tgt && d < N.pushR && kin && !canIn && d > N.canPushMin;
      // a closing push for the guns is not worth a bruise: gGuard drops it to a band that hurts nobody
      mem.canPush = push && !boldPush;
      E.order(w, s.id, { man: { type: 'close', target: tgt ? tgt.id : null, range: R, vmax: P.vmax }, gLimit: push ? 'brace' : P.gLimit });
    }
  }
  // injury-aware G: a captain will not burn an officer into injury for nothing. If the ordered band would hurt
  // someone (over their limit, or spent and still under load), it drops to the highest band that hurts nobody,
  // unless the push is worth it: a crippled enemy close enough to finish, a missile or a likely slug hit on the
  // way, or a badly hurt ship with the enemy near.
  var BANDS = ['cruise', 'combat', 'brace', 'crash'];
  function gGuard(w, v, s, mem, ships) {
    var band = s.orders.gLimit || 'combat', bi = BANDS.indexOf(band); if (bi <= 0) return;
    // quick look first: nobody over their limit and nobody spent means nothing to weigh
    var gB = Math.min(N.gCap[band], E.maxAcc(s) / G), any = false;
    for (var k = 0; k < (s.officers || []).length; k++) { var o = s.officers[k]; if (!o.down && (gB > o.limit || o.strain >= 100 && gB >= N.recG && gB > o.comfort)) any = true; }
    if (!any) return;
    var harm = E.bandHarm(w, s.side, s.id); if (!harm || !harm[band].hurt.length) return;
    var th = v.threats[s.id] || {}, kill = false, near = false;
    for (var i = 0; i < ships.length; i++) {
      var c = ships[i], dd = hyp(c.ex - s.x, c.ey - s.y);
      if (dd < N.guardKill && c.crippled) kill = true;
      if (dd < N.guardNear) near = true;
    }
    var risk = mem.risk && w.t - mem.risk.t < 30 ? mem.risk.off : 0;
    // a mild bruise (G only, bandHurt a minute at most, on officers still over bandWell) is worth a push in the fight
    var mild = near && band !== 'crash' && !mem.canPush && harm[band].hurt.every(function (h) { var o = offOf(s, h.officer); return h.cause === 'g' && h.perMin <= N.bandHurt && o && o.health > N.bandWell; });
    var worth = kill || mild || th.missEta < N.guardMiss || risk > N.guardRisk || (near && s.hp < 0.4 * s.hpMax);
    mem.gGuard = worth ? null : band;
    if (worth) return;
    for (var b = bi - 1; b >= 0; b--) if (!harm[BANDS[b]].hurt.length) { E.order(w, s.id, { gLimit: BANDS[b] }); mem.gGuard = BANDS[b]; return; }
  }
  function cargo(w, v, s) {
    var obj = v.objective, th = v.threats[s.id];
    // barges run for the line at cruise G, faster when something is shooting
    // barges are slow and heavy: they hold their course and dodge; the escort does the fighting
    E.order(w, s.id, { man: { type: 'coast' }, gLimit: 'cruise' });
  }
  function escort(w, v, M, s, tgt, d) {
    var P = DOC.escort, ward = null;
    // ward: the barges, else the carrier, else nobody
    v.own.forEach(function (o) { var r = M.role[o.id]; if (o !== s && E.active(o) && (r === 'cargo' || r === 'carrier') && !ward) ward = o; });
    var own = roleOf(s), band = own === 'brawler' ? DOC.brawler.hold : own === 'missile' ? 300000 : DOC.sniper.hold;
    var emem = M.ship[s.id], erf = tgt && own !== 'missile' && emem ? rangeFight(w, s, tgt, emem) : null;
    if (erf && erf.R) band = erf.R;
    if (!ward) { E.order(w, s.id, { man: { type: 'close', target: tgt ? tgt.id : null, range: band, vmax: P.vmax }, gLimit: 'combat' }); return; }
    var dw = tgt ? hyp(tgt.ex - ward.x, tgt.ey - ward.y) : 1e18;
    // carrier escorts go in once the strike is out; convoy escorts go in when raiders come near the barges
    var go = tgt && (dw < P.guard || (M.role[ward.id] === 'carrier' && (M.struck || dw < 300000)));
    if (go) { E.order(w, s.id, { man: { type: 'close', target: tgt.id, range: band, vmax: P.vmax }, gLimit: 'combat' }); return; }
    // no target yet: face where the enemy was at the start (a fixed +x put one side's screen behind its ward)
    var ux = 1, uy = 0, I = v.intel;
    if (I) { var il = hyp(I.x - ward.x, I.y - ward.y) || 1; ux = (I.x - ward.x) / il; uy = (I.y - ward.y) / il; }
    if (tgt) { var l = hyp(tgt.ex - ward.x, tgt.ey - ward.y) || 1; ux = (tgt.ex - ward.x) / l; uy = (tgt.ey - ward.y) / l; }
    E.order(w, s.id, { man: { type: 'station', x: ward.x + ux * 8000, y: ward.y + uy * 8000, vx: ward.vx, vy: ward.vy, vmax: 10, t: w.t }, gLimit: 'combat' });
  }
  // carrier doctrine: eyes out early, a screen of lancers and interceptors, strikers when the target is firm;
  // hold a gentle, steady course while drones are serviced; run if the enemy gets close.
  function carrier(w, v, M, s, tgt, d) {
    var P = DOC.carrier, mem = M.ship[s.id], mine = v.drones.filter(function (x) { return x.mother === s.id; });
    var out = {}; E.DTYPES.forEach(function (t) { out[t] = 0; }); mine.forEach(function (x) { out[x.type]++; });
    function launch(type, n, mode, target) {
      var can = Math.min(n, s.stock[type] - E.queued(s, type)); if (can <= 0) return;
      E.order(w, s.id, { wing: { type: type, mode: mode || D.DRONES[type].mode, target: target || null }, drones: { type: type, n: can } });
    }
    var threatsNear = v.contacts.some(function (c) { return (c.kind === 'missile' || c.kind === 'drone') && c.firm && hyp(c.ex - s.x, c.ey - s.y) < 120000; });
    launch('picket', 2 - out.picket);
    launch('interceptor', 2 - out.interceptor, 'intercept');
    launch('decoy', 2 - out.decoy, 'screen');
    // lancers screen; once enemy drones or missiles are about, they hunt them
    // with no missile coming, lancers go and pick at the nearest enemy ship's outboard gear (harass); else they hunt or screen
    var missNear = v.contacts.some(function (c) { return c.kind === 'missile' && c.firm && hyp(c.ex - s.x, c.ey - s.y) < 120000; });
    var shipNear = v.contacts.some(function (c) { return c.kind === 'ship' && !c.disabled && hyp(c.ex - s.x, c.ey - s.y) < N.harassRange; });
    // interceptors and point defence handle the small stuff while any interceptors are left: lancers harass ships
    var intLeft = out.interceptor + s.stock.interceptor > 0;
    var lmode = intLeft ? (shipNear ? 'harass' : 'screen') : shipNear && !missNear && !threatsNear ? 'harass' : threatsNear ? 'intercept' : 'screen';
    if (mem.lmode !== lmode && out.lancer) { E.order(w, s.id, { wing: { type: 'lancer', mode: lmode } }); }
    mem.lmode = lmode;
    launch('lancer', 4 - out.lancer, lmode);
    // strikers: out when the target has been seen in the last 15 minutes and is inside reach; send everything in one wave
    if (tgt && (tgt.firm || tgt.age < 900) && d < P.strikeAt) {
      var ready = s.stock.striker - E.queued(s, 'striker');
      if (ready >= 2 || (ready > 0 && out.striker > 0)) { launch('striker', ready, 'strike', tgt.id); M.struck = true; }
      if (out.striker && mem.strikeTgt !== tgt.id) { E.order(w, s.id, { wing: { type: 'striker', mode: 'strike', target: tgt.id } }); }
      mem.strikeTgt = tgt.id;
    }
    // commit: with no strike left to throw (none in stock, none out with a payload) and no escort still fighting,
    // a carrier stops running and goes in with its laser and lancers; there is nothing left to keep it back for
    var strikeLeft = s.stock.striker - E.queued(s, 'striker') > 0 || E.queued(s, 'striker') > 0 || mine.some(function (x) { return x.type === 'striker' && x.mode !== 'return'; });
    var escorts = v.own.some(function (o) { return o !== s && E.active(o) && M.role[o.id] !== 'carrier' && M.role[o.id] !== 'cargo' && E.offensive(o, w); });
    // keeping back from a faster ship is a chase the carrier loses: once a third of its tank has gone, it stops running and keeps the rest to fight with
    var spent = s.dvUsed > E.dvLeft(s) * 0.5;
    // going in, it goes for the enemy's carrier if there is one: chasing a fast escort's velocity would drain the tank
    var cv = nearest(enemyShips(v), s.x, s.y, function (c) { return !c.disabled && c.cls === 'carrier'; }), prey = cv ? cv.c : tgt;
    if (prey && ((!strikeLeft && !escorts) || spent)) {
      var gm = intLeft && shipNear ? 'harass' : 'screen';
      if (out.lancer && mem.lmode !== gm) E.order(w, s.id, { wing: { type: 'lancer', mode: gm } });
      mem.lmode = gm;
      // no faster than it can still stop with what is in the tank: a carrier that overshoots at 30 km/s is out of the fight
      E.order(w, s.id, { man: { type: 'close', target: prey.id, range: DOC.brawler.hold, vmax: Math.max(4, Math.min(P.vmax, E.dvLeft(s) * P.stopK)) }, gLimit: 'combat' }); return;
    }
    // course: run from close enemies; else hold well back; coast (steady, under 0.3 G) while drones are serviced or coming home
    var homing = mine.some(function (x) { return x.mode === 'return' && hyp(x.x - s.x, x.y - s.y) < 30000; }), service = s.mods.some(function (m) { return m.kind === 'bay' && m.service.length; });
    if (tgt && d < P.breakAt && !spent) { E.order(w, s.id, { man: { type: 'break', target: tgt.id, vmax: P.breakV }, gLimit: 'combat' }); return; }
    // otherwise it keeps its place behind the screen (no drifting away), under the service G while drones are
    // serviced or coming home, so the bays keep working; it runs only when an enemy ship gets close
    if (!mem.anchor) mem.anchor = { x: s.x, y: s.y };
    var man = { type: 'station', x: mem.anchor.x, y: mem.anchor.y, vx: 0, vy: 0, vmax: P.holdV, t: w.t };
    if (service || homing) man.gMax = N.serviceG * 0.8;
    E.order(w, s.id, { man: man, gLimit: 'cruise' });
  }

  return { attach: attach, think: think, DOC: DOC, roleOf: roleOf, rangeFight: rangeFight, helmInfo: helmInfo };
});
