/* Felt & Fold flop map: maps any real flop onto the nearest flop in the solved library.
 * UMD: window.FF.FlopMap in the browser (load flop-subsets-data.js first), require('./flop-map.js') in Node.
 * Card encoding as js/cards.js: card = rank * 4 + suit, rank 0 = deuce .. 12 = ace, suit 0..3 = c d h s.
 * Combo index as js/cards.js (pairs a < b in ascending order).
 *
 *   FF.FlopMap.lookup(boardCards, subsetSize?) -> { solvedFlop:[3 cards], name, suitPerm:[4], exact, distance }
 *       subsetSize is 25, 95 or 184 (default: the largest loaded). suitPerm[realSuit] = solvedSuit.
 *       exact = the real flop is the solved flop up to suit relabelling (distance 0).
 *   FF.FlopMap.mapCard(res, card) / unmapCard(res, card)   real <-> solved card (suits only; ranks are kept)
 *   FF.FlopMap.mapCombo(res, combo) / unmapCombo(res, combo) combo index; mapCombo gives -1 if a mapped card
 *       lands on the solved board (only possible when exact is false; fall back to the hand class)
 *   FF.FlopMap.canon(cards)      -> { cards, key, name, perm }: the class representative and the perm real -> canonical
 *   FF.FlopMap.features(cards)   -> texture features used by the distance
 *   FF.FlopMap.distance(a, b)    -> texture distance between two flops (cards arrays)
 *   FF.FlopMap.classes()         -> all 1,755 suit-isomorphic flop classes [{cards, key, name, weight}] (weights sum to 22,100)
 *   FF.FlopMap.setSubsets(data)  -> load FF.FLOP_SUBSETS-style data ({sizes, order}) by hand
 *
 * Texture distance (documented in solver/library/README.md):
 *   1.0 * |top rank diff| + 0.6 * |middle| + 0.4 * |bottom|      (ranks sorted high to low, pairs included)
 *   + 6 per pairing step (unpaired / paired / trips)
 *   + suit pattern: rainbow<->two-tone 3, two-tone<->monotone 4, rainbow<->monotone 7
 *   + 1.5 if both are two-tone but the suited cards sit in different rank positions
 *   + 1.0 * |connectedness diff|, connectedness = straight-making hole rank pairs + 0.1 * straight-draw rank pairs
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var data = null;
    try { data = require('./flop-subsets-data.js'); } catch (e) { data = null; }
    module.exports = factory(data);
  } else { root.FF = root.FF || {}; root.FF.FlopMap = factory(root.FF.FLOP_SUBSETS || null); }
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';
  var RANKS = '23456789TJQKA', SUITS = 'cdhs';
  var W_RANK = [1.0, 0.6, 0.4], W_PAIR = 6, W_SUITED_POS = 1.5, W_CONN = 1.0, W_DRAW = 0.1;
  var SUIT_D = [[0, 3, 7], [3, 0, 4], [7, 4, 0]]; // index: 0 rainbow, 1 two-tone, 2 monotone

  // 24 suit permutations, identity first
  var PERMS = [];
  (function () {
    for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) for (var c = 0; c < 4; c++) for (var d = 0; d < 4; d++)
      if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) PERMS.push([a, b, c, d]);
  })();

  // combo index as js/cards.js
  var CIDX = new Int16Array(52 * 52).fill(-1), C1 = new Uint8Array(1326), C2 = new Uint8Array(1326);
  (function () { var k = 0; for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) { C1[k] = b; C2[k] = a; CIDX[a * 52 + b] = CIDX[b * 52 + a] = k; k++; } })();

  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
  function parseCards(s) { var t = s.replace(/[\s,]+/g, ''), o = []; for (var i = 0; i < t.length; i += 2) o.push(RANKS.indexOf(t[i].toUpperCase()) * 4 + SUITS.indexOf(t[i + 1].toLowerCase())); return o; }
  function sortDesc(cards) { return cards.slice().sort(function (x, y) { return y - x; }); }
  function permCard(p, c) { return (c & ~3) | p[c & 3]; }
  function invPerm(p) { var q = [0, 0, 0, 0]; for (var i = 0; i < 4; i++) q[p[i]] = i; return q; }
  function compose(outer, inner) { return [outer[inner[0]], outer[inner[1]], outer[inner[2]], outer[inner[3]]]; } // outer(inner(s))
  function nameOf(cards) { // display order: ranks high to low, then suits c d h s
    return cards.slice().sort(function (x, y) { return (y >> 2) - (x >> 2) || (x & 3) - (y & 3); }).map(cardStr).join('');
  }

  // canonical form: over all suit relabellings, the rank-descending card list with the smallest key
  // (ranks are fixed, so this means low suit numbers on the high cards: Kc7d2h, Kc7c2d, ...)
  function canon(cards) {
    if (typeof cards === 'string') cards = parseCards(cards);
    var best = null, bestKey = Infinity, bestP = null;
    for (var i = 0; i < 24; i++) {
      var m = sortDesc(cards.map(function (c) { return permCard(PERMS[i], c); }));
      var key = m[0] * 2704 + m[1] * 52 + m[2];
      if (key < bestKey) { bestKey = key; best = m; bestP = PERMS[i]; }
    }
    return { cards: best, key: bestKey, name: nameOf(best), perm: bestP.slice() };
  }

  // ---------------------------------------------------------------- texture features
  function connectedness(rs) { // rs = rank list (may repeat)
    var R = 0; rs.forEach(function (r) { R |= 1 << r; });
    function windows(mask) { // the most distinct ranks in any 5-wide straight window (the ace also plays low)
      var m = ((mask << 1) & 0x3FFE) | (mask >> 12 & 1), best = 0; // bit 0 = ace low, bits 1..13 = 2..A
      for (var lo = 0; lo <= 9; lo++) { var w = (m >> lo) & 31, n = 0; while (w) { n += w & 1; w >>= 1; } if (n > best) best = n; }
      return best;
    }
    var S = 0, D = 0;
    for (var x = 0; x < 13; x++) for (var y = x + 1; y < 13; y++) {
      if ((R >> x & 1) || (R >> y & 1)) continue;
      var n = windows(R | 1 << x | 1 << y);
      if (n >= 5) S++; else if (n >= 4) D++;
    }
    return S + W_DRAW * D;
  }
  function features(cards) {
    if (typeof cards === 'string') cards = parseCards(cards);
    var c = canon(cards).cards, r = c.map(function (x) { return x >> 2; });
    var distinct = (r[0] !== r[1]) + (r[1] !== r[2]) + 1, pairing = 3 - distinct; // 0 unpaired, 1 paired, 2 trips
    var suits = {}; c.forEach(function (x) { suits[x & 3] = (suits[x & 3] || 0) + 1; });
    var nSuits = Object.keys(suits).length, pattern = nSuits === 3 ? 0 : nSuits === 2 ? 1 : 2;
    if (pairing === 2) pattern = 0; // trips are always rainbow
    var suitedPos = '';
    if (pattern === 1) {
      var fs = +Object.keys(suits).filter(function (s) { return suits[s] === 2; })[0], pos = [];
      c.forEach(function (x, i) { if ((x & 3) === fs) { var j = r.indexOf(r[i]); pos.push(j); } });
      suitedPos = pos.sort().join('');
    }
    return { ranks: r, pairing: pairing, pattern: pattern, suitedPos: suitedPos, conn: pairing === 2 ? 0 : connectedness(r) };
  }
  var FEAT = {};
  function feat(cards) { var k = canon(cards).key; return FEAT[k] || (FEAT[k] = features(cards)); }
  function distanceF(a, b) {
    var d = 0;
    for (var i = 0; i < 3; i++) d += W_RANK[i] * Math.abs(a.ranks[i] - b.ranks[i]);
    d += W_PAIR * Math.abs(a.pairing - b.pairing);
    d += SUIT_D[a.pattern][b.pattern];
    if (a.pattern === 1 && b.pattern === 1 && a.suitedPos !== b.suitedPos) d += W_SUITED_POS;
    d += W_CONN * Math.abs(a.conn - b.conn);
    return Math.round(d * 1000) / 1000;
  }
  function distance(a, b) { return distanceF(feat(a), feat(b)); }

  // ---------------------------------------------------------------- the 1,755 classes
  var CLASSES = null, CLASS_BY_KEY = null;
  function classes() {
    if (CLASSES) return CLASSES;
    var map = {};
    for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) for (var c = b + 1; c < 52; c++) {
      var k = canon([a, b, c]);
      if (!map[k.key]) map[k.key] = { cards: k.cards, key: k.key, name: k.name, weight: 0 };
      map[k.key].weight++;
    }
    CLASSES = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.key - x.key; });
    CLASS_BY_KEY = map;
    return CLASSES;
  }

  // ---------------------------------------------------------------- subsets and lookup
  var SUB = null; // { sizes:[..], lists: {size: [{cards, key, name, f}]} }
  function setSubsets(data) {
    if (!data) { SUB = null; return; }
    var all = data.order.map(function (n) { var k = canon(n); return { cards: k.cards, key: k.key, name: k.name, f: feat(k.cards) }; });
    SUB = { sizes: data.sizes.slice(), lists: {} };
    data.sizes.forEach(function (s) { SUB.lists[s] = all.slice(0, s); });
  }
  function nearestIn(list, cards) { // ties go to the earlier (higher priority) flop
    var f = feat(cards), best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) { var d = distanceF(f, list[i].f); if (d < bd) { bd = d; best = list[i]; } }
    return { flop: best, distance: bd };
  }
  // the suit relabelling of canonical real flop A onto solved flop S: match suits card by card (ranks high to low),
  // higher cards weigh more; ties keep the earliest perm (identity first)
  function alignPerm(A, S) {
    var bestP = PERMS[0], bs = -1, w = [4, 2, 1];
    for (var i = 0; i < 24; i++) {
      var p = PERMS[i], sc = 0;
      for (var j = 0; j < 3; j++) if (p[A[j] & 3] === (S[j] & 3)) sc += w[j];
      if (sc > bs) { bs = sc; bestP = p; }
    }
    return bestP;
  }
  function lookup(board, subsetSize) {
    if (typeof board === 'string') board = parseCards(board);
    if (!SUB) throw new Error('FlopMap: no subsets loaded (load flop-subsets-data.js or call setSubsets)');
    var size = subsetSize || SUB.sizes[SUB.sizes.length - 1];
    var list = SUB.lists[size];
    if (!list) throw new Error('FlopMap: unknown subset size ' + size);
    var b3 = board.slice(0, 3), ca = canon(b3), nr = nearestIn(list, ca.cards), S = nr.flop.cards;
    var exact = nr.flop.key === ca.key;
    var q = exact ? PERMS[0] : alignPerm(ca.cards, S);
    var perm = compose(q, ca.perm);
    return { solvedFlop: S.slice(), name: nr.flop.name, suitPerm: perm, exact: exact, distance: nr.distance, subset: size };
  }
  function mapCard(res, c) { return permCard(res.suitPerm, c); }
  function unmapCard(res, c) { return permCard(invPerm(res.suitPerm), c); }
  function mapCombo(res, k) {
    var a = mapCard(res, C1[k]), b = mapCard(res, C2[k]);
    if (res.solvedFlop.indexOf(a) >= 0 || res.solvedFlop.indexOf(b) >= 0) return -1;
    return CIDX[a * 52 + b];
  }
  function unmapCombo(res, k) { return CIDX[unmapCard(res, C1[k]) * 52 + unmapCard(res, C2[k])]; }

  if (DATA) setSubsets(DATA);

  return { PERMS: PERMS, canon: canon, features: features, distance: distance, distanceF: distanceF, classes: classes,
    setSubsets: setSubsets, subsetSizes: function () { return SUB ? SUB.sizes.slice() : []; },
    subset: function (size) { return SUB && SUB.lists[size] ? SUB.lists[size].map(function (x) { return x.name; }) : null; },
    lookup: lookup, mapCard: mapCard, unmapCard: unmapCard, mapCombo: mapCombo, unmapCombo: unmapCombo,
    nameOf: nameOf, parseCards: parseCards, cardStr: cardStr, invPerm: invPerm,
    weights: { rank: W_RANK, pair: W_PAIR, suit: SUIT_D, suitedPos: W_SUITED_POS, conn: W_CONN, draw: W_DRAW } };
});
