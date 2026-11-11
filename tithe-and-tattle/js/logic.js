/* Tithe & Tattle: logic grid engine.
 * UMD: window.LOGIC in the browser, require('./logic.js') in node. No dependencies.
 * See AUTHORING.md for the puzzle format and the API.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LOGIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BLANK = 0, NO = 1, YES = 2, AUTO = 3;
  var TRIAL_BUDGET = 12;      // steps a tier-4 trial may take before it must fail
  var MASTER_T3 = 10;         // this many tier-3 steps (with no trial) also makes a Master

  // ---------------------------------------------------------------- compile
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function compile(puzzle) {
    if (cache && cache.has(puzzle)) return cache.get(puzzle);
    var cats = puzzle.categories;
    if (!cats || cats.length < 2) throw new Error('puzzle needs at least two categories');
    var C = cats.length, n = cats[0].items.length, N = C * n;
    var P = { puzzle: puzzle, C: C, n: n, N: N, cats: cats, byId: {}, item: [], cat: [], idx: [],
      vals: [], errors: [] };
    for (var c = 0; c < C; c++) {
      if (cats[c].items.length !== n) throw new Error('category ' + cats[c].id + ' has ' + cats[c].items.length + ' items, expected ' + n);
      var ord = cats[c].ordered;
      if (ord) {
        if (!ord.values || ord.values.length !== n) throw new Error('category ' + cats[c].id + ': ordered.values needs ' + n + ' numbers');
        for (var k = 1; k < n; k++) if (!(ord.values[k] > ord.values[k - 1])) throw new Error('category ' + cats[c].id + ': ordered.values must rise');
      }
      P.vals[c] = ord ? ord.values.slice() : null;
      for (var i = 0; i < n; i++) {
        var it = cats[c].items[i], g = c * n + i;
        if (P.byId[it.id] !== undefined) throw new Error('duplicate item id ' + it.id);
        P.byId[it.id] = g; P.item[g] = it; P.cat[g] = c; P.idx[g] = i;
      }
    }
    P.atoms = [];
    (puzzle.clues || []).forEach(function (cl, ci) {
      var logic = cl.logic;
      if (!logic || !logic.length) throw new Error('clue ' + (ci + 1) + ' has no logic');
      if (typeof logic[0] === 'string') logic = [logic];
      logic.forEach(function (a) { P.atoms.push(compileAtom(P, a, ci)); });
    });
    P.sol = puzzle.solution ? compileSolution(P, puzzle.solution) : null;
    if (cache) cache.set(puzzle, P);
    return P;
  }

  function gid(P, id, ci) {
    var g = P.byId[id];
    if (g === undefined) throw new Error('clue ' + (ci + 1) + ': unknown item "' + id + '"');
    return g;
  }

  function compileAtom(P, a, ci) {
    var t = a[0], A = { t: t, ci: ci };
    function G(x) { return gid(P, x, ci); }
    if (t === 'is' || t === 'not') { A.a = G(a[1]); A.b = G(a[2]); if (P.cat[A.a] === P.cat[A.b]) throw new Error('clue ' + (ci + 1) + ': ' + t + ' needs items from two categories'); }
    else if (t === 'either') {
      A.a = G(a[1]); A.opts = a[2].map(G);
      A.opts.forEach(function (o) { if (P.cat[o] === P.cat[A.a]) throw new Error('clue ' + (ci + 1) + ': either options must be in other categories'); });
    } else if (t === 'pairOr') {
      A.a = G(a[1]); A.b = G(a[2]); A.x = G(a[3]); A.y = G(a[4]);
      [A.x, A.y].forEach(function (z) { if (P.cat[z] === P.cat[A.a] || P.cat[z] === P.cat[A.b]) throw new Error('clue ' + (ci + 1) + ': pairOr x,y must be in other categories than a,b'); });
    } else if (t === 'allDiff') { A.list = a[1].map(G); }
    else if (t === 'cmp') {
      A.a = G(a[1]); A.b = G(a[2]); A.op = a[4]; A.k = a[5] || 0;
      var O = -1;
      for (var c = 0; c < P.C; c++) if (P.cats[c].id === a[3]) O = c;
      if (O < 0 || !P.vals[O]) throw new Error('clue ' + (ci + 1) + ': cmp needs an ordered category, got ' + a[3]);
      if (['<', '>', '=+', 'adj', '!adj'].indexOf(A.op) < 0) throw new Error('clue ' + (ci + 1) + ': unknown cmp op ' + A.op);
      if (A.op === '=+' && !A.k) throw new Error('clue ' + (ci + 1) + ': =+ needs a non-zero n');
      if (A.a === A.b) throw new Error('clue ' + (ci + 1) + ': cmp compares an item with itself');
      A.O = O;
    } else if (t === 'ifThen') {
      var p = a[1], q = a[2];
      A.p = [G(p[1]), G(p[2]), p[0] === 'is']; A.q = [G(q[1]), G(q[2]), q[0] === 'is'];
    } else throw new Error('clue ' + (ci + 1) + ': unknown logic type ' + t);
    A.cats = atomCats(P, A);
    return A;
  }

  function atomItems(A) {
    if (A.t === 'is' || A.t === 'not') return [A.a, A.b];
    if (A.t === 'either') return [A.a].concat(A.opts);
    if (A.t === 'pairOr') return [A.a, A.b, A.x, A.y];
    if (A.t === 'allDiff') return A.list;
    if (A.t === 'cmp') return [A.a, A.b];
    if (A.t === 'ifThen') return [A.p[0], A.p[1], A.q[0], A.q[1]];
    return [];
  }
  function atomCats(P, A) {
    var s = {}; atomItems(A).forEach(function (g) { s[P.cat[g]] = 1; });
    if (A.t === 'cmp') s[A.O] = 1;
    return Object.keys(s).map(Number);
  }

  // solution -> row of every item (row = index of the key item)
  function compileSolution(P, sol) {
    var rows = [];
    if (Array.isArray(sol)) rows = sol;
    else Object.keys(sol).forEach(function (k) { rows.push([k].concat(sol[k])); });
    var row = new Int8Array(P.N).fill(-1);
    rows.forEach(function (r) {
      var key = P.byId[r[0]];
      if (key === undefined || P.cat[key] !== 0) throw new Error('solution: ' + r[0] + ' is not a key item');
      if (r.length !== P.C) throw new Error('solution row for ' + r[0] + ' needs ' + P.C + ' items');
      for (var c = 0; c < P.C; c++) {
        var g = P.byId[r[c]];
        if (g === undefined || P.cat[g] !== c) throw new Error('solution row for ' + r[0] + ': ' + r[c] + ' is not in category ' + P.cats[c].id);
        if (row[g] >= 0) throw new Error('solution uses ' + r[c] + ' twice');
        row[g] = P.idx[key];
      }
    });
    for (var g = 0; g < P.N; g++) if (row[g] < 0) throw new Error('solution leaves ' + P.item[g].id + ' unplaced');
    return row;
  }

  // ---------------------------------------------------------------- truth of atoms in a full world
  // row[g] = row (key index) of item g; at[c][r] = item index of category c in row r
  function valOf(P, O, r, at) { return P.vals[O][at[O][r]]; }
  function testAtom(P, A, row, at) {
    switch (A.t) {
      case 'is': return row[A.a] === row[A.b];
      case 'not': return row[A.a] !== row[A.b];
      case 'either': for (var i = 0; i < A.opts.length; i++) if (row[A.opts[i]] === row[A.a]) return true; return false;
      case 'pairOr': {
        var ra = row[A.a], rb = row[A.b], rx = row[A.x], ry = row[A.y];
        if (ra === rb) return false;
        return (ra === rx && rb === ry) || (ra === ry && rb === rx);
      }
      case 'allDiff': {
        var seen = {};
        for (var j = 0; j < A.list.length; j++) { var r = row[A.list[j]]; if (seen[r]) return false; seen[r] = 1; }
        return true;
      }
      case 'cmp': {
        var r1 = row[A.a], r2 = row[A.b];
        if (r1 === r2) return false;
        return cmpOk(P, A, at[A.O][r1], at[A.O][r2]);
      }
      case 'ifThen': {
        var p = (row[A.p[0]] === row[A.p[1]]) === A.p[2];
        return !p || ((row[A.q[0]] === row[A.q[1]]) === A.q[2]);
      }
    }
    return false;
  }
  // ia, ib: item indexes in the ordered category
  function cmpOk(P, A, ia, ib) {
    if (ia === ib) return false;
    var v = P.vals[A.O];
    switch (A.op) {
      case '<': return v[ia] < v[ib];
      case '>': return v[ia] > v[ib];
      case '=+': return Math.abs(v[ia] - (v[ib] + A.k)) < 1e-9;
      case 'adj': return Math.abs(ia - ib) === 1;
      case '!adj': return Math.abs(ia - ib) !== 1;
    }
    return false;
  }

  function solutionWorld(P) {
    var at = [];
    for (var c = 0; c < P.C; c++) { at[c] = []; for (var i = 0; i < P.n; i++) at[c][P.sol[c * P.n + i]] = i; }
    return { row: P.sol, at: at };
  }

  // ---------------------------------------------------------------- exhaustive count (independent of the human solver)
  var permCache = {};
  function perms(n) {
    if (permCache[n]) return permCache[n];
    var out = [], a = [];
    for (var i = 0; i < n; i++) a.push(i);
    (function rec(k) {
      if (k === n) { out.push(a.slice()); return; }
      for (var i = k; i < n; i++) { var t = a[k]; a[k] = a[i]; a[i] = t; rec(k + 1); t = a[k]; a[k] = a[i]; a[i] = t; }
    })(0);
    return (permCache[n] = out);
  }

  function countSolutions(P, cap, atoms) {
    atoms = atoms || P.atoms; cap = cap || 2;
    var C = P.C, n = P.n, row = new Int8Array(P.N), at = [], i;
    for (i = 0; i < n; i++) row[i] = i;
    at[0] = []; for (i = 0; i < n; i++) at[0][i] = i;
    for (var c = 1; c < C; c++) at[c] = new Array(n);
    // greedy order of categories so clues can be checked early
    var done = { 0: 1 }, order = [];
    while (order.length < C - 1) {
      var best = -1, bestScore = -1;
      for (c = 1; c < C; c++) {
        if (done[c]) continue;
        var score = 0;
        atoms.forEach(function (A) { if (A.cats.every(function (x) { return done[x] || x === c; })) score++; });
        if (score > bestScore) { bestScore = score; best = c; }
      }
      done[best] = 1; order.push(best);
    }
    var level = order.map(function () { return []; }), pre = [];
    atoms.forEach(function (A) {
      var lv = -1;
      A.cats.forEach(function (x) { if (x !== 0) lv = Math.max(lv, order.indexOf(x)); });
      if (lv < 0) pre.push(A); else level[lv].push(A);
    });
    for (i = 0; i < pre.length; i++) if (!testAtom(P, pre[i], row, at)) return { count: 0, first: null };
    var PS = perms(n), count = 0, first = null;
    (function dfs(l) {
      if (count >= cap) return;
      if (l === order.length) { count++; if (!first) first = Array.prototype.slice.call(row); return; }
      var c = order[l], base = c * n, list = level[l], acl = at[c];
      for (var p = 0; p < PS.length; p++) {
        var perm = PS[p];
        for (var r = 0; r < n; r++) { acl[r] = perm[r]; row[base + perm[r]] = r; }
        var ok = true;
        for (var j = 0; j < list.length; j++) if (!testAtom(P, list[j], row, at)) { ok = false; break; }
        if (ok) { dfs(l + 1); if (count >= cap) return; }
      }
    })(0);
    return { count: count, first: first };
  }

  // ---------------------------------------------------------------- wording helpers
  function fill(tpl, x) { return tpl.replace('{x}', x); }
  function listOr(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]; }
  function listAnd(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function nm(P, g) { return P.item[g].name; }
  function catTpl(P, c, key) {
    var cat = P.cats[c];
    if (cat[key]) return cat[key];
    if (c === 0) return { who: '{x}', is: 'was {x}', isnt: "wasn't {x}" }[key];
    return { who: 'the one with {x}', is: 'had {x}', isnt: "didn't have {x}" }[key];
  }
  function noun(P, g) { return fill(catTpl(P, P.cat[g], 'who'), nm(P, g)); }
  function pred(P, g, pos) { return fill(catTpl(P, P.cat[g], pos ? 'is' : 'isnt'), nm(P, g)); }
  function predList(P, gs, pos) { // all from one category
    return fill(catTpl(P, P.cat[gs[0]], pos ? 'is' : 'isnt'), listOr(gs.map(function (g) { return nm(P, g); })));
  }
  function sent(P, u, v, pos) { // subject is the item of the lower category
    if (P.cat[v] < P.cat[u]) { var t = u; u = v; v = t; }
    return noun(P, u) + ' ' + pred(P, v, pos);
  }
  function clueBody(P, ci) {
    var cl = P.puzzle.clues[ci], txt = (cl && cl.text || '').trim().replace(/[.!]+$/, '');
    if (!txt) return 'the clue';
    var w = txt.split(/[\s,']/)[0];
    var keep = false;
    for (var g = 0; g < P.N && !keep; g++) if (P.item[g].name.split(/[\s,']/)[0] === w) keep = true;
    return keep ? txt : txt.charAt(0).toLowerCase() + txt.slice(1);
  }
  function clueSays(P, ci) { return 'Clue ' + (ci + 1) + ': ' + clueBody(P, ci); }

  // ---------------------------------------------------------------- human solver state
  function blankRel(P) {
    var rel = new Uint8Array(P.N * P.N), n = P.n;
    for (var u = 0; u < P.N; u++) for (var v = 0; v < P.N; v++)
      if (P.cat[u] === P.cat[v]) rel[u * P.N + v] = u === v ? YES : NO;
    return rel;
  }
  function R(P, rel, u, v) { return rel[u * P.N + v]; }
  function poss(P, rel, u, c) {
    var out = [];
    for (var i = 0; i < P.n; i++) { var w = c * P.n + i; if (rel[u * P.N + w] !== NO) out.push(w); }
    return out;
  }

  // static facts of each atom: direct (tier 1) and order bounds (tier 2)
  function staticFacts(P) {
    if (P.facts) return P.facts;
    var direct = [], bounds = [];
    P.atoms.forEach(function (A) {
      var stated = [], derived = [], bd = [];
      function no(u, v, list) { if (P.cat[u] !== P.cat[v]) list.push([u, v, NO]); }
      function restrict(u, keepers, list) { // u's row lies in keepers (all one category)
        var c = P.cat[keepers[0]];
        for (var i = 0; i < P.n; i++) { var w = c * P.n + i; if (keepers.indexOf(w) < 0) no(u, w, list); }
      }
      if (A.t === 'is') stated.push([A.a, A.b, YES]);
      else if (A.t === 'not') stated.push([A.a, A.b, NO]);
      else if (A.t === 'either') {
        var oc = P.cat[A.opts[0]];
        if (A.opts.every(function (o) { return P.cat[o] === oc; })) restrict(A.a, A.opts, derived);
      } else if (A.t === 'pairOr') {
        no(A.a, A.b, derived); no(A.x, A.y, derived);
        if (P.cat[A.x] === P.cat[A.y]) { restrict(A.a, [A.x, A.y], derived); restrict(A.b, [A.x, A.y], derived); }
        if (P.cat[A.a] === P.cat[A.b]) { restrict(A.x, [A.a, A.b], derived); restrict(A.y, [A.a, A.b], derived); }
      } else if (A.t === 'allDiff') {
        for (var i = 0; i < A.list.length; i++) for (var j = i + 1; j < A.list.length; j++) no(A.list[i], A.list[j], derived);
      } else if (A.t === 'cmp') {
        no(A.a, A.b, derived);
        var O = A.O, all = [];
        for (var k = 0; k < P.n; k++) all.push(k);
        var da = P.cat[A.a] === O ? [P.idx[A.a]] : all, db = P.cat[A.b] === O ? [P.idx[A.b]] : all;
        if (P.cat[A.a] !== O) da.forEach(function (x) { if (!db.some(function (y) { return cmpOk(P, A, x, y); })) bd.push([A.a, O * P.n + x, NO]); });
        if (P.cat[A.b] !== O) db.forEach(function (y) { if (!da.some(function (x) { return cmpOk(P, A, x, y); })) bd.push([A.b, O * P.n + y, NO]); });
      }
      direct.push({ ci: A.ci, A: A, stated: stated, derived: derived });
      if (bd.length) bounds.push({ ci: A.ci, A: A, cells: bd });
    });
    return (P.facts = { direct: direct, bounds: bounds });
  }

  function newCells(P, rel, cells) {
    return cells.filter(function (c) { return rel[c[0] * P.N + c[1]] !== c[2]; });
  }
  function describeFacts(P, cells) {
    var groups = [], byKey = {};
    cells.forEach(function (c) {
      var u = c[0], v = c[1];
      if (P.cat[v] < P.cat[u]) { u = c[1]; v = c[0]; }
      var key = u + '|' + c[2] + '|' + P.cat[v];
      if (!byKey[key]) { byKey[key] = { u: u, pos: c[2] === YES, vs: [] }; groups.push(byKey[key]); }
      byKey[key].vs.push(v);
    });
    return listAnd(groups.map(function (gr) { return noun(P, gr.u) + ' ' + predList(P, gr.vs, gr.pos); }));
  }

  // Each rule calls emit(step); emit returns true to stop the scan.
  // step = {cells:[[u,v,state]], tier, clues:[ci], why:function, fail?:function, rule}
  var RULES = [
    { tier: 1, name: 'clue', fn: function (P, rel, emit) {
      var F = staticFacts(P).direct;
      // merge atoms of one clue
      var byClue = {};
      F.forEach(function (f) { (byClue[f.ci] = byClue[f.ci] || { stated: [], derived: [], allDiff: false }); byClue[f.ci].stated = byClue[f.ci].stated.concat(f.stated); byClue[f.ci].derived = byClue[f.ci].derived.concat(f.derived); if (f.A.t === 'allDiff') byClue[f.ci].allDiff = true; });
      var keys = Object.keys(byClue).map(Number).sort(function (a, b) { return a - b; });
      for (var i = 0; i < keys.length; i++) {
        var ci = keys[i], f = byClue[ci], st = newCells(P, rel, f.stated), dv = newCells(P, rel, f.derived);
        if (!st.length && !dv.length) continue;
        var stop = emit({ cells: st.concat(dv), tier: 1, clues: [ci], rule: 'clue', why: (function (ci, dv, ad) {
          return function () {
            if (!dv.length) return clueSays(P, ci) + '.';
            if (ad && dv.length > 2) return clueSays(P, ci) + ', so no two of them go together.';
            return clueSays(P, ci) + ', so ' + describeFacts(P, dv) + '.';
          };
        })(ci, dv, f.allDiff) });
        if (stop) return;
      }
    } },
    { tier: 1, name: 'cross', fn: function (P, rel, emit) {
      var N = P.N, n = P.n;
      for (var u = 0; u < N; u++) for (var v = u + 1; v < N; v++) {
        if (P.cat[u] === P.cat[v] || rel[u * N + v] !== YES) continue;
        var cells = [], cu = P.cat[u], cv = P.cat[v];
        for (var i = 0; i < n; i++) {
          var w = cv * n + i; if (w !== v && rel[u * N + w] !== NO) cells.push([u, w, NO]);
          w = cu * n + i; if (w !== u && rel[v * N + w] !== NO) cells.push([w, v, NO]);
        }
        if (cells.length && emit({ cells: cells, tier: 1, clues: [], rule: 'cross', why: (function (u, v) {
          return function () { return cap(sent(P, u, v, true)) + ', so the rest of that row and column are crossed out.'; };
        })(u, v) })) return;
      }
    } },
    { tier: 1, name: 'last', fn: function (P, rel, emit) {
      for (var u = 0; u < P.N; u++) for (var c = 0; c < P.C; c++) {
        if (c === P.cat[u]) continue;
        var ps = poss(P, rel, u, c);
        if (ps.length === 0) {
          if (emit({ cells: [], tier: 1, clues: [], rule: 'last', fail: (function (u, c) { return function () { return 'nothing would be left for ' + noun(P, u) + ' under ' + P.cats[c].name.toLowerCase(); }; })(u, c) })) return;
        } else if (ps.length === 1 && rel[u * P.N + ps[0]] !== YES) {
          if (emit({ cells: [[u, ps[0], YES]], tier: 1, clues: [], rule: 'last', why: (function (u, c, v) {
            return function () {
              var others = []; for (var i = 0; i < P.n; i++) if (c * P.n + i !== v) others.push(c * P.n + i);
              return cap(noun(P, u)) + ' ' + predList(P, others, false) + ', so ' + noun(P, u) + ' ' + pred(P, v, true) + '.';
            };
          })(u, c, ps[0]) })) return;
        }
      }
    } },
    { tier: 2, name: 'bounds', fn: function (P, rel, emit) {
      var B = staticFacts(P).bounds;
      for (var i = 0; i < B.length; i++) {
        var cells = newCells(P, rel, B[i].cells);
        if (cells.length && emit({ cells: cells, tier: 2, clues: [B[i].ci], rule: 'bounds', why: (function (ci, cells) {
          return function () { return clueSays(P, ci) + ', so ' + describeFacts(P, cells) + '.'; };
        })(B[i].ci, cells) })) return;
      }
    } },
    { tier: 2, name: 'link', fn: function (P, rel, emit) {
      var N = P.N;
      for (var u = 0; u < N; u++) for (var v = 0; v < N; v++) {
        if (u === v || P.cat[u] === P.cat[v] || rel[u * N + v] !== YES) continue;
        for (var w = 0; w < N; w++) {
          if (P.cat[w] === P.cat[u] || P.cat[w] === P.cat[v]) continue;
          if (rel[v * N + w] === YES && rel[u * N + w] !== YES) {
            if (emit({ cells: [[u, w, YES]], tier: 2, clues: [], rule: 'link', why: (function (u, v, w) {
              return function () { return cap(sent(P, u, v, true)) + ' and ' + sent(P, v, w, true) + ', so ' + sent(P, u, w, true) + '.'; };
            })(u, v, w) })) return;
          }
        }
      }
    } },
    { tier: 2, name: 'linkNo', fn: function (P, rel, emit) {
      var N = P.N;
      for (var u = 0; u < N; u++) for (var v = 0; v < N; v++) {
        if (u === v || P.cat[u] === P.cat[v] || rel[u * N + v] !== YES) continue;
        for (var w = 0; w < N; w++) {
          if (P.cat[w] === P.cat[u] || P.cat[w] === P.cat[v]) continue;
          if (rel[v * N + w] === NO && rel[u * N + w] !== NO) {
            if (emit({ cells: [[u, w, NO]], tier: 2, clues: [], rule: 'linkNo', why: (function (u, v, w) {
              return function () { return cap(sent(P, u, v, true)) + ' and ' + sent(P, v, w, false) + ', so ' + sent(P, u, w, false) + '.'; };
            })(u, v, w) })) return;
          }
        }
      }
    } },
    { tier: 3, name: 'order', fn: function (P, rel, emit) {
      for (var i = 0; i < P.atoms.length; i++) {
        var A = P.atoms[i]; if (A.t !== 'cmp') continue;
        var O = A.O, pa = poss(P, rel, A.a, O), pb = poss(P, rel, A.b, O), cells = [], ia, ib;
        var xa = pa.map(function (g) { return P.idx[g]; }), xb = pb.map(function (g) { return P.idx[g]; });
        var badA = pa.filter(function (g) { return !xb.some(function (y) { return cmpOk(P, A, P.idx[g], y); }); });
        var badB = pb.filter(function (g) { return !xa.some(function (x) { return cmpOk(P, A, x, P.idx[g]); }); });
        if ((badA.length && P.cat[A.a] === O) || (badB.length && P.cat[A.b] === O) || badA.length === pa.length || badB.length === pb.length) {
          if (emit({ cells: [], tier: 3, clues: [A.ci], rule: 'order', fail: (function (A, pa, pb) { return function () {
            var ctx = [];
            if (P.cat[A.a] !== A.O) ctx.push(noun(P, A.a) + ' ' + predList(P, pa, true));
            if (P.cat[A.b] !== A.O) ctx.push(noun(P, A.b) + ' ' + predList(P, pb, true));
            return 'clue ' + (A.ci + 1) + ' could not hold' + (ctx.length ? ', since ' + listAnd(ctx) : '');
          }; })(A, pa, pb) })) return;
          continue;
        }
        badA.forEach(function (g) { cells.push([A.a, g, NO]); });
        badB.forEach(function (g) { cells.push([A.b, g, NO]); });
        cells = newCells(P, rel, cells);
        if (cells.length && emit({ cells: cells, tier: 3, clues: [A.ci], rule: 'order', why: (function (A, pa, pb, cells) {
          return function () {
            var ctx = [], hitA = cells.some(function (c) { return c[0] === A.a; }), hitB = cells.some(function (c) { return c[0] === A.b; });
            if (hitA && P.cat[A.b] !== A.O && pb.length < P.n) ctx.push(noun(P, A.b) + ' ' + predList(P, pb, true));
            if (hitB && P.cat[A.a] !== A.O && pa.length < P.n) ctx.push(noun(P, A.a) + ' ' + predList(P, pa, true));
            return clueSays(P, A.ci) + (ctx.length ? '; ' + listAnd(ctx) : '') + ', so ' + describeFacts(P, cells) + '.';
          };
        })(A, pa, pb, cells) })) return;
      }
    } },
    { tier: 3, name: 'either', fn: function (P, rel, emit) {
      for (var i = 0; i < P.atoms.length; i++) {
        var A = P.atoms[i]; if (A.t !== 'either') continue;
        var live = A.opts.filter(function (o) { return rel[A.a * P.N + o] !== NO; });
        if (!live.length) { if (emit({ cells: [], tier: 3, clues: [A.ci], rule: 'either', fail: (function (ci) { return function () { return 'clue ' + (ci + 1) + ' could not hold'; }; })(A.ci) })) return; continue; }
        if (live.length === 1 && rel[A.a * P.N + live[0]] !== YES) {
          if (emit({ cells: [[A.a, live[0], YES]], tier: 3, clues: [A.ci], rule: 'either', why: (function (A, v) {
            return function () {
              var dead = A.opts.filter(function (o) { return o !== v; });
              return clueSays(P, A.ci) + '; ' + listAnd(dead.map(function (o) { return sent(P, A.a, o, false); })) + ', so ' + sent(P, A.a, v, true) + '.';
            };
          })(A, live[0]) })) return;
        }
      }
    } },
    { tier: 3, name: 'pair', fn: function (P, rel, emit) {
      var N = P.N;
      for (var i = 0; i < P.atoms.length; i++) {
        var A = P.atoms[i]; if (A.t !== 'pairOr') continue;
        var ok1 = rel[A.a * N + A.x] !== NO && rel[A.b * N + A.y] !== NO;
        var ok2 = rel[A.a * N + A.y] !== NO && rel[A.b * N + A.x] !== NO;
        if (!ok1 && !ok2) { if (emit({ cells: [], tier: 3, clues: [A.ci], rule: 'pair', fail: (function (ci) { return function () { return 'clue ' + (ci + 1) + ' could not hold'; }; })(A.ci) })) return; continue; }
        if (ok1 && ok2) continue;
        var cells = ok1 ? [[A.a, A.x, YES], [A.b, A.y, YES]] : [[A.a, A.y, YES], [A.b, A.x, YES]];
        cells = newCells(P, rel, cells.filter(function (c) { return P.cat[c[0]] !== P.cat[c[1]]; }));
        if (cells.length && emit({ cells: cells, tier: 3, clues: [A.ci], rule: 'pair', why: (function (A, ok1, cells) {
          return function () {
            var reason = ok1 ? (rel[A.a * N + A.y] === NO ? [A.a, A.y] : [A.b, A.x]) : (rel[A.a * N + A.x] === NO ? [A.a, A.x] : [A.b, A.y]);
            return clueSays(P, A.ci) + '; ' + sent(P, reason[0], reason[1], false) + ', so ' + describeFacts(P, cells) + '.';
          };
        })(A, ok1, cells) })) return;
      }
    } },
    { tier: 3, name: 'allDiff', fn: function (P, rel, emit) {
      for (var i = 0; i < P.atoms.length; i++) {
        var A = P.atoms[i]; if (A.t !== 'allDiff' || A.list.length !== P.n) continue;
        for (var u = 0; u < P.N; u++) {
          if (A.list.indexOf(u) >= 0) continue;
          var live = A.list.filter(function (e) { return rel[u * P.N + e] !== NO; });
          if (!live.length) { if (emit({ cells: [], tier: 3, clues: [A.ci], rule: 'allDiff', fail: (function (ci, u) { return function () { return 'clue ' + (ci + 1) + ' could not hold, as ' + noun(P, u) + ' would be none of them'; }; })(A.ci, u) })) return; continue; }
          if (live.length === 1 && rel[u * P.N + live[0]] !== YES) {
            if (emit({ cells: [[u, live[0], YES]], tier: 3, clues: [A.ci], rule: 'allDiff', why: (function (A, u, v) {
              return function () {
                var dead = A.list.filter(function (e) { return e !== v && P.cat[e] !== P.cat[u]; });
                return clueSays(P, A.ci) + '; ' + noun(P, u) + ' must be one of them' + (dead.length ? ', and ' + listAnd(dead.map(function (e) { return sent(P, u, e, false); })) : '') + ', so ' + sent(P, u, v, true) + '.';
              };
            })(A, u, live[0]) })) return;
          }
        }
      }
    } },
    { tier: 3, name: 'ifThen', fn: function (P, rel, emit) {
      var N = P.N;
      for (var i = 0; i < P.atoms.length; i++) {
        var A = P.atoms[i]; if (A.t !== 'ifThen') continue;
        var pS = A.p[2] ? YES : NO, qS = A.q[2] ? YES : NO;
        var cell = null, why = null;
        if (rel[A.p[0] * N + A.p[1]] === pS && rel[A.q[0] * N + A.q[1]] !== qS) { cell = [A.q[0], A.q[1], qS]; why = [A.p[0], A.p[1], A.p[2]]; }
        else if (rel[A.q[0] * N + A.q[1]] === (YES + NO - qS) && rel[A.p[0] * N + A.p[1]] !== (YES + NO - pS)) { cell = [A.p[0], A.p[1], YES + NO - pS]; why = [A.q[0], A.q[1], !A.q[2]]; }
        if (cell && emit({ cells: [cell], tier: 3, clues: [A.ci], rule: 'ifThen', why: (function (A, cell, w) {
          return function () { return clueSays(P, A.ci) + '; ' + sent(P, w[0], w[1], w[2]) + ', so ' + sent(P, cell[0], cell[1], cell[2] === YES) + '.'; };
        })(A, cell, why) })) return;
      }
    } },
    { tier: 3, name: 'apart', fn: function (P, rel, emit) {
      var N = P.N;
      for (var u = 0; u < N; u++) for (var v = 0; v < N; v++) {
        if (P.cat[u] >= P.cat[v] || rel[u * N + v] !== BLANK) continue;
        for (var c = 0; c < P.C; c++) {
          if (c === P.cat[u] || c === P.cat[v]) continue;
          var pu = poss(P, rel, u, c), pv = poss(P, rel, v, c);
          if (pu.some(function (g) { return pv.indexOf(g) >= 0; })) continue;
          if (emit({ cells: [[u, v, NO]], tier: 3, clues: [], rule: 'apart', why: (function (u, v, pu, pv) {
            return function () { return cap(noun(P, u)) + ' ' + predList(P, pu, true) + ' and ' + noun(P, v) + ' ' + predList(P, pv, true) + ', so ' + sent(P, u, v, false) + '.'; };
          })(u, v, pu, pv) })) return;
          break;
        }
      }
    } }
  ];

  function applyStep(P, rel, step) {
    if (step.fail) return { cell: null };
    for (var i = 0; i < step.cells.length; i++) {
      var c = step.cells[i], cur = rel[c[0] * P.N + c[1]];
      if (cur !== BLANK && cur !== c[2]) return { cell: c, cur: cur };
      rel[c[0] * P.N + c[1]] = c[2]; rel[c[1] * P.N + c[0]] = c[2];
    }
    return null;
  }

  // Propagate tiers 1..3 in batch (for trials). Returns {fail:string|null, steps, clues}
  function propagate(P, rel, budget) {
    var steps = 0, clues = {}, fail = null;
    var changed = true;
    while (changed && !fail) {
      changed = false;
      for (var r = 0; r < RULES.length && !fail; r++) {
        var any = false;
        RULES[r].fn(P, rel, function (st) {
          if (st.fail) { fail = st.fail(); return true; }
          var why = null;
          var bad = applyStep(P, rel, st);
          if (bad) {
            var c = bad.cell;
            fail = lcClue(st.why()) + ', but ' + sent(P, c[0], c[1], bad.cur === YES) + ', which can\'t be';
            st.clues.forEach(function (ci) { clues[ci] = 1; });
            return true;
          }
          any = true;
          st.clues.forEach(function (ci) { clues[ci] = 1; });
          if (st.rule !== 'cross') steps++;
          return steps > budget;
        });
        if (steps > budget) return { fail: null, steps: steps, clues: clues };
        if (any) { changed = true; break; }
      }
    }
    return { fail: fail, steps: steps, clues: clues };
  }
  function lcClue(s) {
    s = s.replace(/\.$/, '');
    return s.replace(/^Clue (\d+): /, 'by clue $1, ');
  }

  var TRIAL = { tier: 4, name: 'trial', fn: function (P, rel, emit, opts) {
    var best = null, budget = (opts && opts.trialBudget) || TRIAL_BUDGET;
    var L = layout(P);
    for (var b = 0; b < L.blocks.length && !(best && best.res.steps <= 1); b++) {
      var bl = L.blocks[b];
      for (var i = 0; i < P.n; i++) for (var j = 0; j < P.n; j++) {
        var u = bl.rowCat * P.n + i, v = bl.colCat * P.n + j;
        if (rel[u * P.N + v] !== BLANK) continue;
        var r2 = rel.slice(); r2[u * P.N + v] = YES; r2[v * P.N + u] = YES;
        var res = propagate(P, r2, best ? Math.min(budget, best.res.steps) : budget);
        if (res.fail && (!best || res.steps < best.res.steps)) best = { u: u, v: v, res: res };
      }
    }
    if (best) emit({ cells: [[best.u, best.v, NO]], tier: 4, clues: Object.keys(best.res.clues).map(Number).sort(function (a, b) { return a - b; }), rule: 'trial',
      why: function () { return 'Suppose ' + sent(P, best.u, best.v, true) + '. Then ' + best.res.fail + '. So ' + sent(P, best.u, best.v, false) + '.'; } });
  } };

  function nextStep(P, rel, maxTier, opts) {
    var found = null;
    function emit(st) { found = st; return true; }
    for (var r = 0; r < RULES.length && !found; r++) {
      if (RULES[r].tier > maxTier) continue;
      RULES[r].fn(P, rel, emit);
    }
    if (!found && maxTier >= 4) TRIAL.fn(P, rel, emit, opts);
    return found;
  }

  function relSolved(P, rel) {
    for (var u = 0; u < P.N; u++) for (var c = 0; c < P.C; c++) {
      if (c === P.cat[u]) continue;
      var ps = poss(P, rel, u, c);
      if (ps.length !== 1 || rel[u * P.N + ps[0]] !== YES) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- layout and marks
  function layout(P) {
    if (P.layout) return P.layout;
    var C = P.C, top = [], left = [0], blocks = [];
    for (var c = 1; c < C; c++) top.push(c);
    for (c = C - 1; c >= 2; c--) left.push(c);
    left.forEach(function (rc, r) {
      top.forEach(function (cc, col) { if (r === 0 || cc < rc) blocks.push({ rowCat: rc, colCat: cc, row: r, col: col }); });
    });
    return (P.layout = { top: top, left: left, blocks: blocks });
  }
  function gridLayout(puzzle) {
    var P = compile(puzzle), L = layout(P);
    return {
      top: L.top.map(function (c) { return P.cats[c].id; }),
      left: L.left.map(function (c) { return P.cats[c].id; }),
      blocks: L.blocks.map(function (b) { return { rowCat: P.cats[b.rowCat].id, colCat: P.cats[b.colCat].id, row: b.row, col: b.col, rowCatIndex: b.rowCat, colCatIndex: b.colCat }; })
    };
  }
  // orient a pair (u,v) so rowItem is from the block's row category
  function orient(P, u, v) {
    var cu = P.cat[u], cv = P.cat[v], lo = Math.min(cu, cv), hi = Math.max(cu, cv);
    var rowCat = lo === 0 ? 0 : hi;
    return cu === rowCat ? [u, v] : [v, u];
  }
  function cellOut(P, c) { var o = orient(P, c[0], c[1]); return { rowItem: P.item[o[0]].id, colItem: P.item[o[1]].id, state: c[2] }; }

  function newMarks(puzzle) { var P = compile(puzzle); return { cells: new Uint8Array(P.N * P.N) }; }
  function getMark(puzzle, marks, a, b) { var P = compile(puzzle); return marks.cells[gid(P, a, -1) * P.N + gid(P, b, -1)]; }
  function put(P, marks, u, v, val) { marks.cells[u * P.N + v] = val; marks.cells[v * P.N + u] = val; }
  function refreshAuto(P, marks, cu, cv) {
    var n = P.n, i, j;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (marks.cells[(cu * n + i) * P.N + cv * n + j] === AUTO) put(P, marks, cu * n + i, cv * n + j, BLANK);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      if (marks.cells[(cu * n + i) * P.N + cv * n + j] !== YES) continue;
      for (var k = 0; k < n; k++) {
        if (k !== j && marks.cells[(cu * n + i) * P.N + cv * n + k] === BLANK) put(P, marks, cu * n + i, cv * n + k, AUTO);
        if (k !== i && marks.cells[(cu * n + k) * P.N + cv * n + j] === BLANK) put(P, marks, cu * n + k, cv * n + j, AUTO);
      }
    }
  }
  // value: 0 blank, 1 cross, 2 dot. auto (default true): keep auto-crosses in this sub-grid in step with its dots.
  function setMark(puzzle, marks, a, b, value, auto) {
    var P = compile(puzzle), u = gid(P, a, -1), v = gid(P, b, -1);
    if (P.cat[u] === P.cat[v]) throw new Error('setMark: same category');
    put(P, marks, u, v, value);
    if (auto !== false) refreshAuto(P, marks, P.cat[u], P.cat[v]);
    else if (value !== YES) { /* leave other autos alone */ }
    return marks;
  }
  function cycleMark(puzzle, marks, a, b, auto) {
    var cur = getMark(puzzle, marks, a, b);
    var next = cur === BLANK || cur === AUTO ? NO : cur === NO ? YES : BLANK;
    setMark(puzzle, marks, a, b, next, auto);
    return next;
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function cellOrder(P) {
    var L = layout(P), out = [];
    L.blocks.forEach(function (bl) { for (var i = 0; i < P.n; i++) for (var j = 0; j < P.n; j++) out.push([bl.rowCat * P.n + i, bl.colCat * P.n + j]); });
    return out;
  }
  function serializeMarks(puzzle, marks) {
    var P = compile(puzzle), ord = cellOrder(P), s = '';
    for (var i = 0; i < ord.length; i += 3) {
      var x = 0;
      for (var k = 0; k < 3; k++) x = x * 4 + (i + k < ord.length ? marks.cells[ord[i + k][0] * P.N + ord[i + k][1]] : 0);
      s += B64[x];
    }
    return '1.' + s;
  }
  function deserializeMarks(puzzle, str) {
    var P = compile(puzzle), ord = cellOrder(P), m = newMarks(puzzle);
    if (!str || str.slice(0, 2) !== '1.' || str.length - 2 !== Math.ceil(ord.length / 3)) return m;
    for (var i = 0; i < ord.length; i += 3) {
      var x = B64.indexOf(str[2 + i / 3]);
      if (x < 0) return newMarks(puzzle);
      for (var k = 2; k >= 0; k--) { if (i + k < ord.length) put(P, m, ord[i + k][0], ord[i + k][1], x % 4); x = Math.floor(x / 4); }
    }
    return m;
  }

  function checkMarks(puzzle, marks) {
    var P = compile(puzzle), wrong = [], wrongAuto = [], ord = cellOrder(P);
    ord.forEach(function (o) {
      var m = marks.cells[o[0] * P.N + o[1]]; if (!m) return;
      var truth = P.sol[o[0]] === P.sol[o[1]];
      var bad = (m === YES) !== truth;
      if (bad) (m === AUTO ? wrongAuto : wrong).push({ rowItem: P.item[o[0]].id, colItem: P.item[o[1]].id, state: m });
    });
    return { wrong: wrong, wrongAuto: wrongAuto };
  }
  function isSolved(puzzle, marks) {
    var P = compile(puzzle), c = checkMarks(puzzle, marks);
    if (c.wrong.length || c.wrongAuto.length) return false;
    var ok = true;
    layout(P).blocks.forEach(function (bl) {
      for (var i = 0; i < P.n; i++) {
        var u = bl.rowCat * P.n + i, has = false;
        for (var j = 0; j < P.n; j++) if (marks.cells[u * P.N + bl.colCat * P.n + j] === YES) has = true;
        if (!has) ok = false;
      }
    });
    return ok;
  }
  function impliedTally(puzzle, marks) {
    var P = compile(puzzle), par = [];
    for (var g = 0; g < P.N; g++) par[g] = g;
    function find(x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }
    for (var u = 0; u < P.N; u++) for (var v = u + 1; v < P.N; v++) if (P.cat[u] !== P.cat[v] && marks.cells[u * P.N + v] === YES) par[find(u)] = find(v);
    var out = [];
    for (var k = 0; k < P.n; k++) {
      var root = find(k), items = [P.item[k].id], conflict = false;
      for (var c = 1; c < P.C; c++) {
        var hit = [];
        for (var i = 0; i < P.n; i++) if (find(c * P.n + i) === root) hit.push(P.item[c * P.n + i].id);
        if (hit.length > 1) conflict = true;
        items.push(hit.length === 1 ? hit[0] : null);
      }
      out.push({ key: P.item[k].id, items: items, conflict: conflict });
    }
    return out;
  }

  function relFromMarks(P, marks) {
    var rel = blankRel(P);
    for (var u = 0; u < P.N; u++) for (var v = 0; v < P.N; v++) {
      if (P.cat[u] === P.cat[v]) continue;
      var m = marks.cells[u * P.N + v];
      rel[u * P.N + v] = m === YES ? YES : m ? NO : BLANK;
    }
    return rel;
  }
  function stepOut(P, st) {
    return { cells: st.cells.map(function (c) { return cellOut(P, c); }), tier: st.tier, clues: st.clues.slice(), rule: st.rule, why: st.why() };
  }

  // ---------------------------------------------------------------- public: solve, hint, validate
  function gradeOf(maxTier, tc) {
    if (maxTier >= 4 || tc[3] >= MASTER_T3) return 'Master';
    if (maxTier === 3) return 'Journeyman';
    return 'Apprentice';
  }

  // opts: {maxTier (default 4), skipCount (skip the exhaustive count), quiet (no why strings), trialBudget}
  function solve(puzzle, opts) {
    opts = opts || {};
    var P = compile(puzzle), maxTier = opts.maxTier || 4;
    var res = { unique: null, solutionCount: null, steps: [], maxTier: 0, tierCounts: [0, 0, 0, 0, 0], grade: null, finished: false, stuckAt: null };
    if (!opts.skipCount) { var cnt = countSolutions(P, 2); res.solutionCount = cnt.count; res.unique = cnt.count === 1; }
    var rel = opts.marks ? relFromMarks(P, opts.marks) : blankRel(P), guard = 0;
    while (!relSolved(P, rel) && guard++ < 2000) {
      var st = nextStep(P, rel, maxTier, opts);
      if (!st || st.fail) break;
      if (applyStep(P, rel, st)) { res.contradiction = true; break; }
      res.tierCounts[st.tier]++;
      if (st.tier > res.maxTier) res.maxTier = st.tier;
      res.steps.push(opts.quiet ? { tier: st.tier, clues: st.clues, rule: st.rule, n: st.cells.length } : stepOut(P, st));
    }
    res.finished = relSolved(P, rel);
    if (res.finished && P.sol) {
      for (var u = 0; u < P.N; u++) for (var v = 0; v < P.N; v++)
        if (P.cat[u] !== P.cat[v] && (rel[u * P.N + v] === YES) !== (P.sol[u] === P.sol[v])) { res.finished = false; res.wrongAnswer = true; }
    }
    res.grade = res.finished ? gradeOf(res.maxTier, res.tierCounts) : null;
    return res;
  }

  function nextHint(puzzle, marks) {
    var P = compile(puzzle), chk = checkMarks(puzzle, marks);
    if (chk.wrong.length || chk.wrongAuto.length) return { wrong: chk.wrong.concat(chk.wrongAuto) };
    var rel = relFromMarks(P, marks);
    if (relSolved(P, rel)) return null;
    var st = nextStep(P, rel, 4);
    if (!st || st.fail) return null;
    return stepOut(P, st);
  }

  function validate(puzzle, opts) {
    opts = opts || {};
    var out = { ok: false, errors: [], warnings: [], unique: false, solutionCount: 0, grade: null, maxTier: 0, tierCounts: null, steps: 0, redundant: [] };
    var P;
    try { P = compile(puzzle); } catch (e) { out.errors.push(e.message); return out; }
    if (!P.sol) { out.errors.push('no solution given'); return out; }
    var W = solutionWorld(P);
    P.atoms.forEach(function (A) {
      if (!testAtom(P, A, W.row, W.at)) out.errors.push('clue ' + (A.ci + 1) + ' is false for the given solution');
    });
    if (out.errors.length) return out;
    var cnt = countSolutions(P, 2);
    out.solutionCount = cnt.count; out.unique = cnt.count === 1;
    if (!out.unique) out.errors.push(cnt.count === 0 ? 'no solution' : 'more than one solution');
    var s = solve(puzzle, { skipCount: true, quiet: true });
    out.steps = s.steps.length; out.maxTier = s.maxTier; out.tierCounts = s.tierCounts; out.grade = s.grade;
    if (out.unique && !s.finished) out.errors.push(s.wrongAnswer ? 'human solver reached a wrong answer (engine bug)' : 'too hard: the human solver gets stuck after ' + s.steps.length + ' steps');
    if (!opts.skipRedundant && out.unique) {
      var nc = (puzzle.clues || []).length;
      for (var ci = 0; ci < nc; ci++) {
        var rest = P.atoms.filter(function (A) { return A.ci !== ci; });
        if (countSolutions(P, 2, rest).count === 1) out.redundant.push(ci + 1);
      }
      if (out.redundant.length) out.warnings.push('redundant clue(s): ' + out.redundant.join(', '));
    }
    var target = puzzle.grade || puzzle.targetGrade;
    if (target && out.grade && target !== out.grade) out.warnings.push('target grade ' + target + ' but measured ' + out.grade);
    out.ok = !out.errors.length;
    return out;
  }

  return {
    BLANK: BLANK, NO: NO, YES: YES, AUTO: AUTO,
    TRIAL_BUDGET: TRIAL_BUDGET, MASTER_T3: MASTER_T3,
    compile: compile, gridLayout: gridLayout,
    solve: solve, nextHint: nextHint, validate: validate,
    countSolutions: function (puzzle, cap) { return countSolutions(compile(puzzle), cap || 2).count; },
    newMarks: newMarks, getMark: getMark, setMark: setMark, cycleMark: cycleMark,
    serializeMarks: serializeMarks, deserializeMarks: deserializeMarks,
    checkMarks: checkMarks, isSolved: isSolved, impliedTally: impliedTally,
    gradeOf: gradeOf,
    _internal: { countSolutions: countSolutions, testAtom: testAtom, solutionWorld: solutionWorld, staticFacts: staticFacts, sent: sent, noun: noun, pred: pred }
  };
});
