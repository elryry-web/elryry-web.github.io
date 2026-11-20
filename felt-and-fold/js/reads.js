/* Felt & Fold: player reads. What the hero could know about each opponent: the table's usual field (the prior) and
   what that opponent has shown so far (observed stats). The review grades against this read, never the hidden profile.
   UMD: window.FF.Reads in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./ai.js'));
  else { root.FF = root.FF || {}; root.FF.Reads = factory(root.FF.Cards, root.FF.AI); }
})(typeof self !== 'undefined' ? self : this, function (C, AI) {
  'use strict';
  var STREETS = ['flop', 'turn', 'river'];
  // a read switches on at READ_HANDS hands with READ_FACED postflop bets faced, or at SD_HANDS hands once
  // SD_STRONG showdowns (a weak hand called down, or a bluff shown) back it up
  var READ_HANDS = 25, READ_FACED = 6, SD_HANDS = 12, SD_STRONG = 2, TEMPER = 0.5, KEEP = 40;

  // expected rates per tier/style, from tools/reads-table.js (mixed 6-max tables, 100bb):
  // vpip, pfr (shares of hands), fold and raise (shares of postflop bets faced), bet (share of unopened postflop spots)
  var EXPECT = {
    "Beginner/Nit": [0.212,0.063,0.433,0.175,0.335], "Beginner/Rock": [0.367,0.107,0.416,0.144,0.362], "Beginner/TAG": [0.363,0.177,0.478,0.154,0.367], "Beginner/LAG": [0.516,0.295,0.365,0.156,0.391], "Beginner/Calling Station": [0.684,0.124,0.309,0.135,0.342], "Beginner/Maniac": [0.781,0.499,0.347,0.252,0.48], "Beginner/Trappy": [0.444,0.168,0.358,0.165,0.337],
    "Casual/Nit": [0.171,0.084,0.471,0.113,0.351], "Casual/Rock": [0.287,0.119,0.445,0.123,0.346], "Casual/TAG": [0.295,0.187,0.429,0.113,0.39], "Casual/LAG": [0.436,0.308,0.374,0.114,0.404], "Casual/Calling Station": [0.617,0.1,0.296,0.111,0.31], "Casual/Maniac": [0.747,0.57,0.373,0.168,0.543], "Casual/Trappy": [0.336,0.174,0.325,0.136,0.323],
    "Regular/Nit": [0.131,0.088,0.477,0.061,0.331], "Regular/Rock": [0.168,0.087,0.492,0.061,0.344], "Regular/TAG": [0.206,0.144,0.475,0.07,0.408], "Regular/LAG": [0.331,0.248,0.412,0.091,0.485], "Regular/Calling Station": [0.444,0.102,0.32,0.041,0.289], "Regular/Maniac": [0.528,0.406,0.437,0.072,0.559], "Regular/Trappy": [0.277,0.166,0.429,0.072,0.345],
    "Shark/Nit": [0.129,0.094,0.518,0.04,0.338], "Shark/Rock": [0.168,0.109,0.483,0.054,0.415], "Shark/TAG": [0.208,0.142,0.399,0.053,0.438], "Shark/LAG": [0.308,0.244,0.447,0.057,0.542], "Shark/Calling Station": [0.329,0.117,0.355,0.04,0.331], "Shark/Maniac": [0.405,0.306,0.464,0.065,0.609], "Shark/Trappy": [0.267,0.175,0.435,0.05,0.372],
    "Solver/Nit": [0.154,0.122,0.396,0.054,0.416], "Solver/Rock": [0.152,0.118,0.498,0.074,0.465], "Solver/TAG": [0.197,0.148,0.47,0.02,0.43], "Solver/LAG": [0.238,0.197,0.461,0.034,0.47], "Solver/Calling Station": [0.247,0.142,0.435,0.038,0.409], "Solver/Maniac": [0.238,0.184,0.475,0.029,0.514], "Solver/Trappy": [0.243,0.177,0.471,0.044,0.416]
  };

  // ---------------------------------------------------------------- observing hands
  function blank(name) {
    return { name: name || '', hands: 0, vpip: 0, pfr: 0, faced: { flop: [0, 0, 0, 0], turn: [0, 0, 0, 0], river: [0, 0, 0, 0] }, open: 0, bets: 0, shows: [], last: null, at: 0 };
  }
  // totals over the three streets: [faced, called, folded, raised]
  function facedAll(st) { var o = [0, 0, 0, 0]; STREETS.forEach(function (k) { var f = st.faced[k]; for (var i = 0; i < 4; i++) o[i] += f[i]; }); return o; }
  function isAggr(e) { return e.type === 'bet' || e.type === 'raise' || (e.type === 'allin' && e.to > e.betBefore); }
  // a shown hand is weak when it is no better than a pair below the board's top card
  function weakHand(score, board) {
    var cat = score >> 20, pr = (score >> 16) & 15, top = -1;
    board.forEach(function (c) { if ((c >> 2) > top) top = c >> 2; });
    return cat === 0 || (cat === 1 && pr < top);
  }
  // add one finished hand to the book ({id: stats}); the hero (heroId) is skipped. A hand is counted once.
  function observe(book, h, heroId) {
    var out = [];
    h.order.forEach(function (seat) {
      var p = h.players[seat]; if (!p || p.id === heroId) return;
      var st = book[p.id] || (book[p.id] = blank(p.name));
      if (st.last === h.id) return;
      st.last = h.id; st.at = Date.now(); st.name = p.name || st.name; st.hands++;
      var vp = false, pf = false, lastRiver = null;
      h.log.forEach(function (e) {
        if (e.ev !== 'act' || e.seat !== seat) return;
        if (e.street === 'preflop') { if (e.type === 'call' || isAggr(e)) vp = true; if (isAggr(e)) pf = true; return; }
        if (e.toCall > 0) { var f = st.faced[e.street]; f[0]++; if (e.type === 'fold') f[2]++; else if (isAggr(e)) f[3]++; else f[1]++; }
        else { st.open++; if (isAggr(e)) st.bets++; }
        if (e.street === 'river') lastRiver = e;
      });
      if (vp) st.vpip++; if (pf) st.pfr++;
      var sh = h.log.filter(function (e) { return e.ev === 'show' && e.seat === seat; })[0];
      if (sh && h.board.length === 5) {
        var weak = weakHand(sh.score, h.board), line = !lastRiver ? '' : lastRiver.type === 'call' || (lastRiver.type === 'allin' && !isAggr(lastRiver)) ? 'call' : isAggr(lastRiver) ? 'bet' : 'check';
        st.shows.push({ hand: h.id, cards: C.cardsStr(sh.cards), made: sh.name, line: line, weak: weak, callDown: weak && line === 'call', bluff: weak && line === 'bet' });
        if (st.shows.length > 8) st.shows.shift();
      }
      out.push(p.id);
    });
    return out;
  }
  // keep the most recent opponents only
  function prune(book, keep) {
    var ids = Object.keys(book).sort(function (a, b) { return (book[b].at || 0) - (book[a].at || 0); });
    ids.slice(keep || KEEP).forEach(function (id) { delete book[id]; });
    return book;
  }

  // ---------------------------------------------------------------- the table prior
  var TIER_WORD = { Beginner: ['beginner', 'beginners'], Casual: ['casual player', 'casual players'], Regular: ['regular', 'regulars'], Shark: ['strong regular', 'strong regulars'], Solver: ['strong regular', 'strong regulars'] };
  // ctx: {kind: 'cash', stake} | {kind: 'tourney', buyIn}. The joint tier x style weights come from how AI.field picks seats.
  function prior(ctx) {
    ctx = ctx || {};
    var mix = null, key;
    if (ctx.kind === 'tourney') { mix = AI.TOURNEY_FIELDS[ctx.buyIn] || AI.TOURNEY_FIELDS[10]; key = 't' + (ctx.buyIn || 10); }
    else { var stake = AI.CASH_STAKES.filter(function (c) { return c.id === ctx.stake; })[0] || AI.CASH_STAKES[0]; mix = Object.assign({}, stake.mix); if (stake.solvers) mix.Solver = (mix.Solver || 0) + 0.2; key = 'c' + stake.id; }
    var dist = {}, tot = 0, tiers = {}, k;
    for (var tier in mix) {
      if (!(mix[tier] > 0)) continue;
      var sb = AI.STYLE_BY_TIER[tier] || { TAG: 1 }, ts = 0; for (k in sb) ts += sb[k];
      for (var style in sb) { var w = mix[tier] * sb[style] / ts; dist[tier + '/' + style] = w; tot += w; }
      tiers[tier] = (tiers[tier] || 0) + mix[tier];
    }
    // every profile keeps a small chance, so a read can find a player the table rarely seats
    AI.TIER_NAMES.forEach(function (t) { AI.STYLE_NAMES.forEach(function (s) { var q = t + '/' + s; dist[q] = (dist[q] || 0) / tot * 0.96 + 0.04 / 35; }); });
    var top = null, tw = 0; for (k in tiers) if (tiers[k] > tw) { tw = tiers[k]; top = k; }
    var line = 'Players at this table are mostly ' + TIER_WORD[top][1] + '.', tt = AI.traits({ tier: top, style: 'TAG' }), typ = 'A typical ' + TIER_WORD[top][0];
    // the tier's own habit, so the advice that follows has a reason
    if (tt.calls === 'loose') line += ' ' + typ + ' calls too often.';
    else if (tt.calls === 'tight') line += ' ' + typ + ' folds too often.';
    else if (tt.bluffs === 'high') line += ' ' + typ + ' bluffs too often.';
    else if (tt.bluffs === 'low') line += ' ' + typ + ' rarely bluffs.';
    // the typical player: the usual tier with no strong style
    return { key: key, dist: dist, profile: { tier: top, style: 'TAG' }, tierWord: TIER_WORD[top][0], line: line, typical: 'a typical ' + TIER_WORD[top][0] };
  }

  // ---------------------------------------------------------------- from stats to a profile
  function logBin(k, n, p) { p = Math.min(0.97, Math.max(0.03, p)); return k * Math.log(p) + (n - k) * Math.log(1 - p); }
  function strongShows(st) { return st.shows.filter(function (s) { return s.callDown || s.bluff; }).length; }
  // posterior over tier/style: prior x tempered likelihood of the observed counts. Showdowns add weight: a weak
  // hand called down counts as two more calls, a shown bluff as two more bets.
  function posterior(st, pri) {
    var F = facedAll(st), cd = 0, bl = 0;
    st.shows.forEach(function (s) { if (s.callDown) cd++; if (s.bluff) bl++; });
    var nF = F[0] + 2 * cd, kFold = F[2], kRaise = F[3], nO = st.open + 2 * bl, kBet = st.bets + 2 * bl;
    var post = {}, mx = -Infinity, k;
    for (k in pri.dist) {
      var x = EXPECT[k]; if (!x) continue;
      var L = logBin(st.vpip, st.hands, x[0]) + logBin(st.pfr, st.hands, x[1]) + logBin(kFold, nF, x[2]) + logBin(kRaise, nF, x[3]) + logBin(kBet, nO, x[4]);
      post[k] = Math.log(pri.dist[k]) + TEMPER * L; if (post[k] > mx) mx = post[k];
    }
    var tot = 0; for (k in post) { post[k] = Math.exp(post[k] - mx); tot += post[k]; }
    for (k in post) post[k] /= tot;
    return post;
  }
  function established(st) {
    if (!st) return false;
    var F = facedAll(st);
    return (st.hands >= READ_HANDS && F[0] >= READ_FACED) || (st.hands >= SD_HANDS && strongShows(st) >= SD_STRONG);
  }
  var STYLE_WORD = { Nit: 'a nit', Rock: 'a rock', TAG: 'a solid player', LAG: 'a loose-aggressive player', 'Calling Station': 'a calling station', Maniac: 'a maniac', Trappy: 'a trappy player' };
  function pct(k, n) { return n ? Math.round(100 * k / n) : 0; }
  // the read on one opponent: {state: 'prior'|'read', profile, conf, name, line, tag, detail}
  function read(st, pri, name) {
    var first = String(name || (st && st.name) || 'This player').split(' ')[0];
    if (!established(st)) return { state: 'prior', profile: pri.profile, name: first, label: pri.typical, line: pri.line, hands: st ? st.hands : 0 };
    var post = posterior(st, pri), best = null, bw = 0;
    for (var k in post) if (post[k] > bw) { bw = post[k]; best = k; }
    var q = best.split('/'), prof = { tier: q[0], style: q[1] }, tr = AI.traits(prof), F = facedAll(st);
    // a tier the hero cannot tell apart at this sample reads as the style only
    var ev = evidence(st, first, prof, tr, F), who = whoWord(prof, tr);
    return { state: 'read', profile: prof, conf: Math.round(bw * 100) / 100, name: first, label: first, traits: tr, hands: st.hands,
      line: ev + ' ' + first + ' plays like ' + who + '.', evidence: ev, who: who, tag: tagWord(prof, tr, st) + ' · ' + st.hands + ' hands', detail: detail(st, F) };
  }
  function whoWord(prof, tr) {
    if (prof.style === 'TAG') return prof.tier === 'Beginner' ? 'a beginner' : prof.tier === 'Casual' ? 'a casual player' : 'a solid regular';
    return STYLE_WORD[prof.style];
  }
  function tagWord(prof, tr, st) {
    if (prof.style === 'Maniac') return 'bets a lot';
    if (tr.calls === 'loose') return 'calls a lot';
    if (prof.style === 'Nit' || prof.style === 'Rock') return 'plays tight';
    if (tr.calls === 'tight') return 'folds a lot';
    if (prof.style === 'LAG') return 'plays loose';
    if (prof.style === 'Trappy') return 'slow-plays';
    return prof.tier === 'Beginner' || prof.tier === 'Casual' ? 'plays loose' : 'solid';
  }
  // one sentence of hard evidence for the read
  function evidence(st, first, prof, tr, F) {
    var cd = st.shows.filter(function (s) { return s.callDown; }).pop(), bl = st.shows.filter(function (s) { return s.bluff; }).pop();
    if (tr.calls === 'loose' && prof.style !== 'Maniac') {
      return 'By now ' + first + ' has called ' + F[1] + ' of ' + F[0] + ' bets after the flop.' + (cd ? ' ' + first + ' called the river with ' + cd.cards + ' (' + cd.made.toLowerCase() + ').' : '');
    }
    if (prof.style === 'Maniac' || tr.bluffs === 'high') return 'By now ' + first + ' has bet or raised ' + (st.bets + F[3]) + ' times after the flop and called ' + F[1] + '.' + (bl ? ' ' + first + ' bet the river with ' + bl.cards + '.' : '');
    if (prof.style === 'Nit' || prof.style === 'Rock') return 'By now ' + first + ' has played ' + st.vpip + ' of ' + st.hands + ' hands.';
    if (tr.calls === 'tight') return 'By now ' + first + ' has folded to ' + F[2] + ' of ' + F[0] + ' bets after the flop.';
    return 'By now ' + first + ' has played ' + st.vpip + ' of ' + st.hands + ' hands and raised ' + st.pfr + ' before the flop.';
  }
  function detail(st, F) {
    return { hands: st.hands, vpip: pct(st.vpip, st.hands), pfr: pct(st.pfr, st.hands), faced: F[0], callPct: pct(F[1], F[0]), foldPct: pct(F[2], F[0]), raisePct: pct(F[3], F[0]),
      aggPct: pct(st.bets + F[3], st.bets + F[3] + F[1]), shows: st.shows.length };
  }
  function detailText(dt) {
    return 'VPIP ' + dt.vpip + '%, PFR ' + dt.pfr + '%. Calls ' + dt.callPct + '% of bets after the flop, folds ' + dt.foldPct + '%, raises ' + dt.raisePct + '% (' + dt.faced + ' bets). '
      + dt.aggPct + '% of bets, raises and calls are bets or raises. ' + dt.hands + ' hands' + (dt.shows ? ', ' + dt.shows + ' shown at showdown' : '') + '.';
  }
  // reads for every opponent in hand h, as of before h: {id: read}. ctx as in prior().
  function forReview(book, h, heroId, ctx) {
    var pri = prior(ctx), out = {};
    h.order.forEach(function (s) { var p = h.players[s]; if (p && p.id !== heroId) out[p.id] = read(book[p.id], pri, p.name); });
    return out;
  }
  // a gentle note for a decision graded with an earlier read, once a newer read shows a different player. Never a grade.
  function laterNote(usedTraits, now) {
    if (!usedTraits || !now || now.state !== 'read') return '';
    var t = now.traits, n = now.name, what = '';
    if (usedTraits.calls !== 'tight' && t.calls === 'tight') what = 'folds more than most players here';
    else if (usedTraits.calls !== 'loose' && t.calls === 'loose') what = 'calls more than most players here';
    else if (usedTraits.calls === 'loose' && t.calls !== 'loose') what = 'is tighter than most players here';
    else if (usedTraits.bluffs !== 'high' && t.bluffs === 'high') what = 'bluffs more than most players here';
    else if (usedTraits.bluffs !== 'low' && t.bluffs === 'low') what = 'bluffs less than most players here';
    return what ? 'Later hands show that ' + n + ' ' + what + '.' : '';
  }

  return { blank: blank, observe: observe, prune: prune, prior: prior, posterior: posterior, established: established, read: read, forReview: forReview,
    laterNote: laterNote, detailText: detailText, facedAll: facedAll, weakHand: weakHand, EXPECT: EXPECT,
    READ_HANDS: READ_HANDS, READ_FACED: READ_FACED, SD_HANDS: SD_HANDS, SD_STRONG: SD_STRONG };
});
