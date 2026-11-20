/* Felt & Fold: cards, seeded RNG, 7-card evaluator, hand classes, combos, equity.
 * UMD: window.FF.Cards in the browser, require('./cards.js') in node. No DOM.
 *
 * A card is an int 0..51: rank * 4 + suit, rank 0 = deuce .. 12 = ace, suit 0..3 = c d h s.
 * A hand score is an int, higher is better: category << 20 | ranks in 4-bit nibbles (most significant first).
 * Categories: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads, 8 straight flush.
 * A combo is an unordered pair of cards, indexed 0..1325. A range is a Float64Array(1326) of weights (0..1).
 * A hand class is one of the 169 starting-hand types, indexed row * 13 + col on the usual grid
 * (rows and cols A..2, pairs on the diagonal, suited above it, offsuit below it).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.FF = root.FF || {}; root.FF.Cards = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RANKS = '23456789TJQKA', SUITS = 'cdhs';
  var RANK_NAME = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  var RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
  var CAT_NAME = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

  // ---------------------------------------------------------------- RNG (mulberry32): state lives in an object so it can be saved
  function rng(seed) {
    var o = { s: (seed >>> 0) || 1 };
    var f = function () {
      var t = (o.s = (o.s + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = o;
    f.int = function (n) { return Math.floor(f() * n); };
    return f;
  }
  function hashSeed() { // mix any number of ints into one seed
    var h = 2166136261 >>> 0;
    for (var i = 0; i < arguments.length; i++) { h ^= (arguments[i] | 0); h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
    return h >>> 0 || 1;
  }

  // ---------------------------------------------------------------- cards
  function rankOf(c) { return c >> 2; }
  function suitOf(c) { return c & 3; }
  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
  function parseCard(s) {
    var r = RANKS.indexOf(s[0].toUpperCase()), u = SUITS.indexOf(s[1].toLowerCase());
    if (r < 0 || u < 0) throw new Error('bad card ' + s);
    return r * 4 + u;
  }
  function parseCards(s) { // "AsKd Qh" or "AsKdQh"
    var t = s.replace(/[\s,]+/g, ''), out = [];
    for (var i = 0; i < t.length; i += 2) out.push(parseCard(t.substr(i, 2)));
    return out;
  }
  function cardsStr(a) { return a.map(cardStr).join(' '); }
  function newDeck() { var d = []; for (var i = 0; i < 52; i++) d.push(i); return d; }
  function shuffle(d, r) { for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = d[i]; d[i] = d[j]; d[j] = t; } return d; }

  // ---------------------------------------------------------------- evaluator tables
  var STRAIGHT = new Int8Array(8192), TOP5 = new Int32Array(8192), POP = new Uint8Array(8192);
  (function () {
    for (var m = 0; m < 8192; m++) {
      var n = 0, v = 0;
      for (var r = 12; r >= 0; r--) if (m >> r & 1) { if (n < 5) v |= r << (16 - 4 * n); n++; }
      POP[m] = n; TOP5[m] = v;
      var st = -1;
      for (var top = 12; top >= 4; top--) if (((m >> (top - 4)) & 31) === 31) { st = top; break; }
      if (st < 0 && (m & 0x100F) === 0x100F) st = 3; // wheel A2345
      STRAIGHT[m] = st;
    }
  })();
  function hb(x) { return 31 - Math.clz32(x); }

  // score from accumulated masks: m1..m4 = ranks seen at least 1..4 times, s0..s3 = rank masks per suit
  function scoreMasks(m1, m2, m3, m4, s0, s1, s2, s3) {
    var f = POP[s0] >= 5 ? s0 : POP[s1] >= 5 ? s1 : POP[s2] >= 5 ? s2 : POP[s3] >= 5 ? s3 : 0;
    var st, t, p, q, k;
    if (f) { st = STRAIGHT[f]; return st >= 0 ? (8 << 20) | (st << 16) : (5 << 20) | TOP5[f]; }
    if (m4) { q = hb(m4); return (7 << 20) | (q << 16) | ((TOP5[m1 & ~(1 << q)] >> 16) << 12); }
    if (m3) {
      t = hb(m3); p = m2 & ~(1 << t);
      if (p) return (6 << 20) | (t << 16) | (hb(p) << 12);
    }
    st = STRAIGHT[m1];
    if (st >= 0) return (4 << 20) | (st << 16);
    if (m3) return (3 << 20) | (t << 16) | ((TOP5[m1 & ~(1 << t)] >> 12) << 8);
    if (m2) {
      p = hb(m2); q = m2 & ~(1 << p);
      if (q) { q = hb(q); k = TOP5[m1 & ~(1 << p) & ~(1 << q)] >> 16; return (2 << 20) | (p << 16) | (q << 12) | (k << 8); }
      return (1 << 20) | (p << 16) | ((TOP5[m1 & ~(1 << p)] >> 8) << 4);
    }
    return TOP5[m1];
  }
  // evaluate an array (or the first n entries) of 5..7 cards
  function evalCards(cs, n) {
    if (n === undefined) n = cs.length;
    var m1 = 0, m2 = 0, m3 = 0, m4 = 0, s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (var i = 0; i < n; i++) {
      var c = cs[i], b = 1 << (c >> 2);
      m4 |= m3 & b; m3 |= m2 & b; m2 |= m1 & b; m1 |= b;
      switch (c & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
    }
    return scoreMasks(m1, m2, m3, m4, s0, s1, s2, s3);
  }
  // board accumulator: precompute once, then score many 2-card holdings fast
  function boardState(board) {
    var st = { m1: 0, m2: 0, m3: 0, m4: 0, s: [0, 0, 0, 0] };
    for (var i = 0; i < board.length; i++) addTo(st, board[i]);
    return st;
  }
  function addTo(st, c) { var b = 1 << (c >> 2); st.m4 |= st.m3 & b; st.m3 |= st.m2 & b; st.m2 |= st.m1 & b; st.m1 |= b; st.s[c & 3] |= b; }
  function evalWith(st, a, c) {
    var m1 = st.m1, m2 = st.m2, m3 = st.m3, m4 = st.m4, s = [st.s[0], st.s[1], st.s[2], st.s[3]];
    var b = 1 << (a >> 2); m4 |= m3 & b; m3 |= m2 & b; m2 |= m1 & b; m1 |= b; s[a & 3] |= b;
    b = 1 << (c >> 2); m4 |= m3 & b; m3 |= m2 & b; m2 |= m1 & b; m1 |= b; s[c & 3] |= b;
    return scoreMasks(m1, m2, m3, m4, s[0], s[1], s[2], s[3]);
  }
  function category(score) { return score >> 20; }
  function nib(score, i) { return (score >> (16 - 4 * i)) & 15; }
  function handName(score) {
    var c = score >> 20, a = nib(score, 0), b = nib(score, 1);
    switch (c) {
      case 0: return 'High Card, ' + RANK_NAME[a];
      case 1: return 'Pair, ' + RANK_PLURAL[a];
      case 2: return 'Two Pair, ' + RANK_PLURAL[a] + ' and ' + RANK_PLURAL[b];
      case 3: return 'Three of a Kind, ' + RANK_PLURAL[a];
      case 4: return 'Straight, ' + RANK_NAME[a] + ' high';
      case 5: return 'Flush, ' + RANK_NAME[a] + ' high';
      case 6: return 'Full House, ' + RANK_PLURAL[a] + ' full of ' + RANK_PLURAL[b];
      case 7: return 'Four of a Kind, ' + RANK_PLURAL[a];
      default: return a === 12 ? 'Royal Flush' : 'Straight Flush, ' + RANK_NAME[a] + ' high';
    }
  }
  // the best five cards (for highlighting): brute force over 5-subsets, fine for UI use
  function bestFive(cs) {
    var best = -1, pick = null, n = cs.length, t = [0, 0, 0, 0, 0];
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) for (var c = b + 1; c < n; c++) for (var d = c + 1; d < n; d++) for (var e = d + 1; e < n; e++) {
      t[0] = cs[a]; t[1] = cs[b]; t[2] = cs[c]; t[3] = cs[d]; t[4] = cs[e];
      var s = evalCards(t, 5); if (s > best) { best = s; pick = t.slice(); }
    }
    return { score: best, cards: pick };
  }

  // ---------------------------------------------------------------- combos and hand classes
  var NC = 1326, C1 = new Uint8Array(NC), C2 = new Uint8Array(NC), CIDX = new Int16Array(52 * 52).fill(-1);
  var CLASS_OF = new Uint8Array(NC), CLASS_COMBOS = [], CLASS_NAME = [], CLASS_SIZE = new Uint8Array(169);
  function classIndex(r1, r2, suited) { // ranks 0..12 in any order
    var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    if (hi === lo) return (12 - hi) * 14;
    return suited ? (12 - hi) * 13 + (12 - lo) : (12 - lo) * 13 + (12 - hi);
  }
  (function () {
    for (var i = 0; i < 169; i++) {
      CLASS_COMBOS.push([]);
      var row = Math.floor(i / 13), col = i % 13, hi = 12 - Math.min(row, col), lo = 12 - Math.max(row, col);
      CLASS_NAME.push(RANKS[hi] + RANKS[lo] + (row === col ? '' : row < col ? 's' : 'o'));
    }
    var k = 0;
    for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) {
      C1[k] = b; C2[k] = a; CIDX[a * 52 + b] = CIDX[b * 52 + a] = k; // C1 is the higher card
      var ci = classIndex(a >> 2, b >> 2, (a & 3) === (b & 3));
      CLASS_OF[k] = ci; CLASS_COMBOS[ci].push(k); k++;
    }
    for (i = 0; i < 169; i++) CLASS_SIZE[i] = CLASS_COMBOS[i].length;
  })();
  function comboIndex(a, b) { return CIDX[a * 52 + b]; }
  function comboCards(i) { return [C1[i], C2[i]]; }
  function comboStr(i) { return cardStr(C1[i]) + cardStr(C2[i]); }
  function classOfCards(a, b) { return CLASS_OF[CIDX[a * 52 + b]]; }
  function classByName(s) { var i = CLASS_NAME.indexOf(s); if (i < 0) throw new Error('bad class ' + s); return i; }

  // range notation: "22+, A2s+, KTo+, A5s-A2s, 77-55, AK, JTs:0.5, KQo:50%". Later tokens overwrite earlier ones.
  function parseRange(str, into) {
    var f = into || new Float64Array(169);
    if (!str) return f;
    str.split(/[\s,]+/).forEach(function (tok) {
      if (!tok) return;
      var w = 1, m = tok.split(':');
      if (m.length > 1) { w = parseFloat(m[1]); if (/%$/.test(m[1])) w /= 100; tok = m[0]; }
      classesOf(tok).forEach(function (ci) { f[ci] = w; });
    });
    return f;
  }
  function classesOf(tok) {
    var out = [], R = function (ch) { var r = RANKS.indexOf(ch.toUpperCase()); if (r < 0) throw new Error('bad range token ' + tok); return r; };
    var dash = tok.split('-');
    if (dash.length === 2) { // "A5s-A2s", "77-55", "K9o-K6o"
      var a = dash[0], b = dash[1];
      if (a[0] === a[1]) { var x = R(a[0]), y = R(b[0]); for (var r = Math.min(x, y); r <= Math.max(x, y); r++) out.push(classIndex(r, r)); return out; }
      var hi = R(a[0]), k1 = R(a[1]), k2 = R(b[1]), sfx = a.substr(2);
      for (r = Math.min(k1, k2); r <= Math.max(k1, k2); r++) pushSfx(out, hi, r, sfx);
      return out;
    }
    var plus = /\+$/.test(tok); if (plus) tok = tok.slice(0, -1);
    var h = R(tok[0]), l = R(tok[1]), s = tok.substr(2);
    if (h === l) { for (r = h; r <= (plus ? 12 : h); r++) out.push(classIndex(r, r)); return out; }
    if (l > h) { var t = h; h = l; l = t; }
    for (r = l; r <= (plus ? h - 1 : l); r++) pushSfx(out, h, r, s);
    return out;
  }
  function pushSfx(out, hi, lo, sfx) {
    if (sfx !== 'o') out.push(classIndex(hi, lo, true));
    if (sfx !== 's') out.push(classIndex(hi, lo, false));
  }
  function classToCombos(f169, out) {
    var w = out || new Float64Array(NC);
    for (var i = 0; i < NC; i++) w[i] = f169[CLASS_OF[i]];
    return w;
  }
  function rangeFromString(str) { return classToCombos(parseRange(str)); }
  function rangePercent(w1326) { var s = 0; for (var i = 0; i < NC; i++) s += w1326[i]; return s / NC; }
  function classPercent(f169) { var s = 0; for (var i = 0; i < 169; i++) s += f169[i] * CLASS_SIZE[i]; return s / NC; }
  // zero every combo that uses one of the dead cards (returns a new array)
  function removeDead(w, dead) {
    var o = new Float64Array(w); for (var i = 0; i < dead.length; i++) for (var j = 0; j < 52; j++) if (j !== dead[i]) o[CIDX[dead[i] * 52 + j]] = 0;
    return o;
  }

  // ---------------------------------------------------------------- equity
  function deadMask(cards) { var m = new Uint8Array(52); for (var i = 0; i < cards.length; i++) m[cards[i]] = 1; return m; }
  function liveDeck(dead) { var m = deadMask(dead), d = []; for (var i = 0; i < 52; i++) if (!m[i]) d.push(i); return d; }
  function choose(n, k) { var r = 1; for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }
  // visit every k-subset of deck (k <= 5) with the chosen cards written into buf[off..]
  function eachSubset(deck, k, buf, off, fn) {
    var n = deck.length, idx = [];
    (function rec(start, depth) {
      if (depth === k) { fn(); return; }
      for (var i = start; i <= n - (k - depth); i++) { buf[off + depth] = deck[i]; rec(i + 1, depth + 1); }
    })(0, 0);
  }
  // fill buf[off..off+k) with k random distinct cards from deck (partial Fisher-Yates on a copy that is reused)
  function sampleInto(deck, k, buf, off, r) {
    var n = deck.length;
    for (var i = 0; i < k; i++) { var j = i + Math.floor(r() * (n - i)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; buf[off + i] = deck[i]; }
  }

  // multiway hand vs hand: hands = [[c,c], [c,c], ...]; returns {eq:[..], win:[..], tie:[..], n, exact}
  function equityHands(hands, board, opts) {
    opts = opts || {}; board = board || [];
    var nh = hands.length, k = 5 - board.length, dead = board.slice();
    hands.forEach(function (h) { dead.push(h[0], h[1]); });
    var deck = liveDeck(dead), runs = choose(deck.length, k), exact = opts.exact || runs <= (opts.maxExact || 60000);
    var bst = boardState(board), eq = new Float64Array(nh), win = new Float64Array(nh), tie = new Float64Array(nh), sc = new Int32Array(nh);
    var buf = [0, 0, 0, 0, 0], n = 0;
    var one = function () {
      var st = bst; if (k) { st = { m1: bst.m1, m2: bst.m2, m3: bst.m3, m4: bst.m4, s: bst.s.slice() }; for (var i = 0; i < k; i++) addTo(st, buf[i]); }
      var best = -1, cnt = 0;
      for (var h = 0; h < nh; h++) { sc[h] = evalWith(st, hands[h][0], hands[h][1]); if (sc[h] > best) { best = sc[h]; cnt = 1; } else if (sc[h] === best) cnt++; }
      for (h = 0; h < nh; h++) if (sc[h] === best) { if (cnt === 1) win[h]++; else tie[h]++; eq[h] += 1 / cnt; }
      n++;
    };
    if (exact) eachSubset(deck, k, buf, 0, one);
    else { var r = rng(opts.seed || 1), ns = opts.samples || 20000; for (var s = 0; s < ns; s++) { sampleInto(deck, k, buf, 0, r); one(); } }
    var o = { eq: [], win: [], tie: [], n: n, exact: !!exact };
    for (var h = 0; h < nh; h++) { o.eq.push(eq[h] / n); o.win.push(win[h] / n); o.tie.push(tie[h] / n); }
    return o;
  }
  function equityHvH(h1, h2, board, opts) { return equityHands([h1, h2], board, opts).eq[0]; }

  // hand vs weighted range (Float64Array 1326). Card removal: villain combos touching hero or board are skipped.
  // Exact when combos x runouts is small (always on the river), else seeded Monte Carlo. Returns {eq, win, tie, n, exact}
  function equityVsRange(hand, range, board, opts) {
    opts = opts || {}; board = board || [];
    var dead = deadMask(board.concat(hand)), list = [], cw = [], tot = 0;
    for (var i = 0; i < NC; i++) if (range[i] > 0 && !dead[C1[i]] && !dead[C2[i]]) { list.push(i); tot += range[i]; cw.push(tot); }
    if (!list.length) return { eq: NaN, win: NaN, tie: NaN, n: 0, exact: true };
    var k = 5 - board.length, deck0 = liveDeck(board.concat(hand)), runs = choose(deck0.length - 2, k);
    var exact = opts.exact || list.length * runs <= (opts.maxWork || 150000);
    var bst = boardState(board), win = 0, tie = 0, wsum = 0, buf = [0, 0, 0, 0, 0];
    function score(st, v) {
      var hs = evalWith(st, hand[0], hand[1]), vs = evalWith(st, C1[v], C2[v]);
      return hs > vs ? 1 : hs === vs ? 0.5 : 0;
    }
    if (exact) {
      for (var li = 0; li < list.length; li++) {
        var v = list[li], w = range[v], deck = deck0.filter(function (c) { return c !== C1[v] && c !== C2[v]; });
        if (!k) { var s0 = score(bst, v); if (s0 === 1) win += w; else if (s0) tie += w; wsum += w; continue; }
        eachSubset(deck, k, buf, 0, function () {
          var st = { m1: bst.m1, m2: bst.m2, m3: bst.m3, m4: bst.m4, s: bst.s.slice() };
          for (var j = 0; j < k; j++) addTo(st, buf[j]);
          var s = score(st, v); if (s === 1) win += w; else if (s) tie += w; wsum += w;
        });
      }
    } else {
      var r = rng(opts.seed || 1), ns = opts.samples || 10000, dk = deck0.slice();
      for (var s = 0; s < ns; s++) {
        var x = r() * tot, lo = 0, hi = cw.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (cw[mid] > x) hi = mid; else lo = mid + 1; }
        v = list[lo];
        // runout from the deck without villain's cards: draw, redraw on a clash (rare, cheap)
        var st = { m1: bst.m1, m2: bst.m2, m3: bst.m3, m4: bst.m4, s: bst.s.slice() }, got = 0;
        for (var tries = 0; got < k; tries++) {
          var j2 = got + Math.floor(r() * (dk.length - got)), t = dk[got]; dk[got] = dk[j2]; dk[j2] = t;
          if (dk[got] === C1[v] || dk[got] === C2[v]) continue;
          addTo(st, dk[got]); got++;
        }
        var sc = score(st, v); if (sc === 1) win++; else if (sc) tie++; wsum++;
      }
    }
    return { eq: (win + tie / 2) / wsum, win: win / wsum, tie: tie / wsum, n: wsum, exact: !!exact };
  }

  // equity of every combo in range A against range B on this board (card removal exact per runout).
  // River: one sort by score + prefix sums. Turn: every river card. Flop/preflop: opts.runouts sampled runouts
  // (default 250, seeded), or every runout with opts.exact. Returns Float64Array(1326): NaN where A has no weight.
  function rangeVsRange(wA, wB, board, opts) {
    opts = opts || {}; board = board || [];
    var num = new Float64Array(NC), den = new Float64Array(NC), k = 5 - board.length;
    var bd = deadMask(board), rest = [];
    for (var c = 0; c < 52; c++) if (!bd[c]) rest.push(c);
    var full = board.slice(), scratch = { list: new Int16Array(NC), score: new Int32Array(NC), cardB: new Float64Array(52), below: new Float64Array(52), tieC: new Float64Array(52) };
    if (k === 0) riverPass(wA, wB, full, num, den, scratch);
    else if (k === 1) { for (var i = 0; i < rest.length; i++) { full[4] = rest[i]; riverPass(wA, wB, full, num, den, scratch); } }
    else if (opts.exact || choose(rest.length, k) <= (opts.runouts || 250)) {
      var buf = full.slice(); eachSubset(rest, k, buf, board.length, function () { riverPass(wA, wB, buf, num, den, scratch); });
    } else {
      var r = rng(opts.seed || 1), nr = opts.runouts || 250, dk = rest.slice(); full = board.slice();
      for (var s = 0; s < nr; s++) { sampleInto(dk, k, full, board.length, r); riverPass(wA, wB, full, num, den, scratch); }
    }
    var out = new Float64Array(NC);
    for (i = 0; i < NC; i++) out[i] = wA[i] > 0 && den[i] > 0 ? num[i] / den[i] : NaN;
    return out;
  }
  function riverPass(wA, wB, board5, num, den, S) {
    var st = boardState(board5), dead = 0, n = 0, list = S.list, score = S.score, cardB = S.cardB, below = S.below, tieC = S.tieC, i, j;
    var bm = [0, 0]; for (i = 0; i < 5; i++) { if (board5[i] < 32) bm[0] |= 1 << board5[i]; else bm[1] |= 1 << (board5[i] - 32); }
    var isDead = function (c) { return c < 32 ? (bm[0] >> c) & 1 : (bm[1] >> (c - 32)) & 1; };
    cardB.fill(0); below.fill(0);
    var totB = 0;
    for (i = 0; i < NC; i++) {
      if (!(wA[i] > 0 || wB[i] > 0) || isDead(C1[i]) || isDead(C2[i])) continue;
      list[n++] = i; score[i] = evalWith(st, C1[i], C2[i]);
      if (wB[i] > 0) { totB += wB[i]; cardB[C1[i]] += wB[i]; cardB[C2[i]] += wB[i]; }
    }
    var arr = Array.prototype.slice.call(list.subarray(0, n));
    arr.sort(function (a, b) { return score[a] - score[b]; });
    var belowT = 0;
    for (var g = 0; g < n;) {
      var e = g, sc = score[arr[g]], tieW = 0;
      while (e < n && score[arr[e]] === sc) { var x = arr[e]; if (wB[x] > 0) { tieW += wB[x]; tieC[C1[x]] += wB[x]; tieC[C2[x]] += wB[x]; } e++; }
      for (j = g; j < e; j++) {
        x = arr[j]; if (!(wA[x] > 0)) continue;
        var a = C1[x], b = C2[x], self = wB[x] > 0 ? wB[x] : 0;
        var valid = totB - cardB[a] - cardB[b] + self;
        if (valid <= 1e-12) continue;
        var winW = belowT - below[a] - below[b], tieWW = tieW - tieC[a] - tieC[b] + self;
        num[x] += winW + 0.5 * tieWW; den[x] += valid;
      }
      for (j = g; j < e; j++) { x = arr[j]; if (wB[x] > 0) { belowT += wB[x]; below[C1[x]] += wB[x]; below[C2[x]] += wB[x]; tieC[C1[x]] = 0; tieC[C2[x]] = 0; } }
      g = e;
    }
  }
  // hand strength rank of every live combo on a full board: Int32Array(1326) of scores, -1 where dead
  function boardScores(board5) {
    var st = boardState(board5), d = deadMask(board5), o = new Int32Array(NC).fill(-1);
    for (var i = 0; i < NC; i++) if (!d[C1[i]] && !d[C2[i]]) o[i] = evalWith(st, C1[i], C2[i]);
    return o;
  }

  return {
    RANKS: RANKS, SUITS: SUITS, RANK_NAME: RANK_NAME, RANK_PLURAL: RANK_PLURAL, CAT_NAME: CAT_NAME,
    rng: rng, hashSeed: hashSeed,
    rankOf: rankOf, suitOf: suitOf, cardStr: cardStr, cardsStr: cardsStr, parseCard: parseCard, parseCards: parseCards, newDeck: newDeck, shuffle: shuffle,
    evalCards: evalCards, boardState: boardState, addTo: addTo, evalWith: evalWith, category: category, handName: handName, bestFive: bestFive,
    NC: NC, C1: C1, C2: C2, comboIndex: comboIndex, comboCards: comboCards, comboStr: comboStr,
    CLASS_OF: CLASS_OF, CLASS_COMBOS: CLASS_COMBOS, CLASS_NAME: CLASS_NAME, CLASS_SIZE: CLASS_SIZE,
    classIndex: classIndex, classOfCards: classOfCards, classByName: classByName,
    parseRange: parseRange, classToCombos: classToCombos, rangeFromString: rangeFromString, rangePercent: rangePercent, classPercent: classPercent, removeDead: removeDead,
    equityHands: equityHands, equityHvH: equityHvH, equityVsRange: equityVsRange, rangeVsRange: rangeVsRange, boardScores: boardScores,
    liveDeck: liveDeck, choose: choose
  };
});
