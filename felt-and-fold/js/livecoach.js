/* Felt & Fold: live coach. A short read of the hero's decision while it is still open: the situation, the price,
   the hand and its equity, the read on the opponent, and one question to ask. It uses only what the hero can see:
   the hero's cards, the board so far, the betting, and the reads. Opponent cards and later board cards are never read.
   The panel never names the baseline's action; hint() does, on request.
   FF.LiveCoach.panel(h, seat, opts) -> { lines: [{k, label, text, tm}], math, summary }
   FF.LiveCoach.hint(h, seat, opts)  -> { source, rows, text, tm, math }
   opts: { reads: {playerId: FF.Reads read}, readsOff, profiles: {playerId: {tier, style}} (custom tables only) }
   Amounts are written as "4.5bb"; the UI converts them with its units switch.
   UMD: window.FF.LiveCoach in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./ranges.js'), require('./strategy.js'), require('./ai.js'), require('./review.js'));
  else { root.FF = root.FF || {}; root.FF.LiveCoach = factory(root.FF.Cards, root.FF.Engine, root.FF.Ranges, root.FF.Strategy, root.FF.AI, root.FF.Review); }
})(typeof self !== 'undefined' ? self : this, function (C, E, R, S, AI, RV) {
  'use strict';
  var PANEL_Q = 'normal', HINT_Q = 'review';
  function rd(x, n) { var k = Math.pow(10, n == null ? 1 : n); return Math.round(x * k) / k; }
  function bbs(x) { var v = rd(x, 1); return (v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1)) + 'bb'; }
  function pc(x) { return x > 0.99 && x < 1 ? 'over 99%' : x > 0 && x < 0.01 ? 'under 1%' : Math.round(x * 100) + '%'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var STREET_WORD = { preflop: 'Before the flop', flop: 'On the flop', turn: 'On the turn', river: 'On the river' };
  var POS_WORD = { BTN: 'on the button', SB: 'in the small blind', BB: 'in the big blind', CO: 'in the cutoff', HJ: 'in the hijack', LJ: 'in the lojack',
    UTG: 'under the gun', UTG1: 'second to act', UTG2: 'third to act' };
  var NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  var STYLE_WORD = { Nit: 'a nit', Rock: 'a rock', TAG: 'a solid player', LAG: 'a loose-aggressive player', 'Calling Station': 'a calling station', Maniac: 'a maniac', Trappy: 'a trappy player' };

  function first(name) { return String(name || 'This player').split(' ')[0]; }
  function nameOf(h, s, seat) { return s === seat ? 'You' : first(h.players[s].name); }
  function postOrder(h, s) { var n = h.players.length; return (s - h.button - 1 + n) % n; }
  function isAgg(e) { return e.type === 'bet' || e.type === 'raise' || (e.type === 'allin' && e.to > e.betBefore); }
  function opponents(h, seat) { return h.order.filter(function (s) { return s !== seat && !h.players[s].folded; }); }
  function streetActs(h) { return h.log.filter(function (e) { return e.ev === 'act' && e.street === h.street; }); }
  function list(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  // math tokens in the review's format ( id  text ); the UI turns them into buttons
  function Mx() { var m = { n: 0, list: {} }; m.tok = function (text, t) { var id = 'L' + (m.n++); t.text = text; m.list[id] = t; return '' + id + '' + text + ''; }; return m; }
  function unmark(s) { return String(s).replace(/[^]*([^]*)/g, '$1'); }

  // the opponent the panel talks about: the bettor when facing a bet, else the last earlier aggressor still in, else the first one left
  function villainOf(h, seat, L) {
    var opp = opponents(h, seat); if (!opp.length) return null;
    var acts = h.log.filter(function (e) { return e.ev === 'act' && e.seat !== seat && opp.indexOf(e.seat) >= 0 && isAgg(e); });
    if (L.toCall > 0) { var cur = acts.filter(function (e) { return e.street === h.street; }); if (cur.length) return cur[cur.length - 1].seat; }
    if (acts.length) return acts[acts.length - 1].seat;
    // an unraised preflop pot: the first limper, else nobody yet
    if (h.street === 'preflop') { var lim = h.log.filter(function (e) { return e.ev === 'act' && e.street === 'preflop' && e.type === 'call' && e.seat !== seat && opp.indexOf(e.seat) >= 0; }); return lim.length ? lim[0].seat : null; }
    return opp.slice().sort(function (a, b) { return postOrder(h, a) - postOrder(h, b); })[0];
  }

  // ---------------------------------------------------------------- the five lines
  function actWord(e, h) {
    if (e.type === 'fold') return 'folded';
    if (e.type === 'check') return 'checked';
    if (e.type === 'call') return 'called' + (e.add > 0 ? ' ' + bbs(e.add / h.bb) : '');
    if (e.type === 'bet') return 'bet ' + bbs(e.to / h.bb);
    if (e.type === 'raise') return 'raised to ' + bbs(e.to / h.bb);
    return 'went all in for ' + bbs(e.to / h.bb);
  }
  function situation(h, seat, L, opp, v) {
    var pos = h.pos[seat], st = h.street, out = [];
    var who = opp.length === 1 ? ', heads-up against ' + first(h.players[opp[0]].name) : opp.length > 1 ? ', ' + (NUM[opp.length + 1] || opp.length + 1) + ' players in the hand' : '';
    out.push(STREET_WORD[st] + who + '.');
    out.push('You are ' + (POS_WORD[pos] || 'at ' + pos) + ' (' + pos + ').');
    if (st !== 'preflop' && opp.length) {
      var ip = opp.every(function (o) { return postOrder(h, o) < postOrder(h, seat); });
      out.push(ip ? 'You are in position.' : 'You are out of position.');
    }
    // this street's betting so far, folds run together
    var acts = streetActs(h), parts = [], folds = [];
    var flush = function () { if (folds.length) parts.push(folds.length > 2 ? cap(NUM[folds.length] || String(folds.length)) + ' players folded' : list(folds) + ' folded'); folds = []; };
    acts.forEach(function (e) {
      if (e.type === 'fold' && e.seat !== seat) { folds.push(nameOf(h, e.seat, seat)); return; }
      flush(); parts.push(nameOf(h, e.seat, seat) + ' ' + actWord(e, h));
    });
    if (!acts.length) out.push('You are first to act.');
    else if (acts.every(function (e) { return e.type === 'fold'; })) out.push('It folded to you.');
    else { flush(); out.push(parts.map(cap).join('. ') + '.'); }
    out.push('The pot is ' + bbs(L.pot / h.bb) + '.');
    return out.join(' ');
  }
  function unopened(h) { return h.street === 'preflop' && !h.log.some(function (e) { return e.ev === 'act' && e.street === 'preflop' && isAgg(e); }); }
  function price(h, L, M) {
    // nothing to call, or only the big blind (a first-in decision is not priced by pot odds)
    if (!(L.toCall > 0) || unopened(h)) return null;
    var call = L.call, pot = L.pot, need = call / (pot + call);
    var t = M.tok(pc(need), { title: 'Pot odds', words: 'call ÷ (pot + call)', formula: bbs(call / h.bb) + ' ÷ (' + bbs(pot / h.bb) + ' + ' + bbs(call / h.bb) + ') = ' + pc(need),
      note: 'The price of the call: the chips you put in against the pot you can win.', source: 'The bet and pot on the table.', meaning: 'A call breaks even when the hand wins this often.' });
    return { need: need, tm: 'It costs ' + bbs(call / h.bb) + ' to call into a pot of ' + bbs(pot / h.bb) + '. The pot odds ask for ' + t + ' equity.' };
  }
  // the hand's class and its equity against what the opponents' betting says they hold
  function handInfo(h, seat, L, opp, v, M) {
    var p = h.players[seat], a = p.hole[0], b = p.hole[1], st = h.street, o = { eq: null, kind: null, draw: null };
    if (st === 'preflop') {
      var cls = C.classOfCards(a, b), name = C.CLASS_NAME[cls], aggr = h.log.some(function (e) { return e.ev === 'act' && e.street === 'preflop' && e.seat === v && e.type !== 'fold'; });
      var vs, eq;
      if (v != null && aggr) {
        var f = S.preflopRange(h, v, h.log.length); eq = R.eqVsRange(f)[cls];
        var raised = h.log.some(function (e) { return e.ev === 'act' && e.street === 'preflop' && e.seat === v && isAgg(e); });
        vs = first(h.players[v].name) + (raised ? '\'s raising range' : '\'s calling range');
      } else { eq = R.vsRandom()[cls]; vs = 'one random hand'; }
      o.eq = eq; o.kind = 'preflop'; o.name = name; o.short = name;
      o.tm = 'You hold ' + name + '. It has about ' + M.tok(pc(eq), eqMath(eq, vs)) + ' equity against ' + vs + '.';
      return o;
    }
    var q = S.quality(); S.setQuality(PANEL_Q);
    try {
      var tr = S.advance(S.tracker(h), h.log.length), ctx = S.nodeAt(tr, S.decisionFromLegal(h, L)), i = C.comboIndex(a, b);
      var board = tr.board, ds = S.describe(a, b, board), dr = st === 'river' ? null : S.draws(a, b, board);
      var e = ctx.eq[i]; if (!(e === e)) e = 0.5;
      o.eq = e; o.kind = ds.kind; o.draw = dr && dr.label && dr.outs > 0 ? dr : null;
      var drawTxt = o.draw ? 'a ' + o.draw.label + ' (' + o.draw.outs + ' outs)' : '';
      var made = ds.kind === 'air' ? (o.draw ? drawTxt + ', with ' + ds.label + ' for now' : 'nothing made yet (' + ds.label + ')') : ds.label + (o.draw ? ' plus ' + drawTxt : '');
      vs = ctx.nOpp > 1 ? 'the likely ranges of the ' + NUM[ctx.nOpp] + ' players still in' : first(h.players[v].name) + '\'s likely range';
      o.short = (ds.kind === 'air' ? (o.draw ? '' : ds.label) : ds.label) + (o.draw ? (ds.kind === 'air' ? '' : ' + ') + o.draw.label : '');
      o.tm = 'You have ' + made + '. That is about ' + M.tok(pc(e), eqMath(e, vs)) + ' equity against ' + vs + '.';
    } finally { S.setQuality(q); }
    return o;
  }
  function eqMath(e, vs) {
    return { title: 'Equity', words: 'Your share of the pot if all the cards were dealt out, averaged over ' + vs + '.', formula: 'about ' + pc(e),
      note: 'The range comes from the betting so far. The other players\' cards are not used.', source: 'Sampled runouts of the cards still to come.', meaning: 'A hand with this equity wins this share of the pot at showdown.' };
  }
  function traitText(tr) {
    var s = [];
    if (tr.calls === 'loose') s.push('Calls bets too often.'); else if (tr.calls === 'tight') s.push('Folds to bets too often.');
    if (tr.bluffs === 'high') s.push('Bluffs often.'); else if (tr.bluffs === 'low') s.push('Rarely bluffs.');
    return s.join(' ');
  }
  function readInfo(h, seat, v, opts) {
    if (v == null) return { text: unopened(h) ? 'Nobody has put in chips beyond the blinds yet.' : 'No opponent left to read.', traits: null };
    var p = h.players[v], nm = first(p.name), pr = opts.profiles && opts.profiles[p.id];
    if (pr && pr.tier && AI && AI.traits) {
      var tr0 = AI.traits(pr), who = pr.style === 'TAG' ? (pr.tier === 'Beginner' ? 'a beginner' : pr.tier === 'Casual' ? 'a casual player' : 'a solid regular') : STYLE_WORD[pr.style] || 'a player';
      return { text: 'You set ' + nm + ' up as ' + who + '.' + (traitText(tr0) ? ' ' + traitText(tr0) : ''), traits: tr0, name: nm };
    }
    if (opts.readsOff) return { text: 'Reads are off in Settings.', traits: null, name: nm };
    var r = opts.reads && opts.reads[p.id];
    if (r && r.state === 'read') {
      var tag = String(r.tag || '').split(' · ')[0], tt = traitText(r.traits || {});
      return { text: nm + ' ' + (tag || 'plays solid') + ' (' + r.hands + ' hands seen).' + (tt ? ' ' + tt : ''), traits: r.traits || null, name: nm };
    }
    if (r && r.state === 'prior') return { text: 'No read on ' + nm + ' yet. ' + r.line, traits: null, name: nm };
    return { text: 'No read on ' + nm + '.', traits: null, name: nm };
  }
  function question(h, seat, L, hi, pr, rdI, opp) {
    var st = h.street, eq = hi.eq, t = rdI.traits || {}, nm = rdI.name || 'this player', pos = h.pos[seat];
    if (st === 'preflop') {
      if (pr) return 'How does ' + hi.name + ' do against the range that put in this bet?';
      var limped = h.log.some(function (e) { return e.ev === 'act' && e.street === 'preflop' && e.type === 'call'; });
      if (limped) return 'What hands do the players who just called hold?';
      return 'Is ' + hi.name + ' strong enough to play from ' + pos + ', with ' + (opp.length === 1 ? 'one player' : opp.length + ' players') + ' still to act?';
    }
    if (pr) {
      if (t.bluffs === 'low' && eq < 0.6) return 'How often does ' + nm + ' bet here without a strong hand?';
      if (t.bluffs === 'high') return nm + ' bluffs a lot. How many of those bluffs does your hand beat?';
      if (hi.draw && st !== 'river') return 'Do your ' + hi.draw.outs + ' outs give you the ' + pc(pr.need) + ' you need?';
      if (eq >= pr.need + 0.2) return st === 'river' ? 'Which of the hands that bet here do you beat, and which beat you?' : 'Your equity is well above the price. What could the next card change?';
      if (pc(eq) === pc(pr.need)) return 'Your ' + pc(eq) + ' matches the price almost exactly. ' + (st === 'river' ? 'Which of the hands that bet here do you beat?' : 'Which cards to come help you, and which hurt?');
      return 'Is your ' + pc(eq) + ' above the ' + pc(pr.need) + ' the price asks?';
    }
    if (eq >= 0.6) return t.calls === 'loose' ? nm + ' calls a lot. Which medium and worse hands of ' + nm + '\'s would pay off a bet?' : 'Which worse hands would call a bet?';
    if (eq <= 0.35) {
      if (t.calls === 'loose') return nm + ' rarely folds. What does a bet win against a player who calls this much?';
      if (hi.draw) return 'If the next card misses, how often does this hand still win?';
      return 'Which better hands would fold to a bet?';
    }
    return 'Does this hand want a bigger pot, or a small one?';
  }

  function panel(h, seat, opts) {
    opts = opts || {};
    var L = E.legal(h, seat), opp = opponents(h, seat), v = villainOf(h, seat, L), M = Mx();
    var pr = price(h, L, M), hi = handInfo(h, seat, L, opp, v, M), rdI = readInfo(h, seat, v, opts);
    var lines = [{ k: 'sit', label: 'Situation', tm: situation(h, seat, L, opp, v) }];
    if (pr) lines.push({ k: 'price', label: 'Price', tm: pr.tm });
    lines.push({ k: 'hand', label: 'Hand', tm: hi.tm });
    lines.push({ k: 'read', label: 'Read', tm: rdI.text });
    lines.push({ k: 'ask', label: 'Ask yourself', tm: question(h, seat, L, hi, pr, rdI, opp) });
    lines.forEach(function (l) { l.text = unmark(l.tm); });
    var sum = cap(hi.short || 'your hand') + ' · about ' + pc(hi.eq) + (pr ? ' · need ' + pc(pr.need) : '');
    return { lines: lines, math: M.list, summary: sum, eq: hi.eq, need: pr ? pr.need : null, villain: v };
  }

  // ---------------------------------------------------------------- the hint: the baseline the review grades against
  function hint(h, seat) {
    var q = S.quality(), res; S.setQuality(HINT_Q);
    try { res = S.evaluate(h, seat, { noEV: true }); } finally { S.setQuality(q); }
    var L = E.legal(h, seat), bb = h.bb, src = 'estimate';
    if (h.street === 'preflop' && res.spot) { var sp = res.spot; src = sp.kind === 'push' || sp.kind === 'reshove' || (sp.kind === 'vsJam' && sp.depth <= 15) ? 'Nash' : 'chart'; }
    return hintFrom(res.mix, src, h, L);
  }
  // also used for a solver mix that arrives later
  function hintFrom(mix, src, h, L) {
    var bb = h.bb, sz = { pot: L.pot / bb, heroIn: L.committed / bb, facing: L.currentBet / bb, preflop: h.street === 'preflop' }, M = Mx();
    var rows = RV.mixPct(mix).map(function (r) {
      var m = r.m, agg = m.action === 'bet' || m.action === 'raise' || m.action === 'allin';
      var label = m.action === 'allin' ? 'all in' : m.action + (agg && m.to > 0 ? ' ' + RV.sizeText(sz, m.action, m.to / bb, 'short') : '');
      return { action: m.action, to: m.to || 0, pct: r.pct, label: label };
    });
    var tm = 'Baseline (' + src + '): ' + rows.map(function (r) {
      return M.tok(r.pct + '%', { title: 'Baseline mix', words: 'How often the baseline takes this action with this hand here.', formula: r.pct + '%',
        source: src === 'chart' ? 'The preflop chart.' : src === 'Nash' ? 'The Nash push/fold range.' : src === 'estimate' ? 'The built-in estimate (the same one the review grades with).' : 'A GTO solve of this spot.',
        meaning: 'A mixed spot splits between actions. Any action the baseline takes often is fine.' }) + ' ' + r.label;
    }).join(', ') + '.';
    return { source: src, rows: rows, tm: tm, text: unmark(tm), math: M.list };
  }
  // mark the decision now open as one where the hint was shown; the review reads h.coachHints[e.n]
  function markHint(h) { if (!h.coachHints) Object.defineProperty(h, 'coachHints', { value: {}, writable: true, enumerable: false, configurable: true }); h.coachHints[h.log.length] = true; }

  return { panel: panel, hint: hint, hintFrom: hintFrom, markHint: markHint, unmark: unmark };
});
