/* Vellum & Vermilion — page screen, HUD, save, test hooks. */
(function () {
  'use strict';
  var LEVELS = window.LEVELS, ART = window.ART, P = window.Puzzle;
  var KEY = 'vellum.v1';
  var $ = function (id) { return document.getElementById(id); };

  var RULES = {
    1: { title: 'The Plain Interlace', text: 'Turn the tiles until every ribbon joins up into a closed loop.' },
    2: { title: 'The Pigments', text: 'Some tiles have a coloured mark. A ribbon can only pass through marks of one colour.' },
    3: { title: 'The Beasts', text: 'Some ribbons end in a head or a tail. Each one has to run from a head to a tail.' },
    4: { title: 'The Gilded Twins', text: 'Tiles framed in gold turn together. Tap one and the others turn with it.' },
    5: { title: 'The Great Initials', text: 'These pages use all the rules so far.' }
  };

  /* ---------- save ---------- */
  var save = { solved: {}, prog: {}, sound: true, current: 1, seen: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  function unlocked(n) { return n === 1 || !!save.solved[n - 1] || !!save.solved[n]; }

  /* ---------- page background ---------- */
  var pageCv = $('page'), pageCtx = pageCv.getContext('2d');
  function drawPage() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
    pageCv.width = Math.round(w * dpr); pageCv.height = Math.round(h * dpr);
    pageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ART.draw(pageCtx, 'page', 0, 0, w, h, 0, { scale: dpr, margin: 'right', variant: cur ? cur.n : 0 });
    // the painted ivy grows on the vellum round everything laid out on it (drawn once per page and size)
    if (cur) ART.ivyPage(pageCtx, w, h, cur.n * 977 + 13, ivyAvoid(), { narrow: !document.body.classList.contains('wide') });
    pageFor = cur ? cur.n : 0;
  }
  // the boxes the ivy keeps clear of: the board's cells and gilded frame, the text (its own extent), the drollery, buttons.
  // A board box carries the frame's width too, so on a narrow page the ivy may tuck under the frame's outer edge
  function ivyAvoid() {
    var out = [];
    function box(r) { if (r && r.width > 0 && r.height > 0) out.push([r.left, r.top, r.width, r.height]); }
    // the board: each of its cells grown by the gilded frame, so the notches of a shaped page stay open
    var br = $('board').getBoundingClientRect(), M = board.M, S = board.S, pad = board.pad, bd = board.band;
    if (M && S && br.width > 0) M.kinds.forEach(function (k, c) {
      if (k !== ' ') out.push([br.left + pad + (c % M.w) * S - bd, br.top + pad + (c / M.w | 0) * S - bd, S + 2 * bd, S + 2 * bd, bd]);
    });
    ['rubric', 'pname', 'lines'].forEach(function (id) {
      var el = $(id), rg = document.createRange(); rg.selectNodeContents(el);
      var r = rg.getBoundingClientRect(); box(r.width > 0 ? r : el.getBoundingClientRect());
    });
    box($('droll').getBoundingClientRect()); box($('next').getBoundingClientRect());
    Array.prototype.forEach.call(document.querySelectorAll('#hud button'), function (b) { box(b.getBoundingClientRect()); });
    return out;
  }
  var pageFor = 0;

  /* ---------- board ---------- */
  var cur = null, writing = 0, SFX = window.SFX;
  SFX.enabled = save.sound !== false;
  var board = new window.Board($('board'), {
    onTurn: function () { SFX.turn(); storeProgress(); },
    onWiggle: function () { SFX.wiggle(); },
    onPin: function (c, on) { if (on) SFX.pin(); storeProgress(); },
    onStrandWhole: function (color) { SFX.whole(color); },
    onStrandBroken: function () { SFX.broken(); },
    onSolved: function () { pageSolved(true); },
    onTouch: function () { SFX.unlock(); },
    onSkip: function () { skipSequence(); }
  });
  function storeProgress() {
    if (!cur) return;
    var st = board.getState();
    save.prog[cur.n] = { r: st.rots.join(''), p: st.pins };
    persist();
  }

  // portrait: hud on top, then head, board and grumble as one group centred in the rest of the height.
  // wide: the board and a side column (hud, head, drollery, grumble) composed as one centred group.
  function layout() {
    var W = window.innerWidth, wide = W > window.innerHeight * 1.15;
    document.body.classList.toggle('wide', wide);
    var cv = $('board'); cv.style.width = '0px'; cv.style.height = '0px';
    var w, h, app = $('app');
    if (wide) {
      var side = Math.round(Math.max(270, Math.min(360, W * 0.3))), gap = Math.round(Math.max(24, Math.min(48, W * 0.03)));
      app.style.setProperty('--side', side + 'px'); app.style.setProperty('--gap', gap + 'px');
      var ac = getComputedStyle(app);
      boxDroll(true, app.clientHeight - parseFloat(ac.paddingTop) - parseFloat(ac.paddingBottom));
      w = app.clientWidth - parseFloat(ac.paddingLeft) - parseFloat(ac.paddingRight) - side - gap;
      h = Math.min(app.clientHeight, window.innerHeight) - parseFloat(ac.paddingTop) - parseFloat(ac.paddingBottom);
      // the board's area is pinned to this height from the top of the grid, so a side column that runs taller
      // than the screen (big system fonts on a short phone) can't push the board down and crop it
      app.style.setProperty('--boardH', Math.max(120, h) + 'px');
    } else {
      var cs = getComputedStyle(app);
      boxDroll(false, window.innerHeight);
      w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) -
        $('hud').offsetHeight - $('head').offsetHeight - $('foot').offsetHeight - 8;
    }
    board.fit(Math.max(120, w), Math.max(120, h));
    sizeDroll();
    drawPage();   // last, so the ivy can keep clear of where everything now sits
  }

  function load(n, opts) {
    opts = opts || {};
    n = Math.max(1, Math.min(LEVELS.length, n | 0));
    cur = LEVELS[n - 1];
    save.current = n; persist();
    endSequence();
    var pr = save.prog[n], solved = !!save.solved[n];
    var saved = { solved: solved };
    if (!solved && pr && pr.r && pr.r.length === cur.w * cur.h) { saved.rots = pr.r.split('').map(Number); saved.pins = pr.p || []; }
    $('rubric').textContent = cur.rubric;
    $('pname').textContent = cur.name;
    setLines(0, false);
    droll.wakeT0 = solved ? -1e9 : null;
    $('next').classList.remove('show');
    board.setLevel(cur, saved);
    layout();
    if (solved) pageSolved(false);
    else if (!opts.quiet && cur.folio === 1 && !save.seen[cur.quire]) { save.seen[cur.quire] = 1; persist(); openRule(); }
  }

  /* ---------- illumination sequence ----------
     0 the board floods and gilds (board.js, ~2.5 s) · 1100 the grumble starts writing · 1800 the drollery wakes ·
     Next appears once both the gilding and the writing are done. A tap anywhere skips to the end. */
  var seq = null;
  function pageSolved(fresh) {
    if (!cur) return;
    if (!fresh) { setLines(cur.text.length, false); droll.wakeT0 = -1e9; showNext(); return; }
    save.solved[cur.n] = true; delete save.prog[cur.n]; persist();
    SFX.solved();
    board.illuminate();
    seq = { timers: [] };
    seq.timers.push(setTimeout(function () { writeGrumble(); }, 1100));
    seq.timers.push(setTimeout(function () { droll.wakeT0 = performance.now(); }, 1800));
    seq.timers.push(setTimeout(function () { if (seq) { seq.lit = true; maybeFinish(); } }, 2550));
  }
  function maybeFinish() { if (seq && seq.lit && seq.written) { endSequence(); showNext(); } }
  function endSequence() {
    clearInterval(writing);
    if (seq) seq.timers.forEach(clearTimeout);
    seq = null;
  }
  function skipSequence() {
    if (!seq) return;
    board.skipIllumination();
    endSequence();
    setLines(cur.text.length, false);
    if (droll.wakeT0 === null || performance.now() - droll.wakeT0 < WAKE_MS) droll.wakeT0 = performance.now() - WAKE_MS * 0.6;
    showNext();
  }
  // the grumble is always laid out in full (unwritten letters transparent) so nothing shifts as it is written
  function setLines(k, pop) {
    var el = $('lines'), text = cur.text;
    if (!el.firstChild || el.dataset.n !== String(cur.n)) {
      el.innerHTML = '<span class="ini"></span><span class="rest"></span><span class="hid"></span>';
      el.dataset.n = cur.n;
    }
    var ini = el.querySelector('.ini');
    ini.textContent = text.charAt(0);
    ini.classList.toggle('blank', k < 1);
    if (pop) { ini.classList.remove('pop'); void ini.offsetWidth; ini.classList.add('pop'); }
    el.querySelector('.rest').textContent = text.slice(1, Math.max(1, k));
    el.querySelector('.hid').textContent = text.slice(Math.max(1, k));
  }
  function writeGrumble() {
    clearInterval(writing);
    var i = 1;
    setLines(1, true);
    writing = setInterval(function () {
      i += 1; setLines(i, false);
      if (i >= cur.text.length) { clearInterval(writing); if (seq) { seq.written = true; maybeFinish(); } }
    }, 19);
  }
  function showNext() {
    var nb = $('next');
    nb.textContent = cur.n < LEVELS.length ? 'Turn the page \u2767' : 'Close the book \u2767';
    nb.classList.add('show');
  }
  // the first touch unlocks sound; a tap anywhere during the illumination skips it
  document.addEventListener('pointerdown', function () { SFX.unlock(); if (seq) skipSequence(); }, true);
  document.addEventListener('keydown', function () { SFX.unlock(); }, true);

  /* ---------- the drollery: in the margin until the page is done, then it wakes and idles ----------
     A painted PNG (art/manifest.json) stands on its ivy vine: the box is sized to the picture, the vine's foot
     sits on the box's bottom edge and grows out of the page. Until the page is solved it is an unpainted sepia
     underdrawing; on solving the colour rises up the vine from the foot with a gold glint, and it sways after.
     A procedural drollery keeps its square box and does its own sleeping and waking (js/drolleries.js). */
  var WAKE_MS = 1100, droll = { wakeT0: null, w: 72, h: 72, last: 0, dpr: 1, anchor: null, oc: null };
  // size the drollery's box before the board is fitted. wide: the side column's width, as tall as the column
  // has room for (up to 250px), the vine's foot at 42% across. portrait: beside the grumble, 17% of the height.
  function boxDroll(wide, availH) {
    var cv = $('droll'), m = cur && ART.meta('drollery.' + cur.drollery);
    document.body.classList.toggle('pngDroll', !!m);
    cv.style.width = cv.style.height = '';
    droll.anchor = null;
    if (!m) return;
    if (wide) {
      cv.style.height = '0px';
      var col = $('grumbleRow').clientWidth || 300;
      var room = availH - $('hud').offsetHeight - $('head').offsetHeight - $('foot').offsetHeight - 24;
      var hh = room < 56 ? 0 : Math.round(Math.max(70, Math.min(250, room)));   // no room: no drollery
      cv.style.width = col + 'px'; cv.style.height = hh + 'px';
      droll.anchor = 0.42;
    } else {
      var rowW = $('grumbleRow').clientWidth || 360;
      var ph = Math.max(96, Math.min(170, availH * 0.17)), pw = ph * m.aspect * 1.08;
      if (pw > rowW * 0.46) { pw = rowW * 0.46; ph = pw / (m.aspect * 1.08); }
      cv.style.width = Math.round(pw) + 'px'; cv.style.height = Math.round(ph) + 'px';
    }
  }
  function sizeDroll() {
    var cv = $('droll'), dpr = Math.min(3, window.devicePixelRatio || 1);
    droll.w = cv.clientWidth || 72; droll.h = cv.clientHeight || 72; droll.dpr = dpr;
    cv.width = Math.round(droll.w * dpr); cv.height = Math.round(droll.h * dpr);
    drawDroll(performance.now());
  }
  function glint(g, x, y, r, k) {   // the gold star of waking (as in js/drolleries.js)
    if (k <= 0 || k >= 1) return;
    var rr = r * Math.sin(k * Math.PI);
    g.save(); g.globalAlpha = Math.sin(k * Math.PI); g.fillStyle = '#d9ac45'; g.strokeStyle = ART.INK; g.lineWidth = 1;
    g.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 + k, q = i % 2 ? rr * 0.3 : rr; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function drawDroll(t) {
    var cv = $('droll'), g = cv.getContext('2d'), W = droll.w, H = droll.h, dpr = droll.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!cur) return;
    var awake = droll.freeze != null ? droll.freeze : droll.wakeT0 === null ? 0 : Math.max(0, Math.min(1, (t - droll.wakeT0) / WAKE_MS)), slot = 'drollery.' + cur.drollery;
    var m = ART.meta(slot);
    if (!m) { var sz = Math.min(W, H); ART.draw(g, slot, (W - sz) / 2, H - sz, sz, sz, t, { awake: awake }); return; }
    // the picture, its foot on the bottom edge (headroom for the stretch as it wakes)
    var ih = Math.min(H * 0.95, W / m.aspect / 1.04), iw = ih * m.aspect;
    var sx = droll.anchor === null ? W / 2 + (m.stem - 0.5) * iw :
      Math.max(m.stem * iw + 2, Math.min(W - (1 - m.stem) * iw - 2, W * droll.anchor));
    var x0 = sx - m.stem * iw, y0 = H - ih;
    // all motion pivots on the vine's foot, so the stem stays rooted: a slow breath asleep, a springy
    // stretch and wobble as it wakes, a gentle sway after
    var rot, sy;
    if (awake <= 0) { rot = 0; sy = 1 + Math.sin(t / 900) * 0.007; }
    else if (awake < 1) { rot = Math.sin(awake * Math.PI * 3) * (1 - awake) * 0.035; sy = 1 + Math.sin(awake * Math.PI) * 0.04; }
    else { rot = Math.sin(t / 1700) * 0.01; sy = 1 + Math.sin(t / 1150) * 0.005; }
    function place(c) { c.translate(sx, H); c.rotate(rot); c.scale(1, sy); c.translate(-sx, -H); }
    if (awake < 1) {   // the unpainted underdrawing
      g.save(); g.globalAlpha = awake > 0 ? 1 - awake * awake : 1; place(g);
      ART.draw(g, slot, x0, y0, iw, ih, t, { faded: true }); g.restore();
    }
    if (awake >= 1) { g.save(); place(g); ART.draw(g, slot, x0, y0, iw, ih, t); g.restore(); }
    else if (awake > 0) {   // the colour rises from the foot: painted offscreen, then masked by a soft front
      if (!droll.oc) droll.oc = document.createElement('canvas');
      var oc = droll.oc, o = oc.getContext('2d');
      if (oc.width !== cv.width || oc.height !== cv.height) { oc.width = cv.width; oc.height = cv.height; }
      var e = awake < 0.5 ? 2 * awake * awake : 1 - 2 * (1 - awake) * (1 - awake), f = ih * 0.2;
      var front = H + f - e * (ih + 2 * f);
      o.setTransform(dpr, 0, 0, dpr, 0, 0); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, W, H);
      o.save(); place(o); ART.draw(o, slot, x0, y0, iw, ih, t); o.restore();
      var gr = o.createLinearGradient(0, front - f, 0, front);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      o.globalCompositeOperation = 'destination-in'; o.fillStyle = gr; o.fillRect(0, 0, W, H);
      o.globalCompositeOperation = 'source-over';
      g.drawImage(oc, 0, 0, W, H);
      var gr2 = Math.max(6, ih * 0.06);
      glint(g, x0 + iw * (0.5 + 0.2 * Math.sin(awake * 9)), Math.max(y0 + gr2, front - f * 0.5), gr2 * 0.8, awake / 0.85);
      glint(g, x0 + iw * 0.78, y0 + ih * 0.12, gr2 * 1.2, (awake - 0.5) / 0.5);
    }
    // the vine's foot fades into the vellum, as if it grew out of the page
    var ff = g.createLinearGradient(0, H, 0, H - ih * 0.07);
    ff.addColorStop(0, 'rgba(0,0,0,0.75)'); ff.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = ff; g.fillRect(0, H - ih * 0.07, W, ih * 0.07);
    g.globalCompositeOperation = 'source-over';
  }
  (function tick(t) {
    if (t - droll.last > 33) { droll.last = t; drawDroll(t); }
    requestAnimationFrame(tick);
  })(0);

  /* ---------- rule card ---------- */
  function openRule() {
    var q = cur ? cur.quire : 1, r = RULES[q];
    $('ruleTitle').textContent = 'Quire ' + ['I', 'II', 'III', 'IV', 'V'][q - 1] + ' · ' + r.title;
    $('ruleText').textContent = r.text;
    drawRuleArt(q);
    $('ruleModal').classList.add('show');
  }
  function drawRuleArt(q) {
    var cv = $('ruleArt'), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = 200 * dpr; cv.height = 80 * dpr; cv.style.width = '200px'; cv.style.height = '80px';
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, 200, 80);
    var gold = ART.PIG.gold.base, lap = ART.PIG.lapis.base;
    function loop(cx, cy, r, col) { ART.ribbon(g, function (gg) { gg.arc(cx, cy, r, 0, 6.283); }, 9, col); }
    if (q === 1) { loop(70, 40, 24, gold); loop(130, 40, 24, gold); }
    else if (q === 2) {
      loop(60, 40, 24, lap); ART.draw(g, 'mark', 28, 32, 16, 16, 0, { pigment: 'lapis' });
      loop(140, 40, 24, ART.PIG.vermilion.base); ART.draw(g, 'mark', 156, 32, 16, 16, 0, { pigment: 'vermilion' });
    } else if (q === 3) {
      // a beast runs head to tail: tail in at the left, head out at the right
      var vg = ART.PIG.verdigris.base;
      var hs = ART.beastStop && ART.beastStop('head', 0.33), ts = ART.beastStop && ART.beastStop('tail', 0.33);
      if (hs != null && ts != null) {
        // painted beasts: the ribbon meets each one level, where the art takes over from it
        var x0 = 52 - ts * 36, x1 = 148 + hs * 36, xm = (x0 + x1) / 2;
        ART.ribbon(g, function (gg) {
          gg.moveTo(x0, 40); gg.bezierCurveTo(x0 + 18, 40, xm - 18, 16, xm, 16); gg.bezierCurveTo(xm + 18, 16, x1 - 18, 40, x1, 40);
        }, 9, vg);
      } else ART.ribbon(g, function (gg) { gg.moveTo(52, 40); gg.bezierCurveTo(85, 6, 115, 74, 148, 40); }, 9, vg);
      ART.draw(g, 'beastHead', 130, 22, 36, 36, 0, { angle: -Math.PI / 2, body: vg, flat: vg, band: 0.33 });
      ART.draw(g, 'beastTail', 34, 22, 36, 36, 0, { angle: Math.PI / 2, body: vg, flat: vg, band: 0.33 });
    } else if (q === 4) {
      // two twins: the same gilt brackets, the same emblem, turned the same way
      [44, 100].forEach(function (x) {
        g.save(); g.beginPath(); g.rect(x, 12, 56, 56); g.clip();
        ART.ribbon(g, function (gg) { gg.arc(x + 56, 12, 28, Math.PI / 2, Math.PI); }, 9, ART.PIG.lapis.base);
        ART.ribbon(g, function (gg) { gg.arc(x, 68, 28, -Math.PI / 2, 0); }, 9, ART.PIG.lapis.base);
        g.restore();
        ART.draw(g, 'twinFrame', x, 12, 56, 56, 0, { lit: 0.4 });
        ART.draw(g, 'twinEmblem', x + 4.8, 16.8, 8.4, 8.4, 0, { kind: 1 });
      });
    } else { ['L', 'U', 'M', 'E', 'N'].forEach(function (ch, i) {
      g.font = '34px "Uncial Antiqua", serif'; g.fillStyle = i % 2 ? '#2b56a6' : '#a8261a'; g.fillText(ch, 18 + i * 36, 52); }); }
  }

  /* ---------- HUD ---------- */
  $('bBook').onclick = function () { $('ruleModal').classList.remove('show'); Book.fromPlay(); };
  $('bRule').onclick = openRule;
  $('ruleOk').onclick = function () { $('ruleModal').classList.remove('show'); };
  $('bHint').onclick = function () { board.hint(); };
  $('bReset').onclick = function () { if (!board.solved) $('resetModal').classList.add('show'); };
  $('resetNo').onclick = function () { $('resetModal').classList.remove('show'); };
  $('resetYes').onclick = function () { $('resetModal').classList.remove('show'); board.reset(); delete save.prog[cur.n]; persist(); };
  function soundLabel() { $('bSound').innerHTML = save.sound ? '&#9835;' : '<s>&#9835;</s>'; $('bSound').title = save.sound ? 'Sound on' : 'Sound off'; }
  $('bSound').onclick = function () { save.sound = !save.sound; SFX.enabled = save.sound; persist(); soundLabel(); if (save.sound) { SFX.unlock(); SFX.pin(); } };
  $('next').onclick = function () { if (cur.n < LEVELS.length) load(cur.n + 1); else Book.fromPlay(7); };   // the last page closes on the Colophon
  ['ruleModal', 'resetModal'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) $(id).classList.remove('show'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ['ruleModal', 'resetModal'].forEach(function (id) { $(id).classList.remove('show'); });
  });
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 60); });
  soundLabel();

  /* ---------- test hooks ---------- */
  window.VV = {
    load: function (n) { load(n); return cur.n; },
    solve: function () { board.applySolution(); return board.solved; },
    state: function () {
      var M = board.M, tr = board.tr;
      return {
        page: cur && cur.n, name: cur && cur.name, solved: board.solved, wrong: board.wrongCount(),
        strands: tr.strands.length, whole: tr.strands.filter(function (s) { return s.whole; }).length,
        tile: board.S, size: [board.cssW, board.cssH], rots: board.rots.join(''), pins: board.getState().pins,
        saved: JSON.parse(JSON.stringify(save))
      };
    },
    // hold the drollery at a wake fraction 0..1 (null lets it run again), for checking the wake frame by frame
    drollery: function (a) { droll.freeze = a == null ? null : +a; drawDroll(performance.now()); return droll.freeze; },
    board: board, save: function () { return save; }, book: window.Book
  };

  /* ---------- the book (js/book.js) gets what it needs from the page screen ---------- */
  var Book = window.Book;
  Book.init({
    LEVELS: LEVELS, RULES: RULES, unlocked: unlocked, persist: persist,
    save: function () { return save; },
    current: function () { return cur; },
    load: function (n, o) { load(n, o); }
  });
  load(save.current || 1, { quiet: true });   // the page screen is ready behind the cover
  Book.boot();
  ART.load().then(function () { layout(); Book.refresh(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    if (cur && $('ruleModal').classList.contains('show')) drawRuleArt(cur.quire);
    Book.refresh();
  });
})();
