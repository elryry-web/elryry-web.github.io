/* Vellum & Vermilion — drolleries: the little creatures in the margin.
   Each is an ART slot "drollery.<id>" drawn in a square box; a PNG named in art/manifest.json replaces it.
   opts.awake 0..1 — 0 asleep (slow breathing, eyes shut), rising to 1 as it wakes on the page's solving;
   t (ms) drives the idle loop once awake. Drawn in a 100x100 unit box: ink outlines, flat pigment, a little gold. */
(function () {
  'use strict';
  var ART = window.ART, INK = ART.INK, PIG = ART.PIG;
  var GOLD = '#d9ac45', VELL = '#fbf3dc', SKIN = '#efc9a2';

  function shape(g, fill, path) { g.beginPath(); path(); if (fill) { g.fillStyle = fill; g.fill(); } g.stroke(); }
  function ell(g, x, y, rx, ry, rot) { g.ellipse(x, y, rx, ry, rot || 0, 0, 6.283); }
  function eye(g, x, y, r, open) {
    if (open >= 0.5) {
      shape(g, VELL, function () { g.arc(x, y, r, 0, 6.283); });
      g.fillStyle = INK; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.1, r * 0.5, 0, 6.283); g.fill();
    } else { g.beginPath(); g.arc(x, y - r * 0.3, r, 0.35, Math.PI - 0.35); g.stroke(); }
  }
  function zzz(g, x, y, t) {
    g.save(); g.fillStyle = 'rgba(42,27,16,0.55)'; g.font = 'italic 11px Georgia, serif';
    for (var i = 0; i < 2; i++) {
      var k = ((t / 2200) + i * 0.5) % 1;
      g.globalAlpha = Math.sin(k * Math.PI) * 0.8;
      g.fillText('z', x + k * 9 + i * 2, y - k * 14);
    }
    g.restore();
  }
  function sparkle(g, x, y, k) {   // the gold glint of waking
    if (k <= 0 || k >= 1) return;
    var r = 4 + 9 * Math.sin(k * Math.PI);
    g.save(); g.globalAlpha = Math.sin(k * Math.PI); g.fillStyle = GOLD; g.lineWidth = 1.2;
    g.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function ground(g, y) {
    g.save(); g.strokeStyle = 'rgba(42,27,16,0.45)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(8, y); g.quadraticCurveTo(50, y - 3, 92, y); g.stroke();
    g.fillStyle = PIG.verdigris.base;
    [18, 30, 74, 86].forEach(function (x, i) { g.beginPath(); g.moveTo(x, y - 1); g.quadraticCurveTo(x + 2, y - 7 - i % 2 * 2, x + 4, y - 1); g.fill(); });
    g.restore();
  }

  // pose helper: a = awake 0..1. Before 0.35 the creature sleeps; after, it's up. hop rises in between.
  function phase(o, t) {
    var a = o.awake || 0, up = a > 0.35;
    return { a: a, up: up, hop: Math.sin(clamp01(a) * Math.PI) * 7, breath: Math.sin(t / 700) * (up ? 0.6 : 1.6), t: t, s: t / 1000 };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  var D = {};

  /* the knight who fights a snail, lance couched */
  D.snail = function (g, P) {
    ground(g, 88);
    // snail: shell spiral, foot, eye stalks
    var ext = P.up ? 1 : 0.15, sx = 70;
    g.fillStyle = '#c7b48e';
    shape(g, '#c7b48e', function () { g.moveTo(sx - 18, 87); g.quadraticCurveTo(sx - 6, 80, sx + 6, 82); g.quadraticCurveTo(sx + 16 + ext * 6, 78, sx + 20 + ext * 4, 70 + (1 - ext) * 10); g.quadraticCurveTo(sx + 22, 86, sx + 12, 88); g.closePath(); });
    if (P.up) {
      g.beginPath(); g.moveTo(sx + 18, 72); g.lineTo(sx + 22, 60 + Math.sin(P.s * 3) * 1.5); g.moveTo(sx + 15, 73); g.lineTo(sx + 14, 61); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(sx + 22, 60 + Math.sin(P.s * 3) * 1.5, 1.8, 0, 6.283); g.arc(sx + 14, 61, 1.8, 0, 6.283); g.fill();
    }
    shape(g, PIG.orpiment.base, function () { g.arc(sx, 72 + P.breath * 0.5, 15, 0, 6.283); });
    g.strokeStyle = PIG.vermilion.dark; g.beginPath();
    for (var i = 0; i < 40; i++) { var a = i * 0.42, r = 13 - i * 0.31; g.lineTo(sx + Math.cos(a) * r, 72 + P.breath * 0.5 + Math.sin(a) * r); }
    g.stroke(); g.strokeStyle = INK;
    // knight
    var lunge = P.up ? Math.max(0, Math.sin(P.s * 2.4)) * 5 : 0, kx = 22 + lunge, ky = 88 - P.hop;
    if (!P.up) {   // asleep sitting against his shield
      shape(g, PIG.lapis.base, function () { g.moveTo(12, 60); g.lineTo(30, 60); g.quadraticCurveTo(30, 80, 21, 88); g.quadraticCurveTo(12, 80, 12, 60); });
      g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.moveTo(21, 63); g.lineTo(21, 82); g.moveTo(14, 70); g.lineTo(28, 70); g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
      shape(g, PIG.vermilion.base, function () { ell(g, 34, 78 + P.breath * 0.4, 8, 10); });
      shape(g, '#b8b6b2', function () { g.arc(36, 64 + P.breath * 0.6, 7, 0, 6.283); });
      g.beginPath(); g.moveTo(31, 64 + P.breath * 0.6); g.lineTo(41, 64 + P.breath * 0.6); g.stroke();
      g.lineWidth = 2.4; g.beginPath(); g.moveTo(40, 87); g.lineTo(60, 52); g.stroke(); g.lineWidth = 2;
      zzz(g, 42, 56, P.t);
      return;
    }
    // legs
    g.lineWidth = 3; g.beginPath(); g.moveTo(kx - 3, ky - 14); g.lineTo(kx - 7, ky); g.moveTo(kx + 3, ky - 14); g.lineTo(kx + 6, ky); g.stroke(); g.lineWidth = 2;
    shape(g, PIG.vermilion.base, function () { g.moveTo(kx - 8, ky - 30); g.lineTo(kx + 8, ky - 30); g.lineTo(kx + 10, ky - 13); g.lineTo(kx - 10, ky - 13); g.closePath(); });
    g.fillStyle = GOLD; g.fillRect(kx - 9, ky - 18, 18, 2.5);
    shape(g, '#b8b6b2', function () { g.moveTo(kx - 7, ky - 31); g.lineTo(kx - 7, ky - 43); g.quadraticCurveTo(kx, ky - 49, kx + 7, ky - 43); g.lineTo(kx + 7, ky - 31); g.closePath(); });
    g.beginPath(); g.moveTo(kx - 2, ky - 39); g.lineTo(kx + 7, ky - 39); g.stroke();
    shape(g, PIG.vermilion.base, function () { g.moveTo(kx, ky - 48); g.quadraticCurveTo(kx - 10, ky - 56, kx - 14, ky - 46); g.quadraticCurveTo(kx - 6, ky - 50, kx, ky - 48); });
    // lance, couched at the snail
    g.lineWidth = 3; g.beginPath(); g.moveTo(kx - 8, ky - 22); g.lineTo(kx + 38, ky - 20); g.stroke(); g.lineWidth = 2;
    shape(g, GOLD, function () { g.moveTo(kx + 38, ky - 23); g.lineTo(kx + 45, ky - 20); g.lineTo(kx + 38, ky - 17); g.closePath(); });
    shape(g, PIG.lapis.base, function () { g.moveTo(kx - 14, ky - 34); g.lineTo(kx - 2, ky - 34); g.quadraticCurveTo(kx - 2, ky - 20, kx - 8, ky - 15); g.quadraticCurveTo(kx - 14, ky - 20, kx - 14, ky - 34); });
    g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(kx - 8, ky - 32); g.lineTo(kx - 8, ky - 19); g.moveTo(kx - 12, ky - 27); g.lineTo(kx - 4, ky - 27); g.stroke();
  };

  /* the hare who has learned archery */
  D.rabbit = function (g, P) {
    ground(g, 88);
    var fur = '#d9cdb5';
    if (!P.up) {
      shape(g, fur, function () { ell(g, 50, 76 - P.breath * 0.6, 24, 13 + P.breath * 0.6); });
      shape(g, fur, function () { ell(g, 30, 72, 10, 8); });
      shape(g, fur, function () { ell(g, 40, 64, 16, 4, 0.15); });
      shape(g, fur, function () { ell(g, 42, 60, 15, 3.5, 0.05); });
      eye(g, 26, 71, 2.6, 0); g.fillStyle = PIG.vermilion.light; g.beginPath(); g.arc(21, 73, 1.5, 0, 6.283); g.fill();
      // bow laid down
      g.strokeStyle = PIG.vermilion.dark; g.lineWidth = 2.5; g.beginPath(); g.arc(62, 108, 26, -2.3, -0.85); g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
      zzz(g, 20, 58, P.t);
      return;
    }
    var draw = (Math.sin(P.s * 1.6) + 1) / 2, y0 = -P.hop;
    shape(g, fur, function () { ell(g, 46, 70 + y0, 13, 18); });
    shape(g, fur, function () { ell(g, 40, 87 + y0, 9, 3); });
    shape(g, fur, function () { ell(g, 52, 87 + y0, 9, 3); });
    // ears
    shape(g, fur, function () { ell(g, 40, 30 + y0, 4.5, 13, -0.2); });
    shape(g, fur, function () { ell(g, 49, 29 + y0, 4.5, 13, 0.25); });
    g.fillStyle = PIG.vermilion.light; g.beginPath(); ell(g, 49, 30 + y0, 1.8, 9, 0.25); g.fill();
    shape(g, fur, function () { ell(g, 47, 47 + y0, 10, 9); });
    eye(g, 52, 45 + y0, 2.6, 1);
    g.fillStyle = PIG.vermilion.base; g.beginPath(); g.arc(57, 49 + y0, 1.5, 0, 6.283); g.fill();
    // green hood/tunic band
    shape(g, PIG.verdigris.base, function () { g.moveTo(34, 60 + y0); g.lineTo(58, 60 + y0); g.lineTo(60, 75 + y0); g.lineTo(32, 75 + y0); g.closePath(); });
    // bow and arrow, drawn back and loosed in a loop
    var bx = 74, by = 64 + y0, pull = 4 + draw * 9;
    g.strokeStyle = PIG.vermilion.dark; g.lineWidth = 3; g.beginPath(); g.arc(bx - 20, by, 22, -1.0, 1.0); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); g.moveTo(bx - 8.5, by - 18.5); g.lineTo(bx - 8 - pull, by); g.lineTo(bx - 8.5, by + 18.5); g.stroke();
    g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx - 8 - pull, by); g.lineTo(bx + 14, by); g.stroke();
    shape(g, GOLD, function () { g.moveTo(bx + 14, by - 3); g.lineTo(bx + 20, by); g.lineTo(bx + 14, by + 3); g.closePath(); });
    g.lineWidth = 2;
    shape(g, fur, function () { ell(g, bx - 8 - pull, by, 3.5, 3); });
    shape(g, fur, function () { ell(g, bx, by + 1, 3.5, 3); });
  };

  /* the cat who bats a mouse */
  D.cat = function (g, P) {
    ground(g, 88);
    var fur = '#9aa0ad';
    if (!P.up) {
      shape(g, fur, function () { ell(g, 50, 76 - P.breath * 0.5, 26, 12 + P.breath * 0.5); });
      g.lineWidth = 5; g.strokeStyle = INK; g.beginPath(); g.arc(50, 78, 25, 0.2, 1.8); g.stroke();
      g.lineWidth = 3; g.strokeStyle = fur; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
      shape(g, fur, function () { ell(g, 30, 74, 11, 9); });
      shape(g, fur, function () { g.moveTo(22, 69); g.lineTo(23, 60); g.lineTo(29, 66); });
      shape(g, fur, function () { g.moveTo(31, 66); g.lineTo(36, 59); g.lineTo(38, 68); });
      eye(g, 27, 74, 2.4, 0); eye(g, 34, 74, 2.4, 0);
      zzz(g, 40, 58, P.t);
      return;
    }
    var bat = Math.max(0, Math.sin(P.s * 3.1)), y0 = -P.hop, mx = 76 + Math.sin(P.s * 1.55) * 6;
    // tail
    g.lineWidth = 5; g.beginPath(); g.moveTo(26, 82 + y0); g.quadraticCurveTo(8, 78, 14, 58 + Math.sin(P.s * 2) * 3); g.stroke();
    g.lineWidth = 3; g.strokeStyle = fur; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    shape(g, fur, function () { ell(g, 36, 72 + y0, 15, 16); });
    shape(g, fur, function () { ell(g, 40, 48 + y0, 12, 10); });
    shape(g, fur, function () { g.moveTo(31, 42 + y0); g.lineTo(31, 31 + y0); g.lineTo(38, 39 + y0); });
    shape(g, fur, function () { g.moveTo(42, 39 + y0); g.lineTo(49, 31 + y0); g.lineTo(50, 42 + y0); });
    eye(g, 41, 47 + y0, 2.6, 1); eye(g, 48, 47 + y0, 2.6, 1);
    g.beginPath(); g.moveTo(45, 52 + y0); g.lineTo(58, 50 + y0); g.moveTo(45, 53 + y0); g.lineTo(58, 55 + y0); g.stroke();
    // batting paw
    var px = 54 + bat * 12, py = 70 - bat * 10 + y0;
    g.lineWidth = 7; g.beginPath(); g.moveTo(44, 66 + y0); g.lineTo(px, py); g.stroke();
    g.lineWidth = 5; g.strokeStyle = fur; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    shape(g, fur, function () { g.arc(px, py, 4, 0, 6.283); });
    // mouse
    var my = 85 - Math.max(0, Math.sin(P.s * 3.1 - 0.4)) * 6;
    shape(g, '#b5a28a', function () { ell(g, mx, my, 7, 4); });
    shape(g, '#b5a28a', function () { g.arc(mx - 4, my - 4, 2.6, 0, 6.283); });
    g.beginPath(); g.moveTo(mx + 7, my); g.quadraticCurveTo(mx + 14, my - 6, mx + 16, my + 1); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(mx - 6, my - 1, 0.9, 0, 6.283); g.fill();
  };

  /* the fox in a monk's cowl, reading */
  D.fox = function (g, P) {
    ground(g, 88);
    var fox = '#cf7a32', cowl = '#6b5644', nod = P.up ? Math.sin(P.s * 0.9) * 1.5 : 7 + P.breath;
    shape(g, cowl, function () { g.moveTo(30, 88); g.quadraticCurveTo(26, 56, 46, 46); g.quadraticCurveTo(66, 56, 64, 88); g.closePath(); });
    // tail curling out from the habit
    shape(g, fox, function () { g.moveTo(62, 86); g.quadraticCurveTo(86, 86, 84, 66); g.quadraticCurveTo(78, 78, 62, 80); g.closePath(); });
    shape(g, VELL, function () { g.moveTo(84, 66); g.quadraticCurveTo(86, 72, 80, 76); g.quadraticCurveTo(80, 70, 84, 66); });
    // head in the hood
    g.save(); g.translate(46, 40 + nod - P.hop);
    shape(g, cowl, function () { g.arc(0, 0, 14, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(13, 10); g.lineTo(-13, 10); g.closePath(); });
    shape(g, fox, function () { g.moveTo(-9, -2); g.quadraticCurveTo(0, -8, 9, -2); g.lineTo(3, 12); g.quadraticCurveTo(0, 15, -3, 12); g.closePath(); });
    shape(g, VELL, function () { g.moveTo(-5, 6); g.lineTo(0, 15); g.lineTo(5, 6); g.quadraticCurveTo(0, 9, -5, 6); });
    g.fillStyle = INK; g.beginPath(); g.arc(0, 14, 1.6, 0, 6.283); g.fill();
    shape(g, fox, function () { g.moveTo(-8, -6); g.lineTo(-12, -16); g.lineTo(-3, -9); });
    shape(g, fox, function () { g.moveTo(8, -6); g.lineTo(12, -16); g.lineTo(3, -9); });
    eye(g, -4, 2, 1.9, P.up ? 1 : 0); eye(g, 4, 2, 1.9, P.up ? 1 : 0);
    g.restore();
    // the book
    var by = 66 - P.hop;
    if (P.up) {
      var turn = (P.s * 0.45) % 1, fl = turn < 0.25 ? Math.cos(turn / 0.25 * Math.PI) : 1;
      shape(g, PIG.vermilion.dark, function () { g.moveTo(30, by); g.lineTo(64, by); g.lineTo(62, by + 10); g.lineTo(32, by + 10); g.closePath(); });
      shape(g, VELL, function () { g.moveTo(47, by + 2); g.lineTo(33, by - 2); g.lineTo(33, by + 8); g.lineTo(47, by + 10); g.closePath(); });
      shape(g, VELL, function () { g.moveTo(47, by + 2); g.lineTo(61, by - 2); g.lineTo(61, by + 8); g.lineTo(47, by + 10); g.closePath(); });
      if (fl < 1) shape(g, VELL, function () { g.moveTo(47, by + 2); g.lineTo(47 + 14 * fl, by - 2 - (1 - Math.abs(fl)) * 5); g.lineTo(47 + 14 * fl, by + 8 - (1 - Math.abs(fl)) * 5); g.lineTo(47, by + 10); g.closePath(); });
      g.strokeStyle = PIG.vermilion.base; g.lineWidth = 1;
      [1, 4].forEach(function (d) { g.beginPath(); g.moveTo(36, by + d); g.lineTo(44, by + d + 1); g.moveTo(50, by + d + 1); g.lineTo(58, by + d); g.stroke(); });
      g.strokeStyle = INK; g.lineWidth = 2;
      g.fillStyle = GOLD; g.beginPath(); g.arc(37, by + 1, 1.6, 0, 6.283); g.fill();
    } else {
      shape(g, PIG.vermilion.dark, function () { g.rect(36, by + 4, 22, 7); });
      g.fillStyle = GOLD; g.fillRect(45, by + 5.5, 4, 4);
      zzz(g, 60, 34, P.t);
    }
    // paws on the book
    shape(g, fox, function () { ell(g, 36, by + 8, 4, 3); });
    shape(g, fox, function () { ell(g, 58, by + 8, 4, 3); });
  };

  /* the owl */
  D.owl = function (g, P) {
    g.lineWidth = 4; g.strokeStyle = '#6b4a2a'; g.beginPath(); g.moveTo(10, 86); g.quadraticCurveTo(50, 80, 92, 88); g.stroke();
    g.lineWidth = 2; g.strokeStyle = INK;
    g.fillStyle = PIG.verdigris.base; g.beginPath(); ell(g, 84, 82, 6, 3, -0.4); g.fill(); g.stroke();
    var body = '#9a7550', tilt = P.up ? Math.sin(P.s * 0.8) * 0.18 : 0, y0 = -P.hop, br = P.breath;
    shape(g, body, function () { ell(g, 50, 62 + y0, 18 + br * 0.4, 22); });
    shape(g, '#e9d2a3', function () { ell(g, 50, 66 + y0, 11, 15); });
    g.strokeStyle = '#8a6440'; g.lineWidth = 1.2;
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { g.beginPath(); g.arc(44 + j * 6, 60 + i * 7 + y0, 2.4, 0.3, Math.PI - 0.3); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 2;
    // wings
    var flap = P.up ? Math.max(0, Math.sin(P.s * 1.3 * Math.PI)) * 0.4 * (Math.sin(P.s * 0.4) > 0.6 ? 1 : 0) : 0;
    shape(g, body, function () { ell(g, 34, 62 + y0, 6, 16, 0.15 + flap); });
    shape(g, body, function () { ell(g, 66, 62 + y0, 6, 16, -0.15 - flap); });
    // feet
    g.strokeStyle = PIG.orpiment.dark; g.beginPath(); g.moveTo(45, 83); g.lineTo(45, 87); g.moveTo(55, 83); g.lineTo(55, 87); g.stroke(); g.strokeStyle = INK;
    // head
    g.save(); g.translate(50, 36 + y0); g.rotate(tilt);
    shape(g, body, function () { g.moveTo(-16, -8); g.lineTo(-12, -18); g.lineTo(-6, -10); g.quadraticCurveTo(0, -12, 6, -10); g.lineTo(12, -18); g.lineTo(16, -8); g.quadraticCurveTo(18, 10, 0, 12); g.quadraticCurveTo(-18, 10, -16, -8); });
    var blink = P.up && (P.t % 3400) < 140 ? 0 : (P.up ? 1 : 0);
    [-7, 7].forEach(function (x) {
      shape(g, '#e9d2a3', function () { g.arc(x, 0, 6.5, 0, 6.283); });
      if (blink) { shape(g, PIG.orpiment.base, function () { g.arc(x, 0, 4.4, 0, 6.283); }); g.fillStyle = INK; g.beginPath(); g.arc(x, 0, 2.4, 0, 6.283); g.fill(); }
      else { g.beginPath(); g.arc(x, -1.5, 4, 0.4, Math.PI - 0.4); g.stroke(); }
    });
    shape(g, GOLD, function () { g.moveTo(-2.5, 4); g.lineTo(2.5, 4); g.lineTo(0, 9); g.closePath(); });
    g.restore();
    if (!P.up) zzz(g, 66, 26, P.t);
  };

  /* the fish-bird */
  D.fishbird = function (g, P) {
    // little waves below
    g.strokeStyle = PIG.lapis.base; g.lineWidth = 1.6;
    for (var i = 0; i < 4; i++) { g.beginPath(); g.arc(18 + i * 20, 90, 6, Math.PI, 0); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 2;
    var bob = P.up ? Math.sin(P.s * 2.2) * 3 : P.breath, y0 = 60 + bob - P.hop;
    // fish body and tail
    shape(g, PIG.lapis.light, function () { g.moveTo(26, y0); g.quadraticCurveTo(48, y0 - 16, 70, y0 - 2); g.quadraticCurveTo(48, y0 + 14, 26, y0); });
    shape(g, PIG.lapis.base, function () { g.moveTo(28, y0); g.lineTo(14, y0 - 10 + (P.up ? Math.sin(P.s * 5) * 3 : 0)); g.lineTo(18, y0); g.lineTo(14, y0 + 10 - (P.up ? Math.sin(P.s * 5) * 3 : 0)); g.closePath(); });
    g.strokeStyle = PIG.lapis.dark; g.lineWidth = 1;
    for (i = 0; i < 4; i++) { g.beginPath(); g.arc(40 + i * 6, y0, 3.2, -0.9, 0.9); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 2;
    // a bird's wing
    var flap = P.up ? Math.sin(P.s * 7) * 0.6 : -0.1;
    g.save(); g.translate(48, y0 - 6); g.rotate(-0.4 + flap);
    shape(g, PIG.vermilion.base, function () { g.moveTo(0, 0); g.quadraticCurveTo(-6, -20, -18, -24); g.quadraticCurveTo(-10, -10, -14, -6); g.quadraticCurveTo(-6, -4, 0, 0); });
    g.strokeStyle = GOLD; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(-8, -14, -15, -19); g.stroke();
    g.restore(); g.strokeStyle = INK; g.lineWidth = 2;
    // a bird's head on a neck
    var hx = 74, hy = y0 - 12 + (P.up ? 0 : 10);
    g.lineWidth = 6; g.beginPath(); g.moveTo(66, y0 - 3); g.quadraticCurveTo(74, y0 - 6, hx, hy); g.stroke();
    g.lineWidth = 3.8; g.strokeStyle = PIG.lapis.light; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    shape(g, PIG.verdigris.base, function () { g.arc(hx, hy, 6, 0, 6.283); });
    shape(g, GOLD, function () { g.moveTo(hx + 5, hy - 2); g.lineTo(hx + 14, hy + (P.up && (P.t % 1800) < 300 ? -3 : 1)); g.lineTo(hx + 5, hy + 2); g.closePath(); });
    eye(g, hx + 1, hy - 1, 2, P.up ? 1 : 0);
    if (!P.up) zzz(g, 82, 44, P.t);
  };

  /* the monkey with bagpipes */
  D.monkey = function (g, P) {
    ground(g, 88);
    var fur = '#8a6a4a', face = '#e6c39a', y0 = -P.hop, puff = P.up ? (Math.sin(P.s * 4) + 1) / 2 : 0;
    // tail
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(34, 84); g.quadraticCurveTo(14, 86, 16, 70); g.quadraticCurveTo(18, 62, 24, 66); g.stroke();
    g.lineWidth = 2;
    shape(g, fur, function () { ell(g, 46, 72 + y0, 15, 15); });
    shape(g, fur, function () { ell(g, 38, 86, 7, 3); });
    shape(g, fur, function () { ell(g, 54, 86, 7, 3); });
    // bagpipes: bag under the arm, chanter down, drones up
    var bag = P.up ? 1 - puff * 0.18 : 0.75;
    shape(g, PIG.vermilion.base, function () { ell(g, 60, 68 + y0, 11 * bag + 2, 9 * bag + 1, -0.3); });
    g.fillStyle = GOLD;
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 62 + y0); g.lineTo(78, 40 + y0); g.moveTo(66, 64 + y0); g.lineTo(86, 50 + y0); g.stroke();
    g.beginPath(); g.moveTo(54, 74 + y0); g.lineTo(54, 88); g.stroke(); g.lineWidth = 2;
    g.beginPath(); g.arc(78, 40 + y0, 2.4, 0, 6.283); g.arc(86, 50 + y0, 2.4, 0, 6.283); g.fill();
    // head
    var hy = (P.up ? 44 : 52 + P.breath) + y0;
    shape(g, fur, function () { g.arc(44, hy, 11, 0, 6.283); });
    shape(g, fur, function () { g.arc(33, hy - 1, 3.5, 0, 6.283); });
    shape(g, face, function () { ell(g, 46, hy + 2, 7.5, 7); });
    eye(g, 43, hy - 1, 1.9, P.up ? 1 : 0); eye(g, 49, hy - 1, 1.9, P.up ? 1 : 0);
    if (P.up) {
      shape(g, face, function () { g.arc(52, hy + 5, 2.6 + puff * 2.2, 0, 6.283); });   // puffed cheek on the blowpipe
      g.lineWidth = 2.4; g.beginPath(); g.moveTo(53, hy + 6); g.lineTo(58, hy + 14); g.stroke(); g.lineWidth = 2;
      // notes float off
      g.fillStyle = INK;
      for (var i = 0; i < 2; i++) {
        var k = ((P.s * 0.5) + i * 0.5) % 1, nx = 80 + k * 10, ny = 34 - k * 22;
        g.globalAlpha = Math.sin(k * Math.PI);
        g.beginPath(); ell(g, nx, ny, 2.6, 2, -0.4); g.fill();
        g.beginPath(); g.moveTo(nx + 2.4, ny); g.lineTo(nx + 2.4, ny - 9); g.lineTo(nx + 6, ny - 7); g.stroke();
      }
      g.globalAlpha = 1;
    } else { g.beginPath(); g.arc(46, hy + 5, 2, 0.2, Math.PI - 0.2); g.stroke(); zzz(g, 30, 36, P.t); }
  };

  /* the dragon nibbling the border */
  D.dragon = function (g, P) {
    // a strip of knotted border down the left, with a bite out of it
    g.save();
    g.fillStyle = '#e8d9b4'; g.fillRect(4, 6, 14, 88); g.strokeRect(4, 6, 14, 88);
    g.strokeStyle = PIG.lapis.base; g.lineWidth = 3;
    g.beginPath(); for (var i = 0; i <= 22; i++) { var yy = 8 + i * 4; g.lineTo(11 + Math.sin(i * 1.3) * 4, yy); } g.stroke();
    g.fillStyle = '#efe4c6'; g.beginPath(); g.arc(20, 50, 6, 0, 6.283); g.fill();
    g.restore(); g.strokeStyle = INK; g.lineWidth = 2;
    var body = PIG.verdigris.base, y0 = -P.hop, chew = P.up ? Math.max(0, Math.sin(P.s * 3.4)) : 0;
    // tail curl
    g.lineWidth = 7; g.beginPath(); g.moveTo(66, 80); g.quadraticCurveTo(94, 84, 90, 64); g.quadraticCurveTo(86, 54, 80, 62); g.stroke();
    g.lineWidth = 4.5; g.strokeStyle = body; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    shape(g, PIG.vermilion.base, function () { g.moveTo(80, 62); g.lineTo(74, 58); g.lineTo(78, 66); g.closePath(); });
    // body
    shape(g, body, function () { ell(g, 58, 72 + y0, 17, 11 + P.breath * 0.4); });
    shape(g, PIG.orpiment.light, function () { ell(g, 56, 77 + y0, 12, 4.5); });
    // wing
    var wf = P.up ? Math.sin(P.s * 1.7) * 0.25 : 0.25;
    g.save(); g.translate(60, 64 + y0); g.rotate(-0.5 - wf);
    shape(g, PIG.vermilion.base, function () { g.moveTo(0, 0); g.lineTo(2, -24); g.quadraticCurveTo(8, -16, 16, -18); g.quadraticCurveTo(12, -8, 20, -4); g.closePath(); });
    g.strokeStyle = GOLD; g.lineWidth = 1.2; g.beginPath(); g.moveTo(1, -2); g.lineTo(2, -22); g.moveTo(2, -3); g.lineTo(14, -16); g.stroke();
    g.restore(); g.strokeStyle = INK; g.lineWidth = 2;
    // legs
    g.lineWidth = 3; g.beginPath(); g.moveTo(50, 80 + y0); g.lineTo(48, 88); g.moveTo(66, 80 + y0); g.lineTo(68, 88); g.stroke(); g.lineWidth = 2;
    // neck and head: reaching for the border when awake, tucked when asleep
    var hx = P.up ? 30 - chew * 4 : 44, hy = P.up ? 50 : 78 + P.breath * 0.5;
    g.lineWidth = 8; g.beginPath(); g.moveTo(46, 68 + y0); g.quadraticCurveTo(40, 56, hx + 6, hy + y0); g.stroke();
    g.lineWidth = 5.5; g.strokeStyle = body; g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    g.save(); g.translate(hx, hy + y0); if (!P.up) g.rotate(0.5);
    var jaw = P.up ? chew * 0.45 : 0;
    g.save(); g.rotate(jaw);
    shape(g, body, function () { g.moveTo(2, 1); g.lineTo(-10, 2); g.lineTo(2, 5); g.closePath(); });
    g.restore();
    shape(g, body, function () { g.moveTo(8, -5); g.quadraticCurveTo(-4, -8, -12, -1); g.lineTo(4, 3); g.quadraticCurveTo(10, 2, 8, -5); });
    shape(g, PIG.vermilion.base, function () { g.moveTo(6, -5); g.lineTo(12, -11); g.lineTo(9, -3); });
    eye(g, 1, -3, 1.9, P.up ? 1 : 0);
    g.restore();
    if (P.up && chew > 0.85) { g.fillStyle = '#e8d9b4'; g.fillRect(22 + Math.random() * 4, 44 + Math.random() * 12, 2, 2); }
    if (!P.up) zzz(g, 30, 64, P.t);
  };

  /* the monk shaking out his cramped hand */
  D.monk = function (g, P) {
    var habit = '#6d5a46', y0 = -P.hop;
    // desk with sloped board and an inkhorn
    g.lineWidth = 2;
    shape(g, '#8a5a32', function () { g.moveTo(54, 64); g.lineTo(92, 56); g.lineTo(92, 62); g.lineTo(56, 70); g.closePath(); });
    g.beginPath(); g.moveTo(64, 68); g.lineTo(62, 92); g.moveTo(86, 62); g.lineTo(88, 92); g.stroke();
    shape(g, VELL, function () { g.moveTo(60, 63); g.lineTo(84, 58); g.lineTo(85, 60); g.lineTo(61, 65.5); g.closePath(); });
    shape(g, INK, function () { g.moveTo(88, 54); g.lineTo(92, 46); g.lineTo(94, 47); g.lineTo(91, 55); g.closePath(); });
    // body
    shape(g, habit, function () { g.moveTo(26, 92); g.quadraticCurveTo(24, 62, 42, 56); g.quadraticCurveTo(58, 60, 58, 92); g.closePath(); });
    g.strokeStyle = GOLD; g.lineWidth = 1.6; g.beginPath(); g.moveTo(32, 78); g.quadraticCurveTo(42, 82, 54, 78); g.stroke(); g.strokeStyle = INK; g.lineWidth = 2;
    // head: tonsure
    var hx = P.up ? 42 : 52, hy = (P.up ? 44 : 56 + P.breath * 0.6) + y0;
    g.save(); g.translate(hx, hy); if (!P.up) g.rotate(0.9);
    shape(g, SKIN, function () { g.arc(0, 0, 9, 0, 6.283); });
    shape(g, '#7a4f2c', function () { g.arc(0, 0, 9, Math.PI * 1.05, Math.PI * 1.95, false); g.arc(0, -3, 6.5, Math.PI * 1.9, Math.PI * 1.1, true); g.closePath(); });
    eye(g, 3, 1, 1.6, P.up ? 1 : 0);
    if (P.up) { g.beginPath(); g.moveTo(1, 5); g.quadraticCurveTo(4, 3.5, 6, 5.5); g.stroke(); }   // a grimace
    g.restore();
    if (!P.up) {
      g.lineWidth = 5; g.strokeStyle = habit; g.beginPath(); g.moveTo(46, 64); g.lineTo(62, 62); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2; zzz(g, 60, 42, P.t);
      return;
    }
    // the cramped hand, shaken hard
    var sh = Math.sin(P.s * 22) * (Math.sin(P.s * 1.3) > -0.2 ? 1 : 0.15);
    var ex = 52, ey = 62 + y0, wx = 60 + sh * 3, wy = 46 + y0 + Math.abs(sh) * 2;
    g.lineWidth = 6; g.strokeStyle = habit; g.beginPath(); g.moveTo(44, 62 + y0); g.lineTo(ex, ey); g.lineTo(wx, wy); g.stroke();
    g.lineWidth = 2; g.strokeStyle = INK;
    shape(g, SKIN, function () { g.arc(wx, wy - 2, 3.6, 0, 6.283); });
    g.save(); g.strokeStyle = 'rgba(42,27,16,0.5)'; g.lineWidth = 1.2;
    [[-6, -4], [6, -6], [7, 2]].forEach(function (o, i) { g.beginPath(); g.moveTo(wx + o[0], wy + o[1]); g.lineTo(wx + o[0] * 1.5, wy + o[1] * 1.5 - (i === 1 ? 2 : 0)); g.stroke(); });
    g.restore();
    // the quill dropped on the desk
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(66, 61); g.lineTo(82, 55); g.stroke();
    shape(g, VELL, function () { g.moveTo(82, 55); g.quadraticCurveTo(86, 50, 92, 50); g.quadraticCurveTo(88, 55, 82, 55); });
  };

  Object.keys(D).forEach(function (id) {
    ART.define('drollery.' + id, function (ctx, x, y, w, h, t, o) {
      var P = phase(o, t), s = Math.min(w, h) / 100;
      ctx.translate(x + (w - 100 * s) / 2, y + (h - 100 * s) / 2); ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      D[id](ctx, P);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      sparkle(ctx, 84, 18, (o.awake || 0) * 1.4 - 0.2);
    });
  });
  window.DROLLERIES = Object.keys(D);
})();
