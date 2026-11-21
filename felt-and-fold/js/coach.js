/* Felt & Fold: the Coach. Pure functions over saved reviews (the hand history), no DOM.
   FF.Coach.analyze(entries) -> { hands, excluded, focus, also, need, byPos, byStreet, byGrade, byAction, habits, trend }.
   entries: [{ n, rv }] oldest first; rv is a review as FF.Review.hand gives it or as the history saves it.
   Amounts are in bb; the UI converts them. UMD: window.FF.Coach in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.FF = root.FF || {}; root.FF.Coach = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MIN = 5; // examples a pattern needs before the Coach names it
  var rd = function (x, d) { var m = Math.pow(10, d == null ? 1 : d); return Math.round(x * m) / m; };
  var isAgg = function (a) { return a === 'bet' || a === 'raise' || a === 'allin'; };
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var POS_ORDER = ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var EARLY = { UTG: 1, UTG1: 1, UTG2: 1, LJ: 1, HJ: 1 };

  // ---------------------------------------------------------------- what the hero held after the flop
  // d.hand is the strategy's plain label ("no pair", "top pair, good kicker", "a set of nines"); null when it is missing
  function handClass(label) {
    if (!label) return null;
    var l = String(label).toLowerCase();
    if (/^(no pair|ace high|king high|two overcards|the board|trips on the board)/.test(l)) return 'air';
    if (/^(second pair|a weak pair|a pocket pair below)/.test(l)) return 'weak';
    if (/^(top pair|an overpair)/.test(l)) return 'good';
    if (/^(two pair|a set|trip|a straight|a flush|a full house|quads)/.test(l)) return 'strong';
    return null;
  }
  // the preflop spot from the chart label (see ranges.js): first in, facing an open, facing a 3-bet, limpers, short-stack shoves
  function preSpot(label) {
    var l = String(label || '');
    if (/shove or fold/.test(l)) return 'short';
    if (/first in/.test(l)) return 'rfi';
    if (/limper|SB complete/.test(l)) return 'limp';
    if (/4-bet/.test(l)) return 'vs4bet';
    if (/ open, \w+ 3-bets/.test(l)) return 'vs3bet';
    if (/ vs \w+ open/.test(l)) return 'vsOpen';
    return 'other';
  }
  var posGroup = function (p) { return p === 'SB' ? 'SB' : p === 'BB' ? 'BB' : EARLY[p] ? 'early' : 'late'; };
  var multiway = function (d) { return /\b[3-9]-way\b/.test(d.spot || ''); };
  var topAction = function (d) { var t = null; (d.mix || []).forEach(function (m) { if (!t || m.freq > t.freq) t = m; }); return t ? t.action : null; };
  function actType(a) { return a === 'fold' ? 'fold' : a === 'check' ? 'check' : a === 'call' ? 'call' : 'betraise'; }

  // ---------------------------------------------------------------- patterns
  // each family: a title, a plain explanation and a rule of thumb. {s} is the street.
  var FAM = {
    openEarly: ['Opening too loose from early seats', 'You open too many hands from the first seats. Most of the table still acts after you. Weak hands that open there often meet a better hand or play the pot out of position.', 'From UTG and HJ, open only strong hands: pairs, big aces and suited broadway cards. Fold the rest.'],
    openLate: ['Opening too loose from late seats', 'You open more hands from the CO and BTN than the chart does. Late seats can open wide. Some of your opens are still too weak to show a profit.', 'On the BTN, open about 2 hands in 5. Fold weak offsuit hands like K4o and Q6o.'],
    openSB: ['Playing too many hands from the small blind', 'You play too many hands from the small blind. The SB acts first on every street after the flop. Weak hands lose money there even when the blinds are cheap.', 'From the SB, raise your good hands and fold most of the others. Calling half a big blind is not free.'],
    limpFirst: ['Limping into the pot', 'You call the big blind when nobody has raised yet. A limp gives the blinds a cheap look. It also gives up the chance to win the pot right away.', 'When you are first in, raise or fold. Do not limp.'],
    foldFirst: ['Folding too much when first in', 'You fold hands the chart opens when the pot comes to you first. Each fold gives up the blinds you could steal.', 'When the pot is folded to you in a late seat, open a wide range. Small pairs and suited aces are opens there.'],
    foldBB: ['Folding the big blind too often', 'You fold the big blind too often against a raise. You already have one big blind in the pot. A call costs less than it looks.', 'In the BB, check the pot odds. Against a small open, defend most suited hands and many connected ones.'],
    foldVsOpen: ['Folding too much against raises', 'You fold good hands when someone opens before you. Some of these hands should call or 3-bet.', 'Against a late-seat open, keep playing strong pairs, big aces and suited broadway cards.'],
    callBlinds: ['Calling raises too wide from the blinds', 'You call raises from the blinds with hands that are too weak. You play the rest of the hand out of position. Weak hands win too rarely to pay for it.', 'From the SB, 3-bet or fold most hands. From the BB, call with hands that play well after the flop.'],
    callVsOpen: ['Calling raises too wide', 'You call opens with hands that the chart folds. These hands often lose to the raiser’s range. They are also hard to play after the flop.', 'Against an early-seat open, fold most offsuit hands. Call with pairs and strong suited hands.'],
    vsBigOpen: ['Playing on against big beginner opens', 'You call or 3-bet when a beginner opens big. Beginners open bigger with strong hands, often 99 or better and AK. Most hands that would play on against a normal open lose to that range.', 'When a beginner opens much bigger than usual, play on only with strong pairs and AK. Fold the rest.'],
    threeBetLight: ['3-betting too light', 'You re-raise opens with hands that are too weak. A 3-bet with a weak hand risks many chips. Strong hands call or 4-bet. Then you are behind.', 'Against weak players, 3-bet for value: big pairs, AK and AQ. Fold or call the rest.'],
    foldVs3bet: ['Folding too much to 3-bets', 'You fold too often after you open and someone re-raises. Your open already put chips in. Strong hands should call or 4-bet.', 'After a 3-bet, keep pairs from 99 up, AK, AQ and suited broadway cards.'],
    callVs3bet: ['Calling 3-bets too wide', 'You call 3-bets with hands that are too weak. The pot is big and the other player’s range is strong. Weak hands lose a lot after the flop.', 'Against a 3-bet, fold weak offsuit hands and small suited ones. Their range is much stronger than an open.'],
    fourBetLight: ['4-betting too light', 'You 4-bet hands that are not strong enough. A 4-bet puts many chips in. A weak player who 3-bets usually holds a big hand.', 'Against weak players, 4-bet only AA, KK, QQ and AK.'],
    limpPlay: ['Playing badly against limpers', 'Your choices against limpers cost chips. Limpers often hold weak hands. A raise with a good hand often wins the pot at once. When it is called, you play a bigger pot with the better hand.', 'Against limpers, raise good hands to about 4bb plus 1bb per limper. Fold weak ones.'],
    shortShove: ['Shoving too loose when short', 'You move all in with hands the push/fold chart folds. With a short stack each shove risks your whole stack.', 'When short, follow the Nash push/fold chart. Shove fewer hands from early seats.'],
    shortFold: ['Folding too much when short', 'You fold hands the push/fold chart shoves. A short stack needs to pick up the blinds before they eat it.', 'When short, follow the Nash push/fold chart. From late seats, shove many hands.'],
    sizePre: ['Raise sizes far from the chart', 'Your preflop raises are much bigger or smaller than the chart. A wrong size gives the other players a better price or risks too much.', 'Open to about 2.5bb. 3-bet to about 3 times the open. Add 1bb for each limper.'],
    sizePost: ['Bet sizes far from the plan', 'Your bets after the flop are much bigger or smaller than the baseline. A wrong size can let draws in cheap or scare off hands that would pay you.', 'Most flop bets work at a third to half the pot. On the turn and river, bet bigger with strong hands.'],
    callAir: ['Calling {s} bets with no pair', 'You call {s} bets when you have no pair. With no pair you win only when the other player is bluffing. Most players bluff less than that.', 'With no pair and no good draw, fold to a {s} bet.'],
    callWeak: ['Calling {s} bets with a weak pair', 'You call {s} bets with second pair or worse. A weak pair loses to most hands that keep betting.', 'Against a weak player’s {s} bet, fold weak pairs unless the bet is small.'],
    callGood: ['Calling {s} bets with one pair', 'You call {s} bets with top pair when the bet shows a stronger hand. Top pair is good. Against a big bet it often loses.', 'When a careful player bets big on the {s}, top pair is often behind. Fold the weaker ones.'],
    callStrong: ['Just calling with strong hands on the {s}', 'You call a {s} bet with a strong hand when a raise wins more. A call keeps the pot small when you want it big.', 'With two pair or better, raise {s} bets for value.'],
    callNotRaise: ['Calling {s} bets when a raise is better', 'You call {s} bets where the baseline raises. A raise wins the pot now or builds it with your good hands.', 'With a strong hand or a big draw, raise the {s} bet.'],
    foldAir: ['Folding to {s} bets too often', 'You fold to {s} bets with hands that should continue. Folding too much lets the other player bet with anything.', 'Before you fold to a {s} bet, check the pot odds. A small bet needs only a few wins to call.'],
    foldPair: ['Folding pairs to {s} bets', 'You fold a pair to a {s} bet when it is still good often enough. A pair beats every bluff.', 'Against a small {s} bet, keep your pairs. Fold them only to big bets from careful players.'],
    raiseAir: ['Bluff-raising the {s}', 'You raise the {s} with no pair. A raise needs the other player to fold. Weak players call too much for that.', 'Against weak players, do not raise as a bluff on the {s}. Raise for value instead.'],
    raiseThin: ['Raising the {s} too thin', 'You raise the {s} with hands that are not strong enough. Better hands call or re-raise. Worse hands fold.', 'Raise the {s} with two pair or better. Call or fold with one pair.'],
    bluffMulti: ['Bluffing into several players', 'You bet with no pair into two or more players. One of them often has something. Bluffs work best against one player.', 'In a multiway pot, bet only with good hands. Check your bluffs.'],
    betAir: ['Bluffing the {s} with no pair', 'You bet the {s} with no pair when a check is better. Weak players call too often for many bluffs to work.', 'Against weak players, bluff the {s} less. Bet your good hands instead.'],
    betWeak: ['Betting weak pairs on the {s}', 'You bet the {s} with a weak pair. Worse hands fold and better hands call. The bet gains little.', 'With second pair or worse, check the {s} and look to see a cheap showdown.'],
    betOther: ['Betting the {s} when a check is better', 'You bet the {s} where the baseline checks. The bet risks chips without enough gain.', 'On the {s}, bet when worse hands call or better hands fold. Otherwise check.'],
    checkStrong: ['Checking good hands on the {s}', 'You check the {s} with a hand that should bet. Weak players call with worse hands. A check gives that money away.', 'With top pair or better on the {s}, bet. Weak players pay off.'],
    checkAir: ['Missing bluffs on the {s}', 'You check the {s} with hands that make good bluffs. These bets win the pot often enough to pay.', 'On the {s}, bet some hands with no pair, mostly draws and hands with an overcard.'],
    checkOther: ['Checking the {s} when a bet is better', 'You check the {s} where the baseline bets. A bet wins the pot now or gets value from worse hands.', 'When you raised before the flop, bet the {s} more often.'],
    other: ['Other {s} plays', 'These {s} plays cost chips in different ways. Open each example to see the reason.', 'Read the review of each example hand.']
  };
  // the pattern of one non-Good decision: { key, fam, street } (street null when the pattern spans streets)
  function patternOf(d, rv) {
    var a = d.did && d.did.action, st = d.street, pos = rv.heroPos, g = posGroup(pos);
    if (d.leak === 'sizing') return st === 'preflop' ? { fam: 'sizePre', street: null } : { fam: 'sizePost', street: null };
    if (st === 'preflop') {
      var sp = preSpot(d.spot), agg = isAgg(a);
      if (sp === 'short') return { fam: agg ? 'shortShove' : 'shortFold', street: null };
      if (sp === 'rfi') {
        if (a === 'fold') return { fam: 'foldFirst', street: null };
        if (g === 'SB') return { fam: 'openSB', street: null };
        if (a === 'call') return { fam: 'limpFirst', street: null };
        return { fam: g === 'early' ? 'openEarly' : 'openLate', street: null };
      }
      if (sp === 'vsOpen') {
        if (a !== 'fold' && d.sizeTell && d.sizeTell.kind === 'big') return { fam: 'vsBigOpen', street: null };
        if (a === 'fold') return { fam: pos === 'BB' ? 'foldBB' : 'foldVsOpen', street: null };
        if (a === 'call') return { fam: g === 'SB' || g === 'BB' ? 'callBlinds' : 'callVsOpen', street: null };
        return { fam: 'threeBetLight', street: null };
      }
      if (sp === 'vs3bet') return { fam: a === 'fold' ? 'foldVs3bet' : a === 'call' ? 'callVs3bet' : 'fourBetLight', street: null };
      if (sp === 'limp') return { fam: 'limpPlay', street: null };
      if (pos === 'SB' && a !== 'fold') return { fam: 'openSB', street: null };
      return { fam: 'other', street: 'preflop' };
    }
    var c = handClass(d.hand), facing = d.toCall > 0, top = topAction(d);
    if (facing) {
      if (a === 'fold') return { fam: c === 'air' || !c ? 'foldAir' : 'foldPair', street: st };
      if (a === 'call') {
        if (isAgg(top)) return { fam: c === 'strong' ? 'callStrong' : 'callNotRaise', street: st };
        return { fam: c === 'air' ? 'callAir' : c === 'weak' ? 'callWeak' : c === 'good' ? 'callGood' : c === 'strong' ? 'callStrong' : 'other', street: st };
      }
      return { fam: c === 'air' ? 'raiseAir' : 'raiseThin', street: st };
    }
    if (isAgg(a)) {
      if (multiway(d) && (c === 'air' || c === 'weak')) return { fam: 'bluffMulti', street: null };
      return { fam: c === 'air' ? 'betAir' : c === 'weak' ? 'betWeak' : 'betOther', street: st };
    }
    if (a === 'check') return { fam: c === 'strong' || c === 'good' ? 'checkStrong' : c === 'air' ? 'checkAir' : 'checkOther', street: st };
    return { fam: 'other', street: st };
  }
  var fill = function (t, st) { return t.replace(/\{s\}/g, st || 'street'); };
  function describe(p) {
    var f = FAM[p.fam] || FAM.other;
    return { title: fill(f[0], p.street), why: fill(f[1], p.street), rule: fill(f[2], p.street) };
  }
  var nonGood = function (d) { return d && d.grade && d.grade !== 'Good'; };

  // ---------------------------------------------------------------- the leak finder
  function patterns(entries) {
    var P = {};
    entries.forEach(function (e) {
      var rv = e.rv;
      (rv.decisions || []).forEach(function (d) {
        if (!nonGood(d)) return;
        var p = patternOf(d, rv), key = p.fam + (p.street ? '.' + p.street : '');
        var x = P[key] || (P[key] = { key: key, fam: p.fam, street: p.street, count: 0, evLost: 0, examples: [] });
        x.count++; x.evLost += d.evLost || 0;
        x.examples.push({ n: e.n, handId: rv.handId, heroPos: rv.heroPos, heroCards: rv.heroCards, street: d.street, spot: d.spot, grade: d.grade, evLost: d.evLost || 0 });
      });
    });
    return Object.keys(P).map(function (k) {
      var x = P[k], t = describe(x);
      x.title = t.title; x.why = t.why; x.rule = t.rule;
      x.evLost = rd(x.evLost, 2); x.avg = x.count ? rd(x.evLost / x.count, 2) : 0;
      x.examples.sort(function (a, b) { return b.evLost - a.evLost || b.n - a.n; });
      x.examples = x.examples.slice(0, 3);
      return x;
    }).sort(function (a, b) { return b.evLost - a.evLost || b.count - a.count || (a.key < b.key ? -1 : 1); });
  }
  // how many more hands it should take for the closest pattern to reach MIN examples
  function needMore(list, hands) {
    if (!hands) return { hands: 0, more: 50 };
    var best = list.slice().sort(function (a, b) { return b.count - a.count || b.evLost - a.evLost; })[0];
    if (!best) return { hands: hands, more: Math.max(30, 50 - hands), closest: null };
    var per = best.count / hands;
    return { hands: hands, more: Math.max(5, Math.ceil((MIN - best.count) / per)), closest: best.title, count: best.count };
  }

  // ---------------------------------------------------------------- EV lost broken down
  function breakdown(entries) {
    var pos = {}, street = {}, grade = { Inaccuracy: 0, Mistake: 0, Blunder: 0 }, act = { fold: 0, check: 0, call: 0, betraise: 0 };
    entries.forEach(function (e) {
      var rv = e.rv;
      (rv.decisions || []).forEach(function (d) {
        if (!nonGood(d) || !(d.evLost > 0)) return;
        var v = d.evLost;
        pos[rv.heroPos] = (pos[rv.heroPos] || 0) + v;
        street[d.street] = (street[d.street] || 0) + v;
        if (grade[d.grade] != null) grade[d.grade] += v;
        act[actType(d.did && d.did.action)] += v;
      });
    });
    var rows = function (obj, order, label) {
      return order.filter(function (k) { return obj[k] != null; }).map(function (k) { return { key: k, label: label ? label[k] : k, evLost: rd(obj[k], 2) }; });
    };
    var posSeen = POS_ORDER.filter(function (p) { return pos[p] != null || entries.some(function (e) { return e.rv.heroPos === p; }); });
    posSeen.forEach(function (p) { if (pos[p] == null) pos[p] = 0; });
    STREETS.forEach(function (s) { if (street[s] == null) street[s] = 0; });
    return {
      byPos: rows(pos, posSeen),
      byStreet: rows(street, STREETS, { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }),
      byGrade: rows(grade, ['Inaccuracy', 'Mistake', 'Blunder']),
      byAction: rows(act, ['fold', 'check', 'call', 'betraise'], { fold: 'Folds', check: 'Checks', call: 'Calls', betraise: 'Bets and raises' })
    };
  }

  // ---------------------------------------------------------------- preflop habits
  // target bands by table size, for a cash game against weak players
  var BANDS = {
    hu: { vpip: [60, 80], pfr: [45, 65], threeBet: [12, 20], name: 'heads-up' },
    short: { vpip: [27, 36], pfr: [21, 29], threeBet: [8, 13], name: '3 to 5 players' },
    six: { vpip: [22, 28], pfr: [17, 23], threeBet: [6, 10], name: '6 players' },
    full: { vpip: [16, 22], pfr: [13, 18], threeBet: [4, 8], name: '7 to 9 players' }
  };
  // a fair VPIP band for each seat at six players (scaled loosely for other sizes)
  var POS_VPIP = { UTG: [13, 20], UTG1: [12, 19], UTG2: [13, 20], LJ: [14, 21], HJ: [17, 24], CO: [24, 32], BTN: [38, 52], SB: [28, 40], BB: [25, 45] };
  var POS_WORD = { UTG: 'UTG', UTG1: 'UTG1', UTG2: 'UTG2', LJ: 'the LJ', HJ: 'the HJ', CO: 'the CO', BTN: 'the BTN', SB: 'the small blind', BB: 'the big blind' };
  function seatsOf(rv) {
    if (rv.seats) return rv.seats;
    var p = rv.heroPos; // older saved hands do not store the table size: guess from the seat name
    return p === 'UTG1' || p === 'UTG2' ? 9 : p === 'LJ' ? 7 : null;
  }
  function bandFor(entries) {
    var cnt = {}, known = 0;
    entries.forEach(function (e) { var s = seatsOf(e.rv); if (s) { cnt[s] = (cnt[s] || 0) + 1; known++; } });
    var seats = 6, top = 0;
    Object.keys(cnt).forEach(function (k) { if (cnt[k] > top) { top = cnt[k]; seats = +k; } });
    var b = seats <= 2 ? BANDS.hu : seats <= 5 ? BANDS.short : seats === 6 ? BANDS.six : BANDS.full;
    return { band: b, seats: seats, guessed: entries.some(function (e) { return !e.rv.seats; }) };
  }
  function habits(entries) {
    var h = { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, pos: {} };
    entries.forEach(function (e) {
      var pre = (e.rv.decisions || []).filter(function (d) { return d.street === 'preflop'; });
      if (!pre.length) return; // a walk: the hero never acted
      var vol = pre.some(function (d) { var a = d.did && d.did.action; return a === 'call' || isAgg(a); });
      var rz = pre.some(function (d) { return isAgg(d.did && d.did.action); });
      var opp = pre.filter(function (d) { return preSpot(d.spot) === 'vsOpen' || (preSpot(d.spot) === 'short' && / vs \w+ raise/.test(d.spot || '')); })[0];
      h.hands++; if (vol) h.vpip++; if (rz) h.pfr++;
      if (opp) { h.tbOpp++; if (isAgg(opp.did && opp.did.action)) h.tb++; }
      var p = e.rv.heroPos, q = h.pos[p] || (h.pos[p] = { hands: 0, vpip: 0 }); q.hands++; if (vol) q.vpip++;
    });
    var pct = function (a, b) { return b ? rd(100 * a / b, 1) : null; };
    var bf = bandFor(entries), b = bf.band;
    var out = { hands: h.hands, seats: bf.seats, guessed: bf.guessed, tableName: b.name, stats: [] };
    var mk = function (key, name, v, n, band) {
      var verdict = v == null ? null : v < band[0] ? 'low' : v > band[1] ? 'high' : 'ok';
      return { key: key, name: name, value: v, sample: n, band: band, state: v == null ? 'none' : verdict };
    };
    var vp = mk('vpip', 'VPIP', pct(h.vpip, h.hands), h.hands, b.vpip), pf = mk('pfr', 'PFR', pct(h.pfr, h.hands), h.hands, b.pfr), tb = mk('threeBet', '3-bet', pct(h.tb, h.tbOpp), h.tbOpp, b.threeBet);
    // the seat that explains a VPIP outside its band most (at least 8 hands there)
    var worstPos = function (dir) {
      var best = null, gap = 0;
      Object.keys(h.pos).forEach(function (p) {
        var q = h.pos[p], band = POS_VPIP[p]; if (!band || q.hands < 8) return;
        var v = 100 * q.vpip / q.hands, g = dir > 0 ? v - band[1] : band[0] - v;
        if (g > gap) { gap = g; best = { pos: p, v: rd(v, 0), band: band }; }
      });
      return best;
    };
    var words = {
      vpip: { low: 'You play too few hands.', high: 'You play too many hands.', ok: 'You play a good number of hands.' },
      pfr: { low: 'You raise too rarely before the flop. Raise more of the hands you play.', high: 'You raise a lot before the flop. Make sure the hands are strong enough.', ok: 'You raise a good share of hands before the flop.' },
      threeBet: { low: 'You rarely re-raise an open. 3-bet your best hands for value.', high: 'You re-raise opens too often. Keep 3-bets for strong hands.', ok: 'You 3-bet about the right amount.' }
    };
    [vp, pf, tb].forEach(function (s) {
      if (s.state === 'none') { s.line = s.key === 'threeBet' ? 'Not enough hands facing an open yet.' : 'Not enough hands yet.'; return; }
      s.line = words[s.key][s.state];
      if (s.sample < 30) s.line += ' Only ' + s.sample + (s.key === 'threeBet' ? ' chances so far.' : ' hands so far.');
    });
    if (vp.state === 'high' || vp.state === 'low') {
      var w = worstPos(vp.state === 'high' ? 1 : -1);
      if (w) vp.line = 'You play too ' + (vp.state === 'high' ? 'many' : 'few') + ' hands from ' + POS_WORD[w.pos] + ' (' + w.v + '%, aim for ' + w.band[0] + '–' + w.band[1] + '%).';
    }
    if (pf.state === 'low' && vp.value != null && pf.value != null && vp.value - pf.value > 10) pf.line = 'You call much more than you raise. Raise the hands you play, or fold them.';
    out.stats = [vp, pf, tb];
    return out;
  }

  // ---------------------------------------------------------------- trend: the last 50 hands against the 50 before
  function trend(entries) {
    if (entries.length < 60) return null;
    var last = entries.slice(-50), prev = entries.slice(Math.max(0, entries.length - 100), entries.length - 50);
    var sum = function (list) {
      var ev = 0, m = 0;
      list.forEach(function (e) { (e.rv.decisions || []).forEach(function (d) { if (nonGood(d)) { m++; ev += d.evLost || 0; } }); });
      return { hands: list.length, evLost: rd(ev, 2), per100: rd(100 * ev / list.length, 1), mistakes: m, mistakesPer100: rd(100 * m / list.length, 0) };
    };
    var a = sum(last), b = sum(prev), diff = a.per100 - b.per100;
    var verdict = Math.abs(diff) < Math.max(1, 0.15 * b.per100) ? 'about the same' : diff < 0 ? 'better' : 'worse';
    return { last: a, prev: b, verdict: verdict };
  }

  function analyze(entries) {
    var all = (entries || []).filter(function (e) { return e && e.rv && Array.isArray(e.rv.decisions); });
    var list = all.filter(function (e) { return !e.rv.excluded; }); // hands the player took out (misclicks) teach nothing
    var pats = patterns(list), ok = pats.filter(function (p) { return p.count >= MIN; });
    var bd = breakdown(list), mistakes = 0;
    list.forEach(function (e) { e.rv.decisions.forEach(function (d) { if (nonGood(d)) mistakes++; }); });
    return {
      hands: list.length, excluded: all.length - list.length, mistakes: mistakes, patterns: pats,
      focus: ok[0] || null, also: ok.slice(1, 3), need: ok.length ? null : needMore(pats, list.length),
      byPos: bd.byPos, byStreet: bd.byStreet, byGrade: bd.byGrade, byAction: bd.byAction,
      habits: habits(list), trend: trend(list)
    };
  }

  return { analyze: analyze, patterns: patterns, patternOf: patternOf, handClass: handClass, preSpot: preSpot, habits: habits, trend: trend, breakdown: breakdown, FAM: FAM, MIN: MIN, BANDS: BANDS };
});
