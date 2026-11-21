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
  // ---------------------------------------------------------------- show the math
  // While a decision's text is built, MX collects its number tokens. Each %/bb figure is wrapped in private-use markers
  // (\uE000 id \uE001 text \uE002) and its working is kept in MX.list: the formula with this hand's numbers, a JS
  // expression that reproduces the value, where the inputs come from and what the number means. unmark() strips the markers.
  var MX = null;
  function unmark(s) { return String(s == null ? '' : s).replace(/\uE000[^\uE001]*\uE001([^\uE002]*)\uE002/g, '$1'); }
  function tok(text, t) {
    if (!MX) return text;
    var id = 'n' + (MX.n++);
    t.id = id; t.text = text; MX.list[id] = t;
    return '\uE000' + id + '\uE001' + text + '\uE002';
  }
  function fmtV(v, unit) { return unit === 'bb' ? bbs(v) : pc(v); }
  // formula pieces: [value, type] with type 'bb' (1 decimal, written "4.5bb"), 'p' (whole percent) or 'x' (2 decimals)
  function fv(x) { var v = x[0], t = x[1]; return t === 'p1' ? rd(v * 100, 1) + '%' : t === 'bb' ? (v < -0.049 ? '(−' + bbs(-v) + ')' : bbs(Math.abs(v))) : t === 'p' ? Math.round(v * 100) + '%' : String(rd(v, 2)); }
  function ev0(x) { var v = x[0], t = x[1]; return String(t === 'bb' ? rd(v, 1) : t === 'p1' ? rd(v, 3) : rd(v, 2)); }
  function fill(tpl, vals, f) { return tpl.replace(/\{(\w+)\}/g, function (a, k) { return vals[k] ? f(vals[k]) : a; }); }
  // a formula that must reproduce v within rounding; null when it does not
  function fx(words, tpl, vals, v, unit) {
    var expr = fill(tpl, vals, ev0).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'), got;
    try { got = Function('return (' + expr + ');')(); } catch (e) { return null; }
    if (!isFinite(got) || Math.abs(got - v) > (unit === 'bb' ? 0.11 + Math.abs(v) * 0.02 : 0.012)) return null;
    return { words: words, formula: fill(tpl, vals, fv) + (fmtV(got, unit) === fmtV(v, unit) ? ' = ' : ' ≈ ') + fmtV(v, unit), expr: expr };
  }
  // a figure read straight from a model or solve: its expression is the value itself
  function direct(v, unit, from) { return { words: from, formula: fmtV(v, unit), expr: String(unit === 'bb' ? rd(v, 2) : rd(v, 3)) }; }
  var SRC_NAME = { Library: 'the solved library (a GTO solve of this flop)', Solved: 'a solver run on this spot', Chart: 'the preflop chart',
    Nash: 'the Nash push/fold tables', Estimate: "the rule-based estimate (this spot isn't solved)", Multiway: 'the multiway model' };
  function srcName(d) { return SRC_NAME[d && d.source] || (d && d.source ? 'the ' + d.source + ' baseline' : 'the baseline'); }
  var RK = 'AKQJT98765432';
  // a short range text: the hand classes the range holds at half its top weight or more, grouped as "TT+", "ATs+", "K9o-K7o"
  function rangeText(W) {
    if (!W || !C.CLASS_OF) return '';
    var sum = new Float64Array(169), cnt = new Float64Array(169), mx = 0, i;
    for (i = 0; i < W.length; i++) { var c = C.CLASS_OF[i]; sum[c] += W[i]; cnt[c]++; }
    for (i = 0; i < 169; i++) { if (cnt[i]) sum[i] /= cnt[i]; if (sum[i] > mx) mx = sum[i]; }
    if (!(mx > 0)) return '';
    // class index: row 12 - hi, column 12 - lo; suited above the diagonal
    var on = function (hi, lo, s) { var r = 12 - hi, c2 = 12 - lo; return (s ? sum[r * 13 + c2] : sum[c2 * 13 + r]) >= 0.5 * mx; };
    var out = [], runs = function (list, name) {
      var j = 0;
      while (j < list.length) {
        if (!list[j].on) { j++; continue; }
        var a = j; while (j + 1 < list.length && list[j + 1].on) j++;
        out.push(a === 0 && j > 0 ? name(list[j]) + '+' : a === j ? name(list[a]) : name(list[a]) + '-' + name(list[j])); j++;
      }
    };
    var pairs = []; for (var p = 12; p >= 0; p--) pairs.push({ hi: p, lo: p, on: on(p, p, false) });
    runs(pairs, function (x) { return RK[12 - x.hi] + RK[12 - x.hi]; });
    [true, false].forEach(function (s) {
      for (var hi = 12; hi >= 1; hi--) {
        var row = []; for (var lo = hi - 1; lo >= 0; lo--) row.push({ hi: hi, lo: lo, on: on(hi, lo, s) });
        runs(row, function (x) { return RK[12 - x.hi] + RK[12 - x.lo] + (s ? 's' : 'o'); });
      }
    });
    return out.length > 12 ? out.slice(0, 12).join(', ') + ' and more' : out.join(', ');
  }
  // the hero's opponents at this decision and their ranges at that moment
  function oppRanges() {
    if (!MX || !MX.h || !S.advance) return null;
    if (MX.opp !== undefined) return MX.opp;
    var tr = null; try { tr = S.advance(S.tracker(MX.h), MX.e.n); } catch (e) { tr = null; }
    var seats = tr ? S.activeSeats(tr).filter(function (s) { return s !== MX.seat && tr.W[s]; }) : [];
    MX.opp = seats.length ? seats.map(function (s) {
      return { name: (MX.h.players[s] && MX.h.players[s].name || 'Opponent').split(' ')[0], pct: C.rangePercent(tr.W[s]), text: rangeText(tr.W[s]) };
    }) : null;
    return MX.opp;
  }
  function samplesText(st) {
    var q = S.qualityInfo ? S.qualityInfo() : null;
    if (st === 'preflop') return 'Preflop equity comes from a table of each starting hand against each other one.';
    if (st === 'river') return 'On the river each hand in the range is compared directly.';
    if (!q) return '';
    return st === 'flop' ? 'The turn and river were dealt out ' + q.flop + ' ways for each hand.' : 'The river was dealt out ' + q.turn + ' ways for each hand.';
  }
  function eqSource(d, what) {
    var o = oppRanges();
    var r = o ? o.map(function (x) { return x.name + '\'s range: about ' + Math.max(1, Math.round(x.pct * 100)) + '% of all hands' + (x.text ? ' (' + x.text + ')' : '') + '.'; }).join(' ') : '';
    what = what || 'Your hand against the opponent\'s likely hands.';
    return 'An equity run of ' + what.charAt(0).toLowerCase() + what.slice(1) + (r ? ' ' + r : '') + ' ' + samplesText(d.street);
  }
  function foldSource(d) {
    var x = d.exploit && d.exploit.gradedBy === 'exploit';
    return x ? 'The player model for ' + d.exploit.name + '.' : 'The fold model of ' + srcName(d) + '.';
  }
  // a tokenized figure of kind k: P for a share, B for an amount in big blinds
  function P(k, v, o) { return tok(pc(v), mathOf(k, v, 'pct', o || {})); }
  function B(k, v, o) { return tok(bbs(v), mathOf(k, v, 'bb', o || {})); }
  // one play's EV from the Estimate's pieces, in bb: { line: 'Call: 1% × 317.5bb − 42bb = −41.4bb', expr, kept }; null when the pieces miss
  var ACT_NAME = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
  function sideEV(d, act, want) {
    var inf = d.info || {}, ps = inf.parts, bb = (ps && ps.bb) || d.bbChips || 1, tpl, vals, kept = false;
    if (want == null || !ps) return null;
    if (act === 'fold') { tpl = '0bb'; vals = {}; }
    else if (act === 'call' || act === 'check') {
      var R = ps.R == null ? 1 : ps.R, imp = ps.imp || 0, pot = act === 'call' ? ps.pot + ps.call : ps.pot;
      if (act === 'call' && !(ps.call > 0)) return null;
      kept = Math.abs(R - 1) > 0.005 || imp > 0.0005;
      tpl = (imp > 0.0005 ? '({e} × {r} + {i})' : kept ? '{e} × {r}' : '{e}') + ' × {w}' + (act === 'call' ? ' − {c}' : '');
      vals = { e: [ps.eq, ps.eq < 0.1 ? 'p1' : 'p'], r: [R, 'x'], i: [imp, 'p'], w: [pot / bb, 'bb'], c: [ps.call / bb, 'bb'] };
    } else {
      var g = [inf.hero, inf.bet, inf.raise].filter(function (y) { return y && y.parts && Math.abs(y.ev / bb - want) < 0.06; })[0];
      if (!g) return null;
      var q = g.parts, rest = (q.rest || 0) / bb; kept = Math.abs(q.R - 1) > 0.005;
      tpl = '{f} × {p} + {c} × ({e} × {w}' + (kept ? ' × {r}' : '') + ' − {a})' + (Math.abs(rest) > 0.05 ? (rest < 0 ? ' − {x}' : ' + {x}') : '');
      vals = { f: [g.fold, 'p'], p: [q.pot / bb, 'bb'], c: [g.call != null ? g.call : 1 - g.fold, 'p'], e: [g.eqVsCall, g.eqVsCall < 0.1 ? 'p1' : 'p'], w: [q.win / bb, 'bb'], r: [q.R, 'x'], a: [q.add / bb, 'bb'], x: [Math.abs(rest), 'bb'] };
    }
    var m = act === 'fold' ? (Math.abs(want) < 0.06 ? { formula: '0bb', expr: '0' } : null) : fx('', tpl, vals, want, 'bb');
    if (!m) return null;
    var res = want < -0.049 ? '−' + bbs(-want) : bbs(Math.abs(want));
    return { line: (ACT_NAME[act] || act) + ': ' + (act === 'fold' ? '0bb' : m.formula.replace(/ [=≈] [^=≈]*$/, (m.formula.indexOf(' ≈ ') >= 0 ? ' ≈ ' : ' = ') + res)), expr: m.expr, val: want, kept: kept };
  }
  // the cost as each side's sum, then the difference; null when either side's pieces are missing
  function costSides(d, v) {
    var ha = d.did && d.did.action, ba = d.bestAction;
    if (!ha || !ba || ha === ba || d.heroEVUsed == null || d.bestEV == null || !d.info) return null;
    var h = sideEV(d, ha, d.heroEVUsed), b = sideEV(d, ba, d.bestEV);
    if (!h || !b) return null;
    var c = fx('', '{a} − {b}', { a: [d.bestEV, 'bb'], b: [d.heroEVUsed, 'bb'] }, v, 'bb');
    if (!c) return null;
    return { words: "each play's EV, then the difference", formula: h.line + '. ' + b.line + '. Cost: ' + c.formula + '.', expr: c.expr,
      note: h.kept || b.kept ? 'The plain number in a line is the share of its equity the hand keeps once more bets come. Out of position it keeps less. Draws gain a little from later bets.' : '' };
  }
  function mathOf(k, v, unit, o) {
    var d = MX ? MX.d : {}, f = d.factors || [], po = F(f, 'potOdds'), icm = F(f, 'icm'), m = null, t = { kind: k, value: v, unit: unit };
    var pre = d.street === 'preflop', x = d.exploit, xg = x && x.gradedBy === 'exploit';
    if (k === 'need') {
      t.title = 'Pot odds';
      if (po && po.toCall > 0) m = fx('call ÷ (pot + call)', '{c} ÷ ({p} + {c})', { c: [po.toCall, 'bb'], p: [po.pot, 'bb'] }, v, unit);
      t.source = 'The bet and pot on the table.';
      t.note = 'The price of the call: the chips you put in against the pot you can win.';
      t.meaning = 'A call breaks even when the hand wins this often.';
    } else if (k === 'needIcm') {
      t.title = 'Price with ICM';
      if (po && icm) m = fx('pot odds + ICM premium', '{a} + {b}', { a: [po.need, 'p'], b: [icm.premium, 'p'] }, v, unit);
      t.source = 'The bet and pot on the table, plus the payout table.';
      t.meaning = 'With prizes at stake, a call needs this much equity.';
    } else if (k === 'icm') {
      t.title = 'ICM premium'; m = direct(v, unit, 'from the payout model');
      t.source = 'The ICM model of the payout table.';
      m.note = 'It weighs what busting costs in prize money against what winning the pot adds.';
      t.meaning = 'The extra equity a call needs because losing costs more than the chips.';
    } else if (k === 'have') {
      t.title = 'Your equity';
      if (!pre && po && po.raw != null) m = fx('raw equity × share you keep + implied odds', '{e} × {r} + {i}', { e: [po.raw, 'p'], r: [po.R, 'x'], i: [po.imp || 0, 'p'] }, v, unit);
      if (m) m.note = 'Raw equity is how often the hand wins if all the cards come out. A hand rarely keeps all of it, and out of position it keeps less. Draws gain a little from later bets.';
      else m = direct(v, unit, 'from an equity run');
      t.source = eqSource(d, pre ? 'Your hand against the raiser\'s likely hands.' : 'Your hand against the hands that bet here.');
      t.meaning = 'How often the hand wins, adjusted for how much of that it can use.';
    } else if (k === 'eq' || k === 'eqc') {
      t.title = k === 'eq' ? 'Equity' : 'Equity when called'; m = direct(v, unit, 'from an equity run');
      m.note = k === 'eq' ? 'Your hand was played out against each hand in the range. Ties count as half.'
        : 'Only the hands that call stay in. The model drops the hands that fold, then plays yours against the rest.';
      t.source = eqSource(d, k === 'eqc' ? 'Your hand against the part of the range that calls.' : o.mw ? 'Your hand against the other players\' likely hands.' : null);
      t.meaning = k === 'eq' ? 'How often the hand wins at showdown if nobody folds.' : 'How often the hand wins when the bet gets called.';
    } else if (k === 'fold') {
      t.title = 'Fold rate'; m = direct(v, unit, 'from the fold model');
      t.source = o.base ? 'The fold model of ' + srcName(d) + '.' : foldSource(d);
      m.note = 'The share of the opponent\'s range that folds to this size.';
      t.meaning = 'How often the bet wins the pot at once.';
    } else if (k === 'be') {
      t.title = 'Folds a bluff needs';
      if (o.bet > 0) m = fx('bet ÷ (pot + bet)', '{b} ÷ ({p} + {b})', { b: [o.bet, 'bb'], p: [o.pot, 'bb'] }, v, unit);
      t.source = 'The bet size and the pot before it.';
      t.note = 'The bet you risk against the pot you win when the opponent folds.';
      t.meaning = 'A bet that never wins when called breaks even if the opponent folds this often.';
    } else if (k === 'mdf') {
      t.title = 'Minimum defense';
      var mf = F(f, 'mdf');
      if (mf && mf.size > 0) m = fx('1 ÷ (1 + bet as a share of the pot)', '1 ÷ (1 + {s})', { s: [mf.size, 'x'] }, v, unit);
      t.source = 'The bet size and the pot it goes into.';
      t.meaning = 'Fold more than the rest and the bettor profits by bluffing with any two cards.';
    } else if (k === 'defend') {
      t.title = 'Baseline defense'; m = direct(v, unit, 'from the baseline strategy');
      t.source = srcName(d) + '.';
      m.note = 'The share of your range it keeps against this bet.';
      t.meaning = 'How much of your range the baseline keeps here.';
    } else if (k === 'rank') {
      t.title = 'Place in your range'; m = direct(v, unit, 'from ranking each hand in your range on this board');
      t.source = 'The range model, with each hand in your range ranked by equity against the opponent.';
      t.meaning = o.top ? 'The share of your range that is this strong or stronger.' : 'The share of your range that beats this hand.';
    } else if (k === 'nut') {
      t.title = 'Strong hands'; m = direct(v, unit, 'from the range model');
      t.source = 'The range model, with the ranges each line of play leaves.';
      m.note = 'The share of each range that holds a strong made hand on this board.';
      t.meaning = 'A range with more strong hands can bet bigger and more often.';
    } else if (k === 'rangeEq') {
      t.title = 'Range equity';
      var ra = F(f, 'rangeAdv');
      if (ra) m = fx('50% + range edge', '{h} ' + (v < 0.5 ? '−' : '+') + ' {a}', { h: [0.5, 'p'], a: [Math.abs(ra.value), 'p'] }, v, unit);
      t.source = 'An equity run of your whole range against the opponent\'s whole range on this board.';
      t.meaning = 'Above 50% means the range is ahead on average.';
    } else if (k === 'freq' || k === 'mix') {
      t.title = k === 'freq' ? 'Baseline frequency' : 'Baseline mix'; m = direct(v, unit, 'from ' + srcName(d));
      if (k === 'mix') m.note = 'The shares are rounded to add up to 100%.';
      t.source = srcName(d) + '.';
      t.meaning = k === 'freq' ? 'How often the baseline makes this play with this hand here.' : 'How often the baseline takes each play with this hand.';
    } else if (k === 'share') {
      t.title = 'Range width';
      m = fx('hands in range ÷ all 1326 hands', '{n} ÷ 1326', { n: [Math.round(v * 1326), 'x'] }, v, unit);
      t.source = srcName(d) + ' for this position and stack.';
      t.meaning = 'The share of all starting hands that make this play here.';
    } else if (k === 'cost' || k === 'gain') {
      t.title = k === 'cost' ? 'Cost' : 'Gain';
      if (xg && Math.abs((x.loss || 0) - v) < 0.06) m = fx('best EV − your EV against ' + x.name, '{a} − {b}', { a: [x.bestEV, 'bb'], b: [x.heroEV, 'bb'] }, v, unit);
      if (!m && k === 'cost' && !xg) m = costSides(d, v);
      if (!m && d.bestEV != null && d.heroEVUsed != null) m = fx('best play\'s EV − your play\'s EV', '{a} − {b}', { a: [d.bestEV, 'bb'], b: [d.heroEVUsed, 'bb'] }, v, unit);
      if (!m && d.freqFloor && d.mix && d.mix[0]) {
        m = fx('10% × pot × (top play\'s share − your share − 10%)', '{t} × {p} × ({a} − {b} − {t})', { t: [0.1, 'p'], p: [d.potBB, 'bb'], a: [d.mix[0].freq, 'p'], b: [d.heroFreq, 'p'] }, v, unit);
        if (m) m.note = 'The EV sketch calls the plays close. A play the baseline almost never makes still costs a little.';
      }
      if (!m && d.capped) { m = direct(v, unit, 'the grade line, capped'); m.note = d.capped === 'bluff' ? 'A bluff\'s value rests on the fold rate. The cost stops just under the Mistake line.' : 'Without a solve, the cost stops just under the Blunder line.'; }
      if (!m && (d.limpSize || d.raiseSize) && d.sizeOff) { m = direct(v, unit, 'the size floor'); m.note = 'A raise size far from the chart costs at least 0.35bb or 10% of the pot. A tiny re-raise costs at least 1.2bb or 20%.'; }
      if (!m) m = direct(v, unit, 'from ' + srcName(d));
      t.source = (xg ? 'The player model for ' + x.name + ', with ' : '') + srcName(d) + '.';
      if (!m.note) m.note = 'EV is the average number of chips a play wins.';
      t.meaning = k === 'cost' ? 'The chips this play loses on average, next to the best play.' : 'What the better play adds on average.';
    } else if (k === 'xev') {
      t.title = 'EV against ' + (x ? x.name : 'this player');
      var ob = o.obj, ps = ob && ob.parts, pas = o.pas, bb = d.bbChips || 1;
      if (ps && ps.win != null) {
        var rest = (ps.rest || 0) / bb, tpl = '{f} × {p} + {c} × ({e} × {w} × {r} − {a})' + (Math.abs(rest) > 0.05 ? (rest < 0 ? ' − {x}' : ' + {x}') : '');
        m = fx('fold rate × pot + call rate × (win rate when called × pot won × share kept − chips added)', tpl,
          { f: [ob.fold, 'p'], p: [ps.pot / bb, 'bb'], c: [ob.call != null ? ob.call : 1 - ob.fold, 'p'], e: [ob.eqVsCall, 'p'], w: [ps.win / bb, 'bb'], r: [ps.R, 'x'], a: [ps.add / bb, 'bb'], x: [Math.abs(rest), 'bb'] }, v, unit);
        if (m && Math.abs(rest) > 0.05) m.note = 'The last term is what happens when the player raises back.';
      } else if (pas && pas.eq != null) {
        var b2 = pas.bb || bb;
        m = o.act === 'call' ? fx('(equity × share kept + implied odds) × (pot + call) − call', '({e} × {r} + {i}) × ({p} + {c}) − {c}', { e: [pas.eq, 'p'], r: [pas.R, 'x'], i: [pas.imp || 0, 'p'], p: [pas.pot / b2, 'bb'], c: [pas.call / b2, 'bb'] }, v, unit)
          : o.act === 'check' ? fx('equity × share kept × pot', '{e} × {r} × {p}', { e: [pas.eq, 'p'], r: [pas.R, 'x'], p: [pas.pot / b2, 'bb'] }, v, unit) : null;
      }
      if (!m && o.act === 'fold' && Math.abs(v) < 0.06) m = { words: 'a fold puts in nothing more and wins nothing more', formula: '0bb', expr: '0' };
      if (!m) m = direct(v, unit, 'from the player model');
      t.source = 'The player model for ' + (x ? x.name : 'this player') + '.';
      if (!m.note) m.note = 'The model tracks how often this player folds, calls and raises against this size. It also tracks the hands they call with.';
      t.meaning = 'The chips this play wins on average against this player.';
    } else if (k === 'size') {
      t.title = 'Chart size'; m = direct(v, unit, 'from the chart\'s sizing rule');
      t.source = o.src || 'The preflop chart\'s sizing rule.';
      m.note = o.note || 'The rule uses a set multiple of the bet, plus a big blind for each caller.';
      t.meaning = 'The size the chart uses here.';
    } else if (k === 'split') {
      t.title = 'EV edge';
      if (d.ev && d.mix && d.mix[0]) { var a1 = evOf(d.ev, d.did.action), a2 = evOf(d.ev, d.mix[0].action); if (a1 != null && a2 != null) m = fx('your play\'s EV − top play\'s EV', '{a} − {b}', { a: [a1, 'bb'], b: [a2, 'bb'] }, v, unit); }
      t.source = 'The EV sketch of ' + srcName(d) + '.';
      t.meaning = 'How much more the EV sketch gives your play.';
    } else if (k === 'realize') {
      t.title = 'Share of equity kept';
      m = fx('(' + (o.ip ? '0.95 in position' : '0.82 out of position') + ' + 0.4 × (equity − 0.5) − hand-type cut) × 0.88 for each extra player',
        '(' + (o.ip ? '0.95' : '0.82') + ' + 0.4 × ({e} − {h}) − {c}) × {k}', { e: [o.have, 'p'], h: [0.5, 'p'], c: [o.cut, 'p'], k: [Math.pow(0.88, o.k - 1), 'x'] }, v, unit);
      if (m) m.note = 'The words round this share. Offsuit hands lose a little, more without a high card.';
      t.source = 'The preflop model of realized equity, the same one the chart uses.';
      t.meaning = 'The part of its raw equity this hand wins once more bets come.';
    } else if (k === 'width' || k === 'kept') {
      t.title = k === 'width' ? 'Preflop range' : 'Range kept';
      if (k === 'width') m = fx('hands this player plays ÷ all 1326 hands', '{n} ÷ 1326', { n: [Math.round(v * 1326), 'x'] }, v, unit);
      else m = fx('share of hands left ÷ share before this action', '{a} ÷ {b}', { a: [o.after, 'p1'], b: [o.before, 'p1'] }, v, unit);
      if (m) m.note = 'The words round this to a simple fraction. Hands are weighted: a hand played half the time counts as half.';
      else m = direct(v, unit, 'from the range model');
      t.source = 'The range model for this player.';
      m.note = (m.note ? m.note + ' ' : '') + 'The model starts from the player\'s preflop range and narrows it with each action.';
      t.meaning = k === 'width' ? 'The share of all starting hands this player plays this way.' : 'The share of the player\'s hands that take this line.';
    }
    if (!m) m = direct(v, unit, 'from ' + srcName(d));
    t.words = m.words; t.formula = m.formula; t.expr = m.expr; if (m.note) t.note = m.note;
    return t;
  }
  // build a text with tokens: open MX, build, keep the marked text and the tokens it shows
  function withMath(ctx, build) {
    var outer = MX, list, marked;
    MX = { n: 0, list: {}, d: ctx.d || {}, h: ctx.h, seat: ctx.seat, e: ctx.e };
    try { marked = build(); } finally { list = MX.list; MX = outer; }
    marked = String(marked == null ? '' : marked);
    var used = {};
    marked.replace(/\uE000([^\uE001]*)\uE001/g, function (a, id) { if (list[id]) used[id] = list[id]; return a; });
    return { tm: marked, math: used, text: unmark(marked) };
  }
  // the markers around "about over 99%": the word stays outside the token
  // a decision's text with its number tokens: d.text plain, d.tm marked, d.math the tokens
  function setText(h, seat, e, d) {
    var r = withMath({ d: d, h: h, seat: seat, e: e }, function () { return explain(h, seat, e, d); });
    d.text = r.text; d.tm = r.tm; d.math = r.math;
    if (d.reason) d.reason = unmark(d.reason);
  }
  // the text a units converter would show for a token's formula; conv turns "4.5bb" text into chips or dollars
  function mathView(t, conv) {
    var c = conv || function (x) { return x; };
    return { title: t.title, words: t.words, formula: c(t.formula), note: t.note || '', source: c(t.source || ''), meaning: t.meaning || '', text: c(t.text) };
  }
  // the EV parts for a play in the player model: a bet or raise has its own object, a check or call uses the shared parts
  function xo(d, act) {
    var x = d.exploit, i = (x && x.info) || {};
    if (isAgg(act) || act === 'allin') return { act: act, obj: act === d.did.action && i.hero ? i.hero : i.bet || i.raise || i.hero };
    return { act: act, pas: i.parts };
  }
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
  // ---------------------------------------------------------------- sizes in words
  // after the flop a bet is a share of the pot before it; a raise is a multiple of the bet it faces; preflop stays in bb.
  // A friendly fraction stands when it is within 4% of the pot; otherwise a percentage.
  // short form (legends, the You line): "half pot", "third pot", "2x pot", "58% pot"
  // sentence form: "half the pot", "a third of the pot", "twice the pot", "58% of the pot"
  var FRIENDLY = [[0.25, 'quarter pot', 'a quarter of the pot'], [1 / 3, 'third pot', 'a third of the pot'], [0.5, 'half pot', 'half the pot'],
    [2 / 3, 'two-thirds pot', 'two-thirds of the pot'], [0.75, 'three-quarters pot', 'three-quarters of the pot'], [1, 'pot', 'the pot'],
    [1.5, '1.5x pot', '1.5 times the pot'], [2, '2x pot', 'twice the pot']];
  function potWords(f, long) {
    var best = null, bd = Infinity;
    FRIENDLY.forEach(function (x) { var g = Math.abs(f - x[0]); if (g <= 0.04 * Math.max(1, x[0]) + 1e-9 && g < bd) { bd = g; best = x; } });
    if (best) return long ? best[2] : best[1];
    var p = Math.round(100 * f); return p + (long ? '% of the pot' : '% pot');
  }
  function sizeWord(f) { return potWords(f, true); }
  function times(x) { var v = rd(x, 1); return (v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1)) + 'x'; }
  // a size in words from the street total `to` (bb). sz.pot: the pot before the action; sz.heroIn: the hero's chips in
  // on the street; sz.facing: the bet faced (street total, bb). form 'short': "half pot" / "to 3x" / "all in";
  // 'long': "half the pot (6.5bb)" / "to 3x (19.5bb)" / "all in (48bb)"; unit formats the chips.
  function sizeText(sz, action, toBB, form, unit) {
    unit = unit || bbs;
    var add = toBB - (sz.heroIn || 0), long = form === 'long';
    if (action === 'allin') return long ? 'all in (' + unit(toBB) + ')' : 'all in';
    if (sz.preflop) return 'to ' + unit(toBB);
    if (action === 'raise' && sz.facing > 0) return 'to ' + times(toBB / sz.facing) + (long ? ' (' + unit(toBB) + ')' : '');
    if (!(sz.pot > 0)) return unit(add);
    return potWords(add / sz.pot, long) + (long ? ' (' + unit(add) + ')' : '');
  }
  function szOf(d) { return { pot: d.pot, heroIn: d.heroIn, facing: d.facing, preflop: d.street === 'preflop' }; }
  // the hero's action as a label: "Bet half pot (6.5 bb)", "Raise to 3x (19.5 bb)", "All-in (48 bb)", "Raise to 4.7 bb".
  // Works on saved history too: it needs only street, pot, toCall and did {action, toBB, addBB}.
  function didLabel(d, unit) {
    unit = unit || function (x) { return trim1(x) + ' bb'; };
    var a = d.did.action, toBB = d.did.toBB, heroIn = rd(toBB - (d.did.addBB || 0), 2);
    if (a === 'allin') return 'All-in (' + unit(toBB) + ')';
    if (a === 'call') return 'Call' + (d.toCall ? ' ' + unit(d.toCall) : '');
    if (a !== 'bet' && a !== 'raise') return cap(a);
    var sz = { pot: d.pot, heroIn: heroIn, facing: heroIn + (d.toCall || 0), preflop: d.street === 'preflop' };
    if (sz.preflop) return cap(a) + ' to ' + unit(toBB);
    var s = sizeText(sz, a, toBB, 'short', unit);
    return cap(a) + ' ' + s + (a === 'raise' && sz.facing > 0 ? ' (' + unit(toBB) + ')' : / pot$/.test(s) || s === 'pot' ? ' (' + unit(d.did.addBB) + ')' : '');
  }
  function trim1(x) { var v = rd(x, 1); return v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1); }
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
    parts.push((sp.ip ? 'in position' : 'out of position') + (sp.oppSeats.length === 1 && h.pos && h.pos[sp.oppSeats[0]] ? ' against the ' + h.pos[sp.oppSeats[0]] : ''));
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
  // why a deep all in is worse than the chart's raise. A middling hand is called by better hands and folds out worse ones.
  // The top of the range (AA, or KK and QQ with 70%+ against the raiser) only loses the worse hands that would pay off a smaller raise.
  var PAIRS = 'AKQJT98765432';
  function topPair(d, po) {
    var hd = d.hand || '';
    if (hd.length !== 2 || hd[0] !== hd[1]) return null;
    if (hd === 'AA' || (po && po.have >= 0.7 && (hd === 'KK' || hd === 'QQ'))) return hd;
    return null;
  }
  function jamWhy(d, po) {
    var top = topPair(d, po);
    if (!top) return 'Better hands call the jam and worse ones fold.';
    var k = PAIRS.indexOf(top[0]), next = PAIRS[k + 1] + PAIRS[k + 1];
    return (top === 'AA' ? 'AA is the best hand.' : top + ' loses only to ' + PAIRS.slice(0, k).split('').map(function (r) { return r + r; }).join(' and ') + ' here.')
      + ' The jam folds the worse hands that would pay you off after a smaller raise. Only a few, like ' + next + ', call.';
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
  // a solved size (chips added / pot) in words: a share of the pot for a bet, a multiple of the bet faced for a raise
  function pctPot(d, p) {
    if (p.action === 'allin') return 'all in'; if (p.action === 'check') return 'a check'; if (p.action === 'call') return 'a call';
    if (p.action === 'raise' && d.facing > 0) return 'a raise to ' + times(((d.heroIn || 0) + p.size * d.pot) / d.facing);
    return 'a bet of ' + sizeWord(p.size);
  }
  // the library or solver graded a size it was not solved for, or turned the bet into all in
  function mapNote(d) {
    if (d.forcedAllin) return 'The solver treats a bet of over two-thirds of your stack as all in. This bet was graded as all in.';
    var m = d.heroMap;
    if (!m || m.mode === 'near' || d.source === 'Estimate') return '';
    var lib = d.source === 'Library' ? 'The library' : 'The solver', mine = d.did.action === 'raise' && d.facing > 0 ? 'raise to ' + times(((d.heroIn || 0) + m.hero * d.pot) / d.facing) : 'bet of ' + sizeWord(m.hero);
    if (m.mode === 'blend' && m.lo && m.hi) return lib + ' has no ' + mine + ' here. This grade blends its results for ' + pctPot(d, m.lo) + ' and ' + pctPot(d, m.hi) + '.';
    return lib + ' has no ' + mine + ' here. This grade starts from its result for ' + pctPot(d, m.near) + ' and adds a rough cost for the size.';
  }
  // a postflop bet or raise the baseline did not try, matched to its nearest size (the legend's rule: same action, within
  // 0.55-1.7x) when that size is at least one named step away: "The baseline did not try a pot-size bet. Your bet is
  // graded as its closest size, three-quarters pot." Silent when mapNote or the size-off line already speaks to the size.
  function step(f) { var b = 0; FRIENDLY.forEach(function (x, i) { if (Math.abs(f - x[0]) < Math.abs(f - FRIENDLY[b][0])) b = i; }); return b; }
  function closestNote(d) {
    var a = d.did && d.did.action;
    if ((d.source !== 'Library' && d.source !== 'Solved') || d.street === 'preflop' || (a !== 'bet' && a !== 'raise') || !(d.did.toBB > 0) || !(d.bbChips > 0) || d.sizeOff || d.forcedAllin || (d.exploit && d.exploit.gradedBy === 'exploit') || mapNote(d)) return '';
    var best = null, bd = Infinity;
    (d.mix || []).forEach(function (m) {
      if (m.action !== a || !(m.to > 0)) return;
      var x = Math.abs(Math.log(d.did.toBB / (m.to / d.bbChips))); if (x < bd) { bd = x; best = m; }
    });
    if (!best || bd > Math.log(1.7)) return '';
    var sz = szOf(d), refBB = best.to / d.bbChips, mine = sizeText(sz, a, d.did.toBB, 'short'), ref = sizeText(sz, a, refBB, 'short');
    if (mine === ref) return '';
    if (a === 'bet' || !(sz.facing > 0)) {
      if (!(sz.pot > 0) || step((d.did.toBB - (sz.heroIn || 0)) / sz.pot) === step((refBB - (sz.heroIn || 0)) / sz.pot)) return '';
    } else if (Math.round(2 * d.did.toBB / sz.facing) === Math.round(2 * refBB / sz.facing)) return '';
    var noun = a === 'raise' && sz.facing > 0 ? 'raise' : 'bet';
    return 'The baseline did not try a ' + (noun === 'raise' ? 'raise ' + mine : (mine === 'pot' ? 'pot-size' : mine) + ' bet') + '. Your ' + noun + ' is graded as its closest size, ' + ref + '.';
  }
  function evOf(ev, act) {
    if (ev[act] != null) return ev[act];
    if (isAgg(act)) { var b = null; ['bet', 'raise', 'allin'].forEach(function (k) { if (ev[k] != null && (b == null || ev[k] > b)) b = ev[k]; }); return b; }
    if (act === 'check' && ev.call != null) return ev.call; if (act === 'call' && ev.check != null) return ev.check;
    return null;
  }
  // Estimate, Chart and Nash grades stop at Mistake unless simple math settles the case (see settled());
  // an Estimate missed bluff stops at Inaccuracy. Solved and Library grades keep the full range.
  var LIMP_SIZE_COST = 0.35;
  // a preflop raise (an open, 3-bet, squeeze or 4-bet) far from the chart's size, where raising is right: at least
  // RAISE_SIZE_COST or 10% of the pot. A re-raise under 40% of the chart's size costs at least RAISE_TINY_COST or 20% of
  // the pot: it offers every player a cheap price and folds out no one, and the chip model cannot see that.
  var RAISE_SIZE_COST = 0.35, RAISE_TINY_COST = 1.2;
  // preflop, a play the chart never makes (under 3% while one action holds 97%) is at least an Inaccuracy once it costs
  // NEVER_COST: a cheap spot keeps its small cost, but the grade does not call it Good
  var NEVER_COST = 0.15;
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
  // a call, bet or raise that throws away nearly all it puts in: a loss of 75%+ of the chips risked,
  // when those chips are at least 5bb and a tenth of the stack. Graded Blunder whatever the pot size or source.
  function wasted(d, loss) {
    var risk = d.did.addBB || 0, a = d.did.action;
    return a !== 'fold' && a !== 'check' && risk >= 5 && risk >= 0.1 * (d.stack || 0) && loss >= 0.75 * risk;
  }
  function gradeDecision(d) {
    d.wasted = false;
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
    // a raise over limpers, compared with the target size at sizeOff's gap. When raising is right, a size that far off
    // costs at least LIMP_SIZE_COST or 10% of the pot: the chip model prices a small raise as if the limpers folded to it.
    d.limpSize = null;
    if (d.limpTo > 0 && d.did.action === 'raise' && d.did.toBB > 0) {
      var lr = d.did.toBB / d.limpTo;
      if (lr < 0.55 || lr > 1.7) {
        d.limpSize = { to: d.limpTo, small: lr < 1 };
        if (hm.freq >= GOOD_FREQ) { sizeOff = true; loss = Math.max(loss, LIMP_SIZE_COST, 0.1 * (d.potBB || 0)); }
      }
    }
    d.raiseSize = null;
    if (!d.limpSize && d.street === 'preflop' && d.did.action === 'raise' && d.did.to > 0 && ref && ref.action === 'raise' && ref.to > 0 && d.raiseCtx) {
      var rr = d.did.to / ref.to;
      if (rr < 0.55 || rr > 1.7) {
        d.raiseSize = { to: ref.toBB, small: rr < 1 };
        if (hm.freq >= GOOD_FREQ) {
          sizeOff = true;
          var fl = Math.max(RAISE_SIZE_COST, 0.1 * (d.potBB || 0));
          if (d.raiseCtx.n >= 1 && rr < 0.4) fl = Math.max(fl, RAISE_TINY_COST, 0.2 * (d.potBB || 0));
          loss = Math.max(loss, fl);
        }
      }
    }
    d.sizeRef = sizeOff ? ref : null;
    var good = hm.freq >= GOOD_FREQ && !sizeOff;
    d.heroFreq = rd(hm.freq, 3); d.bestAction = bestAct; d.bestEV = rd(best, 2); d.heroEVUsed = heroEV == null ? null : rd(heroEV, 2);
    d.evLost = good ? 0 : rd(loss, 2);
    d.cost = rd(loss, 2);
    // a call is graded against the pot it plays for, so a big shove call is not judged by the blinds alone
    d.grade = good ? 'Good' : gradeFor(loss, Math.max(d.potBB, d.toCall || 0), d.street === 'preflop');
    d.never = false;
    if (d.grade === 'Good' && !good && d.street === 'preflop' && hm.freq < 0.03 && d.mix[0] && d.mix[0].freq >= 0.97 && loss >= NEVER_COST) { d.grade = 'Inaccuracy'; d.never = true; }
    if (!good && wasted(d, loss)) { d.grade = 'Blunder'; d.wasted = true; }
    if (d.forceGrade && GRADES.indexOf(d.forceGrade) > GRADES.indexOf(d.grade)) { d.grade = d.forceGrade; d.evLost = Math.max(d.evLost, d.forceLoss || 0); }
    d.sizeOff = !!sizeOff;
    if (d.grade !== 'Good' && d.source !== 'Solved' && d.source !== 'Library') {
      var th = thresholds(d);
      d.settled = settled(d);
      if (d.missedBluff && d.source === 'Estimate' && GRADES.indexOf(d.grade) > 1) { d.grade = 'Inaccuracy'; d.evLost = rd(Math.min(d.evLost, th.mistake - 0.05), 2); d.capped = 'bluff'; }
      else if (d.grade === 'Blunder' && !d.settled && !d.wasted) { d.grade = 'Mistake'; d.evLost = rd(Math.min(d.evLost, th.blunder - 0.05), 2); d.capped = 'estimate'; }
    }
    // the frequency grades against the play while the EV sketch prefers it: the review says so first, and the grade stops at Inaccuracy
    var hv = evOf(d.ev, d.did.action), bv = bestAct ? evOf(d.ev, bestAct) : null;
    d.evSplit = d.grade !== 'Good' && d.freqFloor && hv != null && bv != null && hv - bv > 0.3 ? rd(hv - bv, 2) : 0;
    if (d.evSplit && !d.wasted && GRADES.indexOf(d.grade) > 1) { d.grade = 'Inaccuracy'; d.evLost = rd(Math.min(d.evLost, thresholds(d).mistake - 0.05), 2); }
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
      return (isAgg(m.action) ? (m.action === 'allin' ? 'all in' : m.action + (m.sizeLabel ? ' ' + m.sizeLabel : '')) : m.action) + ' ' + tok(r.pct + '%', mathOf('mix', r.pct / 100, 'pct', {}));
    }).join(', ');
  }
  // each bet or raise in the mix gets its short size label (see sizeText)
  function labelMix(d) {
    var sz = szOf(d);
    d.mix.forEach(function (m) { if (isAgg(m.action)) m.sizeLabel = m.to > 0 && d.bbChips ? sizeText(sz, m.action, m.to / d.bbChips, 'short') : ''; });
  }
  function F(factors, kind) { return factors.filter(function (f) { return f.kind === kind; })[0]; }

  function buildDecision(h, seat, e, opts) {
    var res = S.evaluate(h, seat, { n: e.n, heroTo: (e.type === 'bet' || e.type === 'raise') ? e.to : null });
    var bb = h.bb, potBB = (e.potBefore - e.toCall) / bb, did = { action: heroAction(e), to: e.to || 0, add: e.add || 0 };
    did.toBB = rd(did.to / bb, 1); did.addBB = rd(did.add / bb, 1);
    if (isAgg(did.action) && e.street !== 'preflop') did.size = rd(did.add / Math.max(1, e.potBefore), 2);
    var mix = res.mix.map(function (m) {
      var o = { action: m.action, size: m.size, to: m.to || 0, freq: m.freq };
      if (isAgg(m.action)) o.toBB = rd(o.to / bb, 1);
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
      if (sp.kind === 'bbVsLimp' || sp.kind === 'isolate') {
        var lim = [], rz = false, hp = h.pos[seat];
        h.log.slice(0, e.n).forEach(function (x) { if (x.ev !== 'act' || x.street !== 'preflop') return; if (x.type === 'raise' || x.type === 'bet') rz = true; else if (x.type === 'call' && !rz && x.seat !== seat) lim.push(h.pos[x.seat]); });
        d.limpers = lim.length;
        // in position: the hero acts after the limpers on later streets (the BB against a lone SB complete, at a full table)
        d.limpIP = (hp !== 'SB' && hp !== 'BB') || (hp === 'BB' && lim.length === 1 && lim[0] === 'SB' && h.order.length > 2);
        d.limpTo = sp.jam || !sp.raiseToBB ? 0 : sp.raiseToBB; // the raise size over the limpers, in bb (none when the raise would be all in)
      }
    }
    if (e.street === 'preflop' && res.spot && isAgg(did.action) && ['push', 'reshove', 'vsJam', 'bbVsLimp', 'isolate', 'walk'].indexOf(res.spot.kind) < 0) {
      // the raises and callers before this one, for the size text: the open, callers after it, the last raise, position
      var rz = [], cl = 0, n2 = h.order.length, ord = function (s) { return (s - h.button - 1 + n2) % n2; }, lastS = null;
      h.log.slice(0, e.n).forEach(function (x) { if (x.ev !== 'act' || x.street !== 'preflop' || x.seat === seat) return;
        if (x.type === 'raise' || x.type === 'bet') { rz.push(x.to / bb); lastS = x.seat; } else if (x.type === 'call' && rz.length === 1) cl++; });
      d.raiseCtx = { n: rz.length, open: rz[0] || 0, last: rz[rz.length - 1] || 0, callers: cl, ip: lastS != null && ord(seat) > ord(lastS) && h.pos[seat] !== 'SB' && h.pos[seat] !== 'BB' };
    }
    if (e.street === 'preflop' && res.spot) { var cs = 0; for (var q2 = 0; q2 < 169; q2++) cs += res.spot.call[q2] * C.CLASS_SIZE[q2]; d.chartCall = rd(cs / 1326, 3); if (res.spot.priced) d.priced = res.spot.priced; }
    d.boardStr = C.cardsStr(d.board);
    d.heroIn = rd((e.betBefore - e.toCall) / bb, 2); // the hero's chips already in on this street, in bb
    d.facing = rd(e.betBefore / bb, 2); // the bet the hero faces (street total), in bb
    d.bbChips = bb;
    labelMix(d);
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
    setText(h, seat, e, d);
    d.leak = leakOf(h, seat, e, d);
    return d;
  }

  // ---------------------------------------------------------------- against this player
  // the review knows each bot's tier and style. Against an easy read (Beginner or Casual tier, or a Calling Station,
  // Maniac or Nit) the grade comes from the EV of each option when that bot plays the way it really plays; against
  // Regular, Shark and Solver the baseline grades and the second view only adds a sentence when the two disagree.
  var STYLE_WORD = { Nit: 'a nit', Rock: 'a rock', TAG: 'a tight-aggressive player', LAG: 'a loose-aggressive player', 'Calling Station': 'a calling station',
    Maniac: 'a maniac', Trappy: 'a trappy player' };
  // the profile the review may use: the read as of this hand (opts.reads, from FF.Reads), or a profile the hero
  // chose (opts.profiles, custom tables and tests). The hidden profile at the seat is never used.
  function profileOf(h, s, opts) {
    var p = h.players[s], rr = opts.reads && p && opts.reads[p.id];
    if (rr && rr.profile && rr.profile.tier) return { tier: rr.profile.tier, style: rr.profile.style, name: p.name, read: rr };
    var pr = opts.profiles && p && opts.profiles[p.id];
    return pr && pr.tier ? pr : null;
  }
  function modelsFor(h, seat, opts) {
    if (!AI || !AI.model) return null;
    var m = {}, sig = [], any = false;
    h.order.forEach(function (s) {
      if (s === seat) return;
      var pr = profileOf(h, s, opts); if (!pr || !AI.TIERS[pr.tier]) return;
      m[s] = AI.model(pr); m[s].person = (pr.name || h.players[s].name || 'This player').split(' ')[0]; m[s].read = pr.read || null;
      m[s].name = pr.read && pr.read.state === 'prior' ? pr.read.label : m[s].person;
      sig.push(s + pr.tier + pr.style); any = true;
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
      differ: differ, name: mdl.name, person: mdl.person, state: mdl.read ? mdl.read.state : 'known', id: h.players[x.villain].id, tier: mdl.tier, style: mdl.style, traits: mdl.traits, eq: rd(x.eq, 3), eqBase: rd(x.eqBase, 3),
      info: { hero: x.info.hero || null, bet: x.info.bet || x.info.raise || null, parts: x.info.parts || null }, rangePct: x.rangePct, basePct: x.basePct };
    d.exploit.who = mdl.read ? mdl.read.line : whoLine(d.exploit);
  }
  // the exploit view grades: same thresholds, no frequency floor, Blunder only when the numbers settle it
  function applyExploit(d) {
    var x = d.exploit; if (!x) return;
    x.baseGrade = d.grade; x.baseLost = d.evLost;
    if (x.gradedBy !== 'exploit') return;
    d.grade = gradeFor(x.loss, Math.max(d.potBB, d.toCall || 0), false);
    d.wasted = d.grade !== 'Good' && wasted(d, x.loss);
    if (d.wasted) d.grade = 'Blunder';
    d.evLost = d.grade === 'Good' ? 0 : x.loss; d.cost = x.loss; d.capped = null; d.evSplit = 0; d.freqFloor = false;
    d.missedBluff = d.missedBluff && d.grade !== 'Good';
    if (d.grade === 'Blunder' && !d.wasted && d.source !== 'Solved' && d.source !== 'Library' && !settled(d)) { d.grade = 'Mistake'; d.evLost = rd(Math.min(d.evLost, thresholds(d).blunder - 0.05), 2); d.capped = 'estimate'; }
    d.bestAction = x.best;
    // the bar shows the balanced mix; when the grade wants another kind of play, the panel adds this plan under it
    var top = d.mix && d.mix[0] ? d.mix[0].action : null;
    if (top && actKind(top) !== actKind(x.best)) {
      var xb = x.info.bet, unit = function (v) { var r = rd(v, 1); return (r === Math.round(r) ? String(Math.round(r)) : r.toFixed(1)) + ' bb'; };
      var lbl = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' }[x.best] || x.best;
      if (isAgg(x.best) && xb && xb.to && d.bbChips && x.best !== 'allin') lbl += ' ' + sizeText(szOf(d), x.best, xb.to / d.bbChips, 'long', unit);
      x.plan = { action: x.best, label: lbl };
    }
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
  // said: the head already opened with the read sentence
  function exploitText(d, said) {
    var x = d.exploit; if (!x) return '';
    var did = d.did.action, rl = readLine(d), out = [];
    if (x.gradedBy === 'exploit') {
      if (!x.differ && !rl && x.baseGrade === d.grade) return '';
      var xb = x.info.bet, xh = x.info.hero, eq = d.feat ? d.feat.eq : 0.5;
      // a bluff the player's folds pay for: a loose caller who still folds the hands that missed
      var bluff = isAgg(x.best) && !isAgg(did) && xb && xb.fold != null && eq < 0.45 && !d.sizeFix;
      var who = bluff ? x.who.replace(/ ([^.]*) calls too often\./, function (m, w) { return ' ' + w + ' rarely folds a pair. A hand that missed the board often folds.'; }) : x.who;
      if (!said) out.push(who); if (rl && !(d.sizeFix && d.sizeFix.tend)) out.push(rl);
      if (bluff) {
        var risk = xb.to / (d.bbChips || 1) - (d.heroIn || 0), need = risk > 0 ? risk / (d.potBB + risk) : 0;
        out.push('Against ' + x.name + ', a bet of ' + bbs(risk) + ' gets folds about ' + P('fold', xb.fold) + ' of the time.' + (need > 0 && (d.reason || '').indexOf('needs folds about') < 0 ? ' A bluff this size needs about ' + P('be', need, { bet: risk, pot: d.potBB }) + '.' : ''));
      }
      if (d.sizeFix) { /* the verdict already names the better size */ }
      else if (x.best === did && x.loss > 0.05 && xb && xh) out.push('Against ' + x.name + ', a ' + (xb.to > xh.to ? 'bigger' : 'smaller') + ' ' + (did === 'raise' ? 'raise' : 'bet') + ' scores more: about ' + B('xev', x.bestEV, xo(d, x.best)) + ', against ' + B('xev', x.heroEV, xo(d, did)) + ' for yours.');
      else if (x.best !== did && x.loss > 0.05) out.push('Against ' + x.name + ', ' + verbIng(x.best) + ' is worth about ' + B('xev', x.bestEV, xo(d, x.best)) + ' and ' + verbIng(did) + ' about ' + B('xev', x.heroEV, xo(d, did)) + '.');
      else out.push('Against ' + x.name + ', ' + verbIng(did) + ' is the best play here, worth about ' + B('xev', x.heroEV, xo(d, did)) + '.');
      if (x.baseGrade !== d.grade && !d.sizeFix) out.push('Against a balanced opponent this would be ' + (x.baseGrade === 'Good' ? 'fine' : (x.baseGrade === 'Inaccuracy' ? 'an ' : 'a ') + x.baseGrade.toLowerCase()) + '. The grade follows ' + (x.state === 'prior' ? 'how ' + x.name + ' plays' : x.name + '\'s real play') + '.');
      return out.join(' ');
    }
    if (!x.differ) return '';
    out.push(x.who);
    out.push('Against ' + x.name + (x.state === 'prior' ? '\'s usual play, ' : '\'s real play, ') +(x.best === did ? verbIng(did) + ' scores best, worth about ' + B('xev', x.heroEV, xo(d, did)) + '.' : x.bestEV - x.heroEV < 0.3 ? verbIng(x.best) + ' and ' + verbIng(did) + ' score about the same.' : verbIng(x.best) + ' scores about ' + B('gain', x.bestEV - x.heroEV) + ' more than ' + verbIng(did) + '.'));
    out.push('The grade still follows the baseline, because ' + (x.tier === 'Regular' ? 'a regular' : 'a strong player') + ' adjusts.');
    return out.join(' ');
  }

  // a play the balanced baseline likes, marked down because of how this table plays. Three parts, in this order:
  // the verdict against the table with its numbers, why the baseline still likes the play, then what to do here
  function exploitFirst(d, dr) {
    var x = d.exploit, did = d.did.action, best = x.best, eq = d.feat ? d.feat.eq : 0.5, river = d.street === 'river';
    var xb = x.info.bet, xg = x.info.hero || xb, Name = cap(x.name), out = [];
    var base = function (a) { return { allin: 'move all in' }[a] || a; };
    var bluffing = isAgg(did) && eq < 0.45, outs = dr && dr.outs >= 4 && !river;
    // 1. the verdict against the table type, with the numbers
    out.push(d.grade + ' against ' + x.name + '.');
    var them = d.multiway ? 'the other ranges' : x.state === 'prior' ? 'their range' : 'the opponent\'s range';
    if (d.feat && d.feat.hand.kind !== 'board') out.push(handLine(d.feat).replace(/\.$/, '') + ', about ' + P('eq', eq) + ' equity against ' + them + '.');
    else if (d.feat) out.push(handLine(d.feat) + ' The hand has about ' + P('eq', eq) + ' equity against ' + them + '.');
    if (isAgg(did) && xg && xg.fold != null && bluffing) out.push(Name + ' folds to this bet only about ' + P('fold', xg.fold) + ' of the time.');
    else if (isAgg(did) && xg && xg.eqVsCall != null) out.push('When ' + x.name + ' calls, the hand wins about ' + P('eqc', xg.eqVsCall) + '.');
    else if (isAgg(best) && xb && xb.fold != null && eq < 0.45) {
      var risk = xb.to / (d.bbChips || 1) - (d.heroIn || 0), need = risk > 0 ? risk / (d.potBB + risk) : 0;
      out.push('Against ' + x.name + ', a bet of ' + bbs(risk) + ' gets folds about ' + P('fold', xb.fold) + ' of the time.' + (need > 0 ? ' A bluff this size needs about ' + P('be', need, { bet: risk, pot: d.potBB }) + '.' : ''));
    } else if (isAgg(best) && xb && xb.eqVsCall != null) out.push('When ' + x.name + ' calls a bet, the hand wins about ' + P('eqc', xb.eqVsCall) + '.');
    var cost = d.evLost > 0 ? cap(verbIng(did)) + ' cost about ' + B('cost', d.evLost) + '.' : '';
    if (x.loss > 0.05) out.push(cap(verbIng(best)) + ' is worth about ' + B('xev', x.bestEV, xo(d, x.best)) + ', ' + verbIng(did) + ' about ' + B('xev', x.heroEV, xo(d, did)) + (cost ? ': ' + cost.charAt(0).toLowerCase() + cost.slice(1) : '.'));
    else if (cost) out.push(cost);
    // 2. the balanced view, and why the baseline plays it
    var f = d.heroFreq, freq = f >= 0.97 ? 'almost always' : P('freq', f) + ' of the time';
    var size = isAgg(did) && did !== 'allin' && d.did.toBB > 0 ? ' ' + sizeText(szOf(d), did, d.did.toBB, 'short') : '';
    var noun = { bet: 'the bet', raise: 'the raise', allin: 'the all in', check: 'checking', call: 'the call', fold: 'the fold' }[did] || verbIng(did);
    if (x.baseGrade === 'Good') {
      var because = isAgg(did) ? (bluffing ? (river ? ', because a balanced opponent folds often enough to pay for it'
          : ', because the folds it gets plus ' + (outs ? 'your outs' : 'the hand\'s equity') + ' pay for it')
          : ', because worse hands and draws pay to continue')
        : isAgg(best) && eq < 0.45 ? ', because a balanced opponent folds too rarely to pay for a bluff' : '';
      out.push('Against a balanced opponent ' + noun + ' is fine: the baseline ' + verb3(did) + size + ' ' + freq + because + '.');
    } else out.push('Against a balanced opponent this would be ' + (x.baseGrade === 'Inaccuracy' ? 'an ' : 'a ') + x.baseGrade.toLowerCase() + '.');
    // 3. what to do at this table: the table read joined to its habit, then the plan
    var who = x.who, lead = cap(x.name) + ' ';
    var k = who.indexOf('. ' + lead);
    if (x.state === 'prior' && k > 0) {
      var rest = who.slice(k + 2 + lead.length), stop = rest.indexOf('.'), habit = rest.slice(0, stop), tail = rest.slice(stop + 1).trim();
      habit = habit.replace(/^((?:rarely|often|seldom) )?(\w+?)s\b/, '$1$2');
      // the bluff it wants: a loose caller who still folds the hands that missed
      if (!isAgg(did) && isAgg(best) && eq < 0.45 && habit === 'call too often') { habit = 'rarely fold a pair'; tail = ('A hand that missed the board often folds. ' + tail).trim(); }
      who = who.slice(0, k) + ', who ' + habit + '.' + (tail ? ' ' + tail : '');
    }
    out.push(who);
    var rl = readLine(d), plan;
    if (isAgg(did) && !isAgg(best) && eq < 0.45) plan = (outs ? 'With nothing but outs, ' : 'With a weak hand, ') + base(best) + ' rather than bluff.';
    else if (rl) plan = cap(rl.replace(/^Against a player who [^,]*, /, ''));
    else plan = cap(base(best)) + ' rather than ' + base(did) + ' here.';
    out.push(plan);
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
    nash: { term: 'Nash push/fold', phrases: ['Nash push/fold'], def: 'At 15bb or less, play is close to shove or fold. The Nash ranges are the shoves and calls that no opponent can exploit.' },
    limp: { term: 'limper', phrases: ['limper'], def: 'A player who only calls the big blind before the flop instead of raising. Limpers often hold weak or speculative hands.' },
    realized: { term: 'realized equity', phrases: ['realized equity'], def: 'The share of the pot a hand really wins once later streets bring more bets. Hands out of position, against several players, or with few ways to improve keep less than their raw equity.' },
    position: { term: 'position', phrases: ['out of position', 'in position'], def: 'In position means you act after your opponent on every street after the flop. Out of position means you act first, with less to go on.' },
    dominated: { term: 'dominated', phrases: ['dominated'], def: 'Your hand is dominated when an opponent holds one of your cards with a better second card, such as AJ against J8. When you both hit, you win small pots and lose big ones.' },
    // the words any review line can use: hands, draws, boards, betting lines, seats and numbers
    equity: { term: 'equity', phrases: ['equity'], def: 'Your share of the pot if all the cards were dealt out with no more betting. A hand with 40% equity wins about 4 times in 10.' },
    range: { term: 'range', phrases: ['range'], def: 'All the hands a player could hold after acting the way they did. Good players think about the whole range, not one guessed hand.' },
    ev: { term: 'EV', phrases: ['EV'], def: 'Expected value: what a play wins or loses on average over many tries. The review measures it in big blinds.' },
    broadway: { term: 'Broadway', phrases: ['broadway'], def: 'The cards ten through ace (T, J, Q, K, A). A Broadway hand is two of them, like KQ or AJ.' },
    suited: { term: 'suited', phrases: ['suited'], def: 'Both of your cards share a suit, like K♥ 7♥. Suited hands can make flushes.' },
    offsuit: { term: 'offsuit', phrases: ['offsuit'], def: 'Your two cards are of different suits, like K♣ 7♥. Offsuit hands rarely make flushes.' },
    connector: { term: 'suited connector', phrases: ['suited connector', 'suited one-gapper', 'one-gapper', 'connector'], def: 'Two suited cards next to each other in rank, like 8♠ 7♠. A one-gapper skips a rank, like 8♠ 6♠.' },
    pocketPair: { term: 'pocket pair', phrases: ['pocket pair'], def: 'Two cards of the same rank in your hand, like 7♣ 7♦. It makes a set on about 1 flop in 8.' },
    overcards: { term: 'overcards', phrases: ['overcard'], def: 'Cards higher than every card on the board. Two overcards have no pair yet but can pair up to the best one.' },
    topPair: { term: 'top pair', phrases: ['top pair', 'second pair', 'middle pair', 'bottom pair', 'weak pair'], def: 'A pair made with the highest card on the board. Second pair uses the next card down, and a weak pair a lower one.' },
    overpair: { term: 'overpair', phrases: ['overpair'], def: 'A pocket pair higher than every card on the board, like QQ on J-7-2. It beats any one pair made with a board card.' },
    underpair: { term: 'underpair', phrases: ['underpair', 'pocket pair below the top card'], def: 'A pocket pair lower than the top card on the board, like 66 on K-9-2. Anyone holding a king beats it.' },
    kicker: { term: 'kicker', phrases: ['kicker'], def: 'Your other card when you have a pair. When two players hold the same pair, the higher kicker wins.' },
    set: { term: 'set', phrases: ['set of'], def: 'Three of a kind made with a pocket pair and one matching card on the board. Sets are strong and hard to see coming.' },
    trips: { term: 'trips', phrases: ['trips', 'trip'], def: 'Three of a kind made with one card in your hand and a pair on the board. Another player can hold the same card, which makes the kicker matter.' },
    nuts: { term: 'the nuts', phrases: ['nuts', 'nut flush', 'nut straight'], def: 'The best possible hand on this board. A nut flush is the highest flush the board allows.' },
    draw: { term: 'draw', phrases: ['draw', 'drawing'], def: 'A hand that is not made yet but can improve to a strong one, like four cards to a flush. It needs the right card to come.' },
    flushDraw: { term: 'flush draw', phrases: ['nut flush draw', 'flush draw'], def: 'Four cards of one suit, needing a fifth. Nine cards complete it.' },
    straightDraw: { term: 'straight draw', phrases: ['open-ended straight draw', 'open-ended', 'straight draw'], def: 'Four cards toward a straight. An open-ended draw like 9-8-7-6 completes with a card at either end: eight outs.' },
    gutshot: { term: 'gutshot', phrases: ['gutshot'], def: 'A straight draw missing a card in the middle, like 9-8-6-5 needing a 7. Only four cards complete it.' },
    backdoor: { term: 'backdoor draw', phrases: ['backdoor'], def: 'A draw that needs help on both the turn and the river, like three cards of one suit on the flop. It adds a little equity.' },
    outs: { term: 'outs', phrases: ['outs'], def: 'The cards left in the deck that improve your hand to a likely winner. Nine outs on the flop hit by the river about 35% of the time.' },
    showdown: { term: 'showdown', phrases: ['showdown'], def: 'The end of the hand, when the players still in show their cards. The best hand wins the pot.' },
    bluffCatcher: { term: 'bluff-catcher', phrases: ['bluff-catcher', 'bluff-catch'], def: 'A hand that beats only bluffs. It loses to a value bet and wins against a bluff.' },
    open: { term: 'open', phrases: ['open', 'opener', 'first in'], def: 'The first raise before the flop, after everyone before you folded. The opener is the player who made it.' },
    limpIn: { term: 'limp', phrases: ['limp', 'limped pot'], def: 'Calling the big blind before the flop instead of raising. A limped pot is one where nobody raised.' },
    iso: { term: 'iso-raise', phrases: ['iso-raise', 'isolation raise', 'isolate'], def: 'A raise over one or more limpers. It aims to play the pot against the limper alone, often in position.' },
    threeBet: { term: '3-bet', phrases: ['3-bet', '3-bettor', 're-raise'], def: 'The first re-raise before the flop. The big blind counts as the first bet and the open as the second.' },
    fourBet: { term: '4-bet', phrases: ['4-bet', '5-bet'], def: 'A raise over a 3-bet. A 5-bet raises again over that, often all in.' },
    squeeze: { term: 'squeeze', phrases: ['squeeze', 'squeezing'], def: 'A 3-bet after an open and at least one call. The callers rarely hold strong hands, which makes it fold often.' },
    coldCall: { term: 'cold call', phrases: ['cold call'], def: 'Calling a raise with no money in the pot yet on this street.' },
    shove: { term: 'shove', phrases: ['shove', 'shoving', 'reshove', 're-shove', 'jam', 'jamming', 'all in'], def: 'Betting or raising all your chips. A jam means the same.' },
    singleRaised: { term: 'single-raised pot', phrases: ['single-raised pot'], def: 'A pot where one player raised before the flop and the others only called.' },
    multiway: { term: 'multiway', phrases: ['multiway'], def: 'A pot with three or more players. Each hand wins less often, and a bluff has more players to get past.' },
    headsUp: { term: 'heads-up', phrases: ['heads-up'], def: 'Only two players are in the hand.' },
    cbet: { term: 'c-bet', phrases: ['c-bet', 'c-betting'], def: 'A continuation bet: the last raiser before the flop bets again on the flop.' },
    barrel: { term: 'barrel', phrases: ['barrel'], def: 'Betting again on the turn or river after betting the street before. A second bet in a row is a second barrel.' },
    donk: { term: 'lead (donk bet)', phrases: ['donk bet', 'donk', 'lead decision'], def: 'Betting first into the player who raised last on the street before. Players also call it a donk bet.' },
    overbet: { term: 'overbet', phrases: ['overbet', 'overbetting'], def: 'A bet larger than the pot. It suits very strong hands and bluffs, not medium ones.' },
    polar: { term: 'polarised', phrases: ['polarised', 'polarized'], def: 'A range made of very strong hands and bluffs, with few medium hands. Big bets usually come from a polarised range.' },
    capped: { term: 'capped', phrases: ['capped'], def: 'A range with few very strong hands, because the player would have raised those earlier. A capped range struggles against big bets.' },
    texture: { term: 'dry or wet board', phrases: ['dry', 'wet'], def: 'A dry board offers few draws, like K-7-2 in three suits. A wet board offers many, like J-T-8 with two hearts.' },
    suits: { term: 'rainbow board', phrases: ['rainbow', 'two-tone', 'monotone'], def: 'Rainbow means every board card has a different suit. Two-tone has two cards of one suit, and monotone three.' },
    btn: { term: 'BTN', phrases: ['BTN', 'button'], def: 'The button (dealer) seat. It acts last after the flop, which makes it the best seat at the table.' },
    sb: { term: 'SB', phrases: ['SB', 'small blind'], def: 'The small blind posts half a big blind before the cards are dealt. After the flop it acts first.' },
    bb: { term: 'BB', phrases: ['BB', 'big blind'], def: 'The big blind posts one big blind before the cards are dealt. Amounts in bb count big blinds.' },
    utg: { term: 'UTG', phrases: ['UTG', 'UTG1', 'UTG2', 'under the gun'], def: 'Under the gun: the first seat to act before the flop. With the whole table still to act, it plays the fewest hands.' },
    lj: { term: 'LJ', phrases: ['LJ'], def: 'The lojack: the seat two to the right of the cutoff. It plays a few more hands than UTG.' },
    hj: { term: 'HJ', phrases: ['HJ'], def: 'The hijack: the seat two to the right of the button. It opens a bit wider than the earlier seats.' },
    co: { term: 'CO', phrases: ['CO'], def: 'The cutoff: the seat just right of the button. Only the button and the blinds act after it before the flop.' },
    vpip: { term: 'VPIP', phrases: ['VPIP'], def: 'The share of hands a player chooses to put money in before the flop, by calling or raising. A high VPIP means a loose player.' },
    pfr: { term: 'PFR', phrases: ['PFR'], def: 'The share of hands a player raises before the flop. A PFR far below the VPIP means a player who calls a lot.' },
    tag: { term: 'tight-aggressive', phrases: ['tight-aggressive', 'loose-aggressive'], def: 'Tight means playing few hands, loose means playing many. Aggressive players bet and raise more than they call.' },
    rock: { term: 'rock', phrases: ['rock'], def: 'A player who plays very few hands and almost never bluffs. A rock that raises nearly always has a strong hand.' },
    trappy: { term: 'trappy', phrases: ['trappy'], def: 'A player who often checks or calls strong hands to trap you. Their checks are less safe to bet into.' },
    af: { term: 'AF', phrases: ['AF'], def: 'Aggression factor: bets and raises divided by calls after the flop. Above 3 is aggressive, and below 1 is passive.' }
  };
  // links the first mention of each glossary term in one paragraph: the reason's own concepts claim their phrases first,
  // then every other entry. Plurals and -ing/-ed forms count; whole words only; a phrase in capitals (BB, CO, EV) must match its case.
  var termRe = {};
  function linkTerms(text, keys, wrap) {
    var id = (keys || []).join(','), m = termRe[id];
    if (!m) {
      var by = {}, list = [];
      (keys || []).concat(Object.keys(GLOSSARY)).forEach(function (k) {
        if (GLOSSARY[k]) GLOSSARY[k].phrases.forEach(function (p) { var l = p.toLowerCase(); if (!by[l]) { by[l] = { k: k, p: p }; list.push(p); } });
      });
      list.sort(function (a, b) { return b.length - a.length; });
      m = termRe[id] = { by: by, re: new RegExp('\\b(' + list.map(function (p) { return p.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'); }).join('|') + ')(s|es|ing|ed)?\\b', 'gi') };
    }
    var used = {};
    return text.replace(m.re, function (all, p) {
      var e = m.by[p.toLowerCase()];
      if (!e || used[e.k] || (/^[A-Z0-9]+$/.test(e.p) && p !== e.p)) return all;
      used[e.k] = true;
      return wrap(all, e.k);
    });
  }
  function handDesc(name) {
    var r = 'AKQJT98765432', a = r.indexOf(name[0]), b = r.indexOf(name[1]), s = name[2] === 's';
    if (name.length === 2) return a <= 4 ? 'a big pocket pair' : a <= 7 ? 'a middle pocket pair' : 'a small pocket pair';
    if (a <= 4 && b <= 4) return s ? 'a suited broadway hand' : 'an offsuit broadway hand';
    if (a === 0) return s ? 'a suited ace' : 'an offsuit ace';
    if (s && b - a <= 2) return b - a === 1 ? 'a suited connector' : 'a suited one-gapper';
    return s ? 'a suited hand' : 'an offsuit hand';
  }
  // ---- against limpers: why the chart plays the hand its way, from the position, the number of limpers and the kind of hand
  var RANK_WORD = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', T: 'a ten', 9: 'a nine', 8: 'an eight', 7: 'a seven', 6: 'a six', 5: 'a five', 4: 'a four', 3: 'a three', 2: 'a two' };
  function handCat(name) {
    var a = 'AKQJT98765432'.indexOf(name[0]);
    if (name.length === 2) return a <= 4 ? 'premium' : a <= 7 ? 'midPair' : 'smallPair';
    if (/^A[KQ]/.test(name) || name === 'AJs' || name === 'KQs') return 'premium';
    return name[2] === 's' ? 'suited' : 'offsuit';
  }
  function limpWhy(h, seat, d) {
    var n = d.limpers || 1, ip = !!d.limpIP, act = d.mix[0] ? d.mix[0].action : 'check', hand = d.hand, cat = handCat(hand), pos = h.pos[seat];
    var lw = n === 1 ? 'the limper' : n + ' limpers', pair = cat === 'smallPair' ? 'A small pair' : 'A middle pair';
    var conn = /connector|gapper/.test(handDesc(hand)), out = [], K = [];
    var dom = function () { K.push('dominated'); return hand + ' is often dominated: ' + (n === 1 ? 'the limper' : 'with ' + n + ' limpers, one') + ' may hold ' + RANK_WORD[hand[0]] + ' or ' + RANK_WORD[hand[1]] + ' with a better second card. When it hits, it wins small pots and loses big ones.'; };
    var flush = 'a flush' + (conn ? ' or a straight' : '');
    if (act === 'raise' || act === 'allin') {
      if (cat === 'premium') out.push('A strong hand raises for value' + (ip ? '.' : ', even out of position.'), 'Limpers often hold weaker hands that will pay to see the flop.');
      else out.push('Limpers often hold weak hands that fold to a raise.', ip ? 'When one calls, you play the flop in position.' : 'This hand is strong enough to raise even out of position.');
    } else if (act === 'check') {
      out.push('From the BB, checking gives you a free flop.');
      if (cat === 'offsuit') out.push(dom());
      else if (cat === 'suited') out.push('A suited hand can make ' + flush + ' and win a big pot.');
      else if (cat !== 'premium') out.push(pair + ' can win a big pot when it makes three of a kind.');
    } else if (act === 'call') {
      if (cat === 'suited') out.push('A suited hand likes a cheap flop with several players.', 'It can make ' + flush + ' and win a big pot.');
      else if (cat === 'smallPair' || cat === 'midPair') out.push(pair + ' likes a cheap flop with several players.', 'It can win a big pot when it makes three of a kind.');
      else out.push('Calling keeps the pot cheap' + (ip ? ', and you act last after the flop.' : '.'));
    } else if (act === 'fold') {
      if (cat === 'offsuit') out.push(dom());
      else if (!ip && pos === 'SB') out.push('From the SB you act first after the flop, and the BB can still raise.', 'Even a cheap call with ' + hand + ' does not pay here.');
      else out.push(hand + ' is too weak to play against ' + lw + ' here.' + (n >= 2 ? ' A hand does worse the more players see the flop.' : ''));
    }
    var text = out.join(' ');
    if (/out of position|in position/.test(text)) K.push('position');
    if (/limper/.test(text)) K.push('limp');
    return { text: text, concepts: K };
  }
  function actWords(m) { return m.action === 'allin' ? 'moves all in' : verb3(m.action); }
  function reasonPre(h, seat, d) {
    var out = [], K = [], f = d.factors, po = F(f, 'potOdds'), icm = F(f, 'icm'), hand = d.hand, pos = h.pos[seat], good = d.grade === 'Good';
    var did = d.did.action, kind = d.chartKind, share = d.chartShare, inside = d.chartIn >= 0.5;
    function k(x) { if (K.indexOf(x) < 0) K.push(x); }
    if (good && d.heroFreq < 0.7 && d.mix[1] && d.mix[1].freq >= GOOD_FREQ) {
      out.push('This is a mixed spot. The chart plays ' + hand + ' both ways here, and the options are close.'); k('mixed');
      if (d.limpers && hand) { var lm = limpWhy(h, seat, d); if (lm.text) out.push(lm.text); lm.concepts.forEach(k); }
      return { text: out.join(' '), concepts: K };
    }
    if (!kind || kind === 'walk') return { text: '', concepts: K };
    if (kind === 'vsJam' && po) {
      out.push('The pot odds ask for ' + P('need', po.need) + ' equity. ' + hand + ' has about ' + P('have', po.have) + ' against the shoving range.'); k('potOdds');
      if (icm && icm.premium > 0.01) { out.push('The ICM risk premium raises the price to ' + P('needIcm', po.need + icm.premium) + '.'); k('icm'); }
      return { text: out.join(' '), concepts: K };
    }
    var desc = hand + ' (' + handDesc(hand) + ') is ' + (inside ? 'inside' : 'outside') + ' that range.';
    if (kind === 'push' || kind === 'reshove') {
      out.push('At about ' + d.depth + 'bb, the Nash push/fold range ' + (kind === 'push' ? 'from ' + pos + ' shoves' : 'against this raise re-shoves') + ' about ' + P('share', share) + ' of hands. ' + desc); k('nash');
    } else if (kind === 'rfi') out.push('The chart opens about ' + P('share', share) + ' of hands from ' + pos + '. ' + desc);
    else if (kind === 'bbVsLimp' || kind === 'isolate') {
      // a chart that only raises or folds says so, and names the hand's one action
      if (!(d.chartCall > 0.005) && d.mix.length === 1) { out.push('The chart raises about ' + P('share', share) + ' of hands here and folds the rest. ' + hand + ' is ' + (d.mix[0].action === 'fold' ? 'a fold' : 'a raise') + '.'); d.saidAct = true; }
      else out.push('The chart raises about ' + P('share', share) + ' of hands here. ' + desc);
      if (d.limpers && hand) { var lw = limpWhy(h, seat, d); if (lw.text) out.push(lw.text); lw.concepts.forEach(k); }
    }
    else {
      // a priced spot: the share of all hands means little after a small raise, so the line names the hand's action
      if (d.priced && po) { out.push('The pot odds ask for ' + P('need', po.need) + ' equity. ' + hand + ' has about ' + P('have', po.have) + ' against the raiser\'s range.'); k('potOdds'); }
      else out.push('The chart continues with about ' + P('share', share) + ' of hands here. ' + desc);
      if (po && !d.priced && !good && (did === 'call' || d.bestAction === 'call')) { out.push('The pot odds ask for ' + P('need', po.need) + ' equity. ' + hand + ' has about ' + P('have', po.have) + ' against the raiser\'s range.'); k('potOdds'); }
    }
    return { text: out.join(' '), concepts: K };
  }
  function reasonPost(h, seat, d) {
    var out = [], K = [], f = d.factors, good = d.grade === 'Good', did = d.did.action, act = good ? did : d.mix[0] && d.mix[0].freq >= 0.5 ? d.mix[0].action : d.bestAction;
    var po = F(f, 'potOdds'), mdf = F(f, 'mdf'), na = F(f, 'nutAdv'), ra = F(f, 'rangeAdv'), dr = F(f, 'draw'), spr = F(f, 'spr'), bl = F(f, 'blocker');
    var icm = F(f, 'icm'), mw = F(f, 'multiway'), bs = F(f, 'betSize'), info = d.info || {}, bet = isAgg(did) ? (info.hero || info.bet || info.raise) : info.bet;
    var eq = d.feat ? d.feat.eq : 0, hk = d.feat ? d.feat.hand.kind : 'air', outs = dr && d.street !== 'river' ? dr.outs : 0, river = d.street === 'river';
    var checkedFirst = /after checking/.test(d.spot), ipS = / in position/.test(d.spot), oopS = /out of position/.test(d.spot), prem = icm && icm.premium > 0.01 ? icm.premium : 0;
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
        if (prem && po.have >= po.need) say('The ICM risk premium raises the price of a call from ' + P('need', po.need) + ' to ' + P(prem ? 'needIcm' : 'need', need) + '. The hand has about ' + P('have', po.have) + ' against the betting range.', 'icm');
        else if (po.have < po.need) say('The pot odds ask for ' + P('need', po.need) + ' equity. The hand has only about ' + P('have', po.have) + ' against the betting range.', 'potOdds');
        else say('The pot odds ask for ' + P('need', po.need) + ' equity. The hand has about ' + P('have', po.have) + ', but the baseline still folds it at this size.', 'potOdds');
        if (!good && did === 'call' && !river && oopS && po.have >= 0.85 * po.need) say('You are out of position, with more streets to play. You act first on each one. A thin call here often has to fold to the next bet.', 'position');
      } else if (act === 'call') {
        if (po.have >= need) {
          say('The pot odds ask for ' + P(prem ? 'needIcm' : 'need', need) + ' equity' + (prem ? ' with the ICM risk premium' : '') + '. The hand has about ' + P('have', po.have) + ' against the betting range.', 'potOdds');
          if (prem) k('icm');
        } else if (mdf && !mw && !lowBluff(d)) say('The minimum defense frequency against this size is ' + P('mdf', mdf.mdf) + '. The baseline keeps this hand so the bettor cannot bluff at will.', 'mdf');
        else say('The pot odds ask for ' + P(prem ? 'needIcm' : 'need', need) + ' equity. The hand has about ' + P('have', po.have) + ' against the betting range, close to the price.', 'potOdds');
        if (!good && did === 'fold' && !river && ipS && !mw) say('You are in position. You act last on the later streets. That makes a close call easier to play.', 'position');
        if (spr && spr.spr <= 1.5 && eq >= 0.4 && !good) say('The SPR is only about ' + spr.spr + '. With so little behind, this hand is committed.', 'spr');
      } else if (isAgg(act)) {
        if (po.have >= 0.55) { say((checkedFirst ? 'This is a check-raise for value.' : 'This raise is for value.') + ' The hand has about ' + P('have', po.have) + ' against the betting range.', 'valueBet'); if (checkedFirst) k('checkRaise'); }
        else if (outs >= 8) { say(cr + ' is a semi-bluff. It can win the pot now, and the ' + dr.label + ' gives ' + outs + ' outs when called.', 'semiBluff'); if (checkedFirst) k('checkRaise'); }
        else { say('The hand has about ' + P('have', po.have) + ' against the betting range. ' + cr + ' turns it into a bluff.', 'bluff'); if (checkedFirst) k('checkRaise'); }
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
        if (!river && evc != null && evc < 0.5) say('A bet protects a hand with about ' + P('eq', eq) + ' equity. Weaker hands and draws must pay to see the next card.', 'protection');
        else if (evc != null && evc < 0.5) say('A bet takes the pot at once about ' + P('fold', bet.fold, { base: true }) + ' of the time. When called, the hand still wins about ' + P('eqc', evc) + '.');
        else if (evc != null && evc < 0.6) say(vbet(true) + ' ' + whenC + ', the hand wins about ' + P('eqc', wc) + ' of the time.', 'valueBet');
        else if (evc != null) say(vbet(false) + ' ' + whenC + ', the hand still wins about ' + P('eqc', wc) + ' of the time.', 'valueBet');
        else say(vbet(false) + ' The hand has about ' + P('eq', eq) + ' equity against the opponent\'s range.', 'valueBet');
        if (!good && na && na.value >= 0.05) say('Your range also has the nut advantage: ' + P('nut', na.mine) + ' strong hands against ' + P('nut', na.theirs) + '.', 'nutAdv');
        if (!good && spr && spr.spr <= 1.5) say('The SPR is only about ' + spr.spr + '. With so little behind, this hand should get the money in.', 'spr');
      } else if (outs >= 8) {
        say('A bet is a semi-bluff. It can win the pot now, and the ' + dr.label + ' gives ' + outs + ' outs when called.', 'semiBluff');
      } else if (eq < 0.35) {
        say('With about ' + P('eq', eq) + ' equity the hand has little showdown value. Betting turns it into a bluff.', 'bluff');
        if (na && na.value >= 0.05) say('Your range holds more strong hands (' + P('nut', na.mine) + ' against ' + P('nut', na.theirs) + '). That nut advantage makes the bluff believable.', 'nutAdv');
        else if (ra && ra.value >= 0.04 && d.street === 'flop') say('Your range has about ' + P('rangeEq', 0.5 + ra.value) + ' equity against ' + opp + '. That range advantage lets you bet often.', 'rangeAdv');
        if (bl && river) say('Your cards also block some of the opponent\'s strong hands.', 'blockers');
      } else if (ra && ra.value >= 0.04 && d.street === 'flop') {
        say('Your range has about ' + P('rangeEq', 0.5 + ra.value) + ' equity against ' + opp + '. That range advantage lets you bet often, even with middling hands.', 'rangeAdv');
      } else if (evc != null && evc >= 0.5) say(vbet(true) + ' ' + whenC + ', the hand wins about ' + P('eqc', wc) + ' of the time.', 'valueBet');
      else if (!river) say('A bet protects a hand with about ' + P('eq', eq) + ' equity. Weaker hands and draws must pay to see the next card.', 'protection');
      else if (bet && bet.fold != null) say('A bet wins the pot at once about ' + P('fold', bet.fold, { base: true }) + ' of the time. It works as a bluff against better hands.', 'bluff');
      return done();
    }
    // checking
    var strong = hk === 'monster' || hk === 'set' || hk === 'trips' || hk === 'twopair', lead = /lead decision/.test(d.spot);
    if (lead && ra && ra.value <= -0.03) say('The opponent\'s range has about ' + P('rangeEq', 0.5 - ra.value) + ' equity against yours. With the range advantage on their side, the baseline checks to them.', 'rangeAdv');
    else if (lead) say('The opponent was the last to bet or raise. The baseline checks to that player here.');
    if (mw && eq < 0.35) say('With ' + mw.players + ' players in the pot, a bluff has to get past each opponent. The baseline checks its weak hands here.', 'bluff');
    else if (outs >= 8 && eq < 0.6) say('Checking with the ' + dr.label + ' is pot control. It keeps the price of the next card low.', 'potControl');
    else if (eq >= 0.35 && evc != null && evc < 0.5) say('Checking is pot control. A bet would win only about ' + P('eqc', evc) + ' of the time when called.', 'potControl');
    else if (eq >= 0.6) say('Checking a hand with about ' + P('eq', eq) + ' equity is a slow play. It keeps the opponent\'s bluffs and weaker hands in the pot.', 'slowPlay');
    else if (eq >= 0.35) say('Checking is pot control with a medium-strength hand (about ' + P('eq', eq) + ' equity).', 'potControl');
    if (!good && isAgg(did) && !river && ipS && /checked to you/.test(d.spot) && eq >= 0.35 && eq < 0.6 && !mw) say('You are in position. A check here ends the street and shows you the next card for free.', 'position');
    else if (bet && bet.fold != null && bs) {
      var be = bs.amount / (d.potBB + bs.amount);
      if (bet.fold < be) say('A bluff here needs folds about ' + P('be', be, { bet: bs.amount, pot: d.potBB }) + ' of the time. The baseline expects only about ' + P('fold', bet.fold, { base: true }) + '.', 'bluff');
      else say('The hand is weak at about ' + P('eq', eq) + ' equity. The baseline does not bluff with every weak hand. This one is in its checking range.', 'bluff');
    } else say('The hand has about ' + P('eq', eq) + ' equity, too little to bet for value.', 'valueBet');
    if (!good && na && na.value <= -0.05) say('The opponent has the nut advantage here: ' + P('nut', na.theirs) + ' strong hands against your ' + P('nut', na.mine) + '.', 'nutAdv');
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
    var pref = single || d.mix[0].freq >= 0.9 ? 'The baseline ' + verb3(top) + ' here' + (d.mix[0].freq < 0.97 ? ' ' + P('freq', d.mix[0].freq) + ' of the time' : '') + '.' : 'The baseline prefers ' + verbIng(top) + ' here: ' + mt + '.';
    // the reason comes right after the grade word; the fact lines below skip what it already says
    var why = reasonFor(h, seat, d), K = d.concepts, has = function (x) { return K.indexOf(x) >= 0; };
    d.reason = why;
    var dup = why && why.indexOf('The baseline ' + verb3(top) + ' ') >= 0;
    var sf = d.sizeFix = sizeFix(d), sfw = sf ? sizingWhy(d, sf.frac, tex) : '';
    // graded against the table, not the baseline: the verdict and its numbers first, then the balanced view, then the plan
    var xf = d.exploit;
    if (xf && xf.gradedBy === 'exploit' && d.grade !== 'Good' && !sf && !d.evSplit && xf.best !== did && xf.baseGrade !== d.grade && d.feat) {
      d.multiway = !!mw;
      return [exploitFirst(d, dr), mapNote(d), closestNote(d), trustNote(d)].filter(Boolean).join(' ').replace(/about (\uE000[^\uE001]*\uE001)?(over|under) /g, '$1$2 ');
    }
    var head = sf ? d.grade + '. ' + cap(verbIng(sf.noun)) + ' was right. The size was too ' + (sf.bigger ? 'small' : 'big') + '. '
        + (sf.who ? sizeVs(sf, d.exploit.who)
          : 'The baseline ' + (sf.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf, 'verb')) + ' here.')
        + (d.feat ? ' ' + handLine(d.feat) : '') + (sfw ? ' ' + sfw : '') + (why ? ' ' + why : '')
      : d.evSplit ? d.grade + '. The baseline ' + verb3(top) + ' here ' + (d.mix[0].freq < 0.97 ? P('freq', d.mix[0].freq) + ' of the time' : 'almost always') + ', but its EV estimate rates ' + verbIng(did) + ' ' + (d.evSplit < 1 ? 'slightly' : 'about ' + B('split', d.evSplit)) + ' higher. This spot is unsettled.' + (why ? ' The case for ' + verbIng(top) + ': ' + why.charAt(0).toLowerCase() + why.slice(1) : '')
      : d.grade !== 'Good' ? d.grade + '. ' + (why ? why + (dup ? '' : ' ') : '') + (dup ? '' : pref)
      : has('mixed') ? 'Good. ' + why + ' The mix is ' + mt + '.'
      : d.heroFreq >= 0.7 ? 'Good. ' + (why ? why + ' ' : '') + cap(verbIng(did)) + ' is the baseline play.'
      : d.heroFreq >= GOOD_FREQ ? 'Good. ' + (why ? why + ' ' : '') + 'The baseline mixes here: ' + mt + '.'
      : d.exploit && d.exploit.gradedBy === 'exploit' && d.exploit.baseGrade !== 'Good' ? 'Good. ' + (why ? why + (dup ? '' : ' ') : '') + (dup ? '' : pref) + ' ' + cap(verbIng(did)) + (d.exploit.best === did ? ' scores better' : ' is close') + ' against this player.'
      // a play the baseline rarely makes, graded Good: say it is close and why, then how little the baseline's play gains
      : 'Good. ' + cap(verbIng(did)) + ' is close here. ' + (why ? why + (dup ? '' : ' ') : '') + (dup ? '' : pref) + ' '
        + ((d.cost || 0) < 0.1 ? cap(verbIng(top)) + ' scores about the same in EV.' : cap(verbIng(top)) + ' gains only about ' + B('gain', d.cost) + '. That is too small to count as an error.');
    out.push(head);
    var xt = exploitText(d, !!(sf && sf.who));
    if (xt) {
      out.push(xt);
      [['station', 'calling station'], ['maniac', 'maniac'], ['nit', ' nit']].forEach(function (c) { if (xt.indexOf(c[1]) >= 0 && K.indexOf(c[0]) < 0) K.push(c[0]); });
    }
    if (d.sizeOff && !sf && d.did.size != null && !(d.exploit && d.exploit.gradedBy === 'exploit' && d.grade === 'Good')) {
      var rf = d.sizeRef ? potFrac(d, d.sizeRef) : bs ? bs.size : null, sw = rf != null ? sizingWhy(d, rf, tex) : '', szr = szOf(d), rv = did === 'raise';
      var refTo = d.sizeRef ? d.sizeRef.to / d.bbChips : bs ? (d.heroIn || 0) + bs.amount : null, refAct = d.sizeRef ? d.sizeRef.action : rv ? 'raise' : 'bet';
      out.push('You ' + (rv ? 'raised ' : 'bet ') + sizeText(szr, did, d.did.toBB, 'long') + '. The baseline '
        + (refTo != null ? (refAct === 'allin' ? 'moves all in' : verb3(rv ? 'raise' : 'bet') + ' ' + sizeText(szr, rv ? 'raise' : 'bet', refTo, 'long')) : 'uses a different size') + ' here.' + (sw ? ' ' + sw : ''));
    }
    if (mapNote(d)) out.push(mapNote(d));
    if (closestNote(d)) out.push(closestNote(d));
    if (po) {
      out.push('The bet was ' + bbs(d.toCall) + ' into ' + bbs(d.potBB) + '.' + (has('potOdds') || has('icm') ? '' : ' A call needed ' + P('need', po.need) + ' equity.'));
      var pe = why.indexOf(pc(po.have)) >= 0 ? '' : 'The hand has about ' + P('have', po.have) + ' equity against the range that bets here.';
      if (!sf || pe) out.push(((sf ? '' : handLine(d.feat) + ' ') + pe).trim());
      if (icm && icm.premium > 0.01 && !has('icm')) out.push('The payouts add an ICM premium of ' + P('icm', icm.premium) + '. That raises the equity a call needs to ' + P('needIcm', po.need + icm.premium) + '.');
      if (lowBluff(d)) { /* the bettor rarely bluffs: defending a share of the range does not apply */ }
      else if (mdf && !mw && (did === 'fold' || best === 'fold') && mdf.mdf - mdf.defend > 0.04 && d.street !== 'river') out.push('Against this size the baseline defends ' + P('defend', mdf.defend) + ' of your range. ' + rankLine(rp.pct));
      else if (mdf && !mw && d.street === 'river' && (did === 'fold' || did === 'call')) out.push((has('mdf') ? '' : 'This size asks you to defend ' + P('mdf', mdf.mdf) + ' of your range. ') + rankLine(rp.pct));
      if (dr && dr.outs >= 4 && d.street !== 'river' && why.indexOf(' outs') < 0) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs.');
      if (isAgg(did) && hero && hero.fold != null) out.push('The raise gets folds about ' + P('fold', hero.fold, { base: true }) + ' of the time.');
    } else {
      var eqs = pc(d.feat ? d.feat.eq : 0);
      // a reason that already gives the win rate when called needs no second equity number
      var pe2 = why.indexOf(eqs + ' equity') >= 0 || / wins about [^.]* of the time\./.test(why) ? '' : 'The hand has about ' + P('eq', d.feat ? d.feat.eq : 0, { mw: mw }) + ' equity against ' + (mw ? 'the other ranges.' : 'the opponent\'s range.');
      if (!sf || pe2) out.push(((sf ? '' : handLine(d.feat) + ' ') + pe2).trim());
      if (isAgg(did) || isAgg(best)) {
        if (tex && (d.street === 'flop')) out.push('The board is ' + tex.desc + ', which counts as ' + tex.label + '.');
        if (has('nutAdv') || has('rangeAdv')) { /* the reason already names it */ }
        else if (na && Math.abs(na.value) >= 0.05 && isAgg(best)) out.push(na.value > 0 ? 'Your range has more strong hands here: ' + P('nut', na.mine) + ' against ' + P('nut', na.theirs) + '.'
          : 'The opponent\'s range has more strong hands here: ' + P('nut', na.theirs) + ' against your ' + P('nut', na.mine) + '.');
        else if (ra && Math.abs(ra.value) >= 0.04 && d.street === 'flop') out.push('Your range has ' + P('rangeEq', 0.5 + ra.value) + ' equity against ' + (mw ? 'the other ranges.' : 'the opponent\'s range.'));
      }
      var xg = d.exploit && d.exploit.gradedBy === 'exploit' ? d.exploit.info.hero || d.exploit.info.bet : null;
      if (xg && isAgg(did)) {
        if (d.feat && d.feat.eq < 0.35) out.push(cap(d.exploit.name) + ' folds to this bet about ' + P('fold', xg.fold) + ' of the time.');
        else if (xg.eqVsCall != null && why.indexOf('When ' + d.exploit.name + ' calls') < 0) out.push('When ' + d.exploit.name + ' calls, the hand wins about ' + P('eqc', xg.eqVsCall) + '.');
      } else if (isAgg(did) && hero && hero.fold != null) {
        var bet = d.did.add / h.bb, be = bet / (d.potBB + bet);
        if (why.indexOf('needs folds') >= 0 || why.indexOf(pc(hero.eqVsCall || 0) + ' of the time') >= 0) { /* said in the reason */ }
        else if (d.feat && d.feat.eq < 0.35) out.push('As a bluff this bet needs folds ' + P('be', be, { bet: bet, pot: d.potBB }) + ' of the time. The baseline expects about ' + P('fold', hero.fold, { base: true }) + '.');
        else if (hero.eqVsCall != null) out.push('When called, the hand has about ' + P('eqc', hero.eqVsCall) + ' against the calling range.');
      } else if (xt && d.exploit.gradedBy === 'exploit' && isAgg(best) && did === 'check') { /* the exploit sentences give the player's fold rate */
      } else if (isAgg(best) && did === 'check' && info.bet) {
        if (why.indexOf(pc(info.bet.eqVsCall) + ' of the time') >= 0 || has('semiBluff') || has('protection')) { /* said in the reason */ }
        else if (d.feat && d.feat.eq >= 0.6 && info.bet.eqVsCall >= 0.5) out.push('A bet of ' + betOf(d, bs) + ' gets called by worse hands. It wins about ' + P('eqc', info.bet.eqVsCall) + ' when called.');
        else if (d.feat && d.feat.eq >= 0.6) out.push('A bet of ' + betOf(d, bs) + ' makes the draws pay. It takes the pot at once about ' + P('fold', info.bet.fold, { base: true }) + ' of the time.');
        else if (dr && dr.outs >= 8) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs. Betting wins the pot now ' + P('fold', info.bet.fold, { base: true }) + ' of the time.');
        else out.push('A bet wins the pot at once about ' + P('fold', info.bet.fold, { base: true }) + ' of the time.' + (d.missedBluff && d.grade !== 'Good' && !d.capped && !d.evSplit ? ' This estimate depends on how often the opponent folds.' : ''));
      } else if (dr && dr.outs >= 8 && d.street !== 'river' && why.indexOf(' outs') < 0) out.push('The ' + dr.label + ' gives ' + dr.outs + ' outs.');
      if (bl && d.street === 'river' && isAgg(did) && d.feat.eq < 0.35 && !has('blockers')) out.push('Your cards block some of the opponent\'s strong hands.');
    }
    if (mw && why.indexOf(' players in the pot') < 0) out.push('With ' + mw.players + ' players in the pot, the baseline bets and bluffs less.');
    if (d.evLost > 0 && d.grade !== 'Good' && sf) out.push(cap(verbIng(sf.noun)) + ' ' + sizeAmt(sf, 'mine') + ' instead of ' + (sf.action === 'allin' ? 'moving all in' : sizeAmt(sf, 'cost')) + ' cost about ' + B('cost', d.evLost) + ' against ' + (sf.who || 'the baseline') + '.');
    else if (d.evLost > 0 && d.grade !== 'Good' && !d.evSplit) out.push(d.exploit && d.exploit.gradedBy === 'exploit' ?cap(verbIng(did)) + ' cost about ' + B('cost', d.evLost) + ' against ' + d.exploit.name + '.' : costLine(d));
    if (trustNote(d)) out.push(trustNote(d));
    return out.join(' ').replace(/about (\uE000[^\uE001]*\uE001)?(over|under) /g, '$1$2 ');
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
    var sf = { action: m.action, noun: noun, add: rd(add, 1), toBB: rd(m.to / bb, 1), frac: add / d.pot, mine: mine, mineTo: d.did.toBB, bigger: add > mine, who: who, sz: szOf(d) };
    if (who) {
      // does the baseline play the same size? its played size nearest the better one, within 15%
      var br = sizeRef(d.mix, { to: m.to }), bAdd = br ? br.to / bb - (d.heroIn || 0) : null;
      sf.baseSame = m.action === 'allin' ? !!(br && br.action === 'allin') : !!(br && br.action !== 'allin' && Math.abs(bAdd / add - 1) <= 0.15);
      sf.base = br ? { action: br.action, noun: noun, add: rd(bAdd, 1), toBB: rd(br.to / bb, 1), frac: bAdd / d.pot, sz: sf.sz } : null;
      sf.baseFine = x.baseGrade === 'Good';
      // the player's tendency, when it is what makes the size better
      var t = x.traits || {};
      sf.tend = t.calls === 'loose' && sf.bigger ? 'who calls too often' : t.calls === 'tight' && !sf.bigger ? 'who folds too often' : '';
    }
    return sf;
  }
  // an exploit-graded size verdict: whether the baseline plays the same size, then what the player's real play adds
  function sizeVs(sf, read) {
    var who = (read ? read + ' ' : '') + 'Against ' + sf.who + (sf.tend ? ', ' + sf.tend + ',' : '\'s real play,'), better = sf.action === 'allin' ? 'moving all in' : verbIng(sf.noun) + ' ' + sizeAmt(sf, 'verb');
    if (sf.baseSame) return 'The baseline also ' + (sf.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf, 'verb')) + ' here. ' + who + ' the ' + (sf.action === 'allin' ? 'all in' : (sf.bigger ? 'bigger ' : 'smaller ') + sf.noun) + ' gains even more.';
    var bal = sf.baseFine ? 'Against a balanced player, ' + verbIng(sf.noun) + ' ' + sizeAmt(sf, 'mine') + ' is fine.'
      : sf.base ? 'The baseline ' + (sf.base.action === 'allin' ? 'moves all in' : verb3(sf.noun) + ' ' + sizeAmt(sf.base, 'verb')) + ' here.' : '';
    return (bal ? bal + ' ' : '') + who + ' ' + better + ' gains more.';
  }
  // the sizes in words. 'verb': "three-quarters of the pot (6.9bb)" / "to 3x (18bb)"; 'cost': the same without "to";
  // 'mine': the hero's size, "a third of the pot (4.6bb)" / "to 2x (13bb)"
  function sizeAmt(sf, mode) {
    var r = sf.noun === 'raise', act = r ? 'raise' : 'bet';
    if (mode === 'mine') return sizeText(sf.sz, act, sf.mineTo, 'long');
    var t = sizeText(sf.sz, act, sf.toBB, 'long');
    return mode === 'cost' ? t.replace(/^to /, '') : t;
  }
  // the Estimate's own bet size in words, for "A bet of ..." lines
  function betOf(d, bs) {
    if (!bs) return 'this size';
    return d.pot > 0 ? sizeWord(bs.amount / d.pot) + ' (' + bbs(bs.amount) + ')' : bbs(bs.amount);
  }
  // the cost sentence; when the EV sketch calls two plays close, the grade comes from the baseline's frequencies instead
  function costLine(d) {
    var did = d.did.action;
    var hv = evOf(d.ev, did), bv = evOf(d.ev, d.bestAction), above = hv != null && bv != null && hv - bv > 0.3;
    if (d.freqFloor) return 'The EV estimate rates ' + verbIng(did) + (above ? ' above ' : ' about even with ') + verbIng(d.bestAction) + '. The grade comes from the baseline\'s frequency: it ' + verb3(did) + ' here ' + (d.heroFreq < 0.005 ? 'almost never' : 'only ' + P('freq', d.heroFreq) + ' of the time') + '.';
    return cap(verbIng(did)) + ' cost about ' + B('cost', d.evLost) + ' against the baseline.';
  }
  function explainPre(h, seat, e, d, f, pos) {
    var out = [], did = d.did.action, ch = F(f, 'chart'), po = F(f, 'potOdds'), icm = F(f, 'icm'), mt = mixText(d.mix), hand = d.hand;
    var approx = ch && ch.approx ? ' This spot uses an approximate chart.' : '';
    var mixed = d.mix.length > 1 && d.mix[1].freq >= GOOD_FREQ;
    var why = reasonFor(h, seat, d), K = d.concepts, has = function (x) { return K.indexOf(x) >= 0; }, who = d.source === 'Nash' ? 'The Nash range' : 'The chart';
    d.reason = why;
    var ls = d.limpSize, lsRight = !!(ls && d.grade !== 'Good' && d.sizeOff), rs = d.raiseSize, rsRight = !!(rs && d.grade !== 'Good' && d.sizeOff);
    if (lsRight) out.push(d.grade + '. Raising was right. The size was too ' + (ls.small ? 'small' : 'big') + '. ' + limpSizeText(d, false) + (why ? ' ' + why : '') + approx);
    else if (rsRight) out.push(d.grade + '. Raising was right. The size was too ' + (rs.small ? 'small' : 'big') + '. ' + raiseSizeText(d, false) + (why ? ' ' + why : '') + approx);
    else if (d.grade === 'Good' && d.heroFreq < GOOD_FREQ && !has('mixed') && d.mix[0]) out.push('Good. ' + cap(verbIng(did)) + ' ' + hand + ' is close here. ' + (why ? why + ' ' : '')
      + who + ' ' + chartVerb(d.mix[0]) + ' it. ' + cap(verbIng(d.mix[0].action)) + ((d.cost || 0) < 0.1 ? ' scores about the same.' : ' gains only about ' + B('gain', d.cost) + '. That is too small to count as an error.') + approx);
    else if (d.grade === 'Good') out.push('Good. ' + (has('mixed') ? why + ' The mix is ' + mt + '.'
      : why ? why + (d.saidAct && !mixed ? '' : ' ' + who + ' ' + (mixed ? 'mixes it: ' + mt + '.' : chartVerb(d.mix[0]) + ' it here.'))
      : mixed ? 'The chart mixes ' + hand + ' here: ' + mt + '.' : 'The chart ' + chartVerb(d.mix[0]) + ' ' + hand + ' here.') + approx);
    else out.push(d.grade + '. ' + (why ? why + ' ' : '') + 'You ' + verbPast(did) + ' ' + hand + '.' + (d.saidAct && !mixed ? '' : ' ' + who + ' ' + (mixed ? 'mixes it: ' + mt : chartVerb(d.mix[0]) + ' it' + (d.mix[0].freq < 0.97 ? ' ' + P('freq', d.mix[0].freq) + ' of the time' : '')) + '.') + approx);
    if (ls && !lsRight) out.push(limpSizeText(d, true));
    if (rs && !rsRight && d.grade !== 'Good') out.push(raiseSizeText(d, true));
    if (d.priced) out.push(pricedText(d));
    if (d.never) out.push('The chart never ' + ({ call: 'calls with', raise: 'raises', allin: 'moves all in with', fold: 'folds', check: 'checks' }[did] || 'plays') + ' ' + hand + ' here. The cost is small, but the play is still an error.');
    if (did === 'call' && d.evLost > (d.toCall || 0) + 0.05 && d.toCall > 0) out.push('The cost is more than the ' + bbs(d.toCall) + ' call. The hand plays on after the flop' + (pos === 'SB' || pos === 'BB' ? ', out of position' : '') + '. It loses more chips on later streets.');
    if (d.jamOversize) out.push('Moving all in risks ' + bbs(d.stack) + ' where the chart raises to ' + bbs(d.jamOversize.toBB) + '. ' + jamWhy(d, po));
    if (po && !isAgg(did) && (ch.chart === 'vsJam' || po.toCall >= 0.25 * d.stack || d.grade !== 'Good' || d.heroFreq < GOOD_FREQ)) {
      out.push('The call was ' + bbs(po.toCall) + ' into ' + bbs(d.potBB + po.toCall) + '.' + (has('potOdds') ? '' : ' A call needed ' + P('need', po.need) + ' equity.'));
      if (!has('potOdds')) out.push(hand + ' has about ' + P('have', po.have) + ' against the raiser\'s range.');
      if (did === 'call' && d.grade !== 'Good' && po.have >= po.need && ch.chart !== 'vsJam' && po.toCall < 0.5 * d.stack && !(icm && icm.premium > 0.01)) out.push(realizedText(h, seat, e, hand, po));
    }
    if (icm && icm.premium > 0.01 && !has('icm')) out.push('The payouts add an ICM premium of ' + P('icm', icm.premium) + '. ' + (isAgg(did) ? 'Losing the all in costs more than the chip count shows.' : 'A call needs that much more equity than the chips alone suggest.'));
    if (d.evLost > 0) out.push('The estimated cost is ' + B('cost', d.evLost) + '.');
    if (trustNote(d)) out.push(trustNote(d));
    var txt = out.join(' ').replace(/about (\uE000[^\uE001]*\uE001)?(over|under) /g, '$1$2 ');
    if (ls) { if (/out of position|in position/.test(txt) && !has('position')) K.push('position'); if (/limper/.test(txt) && !has('limp')) K.push('limp'); }
    if (/realized equity/.test(txt) && !has('realized')) K.push('realized');
    if (/realized equity/.test(txt) && /out of position|in position/.test(txt) && !has('position')) K.push('position');
    return txt;
  }
  // a preflop call with enough raw equity that the chart still folds: why the hand keeps less of that equity
  // (position after the flop, the number of players, the hand type), with a rough share. The share follows the
  // realization the preflop model uses (0.82 out of position, 0.95 in position, less for weak equity), less again for
  // offsuit hands without a high card and for each extra player.
  function realizedText(h, seat, e, hand, po) {
    var n = h.players.length, ord = function (s) { return (s - h.button - 1 + n) % n; };
    var opp = {};
    h.log.slice(0, e.n).forEach(function (x) { if (x.ev === 'act' && x.street === 'preflop' && x.seat !== seat && (x.type === 'raise' || x.type === 'call' || x.type === 'allin')) opp[x.seat] = true; });
    var seats = Object.keys(opp).map(Number), k = Math.max(1, seats.length);
    var ip = seats.length > 0 && seats.every(function (s) { return ord(s) < ord(seat); });
    var hs = String(hand || ''), pair = hs.length >= 2 && hs[0] === hs[1], suited = /s$/.test(hs), high = /^[AKQ]/.test(hs);
    var gap = pair ? 0 : Math.abs('23456789TJQKA'.indexOf(hs[0]) - '23456789TJQKA'.indexOf(hs[1]));
    var weak = !pair && !suited && !high && gap >= 2;
    var r = Math.min(1.1, Math.max(0.6, (ip ? 0.95 : 0.82) + 0.4 * (po.have - 0.5)));
    if (weak) r -= 0.1; else if (!pair && !suited) r -= 0.04;
    r *= Math.pow(0.88, k - 1);
    var share = r >= 0.9 ? 'nearly all' : r >= 0.7 ? 'about three quarters' : r >= 0.6 ? 'about two thirds' : r >= 0.45 ? 'about half' : 'less than half';
    var who = k === 1 ? 'one player' : k === 2 ? 'two players' : k + ' players';
    var out = ['Equity alone does not make the call good. What counts is realized equity, the part of it the hand wins once more bets come.'];
    if (!ip) out.push('You will be out of position after the flop. You act first on every street.');
    if (k > 1) out.push('With ' + who + ' already in, the hand must beat more than one range.');
    var HN = { A: 'ace', K: 'king', Q: 'queen' };
    if (weak) out.push(hs + ' is offsuit with no high card. It misses most flops. When it pairs, a better pair is often out there.');
    else if (!pair && !suited && high) out.push(hs + ' is offsuit. When it pairs the ' + HN[hs[0]] + ', the raiser often has a better kicker.');
    else if (!pair && !suited) out.push(hs + ' is offsuit. It makes fewer flushes and straights than a suited hand.');
    var lead = (ip ? 'In position' : 'Out of position') + ' against ' + who;
    out.push(lead + ', ' + hs + ' keeps only ' + tok(share, mathOf('realize', r, 'pct', { ip: ip, have: po.have, cut: weak ? 0.1 : !pair && !suited ? 0.04 : 0, k: k })) + ' of that ' + P('have', po.have) + '.' + (po.have * r < po.need ? ' That falls short of the ' + P('need', po.need) + ' the call needs.' : po.have * r < po.need + 0.05 ? ' That leaves almost no margin over the ' + P('need', po.need) + ' the call needs.' : ''));
    return out.join(' ');
  }
  // a raise over limpers far from the target size: the size it should be and why (also: the action was wrong too)
  function limpSizeText(d, also) {
    var ls = d.limpSize, n = d.limpers || 1, ip = d.limpIP, out = [];
    out.push(also ? 'Your raise to ' + bbs(d.did.toBB) + ' was also too ' + (ls.small ? 'small' : 'big') + '.' : 'You raised to ' + bbs(d.did.toBB) + '.');
    var solo = d.chartKind === 'bbVsLimp' && n === 1 && ip;
    out.push('Over ' + (n === 1 ? 'one limper' : n + ' limpers') + (ip ? '' : ' out of position') + ', a raise should go to about ' + B('size', ls.to, { src: 'The preflop chart\'s sizing rule over limpers.', note: 'The rule uses a set multiple of the big blind, plus one big blind for each limper.' })
      + (solo ? '.' : ': 4bb, plus 1bb per limper' + (ip ? '.' : ', plus 1bb for being out of position.')));
    if (ls.small) out.push('A small raise offers the limpers a cheap call.', ip ? 'It plays like a limp that costs more, with a bigger pot against several players.' : 'It plays like a check that costs more, and it builds a bigger pot that you play out of position.');
    else out.push('A raise this big risks a lot to win a small pot.', handCat(d.hand || 'xx') === 'premium' ? 'Worse hands fold, and your strong hand wins only what is in the middle.' : 'The hands that call it are mostly ones that beat you.');
    return out.join(' ');
  }
  // a preflop raise far from the chart's size: the size it should be and why (also: the action was wrong too)
  function raiseSizeText(d, also) {
    var rs = d.raiseSize, c = d.raiseCtx || {}, out = [], hand = d.hand || 'this hand';
    out.push(also ? 'Your raise to ' + bbs(d.did.toBB) + ' was also too ' + (rs.small ? 'small' : 'big') + '.' : 'You raised to ' + bbs(d.did.toBB) + '.');
    var near = function (x) { return x > 0 && Math.abs(x / rs.to - 1) < 0.12; }, where = c.ip ? 'In position' : 'Out of position';
    if (!c.n) out.push('An open from here should go to about ' + B('size', rs.to) + '.');
    else if (c.n === 1) {
      var mult = c.ip ? 3 : 4, rule = c.open * mult + c.callers * c.open, what = c.callers ? 'a squeeze' : 'a 3-bet';
      out.push(where + ' over an open' + (c.callers ? (c.callers === 1 ? ' and one caller' : ' and ' + c.callers + ' callers') : '') + ', ' + what + ' should go to about ' + B('size', rs.to) + '.');
      if (near(rule)) out.push('That is ' + mult + 'x the open' + (c.callers ? ', plus 1x for ' + (c.callers === 1 ? 'the caller' : 'each caller') : '') + '.');
    } else {
      out.push('A ' + (c.n === 2 ? '4-bet' : 're-raise') + ' here should go to about ' + B('size', rs.to) + '.');
      if (c.n === 2 && near(c.last * 2.2)) out.push('That is about 2.2x the 3-bet.');
    }
    var many = c.n === 1 && c.callers > 0;
    if (rs.small) {
      out.push(many ? 'A small raise gives both players a cheap price to call.' : c.n ? 'A small raise gives the raiser a cheap price to call or raise again.' : 'A small open gives the blinds a cheap price to call.');
      if (c.n && !c.ip) out.push('It builds a bigger pot that you play out of position with ' + hand + '.');
      else if (c.n) out.push('It builds a bigger pot against more hands.');
      if (c.n) out.push('It does not fold anyone out.');
    } else out.push('A raise this big risks a lot to win a small pot.', handCat(d.hand || 'xx') === 'premium' ? 'Worse hands fold, and your strong hand wins only what is in the middle.' : 'The hands that call it are mostly ones that beat you.');
    return out.join(' ');
  }
  // facing a raise far under the chart's size: the chart was built for another price, and the grade uses pot odds
  function pricedText(d) {
    var p = d.priced;
    return 'The chart is built for a ' + (p.what || 'raise') + ' to about ' + B('size', p.std, { src: 'The preflop chart, built for this size.', note: 'The chart ranges assume a raise of this size.' }) + '. This one was ' + bbs(p.faced) + '. At this price the chart uses the pot odds instead. The grade is less sure here.';
  }
  function rankLine(pct) {
    if (pct <= 0.5) return 'Your hand is in the top ' + P('rank', Math.max(0.01, pct), { top: true }) + ' of your range.';
    return 'About ' + P('rank', Math.min(0.99, pct)) + ' of your range is stronger than this hand.';
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

  // ---------------------------------------------------------------- recap text
  // A share of all hands in words: friendly fractions for wide ranges, "about 1 hand in N" for narrow ones.
  var SHARES = [[75, 'about three quarters of all hands'], [66.7, 'about two thirds of all hands'], [50, 'about half of all hands'], [40, 'about 2 hands in 5'],
    [33.3, 'about a third of all hands'], [25, 'about a quarter of all hands'], [20, 'about 1 hand in 5']];
  function shareWords(p) {
    if (p >= 88) return 'almost every hand';
    if (p >= 18) { var best = SHARES[0]; SHARES.forEach(function (x) { if (Math.abs(Math.log(p / x[0])) < Math.abs(Math.log(p / best[0]))) best = x; }); return best[1]; }
    if (p <= 0.1) return 'fewer than 1 hand in 1000';
    var n = 100 / p, step = n < 20 ? 1 : n < 100 ? 5 : n < 1000 ? 10 : 100;
    return 'about 1 hand in ' + Math.round(n / step) * step;
  }
  function pronouns(name) {
    var g = AI && AI.genderOf ? AI.genderOf(name) : 'x';
    return g === 'f' ? { he: 'she', his: 'her' } : g === 'm' ? { he: 'he', his: 'his' } : { he: 'they', his: 'their' };
  }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var AGG = { fold: 0, check: 1, call: 1, bet: 2, raise: 2, allin: 3 };
  var STREET_ON = { preflop: 'before the flop', flop: 'on the flop', turn: 'on the turn', river: 'on the river' };
  var PAST = { fold: 'folded', check: 'checked', call: 'called', bet: 'bet', raise: 'raised', allin: 'moved all in' };
  var BASE = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', allin: 'move all in' };
  // the evaluator's name ("Three of a Kind, Sevens") as a phrase ("a set of sevens")
  function madeWords(name, hole) {
    var m = /^([^,]+)(?:, (.*))?$/.exec(String(name || '')), cat = m ? m[1] : '', rest = m && m[2] ? m[2].toLowerCase() : '';
    var pocket = hole && hole.length === 2 && (hole[0] >> 2) === (hole[1] >> 2);
    switch (cat) {
      case 'High Card': return rest + ' high';
      case 'Pair': return 'a pair of ' + rest;
      case 'Two Pair': return 'two pair, ' + rest;
      case 'Three of a Kind': return pocket ? 'a set of ' + rest : 'three ' + rest;
      case 'Straight': return art(rest.replace(' high', '-high')) + ' straight';
      case 'Flush': return art(rest.replace(' high', '-high')) + ' flush';
      case 'Full House': return 'a full house, ' + rest;
      case 'Four of a Kind': return 'four ' + rest;
      case 'Royal Flush': return 'a royal flush';
      case 'Straight Flush': return art(rest.replace(' high', '-high')) + ' straight flush';
      default: return lc(String(name || 'a hand'));
    }
  }
  function art(w) { return (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w; }
  function madeCat(name) { return ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'].indexOf(String(name || '').split(',')[0]); }
  // the play that shaped the range on a street: the last bet or raise, else the last action
  function streetPlay(acts) {
    var agg = acts.filter(function (e) { return AGG[e.type] >= 2; }), last = acts[acts.length - 1];
    if (!last) return null;
    var main = agg.length ? agg[agg.length - 1] : last, noun = main.type === 'allin' ? 'all-in' : main.type;
    if (main.type === 'raise' && acts[0].type === 'check') noun = 'check-raise';
    if (main.type === 'call' && acts[0].type === 'check') noun = 'check-call';
    return { type: main.type, noun: noun };
  }
  // what that play usually means, from the action and the share of the range it kept
  function meaning(play, kept, street) {
    if (AGG[play.type] >= 2) return kept < 0.12 ? 'a very strong hand' : kept >= 0.4 ? 'a wide range of hands' : street === 'river' ? 'a strong hand or a bluff' : 'a strong hand or a draw';
    if (play.type === 'call') return street === 'river' ? (kept < 0.25 ? 'a strong hand' : kept < 0.6 ? 'a medium-strength hand' : 'a wide range, weak hands included')
      : kept < 0.25 ? 'a strong hand or a good draw' : kept < 0.6 ? 'a medium hand or a draw' : 'a wide range, weak hands included';
    return 'a medium or weak hand';
  }
  function isSlip(x) { return !!(x && (x.slip || /usual plan/.test(x.vague || ''))); }
  // The bot's model flagged a slip; the recap calls it a mistake only when the hand really is off the range it describes.
  // kept: the share of the range the street's play kept. pct and eq (from the note) place the hand in the bot's own range.
  // A raise with trips that the plan meant to call is no mistake: trips sit at the top of a raising range.
  function slipStands(x, kept) {
    if (!x || x.pct == null) return true; // preflop and older notes: the model's flag stands
    var did = AGG[x.type], from = AGG[x.planned];
    if (from == null || did === from || x.type === 'fold') return true;
    if (did > from) return x.pct < 1 - Math.max(1.5 * (kept == null ? 0.3 : kept), 0.15) && !(x.eq >= 0.75);
    return x.pct >= 0.6 || x.eq >= 0.6; // "only called with something stronger" needs a strong hand
  }
  // what a shown slip was made with: "On the flop he had only the board pair." (older notes read "Misjudged X and chose to raise.")
  function slipHand(x, pr) {
    var r = String(x.reason || '').trim(), m = /^(?:Misjudged|Raised with|Bet with|Called with|Moved all in with|Checked|Folded) (.+?)(?: and chose [^.]*)?\.$/.exec(r);
    return m ? cap(STREET_ON[x.street]) + ' ' + pr.he + ' had ' + m[1].replace('no pair of its own', 'only the board pair') + '.' : cap(pr.he) + ' ' + lc(r);
  }
  // the share of the player's own range a postflop play kept, in words ("about a third of his hands"); null when tiny
  var KEPT = [[0.75, 'about three quarters of'], [0.667, 'about two thirds of'], [0.5, 'about half of'], [0.4, 'about 2 in 5 of'],
    [0.333, 'about a third of'], [0.25, 'about a quarter of'], [0.2, 'about 1 in 5 of']];
  function keptWords(kept, his) {
    if (kept < 0.06) return null;
    if (kept >= 0.9) return 'almost all of ' + his + ' hands';
    if (kept >= 0.18) { var best = KEPT[0]; KEPT.forEach(function (x) { if (Math.abs(Math.log(kept / x[0])) < Math.abs(Math.log(kept / best[0]))) best = x; }); return best[1] + ' ' + his + ' hands'; }
    return 'about 1 in ' + Math.round(1 / kept) + ' of ' + his + ' hands';
  }
  // "He raises the flop here only with his very best hands." (they raise, they move all in)
  function keptLine(pr, play, st, kept, c) {
    var they = pr.he === 'they', kw = keptWords(kept, pr.his);
    if (kw && c && c.prev) kw = kw.replace(/^(about [^ ]+(?: [^ ]+)*? of|almost all of)/, function (w) { return tok(w, mathOf('kept', kept, 'pct', { after: c.p / 100, before: c.prev / 100 })); });
    var verb = play.noun === 'all-in' ? (they ? 'move' : 'moves') + ' all in on the ' + st : play.noun + (they ? '' : 's') + ' the ' + st;
    return cap(pr.he) + ' ' + verb + ' here ' + (kw ? 'with ' + kw : 'only with ' + pr.his + ' very best hands') + '.';
  }
  var RANK_LC = C.RANK_NAME.map(function (r) { return r.toLowerCase(); });
  // When the shown hand's made part is all on the board (a board pair, two pair, trips or quads with the same ranks,
  // or a straight, flush or full house that is the board itself), the hole cards only add a kicker, or nothing.
  // Gives { board: sentence about the board, kicker: rank of the hole card that played or -1 } or null.
  function boardMade(show, board) {
    if (!show || !board || board.length < 5 || show.score == null) return null;
    var bs = C.evalCards(board), ps = show.score, cat = C.category(ps);
    if (cat < 1 || cat !== C.category(bs)) return null;
    var n0 = function (x) { return (x >> 16) & 15; }, n1 = function (x) { return (x >> 12) & 15; };
    if (cat === 1 || cat === 3 || cat === 7) { if (n0(ps) !== n0(bs)) return null; }
    else if (cat === 2) { if (n0(ps) !== n0(bs) || n1(ps) !== n1(bs)) return null; }
    else if (ps !== bs) return null;
    var pl = RANK_LC[n0(bs)] + (n0(bs) === 4 ? 'es' : 's'), sentence;
    if (cat === 1) sentence = 'The pair of ' + pl + ' was on the board.';
    else if (cat === 2) sentence = 'Both pairs, ' + pl + ' and ' + RANK_LC[n1(bs)] + (n1(bs) === 4 ? 'es' : 's') + ', were on the board.';
    else if (cat === 3) sentence = 'The three ' + pl + ' were on the board.';
    else if (cat === 7) sentence = 'The four ' + pl + ' were on the board.';
    else sentence = 'The whole ' + ({ 4: 'straight', 5: 'flush', 6: 'full house' }[cat] || 'hand') + ' was on the board.';
    var kick = ps > bs ? Math.max(show.cards[0] >> 2, show.cards[1] >> 2) : -1;
    return { board: sentence, kicker: kick };
  }
  function kickerLine(bm, whose, theirs) {
    return bm.kicker >= 0 ? cap(whose) + ' hand was really ' + RANK_LC[bm.kicker] + '-high.' : 'Neither of ' + theirs + ' cards played.';
  }
  // The recap for one opponent as a short paragraph: the cards (if shown), at most two range figures (the preflop
  // width and the postflop bet or raise that narrowed the range most), then the bot's own note.
  // A slip is told as the exception to the range sentence.
  function recapText(h, s, heroSeat, v, notes, shows) {
    var name = v.name.split(' ')[0], pr = pronouns(v.name), out = [], show = shows[s], hs = shows[heroSeat];
    var vb = boardMade(show, h.board);
    if (show) {
      var hb = hs ? boardMade(hs, h.board) : null;
      out.push(name + ' showed ' + v.cards + (vb ? '.' : ', ' + madeWords(show.name, show.cards) + '.'));
      if (hs) out.push('You showed ' + C.cardsStr(hs.cards) + (hb ? '.' : ', ' + madeWords(hs.name, hs.cards) + '.'));
      var bsent = (vb || hb || {}).board;
      if (bsent) {
        out.push(bsent);
        if (vb) out.push(kickerLine(vb, pr.his, pr.his));
        if (hb) out.push(kickerLine(hb, 'your', 'your'));
        if (vb && hb) out.push(show.score === hs.score ? 'You both played the board and split the pot.' : 'The kicker decided it.');
      }
    } else out.push(name + ' never showed ' + pr.his + ' cards.');
    // the range: the preflop width, then the one postflop bet or raise that narrowed it most
    var acts = {}; h.log.forEach(function (e) { if (e.ev === 'act' && e.seat === s) (acts[e.street] = acts[e.street] || []).push(e); });
    var prev = null, best = null, bestCall = null, figSt = 'preflop', keptOn = {};
    ['preflop', 'flop', 'turn', 'river'].forEach(function (st) {
      var p = v.range[st]; if (p == null) return;
      var play = streetPlay(acts[st] || []);
      if (st === 'preflop') {
        var pre = play && play.type === 'allin' ? 'moved all in with ' : play && play.type === 'raise' ? 'raised with ' : 'played ';
        out.push('Before the flop ' + name + ' ' + pre + tok(shareWords(p), mathOf('width', p / 100, 'pct', {})) + '.');
      } else if (play && prev) {
        var c = { st: st, p: p, prev: prev, play: play, kept: p / prev };
        keptOn[st] = c.kept;
        if (AGG[play.type] >= 2) { if (!best || c.kept < best.kept) best = c; }
        else if (play.type === 'call' && (!bestCall || c.kept < bestCall.kept)) bestCall = c;
      }
      prev = p;
    });
    // a flagged slip whose hand fits the range is no mistake; its note then reads like any other
    var slipNote = notes.filter(function (x) { return isSlip(x) && slipStands(x, keptOn[x.street]); }).pop();
    // a dismissed slip's vague note still says "outside the usual plan", so it only counts once the cards are shown
    var plain = notes.filter(function (x) { return !isSlip(x) || (show && !slipStands(x, keptOn[x.street])); });
    var key = plain.filter(function (x) { return x.type !== 'check' && x.type !== 'fold' && x.street !== 'preflop'; }).pop() || plain[plain.length - 1];
    if (key && slipNote && key.n < slipNote.n) key = null; // a note from before the slip adds nothing
    if (best) {
      // the meaning, then the share of the player's own range that makes this play (never a share of all hands)
      var mean = meaning(best.play, best.kept, best.st), lead = cap(pr.his) + ' ' + best.st + ' ' + best.play.noun;
      out.push((/^a wide/.test(mean) ? lead + ' can mean many kinds of hands.' : lead + ' usually means ' + mean + '.') + ' ' + keptLine(pr, best.play, best.st, best.kept, best));
      if (!slipNote && show && !vb && madeCat(show.name) >= 2 && best.kept < 0.4) out.push('That fits a ' + best.st + ' ' + best.play.noun + '.');
      figSt = best.st;
    } else if (bestCall) {
      // a call gets its meaning, never a figure of its own
      out.push(cap(pr.his) + ' ' + bestCall.st + ' ' + bestCall.play.noun + ' usually means ' + meaning(bestCall.play, bestCall.kept, bestCall.st) + '.');
      figSt = bestCall.st;
    }
    if (slipNote) {
      var did = slipNote.type, from = slipNote.planned, when = slipNote.street !== figSt ? ' ' + STREET_ON[slipNote.street] : '', how;
      if (from && AGG[from] != null && AGG[did] !== AGG[from]) {
        if (did === 'fold') how = ' and folded a hand that would usually play on.';
        else if (AGG[did] > AGG[from]) how = ' and ' + PAST[did] + ' with something weaker.';
        else how = ' and only ' + PAST[did] + ' with something stronger. That hand would usually ' + (BASE[from] || 'play on') + '.';
      } else how = ' and played differently from ' + pr.his + ' usual pattern.';
      out.push('This time ' + name + ' made a mistake' + when + how);
      // the shown cards already name a preflop hand; a postflop slip's reason adds what the hand was
      if (show && slipNote.street !== 'preflop') out.push(slipHand(slipNote, pr));
      var tier = slipNote.tier;
      out.push(tier === 'Beginner' || tier === 'Casual' ? 'Weaker players do this now and then.' : tier ? 'Even good players do this now and then.' : 'Players make mistakes like this now and then.');
    }
    if (key) out.push(cap(STREET_ON[key.street]) + ' ' + pr.he + ' ' + lc(String(show || !key.vague ? key.reason : key.vague).trim()));
    return out.join(' ');
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
      var notes = (opts.notes || h.botNotes || []).filter(function (x) { return x.seat === s; });
      var rm = withMath({ h: h, seat: seat }, function () { return recapText(h, s, seat, v, notes, shows); });
      v.text = rm.text; v.tm = rm.tm; v.math = rm.math;
      out.villains.push(v);
    });
    out.lines = [];
    out.villains.forEach(function (v) { if (v.text) out.lines.push(v.name.split(' ')[0] + ' (' + v.pos + '): ' + v.text); });
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
    rv.blind = blindOnly(h, seat, net);
    rv.upgrade = function (onChange) { return upgrade(h, seat, rv, onChange); };
    return rv;
  }
  // the hero lost only the forced chips (blind or ante) and put in nothing by choice: 'blind', 'ante', or null
  function blindOnly(h, seat, net) {
    if (!(net < 0)) return null;
    var vol = h.log.some(function (e) { return e.ev === 'act' && e.seat === seat && e.add > 0; });
    if (vol) return null;
    var kinds = h.log.filter(function (e) { return e.ev === 'post' && e.seat === seat; }).map(function (e) { return e.kind === 'ante' ? 'ante' : 'blind'; });
    return kinds.indexOf('blind') >= 0 ? 'blind' : kinds.length ? 'ante' : null;
  }
  // the result as the header shows it: '-1 bb (blind)' when only forced chips were lost (the panel shows it muted, not red)
  function netLabel(rv) {
    var v = Math.round(rv.net * 10) / 10, t = (v > 0 ? '+' : '') + (v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1)) + ' bb';
    return rv.blind ? t + ' (' + rv.blind + ')' : t;
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
        d.mix = r.mix.map(function (m) { var o = { action: m.action, size: m.size, to: m.to || 0, freq: m.freq }; if (isAgg(o.action)) o.toBB = rd(o.to / bb, 1); return o; }).sort(function (a, b) { return b.freq - a.freq; });
        labelMix(d);
        d.ev = r.ev || {}; d.source = r.source || 'Solved'; d.heroEV = r.heroEV != null ? r.heroEV : null;
        d.heroMap = r.heroMap || null; d.forcedAllin = r.forcedAllin || null;
        // a size too far from the solved ones: keep the Estimate's cost for the size on top of the nearest solved size
        if (d.heroEV == null && d.heroMap && d.heroMap.mode === 'estimate' && d.heroMap.nearV != null && est.heroEV != null) {
          var e0 = evOf(est.ev, d.did.action); if (e0 != null) d.heroEV = rd(d.heroMap.nearV + est.heroEV - e0, 2);
        }
        refreshBet(h, seat, d);
        gradeDecision(d); applyExploit(d); setText(h, seat, e, d); d.leak = leakOf(h, seat, e, d);
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
    var excluded = reviews.filter(function (rv) { return rv.excluded; }).length; // hands the player took out of coaching
    reviews = reviews.filter(function (rv) { return !rv.excluded; });
    var s = { hands: reviews.length, excluded: excluded, net: 0, evLost: 0, decisions: 0, grades: { Good: 0, Inaccuracy: 0, Mistake: 0, Blunder: 0 }, clean: 0, leaks: [], exploitLeaks: [] }, L = {};
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
      var did = lc(didLabel(d, bbs));
      out.push('  [' + d.grade + (d.evLost ? ', -' + B('cost', d.evLost) : '') + '] ' + d.spot + (d.boardStr ? ' on ' + d.boardStr : '') + '. Pot ' + bbs(d.pot) + (d.toCall ? ', ' + bbs(d.toCall) + ' to call' : '') + '. You: ' + did + '. (' + d.source + ')');
      out.push('    ' + d.text);
    });
    rv.recap.lines.forEach(function (l) { out.push('  ' + l); });
    return out.join('\n');
  }

  return { hand: hand, session: session, toText: toText, gradeFor: gradeFor, GRADES: GRADES, LEAKS: LEAKS, GOOD_FREQ: GOOD_FREQ, mixPct: mixPct, didLabel: didLabel, closestNote: closestNote, sizeText: sizeText, GLOSSARY: GLOSSARY, linkTerms: linkTerms, grade: gradeDecision, netLabel: netLabel, unmark: unmark, mathView: mathView };
});
