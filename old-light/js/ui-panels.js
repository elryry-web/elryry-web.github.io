/* Old Light UI: screens, the ship panel, threat strip, contact card, log, menus, help and the end screen. */
(function () {
  'use strict';
  var U = window.OLUI = window.OLUI || {};
  var Pn = U.panels = {};
  var $ = function (id) { return document.getElementById(id); };
  var tab = 'helm', crewOpen = {}, busy = false, lastR = 0, dirty = true, sheet = 'mid', setupSel = { scn: null, side: 'A', seed: 1 };
  var RANGES = [1000, 2500, 5000, 12000, 25000, 50000, 100000, 200000, 400000, 600000, 900000];
  var BANDS = ['cruise', 'combat', 'brace', 'crash'], BN = { cruise: 'Cruise', combat: 'Combat', brace: 'Brace', crash: 'Crash' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function btn(a, label, on, extra) { return '<button data-a="' + a + '"' + (on ? ' class="on' + (extra ? ' ' + extra : '') + '"' : extra ? ' class="' + extra + '"' : '') + '>' + label + '</button>'; }
  function show(id) { ['title', 'setup', 'battle'].forEach(function (k) { $(k).classList.toggle('on', k === id); }); }
  Pn.busy = function (b) { busy = b; if (!b) dirty = true; };
  Pn.refresh = function (now) { dirty = true; if (now) { lastR = 0; } };

  // ---------------------------------------------------------------- init: title and setup
  Pn.init = function () {
    var D = U.D;
    $('tSound').textContent = 'Sound: ' + (U.set.sound ? 'on' : 'off');
    $('tSound').onclick = function () { U.setSound(!U.set.sound); $('tSound').textContent = 'Sound: ' + (U.set.sound ? 'on' : 'off'); U.sfx('click'); };
    $('tSkirmish').onclick = function () { U.sfx('click'); openSetup(); };
    $('sBack').onclick = function () { show('title'); };
    $('sRand').onclick = function () { setupSel.seed = 1 + Math.floor(Math.random() * 999999); $('sSeed').value = setupSel.seed; };
    $('sSeed').oninput = function () { var v = parseInt($('sSeed').value, 10); if (v > 0) setupSel.seed = v; };
    $('sStart').onclick = function () {
      U.set.lastScen = setupSel.scn; U.set.lastSide = setupSel.side; U.save();
      var sc = U.D.SCENARIOS[setupSel.scn];   // the tutorial fixes its side and seed
      if (sc.tutorial) startBattle(setupSel.scn, sc.side || 'A', sc.seed || 1); else startBattle(setupSel.scn, setupSel.side, setupSel.seed);
    };
    $('sScen').onclick = function (e) { var b = e.target.closest('[data-scn]'); if (!b) return; setupSel.scn = b.getAttribute('data-scn'); drawSetup(); };
    $('sSide').onclick = function (e) { var b = e.target.closest('[data-side]'); if (!b) return; setupSel.side = b.getAttribute('data-side'); drawSetup(); };
    // battle chrome
    $('bPause').onclick = function () { U.togglePause(); Pn.refresh(true); };
    $('timeCtl').addEventListener('click', function (e) { var b = e.target.closest('[data-sp]'); if (!b) return; var v = b.getAttribute('data-sp'); U.setSpeed(v === 'auto' ? 'auto' : +v); U.sfx('click'); });
    $('bannerGo').onclick = function () { U.resume(); };
    $('bFit').onclick = function () { U.plot.fit(); };
    $('bFollow').onclick = function () { var c = U.plot.cam; U.plot.setFollow(!c.follow); $('bFollow').classList.toggle('on', c.follow); };
    $('bManual').onclick = function () { var st = U.st(); if (!st) return; if (st.sel === 'all') { U.addLog('Pick one ship for a manual burn.', ''); return; } st.manual = !st.manual; if (st.manual) U.addLog('Manual burn: drag from the ship toward where to thrust. Longer is harder.', ''); Pn.refresh(true); };
    $('bMenu').onclick = function () { togglePop('menu'); };
    $('bSet').onclick = function () { togglePop('settings'); };
    $('bHelp').onclick = function () { openHelp(); };
    $('menu').onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return; var k = b.getAttribute('data-m'); closePops();
      if (k === 'resume') U.resume(); else if (k === 'withdraw') U.withdraw(); else if (k === 'quit') { U.quit(); show('title'); } else if (k === 'help') openHelp();
    };
    $('settings').onclick = function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return; var k = b.getAttribute('data-s');
      if (k === 'sound') U.setSound(!U.set.sound); else { U.set.pause[k] = !U.set.pause[k]; U.save(); }
      drawSettings();
    };
    $('help').onclick = function (e) { if (e.target.id === 'help' || e.target.closest('[data-h]')) $('help').classList.remove('on'); };
    $('end').onclick = function (e) {
      var b = e.target.closest('[data-e]'); if (!b) return; var k = b.getAttribute('data-e'), st = U.st();
      $('end').classList.remove('on');
      if (k === 'rematch' && st) startBattle(st.scn, st.P, st.seed);
      else if (k === 'new') { U.quit(); openSetup(); }
      else if (k === 'look') { /* stay on the plot */ }
      else { U.quit(); show('title'); }
    };
    $('card').onclick = function (e) { var b = e.target.closest('[data-c]'); if (!b) return; var st = U.st(); if (!st) return; var k = b.getAttribute('data-c'); if (k === 'x') st.cardId = null; else if (k === 'tgt') U.setTarget(st.cardId); Pn.refresh(true); };
    $('threats').onclick = function (e) { var b = e.target.closest('[data-g]'); if (!b) return; U.order({ gLimit: b.getAttribute('data-g') }); Pn.refresh(true); };
    // the panel: one delegated handler
    var panel = $('panel');
    panel.addEventListener('pointerdown', function () { busy = true; });
    window.addEventListener('pointerup', function () { if (busy) { busy = false; dirty = true; } });
    panel.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b) return; act(b.getAttribute('data-a')); dirty = true; lastR = 0; });
    $('grab').addEventListener('click', function () { setSheet(sheet === 'min' ? 'mid' : sheet === 'mid' ? 'max' : 'min'); });
    var gy = null; $('grab').addEventListener('pointerdown', function (e) { gy = e.clientY; });
    window.addEventListener('pointerup', function (e) { if (gy == null) return; var d = e.clientY - gy; gy = null; if (Math.abs(d) > 30) { setSheet(d < 0 ? (sheet === 'min' ? 'mid' : 'max') : (sheet === 'max' ? 'mid' : 'min')); } });
    document.addEventListener('keydown', key);
    // help glyph canvases are drawn on open
  };
  function setSheet(k) { sheet = k; var h = k === 'min' ? '136px' : k === 'max' ? '76vh' : '44vh'; $('battle').style.setProperty('--sheetH', h); setTimeout(function () { U.plot.resize(); }, 30); }
  function key(e) {
    var st = U.st(); if (!st || !$('battle').classList.contains('on')) return;
    if (e.target && (e.target.tagName === 'INPUT')) return;
    if (e.code === 'Space') { e.preventDefault(); U.togglePause(); }
    else if (e.key === '1') U.setSpeed(1); else if (e.key === '2') U.setSpeed(10); else if (e.key === '3') U.setSpeed(100); else if (e.key === '4') U.setSpeed(1000);
    else if (e.key === 'a' || e.key === 'A') U.setSpeed('auto');
    else if (e.key === 'f' || e.key === 'F') U.plot.fit();
    else if (e.key === 'Escape') { closePops(); $('help').classList.remove('on'); }
    else if (e.key === '?') openHelp();
  }
  function openSetup() {
    var D = U.D, keys = Object.keys(D.SCENARIOS);
    if (!setupSel.scn) setupSel.scn = keys.indexOf(U.set.lastScen) >= 0 ? U.set.lastScen : keys[0];
    setupSel.side = U.set.lastSide === 'B' ? 'B' : 'A';
    setupSel.seed = 1 + Math.floor(Math.random() * 999999); $('sSeed').value = setupSel.seed;
    drawSetup(); show('setup');
  }
  function drawSetup() {
    var D = U.D, h = '';
    Object.keys(D.SCENARIOS).forEach(function (k) { var s = D.SCENARIOS[k]; h += '<button class="scen' + (k === setupSel.scn ? ' on' : '') + '" data-scn="' + k + '"><b>' + esc(s.name) + '</b><span>' + esc(s.text || '') + '</span></button>'; });
    $('sScen').innerHTML = h;
    var sc = D.SCENARIOS[setupSel.scn], sh = '';
    ['A', 'B'].forEach(function (S) {
      var names = sc.ships.filter(function (x) { return x.side === S; }).map(function (x) { var L = typeof x.load === 'string' ? D.LOADOUTS[x.load] : x.load, H = L && D.HULLS[L.hull]; return (x.name || (L && L.name) || '') + (H ? ' (' + H.name.toLowerCase() + ')' : ''); });
      sh += '<button data-side="' + S + '"' + (setupSel.side === S ? ' class="on"' : '') + '><b>Side ' + S + '</b><span>' + esc(names.join(', ')) + '</span></button>';
    });
    $('sSide').innerHTML = sh;
    ['sSideH', 'sSide', 'sSeedH', 'sSeedRow'].forEach(function (id) { $(id).style.display = sc.tutorial ? 'none' : ''; });
  }
  function startBattle(scn, side, seed) {
    show('battle'); closePops(); $('end').classList.remove('on');
    tab = 'helm'; setSheet(window.innerWidth >= 900 ? 'mid' : 'mid');
    U.plot.resize();
    U.start(scn, side, seed);
  }
  Pn.onStart = function () { var st = U.st(); $('scnName').textContent = U.D.SCENARIOS[st.scn].name + ' · side ' + st.P; dirty = true; lastR = 0; Pn.log(); };

  // ---------------------------------------------------------------- pop-ups
  function togglePop(id) { var on = !$(id).classList.contains('on'); closePops(); if (on) { if (id === 'menu') drawMenu(); else drawSettings(); $(id).classList.add('on'); } }
  function closePops() { $('menu').classList.remove('on'); $('settings').classList.remove('on'); }
  function drawMenu() {
    var st = U.st();
    $('menu').innerHTML = '<h4>Battle</h4>' + '<button class="item" data-m="resume">Resume</button>' + '<button class="item" data-m="help">How to read the plot</button>' +
      (st && !st.over ? '<button class="item" data-m="withdraw">Withdraw <em>ends the battle</em></button>' : '') + '<button class="item" data-m="quit">Quit to title</button>';
  }
  function drawSettings() {
    var p = U.set.pause, it = function (k, l, on) { return '<button class="item' + (on ? ' on' : '') + '" data-s="' + k + '">' + l + '<em>' + (on ? 'on' : 'off') + '</em></button>'; };
    $('settings').innerHTML = '<h4>Sound</h4>' + it('sound', 'Sound', U.set.sound) + '<h4>Pause when</h4>' + it('contact', 'New contact', p.contact) + it('launch', 'Launch detected', p.launch) + it('impact', 'Own ship hit', p.impact) + it('strain', 'Strain critical', p.strain) + it('crew', 'Officer down', p.crew) + it('disabled', 'Ship disabled or lost', p.disabled);
  }
  function openHelp() {
    closePops();
    var items = [
      ['own', 'Your ships: solid amber. The line ahead is where each will be over the next 10 minutes, dotted each minute.'],
      ['ghost', 'Contacts: hollow cyan, drawn where the light shows them, which is where they were. Light takes 1 s per 300,000 km. Old sightings fade.'],
      ['est', 'The dashed line runs from what you see to where the plot estimates the contact is now.'],
      ['ring', 'The dashed ring is how far off that estimate may be. It grows while the contact is unseen or burning hard.'],
      ['threat', 'Red: rounds and missiles aimed at your ships, with the time to impact.'],
      ['g', 'G limits: Cruise, Combat, Brace, Crash. Harder burns dodge better and close faster. They also strain the officers. Under each limit, a red name is an officer it would hurt. An amber name shows who would reach full strain, and when. Cruise lets the officers recover.']
    ];
    var h = '<div class="ov-box"><h2>Reading the plot</h2><ul class="help-list">';
    items.forEach(function (it, i) { h += '<li><canvas width="88" height="60" data-g="' + it[0] + '"></canvas><span>' + esc(it[1]) + '</span></li>'; });
    h += '</ul><p class="note">Tap your ship to select it, tap a contact to target it. Pinch or wheel to zoom. Orders work while paused. Space pauses; 1 to 4 set the speed; A is Auto.</p><div class="ov-btns"><button data-h="x" class="prime">Close</button></div></div>';
    $('help').innerHTML = h; $('help').classList.add('on');
    Array.prototype.forEach.call($('help').querySelectorAll('canvas'), function (c) { var x = c.getContext('2d'); x.scale(2, 2); U.plot.glyph(x, c.getAttribute('data-g'), 44, 30); });
  }
  Pn.banner = function (why) {
    var b = $('banner');
    if (why) { $('bannerText').textContent = why; b.classList.add('on'); } else b.classList.remove('on');
    dirty = true;
  };

  // ---------------------------------------------------------------- the log
  Pn.log = function () {
    var st = U.st(); if (!st) return;
    var h = ''; st.log.slice(-6).forEach(function (l) { h += '<div class="' + l.cls + '"><i>' + U.fmtT(l.t).slice(2) + '</i>' + esc(l.text) + '</div>'; });
    $('log').innerHTML = h;
  };

  // ---------------------------------------------------------------- per frame
  Pn.tick = function (ts) {
    var st = U.st(); if (!st) return;
    $('clock').textContent = U.fmtT(st.w.t);
    var L = U.level();
    $('bPause').classList.toggle('paused', st.paused); $('bPause').innerHTML = st.paused ? '&#9654;' : '&#10074;&#10074;';
    Array.prototype.forEach.call($('timeCtl').querySelectorAll('[data-sp]'), function (b) { var v = b.getAttribute('data-sp'); b.classList.toggle('on', String(st.speed) === v); });
    $('autoNow').textContent = st.speed === 'auto' ? (st.paused ? '' : '×' + st.autoL) : '';
    $('autoNow').title = st.speed === 'auto' && st.autoWhy ? 'Auto: ' + st.autoWhy : '';
    if (busy || (ts - lastR < 250 && !dirty) || (ts - lastR < 60)) return;
    lastR = ts; dirty = false;
    drawPanel(st); drawThreats(st); drawCard(st);
    $('bManual').classList.toggle('on', !!st.manual);
  };

  // ---------------------------------------------------------------- the ship panel
  function act(a) {
    var st = U.st(); if (!st) return; var p = a.split(':'), k = p[0], ships = U.selShips(), s = U.selShip();
    if (k === 'sel') { Pn.select(p[1]); return; }
    if (k === 'tab') { tab = p[1]; if (sheet === 'min') setSheet('mid'); return; }
    if (k === 'ab') { crewOpen[p[1]] = !crewOpen[p[1]]; return; }
    if (!s) return;
    var doc = U.doc(s), man = s.orders.man || {}, rng = man.range || doc.hold || 12000;
    if (k === 'man') {
      var t = p[1]; st.manual = false;
      if (t === 'close' || t === 'hold') U.order({ man: { type: t, target: '@', range: rng, vmax: doc.vmax || 20 } });
      else if (t === 'break') U.order({ man: { type: 'break', target: '@', vmax: 40 } });
      else if (t === 'match') U.order({ man: { type: 'match', target: '@' } });
      else if (t === 'cold') U.order({ man: { type: 'cold' }, radiators: 'retract' });
      else if (t === 'coast') U.order({ man: { type: 'coast' } });
      else if (t === 'manual') { if (st.sel === 'all') { U.addLog('Pick one ship for a manual burn.', ''); return; } st.manual = true; U.addLog('Drag on the plot from the ship toward the burn. Longer is harder.', ''); }
      return;
    }
    if (k === 'rng') {
      var i = 0; while (i < RANGES.length - 1 && RANGES[i] < rng - 1) i++;
      if (RANGES[i] > rng + 1 && +p[1] < 0) i--; i = Math.max(0, Math.min(RANGES.length - 1, i + (+p[1] > 0 ? (RANGES[i] > rng + 1 ? 0 : 1) : (RANGES[i] < rng - 1 ? 0 : -1))));
      ships.forEach(function (x) { var m = x.orders.man; if (m && (m.type === 'close' || m.type === 'hold')) m.range = RANGES[i]; }); U.sfx('click'); return;
    }
    if (k === 'tgtauto') { ships.forEach(function (x) { U.pc(x).tgt = null; }); U.setTarget(null); return; }
    if (k === 'gl') { U.order({ gLimit: p[1] }); return; }
    if (k === 'ev') { U.order({ evasion: p[1] }); return; }
    if (k === 'rad') { U.order({ radiators: p[1] }); return; }
    if (k === 'thr' || k === 'ammo' || k === 'sn') {
      ships.forEach(function (x) { var g = U.grp(x, p[1]); var v = p[2]; if (k === 'thr') g.thr = v === 'auto' || v === 'hold' ? v : +v; else if (k === 'ammo') g.ammo = v; else g.n = v === 'auto' ? 'auto' : +v; }); U.sfx('click'); return;
    }
    if (k === 'fire') { var n = 0; ships.forEach(function (x) { n += U.fireNow(x, p[1]); }); if (!n) U.addLog('No solution: the guns are loading, dry or have no target.', ''); return; }
    if (k === 'lz') { ships.forEach(function (x) { U.pc(x).laser = p[1]; }); U.sfx('click'); return; }
    if (k === 'mauto') { ships.forEach(function (x) { U.pc(x).miss.auto = !U.pc(s).miss.auto; }); return; }
    if (k === 'msal') { ships.forEach(function (x) { U.pc(x).miss.n = +p[1]; }); return; }
    if (k === 'mlaunch') { ships.forEach(function (x) { var t = U.targetOf(x), l = U.rackLoad(x); if (t && l > 0) { U.E.order(st.w, x.id, { launch: { target: t.id, n: Math.min(U.pc(x).miss.n, l) } }); U.pc(x).lastSalvo = st.w.t; U.addLog(x.name + ': ' + Math.min(U.pc(x).miss.n, l) + ' missiles on ' + t.id + '.', 'good'); } }); U.sfx('launch'); return; }
    if (k === 'sand') { var t2 = U.targetOf(s); if (t2) U.order({ sand: { target: t2.id } }); return; }
    if (k === 'dl') { ships.forEach(function (x) { if (!x.stock || !(x.stock[p[1]] > 0)) return; var tr = U.targetOf(x), wg = (x.wing && x.wing[p[1]]) || {}; U.E.order(st.w, x.id, { wing: { type: p[1], mode: wg.mode || U.D.DRONES[p[1]].mode, target: wg.target || (tr ? tr.id : null), point: wg.point || null }, drones: { type: p[1], n: +p[2] } }); }); U.sfx('click'); return; }
    if (k === 'wo') {
      ships.forEach(function (x) {
        var tr = U.targetOf(x), mode = p[2], o = { type: p[1], mode: mode, target: tr ? tr.id : null, point: null };
        if (mode === 'picket') { var tx = tr ? tr.ex : x.x + Math.cos(x.heading) * 1e5, ty = tr ? tr.ey : x.y + Math.sin(x.heading) * 1e5; o.point = { x: x.x + (tx - x.x) * 0.35, y: x.y + (ty - x.y) * 0.35 }; }
        if (mode === 'strike' && !tr) return;
        U.E.order(st.w, x.id, { wing: o });
      }); U.sfx('click'); return;
    }
  }
  Pn.showTab = function (t) { tab = t; dirty = true; lastR = 0; if (sheet === 'min') setSheet('mid'); };
  Pn.select = function (id) {
    var st = U.st(); if (!st) return; st.sel = id; st.manual = false; dirty = true; lastR = 0; U.sfx('click');
    if (sheet === 'min' && window.innerWidth < 900) setSheet('mid');
  };
  function bar(v, cls) { v = Math.max(0, Math.min(1, v || 0)); return '<div class="bar ' + (cls || '') + '"><i style="width:' + (v * 100).toFixed(1) + '%"></i></div>'; }
  function meter(label, val, frac, cls) { return '<div class="meter">' + label + '<span class="mv">' + val + '</span>' + bar(frac, cls) + '</div>'; }
  // who a band would hurt (red) and who it would bring to full strain (amber, with the time); empty when it harms nobody
  function harmHtml(s, b) {
    var L = U.harmLine(s, b); if (!L) return '';
    var out = [], keep = L.hurt.length ? 1 : 2;
    if (L.hurt.length) out.push('<span class="hurt">' + esc(L.hurt.join(', ')) + ' hurt</span>');
    L.fill.slice(0, keep).forEach(function (f) { out.push('<span class="fill">' + esc(f[0]) + ' full in ' + U.fmtIn(f[1]) + '</span>'); });
    if (L.fill.length > keep) out.push('<span class="fill">+' + (L.fill.length - keep) + ' more</span>');
    return out.join(' ');
  }
  // the red names only, for the threat strip
  function hurtNames(s, b) {
    var L = U.harmLine(s, b); if (!L || !L.hurt.length) return '';
    return '<small class="hurt">' + esc(L.hurt.slice(0, 2).join(' ') + (L.hurt.length > 2 ? ' +' + (L.hurt.length - 2) : '')) + '</small>';
  }
  function manText(s) {
    var m = s.orders.man || { type: 'coast' }, tg = m.target ? ' ' + m.target : '';
    switch (m.type) {
      case 'close': return 'Closing to ' + U.fmtKm(m.range) + ' of' + (tg || ' the enemy');
      case 'hold': return 'Holding ' + U.fmtKm(m.range) + ' from' + (tg || ' the enemy');
      case 'break': return 'Breaking off from' + (tg || ' the enemy');
      case 'match': return 'Matching velocity with' + (tg || ' the target');
      case 'cold': return 'Running cold: no thrust';
      case 'manual': return 'Manual burn ' + (m.g || 0) + ' G at ' + Math.round(m.heading || 0) + '°';
      case 'station': return 'On station';
      default: return 'Coasting';
    }
  }
  function drawPanel(st) {
    var own = U.ownShips(), s = U.selShip(), E = U.E;
    var h = '<div class="shipchips"' + (own.length > 1 ? '' : ' style="display:none"') + '>' + (own.length > 1 ? btn('sel:all', 'All ships', st.sel === 'all') : '');
    own.forEach(function (x) { var cls = x.status === 'destroyed' || x.status === 'captured' || x.status === 'disabled' ? 'dead' : x.status === 'crippled' || x.hp < x.hpMax * 0.5 ? 'hurt' : ''; h += btn('sel:' + x.id, esc(x.name), st.sel === x.id, cls); });
    h += '</div>';
    if (s) {
      var dv = E.dvLeft(s), dv0 = s.fuel0 > 0 ? dv / Math.max(1e-6, dvMax(s)) : 0;
      h += '<div class="sh-title"><b>' + esc(st.sel === 'all' ? 'All ships' : s.name) + '</b><span>' + esc(st.sel === 'all' ? U.selShips().length + ' active' : (s.H && s.H.name || s.hull)) + '</span><span class="st ' + s.status + '">' + s.status + '</span></div>';
      h += '<div class="meters">' + meter('Δv', Math.round(dv) + ' km/s', dv0, dv0 < 0.2 ? 'crit' : '') + meter('Heat', Math.round(s.heat || 0) + '%', (s.heat || 0) / 100, (s.heat || 0) > 70 ? 'crit' : 'heat') +
        meter('Strain', Math.round(s.strain || 0) + '%', (s.strain || 0) / 100, (s.strain || 0) > 75 ? 'crit' : 'strain') + meter('Crew', Math.round((s.eff != null ? s.eff : 1) * 100) + '%', s.eff != null ? s.eff : 1, 'ok') + '</div>';
    }
    $('pHead').innerHTML = h;
    var hasBay = !!s && s.mods.some(function (m) { return m.kind === 'bay'; });
    if (tab === 'wings' && !hasBay) tab = 'helm';
    var tabs = [['helm', 'Helm'], ['guns', 'Guns']]; if (hasBay) tabs.push(['wings', 'Wings']); tabs.push(['crew', 'Crew'], ['ship', 'Ship']);
    $('pTabs').innerHTML = tabs.map(function (t) { return btn('tab:' + t[0], t[1], tab === t[0]); }).join('');
    if (!s) { $('pBody').innerHTML = '<p class="note">No ship can take orders.</p>'; return; }
    var body = tab === 'helm' ? helmTab(st, s) : tab === 'guns' ? gunsTab(st, s) : tab === 'wings' ? wingsTab(st, s) : tab === 'crew' ? crewTab(st, s) : shipTab(st, s);
    var pb = $('pBody'), sc = pb.scrollTop; pb.innerHTML = body; pb.scrollTop = sc;
  }
  function dvMax(s) { var E = U.E; var f = s.fuel; s.fuel = s.fuel0; var v = E.dvLeft(s); s.fuel = f; return v; }
  function tgtLine(s) {
    var p = U.pc(s), tr = U.targetOf(s);
    return '<div class="row"><span class="grow">Target: <span class="tgt">' + (tr ? esc(tr.id + ' ' + (tr.name || tr.cls || '')) : 'none') + '</span>' + (p.tgt ? '' : ' <span class="note">(nearest)</span>') + '</span>' + (p.tgt ? btn('tgtauto', 'Nearest') : '') + '</div>';
  }
  function helmTab(st, s) {
    var m = s.orders.man || { type: 'coast' }, t = m.type, E = U.E;
    var h = '<div class="sec man"><h4>Manoeuvre <em>' + esc(manText(s)) + '</em></h4>' + tgtLine(s) + '<div class="chips">' +
      btn('man:close', 'Close to', t === 'close') + btn('man:hold', 'Hold range', t === 'hold') + btn('man:break', 'Break off', t === 'break') + btn('man:match', 'Match vel.', t === 'match') + btn('man:cold', 'Go cold', t === 'cold') + btn('man:coast', 'Coast', t === 'coast') + btn('man:manual', 'Manual burn', t === 'manual' || st.manual) + '</div>';
    if (t === 'close' || t === 'hold') h += '<div class="row stepper">' + btn('rng:-1', '&minus;') + '<span>' + U.fmtKm(m.range || 0) + '</span>' + btn('rng:1', '+') + '</div>';
    if (st.manual) h += '<p class="note">Drag on the plot from the ship toward the burn. Length sets the G, up to the limit.</p>';
    var tr = U.targetOf(s);
    if (tr) { var dx = tr.ex - s.x, dy = tr.ey - s.y, d = Math.hypot(dx, dy) || 1, cl = -(dx * (tr.vx - s.vx) + dy * (tr.vy - s.vy)) / d; h += '<p class="note">' + U.fmtKm(d) + ' to ' + esc(tr.id) + ', ' + (cl >= 0 ? 'closing ' : 'opening ') + Math.abs(cl).toFixed(1) + ' km/s</p>'; }
    h += '</div>';
    h += '<div class="sec"><h4>G limit <em>now ' + (s.gTick || s.gNow || 0).toFixed(1) + ' G</em></h4><div class="gbands">';
    BANDS.forEach(function (b) { var cap = U.N.gCap[b]; h += '<div class="gb"><button data-a="gl:' + b + '" class="gl-' + b + (s.orders.gLimit === b ? ' on' : '') + '">' + BN[b] + ' ' + (cap > 50 ? 'max' : cap + ' G') + '</button><span class="gh">' + harmHtml(s, b) + '</span></div>'; });
    h += '</div></div>';
    var ev = s.orders.evasion, rd = s.orders.radiators || 'auto';
    h += '<div class="sec"><h4>Evasion</h4><div class="chips">' + ['auto', 'off', 'light', 'hard'].map(function (k) { return btn('ev:' + k, k[0].toUpperCase() + k.slice(1), ev === k); }).join('') + '</div></div>';
    h += '<div class="sec"><h4>Radiators <em>' + (s.radOut ? 'out' : 'in') + '</em></h4><div class="chips">' + ['auto', 'extend', 'retract'].map(function (k) { return btn('rad:' + k, k[0].toUpperCase() + k.slice(1), rd === k); }).join('') + '</div><p class="note">Out sheds heat but shows on enemy sensors and can be shot away.</p></div>';
    return h;
  }
  function groupsOf(s) {
    var g = {}, order = [];
    s.mods.forEach(function (m) { if (m.kind !== 'rail' && m.kind !== 'laser' && m.kind !== 'pdl' && m.kind !== 'flak' && m.kind !== 'rack') return; if (!g[m.key]) { g[m.key] = { key: m.key, kind: m.kind, def: m.def, mods: [] }; order.push(g[m.key]); } g[m.key].mods.push(m); });
    return order;
  }
  function gunsTab(st, s) {
    var E = U.E, tr = U.targetOf(s), h = '<div class="sec">' + tgtLine(s) + '</div>';
    groupsOf(s).forEach(function (G) {
      var live = G.mods.filter(function (m) { return m.state < 2; }), n = G.mods.length, nm = esc(G.def.name) + (n > 1 ? ' ×' + n : '');
      var dead = n - live.length, sub = dead ? dead + ' out' : '';
      if (G.kind === 'rail') {
        var g = U.grp(s, G.key), ammo = 0, m0 = live[0]; G.mods.forEach(function (m) { ammo += m.ammo || 0; });
        var est = m0 && tr ? E.hitEstimate(st.w, s, m0.id, tr.id, { n: U.railN(m0, g), ammo: g.ammo === 'canister' ? 'canister' : undefined }) : null;
        var ch = est && est.ok ? est.chance : null, thr = m0 ? U.railThr(s, m0, g) : null;
        var cdT = m0 ? (m0.burst ? 'firing' : m0.pending ? 'aiming' : m0.cd > 0 ? 'loading ' + Math.ceil(m0.cd) + 's' : 'ready') : 'out';
        h += '<div class="wg"><div class="wg-h"><b>' + nm + '</b><span>' + ammo + ' rds · ' + cdT + (sub ? ' · ' + sub : '') + '</span><span class="hc' + (ch != null && thr != null && ch >= thr ? '' : ' lo') + '">' + (ch != null ? U.pct(ch) : '--') + '</span></div>';
        if (est && est.ok) h += '<p class="note" style="margin:0 0 4px">Impact in ' + U.fmtEta(est.tti) + ', spread ' + U.fmtKm(est.spread) + (est.rounds > 1 ? ', ' + est.rounds + ' rounds' : '') + '</p>';
        var autoT = Math.round(((G.def.spinal ? U.doc(s).spinal : U.doc(s).rail) || 0) * 100);
        h += '<div class="row"><span class="lbl">Fire at</span><div class="chips">' + btn('thr:' + G.key + ':auto', 'Auto ' + autoT + '%', g.thr === 'auto') + [0.1, 0.25, 0.5].map(function (v) { return btn('thr:' + G.key + ':' + v, Math.round(v * 100) + '%', g.thr === v); }).join('') + btn('thr:' + G.key + ':hold', 'Hold', g.thr === 'hold') + '</div></div>';
        if (!G.def.spinal) {
          h += '<div class="row"><span class="lbl">Ammo</span><div class="chips">' + [['auto', 'Auto'], ['slug', 'Slug'], ['canister', 'Canister']].map(function (a) { return btn('ammo:' + G.key + ':' + a[0], a[1], g.ammo === a[0]); }).join('') + '</div></div>';
          h += '<div class="row"><span class="lbl">Salvo</span><div class="chips">' + btn('sn:' + G.key + ':auto', 'Auto', g.n === 'auto') + [1, 2, 4].map(function (v) { return btn('sn:' + G.key + ':' + v, v, g.n === v); }).join('') + '</div></div>';
        } else h += '<p class="note">Spinal: the whole ship turns to aim it.</p>';
        h += '<div class="row">' + btn('fire:' + G.key, 'Fire now', false, 'fire') + '</div></div>';
      } else if (G.kind === 'laser') {
        var mode = U.pc(s).laser, l0 = live[0], le = l0 && tr ? E.hitEstimate(st.w, s, l0.id, tr.id, {}) : null, firing = live.some(function (m) { return m.firing; });
        var on = live.filter(function (m) { return m.target; }).map(function (m) { return m.target; });
        h += '<div class="wg"><div class="wg-h"><b>' + nm + '</b><span>' + (on.length ? 'on ' + esc(on[0]) : 'idle') + (sub ? ' · ' + sub : '') + '</span><span class="hc' + (le && le.ok && le.dmgFactor > 0 ? '' : ' lo') + '">' + (le && le.ok ? U.pct(le.chance) : '--') + '</span></div>';
        if (le && le.ok) h += '<p class="note" style="margin:0 0 4px">' + (le.dmgFactor > 0 ? 'Power at target ' + Math.round(le.dmgFactor * 100) + '%' : 'Out of reach: armour sheds it') + ' · ' + U.fmtKm(le.range) + '</p>';
        h += '<div class="row"><span class="lbl">Mode</span><div class="chips">' + btn('lz:free', 'Free', mode === 'free') + btn('lz:pd', 'PD only', mode === 'pd') + btn('lz:hold', 'Hold', mode === 'hold') + '</div></div>';
        h += '<div class="row">' + btn('fire:' + G.key, 'Fire now', false, 'fire') + '</div></div>';
      } else if (G.kind === 'rack') {
        var pc = U.pc(s), load = U.rackLoad(s), dd = U.doc(s).launchAt;
        h += '<div class="wg"><div class="wg-h"><b>' + nm + '</b><span>' + load + ' ready' + (sub ? ' · ' + sub : '') + '</span></div>';
        h += '<div class="row"><span class="lbl">Salvo</span><div class="chips">' + [2, 4, 6, 8].map(function (v) { return btn('msal:' + v, v, pc.miss.n === v); }).join('') + '</div></div>';
        h += '<div class="row"><span class="lbl">Auto</span><div class="chips">' + btn('mauto', pc.miss.auto ? 'On: inside ' + U.fmtR(dd || 0) : 'Off', pc.miss.auto) + '</div></div>';
        h += '<div class="row">' + btn('mlaunch', 'Launch salvo', false, 'fire') + '</div></div>';
      } else {
        h += '<div class="wg"><div class="wg-h"><b>' + nm + '</b><span>point defence, ' + U.fmtR(G.def.range) + (sub ? ' · ' + sub : '') + '</span></div><p class="note" style="margin:0">Fires by itself at missiles and drones in reach.</p></div>';
      }
    });
    if (s.has && s.has.sandcaster) h += '<div class="wg"><div class="wg-h"><b>Sandcaster</b><span>' + (s.has.sandcaster.charges || 0) + ' charges</span></div><p class="note" style="margin:0 0 4px">A cloud toward the target that eats laser light.</p>' + btn('sand', 'Cast sand') + '</div>';
    return h;
  }
  var WMODES = [['screen', 'Screen'], ['picket', 'Picket'], ['strike', 'Strike'], ['intercept', 'Intercept'], ['return', 'Return']];
  function wingsTab(st, s) {
    if (!s.mods.some(function (m) { return m.kind === 'bay'; })) return '<p class="note">' + esc(s.name) + ' has no drone bay. Pick a carrier.</p>';
    var mine = st.w.drones.filter(function (d) { return d.alive && d.mother === s.id; }), h = '<div class="sec">' + tgtLine(s) + '</div>';
    U.E.DTYPES.forEach(function (t) {
      var stock = (s.stock && s.stock[t]) || 0, out = mine.filter(function (d) { return d.type === t && !d.docked; }).length, q = U.E.queued(s, t);
      if (!stock && !out && !q) return;
      var wg = (s.wing && s.wing[t]) || { mode: U.D.DRONES[t].mode };
      h += '<div class="wg"><div class="wg-h"><b>' + esc(U.D.DRONES[t].name) + 's</b><span>' + stock + ' in bay · ' + out + ' out' + (q ? ' · ' + q + ' launching' : '') + '</span></div>';
      h += '<div class="row"><span class="lbl">Launch</span><div class="chips">' + btn('dl:' + t + ':1', '1') + btn('dl:' + t + ':2', '2') + btn('dl:' + t + ':4', '4') + '</div></div>';
      h += '<div class="row"><span class="lbl">Order</span><div class="chips">' + WMODES.map(function (m) { return btn('wo:' + t + ':' + m[0], m[1], wg.mode === m[0]); }).join('') + '</div></div></div>';
    });
    h += '<p class="note">Drone orders travel at light speed, so far wings answer late. Strike and Intercept use the ship’s target.</p>';
    return h;
  }
  // ---------------------------------------------------------------- the crew tab: one card per officer
  function crewTab(st, s) {
    var ships = st.sel === 'all' ? U.selShips() : [s], h = '';
    ships.forEach(function (x) {
      var offs = (st.view && st.view.officers && st.view.officers[x.id]) || x.officers || [];
      if (ships.length > 1) h += '<div class="sec"><h4>' + esc(x.name) + '</h4></div>';
      offs.forEach(function (o) { h += officerCard(x, o); });
      if (!offs.length) h += '<p class="note">No officers aboard.</p>';
    });
    h += '<p class="note">Strain builds above an officer\'s easy G. It eases below 1.5 G. Past the limit, or at full strain, the officer is hurt.</p>';
    return h;
  }
  function officerCard(s, o) {
    var A = U.D.ABILITIES[o.ability], open = !!crewOpen[o.id], rate = Math.round(U.N.ratingEff * 100);
    var nm = esc(o.name) + (o.story ? '<i class="cast" title="Story cast" aria-label="story cast">&#9670;</i>' : '');
    var sub = esc(U.stName(o.station)) + ' · ' + esc(o.originName || (U.D.ORIGINS[o.origin] || {}).name || o.origin);
    var h = '<div class="ofc' + (o.down ? ' down' : '') + '"><div class="ofc-h"><b>' + nm + '</b><span class="eff">' + Math.round((o.down ? U.N.ratingEff : o.effectiveness) * 100) + '%</span></div><div class="ofc-s">' + sub + '</div>';
    if (o.down) h += '<div class="ofc-d">Down — rating at the station (' + rate + '%)</div>';
    else {
      var sv = Math.round(o.strain), hv = Math.round(o.health);
      h += '<div class="ofc-m"><span>Strain</span>' + bar(o.strain / 100, sv > 75 ? 'crit' : 'strain') + '<span>' + sv + '</span><span>Health</span>' + bar(o.health / 100, hv < 25 ? 'crit' : hv < 50 ? 'heat' : 'ok') + '<span>' + hv + '</span></div>';
      h += '<div class="ofc-g">Easy to ' + fmtG(o.comfort) + '. Hurt past ' + fmtG(o.limit) + '.</div>';
    }
    if (A) {
      if (o.down) h += '<div class="ofc-ab lost">' + esc(A.name) + ' <em>lost</em></div>';
      else h += '<button data-a="ab:' + esc(o.id) + '" class="ofc-ab' + (open ? ' on' : '') + '" title="' + esc(A.text) + '" aria-expanded="' + open + '">' + esc(A.name) + '<em>' + (open ? '&#9652;' : '&#9662;') + '</em></button>' + (open ? '<p class="ofc-t">' + esc(A.text) + '</p>' : '');
    }
    return h + '</div>';
  }
  function fmtG(g) { return (Math.round(g * 10) / 10) + ' G'; }
  function shipTab(st, s) {
    var h = '<div class="sec"><h4>Hull <em>' + Math.round(s.hp) + ' / ' + Math.round(s.hpMax) + '</em></h4>' + bar(s.hp / s.hpMax, s.hp < s.hpMax * 0.35 ? 'crit' : 'ok') + '</div>';
    if (s.ar) {
      h += '<div class="sec"><h4>Armour <em>' + esc((U.D.ARMOUR && U.D.ARMOUR[s.ar.type]) || s.ar.type || '') + '</em></h4><div class="armour">';
      ['nose', 'flank', 'tail'].forEach(function (f) { var v = s.ar[f] || 0, v0 = (s.ar0 && s.ar0[f]) || v || 1; h += '<span>' + f + '</span>' + bar(v / v0, v / v0 < 0.3 ? 'crit' : '') + '<span>' + v.toFixed(1) + '</span>'; });
      h += '</div></div>';
    }
    h += '<div class="sec"><h4>Crew <em>' + Math.round(s.crew) + ' / ' + Math.round(s.crew0) + '</em></h4><p class="note" style="margin:0">Effectiveness ' + Math.round((s.eff != null ? s.eff : 1) * 100) + '%. Fuel ' + Math.round(100 * s.fuel / (s.fuel0 || 1)) + '%. Heat ' + Math.round(s.heat || 0) + '%.</p></div>';
    var SN = ['ok', 'damaged', 'out'];
    h += '<div class="sec"><h4>Systems</h4><div class="mods">';
    if (s.sys) Object.keys(s.sys).forEach(function (k) { var y = s.sys[k]; h += '<span>' + esc(y.name || k) + '</span><span class="s' + y.state + '">' + SN[y.state] + '</span>'; });
    s.mods.forEach(function (m) { h += '<span>' + esc(m.def.name) + '</span><span class="s' + m.state + '">' + SN[m.state] + '</span>'; });
    h += '</div></div>';
    var own = U.ownShips();
    if (own.length > 1) {
      h += '<div class="sec"><h4>Fleet</h4><table class="fleet">';
      own.forEach(function (x) { h += '<tr><td>' + esc(x.name) + '</td><td>' + x.status + '</td><td>' + Math.round(100 * x.hp / x.hpMax) + '% hull</td><td>' + Math.round(U.E.dvLeft(x)) + ' km/s</td></tr>'; });
      h += '</table></div>';
    }
    return h;
  }

  // ---------------------------------------------------------------- threats and the contact card
  function drawThreats(st) {
    // once the battle is decided the strip goes quiet, even with rounds still in flight
    var ships = st.over ? [] : st.sel === 'all' ? U.selShips() : [U.selShip()].filter(Boolean), h = '', count = 0;
    ships.forEach(function (s) {
      // real threats first, by arrival; long shots after them
      var q = function (t) { return U.riskOf(s, t) < 0.03 ? 1 : 0; };
      (st.thr[s.id] || []).slice().sort(function (a, b) { return q(a) - q(b) || a.eta - b.eta; }).slice(0, 4).forEach(function (t) {
        if (count >= (window.innerWidth < 900 ? 3 : 5)) return; count++;
        // the chance to be hit with no dodge, then at each G limit; the ship's own limit is marked, and a tap sets it
        var KN = { missile: 'Missile', payload: 'Warhead', drone: 'Striker', slug: 'Round', salvo: 'Salvo' };
        var nm = (t.wk === 'canister' ? 'Canister' : KN[t.kind] || 'Threat') + (t.n > 1 && t.kind !== 'drone' ? ' ×' + t.n : '');
        var src = t.src && U.trackByOid(t.src), evOff = s.orders.evasion === 'off', quiet = U.riskOf(s, t) < 0.03;
        var x = '<div class="threat' + (quiet ? ' quiet' : '') + '"><div class="th-a"><b>' + nm + '</b>' + (src ? '<span class="src">from ' + esc(src.id) + '</span>' : '') + '<span>' + U.fmtEta(t.eta) + '</span>' + (ships.length > 1 ? '<span>' + esc(s.name) + '</span>' : '');
        if (t.hit && t.hit.off != null) x += '<span class="nd' + (evOff ? ' cur' : '') + '">no dodge ' + U.pct(t.hit.off) + '</span>';
        x += '</div>';
        if (t.hit) {
          x += '<div class="th-b">';
          BANDS.forEach(function (b) { if (t.hit[b] != null) x += '<button data-g="' + b + '" class="gl-' + b + (!evOff && s.orders.gLimit === b ? ' on' : '') + '"><span>' + BN[b] + ' ' + U.pct(t.hit[b]) + '</span>' + hurtNames(s, b) + '</button>'; });
          x += '</div>';
        }
        h += x + '</div>';
      });
    });
    $('threats').innerHTML = h;
    $('threats').style.top = ($('topbar').offsetHeight + 4) + 'px';
    $('banner').style.top = ($('topbar').offsetHeight + (h ? $('threats').offsetHeight + 10 : 4)) + 'px';
  }
  function drawCard(st) {
    var tr = st.cardId && U.track(st.cardId), c = $('card');
    if (!tr) { c.classList.remove('on'); if (st.cardId && !tr) st.cardId = null; return; }
    var s = U.selShip() || U.ownShips()[0], age = Math.max(0, tr.age != null ? tr.age : st.w.t - tr.tObs), dx = tr.ex - s.x, dy = tr.ey - s.y, d = Math.hypot(dx, dy) || 1;
    var cl = -(dx * (tr.vx - s.vx) + dy * (tr.vy - s.vy)) / d, isT = U.pc(s).tgt === tr.id;
    var row = function (a, b) { return '<div class="cr"><span>' + a + '</span><span>' + b + '</span></div>'; };
    c.innerHTML = '<div class="ct"><span>' + esc(tr.id) + ' · ' + esc(tr.kind === 'ship' ? (tr.name ? tr.name + ', ' : '') + (tr.cls || 'ship') : tr.kind) + '</span><button data-c="x" aria-label="Close">×</button></div>' +
      row(U.isLost(tr, age) ? 'last seen' : 'seen', U.fmtAge(age) + ' ago') + row('distance', U.fmtKm(d)) + row(cl >= 0 ? 'closing' : 'opening', Math.abs(cl).toFixed(2) + ' km/s') + row('could be off by', U.fmtKm(U.ringOf(tr, age))) +
      (tr.firm ? '' : row('track', U.isLost(tr, age) ? 'lost' : 'tentative')) + (tr.disabled ? row('state', 'disabled') : tr.crippled ? row('state', 'crippled') : '') + (tr.burning ? row('drive', 'burning') : '') + cardCrew(st, tr) +
      (tr.kind !== 'missile' ? '<div class="row">' + (isT ? '<span class="note">Targeted by ' + esc(st.sel === 'all' ? 'all ships' : s.name) + '</span>' : '<button data-c="tgt">Target</button>') + '</div>' : '');
    c.classList.add('on');
  }

  // an identified ship's officers: who holds each post and what they are good at
  function cardCrew(st, tr) {
    if (tr.kind !== 'ship') return '';
    var eo = st.view && st.view.enemyOfficers && st.view.enemyOfficers[tr.id];
    if (!eo || !eo.length) return '<div class="cc-u">Crew unknown</div>';
    return '<div class="cc">' + eo.map(function (o) { var A = U.D.ABILITIES[o.ability]; return '<div class="cr" title="' + esc(A ? A.text : '') + '"><span>' + esc(U.stName(o.station)) + '</span><span>' + esc(o.abilityName || (A && A.name) || '') + '</span></div>'; }).join('') + '</div>';
  }

  // ---------------------------------------------------------------- the end
  Pn.end = function () {
    var st = U.st(); if (!st) return; var w = st.w, P = st.P, O = st.O, word, cls, why;
    if (st.withdrew) { word = 'Withdrawal'; cls = 'even'; why = 'You broke off and left the field.'; }
    else if (w.winner === P) { word = 'Victory'; cls = 'win'; why = U.endWhy(w.endReason); }
    else if (w.winner === O) { word = 'Defeat'; cls = 'lose'; why = U.endWhy(w.endReason); }
    else { word = w.endReason === 'disengaged' ? 'Disengaged' : 'Stalemate'; cls = 'even'; why = U.endWhy(w.endReason); }
    function lost(S) { var n = { gone: 0, hurt: 0 }; w.ships.forEach(function (s) { if (s.side !== S) return; if (s.status === 'destroyed' || s.status === 'captured' || s.status === 'disabled') n.gone++; else if (s.status === 'crippled') n.hurt++; }); return n; }
    function drones(S) { var g = w.stats.gone[S] || {}, n = 0; Object.keys(g).forEach(function (k) { if (U.D.DRONES[k]) Object.keys(g[k]).forEach(function (c) { if (c !== 'docked') n += g[k][c]; }); }); return n; }
    var a = lost(P), b = lost(O);
    var h = '<div class="ov-box"><div class="end-word ' + cls + '">' + word + '</div><div class="end-why">' + esc(why) + ' Battle time ' + U.fmtT(w.t).slice(2) + '.</div>';
    h += '<div class="end-grid"><span class="h"></span><span class="h">You</span><span class="h">Enemy</span>' +
      '<span>Ships lost</span><span>' + a.gone + '</span><span>' + b.gone + '</span>' + '<span>Ships crippled</span><span>' + a.hurt + '</span><span>' + b.hurt + '</span>' +
      '<span>Crew lost</span><span>' + Math.round(w.stats.crewLost[P] || 0) + '</span><span>' + Math.round(w.stats.crewLost[O] || 0) + '</span>' +
      '<span>Drones lost</span><span>' + drones(P) + '</span><span>' + drones(O) + '</span></div>';
    function dmg(S, title) {
      var m = w.stats.dmgBy[S] || {}, ks = Object.keys(m).filter(function (k) { return m[k] > 0.05; }), tot = 0; ks.forEach(function (k) { tot += m[k]; });
      ks.sort(function (x, y) { return m[y] - m[x]; });
      var o = '<div class="sec"><h4>' + title + ' <em>' + Math.round(tot) + ' pts</em></h4>';
      if (!ks.length) o += '<p class="note" style="margin:0">None.</p>';
      else { o += '<div class="dmg">'; ks.forEach(function (k) { o += '<span>' + esc(U.wkName(k)) + '</span>' + bar(m[k] / tot, S === P ? '' : 'crit') + '<span>' + m[k].toFixed(1) + '</span>'; }); o += '</div>'; }
      return o + '</div>';
    }
    h += endCrew(w, P, st.seed);
    h += dmg(P, 'Damage dealt') + dmg(O, 'Damage taken');
    h += '<div class="ov-btns"><button data-e="look">Look at the plot</button><button data-e="title">Title</button><button data-e="new">New battle</button><button data-e="rematch" class="prime">Rematch</button></div></div>';
    $('end').innerHTML = h; $('end').classList.add('on'); Pn.banner(null);
  };
  // each own officer's end health and fate; the aftermath roll is seeded by the battle seed, so a rematch reads the same
  function endCrew(w, P, seed) {
    var rep = U.E.crewReport(w).filter(function (r) { return r.side === P && r.officers.length; }), h = '';
    if (!rep.length) return '';
    h += '<div class="sec"><h4>Crew</h4>';
    rep.forEach(function (r) {
      var lost = r.status === 'destroyed' ? ' was destroyed.' : '';
      if (rep.length > 1 || lost) h += '<div class="eo-ship">' + esc(r.name) + lost + '</div>';
      h += '<div class="eo">';
      r.officers.forEach(function (o) {
        var am = U.E.aftermath(o, { seed: seed, medbay: r.medbay }), went = o.wentDown || o.down, fate;
        if (went) fate = am.dies ? 'Went down. Did not survive.' : 'Went down. Misses the next mission.';
        else fate = o.health < 100 ? 'Wounded.' : 'Fit.';
        var cls = am.dies ? ' dead' : went ? ' down' : '';
        h += '<div class="eo-r' + cls + '"><b>' + esc(o.name) + (o.story ? '<i class="cast" title="Story cast" aria-label="story cast">&#9670;</i>' : '') + '</b>' + bar(o.health / 100, o.health < 25 ? 'crit' : o.health < 50 ? 'heat' : 'ok') + '<span class="eh">' + o.health + '</span>' +
          '<span class="ef">' + esc(U.stName(o.station)) + '. ' + fate + '</span></div>';
      });
      h += '</div>';
    });
    return h + '</div>';
  }
})();
