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
  // a house's: "Your" / "your" for the player, never "You's"
  function whose(h, s) { return h === 'player' ? 'Your' : who(h, s) + "'s"; }
  function whoseLow(h, s) { return h === 'player' ? 'your' : whoLow(h, s) + "'s"; }
  function rn(r) { return r === 'camp' ? 'the Far Pass camp' : REG[r] ? (r === 'crown' || r === 'farpass' ? 'the ' : '') + REG[r].name : r; }
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
    'not landless': 'You still hold land.',
    'not a free region': 'Warbands stand there: you cannot return there.',
    'no empty slot': 'The site has no empty slot.',
    'relics go to the retinue': 'A relic stays with you, not at a site.',
    'waiting on offer': 'Waiting for an answer to a pact offer.',
    'waiting on search': 'Finish your search first.',
    'the age is over': 'The age is over.',
    'no Poisoner': 'You have no Poisoner to use.',
    'no Bell Seer': 'You have no Bell Seer to use.',
    'bad count': 'You cannot muster that many.',
    'stays at its site': 'This resident works only at its site. It cannot join a retinue.',
    'a landmark': 'This is a landmark. It always stands.',
    'already built': 'It is already built.',
    'relics stay with you': 'A relic stays with you. It cannot be stationed.',
    'not in your retinue': 'That card is not in your retinue.',
    'no such region': 'There is no such region.'
  };
  function plain(m) {
    if (!m) return '';
    if (PLAIN[m]) return PLAIN[m];
    var x;
    if ((x = /^need (\d+) warbands$/.exec(m))) return 'You need ' + x[1] + ' warbands at the Far Pass to depart.';
    if ((x = /^need (\d+) relics$/.exec(m))) return 'You need ' + plural(+x[1], 'relic') + ' to depart.';
    if ((x = /^hold the Far Pass with (\d+) warbands/.exec(m))) return 'You must have held the Far Pass with ' + x[1] + ' warbands since the start of your turn.';
    if (/^the Waystone opens/.test(m)) return cap(m) + '.';
    // a moon or two left, but the action costs more
    if ((x = /^assault on (\w+) costs (\d+) moons \((\w+): Drowned Bell\); have (\d+)$/.exec(m)))
      return 'Assaulting ' + rn(x[1]) + ' costs ' + x[2] + ' moons (' + who(x[3]) + ' holds the Drowned Bell); you have ' + x[4] + '.';
    if ((x = /^(assault|depart) costs (\d+) moons; have (\d+)$/.exec(m)))
      return (x[1] === 'assault' ? 'An assault costs ' : 'Departing costs ') + x[2] + ' moons; you have ' + x[3] + '.';
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
  // the Tide Reader and Heron Witch draws of a battle, in plain sentences, or ''
  function fortuneNotes(ev, s) {
    var out = [];
    if (ev.tideCard != null) out.push(whose(ev.house, s) + ' Tide Reader drew two cards: a ' + ev.tideCard + ' and a ' + (ev.witch && ev.witch.house === ev.house ? ev.witch.discarded : ev.attCard) + '. ' +
      who(ev.house, s) + ' kept the higher.');
    if (ev.witch) out.push(whose(ev.witch.house, s) + ' Heron Witch redrew a ' + ev.witch.discarded + ' as a ' + ev.witch.card + '.');
    return out.join(' ');
  }
  U.fortuneNotes = fortuneNotes;
  // one event as a line of the log, or null
  function describe(ev, s) {
    var h = ev.house, W = who(h, s);
    switch (ev.type) {
      case 'prophecyChosen': return h === 'player' ? 'You chose your prophecy.' : W + ' chose a prophecy in secret.';
      case 'roundStart': return '— The ' + (D.ORDINALS[ev.round - 1] || ev.round).toLowerCase() + ' round —';
      case 'turnStart': return h === 'player' ? 'Your turn.' : W + "'s turn.";
      case 'income': return W + ' gained ' + ev.silver + ' silver.';
      case 'upkeep': {
        if (!ev.short) return W + ' paid ' + ev.silver + ' silver upkeep for ' + ev.bands + ' warbands.';
        var by = {}, ord = [];
        ev.lost.forEach(function (r) { if (!by[r]) { by[r] = 0; ord.push(r); } by[r]++; });
        var lost = listAnd(ord.map(function (r, i) { return (i ? by[r] : plural(by[r], 'warband')) + ' in ' + rn(r); }));
        return W + (ev.silver ? ' paid ' + ev.silver + ' of ' + ev.due + ' silver upkeep' : ' could not pay upkeep') + ' and disbanded ' + lost + '.';
      }
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
        var fn = fortuneNotes(ev, s);
        return W + ' assaulted ' + rn(ev.to) + ' (' + d + '): ' + ev.attack + ' + ' + ev.attCard + ' against ' + ev.defence + ' + ' + ev.defCard + '. ' +
          (ev.winner === 'attacker' ? W + ' took it.' : 'The assault failed.') + (fn ? ' ' + fn : '');
      }
      case 'assaultCollapsed': return whose(h, s) + ' assault on ' + rn(ev.to) + ' came to nothing.';
      case 'pactBroken': return W + ' broke ' + (PACT_NAME[ev.pact.type] || 'a pact') + ' with ' + whoLow(ev.wronged, s) + '.';
      case 'judge': return whose(ev.house, s) + ' Hanging Judge cost ' + whoLow(ev.breaker, s) + ' ' + plural(ev.lost.length, 'warband') + '.';
      case 'oath': return 'The Broken Word cost ' + whoLow(h, s) + ' ' + ev.lost.length + ' warbands.';
      case 'recruit': return W + ' recruited ' + cardName(ev.card) + ' at ' + rn(ev.region) + '.';
      case 'build': return W + ' built the ' + REG[ev.region].site + ' at ' + rn(ev.region) + ' for ' + ev.silver + ' silver.';
      case 'station': return W + ' stationed ' + cardName(ev.card) + ' at ' + rn(ev.region) + '.';
      case 'search': return W + ' searched ' + rn(ev.region) + ' and drew ' + plural(ev.drew, 'card') + '.' +
        (ev.barrowRelics && ev.barrowRelics.length ? ' The barrow gave up ' + listAnd(ev.barrowRelics.map(cardName)) + '.' : '');
      case 'keep':
        if (!ev.card) return h === 'player' ? 'You kept nothing more.' : null;
        return W + ' kept ' + (h === 'player' || D.CARDS[ev.card].relic || ev.to === 'site' ? cardName(ev.card) : 'a card') +
          (ev.to === 'site' ? ' at ' + rn(ev.region) : '') + '.';
      case 'pactOffered': return W + ' offered ' + whoLow(ev.target, s) + ' ' + pactWords(ev.offer, s) + '.';
      case 'pactAccepted': return W + ' accepted ' + pactWords(ev.pact.type === 'tribute' ? { type: 'tribute', payer: ev.pact.payer, payee: ev.pact.payee } : ev.pact, s) + ' with ' + whoLow(ev.from, s) + '.';
      case 'pactRefused': return W + ' refused ' + whoseLow(ev.from, s) + ' offer.';
      case 'pactExpired': return 'The ' + (ev.pact.type === 'tribute' ? 'tribute' : 'truce') + ' between ' + whoLow(ev.pact.a, s) + ' and ' + whoLow(ev.pact.b, s) + ' ran out.';
      case 'depart': return W + ' departed by the Far Pass.';
      case 'poison': return W + ' poisoned ' + cardName(ev.card) + '.';
      case 'seeProphecy': return h === 'player' ? 'The Bell Seer read ' + whoseLow(ev.target, s) + ' prophecy: “' + D.PROPHECIES[ev.prophecy - 1].text + '”' : W + ' read ' + whoseLow(ev.target, s) + ' prophecy.';
      case 'intent': return 'Plan: ' + planWords(ev.label, W) + '.';
      case 'intentRevised': return (ev.then ? 'New second move: ' : 'New plan: ') + planWords(ev.label, W) + '.';
      case 'intentChanged':
        if (ev.note === 'nearest') return W + ' could not keep to its plan and did the nearest thing.';
        if (ev.note === 'dropped') return W + ' dropped its plan (' + ev.label.replace(/^[^:]+: /, '') + ').';
        return W + ' changed its plan.';
      case 'campBroken': return whose(h, s) + ' camp broke up: ' + ev.count + ' warbands lost.';
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
      } else if (e.type === 'muster' || e.type === 'search' || e.type === 'recruit' || e.type === 'build' || e.type === 'station') U.flash = { region: e.region, house: e.house };
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
  // where each house begins this age, and why: the player first, then the others in turn order
  function startLines(s) {
    var st = s.starts || {}, out = [];
    function rn(r) { return (r === 'crown' || r === 'farpass' ? 'the ' : '') + REG[r].name; }
    function line(h) {
      var x = st[h];
      if (!x) return null;
      var you = h === 'player', W = who(h, s), its = you ? 'your' : 'its', verb = you ? ' begin' : ' begins';
      if (x.why === 'ruler') {
        var add = x.regions.filter(function (r) { return r !== 'crown'; }), kept = x.kept || [];
        var t = W + (you ? ' hold' : ' holds') + ' the Crown hold, with ' + listAnd(add.map(rn));
        if (s.ageNo > 1 && kept.length === add.length) return t + ' from the last age.';
        if (!kept.length) return t + '.';
        var fresh = add.filter(function (r) { return kept.indexOf(r) < 0; });
        return W + (you ? ' hold' : ' holds') + ' the Crown hold, with ' + listAnd(kept.map(rn)) + ' from the last age. ' + W + (you ? ' also take ' : ' also takes ') + listAnd(fresh.map(rn)) + '.';
      }
      if (x.why === 'freehold') return W + verb + ' at ' + its + ' free hold in the Far Pass. ' + (you ? 'You' : W) + (you ? ' also hold ' : ' also holds ') + rn(x.also) + '.';
      if (x.why === 'holdfast') return you ? 'You begin in ' + rn(x.region) + ', where your banners stood when the last age ended.' : W + ' begins in ' + rn(x.region) + ', its holdfast.';
      if (x.why === 'near') {
        var by = s.regions[x.holdfast].owner;
        return W + verb + ' in ' + rn(x.region) + ', beside ' + its + ' old holdfast of ' + rn(x.holdfast) + '.' + (you && by ? ' ' + who(by, s) + (by === 'player' ? ' hold' : ' holds') + ' ' + rn(x.holdfast) + ' now.' : '');
      }
      if (x.holdfast) return W + verb + ' in ' + rn(x.region) + '.' + (you ? ' Your old holdfast of ' + rn(x.holdfast) + ' and the lands beside it are taken.' : '');
      return W + verb + ' in ' + rn(x.region) + (D.EDGE_STARTS.indexOf(x.region) >= 0 ? ', at the edge of the valley.' : '.');
    }
    ['player'].concat(s.order.filter(function (h) { return h !== 'player'; })).forEach(function (h) { var t = line(h); if (t) out.push({ h: h, text: t }); });
    return out;
  }
  function logStart() {
    var s = U.c.age;
    logLine(E.ageTitle(s.ageNo) + ' begins.', null, 'round');
    // the log shows the newest line first: log the player's line last so it sits on top
    startLines(s).reverse().forEach(function (l) { logLine(l.text, l.h); });
  }
  function newCampaign(name) {
    var seed = ((Date.now() % 4294967296) ^ Math.floor(Math.random() * 4294967296)) >>> 0;
    U.c = E.newCampaign(seed, name || 'Your house');
    U.log = []; U.reports = [];
    E.startAge(U.c);
    logStart();
    save();
    go('age');
  }
  function nextAge() {
    E.startAge(U.c);
    U.log = []; U.reports = [];
    logStart();
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
      if (a.type !== m.kind || (m.card && a.card !== m.card)) return;
      var r = a.type === 'assault' ? a.to : (a.from || a.region);
      if (r && out.indexOf(r) < 0) out.push(r);
    });
    return out;
  }
  // a region a rival holds with no warbands in it: it cannot be assaulted, but a march in takes it
  function unguarded(s, r) {
    var g = s.regions[r];
    if (!g || !g.owner || g.owner === 'player') return false;
    for (var k in g.bands) if (g.bands[k] > 0) return false;
    return true;
  }
  // the unguarded rival regions you can march into now, as a sentence ('' when there are none)
  function unguardedNote(s, legal) {
    var u = [];
    legal.forEach(function (a) { if (a.type === 'march' && unguarded(s, a.to) && u.indexOf(a.to) < 0) u.push(a.to); });
    if (!u.length) return '';
    return listAnd(u.map(rn)) + (u.length === 1 ? ' is unguarded: march in to take it (1 moon).' : ' are unguarded: march in to take them (1 moon each).');
  }
  // each rival's shown moves in the order it will make them: the first is its next move, the rest come after that
  function intents(s) {
    var out = [], owl = E.has(s, 'player', 'owl');
    if (s.phase !== 'play') return out;
    s.order.forEach(function (h) {
      var hs = s.houses[h];
      if (!hs.ai) return;
      var mine = [];
      if (hs.intent) mine.push({ house: h, intent: hs.intent });
      if (hs.then) mine.push({ house: h, intent: hs.then });
      if (owl && hs.intent2) mine.push({ house: h, intent: hs.intent2, owl: true });
      mine.forEach(function (x, i) { x.second = i; out.push(x); });   // second: 0 for the next move, 1, 2 for later ones (the map dashes those)
    });
    return out;
  }
  // 'Varrow: march 2 to Saltmarsh' -> 'Varrow next: march 2 to Saltmarsh', or for a later move 'Varrow after that: ...'
  function planWhen(label, later) { return label.replace(/^([^:]+): /, '$1 ' + (later ? 'after that' : 'next') + ': '); }

  // ---------------------------------------------------------------- folding panels
  // Each side panel folds to its heading and a one-line summary. The open state lives in U.panels
  // (saved under PANELKEY), not in the DOM, so a redraw never snaps a panel shut. A panel the player
  // has not touched starts shut on a phone and open on a wide screen.
  var PANELKEY = 'writ-and-ruin-panels';
  function panelStore() {
    if (U.panels) return U.panels;
    var o = null;
    try { o = JSON.parse(localStorage.getItem(PANELKEY) || 'null'); } catch (e) { o = null; }
    U.panels = o && typeof o === 'object' ? o : {};
    return U.panels;
  }
  function narrow() {
    try { return !!(root.matchMedia && root.matchMedia('(max-width: 700px)').matches); } catch (e) { return false; }
  }
  function panelOpen(id) {
    var p = panelStore();
    return typeof p[id] === 'boolean' ? p[id] : !narrow();
  }
  function setPanel(id, open) {
    var p = panelStore();
    p[id] = !!open;
    try { localStorage.setItem(PANELKEY, JSON.stringify(p)); } catch (e) { /* storage blocked: remember for this visit only */ }
  }
  // fold(id, title, summary html, body html, extra section class, extra summary class)
  function fold(id, title, sum, body, cls, sumCls) {
    var open = panelOpen(id);
    return '<section class="panel fold' + (cls ? ' ' + cls : '') + (open ? ' open' : ' shut') + '">' +
      '<h3 class="fold-h"><button type="button" class="fold-head" aria-expanded="' + open + '" aria-controls="pb-' + id + '" data-k="' +
      K(function () { setPanel(id, !panelOpen(id)); render(); }) + '">' +
      '<span class="fold-title">' + title + '</span><span class="chev" aria-hidden="true">' + (open ? '▾' : '▸') + '</span>' +
      (open ? '' : '<span class="fold-sum' + (sumCls ? ' ' + sumCls : '') + '">' + sum + '</span>') + '</button></h3>' +
      '<div class="fold-body" id="pb-' + id + '"' + (open ? '' : ' hidden') + '>' + body + '</div></section>';
  }
  // a claim that newly stands opens "Who is close to winning", even if the player had shut it
  function watchClaims(s) {
    var now = [];
    s.order.forEach(function (h) { var cs = E.claimStanding(s, h); if (cs) now.push(s.ageNo + ':' + h + ':' + cs.kind); });
    var was = U.claimsSeen || [];
    if (now.some(function (k) { return was.indexOf(k) < 0; })) setPanel('danger', true);
    U.claimsSeen = now;
  }

  // ---------------------------------------------------------------- the age screen
  var WIN_KIND ={ seize: 'Seize', foretell: 'Foretell', depart: 'Depart', seat: 'Seat' };
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
  // the rows of "Who is close to winning", each as html and a short plain line for the folded summary:
  // standing claims (a rival's before yours), then the rival wins the AI sees coming, then the house nearest a win
  // (which may be you) unless a claim row already names it. The summary is always the first row's short line.
  function dangerRows(s) {
    var rows = [], claims = [];
    s.order.forEach(function (h) { var cs = E.claimStanding(s, h); if (cs) claims.push({ h: h, cs: cs }); });
    claims.sort(function (a, b) { return (a.h === 'player') - (b.h === 'player'); });
    claims.forEach(function (c) {
      var h = c.h, cs = c.cs, mine = h === 'player';
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
      rows.push({ house: h, claim: true,
        html: '<li class="claim' + (mine ? ' good' : '') + '">' + stamp(h, 18) + '<span><b>' + who(h, s) + '</b> ' + text + '</span></li>',
        text: 'Claim: ' + whoLow(h, s) + (cs.kind === 'seize' ? (mine ? ' hold ' : ' holds ') + D.NUMBER_WORDS[N.seizeRegions] + ' regions' :
          (mine ? ' have fulfilled your' : ' has fulfilled its') + ' prophecy') });
    });
    var dz = [];
    try { dz = AI.dangers(s, 'player'); } catch (e) { dz = []; }
    dz.sort(function (a, b) { return b.urgency - a.urgency; }).forEach(function (d) {
      if (d.urgency < 0.15) return;
      var kind = { seize: 'could seize the valley', foretell: 'is near its prophecy', depart: 'could depart by the Far Pass', seat: 'holds the Crown hold' }[d.kind] || d.kind;
      var where = d.regions && d.regions.length ? ' Stop it at ' + listAnd(d.regions.map(rn)) + '.' : '';
      rows.push({ house: d.house,
        html: '<li>' + stamp(d.house, 18) + '<span><b>' + who(d.house, s) + '</b> ' + kind + '.' + where +
          ' <span class="urg"><i style="width:' + Math.round(Math.min(1, d.urgency) * 100) + '%"></i></span></span></li>',
        text: who(d.house, s) + ' ' + kind });
    });
    var n = nearest(s);
    if (n && !claims.some(function (c) { return c.h === n.house; })) {
      rows.push({ house: n.house,
        html: '<li>' + stamp(n.house, 18) + '<span><b>' + who(n.house, s) + '</b> ' + n.words + '.</span></li>',
        text: who(n.house, s) + ' ' + n.words });
    }
    return { rows: rows, cls: claims.length ? (claims.length === 1 && claims[0].h === 'player' ? 'good' : 'warn') : '' };
  }
  // the house nearest a win by the chips' threat bars, as counts: { house, words: 'are nearest: Foretell, 7 of 8 for your prophecy' }
  function nearest(s) {
    var best = null;
    s.order.forEach(function (h) {
      var p = E.progress(s, h);
      ['seize', 'foretell', 'depart', 'seat'].forEach(function (k) {
        if (p[k] > 0 && (!best || p[k] > best.v)) best = { h: h, k: k, v: p[k] };
      });
    });
    if (!best) return null;
    var h = best.h, hs = s.houses[h], mine = h === 'player', how;
    if (best.k === 'seize') how = E.nHeld(s, h) + ' of ' + N.seizeRegions + ' regions';
    else if (best.k === 'foretell') { var pp = E.prophecyProgress(s, h, hs.prophecy); how = pp.have + ' of ' + pp.need + ' for ' + (mine ? 'your' : 'its') + ' prophecy'; }
    else if (best.k === 'depart') {
      var dn = E.departNeeds(s, h);
      how = Math.min(hs.relics.length, dn.relics) + ' of ' + dn.relics + ' relics, ' +
        Math.min(E.holds(s, h, 'farpass') ? E.bandsAt(s, h, 'farpass') : 0, dn.bands) + ' of ' + dn.bands + ' warbands at the Far Pass';
    } else how = (mine ? 'you hold' : 'holds') + ' the Crown hold';
    return { house: h, words: (mine ? 'are' : 'is') + ' nearest: ' + WIN_KIND[best.k] + ', ' + how };
  }
  // the folded line: the first row's short form, and how many more rows there are
  function dangerSummary(s, d) {
    d = d || dangerRows(s);
    if (!d.rows.length) return { text: 'No house is close to winning yet.', cls: '' };
    return { text: d.rows[0].text + (d.rows.length > 1 ? ' · ' + (d.rows.length - 1) + ' more' : ''), cls: d.cls };
  }
  function dangerPanel(s) {
    var d = dangerRows(s), sm = dangerSummary(s, d);
    var body = d.rows.length ? d.rows.map(function (r) { return r.html; }).join('') : '<li class="muted">No house is close to winning yet.</li>';
    return fold('danger', 'Who is close to winning', esc(sm.text), '<ul class="rows">' + body + '</ul>', 'danger', sm.cls);
  }
  // "Varrow next: march 2 to Saltmarsh", or for a later move "Varrow after that: march 2 to Saltmarsh"
  function planLabel(s, x) {
    return planWhen(E.intentLabel(s, x.house, x.intent), x.second > 0);
  }
  function intentPanel(s) {
    var it = intents(s);
    if (!it.length) return '';
    var sum = esc(planLabel(s, it[0])) + (it.length > 1 ? ' · ' + (it.length - 1) + ' more' : '');
    return fold('plans', 'Rival plans', sum, '<ul class="rows">' + it.map(function (x) {
      return '<li>' + stamp(x.house, 18) + '<span>' + (x.intent.revised ? '<b class="newplan">New plan.</b> ' : '') + esc(planLabel(s, x)) + (x.owl ? ' <em>(seen by the Owl)</em>' : '') + '</span></li>';
    }).join('') + '</ul>');
  }
  function retinuePanel(s) {
    var hs = me(s);
    var my = isMyTurn(s) && !s.pending && !hs.flags.returnDue;
    var cards = hs.retinue.map(function (id) {
      if (!my) return A.card(id);
      // station: 1 moon to leave the resident at an empty slot in a region you hold
      var where = E.legalActions(s, 'player').filter(function (a) { return a.type === 'station' && a.card === id; });
      var off = hs.hours < 1 ? 'no hours' : (where.length ? null : 'No region you hold has an empty slot.');
      return A.card(id, '<div class="row">' + btn('Station at a site <small>1 moon</small>', function () { stationPick(id, where); }, { cls: 'small', off: off }) + '</div>');
    }).join('');
    var rel = hs.relics.map(function (id) { return A.card(id); }).join('');
    var p = hs.prophecy ? E.prophecyProgress(s, 'player', hs.prophecy) : null;
    var sum = [hs.prophecy ? 'Prophecy ' + p.have + '/' + p.need : '', 'Retinue ' + hs.retinue.length + '/' + N.retinueMax,
      hs.relics.length ? plural(hs.relics.length, 'relic') : ''].filter(Boolean).join(' · ');
    return fold('house', 'Your house', esc(sum),
      (hs.prophecy ? '<p class="prophecy"><span class="lbl">Prophecy</span> “' + esc(D.PROPHECIES[hs.prophecy - 1].text) + '” <b>' + p.have + '/' + p.need + '</b></p>' : '') +
      '<p class="lbl">Retinue ' + hs.retinue.length + '/' + N.retinueMax + '</p>' + (cards || '<p class="muted">No one yet. Recruit residents where your warbands stand.</p>') +
      (rel ? '<p class="lbl">Relics</p>' + rel : ''));
  }
  function lawPanel(s) {
    var sum = s.laws.length ? s.laws.map(function (id) { return esc(D.LAW[id].name); }).join(' · ') : 'None';
    return fold('laws', 'Laws in force', sum, s.laws.length ? '<ul class="rows">' + s.laws.map(function (id) {
      return '<li><span><b>' + esc(D.LAW[id].name) + '.</b> ' + esc(D.LAW[id].text) + '</span></li>';
    }).join('') + '</ul>' : '<p class="muted">No law is in force this age.</p>');
  }
  function logPanel() {
    var s = age(), lines = U.log.filter(function (l) { return !s || l.a === s.ageNo; });
    return fold('log', 'The tale of this age', lines.length ? esc(lines[0].t) : 'Nothing yet.', '<ol class="loglist">' + lines.slice(0, 60).map(function (l) {
      return '<li class="' + l.c + '">' + (l.h ? stamp(l.h, 16) : '') + '<span>' + esc(l.t) + '</span></li>';
    }).join('') + '</ol>', 'log');
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
        recruit: 'Choose a region with a resident to recruit.', search: 'Choose a region to search.',
        station: 'Choose one of your regions with an empty slot to station ' + (U.mode.card ? cardName(U.mode.card) : 'the resident') + ' in.' }[U.mode.kind] || '';
      if (U.mode.kind === 'assault') { var un = unguardedNote(s, legal); if (un) words += ' ' + un; }
      return '<div class="hint pickhint"><span>' + esc(words) + '</span>' + btn('Cancel', function () { U.mode = null; render(); }, { cls: 'small' }) + '</div>';
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
    if (kind === 'assault') {
      var why = hs.hours < 2 && !(E.has(s, 'player', 'bannerClerk') && !hs.flags.clerk) ? 'assault costs 2 moons; have ' + hs.hours : 'None of your warbands stand next to a region you can assault.';
      var u = unguardedNote(s, legalNow(s));
      return u ? plain(why) + ' ' + u : why;
    }
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
  // station a retinue card: one eligible region goes straight there, more are picked on the map
  function stationPick(id, where) {
    if (where.length === 1) { doAction({ type: 'station', region: where[0].region, card: id }); return; }
    U.mode = { kind: 'station', card: id };
    render();
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
    watchClaims(s);
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
    // painted art arrives after the first draw; draw again with it
    // (an open sheet too, so a region sheet picks up its site painting)
    if (A.onPainted) A.onPainted(function () { if (!U.busy) { render(); if (sheetIsOpen()) redrawSheet(); } });
  }

  // exports for ui-sheets.js and for tests
  U.h = { esc: esc, cap: cap, age: age, me: me, who: who, whoLow: whoLow, whose: whose, whoseLow: whoseLow, rn: rn, cardName: cardName, planWhen: planWhen, dangerRows: dangerRows, dangerSummary: dangerSummary, intents: intents, planLabel: planLabel, listAnd: listAnd, plural: plural,
    stamp: stamp, btn: btn, K: K, plain: plain, toast: toast, save: save, hasSave: hasSave, logLine: logLine, describe: describe,
    pactWords: pactWords, screenFor: screenFor, isMyTurn: isMyTurn, legalNow: legalNow, bars: bars, unguarded: unguarded };
  U.go = go; U.render = render; U.pump = pump; U.skipAhead = skip; U.doAction = doAction; U.newCampaign = newCampaign; U.nextAge = nextAge;
  U.openSheet = openSheet; U.redrawSheet = redrawSheet; U.closeSheet = closeSheet; U.sheetIsOpen = sheetIsOpen; U.take = take;
  U.loadSave = loadSave; U.KEY = KEY;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})(typeof self !== 'undefined' ? self : this);
