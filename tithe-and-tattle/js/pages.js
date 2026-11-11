/* Tithe & Tattle: the title page, Who's Who and the map.
 *   title    painted initial, subtitle, Continue (when a puzzle is in progress), The Chronicle / Day Book / Who's Who / Map
 *   whoswho  the cast (CAST.list); a person shows once a puzzle with them in its characters has been opened
 *   map      ART 'map' slot with a separate marker layer placed in fractions (ART.MAP_PLACES), so a PNG can replace the map
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var CH = function () { return SCREENS.CHAPTERS || {}; };
  function chLabel(p) { var C = CH()[p.sample ? 0 : p.chapter] || {}; return p.sample ? 'Sample' : 'Chapter ' + (C.num || p.chapter || '?') + (p.number ? ' · ' + p.number : ''); }

  // ---------------------------------------------------------------- title page
  function continueTarget() {
    var L = SAVE.data.last || {}, D = SAVE.data.daybook.cur;
    if (L.id) {
      var p = STORYC.byId[L.id];
      if (p && (!SAVE.data.solved[p.id] || (SAVE.data.puz[p.id] && SAVE.data.puz[p.id].replay)) && STORYC.isOpen(p)) return { label: p.title, go: ['puzzle', { id: p.id }] };
    }
    if (D && !D.solved && D.params && (L.daybook || D.m)) return { label: 'the open Day Book page', go: ['puzzle', { daybook: true }] };
    for (var i = 0; i < STORYC.list.length; i++) {
      var q = STORYC.list[i], r = SAVE.data.puz[q.id];
      if (!q.sample && r && r.m && (!SAVE.data.solved[q.id] || r.replay) && STORYC.isOpen(q)) return { label: q.title, go: ['puzzle', { id: q.id }] };
    }
    return null;
  }
  SCREENS.register('title', {
    el: $('scr-title'),
    enter: function () {
      var box = $('scr-title'); box.innerHTML = '';
      ['tl', 'tr', 'bl', 'br'].forEach(function (at) {
        var c = ART.canvas('corner', 70, 70, { at: at }); c.className += ' tcorner ' + at; box.appendChild(c);
      });
      var page = el('div', 'titlepage');
      var head = el('div', 'tline');
      var big = window.innerWidth >= 700;
      var cap = ART.canvas('titlecap', big ? 128 : 92, big ? 128 : 92, { letter: 'T' }); cap.className += ' tcap';
      head.appendChild(cap);
      var h1 = el('h1', null, 'ithe & Tattle'); h1.setAttribute('aria-label', 'Tithe & Tattle');
      head.appendChild(h1);
      page.appendChild(head);
      page.appendChild(el('p', 'tsub', 'Puzzles from the chronicle of Brother Wystan, Abbey of St Alnoth, 1331'));
      var fl = ART.canvas('flourish', 240, 26, {}); fl.className += ' fl'; page.appendChild(fl);
      var menu = el('div', 'tmenu');
      var ct = continueTarget();
      if (ct) {
        var cb = el('button', 'btn verm big');
        cb.appendChild(el('span', null, 'Continue'));
        cb.appendChild(el('span', 'tcont', ct.label));
        cb.onclick = function () { SCREENS.show(ct.go[0], ct.go[1]); };
        menu.appendChild(cb);
      }
      [['chronicle', 'The Chronicle'], ['daybook', 'The Day Book'], ['whoswho', 'Who’s Who'], ['map', 'Map']].forEach(function (x) {
        var b = el('button', 'btn big', x[1]); b.onclick = function () { SCREENS.show(x[0]); }; menu.appendChild(b);
      });
      page.appendChild(menu);
      box.appendChild(page);
    }
  });

  // ---------------------------------------------------------------- Who's Who
  var HONOUR = /^(the|brother|abbot|prior|father|dame|widow|mistress|master)\s+/i;
  var GROUNDS = { abbey: 'woad', town: 'verm', others: 'green' };
  SCREENS.register('whoswho', {
    el: $('scr-whoswho'),
    enter: function () {
      var box = $('scr-whoswho'); box.innerHTML = '';
      var inner = el('div', 'leaf');
      inner.appendChild(SCREENS.nav('whoswho'));
      var h = el('header', 'leafhead');
      h.appendChild(el('h1', null, 'Who’s Who'));
      h.appendChild(el('div', 'subtitle', 'The people of Mardle and the abbey, as Brother Wystan wrote them down'));
      inner.appendChild(h);
      var fl = ART.canvas('flourish', 260, 28, {}); fl.className += ' fl'; inner.appendChild(fl);
      var met = SAVE.data.met || {}, n = CAST.list.filter(function (c) { return met[c.id]; }).length;
      inner.appendChild(el('div', 'chsub center', n + ' of ' + CAST.list.length + ' met'));
      CAST.GROUPS.forEach(function (gr) {
        var sec = el('section', 'castgroup');
        sec.appendChild(el('h2', null, gr[1]));
        var ul = el('ul', 'castlist');
        CAST.list.filter(function (c) { return c.group === gr[0]; }).forEach(function (c) {
          var known = !!met[c.id], li = el('li', 'person' + (known ? '' : ' unmet'));
          var letter = c.name.replace(HONOUR, '').charAt(0);
          var pc = ART.canvas('portrait-' + c.id, 54, 54, { letter: letter, ground: GROUNDS[c.group], blank: !known, id: c.id });
          if (known && ART.image('portrait-' + c.id)) {   // only a painted portrait can be enlarged
            var pb = el('button', 'portbtn'); pb.type = 'button';
            pb.setAttribute('aria-label', 'View larger portrait of ' + c.name);
            pb.appendChild(pc); li.appendChild(pb);
            pb.onclick = function () { UI.lightbox({ img: ART.image('portrait-' + c.id), caption: [c.name, c.desc], trigger: pb }); };
          } else li.appendChild(pc);
          var info = el('div', 'pinfo');
          if (known) {
            info.appendChild(el('h3', null, c.name));
            info.appendChild(el('p', 'pdesc', c.desc));
            var p = STORYC.byId[met[c.id]], fm = el('p', 'firstmet', 'First met in ');
            fm.appendChild(el('i', null, p ? p.title : 'an earlier page'));
            info.appendChild(fm);
          } else info.appendChild(el('h3', null, '…'));
          li.appendChild(info); ul.appendChild(li);
        });
        sec.appendChild(ul); inner.appendChild(sec);
      });
      box.appendChild(inner);
    }
  });

  // ---------------------------------------------------------------- the map
  var ZOOMS = [1, 1.5, 2, 2.5];
  function placeOf(p) {
    var P = ART.MAP_PLACES || [];
    if (p.mapPlace) for (var i = 0; i < P.length; i++) if (P[i].id === p.mapPlace) return P[i].id;
    var s = String(p.place || '');
    if (!s) return 'elsewhere';
    for (var j = 0; j < P.length; j++) if (P[j].re.test(s)) return P[j].id === 'abbey' ? 'cloister' : P[j].id;
    return 'elsewhere';
  }
  function placesWithPuzzles() {
    var by = {}, order = [];
    STORYC.list.forEach(function (p) {
      if (p.sample) return;
      var id = placeOf(p);
      if (!by[id]) { by[id] = []; order.push(id); }
      by[id].push(p);
    });
    var P = {}; (ART.MAP_PLACES || []).forEach(function (m) { P[m.id] = m; });
    var n = 0;   // 'elsewhere' has no marker, so it takes no number
    return order.map(function (id) { return { id: id, n: P[id] ? ++n : 0, place: P[id] || null, items: by[id] }; });
  }
  function placeSheet(g) {
    var b = el('div', 'placesheet');
    b.appendChild(el('h3', null, (g.place ? g.place.label : 'Elsewhere').replace(/^./, function (c) { return c.toUpperCase(); })));
    var ul = el('ul', 'plist'), close;
    g.items.forEach(function (p) {
      var ok = STORYC.isOpen(p), done = !!SAVE.data.solved[p.id], li = el('li', (ok ? '' : 'locked') + (done ? ' done' : ''));
      var btn = el('button', 'prow'); btn.disabled = !ok;
      var t = el('span', 'pt');
      t.appendChild(el('span', 'ptitle', ok ? p.title : 'Not yet written'));
      t.appendChild(el('span', 'pmeta', chLabel(p) + (ok && p.place ? ' · ' + p.place : '')));
      btn.appendChild(t);
      var mk = el('span', 'pmark'); if (done) mk.appendChild(ART.canvas('seal', 24, 24, {})); btn.appendChild(mk);
      if (ok) btn.onclick = function () { if (close) close(); SCREENS.show('puzzle', { id: p.id }); };
      li.appendChild(btn); ul.appendChild(li);
    });
    b.appendChild(ul);
    var row = el('div', 'btnrow'), cb = el('button', 'btn', 'Close'); row.appendChild(cb); b.appendChild(row);
    close = UI.sheet(b, { cls: 'small' });
    cb.onclick = function () { close(); };
  }

  var mapState = { zoom: 0, onResize: null, lastW: 0 };
  function baseWidth(wrap) {
    var cw = wrap.clientWidth || Math.min(window.innerWidth, 680);
    if (window.innerWidth < 700) return cw;
    return Math.round(Math.min(cw, 820, Math.max(360, (window.innerHeight - 150) /(ART.MAP_ASPECT || 1.3))));
  }
  function renderMap(wrap, groups, keep) {
    var z = ZOOMS[mapState.zoom], W = Math.round(baseWidth(wrap) * z), H = Math.round(W * (ART.MAP_ASPECT || 1.3));
    var fx = 0.5, fy = 0.5, old = wrap.firstChild;
    if (keep && old) { fx = (wrap.scrollLeft + wrap.clientWidth / 2) / old.offsetWidth; fy = (wrap.scrollTop + wrap.clientHeight / 2) / old.offsetHeight; }
    wrap.innerHTML = '';
    var inner = el('div', 'mapinner'); inner.style.width = W + 'px'; inner.style.height = H + 'px';
    inner.appendChild(ART.canvas('map', W, H, {}));
    var layer = el('div', 'marks');
    groups.forEach(function (g) {
      if (!g.place) return;
      var anyOpen = g.items.some(STORYC.isOpen);
      var m = el('button', 'mark' + (anyOpen ? '' : ' shut'), String(g.n));
      m.style.left = (g.place.fx * 100) + '%'; m.style.top = (g.place.fy * 100) + '%';
      m.setAttribute('aria-label', g.n + ': ' + g.place.label + ', ' + g.items.length + (g.items.length === 1 ? ' page' : ' pages'));
      m.onclick = function () { placeSheet(g); };
      layer.appendChild(m);
    });
    inner.appendChild(layer);
    wrap.appendChild(inner);
    // the whole map is already sized to fit, so its frame wraps it; zoomed, the frame scrolls
    wrap.style.height = z === 1 ? 'auto' : Math.min(H, Math.max(320, window.innerHeight - 150)) + 'px';
    wrap.style.overflow = z === 1 ? 'hidden' : '';
    if (keep) { wrap.scrollLeft = fx * W - wrap.clientWidth / 2; wrap.scrollTop = fy * H - wrap.clientHeight / 2; }
    // the frame can settle at a different width once the page is laid out: fit the whole map to it
    if (z === 1 && !keep && !renderMap.again && Math.abs(baseWidth(wrap) - W) > 2) { renderMap.again = true; renderMap(wrap, groups, false); renderMap.again = false; }
  }
  SCREENS.register('map', {
    el: $('scr-map'),
    enter: function () {
      var box = $('scr-map'); box.innerHTML = '';
      var inner = el('div', 'leaf wide');
      inner.appendChild(SCREENS.nav('map'));
      var h = el('header', 'leafhead');
      h.appendChild(el('h1', null, 'Mardle and the Abbey'));
      h.appendChild(el('div', 'subtitle', 'The places in the chronicle are marked in red. Tap one to see what happened there.'));
      inner.appendChild(h);
      var groups = placesWithPuzzles();
      var tools = el('div', 'maptools');
      var vb = el('button', 'iconbtn', '⤢'); vb.setAttribute('aria-label', 'View the whole map full screen'); vb.title = 'View the whole map';
      vb.onclick = function () {
        UI.lightbox({ img: ART.image('map'), zoom: true, trigger: vb, caption: null, canvas: function (w, h) { return ART.canvas('map', w, h, {}); } });
      };
      var zo = el('button', 'iconbtn', '−'), zi = el('button', 'iconbtn', '+');
      zo.setAttribute('aria-label', 'Zoom out'); zi.setAttribute('aria-label', 'Zoom in');
      var zl = el('span', 'zlabel');
      tools.appendChild(zo); tools.appendChild(zl); tools.appendChild(zi); tools.appendChild(vb);
      inner.appendChild(tools);
      var wrap = el('div', 'mapwrap'); inner.appendChild(wrap);
      function syncZ() { zo.disabled = mapState.zoom === 0; zi.disabled = mapState.zoom === ZOOMS.length - 1; zl.textContent = ZOOMS[mapState.zoom] === 1 ? 'whole map' : '×' + ZOOMS[mapState.zoom]; }
      zo.onclick = function () { if (mapState.zoom > 0) { mapState.zoom--; syncZ(); renderMap(wrap, groups, true); } };
      zi.onclick = function () { if (mapState.zoom < ZOOMS.length - 1) { mapState.zoom++; syncZ(); renderMap(wrap, groups, true); } };
      // the key
      inner.appendChild(el('h3', null, 'The places'));
      var key = el('ol', 'mapkey');
      groups.forEach(function (g) {
        var li = el('li'), b = el('button', 'keyrow');
        b.appendChild(el('span', 'mark inline' + (g.items.some(STORYC.isOpen) ? '' : ' shut'), g.place ? String(g.n) : '·'));
        var t = el('span', 'pt');
        t.appendChild(el('span', 'ptitle', g.place ? g.place.label.replace(/^./, function (c) { return c.toUpperCase(); }) : 'Elsewhere'));
        var solved = g.items.filter(function (p) { return SAVE.data.solved[p.id]; }).length;
        t.appendChild(el('span', 'pmeta', g.items.length + (g.items.length === 1 ? ' page' : ' pages') + (solved ? ', ' + solved + ' solved' : '')));
        b.appendChild(t);
        b.onclick = function () { placeSheet(g); };
        li.appendChild(b); key.appendChild(li);
      });
      if (!groups.length) inner.appendChild(el('p', 'empty', 'No pages of the chronicle are written yet.'));
      inner.appendChild(key);
      box.appendChild(inner);
      syncZ();
      renderMap(wrap, groups, false);
      mapState.lastW = window.innerWidth;
      var tmr = null;
      mapState.onResize = function () {
        clearTimeout(tmr);
        tmr = setTimeout(function () {
          if (Math.abs(window.innerWidth - mapState.lastW) < 2 && window.innerWidth < 700) return;   // phone URL bar
          mapState.lastW = window.innerWidth; renderMap(wrap, groups, true);
        }, 180);
      };
      window.addEventListener('resize', mapState.onResize);
    },
    leave: function () { if (mapState.onResize) window.removeEventListener('resize', mapState.onResize); mapState.onResize = null; }
  });
  SCREENS.mapPlaceOf = placeOf;
})();
