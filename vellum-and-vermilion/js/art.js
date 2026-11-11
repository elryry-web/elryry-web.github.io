/* Vellum & Vermilion — art slots.
   ART.draw(ctx, slot, x, y, w, h, t, opts) draws a named slot into the box (x,y,w,h) at time t (ms).
   opts.angle rotates the slot about the box centre (terminals face +y at angle 0).
   ART.load() reads optional art/manifest.json ({slot: "file.png"} or {slot: {file, stem, v}}); a loaded
   image replaces the procedural drawing for that slot (see HANDOFF.md for sizes and prompts). A drollery
   PNG keeps its own aspect: ART.draw fits it inside the box (opts.alignX/alignY, default bottom-centre),
   ART.meta(slot) gives {aspect, stem} (stem = x of the vine's foot on the bottom edge, 0..1 of width) and
   opts.faded draws the unpainted sepia underdrawing (ART.faded(slot)). Slots:
     page        parchment leaf (cached offscreen; opts.margin = outer-margin side 'right'|'left')
     border      knotwork frame; the box is the outer edge, opts.band = band thickness, opts.lit 0..1
     pin         gold nail
     knot        plain ribbon terminal (opts.body = ribbon colour)
     beastHead   Insular beast head in a whole tile box: neck enters from the top edge, snout toward +y
                 (opts.body, opts.snap 0..1 jaw snap, opts.blink 0..1)
     beastTail   curled, finned tail in a whole tile box, entering from the top (opts.body, opts.wag 0..1)
     mark        pigment lozenge (opts.pigment)
     twinFrame   gilt corner brackets of a gilded-twin tile (opts.glow 0..1 tap shimmer, opts.lit 0..1)
     twinEmblem  the twin group's sign (opts.kind 0..3, opts.glow)
     initial.<L> great-initial letter body (fallback draws from opts.path/dots/S, the mask outline)
     drollery.<id>  margin creatures, drawn in js/drolleries.js (snail rabbit cat fox owl fishbird monkey
                 dragon monk); opts.awake 0 asleep .. 1 awake, t drives the idle loop */
(function () {
  'use strict';
  var INK = '#2a1b10';
  var PIG = {
    lapis:     { base: '#2b56a6', dark: '#16326b', light: '#86a8e2', name: 'lapis blue' },
    vermilion: { base: '#d1432a', dark: '#862313', light: '#f2937a', name: 'vermilion' },
    verdigris: { base: '#2e8a68', dark: '#175640', light: '#7ccaa7', name: 'verdigris green' },
    orpiment:  { base: '#e2ad2b', dark: '#9a6f10', light: '#f8de8c', name: 'orpiment yellow' },
    gold:      { base: '#b88b3a', dark: '#77561c', light: '#ecd08a', name: 'burnished gold' },
    ink:       { base: '#5a4330', dark: '#2a1b10', light: '#9b8064', name: 'sepia' },
    bare:      { base: '#f6ebcf', dark: '#c8b087', light: '#fffaec', name: 'bare vellum' }
  };
  // enamel ribbon colours for the board (PIG above stays as is for drolleries, rule cards and the cover).
  // edge: the slightly darker gouache band along each side of a ribbon body
  var RIB = {
    ultramarine: { base: '#2a4caa', dark: '#172f72', light: '#6d8ede', edge: '#223f90', name: 'ultramarine' },
    emerald:     { base: '#1e7a48', dark: '#0f4b2b', light: '#5cb282', edge: '#18663c', name: 'emerald' },
    crimson:     { base: '#a51f3a', dark: '#681024', light: '#d8607a', edge: '#8c1931', name: 'crimson' },
    lapis:       { base: '#2f57b5', dark: '#1a3479', light: '#7395e0', edge: '#284a9b', name: 'lapis blue' },
    vermilion:   { base: '#d0472a', dark: '#862313', light: '#f29a7c', edge: '#b53c22', name: 'vermilion' },
    verdigris:   { base: '#22917a', dark: '#115a4b', light: '#6cc7b0', edge: '#1c7a67', name: 'verdigris green' },
    orpiment:    { base: '#e3ad2e', dark: '#9c6c0f', light: '#f8dc8a', edge: '#c99525', name: 'orpiment yellow' },
    gold:        { base: '#dcb55c', dark: '#8a6522', light: '#f7e6a8', edge: '#c39a45', name: 'burnished gold' },
    ink:         { base: '#5a4330', dark: '#2a1b10', light: '#9b8064', edge: '#4c3828', name: 'sepia' },
    bare:        { base: '#dcc9a0', dark: '#a98f62', light: '#f1e6c8', edge: '#c9b385', name: 'bare vellum' }
  };
  var HAIR = '#2a1508', GILT = '#c08f38', GILT_L = '#ecca6e', MADDER = '#6c1b15';
  var images = {}, metas = {}, fadedCache = {};
  var cache = {};

  function rand(seed) {
    var a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- parchment ---------- */
  function makePage(w, h, scale, margin) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
    var g = cv.getContext('2d');
    g.scale(scale, scale);
    var R = rand(1234);
    var grd = g.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grd.addColorStop(0, '#f1e3c1'); grd.addColorStop(0.6, '#e8d3a6'); grd.addColorStop(1, '#cfae76');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // mottling
    for (var i = 0; i < 70; i++) {
      var x = R() * w, y = R() * h, r = 20 + R() * Math.min(w, h) * 0.25;
      var m = g.createRadialGradient(x, y, 0, x, y, r);
      var dark = R() < 0.5;
      m.addColorStop(0, dark ? 'rgba(150,105,50,0.07)' : 'rgba(255,248,225,0.10)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // fibres
    var nf = Math.round(w * h / 140);
    for (i = 0; i < nf; i++) {
      x = R() * w; y = R() * h;
      var len = 3 + R() * 14, ang = (R() - 0.5) * 0.9 + (R() < 0.15 ? 1.57 : 0);
      g.strokeStyle = R() < 0.6 ? 'rgba(120,85,40,' + (0.04 + R() * 0.07) + ')' : 'rgba(255,250,235,' + (0.06 + R() * 0.08) + ')';
      g.lineWidth = 0.4 + R() * 0.6;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (R() - 0.5) * 3, y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * 3,
        x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    // speckles (hair follicles of the calf)
    for (i = 0; i < nf / 6; i++) {
      g.fillStyle = 'rgba(90,60,30,' + (0.05 + R() * 0.12) + ')';
      g.beginPath(); g.arc(R() * w, R() * h, 0.3 + R() * 0.7, 0, 6.283); g.fill();
    }
    // darker edges
    var e = Math.min(w, h) * 0.09;
    [['left', 0, 0, e, 0], ['right', w, 0, w - e, 0], ['top', 0, 0, 0, e], ['bottom', 0, h, 0, h - e]].forEach(function (s) {
      var lg = g.createLinearGradient(s[1], s[2], s[3], s[4]);
      lg.addColorStop(0, 'rgba(110,70,25,0.32)'); lg.addColorStop(1, 'rgba(110,70,25,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    });
    // margins, ruling and pricking
    var outer = margin === 'left' ? 'left' : 'right';
    var mL = Math.max(14, w * 0.06), mR = w - Math.max(14, w * 0.06);
    g.strokeStyle = 'rgba(150,60,40,0.12)'; g.lineWidth = 0.8;
    [mL, mL + 4, mR - 4, mR].forEach(function (xx) { g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, h); g.stroke(); });
    g.strokeStyle = 'rgba(120,80,50,0.08)';
    var step = 26;
    for (y = step * 1.5; y < h - step * 0.5; y += step) { g.beginPath(); g.moveTo(mL, y); g.lineTo(mR, y); g.stroke(); }
    var px = outer === 'right' ? w - Math.max(6, w * 0.022) : Math.max(6, w * 0.022);
    for (y = step * 1.5; y < h - step * 0.5; y += step) {
      g.fillStyle = 'rgba(60,35,15,0.45)';
      g.beginPath(); g.arc(px + (R() - 0.5) * 1.5, y, 1.1, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,245,220,0.5)';
      g.beginPath(); g.arc(px + 0.6, y + 0.8, 0.8, 0, 6.283); g.fill();
    }
    return cv;
  }

  /* ---------- ribbons ---------- */
  // stroke a path (built by `path(ctx)`) as an interlace ribbon
  function ribbon(ctx, path, width, body, outline) {
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = width + 2 * (outline || Math.max(1.2, width * 0.16));
    ctx.beginPath(); path(ctx); ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = width;
    ctx.beginPath(); path(ctx); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,252,238,0.45)'; ctx.lineWidth = Math.max(0.7, width * 0.12);
    ctx.beginPath(); path(ctx); ctx.stroke();
  }
  function rgbOf(c) {
    if (c.charAt(0) === '#') { var p = parseInt(c.slice(1), 16); return [p >> 16, p >> 8 & 255, p & 255]; }
    var m = c.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]];
  }
  function mix(a, b, t) {
    var pa = rgbOf(a), pb = rgbOf(b);
    return 'rgb(' + ((pa[0] + (pb[0] - pa[0]) * t) | 0) + ',' + ((pa[1] + (pb[1] - pa[1]) * t) | 0) + ',' + ((pa[2] + (pb[2] - pa[2]) * t) | 0) + ')';
  }

  /* ---------- the panel: mask outline geometry, madder ground with gold filigree, gilded frame, ivy ---------- */
  // frameGeom: the mask's boundary loops (pixels), with outward offset paths for the frame rules.
  // rr: corner radius at the mask edge (0 = square corners, as on a rectangular page)
  function frameGeom(w, h, inm, S, ox, oy, rr) {
    var V = maskLoops(w, h, inm).map(function (L) {
      var n = L.length;
      return L.map(function (p, i) {
        var a = L[(i - 1 + n) % n], b = L[(i + 1) % n];
        var u1 = [Math.sign(p[0] - a[0]), Math.sign(p[1] - a[1])], u2 = [Math.sign(b[0] - p[0]), Math.sign(b[1] - p[1])];
        return { x: ox + p[0] * S, y: oy + p[1] * S, nx: u1[1] + u2[1], ny: -u1[0] - u2[0], convex: u1[0] * u2[1] - u1[1] * u2[0] > 0, u1: u1, u2: u2 };
      });
    });
    function pts(L, off) { return L.map(function (v) { return [v.x + v.nx * off, v.y + v.ny * off]; }); }
    function rad(v, off) { return rr > 0 ? (v.convex ? rr + off : Math.max(0, rr - off)) : 0; }
    function path(off) {
      var p = new Path2D();
      V.forEach(function (L) {
        var Q = pts(L, off), n = Q.length;
        p.moveTo((Q[n - 1][0] + Q[0][0]) / 2, (Q[n - 1][1] + Q[0][1]) / 2);
        for (var i = 0; i < n; i++) {
          var a = Q[i], b = Q[(i + 1) % n], pr = Q[(i - 1 + n) % n];
          var r = Math.min(rad(L[i], off), Math.hypot(a[0] - pr[0], a[1] - pr[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
          if (r > 0.05) p.arcTo(a[0], a[1], b[0], b[1], r); else p.lineTo(a[0], a[1]);
        }
        p.closePath();
      });
      return p;
    }
    // evenly spaced points along the outline at offset off (for the cream dots of the red band)
    function dots(off, sp) {
      var out = [];
      V.forEach(function (L) {
        var Q = pts(L, off), n = Q.length;
        for (var i = 0; i < n; i++) {
          var a = Q[i], b = Q[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          var ta = L[i].convex ? rad(L[i], off) : sp * 0.7, tb = L[(i + 1) % n].convex ? rad(L[(i + 1) % n], off) : sp * 0.7;
          var use = len - ta - tb; if (use < 0) continue;
          var cnt = Math.max(1, Math.round(use / sp));
          for (var k = 0; k <= cnt; k++) { var s = (ta + use * k / cnt) / len; out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]); }
          if (L[i].convex && rad(L[i], off) > 0) { var r = rad(L[i], off) * (1 - Math.SQRT1_2); out.push([a[0] - L[i].nx * r, a[1] - L[i].ny * r]); }
        }
      });
      var kept = [];
      out.forEach(function (p) { if (!kept.some(function (q) { return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < sp * 0.55; })) kept.push(p); });
      return kept;
    }
    // the four outermost convex corners (one per diagonal), where the ivy grows
    function corners(off) {
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (d) {
        var best = null, bs = -1e9;
        V.forEach(function (L) { L.forEach(function (v) { if (!v.convex) return; var s = d[0] * v.x + d[1] * v.y; if (s > bs + 0.5) { bs = s; best = v; } }); });
        return best && { x: best.x + best.nx * off, y: best.y + best.ny * off, u1: best.u1, u2: best.u2, nx: best.nx, ny: best.ny };
      }).filter(Boolean);
    }
    return { loops: V, path: path, dots: dots, corners: corners };
  }

  // fine burnished-gold spirals and scrolls filling a box (the caller clips to the panel)
  function filigree(ctx, x, y, w, h, S, R, lw) {
    var sp = S * 0.27, nx = Math.ceil(w / sp) + 1, ny = Math.ceil(h / sp) + 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var cx = x + (i + (j % 2) * 0.5 + (R() - 0.5) * 0.5) * sp, cy = y + (j + (R() - 0.5) * 0.5) * sp * 0.92;
      var r = sp * (0.2 + R() * 0.3), turns = 2 + R() * 1.2, dir = R() < 0.5 ? 1 : -1, a0 = R() * 6.283, N = Math.round(10 + turns * 9);
      ctx.strokeStyle = R() < 0.25 ? '#e8c46c' : '#c99a45';
      ctx.globalAlpha = 0.62 + R() * 0.3;
      ctx.beginPath();
      var px = 0, py = 0, ang = 0;
      for (var k = 0; k <= N; k++) {
        var q = 0.1 + 0.9 * k / N; ang = a0 + dir * q * turns * 6.283;
        px = cx + Math.cos(ang) * r * q; py = cy + Math.sin(ang) * r * q;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      // a scroll tail flicking off the spiral the other way
      var head = ang + dir * Math.PI / 2, st = r * 0.16, tl = 5 + Math.floor(R() * 5);
      for (k = 0; k < tl; k++) { head -= dir * (0.22 + R() * 0.08); px += Math.cos(head) * st; py += Math.sin(head) * st; ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      if (R() < 0.45) {   // three dots or a little leaf at the tail
        if (R() < 0.6) for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px + Math.cos(head + k * 2.1) * lw * 2.2, py + Math.sin(head + k * 2.1) * lw * 2.2, lw * 0.8, 0, 6.283); ctx.fill(); }
        else { ctx.save(); ctx.translate(px, py); ctx.rotate(head); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.2, -r * 0.16, r * 0.42, 0); ctx.quadraticCurveTo(r * 0.2, r * 0.16, 0, 0); ctx.fill(); ctx.restore(); }
      }
    }
    // a powder of gold specks between
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#d8ad55';
    var nd = Math.round(w * h / (S * S) * 10);
    for (i = 0; i < nd; i++) { ctx.beginPath(); ctx.arc(x + R() * w, y + R() * h, lw * (0.5 + R() * 0.5), 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function ivyLeaf(ctx, x, y, ang, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.12, -s * 0.42, s * 0.42, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.46, -s * 0.24, s * 0.62, -s * 0.2);
    ctx.quadraticCurveTo(s * 0.86, -s * 0.16, s, 0);
    ctx.quadraticCurveTo(s * 0.86, s * 0.16, s * 0.62, s * 0.2);
    ctx.quadraticCurveTo(s * 0.46, s * 0.24, s * 0.42, s * 0.5);
    ctx.quadraticCurveTo(s * 0.12, s * 0.42, 0, 0);
    ctx.fillStyle = '#7b9459'; ctx.fill();
    ctx.strokeStyle = '#3e4d27'; ctx.lineWidth = Math.max(0.5, s * 0.06); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,226,170,0.7)'; ctx.lineWidth = Math.max(0.4, s * 0.045);
    ctx.beginPath(); ctx.moveTo(s * 0.08, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke();
    ctx.restore();
  }
  function goldCurl(ctx, x, y, r, a0, dir, lw) {
    ctx.beginPath();
    for (var k = 0; k <= 18; k++) { var q = k / 18, a = a0 + dir * q * 1.6 * 6.283, rr = r * (1 - 0.85 * q); if (k) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.strokeStyle = GILT; ctx.lineWidth = lw; ctx.stroke();
  }
  // ivy tendrils growing from one outer corner of the frame along its two edges, out on the vellum
  function ivyCorner(ctx, c, m, R) {
    var lw = Math.max(0.7, m * 0.09);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[-c.u1[0], -c.u1[1], c.u1[1], -c.u1[0]], [c.u2[0], c.u2[1], c.u2[1], -c.u2[0]]].forEach(function (d, si) {
      var ex = d[0], ey = d[1], nx = d[2], ny = d[3], L = m * (2.8 + R() * 1.6), N = 20, P = [];
      var ph = R() * 2, amp = m * 0.16;
      for (var i = 0; i <= N; i++) {
        var k = i / N, s = -m * 0.25 + k * L, o = m * 0.48 + amp * Math.sin(k * Math.PI * 2 + ph);
        P.push([c.x + ex * s + nx * o, c.y + ey * s + ny * o]);
      }
      ctx.strokeStyle = '#6d8350'; ctx.lineWidth = lw;
      ctx.beginPath(); P.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      var ea = Math.atan2(ey, ex), na = Math.atan2(ny, nx);
      // leaves, alternating sides of the stem
      [0.3, 0.62, 0.92].forEach(function (k, j) {
        var p = P[Math.round(k * N)], side = j % 2 ? 1 : -1;
        ivyLeaf(ctx, p[0], p[1], ea + side * 0.9 + (side > 0 ? 0 : 0) , m * (0.5 + R() * 0.12) * (j === 2 ? 0.75 : 1));
      });
      // berries
      var bp = P[Math.round(N * (0.45 + R() * 0.1))], br = Math.max(0.9, m * 0.1);
      for (var b = 0; b < 3; b++) {
        var bx = bp[0] + nx * m * 0.25 + Math.cos(b * 2.1 + na) * br * 1.3, by = bp[1] + ny * m * 0.25 + Math.sin(b * 2.1 + na) * br * 1.3;
        ctx.fillStyle = '#b3282a'; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,200,0.7)'; ctx.beginPath(); ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, 6.283); ctx.fill();
      }
      // a gold curl at the tendril's tip
      var tip = P[N];
      goldCurl(ctx, tip[0] + ex * m * 0.25, tip[1] + ey * m * 0.25, m * 0.28, ea + Math.PI, si ? 1 : -1, lw);
    });
    // corner flourish: a gold curl and a leaf on the diagonal
    var dx = c.nx / Math.SQRT2, dy = c.ny / Math.SQRT2;
    goldCurl(ctx, c.x + dx * m * 0.62, c.y + dy * m * 0.62, m * 0.32, Math.atan2(dy, dx), 1, lw);
    ivyLeaf(ctx, c.x + dx * m * 0.3, c.y + dy * m * 0.3, Math.atan2(dy, dx), m * 0.62);
  }

  // burnished gold: a gradient across the whole panel so the rules catch the light unevenly
  function burnish(ctx, x, y, w, h) {
    var gg = ctx.createLinearGradient(x, y, x + w, y + h);
    gg.addColorStop(0, '#b4842f'); gg.addColorStop(0.18, '#e7c46a'); gg.addColorStop(0.36, '#b98a33');
    gg.addColorStop(0.55, '#efd07c'); gg.addColorStop(0.74, '#b0802c'); gg.addColorStop(0.9, '#e2bd62'); gg.addColorStop(1, '#a87a2a');
    return gg;
  }
  // the gilded frame round the panel (offsets outward from the mask edge, b = frame thickness):
  // fine gold rule on the ground, inner gold rule, red band with cream dots, broad outer gold rule;
  // dark-brown hairlines outside each gold rule
  function drawFrame(ctx, G, b, box) {
    var hl = Math.max(0.6, b * 0.04), gold = burnish(ctx, box[0], box[1], box[2], box[3]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    // red band
    ctx.strokeStyle = '#9c2a1c'; ctx.lineWidth = b * 0.56; ctx.stroke(G.path(b * 0.44));
    ctx.strokeStyle = 'rgba(50,6,3,0.4)'; ctx.lineWidth = Math.max(0.6, b * 0.05); ctx.stroke(G.path(b * 0.2)); ctx.stroke(G.path(b * 0.69));
    // broad outer rule
    ctx.strokeStyle = HAIR; ctx.lineWidth = b * 0.26 + 2 * hl; ctx.stroke(G.path(b * 0.85));
    ctx.strokeStyle = gold; ctx.lineWidth = b * 0.26; ctx.stroke(G.path(b * 0.85));
    ctx.strokeStyle = 'rgba(255,242,195,0.7)'; ctx.lineWidth = Math.max(0.5, b * 0.035); ctx.stroke(G.path(b * 0.78));
    ctx.strokeStyle = 'rgba(95,58,12,0.5)'; ctx.lineWidth = Math.max(0.5, b * 0.03); ctx.stroke(G.path(b * 0.93));
    // inner rule
    ctx.strokeStyle = HAIR; ctx.lineWidth = b * 0.13 + 2 * hl; ctx.stroke(G.path(b * 0.1));
    ctx.strokeStyle = gold; ctx.lineWidth = b * 0.13; ctx.stroke(G.path(b * 0.1));
    ctx.strokeStyle = 'rgba(255,242,195,0.6)'; ctx.lineWidth = Math.max(0.4, b * 0.025); ctx.stroke(G.path(b * 0.07));
    // fine rule on the ground: the second line of the double rule
    ctx.strokeStyle = HAIR; ctx.lineWidth = Math.max(0.6, b * 0.035) + 2 * hl * 0.7; ctx.stroke(G.path(-b * 0.12));
    ctx.strokeStyle = gold; ctx.lineWidth = Math.max(0.6, b * 0.035); ctx.stroke(G.path(-b * 0.12));
    // rubrication dots
    var dr = Math.max(0.75, b * 0.07);
    G.dots(b * 0.44, Math.max(dr * 4, b * 0.34)).forEach(function (p) {
      ctx.fillStyle = 'rgba(50,6,3,0.45)'; ctx.beginPath(); ctx.arc(p[0] + dr * 0.25, p[1] + dr * 0.3, dr, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#f6e6bd'; ctx.beginPath(); ctx.arc(p[0], p[1], dr, 0, 6.283); ctx.fill();
    });
  }
  // the whole puzzle panel, drawn once to an offscreen canvas (the board caches it per size and DPR):
  // ivy at the outer corners, madder ground with gold filigree over the masked cells, the gilded frame
  // tracing the mask outline. o: w, h, inm (mask flags), S (tile), pad (mask origin), band (frame
  // thickness), ivy (margin for the tendrils), cssW, cssH, dpr, round (corner radius), rect, seed
  function makePanel(o) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(o.cssW * o.dpr)); cv.height = Math.max(1, Math.round(o.cssH * o.dpr));
    var g = cv.getContext('2d');
    g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    var b = o.band, S = o.S, G = frameGeom(o.w, o.h, o.inm, S, o.pad, o.pad, o.round || 0), R = rand(o.seed || 7);
    var box = [o.pad - b, o.pad - b, o.w * S + 2 * b, o.h * S + 2 * b];
    if (o.ivy > 3) G.corners(b).forEach(function (c) { ivyCorner(g, c, o.ivy, R); });
    var gp = G.path(b * 0.3);
    g.fillStyle = MADDER; g.fill(gp);
    g.save(); g.clip(gp);
    // a painted mottle in the madder
    var nb = Math.round(o.w * o.h * 1.5);
    for (var i = 0; i < nb; i++) {
      var x = box[0] + R() * box[2], y = box[1] + R() * box[3], r = S * (0.4 + R() * 1.1), dk = R() < 0.5;
      var m = g.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, dk ? 'rgba(45,6,4,0.3)' : 'rgba(150,46,30,0.22)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    filigree(g, box[0], box[1], box[2], box[3], S, R, Math.max(0.55, Math.min(1.3, S * 0.016)));
    // a soft shadow under the frame's inner edge
    g.strokeStyle = 'rgba(30,4,2,0.4)'; g.lineWidth = b * 0.6; g.stroke(G.path(b * 0.1));
    g.restore();
    if (images.border && o.rect) g.drawImage(images.border, box[0], box[1], box[2], box[3]);
    else drawFrame(g, G, b, box);
    return { cv: cv, geom: G };
  }

  /* ---------- enamel ribbons on the board ---------- */
  // one ribbon path in layers: dark hairline, gold edge, gouache body (darker edge, mid, centre) and a
  // faint lighter stripe. rib: {base, edge, light}; edges: draw the gold; dash: dash array for the body
  function ribLayers(ctx, path, w, S, rib, edges, dash, stripe) {
    var E = Math.max(1, S * 0.042), HL = Math.max(0.7, S * 0.012);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    if (edges) {
      ctx.strokeStyle = HAIR; ctx.lineWidth = w + 2 * (E + HL); ctx.beginPath(); path(ctx); ctx.stroke();
      ctx.strokeStyle = GILT; ctx.lineWidth = w + 2 * E; ctx.beginPath(); path(ctx); ctx.stroke();
    }
    if (dash) ctx.setLineDash(dash);
    if (edges) {   // a burnished inner lip on the gold
      ctx.strokeStyle = GILT_L; ctx.lineWidth = w + E * 0.9; ctx.beginPath(); path(ctx); ctx.stroke();
    }
    // the gouache body: a soft darkening toward the edges in fine steps (flat paint, not a tube)
    for (var k = 0; k < 5; k++) {
      ctx.strokeStyle = mix(rib.edge, rib.base, k / 4); ctx.lineWidth = w * (1 - k * 0.075);
      ctx.beginPath(); path(ctx); ctx.stroke();
    }
    if (stripe) {
      ctx.strokeStyle = rib.light; ctx.globalAlpha = stripe; ctx.lineWidth = w * 0.26; ctx.beginPath(); path(ctx); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (dash) ctx.setLineDash([]);
  }
  function ribMix(a, b, t) {
    return { base: mix(a.base, b.base, t), edge: mix(a.edge, b.edge, t), light: mix(a.light, b.light, t), dark: mix(a.dark, b.dark, t) };
  }

  function plaitSide(ctx, x0, y0, x1, y1, band, body, phase) {
    var L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
    var halves = Math.max(2, Math.round(L / (band * 1.1)));
    var hp = L / halves, amp = band * 0.24, rw = band * 0.2;
    function strand(sign, a, b) {
      return function (g) {
        var steps = Math.max(4, Math.ceil((b - a) / 2));
        for (var i = 0; i <= steps; i++) {
          var s = a + (b - a) * i / steps, o = sign * amp * Math.sin(Math.PI * s / hp);
          var X = x0 + ux * s + nx * o, Y = y0 + uy * s + ny * o;
          if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
        }
      };
    }
    ribbon(ctx, strand(1, 0, L), rw, body);
    ribbon(ctx, strand(-1, 0, L), rw, body);
    for (var k = 1; k < halves; k++) if ((k + phase) % 2 === 0) ribbon(ctx, strand(1, k * hp - hp * 0.32, k * hp + hp * 0.32), rw, body);
  }

  /* ---------- letter shapes from a mask ---------- */
  // boundary loops of the union of mask cells, in grid units, clockwise (interior on the right, y down)
  function maskLoops(w, h, inm) {
    function I(x, y) { return x >= 0 && y >= 0 && x < w && y < h && inm[y * w + x]; }
    var out = {}, all = [];
    function add(x1, y1, x2, y2) { var e = { a: [x1, y1], b: [x2, y2], used: false }; (out[x1 + ',' + y1] = out[x1 + ',' + y1] || []).push(e); all.push(e); }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!I(x, y)) continue;
      if (!I(x, y - 1)) add(x, y, x + 1, y);
      if (!I(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!I(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!I(x - 1, y)) add(x, y + 1, x, y);
    }
    var loops = [];
    all.forEach(function (e0) {
      if (e0.used) return;
      var loop = [], e = e0;
      while (e && !e.used) {
        e.used = true; loop.push(e.a);
        var dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], best = null, bc = -9;
        (out[e.b[0] + ',' + e.b[1]] || []).forEach(function (f) {
          if (f.used && f !== e0) return;
          var fx = f.b[0] - f.a[0], fy = f.b[1] - f.a[1], cr = dx * fy - dy * fx;   // >0: right turn
          if (cr > bc) { bc = cr; best = f; }
        });
        e = best === e0 ? null : best;
      }
      // drop collinear vertices
      var simp = loop.filter(function (p, i) {
        var a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      if (simp.length >= 3) loops.push(simp);
    });
    return loops;
  }
  // the letter: a Path2D with rounded corners, and red dots set just outside the outline
  function maskShape(w, h, inm, S, ox, oy) {
    var loops = maskLoops(w, h, inm), path = new Path2D(), dots = [], r = S * 0.42;
    loops.forEach(function (L) {
      var n = L.length, P = L.map(function (p) { return [ox + p[0] * S, oy + p[1] * S]; });
      var m0 = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2];
      path.moveTo(m0[0], m0[1]);
      for (var i = 0; i < n; i++) {
        var a = P[i], b = P[(i + 1) % n], pr = P[(i - 1 + n) % n];
        var rr = Math.min(r, Math.hypot(a[0] - pr[0], a[1] - pr[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
        path.arcTo(a[0], a[1], b[0], b[1], rr);
      }
      path.closePath();
    });
    // dots: along each edge, offset outward, then keep only those well clear of the letter and each other
    var off = S * 0.17 + Math.max(2, S * 0.07) + S * 0.11, gap = S * 0.3;
    function clearOf(px, py) {
      var gx = (px - ox) / S, gy = (py - oy) / S, need = (off * 0.85) / S;
      for (var y = Math.floor(gy - need - 1); y <= gy + need + 1; y++) for (var x = Math.floor(gx - need - 1); x <= gx + need + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || !inm[y * w + x]) continue;
        var dx = Math.max(x - gx, 0, gx - x - 1), dy = Math.max(y - gy, 0, gy - y - 1);
        if (Math.hypot(dx, dy) < need) return false;
      }
      return true;
    }
    loops.forEach(function (L) {
      var n = L.length;
      for (var i = 0; i < n; i++) {
        var a = L[i], b = L[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        var ux = dx / len, uy = dy / len, nx = uy, ny = -ux, cnt = Math.max(1, Math.round(len * S / gap));
        for (var k = 0; k <= cnt; k++) {
          var s = len * k / cnt;
          dots.push([ox + (a[0] + ux * s) * S + nx * off, oy + (a[1] + uy * s) * S + ny * off]);
        }
      }
    });
    var kept = [];
    dots.forEach(function (p) {
      if (!clearOf(p[0], p[1])) return;
      if (kept.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < gap * 0.7; })) return;
      kept.push(p);
    });
    return { path: path, dots: kept, loops: loops };
  }

  /* ---------- slot drawings ---------- */
  var DRAW = {
    page: function (ctx, x, y, w, h, t, o) {
      var sc = o.scale || 1, key = [Math.round(w), Math.round(h), sc, o.margin].join('x');
      if (!cache.page || cache.pageKey !== key) { cache.page = makePage(Math.round(w), Math.round(h), sc, o.margin); cache.pageKey = key; }
      ctx.drawImage(cache.page, x, y, w, h);
    },
    border: function (ctx, x, y, w, h, t, o) {
      var b = o.band || 16, lit = o.lit || 0;
      var body = mix('#efe0bd', PIG.gold.base, lit);
      var ix = x + b, iy = y + b, iw = w - 2 * b, ih = h - 2 * b;
      // ground of the band
      ctx.fillStyle = 'rgba(120,70,30,' + (0.10 + 0.08 * lit) + ')';
      ctx.fillRect(x, y, w, b); ctx.fillRect(x, y + h - b, w, b); ctx.fillRect(x, y + b, b, h - 2 * b); ctx.fillRect(x + w - b, y + b, b, h - 2 * b);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(ix, iy, iw, ih); ctx.clip('evenodd');
      var m = b / 2;
      plaitSide(ctx, x + b, y + m, x + w - b, y + m, b, body, 0);
      plaitSide(ctx, x + w - m, y + b, x + w - m, y + h - b, b, body, 1);
      plaitSide(ctx, x + w - b, y + h - m, x + b, y + h - m, b, body, 0);
      plaitSide(ctx, x + m, y + h - b, x + m, y + b, b, body, 1);
      ctx.restore();
      // rules
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, b * 0.08);
      ctx.strokeRect(x, y, w, h); ctx.strokeRect(ix, iy, iw, ih);
      // corner medallions
      [[x, y], [x + w - b, y], [x, y + h - b], [x + w - b, y + h - b]].forEach(function (c, i) {
        var cx = c[0] + b / 2, cy = c[1] + b / 2, r = b * 0.42;
        ctx.fillStyle = mix('#7a1f12', PIG.vermilion.base, 0.4 + 0.6 * lit);
        ctx.fillRect(c[0], c[1], b, b);
        ctx.strokeStyle = INK; ctx.strokeRect(c[0], c[1], b, b);
        ctx.fillStyle = mix('#e9d6a8', PIG.gold.light, lit);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = i % 3 === 0 ? PIG.lapis.base : PIG.verdigris.base;
        for (var k = 0; k < 4; k++) {
          var a = k * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.26, 0, 6.283); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = PIG.orpiment.base;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.18, 0, 6.283); ctx.fill(); ctx.stroke();
      });
    },
    pin: function (ctx, x, y, w, h) {
      var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      ctx.fillStyle = 'rgba(40,20,5,0.35)';
      ctx.beginPath(); ctx.ellipse(cx + r * 0.25, cy + r * 0.3, r * 0.95, r * 0.8, 0, 0, 6.283); ctx.fill();
      var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#fff6c2'); g.addColorStop(0.45, '#e2b440'); g.addColorStop(1, '#7c5512');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#4a300a'; ctx.lineWidth = Math.max(1, r * 0.16); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,230,0.8)'; ctx.lineWidth = Math.max(0.8, r * 0.12);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    },
    knot: function (ctx, x, y, w, h, t, o) {
      if (o.rib) {
        // board terminal (box = the tile): the ribbon (width opts.rw x tile) arrives from the top edge to
        // the centre and ends in a gold-edged roundel holding a gold spiral
        var U = Math.min(w, h), rib = o.rib, a = U * (o.rw || 0.36) / 2, E = Math.max(1, U * 0.034), HL = Math.max(0.7, U * 0.014);
        ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0);
        var ky = U * 0.13, KR = U * 0.25;
        ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(0, ky, KR + E + HL, 0, 6.283); ctx.fill();
        ctx.fillStyle = GILT; ctx.beginPath(); ctx.arc(0, ky, KR + E, 0, 6.283); ctx.fill();
        var rg = ctx.createRadialGradient(-KR * 0.25, ky - KR * 0.25, KR * 0.1, 0, ky, KR);
        rg.addColorStop(0, rib.base); rg.addColorStop(0.65, rib.base); rg.addColorStop(1, rib.edge);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, ky, KR, 0, 6.283); ctx.fill();
        // the stem runs on into the roundel without a seam
        ribLayers(ctx, function (g) { g.moveTo(0, -U * 0.22); g.lineTo(0, ky - KR * 0.55); }, 2 * a, U, rib, false, null, 0);
        // the ribbon's left edge coils inward as a gold spiral
        var th0 = Math.atan2(-Math.sqrt(Math.max(0, KR * KR - a * a)), -a), N = 44, pts = [];
        for (var i = 0; i <= N; i++) { var q = i / N, th = th0 - q * 6.283 * 1.45, rr = (KR + E * 0.5) * (1 - 0.84 * q); pts.push([Math.cos(th) * rr, ky + Math.sin(th) * rr]); }
        var sp = function (g) { pts.forEach(function (p, j) { if (j) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = HAIR; ctx.lineWidth = E + 2 * HL; ctx.beginPath(); sp(ctx); ctx.stroke();
        ctx.strokeStyle = GILT_L; ctx.lineWidth = E; ctx.beginPath(); sp(ctx); ctx.stroke();
        var pe = pts[N];
        ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(pe[0], pe[1], E * 1.2 + HL, 0, 6.283); ctx.fill();
        ctx.fillStyle = GILT_L; ctx.beginPath(); ctx.arc(pe[0], pe[1], E * 1.2, 0, 6.283); ctx.fill();
        return;
      }
      var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.32;
      ctx.translate(cx, cy); ctx.rotate(o.angle || 0);
      ctx.fillStyle = o.body || PIG.bare.base; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, r * 0.22);
      ctx.beginPath(); ctx.arc(0, r * 0.25, r, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.42, 0, 6.283); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.14, 0, 6.283); ctx.fill();
    },
    beastHead: function (ctx, x, y, w, h, t, o) {
      // Insular zoomorphic head in profile. The box is the tile: the neck ribbon arrives from the
      // top edge to the box centre and the head lies in the lower half, snout pointing +y.
      // opts: body (colour), snap 0..1 (jaw snaps shut and open), blink 0..1, angle
      // opts.gilt: board style, gold edges with a dark-brown hairline instead of ink, head widened to the
      // broad ribbon
      var U = Math.min(w, h), snap = o.snap || 0, blink = o.blink || 0, body = o.body || PIG.bare.base, gilt = !!o.gilt;
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0); ctx.scale(U, U);
      if (gilt) ctx.scale(1.28, 1);
      var lw = Math.max(1.1 / U, 0.022), GE = Math.max(1, U * 0.034) / U, GH = Math.max(0.7, U * 0.014) / U;
      function edge() {   // fill the current path, edged in gold (gilt) or ink
        if (!gilt) { ctx.fill(); ctx.stroke(); return; }
        ctx.save(); ctx.strokeStyle = HAIR; ctx.lineWidth = 2 * (GE + GH); ctx.stroke();
        ctx.strokeStyle = GILT; ctx.lineWidth = 2 * GE; ctx.stroke(); ctx.restore(); ctx.fill();
      }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
      function curl(pts, wid) {   // a lappet: tapering ribbon along a smooth curve
        for (var pass = gilt ? -1 : 0; pass < 2; pass++) {
          ctx.strokeStyle = pass > 0 ? body : gilt ? (pass < 0 ? HAIR : GILT) : INK;
          for (var i = 1; i < pts.length; i++) {
            var k = i / (pts.length - 1);
            ctx.lineWidth = wid * (1 - 0.75 * k) + (pass > 0 ? 0 : gilt ? (pass < 0 ? 2 * (GE + GH) : 2 * GE) : 2 * lw);
            ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
          }
        }
        ctx.lineWidth = lw; ctx.strokeStyle = gilt ? HAIR : INK;
      }
      if (gilt) ctx.strokeStyle = HAIR;
      function spiral(x0, y0, cx, cy, turns, r1, n) {
        var a0 = Math.atan2(y0 - cy, x0 - cx), r0 = Math.hypot(x0 - cx, y0 - cy), out = [];
        for (var i = 0; i <= n; i++) { var k = i / n, a = a0 + turns * k * 6.283, r = r0 + (r1 - r0) * k; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        return out;
      }
      // crest lappet sweeping back along the neck and curling
      curl([[0.16, 0.06], [0.25, 0.0], [0.31, -0.1]].concat(spiral(0.33, -0.2, 0.25, -0.22, -0.8, 0.03, 9)), 0.075);
      // mouth interior
      var open = 0.55 * (1 - Math.sin(Math.min(1, snap) * Math.PI));
      var hx = -0.04, hy = 0.17;
      var ca = Math.cos(open), sa = Math.sin(open), lt = [hx + 0.05 * ca - 0.27 * sa, hy + 0.05 * sa + 0.27 * ca];
      ctx.fillStyle = '#6d1a0e';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(0.12, 0.45); ctx.lineTo(lt[0], lt[1]); ctx.closePath(); ctx.fill();
      // tongue
      ctx.strokeStyle = PIG.vermilion.base; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(hx + 0.02, hy + 0.05);
      ctx.quadraticCurveTo((0.06 + lt[0]) / 2 - 0.02, 0.48, (0.06 + lt[0]) / 2 - 0.08, 0.56 + open * 0.05);
      ctx.stroke(); ctx.strokeStyle = gilt ? HAIR : INK; ctx.lineWidth = lw;
      // lower jaw, hinged near the cheek
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(open);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(-0.07, -0.04); ctx.bezierCurveTo(-0.08, 0.1, -0.02, 0.2, 0.05, 0.27);
      ctx.quadraticCurveTo(0.07, 0.2, 0.04, 0.06); ctx.closePath(); edge();
      ctx.fillStyle = '#fffbe8';
      for (var ti = 0; ti < 3; ti++) { var ty = 0.08 + ti * 0.055; ctx.beginPath(); ctx.moveTo(0.04 - ti * 0.004, ty); ctx.lineTo(0.08, ty + 0.012); ctx.lineTo(0.042, ty + 0.03); ctx.fill(); }
      ctx.restore();
      // skull and long upper jaw
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(-0.145, -0.04); ctx.lineTo(0.145, -0.04);
      ctx.bezierCurveTo(0.25, 0.0, 0.25, 0.13, 0.19, 0.21);
      ctx.bezierCurveTo(0.16, 0.29, 0.15, 0.37, 0.13, 0.45);
      ctx.quadraticCurveTo(0.09, 0.47, 0.07, 0.43);
      ctx.bezierCurveTo(0.05, 0.36, 0.02, 0.27, hx, hy + 0.02);
      ctx.bezierCurveTo(-0.13, 0.16, -0.17, 0.07, -0.145, -0.04);
      ctx.closePath(); edge();
      // upper teeth
      ctx.fillStyle = '#fffbe8';
      for (ti = 0; ti < 3; ti++) { var px = 0.065 - ti * 0.02, py = 0.4 - ti * 0.07; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 0.035, py + 0.005); ctx.lineTo(px - 0.01, py - 0.03); ctx.fill(); }
      // snout lappet curling off the tip of the upper jaw
      curl([[0.12, 0.44], [0.19, 0.47]].concat(spiral(0.24, 0.44, 0.22, 0.39, 0.85, 0.012, 8)), 0.05);
      // cheek spiral and brow
      ctx.beginPath(); ctx.arc(-0.06, 0.06, 0.05, 0.4, 4.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.04, 0.03); ctx.quadraticCurveTo(0.13, 0.0, 0.2, 0.08); ctx.stroke();
      // eye (almond, looking down the snout)
      ctx.save(); ctx.translate(0.12, 0.12); ctx.rotate(1.15);
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath(); ctx.ellipse(0, 0, 0.065, 0.042 * (1 - 0.92 * blink), 0, 0, 6.283); ctx.fill(); ctx.stroke();
      if (blink < 0.5) { ctx.fillStyle = gilt ? HAIR : INK; ctx.beginPath(); ctx.arc(0.015, 0, 0.022, 0, 6.283); ctx.fill(); }
      ctx.restore();
      // nostril
      ctx.beginPath(); ctx.arc(0.135, 0.39, 0.016, 0, 6.283); ctx.fillStyle = gilt ? HAIR : INK; ctx.fill();
    },
    beastTail: function (ctx, x, y, w, h, t, o) {
      // A tapering tail: the ribbon arrives from the top edge to the box centre, sweeps round and up
      // the -x side and ends in a little fishtail leaf. opts: body, wag 0..1, angle
      // opts.gilt: board style (gold edges, hairline); opts.rw: starting width as a fraction of the tile
      var gilt = !!o.gilt, w0 = o.rw || 0.27;
      var U = Math.min(w, h), body = o.body || PIG.bare.base, wag = o.wag ? Math.sin(o.wag * Math.PI * 2) * 0.12 : 0;
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0); ctx.scale(U, U);
      var lw = Math.max(1.1 / U, 0.022), pts = [], i, N = 30, GE = Math.max(1, U * 0.034) / U, GH = Math.max(0.7, U * 0.014) / U;
      var cx = -0.17, cy = 0.1, R = 0.17;
      for (i = 0; i <= 4; i++) pts.push([0, -0.03 + i * 0.13 / 4]);
      for (i = 1; i <= N; i++) { var a = Math.PI * i / N; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R * 1.05]); }
      for (i = 1; i <= 6; i++) { var k = i / 6; pts.push([-0.34 + Math.sin(k * 1.4) * (0.03 + wag * 0.4), 0.1 - k * 0.24]); }
      var L = pts.length;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var widthAt = function (j) { var s = j / (L - 1); return w0 * (1 - s) + 0.05 * s; };
      for (var pass = gilt ? -1 : 0; pass < 2; pass++) {
        ctx.strokeStyle = pass > 0 ? body : gilt ? (pass < 0 ? HAIR : GILT) : INK;
        for (i = 1; i < L; i++) {
          ctx.lineWidth = widthAt(i) + (pass > 0 ? 0 : gilt ? (pass < 0 ? 2 * (GE + GH) : 2 * GE) : 2 * Math.max(lw, widthAt(i) * 0.15));
          ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
        }
      }
      // spine stripe of small chevrons
      ctx.strokeStyle = 'rgba(42,27,16,0.55)'; ctx.lineWidth = lw * 0.8;
      for (i = 6; i < L - 4; i += 4) {
        var p0 = pts[i - 1], p1 = pts[i + 1], dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy) || 1, ww = widthAt(i) * 0.28;
        ctx.beginPath(); ctx.moveTo(pts[i][0] - dy / d * ww - dx / d * ww, pts[i][1] + dx / d * ww - dy / d * ww);
        ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i][0] + dy / d * ww - dx / d * ww, pts[i][1] - dx / d * ww - dy / d * ww); ctx.stroke();
      }
      // fishtail leaf
      var e = pts[L - 1], f = pts[L - 2], ang = Math.atan2(e[1] - f[1], e[0] - f[0]);
      ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(ang);
      ctx.fillStyle = body; ctx.strokeStyle = gilt ? GILT : INK; ctx.lineWidth = gilt ? 2 * GE : lw;
      ctx.beginPath(); ctx.moveTo(-0.01, 0);
      ctx.bezierCurveTo(0.04, -0.03, 0.09, -0.09, 0.13, -0.08);
      ctx.quadraticCurveTo(0.08, -0.02, 0.1, 0);
      ctx.quadraticCurveTo(0.08, 0.02, 0.13, 0.08);
      ctx.bezierCurveTo(0.09, 0.09, 0.04, 0.03, -0.01, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (gilt) { ctx.strokeStyle = HAIR; ctx.lineWidth = lw * 0.8; }
      ctx.beginPath(); ctx.moveTo(0.0, 0); ctx.lineTo(0.08, 0); ctx.stroke();
      ctx.restore();
    },
    mark: function (ctx, x, y, w, h, t, o) {
      var p = (o.gilt ? RIB[o.pigment] : PIG[o.pigment]) || PIG.gold, cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      ctx.translate(cx, cy); ctx.lineJoin = 'round';
      ctx.fillStyle = p.base; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.1, r * 0.2);
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath();
      if (o.gilt) {   // board style: a cream-and-gold rim so it stands off the enamel ribbon
        ctx.strokeStyle = HAIR; ctx.lineWidth = Math.max(2.4, r * 0.5); ctx.stroke();
        ctx.strokeStyle = GILT_L; ctx.lineWidth = Math.max(1.4, r * 0.3); ctx.stroke(); ctx.fill();
      } else { ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,240,0.65)';
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.28, -r * 0.1); ctx.lineTo(0, -r * 0.05); ctx.closePath(); ctx.fill();
    },
    twinFrame: function (ctx, x, y, w, h, t, o) {
      // gilt corner brackets for a gilded-twin tile (clear of the ribbons, which cross mid-edges)
      // light touch: three short brackets (the top-left corner holds the group's emblem instead)
      var L = w * 0.17, i = w * 0.05, glow = o.glow || 0, lit = o.lit || 0;
      ctx.lineCap = 'square';
      [[x + w - i, y + i, -1, 1], [x + i, y + h - i, 1, -1], [x + w - i, y + h - i, -1, -1]].forEach(function (c) {
        for (var pass = 0; pass < 2; pass++) {
          // o.dark (the board's madder ground): a brown hairline under a brighter, broader gold
          ctx.strokeStyle = pass ? mix(o.dark ? '#f2d27a' : '#d9b04a', '#fff1b8', Math.max(glow, lit * 0.5)) : (o.dark ? HAIR : 'rgba(94,63,14,0.8)');
          ctx.lineWidth = o.dark ? Math.max(pass ? 1.4 : 2.6, w * (pass ? 0.04 : 0.07)) : Math.max(pass ? 1 : 1.8, w * (pass ? 0.028 : 0.05));
          ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke();
        }
      });
      if (glow > 0) {
        var g = ctx.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 0.75);
        g.addColorStop(0, 'rgba(255,225,130,0)'); g.addColorStop(1, 'rgba(255,225,130,' + (0.45 * glow) + ')');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      }
    },
    twinEmblem: function (ctx, x, y, w, h, t, o) {
      // the group's sign, so groups can be told apart: 0 ✦ star, 1 quatrefoil, 2 triquetra, 3 lozenge-cross
      var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2, k = (o.kind || 0) % 4, glow = o.glow || 0;
      var gold = mix('#e2b443', '#fff3c0', glow);
      ctx.translate(cx, cy); ctx.scale(1 + 0.25 * glow, 1 + 0.25 * glow);
      ctx.fillStyle = gold; ctx.strokeStyle = '#4e330b'; ctx.lineWidth = Math.max(0.9, r * 0.16); ctx.lineJoin = 'round';
      ctx.beginPath();
      if (k === 0) {
        for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (k === 1) {
        for (i = 0; i < 4; i++) { var b = i * Math.PI / 2; ctx.moveTo(Math.cos(b) * r * 0.48 + r * 0.42, Math.sin(b) * r * 0.48); ctx.arc(Math.cos(b) * r * 0.48, Math.sin(b) * r * 0.48, r * 0.42, 0, 6.283); }
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = PIG.vermilion.base; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 6.283); ctx.fill(); ctx.stroke();
      } else if (k === 2) {
        ctx.lineWidth = Math.max(1.6, r * 0.34); ctx.strokeStyle = '#4e330b';
        var tri = function () { ctx.beginPath(); for (var j = 0; j < 3; j++) { var c = j * 2.094 - Math.PI / 2, px = Math.cos(c) * r * 0.36, py = Math.sin(c) * r * 0.36; ctx.moveTo(px + r * 0.5, py); ctx.arc(px, py, r * 0.5, 0, 6.283); } ctx.stroke(); };
        tri(); ctx.lineWidth = Math.max(0.8, r * 0.16); ctx.strokeStyle = gold; tri();
      } else {
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = PIG.lapis.base; ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 0.4, 0); ctx.stroke();
      }
    },
    initial: function (ctx, x, y, w, h, t, o) {
      // the great initial's body, built from the mask outline: vermilion outline, gold-leaf body with
      // a lapis hairline, and red dotting. opts: path (Path2D), dots [[x,y]], S (tile size)
      var S = o.S, m = S * 0.17, ow = Math.max(2, S * 0.07), path = o.path;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PIG.vermilion.dark; ctx.lineWidth = 2 * (m + ow) + 2; ctx.stroke(path);
      ctx.strokeStyle = PIG.vermilion.base; ctx.lineWidth = 2 * (m + ow); ctx.stroke(path);
      var gg = ctx.createLinearGradient(x, y, x + w, y + h);
      gg.addColorStop(0, '#e8c25e'); gg.addColorStop(0.3, '#f8e6a6'); gg.addColorStop(0.5, '#c99a3c');
      gg.addColorStop(0.72, '#f4dc8e'); gg.addColorStop(1, '#b3822f');
      ctx.strokeStyle = gg; ctx.fillStyle = gg; ctx.lineWidth = 2 * m; ctx.stroke(path); ctx.fill(path, 'evenodd');
      var d = S * 0.05, lw = Math.max(1, S * 0.03);
      ctx.strokeStyle = PIG.lapis.base; ctx.lineWidth = 2 * (m - d); ctx.stroke(path);
      ctx.strokeStyle = gg; ctx.lineWidth = 2 * (m - d - lw); ctx.stroke(path); ctx.fill(path, 'evenodd');
      // punched stipple in the gold
      ctx.save(); ctx.clip(path, 'evenodd');
      var R = rand(77), n = Math.round(w * h / (S * S) * 7);
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = R() < 0.5 ? 'rgba(120,80,20,0.22)' : 'rgba(255,250,215,0.5)';
        ctx.beginPath(); ctx.arc(x + R() * w, y + R() * h, Math.max(0.6, S * 0.012), 0, 6.283); ctx.fill();
      }
      ctx.restore();
      // red dotting round the outline
      var dr = Math.max(1.3, S * 0.035);
      (o.dots || []).forEach(function (p) {
        ctx.fillStyle = PIG.vermilion.base; ctx.beginPath(); ctx.arc(p[0], p[1], dr, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(90,20,10,0.5)'; ctx.beginPath(); ctx.arc(p[0] + dr * 0.25, p[1] + dr * 0.3, dr * 0.45, 0, 6.283); ctx.fill();
      });
    },
    drollery: function (ctx, x, y, w, h, t, o) {
      // fallback for a drollery id with no drawing: a sleeping pencil oval
      ctx.strokeStyle = 'rgba(80,60,40,0.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.32, h * 0.22, 0, 0, 6.283); ctx.stroke();
    }
  };

  var ART = {
    INK: INK, PIG: PIG, ribbon: ribbon, mix: mix, rand: rand, maskShape: maskShape, makePage: makePage,
    // the board's enamel look: RIB colours, the cached panel (ground, filigree, gilded frame, ivy) and
    // layered gold-edged ribbon strokes
    RIB: RIB, HAIR: HAIR, GILT: GILT, MADDER: MADDER, makePanel: makePanel, ribLayers: ribLayers, ribMix: ribMix,
    rib: function (name) { return RIB[name] || RIB.gold; },
    // register another drawn slot (drolleries.js uses this)
    define: function (slot, fn) { DRAW[slot] = fn; },
    pigment: function (name) { return PIG[name] || PIG.gold; },
    has: function (slot) { return !!images[slot]; },
    // a loaded PNG's shape: aspect = width / height, stem = where its vine meets the bottom edge (0..1)
    meta: function (slot) { return images[slot] ? metas[slot] : null; },
    // the unpainted state of a PNG: a sepia ink underdrawing (dark lines kept, light fills thinned away)
    faded: function (slot) {
      var img = images[slot];
      if (!img) return null;
      if (fadedCache[slot] !== undefined) return fadedCache[slot];
      var cv = null;
      try {
        cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        var g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        var id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
        for (var i = 0; i < d.length; i += 4) {
          var l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, k = 1 - l;
          d[i] = 72 + l * 150; d[i + 1] = 48 + l * 120; d[i + 2] = 26 + l * 84;
          d[i + 3] = d[i + 3] * (0.22 + 0.78 * Math.pow(k, 0.7));
        }
        g.putImageData(id, 0, 0);
      } catch (e) { cv = null; }   // a tainted canvas (file://): callers fall back to a thin alpha
      fadedCache[slot] = cv; return cv;
    },
    draw: function (ctx, slot, x, y, w, h, t, opts) {
      opts = opts || {};
      var img = images[slot], m = metas[slot];
      ctx.save();
      if (img) {
        if (m && m.fit) {   // keep the PNG's own aspect: fit inside the box, bottom-centre unless told otherwise
          var k = Math.min(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * k, dh = img.naturalHeight * k;
          x += (w - dw) * (opts.alignX != null ? opts.alignX : 0.5); y += (h - dh) * (opts.alignY != null ? opts.alignY : 1);
          w = dw; h = dh;
          if (opts.faded) { var f = ART.faded(slot); if (f) img = f; else ctx.globalAlpha *= 0.4; }
        }
        if (opts.angle) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(opts.angle); ctx.drawImage(img, -w / 2, -h / 2, w, h); }
        else ctx.drawImage(img, x, y, w, h);
      } else {
        var fn = DRAW[slot] || (slot.indexOf('drollery') === 0 ? DRAW.drollery : null) || (slot.indexOf('initial') === 0 ? DRAW.initial : null);
        if (fn) fn(ctx, x, y, w, h, t || 0, Object.assign({ id: slot.split('.')[1] }, opts));
      }
      ctx.restore();
    },
    // the manifest is revalidated on every start; each PNG URL carries its entry's v so a replaced picture
    // reaches phones as soon as its v is bumped
    load: function (base) {
      base = base || 'art/';
      if (typeof fetch === 'undefined') return Promise.resolve();
      return fetch(base + 'manifest.json?v=2', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        return Promise.all(Object.keys(m).map(function (slot) {
          var e = typeof m[slot] === 'string' ? { file: m[slot] } : (m[slot] || {});
          if (!e.file) return null;
          return new Promise(function (res) {
            var img = new Image();
            img.onload = function () {
              images[slot] = img; delete fadedCache[slot];
              metas[slot] = { aspect: img.naturalWidth / img.naturalHeight, stem: e.stem != null ? e.stem : 0.5,
                fit: e.fit != null ? !!e.fit : slot.indexOf('drollery.') === 0 };
              res();
            };
            img.onerror = function () { res(); };
            img.src = base + e.file + (e.v != null ? '?v=' + e.v : '');
          });
        }));
      }).catch(function () {});
    },
    slots: function () { return Object.keys(DRAW).filter(function (k) { return k !== 'drollery'; }).concat(['drollery.<id>']); }
  };
  window.ART = ART;
})();
