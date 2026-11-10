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
    return M;
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

  return {
    DX: DX, DY: DY, DIRS: DIRS, KINDS: KINDS, PIGMENTS: PIGMENTS,
    rotDir: rotDir, opp: opp, isTile: isTile, turnable: turnable, period: period, singleRibbon: singleRibbon,
    maskOf: maskOf, piecesOf: piecesOf, sameState: sameState,
    prepare: prepare, neighbor: neighbor, trace: trace, isSolved: isSolved, solve: solve,
    cellRight: cellRight, wrongCells: wrongCells, weave: weave
  };
});
