/* Vellum & Vermilion — page screen, HUD, save, test hooks. */
(function () {
  'use strict';
  var LEVELS = window.LEVELS, ART = window.ART, P = window.Puzzle;
  var KEY = 'vellum.v1';
  var $ = function (id) { return document.getElementById(id); };

  var RULES = {
    1: { title: 'The Plain Interlace', text: 'Turn the tiles until every ribbon runs whole: no end left loose, no ribbon running off the page.' },
    2: { title: 'The Pigments', text: 'One strand, one pigment: a strand may not join marks of two different colours.' },
    3: { title: 'The Beasts', text: 'Every beast runs head to tail. A head joined to a head, or a tail to a tail, will not do.' },
    4: { title: 'The Gilded Twins', text: 'Tiles bound in gold leaf turn together. Tap one and its twins turn too; a nail pins them all.' },
    5: { title: 'The Great Initials', text: 'Everything you have learned, on the great pages. Take your time; the abbot is asleep.' }
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
    ART.draw(pageCtx, 'page', 0, 0, w, h, 0, { scale: dpr, margin: 'right' });
  }

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
    drawPage();
    var cv = $('board'); cv.style.width = '0px'; cv.style.height = '0px';
    var w, h, app = $('app');
    if (wide) {
      var side = Math.round(Math.max(270, Math.min(360, W * 0.3))), gap = Math.round(Math.max(24, Math.min(48, W * 0.03)));
      app.style.setProperty('--side', side + 'px'); app.style.setProperty('--gap', gap + 'px');
      var ac = getComputedStyle(app);
      w = app.clientWidth - parseFloat(ac.paddingLeft) - parseFloat(ac.paddingRight) - side - gap;
      h = app.clientHeight - parseFloat(ac.paddingTop) - parseFloat(ac.paddingBottom);
    } else {
      var cs = getComputedStyle(app);
      w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) -
        $('hud').offsetHeight - $('head').offsetHeight - $('foot').offsetHeight - 8;
    }
    board.fit(Math.max(120, w), Math.max(120, h));
    sizeDroll();
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

  /* ---------- the drollery: asleep in the margin until the page is done, then wakes and idles ---------- */
  var WAKE_MS = 1100, droll = { wakeT0: null, size: 72, last: 0, dpr: 1 };
  function sizeDroll() {
    var cv = $('droll'), dpr = Math.min(3, window.devicePixelRatio || 1), sz = cv.clientWidth || 72;
    droll.size = sz; droll.dpr = dpr; cv.width = Math.round(sz * dpr); cv.height = Math.round(sz * dpr);
    drawDroll(performance.now());
  }
  function drawDroll(t) {
    var cv = $('droll'), g = cv.getContext('2d'), sz = droll.size;
    g.setTransform(droll.dpr, 0, 0, droll.dpr, 0, 0); g.clearRect(0, 0, sz, sz);
    if (!cur) return;
    var awake = droll.wakeT0 === null ? 0 : Math.max(0, Math.min(1, (t - droll.wakeT0) / WAKE_MS)), slot = 'drollery.' + cur.drollery;
    if (ART.has(slot)) {   // a painted PNG: breathe while asleep, hop as it wakes, bob gently after
      var hop = awake > 0 && awake < 1 ? Math.sin(awake * Math.PI) * sz * 0.12 : 0;
      var br = awake <= 0 ? Math.sin(t / 700) * 0.025 : Math.sin(t / 900) * 0.012;
      g.save(); g.globalAlpha = awake > 0 ? 1 : 0.8;
      g.translate(sz / 2, sz - hop); g.scale(1, 1 + br); g.translate(-sz / 2, -sz);
      ART.draw(g, slot, 0, 0, sz, sz, t, { awake: awake });
      g.restore();
    } else ART.draw(g, slot, 0, 0, sz, sz, t, { awake: awake });
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
      ART.ribbon(g, function (gg) { gg.moveTo(52, 40); gg.bezierCurveTo(85, 6, 115, 74, 148, 40); }, 9, vg);
      ART.draw(g, 'beastHead', 130, 22, 36, 36, 0, { angle: -Math.PI / 2, body: vg });
      ART.draw(g, 'beastTail', 34, 22, 36, 36, 0, { angle: Math.PI / 2, body: vg });
    } else if (q === 4) {
      // two twins: the same gilt brackets, the same emblem, turned the same way
      [44, 100].forEach(function (x) {
        g.save(); g.beginPath(); g.rect(x, 12, 56, 56); g.clip();
        ART.ribbon(g, function (gg) { gg.arc(x + 56, 12, 28, Math.PI / 2, Math.PI); }, 9, ART.PIG.lapis.base);
        ART.ribbon(g, function (gg) { gg.arc(x, 68, 28, -Math.PI / 2, 0); }, 9, ART.PIG.lapis.base);
        g.restore();
        ART.draw(g, 'twinFrame', x, 12, 56, 56, 0, { lit: 0.4 });
        ART.draw(g, 'twinEmblem', x + 2.5, 14.5, 12, 12, 0, { kind: 1 });
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
