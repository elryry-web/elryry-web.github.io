/* Writ & Ruin: the valley map, drawn as a colour woodcut in SVG.
 * WR_MAP.svg(s, view) -> svg string. view: { selected, picks:[region], pickKind, flash:{region, from, to, house},
 *   intents:[{house, intent, second}] }. Taps land on elements with data-region (or data-region="camp").
 * Needs WR_DATA, WR_ENGINE, WR_ART.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA, E = root.WR_ENGINE, A = root.WR_ART;
  var P = A.PAL, f1 = A.f1;

  // The map matches the painted board (art/board.jpg, 4:5): each region sits on its feature in the painting,
  // and the same positions are used when the painting is missing and the map is drawn in code.
  var W = 420, H = 521;
  var POS = {
    crown: [203, 255, 60], riverford: [108, 128, 46], ashwood: [280, 108, 62], highpasture: [322, 228, 52],
    farpass: [340, 418, 42], stonefields: [228, 398, 58], oldbarrow: [100, 462, 42], saltmarsh: [88, 256, 50]
  };
  var CAMP = [372, 486];
  var CAMP_GAP = 40;     // between the tents in camp, so each squad clears the next tent
  var WASH = 0.32;   // held-region wash over the painting
  var onBoard = false;   // set by svg(): drawing over the painting

  // the name chip above each region: [left, top, right, bottom] in map units, shadow included
  function labelBox(r) {
    var p = POS[r], tw = D.REGION[r].name.length * 6.2 + 12, ny = p[1] - Math.max(p[2] * 0.66, 32);
    return [p[0] - tw / 2, ny - 10.5, p[0] + tw / 2 + 1.5, ny + 8];
  }
  function labelHits(x, y, pad) {
    for (var i = 0; i < D.REGION_IDS.length; i++) {
      var b = labelBox(D.REGION_IDS[i]);
      if (x > b[0] - pad && x < b[2] + pad && y > b[1] - pad && y < b[3] + pad) return true;
    }
    return false;
  }

  function boardUrl() { return A.paintedUrl ? A.paintedUrl('board') : null; }

  // where a ray from a region's centre leaves its blob (on the blob's control polygon, which the outline passes through)
  function edgePoint(r, tx, ty) {
    var p = POS[r], pts = cache.pts[r], dx = tx - p[0], dy = ty - p[1], best = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1];
      var den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      var ax = a[0] - p[0], ay = a[1] - p[1], t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    if (!best) best = p[2] / Math.sqrt(dx * dx + dy * dy);
    return [p[0] + dx * best, p[1] + dy * best];
  }

  // roads whose two regions all but touch on the board take a roundabout course instead, so the link can be seen.
  // Keyed 'lo|hi' (the names in alphabetical order); the road runs from lo to hi as a cubic through ctrl, and
  // each end leaves its blob on the ray from the region's centre toward its aim point (default: the nearer control).
  var DETOUR = {
    // out of the wood's east side, round under the mountains, into the pasture from the north-east
    'ashwood|highpasture': { aim: [[390, 150], [404, 240]], ctrl: [[386, 136], [404, 240]] },
    // out of the Crown's south-west, down and round below the gap, up into the marsh from the south-east
    'crown|saltmarsh': { aim: [[150, 296], [124, 312]], ctrl: [[160, 338], [118, 340]] }
  };

  // ---------------------------------------------------------------- the fixed carving: sky bands, roads, blob shapes
  var cache = null;
  function base() {
    if (cache) return cache;
    cache = { pts: {}, shapes: {}, field: {} };
    var out = '', R = A.rng(A.hash('valley'));
    // carved swirling bands in the paper, like a cut sky
    for (var i = 0; i < 10; i++) {
      var y = 20 + i * 52 + R() * 12, x0 = -10, amp = 8 + R() * 10;
      out += '<path d="M' + x0 + ' ' + f1(y) + 'C' + f1(110) + ' ' + f1(y - amp) + ' ' + f1(200) + ' ' + f1(y + amp) + ' ' + f1(300) + ' ' + f1(y - amp * 0.5) +
        'S' + f1(400) + ' ' + f1(y + amp) + ' ' + (W + 10) + ' ' + f1(y) + '" stroke="' + P.bone + '" stroke-width="' + f1(5 + R() * 5) + '" fill="none" stroke-linecap="round"/>';
    }
    D.REGION_IDS.forEach(function (r) {
      var p = POS[r];
      cache.pts[r] = A.blobPoints(p[0], p[1], p[2], A.hash(r), 14);
      cache.shapes[r] = A.smooth(cache.pts[r]);
    });
    // roads between neighbours, from blob edge to blob edge (each end tucked just under the outline)
    var seen = {}, roads = [];
    var tuck = function (pt, c) { var ux = c[0] - pt[0], uy = c[1] - pt[1], l = Math.sqrt(ux * ux + uy * uy) || 1; return [pt[0] - ux / l * 3, pt[1] - uy / l * 3]; };
    D.REGION_IDS.forEach(function (a) {
      D.REGION[a].adj.forEach(function (b) {
        var k = a < b ? a + b : b + a;
        if (seen[k]) return; seen[k] = 1;
        var lo = a < b ? a : b, hi = a < b ? b : a, dt = DETOUR[lo + '|' + hi];
        if (dt) {
          var c1 = dt.ctrl[0], c2 = dt.ctrl[1], m0 = dt.aim ? dt.aim[0] : c1, m1 = dt.aim ? dt.aim[1] : c2;
          var e0 = tuck(edgePoint(lo, m0[0], m0[1]), c1), e1 = tuck(edgePoint(hi, m1[0], m1[1]), c2);
          roads.push('M' + f1(e0[0]) + ' ' + f1(e0[1]) + 'C' + f1(c1[0]) + ' ' + f1(c1[1]) + ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(e1[0]) + ' ' + f1(e1[1]));
          return;
        }
        var p = POS[a], q = POS[b], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy), bend = (A.rng(A.hash(k))() - 0.5) * 30;
        var cx = mx - dy / len * bend, cy = my + dx / len * bend;
        var s0 = edgePoint(a, cx, cy), s1 = edgePoint(b, cx, cy);
        s0 = tuck(s0, [cx, cy]); s1 = tuck(s1, [cx, cy]);
        // re-aim the control point so the curve keeps its bend between the new ends
        var ccx = (s0[0] + s1[0]) / 2 + (cx - mx), ccy = (s0[1] + s1[1]) / 2 + (cy - my);
        roads.push('M' + f1(s0[0]) + ' ' + f1(s0[1]) + 'Q' + f1(ccx) + ' ' + f1(ccy) + ' ' + f1(s1[0]) + ' ' + f1(s1[1]));
      });
    });
    var fp = edgePoint('farpass', CAMP[0], CAMP[1]);
    cache.sky = out;
    cache.roads = roads;
    cache.campRoad = 'M' + f1(fp[0]) + ' ' + f1(fp[1]) + 'Q' + f1(CAMP[0] + 6) + ' ' + f1((fp[1] + CAMP[1]) / 2) + ' ' + CAMP[0] + ' ' + (CAMP[1] - 10);
    return cache;
  }
  // roads: an ink cut with a paper groove; on the painting a little thinner, with a soft paper halo
  function roads(painted) {
    var b = base(), out = '';
    b.roads.forEach(function (d) {
      out += painted ?
        '<path d="' + d + '" stroke="' + P.paper + '" stroke-opacity="0.55" stroke-width="8.5" fill="none" stroke-linecap="round"/>' +
        '<path d="' + d + '" stroke="' + P.ink + '" stroke-width="5.6" fill="none" stroke-linecap="round"/>' +
        '<path d="' + d + '" stroke="' + P.paper + '" stroke-width="2" fill="none" stroke-dasharray="6 5" stroke-linecap="round"/>' :
        '<path d="' + d + '" stroke="' + P.ink + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<path d="' + d + '" stroke="' + P.paper + '" stroke-width="2.4" fill="none" stroke-dasharray="7 5" stroke-linecap="round"/>';
    });
    // the camp road beside the Far Pass
    out += painted ?
      '<path d="' + b.campRoad + '" stroke="' + P.paper + '" stroke-opacity="0.6" stroke-width="5" fill="none"/><path d="' + b.campRoad + '" stroke="' + P.ink + '" stroke-width="2.6" fill="none" stroke-dasharray="3 5"/>' :
      '<path d="' + b.campRoad + '" stroke="' + P.ink + '" stroke-width="3" fill="none" stroke-dasharray="3 5"/>';
    return out;
  }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // the painted markers (art/ui-marker-*.png, made by tools/prep-markers.py): a carved squad of three soldiers for a
  // warband, a silver coin for an unbuilt site, a card back for a resident slot. The squad and the card are tinted in the SVG, so the
  // house colours can change: one shared filter per colour turns the art to its brightness and multiplies that by
  // the colour, so the grain and bevels still show.
  var MARK = { troops: 'art/ui-marker-troops.png', coin: 'art/ui-marker-coin.png', card: 'art/ui-marker-card.png' };
  var tints = {};   // colour -> filter id, filled while the map is drawn and written into its <defs>
  function tint(col) {
    var id = 'wr-tint-' + col.replace('#', '');
    tints[col] = id;
    return 'url(#' + id + ')';
  }
  function tintDefs() {
    var out = '';
    Object.keys(tints).forEach(function (col) {
      var n = parseInt(col.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255], m = '';
      c.forEach(function (v) { var k = v / 255; m += f1(k * 0.299 * 1000) / 1000 + ' ' + f1(k * 0.587 * 1000) / 1000 + ' ' + f1(k * 0.114 * 1000) / 1000 + ' 0 0 '; });
      out += '<filter id="' + tints[col] + '" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1"><feColorMatrix type="matrix" values="' + m + '0 0 0 1 0"/></filter>';
    });
    return out ? '<defs>' + out + '</defs>' : '';
  }
  // a warband counter: the carved squad tinted to its house, 30 x 22.5 centred on x, y, with the count printed in ink
  // on the middle soldier's plain chest (whose centre is 0.3 right of and 2.4 below the piece's)
  // (a count of 10 or more is set a size smaller, so both digits fit on the chest)
  function counter(x, y, col, n, cls) {
    var two = String(n).length > 1;
    return '<g class="' + (cls || 'band') + '"><image href="' + MARK.troops + '" x="' + f1(x - 15) + '" y="' + f1(y - 11.25) + '" width="30" height="22.5" filter="' + tint(col) + '"/>' +
      '<text x="' + f1(x + 0.3) + '" y="' + f1(y + (two ? 6 : 6.6)) + '" text-anchor="middle" class="cnt' + (two ? ' n2' : '') + '">' + n + '</text></g>';
  }
  function stampAt(h, x, y, size) {
    var url = A.paintedUrl('house-' + h);
    if (url) {   // the painted banner, bottom-aligned in the drawn stamp's 40 x 44 box
      var w = size * A.bannerScale(h), ht = size * 1.24;
      return '<image href="' + url + '" x="' + f1(x - w / 2) + '" y="' + f1(y - size * 0.55 + size * 1.1 - ht) + '" width="' + f1(w) + '" height="' + f1(ht) + '" preserveAspectRatio="xMidYMax meet"/>';
    }
    return '<g transform="translate(' + f1(x - size / 2) + ' ' + f1(y - size * 0.55) + ') scale(' + f1(size / 40) + ')">' +
      A.stamp(h, 40).replace(/<svg[^>]*>|<\/svg>/g, '') + '</g>';
  }

  var WORK_DX = -2, WORK_DY = 0, WORK_R = 9.5;   // a great work's badge, from the region's centre
  function region(s, r, view, painted, avoid) {
    var g = s.regions[r], p = POS[r], cx = p[0], cy = p[1], rad = p[2], b = base(), shape = b.shapes[r];
    var owner = g.owner, fill = owner ? A.houseCol(owner) : P.bone, out = '<g class="region" data-region="' + r + '">';
    if (painted) {
      // over the painting the land shows through: a held region gets a wash and a line in its holder's colour,
      // an unheld one only a dashed ink line (on a faint paper halo, so it reads over the dark wood)
      // the holder's line lies on a paper inline inside an ink edge, so dark peat and green moss read on any ground
      if (owner) out += '<path d="' + shape + '" fill="' + fill + '" fill-opacity="' + WASH + '"/>' +
        '<path d="' + shape + '" fill="none" stroke="' + P.ink + '" stroke-width="9" stroke-linejoin="round"/>' +
        '<path d="' + shape + '" fill="none" stroke="' + P.paper + '" stroke-width="6.4" stroke-linejoin="round"/>' +
        '<path d="' + shape + '" fill="none" stroke="' + fill + '" stroke-width="3.8" stroke-linejoin="round"/>';
      else out += '<path d="' + shape + '" fill="none" stroke="' + P.paper + '" stroke-opacity="0.6" stroke-width="5" stroke-linejoin="round"/>' +
        '<path d="' + shape + '" fill="none" stroke="' + P.ink + '" stroke-width="2.4" stroke-dasharray="9 5" stroke-linejoin="round"/>';
    } else {
      // colour block, nudged off the key block
      out += '<path d="' + shape + '" fill="' + fill + '" transform="translate(2.4 1.8)"/>';
      out += owner ? A.gouges(cx, cy, rad, A.hash(r), 7, P.paper, 1.8) : A.gouges(cx, cy, rad, A.hash(r), 6, P.ink, 1.3);
      out += '<path d="' + shape + '" fill="none" stroke="' + P.ink + '" stroke-width="3.6" stroke-linejoin="round"/>';
    }
    if (view.selected === r) out += '<path d="' + shape + '" class="sel" fill="none" stroke="' + P.ochre + '" stroke-width="5" stroke-dasharray="10 5"/>';
    if (view.picks && view.picks.indexOf(r) >= 0) out += '<path d="' + shape + '" class="pick" fill="none" stroke="' + P.rust + '" stroke-width="5" stroke-dasharray="8 6"/>';
    if (view.flash && (view.flash.region === r || view.flash.to === r)) out += '<path d="' + shape + '" class="flash" fill="none" stroke="' + P.ink + '" stroke-width="7"/>';
    // name cartouche
    var nm = D.REGION[r].name, tw = nm.length * 6.2 + 12, ny = cy - Math.max(rad * 0.66, 32);   // as labelBox
    out += '<rect x="' + f1(cx - tw / 2 + 1.5) + '" y="' + f1(ny - 9) + '" width="' + f1(tw) + '" height="17" fill="' + P.ink + '"/>' +
      '<rect x="' + f1(cx - tw / 2) + '" y="' + f1(ny - 10.5) + '" width="' + f1(tw) + '" height="17" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.6"/>' +
      '<text x="' + cx + '" y="' + f1(ny + 2.2) + '" text-anchor="middle" class="rname">' + esc(nm) + '</text>';
    // warbands: every house present, then free folk, each squad on its own spot inside the region; they stand
    // under the region's markers, so in a crowded region a squad tucks behind a stamp rather than hiding it
    bands(s, r, painted, avoid || clearOf(s, view, painted)).forEach(function (c) { out += counter(c.x, c.y, c.col, c.n, c.folk ? 'folk' : 'band'); });
    // site glyph in a paper roundel, residents as little suit cards
    var sx = cx - 15, sy = cy - 14;
    var stampUrl = painted && A.paintedUrl && A.paintedUrl('stamp-' + r);
    if (E.siteOn(s, r) && stampUrl) {
      // the painted structure on a paper oval, so it reads on the busy board: it fills the space left of the
      // resident chip, under the name and above the holder stamp
      out += '<ellipse cx="' + (cx - 22) + '" cy="' + (cy - 10) + '" rx="21" ry="14" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.2"/>' +
        '<image href="' + stampUrl + '" x="' + (cx - 42) + '" y="' + (cy - 25) + '" width="40" height="30" preserveAspectRatio="xMidYMid meet"/>';
    } else if (E.siteOn(s, r)) {
      out += '<circle cx="' + sx + '" cy="' + sy + '" r="12.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="2"/>' +
        '<g transform="translate(' + (sx - 9) + ' ' + (sy - 9) + ')">' + A.siteGlyph(r, 18).replace(/<svg[^>]*>/, '<svg x="0" y="0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + P.ink + '">') + '</g>';
    } else {
      // an unbuilt site: a silver coin with its build cost
      out += '<g class="unbuilt"><image href="' + MARK.coin + '" x="' + (sx - 14) + '" y="' + (sy - 14) + '" width="28" height="28"/>' +
        '<text x="' + sx + '" y="' + f1(sy + 4.2) + '" text-anchor="middle" class="cost">' + E.buildCost(r) + 's</text></g>';
    }
    var slots = E.slotsOf(s, r);
    // on the painting the resident slots sit on a paper chip
    if (painted && slots) out += '<rect x="' + (cx - 1) + '" y="' + (sy - 12) + '" width="' + (slots * 13 + 4) + '" height="22" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.2"/>';
    // each slot a card back: tinted to its resident's suit, or faded when the slot is free
    for (var i = 0; i < slots; i++) {
      var id = g.residents[i], x = cx + 1.5 + i * 13, y = sy - 10;
      out += '<image href="' + MARK.card + '" x="' + x + '" y="' + y + '" width="11" height="16" preserveAspectRatio="none"' +
        (id ? ' filter="' + tint(A.suitCol(A.cardSuit(id))) + '"' : ' opacity="0.35"') + '/>';
    }
    // a great work: a small ochre badge on the lower right of the site marker
    var wk = E.workAt(s, r);
    if (wk) {
      var wx = cx + WORK_DX, wy = cy + WORK_DY, wUrl = A.paintedUrl && A.paintedUrl('work-' + wk);
      out += '<g class="work"><circle cx="' + wx + '" cy="' + wy + '" r="' + WORK_R + '" fill="' + P.ochre + '" stroke="' + P.ink + '" stroke-width="1.8"/>' +
        (wUrl ? '<image href="' + wUrl + '" x="' + (wx - 8) + '" y="' + (wy - 8) + '" width="16" height="16" preserveAspectRatio="xMidYMid meet"/>' :
          '<g transform="translate(' + (wx - 7) + ' ' + (wy - 7) + ')">' + A.workGlyph(wk, 14).replace(/<svg[^>]*>/, '<svg x="0" y="0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + P.ink + '">') + '</g>') +
        '</g>';
    }
    // holder stamp, shelter mark
    if (owner) out += stampAt(owner, cx - 22, cy + 16, 22);
    if (owner && g.dug === owner) out += dugMark(owner, cx - 38, cy + 15);
    if (owner && s.houses[owner] && s.houses[owner].refuge === r) {
      out += '<g class="safe"><rect x="' + (cx - 38) + '" y="' + (cy + 28) + '" width="34" height="13" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.4"/>' +
        '<text x="' + (cx - 21) + '" y="' + (cy + 37.6) + '" text-anchor="middle" class="tiny">safe</text></g>';
    }
    // a large invisible tap target
    out += '<path d="' + shape + '" fill="transparent" class="hit"/>';
    return out + '</g>';
  }

  // ---------------------------------------------------------------- where the warband squads stand
  // Each squad gets a spot inside its region, clear of the outline, the name chips, the site and resident
  // markers, the holder's stamp, the camp, and every plan arrow and marker drawn over the map. Spots are
  // tried on a 2-unit grid and scored; the holder's squad picks first. A spot near the old two-to-a-row
  // layout scores best, so a roomy region looks as it always did. When a small region runs out of room,
  // squads overlap each other a little, but not over another squad's count.
  var SQ_W = 29, SQ_H = 21.5;   // the squad's picture is 30 x 22.5; its edges are soft
  var INSET = 4.5;            // how far squads keep inside the outline, clear of the painted border
  // what each fault costs a spot, per unit (of a rim point's depth short of INSET, of a plan's reach into the
  // squad) or per square unit of overlap (with a marker or name chip, with an earlier squad, with its count).
  // Every unit away from the squad's usual spot costs 1.
  var W_EDGE = 600, W_PLAN = 400, W_BOX = 12, W_STACK = 1, W_COUNT = 150;
  // signed distance to a region's outline (positive inside), on a 2-unit grid over the blob, built once
  function field(r) {
    var b = base();
    if (b.field[r]) return b.field[r];
    var pts = b.pts[r], n = pts.length, poly = [], i, k;
    for (i = 0; i < n; i++) {   // the outline as A.smooth draws it: a cubic between each pair of points
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (k = 0; k < 8; k++) {
        var t = k / 8, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
        poly.push([w0 * p1[0] + w1 * c1[0] + w2 * c2[0] + w3 * p2[0], w0 * p1[1] + w1 * c1[1] + w2 * c2[1] + w3 * p2[1]]);
      }
    }
    var bb = [1e9, 1e9, -1e9, -1e9];
    poly.forEach(function (q) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.min(bb[1], q[1]); bb[2] = Math.max(bb[2], q[0]); bb[3] = Math.max(bb[3], q[1]); });
    var st = 2, x0 = bb[0] - 4, y0 = bb[1] - 4, nx = Math.ceil((bb[2] - bb[0] + 8) / st) + 1, ny = Math.ceil((bb[3] - bb[1] + 8) / st) + 1;
    var d = new Float32Array(nx * ny), m = poly.length;
    for (var gy = 0; gy < ny; gy++) for (var gx = 0; gx < nx; gx++) {
      var x = x0 + gx * st, y = y0 + gy * st, inside = false, best = 1e9;
      for (i = 0, k = m - 1; i < m; k = i++) {
        var a = poly[k], c = poly[i];
        if ((c[1] > y) !== (a[1] > y) && x < (a[0] - c[0]) * (y - c[1]) / (a[1] - c[1]) + c[0]) inside = !inside;
        var ex = c[0] - a[0], ey = c[1] - a[1], l2 = ex * ex + ey * ey, tt = l2 ? ((x - a[0]) * ex + (y - a[1]) * ey) / l2 : 0;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        var dx = x - a[0] - ex * tt, dy = y - a[1] - ey * tt, dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      d[gy * nx + gx] = (inside ? 1 : -1) * Math.sqrt(best);
    }
    return (b.field[r] = { x0: x0, y0: y0, st: st, nx: nx, ny: ny, d: d, box: bb });
  }
  function depth(f, x, y) {   // how far (x, y) lies inside the outline; off the grid counts as well outside
    var gx = (x - f.x0) / f.st, gy = (y - f.y0) / f.st, i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= f.nx - 1 || j >= f.ny - 1) return -20;
    var fx = gx - i, fy = gy - j, d = f.d, k = j * f.nx + i;
    return (d[k] * (1 - fx) + d[k + 1] * fx) * (1 - fy) + (d[k + f.nx] * (1 - fx) + d[k + f.nx + 1] * fx) * fy;
  }
  function overlap(a, b) {
    var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return w > 0 && h > 0 ? w * h : 0;
  }
  // the printed count on a squad at x, y
  function cntBox(x, y, n) { var hw = String(n).length > 1 ? 6.5 : 4; return [x + 0.3 - hw, y - 2.5, x + 0.3 + hw, y + 7.5]; }

  // what is drawn over or across the regions, for squads to keep clear of: boxes [l, t, r, b] and circles [x, y, radius]
  function clearOf(s, view, painted) {
    var boxes = [], circles = [];
    D.REGION_IDS.forEach(function (r) { boxes.push(labelBox(r).concat(4)); });   // (a squad must never hide a name)
    // the camp: each tent with its squad above right, and the 'camp' label left of them
    var tn = tents(s);
    tn.forEach(function (t) { boxes.push([t.x - 15, t.y - 26, t.x + 30, t.y + 11]); });
    if (tn.length) { var lx = CAMP[0] - (tn.length - 1) * CAMP_GAP - 22; boxes.push([lx - 31, CAMP[1] - 7, lx + 3, CAMP[1] + 6]); }
    // the plans: each arrow as a string of circles along its shaft, its head, and the house stamp and count
    // bubble on it; each marker as its roundel
    var hw = (painted ? 4.5 + 7 : 4.5 + 3.4) / 2 + 1;
    (view.intents || []).forEach(function (x) {
      var it = x.intent, at = null, from = null, to = null;
      if (!it) return;
      switch (it.type) {
        case 'assault': case 'march': from = it.from; to = it.to; break;
        case 'poach': if (it.from && it.from !== it.region) { from = it.region; to = it.from; } else at = it.region; break;
        case 'depart': at = 'farpass'; break;
        case 'muster': case 'search': case 'return': at = it.region; break;
      }
      if (at) { var m = markerAt(at, x.second); if (m) circles.push([m[0] + 0.7, m[1] + 0.6, 13]); return; }
      var ag = from && arrowGeom(from, to, false);
      if (!ag) return;
      var c = ag.c;
      for (var t = 0; t <= 1.001; t += 0.05) { var q = qpt(c, t); circles.push([q[0], q[1], hw]); }
      var tx = c[4] - c[2], ty = c[5] - c[3], tl = Math.sqrt(tx * tx + ty * ty) || 1;
      circles.push([c[4] - tx / tl * ag.s * 0.4, c[5] - ty / tl * ag.s * 0.4, ag.s * 0.9]);
      circles.push([ag.mx, ag.my - 1, 12]);
      circles.push([ag.mx + 11, ag.my + 7, 9]);
      if (it.revised) circles.push([ag.mx - 12, ag.my - 12, 9]);
    });
    return { boxes: boxes, circles: circles };
  }

  // the squads in region r, in drawing order: [{ x, y, n, col, folk }]
  var laid = {};   // layouts already worked out, by everything they depend on
  function bands(s, r, painted, avoid) {
    var g = s.regions[r], p = POS[r], cx = p[0], cy = p[1], owner = g.owner, fill = owner ? A.houseCol(owner) : P.bone;
    var cs = [];
    Object.keys(g.bands).forEach(function (h) { if (g.bands[h] > 0) cs.push({ col: A.houseCol(h), n: g.bands[h] }); });
    cs.sort(function (a, b2) { return (a.col === fill ? -1 : 0) - (b2.col === fill ? -1 : 0); });
    if (!owner && g.folk > 0) cs.push({ col: P.bone, n: g.folk, folk: true });
    if (!cs.length) return cs;
    // this region's own markers, as region() draws them
    var sx = cx - 15, sy = cy - 14, slots = E.slotsOf(s, r), own = [];
    if (E.siteOn(s, r) && painted && A.paintedUrl && A.paintedUrl('stamp-' + r)) own.push([cx - 43, cy - 24, cx - 1, cy + 4]);
    else own.push([sx - 14, sy - 14, sx + 14, sy + 14]);
    if (slots) own.push([cx - 1, sy - 12, cx + 3 + slots * 13, sy + 10, 0.25]);   // (a squad may cover a resident slot sooner than a stamp)
    if (E.workAt(s, r)) own.push([cx + WORK_DX - WORK_R, cy + WORK_DY - WORK_R, cx + WORK_DX + WORK_R, cy + WORK_DY + WORK_R]);
    if (owner) {
      var bw = 22 * (A.paintedUrl && A.paintedUrl('house-' + owner) ? A.bannerScale(owner) : 1);
      own.push([cx - 22 - bw / 2, cy + 1, cx - 22 + bw / 2, cy + 28]);
      if (g.dug === owner) own.push([cx - 47, cy + 6, cx - 29, cy + 24]);
      if (s.houses[owner] && s.houses[owner].refuge === r) own.push([cx - 38, cy + 28, cx - 4, cy + 41]);
    }
    var f = field(r), bb = f.box, near = [bb[0] - 20, bb[1] - 20, bb[2] + 20, bb[3] + 20];
    var boxes = own.concat(avoid.boxes.filter(function (b) { return overlap(b, near) > 0; }));
    var circles = avoid.circles.filter(function (c) { return c[0] > near[0] && c[0] < near[2] && c[1] > near[1] && c[1] < near[3]; });
    var key = r + '|' + JSON.stringify([cs.map(function (c) { return c.n; }), boxes, circles]);
    if (laid[key]) return laid[key].map(function (q, k) { cs[k].x = q[0]; cs[k].y = q[1]; return cs[k]; });

    var hw = SQ_W / 2, hh = SQ_H / 2;
    var rim = [];   // twelve points round the squad's edge, as offsets from its centre
    [-1, -1 / 3, 1 / 3, 1].forEach(function (u) { rim.push([u * hw, -hh], [u * hw, hh]); });
    rim.push([-hw, -hh / 3], [-hw, hh / 3], [hw, -hh / 3], [hw, hh / 3]);
    function ideal(k) { return [cx + 16 + (k % 2) * 31, cy + 13 + Math.floor(k / 2) * 24]; }
    // what squad k costs at x, y, given the squads already placed; stops early once over 'cap'
    function cost(k, x, y, placed, cap) {
      var id = ideal(k), c = Math.sqrt((x - id[0]) * (x - id[0]) + (y - id[1]) * (y - id[1])), i, e;
      if (depth(f, x, y) < hh) return 1e9;
      for (i = 0; i < rim.length; i++) { e = INSET - depth(f, x + rim[i][0], y + rim[i][1]); if (e > 0) c += e * (1 + e) * W_EDGE; }
      if (c >= cap) return c;
      var box = [x - hw, y - hh, x + hw, y + hh];
      var cb = cntBox(x, y, cs[k].n);
      for (i = 0; i < boxes.length; i++) c += overlap(box, boxes[i]) * W_BOX * (boxes[i][4] || 1) + overlap(cb, boxes[i]) * W_COUNT;
      for (i = 0; i < circles.length; i++) {
        var q = circles[i], dx = Math.max(box[0] - q[0], 0, q[0] - box[2]), dy = Math.max(box[1] - q[1], 0, q[1] - box[3]);
        e = q[2] - Math.sqrt(dx * dx + dy * dy);
        if (e > 0) c += e * W_PLAN;
        dx = Math.max(cb[0] - q[0], 0, q[0] - cb[2]); dy = Math.max(cb[1] - q[1], 0, q[1] - cb[3]);   // and worse over its count
        e = q[2] - Math.sqrt(dx * dx + dy * dy);
        if (e > 0) c += e * W_EDGE;
      }
      for (i = 0; i < placed.length; i++) c += overlap(box, placed[i].box) * W_STACK + overlap(box, placed[i].cnt) * W_COUNT;
      return c;
    }
    function place(placed, k, x, y) { placed.push({ x: x, y: y, box: [x - hw, y - hh, x + hw, y + hh], cnt: cntBox(x, y, cs[k].n) }); }
    var x0 = Math.ceil(bb[0]) + hw, x1 = bb[2] - hw, y0 = Math.ceil(bb[1]) + hh, y1 = bb[3] - hh, x, y;

    // first, each squad in turn takes the best spot left
    var best = { placed: [], cost: 0 };
    cs.forEach(function (c, k) {
      var top = null;
      for (y = y0; y <= y1; y += 2) for (x = x0; x <= x1; x += 2) {
        var v = cost(k, x, y, best.placed, top ? top[0] : 1e9);
        if (!top || v < top[0]) top = [v, x, y];
      }
      if (!top || top[0] >= 1e9) top = [0].concat(ideal(k));
      best.cost += top[0];
      place(best.placed, k, top[1], top[2]);
    });
    // in a crowded region, a tidy block often does better: two to a row, the rows closed up and stacked
    // upward (each row in front of the heads of the row below it, clear of its counts), tried at every spot
    if (cs.length > 2) {
      [[31, 24], [26, 22], [21, 22], [26, 15], [21, 15], [19, 13]].forEach(function (sp) {
        [1, -1].forEach(function (side) {
          for (y = y0; y <= y1 + 30; y += 3) for (x = x0 - 30; x <= x1 + 30; x += 3) {
            var placed = [], tot = 0;
            for (var k = 0; k < cs.length && tot < best.cost; k++) {
              var px = x + side * (k % 2) * sp[0], py = y - Math.floor(k / 2) * sp[1];
              tot += cost(k, px, py, placed, best.cost - tot);
              place(placed, k, px, py);
            }
            if (k === cs.length && tot < best.cost) best = { placed: placed, cost: tot };
          }
        });
      });
    }
    laid[key] = best.placed.map(function (q) { return [q.x, q.y]; });
    best.placed.forEach(function (q, k) { cs[k].x = q.x; cs[k].y = q.y; });
    return cs;
  }

  // the tents in camp, right to left in seat order: [{ h, n, x, y }]
  function tents(s) {
    var out = [];
    s.order.forEach(function (h) {
      var n = s.houses[h].camp || 0;
      if (n) out.push({ h: h, n: n, x: CAMP[0] - out.length * CAMP_GAP, y: CAMP[1] });
    });
    return out;
  }
  function camp(s, view, painted) {
    var out = '', k = 0;
    tents(s).forEach(function (tn) {
      var h = tn.h, n = tn.n, x = tn.x, y = tn.y;
      out += '<g class="camp" data-region="camp"><path d="M' + (x - 14) + ' ' + (y + 10) + 'L' + x + ' ' + (y - 14) + 'L' + (x + 14) + ' ' + (y + 10) + 'Z" fill="' + A.houseCol(h) + '" transform="translate(1.6 1.2)"/>' +
        '<path d="M' + (x - 14) + ' ' + (y + 10) + 'L' + x + ' ' + (y - 14) + 'L' + (x + 14) + ' ' + (y + 10) + 'ZM' + x + ' ' + (y - 14) + 'V' + (y + 10) + '" fill="none" stroke="' + P.ink + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<rect x="' + (x - 20) + '" y="' + (y - 20) + '" width="40" height="40" fill="transparent"/>' +
        counter(x + 14, y - 14, A.houseCol(h), n) + '</g>';
      k++;
    });
    if (out || (view.picks && view.picks.indexOf('camp') >= 0)) {
      // the label sits left of the leftmost tent (or of the pick ring), level with the tents
      var lx = CAMP[0] - Math.max(k - 1, 0) * CAMP_GAP - 22, ly = CAMP[1];
      out = (painted ? '<rect x="' + (lx - 31) + '" y="' + (ly - 7) + '" width="34" height="13" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.2"/>' : '') +
        '<text x="' + lx + '" y="' + (ly + 2.5) + '" text-anchor="end" class="tiny">camp</text>' + out;
      if (view.picks && view.picks.indexOf('camp') >= 0)
        out += '<g data-region="camp"><circle cx="' + CAMP[0] + '" cy="' + CAMP[1] + '" r="20" fill="' + P.paper + '" stroke="' + P.rust + '" stroke-width="4" stroke-dasharray="6 5" class="pick"/>' +
          '<text x="' + CAMP[0] + '" y="' + (CAMP[1] + 4) + '" text-anchor="middle" class="tiny">camp</text></g>';
    }
    return out;
  }

  function qpt(c, t) {   // a point on the quadratic c = [x1, y1, cx, cy, x2, y2]
    var u = 1 - t;
    return [u * u * c[0] + 2 * u * t * c[2] + t * t * c[4], u * u * c[1] + 2 * u * t * c[3] + t * t * c[5]];
  }
  // the arrow's course from p to q: it leaves half a radius out of p and ends half a radius into q, both points
  // turned off the straight line, and bent, when that keeps the shaft and head off the name chips;
  // straight-on and a gentle bend are preferred
  function course(p, q, hs) {
    var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len, best = null;
    var out = Math.atan2(uy, ux), back = Math.atan2(-uy, -ux), R = Math.PI / 180;
    [0, 40, -40, 80, -80].forEach(function (d1) {
      var x1 = p[0] + Math.cos(out + d1 * R) * p[2] * 0.45, y1 = p[1] + Math.sin(out + d1 * R) * p[2] * 0.45;
      [0, 30, -30, 60, -60, 90, -90, 120, -120].forEach(function (deg) {
        var x2 = q[0] + Math.cos(back + deg * R) * q[2] * 0.5, y2 = q[1] + Math.sin(back + deg * R) * q[2] * 0.5;
        var ex = x2 - x1, ey = y2 - y1, el = Math.sqrt(ex * ex + ey * ey);
        [16, -16, 30, -30, 48, -48, 70, -70].forEach(function (bend) {
          var c = [x1, y1, (x1 + x2) / 2 - ey / el * bend, (y1 + y2) / 2 + ex / el * bend, x2, y2], hits = 0;
          for (var t = 0.04; t <= 1.001; t += 0.04) { var m = qpt(c, t); if (labelHits(m[0], m[1], 3)) hits++; }
          var tx = x2 - c[2], ty = y2 - c[3], tl = Math.sqrt(tx * tx + ty * ty);
          if (labelHits(x2 + tx / tl * 4, y2 + ty / tl * 4, 2) || labelHits(x2 - tx / tl * hs, y2 - ty / tl * hs, 2)) hits += 3;
          var score = hits * 10 + Math.abs(d1) / 40 + Math.abs(deg) / 30 + (Math.abs(bend) === 16 ? 0 : Math.abs(bend) / 30) + (bend < 0 ? 0.2 : 0);
          if (!best || score < best.score) best = { score: score, c: c };
        });
      });
    });
    return best.c;
  }
  // an arrow's fixed geometry: its course c, head size s, and the spot mx, my on it for the house stamp.
  // The board never moves, so each is worked out once.
  var courses = {};
  function arrowGeom(from, to, wide) {
    var p = from === 'camp' ? [CAMP[0], CAMP[1], 10] : POS[from], q = POS[to];
    if (!p || !q) return null;
    var s = wide ? 13 : 10, key = from + '>' + to + ':' + s;
    if (courses[key]) return courses[key];
    var c = course(p, q, s), mx, my;
    // the house stamp sits on the curve with the count bubble below right of it: slide both along the curve
    // to the first spot where neither touches a name chip
    [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18].some(function (t, i) {
      var m = qpt(c, t);
      var clear = !labelHits(m[0], m[1], 10) && !labelHits(m[0] + 11, m[1] + 7, 8.5) && !labelHits(m[0] - 12, m[1] - 12, 8);
      if (clear || i === 0) { mx = m[0]; my = m[1]; }
      return clear;
    });
    return (courses[key] = { c: c, s: s, mx: mx, my: my });
  }
  // an arrow cut from one region toward another, in a house colour
  function arrow(from, to, col, dashed, label, h, wide, revised) {
    var ag = arrowGeom(from, to, wide);
    if (!ag) return '';
    var s = ag.s, c = ag.c, x1 = c[0], y1 = c[1], cx = c[2], cy = c[3], x2 = c[4], y2 = c[5], mx = ag.mx, my = ag.my;
    // arrow head along the last segment
    var tx = x2 - cx, ty = y2 - cy, tl = Math.sqrt(tx * tx + ty * ty), hx = tx / tl, hy = ty / tl;
    var head = 'M' + f1(x2 + hx * 4) + ' ' + f1(y2 + hy * 4) + 'L' + f1(x2 - hx * s - hy * s * 0.7) + ' ' + f1(y2 - hy * s + hx * s * 0.7) +
      'L' + f1(x2 - hx * s + hy * s * 0.7) + ' ' + f1(y2 - hy * s - hx * s * 0.7) + 'Z';
    var d = 'M' + f1(x1) + ' ' + f1(y1) + 'Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(x2) + ' ' + f1(y2);
    var w = wide ? 6 : 4.5;
    var out = '<g class="arrow' + (wide ? ' live' : '') + '">' +
      (onBoard ? '<path d="' + d + '" stroke="' + P.paper + '" stroke-opacity="0.7" stroke-width="' + (w + 7) + '" fill="none" stroke-linecap="round"/>' : '') +
      '<path d="' + d + '" stroke="' + P.ink + '" stroke-width="' + (w + 3.4) + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="' + (typeof dashed === 'string' ? dashed : '10 7') + '"' : '') + '/>' +
      '<path d="' + d + '" stroke="' + col + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="' + (typeof dashed === 'string' ? dashed : '10 7') + '"' : '') + '/>' +
      '<path d="' + head + '" fill="' + col + '" stroke="' + P.ink + '" stroke-width="2" stroke-linejoin="round"/>';
    if (h) out += stampAt(h, mx, my, 16);
    if (label != null) out += '<circle cx="' + f1(mx + 11) + '" cy="' + f1(my + 7) + '" r="7.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.6"/><text x="' + f1(mx + 11) + '" y="' + f1(my + 10.6) + '" text-anchor="middle" class="tiny b">' + label + '</text>';
    if (revised) out += newPlan(mx - 12, my - 12);
    return out + '</g>';
  }
  // dug in: a small shield in the holder's colour with '+1', on the corner of the holder stamp
  function dugMark(h, x, y) {
    var col = A.houseCol(h);
    function shield(dx, dy) {
      var l = x - 8 + dx, rt = x + 8 + dx, top = y - 9 + dy, mid = y - 1 + dy, bot = y + 9 + dy, c = x + dx;
      return 'M' + f1(l) + ' ' + f1(top) + 'H' + f1(rt) + 'V' + f1(mid) + 'Q' + f1(rt) + ' ' + f1(y + 6 + dy) + ' ' + f1(c) + ' ' + f1(bot) +
        'Q' + f1(l) + ' ' + f1(y + 6 + dy) + ' ' + f1(l) + ' ' + f1(mid) + 'Z';
    }
    return '<g class="dug"><title>Dug in: +1 defence</title><path d="' + shield(1.4, 1.2) + '" fill="' + col + '"/>' +
      '<path d="' + shield(0, 0) + '" fill="none" stroke="' + P.ink + '" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<text x="' + f1(x + 0.7) + '" y="' + f1(y + 3) + '" text-anchor="middle" class="dk" fill="' + A.textOn(col) + '">+1</text></g>';
  }
  // a small '!' tag on an intent its house has just changed
  function newPlan(x, y) {
    return '<g class="newplan"><title>New plan</title><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="7.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.8"/>' +
      '<text x="' + f1(x) + '" y="' + f1(y + 4) + '" text-anchor="middle" class="tiny b">!</text></g>';
  }
  // a marker for an intent that stays in one region (muster, search, return, depart)
  function markerAt(r, second) {
    var p = r === 'camp' ? [CAMP[0], CAMP[1], 14] : POS[r];
    return p ? [p[0] + p[2] * 0.62, p[1] - p[2] * 0.25 + (second ? 20 * second : 0)] : null;
  }
  function marker(r, h, glyph, second, revised) {
    var at = markerAt(r, second);
    if (!at) return '';
    var x = at[0], y = at[1];
    return '<g class="mark"><circle cx="' + f1(x + 1.4) + '" cy="' + f1(y + 1.2) + '" r="11" fill="' + A.houseCol(h) + '"/>' +
      '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="11" fill="none" stroke="' + P.ink + '" stroke-width="2"' + (second ? ' stroke-dasharray="4 3"' : '') + '/>' +
      '<text x="' + f1(x) + '" y="' + f1(y + 4.5) + '" text-anchor="middle" class="mk" fill="' + A.textOn(A.houseCol(h)) + '">' + glyph + '</text>' +
      (revised ? newPlan(x + 11, y - 10) : '') + '</g>';
  }
  // a later move (a second move, or one the Owl shows) is drawn dashed and dimmer
  function intentMark(s, h, it, second) {
    var m = intentMark1(s, h, it, second);
    return m && second ? '<g class="later" opacity="0.6"><title>After that</title>' + m + '</g>' : m;
  }
  function intentMark1(s, h, it, second) {
    if (!it) return '';
    var col = A.houseCol(h), rv = !!it.revised;
    switch (it.type) {
      case 'assault': return arrow(it.from, it.to, col, second, it.count, h, false, rv);
      case 'march': return arrow(it.from, it.to, col, true, it.count, h, false, rv);
      case 'muster': return marker(it.region, h, '+', second, rv);
      case 'search': return marker(it.region, h, '?', second, rv);
      case 'return': return marker(it.region, h, '↵', second, rv);
      case 'depart': return marker('farpass', h, '↑', second, rv);
      // a poach: a dotted line carrying the resident out of the region toward the taker's warbands
      case 'poach': return it.from && it.from !== it.region ? arrow(it.region, it.from, col, '2 7', null, h, false, rv) : marker(it.region, h, '−', second, rv);
    }
    return '';
  }

  function svg(s, view) {
    view = view || {};
    var b = base(), board = boardUrl();
    onBoard = !!board;
    tints = {};
    var out = '<svg class="map' + (board ? ' painted' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The valley">';
    if (board) out += '<image href="' + board + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice"/>' + roads(true);
    else out += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + P.paper + '"/>' + b.sky + roads(false);
    var avoid = clearOf(s, view, !!board);
    D.REGION_IDS.forEach(function (r) { out += region(s, r, view, !!board, avoid); });
    out += camp(s, view, !!board);
    (view.intents || []).forEach(function (x) { out += intentMark(s, x.house, x.intent, x.second); });
    var fl = view.flash;
    if (fl && fl.from && fl.to && fl.from !== fl.to) out += arrow(fl.from, fl.to, A.houseCol(fl.house), false, null, null, true);
    // carved frame
    out +='<rect x="3" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" fill="none" stroke="' + P.ink + '" stroke-width="5" rx="3"/>';
    return out + tintDefs() + '</svg>';
  }

  // every squad's spot, by region (for the tests): { region: [{ x, y, n, col, folk }] }
  function squads(s, view, painted) {
    var avoid = clearOf(s, view || {}, !!painted), out = {};
    D.REGION_IDS.forEach(function (r) { out[r] = bands(s, r, !!painted, avoid); });
    return out;
  }

  root.WR_MAP = { svg: svg, POS: POS, CAMP: CAMP, squads: squads, clearOf: clearOf,
    depth: function (r, x, y) { return depth(field(r), x, y); } };
})(typeof self !== 'undefined' ? self : this);
