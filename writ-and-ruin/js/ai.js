/* Writ & Ruin: the rival houses. One-step lookahead weighted by temperament.
 * UMD: window.WR_AI in the browser (needs WR_DATA and WR_ENGINE first), require('./ai.js') in node.
 *
 *   decide(age, house)      the next action for that house (any house, the player's seat included)
 *   whoActs(age)            the house that must act now (pending answer, prophecy choice, or the turn)
 *   run(age, opts)          plays AI houses until a human must act or the age ends; returns events
 *   respond(age)            answer the pending pact offer for its AI target
 *   reckoningChoice(campaign)  the winner's choice for the current Reckoning step
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./engine.js'));
  else root.WR_AI = factory(root.WR_DATA, root.WR_ENGINE);
})(typeof self !== 'undefined' ? self : this, function (D, E) {
  'use strict';

  var IDS = D.REGION_IDS, REG = D.REGION, CARDS = D.CARDS, N = D.NUM;

  // ---------------------------------------------------------------- temperaments
  // win: weight on each way of winning; suit: liking for each suit; poach: liking for taking residents from other houses' regions;
  // other knobs as named
  var T = {
    warlord: { win: { seize: 10, foretell: 5, depart: 2, seat: 6 }, suit: { Order: 1, Wild: 0.5 }, bands: 0.75, silver: 0.2, risk: 0.35, breakCost: 2.5, fight: 0.6, search: 0.6, truce: -1, threatW: 12, poach: 0.2 },
    mystic: { win: { seize: 4, foretell: 10, depart: 4, seat: 4 }, suit: { Lore: 1.4 }, bands: 0.55, silver: 0.25, risk: 0.5, breakCost: 3, fight: 0, search: 1.6, truce: 0.8, threatW: 12, poach: 0.1 },
    wanderer: { win: { seize: 3, foretell: 5, depart: 10, seat: 3 }, suit: { Wild: 0.4, Lore: 0.4 }, bands: 0.55, silver: 0.25, risk: 0.6, breakCost: 3, fight: -0.4, search: 1.4, truce: 0.8, threatW: 10, poach: 0 },
    steward: { win: { seize: 5, foretell: 5, depart: 2, seat: 10 }, suit: { Order: 0.7, Hearth: 0.7 }, bands: 0.7, silver: 0.25, risk: 0.8, breakCost: 4, fight: 0, search: 0.5, truce: 1.2, threatW: 12, poach: -0.6 },
    schemer: { win: { seize: 6, foretell: 7, depart: 5, seat: 6 }, suit: { Shade: 1 }, bands: 0.55, silver: 0.35, risk: 0.5, breakCost: 0.6, fight: 0.1, search: 0.9, truce: 1, threatW: 12, poach: 0.9 },
    wild: { win: { seize: 7, foretell: 7, depart: 4, seat: 4 }, suit: { Wild: 1.4 }, bands: 0.6, silver: 0.2, risk: 0.4, breakCost: 2, fight: 0.4, search: 0.8, truce: -0.5, threatW: 11, poach: 0.6, folk: 0.8, weakest: 0.5 },
    player: { win: { seize: 7, foretell: 7, depart: 6, seat: 7 }, suit: {}, bands: 0.6, silver: 0.25, risk: 0.5, breakCost: 2, fight: 0.2, search: 1, truce: 0.5, threatW: 12, poach: 0.3 }
  };
  // the move a rival shows is the only one that may touch the player's regions, so rivals lean toward the player:
  // player: a bonus on a shown assault or march into a player region;
  // threat: how much more a rival fears the player's progress than another rival's.
  // Tune both with the sim's player-seat win rate (target 25-30%).
  var AIM = { player: 4, threat: 2 };
  // poaching: grudge, the cost of the grudge the holder takes (more if it already holds one)
  var POACH = { grudge: 0.4 };
  function tem(s, h) { var hs = s.houses[h]; return T[hs.temper || 'player']; }
  function temperOf(c, h) { return c.houses[h].temperament; }

  // ---------------------------------------------------------------- the value of a position to house h
  function cardValue(t, id) {
    var c = CARDS[id];
    if (c.relic) return 1;
    return 0.6 + c.cost * 0.15 + (t.suit[c.suit] || 0);
  }
  function regionWorth(s, r) {
    return 1 + (E.siteOn(s, r) ? REG[r].siteIncome * 0.4 + (REG[r].landmark ? 0 : 0.3) : 0) + (r === 'crown' ? 1 : 0);
  }
  // ---------------------------------------------------------------- structures
  // what a built structure is worth each turn to whoever holds it (in evaluate's units), before temperament
  var STRUCT = { saltmarsh: 0.5, riverford: 0.35, ashwood: 0.22, highpasture: 0.16, stonefields: 0.14, oldbarrow: 0.14 };
  // how much each temperament likes each structure: income for the greedy, the Kilns for musterers, and so on
  var STRUCT_LIKE = {
    warlord: { ashwood: 1.5, highpasture: 1.2, saltmarsh: 0.9, stonefields: 0.6, oldbarrow: 0.6 },
    mystic: { stonefields: 1.6, oldbarrow: 1.3, ashwood: 0.7, highpasture: 0.7 },
    wanderer: { highpasture: 1.6, oldbarrow: 1.5, stonefields: 1.2, ashwood: 0.6 },
    steward: { saltmarsh: 1.3, riverford: 1.2, ashwood: 1.3, stonefields: 0.7, oldbarrow: 0.7 },
    schemer: { saltmarsh: 1.4, riverford: 1.4, ashwood: 0.8 },
    wild: { oldbarrow: 1.3, highpasture: 1.2, saltmarsh: 0.9 },
    player: {}
  };
  // a held structure as part of a position (its income is already counted in evaluate)
  function structWorth(s, h, t, r) {
    var per = STRUCT[r] || 0;
    if (r === 'stonefields' || r === 'oldbarrow') per *= 0.5 + 0.5 * t.search;
    return (per + 0.15) * ((STRUCT_LIKE[s.houses[h].temper] || {})[r] || 1) * BUILD.held;
  }
  // what building pays back over the rounds left in the age
  function buildPayback(s, h, t, r) {
    var left = Math.max(0, N.lastRound - (s.planRound || s.round));
    return structWorth(s, h, t, r) / BUILD.held * left * BUILD.payback;
  }
  // tuning: held scales a standing structure in a position; payback scales its worth per round left when building
  var BUILD = { held: 0.8, payback: 1.6 };
  // biggest force another house could bring against region r next turn
  function pressure(s, h, r) {
    var best = 0, by = {};
    REG[r].adj.forEach(function (n) {
      var b = s.regions[n].bands;
      for (var k in b) if (k !== h && b[k] > 0) by[k] = (by[k] || 0) + b[k];
    });
    for (var k in by) if (by[k] > best) best = by[k];
    return best;
  }
  function wins(p) { return p.seize >= 1 || p.foretell >= 1; }

  // ---------------------------------------------------------------- claims: how close, how soon, how safe
  var DOOM = 45;      // a rival's win at the start of its next turn, if nothing stops it
  var OWN = 30;       // our own claim standing at the start of our next turn
  var SEATW = 0.6;   // the Crown holder's stake in keeping it as the age's end nears
  // chance of winning a battle at (attack - defence) before the fortune cards
  var PWIN = (function () {
    var out = {};
    for (var d = -4; d <= 4; d++) {
      var p = 0;
      N.fortune.forEach(function (a) { N.fortune.forEach(function (b) { if (d + a - b > 0) p++; }); });
      out[d] = p / (N.fortune.length * N.fortune.length);
    }
    return out;
  })();
  function pWin(d) { return d < -4 ? 0 : d > 4 ? 1 : PWIN[d]; }
  // the round in which house o next starts a turn
  function nextTurnRound(s, o) { return s.order.indexOf(o) > s.turn ? s.round : s.round + 1; }
  // turns (any house's) until house o next starts a turn
  function turnsUntil(s, o) {
    var i = s.order.indexOf(o);
    if (i > s.turn) return i - s.turn;
    var next = N.rotate ? s.order.slice(1).concat(s.order[0]) : s.order;
    return s.order.length - s.turn + next.indexOf(o);
  }
  // chance the age ends after round r, if it gets there
  function endChanceAt(s, r) {
    if (r >= N.lastRound) return 1;
    var c = 0;
    if (E.law(s, 'shortReign') && N.shortReign.round === r) return 1 / N.shortReign.of;
    N.endDraws.forEach(function (d) { if (d.round === r) c = 1 / d.of; });
    return c;
  }
  // the houses that start a turn from now until house o next does (o excluded)
  function movesBefore(s, o) {
    var out = s.order.slice(s.turn + 1), i = s.order.indexOf(o);
    if (i > s.turn) return s.order.slice(s.turn + 1, i);
    var next = N.rotate ? s.order.slice(1).concat(s.order[0]) : s.order;
    return out.concat(next.slice(0, next.indexOf(o))).filter(function (k) { return k !== o; });
  }
  function urgencyAt(s, r) {
    var alive = 1;
    for (var x = s.round; x < r; x++) alive *= 1 - endChanceAt(s, x);
    if (r >= N.claimFrom) return alive;
    return Math.max(0, 0.45 - 0.2 * (N.claimFrom - 1 - r)) * alive;
  }
  // how surely a claim that stands now wins at the start of a later turn of o (0..1)
  function claimUrgency(s, o, kind) {
    var r = nextTurnRound(s, o);
    if (kind === 'depart') r -= Math.max(0, N.departFrom - N.claimFrom);   // the Waystone opens later
    else {
      var cs = E.claimStanding(s, o), before = movesBefore(s, o);
      if (cs && cs.waiting.some(function (k) { return before.indexOf(k) < 0; })) r++;   // must stand one more turn
    }
    return urgencyAt(s, r);
  }
  // how likely the age ends with the Crown holder keeping the Seat soon
  function seatUrgency(s) {
    // chance the age ends at the close of this round or the next two, discounted
    var left = 1, u = 0, w = 1;
    for (var r = s.round; r <= Math.min(N.lastRound, s.round + 2); r++) {
      var e = endChanceAt(s, r); u += w * left * e; left *= 1 - e; w *= 0.55;
    }
    return Math.min(1, u);
  }
  function departReady(s, o) {
    if (!E.siteOn(s, 'farpass') || !E.holds(s, o, 'farpass')) return false;
    var dn = E.departNeeds(s, o);
    return E.bandsAt(s, o, 'farpass') >= dn.bands && s.houses[o].relics.length >= dn.relics && E.hoursFor(s, o) >= 3;
  }
  // what h can see of o's prophecy: the ids o might hold (not h's own two), unless h has learned it
  function suspects(s, h, o) {
    var hs = s.houses[h], po = s.houses[o].prophecy;
    if (!po) return [];
    if (hs.known && hs.known[o]) return [po];
    var mine = hs.prophecyOptions || [];
    return D.PROPHECIES.map(function (p) { return p.id; }).filter(function (id) { return mine.indexOf(id) < 0; });
  }
  // chance, as h sees it, that o's prophecy is met now (truth when known; else the share of suspects met)
  var GUESS = null;   // { o: number of suspects met before h's action }, set while h weighs its actions
  function foretellSeen(s, h, o) {
    var sus = suspects(s, h, o);
    if (sus.length <= 1) return E.prophecyProgress(s, o, s.houses[o].prophecy).met ? 1 : 0;
    var met = sus.filter(function (id) { return E.prophecyProgress(s, o, id).met; }).length;
    if (!E.prophecyProgress(s, o, s.houses[o].prophecy).met) {
      // the shown progress dropped below full, which everyone can see
      return 0;
    }
    var before = GUESS && GUESS.h === h ? GUESS.m[o] : null;
    return before ? Math.min(1, met / before) : 1;
  }
  function setGuess(s, h) {
    GUESS = { h: h, m: {} };
    s.order.forEach(function (o) {
      if (o === h || !s.houses[o].prophecy) return;
      GUESS.m[o] = suspects(s, h, o).filter(function (id) { return E.prophecyProgress(s, o, id).met; }).length;
    });
  }
  // chance (as h sees it) that o has a claim standing now, and of which kind
  function standingSeen(s, h, o) {
    if (E.nHeld(s, o) >= N.seizeRegions) return { kind: 'seize', p: 1 };
    var f = s.houses[o].prophecy ? foretellSeen(s, h, o) : 0;
    if (f > 0) return { kind: 'foretell', p: f };
    if (departReady(s, o)) return { kind: 'depart', p: 1 };
    return null;
  }
  // regions of o whose capture would break its standing claim, as h sees it (a battle won takes a relic)
  function criticalRegions(s, h, o) {
    var st = standingSeen(s, h, o), out = [];
    if (!st) return out;
    var hs = s.houses[o], fence = E.has(s, o, 'fence'), keep = GUESS;
    if (h !== o) { GUESS = { h: h, m: {} }; GUESS.m[o] = GUESS_BASE(s, h, o); }
    E.heldBy(s, o).forEach(function (r) {
      var g = s.regions[r], bands = g.bands[o], rel = null;
      g.owner = '_'; delete g.bands[o];
      if (hs.relics.length && !fence) rel = hs.relics.pop();
      var after = h === o ? (E.checkVictory(s, o) || departReady(s, o)) : standingSeen(s, h, o);
      if (!after || (after.p != null && after.p < 1)) out.push(r);
      g.owner = o; if (bands) g.bands[o] = bands;
      if (rel) hs.relics.push(rel);
    });
    GUESS = keep;
    return out;
  }
  function GUESS_BASE(s, h, o) { return suspects(s, h, o).filter(function (id) { return E.prophecyProgress(s, o, id).met; }).length; }
  // chance that some rival takes one of these regions from h before h's next turn
  function holdRisk(s, h, regs) {
    var keep = 1;
    regs.forEach(function (r) {
      var pr = pressure(s, h, r);
      if (pr > 0) keep *= 1 - pWin(pr + 1 - E.defenceOf(s, r, null));
    });
    return 1 - keep;
  }
  // the best chance h has of taking one of these regions on its next turn, from where its warbands stand
  function reach(s, h, regs) {
    var best = 0;
    regs.forEach(function (r) {
      var n = 0;
      REG[r].adj.forEach(function (x) { if (s.regions[x].owner === h) n += E.bandsAt(s, h, x); });
      if (n > 0) best = Math.max(best, pWin(n + 1 - E.defenceOf(s, r, null)));
    });
    return best;
  }
  // rival wins near enough to stop now, as h sees them: [{house, kind, urgency, regions}]
  function dangers(s, h) {
    var out = [];
    s.order.forEach(function (o) {
      if (o === h) return;
      var st = standingSeen(s, h, o);
      if (st) {
        var u = claimUrgency(s, o, st.kind) * st.p;
        if (u > 0) out.push({ house: o, kind: st.kind, urgency: u, regions: criticalRegions(s, h, o) });
      }
      if (s.regions.crown.owner === o) {
        var su = seatUrgency(s);
        if (su > 0) out.push({ house: o, kind: 'seat', urgency: su, regions: ['crown'] });
      }
    });
    return out;
  }

  function evaluate(s, h) {
    if (s.phase === 'over') return s.winner === h ? 1000 : -200;
    // holding the seize count at the end of our own turn wins
    if (s.round >= N.claimFrom && s.order[s.turn] === h && E.nHeld(s, h) >= N.seizeRegions) return 900;
    var t = tem(s, h), hs = s.houses[h], v = 0;
    var p = E.progress(s, h);
    // progress toward winning; squares reward getting close
    v += t.win.seize * p.seize * p.seize * 3 + t.win.foretell * p.foretell * p.foretell * 3 +
      t.win.depart * p.depart * p.depart * 3 + t.win.seat * p.seat * p.seat * 3;
    var held = E.heldBy(s, h);
    // our own claim: worth more the sooner it can win, less the more exposed its regions are
    if (E.checkVictory(s, h) || departReady(s, h)) {
      var crit = criticalRegions(s, h, h);
      v += (8 + OWN * claimUrgency(s, h, E.checkVictory(s, h) || 'depart')) * (1 - 0.8 * holdRisk(s, h, crit));
    }
    if (s.regions.crown.owner === h) v += SEATW * OWN * seatUrgency(s) * (1 - 0.8 * holdRisk(s, h, ['crown']));
    // threat: the leader among the others, then everyone else a little, more as the claims open
    var lead = 0, sum = 0, phase = 0.6 + 0.4 * Math.min(1, s.round / (N.claimFrom - 1));
    s.order.forEach(function (o) {
      if (o === h) return;
      var q = E.progress(s, o), m = Math.max(q.seize, q.foretell, q.depart * 0.9, q.seat);
      if (wins(q)) m = 1.25;
      if (o === 'player') m *= AIM.threat;
      sum += m; if (m > lead) lead = m;
    });
    v -= phase * (t.threatW * lead * lead * lead + 1.5 * sum);
    // a rival's win that stands now and comes before anything else can stop it
    var doom = 0;
    dangers(s, h).forEach(function (d) { doom += d.urgency * (1 - 0.6 * reach(s, h, d.regions)); });
    v -= DOOM * Math.min(1.2, doom);
    // material
    var bands = E.totalBands(s, h) - (hs.camp || 0);   // the camp breaks up at the end of the turn
    v += bands * t.bands + Math.min(hs.silver, 10) * t.silver + Math.max(0, hs.silver - 10) * 0.05;
    v += E.income(s, h) * 0.35 + held.length * 0.6;
    held.forEach(function (r) { if (!REG[r].landmark && E.siteOn(s, r)) v += structWorth(s, h, t, r); });
    v -= E.upkeep(s, h, bands) * t.silver * 2;   // upkeep owed over the next turns or so
    hs.retinue.forEach(function (c) { v += cardValue(t, c); });
    v += hs.relics.length * 0.6;
    // exposure of what we hold
    held.forEach(function (r) {
      var pr = pressure(s, h, r);
      if (!pr) return;
      if (!E.bandsAt(s, h, r)) { v -= (0.6 + t.risk) * regionWorth(s, r) * 1.2; return; }
      var gap = pr + 1 - E.defenceOf(s, r, null);
      if (gap > 0) v -= t.risk * Math.min(gap, 4) * regionWorth(s, r) * 0.6;
    });
    return v;
  }

  // ---------------------------------------------------------------- fortune odds
  var CARD_P = (function () {
    var c = {}; N.fortune.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
    var out = []; for (var k in c) out.push({ v: +k, p: c[k] / N.fortune.length });
    return out;
  })();
  // distribution of (attacker card - defender card) and the representative outcomes
  function odds(s, a) {
    var pv = E.battlePreview(s, a), base = pv.attack - pv.defence, h = a.house;
    var tide = E.has(s, h, 'tideReader') && !s.houses[h].flags.tide;
    var acs = pv.peek != null ? [{ v: pv.peek, p: 1 }] : CARD_P;
    if (tide && pv.peek == null) {
      var m = {};
      CARD_P.forEach(function (x) { CARD_P.forEach(function (y) { var k = Math.max(x.v, y.v); m[k] = (m[k] || 0) + x.p * y.p; }); });
      acs = []; for (var k in m) acs.push({ v: +k, p: m[k] });
    }
    var pw = 0, wd = 0, ld = 0;
    acs.forEach(function (x) {
      CARD_P.forEach(function (y) {
        var d = base + x.v - y.v, pr = x.p * y.p;
        if (d > 0) { pw += pr; wd += pr * d; } else { ld += pr * (-d); }
      });
    });
    return { p: pw, winDiff: pw > 0 ? Math.max(1, Math.round(wd / pw)) : 1, loseDiff: pw < 1 ? Math.round(ld / (1 - pw)) : 0, base: base };
  }

  // ---------------------------------------------------------------- candidates
  function tryApply(s, a) {
    var c = E.clone(s);
    c._sim = true;
    E.applyAction(c, a);
    return c;
  }
  function actionValue(s, h, a, base) {
    var t = tem(s, h), v, c;
    if (a.type === 'depart') return 5000;
    if (a.type === 'search') {
      c = E.clone(s);
      var hs = c.houses[h];
      if (E.has(c, h, 'mothClerk') && !hs.flags.moth) hs.flags.moth = true; else hs.hours -= 1;
      hs.silver -= E.searchSilver(c, h);
      v = evaluate(c, h) + searchBonus(s, h, a.region, t);
      return v;
    }
    if (a.type === 'assault') {
      var o = odds(s, a), d = s.regions[a.to].owner;
      var w = E.clone(a); w._cards = [o.winDiff - o.base, 0];
      var l = E.clone(a); l._cards = [-o.loseDiff - o.base, 0];
      var vw = o.p > 0 ? evaluate(tryApply(s, w), h) : 0;
      var vl = o.p < 1 ? evaluate(tryApply(s, l), h) : 0;
      v = o.p * vw + (1 - o.p) * vl;
      v += t.fight * o.p;
      if (d) {
        v += 0.35 * E.grudge(s, h, d);
        var broken = E.pactsBrokenBy(s, h, d).length;
        if (broken) v -= broken * (t.breakCost + (s.houses[h].broke ? 0.5 : 0)) + (E.has(s, h, 'forger') ? -t.breakCost * 0.6 : 0);
        if (t.weakest && isWeakest(s, d)) v += t.weakest;
      } else if (t.folk) v += t.folk * o.p;
      return v;
    }
    c = tryApply(s, a);
    if (c.pending && c.pending.type === 'search') c.pending = null;
    // a structure pays only while the region stays held: discount it by how exposed the region is
    if (a.type === 'build') {
      var gap = pressure(s, h, a.region) + 1 - E.defenceOf(s, a.region, null);
      return evaluate(c, h) + buildPayback(s, h, t, a.region) * (gap > 0 ? Math.max(0, 1 - gap * 0.3) : 1);
    }
    // stationing keeps the resident working for the region's holder and frees a retinue place
    if (a.type === 'station') {
      var full = s.houses[h].retinue.length >= N.retinueMax, sg = pressure(s, h, a.region) + 1 - E.defenceOf(s, a.region, null);
      return evaluate(c, h) + cardValue(t, a.card) * (sg > 0 ? 0.4 : 0.8) + (full ? 0.3 + 0.4 * t.search : -0.3);
    }
    // poaching: what the holder loses, weighed by temperament, against the grudge it earns
    if (a.type === 'recruit') {
      var pv = E.poachFrom(s, h, a.region);
      if (pv) {
        var lossW = pv === 'player' ? AIM.threat * 0.5 : 0.5;
        return evaluate(c, h) + t.poach * (1 + lossW * cardValue(tem(s, pv), a.card)) + 0.35 * E.grudge(s, h, pv) - POACH.grudge * (1 + E.grudge(s, pv, h) * 0.3);
      }
    }
    // never muster into an upkeep next turn's silver cannot pay
    if (a.type === 'muster' && E.upkeep(c, h) > E.upkeep(s, h) &&
        c.houses[h].silver + E.income(c, h) < E.upkeep(c, h)) return -1e4;
    return evaluate(c, h);
  }
  function isWeakest(s, d) {
    var w = null;
    s.order.forEach(function (k) { if (!w || E.totalBands(s, k) < E.totalBands(s, w)) w = k; });
    return w === d;
  }
  function searchBonus(s, h, r, t) {
    var hs = s.houses[h], b = 0.4 * t.search;
    if (hs.retinue.length < N.retinueMax) b += 0.6 * t.search;
    var need = E.departNeeds(s, h).relics - hs.relics.length;
    var relicsLeft = s.deck.filter(function (c) { return CARDS[c].relic; }).length;
    var draw = (r === 'stonefields' && E.siteOn(s, r) ? 4 : 3) + (E.has(s, h, 'barrowScholar') ? 1 : 0) +
      ((r === 'oldbarrow' || r === 'saltmarsh') && E.has(s, h, 'fenLantern') ? 2 : 0);
    var pRelic = s.deck.length ? Math.min(1, draw * relicsLeft / s.deck.length) : 0;
    if (r === 'oldbarrow' && E.siteOn(s, r)) pRelic = Math.min(1, pRelic * 1.3);
    var pro = hs.prophecy;
    b += pRelic * (0.6 + (need > 0 ? t.win.depart * 0.25 : 0) + (pro === 3 ? 2 : 0));
    if (pro === 2) b += 1.2;
    if (pro === 7 && hs.retinue.length < N.retinueMax) b += 0.6;
    if (!s.deck.length) b = -5;
    return b;
  }

  function candidates(s, h) {
    return E.legalActions(s, h, { few: true }).filter(function (a) {
      return a.type !== 'treat' && a.type !== 'poison' && a.type !== 'seeProphecy' && a.type !== 'dig' && a.type !== 'end';
    });
  }
  // spare moons, once nothing better is left: dig in where a rival is likeliest to take a region worth keeping.
  // An unguarded region is not worth it (it is marched into, not fought for).
  var DIG = { min: 0.12, odds: 1.5, crown: 1.5, claim: 3 };
  function digChoice(s, h, base) {
    if (s.houses[h].hours < 1) return null;
    var crit = null, best = null, bv = DIG.min;
    E.heldBy(s, h).forEach(function (r) {
      var a = { type: 'dig', house: h, region: r };
      if (!E.bandsAt(s, h, r) || E.check(s, a)) return;
      var pr = pressure(s, h, r);
      if (!pr) return;
      var d = E.defenceOf(s, r, null), stake = regionWorth(s, r);
      if (r === 'crown') stake += DIG.crown;
      if (crit === null) crit = criticalRegions(s, h, h);   // a standing claim or Departure that needs this region
      if (crit.indexOf(r) >= 0) stake += DIG.claim;
      var v = (pWin(pr + 1 - d) - pWin(pr - d)) * stake * DIG.odds;
      try { v += evaluate(tryApply(s, a), h) - base; } catch (e) { return; }
      if (v > bv) { bv = v; best = a; }
    });
    return best;
  }

  // ---------------------------------------------------------------- deciding
  function whoActs(s) {
    if (s.phase === 'over') return null;
    if (s.phase === 'prophecy') { for (var i = 0; i < s.order.length; i++) if (!s.houses[s.order[i]].prophecy) return s.order[i]; return null; }
    if (s.pending) return s.pending.type === 'offer' ? s.pending.to : s.pending.house;
    return s.order[s.turn];
  }

  function chooseProphecy(s, h) {
    var t = tem(s, h), opts = s.houses[h].prophecyOptions, best = null, bv = -1e9;
    var FIT = { 1: 'seize', 2: 'foretell', 3: 'depart', 4: 'seize', 5: 'seize', 6: 'seat', 7: 'foretell', 8: 'depart', 9: 'seat', 10: 'seize' };
    opts.forEach(function (id) {
      var p = E.prophecyProgress(s, h, id), v = p.have / p.need * 3 - p.need * 0.3 + (t.win[FIT[id]] || 5) * 0.1;
      if (id === 9 && t.breakCost < 1) v -= 2;
      if (id === 10 && s.regions.crown.owner === h) v -= 5;
      if (id === 5 && s.regions.crown.owner === h) v -= 2;
      if (v > bv) { bv = v; best = id; }
    });
    return { type: 'chooseProphecy', house: h, id: best };
  }

  function keepChoice(s, h) {
    var P = s.pending, best = { type: 'keep', house: h, card: null }, bv = evaluate(s, h);
    E.legalActions(s, h).forEach(function (a) {
      if (a.type !== 'keep' || a.card == null) return;
      var c = tryApply(s, a);
      if (c.pending) c.pending = null;
      var v = evaluate(c, h) + (a.to === 'site' ? 0.2 : 0);
      if (v > bv + 0.01) { bv = v; best = a; }
    });
    return best;
  }

  // the pact a house would accept: >0 means yes
  function pactScore(s, r, offer) {
    var f = offer.from, t = tem(s, r), sc = 0;
    var fStr = E.totalBands(s, f), rStr = E.totalBands(s, r);
    if (offer.type === 'truce') {
      var danger = 0;
      E.heldBy(s, r).forEach(function (rg) {
        REG[rg].adj.forEach(function (n) { danger += s.regions[n].bands[f] || 0; });
      });
      sc = 0.2 + t.truce + Math.min(danger, 6) * 0.25 - (fStr < rStr - 3 ? 1 : 0);
      if (E.threat(s, f) > 0.75) sc -= 2;   // no peace with the leader
    } else if (offer.type === 'tribute') {
      if (offer.payer === r) sc = (fStr - rStr - 3) * 0.5 + (t.truce > 0 ? 0.5 : 0) - (s.houses[r].silver < 2 ? 1 : 0);
      else sc = 1.5 - (t.fight > 0.3 ? 1 : 0);
    } else if (offer.type === 'foe') {
      var foe = offer.foe, ft = E.threat(s, foe);
      sc = (ft - 0.5) * 6 + E.grudge(s, r, foe) * 0.6 - E.grudge(s, foe, r) * 0.1;
      if (E.pactsBetween(s, r, foe).length) sc -= 2;
    }
    sc -= E.grudge(s, r, f) * 0.7;
    sc += (s.memory[r][f] ? s.memory[r][f].debt : 0) * 0.3;
    if (s.houses[f].brokeKnown) sc -= 1.5;
    sc += (E.nHeld(s, f) + (E.has(s, f, 'maskedEnvoy') ? 1 : 0)) * 0.25 - 0.5;
    return sc;
  }
  function respondChoice(s, h) {
    return { type: 'respond', house: h, accept: pactScore(s, h, s.pending.offer) > 0 };
  }

  // a pact worth offering this turn, or null
  function treatChoice(s, h) {
    var hs = s.houses[h];
    if (hs.flags.treated || hs.hours < (E.has(s, h, 'whisperer') ? 0 : 1)) return null;
    var t = tem(s, h), best = null, bv = 0;
    var leader = null, lt = 0;
    s.order.forEach(function (o) { if (o !== h) { var q = E.threat(s, o); if (q > lt) { lt = q; leader = o; } } });
    s.order.forEach(function (o) {
      if (o === h) return;
      var offers = [];
      if (t.truce > 0 && o !== leader) offers.push({ type: 'treat', house: h, target: o, pact: 'truce' });
      if (leader && o !== leader && lt > 0.6) offers.push({ type: 'treat', house: h, target: o, pact: 'foe', foe: leader });
      if (t.breakCost < 1 || t.fight > 0.3) offers.push({ type: 'treat', house: h, target: o, pact: 'tribute', payer: o });
      offers.forEach(function (a) {
        if (E.check(s, a)) return;
        var off = { type: a.pact, from: h, to: o, foe: a.foe, payer: a.payer, payee: a.payer === o ? h : o };
        var acc = pactScore(s, o, off);
        if (acc <= 0) return;
        var worth = a.pact === 'truce' ? 0.6 + t.truce * 0.5 - (E.grudge(s, h, o) * 0.3) : a.pact === 'foe' ? lt * 2 : 1.2;
        if (a.pact === 'truce') {
          // a truce is worth what the target threatens us with
          var danger = 0;
          E.heldBy(s, h).forEach(function (rg) { REG[rg].adj.forEach(function (n) { danger += s.regions[n].bands[o] || 0; }); });
          worth += Math.min(danger, 6) * 0.2 - 0.6;
        }
        if (worth > bv) { bv = worth; best = a; }
      });
    });
    return best && bv > 0.5 ? best : null;
  }

  function extras(s, h) {
    var hs = s.houses[h];
    // Bell Seer: look at the leader's prophecy
    if (E.has(s, h, 'bellSeer') && !hs.once.bellSeer) {
      var tgt = null, tv = -1;
      s.order.forEach(function (o) { if (o !== h && !hs.known[o]) { var q = E.threat(s, o); if (q > tv) { tv = q; tgt = o; } } });
      if (tgt) return { type: 'seeProphecy', house: h, target: tgt };
    }
    // Poisoner: strike the leader's best resident
    if (E.has(s, h, 'poisoner') && !hs.once.poisoner && hs.hours >= 1) {
      var lead = null, lt = 0.5;
      s.order.forEach(function (o) { if (o !== h) { var q = E.threat(s, o); if (q > lt) { lt = q; lead = o; } } });
      if (lead && s.houses[lead].retinue.length) {
        var card = s.houses[lead].retinue.slice().sort(function (x, y) { return CARDS[y].cost - CARDS[x].cost; })[0];
        return { type: 'poison', house: h, card: card };
      }
    }
    return null;
  }

  // the best main action ignoring hours: what this house means to do next turn
  // a landless house's return: the free region (or the camp) that leaves it best placed
  function returnChoice(s, h) {
    var best = null, bv = -Infinity;
    E.legalActions(s, h).forEach(function (a) {
      if (a.type !== 'return') return;
      var v = evaluate(tryApply(s, a), h);
      if (a.region !== 'camp') v += 0.3 * regionWorth(s, a.region);
      if (v > bv) { bv = v; best = a; }
    });
    return best || { type: 'end', house: h };
  }

  // a copy of s set up as the start of h's next turn, for planning; assaults on the player are not yet barred here
  function planState(s, h) {
    var c = E.clone(s), hs = c.houses[h], base = s.planRound || s.round;
    // the round h's next turn falls in, so the plan obeys the rules of that round (the first-round truce)
    c.planRound = s.order.indexOf(h) > s.turn ? base : base + 1;
    c.turn = c.order.indexOf(h); c.pending = null; c._planning = true;
    hs.flags = {}; hs.hours = 9;
    // digging in runs out as each house starts its turn: h's own, and any that move before h's next turn
    var spent = movesBefore(s, h).concat(h);
    IDS.forEach(function (r) { if (spent.indexOf(c.regions[r].dug) >= 0) delete c.regions[r].dug; });
    if (!E.nHeld(c, h)) hs.flags.returnDue = true;
    return c;
  }
  function planIntent(s, h, opts) {
    var c = planState(s, h), hs = c.houses[h];
    if (hs.flags.returnDue) {
      var ra = returnChoice(c, h);
      return { intent: ra.type === 'return' ? { type: 'return', region: ra.region } : { type: 'hold' }, intent2: null };
    }
    // a move on the player's regions must be shown during the player's turn: plan one only if the player moves before h does
    var warnable = (opts && opts.warnable) || h === 'player' || s.order[s.turn] === 'player' || movesBefore(s, h).indexOf('player') >= 0;
    var list = E.legalActions(c, h, { few: true }).filter(function (a) {
      if ((a.type === 'assault' || a.type === 'march') && !warnable && c.regions[a.to].owner === 'player') return false;
      // a poach from the player is a move on the player's region: shown first, like an assault
      if (a.type === 'recruit') return warnable && E.poachFrom(c, h, a.region) === 'player';
      return a.type === 'assault' || a.type === 'march' || a.type === 'muster' || a.type === 'depart';
    });
    setGuess(c, h);
    var base = evaluate(c, h), scored = [];
    list.forEach(function (a) {
      var v;
      try { v = actionValue(c, h, a, base); } catch (e) { return; }
      if (h !== 'player' && (a.type === 'assault' || a.type === 'march') && c.regions[a.to].owner === 'player') v += AIM.player;
      scored.push({ a: a, v: v });
    });
    scored.sort(function (x, y) { return y.v - x.v; });
    function strip(a) {
      if (!a) return { type: 'hold' };
      var o = { type: a.type };
      ['from', 'to', 'count', 'region', 'card'].forEach(function (k) { if (a[k] != null) o[k] = a[k]; });
      // a shown poach names the resident and where its taker reaches from (for the map's arrow)
      if (a.type === 'recruit') { o.type = 'poach'; o.from = E.recruitReach(c, h, a.region); }
      return o;
    }
    var first = scored[0] && scored[0].v > base + 0.2 ? scored[0].a : null;
    var second = null;
    for (var i = 1; i < scored.length; i++) if (first && scored[i].a.type !== first.type || (first && scored[i].a.to !== first.to)) { second = scored[i].a; break; }
    var ds = dangers(c, h);
    function why(o, a) {
      // the rival win this move works against: a region whose capture breaks it, or one next to it
      if (!a || (a.type !== 'assault' && a.type !== 'march')) return o;
      var best = null;
      ds.forEach(function (d) {
        var near = d.regions.indexOf(a.to) >= 0 || d.regions.some(function (r) { return REG[r].adj.indexOf(a.to) >= 0; });
        if (near && (!best || d.urgency > best.urgency)) best = d;
      });
      if (best) o.why = { house: best.house, kind: best.kind };
      return o;
    }
    return { intent: why(strip(first), first), intent2: why(strip(second), second) };
  }

  // ---------------------------------------------------------------- re-planning when the player's action changes the board
  function onPlayer(s, it) {
    if (it && it.type === 'poach') return !!(s.regions[it.region] && s.regions[it.region].owner === 'player');
    return !!(it && (it.type === 'assault' || it.type === 'march') && s.regions[it.to] && s.regions[it.to].owner === 'player');
  }
  // the player's claim or Departure that stands now ('' if none)
  function playerThreat(s) {
    if (!s.houses.player) return '';
    var cs = E.claimStanding(s, 'player'), dn = E.departNeeds(s, 'player');
    var dep = E.siteOn(s, 'farpass') && E.holds(s, 'player', 'farpass') && E.bandsAt(s, 'player', 'farpass') >= dn.bands && s.houses.player.relics.length >= dn.relics;
    return (cs ? cs.kind : '') + (dep ? ' depart' : '');
  }
  // the board as it stands, to compare after the player acts
  function snapshot(s) {
    var o = {};
    IDS.forEach(function (r) { var g = s.regions[r]; o[r] = { owner: g.owner, bands: JSON.stringify(g.bands), dug: g.dug || null, residents: g.residents.join(',') }; });
    o._threat = playerThreat(s);
    return o;
  }
  function sameIntent(a, b) {
    if (!a || !b) return !a === !b;
    return a.type === b.type && a.from === b.from && a.to === b.to && a.count === b.count && a.region === b.region && a.card === b.card;
  }
  // a shown poach is carried out as a recruit of that one resident
  function toAction(it, h) {
    if (it.type === 'poach') return { type: 'recruit', house: h, region: it.region, card: it.card };
    return { type: it.type, house: h, from: it.from, to: it.to, count: it.count, region: it.region };
  }
  // an intent the player's action made illegal or pointless: a region it names changed hands, or it can no longer be done.
  // later: a move after the next one, judged only by the regions it names
  function intentStale(s, h, it, before, later) {
    if (!it || it.type === 'hold') return false;
    if (it.type === 'depart') return !later && !E.holds(s, h, 'farpass');
    var regs = [it.from, it.to, it.region].filter(function (r) { return r && before[r]; });
    if (regs.some(function (r) { return before[r].owner !== s.regions[r].owner; })) return true;
    if (it.type === 'assault' && before[it.to] && before[it.to].dug !== (s.regions[it.to].dug || null)) return true;   // dug in: weigh the assault again
    if (it.type === 'poach' && s.regions[it.region].residents.indexOf(it.card) < 0) return true;   // the resident has gone
    if (later || ['assault', 'march', 'muster', 'return', 'poach'].indexOf(it.type) < 0) return false;
    return !!E.check(planState(s, h), toAction(it, h), { ignoreHours: true });
  }
  // a declared move that can still be made at the start of h's next turn
  function stillGood(s, h, it) {
    if (!it || it.type === 'hold') return !!it;
    if (it.type === 'depart') return E.holds(s, h, 'farpass');
    return !E.check(planState(s, h), toAction(it, h), { ignoreHours: true });
  }

  // ---------------------------------------------------------------- plans further ahead
  // the board for planning h's following turn once intent it is carried out (a battle goes its likelier way)
  function afterMove(s, h, it) {
    var c = planState(s, h);
    c._sim = true;
    if (it && it.type !== 'hold') {
      var a = toAction(it, h);
      if (!E.check(c, a)) {
        if (a.type === 'assault') { var o = odds(c, a); a._cards = o.p >= 0.5 ? [o.winDiff - o.base, 0] : [-o.loseDiff - o.base, 0]; }
        try { E.applyAction(c, a); } catch (e) { /* plan from the board as it was */ }
      }
    }
    c.pending = null;
    return c;
  }
  // how many turns h starts before the player's next turn (asked during the player's turn)
  function turnsBeforePlayer(s, h) {
    return movesBefore(s, 'player').filter(function (k) { return k === h; }).length;
  }
  // the moves h shows past its next one: a second move if it moves twice before the player's next turn,
  // and with the Owl one move more
  function aheadPlans(s, h, first) {
    var n = turnsBeforePlayer(s, h), shown = Math.max(1, n), owl = E.has(s, 'player', 'owl'), want = shown + (owl ? 1 : 0);
    var plans = [first], c = s;
    while (plans.length < want) {
      var prev = plans[plans.length - 1];
      if (prev && prev.type === 'depart') break;
      c = afterMove(c, h, prev);
      if (c.phase !== 'play') break;
      plans.push(planIntent(c, h, { warnable: true }).intent);
    }
    return { then: n >= 2 ? plans[1] || null : null, intent2: owl ? plans[shown] || null : null };
  }
  // at the start of the player's turn: every rival shows the moves it will make before the player's next turn
  function ahead(s) {
    if (s.phase !== 'play' || s.order[s.turn] !== 'player') return false;
    var key = s.round + ':' + s.houses.player.turns;
    if (s._ahead === key) return false;
    s._ahead = key;
    s.order.forEach(function (h) {
      if (h === 'player') return;
      var hs = s.houses[h];
      // a rival declares its plan as it ends a turn, so one that has not yet had a turn this age (seated after you in
      // the first round) has none: plan its next move now, by the rules of the round it falls in, so it shows first
      if (!hs.intent) hs.intent = planIntent(s, h).intent;
      var p = aheadPlans(s, h, hs.intent);
      hs.then = p.then; hs.intent2 = p.intent2;
    });
    return true;
  }
  // the intent a rival declares as it ends its turn: a second move it already showed, or the Owl's move, if still good
  function nextIntent(s, h) {
    var hs = s.houses[h];
    if (hs.then) {
      var th = hs.then;
      if (stillGood(s, h, th)) { delete th.revised; return { intent: th, intent2: hs.intent2 }; }
      hs.warned2 = null;   // its first move spoilt the second: the fallback may not touch the player's regions
      return { intent: planIntent(s, h).intent, intent2: null };
    }
    if (hs.intent2 && stillGood(s, h, hs.intent2)) { var i2 = hs.intent2; delete i2.revised; return { intent: i2, intent2: null }; }
    return { intent: planIntent(s, h).intent, intent2: null };
  }

  // after an action by the player: each rival that lost a region, or whose plan no longer works, declares again
  function replan(s, mover, before) {
    var ev = [];
    if (mover !== 'player' || s.phase !== 'play' || s.order[s.turn] !== mover) return ev;
    var moved = IDS.some(function (r) {
      var g = s.regions[r];
      return before[r].owner !== g.owner || before[r].bands !== JSON.stringify(g.bands) || (before[r].dug !== undefined && before[r].dug !== (g.dug || null)) ||
        (before[r].residents !== undefined && before[r].residents !== g.residents.join(','));
    });
    if (!moved) return ev;
    // a claim or Departure of the player's that now stands: every rival plans again to break it (and shows it)
    var threat = playerThreat(s), fresh = threat && threat !== before._threat;
    s.order.forEach(function (h) {
      if (h === mover) return;
      var hs = s.houses[h];
      var lost = IDS.some(function (r) { return before[r].owner === h && s.regions[r].owner !== h; });
      var stale1 = lost || fresh || intentStale(s, h, hs.intent, before), plan = null;
      // the player's action opened a better move against the player (a region left weak, a claim to break): show it now
      if (!stale1) { plan = planIntent(s, h); stale1 = onPlayer(s, plan.intent) && !sameIntent(plan.intent, hs.intent); }
      if (!stale1 && !intentStale(s, h, hs.then, before, true) && !intentStale(s, h, hs.intent2, before, true)) return;
      if (stale1) {
        plan = plan || planIntent(s, h);
        if (!sameIntent(plan.intent, hs.intent)) {
          plan.intent.revised = true; hs.intent = plan.intent;
          ev.push({ type: 'intentRevised', house: h, intent: hs.intent, label: E.intentLabel(s, h, hs.intent) });
        }
      }
      var p = aheadPlans(s, h, hs.intent);
      if (!sameIntent(p.then, hs.then)) {
        if (p.then) { p.then.revised = true; ev.push({ type: 'intentRevised', house: h, then: true, intent: p.then, label: E.intentLabel(s, h, p.then) }); }
        hs.then = p.then;
      }
      if (!sameIntent(p.intent2, hs.intent2)) {
        if (p.intent2) p.intent2.revised = true;
        hs.intent2 = p.intent2;
      }
    });
    return ev;
  }

  // carry out the declared intent, or the nearest legal thing
  function intentAction(s, h) {
    var it = s.houses[h].intent;
    if (!it || it.type === 'hold') return null;
    var a = toAction(it, h);
    if (!E.check(s, a)) return { action: a, note: 'kept' };
    // a spoilt poach takes no other resident in its place
    if (it.type === 'assault' || it.type === 'march') {
      // same target with what can be brought
      var near = null;
      E.legalActions(s, h).forEach(function (b) {
        if (b.type !== it.type || b.to !== it.to) return;
        if (!near || Math.abs(b.count - it.count) < Math.abs(near.count - it.count) || (b.from === it.from && near.from !== it.from && b.count === near.count)) near = b;
      });
      if (near) return { action: near, note: 'nearest' };
    }
    if (it.type === 'muster') {
      var m = E.legalActions(s, h, { few: true }).filter(function (b) { return b.type === 'muster' && b.region === it.region; })[0];
      if (m) return { action: m, note: 'nearest' };
    }
    return { action: null, note: 'dropped' };
  }

  // the action house h takes now
  function decide(s, h) {
    if (s.phase === 'prophecy') return chooseProphecy(s, h);
    var P = s.pending;
    if (P && P.type === 'offer') return respondChoice(s, h);
    if (P && P.type === 'search') return keepChoice(s, h);
    var hs = s.houses[h];
    if (!hs._acts) hs._acts = 0;
    if (hs.flags.returnDue) return returnChoice(s, h);
    // a depart wins at once
    if (!E.check(s, { type: 'depart', house: h })) return { type: 'depart', house: h };
    var x = extras(s, h);
    if (x && !E.check(s, x)) return x;
    setGuess(s, h);
    var base = evaluate(s, h), best = null, bv = base + 0.15;
    if (hs._acts < 25) {
      candidates(s, h).forEach(function (a) {
        var back = backtrack(hs, a);
        if (back === 2) return;                       // never undo a march made this turn
        var v = actionValue(s, h, a, base) - (back ? 0.6 : 0);
        if (v > bv) { bv = v; best = a; }
      });
    }
    if (best) return best;
    var tr = hs._acts < 25 ? treatChoice(s, h) : null;
    if (tr) return tr;
    var dg = hs._acts < 25 ? digChoice(s, h, base) : null;
    if (dg) return dg;
    var plan = nextIntent(s, h);
    return { type: 'end', house: h, intent: plan.intent, intent2: plan.intent2 };
  }

  // play AI houses until a human must act or the age ends. opts.allAI: play every seat. Returns events.
  function run(s, opts) {
    opts = opts || {};
    var ev = [], guard = 0;
    while (s.phase !== 'over' && guard++ < 5000) {
      var h = whoActs(s);
      if (!h) break;
      if (!s.houses[h].ai && !opts.allAI) { ahead(s); break; }
      ev = ev.concat(act(s, h));
      if (opts.untilTurnEnd && ev.length && ev[ev.length - 1].type === 'turnStart') break;
    }
    return ev;
  }
  // one AI decision for house h, with the intent carried out first at the start of a turn
  function act(s, h) {
    if (h === 'player') ahead(s);
    var before = h === 'player' ? snapshot(s) : null, ev = act1(s, h);
    return before ? ev.concat(replan(s, h, before)) : ev;
  }
  function act1(s, h) {
    var hs = s.houses[h], ev = [];
    if (s.phase === 'play' && !s.pending && s.order[s.turn] === h && hs._turn !== hs.turns) {
      hs._turn = hs.turns; hs._acts = 0;
      hs._prevMarched = hs._marched || []; hs._marched = [];
      if (hs.flags.returnDue) {
        // landless: return first, where the house said it would if it still can
        var it = hs.intent, ra = it && it.type === 'return' ? { type: 'return', house: h, region: it.region } : null;
        if (!ra || E.check(s, ra)) {
          ra = returnChoice(s, h);
          if (it && it.type === 'return') ev.push({ type: 'intentChanged', house: h, intent: it, label: E.intentLabel(s, h, it), action: ra, note: 'nearest' });
        }
        hs._acts++;
        return ev.concat(E.applyAction(s, ra));
      }
      var ia = intentAction(s, h);
      if (ia) {
        if (ia.note !== 'kept') ev.push({ type: 'intentChanged', house: h, intent: hs.intent, label: E.intentLabel(s, h, hs.intent), action: ia.action, note: ia.note });
        if (ia.action) { hs._acts++; noteMarch(hs, ia.action); return ev.concat(E.applyAction(s, ia.action)); }
      }
    }
    var a = decide(s, h);
    hs._acts = (hs._acts || 0) + 1;
    noteMarch(hs, a);
    return ev.concat(E.applyAction(s, a));
  }
  // marches made this turn and last, to keep warbands from walking back and forth
  function noteMarch(hs, a) { if (a && a.type === 'march') (hs._marched || (hs._marched = [])).push(a.from + '>' + a.to); }
  function backtrack(hs, a) {
    if (a.type !== 'march') return 0;
    var k = a.to + '>' + a.from;
    return (hs._marched || []).indexOf(k) >= 0 ? 2 : (hs._prevMarched || []).indexOf(k) >= 0 ? 1 : 0;
  }
  function respond(s) {
    if (!s.pending || s.pending.type !== 'offer') return [];
    return E.applyAction(s, respondChoice(s, s.pending.to));
  }

  // ---------------------------------------------------------------- the Reckoning
  // the structure each temperament would raze from a foe, and the ones it would build, best first (never a landmark)
  var HATED_SITE = { warlord: 'ashwood', mystic: 'stonefields', wanderer: 'highpasture', steward: 'saltmarsh', schemer: 'riverford', wild: 'oldbarrow', player: 'saltmarsh' };
  var LOVED_SITES = {
    warlord: ['ashwood', 'highpasture', 'saltmarsh'], mystic: ['stonefields', 'oldbarrow', 'saltmarsh'],
    wanderer: ['highpasture', 'oldbarrow', 'stonefields'], steward: ['saltmarsh', 'riverford', 'ashwood'],
    schemer: ['saltmarsh', 'riverford', 'stonefields'], wild: ['oldbarrow', 'highpasture', 'saltmarsh'], player: ['saltmarsh', 'riverford', 'ashwood']
  };
  var LAW_PREF = {
    warlord: ['levy', 'crownsDue', 'tolls', 'wildYear', 'shortReign', 'charter', 'openRoads', 'titheOfLore', 'oathOfArms', 'longPeace'],
    mystic: ['titheOfLore', 'longPeace', 'oathOfArms', 'charter', 'shortReign', 'wildYear', 'openRoads', 'tolls', 'levy', 'crownsDue'],
    wanderer: ['openRoads', 'charter', 'longPeace', 'wildYear', 'oathOfArms', 'titheOfLore', 'shortReign', 'tolls', 'levy', 'crownsDue'],
    steward: ['crownsDue', 'longPeace', 'shortReign', 'tolls', 'oathOfArms', 'charter', 'levy', 'titheOfLore', 'wildYear', 'openRoads'],
    schemer: ['tolls', 'crownsDue', 'shortReign', 'titheOfLore', 'levy', 'longPeace', 'charter', 'wildYear', 'openRoads', 'oathOfArms'],
    wild: ['wildYear', 'charter', 'levy', 'openRoads', 'longPeace', 'shortReign', 'tolls', 'titheOfLore', 'crownsDue', 'oathOfArms'],
    player: ['levy', 'openRoads', 'titheOfLore', 'tolls', 'longPeace', 'charter', 'shortReign', 'wildYear', 'crownsDue', 'oathOfArms']
  };
  function reckoningChoice(c) {
    var R = c.reckoning, w = R.winner, t = T[temperOf(c, w)] || T.player, tn = temperOf(c, w);
    var o = E.reckoningOptions(c);
    if (o.step === 'build') {
      var loves = LOVED_SITES[tn] || LOVED_SITES.player, built = c.world.built;
      if (!built[loves[0]]) return { kind: 'build', region: loves[0] };
      // raze what the strongest grudge-holder against us would use most
      var foe = null, fg = -1;
      Object.keys(c.memory).forEach(function (k) {
        if (k === w) return;
        var g = c.memory[k][w].grudge + (c.next && c.next.rivals && c.next.rivals.indexOf(k) >= 0 ? 1 : 0);
        if (g > fg) { fg = g; foe = k; }
      });
      var site = foe ? HATED_SITE[temperOf(c, foe)] : null;
      if (site && built[site] && loves.indexOf(site) < 0 && fg > 0) return { kind: 'raze', region: site };
      var next = loves.filter(function (r) { return !built[r]; })[0];
      return next ? { kind: 'build', region: next } : { kind: 'none' };
    }
    if (o.step === 'banish') {
      var deck = o.deck.slice().sort(function (x, y) { return selfValue(t, tn, x) - selfValue(t, tn, y); });
      var offer = o.offer.slice().sort(function (x, y) { return selfValue(t, tn, y) - selfValue(t, tn, x); });
      return { banish: deck.slice(0, 2), admit: offer.slice(0, o.admit) };
    }
    if (o.step === 'law') {
      var pref = LAW_PREF[tn] || LAW_PREF.player;
      var pick = o.options.slice().sort(function (x, y) { return pref.indexOf(x) - pref.indexOf(y); })[0];
      return { law: pick };
    }
    return null;
  }
  function selfValue(t, tn, id) {
    var c = CARDS[id];
    if (c.relic) return tn === 'wanderer' ? 10 : (id === 'waystoneShard' ? -1 : 1.2);
    return cardValue(t, id);
  }

  return {
    decide: decide, whoActs: whoActs, run: run, act: act, respond: respond, reckoningChoice: reckoningChoice,
    evaluate: evaluate, odds: odds, planIntent: planIntent, snapshot: snapshot, replan: replan, ahead: ahead, pactScore: pactScore, chooseProphecy: chooseProphecy,
    dangers: function (s, h) { setGuess(s, h); return dangers(s, h); },
    digChoice: function (s, h) { setGuess(s, h); return digChoice(s, h, evaluate(s, h)); },
    TEMPERAMENTS: T, AIM: AIM, BUILD: BUILD
  };
});
