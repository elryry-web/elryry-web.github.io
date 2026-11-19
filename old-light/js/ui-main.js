/* Old Light UI: state, settings, the player's gunnery computer, threats, time control, events and the frame loop. */
(function () {
  'use strict';
  var U = window.OLUI = window.OLUI || {};
  var E = OL_ENGINE, D = OL_DATA, AI = OL_AI, N = D.NUM, G = N.G, hyp = E.hyp;
  U.E = E; U.D = D; U.AI = AI; U.N = N;

  // ---------------------------------------------------------------- settings (ol.settings.v1 only)
  var KEY = 'ol.settings.v1';
  function loadSet() {
    var d = { sound: true, pause: { contact: true, launch: true, impact: true, strain: true, crew: true, disabled: true }, lastScen: 'duel', lastSide: 'A' };
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') { for (var k in s) if (k !== 'pause') d[k] = s[k]; if (s.pause) for (k in s.pause) d.pause[k] = !!s.pause[k]; } } catch (e) {}
    return d;
  }
  U.set = loadSet();
  U.save = function () { try { localStorage.setItem(KEY, JSON.stringify(U.set)); } catch (e) {} };
  if (window.SFX) SFX.enabled = !!U.set.sound;
  U.setSound = function (on) { U.set.sound = !!on; if (window.SFX) SFX.enabled = !!on; U.save(); };
  U.sfx = function (k) { if (window.SFX && SFX.enabled) SFX.play(k); };

  // ---------------------------------------------------------------- formatting
  U.fmtT = function (t) { t = Math.max(0, Math.floor(t)); var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return 'T+' + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };
  U.fmtEta = function (t) { if (!(t >= 0) || t > 359999) return '--'; t = Math.round(t); var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; };
  U.fmtKm = function (d) { d = Math.abs(d); if (d < 1) return Math.round(d * 1000) + ' m'; if (d < 10) return d.toFixed(1) + ' km'; if (d < 1e6) return Math.round(d).toLocaleString('en-GB') + ' km'; return (d / 1e6).toFixed(2) + 'M km'; };
  U.fmtR = function (d) { if (d >= 1e6) return (d / 1e6) + 'M km'; if (d >= 1000) return (d / 1000) + 'k km'; return d + ' km'; };
  U.pct = function (p) { if (p == null || !(p >= 0)) return '--'; if (p > 0 && p < 0.01) return '<1%'; return Math.round(p * 100) + '%'; };
  // display names for the engine's damage keys; low = for the middle of a log line
  var WK = { rail: 'Railgun', railgun: 'Railgun', slug: 'Railgun', spinal: 'Spinal railgun', laser: 'Laser', missile: 'Missile', nuke: 'Nuclear missile', canister: 'Canister', can: 'Canister', frag: 'Canister', 'striker-lm': 'Striker missile', 'striker-rod': 'Striker rod', lancer: 'Lancer beam', pdl: 'PD laser', flak: 'Flak', ram: 'Collision', 'light missile': 'Light missile' };
  U.wkName = function (k, low) {
    var n = WK[k] || (D.MODS[k] && D.MODS[k].name) || (D.DRONES[k] && D.DRONES[k].name) || String(k || 'unknown').replace(/-/g, ' ');
    if (!low) return n.charAt(0).toUpperCase() + n.slice(1);
    return n.slice(0, 2) === 'PD' ? n : n.charAt(0).toLowerCase() + n.slice(1);
  };
  U.droneName = function (t, n) { var d = D.DRONES[t], nm = (d ? d.name : String(t)).toLowerCase(); return n === 1 ? nm : nm + 's'; };
  // seconds, then minutes past two minutes, then hours
  U.fmtAge = function (a) { a = Math.max(0, a || 0); if (a < 120) return Math.round(a) + ' s'; if (a < 5400) return Math.round(a / 60) + ' min'; var h = a / 3600; return (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h'; };
  // a lost track keeps its last fix; the ring grows with how far it could have gone at its last known speed
  U.isLost = function (c, age) { return !c.firm && age > 30; };
  U.ringOf = function (c, age) { if (age == null) age = Math.max(0, c.age != null ? c.age : st.w.t - (c.tObs || 0)); return U.isLost(c, age) ? (c.sig || 0) + hyp(c.vx || 0, c.vy || 0) * age : (c.ring || 0); };
  // why the battle ended, in the game's voice
  U.endWhy = function (reason) {
    var P = st ? st.P : 'A';
    var R = { 'A out of the fight': P === 'A' ? 'Your ships are out of the fight.' : 'The enemy is out of the fight.', 'B out of the fight': P === 'B' ? 'Your ships are out of the fight.' : 'The enemy is out of the fight.', mutual: 'Both sides are out of the fight.', time: 'Six hours passed without a result.', disengaged: 'The fleets drew too far apart to fight.', 'convoy through': 'The convoy crossed the line.', 'convoy stopped': 'The convoy was stopped.', 'raiders beaten': 'The raiders were beaten off.' };
    return R[reason] || (reason ? String(reason).charAt(0).toUpperCase() + String(reason).slice(1) + '.' : '');
  };
  U.other = function (S) { return S === 'A' ? 'B' : 'A'; };

  // ---------------------------------------------------------------- crew helpers
  U.stName = function (k) { return (D.STATION_NAMES && D.STATION_NAMES[k]) || k; };
  // an officer's first name, or the full name when someone else aboard shares it
  U.shortName = function (s, o) {
    var f = String(o.name || '').split(' ')[0], twin = (s.officers || []).some(function (x) { return x !== o && x.name !== o.name && String(x.name).split(' ')[0] === f; });
    return twin ? o.name : f;
  };
  // E.bandHarm for one ship, worked out at most about three times a second
  var harmC = {};
  U.harm = function (s) {
    if (!st || !s) return null;
    var now = performance.now(), c = harmC[s.id];
    if (c && c.w === st.w && now - c.at < 300) return c.v;
    var v = null; try { v = E.bandHarm(st.w, st.P, s.id); } catch (e) { v = null; }
    harmC[s.id] = { w: st.w, at: now, v: v };
    return v;
  };
  // the short harm line for one band: { hurt: [names], fill: [[name, seconds]] }, or null when it harms nobody
  U.harmLine = function (s, b) {
    var H = U.harm(s), r = H && H[b]; if (!r) return null;
    var byId = {}; (s.officers || []).forEach(function (o) { byId[o.id] = o; });
    var nm = function (x) { var o = byId[x.officer]; return o ? U.shortName(s, o) : String(x.name || '').split(' ')[0]; };
    var hurt = r.hurt.map(nm), hurtIds = {}; r.hurt.forEach(function (x) { hurtIds[x.officer] = 1; });
    var fill = r.strain.filter(function (x) { return !hurtIds[x.officer] && x.toFull > 0; }).sort(function (a, c) { return a.toFull - c.toFull; }).map(function (x) { return [nm(x), x.toFull]; });
    return hurt.length || fill.length ? { hurt: hurt, fill: fill } : null;
  };
  U.fmtIn = function (t) { t = Math.max(0, t || 0); if (t < 120) return Math.round(t) + ' s'; if (t < 5400) return Math.round(t / 60) + ' min'; var h = t / 3600; return (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h'; };

  // ---------------------------------------------------------------- battle state
  var st = null;
  U.st = function () { return st; };
  U.ownShips = function () { return st ? st.w.ships.filter(function (s) { return s.side === st.P; }) : []; };
  U.selShips = function () { if (!st) return []; if (st.sel === 'all') return U.ownShips().filter(E.active); var s = st.w.idx[st.sel]; return s ? [s] : []; };
  U.selShip = function () { if (!st) return null; if (st.sel === 'all') return U.ownShips().filter(E.active)[0] || null; return st.w.idx[st.sel] || null; };
  U.roleOf = function (s) { var M = st && st.w.ai && st.w.ai.side[st.P]; return (M && M.role && M.role[s.id]) || AI.roleOf(s); };
  U.doc = function (s) { return AI.DOC[U.roleOf(s)] || AI.DOC.sniper; };
  U.track = function (cid) { return st ? E.trackOf(st.w, st.P, cid) : null; };
  U.trackByOid = function (oid) { var tl = st.w.sides[st.P].tl; for (var i = 0; i < tl.length; i++) if (tl[i].oid === oid) return tl[i]; return null; };
  U.nameOf = function (id) { var o = st.w.idx[id]; if (o && o.side === st.P) return o.name || id; var tr = o && U.trackByOid(id); return tr ? (tr.name || tr.id) : (o && o.name) || id; };
  U.pc = function (s) {
    var p = st.pc[s.id];
    if (!p) p = st.pc[s.id] = { tgt: null, auto: null, grp: {}, laser: 'free', miss: { auto: true, n: (U.doc(s).salvo || 4) }, lastSalvo: -1e9 };
    return p;
  };
  U.grp = function (s, key) { var p = U.pc(s); return p.grp[key] || (p.grp[key] = { thr: 'auto', ammo: 'auto', n: 'auto' }); };
  // the ship's target: the player's pick if it is still on the plot, else the nearest live enemy ship
  U.targetOf = function (s) { var p = U.pc(s), tr = p.tgt && U.track(p.tgt); if (tr) return tr; return p.auto ? U.track(p.auto) : null; };

  function nearestEnemy(s) {
    var tl = st.w.sides[st.P].tl, best = null, bd = 1e18;
    for (var i = 0; i < tl.length; i++) { var c = tl[i]; if (c.kind !== 'ship' || c.disabled) continue; var d = hyp(c.ex - s.x, c.ey - s.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  U.start = function (scnKey, side, seed) {
    var w = E.create(scnKey, seed), P = side, O = U.other(side), cmd = {}, gun = {};
    cmd[P] = false; cmd[O] = true; gun[P] = false; gun[O] = true;
    AI.attach(w, { commander: cmd, gunnery: gun });
    st = { w: w, P: P, O: O, scn: scnKey, seed: seed, sel: null, speed: 'auto', autoL: 1000, paused: true, why: 'Battle ready. Give your orders, then resume.', acc: 0, frac: 0,
      pc: {}, ghosts: {}, fx: [], log: [], over: false, endShown: false, withdrew: false, thr: {}, lostLog: {}, minEta: Infinity, gate: {}, agg: {}, lastAgg: 0, manual: false, cardId: null, shots: {} };
    w.shotLog = [];   // the engine files every shot's outcome here for the log (see shotRec)
    var think = w.control, first = true;
    w.control = function (w) {
      var snap = null;
      if (first) snap = U.ownShips().map(function (s) { return [s, s.orders.gLimit, s.orders.evasion]; });
      think(w);
      if (first) { snap.forEach(function (a) { a[0].orders.gLimit = a[1]; a[0].orders.evasion = a[2]; }); first = false; }
      playerControl(w);
    };
    U.ownShips().forEach(function (s) {
      var r = AI.roleOf(s), P2 = AI.DOC[r] || AI.DOC.sniper, man;
      if (r === 'cargo') man = { type: 'coast' };
      else if (r === 'carrier') man = { type: 'hold', target: null, range: P2.hold, vmax: P2.holdV || P2.vmax };
      else if (r === 'missile') man = { type: 'hold', target: null, range: P2.hold, vmax: P2.vmax };
      else man = { type: 'close', target: null, range: P2.hold, vmax: P2.vmax };
      E.order(w, s.id, { man: man, gLimit: P2.gLimit, evasion: 'auto' });
      U.pc(s);
    });
    var first0 = U.ownShips().filter(E.active)[0];
    st.sel = first0 ? first0.id : 'all';
    autoTargets();
    U.addLog(D.SCENARIOS[scnKey].name + '. Seed ' + seed + '.', '');
    U.panels.onStart(); U.plot.onStart();
    U.pause(st.why, null, true);
    computeThreats();
    if (U.tutor) U.tutor.start(scnKey);
  };
  U.quit = function () { if (U.tutor) U.tutor.stop(); st = null; };

  // ---------------------------------------------------------------- orders from the panel
  U.order = function (o, ships) {
    if (!st) return;
    (ships || U.selShips()).forEach(function (s) {
      var oo = {}; for (var k in o) oo[k] = o[k];
      if (oo.man && oo.man.target === '@') { var tr = U.targetOf(s); oo.man = Object.assign({}, oo.man, { target: tr ? tr.id : null }); }
      E.order(st.w, s.id, oo);
    });
    U.sfx('click');
  };
  U.setTarget = function (cid) {
    if (!st) return;
    U.selShips().forEach(function (s) {
      U.pc(s).tgt = cid;
      var m = s.orders.man; if (m && m.target !== undefined && m.type !== 'manual' && m.type !== 'coast' && m.type !== 'station') m.target = cid || (U.targetOf(s) || {}).id || null;
    });
  };
  function autoTargets() {
    U.ownShips().forEach(function (s) {
      var p = U.pc(s); if (p.tgt && !U.track(p.tgt)) p.tgt = null;
      var cur = p.auto && U.track(p.auto), n = nearestEnemy(s);
      if (!cur || cur.disabled || (n && hyp(cur.ex - s.x, cur.ey - s.y) > 1.5 * hyp(n.ex - s.x, n.ey - s.y))) p.auto = n ? n.id : null;
      var m = s.orders.man, want = p.tgt || p.auto;
      if (m && (m.type === 'close' || m.type === 'hold' || m.type === 'break' || m.type === 'match') && want && (!m.target || !U.track(m.target) || (!p.tgt && m.target !== want) || (p.tgt && m.target !== p.tgt))) m.target = want;
    });
  }

  // ---------------------------------------------------------------- the player's gunnery computer (follows the panel's settings)
  function playerControl(w) {
    if (w.nTick % 10 === 0) autoTargets();
    if (w.nTick % 2 !== 0) return;
    var tl = w.sides[st.P].tl, missiles = [], drones = [];
    tl.forEach(function (c) { if (!c.firm) return; if (c.kind === 'missile') missiles.push(c); else if (c.kind === 'drone') drones.push(c); });
    U.ownShips().forEach(function (s) {
      if (!E.active(s)) return;
      var p = U.pc(s), P2 = U.doc(s), tgt = U.targetOf(s);
      s.mods.forEach(function (m) {
        if (m.state === 2) return;
        if (m.kind === 'rail') { if (tgt && tgt.firm && m.ammo > 0 && !m.burst && !m.pending && m.cd <= 0) railShot(w, s, m, tgt, P2, U.grp(s, m.key)); }
        else if (m.kind === 'laser') laserPick(s, m, tgt, missiles, drones, P2, p.laser);
      });
      if (p.miss.auto && tgt && tgt.firm && P2.launchAt && w.t - p.lastSalvo > (P2.salvoGap || 300)) {
        var d = hyp(tgt.ex - s.x, tgt.ey - s.y), load = rackLoad(s);
        if (load > 0 && d < P2.launchAt && d > 20000) { E.order(w, s.id, { launch: { target: tgt.id, n: Math.min(p.miss.n || 4, load) } }); p.lastSalvo = w.t; }
      }
    });
  }
  function rackLoad(s) { var l = 0; s.mods.forEach(function (m) { if (m.kind === 'rack' && m.state < 2) l += m.load - m.q.length; }); return l; }
  U.rackLoad = rackLoad;
  U.railThr = function (s, m, g) { if (g.thr === 'hold') return null; if (g.thr === 'auto') { var P2 = U.doc(s); return m.def.spinal ? P2.spinal : P2.rail; } return g.thr; };
  U.railN = function (m, g) { if (m.def.spinal) return 1; var n = g.n === 'auto' ? 4 : g.n; return Math.max(1, Math.min(n, m.ammo)); };
  // what the gunnery computer would do with one rail at this target: { est, ammo ('canister' or undefined), n, thr,
  // fire, what ('spinal', 'canister' or 'slug') }, or null when the group holds or there is no solution. The fire
  // rule and the aim label on the plot both read it, so the label quotes the round that is really going out.
  U.railPlan = function (w, s, m, tgt, g) {
    var thr = U.railThr(s, m, g); if (thr == null || !tgt) return null;
    // the spinal follows the AI's rule: a shot worth taking is ordered even mid-jink, since the engine holds it until the helm steadies
    if (m.def.spinal) {
      var e1 = E.hitEstimate(w, s, m.id, tgt.id, { n: 1 }); if (!e1 || !e1.ok) return null;
      return { est: e1, n: 1, thr: thr, what: 'spinal', fire: e1.chance >= thr || !!(e1.blocked && e1.steadyChance >= thr) };
    }
    var n = U.railN(m, g);
    if (g.ammo === 'canister') { var c = E.hitEstimate(w, s, m.id, tgt.id, { ammo: 'canister' }); return c && c.ok ? { est: c, ammo: 'canister', n: 1, thr: thr, what: 'canister', fire: c.chance >= thr } : null; }
    var es = E.hitEstimate(w, s, m.id, tgt.id, { n: n }); if (!es || !es.ok) return null;
    if (g.ammo === 'auto') {
      var ec = E.hitEstimate(w, s, m.id, tgt.id, { ammo: 'canister' });
      // as the AI chooses: one canister against one solid round, by expected damage, with canMinHits fragments on the hull
      var sv = es.expHits / n * es.slugPts, cv = ec && ec.ok ? ec.expHits * ec.fragPts : 0;
      if (cv > sv && ec.expHits >= N.canMinHits) return { est: ec, ammo: 'canister', n: 1, thr: thr, what: 'canister', fire: true };
    }
    return { est: es, n: n, thr: thr, what: 'slug', fire: es.chance >= thr };
  };
  // the Guns tab's live line under Ammo: what a slug (at the salvo size) and a canister would do at this target now,
  // e.g. "Now: 4 slugs 2% to hit. Canister 49%, about 3 fragments on the hull (25 do one slug's damage)." The round
  // Auto would pick is bold. Estimates are cached 250 ms per rail and target, as the plot's aim label does.
  var nowCache = {}, nowW = null;
  U.ammoNow = function (w, s, m, tgt, g) {
    if (!m || !tgt || m.def.spinal || m.ammo <= 0) return '';
    if (nowW !== w) { nowCache = {}; nowW = w; }
    var key = s.id + '/' + m.id + '/' + tgt.id + '/' + U.railN(m, g), t = performance.now(), c = nowCache[key];
    if (!c || t - c.t > 250) {
      var n = U.railN(m, g), es = E.hitEstimate(w, s, m.id, tgt.id, { n: n }), ec = E.hitEstimate(w, s, m.id, tgt.id, { ammo: 'canister' });
      c = nowCache[key] = { t: t, n: n, es: es && es.ok ? es : null, ec: ec && ec.ok ? ec : null };
    }
    if (!c.es && !c.ec) return '';
    // the Auto rule, as railPlan: one canister against one solid round by expected damage, canMinHits fragments on the hull
    var sv = c.es ? c.es.expHits / c.n * c.es.slugPts : 0, cv = c.ec ? c.ec.expHits * c.ec.fragPts : 0;
    var pick = g.ammo !== 'auto' ? null : c.ec && cv > sv && c.ec.expHits >= N.canMinHits ? 'canister' : 'slug';
    var f = c.ec ? c.ec.expHits : 0, fr = f >= 1 ? String(Math.round(f)) : f >= 0.05 ? f.toFixed(1) : 'under 0.1';
    var a = c.es ? c.n + (c.n > 1 ? ' slugs ' : ' slug ') + U.pct(c.es.chance) + ' to hit' : '';
    var b = c.ec ? (a ? 'Canister ' : 'canister ') + U.pct(c.ec.chance) + ', ' + (f >= 0.05 ? 'about ' : '') + fr + ' fragment' + (fr === '1' ? '' : 's') + ' on the hull' : '';
    if (pick === 'slug' && a) a = '<b>' + a + '</b>';
    if (pick === 'canister' && b) b = '<b>' + b + '</b>';
    return 'Now: ' + (a ? a + '.' : '') + (a && b ? ' ' : '') + (b ? b + ' (' + Math.round(N.canN / N.fragK) + ' do one slug\'s damage).' : '');
  };
  function railShot(w, s, m, tgt, P2, g) {
    var pl = U.railPlan(w, s, m, tgt, g); if (!pl) return;
    // the helm is told what a spinal shot is worth so it holds steady for it
    if (m.def.spinal) { var e1 = pl.est, M = w.ai && w.ai.side[st.P], mem = M && M.ship && M.ship[s.id]; if (mem) mem.spin = { t: w.t, p: e1.steadyChance != null ? e1.steadyChance : e1.chance }; }
    if (pl.fire) E.order(w, s.id, { fireNow: pl.ammo ? { weapon: m.id, target: tgt.id, ammo: pl.ammo } : { weapon: m.id, target: tgt.id, n: pl.n } });
  }
  // seconds until a round (or missile) at x, y moving vx, vy comes closest to a track; null once it is past
  U.etaTo = function (x, y, vx, vy, tr) {
    if (!tr) return null; var rx = tr.ex - x, ry = tr.ey - y, ux = (tr.vx || 0) - vx, uy = (tr.vy || 0) - vy, u2 = ux * ux + uy * uy;
    var t = u2 > 1e-9 ? -(rx * ux + ry * uy) / u2 : null; return t != null && t > 0 ? t : null;
  };
  // an Approach or Hold whose drive points away from the target while still closing: the flip to brake
  U.braking = function (s) {
    var m = s.orders.man, tr = U.targetOf(s); if (!m || (m.type !== 'close' && m.type !== 'hold') || !tr || !E.active(s)) return false;
    var dx = tr.ex - s.x, dy = tr.ey - s.y, d = hyp(dx, dy) || 1, a = hyp(s.ax || 0, s.ay || 0), cl = -(dx * (tr.vx - s.vx) + dy * (tr.vy - s.vy)) / d;
    return a > 0.05 * G && cl > 0.2 && ((s.ax || 0) * dx + (s.ay || 0) * dy) / (a * d) < -0.5;
  };
  function nearestOf(list, s) { var b = null, bd = 1e18; list.forEach(function (c) { var d = hyp(c.ex - s.x, c.ey - s.y); if (d < bd) { bd = d; b = c; } }); return b ? { c: b, d: bd } : null; }
  function laserPick(s, m, tgt, missiles, drones, P2, mode) {
    if (mode === 'hold') { m.target = null; return; }
    var mn = nearestOf(missiles, s), dn = nearestOf(drones, s), pick = null;
    if (mn && mn.d < 25000) pick = mn.c;
    else if (dn && dn.d < 12000) pick = dn.c;
    else if (mode === 'free' && tgt && tgt.firm && hyp(tgt.ex - s.x, tgt.ey - s.y) < Math.max(P2.laserAt || 0, 40000)) {
      var e = E.hitEstimate(st.w, s, m.id, tgt.id, {}); if (e && e.ok && e.chance * e.dmgFactor > 0.004) pick = tgt;
    }
    m.target = pick ? pick.id : null;
  }
  U.fireNow = function (s, key) {
    var g = U.grp(s, key), tgt = U.targetOf(s), n = 0; if (!tgt) return 0;
    s.mods.forEach(function (m) {
      if (m.key !== key || m.state === 2) return;
      if (m.kind === 'rail' && m.ammo > 0 && !m.burst && !m.pending) { var ok = E.order(st.w, s.id, { fireNow: { weapon: m.id, target: tgt.id, n: U.railN(m, g), ammo: g.ammo === 'canister' ? 'canister' : undefined } }); if (ok && (m.burst || m.pending)) n++; }
      if (m.kind === 'laser') { m.target = tgt.id; n++; }
    });
    U.sfx('click'); return n;
  };

  // ---------------------------------------------------------------- threats to each own ship
  // E.threatPreview gives {id, kind, eta, hit:{off,cruise,combat,brace,crash}, n, src, wk} per salvo, round, missile or striker
  var STEPS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  U.riskOf = function (s, t) { var b = s.orders.evasion === 'off' ? 'off' : s.orders.gLimit; return t.hit ? (t.hit[b] != null ? t.hit[b] : t.hit.combat) : 0.5; };
  function computeThreats() {
    var w = st.w, v = st.view = E.view(w, st.P), out = {}, own = v.own.filter(E.active), byId = {}, sv = new Map();
    for (var i = 0; i < w.slugs.length; i++) { var p = w.slugs[i]; if (p.side !== st.P) byId[p.id] = p; }
    // the next thing worth watching, in game seconds, and what it is
    // k is 'near' for a contact at or nearing weapon range, 'own' for our own shots, and empty for a threat to us
    var ev = { '': [Infinity, ''], own: [Infinity, ''], near: [Infinity, ''] };
    function soon(T, text, k) { var e = ev[k || '']; if (T < e[0]) { e[0] = T; e[1] = text; } }
    own.forEach(function (s) {
      var list = [];
      try { list = (E.threatPreview(w, st.P, s.id) || []).map(function (t) { return { id: t.id, kind: t.kind, eta: t.eta, hit: t.hit, n: t.n || 1, src: t.src, wk: t.wk }; }); } catch (e) { list = []; }
      list.forEach(function (t) {
        var p0 = byId[t.id] || (String(t.id).charAt(0) === 'v' ? byId[String(t.id).slice(1)] : null);
        if (p0) { if (p0.kind === 'can' || p0.kind === 'frag') t.wk = 'canister'; sv.set(p0.sv || p0, t); }
        t.risk = U.riskOf(s, t);
        // a round with a long-shot chance does not slow the clock; a real one slows it to its ETA
        if (t.risk >= 0.03) soon(t.eta, (t.kind === 'missile' || t.kind === 'payload' ? 'missile' : t.kind === 'drone' ? 'striker' : 'rounds') + ' inbound on ' + s.name);
      });
      list.sort(function (a, b) { return a.eta - b.eta; });
      out[s.id] = list;
    });
    // salvos are keyed by the round group so the plot can draw every round of a threat red
    st.thr = out; st.thrSv = sv;
    // rounds aimed at us are seen as they leave the gun's light: log the first sight of each volley, and pause once in a while
    if (!st.seenThr) st.seenThr = {};
    own.forEach(function (s) {
      (out[s.id] || []).forEach(function (t) {
        if (t.kind === 'missile' || t.kind === 'payload' || st.seenThr[t.id]) return; st.seenThr[t.id] = w.t;
        var what = t.kind === 'drone' ? 'Striker' : t.wk === 'canister' ? 'Canister' : (t.n > 1 ? t.n + ' rounds' : 'A round');
        var risky = t.risk >= 0.03;
        if (risky || gate('rlog', 180)) U.addLog(what + ' inbound on ' + s.name + ', impact in ' + U.fmtEta(t.eta) + (t.hit ? ', ' + U.pct(t.risk) + ' to hit' : '') + '.', risky ? 'bad' : '');
        if (risky && gate('rounds', 600)) U.pause(what + ' inbound on ' + s.name + ', ' + U.fmtEta(t.eta) + ' out.', 'launch');
      });
    });
    // our own rounds, missiles and strikers in flight; each counts only while it is still closing, so a miss
    // that has flown past stops holding the clock down
    var lasers = false;
    w.ships.forEach(function (s) { if (s.laserOn && E.active(s)) lasers = true; });
    w.slugs.forEach(function (p) { if (p.side === st.P && p.kind !== 'frag' && p.kind !== 'pen') { var T = w.idx[p.tgt]; if (T) { var d = hyp(T.x - p.x, T.y - p.y), c = -((T.x - p.x) * (T.vx - p.vx) + (T.y - p.y) * (T.vy - p.vy)) / (d || 1); if (c > 0.1) soon(d / c, 'our rounds reach ' + U.nameOf(p.tgt), 'own'); } } });
    v.missiles.forEach(function (m) { var tr = U.track(m.tgt) || (w.idx[m.tgt] && U.trackByOid(m.tgt)); if (tr) { var d = hyp(tr.ex - m.x, tr.ey - m.y), c = -((tr.ex - m.x) * (tr.vx - m.vx) + (tr.ey - m.y) * (tr.vy - m.vy)) / (d || 1); if (c > 0.1) soon(d / c, 'our missiles reach ' + tr.id, 'own'); } });
    v.drones.forEach(function (d) {
      if (d.docked || d.mode !== 'strike' || !d.tgt) return; var tr = U.track(d.tgt); if (!tr) return;
      var dx = tr.ex - d.x, dy = tr.ey - d.y, dl = hyp(dx, dy) || 1, c = -(dx * (tr.vx - d.vx) + dy * (tr.vy - d.vy)) / dl;
      if (d.payload > 0 && c > 0.1 && dl > N.strikeRelease) soon((dl - N.strikeRelease) / c, 'strikers reach ' + tr.id, 'own');
    });
    // ship tracks: a loss is logged once it has lasted three minutes, and a regained track once it has held firm
    // for three minutes. Nothing is said once the fight is over or either side has no ship left in it.
    var quietT = w.over || st.over || !own.length || !w.ships.some(function (x) { return x.side === st.O && E.active(x); });
    v.contacts.forEach(function (c) {
      if (c.kind !== 'ship') return;
      var k = st.lostLog[c.id] || (st.lostLog[c.id] = { lost: false, since: w.t, firm: c.firm }), o = w.idx[c.oid];
      if (c.firm !== k.firm) { k.firm = c.firm; k.since = w.t; }
      if (quietT || (o && o.status === 'destroyed') || w.t - k.since < 180 || k.lost === !c.firm) return;
      k.lost = !c.firm; U.addLog((k.lost ? 'Lost the track on ' : 'Regained the track on ') + c.id + '.', 'see');
    });
    // contacts nearing weapon range: ships at 45,000 km, drones at 15,000 km
    own.forEach(function (s) {
      v.contacts.forEach(function (c) {
        if (c.kind === 'missile' || !c.firm || c.disabled) return;
        var dx = c.ex - s.x, dy = c.ey - s.y, d = hyp(dx, dy) || 1, cl = -(dx * (c.vx - s.vx) + dy * (c.vy - s.vy)) / d;
        var R = c.kind === 'ship' ? 45000 : 15000, nm = c.kind === 'ship' ? c.id : 'drones';
        if (d < R) { soon(c.kind === 'ship' ? 200 : 100, nm + ' in weapon range', 'near'); return; }
        if (cl > 0.05) soon((d - R) / cl, nm + ' nears weapon range', 'near');
      });
    });
    // Auto runs about four game seconds per real second for each second left to the next event, in fixed steps.
    // A contact near or in weapon range never takes the clock below x100. Our own shots in flight set it so they
    // land about ten real seconds out, and never below x20. Only a threat to us slows it further.
    // The slowest of the three wins.
    function stepFor(T) { for (var k = 0; k < STEPS.length; k++) if (STEPS[k] <= T / 4) return STEPS[k]; return 1; }
    var L = 1000, next = Infinity, why = 'nothing inbound or in range';
    function take(l, e) { if (e[0] === Infinity) return; if (l < L || (l === L && e[0] < next)) { L = l; next = e[0]; why = e[1]; } }
    var T0 = ev[''][0], lt = stepFor(T0); if (T0 < 30) lt = Math.min(lt, 10); if (T0 < 12) lt = Math.max(2, lt);
    take(lt, ev['']);
    take(Math.max(20, stepFor(ev.own[0] * 2.5)), ev.own);
    take(Math.max(100, stepFor(ev.near[0])), ev.near);
    if (lasers && L > 100) { L = 100; why = 'lasers firing'; }
    st.minEta = Math.min(T0, ev.own[0], ev.near[0]);
    st.autoL = L; st.autoWhy = why + (next < Infinity ? ', ' + U.fmtEta(next) : '');
  }
  U.computeThreats = function () { if (st) computeThreats(); };
  U.level = function () { if (!st || st.paused || st.over) return 0; return st.speed === 'auto' ? st.autoL : st.speed; };

  // ---------------------------------------------------------------- pause and time
  U.pause = function (why, key, quiet) {
    if (!st) return;
    if (key && !U.set.pause[key]) return;
    st.paused = true; st.why = why || ''; st.acc = 0;
    if (!quiet) U.sfx('pause');
    U.panels.banner(why);
  };
  U.resume = function () { if (!st || st.over) return; st.paused = false; st.why = ''; U.panels.banner(null); };
  U.togglePause = function () { if (!st) return; if (st.paused) U.resume(); else U.pause('Paused.', null, true); };
  U.setSpeed = function (sp) { if (!st) return; st.speed = sp; if (st.paused) U.resume(); };

  // ---------------------------------------------------------------- the log
  U.addLog = function (text, cls, shot) {
    if (!st) return;
    st.log.push({ t: st.w.t, text: text, cls: cls || '', shot: !!shot }); if (st.log.length > 200) st.log.shift();
    U.panels.log();
  };
  function gate(k, dt) { var t = st.w.t; if (st.gate[k] != null && t - st.gate[k] < dt) return false; st.gate[k] = t; return true; }
  function agg(k, n, pts) { var a = st.agg[k] || (st.agg[k] = { n: 0, pts: 0, t0: st.w.t }); a.n += n || 0; a.pts += pts || 0; }
  var DK_BY = { life: 'out of fuel', planet: 'hit the planet', nuke: 'nuclear blast', docked: '' };
  function flushAgg(force) {
    var t = st.w.t; if (!force && t - st.lastAgg < 30) return; st.lastAgg = t;
    for (var k in st.agg) {
      var a = st.agg[k], parts = k.split('|'); if (!a.n && !a.pts) continue;
      if (parts[0] === 'lz') U.addLog((parts[1] === st.P ? U.nameOf(parts[2]) + ' under laser fire: ' : 'Our lasers on ' + U.nameOf(parts[2]) + ': ') + a.pts.toFixed(1) + ' pts', parts[1] === st.P ? 'bad' : 'good');
      else if (parts[0] === 'dc') U.addLog(a.n + ' new drone contact' + (a.n > 1 ? 's' : ''), 'see');
      else if (parts[0] === 'mk') U.addLog((parts[1] === st.P ? 'We lost ' : 'Shot down ') + a.n + ' missile' + (a.n > 1 ? 's' : '') + (parts[1] === st.P ? '' : ' (' + U.wkName(parts[2], true) + ')'), parts[1] === st.P ? 'bad' : 'good');
      else if (parts[0] === 'dk') U.addLog((parts[1] === st.P ? 'Lost ' : 'Killed ') + a.n + ' ' + U.droneName(parts[2], a.n) + (DK_BY[parts[3]] ? ' (' + DK_BY[parts[3]] + ')' : parts[3] && parts[3] !== 'undefined' ? ' (' + U.wkName(parts[3], true) + ')' : ''), parts[1] === st.P ? 'bad' : 'good');
      else if (parts[0] === 'sk') U.addLog(a.n + ' of our ' + U.droneName(parts[1], 2) + ' docked', '');
    }
    st.agg = {};
  }
  var FACE = { nose: 'the nose', flank: 'the flank', tail: 'the tail' };
  function onEvent(e) {
    var P = st.P, mine = e.side === P, w = st.w;
    if (U.tutor) U.tutor.ev(e);
    switch (e.type) {
      case 'contact':
        if (!mine) return;
        if (e.kind === 'ship') { var tr = U.track(e.contact); autoTargets(); if (!st.sawShip) { st.sawShip = true; U.plot.fit(); } U.addLog('New contact ' + e.contact + ': ' + ((tr && tr.cls) || 'ship') + ' at ' + U.fmtKm(tr ? hypS(tr) : 0), 'see'); if (gate('contact', 5)) U.pause('New contact ' + e.contact + ' (' + ((tr && tr.cls) || 'ship') + ').', 'contact'); }
        else if (e.kind === 'drone') agg('dc|' + P, 1);
        return;
      case 'lost':
        // logged from computeThreats once the loss has lasted three minutes, so a track that flickers stays quiet
        return;
      case 'decoyRevealed': if (mine) U.addLog(e.contact + ' was a decoy.', 'see'); return;
      case 'launch':
        if (!mine) return;
        U.addLog('Launch detected: ' + e.n + ' missile' + (e.n > 1 ? 's' : '') + '.', 'bad'); U.sfx('launch');
        if (gate('launch', 60)) U.pause('Launch detected: ' + e.n + ' missile' + (e.n > 1 ? 's' : '') + '.', 'launch');
        return;
      case 'impact':
        var laser = e.by === 'laser' || e.by === 'lancer' || e.by === 'pdl';
        // the log line for every hit comes from the shot log (one line per salvo, burst or missile group);
        // an impact on us still sounds and pauses at once
        if (laser) { if (mine && gate('lzp' + e.ship, 1e9)) U.pause(U.nameOf(e.ship) + ' is under laser fire.', 'impact'); return; }
        if (mine) { U.sfx('impact'); if (gate('imp', 10)) U.pause(U.nameOf(e.ship) + ' hit by ' + U.wkName(e.by, true) + ' on ' + (FACE[e.face] || 'the hull') + '.', 'impact'); }
        return;
      case 'miss': return;   // said in the shot log
      case 'crippled': case 'disabled': case 'destroyed': case 'captured':
        var nm = U.nameOf(e.ship), word = { crippled: 'crippled: the drive is out', disabled: 'disabled', destroyed: 'destroyed', captured: 'captured' }[e.type];
        U.addLog(nm + ' ' + word + '.', mine ? 'bad' : 'good');
        if (e.type === 'destroyed') U.sfx('kill');
        if (mine && e.type !== 'crippled') U.pause(nm + ' ' + word + '.', 'disabled');
        else if (mine) U.pause(nm + ' ' + word + '.', 'disabled');
        return;
      // the ship-level strain events: officerStrain says who, so these only pause and warn
      case 'strainCritical': if (mine && gate('str' + e.ship, 120)) { var wc = worstOf(e.ship); U.pause((wc ? wc.name + ' is at full strain.' : U.nameOf(e.ship) + ': crew strain critical.') + ' Ease the G limit.', 'strain'); } return;
      // officers: story cast always logs; others are held to one hurt line every two minutes each
      case 'officerHurt':
        if (!mine) return;
        var oh = officerOf(e);
        if ((oh && oh.story) || gate('oh' + e.officer, 120)) U.addLog(shipPre(e) + e.name + ' is hurt (' + HURT_WHY(e) + ').', 'bad');
        return;
      case 'officerStrain':
        if (!mine) return;
        var os = officerOf(e);
        if ((os && os.story) || gate('os' + e.officer, 300)) U.addLog(shipPre(e) + e.name + ' is at full strain.', 'bad');
        return;
      case 'officerDown':
        if (!mine) return;
        U.addLog(shipPre(e) + e.name + ' is down. ' + (RATING[e.station] || 'A rating covers the post.'), 'bad');
        if (gate('odp', 30)) U.pause(e.name + ' is down. A rating covers at ' + Math.round(N.ratingEff * 100) + '%.', 'crew');
        return;
      case 'ratingCovers': return;   // said with officerDown
      case 'identified': if (mine) U.addLog(e.contact + ' identified. Its crew shows on the contact card.', 'see'); return;
      case 'strainHigh': if (mine && gate('sh' + e.ship, 300)) { var wh = worstOf(e.ship); U.addLog(shipPre(e) + (wh ? wh.name + ' is near full strain.' : 'Crew strain is high.'), ''); } return;
      case 'repaired': if (mine) U.addLog(U.nameOf(e.ship) + ': ' + e.module + ' back in service.', ''); return;
      case 'wardlineDown': if (mine) U.addLog(U.nameOf(e.ship) + ': wardline down.', 'bad'); return;
      // enemy sand is logged once every fifteen minutes at most; the cloud itself shows on the plot
      case 'sand': if (mine || gate('esand', 900)) U.addLog((mine ? U.nameOf(e.ship) : 'Enemy') + ' cast sand.', mine ? '' : 'see'); return;
      case 'missileKilled': return;   // said in the shot log, with the rest of that missile group
      case 'droneKilled': agg('dk|' + e.side + '|' + e.drone + '|' + e.by, 1); return;
      case 'strikerRelease': if (mine) U.addLog('Striker released on ' + e.target + ' at ' + U.fmtKm(e.range) + '.', 'good'); return;
      case 'docked': if (mine) agg('sk|' + e.drone, 1); return;
      case 'end': flushAgg(true); shotFlush(true); U.addLog('Cease fire. ' + U.endWhy(e.reason), e.winner === P ? 'good' : e.winner === st.O ? 'bad' : ''); return;
    }
  }
  var RATING = { helm: 'A rating has the helm.', guns: 'A rating has the guns.', sensors: 'A rating has the sensors.', engineering: 'A rating runs engineering.', flight: 'A rating runs the flight deck.' };
  var HIT_AT = { helm: 'hit at the helm', guns: 'hit at the guns', sensors: 'hit at the sensors', engineering: 'hit in engineering', flight: 'hit on the flight deck' };
  function HURT_WHY(e) { return e.cause === 'g' ? 'hard burn' : e.cause === 'strain' ? 'full strain' : HIT_AT[e.station] || 'hit'; }
  function officerOf(e) { var s = st.w.idx[e.ship]; if (!s || !s.officers) return null; for (var i = 0; i < s.officers.length; i++) if (s.officers[i].id === e.officer) return s.officers[i]; return null; }
  function worstOf(id) { var s = st.w.idx[id], b = null; (s && s.officers || []).forEach(function (o) { if (!o.down && (!b || o.strain > b.strain)) b = o; }); return b; }
  function shipPre(e) { return U.ownShips().length > 1 ? U.nameOf(e.ship) + ': ' : ''; }
  function hypS(tr) { var s = U.selShip() || U.ownShips()[0]; return s ? hyp(tr.ex - s.x, tr.ey - s.y) : 0; }

  // ---------------------------------------------------------------- our own fire, said in the log
  // Rounds are counted per ship and kind; a line goes out a few seconds after the first round (so a burst is one
  // line), then at most every two minutes per ship and kind, covering what was fired since. Also: a rail running
  // dry, and the flip to brake on Approach or Hold (the nose swings away from the enemy, which reads as a retreat).
  var FIRE_GAP = 120, RNAME = { slug: ['railgun round', 'railgun rounds'], spinal: ['spinal round', 'spinal rounds'], canister: ['canister', 'canisters'] };
  function tgtName(oid) { var tr = U.trackByOid(oid); return tr ? tr.id + (tr.name ? ' ' + tr.name : '') : U.nameOf(oid); }
  function ownFire(w) {
    var F = st.fire || (st.fire = {});
    for (var i = 0; i < w.slugs.length; i++) {
      var p = w.slugs[i]; if (p.side !== st.P || p.__ui || (p.kind !== 'slug' && p.kind !== 'can')) continue; p.__ui = 1;
      var what = p.kind === 'can' ? 'canister' : p.wk === 'spinal' ? 'spinal' : 'slug', k = p.src + '|' + what;
      var r = F[k] || (F[k] = { ship: p.src, what: what, n: 0, t0: 0, last: -1e9 });
      if (!r.n) r.t0 = w.t; r.n++; r.p = p; r.tgt = p.tgt; r.est = p.sv && p.sv.est;
    }
    for (var key in F) {
      var f = F[key]; if (!f.n || w.t - f.t0 < 5 || w.t - f.last < FIRE_GAP) continue;
      var q = f.p, eta = U.etaTo(q.x, q.y, q.vx, q.vy, U.trackByOid(f.tgt));
      U.addLog(U.nameOf(f.ship) + ' fires ' + (f.n > 1 ? f.n + ' ' + RNAME[f.what][1] : 'a ' + RNAME[f.what][0]) + ' at ' + tgtName(f.tgt) + (eta != null ? ', impact ' + U.fmtEta(eta) : '') + (f.est != null ? ', ' + U.pct(f.est) + ' to hit' : '') + '.', 'own', true);
      f.n = 0; f.last = w.t;
    }
    U.ownShips().forEach(function (s) {
      if (!E.active(s)) return;
      s.mods.forEach(function (m) { if (m.kind === 'rail' && m.state < 2 && m.ammo <= 0 && !m.__dry) { m.__dry = 1; U.addLog(s.name + ': ' + (m.def.name.charAt(0).toLowerCase() + m.def.name.slice(1)) + ' dry, no rounds left.', 'bad'); } });
      var b = U.braking(s); if (b && !s.__brk && gate('brk' + s.id, 600)) U.addLog(s.name + ' flips to brake: the drive faces ' + ((U.targetOf(s) || {}).id || 'the enemy') + '. ' + (s.mods.some(function (m) { return m.kind === 'rail' && !m.def.spinal || m.kind === 'laser'; }) ? 'Turrets still bear.' : 'The spinal swings round to fire.'), 'see');
      s.__brk = b;
    });
  }

  // ---------------------------------------------------------------- every shot's outcome, said in the log
  // The engine files one record per finished salvo or canister, per laser pulse on a ship, and per missile that
  // ends (w.shotLog). They are grouped by side, shooter, weapon and target, and a group becomes one line when its
  // window closes: 10 s of game time, stretched at high speed so a line lasts about 1.5 s on screen (at most
  // 10 min). A laser line covers one burst: it closes after a 3 s gap in the pulses.
  function shotWin() { var sp = st.speed === 'auto' ? st.autoL : +st.speed || 1; return Math.min(600, Math.max(10, 1.5 * sp)); }
  function fmtPts(p) { return p >= 0.05 ? p.toFixed(1) + ' pts' : p > 0 ? 'under 0.1 pts' : '0 pts'; }
  function objName(id) {
    var o = st.w.idx[id]; if (!o) return id ? String(id) : 'the target';
    if (o.kind === 'drone') return (o.side === st.P ? 'our ' : 'a ') + U.droneName(o.type, 1);
    if (o.kind === 'missile') return 'a missile';
    return o.side === st.P ? (o.name || id) : U.trackByOid(id) ? U.nameOf(id) : 'an unseen ship';
  }
  // who fired, for the front of the line: nothing for our only ship, a name otherwise
  function shooterPre(side, src) {
    var o = st.w.idx[src];
    if (side === st.P) return o && o.kind === 'ship' && U.ownShips().length > 1 ? (o.name || src) + ' ' : '';
    if (o && o.kind === 'drone') return 'Their ';
    return U.trackByOid(src) ? U.nameOf(src) + ' ' : 'Enemy ';
  }
  // the ship and weapon that shot a missile down ('Insistence's flak'), or the drones that did
  function killer(who, by, n) {
    var o = who && st.w.idx[who];
    if (o && o.kind === 'drone') return (o.side === st.P ? 'our ' : 'their ') + U.droneName(o.type, n);
    return (o ? objName(who) + "'s " : '') + U.wkName(by, true);
  }
  function lead(side, src, wpn) { var p = shooterPre(side, src); return p ? p + wpn.charAt(0).toLowerCase() + wpn.slice(1) : wpn; }
  function shotLine(text, side) { U.addLog(text, side === st.P ? 'own' : 'bad', true); }
  var MISS_AT = function (up, lat) { return Math.abs(up) >= Math.abs(lat) ? (up > 0 ? 'above' : 'below') : (lat > 0 ? 'to port' : 'to starboard'); };
  function shotRec(r) {
    var G = st.shots || (st.shots = {}), key = r.k + '|' + r.side + '|' + r.src + '|' + r.wk + '|' + (r.k === 'mis' ? '' : r.tgt), g = G[key];
    if (!g) g = G[key] = { k: r.k, side: r.side, src: r.src, wk: r.wk, tgt: r.tgt, t0: r.t, last: r.t, n: 0, r: 0, hits: 0, rHit: 0, pts: 0, up: 0, lat: 0, mN: 0, mD: 0, on: 0, shed: 0, smear: 0, mod: 0, out: { hit: 0, miss: 0, down: 0 }, by: {}, tg: {} };
    g.last = r.t; g.pts += r.pts || 0;
    if (r.k === 'rail') { g.n += r.n; g.r += r.r; g.hits += r.hits; if (r.hits) g.rHit += r.r; else if (r.mN) { g.up += r.up * r.mN; g.lat += r.lat * r.mN; g.mN += r.mN; g.mD += r.mD; } }
    else if (r.k === 'lz') { g.n++; if (r.hit) { g.on++; if (r.shed) g.shed++; if (r.smear) g.smear++; } if (r.mod) g.mod++; }
    else { g.n++; g.out[r.out]++; if (r.out === 'down') { var bk = (r.who || '') + '|' + r.by; g.by[bk] = (g.by[bk] || 0) + 1; } if (r.tgt) g.tg[r.tgt] = 1; }
  }
  function shotSay(g) {
    var wpn, body;
    if (g.k === 'rail') {
      var can = g.wk === 'canister';
      wpn = (g.wk === 'spinal' ? 'Spinal railgun' : 'Railgun') + ' on ' + objName(g.tgt);
      var ship = st.w.idx[g.tgt] && st.w.idx[g.tgt].kind === 'ship';
      var what = can ? g.r + (g.r > 1 ? ' canisters' : ' canister') : g.n + (g.n > 1 ? ' slugs' : ' slug');
      if (g.hits) {
        var hitN = can ? g.rHit : g.hits;
        var of = can ? g.r : g.n;
        body = what + ', ' + (of === 1 ? 'hit' : hitN === of ? 'all hit' : hitN + ' hit') + (can ? ' (' + g.hits + ' of ' + g.n + ' fragments)' : '') + (ship ? ', ' + fmtPts(g.pts) : '');
      } else {
        // how far off: the average miss of each round (or fragment) as it went by, and the side the pattern's
        // centre went; a pattern centred on the target that still missed went by on all sides
        var avg = g.mN ? g.mD / g.mN : null, cen = g.mN ? Math.sqrt(g.up * g.up + g.lat * g.lat) / g.mN : 0;
        var how = avg == null ? '' : g.mN > 1 && cen < avg / 2 ? ' (' + (can ? 'fragments' : 'rounds') + ' passed on all sides, ' + U.fmtKm(avg) + ' off on average)'
          : ' (passed ' + U.fmtKm(avg) + ' ' + MISS_AT(g.up, g.lat) + (g.mN > 1 ? ' on average' : '') + ')';
        body = what + ', ' + (can ? 'no fragment hit' : g.n > 1 ? 'none hit' : 'missed') + how;
      }
    } else if (g.k === 'lz') {
      wpn = U.wkName(g.wk) + ' on ' + objName(g.tgt);
      var burst = g.n + ' s burst';
      var onT = g.on < g.n ? ', ' + g.on + ' s on target' : '';
      // shed: too far for the beam to beat the armour's threshold; smeared: the target's dodge dragged the spot
      if (!g.on) body = burst + ', all off target';
      else if (g.shed === g.on) body = burst + onT + ', all shed by armour (too far)';
      else body = burst + onT + ', ' + fmtPts(g.pts) + (g.mod ? ', ' + g.mod + ' hit' + (g.mod > 1 ? 's' : '') + ' on outboard gear' : '') + (g.smear * 2 > g.on ? ', spot smeared by the dodge' : '');
    } else {
      var tk = Object.keys(g.tg), nm = U.wkName(g.wk);
      wpn = nm + (/s$/.test(nm) ? '' : 's') + (tk.length === 1 ? ' at ' + objName(tk[0]) : '');
      var parts = [], O = g.out;
      if (O.hit) parts.push(O.hit + ' hit' + (g.pts > 0 ? ' for ' + fmtPts(g.pts) : ''));
      if (O.down) {
        var bys = Object.keys(g.by), one = bys.length === 1 ? bys[0].split('|') : null;
        if (one) parts.push(O.down + ' shot down by ' + killer(one[0], one[1], O.down));
        else parts.push(O.down + ' shot down (' + bys.map(function (b) { var q = b.split('|'); return g.by[b] + ' by ' + killer(q[0], q[1], g.by[b]); }).join(', ') + ')');
      }
      if (O.miss) parts.push(O.miss + ' missed');
      body = parts.join(', ');
    }
    shotLine(lead(g.side, g.src, wpn) + ': ' + body + '.', g.side);
  }
  function shotFlush(force) {
    var G = st.shots; if (!G) return;
    var t = st.w.t, W = shotWin();
    for (var k in G) {
      var g = G[k], done = force || (g.k === 'lz' ? t - g.last > 3 || t - g.t0 >= Math.max(30, W) : t - g.t0 >= W);
      if (done) { delete G[k]; shotSay(g); }
    }
  }

  // ---------------------------------------------------------------- per tick: events, ghosts, beams
  function afterTick() {
    var w = st.w, evs = E.events(w), i;
    if (w.shotLog) { for (i = 0; i < w.shotLog.length; i++) shotRec(w.shotLog[i]); w.shotLog.length = 0; }
    for (i = 0; i < evs.length; i++) onEvent(evs[i]);
    flushAgg(false); shotFlush(false);
    if (w.t % 20 === 0) {
      var tl = w.sides[st.P].tl, seen = {};
      tl.forEach(function (c) { seen[c.id] = 1; var g = st.ghosts[c.id] || (st.ghosts[c.id] = []); var l = g[g.length - 1]; if (!l || l.x !== c.x || l.y !== c.y) { g.push({ x: c.x, y: c.y, t: c.tObs }); if (g.length > 14) g.shift(); } });
      for (var k in st.ghosts) if (!seen[k]) delete st.ghosts[k];
    }
    ownFire(w);
    var now = performance.now();
    w.beams.forEach(function (b) {
      if (b.__ui) return; b.__ui = 1;
      var S = w.idx[b.src]; if (!S) return;
      if (b.side === st.P) st.fx.push({ k: 'beam', x1: S.x, y1: S.y, x2: b.ax, y2: b.ay, until: now + 350, own: true });
      else { var T = w.idx[b.obj] || null, tr = U.trackByOid(b.src); if (tr && (!T || T.side === st.P || (T.mother && w.idx[T.mother] && w.idx[T.mother].side === st.P))) st.fx.push({ k: 'beam', x1: tr.x, y1: tr.y, x2: b.ax, y2: b.ay, until: now + 350, own: false }); }
    });
    if (st.fx.length > 200) st.fx.splice(0, st.fx.length - 200);
  }

  // ---------------------------------------------------------------- the frame loop
  var last = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.25, (ts - last) / 1000) : 0; last = ts;
    if (st) {
      var w = st.w;
      if (!st.paused && !st.over) {
        var L = st.speed === 'auto' ? st.autoL : st.speed, t0 = performance.now();
        st.acc += dt * L;
        while (st.acc >= 1) {
          E.step(w, 1); st.acc -= 1; afterTick();
          if (w.t % 5 === 0 || L <= 10) computeThreats();
          if (U.tutor) U.tutor.tick();
          var L2 = st.speed === 'auto' ? st.autoL : L;
          if (L2 < L) { st.acc = Math.min(st.acc, 1); L = L2; }
          if (st.paused || w.over) { st.acc = 0; break; }
          if (performance.now() - t0 > 9) { st.acc = Math.min(st.acc, 1); break; }
        }
        st.frac = Math.max(0, Math.min(1, st.acc));
        if (w.over && !st.over) { flushAgg(true); st.over = true; st.paused = true; setTimeout(function () { if (st && !st.endShown) { st.endShown = true; if (!(U.tutor && U.tutor.atEnd(U.panels.end))) U.panels.end(); } }, 900); }
      } else st.frac = 0;
      if (st.paused && ts - (st.thrTs || 0) > 250) { st.thrTs = ts; computeThreats(); }
      st.fx = st.fx.filter(function (f) { return f.until > ts; });
      U.plot.draw(ts);
      U.panels.tick(ts);
    }
    requestAnimationFrame(frame);
  }
  U.frame = frame; // for test harnesses that drive frames by hand
  U.afterTick = function () { if (st) afterTick(); };   // and for node harnesses that step the world themselves
  U.withdraw = function () {
    if (!st || st.over) return;
    U.ownShips().forEach(function (s) { if (E.active(s)) E.order(st.w, s.id, { man: { type: 'break', target: (U.targetOf(s) || {}).id || null, vmax: 40 } }); });
    st.withdrew = true; st.over = true; st.paused = true; flushAgg(true); st.endShown = true; U.panels.end();
  };

  document.addEventListener('DOMContentLoaded', function () { U.panels.init(); U.plot.init(); requestAnimationFrame(frame); });
})();
