/* Vellum & Vermilion — Book II's own two leaves: the Bestiary and the Colophon (index.html?book=2 only).
   Book II has no open book of its own (book.js serves Book I and the shelf), so these two faces open over the
   page screen from its Book button, as Book I's book opens from its own. Wide screens show them as a spread
   (Bestiary | Colophon); phones show one at a time, turned with the arrows, a swipe or the arrow keys.
   Book2.init(game) is called by main.js with its API; Book2.open(face) shows them (0 Bestiary, 1 Colophon).
   Art slots: drollery.<id> for the four creatures (the ids on js/levels2.js's pages), and the Colophon's
     b2.colophon       the night painting (art/b2-colophon.jpg): the study by candlelight, stars in the window
     b2.colophon.dawn  the same room at dawn with the candle out (art/b2-colophon-dawn.jpg,
                       tools/make-colophon-dawn.py)
   The Colophon reveal, the first time the finished leaf is shown or on a tap: the night painting with its candle
   flickering; the candle goes out (the dawn picture comes up round the flame first) and the window fades to dawn
   (the whole picture crosses to the dawn one). Later visits and reduced motion show the dawn at once. The save
   keeps root.b2.colo = 1; root.b2.beasts holds the creatures already woken in the Bestiary. */
(function () {
  'use strict';
  var ART = window.ART, G = null;
  var $ = function (id) { return document.getElementById(id); };
  var BLACK = '"UnifrakturMaguntia", "Uncial Antiqua", serif', FELL = '"IM Fell English", Georgia, serif';
  var RED = '#a8261a', BLUE = '#2b4f9e', INKC = '#2a1b10';
  var NAMES = { cockerel: 'Cockerel', bear: 'Bear with a Hurdy-gurdy', stag: 'Stag', bat: 'Bat' };
  var FACES = ['Bestiary', 'Colophon'], F_BEST = 0, F_COLO = 1;
  // the painting's size and the flame in it (source pixels of b2-colophon.jpg)
  var PW = 1152, PH = 1536, FLAME = { x: 463, y: 600, r: 120 };
  // the reveal: the candle flickers until OUT_T0, goes out over OUT_MS, then the window crosses to dawn
  // from DAWN_T0 over DAWN_MS
  var COLO_MS = 5500, OUT_T0 = 1300, OUT_MS = 700, DAWN_T0 = 1800, DAWN_MS = 3700;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function font(g, px, fam, style) { g.font = (style ? style + ' ' : '') + Math.round(px) + 'px ' + fam; }
  function fitFont(g, text, fam, max, w, style) {
    var s = max; font(g, s, fam, style);
    while (s > 8 && g.measureText(text).width > w) { s -= 1; font(g, s, fam, style); }
    return s;
  }

  var scr = null, cA = null, cB = null, cap = null;
  var st = { open: false, face: F_BEST, spread: false, raf: 0, last: 0, woke: {}, sel: null, hits: [[], []], lay: null,
    colo: { t0: 0, run: false, freeze: null } };
  var BEASTS = [];
  function save() { return G.save(); }
  function solvedCount() { var s = save(), k = 0; G.LEVELS.forEach(function (l) { if (s.solved[l.n]) k++; }); return k; }
  function allDone() { return solvedCount() === G.LEVELS.length; }
  function found(id) { var s = save(); return G.LEVELS.some(function (l) { return l.drollery === id && s.solved[l.n]; }); }

  /* ---------- the screen ---------- */
  function build() {
    scr = document.createElement('div'); scr.id = 'b2_scr';
    scr.innerHTML = '<div id="b2Top"><button id="b2_close">Close the book</button><span id="b2_pos"></span>' +
      '<button id="b2_shelf" title="Back to the shelf">Shelf</button></div>' +
      '<canvas id="b2_cA"></canvas><canvas id="b2_cB"></canvas><div id="b2_cap"></div>' +
      '<div id="b2_nav"><button id="b2_prev" title="Previous leaf">&lsaquo;</button><span class="dots"><i></i><i></i></span>' +
      '<button id="b2_next" title="Next leaf">&rsaquo;</button></div>';
    document.body.appendChild(scr);
    cA = $('b2_cA'); cB = $('b2_cB'); cap = $('b2_cap');
    $('b2_close').onclick = close;
    $('b2_shelf').onclick = function () { location.href = 'index.html?from=2'; };
    $('b2_prev').onclick = function () { turn(-1); };
    $('b2_next').onclick = function () { turn(1); };
    [cA, cB].forEach(function (cv) { cv.addEventListener('click', function (e) { tap(cv, e); }); });
    // a sideways swipe turns the leaf on a phone
    var sw = null;
    scr.addEventListener('pointerdown', function (e) { sw = { x: e.clientX, y: e.clientY }; });
    scr.addEventListener('pointerup', function (e) {
      if (!sw || st.spread) { sw = null; return; }
      var dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { st.swiped = now(); turn(dx < 0 ? 1 : -1); }
    });
    document.addEventListener('keydown', function (e) {
      if (!st.open) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') turn(-1);
      else if (e.key === 'ArrowRight') turn(1);
    });
    window.addEventListener('resize', function () { if (st.open) layout(); });
  }
  function layout() {
    var W = window.innerWidth, H = window.innerHeight, top = 56, pad = 12;
    var bot = 56, aw = W - 2 * pad, ah = H - top - bot;
    st.spread = aw / ah >= 1.1;
    var lh, lw;
    if (st.spread) { lh = Math.min(ah, aw / 2 / 0.75); lw = lh * 0.75; }
    else { bot = 64; ah = H - top - bot; lw = Math.min(aw, ah * 0.75); lh = lw / 0.75; }
    var x0 = (W - (st.spread ? 2 * lw : lw)) / 2, y0 = top + (ah - lh) / 2;
    st.lay = { w: lw, h: lh };
    place(cA, x0, y0, lw, lh);
    place(cB, x0 + lw, y0, lw, lh);
    cB.style.display = st.spread ? 'block' : 'none';
    cap.style.top = Math.round(y0 + lh + 6) + 'px';
    scr.classList.toggle('one', !st.spread);
    draw(true);
  }
  function place(cv, x, y, w, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.left = Math.round(x) + 'px'; cv.style.top = Math.round(y) + 'px';
    cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(h) + 'px';
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    cv._dpr = dpr;
  }
  // the faces each canvas shows: a spread is Bestiary | Colophon, a phone shows the current face
  function facesShown() { return st.spread ? [F_BEST, F_COLO] : [st.face]; }
  function turn(d) {
    if (st.spread) return;
    var f = clamp(st.face + d, 0, FACES.length - 1);
    if (f === st.face) return;
    st.face = f; st.sel = null; enterFace(); draw(true);
  }
  function chrome() {
    var fs = facesShown();
    $('b2_pos').textContent = fs.map(function (f) { return FACES[f]; }).join(' · ');
    $('b2_prev').disabled = st.face === 0; $('b2_next').disabled = st.face === FACES.length - 1;
    var dots = scr.querySelectorAll('#b2_nav .dots i');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === st.face);
    var showCap = fs.indexOf(F_COLO) >= 0 && allDone() && coloDone();
    cap.textContent = allDone() ? 'All thirty pages are finished. Thank you for playing.' : '';
    cap.classList.toggle('show', showCap);
  }

  /* ---------- open and close ---------- */
  // the leaves wait (at most 300 ms) for their creatures and paintings still on their way, sent for and
  // decoded first, so they don't open on drawn stand-ins that the paintings replace a moment later
  var opening = 0;
  function open(face) {
    if (st.open || opening) return;
    var sl = BEASTS.map(function (id) { return 'drollery.' + id; }).concat(allDone() ? ['b2.colophon', 'b2.colophon.dawn'] : [], ['page']);
    if (!ART.ready || !sl.some(function (x) { return ART.status(x) === 0; })) { openNow(face); return; }
    var tok = opening = Date.now();
    ART.ready(sl, 300).then(function () { if (opening !== tok) return; opening = 0; openNow(face); });
  }
  function openNow(face) {
    if (!scr) build();
    st.face = face === F_COLO || face === 'colo' ? F_COLO : F_BEST;
    st.open = true; st.sel = null;
    scr.classList.add('show');
    layout();
    enterFace();
    // the pictures it needs, ahead of anything still queued
    BEASTS.forEach(function (id) { want('drollery.' + id); });
    if (allDone()) { want('b2.colophon'); want('b2.colophon.dawn'); }
    loop();
  }
  function close() {
    if (!st.open) return;
    st.open = false; st.colo.run = false; st.colo.freeze = null;
    scr.classList.remove('show');
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    if (G.onClose) G.onClose();
  }
  function want(slot) { if (ART.want) ART.want(slot).then(function () { if (st.open) draw(true); }); }
  // a face coming into view: new creatures wake, and a finished Colophon not yet seen starts its reveal
  function enterFace() {
    var fs = facesShown(), s = save(), t = now();
    if (fs.indexOf(F_BEST) >= 0) {
      s.beasts = s.beasts || {};
      var fresh = false;
      BEASTS.forEach(function (id) {
        if (found(id) && !s.beasts[id]) { s.beasts[id] = 1; fresh = true; if (!reducedMotion()) st.woke[id] = t + 350; }
      });
      if (fresh) G.persist();
    }
    if (fs.indexOf(F_COLO) >= 0 && allDone() && !s.colo) coloStart();
    chrome();
  }

  /* ---------- the leaves ---------- */
  var paperCache = {}, paperSize = '';
  function paper(g, w, h, variant) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(w) + 'x' + Math.round(h) + ':' + dpr + ART.has('page'), key = size + ':' + variant;
    if (size !== paperSize) { paperCache = {}; paperSize = size; }   // a new leaf size: the old leaves go
    if (!paperCache[key]) {
      paperCache[key] = ART.makePage ? ART.makePage(Math.round(w), Math.round(h), dpr, variant ? 'left' : 'right', variant + 6) : null;
    }
    if (paperCache[key]) g.drawImage(paperCache[key], 0, 0, w, h);
    else { g.fillStyle = '#ecdcb6'; g.fillRect(0, 0, w, h); }
    // a hairline red rule round the text block with a blue one inside it, as on Book II's pages
    var m = Math.max(10, w * 0.055);
    g.strokeStyle = 'rgba(168,38,26,0.7)'; g.lineWidth = Math.max(1, w * 0.0025); g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    var m2 = m + Math.max(3, w * 0.008);
    g.strokeStyle = 'rgba(43,79,158,0.55)'; g.lineWidth = Math.max(0.8, w * 0.0018); g.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);
    return m2;
  }
  function draw(full) {
    if (!st.open || !st.lay) return;
    var fs = facesShown(), t = now();
    fs.forEach(function (f, i) {
      var cv = i ? cB : cA, g = cv.getContext('2d'), dpr = cv._dpr || 1, w = st.lay.w, h = st.lay.h;
      if (!full && f === F_BEST && !bestMoving(t)) return;
      if (!full && f === F_COLO && !st.colo.run) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      st.hits[i] = [];
      if (f === F_BEST) faceBestiary(g, w, h, t, st.hits[i]);
      else faceColophon(g, w, h, t, st.hits[i]);
    });
    chrome();
  }
  function bestMoving(t) {
    if (reducedMotion()) return BEASTS.some(function (id) { return st.woke[id] && t - st.woke[id] < 1200; }) || (st.sel && t - st.sel.t < 400);
    return BEASTS.some(found) || (st.sel && t - st.sel.t < 400);
  }
  // redrawn about fourteen times a second while something on a leaf moves (the creatures breathe, the reveal runs)
  function loop() {
    if (st.raf) return;
    (function step() {
      st.raf = 0;
      if (!st.open) return;
      var t = now();
      if (t - st.last >= (st.colo.run ? 0 : 70)) { st.last = t; draw(false); }
      if (st.colo.run && st.colo.freeze == null && t - st.colo.t0 >= COLO_MS) { st.colo.run = false; draw(true); }
      st.raf = requestAnimationFrame(step);
    })();
  }

  /* ---------- the Bestiary ---------- */
  var silCache = {};
  function silhouette(slot, bw, bh) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = slot + Math.round(bw) + 'x' + Math.round(bh) + dpr;
    if (silCache[key]) return silCache[key];
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bw * dpr)); cv.height = Math.max(1, Math.round(bh * dpr));
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    ART.draw(g, slot, 0, 0, bw, bh, 0, {});
    g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(70,45,25)'; g.fillRect(0, 0, bw, bh);
    silCache[key] = cv; return cv;
  }
  function ring(g, cx, cy, r) {
    var gd = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    gd.addColorStop(0, '#f6dd8e'); gd.addColorStop(0.5, '#c99a3c'); gd.addColorStop(1, '#f1d27a');
    g.strokeStyle = 'rgba(42,27,16,0.75)'; g.lineWidth = Math.max(2, r * 0.09); g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
    g.strokeStyle = gd; g.lineWidth = Math.max(1.4, r * 0.06); g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
    g.strokeStyle = 'rgba(43,79,158,0.6)'; g.lineWidth = Math.max(0.8, r * 0.018); g.beginPath(); g.arc(cx, cy, r * 0.88, 0, 6.283); g.stroke();
    g.fillStyle = RED;
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.07, cy + Math.sin(a) * r * 1.07, Math.max(1.2, r * 0.04), 0, 6.283); g.fill(); }
  }
  function faceBestiary(g, w, h, t, H) {
    var m = paper(g, w, h, 0), cw = w - 2 * m - w * 0.06, y = m + h * 0.02;
    g.fillStyle = RED; var ts = fitFont(g, 'The Bestiary', BLACK, clamp(w * 0.09, 16, 44), cw); y += ts * 1.05;
    g.fillText('The Bestiary', w / 2, y);
    var fk = BEASTS.filter(found).length, ss = clamp(w * 0.036, 10, 17);
    font(g, ss, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.8)';
    y += ss * 1.7; g.fillText(fk === BEASTS.length ? 'all ' + fk + ' found' : fk ? fk + ' of ' + BEASTS.length + ' found' : 'none found yet', w / 2, y);
    var nameS = clamp(w * 0.036, 10, 17), gy0 = y + ss, gh = h - m - gy0 - h * 0.035, gw = w - 2 * m;
    // two by two: each cell a ring with the creature's name under it
    var cell = gw / 2, ch = Math.min(gh / 2, cell * 1.35), gx = (w - 2 * cell) / 2, gy = gy0 + (gh - 2 * ch) / 2;
    var r = Math.min(cell * 0.4, (ch - nameS * 2.8) / 2);
    if (!(r > 4)) return;
    var rm = reducedMotion();
    BEASTS.forEach(function (id, i) {
      var cx = gx + (i % 2 + 0.5) * cell, cy = gy + Math.floor(i / 2) * ch + ch / 2 - nameS * 0.9, isF = found(id), slot = 'drollery.' + id;
      g.fillStyle = isF ? 'rgba(255,252,240,0.6)' : 'rgba(255,252,240,0.28)';
      g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
      var me = ART.meta(slot), bw, bh;
      if (me) { bh = r * 1.45; bw = bh * me.aspect; if (bw > r * 1.5) { bw = r * 1.5; bh = bw / me.aspect; } }
      else { bw = bh = r * 1.3; }
      var bx = cx - bw / 2, by = cy + r * 0.72 - bh;
      if (me && me.aspect > 1.2) by = cy - bh / 2;   // the bat hangs in the middle of its ring
      if (isF) {
        var w0 = st.woke[id], awake = w0 === undefined ? 1 : clamp((t - w0) / 1000, 0, 1);
        if (w0 !== undefined && t < w0) awake = 0;
        // breathing and a slow sway, pivoting on its feet; a springy stretch as it wakes
        var sx = me ? bx + bw * me.stem : cx, fy = by + bh, rot = 0, sy = 1;
        if (!rm) {
          if (awake < 1) { rot = Math.sin(awake * Math.PI * 3) * (1 - awake) * 0.05; sy = 1 + Math.sin(awake * Math.PI) * 0.05; }
          else { rot = Math.sin(t / 1700 + i * 1.7) * 0.012; sy = 1 + Math.sin(t / 1150 + i) * 0.008; }
        }
        g.save(); g.beginPath(); g.arc(cx, cy, r * 0.97, 0, 6.283); g.clip();
        g.translate(sx, fy); g.rotate(rot); g.scale(1, sy); g.translate(-sx, -fy);
        if (awake < 1) { g.save(); g.globalAlpha = 1 - awake * awake; ART.draw(g, slot, bx, by, bw, bh, t, { faded: true }); g.restore(); }
        if (awake > 0) { g.save(); g.globalAlpha = awake; ART.draw(g, slot, bx, by, bw, bh, t, {}); g.restore(); }
        g.restore();
        font(g, nameS, FELL, 'italic'); g.fillStyle = INKC;
        var nm = NAMES[id] || id;
        if (st.sel === id) g.fillStyle = RED;
        fitFont(g, nm, FELL, nameS, cell * 0.96, 'italic');
        g.fillText(nm, cx, cy + r + nameS * 1.7);
      } else {
        if (ART.meta(slot)) { g.save(); g.globalAlpha = 0.16; g.drawImage(silhouette(slot, bw, bh), bx, by, bw, bh); g.restore(); }
        g.fillStyle = 'rgba(110,60,30,0.55)'; var qs = Math.floor(r * 0.7); font(g, qs, BLACK); g.fillText('?', cx, cy + qs * 0.35);
      }
      ring(g, cx, cy, r);
      H.push({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, beast: id, found: isF });
    });
  }

  /* ---------- the Colophon ---------- */
  function coloDone() { return !st.colo.run; }
  function coloStart() {
    save().colo = 1; G.persist();
    if (reducedMotion()) { st.colo.run = false; return; }
    st.colo.t0 = now(); st.colo.run = true; st.last = 0;
  }
  function coloEl(t) { return st.colo.freeze != null ? st.colo.freeze : st.colo.run ? t - st.colo.t0 : COLO_MS; }
  var patch = { key: '', cv: null };
  // the dawn picture round the candle, faded out at the edge: laid over the night painting as the flame goes out
  function candlePatch(w, h) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), key = Math.round(w) + 'x' + Math.round(h) + dpr;
    if (patch.key === key && patch.cv) return patch.cv;
    var k = w / PW, cx = FLAME.x * k, cy = FLAME.y * k, r = FLAME.r * k;
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    ART.draw(g, 'b2.colophon.dawn', 0, 0, w, h, 0, {});
    var gd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(0.45, 'rgba(0,0,0,0.85)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = gd; g.fillRect(0, 0, w, h);
    patch.key = key; patch.cv = cv;
    return cv;
  }
  function faceColophon(g, w, h, t, H) {
    // (ART.has sends for a picture, so the paintings are asked after only once the book is finished)
    var done = allDone(), night = done && ART.has('b2.colophon'), dawn = done && ART.has('b2.colophon.dawn');
    if (done && (night || dawn)) {
      // the painting is a whole leaf (3:4, as the leaf is), its own vellum and border round the room
      var el = coloEl(t), P = night ? (dawn ? smooth((el - DAWN_T0) / DAWN_MS) : 0) : 1;
      var out = dawn ? smooth((el - OUT_T0) / OUT_MS) : 0;
      if (P < 1) ART.draw(g, 'b2.colophon', 0, 0, w, h, 0, {});
      if (P > 0) { g.save(); g.globalAlpha = P; ART.draw(g, 'b2.colophon.dawn', 0, 0, w, h, 0, {}); g.restore(); }
      if (P < 1 && out > 0) { g.save(); g.globalAlpha = out; g.drawImage(candlePatch(w, h), 0, 0, w, h); g.restore(); }
      if (P < 1 && out < 1 && el < COLO_MS) {   // the flame flickering in its own glow until it goes out
        var k = w / PW, fx = FLAME.x * k, fy = FLAME.y * k - 8 * k, fr = 70 * k;
        var fl = 0.5 + 0.3 * Math.sin(t / 97) + 0.2 * Math.sin(t / 41 + 1.3);
        var gl = g.createRadialGradient(fx, fy, 0, fx, fy, fr);
        gl.addColorStop(0, 'rgba(255,214,140,' + (0.22 * fl * (1 - out)) + ')'); gl.addColorStop(1, 'rgba(255,190,110,0)');
        g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gl; g.fillRect(fx - fr, fy - fr, 2 * fr, 2 * fr); g.restore();
      }
      H.push({ x: 0, y: 0, w: w, h: h, colo: true });
      return;
    }
    var m = paper(g, w, h, 1), cw = w - 2 * m - w * 0.06, y = m + h * 0.02;
    g.fillStyle = RED; var ts = fitFont(g, done ? 'Explicit' : 'Colophon', BLACK, clamp(w * 0.09, 16, 44), cw); y += ts * 1.05;
    g.fillText(done ? 'Explicit' : 'Colophon', w / 2, y);
    var s = clamp(w * 0.05, 12, 24); font(g, s, FELL, 'italic'); g.fillStyle = INKC;
    if (done) {   // the painting has not come (yet, or at all)
      y += h * 0.14; g.fillText('All thirty pages are finished.', w / 2, y, cw);
      y += s * 1.5; g.fillText('Thank you for playing.', w / 2, y, cw);
      return;
    }
    y += h * 0.12; g.fillText('The book is not finished yet.', w / 2, y, cw);
    var k = solvedCount(), s2 = clamp(w * 0.036, 10, 17); font(g, s2, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.7)';
    y += s * 1.4; g.fillText(k + ' of ' + G.LEVELS.length + ' pages finished', w / 2, y); y += s2 * 2;
    // a row of six squares for each of the five quires, gilt where a page is done
    var per = 6, sq = Math.min(cw / per * 0.6, (h - m - y - h * 0.08) / 5 * 0.62, 26), gap = sq * 0.5, rowW = per * sq + (per - 1) * gap, s3 = Math.min(s2, sq * 0.8);
    var hours = ['Lauds', 'Terce', 'Sext', 'Vespers', 'Compline'];
    // each row named for its quire's hour, when the names fit beside it (the names and squares centred together)
    font(g, s3, FELL, 'italic');
    var labW = Math.max.apply(null, hours.map(function (t) { return g.measureText(t).width; })) + gap;
    if (labW + rowW > cw) labW = 0;
    var x0 = w / 2 - (labW + rowW) / 2 + labW;
    for (var i = 0; i < G.LEVELS.length; i++) {
      var x = x0 + (i % per) * (sq + gap), yy = y + Math.floor(i / per) * (sq + gap * 1.6);
      if (save().solved[i + 1]) {
        var gd = g.createLinearGradient(x, yy, x + sq, yy + sq); gd.addColorStop(0, '#f6dd8e'); gd.addColorStop(0.5, '#c99a3c'); gd.addColorStop(1, '#f1d27a');
        g.fillStyle = gd; g.fillRect(x, yy, sq, sq);
      }
      g.strokeStyle = 'rgba(110,70,40,0.55)'; g.lineWidth = 1; g.strokeRect(x + 0.5, yy + 0.5, sq - 1, sq - 1);
      if (i % per === 0 && labW) {
        g.textAlign = 'right'; font(g, s3, FELL, 'italic'); g.fillStyle = 'rgba(42,27,16,0.6)';
        g.fillText(hours[i / per], x - gap, yy + sq * 0.75); g.textAlign = 'center';
      }
    }
  }

  /* ---------- taps ---------- */
  function tap(cv, e) {
    if (st.swiped && now() - st.swiped < 400) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, H = st.hits[cv === cB ? 1 : 0] || [];
    for (var i = 0; i < H.length; i++) {
      var b = H[i];
      if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
      if (b.beast && b.found) {
        st.sel = b.beast;
        if (!reducedMotion()) st.woke[b.beast] = now();
        if (window.SFX && SFX.pin) try { SFX.pin(); } catch (err) {}
        draw(true);
      } else if (b.colo && !st.colo.run) { coloStart(); draw(true); }
      return;
    }
  }

  window.Book2 = {
    init: function (game) {
      G = game;
      BEASTS = [];
      G.LEVELS.forEach(function (l) { if (BEASTS.indexOf(l.drollery) < 0) BEASTS.push(l.drollery); });
    },
    open: open, close: close,
    isOpen: function () { return st.open; },
    // main.js: a picture landed while the leaves are open
    refresh: function () { if (st.open) { patch.key = ''; silCache = {}; draw(true); } },
    // test hooks: what is showing; hold the Colophon's reveal at ms (null lets it run)
    state: function () {
      return { open: st.open, face: st.face, spread: st.spread, faces: facesShown(), found: BEASTS.filter(found), beasts: BEASTS.slice(),
        colo: { run: st.colo.run, el: Math.round(coloEl(now())), seen: !!save().colo } };
    },
    _colo: function (ms) { st.colo.freeze = ms == null ? null : ms; if (ms != null) st.colo.run = true; draw(true); }
  };
})();
