/* Writ & Ruin: dialogs and the screens around the age (title, end of age, the Reckoning, the Annals).
 * Adds to window.WR_UI from ui.js.
 */
(function (root) {
  'use strict';
  var D = root.WR_DATA, E = root.WR_ENGINE, AI = root.WR_AI, A = root.WR_ART, M = root.WR_MAP, U = root.WR_UI;
  var N = D.NUM, REG = D.REGION, IDS = D.REGION_IDS, H = U.h;
  var esc = H.esc, cap = H.cap, age = H.age, who = H.who, whoLow = H.whoLow, rn = H.rn, cardName = H.cardName,
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
        t.push(owned ? 'You hold ' + rn(to) + '.' : (s.regions[to].owner ? 'Held by ' + whoLow(s.regions[to].owner) + '.' : 'No house holds it: you take it when you march in.'));
        if (mode === 'hermit') t.push('The Antlered Hermit lets you pass the free folk.');
        if (mode === 'smuggle') t.push('The Smuggler Queen slips you in past a lone warband.');
        t.push('Costs 1 moon' + (E.law(s, 'tolls') && !owned ? ' and 1 silver toll' : '') + '.');
        if (from !== 'camp' && n === max && E.holds(s, 'player', from) && s.regions[from].owner === 'player') t.push('Leaving ' + rn(from) + ' empty: you will no longer hold it.');
        return '<p>' + t.join(' ') + '</p>';
      },
      action: function (n) { return { type: 'march', from: from, to: to, count: n }; },
      label: 'March'
    });
  }
  function musterSheet(r) {
    var s = age(), hs = me(), max = E.musterMax(s, 'player');
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
  function assaultSheet(from, to) {
    var s = age(), hs = me(), max = from === 'camp' ? hs.camp : E.bandsAt(s, 'player', from);
    var n = max;
    function build() {
      var a = { type: 'assault', house: 'player', from: from, to: to, count: n };
      var m = E.check(s, a), pv = E.battlePreview(s, a), o = winOdds(s, a), p = o.p, extra = [];
      if (o.tide) extra.push('Your Tide Reader draws two cards for you. You keep the higher.');
      if (o.attWitch) extra.push('Your Heron Witch can redraw your card once if you are losing.');
      if (o.defWitch) extra.push(who(o.defWitch) + "'s Heron Witch can redraw their card once if they are losing.");
      var left = E.fortuneLeft(s), broke = E.pactsBrokenBy(s, 'player', pv.defender);
      var g = s.regions[to], defBands = pv.defender ? E.bandsAt(s, pv.defender, to) : g.folk;
      return '<h2>Assault ' + rn(to) + '</h2><p>From ' + rn(from) + '. ' + (pv.defender ? 'Held by <b>' + who(pv.defender) + '</b> with ' + plural(defBands, 'warband') + '.' : 'Defended by ' + plural(g.folk, 'band') + ' of free folk.') + '</p>' +
        '<div class="stepper">' + btn('−', function () { if (n > 1) { n--; U.redrawSheet(); } }, { cls: 'step', off: n <= 1 ? 'That is the fewest.' : null, title: 'Fewer' }) +
        '<span class="stepn"><b>' + n + '</b><small>' + (n === 1 ? 'warband' : 'warbands') + '</small></span>' +
        btn('+', function () { if (n < max) { n++; U.redrawSheet(); } }, { cls: 'step', off: n >= max ? 'That is all you have there.' : null, title: 'More' }) + '</div>' +
        '<div class="versus"><div class="vs-side"><span class="lbl">Your attack</span><b class="big">' + pv.attack + '</b></div><span class="vs">against</span>' +
        '<div class="vs-side"><span class="lbl">Their defence</span><b class="big">' + pv.defence + '</b></div></div>' +
        '<p>Each side then draws a fortune card (0 to 3) and adds it. You draw first. A tie goes to the defender.</p>' +
        (pv.lastStand ? '<p class="note"><b>Last stand:</b> this is ' + whoLow(pv.defender) + "'s only region, so it defends with +" + pv.lastStand + '. That is counted above.</p>' : '') +
        (pv.peek != null ? '<p class="note"><b>Star Reader:</b> the next fortune card is a <b>' + pv.peek + '</b>. You will draw it.</p>' : '') +
        '<p class="fortune-line"><span class="lbl">Fortune left</span> ' + [0, 1, 2, 3].map(function (v) { return '<span class="fc"><b>' + v + '</b>×' + (left[v] || 0) + '</span>'; }).join('') +
        (s.fortune.length ? '' : ' <span class="muted">(the deck reshuffles first)</span>') + '</p>' +
        '<p class="odds">Chance to win: <b>' + oddsWords(p) + '</b></p>' +
        (extra.length ? '<p class="note">' + esc(extra.join(' ')) + ' That is counted in the chance.</p>' : '') +
        '<p>Costs ' + plural(E.assaultHours(s, 'player', to), 'moon') + '.</p>' +
        (broke.length ? '<p class="warn">This breaks your ' + broke.map(function (pc) { return pc.type === 'foe' ? 'common cause' : pc.type; }).join(' and ') + ' with ' + whoLow(pv.defender) + '. They will hold a grudge.</p>' : '') +
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
    U.openSheet(function () {
      return '<h2>Choose your prophecy</h2><p>Fulfil it from the ' + ordinal(N.claimFrom) + ' round on and the age is yours. The rivals choose theirs in secret; yours is secret too.</p>' +
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
    var s = age(), P = s.pending;
    U.openSheet(function () {
      return '<h2>' + stamp(P.from, 28) + ' An offer from ' + who(P.from) + '</h2><p>' + esc(offerWords(P.offer)) + '</p>' +
        '<p class="muted">Breaking a pact is allowed, but the wronged house holds a grudge.</p>' +
        '<div class="row">' + btn('Accept', function () { U.closeSheet(); U.doAction({ type: 'respond', accept: true }); }, { cls: 'go' }) +
        btn('Refuse', function () { U.closeSheet(); U.doAction({ type: 'respond', accept: false }); }) + '</div>';
    }, { modal: true });
  };
  U.keepDialog = function () {
    var s = age();
    U.openSheet(function () {
      var P = s.pending, hs = me();
      if (!P || P.type !== 'search') return '<p>Nothing to keep.</p>';
      var ls = U.lastSearch, barrow = ls && ls.barrowRelics && ls.barrowRelics.length ? ls.barrowRelics : [];
      var slotsFree = E.slotsOf(s, P.region) - s.regions[P.region].residents.length;
      return '<h2>You searched ' + rn(P.region) + '</h2><p>Keep ' + plural(P.keep, 'card') + ' of these. The rest go back into the world deck.' +
        ' Your retinue holds ' + hs.retinue.length + ' of ' + N.retinueMax + '; the site has ' + plural(Math.max(0, slotsFree), 'empty slot') + '.</p>' +
        (barrow.length ? '<p class="note">The barrow gave up ' + listAnd(barrow.map(cardName)) + ' as well. ' + (barrow.length === 1 ? 'It is' : 'They are') + ' already yours.</p>' : '') +
        '<div class="cards">' + P.cards.map(function (id) {
          var relic = D.CARDS[id].relic, ac = [];
          if (relic) ac.push(btn('Take the relic', function () { U.doAction({ type: 'keep', card: id, to: 'retinue' }); }, { cls: 'go', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'retinue' }) }));
          else {
            if (!D.CARDS[id].siteOnly) ac.push(btn('To your retinue', function () { U.doAction({ type: 'keep', card: id, to: 'retinue' }); }, { cls: 'go', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'retinue' }) }));
            ac.push(btn('Leave at the site', function () { U.doAction({ type: 'keep', card: id, to: 'site' }); }, { cls: D.CARDS[id].siteOnly ? 'go' : '', off: E.check(s, { type: 'keep', house: 'player', card: id, to: 'site' }) }));
          }
          return A.card(id, (D.CARDS[id].siteOnly ? '<p class="note">Works only at its site. It does nothing in a retinue.</p>' : '') + '<div class="row">' + ac.join('') + '</div>');
        }).join('') + '</div>' +
        '<p class="muted">A resident left at the site can be recruited later by whoever has warbands there.</p>' +
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
    U.openSheet(function () { return regionHtml(r); }, { wide: true, onClose: function () { U.selected = null; } });
    U.render();
  };
  function cand(a) { a.house = 'player'; return E.check(age(), a); }
  function regionHtml(r) {
    var s = age(), hs = me(), my = H.isMyTurn(s), legal = H.legalNow(s), mode = U.mode && U.mode.kind;
    if (r === 'camp') return campHtml(s, hs, my, legal);
    var g = s.regions[r], R = REG[r], owner = g.owner, built = E.siteOn(s, r);
    var out = [];
    out.push('<header class="rhead"><span class="sitebox' + (built ? '' : ' unbuilt') + '">' + A.art('site/' + r, { size: 40 }) + '</span><div><h2>' + esc(R.name) + '</h2><p class="muted">' +
      (owner ? 'Held by ' + who(owner) : 'Free folk: ' + plural(g.folk, 'band')) + (R.landmark ? ' · a landmark' : built ? '' : ' · undeveloped') + '</p></div></header>');
    out.push('<p class="sitetext"><b>' + esc(R.site) + '.</b> ' + (built ? esc(R.siteText) + (R.landmark ? ' It is a landmark. It always stands.' : ' It works for whoever holds the region.') :
      'Not built yet. The region has no effect, no site income and 1 slot. Whoever holds it may build the ' + esc(R.site) + ' for ' + E.buildCost(r) + ' silver and 1 moon. Built, it gives: ' + esc(R.siteText)) + '</p>');
    var defAgainst = owner === 'player' ? s.order.filter(function (k) { return k !== 'player'; })[0] : 'player';
    var facts = [];
    var bandList = Object.keys(g.bands).filter(function (k) { return g.bands[k] > 0; });
    if (bandList.length) facts.push('Warbands: ' + bandList.map(function (k) { return stamp(k, 16) + ' ' + who(k) + ' ' + g.bands[k]; }).join(', '));
    facts.push('Defence ' + E.defenceOf(s, r, defAgainst) + (owner && E.lastStand(s, r) ? ' (with last stand)' : ''));
    if (owner && s.houses[owner].refuge === r) facts.push('<b>Safe:</b> ' + who(owner) + ' returned here and cannot be assaulted here until its next turn.');
    facts.push('Neighbours: ' + R.adj.map(rn).join(', '));
    out.push('<p class="facts">' + facts.join('<br>') + '</p>');
    // residents
    var slots = E.slotsOf(s, r);
    out.push('<h3>Residents <small>' + g.residents.length + ' of ' + slots + ' slots</small></h3>');
    if (!g.residents.length) out.push('<p class="muted">No one lives here now. Searching can find someone.</p>');
    else out.push('<div class="cards">' + g.residents.map(function (id) {
      var a = { type: 'recruit', region: r, card: id }, m = my ? cand(a) : 'not your turn';
      var cost = E.recruitCost(s, 'player', id);
      var show = my && E.bandsAt(s, 'player', r) > 0;
      if (D.CARDS[id].siteOnly) return A.card(id, '<p class="muted">Works only at its site' + (g.owner === 'player' ? ': it guards your region.' : ', for whoever holds the region.') + ' It cannot be recruited.</p>');
      return A.card(id, show ? '<div class="row">' + btn('Recruit for ' + cost + 's', function () { U.doAction({ type: 'recruit', region: r, card: id }); }, { cls: mode === 'recruit' ? 'go' : '', off: m }) + '</div>' : '');
    }).join('') + '</div>');
    if (!my) {
      out.push(U.busy ? '<p class="muted">A rival is moving. You can act on your turn.</p>' : '');
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
      if (!built) acts.push(['build', btn('Build the ' + esc(R.site) + ' <small>' + E.buildCost(r) + 's, 1 moon</small>', function () { U.doAction({ type: 'build', region: r }); }, { cls: 'go', off: cand({ type: 'build', region: r }) })]);
      if (!hs.flags.returnDue) hs.retinue.forEach(function (id) {
        if (D.CARDS[id].relic) return;
        acts.push(['station', btn('Station ' + esc(D.CARDS[id].name) + ' here <small>1 moon</small>', function () { U.doAction({ type: 'station', region: r, card: id }); }, { cls: mode === 'station' ? 'go' : '', off: cand({ type: 'station', region: r, card: id }) })]);
      });
    }
    var mine = E.bandsAt(s, 'player', r);
    if (mine > 0) {
      var dests = E.marchDests(s, 'player', r), seen = {};
      dests.forEach(function (d) {
        seen[d.to] = 1;
        var m = cand({ type: 'march', from: r, to: d.to, count: 1 });
        acts.push(['march', btn('March to ' + rn(d.to) + (d.via ? ' <small>via ' + rn(d.via) + '</small>' : '') + '…', function () { marchSheet(r, d.to); }, { off: m })]);
      });
      R.adj.forEach(function (to) {
        var a = { type: 'assault', from: r, to: to, count: mine }, m = cand(a);
        if (E.holds(s, 'player', to)) return;
        if (E.emptyOfOthers(s, 'player', to)) {
          if (!seen[to]) { var mq = cand({ type: 'march', from: r, to: to, count: 1 }); acts.push(['march', btn('March to ' + rn(to) + '…', function () { marchSheet(r, to); }, { off: mq || 'cannot march there' })]); }
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
        if (a.type === 'march') acts.push(['march', btn('March in from ' + rn(from) + '…', function () { marchSheet(from, r); })]);
        else acts.push(['assault', btn('Assault from ' + rn(from) + '…', function () { assaultSheet(from, r); }, { cls: 'red' })]);
      }
    });
    if (r === 'farpass') {
      var md = cand({ type: 'depart' }), need = E.departNeeds(s, 'player');
      acts.push(['depart', '<p class="muted">To depart: hold the Far Pass with ' + need.bands + ' warbands from the start of your turn and carry ' + plural(need.relics, 'relic') + '. You have ' + hs.relics.length + '. It opens in the ' + ordinal(N.departFrom) + ' round.</p>']);
      acts.push(['depart', btn('Depart by the Far Pass', function () { U.departConfirm(); }, { cls: 'go', off: md })]);
    }
    if (!acts.length) {
      out.push('<p class="muted">' + (mine ? 'Nothing more to do here this turn.' : "You have no warbands here or next to it. March in from a neighbour.") + '</p>');
      return out.join('');
    }
    // the current mode first
    if (mode) acts.sort(function (x, y) { return (y[0] === mode) - (x[0] === mode); });
    out.push('<h3>Actions <small>' + plural(hs.hours, 'moon') + ', ' + hs.silver + ' silver</small></h3><div class="actlist">' + acts.map(function (x) { return x[1]; }).join('') + '</div>');
    if (E.truce(s) && acts.some(function (x) { return x[0] === 'assault'; })) out.push('<p class="muted">' + esc(plain(E.truce(s))) + '</p>');
    return out.join('');
  }
  function campHtml(s, hs, my, legal) {
    var out = ['<header class="rhead"><span class="sitebox">' + A.art('site/farpass', { size: 40 }) + '</span><div><h2>The camp beyond the Far Pass</h2></div></header>'];
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
        plural(hs.hours && s.order[s.turn] === h ? hs.hours : E.hoursFor(s, h), 'moon') + ' a turn' + (hs.camp ? ' · ' + hs.camp + ' camped' : '') +
        '<br>Income ' + E.income(s, h) + ' silver a turn · upkeep ' + E.upkeep(s, h) + ' silver a turn' +
        (function () {
          var st = D.REGION_IDS.filter(function (r) { return E.holds(s, h, r) && E.siteOn(s, r); }).map(function (r) { return REG[r].site; });
          return '<br>Structures: ' + (st.length ? esc(listAnd(st)) : 'none');
        })() + '</p>');
      out.push('<div class="progress">' + ['seize', 'foretell', 'depart', 'seat'].map(function (k) {
        var words = { seize: 'Seize: hold ' + N.seizeRegions + ' regions', foretell: 'Foretell: fulfil the prophecy', depart: 'Depart by the Far Pass', seat: 'Seat: hold the Crown hold when the age ends' }[k];
        return '<div class="prow"><span>' + words + '</span><span class="pbar b-' + k + '"><i style="width:' + Math.round(Math.min(1, p[k]) * 100) + '%"></i></span></div>';
      }).join('') + '</div>');
      if (claim) out.push('<p class="warn">' + (mine ? 'You have' : who(h) + ' has') + ' a claim to ' + (claim.kind === 'seize' ? 'seize the valley' : 'the age by prophecy') +
        (claim.waiting.length ? '. It stands unless ' + listAnd(claim.waiting.map(function (k) { return whoLow(k); })) + ' break it on their turns.' : '. It wins at the start of the next turn.') + '</p>');
      if (mine && hs.prophecy) out.push('<p><span class="lbl">Prophecy</span> “' + esc(prophecyText(hs.prophecy)) + '”</p>');
      else if (!mine) out.push('<p><span class="lbl">Prophecy</span> ' + (meH.known[h] && hs.prophecy ? '“' + esc(prophecyText(hs.prophecy)) + '” (read by your Bell Seer)' : 'Secret. The bar shows how close it seems.') + '</p>');
      out.push('<h3>Retinue</h3>' + (hs.retinue.length ? '<div class="cards">' + hs.retinue.map(function (id) { return A.card(id); }).join('') + '</div>' : '<p class="muted">None.</p>'));
      if (hs.relics.length) out.push('<h3>Relics</h3><div class="cards">' + hs.relics.map(function (id) { return A.card(id); }).join('') + '</div>');
      var pacts = s.pacts.filter(function (pc) { return pc.a === h || pc.b === h; });
      out.push('<h3>Pacts</h3>' + (pacts.length ? '<ul class="rows">' + pacts.map(function (pc) {
        var other = pc.a === h ? pc.b : pc.a;
        var t = pc.type === 'truce' ? 'Truce with ' + whoLow(other) : pc.type === 'tribute' ? who(pc.payer) + ' pays ' + whoLow(pc.payee) + ' tribute' : 'Common cause with ' + whoLow(other) + ' against ' + whoLow(pc.foe);
        return '<li><span>' + esc(t) + (pc.until < 99 ? ' (to the end of round ' + pc.until + ')' : ' (until the age ends)') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted">None.</p>'));
      if (!mine && hs.intent) out.push('<h3>Plan</h3><p>' + esc(E.intentLabel(s, h, hs.intent)) + '.</p>');
      if (!mine && hs.then) out.push('<p>' + esc(E.intentLabel(s, h, hs.then).replace(/^([^:]+): /, '$1, then: ')) + '.</p>');
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
      var out = ['<h2>Treat with a rival</h2><p>Offer one pact a turn. It costs 1 moon. The rival answers at once.</p>'];
      out.push('<div class="row wrap">' + s.order.filter(function (h) { return h !== 'player'; }).map(function (h) {
        return btn(stamp(h, 18) + ' ' + who(h), function () { target = h; U.redrawSheet(); }, { cls: target === h ? 'active' : '' });
      }).join('') + '</div>');
      if (target) {
        var have = E.pactsBetween(s, 'player', target);
        if (have.length) out.push('<p class="muted">Already agreed: ' + have.map(function (p) { return p.type === 'foe' ? 'common cause against ' + whoLow(p.foe) : p.type; }).join(', ') + '.</p>');
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
        '<h3>Your turn</h3><p>You get moons each turn to spend on actions. March (1 moon), muster (1 moon and silver), assault (2 moons), recruit, search and treat. ' +
          'Build a structure in a region you hold (1 moon and silver). Station a resident from your retinue in an empty slot of a region you hold (1 moon). Tap a region to see what you can do there.</p>' +
        '<h3>Structures</h3><p>The Citadel and the Waystone are landmarks. They stand from the start and can never be razed. ' +
          'The other six regions start undeveloped: no effect, no site income and 1 slot. In the first age the Toll Bridge and the Charcoal Kilns already stand. ' +
          'A built structure gives its effect and a second slot. ' +
          'It works for whoever holds the region, and it stands into the ages that follow.</p>' +
        '<h3>Holdfasts</h3><p>When an age ends, each house records its holdfast: the region where it had the most warbands. ' +
          'Next age it starts there. If the ruler or another house has it, the house starts beside it instead. ' +
          'The ruler starts in the Crown hold, with the neighbours of the Crown hold it held at the end of the last age.</p>' +
        '<h3>Silver</h3><p>Each turn starts with income from your regions and sites. Then you pay upkeep: 1 silver for every ' + N.upkeepPer + ' warbands on the board. ' +
        'Each silver you cannot pay disbands 1 warband from your largest stack.</p>' +
        '<h3>The first round</h3><p>No assaults in the first round. You may march only into your own regions, or into a region no one holds or guards.</p>' +
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
    return '<div class="screen title-screen"><div class="titleblock"><div class="title-art">' + titleArt() + '</div>' +
      '<h1 class="gametitle">Writ <span>&amp;</span> Ruin</h1><p class="tagline">A valley of eight regions, four houses and one Crown. Win an age, write its law, and carry the grudges into the next.</p></div>' +
      '<div class="menu">' +
      (save ? btn('Continue <small>' + esc(where) + '</small>', function () { U.go(H.screenFor(U.c)); }, { cls: 'go big' }) : '') +
      btn('New campaign', function () {
        if (!save) { U.newCampaign(); return; }
        U.openSheet(function () {
          return '<h2>Start a new campaign?</h2><p>Your current campaign and its Annals will be lost.</p><div class="row">' +
            btn('Start anew', function () { U.closeSheet(); U.newCampaign(); }, { cls: 'red' }) + btn('Keep my campaign', function () { U.closeSheet(); }) + '</div>';
        });
      }, { cls: save ? '' : 'go big' }) +
      btn('The Annals', function () { U.annalsFrom = 'title'; U.go('annals'); }, { off: save && c.annals.length ? null : 'No age has been recorded yet.' }) +
      btn('How to win', function () { U.helpSheet(); }) + '</div></div>';
  };
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
      '<p>' + (w === 'player' ? 'Now the Reckoning. You may build or raze a structure. Then you change the world deck and write a law for the ages to come.' :
        w ? 'Now the Reckoning. ' + esc(c.houses[w].name) + ' may build or raze a structure. Then it changes the world deck and writes a law for the ages to come.' : 'With no winner there is no Reckoning to make. The age goes into the Annals as it stands.') + '</p>' +
      '<div class="row">' + btn(w ? 'Begin the Reckoning' : 'Write it in the Annals', function () {
        E.beginReckoning(c); U.rk = null; H.save(); U.go(H.screenFor(c));
      }, { cls: 'go big' }) + '</div></div>';
  };

  // ---------------------------------------------------------------- the Reckoning
  function describeAiChoice(c, o, ch) {
    var W = cap(c.houses[c.reckoning.winner].short);
    if (o.step === 'build') {
      if (!ch || ch.kind === 'none') return W + ' leaves the valley as it stands.';
      return W + (ch.kind === 'raze' ? ' razes the ' : ' builds the ') + REG[ch.region].site + ' at ' + rn(ch.region) + '.';
    }
    if (o.step === 'banish') return W + ' banishes ' + listAnd((ch.banish || []).map(cardName)) + ' from the world, and admits ' + listAnd((ch.admit || []).map(cardName)) + '.';
    if (o.step === 'law') return W + ' writes the law of ' + D.LAW[ch.law].name + ': ' + D.LAW[ch.law].text;
    return '';
  }
  var STEP_NAME = { build: 'I. Build or raze', banish: 'II. The world deck', law: 'III. The law' };
  U.renderReckoning = function () {
    var c = U.c, R = c.reckoning, o = E.reckoningOptions(c), w = R.winner, mine = w === 'player';
    var out = ['<div class="screen reckon-screen"><h1>The Reckoning</h1><p class="muted">' + esc(howWords(c, w, R.how, R.round, c.age)) + '</p>',
      '<ol class="steps">' + ['build', 'banish', 'law'].map(function (k) { return '<li class="' + (k === o.step ? 'now' : (['build', 'banish', 'law'].indexOf(k) < ['build', 'banish', 'law'].indexOf(o.step) ? 'done' : '')) + '">' + STEP_NAME[k] + '</li>'; }).join('') + '</ol>'];
    if (!mine) {
      var ch = U.rkAi && U.rkAi.step === o.step ? U.rkAi.choice : null;
      if (!ch) { ch = AI.reckoningChoice(c); U.rkAi = { step: o.step, choice: ch }; }
      out.push('<section class="panel">' + stamp(w, 36) + '<h2>' + STEP_NAME[o.step] + '</h2><p class="bigtext">' + esc(describeAiChoice(c, o, ch)) + '</p>');
      if (o.step === 'build' && ch && ch.region) out.push('<p class="rkart">' + A.art('site/' + ch.region, { size: 64 }) + '<b>' + esc(REG[ch.region].site) + '</b> at ' + rn(ch.region) + '</p>');
      if (o.step === 'banish' && ch) {
        if ((ch.banish || []).length) out.push('<h3>Banished</h3><div class="cards">' + ch.banish.map(function (id) { return A.card(id, ''); }).join('') + '</div>');
        if ((ch.admit || []).length) out.push('<h3>Admitted</h3><div class="cards">' + ch.admit.map(function (id) { return A.card(id, ''); }).join('') + '</div>');
      }
      if (o.step === 'law' && c.world.laws.length >= o.max) out.push('<p class="muted">Only ' + o.max + ' laws stand at once: the oldest, ' + D.LAW[c.world.laws[0]].name + ', lapses.</p>');
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
  function playerRk(c, o) {
    U.rk = U.rk && U.rk.step === o.step ? U.rk : { step: o.step, pick: null, banish: [], admit: [] };
    var rk = U.rk, out = ['<section class="panel"><h2>' + STEP_NAME[o.step] + '</h2>'];
    if (o.step === 'build') {
      out.push('<p>You may build one structure for free, or raze one that stands. It stays that way in the ages to come. The Citadel and the Waystone are landmarks: they always stand. Or leave the valley as it is.</p><div class="actlist">');
      o.options.forEach(function (op) {
        var lbl = op.kind === 'none' ? 'Leave the valley as it is' : (op.kind === 'raze' ? 'Raze the ' : 'Build the ') + REG[op.region].site + ' <small>' + rn(op.region) + '</small>';
        out.push(btn((op.region ? A.art('site/' + op.region, { size: 20 }) + ' ' : '') + lbl, function () { applyRk(op); }, { cls: op.kind === 'raze' ? 'red' : (op.kind === 'none' ? 'go' : '') }));
      });
      out.push('</div>');
    } else if (o.step === 'banish') {
      var needB = Math.min(o.banish, o.deck.length), needA = o.admit;
      out.push('<p>Banish ' + needB + ' cards from the world deck for good, and admit ' + needA + ' from the Vault. Chosen: ' + rk.banish.length + ' of ' + needB + ' banished, ' + rk.admit.length + ' of ' + needA + ' admitted.</p>');
      out.push('<h3>Admit from the Vault</h3><div class="cards">' + o.offer.map(function (id) {
        var on = rk.admit.indexOf(id) >= 0;
        return A.card(id, '<div class="row">' + btn(on ? 'Admitted ✓' : 'Admit', function () { toggle(rk.admit, id, needA); }, { cls: on ? 'active' : '' }) + '</div>');
      }).join('') + '</div>');
      out.push('<h3>Banish from the world deck</h3><div class="cards">' + o.deck.map(function (id) {
        var on = rk.banish.indexOf(id) >= 0;
        return A.card(id, '<div class="row">' + btn(on ? 'Banished ✗' : 'Banish', function () { toggle(rk.banish, id, needB); }, { cls: on ? 'red active' : '' }) + '</div>');
      }).join('') + '</div>');
      var ready = rk.banish.length === needB && rk.admit.length === needA;
      out.push('<div class="row sticky">' + btn('Confirm', function () { applyRk({ banish: rk.banish, admit: rk.admit }); }, { cls: 'go big', off: ready ? null : 'Choose ' + needB + ' to banish and ' + needA + ' to admit.' }) + '</div>');
    } else if (o.step === 'law') {
      out.push('<p>Write one law. It holds in every age to come until it lapses. Up to ' + o.max + ' laws stand at once.</p>');
      if (o.standing.length) out.push('<p class="muted">Standing: ' + o.standing.map(function (id) { return D.LAW[id].name; }).join(', ') + '.' + (o.standing.length >= o.max ? ' The oldest, ' + D.LAW[o.standing[0]].name + ', will lapse.' : '') + '</p>');
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
        (seat.ruler !== 'player' && seat.freeHold !== 'player' && c.holdfast && c.holdfast.player ? ' Your holdfast is ' + (c.holdfast.player === 'farpass' ? 'the ' : '') + rn(c.holdfast.player) + '. You begin there if it is free.' : '') + '</p>' +
        (c.world.laws.length ? '<p class="muted">Laws: ' + c.world.laws.map(function (id) { return D.LAW[id].name; }).join(', ') + '.</p>' : '') + '</section>');
      out.push('<div class="row">' + btn('Begin ' + E.ageTitle(c.ageNo + 1).replace(/^The/, 'the'), function () { U.nextAge(); }, { cls: 'go big' }) + '</div>');
    }
    if (U.annalsFrom && !done) out.push('<div class="row">' + btn('Back', function () { var f = U.annalsFrom; U.annalsFrom = null; U.go(f === 'title' ? 'title' : H.screenFor(U.c)); }) + '</div>');
    out.push('</div>');
    return out.join('');
  };
})(typeof self !== 'undefined' ? self : this);
