/* Tithe & Tattle: the puzzle screen (grid, clues, tally, story, hints, undo, solve moment) and small UI helpers.
 *   PLAY.open(puzzle, {kind:'story'|'daybook', id, rec, subtitle, onBack, onNext, nextLabel, backLabel, onSolved})
 *     rec is the save record {m, s, h, seen, solved?}; PLAY mutates it and calls SAVE.write().
 *   UI.sheet(el, {cls, onClose, dismiss}) -> close()      a modal card over the current screen
 *   UI.confirm(text, yesLabel, noLabel, onYes)
 *   UI.dropPara(text, opts) -> <p> with an illuminated initial (art slot 'dropcap')
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- UI helpers
  var UI = window.UI = {};
  var sheets = [];
  UI.sheet = function (content, opts) {
    opts = opts || {};
    var back = el('div', 'sheet-back' + (opts.cls ? ' ' + opts.cls : ''));
    var card = el('div', 'sheet');
    card.appendChild(content); back.appendChild(card);
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('on'); });
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      back.classList.remove('on');
      sheets = sheets.filter(function (s) { return s !== close; });
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 260);
      if (opts.onClose) opts.onClose();
    }
    close.dismissable = opts.dismiss !== false;
    if (close.dismissable) back.addEventListener('click', function (e) { if (e.target === back) close(); });
    sheets.push(close);
    return close;
  };
  UI.closeTop = function () { var c = sheets[sheets.length - 1]; if (c && c.dismissable) { c(); return true; } return false; };
  UI.closeAll = function () { sheets.slice().forEach(function (c) { c(); }); };
  // A full-screen viewer. o: {img: loaded Image | null, canvas: fn(w,h) -> canvas (fallback), caption: [name, desc],
  // zoom: true for pinch/wheel/pan/double-tap, trigger: element to refocus}. Joins the sheet stack, so Esc, Back and
  // every screen change close it. Returns close().
  UI.lightbox = function (o) {
    var back = el('div', 'lightbox' + (o.zoom ? ' zoomable' : ''));
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', (o.caption && o.caption[0]) || 'Larger view');
    var x = el('button', 'lbclose', '\u00d7'); x.setAttribute('aria-label', 'Close');
    var fig = el('figure', 'lbfig'), media = null, cap = null;
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (o.caption && o.caption[0]) {
      cap = el('figcaption', 'lbcap'); cap.appendChild(el('div', 'lbname', o.caption[0]));
      if (o.caption[1]) cap.appendChild(el('div', 'lbdesc', o.caption[1]));
    }
    var closed = false, s = 1, tx = 0, ty = 0, W0 = 0, H0 = 0, bx = 0, by = 0, vw = 0, vh = 0, nw = 0, nh = 0;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', layout);
      document.body.style.overflow = prevOverflow;
      back.classList.remove('on');
      sheets = sheets.filter(function (c) { return c !== close; });
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 200);
      try { if (o.trigger && o.trigger.focus) o.trigger.focus(); } catch (e) { /* ignore */ }
    }
    close.dismissable = true;
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);

    function apply() {
      // keep the image on screen: centred when smaller than the view, edge to edge when larger
      var w = W0 * s, h = H0 * s;
      tx = w <= vw ? (vw - w) / 2 - bx : Math.min(-bx, Math.max(vw - w - bx, tx));
      ty = h <= vh ? (vh - h) / 2 - by : Math.min(-by, Math.max(vh - h - by, ty));
      media.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    }
    function zoomAt(ns, px, py) {
      ns = Math.max(1, Math.min(4, ns));
      var u = (px - bx - tx) / s, v = (py - by - ty) / s;
      s = ns; tx = px - bx - u * s; ty = py - by - v * s; apply();
    }
    function layout() {
      vw = back.clientWidth; vh = back.clientHeight;
      var f = Math.min(vw * 0.96 / nw, vh * 0.96 / nh);
      W0 = Math.round(nw * f); H0 = Math.round(nh * f); bx = (vw - W0) / 2; by = (vh - H0) / 2;
      media.style.width = W0 + 'px'; media.style.height = H0 + 'px'; media.style.left = bx + 'px'; media.style.top = by + 'px';
      apply();
    }

    if (o.zoom) {
      back.appendChild(x);
      document.body.appendChild(back);
      if (o.img) { media = el('img', 'lbmedia'); media.src = o.img.src; media.alt = 'The map of Mardle and the abbey'; nw = o.img.naturalWidth; nh = o.img.naturalHeight; }
      else {   // no PNG: draw the procedural map large, then scale it with CSS
        var a = ART.MAP_ASPECT || 1.3; nw = 1000; nh = Math.round(1000 * a);
        media = o.canvas(1200, Math.round(1200 * a)); media.className = 'lbmedia';
      }
      media.draggable = false; back.appendChild(media); layout();
      window.addEventListener('resize', layout);
      var ptrs = {}, start = null, moved = 0, lastTap = null, pinch = null;
      back.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
      back.addEventListener('pointerdown', function (e) {
        if (e.target === x) return;
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; try { back.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        var ids = Object.keys(ptrs);
        if (ids.length === 1) { moved = 0; start = { onImg: e.target === media }; }
        else { start = null; var p = ptrs[ids[0]], q = ptrs[ids[1]]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, s: s }; moved = 99; }
      });
      back.addEventListener('pointermove', function (e) {
        var p = ptrs[e.pointerId]; if (!p) return;
        var ids = Object.keys(ptrs), dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (ids.length >= 2 && pinch) {
          var q = ptrs[ids[0] === String(e.pointerId) ? ids[1] : ids[0]];
          zoomAt(pinch.s * (Math.hypot(p.x - q.x, p.y - q.y) || 1) / pinch.d, (p.x + q.x) / 2, (p.y + q.y) / 2);
        } else {
          moved += Math.abs(dx) + Math.abs(dy);
          if (moved > 6) { tx += dx; ty += dy; apply(); }
        }
      });
      function up(e) {
        if (!ptrs[e.pointerId]) return;
        delete ptrs[e.pointerId];
        if (Object.keys(ptrs).length) { pinch = null; start = null; moved = 99; return; }
        pinch = null;
        if (e.type !== 'pointerup' || !start || moved > 8) { start = null; return; }
        var now = Date.now(), onImg = start.onImg; start = null;
        if (!onImg) { close(); return; }   // a tap on the backdrop
        if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          lastTap = null; zoomAt(s > 1.05 ? 1 : 2.5, e.clientX, e.clientY);
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      back.addEventListener('pointerup', up); back.addEventListener('pointercancel', up);
    } else {
      if (o.img) { media = el('img', 'lbmedia'); media.src = o.img.src; media.alt = (o.caption && o.caption[0]) || ''; fig.appendChild(media); }
      if (cap) fig.appendChild(cap);
      back.appendChild(fig); back.appendChild(x);
      back.addEventListener('click', close);
      document.body.appendChild(back);
    }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    requestAnimationFrame(function () { back.classList.add('on'); });
    sheets.push(close);
    x.focus();
    return close;
  };
  UI.confirm = function (text, yes, no, onYes) {
    var box = el('div', 'confirm');
    box.appendChild(el('p', null, text));
    var row = el('div', 'btnrow'), b1 = el('button', 'btn verm', yes), b2 = el('button', 'btn', no);
    row.appendChild(b2); row.appendChild(b1); box.appendChild(row);
    var close = UI.sheet(box, { cls: 'small' });
    b1.onclick = function () { close(); onYes(); };
    b2.onclick = close;
  };
  UI.dropPara = function (text, opts) {
    opts = opts || {};
    var p = el('p', 'dropcap' + (opts.cls ? ' ' + opts.cls : ''));
    text = String(text || '');
    var m = /^([\s"'“‘(]*)([A-Za-z])/.exec(text);
    if (!m) { p.textContent = text; return p; }
    var size = opts.size || 70;
    var c = ART.canvas('dropcap', size, size, { letter: m[2].toUpperCase(), ground: opts.ground || 'verm' });
    c.className += ' initial';
    p.appendChild(c);
    var rest = m[1] + text.slice(m[0].length);
    if (opts.ink) inkInto(p, rest, opts.inkDelay || 0); else p.appendChild(document.createTextNode(rest));
    return p;
  };
  function inkInto(p, text, delay0) {
    var words = text.split(/(\s+)/), real = words.filter(function (w) { return /\S/.test(w); }).length;
    var step = Math.min(45, 2600 / Math.max(1, real)), k = 0;
    words.forEach(function (w) {
      if (!/\S/.test(w)) { p.appendChild(document.createTextNode(w)); return; }
      var s = el('span', 'inkw', w); s.style.animationDelay = Math.round(delay0 + k++ * step) + 'ms'; p.appendChild(s);
    });
  }
  UI.inkInto = inkInto;
  UI.plural = function (n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; };

  // ---------------------------------------------------------------- the puzzle screen
  var S = null;            // current state
  var grid = null;
  var settings = function () { return SAVE.data.settings; };

  function init() {
    grid = GRID.create($('pz-grid'), $('pz-gridwrap'));
    grid.onMark = function (a, b, mode) {
      if (!S) return;
      var cur = LOGIC.getMark(S.p, S.marks, a, b), next;
      if (mode === 'yes') next = 2;
      else next = cur === 0 || cur === 3 ? 1 : cur === 1 ? 2 : 0;
      if (next === cur) return;
      change([[a, b, next]], next === 1 ? 'cross' : next === 2 ? 'dot' : 'erase');
    };
    $('pz-back').onclick = function () { if (S && S.onBack) S.onBack(); };
    $('pz-hint').onclick = hint;
    $('pz-undo').onclick = undo; $('pz-redo').onclick = redo;
    $('pz-menu').onclick = function (e) { e.stopPropagation(); toggleMenu(); };
    $('zoom-in').onclick = function () { grid.zoomBy(1.4); syncZoom(); };
    $('zoom-out').onclick = function () { grid.zoomBy(1 / 1.4); syncZoom(); };
    Array.prototype.forEach.call(document.querySelectorAll('#scr-puzzle .tabs [data-tab]'), function (b) {
      b.onclick = function () { tab(b.getAttribute('data-tab')); };
    });
    document.addEventListener('click', function (e) { var m = $('pz-menusheet'); if (m.classList.contains('on') && !m.contains(e.target)) m.classList.remove('on'); });
    $('m-title').onclick = function () { closeMenu(); SAVE.write(); SCREENS.show('title'); };
    $('m-again').onclick = function () { closeMenu(); replayOne(); };
    $('m-check').onclick = function () { closeMenu(); check(); };
    $('m-undo').onclick = function () { closeMenu(); undo(); };
    $('m-redo').onclick = function () { closeMenu(); redo(); };
    $('m-reset').onclick = function () { closeMenu(); reset(); };
    $('m-story').onclick = function () { closeMenu(); showIntro(false); };
    ['auto', 'sound', 'music', 'showWrong'].forEach(function (k) {
      var b = $('m-' + k);
      b.onclick = function () {
        settings()[k] = !settings()[k]; SAVE.write();
        if (k === 'sound') AUDIO.enabled = settings().sound;
        if (k === 'music' && window.MUSIC) MUSIC.setEnabled(settings().music);
        syncMenu();
      };
    });
    window.addEventListener('keydown', function (e) {
      if (!S || !document.body.classList.contains('at-puzzle')) return;
      if (e.key === 'Escape') { if (!UI.closeTop()) closeMenu(); return; }
      if (!(e.ctrlKey || e.metaKey) || sheets.length) return;
      var k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    var t = 0;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(layout, 60); });
  }

  function toggleMenu() { syncMenu(); $('pz-menusheet').classList.toggle('on'); }
  function closeMenu() { $('pz-menusheet').classList.remove('on'); }
  function syncMenu() {
    ['auto', 'sound', 'music', 'showWrong'].forEach(function (k) { $('m-' + k).classList.toggle('on', !!settings()[k]); $('m-' + k).setAttribute('aria-checked', String(!!settings()[k])); });
    $('m-again').hidden = !(S && S.kind === 'story' && S.solved && S.o.onReplay);
    $('m-undo').disabled = !S || !S.undo.length; $('m-redo').disabled = !S || !S.redo.length;
  }
  function syncButtons() {
    $('pz-undo').disabled = !S.undo.length; $('pz-redo').disabled = !S.redo.length;
    $('pz-hint').textContent = S.hint && S.hint.cells ? 'Show me' : 'Ask the Prior';
    $('pz-hint').classList.toggle('showme', !!(S.hint && S.hint.cells));
    document.getElementById('scr-puzzle').classList.toggle('solved', !!S.solved);
  }
  function tab(name) {
    S.tab = name;
    Array.prototype.forEach.call(document.querySelectorAll('#scr-puzzle .tabs [data-tab]'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name)); });
    Array.prototype.forEach.call(document.querySelectorAll('#scr-puzzle .pane'), function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === name); });
  }

  PLAY = window.PLAY = {
    init: init,
    open: function (p, o) {
      if (!grid) init();
      UI.closeAll(); closeMenu();
      var rec = o.rec;
      S = { p: p, o: o, rec: rec, id: o.id, kind: o.kind || 'story', undo: [], redo: [], hint: null, wrong: null,
        solved: !!(o.solved || rec.solved), tab: 'clues', struck: {} };
      S.marks = LOGIC.deserializeMarks(p, rec.m || '');
      (rec.s || []).forEach(function (i) { S.struck[i] = true; });
      $('pz-title').textContent = p.title || 'A page of the Day Book';
      $('pz-sub').textContent = o.subtitle || '';
      grid.setPuzzle(p); grid.setMarks(S.marks);
      renderClues(); renderStory(); renderTally(); note(null);
      tab('clues'); syncButtons(); syncMenu();
      layout();
      $('pz-panel').scrollTop = 0;
      if (!rec.seen) showIntro(true);
    },
    state: function () { return S; },
    hint: function () { hint(); },
    reset: function () { if (S) change(null, 'erase', true); },
    solve: function () {
      if (!S) return;
      var list = [], sol = S.p.solution, cats = S.p.categories;
      Object.keys(sol).forEach(function (k) {
        var ids = [k].concat(sol[k]);
        for (var a = 0; a < ids.length; a++) for (var b = a + 1; b < ids.length; b++) list.push([ids[a], ids[b], 2]);
      });
      void cats;
      change(list, 'dot');
    },
    layout: function () { layout(); },
    grid: function () { return grid; }
  };

  // ---------------------------------------------------------------- one path for every change of marks
  // list: [[a, b, value], ...] or null with clear=true (reset)
  function change(list, sound, clear) {
    var before = LOGIC.serializeMarks(S.p, S.marks);
    if (clear) S.marks = LOGIC.newMarks(S.p);
    else list.forEach(function (c) { LOGIC.setMark(S.p, S.marks, c[0], c[1], c[2], settings().auto); });
    var after = LOGIC.serializeMarks(S.p, S.marks);
    if (after === before) return false;
    S.undo.push(before); if (S.undo.length > 2000) S.undo.shift();
    S.redo = [];
    if (sound) AUDIO.play(sound);
    committed(after);
    return true;
  }
  function restore(str) { S.marks = LOGIC.deserializeMarks(S.p, str); committed(str); AUDIO.play('tick'); }
  function undo() { if (!S || !S.undo.length) return; S.redo.push(LOGIC.serializeMarks(S.p, S.marks)); restore(S.undo.pop()); }
  function redo() { if (!S || !S.redo.length) return; S.undo.push(LOGIC.serializeMarks(S.p, S.marks)); restore(S.redo.pop()); }
  function committed(str) {
    S.rec.m = str; SAVE.write();
    clearHint(); grid.setWrong(null); S.wrong = null;
    grid.setMarks(S.marks); renderTally(); syncButtons(); syncMenu();
    if (!S.solved && LOGIC.isSolved(S.p, S.marks)) solvedNow();
  }

  // story puzzles only: blank the page again, keep the seal (SAVE.data.solved); rec.replay lets the screen open it unsolved
  function replayOne() {
    if (!S || S.kind !== 'story' || !S.solved || !S.o.onReplay) return;
    var o = S.o;
    UI.confirm('Start this page again from blank? Your seal stays.', 'Start again', 'Keep it', function () { UI.closeAll(); o.onReplay(); });
  }
  function reset() {
    UI.confirm('Rub out every mark on this page? (Undo will bring them back.)', 'Rub them out', 'Keep them', function () { change(null, 'erase', true); });
  }

  // ---------------------------------------------------------------- hints and checking
  function clearHint() {
    S.hint = null; grid.setHint(null);
    Array.prototype.forEach.call(document.querySelectorAll('#clues li.lit'), function (li) { li.classList.remove('lit'); });
    note(null);
  }
  function hint() {
    if (!S || S.solved) return;
    if (S.hint && S.hint.cells) {             // second press: show me
      var h0 = S.hint;
      change(h0.cells.map(function (c) { return [c.rowItem, c.colItem, c.state]; }), h0.cells.some(function (c) { return c.state === 2; }) ? 'dot' : 'cross');
      return;
    }
    var h = LOGIC.nextHint(S.p, S.marks);
    if (!h) return;
    S.rec.h = (S.rec.h || 0) + 1; SAVE.write();
    AUDIO.play('soft');
    if (h.wrong) {
      var n = h.wrong.filter(function (c) { return c.state !== 3; }).length || h.wrong.length;
      S.wrong = h.wrong; grid.setWrong(h.wrong); grid.reveal(h.wrong);
      note((n === 1 ? 'One of your marks is wrong' : numWord(n) + ' of your marks are wrong') + '. I have ringed ' + (n === 1 ? 'it' : 'them') + ' in red.',
        [['Rub ' + (n === 1 ? 'it' : 'them') + ' out', function () { change(h.wrong.map(function (c) { return [c.rowItem, c.colItem, 0]; }), 'erase'); }]], 'wrongnote');
      return;
    }
    S.hint = h;
    grid.setHint(h.cells); grid.reveal(h.cells);
    var lit = null;
    (h.clues || []).forEach(function (ci) { var li = $('clues').children[ci]; if (li) { li.classList.add('lit'); lit = lit || li; } });
    if (lit) { tab('clues'); setTimeout(function () { lit.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30); }
    note(h.why || 'Look at the ringed squares.', [['Show me', hint]], 'hintnote');
    syncButtons();
  }
  function check() {
    if (!S) return;
    var c = LOGIC.checkMarks(S.p, S.marks), n = c.wrong.length + c.wrongAuto.length;
    if (!n) {
      note(S.solved ? 'Every mark is right. The page is finished.' : 'No mistakes so far. Every mark on the page is sound.', null, 'checknote');
      AUDIO.play('soft'); return;
    }
    var all = c.wrong.concat(c.wrongAuto);
    var txt = (n === 1 ? 'One mark is wrong' : numWord(n) + ' marks are wrong');
    if (c.wrongAuto.length && c.wrong.length) txt += ' (' + c.wrongAuto.length + ' of them crossed out for you by a wrong ●)';
    if (settings().showWrong) { S.wrong = all; grid.setWrong(all); grid.reveal(all); txt += '. They are ringed in red.'; }
    else txt += '.';
    note(txt, settings().showWrong ? [['Rub them out', function () { change(all.map(function (q) { return [q.rowItem, q.colItem, 0]; }), 'erase'); }]] : null, 'wrongnote');
  }
  function numWord(n) { var w = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']; return w[n] || String(n); }
  function note(text, buttons, cls) {
    var box = $('pz-note');
    box.innerHTML = '';
    box.className = 'note' + (text ? ' on ' + (cls || '') : '');
    if (!text) return;
    if (cls === 'hintnote') box.appendChild(el('span', 'who', 'The Prior: '));
    box.appendChild(el('span', 'txt', text));
    var row = el('span', 'acts');
    (buttons || []).forEach(function (b) { var x = el('button', 'btn small verm', b[0]); x.onclick = b[1]; row.appendChild(x); });
    var cl = el('button', 'btn small close', '×'); cl.setAttribute('aria-label', 'Close');
    cl.onclick = function () { clearHint(); grid.setWrong(null); S.wrong = null; syncButtons(); };
    row.appendChild(cl); box.appendChild(row);
  }

  // ---------------------------------------------------------------- panels
  function renderClues() {
    var ol = $('clues'); ol.innerHTML = '';
    S.p.clues.forEach(function (c, i) {
      var li = el('li'); li.appendChild(el('span', 'num', (i + 1) + '.')); li.appendChild(el('span', 'ct', c.text));
      if (S.struck[i]) li.classList.add('struck');
      li.onclick = function () {
        S.struck[i] = !S.struck[i]; li.classList.toggle('struck', !!S.struck[i]);
        S.rec.s = Object.keys(S.struck).filter(function (k) { return S.struck[k]; }).map(Number); SAVE.write();
        AUDIO.play('tick');
      };
      ol.appendChild(li);
    });
  }
  function renderStory() {
    var box = $('story'); box.innerHTML = '';
    var p = S.p;
    if (p.place) box.appendChild(el('div', 'place', p.place));
    box.appendChild(UI.dropPara(p.intro || '', { size: 62 }));
    if (p.task) { var t = el('p', 'task'); t.innerHTML = '<span class="rubric">Your task:</span> ' + esc(p.task); box.appendChild(t); }
    if (S.solved && p.epilogue) {
      box.appendChild(ART.canvas('flourish', 220, 26, {}));
      box.appendChild(UI.dropPara(p.epilogue, { size: 62, ground: 'woad' }));
    }
    if (p.daybook) box.appendChild(el('div', 'seedline', 'Page ' + p.daybook.seed + (p.daybook.theme ? ' · ' + p.daybook.theme : '')));
  }
  function renderTally() {
    var rows = LOGIC.impliedTally(S.p, S.marks), cats = S.p.categories;
    var byId = {}; cats.forEach(function (c) { c.items.forEach(function (it) { byId[it.id] = it.name; }); });
    var html = '<table class="tally"><thead><tr>' + cats.map(function (c) { return '<th>' + esc(c.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr' + (r.conflict ? ' class="conflict"' : '') + '>' + r.items.map(function (id, ci) {
        return ci === 0 ? '<th>' + esc(byId[id] || '') + '</th>' : '<td>' + (id ? esc(byId[id]) : '<span class="unk">?</span>') + '</td>';
      }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    $('tally').innerHTML = html;
    $('tally-under').innerHTML = html;
  }

  // ---------------------------------------------------------------- story sheets
  function showIntro(first) {
    var p = S.p, box = el('div', 'page intro');
    box.appendChild(ART.canvas('corner', 64, 64, { at: 'tl' })).className += ' corner tl';
    box.appendChild(ART.canvas('corner', 64, 64, { at: 'tr' })).className += ' corner tr';
    box.appendChild(el('div', 'kicker', S.o.subtitle || ''));
    box.appendChild(el('h2', null, p.title || 'A page of the Day Book'));
    if (p.place) box.appendChild(el('div', 'place', p.place));
    if (p.chapterIntro && first) {
      box.appendChild(UI.dropPara(p.chapterIntro, { size: 78, ground: 'woad', cls: 'chintro' }));
      box.appendChild(ART.canvas('flourish', 200, 24, {})).className += ' fl';
      box.appendChild(el('p', null, p.intro || ''));
    } else box.appendChild(UI.dropPara(p.intro || '', { size: 78 }));
    if (p.task) { var t = el('p', 'task'); t.innerHTML = '<span class="rubric">Your task:</span> ' + esc(p.task); box.appendChild(t); }
    var row = el('div', 'btnrow'), b = el('button', 'btn verm big', first ? 'Begin' : 'Back to the page');
    row.appendChild(b); box.appendChild(row);
    var close = UI.sheet(box, { cls: 'paper', onClose: function () { if (!S.rec.seen) { S.rec.seen = true; SAVE.write(); } } });
    b.onclick = close;
    AUDIO.play('page');
  }

  function solvedNow() {
    S.solved = true; S.rec.solved = true; S.rec.replay = false; SAVE.write();
    clearHint(); syncButtons();
    if (S.o.onSolved) S.o.onSolved(S);
    grid.gild();
    AUDIO.play('bell');
    if (window.MUSIC) MUSIC.solved();
    renderStory();
    var id = S.id;
    setTimeout(function () { if (S && S.id === id) showEpilogue(); }, 1900);
  }
  function showEpilogue() {
    var p = S.p, o = S.o, box = el('div', 'page epilogue');
    box.appendChild(ART.canvas('corner', 64, 64, { at: 'tl' })).className += ' corner tl';
    box.appendChild(ART.canvas('corner', 64, 64, { at: 'tr' })).className += ' corner tr';
    box.appendChild(el('div', 'kicker', 'The page is finished'));
    box.appendChild(el('h2', null, p.title || 'A page of the Day Book'));
    box.appendChild(UI.dropPara(p.epilogue || 'Wystan sands the page and turns it.', { size: 78, ground: 'woad', ink: true, inkDelay: 200 }));
    var fl = ART.canvas('flourish', 240, 28, {}); fl.className += ' fl'; box.appendChild(fl);
    var foot = el('div', 'sealrow');
    foot.appendChild(ART.canvas('seal', 64, 64, {}));
    var h = S.rec.h || 0;
    foot.appendChild(el('div', 'hintsline', h ? 'The Prior was asked ' + UI.plural(h) + '.' : 'Solved without the Prior.'));
    box.appendChild(foot);
    var row = el('div', 'btnrow');
    var bBack = el('button', 'btn', o.backLabel || 'Back to the Chronicle'); row.appendChild(bBack);
    var bNext = null, bAgain = null;
    if (S.kind === 'story' && o.onReplay) { bAgain = el('button', 'btn', 'Play it again'); row.appendChild(bAgain); }
    if (o.onNext) { bNext = el('button', 'btn verm', o.nextLabel || 'Next'); row.appendChild(bNext); }
    box.appendChild(row);
    var close = UI.sheet(box, { cls: 'paper' });
    bBack.onclick = function () { close(); if (o.onBack) o.onBack(); };
    if (bNext) bNext.onclick = function () { close(); o.onNext(); };
    if (bAgain) bAgain.onclick = function () { close(); replayOne(); };
    AUDIO.play('page');
  }
  // blank a story record for replay (also used by the Chronicle's chapter replay)
  PLAY.blank = function (rec) { rec.m = ''; rec.s = []; rec.h = 0; rec.solved = false; rec.replay = true; };
  PLAY.showEpilogue = function () { if (S && S.solved) showEpilogue(); };

  // ---------------------------------------------------------------- layout
  function syncZoom() {
    var z = $('zoombar');
    z.classList.toggle('on', grid.canZoom());
    z.style.width = Math.max(0, grid.Lw - 4) + 'px'; z.style.height = Math.max(0, grid.Hh - 4) + 'px';
    $('zoom-out').disabled = grid.zoom <= 1.01;
    $('zoom-in').disabled = grid.zoom >= grid.maxZoom - 0.01;
  }
  function layout() {
    if (!S) return;
    var scr = $('scr-puzzle'), vw = window.innerWidth, vh = window.innerHeight;
    var wide = vw > vh * 1.1;
    scr.classList.toggle('wide', wide);
    var head = $('pz-head').offsetHeight || 52, tabsH = 46;
    var font = vw >= 700 && vh >= 600 ? 16 : 15, r, under = false;
    if (!wide) {
      var minPanel = Math.max(210, Math.round(vh * 0.28));
      r = grid.fit(vw - 12, vh - head - tabsH - minPanel - 10, { font: font, maxCell: 42 });
    } else {
      var side = Math.max(320, Math.min(480, Math.round(vw * 0.36)));
      var aw = vw - side - 28, ah = vh - head - 16;
      var nRows = S.p.categories[0].items.length + 1, tallyH = nRows * 31 + 18;
      if (vh >= 640) {
        r = grid.fit(aw, ah - tallyH, { font: font, maxCell: 44 });
        under = r.cell >= 26;
      }
      if (!under) r = grid.fit(aw, ah, { font: font, maxCell: 44 });
      scr.style.setProperty('--side', side + 'px');
    }
    scr.classList.toggle('tally-under', under);
    if (under && S.tab === 'tally') tab('clues');
    $('pz-gridbox').style.height = r.h + 'px';
    $('pz-gridbox').style.width = r.w + 'px';
    syncZoom();
  }
  // keep the zoom buttons honest after pinches and wheels
  document.addEventListener('pointerup', function () { if (grid && S) syncZoom(); }, true);
  document.addEventListener('wheel', function () { if (grid && S) syncZoom(); }, { passive: true, capture: true });
})();
var PLAY;
