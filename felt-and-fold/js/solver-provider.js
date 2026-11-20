/* Felt & Fold: solver provider for FF.Strategy.setSolverProvider.
 * Heads-up postflop only (the review never asks about anything else).
 *   flop        -> nearest solved flop in the library (FF.FlopMap + FF.Library), suits remapped. Source 'Library'.
 *   turn, river -> live solve with FF.Solver (WASM in workers) from the start of the street, with a time cap. Source 'Solved'.
 * Anything missing, unsolved, unconverged, off-tree or slow returns null, so the Estimate stands.
 * The UI must call FF.SolverProvider.remember(h) for each finished hand it reviews (street-start ranges need the hand).
 *
 *   FF.SolverProvider.install()        registers with FF.Strategy
 *   FF.SolverProvider.remember(h)
 *   FF.SolverProvider.liveEnabled()    false on slow devices (phone): library + Estimate only
 *   FF.SolverProvider.stats            counters for debugging
 */
(function (root) {
  'use strict';
  var FF = root.FF = root.FF || {};
  var S = FF.Strategy, C = FF.Cards;
  var LIB_BASE = 'solver/library/';
  var ALLIN_AT = 0.67, RIVER_MS = 6000, TURN_MS = 20000, TARGET = 0.5, FETCH_MS = 8000, INDEX_TTL = 10 * 60 * 1000, MISS_TTL = 5 * 60 * 1000;
  var RANKS = '23456789TJQKA', SUITS = 'cdhs', KINDS = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
  var hands = new Map(), stats = { asked: 0, library: 0, solved: 0, nulls: 0, offTree: 0, errors: 0, lastError: null };

  function slowDevice() {
    var hc = navigator.hardwareConcurrency || 2;
    var mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    return hc <= 4 || mobile;
  }
  var live = typeof WebAssembly === 'object' && typeof Worker === 'function' && !!FF.Solver && !slowDevice();

  function remember(h) {
    if (!h || h.id == null) return;
    hands.delete(h.id); hands.set(h.id, h);
    if (hands.size > 200) hands.delete(hands.keys().next().value);
  }
  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
  function withTimeout(p, ms) {
    return new Promise(function (res) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } }, function (e) {
        if (!done) { done = true; clearTimeout(t); stats.errors++; stats.lastError = String(e && e.message || e); res(null); }
      });
    });
  }
  function kindOf(k) { return typeof k === 'number' ? KINDS[k] : k; }
  function isAgg(k) { return k === 'bet' || k === 'raise' || k === 'allin'; }

  // replay this street's actions up to n: street-start pot and stacks, sizes used, raises, who led
  function streetInfo(h, desc) {
    var n = desc.n, street = desc.street, log = h.log, nStart = n, first = {};
    for (var i = 0; i < n; i++) { var e = log[i]; if (e.ev === 'act' && e.street === street) { if (nStart === n) nStart = i; if (first[e.seat] == null) first[e.seat] = e.stackBefore; } }
    var hero = desc.heroSeat, vill = desc.villainSeats[0];
    var heroStart = first[hero] != null ? first[hero] : log[n].stackBefore;
    var villStart = first[vill] != null ? first[vill] : desc.stacks[vill];
    var potStart = nStart < n ? log[nStart].potBefore : log[n].potBefore;
    return { nStart: nStart, potStart: potStart, eff: Math.min(heroStart, villStart), hero: hero, vill: vill };
  }
  var ORDER = ['SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN'];
  function heroIsOOP(desc) { return ORDER.indexOf(desc.heroPos) < ORDER.indexOf(desc.villainPos[0]); }

  // walk the street's actions (plus the hero's own at n) and collect the sizes as solver fractions; also the query path
  function walk(h, desc, si, unit) {
    var acts = desc.thisStreet.slice(), heroAct = h.log[desc.n];
    var pot = si.potStart, cur = 0, com = {}, bets = [], raises = [], path = [], nRaise = 0, oopLead = false, oop = heroIsOOP(desc);
    var oopSeat = oop ? desc.heroSeat : desc.villainSeats[0];
    var heroBet = null, heroRaise = null;
    function step(a, record) {
      var c = com[a.seat] || 0, to = a.to || 0, mine = !record && a.seat === desc.heroSeat;
      if (a.type === 'check') { if (record) path.push('x'); return; }
      if (a.type === 'call') { if (record) path.push('c'); com[a.seat] = Math.min(cur, c + 1e12); return; }
      if (a.type === 'fold') return;
      if (cur === 0) { // a bet
        if (a.seat === oopSeat && !path.length) oopLead = true;
        if (!a.allIn) { if (mine) heroBet = to / pot; else bets.push(to / pot); }
        if (record) path.push(a.allIn ? 'a' : 'b' + (to / unit).toFixed(2));
      } else {
        var call = cur - c, pac = pot + call, frac = (to - cur) / Math.max(1, pac); nRaise++;
        if (!a.allIn) { if (mine) heroRaise = frac; else raises.push(frac); }
        if (record) path.push(a.allIn ? 'a' : 'r' + (to / unit).toFixed(2));
      }
      pot += to - c; com[a.seat] = to; cur = to;
    }
    acts.forEach(function (a) {
      var c = com[a.seat] || 0;
      if (a.type === 'call') { pot += cur - c; com[a.seat] = cur; path.push('c'); return; }
      step(a, true);
    });
    var heroCom = com[desc.heroSeat] || 0;
    // the hero's own action at n: its size goes into the tree, not the path
    if (heroAct && (heroAct.type === 'bet' || heroAct.type === 'raise')) step({ seat: desc.heroSeat, type: heroAct.type, to: heroAct.to, allIn: heroAct.allIn }, false);
    if (oop && !acts.some(function (a) { return a.type !== 'check'; }) && !acts.length) oopLead = true;
    return { path: path, bets: bets, raises: raises, nRaise: nRaise, oopLead: oopLead, oop: oop, heroCom: heroCom, heroBet: heroBet, heroRaise: heroRaise };
  }
  // the street's sizes for a live solve: the base sizes, the sizes already used on the street (merged within 0.06 of one
  // already there) and the hero's own size (merged only within 0.02, so the hero is graded at the real size).
  // At most 4: base sizes go first when there are too many, since the hand's own sizes are needed for the path.
  var MERGE = 0.06, MERGE_HERO = 0.02;
  function sizes(base, extra, mine) {
    var out = base.slice(), keep = [];
    function add(f, tol) {
      f = Math.round(f * 100) / 100; if (!(f > 0.05 && f < 6)) return;
      var near = out.filter(function (x) { return Math.abs(x - f) < tol - 1e-9; })[0];
      if (near == null) out.push(near = f);
      if (keep.indexOf(near) < 0) keep.push(near);
    }
    if (mine != null) add(mine, MERGE_HERO);
    (extra || []).forEach(function (f) { add(f, MERGE); });
    while (out.length > 4) {
      var drop = -1; out.forEach(function (x, i) { if (keep.indexOf(x) < 0 && drop < 0) drop = i; });
      out.splice(drop < 0 ? out.length - 1 : drop, 1);
    }
    return out.sort(function (a, b) { return a - b; });
  }
  function rangeArr(w, boost) {
    var a = new Float64Array(1326), mx = 0, i;
    for (i = 0; i < 1326; i++) { a[i] = w[i] || 0; if (a[i] > mx) mx = a[i]; }
    if (boost != null && a[boost] < 0.05 * mx) a[boost] = Math.max(0.05 * mx, 1e-3);
    return a;
  }

  // The hero's own bet or raise against the solved sizes, all as fractions of the pot before the action.
  // Within 0.8-1.25x of the nearest solved size, that size's EV stands ('near'). Further off, the EVs of the two
  // neighbouring sizes are blended with pseudo-harmonic weights (Ganzfried & Sandholm 2013) ('blend'). Checking (or
  // calling, for a raise) is the lower neighbour of a very small bet; all in is the upper one of an overbet. When the
  // two neighbours are more than 8x apart the blend is a guess: heroEV stays null ('estimate') and the review keeps
  // the Estimate's cost for the size. pts = [{action, size, v}], the check or call anchor at its own size.
  var NEAR_LO = 0.8, NEAR_HI = 1.25, BLEND_SPAN = 8;
  function pseudoHarmonic(a, b, x) { return (b - x) * (1 + a) / ((b - a) * (1 + x)); } // the weight on the lower size a
  function translate(pts, x, allin) {
    var agg = pts.filter(function (p) { return isAgg(p.action); });
    if (!agg.length) return null;
    var pick = function (p) { return { action: p.action, size: Math.round(p.size * 1000) / 1000 }; };
    if (allin) { var ai = agg.filter(function (p) { return p.action === 'allin'; })[0]; if (ai) return { mode: 'near', hero: x, near: pick(ai), v: ai.v }; }
    var near = null, nd = Infinity;
    agg.forEach(function (p) { var d = Math.abs(Math.log(Math.max(1e-6, x) / Math.max(1e-6, p.size))); if (d < nd) { nd = d; near = p; } });
    var out = { mode: 'near', hero: Math.round(x * 1000) / 1000, near: pick(near), v: near.v };
    var r = x / Math.max(1e-6, near.size);
    if (r >= NEAR_LO && r <= NEAR_HI) return out;
    var lo = null, hi = null;
    pts.forEach(function (p) { if (p.size < x && (!lo || p.size > lo.size)) lo = p; if (isAgg(p.action) && p.size > x && (!hi || p.size < hi.size)) hi = p; });
    out.nearV = near.v; delete out.v;
    if (lo) out.lo = pick(lo); if (hi) out.hi = pick(hi);
    if (!lo || !hi || (lo.size > 0 && hi.size / lo.size > BLEND_SPAN) || lo.v == null || hi.v == null) { out.mode = 'estimate'; return out; }
    var w = pseudoHarmonic(lo.size, hi.size, x);
    out.mode = 'blend'; out.wLo = Math.round(w * 1000) / 1000;
    out.v = Math.round((w * lo.v + (1 - w) * hi.v) * 100) / 100;
    return out;
  }

  // build {mix, ev, heroEV, heroMap} from a solved node's actions and the hero row
  // forceAllin: the solver's tree turned the hero's bet into all in (live solves, see ALLIN_AT)
  function answer(actions, freqs, evs, desc, h, heroCom, scaleTo, scaleEV, source, forceAllin) {
    var bb = desc.bb, potNode = desc.pot / bb, heroAct = h.log[desc.n];
    var foldIx = -1; actions.forEach(function (a, i) { if (kindOf(a.kind) === 'fold') foldIx = i; });
    var base = foldIx >= 0 && evs ? evs[foldIx] * scaleEV : 0;
    var mix = [], ev = {}, heroEV = null, heroTo = heroAct.to || 0, pts = [], heroMap = null;
    var hk = (heroAct.allIn || forceAllin) && (heroAct.type === 'bet' || heroAct.type === 'raise') ? 'allin' : heroAct.type;
    actions.forEach(function (a, i) {
      var k = kindOf(a.kind), to = (a.to || 0) * scaleTo, toChips = Math.round(to * bb), frac = (to - heroCom / bb) / Math.max(0.01, potNode);
      var m = { action: k, size: isAgg(k) ? Math.round(1000 * frac) / 1000 : 0, to: isAgg(k) ? toChips : 0, freq: freqs[i] };
      mix.push(m);
      if (evs) {
        var v = Math.round((evs[i] * scaleEV - base) * 100) / 100;
        if (ev[k] == null || v > ev[k]) ev[k] = v;
        if (isAgg(k)) pts.push({ action: k, size: frac, v: v });
        else if (k === 'check' || k === 'call') pts.push({ action: k, size: k === 'check' ? 0 : (desc.toCall || 0) / bb / Math.max(0.01, potNode), v: v });
      }
    });
    if (evs && isAgg(hk)) {
      heroMap = translate(pts, (heroTo - heroCom) / bb / Math.max(0.01, potNode), hk === 'allin');
      if (heroMap && heroMap.v != null) heroEV = heroMap.v;
    }
    var tot = mix.reduce(function (s, m) { return s + m.freq; }, 0) || 1;
    mix.forEach(function (m) { m.freq = Math.round(1000 * m.freq / tot) / 1000; });
    mix = mix.filter(function (m) { return m.freq > 0; }).sort(function (a, b) { return b.freq - a.freq; });
    if (!mix.length) return null;
    var r = { mix: mix, ev: ev, source: source, heroEV: heroEV };
    if (heroMap) r.heroMap = heroMap;
    return r;
  }

  // ---------------------------------------------------------------- live turn / river solves
  function liveSolve(desc, h) {
    if (!live) return Promise.resolve(null);
    var si = streetInfo(h, desc), bb = desc.bb, w = walk(h, desc, si, bb);
    if (w.nRaise > 2) return Promise.resolve(null);
    var heroRange = S.rangeOf(h, desc.heroSeat, si.nStart), villRange = S.rangeOf(h, desc.villainSeats[0], si.nStart);
    var oopR = w.oop ? rangeArr(heroRange, desc.heroCombo) : rangeArr(villRange);
    var ipR = w.oop ? rangeArr(villRange) : rangeArr(heroRange, desc.heroCombo);
    var cur = { bet: sizes([0.33, 0.75], w.bets, w.heroBet), raise: sizes([0.75], w.raises, w.heroRaise), allin: true };
    var later = { bet: [0.75], raise: [0.75], allin: true };
    var tree = { max_raises: Math.max(1, w.nRaise), allin_threshold: ALLIN_AT, allin_spr: 0, donk: w.oopLead };
    // the solver turns a bet or raise of at least ALLIN_AT of the stack left into all in, the hero's own too
    var ha = h.log[desc.n], heroRem = si.eff - w.heroCom, heroAdd = (ha.to || 0) - w.heroCom;
    var forced = !ha.allIn && (ha.type === 'bet' || ha.type === 'raise') && heroRem > 0 && heroAdd >= ALLIN_AT * heroRem - 1e-6;
    if (desc.street === 'river') tree.river = cur; else { tree.turn = cur; tree.river = later; }
    var config = { board: desc.board.map(cardStr).join(''), pot: si.potStart / bb, stack: si.eff / bb, oop_range: oopR, ip_range: ipR, tree: tree };
    var maxMs = desc.street === 'river' ? RIVER_MS : TURN_MS;
    var p = FF.Solver.solveSpot(config, { targetExploit: TARGET, maxMs: maxMs, withEv: true, queries: [w.path] }).then(function (res) {
      if (!res || !res.converged || !res.queries || !res.queries[0] || res.queries[0].error) return null;
      var q = res.queries[0];
      if (q.type !== 'action' || q.player !== (w.oop ? 'oop' : 'ip')) return null;
      var row = Array.prototype.indexOf.call(q.combos, desc.heroCombo); if (row < 0) return null;
      var freqs = q.actions.map(function (a, i) { return q.freq[i][row]; });
      var evs = q.ev ? q.actions.map(function (a, i) { return q.ev[i][row]; }) : null;
      var r = answer(q.actions, freqs, evs, desc, h, w.heroCom, 1, 1, 'Solved', forced);
      if (r) { r.exploit = res.exploit; if (forced) r.forcedAllin = { share: Math.round(1000 * heroAdd / heroRem) / 1000, at: ALLIN_AT }; stats.solved++; }
      return r;
    });
    return withTimeout(p, maxMs + 15000);
  }

  // ---------------------------------------------------------------- flop library
  var index = null, indexAt = 0, indexP = null, fileCache = new Map(), missAt = new Map();
  function getIndex() {
    if (index && Date.now() - indexAt < INDEX_TTL) return Promise.resolve(index);
    if (indexP) return indexP;
    indexP = withTimeout(fetch(LIB_BASE + 'index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('index ' + r.status); return r.json(); }), FETCH_MS)
      .then(function (j) { indexP = null; if (j) { index = j; indexAt = Date.now(); } return index; });
    return indexP;
  }
  function getLib(spotId, name, file) {
    var key = spotId + '/' + name;
    if (fileCache.has(key)) return fileCache.get(key);
    var miss = missAt.get(key); if (miss && Date.now() - miss < MISS_TTL) return Promise.resolve(null);
    var p = withTimeout(fetch(LIB_BASE + (file || 'out/' + key + '.ffl')).then(function (r) {
      if (!r.ok) throw new Error('missing'); return r.arrayBuffer();
    }).then(function (b) { return FF.Library.parse(b); }), FETCH_MS).then(function (lib) {
      if (!lib) { fileCache.delete(key); missAt.set(key, Date.now()); }
      return lib;
    });
    fileCache.set(key, p);
    return p;
  }
  // Candidate library spots for a heads-up flop, nearest depth first after pickSpot.
  // Tranche 2 spots (20/40bb, limped, heads-up, 4-bet pots) only count when index.json lists them;
  // while it does not, every hand falls back exactly as before (tranche 1 spots, or no library answer).
  var SPOT_3BP = { 'BTN>BB': ['3BP100_BBvBTN', '3BP40_BBvBTN'], 'BTN>SB': ['3BP100_SBvBTN', '3BP40_SBvBTN'], 'CO>BTN': ['3BP100_BTNvCO'] };
  var SPOT_4BP = { 'BTN>BB': ['4BP100_BBvBTN'] }; // opener > 3-bettor; the opener 4-bets, the 3-bettor calls
  var SRP_IDS = {
    UTG: ['SRP100_UTGvBB'], HJ: ['SRP100_HJvBB'],
    CO: ['SRP100_COvBB', 'SRP40_COvBB', 'SRP25_COvBB', 'SRP20_COvBB'],
    BTN: ['SRP100_BTNvBB', 'SRP40_BTNvBB', 'SRP25_BTNvBB', 'SRP20_BTNvBB'],
    SB: ['SRP100_SBvBB', 'SRP40_SBvBB', 'SRP25_SBvBB', 'SRP20_SBvBB']
  };
  function libSpotIds(desc, h) {
    var pf = desc.actions.preflop.filter(function (a) { return a.type !== 'fold'; });
    if (pf.some(function (a) { return a.allIn; })) return [];
    var hu = !!(h && h.order && h.order.length === 2);
    var raises = pf.filter(function (a) { return a.type === 'raise' || a.type === 'bet'; });
    if (!raises.length) { // limped: the small blind (heads-up, the button) completes and BB checks
      if (pf.length !== 2 || pf[0].type !== 'call' || pf[1].pos !== 'BB' || pf[1].type !== 'check') return [];
      if (hu && pf[0].pos === 'BTN') return ['LMPHU40_BTNvBB', 'LMPHU25_BTNvBB', 'LMPHU20_BTNvBB'];
      if (!hu && pf[0].pos === 'SB') return ['LMP40_SBvBB', 'LMP25_SBvBB', 'LMP20_SBvBB'];
      return [];
    }
    if (pf[0].type === 'call') return []; // limp-raised pots
    if (raises.length === 1 && pf.length === 2 && pf[1].pos === 'BB') {
      var o = raises[0].pos;
      if (hu) return o === 'BTN' ? ['SRPHU40_BTNvBB', 'SRPHU25_BTNvBB', 'SRPHU20_BTNvBB'] : [];
      return (SRP_IDS[o] || []).slice();
    }
    if (hu) return [];
    if (raises.length === 2 && pf.length === 3 && pf[2].type === 'call' && pf[2].seat === raises[0].seat) {
      return (SPOT_3BP[raises[0].pos + '>' + raises[1].pos] || []).slice();
    }
    if (raises.length === 3 && pf.length === 4 && pf[3].type === 'call' && pf[3].seat === raises[1].seat && raises[2].seat === raises[0].seat) {
      return (SPOT_4BP[raises[0].pos + '>' + raises[1].pos] || []).slice();
    }
    return [];
  }
  // The listed spot whose depth is closest to the effective stack, if it fits the hand. ix = index.json.
  function pickSpot(ix, ids, eff, potBB, heroPos) {
    if (!ix || !ix.spots || !ids.length) return null;
    var all = Array.isArray(ix.spots) ? ix.spots : Object.keys(ix.spots).map(function (k) { var s = ix.spots[k]; if (!s.id) s.id = k; return s; });
    var spots = all.filter(function (s) { return ids.indexOf(s.id) >= 0; });
    var depthOf = function (s) { return s.depth || (s.stack + s.pot / 2); };
    spots.sort(function (a, b) { return Math.abs(Math.log(eff / depthOf(a))) - Math.abs(Math.log(eff / depthOf(b))); });
    var sp = spots[0]; if (!sp) return null;
    var ratio = eff / depthOf(sp); if (ratio < 0.75 || ratio > 1.35) return null;
    if (heroPos !== sp.oop && heroPos !== sp.ip) return null;
    if (potBB / sp.pot < 0.7 || potBB / sp.pot > 1.45) return null;
    return sp;
  }
  // how far an earlier bet or raise on the street may sit from the solved size it is matched to (ratio of the amounts)
  var VILL_LO = 2 / 3, VILL_HI = 1.5;
  function libraryLookup(desc, h) {
    if (!FF.FlopMap || !FF.Library) return Promise.resolve(null);
    var nDealt = h.order.length; if (nDealt < 2) return Promise.resolve(null);
    var ids = libSpotIds(desc, h); if (!ids.length) return Promise.resolve(null);
    var hero = desc.heroSeat, vill = desc.villainSeats[0], bb = desc.bb;
    var eff = Math.min(h.players[hero].stackStart, h.players[vill].stackStart) / bb;
    return getIndex().then(function (ix) {
      if (!ix || !ix.spots || !ids.some(function (id) { return Array.isArray(ix.spots) ? ix.spots.some(function (s) { return s.id === id; }) : !!ix.spots[id]; })) return null;
      var si = streetInfo(h, desc), potBB = si.potStart / bb;
      var sp = pickSpot(ix, ids, eff, potBB, desc.heroPos); if (!sp) return null;
      var side = desc.heroPos === sp.oop ? 'oop' : 'ip';
      var tries = [184, 95, 25].map(function (n) { return FF.FlopMap.lookup(desc.board, n); });
      var seen = {};
      function next(k) {
        if (k >= tries.length) return Promise.resolve(null);
        var m = tries[k]; if (!m || seen[m.name]) return next(k + 1); seen[m.name] = 1;
        var f = sp.flops && sp.flops[m.name];
        return getLib(sp.id, m.name, f && f.file).then(function (lib) { return lib ? { lib: lib, map: m } : next(k + 1); });
      }
      return next(0).then(function (got) {
        if (!got) return null;
        var lib = got.lib, map = got.map, scale = potBB / lib.pot;
        var w = walk(h, desc, si, bb), path = [];
        // follow the street's actions to the hero's node by kind and nearest size
        var acts = desc.thisStreet;
        for (var i = 0; i < acts.length; i++) {
          var node = FF.Library.node(lib, path); if (!node) return null;
          var a = acts[i], want = a.allIn && a.type !== 'call' ? 'allin' : a.type, toLib = (a.to || 0) / bb / scale, bestI = -1, bestD = Infinity;
          node.actions.forEach(function (x, j) {
            var k = x.kind, d;
            if (isAgg(want)) { if (!isAgg(k)) return; d = Math.abs(x.to - toLib) + (k === want ? 0 : 0.5); }
            else { if (k !== want) return; d = 0; }
            if (d < bestD) { bestD = d; bestI = j; }
          });
          if (bestI < 0) return null;
          // an earlier bet or raise far from every solved size: the node would answer a different spot, so the Estimate stands
          var got = node.actions[bestI];
          if (isAgg(want) && !(want === 'allin' && got.kind === 'allin') && got.to > 0) {
            var ratio = toLib / got.to;
            if (ratio < VILL_LO || ratio > VILL_HI) { stats.offTree++; return null; }
          }
          path.push(bestI);
        }
        var hn = FF.Library.node(lib, path); if (!hn || hn.player !== side) return null;
        var mc = FF.FlopMap.mapCombo(map, desc.heroCombo); if (mc < 0) return null;
        var row = FF.Library.combo(lib, path, mc); if (!row || !(row.weight > 0)) return null;
        var r = answer(hn.actions, row.freq, row.ev, desc, h, w.heroCom, scale, scale, 'Library');
        if (r) { r.flop = map.name; r.exact = map.exact; r.spot = sp.id; stats.library++; }
        return r;
      });
    });
  }

  function provider(desc) {
    stats.asked++;
    var h = hands.get(desc.handId);
    if (!h || !h.log[desc.n] || h.log[desc.n].seat !== desc.heroSeat || desc.multiway || desc.villainSeats.length !== 1) { stats.nulls++; return Promise.resolve(null); }
    var p;
    try {
      p = desc.street === 'flop' ? libraryLookup(desc, h) : (desc.street === 'turn' || desc.street === 'river') ? liveSolve(desc, h) : Promise.resolve(null);
    } catch (e) { stats.errors++; stats.lastError = String(e && e.message || e); return Promise.resolve(null); }
    return Promise.resolve(p).then(function (r) { if (!r) stats.nulls++; return r; }, function (e) { stats.errors++; stats.lastError = String(e && e.message || e); return null; });
  }

  FF.SolverProvider = {
    install: function () { if (S && S.setSolverProvider) S.setSolverProvider(provider); },
    remember: remember, provider: provider, stats: stats,
    liveEnabled: function () { return live; }, setLive: function (on) { live = !!on && !!FF.Solver; },
    libSpotIds: libSpotIds, pickSpot: pickSpot,
    _test: { sizes: sizes, walk: walk, answer: answer, translate: translate, pseudoHarmonic: pseudoHarmonic }
  };
})(typeof self !== 'undefined' ? self : this);
