/* Writ & Ruin: code-drawn art in the colour woodcut style (black key block over flat colour,
 * colour nudged off the line). Every picture goes through art(slot): painted art listed in
 * art/manifest.json (made by tools/prep-art.py) replaces these slot by slot, and these stay as the fallback.
 *   art('house/varrow')  heraldic stamp      art('site/crown')  site glyph
 *   art('suit/Lore')     suit glyph          art('card/drover') card glyph (suit, or relic)
 *   art('annals/3', entry)  Annals vignette: the painting for how the age ended (annals-seize, ...), else carved
 * window.WR_ART. Needs WR_DATA.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA;

  var PAL = { paper: '#f4ead2', ink: '#17140f', moss: '#7f8b4c', slate: '#7c8796', rust: '#a5492f',
    ochre: '#c49a45', bone: '#e6dcc2', peat: '#5a4632' };

  // house colours and stamps: the palette first, two deeper inks for the last houses
  var HOUSE = {
    player: { col: PAL.rust, shape: 'shield', charge: 'tower' },
    varrow: { col: PAL.peat, shape: 'shield', charge: 'chevron' },
    synod: { col: PAL.slate, shape: 'round', charge: 'eye' },
    gullwing: { col: PAL.ochre, shape: 'pennant', charge: 'gull' },
    thorne: { col: PAL.moss, shape: 'shield', charge: 'thorn' },
    lantern: { col: '#6d3a46', shape: 'lozenge', charge: 'lantern' },
    moss: { col: '#3d5a4c', shape: 'round', charge: 'leaf' }
  };
  function houseCol(h) { return (HOUSE[h] || { col: PAL.bone }).col; }
  // ink or paper text on a fill
  function textOn(col) {
    var n = parseInt(col.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? PAL.ink : PAL.paper;
  }

  var SUIT_COL = { Order: PAL.rust, Hearth: PAL.ochre, Lore: PAL.slate, Wild: PAL.moss, Shade: PAL.peat };

  // ---------------------------------------------------------------- seeded noise for hand-cut shapes
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var t = seed >>> 0;
    return function () { t = (t + 0x6D2B79F5) | 0; var x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  // closed smooth path through points (Catmull-Rom to cubic)
  function smooth(pts) {
    var n = pts.length, d = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + f1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
    }
    return d + 'Z';
  }
  // a hand-shaped blob: points around a centre with a wobbling radius
  function blobPoints(cx, cy, r, seed, n) {
    var R = rng(seed), pts = [], ph = R() * 6.28, sq = 0.85 + R() * 0.25;
    n = n || 13;
    for (var i = 0; i < n; i++) {
      var a = ph + i / n * Math.PI * 2, k = 0.86 + R() * 0.24 + 0.06 * Math.sin(a * 3 + ph);
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * sq]);
    }
    return pts;
  }
  function blob(cx, cy, r, seed, n) { return smooth(blobPoints(cx, cy, r, seed, n)); }
  // short gouge marks inside a blob
  function gouges(cx, cy, r, seed, count, col, w) {
    var R = rng(seed + 99), out = '';
    for (var i = 0; i < count; i++) {
      var a = R() * Math.PI * 2, d = r * (0.25 + R() * 0.45);
      var x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8 + r * 0.15;
      var len = r * (0.18 + R() * 0.2), tilt = (R() - 0.5) * 0.5;
      out += '<path d="M' + f1(x - len / 2) + ' ' + f1(y) + 'q' + f1(len / 2) + ' ' + f1(-len * (0.15 + tilt)) + ' ' + f1(len) + ' ' + f1(len * tilt * 0.4) + '" stroke="' + col + '" stroke-width="' + (w || 1.6) + '" fill="none" stroke-linecap="round"/>';
    }
    return out;
  }

  // ---------------------------------------------------------------- heraldic stamps (viewBox 40x44)
  var SHAPES = {
    shield: 'M4 4H36V20C36 32 28 38 20 42C12 38 4 32 4 20Z',
    round: 'M20 3C30 3 37 11 37 22C37 33 30 41 20 41C10 41 3 33 3 22C3 11 10 3 20 3Z',
    lozenge: 'M20 2L38 22L20 42L2 22Z',
    pennant: 'M5 4H35V40L20 32L5 40Z'
  };
  var CHARGES = {
    tower: 'M14 31V17H15.5V13H18V16H22V13H24.5V17H26V31ZM18.5 31V25C18.5 23 21.5 23 21.5 25V31Z',
    chevron: 'M8 29L20 16L32 29V34L20 21.5L8 34Z',
    eye: 'M7 22C12 14 28 14 33 22C28 30 12 30 7 22ZM20 18A4 4 0 1 0 20.01 18Z',
    gull: 'M7 20C13 14 17 16 20 23C23 16 27 14 33 20C27 18 23 21 20 28C17 21 13 18 7 20Z',
    thorn: 'M19 9H21.4V36H19ZM21.4 15L29 11L22.8 19.5ZM19 21L11 17.5L17.6 25ZM21.4 26L28.5 23.5L22.5 30Z',
    lantern: 'M17 10H23V13H26V31H14V13H17ZM17 17V27H23V17Z',
    leaf: 'M20 8C31 15 31 30 20 38C9 30 9 15 20 8ZM19.3 13V35H20.7V13Z'
  };
  function stamp(h, size) {
    var H = HOUSE[h] || { col: PAL.bone, shape: 'round', charge: 'eye' };
    size = size || 28;
    return '<svg class="stamp" viewBox="0 0 40 44" width="' + size + '" height="' + f1(size * 1.1) + '" aria-hidden="true">' +
      '<path d="' + SHAPES[H.shape] + '" fill="' + H.col + '" transform="translate(1.6 1.2)"/>' +
      '<path d="' + SHAPES[H.shape] + '" fill="none" stroke="' + PAL.ink + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="' + CHARGES[H.charge] + '" fill="' + PAL.ink + '" fill-rule="evenodd"/></svg>';
  }

  // ---------------------------------------------------------------- glyphs (viewBox 24)
  var SUIT_GLYPH = {
    Order: '<path d="M4 21L18 4M20 21L6 4" stroke-width="2.4"/><path d="M16 3L20 2L19 6ZM8 3L4 2L5 6Z" fill="#17140f"/>',
    Hearth: '<path d="M12 21V8M12 21L7 10M12 21L17 10" stroke-width="2"/><ellipse cx="12" cy="6" rx="2.2" ry="4" fill="#17140f"/><ellipse cx="6.5" cy="8.5" rx="2" ry="3.6" fill="#17140f" transform="rotate(-25 6.5 8.5)"/><ellipse cx="17.5" cy="8.5" rx="2" ry="3.6" fill="#17140f" transform="rotate(25 17.5 8.5)"/>',
    Lore: '<path d="M2.5 6C7 4 10 4.5 12 7C14 4.5 17 4 21.5 6V19C17 17.5 14 18 12 20C10 18 7 17.5 2.5 19Z" stroke-width="2" stroke-linejoin="round"/><path d="M12 7V20M5 9H9.5M5 12H9.5M14.5 9H19M14.5 12H19" stroke-width="1.4"/>',
    Wild: '<path d="M12 22V13M12 13C9 10 6 9 5 4M8 9L3 8M12 13C15 10 18 9 19 4M16 9L21 8M6.5 6L8 3M17.5 6L16 3" stroke-width="2.2" stroke-linecap="round"/>',
    Shade: '<path d="M15 3A9 9 0 1 0 15 21A7 7 0 1 1 15 3Z" fill="#17140f"/>',
    Relic: '<path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.4" fill="#17140f"/>'
  };
  var SITE_GLYPH = {
    crown: '<path d="M5 22V8H7.5V4H10.5V7H13.5V4H16.5V8H19V22ZM10 22V16C10 13.5 14 13.5 14 16V22Z" fill="#17140f" fill-rule="evenodd"/>',
    saltmarsh: '<path d="M2 8Q5 5 8 8T14 8T20 8M2 14Q5 11 8 14T14 14T20 14M2 20Q5 17 8 20T14 20T20 20" stroke-width="2" stroke-linecap="round"/>',
    riverford: '<path d="M1 20V12H23V20H19C19 15 15 13 12 13C9 13 5 15 5 20Z" fill="#17140f"/><path d="M1 9H23" stroke-width="2"/>',
    ashwood: '<path d="M4 22C4 13 8 9 12 9C16 9 20 13 20 22Z" fill="#17140f"/><path d="M12 7C10 5 13 4 11 1M15 7C14 5 16 4 15 2" stroke-width="1.6" stroke-linecap="round"/>',
    highpasture: '<path d="M6 21V11C6 5 18 5 18 11V21H14.5V11C14.5 8.5 9.5 8.5 9.5 11V21Z" fill="#17140f"/>',
    stonefields: '<path d="M3 22L4 9L8 7L9 22ZM10 22L10.5 4L14.5 3L15 22ZM16 22L16.5 11L20.5 10L21 22Z" fill="#17140f"/>',
    oldbarrow: '<path d="M1 21C3 12 8 8 12 8C16 8 21 12 23 21ZM10 21V16C10 14 14 14 14 16V21Z" fill="#17140f" fill-rule="evenodd"/>',
    farpass: '<path d="M7 22L8 5L12 2L16 5L17 22ZM12 9A2.6 2.6 0 1 0 12.01 9Z" fill="#17140f" fill-rule="evenodd"/>'
  };
  function glyph(inner, size, cls) {
    return '<svg class="' + (cls || 'glyph') + '" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + PAL.ink + '" aria-hidden="true">' + inner + '</svg>';
  }
  function suitGlyph(suit, size) { return glyph(SUIT_GLYPH[suit] || SUIT_GLYPH.Relic, size || 22); }
  function siteGlyph(r, size) { return glyph(SITE_GLYPH[r], size || 22); }
  function cardSuit(id) { var c = D.CARDS[id]; return c.relic ? 'Relic' : c.suit; }
  function suitCol(suit) { return suit === 'Relic' ? PAL.ochre : SUIT_COL[suit]; }

  // a card: suit block with glyph (or the resident's painted portrait), name, cost, text.
  // opts.pic: 'thumb' (the default) a head-and-shoulders crop for lists, loaded lazily;
  //           'full' the whole portrait, for a resident offered or shown on its own.
  function card(id, extra, opts) {
    var c = D.CARDS[id], suit = cardSuit(id), url = painted[(c.relic ? 'relic-' : 'res-') + id];
    var pic = opts && opts.pic === 'full' ? 'full' : 'thumb';
    // a relic's painting is a cut-out, shown whole on the bare card with no frame
    var face = url && c.relic ? '<div class="card-relic ' + pic + '"><img src="' + url + '" alt="" decoding="async"></div>' :
      url ? '<div class="card-pic ' + pic + '" style="--suit:' + suitCol(suit) + '"><img src="' + url + '" alt=""' +
        (pic === 'thumb' ? ' loading="lazy"' : '') + ' decoding="async" onerror="WR_ART.noPortrait(this,\'' + id + '\')"></div>' :
      '<div class="card-glyph" style="--suit:' + suitCol(suit) + '">' + art('card/' + id) + '</div>';
    return '<div class="card' + (url ? ' has-pic pic-' + pic : '') + '" data-card="' + id + '">' + face +
      '<div class="card-body"><div class="card-name">' + c.name + (c.relic ? '' : ' <span class="cost">' + c.cost + 's</span>') + '</div>' +
      '<div class="card-suit">' + (c.relic ? 'Relic' : c.suit) + '</div><div class="card-text">' + c.text + '</div>' + (extra || '') + '</div></div>';
  }

  // a plain vignette for the Annals: a carved frame round the winner's stamp and a site
  function vignette(entry) {
    var h = entry && entry.winner, R = rng(hash('annals' + (entry ? entry.age : 0)));
    var hills = '';
    for (var i = 0; i < 3; i++) { var y = 52 + i * 9; hills += '<path d="M2 ' + y + 'Q' + f1(20 + R() * 20) + ' ' + (y - 10 - R() * 6) + ' 50 ' + y + 'T98 ' + y + 'V70H2Z" fill="' + [PAL.slate, PAL.moss, PAL.ochre][i] + '"/>'; }
    var sky = '';
    for (var j = 0; j < 5; j++) sky += '<path d="M' + f1(6 + R() * 30) + ' ' + f1(10 + j * 7) + 'q20 -4 ' + f1(30 + R() * 30) + ' 2" stroke="' + PAL.ink + '" stroke-width="1.4" fill="none"/>';
    return '<svg class="vignette" viewBox="0 0 100 72" aria-hidden="true"><rect x="2" y="2" width="96" height="68" fill="' + PAL.bone + '"/>' + sky + hills +
      (h ? '<g transform="translate(38 14) scale(0.6)">' + stamp(h, 40).replace(/<svg[^>]*>|<\/svg>/g, '') + '</g>' : '') +
      '<rect x="2" y="2" width="96" height="68" fill="none" stroke="' + PAL.ink + '" stroke-width="3"/></svg>';
  }

  // ---------------------------------------------------------------- the art hook
  // Painted art: art/manifest.json maps a slot ('board', 'site-crown', 'house-varrow', 'stamp-crown', ...) to an
  // image url. Each image is preloaded and only listed in `painted` once it has loaded, so a missing file
  // keeps the code-drawn fallback. art('house/varrow') looks up the slot 'house-varrow'.
  var painted = {}, listeners = [], redraw = null;
  function paintedUrl(slot) { return painted[slot] || painted[slot.replace('/', '-')] || null; }
  function onPainted(fn) { listeners.push(fn); }
  function arrived() {
    if (redraw) return;
    redraw = setTimeout(function () { redraw = null; listeners.forEach(function (fn) { try { fn(); } catch (e) { if (root.console) console.error(e); } }); }, 30);
  }
  function loadManifest() {
    if (typeof fetch !== 'function' || typeof Image === 'undefined') return;
    try {
      fetch('art/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
        if (!m || typeof m !== 'object') return;
        var portraits = false;
        Object.keys(m).forEach(function (slot) {
          var url = m[slot];
          if (typeof url !== 'string') return;
          // resident portraits are many and shown one card at a time: listed now, fetched by the card's own
          // (lazy) img, and dropped back to the suit block by noPortrait if one fails to load
          if (slot.indexOf('res-') === 0) { painted[slot] = url; portraits = true; return; }
          var im = new Image();
          var once = false;
          var done = function () { if (once) return; once = true; painted[slot] = url; arrived(); };
          // decode() first so the picture does not flash in blank, but a background tab can hold
          // decode() back indefinitely, so the loaded image is used after a short wait regardless
          im.onload = function () { if (im.decode) { im.decode().then(done, done); setTimeout(done, 800); } else done(); };
          im.src = url;
        });
        if (portraits) arrived();
      }).catch(function () {});
    } catch (e) { /* file:// or no fetch: stay with the drawn art */ }
  }
  // a portrait that failed to load: forget it and put the suit block back in its place
  function noPortrait(img, id) {
    delete painted['res-' + id];
    var box = img.parentNode, cardEl = box && box.parentNode;
    if (!cardEl) return;
    var g = document.createElement('div');
    g.className = 'card-glyph';
    g.style.setProperty('--suit', suitCol(cardSuit(id)));
    g.innerHTML = art('card/' + id);
    cardEl.replaceChild(g, box);
    cardEl.classList.remove('has-pic', 'pic-full', 'pic-thumb');
  }
  // The painted flag, lozenge and rounds carry less ink than a shield at the same width (tools/prep-art.py
  // trims each to its edges), so at stamp size they read a size smaller. They are drawn wider, never taller
  // than a shield. Measure again if a banner is repainted.
  var BANNER_SCALE = { gullwing: 1.12, lantern: 1.2, synod: 1.12, moss: 1.12 };
  function bannerScale(h) { return BANNER_SCALE[h] || 1; }
  // the painted Annals vignette for an entry: one per way the age ended, with the winner's banner small in a
  // corner. null while it is not painted (or not loaded), and the carved vignette stands in.
  function annalsSlot(entry) { return entry ? 'annals-' + (entry.winner ? entry.how : 'none') : null; }
  function paintedVignette(entry) {
    var url = painted[annalsSlot(entry)];
    if (!url) return null;
    return '<figure class="vignette painted-vignette"><img src="' + url + '" alt="" loading="lazy" decoding="async">' +
      (entry.winner ? '<span class="vg-stamp">' + art('house/' + entry.winner, { size: 26 }) + '</span>' : '') + '</figure>';
  }
  function art(slot, opts) {
    if (slot.indexOf('annals/') === 0) return paintedVignette(opts) || vignette(opts);
    var url = paintedUrl(slot);
    if (url && slot.indexOf('house/') === 0 && opts && opts.size) opts = { size: Math.round(opts.size * bannerScale(slot.slice(6))) };
    // a site painting is a landscape: squeezed into an icon it reads as mud, so small sites keep the glyph
    if (url && slot.indexOf('site/') === 0 && opts && opts.size && opts.size < 100) url = null;
    if (url) return '<img class="painted" src="' + url + '" alt=""' + (opts && opts.size ? ' style="width:' + opts.size + 'px;height:auto"' : '') + '>';
    var p = slot.split('/'), kind = p[0], id = p[1];
    if (kind === 'house') return stamp(id, opts && opts.size);
    if (kind === 'site') return siteGlyph(id, opts && opts.size);
    if (kind === 'suit') return suitGlyph(id, opts && opts.size);
    if (kind === 'card') return suitGlyph(cardSuit(id), opts && opts.size || 26);
    if (kind === 'annals') return vignette(opts);
    return '';
  }
  if (typeof document !== 'undefined') loadManifest();

  root.WR_ART = { PAL: PAL, HOUSE: HOUSE, houseCol: houseCol, textOn: textOn, SUIT_COL: SUIT_COL, suitCol: suitCol, cardSuit: cardSuit,
    hash: hash, rng: rng, blob: blob, blobPoints: blobPoints, smooth: smooth, gouges: gouges, f1: f1,
    stamp: stamp, suitGlyph: suitGlyph, siteGlyph: siteGlyph, SITE_GLYPH: SITE_GLYPH, card: card, vignette: vignette, annalsSlot: annalsSlot,
    art: art, painted: painted, paintedUrl: paintedUrl, bannerScale: bannerScale, onPainted: onPainted, noPortrait: noPortrait };
})(typeof self !== 'undefined' ? self : this);
