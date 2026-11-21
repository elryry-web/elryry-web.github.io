/* Felt & Fold UI: the table view and the async hand driver.
 * UI.Table.play(h, ctx) plays one engine hand to the end with AI think delays, chat, board reveals and the hero action bar.
 * ctx: { mode:'cash'|'tourney', heroId, agents: {id: agent}, profiles: {id: profile}, autoFold(): bool, fastForward(h): bool }
 */
(function () {
  'use strict';
  const FF = window.FF, UI = FF.UI, E = FF.Engine;
  const HERO_COLOR = '#d9b44a';
  let cur = null, felt = null, bar = null, heroWait = null, barRelabel = null;
  UI.unitListeners.push(() => { if (barRelabel) barRelabel(); });

  const Table = UI.Table = {};
  Table.mount = function () {
    felt = UI.$('#felt'); bar = UI.$('#actionbar');
    LC.mount();
    // phone bets are placed from measured boxes, so a resize (rotation, toolbar) places them again
    window.addEventListener('resize', () => { if (phoneQ.matches || felt.querySelector('.bet[style], .dealer[style]')) render(); });
    // the read tag on a seat opens its details on tap; a second tap, or a tap elsewhere on the felt, closes them
    felt.addEventListener('click', ev => {
      const b = ev.target.closest ? ev.target.closest('.readtag') : null;
      const id = b ? b.dataset.id : null;
      if (!b && !openRead) return;
      openRead = id && openRead !== id ? id : null;
      UI.$$('#felt .seat').forEach(el => {
        const tg = el.querySelector('.readtag'), on = !!(tg && openRead && tg.dataset.id === openRead);
        el.classList.toggle('readopen', on); if (tg) tg.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    });
  };
  // the seat tag for an opponent with an established read ("calls a lot · 32 hands"), behind "Show player reads"
  let openRead = null;
  function readTagHtml(p) {
    const r = UI.Reads && UI.Reads.tag(p);
    if (!r) return '';
    const dt = FF.Reads.detailText(r.detail), word = r.tag.split(' · ')[0];
    return '<button type="button" class="readtag" data-id="' + UI.esc(p.id) + '" title="' + UI.esc(dt) + '" aria-expanded="' + (openRead === p.id) + '">' +
      UI.esc(word) + ' <span class="rn">· ' + r.hands + '<span class="rh"> hands</span></span></button>' +
      '<div class="readpop"><b>' + UI.esc(r.name) + ' ' + UI.esc(word) + '.</b> ' + UI.esc(dt) + '</div>';
  }
  Table.current = () => cur;

  // ---------------------------------------------------------------- render
  function slotOf(seat, heroSeat, n) { return ((seat - heroSeat) % n + n) % n; }
  function profileOf(c, p) { return (c && c.profiles && c.profiles[p.id]) || p; }

  function seatsView() {
    const t = cur.t, h = cur.h, out = [];
    for (let s = 0; s < t.nSeats; s++) {
      const sp = t.seats[s], hp = h && h.players[s];
      if (!sp && !hp) { out.push(null); continue; }
      out.push({ seat: s, sp: sp, hp: hp });
    }
    return out;
  }
  function labelText(e, bb, mode) {
    if (!e) return '';
    const a = x => UI.amt(x, bb, mode);
    if (e.allIn && e.type !== 'fold' && e.type !== 'check') return 'All in ' + a(e.to);
    return { fold: 'Fold', check: 'Check', call: 'Call ' + a(e.add), bet: 'Bet ' + a(e.to), raise: 'Raise to ' + a(e.to) }[e.type] || e.type;
  }

  function render() {
    if (!cur || !felt) return;
    const t = cur.t, h = cur.h, c = cur.c || {}, mode = c.mode || t.mode, bb = h ? h.bb : t.bb, hero = cur.heroSeat;
    let html = '';
    const sv = seatsView(), Art = UI.Art;
    // portraits: the AI ids seated now, so two at one table never share a face
    const pmap = t._portraits || (t._portraits = {});
    const seatedIds = sv.filter(v => v).map(v => (v.hp || v.sp).id).filter(id => id !== c.heroId);
    sv.forEach(v => {
      if (!v) return;
      const s = v.seat, slot = slotOf(s, hero, t.nSeats), p = v.hp || v.sp, prof = profileOf(c, v.sp || v.hp), isHero = p.id === c.heroId;
      const inHand = !!v.hp, folded = inHand && v.hp.folded;
      let stack = inHand ? v.hp.stack : v.sp.stack;
      if (inHand && h.done && !cur.final && h.result && h.result.won && h.result.won[s]) stack -= h.result.won[s];
      let cards = '';
      if (inHand && v.hp.hole) {
        const show = isHero || cur.reveal[s];
        if (!folded || isHero) cards = show ? UI.cardsHtml(v.hp.hole, 'sm') : UI.cardHtml(-1, 'sm') + UI.cardHtml(-1, 'sm');
      }
      const state = !inHand && v.sp ? (v.sp.state === 'sitout' ? 'Sitting out' : v.sp.state === 'waiting' || v.sp.state === 'post' ? 'Waiting' : '') : '';
      const won = cur.final && h && h.result && h.result.won && h.result.won[s];
      const cls = ['seat', 'slot-' + slot, isHero ? 'hero' : '', !isHero && openRead === p.id ? 'readopen' : '', folded ? 'folded' : '', cur.thinking === s ? 'acting' : '', h && !h.done && h.toAct === s && cur.thinking !== s ? 'to-act' : '',
        won ? 'winner' : '', !inHand ? 'idle' : ''].join(' ');
      // labels keep the action itself so a units flip redraws them
      const lb = cur.labels[s];
      let label = (lb && typeof lb === 'object' ? labelText(lb, bb, mode) : lb) || state;
      if (won) label = '+' + UI.amt(won, bb, mode) + (cur.winName[s] ? ' · ' + cur.winName[s] : '');
      else if (cur.final && cur.showName[s] && !folded) label = cur.showName[s];
      html += '<div class="' + cls + '" data-seat="' + s + '">' +
        '<div class="hole">' + cards + '</div>' +
        '<div class="plate"><div class="av" style="background:' + (isHero ? HERO_COLOR : prof.color || '#666') + '">' + UI.esc(isHero ? 'YOU' : prof.initials || '?') +
        (isHero ? '' : Art.portraitHtml(Art.portraitIx(pmap, p.id, p.name, seatedIds))) + '</div>' +
        '<div class="pinfo"><div class="pname"><span class="pn">' + UI.esc(isHero ? 'You' : p.name) + '</span>' + (inHand && h.pos[s] ? '<span class="pos">' + h.pos[s] + '</span>' : '') + '</div>' +
        '<div class="pstack">' + (stack > 0 || inHand ? UI.amt(stack, bb, mode) : 'Busted') + '</div></div>' + Art.stackHtml(stack, bb, mode) + '</div>' +
        (label ? '<div class="plabel">' + UI.esc(label) + '</div>' : '') +
        (!isHero && UI.settings.hud ? '<div class="hudline">' + UI.esc(UI.hudText(p.id)) + '</div>' : '') +
        (!isHero ? readTagHtml(p) : '') +
        (cur.chat[s] ? '<div class="bubble">' + UI.esc(cur.chat[s]) + '</div>' : '') + '</div>';
      if (inHand && v.hp.committed > 0 && !h.done) html += '<div class="bet slot-' + slot + '">' + Art.chipsHtml(v.hp.committed, bb) + UI.amt(v.hp.committed, bb, mode) + '</div>';
    });
    if (h) {
      const bslot = slotOf(h.button, hero, t.nSeats);
      html += '<div class="dealer slot-' + bslot + '" title="Button (dealer)">BTN</div>';
      let pot = E.pot(h);
      if (!h.done) h.order.forEach(s => { pot -= h.players[s].committed; });
      const total = E.pot(h);
      html += '<div class="center"><div class="pot">' + (total > 0 ? Art.pileHtml(total, bb) + 'Pot ' + UI.amt(total, bb, mode) + (!h.done && pot > 0 && total > pot ? ' <span class="tot">(' + UI.amt(pot, bb, mode) + ' in the middle)</span>' : '') : '') + '</div>' +
        '<div class="board">' + UI.cardsHtml(h.board.slice(0, cur.shownBoard)) + '</div>' +
        '<div class="msg">' + UI.esc(cur.msg || '') + '</div></div>';
    } else {
      html += '<div class="center"><div class="pot"></div><div class="board"></div><div class="msg">' + UI.esc(cur.msg || '') + '</div></div>';
    }
    felt.innerHTML = html;
    if (phoneQ.matches) tidyPhone();
  }
  Table.render = render;

  // phone: the dealer disc and each bet start at their CSS spot. One that touches a card, plate, label, tag, the pot
  // or an earlier bet moves to the nearest clear place on the felt, trying its line to the pot first.
  // This covers narrow felts, long amounts ("$112.75", "All in 67.4 bb") and enlarged system fonts.
  const phoneQ = window.matchMedia ? window.matchMedia('(max-width: 640px)') : { matches: false };
  function tidyPhone() {
    const fr = felt.getBoundingClientRect(), GAP = 2;
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
    const taken = [];
    felt.querySelectorAll('.seat .card, .seat .plate, .seat .plabel, .seat .hudline, .seat .readtag, .center .pot, .center .board .card, .center .msg').forEach(el => {
      const b = box(el); if (b.r - b.l >= 1 && b.b - b.t >= 1) taken.push(b);
    });
    const cb = box(felt.querySelector('.center')), cx = (cb.l + cb.r) / 2, cy = (cb.t + cb.b) / 2;
    // a side seat's button disc sits on its plate's top inner corner, just above the plate on the felt-centre side,
    // so it reads as that seat's and never reaches over toward the hero's cards. The hero's and the top seat's sit
    // just right of the plate, level with it
    let base = [0, 0], alts = [];
    const dl = felt.querySelector('.dealer'), ds = dl && (dl.className.match(/slot-(\d)\b/) || [])[1];
    const op = ds && felt.querySelector('.seat.slot-' + ds + ' .plate');
    if (op) {
      const p = box(op), d = box(dl), w = d.r - d.l, h = d.b - d.t, left = ds === '1' || ds === '2', side = ds !== '0' && ds !== '3';
      const x = !side ? p.r + 4 + w / 2 : left ? p.r - 6 - w / 2 : p.l + 6 + w / 2, y = side ? p.t - GAP - 1 - h / 2 : (p.t + p.b) / 2;
      base = [x - (d.l + d.r) / 2, y - (d.t + d.b) / 2];
      dl.style.translate = base[0].toFixed(1) + 'px ' + base[1].toFixed(1) + 'px';
      // when the corner is taken (a long message, a wide plate): level with the plate on its inner side, then below
      // the inner corner, before the general search
      if (side) {
        const xs = left ? p.r + 4 + w / 2 : p.l - 4 - w / 2, xc = left ? p.r - 6 - w / 2 : p.l + 6 + w / 2;
        alts = [[xs - x, (p.t + p.b) / 2 - y], [xc - x, p.b + GAP + 1 + h / 2 - y]];
      }
    }
    [dl].concat([...felt.querySelectorAll('.bet')]).filter(Boolean).forEach(el => {
      const b0 = box(el), bo = el === dl ? base : [0, 0];
      let dx = cx - (b0.l + b0.r) / 2, dy = cy - (b0.t + b0.b) / 2;
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const at = (ox, oy) => ({ l: b0.l + ox, r: b0.r + ox, t: b0.t + oy, b: b0.b + oy });
      const clear = (ox, oy) => {
        const b = at(ox, oy), g = { l: b.l - GAP, r: b.r + GAP, t: b.t - GAP, b: b.b + GAP };
        return b.l >= fr.left && b.r <= fr.right && b.t >= fr.top && b.b <= fr.bottom && !taken.some(f => hit(g, f));
      };
      // nearest clear place: along the line first, then across, up and down or diagonally
      const dirs = [[dx, dy], [-dx, -dy], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
      let off = [0, 0];
      const alt = el === dl && !clear(0, 0) && alts.find(a => clear(a[0], a[1]));
      if (alt) off = alt;
      else if (!clear(0, 0)) {
        search: for (let k = 2; k <= 120; k += 2) {
          for (const d of dirs) if (clear(d[0] * k, d[1] * k)) { off = [d[0] * k, d[1] * k]; break search; }
        }
      }
      if (off[0] || off[1]) el.style.translate = (bo[0] + off[0]).toFixed(1) + 'px ' + (bo[1] + off[1]).toFixed(1) + 'px';
      taken.push(at(off[0], off[1]));
    });
  }

  // show a table with no hand running (between hands, waiting for players)
  Table.idle = function (t, c, msg) {
    const hs = t.seats.findIndex(p => p && p.id === c.heroId);
    cur = { t: t, h: null, c: c, heroSeat: hs >= 0 ? hs : (cur && cur.t === t ? cur.heroSeat : 0), shownBoard: 0, labels: {}, reveal: {}, chat: {}, thinking: -1, winName: {}, showName: {}, msg: msg || '' };
    render(); hideBar();
  };
  Table.message = function (msg) { if (cur) { cur.msg = msg; render(); } };

  function showChat(seat, text) {
    cur.chat[seat] = text; render();
    const c0 = cur;
    setTimeout(() => { if (c0.chat[seat] === text) { delete c0.chat[seat]; if (cur === c0) render(); } }, 2800);
  }

  // ---------------------------------------------------------------- hero action bar
  function hideBar() { if (bar) { bar.innerHTML = '<div class="bar-wait">' + UI.esc(cur && cur.barMsg || '') + '</div>'; bar.classList.remove('live'); } }
  // sizes sit on a 0.1 bb grid (5 cents at $0.25/$0.50). The slider moves in 0.1 bb when amounts show in bb and in
  // small blinds ($0.25) when they show in dollars or chips, so dragging lands on round numbers
  function fineStep(h) { return Math.max(1, Math.round(h.bb / 10)); }
  function niceStep(h) { return UI.settings.units === 'bb' ? fineStep(h) : Math.max(1, h.sb || Math.round(h.bb / 2)); }
  // an amount on the step, inside the legal range; anything within half a step of the stack is all in, which stays exact
  function snapTo(x, L, step) {
    if (!(x >= L.maxTo - step / 2)) x = Math.round(x / step) * step; else x = L.maxTo;
    return Math.min(L.maxTo, Math.max(L.minTo, x));
  }
  function presets(L, h) {
    const out = [], bb = h.bb;
    if (L.street === 'preflop') {
      const unopened = L.currentBet <= bb;
      [2.2, 2.5, 3].forEach(x => out.push({ label: x + 'x', to: unopened ? x * bb : x * L.currentBet }));
    } else {
      [[1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [1, 'Pot']].forEach(f => out.push({ label: f[1], to: L.currentBet + f[0] * (L.pot + L.toCall) }));
    }
    out.push({ label: 'All in', to: L.maxTo });
    return out.map(p => Object.assign(p, { to: snapTo(p.to, L, fineStep(h)) }));
  }
  function heroAction(L) {
    const h = cur.h, mode = (cur.c && cur.c.mode) || h.table.mode, bb = h.bb, a = x => UI.amt(x, bb, mode);
    UI.beep('turn');
    return new Promise(resolve => {
      const done = act => { heroWait = null; barRelabel = null; document.removeEventListener('keydown', onKey); hideBar(); LC.end(); resolve(act); };
      LC.start(h, L.seat != null ? L.seat : cur.heroSeat, L);
      heroWait = done;
      let step = niceStep(h);
      let to = L.canRaise ? snapTo(L.street === 'preflop' && L.currentBet <= bb ? 2.5 * bb : L.minTo, L, fineStep(h)) : 0;
      const isBet = L.currentBet === 0;
      let html = '';
      if (L.canRaise) {
        html += '<div class="sizer"><div class="presets">' + presets(L, h).map((p, i) => '<button class="btn sm preset" data-i="' + i + '" data-to="' + p.to + '">' + p.label + '</button>').join('') + '</div>' +
          '<div class="slider-row"><input type="range" id="sz" value="' + to + '" aria-label="Bet size">' +
          '<label class="szval"><span class="szpre"></span><input type="text" id="szin" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="Bet size, type an amount">' +
          '<span class="szunit"></span></label></div></div>';
      }
      html += '<div class="acts">';
      if (!L.canCheck) html += '<button class="btn act fold" data-a="fold">Fold</button>';
      html += L.canCheck ? '<button class="btn act check" data-a="check">Check</button>'
        : '<button class="btn act call" data-a="call">Call ' + a(L.call) + (L.call >= L.stack ? ' (all in)' : '') + '</button>';
      if (L.canRaise) html += '<button class="btn act raise" data-a="raise" id="raisebtn"></button>';
      html += '</div>';
      bar.innerHTML = html; bar.classList.add('live');
      const sz = UI.$('#sz', bar), szin = UI.$('#szin', bar), rb = UI.$('#raisebtn', bar);
      // the typed field reads and writes the number in the chosen unit: bb, dollars (cash chips are cents) or chips
      const unit = () => UI.unitName(mode);
      const toField = x => unit() === 'bb' ? UI.trim(x / bb, 1) : unit() === '$' ? (x % 100 ? (x / 100).toFixed(2) : String(x / 100)) : String(Math.round(x));
      const fromField = v => { const n = parseFloat(String(v).replace(/[$\s]/g, '').replace(',', '.')); return isFinite(n) ? (unit() === 'bb' ? n * bb : unit() === '$' ? n * 100 : n) : NaN; };
      // the slider runs on the step grid and one step past the stack, so its top end is all in
      function setRange() {
        if (!sz) return;
        sz.min = Math.floor(L.minTo / step) * step; sz.max = Math.ceil(L.maxTo / step) * step; sz.step = step;
        if (szin) { UI.$('.szpre', bar).textContent = unit() === '$' ? '$' : ''; UI.$('.szunit', bar).textContent = unit() === '$' ? '' : unit(); }
      }
      function upd(typing) {
        if (!rb) return;
        const allin = to >= L.maxTo;
        rb.textContent = (allin ? 'All in ' : isBet ? 'Bet ' : 'Raise to ') + a(to);
        if (sz) sz.value = to;
        if (szin && !typing) szin.value = toField(to);
        UI.$$('.preset', bar).forEach(b => b.classList.toggle('on', +b.dataset.to === to));
      }
      // a units flip mid-decision relabels the call and raise buttons and gives the slider its new step
      const cb = UI.$('.act.call', bar);
      barRelabel = () => { if (cb) cb.textContent = 'Call ' + a(L.call) + (L.call >= L.stack ? ' (all in)' : ''); step = niceStep(h); setRange(); upd(); };
      if (sz) sz.oninput = () => { to = snapTo(+sz.value, L, step); upd(); };
      if (szin) {
        // typing moves the slider and the Raise label at once; blur or Enter shows the legal amount on the 0.1 bb grid
        szin.oninput = () => { const x = fromField(szin.value); if (x > 0) { to = snapTo(x, L, fineStep(h)); upd(true); } };
        const commit = () => { const x = fromField(szin.value); if (x > 0) to = snapTo(x, L, fineStep(h)); szin.value = toField(to); upd(); };
        szin.onblur = commit;
        szin.onfocus = () => szin.select();
        szin.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); szin.select(); } else if (ev.key === 'Escape') szin.blur(); };
      }
      setRange();
      UI.$$('.preset', bar).forEach(b => b.onclick = () => { to = +b.dataset.to; upd(); });
      UI.$$('.act', bar).forEach(b => b.onclick = () => {
        const k = b.dataset.a;
        if (k === 'raise') done(to >= L.maxTo ? { type: 'allin' } : { type: isBet ? 'bet' : 'raise', to: to });
        else done({ type: k });
      });
      function onKey(ev) {
        if (ev.target && /input|select|textarea/i.test(ev.target.tagName) && ev.target.type !== 'range') return;
        const k = ev.key.toLowerCase();
        if (k === 'f' && !L.canCheck) done({ type: 'fold' });
        else if (k === 'c' || k === 'k') done({ type: L.canCheck ? 'check' : 'call' });
        else if ((k === 'r' || k === 'b') && rb) rb.click();
      }
      document.addEventListener('keydown', onKey);
      upd();
    });
  }
  // fold or check for the hero now (leave pressed mid-hand)
  Table.heroGiveUp = function () {
    if (!heroWait || !cur || !cur.h) return;
    const L = E.legal(cur.h); heroWait({ type: L.canCheck ? 'check' : 'fold' });
  };

  // ---------------------------------------------------------------- hand driver
  async function revealBoard(h, toLen) {
    while (cur.shownBoard < toLen) {
      cur.shownBoard = cur.shownBoard < 3 ? 3 : cur.shownBoard + 1;
      for (const s in cur.labels) if (!(cur.labels[s] && (cur.labels[s].type === 'fold' || cur.labels[s].allIn))) delete cur.labels[s];
      UI.beep('deal'); render();
      if (cur.shownBoard < toLen) await UI.wait(1000);
    }
  }
  // ---------------------------------------------------------------- live coach (FF.LiveCoach): a short read of the open decision
  // Above the action bar. Collapsed it is one line; the state and the on/off switch live in ff.livecoach.
  const LC = UI.LiveCoach = (function () {
    const st = (function () { const v = UI.load('livecoach', null); return { on: !(v && v.on === false), open: !(v && v.open === false) }; })(); // open until the player folds it away
    let box = null, live = null; // live: { h, seat, n, L, data, hint, solving }
    const save = () => UI.save('livecoach', { on: st.on, open: st.open });
    function units(h) { const mode = (cur && cur.c && cur.c.mode) || h.table.mode; return UI.Review && UI.Review.unitsOf ? UI.Review.unitsOf({ bb: h.bb, mode: mode }) : { amt: x => x, text: t => t }; }
    function html(plain, tm, math, u) { return UI.Review && UI.Review.mathHtml ? UI.Review.mathHtml(plain, tm, math, u, []) : UI.esc(plain); }
    function draw() {
      if (!box) return;
      box.hidden = !st.on || !cur || !cur.h;
      if (box.hidden) return;
      const d = live && live.data, u = live ? units(live.h) : null;
      const sum = !live ? 'Waits for your turn.' : d ? html(d.summary, null, null, u) : 'Reading the spot…';
      let out = '<div class="lc-head"><button type="button" class="lc-tog" aria-expanded="' + st.open + '" title="Show or hide the live coach"><span class="lc-car">' + (st.open ? '▾' : '▸') + '</span> Coach</button>' +
        '<span class="lc-sum">' + sum + '</span>' +
        '<button type="button" class="btn sm lc-hint"' + (live && d ? '' : ' disabled') + '>' + (live && live.hint ? 'Hint used' : 'Hint') + '</button></div>';
      if (st.open) {
        out += '<div class="lc-body">';
        if (!live) out += '<p class="lc-idle">The coach reads each spot when it is your turn.</p>';
        else if (!d) out += '<p class="lc-idle">Reading the spot…</p>';
        else {
          d.lines.forEach(l => { out += '<p class="lc-' + l.k + '"><b>' + l.label + ':</b> ' + html(l.text, l.tm, d.math, u) + '</p>'; });
          if (live.hint) out += '<p class="lc-hinttxt"><b>Hint:</b> ' + html(live.hint.text, live.hint.tm, live.hint.math, u) + (live.solving ? ' <span class="lc-solving">Checking the solver…</span>' : '') + '</p>';
        }
        out += '</div>';
      }
      box.innerHTML = out;
      box.classList.toggle('open', st.open);
    }
    function compute() {
      const lv = live; if (!lv || lv.data) return;
      const h = lv.h, c = (cur && cur.c) || {};
      const opts = { reads: UI.settings.reads && UI.Reads.ctx ? UI.Reads.before(h) : null, readsOff: !UI.settings.reads && !!UI.Reads.ctx, profiles: c.practice ? c.profiles : null };
      try { lv.data = FF.LiveCoach.panel(h, lv.seat, opts); } catch (e) { console.error('live coach failed', e); lv.data = { lines: [], summary: 'The coach could not read this spot.', math: {} }; }
      if (live === lv) draw();
    }
    // a solved mix for the hint, when the solver covers this spot (the same provider the review upgrades with)
    function askSolver(lv) {
      const h = lv.h, L = lv.L, S = FF.Strategy, SP = FF.SolverProvider;
      if (h.street === 'preflop' || !S.hasSolver() || !SP) return;
      // the provider reads the hero's act entry at n: a stand-in check or call, on a copy of the hand
      const hc = Object.create(h), n = h.log.length;
      hc.log = h.log.concat([{ ev: 'act', n: n, seat: lv.seat, pos: h.pos[lv.seat], street: h.street, type: L.toCall > 0 ? 'call' : 'check', to: L.toCall > 0 ? L.committed + L.call : 0,
        add: L.toCall > 0 ? L.call : 0, potBefore: L.pot, toCall: L.toCall, stackBefore: L.stack, betBefore: L.currentBet, minTo: L.minTo, maxTo: L.canRaise ? L.maxTo : 0 }]);
      let p;
      try { SP.remember(hc); p = S.askSolver(hc, lv.seat, n); } catch (e) { p = null; } finally { SP.remember(h); }
      if (!p) return;
      lv.solving = true; draw();
      p.then(r => {
        lv.solving = false;
        if (r && r.mix && r.mix.length) {
          const mix = r.mix.slice().sort((a, b) => b.freq - a.freq);
          lv.hint = FF.LiveCoach.hintFrom(mix, r.source === 'Library' ? 'solved library' : 'solver', h, L);
        }
        if (live === lv) draw();
      }, () => { lv.solving = false; if (live === lv) draw(); });
    }
    function onHint() {
      const lv = live; if (!lv || !lv.data) return;
      if (!lv.hint) {
        FF.LiveCoach.markHint(lv.h);
        try { lv.hint = FF.LiveCoach.hint(lv.h, lv.seat); } catch (e) { console.error('hint failed', e); return; }
        askSolver(lv);
      }
      if (!st.open) { st.open = true; save(); }
      draw();
    }
    UI.unitListeners.push(() => draw());
    return {
      state: st,
      mount() {
        box = UI.$('#livecoach'); if (!box) return;
        box.addEventListener('click', ev => {
          const t = ev.target.closest ? ev.target : null;
          if (t && t.closest('.lc-hint')) { onHint(); return; }
          if (t && t.closest('.lc-tog, .lc-sum') && !t.closest('button.num, button.term')) { st.open = !st.open; save(); draw(); }
        });
      },
      start(h, seat, L) {
        live = { h: h, seat: seat, n: h.log.length, L: L, data: null, hint: null };
        draw();
        if (st.on) setTimeout(compute, 30); // after the action bar paints
      },
      end() { live = null; draw(); },
      setOn(on) { st.on = !!on; save(); if (st.on && live && !live.data) setTimeout(compute, 30); draw(); },
      draw: draw
    };
  })();

  Table.play = async function (h, c) {
    const hero = h.order.find(s => h.players[s].id === c.heroId);
    const heroSeat = hero != null ? hero : (c.watchSeat != null ? c.watchSeat : 0);
    cur = { t: h.table, h: h, c: c, heroSeat: heroSeat, shownBoard: 0, labels: {}, reveal: {}, chat: {}, thinking: -1, winName: {}, showName: {}, msg: '', final: false };
    render(); hideBar();
    LC.end();
    await UI.wait(300);
    let guard = 0;
    while (!h.done && h.toAct >= 0) {
      if (++guard > 400) throw new Error('runaway hand');
      const seat = h.toAct, L = E.legal(h), p = h.players[seat];
      let a;
      if (p.id === c.heroId) {
        a = c.autoFold && c.autoFold() ? { type: L.canCheck ? 'check' : 'fold' } : await heroAction(L);
      } else {
        const ag = c.agents[p.id];
        cur.thinking = seat; render();
        a = ag.actSync(h, seat, L);
        const ff = c.fastForward && c.fastForward(h);
        await UI.sleep(Math.min(a.thinkMs || 800, 4500) * UI.speed() * (ff ? 0.35 : 1));
        cur.thinking = -1;
        if (a.chat && UI.settings.chat) showChat(seat, a.chat);
      }
      const n0 = h.log.length;
      E.act(h, { type: a.type, to: a.to });
      const e = h.log.slice(n0).find(x => x.ev === 'act');
      if (e) cur.labels[seat] = e;
      if (e && e.type !== 'fold' && e.type !== 'check') UI.beep('chip');
      render();
      if (h.board.length > cur.shownBoard) {
        if (h.done && h.result && h.result.showdown) {
          // all in before the river: cards face up, then the run-out
          await UI.wait(600);
          Object.keys(h.result.shown || {}).forEach(s => { cur.reveal[s] = true; });
          render(); await UI.wait(900);
          await revealBoard(h, h.board.length);
          await UI.wait(600);
        } else {
          await UI.wait(450);
          await revealBoard(h, h.board.length);
          await UI.wait(250);
        }
      }
    }
    // the result
    const r = h.result || {};
    Object.keys(r.shown || {}).forEach(s => { cur.reveal[s] = true; });
    h.log.forEach(ev => { if (ev.ev === 'win' && ev.name) cur.winName[ev.seat] = ev.name; if (ev.ev === 'show') cur.showName[ev.seat] = ev.name; });
    cur.final = true; cur.labels = {};
    if (r.won && r.won[heroSeat] > 0 && hero != null) UI.beep('win');
    render();
    await UI.sleep(Math.max(500, (r.showdown ? 2600 : 1300) * UI.speed()));
    return h;
  };
})();
