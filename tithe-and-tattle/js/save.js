/* Tithe & Tattle: the save (localStorage 'tithe.v1'). Every access is wrapped: a private window,
 * blocked storage or a full quota must never break the game.
 *   SAVE.data   = { v, solved: {id: true}, puz: {id: {m, s: [struck clue indexes], h, seen}},
 *                   settings: {auto, sound, music, showWrong}, screen: {name, id?},
 *                   daybook: {cur: {params, m, s, h, seen, solved} | null, stats: {'4×5|Master': n}, last: {cats, items, grade}},
 *                   met: {} (part 2: Who's Who) }
 *   SAVE.write() commits soon (coalesced), SAVE.flush() at once.
 */
(function () {
  'use strict';
  var KEY = 'tithe.v1';
  function fresh() {
    return { v: 1, solved: {}, puz: {}, settings: { auto: true, sound: true, music: true, showWrong: true },
      screen: { name: 'chronicle' }, daybook: { cur: null, stats: {}, last: { cats: 3, items: 4, grade: 'Apprentice' } }, met: {} };
  }
  function merge(d) {
    var f = fresh();
    if (!d || typeof d !== 'object') return f;
    ['solved', 'puz', 'met'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') f[k] = d[k]; });
    if (d.settings) Object.keys(f.settings).forEach(function (k) { if (typeof d.settings[k] === 'boolean') f.settings[k] = d.settings[k]; });
    if (d.screen && d.screen.name) f.screen = d.screen;
    if (d.last && typeof d.last === 'object') f.last = d.last;   // the last puzzle opened, for Continue: {id} or {daybook: true}
    if (d.daybook) {
      if (d.daybook.cur && d.daybook.cur.params) f.daybook.cur = d.daybook.cur;
      if (d.daybook.stats) f.daybook.stats = d.daybook.stats;
      if (d.daybook.last) f.daybook.last = d.daybook.last;
    }
    return f;
  }
  var timer = null;
  var SAVE = {
    data: fresh(),
    load: function () {
      try { var s = localStorage.getItem(KEY); SAVE.data = merge(s ? JSON.parse(s) : null); }
      catch (e) { SAVE.data = fresh(); }
      return SAVE.data;
    },
    flush: function () {
      if (timer) { clearTimeout(timer); timer = null; }
      try { localStorage.setItem(KEY, JSON.stringify(SAVE.data)); } catch (e) { /* storage unavailable */ }
    },
    write: function () { if (!timer) timer = setTimeout(SAVE.flush, 120); },
    puz: function (id) {
      var p = SAVE.data.puz[id];
      if (!p) p = SAVE.data.puz[id] = { m: '', s: [], h: 0, seen: false };
      return p;
    },
    wipe: function () { SAVE.data = fresh(); SAVE.flush(); }
  };
  window.addEventListener('pagehide', function () { SAVE.flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') SAVE.flush(); });
  window.SAVE = SAVE;
})();
