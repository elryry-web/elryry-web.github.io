/* Felt & Fold: tournaments (Sit & Go, Double Table), blind schedules, payouts, ICM.
 * UMD: window.FF.Tournament in the browser (load cards.js, engine.js first), require('./tournament.js') in node.
 *
 * Lockstep rounds: hands = startRound(t) starts one hand per table (each is an engine hand; the UI plays the
 * hero's, AI agents play the other at once), then endRound(t) busts players, assigns places, balances or merges
 * tables, and advances the level. Levels go by hands played at the hero's table (t.handsPlayed).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'));
  else { root.FF = root.FF || {}; root.FF.Tournament = factory(root.FF.Cards, root.FF.Engine); }
})(typeof self !== 'undefined' ? self : this, function (C, E) {
  'use strict';
  // [sb, bb]; antes start at level 6 (index 5). Classic ante = bb / 8, BB ante = bb.
  var BASE = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200],
    [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000], [6000, 12000], [10000, 20000], [15000, 30000], [20000, 40000]];
  var HYPER = [[30, 60], [40, 80], [50, 100], [60, 120], [80, 160], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200],
    [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000], [6000, 12000], [10000, 20000]];
  var SPEEDS = { regular: { hands: 12, levels: BASE }, turbo: { hands: 8, levels: BASE }, hyper: { hands: 4, levels: HYPER } };
  var PAYOUTS = { sng: [0.65, 0.35], double: [0.5, 0.3, 0.2] };
  var START_CHIPS = 1500, ANTE_FROM = 5;

  function level(speed, ix, anteType) {
    var L = SPEEDS[speed].levels, i = Math.min(ix, L.length - 1), sb = L[i][0], bb = L[i][1];
    var at = anteType || 'each', ante = i >= ANTE_FROM ? (at === 'bba' ? bb : Math.round(bb / 8)) : 0;
    if (ix >= L.length) { var k = Math.pow(1.5, ix - L.length + 1); sb = Math.round(sb * k / 100) * 100; bb = sb * 2; ante = at === 'bba' ? bb : Math.round(bb / 8); }
    return { level: ix + 1, sb: sb, bb: bb, ante: ante, anteType: ante ? at : 'none' };
  }
  function schedule(speed, n, anteType) { var o = []; for (var i = 0; i < (n || 15); i++) o.push(level(speed, i, anteType)); return o; }

  // opts: { kind: 'sng'|'double', speed, seed, buyIn, anteType: 'each'|'bba', entrants: [{id, name, ...}] (6 or 12), heroId }
  function create(opts) {
    var kind = opts.kind || 'sng', n = kind === 'double' ? 12 : 6, r = C.rng(C.hashSeed(opts.seed || 1, 31337));
    var ents = (opts.entrants || []).slice(0, n);
    while (ents.length < n) ents.push({ id: 'p' + (ents.length + 1), name: 'Player ' + (ents.length + 1) });
    var t = { kind: kind, speed: opts.speed || 'regular', anteType: opts.anteType || 'each', seed: opts.seed || 1, buyIn: opts.buyIn || 10,
      prizePool: (opts.buyIn || 10) * n, payouts: PAYOUTS[kind].map(function (f) { return f * (opts.buyIn || 10) * n; }),
      heroId: opts.heroId || null, handsPlayed: 0, levelIx: 0, tables: [], players: {}, places: [], round: 0, over: false, merged: kind === 'sng', log: [] };
    var order = C.shuffle(ents.map(function (e, i) { return i; }), r); // seat draw
    var nt = kind === 'double' ? 2 : 1;
    for (var k = 0; k < nt; k++) t.tables.push(E.createTable({ seats: 6, mode: 'tourney', seed: C.hashSeed(t.seed, 101 + k), id: 'T' + (k + 1) }));
    order.forEach(function (ei, j) {
      var e = ents[ei], tb = t.tables[j % nt], seat = Math.floor(j / nt);
      var p = Object.assign({}, e, { stack: START_CHIPS }); E.sit(tb, seat, p);
      t.players[e.id] = { id: e.id, name: e.name, place: 0, prize: 0 };
    });
    t.tables.forEach(function (tb) { tb.button = Math.floor(r() * 6); });
    applyLevel(t);
    return t;
  }
  function info(t) {
    var sp = SPEEDS[t.speed], cur = level(t.speed, t.levelIx, t.anteType), nxt = level(t.speed, t.levelIx + 1, t.anteType);
    return { level: cur, next: nxt, handsToNext: sp.hands - (t.handsPlayed % sp.hands), handsPlayed: t.handsPlayed, left: alive(t).length, payouts: t.payouts };
  }
  function applyLevel(t) { var L = level(t.speed, t.levelIx, t.anteType); t.tables.forEach(function (tb) { E.setBlinds(tb, L.sb, L.bb, L.ante, L.anteType); }); }
  function alive(t) { var o = []; t.tables.forEach(function (tb) { tb.seats.forEach(function (p) { if (p && p.stack > 0) o.push(p); }); }); return o; }
  function heroTable(t) { if (!t.heroId) return t.tables[0]; for (var i = 0; i < t.tables.length; i++) if (t.tables[i].seats.some(function (p) { return p && p.id === t.heroId; })) return t.tables[i]; return t.tables[0]; }
  function count(tb) { return tb.seats.filter(function (p) { return p && p.stack > 0; }).length; }

  // start one hand at every table that can play; returns [{ table, hand }]
  function startRound(t) {
    if (t.over) return [];
    t.round++;
    var out = [];
    t.tables.forEach(function (tb) {
      if (count(tb) < 2) return;
      tb.seats.forEach(function (p) { if (p) p.startStack = p.stack; });
      var h = E.startHand(tb); if (h) out.push({ table: tb, hand: h });
    });
    t.current = out;
    return out;
  }
  // after every hand in the round is done
  function endRound(t) {
    var busted = [];
    t.tables.forEach(function (tb) {
      tb.seats.forEach(function (p, i) { if (p && p.stack <= 0) { busted.push({ p: p, start: p.startStack || 0, table: tb.id, seat: i }); tb.seats[i] = null; } });
    });
    var left = alive(t).length;
    // simultaneous busts: the bigger stack at the start of the hand finishes higher
    busted.sort(function (a, b) { return b.start - a.start || (a.table < b.table ? -1 : 1) || a.seat - b.seat; });
    busted.forEach(function (b, i) {
      var place = left + 1 + i, rec = t.players[b.p.id];
      rec.place = place; rec.prize = t.payouts[place - 1] || 0;
      t.places.push({ id: b.p.id, place: place, prize: rec.prize });
      t.log.push({ ev: 'bust', id: b.p.id, place: place, round: t.round });
    });
    t.handsPlayed++; // lockstep: one hand per table per round
    var newIx = Math.floor(t.handsPlayed / SPEEDS[t.speed].hands);
    if (newIx !== t.levelIx) { t.levelIx = newIx; t.log.push({ ev: 'level', level: newIx + 1, round: t.round }); }
    if (left <= 1) {
      var w = alive(t)[0];
      if (w) { var rec = t.players[w.id]; rec.place = 1; rec.prize = t.payouts[0]; t.places.push({ id: w.id, place: 1, prize: rec.prize }); }
      t.over = true; return t;
    }
    balance(t);
    applyLevel(t);
    return t;
  }

  // move players so tables differ by at most one; merge to one final table at six or fewer
  function balance(t) {
    if (t.tables.length < 2) return;
    var r = C.rng(C.hashSeed(t.seed, t.round, 555));
    var a = t.tables[0], b = t.tables[1], total = count(a) + count(b);
    if (total <= 6) {
      var keep = count(a) >= count(b) ? a : b, gone = keep === a ? b : a;
      gone.seats.forEach(function (p, i) { if (!p) return; gone.seats[i] = null; seatRandom(keep, p, r); t.log.push({ ev: 'move', id: p.id, to: keep.id, final: true, round: t.round }); });
      t.tables = [keep]; t.merged = true; t.log.push({ ev: 'merge', table: keep.id, round: t.round });
      return;
    }
    while (Math.abs(count(a) - count(b)) >= 2) {
      var big = count(a) > count(b) ? a : b, small = big === a ? b : a;
      // the player due the big blind next hand moves (they would pay it soonest)
      var nb = E.nextSeat(big, big.button, function (i) { return big.seats[i] && big.seats[i].stack > 0; });
      var nsb = E.nextSeat(big, nb, function (i) { return big.seats[i] && big.seats[i].stack > 0; });
      var mover = E.nextSeat(big, nsb, function (i) { return big.seats[i] && big.seats[i].stack > 0; });
      var p = big.seats[mover]; big.seats[mover] = null; seatRandom(small, p, r);
      t.log.push({ ev: 'move', id: p.id, from: big.id, to: small.id, round: t.round });
    }
  }
  function seatRandom(tb, p, r) {
    var empty = []; tb.seats.forEach(function (s, i) { if (!s) empty.push(i); });
    var seat = empty[Math.floor(r() * empty.length)]; p.seat = seat; p.state = 'active'; tb.seats[seat] = p;
  }
  function results(t) { return Object.keys(t.players).map(function (k) { return t.players[k]; }).sort(function (a, b) { return (a.place || 99) - (b.place || 99); }); }
  function chips(t) { var s = 0; t.tables.forEach(function (tb) { s += E.chipsInPlay(tb); }); return s; }
  // simulation helper: plays every round with agents(h, seat, legal) until one player is left
  function run(t, agents, maxRounds) {
    var guard = 0;
    while (!t.over && guard++ < (maxRounds || 5000)) {
      var hs = startRound(t);
      hs.forEach(function (x) { var h = x.hand; while (!h.done) E.act(h, agents(h, h.toAct, E.legal(h))); });
      endRound(t);
    }
    return t;
  }

  // ---------------------------------------------------------------- ICM (Malmuth-Harville)
  // stacks: chip counts, payouts: prize per place (1st first). Returns each player's expected prize.
  function icm(stacks, payouts) {
    var n = stacks.length, eq = new Array(n).fill(0), places = Math.min(payouts.length, n), total = 0;
    stacks.forEach(function (s) { total += s; });
    var used = new Array(n).fill(false);
    (function go(place, prob, rem) {
      if (place >= places || rem <= 0) return;
      for (var i = 0; i < n; i++) {
        if (used[i] || stacks[i] <= 0) continue;
        var p = prob * stacks[i] / rem;
        eq[i] += p * payouts[place];
        used[i] = true; go(place + 1, p, rem - stacks[i]); used[i] = false;
      }
    })(0, 1, total);
    return eq;
  }
  // chip EV in prize terms of a decision: icmDelta(stacksAfterOutcomes, probs, payouts, hero) helper
  function icmEV(outcomes, payouts, hero) { var ev = 0; outcomes.forEach(function (o) { ev += o.p * icm(o.stacks, payouts)[hero]; }); return ev; }

  return { SPEEDS: SPEEDS, PAYOUTS: PAYOUTS, START_CHIPS: START_CHIPS, level: level, schedule: schedule, create: create, info: info,
    startRound: startRound, endRound: endRound, alive: alive, heroTable: heroTable, results: results, chips: chips, run: run, icm: icm, icmEV: icmEV };
});
