/* Tithe & Tattle: art slots.
 *   ART.draw(ctx, slot, x, y, w, h, t, opts) draws a named slot into the box (x, y, w, h).
 *   ART.canvas(slot, w, h, opts) makes a DPR-sharp <canvas> (CSS size w×h) with the slot drawn in it;
 *     it redraws itself when a PNG for that slot arrives.
 *   ART.load(base) reads optional art/manifest.json ({"slot": "file.png"} or {"slot": {file, v}});
 *     a loaded PNG replaces the procedural drawing (fitted inside the box, centred, keeping its aspect).
 *   ART.slots() lists the slots.
 * Procedural slots (part 1):
 *   dropcap   painted initial: gold-edged square, coloured ground, white penwork, the letter, a vine tendril.
 *             opts.letter, opts.ground ('verm' | 'woad' | 'green')
 *   corner    vine-and-gold page corner. opts.at = 'tl' | 'tr' | 'bl' | 'br'
 *   seal      red wax seal (solved puzzles). opts.letter optional (default an embossed cross)
 *   flourish  rubricated line-end flourish
 * Part 2 slots:
 *   titlecap  the title page's great initial (opts.letter, default 'T')
 *   portrait  cast roundel with the initial. opts.letter, opts.ground, opts.blank (not yet met: a faint dotted ring).
 *             Any slot 'portrait-<castId>' falls back to this when the manifest has no PNG for it.
 *   map       estate map of Mardle and the abbey, portrait, aspect 1 : ART.MAP_ASPECT (1.3).
 *             ART.MAP_PLACES = [{id, label, fx, fy, re}] marker positions in fractions; a PNG map must match them.
 *             The fractions are measured on the painted art/map.jpg (the fen map with the stone bridge, manifest v3); the procedural map shares them only roughly.
 */
(function () {
  'use strict';
  var images = {};
  var GOLD = ['#f3dc8a', '#d4a83c', '#9c7020', '#6e4c12'];
  var GROUND = { verm: ['#c4482f', '#8e2a18'], woad: ['#3c5f9e', '#233c6c'], green: ['#4e7d52', '#2c4f33'] };
  var VERM = '#b23a26';

  function goldFill(ctx, x, y, w, h) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, GOLD[0]); g.addColorStop(0.35, GOLD[1]); g.addColorStop(0.6, GOLD[0]); g.addColorStop(1, GOLD[2]);
    return g;
  }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function ivyLeaf(ctx, x, y, r, ang, fill, edge) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(r * 0.25, -r * 0.55, r * 0.15, -r * 1.0);   // tip
    ctx.quadraticCurveTo(r * 0.5, -r * 0.75, r * 0.85, -r * 0.6);    // right lobe
    ctx.quadraticCurveTo(r * 0.6, -r * 0.2, r * 0.05, 0);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.2, -r * 0.6, -r * 0.65);   // left lobe
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.7, r * 0.15, -r * 1.0);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.6, r * 0.07); ctx.stroke(); }
    ctx.restore();
  }
  function bezant(ctx, x, y, r) {
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, GOLD[0]); g.addColorStop(0.7, GOLD[1]); g.addColorStop(1, GOLD[2]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(0.5, r * 0.18); ctx.strokeStyle = 'rgba(70,45,10,0.6)'; ctx.stroke();
  }
  function spiral(ctx, cx, cy, r0, turns, dir) {
    ctx.beginPath();
    for (var k = 0; k <= 40; k++) {
      var f = k / 40, a = dir * f * turns * Math.PI * 2, r = r0 * (1 - f * 0.85);
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }

  var DRAW = {
    dropcap: function (ctx, x, y, w, h, t, o) {
      var m = Math.min(w, h) * 0.12, S = Math.min(w - m, h - m), sx = x + w - S, sy = y;
      var gr = GROUND[o.ground] || GROUND.woad;
      // shadow
      ctx.fillStyle = 'rgba(60,35,10,0.18)'; ctx.fillRect(sx + S * 0.03, sy + S * 0.04, S, S);
      // gold frame
      ctx.fillStyle = goldFill(ctx, sx, sy, S, S); ctx.fillRect(sx, sy, S, S);
      ctx.strokeStyle = 'rgba(80,50,10,0.75)'; ctx.lineWidth = Math.max(0.8, S * 0.012); ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1);
      var b = S * 0.075, ix = sx + b, iy = sy + b, iS = S - 2 * b;
      var g = ctx.createLinearGradient(ix, iy, ix, iy + iS); g.addColorStop(0, gr[0]); g.addColorStop(1, gr[1]);
      ctx.fillStyle = g; ctx.fillRect(ix, iy, iS, iS);
      ctx.strokeStyle = 'rgba(30,15,5,0.55)'; ctx.lineWidth = Math.max(0.6, S * 0.01); ctx.strokeRect(ix, iy, iS, iS);
      // white penwork: tiny curls and dots in the corners of the ground
      ctx.strokeStyle = 'rgba(255,248,230,0.55)'; ctx.lineWidth = Math.max(0.6, S * 0.012); ctx.lineCap = 'round';
      [[0.16, 0.16, 1], [0.84, 0.16, -1], [0.16, 0.84, -1], [0.84, 0.84, 1]].forEach(function (c) {
        spiral(ctx, ix + iS * c[0], iy + iS * c[1], iS * 0.08, 1.2, c[2]);
      });
      ctx.fillStyle = 'rgba(255,248,230,0.6)';
      for (var k = 0; k < 4; k++) {
        var px = ix + iS * [0.5, 0.94, 0.5, 0.06][k], py = iy + iS * [0.06, 0.5, 0.94, 0.5][k];
        ctx.beginPath(); ctx.arc(px, py, Math.max(0.7, S * 0.014), 0, 7); ctx.fill();
      }
      // the letter
      var L = (o.letter || 'A').toUpperCase();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = Math.round(iS * 0.86) + 'px "IM Fell English SC", "IM Fell English", Georgia, serif';
      var lg = ctx.createLinearGradient(ix, iy, ix, iy + iS); lg.addColorStop(0, '#fff3c4'); lg.addColorStop(0.55, GOLD[0]); lg.addColorStop(1, GOLD[1]);
      var by = iy + iS * 0.8;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(25,12,4,0.7)'; ctx.lineWidth = Math.max(1, iS * 0.035);
      ctx.strokeText(L, ix + iS / 2, by);
      ctx.fillStyle = lg; ctx.fillText(L, ix + iS / 2, by);
      // the tendril: out of the lower-left corner, down and round, with an ivy leaf and a bezant
      var ox = sx + S * 0.02, oy = sy + S * 0.72;
      ctx.strokeStyle = '#4a6b3a'; ctx.lineWidth = Math.max(1, S * 0.022); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox, oy);
      ctx.bezierCurveTo(ox - m * 0.9, oy + S * 0.05, ox - m * 0.9, sy + S + m * 0.6, ox + S * 0.2, sy + S + m * 0.55);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + S * 0.2, sy + S + m * 0.55);
      ctx.quadraticCurveTo(ox + S * 0.32, sy + S + m * 0.5, ox + S * 0.36, sy + S + m * 0.1); ctx.stroke();
      ivyLeaf(ctx, ox - m * 0.55, sy + S * 0.98, S * 0.13, -2.4, '#5b7f45', 'rgba(30,45,20,0.6)');
      bezant(ctx, ox + S * 0.37, sy + S + m * 0.08, Math.max(1.5, S * 0.035));
    },

    corner: function (ctx, x, y, w, h, t, o) {
      var at = o.at || 'tl';
      ctx.translate(x + (at === 'tr' || at === 'br' ? w : 0), y + (at === 'bl' || at === 'br' ? h : 0));
      ctx.scale(at === 'tr' || at === 'br' ? -1 : 1, at === 'bl' || at === 'br' ? -1 : 1);
      var s = Math.min(w, h), bw = Math.max(2, s * 0.045);
      // two gold bars meeting in the corner, tapering away
      function bar(horiz) {
        ctx.beginPath();
        if (horiz) { ctx.moveTo(s * 0.06, s * 0.06); ctx.lineTo(w * 0.98, s * 0.06 + bw * 0.15); ctx.lineTo(w * 0.98, s * 0.06 + bw * 0.45); ctx.lineTo(s * 0.06, s * 0.06 + bw); }
        else { ctx.moveTo(s * 0.06, s * 0.06); ctx.lineTo(s * 0.06 + bw * 0.15, h * 0.98); ctx.lineTo(s * 0.06 + bw * 0.45, h * 0.98); ctx.lineTo(s * 0.06 + bw, s * 0.06); }
        ctx.closePath(); ctx.fillStyle = goldFill(ctx, 0, 0, w, h); ctx.fill();
        ctx.strokeStyle = 'rgba(90,60,15,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
      }
      bar(true); bar(false);
      // a thin vermilion rule inside the gold
      ctx.strokeStyle = 'rgba(178,58,38,0.75)'; ctx.lineWidth = Math.max(0.7, s * 0.008);
      ctx.beginPath(); ctx.moveTo(w * 0.8, s * 0.06 + bw * 1.9); ctx.lineTo(s * 0.06 + bw * 1.9, s * 0.06 + bw * 1.9); ctx.lineTo(s * 0.06 + bw * 1.9, h * 0.8); ctx.stroke();
      // the vine: a scroll in the corner with leaves along both arms
      ctx.strokeStyle = '#4a6b3a'; ctx.lineWidth = Math.max(0.9, s * 0.014); ctx.lineCap = 'round';
      var c0 = s * 0.06 + bw * 1.9;
      ctx.beginPath(); ctx.moveTo(w * 0.62, c0 + s * 0.02);
      ctx.bezierCurveTo(w * 0.45, c0 + s * 0.16, s * 0.4, c0 + s * 0.02, s * 0.3, c0 + s * 0.12);
      ctx.bezierCurveTo(s * 0.18, c0 + s * 0.24, c0 + s * 0.02, h * 0.45, c0 + s * 0.02, h * 0.62);
      ctx.stroke();
      spiral(ctx, s * 0.26, s * 0.26, s * 0.1, 1.3, 1);
      var R = rnd(7);
      [[w * 0.5, c0 + s * 0.1, 2.5], [w * 0.38, c0 + s * 0.06, -0.5], [c0 + s * 0.1, h * 0.5, 0.9], [c0 + s * 0.06, h * 0.38, -2.1]].forEach(function (l) {
        ivyLeaf(ctx, l[0], l[1], s * (0.07 + R() * 0.02), l[2], '#5b7f45', 'rgba(30,45,20,0.55)');
      });
      bezant(ctx, c0 + s * 0.02, c0 + s * 0.02, Math.max(1.6, s * 0.035));
      bezant(ctx, w * 0.66, c0 + s * 0.03, Math.max(1.2, s * 0.024));
      bezant(ctx, c0 + s * 0.03, h * 0.66, Math.max(1.2, s * 0.024));
    },

    seal: function (ctx, x, y, w, h, t, o) {
      var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.46, R = rnd(o.seed || 11);
      // the blob
      ctx.beginPath();
      var n = 30, pts = [];
      for (var k = 0; k < n; k++) { var a = k / n * Math.PI * 2, rr = r * (0.93 + R() * 0.09); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (k = 0; k < n; k++) { var p = pts[k], q = pts[(k + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.closePath();
      ctx.save(); ctx.shadowColor = 'rgba(60,10,0,0.35)'; ctx.shadowBlur = r * 0.15; ctx.shadowOffsetY = r * 0.06;
      var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#d9543a'); g.addColorStop(0.6, '#a82a17'); g.addColorStop(1, '#6e150a');
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
      // the pressed face
      var ri = r * 0.68;
      ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2);
      var g2 = ctx.createRadialGradient(cx + ri * 0.3, cy + ri * 0.35, ri * 0.1, cx, cy, ri);
      g2.addColorStop(0, '#b8341f'); g2.addColorStop(1, '#8a2010'); ctx.fillStyle = g2; ctx.fill();
      ctx.lineWidth = Math.max(0.8, r * 0.05); ctx.strokeStyle = 'rgba(255,170,140,0.35)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, ri, 0.6 * Math.PI, 1.6 * Math.PI); ctx.strokeStyle = 'rgba(60,5,0,0.45)'; ctx.stroke();
      // ring of beads
      ctx.fillStyle = 'rgba(255,190,160,0.45)';
      for (k = 0; k < 16; k++) { var a2 = k / 16 * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * ri * 0.83, cy + Math.sin(a2) * ri * 0.83, Math.max(0.5, r * 0.035), 0, 7); ctx.fill(); }
      // emblem
      if (o.letter) {
        ctx.font = Math.round(ri * 1.05) + 'px "IM Fell English SC", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(60,5,0,0.55)'; ctx.fillText(o.letter, cx + r * 0.03, cy + r * 0.07);
        ctx.fillStyle = 'rgba(255,190,160,0.55)'; ctx.fillText(o.letter, cx - r * 0.02, cy + r * 0.03);
      } else {
        var a3 = ri * 0.5, b3 = ri * 0.16;
        // a cross pattee, pressed: dark offset then light, each arm its own path
        [[r * 0.03, r * 0.04, 'rgba(60,5,0,0.55)'], [-r * 0.015, -r * 0.01, 'rgba(255,190,160,0.5)']].forEach(function (s) {
          ctx.fillStyle = s[2];
          for (var q3 = 0; q3 < 4; q3++) {
            ctx.save(); ctx.translate(cx + s[0], cy + s[1]); ctx.rotate(q3 * Math.PI / 2);
            ctx.beginPath(); ctx.moveTo(-b3 * 0.5, 0); ctx.lineTo(-b3 * 1.4, -a3); ctx.quadraticCurveTo(0, -a3 * 0.9, b3 * 1.4, -a3); ctx.lineTo(b3 * 0.5, 0); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        });
      }
      // a highlight on the wax
      ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.18, r * 0.07, -0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,200,0.35)'; ctx.fill();
    },

    flourish: function (ctx, x, y, w, h, t, o) {
      var cy = y + h / 2, cx = x + w / 2, lw = Math.max(1, h * 0.07);
      ctx.lineCap = 'round';
      // the swelling pen line
      function swell(x0, x1) {
        ctx.beginPath();
        var steps = 30;
        for (var k = 0; k <= steps; k++) { var f = k / steps, px = x0 + (x1 - x0) * f, th = lw * (0.25 + 1.1 * Math.sin(f * Math.PI)); ctx.lineTo(px, cy - th / 2 + Math.sin(f * Math.PI * 2) * h * 0.04); }
        for (k = steps; k >= 0; k--) { var f2 = k / steps, px2 = x0 + (x1 - x0) * f2, th2 = lw * (0.25 + 1.1 * Math.sin(f2 * Math.PI)); ctx.lineTo(px2, cy + th2 / 2 + Math.sin(f2 * Math.PI * 2) * h * 0.04); }
        ctx.closePath(); ctx.fillStyle = VERM; ctx.fill();
      }
      swell(x + w * 0.1, cx - h * 0.35); swell(cx + h * 0.35, x + w * 0.9);
      // loops at the ends
      ctx.strokeStyle = VERM; ctx.lineWidth = Math.max(0.8, lw * 0.5);
      spiral(ctx, x + w * 0.1 - h * 0.12, cy - h * 0.05, h * 0.2, 1.1, -1);
      spiral(ctx, x + w * 0.9 + h * 0.12, cy - h * 0.05, h * 0.2, 1.1, 1);
      // the centre diamond and blue pen dots
      ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.3); ctx.lineTo(cx + h * 0.22, cy); ctx.lineTo(cx, cy + h * 0.3); ctx.lineTo(cx - h * 0.22, cy); ctx.closePath();
      ctx.fillStyle = VERM; ctx.fill();
      ctx.fillStyle = '#34568c';
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.arc(cx + s * h * 0.5, cy - h * 0.18, Math.max(0.8, h * 0.06), 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + s * h * 0.5, cy + h * 0.18, Math.max(0.8, h * 0.06), 0, 7); ctx.fill();
      });
    },

    // the title page's great initial: gold frame, lapis ground with white diaper, a vermilion letter with
    // white tracery, vine scrolls in the spaces the letter leaves. opts.letter (default 'T')
    titlecap: function (ctx, x, y, w, h, t, o) {
      var S = Math.min(w, h) * 0.94, sx = x + (w - S) / 2, sy = y + (h - S) / 2;
      ctx.fillStyle = 'rgba(60,35,10,0.18)'; ctx.fillRect(sx + S * 0.025, sy + S * 0.03, S, S);
      ctx.fillStyle = goldFill(ctx, sx, sy, S, S); ctx.fillRect(sx, sy, S, S);
      ctx.strokeStyle = 'rgba(80,50,10,0.75)'; ctx.lineWidth = Math.max(0.8, S * 0.008); ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1);
      var b = S * 0.06, ix = sx + b, iy = sy + b, iS = S - 2 * b;
      var g = ctx.createLinearGradient(ix, iy, ix, iy + iS); g.addColorStop(0, '#3f63a3'); g.addColorStop(1, '#22396a');
      ctx.fillStyle = g; ctx.fillRect(ix, iy, iS, iS);
      // white diaper: a lozenge lattice with a dot in each lozenge
      ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iS, iS); ctx.clip();
      ctx.strokeStyle = 'rgba(255,248,230,0.16)'; ctx.lineWidth = Math.max(0.5, S * 0.004);
      var d = iS / 9;
      for (var k = -9; k <= 18; k++) {
        ctx.beginPath(); ctx.moveTo(ix + k * d, iy); ctx.lineTo(ix + k * d + iS, iy + iS); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + k * d, iy); ctx.lineTo(ix + k * d - iS, iy + iS); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,248,230,0.3)';
      for (var a = 0; a < 10; a++) for (var c = 0; c < 10; c++) { ctx.beginPath(); ctx.arc(ix + (a + 0.5) * d - d / 2 + d / 2, iy + c * d, Math.max(0.5, S * 0.006), 0, 7); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(20,10,4,0.6)'; ctx.lineWidth = Math.max(0.6, S * 0.006); ctx.strokeRect(ix, iy, iS, iS);
      // vine scrolls in the two lower spaces
      ctx.lineCap = 'round';
      [[0.25, 1], [0.75, -1]].forEach(function (v) {
        var cx = ix + iS * v[0], cy = iy + iS * 0.66;
        ctx.strokeStyle = '#d9b44e'; ctx.lineWidth = Math.max(0.8, S * 0.012);
        spiral(ctx, cx, cy, iS * 0.15, 1.4, v[1]);
        ctx.beginPath(); ctx.moveTo(cx + v[1] * iS * 0.15, cy); ctx.quadraticCurveTo(cx + v[1] * iS * 0.2, cy + iS * 0.2, cx, iy + iS * 0.94); ctx.stroke();
        ivyLeaf(ctx, cx - v[1] * iS * 0.05, cy - iS * 0.16, iS * 0.08, v[1] * 0.6, '#5b8a4a', 'rgba(255,240,200,0.5)');
        ivyLeaf(ctx, cx + v[1] * iS * 0.1, cy + iS * 0.2, iS * 0.07, v[1] * 2.4, '#c4482f', 'rgba(255,240,200,0.5)');
        bezant(ctx, cx, cy, Math.max(1.5, iS * 0.022));
      });
      // the letter, on its own canvas so the tracery can be clipped to it
      var L = (o.letter || 'T').toUpperCase(), k2 = (ctx.getTransform ? ctx.getTransform().a : 1) || 1;
      var off = document.createElement('canvas'); off.width = Math.ceil(iS * k2); off.height = Math.ceil(iS * k2);
      var oc = off.getContext('2d'); oc.scale(k2, k2);
      oc.textAlign = 'center'; oc.textBaseline = 'alphabetic';
      oc.font = Math.round(iS * 1.02) + 'px "IM Fell English SC", "IM Fell English", Georgia, serif';
      var by = iS * 0.86;
      var lg = oc.createLinearGradient(0, 0, 0, iS); lg.addColorStop(0, '#de7a62'); lg.addColorStop(0.5, '#c4482f'); lg.addColorStop(1, '#8e2a18');
      oc.fillStyle = lg; oc.fillText(L, iS / 2, by);
      oc.globalCompositeOperation = 'source-atop';
      oc.strokeStyle = 'rgba(255,245,225,0.55)'; oc.lineWidth = Math.max(0.6, iS * 0.008); oc.lineCap = 'round';
      for (var q = 0; q < 14; q++) { spiral(oc, iS * (0.1 + (q % 7) * 0.13), iS * (q < 7 ? 0.2 : 0.55), iS * 0.035, 1.2, q % 2 ? 1 : -1); }
      oc.beginPath(); oc.moveTo(iS * 0.5, iS * 0.25); oc.lineTo(iS * 0.5, iS * 0.85); oc.stroke();
      oc.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = oc.font;
      ctx.strokeStyle = 'rgba(25,12,4,0.8)'; ctx.lineWidth = Math.max(1.2, iS * 0.02);
      ctx.strokeText(L, ix + iS / 2, iy + by);
      ctx.strokeStyle = GOLD[0]; ctx.lineWidth = Math.max(0.6, iS * 0.007);
      ctx.strokeText(L, ix + iS / 2 - iS * 0.004, iy + by - iS * 0.004);
      ctx.drawImage(off, ix, iy, iS, iS);
      ctx.restore();
      // bezants on the frame corners
      [[sx, sy], [sx + S, sy], [sx, sy + S], [sx + S, sy + S]].forEach(function (p) { bezant(ctx, p[0] + (p[0] > sx ? -b / 2 : b / 2), p[1] + (p[1] > sy ? -b / 2 : b / 2), b * 0.32); });
    },

    // a cast roundel: gold ring, coloured ground, the initial. opts.letter, opts.ground, opts.blank (not yet met)
    portrait: function (ctx, x, y, w, h, t, o) {
      var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.46;
      if (o.blank) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = 'rgba(120,90,50,0.07)'; ctx.fill();
        ctx.setLineDash([Math.max(1, r * 0.06), Math.max(1.5, r * 0.09)]);
        ctx.strokeStyle = 'rgba(110,76,40,0.45)'; ctx.lineWidth = Math.max(0.8, r * 0.04); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      var gr = GROUND[o.ground] || GROUND.woad;
      ctx.save(); ctx.shadowColor = 'rgba(60,35,10,0.25)'; ctx.shadowBlur = r * 0.12; ctx.shadowOffsetY = r * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = goldFill(ctx, cx - r, cy - r, 2 * r, 2 * r); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(80,50,10,0.7)'; ctx.lineWidth = Math.max(0.6, r * 0.03); ctx.stroke();
      var ri = r * 0.84;
      var g = ctx.createRadialGradient(cx - ri * 0.3, cy - ri * 0.35, ri * 0.1, cx, cy, ri);
      g.addColorStop(0, gr[0]); g.addColorStop(1, gr[1]);
      ctx.beginPath(); ctx.arc(cx, cy, ri, 0, 7); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(25,12,4,0.5)'; ctx.lineWidth = Math.max(0.6, r * 0.025); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,230,0.55)';
      for (var k = 0; k < 18; k++) { var a = k / 18 * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * ri * 0.86, cy + Math.sin(a) * ri * 0.86, Math.max(0.5, r * 0.03), 0, 7); ctx.fill(); }
      var L = (o.letter || '?').toUpperCase();
      ctx.font = Math.round(ri * 1.15) + 'px "IM Fell English SC", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var by = cy + ri * 0.4;
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(25,12,4,0.7)'; ctx.lineWidth = Math.max(1, ri * 0.06); ctx.strokeText(L, cx, by);
      var lg = ctx.createLinearGradient(cx, cy - ri, cx, cy + ri); lg.addColorStop(0, '#fff3c4'); lg.addColorStop(0.6, GOLD[0]); lg.addColorStop(1, GOLD[1]);
      ctx.fillStyle = lg; ctx.fillText(L, cx, by);
    },

    // the map of Mardle and the abbey, an estate map on parchment. Drawn in a portrait 1000 x 1300 frame;
    // ART.MAP_PLACES holds the marker positions in the same fractions.
    map: function (ctx, x, y, w, h, t, o) { drawMap(ctx, x, y, w, h); }
  };

  // ---------------------------------------------------------------- the map
  var MAP_PLACES = [
    // id, label, fx, fy, place-text pattern (tried in this order)
    ['gate', 'the abbey gatehouse', 0.669, 0.717, /gate/i],
    ['tower', 'the abbey church and bell tower', 0.756, 0.59, /bell|tower|abbey church|compline|choir/i],
    ['cloister', 'the cloister', 0.815, 0.733, /cloister|chapter|scriptorium|kitchen|brewhouse|guest|infirmar|herb|refectory|dorter/i],
    ['orchard', 'the orchard, ponds and barn', 0.86, 0.87, /orchard|pear|fishpond|barn|bee|skep/i],
    ['hall', 'Mardle Hall', 0.19, 0.342, /hall|manor|dovecote|hallmote/i],
    ['lynn', 'the Lynn road', 0.08, 0.19, /lynn/i],
    ['church', 'St Mary’s', 0.262, 0.515, /st mary|parish church|churchyard/i],
    ['bridge', 'the Long Bridge', 0.555, 0.712, /bridge|ferry|toll/i],
    ['mill', 'Hob’s mill and weir', 0.45, 0.68, /mill|weir/i],
    ['swan', 'the Swan', 0.41, 0.6, /swan|alehouse/i],
    ['butts', 'the Butts', 0.16, 0.556, /butts/i],
    ['meadow', 'the water meadow', 0.69, 0.47, /meadow|hay/i],
    ['fen', 'the fen', 0.38, 0.22, /fen|eel|reed|trap/i],
    ['common', 'the common', 0.19, 0.81, /common|pannage/i],
    ['wood', 'Mardle Wood', 0.125, 0.895, /wood/i],
    ['bounds', 'the parish bounds', 0.081, 0.712, /bound|rogation/i],
    ['square', 'the market square', 0.338, 0.585, /market|square|cross|tolley/i],
    ['abbey', 'the Abbey of St Alnoth', 0.86, 0.63, /abbey|alnoth/i]
  ];
  var RIVER = [[0.74, 0.14], [0.68, 0.22], [0.6, 0.3], [0.53, 0.39], [0.5, 0.47], [0.49, 0.56], [0.46, 0.65], [0.42, 0.75], [0.36, 0.84], [0.3, 0.93], [0.27, 1.01]];

  function drawMap(ctx, x, y, w, h) {
    var U = w / 1000, R = rnd(1331);
    function X(f) { return x + f * w; } function Y(f) { return y + f * h; }
    var INK = '#4a3420', INKA = 'rgba(74,52,32,0.85)';
    // ground, edge-darkened, with a few faint stains
    var g = ctx.createRadialGradient(X(0.5), Y(0.45), w * 0.1, X(0.5), Y(0.5), Math.max(w, h) * 0.78);
    g.addColorStop(0, '#f4e8ca'); g.addColorStop(0.65, '#ead9b2'); g.addColorStop(1, '#d4b986');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    for (var k = 0; k < 7; k++) blob(R() , R(), 0.05 + R() * 0.08, 0.04 + R() * 0.06, 'rgba(150,110,60,0.05)');
    function blob(fx, fy, rx, ry, fill, stroke) {
      ctx.beginPath();
      var n = 22, pts = [];
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, rr = 0.85 + R() * 0.25; pts.push([X(fx) + Math.cos(a) * rx * w * rr, Y(fy) + Math.sin(a) * ry * h * rr]); }
      ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(0.6, U * 1.6); ctx.stroke(); }
    }
    function path(pts, close) {
      ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (var i = 1; i < pts.length - 1; i++) { var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(X(pts[i][0]), Y(pts[i][1]), X(mx), Y(my)); }
      var l = pts[pts.length - 1]; ctx.lineTo(X(l[0]), Y(l[1]));
      if (close) ctx.closePath();
    }
    function label(text, fx, fy, size, opt) {
      opt = opt || {};
      ctx.save(); ctx.translate(X(fx), Y(fy)); if (opt.rot) ctx.rotate(opt.rot);
      ctx.font = (opt.caps ? '' : 'italic ') + Math.max(7, Math.round(size * U)) + 'px ' + (opt.caps ? '"IM Fell English SC", Georgia, serif' : '"EB Garamond", Georgia, serif');
      ctx.textAlign = opt.align || 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(244,232,202,0.85)'; ctx.lineWidth = Math.max(1.5, size * U * 0.28); ctx.strokeText(text, 0, 0);
      ctx.fillStyle = opt.color || INK; ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    function tuft(px, py, s, col) {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, U * 1.3);
      ctx.beginPath();
      for (var i = -2; i <= 2; i++) { ctx.moveTo(px + i * s * 0.18, py); ctx.lineTo(px + i * s * 0.32, py - s * (0.7 + (i % 2 ? 0 : 0.3))); }
      ctx.stroke();
    }
    function tree(px, py, s, col) {
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.6, s * 0.12);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - s * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py - s * 1.05, s * 0.5, 0, 7); ctx.fillStyle = col || '#7d9a5a'; ctx.fill();
      ctx.lineWidth = Math.max(0.5, s * 0.07); ctx.strokeStyle = 'rgba(40,50,25,0.7)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(px - s * 0.15, py - s * 1.2, s * 0.2, 0, 7); ctx.fillStyle = 'rgba(255,250,220,0.18)'; ctx.fill();
    }
    function house(px, py, s, roof, wide) {
      var ww = s * (wide || 1), hh = s * 0.55;
      ctx.lineWidth = Math.max(0.5, U * 1.2); ctx.strokeStyle = INK;
      ctx.fillStyle = '#f1e3c0'; ctx.fillRect(px - ww / 2, py - hh, ww, hh); ctx.strokeRect(px - ww / 2, py - hh, ww, hh);
      ctx.beginPath(); ctx.moveTo(px - ww / 2 - s * 0.08, py - hh); ctx.lineTo(px - ww / 2 + s * 0.2, py - hh - s * 0.5); ctx.lineTo(px + ww / 2 - s * 0.2, py - hh - s * 0.5); ctx.lineTo(px + ww / 2 + s * 0.08, py - hh); ctx.closePath();
      ctx.fillStyle = roof || '#b5503a'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(px - s * 0.08, py - hh * 0.55, s * 0.16, hh * 0.55);
    }
    function church(px, py, s, spire) {
      ctx.lineWidth = Math.max(0.5, U * 1.3); ctx.strokeStyle = INK;
      // nave and chancel
      ctx.fillStyle = '#efe0bc'; ctx.fillRect(px - s * 0.2, py - s * 0.5, s * 1.3, s * 0.5); ctx.strokeRect(px - s * 0.2, py - s * 0.5, s * 1.3, s * 0.5);
      ctx.beginPath(); ctx.moveTo(px - s * 0.25, py - s * 0.5); ctx.lineTo(px + s * 1.15, py - s * 0.5); ctx.lineTo(px + s * 1.0, py - s * 0.8); ctx.lineTo(px - s * 0.1, py - s * 0.8); ctx.closePath();
      ctx.fillStyle = '#8a7a6a'; ctx.fill(); ctx.stroke();
      for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px + s * (0.05 + i * 0.27), py - s * 0.25, s * 0.06, Math.PI, 0); ctx.lineTo(px + s * (0.11 + i * 0.27), py - s * 0.12); ctx.lineTo(px + s * (-0.01 + i * 0.27), py - s * 0.12); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); }
      // tower at the west end
      ctx.fillStyle = '#f1e3c0'; ctx.fillRect(px - s * 0.45, py - s * 1.2, s * 0.32, s * 1.2); ctx.strokeRect(px - s * 0.45, py - s * 1.2, s * 0.32, s * 1.2);
      ctx.beginPath();
      if (spire) { ctx.moveTo(px - s * 0.48, py - s * 1.2); ctx.lineTo(px - s * 0.29, py - s * 1.85); ctx.lineTo(px - s * 0.1, py - s * 1.2); ctx.closePath(); ctx.fillStyle = '#8a7a6a'; ctx.fill(); ctx.stroke(); }
      else { for (var c = 0; c < 4; c++) { ctx.fillStyle = '#f1e3c0'; ctx.fillRect(px - s * 0.45 + c * s * 0.09, py - s * 1.3, s * 0.05, s * 0.1); ctx.strokeRect(px - s * 0.45 + c * s * 0.09, py - s * 1.3, s * 0.05, s * 0.1); } }
      var ty = spire ? py - s * 1.85 : py - s * 1.3;
      ctx.beginPath(); ctx.moveTo(px - s * 0.29, ty); ctx.lineTo(px - s * 0.29, ty - s * 0.25); ctx.moveTo(px - s * 0.37, ty - s * 0.16); ctx.lineTo(px - s * 0.21, ty - s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.arc(px - s * 0.29, py - s * 0.95, s * 0.06, 0, 7); ctx.fillStyle = INK; ctx.fill();
    }

    // ---- washes: fen, meadow, common, wood floor
    blob(0.66, 0.08, 0.36, 0.1, 'rgba(160,172,120,0.35)');
    blob(0.88, 0.2, 0.14, 0.1, 'rgba(160,172,120,0.33)');
    blob(0.4, 0.05, 0.16, 0.05, 'rgba(160,172,120,0.3)');
    blob(0.61, 0.56, 0.085, 0.11, 'rgba(150,175,110,0.33)');
    blob(0.25, 0.78, 0.17, 0.07, 'rgba(185,180,110,0.3)');
    blob(0.13, 0.9, 0.14, 0.08, 'rgba(110,140,80,0.3)');
    blob(0.17, 0.21, 0.12, 0.07, 'rgba(185,170,110,0.22)');
    // fen pools and channels
    [[0.55, 0.06, 0.05, 0.02], [0.82, 0.08, 0.06, 0.022], [0.92, 0.25, 0.035, 0.02], [0.43, 0.1, 0.035, 0.015], [0.72, 0.05, 0.03, 0.014]].forEach(function (p) {
      blob(p[0], p[1], p[2], p[3], 'rgba(130,160,185,0.55)', 'rgba(70,95,120,0.5)');
    });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[[0.74, 0.14], [0.8, 0.1], [0.83, 0.08]], [[0.74, 0.14], [0.62, 0.1], [0.55, 0.06]], [[0.74, 0.14], [0.86, 0.18], [0.92, 0.25]], [[0.6, 0.1], [0.5, 0.11], [0.43, 0.1]]].forEach(function (c) {
      path(c); ctx.strokeStyle = 'rgba(70,95,120,0.6)'; ctx.lineWidth = 7 * U; ctx.stroke();
      ctx.strokeStyle = 'rgba(150,175,195,1)'; ctx.lineWidth = 4.5 * U; ctx.stroke();
    });
    // reeds
    for (k = 0; k < 90; k++) {
      var fx = 0.3 + R() * 0.68, fy = 0.015 + R() * 0.22;
      if (fy > 0.13 + (1 - fx) * 0.1 || (fx < 0.78 && fy > 0.17)) continue;
      tuft(X(fx), Y(fy), (9 + R() * 6) * U, 'rgba(85,100,55,0.75)');
    }
    // eel traps: wicker cones along the channels
    [[0.79, 0.11, 0.4], [0.63, 0.1, -0.2], [0.86, 0.19, 0.6], [0.5, 0.115, 0.1], [0.69, 0.18, 0.9]].forEach(function (e) {
      ctx.save(); ctx.translate(X(e[0]), Y(e[1])); ctx.rotate(e[2]);
      var L = 22 * U, Wd = 8 * U;
      ctx.beginPath(); ctx.moveTo(-L / 2, -Wd / 2); ctx.lineTo(L / 2, 0); ctx.lineTo(-L / 2, Wd / 2); ctx.closePath();
      ctx.fillStyle = '#c9a466'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U); ctx.stroke();
      for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-L / 2 + i * L / 4, -Wd / 2 * (1 - i / 4)); ctx.lineTo(-L / 2 + i * L / 4, Wd / 2 * (1 - i / 4)); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(-L / 2, 0, 1.6 * U, Wd / 2, 0, 0, 7); ctx.fillStyle = INK; ctx.fill();
      ctx.restore();
    });

    // ---- the river
    path(RIVER); ctx.strokeStyle = 'rgba(60,85,115,0.75)'; ctx.lineWidth = 40 * U; ctx.stroke();
    ctx.strokeStyle = '#a6bccd'; ctx.lineWidth = 35 * U; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(0.5, 1.2 * U);
    for (k = 1; k < RIVER.length - 1; k++) {
      var a0 = RIVER[k], a1 = RIVER[k + 1];
      for (var j = 0; j < 2; j++) {
        var f = 0.25 + j * 0.45, rx = X(a0[0] + (a1[0] - a0[0]) * f) + (j ? 6 : -6) * U, ry = Y(a0[1] + (a1[1] - a0[1]) * f);
        ctx.beginPath(); ctx.moveTo(rx - 7 * U, ry); ctx.quadraticCurveTo(rx - 3.5 * U, ry - 3 * U, rx, ry); ctx.quadraticCurveTo(rx + 3.5 * U, ry + 3 * U, rx + 7 * U, ry); ctx.stroke();
      }
    }
    // meadow grass and flood stipple
    for (k = 0; k < 26; k++) tuft(X(0.54 + R() * 0.13), Y(0.47 + R() * 0.2), 7 * U, 'rgba(85,110,55,0.6)');
    ctx.fillStyle = 'rgba(70,95,120,0.35)';
    for (k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(X(0.53 + R() * 0.07), Y(0.5 + R() * 0.16), 1.2 * U, 0, 7); ctx.fill(); }

    // ---- roads: Lynn road past the Hall, the street through the square to the bridge, the causeway to the gate, a lane south
    function road(pts) { path(pts); ctx.strokeStyle = 'rgba(120,90,50,0.55)'; ctx.lineWidth = 10 * U; ctx.stroke(); ctx.strokeStyle = '#efdfb8'; ctx.lineWidth = 6.5 * U; ctx.stroke(); }
    road([[0.03, 0.02], [0.1, 0.08], [0.17, 0.15], [0.22, 0.27], [0.27, 0.38], [0.3, 0.46]]);
    road([[0.3, 0.46], [0.4, 0.47], [0.5, 0.468], [0.6, 0.455], [0.68, 0.445]]);
    road([[0.3, 0.46], [0.32, 0.55], [0.3, 0.66], [0.25, 0.77], [0.17, 0.86], [0.08, 0.95]]);
    road([[0.42, 0.47], [0.45, 0.56], [0.455, 0.65]]);
    // the market square and its cross
    blob(0.305, 0.465, 0.05, 0.028, '#efdfb8', 'rgba(120,90,50,0.55)');
    (function () {
      var px = X(0.305), py = Y(0.47), s = 26 * U;
      ctx.fillStyle = '#d8c7a2'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.2);
      ctx.fillRect(px - s * 0.4, py - s * 0.14, s * 0.8, s * 0.14); ctx.strokeRect(px - s * 0.4, py - s * 0.14, s * 0.8, s * 0.14);
      ctx.fillRect(px - s * 0.25, py - s * 0.26, s * 0.5, s * 0.12); ctx.strokeRect(px - s * 0.25, py - s * 0.26, s * 0.5, s * 0.12);
      ctx.beginPath(); ctx.moveTo(px, py - s * 0.26); ctx.lineTo(px, py - s * 1.05); ctx.moveTo(px - s * 0.18, py - s * 0.85); ctx.lineTo(px + s * 0.18, py - s * 0.85);
      ctx.lineWidth = Math.max(0.8, U * 3); ctx.stroke();
    })();
    // the town's houses along the street
    [[0.25, 0.44, 1], [0.27, 0.5, 0.9], [0.35, 0.44, 1], [0.37, 0.5, 1.1], [0.29, 0.53, 0.9], [0.24, 0.48, 0.8], [0.34, 0.6, 0.9], [0.28, 0.6, 0.9], [0.4, 0.44, 0.8], [0.2, 0.44, 0.8], [0.26, 0.64, 0.8], [0.31, 0.68, 0.8]].forEach(function (hs, i) {
      house(X(hs[0]), Y(hs[1]), 22 * U * hs[2], i % 3 ? '#c9a25a' : '#b5503a', 1.1);
    });
    // St Mary's
    church(X(0.225), Y(0.385), 46 * U, true);
    label('St Mary’s', 0.235, 0.405, 20);
    // the Swan, with its sign
    house(X(0.36), Y(0.565), 34 * U, '#b5503a', 1.4);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.4);
    ctx.beginPath(); ctx.moveTo(X(0.385), Y(0.548)); ctx.lineTo(X(0.405), Y(0.548)); ctx.lineTo(X(0.405), Y(0.556)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(0.405), Y(0.562), 6 * U, 0, 7); ctx.fillStyle = '#f7f0dc'; ctx.fill(); ctx.stroke();
    label('the Swan', 0.37, 0.585, 19);
    // the Butts: two turf banks with targets, the range between
    [[0.165, 0.565], [0.235, 0.6]].forEach(function (b) {
      ctx.beginPath(); ctx.ellipse(X(b[0]), Y(b[1]), 14 * U, 7 * U, 0, Math.PI, 0); ctx.fillStyle = '#9db071'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(b[0]), Y(b[1]) - 9 * U, 5 * U, 0, 7); ctx.fillStyle = '#f7f0dc'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(b[0]), Y(b[1]) - 9 * U, 2 * U, 0, 7); ctx.fillStyle = VERM; ctx.fill();
    });
    ctx.setLineDash([3 * U, 4 * U]); ctx.strokeStyle = INKA; ctx.lineWidth = Math.max(0.5, U);
    ctx.beginPath(); ctx.moveTo(X(0.175), Y(0.57)); ctx.lineTo(X(0.225), Y(0.592)); ctx.stroke(); ctx.setLineDash([]);
    label('the Butts', 0.19, 0.62, 18);
    label('the market cross', 0.305, 0.49, 15);
    // the Long Bridge, arches over the water
    (function () {
      var x0 = X(0.455), x1 = X(0.545), by = Y(0.468), n = 5, ww = (x1 - x0) / n;
      ctx.fillStyle = '#d9c8a2'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.3);
      ctx.fillRect(x0, by - 5 * U, x1 - x0, 10 * U); ctx.strokeRect(x0, by - 5 * U, x1 - x0, 10 * U);
      for (var i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + ww * (i + 0.5), by + 5 * U, ww * 0.36, Math.PI, 0); ctx.fillStyle = 'rgba(60,85,115,0.7)'; ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = INK; ctx.fillRect(x0 + ww * 0.3, by - 10 * U, 6 * U, 5 * U);   // the toll box
    })();
    label('the Long Bridge', 0.5, 0.445, 18);
    // the weir and Hob's mill
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.6, U * 2);
    ctx.beginPath(); for (k = 0; k <= 6; k++) ctx.lineTo(X(0.445 + k * 0.009), Y(0.64 + (k % 2 ? 0.008 : 0) + k * 0.001)); ctx.stroke();
    house(X(0.405), Y(0.675), 36 * U, '#c9a25a', 1.2);
    (function () {
      var cx = X(0.44), cy = Y(0.665), r = 13 * U;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = '#c9a466'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.3); ctx.stroke();
      for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
    })();
    label('Hob’s mill', 0.39, 0.7, 18);
    label('the weir', 0.505, 0.635, 15);

    // ---- the abbey precinct
    (function () {
      var x0 = X(0.69), y0 = Y(0.29), x1 = X(0.96), y1 = Y(0.63), r = 14 * U;
      ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r); ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath();
      ctx.fillStyle = 'rgba(205,195,140,0.32)'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 4 * U; ctx.stroke(); ctx.strokeStyle = '#d9c8a2'; ctx.lineWidth = 1.6 * U; ctx.stroke();
    })();
    church(X(0.79), Y(0.385), 52 * U, false);
    label('bell tower', 0.765, 0.305, 15);
    // cloister: a square of arcades round a green garth
    (function () {
      var cx = X(0.835), cy = Y(0.45), s = 46 * U;
      ctx.fillStyle = '#efe0bc'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.3);
      ctx.fillRect(cx - s, cy - s * 0.7, s * 2, s * 1.4); ctx.strokeRect(cx - s, cy - s * 0.7, s * 2, s * 1.4);
      ctx.fillStyle = '#a9bb7e'; ctx.fillRect(cx - s * 0.7, cy - s * 0.45, s * 1.4, s * 0.9); ctx.strokeRect(cx - s * 0.7, cy - s * 0.45, s * 1.4, s * 0.9);
      ctx.fillStyle = INK;
      for (var i = 0; i < 7; i++) { ctx.fillRect(cx - s * 0.66 + i * s * 0.22, cy - s * 0.62, s * 0.06, s * 0.1); ctx.fillRect(cx - s * 0.66 + i * s * 0.22, cy + s * 0.52, s * 0.06, s * 0.1); }
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.12, 0, 7); ctx.fillStyle = '#a6bccd'; ctx.fill(); ctx.stroke();
    })();
    label('cloister', 0.835, 0.49, 15);
    // gatehouse on the west wall, twin turrets
    (function () {
      var gx = X(0.69), gy = Y(0.452), s = 18 * U;
      ctx.fillStyle = '#f1e3c0'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.3);
      [-1, 1].forEach(function (sd) { ctx.fillRect(gx + sd * s * 0.9 - s * 0.35, gy - s * 1.6, s * 0.7, s * 1.6); ctx.strokeRect(gx + sd * s * 0.9 - s * 0.35, gy - s * 1.6, s * 0.7, s * 1.6); });
      ctx.fillRect(gx - s * 0.6, gy - s * 1.2, s * 1.2, s * 1.2); ctx.strokeRect(gx - s * 0.6, gy - s * 1.2, s * 1.2, s * 1.2);
      ctx.beginPath(); ctx.arc(gx, gy - s * 0.5, s * 0.35, Math.PI, 0); ctx.lineTo(gx + s * 0.35, gy); ctx.lineTo(gx - s * 0.35, gy); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
    })();
    label('gatehouse', 0.69, 0.475, 15);
    // tithe barn, fishponds, the pear orchard, bee skeps, herb beds
    house(X(0.745), Y(0.58), 30 * U, '#c9a25a', 2.1);
    label('tithe barn', 0.745, 0.6, 14);
    [[0.81, 0.55, 0.03, 0.013], [0.81, 0.585, 0.028, 0.012]].forEach(function (p) { blob(p[0], p[1], p[2], p[3], 'rgba(130,160,185,0.75)', 'rgba(70,95,120,0.7)'); });
    label('fishponds', 0.81, 0.61, 14);
    for (var oy = 0; oy < 3; oy++) for (var ox = 0; ox < 3; ox++) tree(X(0.875 + ox * 0.025), Y(0.545 + oy * 0.025), 11 * U, '#8aa25f');
    label('pear orchard', 0.9, 0.615, 14);
    for (k = 0; k < 4; k++) {
      var sx2 = X(0.905 + (k % 2) * 0.018), sy2 = Y(0.355 + Math.floor(k / 2) * 0.018);
      ctx.beginPath(); ctx.arc(sx2, sy2, 5 * U, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#c9a466'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(85,110,55,0.8)'; ctx.lineWidth = Math.max(0.6, U * 2);
    for (k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(X(0.72), Y(0.5 + k * 0.01)); ctx.lineTo(X(0.765), Y(0.5 + k * 0.01)); ctx.stroke(); }
    label('herb garden', 0.745, 0.535, 13);
    label('THE ABBEY OF ST ALNOTH', 0.825, 0.275, 19, { caps: true, color: VERM });

    // ---- Mardle Hall on its rise, with the dovecote
    (function () {
      var hx = X(0.15), hy = Y(0.22), s = 40 * U;
      house(hx, hy, s, '#b5503a', 1.6);
      ctx.fillStyle = '#f1e3c0'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U * 1.3);
      ctx.fillRect(hx + s * 0.8, hy - s * 1.0, s * 0.45, s * 1.0); ctx.strokeRect(hx + s * 0.8, hy - s * 1.0, s * 0.45, s * 1.0);
      for (var c = 0; c < 3; c++) { ctx.fillRect(hx + s * (0.8 + c * 0.18), hy - s * 1.1, s * 0.09, s * 0.1); ctx.strokeRect(hx + s * (0.8 + c * 0.18), hy - s * 1.1, s * 0.09, s * 0.1); }
      var dx = X(0.26), dy = Y(0.2);
      ctx.fillRect(dx - s * 0.22, dy - s * 0.5, s * 0.44, s * 0.5); ctx.strokeRect(dx - s * 0.22, dy - s * 0.5, s * 0.44, s * 0.5);
      ctx.beginPath(); ctx.moveTo(dx - s * 0.28, dy - s * 0.5); ctx.lineTo(dx, dy - s * 0.9); ctx.lineTo(dx + s * 0.28, dy - s * 0.5); ctx.closePath(); ctx.fillStyle = '#b5503a'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(dx - s * 0.05, dy - s * 0.35, s * 0.1, s * 0.1);
    })();
    label('MARDLE HALL', 0.17, 0.245, 18, { caps: true });
    label('dovecote', 0.27, 0.215, 13);
    for (k = 0; k < 5; k++) tree(X(0.06 + k * 0.035), Y(0.3 + (k % 2) * 0.012), 13 * U);

    // ---- the common and Mardle Wood
    for (k = 0; k < 18; k++) tuft(X(0.12 + R() * 0.25), Y(0.74 + R() * 0.07), 7 * U, 'rgba(110,115,55,0.6)');
    label('the common', 0.26, 0.795, 19);
    for (k = 0; k < 26; k++) {
      var tx = 0.03 + R() * 0.24, ty2 = 0.84 + R() * 0.12;
      if (tx > 0.2 && ty2 > 0.93) continue;
      tree(X(tx), Y(ty2), (14 + R() * 6) * U, R() < 0.5 ? '#6f8f52' : '#87a060');
    }
    label('MARDLE WOOD', 0.13, 0.975, 19, { caps: true });

    // ---- the parish bounds, a dotted vermilion line with its stones
    ctx.setLineDash([2 * U, 6 * U]); ctx.strokeStyle = 'rgba(178,58,38,0.7)'; ctx.lineWidth = 2.4 * U;
    var BND = [[0.36, 0.3], [0.2, 0.31], [0.08, 0.36], [0.05, 0.5], [0.07, 0.66], [0.17, 0.72], [0.34, 0.73], [0.44, 0.7], [0.47, 0.6]];
    path(BND); ctx.stroke(); ctx.setLineDash([]);
    [[0.08, 0.36], [0.05, 0.5], [0.07, 0.66], [0.17, 0.72], [0.34, 0.73]].forEach(function (s) {
      ctx.fillStyle = '#cfc2a4'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U);
      ctx.fillRect(X(s[0]) - 3 * U, Y(s[1]) - 7 * U, 6 * U, 8 * U); ctx.strokeRect(X(s[0]) - 3 * U, Y(s[1]) - 7 * U, 6 * U, 8 * U);
    });
    label('the parish bounds', 0.03, 0.56, 14, { rot: -Math.PI / 2, color: VERM });

    // ---- the big names
    label('MARDLE', 0.31, 0.41, 30, { caps: true, color: VERM });
    label('THE FEN', 0.6, 0.035, 26, { caps: true, color: VERM });
    label('the abbey’s eel water', 0.78, 0.16, 15);
    label('reed beds', 0.43, 0.135, 14);
    label('the water meadow', 0.615, 0.52, 16, { rot: -1.2 });
    label('the River Lumm', 0.42, 0.79, 19, { rot: -0.95, color: '#2f4b73' });
    label('to Lynn', 0.075, 0.035, 15, { rot: 0.7 });

    // ---- compass rose and cartouche
    (function () {
      var cx = X(0.88), cy = Y(0.78), r = 40 * U;
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.6 : r;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - 0.22) * rr * 0.32, cy + Math.sin(a - 0.22) * rr * 0.32);
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        ctx.lineTo(cx + Math.cos(a + 0.22) * rr * 0.32, cy + Math.sin(a + 0.22) * rr * 0.32); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#34568c' : i === 0 ? VERM : '#e2c06a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.5, U); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, 7); ctx.fillStyle = '#e2c06a'; ctx.fill(); ctx.stroke();
      label('N', 0.88, 0.78 - 52 / 1300, 18, { caps: true, color: VERM });
    })();
    (function () {
      var cx = X(0.68), cy = Y(0.925), ww = 300 * U, hh = 62 * U;
      ctx.fillStyle = '#f6ecd2'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.6, U * 1.5);
      ctx.beginPath(); ctx.moveTo(cx - ww / 2, cy - hh / 2); ctx.lineTo(cx + ww / 2, cy - hh / 2); ctx.lineTo(cx + ww / 2, cy + hh / 2); ctx.lineTo(cx - ww / 2, cy + hh / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      [-1, 1].forEach(function (sd) {
        ctx.beginPath(); ctx.arc(cx + sd * ww / 2, cy, hh * 0.32, sd > 0 ? -Math.PI / 2 : Math.PI / 2, sd > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.fillStyle = '#e8d8b2'; ctx.fill(); ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(178,58,38,0.7)'; ctx.strokeRect(cx - ww / 2 + 5 * U, cy - hh / 2 + 5 * U, ww - 10 * U, hh - 10 * U);
      label('Mardle and the Abbey, 1331', 0.68, 0.918, 22, { caps: true });
      label('drawn by Brother Wystan, from what he was told', 0.68, 0.94, 13);
    })();

    // ---- the frame: an ink rule, a vermilion rule
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 3 * U); ctx.strokeRect(x + 8 * U, y + 8 * U, w - 16 * U, h - 16 * U);
    ctx.strokeStyle = 'rgba(178,58,38,0.8)'; ctx.lineWidth = Math.max(0.6, 1.4 * U); ctx.strokeRect(x + 15 * U, y + 15 * U, w - 30 * U, h - 30 * U);
  }

  var ART = {
    draw: function (ctx, slot, x, y, w, h, t, opts) {
      opts = opts || {};
      ctx.save();
      // a painted initial is one PNG per letter ('dropcap-O'); the procedural one draws any letter
      var img = opts.blank ? null : slot === 'dropcap' ? (opts.letter ? images['dropcap-' + opts.letter] : null) : images[slot];
      if (!img && !DRAW[slot] && /^portrait-/.test(slot)) { DRAW.portrait(ctx, x, y, w, h, t || 0, opts); ctx.restore(); return; }
      if (img) {
        var k = Math.min(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * k, dh = img.naturalHeight * k;
        if (opts.at && slot === 'corner') {   // one corner PNG (drawn top-left) mirrored for the others
          ctx.translate(x + (opts.at === 'tr' || opts.at === 'br' ? w : 0), y + (opts.at === 'bl' || opts.at === 'br' ? h : 0));
          ctx.scale(opts.at === 'tr' || opts.at === 'br' ? -1 : 1, opts.at === 'bl' || opts.at === 'br' ? -1 : 1);
          ctx.drawImage(img, 0, 0, dw, dh);
        } else ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else if (DRAW[slot]) DRAW[slot](ctx, x, y, w, h, t || 0, opts);
      ctx.restore();
    },
    canvas: function (slot, w, h, opts) {
      var c = document.createElement('canvas');
      c.className = 'art art-' + slot;
      c._art = { slot: slot, w: w, h: h, opts: opts || {} };
      c.setAttribute('aria-hidden', 'true');
      ART.paint(c);
      return c;
    },
    paint: function (c) {
      var a = c._art; if (!a) return;
      var dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(a.w * dpr); c.height = Math.round(a.h * dpr);
      c.style.width = a.w + 'px'; c.style.height = a.h + 'px';
      var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, a.w, a.h);
      ART.draw(ctx, a.slot, 0, 0, a.w, a.h, 0, a.opts);
    },
    repaintAll: function () { Array.prototype.forEach.call(document.querySelectorAll('canvas.art'), ART.paint); },
    has: function (slot) { return !!images[slot]; },
    image: function (slot) { return images[slot] || null; },   // the loaded PNG (.src carries the manifest ?v=), for full-size views
    load: function (base) {
      base = base || 'art/';
      if (typeof fetch === 'undefined') return Promise.resolve();
      // the procedural art is already on screen, so nothing waits on this. The slots drawn on the screen showing
      // now load first, each repainting its own canvases as it lands; the rest (map, portraits, other drop caps,
      // about 3 MB) follow once those are in, so they never compete with the title page's art
      function slotOf(c) { var a = c._art; return a.slot === 'dropcap' ? (a.opts.letter ? 'dropcap-' + a.opts.letter : null) : a.slot; }
      function repaintSlot(slot) {
        Array.prototype.forEach.call(document.querySelectorAll('canvas.art'), function (c) { if (c._art && slotOf(c) === slot) ART.paint(c); });
      }
      function fetchAll(m, slots) {
        return Promise.all(slots.map(function (slot) {
          var e = typeof m[slot] === 'string' ? { file: m[slot] } : (m[slot] || {});
          if (!e.file) return null;
          return new Promise(function (res) {
            var img = new Image();
            img.onload = function () { images[slot] = img; repaintSlot(slot); res(); };
            img.onerror = function () { res(); };
            img.src = base + e.file + (e.v != null ? '?v=' + e.v : '');
          });
        }));
      }
      return fetch(base + 'manifest.json?v=25', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        m = m || {};
        var onScreen = [];
        Array.prototype.forEach.call(document.querySelectorAll('canvas.art'), function (c) {
          var s = c._art && slotOf(c); if (s && m[s] && onScreen.indexOf(s) < 0) onScreen.push(s);
        });
        return fetchAll(m, onScreen).then(function () {
          return fetchAll(m, Object.keys(m).filter(function (s) { return onScreen.indexOf(s) < 0; }));
        });
      }).then(function () { ART.repaintAll(); }).catch(function () {});
    },
    slots: function () { return Object.keys(DRAW); },
    // map marker positions as fractions of the map (0-1), shared with any PNG that replaces the drawn map
    MAP_PLACES: MAP_PLACES.map(function (r) { return { id: r[0], label: r[1], fx: r[2], fy: r[3], re: r[4] }; }),
    MAP_ASPECT: 1.3,
    _DRAW: DRAW
  };
  window.ART = ART;
})();
