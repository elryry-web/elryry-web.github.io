/* Felt & Fold: table and hand state machine for 2..9 seats. Deterministic given the table seed. No DOM, no decisions.
 * UMD: window.FF.Engine in the browser (load cards.js first), require('./engine.js') in node.
 *
 * All amounts are integer chips (cash tables use cents: 0.25/0.50 blinds are sb 25, bb 50).
 * Pull model: h = startHand(table); while (h.toAct >= 0) act(h, someDecision(h, h.toAct, legal(h)));
 * The engine never chooses an action. runHand / runHandAsync are drivers that ask an agent function.
 *
 * Seat states: 'active' (dealt in), 'waiting' (cash: new or returning, waits for the big blind),
 * 'post' (cash: posts a live big blind next hand from any seat), 'sitout'. A seat with stack 0 is never dealt.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'));
  else { root.FF = root.FF || {}; root.FF.Engine = factory(root.FF.Cards); }
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var POS_NAMES = {
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['CO', 'BTN', 'SB', 'BB'], 5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
    6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    8: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 9: ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
  };

  // ---------------------------------------------------------------- table
  // opts: { seats: 6, sb, bb, ante: 0, anteType: 'none'|'each'|'bba', mode: 'cash'|'tourney', seed }
  function createTable(opts) {
    opts = opts || {};
    var n = opts.seats || 6, t = {
      nSeats: n, seats: [], sb: opts.sb || 1, bb: opts.bb || 2, ante: opts.ante || 0, anteType: opts.anteType || 'none',
      mode: opts.mode || 'cash', seed: (opts.seed >>> 0) || 1, handNo: 0, button: -1, id: opts.id || 'T1', lastHand: null
    };
    for (var i = 0; i < n; i++) t.seats.push(null);
    return t;
  }
  // player: { id, name, stack, ... any extra fields are kept }. opts.post: cash newcomer posts a live BB instead of waiting.
  function sit(t, seat, player, opts) {
    if (t.seats[seat]) throw new Error('seat ' + seat + ' taken');
    var p = player; p.seat = seat;
    var running = t.seats.filter(function (s) { return s && s.state === 'active' && s.stack > 0; }).length >= 2 && t.handNo > 0;
    p.state = t.mode === 'cash' && running ? (opts && opts.post ? 'post' : 'waiting') : 'active';
    t.seats[seat] = p;
    return p;
  }
  function stand(t, seat) { var p = t.seats[seat]; t.seats[seat] = null; return p; }
  function sitOut(t, seat) { if (t.seats[seat]) t.seats[seat].state = 'sitout'; }
  function sitIn(t, seat, post) { var p = t.seats[seat]; if (p && p.state === 'sitout') p.state = t.mode === 'cash' ? (post ? 'post' : 'waiting') : 'active'; }
  function setBlinds(t, sb, bb, ante, anteType) { t.sb = sb; t.bb = bb; t.ante = ante || 0; if (anteType) t.anteType = anteType; }
  function nextSeat(t, from, pred) { for (var k = 1; k <= t.nSeats; k++) { var i = (from + k) % t.nSeats; if (pred(i)) return i; } return -1; }

  // ---------------------------------------------------------------- hand start
  function startHand(t, opts) {
    opts = opts || {};
    var S = t.seats, live = function (i) { return S[i] && S[i].stack > 0 && S[i].state !== 'sitout'; };
    var dealt = {}, count = 0, i;
    for (i = 0; i < t.nSeats; i++) if (live(i) && S[i].state !== 'waiting') { dealt[i] = true; count++; }
    var cand = function (i) { return live(i); };
    if (count + t.seats.filter(function (s, j) { return live(j) && s.state === 'waiting'; }).length < 2) return null;
    // button: next dealt seat after the old button (moving button)
    var btn = opts.button != null ? opts.button : nextSeat(t, t.button < 0 ? t.nSeats - 1 : t.button, function (i) { return dealt[i] && S[i].state === 'active'; });
    if (btn < 0) btn = nextSeat(t, t.button < 0 ? t.nSeats - 1 : t.button, function (i) { return dealt[i]; });
    if (btn < 0) return null;
    var sbS = nextSeat(t, btn, function (i) { return dealt[i]; });
    var bbS = nextSeat(t, sbS, cand);
    if (bbS === btn && count < 2) return null;
    if (S[bbS].state === 'waiting') { S[bbS].state = 'active'; dealt[bbS] = true; count++; }
    if (count < 2) return null;
    if (count === 2) { sbS = btn; bbS = nextSeat(t, btn, function (i) { return dealt[i]; }); }
    t.button = btn; t.handNo++;
    var seed = C.hashSeed(t.seed, t.handNo, 7919), r = C.rng(seed);
    var h = {
      id: t.id + '#' + t.handNo, handNo: t.handNo, seed: seed, table: t, sb: t.sb, bb: t.bb, ante: t.anteType === 'none' ? 0 : t.ante, anteType: t.anteType,
      button: btn, sbSeat: sbS, bbSeat: bbS, players: [], order: [], board: [], deck: C.shuffle(C.newDeck(), r), deckPos: 0,
      street: 'preflop', streetIx: 0, currentBet: 0, minRaise: t.bb, lastAggressor: -1, streetAggressor: -1, toAct: -1,
      log: [], done: false, result: null, nSeats: t.nSeats, pos: {}
    };
    for (i = 0; i < t.nSeats; i++) h.players.push(null);
    // seats in dealing order, starting left of the button
    var s = btn;
    do { s = nextSeat(t, s, function (i) { return dealt[i]; }); h.order.push(s); } while (s !== btn);
    var posters = h.order.filter(function (si) { return S[si].state === 'post'; });
    h.order.forEach(function (si) {
      var sp = S[si]; sp.state = 'active';
      h.players[si] = { seat: si, id: sp.id, name: sp.name, stackStart: sp.stack, stack: sp.stack, hole: null, folded: false, allIn: false,
        committed: 0, total: 0, anteP: 0, acted: false, actedLevel: 0, shown: false, mucked: false };
    });
    // positions: names by player count, counted back from the big blind
    var np = h.order.length, names = POS_NAMES[np], bbIx = h.order.indexOf(bbS);
    for (var k = 0; k < np; k++) { var seatK = h.order[(bbIx - k + np) % np]; h.pos[seatK] = names[np - 1 - k]; }
    if (np === 2) h.pos[btn] = 'BTN';
    // antes, then blinds (BB ante: blind first, then the ante from what is left)
    if (h.anteType === 'each' && h.ante > 0) h.order.forEach(function (si) { postAnte(h, si, h.ante); });
    post(h, sbS, Math.min(t.sb, h.players[sbS].stack), 'sb');
    post(h, bbS, Math.min(t.bb, h.players[bbS].stack), 'bb');
    if (h.anteType === 'bba' && h.ante > 0) postAnte(h, bbS, h.ante);
    posters.forEach(function (si) { if (si !== sbS && si !== bbS) post(h, si, Math.min(t.bb, h.players[si].stack), 'post'); }); // live big blind
    h.currentBet = t.bb; h.minRaise = t.bb; // a short big blind still makes the call amount the full blind
    // hole cards
    for (var round = 0; round < 2; round++) h.order.forEach(function (si) { var p = h.players[si]; p.hole = p.hole || []; p.hole.push(h.deck[h.deckPos++]); });
    h.order.forEach(function (si) { var p = h.players[si]; h.log.push({ ev: 'deal', seat: si, cards: p.hole.slice() }); });
    // first to act preflop: left of the big blind (heads-up: the button/small blind)
    h.toAct = firstToAct(h, bbS);
    if (h.toAct < 0) endRound(h);
    return h;
  }
  function postAnte(h, si, amt) {
    var p = h.players[si], a = Math.min(amt, p.stack);
    if (a <= 0) return;
    h.log.push({ ev: 'post', kind: 'ante', seat: si, pos: h.pos[si], amount: a, potBefore: pot(h), stackBefore: p.stack, street: 'preflop' });
    p.stack -= a; p.anteP += a; if (p.stack === 0) p.allIn = true;
  }
  function post(h, si, amt, kind) {
    var p = h.players[si];
    if (amt <= 0) return;
    h.log.push({ ev: 'post', kind: kind, seat: si, pos: h.pos[si], amount: amt, potBefore: pot(h), stackBefore: p.stack, street: 'preflop' });
    p.stack -= amt; p.committed += amt; p.total += amt; if (p.stack === 0) p.allIn = true;
  }
  function pot(h) { var s = 0; h.players.forEach(function (p) { if (p) s += p.total + p.anteP; }); return s; }

  // ---------------------------------------------------------------- action flow
  function canAct(p) { return p && !p.folded && !p.allIn; }
  function needsAction(h, si) { var p = h.players[si]; return canAct(p) && (!p.acted || p.committed < h.currentBet); }
  function firstToAct(h, after) { var o = h.order, i = o.indexOf(after); for (var k = 1; k <= o.length; k++) { var s = o[(i + k) % o.length]; if (needsAction(h, s)) return s; } return -1; }
  function nextToAct(h, after) { return firstToAct(h, after); }
  function inHand(h) { return h.order.filter(function (s) { return !h.players[s].folded; }); }

  // legal options for the player to act: { seat, toCall, call, canCheck, canRaise, minTo, maxTo, currentBet, pot, stack }
  // call = chips the call costs (capped by stack). minTo/maxTo are "raise to" street totals; minTo is capped at maxTo (all-in for less).
  function legal(h, si) {
    si = si == null ? h.toAct : si;
    var p = h.players[si], toCall = Math.max(0, h.currentBet - p.committed), maxTo = p.committed + p.stack;
    var others = h.order.filter(function (s) { return s !== si && canAct(h.players[s]); }).length;
    var reopened = !p.acted || h.currentBet - p.actedLevel >= h.minRaise;
    var canRaise = reopened && others > 0 && p.stack > toCall;
    var minTo = Math.min(h.currentBet + h.minRaise, maxTo);
    return { seat: si, toCall: toCall, call: Math.min(toCall, p.stack), canCheck: toCall === 0, canRaise: canRaise, minTo: canRaise ? minTo : 0,
      maxTo: canRaise ? maxTo : 0, currentBet: h.currentBet, pot: pot(h), stack: p.stack, committed: p.committed, street: h.street, isBet: h.currentBet === 0 };
  }

  // a: { type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', to } (to = street total for bet/raise). Throws on illegal input.
  function act(h, a) {
    if (h.done || h.toAct < 0) throw new Error('no action pending');
    var si = h.toAct, p = h.players[si], L = legal(h, si), type = a.type, to = a.to;
    if (type === 'allin') {
      if (L.canRaise) { type = h.currentBet === 0 ? 'bet' : 'raise'; to = L.maxTo; } else type = L.canCheck ? 'check' : 'call';
    }
    if (type === 'bet' && h.currentBet > 0) type = 'raise';
    if (type === 'raise' && h.currentBet === 0) type = 'bet';
    if (type === 'call' && L.toCall === 0) type = 'check';
    var entry = { ev: 'act', street: h.street, seat: si, pos: h.pos[si], type: type, to: 0, add: 0, potBefore: L.pot, stackBefore: p.stack,
      toCall: L.toCall, betBefore: h.currentBet, minTo: L.minTo, maxTo: L.maxTo, allIn: false, n: h.log.length };
    if (type === 'fold') { p.folded = true; }
    else if (type === 'check') { if (!L.canCheck) throw new Error('cannot check, ' + L.toCall + ' to call'); }
    else if (type === 'call') { var add = L.call; p.stack -= add; p.committed += add; p.total += add; entry.add = add; entry.to = p.committed; }
    else if (type === 'bet' || type === 'raise') {
      if (!L.canRaise) throw new Error('raise not allowed');
      to = Math.round(to);
      if (!(to >= L.minTo && to <= L.maxTo)) throw new Error(type + ' to ' + to + ' outside ' + L.minTo + '..' + L.maxTo);
      var inc = to - h.currentBet, add2 = to - p.committed;
      p.stack -= add2; p.committed = to; p.total += add2; entry.add = add2; entry.to = to;
      if (inc >= h.minRaise) { h.minRaise = inc; entry.full = true; } else entry.full = false; // short all-in: no new minimum, no reopening
      h.currentBet = to; h.lastAggressor = si; h.streetAggressor = si;
    } else throw new Error('bad action ' + type);
    if (p.stack === 0 && type !== 'fold' && type !== 'check') { p.allIn = true; entry.allIn = true; }
    if (type !== 'fold') { p.acted = true; p.actedLevel = h.currentBet; }
    h.log.push(entry);
    // hand over by folds?
    if (inHand(h).length === 1) { refundUncalled(h); return awardUncontested(h); }
    var nx = nextToAct(h, si);
    if (nx >= 0) { h.toAct = nx; return h; }
    h.toAct = -1;
    endRound(h);
    return h;
  }

  function refundUncalled(h) {
    var hi = -1, hiV = -1, second = -1;
    h.order.forEach(function (s) { var v = h.players[s].total; if (v > hiV) { second = hiV; hiV = v; hi = s; } else if (v > second) second = v; });
    if (hi >= 0 && hiV > second && second >= 0) {
      var p = h.players[hi], d = hiV - second;
      p.total -= d; p.committed -= d; p.stack += d; if (p.stack > 0) p.allIn = false;
      h.log.push({ ev: 'return', seat: hi, pos: h.pos[hi], amount: d, street: h.street });
    }
  }
  function endRound(h) {
    refundUncalled(h);
    var live = inHand(h), actors = live.filter(function (s) { return !h.players[s].allIn; });
    if (h.streetIx === 3) return showdown(h);
    // next street
    h.streetIx++; h.street = STREETS[h.streetIx];
    h.order.forEach(function (s) { var p = h.players[s]; p.committed = 0; p.acted = false; p.actedLevel = 0; });
    h.currentBet = 0; h.minRaise = h.bb; h.streetAggressor = -1;
    h.deckPos++; // burn
    var n = h.streetIx === 1 ? 3 : 1, cards = [];
    for (var i = 0; i < n; i++) { var c = h.deck[h.deckPos++]; h.board.push(c); cards.push(c); }
    h.log.push({ ev: 'board', street: h.street, cards: cards, board: h.board.slice(), pot: pot(h) });
    if (actors.length < 2) { h.toAct = -1; return endRound(h); } // nobody left to bet against: run it out
    h.toAct = firstToAct(h, h.button);
    if (h.toAct < 0) return endRound(h);
    return h;
  }

  // ---------------------------------------------------------------- pots and showdown
  // side pots from total bets. Antes come first as dead money: with 'each' antes they are layered by what each player
  // posted, so a player all-in for part of the ante wins only that much from each opponent; a big-blind ante is
  // posted for the whole table and every live player is eligible for it.
  function buildPots(h) {
    var ps = h.order.map(function (s) { return h.players[s]; }), pots = [], live = function (p) { return !p.folded; };
    function add(amt, el) {
      var last = pots[pots.length - 1];
      if (!amt) return;
      if (last && (!el.length || last.eligible.join() === el.join())) last.amount += amt;
      else pots.push({ amount: amt, eligible: el });
    }
    function layers(key, elig) {
      var levels = [], prev = 0;
      ps.forEach(function (p) { if (p[key] > 0 && levels.indexOf(p[key]) < 0) levels.push(p[key]); });
      levels.sort(function (a, b) { return a - b; });
      levels.forEach(function (L) {
        var amt = 0;
        ps.forEach(function (p) { amt += Math.min(p[key], L) - Math.min(p[key], prev); });
        add(amt, ps.filter(function (p) { return live(p) && elig(p, L); }).map(function (p) { return p.seat; }));
        prev = L;
      });
    }
    if (h.anteType === 'bba') { var a = 0; ps.forEach(function (p) { a += p.anteP; }); add(a, ps.filter(live).map(function (p) { return p.seat; })); }
    else layers('anteP', function (p, L) { return p.anteP >= L; });
    layers('total', function (p, L) { return p.total >= L; });
    // a pot nobody live can claim (cannot normally happen) goes down a level
    for (var i = pots.length - 1; i > 0; i--) if (!pots[i].eligible.length) { pots[i - 1].amount += pots[i].amount; pots.splice(i, 1); }
    return pots;
  }
  function awardUncontested(h) {
    var w = inHand(h)[0], p = h.players[w], total = pot(h);
    p.stack += total;
    h.log.push({ ev: 'win', seat: w, pos: h.pos[w], amount: total, pot: 0, uncontested: true });
    h.result = { pots: [{ amount: total, eligible: [w], winners: [w], shares: [total] }], showdown: false, shown: {}, won: {} };
    h.result.won[w] = total;
    return finish(h);
  }
  function showdown(h) {
    h.street = 'showdown';
    var live = inHand(h), scores = {};
    live.forEach(function (s) { scores[s] = C.evalCards(h.board.concat(h.players[s].hole)); });
    // show order: river aggressor first, else first live seat left of the button; later seats muck unless they tie or beat
    var start = h.streetAggressor >= 0 && !h.players[h.streetAggressor].folded ? h.streetAggressor : h.order.filter(function (s) { return live.indexOf(s) >= 0; })[0];
    var o = h.order, si = o.indexOf(start), shown = {}, best = -1, anyAllIn = live.some(function (s) { return h.players[s].allIn; });
    for (var k = 0; k < o.length; k++) {
      var s = o[(si + k) % o.length]; if (live.indexOf(s) < 0) continue;
      var p = h.players[s];
      if (anyAllIn || scores[s] >= best) { p.shown = true; shown[s] = p.hole.slice(); h.log.push({ ev: 'show', seat: s, pos: h.pos[s], cards: p.hole.slice(), score: scores[s], name: C.handName(scores[s]) }); }
      else { p.mucked = true; h.log.push({ ev: 'muck', seat: s, pos: h.pos[s] }); }
      if (scores[s] > best) best = scores[s];
    }
    var pots = buildPots(h), won = {};
    pots.forEach(function (pt, pi) {
      var el = pt.eligible.filter(function (s) { return !h.players[s].mucked; });
      if (!el.length) el = pt.eligible;
      var top = -1; el.forEach(function (s) { if (scores[s] > top) top = scores[s]; });
      var winners = h.order.filter(function (s) { return el.indexOf(s) >= 0 && scores[s] === top; });
      // order winners from the first seat left of the button, who gets odd chips first
      var share = Math.floor(pt.amount / winners.length), odd = pt.amount - share * winners.length;
      pt.winners = winners; pt.shares = winners.map(function (s, i) { return share + (i < odd ? 1 : 0); });
      winners.forEach(function (s, i) {
        h.players[s].stack += pt.shares[i]; won[s] = (won[s] || 0) + pt.shares[i];
        h.log.push({ ev: 'win', seat: s, pos: h.pos[s], amount: pt.shares[i], potIndex: pi, potAmount: pt.amount, name: C.handName(top) });
      });
    });
    h.result = { pots: pots, showdown: true, shown: shown, won: won, scores: scores };
    return finish(h);
  }
  function finish(h) {
    h.done = true; h.toAct = -1;
    var t = h.table;
    h.order.forEach(function (s) { var p = h.players[s]; if (t.seats[s] && t.seats[s].id === p.id) t.seats[s].stack = p.stack; p.net = p.stack - p.stackStart; });
    h.log.push({ ev: 'end', stacks: h.order.map(function (s) { return [s, h.players[s].stack]; }) });
    t.lastHand = h;
    return h;
  }

  // ---------------------------------------------------------------- views and drivers
  // what one seat may see (other hole cards only once shown). seat = -1 for a spectator.
  function view(h, seat) {
    return {
      id: h.id, street: h.street, board: h.board.slice(), pot: pot(h), currentBet: h.currentBet, minRaise: h.minRaise, button: h.button, sb: h.sb, bb: h.bb,
      ante: h.ante, toAct: h.toAct, done: h.done, pos: h.pos,
      players: h.order.map(function (s) {
        var p = h.players[s];
        return { seat: s, id: p.id, name: p.name, pos: h.pos[s], stack: p.stack, committed: p.committed, total: p.total + p.anteP, folded: p.folded, allIn: p.allIn,
          hole: s === seat || p.shown ? p.hole.slice() : null };
      }),
      legal: h.toAct >= 0 ? legal(h) : null,
      log: h.log.filter(function (e) { return e.ev !== 'deal' || e.seat === seat; })
    };
  }
  // agent(h, seat, legal) -> action. agents: a function, or an array indexed by seat, or a map id -> function
  function pick(agents, h, s) { return typeof agents === 'function' ? agents : Array.isArray(agents) ? agents[s] : agents[h.players[s].id]; }
  function runHand(t, agents, opts) {
    var h = startHand(t, opts); if (!h) return null;
    var guard = 0;
    while (!h.done && h.toAct >= 0) { if (++guard > 500) throw new Error('runaway hand'); act(h, pick(agents, h, h.toAct)(h, h.toAct, legal(h))); }
    return h;
  }
  function runHandAsync(t, agents, opts) {
    var h = startHand(t, opts); if (!h) return Promise.resolve(null);
    return (function loop() {
      if (h.done || h.toAct < 0) return Promise.resolve(h);
      return Promise.resolve(pick(agents, h, h.toAct)(h, h.toAct, legal(h))).then(function (a) { act(h, a); return loop(); });
    })();
  }
  // helpers for agents
  function actionsOn(h, street) { return h.log.filter(function (e) { return e.ev === 'act' && (!street || e.street === street); }); }
  function chipsInPlay(t) { var s = 0; t.seats.forEach(function (p) { if (p) s += p.stack; }); return s; }

  return {
    STREETS: STREETS, POS_NAMES: POS_NAMES,
    createTable: createTable, sit: sit, stand: stand, sitOut: sitOut, sitIn: sitIn, setBlinds: setBlinds, nextSeat: nextSeat,
    startHand: startHand, legal: legal, act: act, pot: pot, buildPots: buildPots, view: view, inHand: inHand,
    runHand: runHand, runHandAsync: runHandAsync, actionsOn: actionsOn, chipsInPlay: chipsInPlay
  };
});
