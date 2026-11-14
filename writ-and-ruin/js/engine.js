/* Writ & Ruin: rules engine. Pure state + rules, no DOM.
 * UMD: window.WR_ENGINE in the browser (needs WR_DATA first), require('./engine.js') in node.
 *
 * A campaign is one plain JSON object: the world, the houses, memory, the annals, the age in progress
 * (campaign.age) and the Reckoning in progress (campaign.reckoning). Everything random draws from a
 * seeded generator stored in the state, so a seed replays identically.
 * applyAction(age, action) mutates the age in place and returns a list of events for the log.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.WR_ENGINE = factory(root.WR_DATA);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var N = D.NUM, IDS = D.REGION_IDS, REG = D.REGION, CARDS = D.CARDS;
  var SAVE_VERSION = 2;

  // ---------------------------------------------------------------- rng (mulberry32, state in obj.rng)
  function rnd(o) {
    var t = (o.rng = (o.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(o, n) { return Math.floor(rnd(o) * n); }
  function shuffle(o, a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rint(o, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = clone(o[i]); return a; }
    var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = clone(o[k]); return r;
  }

  // ---------------------------------------------------------------- small queries
  function law(s, id) { return s.laws.indexOf(id) >= 0; }
  function isRelic(id) { return !!(CARDS[id] && CARDS[id].relic); }
  // a site works when its structure stands: landmarks always, the others once built
  function siteOn(s, r) { return !!(REG[r].landmark || s.regions[r].built); }
  function buildCost(r) { return REG[r].buildCost || 0; }
  function holds(s, h, r) { return s.regions[r].owner === h; }
  function heldBy(s, h) { var o = []; for (var i = 0; i < IDS.length; i++) if (s.regions[IDS[i]].owner === h) o.push(IDS[i]); return o; }
  function nHeld(s, h) { var n = 0; for (var i = 0; i < IDS.length; i++) if (s.regions[IDS[i]].owner === h) n++; return n; }
  function bandsAt(s, h, r) { return s.regions[r].bands[h] || 0; }
  function totalBands(s, h) {
    var n = (s.houses[h] && s.houses[h].camp) || 0;
    for (var i = 0; i < IDS.length; i++) n += s.regions[IDS[i]].bands[h] || 0;
    return n;
  }
  // the Far Pass camp sits off the board, next to the Far Pass only
  function adjacent(a, b) {
    if (a === 'camp' || b === 'camp') return a === 'farpass' || b === 'farpass';
    return REG[a].adj.indexOf(b) >= 0;
  }
  // regions a landless house may return to: no warbands of any house in them (unheld, or held but left unguarded)
  function returnSpots(s, h) {
    return IDS.filter(function (r) { var g = s.regions[r]; return !(g.owner && g.bands[g.owner] > 0) && !othersPresent(s, h, r); });
  }
  function slotsOf(s, r) { return siteOn(s, r) ? N.slots : N.slotsUndeveloped; }
  // a house's effects: its retinue and relics, plus residents at sites of regions it holds
  function has(s, h, id) {
    var hs = s.houses[h];
    if (!hs) return false;
    if (hs.retinue.indexOf(id) >= 0 || hs.relics.indexOf(id) >= 0) return true;
    for (var i = 0; i < IDS.length; i++) {
      var g = s.regions[IDS[i]];
      if (g.owner === h && g.residents.indexOf(id) >= 0) return true;
    }
    return false;
  }
  // "here" effects: in the retinue (anywhere), or at the site of region r while h holds it
  function hasAt(s, h, id, r) {
    var hs = s.houses[h];
    if (!hs) return false;
    if (hs.retinue.indexOf(id) >= 0) return true;
    return siteAt(s, h, id, r);
  }
  // site-only effects (Wall Warden, Moor Hound): at the site of region r while h holds it; never from a retinue
  function siteAt(s, h, id, r) {
    var g = s.regions[r];
    return !!g && g.owner === h && g.residents.indexOf(id) >= 0;
  }
  function siteOnly(id) { return !!(CARDS[id] && CARDS[id].siteOnly); }
  function othersPresent(s, h, r) {
    var b = s.regions[r].bands;
    for (var k in b) if (k !== h && b[k] > 0) return true;
    return false;
  }
  function emptyOfOthers(s, h, r) {
    var g = s.regions[r];
    if (othersPresent(s, h, r)) return false;
    if (!g.owner && g.folk > 0) return false;
    return true;
  }
  function currentHouse(s) { return s.phase === 'play' ? s.order[s.turn] : null; }

  // lean holdings: a house on 1 or 2 regions still collects N.incomeFloor silver from them (a landless house gets nothing)
  function leanBonus(s, h) {
    var n = nHeld(s, h);
    return n > 0 && n < N.incomeFloor ? N.incomeFloor - n : 0;
  }
  function income(s, h) {
    var held = heldBy(s, h), n = held.length, inc = n + leanBonus(s, h);
    for (var i = 0; i < held.length; i++) if (siteOn(s, held[i])) inc += REG[held[i]].siteIncome;
    if (has(s, h, 'titheReeve')) inc++;
    if (has(s, h, 'saltWidow')) inc++;
    if (has(s, h, 'kilnTwins') && holds(s, h, 'ashwood')) inc += 2;
    if (has(s, h, 'peatCutter') && n > 0 && n <= 2) inc++;
    if (has(s, h, 'woolFactor')) inc += (holds(s, h, 'highpasture') ? 1 : 0) + (holds(s, h, 'farpass') ? 1 : 0);
    if (has(s, h, 'ferryWife') && (holds(s, h, 'riverford') || holds(s, h, 'saltmarsh'))) inc++;
    return inc;
  }
  function hoursFor(s, h) {
    var n = nHeld(s, h), hr = Math.max(N.hoursMin, N.hoursBase - n);
    if (has(s, h, 'granaryKeeper')) hr++;
    if (has(s, h, 'antlerCrown')) hr++;
    if (has(s, h, 'hollowAbbess') && n >= 3) hr++;
    return hr;
  }
  function loreCount(s, h) {
    var hs = s.houses[h], n = 0;
    hs.retinue.forEach(function (id) { if (id === 'lampMonk') n += 2; else if (CARDS[id].suit === 'Lore') n++; });
    if (hs.relics.indexOf('saltCodex') >= 0) n++;
    return n;
  }

  // ---------------------------------------------------------------- prophecies
  function prophecyProgress(s, h, id) {
    var hs = s.houses[h], P = { have: 0, need: 3 }, n;
    switch (id) {
      case 1: P.have = ['saltmarsh', 'riverford', 'oldbarrow'].filter(function (r) { return holds(s, h, r); }).length; break;
      case 2: P.need = 4; P.have = Math.min(3, loreCount(s, h)) + (holds(s, h, 'oldbarrow') ? 1 : 0); break;
      case 3: P.have = Math.min(2, hs.relics.length) + (holds(s, h, 'stonefields') ? 1 : 0); break;
      case 4: P.need = D.PROPHECIES[3].need; P.have = Math.min(P.need, hs.attackWins); break;
      case 5: P.need = 4; n = D.CROWN_NEIGHBOURS.filter(function (r) { return holds(s, h, r); }).length;
        P.have = holds(s, h, 'crown') ? Math.min(n, 3) : n; break;
      case 6: P.need = D.PROPHECIES[5].need; P.have = Math.min(P.need, income(s, h)); break;
      case 7: var suits = {};
        hs.retinue.forEach(function (c) { suits[CARDS[c].suit] = 1; });
        P.need = D.PROPHECIES[6].need;
        P.have = Math.min(3, Object.keys(suits).length) + (holds(s, h, 'ashwood') ? 1 : 0) + (holds(s, h, 'highpasture') ? 1 : 0); break;
      case 8: var fp = holds(s, h, 'farpass'), hp = holds(s, h, 'highpasture');
        P.have = (fp ? 1 : 0) + (hp ? 1 : 0) + (fp && hp && bandsAt(s, h, 'farpass') + bandsAt(s, h, 'highpasture') >= 6 ? 1 : 0); break;
      case 9: P.need = D.PROPHECIES[8].need; P.have = hs.broke ? 0 : Math.min(P.need, nHeld(s, h)); break;
      case 10: P.need = 2; P.have = (hs.tookCrown ? 1 : 0) + (hs.tookCrown && holds(s, h, 'riverford') ? 1 : 0); break;
    }
    P.met = P.have >= P.need;
    return P;
  }

  function checkVictory(s, h) {
    if (nHeld(s, h) >= N.seizeRegions) return 'seize';
    var p = s.houses[h].prophecy;
    if (p && prophecyProgress(s, h, p).met) return 'foretell';
    return null;
  }

  // claims that stand, and who has had a turn while each stood: a claim wins at the start of its
  // holder's turn once every other house has had a turn to break it (from round N.claimFrom)
  function noteClaims(s, mover) {
    var cl = s.claims || (s.claims = {});
    s.order.forEach(function (h) {
      var w = checkVictory(s, h);
      if (!w) { delete cl[h]; return; }
      if (!cl[h]) cl[h] = { kind: w, seen: [] };
      cl[h].kind = w;
      if (mover && mover !== h && cl[h].seen.indexOf(mover) < 0) cl[h].seen.push(mover);
    });
  }
  // null, or { kind: 'seize'|'foretell', waiting: [houses yet to have a turn while it stands] }
  function claimStanding(s, h) {
    var w = checkVictory(s, h);
    if (!w) return null;
    var c = s.claims && s.claims[h], seen = c ? c.seen : [];
    return { kind: w, waiting: s.order.filter(function (k) { return k !== h && seen.indexOf(k) < 0; }) };
  }

  function departNeeds(s, h) {
    return { bands: law(s, 'openRoads') ? 3 : N.departBands, relics: has(s, h, 'waystoneShard') ? 1 : N.departRelics };
  }

  // closeness to each way of winning, 0..1 (the threat bar)
  function progress(s, h) {
    var hs = s.houses[h], n = nHeld(s, h);
    var out = { seize: Math.min(1, n / N.seizeRegions), foretell: 0, depart: 0, seat: 0 };
    if (hs.prophecy) { var p = prophecyProgress(s, h, hs.prophecy); out.foretell = p.have / p.need; }
    if (siteOn(s, 'farpass')) {
      var dn = departNeeds(s, h);
      var rel = Math.min(1, hs.relics.length / dn.relics);
      var fb = holds(s, h, 'farpass') ? Math.min(1, bandsAt(s, h, 'farpass') / dn.bands) : 0;
      out.depart = rel * 0.6 + fb * 0.4;
      if (rel < 1) out.depart = Math.min(out.depart, 0.75);
    }
    if (holds(s, h, 'crown')) out.seat = Math.min(1, 0.25 + 0.75 * Math.max(0, s.round - 1) / (N.lastRound - 1));
    return out;
  }
  function threat(s, h) { var p = progress(s, h); return Math.max(p.seize, p.foretell, p.depart, p.seat); }

  // chance the age ends after each remaining round, for the screen (from round 5)
  function endChances(s) {
    var out = [];
    if (law(s, 'shortReign')) out.push({ round: N.shortReign.round, chance: 1 / N.shortReign.of });
    N.endDraws.forEach(function (d) { out.push({ round: d.round, chance: 1 / d.of }); });
    out.push({ round: N.lastRound, chance: 1 });
    return out.filter(function (d) { return d.round >= s.round; });
  }

  // ---------------------------------------------------------------- fortune
  function drawFortune(s) {
    if (!s.fortune.length) s.fortune = shuffle(s, N.fortune.slice());
    return s.fortune.shift();
  }
  function fortuneLeft(s) {
    var c = {}; s.fortune.forEach(function (v) { c[v] = (c[v] || 0) + 1; }); return c;
  }
  function peekFortune(s, h) {
    if (!has(s, h, 'starReader')) return null;
    if (!s.fortune.length) return null;   // reshuffle pending: unknown
    return s.fortune[0];
  }
  // The exact chance that assault a wins, drawing as doAssault does: the attacker's card (two with an unused
  // Tide Reader, keeping the higher), the defender's card, then one Heron Witch redraw (attacker's if losing,
  // else defender's if losing). Cards come from what is left in the deck; an empty deck reshuffles all ten.
  // The same walk also gives the chance of each number of warbands lost on either side (battleLosses, as doAssault
  // counts them), so the win chance and the losses always agree.
  // Returns { p, tide, attWitch, defWitch, attLoss, defLoss } (defWitch is the defending house, or null;
  // attLoss[k] / defLoss[k] are the chances that side loses exactly k).
  function battleLosses(at, dt, n, defBands) {
    var win = at > dt, diff = Math.abs(at - dt), al, dl;
    if (win) { dl = Math.min(defBands, Math.max(1, diff)); al = diff === 1 ? 1 : 0; }
    else { al = Math.min(n, Math.max(1, diff)); dl = diff === 1 ? Math.min(defBands, 1) : 0; }
    return { win: win, att: Math.min(al, n), def: dl };
  }
  function assaultOdds(s, a) {
    var h = a.house, hs = s.houses[h], pv = battlePreview(s, a), d = pv.defender, att = pv.attack, def = pv.defence;
    var g = s.regions[a.to], n = a.count, defBands = d ? (g.bands[d] || 0) : g.folk;
    var tide = has(s, h, 'tideReader') && !hs.flags.tide;
    var attW = has(s, h, 'heronWitch') && !hs.once.witch;
    var defW = d && has(s, d, 'heronWitch') && !s.houses[d].once.witch ? d : null;
    var full = [0, 0, 0, 0]; N.fortune.forEach(function (v) { full[v]++; });
    var deck = [0, 0, 0, 0]; s.fortune.forEach(function (v) { deck[v]++; });
    var p = 0, attLoss = [], defLoss = [], i;
    for (i = 0; i <= n; i++) attLoss.push(0);
    for (i = 0; i <= defBands; i++) defLoss.push(0);
    function end(ac, dc, w) {
      var L = battleLosses(att + ac, def + dc, n, defBands);
      if (L.win) p += w;
      attLoss[L.att] += w; defLoss[L.def] += w;
    }
    // draw one card from counts c with weight w, then carry on with k(card, counts after, weight)
    function draw(c, w, k) {
      var tot = c[0] + c[1] + c[2] + c[3];
      if (!tot) { c = full; tot = N.fortune.length; }
      for (var v = 0; v < 4; v++) if (c[v]) { var c2 = c.slice(); c2[v]--; k(v, c2, w * c[v] / tot); }
    }
    function afterDefence(ac, dc, c, w) {
      var win = att + ac > def + dc;
      if (!win && attW) return draw(c, w, function (ac2, c2, w2) { end(ac2, dc, w2); });
      if (win && defW) return draw(c, w, function (dc2, c2, w2) { end(ac, dc2, w2); });
      end(ac, dc, w);
    }
    function afterAttack(ac, c, w) { draw(c, w, function (dc, c2, w2) { afterDefence(ac, dc, c2, w2); }); }
    function first(ac, c, w) {
      if (tide) draw(c, w, function (x, c2, w2) { afterAttack(Math.max(ac, x), c2, w2); });
      else afterAttack(ac, c, w);
    }
    if (pv.peek != null) { var c0 = deck.slice(); c0[pv.peek]--; first(pv.peek, c0, 1); }
    else draw(deck, 1, first);
    return { p: p, tide: tide, attWitch: attW, defWitch: defW, attLoss: attLoss, defLoss: defLoss };
  }
  // every number of warbands a side could lose with the cards still left, fewest to most, e.g. [0, 2]
  function lossRange(dist) {
    var lo = -1, hi = -1;
    for (var k = 0; k < dist.length; k++) if (dist[k] > 1e-12) { if (lo < 0) lo = k; hi = k; }
    if (lo < 0) lo = hi = 0;
    return [lo, hi];
  }

  // ---------------------------------------------------------------- costs
  function marchFree(s, h, from) {
    if (from === 'riverford' && holds(s, h, 'riverford') && siteOn(s, 'riverford') && !s.houses[h].flags.toll) return 'toll';
    if (has(s, h, 'drover') && !s.houses[h].flags.drover) return 'drover';
    return null;
  }
  function musterMax(s, h) { return N.musterMax + (has(s, h, 'drillCaptain') ? 1 : 0) + (law(s, 'levy') ? 1 : 0); }
  function musterCost(s, h, r, count) {
    var c = count - (has(s, h, 'brewer') ? 1 : 0) - (r === 'ashwood' && siteOn(s, 'ashwood') ? 1 : 0);
    return Math.max(0, c);
  }
  function assaultHours(s, h, to) {
    var c = 2;
    if (has(s, h, 'bannerClerk') && !s.houses[h].flags.clerk) c = 1;
    if (bellHolder(s, h, to)) c++;
    return c;
  }
  // the rival holding region `to` whose Drowned Bell makes h's assault there cost a moon more, or null
  function bellHolder(s, h, to) {
    var d = s.regions[to] && s.regions[to].owner;
    return d && d !== h && has(s, d, 'drownedBell') ? d : null;
  }
  // the silver to recruit resident id; from region r held by another house (a poach) it costs N.poachSilver more
  function recruitCost(s, h, id, r) {
    var card = CARDS[id], c = card.cost;
    if (law(s, 'wildYear') && card.suit === 'Wild') c = 0;
    else {
      if (has(s, h, 'fairMother')) c--;
      if (law(s, 'titheOfLore') && card.suit === 'Lore') c--;
    }
    return Math.max(0, c) + (r && poachFrom(s, h, r) ? N.poachSilver : 0);
  }
  // where h recruits in region r from: r itself if h has warbands there, else the neighbour with the most of h's warbands, or null
  function recruitReach(s, h, r) {
    if (!s.regions[r]) return null;
    if (bandsAt(s, h, r) > 0) return r;
    var best = null;
    REG[r].adj.forEach(function (n) { if (bandsAt(s, h, n) > 0 && (!best || bandsAt(s, h, n) > bandsAt(s, h, best))) best = n; });
    return best;
  }
  // the house h would poach from by recruiting in region r: its holder, if that is another house
  function poachFrom(s, h, r) { var o = s.regions[r] && s.regions[r].owner; return o && o !== h ? o : null; }
  function poachKey(r, id) { return 'poach:' + r + ':' + id; }
  function searchSilver(s, h) {
    if (has(s, h, 'archivist')) return 0;
    return law(s, 'titheOfLore') ? 2 : N.searchSilver;
  }
  function searchHours(s, h) { return has(s, h, 'mothClerk') && !s.houses[h].flags.moth ? 0 : 1; }
  function treatHours(s, h) { return has(s, h, 'whisperer') ? 0 : 1; }

  // how a house may enter region r by March: 'own' | 'empty' | 'hermit' | 'smuggle' | null
  // a region a house returned to stays safe from the others until that house's next turn
  function sheltered(s, h, r) {
    var g = s.regions[r];
    return !!(g && g.owner && g.owner !== h && s.houses[g.owner].refuge === r);
  }
  // the truce of the first round: no assaults, and a march goes only into your own region or one no one holds or guards.
  // A plan is judged by the round its house will make it in (planRound, set by the AI).
  // Returns the reason, or null once the truce is over.
  function truce(s) {
    var r = s.planRound || s.round;
    if (r <= N.truceRounds) return 'the truce';
    if (r <= N.truceRounds + 1 && law(s, 'longPeace')) return 'the Long Peace';
    return null;
  }
  function enterMode(s, h, r) {
    var g = s.regions[r];
    if (g.owner === h) return 'own';
    if (sheltered(s, h, r)) return null;
    // during the truce a march goes only into a region no one holds or guards (no Hermit, no smuggling)
    if (truce(s)) return !g.owner && emptyOfOthers(s, h, r) ? 'empty' : null;
    if (emptyOfOthers(s, h, r)) return 'empty';
    if (!g.owner && g.folk > 0 && !othersPresent(s, h, r) && has(s, h, 'antleredHermit')) return 'hermit';
    if (g.owner && (g.bands[g.owner] || 0) <= 1 && has(s, h, 'smugglerQueen')) return 'smuggle';
    return null;
  }
  // march destinations from a region: [{to, via}]
  function marchDests(s, h, from) {
    var out = [], seen = {};
    if (from === 'camp') return enterMode(s, h, 'farpass') ? [{ to: 'farpass', via: null }] : [];
    REG[from].adj.forEach(function (to) {
      if (enterMode(s, h, to)) { out.push({ to: to, via: null }); seen[to] = 1; }
    });
    var horse = from === 'highpasture' && holds(s, h, 'highpasture') && siteOn(s, 'highpasture');
    var carto = has(s, h, 'blindCartographer');
    if (horse || carto) {
      REG[from].adj.forEach(function (mid) {
        var g = s.regions[mid];
        var pass = g.owner === h || (horse && emptyOfOthers(s, h, mid));
        if (!pass) return;
        REG[mid].adj.forEach(function (to) {
          if (to === from || seen[to]) return;
          if (enterMode(s, h, to)) { out.push({ to: to, via: mid }); seen[to] = 1; }
        });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- battle numbers
  function attackBonus(s, h, from, to) {
    var b = 0, d = s.regions[to].owner;
    if (hasAt(s, h, 'pikeSergeant', from)) b++;
    if (!d && has(s, h, 'oldBoar')) b += 2;
    if (has(s, h, 'ninthBanner')) b++;
    if (d && d !== h && has(s, h, 'levySergeant')) b++;
    if ((from === 'highpasture' || from === 'farpass') && has(s, h, 'stagOfThePass')) b++;
    if (d) s.pacts.forEach(function (p) {
      if (p.type === 'foe' && p.foe === d && (p.a === h || p.b === h)) b++;
    });
    return b;
  }
  function defenceOf(s, r, attacker) {
    var g = s.regions[r], d = g.owner, v;
    v = d ? (g.bands[d] || 0) : g.folk;
    if (siteOn(s, r) && !(attacker && has(s, attacker, 'tunnelRat'))) v += REG[r].siteDef;
    if (d) {
      if (siteAt(s, d, 'wallWarden', r)) v++;
      if (siteAt(s, d, 'moorHound', r)) v++;
      if (s.houses[d].relics.indexOf('ironKey') >= 0 && (g.bands[d] || 0) > 0) v++;
      if (r === 'crown' && has(s, d, 'gatePorter')) v++;
      if ((r === 'saltmarsh' || r === 'oldbarrow') && has(s, d, 'ditchEel')) v++;
      v += lastStand(s, r);
      if (g.dug === d) v++;   // dug in until the start of that house's next turn
    }
    return v;
  }
  // a house defending the only region it holds
  function lastStand(s, r) {
    var d = s.regions[r].owner;
    return d && nHeld(s, d) === 1 ? N.lastStand : 0;
  }
  function battlePreview(s, a) {
    return { attack: a.count + attackBonus(s, a.house, a.from, a.to), defence: defenceOf(s, a.to, a.house),
      defender: s.regions[a.to].owner, lastStand: lastStand(s, a.to), dug: !!(s.regions[a.to].owner && s.regions[a.to].dug === s.regions[a.to].owner), peek: peekFortune(s, a.house) };
  }

  // ---------------------------------------------------------------- pacts
  function pactsBetween(s, a, b) {
    return s.pacts.filter(function (p) { return (p.a === a && p.b === b) || (p.a === b && p.b === a); });
  }
  // pacts h would break by assaulting d
  function pactsBrokenBy(s, h, d) {
    if (!d) return [];
    return pactsBetween(s, h, d).filter(function (p) {
      if (p.type === 'truce' || p.type === 'foe') return true;
      if (p.type === 'tribute') return p.payee === h && p.payer === d;
      return false;
    });
  }
  function grudge(s, a, b) { return (s.memory[a] && s.memory[a][b]) ? s.memory[a][b].grudge : 0; }
  function addGrudge(s, a, b, n) {
    var m = s.memory[a][b];
    m.grudge = Math.min(N.grudgeMax, m.grudge + n);
  }
  function removeBands(s, h, n, avoid) {
    var lost = [];
    while (n > 0) {
      var best = null, bv = 0;
      IDS.forEach(function (r) {
        var b = bandsAt(s, h, r);
        if (b <= 0) return;
        var v = b - (r === avoid ? 100 : 0);
        if (best === null || v > bv) { best = r; bv = v; }
      });
      if (!best) break;
      s.regions[best].bands[h] -= 1;
      if (!s.regions[best].bands[h]) delete s.regions[best].bands[h];
      lost.push(best); n--;
      settle(s, best);
    }
    return lost;
  }
  function breakPacts(s, h, d, avoid, ev) {
    var broken = pactsBrokenBy(s, h, d);
    if (!broken.length) return;
    var hs = s.houses[h], forger = has(s, h, 'forger');
    s.pacts = s.pacts.filter(function (p) { return broken.indexOf(p) < 0; });
    hs.broke = true;
    if (!forger) { hs.brokeKnown = true; addGrudge(s, d, h, N.grudgeBreak); }
    broken.forEach(function (p) { ev.push({ type: 'pactBroken', house: h, wronged: d, pact: p, grudge: forger ? 0 : N.grudgeBreak }); });
    if (has(s, d, 'hangingJudge')) {
      var l1 = removeBands(s, h, 2, avoid);
      ev.push({ type: 'judge', house: d, breaker: h, lost: l1 });
    }
    if (law(s, 'oathOfArms')) {
      var l2 = removeBands(s, h, 3, avoid);
      ev.push({ type: 'oath', house: h, lost: l2 });
    }
  }

  // if a region's holder has no warbands left and another house does, the largest such house takes it
  function settle(s, r) {
    var g = s.regions[r];
    if (!g.owner || (g.bands[g.owner] || 0) > 0) return;
    var best = null;
    for (var k in g.bands) if (g.bands[k] > 0 && (!best || g.bands[k] > g.bands[best])) best = k;
    if (best) setOwner(s, r, best, 'settle');
  }
  function setOwner(s, r, h, how) {
    var g = s.regions[r];
    if (g.owner === h) return;
    g.owner = h; g.folk = 0;
    delete g.dug;   // digging in ends when the region changes hands
    if (r === 'crown') s.history.crown.push({ house: h, round: s.round, how: how });
  }

  // no unannounced moves on you: a rival may march into or assault your region only as a plan it showed when you ended your turn
  function warnedFor(s, h, r) {
    if (h === 'player' || s._planning || !s.regions[r] || s.regions[r].owner !== 'player') return true;
    return (s.houses[h].warned || []).indexOf(r) >= 0;
  }
  function useWarned(s, h, r) {
    var w = s.houses[h].warned, i = w ? w.indexOf(r) : -1;
    if (i >= 0) w.splice(i, 1);
  }
  // a shown poach permits taking that one resident from that region, and nothing else
  function warnedPoach(s, h, r, id) {
    if (h === 'player' || s._planning || poachFrom(s, h, r) !== 'player') return true;
    return (s.houses[h].warned || []).indexOf(poachKey(r, id)) >= 0;
  }
  function warnedBy(it) {
    if (it && it.type === 'poach') return [poachKey(it.region, it.card)];
    return it && (it.type === 'assault' || it.type === 'march') && it.to ? [it.to] : [];
  }

  // ---------------------------------------------------------------- validation
  function err(m) { return m; }
  function check(s, a, opts) {
    opts = opts || {};
    if (!a || !a.type) return err('no action');
    var h = a.house, hs = s.houses[h];
    if (!hs) return err('no such house');
    if (s.phase === 'over') return err('the age is over');
    if (a.type === 'chooseProphecy') {
      if (s.phase !== 'prophecy') return err('not choosing prophecies');
      if (hs.prophecy) return err('already chosen');
      return hs.prophecyOptions.indexOf(a.id) >= 0 ? null : err('not one of your prophecies');
    }
    if (s.phase !== 'play') return err('the age has not begun');
    var P = s.pending;
    if (P) {
      if (a.type === 'respond') return (P.type === 'offer' && P.to === h) ? null : err('no offer to answer');
      if (a.type === 'keep') {
        if (P.type !== 'search' || P.house !== h) return err('no search to finish');
        if (a.card == null) return null;
        if (P.cards.indexOf(a.card) < 0) return err('not drawn');
        if (isRelic(a.card)) return a.to === 'retinue' ? null : err('relics go to the retinue');
        if (a.to === 'retinue') return siteOnly(a.card) ? err('stays at its site') : hs.retinue.length < N.retinueMax ? null : err('retinue full');
        if (a.to === 'site') return s.regions[P.region].residents.length < slotsOf(s, P.region) ? null : err('no empty slot');
        return err('keep where?');
      }
      return err('waiting on ' + P.type);
    }
    if (s.order[s.turn] !== h) return err('not your turn');
    var hours = opts.ignoreHours ? 99 : hs.hours;
    var g, cost;
    // a landless house returns before anything else
    if (hs.flags.returnDue && a.type !== 'return' && a.type !== 'end') return err('return first');
    switch (a.type) {
      case 'end': return null;
      case 'return': {
        if (!hs.flags.returnDue) return err('not landless');
        var spots = returnSpots(s, h);
        if (a.region === 'camp') return spots.length ? err('a region is free: return there') : null;
        return spots.indexOf(a.region) >= 0 ? null : err('not a free region');
      }
      case 'march': {
        if ((a.from !== 'camp' && !s.regions[a.from]) || !s.regions[a.to]) return err('no such region');
        var have = a.from === 'camp' ? hs.camp || 0 : bandsAt(s, h, a.from);
        if (!(a.count >= 1 && a.count <= have)) return err('not enough warbands');
        var ok = marchDests(s, h, a.from).filter(function (d) { return d.to === a.to; })[0];
        if (!ok && s.regions[a.to].owner && s.regions[a.to].owner !== h && truce(s)) return err(truce(s) + ': held');
        if (!ok) return err('cannot march there');
        if (!warnedFor(s, h, a.to)) return err('not its declared plan');
        if (!marchFree(s, h, a.from) && hours < 1) return err('no hours');
        if (law(s, 'tolls') && !holds(s, h, a.to) && hs.silver < 1 && !opts.ignoreHours) return err('no silver for the toll');
        return null;
      }
      case 'muster': {
        if (!s.regions[a.region] || !holds(s, h, a.region)) return err('not your region');
        if (!(a.count >= 1 && a.count <= musterMax(s, h))) return err('bad count');
        if (hours < 1) return err('no hours');
        if (!opts.ignoreHours && hs.silver < musterCost(s, h, a.region, a.count)) return err('not enough silver');
        return null;
      }
      case 'assault': {
        var camp = a.from === 'camp';
        if ((!camp && !s.regions[a.from]) || !s.regions[a.to]) return err('no such region');
        if (truce(s)) return err(truce(s));
        if (!adjacent(a.from, a.to)) return err('not neighbours');
        if (!(a.count >= 1 && a.count <= (camp ? hs.camp || 0 : bandsAt(s, h, a.from)))) return err('not enough warbands');
        if (holds(s, h, a.to)) return err('already yours');
        if (sheltered(s, h, a.to)) return err('newly returned: safe until their turn');
        if (emptyOfOthers(s, h, a.to)) return err('empty: march instead');
        // no unannounced assaults on you: a rival may assault your region only as the plan it showed when you ended your turn
        if (!warnedFor(s, h, a.to)) return err('not its declared plan');
        var ah = assaultHours(s, h, a.to);
        if (hours < 1) return err('no hours');
        if (hours < ah) {
          // say what it costs and why, not "no moons": 'assault costs 2 moons; have 1' or
          // 'assault on riverford costs 3 moons (varrow: Drowned Bell); have 2'
          var bell = bellHolder(s, h, a.to);
          return err(bell ? 'assault on ' + a.to + ' costs ' + ah + ' moons (' + bell + ': Drowned Bell); have ' + hours
            : 'assault costs ' + ah + ' moons; have ' + hours);
        }
        return null;
      }
      case 'recruit': {
        g = s.regions[a.region];
        if (!g) return err('no such region');
        if (!recruitReach(s, h, a.region)) return err('no warbands there or next to it');
        if (g.residents.indexOf(a.card) < 0) return err('not there');
        if (siteOnly(a.card)) return err('stays at its site');
        var victim = poachFrom(s, h, a.region);
        if (victim && pactsBetween(s, h, victim).length) return err('you have a pact with ' + victim);
        // no unannounced poaching from you: a rival may take a resident from your region only as the plan it showed
        if (!warnedPoach(s, h, a.region, a.card)) return err('not its declared plan');
        if (hs.retinue.length >= N.retinueMax) return err('retinue full');
        if (hours < 1) return err('no hours');
        if (!opts.ignoreHours && hs.silver < recruitCost(s, h, a.card, a.region)) return err('not enough silver');
        return null;
      }
      case 'build': {
        g = s.regions[a.region];
        if (!g) return err('no such region');
        if (REG[a.region].landmark) return err('a landmark');
        if (siteOn(s, a.region)) return err('already built');
        if (!holds(s, h, a.region)) return err('not your region');
        if (hours < 1) return err('no hours');
        if (!opts.ignoreHours && hs.silver < buildCost(a.region)) return err('not enough silver');
        return null;
      }
      case 'station': {
        g = s.regions[a.region];
        if (!g) return err('no such region');
        if (isRelic(a.card)) return err('relics stay with you');
        if (hs.retinue.indexOf(a.card) < 0) return err('not in your retinue');
        if (!holds(s, h, a.region)) return err('not your region');
        if (g.residents.length >= slotsOf(s, a.region)) return err('no empty slot');
        if (hours < 1) return err('no hours');
        return null;
      }
      case 'dig': {
        if (!s.regions[a.region] || !holds(s, h, a.region)) return err('not your region');
        if (s.regions[a.region].dug === h) return err('already dug in');
        if (hours < 1) return err('no hours');
        return null;
      }
      case 'search': {
        if (!s.regions[a.region] || bandsAt(s, h, a.region) < 1) return err('no warbands there');
        if (!s.deck.length) return err('the world deck is empty');
        if (hours < searchHours(s, h)) return err('no hours');
        if (!opts.ignoreHours && hs.silver < searchSilver(s, h)) return err('not enough silver');
        return null;
      }
      case 'treat': {
        if (hs.flags.treated) return err('once per turn');
        if (!s.houses[a.target] || a.target === h) return err('no such rival');
        if (hours < treatHours(s, h)) return err('no hours');
        var ex = pactsBetween(s, h, a.target).filter(function (p) { return p.type === a.pact; });
        if (ex.length) return err('already agreed');
        if (a.pact === 'truce') return null;
        if (a.pact === 'tribute') {
          if (a.payer !== h && a.payer !== a.target) return err('who pays?');
          return null;
        }
        if (a.pact === 'foe') {
          if (!s.houses[a.foe] || a.foe === h || a.foe === a.target) return err('name a third house');
          return null;
        }
        return err('no such pact');
      }
      case 'depart': {
        var dfrom = N.departFrom;
        if (s.round < dfrom) return err('the Waystone opens in the ' + D.ORDINALS[dfrom - 1] + ' round');
        if (!holds(s, h, 'farpass')) return err('not at the Far Pass');
        var dn = departNeeds(s, h);
        if (bandsAt(s, h, 'farpass') < dn.bands) return err('need ' + dn.bands + ' warbands');
        if (hs.relics.length < dn.relics) return err('need ' + dn.relics + ' relics');
        if (!hs.flags.passHeld) return err('hold the Far Pass with ' + dn.bands + ' warbands from the start of your turn');
        if (hours < 1) return err('no hours');
        if (hours < 3) return err('depart costs 3 moons; have ' + hours);
        return null;
      }
      case 'poison': {
        if (!has(s, h, 'poisoner') || hs.once.poisoner) return err('no Poisoner');
        if (hours < 1) return err('no hours');
        return findCard(s, a.card) && !isRelic(a.card) && a.card !== 'poisoner' ? null : err('no such resident in play');
      }
      case 'seeProphecy': {
        if (!has(s, h, 'bellSeer') || hs.once.bellSeer) return err('no Bell Seer');
        return (s.houses[a.target] && a.target !== h) ? null : err('no such rival');
      }
    }
    return err('unknown action ' + a.type);
  }
  function findCard(s, id) {
    for (var i = 0; i < IDS.length; i++) if (s.regions[IDS[i]].residents.indexOf(id) >= 0) return { region: IDS[i] };
    for (var h in s.houses) if (s.houses[h].retinue.indexOf(id) >= 0) return { house: h };
    return null;
  }

  // ---------------------------------------------------------------- legal actions
  // opts.few: fewer count variants (for the AI); opts.ignoreHours: plan for a future turn
  function legalActions(s, h, opts) {
    opts = opts || {};
    var out = [], hs = s.houses[h];
    if (!hs || s.phase === 'over') return out;
    function add(a) { a.house = h; if (!check(s, a, opts)) out.push(a); }
    if (s.phase === 'prophecy') {
      if (!hs.prophecy) hs.prophecyOptions.forEach(function (id) { add({ type: 'chooseProphecy', id: id }); });
      return out;
    }
    var P = s.pending;
    if (P) {
      if (P.type === 'offer' && P.to === h) { add({ type: 'respond', accept: true }); add({ type: 'respond', accept: false }); }
      if (P.type === 'search' && P.house === h) {
        P.cards.forEach(function (c) { add({ type: 'keep', card: c, to: 'retinue' }); add({ type: 'keep', card: c, to: 'site' }); });
        add({ type: 'keep', card: null });
      }
      return out;
    }
    if (s.order[s.turn] !== h) return out;
    out.push({ type: 'end', house: h });
    if (hs.flags.returnDue) {
      var spots = returnSpots(s, h);
      (spots.length ? spots : ['camp']).forEach(function (r) { add({ type: 'return', region: r }); });
      return out;
    }
    function counts(n) {
      if (!opts.few) { var c = []; for (var i = 1; i <= n; i++) c.push(i); return c; }
      var f = [n]; if (n > 1) f.push(n - 1); if (n > 3) f.push(Math.ceil(n / 2)); return f;
    }
    if (hs.camp > 0) counts(hs.camp).forEach(function (c) {
      if (enterMode(s, h, 'farpass')) add({ type: 'march', from: 'camp', to: 'farpass', count: c });
      else if (!holds(s, h, 'farpass')) add({ type: 'assault', from: 'camp', to: 'farpass', count: c });
    });
    IDS.forEach(function (r) {
      var b = bandsAt(s, h, r);
      if (b > 0) {
        marchDests(s, h, r).forEach(function (d) {
          counts(b).forEach(function (c) { add({ type: 'march', from: r, to: d.to, count: c }); });
        });
        REG[r].adj.forEach(function (to) {
          if (holds(s, h, to) || emptyOfOthers(s, h, to)) return;
          counts(b).forEach(function (c) { add({ type: 'assault', from: r, to: to, count: c }); });
        });
        add({ type: 'search', region: r });
      }
      if (holds(s, h, r)) {
        var mx = musterMax(s, h), cs = opts.few ? [mx, 1] : counts(mx);
        if (opts.few && !opts.ignoreHours) {
          // the most this house can pay for
          var afford = mx; while (afford > 1 && musterCost(s, h, r, afford) > hs.silver) afford--;
          cs = afford > 1 ? [afford, 1] : [1];
        }
        cs.forEach(function (c) { add({ type: 'muster', region: r, count: c }); });
        if (!siteOn(s, r)) add({ type: 'build', region: r });
        add({ type: 'dig', region: r });
        if (s.regions[r].residents.length < slotsOf(s, r)) hs.retinue.forEach(function (c) { add({ type: 'station', region: r, card: c }); });
      }
      // recruit: where h has warbands, or next door to them (from another house's region, a poach)
      if (hs.retinue.length < N.retinueMax && recruitReach(s, h, r)) s.regions[r].residents.forEach(function (c) { add({ type: 'recruit', region: r, card: c }); });
    });
    if (!hs.flags.treated) {
      s.order.forEach(function (t) {
        if (t === h) return;
        add({ type: 'treat', target: t, pact: 'truce' });
        add({ type: 'treat', target: t, pact: 'tribute', payer: h });
        add({ type: 'treat', target: t, pact: 'tribute', payer: t });
        s.order.forEach(function (f) { if (f !== h && f !== t) add({ type: 'treat', target: t, pact: 'foe', foe: f }); });
      });
    }
    add({ type: 'depart' });
    if (has(s, h, 'poisoner') && !hs.once.poisoner) {
      IDS.forEach(function (r) { s.regions[r].residents.forEach(function (c) { add({ type: 'poison', card: c }); }); });
      s.order.forEach(function (t) { s.houses[t].retinue.forEach(function (c) { add({ type: 'poison', card: c }); }); });
    }
    if (has(s, h, 'bellSeer') && !hs.once.bellSeer) s.order.forEach(function (t) { if (t !== h) add({ type: 'seeProphecy', target: t }); });
    return out;
  }

  // ---------------------------------------------------------------- applying actions
  function applyAction(s, a) {
    var e = check(s, a);
    if (e) throw new Error('illegal ' + (a && a.type) + ' by ' + (a && a.house) + ': ' + e);
    var ev = [], h = a.house, hs = s.houses[h];
    switch (a.type) {
      case 'chooseProphecy':
        hs.prophecy = a.id;
        ev.push({ type: 'prophecyChosen', house: h });
        if (s.order.every(function (k) { return s.houses[k].prophecy; })) {
          s.phase = 'play'; s.round = 1; s.turn = 0;
          beginTurn(s, ev);
        }
        break;
      case 'end':
        hs.then = a.then || null;
        if (a.intent) { hs.intent = a.intent; hs.intent2 = a.intent2 || null; ev.push({ type: 'intent', house: h, intent: a.intent, label: intentLabel(s, h, a.intent) }); }
        else { hs.intent = null; hs.intent2 = null; hs.then = null; }
        // the plans the player has seen: the only moves on the player's regions allowed before the player's next turn
        if (h === 'player') s.order.forEach(function (k) {
          if (k === h) return;
          var ks = s.houses[k];
          ks.warned = warnedBy(ks.intent); ks.warned2 = warnedBy(ks.then);
        });
        if (s.round >= N.claimFrom && nHeld(s, h) >= N.seizeRegions) { ev.push({ type: 'seize', house: h }); endAge(s, h, 'seize', ev); break; }
        endTurn(s, ev); break;
      case 'march': doMarch(s, a, ev); break;
      case 'muster': {
        var mc = musterCost(s, h, a.region, a.count);
        hs.silver -= mc; hs.hours -= 1;
        s.regions[a.region].bands[h] = bandsAt(s, h, a.region) + a.count;
        ev.push({ type: 'muster', house: h, region: a.region, count: a.count, silver: mc });
        break;
      }
      case 'assault': doAssault(s, a, ev); break;
      case 'return': {
        hs.flags.returnDue = false;
        var nb = N.returnBands;
        if (a.region === 'camp') hs.camp = (hs.camp || 0) + nb;
        else {
          var rg = s.regions[a.region];
          rg.bands[h] = (rg.bands[h] || 0) + nb;
          setOwner(s, a.region, h, 'return');
          rg.folk = 0;
          hs.refuge = a.region;
        }
        if (s.history.returns) s.history.returns.push({ house: h, round: s.round, region: a.region });
        ev.push({ type: 'return', house: h, region: a.region, count: nb, camp: a.region === 'camp' });
        break;
      }
      case 'recruit': {
        var rc = recruitCost(s, h, a.card, a.region), g = s.regions[a.region], pv = poachFrom(s, h, a.region);
        var reach = bandsAt(s, h, a.region) > 0 ? null : recruitReach(s, h, a.region);
        hs.silver -= rc; hs.hours -= 1;
        g.residents.splice(g.residents.indexOf(a.card), 1);
        hs.retinue.push(a.card);
        if (pv) {
          addGrudge(s, pv, h, N.grudgePoach);
          if (pv === 'player') useWarned(s, h, poachKey(a.region, a.card));   // the declared poach, used once
        }
        ev.push({ type: 'recruit', house: h, region: a.region, card: a.card, silver: rc, from: pv || null, reach: reach, grudge: pv ? N.grudgePoach : 0 });
        break;
      }
      case 'build': {
        var bc = buildCost(a.region);
        hs.silver -= bc; hs.hours -= 1;
        s.regions[a.region].built = true;
        ev.push({ type: 'build', house: h, region: a.region, silver: bc });
        break;
      }
      case 'station': {
        hs.hours -= 1;
        hs.retinue.splice(hs.retinue.indexOf(a.card), 1);
        s.regions[a.region].residents.push(a.card);
        ev.push({ type: 'station', house: h, region: a.region, card: a.card });
        break;
      }
      case 'dig':
        hs.hours -= 1;
        s.regions[a.region].dug = h;
        ev.push({ type: 'dig', house: h, region: a.region });
        break;
      case 'search': doSearch(s, a, ev); break;
      case 'keep': doKeep(s, a, ev); break;
      case 'treat': {
        hs.hours -= treatHours(s, h); hs.flags.treated = true;
        var offer = { type: a.pact, from: h, to: a.target };
        if (a.pact === 'tribute') { offer.payer = a.payer; offer.payee = a.payer === h ? a.target : h; }
        if (a.pact === 'foe') offer.foe = a.foe;
        s.pending = { type: 'offer', from: h, to: a.target, offer: offer };
        ev.push({ type: 'pactOffered', house: h, target: a.target, offer: offer });
        break;
      }
      case 'respond': {
        var P = s.pending, o = P.offer;
        s.pending = null;
        if (a.accept) {
          var pact = { id: ++s.pactSeq, type: o.type, a: o.from, b: o.to, round: s.round,
            until: o.type === 'foe' ? 99 : s.round + N.pactRounds - 1 };
          if (o.type === 'tribute') { pact.payer = o.payer; pact.payee = o.payee; pact.paid = s.round; payTribute(s, pact, ev); }
          if (o.type === 'foe') pact.foe = o.foe;
          s.pacts.push(pact);
          ev.push({ type: 'pactAccepted', house: o.to, from: o.from, pact: pact });
        } else ev.push({ type: 'pactRefused', house: o.to, from: o.from, offer: o });
        break;
      }
      case 'depart':
        hs.hours -= 3;
        ev.push({ type: 'depart', house: h });
        endAge(s, h, 'depart', ev);
        break;
      case 'poison': {
        hs.hours -= 1; hs.once.poisoner = true;
        var where = findCard(s, a.card);
        if (where.region) { var rr = s.regions[where.region].residents; rr.splice(rr.indexOf(a.card), 1); }
        else { var rt = s.houses[where.house].retinue; rt.splice(rt.indexOf(a.card), 1); }
        s.deck.push(a.card);
        ev.push({ type: 'poison', house: h, card: a.card, from: where.region || where.house });
        break;
      }
      case 'seeProphecy':
        hs.once.bellSeer = true; hs.known[a.target] = true;
        ev.push({ type: 'seeProphecy', house: h, target: a.target, prophecy: s.houses[a.target].prophecy });
        break;
    }
    return ev;
  }

  function doMarch(s, a, ev) {
    var h = a.house, hs = s.houses[h];
    var dest = marchDests(s, h, a.from).filter(function (d) { return d.to === a.to; })[0];
    var mode = enterMode(s, h, a.to);
    var free = marchFree(s, h, a.from), silver = 0;
    if (free) hs.flags[free] = true; else hs.hours -= 1;
    if (law(s, 'tolls') && mode !== 'own') { silver = Math.min(1, hs.silver); hs.silver -= silver; }
    var dst = s.regions[a.to];
    if (a.from === 'camp') hs.camp -= a.count;
    else { var src = s.regions[a.from]; src.bands[h] -= a.count; if (!src.bands[h]) delete src.bands[h]; }
    var prev = dst.owner;
    if (prev === 'player') useWarned(s, h, a.to);
    dst.bands[h] = (dst.bands[h] || 0) + a.count;
    if (mode === 'empty' || mode === 'hermit') { setOwner(s, a.to, h, 'march'); dst.folk = 0; }
    if (a.from !== 'camp') settle(s, a.from);
    ev.push({ type: 'march', house: h, from: a.from, to: a.to, via: dest.via, count: a.count, mode: mode, free: free, silver: silver,
      took: (mode === 'empty' || mode === 'hermit') ? (prev || 'free folk') : null });
  }

  function doAssault(s, a, ev) {
    var h = a.house, hs = s.houses[h], to = a.to, from = a.from;
    var hrs = assaultHours(s, h, to);
    if (has(s, h, 'bannerClerk') && !hs.flags.clerk) hs.flags.clerk = true;
    hs.hours -= hrs;
    var g = s.regions[to], d = g.owner;
    if (d === 'player') useWarned(s, h, to);   // the declared move, used once
    breakPacts(s, h, d, from, ev);
    var camp = from === 'camp';
    // warbands leave the source: a region, or the Far Pass camp
    function lose(k) { if (camp) hs.camp -= k; else { src.bands[h] -= k; if (!src.bands[h]) delete src.bands[h]; } }
    var n = Math.min(a.count, camp ? hs.camp || 0 : bandsAt(s, h, from));
    if (n < 1) { ev.push({ type: 'assaultCollapsed', house: h, from: from, to: to }); return; }
    var att = n + attackBonus(s, h, from, to), def = defenceOf(s, to, h);
    var defBands = d ? (g.bands[d] || 0) : g.folk;
    var ac, dc, extra = null, witch = null;
    if (a._cards && s._sim) { ac = a._cards[0]; dc = a._cards[1]; }   // AI lookahead only
    else {
      ac = drawFortune(s);
      if (has(s, h, 'tideReader') && !hs.flags.tide) { hs.flags.tide = true; extra = drawFortune(s); if (extra > ac) { var t = ac; ac = extra; extra = t; } }
      dc = drawFortune(s);
      if (att + ac <= def + dc && has(s, h, 'heronWitch') && !hs.once.witch) {
        hs.once.witch = true; var old = ac; ac = drawFortune(s); witch = { house: h, discarded: old, card: ac };
      } else if (d && att + ac > def + dc && has(s, d, 'heronWitch') && !s.houses[d].once.witch) {
        s.houses[d].once.witch = true; var old2 = dc; dc = drawFortune(s); witch = { house: d, discarded: old2, card: dc };
      }
    }
    var at = att + ac, dt = def + dc, L = battleLosses(at, dt, n, defBands), win = L.win;
    var attLoss = L.att, defLoss = L.def;
    var E = { type: 'battle', house: h, defender: d, from: from, to: to, count: n, attack: att, defence: def,
      attCard: ac, defCard: dc, tideCard: extra, witch: witch, attTotal: at, defTotal: dt,
      winner: win ? 'attacker' : 'defender', attLoss: attLoss, defLoss: defLoss, retreat: null, relic: null, silver: 0,
      lastStand: lastStand(s, to), dug: !!(d && g.dug === d) };
    var src = camp ? null : s.regions[from];
    if (win) {
      lose(n);
      if (d) {
        var left = (g.bands[d] || 0) - defLoss;
        delete g.bands[d];
        if (left > 0) {
          var back = null;
          REG[to].adj.forEach(function (r) { if (holds(s, d, r) && (!back || bandsAt(s, d, r) > bandsAt(s, d, back))) back = r; });
          if (back) { s.regions[back].bands[d] = bandsAt(s, d, back) + left; E.retreat = { to: back, count: left }; }
          else E.retreat = { to: null, count: left };
        }
        addGrudge(s, d, h, N.grudgeTaken);
        if (to === 'crown') hs.tookCrown = true;
        var dh = s.houses[d];
        if (dh.relics.length && !has(s, d, 'fence')) {
          var pick = (a.relic && dh.relics.indexOf(a.relic) >= 0) ? a.relic : bestRelicFor(s, h, dh.relics);
          dh.relics.splice(dh.relics.indexOf(pick), 1); hs.relics.push(pick); E.relic = pick;
        }
      }
      g.folk = 0;
      setOwner(s, to, h, 'assault');
      var surv = n - attLoss;
      if (!d && has(s, h, 'brambleWoman')) { surv++; E.bramble = true; }
      if (surv > 0) g.bands[h] = (g.bands[h] || 0) + surv;
      if (d) hs.attackWins++;   // prophecy 4 counts battles against houses
      if (d && has(s, h, 'cutpurse') && s.houses[d].silver > 0) { s.houses[d].silver--; hs.silver++; E.silver = 1; }
      if (!camp) settle(s, from);
    } else {
      lose(attLoss);
      if (d) { g.bands[d] = (g.bands[d] || 0) - defLoss; if (!g.bands[d]) delete g.bands[d]; }
      else g.folk -= defLoss;
      if (d) {
        var dhs = s.houses[d];
        if (has(s, d, 'cutpurse') && hs.silver > 0) { hs.silver--; dhs.silver++; E.silver = 1; }
        if (has(s, d, 'crowMother') && hs.silver > 0) { hs.silver--; dhs.silver++; E.silver += 1; E.crow = true; }
      }
      if (!camp) settle(s, from);
      settle(s, to);
    }
    s.history.battles++;
    ev.push(E);
  }
  var RELIC_ORDER = ['waystoneShard', 'antlerCrown', 'ninthBanner', 'ironKey', 'drownedBell', 'saltCodex'];
  function bestRelicFor(s, h, list) {
    var sorted = list.slice().sort(function (x, y) { return RELIC_ORDER.indexOf(x) - RELIC_ORDER.indexOf(y); });
    return sorted[0];
  }

  function doSearch(s, a, ev) {
    var h = a.house, hs = s.houses[h], r = a.region;
    var sh = searchHours(s, h), ss = searchSilver(s, h);
    if (sh === 0) hs.flags.moth = true;
    hs.hours -= sh; hs.silver -= ss;
    var n = N.searchDraw;
    if (r === 'stonefields' && siteOn(s, r)) n = 4;
    if (has(s, h, 'barrowScholar')) n++;
    if ((r === 'oldbarrow' || r === 'saltmarsh') && has(s, h, 'fenLantern')) n += 2;
    var cards = s.deck.splice(0, Math.min(n, s.deck.length));
    var auto = [];
    if (r === 'oldbarrow' && siteOn(s, r)) {
      cards = cards.filter(function (c) { if (isRelic(c)) { hs.relics.push(c); auto.push(c); return false; } return true; });
    }
    ev.push({ type: 'search', house: h, region: r, drew: cards.length + auto.length, cards: cards.slice(), barrowRelics: auto, silver: ss });
    s.pending = { type: 'search', house: h, region: r, cards: cards, keep: has(s, h, 'chalkProphet') ? 2 : 1 };
    if (!cards.length) { s.pending = null; }
  }
  function doKeep(s, a, ev) {
    var P = s.pending, hs = s.houses[a.house];
    if (a.card != null) {
      P.cards.splice(P.cards.indexOf(a.card), 1);
      if (isRelic(a.card)) hs.relics.push(a.card);
      else if (a.to === 'retinue') hs.retinue.push(a.card);
      else s.regions[P.region].residents.push(a.card);
      ev.push({ type: 'keep', house: a.house, card: a.card, to: a.to, region: P.region });
      P.keep--;
    }
    if (a.card == null || P.keep <= 0 || !P.cards.length) {
      P.cards.forEach(function (c) { s.deck.push(c); });
      if (a.card == null) ev.push({ type: 'keep', house: a.house, card: null });
      s.pending = null;
    }
  }

  function payTribute(s, p, ev) {
    var payer = s.houses[p.payer], amt = Math.min(1, payer.silver);
    payer.silver -= amt; s.houses[p.payee].silver += amt; p.paid = s.round;
    ev.push({ type: 'tribute', house: p.payer, to: p.payee, silver: amt });
  }

  // 'Varrow: assault Saltmarsh with 4', 'Varrow: march 2 to the Crown hold' (the region names that take an article get it here)
  function intentLabel(s, h, it) {
    var who = cap(s.houses[h].short), R = function (r) { return REG[r] ? (r === 'crown' || r === 'farpass' ? 'the ' : '') + REG[r].name : r; };
    if (!it) return who + ': no plan';
    var w = it.why && s.houses[it.why.house], base = intentBase(it, who, R);
    if (!w) return base;
    var you = it.why.house === 'player', them = you ? 'you' : w.short, theirs = you ? 'your' : w.short + "'s";
    return base + (it.why.kind === 'depart' ? ' to stop ' + them + ' departing' :
      it.why.kind === 'seat' ? ' to take the Crown from ' + them : ' to break ' + theirs + ' claim');
  }
  function intentBase(it, who, R) {
    switch (it.type) {
      case 'assault': return who + ': assault ' + R(it.to) + ' with ' + it.count;
      case 'march': return who + ': march ' + it.count + ' to ' + R(it.to);
      case 'muster': return who + ': muster in ' + R(it.region);
      case 'search': return who + ': search ' + R(it.region);
      case 'recruit': return who + ': recruit ' + CARDS[it.card].name;
      case 'poach': return who + ': poach the ' + CARDS[it.card].name + ' from ' + R(it.region);
      case 'depart': return who + ': depart by the Far Pass';
      case 'hold': return who + ': hold fast';
      case 'return': return who + ': returns at ' + (it.region === 'camp' ? 'the Far Pass camp' : R(it.region));
    }
    return who + ': ' + it.type;
  }

  // ---------------------------------------------------------------- turns and rounds
  function roundStart(s, ev) {
    ev.push({ type: 'roundStart', round: s.round });
    var keep = [];
    s.pacts.forEach(function (p) {
      if (p.until < s.round) {
        s.memory[p.a][p.b].debt = Math.min(N.debtMax, s.memory[p.a][p.b].debt + 1);
        s.memory[p.b][p.a].debt = Math.min(N.debtMax, s.memory[p.b][p.a].debt + 1);
        ev.push({ type: 'pactExpired', pact: p });
      } else keep.push(p);
    });
    s.pacts = keep;
    var ruler = s.regions.crown.owner;
    if (ruler && law(s, 'crownsDue')) {
      s.order.forEach(function (k) {
        if (k === ruler || s.houses[k].silver < 1) return;
        s.houses[k].silver--; s.houses[ruler].silver++;
        ev.push({ type: 'crownsDue', house: k, to: ruler, silver: 1 });
      });
    }
  }
  function beginTurn(s, ev) {
    if (s.turn === 0) roundStart(s, ev);
    var h = s.order[s.turn], hs = s.houses[h];
    hs.flags = {};
    hs.refuge = null;
    hs.camp = 0;
    IDS.forEach(function (r) { if (s.regions[r].dug === h) delete s.regions[r].dug; });   // last turn's digging in runs out
    ev.push({ type: 'turnStart', house: h, round: s.round });
    noteClaims(s, null);
    var cs = s.round >= N.claimFrom ? claimStanding(s, h) : null;   // a claim must stand a full round
    if (cs && !cs.waiting.length) { endAge(s, h, cs.kind, ev); return; }
    noteClaims(s, h);
    var inc = income(s, h);
    hs.silver += inc;
    ev.push({ type: 'income', house: h, silver: inc });
    payUpkeep(s, h, ev);
    s.pacts.forEach(function (p) { if (p.type === 'tribute' && p.payer === h && p.paid < s.round) payTribute(s, p, ev); });
    if (has(s, h, 'ledgerThief')) {
      var rich = null;
      s.order.forEach(function (k) { if (k !== h && (!rich || s.houses[k].silver > s.houses[rich].silver)) rich = k; });
      if (rich && s.houses[rich].silver > 0) { s.houses[rich].silver--; hs.silver++; ev.push({ type: 'ledgerThief', house: h, from: rich, silver: 1 }); }
    }
    hs.hours = hoursFor(s, h);
    hs.turns++;
    if (holds(s, h, 'farpass') && bandsAt(s, h, 'farpass') >= departNeeds(s, h).bands) hs.flags.passHeld = true;
    // landless: the house returns as the free first step of its turn
    if (!nHeld(s, h)) { hs.flags.returnDue = true; ev.push({ type: 'landless', house: h }); }
  }
  // upkeep: 1 silver for every full N.upkeepPer warbands on the board, paid after income
  function boardBands(s, h) {
    var n = 0;
    for (var i = 0; i < IDS.length; i++) n += s.regions[IDS[i]].bands[h] || 0;
    return n;
  }
  function upkeep(s, h, bands) { return Math.floor((bands == null ? boardBands(s, h) : bands) / N.upkeepPer); }
  // short of silver: disband 1 warband per silver short, from the largest stack,
  // never emptying a region the house holds while another stack can give one
  function payUpkeep(s, h, ev) {
    var hs = s.houses[h], bands = boardBands(s, h), due = upkeep(s, h, bands);
    if (!due) return;
    var paid = Math.min(hs.silver, due), short = due - paid, lost = [];
    hs.silver -= paid;
    for (var k = 0; k < short; k++) {
      var best = null, bv = -1, safe = false;
      IDS.forEach(function (r) {
        var b = bandsAt(s, h, r);
        if (b <= 0) return;
        var ok = !(b === 1 && holds(s, h, r));
        if ((ok && !safe) || (ok === safe && b > bv)) { best = r; bv = b; safe = ok; }
      });
      if (!best) break;
      s.regions[best].bands[h] -= 1;
      if (!s.regions[best].bands[h]) delete s.regions[best].bands[h];
      lost.push(best);
      settle(s, best);
    }
    ev.push({ type: 'upkeep', house: h, bands: bands, due: due, silver: paid, short: short, lost: lost });
  }
  function endTurn(s, ev) {
    var h = s.order[s.turn];
    if (s.houses[h].camp) { ev.push({ type: 'campBroken', house: h, count: s.houses[h].camp }); s.houses[h].camp = 0; }   // the camp breaks up
    ev.push({ type: 'turnEnd', house: h });
    // a plan made after you ended your turn was never shown to you: only a second move shown then carries over
    if (h !== 'player') { s.houses[h].warned = s.houses[h].warned2 || null; s.houses[h].warned2 = null; }
    noteClaims(s, null);
    s.turn++;
    if (s.turn >= s.order.length) {
      ev.push({ type: 'roundEnd', round: s.round });
      if (ageEndsAfter(s, ev)) {
        var holder = s.regions.crown.owner;
        endAge(s, holder, holder ? 'seat' : 'none', ev);
        return;
      }
      s.round++; s.turn = 0;
      if (N.rotate) s.order.push(s.order.shift());   // the first seat passes on each round
    }
    beginTurn(s, ev);
  }
  function ageEndsAfter(s, ev) {
    if (s.round >= N.lastRound) { ev.push({ type: 'ageDraw', round: s.round, of: 1, ended: true }); return true; }
    var draws = N.endDraws.slice();
    if (law(s, 'shortReign')) draws.unshift(N.shortReign);
    for (var i = 0; i < draws.length; i++) {
      if (draws[i].round !== s.round) continue;
      var card = rint(s, draws[i].of), ended = card === 0;
      ev.push({ type: 'ageDraw', round: s.round, of: draws[i].of, card: card, ended: ended });
      return ended;
    }
    return false;
  }
  function endAge(s, h, how, ev) {
    s.phase = 'over'; s.winner = h || null; s.winType = h ? how : 'none'; s.endRound = s.round;
    s.pending = null;
    ev.push({ type: 'victory', house: s.winner, how: s.winType, round: s.round });
  }

  // ---------------------------------------------------------------- campaign
  // the ruler's warbands: an even split over the Crown hold and two neighbours, the Crown taking any remainder
  function rulerSpread(regs) {
    var each = Math.floor(N.rulerBands / 3), o = {};
    regs.forEach(function (r, i) { o[r] = i ? each : N.rulerBands - 2 * each; });
    return o;
  }

  function newCampaign(seed, playerHouseName) {
    seed = (seed >>> 0) || 1;
    var c = { version: SAVE_VERSION, seed: seed, rng: seed, ageNo: 0, player: 'player', houses: {}, memory: {},
      world: { built: {}, deck: [], vault: [], lost: [], laws: [], freeHold: null },
      next: { ruler: D.FIRST_AGE.ruler, rivals: D.FIRST_AGE.rivals.slice(), rulerRegions: rulerSpread(D.FIRST_AGE.rulerRegions), rulerHeld: [] },
      holdfast: {}, annals: [], age: null, reckoning: null };
    (D.FIRST_AGE.built || []).forEach(function (r) { if (!REG[r].landmark) c.world.built[r] = true; });
    c.houses.player = { id: 'player', name: playerHouseName || 'Your house', short: playerHouseName || 'Your house', temperament: 'player', isPlayer: true };
    D.HOUSES.forEach(function (H) { c.houses[H.id] = { id: H.id, name: H.name, short: H.short, temperament: H.temperament }; });
    var ids = Object.keys(c.houses);
    ids.forEach(function (a) { c.memory[a] = {}; ids.forEach(function (b) { if (a !== b) c.memory[a][b] = { grudge: 0, debt: 0 }; }); });
    c.world.deck = D.RESIDENTS.map(function (r) { return r.id; }).concat(D.RELICS.map(function (r) { return r.id; }));
    c.world.vault = shuffle(c, D.VAULT.map(function (r) { return r.id; }));
    return c;
  }

  // the Crown hold's neighbours, richest structure first; skip leaves some out
  function richestNeighbours(built, skip) {
    skip = skip || [];
    return D.CROWN_NEIGHBOURS.filter(function (r) { return skip.indexOf(r) < 0; }).slice().sort(function (x, y) {
      var ix = built[x] ? REG[x].siteIncome : 0, iy = built[y] ? REG[y].siteIncome : 0;
      if (ix !== iy) return iy - ix;
      // between unbuilt regions, the one whose structure would pay most
      if (REG[x].siteIncome !== REG[y].siteIncome) return REG[y].siteIncome - REG[x].siteIncome;
      var ex = D.EDGE_STARTS.indexOf(x) >= 0 ? 1 : 0, ey = D.EDGE_STARTS.indexOf(y) >= 0 ? 1 : 0;
      if (ex !== ey) return ex - ey;
      return D.CROWN_NEIGHBOURS.indexOf(x) - D.CROWN_NEIGHBOURS.indexOf(y);
    }).slice(0, 2 - skip.length);
  }

  // steps from each region to the Crown hold
  var CROWN_STEPS = (function () {
    var d = { crown: 0 }, q = ['crown'];
    while (q.length) { var r = q.shift(); REG[r].adj.forEach(function (n) { if (d[n] === undefined) { d[n] = d[r] + 1; q.push(n); } }); }
    return d;
  })();
  // a house's holdfast: where it has the most warbands; ties go to a built structure, then nearer the Crown hold, then region order
  function holdfastOf(s, h) {
    var here = IDS.filter(function (r) { return (s.regions[r].bands[h] || 0) > 0; });
    here.sort(function (x, y) {
      var bx = s.regions[x].bands[h], by = s.regions[y].bands[h];
      if (bx !== by) return by - bx;
      var sx = siteOn(s, x) ? 1 : 0, sy = siteOn(s, y) ? 1 : 0;
      if (sx !== sy) return sy - sx;
      if (CROWN_STEPS[x] !== CROWN_STEPS[y]) return CROWN_STEPS[x] - CROWN_STEPS[y];
      return IDS.indexOf(x) - IDS.indexOf(y);
    });
    return here[0] || null;
  }
  // the regions bordering the Crown hold that the ruler held when the age ended, most warbands first (at most two)
  function rulerKept(s, ruler) {
    return D.CROWN_NEIGHBOURS.filter(function (r) { return s.regions[r].owner === ruler; }).sort(function (x, y) {
      var bx = s.regions[x].bands[ruler] || 0, by = s.regions[y].bands[ruler] || 0;
      if (bx !== by) return by - bx;
      var sx = siteOn(s, x) ? 1 : 0, sy = siteOn(s, y) ? 1 : 0;
      if (sx !== sy) return sy - sx;
      return IDS.indexOf(x) - IDS.indexOf(y);
    }).slice(0, 2);
  }

  function startAge(c, opts) {
    opts = opts || {};
    c.ageNo++;
    var s = { ageNo: c.ageNo, rng: (Math.floor(rnd(c) * 4294967296) >>> 0) || 7, phase: 'prophecy', round: 0, turn: 0,
      order: [], houses: {}, regions: {}, deck: [], fortune: [], pacts: [], pactSeq: 0, pending: null, claims: {},
      memory: clone(c.memory), laws: c.world.laws.slice(), ruler: c.next.ruler || null, freeHold: c.world.freeHold,
      winner: null, winType: null, endRound: null, history: { crown: [], battles: 0, returns: [] } };
    var inAge = ['player'].concat(c.next.rivals);
    inAge.forEach(function (h) {
      s.houses[h] = { id: h, name: c.houses[h].name, short: c.houses[h].short, temper: c.houses[h].temperament, ai: h !== 'player' || !!opts.allAI, silver: N.startSilver, retinue: [], relics: [],
        prophecy: null, prophecyOptions: [], attackWins: 0, broke: false, brokeKnown: false, tookCrown: false,
        hours: 0, turns: 0, flags: {}, once: {}, known: {}, intent: null, intent2: null, then: null, warned: null, warned2: null, camp: 0 };
    });
    IDS.forEach(function (r) {
      var built = !!(REG[r].landmark || c.world.built[r]);
      s.regions[r] = { owner: null, bands: {}, folk: law(s, 'charter') ? Math.max(2, N.folk) : (r === 'crown' ? N.folkCrown : N.folk), residents: [], built: built };
    });
    function place(h, r, n) { s.regions[r].owner = h; s.regions[r].folk = 0; s.regions[r].bands[h] = n; }
    var ruler = s.ruler && s.houses[s.ruler] ? s.ruler : null;
    if (ruler) {
      var rr = c.next.rulerRegions;
      Object.keys(rr).forEach(function (r) { place(ruler, r, rr[r]); });
      s.history.crown.push({ house: ruler, round: 1, how: 'start' });
    }
    var fh = s.freeHold && s.houses[s.freeHold] && s.freeHold !== ruler ? s.freeHold : null;
    if (fh && !s.regions.farpass.owner) place(fh, 'farpass', N.freeHoldBands);
    // where each house begins, and why: ruler, freehold, holdfast, near (beside a covered holdfast), edge
    s.starts = {};
    if (ruler) s.starts[ruler] = { why: 'ruler', region: 'crown', regions: Object.keys(c.next.rulerRegions), kept: (c.next.rulerHeld || []).slice() };
    var others = shuffle(s, inAge.filter(function (h) { return h !== ruler; }));
    var hf = c.holdfast || {};
    function open(r) { return r !== 'crown' && !s.regions[r].owner; }
    var edgeOrder = D.EDGE_STARTS.concat(['stonefields', 'ashwood', 'riverford', 'farpass', 'highpasture', 'saltmarsh', 'oldbarrow'].filter(function (r) { return D.EDGE_STARTS.indexOf(r) < 0; }));
    // houses with a holdfast go first: on it, or on a free neighbour of it (an edge start preferred)
    var rest = [];
    others.forEach(function (h) {
      var home = hf[h];
      if (!home || h === fh || !REG[home]) { rest.push(h); return; }
      if (open(home)) { place(h, home, N.startBands); s.starts[h] = { why: 'holdfast', region: home }; return; }
      var nb = REG[home].adj.filter(open).sort(function (x, y) {
        var ex = D.EDGE_STARTS.indexOf(x) >= 0 ? 0 : 1, ey = D.EDGE_STARTS.indexOf(y) >= 0 ? 0 : 1;
        return ex !== ey ? ex - ey : IDS.indexOf(x) - IDS.indexOf(y);
      });
      if (nb.length) { place(h, nb[0], N.startBands); s.starts[h] = { why: 'near', region: nb[0], holdfast: home }; return; }
      rest.push(h);
    });
    // everyone else takes an edge start, or failing that any free region
    rest.forEach(function (h) {
      var at = edgeOrder.filter(open)[0];
      place(h, at, N.startBands);
      if (h === fh) s.starts[h] = { why: 'freehold', region: 'farpass', also: at };
      else s.starts[h] = hf[h] ? { why: 'edge', region: at, holdfast: hf[h] } : { why: 'edge', region: at };
    });
    s.order = (ruler ? [ruler] : []).concat(shuffle(s, others.slice()));
    // deal the world deck: residents to sites, relics stay in the deck
    var deck = shuffle(s, c.world.deck.slice()), aside = [];
    IDS.forEach(function (r) {
      var need = slotsOf(s, r);
      while (s.regions[r].residents.length < need && deck.length) {
        var card = deck.shift();
        if (isRelic(card)) aside.push(card); else s.regions[r].residents.push(card);
      }
    });
    s.deck = shuffle(s, deck.concat(aside));
    s.fortune = shuffle(s, N.fortune.slice());
    var props = shuffle(s, D.PROPHECIES.map(function (p) { return p.id; }));
    s.order.forEach(function (h, i) { s.houses[h].prophecyOptions = [props[2 * i], props[2 * i + 1]]; });
    c.age = s; c.reckoning = null;
    return s;
  }

  // ---------------------------------------------------------------- the Reckoning
  function drawLaws(c, how) {
    var free = D.LAWS.filter(function (l) { return c.world.laws.indexOf(l.id) < 0; });
    var tagged = shuffle(c, free.filter(function (l) { return l.tags.indexOf(how) >= 0; }));
    var rest = shuffle(c, free.filter(function (l) { return l.tags.indexOf(how) < 0; }));
    return tagged.concat(rest).slice(0, 3).map(function (l) { return l.id; });
  }
  function beginReckoning(c) {
    var s = c.age;
    if (!s || s.phase !== 'over') throw new Error('the age is not over');
    // structures built during the age stand into the next
    IDS.forEach(function (r) { if (!REG[r].landmark && s.regions[r].built) c.world.built[r] = true; });
    var R = { winner: s.winner, how: s.winType, round: s.endRound, step: 'build', site: null, banished: [], admitted: [], law: null, lapsed: null,
      vaultOffer: c.world.vault.slice(0, 4), lawOffer: s.winner ? drawLaws(c, s.winType) : [], events: [] };
    c.reckoning = R;
    if (!s.winner) finishReckoning(c);
    return R;
  }
  function reckoningOptions(c) {
    var R = c.reckoning;
    if (!R) return null;
    if (R.step === 'build') {
      var o = [{ kind: 'none' }];
      IDS.forEach(function (r) { if (!REG[r].landmark) o.push({ kind: c.world.built[r] ? 'raze' : 'build', region: r }); });
      return { step: 'build', options: o };
    }
    if (R.step === 'banish') return { step: 'banish', deck: c.world.deck.slice(), banish: 2, offer: R.vaultOffer.slice(), admit: Math.min(2, R.vaultOffer.length) };
    if (R.step === 'law') return { step: 'law', options: R.lawOffer.slice(), standing: c.world.laws.slice(), max: D.MAX_LAWS };
    return { step: R.step };
  }
  // choice: build {kind: 'build'|'raze'|'none', region}; banish {banish:[id,id], admit:[id,id]}; law {law:id}
  function reckoningChoose(c, choice) {
    var R = c.reckoning, ev = [];
    if (R.step === 'build') {
      var cr = choice && choice.region && REG[choice.region];
      if (cr && cr.landmark) throw new Error('a landmark cannot be razed');
      if (cr && choice.kind === 'build' && !c.world.built[choice.region]) { c.world.built[choice.region] = true; R.site = { kind: 'build', region: choice.region }; }
      else if (cr && choice.kind === 'raze' && c.world.built[choice.region]) { delete c.world.built[choice.region]; R.site = { kind: 'raze', region: choice.region }; }
      ev.push({ type: 'reckonSite', choice: R.site });
      R.step = 'banish';
    } else if (R.step === 'banish') {
      var ban = (choice.banish || []).filter(function (id, i, a) { return c.world.deck.indexOf(id) >= 0 && a.indexOf(id) === i; }).slice(0, 2);
      var adm = (choice.admit || []).filter(function (id, i, a) { return R.vaultOffer.indexOf(id) >= 0 && a.indexOf(id) === i; }).slice(0, 2);
      if (ban.length < 2 && c.world.deck.length > 2) throw new Error('banish two cards');
      if (adm.length < Math.min(2, R.vaultOffer.length)) throw new Error('admit two cards');
      ban.forEach(function (id) { c.world.deck.splice(c.world.deck.indexOf(id), 1); c.world.lost.push(id); });
      adm.forEach(function (id) { c.world.vault.splice(c.world.vault.indexOf(id), 1); c.world.deck.push(id); });
      // the two not admitted go to the back of the Vault
      R.vaultOffer.forEach(function (id) { if (adm.indexOf(id) < 0) { c.world.vault.splice(c.world.vault.indexOf(id), 1); c.world.vault.push(id); } });
      R.banished = ban; R.admitted = adm;
      ev.push({ type: 'reckonBanish', banished: ban, admitted: adm });
      R.step = 'law';
    } else if (R.step === 'law') {
      if (R.lawOffer.indexOf(choice.law) < 0) throw new Error('not an offered law');
      c.world.laws.push(choice.law); R.law = choice.law;
      if (c.world.laws.length > D.MAX_LAWS) R.lapsed = c.world.laws.shift();
      ev.push({ type: 'reckonLaw', law: choice.law, lapsed: R.lapsed });
      ev = ev.concat(finishReckoning(c));
    } else throw new Error('the Reckoning is done');
    return ev;
  }
  function finishReckoning(c) {
    var R = c.reckoning, s = c.age, ev = [];
    // 4. the Seat
    var ruler;
    if (R.how === 'depart') { c.world.freeHold = R.winner; ruler = s.regions.crown.owner; }
    else ruler = R.winner || s.regions.crown.owner;
    // holdfasts: where each house of this age had the most warbands; a house with none keeps its old one
    c.holdfast = c.holdfast || {};
    Object.keys(s.houses).forEach(function (h) { var r = holdfastOf(s, h); if (r) c.holdfast[h] = r; });
    var rr = {}, fill, kept = [];
    if (ruler) {
      // the ruler keeps the Crown hold's neighbours it held, most warbands first; the richest fill the rest
      kept = rulerKept(s, ruler);
      var nb = kept.concat(richestNeighbours(c.world.built, kept));
      rr = rulerSpread(['crown', nb[0], nb[1]]);
    }
    // rivals: the ruler and the winner if they are rivals, then the strongest grudges against the winner, then at random
    var pool = D.HOUSES.map(function (H) { return H.id; });
    var rivals = [];
    [R.winner, ruler].forEach(function (h) { if (h && h !== 'player' && rivals.indexOf(h) < 0) rivals.push(h); });
    if (c.world.freeHold && c.world.freeHold !== 'player' && rivals.length < 3 && rivals.indexOf(c.world.freeHold) < 0 && R.how === 'depart') rivals.push(c.world.freeHold);
    if (R.winner) {
      fill = shuffle(c, pool.filter(function (h) { return rivals.indexOf(h) < 0 && h !== R.winner; }));
      fill.sort(function (x, y) { return s.memory[y][R.winner].grudge - s.memory[x][R.winner].grudge; });
      var gr = 0;
      while (rivals.length < 3 && gr < 2 && fill.length && s.memory[fill[0]][R.winner].grudge > 0) { rivals.push(fill.shift()); gr++; }
    }
    fill = shuffle(c, pool.filter(function (h) { return rivals.indexOf(h) < 0; }));
    while (rivals.length < 3) rivals.push(fill.shift());
    c.next = { ruler: ruler || null, rivals: rivals, rulerRegions: rr, rulerHeld: kept };
    ev.push({ type: 'reckonSeat', ruler: ruler || null, freeHold: c.world.freeHold, rivals: rivals });
    // 5. memory: carried forward, every grudge and debt fades a step
    c.memory = clone(s.memory);
    Object.keys(c.memory).forEach(function (a) {
      Object.keys(c.memory[a]).forEach(function (b) {
        var m = c.memory[a][b]; m.grudge = Math.max(0, m.grudge - 1); m.debt = Math.max(0, m.debt - 1);
      });
    });
    // 6. the Annals
    var entry = { age: s.ageNo, title: ageTitle(s.ageNo), winner: R.winner, how: R.how, round: R.round, text: annalsText(c) };
    c.annals.push(entry);
    ev.push({ type: 'annals', entry: entry });
    R.step = 'done';
    R.events = R.events.concat(ev);
    return ev;
  }

  function ageTitle(n) { return 'The ' + (D.ORDINALS[n - 1] || ('Age ' + n)) + (D.ORDINALS[n - 1] ? ' Age' : ''); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function the(name) { return /^The /.test(name) ? 'the' + name.slice(3) : 'the ' + name; }
  function listAnd(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function annalsText(c) {
    var R = c.reckoning, s = c.age, H = c.houses, out = [];
    var w = R.winner ? H[R.winner] : null, rw = D.ROUND_WORDS[(R.round || 1) - 1] || ('round ' + R.round);
    if (!w) out.push('No house held the Crown hold when the age ended.');
    else if (R.how === 'seize') out.push(w.name + ' held ' + (D.NUMBER_WORDS[N.seizeRegions] || N.seizeRegions) + ' of the eight regions in the ' + rw + ' round.');
    else if (R.how === 'foretell') {
      var p = D.PROPHECIES[s.houses[R.winner].prophecy - 1];
      out.push(w.name + ' fulfilled its prophecy in the ' + rw + ' round. It read: "' + p.text + '"');
    } else if (R.how === 'depart') out.push(w.name + ' departed by the Far Pass in the ' + rw + ' round and founded a free hold there.');
    else if (R.how === 'seat') {
      var last = s.history.crown[s.history.crown.length - 1];
      if (last && last.how === 'start') out.push(w.name + ' held the Crown hold from the first round to the end.');
      else out.push(w.name + ' took the Crown hold in the ' + (D.ROUND_WORDS[(last ? last.round : 1) - 1] || 'last') + ' round and held it to the end.');
    }
    var back = w && (s.history.returns || []).filter(function (x) { return x.house === R.winner; })[0];
    if (back) out.push(cap(w.short) + ' lost every region and came back in the ' + (D.ROUND_WORDS[back.round - 1] || 'early') + ' round.');
    if (R.site) {
      var site = REG[R.site.region].site, were = /(ns|es)$/.test(site) ? ' were' : ' was';
      out.push('The ' + site + were + (R.site.kind === 'raze' ? ' razed.' : ' built.'));
    }
    if (R.banished.length) out.push(cap(listAnd(R.banished.map(function (id) { return the(CARDS[id].name); }))) + (R.banished.length > 1 ? ' were lost.' : ' was lost.'));
    if (R.admitted.length) out.push(cap(listAnd(R.admitted.map(function (id) { return the(CARDS[id].name); }))) + ' came into the world.');
    if (R.law) out.push(cap(w.short) + ' wrote the law of ' + D.LAW[R.law].name.replace(/^The /, 'the ') + '.' + (R.lapsed ? ' ' + cap(the(D.LAW[R.lapsed].name)).replace(/^The the /, 'The ') + ' lapsed.' : ''));
    return out.join(' ');
  }

  // ---------------------------------------------------------------- save / load
  function save(c) { return JSON.stringify(c); }
  // version 1 saves had every site standing unless ruined; version 2 starts sites undeveloped and builds them
  function load(str) {
    var c = typeof str === 'string' ? JSON.parse(str) : str;
    if (!c || !(c.version === 1 || c.version === SAVE_VERSION) || !c.world || !c.houses) throw new Error('not a Writ & Ruin save');
    if (c.version === 1) migrate1(c);
    // saves from before holdfasts: no house has one yet
    if (!c.holdfast) c.holdfast = {};
    return c;
  }
  // ruined -> undeveloped, standing -> built; landmarks always stand
  function migrate1(c) {
    var ruined = c.world.ruined || {};
    c.world.built = {};
    IDS.forEach(function (r) { if (!REG[r].landmark && !ruined[r]) c.world.built[r] = true; });
    delete c.world.ruined;
    if (c.age && c.age.regions) IDS.forEach(function (r) {
      var g = c.age.regions[r];
      if (!g) return;
      g.built = !!(REG[r].landmark || !g.ruined);
      delete g.ruined;
    });
    var R = c.reckoning;
    if (R) {
      if (R.step === 'ruin') R.step = 'build';
      var old = R.ruin;
      R.site = old && old.region && !REG[old.region].landmark ? { kind: old.kind === 'ruin' ? 'raze' : 'build', region: old.region } : null;
      delete R.ruin;
    }
    c.version = SAVE_VERSION;
  }

  return {
    // campaign
    newCampaign: newCampaign, startAge: startAge,
    beginReckoning: beginReckoning, reckoningOptions: reckoningOptions, reckoningChoose: reckoningChoose,
    save: save, load: load, ageTitle: ageTitle,
    // the age
    legalActions: legalActions, check: check, applyAction: applyAction, currentHouse: currentHouse,
    // queries for the screen and the AI
    income: income, leanBonus: leanBonus, hoursFor: hoursFor, heldBy: heldBy, nHeld: nHeld, bandsAt: bandsAt, totalBands: totalBands,
    buildCost: buildCost, SAVE_VERSION: SAVE_VERSION, holdfastOf: holdfastOf, rulerKept: rulerKept, richestNeighbours: richestNeighbours,
    has: has, hasAt: hasAt, siteAt: siteAt, siteOnly: siteOnly, upkeep: upkeep, boardBands: boardBands, holds: holds, adjacent: adjacent, slotsOf: slotsOf, siteOn: siteOn, law: law, truce: truce,
    prophecyProgress: prophecyProgress, progress: progress, threat: threat, checkVictory: checkVictory, claimStanding: claimStanding, departNeeds: departNeeds,
    endChances: endChances, fortuneLeft: fortuneLeft, peekFortune: peekFortune, assaultOdds: assaultOdds, lossRange: lossRange, battleLosses: battleLosses,
    battlePreview: battlePreview, attackBonus: attackBonus, defenceOf: defenceOf, lastStand: lastStand, returnSpots: returnSpots,
    marchDests: marchDests, enterMode: enterMode, emptyOfOthers: emptyOfOthers,
    musterCost: musterCost, musterMax: musterMax, recruitCost: recruitCost, recruitReach: recruitReach, poachFrom: poachFrom, searchSilver: searchSilver, assaultHours: assaultHours, bellHolder: bellHolder,
    pactsBetween: pactsBetween, intentLabel: intentLabel, pactsBrokenBy: pactsBrokenBy, grudge: grudge, loreCount: loreCount,
    // utilities
    clone: clone, rnd: rnd, rint: rint, shuffle: shuffle, DATA: D
  };
});
