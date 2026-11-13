/* Writ & Ruin: the screen. Core: state, saving, the flow of turns, the age screen and its action bar.
 * Dialogs and the other screens are in ui-sheets.js, which adds to the same window.WR_UI.
 * Needs WR_DATA, WR_ENGINE, WR_AI, WR_ART, WR_MAP.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA, E = root.WR_ENGINE, AI = root.WR_AI, A = root.WR_ART, M = root.WR_MAP;
  var N = D.NUM, REG = D.REGION, IDS = D.REGION_IDS;
  var KEY = 'writ-and-ruin-save', LOGKEY = 'writ-and-ruin-log';

  var U = root.WR_UI = {
    c: null, screen: 'title', log: [], mode: null, selected: null, flash: null,
    busy: false, skip: false, reports: [], yourTurn: false, lastSearch: null
  };

  // ---------------------------------------------------------------- small helpers
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cap(t) { t = String(t); return t.charAt(0).toUpperCase() + t.slice(1); }
  function age() { return U.c && U.c.age; }
  function me(s) { return (s || age()).houses.player; }
  // a house in a sentence: "You" for the player
  function who(h, s) {
    if (!h) return 'No one';
    if (h === 'player') return 'You';
    var x = (s || age()).houses[h] || (U.c && U.c.houses[h]);
    return x ? cap(x.short) : cap(h);
  }
  function whoLow(h, s) { var w = who(h, s); return w === 'You' ? 'you' : (/^The /.test(w) ? 'the' + w.slice(3) : w); }
  function rn(r) { return r === 'camp' ? 'the Far Pass camp' : (REG[r] ? REG[r].name : r); }
  function cardName(id) { return D.CARDS[id] ? D.CARDS[id].name : id; }
  function listAnd(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function stamp(h, size) { return A.art('house/' + h, { size: size || 22 }); }

  // ---------------------------------------------------------------- tap registry: buttons carry data-k
  var REGS = { app: {}, sheet: {} }, cur = 'app', seq = 0;
  function K(fn) { var id = 'k' + (++seq); REGS[cur][id] = fn; return id; }
  // btn(label, fn, {cls, off: reason}) : a disabled button still answers a tap with its reason
  function btn(label, fn, o) {
    o = o || {};
    var f = o.off ? function () { toast(plain(o.off)); } : fn;
    return '<button type="button" class="btn' + (o.cls ? ' ' + o.cls : '') + (o.off ? ' off' : '') + '" data-k="' + K(f) + '"' +
      (o.off ? ' aria-disabled="true"' : '') + (o.title ? ' aria-label="' + esc(o.title) + '"' : '') + '>' + label + '</button>';
  }

  // ---------------------------------------------------------------- the engine's refusals in plain words
  var PLAIN = {
    'no hours': 'You have no moons left this turn.',
    'not enough silver': 'You need more silver.',
    'retinue full': 'Your retinue is full: three is the most.',
    'return first': 'You hold no region: return first.',
    'once per turn': 'You have already treated this turn.',
    'newly returned: safe until their turn': 'That house has just returned there. It is safe until its next turn.',
    'empty: march instead': 'No one defends it: march in instead.',
    'the truce': 'No assaults in the first round.',
    'the truce: held': 'No one may take a held region in the first round.',
    'the Long Peace': 'The Long Peace: no assaults in the second round either.',
    'the Long Peace: held': 'The Long Peace: no one may take a held region in the second round either.',
    'already yours': 'You already hold it.',
    'not neighbours': 'Those regions are not neighbours.',
    'cannot march there': 'You cannot march there: it is held or guarded. Assault it instead.',
    'no silver for the toll': 'Tolls: you need 1 silver to march into a region you do not hold.',
    'not at the Far Pass': 'You must hold the Far Pass to depart.',
    'already agreed': 'You already have that pact with them.',
    'a region is free: return there': 'A region is free: return there rather than to the camp.',
    'the world deck is empty': 'The world deck is empty: there is nothing left to find.',
    'no warbands there': 'You need warbands there.',
    'not your region': 'You do not hold that region.',
    'not your turn': 'It is not your turn.',
    'not enough warbands': 'You do not have that many warbands there.',
    'the Waystone is ruined': 'The Waystone is ruined: no one can depart.',
    'not landless': 'You still hold land.',
    'not a free region': 'Warbands stand there: you cannot return there.',
    'no empty slot': 'The site has no empty slot.',
    'relics go to the retinue': 'A relic stays with you, not at a site.',
    'waiting on offer': 'Waiting for an answer to a pact offer.',
    'waiting on search': 'Finish your search first.',
    'the age is over': 'The age is over.',
    'no Poisoner': 'You have no Poisoner to use.',
    'no Bell Seer': 'You have no Bell Seer to use.',
    'bad count': 'You cannot muster that many.'
  };
  function plain(m) {
    if (!m) return '';
    if (PLAIN[m]) return PLAIN[m];
    var x;
    if ((x = /^need (\d+) warbands$/.exec(m))) return 'You need ' + x[1] + ' warbands at the Far Pass to depart.';
    if ((x = /^need (\d+) relics$/.exec(m))) return 'You need ' + plural(+x[1], 'relic') + ' to depart.';
    if ((x = /^hold the Far Pass with (\d+) warbands/.exec(m))) return 'You must have held the Far Pass with ' + x[1] + ' warbands since the start of your turn.';
    if (/^the Waystone opens/.test(m)) return cap(m) + '.';
    return /[.!?]$/.test(m) ? cap(m) : cap(m) + '.';
  }

  // ---------------------------------------------------------------- toast
  var toastTimer = null;
  function toast(text, ms) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text; t.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, ms || 2800);
  }

  // ---------------------------------------------------------------- saving
  function save() {
    try {
      localStorage.setItem(KEY, E.save(U.c));
      localStorage.setItem(LOGKEY, JSON.stringify(U.log.slice(0, 80)));
    } catch (e) { /* storage full or blocked: play on */ }
  }
  function loadSave() {
    try {
      var t = localStorage.getItem(KEY);
      if (!t) return null;
      var c = E.load(t);
      try { U.log = JSON.parse(localStorage.getItem(LOGKEY) || '[]') || []; } catch (e) { U.log = []; }
      return c;
    } catch (e) { return null; }
  }
  function hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }

  // ---------------------------------------------------------------- the log
  function logLine(text, h, cls) {
    var s = age();
    U.log.unshift({ t: text, h: h || null, r: s ? s.round : 0, a: s ? s.ageNo : 0, c: cls || '' });
    if (U.log.length > 120) U.log.length = 120;
  }
  var PACT_NAME = { truce: 'a truce', tribute: 'tribute', foe: 'common cause' };
  function pactWords(o, s) {
    if (o.type === 'truce') return 'a truce';
    if (o.type === 'tribute') return 'tribute: ' + whoLow(o.payer, s) + ' to pay ' + whoLow(o.payee || (o.payer === o.from ? o.to : o.from), s) + ' 1 silver a round';
    if (o.type === 'foe') return 'common cause against ' + whoLow(o.foe, s);
    return o.type;
  }
  // one event as a line of the log, or null
  function describe(ev, s) {
    var h = ev.house, W = who(h, s);
    switch (ev.type) {
      case 'prophecyChosen': return h === 'player' ? 'You chose your prophecy.' : W + ' chose a prophecy in secret.';
      case 'roundStart': return '— The ' + (D.ORDINALS[ev.round - 1] || ev.round).toLowerCase() + ' round —';
      case 'turnStart': return h === 'player' ? 'Your turn.' : W + "'s turn.";
      case 'income': return W + ' gained ' + ev.silver + ' silver.';
      case 'tribute': return W + ' paid ' + whoLow(ev.to, s) + ' ' + ev.silver + ' silver in tribute.';
      case 'ledgerThief': return W + ' took 1 silver from ' + whoLow(ev.from, s) + ' (Ledger Thief).';
      case 'crownsDue': return W + ' paid 1 silver to ' + whoLow(ev.to, s) + ' (Crowns Due).';
      case 'landless': return W + (h === 'player' ? ' hold' : ' holds') + ' no region and must return.';
      case 'return': return W + ' returned with ' + ev.count + ' warbands to ' + rn(ev.camp ? 'camp' : ev.region) + '.';
      case 'march': return W + ' marched ' + ev.count + ' from ' + rn(ev.from) + ' to ' + rn(ev.to) + (ev.via ? ' by way of ' + rn(ev.via) : '') +
        (ev.took ? ' and took it' + (ev.took === 'free folk' ? '' : ' from ' + whoLow(ev.took, s)) : '') + '.';
      case 'muster': return W + ' mustered ' + ev.count + ' in ' + rn(ev.region) + (ev.silver ? ' for ' + ev.silver + ' silver' : '') + '.';
      case 'battle': {
        var d = ev.defender ? whoLow(ev.defender, s) : 'the free folk';
        return W + ' assaulted ' + rn(ev.to) + ' (' + d + '): ' + ev.attTotal + ' against ' + ev.defTotal + '. ' +
          (ev.winner === 'attacker' ? W + ' took it.' : 'The assault failed.');
      }
      case 'assaultCollapsed': return W + "'s assault on " + rn(ev.to) + ' came to nothing.';
      case 'pactBroken': return W + ' broke ' + (PACT_NAME[ev.pact.type] || 'a pact') + ' with ' + whoLow(ev.wronged, s) + '.';
      case 'judge': return who(ev.house, s) + "'s Hanging Judge cost " + whoLow(ev.breaker, s) + ' ' + ev.lost.length + ' warbands.';
      case 'oath': return 'The Broken Word cost ' + whoLow(h, s) + ' ' + ev.lost.length + ' warbands.';
      case 'recruit': return W + ' recruited ' + cardName(ev.card) + ' at ' + rn(ev.region) + '.';
      case 'search': return W + ' searched ' + rn(ev.region) + ' and drew ' + plural(ev.drew, 'card') + '.' +
        (ev.barrowRelics && ev.barrowRelics.length ? ' The barrow gave up ' + listAnd(ev.barrowRelics.map(cardName)) + '.' : '');
      case 'keep':
        if (!ev.card) return h === 'player' ? 'You kept nothing more.' : null;
        return W + ' kept ' + (h === 'player' || D.CARDS[ev.card].relic || ev.to === 'site' ? cardName(ev.card) : 'a card') +
          (ev.to === 'site' ? ' at ' + rn(ev.region) : '') + '.';
      case 'pactOffered': return W + ' offered ' + whoLow(ev.target, s) + ' ' + pactWords(ev.offer, s) + '.';
      case 'pactAccepted': return W + ' accepted ' + pactWords(ev.pact.type === 'tribute' ? { type: 'tribute', payer: ev.pact.payer, payee: ev.pact.payee } : ev.pact, s) + ' with ' + whoLow(ev.from, s) + '.';
      case 'pactRefused': return W + ' refused ' + whoLow(ev.from, s) + "'s offer.";
      case 'pactExpired': return 'The ' + (ev.pact.type === 'tribute' ? 'tribute' : 'truce') + ' between ' + whoLow(ev.pact.a, s) + ' and ' + whoLow(ev.pact.b, s) + ' ran out.';
      case 'depart': return W + ' departed by the Far Pass.';
      case 'poison': return W + ' poisoned ' + cardName(ev.card) + '.';
      case 'seeProphecy': return h === 'player' ? 'The Bell Seer read ' + whoLow(ev.target, s) + "'s prophecy: “" + D.PROPHECIES[ev.prophecy - 1].text + '”' : W + ' read ' + whoLow(ev.target, s) + "'s prophecy.";
      case 'intent': return 'Plan: ' + planWords(ev.label, W) + '.';
      case 'intentRevised': return (ev.then ? 'New second move: ' : 'New plan: ') + planWords(ev.label, W) + '.';
      case 'intentChanged':
        if (ev.note === 'nearest') return W + ' could not keep to its plan and did the nearest thing.';
        if (ev.note === 'dropped') return W + ' dropped its plan (' + ev.label.replace(/^[^:]+: /, '') + ').';
        return W + ' changed its plan.';
      case 'campBroken': return W + "'s camp broke up: " + ev.count + ' warbands lost.';
      case 'ageDraw': return ev.ended ? (ev.of === 1 ? 'The last round is over: the age ends.' : 'The age-end draw came up: the age ends.') : 'The age-end draw came up blank: the age goes on.';
      case 'seize': return W + ' held six regions at the end of the turn.';
      case 'victory': return null;
    }
    return null;
  }
  // 'Varrow: assault Saltmarsh with 4' -> 'Varrow means to assault Saltmarsh with 4'
  function planWords(label, W) { return label.replace(/^[^:]+: /, W + ' means to ').replace(' means to returns at ', ' means to return at '); }
  // events into the log, map flashes and reports
  function take(ev) {
    var s = age();
    ev.forEach(function (e) {
      var t = describe(e, s);
      if (t) logLine(t, e.house || null, e.type === 'roundStart' ? 'round' : (e.type === 'battle' ? 'battle' : ''));
      if (e.type === 'march') U.flash = { from: e.from, to: e.to, house: e.house, region: e.to };
      else if (e.type === 'battle') {
        U.flash = { from: e.from, to: e.to, house: e.house, region: e.to };
        if (e.defender === 'player') U.reports.push(e);
      } else if (e.type === 'muster' || e.type === 'search' || e.type === 'recruit') U.flash = { region: e.region, house: e.house };
      else if (e.type === 'return') U.flash = { region: e.camp ? null : e.region, house: e.house };
      else if (e.type === 'turnStart') { U.flash = null; if (e.house === 'player') U.yourTurn = true; }
      if (e.type === 'search' && e.house === 'player') U.lastSearch = e;
      if ((e.type === 'pactAccepted' || e.type === 'pactRefused') && e.from === 'player') toast(describe(e, s));
    });
  }

  // ---------------------------------------------------------------- the flow
  function screenFor(c) {
    if (!c || !c.age) return 'title';
    if (c.age.phase !== 'over') return 'age';
    if (!c.reckoning) return 'end';
    if (c.reckoning.step !== 'done') return 'reckon';
    return 'annals';
  }
  function go(screen) {
    U.screen = screen; U.mode = null; U.selected = null;
    closeSheet();
    render();
    window.scrollTo(0, 0);
    if (screen === 'age') pump();
  }
  function newCampaign(name) {
    var seed = ((Date.now() % 4294967296) ^ Math.floor(Math.random() * 4294967296)) >>> 0;
    U.c = E.newCampaign(seed, name || 'Your house');
    U.log = []; U.reports = [];
    E.startAge(U.c);
    logLine(E.ageTitle(U.c.age.ageNo) + ' begins.', null, 'round');
    save();
    go('age');
  }
  function nextAge() {
    E.startAge(U.c);
    U.log = []; U.reports = [];
    logLine(E.ageTitle(U.c.age.ageNo) + ' begins.', null, 'round');
    save();
    go('age');
  }

  function pace(ev) {
    var t = 650;
    ev.forEach(function (e) {
      if (e.type === 'battle') t = Math.max(t, 1300);
      if (e.type === 'prophecyChosen' || e.type === 'pactRefused' || e.type === 'pactAccepted') t = Math.min(t, 250);
    });
    return t;
  }
  // AI houses act one step at a time until the player must act or the age ends
  function pump() {
    if (U.screen !== 'age' || U.busy) return;
    var s = age();
    if (!s) return;
    if (s.phase === 'over') { finishAge(); return; }
    var h = AI.whoActs(s);
    if (!h) return;
    if (s.houses[h].ai) { U.busy = true; U.mode = null; render(); setTimeout(step, U.skip ? 0 : 300); return; }
    playerUp();
  }
  function step() {
    var s = age();
    if (!s || U.screen !== 'age') { U.busy = false; return; }
    var h = s.phase === 'over' ? null : AI.whoActs(s);
    if (!h || !s.houses[h].ai) {
      U.busy = false; U.skip = false;
      if (s.phase === 'over') { finishAge(); return; }
      render(); pump(); return;
    }
    var ev, t0 = Date.now();
    try {
      ev = AI.act(s, h); take(ev);
      // when skipping, run rival moves back to back for a few milliseconds before yielding
      while (U.skip && Date.now() - t0 < 30 && s.phase !== 'over') {
        h = AI.whoActs(s);
        if (!h || !s.houses[h].ai) break;
        ev = AI.act(s, h); take(ev);
      }
    }
    catch (e) { U.busy = false; if (root.console) console.error(e); toast('A rival could not move: ' + e.message, 6000); render(); return; }
    save();
    if (!U.skip) render();
    setTimeout(step, U.skip ? 0 : pace(ev));
  }
  function skip() { if (U.busy) { U.skip = true; toast('Skipping ahead…', 1200); } }
  function finishAge() {
    U.busy = false; U.skip = false;
    save();
    go('end');
  }
  // the player must act: the right prompt for the moment
  function playerUp() {
    var s = age(), hs = me(s), P = s.pending;
    if (AI.ahead(s)) save();   // rivals show the moves they will make before your next turn
    if (U.reports.length) { U.showReports(function () { playerUp(); }); return; }
    if (s.phase === 'prophecy') { render(); U.prophecyDialog(); return; }
    if (P && P.type === 'offer' && P.to === 'player') { render(); U.offerDialog(); return; }
    if (P && P.type === 'search' && P.house === 'player') { render(); U.keepDialog(); return; }
    if (hs.flags.returnDue) U.mode = { kind: 'return' };
    render();
    if (U.yourTurn) {
      U.yourTurn = false;
      toast(hs.flags.returnDue ? 'Your turn. You hold no region: choose where to return.' :
        'Your turn: ' + plural(hs.hours, 'moon') + ', ' + hs.silver + ' silver.');
    }
  }
  // the player's action: check, apply, report
  function doAction(a, after) {
    var s = age();
    a.house = 'player';
    var m = E.check(s, a);
    if (m) { toast(plain(m)); return false; }
    var before = AI.snapshot(s);
    var ev = E.applyAction(s, a);
    ev = ev.concat(AI.replan(s, 'player', before));   // rivals whose plans you just upset declare new ones
    take(ev); save();
    closeSheet();
    U.mode = null; U.selected = null;
    var battle = ev.filter(function (e) { return e.type === 'battle'; })[0];
    render();
    if (battle) U.battleResult(battle, function () { pump(); });
    else if (after) after(ev);
    else pump();
    return true;
  }
  function isMyTurn(s) {
    s = s || age();
    return !U.busy && s.phase === 'play' && !s.pending && s.order[s.turn] === 'player';
  }

  // ---------------------------------------------------------------- sheets (bottom sheet on phones, dialog on desktop)
  var sheetBuilder = null, sheetOpts = null;
  function openSheet(builder, opts) {
    sheetBuilder = builder; sheetOpts = opts || {};
    var el = document.getElementById('sheet');
    cur = 'sheet'; REGS.sheet = {};
    var html = builder();
    cur = 'app';
    el.innerHTML = '<div class="sheet-back"' + (sheetOpts.modal ? '' : ' data-close="1"') + '></div>' +
      '<div class="sheet-card' + (sheetOpts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      (sheetOpts.modal ? '' : '<button type="button" class="sheet-x" data-close="1" aria-label="Close">×</button>') + html + '</div>';
    el.className = 'sheet open';
    document.body.classList.add('sheet-up');
  }
  function redrawSheet() {
    if (!sheetBuilder) return;
    var el = document.getElementById('sheet'), card = el.querySelector('.sheet-card'), top = card ? card.scrollTop : 0;
    openSheet(sheetBuilder, sheetOpts);
    card = el.querySelector('.sheet-card'); if (card) card.scrollTop = top;
  }
  function closeSheet() {
    var el = document.getElementById('sheet');
    if (!el) return;
    var was = sheetBuilder, onClose = sheetOpts && sheetOpts.onClose;
    sheetBuilder = null; sheetOpts = null;
    el.className = 'sheet'; el.innerHTML = '';
    REGS.sheet = {};
    document.body.classList.remove('sheet-up');
    if (was && onClose) onClose();
  }
  function sheetIsOpen() { return !!sheetBuilder; }

  // ---------------------------------------------------------------- what the map highlights
  function legalNow(s) { return isMyTurn(s) ? E.legalActions(s, 'player') : []; }
  function picks(s, legal) {
    var m = U.mode;
    if (!m) return [];
    if (m.kind === 'return') { var sp = E.returnSpots(s, 'player'); return sp.length ? sp : ['camp']; }
    var out = [];
    legal.forEach(function (a) {
      if (a.type !== m.kind) return;
      var r = a.type === 'assault' ? a.to : (a.from || a.region);
      if (r && out.indexOf(r) < 0) out.push(r);
    });
    return out;
  }
  function intents(s) {
    var out = [], owl = E.has(s, 'player', 'owl');
    if (s.phase !== 'play') return out;
    s.order.forEach(function (h) {
      var hs = s.houses[h];
      if (!hs.ai) return;
      if (hs.intent) out.push({ house: h, intent: hs.intent });
      if (hs.then) out.push({ house: h, intent: hs.then, second: 1 });
      if (owl && hs.intent2) out.push({ house: h, intent: hs.intent2, second: hs.then ? 2 : 1, owl: true });
    });
    return out;
  }

  // ---------------------------------------------------------------- the age screen
  var WIN_KIND = { seize: 'Seize', foretell: 'Foretell', depart: 'Depart', seat: 'Seat' };
  function bars(p) {
    return '<div class="bars">' + ['seize', 'foretell', 'depart', 'seat'].map(function (k) {
      var v = Math.round(Math.min(1, p[k]) * 100);
      return '<div class="bar b-' + k + '" title="' + WIN_KIND[k] + '"><i style="width:' + v + '%"></i><b>' + WIN_KIND[k].charAt(0) + '</b></div>';
    }).join('') + '</div>';
  }
  function chips(s) {
    var turnH = s.phase === 'play' ? s.order[s.turn] : null;
    return s.order.map(function (h) {
      var hs = s.houses[h], hours = turnH === h ? hs.hours : E.hoursFor(s, h);
      var claim = E.claimStanding(s, h);
      return '<button type="button" class="chip' + (turnH === h ? ' now' : '') + (h === 'player' ? ' mine' : '') + '" data-k="' +
        K(function () { U.houseSheet(h); }) + '" style="--house:' + A.houseCol(h) + '">' +
        '<span class="chip-top">' + stamp(h, 20) + '<span class="chip-name">' + esc(h === 'player' ? 'You' : cap(hs.short)) + '</span>' +
        (s.regions.crown.owner === h ? '<span class="crownmark" title="Holds the Crown hold">♛</span>' : '') + '</span>' +
        '<span class="chip-nums"><span>' + hs.silver + '<small>s</small></span><span>' + hours + '<small>m</small></span><span>' + E.nHeld(s, h) + '<small>r</small></span></span>' +
        bars(E.progress(s, h)) + (claim ? '<span class="claimtag">claim</span>' : '') + '</button>';
    }).join('');
  }
  function fortuneRow(s) {
    var left = E.fortuneLeft(s), n = s.fortune.length;
    var parts = [0, 1, 2, 3].map(function (v) { return '<span class="fc"><b>' + v + '</b>×' + (left[v] || 0) + '</span>'; }).join('');
    return '<div class="fortune"><span class="lbl">Fortune</span>' + parts + '<span class="muted">' + (n ? n + ' left' : 'reshuffles next') + '</span></div>';
  }
  function endRow(s) {
    if (s.phase !== 'play') return '';
    var ch = E.endChances(s), early = ch.filter(function (d) { return d.chance < 1; });
    var t;
    if (!early.length) t = 'The age ends after round ' + N.lastRound + '.';
    else t = early.map(function (d) { return 'after round ' + d.round + ': 1 in ' + Math.round(1 / d.chance); }).join('; ') +
      '; always after round ' + N.lastRound + '.';
    return '<div class="ends"><span class="lbl">Age ends</span> ' + cap(t) + '</div>';
  }
  function dangerPanel(s) {
    var rows = [];
    s.order.forEach(function (h) {
      var cs = E.claimStanding(s, h);
      if (!cs) return;
      var mine = h === 'player';
      var wait = cs.waiting.map(function (k) { return whoLow(k, s); });
      var how = cs.kind === 'seize' ? 'holds six regions' : 'has fulfilled ' + (mine ? 'your' : 'its') + ' prophecy';
      var text;
      if (s.round >= N.claimFrom) {
        text = (mine ? how.replace('holds', 'hold').replace('has', 'have') : how) + '. ' +
          (wait.length ? 'Wins at the start of ' + (mine ? 'your' : 'its') + ' next turn unless ' + listAnd(wait) + ' break' + (wait.length === 1 && wait[0] !== 'you' ? 's' : '') + ' it.' : 'Wins at the start of ' + (mine ? 'your' : 'its') + ' next turn.');
      } else {
        // too early to win: say what stands now and when it starts to count
        text = (cs.kind === 'seize' ? (mine ? 'hold ' : 'holds ') + D.NUMBER_WORDS[N.seizeRegions] + ' regions now.' : (mine ? 'meet your' : 'meets its') + ' prophecy now.') +
          ' ' + (mine ? 'You' : 'It') + ' can win from the ' + D.ROUND_WORDS[N.claimFrom - 1] + ' round if ' + (mine ? 'you still do.' : 'it still does.');
      }
      rows.push('<li class="claim' + (mine ? ' good' : '') + '">' + stamp(h, 18) + '<span><b>' + who(h, s) + '</b> ' + text + '</span></li>');
    });
    var dz = [];
    try { dz = AI.dangers(s, 'player'); } catch (e) { dz = []; }
    dz.sort(function (a, b) { return b.urgency - a.urgency; }).forEach(function (d) {
      if (d.urgency < 0.15) return;
      var kind = { seize: 'could seize the valley', foretell: 'is near its prophecy', depart: 'could depart by the Far Pass', seat: 'holds the Crown hold' }[d.kind] || d.kind;
      var where = d.regions && d.regions.length ? ' Stop it at ' + listAnd(d.regions.map(rn)) + '.' : '';
      rows.push('<li>' + stamp(d.house, 18) + '<span><b>' + who(d.house, s) + '</b> ' + kind + '.' + where +
        ' <span class="urg"><i style="width:' + Math.round(Math.min(1, d.urgency) * 100) + '%"></i></span></span></li>');
    });
    if (!rows.length) rows.push('<li class="muted">No house is close to winning yet.</li>');
    return '<section class="panel danger"><h3>Who is close to winning</h3><ul class="rows">' + rows.join('') + '</ul></section>';
  }
  // "Varrow: march 2 to Saltmarsh", or for a later move "Varrow, then: march 2 to Saltmarsh"
  function planLabel(s, x) {
    var l = E.intentLabel(s, x.house, x.intent);
    return x.second ? l.replace(/^([^:]+): /, '$1, then: ') : l;
  }
  function intentPanel(s) {
    var it = intents(s);
    if (!it.length) return '';
    return '<section class="panel"><h3>Rival plans</h3><ul class="rows">' + it.map(function (x) {
      return '<li>' + stamp(x.house, 18) + '<span>' + (x.intent.revised ? '<b class="newplan">New plan.</b> ' : '') + esc(planLabel(s, x)) + (x.owl ? ' <em>(seen by the Owl)</em>' : '') + '</span></li>';
    }).join('') + '</ul></section>';
  }
  function retinuePanel(s) {
    var hs = me(s);
    var cards = hs.retinue.map(function (id) { return A.card(id); }).join('');
    var rel = hs.relics.map(function (id) { return A.card(id); }).join('');
    var p = hs.prophecy ? E.prophecyProgress(s, 'player', hs.prophecy) : null;
    return '<section class="panel"><h3>Your house</h3>' +
      (hs.prophecy ? '<p class="prophecy"><span class="lbl">Prophecy</span> “' + esc(D.PROPHECIES[hs.prophecy - 1].text) + '” <b>' + p.have + '/' + p.need + '</b></p>' : '') +
      '<p class="lbl">Retinue ' + hs.retinue.length + '/' + N.retinueMax + '</p>' + (cards || '<p class="muted">No one yet. Recruit residents where your warbands stand.</p>') +
      (rel ? '<p class="lbl">Relics</p>' + rel : '') + '</section>';
  }
  function lawPanel(s) {
    if (!s.laws.length) return '';
    return '<section class="panel"><h3>Laws in force</h3><ul class="rows">' + s.laws.map(function (id) {
      return '<li><span><b>' + esc(D.LAW[id].name) + '.</b> ' + esc(D.LAW[id].text) + '</span></li>';
    }).join('') + '</ul></section>';
  }
  function logPanel() {
    var s = age();
    return '<section class="panel log"><h3>The tale of this age</h3><ol class="loglist">' + U.log.filter(function (l) { return !s || l.a === s.ageNo; }).slice(0, 60).map(function (l) {
      return '<li class="' + l.c + '">' + (l.h ? stamp(l.h, 16) : '') + '<span>' + esc(l.t) + '</span></li>';
    }).join('') + '</ol></section>';
  }
  function hint(s, legal) {
    var hs = me(s);
    if (s.phase === 'prophecy') return '<div class="hint">The houses are choosing their prophecies.</div>';
    if (U.busy) {
      var h = AI.whoActs(s), last = U.log[0];
      return '<div class="hint rival" data-k="' + K(skip) + '">' + (h ? stamp(h, 22) : '') + '<span><b>' + (h ? who(h, s) : 'The rivals') + ' ' + (s.pending && s.pending.type === 'offer' ? 'is weighing an offer' : 'is moving') + '.</b> ' +
        (last ? esc(last.t) : '') + '</span><span class="skip">' + (U.skip ? 'Skipping…' : 'Tap to skip') + '</span></div>';
    }
    if (s.pending) return '<div class="hint">' + (s.pending.type === 'offer' ? 'Waiting on an answer to a pact offer.' : 'Finish your search.') + '</div>';
    if (s.order[s.turn] !== 'player') return '';
    if (hs.flags.returnDue) {
      var spots = E.returnSpots(s, 'player');
      return '<div class="hint warn"><span><b>You hold no region.</b> ' + (spots.length ?
        'Return with ' + N.returnBands + ' warbands to a region where no warbands stand. The marked regions are free; the one you choose is safe until your next turn.' :
        'Every region has warbands in it, so you return to the camp beyond the Far Pass with ' + N.returnBands + ' warbands. The camp breaks up at the end of your turn, so march or assault into the Far Pass now.') + '</span></div>';
    }
    if (U.mode) {
      var words = { march: 'Choose a region to march from.', muster: 'Choose one of your regions to muster in.', assault: 'Choose a region to assault.',
        recruit: 'Choose a region with a resident to recruit.', search: 'Choose a region to search.' }[U.mode.kind] || '';
      return '<div class="hint pickhint"><span>' + words + '</span>' + btn('Cancel', function () { U.mode = null; render(); }, { cls: 'small' }) + '</div>';
    }
    return '<div class="hint mine"><span><b>Your turn.</b> ' + plural(hs.hours, 'moon') + ' left, ' + hs.silver + ' silver. Tap a region for its actions.' +
      (E.truce(s) ? ' ' + plain(E.truce(s)) : '') + '</span></div>';
  }

  var BAR = [['march', 'March'], ['muster', 'Muster'], ['assault', 'Assault'], ['recruit', 'Recruit'], ['search', 'Search'], ['treat', 'Treat'], ['depart', 'Depart']];
  // why a kind of action is not possible now
  function whyNot(s, kind) {
    var hs = me(s);
    if (hs.flags.returnDue) return 'return first';
    if (kind === 'treat') {
      if (hs.flags.treated) return 'once per turn';
      if (hs.hours < 1 && !E.has(s, 'player', 'whisperer')) return 'no hours';
      return 'You already have every pact you could offer.';
    }
    if (kind === 'depart') return E.check(s, { type: 'depart', house: 'player' }) || 'You cannot depart now.';
    if (kind === 'assault' && E.truce(s)) return E.truce(s);
    if (hs.hours < 1 && kind !== 'march') return 'no hours';
    if (kind === 'march') return hs.hours < 1 ? 'no hours' : 'None of your warbands can march anywhere.';
    if (kind === 'muster') return 'not enough silver';
    if (kind === 'assault') return hs.hours < 2 ? 'You need 2 moons to assault.' : 'None of your warbands stand next to a region you can assault.';
    if (kind === 'recruit') {
      if (hs.retinue.length >= N.retinueMax) return 'retinue full';
      return 'No resident you can afford stands where your warbands are.';
    }
    if (kind === 'search') return s.deck.length ? 'not enough silver' : 'the world deck is empty';
    return 'You cannot do that now.';
  }
  function actionBar(s, legal) {
    if (s.phase !== 'play') return '';
    if (U.busy) return '<div class="abar one">' + btn(U.skip ? 'Skipping…' : 'Skip to your turn ▸', skip, { cls: 'wide' }) + '</div>';
    if (s.pending || s.order[s.turn] !== 'player') return '';
    var hs = me(s);
    if (hs.flags.returnDue) {
      var ret = legal.filter(function (a) { return a.type === 'return'; });
      return '<div class="abar">' + ret.map(function (a) {
        return btn('Return to ' + (a.region === 'camp' ? 'the camp' : REG[a.region].name), function () { doAction({ type: 'return', region: a.region }); }, { cls: 'go' });
      }).join('') + '</div>';
    }
    var have = {};
    legal.forEach(function (a) { have[a.type] = (have[a.type] || 0) + 1; });
    var out = BAR.map(function (b) {
      var k = b[0], on = !!have[k];
      return btn(b[1], function () { pickKind(k); }, { off: on ? null : whyNot(s, k), cls: U.mode && U.mode.kind === k ? 'active' : '' });
    });
    if (have.poison) out.push(btn('Poison', function () { U.poisonSheet(); }));
    if (have.seeProphecy) out.push(btn('Bell Seer', function () { U.seerSheet(); }));
    out.push(btn('End turn', function () { U.endTurnConfirm(); }, { cls: 'end' }));
    return '<div class="abar">' + out.join('') + '</div>';
  }
  function pickKind(k) {
    var s = age();
    if (k === 'treat') return U.treatSheet();
    if (k === 'depart') return U.departConfirm();
    U.mode = { kind: k };
    var legal = legalNow(s), p = picks(s, legal);
    if (p.length === 1) { U.mode = { kind: k }; render(); U.regionSheet(p[0]); return; }
    render();
  }

  function renderAge() {
    var s = age(), legal = legalNow(s);
    var view = { selected: U.selected, picks: picks(s, legal), flash: U.flash, intents: intents(s) };
    var turnH = s.phase === 'play' ? s.order[s.turn] : null;
    return '<div class="age">' +
      '<header class="topbar"><div class="title"><h1>' + esc(E.ageTitle(s.ageNo)) + '</h1><span class="sub">' +
      (s.phase === 'prophecy' ? 'Choosing prophecies' : 'Round ' + s.round + ' of ' + N.lastRound + (turnH ? ' · ' + (turnH === 'player' ? 'your turn' : who(turnH, s) + "'s turn") : '')) + '</span></div>' +
      btn('☰', function () { U.menuSheet(); }, { cls: 'icon', title: 'Menu' }) + '</header>' +
      '<section class="strip" style="--n:' + s.order.length + '">' + chips(s) + '<p class="key">s silver · m moons · r regions · bars: <b>S</b>eize <b>F</b>oretell <b>D</b>epart <b>S</b>eat</p></section>' +
      '<section class="mapbox">' + hint(s, legal) + '<div class="mapframe">' + M.svg(s, view) + '</div>' +
      '<div class="status">' + fortuneRow(s) + endRow(s) + '</div></section>' +
      '<aside class="side">' + dangerPanel(s) + intentPanel(s) + retinuePanel(s) + lawPanel(s) + logPanel() + '</aside>' +
      '<nav class="actions">' + actionBar(s, legal) + '</nav></div>';
  }

  // ---------------------------------------------------------------- render
  function render() {
    var app = document.getElementById('app');
    if (!app) return;
    cur = 'app'; REGS.app = {};
    var html;
    try {
      if (U.screen === 'age' && age()) html = renderAge();
      else if (U.screen === 'end') html = U.renderEnd();
      else if (U.screen === 'reckon') html = U.renderReckoning();
      else if (U.screen === 'annals') html = U.renderAnnals();
      else html = U.renderTitle();
    } catch (e) {
      if (root.console) console.error(e);
      html = '<div class="screen"><p>Something went wrong drawing the screen: ' + esc(e.message) + '</p></div>';
    }
    app.innerHTML = html;
    app.className = 'app scr-' + U.screen;
    document.body.classList.toggle('busy', !!U.busy);
  }

  // ---------------------------------------------------------------- taps
  function onTap(ev) {
    var t = ev.target;
    var close = t.closest && t.closest('[data-close]');
    if (close) { closeSheet(); if (U.screen === 'age') render(); return; }
    var k = t.closest && t.closest('[data-k]');
    if (k) {
      var inSheet = !!k.closest('#sheet'), fn = (inSheet ? REGS.sheet : REGS.app)[k.getAttribute('data-k')];
      if (fn) { ev.preventDefault(); fn(ev); }
      return;
    }
    var reg = t.closest && t.closest('.map [data-region]');
    if (reg && U.screen === 'age') {
      var r = reg.getAttribute('data-region');
      U.selected = r === 'camp' ? null : r;
      U.regionSheet(r);
    }
  }
  function boot() {
    document.addEventListener('click', onTap);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetIsOpen() && !(sheetOpts && sheetOpts.modal)) { closeSheet(); render(); } });
    var c = loadSave();
    if (c) U.c = c;
    U.screen = 'title';
    render();
  }

  // exports for ui-sheets.js and for tests
  U.h = { esc: esc, cap: cap, age: age, me: me, who: who, whoLow: whoLow, rn: rn, cardName: cardName, listAnd: listAnd, plural: plural,
    stamp: stamp, btn: btn, K: K, plain: plain, toast: toast, save: save, hasSave: hasSave, logLine: logLine, describe: describe,
    pactWords: pactWords, screenFor: screenFor, isMyTurn: isMyTurn, legalNow: legalNow, bars: bars };
  U.go = go; U.render = render; U.pump = pump; U.skipAhead = skip; U.doAction = doAction; U.newCampaign = newCampaign; U.nextAge = nextAge;
  U.openSheet = openSheet; U.redrawSheet = redrawSheet; U.closeSheet = closeSheet; U.sheetIsOpen = sheetIsOpen; U.take = take;
  U.loadSave = loadSave; U.KEY = KEY;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})(typeof self !== 'undefined' ? self : this);
