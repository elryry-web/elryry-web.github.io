/* Writ & Ruin: the valley map, drawn as a colour woodcut in SVG.
 * WR_MAP.svg(s, view) -> svg string. view: { selected, picks:[region], pickKind, flash:{region, from, to, house},
 *   intents:[{house, intent, second}] }. Taps land on elements with data-region (or data-region="camp").
 * Needs WR_DATA, WR_ENGINE, WR_ART.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA, E = root.WR_ENGINE, A = root.WR_ART;
  var P = A.PAL, f1 = A.f1;

  var W = 420, H = 470;
  var POS = {
    crown: [200, 232, 60], riverford: [92, 100, 50], ashwood: [262, 80, 50], highpasture: [355, 198, 48],
    farpass: [352, 352, 44], stonefields: [228, 385, 52], oldbarrow: [82, 392, 48], saltmarsh: [62, 248, 48]
  };
  var CAMP = [392, 438];

  // ---------------------------------------------------------------- the fixed carving: sky bands, roads, blob shapes
  var cache = null;
  function base() {
    if (cache) return cache;
    var out = '', R = A.rng(A.hash('valley'));
    // carved swirling bands in the paper, like a cut sky
    for (var i = 0; i < 9; i++) {
      var y = 20 + i * 52 + R() * 12, x0 = -10, amp = 8 + R() * 10;
      out += '<path d="M' + x0 + ' ' + f1(y) + 'C' + f1(110) + ' ' + f1(y - amp) + ' ' + f1(200) + ' ' + f1(y + amp) + ' ' + f1(300) + ' ' + f1(y - amp * 0.5) +
        'S' + f1(400) + ' ' + f1(y + amp) + ' ' + (W + 10) + ' ' + f1(y) + '" stroke="' + P.bone + '" stroke-width="' + f1(5 + R() * 5) + '" fill="none" stroke-linecap="round"/>';
    }
    // roads between neighbours: an ink cut with a paper groove
    var seen = {}, roads = '';
    D.REGION_IDS.forEach(function (a) {
      D.REGION[a].adj.forEach(function (b) {
        var k = a < b ? a + b : b + a;
        if (seen[k]) return; seen[k] = 1;
        var p = POS[a], q = POS[b], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy), bend = (A.rng(A.hash(k))() - 0.5) * 30;
        var cx = mx - dy / len * bend, cy = my + dx / len * bend;
        var d = 'M' + p[0] + ' ' + p[1] + 'Q' + f1(cx) + ' ' + f1(cy) + ' ' + q[0] + ' ' + q[1];
        roads += '<path d="' + d + '" stroke="' + P.ink + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
          '<path d="' + d + '" stroke="' + P.paper + '" stroke-width="2.4" fill="none" stroke-dasharray="7 5" stroke-linecap="round"/>';
      });
    });
    // the camp road beside the Far Pass
    roads += '<path d="M352 352Q384 390 ' + CAMP[0] + ' ' + CAMP[1] + '" stroke="' + P.ink + '" stroke-width="3" fill="none" stroke-dasharray="3 5"/>';
    var shapes = {};
    D.REGION_IDS.forEach(function (r) { var p = POS[r]; shapes[r] = A.blob(p[0], p[1], p[2], A.hash(r), 14); });
    cache = { sky: out, roads: roads, shapes: shapes };
    return cache;
  }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // a warband counter: a house-colour block nudged off its ink square
  function counter(x, y, col, n, cls) {
    return '<g class="' + (cls || 'band') + '"><rect x="' + f1(x - 9) + '" y="' + f1(y - 9) + '" width="20" height="20" fill="' + P.paper + '"/>' +
      '<rect x="' + f1(x - 7.2) + '" y="' + f1(y - 7.6) + '" width="16" height="16" fill="' + col + '"/>' +
      '<rect x="' + f1(x - 8) + '" y="' + f1(y - 8) + '" width="16" height="16" fill="none" stroke="' + P.ink + '" stroke-width="2"/>' +
      '<text x="' + f1(x) + '" y="' + f1(y + 4.6) + '" text-anchor="middle" class="cnt" fill="' + A.textOn(col) + '">' + n + '</text></g>';
  }
  function stampAt(h, x, y, size) {
    return '<g transform="translate(' + f1(x - size / 2) + ' ' + f1(y - size * 0.55) + ') scale(' + f1(size / 40) + ')">' +
      A.stamp(h, 40).replace(/<svg[^>]*>|<\/svg>/g, '') + '</g>';
  }

  function region(s, r, view) {
    var g = s.regions[r], p = POS[r], cx = p[0], cy = p[1], rad = p[2], b = base(), shape = b.shapes[r];
    var owner = g.owner, fill = owner ? A.houseCol(owner) : P.bone, out = '<g class="region" data-region="' + r + '">';
    // colour block, nudged off the key block
    out += '<path d="' + shape + '" fill="' + fill + '" transform="translate(2.4 1.8)"/>';
    out += owner ? A.gouges(cx, cy, rad, A.hash(r), 7, P.paper, 1.8) : A.gouges(cx, cy, rad, A.hash(r), 6, P.ink, 1.3);
    out += '<path d="' + shape + '" fill="none" stroke="' + P.ink + '" stroke-width="3.6" stroke-linejoin="round"/>';
    if (view.selected === r) out += '<path d="' + shape + '" class="sel" fill="none" stroke="' + P.ochre + '" stroke-width="5" stroke-dasharray="10 5"/>';
    if (view.picks && view.picks.indexOf(r) >= 0) out += '<path d="' + shape + '" class="pick" fill="none" stroke="' + P.rust + '" stroke-width="5" stroke-dasharray="8 6"/>';
    if (view.flash && (view.flash.region === r || view.flash.to === r)) out += '<path d="' + shape + '" class="flash" fill="none" stroke="' + P.ink + '" stroke-width="7"/>';
    // name cartouche
    var nm = D.REGION[r].name, tw = nm.length * 6.2 + 12, ny = cy - rad * 0.66;
    out += '<rect x="' + f1(cx - tw / 2 + 1.5) + '" y="' + f1(ny - 9) + '" width="' + f1(tw) + '" height="17" fill="' + P.ink + '"/>' +
      '<rect x="' + f1(cx - tw / 2) + '" y="' + f1(ny - 10.5) + '" width="' + f1(tw) + '" height="17" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.6"/>' +
      '<text x="' + cx + '" y="' + f1(ny + 2.2) + '" text-anchor="middle" class="rname">' + esc(nm) + '</text>';
    // site glyph in a paper roundel, residents as little suit cards
    var sx = cx - 15, sy = cy - 14;
    out += '<circle cx="' + sx + '" cy="' + sy + '" r="12.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="2"/>' +
      '<g transform="translate(' + (sx - 9) + ' ' + (sy - 9) + ')">' + A.siteGlyph(r, 18).replace(/<svg[^>]*>/, '<svg x="0" y="0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + P.ink + '">') + '</g>';
    if (g.ruined) out += '<path d="M' + (sx - 11) + ' ' + (sy - 11) + 'L' + (sx + 11) + ' ' + (sy + 11) + 'M' + (sx + 11) + ' ' + (sy - 11) + 'L' + (sx - 11) + ' ' + (sy + 11) + '" stroke="' + P.rust + '" stroke-width="3.4"/>';
    var slots = E.slotsOf(s, r);
    for (var i = 0; i < slots; i++) {
      var id = g.residents[i], x = cx + 2 + i * 13, y = sy - 9;
      if (id) {
        var su = A.cardSuit(id);
        out += '<rect x="' + (x + 1.2) + '" y="' + (y + 1) + '" width="10" height="15" fill="' + A.suitCol(su) + '"/>' +
          '<rect x="' + x + '" y="' + y + '" width="10" height="15" fill="none" stroke="' + P.ink + '" stroke-width="1.6"/>';
      } else out += '<rect x="' + x + '" y="' + y + '" width="10" height="15" fill="none" stroke="' + P.ink + '" stroke-width="1.2" stroke-dasharray="2 2"/>';
    }
    // holder stamp, shelter mark
    if (owner) out += stampAt(owner, cx - 22, cy + 16, 22);
    if (owner && s.houses[owner] && s.houses[owner].refuge === r) {
      out += '<g class="safe"><rect x="' + (cx - 38) + '" y="' + (cy + 28) + '" width="34" height="13" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.4"/>' +
        '<text x="' + (cx - 21) + '" y="' + (cy + 37.6) + '" text-anchor="middle" class="tiny">safe</text></g>';
    }
    // warbands: every house present, then free folk
    var cs = [];
    Object.keys(g.bands).forEach(function (h) { if (g.bands[h] > 0) cs.push([A.houseCol(h), g.bands[h]]); });
    cs.sort(function (a, b2) { return (a[0] === fill ? -1 : 0) - (b2[0] === fill ? -1 : 0); });
    if (!owner && g.folk > 0) cs.push([P.bone, g.folk, 'folk']);
    cs.forEach(function (c, k) {
      var x = cx + 4 + (k % 2) * 22, y = cy + 10 + Math.floor(k / 2) * 22;
      out += counter(x, y, c[0], c[1], c[2] ? 'folk' : 'band');
    });
    // a large invisible tap target
    out += '<path d="' + shape + '" fill="transparent" class="hit"/>';
    return out + '</g>';
  }

  function camp(s, view) {
    var out = '', k = 0;
    s.order.forEach(function (h) {
      var n = s.houses[h].camp || 0;
      if (!n) return;
      var x = CAMP[0] - k * 30, y = CAMP[1];
      out += '<g class="camp" data-region="camp"><path d="M' + (x - 14) + ' ' + (y + 10) + 'L' + x + ' ' + (y - 14) + 'L' + (x + 14) + ' ' + (y + 10) + 'Z" fill="' + A.houseCol(h) + '" transform="translate(1.6 1.2)"/>' +
        '<path d="M' + (x - 14) + ' ' + (y + 10) + 'L' + x + ' ' + (y - 14) + 'L' + (x + 14) + ' ' + (y + 10) + 'ZM' + x + ' ' + (y - 14) + 'V' + (y + 10) + '" fill="none" stroke="' + P.ink + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<rect x="' + (x - 20) + '" y="' + (y - 20) + '" width="40" height="40" fill="transparent"/>' +
        counter(x + 12, y - 12, A.houseCol(h), n) + '</g>';
      k++;
    });
    if (out || (view.picks && view.picks.indexOf('camp') >= 0)) {
      out = '<text x="' + CAMP[0] + '" y="' + (CAMP[1] + 26) + '" text-anchor="end" class="tiny">camp</text>' + out;
      if (view.picks && view.picks.indexOf('camp') >= 0)
        out += '<g data-region="camp"><circle cx="' + CAMP[0] + '" cy="' + CAMP[1] + '" r="20" fill="' + P.paper + '" stroke="' + P.rust + '" stroke-width="4" stroke-dasharray="6 5" class="pick"/>' +
          '<text x="' + CAMP[0] + '" y="' + (CAMP[1] + 4) + '" text-anchor="middle" class="tiny">camp</text></g>';
    }
    return out;
  }

  // an arrow cut from one region toward another, in a house colour
  function arrow(from, to, col, dashed, label, h, wide) {
    var p = from === 'camp' ? [CAMP[0], CAMP[1], 10] : POS[from], q = POS[to];
    if (!p || !q) return '';
    var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len;
    var x1 = p[0] + ux * p[2] * 0.45, y1 = p[1] + uy * p[2] * 0.45, x2 = q[0] - ux * q[2] * 0.5, y2 = q[1] - uy * q[2] * 0.5;
    var bend = 16, cx = (x1 + x2) / 2 - uy * bend, cy = (y1 + y2) / 2 + ux * bend;
    // arrow head along the last segment
    var tx = x2 - cx, ty = y2 - cy, tl = Math.sqrt(tx * tx + ty * ty), hx = tx / tl, hy = ty / tl, s = wide ? 13 : 10;
    var head = 'M' + f1(x2 + hx * 4) + ' ' + f1(y2 + hy * 4) + 'L' + f1(x2 - hx * s - hy * s * 0.7) + ' ' + f1(y2 - hy * s + hx * s * 0.7) +
      'L' + f1(x2 - hx * s + hy * s * 0.7) + ' ' + f1(y2 - hy * s - hx * s * 0.7) + 'Z';
    var d = 'M' + f1(x1) + ' ' + f1(y1) + 'Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(x2) + ' ' + f1(y2);
    var w = wide ? 6 : 4.5;
    var out = '<g class="arrow' + (wide ? ' live' : '') + '"><path d="' + d + '" stroke="' + P.ink + '" stroke-width="' + (w + 3.4) + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="10 7"' : '') + '/>' +
      '<path d="' + d + '" stroke="' + col + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="10 7"' : '') + '/>' +
      '<path d="' + head + '" fill="' + col + '" stroke="' + P.ink + '" stroke-width="2" stroke-linejoin="round"/>';
    var mx = (x1 + 2 * cx + x2) / 4, my = (y1 + 2 * cy + y2) / 4;
    if (h) out += stampAt(h, mx, my, 16);
    if (label != null) out += '<circle cx="' + f1(mx + 11) + '" cy="' + f1(my + 7) + '" r="7.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.6"/><text x="' + f1(mx + 11) + '" y="' + f1(my + 10.6) + '" text-anchor="middle" class="tiny b">' + label + '</text>';
    return out + '</g>';
  }
  // a marker for an intent that stays in one region (muster, search, return, depart)
  function marker(r, h, glyph, second) {
    var p = r === 'camp' ? [CAMP[0], CAMP[1], 14] : POS[r];
    if (!p) return '';
    var x = p[0] + p[2] * 0.62, y = p[1] - p[2] * 0.25 + (second ? 20 : 0);
    return '<g class="mark"><circle cx="' + f1(x + 1.4) + '" cy="' + f1(y + 1.2) + '" r="11" fill="' + A.houseCol(h) + '"/>' +
      '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="11" fill="none" stroke="' + P.ink + '" stroke-width="2"' + (second ? ' stroke-dasharray="4 3"' : '') + '/>' +
      '<text x="' + f1(x) + '" y="' + f1(y + 4.5) + '" text-anchor="middle" class="mk" fill="' + A.textOn(A.houseCol(h)) + '">' + glyph + '</text></g>';
  }
  function intentMark(s, h, it, second) {
    if (!it) return '';
    var col = A.houseCol(h);
    switch (it.type) {
      case 'assault': return arrow(it.from, it.to, col, second, it.count, h);
      case 'march': return arrow(it.from, it.to, col, true, it.count, h);
      case 'muster': return marker(it.region, h, '+', second);
      case 'search': return marker(it.region, h, '?', second);
      case 'return': return marker(it.region, h, '↵', second);
      case 'depart': return marker('farpass', h, '↑', second);
    }
    return '';
  }

  function svg(s, view) {
    view = view || {};
    var b = base(), out = '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The valley">';
    out += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + P.paper + '"/>' + b.sky + b.roads;
    D.REGION_IDS.forEach(function (r) { out += region(s, r, view); });
    out += camp(s, view);
    (view.intents || []).forEach(function (x) { out += intentMark(s, x.house, x.intent, x.second); });
    var fl = view.flash;
    if (fl && fl.from && fl.to && fl.from !== fl.to) out += arrow(fl.from, fl.to, A.houseCol(fl.house), false, null, null, true);
    // carved frame
    out +='<rect x="3" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" fill="none" stroke="' + P.ink + '" stroke-width="5" rx="3"/>';
    return out + '</svg>';
  }

  root.WR_MAP = { svg: svg, POS: POS, CAMP: CAMP };
})(typeof self !== 'undefined' ? self : this);
