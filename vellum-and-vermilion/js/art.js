/* Vellum & Vermilion — art slots.
   ART.draw(ctx, slot, x, y, w, h, t, opts) draws a named slot into the box (x,y,w,h) at time t (ms).
   opts.angle rotates the slot about the box centre (terminals face +y at angle 0).
   ART.load() reads optional art/manifest.json ({slot: "file.png"} or {slot: {file, stem, v}}); a loaded
   image replaces the procedural drawing for that slot (see HANDOFF.md for sizes and prompts). A drollery
   PNG keeps its own aspect: ART.draw fits it inside the box (opts.alignX/alignY, default bottom-centre),
   ART.meta(slot) gives {aspect, stem} (stem = x of the vine's foot on the bottom edge, 0..1 of width) and
   opts.faded draws the unpainted sepia underdrawing (ART.faded(slot)). Slots:
     page        parchment leaf (cached offscreen; opts.margin = outer-margin side 'right'|'left'; opts.variant flips
                 and shifts a painted PNG per page). A page PNG is laid cover-fit under the ruling (ART.sheet).
     border      knotwork frame; the box is the outer edge, opts.band = band thickness, opts.lit 0..1
     pin         gold nail
     knot        plain ribbon terminal (opts.body = ribbon colour)
     beastHead   Insular beast head in a whole tile box: neck enters from the top edge, snout toward +y
                 (opts.body, opts.snap 0..1 jaw snap, opts.blink 0..1)
     beastTail   curled, finned tail in a whole tile box, entering from the top (opts.body, opts.wag 0..1)
                 The painted PNGs beast.headShut, beast.headOpen (shown while it snaps) and beast.tail take
                 their place when loaded: retinted to the strand (opts.fill, opts.amt; bare when none), never
                 upside down (opts.q, the tile's quarter turn on screen; else from opts.angle), ringed in gilt
                 (opts.gilt). ART.beastStop(kind) says where the board's ribbon gives way to the art
     mark        pigment lozenge (opts.pigment); a loaded mark.<pigment> PNG (the painted gems) takes its place,
                 drawn crisp from a per-size cache with a drop shadow (manifest crisp, default for mark.*)
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
  // a fourth jewel for pages without marks, so three jewels always contrast with the page's ground
  RIB.amethyst = { base: '#8a3fa8', dark: '#4f1f66', light: '#c08ad8', edge: '#73348e', name: 'amethyst' };
  // a spare jewel for marked pages whose marks and ground leave too few jewels (board.js _jewels)
  RIB.rose = { base: '#c75a8c', dark: '#7a2650', light: '#eeaacb', edge: '#ad4a78', name: 'rose madder' };
  // matte tempera for whole strands, as an illuminator lays it on vellum: sh (the same pigment darkened,
  // a shadow stroke along the edge away from the light), bd (the flat body colour), lt (body and lead white,
  // a narrower tint along the lit edge), mo (how strongly the hand-laid paint mottles). bare ribbons have
  // none and keep their flat gouache
  var PAINT = {
    ultramarine: ['#1b2862', '#30499e', '#8193c9', 1],
    lapis:       ['#1a2756', '#304886', '#7b8cbd', 1],
    emerald:     ['#173d25', '#2f7646', '#8cb994', 1],
    verdigris:   ['#1b4e47', '#33887a', '#93c6b8', 1.5],
    crimson:     ['#561424', '#9e2a3e', '#d48d96', 1],
    vermilion:   ['#7e2412', '#cc4826', '#eb9c78', 0.9],
    orpiment:    ['#946a1e', '#d9b03e', '#f2dd9c', 0.9],
    amethyst:    ['#3d1d49', '#77418a', '#b895c3', 1],
    rose:        ['#6a2246', '#c4588a', '#efb3cd', 1],
    gold:        ['#6b4a18', '#b48a40', '#e1c78a', 1.1],
    ink:         ['#1a1009', '#5a4330', '#a08060', 1]
  };
  Object.keys(PAINT).forEach(function (k) { var p = PAINT[k]; RIB[k].sh = p[0]; RIB[k].bd = p[1]; RIB[k].lt = p[2]; RIB[k].mo = p[3]; });
  // gilt: one accent strand per page (board.js _jewels) shaded as gold without metal paint (as Quill & Sigil's
  // gilded lettering): hard bands across the ribbon, umber edge, red-brown, ochre, warm gold, and a sharp
  // pale-cream line toward the light (paintBody hands it to gildBody). sh/bd/lt serve the beasts and the drain
  RIB.gilt = { base: '#d9a23e', dark: '#5a2a0e', light: '#fff1c4', edge: '#8a4d18', name: 'gilt', nmm: 1,
    sh: '#5a2a0e', bd: '#c98b2e', lt: '#f3d27a', mo: 0,
    bands: ['#341405', '#7a3c14', '#b8782a', '#e4ad48', '#f6d47e'], hi: '#fff6d6' };
  var HAIR = '#2a1508', GILT = '#c08f38', GILT_L = '#ecca6e', MADDER = '#6c1b15';

  /* ---------- panel grounds: deep manuscript grounds the gold filigree reads on ----------
     base: the ground; dk / lt: rgb of the painted mottle; band: the frame's dotted band (a brighter
     related tone, as the madder's red band); deep: rgb of the dark slivers (band hairlines, the shadow
     under the frame, the cut at a crossing); clash: ribbon colours of the same hue family, kept off it */
  var GROUND = {
    madder:    { base: '#6c1b15', dk: '45,6,4',  lt: '150,46,30',  band: '#9c2a1c', deep: '50,6,3',  clash: ['vermilion', 'crimson'], name: 'madder red' },
    lapis:     { base: '#14275c', dk: '5,10,32', lt: '50,82,160',  band: '#2b4a98', deep: '6,10,34', clash: ['lapis', 'ultramarine'], name: 'lapis navy' },
    verdigris: { base: '#123d32', dk: '3,20,15', lt: '40,110,88',  band: '#1f6b56', deep: '3,22,16', clash: ['verdigris', 'emerald'], name: 'deep verdigris' },
    folium:    { base: '#3b1744', dk: '20,4,26', lt: '110,52,124', band: '#6a2c78', deep: '24,5,30', clash: ['amethyst'], name: 'folium purple' },
    ink:       { base: '#17141d', dk: '4,3,8',   lt: '62,56,76',   band: '#7e2418', deep: '6,4,10',  clash: [], name: 'ink black' }
  };
  var GROUND_ORDER = ['madder', 'lapis', 'verdigris', 'folium'];
  var JEWELS = ['ultramarine', 'emerald', 'crimson', 'amethyst'];
  function marksOf(l) { var m = {}; (l.marks || []).forEach(function (k) { m[k[1]] = 1; }); return m; }
  function groundsFit(l) {   // the everyday grounds none of whose clashing colours are among the page's marks
    var m = marksOf(l);
    return GROUND_ORDER.filter(function (gn) { return !GROUND[gn].clash.some(function (c) { return m[c]; }); });
  }
  // one ground per page, worked out once along the whole book: great initials take the ink ground;
  // every other page takes a ground clear of its marks and never its neighbour's, preferring the one
  // used longest ago (so each quire shows several); a depth-first search backs up when a later page
  // would be left with no ground of its own. Where a run of three- and four-pigment pages leaves no
  // everyday ground at all, an ordinary page may borrow the ink ground (as few as the book needs)
  var groundTable = null;
  function buildGrounds(L) {
    var A = [], steps = 0;
    function go(i, inkLeft) {
      if (i >= L.length) return true;
      if (++steps > 50000) return false;
      var l = L[i], prev = i ? A[i - 1] : null, fit;
      if (l.initial) fit = ['ink'];
      else {
        fit = groundsFit(l).filter(function (c) { return c !== prev; });
        var last = {}, used = {};
        A.forEach(function (g, j) { last[g] = j; used[g] = (used[g] || 0) + 1; });
        fit.sort(function (a, b) {
          var la = a in last ? last[a] : -99, lb = b in last ? last[b] : -99;
          return la - lb || (used[a] || 0) - (used[b] || 0) || GROUND_ORDER.indexOf(a) - GROUND_ORDER.indexOf(b);
        });
        if (inkLeft > 0) fit.push('ink');   // the ink ground clashes with nothing
      }
      for (var k = 0; k < fit.length; k++) {
        if (fit[k] === prev) continue;
        A[i] = fit[k];
        if (go(i + 1, inkLeft - (fit[k] === 'ink' && !l.initial ? 1 : 0))) return true;
      }
      A.length = i;
      return false;
    }
    for (var K = 0; K <= 4; K++) {
      A = []; steps = 0;
      if (go(0, K)) { var T = {}; L.forEach(function (l, i) { T[l.n] = A[i]; }); return T; }
    }
    return null;
  }
  function groundName(l) {
    if (!l) return 'madder';
    var L = (typeof window !== 'undefined' && window.LEVELS) || null;
    if (L && !groundTable) groundTable = buildGrounds(L) || {};
    if (groundTable && groundTable[l.n] && L[l.n - 1] && L[l.n - 1].mask === l.mask) return groundTable[l.n];
    // a page outside the book: the first fitting ground from a turn of the order set by its number
    if (l.initial) return 'ink';
    var fit = groundsFit(l), k = ((l.n || 1) - 1) % 4;
    for (var j = 0; j < 4; j++) { var gn = GROUND_ORDER[(k + j) % 4]; if (fit.indexOf(gn) >= 0) return gn; }
    return 'ink';
  }
  // the three jewels for a page without marks on this ground (none of the ground's own hue)
  function jewelsFor(gn) {
    var c = (GROUND[gn] || GROUND.madder).clash;
    return JEWELS.filter(function (j) { return c.indexOf(j) < 0; }).slice(0, 3);
  }
  var images = {}, metas = {}, fadedCache = {}, crispCache = {};
  // slots whose drawing function lays its own PNG (placement, cells or tint), so ART.draw doesn't stretch it
  var SELF = { knot: 1, twinFrame: 1, twinEmblem: 1 };
  // the painted knot (knot.png, ribbon entering from the top): where it sits in the tile, in tiles from the
  // centre, and where the board's ribbon gives way to it; its cream band is tinted to the strand
  var KNOT = { y0: -0.30, y1: 0.48, w: 0.40, stop: -0.26, cream: [243, 233, 208] }, knotCache = {}, knotCacheN = 0;
  function knotCanvas(w, h, body) {
    var key = Math.round(w) + 'x' + Math.round(h) + body;
    if (knotCache[key]) return knotCache[key];
    if (knotCacheN++ > 80) { knotCache = {}; knotCacheN = 0; }
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    var g = cv.getContext('2d'), c = hexRgb(body);
    g.drawImage(images.knot, 0, 0, cv.width, cv.height);
    // multiply by body / cream, so the painted cream becomes the strand's colour and the ink stays dark
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(' + c.map(function (v, i) { return Math.min(255, Math.round(v * 255 / KNOT.cream[i])); }).join(',') + ')';
    g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(images.knot, 0, 0, cv.width, cv.height);
    knotCache[key] = cv; return cv;
  }
  function hexRgb(s) {
    if (s && s[0] === '#') { var n = parseInt(s.length === 4 ? s.replace(/#(.)(.)(.)/, '$1$1$2$2$3$3') : s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : [246, 235, 207];
  }
  // the painted plait (border-plait.png, one seamless repeat) laid round a rectangular panel: each side
  // between the corners holds a whole number of repeats, stretched a little to fit; red corner bosses
  function paintBorder(g, box, b) {
    var img = images.border, rep = b * img.naturalWidth / img.naturalHeight;
    var x = box[0], y = box[1], w = box[2], h = box[3];
    function side(len) {   // drawn along +x from (0,0), the band's outer edge at y=0
      var n = Math.max(1, Math.round(len / rep)), L = len / n;
      for (var i = 0; i < n; i++) g.drawImage(img, i * L - 0.4, 0, L + 0.8, b);
    }
    [[x + b, y, 0, w - 2 * b], [x + w, y + b, Math.PI / 2, h - 2 * b], [x + w - b, y + h, Math.PI, w - 2 * b], [x, y + h - b, -Math.PI / 2, h - 2 * b]].forEach(function (s) {
      g.save(); g.translate(s[0], s[1]); g.rotate(s[2]); side(s[3]); g.restore();
    });
    [[x, y], [x + w - b, y], [x, y + h - b], [x + w - b, y + h - b]].forEach(function (c, i) {
      var cx = c[0] + b / 2, cy = c[1] + b / 2, r = b * 0.44, gd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      gd.addColorStop(0, '#f8e3a0'); gd.addColorStop(0.6, '#d2a646'); gd.addColorStop(1, '#8a611c');
      g.fillStyle = HAIR; g.beginPath(); g.arc(cx, cy, r + Math.max(1, b * 0.05), 0, 6.283); g.fill();
      g.fillStyle = gd; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
      g.fillStyle = PIG.vermilion.base; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, 6.283); g.fill();
      g.fillStyle = i % 3 === 0 ? PIG.lapis.base : PIG.verdigris.base;
      for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, r * 0.15, 0, 6.283); g.fill(); }
      g.fillStyle = '#f2d27a'; g.beginPath(); g.arc(cx, cy, r * 0.13, 0, 6.283); g.fill();
    });
  }
  var cache = {};

  // a small PNG (a crisp slot: the mark.* gems) is pre-rendered once per device-pixel size, halving the
  // source repeatedly for a clean downscale, with a soft dark drop shadow so it lifts off any ribbon or
  // ground; it is then drawn on whole device pixels when the context isn't rotated
  function devScale(ctx) {
    try { var m = ctx.getTransform(), s = Math.sqrt(m.a * m.a + m.b * m.b); if (s > 0) return s; } catch (e) {}
    return window.devicePixelRatio || 1;
  }
  function crispOf(slot, img, W, H) {
    var key = slot + ':' + W + 'x' + H;
    if (crispCache[key]) return crispCache[key];
    var src = img, sw = img.naturalWidth, sh = img.naturalHeight;
    while (sw / 2 >= W && sh / 2 >= H) {
      var hw = Math.max(1, Math.round(sw / 2)), hh = Math.max(1, Math.round(sh / 2));
      var hc = document.createElement('canvas'); hc.width = hw; hc.height = hh;
      var hg = hc.getContext('2d'); hg.imageSmoothingEnabled = true; hg.imageSmoothingQuality = 'high';
      hg.drawImage(src, 0, 0, sw, sh, 0, 0, hw, hh);
      src = hc; sw = hw; sh = hh;
    }
    var p = Math.ceil(Math.max(2, W * 0.1)), cv = document.createElement('canvas');
    cv.width = W + 2 * p; cv.height = H + 2 * p;
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.shadowColor = 'rgba(16,6,2,0.7)'; g.shadowBlur = Math.max(1.5, W * 0.07); g.shadowOffsetY = Math.max(0.6, W * 0.035);
    g.drawImage(src, 0, 0, sw, sh, p, p, W, H);
    var n = Object.keys(crispCache).length;
    if (n > 120) crispCache = {};
    return (crispCache[key] = { cv: cv, p: p, W: W, H: H });
  }
  function drawCrisp(ctx, slot, img, x, y, w, h) {
    var s = devScale(ctx), W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s)), c = crispOf(slot, img, W, H), m = null;
    try { m = ctx.getTransform(); } catch (e) {}
    if (m && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && m.a > 0 && m.d > 0) {
      // axis-aligned: centre the cached bitmap on whole device pixels
      var dx = m.a * (x + w / 2) + m.e - W / 2, dy = m.d * (y + h / 2) + m.f - H / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(c.cv, Math.round(dx) - c.p, Math.round(dy) - c.p);
    } else {
      var k = w / W;
      ctx.drawImage(c.cv, x + w / 2 - (W / 2 + c.p) * k, y + h / 2 - (H / 2 + c.p) * (h / H), c.cv.width * k, c.cv.height * (h / H));
    }
  }

  /* ---------- painted beasts: beast.headShut, beast.headOpen, beast.tail ---------- */
  // Each PNG is a side profile in pale cream with dark ink outlines: the head faces left, its neck band
  // running right to a hard cut; the tail's band runs right the same way. Measured in source pixels:
  // a = the band's centre at the tile's entry edge, phi = the turn that lays the band along the axis,
  // band = its width (outline to outline) where it meets the board's ribbon, len = the reach from a to the
  // snout or the tail's curl, f0..f1 = the span (along the axis, back from a) where the art fades into
  // the ribbon (only below fy across it, so a head's lappet stays), eye = [x, y, r] of the eye's white.
  // The cream is retinted to the strand's ramp once per colour and size and kept, ringed in gold.
  var BEAST = {
    'beast.headShut': { a: [422.0, 149.3], phi: -0.0937, band: 130, len: 421, f0: -36, f1: -4, fy: -76, eye: [122, 88.5, 15], kind: 'head', mod: [-245, -165], pen: [-235, -150] },
    'beast.headOpen': { a: [422.0, 149.1], phi: -0.0937, band: 130, len: 421, f0: -36, f1: -4, fy: -76, eye: [129.5, 84.5, 15], kind: 'head', mouth: true, mod: [-245, -165], pen: [-235, -150] },
    'beast.tail':     { a: [440.0, 78.0], phi: 0.085, band: 138, len: 438, f0: -44, f1: -6, fy: -999, kind: 'tail', mod: [-330, -230], pen: [-300, -200] }
  };
  // mod: [x0, x1] along the axis, where the ribbon's modelling (shadow band, tint) eases off over the head or the
  // tail's curl; pen: where the lead-white penwork tapers to a point. Both in source px from the cut (negative)
  var BEAST_BAND = 0.36, BEAST_MARGIN = 0.02;   // the art band's share of a tile: the board's ribbon body, so the gilt meets
  var beastPrep = {}, beastCache = {}, beastCacheN = 0, beastBad = {};
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  // once per PNG: what each pixel is (cream body to retint, or ink, tongue, teeth and eye to keep),
  // its place on the ramp, and the fade into the ribbon
  function prepBeast(slot) {
    if (beastPrep[slot] || beastBad[slot]) return beastPrep[slot] || null;
    var img = images[slot], B = BEAST[slot];
    if (!img || !B) return null;
    var W = img.naturalWidth, H = img.naturalHeight, d;
    try {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d'); g.drawImage(img, 0, 0); d = g.getImageData(0, 0, W, H).data;
    } catch (e) { beastBad[slot] = 1; return null; }   // a tainted canvas (file://): the drawn beast instead
    var N = W * H, Lm = new Float32Array(N), cream = new Uint8Array(N), i;
    for (i = 0; i < N; i++) {
      var r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      Lm[i] = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
      if (d[i * 4 + 3] > 128 && Lm[i] > 0.5 && (mx - mn) / Math.max(1, mx) < 0.32) cream[i] = 1;
    }
    // the cream in small islands is kept as painted: the eye's white, and the teeth in an open mouth
    var lab = new Int32Array(N), stack = new Int32Array(N), keep = new Uint8Array(N), n = 0;
    for (i = 0; i < N; i++) {
      if (!cream[i] || lab[i]) continue;
      n++; var sp = 0, cnt = 0, sx = 0, sy = 0, list = []; stack[sp++] = i; lab[i] = n;
      while (sp) {
        var p = stack[--sp], px = p % W, py = (p / W) | 0; cnt++; sx += px; sy += py; if (list.length < 700) list.push(p);
        if (px > 0 && cream[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack[sp++] = p - 1; }
        if (px < W - 1 && cream[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack[sp++] = p + 1; }
        if (py > 0 && cream[p - W] && !lab[p - W]) { lab[p - W] = n; stack[sp++] = p - W; }
        if (py < H - 1 && cream[p + W] && !lab[p + W]) { lab[p + W] = n; stack[sp++] = p + W; }
      }
      if (cnt < 600) {
        var mx2 = sx / cnt, my2 = sy / cnt, isle = false;
        if (B.eye && Math.hypot(mx2 - B.eye[0], my2 - B.eye[1]) < B.eye[2] + 8) isle = true;
        if (B.mouth && cnt > 20 && mx2 < 175 && my2 > 125) isle = true;
        if (isle) for (var j = 0; j < list.length; j++) keep[list[j]] = 1;
      }
    }
    // w: how much of the pixel is cream to retint; x: its place on the ramp; f: the fade into the ribbon
    var wt = new Float32Array(N), xr = new Float32Array(N), fade = new Float32Array(N), xaA = new Float32Array(N), cp = Math.cos(B.phi), sp2 = Math.sin(B.phi);
    for (i = 0; i < N; i++) {
      var R = d[i * 4], G = d[i * 4 + 1], Bb = d[i * 4 + 2], M2 = Math.max(R, G, Bb), m2 = Math.min(R, G, Bb), L = Lm[i];
      var sat = (M2 - m2) / Math.max(1, M2);
      wt[i] = keep[i] ? 0 : (1 - sstep(0.28, 0.4, sat)) * (1 - sstep(30, 50, R - G));
      xr[i] = L < 0.62 ? 0.1 : L < 0.8 ? 0.1 + (L - 0.62) / 0.18 * 0.32 : L < 0.91 ? 0.42 + (L - 0.8) / 0.11 * 0.2 : Math.min(1, 0.62 + (L - 0.91) / 0.06 * 0.3);
      var X = i % W - B.a[0], Y = ((i / W) | 0) - B.a[1];
      xaA[i] = cp * X - sp2 * Y;
      fade[i] = beastFade(B, xaA[i], sp2 * X + cp * Y);
    }
    // for modelling the beast as the ribbon is modelled: the distance in from its outline as drawn (the art is
    // squeezed along its axis by r to fit a tile), in source px across. Only transparent pixels count as
    // outside, so the neck runs on past the image's right edge
    var r = Math.min(1, (1 - BEAST_MARGIN) / B.len / (BEAST_BAND / B.band)), INF = 1e10, f2 = new Float64Array(N), x, y;
    for (i = 0; i < N; i++) f2[i] = d[i * 4 + 3] < 128 ? 0 : INF;
    var mxn = Math.max(W, H), fb = new Float64Array(mxn), db = new Float64Array(mxn), vb = new Int32Array(mxn), zb = new Float64Array(mxn + 1);
    for (y = 0; y < H; y++) { for (x = 0; x < W; x++) fb[x] = f2[y * W + x]; edt1(fb, W, r, db, vb, zb); for (x = 0; x < W; x++) f2[y * W + x] = db[x]; }
    for (x = 0; x < W; x++) { for (y = 0; y < H; y++) fb[y] = f2[y * W + x]; edt1(fb, H, 1, db, vb, zb); for (y = 0; y < H; y++) f2[y * W + x] = db[y]; }
    var Dd = new Float32Array(N), cl = [];
    for (i = 0; i < N; i++) {
      Dd[i] = Math.max(0, Math.sqrt(f2[i]) - 0.5);   // to the outline itself, half a pixel short of the nearest clear pixel
      if (wt[i] > 0.5 && fade[i] > 0 && i % 7 === 0) cl.push(Lm[i]);
    }
    cl.sort(function (a, b) { return a - b; });
    var Lmed = cl.length ? cl[cl.length >> 1] : 0.85, Lsp = cl.length ? Math.max(0.03, (cl[Math.floor(cl.length * 0.9)] - cl[Math.floor(cl.length * 0.1)]) / 2) : 0.08;
    return (beastPrep[slot] = { W: W, H: H, d: d, L: Lm, w: wt, x: xr, fade: fade, xa: xaA, D: Dd, r: r, Lmed: Lmed, Lsp: Lsp });
  }
  // one row of a squared Euclidean distance transform (Felzenszwalb), samples sp apart
  function edt1(f, n, sp, out, v, z) {
    var k = 0, q, s;
    v[0] = 0; z[0] = -1e30; z[1] = 1e30;
    function cut(q, p) { var a = q * sp, b = p * sp; return ((f[q] + a * a) - (f[p] + b * b)) / (2 * (a - b)); }
    for (q = 1; q < n; q++) {
      s = cut(q, v[k]);
      while (s <= z[k]) { k--; s = cut(q, v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e30;
    }
    k = 0;
    for (q = 0; q < n; q++) { var p = q * sp; while (z[k + 1] < p) k++; var dd = p - v[k] * sp; out[q] = dd * dd + f[v[k]]; }
  }
  function sampD(P, x, y) {
    var W = P.W, H = P.H;
    x = x < 0 ? 0 : x > W - 1.001 ? W - 1.001 : x; y = y < 0 ? 0 : y > H - 1.001 ? H - 1.001 : y;
    var x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, i = y0 * W + x0, D = P.D;
    return (D[i] * (1 - tx) + D[i + 1] * tx) * (1 - ty) + (D[i + W] * (1 - tx) + D[i + W + 1] * tx) * ty;
  }
  // the ribbon's tempera laid over a beast for a quarter turn q of its tile: m, the shade in [-1, 1] (-1 the
  // shadow colour, 0 the body, 1 the tint) from the same nested, light-shifted strokes as paintBody but measured
  // from the beast's own outline; pen, the lead-white line's cover on the lit side, tapering out over the head
  var beastMod = {}, beastWarmQ = [], beastWarmOn = false;
  // build a beast's tempera model in idle time while it is still bare, so the flood doesn't stall on it
  function warmBeast(slot, q) {
    var key = slot + '|' + q;
    if (beastMod[key] || beastWarmQ.indexOf(key) >= 0 || !images[slot] || beastBad[slot]) return;
    beastWarmQ.push(key);
    if (beastWarmOn) return;
    beastWarmOn = true;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 50); };
    (function step() {
      idle(function () {
        var k = beastWarmQ.shift();
        if (k) { var at = k.lastIndexOf('|'); try { beastModel(k.slice(0, at), +k.slice(at + 1)); } catch (e) {} }
        if (beastWarmQ.length) step(); else beastWarmOn = false;
      });
    })();
  }
  // GL, gk: other nested strokes (the gilt's, giltLayers) and their cache key; then m holds their value, no pen
  function beastModel(slot, q, GL, gk) {
    var key = slot + '|' + q + (GL ? '|' + gk : '');
    if (beastMod[key]) return beastMod[key];
    var P = prepBeast(slot), B = BEAST[slot];
    if (!P) return null;
    var W = P.W, H = P.H, N = W * H, w = B.band, r = P.r;
    // the page's light (top-left) in the tile's frame, then in the beast's: the turn onto the entry edge and the
    // mirror undone, the squeeze and the art's tilt. (ux, uy): one band px toward the light, in source px
    var an = q * Math.PI / 2, tx = -0.7071 * Math.cos(an) - 0.7071 * Math.sin(an), ty = 0.7071 * Math.sin(an) - 0.7071 * Math.cos(an);
    var ix = -ty, iy = tx;
    if (q === 0 || q === 3) iy = -iy;
    var ax = ix / r, cp = Math.cos(B.phi), sp = Math.sin(B.phi), ux = cp * ax + sp * iy, uy = -sp * ax + cp * iy;
    var ul = Math.hypot(ux, uy), nx = ux / ul, ny = uy / ul, s = SHADE, t = TINT;
    var L = GL || [[-1, 1, 0], [-0.6, 1 - 0.45 * s, 0.225 * s], [-0.25, 1 - 0.78 * s, 0.39 * s], [1, 1 - s, s / 2],
      [0.6, 1 - s - 0.45 * t, (s - 0.45 * t) / 2], [0.28, 1 - s - 0.75 * t, (s - 0.75 * t) / 2], [0, 1 - s - t, (s - t) / 2]];
    var m = new Float32Array(N), pen = new Float32Array(N), pw = 0.034 * w, pd = w * (0.5 - 0.2 * 0.7071), AA = 1.4, D = P.D;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (D[i] <= 0 || P.fade[i] <= 0) continue;
      var v = 0;
      for (var k = 0; k < L.length; k++) {
        var sh = L[k][2] * w, Dk = sh ? sampD(P, x - ux * sh, y - uy * sh) : D[i];
        var c = (Dk - w * (1 - L[k][1]) / 2) / AA + 0.5;
        if (c > 0) v += (L[k][0] - v) * (c > 1 ? 1 : c);
      }
      m[i] = v;
      if (GL) continue;
      var pf = sstep(B.pen[0], B.pen[1], P.xa[i]);
      if (pf > 0 && Math.abs(D[i] - pd) < pw) {   // the pen keeps its distance in from the lit edge, as on the ribbon
        var gx = sampD(P, x + 1, y) - sampD(P, x - 1, y), gy = sampD(P, x, y + 1) - sampD(P, x, y - 1), gl = Math.hypot(gx, gy);
        var face = gl > 1e-3 ? -(gx * nx + gy * ny) / gl : 0, a = (pw * pf / 2 - Math.abs(D[i] - pd)) / AA + 0.5;
        pen[i] = (a < 0 ? 0 : a > 1 ? 1 : a) * sstep(0.3, 0.6, face) * Math.min(1, pf * 1.6);
      }
    }
    return (beastMod[key] = { m: m, pen: pen });
  }
  // how much of the art shows at (xa, ya), measured from the cut along and across the neck: none past the cut,
  // rising over the last stretch of the neck so the ribbon shows through there (the ears are never faded)
  function beastFade(B, xa, ya) { return xa >= 0 ? 0 : ya < B.fy ? 1 : 1 - sstep(B.f0, B.f1, xa); }
  // the ramp a beast is retinted to: a painted strand's own, the bare vellum's, or one made from a flat colour
  function beastRamp(o) {
    var r = o.fill;
    if (r && r.nmm) return { key: 'gilt', sh: r.sh, bd: r.bd, lt: r.lt, mo: 0, paint: true, gilt: r };
    if (r && r.sh) return { key: r.sh + r.bd + r.lt, sh: r.sh, bd: r.bd, lt: r.lt, mo: r.mo || 1, paint: true };
    if (o.flat) return { key: 'flat' + o.flat, sh: mix(o.flat, '#120800', 0.45), bd: o.flat, lt: mix(o.flat, '#fffbe8', 0.5) };
    var b = RIB.bare;
    return { key: 'bare', sh: mix(b.edge, b.dark, 0.5), bd: b.base, lt: b.light };
  }
  // halve a canvas in steps, then to tw x th, for a clean small copy
  function beastDown(src, W, H, tw, th) {
    var cur = src, cw = W, ch = H;
    while (cw / 2 >= tw && ch / 2 >= th) {
      var hw = Math.round(cw / 2), hh = Math.round(ch / 2), hc = document.createElement('canvas'); hc.width = hw; hc.height = hh;
      var hg = hc.getContext('2d'); hg.imageSmoothingEnabled = true; hg.imageSmoothingQuality = 'high';
      hg.drawImage(cur, 0, 0, cw, ch, 0, 0, hw, hh); cur = hc; cw = hw; ch = hh;
    }
    var out = document.createElement('canvas'); out.width = tw; out.height = th;
    var og = out.getContext('2d'); og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
    return out;
  }
  // one tinted, faded, downscaled and gilt-rimmed copy at kc device pixels per source pixel. A painted strand's
  // beast (ramp.paint) is laid in the ribbon's own tempera for its tile's quarter turn q: the shadow band, tint
  // and penwork run on up the neck from the ribbon and ease off over the head, the art's own shading is kept
  // only faintly, and its ink outline takes the pigment's darkest shade (all its ink runs into the paint near
  // the cut). It also keeps a mask of its paint, for the mottle laid over it where it lies on the page
  function beastCanvas(slot, ramp, kc, rim, q) {
    var painted = !!ramp.paint && q != null;
    var key = slot + '|' + ramp.key + '|' + Math.round(kc * 4000) + '|' + (rim ? rim.join(',') : '') + (ramp.paint && q != null ? '|q' + q : '');
    if (beastCache[key]) return beastCache[key];
    var P = prepBeast(slot); if (!P) return null;
    var gilt = painted && ramp.gilt, Mo, CG, eF, hF, glint = null, gv = -1;
    if (gilt) {   // the gilt's bands measured from the beast's outline, with the ribbon's pixel floors at this size
      var wd = BEAST[slot].band * kc;   // the ribbon's width in device px
      eF = Math.round(Math.max(0.1, 1.4 / wd) * 200) / 200; hF = Math.round(Math.max(0.085, 1.6 / wd) * 200) / 200;
      Mo = beastModel(slot, q, giltLayers(eF, hF), eF + ',' + hF);
      CG = ramp.gilt.bands.concat([ramp.gilt.hi]).map(rgbOf);
    } else Mo = painted ? beastModel(slot, q) : null;
    var W = P.W, H = P.H, N = W * H, lut = [], k, i, B = BEAST[slot];
    for (k = 0; k <= 64; k++) lut.push(rgbOf(beastAt(ramp, k / 64)));
    var low = lut[Math.round(0.1 * 64)], ref = [170, 154, 128];
    var src = document.createElement('canvas'); src.width = W; src.height = H;
    var sg = src.getContext('2d'), id = sg.createImageData(W, H), o = id.data, d = P.d;
    var mk = painted ? sg.createImageData(W, H) : null, md = mk ? mk.data : null;
    var S0, B0, L0, CT, PC = [251, 241, 218], pc = [0, 0, 0];
    if (painted) { S0 = rgbOf(ramp.sh); B0 = rgbOf(ramp.bd); L0 = rgbOf(ramp.lt); CT = rgbOf(mix(ramp.sh, HAIR, 0.3)); }
    if (gilt) CT = rgbOf(mix(ramp.gilt.bands[0], HAIR, 0.5));
    for (i = 0; i < N; i++) {
      var qq = i * 4, a = P.fade[i] > 0 ? d[qq + 3] : 0;   // cut square at the neck; faded after the rim is on
      if (a < 1) { o[qq + 3] = 0; continue; }
      var w = P.w[i], r = d[qq], g = d[qq + 1], b = d[qq + 2], L = P.L[i];
      if (painted) {
        var px = i % W, py = (i / W) | 0, ya = Math.sin(B.phi) * (px - B.a[0]) + Math.cos(B.phi) * (py - B.a[1]);
        var ob = sstep(B.band / 2 + 3, B.band / 2 + 15, Math.abs(ya));   // out of the band (an ear): part of the head
        var xa = P.xa[i], hv = 1 - sstep(B.mod[0], B.mod[1], xa) * (1 - ob);   // 0 on the neck, 1 over the head
        var dl = (L - P.Lmed) / P.Lsp; dl = dl < -1 ? -1 : dl > 1 ? 1 : dl; dl = dl < 0 ? -Math.pow(-dl, 1.6) : Math.pow(dl, 1.6);
        if (gilt) {   // the ribbon's bands run on up the neck; over the head the art's own light is laid in the same
          // hard steps (umber, red-brown, ochre, gold, pale gold), never blended softly between them
          var gv0 = Mo.m[i] * (1 - 0.4 * hv) + (1.2 + 1.6 * (dl + 1)) * 0.4 * hv;
          gv0 = gv0 < 0 ? 0 : gv0 > 5 ? 5 : gv0;
          var gf = Math.min(4, gv0 | 0), gt = sstep(0.35, 0.65, gv0 - gf), c0 = CG[gf], c1 = CG[gf + 1];
          pc[0] = c0[0] + (c1[0] - c0[0]) * gt; pc[1] = c0[1] + (c1[1] - c0[1]) * gt; pc[2] = c0[2] + (c1[2] - c0[2]) * gt;
          if (hv > 0.6 && ob < 0.5 && L >= 0.62 && P.D[i] > B.band * 0.12 && gv0 > gv) { gv = gv0; glint = [px, py]; }
        } else {
        var v = Mo.m[i] * (1 - 0.45 * hv) + dl * (0.1 + 0.3 * hv);
        v = v < -1 ? -1 : v > 1 ? 1 : v;
        var tg = v < 0 ? S0 : L0, av = v < 0 ? -v : v;
        pc[0] = B0[0] + (tg[0] - B0[0]) * av; pc[1] = B0[1] + (tg[1] - B0[1]) * av; pc[2] = B0[2] + (tg[2] - B0[2]) * av;
        }
        var pa = gilt ? 0 : Mo.pen[i] * 0.5 * (1 - ob);
        if (pa > 0) { pc[0] += (PC[0] - pc[0]) * pa; pc[1] += (PC[1] - pc[1]) * pa; pc[2] += (PC[2] - pc[2]) * pa; }
        var kw = L >= 0.62 ? w : w * sstep(0.22, 0.62, L);   // the pixel's share of cream (an outline's soft edge: part)
        if (kw < 1) {
          var cf = P.D[i] < 12 && L < 0.5 && !(B.mouth && px < 175 && py > 125) ? 0.85 : 0, nk = sstep(-110, -40, xa) * (1 - ob);
          r += (CT[0] - r) * cf; g += (CT[1] - g) * cf; b += (CT[2] - b) * cf;
          r += (pc[0] - r) * nk; g += (pc[1] - g) * nk; b += (pc[2] - b) * nk;
          kw += (1 - kw) * nk;
        }
        r += (pc[0] - r) * kw; g += (pc[1] - g) * kw; b += (pc[2] - b) * kw;
        md[qq + 3] = Math.round(a * kw);
      } else if (w > 0) {
        if (L >= 0.62) {
          var c = lut[Math.round(P.x[i] * 64)];
          r += (c[0] - r) * w; g += (c[1] - g) * w; b += (c[2] - b) * w;
        } else {   // an outline's soft edge: shift only its share of cream
          var f = w * sstep(0.22, 0.62, L);
          r += (low[0] - ref[0]) * f; g += (low[1] - ref[1]) * f; b += (low[2] - ref[2]) * f;
        }
      }
      o[qq] = r < 0 ? 0 : r > 255 ? 255 : r; o[qq + 1] = g < 0 ? 0 : g > 255 ? 255 : g; o[qq + 2] = b < 0 ? 0 : b > 255 ? 255 : b; o[qq + 3] = a;
    }
    sg.putImageData(id, 0, 0);
    if (glint) {   // a pinpoint of near-white on the head's brightest gold
      var gr = Math.max(B.band * 0.07, 1.3 / kc);
      sg.fillStyle = 'rgba(255,250,232,0.55)'; sg.beginPath(); sg.arc(glint[0], glint[1], gr * 1.6, 0, 6.2832); sg.fill();
      sg.fillStyle = '#fffdf4'; sg.beginPath(); sg.arc(glint[0], glint[1], gr * 0.8, 0, 6.2832); sg.fill();
    }
    var tw = Math.max(2, Math.round(W * kc)), th = Math.max(2, Math.round(H * kc));
    var art = beastDown(src, W, H, tw, th), mask = null;
    if (painted) { sg.putImageData(mk, 0, 0); mask = beastDown(src, W, H, tw, th); }
    var pad = rim ? Math.ceil(rim[0]) + 2 : 1, cv = document.createElement('canvas');
    cv.width = tw + 2 * pad; cv.height = th + 2 * pad;
    var g2 = cv.getContext('2d'); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high';
    if (rim) {   // the board's gilt edge: a dark hairline, the gold, a burnished lip, stamped round the silhouette
      var sil = document.createElement('canvas'); sil.width = tw; sil.height = th;
      var sl = sil.getContext('2d');
      [[rim[0], HAIR], [rim[1], GILT], [rim[2], GILT_L]].forEach(function (st) {
        sl.globalCompositeOperation = 'source-over'; sl.clearRect(0, 0, tw, th); sl.drawImage(art, 0, 0);
        sl.globalCompositeOperation = 'source-in'; sl.fillStyle = st[1]; sl.fillRect(0, 0, tw, th);
        var R0 = st[0], steps = Math.max(12, Math.ceil(R0 * 5));
        for (var ring = 1; ring <= 2; ring++) {
          var rr = R0 * ring / 2;
          for (var s = 0; s < steps; s++) { var an = s / steps * 6.2832; g2.drawImage(sil, pad + Math.cos(an) * rr, pad + Math.sin(an) * rr); }
        }
      });
    }
    g2.drawImage(art, pad, pad);
    // then fade art and rim together where the neck runs into the ribbon, so no gilt edge crosses the band
    var cp = Math.cos(B.phi), sp = Math.sin(B.phi), sx = W / tw, sy = H / th;
    var fm = g2.createImageData(cv.width, cv.height), fd = fm.data;
    for (var py2 = 0; py2 < cv.height; py2++) for (var px2 = 0; px2 < cv.width; px2++) {
      var X = (px2 - pad + 0.5) * sx - B.a[0], Y = (py2 - pad + 0.5) * sy - B.a[1];
      fd[(py2 * cv.width + px2) * 4 + 3] = Math.round(255 * beastFade(B, cp * X - sp * Y, sp * X + cp * Y));
    }
    var fc = document.createElement('canvas'); fc.width = cv.width; fc.height = cv.height; fc.getContext('2d').putImageData(fm, 0, 0);
    g2.globalCompositeOperation = 'destination-in'; g2.drawImage(fc, 0, 0); g2.globalCompositeOperation = 'source-over';
    var mcv = null;
    if (mask) {
      mcv = document.createElement('canvas'); mcv.width = cv.width; mcv.height = cv.height;
      var mg = mcv.getContext('2d'); mg.drawImage(mask, pad, pad);
      mg.globalCompositeOperation = 'destination-in'; mg.drawImage(fc, 0, 0);
    }
    if (++beastCacheN > 120) { beastCache = {}; beastCacheN = 1; beastMot = {}; }
    return (beastCache[key] = { cv: cv, pad: pad, kc: kc, mask: mcv, key: key });
  }
  // the hand-laid mottle over a painted beast, pinned to the page as on the ribbon (M: the copy's pixels to the
  // device's), so it runs on unbroken from the neck. Made once per place on the board while its tile is at rest
  var beastMot = {}, beastMotN = 0;
  function beastMottle(c, M, dev) {
    if (!c.mask) return null;
    var key = c.key + '|' + [M.a, M.b, M.c, M.d, M.e, M.f].map(function (v) { return Math.round(v * 256); }).join(',');
    if (beastMot[key] !== undefined) return beastMot[key];
    if (++beastMotN > 120) { beastMot = {}; beastMotN = 1; }
    var cv = document.createElement('canvas'); cv.width = c.cv.width; cv.height = c.cv.height;
    var g = cv.getContext('2d'), pat = g.createPattern(grainCanvas(), 'repeat');
    if (!pat || !pat.setTransform) return (beastMot[key] = null);
    try { pat.setTransform(M.inverse().scale(dev)); } catch (e) { return (beastMot[key] = null); }
    g.fillStyle = pat; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(c.mask, 0, 0);
    return (beastMot[key] = cv);
  }
  // the scale of a painted beast in a tile of side 1: along its axis (fitted to the tile) and across it
  // (its band matched to the ribbon); null when the painted beast isn't ready
  function beastGeom(kind, band) {
    var B = kind === 'tail' ? BEAST['beast.tail'] : BEAST['beast.headShut'];
    var kl = band / B.band, ka = Math.min(kl, (1 - BEAST_MARGIN) / B.len);
    return { B: B, kl: kl, ka: ka, stop: -0.5 + (-B.f0 + 3) * ka };
  }
  function beastReady(kind) {
    var s = kind === 'tail' ? ['beast.tail'] : ['beast.headShut'];
    return s.every(function (x) { return images[x] && !beastBad[x]; });
  }
  // draw a painted beast into a tile box; false when it can't (the drawn beast is used instead).
  // o.q: the tile's settled quarter turn on screen (the board's frame enters from the top); without it,
  // o.angle gives the entry direction as for the drawn beast. o.fill: the strand's pigment record,
  // o.amt: how much of it has flooded in (or is left as it drains); o.flat: a flat colour (the rule card)
  function paintedBeast(ctx, kind, x, y, w, h, t, o) {
    if (!beastReady(kind)) return false;
    var slot = kind === 'tail' ? 'beast.tail' : (o.snap > 0.06 && o.snap < 0.85 && images['beast.headOpen'] && !beastBad['beast.headOpen'] ? 'beast.headOpen' : 'beast.headShut');
    var B = BEAST[slot], S = Math.min(w, h), gilt = !!o.gilt;
    var Gm = beastGeom(kind, gilt ? BEAST_BAND : (o.band || 0.33)), dev = devScale(ctx);
    var kc = Gm.kl * S * dev;
    var rim = null;
    if (gilt) {
      var E = Math.max(1, S * 0.042), HL = Math.max(0.7, S * 0.012), bandGap = (0.36 - BEAST_BAND) / 2 * S;
      rim = [(E + HL + bandGap) * dev, (E + bandGap) * dev, (E * 0.45 + bandGap) * dev].map(function (v) { return Math.round(v * 4) / 4; });
    }
    var ramp = o.fill || o.flat ? beastRamp(o) : null, bare = beastRamp({}), amt = o.fill ? (o.amt == null ? 1 : o.amt) : o.flat ? 1 : 0;
    var q = o.q;
    if (q == null) q = ((Math.round((o.angle || 0) / (Math.PI / 2)) % 4) + 4) % 4;
    var c0 = amt < 1 ? beastCanvas(slot, bare, kc, rim) : null, c1 = ramp && amt > 0 ? beastCanvas(slot, ramp, kc, rim, q) : null;
    if (!c0 && !c1) { if (!prepBeast(slot)) return false; }
    if (!c1 && gilt && !o.mini) { warmBeast(slot, q); if (kind !== 'tail') warmBeast('beast.headOpen', q); }
    var mir = q === 3 || q === 0;
    ctx.translate(x + w / 2, y + h / 2);
    if (o.q == null) ctx.rotate(o.angle || 0);
    ctx.translate(0, -S / 2);
    var Tn = ctx.getTransform ? ctx.getTransform() : null;
    var still = !!(Tn && c1 && c1.mask && !o.mini && S >= 24 && !(kind === 'tail' && o.wag) &&
      ((Math.abs(Tn.b) < 1e-6 && Math.abs(Tn.c) < 1e-6) || (Math.abs(Tn.a) < 1e-6 && Math.abs(Tn.d) < 1e-6)));
    if (kind === 'tail' && o.wag) {   // a flick about where the art takes over from the ribbon
      var wy = (Gm.stop + 0.5) * S;
      ctx.translate(0, wy); ctx.rotate(Math.sin(o.wag * Math.PI * 3) * (1 - o.wag) * 0.08); ctx.translate(0, -wy);
    }
    ctx.rotate(-Math.PI / 2);
    if (mir) ctx.scale(1, -1);
    ctx.scale(Gm.ka * S, Gm.kl * S); ctx.rotate(B.phi); ctx.translate(-B.a[0], -B.a[1]);
    [c0, c1].forEach(function (c, i) {
      if (!c) return;
      ctx.globalAlpha = i === 1 && c0 ? amt : 1;
      ctx.drawImage(c.cv, -c.pad / c.kc, -c.pad / c.kc, c.cv.width / c.kc, c.cv.height / c.kc);
      if (i === 1 && still && !ramp.gilt) {   // the strand's mottle, pinned to the page, runs on over the beast
        var Mc = ctx.getTransform().translate(-c.pad / c.kc, -c.pad / c.kc).scale(1 / c.kc), mot = beastMottle(c, Mc, dev);
        if (mot) {
          ctx.globalAlpha = Math.min(1, 0.75 * (ramp.mo || 1)) * (c0 ? amt : 1);
          ctx.drawImage(mot, -c.pad / c.kc, -c.pad / c.kc, c.cv.width / c.kc, c.cv.height / c.kc);
        }
      }
    });
    ctx.globalAlpha = 1;
    if (kind !== 'tail' && o.blink > 0.6 && B.eye) {   // the lid drops over the eye
      var lr = amt >= 0.5 && ramp ? ramp : bare, ex = B.eye[0], ey = B.eye[1], er = B.eye[2] + 1.5;
      ctx.fillStyle = lr.paint ? mix(lr.bd, lr.sh, 0.1) : beastAt(lr, 0.62); ctx.strokeStyle = lr.paint ? mix(lr.sh, HAIR, 0.3) : INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(ex - er * 0.95, ey + 1); ctx.quadraticCurveTo(ex, ey + er * 0.6, ex + er * 0.95, ey + 1); ctx.stroke();
    }
    return true;
  }

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
  // a painted sheet (page, cover.flyleaf) laid over a box like CSS background-size: cover. The PNG's ragged
  // painted edge is cut away by `inset` (fraction of each side, manifest "inset", default 0.045), so the box
  // is filled edge to edge. A portrait sheet in a landscape box is turned a quarter so less is cropped.
  // `variant` (an integer, e.g. the page or face number) flips the sheet and shifts the crop so the same
  // stains and the stitched repair don't sit in the same place on every leaf.
  function drawSheet(g, slot, x, y, w, h, variant) {
    var img = images[slot]; if (!img) return false;
    var m = metas[slot] || {}, ins = m.inset != null ? m.inset : 0.045, v = (variant | 0) & 0xffff;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var sx = iw * ins, sy = ih * ins, sw = iw - 2 * sx, sh = ih - 2 * sy;
    var turn = (sw < sh) !== (w < h) && Math.abs(w / h - 1) > 0.12;
    var bw = turn ? h : w, bh = turn ? w : h;   // the box in the sheet's own frame
    var k = Math.max(bw / sw, bh / sh), cw = bw / k, ch = bh / k;
    var R = rand(977 + v * 131), fx = (v & 1) ? -1 : 1, fy = (v & 2) ? -1 : 1;
    sx += (sw - cw) * (cw < sw ? R() : 0.5); sy += (sh - ch) * (ch < sh ? R() : 0.5);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    if (turn) g.rotate(Math.PI / 2);
    g.scale(fx, fy);
    g.drawImage(img, sx, sy, cw, ch, -bw / 2, -bh / 2, bw, bh);
    g.restore();
    return true;
  }
  function makePage(w, h, scale, margin, variant) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
    var g = cv.getContext('2d');
    g.scale(scale, scale);
    var R = rand(1234);
    if (drawSheet(g, 'page', 0, 0, w, h, variant)) {   // the painted vellum, then only the ruling below
      // warmed to the drawn leaf's tone: a multiply wash whose stops are PAGE_WASH over the
      // painted sheet's mean colour (so its stains and fibres stay, but its average and falloff match), then
      // the same darker edges
      var pm = pageMean(), wash = g.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      PAGE_WASH.forEach(function (s) {
        wash.addColorStop(s[0], 'rgb(' + s[1].map(function (c, i) { return Math.min(255, Math.round(255 * c / pm[i])); }).join(',') + ')');
      });
      g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = wash; g.fillRect(0, 0, w, h); g.restore();
      pageEdges(g, w, h);
      return rulePage(g, cv, w, h, margin, R);
    }
    var grd = g.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    PAGE_STOPS.forEach(function (s) { grd.addColorStop(s[0], 'rgb(' + s[1].join(',') + ')'); });
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
    pageEdges(g, w, h);
    return rulePage(g, cv, w, h, margin, R);
  }
  // the drawn leaf's gradient (#f1e3c1, #e8d3a6, #cfae76), which the painted sheet is warmed to match
  var PAGE_STOPS = [[0, [241, 227, 193]], [0.6, [232, 211, 166]], [1, [207, 174, 118]]], pageMeanC = null;
  // what the painted sheet's mean is pulled to: the drawn leaf's stops darkened as its own mottle, fibres and
  // speckles darken them (measured in the browser: drawn leaf centre 224,210,177, mid 222,204,166)
  var PAGE_WASH = [[0, [223, 207, 171]], [0.6, [218, 198, 154]], [1, [205, 172, 118]]];
  // the painted sheet's mean colour, measured once from a small copy of its cropped area
  function pageMean() {
    if (pageMeanC && pageMeanC.img === images.page) return pageMeanC.rgb;
    var rgb = [240, 227, 202];   // measured from vellum-leaf.png, in case the canvas can't be read
    try {
      var c = document.createElement('canvas'); c.width = c.height = 32;
      drawSheet(c.getContext('2d'), 'page', 0, 0, 32, 32, 0);
      var d = c.getContext('2d').getImageData(0, 0, 32, 32).data, s = [0, 0, 0];
      for (var i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      rgb = s.map(function (a) { return Math.max(1, a / (d.length / 4)); });
    } catch (err) { /* keep the measured fallback */ }
    pageMeanC = { img: images.page, rgb: rgb };
    return rgb;
  }
  // darker edges
  function pageEdges(g, w, h) {
    var e = Math.min(w, h) * 0.09;
    [['left', 0, 0, e, 0], ['right', w, 0, w - e, 0], ['top', 0, 0, 0, e], ['bottom', 0, h, 0, h - e]].forEach(function (s) {
      var lg = g.createLinearGradient(s[1], s[2], s[3], s[4]);
      lg.addColorStop(0, 'rgba(110,70,25,0.32)'); lg.addColorStop(1, 'rgba(110,70,25,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    });
  }
  // margins, ruling and pricking (over the drawn or the painted vellum)
  function rulePage(g, cv, w, h, margin, R) {
    var y;
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

  /* ---------- the panel: mask outline geometry, the page's ground with gold filigree, gilded frame, ivy ---------- */
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
  // fine gold rule on the ground, inner gold rule, coloured band with cream dots, broad outer gold rule;
  // dark-brown hairlines outside each gold rule
  function drawFrame(ctx, G, b, box, GR) {
    var hl = Math.max(0.6, b * 0.04), gold = burnish(ctx, box[0], box[1], box[2], box[3]);
    GR = GR || GROUND.madder;
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    // the band, in the ground's own brighter tone
    ctx.strokeStyle = GR.band; ctx.lineWidth = b * 0.56; ctx.stroke(G.path(b * 0.44));
    ctx.strokeStyle = 'rgba(' + GR.deep + ',0.4)'; ctx.lineWidth = Math.max(0.6, b * 0.05); ctx.stroke(G.path(b * 0.2)); ctx.stroke(G.path(b * 0.69));
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
      ctx.fillStyle = 'rgba(' + GR.deep + ',0.45)'; ctx.beginPath(); ctx.arc(p[0] + dr * 0.25, p[1] + dr * 0.3, dr, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#f6e6bd'; ctx.beginPath(); ctx.arc(p[0], p[1], dr, 0, 6.283); ctx.fill();
    });
  }
  // the whole puzzle panel, drawn once to an offscreen canvas (the board caches it per size and DPR):
  // ivy at the outer corners, the page's ground with gold filigree over the masked cells, the gilded
  // frame tracing the mask outline. o: w, h, inm (mask flags), S (tile), pad (mask origin), band (frame
  // thickness), ivy (margin for the tendrils), cssW, cssH, dpr, round (corner radius), rect, seed,
  // ground (a GROUND name; madder if absent)
  function makePanel(o) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(o.cssW * o.dpr)); cv.height = Math.max(1, Math.round(o.cssH * o.dpr));
    var g = cv.getContext('2d');
    g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    var b = o.band, S = o.S, G = frameGeom(o.w, o.h, o.inm, S, o.pad, o.pad, o.round || 0), R = rand(o.seed || 7);
    var box = [o.pad - b, o.pad - b, o.w * S + 2 * b, o.h * S + 2 * b];
    // the drawn ivy round the frame is the fallback: with the painted ivy loaded it grows on the page's vellum instead
    if (o.ivy > 3 && !images['ivy.corner.1']) G.corners(b).forEach(function (c) { ivyCorner(g, c, o.ivy, R); });
    var gp = G.path(b * 0.3), GR = GROUND[o.ground] || GROUND.madder;
    g.fillStyle = GR.base; g.fill(gp);
    g.save(); g.clip(gp);
    // a painted mottle in the ground
    var nb = Math.round(o.w * o.h * 1.5);
    for (var i = 0; i < nb; i++) {
      var x = box[0] + R() * box[2], y = box[1] + R() * box[3], r = S * (0.4 + R() * 1.1), dk = R() < 0.5;
      var m = g.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, dk ? 'rgba(' + GR.dk + ',0.3)' : 'rgba(' + GR.lt + ',0.22)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    filigree(g, box[0], box[1], box[2], box[3], S, R, Math.max(0.55, Math.min(1.3, S * 0.016)));
    // a soft shadow under the frame's inner edge
    g.strokeStyle = 'rgba(' + GR.deep + ',0.45)'; g.lineWidth = b * 0.6; g.stroke(G.path(b * 0.1));
    g.restore();
    if (images.border && o.rect) paintBorder(g, box, b);
    else drawFrame(g, G, b, box, GR);
    return { cv: cv, geom: G };
  }

  /* ---------- enamel ribbons on the board ---------- */
  // one ribbon path in layers: dark hairline, gold edge, gouache body (darker edge, mid, centre) and a
  // faint lighter stripe. rib: {base, edge, light}; edges: draw the gold; dash: dash array for the body
  function ribLayers(ctx, path, w, S, rib, edges, dash, stripe, fx) {
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
    if (!rib) return;   // edges only (a painted body is drawn over them in full)
    if (rib.sh) { paintBody(ctx, path, w, S, rib, dash, fx || {}); if (dash) ctx.setLineDash([]); return; }
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
    var o = { base: mix(a.base, b.base, t), edge: mix(a.edge, b.edge, t), light: mix(a.light, b.light, t), dark: mix(a.dark, b.dark, t) };
    if (a.sh || b.sh) {   // a painted strand draining to bare (or back): the modelling fades with the colour
      var A = a.sh ? a : { sh: a.edge, bd: a.base, lt: a.base, rich: 0 }, Bb = b.sh ? b : { sh: b.edge, bd: b.base, lt: b.base, rich: 0 };
      o.sh = mix(A.sh, Bb.sh, t); o.bd = mix(A.bd, Bb.bd, t); o.lt = mix(A.lt, Bb.lt, t);
      o.rich = (A.rich == null ? 1 : A.rich) * (1 - t) + (Bb.rich == null ? 1 : Bb.rich) * t;
    }
    return o;
  }

  /* ---------- painted strands: matte tempera, mottle, lead-white penwork ---------- */
  // the colour across a painted ribbon at x (0 = its shadowed edge, 0.5 = the body, 1 = its lit edge)
  function rampAt(rib, x) {
    if (x < 0.5) { var s = x / 0.5; return mix(rib.sh, rib.bd, s * s * (3 - 2 * s)); }
    return mix(rib.bd, rib.lt, Math.pow((x - 0.5) / 0.5, 1.4) * 0.7);
  }
  // the same, held close to the body colour: the painted beasts keep their own shading but read as matte paint
  function beastAt(rib, x) {
    if (x < 0.5) { var s = x / 0.5; return mix(rib.sh, rib.bd, 0.3 + 0.7 * s * s * (3 - 2 * s)); }
    return mix(rib.bd, rib.lt, 0.5 * Math.pow((x - 0.5) / 0.5, 1.4));
  }
  // hand-laid paint: broad soft blotches where it lies thicker or thinner, and a faint fine tooth;
  // drawn once and used as a pattern
  var grainCv = null, grainPats = typeof WeakMap === 'function' ? new WeakMap() : null;
  function grainCanvas() {
    if (grainCv) return grainCv;
    var N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    var g = cv.getContext('2d'), id = g.createImageData(N, N), d = id.data, R = rand(9137);
    function grid(n) { var a = []; for (var i = 0; i < n * n; i++) a.push(R() * 2 - 1); return a; }
    function smp(a, n, x, y) {   // tileable bilinear value noise
      var fx = x * n / N, fy = y * n / N, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      function v(i, j) { return a[((j % n + n) % n) * n + ((i % n + n) % n)]; }
      return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
    }
    var A = grid(5), Bn = grid(11), Cn = grid(40);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var v = smp(A, 5, x, y) * 0.62 + smp(Bn, 11, x, y) * 0.28 + smp(Cn, 40, x, y) * 0.07 + (R() - 0.5) * 0.09, i = (y * N + x) * 4;
      if (v > 0) { d[i] = 44; d[i + 1] = 24; d[i + 2] = 8; d[i + 3] = Math.min(255, v * 62); }
      else { d[i] = 252; d[i + 1] = 244; d[i + 2] = 222; d[i + 3] = Math.min(255, -v * 50); }
    }
    g.putImageData(id, 0, 0);
    return (grainCv = cv);
  }
  function grainPattern(ctx) {
    var p = grainPats && grainPats.get(ctx);
    if (!p) { p = ctx.createPattern(grainCanvas(), 'repeat'); if (grainPats) grainPats.set(ctx, p); }
    return p;
  }
  // fx: ang (the tile's turn, so the light stays at the top-left of the page), cell / piece (fix where the
  // penwork breaks), mini (a thumbnail: modelling only), len (the path's length),
  // ext (path(ctx, ext) runs its ends this much further, so strokes moved toward the light leave no gaps)
  var PEN = 'line';   // lead-white penwork: 'line' or 'dots'
  var SHADE = 0.3, TINT = 0.13;   // the shadow and the tint, in ribbons, where the light falls square across
  // gilt as a miniature painter lays it: nested hard-edged bands, each a flat colour, the lighter ones narrower
  // and pushed toward the light, so the shadowed edge runs dark umber and red-brown and the lit side carries a
  // narrow pale-cream line beside a dark rim; no gradients (a soft ramp only reads as better ochre). Widths are
  // fractions of the ribbon with floors in pixels, so on a phone the line stays a line and the umber edge stays
  // visible. Where the strand has its own centre (a piece's middle, so its crossing tile's over-pass) a pinpoint
  // near-white glint sits on the line, on about half the pieces, fixed per piece
  // the gilt's nested strokes, shared by the ribbon (gildBody) and its beasts (beastModel): [value, width, shift
  // toward the light], widths and shifts as fractions of the ribbon. value: 0..4 the bands (rib.bands), 5 the
  // cream line (rib.hi); the dark line beside it is band 1. eF, hF: the umber rim's and the line's widths
  function giltLayers(eF, hF) {
    var inner = 1 - 2 * eF, hs = Math.min(0.5 - eF - hF * 0.5 - 0.04, 0.3);
    return [[0, 1, 0], [1, inner, 0.02], [2, inner * 0.78, 0.07], [3, inner * 0.56, 0.12], [4, inner * 0.3, 0.2],
      [1, hF + 0.05, hs + 0.03], [5, hF, hs]];
  }
  function gildBody(ctx, path, w, S, rib, dash, fx) {
    var ang = fx.ang || 0, ext = fx.ext || 0, C = rib.bands;
    var vx = -0.7071, vy = -0.7071;
    var ux = vx * Math.cos(ang) + vy * Math.sin(ang), uy = -vx * Math.sin(ang) + vy * Math.cos(ang);
    var tm = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0 }, px = 1 / Math.max(1, Math.hypot(tm.a, tm.b));   // one device pixel, in path units
    var edgeW = Math.max(1.4 * px, w * 0.1);   // the umber rim on each side never thinner than about a device pixel and a half
    var hiW = Math.max(1.6 * px, w * 0.085);   // the highlight line: at least a pixel and a half wide
    var GL = giltLayers(edgeW / w, hiW / w), L = GL.slice(0, 5).map(function (q) { return [C[q[0]], q[1], q[2]]; });
    var inner = 1 - 2 * edgeW / w;
    if (fx.mini) L = [[C[0], 1, 0], [C[2], inner, 0.03], [C[4], inner * 0.4, 0.15]];
    ctx.lineCap = 'butt';
    function band(col, wid, sh) {
      ctx.strokeStyle = col; ctx.lineWidth = wid;
      if (sh) { ctx.save(); ctx.translate(ux * sh * w, uy * sh * w); if (dash) ctx.lineDashOffset = -ext; }
      ctx.beginPath(); if (sh) path(ctx, ext); else path(ctx); ctx.stroke();
      if (sh) ctx.restore();
    }
    for (var k = 0; k < L.length; k++) band(L[k][0], w * L[k][1], L[k][2]);
    // the burnished line: a sharp pale-cream stroke on the lit side of the warm gold, a dark line beside it
    // on its outer side (the umber shows between it and the lit rim), so it reads as a reflection, not paint
    var hs = GL[6][2];
    band(C[1], hiW + 2 * Math.max(0.6 * px, w * 0.025), hs + 0.03);
    band(rib.hi, hiW, hs);
    if (dash) ctx.lineDashOffset = 0;
    // the glint
    var Lp = fx.len || 0;
    if (fx.mini || dash || !Lp) return;
    var h = ((fx.cell || 0) * 7 + (fx.piece || 0) * 3 + 1) * 2654435761 % 4294967296;
    if (h % 2) return;
    var T = Lp + 2 * ext, r = Math.max(1.3 * px, w * 0.08);
    ctx.save(); ctx.translate(ux * hs * w, uy * hs * w);
    ctx.lineCap = 'round'; ctx.setLineDash([0.01, T * 3]); ctx.lineDashOffset = -T / 2;
    ctx.strokeStyle = 'rgba(255,250,232,0.55)'; ctx.lineWidth = r * 3.2; ctx.beginPath(); path(ctx, ext); ctx.stroke();
    ctx.strokeStyle = '#fffdf4'; ctx.lineWidth = r * 1.6; ctx.beginPath(); path(ctx, ext); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.restore();
  }
  function paintBody(ctx, path, w, S, rib, dash, fx) {
    if (rib.nmm) { gildBody(ctx, path, w, S, rib, dash, fx); return; }
    var rich = rib.rich == null ? 1 : rib.rich, ang = fx.ang || 0, ext = fx.ext || 0;
    // the light falls from the top-left of the page whatever the tile's turn: u, in the tile's frame
    var vx = -0.7071, vy = -0.7071;
    var ux = vx * Math.cos(ang) + vy * Math.sin(ang), uy = -vx * Math.sin(ang) + vy * Math.cos(ang);
    var s = SHADE * rich, tt = TINT * rich;
    // each stroke: [colour, width, shift toward the light], in ribbons. nested, so the shadow shows along the
    // far edge, the tint along the lit one, and the body lies flat between
    var L = fx.mini ? [[rib.sh, 1, 0], [rib.bd, 1 - s, s / 2]] : [
      [rib.sh, 1, 0],
      [mix(rib.sh, rib.bd, 0.4), 1 - 0.45 * s, 0.225 * s],
      [mix(rib.sh, rib.bd, 0.75), 1 - 0.78 * s, 0.39 * s],
      [rib.lt, 1 - s, s / 2],
      [mix(rib.bd, rib.lt, 0.6), 1 - s - 0.45 * tt, (s - 0.45 * tt) / 2],
      [mix(rib.bd, rib.lt, 0.28), 1 - s - 0.75 * tt, (s - 0.75 * tt) / 2],
      [rib.bd, 1 - s - tt, (s - tt) / 2]
    ];
    ctx.lineCap = 'butt';
    for (var k = 0; k < L.length; k++) {
      var q = L[k];
      ctx.strokeStyle = q[0]; ctx.lineWidth = w * q[1];
      if (q[2]) { ctx.save(); ctx.translate(ux * q[2] * w, uy * q[2] * w); if (dash) ctx.lineDashOffset = -ext; }
      ctx.beginPath(); if (q[2]) path(ctx, ext); else path(ctx); ctx.stroke();
      if (q[2]) ctx.restore();
    }
    if (dash) ctx.lineDashOffset = 0;
    if (fx.mini || rich <= 0.02) return;
    // the mottle of hand-laid paint, pinned to the page (not the tile) so it runs on across tile joins
    var pat = grainPattern(ctx);
    if (pat) {
      if (pat.setTransform && ctx.getTransform) {
        try { var tm = ctx.getTransform(); pat.setTransform(tm.inverse().scale(Math.hypot(tm.a, tm.b))); } catch (e) {}
      }
      ctx.globalAlpha = Math.min(1, 0.75 * rich * (rib.mo || 1)); ctx.strokeStyle = pat; ctx.lineWidth = w * 0.97;
      ctx.beginPath(); path(ctx); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (fx.pen === false) return;
    // lead-white penwork, a touch warm: a fine line on the lit side of the body that swells and thins, and
    // here and there the pen lifts (fixed per piece, so it never flickers)
    var po = 0.2 * w;
    ctx.save(); ctx.translate(ux * po, uy * po); ctx.strokeStyle = '#fbf1da'; ctx.lineCap = 'round';
    var pw = Math.max(0.7, S * 0.012), Lp = fx.len || 0;
    if (PEN === 'dots') {
      if (Lp > 0 && !dash) {
        var st = Lp / Math.max(1, Math.round(Lp / Math.max(4, S * 0.17)));
        ctx.setLineDash([0.01, st - 0.01]); ctx.lineDashOffset = -(ext + st / 2);
        ctx.globalAlpha = 0.8 * rich; ctx.lineWidth = Math.max(1.1, S * 0.036);
        ctx.beginPath(); path(ctx, ext); ctx.stroke();
      }
    } else if (dash || !Lp) {   // still flooding: one plain line under the flood's dash
      ctx.lineCap = 'butt'; ctx.globalAlpha = 0.55 * rich; ctx.lineWidth = pw;
      ctx.lineDashOffset = -ext; ctx.beginPath(); path(ctx, ext); ctx.stroke();
    } else {
      var R = rand(((fx.cell || 0) * 7 + (fx.piece || 0) * 3 + 1) * 2654435761), T = Lp + 2 * ext;
      // where the pen lifts: mostly nowhere, now and then one short gap
      var ds = [], gaps = R() < 0.7 ? 0 : 1;
      if (gaps) ds.push(T * (0.25 + 0.5 * R()), Math.max(1.2, w * (0.05 + 0.07 * R())));
      ds.push(T * 3, T);
      ctx.setLineDash(ds); ctx.lineDashOffset = 0;
      ctx.globalAlpha = 0.5 * rich; ctx.lineWidth = pw;
      ctx.beginPath(); path(ctx, ext); ctx.stroke();
      // where it was pressed harder: a fuller, softer stroke over part of the line
      var a0 = T * (0.1 + 0.4 * R()), a1 = T * (0.2 + 0.3 * R());
      ctx.setLineDash([0, a0, a1, T * 3]); ctx.lineDashOffset = 0;
      ctx.globalAlpha = 0.22 * rich; ctx.lineWidth = pw * 1.7;
      ctx.beginPath(); path(ctx, ext); ctx.stroke();
    }
    ctx.restore();
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
      var sc = o.scale || 1, key = [Math.round(w), Math.round(h), sc, o.margin, o.variant | 0, !!images.page].join('x');
      if (!cache.page || cache.pageKey !== key) { cache.page = makePage(Math.round(w), Math.round(h), sc, o.margin, o.variant); cache.pageKey = key; }
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
      if (images.knot) {
        // the painted knot, tinted to the strand: the band comes in from the top and gathers into the knot
        var KU = Math.min(w, h), kw = KU * KNOT.w, kh = KU * (KNOT.y1 - KNOT.y0);
        ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0);
        var dpr = Math.min(3, window.devicePixelRatio || 1);
        ctx.drawImage(knotCanvas(kw * dpr, kh * dpr, o.body || PIG.bare.base), -kw / 2, KU * KNOT.y0, kw, kh);
        return;
      }
      if (o.rib) {
        // board terminal (box = the tile): the ribbon (width opts.rw x tile) arrives from the top edge to
        // the centre and ends in a gold-edged roundel holding a gold spiral
        var U = Math.min(w, h), rib = o.rib, a = U * (o.rw || 0.36) / 2, E = Math.max(1, U * 0.034), HL = Math.max(0.7, U * 0.014);
        ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0);
        var ky = U * 0.13, KR = U * 0.25;
        ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(0, ky, KR + E + HL, 0, 6.283); ctx.fill();
        ctx.fillStyle = GILT; ctx.beginPath(); ctx.arc(0, ky, KR + E, 0, 6.283); ctx.fill();
        var rg = ctx.createRadialGradient(-KR * 0.25, ky - KR * 0.25, KR * 0.1, 0, ky, KR);
        if (rib.sh) { rg.addColorStop(0, mix(rib.bd, rib.lt, 0.28)); rg.addColorStop(0.38, rib.bd); rg.addColorStop(0.8, rib.bd); rg.addColorStop(1, mix(rib.bd, rib.sh, 0.75)); }
        else { rg.addColorStop(0, rib.base); rg.addColorStop(0.65, rib.base); rg.addColorStop(1, rib.edge); }
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, ky, KR, 0, 6.283); ctx.fill();
        // the stem runs on into the roundel without a seam
        ribLayers(ctx, function (g) { g.moveTo(0, -U * 0.22); g.lineTo(0, ky - KR * 0.55); }, 2 * a, U, rib, false, null, 0, { pen: false, mini: o.mini, ang: o.ang });
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
      if (paintedBeast(ctx, 'head', x, y, w, h, t, o)) return;
      // Insular zoomorphic head in profile. The box is the tile: the neck ribbon arrives from the
      // top edge to the box centre and the head lies in the lower half, snout pointing +y.
      // opts: body (colour), snap 0..1 (jaw snaps shut and open), blink 0..1, angle
      // opts.gilt: board style, gold edges with a dark-brown hairline instead of ink, head widened to the
      // broad ribbon
      var U = Math.min(w, h), snap = o.snap || 0, blink = o.blink || 0, body = o.body || PIG.bare.base, gilt = !!o.gilt;
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.angle || 0); ctx.scale(U, U);
      if (gilt) ctx.scale(1.28, 1);
      var skin = body, pt = o.paint;
      if (pt && pt.sh) {   // modelled like its strand: pale on the brow, deep at the jaw's edges
        skin = ctx.createRadialGradient(0.03, 0.06, 0.02, 0.04, 0.16, 0.36);
        skin.addColorStop(0, mix(pt.bd, pt.lt, 0.55)); skin.addColorStop(0.42, pt.bd); skin.addColorStop(1, pt.sh);
      }
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
      ctx.fillStyle = pt && pt.sh ? mix(pt.sh, pt.bd, 0.45) : body;
      ctx.beginPath(); ctx.moveTo(-0.07, -0.04); ctx.bezierCurveTo(-0.08, 0.1, -0.02, 0.2, 0.05, 0.27);
      ctx.quadraticCurveTo(0.07, 0.2, 0.04, 0.06); ctx.closePath(); edge();
      ctx.fillStyle = '#fffbe8';
      for (var ti = 0; ti < 3; ti++) { var ty = 0.08 + ti * 0.055; ctx.beginPath(); ctx.moveTo(0.04 - ti * 0.004, ty); ctx.lineTo(0.08, ty + 0.012); ctx.lineTo(0.042, ty + 0.03); ctx.fill(); }
      ctx.restore();
      // skull and long upper jaw
      ctx.fillStyle = skin;
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
      if (paintedBeast(ctx, 'tail', x, y, w, h, t, o)) return;
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
      var pt = o.paint && o.paint.sh ? o.paint : null;
      // painted: the body in three tones, deep edges to a pale centre, like the strand it ends
      var tones = pt ? [[pt.sh, 1], [mix(pt.sh, pt.bd, 0.6), 0.82], [pt.bd, 0.6], [mix(pt.bd, pt.lt, 0.5), 0.26]] : [[body, 1]];
      for (var pass = gilt ? -1 : 0; pass < 1 + tones.length; pass++) {
        var tone = pass > 0 ? tones[pass - 1] : null;
        ctx.strokeStyle = tone ? tone[0] : gilt ? (pass < 0 ? HAIR : GILT) : INK;
        for (i = 1; i < L; i++) {
          ctx.lineWidth = tone ? widthAt(i) * tone[1] : widthAt(i) + (gilt ? (pass < 0 ? 2 * (GE + GH) : 2 * GE) : 2 * Math.max(lw, widthAt(i) * 0.15));
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
      ctx.fillStyle = pt ? pt.bd : body; ctx.strokeStyle = gilt ? GILT : INK; ctx.lineWidth = gilt ? 2 * GE : lw;
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
      // four short brackets; the group's emblem sits just inside the top-left one
      var L = w * 0.17, i = w * 0.05, glow = o.glow || 0, lit = o.lit || 0;
      if (images.twinFrame) {
        // the painted brackets: a 2x2 sheet, one bracket pushed into each cell's outer corner
        var im = images.twinFrame, cs = im.naturalWidth / 2, bs = w * 0.27, ins = w * 0.025;
        var put = function () {
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (q) {
            ctx.drawImage(im, q[0] * cs, q[1] * cs, cs, cs, q[0] ? x + w - ins - bs : x + ins, q[1] ? y + h - ins - bs : y + ins, bs, bs);
          });
        };
        put();
        var shine = Math.max(glow, lit * 0.35);
        if (shine > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.55 * shine; put(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      } else {
      ctx.lineCap = 'square';
      [[x + i, y + i, 1, 1], [x + w - i, y + i, -1, 1], [x + i, y + h - i, 1, -1], [x + w - i, y + h - i, -1, -1]].forEach(function (c) {
        for (var pass = 0; pass < 2; pass++) {
          // o.dark (the board's madder ground): a brown hairline under a brighter, broader gold
          ctx.strokeStyle = pass ? mix(o.dark ? '#f2d27a' : '#d9b04a', '#fff1b8', Math.max(glow, lit * 0.5)) : (o.dark ? HAIR : 'rgba(94,63,14,0.8)');
          ctx.lineWidth = o.dark ? Math.max(pass ? 1.4 : 2.6, w * (pass ? 0.04 : 0.07)) : Math.max(pass ? 1 : 1.8, w * (pass ? 0.028 : 0.05));
          ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke();
        }
      });
      }
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
      if (images.twinEmblem) {
        // the painted signs: one 1:1 cell each in a row, star, quatrefoil, trefoil, cross (kinds 0..3)
        var em = images.twinEmblem, es = em.naturalHeight, er = r * 1.1;
        ctx.drawImage(em, k * es, 0, es, es, -er, -er, 2 * er, 2 * er);
        if (glow > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.6 * glow; ctx.drawImage(em, k * es, 0, es, es, -er, -er, 2 * er, 2 * er); }
        return;
      }
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

  /* ---------- painted ivy on the page's vellum: ivy.corner.1-6, ivy.run.1-4, ivy.sprig.1-16 ----------
     All the pieces share one scale (the cut keeps the sheets' proportions), so one k sizes them alike. */
  var IVY_N = { corner: 6, run: 4, sprig: 16 }, ivyOcc = {};
  function ivyList(kind) {
    var out = [];
    for (var i = 1; i <= IVY_N[kind]; i++) if (images['ivy.' + kind + '.' + i]) out.push('ivy.' + kind + '.' + i);
    return out;
  }
  // where a piece is painted: grid points (image px) whose cell holds paint; the whole box when unreadable
  function ivyPoints(slot) {
    if (ivyOcc[slot]) return ivyOcc[slot];
    var img = images[slot], iw = img.naturalWidth, ih = img.naturalHeight, st = Math.max(4, Math.min(iw, ih, 360) / 16), pts = [], i, j;
    try {
      var cw = Math.ceil(iw / st), chh = Math.ceil(ih / st), cv = document.createElement('canvas');
      cv.width = cw; cv.height = chh;
      var g = cv.getContext('2d'); g.drawImage(img, 0, 0, cw, chh);
      var d = g.getImageData(0, 0, cw, chh).data;
      for (j = 0; j < chh; j++) for (i = 0; i < cw; i++) if (d[(j * cw + i) * 4 + 3] > 24) pts.push([(i + 0.5) * iw / cw, (j + 0.5) * ih / chh]);
    } catch (e) { pts = []; for (j = 0; j <= 10; j++) for (i = 0; i <= 10; i++) pts.push([iw * i / 10, ih * j / 10]); }
    return (ivyOcc[slot] = { pts: pts, st: st });
  }
  // lays the painted ivy for one page into ctx (the cached page background): a spray in each corner that has
  // room, a run along some sides, a few loose sprigs near the edges. avoid: [x, y, w, h] boxes kept clear
  // (board, text, drollery, buttons). The same seed and layout always give the same ivy. False when not loaded.
  // opt.narrow (the portrait layout): ivyNarrow's packing instead. A box's fifth entry is the board's frame width:
  // on a narrow page the ivy may tuck a little under that frame, as ivy behind a frame would
  function ivyPage(ctx, W, H, seed, avoid, opt) {
    var C = ivyList('corner'), RU = ivyList('run'), SP = ivyList('sprig');
    if (!C.length) return false;
    var narrow = !!(opt && opt.narrow);
    var R = rand(seed), U = 5, gw = Math.ceil(W / U), gh = Math.ceil(H / U), occ = new Uint8Array(gw * gh);
    function mark(x0, y0, x1, y1) {
      var j1 = Math.min(gh - 1, Math.floor(y1 / U)), i1 = Math.min(gw - 1, Math.floor(x1 / U));
      for (var j = Math.max(0, Math.floor(y0 / U)); j <= j1; j++) for (var i = Math.max(0, Math.floor(x0 / U)); i <= i1; i++) occ[j * gw + i] = 1;
    }
    (avoid || []).forEach(function (r) {
      var p = narrow ? (r[4] ? -r[4] * 0.4 : 5) : 10;
      mark(r[0] - p, r[1] - p, r[0] + r[2] + p, r[1] + r[3] + p);
    });
    // a corner spray is about 30% of the page's short side across (110-250 px); the cut sprays are ~400 px
    var unit = Math.min(W, H), k0 = Math.max(110, Math.min(250, unit * 0.3)) / 400, m = Math.max(3, unit * 0.01);
    function place(slot, cx, cy, k, fx, fy, rot, halo) {   // halo: extra clearance (px) round each point
      var img = images[slot], O = ivyPoints(slot), iw = img.naturalWidth, ih = img.naturalHeight;
      var c = Math.cos(rot), s = Math.sin(rot), P = [], n, x, y;
      for (n = 0; n < O.pts.length; n++) {
        var u = (O.pts[n][0] - iw / 2) * k * fx, v = (O.pts[n][1] - ih / 2) * k * fy;
        x = cx + u * c - v * s; y = cy + u * s + v * c;
        if (x < 1 || y < 1 || x > W - 1 || y > H - 1 || occ[Math.floor(y / U) * gw + Math.floor(x / U)]) return false;
        if (halo && [[halo, 0], [-halo, 0], [0, halo], [0, -halo]].some(function (o) {
          var hx = x + o[0], hy = y + o[1];
          return hx >= 0 && hy >= 0 && hx < W && hy < H && occ[Math.floor(hy / U) * gw + Math.floor(hx / U)];
        })) return false;
        P.push(x, y);
      }
      var r = O.st * k * 0.6 + 2;
      for (n = 0; n < P.length; n += 2) mark(P[n] - r, P[n + 1] - r, P[n] + r, P[n + 1] + r);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(k * fx, k * fy);
      ctx.drawImage(img, -iw / 2, -ih / 2); ctx.restore();
      return true;
    }
    function pick(list, used) {
      var free = list.filter(function (sl) { return !used[sl]; });
      return (free.length ? free : list)[Math.floor(R() * (free.length || list.length))];
    }
    if (narrow) return ivyNarrow();
    // corners TL, TR, BR, BL: mirrored (never turned) so the knot sits in the corner and the arms run along the
    // edges; the songbird (spray 6) only perches in a top corner, where it stays upright
    var used = {};
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      var list = q[1] > 0 ? C : C.filter(function (sl) { return sl !== 'ivy.corner.6'; });
      var sl = pick(list, used), img = images[sl], kj = 0.9 + R() * 0.2;
      [1, 0.86, 0.74, 0.62].some(function (t) {
        var k = k0 * kj * t, w = img.naturalWidth * k, h = img.naturalHeight * k;
        var ok = place(sl, q[0] > 0 ? m + w / 2 : W - m - w / 2, q[1] > 0 ? m + h / 2 : H - m - h / 2, k, q[0], q[1], 0);
        if (ok) used[sl] = 1;
        return ok;
      });
    });
    // runs along some sides, upright on the top and bottom, a quarter turn on the left and right
    var sides = [[0, 0], [1, Math.PI / 2], [2, 0], [3, -Math.PI / 2]], runUsed = {};
    sides.forEach(function (sd) {
      if (!RU.length || R() > 0.6) return;
      var horiz = sd[0] % 2 === 0, span = horiz ? W : H, fx = R() < 0.5 ? 1 : -1, sl0 = pick(RU, runUsed);
      var order = [sl0].concat(RU.filter(function (sl) { return sl !== sl0; }).sort(function (a, b) { return images[a].naturalWidth - images[b].naturalWidth; }));
      order.some(function (sl) {
        var img = images[sl], k = k0 * (0.85 + R() * 0.15), th = img.naturalHeight * k;
        return [0.5, 0.38, 0.62, 0.28, 0.72].some(function (f) {
          var a = span * f, d = m + th / 2, cx, cy;
          if (sd[0] === 0) { cx = a; cy = d; } else if (sd[0] === 2) { cx = a; cy = H - d; }
          else if (sd[0] === 1) { cx = W - d; cy = a; } else { cx = d; cy = a; }
          if (place(sl, cx, cy, k, fx, 1, sd[1])) { runUsed[sl] = 1; return true; }
          return false;
        });
      });
    });
    // a few loose sprigs in the gaps near the edges, each tilted a little
    var ns = SP.length ? 2 + Math.floor(R() * 4) : 0, spUsed = {};
    for (var s = 0; s < ns; s++) {
      for (var tries = 0; tries < 30; tries++) {
        var sl = pick(SP, spUsed), side = Math.floor(R() * 4), depth = m + R() * unit * 0.16, along = R();
        var cx = side === 1 ? W - depth : side === 3 ? depth : along * W, cy = side === 0 ? depth : side === 2 ? H - depth : along * H;
        if (place(sl, cx, cy, k0 * (0.8 + R() * 0.3), R() < 0.5 ? 1 : -1, 1, (R() - 0.5) * 0.9, 16)) { spUsed[sl] = 1; break; }
      }
    }
    return true;

    // the portrait page: little bare margin, so the pieces come smaller and are packed into what room there is.
    // A spray in each corner, slid down under the toolbar or up beside the buttons; trailing runs climbing both
    // side margins; a run or two lying in the wider gaps; then sprigs, leaves, berries and flowers in the rest
    function ivyNarrow() {
      var kc = Math.max(90, Math.min(200, W * 0.27)) / 400, used = {}, SC = [1, 0.86, 0.74, 0.62, 0.52];
      [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
        var list = q[1] > 0 ? C : C.filter(function (sl) { return sl !== 'ivy.corner.6'; });
        var sl = pick(list, used), img = images[sl], kj = 0.9 + R() * 0.2;
        for (var off = 0; off <= H * 0.3; off += 6) {
          if (SC.some(function (t) {
            var k = kc * kj * t, w = img.naturalWidth * k, h = img.naturalHeight * k;
            return place(sl, q[0] > 0 ? m + w / 2 : W - m - w / 2, q[1] > 0 ? m + off + h / 2 : H - m - off - h / 2, k, q[0], q[1], 0);
          })) { used[sl] = 1; return; }
        }
      });
      // runs up the left and right margins, a quarter turn, as thick as the margin allows
      var kr = Math.max(0.12, Math.min(0.3, W * 0.065 / 140)), runUsed = {};
      function runOrder() {
        var sl0 = pick(RU, runUsed);
        return [sl0].concat(RU.filter(function (sl) { return sl !== sl0; }).sort(function () { return R() - 0.5; }));
      }
      if (RU.length) [[3, -Math.PI / 2], [1, Math.PI / 2]].forEach(function (sd) {
        var y = m + R() * 30, n = 0;
        while (y < H - 40 && n < 4) {
          var fx = R() < 0.5 ? 1 : -1, got = 0;
          runOrder().some(function (sl) {
            var img = images[sl];
            return [1, 0.82, 0.66, 0.52].some(function (t) {
              var k = kr * t, len = img.naturalWidth * k, th = img.naturalHeight * k;
              if (y + len > H - m) return false;
              if (place(sl, sd[0] === 3 ? m + th / 2 : W - m - th / 2, y + len / 2, k, fx, 1, sd[1])) { runUsed[sl] = 1; got = len; return true; }
              return false;
            });
          });
          if (got) { y += got + 6 + R() * 24; n++; } else y += 8;
        }
      });
      // the free cells of the grid, for dropping pieces into the gaps
      function freeSpot() {
        for (var t = 0; t < 40; t++) {
          var c = Math.floor(R() * gw * gh);
          if (!occ[c]) return [(c % gw + 0.5) * U, (Math.floor(c / gw) + 0.5) * U];
        }
        return null;
      }
      // a run or two lying across the wider gaps (under the board, beside the title), nearly level
      var nr = RU.length ? 1 + Math.floor(R() * 2) : 0;
      for (var a = 0; a < nr; a++) {
        for (var tries = 0; tries < 60; tries++) {
          var p = freeSpot(), sl = pick(RU, runUsed), k = kr * (0.55 + R() * 0.35);
          if (p && place(sl, p[0], p[1], k, R() < 0.5 ? 1 : -1, 1, (R() - 0.5) * 0.2, 6)) { runUsed[sl] = 1; break; }
        }
      }
      // sprigs, single leaves, berries and flowers in what is left, each a different piece until all have been used
      var ks = kc * 1.15, ns = SP.length ? Math.round(W * H / 26000) + Math.floor(R() * 5) : 0, spUsed = {};
      for (var s = 0; s < ns; s++) {
        for (tries = 0; tries < 50; tries++) {
          p = freeSpot(); sl = pick(SP, spUsed);
          if (p && place(sl, p[0], p[1], ks * (0.8 + R() * 0.35), R() < 0.5 ? 1 : -1, 1, (R() - 0.5) * 1.1, 7)) { spUsed[sl] = 1; break; }
        }
      }
      return true;
    }
  }

  var ART = {
    // the painted ivy on a page's vellum (false when its PNGs are not loaded)
    ivyPage: ivyPage,
    INK: INK, PIG: PIG, ribbon: ribbon, mix: mix, rand: rand, maskShape: maskShape, makePage: makePage, sheet: drawSheet,
    // the board's enamel look: RIB colours, the cached panel (ground, filigree, gilded frame, ivy) and
    // layered gold-edged ribbon strokes
    RIB: RIB, HAIR: HAIR, GILT: GILT, MADDER: MADDER, makePanel: makePanel, ribLayers: ribLayers, ribMix: ribMix,
    setPen: function (m) { PEN = m; }, rampAt: function (rib, x) { return rampAt(rib, x); },
    // the page's panel ground (a GROUND name, from the level) and the jewels that contrast with it
    GROUND: GROUND, groundName: groundName, ground: function (name) { return GROUND[name] || GROUND.madder; }, jewelsFor: jewelsFor,
    rib: function (name) { return RIB[name] || RIB.gold; },
    // register another drawn slot (drolleries.js uses this)
    define: function (slot, fn) { DRAW[slot] = fn; },
    pigment: function (name) { return PIG[name] || PIG.gold; },
    has: function (slot) { return !!images[slot]; },
    // where the board's ribbon stops on a painted beast's tile (tile frame, side 1, entry at -0.5), or null
    // where the board's ribbon gives way to the painted knot (tiles from the centre), or null when drawn
    knotStop: function () { return images.knot ? KNOT.stop : null; },
    beastStop: function (kind, band) {
      var sl = kind === 'tail' ? 'beast.tail' : 'beast.headShut';
      if (!beastReady(kind) || !prepBeast(sl)) return null;
      return beastGeom(kind, band || BEAST_BAND).stop;
    },
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
      // a pigment mark draws its painted gem (mark.<pigment>) when that PNG is loaded
      if (slot === 'mark' && opts.pigment && images['mark.' + opts.pigment]) slot = 'mark.' + opts.pigment;
      var img = slot === 'page' || SELF[slot] ? null : images[slot], m = metas[slot];   // these lay their PNG themselves
      ctx.save();
      if (img && m && m.crisp && !opts.angle) drawCrisp(ctx, slot, img, x, y, w, h);
      else if (img) {
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
      return fetch(base + 'manifest.json?v=8', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        return Promise.all(Object.keys(m).map(function (slot) {
          var e = typeof m[slot] === 'string' ? { file: m[slot] } : (m[slot] || {});
          if (!e.file) return null;
          return new Promise(function (res) {
            var img = new Image();
            img.onload = function () {
              images[slot] = img; delete fadedCache[slot]; delete ivyOcc[slot]; delete beastPrep[slot]; delete beastBad[slot];
              if (BEAST[slot]) { beastCache = {}; beastCacheN = 0; }
              metas[slot] = { aspect: img.naturalWidth / img.naturalHeight, stem: e.stem != null ? e.stem : 0.5,
                fit: e.fit != null ? !!e.fit : slot.indexOf('drollery.') === 0,
                crisp: e.crisp != null ? !!e.crisp : slot.indexOf('mark.') === 0, inset: e.inset };
              if (slot === 'page') cache.page = null;
              if (slot === 'knot') { knotCache = {}; knotCacheN = 0; }
              Object.keys(crispCache).forEach(function (k) { if (k.indexOf(slot + ':') === 0) delete crispCache[k]; });
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
