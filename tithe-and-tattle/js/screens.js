/* Tithe & Tattle: the screen router and the plain screens (Chronicle list, Day Book).
 *   SCREENS.register(name, {el, enter(params), leave()})
 *   SCREENS.show(name, params, {replace})   pushes browser history so Android's back button walks back
 * Part 2 adds title, chapter leaves, Who's Who and the map by registering more screens here.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var Q = new URLSearchParams(location.search);

  var reg = {}, cur = null, curParams = null;
  var SCREENS = window.SCREENS = {
    register: function (name, s) { reg[name] = s; },
    current: function () { return cur; },
    show: function (name, params, opts) {
      opts = opts || {};
      var s = reg[name]; if (!s) return;
      if (cur && reg[cur] && reg[cur].leave) reg[cur].leave();
      UI.closeAll();
      Object.keys(reg).forEach(function (k) { reg[k].el.classList.toggle('on', k === name); });
      document.body.className = document.body.className.replace(/\bat-\S+/g, '').trim() + ' at-' + name;
      cur = name; curParams = params || {};
      if (window.MUSIC) MUSIC.screen(name);
      var st = { screen: name, params: curParams };
      try { if (opts.replace || opts.fromPop) history.replaceState(st, ''); else history.pushState(st, ''); } catch (e) { /* ignore */ }
      SAVE.data.screen = { name: name, params: curParams }; SAVE.write();
      if (s.enter) s.enter(curParams);
      window.scrollTo(0, 0);
    }
  };
  window.addEventListener('popstate', function (e) {
    if (UI.closeTop()) { try { history.pushState(e.state || history.state, ''); } catch (er) { /* ignore */ } return; }
    var st = e.state;
    if (st && st.screen && reg[st.screen]) SCREENS.show(st.screen, st.params, { fromPop: true });
    else SCREENS.show(reg.title ? 'title' : 'chronicle', {}, { fromPop: true });
  });

  // ---------------------------------------------------------------- the Chronicle
  var CHAPTERS = {
    0: { num: '', title: 'Samples', sub: 'worked examples for the writers' },
    1: { num: 'I', title: 'The Eel Rents', sub: 'Michaelmas' },
    2: { num: 'II', title: 'The New Bell', sub: 'Martinmas and Advent' },
    3: { num: 'III', title: 'The Boy Bishop', sub: 'Christmas' },
    4: { num: 'IV', title: 'High Water', sub: 'Lent' },
    5: { num: 'V', title: 'The Visitation', sub: 'Easter to May' },
    6: { num: 'VI', title: "St Alnoth's Day", sub: 'Midsummer to Lammas' }
  };
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  var STORYC = window.STORYC = {
    list: [], byId: {},
    build: function () {
      var showSample = Q.has('sample');
      var list = (window.STORY || []).filter(function (p) { return p && p.id && (!p.sample || showSample); });
      var seen = {};
      list = list.filter(function (p) { if (seen[p.id]) return false; seen[p.id] = true; return true; });
      list.sort(function (a, b) { return (a.sample ? -1 : 0) - (b.sample ? -1 : 0) || (a.chapter || 0) - (b.chapter || 0) || (a.number || 0) - (b.number || 0); });
      STORYC.list = list; STORYC.byId = {};
      list.forEach(function (p) { STORYC.byId[p.id] = p; });
    },
    chapters: function () {
      var groups = {}, order = [];
      STORYC.list.forEach(function (p) { var c = p.sample ? 0 : p.chapter || 0; if (!groups[c]) { groups[c] = []; order.push(c); } groups[c].push(p); });
      return order.map(function (c) { return { ch: c, items: groups[c] }; });
    },
    // unlocking: the first chapter present is open; a chapter opens when the one before has four solved
    // (or all of it, if it has fewer); in an open chapter the first puzzle is open and each solve opens the next
    isOpen: function (p) {
      if (Q.has('unlock') || p.sample || SAVE.data.solved[p.id]) return true;
      var chs = STORYC.chapters().filter(function (g) { return g.ch !== 0; }), gi = -1;
      chs.forEach(function (g, i) { if (g.items.indexOf(p) >= 0) gi = i; });
      if (gi < 0) return false;
      if (gi > 0) {
        var prev = chs[gi - 1].items, got = prev.filter(function (q) { return SAVE.data.solved[q.id]; }).length;
        if (got < Math.min(4, prev.length)) return false;
      }
      var items = chs[gi].items, k = items.indexOf(p);
      return k === 0 || !!SAVE.data.solved[items[k - 1].id];
    },
    chapterOpen: function (g) { return g.items.some(STORYC.isOpen); },
    next: function (p) {
      var i = STORYC.list.indexOf(p), q = STORYC.list[i + 1];
      return q && !q.sample && STORYC.isOpen(q) ? q : null;
    }
  };

  var NAV = [['chronicle', 'Chronicle'], ['daybook', 'Day Book'], ['whoswho', 'Who’s Who'], ['map', 'Map']];
  function nav(active) {
    var n = el('nav', 'topnav');
    var home = el('button', 'home', '‹ Title'); home.setAttribute('aria-label', 'Back to the title page');
    home.onclick = function () { SCREENS.show('title'); };
    n.appendChild(home);
    NAV.forEach(function (x) {
      if (!reg[x[0]]) return;
      var b = el('button', x[0] === active ? 'on' : '', x[1]);
      b.onclick = function () { if (x[0] !== active) SCREENS.show(x[0]); };
      n.appendChild(b);
    });
    return n;
  }
  SCREENS.nav = nav;

  var GRADES = { Apprentice: 1, Journeyman: 2, Master: 3 };
  function gradeMark(g) {
    var s = el('span', 'grade'), n = GRADES[g] || 0;
    if (n) s.appendChild(el('span', 'gglyph', new Array(n + 1).join('✦')));
    if (g) s.appendChild(document.createTextNode(' ' + g));
    return s;
  }
  SCREENS.gradeMark = gradeMark;
  // the chapter's opening in Wystan's voice: any field the writers used, on any puzzle of the chapter
  function chapterOpening(ch, items) {
    var extra = window.STORY_CHAPTERS && (window.STORY_CHAPTERS[ch] || null);
    if (extra) return typeof extra === 'string' ? extra : extra.opening || extra.intro || '';
    for (var i = 0; i < items.length; i++) {
      var p = items[i], v = p.chapterIntro || p.chapterOpening || p.chapterOpen;
      if (v) return Array.isArray(v) ? v.join('\n\n') : String(v);
    }
    return '';
  }
  // how many more solves in the previous present chapter open this one
  function needFor(ch) {
    var chs = STORYC.chapters().filter(function (g) { return g.ch !== 0 && g.ch < ch; });
    if (!chs.length) return null;
    var prev = chs[chs.length - 1], got = prev.items.filter(function (q) { return SAVE.data.solved[q.id]; }).length;
    return { n: Math.max(1, Math.min(4, prev.items.length) - got), ch: prev.ch };
  }

  SCREENS.register('chronicle', {
    el: $('scr-chronicle'),
    enter: function () {
      var box = $('scr-chronicle'); box.innerHTML = '';
      var inner = el('div', 'leaf');
      inner.appendChild(nav('chronicle'));
      var h = el('header', 'leafhead');
      h.appendChild(el('h1', null, 'The Chronicle'));
      h.appendChild(el('div', 'subtitle', 'Kept by Brother Wystan at the Abbey of St Alnoth, Michaelmas 1331 to Lammas 1332'));
      inner.appendChild(h);
      inner.appendChild(ART.canvas('flourish', 260, 28, {})).className += ' fl';
      var present = {}; STORYC.chapters().forEach(function (g) { present[g.ch] = g; });
      var order = present[0] ? [0] : [];
      for (var c = 1; c <= 6; c++) order.push(c);
      Object.keys(present).forEach(function (k) { k = +k; if (order.indexOf(k) < 0) order.push(k); });
      order.forEach(function (ch) {
        var g = present[ch];
        var C = CHAPTERS[ch] || { num: ROMAN[ch] || String(ch), title: 'Chapter ' + ch, sub: '' };
        var open = !!g && STORYC.chapterOpen(g);
        var sec = el('section', 'chapter card' + (open ? '' : ' locked') + (g ? '' : ' absent'));
        var hd = el('h2');
        if (C.num) { hd.appendChild(el('span', 'rn', C.num)); hd.appendChild(el('span', 'dot', ' · ')); }
        if (open && C.sub) { hd.appendChild(el('span', 'feast', C.sub)); hd.appendChild(el('span', 'dot', ' · ')); }
        hd.appendChild(el('span', 'chname', C.title));
        sec.appendChild(hd);
        if (!g) { sec.appendChild(el('div', 'lockline', 'Not yet written')); inner.appendChild(sec); return; }
        if (!open) {
          var need = needFor(ch);
          sec.appendChild(el('div', 'lockline', need ? 'Solve ' + need.n + ' more in Chapter ' + (CHAPTERS[need.ch] ? CHAPTERS[need.ch].num : need.ch) : 'Not yet open'));
          inner.appendChild(sec); return;
        }
        var opening = chapterOpening(ch, g.items);
        if (opening) {
          opening.split(/\n\s*\n/).forEach(function (para, i) {
            if (!para.trim()) return;
            sec.appendChild(i === 0 && UI.dropPara ? UI.dropPara(para.trim(), { cls: 'chopen' }) : el('p', 'chopen', para.trim()));
          });
        }
        var solvedN = g.items.filter(function (p) { return SAVE.data.solved[p.id]; }).length;
        sec.appendChild(el('div', 'chsub', solvedN + ' of ' + g.items.length + ' solved'));
        if (g.items.length && solvedN === g.items.length) {
          var again = el('button', 'btn small chagain', 'Play the chapter again');
          again.onclick = function () {
            UI.confirm('Start every page of this chapter again from blank? Your seals stay.', 'Start again', 'Keep them', function () {
              g.items.forEach(function (q) { PLAY.blank(SAVE.puz(q.id)); });
              SAVE.write();
              SCREENS.show('puzzle', { id: g.items[0].id });
            });
          };
          sec.appendChild(again);
        }
        var ul = el('ul', 'plist');
        g.items.forEach(function (p) {
          var ok = STORYC.isOpen(p), done = !!SAVE.data.solved[p.id];
          var li = el('li', (ok ? '' : 'locked') + (done ? ' done' : ''));
          var b = el('button', 'prow');
          b.disabled = !ok;
          b.appendChild(el('span', 'pn', p.sample ? '·' : String(p.number || '')));
          var t = el('span', 'pt'); t.appendChild(el('span', 'ptitle', ok ? (p.title || 'Untitled') : 'Not yet written'));
          if (ok) {
            var m = el('span', 'pmeta');
            m.appendChild(document.createTextNode([p.place, p.size].filter(Boolean).join(' · ') + (p.grade ? ' · ' : '')));
            m.appendChild(gradeMark(p.grade));
            if (SAVE.data.puz[p.id] && SAVE.data.puz[p.id].replay) m.appendChild(document.createTextNode(' · playing again'));
            else if (SAVE.data.puz[p.id] && SAVE.data.puz[p.id].m && !done) m.appendChild(document.createTextNode(' · begun'));
            t.appendChild(m);
          }
          b.appendChild(t);
          var mk = el('span', 'pmark');
          if (done) { var sc = ART.canvas('seal', 26, 26, {}); sc.setAttribute('aria-label', 'solved'); mk.appendChild(sc); }
          b.appendChild(mk);
          if (ok) b.onclick = function () { SCREENS.show('puzzle', { id: p.id }); };
          li.appendChild(b); ul.appendChild(li);
        });
        sec.appendChild(ul);
        inner.appendChild(sec);
      });
      box.appendChild(inner);
    }
  });
  SCREENS.CHAPTERS = CHAPTERS;

  // ---------------------------------------------------------------- the puzzle screen (story or Day Book)
  SCREENS.register('puzzle', {
    el: $('scr-puzzle'),
    enter: function (params) {
      if (params.daybook) return openDaybookPage();
      var p = STORYC.byId[params.id];
      if (!p || !STORYC.isOpen(p)) { SCREENS.show('chronicle', {}, { replace: true }); return; }
      var rec = SAVE.puz(p.id);
      rec.solved = !!SAVE.data.solved[p.id] && !rec.replay;   // a replay opens blank; the seal (SAVE.data.solved) stays
      if (!p.sample) SAVE.data.last = { id: p.id };
      if (window.CAST) CAST.meet(p);
      SAVE.write();
      var C = CHAPTERS[p.sample ? 0 : p.chapter] || {};
      PLAY.open(p, {
        kind: 'story', id: p.id, rec: rec,
        subtitle: (p.sample ? 'Sample' : 'Chapter ' + (C.num || p.chapter) + ' · ' + (p.number || '')) + ' · ' + p.size + ' · ' + p.grade,
        onBack: function () { SCREENS.show('chronicle'); },
        backLabel: 'Back to the Chronicle',
        onSolved: function () { SAVE.data.solved[p.id] = true; rec.replay = false; SAVE.write(); },
        onReplay: function () { PLAY.blank(rec); SAVE.write(); SCREENS.show('puzzle', { id: p.id }, { replace: true }); },
        onNext: function () { var q = STORYC.next(p); if (q) SCREENS.show('puzzle', { id: q.id }); else SCREENS.show('chronicle'); },
        nextLabel: 'Next'
      });
    }
  });

  // ---------------------------------------------------------------- the Day Book
  var SIZES = [[3, 3], [3, 4], [4, 4], [3, 5], [4, 5], [5, 5]];
  var dbPuzzle = null, dbKey = null;
  function dbParamsKey(pr) { return pr.cats + 'x' + pr.items + '|' + pr.grade + '|' + pr.seed; }
  function sizeLabel(c, n) { return c + '×' + n; }
  function makeDaybook(pr) {
    var k = dbParamsKey(pr);
    if (dbPuzzle && dbKey === k) return dbPuzzle;
    var p = DAYBOOK.generate({ cats: pr.cats, items: pr.items, grade: pr.grade, seed: pr.seed });
    if (p) { dbPuzzle = p; dbKey = k; }
    return p;
  }
  function openDaybookPage() {
    var cur = SAVE.data.daybook.cur;
    if (!cur) { SCREENS.show('daybook', {}, { replace: true }); return; }
    var p = makeDaybook(cur.params);
    if (!p) { SAVE.data.daybook.cur = null; SCREENS.show('daybook', {}, { replace: true }); return; }
    var pr = cur.params;
    SAVE.data.last = { daybook: true }; SAVE.write();
    PLAY.open(p, {
      kind: 'daybook', id: 'db:' + dbParamsKey(pr), rec: cur,
      subtitle: 'The Day Book · ' + sizeLabel(pr.cats, pr.items) + ' · ' + pr.grade,
      onBack: function () { SCREENS.show('daybook'); },
      backLabel: 'Back to the Day Book',
      onSolved: function () {
        var key = sizeLabel(pr.cats, pr.items) + '|' + pr.grade, st = SAVE.data.daybook.stats;
        st[key] = (st[key] || 0) + 1; SAVE.write();
      },
      onNext: function () { newPage(pr.cats, pr.items, pr.grade, null, true); },
      nextLabel: 'Another page'
    });
  }
  // generate after a yield so "Wystan is writing…" shows first
  function newPage(cats, items, grade, seed, fromPuzzle) {
    if (seed == null) seed = Math.floor(Math.random() * 1e9);
    var wait = el('div', 'writing');
    wait.appendChild(el('div', 'quill', '✒'));
    wait.appendChild(el('p', null, 'Wystan is writing…'));
    var close = UI.sheet(wait, { cls: 'small', dismiss: false });
    // two plain timeouts (not rAF, which never fires in a hidden tab) let the sheet paint first
    setTimeout(function () {
      setTimeout(function () {
        var pr = { cats: cats, items: items, grade: grade, seed: seed };
        var p = makeDaybook(pr);
        close();
        if (!p) { alertNote('The page would not come right. Try again.'); return; }
        SAVE.data.daybook.cur = { params: pr, m: '', s: [], h: 0, seen: false, solved: false };
        SAVE.data.daybook.last = { cats: cats, items: items, grade: grade };
        SAVE.write();
        SCREENS.show('puzzle', { daybook: true }, { replace: !!fromPuzzle && SCREENS.current() === 'puzzle' });
      }, 40);
    }, 30);
  }
  function alertNote(t) { var b = el('div', 'confirm'); b.appendChild(el('p', null, t)); var c = UI.sheet(b, { cls: 'small' }); setTimeout(c, 2200); }

  SCREENS.register('daybook', {
    el: $('scr-daybook'),
    enter: function () {
      var box = $('scr-daybook'); box.innerHTML = '';
      var D = SAVE.data.daybook, sel = { cats: D.last.cats, items: D.last.items, grade: D.last.grade };
      var inner = el('div', 'leaf');
      inner.appendChild(nav('daybook'));
      var h = el('header', 'leafhead');
      h.appendChild(el('h1', null, 'The Day Book'));
      h.appendChild(el('div', 'subtitle', 'Wystan’s scratch pages: small affairs of the town, as many as you like'));
      inner.appendChild(h);
      inner.appendChild(ART.canvas('flourish', 260, 28, {})).className += ' fl';

      if (D.cur && !D.cur.solved) {
        var pr = D.cur.params, cont = el('div', 'continue');
        cont.appendChild(el('span', null, 'A page is open: ' + sizeLabel(pr.cats, pr.items) + ', ' + pr.grade + '. '));
        var cb = el('button', 'btn verm', 'Continue the open page');
        cb.onclick = function () { SCREENS.show('puzzle', { daybook: true }); };
        cont.appendChild(cb); inner.appendChild(cont);
      }

      inner.appendChild(el('h3', null, 'Size of the page'));
      var sz = el('div', 'chips');
      SIZES.forEach(function (s) {
        var b = el('button', 'chip', sizeLabel(s[0], s[1]));
        b.setAttribute('data-k', s.join('x'));
        b.onclick = function () { sel.cats = s[0]; sel.items = s[1]; sync(); };
        sz.appendChild(b);
      });
      inner.appendChild(sz);
      var szNote = el('div', 'chipnote'); inner.appendChild(szNote);
      inner.appendChild(el('h3', null, 'Grade'));
      var gr = el('div', 'chips');
      var GDESC = { Apprentice: 'one clue at a time', Journeyman: 'clues read together', Master: 'longer chains of reasoning' };
      DAYBOOK.GRADES.forEach(function (g) {
        var b = el('button', 'chip', g); b.setAttribute('data-g', g);
        b.onclick = function () { sel.grade = g; sync(); };
        gr.appendChild(b);
      });
      inner.appendChild(gr);
      var grNote = el('div', 'chipnote'); inner.appendChild(grNote);
      var go = el('button', 'btn verm big', 'Open a new page');
      var seedQ = Q.get('seed');
      go.onclick = function () {
        var seed = null;
        if (seedQ != null && seedQ !== '') { seed = /^\d+$/.test(seedQ) ? Number(seedQ) : seedQ; seedQ = null; }
        newPage(sel.cats, sel.items, sel.grade, seed);
      };
      var gorow = el('div', 'btnrow left'); gorow.appendChild(go); inner.appendChild(gorow);
      if (D.cur) inner.appendChild(el('div', 'seedline', 'Last page: ' + D.cur.params.seed));

      inner.appendChild(el('h3', null, 'Pages finished'));
      var any = false, tb = el('table', 'stats'), hr = el('tr');
      hr.appendChild(el('th', null, ''));
      DAYBOOK.GRADES.forEach(function (g) { hr.appendChild(el('th', null, g)); });
      var th = el('thead'); th.appendChild(hr); tb.appendChild(th);
      var body = el('tbody');
      SIZES.forEach(function (s) {
        var tr = el('tr'); tr.appendChild(el('th', null, sizeLabel(s[0], s[1])));
        DAYBOOK.GRADES.forEach(function (g) { var v = D.stats[sizeLabel(s[0], s[1]) + '|' + g] || 0; if (v) any = true; tr.appendChild(el('td', v ? '' : 'zero', v ? String(v) : '·')); });
        body.appendChild(tr);
      });
      tb.appendChild(body);
      inner.appendChild(tb);
      if (!any) inner.appendChild(el('div', 'chipnote', 'None yet.'));
      box.appendChild(inner);

      function sync() {
        Array.prototype.forEach.call(sz.children, function (b) { b.classList.toggle('on', b.getAttribute('data-k') === sel.cats + 'x' + sel.items); });
        Array.prototype.forEach.call(gr.children, function (b) { b.classList.toggle('on', b.getAttribute('data-g') === sel.grade); });
        szNote.textContent = sel.cats + ' kinds of thing, ' + sel.items + ' of each' + (sel.cats === 5 && sel.items === 5 ? '. Best on a large screen.' : sel.cats * sel.items >= 20 ? '. Pinch to zoom on a phone.' : '.');
        grNote.textContent = GDESC[sel.grade] || '';
      }
      sync();
    }
  });

  SCREENS.daybookPuzzle = function () { return dbPuzzle; };
  SCREENS.newPage = newPage;
  SCREENS.makeDaybook = makeDaybook;
})();
