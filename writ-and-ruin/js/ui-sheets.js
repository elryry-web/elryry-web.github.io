/* Writ & Ruin: dialogs and the screens around the age (title, end of age, the Reckoning, the Annals).
 * Adds to window.WR_UI from ui.js.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA, E = root.WR_ENGINE, AI = root.WR_AI, A = root.WR_ART, M = root.WR_MAP, U = root.WR_UI;
  var N = D.NUM, REG = D.REGION, IDS = D.REGION_IDS, H = U.h;
  var esc = H.esc, cap = H.cap, age = H.age, who = H.who, whoLow = H.whoLow, whose = H.whose, whoseLow = H.whoseLow, rn = H.rn, cardName = H.cardName,
    listAnd = H.listAnd, plural = H.plural, stamp = H.stamp, btn = H.btn, K = H.K, plain = H.plain, toast = H.toast;

  function me() { return age().houses.player; }
  function prophecyText(id) { return D.PROPHECIES[id - 1] ? D.PROPHECIES[id - 1].text : ''; }
  function ordinal(n) { return (D.ORDINALS[n - 1] || String(n)).toLowerCase(); }

  // ---------------------------------------------------------------- odds of winning an assault
  // the maths lives in the engine (E.assaultOdds), which counts Tide Reader and Heron Witch as an assault draws them
  function winOdds(s, a) { return E.assaultOdds(s, a); }
  function oddsWords(p) {
    if (p >= 0.995) return 'certain';
    if (p <= 0.005) return 'no chance';
    return Math.round(p * 100) + ' in 100';
  }
  // the middle half of the outcomes, e.g. "1–2", or "2" when that is all of it
  function lossWords(dist) {
    var r = E.lossRange(dist);
    return r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
  }
  U.winOdds = winOdds;

  // ---------------------------------------------------------------- a stepper sheet for counts
  // o: {title, intro, min, max, start, info(n) -> html, action(n) -> action, label, wide}
  function stepper(o) {
    var n = Math.max(o.min, Math.min(o.max, o.start != null ? o.start : o.max));
    function build() {
      var a = o.action(n), m = E.check(age(), Object.assign({ house: 'player' }, a));
      return '<h2>' + o.title + '</h2>' + (o.intro ? '<p>' + o.intro + '</p>' : '') +
        '<div class="stepper">' + btn('−', function () { if (n > o.min) { n--; U.redrawSheet(); } }, { cls: 'step', off: n <= o.min ? 'That is the fewest.' : null, title: 'Fewer' }) +
        '<span class="stepn"><b>' + n + '</b><small>' + (n === 1 ? 'warband' : 'warbands') + '</small></span>' +
        btn('+', function () { if (n < o.max) { n++; U.redrawSheet(); } }, { cls: 'step', off: n >= o.max ? 'That is the most.' : null, title: 'More' }) + '</div>' +
        '<div class="info">' + o.info(n) + '</div>' +
        (m ? '<p class="warn">' + esc(plain(m)) + '</p>' : '') +
        '<div class="row">' + btn(o.label, function () { U.doAction(o.action(n)); }, { cls: 'go', off: m }) +
        btn('Cancel', function () { U.closeSheet(); U.render(); }) + '</div>';
    }
    U.openSheet(build, { wide: o.wide });
  }

  // ---------------------------------------------------------------- march, muster, assault
  function marchSheet(from, to) {
    var s = age(), hs = me(), max = from === 'camp' ? hs.camp : E.bandsAt(s, 'player', from);
    var dest = from === 'camp' ? { to: to, via: null } : (E.marchDests(s, 'player', from).filter(function (d) { return d.to === to; })[0] || { to: to });
    var mode = E.enterMode(s, 'player', to), owned = E.holds(s, 'player', to);
    stepper({
      title: 'March to ' + rn(to), min: 1, max: Math.max(1, max), start: max,
      intro: 'From ' + rn(from) + (dest.via ? ', by way of ' + rn(dest.via) : '') + '.',
      info: function (n) {
        var t = [];
        t.push(owned ? 'You hold ' + rn(to) + '.' : (s.regions[to].owner ? 'Held by ' + whoLow(s.regions[to].owner) + (H.unguarded(s, to) ? ', with no warbands there. You take it when you march in.' : '.') : 'No house holds it: you take it when you march in.'));
        if (mode === 'hermit') t.push('The Antlered Hermit lets you pass the free folk.');
        if (mode === 'smuggle') t.push('The Smuggler Queen takes it without a battle; their warband falls back.' +
          (E.pactsBrokenBy(s, 'player', s.regions[to].owner).length ? ' This breaks your pact with ' + whoLow(s.regions[to].owner) + '.' + angerWarn(s, s.regions[to].owner) : ''));
        if (E.watched(s, to) && !owned) t.push('The Smuggler Queen walks you past ' + whoseLow(s.regions[to].owner) + ' Town Watch. You take it when you march in.');
        var free = E.marchFree(s, 'player', from, to);
        t.push((free ? 'Costs no moons' : 'Costs 1 moon') + (E.law(s, 'tolls') && !owned ? ' and 1 silver toll' : '') + '.');
        if (free) t.push((free === 'toll' ? 'The ' + REG.riverford.site : free === 'oldRoad' ? 'The ' + D.WORK.oldRoad.name : cap(cardName('drover'))) + ' makes one march a turn free.');
        if (from !== 'camp' && n === max && E.holds(s, 'player', from) && s.regions[from].owner === 'player') t.push(E.hasAt(s, 'player', 'townWatch', from) ?
          'This leaves no warbands in ' + rn(from) + '. You still hold it, and your Town Watch keeps it: a neighbour must assault it, and it defends at ' + N.townWatch + '.' :
          'This leaves ' + rn(from) + ' unguarded. You still hold it, but any neighbour can march in and take it.');
        return '<p>' + t.join(' ') + '</p>';
      },
      action: function (n) { return { type: 'march', from: from, to: to, count: n }; },
      label: 'March'
    });
  }
  function musterSheet(r) {
    var s = age(), hs = me(), max = E.musterMax(s, 'player', r);
    var afford = max; while (afford > 1 && E.musterCost(s, 'player', r, afford) > hs.silver) afford--;
    stepper({
      title: 'Muster in ' + rn(r), min: 1, max: max, start: afford,
      intro: 'Raise new warbands in a region you hold. You have ' + hs.silver + ' silver.',
      info: function (n) {
        var cost = E.musterCost(s, 'player', r, n), tot = E.boardBands(s, 'player') + n, up = E.upkeep(s, 'player', tot);
        var t = '<p>Costs <b>' + cost + ' silver</b> and 1 moon.</p>' +
          '<p class="note">Upkeep: 1 silver for every ' + N.upkeepPer + ' warbands, paid each turn after income. You will have ' + tot + ': next turn you pay ' + up + '.</p>';
        if (up && hs.silver - cost + E.income(s, 'player') < up) t += '<p class="warn">You may be short. Each silver you cannot pay disbands 1 warband.</p>';
        return t;
      },
      action: function (n) { return { type: 'muster', region: r, count: n }; },
      label: 'Muster'
    });
  }
  // the righteous anger a break would give d against you, as a sentence ('' if none: the Forger hides it, or d has it already)
  function angerWarn(s, d) {
    if (!d || E.has(s, 'player', 'forger') || E.wronged(s, d, 'player')) return '';
    return ' ' + who(d) + ' will get +1 attack against you until the age ends.';
  }
  function assaultSheet(from, to) {
    var s = age(), hs = me(), max = from === 'camp' ? hs.camp : E.bandsAt(s, 'player', from);
    var n = max;
    function build() {
      var a = { type: 'assault', house: 'player', from: from, to: to, count: n };
      var m = E.check(s, a), pv = E.battlePreview(s, a), o = winOdds(s, a), p = o.p, extra = [];
      if (o.tide) extra.push('Your Tide Reader draws two cards for you. You keep the higher.');
      if (o.attWitch) extra.push('Your Heron Witch can redraw your card once if you are losing.');
      if (o.defWitch) extra.push(whose(o.defWitch) + " Heron Witch can redraw their card once if they are losing.");
      var left = E.fortuneLeft(s), broke = E.pactsBrokenBy(s, 'player', pv.defender);
      var g = s.regions[to], defBands = pv.defender ? E.bandsAt(s, pv.defender, to) : g.folk;
      return '<h2>Assault ' + rn(to) + '</h2><p>From ' + rn(from) + '. ' + (pv.defender ? 'Held by <b>' + who(pv.defender) + '</b> with ' + plural(defBands, 'warband') + '.' : 'Defended by ' + plural(g.folk, 'band') + ' of free folk.') + '</p>' +
        '<div class="stepper">' + btn('−', function () { if (n > 1) { n--; U.redrawSheet(); } }, { cls: 'step', off: n <= 1 ? 'That is the fewest.' : null, title: 'Fewer' }) +
        '<span class="stepn"><b>' + n + '</b><small>' + (n === 1 ? 'warband' : 'warbands') + '</small></span>' +
        btn('+', function () { if (n < max) { n++; U.redrawSheet(); } }, { cls: 'step', off: n >= max ? 'That is all you have there.' : null, title: 'More' }) + '</div>' +
        '<div class="versus"><div class="vs-side"><span class="lbl">Your attack</span><b class="big">' + pv.attack + '</b></div><span class="vs">against</span>' +
        '<div class="vs-side"><span class="lbl">Their defence</span><b class="big">' + pv.defence + '</b></div></div>' +
        '<p>Each side then draws a fortune card (0 to 3) and adds it. You draw first. The higher total wins, and a tie goes to the defender.</p>' +
        '<p>The loser loses as many warbands as it lost by, at least 1. A tie costs both sides 1, and so does an attacker’s win by exactly 1.</p>' +
        '<p>If you win, your surviving warbands move into ' + rn(to) + (pv.watch ? ' and take it from ' + who(pv.defender) + '.' : pv.defender ? ' and ' + who(pv.defender) + "'s survivors fall back to a neighbouring region " + who(pv.defender) + ' holds (with none, they scatter).' : ' and the free folk who are left scatter.') +
        ' If you lose, your survivors stay in ' + rn(from) + '.</p>' +
        (pv.lastStand ? '<p class="note"><b>Last stand:</b> this is ' + whoseLow(pv.defender) + " only region, so it defends with +" + pv.lastStand + '. That is counted above.</p>' : '') +
        (pv.watch ? '<p class="note"><b>Town Watch:</b> ' + who(pv.defender) + "'s Town Watch keeps it, so it defends at " + N.townWatch + ' (counted above).</p>' : '') +
        (pv.defender && E.wronged(s, 'player', pv.defender) ? '<p class="note"><b>Righteous anger:</b> +1 attack. ' + esc(who(pv.defender)) + ' broke a pact with you this age. That is counted above.</p>' : '') +
        (pv.dug ? '<p class="note"><b>Dug in:</b> +1 defence until ' + whoseLow(pv.defender) + ' next turn. That is counted above.</p>' : '') +
        (pv.peek != null ? '<p class="note"><b>Star Reader:</b> the next fortune card is a <b>' + pv.peek + '</b>. You will draw it.</p>' : '') +
        '<p class="fortune-line"><span class="lbl">Fortune left</span> ' + [0, 1, 2, 3].map(function (v) { return '<span class="fc"><b>' + v + '</b>×' + (left[v] || 0) + '</span>'; }).join('') +
        (s.fortune.length ? '' : ' <span class="muted">(the deck reshuffles first)</span>') + '</p>' +
        '<p class="odds">Chance to win: <b>' + oddsWords(p) + '</b></p>' +
        '<p class="losses">Warbands lost: you <b>' + lossWords(o.attLoss) + '</b>, ' + (pv.defender ? esc(whoLow(pv.defender)) : 'the folk') + ' <b>' + lossWords(o.defLoss) + '</b></p>' +
        (extra.length ? '<p class="note">' + esc(extra.join(' ')) + ' That is counted in the chance.</p>' : '') +
        '<p>Costs ' + plural(E.assaultHours(s, 'player', to), 'moon') + (E.bellHolder(s, 'player', to) ? ' (the Drowned Bell)' : '') + '.</p>' +
        (broke.length ? '<p class="warn">This breaks your ' + broke.map(function (pc) { return pc.type === 'foe' ? 'common cause' : pc.type; }).join(' and ') + ' with ' + whoLow(pv.defender) + '. They will hold a grudge.' + esc(angerWarn(s, pv.defender)) + '</p>' : '') +
        (m ? '<p class="warn">' + esc(plain(m)) + '</p>' : '') +
        '<div class="row">' + btn('Commit to the assault', function () { U.doAction({ type: 'assault', from: from, to: to, count: n }); }, { cls: 'go', off: m }) +
        btn('Cancel', function () { U.closeSheet(); U.render(); }) + '</div>';
    }
    U.openSheet(build, { wide: true });
  }

  // ---------------------------------------------------------------- the battle result
  function fortuneFace(v, label, col) {
    return '<div class="fface"><span class="lbl">' + label + '</span><span class="fnum" style="--blk:' + col + '">' + (v == null ? '–' : v) + '</span></div>';
  }
  function battleHtml(e, defending) {
    var s = age(), mine = e.house === 'player';
    var youWon = (mine && e.winner === 'attacker') || (!mine && e.winner === 'defender');
    var head = mine ? (e.winner === 'attacker' ? 'You took ' + rn(e.to) + '!' : 'Your assault on ' + rn(e.to) + ' failed.') :
      (e.winner === 'attacker' ? who(e.house) + ' took ' + rn(e.to) + ' from you.' : 'You held ' + rn(e.to) + ' against ' + who(e.house) + '.');
    var notes = [];
    var fn = U.fortuneNotes(e, s);
    if (fn) notes.push(fn);
    if (e.lastStand) notes.push('Last stand: +' + N.lastStand + ' to the defence.');
    if (e.dug) notes.push('Dug in: +1 to the defence.');
    if (e.watch) notes.push('Town Watch: no warbands, so it defended at ' + N.townWatch + '.');
    var loss = [];
    if (e.attLoss) loss.push((mine ? 'You' : who(e.house)) + ' lost ' + plural(e.attLoss, 'warband') + '.');
    if (e.defLoss) loss.push((e.defender === 'player' ? 'You' : (e.defender ? who(e.defender) : 'The free folk')) + ' lost ' + plural(e.defLoss, e.defender ? 'warband' : 'band') + '.');
    var dName = e.defender === 'player' ? 'your' : (e.defender ? whoLow(e.defender) + "'s" : 'the');
    if (e.retreat) loss.push(cap(dName + ' ' + plural(e.retreat.count, 'surviving warband') + (e.retreat.to ? ' fell back to ' + rn(e.retreat.to) + '.' : ' had nowhere to fall back to and scattered.')));
    if (e.relic) loss.push(cap((mine ? 'you' : whoLow(e.house)) + ' took the relic ' + cardName(e.relic) + '.'));
    if (e.silver) { var taker = e.winner === 'attacker' ? e.house : e.defender; loss.push(cap((taker === 'player' ? 'you' : whoLow(taker)) + ' took ' + e.silver + ' silver.')); }
    if (e.bramble) loss.push('The Bramble Woman brought one more warband in.');
    var attLbl = mine ? 'Your card' : who(e.house) + "'s card", defLbl = e.defender === 'player' ? 'Your card' : (e.defender ? who(e.defender) + "'s card" : 'Free folk card');
    return '<h2 class="' + (youWon ? 'won' : 'lost') + '">' + esc(head) + '</h2>' +
      '<div class="faces">' + fortuneFace(e.attCard, attLbl, A.houseCol(e.house)) + '<span class="vs">against</span>' + fortuneFace(e.defCard, defLbl, e.defender ? A.houseCol(e.defender) : A.PAL.bone) + '</div>' +
      '<div class="versus"><div class="vs-side"><span class="lbl">Attack</span><b class="big">' + e.attTotal + '</b><small>' + e.attack + ' + ' + e.attCard + (e.attTotal - e.attack - e.attCard ? ' + ' + (e.attTotal - e.attack - e.attCard) : '') + '</small></div><span class="vs">against</span>' +
      '<div class="vs-side"><span class="lbl">Defence</span><b class="big">' + e.defTotal + '</b><small>' + e.defence + ' + ' + e.defCard + (e.defTotal - e.defence - e.defCard ? ' + ' + (e.defTotal - e.defence - e.defCard) : '') + '</small></div></div>' +
      (notes.length ? '<p class="note">' + notes.map(esc).join(' ') + '</p>' : '') +
      '<p>' + loss.map(esc).join(' ') + '</p>';
  }
  U.battleResult = function (e, cb) {
    U.openSheet(function () {
      return battleHtml(e) + '<div class="row">' + btn('Go on', function () { U.closeSheet(); U.render(); if (cb) cb(); }, { cls: 'go' }) + '</div>';
    }, { modal: true, wide: true });
  };
  // rival assaults on the player, shown one by one when the player is next up
  U.showReports = function (cb) {
    var e = U.reports.shift();
    if (!e) { if (cb) cb(); return; }
    U.openSheet(function () {
      return '<p class="lbl">While you waited</p>' + battleHtml(e) + '<div class="row">' + btn(U.reports.length ? 'Next' : 'Go on', function () { U.closeSheet(); U.showReports(cb); }, { cls: 'go' }) + '</div>';
    }, { modal: true, wide: true });
  };

  // ---------------------------------------------------------------- prophecy, offers, searches
  U.prophecyDialog = function () {
    var s = age(), hs = me();
    U.peek = null;
    U.openSheet(function () {
      return '<h2>Choose your prophecy</h2><p>Fulfil it from the ' + ordinal(N.claimFrom) + ' round on and the age is yours. The rivals choose theirs in secret; yours is secret too.</p>' +
        '<div class="row">' + H.peekBtn({ title: 'Choose your prophecy', reopen: U.prophecyDialog, answers: null }) + '</div>' +
        hs.prophecyOptions.map(function (id) {
          var p = E.prophecyProgress(s, 'player', id);
          return '<div class="choice"><p class="ptext">“' + esc(prophecyText(id)) + '”</p><p class="muted">Now: ' + p.have + ' of ' + p.need + '</p>' +
            btn('Choose this', function () { U.closeSheet(); U.doAction({ type: 'chooseProphecy', id: id }); }, { cls: 'go' }) + '</div>';
        }).join('');
    }, { modal: true, wide: true });
  };
  function offerWords(o) {
    var from = who(o.from);
    if (o.type === 'truce') return from + ' offers a truce for ' + N.pactRounds + ' rounds: neither of you assaults the other.';
    if (o.type === 'tribute') return o.payer === 'player' ?
      from + ' demands tribute: you pay ' + whoLow(o.payee) + ' 1 silver at the start of each of your turns for ' + N.pactRounds + ' rounds, and ' + whoLow(o.payee) + ' will not assault you.' :
      from + ' offers tribute: ' + whoLow(o.payer) + ' pays you 1 silver a round for ' + N.pactRounds + ' rounds, and you will not assault ' + whoLow(o.payer) + '.';
    if (o.type === 'foe') return from + ' offers common cause against ' + whoLow(o.foe) + ' until the age ends: you both get +1 attack against ' + whoLow(o.foe) + ', and you do not assault each other.';
    return from + ' offers a pact.';
  }
  U.offerDialog = function () {
    var s = age(), P = s.pending, o = P.offer;
    // the sheet's buttons and the strip's buttons (while looking at the map) answer the same way
    function accept() { U.closeSheet(); U.doAction({ type: 'respond', accept: true }); }
    function refuse() { U.closeSheet(); U.doAction({ type: 'respond', accept: false }); }
    var demand = o.type === 'tribute' && o.payer === 'player';
    U.peek = null;
    U.openSheet(function () {
      return '<h2>' + stamp(P.from, 28) + ' An offer from ' + who(P.from) + '</h2><p>' + esc(offerWords(o)) + '</p>' +
        '<p class="muted">Breaking a pact is allowed, but the wronged house holds a grudge. It also gets +1 attack against the breaker until the age ends.</p>' +
        '<div class="row">' + btn('Accept', accept, { cls: 'go' }) + btn('Refuse', refuse) + '</div>' +
        '<div class="row">' + H.peekBtn({ title: H.whose(P.from) + (demand ? ' demand' : ' offer'), house: P.from, reopen: U.offerDialog,
          answers: [['Accept', accept, 'go'], ['Refuse', refuse]] }) + '</div>';
    }, { modal: true });
  };
  U.keepDialog = function () {
    var s = age();
    U.peek = null;
    U.openSheet(function () {
      var P = s.pending, hs = me();
      if (!P || P.type !== 'search') return '<p>Nothing to keep.</p>';
      var ls = U.lastSearch, barrow = ls && ls.barrowRelics && ls.barrowRelics.length ? ls.barrowRelics : [];
      var slotsFree = E.slotsOf(s, P.region) - s.regions[P.region].residents.length;
      return '<h2>You searched ' + rn(P.region) + '</h2><p>Keep ' + plural(P.keep, 'card') + ' of these. The rest go back into the world deck.' +
        ' Your retinue holds ' + hs.retinue.length + ' of ' + N.retinueMax + '; the site has ' + plural(Math.max(0, slotsFree), 'empty slot') + '.</p>' +
        '<div class="row">' + H.peekBtn({ title: 'Your search of ' + rn(P.region), reopen: U.keepDialog, answers: null }) + '</div>' +
        (barrow.length ? '<p class="note">The barrow gave up ' + listAnd(barrow.map(cardName)) + ' as well. ' + (barrow.length === 1 ? 'It is' : 'They are') + ' already yours.</p>' : '') +
        '<div class="cards">' + P.cards.map(function (id) {
          var relic = D.CARDS[id].relic, ac = [];
          if (relic) ac.push(btn('Take the relic', function () { U.doAction({ type: 'keep', card: id, to: 'retinue' }); }, { cls: 'go', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'retinue' }) }));
          else {
            if (!D.CARDS[id].siteOnly) ac.push(btn('To your retinue', function () { U.doAction({ type: 'keep', card: id, to: 'retinue' }); }, { cls: 'go', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'retinue' }) }));
            ac.push(btn('Leave at the site', function () { U.doAction({ type: 'keep', card: id, to: 'site' }); }, { cls: D.CARDS[id].siteOnly ? 'go' : '', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'site' }) }));
          }
          return A.card(id, (D.CARDS[id].siteOnly ? '<p class="note">Works only at its site. It does nothing in a retinue.</p>' : '') + '<div class="row">' + ac.join('') + '</div>', { pic: 'full' });
        }).join('') + '</div>' +
        '<p class="muted">A resident left at the site can be recruited later by whoever holds the region, or has warbands there or next door.</p>' +
        '<div class="row">' + btn('Keep no more', function () { U.doAction({ type: 'keep', card: null }); }) + '</div>';
    }, { modal: true, wide: true });
  };

  // ---------------------------------------------------------------- the region sheet
  U.regionSheet = function (r) {
    var s = age();
    // With Muster chosen from the bar, a held region goes straight to the muster count.
    if (U.mode && U.mode.kind === 'muster' && r !== 'camp' && H.isMyTurn(s) && E.holds(s, 'player', r) &&
        !cand({ type: 'muster', region: r, count: 1 })) { U.selected = r; musterSheet(r); U.render(); return; }
    // With Station chosen from a retinue card, a held region with an empty slot takes the resident at once.
    if (U.mode && U.mode.kind === 'station' && r !== 'camp' && H.isMyTurn(s) &&
        !cand({ type: 'station', region: r, card: U.mode.card })) { U.doAction({ type: 'station', region: r, card: U.mode.card }); return; }
    // With Assault chosen from the bar, an unguarded rival region is taken by marching, not by assault: say so.
    if (U.mode && U.mode.kind === 'assault' && r !== 'camp' && H.isMyTurn(s) && H.unguarded(s, r) &&
        H.legalNow(s).some(function (a) { return a.type === 'march' && a.to === r; })) toast(cap(rn(r)) + ' is unguarded: march in to take it (1 moon).');
    // With another action chosen from the bar (or a landless return due), a region where it can be taken
    // goes straight to it: the same sheets the region sheet's buttons open.
    var plan = H.isMyTurn(s) && U.mode ? H.pickPlan(s, H.legalNow(s), U.mode, r) : null;
    if (plan) {
      if (plan.act) { U.doAction(plan.act); return; }
      U.selected = r === 'camp' ? null : r;
      if (plan.kind === 'march' && plan.to.length === 1) marchSheet(r, plan.to[0]);
      else if (plan.kind === 'assault' && plan.from.length === 1) assaultSheet(plan.from[0], r);
      else pickChooser(plan);
      U.render();
      return;
    }
    U.openSheet(function () { return regionHtml(r); }, { wide: true, onClose: function () { U.selected = null; } });
    U.render();
  };
  function cand(a) { a.house = 'player'; return E.check(age(), a); }
  // a short sheet for a pick on the map with more than one way to go: where to march, where to assault
  // from, or which resident to recruit. Its buttons are the region sheet's own.
  function pickChooser(plan) {
    U.openSheet(function () {
      var s = age(), out = [];
      if (plan.kind === 'march') {
        var dests = plan.from === 'camp' ? [] : E.marchDests(s, 'player', plan.from);
        out.push('<h2>March from ' + rn(plan.from) + '</h2><p>Where to?</p><div class="actlist">' + plan.to.map(function (to) {
          var d = dests.filter(function (x) { return x.to === to; })[0];
          return btn(marchLabel(s, to, d && d.via), function () { marchSheet(plan.from, to); });
        }).join('') + '</div>');
      } else if (plan.kind === 'assault') {
        out.push('<h2>Assault ' + rn(plan.to) + '</h2><p>From where?</p><div class="actlist">' + plan.from.map(function (from) {
          return btn('Assault from ' + rn(from) + '…', function () { assaultSheet(from, plan.to); }, { cls: 'red' });
        }).join('') + '</div>');
      } else {
        out.push('<h2>Recruit in ' + rn(plan.region) + '</h2><p>Choose a resident.</p><div class="cards solo">' + plan.cards.map(function (id) {
          return residentCard(s, plan.region, id, true, 'recruit');
        }).join('') + '</div>');
      }
      out.push('<div class="row">' + btn('Cancel', function () { U.closeSheet(); U.render(); }) + '</div>');
      return out.join('');
    }, { wide: plan.kind === 'recruit', onClose: function () { U.selected = null; } });
  }
  // a resident at region r, with its Recruit (or Poach) button when it is the player's turn and r is in reach
  function residentCard(s, r, id, my, mode) {
    var g = s.regions[r], a = { type: 'recruit', region: r, card: id }, m = my ? cand(a) : 'not your turn';
    var cost = E.recruitCost(s, 'player', id, r), from = E.poachFrom(s, 'player', r), reach = E.recruitReach(s, 'player', r);
    var show = my && !!reach;
    var note = !show ? '' : from ? '<p class="note">Poaching: +' + N.poachSilver + ' silver, and ' + who(from) + ' takes a grudge.</p>' :
      reach !== r ? '<p class="muted">You have no warbands here. Your warbands next door in ' + esc(rn(reach)) + ' let you recruit.</p>' : '';
    if (D.CARDS[id].siteOnly) return A.card(id, '<p class="muted">Works only at its site' + (g.owner === 'player' ? ': it guards your region.' : ', for whoever holds the region.') + ' It cannot be recruited.</p>', { pic: 'full' });
    return A.card(id, show ? note + '<div class="row">' + btn((from ? 'Poach for ' : 'Recruit for ') + cost + 's', function () { U.doAction({ type: 'recruit', region: r, card: id }); }, { cls: mode === 'recruit' ? 'go' : '', off: m }) + '</div>' : '', { pic: 'full' });
  }
  // Ryan's site painting across the top of a sheet, cropped wide; the % is how far down the subject sits
  var SITE_FOCUS = { crown: 35, saltmarsh: 55, riverford: 60, ashwood: 70, highpasture: 60, stonefields: 60, oldbarrow: 70, farpass: 35 };
  // the same for the wild land an unbuilt region shows (bare-*): the region's own painting, not a faded structure
  var BARE_FOCUS = { saltmarsh: 50, riverford: 60, ashwood: 60, highpasture: 55, stonefields: 60, oldbarrow: 70 };
  function siteBanner(r, built) {
    var bare = !built && A.paintedUrl && A.paintedUrl('bare-' + r), url = bare || (A.paintedUrl && A.paintedUrl('site-' + r));
    if (!url) return '';
    return '<figure class="sitebanner' + (built ? '' : bare ? ' bare' : ' unbuilt') + '"><span class="sb-clip"><img src="' + url + '" alt="' +
      (bare ? esc(REG[r].name) + ' before the ' + esc(REG[r].site) : esc(REG[r].site) + (built ? '' : ', not yet built')) +
      '" loading="lazy" style="object-position:50% ' + ((bare ? BARE_FOCUS : SITE_FOCUS)[r] || 50) + '%"></span>' +
      (built ? '' : '<span class="sitetag">Not yet built</span>') + '</figure>';
  }
  // a march button's words: a rival region with no warbands in it is taken by the march, so say so
  function marchLabel(s, to, via) {
    var by = via ? 'via ' + rn(via) : '';
    if (H.unguarded(s, to)) return 'Take ' + rn(to) + '… <small>unguarded' + (by ? ', ' + by : '') + '</small>';
    return 'March to ' + rn(to) + (by ? ' <small>' + by + '</small>' : '') + '…';
  }
  function regionHtml(r) {
    var s = age(), hs = me(), my = H.isMyTurn(s), legal = H.legalNow(s), mode = U.mode && U.mode.kind;
    if (r === 'camp') return campHtml(s, hs, my, legal);
    var g = s.regions[r], R = REG[r], owner = g.owner, built = E.siteOn(s, r);
    var out = [siteBanner(r, built)];
    out.push('<header class="rhead"><span class="sitebox' + (built ? '' : ' unbuilt') + '">' + A.art('site/' + r, { size: 40 }) + '</span><div><h2>' + esc(R.name) + '</h2><p class="muted">' +
      (owner ? 'Held by ' + who(owner) : 'Free folk: ' + plural(g.folk, 'band')) + (R.landmark ? ' · a landmark' : built ? '' : ' · undeveloped') + '</p></div></header>');
    out.push('<p class="sitetext"><b>' + esc(R.site) + '.</b> ' + (built ? esc(R.siteText) + (R.landmark ? ' It is a landmark. It always stands.' : ' It works for whoever holds the region.') :
      'Not built yet. The region has no effect, no site income and 1 slot. Whoever holds it may build the ' + esc(R.site) + ' for ' + E.buildCost(r) + ' silver and 1 moon. Built, it gives: ' + esc(R.siteText)) + '</p>');
    var wk = E.workAt(s, r) && D.WORK[E.workAt(s, r)];
    if (wk) out.push('<p class="worktext">' + A.art('work/' + wk.id, { size: 32 }) + '<span><b>' + esc(wk.name) + '.</b> A great work. ' + esc(wk.text) +
      ' It works for whoever holds the region. Only the Reckoning can raze it.</span></p>');
    var defAgainst = owner === 'player' ? s.order.filter(function (k) { return k !== 'player'; })[0] : 'player';
    var facts = [];
    var bandList = Object.keys(g.bands).filter(function (k) { return g.bands[k] > 0; });
    if (bandList.length) facts.push('Warbands: ' + bandList.map(function (k) { return stamp(k, 16) + ' ' + who(k) + ' ' + g.bands[k]; }).join(', '));
    var tower = wk && wk.id === 'watchtower' && !E.has(s, defAgainst, 'tunnelRat');
    facts.push('Defence ' + E.defenceOf(s, r, defAgainst) + (tower || (owner && E.lastStand(s, r)) ? ' (with ' + [tower ? 'the Watchtower' : '', owner && E.lastStand(s, r) ? 'last stand' : ''].filter(Boolean).join(' and ') + ')' : ''));
    if (E.dugIn(s, r)) facts.push('<b>Dug in:</b> +1 defence until ' + whoseLow(owner) + ' next turn.');
    if (owner && s.houses[owner].refuge === r) facts.push('<b>Safe:</b> ' + who(owner) + ' returned here and cannot be assaulted here until its next turn.');
    if (E.watched(s, r) && s.houses[owner].refuge !== r) facts.push('<b>Town Watch:</b> ' + (owner === 'player' ? 'You have' : who(owner) + ' has') + ' no warbands here, but the Town Watch keeps it. ' +
      'No one can march in: it must be assaulted, and it defends at ' + N.townWatch + '. Only the Smuggler Queen walks past.');
    else if (owner && !bandList.length && s.houses[owner].refuge !== r) facts.push('<b>Unguarded:</b> ' + (owner === 'player' ? 'You have' : who(owner) + ' has') + ' no warbands here. ' +
      (E.truce(s) ? 'Once ' + esc(E.truce(s)) + ' ends, any neighbour can march in and take it.' : 'Any neighbour can march in and take it.'));
    if (owner && E.has(s, owner, 'drownedBell')) facts.push('<b>Drowned Bell:</b> ' + (owner === 'player' ? "rivals' assaults on you" : 'assaults on ' + who(owner)) + ' cost 1 more moon.');
    H.intents(s).forEach(function (x) {
      if (x.intent.type === 'poach' && x.intent.region === r) facts.push('<b>Poach:</b> ' + who(x.house) + ' means to poach the ' + esc(cardName(x.intent.card)) + ' from here.');
    });
    facts.push('Neighbours: ' + R.adj.map(rn).join(', '));
    out.push('<p class="facts">' + facts.join('<br>') + '</p>');
    // residents
    var slots = E.slotsOf(s, r);
    out.push('<h3>Residents <small>' + g.residents.length + ' of ' + slots + ' slots</small></h3>');
    if (!g.residents.length) out.push('<p class="muted">No one lives here now. Searching can find someone.</p>');
    else out.push('<div class="cards solo">' + g.residents.map(function (id) { return residentCard(s, r, id, my, mode); }).join('') + '</div>');
    if (!my) {
      out.push(U.busy ? '<p class="muted">A rival is moving. You can act on your turn.</p>' : U.peek ? '<p class="muted">Nothing can be done until you answer.</p>' : '');
      return out.join('');
    }
    // actions
    var acts = [];
    if (hs.flags.returnDue) {
      var spots = E.returnSpots(s, 'player'), m0 = cand({ type: 'return', region: r });
      acts.push(['return', btn('Return here with ' + N.returnBands + ' warbands', function () { U.doAction({ type: 'return', region: r }); }, { cls: 'go', off: m0 })]);
      if (m0) acts.push(['return', '<p class="muted">' + (spots.length ? 'Free regions: ' + spots.map(rn).join(', ') + '.' : 'No region is free: you must return to the camp beyond the Far Pass.') + '</p>']);
      out.push('<h3>Return</h3>' + acts.map(function (x) { return x[1]; }).join(''));
      return out.join('');
    }
    if (E.holds(s, 'player', r)) {
      var mm = cand({ type: 'muster', region: r, count: 1 });
      acts.push(['muster', btn('Muster here… <small>' + E.musterCost(s, 'player', r, 1) + 's each</small>', function () { musterSheet(r); }, { off: mm })]);
      if (E.musteredHere(s, 'player', r)) acts.push(['muster', '<p class="muted">You have already mustered here this turn.</p>']);
      if (!built) acts.push(['build', btn('Build the ' + esc(R.site) + ' <small>' + E.buildCost(r) + 's, 1 moon</small>', function () { U.doAction({ type: 'build', region: r }); }, { cls: 'go', off: cand({ type: 'build', region: r }) })]);
      if (!hs.flags.returnDue) hs.retinue.forEach(function (id) {
        if (D.CARDS[id].relic) return;
        acts.push(['station', btn('Station ' + esc(D.CARDS[id].name) + ' here <small>1 moon</small>', function () { U.doAction({ type: 'station', region: r, card: id }); }, { cls: mode === 'station' ? 'go' : '', off: cand({ type: 'station', region: r, card: id }) })]);
      });
      acts.push(['dig', btn('Dig in', function () { U.doAction({ type: 'dig', region: r }); }, { cls: mode === 'dig' ? 'go' : '', off: cand({ type: 'dig', region: r }) })]);
      acts.push(['dig', '<p class="muted">+1 defence here until your next turn. 1 moon.</p>']);
    }
    var mine = E.bandsAt(s, 'player', r);
    if (mine > 0) {
      var dests = E.marchDests(s, 'player', r), seen = {};
      dests.forEach(function (d) {
        seen[d.to] = 1;
        var m = cand({ type: 'march', from: r, to: d.to, count: 1 });
        acts.push(['march', btn(marchLabel(s, d.to, d.via), function () { marchSheet(r, d.to); }, { off: m })]);
      });
      R.adj.forEach(function (to) {
        var a = { type: 'assault', from: r, to: to, count: mine }, m = cand(a);
        if (E.holds(s, 'player', to)) return;
        if (E.emptyOfOthers(s, 'player', to)) {
          if (!seen[to]) { var mq = cand({ type: 'march', from: r, to: to, count: 1 }); acts.push(['march', btn(marchLabel(s, to, null), function () { marchSheet(r, to); }, { off: mq || 'cannot march there' })]); }
          return;
        }
        acts.push(['assault', btn('Assault ' + rn(to) + '…', function () { assaultSheet(r, to); }, { cls: 'red', off: m })]);
      });
      var ms = cand({ type: 'search', region: r });
      acts.push(['search', btn('Search here <small>' + E.searchSilver(s, 'player') + 's, 1 moon</small>', function () { U.doAction({ type: 'search', region: r }); }, { off: ms })]);
    }
    // into here from elsewhere
    var into = {};
    legal.forEach(function (a) {
      if ((a.type === 'march' || a.type === 'assault') && a.to === r && !into[a.type + a.from]) {
        into[a.type + a.from] = 1;
        var from = a.from;
        if (a.type === 'march') acts.push(['march', btn((H.unguarded(s, r) ? 'Take it: march in from ' + rn(from) : 'March in from ' + rn(from)) + '…', function () { marchSheet(from, r); })]);
        else acts.push(['assault', btn('Assault from ' + rn(from) + '…', function () { assaultSheet(from, r); }, { cls: 'red' })]);
      }
    });
    if (r === 'farpass') {
      var md = cand({ type: 'depart' }), need = E.departNeeds(s, 'player');
      acts.push(['depart', '<p class="muted">To depart: hold the Far Pass with ' + need.bands + ' warbands from the start of your turn and carry ' + plural(need.relics, 'relic') + '. You have ' + hs.relics.length + '. It opens in the ' + ordinal(N.departFrom) + ' round.</p>']);
      acts.push(['depart', btn('Depart by the Far Pass', function () { U.departConfirm(); }, { cls: 'go', off: md })]);
    }
    if (!acts.length) {
      out.push('<p class="muted">' + (mine ? 'Nothing more to do here this turn.' : !E.recruitReach(s, 'player', r) ? 'You have no warbands here or next to it. March in from a neighbour.' :
        E.truce(s) ? esc(plain(E.truceFull(s, 'player') || E.truce(s))) : 'Your warbands next door cannot march or assault here this turn.') + '</p>');
      return out.join('');
    }
    // the current mode first
    if (mode) acts.sort(function (x, y) { return (y[0] === mode) - (x[0] === mode); });
    out.push('<h3>Actions <small>' + plural(hs.hours, 'moon') + ', ' + hs.silver + ' silver</small></h3><div class="actlist">' + acts.map(function (x) { return x[1]; }).join('') + '</div>');
    if (E.truce(s) && acts.some(function (x) { return x[0] === 'assault'; })) out.push('<p class="muted">' + esc(plain(E.truce(s))) + '</p>');
    return out.join('');
  }
  function campHtml(s, hs, my, legal) {
    var out = [siteBanner('farpass', true) + '<header class="rhead"><span class="sitebox">' + A.art('site/farpass', { size: 40 }) + '</span><div><h2>The camp beyond the Far Pass</h2></div></header>'];
    var campers = s.order.filter(function (h) { return s.houses[h].camp > 0; });
    out.push('<p>A house with no region and nowhere free to return camps here. The camp is next to the Far Pass only, and it breaks up at the end of that house’s turn.</p>');
    out.push('<p class="facts">' + (campers.length ? campers.map(function (h) { return stamp(h, 16) + ' ' + who(h) + ': ' + s.houses[h].camp; }).join('<br>') : 'No one is camped here.') + '</p>');
    if (my && hs.flags.returnDue) out.push(btn('Return to the camp', function () { U.doAction({ type: 'return', region: 'camp' }); }, { cls: 'go', off: cand({ type: 'return', region: 'camp' }) }));
    if (my && hs.camp > 0) {
      var any = false;
      legal.forEach(function (a) {
        if (a.from === 'camp' && !any) {
          any = true;
          out.push(a.type === 'march' ? btn('March into the Far Pass…', function () { marchSheet('camp', 'farpass'); }, { cls: 'go' }) :
            btn('Assault the Far Pass…', function () { assaultSheet('camp', 'farpass'); }, { cls: 'red' }));
        }
      });
      if (!any) out.push('<p class="warn">' + esc(plain(cand({ type: 'assault', from: 'camp', to: 'farpass', count: hs.camp }) || 'You cannot move from the camp now.')) + '</p>');
    }
    return out.join('');
  }

  // ---------------------------------------------------------------- houses
  U.houseSheet = function (h) {
    U.openSheet(function () {
      var s = age(), hs = s.houses[h], mine = h === 'player', meH = me();
      var p = E.progress(s, h), claim = E.claimStanding(s, h), out = [];
      out.push('<header class="rhead"><span class="sitebox">' + stamp(h, 40) + '</span><div><h2>' + esc(hs.name) + '</h2><p class="muted">' +
        (mine ? 'Your house' : esc(cap(hs.temper)) + ' temper') + (s.ruler === h ? ' · ruled at the start of the age' : '') + '</p></div></header>');
      out.push('<p class="facts">' + hs.silver + ' silver · ' + plural(E.nHeld(s, h), 'region') + ' · ' + plural(E.totalBands ? E.totalBands(s, h) : 0, 'warband') + ' · ' +
        (function () {
          // on its own turn the house shows what is left of its allowance, not the left-over as if it were the allowance
          var per = E.hoursFor(s, h);
          if (s.phase !== 'play' || s.order[s.turn] !== h) return plural(per, 'moon') + ' a turn';
          var total = Math.max(per, hs.hours);
          return hs.hours + ' of ' + plural(total, 'moon') + ' left this turn';
        })() + (hs.camp ? ' · ' + hs.camp + ' camped' : '') +
        '<br>Income ' + E.income(s, h) + ' silver a turn' + (E.leanBonus(s, h) ? ' (lean holdings +' + E.leanBonus(s, h) + ')' : '') + ' · upkeep ' + E.upkeep(s, h) + ' silver a turn' +
        (function () {
          var st = D.REGION_IDS.filter(function (r) { return E.holds(s, h, r) && E.siteOn(s, r); }).map(function (r) { return REG[r].site; });
          return '<br>Structures: ' + (st.length ? esc(listAnd(st)) : 'none');
        })() + '</p>');
      var dn = E.departNeeds(s, h), seenP = hs.prophecy && (mine || E.knows(s, 'player', h)) ? E.prophecyProgress(s, h, hs.prophecy) : null;
      out.push('<div class="progress">' + ['seize', 'foretell', 'depart', 'seat'].map(function (k) {
        var words = { seize: 'Seize: hold ' + N.seizeRegions + ' regions',
          foretell: 'Foretell: fulfil the prophecy' + (seenP ? ' (' + seenP.have + ' of ' + seenP.need + ')' : ''),
          depart: 'Depart: from the ' + ordinal(N.departFrom) + ' round, hold the Far Pass with ' + plural(dn.bands, 'warband') + ' and carry ' + plural(dn.relics, 'relic'),
          seat: 'Seat: hold the Crown hold when the age ends' }[k];
        return '<div class="prow"><span>' + words + '</span><span class="pbar b-' + k + '"><i style="width:' + Math.round(Math.min(1, p[k]) * 100) + '%"></i></span></div>';
      }).join('') + '</div>');
      if (claim) out.push('<p class="warn">' + (mine ? 'You have' : who(h) + ' has') + ' a claim to ' + (claim.kind === 'seize' ? 'seize the valley' : 'the age by prophecy') +
        (claim.waiting.length ? '. It stands unless ' + listAnd(claim.waiting.map(function (k) { return whoLow(k); })) + ' break it on their turns.' : '. It wins at the start of the next turn.') + '</p>');
      if (mine && hs.prophecy) out.push('<p><span class="lbl">Prophecy</span> “' + esc(prophecyText(hs.prophecy)) + '”</p>');
      else if (!mine) out.push('<p><span class="lbl">Prophecy</span> ' + (E.knows(s, 'player', h) && hs.prophecy ? '“' + esc(prophecyText(hs.prophecy)) + '” (' + (meH.known[h] ? 'read by your Bell Seer' : 'read in your Salt Codex') + ')' : 'Secret. The bar shows how close it seems.') + '</p>');
      out.push('<h3>Retinue</h3>' + (hs.retinue.length ? '<div class="cards">' + hs.retinue.map(function (id) { return A.card(id); }).join('') + '</div>' : '<p class="muted">None.</p>'));
      if (hs.relics.length) out.push('<h3>Relics</h3><div class="cards">' + hs.relics.map(function (id) { return A.card(id); }).join('') + '</div>');
      var pacts = s.pacts.filter(function (pc) { return pc.a === h || pc.b === h; });
      var rows = pacts.map(function (pc) {
        var other = pc.a === h ? pc.b : pc.a;
        var t = pc.type === 'truce' ? 'Truce with ' + whoLow(other) : pc.type === 'tribute' ? who(pc.payer) + ' pays ' + whoLow(pc.payee) + ' tribute' : 'Common cause with ' + whoLow(other) + ' against ' + whoLow(pc.foe);
        return '<li><span>' + esc(t) + (pc.until < 99 ? ' (to the end of round ' + pc.until + ')' : ' (until the age ends)') + '</span></li>';
      });
      // righteous anger, either way: a broken pact gives the wronged house +1 attack against the breaker until the age ends
      (s.wrongs || []).forEach(function (w) {
        if (w.house !== h && w.breaker !== h) return;
        rows.push('<li><span><b>Righteous anger:</b> ' + esc(who(w.house) + (w.house === 'player' ? ' have' : ' has') + ' +1 attack against ' + whoLow(w.breaker) + ' until the age ends. ' +
          who(w.breaker) + ' broke a pact with ' + whoLow(w.house) + '.') + '</span></li>');
      });
      out.push('<h3>Pacts</h3>' + (rows.length ? '<ul class="rows">' + rows.join('') + '</ul>' : '<p class="muted">None.</p>'));
      // its shown moves in order: the first is its next move, the second comes after that
      var plan = mine ? [] : [hs.intent, hs.then].filter(Boolean);
      plan.forEach(function (it, i) { out.push((i ? '' : '<h3>Plan</h3>') + '<p>' + esc(H.planWhen(E.intentLabel(s, h, it), i > 0)) + '.</p>'); });
      if (!mine) {
        var mem = s.memory[h] && s.memory[h].player;
        if (mem && (mem.grudge || mem.debt)) out.push('<p class="muted">' + (mem.grudge ? 'Holds a grudge against you (' + mem.grudge + '). ' : '') + (mem.debt ? 'Owes you a debt (' + mem.debt + ').' : '') + '</p>');
      }
      return out.join('');
    }, { wide: true });
  };

  // ---------------------------------------------------------------- pacts
  U.treatSheet = function () {
    var target = null;
    U.openSheet(function () {
      var s = age(), hs = me(), legal = H.legalNow(s).filter(function (a) { return a.type === 'treat'; });
      var out = ['<h2>Treat with a rival</h2><p>Offer one pact a turn. It costs 1 moon. The rival answers at once. A house with no land can’t make pacts, and its pacts end when it loses its last region.</p>'];
      var landless = !E.nHeld(s, 'player');
      out.push('<div class="row wrap">' + s.order.filter(function (h) { return h !== 'player'; }).map(function (h) {
        // a house with no land can't make pacts: say so on the button itself
        var off = landless ? 'You hold no land, so you can’t make pacts.' :
          !E.nHeld(s, h) ? who(h) + ' holds no land, so it can’t make pacts.' : null;
        return btn(stamp(h, 18) + ' ' + who(h), function () { target = h; U.redrawSheet(); }, { cls: target === h ? 'active' : '', off: off });
      }).join('') + '</div>');
      if (target && (!E.nHeld(s, 'player') || !E.nHeld(s, target))) {
        out.push('<p class="warn">' + (!E.nHeld(s, 'player') ? 'You hold no land' : esc(who(target)) + ' holds no land') +
          '. A house with no land can’t make pacts.</p>');
      } else if (target) {
        var have = E.pactsBetween(s, 'player', target);
        if (have.length) out.push('<p class="muted">Already agreed: ' + have.map(function (p) { return p.type === 'foe' ? 'common cause against ' + whoLow(p.foe) : p.type; }).join(', ') + '.</p>');
        if (E.wronged(s, 'player', target)) out.push('<p class="note">' + esc(who(target)) + ' broke a pact with you. You have +1 attack against ' + esc(whoLow(target)) + ' until the age ends.</p>');
        if (E.wronged(s, target, 'player')) out.push('<p class="note">You broke a pact with ' + esc(whoLow(target)) + '. ' + esc(who(target)) + ' has +1 attack against you until the age ends.</p>');
        var opts = [
          [{ pact: 'truce' }, 'Truce', 'For ' + N.pactRounds + ' rounds neither of you assaults the other.'],
          [{ pact: 'tribute', payer: 'player' }, 'Pay tribute', 'You pay ' + whoLow(target) + ' 1 silver a round for ' + N.pactRounds + ' rounds; they do not assault you.'],
          [{ pact: 'tribute', payer: target }, 'Demand tribute', who(target) + ' pays you 1 silver a round for ' + N.pactRounds + ' rounds; you do not assault them.']
        ];
        s.order.forEach(function (f) { if (f !== 'player' && f !== target) opts.push([{ pact: 'foe', foe: f }, 'Common cause against ' + who(f), 'Until the age ends, you both get +1 attack against ' + whoLow(f) + '.']); });
        out.push('<div class="actlist">' + opts.map(function (o) {
          var a = Object.assign({ type: 'treat', target: target }, o[0]), m = cand(Object.assign({}, a));
          return '<div class="choice"><b>' + esc(o[1]) + '</b><p class="muted">' + esc(o[2]) + '</p>' + btn('Offer', function () { U.doAction(a); }, { cls: 'go', off: m }) + '</div>';
        }).join('') + '</div>');
        if (!legal.length) out.push('<p class="warn">' + esc(plain(cand({ type: 'treat', target: target, pact: 'truce' }) || '')) + '</p>');
      }
      return out.join('');
    }, { wide: true });
  };

  U.poisonSheet = function () {
    U.openSheet(function () {
      var s = age(), legal = H.legalNow(s).filter(function (a) { return a.type === 'poison'; });
      return '<h2>The Poisoner</h2><p>Once an age: remove one resident from play, from a site or from a rival’s retinue.</p><div class="cards">' +
        legal.map(function (a) { return A.card(a.card, '<div class="row">' + btn('Poison', function () { U.doAction({ type: 'poison', card: a.card }); }, { cls: 'red' }) + '</div>'); }).join('') + '</div>';
    }, { wide: true });
  };
  U.seerSheet = function () {
    U.openSheet(function () {
      var s = age(), legal = H.legalNow(s).filter(function (a) { return a.type === 'seeProphecy'; });
      return '<h2>The Bell Seer</h2><p>Once an age: read one rival’s secret prophecy.</p><div class="actlist">' +
        legal.map(function (a) { return btn(stamp(a.target, 18) + ' Read ' + whoLow(a.target) + '’s prophecy', function () { U.doAction({ type: 'seeProphecy', target: a.target }); }); }).join('') + '</div>';
    });
  };
  U.departConfirm = function () {
    var s = age(), m = cand({ type: 'depart' });
    if (m) { toast(plain(m)); return; }
    U.openSheet(function () {
      return '<h2>Depart by the Far Pass?</h2><p>Your house leaves the valley and founds a free hold beyond it. The age ends and you win it.</p>' +
        '<div class="row">' + btn('Depart', function () { U.doAction({ type: 'depart' }); }, { cls: 'go' }) + btn('Not yet', function () { U.closeSheet(); }) + '</div>';
    });
  };
  U.endTurnConfirm = function () {
    var hs = me();
    if (hs.hours < 1) { U.doAction({ type: 'end' }); return; }
    U.openSheet(function () {
      return '<h2>End your turn?</h2><p>You still have ' + plural(hs.hours, 'moon') + '. Unused moons are lost.</p>' +
        '<div class="row">' + btn('End turn', function () { U.doAction({ type: 'end' }); }, { cls: 'go' }) + btn('Keep playing', function () { U.closeSheet(); }) + '</div>';
    });
  };

  // ---------------------------------------------------------------- menu and help
  U.menuSheet = function () {
    U.openSheet(function () {
      return '<h2>Menu</h2><div class="actlist">' +
        btn('How to win', function () { U.helpSheet(); }) +
        btn('The Annals', function () { U.annalsFrom = U.screen; U.go('annals'); }) +
        btn('Back to the title', function () { U.go('title'); }) + '</div>' +
        '<p class="muted">The game saves after every action.</p>';
    });
  };
  U.helpSheet = function () {
    U.openSheet(function () {
      return '<h2>How to win an age</h2><ul class="rows plainlist">' +
        '<li><span><b>Seize.</b> Hold ' + N.seizeRegions + ' of the eight regions. From the ' + ordinal(N.claimFrom) + ' round on, the claim wins at the start of your next turn if no rival breaks it first.</span></li>' +
        '<li><span><b>Foretell.</b> Fulfil your secret prophecy. It is claimed the same way.</span></li>' +
        '<li><span><b>Depart.</b> From the ' + ordinal(N.departFrom) + ' round, hold the Far Pass with enough warbands since the start of your turn and carry the relics it needs, then depart.</span></li>' +
        '<li><span><b>Seat.</b> If the age ends with no other winner, the house holding the Crown hold wins.</span></li></ul>' +
        '<h3>Your turn</h3><p>Each turn you get ' + N.hoursBase + ' moons, minus 1 for each region you hold, but never fewer than ' + N.hoursMin + '. You spend moons on actions. March (1 moon), muster (1 moon and silver), assault (2 moons), recruit, search and treat. You can muster in each region once a turn. ' +
          'Build a structure in a region you hold (1 moon and silver). Station a resident from your retinue in an empty slot of a region you hold (1 moon). Dig in (1 moon): +1 defence in a region you hold until your next turn. Tap a region to see what you can do there.</p>' +
        '<p>Recruit a resident in a region you hold, where your warbands stand, or in a region next to them. Taking one from a region another house holds is poaching: it costs ' + N.poachSilver + ' more silver, and that house takes a grudge against you. You cannot poach from a house you have a pact with. A rival that means to poach from you shows it first, like an assault.</p>' +
        '<h3>Battles</h3><p>In an assault, each side adds a fortune card (0 to 3) to its attack or defence. The higher total wins, and a tie goes to the defender. ' +
          'The loser loses as many warbands as it lost by, at least 1. A tie costs both sides 1, and so does an attacker’s win by exactly 1.</p>' +
        '<h3>Pacts</h3><p>Treat with a rival (1 moon) to offer it a truce, tribute or common cause. The rival answers at once. Breaking a pact is allowed, but the wronged house holds a grudge. ' +
          'If a house breaks a pact with you, you get +1 attack against it until the age ends.</p>' +
        '<h3>Structures</h3><p>The Citadel and the Waystone are landmarks. They stand from the start and can never be razed. ' +
          'The other six regions start undeveloped: no effect, no site income and 1 slot. In the first age the Toll Bridge and the Charcoal Kilns already stand. ' +
          'A built structure gives its effect and a second slot. ' +
          'It works for whoever holds the region, and it stands into the ages that follow.</p>' +
        '<h3>Great works</h3><p>A great work is raised at the Reckoning, in any region. A region holds one at most. Each of the six stands in one place at a time. ' +
          'It works for whoever holds its region. It stands into the ages that follow until a Reckoning razes it.</p><ul class="rows">' +
          D.WORKS.map(function (wk) { return '<li>' + A.art('work/' + wk.id, { size: 22 }) + '<span><b>' + esc(wk.name) + '.</b> ' + esc(wk.text) + '</span></li>'; }).join('') + '</ul>' +
        '<h3>The Reckoning</h3><p>When a house wins an age, it makes one change to the valley. It may build or raze a structure, or raise or raze a great work. ' +
          'Then it changes the world deck and writes a law for the ages to come.</p>' +
        '<h3>Holdfasts</h3><p>When an age ends, each house records its holdfast: the region where it had the most warbands. ' +
          'Next age it starts there. If the ruler or another house has it, the house starts beside it instead. ' +
          'The ruler starts in the Crown hold, with the neighbours of the Crown hold it held at the end of the last age.</p>' +
        '<h3>Silver</h3><p>Each turn starts with income: 1 silver for each region you hold, plus your sites and residents. ' +
        '<b>Lean holdings:</b> while you hold ' + (N.incomeFloor === 3 ? '1 or 2' : '1 to ' + (N.incomeFloor - 1)) + ' regions, they still give you ' + N.incomeFloor + ' silver. ' +
        'Then you pay upkeep: 1 silver for every ' + N.upkeepPer + ' warbands on the board. ' +
        'Each silver you cannot pay disbands 1 warband from your largest stack.</p>' +
        '<h3>The first round</h3><p>The truce: in the first round no house may attack another house’s land or warbands. Each house may take one unclaimed region held only by folk: assault it, or march in if no folk are left.</p>' +
        '<h3>The age ends</h3><p>After round ' + N.lastRound + ' at the latest. After round ' + N.endDraws[0].round + ' there is a 1 in ' + N.endDraws[0].of + ' chance it ends early.</p>';
    });
  };

  // ---------------------------------------------------------------- title
  U.renderTitle = function () {
    var c = U.c, save = H.hasSave() && c;
    var where = '';
    if (save) {
      var sc = H.screenFor(c);
      where = c.age ? E.ageTitle(c.age.ageNo) + (sc === 'age' ? (c.age.phase === 'prophecy' ? ', choosing prophecies' : ', round ' + c.age.round) : sc === 'end' ? ', ended' : sc === 'reckon' ? ', the Reckoning' : ', in the Annals') : '';
    }
    // Ryan's painted valley when it has loaded, else the drawn woodcut; the name, a letterpress wordmark cut from
    // the mock-up, sits below it on the paper. The heraldry belongs to the frame: small shields on the border beside
    // the picture and the tagline, the lion and stag on scroll flourishes growing out of it (art/ui-herald-*.png).
    var hero = A.paintedUrl && A.paintedUrl('title');
    return '<div class="screen title-screen"><div class="titleblock"><div class="title-art' + (hero ? ' painted' : '') + '">' +
      (hero ? '<img src="' + hero + '" alt="A painted valley: a river winding past a castle to the sea">' : titleArt()) +
      '<i class="hd pale-l"></i><i class="hd pale-r"></i></div>' +
      '<h1 class="gametitle"><img src="art/ui-wordmark.png" alt="Writ &amp; Ruin" width="1056" height="160"></h1>' +
      '<div class="herald"><i class="hd shield-l"></i>' +
      '<p class="tagline">A valley of eight regions, fought over by four houses. Whoever wins an age writes its law, which carries into the next age along with any grudges.</p>' +
      '<i class="hd shield-r"></i><i class="hd lion"></i><i class="tdivider"></i><i class="hd stag"></i></div></div>' +
      '<div class="menu">' +
      (save ? btn(ticon('crown') + 'Continue <small>' + esc(where) + '</small>', function () { U.go(H.screenFor(U.c)); }, { cls: 'plank green big' }) : '') +
      btn(ticon('quill') + 'New campaign', function () {
        if (!save) { U.newCampaign(); return; }
        U.openSheet(function () {
          return '<h2>Start a new campaign?</h2><p>Your current campaign and its Annals will be lost.</p><div class="row">' +
            btn('Start anew', function () { U.closeSheet(); U.newCampaign(); }, { cls: 'red' }) + btn('Keep my campaign', function () { U.closeSheet(); }) + '</div>';
        });
      }, { cls: save ? 'plank tan' : 'plank green big' }) +
      btn(ticon('book') + 'The Annals', function () { U.annalsFrom = 'title'; U.go('annals'); }, { cls: 'plank', off: save && c.annals.length ? null : 'No age has been recorded yet.' }) +
      btn(ticon('scroll') + 'How to win', function () { U.helpSheet(); }, { cls: 'plank' }) + '</div></div>';
  };
  // a cut woodcut icon at the left end of a plank button (style.css .plank-icon)
  function ticon(name) { return '<i class="plank-icon pi-' + name + '" aria-hidden="true"></i>'; }
  function titleArt() {
    var P = A.PAL;
    return '<svg viewBox="0 0 300 120" class="woodcut" aria-hidden="true">' +
      '<rect x="3" y="3" width="294" height="114" fill="' + P.bone + '"/>' +
      '<path d="M6 92Q60 58 110 80T210 70T296 82V114H6Z" fill="' + P.moss + '" transform="translate(2 1)"/>' +
      '<path d="M6 100Q70 80 140 96T296 92V114H6Z" fill="' + P.ochre + '" transform="translate(-2 1)"/>' +
      '<path d="M150 74V44H158V36H166V44H174V36H182V44H190V74Z" fill="' + P.ink + '"/>' +
      '<path d="M60 24q30 -8 60 0M200 18q30 -6 70 2M30 40q20 -4 40 0" stroke="' + P.ink + '" stroke-width="2" fill="none"/>' +
      '<circle cx="246" cy="34" r="12" fill="' + P.rust + '" transform="translate(2 -1)"/><circle cx="246" cy="34" r="12" fill="none" stroke="' + P.ink + '" stroke-width="2.5"/>' +
      '<path d="M6 92Q60 58 110 80T210 70T296 82M6 100Q70 80 140 96T296 92" stroke="' + P.ink + '" stroke-width="2.5" fill="none"/>' +
      '<rect x="3" y="3" width="294" height="114" fill="none" stroke="' + P.ink + '" stroke-width="5"/></svg>';
  }

  // ---------------------------------------------------------------- end of the age
  function howWords(c, winner, how, round, s) {
    var W = winner ? (winner === 'player' ? 'You' : c.houses[winner].name) : null, rw = ' in the ' + ordinal(round || 1) + ' round';
    if (!winner) return 'The age ended with no house in the Crown hold. No one wins it.';
    if (how === 'seize') return W + (winner === 'player' ? ' held ' : ' held ') + N.seizeRegions + ' regions and seized the valley' + rw + '.';
    if (how === 'foretell') {
      var pt = s && s.houses[winner] && s.houses[winner].prophecy ? prophecyText(s.houses[winner].prophecy) : '';
      return W + ' fulfilled ' + (winner === 'player' ? 'your' : 'its') + ' prophecy' + rw + (pt ? ': “' + pt + '”' : '.');
    }
    if (how === 'depart') return W + ' departed by the Far Pass' + rw + ' and founded a free hold beyond it.';
    if (how === 'seat') return 'No house won outright, and ' + (winner === 'player' ? 'you' : W) + ' held the Crown hold when the age ended' + rw + '.';
    return W + ' won the age.';
  }
  U.renderEnd = function () {
    var c = U.c, s = c.age, w = s.winner;
    var head = !w ? 'No house won the age' : w === 'player' ? 'You won the age!' : c.houses[w].name + ' won the age';
    return '<div class="screen end-screen"><h1>' + esc(E.ageTitle(s.ageNo)) + ' is over</h1>' +
      '<div class="banner ' + (w === 'player' ? 'won' : 'lost') + '">' + (w ? stamp(w, 48) : '') + '<div><h2>' + esc(head) + '</h2><p>' + esc(howWords(c, w, s.winType, s.endRound || s.round, s)) + '</p></div></div>' +
      '<div class="mapframe small">' + M.svg(s, {}) + '</div>' +
      '<p>' + (w === 'player' ? 'Now the Reckoning. You may build or raze a structure, or raise or raze a great work. Then you change the world deck and write a law for the ages to come.' :
        w ? 'Now the Reckoning. ' + esc(c.houses[w].name) + ' may build or raze a structure, or raise or raze a great work. Then it changes the world deck and writes a law for the ages to come.' : 'With no winner there is no Reckoning to make. The age goes into the Annals as it stands.') + '</p>' +
      '<div class="row">' + btn(w ? 'Begin the Reckoning' : 'Write it in the Annals', function () {
        E.beginReckoning(c); U.rk = null; H.save(); U.go(H.screenFor(c));
      }, { cls: 'go big' }) + '</div></div>';
  };

  // ---------------------------------------------------------------- the Reckoning
  function describeAiChoice(c, o, ch) {
    var W = cap(c.houses[c.reckoning.winner].short);
    if (o.step === 'build') {
      if (!ch || ch.kind === 'none') return W + ' leaves the valley as it stands.';
      var wk = D.WORK[ch.work || (c.world.works || {})[ch.region]];
      if (ch.kind === 'work') return W + ' raises the ' + wk.name + ' at ' + rn(ch.region) + '.';
      if (ch.kind === 'razeWork') return W + ' razes the ' + wk.name + ' at ' + rn(ch.region) + '.';
      return W + (ch.kind === 'raze' ? ' razes the ' : ' builds the ') + REG[ch.region].site + ' at ' + rn(ch.region) + '.';
    }
    if (o.step === 'banish') return W + ' banishes ' + listAnd((ch.banish || []).map(cardName)) + ' from the world, and admits ' + listAnd((ch.admit || []).map(cardName)) + '.';
    if (o.step === 'law') return W + ' writes the law of ' + D.LAW[ch.law].name + ': ' + D.LAW[ch.law].text;
    return '';
  }
  var STEP_NAME = { build: 'I. The valley', banish: 'II. The world deck', law: 'III. The law' };
  var STEP_ORDER = ['build', 'banish', 'law'];
  // the step's heading: its numeral in an ink badge, then its name
  function stepHead(k) {
    var m = STEP_NAME[k].match(/^(\w+)\. (.*)$/);
    return '<h2 class="rk-h"><span class="rk-num">' + m[1] + '</span> ' + m[2] + '</h2>';
  }
  // the running count of a step as a chip, ochre once it is complete
  function chip(label, have, need) {
    return '<span class="rk-chip' + (have >= need ? ' full' : '') + '">' + label + ' <b>' + have + '/' + need + '</b></span>';
  }
  U.renderReckoning = function () {
    var c = U.c, R = c.reckoning, o = E.reckoningOptions(c), w = R.winner, mine = w === 'player';
    var out = ['<div class="screen reckon-screen"><h1>The Reckoning</h1><p class="muted">' + esc(howWords(c, w, R.how, R.round, c.age)) + '</p>',
      '<ol class="steps">' + STEP_ORDER.map(function (k) {
        var now = k === o.step, done = STEP_ORDER.indexOf(k) < STEP_ORDER.indexOf(o.step);
        return '<li class="' + (now ? 'now' : done ? 'done' : '') + '"' + (now ? ' aria-current="step"' : '') + '>' + STEP_NAME[k] + '</li>';
      }).join('') + '</ol>'];
    if (!mine) {
      var ch = U.rkAi && U.rkAi.step === o.step ? U.rkAi.choice : null;
      if (!ch) { ch = AI.reckoningChoice(c); U.rkAi = { step: o.step, choice: ch }; }
      out.push('<section class="panel">' + stamp(w, 36) + stepHead(o.step) + '<p class="bigtext">' + esc(describeAiChoice(c, o, ch)) + '</p>');
      if (o.step === 'build' && ch && ch.region && (ch.kind === 'work' || ch.kind === 'razeWork')) {
        var rw = D.WORK[ch.work || (c.world.works || {})[ch.region]];
        out.push('<p class="rkart">' + A.art('work/' + rw.id, { size: 64 }) + '<span><b>' + esc(rw.name) + '</b> at ' + rn(ch.region) + '. ' + esc(rw.text) + '</span></p>');
      } else if (o.step === 'build' && ch && ch.region) {
        var rkUrl = A.paintedUrl && A.paintedUrl('site-' + ch.region), rkCap = '<b>' + esc(REG[ch.region].site) + '</b> at ' + rn(ch.region);
        out.push(rkUrl ? '<figure class="rkart painted"><img src="' + rkUrl + '" alt="' + esc(REG[ch.region].site) + '" width="480" height="358" loading="lazy"><figcaption>' + rkCap + '</figcaption></figure>' :
          '<p class="rkart">' + A.art('site/' + ch.region, { size: 64 }) + rkCap + '</p>');
      }
      if (o.step === 'banish' && ch) {
        if ((ch.banish || []).length) out.push('<h3>Banished</h3><div class="cards">' + ch.banish.map(function (id) { return A.card(id, ''); }).join('') + '</div>');
        if ((ch.admit || []).length) out.push('<h3>Admitted</h3><div class="cards">' + ch.admit.map(function (id) { return A.card(id, ''); }).join('') + '</div>');
      }
      if (o.step === 'build') out.push(startsHtml(c));
      if (o.step === 'law' && c.world.laws.length >= o.max) out.push('<p class="rk-hint">Only ' + o.max + ' laws stand at once: the oldest, ' + D.LAW[c.world.laws[0]].name + ', lapses.</p>');
      out.push(btn('Go on', function () { applyRk(ch); }, { cls: 'go big' }) + '</section>');
    } else out.push(playerRk(c, o));
    out.push('</div>');
    return out.join('');
  };
  function applyRk(ch) {
    var c = U.c;
    try { E.reckoningChoose(c, ch); } catch (e) { toast(plain(e.message)); return; }
    U.rk = null; U.rkAi = null; H.save();
    if (c.reckoning.step === 'done') U.go('annals'); else { U.render(); window.scrollTo(0, 0); }
  }
  // where each house starts next age, one line a house
  function startsHtml(c) {
    var lines = E.startLines(c);
    return lines.length ? '<h3>Next age</h3><ul class="starts">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '';
  }
  function playerRk(c, o) {
    U.rk = U.rk && U.rk.step === o.step ? U.rk : { step: o.step, pick: null, banish: [], admit: [] };
    var rk = U.rk, out = ['<section class="panel">' + stepHead(o.step)];
    if (o.step === 'build') {
      var g = E.reckoningGroups(o), pick = rk.pick && g.raise.filter(function (x) { return x.work === rk.pick; })[0];
      var where = function (r) { var tg = E.startTag(c, r); return ' <small>' + esc(cap(rn(r))) + (tg ? ' · ' + esc(tg) : '') + '</small>'; };
      if (pick) {
        // step two of raising a work: where it goes
        var wk = D.WORK[pick.work];
        out.push('<p class="rkart">' + A.art('work/' + wk.id, { size: 48 }) + '<span><b>Raise the ' + esc(wk.name) + '.</b> ' + esc(wk.text) + '</span></p>' +
          '<h3>Choose a region</h3><p class="rk-hint">Regions with a great work already are left out.' +
          ((wk.barred || []).indexOf('crown') >= 0 ? ' The ' + esc(wk.name) + " can't stand in the Crown hold: its castle has walls enough." : '') + '</p><div class="actlist">');
        pick.regions.forEach(function (r) {
          var tg = E.startTag(c, r);
          out.push(btn(A.art('site/' + r, { size: 20 }) + ' ' + esc(cap(rn(r))) + (tg ? ' <small>' + esc(tg) + '</small>' : ''), function () { applyRk({ kind: 'work', region: r, work: wk.id }); }));
        });
        out.push('</div><div class="row">' + btn('Back', function () { rk.pick = null; U.render(); }) + '</div>');
      } else {
        out.push('<p class="rk-lead">Make one change to the valley. It lasts into the ages to come.</p><p class="rk-hint">' + (g.raise.length ? 'You may raise a great work in any region. ' +
          'It helps whoever holds that region. A region holds one work at most. ' : 'All six great works stand. None is left to raise. ') +
          'You may also build or raze a structure, or raze a great work. The Citadel and the Waystone always stand. ' +
          'Or leave the valley as it is.</p>');
        out.push(startsHtml(c));
        if (g.raise.length) {
          out.push('<h3>Raise a great work</h3><div class="actlist">');
          g.raise.forEach(function (x) {
            var w = D.WORK[x.work];
            out.push(btn(A.art('work/' + w.id, { size: 28 }) + ' <span><b>' + esc(w.name) + '</b> <small>' + esc(w.text) + '</small></span>', function () { rk.pick = w.id; U.render(); window.scrollTo(0, 0); }, { cls: 'work' }));
          });
          out.push('</div>');
        }
        if (g.build.length) {
          out.push('<h3>Build a structure</h3><div class="actlist">');
          g.build.forEach(function (op) { out.push(btn(A.art('site/' + op.region, { size: 20 }) + ' Build the ' + esc(REG[op.region].site) + where(op.region), function () { applyRk(op); })); });
          out.push('</div>');
        }
        if (g.raze.length) {
          out.push('<h3>Raze a structure</h3><div class="actlist">');
          g.raze.forEach(function (op) { out.push(btn(A.art('site/' + op.region, { size: 20 }) + ' Raze the ' + esc(REG[op.region].site) + where(op.region), function () { applyRk(op); }, { cls: 'red' })); });
          out.push('</div>');
        }
        if (g.razeWork.length) {
          out.push('<h3>Raze a great work</h3><div class="actlist">');
          g.razeWork.forEach(function (op) { out.push(btn(A.art('work/' + op.work, { size: 20 }) + ' Raze the ' + esc(D.WORK[op.work].name) + where(op.region), function () { applyRk(op); }, { cls: 'red' })); });
          out.push('</div>');
        }
        out.push('<div class="actlist">' + btn('Leave the valley as it is', function () { applyRk({ kind: 'none' }); }, { cls: 'go' }) + '</div>');
      }
    } else if (o.step === 'banish') {
      var needB = Math.min(o.banish, o.deck.length), needA = o.admit;
      var tally = '<p class="rk-tally"><span class="lbl">Chosen</span>' + chip('Banished', rk.banish.length, needB) + chip('Admitted', rk.admit.length, needA) + '</p>';
      out.push('<p class="rk-lead">Banish ' + needB + ' cards from the world deck for good, and admit ' + needA + ' from the Vault.</p><p class="rk-hint">Relics can't be banished.</p>' + tally);
      out.push('<h3>Admit from the Vault</h3><div class="cards">' + o.offer.map(function (id) {
        var on = rk.admit.indexOf(id) >= 0;
        return A.card(id, '<div class="row">' + btn(on ? 'Admitted ✓' : 'Admit', function () { toggle(rk.admit, id, needA); }, { cls: on ? 'active' : '' }) + '</div>', { pic: 'full' });
      }).join('') + '</div>');
      out.push('<h3>Banish from the world deck</h3><div class="cards">' + o.deck.map(function (id) {
        var on = rk.banish.indexOf(id) >= 0;
        return A.card(id, '<div class="row">' + btn(on ? 'Banished ✗' : 'Banish', function () { toggle(rk.banish, id, needB); }, { cls: on ? 'red active' : '' }) + '</div>');
      }).join('') + '</div>');
      var ready = rk.banish.length === needB && rk.admit.length === needA;
      // the count again beside Confirm, at the foot of the lists; the row is not sticky, so it never covers a card
      out.push('<div class="rk-foot">' + tally + '<div class="row">' + btn('Confirm', function () { applyRk({ banish: rk.banish, admit: rk.admit }); }, { cls: 'go big', off: ready ? null : 'Choose ' + needB + ' to banish and ' + needA + ' to admit.' }) + '</div></div>');
    } else if (o.step === 'law') {
      out.push('<p class="rk-lead">Write one law. It holds in every age to come until it lapses.</p><p class="rk-hint">Up to ' + o.max + ' laws stand at once.</p>');
      if (o.standing.length) out.push('<p class="rk-tally"><span class="lbl">Standing</span>' + o.standing.map(function (id) { return '<span class="rk-chip">' + esc(D.LAW[id].name) + '</span>'; }).join('') + '</p>' +
        (o.standing.length >= o.max ? '<p class="rk-hint">The oldest, ' + esc(D.LAW[o.standing[0]].name) + ', will lapse.</p>' : ''));
      out.push('<div class="actlist">' + o.options.map(function (id) {
        return '<div class="choice"><b>' + esc(D.LAW[id].name) + '</b><p>' + esc(D.LAW[id].text) + '</p>' + btn('Write this law', function () { applyRk({ law: id }); }, { cls: 'go' }) + '</div>';
      }).join('') + '</div>');
    }
    out.push('</section>');
    return out.join('');
  }
  function toggle(arr, id, max) {
    var i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else if (arr.length < max) arr.push(id);
    else { toast('You have chosen ' + max + ' already. Tap one to undo it.'); return; }
    U.render();
  }

  // ---------------------------------------------------------------- the Annals
  U.renderAnnals = function () {
    var c = U.c, done = c && c.reckoning && c.reckoning.step === 'done' && c.age && c.age.phase === 'over';
    var out = ['<div class="screen annals-screen"><h1>The Annals</h1>'];
    if (!c || !c.annals.length) out.push('<p class="muted">No age has been recorded yet.</p>');
    else out.push('<ol class="annals">' + c.annals.slice().reverse().map(function (en) {
      return '<li class="entry">' + A.art('annals/' + en.age, en) + '<div><h2>' + esc(en.title) + '</h2><p class="muted">' +
        (en.winner ? (en.winner === 'player' ? 'You' : esc(c.houses[en.winner].name)) + ', by ' + ({ seize: 'seizing the valley', foretell: 'prophecy', depart: 'departing', seat: 'the Seat' }[en.how] || en.how) : 'No winner') + '</p><p>' + esc(en.text) + '</p></div></li>';
    }).join('') + '</ol>');
    if (done) {
      var R = c.reckoning, seat = (R.events || []).filter(function (e) { return e.type === 'reckonSeat'; })[0];
      if (seat) out.push('<section class="panel"><h3>The next age</h3><p>' + (seat.ruler ? who(seat.ruler) + (seat.ruler === 'player' ? ' begin' : ' begins') + ' in the Crown hold.' : 'The Crown hold begins empty.') +
        ' Your rivals: ' + listAnd(seat.rivals.map(function (h) { return c.houses[h].name.replace(/^The /, 'the '); })) + '.' + (seat.freeHold ? ' ' + (seat.freeHold === 'player' ? 'Your' : c.houses[seat.freeHold].name + "'s") + ' free hold stands at the Far Pass.' : '') +
        (seat.ruler !== 'player' && seat.freeHold !== 'player' && c.holdfast && c.holdfast.player ? ' Your holdfast is ' + rn(c.holdfast.player) + '. You begin there if it is free.' : '') + '</p>' +
        (c.world.laws.length ? '<p class="muted">Laws: ' + c.world.laws.map(function (id) { return D.LAW[id].name; }).join(', ') + '.</p>' : '') + '</section>');
      out.push('<div class="row">' + btn('Begin ' + E.ageTitle(c.ageNo + 1).replace(/^The/, 'the'), function () { U.nextAge(); }, { cls: 'go big' }) + '</div>');
    }
    if (U.annalsFrom && !done) out.push('<div class="row">' + btn('Back', function () { var f = U.annalsFrom; U.annalsFrom = null; U.go(f === 'title' ? 'title' : H.screenFor(U.c)); }) + '</div>');
    out.push('</div>');
    return out.join('');
  };
})(typeof self !== 'undefined' ? self : this);
