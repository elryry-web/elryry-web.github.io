/* Felt & Fold UI: game modes. Cash tables (bankroll, stakes ladder), tournaments (Sit & Go, Double Table), custom tables. */
(function () {
  'use strict';
  const FF = window.FF, UI = FF.UI, E = FF.Engine, T = FF.Tournament, S = FF.Strategy, AI = FF.AI;
  const HERO = { id: 'hero', name: 'You', initials: 'YOU', color: '#d9b44a' };
  const START_BANK = 50000; // cents
  const uid = () => Math.floor(Math.random() * 1e9);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let game = null; // the running session

  // the phone table menu: Sit out / Top up, units, History, Stats, Coach, Settings, and the info the slim strip leaves out
  // ("Hands 37"). Each item clicks the desktop button it stands for, so it behaves exactly the same.
  // A tap outside or Escape closes it; while it is open no keyboard shortcut reaches the table.
  let menuCtl = [];
  function openTableMenu() {
    if (UI.$('.tmenu-back')) return;
    const more = UI.$('#tb-more'), back = UI.el('<div class="tmenu-back"><div class="tmenu" role="menu" aria-label="Table menu"></div></div>'), box = UI.$('.tmenu', back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); more.setAttribute('aria-expanded', 'false'); more.focus(); };
    const onKey = ev => { ev.stopImmediatePropagation(); if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
    const item = (label, fn, cls) => { const b = UI.el('<button class="btn tmi' + (cls ? ' ' + cls : '') + '" role="menuitem"></button>'); b.textContent = label; b.onclick = () => { close(); fn(); }; box.appendChild(b); };
    menuCtl.forEach(b => item(b.label, b.onClick));
    const u = UI.$('#tb-units').textContent, other = u === 'bb' ? (UI.Game.current() && UI.Game.current().mode !== 'cash' ? 'chips' : '$') : 'bb';
    item('Amounts: ' + u + ' (switch to ' + other + ')', () => UI.$('#tb-units').click(), 'units');
    item('History', () => UI.$('#tb-hist').click());
    item('Stats', () => UI.$('#tb-stats').click());
    item('Coach', () => UI.$('#tb-coach').click());
    if (UI.LiveCoach) item('Live coach: ' + (UI.LiveCoach.state.on ? 'on' : 'off'), () => UI.LiveCoach.setOn(!UI.LiveCoach.state.on), 'lcoach');
    item('Settings', () => UI.$('#tb-set').click());
    const extra = [...UI.$$('#tinfo span')].slice(1).map(s => s.textContent).filter(Boolean);
    if (extra.length) box.appendChild(UI.el('<div class="tmenu-info">' + extra.map(UI.esc).join(' · ') + '</div>'));
    back.onclick = ev => { if (ev.target === back) close(); };
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    more.setAttribute('aria-expanded', 'true');
    const first = UI.$('.tmi', box); if (first) first.focus();
  }

  UI.Game = {
    current: () => game,
    setInfo(html) { UI.$('#tinfo').innerHTML = html; },
    setControls(btns) {
      const box = UI.$('#tctl'); box.innerHTML = '';
      (btns || []).forEach(b => { const el = UI.el('<button class="btn sm">' + UI.esc(b.label) + '</button>'); el.onclick = b.onClick; if (b.disabled) el.disabled = true; box.appendChild(el); });
      // phone: these sit in the top bar's "☰" menu with the other table buttons, so the bar is one slim strip
      menuCtl = (btns || []).filter(b => !b.disabled);
      UI.$('#tb-more').onclick = openTableMenu;
    },
    leave() {
      if (!game) { UI.show('title'); return; }
      game.leave = true;
      FF.UI.Table.heroGiveUp();
    }
  };

  function heroSeatOf(t) { return t.seats.findIndex(p => p && p.id === HERO.id); }
  function heroActed(h, seat) { return h.log.some(e => e.ev === 'act' && e.seat === seat); }
  function makeAgent(g, prof) { g.profiles[prof.id] = prof; g.agents[prof.id] = AI.create(prof); }
  function seatAI(g, t, seat, prof, stack) {
    makeAgent(g, prof);
    E.sit(t, seat, { id: prof.id, name: prof.name, initials: prof.initials, color: prof.color, tier: prof.tier, style: prof.style, stack: stack });
    if (t.seats[seat]) t.seats[seat].handsHere = 0; // hands played at this table; no one leaves by choice before 30
  }
  function ctxFor(g) {
    return {
      mode: g.mode, heroId: HERO.id, agents: g.agents, profiles: g.profiles, practice: !!g.practice, // profiles are hidden unless practice (the hero chose them)
      autoFold: () => g.leave,
      fastForward: h => { const s = h.order.find(x => h.players[x].id === HERO.id); return g.leave || s == null || h.players[s].folded; }
    };
  }
  // after any played hand: AI memory, HUD, then the review (waits on the panel unless the hand was clean and auto-skip is on)
  async function afterHand(g, h, label) {
    h.order.forEach(s => { const a = g.agents[h.players[s].id]; if (a) a.observe(h); });
    UI.hudObserve(h);
    const hs = h.order.find(s => h.players[s].id === HERO.id);
    g.hands++;
    // reads as of before this hand grade it; this hand then joins the book
    let reads = null;
    if (UI.Reads.ctx) {
      try { reads = UI.Reads.before(h); UI.Reads.observe(h); laterNotes(h); } catch (e) { console.error('reads failed', e); }
    }
    if (hs == null || !heroActed(h, hs) || g.leave) return;
    await UI.sleep(20);
    let entry;
    try { entry = UI.Review.add(h, hs, { label: label, reads: reads, profiles: g.practice ? g.profiles : null }); } catch (e) { console.error('review failed', e); return; }
    if (entry.rv.clean && !(entry.rv.xEdge > 0) && UI.settings.autoSkip) { setBarMsg('Hand ' + entry.n + ' was clean.'); return; }
    await UI.Review.open(entry, 'Next hand');
  }
  // once a newer read shows a different player, earlier decisions this session get one gentle note (never a grade)
  function laterNotes(h) {
    const pri = FF.Reads.prior(UI.Reads.ctx);
    h.order.forEach(s => {
      const p = h.players[s]; if (p.id === HERO.id) return;
      const now = FF.Reads.read(UI.Reads.book[p.id], pri, p.name);
      if (now.state !== 'read') return;
      UI.Review.entries.forEach(e => {
        if (e.saved || !e.rv) return;
        e.rv.decisions.forEach(d => {
          if (d.later || !d.exploit || d.exploit.id !== p.id || d.exploit.state === 'known' || e.h === h) return;
          const note = FF.Reads.laterNote(d.exploit.traits, now);
          if (note) d.later = note;
        });
      });
    });
  }
  function setBarMsg(m) { const t = UI.Table.current(); if (t) t.barMsg = m; const b = UI.$('#actionbar .bar-wait'); if (b) b.textContent = m; }
  function playSync(g, h) {
    let guard = 0;
    while (!h.done) {
      if (++guard > 400) throw new Error('runaway hand');
      const p = h.players[h.toAct], a = g.agents[p.id].actSync(h, h.toAct, E.legal(h));
      E.act(h, { type: a.type, to: a.to });
    }
    return h;
  }
  function endSession() {
    game = null;
    UI.Review.closeDrawer();
  }

  // ================================================================ CASH
  const Cash = UI.Cash = {};
  function bank() {
    const c = UI.load('cash', null) || { bank: START_BANK, seat: null };
    if (c.bank == null) c.bank = START_BANK;
    return c;
  }
  function saveBank(c) { UI.save('cash', c); }
  // a stack left at a table (tab closed mid-session) goes back to the bankroll on load
  Cash.restore = function () {
    const c = bank();
    if (c.seat && c.seat.stack > 0) { c.bank += c.seat.stack; UI.toast('Your ' + UI.money(c.seat.stack) + ' table stack is back in your bankroll.'); }
    c.seat = null; saveBank(c);
  };
  Cash.lobby = function () {
    const c = bank(), stakes = AI.CASH_STAKES;
    const rows = stakes.map(st => {
      const bb = Math.round(st.bb * 100), min = 40 * bb, max = 100 * bb, ok = c.bank >= min;
      return '<div class="stake' + (ok ? '' : ' locked') + '" data-id="' + st.id + '"><div class="sname">' + UI.esc(st.name) + '</div>' +
        '<div class="sblinds">' + UI.money(Math.round(st.sb * 100)) + ' / ' + UI.money(bb) + '</div>' +
        '<div class="sbuy">Buy-in ' + UI.money(min) + ' to ' + UI.money(max) + '</div>' +
        '<button class="btn sit"' + (ok ? '' : ' disabled') + '>Sit down</button></div>';
    }).join('');
    const broke = c.bank < 40 * Math.round(stakes[0].bb * 100);
    UI.$('#cash-body').innerHTML = '<div class="bankroll">Bankroll <b>' + UI.money(c.bank) + '</b>' +
      (broke ? ' <button class="btn sm" id="reload">Reload to ' + UI.money(START_BANK) + '</button>' : '') + '</div>' +
      '<div class="stakes">' + rows + '</div>';
    const rl = UI.$('#reload'); if (rl) rl.onclick = () => { const b = bank(); b.bank = START_BANK; saveBank(b); Cash.lobby(); };
    UI.$$('.stake .sit').forEach(btn => btn.onclick = () => Cash.chooseBuyIn(btn.closest('.stake').dataset.id));
  };
  Cash.chooseBuyIn = async function (stakeId) {
    const st = AI.CASH_STAKES.find(s => s.id === stakeId), bb = Math.round(st.bb * 100), c = bank();
    const max = Math.min(100 * bb, Math.floor(c.bank / bb) * bb);
    const body = '<p>' + UI.esc(st.name) + ', blinds ' + UI.money(Math.round(st.sb * 100)) + ' / ' + UI.money(bb) + '.</p>' +
      '<label class="buyin">Buy-in <input type="range" id="bi" min="40" max="' + Math.floor(max / bb) + '" step="1" value="' + Math.floor(max / bb) + '"> <b id="biv"></b></label>';
    const p = UI.modal('Buy in', body, [{ label: 'Sit down', value: 'go', cls: 'primary' }, { label: 'Cancel', value: null }]);
    const bi = UI.$('#bi'), biv = UI.$('#biv'), upd = () => { biv.textContent = UI.money(+bi.value * bb) + ' (' + bi.value + 'bb)'; };
    bi.oninput = upd; upd();
    let chosen = +bi.value; bi.addEventListener('input', () => { chosen = +bi.value; });
    if (await p !== 'go') return;
    Cash.start({ stake: st, buyIn: chosen * bb });
  };

  // opts: { stake, buyIn } for real cash; custom: { practice:true, sb, bb, lineup:[profile|null x5], depth }
  Cash.start = async function (opts) {
    const practice = !!opts.practice;
    const sb = practice ? opts.sb : Math.round(opts.stake.sb * 100), bb = practice ? opts.bb : Math.round(opts.stake.bb * 100);
    const c = bank();
    if (!practice) { c.bank -= opts.buyIn; c.seat = { stake: opts.stake.id, stack: opts.buyIn }; saveBank(c); }
    const t = E.createTable({ seats: 6, sb: sb, bb: bb, mode: 'cash', seed: uid(), id: 'C' + uid().toString(36) });
    const g = game = { mode: 'cash', t: t, agents: {}, profiles: {}, leave: false, hands: 0, practice: practice, stake: opts.stake, sitOut: false, depth: opts.depth || 100 };
    UI.Reads.start(practice ? null : { kind: 'cash', stake: opts.stake.id });
    E.sit(t, 0, Object.assign({}, HERO, { stack: practice ? opts.depth * bb : opts.buyIn }));
    if (practice) opts.lineup.forEach((prof, i) => { if (prof) seatAI(g, t, i + 1, prof, opts.depth * bb); });
    else {
      const field = AI.field({ kind: 'cash', stake: opts.stake.id, seats: 5, seed: uid() });
      field.forEach((prof, i) => seatAI(g, t, i + 1, prof, aiBuyIn(bb)));
    }
    S.setQuality('normal');
    UI.show('table');
    const label = practice ? 'Custom table' : opts.stake.name + ' ' + UI.money(sb) + '/' + UI.money(bb);
    const ctx = ctxFor(g);
    UI.Table.idle(t, ctx, 'Shuffling up');
    while (!g.leave) {
      if (!practice) turnover(g, t, bb); else practiceRebuys(g, t, bb);
      const hs = heroSeatOf(t), hero = t.seats[hs];
      if (hero.stack <= 0) {
        const ok = await heroRebuy(g, t, bb);
        if (!ok) break;
      }
      if (g.sitOut && hero.state !== 'sitout') E.sitOut(t, hs);
      if (!g.sitOut && hero.state === 'sitout') E.sitIn(t, hs, true);
      cashInfo(g, label);
      const h = E.startHand(t);
      if (!h) { UI.Table.idle(t, ctx, 'Waiting for players'); await UI.sleep(1200); continue; }
      await UI.Table.play(h, ctx);
      if (!practice) { const b = bank(); b.seat = { stake: opts.stake.id, stack: t.seats[heroSeatOf(t)].stack }; saveBank(b); }
      await afterHand(g, h, label + ', hand ' + h.handNo);
    }
    // leave: chips back to the bankroll
    const hs = heroSeatOf(t), stack = hs >= 0 ? t.seats[hs].stack : 0;
    if (!practice) { const b = bank(); b.bank += stack; b.seat = null; saveBank(b); }
    endSession();
    if (practice) UI.show('custom'); else { Cash.lobby(); UI.show('cash'); }
  };
  function aiBuyIn(bb) { return Math.round((Math.random() < 0.6 ? 100 : 40 + Math.floor(Math.random() * 61)) * bb); }
  // players come and go: busts, top-ups, the odd departure (not before 30 hands here, then 1 in 100), new faces in empty seats
  function turnover(g, t, bb) {
    let left = 0;
    t.seats.forEach((p, s) => {
      if (!p || p.id === HERO.id) return;
      p.handsHere = (p.handsHere || 0) + 1;
      if (p.stack <= 0) { if (Math.random() < 0.5) { E.stand(t, s); left++; } else p.stack = 100 * bb; return; }
      if (p.stack < 40 * bb && Math.random() < 0.3) p.stack = 100 * bb;
      if (p.handsHere >= 30 && Math.random() < 0.01) { E.stand(t, s); left++; UI.toast(p.name + ' left the table.', 1800); }
    });
    const empty = []; t.seats.forEach((p, s) => { if (!p) empty.push(s); });
    if (empty.length && (Math.random() < 0.7 || t.seats.filter(Boolean).length < 3)) {
      const prof = AI.field({ kind: 'cash', stake: g.stake.id, seats: 1, seed: uid(), avoid: t.seats.filter(Boolean) })[0];
      prof.id = 'ai' + uid();
      seatAI(g, t, pick(empty), prof, aiBuyIn(bb));
      UI.toast(prof.name + ' sat down.', 1800);
    }
  }
  function practiceRebuys(g, t, bb) { t.seats.forEach(p => { if (p && p.id !== HERO.id && p.stack <= 0) p.stack = g.depth * bb; }); }
  async function heroRebuy(g, t, bb) {
    const hs = heroSeatOf(t);
    if (g.practice) {
      const v = await UI.modal('Out of chips', '<p>Rebuy for ' + g.depth + 'bb in practice chips?</p>', [{ label: 'Rebuy', value: 1, cls: 'primary' }, { label: 'Leave', value: 0 }]);
      if (v) t.seats[hs].stack = g.depth * bb;
      return !!v;
    }
    const c = bank(), max = Math.min(100 * bb, Math.floor(c.bank / bb) * bb);
    if (max < 40 * bb) { await UI.modal('Out of chips', '<p>Your bankroll is too small to rebuy here.</p>', [{ label: 'Leave', value: 0 }]); return false; }
    const v = await UI.modal('Out of chips', '<p>Rebuy for ' + UI.money(max) + ' (' + Math.round(max / bb) + 'bb)?</p>', [{ label: 'Rebuy', value: 1, cls: 'primary' }, { label: 'Leave', value: 0 }]);
    if (!v) return false;
    c.bank -= max; t.seats[hs].stack = max; c.seat = { stake: g.stake.id, stack: max }; saveBank(c);
    return true;
  }
  function cashInfo(g, label) {
    const t = g.t, hs = heroSeatOf(t), hero = t.seats[hs], bb = t.bb;
    UI.Game.setInfo('<b>' + UI.esc(label) + '</b>' + (g.practice ? '<span>Practice chips</span>' : '<span>Bankroll ' + UI.money(bank().bank) + '</span>') + '<span>Hands ' + g.hands + '</span>');
    const btns = [{ label: g.sitOut ? 'Sit in' : 'Sit out', onClick: () => { g.sitOut = !g.sitOut; UI.toast(g.sitOut ? 'You will sit out from the next hand.' : 'You will be dealt in next hand.'); cashInfo(g, label); } }];
    if (!g.practice && hero && hero.stack < 100 * bb) btns.push({ label: 'Top up', onClick: () => topUp(g, label) });
    UI.Game.setControls(btns);
  }
  function topUp(g, label) {
    const t = g.t, hs = heroSeatOf(t), hero = t.seats[hs], bb = t.bb, c = bank();
    const add = Math.min(100 * bb - hero.stack, c.bank);
    if (add <= 0) { UI.toast('No room to top up.'); return; }
    // between hands the seat stack is live; during a hand it applies after the hand
    const apply = () => { hero.stack += add; const b = bank(); b.bank -= add; b.seat = { stake: g.stake.id, stack: hero.stack }; saveBank(b); UI.toast('Topped up ' + UI.money(add) + '.'); cashInfo(g, label); };
    const cur = UI.Table.current();
    if (cur && cur.h && !cur.h.done) { const h = cur.h; const iv = setInterval(() => { if (h.done) { clearInterval(iv); apply(); } }, 300); UI.toast('Top-up comes in after this hand.'); }
    else apply();
  }

  // ================================================================ TOURNAMENTS
  const Tour = UI.Tourney = {};
  const BUYINS = [10, 50, 200, 1000];
  Tour.record = () => UI.load('tourney', { played: 0, cashes: 0, wins: 0, spent: 0, won: 0, best: 0 });
  Tour.lobby = function () {
    const r = Tour.record(), sel = UI.load('tourneyPick', { kind: 'sng', speed: 'turbo', buyIn: 10 });
    const opt = (name, val, cur, text) => '<button class="btn opt' + (val === cur ? ' on' : '') + '" data-k="' + name + '" data-v="' + val + '">' + text + '</button>';
    UI.$('#tour-body').innerHTML =
      '<div class="pick"><h4>Format</h4>' + opt('kind', 'sng', sel.kind, 'Sit &amp; Go<small>6 players, top 2 paid</small>') + opt('kind', 'double', sel.kind, 'Double Table<small>12 players, top 3 paid</small>') + '</div>' +
      '<div class="pick"><h4>Speed</h4>' + ['regular', 'turbo', 'hyper'].map(s => opt('speed', s, sel.speed, s.charAt(0).toUpperCase() + s.slice(1) + '<small>' + T.SPEEDS[s].hands + ' hands a level</small>')).join('') + '</div>' +
      '<div class="pick"><h4>Buy-in</h4>' + BUYINS.map(b => opt('buyIn', b, sel.buyIn, '$' + b)).join('') + '</div>' +
      '<button class="btn primary big" id="tour-go">Register</button>' +
      '<div class="record">Played ' + r.played + ' · Cashed ' + r.cashes + ' · Won ' + r.wins + ' · Net ' + UI.dollars(r.won - r.spent) + '</div>';
    UI.$$('#tour-body .opt').forEach(b => b.onclick = () => { const s = UI.load('tourneyPick', sel); s[b.dataset.k] = b.dataset.k === 'buyIn' ? +b.dataset.v : b.dataset.v; UI.save('tourneyPick', s); Tour.lobby(); });
    UI.$('#tour-go').onclick = () => { const s = UI.load('tourneyPick', sel); Tour.start({ kind: s.kind, speed: s.speed, buyIn: s.buyIn }); };
  };

  // opts: { kind, speed, buyIn } or custom { practice:true, kind:'sng', speed, lineup:[5 profiles], depth }
  Tour.start = async function (opts) {
    const practice = !!opts.practice, n = opts.kind === 'double' ? 12 : 6;
    const field = practice ? opts.lineup.slice() : AI.field({ kind: 'tourney', buyIn: opts.buyIn, seats: n - 1, seed: uid() });
    const g = game = { mode: 'tourney', agents: {}, profiles: {}, leave: false, hands: 0, practice: practice };
    UI.Reads.start(practice ? null : { kind: 'tourney', buyIn: opts.buyIn });
    field.forEach(p => makeAgent(g, p));
    const t = g.tour = T.create({ kind: opts.kind, speed: opts.speed, seed: uid(), buyIn: practice ? 10 : opts.buyIn, anteType: 'each', heroId: HERO.id,
      entrants: [Object.assign({}, HERO)].concat(field.map(p => ({ id: p.id, name: p.name, initials: p.initials, color: p.color, tier: p.tier, style: p.style }))) });
    if (practice) { const bb1 = T.level(opts.speed, 0).bb; t.tables.forEach(tb => tb.seats.forEach(p => { if (p) p.stack = opts.depth * bb1; })); }
    t.tables.forEach(tb => { tb.id = tb.id + '-' + uid().toString(36); }); // unique hand ids for the solver provider
    if (!practice) { const r = Tour.record(); r.played++; r.spent += opts.buyIn; UI.save('tourney', r); }
    S.setQuality('normal');
    UI.show('table');
    UI.Game.setControls([]);
    const ctx = ctxFor(g), name = (opts.kind === 'double' ? 'Double Table' : 'Sit & Go') + ' ' + opts.speed + (practice ? ' (custom)' : ' $' + opts.buyIn);
    let heroPlace = 0;
    tourInfo(g, name);
    UI.Table.idle(T.heroTable(t), ctx, 'Shuffle up and deal');
    await UI.wait(600);
    while (!t.over && !g.leave) {
      const round = T.startRound(t), ht = T.heroTable(t);
      let heroHand = null;
      round.forEach(x => { x.hand.icm = S.tourneyCtx(t); if (x.table === ht) heroHand = x.hand; });
      // the other table plays at once, in fast mode
      const others = round.filter(x => x.hand !== heroHand);
      if (others.length) { S.setQuality('fast'); try { others.forEach(x => playSync(g, x.hand)); } finally { S.setQuality('normal'); } }
      tourInfo(g, name);
      if (heroHand) { await UI.Table.play(heroHand, ctx); }
      round.forEach(x => { if (x.hand !== heroHand) x.hand.order.forEach(s => { const a = g.agents[x.hand.players[s].id]; if (a) a.observe(x.hand); }); });
      const before = t.log.length;
      T.endRound(t);
      if (heroHand) await afterHand(g, heroHand, name + ', hand ' + t.handsPlayed);
      const fresh = t.log.slice(before), busts = fresh.filter(ev => ev.ev === 'bust').sort((a, b) => b.place - a.place);
      busts.concat(fresh.filter(ev => ev.ev !== 'bust')).forEach(ev => {
        if (ev.ev === 'level') { const L = T.info(t).level; UI.toast('Level ' + L.level + ': blinds ' + L.sb + '/' + L.bb + (L.ante ? ', ante ' + L.ante : '') + '.'); }
        if (ev.ev === 'merge') UI.toast('The tables merge. Final table.');
        if (ev.ev === 'move' && ev.id === HERO.id && !ev.final) UI.toast('You move to the other table.');
        if (ev.ev === 'bust' && ev.id === HERO.id) heroPlace = ev.place;
        else if (ev.ev === 'bust') { const p = t.players[ev.id]; if (p) UI.toast(p.name + ' is out in ' + ord(ev.place) + '.', 1800); }
      });
      tourInfo(g, name);
      if (heroPlace) break;
    }
    await finishTour(g, opts, name);
  };
  function ord(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }
  async function finishTour(g, opts, name) {
    const t = g.tour;
    // the hero is out (or left): sit them out by folding every hand, and play the rest quickly
    if (!t.over) {
      UI.Table.message('Playing out the rest of the tournament…');
      S.setQuality('fast');
      try {
        let guard = 0;
        while (!t.over && guard++ < 4000) {
          const round = T.startRound(t);
          round.forEach(x => {
            x.hand.icm = S.tourneyCtx(t);
            const h = x.hand; let gd = 0;
            while (!h.done) {
              if (++gd > 400) throw new Error('runaway hand');
              const p = h.players[h.toAct], L = E.legal(h);
              const a = p.id === HERO.id ? { type: L.canCheck ? 'check' : 'fold' } : g.agents[p.id].actSync(h, h.toAct, L);
              E.act(h, { type: a.type, to: a.to });
            }
          });
          T.endRound(t);
          if (guard % 5 === 0) await UI.sleep(0);
        }
      } finally { S.setQuality('normal'); }
    }
    const res = T.results(t), me = t.players[HERO.id];
    if (!g.practice) {
      const r = Tour.record();
      if (me.prize > 0) { r.cashes++; r.won += me.prize; }
      if (me.place === 1) r.wins++;
      if (!r.best || me.place < r.best) r.best = me.place;
      UI.save('tourney', r);
    }
    endSession();
    const rows = res.map(p => '<tr class="' + (p.id === HERO.id ? 'me' : '') + '"><td>' + ord(p.place) + '</td><td>' + UI.esc(p.id === HERO.id ? 'You' : p.name) + '</td><td>' + (p.prize ? UI.dollars(p.prize) : '') + '</td></tr>').join('');
    UI.$('#finish-body').innerHTML = (me.place === 1 ? UI.Art.icon('star', 'fin-star') : '') + '<h2>You finished ' + ord(me.place) + '</h2>' +
      '<p class="lead">' + UI.esc(name) + '. ' + (me.prize ? 'You won ' + UI.dollars(me.prize) + '.' : 'No prize this time.') + '</p>' +
      '<table class="results"><tr><th>Place</th><th>Player</th><th>Prize</th></tr>' + rows + '</table>' +
      '<div class="btnrow"><button class="btn primary" id="fin-again">Play again</button><button class="btn" id="fin-stats">Session stats</button><button class="btn" id="fin-menu">Menu</button></div>';
    UI.$('#fin-again').onclick = () => opts.practice ? Tour.start(opts) : Tour.start({ kind: opts.kind, speed: opts.speed, buyIn: opts.buyIn });
    UI.$('#fin-menu').onclick = () => UI.show('title');
    UI.$('#fin-stats').onclick = () => UI.Review.openStats();
    UI.show('finish');
  }
  function tourInfo(g, name) {
    const t = g.tour, i = T.info(t), L = i.level;
    UI.Game.setInfo('<b>' + UI.esc(name) + '</b><span>Level ' + L.level + ': ' + L.sb + '/' + L.bb + (L.ante ? ' ante ' + L.ante : '') + '</span>' +
      '<span class="nextlvl">' + UI.Art.icon('hourglass') + 'Next level in ' + i.handsToNext + ' hand' + (i.handsToNext > 1 ? 's' : '') + ' (' + i.next.sb + '/' + i.next.bb + ')</span>' +
      '<span>' + i.left + ' left</span><span>Pays ' + i.payouts.map(p => UI.dollars(Math.round(p * 100) / 100)).join(' / ') + '</span>');
  }

  // ================================================================ CUSTOM
  const Custom = UI.Custom = {};
  const TIERS = AI.TIER_NAMES, STYLES = AI.STYLE_NAMES;
  Custom.lobby = function () {
    const c = UI.load('custom', { seats: [['Regular', 'TAG'], ['Casual', 'Calling Station'], ['Shark', 'LAG'], ['Beginner', 'Maniac'], ['Regular', 'Nit']], depth: 100, structure: 'cash', speed: 'turbo' });
    // options are values or [value, label] pairs; the label is what shows
    const sel = (cls, opts, v) => '<select class="' + cls + '">' + opts.map(o => {
      const val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
      return '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + lab + '</option>';
    }).join('') + '</select>';
    const seats = c.seats.map((s, i) => '<div class="cseat" data-i="' + i + '"><span class="cs-n">Seat ' + (i + 2) + '</span>' +
      sel('c-tier', ['Empty'].concat(TIERS), s[0]) + sel('c-style', STYLES, s[1]) + '</div>').join('');
    UI.$('#custom-body').innerHTML = '<div class="cseat"><span class="cs-n">Seat 1</span><b>You</b></div>' + seats +
      '<div class="crow"><label>Stacks ' + sel('c-depth', ['20', '30', '40', '60', '100', '150', '200'], String(c.depth)) + ' bb</label>' +
      '<label>Structure ' + sel('c-struct', [['cash', 'Cash game'], ['tournament', 'Tournament']], c.structure) + '</label>' +
      '<label class="c-speedl">Speed ' + sel('c-speed', [['regular', 'Regular'], ['turbo', 'Turbo'], ['hyper', 'Hyper']], c.speed) + '</label></div>' +
      '<p class="muted small">Practice chips. In a tournament, empty seats get a Regular TAG.</p>' +
      '<button class="btn primary big" id="custom-go">Deal</button>';
    const read = () => {
      const o = { seats: UI.$$('#custom-body .cseat[data-i]').map(el => [UI.$('.c-tier', el).value, UI.$('.c-style', el).value]),
        depth: +UI.$('.c-depth').value, structure: UI.$('.c-struct').value, speed: UI.$('.c-speed').value };
      UI.save('custom', o); return o;
    };
    UI.$$('#custom-body select').forEach(s => s.onchange = () => { read(); Custom.lobby(); });
    UI.$('.c-speedl').style.display = c.structure === 'tournament' ? '' : 'none';
    UI.$('#custom-go').onclick = () => {
      const o = read(), tour = o.structure === 'tournament';
      const taken = AI.takenNames([]);
      const lineup = o.seats.map((s, i) => {
        if (s[0] === 'Empty' && !tour) return null;
        const p = AI.uniqueProfile({ seed: uid(), tier: s[0] === 'Empty' ? 'Regular' : s[0], style: s[0] === 'Empty' ? 'TAG' : s[1], id: 'cu' + i + '-' + uid() }, taken);
        return p;
      });
      if (!tour && !lineup.some(Boolean)) { UI.toast('Fill at least one seat.'); return; }
      if (tour) Tour.start({ practice: true, kind: 'sng', speed: o.speed, lineup: lineup, depth: o.depth });
      else Cash.start({ practice: true, sb: 50, bb: 100, lineup: lineup, depth: o.depth });
    };
  };
})();
