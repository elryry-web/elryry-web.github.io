/* Vellum & Vermilion — the cover and the Book (contents, Bestiary of the Margins, Colophon).
   Book.init(game) is called by main.js with its API; Book.boot() picks the first screen.
   Screens: 'closed' (the cover on the desk), 'open' (the book, leaf by leaf), 'hidden' (the page screen is showing).
   Faces (leaves) of the open book: 0 Incipit · 1-5 the quires · 6 the Bestiary · 7 the Colophon.
   Wide screens show them as spreads (0|1, 2|3, 4|5, 6|7); phones show one face at a time.
   Art slots defined here (a PNG in art/manifest.json replaces any of them):
     cover.leather  the whole front board: tooled oxblood leather with blind-tooled frames
     cover.corner   one gold-tooled corner piece, drawn for the top-left corner (opts.angle turns it)
     cover.medallion the round knotwork medallion in the middle of the board
     cover.clasp    one brass clasp on the fore-edge (the box's right edge is the board's edge): strap, hook and keeper pin
     cover.title    the gold title lettering (opts.text: lines joined by \n)
     cover.endpaper the inside of the front board (the pastedown); a PNG is mirrored so its lacing sits at the hinge
     cover.spine    (PNG only) the spine, stood behind the hinge: its edge and headbands show beside the cover / gutter
     cover.pages    (PNG only) the page block, the thin edge of leaves showing below and right of the closed cover
     cover.flyleaf  (PNG only) the blank leaf facing the pastedown as the cover opens; it lifts away with the endpaper
   With a painted cover.leather the corners, clasps, medallion and title are laid out for its recessed panel
   (PAINTED below) instead of the drawn board's frames.
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
    var gr = g.createRadialGradient(w * 0.45, h * 0.4, Math.max(0, Math.min(w, h) * 0.1), w * 0.5, h * 0.5, Math.max(1, Math.max(w, h) * 0.8));
    gr.addColorStop(0, '#6e2219'); gr.addColorStop(0.6, '#561811'); gr.addColorStop(1, '#3a0f0a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 60; i++) {   // mottling and wear
      var x = R() * w, y = R() * h, r = 10 + R() * Math.max(0, Math.min(w, h)) * 0.22, m = g.createRadialGradient(x, y, 0, x, y, r);
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
  ART.define('cover.clasp', function (g, x, y, w, h, t, o) {
    // a leather strap laid over the fore-edge from the back board, a riveted brass plate on its end,
    // and a hook that curls round the pin of a keeper riveted to the front board. Light from the top
    // right, so shadows fall down and a little left. o.part draws one piece: 'keeper' (plate and pin,
    // on the front board), 'strap' (strap, plate and hook, which belong to the back board) or 'pin'
    var part = o && o.part, K = !part || part === 'keeper', SP = !part || part === 'strap', PN = !part || part === 'keeper' || part === 'pin';
    var cy = y + h * 0.5, sw = Math.max(1, h * 0.02);
    var pcx = x + w * 0.26, pr = h * 0.085, lw = h * 0.12, rr = pr + lw * 0.5;
    function brass(x0, y0, x1, y1) {
      var b = g.createLinearGradient(x0, y0, x1, y1);
      b.addColorStop(0, '#f1d48a'); b.addColorStop(0.45, '#b98a34'); b.addColorStop(0.6, '#8a6220'); b.addColorStop(1, '#d9b45e');
      return b;
    }
    function rivet(rx, ry, r) {
      g.fillStyle = '#4a300c'; g.beginPath(); g.arc(rx - r * 0.15, ry + r * 0.3, r, 0, 6.283); g.fill();
      g.fillStyle = '#e8cd84'; g.beginPath(); g.arc(rx, ry, r * 0.8, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,248,215,0.9)'; g.beginPath(); g.arc(rx + r * 0.25, ry - r * 0.25, r * 0.25, 0, 6.283); g.fill();
    }
    // the keeper: a small plate set into the leather (dark rim), two rivets and the pin
    var kx = x + w * 0.03, kw = w * 0.34, ky = y + h * 0.1, kh = h * 0.8;
    if (K) {
      g.fillStyle = 'rgba(15,3,2,0.6)'; g.fillRect(kx - sw, ky - sw, kw + 2 * sw, kh + 2 * sw);
      g.fillStyle = brass(kx, ky, kx, ky + kh); g.fillRect(kx, ky, kw, kh);
      g.strokeStyle = '#4a300c'; g.lineWidth = sw; g.strokeRect(kx, ky, kw, kh);
      rivet(pcx - w * 0.05, y + h * 0.19, h * 0.05); rivet(pcx - w * 0.05, y + h * 0.81, h * 0.05);
    }
    if (SP) strap();
    if (PN) pin();
    function strap() {
    // the strap's cast shadow, then the strap, darkening as it bends round the fore-edge
    var sx = x + w * 0.58, sy = cy - h * 0.2, sh = h * 0.4;
    g.fillStyle = 'rgba(10,3,1,0.45)'; g.fillRect(sx - h * 0.04, sy + h * 0.07, x + w - sx, sh);
    var st = g.createLinearGradient(x + w * 0.75, 0, x + w, 0);
    st.addColorStop(0, '#5a1810'); st.addColorStop(0.55, '#4a130c'); st.addColorStop(0.7, '#7a3a2a'); st.addColorStop(0.8, '#3a0f0a'); st.addColorStop(1, '#1a0503');
    g.fillStyle = st; g.fillRect(sx, sy, x + w - sx, sh);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = sw; g.strokeRect(sx, sy, x + w - sx + sw, sh);
    var px = x + w * 0.46, pw = w * 0.24;
    // the hook: out from under the plate, round the left of the pin, a short tail back under it
    function hook() { g.beginPath(); g.moveTo(px + pw * 0.2, cy - rr); g.lineTo(pcx, cy - rr); g.arc(pcx, cy, rr, -Math.PI / 2, Math.PI / 2, true); g.lineTo(pcx + rr * 0.7, cy + rr); }
    g.lineCap = 'round';
    g.save(); g.translate(-h * 0.03, h * 0.05); g.strokeStyle = 'rgba(10,3,1,0.45)'; g.lineWidth = lw; hook(); g.stroke(); g.restore();
    g.strokeStyle = '#4a300c'; g.lineWidth = lw + 2 * sw; hook(); g.stroke();
    g.strokeStyle = brass(pcx, cy - rr - lw / 2, pcx, cy + rr + lw / 2); g.lineWidth = lw; hook(); g.stroke();
    g.strokeStyle = 'rgba(255,240,190,0.55)'; g.lineWidth = Math.max(0.6, lw * 0.18);
    g.beginPath(); g.moveTo(px + pw * 0.2, cy - rr - lw * 0.22); g.lineTo(pcx, cy - rr - lw * 0.22); g.stroke();
    g.lineCap = 'butt';
    // the plate on the strap's end, with its shadow
    function plate() { g.beginPath(); g.moveTo(px, y + h * 0.2); g.lineTo(px + pw, y + h * 0.06); g.lineTo(px + pw, y + h * 0.94); g.lineTo(px, y + h * 0.8); g.closePath(); }
    g.save(); g.translate(-h * 0.04, h * 0.07); g.fillStyle = 'rgba(10,3,1,0.45)'; plate(); g.fill(); g.restore();
    g.fillStyle = brass(px, y, px, y + h); g.strokeStyle = '#4a300c'; g.lineWidth = sw; plate(); g.fill(); g.stroke();
    rivet(px + pw * 0.62, y + h * 0.24, h * 0.055); rivet(px + pw * 0.62, y + h * 0.76, h * 0.055);
    }
    // the pin's head, over the hook
    function pin() {
    g.fillStyle = 'rgba(10,3,1,0.5)'; g.beginPath(); g.arc(pcx - pr * 0.2, cy + pr * 0.35, pr * 1.15, 0, 6.283); g.fill();
    g.fillStyle = brass(pcx, cy - pr, pcx, cy + pr); g.strokeStyle = '#3a2408'; g.lineWidth = sw;
    g.beginPath(); g.arc(pcx, cy, pr * 1.1, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,248,215,0.85)'; g.beginPath(); g.arc(pcx + pr * 0.3, cy - pr * 0.35, pr * 0.3, 0, 6.283); g.fill();
    }
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
  // a canvas let go of: its pixels are freed at once, not whenever the collector gets to it (phones run short)
  function zap(cv) { if (cv && cv.getContext) { cv.width = 0; cv.height = 0; } }
  function freeAll(o) { for (var k in o) zap(o[k]); return {}; }
  var paperCache = {};
  function paperCanvas(w, h, side, variant) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), pv = ART.has('page') ? (variant | 0) : 0;
    var key = Math.round(w) + 'x' + Math.round(h) + side + dpr + ':' + pv + ART.has('page');
    if (!paperCache[key]) paperCache[key] = ART.makePage(Math.round(w), Math.round(h), dpr, side === 'L' ? 'left' : 'right', pv);
    return paperCache[key];
  }
  // variant: the face number (a painted page is flipped and shifted per leaf, so its stains and the
  // stitched repair differ from leaf to leaf)
  function paper(g, w, h, side, variant) {
    g.drawImage(paperCanvas(w, h, side, variant), 0, 0, w, h);
    gutter(g, w, h, side);
  }
  function gutter(g, w, h, side) {
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
    if (!tb) { tb = new window.Board(document.createElement('canvas'), {}); clearInterval(tb._idle); tb.mini = true; }
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
    if (!(w > 0 && h > 0)) { hits[f] = []; return; }   // a window with no size yet: drawn once it has one
    paper(g, w, h, side, f + 1);
    var H = hits[f] = [];
    var mx = Math.max(14, w * 0.09), top = Math.max(12, h * 0.05), cw = w - 2 * mx;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (f === 0) faceIncipit(g, w, h, mx, top, cw, H);
    else if (f <= 5) faceQuire(f, g, w, h, mx, top, cw, H);
    else if (f === F_BEST) faceBestiary(g, w, h, mx, top, cw, H, t);
    else faceColophon(g, w, h, mx, top, cw, H, t);
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
  function silhouette(id, bw, bh) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = id + Math.round(bw) + 'x' + Math.round(bh) + dpr + ART.has('drollery.' + id);
    if (silCache[key]) return silCache[key];
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bw * dpr)); cv.height = Math.max(1, Math.round(bh * dpr));
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    ART.draw(g, 'drollery.' + id, 0, 0, bw, bh, 1000, { awake: 0 });
    g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(70,45,25)'; g.fillRect(0, 0, bw, bh);
    silCache[key] = cv; return cv;
  }
  // where a beast sits in its roundel: a square for a drawn one; a painted (PNG) one keeps its own aspect,
  // the creature (the top of the picture) centred in the ring and its vine running out under the rim
  function beastBox(id, cx, cy, r) {
    var m = ART.meta('drollery.' + id);
    if (!m) { var ds = r * 1.5; return [cx - ds / 2, cy - ds / 2, ds, ds]; }
    var bh = r * 1.9, bw = bh * m.aspect;
    if (bw > r * 1.75) { bw = r * 1.75; bh = bw / m.aspect; }
    return [cx - bw / 2, cy - bh * 0.4, bw, bh];
  }
  function faceBestiary(g, w, h, mx, top, cw, H, t) {
    var y = rubricTitle(g, 'The Bestiary', w, top, cw, clamp(w * 0.062, 11, 28));
    var fk = BEASTS.filter(found).length, ss = clamp(w * 0.034, 10, 16);
    font(g, ss, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.8)';
    y += ss * 1.6; g.fillText(fk ? fk + ' of 9 found' : 'none found yet', w / 2, y);
    y += ss * 0.8;
    var nameH = clamp(h * 0.09, 22, 54), gh = h - y - nameH - Math.max(26, h * 0.05), cell = Math.min(cw / 3, gh / 3);
    var gx = (w - cell * 3) / 2, gy = y + (gh - cell * 3) / 2, r = cell * 0.42;
    if (!(cell > 0)) return;   // a leaf too small for the roundels
    BEASTS.forEach(function (id, i) {
      var cx = gx + (i % 3 + 0.5) * cell, cy = gy + (Math.floor(i / 3) + 0.5) * cell, isF = found(id);
      g.fillStyle = isF ? 'rgba(255,250,232,0.55)' : 'rgba(255,250,232,0.25)';
      g.beginPath(); g.arc(cx, cy, r * 0.94, 0, 6.283); g.fill();
      var bb = beastBox(id, cx, cy, r);
      if (isF) {
        var w0 = best.woke[id], awake = w0 === undefined ? 0 : clamp((t - w0) / 1100, 0, 1);
        g.save(); g.beginPath(); g.arc(cx, cy, r * 0.9, 0, 6.283); g.clip();
        ART.draw(g, 'drollery.' + id, bb[0], bb[1], bb[2], bb[3], t, { awake: awake });
        g.restore();
      } else {
        g.save(); g.globalAlpha = 0.2; g.drawImage(silhouette(id, bb[2], bb[3]), bb[0], bb[1], bb[2], bb[3]); g.restore();
        g.fillStyle = 'rgba(110,60,30,0.6)'; var qs = Math.floor(r * 0.7); font(g, qs, UNC); g.fillText('?', cx, cy + qs * 0.35);
      }
      // the painted ring is broad (its opening is 0.69 of it): drawn a little larger so it doesn't crowd the creature
      var rr = ART.has('book.roundel') ? r * 1.15 : r;
      ART.draw(g, 'book.roundel', cx - rr, cy - rr, 2 * rr, 2 * rr, t, {});
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
  function faceColophon(g, w, h, mx, top, cw, H, t) {
    if (allDone()) {
      if (ART.has('colophon')) coloFace(g, w, h, mx, top, cw, H, t); else coloPlain(g, w, h, mx, top, cw);
      return;
    }
    var y = rubricTitle(g, 'Colophon', w, top, cw, clamp(w * 0.07, 12, 30)), k = solvedCount();
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
  }
  // the finished Colophon when the painting has not loaded: the five painted capitals in a row (capital.<L>),
  // fitted by height and centred in each box; the solved boards stand in for any capital that is missing
  function coloPlain(g, w, h, mx, top, cw) {
    var y = rubricTitle(g, 'Colophon', w, top, cw, clamp(w * 0.07, 12, 30));
    y += h * 0.04;
    var bw = cw / 5, bs = Math.min(bw * 0.92, h * 0.2);
    LETTERS.forEach(function (n, i) {
      var sl = 'capital.' + G.LEVELS[n - 1].initial, me = ART.meta(sl);
      if (!me) { drawThumbInBox(g, thumb(n, true), mx + i * bw + (bw - bs) / 2, y, bs); return; }
      var lh = bs, lw = lh * me.aspect;
      if (lw > bw * 0.94) { lw = bw * 0.94; lh = lw / me.aspect; }
      ART.draw(g, sl, mx + i * bw + (bw - lw) / 2, y + (bs - lh) / 2, lw, lh, 0, {});
    });
    y += bs + h * 0.07;
    g.fillStyle = RED; var ls = fitFont(g, 'LUMEN — light', UNC, clamp(w * 0.085, 14, 40), cw);
    g.fillText('LUMEN — light', w / 2, y); y += ls * 0.9;
    var ns = clamp(w * 0.035, 10, 17); font(g, ns, FELL, 'italic'); g.fillStyle = INKC;
    var note = 'All thirty pages are finished. Thank you for playing.';
    wrap(g, note, cw * 0.94).forEach(function (ln) { y += ns * 1.35; g.fillText(ln, w / 2, y); });
    y += ns * 1.6; g.textAlign = 'right'; g.fillStyle = RED; font(g, ns, FELL, 'italic');
    g.fillText('— the scribe', mx + cw, y); g.textAlign = 'center';
  }
  /* ================= the Colophon page: the painted LUMEN monogram (slot `colophon`, art/colophon.jpg) =================
     The painting fills the leaf above two small lines of text. Its own vellum was lifted to near-white when the
     JPEG was made (tools/make-colophon.py), so it is laid on with `multiply`: the ground takes the leaf's warm
     yellow and the paint sits in the page. A soft edge fade hides the picture's rectangle; then the paint is laid
     again over itself at part strength (`source-over`, masked to the painted pixels) so the multiply does not
     muddy the lapis and the gold (opaque pigment does not take the vellum's tint).
     The finished page stands in full sunlight. The sunlit painting is baked (slot `colophon.sun`,
     art/colophon-sun.jpg, tools/make-colophon-sun.py): pigments richer, darks a little deeper, the gold flashing
     where it faces the light (up and to the left). It is laid with the same two layers, and then the whole leaf,
     words included, is lifted and warmed with one `color-dodge` gradient (the vellum in the sun, brighter toward
     the top left; coloDodge, the same numbers the bake divided out), and a few points of light are screened on
     the gold's sharpest corners (COLO_SPARKS). Without the sunlit art the finished page is the plain painting
     with the lift and the points.
     The reveal, the first time the finished leaf is shown or on a tap: a faint sepia underdrawing inks in, the
     colour floods outward from the top of the L, a glint runs right across the gold, and as it passes the
     sunlight comes up (the plain layers cross to the sunlit ones and the lift rises) while the points of light
     twinkle in one at a time, nearest the sun first. Later visits and reduced motion show the sunlit page at once.
     The save keeps s.colo = 1. The layers are composed once per leaf size (coloCache): the finished page is two
     painting blits, one gradient fill and one blit of the points. */
  var COLO_MS = 5500, COLO_RICH = 0.55, colo = { t0: 0, raf: 0, freeze: null, hidAt: 0 }, coloCache = {}, coloScr = null;
  // the glint: from GL_T0 for GL_MS it runs along the diagonal axis from GL_FROM to GL_TO (a little faster in the
  // middle), half-width GL_BW, fading in and out around GL_PEAK
  var GL_T0 = 2600, GL_MS = 1300, GL_FROM = -0.15, GL_TO = 1.15, GL_PEAK = 0.85, GL_BW = 0.10;
  // the sun comes up from SUN_T0 over SUN_MS; the points twinkle in from SP_T0, SP_GAP apart, each over SP_MS
  var SUN_T0 = 3200, SUN_MS = 1100, SP_T0 = 3600, SP_GAP = 110, SP_MS = 450;
  // the points of light, from the sunlight still (tools/make-colophon-sun.py): x, y and size as fractions of the
  // painting, the tilt of the rays in degrees (0: a plain point, no rays)
  var COLO_SPARKS = [[0.2449, 0.3573, 0.0160, 18], [0.2037, 0.3991, 0.0165, 16], [0.3879, 0.1188, 0.0198, 12],
    [0.4714, 0.1821, 0.0186, 16], [0.2380, 0.5419, 0.0032, 0], [0.4096, 0.4880, 0.0049, 0], [0.5286, 0.2718, 0.0023, 0],
    [0.4760, 0.1162, 0.0043, 0], [0.3787, 0.5444, 0.0029, 0], [0.5778, 0.1906, 0.0036, 0], [0.5915, 0.1316, 0.0055, 0],
    [0.7517, 0.1368, 0.0033, 0], [0.8135, 0.1581, 0.0027, 0]];
  // the still the light was set on (a leaf at 876 x 1314 device px) and the painting's place in it: the light's
  // geometry is measured in its coordinates, carried by the painting, so it sits the same at every leaf size
  var SUN_STILL = { w: 876, h: 1314, x: 1, y: 22, pw: 874, ph: 1170 };
  // the painting's own blank margin (fractions of the picture): the letter sits inside these
  var COLO_IN = { x0: 0.035, x1: 0.965, y0: 0.035, y1: 0.93 };
  function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function coloPending() { return allDone() && ART.has('colophon') && !G.save().colo && !reducedMotion(); }
  function smooth(a, b, x) { var p = clamp((x - a) / (b - a), 0, 1); return p * p * (3 - 2 * p); }
  function scratch(w, h) {
    if (!coloScr) coloScr = document.createElement('canvas');
    if (coloScr.width < w || coloScr.height < h) { coloScr.width = Math.max(w, coloScr.width); coloScr.height = Math.max(h, coloScr.height); }
    var g = coloScr.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, w, h);
    return g;
  }
  function canvasOf(w, h) { var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  // how much a pixel is the gold: warm hue (about 25-55 degrees), well saturated, bright
  function coloGold(r, gg, b) {
    var hi = Math.max(r, gg, b), lo = Math.min(r, gg, b), v = hi / 255, s = hi ? (hi - lo) / hi : 0, hue = 0;
    if (hi > lo && hi === r) hue = 60 * (gg - b) / (hi - lo);
    else if (hi > lo && hi === gg) hue = 60 * (2 + (b - r) / (hi - lo));
    return smooth(20, 30, hue) * (1 - smooth(52, 62, hue)) * smooth(0.32, 0.46, s) * smooth(0.5, 0.72, v);
  }
  // where the glint is el ms into the reveal: u its progress, mid and bw its place and half-width on the axis
  // (0..1 from the picture's top left to (0.75 W, H)), a its strength
  function coloBand(el) {
    var u = clamp((el - GL_T0) / GL_MS, 0, 1), q = 0.5 * u + 0.5 * smooth(0, 1, u);
    return { u: u, mid: GL_FROM + (GL_TO - GL_FROM) * q, bw: GL_BW, a: GL_PEAK * smooth(0, 0.12, u) * (1 - smooth(0.75, 1, u)) };
  }
  // the band as a mask gradient: a soft bell across the axis
  function coloBandGrad(sg, W, H, mid, bw) {
    var lg = sg.createLinearGradient(0, 0, W * 0.75, H);
    [[-1, 0], [-0.6, 0.3], [-0.25, 0.85], [0, 1], [0.25, 0.85], [0.6, 0.3], [1, 0]].forEach(function (s) {
      lg.addColorStop(clamp(mid + s[0] * bw, 0, 1), 'rgba(0,0,0,' + s[1] + ')');
    });
    return lg;
  }
  // the sun on the vellum: the gain the sunlight gives the leaf's own colour (linear light lifted 16-26% and
  // warmed, under a soft shoulder), as a color-dodge colour (out = in / (1 - s), so s = 1 - 1 / gain).
  // grad is the broad light, 1 at the top left of the still. The bake (sun_dodge) divides the same out.
  function coloDodgeColour(grad) {
    var LEAF = [220, 201, 159], WARM = [1.05, 1, 0.925], s = [];
    for (var c = 0; c < 3; c++) {
      var v = LEAF[c] / 255, lin = (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * (1.16 + 0.10 * grad) * WARM[c];
      if (lin > 0.7) lin = 0.7 + 0.275 * (1 - Math.exp(-(lin - 0.7) / 0.275));
      var o = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
      s.push(Math.round(255 * clamp(1 - v / o, 0, 1)));
    }
    return 'rgb(' + s.join(',') + ')';
  }
  // the lift as a gradient over the leaf (CSS px): the still's diagonal 0.55 u + 0.45 v, carried by the painting
  function coloDodge(C) {
    var S = SUN_STILL, im = C.img;
    var du = S.pw / (S.w * im.w), dv = S.ph / (S.h * im.h), u0 = (S.x - im.x * S.pw / im.w) / S.w, v0 = (S.y - im.y * S.ph / im.h) / S.h;
    var a = 0.55 * du, b = 0.45 * dv, c = 0.55 * u0 + 0.45 * v0, nn = a * a + b * b;
    var lg = scratch(1, 1).createLinearGradient(-c * a / nn, -c * b / nn, (1 - c) * a / nn, (1 - c) * b / nn);
    for (var i = 0; i <= 10; i++) lg.addColorStop(i / 10, coloDodgeColour(1 - smooth(0, 1, i / 10)));
    return lg;
  }
  // a point of light (as the still drew them: a hot core, a faint warm halo and, for the four nearest the sun,
  // thin four-pointed rays), drawn into a small canvas in device px for `screen`: colour v / max(v), alpha max(v).
  // f is device px per px of the still
  function coloSparkSprite(sp, W, Hh, f) {
    var size = sp[2] * SUN_STILL.pw, cx = sp[0] * W, cy = sp[1] * Hh, R = Math.ceil(Math.max(12, size * 3.2 + 8) * f);
    var ox = Math.floor(cx) - R, oy = Math.floor(cy) - R, n = 2 * R + 1, cv = canvasOf(n, n), cg = cv.getContext('2d');
    var id = cg.createImageData(n, n), d = id.data, cs = 0.7 + 0.035 * size, hs = 2.2 + 0.35 * size;
    var t = sp[3] * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var dx = (ox + x + 0.5 - cx) / f, dy = (oy + y + 0.5 - cy) / f, r2 = dx * dx + dy * dy;
      var core = 1.1 * Math.exp(-r2 / (2 * cs * cs)), halo = 0.2 * Math.exp(-r2 / (2 * hs * hs)), ray = 0;
      if (sp[3]) {
        var a1 = dx * co + dy * si, a2 = -dx * si + dy * co;
        ray = 0.95 * (Math.exp(-a1 * a1 / 0.605) * Math.exp(-Math.abs(a2) / (size * 0.55)) +
          Math.exp(-a2 * a2 / 0.605) * Math.exp(-Math.abs(a1) / (size * 0.72 * 0.55)));
      }
      var r = Math.min(1, core + halo + ray), gg = Math.min(1, core * 0.98 + halo * 0.86 + ray * 0.95),
        b = Math.min(1, core * 0.92 + halo * 0.55 + ray * 0.84), m = Math.max(r, gg, b), o = (y * n + x) * 4;
      if (m < 0.004) continue;
      d[o] = 255 * r / m; d[o + 1] = 255 * gg / m; d[o + 2] = 255 * b / m; d[o + 3] = 255 * m;
    }
    cg.putImageData(id, 0, 0);
    return { cv: cv, x: ox, y: oy, diag: 0.55 * sp[0] + 0.45 * sp[1] };
  }
  function coloBuild(w, h, mx, top, cw) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), sun = ART.has('colophon.sun');
    var key = [w, h, dpr, ART.has('colophon') ? 1 : 0, sun ? 1 : 0].join('|');
    if (coloCache.key === key) return coloCache;
    ['full', 'rich', 'under', 'glint', 'fullSun', 'richSun', 'sparks'].forEach(function (k) { zap(coloCache[k]); });
    var C = { key: key, dpr: dpr, ms: COLO_MS }, pc = document.createElement('canvas').getContext('2d');
    // the words at the foot, measured first: the painting takes the rest of the leaf
    var ls = clamp(w * 0.06, 12, 30), ns = clamp(w * 0.03, 9.5, 15), foot = h - Math.max(10, h * 0.025);
    font(pc, ns, FELL, 'italic');
    // no-break spaces keep the signature on one line when the note wraps
    var lines = wrap(pc, 'All thirty pages are finished. Thank you for playing. — the scribe', cw * 0.96);
    var yLast = foot - ns * 1.75, yFirst = yLast - (lines.length - 1) * ns * 1.3, yL = yFirst - ns * 1.5;
    C.text = { ls: ls, ns: ns, lines: lines, yFirst: yFirst, yL: yL };
    // the letter (the picture less its blank margin) as large as fits between the leaf's edges and the words
    var bx0 = mx * 0.4, bx1 = w - mx * 0.4, by0 = top * 0.6, by1 = yL - ls * 0.95 - Math.max(3, h * 0.01);
    var me = ART.meta('colophon'), asp = me ? me.aspect : 0.75, fw = COLO_IN.x1 - COLO_IN.x0, fh = COLO_IN.y1 - COLO_IN.y0;
    var ih = Math.min((by1 - by0) / fh, (bx1 - bx0) / (fw * asp)), iw = ih * asp;
    var ix = w / 2 - iw * (COLO_IN.x0 + COLO_IN.x1) / 2, iy = (by0 + by1) / 2 - ih * (COLO_IN.y0 + COLO_IN.y1) / 2;
    C.img = { x: ix, y: iy, w: iw, h: ih };
    C.box = [ix + iw * COLO_IN.x0, iy + ih * COLO_IN.y0, iw * fw, ih * fh];
    C.dodge = coloDodge(C);
    // the layers, in device pixels
    var W = Math.max(1, Math.round(iw * dpr)), Hh = Math.max(1, Math.round(ih * dpr));
    var src = canvasOf(W, Hh), sg = src.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    ART.draw(sg, 'colophon', 0, 0, W, Hh, 0, {});
    C.W = W; C.H = Hh;
    try {
      var id = sg.getImageData(0, 0, W, Hh), d = id.data, n = W * Hh;
      var full = sg.createImageData(W, Hh), rich = sg.createImageData(W, Hh), under = sg.createImageData(W, Hh), glint = sg.createImageData(W, Hh);
      var F = full.data, R = rich.data, U = under.data, Gd = glint.data;
      // the soft edge: a little wider on the left, where the painting had its gutter tint
      var fl = 0.04 * W, fr = 0.025 * W, ft = 0.025 * Hh, fb = 0.03 * Hh, ex = new Float32Array(W), ey = new Float32Array(Hh), x, y;
      for (x = 0; x < W; x++) ex[x] = smooth(0, fl, x + 0.5) * smooth(0, fr, W - x - 0.5);
      for (y = 0; y < Hh; y++) ey[y] = smooth(0, ft, y + 0.5) * smooth(0, fb, Hh - y - 0.5);
      for (var i = 0; i < n; i++) {
        var o = i * 4, r = d[o], gg = d[o + 1], b = d[o + 2], E = ex[i % W] * ey[(i / W) | 0];
        var lo = Math.min(r, gg, b);
        F[o] = r; F[o + 1] = gg; F[o + 2] = b; F[o + 3] = 255 * E;
        // the painted pixels (not the lifted ground): laid again at part strength over the multiply
        R[o] = r; R[o + 1] = gg; R[o + 2] = b; R[o + 3] = 255 * E * COLO_RICH * smooth(0.05, 0.3, 1 - lo / 255);
        // the underdrawing: the picture's value only, in a pale sepia, contrast cut to a third
        var l = (r * 0.3 + gg * 0.59 + b * 0.11) / 255, k = (1 - l) * 0.34;
        U[o] = 255 - (255 - 104) * k; U[o + 1] = 255 - (255 - 70) * k; U[o + 2] = 255 - (255 - 40) * k; U[o + 3] = 255 * E;
        // the gold: the glint's mask, strongest on the gold's own lights so it follows the painted modelling
        Gd[o] = 255; Gd[o + 1] = 238; Gd[o + 2] = 186; Gd[o + 3] = 255 * E * coloGold(r, gg, b) * (0.3 + 0.7 * smooth(0.5, 0.88, l));
      }
      C.full = canvasOf(W, Hh); C.full.getContext('2d').putImageData(full, 0, 0);
      C.rich = canvasOf(W, Hh); C.rich.getContext('2d').putImageData(rich, 0, 0);
      C.under = canvasOf(W, Hh); C.under.getContext('2d').putImageData(under, 0, 0);
      C.glint = canvasOf(W, Hh); C.glint.getContext('2d').putImageData(glint, 0, 0);
      // the sunlit painting in the same two layers: its colour, the plain layers' alpha
      if (sun) ['full', 'rich'].forEach(function (k) {
        var cv = canvasOf(W, Hh), cg = cv.getContext('2d');
        cg.imageSmoothingQuality = 'high';
        ART.draw(cg, 'colophon.sun', 0, 0, W, Hh, 0, {});
        cg.globalCompositeOperation = 'destination-in'; cg.drawImage(C[k], 0, 0);
        C[k + 'Sun'] = cv;
      });
      // the points of light: one sprite each for the reveal, and all of them in one layer for the finished page
      C.sp = COLO_SPARKS.map(function (sp) { return coloSparkSprite(sp, W, Hh, W / SUN_STILL.pw); });
      C.sparks = canvasOf(W, Hh);
      var spg = C.sparks.getContext('2d');
      spg.globalCompositeOperation = 'lighter';
      C.sp.forEach(function (s) { spg.drawImage(s.cv, s.x, s.y); });
      // they light nearest the sun first
      C.sp.sort(function (a, b) { return a.diag - b.diag; });
    } catch (e) {
      // a tainted canvas (file://): the plain picture, faded at the edges by alpha alone, and no reveal
      C.full = src; C.rich = null; C.under = null; C.glint = null; C.fullSun = null; C.richSun = null; C.sparks = null; C.sp = null; C.ms = 0;
    }
    coloCache = C;
    return C;
  }
  // draw a layer (device px) over the picture's place on the leaf
  function coloBlit(g, C, cv, op, a) {
    if (!cv || a <= 0) return;
    g.globalCompositeOperation = op; g.globalAlpha = a;
    g.drawImage(cv, 0, 0, C.W, C.H, C.img.x, C.img.y, C.img.w, C.img.h);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  // a layer cut by a mask gradient (kept where the gradient is opaque, or where it is clear when `out`)
  function coloMasked(C, cv, grad, out) {
    var sg = scratch(C.W, C.H);
    sg.drawImage(cv, 0, 0);
    sg.globalCompositeOperation = out ? 'destination-out' : 'destination-in';
    sg.fillStyle = grad; sg.fillRect(0, 0, C.W, C.H);
    sg.globalCompositeOperation = 'source-over';
    return sg;
  }
  // a plain layer part way to its sunlit twin (k 0..1): the two weighted and added, so the alpha stays the same
  function coloMix(C, a, b, k) {
    if (!b || k <= 0) return a;
    if (k >= 1) return b;
    var sg = scratch(C.W, C.H);
    sg.globalAlpha = 1 - k; sg.drawImage(a, 0, 0);
    sg.globalCompositeOperation = 'lighter'; sg.globalAlpha = k; sg.drawImage(b, 0, 0);
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
    return coloScr;
  }
  // how far the sun is up, el ms into the reveal (1e9: finished)
  function coloSun(el) { return smooth(SUN_T0, SUN_T0 + SUN_MS, el); }
  // one frame of the painting, el ms into the reveal (1e9: finished)
  function coloFrame(g, C, el) {
    var k = coloSun(el);
    if (el >= C.ms) {
      coloBlit(g, C, C.fullSun || C.full, 'multiply', 1); coloBlit(g, C, C.richSun || C.rich, 'source-over', 1);
      return;
    }
    var W = C.W, H = C.H;
    // the colour's front: a soft ring spreading from the top of the L's stem to the far corner
    var ox = W * 0.17, oy = H * 0.12, rMax = Math.hypot(W - ox, H - oy), soft = rMax * 0.24;
    var p = ease(clamp((el - 800) / 2000, 0, 1)), r = p * (rMax + soft), grad = null;
    if (r > 0) {
      grad = scratch(1, 1).createRadialGradient(ox, oy, 0, ox, oy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(Math.max(0, (r - soft) / r), 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    // 1. the underdrawing inks in (and gives way where the colour has come)
    var ua = ease(clamp(el / 1000, 0, 1));
    if (ua > 0 && p < 1) {
      if (grad) { coloMasked(C, C.under, grad, true); coloBlit(g, C, coloScr, 'multiply', ua); }
      else coloBlit(g, C, C.under, 'multiply', ua);
    }
    // 2. the colour floods outward from the L, and (once it is all down) crosses to the sunlit painting
    if (grad) {
      if (p >= 1) {
        coloBlit(g, C, coloMix(C, C.full, C.fullSun, k), 'multiply', 1);
        coloBlit(g, C, coloMix(C, C.rich, C.richSun, k), 'source-over', 1);
      } else {
        coloMasked(C, C.full, grad, false); coloBlit(g, C, coloScr, 'multiply', 1);
        coloMasked(C, C.rich, grad, false); coloBlit(g, C, coloScr, 'source-over', 1);
      }
    }
    // 3. a glint runs down right across the gold, ahead of the sun
    var bd = coloBand(el);
    if (bd.a > 0 && C.glint) {
      var lg = coloBandGrad(scratch(1, 1), W, H, bd.mid, bd.bw);
      coloMasked(C, C.glint, lg, false);
      coloBlit(g, C, coloScr, 'lighter', bd.a);
    }
  }
  // the light over the whole leaf, after the words: the vellum's lift, then the points of light
  function coloLight(g, C, el, w, h) {
    var k = el >= C.ms ? 1 : coloSun(el);
    if (k > 0) {
      g.globalCompositeOperation = 'color-dodge'; g.globalAlpha = k; g.fillStyle = C.dodge; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (!C.sp) return;
    if (el >= C.ms) { coloBlit(g, C, C.sparks, 'screen', 1); return; }
    var sx = C.img.w / C.W, sy = C.img.h / C.H;
    g.globalCompositeOperation = 'screen';
    C.sp.forEach(function (s, j) {
      var t = (el - SP_T0 - j * SP_GAP) / SP_MS;
      if (t <= 0) return;
      // it flares in past full and settles
      var a = t >= 1 ? 1 : smooth(0, 0.3, t) * (1 + 0.6 * Math.sin(Math.PI * smooth(0, 1, t)));
      for (; a > 0; a -= 1) {
        g.globalAlpha = Math.min(1, a);
        g.drawImage(s.cv, C.img.x + s.x * sx, C.img.y + s.y * sy, s.cv.width * sx, s.cv.height * sy);
      }
    });
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  function coloFace(g, w, h, mx, top, cw, H, t) {
    var C = coloBuild(w, h, mx, top, cw);
    var ela = colo.freeze != null ? colo.freeze : colo.t0 ? (t || now()) - colo.t0 : (coloPending() ? 0 : 1e9);
    coloFrame(g, C, ela);
    var tx = C.text;
    g.textAlign = 'center'; g.fillStyle = RED; fitFont(g, 'LUMEN — light', UNC, tx.ls, cw);
    g.fillText('LUMEN — light', w / 2, tx.yL);
    font(g, tx.ns, FELL, 'italic');
    tx.lines.forEach(function (ln, i) {
      var y = tx.yFirst + i * tx.ns * 1.3, k = ln.indexOf('—');
      g.fillStyle = INKC;
      if (k < 0) { g.fillText(ln, w / 2, y); return; }
      var a = ln.slice(0, k), b = ln.slice(k), wa = g.measureText(a).width, wb = g.measureText(b).width, x0 = w / 2 - (wa + wb) / 2;
      g.textAlign = 'left'; g.fillText(a, x0, y); g.fillStyle = RED; g.fillText(b, x0 + wa, y); g.textAlign = 'center';
    });
    coloLight(g, C, ela, w, h);
    H.push({ x: C.box[0], y: C.box[1], w: C.box[2], h: C.box[3], act: { colo: 1 } });
  }
  function coloSide() {
    if (mode !== 'open') return null;
    var fs = facesOf(pos), i = fs.indexOf(F_COLO);
    if (i < 0) return null;
    return { cv: i === 0 ? el.cA : el.cB, side: L.spread ? (i ? 'R' : 'L') : 'R' };
  }
  // the reveal: the first time the finished Colophon is in view, or on a tap (replay)
  function coloStart(replay) {
    if (!allDone() || !ART.has('colophon') || !coloSide()) return;
    var s = G.save();
    if (!replay && s.colo) return;
    if (!s.colo) { s.colo = 1; G.persist(); }
    if (reducedMotion() || coloCache.ms === 0) return;
    colo.t0 = now();
    if (window.SFX && window.SFX.solved) window.SFX.solved();
    colo.hidAt = document.hidden ? now() : 0;
    if (!colo.raf && !document.hidden) colo.raf = requestAnimationFrame(coloLoop);
  }
  // the tab hidden: the reveal waits where it is (no frames), and carries on from there when it returns
  function coloPause() {
    if (colo.raf) { cancelAnimationFrame(colo.raf); colo.raf = 0; }
    if (colo.t0 && !colo.hidAt) colo.hidAt = now();
  }
  function coloResume() {
    if (!colo.t0) return;
    if (colo.hidAt) { colo.t0 += now() - colo.hidAt; colo.hidAt = 0; }
    if (!colo.raf) colo.raf = requestAnimationFrame(coloLoop);
  }
  function coloStop() {
    if (colo.raf) { cancelAnimationFrame(colo.raf); colo.raf = 0; }
    colo.t0 = 0; colo.hidAt = 0;
  }
  // the reveal's layers are big (the picture at device size, four times over): let go of them while the book is shut
  function coloFree() {
    coloStop();
    ['full', 'rich', 'under', 'glint', 'fullSun', 'richSun', 'sparks'].forEach(function (k) { zap(coloCache[k]); });
    coloCache = {}; zap(coloScr); coloScr = null;
  }
  function coloLoop() {
    colo.raf = 0;
    if (document.hidden) { coloPause(); return; }
    var sd = coloSide();
    if (!sd || !colo.t0 || (tween && !T)) { colo.t0 = 0; return; }   // a closing (not a turn) ends it
    var t = now(), done = t - colo.t0 >= (coloCache.ms || COLO_MS);
    if (!T) {
      var g = sd.cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (done) colo.t0 = 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, L.pw, L.ph);
      renderFace(F_COLO, g, L.pw, L.ph, sd.side, t);
    }
    if (!done) colo.raf = requestAnimationFrame(coloLoop);
    else colo.t0 = 0;
  }
  // where things sit on the painted leather (fractions of the board): the spine strip down the left edge,
  // and the plain recessed panel inside the tooled lattice
  var PAINTED = { spine: 0.058, px0: 0.31, px1: 0.765, py0: 0.2, py1: 0.81 };
  // a painted brass fitting set into the board rather than laid on it: the leather pressed dark around it,
  // a soft drop shadow (the leather is lit from the top right, so it falls down and a little left), a
  // tight contact shadow at its rim, and the metal given a gentle warm multiply so it matches the gilt
  // title. Cached per size and angle; the piece itself stays exactly in its box (flush with the board)
  var mountCache = {}, mountN = 0;
  // slot is an ART slot name, or a canvas carrying its own cache name in .slot (the clasp's keeper)
  function putPiece(pg, slot, x, y, w, h, angle) {
    if (typeof slot !== 'string') { drawSmooth(pg, slot, x, y, w, h); return; }
    ART.draw(pg, slot, x, y, w, h, 0, angle ? { angle: angle } : {});
  }
  function drawMounted(g, slot, x, y, w, h, angle) {
    var name = typeof slot === 'string' ? slot : slot.slot;
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = [name, typeof slot !== 'string' || ART.has(slot), w, h, angle || 0, dpr].join('|');
    var c = mountCache[key];
    if (!c) {
      var p = Math.ceil(Math.min(w, h) * 0.14), S = Math.min(w, h) * dpr,
        W = Math.ceil((w + 2 * p) * dpr), H = Math.ceil((h + 2 * p) * dpr);
      var pc = document.createElement('canvas'); pc.width = W; pc.height = H;
      var pg = pc.getContext('2d'); pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      putPiece(pg, slot, p, p, w, h, angle);
      pg.setTransform(1, 0, 0, 1, 0, 0);
      pg.globalCompositeOperation = 'multiply'; pg.fillStyle = 'rgb(255,248,226)'; pg.fillRect(0, 0, W, H);
      pg.globalCompositeOperation = 'destination-in'; pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      putPiece(pg, slot, p, p, w, h, angle);
      c = document.createElement('canvas'); c.width = W; c.height = H;
      var cg = c.getContext('2d'), OFF = W + H + 100;
      // each shadow pass draws the piece far off the canvas and lets only its shadow land
      [['rgba(22,7,3,0.5)', S * 0.07, 0, 0],                         // the pressed, darkened leather
       ['rgba(18,5,2,0.4)', S * 0.018, 0, 0],                        // ...deepest in the piercings
       ['rgba(12,4,1,0.55)', S * 0.03, -S * 0.008, S * 0.022],       // the soft drop shadow
       ['rgba(6,2,0,0.75)', Math.max(1, S * 0.006), -dpr * 0.5, dpr] // the contact shadow at the rim
      ].forEach(function (d) {
        cg.shadowColor = d[0]; cg.shadowBlur = d[1]; cg.shadowOffsetX = OFF + d[2]; cg.shadowOffsetY = d[3];
        cg.drawImage(pc, -OFF, 0);
      });
      cg.shadowColor = 'transparent'; cg.shadowBlur = 0; cg.shadowOffsetX = cg.shadowOffsetY = 0;
      cg.drawImage(pc, 0, 0);
      c.pad = p;
      if (++mountN > 24) { mountCache = {}; mountN = 1; }
      mountCache[key] = c;
    }
    g.drawImage(c, x - c.pad, y - c.pad, w + 2 * c.pad, h + 2 * c.pad);
  }
  // The painted clasp (cover-clasp.png, measured at 569 px wide): the hook's curl closes round a pocket
  // centred on CLASP.pin; stud is the pin's head radius; rivet is the hinge plate's lobe rivet (x, y, r).
  // The keeper is built from the PNG's own hinge leaf (x 190-268, the strap keyed out): the leaf mirrored,
  // so its lobe and rivets face away from the hook, a plain stretch of plate L wide, then the leaf's lobe
  // again, unmirrored, reaching into the hook's curl with the pin standing on it. KEEPER.s scales it
  // against the clasp; its pin is where that second lobe's rivet was
  var CLASP = { W: 569, pin: [44, 75], stud: 14, rivet: [242, 67, 12] };
  var KEEPER = { s: 0.8, L: 32, pin: [123, 67] }, keeperCv = null, studCv = null;
  function claspNative() {
    var c = document.createElement('canvas'); c.width = CLASP.W; c.height = Math.round(CLASP.W / ART.meta('cover.clasp').aspect);
    ART.draw(c.getContext('2d'), 'cover.clasp', 0, 0, c.width, c.height, 0, {});
    return c;
  }
  // a big bitmap drawn small: halved step by step first, so its dark outline stays a smooth line instead of
  // breaking into teeth (one bilinear pass at a quarter size skips most of the source pixels)
  function drawSmooth(g, src, x, y, w, h) {
    var m = g.getTransform ? g.getTransform() : null, s = m ? Math.hypot(m.a, m.b) : 1, c = src;
    while (c.width / 2 >= w * s && c.height / 2 >= h * s && c.width > 2) {
      var n = document.createElement('canvas'); n.width = Math.round(c.width / 2); n.height = Math.round(c.height / 2);
      var ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(c, 0, 0, n.width, n.height); c = n;
    }
    g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(c, x, y, w, h); g.restore();
  }
  function keeperArt() {
    if (keeperCv) return keeperCv;
    var src = claspNative(), H = src.height, sg = src.getContext('2d'), L = KEEPER.L;
    try {   // the red strap behind the plate's lobe goes: keep the brass and its dark outline (green/red high)
      var id = sg.getImageData(182, 0, 87, H), d = id.data;
      for (var i = 0; i < d.length; i += 4) {
        var q = d[i + 1] / Math.max(1, d[i]);
        d[i + 3] *= Math.max(0, Math.min(1, (q - 0.3) / 0.15));
      }
      sg.putImageData(id, 182, 0);
    } catch (e) {   // a tainted canvas: cut the strap away above and below the lobe instead
      sg.clearRect(246, 0, 30, 38); sg.clearRect(246, 97, 30, H);
    }
    var k = document.createElement('canvas'), kg = k.getContext('2d');
    k.width = 117 + L; k.height = H;
    kg.save(); kg.translate(78, 0); kg.scale(-1, 1); kg.drawImage(src, 190, 0, 78, H, 0, 0, 78, H); kg.restore();
    kg.drawImage(src, 190, 0, 2, H, 78, 0, L, H);
    kg.drawImage(src, 229, 0, 39, H, 78 + L, 0, 39, H);
    k.slot = 'cover.keeper';
    KEEPER.pin = [91 + L, CLASP.rivet[1]];
    return (keeperCv = k);
  }
  // the keeper's pin: the clasp's own lobe rivet, cut out round and ringed, standing proud of the hook
  function drawStud(g, x, y, r) {
    if (!studCv) {
      var src = claspNative(), R = CLASP.rivet[2], sc = document.createElement('canvas'); sc.width = sc.height = 2 * R;
      var sg = sc.getContext('2d');
      sg.beginPath(); sg.arc(R, R, R - 0.5, 0, 6.283); sg.save(); sg.clip();
      sg.drawImage(src, R - CLASP.rivet[0], R - CLASP.rivet[1]);
      sg.globalCompositeOperation = 'multiply'; sg.fillStyle = 'rgb(255,248,226)'; sg.fillRect(0, 0, 2 * R, 2 * R);
      sg.restore();
      sg.strokeStyle = 'rgba(38,22,7,0.95)'; sg.lineWidth = 1.6; sg.beginPath(); sg.arc(R, R, R - 0.8, 0, 6.283); sg.stroke();
      studCv = sc;
    }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    g.save();
    g.shadowColor = 'rgba(10,3,0,0.65)'; g.shadowBlur = r * 0.45 * dpr; g.shadowOffsetX = -r * 0.15 * dpr; g.shadowOffsetY = r * 0.32 * dpr;
    drawSmooth(g, studCv, x - r, y - r, 2 * r, 2 * r);
    g.restore();
  }
  // The clasps belong to the BACK board: each strap is riveted to it, comes round the fore-edge over the
  // page edges and lies on the front board, where its hook catches the keeper's pin (the keeper is part
  // of the front cover, drawn by drawKeepers). So the straps have a layer of their own (bk_clasp, made in
  // init): over the page block, and over the closed cover while fastened, but not on the cover, which
  // swings open without them. claspBoxes gives the clasp boxes in the cover's frame: x0 the box's left,
  // ex the fore-edge from x0, t the depth of the page block past it, ys the boxes' tops
  function claspBoxes(w, h) {
    var painted = ART.has('cover.clasp'), cw, ch, x0;
    if (painted) { cw = w * 0.22; ch = cw / ART.meta('cover.clasp').aspect; x0 = w * 0.812; }
    else { cw = w * 0.16; ch = h * 0.085; x0 = w - cw; }
    return { painted: painted, cw: cw, ch: ch, x0: x0, ex: w - x0, t: ART.has('cover.pages') ? clamp(h * 0.014, 5, 11) : 5,
      ys: [0.27, 0.73].map(function (f) { return h * f - ch / 2; }) };
  }
  // the keepers, riveted into the front board, each with its pin standing proud
  function drawKeepers(g, w, h) {
    var B = claspBoxes(w, h), u = B.cw / CLASP.W;
    B.ys.forEach(function (y) {
      if (!B.painted) { ART.draw(g, 'cover.clasp', B.x0, y, B.cw, B.ch, 0, { part: 'keeper' }); return; }
      var kp = keeperArt(), kw = kp.width * KEEPER.s * u, kh = kp.height * KEEPER.s * u;
      drawMounted(g, kp, B.x0 + (CLASP.pin[0] - KEEPER.pin[0] * KEEPER.s) * u, y + (CLASP.pin[1] - KEEPER.pin[1] * KEEPER.s) * u, kw, kh, 0);
      drawStud(g, B.x0 + CLASP.pin[0] * u, y + CLASP.pin[1] * u, CLASP.stud * u);
    });
  }
  // One strap with its plate and hook, laid on the boards (not set into them): a thin dark edge for its
  // thickness and a cast shadow, light from the top right so down and a little left. Drawn in the clasp
  // box's frame (x from the box's left). Fastened (open false): flat on the front board up to the
  // fore-edge (ex), where it darkens a little toward the bend with a catch of light along it, then down
  // across the page edges to the back board's edge (ex + t), sheared as the block is drawn (its depth runs
  // right and a little down, SHEAR) and darker on that side face. Unfastened (open true): the same strap
  // turned over about the middle of the block's edge (ex + t/2), lying out to the right with the hook
  // pointing away, darkest where it comes from the board
  var SHEAR = 0.45, pieceCache = {}, pieceN = 0;
  function claspPiece(B, open) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = [B.painted, open, B.cw, B.ch, B.ex, B.t, dpr].join('|'), c = pieceCache[key];
    if (c) return c;
    var cw = B.cw, ch = B.ch, ex = B.ex, t = B.t, p = Math.ceil(ch * 0.4), S = ch * dpr;
    var PW = 2 * ex + t, PH = ch + t * SHEAR, W = Math.ceil((PW + 2 * p) * dpr), H = Math.ceil((PH + 2 * p) * dpr);
    // the strap alone, unshaded, in the box's frame
    var ac = document.createElement('canvas'); ac.width = W; ac.height = H;
    var ag = ac.getContext('2d'); ag.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (B.painted) {
      var nat = claspNative();
      drawSmooth(ag, nat, p, p, cw, ch);
      ag.setTransform(1, 0, 0, 1, 0, 0);
      ag.globalCompositeOperation = 'multiply'; ag.fillStyle = 'rgb(255,248,226)'; ag.fillRect(0, 0, W, H);
      ag.globalCompositeOperation = 'destination-in'; ag.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSmooth(ag, nat, p, p, cw, ch);
      ag.globalCompositeOperation = 'source-over';
    } else {
      ART.draw(ag, 'cover.clasp', p, p, cw, ch, 0, { part: 'strap' });
      ag.fillStyle = '#4a130c'; ag.fillRect(p + ex - 0.5, p + ch * 0.3, t + 0.5, ch * 0.4);   // its run round the block
    }
    var pc = document.createElement('canvas'); pc.width = W; pc.height = H;
    var pg = pc.getContext('2d'), e = p + ex, E = ch * 0.6, HH = PH + 2 * p;
    pg.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!open) {
      pg.save(); pg.beginPath(); pg.rect(0, 0, e, HH); pg.clip();   // on the front board
      pg.drawImage(ac, 0, 0, W / dpr, H / dpr);
      pg.globalCompositeOperation = 'source-atop';
      var dk = pg.createLinearGradient(e - E, 0, e, 0);
      dk.addColorStop(0, 'rgba(14,3,2,0)'); dk.addColorStop(0.6, 'rgba(14,3,2,0.12)'); dk.addColorStop(1, 'rgba(14,3,2,0.42)');
      pg.fillStyle = dk; pg.fillRect(e - E, 0, E, HH);
      var hl = pg.createLinearGradient(e - E * 0.3, 0, e, 0);
      hl.addColorStop(0, 'rgba(255,214,186,0)'); hl.addColorStop(0.6, 'rgba(255,214,186,0.3)'); hl.addColorStop(1, 'rgba(255,214,186,0.05)');
      pg.fillStyle = hl; pg.fillRect(e - E * 0.3, 0, E * 0.3, HH);
      pg.restore();
      pg.save(); pg.beginPath(); pg.rect(e, 0, t, HH); pg.clip();     // down over the page edges
      pg.transform(1, SHEAR, 0, 1, 0, -SHEAR * e);
      pg.drawImage(ac, 0, 0, W / dpr, H / dpr);
      pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      pg.globalCompositeOperation = 'source-atop';
      var sd = pg.createLinearGradient(e, 0, e + t, 0);
      sd.addColorStop(0, 'rgba(14,3,2,0.38)'); sd.addColorStop(0.75, 'rgba(14,3,2,0.46)'); sd.addColorStop(1, 'rgba(14,3,2,0.75)');
      pg.fillStyle = sd; pg.fillRect(e, 0, t, HH);
      pg.restore();
    } else {
      pg.save(); pg.beginPath(); pg.rect(e, 0, PW, HH); pg.clip();
      pg.transform(-1, 0, 0, 1, 2 * e + t, 0);                        // box x -> 2ex + t - x
      pg.drawImage(ac, 0, 0, W / dpr, H / dpr);
      pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      pg.globalCompositeOperation = 'source-atop';
      var rd = pg.createLinearGradient(e, 0, e + E, 0);
      rd.addColorStop(0, 'rgba(14,3,2,0.6)'); rd.addColorStop(0.4, 'rgba(14,3,2,0.2)'); rd.addColorStop(1, 'rgba(14,3,2,0)');
      pg.fillStyle = rd; pg.fillRect(e, 0, E, HH);
      pg.restore();
    }
    c = document.createElement('canvas'); c.width = W; c.height = H;
    var cg = c.getContext('2d'), OFF = W + H + 100;
    [['rgba(8,2,1,0.42)', S * 0.16, -S * 0.07, S * 0.17],      // the cast shadow on the leather (and the page edges)
     ['rgba(10,3,1,0.5)', S * 0.04, -S * 0.025, S * 0.07],     // ...darker where it is close
     ['rgba(22,8,3,0.95)', Math.max(1, S * 0.012), -S * 0.012, S * 0.035]           // the strap's and plate's thickness
    ].forEach(function (d) {
      cg.shadowColor = d[0]; cg.shadowBlur = d[1]; cg.shadowOffsetX = OFF + d[2]; cg.shadowOffsetY = d[3];
      cg.drawImage(pc, -OFF, 0);
    });
    cg.shadowColor = 'transparent'; cg.shadowBlur = 0; cg.shadowOffsetX = cg.shadowOffsetY = 0;
    cg.drawImage(pc, 0, 0);
    c.pad = p; c.cw = PW + 2 * p; c.ch = PH + 2 * p;
    if (++pieceN > 8) { pieceCache = {}; pieceN = 1; }
    pieceCache[key] = c;
    return c;
  }
  function renderPaintedCover(g, w, h) {
    var P = PAINTED, cx = w * (P.px0 + P.px1) / 2, pw = w * (P.px1 - P.px0), y0 = h * P.py0, y1 = h * P.py1;
    // brass corners on the board's corners (right of the spine strip); the PNG points top-left
    var cs = Math.min(w, h) * 0.2, lx = w * P.spine;
    [[lx, 0, 0], [w - cs, 0, 1], [w - cs, h - cs, 2], [lx, h - cs, 3]].forEach(function (c) {
      drawMounted(g, 'cover.corner', c[0], c[1], cs, cs, c[2] * Math.PI / 2);
    });
    // two keepers set into the lattice border; the straps that hook onto them are the back board's
    // (drawn on their own layer, see claspBoxes)
    drawKeepers(g, w, h);
    // the title at the head of the panel, the medallion centred in what is left below it
    var ty = y0 + (y1 - y0) * 0.05, tw = pw * 0.92, th;
    if (ART.has('cover.title')) {
      // the painted title fills the panel's plain field edge to edge (pw: 0.455 of the board; the
      // field's own edges are at 0.30-0.77); any wider and the ampersand meets the upper clasp's hook.
      // Its height is capped at 36% of the panel so the medallion keeps its room
      tw = pw * 1.02;
      th = tw / ART.meta('cover.title').aspect;
      if (th > (y1 - y0) * 0.36) { th = (y1 - y0) * 0.36; tw = th * ART.meta('cover.title').aspect; }
      ART.draw(g, 'cover.title', cx - tw / 2, ty, tw, th, 0, {});
    } else {
      th = (y1 - y0) * 0.3;
      ART.draw(g, 'cover.title', cx - tw / 2, ty, tw, th, 0, { text: 'Vellum\n& Vermilion' });
    }
    var top = ty + th, my = (top + y1) / 2, R = Math.min(pw * 0.42, (y1 - top) * 0.4);
    ART.draw(g, 'cover.medallion', cx - R, my - R, 2 * R, 2 * R, 0, {});
  }
  function renderCover(cv, w, h) {
    var g = prep(cv, w, h);
    ART.draw(g, 'cover.leather', 0, 0, w, h, 0, {});
    if (ART.has('cover.leather')) { renderPaintedCover(g, w, h); return; }
    var m = Math.min(w, h), b = m * 0.11, cs = m * 0.17;
    [[b, b, 0], [w - b - cs, b, 1], [w - b - cs, h - b - cs, 2], [b, h - b - cs, 3]].forEach(function (c) {
      ART.draw(g, 'cover.corner', c[0], c[1], cs, cs, 0, { angle: c[2] * Math.PI / 2 });
    });
    var R = Math.min(w * 0.3, h * 0.2);
    ART.draw(g, 'cover.medallion', w / 2 - R, h * 0.6 - R, 2 * R, 2 * R, 0, {});
    ART.draw(g, 'cover.title', b + cs * 0.5, h * 0.16, w - 2 * b - cs, h * 0.22, 0, { text: 'Vellum\n& Vermilion' });
    drawKeepers(g, w, h);
  }
  function prep(cv, w, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return g;
  }
  function drawFaceTo(cv, f, side, t) {
    if (!(L.pw > 0 && L.ph > 0)) return;   // a window with no size yet (a background tab): drawn on the resize that gives it one
    var g = prep(cv, L.pw, L.ph);
    if (f === 'verso') { paper(g, L.pw, L.ph, side, 11); return; }
    if (f === 'endpaper') {
      if (ART.has('cover.endpaper')) { g.translate(L.pw, 0); g.scale(-1, 1); }   // the lacing goes to the hinge
      ART.draw(g, 'cover.endpaper', 0, 0, L.pw, L.ph, 0, {}); return;
    }
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
    drawBinding();
  }

  /* ================= the binding: spine behind the hinge, page block under the closed cover ================= */
  function placeCanvas(cv, x, y, w, h) {
    var st = cv.style; st.left = x + 'px'; st.top = y + 'px'; st.width = w + 'px'; st.height = h + 'px';
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return g;
  }
  function drawBinding() {
    var pw = L.pw, ph = L.ph, hinge = L.spread ? pw : 0;
    // the spine stands behind the hinge; its headbands show above and below the leaves,
    // and on a phone its rounded edge shows left of the page (or of the closed cover)
    if (ART.has('cover.spine')) {
      var sw = clamp(pw * (L.spread ? 0.07 : 0.05), 12, 38), ext = clamp(ph * 0.012, 4, 10);
      var g = placeCanvas(el.spine, hinge - sw * (L.spread ? 0.5 : 0.8), -ext, sw, ph + 2 * ext);
      ART.draw(g, 'cover.spine', 0, 0, sw, ph + 2 * ext, 0, {});
      el.spine.style.display = '';
    } else el.spine.style.display = 'none';
    // the page block: the leaves' edge just proud of the closed cover, below and to the right
    var on = ART.has('cover.pages');
    el.leaf.classList.toggle('painted', on);
    if (on) {
      var t = clamp(ph * 0.014, 5, 11);
      var bg = placeCanvas(el.block, hinge, 0, pw + t, ph + t);
      bg.fillStyle = '#3e100b';   // the back board's leather edge, under the pages
      bg.fillRect(t * 0.6, ph - t * 0.2, pw + t * 0.4, t * 1.2); bg.fillRect(pw - t * 0.2, t * 0.6, t * 1.2, ph + t * 0.4);
      bg.save(); bg.beginPath(); bg.rect(t * 0.4, ph - 3, pw - 3 + t * 0.4, t * 0.85 + 3); bg.clip();
      ART.draw(bg, 'cover.pages', t * 0.4, ph - 3, pw - 3 + t * 0.4, t * 0.85 + 3, 0, {});   // the foot of the block
      bg.restore();
      bg.save(); bg.beginPath(); bg.rect(pw - 3, t * 0.4, t * 0.85 + 3, ph - 3 + t * 0.4); bg.clip();
      bg.translate(pw + t * 0.85, t * 0.4); bg.rotate(Math.PI / 2);   // the fore-edge: the same strip turned
      ART.draw(bg, 'cover.pages', 0, 0, ph - 3 + t * 0.4, t * 0.85 + 3, 0, {});
      bg.restore();
      el.block.style.display = '';
    } else el.block.style.display = 'none';
    drawClasps();
  }
  function blockAlpha(a) { el.block.style.opacity = String(a); }

  /* the clasps' layer (see claspBoxes). CL.s is the straps' swing about the block's fore-edge: 1 fastened
     over the closed cover, -1 turned out past it (hook outward), passing edge-on at 0; z is the layer's
     z-index (3, over the closed cover; 1, under the leaf but over the block and the open pages, while the
     cover moves or the book is open) and a its opacity: open, the straps lie out right of the back board
     where the spread leaves room before the next-page button, and are hidden where it doesn't */
  var CL = { s: 1, z: 3, a: 1, geo: null };
  function drawClasps() {
    if (!el.clasp) return;
    if (!(L.pw > 0 && L.ph > 0)) { CL.geo = null; el.clasp.getContext('2d').clearRect(0, 0, el.clasp.width, el.clasp.height); return; }   // a window with no size yet: nothing to draw (a negative radius would throw)
    var B = claspBoxes(L.pw, L.ph), hinge = L.spread ? L.pw : 0, p = Math.ceil(B.ch * 0.4) + 2;
    var w = 2 * B.ex + B.t + 2 * p, h = L.ph + B.t * SHEAR + 2 * p;
    CL.geo = { B: B, p: p, w: w, h: h };
    placeCanvas(el.clasp, hinge + B.x0 - p, -p, w, h);
    if (mode === 'open' && !tween) { CL.s = -1; CL.z = 1; CL.a = openFits() ? 1 : 0; }
    paintClasps();
  }
  function openFits() {
    if (!L.spread) return false;
    var B = claspBoxes(L.pw, L.ph);
    return L.left + 2 * L.pw + B.ex + B.t + B.ch * 0.3 <= L.W - 58;   // the next-page button is 52 px in from the right
  }
  function paintClasps() {
    var Gm = CL.geo; if (!Gm) return;
    var cv = el.clasp, dpr = Math.min(2, window.devicePixelRatio || 1), g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Gm.w, Gm.h);
    cv.style.zIndex = String(CL.z); cv.style.opacity = String(CL.a);
    var B = Gm.B, p = Gm.p, s = CL.s, piv = p + B.ex + B.t / 2;
    if (CL.a <= 0 || Math.abs(s) < 0.004) return;
    var c = claspPiece(B, s < 0);
    g.save();
    if (s < 0) { g.beginPath(); g.rect(p + B.ex, 0, Gm.w, Gm.h); g.clip(); }   // never over the open page
    g.translate(piv, 0); g.scale(Math.abs(s), 1); g.translate(-piv, 0);
    B.ys.forEach(function (y) { g.drawImage(c, p - c.pad, p + y - c.pad, c.cw, c.ch); });
    g.restore();
    if (s !== 1) return;
    var u = B.cw / CLASP.W;   // fastened: the pin's head stands over the hook
    B.ys.forEach(function (y) {
      if (B.painted) drawStud(g, p + CLASP.pin[0] * u, p + y + CLASP.pin[1] * u, CLASP.stud * u);
      else ART.draw(g, 'cover.clasp', p, p + y, B.cw, B.ch, 0, { part: 'pin' });
    });
  }
  // swing the straps from CL.s = s0 to s1 (1 or -1) over the fore-edge, then done(); at once under reduced motion
  function swingClasps(s0, s1, done) {
    CL.z = 3; CL.a = 1;
    if (reducedMotion() || !CL.geo) { CL.s = s1; paintClasps(); done(); return; }
    var t0 = now(), D = 300 * SLOW, a0 = Math.acos(s0), a1 = Math.acos(s1);
    (function step() {
      var k = clamp((now() - t0) / D, 0, 1);
      CL.s = k < 1 ? Math.cos(a0 + (a1 - a0) * ease(k)) : s1;
      paintClasps();
      if (k < 1) { requestAnimationFrame(step); return; }
      done();
    })();
  }

  /* the flyleaf: a blank leaf over the face beneath the cover while it opens, lifted away with the endpaper */
  function flyOn() {
    if (!ART.has('cover.flyleaf')) return false;
    var host = L.spread ? el.fB : el.fA;
    if (el.fly.parentNode !== host) host.insertBefore(el.fly, host.querySelector('.shade'));
    var g = prep(el.fly, L.pw, L.ph);
    ART.sheet(g, 'cover.flyleaf', 0, 0, L.pw, L.ph, 7);
    gutter(g, L.pw, L.ph, 'R');
    el.fly.style.display = 'block'; el.fly.style.opacity = '1';
    return true;
  }
  function flyOff() { el.fly.style.display = 'none'; zap(el.fly); }
  function posCount() { return L.spread ? NFACES / 2 : NFACES; }
  function posOfFace(f) { return L.spread ? f >> 1 : f; }
  function facesOf(p) { return L.spread ? [2 * p, 2 * p + 1] : [p]; }

  /* ================= state ================= */
  var SLOW = 1, mode = 'hidden', pos = 0, T = null, busyUntil = 0, tween = null, liveRaf = 0, liveTo = 0, liveWas = false;
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
    coloStart(false);
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
    thumbs = freeAll(thumbs);
    ['full', 'rich', 'under', 'glint', 'fullSun', 'richSun', 'sparks'].forEach(function (k) { zap(coloCache[k]); }); coloCache = {};
    computeLayout();
    if (mode === 'open') setStatic();
    else if (mode === 'closed') {   // the endpaper (inside the board) only matters while the cover is lifting
      drawFaceTo(el.cF, 'cover');
      if (tween) drawFaceTo(el.cK, 'endpaper', 'L');
    }
  }
  // everything a shut (or hidden) book doesn't show: the parchment, the thumbnails, the silhouettes, the
  // Colophon's layers, and the leaves' own canvases. Opening draws what it needs again (the parchment is cheap)
  function freeFaces() {
    stopLive();
    paperCache = freeAll(paperCache); thumbs = freeAll(thumbs); silCache = freeAll(silCache);
    if (tb) { zap(tb.cv); tb = null; }
    coloFree();
    [el.cA, el.cB, el.cK].forEach(zap);
  }
  // the Bestiary redraws only while something on it moves: a name fading in, a beast waking, or a beast
  // still drawn by hand (no painted PNG yet), whose idle loop runs on the clock. At most ~14 frames a second.
  var LIVE_MS = 70;
  function bestMoving(t) {
    if (best.sel && t - best.selT < 320) return true;
    for (var id in best.woke) if (t - best.woke[id] < 1150) return true;
    return BEASTS.some(function (b) { return found(b) && !ART.has('drollery.' + b); });
  }
  function liveLoop() {
    liveRaf = 0;
    var bi = mode === 'open' && !T && !tween && !document.hidden ? facesOf(pos).indexOf(F_BEST) : -1;
    if (bi < 0) { liveWas = false; return; }
    var t = now(), mv = bestMoving(t);
    if (mv || liveWas) {   // ...and once more after it settles, for the final frame
      var cv = bi === 0 ? el.cA : el.cB, g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, L.pw, L.ph);
      renderFace(F_BEST, g, L.pw, L.ph, L.spread ? (bi ? 'R' : 'L') : 'R', t);
    }
    liveWas = mv;
    if (mv) liveTo = setTimeout(liveKick, LIVE_MS);
  }
  function liveKick() { liveTo = 0; if (!liveRaf) liveRaf = requestAnimationFrame(liveLoop); }
  function startLive() { if (!liveRaf && !liveTo) liveRaf = requestAnimationFrame(liveLoop); }
  function stopLive() {
    if (liveRaf) cancelAnimationFrame(liveRaf);
    if (liveTo) clearTimeout(liveTo);
    liveRaf = 0; liveTo = 0; liveWas = false;
  }

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
      leafShow(false); zap(el.cF); zap(el.cK);   // the turning leaf is drawn afresh for every turn
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
    CL.s = 1; CL.z = 3; CL.a = 1;
    computeLayout();
    document.body.classList.add('bkClosed'); document.body.classList.remove('bkOpen');
    el.fA.style.visibility = 'hidden'; el.fB.style.visibility = 'hidden';
    el.leaf.classList.add('cover'); leafAt(L.spread ? L.pw : 0, 'left center'); leafShow(true); setAngle(0);
    el.shF.style.background = 'none'; el.shK.style.background = 'none';
    freeFaces();   // the leaves are hidden under the cover; the endpaper is drawn when the cover lifts
    drawFaceTo(el.cF, 'cover');
    spreadXf(L.closed.k, L.closed.dx, L.closed.dy);
    blockAlpha(1); flyOff();
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
    lock(1500);
    pos = posOfFace(face === undefined ? startFace() : face);
    var fs = facesOf(pos), C = L.closed, fits = openFits();
    tween = {};
    document.body.classList.remove('bkClosed');
    // the clasps unfasten first: the straps swing out over the fore-edge; then the cover lifts over them
    swingClasps(1, -1, function () {
      CL.z = 1; paintClasps();
      drawFaceTo(el.cK, 'endpaper', 'L');
      drawFaceTo(L.spread ? el.cB : el.cA, L.spread ? fs[1] : fs[0], 'R');
      if (L.spread) drawFaceTo(el.cA, fs[0], 'L');
      el.fB.style.visibility = ''; el.fA.style.visibility = L.spread ? 'hidden' : '';
      var fly = flyOn();
      var t0 = now(), D = 900 * SLOW;
      (function step() {
        var k = clamp((now() - t0) / D, 0, 1), e = ease(k);
        spreadXf(C.k + (1 - C.k) * e, C.dx * (1 - e), C.dy * (1 - e));
        setAngle(-180 * e);
        blockAlpha(clamp(1 - e * 4, 0, 1));   // the block's edge sinks under the opened leaves
        if (!fits && CL.a > 0) { CL.a = clamp(1 - e * 4, 0, 1); paintClasps(); }   // ...and the straps with it, where they don't fit
        var s = Math.abs(Math.sin(Math.PI * e));
        el.shF.style.background = 'linear-gradient(to right, rgba(20,5,2,' + (0.4 * s) + '), rgba(20,5,2,0))';
        (L.spread ? el.shB : el.shA).style.background = 'linear-gradient(to right, rgba(30,15,5,' + (0.5 * s) + '), rgba(30,15,5,0) 60%)';
        if (!L.spread) el.leaf.style.opacity = String(clamp((1 - k) / 0.2, 0, 1));
        if (k < 1) { requestAnimationFrame(step); return; }
        el.fA.style.visibility = '';
        var f0 = now(), FD = (fly ? 320 : 200) * SLOW;
        (function fade() {   // the endpaper (and the flyleaf facing it) lifts away to show the first leaves beneath
          var q = clamp((now() - f0) / FD, 0, 1);
          el.leaf.style.opacity = String(L.spread ? 1 - q : 0);
          if (fly) el.fly.style.opacity = String(1 - q);
          if (q < 1) { requestAnimationFrame(fade); return; }
          tween = null; leafShow(false); el.leaf.classList.remove('cover'); flyOff(); zap(el.cF); zap(el.cK);
          mode = 'open'; document.body.classList.add('bkOpen');
          var sv = G.save(); sv.screen = 'book'; G.persist();
          setStatic(); startLive();
        })();
      })();
    });
  }
  function closeBook() {
    if (mode !== 'open' || busy()) return;
    lock(1500); stopLive(); coloStop();
    document.body.classList.remove('bkOpen');
    el.mark.style.display = 'none';
    var C = L.closed, fits = openFits();
    CL.s = -1; CL.z = 1; CL.a = fits ? 1 : 0; paintClasps();
    // the right face (or the single face) stays beneath; the board comes back over from the left
    el.leaf.classList.add('cover'); leafAt(L.spread ? L.pw : 0, 'left center');
    drawFaceTo(el.cF, 'cover'); drawFaceTo(el.cK, 'endpaper', 'L');
    setAngle(-180); leafShow(true); el.leaf.style.opacity = '0';
    var fly = flyOn(); if (fly) el.fly.style.opacity = '0';
    blockAlpha(0);
    var t0 = now(), D = 900 * SLOW;
    tween = {};
    (function fadeIn() {
      var q = clamp((now() - t0) / 180, 0, 1);
      el.leaf.style.opacity = String(L.spread ? q : 1);
      if (fly) el.fly.style.opacity = String(q);
      if (q < 1) { requestAnimationFrame(fadeIn); return; }
      el.fA.style.visibility = L.spread ? 'hidden' : '';
      var t1 = now();
      (function step() {
        var k = clamp((now() - t1) / D, 0, 1), e = ease(k);
        setAngle(-180 * (1 - e));
        spreadXf(1 + (C.k - 1) * e, C.dx * e, C.dy * e);
        if (!L.spread) el.leaf.style.opacity = String(clamp(k / 0.2, 0, 1));
        blockAlpha(clamp(e * 4 - 3, 0, 1));
        if (!fits) { CL.a = clamp(e * 4 - 3, 0, 1); paintClasps(); }
        var s = Math.abs(Math.sin(Math.PI * e));
        el.shF.style.background = 'linear-gradient(to right, rgba(20,5,2,' + (0.4 * s) + '), rgba(20,5,2,0))';
        if (k < 1) { requestAnimationFrame(step); return; }
        // the cover is down: the straps swing back over the fore-edge and hook on
        swingClasps(-1, 1, function () { tween = null; showClosed(); });
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
    var m = mode; mode = 'hidden'; stopLive(); coloStop();
    setTimeout(function () {
      if (mode !== 'hidden') return;
      el.scr.style.display = 'none'; el.scr.classList.remove('fade');
      freeFaces(); zap(el.cF); flyOff();   // the page screen needs the memory more; the book is drawn again on return
    }, 300);
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
    blockAlpha(0); flyOff();
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
      if (a.colo) { coloStart(true); return; }
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
    // a hidden tab draws nothing: the Bestiary and the Colophon's reveal stop, and pick up again on return
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopLive(); coloPause(); return; }
      if (mode === 'open') { startLive(); coloResume(); }
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
      el.spine = $('bk_spine'); el.block = $('bk_block');
      el.clasp = document.createElement('canvas'); el.clasp.className = 'bind'; el.clasp.id = 'bk_clasp';
      el.block.parentNode.insertBefore(el.clasp, el.block.nextSibling);
      el.fly = document.createElement('canvas'); el.fly.className = 'fly';
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
    _slow: function (k) { SLOW = k || 1; },
    // freeze the Colophon monogram ms into its reveal (null: live), for screenshots
    _colo: function (ms) { colo.freeze = ms == null ? null : ms; if (mode === 'open') setStatic(); }
  };
  window.Book = Book;
})();
