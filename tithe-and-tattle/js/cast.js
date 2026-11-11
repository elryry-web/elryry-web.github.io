/* Tithe & Tattle: the cast, for Who's Who.
 *   CAST.list   [{id, name, group, desc, names: [aliases]}]  (desc is Wystan's, 25 words or fewer)
 *   CAST.match(name) -> cast id or null   ("Dame Isabel", "Dame Isabel de Mardle" and "the Prior" all match)
 *   CAST.meet(p)     records everyone in a story puzzle's characters as met (first puzzle wins)
 *   CAST.backfill()  meets the people of every puzzle the save shows was opened (older saves)
 * SAVE.data.met = {castId: puzzleId}
 */
(function () {
  'use strict';
  var L = [
    // the abbey
    ['wystan', 'abbey', 'Brother Wystan', ['Wystan'],
      'I am the youngest monk at St Alnoth’s, nineteen or near it, and the Abbot has set me to keep this chronicle of the year.'],
    ['gervase', 'abbey', 'Abbot Gervase', ['the Abbot', 'Gervase'],
      'The Abbot hears nothing on his left side, so anyone wanting something of him stands on his right. He walks in his pear orchard after None.'],
    ['hamo', 'abbey', 'Prior Hamo', ['the Prior', 'Hamo'],
      'The Prior keeps a small book of everybody’s faults, with the dates, and I have not once seen him sit down.'],
    ['odo', 'abbey', 'Brother Odo', ['Odo', 'the cellarer'],
      'Brother Odo, our cellarer, brews the abbey ale and says it is better than the Swan’s. He will not go near the bee garden.'],
    ['clement', 'abbey', 'Brother Clement', ['Clement', 'the infirmarian'],
      'Brother Clement keeps the infirmary and the herb garden and holds that most illness comes from eating standing up. He sneezes at hay.'],
    ['anselm', 'abbey', 'Brother Anselm', ['Anselm'],
      'Brother Anselm is a lay brother and works at the fishponds and the tithe barn, humming the same tune the whole day.'],
    ['bishop', 'abbey', 'The Bishop', ['the Bishop', 'my lord Bishop'],
      'The Bishop came to inspect us before May Day, and asked each monk in turn whose faults he knew of, his own included.'],
    // the town
    ['alys', 'town', 'Alys Pennock', ['Alys', 'Mistress Pennock'],
      'Alys Pennock keeps the Swan. She can tell you what every man in Mardle drank last Martinmas and what he still owes for it.'],
    ['hob', 'town', 'Hob', ['Robert atte Mille', 'Hob the miller', 'the miller'],
      'Hob the miller, Robert atte Mille by rights, keeps the mill below the Long Bridge. His weir stands a few yards into the abbey’s water.'],
    ['walter', 'town', 'Walter Crane', ['Walter', 'the reeve'],
      'Walter Crane is the reeve and carries a notched tally stick everywhere. He is also the ale-conner, which takes him to the Swan most days.'],
    ['tolley', 'town', 'Widow Tolley', ['the Widow', 'Mother Tolley'],
      'Widow Tolley is the oldest woman in Mardle and sits at her door on the north side of the square. She is exact about dates.'],
    ['joan', 'town', 'Joan Fletcher', ['Joan'],
      'Joan Fletcher makes arrows and is the best shot at the Butts. She is not married and is in no hurry about it.'],
    ['tom', 'town', 'Tom Webbe', ['Tom', 'the weaver'],
      'Tom Webbe the weaver sings at his loom, not well, and can be heard from the square. He shoots against Joan Fletcher at the Butts.'],
    ['piers', 'town', 'Piers Carter', ['Piers', 'the carter'],
      'Piers Carter carts goods between Mardle and Lynn and has a reason for every time he is late. His mule is called Bishop.'],
    ['kit', 'town', 'Kit', ['Kit Pennock'],
      'Kit, Alys Pennock’s nephew, is ten and runs messages about the town for a farthing. What he tells you is true about half the time.'],
    ['simon', 'town', 'Father Simon', ['Simon', 'the priest'],
      'Father Simon is priest of St Mary’s and disputes the abbey’s burial fees. He will not say the name of Piers Carter’s mule.'],
    ['isabel', 'town', 'Dame Isabel de Mardle', ['Dame Isabel', 'Isabel de Mardle', 'the lady of the manor'],
      'Dame Isabel is lady of the manor and a widow, and flies her hawks on the common. She remembers who did not bow to her.'],
    // others of Mardle
    ['agnes', 'others', 'Agnes Sutor', ['Agnes'],
      'Agnes Sutor is the cobbler, and has resoled most of the sandals in the abbey at one time or another.'],
    ['margery', 'others', 'Margery Baxter', ['Margery'],
      'Margery Baxter is the baker. Her oven is on the square, and in winter people find reasons to stand beside it.'],
    ['roger', 'others', 'Roger Thatcher', ['Roger'],
      'Roger Thatcher thatches roofs and holds a fen tenancy of the abbey, and pays his rent in eels at Michaelmas.'],
    ['emma', 'others', 'Emma Dyer', ['Emma'],
      'Emma Dyer dyes cloth, and her hands are blue to the wrist most of the year. She pays the abbey in eels as well.'],
    ['will', 'others', 'Will Hayward', ['Will', 'the hayward'],
      'Will Hayward keeps the hedges and the common, and says which pigs may go into Mardle Wood, and when.'],
    ['cecily', 'others', 'Cecily Tolley', ['Cecily'],
      'Cecily Tolley, the Widow’s granddaughter, is sent to find out whatever the Widow cannot see from her door.'],
    ['sim', 'others', 'Sim Shepherd', ['Sim'],
      'Sim Shepherd keeps the town’s sheep on the common and comes down to the square on market days.'],
    ['isolda', 'others', 'Isolda Brewer', ['Isolda'],
      'Isolda Brewer brews ale at home and sells it at her door on fair days. Walter Crane tastes it for the court.'],
    ['ralph', 'others', 'Ralph Smith', ['Ralph', 'the smith'],
      'Ralph Smith keeps the forge on the Lynn road and shoes the horses at Mardle Hall and Piers Carter’s mule.'],
    ['hal', 'others', 'Hal Sutor', ['Hal'],
      'Hal Sutor sings in the choir at St Mary’s, and Father Simon puts him in every procession the parish has.']
  ];
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/^the\s+/, '').replace(/\s+/g, ' ').trim(); }
  var byName = {}, list = L.map(function (r) {
    var c = { id: r[0], group: r[1], name: r[2], names: [r[2]].concat(r[3]), desc: r[4] };
    c.names.forEach(function (n) { byName[norm(n)] = c.id; });
    return c;
  });
  var byId = {}; list.forEach(function (c) { byId[c.id] = c; });

  var CAST = window.CAST = {
    list: list, byId: byId,
    GROUPS: [['abbey', 'The abbey'], ['town', 'The town'], ['others', 'Others of Mardle']],
    match: function (name) { return byName[norm(name)] || null; },
    people: function (p) {
      var raw = (p && (p.characters || p.cast || p.people)) || [], out = [];
      if (!Array.isArray(raw)) raw = [raw];
      raw.forEach(function (n) { var id = CAST.match(n && n.name ? n.name : n); if (id && out.indexOf(id) < 0) out.push(id); });
      return out;
    },
    meet: function (p) {
      if (!p || p.sample || !window.SAVE) return 0;
      var met = SAVE.data.met || (SAVE.data.met = {}), n = 0;
      CAST.people(p).forEach(function (id) { if (!met[id]) { met[id] = p.id; n++; } });
      if (n) SAVE.write();
      return n;
    },
    backfill: function () {
      if (!window.STORYC || !window.SAVE) return;
      STORYC.list.forEach(function (p) { var r = SAVE.data.puz[p.id]; if (SAVE.data.solved[p.id] || (r && (r.seen || r.m))) CAST.meet(p); });
    }
  };
})();
