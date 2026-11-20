/* Felt & Fold: hand review. Grades each hero decision against the baseline (or a solver result when one arrives),
   explains it in plain sentences, recaps the showdown and the villain's range, and rolls decisions into session leaks.
   FF.Review.hand(h, heroSeat, opts) -> review (Estimate, at once); review.upgrade(onChange) -> Promise (solver results).
   FF.Review.session(reviews) -> session stats and leaks.
   UMD: window.FF.Review in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./ranges.js'), require('./strategy.js'), require('./ai.js'));
  else { root.FF = root.FF || {}; root.FF.Review = factory(root.FF.Cards, root.FF.Engine, root.FF.Ranges, root.FF.Strategy, root.FF.AI); }
})(typeof self !== 'undefined' ? self : this, function (C, E, R, S, AI) {
  'use strict';
  var GRADES = ['Good', 'Inaccuracy', 'Mistake', 'Blunder'];
  var GOOD_FREQ = 0.15;
  function rd(x, n) { var k = Math.pow(10, n == null ? 1 : n); return Math.round(x * k) / k; }
  function bbs(x) { var v = rd(x, 1); return (v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1)) + 'bb'; }
  function pc(x) { return x > 0.99 && x < 1 ? 'over 99%' : x > 0 && x < 0.01 ? 'under 1%' : Math.round(x * 100) + '%'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function isAgg(a) { return a === 'bet' || a === 'raise' || a === 'allin'; }
  function verbPast(a) { return { fold: 'folded', check: 'checked', call: 'called', bet: 'bet', raise: 'raised', allin: 'moved all in with' }[a] || a; }
  function verb3(a) { return { fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises', allin: 'moves all in' }[a] || a; }
  function handLine(feat) {
    var k = feat.hand.kind, l = feat.hand.label;
    if (k === 'board') return 'Your best five cards were on the board.';
    return 'You had ' + l.replace('of its own', 'of your own') + '.';
  }
  function verbIng(a) { return { fold: 'folding', check: 'checking', call: 'calling', bet: 'betting', raise: 'raising', allin: 'moving all in' }[a] || a; }
  function sizeWord(f) {
    if (f >= 1.9) return 'an overbet of ' + rd(f, 1) + ' times the pot'; if (f > 1.15) return 'an overbet'; if (f >= 0.9) return 'pot';
    if (f >= 0.7) return 'three-quarters pot'; if (f >= 0.6) return 'two-thirds pot'; if (f >= 0.42) return 'half pot'; if (f >= 0.28) return 'a third of the pot'; return 'a quarter of the pot';
  }
  // thresholds in bb, scaled by the pot before the action being faced
  // preflop pots are small, so a preflop Blunder starts at 2bb
  function gradeFor(loss, potBB, preflop) {
    if (loss >= Math.max(0.45 * potBB, preflop ? 2 : 2.5)) return 'Blunder';
    if (loss >= Math.max(0.18 * potBB, 1)) return 'Mistake';
    if (loss >= Math.max(0.06 * potBB, 0.3)) return 'Inaccuracy';
    return 'Good';
  }

  // ---------------------------------------------------------------- spot labels
  function preRaises(h, n) { var k = 0; h.log.slice(0, n).forEach(function (e) { if (e.ev === 'act' && e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet')) k++; }); return k; }
  function potType(h, n) { var k = preRaises(h, Math.min(n, firstBoard(h))); return k === 0 ? 'limped pot' : k === 1 ? 'single-raised pot' : k === 2 ? '3-bet pot' : '4-bet pot'; }
  function firstBoard(h) { for (var i = 0; i < h.log.length; i++) if (h.log[i].ev === 'board') return i; return h.log.length; }
  function spotLabel(h, seat, e, res) {
    if (e.street === 'preflop') return res.spot ? res.spot.label : 'Preflop';
    var sp = res.ctx.spec, street = cap(e.street), parts = [], acts = h.log.slice(0, e.n).filter(function (x) { return x.ev === 'act' && x.street === e.street; });
    var heroChecked = acts.some(function (x) { return x.seat === seat && x.type === 'check'; }), raises = acts.filter(function (x) { return x.type === 'bet' || x.type === 'raise'; }).length;
    if (e.toCall === 0) parts.push(sp.aggressor ? (e.street === 'flop' ? 'c-bet decision' : 'barrel decision') : sp.leadInto ? 'lead decision' : sp.checkedTo ? 'checked to you' : 'first to act');
    else if (raises >= 2) parts.push('facing a raise');
    else if (heroChecked) parts.push('facing a bet after checking');
    else parts.push(e.street === 'river' ? 'facing a river bet' : (e.street === 'flop' && wasCbet(h, e) ? 'facing a c-bet' : 'facing a bet'));
    parts.push(sp.ip ? 'in position' : 'out of position');
    var who = sp.oppSeats.length + 1;
    return street + ', ' + parts.join(' ') + ', ' + (who > 2 ? who + '-way ' : '') + potType(h, e.n);
  }
  function wasCbet(h, e) {
    var lastPre = null, first = null;
    h.log.slice(0, e.n).forEach(function (x) { if (x.ev !== 'act') return; if (x.street === 'preflop' && (x.type === 'raise' || x.type === 'bet')) lastPre = x.seat; if (x.street === 'flop' && first == null && x.type === 'bet') first = x.seat; });
    return first != null && first === lastPre;
  }

  // ---------------------------------------------------------------- one decision
  function heroAction(e) { var t = e.type; if (e.allIn && (t === 'bet' || t === 'raise' || t === 'call')) return t === 'call' ? 'call' : 'allin'; return t; }
  function findMix(mix, act) {
    if (isAgg(act)) { var f = 0, best = null; mix.forEach(function (m) { if (isAgg(m.action)) { f += m.freq; if (!best || m.freq > best.freq) best = m; } }); return { freq: f, m: best }; }
    var m = mix.filter(function (x) { return x.action === act; })[0];
    return { freq: m ? m.freq : 0, m: m };
  }
  // the bet size the hero's bet or raise is compared with: the nearest size the mix plays at least GOOD_FREQ of the time,
  // else its most frequent bet or raise
  function sizeRef(mix, did) {
    var agg = mix.filter(function (m) { return isAgg(m.action) && m.to > 0; }), played = agg.filter(function (m) { return m.freq >= GOOD_FREQ; });
    if (!agg.length) return null;
    if (!played.length || !(did.to > 0)) return agg.slice().sort(function (a, b) { return b.freq - a.freq; })[0];
    var best = null, bd = Infinity;
    played.forEach(function (m) { var x = Math.abs(Math.log(did.to / m.to)); if (x < bd) { bd = x; best = m; } });
    return best;
  }
  // a mix entry's size as a share of the pot before the action (chips added / pot), as did.size
  function potFrac(d, m) {
    if (!m || !(d.pot > 0) || !d.bb) return m && m.size != null ? m.size : null;
    return Math.max(0, (m.to / d.bb - (d.heroIn || 0)) / d.pot);
  }
  // one short reason the baseline's size suits this hand better (only called when the size is off)
  function sizingWhy(d, ref, tex) {
    var eq = d.feat ? d.feat.eq : 0.5, river = d.street === 'river', wet = tex && tex.wet > 0.55, dry = tex && tex.wet < 0.3, mine = d.did.size;
    if (mine > ref) {
      if (eq < 0.35) return 'A small bluff risks less to win the same pot.';
      if (eq >= 0.6) return river ? 'On the river a smaller bet gets more calls from worse hands.' : 'A smaller bet keeps more worse hands in to pay you.';
      if (dry && d.street === 'flop') return 'On a dry board a small bet does the same job for less.';
      return 'A hand in the middle gains little from a big bet: worse hands fold and better hands call.';
    }
    if (eq >= 0.6) return wet && !river ? 'On a wet board a bigger bet makes the draws pay more.' : 'A strong hand wants a bigger bet to win more when called.';
    if (eq < 0.35) return 'A bigger bluff gets more folds.';
    return wet && !river ? 'On a wet board a bigger bet makes the draws pay more.' : '';
  }
  function pctPot(p) { return p.action === 'allin' ? 'all in' : p.action === 'check' ? 'a check' : p.action === 'call' ? 'a call' : Math.round(100 * p.size) + '% pot'; }
  // the library or solver graded a size it was not solved for, or turned the bet into all in
  function mapNote(d) {
    if (d.forcedAllin) return 'The solver treats a bet of over two-thirds of your stack as all in. This bet was graded as all in.';
    var m = d.heroMap;
    if (!m || m.mode === 'near' || d.source === 'Estimate') return '';
    var lib = d.source === 'Library' ? 'The library' : 'The solver', mine = Math.round(100 * m.hero) + '% pot ' + (d.did.action === 'raise' ? 'raise' : 'bet');
    if (m.mode === 'blend' && m.lo && m.hi) return lib + ' has no ' + mine + ' here. This grade blends its results for ' + pctPot(m.lo) + ' and ' + pctPot(m.hi) + '.';
    return lib + ' has no ' + mine + ' here. This grade starts from its ' + pctPot(m.near) + ' result and adds a rough cost for the size.';
  }
  function evOf(ev, act) {
    if (ev[act] != null) return ev[act];
    if (isAgg(act)) { var b = null; ['bet', 'raise', 'allin'].forEach(function (k) { if (ev[k] != null && (b == null || ev[k] > b)) b = ev[k]; }); return b; }
    if (act === 'check' && ev.call != null) return ev.call; if (act === 'call' && ev.check != null) return ev.check;
    return null;
  }
  // Estimate, Chart and Nash grades stop at Mistake unless simple math settles the case (see settled());
  // an Estimate missed bluff stops at Inaccuracy. Solved and Library grades keep the full range.
  var SETTLE_GAP = 0.12, SETTLE_JAM_GAP = 0.06, SETTLE_PRE_OFF = 0.05, SETTLE_PRE_TOP = 0.85;
  function thresholds(d) {
    var p = Math.max(d.potBB, d.toCall || 0), pre = d.street === 'preflop';
    return { blunder: Math.max(0.45 * p, pre ? 2 : 2.5), mistake: Math.max(0.18 * p, 1) };
  }
  // a grade the numbers settle without the model's guesses about the opponent:
  // postflop, a fold with equity at least 12 points above the price, or a call at least 12 points below it;
  // preflop, a play the chart or Nash range takes under 5% of the time where it takes one action at least 85% (not an approximate chart),
  // and against a shove the equity gap must also be at least 6 points; a deep all in where the chart raises small is settled too
  function settled(d) {
    var po = F(d.factors || [], 'potOdds'), icm = F(d.factors || [], 'icm'), did = d.did.action, need = po ? po.need + (icm ? icm.premium : 0) : 0;
    if (d.street !== 'preflop') {
      if (!po) return false;
      return (did === 'fold' && po.have - need >= SETTLE_GAP) || (did === 'call' && need - po.have >= SETTLE_GAP);
    }
    var hm = findMix(d.mix, did), top = d.mix[0];
    if (d.jamOversize && !d.approx) return true;
    if (!(hm.freq < SETTLE_PRE_OFF && top && top.freq >= SETTLE_PRE_TOP && !d.approx)) return false;
    if (d.chartKind === 'vsJam' && po) return did === 'fold' ? po.have - need >= SETTLE_JAM_GAP : did === 'call' ? need - po.have >= SETTLE_JAM_GAP : true;
    return true;
  }
  function gradeDecision(d) {
    d.missedBluff = false; d.capped = null; d.freqFloor = false; d.settled = false;
    var hm = findMix(d.mix, d.did.action), heroEV = d.heroEV != null ? d.heroEV : evOf(d.ev, d.did.action), best = null, bestAct = null;
    d.mix.forEach(function (m) { var v = evOf(d.ev, m.action); if (v == null) return; if (m.freq >= GOOD_FREQ || m === d.mix[0]) { if (best == null || v > best) { best = v; bestAct = m.action; } } });
    if (best == null) { best = heroEV || 0; bestAct = d.mix[0] ? d.mix[0].action : d.did.action; }
    var loss = heroEV == null ? 0 : Math.max(0, best - heroEV), evLoss = loss;
    // postflop, a play the baseline almost never makes carries a small cost even when the EV model calls it close:
    // the two estimates disagree, and the mix holds information the EV sketch misses
    if (d.street !== 'preflop' && hm.freq < GOOD_FREQ && d.mix[0]) loss = Math.max(loss, 0.1 * d.potBB * Math.max(0, d.mix[0].freq - hm.freq - 0.1));
    if (loss > evLoss + 0.05 && evLoss < 0.3) { d.freqFloor = true; if (d.mix[0] && d.mix[0].action !== d.did.action) bestAct = d.mix[0].action; }
    if (!isAgg(d.did.action) && isAgg(bestAct) && d.feat && d.feat.eq < 0.35) { loss = Math.min(loss, Math.max(0.3 * d.potBB, 1.2)); d.missedBluff = true; }
    var ref = isAgg(d.did.action) ? sizeRef(d.mix, d.did) : null;
    var sizeOff = !!(ref && d.did.to && (d.did.to / ref.to > 1.7 || d.did.to / ref.to < 0.55));
    d.sizeRef = sizeOff ? ref : null;
    var good = hm.freq >= GOOD_FREQ && !sizeOff;
    d.heroFreq = rd(hm.freq, 3); d.bestAction = bestAct; d.bestEV = rd(best, 2); d.heroEVUsed = heroEV == null ? null : rd(heroEV, 2);
    d.evLost = good ? 0 : rd(loss, 2);
    d.cost = rd(loss, 2);
    // a call is graded against the pot it plays for, so a big shove call is not judged by the blinds alone
    d.grade = good ? 'Good' : gradeFor(loss, Math.max(d.potBB, d.toCall || 0), d.street === 'preflop');
    if (d.forceGrade && GRADES.indexOf(d.forceGrade) > GRADES.indexOf(d.grade)) { d.grade = d.forceGrade; d.evLost = Math.max(d.evLost, d.forceLoss || 0); }
    d.sizeOff = !!sizeOff;
    if (d.grade !== 'Good' && d.source !== 'Solved' && d.source !== 'Library') {
      var th = thresholds(d);
      d.settled = settled(d);
      if (d.missedBluff && d.source === 'Estimate' && GRADES.indexOf(d.grade) > 1) { d.grade = 'Inaccuracy'; d.evLost = rd(Math.min(d.evLost, th.mistake - 0.05), 2); d.capped = 'bluff'; }
      else if (d.grade === 'Blunder' && !d.settled) { d.grade = 'Mistake'; d.evLost = rd(Math.min(d.evLost, th.blunder - 0.05), 2); d.capped = 'estimate'; }
    }
    // the frequency grades against the play while the EV sketch prefers it: the review says so first, and the grade stops at Inaccuracy
    var hv = evOf(d.ev, d.did.action), bv = bestAct ? evOf(d.ev, bestAct) : null;
    d.evSplit = d.grade !== 'Good' && d.freqFloor && hv != null && bv != null && hv - bv > 0.3 ? rd(hv - bv, 2) : 0;
    if (d.evSplit && GRADES.indexOf(d.grade) > 1) { d.grade = 'Inaccuracy'; d.evLost = rd(Math.min(d.evLost, thresholds(d).mistake - 0.05), 2); }
    return d;
  }
  // whole percentages for a mix that add up to 100: actions under 1% are dropped, the rest rounded by largest remainder
  function mixPct(mix) {
    var keep = mix.filter(function (m) { return m.freq >= 0.01; }), tot = 0;
    keep.forEach(function (m) { tot += m.freq; });
    if (!tot) return [];
    var rows = keep.map(function (m, k) { var x = m.freq / tot * 100; return { m: m, pct: Math.floor(x), rem: x - Math.floor(x), k: k }; });
    var left = 100; rows.forEach(function (r) { left -= r.pct; });
    rows.slice().sort(function (a, b) { return b.rem - a.rem || a.k - b.k; }).slice(0, left).forEach(function (r) { r.pct++; });
    return rows.filter(function (r) { return r.pct > 0; }).map(function (r) { return { m: r.m, pct: r.pct }; });
  }
  function mixText(mix) {
    return mixPct(mix).map(function (r) {
      var m = r.m;
      return (isAgg(m.action) ? (m.action === 'allin' ? 'all in' : m.action + (m.sizeLabel ? ' ' + m.sizeLabel : '')) : m.action) + ' ' + r.pct + '%';
    }).join(', ');
  }
  function F(factors, kind) { return factors.filter(function (f) { return f.kind === kind; })[0]; }

  function buildDecision(h, seat, e, opts) {
    var res = S.evaluate(h, seat, { n: e.n, heroTo: (e.type === 'bet' || e.type === 'raise') ? e.to : null });
    var bb = h.bb, potBB = (e.potBefore - e.toCall) / bb, did = { action: heroAction(e), to: e.to || 0, add: e.add || 0 };
    did.toBB = rd(did.to / bb, 1); did.addBB = rd(did.add / bb, 1);
    if (isAgg(did.action) && e.street !== 'preflop') did.size = rd(did.add / Math.max(1, e.potBefore), 2);
    var mix = res.mix.map(function (m) {
      var o = { action: m.action, size: m.size, to: m.to || 0, freq: m.freq };
      if (isAgg(m.action)) { o.toBB = rd(o.to / bb, 1); o.sizeLabel = e.street === 'preflop' ? 'to ' + bbs(o.to / bb) : bbs((o.to - (e.betBefore - e.toCall)) / bb); }
      return o;
    });
    var d = { n: e.n, street: e.street, board: e.street === 'preflop' ? [] : S.advance(S.tracker(h), e.n).board.slice(), pot: rd(e.potBefore / bb, 1), potBB: rd(potBB, 1),
      toCall: rd(e.toCall / bb, 1), stack: rd(e.stackBefore / bb, 1), spot: spotLabel(h, seat, e, res), did: did, mix: mix, ev: res.ev, factors: res.factors,
      source: 'Estimate', evBasis: res.evBasis, feat: res.feat || null, info: res.info || null };
    if (e.street === 'preflop' && res.spot) {
      var sp = res.spot, cont = 0;
      d.chartKind = sp.kind; d.approx = !!sp.approx; d.depth = sp.depth;
      d.source = sp.kind === 'push' || sp.kind === 'reshove' || (sp.kind === 'vsJam' && sp.depth <= 15) ? 'Nash' : 'Chart';
      // the share of all hands the chart plays on: opens (or shoves) first in, otherwise continues with
      var first = sp.kind === 'rfi' || sp.kind === 'push' || sp.kind === 'reshove' || sp.kind === 'bbVsLimp' || sp.kind === 'isolate';
      var w = new Float64Array(169); for (var q = 0; q < 169; q++) w[q] = first ? sp.raise[q] : sp.raise[q] + sp.call[q];
      d.chartShare = rd(C.classPercent(w), 3); d.chartFirst = first;
      if (res.cls != null) d.chartIn = rd(w[res.cls], 3);
    }
    d.boardStr = C.cardsStr(d.board);
    d.heroIn = rd((e.betBefore - e.toCall) / bb, 2); // the hero's chips already in on this street, in bb
    d.bbChips = bb;
    if (res.info && res.info.hero && isAgg(did.action)) d.heroEV = res.info.hero.evBB;
    // preflop: an all-in where the chart raises small, with deep stacks
    if (e.street === 'preflop' && did.action === 'allin' && mix.some(function (m) { return m.action === 'raise'; }) && e.stackBefore / bb > 40) {
      var r = mix.filter(function (m) { return m.action === 'raise'; })[0];
      d.jamOversize = r; // the cost comes from the chip model (res.info.hero)
    }
    if (e.street === 'preflop' && res.cls != null) d.hand = C.CLASS_NAME[res.cls];
    else if (res.feat) d.hand = res.feat.hand.label;
    gradeDecision(d);
    if (e.street !== 'preflop' && opts._models) exploitView(h, seat, e, d, opts);
    applyExploit(d);
    d.text = explain(h, seat, e, d);
    d.leak = leakOf(h, seat, e, d);
    return d;
  }

  // ---------------------------------------------------------------- against this player
  // the review knows each bot's tier and style. Against an easy read (Beginner or Casual tier, or a Calling Station,
  // Maniac or Nit) the grade comes from the EV of each option when that bot plays the way it really plays; against
  // Regular, Shark and Solver the baseline grades and the second view only adds a sentence when the two disagree.
  var STYLE_WORD = { Nit: 'a nit', Rock: 'a rock', TAG: 'a tight-aggressive player', LAG: 'a loose-aggressive player', 'Calling Station': 'a calling station',
    Maniac: 'a maniac', Trappy: 'a trappy player' };
  function profileOf(h, s, opts) {
    var p = h.players[s], pr = opts.profiles && p && opts.profiles[p.id];
    if (pr && pr.tier) return pr;
    if (p && p.tier && p.style) return p;
    var seats = h.table && h.table.seats;
    if (seats) for (var k = 0; k < seats.length; k++) if (seats[k] && p && seats[k].id === p.id && seats[k].tier) return seats[k];
    return null;
  }
  function modelsFor(h, seat, opts) {
    if (!AI || !AI.model) return null;
    var m = {}, sig = [], any = false;
    h.order.forEach(function (s) {
      if (s === seat) return;
      var pr = profileOf(h, s, opts); if (!pr || !AI.TIERS[pr.tier]) return;
      m[s] = AI.model(pr); m[s].name = (pr.name || h.players[s].name || 'This player').split(' ')[0]; sig.push(s + pr.tier + pr.style); any = true;
    });
    return any ? { models: m, sig: sig.join('|') } : null;
  }
  function actKind(a) { return isAgg(a) ? 'agg' : a === 'fold' ? 'fold' : 'pass'; }
  function exploitView(h, seat, e, d, opts) {
    var M = opts._models, x = null;
    try { x = S.exploitEvs(h, seat, e.n, M.models, M.sig, isAgg(d.did.action) ? e.to : null); } catch (err) { x = null; }
    if (!x) return;
    var mdl = M.models[x.villain], ev = x.ev, did = d.did.action;
    var heroEV = isAgg(did) && x.info.hero ? x.info.hero.evBB : evOf(ev, did), best = null, bestV = null;
    for (var a in ev) if (bestV == null || ev[a] > bestV) { bestV = ev[a]; best = a; }
    if (isAgg(did) && heroEV != null && heroEV >= bestV) { bestV = heroEV; best = did; }
    if (heroEV == null || bestV == null) return;
    var loss = Math.max(0, bestV - heroEV), lossB = d.cost || 0, thr = Math.max(0.5, 0.1 * d.potBB);
    var bb = d.bestAction ? evOf(ev, d.bestAction) : null;
    var differ = Math.abs(loss - lossB) > thr || (actKind(best) !== actKind(d.bestAction || did) && bb != null && bestV - bb > thr);
    d.exploit = { ev: ev, best: best, bestEV: rd(bestV, 2), heroEV: rd(heroEV, 2), loss: rd(loss, 2), gradedBy: AI.exploitable(mdl.profile) ? 'exploit' : 'baseline',
      differ: differ, name: mdl.name, id: h.players[x.villain].id, tier: mdl.tier, style: mdl.style, traits: mdl.traits, eq: rd(x.eq, 3), eqBase: rd(x.eqBase, 3),
      info: { hero: x.info.hero || null, bet: x.info.bet || x.info.raise || null }, rangePct: x.rangePct, basePct: x.basePct };
  }
  // the exploit view grades: same thresholds, no frequency floor, Blunder only when the numbers settle it
  function applyExploit(d) {
    var x = d.exploit; if (!x) return;
    x.baseGrade = d.grade; x.baseLost = d.evLost;
    if (x.gradedBy !== 'exploit') return;
    d.grade = gradeFor(x.loss, Math.max(d.potBB, d.toCall || 0), false);
    d.evLost = d.grade === 'Good' ? 0 : x.loss; d.cost = x.loss; d.capped = null; d.evSplit = 0; d.freqFloor = false;
    d.missedBluff = d.missedBluff && d.grade !== 'Good';
    if (d.grade === 'Blunder' && d.source !== 'Solved' && d.source !== 'Library' && !settled(d)) { d.grade = 'Mistake'; d.evLost = rd(Math.min(d.evLost, thresholds(d).blunder - 0.05), 2); d.capped = 'estimate'; }
    d.bestAction = x.best;
  }
  // a plain read on the player for this spot, or '' when nothing stands out
  function readLine(d) {
    var x = d.exploit, t = x.traits, did = d.did.action, best = x.best, eq = d.feat ? d.feat.eq : 0.5, river = d.street === 'river', facing = d.toCall > 0;
    if (t.calls === 'loose' && isAgg(best) && eq >= 0.45) return 'Against a player who calls too much, bet thinner and bigger for value.';
    if (t.calls === 'loose' && (isAgg(did) || d.missedBluff) && !isAgg(best) && eq < 0.45) return 'Against a player who rarely folds, skip the bluff.';
    if (t.bluffs === 'low' && facing && best === 'fold') return 'Against a player who rarely bluffs, a' + (river ? ' river' : '') + ' fold here is fine.';
    if (t.bluffs === 'high' && facing && best === 'call') return 'Against a player who bluffs a lot, call down lighter.';
    if (t.calls === 'tight' && isAgg(best) && eq < 0.45) return 'Against a player who folds too much, bluff more.';
    return '';
  }
  function whoLine(x) {
    var st = STYLE_WORD[x.style] || 'a player', tw = x.tier === 'Beginner' ? 'a beginner' : x.tier === 'Casual' ? 'a casual player' : '';
    return x.name + ' is ' + (tw ? tw + (x.style === 'TAG' ? '' : ' and ' + st) : st) + '.';
  }
  // the sentences the exploit view adds to the review text
  function exploitText(d) {
    var x = d.exploit; if (!x) return '';
    var did = d.did.action, rl = readLine(d), out = [];
    if (x.gradedBy === 'exploit') {
      if (!x.differ && !rl) return '';
      out.push(whoLine(x)); if (rl && !(d.sizeFix && d.sizeFix.tend)) out.push(rl);
      var xb = x.info.bet, xh = x.info.hero;
      if (d.sizeFix) { /* the verdict already names the better size */ }
      else if (x.best === did && x.loss > 0.05 && xb && xh) out.push('Against ' + x.name + ', a ' + (xb.to > xh.to ? 'bigger' : 'smaller') + ' ' + (did === 'raise' ? 'raise' : 'bet') + ' scores more: about ' + bbs(x.bestEV) + ', against ' + bbs(x.heroEV) + ' for yours.');
      else if (x.best !== did && x.loss > 0.05) out.push('Against ' + x.name + ', ' + verbIng(x.best) + ' is worth about ' + bbs(x.bestEV) + ' and ' + verbIng(did) + ' about ' + bbs(x.heroEV) + '.');
      else out.push('Against ' + x.name + ', ' + verbIng(did) + ' is the best play here, worth about ' + bbs(x.heroEV) + '.');
      if (x.baseGrade !== d.grade && !d.sizeFix) out.push('Against a balanced opponent this would be ' + (x.baseGrade === 'Good' ? 'fine' : (x.baseGrade === 'Inaccuracy' ? 'an ' : 'a ') + x.baseGrade.toLowerCase()) + '. The grade follows ' + x.name + '\'s real play.');
      return out.join(' ');
    }
    if (!x.differ) return '';
    out.push(whoLine(x));
    out.push('Against ' + x.name + '\'s real play, ' + (x.best === did ? verbIng(did) + ' scores best, worth about ' + bbs(x.heroEV) + '.' : x.bestEV - x.heroEV < 0.3 ? verbIng(x.best) + ' and ' + verbIng(did) + ' score about the same.' : verbIng(x.best) + ' scores about ' + bbs(x.bestEV - x.heroEV) + ' more than ' + verbIng(did) + '.'));
    out.push('The grade still follows the baseline, because a ' + x.tier + ' player adjusts.');
    return out.join(' ');
  }

  // ---------------------------------------------------------------- reasons and the glossary
  // every concept a reason can name, with the phrases that mark it in the text (the review panel makes them tappable)
  var GLOSSARY = {
    mixed: { term: 'mixed spot', phrases: ['mixed spot'], def: 'A spot where the best strategy plays a hand more than one way. Each option the mix uses scores about the same.' },
    potOdds: { term: 'pot odds', phrases: ['pot odds'], def: 'The price of a call against the pot you can win. A call of 2bb that makes the pot 7.5bb needs to win 2 / 7.5 of the time, about 27%.' },
    mdf: { term: 'minimum defense frequency', phrases: ['minimum defense frequency'], def: 'The share of your range you must keep against a bet so that a pure bluff does not profit at once. Against a bet of B into a pot of P it is P / (P + B).' },
    rangeAdv: { term: 'range advantage', phrases: ['range advantage'], def: 'Your whole range has more equity than the opponent\'s on this board. The player with it can bet more often.' },
    nutAdv: { term: 'nut advantage', phrases: ['nut advantage'], def: 'One range holds more of the very strong hands (two pair or better). That side can bet bigger and bluff more.' },
    valueBet: { term: 'value bet', phrases: ['thin value bet', 'value bet', 'for value'], def: 'A bet you want called, because worse hands call it. A thin value bet wins only a little more than half the time when called.' },
    semiBluff: { term: 'semi-bluff', phrases: ['semi-bluff'], def: 'A bet or raise with a hand that is behind now but can improve. It wins when the opponent folds, and sometimes when called.' },
    bluff: { term: 'bluff', phrases: ['bluff', 'showdown value'], def: 'A bet with a hand that rarely wins at showdown (little showdown value). It profits only when the opponent folds often enough.' },
    protection: { term: 'protection', phrases: ['protection', 'protects'], def: 'Betting a hand that is ahead but can be outdrawn. Draws and weaker hands must pay to see the next card or fold their equity away.' },
    potControl: { term: 'pot control', phrases: ['pot control'], def: 'Checking a medium-strength hand to keep the pot small. Mostly better hands would call a bet.' },
    spr: { term: 'SPR', phrases: ['SPR'], def: 'Stack-to-pot ratio: the chips left behind divided by the pot. With a low SPR a good hand is committed to getting all in.' },
    slowPlay: { term: 'slow play', phrases: ['slow play'], def: 'Checking or calling with a strong hand instead of betting or raising. It keeps weaker hands and bluffs in the pot for later streets.' },
    checkRaise: { term: 'check-raise', phrases: ['check-raise'], def: 'Checking, then raising after the opponent bets. It builds the pot with strong hands and draws from out of position.' },
    blockers: { term: 'blockers', phrases: ['blockers', 'block'], def: 'Cards in your hand that the opponent cannot hold. Holding them makes some of their hands less likely.' },
    icm: { term: 'ICM risk premium', phrases: ['ICM risk premium', 'ICM'], def: 'In a tournament the chips you lose are worth more than the chips you win. A call needs that much extra equity on top of the pot odds.' },
    station: { term: 'calling station', phrases: ['calling station'], def: 'A player who calls far too often and rarely raises or bluffs. Bet your good hands bigger against one, and do not bluff.' },
    maniac: { term: 'maniac', phrases: ['maniac'], def: 'A player who bets, raises and bluffs far too often. Call down lighter and let the maniac bet into you.' },
    nit: { term: 'nit', phrases: ['nit'], def: 'A player who plays very few hands and rarely bluffs. When a nit bets big, believe it and fold the hands that only beat a bluff.' },
    nash: { term: 'Nash push/fold', phrases: ['Nash push/fold'], def: 'At 15bb or less, play is close to shove or fold. The Nash ranges are the shoves and calls that no opponent can exploit.' }
  };
  function handDesc(name) {
    var r = 'AKQJT98765432', a = r.indexOf(name[0]), b = r.indexOf(name[1]), s = name[2] === 's';
    if (name.length === 2) return a <= 4 ? 'a big pocket pair' : a <= 7 ? 'a middle pocket pair' : 'a small pocket pair';
    if (a <= 4 && b <= 4) return s ? 'a suited broadway hand' : 'an offsuit broadway hand';
    if (a === 0) return s ? 'a suited ace' : 'an offsuit ace';
    if (s && b - a <= 2) return b - a === 1 ? 'a suited connector' : 'a suited one-gapper';
    return s ? 'a suited hand' : 'an offsuit hand';
  }
  function actWords(m) { return m.action === 'allin' ? 'moves all in' : verb3(m.action); }
  function reasonPre(h, seat, d) {
    var out = [], K = [], f = d.factors, po = F(f, 'potOdds'), icm = F(f, 'icm'), hand = d.hand, pos = h.pos[seat], good = d.grade === 'Good';
    var did = d.did.action, kind = d.chartKind, share = d.chartShare, inside = d.chartIn >= 0.5;
    function k(x) { if (K.indexOf(x) < 0) K.push(x); }
    if (good && d.heroFreq < 0.7 && d.mix[1] && d.mix[1].freq >= GOOD_FREQ) {
      out.push('This is a mixed spot. The chart plays ' + hand + ' both ways here, and the options are close.'); k('mixed');
      return { text: out.join(' '), concepts: K };
    }
    if (!kind || kind === 'walk') return { text: '', concepts: K };
    if (kind === 'vsJam' && po) {
      out.push('The pot odds ask for ' + pc(po.need) + ' equity. ' + hand + ' has about ' + pc(po.have) + ' against the shoving range.'); k('potOdds');
      if (icm && icm.premium > 0.01) { out.push('The ICM risk premium raises the price to ' + pc(po.need + icm.premium) + '.'); k('icm'); }
      return { text: out.join(' '), concepts: K };
    }
    var desc = hand + ' (' + handDesc(hand) + ') is ' + (inside ? 'inside' : 'outside') + ' that range.';
    if (kind === 'push' || kind === 'reshove') {
      out.push('At about ' + d.depth + 'bb, the Nash push/fold range ' + (kind === 'push' ? 'from ' + pos + ' shoves' : 'against this raise re-shoves') + ' about ' + pc(share) + ' of hands. ' + desc); k('nash');
    } else if (kind === 'rfi') out.push('The chart opens about ' + pc(share) + ' of hands from ' + pos + '. ' + desc);
    else if (kind === 'bbVsLimp' || kind === 'isolate') out.push('The chart raises about ' + pc(share) + ' of hands here. ' + desc);
    else {
      out.push('The chart continues with about ' + pc(share) + ' of hands here. ' + desc);
      if (po && !good && (did === 'call' || d.bestAction === 'call')) { out.push('The pot odds ask for ' + pc(po.need) + ' equity. ' + hand + ' has about ' + pc(po.have) + ' against the raiser\'s range.'); k('potOdds'); }
    }
    return { text: out.join(' '), concepts: K };
  }
  function reasonPost(h, seat, d) {
    var out = [], K = [], f = d.factors, good = d.grade === 'Good', did = d.did.action, act = good ? did : d.mix[0] && d.mix[0].freq >= 0.5 ? d.mix[0].action : d.bestAction;
    var po = F(f, 'potOdds'), mdf = F(f, 'mdf'), na = F(f, 'nutAdv'), ra = F(f, 'rangeAdv'), dr = F(f, 'draw'), spr = F(f, 'spr'), bl = F(f, 'blocker');
    var icm = F(f, 'icm'), mw = F(f, 'multiway'), bs = F(f, 'betSize'), info = d.info || {}, bet = isAgg(did) ? (info.hero || info.bet || info.raise) : info.bet;
    var eq = d.feat ? d.feat.eq : 0, hk = d.feat ? d.feat.hand.kind : 'air', outs = dr && d.street !== 'river' ? dr.outs : 0, river = d.street === 'river';
    var checkedFirst = /after checking/.test(d.spot), prem = icm && icm.premium > 0.01 ? icm.premium : 0;
    var items = [], opp = mw ? 'the other ranges' : 'the opponent\'s';
    // each item is one or two sentences with the concepts it names; a Good play keeps only the first item
    function k(x) { var it = items[items.length - 1]; if (it && it.k.indexOf(x) < 0) it.k.push(x); }
    function say(s, x) { items.push({ s: s, k: [] }); if (x) k(x); }
    function done() {
      (good ? items.slice(0, 1) : items).forEach(function (it) { out.push(it.s); it.k.forEach(function (x) { if (K.indexOf(x) < 0) K.push(x); }); });
      return { text: out.join(' '), concepts: K };
    }
    if (good && d.heroFreq < 0.7 && d.mix[1] && d.mix[1].freq >= GOOD_FREQ) {
      say('This is a mixed spot. The baseline ' + actWords(d.mix[0]) + ' or ' + actWords(d.mix[1]) + ' here' + ((d.cost || 0) <= Math.max(0.3, 0.06 * d.potBB) ? ', and the options are close.' : '.' + (d.heroFreq < d.mix[0].freq - 0.05 ? ' Your choice is the less common one.' : '') + (d.bestAction && d.bestAction !== d.did.action ? ' The EV estimate leans toward ' + verbIng(d.bestAction) + '.' : '')), 'mixed');
      return done();
    }
    if (po) {
      var need = po.need + prem, cr = checkedFirst ? 'This check-raise' : 'This raise';
      if (act === 'fold') {
        if (prem && po.have >= po.need) say('The ICM risk premium raises the price of a call from ' + pc(po.need) + ' to ' + pc(need) + '. The hand has about ' + pc(po.have) + ' against the betting range.', 'icm');
        else if (po.have < po.need) say('The pot odds ask for ' + pc(po.need) + ' equity. The hand has only about ' + pc(po.have) + ' against the betting range.', 'potOdds');
        else say('The pot odds ask for ' + pc(po.need) + ' equity. The hand has about ' + pc(po.have) + ', but the baseline still folds it at this size.', 'potOdds');
      } else if (act === 'call') {
        if (po.have >= need) {
          say('The pot odds ask for ' + pc(need) + ' equity' + (prem ? ' with the ICM risk premium' : '') + '. The hand has about ' + pc(po.have) + ' against the betting range.', 'potOdds');
          if (prem) k('icm');
        } else if (mdf && !mw && !lowBluff(d)) say('The minimum defense frequency against this size is ' + pc(mdf.mdf) + '. The baseline keeps this hand so the bettor cannot bluff at will.', 'mdf');
        else say('The pot odds ask for ' + pc(need) + ' equity. The hand has about ' + pc(po.have) + ' against the betting range, close to the price.', 'potOdds');
        if (spr && spr.spr <= 1.5 && eq >= 0.4 && !good) say('The SPR is only about ' + spr.spr + '. With so little behind, this hand is committed.', 'spr');
      } else if (isAgg(act)) {
        if (po.have >= 0.55) { say((checkedFirst ? 'This is a check-raise for value.' : 'This raise is for value.') + ' The hand has about ' + pc(po.have) + ' against the betting range.', 'valueBet'); if (checkedFirst) k('checkRaise'); }
        else if (outs >= 8) { say(cr + ' is a semi-bluff. It can win the pot now, and the ' + dr.label + ' gives ' + outs + ' outs when called.', 'semiBluff'); if (checkedFirst) k('checkRaise'); }
        else { say('The hand has about ' + pc(po.have) + ' against the betting range. ' + cr + ' turns it into a bluff.', 'bluff'); if (checkedFirst) k('checkRaise'); }
      }
      return done();
    }
    var evc = bet && bet.eqVsCall != null ? bet.eqVsCall : null;
    // graded against one player: the win rate when called is that player's, and the text says whose it is
    var xw = d.exploit && d.exploit.gradedBy === 'exploit' && isAgg(did) ? d.exploit.info.hero || d.exploit.info.bet : null;
    var wc = xw && xw.eqVsCall != null ? xw.eqVsCall : evc, whenC = xw && xw.eqVsCall != null ? 'When ' + d.exploit.name + ' calls' : 'When called';
    function vbet(thin) { return isAgg(did) ? 'Your ' + (did === 'raise' ? 'raise' : 'bet') + ' is a ' + (thin ? 'thin ' : '') + 'value bet.' : thin ? 'Betting here is a thin value bet.' : 'Betting here is for value.'; }
    if (isAgg(act)) {
      if (eq >= 0.6) {
        if (!river && evc != null && evc < 0.5) say('A bet protects a hand with about ' + pc(eq) + ' equity. Weaker hands and draws must pay to see the next card.', 'protection');
        else if (evc != null && evc < 0.5) say('A bet takes the pot at once about ' + pc(bet.fold) + ' of the time. When called, the hand still wins about ' + pc(evc) + '.');
        else if (evc != null && evc < 0.6) say(vbet(true) + ' ' + whenC + ', the hand wins about ' + pc(wc) + ' of the time.', 'valueBet');
        else if (evc != null) say(vbet(false) + ' ' + whenC + ', the hand still wins about ' + pc(wc) + ' of the time.', 'valueBet');
        else say(vbet(false) + ' The hand has about ' + pc(eq) + ' equity against the opponent\'s range.', 'valueBet');
        if (!good && na && na.value >= 0.05) say('Your range also has the nut advantage: ' + pc(na.mine) + ' strong hands against ' + pc(na.theirs) + '.', 'nutAdv');
        if (!good && spr && spr.spr <= 1.5) say('The SPR is only about ' + spr.spr + '. With so little behind, this hand should get the money in.', 'spr');
      } else if (outs >= 8) {
        say('A bet is a semi-bluff. It can win the pot now, and the ' + dr.label + ' gives ' + outs + ' outs when called.', 'semiBluff');
      } else if (eq < 0.35) {
        say('With about ' + pc(eq) + ' equity the hand has little showdown value. Betting turns it into a bluff.', 'bluff');
        if (na && na.value >= 0.05) say('Your range holds more strong hands (' + pc(na.mine) + ' against ' + pc(na.theirs) + '). That nut advantage makes the bluff believable.', 'nutAdv');
        else if (ra && ra.value >= 0.04 && d.street === 'flop') say('Your range has about ' + pc(0.5 + ra.value) + ' equity against ' + opp + '. That range advantage lets you bet often.', 'rangeAdv');
        if (bl && river) say('Your cards also block some of the opponent\'s strong hands.', 'blockers');
      } else if (ra && ra.value >= 0.04 && d.street === 'flop') {
        say('Your range has about ' + pc(0.5 + ra.value) + ' equity against ' + opp + '. That range advantage lets you bet often, even with middling hands.', 'rangeAdv');
      } else if (evc != null && evc >= 0.5) say(vbet(true) + ' ' + whenC + ', the hand wins about ' + pc(wc) + ' of the time.', 'valueBet');
      else if (!river) say('A bet protects a hand with about ' + pc(eq) + ' equity. Weaker hands and draws must pay to see the next card.', 'protection');
      else if (bet && bet.fold != null) say('A bet wins the pot at once about ' + pc(bet.fold) + ' of the time. It works as a bluff against better hands.', 'bluff');
      return done();
    }
    // checking
    var strong = hk === 'monster' || hk === 'set' || hk === 'trips' || hk === 'twopair', lead = /lead decision/.test(d.spot);
    if (lead && ra && ra.value <= -0.03) say('The opponent\'s range has about ' + pc(0.5 - ra.value) + ' equity against yours. With the range advantage on their side, the baseline checks to them.', 'rangeAdv');
    else if (lead) say('The opponent was the last to bet or raise. The baseline checks to that player here.');
    if (mw && eq < 0.35) say('With ' + mw.players + ' players in the pot, a bluff has to get past each opponent. The baseline checks its weak hands here.', 'bluff');
    else if (outs >= 8 && eq < 0.6) say('Checking with the ' + dr.label + ' is pot control. It keeps the price of the next card low.', 'potControl');
    else if (eq >= 0.35 && evc != null && evc < 0.5) say('Checking is pot control. A bet would win only about ' + pc(evc) + ' of the time when called.', 'potControl');
    else if (eq >= 0.6) say('Checking a hand with about ' + pc(eq) + ' equity is a slow play. It keeps the opponent\'s bluffs and weaker hands in the pot.', 'slowPlay');
    else if (eq >= 0.35) say('Checking is pot control with a medium-strength hand (about ' + pc(eq) + ' equity).', 'potControl');
    else if (bet && bet.fold != null && bs) {
      var be = bs.amount / (d.potBB + bs.amount);
      if (bet.fold < be) say('A bluff here needs folds about ' + pc(be) + ' of the time. The baseline expects only about ' + pc(bet.fold) + '.', 'bluff');
      else say('The hand is weak at about ' + pc(eq) + ' equity. The baseline does not bluff with every weak hand. This one is in its checking range.', 'bluff');
    } else say('The hand has about ' + pc(eq) + ' equity, too little to bet for value.', 'valueBet');
    if (!good && na && na.value <= -0.05) say('The opponent has the nut advantage here: ' + pc(na.theirs) + ' strong hands against your ' + pc(na.mine) + '.', 'nutAdv');
    return done();
  }
  function lowBluff(d) { return !!(d.exploit && d.exploit.traits.bluffs === 'low'); }
  function reasonFor(h, seat, d) {
    var r = d.street === 'preflop' ? reasonPre(h, seat, d) : reasonPost(h, seat, d);
    d.concepts = r.concepts;
    return r.text;
  }
  // why a grade stops short of the cost the model shows, and where a frequency-only cost comes from
  function trustNote(d) {
    if (d.capped === 'bluff') return 'This grade stops at Inaccuracy. A bluff\'s value rests on how often the opponent folds, the least certain number in the estimate.';
    if (d.capped === 'estimate') return 'The cost is a rough estimate. Without a solved spot, the grade stops at Mistake.';
    return '';
  }

  // ---------------------------------------------------------------- prose
  // short sentences that end on a plain fact; only the deciding factors, with numbers
  function explain(h, seat, e, d) {
    var out = [], f = d.factors, pos = h.pos[seat], did = d.did.action, best = d.grade === 'Good' ? did : d.bestAction, mt = mixText(d.mix);
    if (d.street === 'preflop') return explainPre(h, seat, e, d, f, pos);
    var hand = d.hand, po = F(f, 'potOdds'), mdf = F(f, 'mdf'), rp = F(f, 'rangePct'), dr = F(f, 'draw'), tex = F(f, 'texture'), bs = F(f, 'betSize'), br = F(f, 'bluffRatio');
    var icm = F(f, 'icm'), mw = F(f, 'multiway'), bl = F(f, 'blocker'), na = F(f, 'nutAdv'), ra = F(f, 'rangeAdv');
    var info = d.info || {}, hero = info.hero || info.bet || info.raise;
    var top = d.mix[0] ? d.mix[0].action : did, single = !d.mix[1] || d.mix[1].freq < 0.05;
    var pref = single || d.mix[0].freq >= 0.9 ? 'The baseline ' + verb3(top) + ' here' + (d.mix[0].freq < 0.97 ? ' ' + pc(d.mix[0].freq) + ' of the time' : '') + '.' : 'The baseline prefers ' + verbIng(top) + ' here: ' + mt + '.';
    // the reason comes right after the grade word; the fact lines below skip what it already says
    var why = reasonFor(h, seat, d), K = d.concepts, has = function (x) { return K.indexOf(x) >= 0; };
    d.reason = why;
    var dup = why && why.indexOf('The baseline ' + verb3(top) + ' ') >= 0;
    var sf = d.sizeFix = sizeFix(d), sfw = sf ? sizingWhy(d, sf.frac, tex) : '';
    var head = sf ? d.grade + '. ' + cap(verbIng(sf.noun)) + ' was right. The size was too ' + (sf.bigger ? 'small' : 'big') + '. '
        + (sf.who ? sizeVs(sf)
          : 'The baseline ' + (sf.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf, 'verb')) + ' here.')
        + (d.feat ? ' ' + handLine(d.feat) : '') + (sfw ? ' ' + sfw : '') + (why ? ' ' + why : '')
      : d.evSplit ? d.grade + '. The baseline ' + verb3(top) + ' here ' + (d.mix[0].freq < 0.97 ? pc(d.mix[0].freq) + ' of the time' : 'almost always') + ', but its EV estimate rates ' + verbIng(did) + ' ' + (d.evSplit < 1 ? 'slightly' : 'about ' + bbs(d.evSplit)) + ' higher. This spot is unsettled.' + (why ? ' The case for ' + verbIng(top) + ': ' + why.charAt(0).toLowerCase() + why.slice(1) : '')
      : d.grade !== 'Good' ? d.grade + '. ' + (why ? why + (dup ? '' : ' ') : '') + (dup ? '' : pref)
      : has('mixed') ? 'Good. ' + why + ' The mix is ' + mt + '.'
      : d.heroFreq >= 0.7 ? 'Good. ' + (why ? why + ' ' : '') + cap(verbIng(did)) + ' is the baseline play.'
      : d.heroFreq >= GOOD_FREQ ? 'Good. ' + (why ? why + ' ' : '') + 'The baseline mixes here: ' + mt + '.'
      : d.exploit && d.exploit.gradedBy === 'exploit' && d.exploit.baseGrade !== 'Good' ? 'Good. ' + pref
      : 'Good. ' + pref + ' ' + cap(verbIng(did)) + ((d.cost || 0) < 0.1 ? ' scores about the same in EV.' : ' costs about ' + bbs(d.cost) + '. That is too small to count as an error.');
    out.push(head);
    var xt = exploitText(d);
    if (xt) {
      out.push(xt);
      [['station', 'calling station'], ['maniac', 'maniac'], ['nit', ' nit']].forEach(function (c) { if (xt.indexOf(c[1]) >= 0 && K.indexOf(c[0]) < 0) K.push(c[0]); });
    }
    if (d.sizeOff && !sf && d.did.size != null && !(d.exploit && d.exploit.gradedBy === 'exploit' && d.grade === 'Good')) {
      var rf = d.sizeRef ? potFrac(d, d.sizeRef) : bs ? bs.size : null, sw = rf != null ? sizingWhy(d, rf, tex) : '';
      out.push('Your ' + (did === 'raise' ? 'raise' : 'bet') + ' was ' + sizeWord(d.did.size) + '. The baseline uses ' + (rf != null ? sizeWord(rf) : 'a different size') + ' here.' + (sw ? ' ' + sw : ''));
    }
    if (mapNote(d)) out.push(mapNote(d));
    if (po) {
      out.push('The bet was ' + bbs(d.toCall) + ' into ' + bbs(d.potBB) + '.' + (has('potOdds') || has('icm') ? '' : ' A call needed ' + pc(po.need) + ' equity.'));
      var pe = why.indexOf(pc(po.have)) >= 0 ? '' : 'The hand has about ' + pc(po.have) + ' equity against the range that bets here.';
      if (!sf || pe) out.push(((sf ? '' : handLine(d.feat) + ' ') + pe).trim());
      if (icm && icm.premium > 0.01 && !has('icm')) out.push('The payouts add an ICM premium of ' + pc(icm.premium) + '. That raises the equity a call needs to ' + pc(po.need + icm.premium) + '.');
      if (lowBluff(d)) { /* the bettor rarely bluffs: defending a share of the range does not apply */ }
      else if (mdf && !mw && (did === 'fold' || best === 'fold') && mdf.mdf - mdf.defend > 0.04 && d.street !== 'river') out.push('Against this size the baseline defends ' + pc(mdf.defend) + ' of your range. ' + rankLine(rp.pct));
      else if (mdf && !mw && d.street === 'river' && (did === 'fold' || did === 'call')) out.push((has('mdf') ? '' : 'This size asks you to defend ' + pc(mdf.mdf) + ' of your range. ') + rankLine(rp.pct));
      if (dr && dr.outs >= 4 && d.street !== 'river' && why.indexOf(' outs') < 0) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs.');
      if (isAgg(did) && hero && hero.fold != null) out.push('The raise gets folds about ' + pc(hero.fold) + ' of the time.');
    } else {
      var eqs = pc(d.feat ? d.feat.eq : 0);
      // a reason that already gives the win rate when called needs no second equity number
      var pe2 = why.indexOf(eqs + ' equity') >= 0 || / wins about [^.]* of the time\./.test(why) ? '' : 'The hand has about ' + eqs + ' equity against ' + (mw ? 'the other ranges.' : 'the opponent\'s range.');
      if (!sf || pe2) out.push(((sf ? '' : handLine(d.feat) + ' ') + pe2).trim());
      if (isAgg(did) || isAgg(best)) {
        if (tex && (d.street === 'flop')) out.push('The board is ' + tex.desc + ', which counts as ' + tex.label + '.');
        if (has('nutAdv') || has('rangeAdv')) { /* the reason already names it */ }
        else if (na && Math.abs(na.value) >= 0.05 && isAgg(best)) out.push(na.value > 0 ? 'Your range has more strong hands here: ' + pc(na.mine) + ' against ' + pc(na.theirs) + '.'
          : 'The opponent\'s range has more strong hands here: ' + pc(na.theirs) + ' against your ' + pc(na.mine) + '.');
        else if (ra && Math.abs(ra.value) >= 0.04 && d.street === 'flop') out.push('Your range has ' + pc(0.5 + ra.value) + ' equity against ' + (mw ? 'the other ranges.' : 'the opponent\'s range.'));
      }
      var xg = d.exploit && d.exploit.gradedBy === 'exploit' ? d.exploit.info.hero || d.exploit.info.bet : null;
      if (xg && isAgg(did)) {
        if (d.feat && d.feat.eq < 0.35) out.push(d.exploit.name + ' folds to this bet about ' + pc(xg.fold) + ' of the time.');
        else if (xg.eqVsCall != null && why.indexOf('When ' + d.exploit.name + ' calls') < 0) out.push('When ' + d.exploit.name + ' calls, the hand wins about ' + pc(xg.eqVsCall) + '.');
      } else if (isAgg(did) && hero && hero.fold != null) {
        var bet = d.did.add / h.bb, be = bet / (d.potBB + bet);
        if (why.indexOf('needs folds') >= 0 || why.indexOf(pc(hero.eqVsCall || 0) + ' of the time') >= 0) { /* said in the reason */ }
        else if (d.feat && d.feat.eq < 0.35) out.push('As a bluff this bet needs folds ' + pc(be) + ' of the time. The baseline expects about ' + pc(hero.fold) + '.');
        else if (hero.eqVsCall != null) out.push('When called, the hand has about ' + pc(hero.eqVsCall) + ' against the calling range.');
      } else if (isAgg(best) && did === 'check' && info.bet) {
        if (why.indexOf(pc(info.bet.eqVsCall) + ' of the time') >= 0 || has('semiBluff') || has('protection')) { /* said in the reason */ }
        else if (d.feat && d.feat.eq >= 0.6 && info.bet.eqVsCall >= 0.5) out.push('A bet of ' + bbs(bs ? bs.amount : 0) + ' gets called by worse hands. It wins about ' + pc(info.bet.eqVsCall) + ' when called.');
        else if (d.feat && d.feat.eq >= 0.6) out.push('A bet of ' + bbs(bs ? bs.amount : 0) + ' makes the draws pay. It takes the pot at once about ' + pc(info.bet.fold) + ' of the time.');
        else if (dr && dr.outs >= 8) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs. Betting wins the pot now ' + pc(info.bet.fold) + ' of the time.');
        else out.push('A bet wins the pot at once about ' + pc(info.bet.fold) + ' of the time.' + (d.missedBluff && d.grade !== 'Good' && !d.capped && !d.evSplit ? ' This estimate depends on how often the opponent folds.' : ''));
      } else if (dr && dr.outs >= 8 && d.street !== 'river' && why.indexOf(' outs') < 0) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs.');
      if (bl && d.street === 'river' && isAgg(did) && d.feat.eq < 0.35 && !has('blockers')) out.push('Your cards block some of the opponent\'s strong hands.');
    }
    if (mw && why.indexOf(' players in the pot') < 0) out.push('With ' + mw.players + ' players in the pot, the baseline bets and bluffs less.');
    if (d.evLost > 0 && d.grade !== 'Good' && sf) out.push(cap(verbIng(sf.noun)) + ' ' + sizeAmt(sf, 'mine') + ' instead of ' + (sf.action === 'allin' ? 'moving all in' : sizeAmt(sf, 'cost')) + ' cost about ' + bbs(d.evLost) + ' against ' + (sf.who || 'the baseline') + '.');
    else if (d.evLost > 0 && d.grade !== 'Good' && !d.evSplit) out.push(d.exploit && d.exploit.gradedBy === 'exploit' ?cap(verbIng(did)) + ' cost about ' + bbs(d.evLost) + ' against ' + d.exploit.name + '.' : costLine(d));
    if (trustNote(d)) out.push(trustNote(d));
    return out.join(' ').replace(/about (over|under) /g, '$1 ');
  }
  // the hero bet or raised as the grade wants, at a size that cost enough to mark it down: the better size, and whose play
  // it is better against (null when the grade looks only at the baseline). Baseline grades count a size only past sizeOff's gap;
  // an exploit grade counts any size the player's real play punishes.
  function sizeFix(d) {
    var did = d.did.action, x = d.exploit, bb = d.bbChips, m = null, who = null;
    if (d.grade === 'Good' || d.street === 'preflop' || !isAgg(did) || !(d.did.to > 0) || !bb || d.evSplit) return null;
    if (x && x.gradedBy === 'exploit') { if (!isAgg(x.best) || !(x.loss > 0) || !x.info.bet) return null; m = { action: x.best, to: x.info.bet.to }; who = x.name; }
    else { if (!d.sizeOff || !(d.heroFreq >= GOOD_FREQ) || !d.sizeRef) return null; m = d.sizeRef; }
    var add = m.to / bb - (d.heroIn || 0), mine = d.did.addBB;
    if (!(m.to > 0) || !(d.pot > 0) || Math.abs(add - mine) < 0.1) return null;
    var noun = did === 'raise' || (did === 'allin' && d.toCall > 0) ? 'raise' : 'bet';
    var sf = { action: m.action, noun: noun, add: rd(add, 1), toBB: rd(m.to / bb, 1), frac: add / d.pot, mine: mine, mineTo: d.did.toBB, bigger: add > mine, who: who };
    if (who) {
      // does the baseline play the same size? its played size nearest the better one, within 15%
      var br = sizeRef(d.mix, { to: m.to }), bAdd = br ? br.to / bb - (d.heroIn || 0) : null;
      sf.baseSame = m.action === 'allin' ? !!(br && br.action === 'allin') : !!(br && br.action !== 'allin' && Math.abs(bAdd / add - 1) <= 0.15);
      sf.base = br ? { action: br.action, noun: noun, add: rd(bAdd, 1), toBB: rd(br.to / bb, 1), frac: bAdd / d.pot } : null;
      sf.baseFine = x.baseGrade === 'Good';
      // the player's tendency, when it is what makes the size better
      var t = x.traits || {};
      sf.tend = t.calls === 'loose' && sf.bigger ? 'who calls too often' : t.calls === 'tight' && !sf.bigger ? 'who folds too often' : '';
    }
    return sf;
  }
  // an exploit-graded size verdict: whether the baseline plays the same size, then what the player's real play adds
  function sizeVs(sf) {
    var who = 'Against ' + sf.who + (sf.tend ? ', ' + sf.tend + ',' : '\'s real play,'), better = sf.action === 'allin' ? 'moving all in' : 'a ' + sf.noun + ' ' + sizeAmt(sf, 'noun');
    if (sf.baseSame) return 'The baseline also ' + (sf.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf, 'verb')) + ' here. ' + who + ' the ' + (sf.action === 'allin' ? 'all in' : (sf.bigger ? 'bigger ' : 'smaller ') + sf.noun) + ' gains even more.';
    var bal = sf.baseFine ? 'Against a balanced player ' + sizeAmt(sf, 'mine').replace(/^to /, 'a raise to ') + ' is fine.'
      : sf.base ? 'The baseline ' + (sf.base.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf.base, 'verb')) + ' here.' : '';
    return (bal ? bal + ' ' : '') + who + ' ' + better + ' gains more.';
  }
  // the sizes in words. mode 'noun': "of about 6.9bb (75% pot)" / "to about 18bb"; 'verb': "about 6.9bb (75% pot)" / "to about 18bb";
  // 'cost': "about 6.9bb" / "about 18bb"; 'mine': the hero's "4.6bb" / "to 12bb"
  function sizeAmt(sf, mode) {
    var r = sf.noun === 'raise', pct = ' (' + Math.round(100 * sf.frac) + '% pot)';
    if (mode === 'mine') return r ? 'to ' + bbs(sf.mineTo) : bbs(sf.mine);
    if (mode === 'cost') return 'about ' + bbs(r ? sf.toBB : sf.add);
    return r ? 'to about ' + bbs(sf.toBB) : (mode === 'noun' ? 'of ' : '') + 'about ' + bbs(sf.add) + pct;
  }
  // the cost sentence; when the EV sketch calls two plays close, the grade comes from the baseline's frequencies instead
  function costLine(d) {
    var did = d.did.action;
    var hv = evOf(d.ev, did), bv = evOf(d.ev, d.bestAction), above = hv != null && bv != null && hv - bv > 0.3;
    if (d.freqFloor) return 'The EV estimate rates ' + verbIng(did) + (above ? ' above ' : ' about even with ') + verbIng(d.bestAction) + '. The grade comes from the baseline\'s frequency: it ' + verb3(did) + ' here ' + (d.heroFreq < 0.005 ? 'almost never' : 'only ' + pc(d.heroFreq) + ' of the time') + '.';
    return cap(verbIng(did)) + ' cost about ' + bbs(d.evLost) + ' against the baseline.';
  }
  function explainPre(h, seat, e, d, f, pos) {
    var out = [], did = d.did.action, ch = F(f, 'chart'), po = F(f, 'potOdds'), icm = F(f, 'icm'), mt = mixText(d.mix), hand = d.hand;
    var approx = ch && ch.approx ? ' This spot uses an approximate chart.' : '';
    var mixed = d.mix.length > 1 && d.mix[1].freq >= GOOD_FREQ;
    var why = reasonFor(h, seat, d), K = d.concepts, has = function (x) { return K.indexOf(x) >= 0; }, who = d.source === 'Nash' ? 'The Nash range' : 'The chart';
    d.reason = why;
    if (d.grade === 'Good') out.push('Good. ' + (has('mixed') ? why + ' The mix is ' + mt + '.'
      : why ? why + ' ' + who + ' ' + (mixed ? 'mixes it: ' + mt + '.' : chartVerb(d.mix[0]) + ' it here.')
      : mixed ? 'The chart mixes ' + hand + ' here: ' + mt + '.' : 'The chart ' + chartVerb(d.mix[0]) + ' ' + hand + ' here.') + approx);
    else out.push(d.grade + '. ' + (why ? why + ' ' : '') + 'You ' + verbPast(did) + ' ' + hand + '. ' + who + ' ' + (mixed ? 'mixes it: ' + mt : chartVerb(d.mix[0]) + ' it' + (d.mix[0].freq < 0.97 ? ' ' + pc(d.mix[0].freq) + ' of the time' : '')) + '.' + approx);
    if (d.jamOversize) out.push('Moving all in risks ' + bbs(d.stack) + ' where the chart raises to ' + bbs(d.jamOversize.toBB) + '. Better hands call the jam and worse ones fold.');
    if (po && !isAgg(did) && (ch.chart === 'vsJam' || po.toCall >= 0.25 * d.stack || d.grade !== 'Good')) {
      out.push('The call was ' + bbs(po.toCall) + ' into ' + bbs(d.potBB + po.toCall) + '.' + (has('potOdds') ? '' : ' A call needed ' + pc(po.need) + ' equity.'));
      if (!has('potOdds')) out.push(hand + ' has about ' + pc(po.have) + ' against the raiser\'s range.');
      if (did === 'call' && d.grade !== 'Good' && po.have >= po.need && ch.chart !== 'vsJam' && po.toCall < 0.5 * d.stack && !(icm && icm.premium > 0.01)) out.push('Equity alone does not make the call good. This hand wins less than its share of the pot. It often misses, and its pairs are often second best.');
    }
    if (icm && icm.premium > 0.01 && !has('icm')) out.push('The payouts add an ICM premium of ' + pc(icm.premium) + '. ' + (isAgg(did) ? 'Losing the all in costs more than the chip count shows.' : 'A call needs that much more equity than the chips alone suggest.'));
    if (d.evLost > 0) out.push('The estimated cost is ' + bbs(d.evLost) + '.');
    if (trustNote(d)) out.push(trustNote(d));
    return out.join(' ').replace(/about (over|under) /g, '$1 ');
  }
  function rankLine(pct) {
    if (pct <= 0.5) return 'Your hand is in the top ' + pc(Math.max(0.01, pct)) + ' of your range.';
    return 'About ' + pc(Math.min(0.99, pct)) + ' of your range is stronger than this hand.';
  }
  function chartVerb(m) {
    if (!m) return 'plays';
    return m.action === 'allin' ? 'moves all in with' : m.action === 'raise' ? 'raises' : m.action === 'call' ? 'calls with' : m.action === 'check' ? 'checks' : 'folds';
  }

  // ---------------------------------------------------------------- leaks
  var LEAKS = {
    overfoldCbet: 'Overfolding to c-bets', overfoldRiver: 'Overfolding to river bets', callWideBlinds: 'Calling too wide from the blinds',
    foldTooMuchPre: 'Folding too often preflop', playTooWidePre: 'Playing too many hands preflop', missedRiverValue: 'Missed value on the river',
    missedValue: 'Checking strong hands', bluffNoFE: 'Bluffing with no fold equity', passiveDraws: 'Too passive with draws', callingDown: 'Calling down too light',
    missedCbet: 'Missing c-bets', missedBluff: 'Missing bluffs',
    xMissedValue: 'Missed value against loose players', xBluffStation: 'Bluffed calling stations', xPaidOff: 'Paid off players who don\'t bluff', icmCalls: 'Ignoring ICM pressure', sizing: 'Bet sizing', overaggressive: 'Betting or raising too often', other: 'Other'
  };
  function leakOf(h, seat, e, d) {
    if (d.grade === 'Good') return null;
    var did = d.did.action, best = d.bestAction, f = d.factors, pos = h.pos[seat], dr = F(f, 'draw'), x = d.exploit;
    if (x && x.gradedBy === 'exploit') {
      var eq = d.feat ? d.feat.eq : 0.5;
      if (x.traits.calls === 'loose' && !isAgg(did) && isAgg(best) && eq >= 0.45) return 'xMissedValue';
      if (x.traits.calls === 'loose' && isAgg(did) && !isAgg(best) && eq < 0.45) return 'xBluffStation';
      if (x.traits.bluffs === 'low' && did === 'call' && best === 'fold') return 'xPaidOff';
      if (x.traits.calls === 'loose' && isAgg(did) && did === best && eq >= 0.45 && x.info.hero && x.info.bet && x.info.hero.to < x.info.bet.to) return 'xMissedValue';
    }
    if (d.sizeOff || d.jamOversize || d.sizeFix) return 'sizing';
    if (e.street === 'preflop') {
      if ((pos === 'SB' || pos === 'BB') && did === 'call') return 'callWideBlinds';
      if (F(f, 'icm') && did === 'call') return 'icmCalls';
      if (did === 'fold') return 'foldTooMuchPre';
      return 'playTooWidePre';
    }
    if (did === 'fold') { if (e.street === 'flop' && /c-bet/.test(d.spot)) return 'overfoldCbet'; if (e.street === 'river') return 'overfoldRiver'; return 'overfoldCbet'; }
    if (did === 'call' && best === 'fold') return F(f, 'icm') ? 'icmCalls' : 'callingDown';
    if (isAgg(did) && !isAgg(best)) { var info = d.info || {}, hero = info.hero || info.bet || info.raise; if (d.feat && d.feat.eq < 0.4 && hero && hero.fold < 0.45) return 'bluffNoFE'; return 'overaggressive'; }
    if (!isAgg(did) && isAgg(best)) {
      if (dr && dr.outs >= 8 && e.street !== 'river') return 'passiveDraws';
      if (d.missedBluff) return x && x.traits.calls === 'loose' ? null : 'missedBluff';
      if (e.street === 'river' && d.feat && d.feat.eq >= 0.55) return 'missedRiverValue';
      if (e.street === 'flop' && /c-bet/.test(d.spot)) return 'missedCbet';
      return 'missedValue';
    }
    return 'other';
  }

  // ---------------------------------------------------------------- recap
  function recap(h, seat, decisions, opts) {
    var tr = S.advance(S.tracker(h)), shows = {}, out = { showdown: false, villains: [], lines: [] };
    h.log.forEach(function (e) { if (e.ev === 'show') shows[e.seat] = e; });
    out.showdown = Object.keys(shows).length > 0;
    var others = h.order.filter(function (s) { return s !== seat; });
    // the main villain: the last opponent still in, or the last one to act against the hero
    var inHand = others.filter(function (s) { return !h.players[s].folded; }), main = inHand.length ? inHand : [];
    if (!main.length) { var last = null; h.log.forEach(function (e) { if (e.ev === 'act' && e.seat !== seat && e.type !== 'fold' && (e.type !== 'check' || e.street !== 'preflop')) last = e.seat; }); if (last != null) main = [last]; }
    main.forEach(function (s) {
      var p = h.players[s], snaps = tr.snaps[s] || {}, v = { seat: s, name: p.name, id: p.id, pos: h.pos[s], shown: !!shows[s], cards: shows[s] ? C.cardsStr(shows[s].cards) : null,
        made: shows[s] ? shows[s].name : null, range: {} };
      ['preflop', 'flop', 'turn', 'river'].forEach(function (st) { if (snaps[st] != null) v.range[st] = snaps[st]; });
      var parts = [], stl = ['preflop', 'flop', 'turn', 'river'].filter(function (st) { return v.range[st] != null; });
      stl.forEach(function (st) { parts.push(st + ' ' + rd(v.range[st], 1) + '%'); });
      v.rangeText = parts.length ? p.name + '\'s range by street, as a share of all hands: ' + parts.join(', ') + '.' : '';
      var notes = (opts.notes || h.botNotes || []).filter(function (x) { return x.seat === s; });
      if (notes.length) { var key = notes.filter(function (x) { return x.type !== 'check' && x.type !== 'fold' && x.street !== 'preflop'; }).pop() || notes[notes.length - 1]; v.thinking = 'What ' + p.name + ' was thinking: ' + String(v.shown || !key.vague ? key.reason : key.vague).trim(); }
      if (v.shown) {
        var hs = shows[seat];
        v.showText = p.name + ' showed ' + v.cards + ' (' + v.made + ').' + (hs ? ' You showed ' + C.cardsStr(hs.cards) + ' (' + hs.name + ').' : '');
      }
      out.villains.push(v);
    });
    out.lines = [];
    out.villains.forEach(function (v) { if (v.showText) out.lines.push(v.showText); if (v.rangeText) out.lines.push(v.rangeText); if (v.thinking) out.lines.push(v.thinking); });
    return out;
  }
  function lc(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  // ---------------------------------------------------------------- hand review
  function hand(h, seat, opts) {
    opts = opts || {};
    var q = S.quality(); S.setQuality(opts.quality || 'review');
    var t0 = Date.now(), decisions = [];
    opts = Object.assign({}, opts); opts._models = opts.exploit === false ? null : modelsFor(h, seat, opts);
    try {
      h.log.forEach(function (e, i) {
        if (e.ev !== 'act' || e.seat !== seat) return;
        if (e.n == null) e.n = i;
        decisions.push(buildDecision(h, seat, e, opts));
      });
      var rc = recap(h, seat, decisions, opts);
    } finally { S.setQuality(q); }
    var p = h.players[seat], net = (p.stack - p.stackStart) / h.bb, lost = 0, worst = 'Good';
    decisions.forEach(function (d) { lost += d.evLost; if (GRADES.indexOf(d.grade) > GRADES.indexOf(worst)) worst = d.grade; });
    var rv = { handId: h.id, mode: h.table ? h.table.mode : 'cash', bb: h.bb, heroSeat: seat, heroPos: h.pos[seat], heroCards: C.cardsStr(p.hole), board: C.cardsStr(h.board),
      net: rd(net, 2), decisions: decisions, evLost: rd(lost, 2), worst: worst, clean: worst === 'Good', recap: rc, ms: Date.now() - t0, solved: 0 };
    rv.upgrade = function (onChange) { return upgrade(h, seat, rv, onChange); };
    return rv;
  }
  // after an upgrade the Estimate's bet size and its fold and equity numbers can be stale; when the new mix's main
  // bet size differs, re-run the Estimate at that size for the 'A bet of ...' lines (only for checks and calls)
  function refreshBet(h, seat, d) {
    if (isAgg(d.did.action) || !d.factors) return;
    var top = null; d.mix.forEach(function (m) { if (isAgg(m.action) && m.to > 0 && (!top || m.freq > top.freq)) top = m; });
    var bs = F(d.factors, 'betSize'); if (!top || !bs || !(bs.amount > 0)) return;
    var add = top.to / h.bb - (d.heroIn || 0); if (!(add > 0) || Math.abs(Math.log(add / bs.amount)) < Math.log(1.15)) return;
    var q = S.quality(), res = null; S.setQuality('review');
    try { res = S.evaluate(h, seat, { n: d.n, heroTo: top.to }); } catch (err) { res = null; } finally { S.setQuality(q); }
    var b = res && res.info ? (res.info.hero || res.info.bet) : null; if (!b) return;
    d.info = Object.assign({}, d.info || {}, { bet: b });
    d.factors = d.factors.map(function (f) { return f.kind === 'betSize' ? { kind: 'betSize', size: rd(potFrac(d, top), 2), amount: rd(add, 1), jam: top.action === 'allin' } : f; });
  }
  // ask the solver provider about each postflop heads-up decision; regrade and re-explain the ones it answers
  function upgrade(h, seat, rv, onChange) {
    if (!S.hasSolver()) return Promise.resolve(rv);
    var jobs = rv.decisions.map(function (d, k) {
      if (d.street === 'preflop') return Promise.resolve(null);
      return S.askSolver(h, seat, d.n).then(function (r) {
        if (!r) return null;
        var bb = h.bb, e = h.log[d.n];
        var est = d.estimate = { mix: d.mix, ev: d.ev, grade: d.grade, evLost: d.evLost, text: d.text, heroEV: d.heroEV, info: d.info, factors: d.factors };
        d.mix = r.mix.map(function (m) { var o = { action: m.action, size: m.size, to: m.to || 0, freq: m.freq }; if (isAgg(o.action)) o.sizeLabel = m.size != null ? sizeWord(m.size) : ''; return o; }).sort(function (a, b) { return b.freq - a.freq; });
        d.ev = r.ev || {}; d.source = r.source || 'Solved'; d.heroEV = r.heroEV != null ? r.heroEV : null;
        d.heroMap = r.heroMap || null; d.forcedAllin = r.forcedAllin || null;
        // a size too far from the solved ones: keep the Estimate's cost for the size on top of the nearest solved size
        if (d.heroEV == null && d.heroMap && d.heroMap.mode === 'estimate' && d.heroMap.nearV != null && est.heroEV != null) {
          var e0 = evOf(est.ev, d.did.action); if (e0 != null) d.heroEV = rd(d.heroMap.nearV + est.heroEV - e0, 2);
        }
        refreshBet(h, seat, d);
        gradeDecision(d); applyExploit(d); d.text = explain(h, seat, e, d); d.leak = leakOf(h, seat, e, d);
        rv.solved++;
        if (onChange) try { onChange(k, d, rv); } catch (err) {}
        return d;
      });
    });
    return Promise.all(jobs).then(function () {
      var lost = 0, worst = 'Good'; rv.decisions.forEach(function (d) { lost += d.evLost; if (GRADES.indexOf(d.grade) > GRADES.indexOf(worst)) worst = d.grade; });
      rv.evLost = rd(lost, 2); rv.worst = worst; rv.clean = worst === 'Good';
      return rv;
    });
  }

  // ---------------------------------------------------------------- session
  function session(reviews) {
    var s = { hands: reviews.length, net: 0, evLost: 0, decisions: 0, grades: { Good: 0, Inaccuracy: 0, Mistake: 0, Blunder: 0 }, clean: 0, leaks: [], exploitLeaks: [] }, L = {};
    reviews.forEach(function (rv) {
      s.net += rv.net; s.evLost += rv.evLost; if (rv.clean) s.clean++;
      rv.decisions.forEach(function (d) {
        s.decisions++; s.grades[d.grade]++;
        if (d.leak) { var x = L[d.leak] || (L[d.leak] = { key: d.leak, label: LEAKS[d.leak], count: 0, evLost: 0, examples: [] }); x.count++; x.evLost += d.evLost; if (x.examples.length < 3) x.examples.push(rv.handId); }
      });
    });
    s.net = rd(s.net, 1); s.evLost = rd(s.evLost, 1);
    s.netPer100 = s.hands ? rd(100 * s.net / s.hands, 1) : 0; s.evLostPer100 = s.hands ? rd(100 * s.evLost / s.hands, 1) : 0;
    for (var k in L) { L[k].evLost = rd(L[k].evLost, 1); (k.charAt(0) === 'x' ? s.exploitLeaks : s.leaks).push(L[k]); }
    s.leaks.sort(function (a, b) { return b.evLost - a.evLost; }); s.exploitLeaks.sort(function (a, b) { return b.evLost - a.evLost; });
    s.leaks.concat(s.exploitLeaks).forEach(function (x) { x.text = x.label + ': ' + x.count + ' decision' + (x.count > 1 ? 's' : '') + ', about ' + bbs(x.evLost) + ' lost.'; });
    return s;
  }

  // a plain-text rendering, for tools and for copy-paste
  function toText(rv) {
    var out = [];
    out.push('Hand ' + rv.handId + ' (' + rv.mode + '), you in ' + rv.heroPos + ' with ' + rv.heroCards + (rv.board ? ', board ' + rv.board : '') + '. Result ' + (rv.net >= 0 ? '+' : '') + bbs(rv.net) + '.' + (rv.clean ? ' Clean hand.' : ''));
    rv.decisions.forEach(function (d) {
      var did = (d.did.action === 'allin' ? 'all in' : d.did.action) + (isAgg(d.did.action) ? ' ' + (d.street === 'preflop' ? 'to ' + bbs(d.did.toBB) : bbs(d.did.addBB)) : '');
      out.push('  [' + d.grade + (d.evLost ? ', -' + bbs(d.evLost) : '') + '] ' + d.spot + (d.boardStr ? ' on ' + d.boardStr : '') + '. Pot ' + bbs(d.pot) + (d.toCall ? ', ' + bbs(d.toCall) + ' to call' : '') + '. You: ' + did + '. (' + d.source + ')');
      out.push('    ' + d.text);
    });
    rv.recap.lines.forEach(function (l) { out.push('  ' + l); });
    return out.join('\n');
  }

  return { hand: hand, session: session, toText: toText, gradeFor: gradeFor, GRADES: GRADES, LEAKS: LEAKS, GOOD_FREQ: GOOD_FREQ, mixPct: mixPct, GLOSSARY: GLOSSARY, grade: gradeDecision };
});
