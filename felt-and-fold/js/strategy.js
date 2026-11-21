/* Felt & Fold: the baseline strategy ("Estimate").
   Range tracking (Bayes narrowing on the baseline's own action probabilities), a per-combo postflop model
   (equity percentile, texture, range and nut advantage, draws, blockers, pot odds, MDF, bluff ratios),
   chart-based preflop EVs, ICM risk premium, and a hook for a solver.
   UMD: window.FF.Strategy in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./ranges.js'), require('./tournament.js'));
  else { root.FF = root.FF || {}; root.FF.Strategy = factory(root.FF.Cards, root.FF.Engine, root.FF.Ranges, root.FF.Tournament); }
})(typeof self !== 'undefined' ? self : this, function (C, E, R, T) {
  'use strict';
  var NC = C.NC, C1 = C.C1, C2 = C.C2, STREETS = ['preflop', 'flop', 'turn', 'river'];
  var QUALITY = { fast: { flop: 10, turn: 8, name: 'fast' }, normal: { flop: 48, turn: 44, name: 'normal' }, review: { flop: 120, turn: 44, name: 'review' } };
  var Q = QUALITY.normal;
  function setQuality(q) { Q = typeof q === 'string' ? (QUALITY[q] || QUALITY.normal) : q; }
  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rd(x, n) { var k = Math.pow(10, n == null ? 2 : n); return Math.round(x * k) / k; }

  // ---------------------------------------------------------------- equity of every combo vs a range, cached
  var eqCache = new Map(), liveCache = new Map();
  function hashW(w) {
    var h = 2166136261;
    for (var i = 0; i < NC; i++) { if (!(w[i] > 0)) continue; var v = Math.round(w[i] * 4096) + 1; h = Math.imul(h ^ i, 16777619); h = Math.imul(h ^ v, 16777619); }
    return h >>> 0;
  }
  function liveFor(board) {
    var k = board.join(','), w = liveCache.get(k);
    if (!w) { w = C.removeDead(new Float64Array(NC).fill(1), board); if (liveCache.size > 64) liveCache.clear(); liveCache.set(k, w); }
    return w;
  }
  function total(w) { var s = 0; for (var i = 0; i < NC; i++) s += w[i]; return s; }
  function eqVs(oppW, board) {
    if (total(oppW) < 1e-6) oppW = liveFor(board);
    var key = board.join(',') + '|' + hashW(oppW) + '|' + Q.name, hit = eqCache.get(key);
    if (hit) return hit;
    var live = liveFor(board), out;
    if (board.length === 4 && Q.turn < 44) { // sample rivers
      var r = C.rng(C.hashSeed(board[0], board[1], board[2], board[3])), rest = [], sum = new Float64Array(NC), cnt = new Float64Array(NC);
      for (var c = 0; c < 52; c++) if (board.indexOf(c) < 0) rest.push(c);
      C.shuffle(rest, r);
      for (var k = 0; k < Q.turn; k++) {
        var e = C.rangeVsRange(live, oppW, board.concat([rest[k]]));
        for (var i = 0; i < NC; i++) if (e[i] === e[i]) { sum[i] += e[i]; cnt[i]++; }
      }
      out = new Float64Array(NC); for (i = 0; i < NC; i++) out[i] = cnt[i] ? sum[i] / cnt[i] : NaN;
    } else out = C.rangeVsRange(live, oppW, board, { runouts: Q.flop, seed: C.hashSeed(board[0], board[1], board[2], 7) });
    if (eqCache.size > 300) eqCache.clear();
    eqCache.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------- board and hand features
  function rankMask(cards) { var m = 0; cards.forEach(function (c) { var r = c >> 2; m |= 1 << (r + 1); if (r === 12) m |= 1; }); return m; }
  function hasStraight(m) { for (var lo = 0; lo <= 9; lo++) if (((m >> lo) & 31) === 31) return true; return false; }
  function texture(board) {
    var rs = board.map(C.rankOf).sort(function (a, b) { return b - a; }), sc = [0, 0, 0, 0], cnt = {}, paired = false, trips = false;
    board.forEach(function (c) { sc[c & 3]++; });
    rs.forEach(function (r) { cnt[r] = (cnt[r] || 0) + 1; if (cnt[r] === 2) paired = true; if (cnt[r] === 3) trips = true; });
    var maxS = Math.max.apply(null, sc), m = rankMask(board), maxWin = 0, w3 = 0;
    for (var lo = 0; lo <= 9; lo++) { var b = (m >> lo) & 31, n = 0; while (b) { n += b & 1; b >>= 1; } if (n > maxWin) maxWin = n; if (n >= 3) w3++; }
    var wet = 0;
    if (maxS >= 3) wet += 0.45; else if (maxS === 2 && board.length < 5) wet += 0.25;
    if (maxWin >= 3) wet += 0.3 + 0.05 * Math.min(3, w3 - 1); else if (maxWin === 2) wet += 0.12;
    if (paired) wet -= 0.1;
    wet = clamp(wet, 0, 1);
    var suitWord = board.length === 3 ? (maxS === 3 ? 'monotone' : maxS === 2 ? 'two-tone' : 'rainbow') : maxS >= 3 ? 'flush possible' : maxS === 2 && board.length === 4 ? 'two flush draws possible' : 'no flush';
    if (board.length === 4 && maxS === 2) { var twoSuits = sc.filter(function (x) { return x === 2; }).length; suitWord = twoSuits === 2 ? 'two flush draws' : 'flush draw'; }
    if (board.length === 5 && maxS < 3) suitWord = 'no flush';
    return { paired: paired, trips: trips, monotone: maxS >= 3 && board.length === 3, flushPossible: maxS >= 3, twoTone: maxS === 2, rainbow: maxS <= 1,
      connected: maxWin >= 3, maxWin: maxWin, high: rs[0], wet: rd(wet), dry: wet < 0.3, label: wet < 0.3 ? 'dry' : wet > 0.55 ? 'wet' : 'medium',
      ranks: rs.map(function (r) { return C.RANKS[r]; }).join('-'), suits: suitWord };
  }
  // flush and straight draws (flop and turn only)
  function draws(a, b, board) {
    var o = { flush: false, nutFlush: false, oesd: false, gut: false, backdoor: false, outs: 0, label: '' };
    if (board.length < 3 || board.length > 4) return o;
    var all = board.concat([a, b]), cat = C.category(C.evalCards(all));
    if (cat < 5) {
      for (var s = 0; s < 4; s++) {
        var n = 0, mine = 0, hiMine = -1; all.forEach(function (c) { if ((c & 3) === s) n++; });
        [a, b].forEach(function (c) { if ((c & 3) === s) { mine++; if ((c >> 2) > hiMine) hiMine = c >> 2; } });
        if (n === 4 && mine) { o.flush = true; o.nutFlush = hiMine === 12 || (hiMine === 11 && board.some(function (c) { return c === 48 + s; })); }
        if (n === 3 && mine === 2 && board.length === 3) o.backdoor = true;
      }
    }
    var sOuts = 0;
    if (cat < 4) {
      var m = rankMask(all), bm = rankMask(board), hits = 0;
      for (var r = 0; r < 13; r++) {
        var bit = 1 << (r + 1); if (m & bit) continue;
        var m2 = m | bit | (r === 12 ? 1 : 0), b2 = bm | bit | (r === 12 ? 1 : 0);
        if (hasStraight(m2) && !hasStraight(b2)) hits++;
      }
      if (hits >= 2) { o.oesd = true; sOuts = 8; } else if (hits === 1) { o.gut = true; sOuts = 4; }
    }
    o.outs = (o.flush ? 9 : 0) + sOuts - (o.flush && sOuts ? 2 : 0);
    o.label = o.flush && sOuts ? (o.nutFlush ? 'nut flush draw plus a straight draw' : 'flush draw plus a straight draw') : o.flush ? (o.nutFlush ? 'nut flush draw' : 'flush draw') :
      o.oesd ? 'open-ended straight draw' : o.gut ? 'gutshot' : o.backdoor ? 'backdoor flush draw' : '';
    return o;
  }
  // a plain name for what a holding makes on this board
  function describe(a, b, board) {
    if (!board.length) return { kind: 'preflop', label: C.CLASS_NAME[C.classOfCards(a, b)], cat: -1 };
    var sc = C.evalCards(board.concat([a, b])), cat = C.category(sc), bsc = C.evalCards(board), bcat = C.category(bsc);
    var br = board.map(C.rankOf).sort(function (x, y) { return y - x; }), ub = br.filter(function (r, i) { return br.indexOf(r) === i; });
    var ra = a >> 2, rb = b >> 2, hi = Math.max(ra, rb), lo = Math.min(ra, rb);
    var catWord = ['', '', 'two pair', 'trips', 'a straight', 'a flush', 'a full house', 'quads', 'a straight flush'];
    if (cat >= 4) {
      if (board.length === 5 && sc === bsc) return { kind: 'board', label: 'the board (' + catWord[cat] + ')', cat: cat };
      return { kind: 'monster', label: catWord[cat], cat: cat };
    }
    if (cat === 3) {
      if (ra === rb && ub.indexOf(ra) >= 0) return { kind: 'set', label: 'a set of ' + C.RANK_PLURAL[ra].toLowerCase(), cat: cat };
      if (bcat === 3) return { kind: 'board', label: 'trips on the board', cat: cat };
      return { kind: 'trips', label: 'trip ' + C.RANK_PLURAL[ub.indexOf(ra) >= 0 && br.filter(function (r) { return r === ra; }).length === 2 ? ra : rb].toLowerCase(), cat: cat };
    }
    var aOn = ub.indexOf(ra) >= 0, bOn = ub.indexOf(rb) >= 0;
    if (cat === 2 && aOn && bOn && ra !== rb && bcat === 0) return { kind: 'twopair', label: 'two pair', cat: cat };
    if (cat === 2 && bcat === 1 && !aOn && !bOn && ra !== rb) cat = 1; // the board pair plus nothing
    // one pair of our own (or a pocket pair)
    if (ra === rb && !aOn) {
      if (ra > ub[0]) return { kind: 'overpair', label: 'an overpair (' + C.RANK_PLURAL[ra].toLowerCase() + ')', cat: 1 };
      return { kind: 'underpair', label: 'a pocket pair below the top card (' + C.RANK_PLURAL[ra].toLowerCase() + ')', cat: 1 };
    }
    var pr = aOn ? ra : bOn ? rb : -1, kick = pr === ra ? rb : ra;
    if (pr >= 0) {
      var ix = ub.indexOf(pr), name = ix === 0 ? 'top pair' : ix === 1 ? 'second pair' : 'a weak pair';
      var kw = kick >= 11 || (kick === 10 && pr >= 11) ? ', good kicker' : kick <= 6 ? ', weak kicker' : '';
      return { kind: ix === 0 ? 'toppair' : ix === 1 ? 'midpair' : 'lowpair', label: name + (ix === 0 ? kw : ''), cat: cat };
    }
    if (bcat >= 1) return { kind: 'air', label: hi === 12 ? 'ace high' : 'no pair of its own', cat: 0 };
    if (hi > ub[0] && lo > ub[0]) return { kind: 'air', label: 'two overcards', cat: 0 };
    return { kind: 'air', label: hi === 12 ? 'ace high' : hi === 11 ? 'king high' : 'no pair', cat: 0 };
  }
  // strong made hands (two pair with both cards, sets, anything better): used for nut advantage
  function strongMask(board) {
    var st = C.boardState(board), bcat = C.category(C.evalCards(board)), out = new Uint8Array(NC), dead = new Uint8Array(52);
    board.forEach(function (c) { dead[c] = 1; });
    for (var i = 0; i < NC; i++) {
      if (dead[C1[i]] || dead[C2[i]]) continue;
      var cat = C.category(C.evalWith(st, C1[i], C2[i]));
      if (cat > bcat && (cat >= 3 || (cat === 2 && bcat === 0))) out[i] = 1;
    }
    return out;
  }
  function fracOf(w, mask) { var s = 0, t = 0; for (var i = 0; i < NC; i++) { if (!(w[i] > 0)) continue; t += w[i]; if (mask[i]) s += w[i]; } return t > 0 ? s / t : 0; }

  // ---------------------------------------------------------------- node context
  // spec: { street, board, pot, toCall, currentBet, committed, stack, eff, bb, W (actor range), opps: [W], ip, aggressor, checkedTo,
  //         facing: 'none'|'bet'|'raise', canRaise, minTo, maxTo, icmRP, nRaises }
  var ctxCache = new Map();
  function node(spec) {
    var key = spec.key;
    if (key && ctxCache.has(key)) return ctxCache.get(key);
    var board = spec.board, nOpp = spec.opps.length;
    var eqs = spec.opps.map(function (W) { return eqVs(W, board); });
    var eq = new Float64Array(NC), eqN = new Float64Array(NC);
    for (var i = 0; i < NC; i++) {
      var p = 1; for (var j = 0; j < nOpp; j++) p *= eqs[j][i];
      eq[i] = p; eqN[i] = nOpp > 1 ? Math.pow(p, 1 / nOpp) : p;
    }
    var W = spec.W, list = [], tw = 0, mean = 0;
    for (i = 0; i < NC; i++) if (W[i] > 0 && eqN[i] === eqN[i]) { list.push(i); tw += W[i]; mean += W[i] * eqN[i]; }
    list.sort(function (x, y) { return eqN[x] - eqN[y]; });
    var pct = new Float64Array(NC).fill(NaN), acc = 0;
    for (var k = 0; k < list.length; k++) { var x = list[k]; pct[x] = (acc + W[x] / 2) / tw; acc += W[x]; }
    // combos outside the range (an off-model hero hand): place them by equity
    var sm = strongMask(board), oppStrong = 0;
    spec.opps.forEach(function (Wo) { oppStrong = Math.max(oppStrong, fracOf(Wo, sm)); });
    var ctx = { spec: spec, street: spec.street, board: board, eqs: eqs, eq: eq, eqN: eqN, pct: pct, list: list, tw: tw,
      rangeAdv: tw > 0 ? mean / tw - 0.5 : 0, strongMine: fracOf(W, sm), strongOpp: oppStrong, tex: texture(board), nOpp: nOpp,
      spr: spec.pot > 0 ? spec.eff / spec.pot : 99, drawCache: {}, pol: {} };
    ctx.nutAdv = ctx.strongMine - ctx.strongOpp;
    if (key) { if (ctxCache.size > 200) ctxCache.clear(); ctxCache.set(key, ctx); }
    return ctx;
  }
  function pctOf(ctx, i) {
    if (ctx.pct[i] === ctx.pct[i]) return ctx.pct[i];
    var e = ctx.eqN[i], below = 0, W = ctx.spec.W; ctx.list.forEach(function (x) { if (ctx.eqN[x] < e) below += W[x]; });
    return ctx.tw > 0 ? below / ctx.tw : 0.5;
  }
  function drawOf(ctx, i) { var d = ctx.drawCache[i]; if (!d) d = ctx.drawCache[i] = draws(C1[i], C2[i], ctx.board); return d; }

  // ---------------------------------------------------------------- the policy for a whole range
  var BASE = { valueShift: 0, bluffMult: 1, callShift: 0, raiseShift: 0, semiMult: 1, donkMult: 1, mdfPull: 0.35, riverBluffMult: 1, riverBigFold: 0,
    cbetBluffMult: 1, thinValue: 0 };
  function adjKey(adj) { var s = ''; for (var k in BASE) s += (adj[k] == null ? BASE[k] : adj[k]) + ','; return s; }
  function A(adj, k) { return adj && adj[k] != null ? adj[k] : BASE[k]; }
  var STREET_BLUFF = { flop: 1.8, turn: 1.4, river: 1 };

  function realise(ctx, i) {
    var sp = ctx.spec;
    if (ctx.street === 'river') return 1;
    var r = sp.ip ? 0.97 : 0.87, e = ctx.eqN[i];
    if (e > 0.75) r += 0.05; else if (e < 0.35 && !(drawOf(ctx, i).outs >= 8)) r -= 0.12;
    if (ctx.nOpp > 1) r -= 0.05;
    return r;
  }
  function implied(ctx, i) {
    if (ctx.street === 'river' || ctx.spr < 1.5) return 0;
    var d = drawOf(ctx, i); return d.outs >= 8 ? 0.035 : d.outs >= 4 ? 0.015 : 0;
  }
  function chooseSize(ctx) {
    var sp = ctx.spec, tex = ctx.tex, s;
    if (ctx.street === 'flop') s = ctx.nOpp > 1 ? 0.5 : (tex.wet < 0.35 && ctx.rangeAdv > 0.0 && ctx.nutAdv > -0.04) ? 0.33 : (tex.wet > 0.55 || ctx.nutAdv > 0.06) ? 0.75 : 0.5;
    else if (ctx.street === 'turn') s = ctx.nutAdv > 0.08 || tex.wet > 0.5 ? 0.75 : 0.5;
    else s = ctx.nutAdv > 0.12 ? 1.25 : ctx.nutAdv > 0.04 || tex.wet > 0.5 ? 0.75 : 0.5;
    if (sp.leadInto) s = Math.min(s, 0.5); // a lead
    var amt = Math.round(s * sp.pot), jam = false;
    if (amt >= 0.6 * sp.eff || ctx.spr < 1.1) { amt = sp.eff; jam = true; }
    amt = Math.max(amt, Math.min(sp.minTo || sp.bb, sp.eff));
    return { size: jam ? rd(amt / sp.pot) : s, amount: amt, jam: jam };
  }
  // the policy at this node for every combo (cached per adjustment set)
  function policy(ctx, adj) {
    var key = adj ? adjKey(adj) : 'base';
    if (ctx.pol[key]) return ctx.pol[key];
    var out = ctx.spec.toCall > 0 ? facingPolicy(ctx, adj) : openPolicy(ctx, adj);
    ctx.pol[key] = out; return out;
  }
  // at = { amount, jam } replays the policy at a size someone actually bet (range narrowing); otherwise the model picks the size
  function openPolicy(ctx, adj, at) {
    var sp = ctx.spec, sz = at ? { size: rd(at.amount / sp.pot), amount: at.amount, jam: !!at.jam } : chooseSize(ctx), s = sz.amount / sp.pot, mdf = 1 / (1 + s), W = sp.W, street = ctx.street;
    var eqV = 1 - mdf / 2 - (street === 'turn' ? 0.04 : street === 'flop' ? 0.07 : 0) + A(adj, 'valueShift') - A(adj, 'thinValue');
    if (ctx.nOpp > 1) eqV += 0.05;
    if (sp.checkedTo) eqV -= 0.03; // checked to us: thinner value, more stabs
    if (ctx.spr < 1.5) eqV -= 0.05;
    if (sp.icmRP) eqV += sp.icmRP * 0.5 * Math.min(1, sz.amount / Math.max(1, sp.stack) * 2);
    var bf = Math.min(0.45, s / (1 + 2 * s) * STREET_BLUFF[street]);
    var bm = A(adj, 'bluffMult') * (street === 'river' ? A(adj, 'riverBluffMult') : 1) * (sp.aggressor && street === 'flop' ? A(adj, 'cbetBluffMult') : 1);
    if (ctx.nOpp > 1) bm *= 0.4;
    if (sp.checkedTo) bm *= 1.15;
    var lead = sp.leadInto && !sp.ip ? 0.2 * A(adj, 'donkMult') : 1;
    var pv = new Float64Array(NC), pb = new Float64Array(NC), valueW = 0;
    for (var k = 0; k < ctx.list.length; k++) { var i = ctx.list[k]; pv[i] = sig((ctx.eqN[i] - eqV) / 0.025); valueW += W[i] * pv[i]; }
    // bluffs: fill the bluff share with the best candidates below the checking region
    var need = valueW * bf / (1 - bf) * bm, cand = [];
    var hiCut = eqV - 0.12, block = street === 'river' ? blockerScores(ctx) : null;
    for (k = 0; k < ctx.list.length; k++) {
      i = ctx.list[k]; if (ctx.eqN[i] >= hiCut) continue;
      var d = street === 'river' ? null : drawOf(ctx, i), score;
      if (street === 'river') score = (ctx.eqN[i] < 0.3 ? 0.6 : 0.1) + block[i] * 1.5 - ctx.eqN[i] * 0.4;
      else score = d.outs / 9 + (d.backdoor ? 0.25 : 0) + (ctx.eqN[i] > 0.25 && ctx.eqN[i] < hiCut ? 0.15 : 0) + ctx.eqN[i] * 0.3;
      cand.push([i, score]);
    }
    cand.sort(function (x, y) { return y[1] - x[1]; });
    for (k = 0; k < cand.length && need > 1e-9; k++) {
      i = cand[k][0]; var room = 1 - pv[i], take = Math.min(room * 0.92, need / W[i]);
      pb[i] = take; need -= take * W[i];
    }
    var bet = new Float64Array(NC), betW = 0, bluffW = 0;
    for (k = 0; k < ctx.list.length; k++) { i = ctx.list[k]; bet[i] = clamp((pv[i] + pb[i]) * lead, 0, 1); betW += W[i] * bet[i]; bluffW += W[i] * pb[i] * lead; }
    return { kind: 'open', size: sz.size, amount: sz.amount, jam: sz.jam, bet: bet, pv: pv, pb: pb, eqV: eqV, bf: bf, lead: lead,
      betFreq: ctx.tw ? betW / ctx.tw : 0, bluffShare: betW ? bluffW / betW : 0, mdf: mdf, hiCut: hiCut };
  }
  // how much each combo blocks the opponent's strong river hands (0..1)
  function blockerScores(ctx) {
    if (ctx.block) return ctx.block;
    var board = ctx.board, st = C.boardState(board), Wo = ctx.spec.opps[0], sc = [], tw = 0, card = new Float64Array(52);
    for (var i = 0; i < NC; i++) if (Wo[i] > 0) { sc.push([i, C.evalWith(st, C1[i], C2[i])]); tw += Wo[i]; }
    sc.sort(function (a, b) { return b[1] - a[1]; });
    var acc = 0, strongW = 0;
    for (var k = 0; k < sc.length && acc < tw * 0.3; k++) { var x = sc[k][0]; acc += Wo[x]; card[C1[x]] += Wo[x]; card[C2[x]] += Wo[x]; strongW += Wo[x]; }
    var out = new Float64Array(NC);
    for (i = 0; i < NC; i++) out[i] = strongW > 0 ? Math.min(1, (card[C1[i]] + card[C2[i]]) / strongW * 1.6) : 0;
    ctx.block = out; return out;
  }
  // a raise sized off the pot after calling, so a tiny bet gets a real raise and not a min-click: about 3.7x a third-pot
  // bet, 3.2x a half-pot bet, 2.6x a pot bet. A re-raise stays near 2.6x the raise.
  var RAISE_POT = 0.55;
  function raiseTo(ctx) {
    var sp = ctx.spec, potCalled = sp.pot + sp.toCall, jam = false;
    var to = Math.round(sp.nRaises >= 2 ? sp.currentBet * 2.6 + (sp.pot - sp.toCall - sp.currentBet) * 0.25 : sp.currentBet + RAISE_POT * potCalled);
    var maxTo = sp.maxTo || (sp.committed + sp.stack);
    if (to >= 0.6 * Math.min(maxTo, sp.eff + sp.committed) || ctx.spr < 1.6) { to = Math.min(maxTo, sp.eff + sp.committed); jam = true; }
    to = clamp(to, sp.minTo || to, maxTo);
    if (to >= maxTo) jam = true;
    return { to: to, jam: jam };
  }
  // the value line for raising: a raise that gives the bettor a price s_r needs about the share of their continuing range
  // that a bet of s_r gets called by, so the cut moves with the raise's MDF (as the open policy's value cut does with
  // its bet). Against a small bet the bettor's range is wide and merged and its calls are cheap, so more of our range
  // raises; against an overbet the polarised range leaves only the near-nuts. The street and facing-a-raise terms are as
  // before, centred on a half-pot bet.
  function raiseLine(ctx, adj, s, sr) {
    var sp = ctx.spec, street = ctx.street;
    var e = (street === 'river' ? 0.86 : 0.8) + (sp.facing === 'raise' ? 0.08 : 0) + A(adj, 'raiseShift');
    if (ctx.nOpp > 1) e += 0.04;
    e += 0.3 * (1 / (1 + RAISE_POT) - 1 / (1 + Math.min(1.5, sr))); // the raise's own size: a min-raise is a merged raise, a jam a polar one
    var lg = clamp(Math.log(Math.max(0.05, s) / 0.5), -1.7, 1.4);
    e += (lg < 0 ? (street === 'river' ? 0.17 : 0.1) : 0.09) * lg * (sp.facing === 'raise' ? 0.5 : 1); // the bet we face: a small bet is raised much wider
    return e;
  }
  function facingPolicy(ctx, adj, rto) {
    var sp = ctx.spec, W = sp.W, street = ctx.street, callAmt = Math.min(sp.toCall, sp.stack);
    // facing a bet bigger than our stack, the part we cannot match goes back to the bettor: it is not in the pot we play for
    var need = callAmt / (sp.pot - (sp.toCall - callAmt) + callAmt), s = sp.toCall / Math.max(1, sp.pot - sp.toCall), mdf = (sp.pot - sp.toCall) / sp.pot;
    var shift = A(adj, 'callShift') + (street === 'river' && s >= 0.7 ? A(adj, 'riverBigFold') : 0);
    var rp = sp.icmRP ? sp.icmRP * Math.min(1, callAmt / Math.max(1, sp.stack) * 2) : 0;
    var needAdj = need + shift + rp, eqR = new Float64Array(NC), c = new Float64Array(NC), D = 0, D0 = 0, base = need + rp;
    for (var k = 0; k < ctx.list.length; k++) { var i = ctx.list[k]; eqR[i] = ctx.eq[i] * realise(ctx, i) + implied(ctx, i); D0 += W[i] * sig((eqR[i] - base) / 0.02); }
    D0 = ctx.tw ? D0 / ctx.tw : 0;
    // threshold that keeps the top `share` of the range
    function thrAt(share) { var acc = 0; for (var q = ctx.list.length - 1; q >= 0; q--) { var j = ctx.list[q]; acc += W[j]; if (acc / ctx.tw >= share) return eqR[j]; } return 0; }
    // the baseline defends close to MDF at every size: pot odds against the bettor's (size-narrowed) range alone leave it
    // over-folding small bets on wet boards and over-calling big polar river bets. Skilled tiers take most of the gap;
    // tiers with no MDF sense (Beginner, Calling Station) keep the raw pot-odds line. Style and tier shifts go on top.
    var pull = A(adj, 'mdfPull'), P = 0.85 * clamp(pull / 0.2, 0, 1), thr0 = base;
    if (P > 0 && ctx.nOpp === 1 && !sp.icmRP && ctx.tw > 0) {
      var t0 = thrAt(clamp(D0 + P * (mdf - D0), 0.02, 0.98));
      thr0 = D0 > mdf ? Math.max(base, t0) : Math.min(base, t0);
    }
    var thr = thr0 + shift;
    for (k = 0; k < ctx.list.length; k++) { i = ctx.list[k]; c[i] = sig((eqR[i] - thr) / 0.02); D += W[i] * c[i]; }
    D = ctx.tw ? D / ctx.tw : 0;
    if (pull > 0 && ctx.nOpp === 1 && D < mdf - 0.05 && !sp.icmRP) { // a tight style still gets pulled part way back up
      thr = Math.min(thr, thrAt(D + pull * (mdf - D)));
      D = 0; for (k = 0; k < ctx.list.length; k++) { i = ctx.list[k]; c[i] = sig((eqR[i] - thr) / 0.02); D += W[i] * c[i]; }
      D = ctx.tw ? D / ctx.tw : 0;
    }
    var rz = sp.canRaise ? (rto ? { to: rto, jam: rto >= (sp.maxTo || rto) } : raiseTo(ctx)) : null;
    var sr = rz ? (rz.to - sp.currentBet) / Math.max(1, sp.pot + sp.toCall) : 0.55, eqRaise = raiseLine(ctx, adj, s, sr);
    // bluff-raises (semi-bluffs on the flop and turn) grow as the bet shrinks: a small bet folds more to a raise
    var semiK = s < 0.5 ? Math.min(1.8, Math.sqrt(0.5 / Math.max(0.1, s))) : s > 0.75 ? Math.max(0.6, Math.sqrt(0.75 / s)) : 1;
    var fold = new Float64Array(NC), call = new Float64Array(NC), raise = new Float64Array(NC), RW = 0;
    for (k = 0; k < ctx.list.length; k++) {
      i = ctx.list[k]; var r = 0;
      if (rz) {
        r = sig((ctx.eqN[i] - eqRaise) / 0.02) * 0.85;
        if (street !== 'river' && sp.facing !== 'raise' && ctx.nOpp === 1) {
          var d = drawOf(ctx, i);
          if (d.outs >= 8 && ctx.eqN[i] > 0.25 && ctx.eqN[i] < 0.62) r = Math.max(r, Math.min(0.85, (d.outs >= 12 ? 0.5 : 0.28) * A(adj, 'semiMult') * semiK));
        }
      }
      var cc = Math.max(c[i], r);
      raise[i] = r; call[i] = Math.max(0, cc - r); fold[i] = 1 - raise[i] - call[i]; RW += W[i] * r;
    }
    return { kind: 'facing', need: need, needAdj: needAdj, thr: thr, s: s, mdf: mdf, defend: D, eqR: eqR, fold: fold, call: call, raise: raise,
      raiseTo: rz ? rz.to : 0, raiseJam: rz ? rz.jam : false, eqRaise: eqRaise, raiseFreq: ctx.tw ? RW / ctx.tw : 0, rp: rp, callAmt: callAmt };
  }

  // the baseline's policy replayed at the size actually bet or raised to (street total `to`), so a read follows the size:
  // a big bet narrows to strong hands plus bluffs, a small one to a wide, merged range. Sizes are bucketed (about 6%)
  // so a hand's reads share a few cached policies.
  function policyAt(ctx, to) {
    var sp = ctx.spec;
    if (!(to > 0) || !sp.canRaise) return policy(ctx);
    var maxTo = sp.maxTo || (sp.committed + sp.stack), jam = to >= maxTo;
    if (sp.toCall > 0) {
      var q = jam ? 'J' : Math.round(Math.log(Math.max(1, to - sp.currentBet) / Math.max(1, sp.pot + sp.toCall)) / 0.06), key = 'raiseAt' + q;
      if (!ctx.pol[key]) ctx.pol[key] = facingPolicy(ctx, null, jam ? maxTo : Math.round(sp.currentBet + Math.exp(q * 0.06) * (sp.pot + sp.toCall)));
      return ctx.pol[key];
    }
    var amt = to - sp.committed, qb = jam ? 'J' : Math.round(Math.log(Math.max(1, amt) / Math.max(1, sp.pot)) / 0.06), kb = 'betAt' + qb;
    if (!ctx.pol[kb]) ctx.pol[kb] = openPolicy(ctx, null, { amount: jam ? maxTo - sp.committed : Math.round(Math.exp(qb * 0.06) * sp.pot), jam: jam });
    return ctx.pol[kb];
  }
  // probability the baseline takes engine action `type` with combo i at this node (for narrowing); `to` = the street
  // total of a bet or raise, to read it at its own size
  function actionProb(ctx, i, type, to) {
    var p = (type === 'bet' || type === 'raise') && to ? policyAt(ctx, to) : policy(ctx);
    if (p.kind === 'open') { var b = p.bet[i] || 0; return type === 'check' ? 1 - b : type === 'fold' ? 0.02 : b; }
    if (type === 'fold') return p.fold[i]; if (type === 'call' || type === 'check') return p.call[i] + (ctx.spec.canRaise ? 0 : p.raise[i]);
    return p.raise[i];
  }

  // ---------------------------------------------------------------- combo strategy: mix, features, factors
  function comboMix(ctx, i, adj) {
    var sp = ctx.spec, p = policy(ctx, adj), mix = [];
    if (p.kind === 'open') {
      var b = p.bet[i] || 0;
      if (b > 0.005) mix.push({ action: p.jam ? 'allin' : 'bet', size: p.size, to: sp.committed + p.amount, freq: b });
      mix.push({ action: 'check', size: 0, to: 0, freq: 1 - b });
    } else {
      if (p.raise[i] > 0.005) mix.push({ action: p.raiseJam ? 'allin' : 'raise', size: rd(p.raiseTo / Math.max(1, sp.currentBet), 1), to: p.raiseTo, freq: p.raise[i] });
      if (p.call[i] > 0.005) mix.push({ action: 'call', size: 0, to: 0, freq: p.call[i] });
      if (p.fold[i] > 0.005) mix.push({ action: 'fold', size: 0, to: 0, freq: p.fold[i] });
    }
    var t = 0; mix.forEach(function (m) { t += m.freq; }); mix.forEach(function (m) { m.freq = rd(m.freq / t, 3); });
    mix.sort(function (x, y) { return y.freq - x.freq; });
    return { mix: mix, pol: p };
  }
  function features(ctx, i) {
    var sp = ctx.spec, p = policy(ctx), a = C1[i], b = C2[i];
    var f = { eq: ctx.eq[i], eqN: ctx.eqN[i], pct: pctOf(ctx, i), R: realise(ctx, i), draw: drawOf(ctx, i), hand: describe(a, b, ctx.board),
      blocker: ctx.street === 'river' ? blockerScores(ctx)[i] : 0 };
    if (p.kind === 'facing') { f.need = p.need; f.needAdj = p.needAdj; f.eqR = ctx.eq[i] * f.R + implied(ctx, i); }
    return f;
  }
  function factorsFor(ctx, i) {
    var sp = ctx.spec, p = policy(ctx), f = features(ctx, i), out = [], bbv = sp.bb;
    out.push({ kind: 'hand', label: f.hand.label, eq: rd(f.eq, 3) });
    out.push({ kind: 'rangePct', pct: rd(1 - f.pct, 3) }); // share of the range that is stronger
    out.push({ kind: 'texture', label: ctx.tex.label, wet: ctx.tex.wet, desc: ctx.tex.ranks + ' ' + ctx.tex.suits, paired: ctx.tex.paired, monotone: ctx.tex.monotone, connected: ctx.tex.connected });
    out.push({ kind: 'rangeAdv', value: rd(ctx.rangeAdv, 3) });
    out.push({ kind: 'nutAdv', value: rd(ctx.nutAdv, 3), mine: rd(ctx.strongMine, 3), theirs: rd(ctx.strongOpp, 3) });
    out.push({ kind: 'spr', spr: rd(ctx.spr, 1) });
    if (f.draw.outs || f.draw.backdoor) out.push({ kind: 'draw', label: f.draw.label, outs: f.draw.outs });
    if (ctx.street === 'river' && f.blocker > 0.25) out.push({ kind: 'blocker', score: rd(f.blocker, 2) });
    if (p.kind === 'facing') {
      out.push({ kind: 'potOdds', need: rd(p.need, 3), have: rd(f.eqR, 3), toCall: rd(p.callAmt / bbv, 1), pot: rd(sp.pot / bbv, 1), raw: rd(f.eq, 3), R: rd(f.R, 3), imp: rd(implied(ctx, i), 3) });
      out.push({ kind: 'mdf', mdf: rd(p.mdf, 3), defend: rd(p.defend, 3), size: rd(p.s, 2) });
    } else {
      out.push({ kind: 'betSize', size: p.size, amount: rd(p.amount / bbv, 1), jam: p.jam });
      out.push({ kind: 'bluffRatio', ratio: rd(p.bf, 3), share: rd(p.bluffShare, 3), betFreq: rd(p.betFreq, 3), valueCut: rd(p.eqV, 3) });
      if (sp.leadInto && !sp.ip) out.push({ kind: 'lead', note: 'out of position against the last aggressor' });
    }
    if (ctx.nOpp > 1) out.push({ kind: 'multiway', players: ctx.nOpp + 1 });
    if (sp.icmRP) out.push({ kind: 'icm', premium: rd(sp.icmRP, 3) });
    return out;
  }

  // ---------------------------------------------------------------- EVs (bb, fold = 0)
  function oppResponse(ctx, actorRangeAfter, amount, oppCommitted, potAfter) {
    // each opponent continues when its equity vs the actor's new range beats the price; a light MDF pull, as in facingPolicy
    var sp = ctx.spec, fAll = 1, calls = [];
    sp.opps.forEach(function (Wo, j) {
      var e = eqVs(actorRangeAfter, ctx.board), callAmt = Math.min(amount - oppCommitted, sp.oppStacks ? sp.oppStacks[j] : 1e9), need = callAmt / (potAfter + callAmt);
      var cont = new Float64Array(NC), tw = 0, cw = 0, list = [];
      for (var i = 0; i < NC; i++) if (Wo[i] > 0 && e[i] === e[i]) { list.push(i); var r = ctx.street === 'river' ? 1 : sp.ip ? 0.9 : 0.97; cont[i] = sig((e[i] * r - need) / 0.02); tw += Wo[i]; cw += Wo[i] * cont[i]; }
      var D = tw ? cw / tw : 0, mdf = potAfter / (potAfter + callAmt) * 0 + (potAfter - (amount - oppCommitted)) / potAfter;
      if (D < mdf - 0.05 && ctx.nOpp === 1) { // pull toward MDF the same way the baseline defends
        // river bluff-catchers call more than the raw equity says. The threshold is found so the calling share lands on
        // the target itself: a fixed shift of the curve overshot it (a river value bet read about 70% calls against a 58% MDF).
        var target = D + (ctx.street === 'river' ? 0.55 : 0.35) * (mdf - D), lo = 0, hi = need, k;
        for (var it = 0; it < 24; it++) {
          var mid = (lo + hi) / 2, cm = 0;
          for (k = 0; k < list.length; k++) { i = list[k]; cm += Wo[i] * sig((e[i] - mid) / 0.02); }
          if (cm / tw > target) lo = mid; else hi = mid;
        }
        cw = 0; for (k = 0; k < list.length; k++) { i = list[k]; cont[i] = sig((e[i] - lo) / 0.02); cw += Wo[i] * cont[i]; }
      }
      var callW = new Float64Array(NC); for (k = 0; k < list.length; k++) { i = list[k]; callW[i] = Wo[i] * cont[i]; }
      fAll *= tw ? 1 - cw / tw : 1;
      calls.push(callW);
    });
    return { fold: fAll, calls: calls };
  }
  function eqVsAll(calls, board, i) { var p = 1; calls.forEach(function (W) { var e = eqVs(W, board)[i]; p *= e === e ? e : 0.5; }); return p; }
  // EV of an aggressive action putting the actor's street total at `to`
  function aggEV(ctx, i, to, rangeAfter) {
    var sp = ctx.spec;
    // chips past what the opponents can match come back: a bet that covers them plays as all in for their stack
    if (sp.eff != null && to > sp.committed + sp.eff) to = sp.committed + sp.eff;
    var add = to - sp.committed, pot = sp.pot, potAfter = pot + add;
    var resp = oppResponse(ctx, rangeAfter, to, sp.currentBet, potAfter), eqc = eqVsAll(resp.calls, ctx.board, i);
    var callIn = Math.min(to, sp.eff + sp.committed) - sp.currentBet, Rr = ctx.street === 'river' ? 1 : realise(ctx, i);
    var win = potAfter + callIn * ctx.nOpp;
    var ev = resp.fold * pot + (1 - resp.fold) * (eqc * win * Rr - add);
    // parts (chips) let the review show the sum: fold x pot + call share x (win share x final pot x realized share - chips added)
    return { ev: ev, fold: resp.fold, eqVsCall: eqc, parts: { pot: pot, add: add, win: win, R: Rr } };
  }
  function evs(ctx, i, extraTo) {
    var sp = ctx.spec, p = policy(ctx), out = {}, info = {}, bb = sp.bb, R0 = realise(ctx, i), W = sp.W;
    if (extraTo && sp.eff != null) extraTo = Math.min(extraTo, sp.committed + sp.eff);
    if (p.kind === 'open') {
      out.check = ctx.eq[i] * R0 * sp.pot;
      var rangeBet = new Float64Array(NC); for (var k = 0; k < NC; k++) rangeBet[k] = W[k] * (p.bet[k] || 0);
      if (total(rangeBet) < 1e-6) rangeBet = W;
      var b = aggEV(ctx, i, sp.committed + p.amount, rangeBet); out[p.jam ? 'allin' : 'bet'] = b.ev; info.bet = b;
      if (extraTo && extraTo !== sp.committed + p.amount) { var x = aggEV(ctx, i, extraTo, rangeBet); info.hero = x; }
    } else {
      out.fold = 0;
      out.call = (ctx.eq[i] * R0 + implied(ctx, i)) * (sp.pot - (sp.toCall - p.callAmt) + p.callAmt) - p.callAmt;
      if (p.raiseTo) {
        var rangeR = new Float64Array(NC); for (k = 0; k < NC; k++) rangeR[k] = W[k] * (p.raise[k] || 0);
        if (total(rangeR) < 1e-6) rangeR = W;
        var r = aggEV(ctx, i, p.raiseTo, rangeR); out[p.raiseJam ? 'allin' : 'raise'] = r.ev; info.raise = r;
        if (extraTo && extraTo !== p.raiseTo) info.hero = aggEV(ctx, i, extraTo, rangeR);
      }
    }
    for (var a in out) out[a] = rd(out[a] / bb, 2);
    if (info.hero) info.hero.evBB = rd(info.hero.ev / bb, 2);
    info.parts = { eq: ctx.eq[i], R: R0, imp: implied(ctx, i), pot: sp.pot, call: p.kind === 'open' ? 0 : p.callAmt, bb: bb };
    return { ev: out, info: info };
  }

  // ---------------------------------------------------------------- range tracking on an engine hand
  function postOrder(h, seat) { var n = h.players.length; return (seat - h.button - 1 + n) % n; }
  // weights over the 169 classes for seat's preflop actions before log index upto (default: all of them)
  function preflopRange(h, seat, upto) {
    var f = new Float64Array(169).fill(1), vr = R.vsRandom();
    h.log.forEach(function (e, i) {
      if (upto != null && i >= upto) return;
      if (e.ev !== 'act' || e.seat !== seat || e.street !== 'preflop') return;
      var s = R.forHand(h, seat, i), raise = e.type === 'raise' || e.type === 'bet', col = e.type === 'fold' ? s.fold : raise ? s.raise : s.call;
      if (s.kind === 'push' || s.kind === 'reshove') col = e.type === 'fold' ? s.fold : s.raise;
      if (C.classPercent(col) < 0.015) { // an action the chart never takes: a plausible guess instead
        col = new Float64Array(169);
        for (var x = 0; x < 169; x++) col[x] = e.type === 'fold' ? 1 : raise ? sig((vr[x] - 0.6) / 0.03) : sig((vr[x] - 0.47) / 0.04) * (1 - 0.7 * sig((vr[x] - 0.66) / 0.02));
      }
      for (x = 0; x < 169; x++) f[x] *= 0.02 + 0.98 * col[x];
    });
    return f;
  }
  // the same preflop narrowing with a player model's own frequencies (see FF.AI.model)
  function preflopRangeX(h, seat, model) {
    var f = new Float64Array(169).fill(1);
    h.log.forEach(function (e, i) {
      if (e.ev !== 'act' || e.seat !== seat || e.street !== 'preflop') return;
      var s = R.forHand(h, seat, i);
      // floor 0.12, not 0.02: a profile is a guess about a person, so hands the model rarely plays this way keep real weight
      for (var x = 0; x < 169; x++) f[x] *= (0.12 + 0.88 * model.pre(s, e, h.pos[seat], x)) * (model.size ? model.size(s, e, x, h.bb) : 1);
    });
    return f;
  }
  // range width as effective combos, (sum w)^2 / sum w^2, as a share of 1326; unlike rangePercent it ignores the overall scale of the weights
  function effPct(W) {
    var s = 0, q = 0;
    for (var i = 0; i < NC; i++) { var w = Math.abs(W[i]); s += w; q += w * w; }
    return q > 0 ? s * s / q / NC : 0;
  }
  // the light features a player model needs for its naive rule (made hand, draw, equity), cached on the node
  function lightFeat(ctx, i) {
    var c = ctx.lf || (ctx.lf = {}), f = c[i];
    if (!f) f = c[i] = { hand: describe(C1[i], C2[i], ctx.board), draw: drawOf(ctx, i), eqN: ctx.eqN[i], eq: ctx.eq[i] };
    return f;
  }
  function legalAt(sp) {
    return { toCall: sp.toCall, pot: sp.pot, call: Math.min(sp.toCall, sp.stack), canRaise: sp.canRaise, committed: sp.committed, minTo: sp.minTo, maxTo: sp.maxTo, currentBet: sp.currentBet, isBet: sp.toCall === 0 };
  }
  // narrow a modelled range by the chance the model takes the logged action
  function narrowX(ctx, WX, e, model) {
    var L = legalAt(ctx.spec), nw = new Float64Array(NC), agg = e.type === 'bet' || e.type === 'raise' || (e.type === 'allin' && e.to > e.betBefore);
    for (var i = 0; i < NC; i++) if (WX[i] > 0) {
      if (!(ctx.eqN[i] === ctx.eqN[i])) { nw[i] = WX[i]; continue; }
      var m = model.post(ctx, i, L, lightFeat(ctx, i)), ap = e.type === 'fold' ? m.fold : agg ? m.agg : m.call;
      nw[i] = WX[i] * (0.02 + 0.98 * ap);
    }
    return total(nw) < 1e-4 ? WX : nw;
  }
  var UID = 0;
  function handUid(h) { if (!h._ffUid) Object.defineProperty(h, '_ffUid', { value: ++UID, enumerable: false, writable: true }); return h._ffUid; }
  function tracker(h) {
    if (h._ff && h._ff.h === h && h._ff.q === Q.name) return h._ff;
    var tr = { h: h, q: Q.name, i: 0, street: 'preflop', board: [], W: {}, active: {}, stack: {}, comm: {}, aggr: {}, raises: 0, snaps: {}, acts: {}, streetBet: false };
    h.order.forEach(function (s) { tr.active[s] = true; tr.stack[s] = h.players[s].stackStart; tr.comm[s] = 0; tr.snaps[s] = {}; });
    Object.defineProperty(h, '_ff', { value: tr, writable: true, configurable: true, enumerable: false });
    return tr;
  }
  function activeSeats(tr) { return tr.h.order.filter(function (s) { return tr.active[s]; }); }
  function snapshot(tr, street) { activeSeats(tr).forEach(function (s) { if (tr.W[s]) tr.snaps[s][street] = rd(C.rangePercent(tr.W[s]) * 100, 1); }); }
  function initRanges(tr) {
    var h = tr.h;
    activeSeats(tr).forEach(function (s) {
      var f = preflopRange(h, s);
      tr.W[s] = C.removeDead(C.classToCombos(f), tr.board);
      tr.snaps[s].preflop = rd(C.classPercent(f) * 100, 1);
      if (tr.models && tr.models[s]) tr.WX[s] = C.removeDead(C.classToCombos(preflopRangeX(h, s, tr.models[s])), tr.board);
    });
  }
  // back to the start of the hand (a tracker only moves forward; an earlier decision rebuilds it)
  function rewind(tr) {
    var h = tr.h;
    tr.i = 0; tr.street = 'preflop'; tr.board = []; tr.W = {}; if (tr.WX) tr.WX = {}; tr.active = {}; tr.stack = {}; tr.comm = {}; tr.aggr = {};
    tr.raises = 0; tr.snaps = {}; tr.acts = {}; tr.streetBet = false; tr.checks = 0; tr.prevAggr = null; tr.ended = false;
    h.order.forEach(function (s) { tr.active[s] = true; tr.stack[s] = h.players[s].stackStart; tr.comm[s] = 0; tr.snaps[s] = {}; });
  }
  function advance(tr, upto) {
    var h = tr.h; upto = upto == null ? h.log.length : Math.min(upto, h.log.length);
    if (upto < tr.i) rewind(tr);
    for (; tr.i < upto; tr.i++) {
      var e = h.log[tr.i];
      if (e.ev === 'post') { tr.stack[e.seat] -= e.amount; if (e.kind !== 'ante') tr.comm[e.seat] = (tr.comm[e.seat] || 0) + e.amount; }
      else if (e.ev === 'board') {
        if (tr.street !== 'preflop') snapshot(tr, tr.street);
        var first = !tr.board.length; tr.board = e.board.slice();
        if (first) initRanges(tr); else activeSeats(tr).forEach(function (s) { tr.W[s] = C.removeDead(tr.W[s], e.cards); if (tr.WX && tr.WX[s]) tr.WX[s] = C.removeDead(tr.WX[s], e.cards); });
        tr.prevAggr = tr.aggr[tr.street]; tr.street = e.street; tr.raises = 0; tr.streetBet = false; tr.checks = 0;
        h.order.forEach(function (s) { tr.comm[s] = 0; });
      } else if (e.ev === 'act') {
        if (e.street !== 'preflop' && tr.W[e.seat]) {
          var ctx = nodeAt(tr, decisionFromEntry(e)), W = tr.W[e.seat], nw = new Float64Array(NC);
          // strong hands sometimes check or just call (traps), so a passive action never rules them out.
          // Medium made hands check for pot control far more than the baseline's bet-or-check split says:
          // without this floor a river check strips top pair out of the range and the hero's equity reads near 100%.
          var passive = e.type === 'check' || e.type === 'call';
          for (var i = 0; i < NC; i++) if (W[i] > 0) {
            var ap = actionProb(ctx, i, e.type, e.to);
            if (passive && ctx.eq[i] > 0.72) ap = Math.max(ap, 0.2 * Math.min(1, (ctx.eq[i] - 0.72) / 0.13));
            if (e.type === 'check' && ctx.eq[i] > 0.45) ap = Math.max(ap, 0.3 * Math.min(1, (ctx.eq[i] - 0.45) / 0.1));
            nw[i] = W[i] * (0.02 + 0.98 * ap);
          }
          if (total(nw) < 1e-4) nw = W;
          tr.W[e.seat] = nw;
          if (tr.WX && tr.WX[e.seat]) tr.WX[e.seat] = narrowX(ctx, tr.WX[e.seat], e, tr.models[e.seat]);
        }
        (tr.acts[e.street] = tr.acts[e.street] || []).push(e);
        if (e.type === 'fold') tr.active[e.seat] = false;
        if (e.type === 'bet' || e.type === 'raise') { tr.aggr[e.street] = e.seat; tr.raises++; tr.streetBet = true; }
        if (e.type === 'check') tr.checks = (tr.checks || 0) + 1;
        tr.stack[e.seat] = e.stackBefore - e.add; if (e.to) tr.comm[e.seat] = e.to;
      }
    }
    if (h.done && upto >= h.log.length && !tr.ended) { tr.ended = true; if (tr.street !== 'preflop') snapshot(tr, tr.street); }
    return tr;
  }
  function decisionFromEntry(e) {
    return { seat: e.seat, street: e.street, pot: e.potBefore, toCall: e.toCall, stack: e.stackBefore, currentBet: e.betBefore, committed: e.betBefore - e.toCall,
      canRaise: e.maxTo > 0, minTo: e.minTo, maxTo: e.maxTo, n: e.n };
  }
  function decisionFromLegal(h, L) {
    return { seat: L.seat, street: L.street, pot: L.pot, toCall: L.toCall, stack: L.stack, currentBet: L.currentBet, committed: L.committed,
      canRaise: L.canRaise, minTo: L.minTo, maxTo: L.maxTo, n: h.log.length };
  }
  function prevStreet(st) { return STREETS[Math.max(0, STREETS.indexOf(st) - 1)]; }
  function specFor(tr, d) {
    var h = tr.h, seat = d.seat, opp = activeSeats(tr).filter(function (s) { return s !== seat; });
    var later = opp.every(function (o) { return postOrder(h, o) < postOrder(h, seat); });
    var aggr = tr.aggr[prevStreet(d.street)] === seat, prevAg = tr.aggr[prevStreet(d.street)];
    var mine = d.stack + d.committed, oppMax = 0;
    opp.forEach(function (o) { oppMax = Math.max(oppMax, tr.stack[o] + (tr.comm[o] || 0)); });
    var eff = Math.max(0, Math.min(mine, oppMax) - d.committed);
    var checkedTo = d.toCall === 0 && (tr.checks || 0) > 0 && !tr.streetBet && !aggr;
    var leadInto = d.toCall === 0 && !aggr && !checkedTo && prevAg != null && !!tr.active[prevAg] && prevAg !== seat;
    return { key: h.id + ':' + (h.handNo || 0) + ':' + handUid(h) + ':' + d.n + ':' + seat + ':' + Q.name, seat: seat, street: d.street, board: tr.board, pot: d.pot, toCall: d.toCall,
      currentBet: d.currentBet, committed: d.committed, stack: d.stack, eff: eff, bb: h.bb, W: tr.W[seat], opps: opp.map(function (o) { return tr.W[o]; }),
      oppSeats: opp, oppStacks: opp.map(function (o) { return tr.stack[o]; }), ip: later, aggressor: aggr, checkedTo: checkedTo, leadInto: leadInto,
      facing: d.toCall > 0 ? (tr.raises >= 2 ? 'raise' : 'bet') : 'none', canRaise: d.canRaise, minTo: d.minTo, maxTo: d.maxTo, nRaises: tr.raises,
      icmRP: icmFor(h, seat, opp[0], d) };
  }
  function nodeAt(tr, d) { return node(specFor(tr, d)); }

  // ---------------------------------------------------------------- against one modelled player
  // a second tracker that also follows each modelled seat's range under its own play (WX); models = { seat: FF.AI.model(...) }
  function trackerX(h, models, sig0) {
    var c = h._ffX;
    if (c && c.h === h && c.q === Q.name && c.sig === sig0) return c;
    var tr = { h: h, q: Q.name, sig: sig0, i: 0, street: 'preflop', board: [], W: {}, WX: {}, models: models, active: {}, stack: {}, comm: {}, aggr: {}, raises: 0, snaps: {}, acts: {}, streetBet: false };
    h.order.forEach(function (s) { tr.active[s] = true; tr.stack[s] = h.players[s].stackStart; tr.comm[s] = 0; tr.snaps[s] = {}; });
    Object.defineProperty(h, '_ffX', { value: tr, writable: true, configurable: true, enumerable: false });
    return tr;
  }
  // the EV of each option for the decision at log index n when the one opponent plays like `model`:
  // its range follows its own frequencies, and it answers a bet or raise with its own mix (fold, call, raise).
  // Returns null preflop or multiway. EVs in bb, fold = 0, as evs().
  function exploitEvs(h, seat, n, models, sig0, heroTo) {
    var e = h.log[n]; if (!e || e.street === 'preflop') return null;
    var tr = advance(trackerX(h, models, sig0), n), d = decisionFromEntry(e), sp0 = specFor(tr, d);
    if (sp0.oppSeats.length !== 1) return null;
    var v = sp0.oppSeats[0], model = models[v]; if (!model || !tr.WX[v]) return null;
    var ctx = node(sp0), sp = ctx.spec, p = h.players[seat], hole = p.hole, i = C.comboIndex(hole[0], hole[1]), board = tr.board, bb = h.bb;
    var WX = tr.WX[v], seed = n * 7919 + 17, river = ctx.street === 'river';
    function eqv(W) { var r = C.equityVsRange(hole, W, board, { seed: seed, samples: 6000 }); return r.eq === r.eq ? r.eq : 0.5; }
    var eqX = eqv(WX), R0 = realise(ctx, i), imp = implied(ctx, i), pol = policy(ctx), out = {}, info = {};
    var commV = tr.comm[v] || 0, stackV = tr.stack[v];
    // a bet past the player's stack plays as all in for that stack: the rest comes back
    if (heroTo) heroTo = Math.min(heroTo, commV + stackV);
    function agg(to, rangeAfter) {
      to = Math.min(to, commV + stackV);
      var add = to - sp.committed, potAfter = sp.pot + add, toCallV = to - commV;
      var key = sp.key + ':x' + to + ':' + model.tier + model.style;
      var vs = { key: key, seat: v, street: sp.street, board: board, pot: potAfter, toCall: toCallV, currentBet: to, committed: commV, stack: stackV,
        eff: Math.max(0, Math.min(commV + stackV, sp.committed + sp.stack) - commV), bb: bb, W: tr.W[v], opps: [rangeAfter], oppSeats: [seat], oppStacks: [sp.stack - add],
        ip: !sp.ip, aggressor: false, checkedTo: false, leadInto: false, facing: sp.toCall > 0 || sp.nRaises ? 'raise' : 'bet',
        canRaise: stackV > toCallV && sp.stack - add > 0, minTo: Math.min(to + Math.max(to - sp.currentBet, bb), commV + stackV), maxTo: commV + stackV, nRaises: sp.nRaises + 1, icmRP: 0 };
      var vctx = node(vs), L = legalAt(vs), F = 0, Cw = 0, Rw = 0, tw = 0, callW = new Float64Array(NC), raiseW = new Float64Array(NC), rto = 0;
      for (var j = 0; j < NC; j++) {
        if (!(WX[j] > 0) || C1[j] === hole[0] || C1[j] === hole[1] || C2[j] === hole[0] || C2[j] === hole[1] || !(vctx.eqN[j] === vctx.eqN[j])) continue;
        var m = model.post(vctx, j, L, lightFeat(vctx, j)), w = WX[j];
        tw += w; F += w * m.fold; Cw += w * m.call; Rw += w * m.agg; callW[j] = w * m.call; raiseW[j] = w * m.agg; if (m.agg > 0.01 && m.to > rto) rto = m.to;
      }
      if (!tw) return null;
      F /= tw; Cw /= tw; Rw /= tw;
      var Rr = river ? 1 : R0, callIn = Math.min(toCallV, stackV), eqc = Cw > 0.002 ? eqv(callW) : 0.5;
      var ev = F * sp.pot + Cw * (eqc * (potAfter + callIn) * Rr - add), eqr = null;
      if (Rw > 0.002) {
        rto = Math.max(rto, Math.min(to * 2, commV + stackV));
        // the hero faces a raise to rto: call when the raise range leaves enough equity, else fold and lose the bet
        var heroTot = Math.min(rto, sp.committed + sp.stack) - sp.committed, vTot = Math.min(rto, commV + stackV) - commV;
        eqr = eqv(raiseW);
        ev += Rw * Math.max(-add, eqr * (sp.pot + heroTot + vTot) * Rr - heroTot);
      }
      return { ev: ev, to: to, fold: F, call: Cw, raise: Rw, eqVsCall: eqc, eqVsRaise: eqr, parts: { pot: sp.pot, add: add, win: potAfter + callIn, R: Rr, rest: ev - (F * sp.pot + Cw * (eqc * (potAfter + callIn) * Rr - add)) } };
    }
    function narrowed(field) {
      var W = sp.W, r = new Float64Array(NC); for (var k = 0; k < NC; k++) r[k] = W[k] * (pol[field][k] || 0);
      return total(r) < 1e-6 ? W : r;
    }
    if (pol.kind === 'open') {
      out.check = eqX * R0 * sp.pot;
      var rb = narrowed('bet'), b = agg(sp.committed + pol.amount, rb);
      if (b) { out[pol.jam ? 'allin' : 'bet'] = b.ev; info.bet = b; }
      if (heroTo && heroTo !== sp.committed + pol.amount) info.hero = agg(heroTo, rb);
    } else {
      out.fold = 0;
      out.call = (eqX * R0 + imp) * (sp.pot - (sp.toCall - pol.callAmt) + pol.callAmt) - pol.callAmt;
      if (pol.raiseTo) {
        var rr = narrowed('raise'), r = agg(pol.raiseTo, rr);
        if (r) { out[pol.raiseJam ? 'allin' : 'raise'] = r.ev; info.raise = r; }
        if (heroTo && heroTo !== pol.raiseTo) info.hero = agg(heroTo, rr);
      }
    }
    for (var a in out) out[a] = rd(out[a] / bb, 2);
    if (info.hero) info.hero.evBB = rd(info.hero.ev / bb, 2);
    info.parts = { eq: eqX, R: R0, imp: imp, pot: sp.pot, call: pol.kind === 'open' ? 0 : pol.callAmt, bb: bb };
    return { ev: out, info: info, eq: eqX, eqBase: ctx.eq[i], villain: v, rangePct: rd(effPct(WX) * 100, 1), basePct: rd(effPct(tr.W[v]) * 100, 1) };
  }
  function rangeOf(h, seat, upto) { var tr = advance(tracker(h), upto); return tr.W[seat] || C.classToCombos(preflopRange(h, seat)); }

  // ---------------------------------------------------------------- ICM
  // h.icm = { payouts: [...], stacks: { id: chips } } (FF.Strategy.tourneyCtx(t) builds it at the start of a hand)
  function tourneyCtx(t) {
    var stacks = {}; T.alive(t).forEach(function (p) { stacks[p.id] = p.startStack != null ? p.startStack : p.stack; });
    return { payouts: t.payouts.slice(), stacks: stacks };
  }
  function icmPremium(stacks, payouts, hi, vi, heroIn, villIn, dead) {
    var H = stacks[hi], V = stacks[vi], risk = Math.min(H, V);
    var sF = stacks.slice(), sW = stacks.slice(), sL = stacks.slice();
    sF[hi] = H - heroIn; sF[vi] = V + heroIn + dead;
    sW[hi] = H + risk + dead; sW[vi] = V - risk;
    sL[hi] = H - risk; sL[vi] = V + risk + dead;
    var eF = T.icm(sF, payouts)[hi], eW = T.icm(sW, payouts)[hi], eL = T.icm(sL, payouts)[hi];
    if (eW - eL <= 1e-9) return { need: 1, chipNeed: 0.5, rp: 0 };
    var need = (eF - eL) / (eW - eL), chipNeed = (sF[hi] - sL[hi]) / (sW[hi] - sL[hi]);
    return { need: need, chipNeed: chipNeed, rp: Math.max(0, need - chipNeed) };
  }
  function icmFor(h, seat, vseat, d) {
    var ctx = h.icm; if (!ctx || !ctx.payouts || vseat == null) return 0;
    var ids = Object.keys(ctx.stacks), stacks = [], hi = -1, vi = -1, me = h.players[seat], vp = h.players[vseat];
    ids.forEach(function (id, k) {
      var ps = null; h.order.forEach(function (s) { if (h.players[s].id === id) ps = h.players[s]; });
      stacks.push(ps ? ps.stackStart : ctx.stacks[id]);
      if (id === me.id) hi = k; if (id === vp.id) vi = k;
    });
    if (hi < 0 || vi < 0) return 0;
    if (stacks.length <= ctx.payouts.length) return 0.0; // in the money already with every place paid: chips still matter, keep it plain
    var heroIn = me.stackStart - (d ? d.stack : me.stack), villIn = vp.stackStart - vp.stack, pot = d ? d.pot : E.pot(h);
    var dead = Math.max(0, pot - heroIn - villIn);
    var key = stacks.join(',') + '|' + hi + vi + '|' + heroIn + '|' + dead, c = icmMemo.get(key);
    if (c == null) { c = icmPremium(stacks, ctx.payouts, hi, vi, heroIn, villIn, dead).rp; if (icmMemo.size > 500) icmMemo.clear(); icmMemo.set(key, c); }
    return c;
  }
  var icmMemo = new Map();

  // ---------------------------------------------------------------- preflop
  function preflopSpot(h, seat, n) { return R.forHand(h, seat, n); }
  function eqVsSeatRange(h, seat, opp, cls, upto) { var f = preflopRange(h, opp, upto), e = R.eqVsRange(f); return e[cls]; }
  // ---- a rough chip model of the preflop options (bb, fold = 0), used to size the cost of leaving the chart.
  // Each opponent still to respond answers a raise from their own chart spot (folds, calls, re-raises); the first one
  // to continue plays heads-up against the hero. Realization R scales the hero's equity share of the pot.
  function preflopModel(h, seat, n, d, cls, raiseTo, jam, heroSpot) {
    var bb = h.bb, np = h.order.length, log = h.log.slice(0, n), inn = {}, folded = {}, allin = {};
    log.forEach(function (e) {
      if (e.ev === 'post' && e.kind !== 'ante') inn[e.seat] = (inn[e.seat] || 0) + e.amount;
      if (e.ev !== 'act' || e.street !== 'preflop') return;
      if (e.type === 'fold') folded[e.seat] = true;
      else if (e.type !== 'check' && e.to) inn[e.seat] = e.to;
      if (e.allIn) allin[e.seat] = true;
    });
    var bbSeat = h.order.filter(function (s) { return h.pos[s] === 'BB'; })[0], bbIx = h.order.indexOf(bbSeat);
    var pk = function (s) { return (h.order.indexOf(s) - bbIx - 1 + np) % np; };
    var total = function (s) { return h.players[s].stackStart - h.players[s].anteP; };
    var hp = pk(seat), opps = h.order.filter(function (s) { return s !== seat && !folded[s] && !allin[s]; });
    opps.sort(function (a, b) { return ((pk(a) - hp + np) % np) - ((pk(b) - hp + np) % np); });
    var later = function (j) { return postOrder(h, seat) > postOrder(h, j); };
    var real = function (eq, ip, allIn) { return allIn ? 1 : clamp((ip ? 0.95 : 0.82) + 0.4 * (eq - 0.5), 0.6, 1.2); };
    // what the stacks behind are worth to a hand that keeps playing: strong hands win more, dominated ones lose more
    var implied = function (eq, leftBB, allIn) { return allIn ? 0 : 0.05 * Math.max(0, leftBB) * clamp(eq - 0.5, -0.25, 0.3); };
    var pot = d.pot / bb, mine = (inn[seat] || 0), heroTot = total(seat), out = { fold: 0 };
    var cut = function (f, col) { var o = new Float64Array(169); for (var x = 0; x < 169; x++) o[x] = f[x] * col[x]; return o; };
    var stat = function (f) { var e = R.eqVsRange(f); return { eq: e[cls], w: e.weight[cls] }; };
    // calling (or checking): heads-up against the last raiser, or the field's widest range when checking
    var lastR = null; log.forEach(function (e) { if (e.ev === 'act' && e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet')) lastR = e.seat; });
    if (d.toCall > 0) {
      var callAmt = Math.min(d.toCall, d.stack), fr = lastR != null ? preflopRange(h, lastR, n) : new Float64Array(169).fill(1), ec = stat(fr).eq;
      var allInC = callAmt >= d.stack || (lastR != null && allin[lastR]);
      out.call = ec * real(ec, lastR != null ? later(lastR) : false, allInC) * (pot + callAmt / bb) - callAmt / bb + implied(ec, (d.stack - callAmt) / bb, allInC);
      out.callEq = ec;
    } else {
      var ek = 1; opps.forEach(function (j) { ek *= stat(preflopRange(h, j, n)).eq; });
      var ks = Math.pow(ek, 1 / Math.max(1, opps.length)); // per-opponent average, then a crude multiway share
      out.check = (opps.length ? ek / (ek + (1 - ks) * opps.length * Math.pow(ks, Math.max(0, opps.length - 1))) : 1) * real(ks, opps.every(later), false) * pot;
    }
    if (!d.canRaise) return out;
    // raising: walk the players who still answer, each assumed to fold if a later one is reached
    var add = (raiseTo - mine) / bb, fake = Object.create(h), flog = log.concat([{ ev: 'act', street: 'preflop', seat: seat, pos: h.pos[seat], type: 'raise', to: raiseTo, allIn: !!jam }]);
    fake.log = flog;
    var pReach = 1, evR = 0, dead = pot + add, deep = jam && heroTot / bb > 30, jamF = null;
    if (deep) { // a deep all in reads as a tight range: the top half of the hero's raising range, at least the top 6% of hands
      var vr = R.vsRandom(), rc = heroSpot && heroSpot.raise, idx = []; for (var x = 0; x < 169; x++) idx.push(x);
      idx.sort(function (a, b) { return vr[b] - vr[a]; });
      var rp0 = rc ? C.classPercent(rc) : 0, want = Math.max(0.06, 0.5 * rp0), acc = 0; jamF = new Float64Array(169);
      for (var q = 0; q < 169 && acc < want; q++) { var y = idx[q], wy = rc && rp0 > 0.03 ? rc[y] : 1; if (wy <= 0) continue; jamF[y] = wy; acc += wy * C.CLASS_SIZE[y] / 1326; }
      var eJam = R.eqVsRange(jamF);
    }
    for (var k = 0; k < opps.length; k++) {
      var j = opps[k], sp = R.forHand(fake, j, flog.length), f = preflopRange(h, j, n), base = stat(f).w;
      if (base <= 0) continue;
      var jTot = total(j), jIn = inn[j] || 0, cap = Math.min(raiseTo, jTot), ip = later(j), callC, raiseC = cut(f, sp.raise), pr;
      if (deep) { var need = (cap - jIn) / bb / (dead + (cap - jIn) / bb), cc = new Float64Array(169); for (x = 0; x < 169; x++) cc[x] = f[x] * clamp((eJam[x] - need) / 0.03 + 0.5, 0, 1); callC = cc; pr = 0; }
      else if (sp.kind === 'vsJam') { callC = cut(f, sp.call.map(function (c, x) { return Math.min(1, c + sp.raise[x]); })); pr = 0; }
      else callC = cut(f, sp.call);
      var sc = stat(callC), sr = stat(raiseC), pc = sc.w / base; if (pr !== 0) pr = sr.w / base;
      // they call: heads-up for the pot as it stands plus their call
      var fp = dead + (cap - jIn) / bb - (raiseTo - cap) / bb, allInJ = raiseTo >= heroTot || cap >= jTot;
      var vCall = sc.eq * real(sc.eq, ip, allInJ) * fp - add + (raiseTo - cap) / bb + implied(sc.eq, Math.min(heroTot, jTot) / bb - raiseTo / bb, allInJ);
      // they re-raise: the hero continues only when the price is right
      var vRaise = -add;
      if (pr > 0.001) {
        var X = Math.min(jTot, sp.jam || !sp.raiseToBB ? jTot : Math.round(sp.raiseToBB * bb)), Xh = Math.min(X, heroTot);
        var callMore = (Xh - raiseTo) / bb, fp2 = dead + (Xh - jIn) / bb + callMore, allIn2 = Xh >= heroTot || X >= jTot;
        vRaise = Math.max(-add, sr.eq * real(sr.eq, ip, allIn2) * fp2 - add - callMore);
      }
      evR += pReach * (pc * vCall + pr * vRaise);
      pReach *= Math.max(0, 1 - pc - pr);
      flog.push({ ev: 'act', street: 'preflop', seat: j, pos: h.pos[j], type: 'fold' });
    }
    evR += pReach * dead - pReach * add; // everyone folds: the hero wins what was in the middle before the raise
    out.raise = evR; out.foldEq = pReach;
    return out;
  }
  // the chart's mix for the hero's class, with EVs relative to the chart's favourite action
  function preflopEval(h, seat, n, d, opts) {
    opts = opts || {};
    var p = h.players[seat], cls = C.classOfCards(p.hole[0], p.hole[1]), sp = preflopSpot(h, seat, n), bb = h.bb;
    var toCall = d.toCall, canCheck = toCall === 0, a = R.advice(sp, cls), mix = [];
    var raiseTo = sp.jam || !sp.raiseToBB ? d.maxTo : Math.round(sp.raiseToBB * bb);
    if (d.maxTo) raiseTo = clamp(raiseTo, d.minTo, d.maxTo);
    var jam = !d.canRaise ? false : sp.jam || raiseTo >= d.maxTo;
    var callName = canCheck ? 'check' : 'call';
    if (a.raise > 0.004 && d.canRaise) mix.push({ action: jam ? 'allin' : 'raise', size: rd(raiseTo / bb, 1), to: raiseTo, freq: a.raise });
    var callF = a.call + (d.canRaise ? 0 : a.raise);
    if (callF > 0.004) mix.push({ action: callName, size: 0, to: 0, freq: callF });
    var foldF = a.fold; if (canCheck) { var cf = mix.filter(function (m) { return m.action === 'check'; })[0]; if (cf) cf.freq += foldF; else mix.push({ action: 'check', size: 0, to: 0, freq: foldF }); foldF = 0; }
    if (foldF > 0.004) mix.push({ action: 'fold', size: 0, to: 0, freq: foldF });
    var t = 0; mix.forEach(function (m) { t += m.freq; }); if (!t) { mix = [{ action: canCheck ? 'check' : 'fold', size: 0, to: 0, freq: 1 }]; t = 1; }
    mix.forEach(function (m) { m.freq = rd(m.freq / t, 3); }); mix.sort(function (x, y) { return y.freq - x.freq; });
    var potBB = d.pot / bb, callBB = Math.min(toCall, d.stack) / bb, ev = {}, factors = [], pMax = mix[0].freq;
    var rp = 0, eqx = null, need = callBB / (potBB + callBB);
    factors.push({ kind: 'chart', label: sp.label, chart: sp.kind, depth: sp.depth, approx: !!sp.approx, hand: C.CLASS_NAME[cls] });
    if (h.icm) {
      var opp = null, mx = -1; h.log.slice(0, n).forEach(function (e) { if (e.ev === 'act' && (e.type === 'raise' || e.type === 'bet') && e.seat !== seat) opp = e.seat; });
      if (opp == null) h.order.forEach(function (s) { if (s !== seat && h.players[s].stackStart > mx) { mx = h.players[s].stackStart; opp = s; } });
      rp = icmFor(h, seat, opp, d);
    }
    if (sp.kind === 'vsJam') {
      eqx = sp.equity[cls]; need = sp.need;
      ev.fold = 0; ev.call = rd(eqx * (potBB + callBB) - callBB, 2);
      if (rp > 0.004) { ev.call = rd(ev.call - rp * (potBB + callBB), 2); factors.push({ kind: 'icm', premium: rd(rp, 3) }); }
      factors.push({ kind: 'potOdds', need: rd(need, 3), have: rd(eqx, 3), toCall: rd(callBB, 1), pot: rd(potBB, 1) });
      // keep the chart's mix consistent with the ICM-adjusted EV
      if (rp > 0.004) { var c2 = clamp((eqx - need - rp) / 0.03 + 0.5, 0, 1); mix = [{ action: 'call', size: 0, to: 0, freq: rd(c2, 3) }, { action: 'fold', size: 0, to: 0, freq: rd(1 - c2, 3) }].filter(function (m) { return m.freq > 0.004; }).sort(function (x, y) { return y.freq - x.freq; }); }
      return { mix: mix, ev: ev, factors: factors, source: 'Estimate', spot: sp, cls: cls, evBasis: 'chips' };
    }
    // relative EVs: the chart's favourite action is 0; a clear deviation costs about what it risks
    var risk = Math.max(callBB, (raiseTo - d.committed) / bb, 1), vr = R.vsRandom()[cls];
    var lastR = null; h.log.slice(0, n).forEach(function (e) { if (e.ev === 'act' && e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet')) lastR = e.seat; });
    if (lastR != null && lastR !== seat) { eqx = eqVsSeatRange(h, seat, lastR, cls, n); factors.push({ kind: 'potOdds', need: rd(need, 3), have: rd(eqx, 3), toCall: rd(callBB, 1), pot: rd(potBB, 1) }); }
    var gap = eqx != null ? Math.abs(eqx - need) : Math.abs(vr - 0.5);
    var vOf = function (rk) { var v = rk * (0.2 + gap) + (sp.kind === 'push' || sp.kind === 'reshove' ? 0 : potBB * 0.1); return sp.kind === 'push' || sp.kind === 'reshove' ? Math.min(v, rk * 0.35) : v; };
    var all = [callName, 'fold'];
    if (d.canRaise) all.unshift(jam ? 'allin' : 'raise');
    if (canCheck) all = all.filter(function (x) { return x !== 'fold'; });
    // an action risks its own chips, or the favourite's when that risks more: folding where the chart calls risks the call,
    // not the chart's jam
    var riskOf = function (act) { return act === 'fold' || act === 'check' ? 0 : act === callName ? Math.max(callBB, 1) : risk; };
    all.forEach(function (act) {
      var m = mix.filter(function (q) { return q.action === act; })[0], f = m ? m.freq : 0;
      ev[act] = rd(-vOf(Math.max(riskOf(act), riskOf(mix[0].action))) * Math.pow(Math.max(0, pMax - f), 1.3), 2);
    });
    // the chip model sizes clear deviations (folding a hand the chart always raises, a deep jam); the relative
    // estimate stays as a floor at half weight. A real mix (both actions well above 15%) costs little either way.
    var info = null;
    if (!opts.noEV && sp.kind !== 'push' && sp.kind !== 'reshove' && sp.kind !== 'walk') {
      var M = preflopModel(h, seat, n, d, cls, raiseTo, jam, sp), fav = mix[0].action, rel = {}, aggKey = jam ? 'allin' : 'raise';
      var mv = function (act) { return act === 'fold' ? 0 : act === 'check' ? M.check : act === 'call' ? M.call : M.raise; };
      var costOf = function (act, val) {
        var m = mix.filter(function (q) { return q.action === act; })[0], f = m ? m.freq : 0, w = clamp((pMax - f - 0.15) / 0.6, 0, 1);
        return -rd(Math.max(Math.max(0, mv(fav) - val) * w, -0.5 * rel[act]), 2);
      };
      all.forEach(function (act) { rel[act] = ev[act]; });
      all.forEach(function (act) { if (act !== fav && mv(act) != null && mv(fav) != null) ev[act] = costOf(act, mv(act)); });
      var hTo = opts.heroTo;
      if (hTo && d.canRaise && mv(fav) != null && (hTo / raiseTo > 1.3 || hTo / raiseTo < 0.75)) {
        var M2 = preflopModel(h, seat, n, d, cls, Math.min(hTo, d.maxTo || hTo), hTo >= d.maxTo, sp);
        var aggF = mix.filter(function (q) { return q.action === aggKey; }).reduce(function (t, q) { return t + q.freq; }, 0);
        // when the chart raises, the other size is judged against the chart's own raise
        var hv;
        if (aggF >= pMax - 0.15) hv = (ev[aggKey] || 0) + Math.min(0, M2.raise - M.raise);
        else {
          // the relative floor for the hero's own size: it risks what that raise puts in, not the chart's raise. Facing a
          // raise far under the chart's size (sp.priced) the chart is a guess: the floor is halved, and cut by 30% more
          // when the chip model rates the play at least as well as the chart's
          var hRisk = Math.max(callBB, (Math.min(hTo, d.maxTo || hTo) - d.committed) / bb, 1), mf = mix.filter(function (q) { return q.action === aggKey; })[0];
          rel[aggKey] = -vOf(Math.max(hRisk, riskOf(fav))) * Math.pow(Math.max(0, pMax - (mf ? mf.freq : 0)), 1.3);
          if (sp.priced) rel[aggKey] *= M2.raise >= mv(fav) ? 0.35 : 0.5;
          hv = costOf(aggKey, M2.raise);
        }
        // a deep all in where the chart raises small folds out the worse hands, whatever the model says
        if (aggF >= pMax - 0.15 && hTo >= d.maxTo && !jam && d.stack / bb > 40) hv = Math.min(hv, -Math.min(2, 0.015 * d.stack / bb));
        info = { hero: { evBB: rd(hv, 2), modelEV: rd(M2.raise, 2), foldEq: rd(M2.foldEq, 3) } };
      }
      factors.push({ kind: 'preflopModel', fold: 0, call: M.call != null ? rd(M.call, 2) : null, check: M.check != null ? rd(M.check, 2) : null, raise: M.raise != null ? rd(M.raise, 2) : null,
        foldEq: M.foldEq != null ? rd(M.foldEq, 3) : null, heroRaise: info ? info.hero.modelEV : null, heroFoldEq: info ? info.hero.foldEq : null });
    }
    if (rp > 0.004) factors.push({ kind: 'icm', premium: rd(rp, 3) });
    factors.push({ kind: 'preflopStrength', vsRandom: rd(vr, 3), risk: rd(risk, 1) });
    return { mix: mix, ev: ev, factors: factors, source: 'Estimate', spot: sp, cls: cls, evBasis: 'relative', info: info };
  }

  // ---------------------------------------------------------------- public decision API
  // the baseline's view of the decision `seat` faces now (or at log index n in a finished hand)
  function evaluate(h, seat, opts) {
    opts = opts || {};
    var n = opts.n != null ? opts.n : h.log.length, d = opts.decision;
    if (!d) d = opts.n != null ? decisionFromEntry(h.log[n]) : decisionFromLegal(h, E.legal(h, seat));
    var street = d.street, t0 = Date.now(), res;
    if (street === 'preflop') res = preflopEval(h, seat, n, d, opts);
    else {
      var tr = advance(tracker(h), n), ctx = nodeAt(tr, d), p = h.players[seat], i = C.comboIndex(p.hole[0], p.hole[1]);
      var cm = comboMix(ctx, i), e = opts.noEV ? { ev: {}, info: {} } : evs(ctx, i, opts.heroTo);
      res = { mix: cm.mix, ev: e.ev, factors: factorsFor(ctx, i), source: 'Estimate', ctx: ctx, combo: i, info: e.info, feat: features(ctx, i), evBasis: 'chips' };
    }
    res.ms = Date.now() - t0; res.decision = d;
    return res;
  }

  // ---------------------------------------------------------------- solver hook
  var provider = null;
  function setSolverProvider(fn) { provider = typeof fn === 'function' ? fn : null; }
  function hasSolver() { return !!provider; }
  function toF32(w) { var o = new Float32Array(NC); if (w) for (var i = 0; i < NC; i++) o[i] = w[i]; return o; }
  // a plain description of the spot for a solver: see HANDOFF.md
  function spotDesc(h, seat, n) {
    var e = h.log[n], tr = advance(tracker(h), n), opp = activeSeats(tr).filter(function (s) { return s !== seat; });
    var acts = { preflop: [], flop: [], turn: [], river: [] };
    h.log.slice(0, n).forEach(function (x) { if (x.ev === 'act') acts[x.street].push({ seat: x.seat, pos: x.pos, type: x.type, to: x.to, allIn: !!x.allIn }); });
    var p = h.players[seat], stacks = {}; h.order.forEach(function (s) { stacks[s] = tr.stack[s]; });
    return { handId: h.id, n: n, street: e.street, board: tr.board.slice(), boardStr: C.cardsStr(tr.board), pot: e.potBefore, toCall: e.toCall, bb: h.bb,
      heroSeat: seat, heroPos: h.pos[seat], villainSeats: opp, villainPos: opp.map(function (s) { return h.pos[s]; }), stacks: stacks,
      effStack: Math.min.apply(null, [tr.stack[seat]].concat(opp.map(function (s) { return tr.stack[s]; }))),
      actions: acts, thisStreet: acts[e.street], multiway: opp.length > 1, heroRange: toF32(tr.W[seat]), villainRange: toF32(opp.length ? tr.W[opp[0]] : null),
      villainRanges: opp.map(function (s) { return toF32(tr.W[s]); }), heroCombo: C.comboIndex(p.hole[0], p.hole[1]), heroCards: p.hole.slice(), mode: h.table ? h.table.mode : 'cash' };
  }
  function askSolver(h, seat, n) {
    if (!provider) return Promise.resolve(null);
    var e = h.log[n]; if (!e || e.street === 'preflop') return Promise.resolve(null);
    var desc = spotDesc(h, seat, n); if (desc.multiway) return Promise.resolve(null);
    try { return Promise.resolve(provider(desc)).then(function (r) { return r && r.mix ? r : null; }, function () { return null; }); }
    catch (err) { return Promise.resolve(null); }
  }

  return { realise: realise, setQuality: setQuality, quality: function () { return Q.name; }, qualityInfo: function () { return { flop: Q.flop, turn: Q.turn, name: Q.name }; }, texture: texture, draws: draws, describe: describe, eqVs: eqVs, node: node, policy: policy,
    comboMix: comboMix, features: features, factorsFor: factorsFor, evs: evs, actionProb: actionProb, BASE: BASE,
    tracker: tracker, advance: advance, rangeOf: rangeOf, preflopRange: preflopRange, specFor: specFor, nodeAt: nodeAt,
    decisionFromEntry: decisionFromEntry, decisionFromLegal: decisionFromLegal, activeSeats: activeSeats,
    preflopEval: preflopEval, evaluate: evaluate, tourneyCtx: tourneyCtx, icmPremium: icmPremium, icmFor: icmFor,
    exploitEvs: exploitEvs, trackerX: trackerX,
    setSolverProvider: setSolverProvider, hasSolver: hasSolver, spotDesc: spotDesc, askSolver: askSolver, clearCache: function () { eqCache.clear(); ctxCache.clear(); } };
});
