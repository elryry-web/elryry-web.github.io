/* Old Light UI: the tutorial. In a scenario with tutorial: true, cards from OL_DATA.TUTORIAL pause the battle at set
   moments and point at the part of the screen they describe. Each card shows once per battle; Skip tutorial ends them. */
(function () {
  'use strict';
  var U = window.OLUI = window.OLUI || {};
  var T = U.tutor = {};
  var $ = function (id) { return document.getElementById(id); };
  var tu = null;   // { on, done: {id: true}, queue: [], cur, wasRunning, then }

  // where each highlight lives: the panel tab to open, the element to scroll into view, and where the card sits
  var HI = {
    time: { pos: 'top' },
    man: { tab: 'helm', el: '#pBody .sec.man', pos: 'top' },
    gbands: { tab: 'helm', el: '#pBody .gbands', pos: 'top' },
    card: { pos: 'top' },
    guns: { tab: 'guns', pos: 'top' },
    threats: { pos: 'bottom' },
    meters: { pos: 'top' }
  };
  function step(id) { var L = U.D.TUTORIAL; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  T.active = function () { return !!(tu && tu.on); };
  T.state = function () { return tu; };   // for test harnesses
  T.start = function (scnKey) {
    clear(); tu = null;
    if (!U.D.SCENARIOS[scnKey] || !U.D.SCENARIOS[scnKey].tutorial) return;
    tu = { on: true, done: {}, queue: [], cur: null, wasRunning: false, then: null };
    tu.hold = true; ['plot', 'time', 'helm', 'gbands'].forEach(function (id) { fire(id); }); tu.hold = false; next(true);
  };
  T.stop = function () { clear(); tu = null; };

  // queue a step; it shows at once unless another card is up
  function fire(id, then) {
    if (!tu || !tu.on || tu.done[id] || !step(id)) return false;
    tu.done[id] = true; tu.queue.push({ id: id, then: then || null });
    if (!tu.cur && !tu.hold) next(true);
    else { var b = document.querySelector('#tut [data-t="next"]'); if (b) b.textContent = 'Next'; }
    return true;
  }
  T.fire = fire;

  function next(first) {
    var st = U.st(); if (!st) return;
    if (first) tu.wasRunning = !st.paused && !st.over;
    var q = tu.queue.shift(); if (!q) return;
    tu.cur = q; st.paused = true; st.acc = 0; (tu.log || (tu.log = [])).push(q.id + '@' + st.w.t);
    show(step(q.id));
  }
  function show(sp) {
    var b = $('battle'), el = $('tut'), h = sp.highlight && HI[sp.highlight] ? HI[sp.highlight] : null, st = U.st();
    hiOff();
    b.classList.add('tut-on');
    if (h) {
      b.classList.add('tut-hi-' + sp.highlight);
      if (h.tab) U.panels.showTab(h.tab);
      if (h.el) setTimeout(function () { var x = document.querySelector(h.el); if (x && x.scrollIntoView) x.scrollIntoView({ block: 'nearest' }); }, 320);
    }
    if (sp.highlight === 'card' && st) { var c = (st.view && st.view.contacts || []).filter(function (x) { return x.kind === 'ship'; })[0]; if (c) st.cardId = c.id; }
    var last = !tu.queue.length;
    el.innerHTML = '<h4>' + esc(sp.title) + '</h4><p>' + esc(sp.body) + '</p><div class="tut-btns">' +
      (sp.id === 'end' ? '' : '<button class="tut-skip" data-t="skip">Skip tutorial</button>') + '<button class="prime" data-t="next">' + (last ? 'Got it' : 'Next') + '</button></div>';
    el.className = 'tut on ' + (h ? h.pos : sp.id === 'end' ? 'mid' : 'top');   // the plot card sits above the ship it describes
    U.panels.refresh(true);
    place(); setTimeout(place, 80);
  }
  // keep the card clear of the top bar and threat strip, and of the contact card it points at
  function place() {
    var el = $('tut'); if (!el.classList.contains('top')) { el.style.top = ''; return; }
    var tb = $('topbar'), th = $('threats'), y = tb.offsetHeight + 8;
    if (th && th.innerHTML) y += th.offsetHeight + 6;
    el.style.top = y + 'px';
    var cd = $('card'), b = $('battle');
    if (!b.classList.contains('tut-hi-card') || !cd || !cd.offsetHeight) return;
    var r = el.getBoundingClientRect(), c = cd.getBoundingClientRect(), o = el.offsetParent.getBoundingClientRect();
    if (!(r.bottom > c.top && r.top < c.bottom && r.right > c.left && r.left < c.right)) return;
    var below = c.bottom - o.top + 8;
    if (below + r.height <= o.height - 8) { el.style.top = below + 'px'; return; }
    // no room below (phones): drop the contact card to the bottom of the plot and sit just above it
    b.classList.add('tut-low'); c = cd.getBoundingClientRect();
    el.style.top = Math.max(8, c.top - o.top - r.height - 8) + 'px';
  }
  function hiOff() { var b = $('battle'); b.classList.remove('tut-low'); Object.keys(HI).forEach(function (k) { b.classList.remove('tut-hi-' + k); }); }
  function clear() { var b = $('battle'), el = $('tut'); if (b) { hiOff(); b.classList.remove('tut-on'); } if (el) { el.className = 'tut'; el.innerHTML = ''; } }

  function done(skip) {
    var st = U.st(), cur = tu.cur; tu.cur = null;
    var then = cur && cur.then;
    if (skip) { tu.on = false; tu.queue.forEach(function (q) { then = then || q.then; }); tu.queue.length = 0; }
    if (tu.queue.length) { next(false); return; }
    clear();
    if (then) { then(); return; }
    if (st && !st.over && tu.wasRunning) U.resume();
    U.panels.refresh(true);
  }
  T.click = function (k) { if (!tu || !tu.cur) return; done(k === 'skip'); };

  // engine events, before the UI's own handling
  T.ev = function (e) {
    if (!T.active()) return;
    var st = U.st(); if (!st) return;
    if (e.type === 'contact' && e.side === st.P && e.kind === 'ship') fire('contact');
    else if (e.type === 'impact' && (e.side === st.P || e.side === st.O)) fire('damage');
  };
  // once a tick while the battle runs: the checks that are not single events
  T.tick = function () {
    if (!T.active()) return;
    var st = U.st(), w = st.w, v = st.view; if (!v || st.over) return;
    var own = v.own.filter(U.E.active), near = Infinity;
    v.contacts.forEach(function (c) {
      if (c.kind !== 'ship' || c.disabled) return;
      fire('contact');   // the contact event can come before the view has it; this is the fallback
      var age = Math.max(0, c.age != null ? c.age : w.t - (c.tObs || 0));
      if (U.isLost(c, age)) fire('lost');
      if (c.firm) own.forEach(function (s) { near = Math.min(near, Math.hypot(c.ex - s.x, c.ey - s.y)); });
    });
    var shot = w.slugs.some(function (p) { return p.side === st.P && p.kind !== 'frag' && p.kind !== 'pen'; });
    if (near < 45000 || shot) fire('guns');
    var thr = own.some(function (s) { return st.thr[s.id] && st.thr[s.id].length; });
    if (thr || near < 30000) { fire('guns'); fire('threats'); }
  };
  // the battle is over: show the last card, then the end screen
  T.atEnd = function (then) { return T.active() && fire('end', then); };

  document.addEventListener('DOMContentLoaded', function () {
    var el = $('tut'); if (!el) return;
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) { T.click(b.getAttribute('data-t')); U.sfx && U.sfx('click'); } });
    window.addEventListener('resize', function () { if (tu && tu.cur) place(); });
  });
})();
