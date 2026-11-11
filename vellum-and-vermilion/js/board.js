/* Vellum & Vermilion — the board: interlace drawing and input.
   var b = new Board(canvas, {onTurn, onWiggle, onPin, onStrandWhole(color, strand), onStrandBroken(color), onSolved});
   b.setLevel(level, {rots, pins, solved});  b.fit(maxW, maxH);  b.getState() -> {rots:[...], pins:[...]}
   b.hint(), b.reset(), b.applySolution(), b.illuminate(), b.skipIllumination(), b.illumElapsed()

   Illumination timeline (ms after illuminate()):
     0     every strand floods, gold flecks burst over the page
     150   the play grid fades out (a great-initial PNG, if supplied, starts to gild)
     450   the great initial's gold body sweeps in from the top-left
     650   twins' gilt brackets and emblems light
     700   gold sheen sweeps across the panel and its gilded frame
   Look: a cached panel (ART.makePanel: madder ground, gold filigree, gilded frame tracing the mask,
   ivy at the corners) under broad gold-edged enamel ribbons (ART.ribLayers). On pages without
   pigment marks, whole strands take ultramarine / emerald / crimson by strand; s.color (passed to the
   callbacks and the bells) stays the puzzle's own colour.
     ~2500 done (main.js writes the grumble, wakes the drollery and shows "Turn the page") */
(function () {
  'use strict';
  var P = window.Puzzle, ART = window.ART;
  var TURN_MS = 170, PRESS_MS = 450, DRAIN_MS = 420, ILLUM_MS = 2500;

  function easeOutBack(t) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }

  function Board(canvas, cb) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.cb = cb || {};
    this.M = null; this.S = 40; this.band = 16; this.dpr = 1;
    this.anim = {}; this.flood = {}; this.drain = {}; this.snap = {}; this.blinkAt = {}; this.wagAt = {};
    this.twinFx = {}; this.parts = []; this.letter = null; this.wig = {};
    this.locked = false; this.solved = false; this.illum = null;
    this.raf = 0; this.busyUntil = 0;
    this._bindInput();
    var self = this;
    this._loop = function () { self.raf = 0; self.draw(); if (now() < self.busyUntil || self.parts.length) self.kick(); };
    this._idle = setInterval(function () { self._idleBeasts(); }, 2600);
  }
  var B = Board.prototype;

  /* ---------- state ---------- */
  B.setLevel = function (level, saved) {
    saved = saved || {};
    var M = this.M = P.prepare(level);
    this.weave = P.weave(M);
    this.isInitial = !!level.initial;
    this.rots = (saved.rots && saved.rots.length === M.n) ? saved.rots.slice() : M.start.slice();
    this.pins = new Uint8Array(M.n);
    (saved.pins || []).forEach(function (c) { if (P.turnable(M.kinds[c])) this.pins[c] = 1; }, this);
    this.shown = this.rots.map(function (r) { return r * Math.PI / 2; });
    this.anim = {}; this.flood = {}; this.drain = {}; this.snap = {}; this.wig = {}; this.wagAt = {}; this.blinkAt = {};
    this.twinFx = {}; this.parts = [];
    this.solved = false; this.locked = false; this.illum = null;
    if (saved.solved) {
      this.rots = M.sol.slice(); this.shown = this.rots.map(function (r) { return r * Math.PI / 2; });
    }
    this.tr = P.trace(M, this.rots);
    var t0 = saved.solved ? -1e9 : now() - 1e6;   // whole strands from a reload show already flooded
    this._jewels();
    this.tr.strands.forEach(function (s) { if (s.whole) this.flood[s.key] = { t0: t0, origin: 0, color: s.color, disp: this._disp(s) }; }, this);
    if (this.tr.solved) { this.solved = true; this.locked = true; this.illum = { t0: -1e9 }; }
    this.letter = null;
    this.fit(this.fitW || 300, this.fitH || 300);
  };
  // pages without pigment marks: colour the solution's strands ultramarine / emerald / crimson so that
  // strands sharing a crossing (and, where easy, neighbouring strands) differ
  B._jewels = function () {
    var M = this.M, c; this.jewel = null;
    for (c = 0; c < M.n; c++) if (M.mark[c]) return;
    var st = P.trace(M, M.sol), cells = [], W = {}, JN = ['ultramarine', 'emerald', 'crimson'], rot = ((M.level && M.level.n) || 1) % 3;
    JN = JN.slice(rot).concat(JN.slice(0, rot));   // pages start on different jewels
    st.strands.forEach(function (s, si) { s.pieces.forEach(function (q) { (cells[q.c] = cells[q.c] || []).push(si); }); });
    function add(a, b, w) { if (a === b) return; var k = a < b ? a + ',' + b : b + ',' + a; W[k] = (W[k] || 0) + w; }
    for (c = 0; c < M.n; c++) {
      var L = cells[c]; if (!L) continue;
      for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) add(L[i], L[j], 3);
      for (var d = 1; d <= 2; d++) {
        var nc = P.neighbor(M, c, d); if (nc < 0 || !cells[nc]) continue;
        L.forEach(function (a) { cells[nc].forEach(function (b) { add(a, b, 1); }); });
      }
    }
    var order = st.strands.map(function (s, si) { return si; }).sort(function (a, b) { return st.strands[b].pieces.length - st.strands[a].pieces.length || a - b; });
    var col = [], used = [0, 0, 0];
    order.forEach(function (si) {
      var cost = [0, 0, 0];
      col.forEach(function (ci, sj) { if (ci === undefined) return; var w = W[si < sj ? si + ',' + sj : sj + ',' + si]; if (w) cost[ci] += w; });
      var best = 0;
      for (var k = 1; k < 3; k++) if (cost[k] < cost[best] || (cost[k] === cost[best] && used[k] < used[best])) best = k;
      col[si] = best; used[best]++;
    });
    this.jewel = { ps: st.pieceStrand, col: col.map(function (i) { return JN[i]; }) };
  };
  // the colour a whole strand is painted (a RIB name): its mark's pigment, else its jewel, else gold
  B._disp = function (s) {
    if (s.color !== 'gold' || !this.jewel) return s.color;
    var J = this.jewel, n = {}, best = 'gold', bn = 0;
    s.pieces.forEach(function (q) { var si = J.ps[q.c + ':' + q.p]; if (si === undefined) return; var nm = J.col[si]; n[nm] = (n[nm] || 0) + 1; if (n[nm] > bn) { bn = n[nm]; best = nm; } });
    return best;
  };
  B.getState = function () {
    var pins = [];
    for (var c = 0; c < this.M.n; c++) if (this.pins[c]) pins.push(c);
    return { rots: this.rots.slice(), pins: pins, solved: this.solved };
  };
  B.wrongCount = function () { return P.wrongCells(this.M, this.rots).length; };

  /* ---------- layout ---------- */
  B.fit = function (maxW, maxH) {
    this.fitW = maxW; this.fitH = maxH;
    if (!this.M) return;
    // the gilded frame (band) traces the mask, letters included; the ivy needs a little margin beyond it
    var w = this.M.w, h = this.M.h, S, s0 = Math.min(maxW / (w + 1.3), maxH / (h + 1.3));
    var band = this.isInitial ? clamp(Math.round(s0 * 0.3), 8, 28) : clamp(Math.round(s0 * 0.4), 10, 36);
    this.band = band; this.ivy = Math.round(band * 0.65); this.pad = band + this.ivy;
    S = Math.floor(Math.min((maxW - 2 * this.pad) / w, (maxH - 2 * this.pad) / h, 150));
    this.S = Math.max(16, S);
    this.panel = null;
    this.cssW = w * this.S + 2 * this.pad; this.cssH = h * this.S + 2 * this.pad;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.style.width = this.cssW + 'px'; this.cv.style.height = this.cssH + 'px';
    this.cv.width = Math.round(this.cssW * this.dpr); this.cv.height = Math.round(this.cssH * this.dpr);
    this._buildLetter();
    this.kick();
  };
  B._buildLetter = function () {
    var M = this.M;
    // the procedural letter is the panel itself; a supplied initial.<L> PNG still overlays and gilds
    if (!this.isInitial || !ART.has('initial.' + M.level.initial)) { this.letter = null; return; }
    var inm = M.kinds.map(function (k) { return k !== ' '; });
    var shape = ART.maskShape(M.w, M.h, inm, this.S, this.pad, this.pad);
    var cv = document.createElement('canvas');
    cv.width = this.cv.width; cv.height = this.cv.height;
    var g = cv.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ART.draw(g, 'initial.' + M.level.initial, this.pad, this.pad, M.w * this.S, M.h * this.S, 0,
      { path: shape.path, dots: shape.dots, S: this.S });
    this.letter = { cv: cv, shape: shape };
  };

  /* ---------- moves ---------- */
  B.members = function (c) { var g = this.M.groupOf[c]; return g >= 0 ? this.M.groups[g] : [c]; };
  B.rotate = function (c, steps, quiet) {
    var M = this.M; steps = steps === undefined ? 1 : steps;
    if (this.locked || !M) return false;
    if (!P.turnable(M.kinds[c]) || this.members(c).some(function (m) { return this.pins[m]; }, this)) {
      this.wiggle(c); if (!quiet && this.cb.onWiggle) this.cb.onWiggle(c); return false;
    }
    var t = now(), self = this;
    this.members(c).forEach(function (m) {
      var from = self._shownAngle(m, t);
      self.rots[m] = (self.rots[m] + steps) & 3;
      self.shown[m] += steps * Math.PI / 2;
      self.anim[m] = { from: from, to: self.shown[m], t0: t, dur: TURN_MS * (steps > 1 ? 1.4 : 1) };
    });
    var gi = M.groupOf[c];
    if (gi >= 0) { this.twinFx[gi] = t; this.busy(700); }
    this.busy(TURN_MS * 1.5);
    if (!quiet && this.cb.onTurn) this.cb.onTurn(c);
    this._refresh(c);
    return true;
  };
  B.wiggle = function (c) {
    var t = now(); this.members(c).forEach(function (m) { this.wig[m] = t; }, this);
    var gi = this.M.groupOf[c]; if (gi >= 0) this.twinFx[gi] = t;
    this.busy(650);
  };
  B.togglePin = function (c) {
    var M = this.M;
    if (this.locked || !M || !P.turnable(M.kinds[c])) { if (M) { this.wiggle(c); if (this.cb.onWiggle) this.cb.onWiggle(c); } return; }
    var v = this.pins[c] ? 0 : 1, self = this;
    this.members(c).forEach(function (m) { self.pins[m] = v; });
    var gi = M.groupOf[c]; if (gi >= 0) { this.twinFx[gi] = now(); this.busy(700); }
    this.kick();
    if (this.cb.onPin) this.cb.onPin(c, !!v);
  };
  B.hint = function () {
    var M = this.M; if (this.locked || !M) return false;
    var wrong = P.wrongCells(M, this.rots);
    if (!wrong.length) return false;
    // prefer an unpinned tile next to tiles already right, so the hint reads as progress
    var self = this, best = wrong[0], bestScore = -1;
    wrong.forEach(function (c) {
      var sc = self.pins[c] ? 0 : 2;
      for (var d = 0; d < 4; d++) { var nc = P.neighbor(M, c, d); if (nc >= 0 && P.isTile(M.kinds[nc]) && P.cellRight(M, self.rots, nc)) sc++; }
      if (sc > bestScore) { bestScore = sc; best = c; }
    });
    var mem = this.members(best), steps = 0;
    for (var s = 1; s < 4; s++) {
      if (mem.every(function (m) { return P.sameState(M.kinds[m], self.rots[m] + s, M.sol[m]); })) { steps = s; break; }
    }
    mem.forEach(function (m) { self.pins[m] = 0; });
    if (steps) this.rotate(best, steps, true);
    mem.forEach(function (m) { self.pins[m] = 1; });
    this.kick();
    if (this.cb.onTurn) this.cb.onTurn(best);
    if (this.cb.onPin) this.cb.onPin(best, true);
    return best;
  };
  B.reset = function () {
    if (!this.M) return;
    this.locked = false; this.solved = false; this.illum = null;
    var t = now(), self = this;
    this.M.turnables.forEach(function (c) {
      if (self.rots[c] !== self.M.start[c]) {
        var steps = (self.M.start[c] - self.rots[c] + 4) & 3;
        var from = self._shownAngle(c, t);
        self.rots[c] = self.M.start[c]; self.shown[c] += steps * Math.PI / 2;
        self.anim[c] = { from: from, to: self.shown[c], t0: t, dur: 260 };
      }
    });
    this.pins = new Uint8Array(this.M.n);
    this.busy(400);
    this._refresh(-1);
  };
  B.applySolution = function () {
    if (!this.M) return;
    var M = this.M, t = now(), self = this;
    this.locked = false;
    M.turnables.forEach(function (c) {
      if (!P.sameState(M.kinds[c], self.rots[c], M.sol[c])) {
        var steps = (M.sol[c] - self.rots[c] + 4) & 3;
        var from = self._shownAngle(c, t);
        self.rots[c] = M.sol[c]; self.shown[c] += steps * Math.PI / 2;
        self.anim[c] = { from: from, to: self.shown[c], t0: t, dur: 260 };
      }
    });
    this.busy(400);
    this._refresh(-1);
  };
  B.illuminate = function () {
    var t = now(), self = this, M = this.M;
    this.illum = { t0: t };
    this.tr.strands.forEach(function (s) { if (!self.flood[s.key]) self.flood[s.key] = { t0: t, origin: 0, color: s.color, disp: self._disp(s) }; });
    // a scatter of gold flecks over the whole page
    var tiles = [];
    for (var c = 0; c < M.n; c++) if (P.isTile(M.kinds[c])) tiles.push(c);
    for (var i = 0; i < 14 && tiles.length; i++) {
      var tc = tiles[Math.floor(Math.random() * tiles.length)];
      this._burst(tc, null, 5, 120 + i * 60);
    }
    this.busy(ILLUM_MS + 300);
  };
  B.skipIllumination = function () { if (this.illum && now() - this.illum.t0 < ILLUM_MS) { this.illum.t0 = now() - ILLUM_MS - 1; this.busy(60); } };
  B.illumElapsed = function () { return this.illum ? now() - this.illum.t0 : -1; };

  B._refresh = function (origin) {
    var M = this.M, tr = this.tr = P.trace(M, this.rots), t = now(), self = this;
    var nowWhole = {}, bursts = 0;
    tr.strands.forEach(function (s) {
      if (!s.whole) return;
      nowWhole[s.key] = 1;
      if (!self.flood[s.key]) {
        var oi = 0;
        if (origin >= 0) s.pieces.forEach(function (q, i) { if (q.c === origin) oi = i; });
        else oi = Math.floor(s.pieces.length / 2);
        var disp = self._disp(s);
        self.flood[s.key] = { t0: t, origin: oi, color: s.color, disp: disp };
        s.pieces.forEach(function (q) { delete self.drain[q.c + ':' + q.p]; });
        var heads = s.pieces.filter(function (q) { return M.beast[q.c] === 'h'; });
        heads.forEach(function (q) { self.snap[q.c] = t + s.pieces.length * 30; });
        s.pieces.forEach(function (q) { if (M.beast[q.c] === 't') self.wagAt[q.c] = t + s.pieces.length * 30; });
        if (bursts++ < 6) self._burst(s.pieces[oi].c, disp, 12, 0);
        self.busy(Math.min(1400, s.pieces.length * 70) + 900);
        if (self.cb.onStrandWhole) self.cb.onStrandWhole(s.color, s);
      }
    });
    Object.keys(this.flood).forEach(function (k) {
      if (nowWhole[k]) return;
      var f = self.flood[k];
      k.split(',').forEach(function (pk) { self.drain[pk] = { t0: t, color: f.color, disp: f.disp }; });
      delete self.flood[k];
      self.busy(DRAIN_MS + 50);
      if (self.cb.onStrandBroken) self.cb.onStrandBroken(f.color);
    });
    if (tr.solved && !this.solved) {
      this.solved = true; this.locked = true;
      if (this.cb.onSolved) setTimeout(function () { self.cb.onSolved(); }, 260);
    }
    this.kick();
  };

  /* ---------- particles: dust and gold flecks ---------- */
  B._burst = function (c, color, n, delay) {
    if (this.parts.length > 220) return;
    var M = this.M, S = this.S, cx = this.pad + (c % M.w + 0.5) * S, cy = this.pad + ((c / M.w | 0) + 0.5) * S, t = now() + (delay || 0);
    var pig = color ? ART.rib(color) : null;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = S * (0.35 + Math.random() * 0.75), gold = !pig || Math.random() < 0.55;
      this.parts.push({
        x: cx + Math.cos(a) * S * 0.1, y: cy + Math.sin(a) * S * 0.1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - S * 0.15,
        t0: t, life: 650 + Math.random() * 500, r: S * (gold ? 0.035 + Math.random() * 0.03 : 0.02 + Math.random() * 0.025),
        col: gold ? (Math.random() < 0.5 ? '#f3d27a' : '#d9a93e') : (Math.random() < 0.5 ? pig.light : pig.base), gold: gold,
        spin: Math.random() * 6.283
      });
    }
    this.kick();
  };
  B._drawParts = function (g, t) {
    var S = this.S, keep = [];
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i], k = (t - p.t0) / p.life;
      if (k >= 1) continue;
      keep.push(p);
      if (k < 0) continue;
      var e = 1 - (1 - k) * (1 - k), x = p.x + p.vx * e, y = p.y + p.vy * e + S * 0.35 * k * k;
      g.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      g.fillStyle = p.col;
      if (p.gold) {
        g.save(); g.translate(x, y); g.rotate(p.spin + k * 5);
        g.beginPath(); g.moveTo(0, -p.r * 1.4); g.lineTo(p.r * 0.7, 0); g.lineTo(0, p.r * 1.4); g.lineTo(-p.r * 0.7, 0); g.closePath(); g.fill();
        g.restore();
      } else { g.beginPath(); g.arc(x, y, p.r, 0, 6.283); g.fill(); }
    }
    g.globalAlpha = 1;
    this.parts = keep;
  };

  /* ---------- animation plumbing ---------- */
  B.busy = function (ms) { this.busyUntil = Math.max(this.busyUntil, now() + ms); this.kick(); };
  B.kick = function () { if (!this.raf) this.raf = requestAnimationFrame(this._loop); };
  B._shownAngle = function (c, t) {
    var a = this.anim[c];
    if (!a) return this.shown[c];
    var k = (t - a.t0) / a.dur;
    if (k >= 1) { delete this.anim[c]; return this.shown[c]; }
    return a.from + (a.to - a.from) * easeOutBack(clamp(k, 0, 1));
  };
  B._idleBeasts = function () {
    // whole beasts come alive now and then: blink, snap the jaw, flick the tail
    if (!this.M || document.hidden) return;
    var heads = [], tails = [], self = this;
    (this.tr ? this.tr.strands : []).forEach(function (s) {
      if (!s.whole || s.loop) return;
      s.pieces.forEach(function (q) { var b = self.M.beast[q.c]; if (b === 'h') heads.push(q.c); else if (b === 't') tails.push(q.c); });
    });
    var t = now();
    if (heads.length) {
      var c = heads[Math.floor(Math.random() * heads.length)];
      this.blinkAt[c] = t;
      if (Math.random() < 0.35) this.snap[c] = t + 260;
    }
    if (tails.length && Math.random() < 0.45) this.wagAt[tails[Math.floor(Math.random() * tails.length)]] = t + 100;
    if (heads.length || tails.length) this.busy(900);
  };

  /* ---------- geometry ---------- */
  function mid(d, h) { return [P.DX[d] * h, P.DY[d] * h]; }
  var EXT = 1;   // edge ends run a pixel past the tile edge (the tile clip keeps half of it) so tiles meet without seams
  function outer(e, h) { var m = mid(e, h); return [m[0] + P.DX[e] * EXT, m[1] + P.DY[e] * EXT]; }
  function piecePath(g, a, b, h, rev) {
    // path of a piece from endpoint a to endpoint b (b<0: centre). rev: draw b→a
    var oa, ob;
    if (b < 0) {
      oa = outer(a, h);
      if (rev) { g.moveTo(0, 0); g.lineTo(oa[0], oa[1]); } else { g.moveTo(oa[0], oa[1]); g.lineTo(0, 0); }
      return;
    }
    if (rev) { var tmp = a; a = b; b = tmp; }
    var ma = mid(a, h), mb = mid(b, h);
    oa = outer(a, h); ob = outer(b, h);
    if (P.opp(a) === b) { g.moveTo(oa[0], oa[1]); g.lineTo(ob[0], ob[1]); return; }
    var cx = ma[0] + mb[0], cy = ma[1] + mb[1];
    var aa = Math.atan2(ma[1] - cy, ma[0] - cx), ab = Math.atan2(mb[1] - cy, mb[0] - cx);
    var d = ab - aa; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
    g.moveTo(oa[0], oa[1]); g.lineTo(ma[0], ma[1]);
    g.arc(cx, cy, h, aa, ab, d < 0);
    g.lineTo(ob[0], ob[1]);
  }
  function pieceLen(a, b, h) { return b < 0 ? h : (P.opp(a) === b ? 2 * h : Math.PI * h / 2); }
  function pieceMid(a, b, h) {
    if (b < 0) return [mid(a, h)[0] * 0.5, mid(a, h)[1] * 0.5];
    if (P.opp(a) === b) return [0, 0];
    var ma = mid(a, h), mb = mid(b, h), cx = ma[0] + mb[0], cy = ma[1] + mb[1];
    var ang = Math.atan2(-cy, -cx);
    return [cx + Math.cos(ang) * h, cy + Math.sin(ang) * h];
  }

  /* ---------- drawing ---------- */
  B._pieceColor = function (c, p, t) {
    // -> {fill: pigment record or null, frac 0..1, fromEnd: 0|1 (endpoint the flood enters by), drain}
    var si = this.tr.pieceStrand[c + ':' + p], s = this.tr.strands[si], res = { fill: null, frac: 0, fromEnd: 0, drain: null };
    if (s && s.whole) {
      var f = this.flood[s.key];
      if (f) {
        var L = s.pieces.length, i = 0;
        for (var j = 0; j < L; j++) if (s.pieces[j].c === c && s.pieces[j].p === p) { i = j; break; }
        var fw = s.loop ? (i - f.origin + L) % L : Math.abs(i - f.origin), bw = s.loop ? (f.origin - i + L) % L : fw;
        var forward = s.loop ? fw <= bw : i >= f.origin, dist = Math.min(fw, bw);
        var maxD = s.loop ? Math.ceil(L / 2) : Math.max(f.origin, L - 1 - f.origin);
        var per = Math.min(70, 1100 / Math.max(1, maxD + 1));
        res.frac = clamp((t - f.t0) / per - dist, 0, 1);
        res.fill = ART.rib(f.disp || f.color);
        var from = s.pieces[i].from;
        res.fromEnd = (forward || i === f.origin) ? from : 1 - from;
        if (i === f.origin) res.both = true;
      }
    }
    var dr = this.drain[c + ':' + p];
    if (dr) {
      var k = (t - dr.t0) / DRAIN_MS;
      if (k >= 1) delete this.drain[c + ':' + p];
      else if (!res.fill || res.frac < 1) res.drain = { rib: ART.rib(dr.disp || dr.color), k: k };
    }
    return res;
  };

  // a broad enamel ribbon: hairline, gold edges, cream gouache body; the strand's colour floods along it
  B._strokeRibbon = function (g, path, len, w, col) {
    var bare = ART.RIB.bare, body = col.drain ? ART.ribMix(col.drain.rib, bare, col.drain.k) : bare;
    ART.ribLayers(g, function (gg) { path(gg, false); }, w, this.S, body, true, null, 0.22);
    if (col.fill && col.frac > 0) {
      var dash = null;
      if (col.frac < 1) dash = col.both ? [0, len * (1 - col.frac) / 2, len * col.frac, len] : [len * col.frac, len * 2];
      ART.ribLayers(g, function (gg) { path(gg, !col.both && col.fromEnd === 1); }, w, this.S, col.fill, false, dash, 0.2);
    }
  };
  B._edges = function () { var S = this.S; return { E: Math.max(1, S * 0.042), HL: Math.max(0.7, S * 0.012) }; };

  // the under ribbon of a crossing is cut short by a sliver of dark ground at the over ribbon's edges
  B._weaveShade = function (g, underP, h, rw, S, overPath) {
    var ed = this._edges(), half = rw / 2 + ed.E + ed.HL, horiz = underP === 1;
    g.save(); g.beginPath();
    if (horiz) g.rect(-h, -half, 2 * h, 2 * half); else g.rect(-half, -h, 2 * half, 2 * h);
    g.clip();
    var gr = horiz ? g.createLinearGradient(-h, 0, h, 0) : g.createLinearGradient(0, -h, 0, h);
    var a = (half + S * 0.03) / S, sh = 'rgba(40,8,4,';
    gr.addColorStop(0, sh + '0)'); gr.addColorStop(clamp(0.5 - a - 0.14, 0, 1), sh + '0)');
    gr.addColorStop(0.5 - a, sh + '0.22)'); gr.addColorStop(0.5 + a, sh + '0.22)');
    gr.addColorStop(clamp(0.5 + a + 0.14, 0, 1), sh + '0)'); gr.addColorStop(1, sh + '0)');
    g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h);
    g.strokeStyle = '#3a0c08'; g.lineWidth = 2 * half + 2 * Math.max(1.2, S * 0.03); g.lineCap = 'butt';
    g.beginPath(); overPath(g); g.stroke();
    g.restore();
  };

  B.draw = function () {
    var M = this.M, g = this.ctx; if (!M) return;
    var t = now(), S = this.S, h = S / 2, pad = this.pad, rw = S * 0.36, self = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);
    var e = this.illum ? t - this.illum.t0 : -1;
    function K(a, d) { return e < 0 ? 0 : clamp((e - a) / d, 0, 1); }
    var borderK = K(150, 900), letterK = K(450, 1100), twinK = K(650, 600), sheenK = K(700, 1000);
    // the panel: madder ground, filigree, gilded frame tracing the mask, ivy (drawn once, cached)
    if (!this.panel) {
      var inm = M.kinds.map(function (k) { return k !== ' '; }), rect = inm.every(Boolean);
      this.panel = ART.makePanel({ w: M.w, h: M.h, inm: inm, S: S, pad: pad, band: this.band, ivy: this.ivy,
        cssW: this.cssW, cssH: this.cssH, dpr: this.dpr, rect: rect, seed: (M.level.n || 7) * 31 + 7,
        round: rect ? 0 : S * (this.isInitial ? 0.3 : 0.18) });
    }
    g.drawImage(this.panel.cv, 0, 0, this.cssW, this.cssH);
    // the great initial's body: faint while the page is worked, gilded from the top-left on solving
    if (this.letter) {
      var L = this.letter;
      g.globalAlpha = 0.3; g.drawImage(L.cv, 0, 0, this.cssW, this.cssH); g.globalAlpha = 1;
      if (letterK > 0) {
        var edge = letterK * (this.cssW + this.cssH) * 1.02;
        g.save(); g.beginPath(); g.moveTo(-1, -1); g.lineTo(edge, -1); g.lineTo(-1, edge); g.closePath(); g.clip();
        g.drawImage(L.cv, 0, 0, this.cssW, this.cssH); g.restore();
        if (letterK < 1) {   // a bright burnish line rides the gilding edge
          g.save(); g.clip(L.shape.path, 'nonzero');
          g.strokeStyle = 'rgba(255,248,210,0.85)'; g.lineWidth = S * 0.35; g.lineCap = 'round';
          g.beginPath(); g.moveTo(edge - S * 0.2, -S); g.lineTo(-S, edge - S * 0.2); g.stroke();
          g.restore();
        }
      }
    }
    // fine gold play grid (fades out once solved)
    var gridA = this.solved ? 1 - borderK : 1;
    if (this.solved && !this.illum) gridA = 1;
    if (gridA > 0.01) {
      g.strokeStyle = 'rgba(222,178,88,' + (0.26 * gridA) + ')'; g.lineWidth = 0.6;
      for (var c = 0; c < M.n; c++) {
        if (M.kinds[c] === ' ') continue;
        g.strokeRect(pad + (c % M.w) * S + 0.5, pad + (c / M.w | 0) * S + 0.5, S - 1, S - 1);
      }
    }
    // gilded twins: corner brackets (clear of the ribbons, which cross mid-edges)
    var twinGlow = [];
    M.groups.forEach(function (grp, gi) {
      var fx = self.twinFx[gi], glow = 0;
      if (fx !== undefined) { var q = (t - fx) / 650; if (q < 1 && q >= 0) glow = Math.sin(q * Math.PI); else if (q >= 1) delete self.twinFx[gi]; }
      twinGlow[gi] = glow;
      grp.forEach(function (m) {
        ART.draw(g, 'twinFrame', pad + (m % M.w) * S, pad + (m / M.w | 0) * S, S, S, t, { glow: glow, lit: twinK, dark: true });
      });
    });
    // tiles
    for (c = 0; c < M.n; c++) {
      var k = M.kinds[c];
      if (!P.isTile(k)) {
        if (k === '.') {   // empty cell: a tiny gold dot-triangle on the ground
          g.fillStyle = 'rgba(232,192,104,0.6)';
          var ex = pad + (c % M.w + 0.5) * S, ey = pad + ((c / M.w | 0) + 0.5) * S;
          [[0, -1], [-0.9, 0.6], [0.9, 0.6]].forEach(function (o) { g.beginPath(); g.arc(ex + o[0] * S * 0.07, ey + o[1] * S * 0.07, S * 0.03, 0, 6.283); g.fill(); });
        }
        continue;
      }
      var cx = pad + (c % M.w + 0.5) * S, cy = pad + ((c / M.w | 0) + 0.5) * S;
      var ang = this._shownAngle(c, t);
      var w0 = this.wig[c];
      if (w0 !== undefined) {
        var wk = (t - w0) / 280;
        if (wk >= 1) delete this.wig[c]; else ang += Math.sin(wk * Math.PI * 3) * 0.09 * (1 - wk);
      }
      g.save(); g.translate(cx, cy); g.rotate(ang);
      g.beginPath(); g.rect(-h - 0.5, -h - 0.5, S + 1, S + 1); g.clip();   // half a pixel of overlap hides tile seams
      var pieces = P.KINDS[k].pieces, order = [0, 1].slice(0, pieces.length);
      if (k === 'x') { var over = this.weave[c] === 0 ? 0 : 1; order = [1 - over, over]; }
      for (var oi = 0; oi < order.length; oi++) {
        var p = order[oi], a = pieces[p][0], b = pieces[p][1];
        var col = this._pieceColor(c, p, t);
        var len = pieceLen(a, b, h);
        if (k === 'x' && oi === 1) {
          (function (a, b) { self._weaveShade(g, order[0], h, rw, S, function (gg) { piecePath(gg, a, b, h, false); }); })(a, b);
        }
        (function (a, b) {
          self._strokeRibbon(g, function (gg, rev) { piecePath(gg, a, b, h, rev); }, len, rw, col);
        })(a, b);
        // loose ends get a gold cap so they read as cut ribbon
        [a, b].forEach(function (en) {
          if (en < 0 || self.solved || self.tr.matched[c * 4 + P.rotDir(en, self.rots[c])]) return;
          var ed = self._edges(), m = mid(en, h), px = -P.DY[en], py = P.DX[en], hw = rw / 2 + ed.E + ed.HL;
          var cw = Math.max(1.4, S * 0.04), back = cw / 2 + ed.HL;
          var x0 = m[0] - P.DX[en] * back, y0 = m[1] - P.DY[en] * back;
          g.lineCap = 'butt';
          g.strokeStyle = ART.HAIR; g.lineWidth = cw + 2 * ed.HL;
          g.beginPath(); g.moveTo(x0 + px * hw, y0 + py * hw); g.lineTo(x0 - px * hw, y0 - py * hw); g.stroke();
          g.strokeStyle = ART.GILT; g.lineWidth = cw;
          g.beginPath(); g.moveTo(x0 + px * (hw - ed.HL), y0 + py * (hw - ed.HL)); g.lineTo(x0 - px * (hw - ed.HL), y0 - py * (hw - ed.HL)); g.stroke();
        });
        var rb = col.fill && col.frac >= 1 ? col.fill : (col.drain ? ART.ribMix(col.drain.rib, ART.RIB.bare, col.drain.k) : ART.RIB.bare), body = rb.base;
        if (b < 0) {
          var bs = M.beast[c];
          if (bs === 'h') {
            var sn = this.snap[c], snapK = 0, blk = 0;
            if (sn && t >= sn) { var q2 = (t - sn) / 420; if (q2 < 1) snapK = q2; else delete this.snap[c]; }
            if (sn && t < sn) this.busy(sn - t + 450);
            if (this.blinkAt[c]) { var bq = (t - this.blinkAt[c]) / 220; if (bq < 1) blk = Math.sin(bq * Math.PI); else delete this.blinkAt[c]; }
            ART.draw(g, 'beastHead', -h, -h, S, S, t, { body: body, snap: snapK, blink: blk, gilt: true });
          } else if (bs === 't') {
            var wa = this.wagAt[c], wagK = 0;
            if (wa !== undefined && t >= wa) { var q3 = (t - wa) / 700; if (q3 < 1) wagK = q3; else delete this.wagAt[c]; }
            if (wa !== undefined && t < wa) this.busy(wa - t + 750);
            ART.draw(g, 'beastTail', -h, -h, S, S, t, { body: body, wag: wagK, gilt: true, rw: 0.36 });
          } else ART.draw(g, 'knot', -h, -h, S, S, t, { body: body, rib: rb, rw: 0.36 });
        }
        if (M.mark[c]) {
          var pm = pieceMid(a, b, h), ms = S * 0.3;
          ART.draw(g, 'mark', pm[0] - ms / 2, pm[1] - ms / 2, ms, ms, t, { pigment: M.mark[c], gilt: true });
        }
      }
      g.restore();
      if (this.pins[c]) ART.draw(g, 'pin', cx + S * 0.18, cy - S * 0.42, S * 0.24, S * 0.24, t);
    }
    // twins' emblems sit in the top-left corner of each tile, above everything
    M.groups.forEach(function (grp, gi) {
      grp.forEach(function (m) {
        ART.draw(g, 'twinEmblem', pad + (m % M.w) * S + S * 0.04, pad + (m / M.w | 0) * S + S * 0.04, S * 0.2, S * 0.2, t,
          { kind: gi, glow: Math.max(twinGlow[gi], twinK * 0.6) });
      });
    });
    // faint glow where ends have met but the strand isn't whole yet
    if (!this.solved) {
      var tr = this.tr;
      for (c = 0; c < M.n; c++) {
        for (var d = 1; d <= 2; d++) {
          if (!tr.matched[c * 4 + d] || this.anim[c]) continue;
          var nc = P.neighbor(M, c, d); if (this.anim[nc]) continue;
          var si = this._strandAt(c, d);
          if (si < 0 || tr.strands[si].whole) continue;
          var gx = pad + (c % M.w + 0.5 + P.DX[d] * 0.5) * S, gy = pad + ((c / M.w | 0) + 0.5 + P.DY[d] * 0.5) * S;
          var rg = g.createRadialGradient(gx, gy, 0, gx, gy, S * 0.3);
          rg.addColorStop(0, 'rgba(255,224,140,0.5)'); rg.addColorStop(1, 'rgba(255,224,140,0)');
          g.fillStyle = rg; g.fillRect(gx - S * 0.3, gy - S * 0.3, S * 0.6, S * 0.6);
        }
      }
    }
    // gold sheen sweep across the panel during illumination, brightest as it crosses the gilded frame
    if (sheenK > 0 && sheenK < 1 && this.panel) {
      var sx = -this.cssW * 0.4 + sheenK * this.cssW * 1.8, sw = Math.max(60, S * 1.6), G = this.panel.geom;
      var sheen = function (al) {
        var sg = g.createLinearGradient(sx - sw, 0, sx + sw, self.cssH * 0.35);
        sg.addColorStop(0, 'rgba(255,240,180,0)'); sg.addColorStop(0.5, 'rgba(255,240,180,' + al + ')'); sg.addColorStop(1, 'rgba(255,240,180,0)');
        g.fillStyle = sg; g.fillRect(0, 0, self.cssW, self.cssH);
      };
      var outer = G.path(this.band), ring = new Path2D();
      ring.addPath(outer); ring.addPath(G.path(0));
      g.save(); g.clip(outer); sheen(0.24); g.clip(ring, 'evenodd'); sheen(0.5); g.restore();
    }
    if (this.parts.length) this._drawParts(g, t);
  };
  B._strandAt = function (c, d) {
    var ps = P.piecesOf(this.M.kinds[c], this.rots[c]);
    for (var p = 0; p < ps.length; p++) if (ps[p][0] === d || ps[p][1] === d) {
      var si = this.tr.pieceStrand[c + ':' + p]; return si === undefined ? -1 : si;
    }
    return -1;
  };

  /* ---------- input ---------- */
  B.cellAt = function (ex, ey) {
    var r = this.cv.getBoundingClientRect(), M = this.M; if (!M) return -1;
    var x = Math.floor((ex - r.left - this.pad) / this.S), y = Math.floor((ey - r.top - this.pad) / this.S);
    if (x < 0 || y < 0 || x >= M.w || y >= M.h) return -1;
    var c = y * M.w + x;
    return P.isTile(M.kinds[c]) ? c : -1;
  };
  B._bindInput = function () {
    var self = this, cv = this.cv, press = null;
    cv.style.touchAction = 'none';
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      if (!self.M) return;
      if (self.cb.onTouch) self.cb.onTouch();
      if (self.illum && now() - self.illum.t0 < ILLUM_MS) { if (self.cb.onSkip) self.cb.onSkip(); return; }
      var c = self.cellAt(e.clientX, e.clientY);
      if (c < 0) return;
      e.preventDefault();
      if (e.button === 2) { self.togglePin(c); return; }
      if (e.button !== 0) return;
      if (press) clearTimeout(press.timer);
      press = { c: c, x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
      press.timer = setTimeout(function () {
        if (press && !press.done) { press.done = true; self.togglePin(press.c); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {} }
      }, PRESS_MS);
    });
    cv.addEventListener('pointermove', function (e) {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) { clearTimeout(press.timer); press = null; }
    });
    function end(e, cancel) {
      if (!press || e.pointerId !== press.id) return;
      clearTimeout(press.timer);
      if (!press.done && !cancel) { var c = self.cellAt(e.clientX, e.clientY); if (c === press.c) self.rotate(c); }
      press = null;
    }
    cv.addEventListener('pointerup', function (e) { end(e, false); });
    cv.addEventListener('pointercancel', function (e) { end(e, true); });
    cv.addEventListener('pointerleave', function (e) { end(e, true); });
  };

  window.Board = Board;
})();
