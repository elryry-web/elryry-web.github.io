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
  }
  Table.render = render;

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
  function niceStep(bb) { return Math.max(1, Math.round(bb / 10)); }
  function presets(L, h) {
    const out = [], bb = h.bb;
    if (L.street === 'preflop') {
      const unopened = L.currentBet <= bb;
      [2.2, 2.5, 3].forEach(x => out.push({ label: x + 'x', to: unopened ? x * bb : x * L.currentBet }));
    } else {
      [[1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [1, 'Pot']].forEach(f => out.push({ label: f[1], to: L.currentBet + f[0] * (L.pot + L.toCall) }));
    }
    out.push({ label: 'All in', to: L.maxTo });
    return out.map(p => Object.assign(p, { to: Math.min(L.maxTo, Math.max(L.minTo, Math.round(p.to))) }));
  }
  function heroAction(L) {
    const h = cur.h, mode = (cur.c && cur.c.mode) || h.table.mode, bb = h.bb, a = x => UI.amt(x, bb, mode);
    UI.beep('turn');
    return new Promise(resolve => {
      const done = act => { heroWait = null; barRelabel = null; document.removeEventListener('keydown', onKey); hideBar(); resolve(act); };
      heroWait = done;
      let to = L.canRaise ? Math.min(L.maxTo, Math.max(L.minTo, L.street === 'preflop' && L.currentBet <= bb ? Math.round(2.5 * bb) : L.minTo)) : 0;
      const isBet = L.currentBet === 0;
      let html = '';
      if (L.canRaise) {
        html += '<div class="sizer"><div class="presets">' + presets(L, h).map((p, i) => '<button class="btn sm preset" data-i="' + i + '" data-to="' + p.to + '">' + p.label + '</button>').join('') + '</div>' +
          '<div class="slider-row"><input type="range" id="sz" min="' + L.minTo + '" max="' + L.maxTo + '" step="' + niceStep(bb) + '" value="' + to + '" aria-label="Bet size">' +
          '<span class="szval" id="szval"></span></div></div>';
      }
      html += '<div class="acts">';
      if (!L.canCheck) html += '<button class="btn act fold" data-a="fold">Fold</button>';
      html += L.canCheck ? '<button class="btn act check" data-a="check">Check</button>'
        : '<button class="btn act call" data-a="call">Call ' + a(L.call) + (L.call >= L.stack ? ' (all in)' : '') + '</button>';
      if (L.canRaise) html += '<button class="btn act raise" data-a="raise" id="raisebtn"></button>';
      html += '</div>';
      bar.innerHTML = html; bar.classList.add('live');
      const sz = UI.$('#sz', bar), szval = UI.$('#szval', bar), rb = UI.$('#raisebtn', bar);
      function upd() {
        if (!rb) return;
        const allin = to >= L.maxTo;
        rb.textContent = (allin ? 'All in ' : isBet ? 'Bet ' : 'Raise to ') + a(to);
        szval.textContent = a(to);
        UI.$$('.preset', bar).forEach(b => b.classList.toggle('on', +b.dataset.to === to));
      }
      // a units flip mid-decision relabels the call and raise buttons
      const cb = UI.$('.act.call', bar);
      barRelabel = () => { if (cb) cb.textContent = 'Call ' + a(L.call) + (L.call >= L.stack ? ' (all in)' : ''); upd(); };
      if (sz) sz.oninput = () => { to = Math.min(L.maxTo, Math.max(L.minTo, +sz.value)); if (+sz.value >= L.maxTo - niceStep(bb) / 2) to = L.maxTo; upd(); };
      UI.$$('.preset', bar).forEach(b => b.onclick = () => { to = +b.dataset.to; if (sz) sz.value = to; upd(); });
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
  Table.play = async function (h, c) {
    const hero = h.order.find(s => h.players[s].id === c.heroId);
    const heroSeat = hero != null ? hero : (c.watchSeat != null ? c.watchSeat : 0);
    cur = { t: h.table, h: h, c: c, heroSeat: heroSeat, shownBoard: 0, labels: {}, reveal: {}, chat: {}, thinking: -1, winName: {}, showName: {}, msg: '', final: false };
    render(); hideBar();
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
