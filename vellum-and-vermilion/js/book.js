/* Vellum & Vermilion — the cover and the Book (contents, Bestiary of the Margins, Colophon).
   Book.init(game) is called by main.js with its API; Book.boot() picks the first screen.
   Screens: 'closed' (the cover on the desk), 'open' (the book, leaf by leaf), 'hidden' (the page screen is showing).
   Faces (leaves) of the open book: 0 Incipit · 1-5 the quires · 6 the Bestiary · 7 the Colophon.
   Wide screens show them as spreads (0|1, 2|3, 4|5, 6|7); phones show one face at a time.
   Art slots defined here (a PNG in art/manifest.json replaces any of them):
     cover.leather  the whole front board: tooled oxblood leather with blind-tooled frames
     cover.corner   one gold-tooled corner piece, drawn for the top-left corner (opts.angle turns it)
     cover.medallion the round knotwork medallion in the middle of the board
     cover.clasp    one brass clasp on the fore-edge (the box's right edge is the board's edge)
     cover.title    the gold title lettering (opts.text: lines joined by \n)
     cover.endpaper the inside of the front board (the pastedown)
     book.seal      the red wax seal on a locked page
     book.roundel   the gold ring round a drollery in the Bestiary */
(function () {
  'use strict';
  var ART = window.ART, G = null;
  var $ = function (id) { return document.getElementById(id); };
  var UNC = '"Uncial Antiqua", serif', FELL = '"IM Fell English", Georgia, serif';
  var RED = '#a8261a', INKC = '#2a1b10', GOLD = '#b88b3a';
  var QN = ['I', 'II', 'III', 'IV', 'V'], FN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];
  var NFACES = 8, F_BEST = 6, F_COLO = 7;
  var NAMES = { snail: 'Snail Knight', rabbit: 'Rabbit Archer', cat: 'Cat and Mouse', fox: 'Fox Monk',
    owl: 'Owl', fishbird: 'Fishbird', monkey: 'Piping Monkey', dragon: 'Dragon', monk: 'Tired Monk' };
  var LETTERS = [6, 12, 18, 24, 30];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  /* ================= art slots ================= */
  var leatherCache = {};
  function grain(w, h) {
    var key = Math.round(w) + 'x' + Math.round(h);
    if (leatherCache[key]) return leatherCache[key];
    var sc = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
    var g = cv.getContext('2d'); g.scale(sc, sc);
    var R = ART.rand(77);
    var gr = g.createRadialGradient(w * 0.45, h * 0.4, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    gr.addColorStop(0, '#6e2219'); gr.addColorStop(0.6, '#561811'); gr.addColorStop(1, '#3a0f0a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 60; i++) {   // mottling and wear
      var x = R() * w, y = R() * h, r = 10 + R() * Math.min(w, h) * 0.22, m = g.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, R() < 0.5 ? 'rgba(20,4,2,0.18)' : 'rgba(150,70,50,0.10)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    var n = Math.round(w * h / 18);   // pores of the hide
    for (i = 0; i < n; i++) {
      g.fillStyle = R() < 0.55 ? 'rgba(15,3,2,' + (0.10 + R() * 0.2) + ')' : 'rgba(170,90,70,' + (0.05 + R() * 0.1) + ')';
      g.fillRect(R() * w, R() * h, 0.6 + R() * 0.8, 0.6 + R() * 0.8);
    }
    for (i = 0; i < 26; i++) {   // scuffs
      x = R() * w; y = R() * h;
      g.strokeStyle = 'rgba(190,120,95,' + (0.05 + R() * 0.08) + ')'; g.lineWidth = 0.5 + R();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 12); g.stroke();
    }
    // worn, lighter corners and a darker hinge along the spine (left)
    [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (c) {
      var cg = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], Math.min(w, h) * 0.16);
      cg.addColorStop(0, 'rgba(150,80,55,0.35)'); cg.addColorStop(1, 'rgba(150,80,55,0)');
      g.fillStyle = cg; g.fillRect(0, 0, w, h);
    });
    var hg = g.createLinearGradient(0, 0, w * 0.08, 0);
    hg.addColorStop(0, 'rgba(10,2,1,0.55)'); hg.addColorStop(0.55, 'rgba(10,2,1,0.15)'); hg.addColorStop(0.7, 'rgba(160,80,60,0.12)'); hg.addColorStop(1, 'rgba(10,2,1,0)');
    g.fillStyle = hg; g.fillRect(0, 0, w * 0.08, h);
    leatherCache[key] = cv;
    return cv;
  }
  // a blind-tooled (pressed, ungilded) fillet: dark groove with a light lower lip
  function fillet(g, path, wd) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.save(); g.translate(0.7, 0.9); g.strokeStyle = 'rgba(190,110,85,0.22)'; g.lineWidth = wd; path(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(18,4,2,0.55)'; g.lineWidth = wd; path(); g.stroke();
  }
  function goldFill(g, x0, y0, x1, y1) {
    var gg = g.createLinearGradient(x0, y0, x1, y1);
    gg.addColorStop(0, '#f6e3a0'); gg.addColorStop(0.35, '#d4a647'); gg.addColorStop(0.55, '#9c7224'); gg.addColorStop(0.8, '#e8c769'); gg.addColorStop(1, '#b8862e');
    return gg;
  }
  ART.define('cover.leather', function (g, x, y, w, h) {
    g.translate(x, y);
    g.drawImage(grain(w, h), 0, 0, w, h);
    var m = Math.min(w, h), a = m * 0.05, b = m * 0.11, fw = Math.max(1, m * 0.006);
    // two blind-tooled frames, the outer one doubled
    [a, a + fw * 3, b].forEach(function (i) { fillet(g, function () { g.beginPath(); g.rect(i, i, w - 2 * i, h - 2 * i); }, fw); });
    // diagonals between the frames' corners, and a lattice of lozenges in the centre panel
    fillet(g, function () {
      g.beginPath();
      [[a, a, b, b], [w - a, a, w - b, b], [a, h - a, b, h - b], [w - a, h - a, w - b, h - b]].forEach(function (l) { g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); });
    }, fw);
    g.save(); g.beginPath(); g.rect(b + fw * 4, b + fw * 4, w - 2 * b - fw * 8, h - 2 * b - fw * 8); g.clip();
    var step = (w - 2 * b) / 4;
    g.globalAlpha = 0.6;
    fillet(g, function () {
      g.beginPath();
      for (var k = -8; k <= 12; k++) { g.moveTo(b + k * step, b); g.lineTo(b + k * step + h, b + h); g.moveTo(w - b - k * step, b); g.lineTo(w - b - k * step - h, b + h); }
    }, fw * 0.8);
    g.restore();
  });
  ART.define('cover.corner', function (g, x, y, w, h, t, o) {
    g.translate(x + w / 2, y + h / 2); if (o.angle) g.rotate(o.angle); g.translate(-w / 2, -h / 2);
    var s = w;
    g.fillStyle = goldFill(g, 0, 0, s, s); g.strokeStyle = 'rgba(40,10,4,0.7)'; g.lineWidth = Math.max(0.8, s * 0.025);
    // a gold fan-shaped corner piece: a concave triangle with three lobes and a curl along each arm
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.92, 0); g.quadraticCurveTo(s * 0.3, s * 0.3, 0, s * 0.92); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(60,15,8,0.55)';
    g.beginPath(); g.moveTo(s * 0.12, s * 0.12); g.lineTo(s * 0.55, s * 0.08); g.quadraticCurveTo(s * 0.2, s * 0.2, s * 0.08, s * 0.55); g.closePath(); g.fill();
    g.fillStyle = goldFill(g, 0, 0, s, s);
    [[0.42, 0.42, 0.09], [0.64, 0.2, 0.06], [0.2, 0.64, 0.06]].forEach(function (d) { g.beginPath(); g.arc(d[0] * s, d[1] * s, d[2] * s, 0, 6.283); g.fill(); g.stroke(); });
    g.strokeStyle = goldFill(g, 0, 0, s, s); g.lineWidth = Math.max(1, s * 0.04); g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.92, s * 0.03); g.quadraticCurveTo(s * 1.1, s * 0.05, s * 1.05, s * 0.16); g.stroke();
    g.beginPath(); g.moveTo(s * 0.03, s * 0.92); g.quadraticCurveTo(s * 0.05, s * 1.1, s * 0.16, s * 1.05); g.stroke();
  });
  ART.define('cover.medallion', function (g, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2, gold = goldFill(g, x, y, x + w, y + h);
    // a blind-tooled outer ring, then a gilt double ring
    fillet(g, function () { g.beginPath(); g.arc(cx, cy, R * 0.98, 0, 6.283); }, Math.max(1, R * 0.02));
    g.strokeStyle = 'rgba(40,10,4,0.75)'; g.lineWidth = R * 0.08; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, 6.283); g.stroke();
    g.strokeStyle = gold; g.lineWidth = R * 0.05; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, 6.283); g.stroke();
    g.lineWidth = R * 0.02; g.beginPath(); g.arc(cx, cy, R * 0.76, 0, 6.283); g.stroke();
    // knotwork: four interlaced loops round a ring, gold ribbons with dark edges
    var rw = R * 0.075, lr = R * 0.3, off = R * 0.3;
    function loop(i) { var a = i * Math.PI / 2 + Math.PI / 4; ART.ribbon(g, function (gg) { gg.arc(cx + Math.cos(a) * off, cy + Math.sin(a) * off, lr, 0, 6.283); }, rw, '#d9ae4d', R * 0.02); }
    for (var i = 0; i < 4; i++) loop(i);
    ART.ribbon(g, function (gg) { gg.arc(cx, cy, R * 0.52, 0, 6.283); }, rw, '#e6c063', R * 0.02);
    // re-draw quarter arcs of the loops so they pass over the ring: a simple over-under weave
    for (i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + Math.PI / 4, lx = cx + Math.cos(a) * off, ly = cy + Math.sin(a) * off;
      ART.ribbon(g, function (gg) { gg.arc(lx, ly, lr, a + 0.5, a + 1.25); }, rw, '#d9ae4d', R * 0.02);
    }
    g.fillStyle = '#7a1a10'; g.strokeStyle = gold; g.lineWidth = R * 0.025;
    g.beginPath(); g.arc(cx, cy, R * 0.1, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = gold;
    for (i = 0; i < 8; i++) { var b = i * Math.PI / 4; g.beginPath(); g.arc(cx + Math.cos(b) * R * 0.81, cy + Math.sin(b) * R * 0.81, R * 0.028, 0, 6.283); g.fill(); }
  });
  ART.define('cover.clasp', function (g, x, y, w, h) {
    // a leather strap from the back board, a brass plate riveted over the fore-edge, and the catch
    var sy = y + h * 0.3, sh = h * 0.4;
    g.fillStyle = '#3a0f0a'; g.fillRect(x + w * 0.35, sy, w * 0.65, sh);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeRect(x + w * 0.35, sy, w * 0.65, sh);
    var px = x + w * 0.05, pw = w * 0.62, br = g.createLinearGradient(px, y, px, y + h);
    br.addColorStop(0, '#f1d48a'); br.addColorStop(0.45, '#b98a34'); br.addColorStop(0.6, '#8a6220'); br.addColorStop(1, '#d9b45e');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(px + 2, y + h * 0.12 + 3); g.lineTo(px + pw + 2, y + 3); g.lineTo(px + pw + 2, y + h + 3); g.lineTo(px + 2, y + h * 0.88 + 3); g.closePath(); g.fill();
    g.fillStyle = br; g.strokeStyle = '#4a300c'; g.lineWidth = Math.max(1, w * 0.02);
    g.beginPath(); g.moveTo(px, y + h * 0.12); g.lineTo(px + pw, y); g.lineTo(px + pw, y + h); g.lineTo(px, y + h * 0.88); g.closePath(); g.fill(); g.stroke();
    // engraved line and rivets
    g.strokeStyle = 'rgba(80,50,10,0.6)'; g.lineWidth = Math.max(0.6, w * 0.012);
    g.beginPath(); g.moveTo(px + pw * 0.15, y + h * 0.5); g.lineTo(px + pw * 0.85, y + h * 0.5); g.stroke();
    [[0.25, 0.3], [0.25, 0.7], [0.8, 0.22], [0.8, 0.78]].forEach(function (r) {
      var rx = px + pw * r[0], ry = y + h * r[1], rr = Math.max(1.2, w * 0.045);
      g.fillStyle = '#5a3a0e'; g.beginPath(); g.arc(rx + 0.6, ry + 0.6, rr, 0, 6.283); g.fill();
      g.fillStyle = '#f6e2a4'; g.beginPath(); g.arc(rx, ry, rr * 0.8, 0, 6.283); g.fill();
    });
    // the hook catching a pin near the plate's tip
    g.fillStyle = br; g.beginPath(); g.arc(px + pw * 0.06, y + h * 0.5, h * 0.1, 0, 6.283); g.fill(); g.stroke();
  });
  ART.define('cover.title', function (g, x, y, w, h, t, o) {
    var lines = String(o.text || 'Vellum\n& Vermilion').split('\n'), lh = h / lines.length;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(function (ln, i) {
      var s = Math.floor(lh * (i ? 0.62 : 0.86));
      g.font = s + 'px ' + UNC;
      while (g.measureText(ln).width > w && s > 8) { s -= 1; g.font = s + 'px ' + UNC; }
      var cy = y + lh * (i + 0.5);
      g.fillStyle = 'rgba(15,3,2,0.7)'; g.fillText(ln, x + w / 2 + 1.2, cy + 1.6);   // tooled into the leather
      g.fillStyle = 'rgba(190,110,85,0.25)'; g.fillText(ln, x + w / 2 - 0.6, cy - 0.8);
      g.fillStyle = goldFill(g, x, cy - s / 2, x + w * 0.3, cy + s / 2); g.fillText(ln, x + w / 2, cy);
    });
  });
  ART.define('cover.endpaper', function (g, x, y, w, h) {
    g.drawImage(paperCanvas(w, h, 'L'), x, y, w, h);
    g.fillStyle = 'rgba(255,250,235,0.25)'; g.fillRect(x, y, w, h);
    // the leather turn-ins round the three outer edges; the hinge (right, once open) is a paler joint
    var tw = Math.min(w, h) * 0.045;
    g.fillStyle = '#5a1811';
    g.fillRect(x, y, w, tw); g.fillRect(x, y + h - tw, w, tw); g.fillRect(x, y, tw, h);
    g.strokeStyle = 'rgba(30,6,3,0.5)'; g.lineWidth = 1; g.strokeRect(x + tw, y + tw, w - tw, h - 2 * tw);
    var jg = g.createLinearGradient(x + w, 0, x + w - w * 0.06, 0);
    jg.addColorStop(0, 'rgba(80,45,20,0.35)'); jg.addColorStop(1, 'rgba(80,45,20,0)');
    g.fillStyle = jg; g.fillRect(x + w * 0.94, y, w * 0.06, h);
  });
  ART.define('book.seal', function (g, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2, R = ART.rand(9);
    g.fillStyle = 'rgba(60,10,5,0.3)'; g.beginPath(); g.arc(cx + r * 0.08, cy + r * 0.1, r * 0.98, 0, 6.283); g.fill();
    g.beginPath();
    for (var i = 0; i <= 18; i++) { var a = i / 18 * 6.283, rr = r * (0.88 + R() * 0.12); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    var sg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    sg.addColorStop(0, '#d9442e'); sg.addColorStop(0.6, '#a5231a'); sg.addColorStop(1, '#6e1209');
    g.fillStyle = sg; g.fill();
    g.strokeStyle = 'rgba(70,8,4,0.7)'; g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath(); g.arc(cx, cy, r * 0.62, 0, 6.283); g.stroke();
    // the stamp: a little knot (two looped bars)
    g.lineWidth = Math.max(1, r * 0.09); g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - r * 0.32, cy - r * 0.32); g.lineTo(cx + r * 0.32, cy + r * 0.32); g.moveTo(cx + r * 0.32, cy - r * 0.32); g.lineTo(cx - r * 0.32, cy + r * 0.32); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.2, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(255,200,170,0.35)'; g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.1, -0.6, 0, 6.283); g.fill();
  });
  ART.define('book.roundel', function (g, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
    g.strokeStyle = 'rgba(70,40,10,0.8)'; g.lineWidth = Math.max(2, r * 0.1); g.beginPath(); g.arc(cx, cy, r * 0.94, 0, 6.283); g.stroke();
    g.strokeStyle = goldFill(g, x, y, x + w, y + h); g.lineWidth = Math.max(1.4, r * 0.065); g.beginPath(); g.arc(cx, cy, r * 0.94, 0, 6.283); g.stroke();
    g.strokeStyle = 'rgba(168,38,26,0.75)'; g.lineWidth = Math.max(0.8, r * 0.02); g.beginPath(); g.arc(cx, cy, r * 0.83, 0, 6.283); g.stroke();
    g.fillStyle = RED;
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.0, cy + Math.sin(a) * r * 1.0, Math.max(1.2, r * 0.045), 0, 6.283); g.fill(); }
  });

  /* ================= parchment leaves ================= */
  var paperCache = {};
  function paperCanvas(w, h, side) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = Math.round(w) + 'x' + Math.round(h) + side + dpr;
    if (!paperCache[key]) paperCache[key] = ART.makePage(Math.round(w), Math.round(h), dpr, side === 'L' ? 'left' : 'right');
    return paperCache[key];
  }
  function paper(g, w, h, side) {
    if (ART.has('page')) ART.draw(g, 'page', 0, 0, w, h, 0, {});
    else g.drawImage(paperCanvas(w, h, side), 0, 0, w, h);
    // the gutter: shade along the spine edge
    var sx = side === 'L' ? w : 0, gw = w * 0.13, sg = g.createLinearGradient(sx, 0, side === 'L' ? w - gw : gw, 0);
    sg.addColorStop(0, 'rgba(70,40,15,0.38)'); sg.addColorStop(0.35, 'rgba(70,40,15,0.12)'); sg.addColorStop(1, 'rgba(70,40,15,0)');
    g.fillStyle = sg; g.fillRect(side === 'L' ? w - gw : 0, 0, gw, h);
  }

  /* ================= thumbnails from the real board renderer ================= */
  var tb = null, thumbs = {};
  function thumb(n, solvedView) {
    var l = G.LEVELS[n - 1], save = G.save(), solved = solvedView || !!save.solved[n];
    var pr = save.prog[n], rots = (!solved && pr && pr.r && pr.r.length === l.w * l.h) ? pr.r : '';
    var key = n + ':' + (solved ? 'S' : 'U' + rots);
    if (thumbs[key]) return thumbs[key];
    if (!tb) { tb = new window.Board(document.createElement('canvas'), {}); clearInterval(tb._idle); }
    tb.setLevel(l, solved ? { solved: true } : (rots ? { rots: rots.split('').map(Number), pins: [] } : {}));
    tb.fit(260, 260); tb.draw();
    if (tb.raf) { cancelAnimationFrame(tb.raf); tb.raf = 0; }
    var k = Math.min(1, 360 / Math.max(tb.cv.width, tb.cv.height)), cv = document.createElement('canvas');
    cv.width = Math.round(tb.cv.width * k); cv.height = Math.round(tb.cv.height * k);
    cv.getContext('2d').drawImage(tb.cv, 0, 0, cv.width, cv.height);
    Object.keys(thumbs).forEach(function (kk) { if (kk.split(':')[0] === String(n) && kk !== key && kk.indexOf(':S') < 0) delete thumbs[kk]; });
    thumbs[key] = cv;
    return cv;
  }
  function drawThumbInBox(g, cv, x, y, s) {
    var k = Math.min(s / cv.width, s / cv.height), w = cv.width * k, h = cv.height * k;
    g.drawImage(cv, x + (s - w) / 2, y + (s - h) / 2, w, h);
    return { x: x + (s - w) / 2, y: y + (s - h) / 2, w: w, h: h };
  }

  /* ================= text helpers ================= */
  function font(g, s, fam, style) { g.font = (style ? style + ' ' : '') + s + 'px ' + fam; }
  function fitFont(g, text, fam, max, maxW, style, min) {
    var s = Math.floor(max); font(g, s, fam, style);
    while (g.measureText(text).width > maxW && s > (min || 8)) { s -= 1; font(g, s, fam, style); }
    return s;
  }
  function wrap(g, text, maxW) {
    var words = text.split(' '), lines = [], ln = '';
    words.forEach(function (wd) { var tt = ln ? ln + ' ' + wd : wd; if (g.measureText(tt).width > maxW && ln) { lines.push(ln); ln = wd; } else ln = tt; });
    if (ln) lines.push(ln);
    return lines;
  }
  function ellip(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  /* ================= progress helpers ================= */
  function nextUnsolved() {
    var s = G.save();
    for (var n = 1; n <= G.LEVELS.length; n++) if (!s.solved[n] && G.unlocked(n)) return n;
    return 0;
  }
  function solvedCount() { var s = G.save(), k = 0; for (var n = 1; n <= G.LEVELS.length; n++) if (s.solved[n]) k++; return k; }
  function allDone() { return solvedCount() === G.LEVELS.length; }
  var BEASTS = [];
  function beastsInit() {
    BEASTS = [];
    G.LEVELS.forEach(function (l) { if (BEASTS.indexOf(l.drollery) < 0) BEASTS.push(l.drollery); });
  }
  function found(id) { var s = G.save(); return G.LEVELS.some(function (l) { return l.drollery === id && s.solved[l.n]; }); }

  /* ================= faces ================= */
  var hits = {};          // face -> [{x,y,w,h,act}]
  var marker = null;      // {face, x, y, s} where the ☙ goes
  var best = { woke: {}, sel: null, selT: 0 };
  function renderFace(f, g, w, h, side, t) {
    paper(g, w, h, side);
    var H = hits[f] = [];
    var mx = Math.max(14, w * 0.09), top = Math.max(12, h * 0.05), cw = w - 2 * mx;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (f === 0) faceIncipit(g, w, h, mx, top, cw, H);
    else if (f <= 5) faceQuire(f, g, w, h, mx, top, cw, H);
    else if (f === F_BEST) faceBestiary(g, w, h, mx, top, cw, H, t);
    else faceColophon(g, w, h, mx, top, cw, H);
    // folio number at the foot, out of the way of the corner hot-spots
    g.textAlign = 'center'; g.fillStyle = 'rgba(168,38,26,0.7)'; font(g, clamp(w * 0.03, 9, 13), FELL, 'italic');
    g.fillText(['incipit', 'j', 'ij', 'iij', 'iiij', 'v', 'vj', 'vij'][f], w / 2, h - Math.max(10, h * 0.025));
  }
  function rubricTitle(g, text, w, y, cw, max) {
    g.fillStyle = RED; var s = fitFont(g, text, UNC, max, cw);
    g.fillText(text, w / 2, y + s); return y + s;
  }
  function faceIncipit(g, w, h, mx, top, cw, H) {
    var y = top;
    g.fillStyle = RED; var s = fitFont(g, 'Incipit', UNC, clamp(w * 0.045, 10, 18), cw); y += s; g.fillText('Incipit', w / 2, y);
    y += h * 0.025;
    // the title, its V a gilded initial
    var ts = fitFont(g, 'Vellum & Vermilion', UNC, clamp(w * 0.1, 14, 46), cw);
    var tw = g.measureText('Vellum & Vermilion').width, vw = g.measureText('V').width, tx = w / 2 - tw / 2;
    y += ts * 1.05;
    g.textAlign = 'left';
    g.fillStyle = goldFill(g, tx, y - ts, tx + vw, y); g.fillText('V', tx, y);
    g.strokeStyle = RED; g.lineWidth = Math.max(0.6, ts * 0.03); g.strokeText('V', tx, y);
    g.fillStyle = INKC; g.fillText('ellum & ', tx + vw, y);
    var aw = g.measureText('ellum & ').width;
    g.fillStyle = RED; g.fillText('Vermilion', tx + vw + aw, y);
    g.textAlign = 'center';
    y += ts * 0.55;
    g.fillStyle = 'rgba(42,27,16,0.8)'; var is = clamp(w * 0.036, 10, 17); font(g, is, FELL, 'italic');
    g.fillText(ellip(g, 'thirty knotwork pages in five quires', cw), w / 2, y + is); y += is * 2.2;
    // contents
    var save = G.save(), rows = [];
    for (var q = 1; q <= 5; q++) {
      var k = 0; G.LEVELS.forEach(function (l) { if (l.quire === q && save.solved[l.n]) k++; });
      rows.push({ face: q, a: 'Quire ' + QN[q - 1], b: G.RULES[q].title, c: k + '/6', done: k === 6 });
    }
    var bk = BEASTS.filter(found).length;
    rows.push({ face: F_BEST, a: '', b: 'The Bestiary', c: bk + '/9', done: bk === 9 });
    rows.push({ face: F_COLO, a: '', b: 'Colophon', c: allDone() ? '❧' : '', done: allDone() });
    var avail = h - y - Math.max(40, h * 0.08), rh = clamp(avail / rows.length, 16, 46), fs = clamp(rh * 0.42, 10, 19);
    rows.forEach(function (r, i) {
      var ry = y + i * rh, by = ry + rh * 0.62;
      if (r.done) { g.fillStyle = 'rgba(214,170,70,0.18)'; g.fillRect(mx, ry + rh * 0.08, cw, rh * 0.84); }
      g.textAlign = 'left';
      var x = mx + 4;
      if (r.a) { g.fillStyle = RED; font(g, fs, UNC); g.fillText(r.a, x, by); x += g.measureText(r.a).width + fs * 0.5; }
      g.textAlign = 'right'; font(g, fs * 0.95, FELL); g.fillStyle = r.done ? '#7a5410' : 'rgba(42,27,16,0.7)';
      g.fillText(r.c, mx + cw - 4, by);
      var cwid = g.measureText(r.c).width;
      g.textAlign = 'left'; g.fillStyle = INKC; font(g, fs, FELL, 'italic');
      var label = ellip(g, r.b, mx + cw - 4 - cwid - fs - x);
      g.fillText(label, x, by);
      // a dotted leader
      var lx = x + g.measureText(label).width + fs * 0.4, rx = mx + cw - 4 - cwid - fs * 0.4;
      g.fillStyle = 'rgba(120,70,40,0.45)';
      for (var dx = lx; dx < rx; dx += fs * 0.5) { g.beginPath(); g.arc(dx, by - fs * 0.25, 0.8, 0, 6.283); g.fill(); }
      H.push({ x: mx, y: ry, w: cw, h: rh, act: { goto: r.face } });
    });
    g.textAlign = 'center';
    g.fillStyle = 'rgba(42,27,16,0.55)'; font(g, clamp(w * 0.03, 9, 14), FELL, 'italic');
    g.fillText(ellip(g, 'tap a page to play · swipe to turn', cw), w / 2, h - Math.max(24, h * 0.055));
  }
  function faceQuire(q, g, w, h, mx, top, cw, H) {
    var y = rubricTitle(g, 'Quire ' + QN[q - 1] + ' · ' + G.RULES[q].title, w, top, cw, clamp(w * 0.062, 11, 28));
    var rs = clamp(w * 0.034, 10, 17); font(g, rs, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.85)';
    var lines = wrap(g, G.RULES[q].text, cw);
    y += rs * 0.6;
    lines.forEach(function (ln) { y += rs * 1.22; g.fillText(ln, w / 2, y); });
    y += rs * 1.7;   // room for the marker above the first row
    var save = G.save(), nxt = nextUnsolved(), pages = G.LEVELS.filter(function (l) { return l.quire === q; });
    var cols = w / h > 0.7 ? 3 : 2, rows = 6 / cols, gh = h - y - Math.max(34, h * 0.07);
    var cellW = cw / cols, cellH = gh / rows, cap = clamp(Math.min(cellH * 0.13, cellW * 0.12), 9, 16), bs = Math.min(cellW * 0.86, cellH - cap * 2.8);
    // rows sit together rather than spreading down the whole leaf
    var tight = Math.min(cellH, bs + cap * 2.6 + 6 + clamp(bs * 0.32, 18, 34) * 0.45);
    y += (gh - tight * rows) * 0.3; cellH = tight;
    pages.forEach(function (l, i) {
      var cx = mx + (i % cols) * cellW, cy = y + Math.floor(i / cols) * cellH, bx = cx + (cellW - bs) / 2, by = cy + 2;
      var ok = G.unlocked(l.n), sv = !!save.solved[l.n], r;
      if (!ok) {
        g.fillStyle = 'rgba(255,250,232,0.35)'; g.fillRect(bx, by, bs, bs);
        g.strokeStyle = 'rgba(150,60,40,0.18)'; g.lineWidth = 0.8;
        for (var k = 1; k < 7; k++) { g.beginPath(); g.moveTo(bx + bs * 0.1, by + bs * k / 7); g.lineTo(bx + bs * 0.9, by + bs * k / 7); g.stroke(); }
        g.strokeStyle = 'rgba(110,70,40,0.3)'; g.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);
        ART.draw(g, 'book.seal', bx + bs * 0.3, by + bs * 0.3, bs * 0.4, bs * 0.4, 0, {});
        r = { x: bx, y: by, w: bs, h: bs };
      } else if (sv) {
        r = drawThumbInBox(g, thumb(l.n), bx, by, bs);
        g.strokeStyle = 'rgba(184,139,58,0.8)'; g.lineWidth = 1; g.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
      } else {
        g.save();
        try { g.filter = 'grayscale(1) sepia(0.45) contrast(0.8) brightness(1.1)'; } catch (e) {}
        g.globalAlpha = 0.5;
        r = drawThumbInBox(g, thumb(l.n), bx, by, bs);
        g.restore();
        if (l.n === nxt) {
          g.strokeStyle = 'rgba(168,38,26,0.6)'; g.lineWidth = 1.2; g.setLineDash([3, 3]);
          g.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6); g.setLineDash([]);
        }
      }
      if (l.n === nxt) marker = { face: q, x: r.x - 4, y: r.y - 4, s: clamp(bs * 0.32, 18, 34) };
      // caption: folio and name (a sealed page keeps its name)
      font(g, cap, FELL, 'italic'); g.fillStyle = ok ? INKC : 'rgba(42,27,16,0.45)';
      var txt = FN[l.folio - 1] + ' · ' + (ok ? l.name : 'locked');
      g.fillText(ellip(g, txt, cellW * 0.96), cx + cellW / 2, by + bs + cap * 1.25);
      if (sv) { g.fillStyle = '#9a6f10'; font(g, cap, FELL); }
      H.push({ x: cx, y: cy, w: cellW, h: cellH, act: { page: l.n, ok: ok } });
    });
  }
  var silCache = {};
  function silhouette(id, s, t) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = id + Math.round(s) + dpr;
    if (silCache[key]) return silCache[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = Math.max(1, Math.round(s * dpr));
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    ART.draw(g, 'drollery.' + id, 0, 0, s, s, 1000, { awake: 0 });
    g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(70,45,25)'; g.fillRect(0, 0, s, s);
    silCache[key] = cv; return cv;
  }
  function faceBestiary(g, w, h, mx, top, cw, H, t) {
    var y = rubricTitle(g, 'The Bestiary', w, top, cw, clamp(w * 0.062, 11, 28));
    var fk = BEASTS.filter(found).length, ss = clamp(w * 0.034, 10, 16);
    font(g, ss, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.8)';
    y += ss * 1.6; g.fillText(fk ? fk + ' of 9 found' : 'none found yet', w / 2, y);
    y += ss * 0.8;
    var nameH = clamp(h * 0.09, 22, 54), gh = h - y - nameH - Math.max(26, h * 0.05), cell = Math.min(cw / 3, gh / 3);
    var gx = (w - cell * 3) / 2, gy = y + (gh - cell * 3) / 2, r = cell * 0.42;
    BEASTS.forEach(function (id, i) {
      var cx = gx + (i % 3 + 0.5) * cell, cy = gy + (Math.floor(i / 3) + 0.5) * cell, isF = found(id);
      g.fillStyle = isF ? 'rgba(255,250,232,0.55)' : 'rgba(255,250,232,0.25)';
      g.beginPath(); g.arc(cx, cy, r * 0.94, 0, 6.283); g.fill();
      var ds = r * 1.5;
      if (isF) {
        var w0 = best.woke[id], awake = w0 === undefined ? 0 : clamp((t - w0) / 1100, 0, 1);
        g.save(); g.beginPath(); g.arc(cx, cy, r * 0.9, 0, 6.283); g.clip();
        ART.draw(g, 'drollery.' + id, cx - ds / 2, cy - ds / 2, ds, ds, t, { awake: awake });
        g.restore();
      } else {
        g.save(); g.globalAlpha = 0.2; g.drawImage(silhouette(id, ds), cx - ds / 2, cy - ds / 2, ds, ds); g.restore();
        g.fillStyle = 'rgba(110,60,30,0.6)'; var qs = Math.floor(r * 0.7); font(g, qs, UNC); g.fillText('?', cx, cy + qs * 0.35);
      }
      ART.draw(g, 'book.roundel', cx - r, cy - r, 2 * r, 2 * r, t, {});
      H.push({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, act: { beast: id, found: isF } });
    });
    var ny = gy + cell * 3 + nameH * 0.62;
    if (best.sel) {
      var a = clamp((t - best.selT) / 300, 0, 1), ns = clamp(nameH * 0.5, 11, 26);
      g.globalAlpha = a; g.fillStyle = RED; fitFont(g, best.sel.text, UNC, ns, cw);
      g.fillText(best.sel.text, w / 2, ny); g.globalAlpha = 1;
    } else if (fk) {
      font(g, clamp(nameH * 0.32, 9, 15), FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.55)';
      g.fillText(ellip(g, 'tap a creature to wake it', cw), w / 2, ny);
    }
  }
  function faceColophon(g, w, h, mx, top, cw, H) {
    var y = rubricTitle(g, 'Colophon', w, top, cw, clamp(w * 0.07, 12, 30)), done = allDone(), k = solvedCount();
    if (!done) {
      y += h * 0.12;
      var s = clamp(w * 0.05, 12, 24); font(g, s, FELL, 'italic'); g.fillStyle = INKC;
      wrap(g, 'The book is not finished yet.', cw).forEach(function (ln) { g.fillText(ln, w / 2, y); y += s * 1.3; });
      y += s * 0.6; var s2 = clamp(w * 0.034, 10, 16); font(g, s2, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.7)';
      g.fillText(k + ' of 30 pages finished', w / 2, y); y += s2 * 2;
      // thirty little squares, gilt where a page is done
      var n = G.LEVELS.length, per = 10, sq = Math.min(cw / per * 0.7, 18), gap = sq * 0.45, rowW = per * sq + (per - 1) * gap;
      for (var i = 0; i < n; i++) {
        var x = w / 2 - rowW / 2 + (i % per) * (sq + gap), yy = y + Math.floor(i / per) * (sq + gap);
        if (G.save().solved[i + 1]) { g.fillStyle = goldFill(g, x, yy, x + sq, yy + sq); g.fillRect(x, yy, sq, sq); }
        g.strokeStyle = 'rgba(110,70,40,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, yy + 0.5, sq - 1, sq - 1);
      }
      return;
    }
    y += h * 0.04;
    // the five gilded initials, L U M E N, in a row
    var bw = cw / 5, bs = Math.min(bw * 0.92, h * 0.2);
    LETTERS.forEach(function (n, i) { drawThumbInBox(g, thumb(n, true), mx + i * bw + (bw - bs) / 2, y, bs); });
    y += bs + h * 0.07;
    g.fillStyle = RED; var ls = fitFont(g, 'LUMEN — light', UNC, clamp(w * 0.085, 14, 40), cw);
    g.fillText('LUMEN — light', w / 2, y); y += ls * 0.9;
    var ns = clamp(w * 0.035, 10, 17); font(g, ns, FELL, 'italic'); g.fillStyle = INKC;
    var note = 'All thirty pages are finished. Thank you for playing.';
    wrap(g, note, cw * 0.94).forEach(function (ln) { y += ns * 1.35; g.fillText(ln, w / 2, y); });
    y += ns * 1.6; g.textAlign = 'right'; g.fillStyle = RED; font(g, ns, FELL, 'italic');
    g.fillText('— the scribe', mx + cw, y); g.textAlign = 'center';
  }
  function renderCover(cv, w, h) {
    var g = prep(cv, w, h);
    ART.draw(g, 'cover.leather', 0, 0, w, h, 0, {});
    var m = Math.min(w, h), b = m * 0.11, cs = m * 0.17;
    [[b, b, 0], [w - b - cs, b, 1], [w - b - cs, h - b - cs, 2], [b, h - b - cs, 3]].forEach(function (c) {
      ART.draw(g, 'cover.corner', c[0], c[1], cs, cs, 0, { angle: c[2] * Math.PI / 2 });
    });
    var R = Math.min(w * 0.3, h * 0.2);
    ART.draw(g, 'cover.medallion', w / 2 - R, h * 0.6 - R, 2 * R, 2 * R, 0, {});
    ART.draw(g, 'cover.title', b + cs * 0.5, h * 0.16, w - 2 * b - cs, h * 0.22, 0, { text: 'Vellum\n& Vermilion' });
    var cw = w * 0.13, ch = h * 0.085;
    ART.draw(g, 'cover.clasp', w - cw, h * 0.26 - ch / 2, cw, ch, 0, {});
    ART.draw(g, 'cover.clasp', w - cw, h * 0.74 - ch / 2, cw, ch, 0, {});
  }
  function prep(cv, w, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return g;
  }
  function drawFaceTo(cv, f, side, t) {
    var g = prep(cv, L.pw, L.ph);
    if (f === 'verso') { paper(g, L.pw, L.ph, side); return; }
    if (f === 'endpaper') { ART.draw(g, 'cover.endpaper', 0, 0, L.pw, L.ph, 0, {}); return; }
    if (f === 'cover') { renderCover(cv, L.pw, L.ph); return; }
    renderFace(f, g, L.pw, L.ph, side, t || now());
  }

  /* ================= layout ================= */
  var L = { spread: false, pw: 300, ph: 400, W: 0, H: 0, left: 0, top: 0 };
  var el = {};
  function computeLayout() {
    var W = window.innerWidth, H = window.innerHeight, sp = W >= 600 && W > H;
    var topH = 52, pw, ph, availW, availH;
    if (sp) {
      availW = W - 2 * 56 - 12; availH = H - topH - 14;
      pw = Math.floor(Math.min(availW / 2, availH * 0.74)); ph = Math.floor(Math.min(availH, pw * 1.5));
    } else {
      availW = W - 16; availH = H - topH - 60;
      pw = Math.floor(Math.min(availW, 560, availH * 0.8)); ph = Math.floor(Math.min(availH, pw * 1.62));
    }
    var sw = sp ? 2 * pw : pw;
    L = { spread: sp, pw: pw, ph: ph, W: W, H: H, sw: sw, left: Math.round((W - sw) / 2), top: Math.round(topH + (availH - ph) / 2) };
    var s = el.spread.style;
    s.left = L.left + 'px'; s.top = L.top + 'px'; s.width = sw + 'px'; s.height = ph + 'px';
    [el.fA, el.fB, el.leaf].forEach(function (e) { e.style.width = pw + 'px'; e.style.height = ph + 'px'; });
    el.fA.style.left = '0px'; el.fB.style.left = pw + 'px';
    el.fB.style.display = sp ? '' : 'none';
    document.body.classList.toggle('bkSpread', sp);
    // the closed book: the cover alone, a little smaller, centred above the buttons
    var room = H - 24 - 120, k = Math.min(1, room / ph, (W - 24) / pw);
    var cy = 12 + room / 2 + 6, dy = cy - (L.top + ph / 2);
    L.closed = { k: k, dx: sp ? -pw / 2 * k : 0, dy: dy };
    // hot corners at the outer foot of the leaves
    var cs = 46;
    el.cornL.style.cssText = 'left:0;top:' + (ph - cs) + 'px;width:' + cs + 'px;height:' + cs + 'px';
    el.cornR.style.cssText = 'left:' + (sw - cs) + 'px;top:' + (ph - cs) + 'px;width:' + cs + 'px;height:' + cs + 'px';
  }
  function posCount() { return L.spread ? NFACES / 2 : NFACES; }
  function posOfFace(f) { return L.spread ? f >> 1 : f; }
  function facesOf(p) { return L.spread ? [2 * p, 2 * p + 1] : [p]; }

  /* ================= state ================= */
  var SLOW = 1, mode = 'hidden', pos = 0, T = null, busyUntil = 0, tween = null, liveRaf = 0;
  function busy() { return now() < busyUntil || !!T || !!tween; }
  function lock(ms) { busyUntil = Math.max(busyUntil, now() + ms); }
  function setStatic() {
    var fs = facesOf(pos);
    marker = null;
    drawFaceTo(el.cA, fs[0], L.spread ? 'L' : 'R');
    if (L.spread) drawFaceTo(el.cB, fs[1], 'R');
    el.shA.style.background = 'none'; el.shB.style.background = 'none';
    placeMarker();
    var s = G.save(); s.face = fs[0]; G.persist();
    el.pos.textContent = labelOf(fs);
    el.prev.disabled = pos <= 0; el.next.disabled = pos >= posCount() - 1;
  }
  function labelOf(fs) {
    return fs.map(function (f) { return f === 0 ? 'Incipit' : f <= 5 ? 'Quire ' + QN[f - 1] : f === F_BEST ? 'Bestiary' : 'Colophon'; }).join(' · ');
  }
  function placeMarker() {
    var fs = facesOf(pos), m = marker, mk = el.mark;
    if (!m || fs.indexOf(m.face) < 0 || mode !== 'open') { mk.style.display = 'none'; return; }
    var ox = L.spread && fs[1] === m.face ? L.pw : 0;
    mk.style.display = 'block'; mk.style.left = (ox + m.x - m.s * 0.3) + 'px'; mk.style.top = (m.y - m.s * 0.3) + 'px';
    mk.style.fontSize = m.s + 'px';
  }
  // re-render the faces in view (after a solve, a font or an art PNG arriving)
  function refresh() {
    if (mode === 'hidden') return;
    thumbs = {};
    computeLayout();
    if (mode === 'open') setStatic();
    else if (mode === 'closed') { drawFaceTo(el.cF, 'cover'); drawFaceTo(el.cK, 'endpaper'); }
  }
  function liveLoop() {
    liveRaf = 0;
    if (mode !== 'open') return;
    var fs = facesOf(pos), bi = fs.indexOf(F_BEST);
    if (bi >= 0 && !T) {
      var t = now(), cv = bi === 0 ? el.cA : el.cB, g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, L.pw, L.ph);
      renderFace(F_BEST, g, L.pw, L.ph, L.spread ? (bi ? 'R' : 'L') : 'R', t);
    }
    if (bi >= 0) setTimeout(function () { if (!liveRaf) liveRaf = requestAnimationFrame(liveLoop); }, 40);
  }
  function startLive() { if (!liveRaf) liveRaf = requestAnimationFrame(liveLoop); }

  /* ================= the leaf: page turns ================= */
  function leafShow(on) { el.leaf.style.display = on ? 'block' : 'none'; el.leaf.style.opacity = '1'; }
  function leafAt(x, origin) { el.leaf.style.left = x + 'px'; el.leaf.style.transformOrigin = origin; }
  function setAngle(a) { el.leaf.style.transform = 'translateZ(1px) rotateY(' + a + 'deg)'; }
  function beginTurn(to) {
    if (T || tween || mode !== 'open' || to === pos || to < 0 || to >= posCount()) return false;
    var dir = to > pos ? 1 : -1, fs = facesOf(pos), ts = facesOf(to);
    T = { from: pos, to: to, dir: dir, p: 0 };
    el.mark.style.display = 'none';
    el.leaf.classList.remove('cover');
    if (L.spread) {
      if (dir > 0) {
        leafAt(L.pw, 'left center'); drawFaceTo(el.cF, fs[1], 'R'); drawFaceTo(el.cK, ts[0], 'L');
        drawFaceTo(el.cB, ts[1], 'R'); T.under = el.shB; T.angle = function (p) { return -180 * p; };
      } else {
        leafAt(0, 'right center'); drawFaceTo(el.cF, fs[0], 'L'); drawFaceTo(el.cK, ts[1], 'R');
        drawFaceTo(el.cA, ts[0], 'L'); T.under = el.shA; T.angle = function (p) { return 180 * p; };
      }
    } else {
      leafAt(0, 'left center');
      if (dir > 0) { drawFaceTo(el.cF, fs[0], 'R'); drawFaceTo(el.cK, 'verso', 'L'); drawFaceTo(el.cA, ts[0], 'R'); T.angle = function (p) { return -180 * p; }; }
      else { drawFaceTo(el.cF, ts[0], 'R'); drawFaceTo(el.cK, 'verso', 'L'); T.angle = function (p) { return -180 * (1 - p); }; }
      T.under = el.shA;
    }
    leafShow(true); applyTurn(0);
    return true;
  }
  function applyTurn(p) {
    T.p = p;
    var a = T.angle(p), s = Math.abs(Math.sin(a * Math.PI / 180)), front = Math.abs(a) < 90;
    setAngle(a);
    // the lifted leaf darkens toward its fold; the leaf beneath takes a shadow along the spine
    var fromSpine = el.leaf.style.transformOrigin.indexOf('left') === 0 ? 'to right' : 'to left';
    el.shF.style.background = 'linear-gradient(' + fromSpine + ', rgba(40,20,5,' + (0.35 * s) + '), rgba(40,20,5,' + (0.08 * s) + ') 60%, rgba(255,245,220,' + (0.12 * s) + '))';
    el.shK.style.background = 'linear-gradient(' + (fromSpine === 'to right' ? 'to left' : 'to right') + ', rgba(40,20,5,' + (0.3 * s) + '), rgba(40,20,5,0) 70%)';
    var underSide = T.under === el.shB || !L.spread ? 'to right' : 'to left';
    var cover = L.spread ? (front ? 1 : 0) : 1;
    T.under.style.background = 'linear-gradient(' + underSide + ', rgba(30,15,5,' + (0.45 * s * cover + 0.1 * s) + '), rgba(30,15,5,0) ' + Math.round(30 + 50 * s) + '%)';
    if (!L.spread) el.leaf.style.opacity = String(T.dir > 0 ? clamp((1 - p) / 0.18, 0, 1) : clamp(p / 0.18, 0, 1));
  }
  function finishTurn(complete, dur) {
    if (!T) return;
    var p0 = T.p, p1 = complete ? 1 : 0, t0 = now(), d = dur || (140 + 460 * Math.abs(p1 - p0));
    tween = { stop: false };
    (function step() {
      if (!T) { tween = null; return; }
      var k = clamp((now() - t0) / d, 0, 1);
      applyTurn(p0 + (p1 - p0) * ease(k));
      if (k < 1) { requestAnimationFrame(step); return; }
      var to = T.to;
      if (complete) pos = to;
      T = null; tween = null;
      setStatic();           // the new faces are on the static leaves before the turning leaf goes
      leafShow(false);
      startLive();
    })();
  }
  function turnTo(to, dur) { if (busy()) return; if (beginTurn(to)) finishTurn(true, dur || 620); }
  function turn(dir) { turnTo(pos + dir); }
  function gotoFace(f) { turnTo(posOfFace(f), 700); }

  /* ================= cover: open and close ================= */
  function spreadXf(k, dx, dy) { el.spread.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')'; }
  function showClosed() {
    mode = 'closed'; show(true);
    computeLayout();
    document.body.classList.add('bkClosed'); document.body.classList.remove('bkOpen');
    el.fA.style.visibility = 'hidden'; el.fB.style.visibility = 'hidden';
    el.leaf.classList.add('cover'); leafAt(L.spread ? L.pw : 0, 'left center'); leafShow(true); setAngle(0);
    el.shF.style.background = 'none'; el.shK.style.background = 'none';
    drawFaceTo(el.cF, 'cover'); drawFaceTo(el.cK, 'endpaper', 'L');
    spreadXf(L.closed.k, L.closed.dx, L.closed.dy);
    el.mark.style.display = 'none';
    var n = nextUnsolved(), s = G.save(), any = solvedCount() > 0 || Object.keys(s.prog || {}).length > 0;
    var cn = (s.current && !s.solved[s.current] && G.unlocked(s.current)) ? s.current : n;
    el.cont.style.display = any && cn ? '' : 'none';
    if (cn) { var l = G.LEVELS[cn - 1]; el.cont.textContent = 'Continue: Quire ' + QN[l.quire - 1] + ' · Folio ' + FN[l.folio - 1]; el.cont.dataset.n = cn; }
    s.screen = 'cover'; G.persist();
  }
  function startFace() { var n = nextUnsolved(); return n ? G.LEVELS[n - 1].quire : F_COLO; }
  function openBook(face) {
    if (mode !== 'closed' || busy()) return;
    lock(1200);
    pos = posOfFace(face === undefined ? startFace() : face);
    var fs = facesOf(pos), C = L.closed;
    drawFaceTo(L.spread ? el.cB : el.cA, L.spread ? fs[1] : fs[0], 'R');
    if (L.spread) drawFaceTo(el.cA, fs[0], 'L');
    el.fB.style.visibility = ''; el.fA.style.visibility = L.spread ? 'hidden' : '';
    document.body.classList.remove('bkClosed');
    var t0 = now(), D = 900 * SLOW;
    tween = {};
    (function step() {
      var k = clamp((now() - t0) / D, 0, 1), e = ease(k);
      spreadXf(C.k + (1 - C.k) * e, C.dx * (1 - e), C.dy * (1 - e));
      setAngle(-180 * e);
      var s = Math.abs(Math.sin(Math.PI * e));
      el.shF.style.background = 'linear-gradient(to right, rgba(20,5,2,' + (0.4 * s) + '), rgba(20,5,2,0))';
      (L.spread ? el.shB : el.shA).style.background = 'linear-gradient(to right, rgba(30,15,5,' + (0.5 * s) + '), rgba(30,15,5,0) 60%)';
      if (!L.spread) el.leaf.style.opacity = String(clamp((1 - k) / 0.2, 0, 1));
      if (k < 1) { requestAnimationFrame(step); return; }
      el.fA.style.visibility = '';
      var f0 = now();
      (function fade() {   // the endpaper lifts away to show the first leaf beneath it
        var q = clamp((now() - f0) / 200, 0, 1);
        el.leaf.style.opacity = String(L.spread ? 1 - q : 0);
        if (q < 1) { requestAnimationFrame(fade); return; }
        tween = null; leafShow(false); el.leaf.classList.remove('cover');
        mode = 'open'; document.body.classList.add('bkOpen');
        var sv = G.save(); sv.screen = 'book'; G.persist();
        setStatic(); startLive();
      })();
    })();
  }
  function closeBook() {
    if (mode !== 'open' || busy()) return;
    lock(1200);
    document.body.classList.remove('bkOpen');
    el.mark.style.display = 'none';
    var C = L.closed;
    // the right face (or the single face) stays beneath; the board comes back over from the left
    el.leaf.classList.add('cover'); leafAt(L.spread ? L.pw : 0, 'left center');
    drawFaceTo(el.cF, 'cover'); drawFaceTo(el.cK, 'endpaper', 'L');
    setAngle(-180); leafShow(true); el.leaf.style.opacity = '0';
    var t0 = now(), D = 900 * SLOW;
    tween = {};
    (function fadeIn() {
      var q = clamp((now() - t0) / 180, 0, 1);
      el.leaf.style.opacity = String(L.spread ? q : 1);
      if (q < 1) { requestAnimationFrame(fadeIn); return; }
      el.fA.style.visibility = L.spread ? 'hidden' : '';
      var t1 = now();
      (function step() {
        var k = clamp((now() - t1) / D, 0, 1), e = ease(k);
        setAngle(-180 * (1 - e));
        spreadXf(1 + (C.k - 1) * e, C.dx * e, C.dy * e);
        if (!L.spread) el.leaf.style.opacity = String(clamp(k / 0.2, 0, 1));
        var s = Math.abs(Math.sin(Math.PI * e));
        el.shF.style.background = 'linear-gradient(to right, rgba(20,5,2,' + (0.4 * s) + '), rgba(20,5,2,0))';
        if (k < 1) { requestAnimationFrame(step); return; }
        tween = null; showClosed();
      })();
    })();
  }

  /* ================= switching to and from the page screen ================= */
  function show(on) {
    el.scr.style.display = on ? 'block' : 'none';
    el.scr.classList.remove('fade');
  }
  function toPlay(n) {
    if (busy() || !G.unlocked(n)) return;
    lock(420);
    G.load(n);
    var s = G.save(); s.screen = 'play'; G.persist();
    el.scr.classList.add('fade');
    var m = mode; mode = 'hidden';
    setTimeout(function () { if (mode === 'hidden') { el.scr.style.display = 'none'; el.scr.classList.remove('fade'); } }, 300);
    if (m === 'closed') { el.leaf.classList.remove('cover'); }
  }
  // from the page screen back to the book, open at a face (default: the current page's quire)
  function fromPlay(face) {
    if (busy() || mode !== 'hidden') return;
    lock(350);
    var cur = G.current();
    if (face === undefined) face = cur ? cur.quire : 1;
    // a rule card or reset prompt left open on the page screen must not sit over the book
    Array.prototype.forEach.call(document.querySelectorAll('.modal.show'), function (m) { m.classList.remove('show'); });
    show(true); el.scr.classList.add('fade');
    mode = 'open'; thumbs = {};
    computeLayout(); spreadXf(1, 0, 0);
    document.body.classList.remove('bkClosed'); document.body.classList.add('bkOpen');
    el.fA.style.visibility = ''; el.fB.style.visibility = ''; leafShow(false); el.leaf.classList.remove('cover');
    pos = posOfFace(face);
    setStatic(); startLive();
    var s = G.save(); s.screen = 'book'; G.persist();
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.scr.classList.remove('fade'); }); });
  }
  function showOpenInstant(face) {
    mode = 'open'; show(true); computeLayout(); spreadXf(1, 0, 0);
    document.body.classList.remove('bkClosed'); document.body.classList.add('bkOpen');
    el.fA.style.visibility = ''; el.fB.style.visibility = ''; leafShow(false); el.leaf.classList.remove('cover');
    pos = posOfFace(face); setStatic(); startLive();
  }

  /* ================= input ================= */
  var drag = null;
  function faceAt(cx, cy) {
    var fs = facesOf(pos), r = el.cA.getBoundingClientRect();
    if (cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom) return { f: fs[0], x: (cx - r.left) * L.pw / r.width, y: (cy - r.top) * L.ph / r.height };
    if (L.spread) {
      r = el.cB.getBoundingClientRect();
      if (cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom) return { f: fs[1], x: (cx - r.left) * L.pw / r.width, y: (cy - r.top) * L.ph / r.height };
    }
    return null;
  }
  function tapAt(cx, cy) {
    var hit = faceAt(cx, cy); if (!hit) return;
    var list = hits[hit.f] || [];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (hit.x < h.x || hit.y < h.y || hit.x > h.x + h.w || hit.y > h.y + h.h) continue;
      var a = h.act;
      if (a.goto !== undefined) { gotoFace(a.goto); return; }
      if (a.page) { if (a.ok) toPlay(a.page); else nudgeSeal(); return; }
      if (a.beast) {
        if (a.found) { best.woke[a.beast] = now(); best.sel = { id: a.beast, text: NAMES[a.beast] || a.beast }; best.selT = now(); startLive(); if (window.SFX) window.SFX.whole('gold'); }
        else { best.sel = { id: '', text: 'Not found yet. Finish more pages.' }; best.selT = now(); startLive(); if (window.SFX) window.SFX.wiggle(); }
        return;
      }
    }
  }
  function nudgeSeal() { if (window.SFX) window.SFX.wiggle(); el.spread.classList.remove('nudge'); void el.spread.offsetWidth; el.spread.classList.add('nudge'); }
  function bindInput() {
    var sp = el.spread;
    sp.addEventListener('pointerdown', function (e) {
      if (window.SFX) window.SFX.unlock();
      if (mode !== 'open' || e.button > 0) return;
      if (e.target.classList.contains('corner')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
      try { sp.setPointerCapture(e.pointerId); } catch (er) {}
    });
    sp.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - drag.y) || busy()) return;
        var to = pos + (dx < 0 ? 1 : -1);
        if (!beginTurn(to)) { drag = null; return; }
        drag.on = true; drag.dir = dx < 0 ? 1 : -1;
      }
      var pw = L.pw, c, p;
      if (drag.dir > 0) { c = clamp(1 + dx / pw, -1, 1); p = Math.acos(c) / Math.PI; }
      else if (L.spread) { c = clamp(1 - dx / pw, -1, 1); p = Math.acos(c) / Math.PI; }
      else { c = clamp(-1 + dx / pw, -1, 1); p = 1 - Math.acos(c) / Math.PI; }
      applyTurn(clamp(p, 0, 1));
    });
    function up(e, cancel) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (d.on) { finishTurn(!cancel && Math.abs(e.clientX - d.x) > 70); return; }
      var fx = e.clientX - d.x;   // a quick flick can end before any move registers
      if (!cancel && Math.abs(fx) > 40 && Math.abs(fx) > Math.abs(e.clientY - d.y) && !busy()) { turn(fx < 0 ? 1 : -1); return; }
      if (!cancel && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && !busy()) tapAt(e.clientX, e.clientY);
    }
    sp.addEventListener('pointerup', function (e) { up(e, false); });
    sp.addEventListener('pointercancel', function (e) { up(e, true); });
    el.cornL.addEventListener('click', function () { if (mode === 'open') turn(-1); });
    el.cornR.addEventListener('click', function () { if (mode === 'open') turn(1); });
    el.prev.onclick = function () { turn(-1); };
    el.next.onclick = function () { turn(1); };
    el.close.onclick = function () { closeBook(); };
    el.open.onclick = function (e) { e.stopPropagation(); openBook(); };
    el.cont.onclick = function (e) { e.stopPropagation(); if (mode === 'closed' && !busy()) toPlay(+el.cont.dataset.n); };
    el.scr.addEventListener('click', function (e) {
      if (mode !== 'closed' || e.target === el.cont) return;
      if (window.SFX) window.SFX.unlock();
      openBook();
    });
    document.addEventListener('keydown', function (e) {
      if (mode === 'open') {
        if (e.key === 'ArrowRight') { turn(1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { turn(-1); e.preventDefault(); }
      } else if (mode === 'closed' && (e.key === 'Enter' || e.key === ' ')) { openBook(); e.preventDefault(); }
    });
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (mode === 'hidden') return;
        if (T || tween) { setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 400); return; }
        var f = facesOf(pos)[0];
        computeLayout(); pos = posOfFace(f);
        if (mode === 'closed') showClosed(); else { spreadXf(1, 0, 0); setStatic(); }
      }, 80);
    });
  }

  /* ================= public ================= */
  var Book = {
    init: function (game) {
      G = game; beastsInit();
      ['scr', 'spread', 'fA', 'fB', 'cA', 'cB', 'shA', 'shB', 'leaf', 'cF', 'cK', 'shF', 'shK', 'mark', 'cornL', 'cornR', 'prev', 'next', 'pos', 'close', 'open', 'cont']
        .forEach(function (k) { el[k] = $('bk_' + k); });
      bindInput();
    },
    // first screen: a reload within the same visit returns where the reader was; a fresh visit shows the cover
    boot: function () {
      var live = false;
      try { live = !!sessionStorage.getItem('vv.live'); sessionStorage.setItem('vv.live', '1'); } catch (e) {}
      var s = G.save();
      if (live && s.screen === 'play') { mode = 'hidden'; show(false); G.load(s.current || 1); }
      else if (live && s.screen === 'book') showOpenInstant(s.face || 0);
      else showClosed();
    },
    fromPlay: fromPlay,
    refresh: refresh,
    mode: function () { return mode; },
    // test hooks
    open: function (f) { openBook(f); }, close: closeBook, turn: turn, goto: gotoFace, play: toPlay,
    state: function () { return { mode: mode, pos: pos, faces: facesOf(pos), spread: L.spread, pw: L.pw, ph: L.ph, turning: !!T, busy: busy(), marker: marker }; },
    _applyTurn: function (to, p) { if (beginTurn(to)) applyTurn(p); return !!T; },
    _finish: function (c) { finishTurn(c); },
    _slow: function (k) { SLOW = k || 1; }
  };
  window.Book = Book;
})();
