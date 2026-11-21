/* Felt & Fold: preflop drill logic (FF.Drill). Spots come from FF.Ranges.spot(), the same charts the review grades with.
 * UMD: window.FF.Drill in the browser (load cards.js, ranges.js and prewhy.js first), require('./drill.js') in node.
 * Storage: only keys that start with ff.drill. (filters, queue, stats). Never localStorage.clear(): the origin is shared.
 * Nothing here touches History, Stats, the Coach or the live coach.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./ranges.js'), require('./prewhy.js'));
  else { root.FF = root.FF || {}; root.FF.Drill = factory(root.FF.Cards, root.FF.Ranges, root.FF.PreWhy); }
})(typeof self !== 'undefined' ? self : this, function (C, R, W) {
  'use strict';
  var POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], POST = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var TYPES = ['rfi', 'vsOpen', 'vs3bet', 'limp', 'vs4bet'];
  var TYPE_NAME = { rfi: 'First in', vsOpen: 'Facing an open', vs3bet: 'Facing a 3-bet', limp: 'Over limpers', vs4bet: 'Facing a 4-bet' };
  // how often each kind of spot comes up, roughly (a loose home game limps a lot); inside a type, by how often that line happens
  var TYPE_W = { rfi: 0.28, vsOpen: 0.3, vs3bet: 0.13, limp: 0.22, vs4bet: 0.07 };
  var OK_FREQ = 0.25, GAP = 3, QMAX = 40, PREFIX = 'ff.drill.';
  var W_TRIVIAL = 0.15, W_EDGE = 1, W_MIX = 1.6, W_SPLIT = 2.2, REACH_MIN = 0.05;
  var ACTS = ['raise', 'call', 'fold'];

  function ix(p) { return POS.indexOf(p); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function bb(x) { return r1(x) + 'bb'; }
  function pc(x) { return Math.round(x * 100) + '%'; }
  function openTo(p) { return p === 'SB' ? R.SIZES.openSB[100] : R.SIZES.open[100]; }
  // the 3-bet size the vs-3-bet chart is built for: 4x the open out of position, 3x in position
  function threeTo(opener, three) { return r1(openTo(opener) * (POST.indexOf(three) < POST.indexOf(opener) ? 4 : 3)); }

  // ---------------------------------------------------------------- spot templates
  var TPL = null, BY = {};
  function subsets(arr, k) {
    if (!k) return [[]];
    var out = [];
    arr.forEach(function (x, i) { subsets(arr.slice(i + 1), k - 1).forEach(function (s) { out.push([x].concat(s)); }); });
    return out;
  }
  function templates() {
    if (TPL) return TPL;
    var raw = [];
    var RFI_W = { UTG: 1, HJ: 0.85, CO: 0.75, BTN: 0.65, SB: 0.55 };
    ['UTG', 'HJ', 'CO', 'BTN', 'SB'].forEach(function (h) { raw.push({ type: 'rfi', hero: h, seq: [], w: RFI_W[h] }); });
    Object.keys(R.VS_OPEN).forEach(function (key) {
      var p = key.split('>'), h = p[0], o = p[1], open = C.classPercent(R.rfiAt(o, 100).raise);
      var three = C.classPercent(R.vsOpenAt(key, 100).raise), t = threeTo(o, h), op = { pos: o, type: 'raise', toBB: openTo(o) };
      raw.push({ type: 'vsOpen', hero: h, vill: o, seq: [op], w: open * Math.pow(0.85, ix(h) - ix(o) - 1) });
      raw.push({ type: 'vs3bet', hero: o, vill: h, seq: [op, { pos: h, type: 'raise', toBB: t }], w: open * three, reach: R.rfiAt(o, 100).raise });
      raw.push({ type: 'vs4bet', hero: h, vill: o, seq: [op, { pos: h, type: 'raise', toBB: t }, { pos: o, type: 'raise', toBB: r1(t * R.SIZES.fourBet) }],
        w: open * three, reach: R.vsOpenAt(key, 100).raise });
    });
    // limpers: 1 to 3 of the seats before the hero; more limpers are rarer, later seats see limps more often
    var LH = { HJ: 0.5, CO: 0.8, BTN: 1, SB: 0.9, BB: 1.2 }, NW = [0, 0.5, 0.3, 0.2];
    ['HJ', 'CO', 'BTN', 'SB', 'BB'].forEach(function (h) {
      var before = POS.slice(0, ix(h));
      [1, 2, 3].forEach(function (k) {
        var sets = subsets(before, k);
        sets.forEach(function (ls) { raw.push({ type: 'limp', hero: h, limpers: ls, seq: ls.map(function (p) { return { pos: p, type: 'limp', toBB: 1 }; }), w: LH[h] * NW[k] / sets.length }); });
      });
    });
    var tot = {};
    raw.forEach(function (t) { tot[t.type] = (tot[t.type] || 0) + t.w; });
    TPL = raw.map(function (t) {
      t.w = TYPE_W[t.type] * t.w / tot[t.type];
      t.sid = t.type + ':' + t.hero + (t.vill ? '>' + t.vill : '') + (t.limpers ? '<' + t.limpers.join(',') : '');
      t.desc = { hero: t.hero, actions: t.seq.map(function (a) { return { pos: a.pos, type: a.type, toBB: a.toBB }; }), stackBB: 100, nPlayers: 6 };
      BY[t.sid] = t;
      return t;
    });
    return TPL;
  }
  function tpl(sid) { templates(); return BY[sid] || null; }
  // the chart for a template, straight from FF.Ranges.spot (the review's own grading source)
  function chartOf(t) { return t.chart || (t.chart = R.spot(t.desc)); }

  // every action up to the hero's turn, folds included, in table order
  function fullActions(t) {
    var out = [], folded = {}, active = {}, i = 0;
    t.seq.forEach(function (a) { active[a.pos] = 1; }); active[t.hero] = 1;
    function walkTo(p) {
      for (var g = 0; g < 12 && POS[i % 6] !== p; g++, i++) { var s = POS[i % 6]; if (!active[s] && !folded[s]) { folded[s] = 1; out.push({ pos: s, type: 'fold' }); } }
    }
    t.seq.forEach(function (a) { walkTo(a.pos); out.push(a); i++; });
    walkTo(t.hero);
    return out;
  }
  function priceOf(t) {
    var inn = { SB: 0.5, BB: 1 }, pot = 0, top = 0;
    t.seq.forEach(function (a) { inn[a.pos] = a.toBB; });
    for (var p in inn) { pot += inn[p]; top = Math.max(top, inn[p]); }
    var toCall = r1(top - (inn[t.hero] || 0));
    return { pot: r1(pot), toCall: toCall, need: toCall > 0 ? toCall / (pot + toCall) : 0, heroIn: inn[t.hero] || 0 };
  }
  // button labels and the verbs the reasons use
  function labelsOf(t, s) {
    var call = t.type === 'rfi' || (t.type === 'limp' && t.hero !== 'BB') ? 'Limp' : t.type === 'limp' ? 'Check' : 'Call';
    var raise = s.jam || t.type === 'vs4bet' ? 'All in' : t.type === 'vsOpen' ? '3-bet' : t.type === 'vs3bet' ? '4-bet' : 'Raise';
    return { fold: 'Fold', call: call, raise: raise };
  }
  var VERB = { Fold: 'folds', Limp: 'limps', Check: 'checks', Call: 'calls', Raise: 'raises', '3-bet': '3-bets', '4-bet': '4-bets', 'All in': 'moves all in with' };

  // ---------------------------------------------------------------- sampling weights
  function topOf(s, i) { var b = 'fold'; ACTS.forEach(function (a) { if (s[a][i] > s[b][i] + 1e-9) b = a; }); return b; }
  function maxOf(s, i) { return Math.max(s.raise[i], s.call[i], s.fold[i]); }
  function secondOf(s, i) { var v = [s.raise[i], s.call[i], s.fold[i]].sort(function (a, b) { return b - a; }); return v[1]; }
  // a trivial hand: pure (one action 99.5%+) and every neighbour on the 13x13 grid is pure with the same action
  function trivial(s, i, reach) {
    if (maxOf(s, i) < 0.995) return false;
    var top = topOf(s, i), r = Math.floor(i / 13), c = i % 13;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc, j = rr * 13 + cc;
      if ((!dr && !dc) || rr < 0 || rr > 12 || cc < 0 || cc > 12) continue;
      if (reach && reach[j] < REACH_MIN) continue;
      if (maxOf(s, j) < 0.995 || topOf(s, j) !== top) return false;
    }
    return true;
  }
  // per class: combos x how often the hero holds it here x a factor (trivial hands down, edge and mixed hands up)
  function classWeights(t) {
    if (t.cw) return t.cw;
    var s = chartOf(t), w = new Float64Array(169), reach = t.reach;
    for (var i = 0; i < 169; i++) {
      if (reach && reach[i] < REACH_MIN) continue;
      var f = trivial(s, i, reach) ? W_TRIVIAL : maxOf(s, i) >= 0.995 ? W_EDGE : secondOf(s, i) >= OK_FREQ ? W_SPLIT : W_MIX;
      w[i] = C.CLASS_SIZE[i] * f * (reach ? reach[i] : 1);
    }
    return (t.cw = w);
  }
  function pickW(items, wOf, rng) {
    var tot = 0, i;
    for (i = 0; i < items.length; i++) tot += wOf(items[i], i);
    var x = rng() * tot;
    for (i = 0; i < items.length; i++) { x -= wOf(items[i], i); if (x < 0) return items[i]; }
    return items[items.length - 1];
  }

  // ---------------------------------------------------------------- a spot
  function build(t, cls, rng) {
    rng = rng || Math.random;
    var s = chartOf(t), combos = C.CLASS_COMBOS[cls], k = combos[Math.floor(rng() * combos.length)];
    var lab = labelsOf(t, s), price = priceOf(t);
    var opts = ACTS.slice().reverse().filter(function (a) { return !(a === 'fold' && price.toCall === 0); }); // fold, call, raise
    return {
      sid: t.sid, type: t.type, hero: t.hero, vill: t.vill || null, limpers: t.limpers || null, cls: cls, hand: C.CLASS_NAME[cls],
      cards: [C.C1[k], C.C2[k]], actions: fullActions(t), pot: price.pot, toCall: price.toCall, need: price.need, heroIn: price.heroIn,
      raiseTo: s.jam ? 100 : s.raiseToBB, labels: lab, options: opts, label: s.label,
      freq: { fold: s.fold[cls], call: s.call[cls], raise: s.raise[cls] }, key: t.sid + '|' + C.CLASS_NAME[cls]
    };
  }
  function actLabel(sp, a) { return sp.labels[a] + (a === 'raise' && sp.labels.raise !== 'All in' ? ' to ' + bb(sp.raiseTo) : a === 'call' && sp.labels.call === 'Call' ? ' ' + bb(sp.toCall) : ''); }
  // whole percentages that add up to 100 (largest remainder), actions under 0.5% left out
  function split(sp) {
    var rows = ACTS.filter(function (a) { return sp.freq[a] >= 0.005; }).map(function (a) { var x = sp.freq[a] * 100; return { act: a, label: sp.labels[a], freq: sp.freq[a], pct: Math.floor(x), rem: x - Math.floor(x) }; });
    var left = 100; rows.forEach(function (r) { left -= r.pct; });
    rows.slice().sort(function (a, b) { return b.rem - a.rem; }).slice(0, Math.max(0, left)).forEach(function (r) { r.pct++; });
    return rows.filter(function (r) { return r.pct > 0; });
  }
  function splitText(sp) { return split(sp).map(function (r) { return r.label + ' ' + r.pct + '%'; }).join(' · '); }
  function isRight(sp, a) { return (sp.freq[a] || 0) >= OK_FREQ - 1e-9; }

  // ---------------------------------------------------------------- the reason (review voice: short plain sentences)
  function handDesc(name) {
    var r = 'AKQJT98765432', a = r.indexOf(name[0]), b = r.indexOf(name[1]), s = name[2] === 's';
    if (name.length === 2) return a <= 4 ? 'a big pocket pair' : a <= 7 ? 'a middle pocket pair' : 'a small pocket pair';
    if (a <= 4 && b <= 4) return s ? 'a suited broadway hand' : 'an offsuit broadway hand';
    if (a === 0) return s ? 'a suited ace' : 'an offsuit ace';
    if (s && b - a <= 2) return b - a === 1 ? 'a suited connector' : 'a suited one-gapper';
    return s ? 'a suited hand' : 'an offsuit hand';
  }
  function handCat(name) {
    var a = 'AKQJT98765432'.indexOf(name[0]);
    if (name.length === 2) return a <= 4 ? 'premium' : a <= 7 ? 'midPair' : 'smallPair';
    if (/^A[KQ]/.test(name) || name === 'AJs' || name === 'KQs') return 'premium';
    return name[2] === 's' ? 'suited' : 'offsuit';
  }
  // the share of the hero's hands here that continue (or open), counted in combos over the hands that reach the spot
  function shareOf(t, acts) {
    var s = chartOf(t), num = 0, den = 0;
    for (var i = 0; i < 169; i++) {
      var w = C.CLASS_SIZE[i] * (t.reach ? t.reach[i] : 1), v = 0;
      acts.forEach(function (a) { v += s[a][i]; });
      num += w * v; den += w;
    }
    return den ? num / den : 0;
  }
  function reason(sp, act) {
    var t = tpl(sp.sid), f = sp.freq, name = sp.hand, top = 'fold', K = [];
    ACTS.forEach(function (a) { if (f[a] > f[top] + 1e-9) top = a; });
    var verb = function (a) { return VERB[sp.labels[a]]; };
    var also = ACTS.filter(function (a) { return a !== top && f[a] >= OK_FREQ; })[0];
    var play = f[top] >= 0.995 ? 'The chart always ' + verb(top) + ' ' + name + '.' : 'The chart ' + verb(top) + ' ' + name + ' ' + pc(f[top]) + ' of the time' +
      (also ? ' and ' + verb(also) + ' it ' + pc(f[also]) + '.' : '.');
    var mixed = ACTS.filter(function (a) { return f[a] >= OK_FREQ; }).length > 1;
    if (isRight(sp, act)) {
      if (mixed) return { text: 'This is a mixed spot. The chart plays ' + name + ' more than one way.', concepts: ['mixed'] };
      return { text: play, concepts: K };
    }
    var out = [], outside = name + ' (' + handDesc(name) + ') is outside that range.';
    var cont = pc(shareOf(t, ['raise', 'call']));
    if (sp.type === 'rfi') {
      if (sp.hero === 'SB') out.push('From the SB, the chart raises about ' + pc(shareOf(t, ['raise'])) + ' of hands and limps about ' + pc(shareOf(t, ['call'])) + '.');
      else out.push('The chart opens about ' + cont + ' of hands from ' + sp.hero + '.');
      out.push(f.fold >= 0.995 ? outside : play);
      if (act === 'call' && sp.hero !== 'SB') { out.push('It never limps first in from ' + sp.hero + '.'); K.push('limpIn'); }
    } else if (sp.type === 'vsOpen') {
      out.push('Against ' + (/^(SB|HJ)$/.test(sp.vill) ? 'an ' : 'a ') + sp.vill + ' open, the chart continues with about ' + cont + ' of hands.');
      out.push(f.fold >= 0.995 ? outside : play);
      if (act === 'fold' && sp.hero === 'BB') { out.push('The pot odds are good. A call needs only ' + pc(sp.need) + ' equity.'); K.push('potOdds'); }
    } else if (sp.type === 'vs3bet') {
      out.push('Against a 3-bet from the ' + sp.vill + ', the chart keeps about ' + cont + ' of its ' + sp.hero + ' opens.');
      out.push(f.fold >= 0.995 ? outside : play);
    } else if (sp.type === 'vs4bet') {
      out.push('Against a 4-bet, the chart keeps about ' + cont + ' of its 3-bets from ' + sp.hero + '.');
      out.push(f.fold >= 0.995 ? outside : play);
    } else {
      var n = sp.limpers.length, lw = n === 1 ? '1 limper' : n + ' limpers', cat = handCat(name);
      out.push('Over ' + lw + ', the chart raises about ' + pc(shareOf(t, ['raise'])) + ' of hands from ' + sp.hero + '.');
      out.push(play);
      // the review's limper text, from the shared builder
      var ip = (sp.hero !== 'SB' && sp.hero !== 'BB') || (sp.hero === 'BB' && n === 1 && sp.limpers[0] === 'SB');
      var lw2 = W.limp({ hand: name, pos: sp.hero, top: top === 'call' && sp.hero === 'BB' ? 'check' : top, limpers: n, ip: ip });
      if (lw2.text) out.push(lw2.text);
      lw2.concepts.concat('limp').forEach(function (x) { if (K.indexOf(x) < 0) K.push(x); });
      return { text: out.join(' '), concepts: K };
    }
    // why the chart's play beats yours (the shared builder the review uses too)
    var hi = POST.indexOf(sp.hero), vi = sp.vill ? POST.indexOf(sp.vill) : -1;
    var pw = W.why({ hand: name, pos: sp.hero, kind: sp.type, did: act, top: top, vill: sp.vill, callers: 0, ip: vi >= 0 && hi > vi,
      closes: sp.type !== 'vsOpen' || sp.hero === 'BB', need: sp.need, saidPrice: out.join(' ').indexOf('pot odds') >= 0 });
    if (pw.text) out.push(pw.text);
    pw.concepts.forEach(function (x) { if (K.indexOf(x) < 0) K.push(x); });
    return { text: out.join(' '), concepts: K };
  }

  // ---------------------------------------------------------------- storage (ff.drill.* only, every call wrapped)
  function storage(st) {
    if (st === undefined) { try { st = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { st = null; } }
    return {
      get: function (k, def) { try { var v = st && st.getItem(PREFIX + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
      set: function (k, v) { try { if (st) st.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
      remove: function (k) { try { if (st) st.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
    };
  }
  function blankStats() { return { n: 0, ok: 0, types: {}, pos: {} }; }
  function tally(st, sp, ok) {
    st.n++; if (ok) st.ok++;
    [['types', sp.type], ['pos', sp.hero]].forEach(function (p) { var o = st[p[0]][p[1]] || (st[p[0]][p[1]] = { n: 0, ok: 0 }); o.n++; if (ok) o.ok++; });
  }
  function cleanFilters(f) {
    f = f || {};
    var types = (f.types || TYPES).filter(function (x) { return TYPES.indexOf(x) >= 0; }), pos = (f.pos || POS).filter(function (x) { return POS.indexOf(x) >= 0; });
    return { types: types, pos: pos };
  }
  function pool(f) { f = cleanFilters(f); return templates().filter(function (t) { return f.types.indexOf(t.type) >= 0 && f.pos.indexOf(t.hero) >= 0; }); }

  // ---------------------------------------------------------------- a drill session
  function create(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random, st = storage(opts.storage);
    var D = { filters: cleanFilters(st.get('filters', null)), session: blankStats(), last: null };
    var Q = st.get('queue', null);
    if (!Q || !Array.isArray(Q.items)) Q = { n: 0, items: [] };
    var life = st.get('stats', null) || blankStats();
    D.queue = function () { return Q; };
    D.lifetime = function () { return life; };
    D.setFilters = function (f) { D.filters = cleanFilters(f); st.set('filters', D.filters); };
    D.pool = function () { return pool(D.filters); };
    D.next = function () {
      var list = pool(D.filters), ok = {};
      if (!list.length) return null;
      list.forEach(function (t) { ok[t.sid] = 1; });
      // reviews and fresh deals alternate at worst, so a run of misses never crowds out new spots
      var due = D.last && D.last.again ? null : Q.items.filter(function (it) { return it.due <= Q.n && ok[it.sid] && BY[it.sid]; }).sort(function (a, b) { return a.due - b.due; })[0];
      var sp;
      if (due) { sp = build(BY[due.sid], due.cls, rng); sp.again = true; }
      else {
        var t = pickW(list, function (x) { return x.w; }, rng), cw = classWeights(t), cls = pickW(Array.from({ length: 169 }, function (x, i) { return i; }), function (i) { return cw[i]; }, rng);
        // a fresh deal of a hand waiting for review would serve it early; the next due time still stands
        sp = build(t, cls, rng);
      }
      Q.n++; st.set('queue', Q);
      D.last = sp;
      return sp;
    };
    D.answer = function (sp, act) {
      if (sp.result) return sp.result;
      var ok = isRight(sp, act), rs = reason(sp, act), i = -1;
      Q.items.forEach(function (it, j) { if (it.k === sp.key) i = j; });
      if (!ok) {
        if (i >= 0) Q.items.splice(i, 1);
        Q.items.push({ k: sp.key, sid: sp.sid, cls: sp.cls, due: Q.n + GAP });
        if (Q.items.length > QMAX) Q.items.splice(0, Q.items.length - QMAX);
      } else if (i >= 0) Q.items.splice(i, 1);
      st.set('queue', Q);
      tally(D.session, sp, ok); tally(life, sp, ok); st.set('stats', life);
      sp.result = { ok: ok, act: act, split: split(sp), splitText: splitText(sp), text: rs.text, concepts: rs.concepts };
      return sp.result;
    };
    D.resetLifetime = function () { life = blankStats(); st.remove('stats'); st.remove('queue'); Q = { n: 0, items: [] }; };
    return D;
  }

  // the 13x13 grid for a spot: per class the chart's mix, and whether the hero can hold it here
  function grid(sp) {
    var t = tpl(sp.sid), s = chartOf(t), out = [];
    for (var i = 0; i < 169; i++) out.push({ name: C.CLASS_NAME[i], raise: s.raise[i], call: s.call[i], fold: s.fold[i], live: !t.reach || t.reach[i] >= REACH_MIN });
    return out;
  }
  function totals(sp) {
    var t = tpl(sp.sid);
    return { raise: shareOf(t, ['raise']), call: shareOf(t, ['call']), fold: shareOf(t, ['fold']) };
  }

  return {
    POS: POS, TYPES: TYPES, TYPE_NAME: TYPE_NAME, TYPE_W: TYPE_W, OK_FREQ: OK_FREQ, GAP: GAP, PREFIX: PREFIX, W_TRIVIAL: W_TRIVIAL,
    templates: templates, tpl: tpl, chartOf: chartOf, pool: pool, build: build, classWeights: classWeights, trivial: trivial,
    split: split, splitText: splitText, isRight: isRight, reason: reason, actLabel: actLabel, grid: grid, totals: totals, create: create,
    fmtBB: bb
  };
});
