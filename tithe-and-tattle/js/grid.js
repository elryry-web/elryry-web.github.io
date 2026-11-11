/* Tithe & Tattle: the staircase grid. Drawing (DPR-aware canvas) and input.
 *   var g = GRID.create(canvas, host)
 *   g.setPuzzle(puzzle); g.setMarks(marks)
 *   g.fit(availW, availH, opts) -> {w, h, cell}  sizes the canvas to fit (opts.maxCell, opts.font)
 *   g.onMark = function (rowId, colId, mode) {}   mode 'cycle' (tap) or 'yes' (long-press / right-click)
 *   g.setHint(cells | null), g.setWrong(cells | null), g.gild(), g.zoomBy(f), g.zoomFit(), g.draw()
 * Zoomed grids pan with one finger (taps still mark), pinch with two; the header and the row labels stay
 * pinned while the cells move. Ctrl+wheel zooms on desktop, the wheel pans a zoomed grid.
 */
(function () {
  'use strict';
  var INK = '#2b1d10', VERM = '#b23a26';
  var TINT = ['178,58,38', '52,86,140', '176,128,24', '50,112,80', '112,72,132'];
  var BANDINK = ['#7a2a1c', '#2c4670', '#6e4f0e', '#2a5a40', '#563a68'];
  var LABEL_FONT = '"EB Garamond", Garamond, Georgia, serif';
  var BAND_FONT = '"IM Fell English SC", "EB Garamond", Georgia, serif';

  // ---------------------------------------------------------------- short labels (≤ 8 characters)
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20 };
  var TITLE = { brother: 'Br', father: 'Fr', sir: 'Sir', dame: 'Dame', widow: 'Wid', abbot: 'Abbot', prior: 'Prior', master: 'Mr', mother: 'Mo', sister: 'Sr', saint: 'St', st: 'St' };
  var STOP = { the: 1, a: 1, an: 1, to: 1, of: 1, about: 1, at: 1, 'for': 1, 'with': 1, by: 1, 'in': 1, on: 1, from: 1, some: 1, his: 1, her: 1 };
  var DAYS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thurs', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  function trunc(s) { return s.length <= 8 ? s : s.slice(0, 7) + '.'; }
  function shortOptions(name) {
    var s = String(name).trim(), w = s.split(/\s+/), lw = w.map(function (x) { return x.toLowerCase().replace(/[^a-z']/g, ''); });
    var out = [];
    if (s.length <= 8) out.push(s);
    if (DAYS[lw[0]] && w.length === 1) out.push(DAYS[lw[0]]);
    if (NUM[lw[0]] !== undefined) {
      var rest = w.slice(1).join(' ');
      out.push(NUM[lw[0]] + ' ' + rest, NUM[lw[0]] + ' ' + (w[1] || ''), String(NUM[lw[0]]));
    }
    if (/^[A-Z]/.test(s)) {
      if (TITLE[lw[0]] && w[1]) out.push(TITLE[lw[0]] + ' ' + w[1], w[1]);
      out.push(w[0]);
      if (w.length > 1) { out.push(w[w.length - 1], w[0].charAt(0) + ' ' + w[w.length - 1]); }
    } else {
      var core = w.filter(function (x, i) { return !STOP[lw[i]]; });
      if (core.length) { out.push(core.join(' '), core[core.length - 1], core[0]); }
    }
    out.push(s);
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function makeShorts(items) {
    var opts = items.map(function (it) { return it.short ? [it.short] : shortOptions(it.name); });
    var res = opts.map(function (o) { return o.filter(function (x) { return x.length <= 8; })[0] || trunc(o[0]); });
    // resolve clashes by walking further down each clashing item's options
    for (var pass = 0; pass < 4; pass++) {
      var seen = {}, clash = false;
      res.forEach(function (r, i) { (seen[r] = seen[r] || []).push(i); });
      Object.keys(seen).forEach(function (k) {
        if (seen[k].length < 2) return;
        clash = true;
        seen[k].forEach(function (i) {
          var o = opts[i], at = o.indexOf(res[i]);
          var next = o.slice(at + 1).filter(function (x) { return x.length <= 8 && x !== k; })[0];
          res[i] = next || trunc(o[o.length - 1]).slice(0, 6) + (i + 1);
        });
      });
      if (!clash) break;
    }
    return res;
  }

  // ---------------------------------------------------------------- ink marks
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // a tapered pen stroke from (x0,y0) to (x1,y1), bent by `bend` (fraction of length)
  function penStroke(ctx, x0, y0, x1, y1, w, bend) {
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / L, ny = dx / L, cx = mx + nx * bend * L, cy = my + ny * bend * L;
    var N = 10, left = [], right = [];
    for (var k = 0; k <= N; k++) {
      var t = k / N, it = 1 - t;
      var px = it * it * x0 + 2 * it * t * cx + t * t * x1, py = it * it * y0 + 2 * it * t * cy + t * t * y1;
      var tx = 2 * it * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * it * (cy - y0) + 2 * t * (y1 - cy), tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var th = w * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * t)), 0.7)) / 2;
      left.push([px - ty / tl * th, py + tx / tl * th]); right.push([px + ty / tl * th, py - tx / tl * th]);
    }
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
    for (k = 1; k <= N; k++) ctx.lineTo(left[k][0], left[k][1]);
    for (k = N; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
    ctx.closePath(); ctx.fill();
  }
  function drawCross(ctx, cx, cy, s, seed, light) {
    var r = s * 0.27, j = function (k) { return (hash(seed, k) - 0.5) * s * 0.07; };
    var w = Math.max(light ? 1.1 : 1.5, s * (light ? 0.075 : 0.105));
    ctx.fillStyle = light ? 'rgba(60,40,22,0.36)' : INK;
    penStroke(ctx, cx - r + j(1), cy - r + j(2), cx + r + j(3), cy + r + j(4), w, (hash(seed, 9) - 0.5) * 0.12);
    penStroke(ctx, cx + r + j(5), cy - r + j(6), cx - r + j(7), cy + r + j(8), w * 0.92, (hash(seed, 10) - 0.5) * 0.12);
  }
  function lerpColor(a, b, t) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }).join(',') + ')'; }
  function drawDot(ctx, cx, cy, s, seed, gold) {
    var r = s * 0.25, rot = hash(seed, 3) * Math.PI;
    var base = lerpColor([178, 58, 38], [212, 168, 60], gold), dark = lerpColor([128, 34, 20], [150, 108, 28], gold);
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, gold > 0 ? lerpColor([205, 90, 60], [255, 238, 170], gold) : '#cd5a3c'); g.addColorStop(0.7, base); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * (1 + hash(seed, 4) * 0.06), r * (0.94 + hash(seed, 5) * 0.06), rot, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------- the grid object
  function Grid(canvas, host) {
    this.cv = canvas; this.host = host; this.ctx = canvas.getContext('2d');
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.hover = null; this.hint = null; this.wrong = null; this.gildT = 0;
    this.onMark = null; this.puzzle = null; this.marks = null; this.raf = 0;
    this.tip = host.querySelector('.gridtip');
    this.font = 15; this.cell = 24; this.W = 0; this.H = 0;
    this._bind();
  }
  Grid.prototype.setPuzzle = function (puzzle) {
    this.puzzle = puzzle;
    var L = LOGIC.gridLayout(puzzle), cats = puzzle.categories, idx = {};
    cats.forEach(function (c, i) { idx[c.id] = i; });
    this.n = cats[0].items.length; this.C = cats.length; this.N = this.C * this.n;
    this.top = L.top.map(function (id) { return idx[id]; });
    this.left = L.left.map(function (id) { return idx[id]; });
    var at = {}; L.blocks.forEach(function (b) { at[b.row + ',' + b.col] = b; });
    this.blocks = L.blocks; this.blockAt = at;
    this.shorts = cats.map(function (c) { return makeShorts(c.items); });
    this.zoom = 1; this.panX = this.panY = 0; this.hover = null; this.hint = null; this.wrong = null; this.gildT = 0;
  };
  Grid.prototype.setMarks = function (m) { this.marks = m; this.draw(); };
  Grid.prototype.setHint = function (cells) { this.hint = cells && cells.length ? cells : null; this.draw(); };
  Grid.prototype.setWrong = function (cells) { this.wrong = cells && cells.length ? cells : null; this.draw(); };
  Grid.prototype.measure = function (font) {
    var ctx = this.ctx, self = this, wTop = 0, wLeft = 0;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = font + 'px ' + LABEL_FONT;
    this.top.forEach(function (c) { self.shorts[c].forEach(function (s) { wTop = Math.max(wTop, ctx.measureText(s).width); }); });
    this.left.forEach(function (c) { self.shorts[c].forEach(function (s) { wLeft = Math.max(wLeft, ctx.measureText(s).width); }); });
    ctx.restore();
    var band = Math.round(font * 1.25);
    return { band: band, Lw: Math.ceil(band + wLeft + font * 0.9), Hh: Math.ceil(band + wTop + font * 0.9) };
  };
  Grid.prototype.fit = function (aw, ah, opts) {
    opts = opts || {};
    var cols = this.top.length * this.n, rows = this.left.length * this.n;
    var font = opts.font || 15, m = this.measure(font), maxCell = opts.maxCell || 40;
    var s = Math.min((aw - m.Lw - 3) / cols, (ah - m.Hh - 3) / rows, maxCell);
    if (s < font * 1.05 && font > 13) { font = 13; m = this.measure(font); s = Math.min((aw - m.Lw - 3) / cols, (ah - m.Hh - 3) / rows, maxCell); }
    s = Math.max(9, Math.floor(s * 4) / 4);
    this.font = font; this.band = m.band; this.Lw = m.Lw; this.Hh = m.Hh; this.cell = s;
    this.cols = cols; this.rows = rows;
    this.W = Math.ceil(m.Lw + cols * s + 3); this.H = Math.ceil(m.Hh + rows * s + 3);
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.maxZoom = Math.max(1, Math.max(2, 42 / s));
    this.zoom = Math.min(this.zoom, this.maxZoom); this.clampPan();
    this.draw();
    return { w: this.W, h: this.H, cell: s };
  };
  Grid.prototype.canZoom = function () { return this.cell < 30; };
  Grid.prototype.clampPan = function () {
    var vw = this.cols * this.cell, vh = this.rows * this.cell, s = this.cell * this.zoom;
    this.panX = Math.max(0, Math.min(this.panX, this.cols * s - vw));
    this.panY = Math.max(0, Math.min(this.panY, this.rows * s - vh));
  };
  Grid.prototype.zoomAt = function (z, px, py) {
    z = Math.max(1, Math.min(this.maxZoom, z));
    var s0 = this.cell * this.zoom, s1 = this.cell * z;
    var cx = (px - this.Lw + this.panX) / s0, cy = (py - this.Hh + this.panY) / s0;
    this.zoom = z; this.panX = cx * s1 - (px - this.Lw); this.panY = cy * s1 - (py - this.Hh);
    this.clampPan(); this.draw();
  };
  Grid.prototype.zoomBy = function (f) {
    var px = this.hover && this.hover.px != null ? this.hover.px : this.Lw + this.cols * this.cell / 2;
    var py = this.hover && this.hover.py != null ? this.hover.py : this.Hh + this.rows * this.cell / 2;
    this.zoomAt(this.zoom * f, px, py);
  };
  Grid.prototype.zoomFit = function () { this.zoom = 1; this.panX = this.panY = 0; this.draw(); };

  // hit test in CSS px of the canvas
  Grid.prototype.hit = function (x, y) {
    if (!this.puzzle) return null;
    var s = this.cell * this.zoom, n = this.n, cats = this.puzzle.categories;
    var inX = x >= this.Lw && x < this.Lw + this.cols * this.cell, inY = y >= this.Hh && y < this.Hh + this.rows * this.cell;
    var gx = (x - this.Lw + this.panX) / s, gy = (y - this.Hh + this.panY) / s;
    if (inX && inY) {
      var bc = Math.floor(gx / n), br = Math.floor(gy / n), j = Math.floor(gx) % n, i = Math.floor(gy) % n;
      var b = this.blockAt[br + ',' + bc];
      if (!b) return null;
      return { type: 'cell', br: br, bc: bc, i: i, j: j, rowCat: b.rowCatIndex, colCat: b.colCatIndex,
        rowId: cats[b.rowCatIndex].items[i].id, colId: cats[b.colCatIndex].items[j].id, px: x, py: y };
    }
    if (inX && y < this.Hh) {
      var c2 = Math.floor(gx / n), j2 = Math.floor(gx) % n, cat = this.top[c2];
      if (cat === undefined) return null;
      return y < this.band ? { type: 'cat', cat: cat, px: x, py: y } : { type: 'col', bc: c2, j: j2, cat: cat, item: cats[cat].items[j2], px: x, py: y };
    }
    if (inY && x < this.Lw) {
      var r2 = Math.floor(gy / n), i2 = Math.floor(gy) % n, cat2 = this.left[r2];
      if (cat2 === undefined) return null;
      return x < this.band ? { type: 'cat', cat: cat2, px: x, py: y } : { type: 'row', br: r2, i: i2, cat: cat2, item: cats[cat2].items[i2], px: x, py: y };
    }
    return null;
  };

  Grid.prototype.draw = function () {
    var self = this;
    if (this.raf) return;
    this.raf = requestAnimationFrame(function () { self.raf = 0; self._draw(); });
  };
  Grid.prototype.gild = function () { this.gildT = performance.now(); this.draw(); };

  Grid.prototype._draw = function () {
    if (!this.puzzle || !this.W) return;
    var ctx = this.ctx, dpr = this.dpr, n = this.n, s = this.cell * this.zoom, self = this;
    var cats = this.puzzle.categories, cells = this.marks ? this.marks.cells : null, N = this.N;
    var Lw = this.Lw, Hh = this.Hh, B = this.band, vw = this.cols * this.cell, vh = this.rows * this.cell;
    var now = performance.now(), animating = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    var hv = this.hover && (this.hover.type === 'cell' || this.hover.type === 'row' || this.hover.type === 'col') ? this.hover : null;
    var hvRow = hv && hv.type !== 'col' ? { br: hv.br, i: hv.i } : null, hvCol = hv && hv.type !== 'row' ? { bc: hv.bc, j: hv.j } : null;
    function px(v) { return Math.round(v * dpr) / dpr; }

    // ---- cells (panned both ways)
    ctx.save();
    ctx.beginPath(); ctx.rect(Lw, Hh, vw + 3, vh + 3); ctx.clip();
    ctx.translate(Lw - this.panX, Hh - this.panY);
    this.blocks.forEach(function (b) {
      var x0 = b.col * n * s, y0 = b.row * n * s;
      ctx.fillStyle = '#fbf4e2'; ctx.fillRect(x0, y0, n * s, n * s);
      if (hvRow && hvRow.br === b.row) { ctx.fillStyle = 'rgba(201,152,40,0.16)'; ctx.fillRect(x0, y0 + hvRow.i * s, n * s, s); }
      if (hvCol && hvCol.bc === b.col) { ctx.fillStyle = 'rgba(201,152,40,0.16)'; ctx.fillRect(x0 + hvCol.j * s, y0, s, n * s); }
      // fine rules
      ctx.strokeStyle = 'rgba(110,76,40,0.32)'; ctx.lineWidth = 1 / dpr * Math.max(1, Math.round(dpr * 0.8));
      ctx.beginPath();
      for (var k = 1; k < n; k++) { ctx.moveTo(px(x0 + k * s), y0); ctx.lineTo(px(x0 + k * s), y0 + n * s); ctx.moveTo(x0, px(y0 + k * s)); ctx.lineTo(x0 + n * s, px(y0 + k * s)); }
      ctx.stroke();
      if (!cells) return;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var u = b.rowCatIndex * n + i, v = b.colCatIndex * n + j, m = cells[u * N + v];
        if (!m) continue;
        var cx = x0 + (j + 0.5) * s, cy = y0 + (i + 0.5) * s, seed = u * 97 + v;
        if (m === 2) {
          var g = 0;
          if (self.gildT) {
            var dt = now - self.gildT - ((cx + cy) / (vw + vh + 1)) * 500 / Math.max(1, self.zoom);
            g = dt < 0 ? 0 : dt < 350 ? dt / 350 : dt < 1300 ? 1 : dt < 1900 ? 1 - (dt - 1300) / 600 : 0;
            if (now - self.gildT < 2500) animating = true;
          }
          drawDot(ctx, cx, cy, s, seed, g);
        } else drawCross(ctx, cx, cy, s, seed, m === 3);
      }
    });
    if (this.gildT && now - this.gildT >= 2500) this.gildT = 0;
    // heavy rules round each block
    ctx.strokeStyle = '#5a3d24'; ctx.lineWidth = 1.6;
    this.blocks.forEach(function (b) { ctx.strokeRect(px(b.col * n * s), px(b.row * n * s), n * s, n * s); });
    // hint targets (gold, breathing) and wrong marks (vermilion rings)
    function ring(list, color, w, inset) {
      (list || []).forEach(function (c) {
        var p = self.cellPos(c.rowItem, c.colItem); if (!p) return;
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.strokeRect(p.x * s / self.cell + inset, p.y * s / self.cell + inset, s - 2 * inset, s - 2 * inset);
      });
    }
    if (this.hint) {
      var a = 0.55 + 0.45 * Math.sin(now / 260);
      ctx.save(); ctx.shadowColor = 'rgba(212,160,40,0.9)'; ctx.shadowBlur = 6;
      ring(this.hint, 'rgba(196,140,24,' + a.toFixed(3) + ')', Math.max(2, s * 0.1), Math.max(1.5, s * 0.06));
      ctx.restore(); animating = true;
    }
    if (this.wrong) ring(this.wrong, 'rgba(178,40,24,0.9)', Math.max(2, s * 0.09), Math.max(1.5, s * 0.06));
    ctx.restore();

    // ---- column header (panned across)
    ctx.save();
    ctx.beginPath(); ctx.rect(Lw, 0, vw + 3, Hh); ctx.clip();
    ctx.translate(Lw - this.panX, 0);
    this.top.forEach(function (c, bc) {
      var x0 = bc * n * s, w = n * s;
      ctx.fillStyle = 'rgba(' + TINT[c % 5] + ',0.16)'; ctx.fillRect(x0, 0, w, B);
      ctx.fillStyle = 'rgba(' + TINT[c % 5] + ',0.06)'; ctx.fillRect(x0, B, w, Hh - B);
      self._bandText(cats[c].name, x0 + w / 2, B / 2, w - 4, BANDINK[c % 5], false);
      ctx.strokeStyle = 'rgba(110,76,40,0.22)'; ctx.lineWidth = 1 / dpr;
      ctx.beginPath(); for (var k = 1; k < n; k++) { ctx.moveTo(px(x0 + k * s), B + 2); ctx.lineTo(px(x0 + k * s), Hh); } ctx.stroke();
      ctx.font = self.font + 'px ' + LABEL_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (var j = 0; j < n; j++) {
        var lit = hvCol && hvCol.bc === bc && hvCol.j === j;
        if (lit) { ctx.fillStyle = 'rgba(201,152,40,0.2)'; ctx.fillRect(x0 + j * s, B, s, Hh - B); }
        ctx.save(); ctx.translate(x0 + (j + 0.5) * s, Hh - self.font * 0.45); ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = lit ? VERM : INK; ctx.fillText(self.shorts[c][j], 0, 1);
        ctx.restore();
      }
      ctx.strokeStyle = '#5a3d24'; ctx.lineWidth = 1.6; ctx.strokeRect(px(x0), 0.8, w, Hh + 2);
    });
    ctx.restore();

    // ---- row labels (panned down)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, Hh, Lw, vh + 3); ctx.clip();
    ctx.translate(0, Hh - this.panY);
    this.left.forEach(function (c, br) {
      var y0 = br * n * s, h = n * s;
      ctx.fillStyle = 'rgba(' + TINT[c % 5] + ',0.16)'; ctx.fillRect(0, y0, B, h);
      ctx.fillStyle = 'rgba(' + TINT[c % 5] + ',0.06)'; ctx.fillRect(B, y0, Lw - B, h);
      self._bandText(cats[c].name, B / 2, y0 + h / 2, h - 4, BANDINK[c % 5], true);
      ctx.strokeStyle = 'rgba(110,76,40,0.22)'; ctx.lineWidth = 1 / dpr;
      ctx.beginPath(); for (var k = 1; k < n; k++) { ctx.moveTo(B + 2, px(y0 + k * s)); ctx.lineTo(Lw, px(y0 + k * s)); } ctx.stroke();
      ctx.font = self.font + 'px ' + LABEL_FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var i = 0; i < n; i++) {
        var lit = hvRow && hvRow.br === br && hvRow.i === i;
        if (lit) { ctx.fillStyle = 'rgba(201,152,40,0.2)'; ctx.fillRect(B, y0 + i * s, Lw - B, s); }
        ctx.fillStyle = lit ? VERM : INK; ctx.fillText(self.shorts[c][i], Lw - self.font * 0.45, y0 + (i + 0.5) * s + 1);
      }
      ctx.strokeStyle = '#5a3d24'; ctx.lineWidth = 1.6; ctx.strokeRect(0.8, px(y0), Lw + 2, h);
    });
    ctx.restore();

    // zoomed: a faint shadow under the pinned panes
    if (this.zoom > 1.01) {
      ctx.fillStyle = 'rgba(60,40,20,0.10)';
      if (this.panY > 0) ctx.fillRect(Lw, Hh, vw, 2);
      if (this.panX > 0) ctx.fillRect(Lw, Hh, 2, vh);
    }
    if (animating) this.draw();
  };
  Grid.prototype._bandText = function (text, cx, cy, room, color, vertical) {
    var ctx = this.ctx, f = Math.round(this.band * 0.72);
    ctx.save(); ctx.translate(cx, cy); if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.font = f + 'px ' + BAND_FONT;
    var t = text;
    while (t.length > 1 && ctx.measureText(t).width > room) t = t.slice(0, -2) + '.';
    if (ctx.measureText(t).width <= room) ctx.fillText(t, 0, 1);
    ctx.restore();
  };
  // unzoomed position (CSS px relative to the cell area) of a pair
  Grid.prototype.cellPos = function (a, b) {
    var cats = this.puzzle.categories, n = this.n, ia = -1, ib = -1, ca = -1, cb = -1;
    cats.forEach(function (c, ci) { c.items.forEach(function (it, k) { if (it.id === a) { ca = ci; ia = k; } if (it.id === b) { cb = ci; ib = k; } }); });
    if (ca < 0 || cb < 0) return null;
    for (var q = 0; q < this.blocks.length; q++) {
      var bl = this.blocks[q];
      if (bl.rowCatIndex === ca && bl.colCatIndex === cb) return { x: (bl.col * n + ib) * this.cell, y: (bl.row * n + ia) * this.cell };
      if (bl.rowCatIndex === cb && bl.colCatIndex === ca) return { x: (bl.col * n + ia) * this.cell, y: (bl.row * n + ib) * this.cell };
    }
    return null;
  };
  // make sure a pair is in view when zoomed
  Grid.prototype.reveal = function (cells) {
    if (this.zoom <= 1.01 || !cells || !cells.length) return;
    var p = this.cellPos(cells[0].rowItem, cells[0].colItem); if (!p) return;
    var k = this.zoom, s = this.cell * k, x = p.x * k, y = p.y * k, vw = this.cols * this.cell, vh = this.rows * this.cell;
    if (x < this.panX || x + s > this.panX + vw) this.panX = x - vw / 2 + s / 2;
    if (y < this.panY || y + s > this.panY + vh) this.panY = y - vh / 2 + s / 2;
    this.clampPan(); this.draw();
  };

  // ---------------------------------------------------------------- tooltip
  Grid.prototype.showTip = function (h, touch) {
    var tip = this.tip; if (!tip) return;
    if (!h) { tip.classList.remove('on'); return; }
    var cats = this.puzzle.categories, html;
    if (h.type === 'cell') html = '<b>' + esc(cats[h.rowCat].items[h.i].name) + '</b><span>·</span><b>' + esc(cats[h.colCat].items[h.j].name) + '</b>';
    else if (h.type === 'cat') html = '<i>' + esc(cats[h.cat].name) + '</i>';
    else html = '<b>' + esc(h.item.name) + '</b> <i>' + esc(cats[h.cat].name.toLowerCase()) + '</i>';
    if (tip._html !== html) { tip.innerHTML = html; tip._html = html; }
    tip.classList.add('on');
    var hr = this.host.getBoundingClientRect(), cr = this.cv.getBoundingClientRect();
    var x = cr.left - hr.left + h.px, y = cr.top - hr.top + h.py;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var tx = Math.max(4, Math.min(hr.width - tw - 4, x - tw / 2));
    var ty = y - th - (touch ? 46 : 16);
    if (ty < 2) ty = y + (touch ? 40 : 22);
    tip.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- input
  Grid.prototype._bind = function () {
    var self = this, cv = this.cv, ptrs = {}, count = 0, press = null, pinch = null, tipTimer = 0;
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function setHover(h, touch) {
      var same = JSON.stringify(h && [h.type, h.br, h.bc, h.i, h.j, h.cat]) === JSON.stringify(self.hover && [self.hover.type, self.hover.br, self.hover.bc, self.hover.i, self.hover.j, self.hover.cat]);
      self.hover = h; if (!same) self.draw();
      self.showTip(h, touch);
    }
    function clearLater(ms) {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { self.hover = null; self.showTip(null); self.draw(); }, ms);
    }
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      if (!self.puzzle) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      var p = pos(e), touch = e.pointerType !== 'mouse';
      ptrs[e.pointerId] = p; count = Object.keys(ptrs).length;
      clearTimeout(tipTimer);
      if (count === 2) {
        if (press) { clearTimeout(press.timer); press = null; }
        var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: self.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        setHover(null);
        return;
      }
      if (count > 2) return;
      var h = self.hit(p.x, p.y);
      press = { id: e.pointerId, x0: p.x, y0: p.y, panX: self.panX, panY: self.panY, hit: h, moved: false, done: false, touch: touch };
      if (e.button === 2) {
        press.done = true;
        if (h && h.type === 'cell' && self.onMark) self.onMark(h.rowId, h.colId, 'yes');
      } else if (h && h.type === 'cell') {
        press.timer = setTimeout(function () {
          if (!press || press.moved || press.done) return;
          press.done = true;
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch (er) { /* ignore */ } }
          if (self.onMark) self.onMark(h.rowId, h.colId, 'yes');
        }, 400);
      }
      setHover(h, touch);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!self.puzzle) return;
      var p = pos(e);
      if (!ptrs[e.pointerId]) {   // a mouse hovering
        if (e.pointerType === 'mouse') setHover(self.hit(p.x, p.y), false);
        return;
      }
      ptrs[e.pointerId] = p;
      if (pinch && count >= 2) {
        var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var z = Math.max(1, Math.min(self.maxZoom, pinch.z0 * d / pinch.d0));
        var s0 = self.cell * self.zoom, s1 = self.cell * z;
        var gx = (pinch.mx - self.Lw + self.panX) / s0, gy = (pinch.my - self.Hh + self.panY) / s0;
        self.zoom = z; self.panX = gx * s1 - (mx - self.Lw); self.panY = gy * s1 - (my - self.Hh);
        pinch.mx = mx; pinch.my = my;
        self.clampPan(); self.draw();
        return;
      }
      if (!press || press.id !== e.pointerId) return;
      var dx = p.x - press.x0, dy = p.y - press.y0;
      if (!press.moved && dx * dx + dy * dy > 64) { press.moved = true; clearTimeout(press.timer); }
      if (press.moved) {
        if (self.zoom > 1.01) {
          self.panX = press.panX - dx; self.panY = press.panY - dy; self.clampPan(); self.draw();
          setHover(null);
        } else setHover(self.hit(p.x, p.y), press.touch);   // slide a finger to read the pairs
      }
    });
    function end(e, cancel) {
      if (!ptrs[e.pointerId]) return;
      delete ptrs[e.pointerId]; count = Object.keys(ptrs).length;
      if (pinch) { if (count < 2) pinch = null; press = null; return; }
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.timer);
      var pr = press; press = null;
      if (!cancel && !pr.moved && !pr.done && pr.hit && pr.hit.type === 'cell' && self.onMark) self.onMark(pr.hit.rowId, pr.hit.colId, 'cycle');
      if (pr.touch) clearLater(pr.hit && pr.hit.type !== 'cell' ? 1600 : 700);
    }
    cv.addEventListener('pointerup', function (e) { end(e, false); });
    cv.addEventListener('pointercancel', function (e) { end(e, true); });
    cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !ptrs[e.pointerId]) setHover(null); });
    cv.addEventListener('wheel', function (e) {
      if (!self.puzzle) return;
      var p = pos(e);
      if (e.ctrlKey) { e.preventDefault(); self.zoomAt(self.zoom * Math.exp(-e.deltaY * 0.004), p.x, p.y); return; }
      if (self.zoom > 1.01) {
        e.preventDefault();
        self.panX += e.deltaX || (e.shiftKey ? e.deltaY : 0); if (!e.shiftKey) self.panY += e.deltaY;
        self.clampPan(); self.draw(); setHover(self.hit(p.x, p.y), false);
      }
    }, { passive: false });
  };

  window.GRID = {
    create: function (canvas, host) { return new Grid(canvas, host); },
    makeShorts: makeShorts
  };
})();
