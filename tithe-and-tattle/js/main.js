/* Tithe & Tattle: boot and test hooks.
 *   window.TT = {load(id), loadDaybook({cats, items, grade, seed}), solve(), state(), hint(), reset()}
 */
(function () {
  'use strict';
  SAVE.load();
  AUDIO.enabled = SAVE.data.settings.sound;
  if (window.MUSIC) MUSIC.setEnabled(SAVE.data.settings.music);
  STORYC.build();
  PLAY.init();

  // parchment grain: a small tile of noise, generated once
  try {
    var c = document.createElement('canvas'); c.width = c.height = 160;
    var x = c.getContext('2d'), d = x.createImageData(160, 160);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = Math.random();
      d.data[i] = 90; d.data[i + 1] = 62; d.data[i + 2] = 30; d.data[i + 3] = v < 0.5 ? Math.round(v * 22) : v > 0.985 ? 40 : 0;
    }
    x.putImageData(d, 0, 0);
    document.documentElement.style.setProperty('--grain', 'url(' + c.toDataURL() + ')');
  } catch (e) { /* no grain */ }

  if (window.CAST) CAST.backfill();

  // a fresh visit opens on the title page; a reload in the same tab returns to the screen it was on
  function start() {
    var s = SAVE.data.screen || {}, name = s.name, params = s.params || {}, again = false;
    try { again = sessionStorage.getItem('tt.session') === '1'; sessionStorage.setItem('tt.session', '1'); } catch (e) { /* no session store */ }
    if (!again) { name = 'title'; params = {}; }
    if (name === 'puzzle' && params.daybook && !SAVE.data.daybook.cur) name = 'daybook';
    if (name === 'puzzle' && !params.daybook && !(STORYC.byId[params.id] && STORYC.isOpen(STORYC.byId[params.id]))) name = 'chronicle';
    if (['puzzle', 'daybook', 'chronicle', 'title', 'whoswho', 'map'].indexOf(name) < 0) name = 'title';
    SCREENS.show(name, name === 'puzzle' ? params : {}, { replace: true });
  }
  start();
  ART.load('art/').then(function () { ART.repaintAll(); }, function () { /* procedural art stays */ });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ART.repaintAll(); PLAY.layout(); });

  window.TT = {
    load: function (id) { SCREENS.show('puzzle', { id: id }); return !!(PLAY.state() && PLAY.state().id === id); },
    loadDaybook: function (pr) {
      pr = pr || {};
      var params = { cats: pr.cats || 3, items: pr.items || 4, grade: pr.grade || 'Apprentice', seed: pr.seed != null ? pr.seed : 1 };
      var p = SCREENS.makeDaybook(params);
      if (!p) return false;
      SAVE.data.daybook.cur = { params: params, m: '', s: [], h: 0, seen: true, solved: false };
      SCREENS.show('puzzle', { daybook: true });
      return true;
    },
    solve: function () { PLAY.solve(); return PLAY.state() && PLAY.state().solved; },
    state: function () {
      var S = PLAY.state(); if (!S) return null;
      return { id: S.id, kind: S.kind, solved: S.solved, marks: LOGIC.serializeMarks(S.p, S.marks), hints: S.rec.h || 0,
        undo: S.undo.length, redo: S.redo.length, struck: S.rec.s || [], cell: PLAY.grid().cell, zoom: PLAY.grid().zoom };
    },
    hint: function () { PLAY.hint(); var S = PLAY.state(); return S && S.hint ? { why: S.hint.why, cells: S.hint.cells } : S && S.wrong ? { wrong: S.wrong.length } : null; },
    reset: function () { PLAY.reset(); }
  };
})();
