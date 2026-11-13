/* Writ & Ruin: static game data (regions, residents, relics, prophecies, laws, houses, fortune).
 * UMD: window.WR_DATA in the browser, require('./data.js') in node. No dependencies.
 * Effects are implemented in engine.js, keyed by id. This file holds names, numbers and text only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WR_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- the valley
  var REGIONS = [
    { id: 'crown', name: 'Crown hold', site: 'Citadel', siteText: '+2 defence. Whoever holds it holds the Seat.',
      adj: ['saltmarsh', 'ashwood', 'riverford', 'stonefields'], siteDef: 2, siteIncome: 0 },
    { id: 'saltmarsh', name: 'Saltmarsh', site: 'Saltworks', siteText: '+2 income.',
      adj: ['crown', 'riverford', 'oldbarrow'], siteDef: 0, siteIncome: 2 },
    { id: 'riverford', name: 'Riverford', site: 'Toll Bridge', siteText: '+1 income. March out of here costs 0 hours once per turn.',
      adj: ['crown', 'saltmarsh', 'ashwood'], siteDef: 0, siteIncome: 1 },
    { id: 'ashwood', name: 'Ashwood', site: 'Charcoal Kilns', siteText: 'Muster here costs 1 silver less (per action).',
      adj: ['crown', 'riverford', 'highpasture'], siteDef: 0, siteIncome: 0 },
    { id: 'highpasture', name: 'High Pasture', site: 'Horse Fair', siteText: 'March from here may move two regions.',
      adj: ['ashwood', 'stonefields', 'farpass'], siteDef: 0, siteIncome: 0 },
    { id: 'stonefields', name: 'Stonefields', site: 'Standing Stones', siteText: 'Search here: draw 4, keep 1.',
      adj: ['crown', 'highpasture', 'oldbarrow', 'farpass'], siteDef: 0, siteIncome: 0 },
    { id: 'oldbarrow', name: 'Old Barrow', site: 'Barrow', siteText: 'Search here: relics drawn are kept as well as your pick.',
      adj: ['saltmarsh', 'stonefields'], siteDef: 0, siteIncome: 0 },
    { id: 'farpass', name: 'Far Pass', site: 'Waystone', siteText: 'Depart from here. +1 defence.',
      adj: ['highpasture', 'stonefields'], siteDef: 1, siteIncome: 0 }
  ];
  var REGION_IDS = REGIONS.map(function (r) { return r.id; });
  var REGION = {};
  REGIONS.forEach(function (r) { REGION[r.id] = r; });
  var EDGE_STARTS = ['saltmarsh', 'highpasture', 'oldbarrow'];
  var CROWN_NEIGHBOURS = REGION.crown.adj.slice();

  // ---------------------------------------------------------------- residents
  // "Here" means the region where the resident sits, for its holder. In a retinue, "here" means anywhere.
  // Residents without "here" help the region's holder everywhere, as if in the retinue.
  var SUITS = ['Order', 'Hearth', 'Lore', 'Wild', 'Shade'];
  var RESIDENTS = [
    { id: 'pikeSergeant', name: 'Pike Sergeant', suit: 'Order', cost: 2, text: '+1 attack when assaulting from here.' },
    { id: 'wallWarden', name: 'Wall Warden', suit: 'Order', cost: 2, text: '+1 defence here.' },
    { id: 'titheReeve', name: 'Tithe Reeve', suit: 'Order', cost: 3, text: '+1 income.' },
    { id: 'drillCaptain', name: 'Drill Captain', suit: 'Order', cost: 3, text: 'Muster places up to 4.' },
    { id: 'bannerClerk', name: 'Banner Clerk', suit: 'Order', cost: 2, text: 'Assault costs 1 hour (once per turn).' },
    { id: 'hangingJudge', name: 'The Hanging Judge', suit: 'Order', cost: 4, text: 'Rivals who break a pact with you lose 2 warbands.' },
    { id: 'saltWidow', name: 'Salt Widow', suit: 'Hearth', cost: 2, text: '+1 income.' },
    { id: 'drover', name: 'Drover', suit: 'Hearth', cost: 1, text: 'One March per turn costs 0 hours.' },
    { id: 'brewer', name: 'Brewer of Riverford', suit: 'Hearth', cost: 2, text: 'Muster costs 1 silver less.' },
    { id: 'granaryKeeper', name: 'Granary Keeper', suit: 'Hearth', cost: 3, text: '+1 hour each turn.' },
    { id: 'fairMother', name: 'Fair Mother', suit: 'Hearth', cost: 2, text: 'Recruit costs 1 silver less.' },
    { id: 'kilnTwins', name: 'Kiln Twins', suit: 'Hearth', cost: 3, text: '+2 income if you hold Ashwood.' },
    { id: 'barrowScholar', name: 'Barrow Scholar', suit: 'Lore', cost: 2, text: 'Search draws 1 more.' },
    { id: 'starReader', name: 'Star Reader', suit: 'Lore', cost: 3, text: 'Look at the top card of the fortune deck before you Assault.' },
    { id: 'archivist', name: 'Archivist', suit: 'Lore', cost: 2, text: 'Search costs no silver.' },
    { id: 'blindCartographer', name: 'The Blind Cartographer', suit: 'Lore', cost: 3, text: 'March may move through one region you hold.' },
    { id: 'bellSeer', name: 'Bell Seer', suit: 'Lore', cost: 4, text: "See one rival's prophecy." },
    { id: 'lampMonk', name: 'Lamp Monk', suit: 'Lore', cost: 1, text: 'Counts as 2 Lore for prophecies.' },
    { id: 'moorHound', name: 'Moor Hound', suit: 'Wild', cost: 1, text: '+1 defence here.' },
    { id: 'antleredHermit', name: 'Antlered Hermit', suit: 'Wild', cost: 2, text: 'Free folk never fight you.' },
    { id: 'heronWitch', name: 'Heron Witch', suit: 'Wild', cost: 3, text: 'Once per age, discard the fortune card you turned and turn another.' },
    { id: 'oldBoar', name: 'The Old Boar', suit: 'Wild', cost: 3, text: '+2 attack when assaulting an unheld region.' },
    { id: 'owl', name: 'Owl of Ashwood', suit: 'Wild', cost: 2, text: 'See the next intent of every rival one turn early.' },
    { id: 'fenLantern', name: 'Fen Lantern', suit: 'Wild', cost: 2, text: 'Search in Old Barrow or Saltmarsh draws 2 more.' },
    { id: 'cutpurse', name: 'Cutpurse', suit: 'Shade', cost: 1, text: 'When you win a battle, take 1 silver from the loser.' },
    { id: 'whisperer', name: 'Whisperer', suit: 'Shade', cost: 2, text: 'Treat costs 0 hours.' },
    { id: 'smugglerQueen', name: 'Smuggler Queen', suit: 'Shade', cost: 3, text: "March into a rival's region without a battle if it has 1 warband or fewer; it holds there with yours." },
    { id: 'poisoner', name: 'Poisoner', suit: 'Shade', cost: 4, text: 'Once per age, remove one resident from any site or retinue to the bottom of the deck.' },
    { id: 'forger', name: 'Forger', suit: 'Shade', cost: 2, text: 'Breaking a pact gives no grudge.' },
    { id: 'maskedEnvoy', name: 'Masked Envoy', suit: 'Shade', cost: 3, text: 'Rivals accept your pacts as if you held 1 more region.' }
  ];

  // The Vault: residents not yet in the world. Admitted two at a time by the Reckoning.
  var VAULT = [
    { id: 'gatePorter', name: 'Gate Porter', suit: 'Order', cost: 2, text: '+1 defence in the Crown hold.' },
    { id: 'levySergeant', name: 'Levy Sergeant', suit: 'Order', cost: 3, text: "+1 attack when assaulting a rival's region." },
    { id: 'peatCutter', name: 'Peat Cutter', suit: 'Hearth', cost: 1, text: '+1 income while you hold 2 regions or fewer.' },
    { id: 'woolFactor', name: 'Wool Factor', suit: 'Hearth', cost: 3, text: '+1 income for each of High Pasture and the Far Pass you hold.' },
    { id: 'ferryWife', name: 'Ferry Wife', suit: 'Hearth', cost: 2, text: '+1 income if you hold Riverford or Saltmarsh.' },
    { id: 'mothClerk', name: 'Moth Clerk', suit: 'Lore', cost: 2, text: 'One Search per turn costs 0 hours.' },
    { id: 'tideReader', name: 'Tide Reader', suit: 'Lore', cost: 3, text: 'Once per turn, when you assault, turn two fortune cards and keep the higher.' },
    { id: 'chalkProphet', name: 'Chalk Prophet', suit: 'Lore', cost: 3, text: 'Search keeps 2.' },
    { id: 'hollowAbbess', name: 'Hollow Abbess', suit: 'Lore', cost: 4, text: '+1 hour each turn while you hold 3 regions or more.' },
    { id: 'ditchEel', name: 'Ditch Eel', suit: 'Wild', cost: 1, text: '+1 defence in Saltmarsh and Old Barrow.' },
    { id: 'stagOfThePass', name: 'Stag of the Pass', suit: 'Wild', cost: 2, text: '+1 attack when assaulting from High Pasture or the Far Pass.' },
    { id: 'brambleWoman', name: 'Bramble Woman', suit: 'Wild', cost: 3, text: 'When you beat free folk, one of them joins you as a warband.' },
    { id: 'crowMother', name: 'Crow Mother', suit: 'Wild', cost: 2, text: 'When a rival assaults you and loses, take 1 silver from them.' },
    { id: 'fence', name: 'Fence', suit: 'Shade', cost: 2, text: 'Your relics cannot be taken in battle.' },
    { id: 'tunnelRat', name: 'Tunnel Rat', suit: 'Shade', cost: 3, text: 'Your assaults ignore site defence.' },
    { id: 'ledgerThief', name: 'Ledger Thief', suit: 'Shade', cost: 2, text: 'At the start of your turn, take 1 silver from the richest rival.' }
  ];

  // ---------------------------------------------------------------- relics (shuffled into the world deck)
  var RELICS = [
    { id: 'ironKey', name: 'The Iron Key', relic: true, text: '+1 defence in any region where you have warbands.' },
    { id: 'drownedBell', name: 'The Drowned Bell', relic: true, text: "Rivals' assaults against you cost 1 more hour." },
    { id: 'antlerCrown', name: 'The Antler Crown', relic: true, text: '+1 hour each turn.' },
    { id: 'saltCodex', name: 'The Salt Codex', relic: true, text: 'Counts as a Lore resident.' },
    { id: 'ninthBanner', name: 'The Ninth Banner', relic: true, text: '+1 attack.' },
    { id: 'waystoneShard', name: 'The Waystone Shard', relic: true, text: 'Depart needs 1 relic instead of 2.' }
  ];

  var CARDS = {};
  RESIDENTS.concat(VAULT).forEach(function (c) { CARDS[c.id] = c; });
  RELICS.forEach(function (c) { CARDS[c.id] = c; });

  // ---------------------------------------------------------------- prophecies
  var PROPHECIES = [
    { id: 1, text: 'Hold Saltmarsh, Riverford and Old Barrow.', need: 3 },
    { id: 2, text: 'Have 3 Lore residents in your retinue and hold Old Barrow.', need: 4 },
    { id: 3, text: 'Hold 2 relics and Stonefields.', need: 3 },
    { id: 4, text: 'Win 5 battles against houses as attacker this age.', need: 5 },
    { id: 5, text: 'Hold every region that neighbours the Crown hold, but not the Crown hold.', need: 4 },
    { id: 6, text: 'Have 6 income or more.', need: 6 },
    { id: 7, text: 'Have residents of 3 different suits in your retinue and hold Ashwood.', need: 4 },
    { id: 8, text: 'Hold the Far Pass and High Pasture with 6 warbands between them.', need: 3 },
    { id: 9, text: 'Have no pact broken this age, and hold 4 regions.', need: 4 },
    { id: 10, text: 'Take the Crown hold from its holder by assault, then hold Riverford too.', need: 2 }
  ];

  // ---------------------------------------------------------------- laws
  // tags: which ways of winning an age draw this law into the Reckoning's offer.
  var LAWS = [
    { id: 'tolls', name: 'Tolls', text: "Marching into a region you don't hold costs 1 silver.", tags: ['seize', 'seat'] },
    { id: 'longPeace', name: 'The Long Peace', text: 'No assaults in round 1.', tags: ['seat', 'foretell'] },
    { id: 'openRoads', name: 'Open Roads', text: 'Depart needs only 3 warbands.', tags: ['depart'] },
    { id: 'levy', name: 'Levy', text: 'Muster places 1 more warband.', tags: ['seize'] },
    { id: 'charter', name: 'Free Folk Charter', text: 'Free folk guard every unheld region with 2.', tags: ['seat', 'depart'] },
    { id: 'shortReign', name: 'Short Reign', text: 'The age may end after round 5 (one in four).', tags: ['seat'] },
    { id: 'titheOfLore', name: 'Tithe of Lore', text: 'Search costs 2 silver; Lore residents cost 1 less.', tags: ['foretell'] },
    { id: 'crownsDue', name: "Crown's Due", text: 'The ruler takes 1 silver from each house at the start of each round.', tags: ['seat', 'seize'] },
    { id: 'oathOfArms', name: 'The Broken Word', text: 'Breaking a pact costs 3 warbands as well.', tags: ['foretell', 'depart'] },
    { id: 'wildYear', name: 'Wild Year', text: 'Wild residents cost nothing to recruit.', tags: ['depart', 'foretell'] }
  ];
  var LAW = {};
  LAWS.forEach(function (l) { LAW[l.id] = l; });
  var MAX_LAWS = 3;

  // ---------------------------------------------------------------- houses
  var TEMPERAMENTS = {
    warlord: { name: 'Warlord', wants: 'Seize; assaults readily, hates retreats' },
    mystic: { name: 'Mystic', wants: 'Foretell; collects Lore, searches often' },
    wanderer: { name: 'Wanderer', wants: 'Depart; relics, the Far Pass, avoids fights' },
    steward: { name: 'Steward', wants: 'Keep the Seat; defends, muster-heavy, offers truces' },
    schemer: { name: 'Schemer', wants: 'Pacts and tribute; breaks pacts when it pays' },
    wild: { name: 'Wild', wants: 'Wild residents; free folk regions; ambushes the weakest' },
    player: { name: 'Player', wants: 'Whatever you make of it' }
  };
  var HOUSES = [
    { id: 'varrow', name: 'House Varrow', short: 'Varrow', temperament: 'warlord' },
    { id: 'synod', name: 'The Ashen Synod', short: 'the Synod', temperament: 'mystic' },
    { id: 'gullwing', name: 'The Gullwing Company', short: 'Gullwing', temperament: 'wanderer' },
    { id: 'thorne', name: 'House Thorne', short: 'Thorne', temperament: 'steward' },
    { id: 'lantern', name: 'The Lantern Court', short: 'the Lantern Court', temperament: 'schemer' },
    { id: 'moss', name: 'The Moss Kin', short: 'the Moss Kin', temperament: 'wild' }
  ];
  var FIRST_AGE = { ruler: 'thorne', rivals: ['thorne', 'varrow', 'synod'],
    rulerRegions: ['crown', 'riverford', 'ashwood'] };

  // ---------------------------------------------------------------- numbers
  var NUM = {
    fortune: [0, 0, 0, 1, 1, 1, 1, 2, 2, 3],
    hoursBase: 6, hoursMin: 2,
    startSilver: 3, startBands: 3, rulerBands: 3,
    musterMax: 3, searchDraw: 3, searchSilver: 1,
    departBands: 4, departRelics: 2,
    seizeRegions: 6,
    retinueMax: 3, slots: 2,
    pactRounds: 3,
    lastRound: 8,
    // end-of-age draws: after round r, the age ends with chance 1 in n
    endDraws: [{ round: 7, of: 2 }],
    shortReign: { round: 5, of: 4 },
    grudgeBreak: 2, grudgeTaken: 1, grudgeMax: 5, debtMax: 3,
    freeHoldBands: 2,
    folk: 1, folkCrown: 2,
    claimFrom: 6, rotate: 1,
    // the Waystone opens for departing in this round
    departFrom: 7,
    // last stand: defence bonus for a house defending the only region it holds
    lastStand: 2,
    // landless return: warbands a house with no region musters free at the start of its turn
    returnBands: 3
  };

  var ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
    'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];
  var ROUND_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

  return {
    REGIONS: REGIONS, REGION_IDS: REGION_IDS, REGION: REGION, EDGE_STARTS: EDGE_STARTS, CROWN_NEIGHBOURS: CROWN_NEIGHBOURS,
    SUITS: SUITS, RESIDENTS: RESIDENTS, VAULT: VAULT, RELICS: RELICS, CARDS: CARDS,
    PROPHECIES: PROPHECIES, LAWS: LAWS, LAW: LAW, MAX_LAWS: MAX_LAWS,
    TEMPERAMENTS: TEMPERAMENTS, HOUSES: HOUSES, FIRST_AGE: FIRST_AGE,
    NUMBER_WORDS: ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'],
    NUM: NUM, ORDINALS: ORDINALS, ROUND_WORDS: ROUND_WORDS
  };
});
