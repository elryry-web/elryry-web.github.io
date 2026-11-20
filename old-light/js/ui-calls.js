/* Old Light UI: captain's calls. At a few moments that matter the battle stops and asks the player: brake or pass at
   the best range, dodge harder at the cost of an officer, hold steady for a spinal shot, and what to do when losing or
   low on fuel. Each card quotes the numbers, offers two or three orders and "Let Auto decide". Orders go through
   the same paths as the Helm tab. A setting turns calls off (U.set.calls); the tutorial has none. The AI and the
   engine never see a call: ai.js only tells the UI of its stop choice through w.ai.ask, which changes nothing. */
(function () {
  'use strict';
  var U = window.OLUI = window.OLUI || {};
  var C = U.calls = {};
  var BANDS = ['cruise', 'combat', 'brace', 'crash'], BN = { cruise: 'Cruise', combat: 'Combat', brace: 'Brace', crash: 'Crash' };
  var GAP = 180, ANY = 60, OPEN = 90;   // game s: per kind, between any two calls, and the longest a card stays open while the clock runs
  var MAX = { range: 2, dodge: 2, hold: 2, lose: 2 }, CAP = 6;   // calls of each kind, and in all, in one battle
  var cs = null;   // { last: {kind: t}, sig: {kind: sig}, lastAny, cur, pend, restore: [], log: [] }
  var dom = function (id) { return typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null; };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kms(v) { return Math.round(v) + ' km/s'; }

  C.on = function () { var st = U.st(); return !!(st && U.set.calls !== false && !(U.D.SCENARIOS[st.scn] || {}).tutorial); };
  C.state = function () { return cs; };   // for test harnesses
  C.start = function () {
    var st = U.st(); hide(); cs = { last: {}, sig: {}, asked: {}, lastAny: -1e9, cur: null, pend: null, restore: [], log: [] };
    if (!st) return;
    // Auto's stop choice, as ai.js makes it; kept until the call can show (or the moment passes)
    st.w.ai.ask = function (kind, s, info) { if (cs && kind === 'range' && s.side === st.P) cs.pend = { s: s, info: info }; };
  };
  C.stop = function () { hide(); cs = null; };
  C.end = function () { if (cs && cs.cur) { cs.log[cs.log.length - 1].pick = 'ended'; cs.cur = null; } hide(); };

  // ---------------------------------------------------------------- once a tick, after the UI has read the tick's events
  C.tick = function () {
    var st = U.st(); if (!st || !cs) return; var w = st.w;
    restores(st, w);
    if (cs.cur) {
      if (!cs.cur.still() || (!st.paused && w.t - cs.cur.t0 > OPEN)) close(null, true);
      return;
    }
    if (!C.on() || st.over || w.over) { cs.pend = null; return; }
    // never on top of another card or pause; a rounds-inbound pause from this same tick is replaced by the call
    var tut = U.tutor && U.tutor.state && U.tutor.state(), busy = (tut && tut.cur) || (st.paused && !(st.pauseAt === w.t && st.pauseKey === 'launch'));
    var c = null;
    if (cs.pend) { c = rangeCall(st, w, cs.pend); if (!c) { if (!stillRange(st, cs.pend)) cs.pend = null; } }
    if (busy) return;
    if (w.t - cs.lastAny < ANY) return;
    if (!c && w.t % 5 === 0) U.ownShips().forEach(function (s) { if (!c && U.E.active(s)) c = dodgeCall(st, w, s) || holdCall(st, w, s) || loseCall(st, w, s); });
    if (!c) return;
    if (c.kind === 'range') cs.pend = null;
    open(st, w, c);
  };
  function due(w, kind, sig) {
    var n = cs.log.filter(function (x) { return x.kind === kind; }).length;
    return cs.log.length < CAP && n < MAX[kind] && !(cs.last[kind] != null && w.t - cs.last[kind] < GAP) && cs.sig[kind] !== sig && !cs.asked[kind + ':' + sig];
  }

  // ---------------------------------------------------------------- 1. brake or pass at the best range
  function stillRange(st, p) {
    var s = p.s, h = U.helm(s), m = s.orders.man;
    return !!(U.E.active(s) && m && (m.type === 'close' || m.type === 'hold') && h && h.mode && h.d > p.info.R * 1.05);
  }
  function rangeCall(st, w, p) {
    var s = p.s, I = p.info, m = s.orders.man, N = U.N, sig = I.tgt + '|' + I.n;
    if (!stillRange(st, p) || (m.pass && m.pass !== 'auto') || !due(w, 'range', sig)) return null;
    var tr = U.track(I.tgt), nm = tr ? (tr.name || tr.id) : I.tgt, left = I.dv - I.vr;
    var tc = I.Vc > 0.5 ? Math.max(0, I.d - I.R) / I.Vc : 0;
    var taken = I.deal != null && I.edge != null ? I.deal - I.edge : null, ratio = taken > 1e-9 ? I.deal / taken : null;
    var why = I.why === 'edge' ? 'At ' + U.fmtKm(I.R) + ' we out-hit them ' + ratio.toFixed(1) + ' to 1.'
      : I.why === 'passes' ? 'It has passed ' + I.n + ' times already.'
      : I.why === 'fuel' ? 'The stop would leave under ' + kms(N.reserveDv + N.passMargin) + '.'
      : ratio != null && Math.abs(ratio - 1) < 0.15 ? 'At ' + U.fmtKm(I.R) + ' the trade is about even.'
      : ratio != null && ratio >= 1 ? 'At ' + U.fmtKm(I.R) + ' we out-hit them ' + ratio.toFixed(1) + ' to 1, but not by enough to pay for the stop.'
      : ratio != null ? 'At ' + U.fmtKm(I.R) + ' they out-hit us ' + (1 / Math.max(1e-6, ratio)).toFixed(1) + ' to 1.'
      : 'Neither choice gives us a clear edge.';
    var pickW = I.pick === 'brake' ? 'Brake' : 'Pass through';
    return { kind: 'range', s: s, sig: sig, title: 'Brake or pass?', why: s.name + ': brake or pass ' + nm + '?',
      lines: [nm + ' is closing at ' + kms(I.Vc) + ', ' + U.fmtKm(I.d) + ' out. Our best range is ' + U.fmtKm(I.R) + '.',
        'Brake: costs ' + kms(I.vr) + ' of Δv and leaves ' + kms(Math.max(0, left)) + ' (reserve ' + kms(N.reserveDv) + ').' +
        ' Pass: no Δv spent. We pass in ' + U.fmtEta(tc) + ' with the guns firing, then turn back.',
        'Auto: ' + (I.pick === 'brake' ? 'brake' : 'pass') + '. ' + why],
      opts: [{ k: 'brake', label: 'Brake', sub: '−' + kms(I.vr) }, { k: 'pass', label: 'Pass through', sub: 'no Δv' }],
      auto: I.pick, autoText: pickW.toLowerCase(),
      still: function () { return stillRange(st, p); },
      apply: function (k) {
        var mm = s.orders.man; if (!mm) return;
        mm.pass = k; U.AI.repass(w, s);   // as the Helm tab's At range chips, then decide again with the order
        cs.restore.push({ k: 'pass', s: s, val: k, seen: false });
        return (k === 'brake' ? 'brake for ' : 'pass ') + nm + '. At range goes back to Auto after this approach.';
      } };
  }

  // ---------------------------------------------------------------- 2. dodge harder, at an officer's cost
  function slugThreats(st, s) { return (st.thr[s.id] || []).filter(function (t) { return t.hit && t.kind !== 'missile' && t.kind !== 'payload' && t.kind !== 'drone' && t.eta > 12; }); }
  function thrName(st, t) {
    var tr = t.src && U.trackByOid(t.src), who = tr ? (tr.name || tr.id) : 'the enemy';
    var what = t.wk === 'canister' ? 'A canister' : t.n > 1 ? t.n + ' rounds' : 'A round';
    return { what: what, who: who, lands: t.n > 1 && t.wk !== 'canister' ? ' land in ' : ' lands in ' };
  }
  function harmText(s, hurt) {
    var by = {}; (s.officers || []).forEach(function (o) { by[o.id] = o; });
    return hurt.slice(0, 2).map(function (h) { var o = by[h.officer]; return o ? U.shortName(s, o) + ' (' + U.stName(o.station).toLowerCase() + ', hurt past ' + o.limit + ' G)' : h.name; }).join(' and ');
  }
  function dodgeCall(st, w, s) {
    if (s.orders.evasion === 'off' || s.ctl.ev !== 'hard') return null;
    var base = s.orders.gLimit || 'combat', bi = BANDS.indexOf(base), H = U.E.bandHarm(w, st.P, s.id); if (bi < 0 || !H) return null;
    var top = null; slugThreats(st, s).forEach(function (t) { var r = t.hit[base]; if (r != null && (!top || r > top.r)) top = { t: t, r: r }; });
    if (!top || top.r < 0.12) return null;
    var t = top.t, B = null;
    for (var b = bi + 1; b < BANDS.length; b++) {
      var k = BANDS[b], hb = t.hit[k]; if (hb == null || H[k].g <= H[BANDS[b - 1]].g + 0.2) break;
      if (top.r - hb >= Math.max(0.06, 0.3 * top.r)) { B = k; break; }
    }
    if (!B || !H[B].hurt.length || !due(w, 'dodge', t.id)) return null;
    var nmT = thrName(st, t), hb2 = t.hit[B], ap = U.AI.bandPick(w, s), auto = ap && BANDS.indexOf(ap.pick) >= BANDS.indexOf(B) ? 'harder' : 'stay';
    return { kind: 'dodge', s: s, sig: t.id, title: 'Dodge harder?', why: nmT.what + ' inbound on ' + s.name + '. Dodge harder?',
      lines: [nmT.what + ' from ' + nmT.who + nmT.lands + U.fmtEta(t.eta) + '. At ' + BN[base] + ' (' + H[base].g + ' G) it has ' + U.pct(top.r) + ' to hit.',
        BN[B] + ' (' + H[B].g + ' G) cuts that to ' + U.pct(hb2) + '. The G hurts ' + harmText(s, H[B].hurt) + '.',
        'Auto: ' + (auto === 'harder' ? BN[B] + ' until it passes. The danger is worth the injury.' : 'stay at ' + BN[base] + '. The cut is not worth the injury.')],
      opts: [{ k: 'harder', label: BN[B], sub: U.pct(hb2) + ' to hit' }, { k: 'stay', label: 'Stay', sub: U.pct(top.r) + ' to hit' }],
      auto: auto, autoText: auto === 'harder' ? BN[B] : 'stay at ' + BN[base],
      still: function () { return U.E.active(s) && (st.thr[s.id] || []).some(function (x) { return x.id === t.id; }); },
      apply: function (k) {
        if (k !== 'harder') return 'stay at ' + BN[base] + '.';
        U.order({ gLimit: B }, [s]);
        cs.restore.push({ k: 'band', s: s, val: B, back: base, until: w.t + t.eta + 5 });
        return BN[B] + ' until it passes, then back to ' + BN[base] + '.';
      } };
  }

  // ---------------------------------------------------------------- 3. hold steady for the spinal
  function holdCall(st, w, s) {
    if (s.orders.evasion !== 'auto' || s.ctl.ev !== 'hard') return null;
    var tgt = U.targetOf(s); if (!tgt || !tgt.firm) return null;
    var m = s.mods.filter(function (x) { return x.kind === 'rail' && x.def.spinal && x.state < 2 && x.ammo > 0; })[0];
    if (!m || m.cd > 3 || U.railThr(s, m, U.grp(s, m.key)) == null) return null;
    var e = U.E.hitEstimate(w, s, m.id, tgt.id, { n: 1 }); if (!e || !e.ok) return null;
    var sc = e.steadyChance || 0, now = e.chance || 0, thr = U.railThr(s, m, U.grp(s, m.key));
    if (sc < Math.max(thr, 0.08) || sc - now < 0.08) return null;
    var band = s.orders.gLimit || 'combat', top = null;
    slugThreats(st, s).forEach(function (t) { var d = t.hit[band] != null ? t.hit[band] : t.hit.combat; if (!top || t.hit.off - d > top.off - top.d) top = { t: t, off: t.hit.off, d: d }; });
    if (!top || top.off - top.d < 0.03) return null;
    var sig = tgt.id + '|' + top.t.id; if (!due(w, 'hold', sig)) return null;
    var nmT = thrName(st, top.t), shots = m.ammo;
    return { kind: 'hold', s: s, sig: sig, title: 'Hold for the shot?', why: s.name + ': hold steady for the spinal?',
      lines: ['Held steady, the spinal has ' + U.pct(sc) + ' to hit ' + (tgt.name || tgt.id) + '. While we dodge it cannot fire.',
        'Holding gives them a steady track. ' + nmT.what + ' from ' + nmT.who + nmT.lands + U.fmtEta(top.t.eta) + ': ' + U.pct(top.d) + ' to hit us dodging, ' + U.pct(top.off) + ' if we hold.',
        'Auto: keep dodging. The spinal fires once the dodge ends.'],
      opts: [{ k: 'hold', label: 'Hold steady', sub: 'spinal ' + U.pct(sc) }, { k: 'dodge', label: 'Keep dodging', sub: U.pct(top.d) + ' on us' }],
      auto: 'dodge', autoText: 'keep dodging',
      still: function () { return U.E.active(s) && s.ctl.ev === 'hard' && m.ammo === shots && m.state < 2; },
      apply: function (k) {
        if (k !== 'hold') return 'keep dodging. The spinal fires once the dodge ends.';
        U.order({ evasion: 'off' }, [s]);
        cs.restore.push({ k: 'ev', s: s, m: m, shots: shots, until: w.t + 30 });
        return 'hold steady for the spinal. Evasion goes back to Auto after the shot.';
      } };
  }

  // ---------------------------------------------------------------- 4. losing, or low on Δv
  function loseCall(st, w, s) {
    var tr = U.targetOf(s), T = tr && w.idx[tr.oid]; if (!tr || !T || !U.E.active(T) || tr.disabled) return null;
    var N = U.N, mine = s.hp / s.hpMax, theirs = T.hp / T.hpMax, dv = U.E.dvLeft(s), d = Math.hypot(tr.ex - s.x, tr.ey - s.y);
    var behind = mine < 0.6 && mine <= theirs - 0.3, low = dv < N.reserveDv + 10 && d < 200000;
    if (!behind && !low) return null;
    var sig = behind ? 'behind' : 'low';
    if (!due(w, 'lose', sig)) return null;
    var M = w.ai && w.ai.side[st.P], mem = M && M.ship && M.ship[s.id], rf = mem && mem.rf && mem.rf.tgt === tr.id ? mem.rf : null;
    var nm = tr.name || tr.id, cold = d > N.coldShip * 1.1, lines = [];
    lines.push(behind ? s.name + ' is at ' + Math.round(mine * 100) + '% hull. ' + nm + ' is at ' + Math.round(theirs * 100) + '%.'
      : s.name + ' has ' + kms(dv) + ' of Δv left. The helm keeps ' + kms(N.reserveDv) + ' back to dodge with.');
    if (rf && rf.out > 0 && rf.inn > 0) lines.push('At ' + U.fmtKm(rf.R) + ' we would sink them in about ' + U.fmtIn(T.hp / rf.out) + '. They would sink us in about ' + U.fmtIn(s.hp / rf.inn) + '.');
    lines.push('Break off: run with the Δv left.' + (cold ? ' Go cold: cut the drive. They lose us past about ' + U.fmtKm(N.coldShip) + '; we are ' + U.fmtKm(d) + ' out.' : ''));
    lines.push('Auto: fight on. It breaks off only when its guns are spent.');
    var opts = [{ k: 'break', label: 'Break off', sub: kms(dv) + ' left' }];
    if (cold) opts.push({ k: 'cold', label: 'Go cold', sub: 'no thrust' });
    opts.push({ k: 'fight', label: 'Fight on', sub: '' });
    return { kind: 'lose', s: s, sig: sig, title: behind ? 'Losing the fight' : 'Low on Δv', why: s.name + (behind ? ' is losing.' : ' is low on Δv.'),
      lines: lines, opts: opts, auto: 'fight', autoText: 'fight on',
      still: function () { return U.E.active(s) && U.E.active(T); },
      apply: function (k) {
        if (k === 'break') { U.order({ man: { type: 'break', target: '@', vmax: 40 } }, [s]); return 'break off from ' + nm + '.'; }
        if (k === 'cold') { U.order({ man: { type: 'cold' }, radiators: 'retract' }, [s]); return 'go cold.'; }
        return 'fight on.';
      } };
  }

  // ---------------------------------------------------------------- orders a call set for a while
  function restores(st, w) {
    cs.restore = cs.restore.filter(function (r) {
      var s = r.s;
      if (!U.E.active(s)) return false;
      if (r.k === 'pass') {
        var m = s.orders.man, h = U.helm(s); if (!m || m.pass !== r.val) return false;
        if (h && h.mode) { r.seen = true; return true; }
        if (!r.seen) return true;
        m.pass = 'auto'; U.addLog(s.name + ': At range back on Auto.', 'own'); return false;
      }
      if (r.k === 'band') {
        if (s.orders.gLimit !== r.val) return false;
        if (w.t < r.until) return true;
        U.E.order(w, s.id, { gLimit: r.back }); U.addLog(s.name + ': back to ' + BN[r.back] + '.', 'own'); return false;
      }
      if (r.k === 'ev') {
        if (s.orders.evasion !== 'off') return false;
        var fired = r.m.ammo < r.shots; if (!fired && w.t < r.until) return true;
        U.E.order(w, s.id, { evasion: 'auto' }); U.addLog(s.name + ': ' + (fired ? 'spinal away.' : 'no shot in 30 s.') + ' Evasion back to Auto.', 'own'); return false;
      }
      return false;
    });
  }

  // ---------------------------------------------------------------- the card
  function open(st, w, c) {
    c.t0 = w.t; cs.cur = c; cs.last[c.kind] = w.t; cs.sig[c.kind] = c.sig; cs.asked[c.kind + ':' + c.sig] = 1; cs.lastAny = w.t;
    c.paused = true; U.pause(c.why, null); st.pauseKey = 'call';
    cs.log.push({ kind: c.kind, t: w.t, auto: c.auto, pick: null });
    show(c);
  }
  // k: an option, 'auto', or null when the moment passed with the card still open (Auto's choice stands)
  function close(k, passed) {
    var st = U.st(), c = cs && cs.cur; if (!st || !c) return;
    var pick = k == null || k === 'auto' ? c.auto : k, text;
    if (passed) text = 'The moment passed. Auto chose to ' + c.autoText + '.';
    else if (k === 'auto') text = 'Auto decides: ' + c.autoText + '.';
    else text = c.apply(k);
    if (!passed && k === 'auto' && pick !== c.auto) text = c.apply(pick);
    // Auto's own choice needs no new order: Auto is already flying it, except a harder band, which the player's ship
    // keeps only by order
    if (k === 'auto' && c.kind === 'dodge' && c.auto === 'harder') c.apply('harder');
    cs.log[cs.log.length - 1].pick = passed ? 'passed' : k;
    cs.cur = null; hide();
    U.addLog('Captain' + "'" + 's call: ' + text.charAt(0).toUpperCase() + text.slice(1), 'own');
    if (!passed && st.paused && !st.over && st.pauseKey === 'call') U.resume();
    if (U.panels && U.panels.refresh) U.panels.refresh(true);
  }
  C.answer = function (k) { if (cs && cs.cur) close(k, false); };
  C.current = function () { return cs && cs.cur; };

  function show(c) {
    var el = dom('call'), b = dom('battle'); if (!el) return;
    var h = '<h4>' + esc(c.title) + '</h4>' + c.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '<div class="call-btns">';
    c.opts.forEach(function (o) { h += '<button data-c="' + o.k + '"' + (o.k === c.auto ? ' class="is-auto"' : '') + '>' + esc(o.label) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</button>'; });
    h += '<button class="prime" data-c="auto">Let Auto decide<small>' + esc(c.autoText) + '</small></button></div>';
    el.innerHTML = h; el.className = 'tut call on';
    if (b) b.classList.add('call-on');
    place(); setTimeout(place, 60);
  }
  function hide() { var el = dom('call'), b = dom('battle'); if (el) { el.className = 'tut call'; el.innerHTML = ''; } if (b) b.classList.remove('call-on'); }
  // under the top bar and the threat strip, as the tutorial's cards sit
  function place() {
    var el = dom('call'), tb = dom('topbar'), th = dom('threats'); if (!el || !tb) return;
    var y = tb.offsetHeight + 8; if (th && th.innerHTML) y += th.offsetHeight + 6;
    el.style.top = y + 'px';
  }

  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', function () {
    var el = dom('call'); if (!el) return;
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) { C.answer(b.getAttribute('data-c')); U.sfx && U.sfx('click'); } });
    window.addEventListener('resize', function () { if (cs && cs.cur) place(); });
  });
})();
