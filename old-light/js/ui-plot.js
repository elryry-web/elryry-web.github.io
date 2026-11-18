/* Old Light UI: the plot. Camera, drawing, and touch/mouse input. World y is up; screen y is down. */
(function () {
  'use strict';
  var U = window.OLUI = window.OLUI || {};
  var P = U.plot = {};
  var cv, ctx, W = 0, H = 0, dpr = 1;
  var cam = { x: 0, y: 0, s: 100, follow: false };
  var C = { bg: '#05080b', grid: 'rgba(140,175,200,', amber: '#ffb54a', amberD: 'rgba(255,181,74,', cyan: '#a6e4ef', cyanD: 'rgba(166,228,239,', red: '#ff5d4f', redD: 'rgba(255,93,79,', ink: '#c8d5de', dim: '#71838f', laser: '#fff1b0' };
  var FONT = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
  var accS = {}, fsCache = { t: 0, key: '', est: null };
  P.cam = cam;

  P.init = function () {
    cv = document.getElementById('plot'); ctx = cv.getContext('2d');
    window.addEventListener('resize', resize); resize();
    cv.addEventListener('pointerdown', pdown); cv.addEventListener('pointermove', pmove); cv.addEventListener('pointerup', pup); cv.addEventListener('pointercancel', pup);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };
  function resize() {
    if (!cv) return; var r = cv.getBoundingClientRect(); dpr = Math.min(2.5, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  P.resize = resize;
  function minDim() { return Math.max(120, Math.min(W, H - 100)); }
  function clampS() { var m = minDim(); cam.s = Math.max(1 / m, Math.min(2e6 / m, cam.s)); }
  function sx(x) { return W / 2 + (x - cam.x) / cam.s; }
  function sy(y) { return H / 2 - (y - cam.y) / cam.s; }
  function wx(px) { return cam.x + (px - W / 2) * cam.s; }
  function wy(py) { return cam.y - (py - H / 2) * cam.s; }
  P.toScreen = function (x, y) { return [sx(x), sy(y)]; };

  P.onStart = function () { resize(); cam.follow = false; accS = {}; P.fit(); };
  P.fit = function () {
    var st = U.st(); if (!st) return; resize();
    var pts = [];
    st.w.ships.forEach(function (s) { if (s.side === st.P && s.status !== 'destroyed') pts.push([s.x, s.y]); });
    st.w.sides[st.P].tl.forEach(function (c) { if (c.kind === 'ship') pts.push([c.ex, c.ey]); });
    if (!pts.length) return;
    var x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var span = Math.max(x1 - x0, (y1 - y0) * W / Math.max(1, H - 110), 2000);
    cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2 + 30 * (span * 1.3 / W); cam.s = span * 1.3 / W; cam.follow = false; clampS();
  };
  P.setFollow = function (on) { cam.follow = on; };
  P.centerOn = function (x, y) { cam.x = x; cam.y = y; };

  // ---------------------------------------------------------------- drawing helpers
  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); }
  function chevron(c, x, y, ang, size, fill) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(size, 0); c.lineTo(-size * 0.75, size * 0.62); c.lineTo(-size * 0.35, 0); c.lineTo(-size * 0.75, -size * 0.62); c.closePath();
    if (fill) c.fill(); c.stroke(); c.restore();
  }
  function diamond(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); }
  // glyphs for the help overlay
  P.glyph = function (c, k, w, h) {
    c.lineWidth = 1.4; var x = w / 2, y = h / 2;
    if (k === 'own') { c.strokeStyle = C.amber; c.fillStyle = C.amber; chevron(c, x, y, -0.4, 9, true); }
    if (k === 'ghost') { c.strokeStyle = C.cyan; chevron(c, x, y, 0.3, 9, false); c.globalAlpha = 0.35; chevron(c, x - 12, y + 4, 0.3, 6, false); c.globalAlpha = 1; }
    if (k === 'est') { c.strokeStyle = C.cyan; c.setLineDash([3, 3]); line2(c, 6, y + 6, w - 10, y - 6); c.setLineDash([]); c.globalAlpha = 0.6; chevron(c, 8, y + 6, 0, 5, false); c.globalAlpha = 1; c.beginPath(); c.arc(w - 10, y - 6, 2, 0, 7); c.stroke(); }
    if (k === 'ring') { c.strokeStyle = C.cyan; c.setLineDash([3, 3]); c.beginPath(); c.arc(x, y, 12, 0, 7); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(x, y, 1.5, 0, 7); c.stroke(); }
    if (k === 'threat') { c.strokeStyle = C.red; c.fillStyle = C.red; diamond(c, x, y, 5); c.fill(); c.globalAlpha = 0.5; line2(c, x - 4, y - 4, x - 16, y - 10); c.globalAlpha = 1; }
    if (k === 'g') { ['#84d39c', '#f2d36b', '#ff8c42', '#ff5d4f'].forEach(function (col, i) { c.fillStyle = col; c.fillRect(4 + i * 9, y - 3, 7, 6); }); }
  };
  // greedy grouping of screen points that share a key and sit within 28 px of the group's first point
  function groupNear(items, keyOf) {
    var out = [];
    items.forEach(function (it) {
      var k = keyOf(it), G = null;
      for (var i = 0; i < out.length; i++) if (out[i].key === k && Math.abs(out[i].x0 - it.x) < 28 && Math.abs(out[i].y0 - it.y) < 28) { G = out[i]; break; }
      if (!G) out.push(G = { key: k, x0: it.x, y0: it.y, sx: 0, sy: 0, n: 0, items: [] });
      G.items.push(it); G.n++; G.sx += it.x; G.sy += it.y;
    });
    out.forEach(function (G) { G.x = G.sx / G.n; G.y = G.sy / G.n; });
    return out;
  }
  var wingHits = [];
  function line2(c, a, b, d, e) { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); }
  function nice(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

  // ---------------------------------------------------------------- the frame
  var labels = [];
  function label(x, y, text, col, pri, dx, dy) { labels.push({ x: x, y: y, t: text, c: col, p: pri, dx: dx == null ? 10 : dx, dy: dy == null ? -9 : dy }); }
  function placeLabels() {
    labels.sort(function (a, b) { return b.p - a.p; });
    var used = [], top = 96;
    ctx.font = FONT; ctx.textBaseline = 'middle';
    labels.forEach(function (L) {
      var w = ctx.measureText(L.t).width + 4, h = 13, tries = [[L.dx, L.dy], [L.dx, -L.dy], [-L.dx - w, L.dy], [-L.dx - w, -L.dy], [L.dx, L.dy - 13], [L.dx, -L.dy + 13]];
      for (var i = 0; i < tries.length; i++) {
        var x = L.x + tries[i][0], y = L.y + tries[i][1] - h / 2;
        if (x < 2 || x + w > W - 2 || y < top || y + h > H - 2) continue;
        var hit = false; for (var j = 0; j < used.length; j++) { var u = used[j]; if (x < u[0] + u[2] + 6 && x + w + 6 > u[0] && y < u[1] + u[3] + 1 && y + h + 1 > u[1]) { hit = true; break; } }
        if (hit) continue;
        used.push([x, y, w, h]);
        ctx.fillStyle = 'rgba(5,8,11,0.65)'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = L.c; ctx.fillText(L.t, x + 2, y + h / 2 + 0.5);
        return;
      }
    });
    labels = [];
  }

  P.draw = function (ts) {
    var st = U.st(); if (!st || !ctx) return;
    if (cv.width !== Math.round(cv.getBoundingClientRect().width * dpr)) resize();
    var w = st.w, E = U.E, f = st.frac || 0, sel = U.selShip();
    if (cam.follow && sel) { cam.x = sel.x + sel.vx * f; cam.y = sel.y + sel.vy * f; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(22,36,46,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    drawGrid();
    ctx.lineWidth = 1; ctx.font = FONT;

    // planets, sand, the convoy line
    w.planets.forEach(function (p) {
      var x = sx(p.x), y = sy(p.y), r = Math.max(3, p.r / cam.s);
      var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#1b2a33'); g.addColorStop(1, '#0b1318');
      ctx.fillStyle = g; circ(x, y, r); ctx.fill(); ctx.strokeStyle = 'rgba(150,180,200,0.35)'; ctx.stroke();
      label(x, y - r, p.name, C.dim, 2, 6, -6);
    });
    w.clouds.forEach(function (c) {
      var x = sx(c.x), y = sy(c.y), r = Math.max(2, c.r / cam.s);
      ctx.fillStyle = 'rgba(210,190,150,' + (0.12 * Math.min(1, c.dens)).toFixed(3) + ')'; circ(x, y, r); ctx.fill();
      ctx.strokeStyle = 'rgba(210,190,150,0.25)'; ctx.setLineDash([2, 4]); circ(x, y, r); ctx.stroke(); ctx.setLineDash([]);
    });
    var obj = w.scn.objective;
    if (obj && obj.lineX != null) {
      var lx = sx(obj.lineX); if (lx > -10 && lx < W + 10) { ctx.strokeStyle = C.amberD + '0.35)'; ctx.setLineDash([8, 6]); line(lx, 0, lx, H); ctx.setLineDash([]); label(lx, 110, 'convoy line', C.amberD + '0.8)', 3, 6, 0); }
    }

    // range rings for the selected ship
    if (sel && E.active(sel)) {
      var cx = sx(sel.x + sel.vx * f), cy = sy(sel.y + sel.vy * f), seen = {};
      sel.mods.forEach(function (m) {
        if (m.state === 2) return; var R = null, nm = null;
        if (m.kind === 'laser') { R = m.def.focus; nm = 'laser focus'; }
        else if (m.kind === 'pdl' || m.kind === 'flak') { R = m.def.range; nm = m.kind === 'flak' ? 'flak' : 'PD'; }
        if (!R || seen[nm]) return; seen[nm] = 1;
        var r = R / cam.s; if (r < 6 || r > 4 * Math.max(W, H)) return;
        ctx.strokeStyle = C.amberD + '0.22)'; ctx.setLineDash(nm === 'laser focus' ? [] : [2, 5]); circ(cx, cy, r); ctx.stroke(); ctx.setLineDash([]);
        label(cx + r * 0.7071, cy - r * 0.7071, nm + ' ' + U.fmtR(R), C.amberD + '0.6)', 1, 4, 0);
      });
      var lz = sel.mods.filter(function (m) { return m.kind === 'laser' && m.state < 2; })[0];
      if (lz) { var R2 = lz.def.focus / Math.sqrt(U.N.laserThr), r2 = R2 / cam.s; if (r2 > 6 && r2 < 4 * Math.max(W, H)) { ctx.strokeStyle = C.amberD + '0.12)'; ctx.setLineDash([1, 6]); circ(cx, cy, r2); ctx.stroke(); ctx.setLineDash([]); label(cx + r2 * 0.7071, cy - r2 * 0.7071, 'laser reach', C.amberD + '0.45)', 0, 4, 0); } }
    }

    // contacts: ghost trail, the dashed line to the estimate, the uncertainty ring, the hollow mark at the observed place
    var tl = w.sides[st.P].tl, tgtIds = {};
    U.ownShips().forEach(function (s) { var t = U.targetOf(s); if (t) tgtIds[t.id] = 1; });
    var eDr = [];
    tl.forEach(function (c) {
      var age = Math.max(0, c.age != null ? c.age : w.t - (c.tObs || 0)), lost = U.isLost(c, age);
      // a lost track fades over the first hour to a faint mark that stays on the plot
      var a = lost ? Math.max(0.15, 0.55 - 0.4 * age / 3600) : Math.max(0.28, Math.min(1, 1.15 - age / 900));
      var ox = sx(c.x), oy = sy(c.y), ex = sx(c.ex), ey = sy(c.ey);
      if (c.kind === 'missile') return;
      var small = c.kind === 'drone', g = st.ghosts[c.id];
      if (small) eDr.push({ x: ox, y: oy, c: c, a: a });
      if (g && !small) g.forEach(function (p, i) { ctx.fillStyle = C.cyanD + (0.06 + 0.22 * (i / g.length) * a).toFixed(3) + ')'; circ(sx(p.x), sy(p.y), 1.4); ctx.fill(); });
      var rr = U.ringOf(c, age) / cam.s;
      if (rr > 3 && rr < 3 * Math.max(W, H)) { ctx.strokeStyle = C.cyanD + (0.35 * a).toFixed(3) + ')'; ctx.setLineDash([3, 4]); circ(ex, ey, rr); ctx.stroke(); ctx.setLineDash([]); }
      if (Math.abs(ex - ox) + Math.abs(ey - oy) > 2) { ctx.strokeStyle = C.cyanD + (0.55 * a).toFixed(3) + ')'; ctx.setLineDash([3, 3]); line(ox, oy, ex, ey); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(ex, ey, 2, 0, 7); ctx.stroke(); }
      var ang = (c.vex || c.vey) ? -Math.atan2(c.vey || 0, c.vex || 0) : 0;
      ctx.strokeStyle = C.cyanD + a.toFixed(3) + ')'; ctx.lineWidth = tgtIds[c.id] ? 1.8 : 1.3;
      if (!c.firm) ctx.setLineDash([2, 2]);
      if (small) { ctx.strokeRect(ox - 3, oy - 3, 6, 6); } else chevron(ctx, ox, oy, ang, c.cls === 'carrier' || c.cls === 'cruiser' ? 10 : 8, false);
      ctx.setLineDash([]); ctx.lineWidth = 1;
      if (c.disabled) { ctx.strokeStyle = C.cyanD + '0.6)'; line(ox - 7, oy - 7, ox + 7, oy + 7); }
      if (tgtIds[c.id]) { ctx.strokeStyle = C.cyanD + '0.8)'; var b = 13; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { line(ox + q[0] * b, oy + q[1] * b, ox + q[0] * b - q[0] * 5, oy + q[1] * b); line(ox + q[0] * b, oy + q[1] * b, ox + q[0] * b, oy + q[1] * b - q[1] * 5); }); }
      if (!small) label(ox, oy, c.id + (c.name ? ' ' + c.name : '') + (lost ? '  lost ' + U.fmtAge(age) : age > 3 ? '  ' + U.fmtAge(age) : ''), C.cyanD + (lost ? Math.max(0.4, a + 0.15) : Math.max(0.55, a)).toFixed(2) + ')', lost ? 4 : tgtIds[c.id] ? 8 : 6);
    });
    // enemy drones seen close together get one count label
    groupNear(eDr, function (d) { return d.c.cls || 'drone'; }).forEach(function (G) {
      label(G.x, G.y, (G.n > 1 ? G.n + ' ' : '') + U.droneName(G.key, G.n), C.cyanD + '0.8)', 5, 8, 8);
    });

    // rounds in flight: theirs that are aimed at us are red
    var thrLab = new Map(), thrSv = st.thrSv || new Map();
    w.slugs.forEach(function (p) {
      var x = sx(p.x + p.vx * f), y = sy(p.y + p.vy * f); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;
      var mine = p.side === st.P; if (!mine && !(p.known <= w.t)) return; if (p.kind === 'pen' && !mine) return;
      var thr = !mine && thrSv.get(p.sv || p);
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1, tl2 = Math.min(16, 40 * sp / cam.s / 10);
      ctx.strokeStyle = mine ? C.amberD + '0.45)' : thr ? C.redD + '0.7)' : C.cyanD + '0.35)'; line(x, y, x - p.vx / sp * tl2, y + p.vy / sp * tl2);
      ctx.fillStyle = mine ? C.amber : thr ? C.red : C.cyanD + '0.7)'; ctx.fillRect(x - 1, y - 1, 2, 2);
      if (thr && !thrLab.has(thr)) { thrLab.set(thr, 1); label(x, y, (thr.wk === 'canister' ? 'canister ' : thr.n > 1 ? 'salvo ' : 'round ') + U.fmtEta(thr.eta), C.red, 9); }
    });
    // missiles: ours amber, theirs red with an ETA
    w.missiles.forEach(function (m) {
      if (!m.alive || m.side !== st.P) return; var x = sx(m.x + m.vx * f), y = sy(m.y + m.vy * f);
      ctx.fillStyle = C.amber; ctx.strokeStyle = C.amberD + '0.4)'; var sp = Math.hypot(m.vx, m.vy) || 1; line(x, y, x - m.vx / sp * 8, y + m.vy / sp * 8); diamond(ctx, x, y, 2.5); ctx.fill();
    });
    var own = U.ownShips().filter(U.E.active);
    tl.forEach(function (c) {
      if (c.kind !== 'missile') return; var x = sx(c.ex), y = sy(c.ey);
      var sp = Math.hypot(c.vx, c.vy) || 1; ctx.strokeStyle = C.redD + '0.55)'; line(x, y, x - c.vx / sp * 12, y + c.vy / sp * 12);
      ctx.fillStyle = C.red; diamond(ctx, x, y, 3.5); ctx.fill();
      var best = Infinity; own.forEach(function (s) { var dx = s.x - c.ex, dy = s.y - c.ey, d = Math.hypot(dx, dy), cl = (dx * (c.vx - s.vx) + dy * (c.vy - s.vy)) / (d || 1); if (cl > 0.05) best = Math.min(best, d / cl); });
      label(x, y, 'missile ' + (best < Infinity ? U.fmtEta(best) : ''), C.red, 7);
    });
    // drones: ours are amber squares; each wing (one carrier, one type, one order) bunched on screen gets one
    // marker with its count and order, and the selected carrier's wings show where they are headed
    var oDr = [];
    w.drones.forEach(function (d) {
      if (!d.alive || d.docked || d.side !== st.P) return; var x = sx(d.x + d.vx * f), y = sy(d.y + d.vy * f);
      ctx.strokeStyle = C.amber; ctx.fillStyle = C.amberD + '0.35)'; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
      oDr.push({ x: x, y: y, d: d });
    });
    wingHits = [];
    groupNear(oDr, function (o) { return o.d.mother + '|' + o.d.type + '|' + o.d.mode; }).forEach(function (G) {
      var d = G.items[0].d, mineSel = !!sel && (st.sel === 'all' || d.mother === sel.id), mo = w.idx[d.mother];
      if (mineSel) {
        var tx = null, ty = null, tr = d.tgt && U.track(d.tgt);
        if ((d.mode === 'strike' || d.mode === 'intercept' || d.mode === 'harass') && tr) { tx = sx(tr.ex); ty = sy(tr.ey); }
        else if (d.mode === 'picket' && d.point) { tx = sx(d.point.x); ty = sy(d.point.y); }
        else if (d.mode === 'return' && mo) { tx = sx(mo.x + mo.vx * f); ty = sy(mo.y + mo.vy * f); }
        if (tx != null) { ctx.strokeStyle = C.amberD + '0.5)'; ctx.setLineDash([5, 4]); line(G.x, G.y, tx, ty); ctx.setLineDash([]); if (d.mode === 'picket') { circ(tx, ty, 4); ctx.stroke(); } }
      }
      ctx.strokeStyle = C.amber; ctx.lineWidth = mineSel ? 1.6 : 1.1; ctx.beginPath(); ctx.rect(G.x - 7, G.y - 7, 14, 14); ctx.stroke(); ctx.lineWidth = 1;
      if (G.n > 1) { ctx.fillStyle = C.amber; ctx.font = 'bold 10px ui-monospace, "Cascadia Mono", Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(G.n), G.x, G.y + 0.5); ctx.textAlign = 'left'; ctx.font = FONT; }
      label(G.x, G.y, (G.n > 1 ? G.n + ' ' : '') + U.droneName(d.type, G.n) + ' · ' + d.mode, mineSel ? C.amber : C.amberD + '0.8)', mineSel ? 9 : 7, 11, 9);
      wingHits.push({ x: G.x, y: G.y, mother: d.mother });
    });
    // laser shots
    st.fx.forEach(function (fx) {
      if (fx.k !== 'beam') return; var k = Math.max(0, Math.min(1, (fx.until - ts) / 350));
      ctx.strokeStyle = fx.own ? 'rgba(255,241,176,' + (0.85 * k).toFixed(3) + ')' : 'rgba(255,120,100,' + (0.85 * k).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      line(sx(fx.x1), sy(fx.y1), sx(fx.x2), sy(fx.y2)); ctx.lineWidth = 1;
    });

    // own ships: the projected path, the plume, the solid mark
    U.ownShips().forEach(function (s) {
      if (s.status === 'destroyed') return;
      var x0 = s.x + s.vx * f, y0 = s.y + s.vy * f, x = sx(x0), y = sy(y0), on = sel && (st.sel === 'all' || sel.id === s.id);
      var A = accS[s.id] || (accS[s.id] = { x: s.ax || 0, y: s.ay || 0 }); A.x += ((s.ax || 0) - A.x) * 0.08; A.y += ((s.ay || 0) - A.y) * 0.08;
      if (E.active(s)) {
        ctx.strokeStyle = C.amberD + (on ? '0.5)' : '0.25)'); ctx.beginPath();
        for (var i = 0; i <= 30; i++) { var t = i * 20, px = sx(x0 + s.vx * t + 0.5 * A.x * t * t), py = sy(y0 + s.vy * t + 0.5 * A.y * t * t); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
        ctx.fillStyle = C.amberD + (on ? '0.7)' : '0.35)');
        for (i = 1; i <= 10; i++) { t = i * 60; ctx.fillRect(sx(x0 + s.vx * t + 0.5 * A.x * t * t) - 1, sy(y0 + s.vy * t + 0.5 * A.y * t * t) - 1, 2, 2); }
      }
      var ang = -(s.heading || 0), gN = s.gTick || s.gNow || 0;
      if (gN > 0.05 && E.active(s)) { var L = 6 + Math.min(18, gN * 3); ctx.strokeStyle = 'rgba(255,200,120,0.55)'; ctx.lineWidth = 2; line(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7, x - Math.cos(ang) * (7 + L), y - Math.sin(ang) * (7 + L)); ctx.lineWidth = 1; }
      ctx.fillStyle = E.active(s) ? C.amber : 'rgba(255,181,74,0.35)'; ctx.strokeStyle = C.amber; ctx.lineWidth = 1;
      chevron(ctx, x, y, ang, s.hull === 'carrier' || s.hull === 'cruiser' || s.hull === 'barge' ? 10 : 8, true);
      if (on) { ctx.strokeStyle = C.amberD + '0.7)'; circ(x, y, 15); ctx.stroke(); }
      var thrN = (st.thr[s.id] || []).length;
      label(x, y, s.name + (s.status !== 'ok' ? ' (' + s.status + ')' : ''), on ? C.amber : C.amberD + '0.75)', on ? 10 : 7);
      if (thrN) { ctx.strokeStyle = C.redD + '0.6)'; ctx.setLineDash([2, 3]); circ(x, y, 19); ctx.stroke(); ctx.setLineDash([]); }
    });

    drawSolution(st, sel, f, ts);
    if (drag && drag.manual && sel) drawManual(sel, f);
    placeLabels();
    drawScale();
  };

  function drawGrid() {
    var step = nice(cam.s * 110), x0 = Math.floor(wx(0) / step) * step, y0 = Math.floor(wy(H) / step) * step;
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid + '0.06)';
    for (var x = x0; x <= wx(W); x += step) { var px = Math.round(sx(x)) + 0.5; line(px, 0, px, H); }
    for (var y = y0; y <= wy(0); y += step) { var py = Math.round(sy(y)) + 0.5; line(0, py, W, py); }
    // tick crosses at the major intersections
    var maj = step * 5; ctx.strokeStyle = C.grid + '0.16)';
    for (x = Math.floor(wx(0) / maj) * maj; x <= wx(W); x += maj) for (y = Math.floor(wy(H) / maj) * maj; y <= wy(0); y += maj) { var a = sx(x), b = sy(y); line(a - 4, b, a + 4, b); line(a, b - 4, a, b + 4); }
  }
  function drawScale() {
    var target = Math.min(140, W * 0.3), km = nice(cam.s * target), px = km / cam.s;
    var x1 = W - 10, x0 = x1 - px, y = H - 58;
    ctx.strokeStyle = 'rgba(200,215,225,0.7)'; ctx.lineWidth = 1; line(x0, y, x1, y); line(x0, y - 4, x0, y + 4); line(x1, y - 4, x1, y + 4); line((x0 + x1) / 2, y - 2, (x0 + x1) / 2, y + 2);
    ctx.fillStyle = 'rgba(200,215,225,0.85)'; ctx.font = FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(U.fmtKm(km), x1, y - 5); ctx.textAlign = 'left';
  }
  // the firing solution: where the round meets the target, how wide the target may be by then, and the chance
  function drawSolution(st, s, f, ts) {
    if (!s || !U.E.active(s) || st.sel === 'all') return;
    var tr = U.targetOf(s); if (!tr) return;
    var m = s.mods.filter(function (m) { return m.kind === 'rail' && m.state < 2 && m.ammo > 0; })[0] || s.mods.filter(function (m) { return m.kind === 'laser' && m.state < 2; })[0];
    if (!m) return;
    var key = s.id + m.id + tr.id;
    if (ts - fsCache.t > 250 || fsCache.key !== key) { var g = U.grp(s, m.key); fsCache = { t: ts, key: key, est: U.E.hitEstimate(st.w, s, m.id, tr.id, { n: m.kind === 'rail' ? U.railN(m, g) : 1, ammo: g.ammo === 'canister' ? 'canister' : undefined }), kind: m.kind }; }
    var e = fsCache.est; if (!e || !e.ok || e.ix == null) return;
    var x = sx(e.ix), y = sy(e.iy), x0 = sx(s.x + s.vx * f), y0 = sy(s.y + s.vy * f);
    // a laser past its reach gets no chance printed: armour sheds what is left of the beam
    var isL = fsCache.kind === 'laser', far = isL && (e.dmgFactor <= 0 || (e.range != null && e.range > m.def.focus / Math.sqrt(U.N.laserThr)));
    if (!far) { ctx.strokeStyle = 'rgba(255,241,176,0.22)'; ctx.setLineDash([1, 4]); line(x0, y0, x, y); ctx.setLineDash([]); }
    var r = Math.max(4, (e.spread || 0) / cam.s);
    ctx.strokeStyle = far ? 'rgba(255,241,176,0.3)' : 'rgba(255,241,176,0.75)'; line(x - 6, y, x - 2, y); line(x + 2, y, x + 6, y); line(x, y - 6, x, y - 2); line(x, y + 2, x, y + 6);
    if (r > 6 && !far) { ctx.strokeStyle = 'rgba(255,241,176,0.35)'; ctx.setLineDash([2, 3]); circ(x, y, r); ctx.stroke(); ctx.setLineDash([]); }
    var txt = isL ? (far ? 'aim: laser out of range' : 'aim: laser ' + U.pct(e.chance) + ' to hit') : 'aim: ' + (m.def.spinal ? 'spinal ' : 'railgun ') + U.pct(e.chance) + ' to hit · impact ' + U.fmtEta(e.tti);
    label(x, y, txt, far ? 'rgba(255,241,176,0.6)' : C.laser, 9, 9, 10);
  }
  function drawManual(s, f) {
    var x0 = sx(s.x + s.vx * f), y0 = sy(s.y + s.vy * f), dx = drag.cx - x0, dy = drag.cy - y0, l = Math.hypot(dx, dy);
    var gmax = U.E.gCap(s), g = Math.min(gmax, l / 25), ang = Math.atan2(-dy, dx);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; line(x0, y0, drag.cx, drag.cy); ctx.lineWidth = 1;
    var hx = drag.cx, hy = drag.cy, a = Math.atan2(dy, dx); line(hx, hy, hx - 9 * Math.cos(a - 0.4), hy - 9 * Math.sin(a - 0.4)); line(hx, hy, hx - 9 * Math.cos(a + 0.4), hy - 9 * Math.sin(a + 0.4));
    drag.g = g; drag.h = (ang * 180 / Math.PI + 360) % 360;
    label(drag.cx, drag.cy, 'burn ' + g.toFixed(1) + ' G  ' + Math.round(drag.h) + '°', C.amber, 12, 12, 12);
  }

  // ---------------------------------------------------------------- input
  var ptrs = {}, drag = null, pinch = null;
  function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function pdown(e) {
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    var p = pos(e); ptrs[e.pointerId] = p;
    var ids = Object.keys(ptrs), st = U.st();
    if (ids.length === 1) drag = { x: p[0], y: p[1], cx: p[0], cy: p[1], camx: cam.x, camy: cam.y, moved: false, manual: !!(st && st.manual && U.selShip() && st.sel !== 'all') };
    else if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: cam.s, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, wx: wx((a[0] + b[0]) / 2), wy: wy((a[1] + b[1]) / 2) }; if (drag) drag.moved = true; if (drag) drag.manual = false; }
    U.panels.busy(true);
  }
  function pmove(e) {
    if (!ptrs[e.pointerId]) return; var p = pos(e); ptrs[e.pointerId] = p;
    var ids = Object.keys(ptrs);
    if (ids.length >= 2 && pinch) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.s = pinch.s * pinch.d / d; clampS(); cam.x = pinch.wx - (mx - W / 2) * cam.s; cam.y = pinch.wy + (my - H / 2) * cam.s; cam.follow = false; return;
    }
    if (!drag) return;
    drag.cx = p[0]; drag.cy = p[1];
    if (Math.abs(p[0] - drag.x) + Math.abs(p[1] - drag.y) > 7) drag.moved = true;
    if (drag.moved && !drag.manual) { cam.x = drag.camx - (p[0] - drag.x) * cam.s; cam.y = drag.camy + (p[1] - drag.y) * cam.s; cam.follow = false; cv.classList.add('grab'); }
  }
  function pup(e) {
    var had = ptrs[e.pointerId]; delete ptrs[e.pointerId];
    var ids = Object.keys(ptrs);
    if (ids.length < 2) pinch = null;
    if (!had) return;
    if (drag && !ids.length) {
      if (drag.manual && drag.moved && drag.g != null) {
        var st = U.st(); U.order({ man: { type: 'manual', heading: Math.round(drag.h), g: Math.round(drag.g * 10) / 10 } });
        U.addLog(U.selShip().name + ': manual burn ' + drag.g.toFixed(1) + ' G at ' + Math.round(drag.h) + '°.', '');
        st.manual = false; U.panels.refresh(true);
      } else if (!drag.moved) tap(drag.x, drag.y);
      drag = null; cv.classList.remove('grab');
    }
    if (!ids.length) U.panels.busy(false);
  }
  function wheel(e) {
    e.preventDefault(); var p = pos(e), bx = wx(p[0]), by = wy(p[1]);
    cam.s *= Math.pow(1.0018, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY); clampS();
    cam.x = bx - (p[0] - W / 2) * cam.s; cam.y = by + (p[1] - H / 2) * cam.s; cam.follow = false;
  }
  P.zoom = function (k) { cam.s *= k; clampS(); };
  function tap(x, y) {
    var st = U.st(); if (!st) return; var f = st.frac || 0, best = null, bd = 26;
    U.ownShips().forEach(function (s) { if (s.status === 'destroyed') return; var d = Math.hypot(sx(s.x + s.vx * f) - x, sy(s.y + s.vy * f) - y); if (d < bd) { bd = d; best = { own: s }; } });
    if (!best) { bd = 26; st.w.sides[st.P].tl.forEach(function (c) { var d = Math.min(Math.hypot(sx(c.x) - x, sy(c.y) - y), Math.hypot(sx(c.ex) - x, sy(c.ey) - y)); if (d < bd) { bd = d; best = { c: c }; } }); }
    if (!best) { bd = 20; wingHits.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = { wing: h }; } }); }
    if (best && best.wing) { U.panels.select(best.wing.mother); U.panels.showTab('wings'); }
    else if (best && best.own) U.panels.select(best.own.id);
    else if (best && best.c) { st.cardId = best.c.id; if (best.c.kind !== 'missile') U.setTarget(best.c.id); U.panels.refresh(true); U.sfx('click'); }
    else { st.cardId = null; U.panels.refresh(true); }
  }
})();
