/* Vellum & Vermilion — puzzle model, rules and solver.
   Runs in Node (module.exports) and the browser (window.Puzzle).

   Directions: N=0, E=1, S=2, W=3. Bit (1<<d) in a connection mask.
   Tile kinds (one char per cell in level.kinds):
     ' ' outside the mask (bare vellum, not a tile)
     '.' empty cell inside the mask (plain vellum, no ribbon)
     'e' end      — one ribbon from the N edge to a terminal (knot / beast head / tail)
     's' straight — N to S
     'b' bend     — N to E (quarter arc)
     'x' cross    — N–S and E–W; never turns
     't' twinbend — N–E and S–W (two states)
   Rotation r (0..3) turns the tile r quarter-turns clockwise. A piece endpoint -1 is a terminal. */
(function (root, factory) {
  var P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  if (typeof window !== 'undefined') window.Puzzle = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var DIRS = 'NESW';
  var KINDS = {
    e: { pieces: [[0, -1]], period: 4 },
    s: { pieces: [[0, 2]], period: 2 },
    b: { pieces: [[0, 1]], period: 4 },
    x: { pieces: [[0, 2], [1, 3]], period: 1 },
    t: { pieces: [[0, 1], [2, 3]], period: 2 }
  };
  var PIGMENTS = ['lapis', 'vermilion', 'verdigris', 'orpiment'];

  function rotDir(d, r) { return d < 0 ? d : (d + r) & 3; }
  function opp(d) { return (d + 2) & 3; }
  function isTile(k) { return k === 'e' || k === 's' || k === 'b' || k === 'x' || k === 't'; }
  function turnable(k) { return k === 'e' || k === 's' || k === 'b' || k === 't'; }
  function period(k) { return KINDS[k] ? KINDS[k].period : 1; }
  function singleRibbon(k) { return k === 'e' || k === 's' || k === 'b'; }

  // MASK[k][r], PIECES[k][r] precomputed
  var MASK = {}, PIECES = {};
  Object.keys(KINDS).forEach(function (k) {
    MASK[k] = []; PIECES[k] = [];
    for (var r = 0; r < 4; r++) {
      var m = 0, ps = [];
      KINDS[k].pieces.forEach(function (p) {
        var a = rotDir(p[0], r), b = rotDir(p[1], r);
        if (a >= 0) m |= 1 << a;
        if (b >= 0) m |= 1 << b;
        ps.push([a, b]);
      });
      MASK[k][r] = m; PIECES[k][r] = ps;
    }
  });
  function maskOf(k, r) { return MASK[k] ? MASK[k][r & 3] : 0; }
  function piecesOf(k, r) { return PIECES[k] ? PIECES[k][r & 3] : []; }
  function sameState(k, a, b) { var p = period(k); return ((a - b) % p + p) % p === 0; }

  /* Compile a level object into a model with arrays. */
  function prepare(level) {
    var w = level.w, h = level.h, n = w * h;
    var M = {
      level: level, w: w, h: h, n: n,
      kinds: level.kinds.split(''),
      sol: digits(level.sol), start: digits(level.start || level.sol),
      mark: new Array(n).fill(null), beast: new Array(n).fill(null),
      groups: (level.groups || []).map(function (g) { return g.slice(); }),
      groupOf: new Array(n).fill(-1)
    };
    (level.marks || []).forEach(function (m) { M.mark[m[0]] = m[1]; });
    (level.beasts || []).forEach(function (b) { M.beast[b[0]] = b[1]; });
    M.groups.forEach(function (g, gi) { g.forEach(function (c) { M.groupOf[c] = gi; }); });
    M.turnables = [];
    for (var c = 0; c < n; c++) if (turnable(M.kinds[c])) M.turnables.push(c);
    if (level.book === 2) prepare2(M, level);
    return M;
  }
  /* Book II: level.kinds and level.sol are the solution; the loose leaves start elsewhere (startPos), so
     M.kinds is the starting arrangement (the board swaps it in place) and M.solKinds the finished page.
     M.start and M.startWeave are indexed by the cell a tile starts on. Over/under: ws[c] = 0 puts the
     N–S ribbon of the crossing on top, 1 the E–W one (for a crossing at rotation 0, as all are). */
  function prepare2(M, level) {
    var n = M.n, c;
    M.b2 = true;
    M.solKinds = M.kinds.slice();
    M.loose = (level.loose || []).slice();
    M.isLoose = new Uint8Array(n);
    M.loose.forEach(function (q) { M.isLoose[q] = 1; });
    M.inked = new Uint8Array(n);
    (level.inked || []).forEach(function (q) { M.inked[q] = 1; });
    M.solWeave = weaveDigits(level.weave, n);
    var sk = M.solKinds.slice(), sw = new Int8Array(n).fill(-1);
    for (c = 0; c < n; c++) if (!M.isLoose[c]) sw[c] = M.solWeave[c];
    M.loose.forEach(function (q, i) { var to = level.startPos ? level.startPos[i] : q; sk[to] = M.solKinds[q]; sw[to] = M.solWeave[q]; });
    M.startKinds = sk;
    M.kinds = sk.slice();
    M.startWeave = level.wstart ? weaveDigits(level.wstart, n) : sw;
    M.turnables = [];
    for (c = 0; c < n; c++) if (turnable(M.kinds[c])) M.turnables.push(c);
  }
  function weaveDigits(s, n) {
    var out = new Int8Array(n).fill(-1);
    for (var c = 0; s && c < n; c++) if (s[c] === '0' || s[c] === '1') out[c] = +s[c];
    return out;
  }
  function digits(s) { return s.split('').map(function (ch) { return ch === ' ' || ch === '.' ? 0 : +ch; }); }

  function neighbor(M, c, d) {
    var x = c % M.w + DX[d], y = (c / M.w | 0) + DY[d];
    if (x < 0 || y < 0 || x >= M.w || y >= M.h) return -1;
    return y * M.w + x;
  }

  /* Trace every strand for rotations `rots`.
     Returns { strands:[...], pieceStrand: {"c:p": strandIndex}, solved, matched:Uint8Array(n*4) }
     strand = { pieces:[{c,p,from}], loop, ends:[endA,endB], complete, pigments:[...],
                beastOk, pigmentOk, whole, color, key } where `from` is the endpoint index (0/1)
     the traversal enters the piece by, and endX = {type:'term'|'loose'|'loop', c}. */
  function trace(M, rots) {
    var n = M.n, kinds = M.kinds;
    var endp = new Int8Array(n * 4).fill(-1);       // which piece of cell c uses edge d
    var pcs = new Array(n);
    for (var c = 0; c < n; c++) {
      var k = kinds[c];
      if (!isTile(k)) { pcs[c] = []; continue; }
      var ps = piecesOf(k, rots[c]);
      pcs[c] = ps;
      for (var i = 0; i < ps.length; i++) {
        if (ps[i][0] >= 0) endp[c * 4 + ps[i][0]] = i;
        if (ps[i][1] >= 0) endp[c * 4 + ps[i][1]] = i;
      }
    }
    var matched = new Uint8Array(n * 4);
    for (c = 0; c < n; c++) for (var d = 0; d < 4; d++) {
      if (endp[c * 4 + d] < 0) continue;
      var nc = neighbor(M, c, d);
      if (nc >= 0 && endp[nc * 4 + opp(d)] >= 0) matched[c * 4 + d] = 1;
    }
    var seen = {};
    var strands = [], pieceStrand = {};
    function step(c, p, exitIdx, startC, startP, out) {
      for (var guard = 0; guard < 4 * n + 4; guard++) {
        var dd = pcs[c][p][exitIdx];
        if (dd < 0) return { type: 'term', c: c };
        if (!matched[c * 4 + dd]) return { type: 'loose', c: c, d: dd };
        var nc = neighbor(M, c, dd), od = opp(dd), np = endp[nc * 4 + od];
        if (nc === startC && np === startP) return { type: 'loop', c: c };
        var enter = pcs[nc][np][0] === od ? 0 : 1;
        out.push({ c: nc, p: np, from: enter });
        c = nc; p = np; exitIdx = 1 - enter;
      }
      return { type: 'loose', c: c };
    }
    for (c = 0; c < n; c++) for (var p = 0; p < pcs[c].length; p++) {
      if (seen[c + ':' + p]) continue;
      var fwd = [], back = [];
      var endB = step(c, p, 1, c, p, fwd), endA, list;
      if (endB.type === 'loop') {
        endA = endB; list = [{ c: c, p: p, from: 0 }].concat(fwd);
      } else {
        endA = step(c, p, 0, c, p, back);
        list = back.reverse().map(function (q) { return { c: q.c, p: q.p, from: 1 - q.from }; });
        list.push({ c: c, p: p, from: 0 });
        list = list.concat(fwd);
      }
      var si = strands.length, pig = {}, pigs = [];
      list.forEach(function (q) {
        seen[q.c + ':' + q.p] = 1; pieceStrand[q.c + ':' + q.p] = si;
        var m = M.mark[q.c];
        if (m && !pig[m]) { pig[m] = 1; pigs.push(m); }
      });
      var loop = endB.type === 'loop';
      var complete = loop || (endA.type === 'term' && endB.type === 'term');
      var beastOk = true;
      if (!loop && complete) {
        var ba = M.beast[endA.c], bb = M.beast[endB.c];
        if (ba || bb) beastOk = !!(ba && bb && ba !== bb);
      }
      var pigmentOk = pigs.length <= 1;
      var key = list.map(function (q) { return q.c + ':' + q.p; }).sort().join(',');
      strands.push({
        pieces: list, loop: loop, ends: [endA, endB], complete: complete,
        pigments: pigs, pigmentOk: pigmentOk, beastOk: beastOk,
        whole: complete && pigmentOk && beastOk,
        color: pigs.length === 1 ? pigs[0] : 'gold', key: key
      });
    }
    var solved = strands.length > 0 && strands.every(function (s) { return s.whole; });
    return { strands: strands, pieceStrand: pieceStrand, matched: matched, solved: solved };
  }

  function isSolved(M, rots) { return trace(M, rots).solved; }

  /* Count solutions up to `limit`. Twin groups turn together from M.start; free tiles are
     independent. Crosses are fixed. Returns {count, solutions, nodes}. */
  function solve(M, limit, maxNodes) {
    limit = limit || 2; maxNodes = maxNodes || 5e6;
    var n = M.n, kinds = M.kinds;
    var rot = new Int8Array(n), known = new Uint8Array(n);
    for (var c = 0; c < n; c++) if (!turnable(kinds[c])) known[c] = 1;   // fixed (cross/empty/outside)
    var vars = [], done = {};
    for (c = 0; c < n; c++) {
      if (!turnable(kinds[c])) continue;
      var g = M.groupOf[c];
      if (g >= 0) {
        if (done['g' + g]) continue;
        done['g' + g] = 1;
        var L = 1;
        M.groups[g].forEach(function (m) { L = lcm(L, period(kinds[m])); });
        vars.push({ cells: M.groups[g], states: L, group: true });
      } else vars.push({ cells: [c], states: period(kinds[c]), group: false });
    }
    var nodes = 0, count = 0, sols = [], aborted = false;
    function ok(c) {
      var m = maskOf(kinds[c], rot[c]);
      for (var d = 0; d < 4; d++) {
        var nc = neighbor(M, c, d), nb;
        if (nc < 0 || !isTile(kinds[nc])) nb = 0;
        else if (known[nc]) nb = (maskOf(kinds[nc], rot[nc]) >> opp(d)) & 1;
        else continue;
        if (((m >> d) & 1) !== nb) return false;
      }
      return true;
    }
    function dfs(i) {
      if (aborted) return true;
      if (i === vars.length) {
        if (trace(M, rot).solved) { count++; sols.push(Array.from(rot)); }
        return count >= limit;
      }
      var v = vars[i];
      for (var s = 0; s < v.states; s++) {
        if (++nodes > maxNodes) { aborted = true; return true; }
        var j, good = true;
        for (j = 0; j < v.cells.length; j++) {
          var cc = v.cells[j];
          rot[cc] = v.group ? (M.start[cc] + s) & 3 : s;
          known[cc] = 1;
        }
        for (j = 0; j < v.cells.length && good; j++) good = ok(v.cells[j]);
        if (good && dfs(i + 1)) { unset(v); return true; }
        unset(v);
      }
      return false;
    }
    function unset(v) { v.cells.forEach(function (cc) { known[cc] = 0; }); }
    dfs(0);
    return { count: count, solutions: sols, nodes: nodes, aborted: aborted };
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }

  /* Is cell c in its solution state? */
  function cellRight(M, rots, c) { return !turnable(M.kinds[c]) || sameState(M.kinds[c], rots[c], M.sol[c]); }
  function wrongCells(M, rots) { return M.turnables.filter(function (c) { return !cellRight(M, rots, c); }); }

  /* Over/under for cross tiles: weave[c] = 0 → the N–S ribbon passes over, 1 → E–W over.
     Alternates along strands of the solution as far as possible (parity 2-colouring),
     checkerboard parity for anything left unconstrained. */
  function weave(M) {
    var tr = trace(M, M.sol), n = M.n;
    var adj = {}, out = new Int8Array(n).fill(-1);
    function link(a, b, par) { (adj[a] = adj[a] || []).push([b, par]); (adj[b] = adj[b] || []).push([a, par]); }
    tr.strands.forEach(function (s) {
      var visits = s.pieces.filter(function (q) { return M.kinds[q.c] === 'x'; });
      var lim = s.loop ? visits.length : visits.length - 1;
      if (s.loop && visits.length < 2) lim = 0;
      for (var i = 0; i < lim; i++) {
        var a = visits[i], b = visits[(i + 1) % visits.length];
        // over(a) = weave[a] XOR (a.p===1 ? ... ) ; piece 0 is N–S: over when weave=0
        // overA != overB  →  weave[a]^pa ^ weave[b]^pb = 1
        link(a.c, b.c, 1 ^ a.p ^ b.p);
      }
    });
    for (var c = 0; c < n; c++) {
      if (M.kinds[c] !== 'x' || out[c] >= 0) continue;
      out[c] = ((c % M.w) + (c / M.w | 0)) & 1;
      var queue = [c];
      while (queue.length) {
        var u = queue.shift();
        (adj[u] || []).forEach(function (e) {
          var want = out[u] ^ e[1];
          if (out[e[0]] < 0) { out[e[0]] = want; queue.push(e[0]); }
        });
      }
    }
    return out;
  }

  /* ---------- Book II: over and under, loose leaves ---------- */
  // the model as it is when finished (Book I: the model itself)
  function solModel(M) {
    if (!M.b2) return M;
    var S = Object.create(M); S.kinds = M.solKinds; return S;
  }
  function withKinds(M, kinds) { var S = Object.create(M); S.kinds = kinds; return S; }
  // does piece p of the crossing at c lie on top? (h = 1 when the piece runs E–W)
  function over(M, rots, ws, c, p) { return ((p + (rots[c] | 0) + ws[c]) & 1) === 0; }
  function xVisits(M, s) { return s.pieces.filter(function (q) { return M.kinds[q.c] === 'x'; }); }
  // consecutive crossing visits along a strand (round the loop when it closes); a strand that crosses
  // itself visits the same cell twice, once on each piece
  function visitPairs(M, s) {
    var v = xVisits(M, s), out = [], lim = s.loop ? (v.length >= 2 ? v.length : 0) : v.length - 1;
    for (var i = 0; i < lim; i++) out.push([v[i], v[(i + 1) % v.length]]);
    return out;
  }
  /* Where each strand's weave breaks: for strand i, out[i] = the crossing cells (deduped, in strand
     order) of every consecutive pair of visits that are both over or both under. */
  function weaveBreaks(M, tr, rots, ws) {
    return tr.strands.map(function (s) {
      var cells = [], seen = {};
      visitPairs(M, s).forEach(function (pr) {
        var a = pr[0], b = pr[1];
        if (over(M, rots, ws, a.c, a.p) !== over(M, rots, ws, b.c, b.p)) return;
        [a.c, b.c].forEach(function (c) { if (!seen[c]) { seen[c] = 1; cells.push(c); } });
      });
      return cells;
    });
  }
  /* The same breaks as stretches of ribbon, for the board's correction marks: for strand i, out[i] = [a, b]
     index pairs into its pieces (two crossing visits that are both over or both under, with the joined,
     unbroken stretch running forward from a to b, round the loop when b < a). A strand's pieces are always
     one connected run, so this checks an open strand's stretches as soon as they join, before it closes. */
  function weaveBreakSpans(M, tr, rots, ws) {
    return tr.strands.map(function (s) {
      var out = [];
      visitPairs(M, s).forEach(function (pr) {
        var a = pr[0], b = pr[1];
        if (over(M, rots, ws, a.c, a.p) === over(M, rots, ws, b.c, b.p)) out.push([s.pieces.indexOf(a), s.pieces.indexOf(b)]);
      });
      return out;
    });
  }
  /* The weave a finished arrangement allows: crossings linked along strands into components; each
     component alternates one way or the other, or not at all; an inked crossing fixes its component.
     Returns { ways (0, 1, 2, 4… capped at cap), ws (one alternating weave, inked values honoured),
     comps: [[cells]], consistent }. */
  function weaveSolve(M, tr, rots, cap) {
    var n = M.n, adj = {}, out = new Int8Array(n).fill(-1), comps = [], ways = 1, consistent = true;
    function link(a, b, par) { (adj[a] = adj[a] || []).push([b, par]); (adj[b] = adj[b] || []).push([a, par]); }
    tr.strands.forEach(function (s) {
      visitPairs(M, s).forEach(function (pr) {
        var a = pr[0], b = pr[1];
        var ha = (a.p + (rots[a.c] | 0)) & 1, hb = (b.p + (rots[b.c] | 0)) & 1;
        link(a.c, b.c, 1 ^ ha ^ hb);   // over(a) != over(b)  ⇔  ws[a] ^ ws[b] = 1 ^ ha ^ hb
      });
    });
    for (var c = 0; c < n; c++) {
      if (M.kinds[c] !== 'x' || out[c] >= 0) continue;
      out[c] = 0;
      var comp = [c], queue = [c], ok = true;
      while (queue.length) {
        var u = queue.shift();
        (adj[u] || []).forEach(function (e) {
          var want = out[u] ^ e[1];
          if (out[e[0]] < 0) { out[e[0]] = want; queue.push(e[0]); comp.push(e[0]); }
          else if (out[e[0]] !== want) ok = false;
        });
      }
      comps.push(comp);
      if (!ok) { consistent = false; ways = 0; continue; }
      var ink = M.inked ? comp.filter(function (q) { return M.inked[q] && !(M.isLoose && M.isLoose[q]); }) : [];
      if (!ink.length) { ways = Math.min(cap || 1e9, ways * 2); continue; }
      var flip = out[ink[0]] ^ M.solWeave[ink[0]];
      comp.forEach(function (q) { out[q] ^= flip; });
      if (ink.some(function (q) { return out[q] !== M.solWeave[q]; })) ways = 0;
    }
    return { ways: ways, ws: out, comps: comps, consistent: consistent };
  }
  /* Book II's solved: Book I's rule, every leaf where it belongs (identical leaves interchangeable),
     and every strand alternating. */
  function solved2(M, rots, ws, tr) {
    tr = tr || trace(M, rots);
    if (!tr.solved) return false;
    for (var i = 0; i < M.loose.length; i++) if (M.kinds[M.loose[i]] !== M.solKinds[M.loose[i]]) return false;
    return weaveBreaks(M, tr, rots, ws).every(function (b) { return !b.length; });
  }
  /* Is cell c as in the solution? A leaf: the right kind, turned right; a crossing that can be set: set right. */
  function cellRight2(M, rots, ws, c) {
    var k = M.kinds[c];
    if (!isTile(k)) return true;
    if (M.isLoose[c] && k !== M.solKinds[c]) return false;
    if (turnable(k) && !sameState(k, rots[c], M.sol[c])) return false;
    if (k === 'x' && !M.inked[c] && ws[c] !== M.solWeave[c]) return false;
    return true;
  }
  function wrong2(M, rots, ws) {
    var out = [];
    for (var c = 0; c < M.n; c++) if (isTile(M.kinds[c]) && !(M.inked[c] && !M.isLoose[c]) &&
      (turnable(M.kinds[c]) || M.kinds[c] === 'x' || M.isLoose[c]) && !cellRight2(M, rots, ws, c)) out.push(c);
    return out;
  }
  /* Count Book II solutions up to `limit`: rotations as in solve(), the loose leaves in any arrangement
     of their multiset (identical leaves count once), and every weave the inked crossings allow.
     Returns {count, solutions:[{kinds, rots, ws}], nodes, aborted}. */
  function solve2(M, limit, maxNodes) {
    limit = limit || 2; maxNodes = maxNodes || 5e6;
    var n = M.n, kk = M.solKinds.slice(), cnt = {}, kindList = [];
    M.loose.forEach(function (c) {
      var k = M.solKinds[c];
      if (!cnt[k]) { cnt[k] = 0; kindList.push(k); }
      cnt[k]++; kk[c] = '?';
    });
    kindList.sort();
    var MM = withKinds(M, kk);
    var rot = new Int8Array(n), known = new Uint8Array(n);
    for (var c = 0; c < n; c++) if (kk[c] !== '?' && !turnable(kk[c])) known[c] = 1;
    var vars = [], done = {};
    for (c = 0; c < n; c++) {
      if (kk[c] === '?') { vars.push({ cells: [c], loose: true }); continue; }
      if (!turnable(kk[c])) continue;
      var g = M.groupOf[c];
      if (g >= 0) {
        if (done['g' + g]) continue;
        done['g' + g] = 1;
        var L = 1;
        M.groups[g].forEach(function (m) { L = lcm(L, period(kk[m])); });
        vars.push({ cells: M.groups[g], states: L, group: true });
      } else vars.push({ cells: [c], states: period(kk[c]), group: false });
    }
    var nodes = 0, count = 0, sols = [], aborted = false;
    function ok(c) {
      var m = maskOf(kk[c], rot[c]);
      for (var d = 0; d < 4; d++) {
        var nc = neighbor(M, c, d), nb;
        if (nc < 0 || (kk[nc] !== '?' && !isTile(kk[nc]))) nb = 0;
        else if (known[nc]) nb = (maskOf(kk[nc], rot[nc]) >> opp(d)) & 1;
        else continue;
        if (((m >> d) & 1) !== nb) return false;
      }
      return true;
    }
    function leaf() {
      var tr = trace(MM, rot);
      if (!tr.solved) return false;
      var wv = weaveSolve(MM, tr, rot, limit);
      if (!wv.ways) return false;
      count += wv.ways;
      sols.push({ kinds: kk.slice(), rots: Array.from(rot), ws: Array.from(wv.ws), ways: wv.ways });
      return count >= limit;
    }
    function dfs(i) {
      if (aborted) return true;
      if (i === vars.length) return leaf();
      var v = vars[i], j, s, cc;
      if (v.loose) {
        cc = v.cells[0];
        for (var ki = 0; ki < kindList.length; ki++) {
          var k = kindList[ki];
          if (!cnt[k]) continue;
          cnt[k]--; kk[cc] = k;
          for (s = 0; s < period(k); s++) {
            if (++nodes > maxNodes) { aborted = true; break; }
            rot[cc] = s; known[cc] = 1;
            if (ok(cc) && dfs(i + 1)) { known[cc] = 0; kk[cc] = '?'; cnt[k]++; return true; }
            known[cc] = 0;
          }
          kk[cc] = '?'; cnt[k]++;
          if (aborted) return true;
        }
        return false;
      }
      for (s = 0; s < v.states; s++) {
        if (++nodes > maxNodes) { aborted = true; return true; }
        var good = true;
        for (j = 0; j < v.cells.length; j++) {
          cc = v.cells[j];
          rot[cc] = v.group ? (M.start[cc] + s) & 3 : s;
          known[cc] = 1;
        }
        for (j = 0; j < v.cells.length && good; j++) good = ok(v.cells[j]);
        if (good && dfs(i + 1)) { unset(v); return true; }
        unset(v);
      }
      return false;
    }
    function unset(v) { v.cells.forEach(function (cc) { known[cc] = 0; }); }
    dfs(0);
    return { count: count, solutions: sols, nodes: nodes, aborted: aborted };
  }

  return {
    DX: DX, DY: DY, DIRS: DIRS, KINDS: KINDS, PIGMENTS: PIGMENTS,
    rotDir: rotDir, opp: opp, isTile: isTile, turnable: turnable, period: period, singleRibbon: singleRibbon,
    maskOf: maskOf, piecesOf: piecesOf, sameState: sameState,
    prepare: prepare, neighbor: neighbor, trace: trace, isSolved: isSolved, solve: solve,
    cellRight: cellRight, wrongCells: wrongCells, weave: weave,
    // Book II
    solModel: solModel, withKinds: withKinds, over: over, weaveBreaks: weaveBreaks, weaveBreakSpans: weaveBreakSpans, weaveSolve: weaveSolve,
    solved2: solved2, cellRight2: cellRight2, wrong2: wrong2, solve2: solve2
  };
});
