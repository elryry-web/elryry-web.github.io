/* Felt & Fold: AI opponents. Each one is the baseline (FF.Strategy) plus style distortions plus tier mistakes.
   agent.act(h, seat, legal) -> Promise<action>; agent.actSync(h, seat, legal) -> action.
   An action is an engine action ({type, to}) with metadata: thinkMs, chat (string or null), reason (plain sentence).
   UMD: window.FF.AI in the browser, module.exports under node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./ranges.js'), require('./strategy.js'));
  else { root.FF = root.FF || {}; root.FF.AI = factory(root.FF.Cards, root.FF.Engine, root.FF.Ranges, root.FF.Strategy); }
})(typeof self !== 'undefined' ? self : this, function (C, E, R, S) {
  'use strict';
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sig(x) { return 1 / (1 + Math.exp(-x)); }

  // ---------------------------------------------------------------- tiers and styles
  // skill: weight on the baseline postflop (the rest is a naive made-hand rule); mistake: chance of a random slip;
  // styleW: how far the style pushes; loose: extra preflop width; callShift: lower call threshold (calls too much)
  var TIERS = {
    Beginner: { skill: 0.25, mistake: 0.14, styleW: 1.2, loose: 0.35, callShift: -0.12, sizeByStrength: true, noFoldTopPair: true, mdfPull: 0, bluffMult: 0.35, adapt: false, tilt: 1, base: 1300 },
    Casual: { skill: 0.5, mistake: 0.08, styleW: 1, loose: 0.18, callShift: -0.06, sizeByStrength: true, noFoldTopPair: false, mdfPull: 0.1, bluffMult: 0.8, adapt: false, tilt: 0.8, base: 1600 },
    Regular: { skill: 0.82, mistake: 0.03, styleW: 0.7, loose: 0, callShift: 0, sizeByStrength: false, mdfPull: 0.2, bluffMult: 0.8, riverBluffMult: 0.6, riverBigFold: 0.02, adapt: false, tilt: 0.4, base: 2000 },
    Shark: { skill: 0.96, mistake: 0.015, styleW: 0.45, loose: 0, callShift: 0, sizeByStrength: false, mdfPull: 0.35, bluffMult: 1, adapt: true, tilt: 0.15, base: 2300 },
    Solver: { skill: 1, mistake: 0, styleW: 0.1, loose: 0, callShift: 0, sizeByStrength: false, mdfPull: 0.35, bluffMult: 1, adapt: false, tilt: 0, base: 2400 }
  };
  var TIER_NAMES = ['Beginner', 'Casual', 'Regular', 'Shark', 'Solver'];
  // width: multiplier on the chart's continuing range; raiseShare: share of continuing hands that raise (null keeps the chart);
  // limp: chance an open raise becomes a limp; post: postflop adjustments (scaled by the tier's styleW)
  var STYLES = {
    Nit: { width: 0.5, raiseShare: null, limp: 0, threeBet: 0.8, post: { valueShift: 0.05, bluffMult: 0.35, callShift: 0.06, raiseShift: 0.04, semiMult: 0.4, riverBigFold: 0.06 } },
    Rock: { width: 0.95, raiseShare: 0.5, limp: 0.35, threeBet: 0.6, post: { valueShift: 0.03, bluffMult: 0.5, callShift: 0.02, raiseShift: 0.05, semiMult: 0.5 } },
    TAG: { width: 1.0, raiseShare: 0.85, limp: 0, threeBet: 1, post: {} },
    LAG: { width: 1.75, raiseShare: 0.85, limp: 0, threeBet: 1.6, post: { valueShift: -0.03, bluffMult: 1.6, callShift: -0.02, raiseShift: -0.05, semiMult: 1.6, donkMult: 1.5 } },
    'Calling Station': { width: 3.3, raiseShare: 0.15, limp: 0.75, threeBet: 0.3, post: { valueShift: 0.04, bluffMult: 0.25, callShift: -0.16, raiseShift: 0.07, semiMult: 0.3, mdfPull: 0 } },
    Maniac: { width: 4.6, raiseShare: 0.75, limp: 0, threeBet: 2.5, post: { valueShift: -0.06, bluffMult: 2.6, callShift: -0.07, raiseShift: -0.12, semiMult: 2.6, donkMult: 3 } },
    Trappy: { width: 1.3, raiseShare: null, limp: 0.2, threeBet: 0.8, trap: 0.55, post: { valueShift: 0.02, bluffMult: 0.8, callShift: -0.02, raiseShift: -0.02 } }
  };
  var STYLE_NAMES = ['Nit', 'Rock', 'TAG', 'LAG', 'Calling Station', 'Maniac', 'Trappy'];

  // ---------------------------------------------------------------- names, colours, chat
  var FIRST = ['Odessa', 'Brannock', 'Tilly', 'Marek', 'Junie', 'Corwin', 'Pell', 'Rosamund', 'Ike', 'Saffi', 'Dorran', 'Wren', 'Hollis', 'Ottoline', 'Rafe', 'Mabry',
    'Linnet', 'Caspar', 'Effie', 'Thane', 'Bettina', 'Lowry', 'Nim', 'Aurel', 'Greer', 'Fenwick', 'Philippa', 'Jory', 'Tamsin', 'Barnaby', 'Ines', 'Quill',
    'Cosima', 'Dex', 'Hester', 'Lorcan', 'Mirela', 'Abner', 'Zinnia', 'Teodor', 'Vashti', 'Ludo', 'Clemency', 'Osric', 'Pippa', 'Ansel', 'Delphine', 'Moss'];
  var LAST = ['Quarrie', 'Holloway', 'Venn', 'Ashgrove', 'Pellam', 'Dunmore', 'Carvell', 'Bramwell', 'Okonda', 'Strand', 'Wexley', 'Larkin', 'Fairweather', 'Tolley',
    'Marchetti', 'Brisco', 'Halvorsen', 'Kettering', 'Ambrose', 'Mulvane', 'Orsini', 'Pike', 'Ruddock', 'Sallow', 'Thistle', 'Underhay', 'Vos', 'Winslade', 'Yarrow', 'Zell'];
  // f, m or either (x) for each first name; the table picks a portrait to match (see Art.FACES in ui-core.js)
  var GENDER = { Odessa: 'f', Brannock: 'm', Tilly: 'f', Marek: 'm', Junie: 'f', Corwin: 'm', Pell: 'x', Rosamund: 'f', Ike: 'm', Saffi: 'f', Dorran: 'm',
    Wren: 'x', Hollis: 'x', Ottoline: 'f', Rafe: 'm', Mabry: 'x', Linnet: 'f', Caspar: 'm', Effie: 'f', Thane: 'm', Bettina: 'f', Lowry: 'x', Nim: 'x',
    Aurel: 'm', Greer: 'x', Fenwick: 'm', Philippa: 'f', Jory: 'm', Tamsin: 'f', Barnaby: 'm', Ines: 'f', Quill: 'x', Cosima: 'f', Dex: 'm', Hester: 'f',
    Lorcan: 'm', Mirela: 'f', Abner: 'm', Zinnia: 'f', Teodor: 'm', Vashti: 'f', Ludo: 'm', Clemency: 'f', Osric: 'm', Pippa: 'f', Ansel: 'm', Delphine: 'f', Moss: 'x' };
  // players show by first name only (long names were cut off on the seat plates); the full name stays in profile.fullName
  function firstName(nm) { return String(nm || '').split(' ')[0]; }
  function genderOf(nm) { return GENDER[firstName(nm)] || 'x'; }
  var COLORS = ['#c2553d', '#3d7fc2', '#5a9e4b', '#b08a2e', '#8a5cb8', '#2e9e94', '#c2477f', '#6b7a8f', '#a8642e', '#4a6fb5', '#7f9e2e', '#b54a4a'];
  var CHAT = {
    any: ['Nice hand.', 'Shuffle up.', 'Good luck all.', 'That river.', 'Close one.', 'Fair enough.'],
    Nit: ['Too rich for me.', 'I will wait for a better spot.', 'Not this time.', 'Patience pays.'],
    Rock: ['Steady does it.', 'I only play the good ones.', 'Fold and wait.'],
    TAG: ['Standard.', 'Reasonable price.', 'On to the next.'],
    LAG: ['Let us see a flop.', 'I like my chances.', 'Pressure, pressure.'],
    'Calling Station': ['I had to see it.', 'Just curious.', 'Couldn\'t fold that.', 'I call.'],
    Maniac: ['Again!', 'Let us gamble.', 'Who wants a coin flip?', 'All in is a size too.', 'Fun table.'],
    Trappy: ['Hmm.', 'Interesting.', 'Go ahead.', 'I will think about it.'],
    tilt: ['Unbelievable.', 'Every single time.', 'Of course it was.', 'Fine. Deal.'],
    win: ['Thank you.', 'I will take it.', 'Lucky me.']
  };
  function profile(opts) {
    opts = opts || {};
    var r = C.rng(opts.seed || 1), first = FIRST[Math.floor(r() * FIRST.length)], last = LAST[Math.floor(r() * LAST.length)];
    var full = opts.name || first + ' ' + last;
    var parts = full.split(' ');
    return { id: opts.id || 'ai' + (opts.seed || 1), name: firstName(full), fullName: full, initials: (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase(),
      color: opts.color || COLORS[Math.floor(r() * COLORS.length)], tier: opts.tier || 'Regular', style: opts.style || 'TAG', seed: opts.seed || 1 };
  }

  // ---------------------------------------------------------------- preflop
  var STR = null, PCT = null; // class strength vs random and the share of combos at least as strong
  function strengths() {
    if (STR) return;
    STR = R.vsRandom(); PCT = new Float64Array(169);
    var idx = []; for (var i = 0; i < 169; i++) idx.push(i);
    idx.sort(function (a, b) { return STR[b] - STR[a]; });
    var acc = 0; idx.forEach(function (c) { acc += C.CLASS_SIZE[c] / 1326; PCT[c] = acc; });
  }
  var contCache = new Map();
  function chartWidth(sp) {
    var k = sp.label + '|' + sp.kind + '|' + sp.depth + '|' + (sp.sizeScale || 1), w = contCache.get(k);
    if (w == null) { w = C.classPercent(sp.raise) + C.classPercent(sp.call); if (sp.kind === 'bbVsLimp' || sp.kind === 'walk') w = C.classPercent(sp.raise); if (contCache.size > 500) contCache.clear(); contCache.set(k, w); }
    return w;
  }
  // raise and call shares for one class at a chart spot, after the tier and style widen or narrow the chart
  function prefCore(ag, sp, cls, mood, pos, canRaise, toCall) {
    strengths();
    var a = R.advice(sp, cls), tier = TIERS[ag.tier], st = STYLES[ag.style], sw = tier.styleW;
    var jamSpot = sp.kind === 'push' || sp.kind === 'reshove' || sp.kind === 'vsJam';
    var checkSpot = sp.kind === 'bbVsLimp' || sp.kind === 'walk';
    var raise = a.raise, call = checkSpot ? 0 : a.call, cont = raise + call;
    // width: target share of hands that continue
    var mult = Math.pow(st.width, Math.min(1, sw)) * (1 + tier.loose * (jamSpot ? 0.4 : 1)) * (1 + 0.45 * mood.tilt) * (1 - 0.25 * mood.tight);
    if (jamSpot) mult = 1 + (mult - 1) * 0.45;
    var W = chartWidth(sp), target = clamp(W * mult, 0.004, 0.95), pc = PCT[cls];
    if (mult < 1) { var keep = sig((target - pc) / 0.015); raise *= keep; call *= keep; }
    else if (mult > 1 && cont < 0.999) {
      var add = (1 - cont) * sig((target - pc) / 0.02);
      // hands added by width: raise or call depends on the spot and style
      var rs = st.raiseShare != null ? st.raiseShare : (sp.kind === 'rfi' || sp.kind === 'isolate' ? 0.9 : 0.3);
      if (checkSpot) rs = st.raiseShare != null ? st.raiseShare * 0.5 : 0.25;
      raise += add * rs; call += add * (1 - rs);
    }
    // raise/call split
    if (!jamSpot) {
      var tb = sp.kind === 'vsOpen' || sp.kind === 'squeeze' || sp.kind === 'vs3bet' || sp.kind === 'cold4bet';
      if (tb && st.threeBet !== 1) { var mv = raise * (1 - Math.min(1, st.threeBet)) * sw; if (st.threeBet > 1) mv = -Math.min(call, call * (st.threeBet - 1) * 0.25 * sw); raise -= mv; call += mv; }
      if (st.raiseShare != null && !tb && sp.kind !== 'rfi') { var tot = raise + call, rsh = raise / Math.max(1e-9, tot); rsh += (st.raiseShare - rsh) * 0.5 * sw; raise = tot * rsh; call = tot - raise; }
      var limp = (sp.kind === 'rfi' || sp.kind === 'isolate') ? st.limp * Math.min(1, sw) + (ag.tier === 'Beginner' ? 0.25 : 0) : 0;
      if (limp > 0 && pos !== 'SB' || limp > 0 && ag.tier === 'Beginner') { var lm = raise * clamp(limp, 0, 0.95) * (STR[cls] > 0.75 ? 0.4 : 1); raise -= lm; call += lm; }
    }
    raise = clamp(raise, 0, 1); call = clamp(call, 0, 1 - raise);
    if (!canRaise) { call += raise; raise = 0; }
    if (toCall === 0) { call = 1 - raise; }
    return { raise: raise, call: call, a: a };
  }
  // ---- facing a deep jam. The chart guesses the jammer's range from its own small 4-bet, and good players folded QQ and AK
  // to a 94bb jam. Regular and better players always call with QQ+ and AK when nobody else is in yet. JJ, TT, AQs and AQo
  // call by how wide the jammer plays in this bot's own notes (looser jammers get more calls).
  var JAM_FLOOR = { JJ: [0.2, 0.6, 1], TT: [0, 0, 0.45], AQs: [0, 0.3, 0.8], AQo: [0, 0, 0.45] };
  function jammerWidth(st) {
    if (!st || st.hands < 12) return 1;
    var vp = st.vpip / st.hands, pr = st.pfr / st.hands;
    return vp > 0.4 || pr > 0.3 ? 2 : vp < 0.15 ? 0 : 1;
  }
  function jamFloor(ag, h, seat, L, sp, cls) {
    if (sp.kind !== 'vsJam' || ag.tier === 'Beginner' || ag.tier === 'Casual' || !L.toCall || L.toCall < 25 * h.bb) return 0;
    var jam = null, after = false;
    h.log.forEach(function (e) {
      if (e.ev !== 'act' || e.street !== 'preflop') return;
      if (e.type === 'raise' || e.type === 'bet') { jam = e; after = false; } else if (e.type === 'call' && jam) after = true;
    });
    if (!jam || after) return 0; // someone already called the jam: keep the chart
    var n = C.CLASS_NAME[cls];
    if (n === 'AA' || n === 'KK' || n === 'QQ' || n === 'AKs' || n === 'AKo') return 1;
    var f = JAM_FLOOR[n];
    return f ? f[jammerWidth(ag.stats[h.players[jam.seat].id])] : 0;
  }
  // ---- the beginner size tell. Beginners raise about 1.6x the normal size with strong hands (99+ and AK) and about
  // 0.85x with the rest. Only public facts feed the tell: the raise size against the chart size at that spot.
  function bigOpenClass(cls) { strengths(); var n = C.CLASS_NAME[cls]; return STR[cls] > 0.7 || n === 'AKs' || n === 'AKo'; }
  function sizeKind(sp, e, bb) {
    if (!e || e.allIn || !(e.type === 'raise' || e.type === 'bet') || !sp || sp.jam || !(sp.raiseToBB > 0)) return null;
    var r = e.to / bb / sp.raiseToBB;
    return r >= 1.3 ? 'big' : r <= 0.96 ? 'small' : null;
  }
  // the first open (a raise with no raise before it) by seat before log index upto, with its size tell
  function openSize(h, seat, upto) {
    var log = h.log, n = upto == null ? log.length : upto;
    for (var i = 0; i < n; i++) {
      var e = log[i];
      if (e.ev !== 'act' || e.street !== 'preflop') continue;
      if (e.type === 'raise' || e.type === 'bet') {
        if (e.seat !== seat) return null;
        var sp = R.forHand(h, seat, i);
        return { seat: seat, to: e.to, toBB: e.to / h.bb, std: sp.raiseToBB, kind: sizeKind(sp, e, h.bb), at: i };
      }
    }
    return null;
  }
  // a deterministic narrowing of a 169-class range for a beginner's sized raise
  function sizeRange(f, kind) {
    var o = Float64Array.from(f);
    if (kind !== 'big' && kind !== 'small') return o;
    for (var i = 0; i < 169; i++) { var st = bigOpenClass(i); if (kind === 'big' && !st) o[i] *= 0.05; if (kind === 'small' && st) o[i] *= 0.15; }
    return o;
  }
  function preflopMix(ag, h, seat, L, mood) {
    var p = h.players[seat], cls = C.classOfCards(p.hole[0], p.hole[1]), sp = R.forHand(h, seat);
    var pf = prefCore(ag, sp, cls, mood, h.pos[seat], L.canRaise, L.toCall), raise = pf.raise, call = pf.call, a = pf.a;
    var fl = jamFloor(ag, h, seat, L, sp, cls); if (fl > call) { call = Math.min(fl, 1 - raise); }
    var to = sp.jam || !sp.raiseToBB ? L.maxTo : Math.round(sp.raiseToBB * h.bb);
    if (L.canRaise && ag.tier === 'Beginner' && !sp.jam) to = Math.round(to * (bigOpenClass(cls) ? 1.6 : 0.85));
    if (L.canRaise) to = clamp(to, L.minTo, L.maxTo);
    var mix = [];
    if (raise > 0.001) mix.push({ action: to >= L.maxTo ? 'allin' : 'raise', to: to, freq: raise });
    if (call > 0.001) mix.push({ action: L.toCall ? 'call' : 'check', to: 0, freq: call });
    var f = Math.max(0, 1 - raise - call); if (f > 0.001) mix.push({ action: 'fold', to: 0, freq: f });
    return { mix: mix, spot: sp, cls: cls, base: a };
  }

  // ---------------------------------------------------------------- postflop
  function postAdj(ag, mood, exploit) {
    var tier = TIERS[ag.tier], st = STYLES[ag.style], sw = tier.styleW, adj = {};
    for (var k in S.BASE) adj[k] = S.BASE[k];
    var P = st.post;
    for (k in P) {
      var v = P[k];
      if (/Mult$/.test(k)) adj[k] = adj[k] * Math.pow(v, sw); else if (k === 'mdfPull') adj[k] = v; else adj[k] = adj[k] + v * sw;
    }
    adj.callShift += tier.callShift; adj.bluffMult *= tier.bluffMult;
    if (tier.mdfPull != null && P.mdfPull == null) adj.mdfPull = tier.mdfPull;
    if (tier.riverBluffMult) adj.riverBluffMult *= tier.riverBluffMult;
    if (tier.riverBigFold) adj.riverBigFold += tier.riverBigFold;
    if (mood.tilt) { adj.bluffMult *= 1 + mood.tilt; adj.callShift -= 0.05 * mood.tilt; adj.valueShift -= 0.02 * mood.tilt; }
    if (mood.tight) { adj.callShift += 0.03 * mood.tight; adj.bluffMult *= 1 - 0.4 * mood.tight; }
    if (exploit) for (k in exploit) adj[k] = /Mult$/.test(k) ? adj[k] * exploit[k] : adj[k] + exploit[k];
    // round so the policy cache sees a small number of distinct settings
    for (k in adj) adj[k] = Math.round(adj[k] * 100) / 100;
    return adj;
  }
  // a simple rule from what the hand makes, for low tiers
  function naiveMix(ag, h, seat, L, res) {
    var f = res.feat, kind = f.hand.kind, strong = f.hand.cat >= 3 || kind === 'twopair' || kind === 'set' || kind === 'monster';
    var pair = kind === 'toppair' || kind === 'overpair', weakPair = kind === 'midpair' || kind === 'lowpair' || kind === 'underpair';
    var drawy = f.draw.outs >= 8, st = STYLES[ag.style], loose = st.width > 1.2;
    var potNow = L.pot, mix = [];
    if (L.toCall === 0) {
      var b = strong ? 0.85 : pair ? 0.55 : drawy ? 0.3 : weakPair ? 0.2 : (ag.style === 'Maniac' ? 0.45 : 0.08);
      if (ag.style === 'Trappy' && strong) b = 0.3;
      if (L.canRaise && b > 0) {
        var frac = TIERS[ag.tier].sizeByStrength ? (strong ? 1 : pair ? 0.6 : 0.33) : 0.6, to = L.committed + Math.round(potNow * frac);
        to = clamp(to, L.minTo, L.maxTo);
        mix.push({ action: to >= L.maxTo ? 'allin' : 'bet', to: to, freq: b });
      }
      mix.push({ action: 'check', to: 0, freq: 1 - (L.canRaise ? b : 0) });
      return mix;
    }
    var price = L.call / (potNow + L.call), c;
    if (strong) c = 1; else if (pair) c = TIERS[ag.tier].noFoldTopPair ? 1 : price < 0.4 ? 0.95 : 0.6;
    else if (weakPair) c = price < 0.25 ? 0.85 : price < 0.35 ? 0.55 : 0.25; else if (drawy) c = price < 0.3 ? 0.85 : 0.4;
    else c = (loose ? 0.25 : 0.08) * (price < 0.25 ? 1.5 : 1);
    var r = L.canRaise ? (strong ? 0.45 : ag.style === 'Maniac' ? 0.15 : 0.02) : 0;
    if (ag.style === 'Calling Station') r *= 0.3;
    // a raise is at least half the pot after calling postflop, so a tiny bet never gets a min-click
    if (r) { var rt = clamp(Math.round(Math.max(L.currentBet * 3, h.board.length >= 3 ? L.currentBet + 0.5 * (potNow + L.call) : 0)), L.minTo, L.maxTo); mix.push({ action: rt >= L.maxTo ? 'allin' : 'raise', to: rt, freq: Math.min(r, c) }); }
    mix.push({ action: 'call', to: 0, freq: Math.max(0, c - r) });
    mix.push({ action: 'fold', to: 0, freq: 1 - Math.max(c, r) });
    return mix;
  }
  function blend(a, wa, b, wb) {
    var m = {};
    function add(list, w) { list.forEach(function (x) { var k = x.action; if (!m[k]) m[k] = { action: k, to: x.to, freq: 0 }; m[k].freq += x.freq * w; if (x.to && (!m[k].to || x.freq * w > 0.3)) m[k].to = x.to; }); }
    add(a, wa); add(b, wb);
    var out = []; for (var k in m) if (m[k].freq > 1e-4) out.push(m[k]);
    return out;
  }

  // the postflop mix before a slip, for combo i at ctx: the baseline at this player's settings, traps, then the naive rule by skill
  function postMix(ag, ctx, i, L, feat, adj) {
    var tier = TIERS[ag.tier], st = STYLES[ag.style];
    var cm = S.comboMix(ctx, i, adj), base = cm.mix.map(function (m) { return { action: m.action, to: m.to, freq: m.freq }; });
    // trapping: slow-play strong hands, then raise
    if (st.trap && feat.eqN > 0.85 && ctx.street !== 'river') {
      var tp = st.trap * Math.min(1, tier.styleW + 0.3);
      if (L.toCall === 0) base = blend(base, 1 - tp, [{ action: 'check', to: 0, freq: 1 }], tp);
    }
    return tier.skill >= 0.999 ? base : blend(base, tier.skill, naiveMix(ag, { board: ctx.board }, ctx.spec.seat, L, { feat: feat }), 1 - tier.skill);
  }
  // the same mix with the expected slips folded in (decide() moves a slip to the least common action, or to a call)
  function withSlips(mix, m, L) {
    mix = norm(mix.filter(function (x) { return x.freq > 0; }).map(function (x) { return { action: x.action, to: x.to, freq: x.freq }; }));
    if (!m || !mix.length) return mix;
    if (mix.length > 1) {
      var alt = mix.slice().sort(function (a, b) { return a.freq - b.freq; })[0];
      mix.forEach(function (x) { x.freq = x === alt ? x.freq + m * (1 - x.freq) : x.freq * (1 - m); });
    } else if (L.toCall && mix[0].action !== 'call') { mix[0].freq = 1 - m; mix.push({ action: 'call', to: 0, freq: m }); }
    return mix;
  }

  // ---------------------------------------------------------------- a model of one player, for the review
  // traits in plain terms, from the settings the bot actually plays with
  function traits(prof) {
    var adj = postAdj(prof, { tilt: 0, tight: 0 }), tier = TIERS[prof.tier] || TIERS.Regular, st = STYLES[prof.style] || STYLES.TAG;
    var bluff = adj.bluffMult * adj.riverBluffMult * (tier.skill < 0.6 ? 0.8 : 1);
    var calls = prof.style === 'Calling Station' || adj.callShift <= -0.08 || tier.noFoldTopPair ? 'loose' : adj.callShift >= 0.05 ? 'tight' : 'normal';
    return { calls: calls, bluffs: bluff < 0.6 ? 'low' : bluff > 1.5 ? 'high' : 'normal', wide: st.width * (1 + tier.loose) };
  }
  // the review grades against this player's real play when the tier or style is easy to read
  function exploitable(prof) {
    return !!prof && (prof.tier === 'Beginner' || prof.tier === 'Casual' || prof.style === 'Calling Station' || prof.style === 'Maniac' || prof.style === 'Nit');
  }
  // a model the strategy module can call without loading this one: pre() gives the chance of a preflop action for a class,
  // post() the mix (fold, call, agg shares and the raise size) for combo i at a postflop node, with slips
  function model(prof) {
    var ag = { tier: TIERS[prof.tier] ? prof.tier : 'Regular', style: STYLES[prof.style] ? prof.style : 'TAG' }, tier = TIERS[ag.tier], mood = { tilt: 0, tight: 0 };
    var adj = postAdj(ag, mood);
    return {
      profile: prof, tier: ag.tier, style: ag.style, traits: traits(ag),
      pre: function (sp, e, pos, cls) {
        var pf = prefCore(ag, sp, cls, mood, pos, e.maxTo > 0, e.toCall), t = e.type;
        var raise = pf.raise, call = pf.call, fold = Math.max(0, 1 - raise - call), m = tier.mistake * 0.5;
        var p = t === 'fold' ? fold : t === 'raise' || t === 'bet' || (t === 'allin' && e.to > e.betBefore) ? raise : call;
        return p * (1 - m) + m / 3;
      },
      // beginners size their raises by strength: a big or small raise narrows the range on top of pre (applied after its floor)
      size: ag.tier === 'Beginner' ? function (sp, e, cls, bb) {
        var k = sizeKind(sp, e, bb); return !k ? 1 : k === 'big' ? (bigOpenClass(cls) ? 1 : 0.05) : (bigOpenClass(cls) ? 0.15 : 1);
      } : null,
      post: function (ctx, i, L, feat) {
        var mix = withSlips(postMix(ag, ctx, i, L, feat, adj), tier.mistake, L), out = { fold: 0, call: 0, agg: 0, to: 0 };
        mix.forEach(function (x) {
          if (x.action === 'fold') { if (L.toCall) out.fold += x.freq; else out.call += x.freq; }
          else if (x.action === 'check' || x.action === 'call' || !L.canRaise) out.call += x.freq;
          else { out.to = out.agg > x.freq ? out.to : x.to; out.agg += x.freq; }
        });
        return out;
      }
    };
  }

  // ---------------------------------------------------------------- reading the hero (Shark)
  function emptyStats() { return { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, cbetFaced: 0, cbetFold: 0, rivFaced: 0, rivFold: 0, aggr: 0, passive: 0, wtsd: 0, sawFlop: 0 }; }
  function observeHand(stats, h) {
    var pre = {}, preRaises = 0, firstRaiser = null, flopAggr = null;
    h.log.forEach(function (e) {
      if (e.ev !== 'act') return;
      var id = h.players[e.seat].id, s = stats[id] || (stats[id] = emptyStats());
      if (!pre[id]) pre[id] = { vpip: false, pfr: false, tbOpp: false, tb: false };
      if (e.street === 'preflop') {
        var q = pre[id];
        if (preRaises === 1 && e.seat !== firstRaiser) q.tbOpp = true;
        if (e.type === 'call' || e.type === 'raise' || e.type === 'bet') q.vpip = true;
        if (e.type === 'raise' || e.type === 'bet') { q.pfr = true; if (preRaises === 1 && e.seat !== firstRaiser) q.tb = true; preRaises++; if (firstRaiser == null) firstRaiser = e.seat; }
        return;
      }
      if (e.type === 'bet' || e.type === 'raise') s.aggr++; else if (e.type === 'call') s.passive++;
      if (e.street === 'flop' && e.toCall > 0 && flopAggr == null) {
        // first bet on the flop by the preflop raiser counts as a c-bet
        var lastPre = null; h.log.forEach(function (x) { if (x.ev === 'act' && x.street === 'preflop' && (x.type === 'raise' || x.type === 'bet')) lastPre = x.seat; });
        var firstBet = null; h.log.forEach(function (x) { if (firstBet == null && x.ev === 'act' && x.street === 'flop' && x.type === 'bet') firstBet = x.seat; });
        if (firstBet === lastPre && firstBet !== e.seat) { s.cbetFaced++; if (e.type === 'fold') s.cbetFold++; flopAggr = true; }
      }
      if (e.street === 'river' && e.toCall > 0) { s.rivFaced++; if (e.type === 'fold') s.rivFold++; }
    });
    h.order.forEach(function (seat) {
      var id = h.players[seat].id, s = stats[id] || (stats[id] = emptyStats()), q = pre[id] || {};
      s.hands++; if (q.vpip) s.vpip++; if (q.pfr) s.pfr++; if (q.tbOpp) s.tbOpp++; if (q.tb) s.tb++;
      if (h.log.some(function (e) { return e.ev === 'board' && e.street === 'flop'; }) && !foldedBefore(h, seat, 'flop')) s.sawFlop++;
      if (h.log.some(function (e) { return e.ev === 'show' && e.seat === seat; })) s.wtsd++;
    });
  }
  function foldedBefore(h, seat, street) {
    var ix = -1; h.log.forEach(function (e, i) { if (ix < 0 && e.ev === 'board' && e.street === street) ix = i; });
    if (ix < 0) return true;
    return h.log.slice(0, ix).some(function (e) { return e.ev === 'act' && e.seat === seat && e.type === 'fold'; });
  }
  function exploitFor(st) {
    if (!st || st.hands < 25) return null;
    var x = {}, any = false;
    if (st.cbetFaced >= 8) { var fc = st.cbetFold / st.cbetFaced; if (fc > 0.58) { x.cbetBluffMult = 1 + (fc - 0.5) * 3; any = true; } else if (fc < 0.3) { x.cbetBluffMult = 0.55; x.thinValue = 0.02; any = true; } }
    if (st.rivFaced >= 6) { var fr = st.rivFold / st.rivFaced; if (fr > 0.55) { x.riverBluffMult = 1 + (fr - 0.45) * 3; any = true; } else if (fr < 0.3) { x.riverBluffMult = 0.35; x.thinValue = (x.thinValue || 0) + 0.04; any = true; } }
    var vp = st.vpip / st.hands;
    if (vp > 0.4) { x.thinValue = (x.thinValue || 0) + 0.02; x.bluffMult = 0.8; any = true; }
    return any ? x : null;
  }

  // ---------------------------------------------------------------- the agent
  function pick(mix, x) { var acc = 0; for (var i = 0; i < mix.length; i++) { acc += mix[i].freq; if (x < acc) return mix[i]; } return mix[mix.length - 1]; }
  function norm(mix) { var t = 0; mix.forEach(function (m) { t += m.freq; }); mix.forEach(function (m) { m.freq /= t || 1; }); return mix; }
  function toEngine(m, L) {
    if (m.action === 'fold') return L.toCall ? { type: 'fold' } : { type: 'check' };
    if (m.action === 'check' || m.action === 'call') return L.toCall ? { type: 'call' } : { type: 'check' };
    if (!L.canRaise) return L.toCall ? { type: 'call' } : { type: 'check' };
    if (m.action === 'allin' || m.to >= L.maxTo) return { type: 'allin' };
    return { type: L.isBet ? 'bet' : 'raise', to: clamp(Math.round(m.to), L.minTo, L.maxTo) };
  }
  function create(opts) {
    var prof = opts && opts.tier && opts.name && opts.id ? opts : profile(opts);
    if (prof.name.indexOf(' ') >= 0) { var cp = {}; for (var k in prof) cp[k] = prof[k]; cp.fullName = prof.fullName || prof.name; cp.name = firstName(prof.name); prof = cp; }
    var tier = TIERS[prof.tier] || TIERS.Regular, rng = C.rng(C.hashSeed(prof.seed || 1, 991));
    var ag = { profile: prof, tier: prof.tier, style: prof.style, id: prof.id, stats: {}, mood: { tilt: 0, tight: 0 }, rng: rng, lastStack: null };
    ag.decide = function (h, seat, L) { return decide(ag, h, seat, L); };
    ag.actSync = ag.decide;
    ag.act = function (h, seat, L) { try { return Promise.resolve(decide(ag, h, seat, L)); } catch (e) { return Promise.reject(e); } };
    ag.observe = function (h) { observe(ag, h); };
    return ag;
  }
  function observe(ag, h) {
    if (TIERS[ag.tier].adapt || ag.tier === 'Regular' || ag.tier === 'Solver') observeHand(ag.stats, h); // Regular and Solver use the notes for jam calls only
    var me = null; h.order.forEach(function (s) { if (h.players[s].id === ag.id) me = h.players[s]; });
    ag.mood.tilt *= 0.86; ag.mood.tight *= 0.86;
    if (!me) return;
    var net = (me.stack - me.stackStart) / h.bb, tr = TIERS[ag.tier].tilt;
    if (net <= -40) ag.mood.tilt = Math.min(1, ag.mood.tilt + 0.6 * tr);
    else if (net >= 40) ag.mood.tight = Math.min(1, ag.mood.tight + 0.5 * tr);
    if (ag.mood.tilt < 0.02) ag.mood.tilt = 0; if (ag.mood.tight < 0.02) ag.mood.tight = 0;
    ag.lastNet = net;
  }
  function decide(ag, h, seat, L) {
    var tier = TIERS[ag.tier], r = ag.rng, mix, res = null, street = h.street, note = '';
    if (street === 'preflop') { var pm = preflopMix(ag, h, seat, L, ag.mood); mix = pm.mix; }
    else {
      var vs = S.activeSeats(S.advance(S.tracker(h))).filter(function (s) { return s !== seat; });
      var exploit = tier.adapt && vs.length === 1 ? exploitFor(ag.stats[h.players[vs[0]].id]) : null;
      var adj = postAdj(ag, ag.mood, exploit);
      res = S.evaluate(h, seat, { noEV: true });
      mix = postMix(ag, res.ctx, res.combo, L, res.feat, adj);
      if (exploit) note = 'adapting';
    }
    mix = norm(mix.filter(function (m) { return m.freq > 0; }));
    var chosen = pick(mix, r()), slip = false, planned = chosen;
    if (tier.mistake && r() < tier.mistake) { // a slip: a plausible wrong action
      var alt = mix.length > 1 ? mix.slice().sort(function (a, b) { return a.freq - b.freq; })[0] : null;
      // an alternative the plan itself takes 15% of the time or more is a mixed play, not a slip
      if (alt && alt !== chosen) { chosen = alt; slip = alt.freq < 0.15; }
      else if (L.toCall && chosen.action !== 'call') { chosen = { action: 'call', to: 0, freq: 0 }; slip = true; }
    }
    var act = toEngine(chosen, L), maxF = mix.reduce(function (m, x) { return Math.max(m, x.freq); }, 0);
    act.thinkMs = thinkMs(ag, h, L, act, res, maxF, r);
    act.chat = chatLine(ag, act, r);
    act.reason = reasonFor(ag, h, seat, L, act, res, street, slip);
    act.ai = { tier: ag.tier, style: ag.style, mixFreq: Math.round((chosen.freq || 0) * 1000) / 1000, slip: slip, note: note };
    var notes = h.botNotes || (h.botNotes = []);
    // slip and planned (the action the bot meant to take) let the recap say which way the mistake went
    notes.push({ n: h.log.length, seat: seat, id: ag.id, tier: ag.tier, street: street, type: act.type, reason: act.reason, vague: vagueReason(act, res, street, L, slip),
      slip: slip, planned: slip ? toEngine(planned, L).type : null,
      // where the hand sat in the bot's own range (0 weakest, 1 best) and its equity: the recap checks a slip against them
      pct: res && res.feat ? Math.round(res.feat.pct * 1000) / 1000 : null, eq: res && res.feat ? Math.round(res.feat.eq * 1000) / 1000 : null });
    return act;
  }

  // ---------------------------------------------------------------- timing, chat, reasons
  function thinkMs(ag, h, L, act, res, maxF, r) {
    var tier = TIERS[ag.tier], base = tier.base, street = h.street, big = L.toCall > 0 && L.toCall > 0.5 * (L.pot - L.toCall);
    var hard = 1 - maxF; // close decisions take longer
    var spot = (street === 'preflop' ? 0.5 : street === 'flop' ? 0.8 : street === 'turn' ? 1 : 1.3) * (big ? 1.4 : 1) * (act.type === 'allin' || L.toCall >= L.stack ? 1.3 : 1);
    var ms;
    if (tier.adapt || ag.tier === 'Solver') ms = base * spot * (0.7 + 0.6 * r()) * (1 + 0.5 * hard); // balanced: depends on the spot only
    else {
      var strong = res && res.feat ? res.feat.eqN > 0.8 : false;
      ms = base * spot * (0.5 + 0.6 * r()) * (1 + hard);
      if (act.type === 'fold') ms *= ag.tier === 'Beginner' ? 0.35 : 0.5;      // snap folds
      if (act.type === 'check' && !strong) ms *= 0.6;
      if (strong && (act.type === 'bet' || act.type === 'raise' || act.type === 'allin')) ms *= ag.tier === 'Beginner' ? 2.2 : 1.8; // long tank, then bet: often strong
      if (strong && act.type === 'call') ms *= 0.6;
    }
    return Math.round(clamp(ms, 350, 9000));
  }
  function chatLine(ag, act, r) {
    if (r() > 0.018) return null;
    var pool = ag.mood.tilt > 0.3 ? CHAT.tilt : r() < 0.6 ? CHAT[ag.style] || CHAT.any : CHAT.any;
    return pool[Math.floor(r() * pool.length)];
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  // the same reason without the cards, for hands the bot never showed
  function vagueReason(act, res, street, L, slip) {
    var t = act.type, verb = { fold: 'Folded', check: 'Checked', call: 'Called', bet: 'Bet', raise: 'Raised', allin: 'Moved all in' }[t] || 'Acted';
    if (slip) return verb + ' with a hand outside the usual plan.';
    if (street === 'preflop') return t === 'fold' ? 'Folded a hand outside the range for this spot.' : verb + ' with a hand from the range for this spot.';
    var f = res.feat, cls = f.eq > 0.7 ? 'a strong hand' : f.draw.outs >= 8 && f.eq < 0.5 ? 'a draw' : f.eq > 0.45 ? 'a medium hand' : 'a weak hand';
    if (t === 'fold') return 'Folded ' + cls + '. The price was too high for it.';
    if (t === 'check') return 'Checked with ' + cls + '.';
    if (t === 'call') return 'Called with ' + cls + ' at a price of ' + pct(L.toCall ? L.call / (L.pot + L.call) : 0) + '.';
    return verb + ' with ' + cls + (f.eq < 0.35 && f.draw.outs < 8 ? ' as a bluff.' : '.');
  }
  // a hand label for a bot's note: "no pair of its own" would read as the player's "its"
  function botHand(label) { return String(label).replace('no pair of its own', 'only the board pair'); }
  function reasonFor(ag, h, seat, L, act, res, street, slip) {
    var t = act.type;
    if (street === 'preflop') {
      var cls = C.CLASS_NAME[C.classOfCards(h.players[seat].hole[0], h.players[seat].hole[1])];
      if (slip) return 'Played ' + cls + ' outside the usual plan.';
      if (t === 'fold') return 'Folded ' + cls + '. It was outside the range for this spot.';
      if (t === 'check') return 'Checked ' + cls + ' in the big blind.';
      if (t === 'call') return L.toCall >= L.stack ? 'Called all in with ' + cls + '.' : 'Called with ' + cls + '.';
      if (t === 'allin') return 'Moved all in with ' + cls + '.';
      return 'Raised with ' + cls + '.';
    }
    var f = res.feat, hand = botHand(f.hand.label), need = L.toCall ? L.call / (L.pot + L.call) : 0;
    // a slip names the action and the hand; the recap says which way it went
    if (slip) return { fold: 'Folded', check: 'Checked', call: 'Called with', bet: 'Bet with', raise: 'Raised with', allin: 'Moved all in with' }[t] + ' ' + hand + '.';
    if (t === 'fold') return 'Folded ' + hand + '. The price was ' + pct(need) + ' and the hand had about ' + pct(f.eq) + '.';
    if (t === 'call') return f.draw.outs >= 8 && f.eq < 0.5 ? 'Called with a ' + f.draw.label + ' (' + f.draw.outs + ' outs).' : 'Called with ' + hand + '. The price was ' + pct(need) + ' and the hand had about ' + pct(f.eq) + '.';
    if (t === 'check') return f.eq > 0.75 ? 'Checked ' + hand + ' to keep weaker hands in.' : 'Checked ' + hand + '.';
    var verb = t === 'allin' ? 'Moved all in' : t === 'raise' ? 'Raised' : 'Bet';
    if (f.eq > 0.7) return verb + ' for value with ' + hand + '.';
    if (f.draw.outs >= 8) return verb + ' as a semi-bluff with a ' + f.draw.label + '.';
    if (f.eq < 0.35) return verb + ' as a bluff with ' + hand + '.';
    return verb + ' with ' + hand + ' for thin value and protection.';
  }

  // ---------------------------------------------------------------- fields
  var CASH = [
    { id: 'kitchen', name: 'Kitchen Table', sb: 0.25, bb: 0.5, mix: { Beginner: 0.55, Casual: 0.4, Regular: 0.05 } },
    { id: 'corner', name: 'Corner Bar', sb: 1, bb: 2, mix: { Beginner: 0.15, Casual: 0.65, Regular: 0.2 } },
    { id: 'cardroom', name: 'Card Room', sb: 2, bb: 5, mix: { Casual: 0.3, Regular: 0.7 } },
    { id: 'high', name: 'High Room', sb: 10, bb: 20, mix: { Regular: 0.55, Shark: 0.45 } },
    { id: 'back', name: 'Back Room', sb: 25, bb: 50, mix: { Shark: 0.8, Solver: 0 }, solvers: 1 }
  ];
  var TOURNEY = { 10: { Beginner: 0.5, Casual: 0.45, Regular: 0.05 }, 50: { Beginner: 0.15, Casual: 0.55, Regular: 0.3 }, 200: { Casual: 0.3, Regular: 0.55, Shark: 0.15 },
    1000: { Regular: 0.4, Shark: 0.5, Solver: 0.1 } };
  var STYLE_BY_TIER = {
    Beginner: { 'Calling Station': 0.35, Maniac: 0.15, Rock: 0.15, LAG: 0.1, Nit: 0.1, Trappy: 0.1, TAG: 0.05 },
    Casual: { 'Calling Station': 0.2, LAG: 0.2, Maniac: 0.1, Rock: 0.15, Nit: 0.1, Trappy: 0.1, TAG: 0.15 },
    Regular: { TAG: 0.45, Nit: 0.15, Rock: 0.1, LAG: 0.2, Trappy: 0.1 },
    Shark: { TAG: 0.5, LAG: 0.35, Trappy: 0.15 },
    Solver: { TAG: 1 }
  };
  // names already in use: no first name may repeat within a field or at a table
  function takenNames(list) {
    var t = {};
    (list || []).forEach(function (x) { var nm = typeof x === 'string' ? x : x && x.name; if (nm) claimName(nm, t); });
    return t;
  }
  function claimName(nm, t) { t['f:' + firstName(nm)] = 1; }
  function nameClash(nm, t) { return !!t['f:' + firstName(nm)]; }
  // profile(opts) with a name that shares no part with `taken` (from takenNames); claims the name
  function uniqueProfile(opts, taken) {
    var o = {}, k, seed = opts.seed || 1, p, tries = 0;
    for (k in opts) o[k] = opts[k];
    do { o.seed = seed++; p = profile(o); } while (nameClash(p.name, taken) && ++tries < 2000);
    p.seed = opts.seed || p.seed;
    claimName(p.name, taken);
    return p;
  }
  function draw(weights, r) { var t = 0, k; for (k in weights) t += weights[k]; var x = r() * t; for (k in weights) { x -= weights[k]; if (x <= 0) return k; } return k; }
  // field({kind:'cash', stake:'kitchen'|..., seats:5, seed}) or field({kind:'tourney', buyIn:10|50|200|1000, seats:5|11, seed}) -> [profile]
  function field(opts) {
    opts = opts || {};
    var r = C.rng(opts.seed || 7), n = opts.seats || 5, mix, solvers = 0, used = takenNames(opts.avoid);
    if (opts.kind === 'tourney') mix = TOURNEY[opts.buyIn] || TOURNEY[10];
    else { var st = CASH.filter(function (c) { return c.id === opts.stake || c.name === opts.stake; })[0] || CASH[0]; mix = st.mix; solvers = st.solvers || 0; }
    var out = [];
    for (var i = 0; i < n; i++) {
      var tier = i < solvers ? 'Solver' : draw(mix, r), style = draw(STYLE_BY_TIER[tier], r), seed = Math.floor(r() * 1e9), p;
      p = uniqueProfile({ seed: seed, tier: tier, style: style, id: 'ai' + seed }, used);
      out.push(p);
    }
    // shuffle so the Solver is not always the first seat
    C.shuffle(out, r);
    return out;
  }

  return { TIERS: TIERS, STYLES: STYLES, TIER_NAMES: TIER_NAMES, STYLE_NAMES: STYLE_NAMES, CASH_STAKES: CASH, TOURNEY_FIELDS: TOURNEY,
    profile: profile, firstName: firstName, genderOf: genderOf, GENDER: GENDER, uniqueProfile: uniqueProfile, takenNames: takenNames, create: create, field: field, exploitFor: exploitFor, jamFloor: jamFloor, jammerWidth: jammerWidth, bigOpenClass: bigOpenClass, sizeKind: sizeKind, openSize: openSize, sizeRange: sizeRange, observeHand: observeHand, emptyStats: emptyStats, postAdj: postAdj,
    model: model, traits: traits, exploitable: exploitable, STYLE_BY_TIER: STYLE_BY_TIER };
});
