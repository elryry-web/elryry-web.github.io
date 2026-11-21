/* Felt & Fold: preflop strategy for 6-max. Charts give each of the 169 hand classes a {fold, call, raise} mix.
 * UMD: window.FF.Ranges in the browser (load cards.js, pushfold-data.js, equity169-data.js first), require('./ranges.js') in node.
 *
 * Depths: hand-written charts at 100bb; 40bb and 25bb are derived from them by rules (see derive*), with 3-bet and
 * 4-bet jams at short depth solved against the 169x169 all-in equity table; 15bb and under uses the push/fold Nash data.
 * Spots the charts do not cover (multiway, squeezes, cold 4-bets, limped pots) get a labelled approximation.
 *
 * Main calls:
 *   spot(desc)            desc = { hero: 'CO', actions: [{ pos, type: 'raise'|'call'|'limp'|'check', toBB, allIn }], stackBB, ante, potBB, toCallBB, heroLeftBB }
 *                         -> { kind, label, depth, approx, fold, call, raise (Float64Array 169), raiseToBB, jam }
 *   forHand(h, seat, n)   the spot for an engine hand at seat (before log event n; default: now)
 *   advice(s, cls)        -> { fold, call, raise } for one class index
 *   preflopRange(h, seat) -> Float64Array(169) weights for the classes consistent with that seat's preflop actions
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./pushfold-data.js'), require('./equity169-data.js'));
  else { root.FF = root.FF || {}; root.FF.Ranges = factory(root.FF.Cards, root.FF.PUSHFOLD_DATA, root.FF.EQ169_DATA); }
})(typeof self !== 'undefined' ? self : this, function (C, PF, EQD) {
  'use strict';
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var SIZES = { open: { 100: 2.5, 40: 2.3, 25: 2.1 }, openSB: { 100: 3, 40: 3, 25: 2.5 }, threeBetIP: 3, threeBetOOP: 4, squeezeAdd: 1, fourBet: 2.2, jamAt: 0.4 };
  var DEPTHS = [25, 40, 100];

  // ---------------------------------------------------------------- 100bb charts: r = raise mix, c = call mix (later tokens overwrite; call is cut so r + c <= 1)
  var RFI = {
    UTG: { r: '55+, 44:0.5, 33:0.25, A2s+, K9s+, Q9s+, J9s+, T9s, 98s:0.6, 87s:0.4, 76s:0.25, 65s:0.25, ATo+, KJo+, KTo:0.25, QJo:0.5' },
    HJ: { r: '33+, 22:0.5, A2s+, K7s+, K6s:0.4, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s:0.5, 54s:0.25, A9o+, KTo+, QTo+, JTo:0.5' },
    CO: { r: '22+, A2s+, K5s+, K4s:0.5, Q8s+, Q7s:0.5, J8s+, T8s+, 97s+, 86s+, 75s+, 64s:0.5, 54s, 53s:0.25, A8o+, A7o:0.5, A5o:0.5, KTo+, K9o:0.5, QTo+, JTo, T9o:0.25' },
    BTN: { r: '22+, A2s+, K2s+, Q3s+, Q2s:0.5, J5s+, J4s:0.5, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, 42s:0.5, A2o+, K8o+, K7o:0.5, K6o:0.25, Q9o+, Q8o:0.5, J8o+, T8o+, 97o+, 87o:0.5, 76o:0.25' },
    // small blind: raise 3bb or complete (call = limp)
    SB: { r: '88+, 77:0.6, 66:0.4, A9s+, A8s:0.6, A5s-A3s:0.6, KTs+, QJs, AJo+, KQo, A2s:0.4, K5s:0.3, Q6s:0.3, J7s:0.3, T7s:0.3, 96s:0.3, 85s:0.3, 74s:0.3, 63s:0.3, A2o:0.3, K8o:0.3, Q9o:0.3, J9o:0.3',
      c: '22+, A2s+, K2s+, Q2s+, J4s+, T5s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q7o+, J7o+, T7o+, 97o+, 86o+, 76o, 65o' }
  };
  var VS_OPEN = { // hero 'vs' opener
    'HJ>UTG': { r: 'QQ+, AKs, AKo:0.8, JJ:0.3, AQs:0.3, A5s:0.5, A4s:0.4, KQs:0.3, KJs:0.15', c: 'JJ, TT, 99:0.6, 88:0.4, AQs, AJs:0.6, KQs, QJs:0.3, JTs:0.3, AQo:0.25' },
    'CO>UTG': { r: 'QQ+, AKs, AKo:0.85, JJ:0.35, AQs:0.4, A5s:0.6, A4s:0.5, KQs:0.35, KJs:0.2, 76s:0.1', c: 'JJ, TT, 99:0.8, 88:0.5, 77:0.3, AQs, AJs:0.8, ATs:0.4, KQs, KJs:0.5, QJs:0.5, JTs:0.5, T9s:0.3, AQo:0.4' },
    'CO>HJ': { r: 'QQ+, AKs, AKo, JJ:0.5, AQs:0.5, AJs:0.3, A5s:0.7, A4s:0.6, A3s:0.3, KQs:0.5, KJs:0.3, QJs:0.2, AQo:0.3, 65s:0.15', c: 'JJ, TT, 99, 88:0.6, 77:0.4, AQs, AJs, ATs:0.6, KQs, KJs, KTs:0.4, QJs:0.7, JTs:0.6, T9s:0.4, AQo:0.5' },
    'BTN>UTG': { r: 'QQ+, AKs, AKo:0.85, JJ:0.3, AQs:0.3, A5s:0.5, A4s:0.4, KQs:0.3, KJs:0.2, QJs:0.15', c: 'JJ, TT, 99, 88, 77:0.7, 66:0.5, 55:0.4, AQs, AJs, ATs, A9s:0.3, KQs, KJs, KTs:0.6, QJs, QTs:0.4, JTs, T9s, 98s:0.5, 87s:0.3, AQo:0.6, AJo:0.2, KQo:0.3' },
    'BTN>HJ': { r: 'QQ+, AKs, AKo, JJ:0.4, AQs:0.4, AJs:0.2, A5s:0.6, A4s:0.5, A3s:0.3, KQs:0.4, KJs:0.3, QJs:0.2, AQo:0.3, 76s:0.2, 65s:0.2', c: 'JJ, TT, 99, 88, 77, 66:0.7, 55:0.5, AQs, AJs, ATs, A9s:0.5, A8s:0.3, KQs, KJs, KTs, K9s:0.3, QJs, QTs, JTs, J9s:0.4, T9s, 98s, 87s:0.6, 76s:0.4, AQo, AJo:0.4, KQo:0.6' },
    'BTN>CO': { r: 'TT+, AKs, AKo, 99:0.3, AQs:0.5, AJs:0.4, ATs:0.3, A5s:0.8, A4s:0.7, A3s:0.5, A2s:0.3, KQs:0.5, KJs:0.4, KTs:0.3, K9s:0.2, QJs:0.3, JTs:0.2, AQo:0.5, AJo:0.2, KQo:0.3, 76s:0.25, 65s:0.25, 54s:0.2',
      c: '99, 88, 77, 66, 55:0.7, 44:0.5, 33:0.3, AQs, AJs, ATs, A9s, A8s:0.5, A7s:0.3, KQs, KJs, KTs, K9s:0.5, QJs, QTs, Q9s:0.4, JTs, J9s:0.6, T9s, T8s:0.4, 98s, 87s, 76s:0.6, 65s:0.4, AQo, AJo:0.7, ATo:0.2, KQo:0.6, KJo:0.2' },
    'SB>UTG': { r: 'TT+, AQs+, AJs:0.6, KQs:0.7, KJs:0.3, A5s:0.6, A4s:0.5, 99:0.5, AKo, AQo:0.4', c: '99:0.2, 88:0.2, AJs:0.2, KQs:0.2' },
    'SB>HJ': { r: '99+, AJs+, ATs:0.5, KQs, KJs:0.5, QJs:0.3, A5s:0.8, A4s:0.6, A3s:0.3, 88:0.4, 76s:0.15, AKo, AQo:0.6, AJo:0.2', c: '88:0.3, 77:0.3, ATs:0.3, KJs:0.3, QJs:0.3, JTs:0.3' },
    'SB>CO': { r: '88+, ATs+, A9s:0.4, KJs+, KTs:0.6, K9s:0.3, QJs, QTs:0.4, JTs:0.5, A5s, A4s, A3s:0.6, A2s:0.4, 77:0.5, 76s:0.3, 65s:0.3, AQo+, AJo:0.6, ATo:0.2, KQo:0.7', c: '77:0.3, 66:0.4, 55:0.3, A9s:0.3, KTs:0.2, QTs:0.3, JTs:0.4, T9s:0.4, 98s:0.3' },
    'SB>BTN': { r: '77+, 66:0.6, 55:0.4, A8s+, A7s:0.6, A6s:0.5, A5s-A2s, K9s+, K8s:0.4, QTs+, Q9s:0.4, JTs, J9s:0.5, T9s:0.6, 98s:0.4, 87s:0.3, 76s:0.3, 65s:0.3, ATo+, A9o:0.4, KJo+, KTo:0.4, QJo:0.5',
      c: '66:0.3, 55:0.4, 44:0.4, 33:0.3, 22:0.3, A7s:0.3, A6s:0.3, K8s:0.3, Q9s:0.3, J9s:0.3, T9s:0.4, 98s:0.4, 87s:0.4' },
    'BB>UTG': { r: 'QQ+, AKs, AKo:0.7, JJ:0.3, AQs:0.3, A5s:0.4, A4s:0.3, KQs:0.2, 76s:0.1, 65s:0.1', c: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, ATo+, KJo+, QJo, KTo:0.4, JTo:0.4' },
    'BB>HJ': { r: 'QQ+, AKs, AKo:0.8, JJ:0.4, AQs:0.4, AJs:0.2, A5s:0.5, A4s:0.4, A3s:0.2, KQs:0.3, KJs:0.2, 76s:0.15, 65s:0.15, 54s:0.1', c: '22+, A2s+, K4s+, Q7s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s:0.5, A9o+, A8o:0.4, KTo+, QTo+, JTo, T9o:0.4' },
    'BB>CO': { r: 'JJ+, AQs+, AKo, TT:0.4, AJs:0.4, AQo:0.4, A5s:0.6, A4s:0.5, A3s:0.4, KQs:0.4, KJs:0.3, QJs:0.2, K9s:0.15, 76s:0.2, 65s:0.2, 54s:0.2, A9o:0.1', c: '22+, A2s+, K2s+, Q5s+, J6s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A7o+, A5o:0.6, K9o+, Q9o+, J9o+, T9o, 98o:0.5, 87o:0.3' },
    'BB>BTN': { r: 'TT+, AJs+, AKo, AQo, 99:0.4, ATs:0.5, A5s:0.7, A4s:0.6, A3s:0.5, A2s:0.4, KJs+, KTs:0.4, K9s:0.25, QJs:0.4, Q9s:0.2, JTs:0.3, J9s:0.2, 87s:0.25, 76s:0.25, 65s:0.25, 54s:0.25, AJo:0.4, KQo:0.4, K8o:0.15, Q8o:0.15',
      c: '22+, A2s+, K2s+, Q2s+, J3s+, T5s+, 95s+, 84s+, 73s+, 62s+, 52s+, 42s+, 32s, A2o+, K5o+, Q7o+, J7o+, T7o+, 97o+, 86o+, 76o, 65o:0.5' },
    'BB>SB': { r: '88+, 77:0.5, A9s+, A5s-A2s, KTs+, K9s:0.4, QJs, Q9s:0.3, J9s:0.3, T8s:0.3, 97s:0.3, 86s:0.3, 75s:0.3, 64s:0.3, 53s:0.3, AJo+, KQo, A8o:0.3, K9o:0.3',
      c: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o:0.5' }
  };
  // opener facing a 3-bet; ip = the opener has position on the 3-bettor (a blind 3-bet), oop = the 3-bettor is behind
  var VS_3BET = {
    UTG: { oop: { r: 'KK+, QQ:0.4, AKs:0.6, AKo:0.4, A5s:0.4', c: 'QQ, JJ, TT, 99, 88:0.6, 77:0.4, AKs, AQs, AJs, ATs:0.4, KQs, KJs:0.4, QJs:0.4, JTs:0.5, T9s:0.3, AKo, AQo:0.6' },
      ip: { r: 'KK+, QQ:0.3, AKs:0.5, AKo:0.4, A5s:0.4, A4s:0.2', c: 'QQ, JJ, TT, 99, 88:0.6, 77:0.4, AKs, AQs, AJs, ATs:0.6, KQs, KJs:0.6, QJs:0.5, JTs:0.6, T9s:0.4, AKo, AQo:0.6' } },
    HJ: { oop: { r: 'KK+, QQ:0.5, AKs:0.6, AKo:0.5, A5s:0.5, A4s:0.3', c: 'QQ, JJ, TT, 99, 88:0.7, 77:0.5, 66:0.3, AKs, AQs, AJs, ATs:0.6, KQs, KJs:0.7, KTs:0.3, QJs:0.6, JTs:0.6, T9s:0.4, 98s:0.3, AKo, AQo:0.7' },
      ip: { r: 'KK+, QQ:0.4, AKs:0.5, AKo:0.5, A5s:0.5, A4s:0.3', c: 'QQ, JJ, TT, 99, 88, 77:0.5, 66:0.3, AKs, AQs, AJs, ATs:0.7, A9s:0.3, KQs, KJs, KTs:0.4, QJs:0.7, JTs:0.7, T9s:0.5, 98s:0.3, AKo, AQo:0.7, AJo:0.2' } },
    CO: { oop: { r: 'QQ+, JJ:0.2, AKs, AKo:0.6, A5s:0.5, A4s:0.4, K9s:0.1', c: 'JJ, TT, 99, 88, 77:0.7, 66:0.5, 55:0.3, AQs, AJs, ATs, A9s:0.4, A8s:0.3, KQs, KJs, KTs:0.6, QJs, QTs:0.5, JTs, T9s:0.6, 98s:0.5, 87s:0.4, 76s:0.3, AKo, AQo, AJo:0.3, KQo:0.4' },
      ip: { r: 'QQ+, JJ:0.2, AKs, AKo:0.6, A5s:0.5, A4s:0.4, A3s:0.2, K9s:0.1', c: 'JJ, TT, 99, 88, 77, 66:0.5, 55:0.3, AQs, AJs, ATs, A9s:0.5, KQs, KJs, KTs:0.6, QJs, QTs:0.4, JTs, T9s:0.7, 98s:0.5, 87s:0.4, AKo, AQo, AJo:0.4, KQo:0.4' } },
    BTN: { ip: { r: 'QQ+, JJ:0.2, AKs, AKo:0.6, A5s:0.5, A4s:0.4, K9s:0.15, 76s:0.1', c: 'JJ, TT, 99, 88, 77, 66, 55:0.7, 44:0.5, 33:0.3, A7s:0.3, A6s:0.3, K8s:0.3, J8s:0.3, 97s:0.3, 86s:0.3, 75s:0.3, 54s:0.3, KJo:0.3, QJo:0.3, ATo:0.3, AQs, AJs, ATs, A9s:0.6, A8s:0.4, KQs, KJs, KTs, K9s:0.4, QJs, QTs, Q9s:0.3, JTs, J9s:0.5, T9s, T8s:0.3, 98s, 87s:0.6, 76s:0.5, 65s:0.4, AKo, AQo, AJo:0.5, KQo:0.5' } },
    SB: { oop: { r: 'QQ+, AKs, AKo:0.7, JJ:0.2, A5s:0.5, A4s:0.3', c: 'JJ, TT, 99, 88, 77:0.7, 66:0.5, 55:0.4, AQs, AJs, ATs, A9s:0.5, A8s:0.4, KQs, KJs, KTs:0.6, QJs, QTs:0.5, JTs, T9s:0.6, 98s:0.4, AKo, AQo, AJo:0.4, KQo:0.4' } }
  };
  VS_3BET.BTN.oop = VS_3BET.BTN.ip; VS_3BET.SB.ip = VS_3BET.SB.oop;
  var VS_4BET = { // 3-bettor facing a 4-bet; raise = 5-bet all-in
    ip: { r: 'KK+, QQ:0.3, AKs:0.7, AKo:0.5, A5s:0.1', c: 'QQ, JJ:0.7, TT:0.3, AKs, AQs:0.5, AKo' },
    oop: { r: 'KK+, QQ:0.5, AKs:0.7, AKo:0.6', c: 'QQ, JJ:0.4, AKs, AQs:0.2, AKo' }
  };
  var BB_VS_LIMP = { r: '88+, 77:0.5, A9s+, A5s-A2s:0.5, KTs+, K9s:0.4, QJs, Q9s:0.3, J9s:0.3, T8s:0.3, 97s:0.3, 86s:0.3, 75s:0.3, 64s:0.3, 54s:0.3, ATo+, KJo+, K8o:0.3, Q9o:0.3' };
  var COLD_4BET = { r: 'KK+, QQ:0.4, AKs:0.5, AKo:0.3, A5s:0.15', c: 'QQ:0.5, JJ:0.3, AKs:0.3, AKo:0.2' };

  // ---------------------------------------------------------------- helpers
  function chart(def) {
    var r = C.parseRange(def.r || ''), c = C.parseRange(def.c || ''), f = new Float64Array(169);
    for (var i = 0; i < 169; i++) { if (r[i] + c[i] > 1) c[i] = 1 - r[i]; f[i] = 1 - r[i] - c[i]; }
    return { raise: r, call: c, fold: f };
  }
  function clone(s) { return { raise: Float64Array.from(s.raise), call: Float64Array.from(s.call), fold: Float64Array.from(s.fold) }; }
  function refold(s) { for (var i = 0; i < 169; i++) { if (s.raise[i] + s.call[i] > 1) s.call[i] = Math.max(0, 1 - s.raise[i]); s.fold[i] = Math.max(0, 1 - s.raise[i] - s.call[i]); } return s; }
  var cache = {};
  function memo(k, fn) { return cache[k] || (cache[k] = fn()); }

  // all-in equity table (decoded once): EQ[i * 169 + j]; COMPAT[i * 169 + j] = combos of j that do not clash with one combo of i
  var EQ = null, COMPAT = null, VSR = null;
  function equity169() {
    if (EQ) return EQ;
    var A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', k = 0;
    EQ = new Float64Array(169 * 169);
    for (var i = 0; i < 169; i++) {
      EQ[i * 169 + i] = 0.5;
      for (var j = i + 1; j < 169; j++) { var v = (A64.indexOf(EQD[k]) * 64 + A64.indexOf(EQD[k + 1])) / 4095; k += 2; EQ[i * 169 + j] = v; EQ[j * 169 + i] = 1 - v; }
    }
    COMPAT = new Float64Array(169 * 169);
    for (i = 0; i < 169; i++) {
      var rep = C.CLASS_COMBOS[i][0], a = C.C1[rep], b = C.C2[rep];
      for (j = 0; j < 169; j++) { var n = 0; C.CLASS_COMBOS[j].forEach(function (c) { if (C.C1[c] !== a && C.C1[c] !== b && C.C2[c] !== a && C.C2[c] !== b) n++; }); COMPAT[i * 169 + j] = n; }
    }
    VSR = new Float64Array(169);
    for (i = 0; i < 169; i++) { var s = 0, d = 0; for (j = 0; j < 169; j++) { s += EQ[i * 169 + j] * COMPAT[i * 169 + j]; d += COMPAT[i * 169 + j]; } VSR[i] = s / d; }
    return EQ;
  }
  // equity of every class vs a range of classes (weights f), with card removal; .weight[x] = live combos of the range given x
  function eqVsRange(f) {
    equity169();
    var out = new Float64Array(169), wt = new Float64Array(169);
    for (var x = 0; x < 169; x++) { var s = 0, d = 0; for (var y = 0; y < 169; y++) { if (!f[y]) continue; var w = f[y] * COMPAT[x * 169 + y]; s += w * EQ[x * 169 + y]; d += w; } out[x] = d > 0 ? s / d : 0.5; wt[x] = d; }
    out.weight = wt; return out;
  }
  function vsRandom() { equity169(); return VSR; }
  function speculative(i) { // small pairs, suited connectors and gappers below broadways, weak suited kings/queens
    var n = C.CLASS_NAME[i], hi = C.RANKS.indexOf(n[0]), lo = C.RANKS.indexOf(n[1]);
    if (n.length === 2) return hi <= 4;
    if (n[2] === 's') return hi <= 8 || (hi <= 11 && lo <= 5);
    return false;
  }
  function bluffy(i) { return vsRandom()[i] < 0.6; }

  // ---------------------------------------------------------------- derived depths
  function rfiAt(pos, depth) {
    return memo('rfi' + pos + depth, function () {
      var s = chart(RFI[pos]);
      if (depth < 100) for (var i = 0; i < 169; i++) if (speculative(i)) { var k = depth === 40 ? 0.8 : 0.6; s.call[i] *= k; s.raise[i] *= k; }
      return refold(s);
    });
  }
  // a jam decision against the opener's range: shove x when EV(jam) beats folding (by keepMargin * P0 for hands in keep, which can flat).
  // opp = opener's range (169 weights), S = effective stack, inv = opener's chips in, heroIn = hero's chips in, P0 = pot now,
  // behind = players still to act after hero (they call with the hands that beat the price against the jam range).
  // Fictitious play: both sides best-respond to the other's running average, which settles instead of flip-flopping.
  function solveJam(opp, S, inv, heroIn, P0, behind, keep, keepMargin) {
    equity169();
    var jam = new Float64Array(169), vr = vsRandom(), all = eqVsRange(opp).weight, ones = new Float64Array(169).fill(1), allR = eqVsRange(ones).weight;
    for (var x = 0; x < 169; x++) jam[x] = vr[x] > 0.62 ? 1 : 0;
    var potT = P0 + (S - heroIn) + (S - inv), callAvg = new Float64Array(169), callB = new Float64Array(169), br = new Float64Array(169);
    var need = (S - inv) / potT, needB = S / (potT + inv), ITER = 40;
    for (var it = 0; it < ITER; it++) {
      var eJ = eqVsRange(jam), step = 1 / (it + 1);
      for (x = 0; x < 169; x++) { callAvg[x] += (opp[x] * (eJ[x] >= need ? 1 : 0) - callAvg[x]) * step; callB[x] = eJ[x] >= needB ? 1 : 0; }
      var eC = eqVsRange(callAvg), eB = eqVsRange(callB);
      for (x = 0; x < 169; x++) {
        var pc = all[x] > 0 ? eC.weight[x] / all[x] : 0, pb = behind ? 1 - Math.pow(1 - (allR[x] > 0 ? eB.weight[x] / allR[x] : 0), behind) : 0;
        var pCall = pc + (1 - pc) * pb, eqC = pCall > 0 ? (pc * eC[x] + (1 - pc) * pb * eB[x]) / pCall : 0;
        var ev = (1 - pCall) * P0 + pCall * (eqC * potT - (S - heroIn));
        br[x] = ev > (keep && keep[x] ? keepMargin * P0 : 0) ? 1 : 0;
      }
      for (x = 0; x < 169; x++) jam[x] += (br[x] - jam[x]) * (1 / (it + 2));
    }
    for (x = 0; x < 169; x++) jam[x] = Math.round(jam[x] * 20) / 20;
    return { jam: jam, call: callAvg };
  }
  function vsOpenAt(key, depth) {
    return memo('vo' + key + depth, function () {
      var s = chart(VS_OPEN[key]), i;
      if (depth >= 100) return s;
      if (depth === 40) {
        for (i = 0; i < 169; i++) { if (bluffy(i)) s.raise[i] *= 0.6; if (speculative(i)) s.call[i] *= 0.75; }
        return refold(s);
      }
      // 25bb: the 3-bet is an all-in, solved against the opener's range
      var pq = key.split('>'), hero = pq[0], opener = pq[1], open = opener === 'SB' ? SIZES.openSB[25] : SIZES.open[25];
      var heroIn = hero === 'BB' ? 1 : hero === 'SB' ? 0.5 : 0, P0 = open + 1.5 - (opener === 'SB' ? 0.5 : 0);
      var J = solveJam(rfiAt(opener, 25).raise, 25, open, heroIn, P0, 5 - POS6.indexOf(hero), s.call, 0.3);
      for (i = 0; i < 169; i++) { s.raise[i] = J.jam[i]; s.call[i] = Math.min(1 - J.jam[i], s.call[i] * (speculative(i) ? 0.5 : 0.8)); }
      return refold(s);
    });
  }
  function vs3betAt(opener, ip, depth) {
    return memo('v3' + opener + ip + depth, function () {
      var s = chart(VS_3BET[opener][ip ? 'ip' : 'oop']);
      if (depth < 100) for (var i = 0; i < 169; i++) { if (bluffy(i)) s.raise[i] *= depth === 40 ? 0.3 : 0; if (speculative(i)) s.call[i] *= depth === 40 ? 0.6 : 0.4; }
      return refold(s);
    });
  }

  // ---------------------------------------------------------------- push/fold (15bb and under)
  function decode(str) { var f = new Float64Array(169); for (var i = 0; i < 169; i++) f[i] = (str.charCodeAt(i) - 65) / 20; return f; }
  function pfKey(bb) { return Math.max(2, Math.min(15, Math.round(bb))); }
  function pushRange(pos, bb, ante) { var d = PF[ante ? 'ante' : 'noAnte'][pfKey(bb)]; return d.shove[pos] ? decode(d.shove[pos]) : null; }
  function callRange(shover, caller, bb, ante) { var d = PF[ante ? 'ante' : 'noAnte'][pfKey(bb)], k = d.call[shover + '>' + caller]; return k ? decode(k) : null; }

  // ---------------------------------------------------------------- spot lookup
  function norm(pos, n) { // other table sizes onto 6-max names; heads-up the button is the small blind
    if (n === 2 && pos === 'BTN') return 'SB';
    return { UTG1: 'UTG', UTG2: 'UTG', LJ: 'UTG' }[pos] || pos;
  }
  function postIx(pos) { return POST_ORDER.indexOf(pos); }
  function nearestDepth(bb) { var best = 100, bd = 1e9; DEPTHS.forEach(function (d) { var x = Math.abs(Math.log(bb / d)); if (x < bd) { bd = x; best = d; } }); return bb >= 100 ? 100 : best; }
  function result(kind, label, depth, s, raiseToBB, extra) {
    var o = { kind: kind, label: label, depth: depth, fold: s.fold, call: s.call, raise: s.raise, raiseToBB: raiseToBB, jam: false, approx: false };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  // facing an all-in (or a bet that commits us): call when equity beats the price, with a soft edge near the line
  function vsJam(rangeF, need, label, depth) {
    var e = eqVsRange(rangeF), s = { fold: new Float64Array(169), call: new Float64Array(169), raise: new Float64Array(169) };
    for (var x = 0; x < 169; x++) { var c = Math.max(0, Math.min(1, (e[x] - need) / 0.03 + 0.5)); s.call[x] = c; s.fold[x] = 1 - c; }
    return result('vsJam', label, depth, s, 0, { need: need, equity: e });
  }

  // ---- size-aware defence. The charts are written for the standard raise size. Against another size the defence widens or
  // narrows with the raiser's break-even fold share: a raise risking `risk` to win `dead` needs dead / (risk + dead) defended,
  // so the chart's continuing share is scaled by that MDF over the MDF at the standard size. dead = the pot before the raise
  // minus the raiser's earlier chips. Hands come in or drop out by their equity against the raiser's range (a soft cut found
  // by bisection), so a bigger open folds the weakest defends first and a smaller one adds the best folds as calls.
  function sizeScale(dead, risk, risk0) { return risk > 0 && risk0 > 0 ? clamp((dead + risk0) / (dead + risk), 0.2, 1.6) : 1; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function resize(s, r, vsF, memoKey) {
    if (Math.abs(r - 1) < 0.03) return s;
    var key = 'rs' + memoKey + '|' + Math.round(r * 100);
    return memo(key, function () {
      var e = memo('eqv' + memoKey, function () { return eqVsRange(vsF); }), w = C.CLASS_SIZE, i, cont0 = 0;
      for (i = 0; i < 169; i++) cont0 += (s.raise[i] + s.call[i]) * w[i];
      var target = clamp(cont0 * r, 0.004 * 1326, 0.97 * 1326), o = clone(s), lo = 0, hi = 1, T = 0.5;
      var widen = r > 1, at = function (T) {
        var t = 0;
        for (var x = 0; x < 169; x++) { var c = s.raise[x] + s.call[x], g = sig((e[x] - T) / 0.02); t += (widen ? c + (1 - c) * g : c * g) * w[x]; }
        return t;
      };
      // the share kept (narrowing) or added (widening) rises as T falls
      for (var it = 0; it < 30; it++) { T = (lo + hi) / 2; if (at(T) > target) lo = T; else hi = T; }
      for (i = 0; i < 169; i++) {
        var g = sig((e[i] - T) / 0.02);
        if (widen) o.call[i] = s.call[i] + (1 - s.raise[i] - s.call[i]) * g;
        else { o.raise[i] = s.raise[i] * g; o.call[i] = s.call[i] * g; }
      }
      return refold(o);
    });
  }
  function sig(x) { return 1 / (1 + Math.exp(-x)); }

  // a raise over limpers: about 4bb plus 1bb per limper in position, 1bb more from the blinds (out of position).
  // The BB against a lone SB complete plays heads-up in position and raises to 4bb. A raise of 40% of the stack or more
  // becomes all in (SIZES.jamAt, in spot()).
  function isoTo(hero, limps) {
    if (hero === 'BB' && limps.length === 1 && limps[0].pos === 'SB') return 4;
    return 4 + limps.length + (hero === 'SB' || hero === 'BB' ? 1 : 0);
  }
  // desc: { hero, actions (voluntary preflop actions before hero, in order; folds may be left out), stackBB (effective), ante, nPlayers,
  //         potBB, toCallBB, heroLeftBB (hero's chips behind), heroInBB } -- the last four are optional and used for all-in pricing
  function spot(desc) {
    var n = desc.nPlayers || 6, hero = norm(desc.hero, n), acts = (desc.actions || []).filter(function (a) { return a.type !== 'fold' && a.type !== 'check'; });
    acts = acts.map(function (a) { return { pos: norm(a.pos, n), type: a.type, toBB: a.toBB || 0, allIn: !!a.allIn }; });
    var bb = desc.stackBB || 100, ante = !!desc.ante, raises = acts.filter(function (a) { return a.type === 'raise'; });
    var limps = acts.filter(function (a) { return a.type === 'limp' || (a.type === 'call' && !raises.length); });
    var heroRaised = raises.some(function (a) { return a.pos === hero; });
    var lastR = raises[raises.length - 1], firstR = raises[0];
    var callers = lastR ? acts.filter(function (a, i) { return a.type === 'call' && i > acts.indexOf(lastR); }).length : 0;
    var depth = bb <= 15.5 ? pfKey(bb) : nearestDepth(bb);
    // chips in front of each position (blinds, then each action), for default pricing
    var inn = { SB: n === 2 ? 0.5 : 0.5, BB: 1 }, potD = ante ? 1 : 0;
    acts.forEach(function (a) { inn[a.pos] = a.type === 'limp' ? 1 : a.toBB; });
    for (var q in inn) potD += inn[q];
    // facing an all-in, or a raise that leaves too little to fold: price it
    var toCall = desc.toCallBB != null ? desc.toCallBB : lastR ? lastR.toBB - (inn[hero] || 0) : 1 - (inn[hero] || 0), left = desc.heroLeftBB != null ? desc.heroLeftBB : bb - (inn[hero] || 0);
    if (lastR && (lastR.allIn || toCall >= left * 0.9)) {
      var jr = jammerRange(acts, raises.length - 1, bb, ante, n);
      var call = Math.min(toCall, left), pot = desc.potBB != null ? desc.potBB : potD;
      return vsJam(jr, call / (pot + call), lastR.pos + ' all in, ' + hero + ' to call', depth);
    }
    // 15bb and under: push/fold
    if (bb <= 15.5) {
      if (!raises.length && !limps.length && hero !== 'BB') {
        var pr = pushRange(hero, bb, ante), s0 = { raise: pr, call: new Float64Array(169), fold: new Float64Array(169) };
        refold(s0); return result('push', hero + ' first in at ' + pfKey(bb) + 'bb: shove or fold', pfKey(bb), s0, bb, { jam: true });
      }
      if (lastR && raises.length === 1) { // facing a raise that is not all-in: re-shove against the opener's push range
        var opR = pushRange(lastR.pos, bb, ante) || rfiAt('BTN', 25).raise, heroIn = hero === 'BB' ? 1 : hero === 'SB' ? 0.5 : 0;
        var J = solveJam(opR, bb, lastR.toBB, heroIn, potD, 5 - POS6.indexOf(hero));
        var s1 = { raise: J.jam, call: new Float64Array(169), fold: new Float64Array(169) }; refold(s1);
        return result('reshove', hero + ' vs ' + lastR.pos + ' raise at ' + pfKey(bb) + 'bb: shove or fold', pfKey(bb), s1, bb, { jam: true, approx: callers > 0 });
      }
    }
    var open = function (p) { return p === 'SB' ? SIZES.openSB[depth] : SIZES.open[depth]; };
    var s, kind, label, rt = 0, approx = false, sizeR = 1;
    if (!raises.length) {
      if (!limps.length) {
        if (hero === 'BB') return result('walk', 'everyone folded', depth, chart({ c: '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o+, K2o+, Q2o+, J2o+, T2o+, 92o+, 82o+, 72o+, 62o+, 52o+, 42o+, 32o' }), 0);
        s = rfiAt(hero, depth); kind = 'rfi'; label = hero + ' first in'; rt = open(hero);
      } else if (hero === 'BB') {
        s = chart(BB_VS_LIMP); s = clone(s); for (var i = 0; i < 169; i++) { s.call[i] = 1 - s.raise[i]; s.fold[i] = 0; } // call = check
        kind = 'bbVsLimp'; label = 'BB vs ' + (limps.length === 1 && limps[0].pos === 'SB' ? 'SB complete' : limps.length + ' limper' + (limps.length > 1 ? 's' : '')); rt = isoTo(hero, limps); approx = !(limps.length === 1 && limps[0].pos === 'SB');
      } else { // isolate the limpers or over-limp: the hero's open range, raise the top part
        s = clone(rfiAt(hero, depth)); var vr = vsRandom();
        for (i = 0; i < 169; i++) { var r0 = s.raise[i]; s.raise[i] = vr[i] > 0.6 ? r0 : r0 * 0.3; s.call[i] = speculative(i) ? r0 * 0.5 : 0; }
        refold(s); kind = 'isolate'; label = hero + ' vs ' + limps.length + ' limper' + (limps.length > 1 ? 's' : ''); rt = isoTo(hero, limps); approx = true;
      }
    } else if (raises.length === 1) {
      var key = hero + '>' + firstR.pos;
      if (!VS_OPEN[key]) key = hero + '>' + (postIx(firstR.pos) < postIx(hero) ? 'UTG' : firstR.pos); // fallback (should not happen 6-max)
      s = VS_OPEN[key] ? vsOpenAt(key, depth) : rfiAt(hero, depth);
      var heroIP = hero !== 'SB' && hero !== 'BB';
      rt = firstR.toBB * (heroIP ? SIZES.threeBetIP : SIZES.threeBetOOP) + callers * firstR.toBB * SIZES.squeezeAdd;
      kind = callers ? 'squeeze' : 'vsOpen'; label = hero + ' vs ' + firstR.pos + ' open' + (callers ? ' and ' + callers + ' caller' + (callers > 1 ? 's' : '') : '');
      if (callers || limps.length) { s = clone(s); for (i = 0; i < 169; i++) { s.call[i] *= 0.6; if (bluffy(i)) s.raise[i] *= 0.6; } refold(s); approx = true; }
      // the open's size: scale the defence by its MDF against the standard open's
      var oIn = firstR.pos === 'SB' ? 0.5 : firstR.pos === 'BB' ? 1 : 0, o0 = open(firstR.pos);
      sizeR = sizeScale(potD - firstR.toBB - callers * (firstR.toBB - o0), firstR.toBB - oIn, o0 - oIn);
      var basePos = VS_OPEN[key] ? key.split('>')[1] : firstR.pos;
      if (!RFI[basePos]) basePos = 'SB'; // the BB raising a limp has no open chart; the SB's wide open stands in
      s = resize(s, sizeR, rfiAt(basePos, depth).raise, key + depth + kind + callers + limps.length);
      if (depth === 25) rt = bb;
    } else if (raises.length === 2) {
      if (firstR.pos === hero) {
        var tb = raises[1].pos, ip = postIx(hero) > postIx(tb);
        s = vs3betAt(VS_3BET[hero] ? hero : 'CO', ip, depth); kind = 'vs3bet'; label = hero + ' open, ' + tb + ' 3-bets'; rt = raises[1].toBB * SIZES.fourBet;
        if (depth <= 40) rt = bb;
        // the 3-bet's size against the standard 3-bet over this open
        var tIn = tb === 'SB' ? 0.5 : tb === 'BB' ? 1 : 0, t0 = firstR.toBB * (ip ? SIZES.threeBetOOP : SIZES.threeBetIP), k3 = tb + '>' + hero;
        if (depth >= 40) {
          sizeR = sizeScale(potD - raises[1].toBB, raises[1].toBB - tIn, t0 - tIn);
          s = resize(s, sizeR, VS_OPEN[k3] ? vsOpenAt(k3, depth).raise : C.parseRange('TT+, AQs+, AKo, A5s, A4s'), 'v3' + k3 + depth + ip);
        }
        label += ' to ' + fmtBB(raises[1].toBB);
      } else { s = chart(COLD_4BET); kind = 'cold4bet'; label = hero + ' facing an open and a 3-bet to ' + fmtBB(raises[1].toBB); rt = raises[1].toBB * SIZES.fourBet; approx = true; }
    } else {
      if (raises[raises.length - 2].pos === hero) { var ip4 = postIx(hero) > postIx(lastR.pos); s = chart(VS_4BET[ip4 ? 'ip' : 'oop']); kind = 'vs4bet'; label = hero + ' 3-bet, ' + lastR.pos + ' 4-bets to ' + fmtBB(lastR.toBB); }
      else { s = chart({ r: 'AA, KK:0.5', c: 'KK:0.5, QQ:0.3, AKs:0.3' }); kind = 'approx'; label = hero + ' facing a 4-bet cold, to ' + fmtBB(lastR.toBB); approx = true; }
      rt = bb;
    }
    // a 3-bet or 4-bet far below the size the chart is built for: the chart's folds are priced by pot odds instead
    var priced = null;
    if (raises.length >= 2 && kind !== 'vs3bet' && depth >= 40 && !desc.noPrice) {
      var gone = {}, live = {};
      (desc.actions || []).forEach(function (a) { var p = norm(a.pos, n); if (a.type === 'fold') gone[p] = 1; else live[p] = 1; });
      var others = 0; for (var lp in live) if (!gone[lp] && lp !== hero && lp !== lastR.pos) others++;
      var pz = priceWiden(s, acts, raises, hero, desc, potD, toCall, bb, ante, n, others);
      if (pz) { s = pz.s; priced = pz.info; approx = true; }
    }
    var jam = rt >= bb * SIZES.jamAt;
    return result(kind, label, depth, s, jam ? bb : Math.round(rt * 10) / 10, { jam: jam, sizeScale: Math.round(sizeR * 100) / 100, priced: priced, approx: approx || acts.length > raises.length + (callers ? callers : 0) + limps.length });
  }
  function fmtBB(x) { var v = Math.round(x * 10) / 10; return (v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1)) + 'bb'; }
  // The size the chart assumes for the last raise: the 3-bet at 3x the open in position or 4x out of position, plus 1x the
  // open per caller before it, and the 4-bet at 2.2x that. A raise under 60% of it gets a price-based defence: each hand
  // the chart folds calls when its equity against the raiser's range, times a realization share for position, beats the
  // pot odds, less 15% for each other player still in. A small raise comes from a wider range: the raiser's raising hands,
  // half of the hands their chart calls with (before this pricing), then the strongest hands up to a width set by the size gap.
  var PRICE_SMALL = 0.6;
  function priceWiden(s, acts, raises, hero, desc, potD, toCall, bb, ante, n, others) {
    var o = raises[0], t = raises[1], last = raises[raises.length - 1], c1 = 0, k = acts.indexOf(o);
    for (var q = k + 1; q < acts.indexOf(t); q++) if (acts[q].type === 'call') c1++;
    var t0 = o.toBB * (postIx(t.pos) > postIx(o.pos) ? SIZES.threeBetIP : SIZES.threeBetOOP) + c1 * o.toBB;
    var std = raises.length === 2 ? t0 : raises.length === 3 ? t0 * SIZES.fourBet : 0;
    if (!(std > 0) || last.allIn || !(last.toBB < PRICE_SMALL * std)) return null;
    var prior = acts.slice(0, acts.indexOf(last)), sp = spot({ hero: last.pos, actions: prior, stackBB: bb, ante: ante, nPlayers: n, heroLeftBB: 1e9, noPrice: true });
    var jr = new Float64Array(169), any = 0;
    for (var x = 0; x < 169; x++) { jr[x] = Math.min(1, sp.raise[x] + 0.5 * sp.call[x]); any += jr[x]; }
    if (!any) return null;
    // a raise this far under the usual size is wider than the chart's raises: fill to about the raise share times the
    // size gap, between 5% and 20% of hands, with the strongest hands first
    var want = clamp(C.classPercent(sp.raise) * (std / last.toBB) * 1.5, 0.05, 0.2), vr = vsRandom();
    var order = []; for (x = 0; x < 169; x++) order.push(x);
    order.sort(function (i, j) { return vr[j] - vr[i]; });
    for (var oi = 0; oi < 169 && C.classPercent(jr) < want; oi++) jr[order[oi]] = 1;
    var e = eqVsRange(jr), pot = desc.potBB != null ? desc.potBB : potD, need = toCall / (pot + toCall), ip = postIx(hero) > postIx(last.pos);
    var w = clone(s);
    for (x = 0; x < 169; x++) {
      var real = clamp((ip ? 0.95 : 0.82) + 0.4 * (e[x] - 0.5), 0.6, 1.2) * Math.pow(0.85, others || 0), g = sig((e[x] * real - need) / 0.02);
      w.call[x] = s.call[x] + Math.max(0, 1 - s.raise[x] - s.call[x]) * g;
    }
    refold(w);
    return { s: w, info: { what: raises.length === 2 ? '3-bet' : '4-bet', std: Math.round(std * 10) / 10, faced: Math.round(last.toBB * 10) / 10, need: Math.round(need * 1000) / 1000, by: last.pos, ip: ip } };
  }
  // the range a jammer holds: the raise part of their own spot (first-in shove, or the chart at their decision)
  function jammerRange(acts, ri, bb, ante, n) {
    var raises = acts.filter(function (a) { return a.type === 'raise'; }), jr = raises[ri], prior = acts.slice(0, acts.indexOf(jr));
    if (bb <= 15.5 && ri === 0 && jr.pos !== 'BB') { var p = pushRange(jr.pos, bb, ante); if (p) return p; }
    var sp = spot({ hero: jr.pos, actions: prior, stackBB: bb, ante: ante, nPlayers: n, heroLeftBB: 1e9 });
    var f = Float64Array.from(sp.raise), any = 0; for (var i = 0; i < 169; i++) any += f[i];
    if (!any) return C.parseRange('TT+, AQs+, AKo');
    // a deep all-in far above the chart's raise size (a 4-bet jam instead of a 2.2x 4-bet). Real players jam their strong
    // hands here, not only the chart's small 4-bet value set: add the strong calls at half weight and halve the small bluffs.
    if (jr.allIn && sp.raiseToBB && !sp.jam && jr.toBB > 1.8 * sp.raiseToBB && jr.toBB > 25) {
      var strong = C.parseRange('TT+, AQs+, AKo');
      for (i = 0; i < 169; i++) {
        if (strong[i]) f[i] = Math.max(f[i], 0.5 * Math.min(1, sp.raise[i] + sp.call[i]), 0.5);
        else if (bluffy(i)) f[i] *= 0.5;
      }
    }
    return f;
  }
  function advice(s, cls) { return { fold: s.fold[cls], call: s.call[cls], raise: s.raise[cls] }; }

  // ---------------------------------------------------------------- engine glue
  // the spot at seat in engine hand h, from the log before event index n (default: everything so far)
  function forHand(h, seat, n) {
    var log = h.log.slice(0, n == null ? h.log.length : n), bbAmt = h.bb, inn = {}, cur = bbAmt, acts = [], np = h.order.length;
    log.forEach(function (e) {
      if (e.ev === 'post' && e.kind !== 'ante') inn[e.seat] = (inn[e.seat] || 0) + e.amount;
      if (e.ev !== 'act' || e.street !== 'preflop') return;
      var type = e.type;
      if (type === 'call' && cur <= bbAmt) type = 'limp';
      if (type === 'bet') type = 'raise';
      if (type === 'raise') cur = e.to;
      if (type !== 'fold' && type !== 'check') inn[e.seat] = e.to;
      acts.push({ pos: h.pos[e.seat], type: type, toBB: e.to / bbAmt, allIn: e.allIn });
    });
    var me = h.players[seat], antes = 0, potC = 0, others = 0;
    h.order.forEach(function (s) { var p = h.players[s]; antes += p.anteP; potC += inn[s] || 0;
      var folded = log.some(function (e) { return e.ev === 'act' && e.seat === s && e.type === 'fold'; });
      if (s !== seat && !folded) others = Math.max(others, p.stackStart - p.anteP); });
    var mine = me.stackStart - me.anteP, eff = Math.min(mine, others || mine);
    return spot({ hero: h.pos[seat], actions: acts, stackBB: eff / bbAmt, ante: h.ante > 0, nPlayers: np, potBB: (potC + antes) / bbAmt,
      toCallBB: Math.max(0, cur - (inn[seat] || 0)) / bbAmt, heroLeftBB: (mine - (inn[seat] || 0)) / bbAmt });
  }
  // weights over the 169 classes for what seat could hold given every preflop action it took
  function preflopRange(h, seat) {
    var f = new Float64Array(169).fill(1);
    h.log.forEach(function (e, i) {
      if (e.ev !== 'act' || e.seat !== seat || e.street !== 'preflop') return;
      var s = forHand(h, seat, i), col = e.type === 'fold' ? s.fold : (e.type === 'raise' || e.type === 'bet') ? s.raise : s.call;
      if (s.kind === 'push' || s.kind === 'reshove') col = e.type === 'fold' ? s.fold : s.raise; // a call that was really an all-in
      for (var x = 0; x < 169; x++) f[x] *= col[x];
    });
    return f;
  }
  // a chart as text rows for a 13x13 grid: [{ name, fold, call, raise }] in CLASS_NAME order
  function grid(s) { var o = []; for (var i = 0; i < 169; i++) o.push({ name: C.CLASS_NAME[i], fold: s.fold[i], call: s.call[i], raise: s.raise[i] }); return o; }
  function percents(s) { return { fold: C.classPercent(s.fold), call: C.classPercent(s.call), raise: C.classPercent(s.raise) }; }

  return { POS6: POS6, SIZES: SIZES, DEPTHS: DEPTHS, RFI: RFI, VS_OPEN: VS_OPEN, VS_3BET: VS_3BET, VS_4BET: VS_4BET,
    chart: chart, spot: spot, forHand: forHand, advice: advice, preflopRange: preflopRange, grid: grid, percents: percents,
    equity169: equity169, eqVsRange: eqVsRange, vsRandom: vsRandom, solveJam: solveJam, pushRange: pushRange, callRange: callRange,
    rfiAt: rfiAt, vsOpenAt: vsOpenAt, vs3betAt: vs3betAt };
});
