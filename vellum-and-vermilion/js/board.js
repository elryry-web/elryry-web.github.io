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
   Look: a cached panel (ART.makePanel: the page's ground (ART.groundName: madder, lapis navy, deep
   verdigris, folium purple, or ink for the great initials), gold filigree, gilded frame tracing the mask,
   ivy at the corners) under broad gold-edged enamel ribbons (ART.ribLayers). On pages without
   pigment marks, whole strands take three jewels clear of the ground's hue by strand; on pages with marks,
   marked strands take their pigment and unmarked ones take jewels clear of the ground and of the marks'
   near-twins (never the old burnished gold); s.color (passed to the callbacks and the bells) stays the
   puzzle's own colour ('gold' for an unmarked strand).
     ~2500 done (main.js writes the grumble, wakes the drollery and shows "Turn the page") */
(function () {
  'use strict';
  var P = window.Puzzle, ART = window.ART;
  var TURN_MS = 170, PRESS_MS = 450, DRAIN_MS = 420, ILLUM_MS = 2500;
  // Book II: a crossing's lift-and-swap, a loose leaf's slide home, a strand's fade to dull and back,
  // the distance a finger moves a leaf before it is dragged rather than tapped
  var XFX_MS = 180, SLIDE_MS = 180, DULL_MS = 300, DRAG_PX = 12, CARET_MS = 250;

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
    this._base = null; this._still = null; this._onCv = false; this._rest = false;
    this._panels = []; this._warmGen = 0;
    this._loop = function () { self.raf = 0; self.draw(); if (now() < self.busyUntil || self.parts.length) self.kick(); };
    this._idle = setInterval(function () { self._idleBeasts(); }, 2600);
  }
  var B = Board.prototype;

  /* ---------- state ---------- */
  B.setLevel = function (level, saved) {
    saved = saved || {};
    var M = this.M = P.prepare(level);
    this.xfx = {}; this.slide = {}; this.drag = null; this.breakCells = []; this.caretAt = {}; this._leafPaths = {};
    if (M.b2) this._restore2(saved); else this.weave = P.weave(M);
    this.isInitial = !!level.initial;
    this.groundName = ART.groundName(level); this.ground = ART.ground(this.groundName);
    this.rots = (saved.rots && saved.rots.length === M.n) ? saved.rots.slice() : M.start.slice();
    this.pins = new Uint8Array(M.n);
    (saved.pins || []).forEach(function (c) { if (this._pinnable(c)) this.pins[c] = 1; }, this);
    this.shown = this.rots.map(function (r) { return r * Math.PI / 2; });
    this.anim = {}; this.flood = {}; this.drain = {}; this.snap = {}; this.wig = {}; this.wagAt = {}; this.blinkAt = {};
    this.twinFx = {}; this.parts = [];
    this.solved = false; this.locked = false; this.illum = null;
    this._base = null;
    if (saved.solved) {
      if (M.b2) {
        for (var sc = 0; sc < M.n; sc++) M.kinds[sc] = M.solKinds[sc];
        this.weave = Int8Array.from(M.solWeave); this._turnables();
      }
      this.rots = M.sol.slice(); this.shown = this.rots.map(function (r) { return r * Math.PI / 2; });
    }
    this.tr = P.trace(M, this.rots);
    var t0 = saved.solved ? -1e9 : now() - 1e6;   // whole strands from a reload show already flooded
    this._jewels();
    var br = M.b2 ? P.weaveBreaks(M, this.tr, this.rots, this.weave) : null, bc = {};
    this.tr.strands.forEach(function (s, si) {
      if (!s.whole) return;
      var f = this.flood[s.key] = { t0: t0, origin: 0, color: s.color, disp: this._disp(s) };
      if (br) { f.dull = br[si].length > 0; f.dt0 = -1e9; br[si].forEach(function (c) { bc[c] = 1; }); }
    }, this);
    this.breakCells = Object.keys(bc).map(Number);
    this.breakCells.forEach(function (c) { this.caretAt[c] = -1e9; }, this);
    if (M.b2 ? P.solved2(M, this.rots, this.weave, this.tr) : this.tr.solved) { this.solved = true; this.locked = true; this.illum = { t0: -1e9 }; }
    this.letter = null;
    this.fit(this.fitW || 300, this.fitH || 300);
  };
  /* Book II: the arrangement and weave as the player left them. saved.k (the kinds, cell by cell) is
     taken only if it differs from the start in the loose leaves alone, and holds the same leaves; saved.w
     holds '0' / '1' for each crossing. Inked crossings always keep their ink. */
  B._restore2 = function (saved) {
    var M = this.M, n = M.n, c;
    if (typeof saved.k === 'string' && saved.k.length === n) {
      var k = saved.k.split(''), ok = true, a = [], b = [];
      for (c = 0; c < n; c++) {
        if (M.isLoose[c]) { a.push(k[c]); b.push(M.startKinds[c]); } else if (k[c] !== M.startKinds[c]) ok = false;
      }
      if (ok && a.sort().join('') === b.sort().join('')) for (c = 0; c < n; c++) M.kinds[c] = k[c];
    }
    var w = typeof saved.w === 'string' && saved.w.length === n ? saved.w : null;
    this.weave = new Int8Array(n).fill(-1);
    for (c = 0; c < n; c++) {
      if (M.kinds[c] !== 'x') continue;
      if (M.inked[c]) this.weave[c] = M.solWeave[c];
      else if (w && (w[c] === '0' || w[c] === '1')) this.weave[c] = +w[c];
      else this.weave[c] = M.startWeave[c] >= 0 ? M.startWeave[c] : 0;
    }
    // each leaf keeps an identity (the cell it started on) for its deckled edge, wherever it is moved
    this.leafId = new Int16Array(n).fill(-1);
    M.loose.forEach(function (q) { this.leafId[q] = q; }, this);
    this._turnables();
  };
  // a leaf moved in or out changes which cells turn
  B._turnables = function () {
    var M = this.M; M.turnables = [];
    for (var c = 0; c < M.n; c++) if (P.turnable(M.kinds[c])) M.turnables.push(c);
  };
  // what a long-press can pin: a tile that turns (Book I); in Book II also a crossing that can be set,
  // and any loose leaf
  B._pinnable = function (c) {
    var M = this.M, k = M.kinds[c];
    if (P.turnable(k)) return true;
    return !!M.b2 && ((k === 'x' && !M.inked[c]) || !!M.isLoose[c]);
  };
  // the jewel each mark pigment would be mistaken for, so a page with that mark never gives an unmarked
  // strand its near-twin (orpiment's twin, the burnished gold, is no longer a strand colour at all)
  var TWIN = { vermilion: 'crimson', verdigris: 'emerald', lapis: 'ultramarine' };
  // the spare jewel (rose madder) for pages whose marks and ground leave fewer than two jewels; it is
  // of the madder ground's own hue, so never laid on it
  var SPARE = 'rose', SPARE_CLASH = { madder: 1 };
  // the mark pigment a gilt strand could be mistaken for: a page with an orpiment mark has no gilt
  var GILT_CLASH = { orpiment: 1 };
  // colour the solution's strands with jewels that contrast with the page's ground (of ultramarine /
  // emerald / crimson / amethyst) so that strands sharing a crossing (and, where easy, neighbouring
  // strands) differ. On pages without marks every strand takes a jewel (three that suit the ground); on
  // pages with marks the marked strands keep their pigments and only the unmarked ones take jewels, from
  // those that suit the ground and are no near-twin of the page's marks
  B._jewels = function () {
    var M = this.M, c, marks = {}, any = false, gn = this.groundName; this.jewel = null;
    for (c = 0; c < M.n; c++) if (M.mark[c]) { marks[M.mark[c]] = 1; any = true; }
    var st = P.trace(P.solModel(M), M.sol), cells = [], W = {}, JN, rot = ((M.level && M.level.n) || 1) % 3;
    if (!any) JN = ART.jewelsFor(gn);
    else {
      var clash = ((ART.GROUND[gn] || {}).clash) || [];
      JN = ['ultramarine', 'emerald', 'crimson', 'amethyst'].filter(function (j) {
        return clash.indexOf(j) < 0 && !Object.keys(marks).some(function (m) { return TWIN[m] === j; });
      });
      rot = JN.length ? rot % JN.length : 0;
    }
    JN = JN.slice(rot).concat(JN.slice(0, rot));   // pages start on different jewels
    var spareOk = any && !SPARE_CLASH[gn];
    if (spareOk && JN.length < 2) { JN.push(SPARE); spareOk = false; }
    // which of the solution's strands take a jewel (on a marked page, those without a pigment)
    var free = st.strands.map(function (s) { return !any || s.color === 'gold'; });
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
    var order = st.strands.map(function (s, si) { return si; }).filter(function (si) { return free[si]; })
      .sort(function (a, b) { return st.strands[b].pieces.length - st.strands[a].pieces.length || a - b; });
    if (!JN.length) return;
    function paint(K) {
      var col = [], used = [], clashes = 0, k;
      for (k = 0; k < K; k++) used[k] = 0;
      order.forEach(function (si) {
        var cost = used.map(function () { return 0; });
        col.forEach(function (ci, sj) { if (ci === undefined) return; var w = W[si < sj ? si + ',' + sj : sj + ',' + si]; if (w) cost[ci] += w; });
        var best = 0;
        for (k = 1; k < K; k++) if (cost[k] < cost[best] || (cost[k] === cost[best] && used[k] < used[best])) best = k;
        if (cost[best] >= 3) clashes++;   // shares a crossing with a strand of the same jewel
        col[si] = best; used[best]++;
      });
      return { col: col, clashes: clashes };
    }
    var res = paint(JN.length);
    if (res.clashes && spareOk) { JN.push(SPARE); res = paint(JN.length); }   // the spare only where it is needed
    var col = res.col.map(function (i) { return i === undefined ? null : JN[i]; });
    // one accent of gilt (ART.RIB.gilt): the longest unmarked strand (ties to the lower index), never on a page
    // with a warm mark it could be taken for
    if (order.length && !Object.keys(marks).some(function (m) { return GILT_CLASH[m]; })) col[order[0]] = 'gilt';
    this.jewel = { ps: st.pieceStrand, col: col, first: JN[0] };
  };
  // the colour a whole strand is painted (a RIB name): its mark's pigment, else its jewel (the jewel of
  // the solution strand it shares most pieces with, or the page's first jewel)
  B._disp = function (s) {
    if (s.color !== 'gold' || !this.jewel) return s.color;
    var J = this.jewel, n = {}, best = J.first, bn = 0;
    s.pieces.forEach(function (q) { var si = J.ps[q.c + ':' + q.p]; if (si === undefined) return; var nm = J.col[si]; if (!nm) return; n[nm] = (n[nm] || 0) + 1; if (n[nm] > bn) { bn = n[nm]; best = nm; } });
    return best;
  };
  B.getState = function () {
    var pins = [];
    for (var c = 0; c < this.M.n; c++) if (this.pins[c]) pins.push(c);
    var st = { rots: this.rots.slice(), pins: pins, solved: this.solved };
    if (this.M.b2) {   // Book II: the kinds as arranged, and each crossing's weave ('.' elsewhere)
      st.k = this.M.kinds.join('');
      st.w = Array.prototype.map.call(this.weave, function (v) { return v < 0 ? '.' : String(v); }).join('');
    }
    return st;
  };
  B.wrongCount = function () { return this.M.b2 ? P.wrong2(this.M, this.rots, this.weave).length : P.wrongCells(this.M, this.rots).length; };

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
    this.panel = null; this._base = null; this._still = null; this._onCv = false; this._leafPaths = {};
    this.cssW = w * this.S + 2 * this.pad; this.cssH = h * this.S + 2 * this.pad;
    // two device pixels per CSS pixel is as sharp as a phone shows these tiles; a third costs 2.25x the fill
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.style.width = this.cssW + 'px'; this.cv.style.height = this.cssH + 'px';
    this.cv.width = Math.round(this.cssW * this.dpr); this.cv.height = Math.round(this.cssH * this.dpr);
    this._buildLetter();
    this._warmBeasts();
    this.kick();
  };
  // the page's painted beasts in the strands' own colours (and the head's open jaw) are slow to build the
  // first time; make them in idle time after a page loads, so the floods and the illumination don't stall
  B._warmBeasts = function () {
    var self = this, M = this.M, gen = ++this._warmGen;
    if (this.mini || !M || this.S < 24 || !window.ART || !ART.draw) return;
    var jobs = [];
    P.trace(P.solModel(M), M.sol).strands.forEach(function (s) {
      var rb = null;
      s.pieces.forEach(function (q) {
        var b = M.beast[q.c]; if (b !== 'h' && b !== 't') return;
        rb = rb || ART.rib(self._disp(s));
        jobs.push({ c: q.c, b: b, rb: rb, snap: 0 });
        if (b === 'h') jobs.push({ c: q.c, b: b, rb: rb, snap: 0.5 });
      });
    });
    if (!jobs.length) return;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 60); }, g = null;
    (function step() {
      idle(function () {
        if (gen !== self._warmGen || !jobs.length || !self.M) return;
        var j = jobs.shift(), S = self.S, h = S / 2, d = self.dpr, q = ((M.sol[j.c] % 4) + 4) % 4;
        var cx = self.pad + (j.c % M.w + 0.5) * S, cy = self.pad + ((j.c / M.w | 0) + 0.5) * S;
        var body = j.rb.sh ? j.rb.bd : j.rb.base, paint = j.rb.sh ? j.rb : null;
        try {
          if (!g) { var sc = document.createElement('canvas'); sc.width = sc.height = 1; g = sc.getContext('2d'); }
          g.setTransform(d, 0, 0, d, 0, 0); g.translate(cx, cy); g.rotate(q * Math.PI / 2);
          if (j.b === 'h') ART.draw(g, 'beastHead', -h, -h, S, S, now(), { body: body, paint: paint, snap: j.snap, blink: 0, gilt: true, q: q, fill: j.rb, amt: 1, mini: false });
          else ART.draw(g, 'beastTail', -h, -h, S, S, now(), { body: body, paint: paint, wag: 0, gilt: true, rw: 0.36, q: q, fill: j.rb, amt: 1, mini: false });
        } catch (e) { /* only a warm-up */ }
        if (jobs.length) step();
      });
    })();
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
    if (M.b2 && M.kinds[c] === 'x') return this._flipX(c, quiet);
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
    if (this.locked || !M || !this._pinnable(c)) { if (M) { this.wiggle(c); if (this.cb.onWiggle) this.cb.onWiggle(c); } return; }
    var v = this.pins[c] ? 0 : 1, self = this;
    this.members(c).forEach(function (m) { self.pins[m] = v; });
    var gi = M.groupOf[c]; if (gi >= 0) { this.twinFx[gi] = now(); this.busy(700); }
    this.kick();
    if (this.cb.onPin) this.cb.onPin(c, !!v);
  };
  /* ---------- Book II moves ---------- */
  // a tap on a crossing that can be set swaps which ribbon lies on top (an inked or pinned one wiggles)
  B._flipX = function (c, quiet) {
    var M = this.M;
    if (M.inked[c] || this.pins[c]) { this.wiggle(c); if (!quiet && this.cb.onWiggle) this.cb.onWiggle(c); return false; }
    this.weave[c] ^= 1; this.xfx[c] = now();
    this.busy(XFX_MS + 80);
    if (!quiet && this.cb.onTurn) this.cb.onTurn(c);
    this._refresh(c);
    return true;
  };
  // swap the loose leaves at a and b (each with its turn and weave); both slide to their new places.
  // off: where the dragged leaf (from a) was let go, relative to a, so it slides on from there
  B._swap = function (a, b, off) {
    var M = this.M, S = this.S, t = now(), self = this;
    function sw(arr) { var v = arr[a]; arr[a] = arr[b]; arr[b] = v; }
    sw(M.kinds); sw(this.rots); sw(this.weave); sw(this.leafId);
    [a, b].forEach(function (c) { delete self.anim[c]; delete self.wig[c]; delete self.xfx[c]; self.shown[c] = self.rots[c] * Math.PI / 2; });
    var ax = a % M.w, ay = a / M.w | 0, bx = b % M.w, by = b / M.w | 0;
    this.slide[b] = { dx: (ax - bx) * S + (off ? off[0] : 0), dy: (ay - by) * S + (off ? off[1] : 0), t0: t, dur: SLIDE_MS };
    this.slide[a] = { dx: (bx - ax) * S, dy: (by - ay) * S, t0: t, dur: SLIDE_MS };
    this._turnables();
    this.busy(SLIDE_MS + 80);
  };
  B.swapLeaves = function (a, b, off, quiet) {
    var M = this.M;
    if (!M || !M.b2 || this.locked || a === b || !M.isLoose[a] || !M.isLoose[b] || this.pins[a] || this.pins[b]) return false;
    this._swap(a, b, off);
    if (!quiet && this.cb.onTurn) this.cb.onTurn(b);
    this._refresh(b);
    return true;
  };
  // set one cell as in the solution: its turn (and twins' turns) and, for a crossing, its weave
  B._settle = function (c) {
    var M = this.M, k = M.kinds[c], t = now(), self = this;
    if (P.turnable(k)) {
      var mem = this.members(c), steps = 0;
      for (var s = 1; s < 4; s++) if (mem.every(function (m) { return P.sameState(M.kinds[m], self.rots[m] + s, M.sol[m]); })) { steps = s; break; }
      if (!mem.every(function (m) { return P.sameState(M.kinds[m], self.rots[m], M.sol[m]); }) && steps) {
        mem.forEach(function (m) {
          var from = self._shownAngle(m, t);
          self.rots[m] = (self.rots[m] + steps) & 3; self.shown[m] += steps * Math.PI / 2;
          self.anim[m] = { from: from, to: self.shown[m], t0: t, dur: 260 };
        });
        var gi = M.groupOf[c]; if (gi >= 0) this.twinFx[gi] = t;
      }
    }
    if (k === 'x' && !M.inked[c] && this.weave[c] !== M.solWeave[c]) { this.weave[c] = M.solWeave[c]; this.xfx[c] = t; }
    this.busy(700);
  };
  // a hint: a leaf out of place is brought home first (taken from a place it doesn't belong either);
  // otherwise a wrong tile or crossing next to tiles already right is set. The hinted cell is pinned.
  B._hint2 = function () {
    var M = this.M, self = this, target = -1, from = -1, i, j;
    for (i = 0; i < M.loose.length && target < 0; i++) {
      var c = M.loose[i]; if (M.kinds[c] === M.solKinds[c]) continue;
      for (j = 0; j < M.loose.length; j++) {
        var d = M.loose[j];
        if (d !== c && M.kinds[d] === M.solKinds[c] && M.kinds[d] !== M.solKinds[d]) { target = c; from = d; break; }
      }
    }
    if (target >= 0) {
      this.pins[target] = 0; this.pins[from] = 0;
      this._swap(from, target, null);
    } else {
      var wrong = P.wrong2(M, this.rots, this.weave);
      if (!wrong.length) return false;
      var bestScore = -1;
      wrong.forEach(function (c) {
        var sc = self.pins[c] ? 0 : 2;
        for (var d = 0; d < 4; d++) { var nc = P.neighbor(M, c, d); if (nc >= 0 && P.isTile(M.kinds[nc]) && P.cellRight2(M, self.rots, self.weave, nc)) sc++; }
        if (sc > bestScore) { bestScore = sc; target = c; }
      });
    }
    var mem = this.members(target);
    this._settle(target);
    mem.forEach(function (m) { self.pins[m] = 1; });
    this._refresh(target);
    if (this.cb.onTurn) this.cb.onTurn(target);
    if (this.cb.onPin) this.cb.onPin(target, true);
    return target;
  };
  // Book II's reset and solution: the leaves go back (or home), each crossing to its start (or its weave)
  B._arrange = function (kinds, rots, weave) {
    var M = this.M, t = now(), self = this;
    for (var c = 0; c < M.n; c++) {
      if (!P.isTile(M.kinds[c])) continue;
      if (M.kinds[c] !== kinds[c]) {   // a leaf changes place: it is laid there directly
        M.kinds[c] = kinds[c]; this.rots[c] = rots[c]; this.shown[c] = rots[c] * Math.PI / 2; delete this.anim[c];
        this.slide[c] = { dx: 0, dy: -this.S * 0.12, t0: t, dur: 260 };
      } else if (P.turnable(M.kinds[c]) && !P.sameState(M.kinds[c], this.rots[c], rots[c])) {
        var steps = (rots[c] - this.rots[c] + 4) & 3, from = this._shownAngle(c, t);
        this.rots[c] = rots[c]; this.shown[c] += steps * Math.PI / 2;
        this.anim[c] = { from: from, to: this.shown[c], t0: t, dur: 260 };
      }
      if (M.kinds[c] === 'x') {
        var w = M.inked[c] ? M.solWeave[c] : (weave[c] >= 0 ? weave[c] : 0);
        if (this.weave[c] !== w) { this.weave[c] = w; this.xfx[c] = t; }
      } else this.weave[c] = -1;
    }
    M.loose.forEach(function (q) { self.leafId[q] = q; });
    this._turnables();
    this.busy(400);
  };
  B.hint = function () {
    var M = this.M; if (this.locked || !M) return false;
    if (M.b2) return this._hint2();
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
    this.drag = null;
    if (this.M.b2) this._arrange(this.M.startKinds, this.M.start, this.M.startWeave);
    else this.M.turnables.forEach(function (c) {
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
    this.locked = false; this.drag = null;
    if (M.b2) this._arrange(M.solKinds, M.sol, M.solWeave);
    else M.turnables.forEach(function (c) {
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
    // Book II: a whole strand whose weave breaks floods dull, with a caret on each breaking crossing
    var br = M.b2 ? P.weaveBreaks(M, tr, this.rots, this.weave) : null, bc = {};
    tr.strands.forEach(function (s, si) {
      if (!s.whole) return;
      nowWhole[s.key] = 1;
      var dull = !!(br && br[si].length);
      if (dull) br[si].forEach(function (c) { bc[c] = 1; });
      var f0 = self.flood[s.key];
      if (f0 && br && !!f0.dull !== dull) {   // the weave on a whole strand changed: fade to dull or burnish
        f0.dull = dull; f0.dt0 = t; self.busy(DULL_MS + 100);
        if (!dull) {
          if (bursts++ < 6) self._burst(origin >= 0 ? origin : s.pieces[0].c, f0.disp, 12, 0);
          if (self.cb.onStrandWhole) self.cb.onStrandWhole(s.color, s);
        }
      }
      if (!f0 && dull) {   // a dull flood: the colour runs in without its bell or gold
        var di = 0;
        if (origin >= 0) s.pieces.forEach(function (q, i) { if (q.c === origin) di = i; });
        else di = Math.floor(s.pieces.length / 2);
        self.flood[s.key] = { t0: t, origin: di, color: s.color, disp: self._disp(s), dull: true, dt0: -1e9 };
        s.pieces.forEach(function (q) { delete self.drain[q.c + ':' + q.p]; });
        self.busy(Math.min(1400, s.pieces.length * 70) + 300);
        return;
      }
      if (!self.flood[s.key]) {
        var oi = 0;
        if (origin >= 0) s.pieces.forEach(function (q, i) { if (q.c === origin) oi = i; });
        else oi = Math.floor(s.pieces.length / 2);
        var disp = self._disp(s);
        self.flood[s.key] = { t0: t, origin: oi, color: s.color, disp: disp };
        if (br) { self.flood[s.key].dull = false; self.flood[s.key].dt0 = -1e9; }
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
      if (self.cb.onStrandBroken && !f.dull) self.cb.onStrandBroken(f.color);
    });
    if (br) {
      var old = this.caretAt; this.caretAt = {};
      this.breakCells = Object.keys(bc).map(Number);
      this.breakCells.forEach(function (c) { self.caretAt[c] = old[c] !== undefined ? old[c] : t; });
      if (this.breakCells.length) this.busy(CARET_MS + 50);
    }
    if ((br ? P.solved2(M, this.rots, this.weave, tr) : tr.solved) && !this.solved) {
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
    // only while the page itself is in view: not under the book or its cover, not in a hidden tab
    if (!this.M || document.hidden || this.mini) return;
    if (window.Book && Book.mode && Book.mode() !== 'hidden') return;
    if (!this.cv.isConnected || this.cv.offsetParent === null) return;
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
  function outer(e, h, x) { var m = mid(e, h), E = EXT + (x || 0); return [m[0] + P.DX[e] * E, m[1] + P.DY[e] * E]; }
  function piecePath(g, a, b, h, rev, x) {
    // path of a piece from endpoint a to endpoint b (b<0: centre). rev: draw b→a.
    // x: run both ends this much further (the light-side strokes of a painted ribbon are shifted by up to it)
    var oa, ob;
    if (b < 0) {
      oa = outer(a, h, x); var z = x ? [-P.DX[a] * x, -P.DY[a] * x] : [0, 0];
      if (rev) { g.moveTo(z[0], z[1]); g.lineTo(oa[0], oa[1]); } else { g.moveTo(oa[0], oa[1]); g.lineTo(z[0], z[1]); }
      return;
    }
    if (rev) { var tmp = a; a = b; b = tmp; }
    var ma = mid(a, h), mb = mid(b, h);
    oa = outer(a, h, x); ob = outer(b, h, x);
    if (P.opp(a) === b) { g.moveTo(oa[0], oa[1]); g.lineTo(ob[0], ob[1]); return; }
    var cx = ma[0] + mb[0], cy = ma[1] + mb[1];
    var aa = Math.atan2(ma[1] - cy, ma[0] - cx), ab = Math.atan2(mb[1] - cy, mb[0] - cx);
    var d = ab - aa; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
    g.moveTo(oa[0], oa[1]); g.lineTo(ma[0], ma[1]);
    g.arc(cx, cy, h, aa, ab, d < 0);
    g.lineTo(ob[0], ob[1]);
  }
  // a span [s0, s1] (fractions of its length) of a piece's line offset d to its left (an arc: d further out)
  function offsetSpan(g, a, b, h, d, s0, s1) {
    var ma = mid(a, h), mb = b < 0 ? [0, 0] : mid(b, h);
    if (b < 0 || P.opp(a) === b) {
      var ux = mb[0] - ma[0], uy = mb[1] - ma[1], L = Math.hypot(ux, uy); ux /= L; uy /= L;
      g.moveTo(ma[0] + ux * L * s0 - uy * d, ma[1] + uy * L * s0 + ux * d);
      g.lineTo(ma[0] + ux * L * s1 - uy * d, ma[1] + uy * L * s1 + ux * d);
      return;
    }
    var cx = ma[0] + mb[0], cy = ma[1] + mb[1];
    var aa = Math.atan2(ma[1] - cy, ma[0] - cx), ab = Math.atan2(mb[1] - cy, mb[0] - cx);
    var dd = ab - aa; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd <= -Math.PI) dd += 2 * Math.PI;
    g.arc(cx, cy, Math.max(1, h + d), aa + dd * s0, aa + dd * s1, dd < 0);
  }
  var GEM = 0.58;   // a painted pigment gem's box, in tiles (the bezel itself is about three quarters of it)
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
        if (f.dull !== undefined) {   // Book II: a broken weave leaves the paint dull, half sunk into the vellum
          var dk = clamp((t - f.dt0) / DULL_MS, 0, 1); if (!f.dull) dk = 1 - dk;
          if (dk > 0) { res.fill = this._dullRib(f.disp || f.color, dk); res.dull = true; }
        }
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
  var DULL_MIX = 0.55;
  B._dullRib = function (name, dk) {
    if (dk >= 1) {
      var C = this._dullC = this._dullC || {};
      return C[name] || (C[name] = ART.ribMix(ART.rib(name), ART.RIB.bare, DULL_MIX));
    }
    return ART.ribMix(ART.rib(name), ART.RIB.bare, DULL_MIX * dk);
  };

  // a broad enamel ribbon: hairline, gold edges, cream gouache body; the strand's colour floods along it
  // fx: {ang, cell} for the painted modelling (see ART.ribLayers)
  B._strokeRibbon = function (g, path, len, w, col, fx) {
    var bare = ART.RIB.bare, body = col.drain ? ART.ribMix(col.drain.rib, bare, col.drain.k) : bare;
    var full = col.fill && col.frac >= 1 && !col.drain;
    fx = fx || {}; fx.mini = this.mini || this.S < 24; fx.len = len; fx.ext = Math.ceil(w * 0.17) + 1;
    // under a wholly painted piece only the gold edges of the bare ribbon are needed
    ART.ribLayers(g, function (gg, x) { path(gg, false, x); }, w, this.S, full ? null : body, true, null, 0.22, fx);
    if (col.fill && col.frac > 0) {
      var dash = null, rev = !col.both && col.fromEnd === 1;
      if (col.frac < 1) dash = col.both ? [0, len * (1 - col.frac) / 2, len * col.frac, len] : [len * col.frac, len * 2];
      ART.ribLayers(g, function (gg, x) { path(gg, rev, x); }, w, this.S, col.fill, false, dash, 0.2, fx);
    }
  };
  // here and there the paint stops just short of its outline and a sliver of vellum shows (fixed per piece)
  B._sliver = function (g, c, p, a, b, h, rw) {
    var n = (this.M.level && this.M.level.n) || 0;
    if (this.M.kinds[c] === 'x' || hsh(n, c, p * 5 + 1) > 0.34) return;
    var span = 0.28 + 0.34 * hsh(n, c, p * 5 + 2), s0 = (1 - span) * hsh(n, c, p * 5 + 3), s1 = s0 + span;
    var side = hsh(n, c, p * 5 + 4) < 0.5 ? -1 : 1, sw = Math.max(0.9, rw * 0.055), mid0 = (s0 + s1) / 2;
    g.save(); g.lineCap = 'round'; g.strokeStyle = '#e9dab3';
    g.globalAlpha = 0.6; g.lineWidth = sw * 0.6;
    g.beginPath(); offsetSpan(g, a, b, h, side * (rw / 2 - sw * 0.3), s0, s1); g.stroke();
    g.globalAlpha = 0.72; g.lineWidth = sw;
    g.beginPath(); offsetSpan(g, a, b, h, side * (rw / 2 - sw * 0.5), mid0 - span * 0.22, mid0 + span * 0.22); g.stroke();
    g.restore();
  };
  B._edges = function () { var S = this.S; return { E: Math.max(1, S * 0.042), HL: ART.hairOf(S, 1 / Math.max(1, this.dpr || 1)) }; };

  // the under ribbon of a crossing is cut short by a sliver of dark ground at the over ribbon's edges
  B._weaveShade = function (g, underP, h, rw, S, overPath) {
    var ed = this._edges(), half = rw / 2 + ed.E + ed.HL, horiz = underP === 1;
    g.save(); g.beginPath();
    if (horiz) g.rect(-h, -half, 2 * h, 2 * half); else g.rect(-half, -h, 2 * half, 2 * h);
    g.clip();
    var gr = horiz ? g.createLinearGradient(-h, 0, h, 0) : g.createLinearGradient(0, -h, 0, h);
    var a = (half + S * 0.03) / S, sh = 'rgba(' + this.ground.deep + ',';
    gr.addColorStop(0, sh + '0)'); gr.addColorStop(clamp(0.5 - a - 0.14, 0, 1), sh + '0)');
    gr.addColorStop(0.5 - a, sh + '0.36)'); gr.addColorStop(0.5 + a, sh + '0.36)');
    gr.addColorStop(clamp(0.5 + a + 0.14, 0, 1), sh + '0)'); gr.addColorStop(1, sh + '0)');
    g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h);
    g.strokeStyle = 'rgba(' + this.ground.deep + ',0.92)'; g.lineWidth = 2 * half + 2 * Math.max(1.5, S * 0.04); g.lineCap = 'butt';
    g.beginPath(); overPath(g); g.stroke();
    g.restore();
  };

  B.draw = function () {
    var M = this.M; if (!M) return;
    var t = now(), e = this.illum ? t - this.illum.t0 : -1;
    // a solved, illuminated page at rest is one still picture: blit it, and repaint only the tiles whose
    // beasts are blinking, snapping or flicking a tail
    if (this.solved && e >= ILLUM_MS && !this.mini && this._settled(t)) { this._drawStill(t); return; }
    this._still = null; this._onCv = false;
    this._drawFull(t);
  };
  function anyKey(o) { for (var k in o) return true; return false; }
  B._settled = function (t) {
    if (this.parts.length || anyKey(this.twinFx) || anyKey(this.anim) || anyKey(this.wig) || anyKey(this.drain)) return false;
    if (this.drag || anyKey(this.slide) || anyKey(this.xfx)) return false;
    for (var k in this.flood) if (t - this.flood[k].t0 < 1300) return false;   // floods run at most ~1.2 s
    return true;
  };
  B._drawStill = function (t) {
    var g = this.ctx, cv = this.cv, k;
    if (!this._still) {
      // the whole frame with every beast at rest (their pending moves are left for the patches below)
      this._rest = true;
      try { this._drawFull(t); } finally { this._rest = false; }
      var sc = document.createElement('canvas'); sc.width = cv.width; sc.height = cv.height;
      sc.getContext('2d').drawImage(cv, 0, 0); this._still = sc; this._onCv = true;
    } else if (!this._onCv) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this._still, 0, 0);
      this._onCv = true;
    }
    var dirty = {};
    for (k in this.blinkAt) dirty[k] = 1;
    for (k in this.snap) dirty[k] = 1;
    for (k in this.wagAt) dirty[k] = 1;
    // a tile whose animation ends this frame is drawn at rest, which puts the still picture back
    for (k in dirty) this._patch(+k, t);
  };
  // repaint one tile's own rest box exactly as the full frame would: the base, then every tile that can reach
  // into it (its neighbours' half-pixel overlaps and pins) in drawing order, then any twin emblems among them.
  // They are drawn unclipped on a scratch canvas and only the box is copied back, because a clip edge running
  // through a ribbon changes its antialiasing and would leave faint seams in the still picture
  B._patch = function (c, t) {
    var M = this.M, cv = this.cv, g = this.ctx, S = this.S, h = S / 2, d = this.dpr, self = this;
    var pc = this._pcv;
    if (!pc) pc = this._pcv = document.createElement('canvas');
    if (pc.width !== cv.width || pc.height !== cv.height) { pc.width = cv.width; pc.height = cv.height; }
    var q = pc.getContext('2d');
    var x = c % M.w, y = c / M.w | 0, cx = this.pad + (x + 0.5) * S, cy = this.pad + (y + 0.5) * S;
    // the box in device pixels, and the neighbourhood's (with room for pins and overlaps) to prepare
    var X0 = Math.floor((cx - h - 0.5) * d), Y0 = Math.floor((cy - h - 0.5) * d);
    var X1 = Math.ceil((cx + h + 0.5) * d), Y1 = Math.ceil((cy + h + 0.5) * d);
    var NX0 = Math.max(0, Math.floor((cx - 2 * S) * d)), NY0 = Math.max(0, Math.floor((cy - 2 * S) * d));
    var NX1 = Math.min(cv.width, Math.ceil((cx + 2 * S) * d)), NY1 = Math.min(cv.height, Math.ceil((cy + 2 * S) * d));
    q.setTransform(1, 0, 0, 1, 0, 0);
    q.clearRect(NX0, NY0, NX1 - NX0, NY1 - NY0);
    q.drawImage(this._base, NX0, NY0, NX1 - NX0, NY1 - NY0, NX0, NY0, NX1 - NX0, NY1 - NY0);
    q.setTransform(d, 0, 0, d, 0, 0);
    var near = [], xx, yy;
    for (yy = Math.max(0, y - 1); yy <= Math.min(M.h - 1, y + 1); yy++)
      for (xx = Math.max(0, x - 1); xx <= Math.min(M.w - 1, x + 1); xx++) near.push(yy * M.w + xx);
    near.forEach(function (n) { self._drawTile(q, n, t); });
    M.groups.forEach(function (grp, gi) {
      grp.forEach(function (m) { if (near.indexOf(m) >= 0) self._emblem(q, m, gi, t, 0.6); });
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(X0, Y0, X1 - X0, Y1 - Y0);
    g.drawImage(pc, X0, Y0, X1 - X0, Y1 - Y0, X0, Y0, X1 - X0, Y1 - Y0);
  };
  B._drawFull = function (t) {
    var M = this.M, g = this.ctx;
    var S = this.S, pad = this.pad, self = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);
    var e = this.illum ? t - this.illum.t0 : -1;
    function K(a, d) { return e < 0 ? 0 : clamp((e - a) / d, 0, 1); }
    var twinK = K(650, 600), sheenK = K(700, 1000);
    // everything under the tiles is still once a page is solved and its illumination done: keep a copy
    var quiet = this.solved && e >= ILLUM_MS && !Object.keys(this.twinFx).length;
    var twinGlow;
    if (quiet && this._base) {
      g.drawImage(this._base, 0, 0, this.cssW, this.cssH);
      twinGlow = M.groups.map(function () { return 0; });
    } else {
      twinGlow = this._drawBase(g, t, K);
      if (quiet && !this.mini) {
        var bc = document.createElement('canvas'); bc.width = this.cv.width; bc.height = this.cv.height;
        bc.getContext('2d').drawImage(this.cv, 0, 0); this._base = bc;
      }
    }
    // Book II: loose leaves on the move (sliding home, or under the finger) are drawn above the rest
    var fl = null, flList = [];
    if (M.b2) {
      fl = {};
      for (var sk in this.slide) { fl[sk] = 1; flList.push(+sk); }
      if (this.drag) { fl[this.drag.c] = 1; flList = flList.filter(function (q) { return q !== self.drag.c; }); flList.push(this.drag.c); }
    }
    for (var c = 0; c < M.n; c++) if (!fl || !fl[c]) this._drawTile(g, c, t);
    // twins' emblems sit in the top-left corner of each tile, above everything
    M.groups.forEach(function (grp, gi) {
      grp.forEach(function (m) { self._emblem(g, m, gi, t, Math.max(twinGlow[gi], twinK * 0.6)); });
    });
    if (M.b2) {
      if (this.drag && this.drag.target >= 0) {   // the leaf a drop would swap with
        var tc = this.drag.target, tx = pad + (tc % M.w) * S, ty = pad + (tc / M.w | 0) * S, ins = S * 0.05;
        g.fillStyle = 'rgba(255,224,140,0.16)'; g.fillRect(tx + ins, ty + ins, S - 2 * ins, S - 2 * ins);
        g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = Math.max(2, S * 0.055); g.lineJoin = 'round';
        g.strokeRect(tx + ins, ty + ins, S - 2 * ins, S - 2 * ins);
      }
      flList.forEach(function (q) { self._drawTile(g, q, t); });
      this._drawCarets(g, t);
    }
    // faint glow where ends have met but the strand isn't whole yet
    if (!this.solved) {
      var tr = this.tr;
      for (c = 0; c < M.n; c++) {
        for (var d = 1; d <= 2; d++) {
          if (!tr.matched[c * 4 + d] || this.anim[c] || (fl && fl[c])) continue;
          var nc = P.neighbor(M, c, d); if (this.anim[nc] || (fl && fl[nc])) continue;
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
  B._emblem = function (g, m, gi, t, glow) {
    var M = this.M, S = this.S;
    ART.draw(g, 'twinEmblem', this.pad + (m % M.w) * S + S * 0.085, this.pad + (m / M.w | 0) * S + S * 0.085, S * 0.15, S * 0.15, t, { kind: gi, glow: glow });
  };
  // Book II: the scribe's correction mark, a small upright vermilion caret on each crossing where a whole
  // strand's weave breaks (it fades in, and follows a crossing leaf as it moves)
  B._drawCarets = function (g, t) {
    var M = this.M, S = this.S, self = this;
    if (!this.breakCells.length || this.solved) return;
    g.save(); g.lineJoin = 'miter'; g.lineCap = 'round';
    this.breakCells.forEach(function (c) {
      var k = clamp((t - (self.caretAt[c] || 0)) / CARET_MS, 0, 1), off = self._offset(c, t);
      if (k < 1) self.busy(40);
      var x = self.pad + (c % M.w + 0.5) * S + (off ? off[0] : 0), y = self.pad + ((c / M.w | 0) + 0.5) * S + (off ? off[1] : 0);
      var u = S * (0.12 + 0.03 * (1 - k));
      g.globalAlpha = k;
      g.beginPath(); g.moveTo(x - u * 1.15, y + u * 0.75); g.lineTo(x, y - u * 0.95); g.lineTo(x + u * 1.15, y + u * 0.75);
      g.strokeStyle = 'rgba(38,14,6,0.88)'; g.lineWidth = Math.max(3, S * 0.1); g.stroke();
      g.strokeStyle = '#d8401f'; g.lineWidth = Math.max(1.6, S * 0.052); g.stroke();
    });
    g.restore(); g.globalAlpha = 1;
  };
  // where a loose leaf is drawn away from its cell: under the finger, or sliding home (null: in its cell)
  B._offset = function (c, t) {
    var d = this.drag;
    if (d && d.c === c) return [d.x - d.x0, d.y - d.y0];
    var s = this.slide[c]; if (!s) return null;
    var k = (t - s.t0) / s.dur;
    if (k >= 1) { delete this.slide[c]; return null; }
    var e = 1 - Math.pow(1 - clamp(k, 0, 1), 3);
    return [s.dx * (1 - e), s.dy * (1 - e)];
  };
  // a loose leaf's scrap of vellum: a square a little inside the tile with a torn (deckled) edge, the same
  // for a leaf wherever it goes (the hash is of the cell it started on)
  B._leafPath = function (id) {
    var S = this.S, key = id + ':' + S, p = this._leafPaths[key];
    if (p) return p;
    var n = (this.M.level && this.M.level.n) || 0, r = S / 2 - S * 0.06, steps = Math.max(8, Math.round(S / 4.5)), i = 0;
    // the tears are at least about a pixel deep, so the deckle stays crisp on 38 px tiles
    var amp = Math.max(1.1, S * 0.032), slide = S / steps * 0.3;
    p = new Path2D();
    // four sides, each a run of small irregular tears outward and inward
    var corners = [[-r, -r], [r, -r], [r, r], [-r, r]];
    for (var sd = 0; sd < 4; sd++) {
      var A = corners[sd], Bc = corners[(sd + 1) % 4], nx = (Bc[1] - A[1]) / (2 * r), ny = -(Bc[0] - A[0]) / (2 * r);
      var tx = (Bc[0] - A[0]) / (2 * r), ty = (Bc[1] - A[1]) / (2 * r);
      for (var j = 0; j < steps; j++, i++) {
        var f = j / steps, jit = (hsh(n * 101 + id, i, 7) - 0.5) * 2 * amp, sl = j ? (hsh(n * 101 + id, i, 11) - 0.5) * slide : 0;
        var x = A[0] + (Bc[0] - A[0]) * f + nx * jit + tx * sl, y = A[1] + (Bc[1] - A[1]) * f + ny * jit + ty * sl;
        if (!sd && !j) p.moveTo(x, y); else p.lineTo(x, y);
      }
    }
    p.closePath();
    this._leafPaths[key] = p;
    return p;
  };
  // the panel, the great initial, the play grid and the twins' brackets; returns each twin group's glow
  B._drawBase = function (g, t, K) {
    var M = this.M, S = this.S, pad = this.pad, self = this;
    var borderK = K(150, 900), letterK = K(450, 1100), twinK = K(650, 600);
    // the panel: the page's ground, filigree, gilded frame tracing the mask, ivy (drawn once per page and size)
    // (kept for this page and the last one, so going back and forth or laying out again doesn't repaint it;
    // the key counts the art that has arrived, as the ivy and border images change the panel)
    if (!this.panel) {
      var st = ART.status ? ART.status() : {}, nl = 0, nf = 0;
      for (var sk in st) { if (st[sk] === 1) nl++; else if (st[sk] === -1) nf++; }
      // (Book II's leaves move, so its key is the mask alone)
      var pk = [M.level.n, M.w, M.h, M.b2 ? M.kinds.map(function (k) { return k === ' ' ? ' ' : '#'; }).join('') : M.kinds.join(''), S, pad, this.band, this.ivy, this.cssW, this.cssH, this.dpr,
        this.isInitial, this.groundName, nl, nf].join('|');
      var hit = null, pi;
      for (pi = 0; pi < this._panels.length; pi++) if (this._panels[pi].key === pk) { hit = this._panels.splice(pi, 1)[0]; break; }
      if (!hit) {
        var inm = M.kinds.map(function (k) { return k !== ' '; }), rect = inm.every(Boolean);
        hit = { key: pk, panel: ART.makePanel({ w: M.w, h: M.h, inm: inm, S: S, pad: pad, band: this.band, ivy: this.ivy,
          cssW: this.cssW, cssH: this.cssH, dpr: this.dpr, rect: rect, seed: (M.level.n || 7) * 31 + 7, ground: this.groundName,
          round: rect ? 0 : S * (this.isInitial ? 0.3 : 0.18) }) };
      }
      this._panels.push(hit);
      while (this._panels.length > 2) {   // let an old panel's memory go now rather than at some later collection
        var old = this._panels.shift().panel;
        if (old && old.cv && old.cv !== hit.panel.cv) { old.cv.width = 0; old.cv.height = 0; }
      }
      this.panel = hit.panel;
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
    return twinGlow;
  };
  // one cell: an empty cell's gold dots, or a tile with its ribbons, beast or knot, mark and pin
  B._drawTile = function (g, c, t) {
    var M = this.M, S = this.S, h = S / 2, pad = this.pad, rw = S * 0.36, self = this, k = M.kinds[c];
    if (!P.isTile(k)) {
      if (k === '.') {   // empty cell: a tiny gold dot-triangle on the ground
        g.fillStyle = 'rgba(232,192,104,0.6)';
        var ex = pad + (c % M.w + 0.5) * S, ey = pad + ((c / M.w | 0) + 0.5) * S;
        [[0, -1], [-0.9, 0.6], [0.9, 0.6]].forEach(function (o) { g.beginPath(); g.arc(ex + o[0] * S * 0.07, ey + o[1] * S * 0.07, S * 0.03, 0, 6.283); g.fill(); });
      }
      return;
    }
    var cx = pad + (c % M.w + 0.5) * S, cy = pad + ((c / M.w | 0) + 0.5) * S;
    var off = M.b2 ? this._offset(c, t) : null;
    if (off) { cx += off[0]; cy += off[1]; }
    var ang = this._shownAngle(c, t);
    var w0 = this.wig[c];
    if (w0 !== undefined) {
      var wk = (t - w0) / 280;
      if (wk >= 1) delete this.wig[c]; else ang += Math.sin(wk * Math.PI * 3) * 0.09 * (1 - wk);
    }
    g.save(); g.translate(cx, cy);
    if (M.b2 && M.isLoose[c]) {
      // a loose leaf: an opaque scrap of cream vellum pasted on, a touch paler and cooler than the page. A soft
      // shadow falls down and right (deeper while it is lifted), and a thin umber line marks its torn edge
      var lp = this._leafPath(this.leafId[c] >= 0 ? this.leafId[c] : c), lifted = this.drag && this.drag.c === c;
      var px1 = 1 / this.dpr, lr = S / 2;
      g.save(); g.translate(S * (lifted ? 0.09 : 0.05), S * (lifted ? 0.12 : 0.07)); g.rotate(ang);
      g.fillStyle = lifted ? 'rgba(10,4,0,0.3)' : 'rgba(10,4,0,0.22)'; g.fill(lp); g.restore();
      g.save(); g.translate(S * (lifted ? 0.05 : 0.025), S * (lifted ? 0.07 : 0.035)); g.rotate(ang);
      g.fillStyle = 'rgba(14,6,2,0.5)'; g.fill(lp); g.restore();
      g.save(); g.rotate(ang);
      var lg = g.createLinearGradient(-lr, -lr, lr, lr);
      lg.addColorStop(0, 'rgba(242,232,208,0.93)'); lg.addColorStop(1, 'rgba(226,212,184,0.93)');
      g.fillStyle = lg; g.fill(lp);
      g.strokeStyle = 'rgba(112,82,48,0.85)'; g.lineWidth = Math.max(px1 * 1.2, S * 0.022); g.stroke(lp);
      g.restore();
    }
    var qa = ang / (Math.PI / 2), d = this.dpr;
    if (Math.abs(qa - Math.round(qa)) < 1e-4) {
      // a tile at rest: clip on whole device pixels, so each pixel at a join is painted by one tile alone
      // (a part-covered pixel would let the gold under a painted strand show through as a seam)
      var X0 = Math.floor((cx - h - 0.5) * d) / d - cx, Y0 = Math.floor((cy - h - 0.5) * d) / d - cy;
      var X1 = Math.ceil((cx + h + 0.5) * d) / d - cx, Y1 = Math.ceil((cy + h + 0.5) * d) / d - cy;
      g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip(); g.rotate(ang);
    } else {
      g.rotate(ang);
      g.beginPath(); g.rect(-h - 0.5, -h - 0.5, S + 1, S + 1); g.clip();   // half a pixel of overlap hides tile seams
    }
    var pieces = P.KINDS[k].pieces, order = [0, 1].slice(0, pieces.length);
    // Book II: a crossing being swapped lifts its top ribbon and lays the other over it; an inked
    // crossing (fixed) has its ribbons outlined in firm dark ink
    var lift = 0, inked = !!(M.b2 && k === 'x' && M.inked[c]);
    if (k === 'x') {
      var wv = this.weave[c], xf = M.b2 ? this.xfx[c] : undefined;
      if (xf !== undefined) {
        var xk = (t - xf) / XFX_MS;
        if (xk >= 1) delete this.xfx[c]; else { lift = Math.sin(clamp(xk, 0, 1) * Math.PI); if (xk < 0.5) wv = 1 - wv; }
      }
      var over = wv === 0 ? 0 : 1; order = [1 - over, over];
    }
    for (var oi = 0; oi < order.length; oi++) {
      var p = order[oi], a = pieces[p][0], b = pieces[p][1];
      var col = this._pieceColor(c, p, t);
      var len = pieceLen(a, b, h);
      if (k === 'x' && oi === 1) {
        (function (a, b) { self._weaveShade(g, order[0], h, rw, S, function (gg) { piecePath(gg, a, b, h, false); }); })(a, b);
      }
      var lifting = lift > 0 && oi === 1;
      if (lifting) {   // the top ribbon rises a little off the page, its shadow spreading under it
        g.save();
        g.strokeStyle = 'rgba(0,0,0,' + (0.3 * lift) + ')'; g.lineWidth = rw + S * 0.22 * lift; g.lineCap = 'butt';
        g.beginPath(); piecePath(g, a, b, h, false); g.stroke();
        g.scale(1 + 0.1 * lift, 1 + 0.1 * lift);
      }
      if (inked) {
        var ie = this._edges();
        g.strokeStyle = 'rgba(30,18,8,0.95)'; g.lineWidth = rw + 2 * (ie.E + ie.HL) + Math.max(2, S * 0.08); g.lineCap = 'butt';
        g.beginPath(); piecePath(g, a, b, h, false); g.stroke();
      }
      // a painted beast takes over from the ribbon short of the tile's centre
      // (and a painted knot takes over a little short of it)
      var bst = b < 0 && (M.beast[c] === 'h' || M.beast[c] === 't') ? ART.beastStop(M.beast[c] === 'h' ? 'head' : 'tail') : b < 0 ? ART.knotStop() : null;
      if (bst != null) { g.save(); g.beginPath(); g.rect(-h - 2, -h - 2, S + 4, (bst + 0.5) * S + 2); g.clip(); }
      (function (a, b) {
        self._strokeRibbon(g, function (gg, rev, x) { piecePath(gg, a, b, h, rev, x); }, len, rw, col, { ang: ang, cell: c, piece: p });
      })(a, b);
      if (col.fill && col.frac >= 1 && !col.drain && !col.dull && !this.mini && S >= 24) this._sliver(g, c, p, a, b, h, rw);
      if (bst != null) g.restore();
      if (lifting) g.restore();
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
      var rb = col.fill && col.frac >= 1 ? col.fill : (col.drain ? ART.ribMix(col.drain.rib, ART.RIB.bare, col.drain.k) : ART.RIB.bare);
      var body = rb.sh ? rb.bd : rb.base, paint = rb.sh ? rb : null;
      if (b < 0) {
        var bs = M.beast[c];
        // painted beasts: the strand's colour as it floods in or drains, and the tile's settled quarter turn
        // (kept through a turn, so the beast only flips upright once the tile has come to rest)
        var an0 = this.anim[c] ? this.anim[c].from : this.shown[c], bq0 = ((Math.round(an0 / (Math.PI / 2)) % 4) + 4) % 4;
        var bfill = col.fill && col.frac > 0 ? col.fill : col.drain ? col.drain.rib : null;
        var bamt = col.fill && col.frac > 0 ? col.frac : col.drain ? 1 - col.drain.k : 0;
        if (bs === 'h') {
          var sn = this.snap[c], snapK = 0, blk = 0;
          if (!this._rest) {   // (_rest: the still picture, every beast at rest and its pending moves kept)
            if (sn && t >= sn) { var q2 = (t - sn) / 420; if (q2 < 1) snapK = q2; else delete this.snap[c]; }
            if (sn && t < sn) this.busy(sn - t + 450);
            if (this.blinkAt[c]) { var bq = (t - this.blinkAt[c]) / 220; if (bq < 1) blk = Math.sin(bq * Math.PI); else delete this.blinkAt[c]; }
          }
          ART.draw(g, 'beastHead', -h, -h, S, S, t, { body: body, paint: paint, snap: snapK, blink: blk, gilt: true, q: bq0, fill: bfill, amt: bamt, mini: this.mini || S < 24 });
        } else if (bs === 't') {
          var wa = this.wagAt[c], wagK = 0;
          if (!this._rest) {
            if (wa !== undefined && t >= wa) { var q3 = (t - wa) / 700; if (q3 < 1) wagK = q3; else delete this.wagAt[c]; }
            if (wa !== undefined && t < wa) this.busy(wa - t + 750);
          }
          ART.draw(g, 'beastTail', -h, -h, S, S, t, { body: body, paint: paint, wag: wagK, gilt: true, rw: 0.36, q: bq0, fill: bfill, amt: bamt, mini: this.mini || S < 24 });
        } else ART.draw(g, 'knot', -h, -h, S, S, t, { body: body, rib: rb, rw: 0.36, mini: this.mini || S < 24, ang: ang });
      }
      if (M.mark[c]) {
        var pm = pieceMid(a, b, h), ms;
        if (ART.has('mark.' + M.mark[c])) {
          // the painted gem: larger, and kept upright (its light falls from the top-left) as the tile turns
          ms = S * GEM; var ca = Math.cos(ang), sa = Math.sin(ang), qx = pm[0] * ca - pm[1] * sa, qy = pm[0] * sa + pm[1] * ca;
          g.save(); g.rotate(-ang);
          ART.draw(g, 'mark', qx - ms / 2, qy - ms / 2, ms, ms, t, { pigment: M.mark[c] });
          g.restore();
        } else {
          ms = S * 0.3;
          ART.draw(g, 'mark', pm[0] - ms / 2, pm[1] - ms / 2, ms, ms, t, { pigment: M.mark[c], gilt: true });
        }
      }
    }
    g.restore();
    if (this.pins[c]) {
      // a painted nail is a square centred on its dome (about half the side), its point running down-left
      if (ART.has('pin')) ART.draw(g, 'pin', cx + S * 0.05, cy - S * 0.55, S * 0.5, S * 0.5, t);
      else ART.draw(g, 'pin', cx + S * 0.18, cy - S * 0.42, S * 0.24, S * 0.24, t);
    }
  };

  // a deterministic hash in [0, 1): where the paint falls short of the outline, per page, cell and piece
  function hsh(a, b, c) {
    var x = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263) ^ Math.imul(c + 13, 1274126177);
    x = Math.imul(x ^ (x >>> 15), 2246822519); x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
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
      if (!press || e.pointerId !== press.id) return;
      if (self.drag) { self._dragMove(e.clientX, e.clientY); return; }
      var dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      // Book II: a loose leaf moved more than a few pixels is picked up (a tap still turns it)
      if (dist > DRAG_PX && !press.done && self._canDrag(press.c)) {
        clearTimeout(press.timer);
        try { cv.setPointerCapture(e.pointerId); } catch (er) {}
        self._dragStart(press.c, press.x, press.y, e.clientX, e.clientY);
        return;
      }
      if (dist > 14) { clearTimeout(press.timer); press = null; }
    });
    function end(e, cancel) {
      if (!press || e.pointerId !== press.id) return;
      clearTimeout(press.timer);
      if (self.drag) { self._dragEnd(cancel ? -1 : self._dropAt(e.clientX, e.clientY)); press = null; return; }
      if (!press.done && !cancel) { var c = self.cellAt(e.clientX, e.clientY); if (c === press.c) self.rotate(c); }
      press = null;
    }
    cv.addEventListener('pointerup', function (e) { end(e, false); });
    cv.addEventListener('pointercancel', function (e) { end(e, true); });
    cv.addEventListener('pointerleave', function (e) { if (!self.drag) end(e, true); });
  };
  /* Book II: dragging a loose leaf onto another to swap them */
  B._canDrag = function (c) { var M = this.M; return !!(M && M.b2 && M.isLoose[c] && !this.pins[c] && !this.locked); };
  B._dragStart = function (c, x0, y0, x, y) {
    delete this.slide[c]; delete this.anim[c];
    this.shown[c] = this.rots[c] * Math.PI / 2;
    this.drag = { c: c, x0: x0, y0: y0, x: x, y: y, target: -1 };
    this._dragMove(x, y);
  };
  B._dragMove = function (x, y) {
    var d = this.drag; if (!d) return;
    d.x = x; d.y = y;
    var tc = this.cellAt(x, y);
    d.target = tc >= 0 && tc !== d.c && this.M.isLoose[tc] && !this.pins[tc] ? tc : -1;
    this.busy(150);
  };
  // the cell a leaf is dropped on (-1: back where it came from)
  B._dropAt = function (x, y) {
    var d = this.drag, tc = this.cellAt(x, y);
    return d && tc >= 0 && tc !== d.c && this.M.isLoose[tc] ? tc : -1;
  };
  B._dragEnd = function (target) {
    var d = this.drag; if (!d) return;
    this.drag = null;
    var off = [d.x - d.x0, d.y - d.y0];
    if (target >= 0 && this.swapLeaves(d.c, target, off)) return true;
    // dropped on nothing, on a pinned leaf or on a fixed tile: it slides back home
    this.slide[d.c] = { dx: off[0], dy: off[1], t0: now(), dur: SLIDE_MS };
    if (target >= 0) { this.wiggle(target); if (this.cb.onWiggle) this.cb.onWiggle(target); }
    this.busy(SLIDE_MS + 80);
    return false;
  };

  window.Board = Board;
})();
