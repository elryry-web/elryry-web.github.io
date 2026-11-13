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
    cache = { pts: {}, shapes: {} };
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

  function region(s, r, view, painted) {
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
    // site glyph in a paper roundel, residents as little suit cards
    var sx = cx - 15, sy = cy - 14;
    // an undeveloped site: a dashed, empty roundel with its build cost in silver
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
      out += '<g class="unbuilt"><circle cx="' + sx + '" cy="' + sy + '" r="12.5" fill="' + P.bone + '" stroke="' + P.ink + '" stroke-width="1.4" stroke-dasharray="3 3"/>' +
        '<text x="' + sx + '" y="' + f1(sy + 4) + '" text-anchor="middle" class="tiny">' + E.buildCost(r) + 's</text></g>';
    }
    var slots = E.slotsOf(s, r);
    // on the painting the resident slots sit on a paper chip
    if (painted && slots) out += '<rect x="' + (cx - 1) + '" y="' + (sy - 12) + '" width="' + (slots * 13 + 5) + '" height="21" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.2"/>';
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

  function camp(s, view, painted) {
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
      // the label sits left of the leftmost tent (or of the pick ring), level with the tents
      var lx = CAMP[0] - Math.max(k - 1, 0) * 30 - 22, ly = CAMP[1];
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
  // an arrow cut from one region toward another, in a house colour
  function arrow(from, to, col, dashed, label, h, wide, revised) {
    var p = from === 'camp' ? [CAMP[0], CAMP[1], 10] : POS[from], q = POS[to];
    if (!p || !q) return '';
    var s = wide ? 13 : 10, c = course(p, q, s), x1 = c[0], y1 = c[1], cx = c[2], cy = c[3], x2 = c[4], y2 = c[5];
    // arrow head along the last segment
    var tx = x2 - cx, ty = y2 - cy, tl = Math.sqrt(tx * tx + ty * ty), hx = tx / tl, hy = ty / tl;
    var head = 'M' + f1(x2 + hx * 4) + ' ' + f1(y2 + hy * 4) + 'L' + f1(x2 - hx * s - hy * s * 0.7) + ' ' + f1(y2 - hy * s + hx * s * 0.7) +
      'L' + f1(x2 - hx * s + hy * s * 0.7) + ' ' + f1(y2 - hy * s - hx * s * 0.7) + 'Z';
    var d = 'M' + f1(x1) + ' ' + f1(y1) + 'Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(x2) + ' ' + f1(y2);
    var w = wide ? 6 : 4.5;
    var out = '<g class="arrow' + (wide ? ' live' : '') + '">' +
      (onBoard ? '<path d="' + d + '" stroke="' + P.paper + '" stroke-opacity="0.7" stroke-width="' + (w + 7) + '" fill="none" stroke-linecap="round"/>' : '') +
      '<path d="' + d + '" stroke="' + P.ink + '" stroke-width="' + (w + 3.4) + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="10 7"' : '') + '/>' +
      '<path d="' + d + '" stroke="' + col + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="10 7"' : '') + '/>' +
      '<path d="' + head + '" fill="' + col + '" stroke="' + P.ink + '" stroke-width="2" stroke-linejoin="round"/>';
    // the house stamp sits on the curve with the count bubble below right of it: slide both along the curve
    // to the first spot where neither touches a name chip
    var mx, my;
    [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18].some(function (t, i) {
      var m = qpt(c, t);
      var clear = !labelHits(m[0], m[1], 10) && !labelHits(m[0] + 11, m[1] + 7, 8.5) && !labelHits(m[0] - 12, m[1] - 12, 8);
      if (clear || i === 0) { mx = m[0]; my = m[1]; }
      return clear;
    });
    if (h) out += stampAt(h, mx, my, 16);
    if (label != null) out += '<circle cx="' + f1(mx + 11) + '" cy="' + f1(my + 7) + '" r="7.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.6"/><text x="' + f1(mx + 11) + '" y="' + f1(my + 10.6) + '" text-anchor="middle" class="tiny b">' + label + '</text>';
    if (revised) out += newPlan(mx - 12, my - 12);
    return out + '</g>';
  }
  // a small '!' tag on an intent its house has just changed
  function newPlan(x, y) {
    return '<g class="newplan"><title>New plan</title><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="7.5" fill="' + P.paper + '" stroke="' + P.ink + '" stroke-width="1.8"/>' +
      '<text x="' + f1(x) + '" y="' + f1(y + 4) + '" text-anchor="middle" class="tiny b">!</text></g>';
  }
  // a marker for an intent that stays in one region (muster, search, return, depart)
  function marker(r, h, glyph, second, revised) {
    var p = r === 'camp' ? [CAMP[0], CAMP[1], 14] : POS[r];
    if (!p) return '';
    var x = p[0] + p[2] * 0.62, y = p[1] - p[2] * 0.25 + (second ? 20 * second : 0);
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
    }
    return '';
  }

  function svg(s, view) {
    view = view || {};
    var b = base(), board = boardUrl();
    onBoard = !!board;
    var out = '<svg class="map' + (board ? ' painted' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The valley">';
    if (board) out += '<image href="' + board + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice"/>' + roads(true);
    else out += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + P.paper + '"/>' + b.sky + roads(false);
    D.REGION_IDS.forEach(function (r) { out += region(s, r, view, !!board); });
    out += camp(s, view, !!board);
    (view.intents || []).forEach(function (x) { out += intentMark(s, x.house, x.intent, x.second); });
    var fl = view.flash;
    if (fl && fl.from && fl.to && fl.from !== fl.to) out += arrow(fl.from, fl.to, A.houseCol(fl.house), false, null, null, true);
    // carved frame
    out +='<rect x="3" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" fill="none" stroke="' + P.ink + '" stroke-width="5" rx="3"/>';
    return out + '</svg>';
  }

  root.WR_MAP = { svg: svg, POS: POS, CAMP: CAMP };
})(typeof self !== 'undefined' ? self : this);
