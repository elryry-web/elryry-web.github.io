/* Chapter VI. Midsummer to Lammas: St Alnoth's Day (puzzles 31-36). See AUTHORING.md for the format.
 * chapterIntro on the first puzzle of the chapter is Wystan's opening for the chapter leaf. */
window.STORY = window.STORY || [];
(function () {
  function it(id, name) { return { id: id, name: name }; }
  var ORD5 = [it('p1', 'first'), it('p2', 'second'), it('p3', 'third'), it('p4', 'fourth'), it('p5', 'fifth')];

  // 31 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-31-midsummer-fires',
    chapter: 6, number: 31,
    title: 'Midsummer Fires',
    place: 'the abbey gatehouse',
    characters: ['Tom Webbe', 'Ralph Smith', 'Roger Thatcher', 'Will Hayward', 'Hob', 'Brother Clement'],
    size: '3×4',
    grade: 'Apprentice',
    chapterIntro: "The bell came back from Lynn in Whit week on Piers Carter's cart, and Piers had the receipt this time, in his hat. It is on the same trestles in the tithe barn until the frame is ready, with a cloth over it so that nobody knocks on it. The hay in the abbey meadow is a month late after the flood, and the mill case comes back at Midsummer.",
    intro: "On St John's Eve every end of Mardle makes a fire, and the Prior had me count them from the top of the gatehouse, since a fire near the tithe barn is the abbey's business. There were four. I wrote down how high each was by how far up the sparks went, which Brother Clement says is no measure at all. In the morning I went round the ashes and asked who had built which, and every builder told me his own had been the highest.",
    task: 'Can you work out where each man built his fire and how high it was?',
    categories: [
      { id: 'who', name: 'Builders', items: [it('tom', 'Tom Webbe'), it('ralph', 'Ralph Smith'), it('roger', 'Roger Thatcher'), it('will', 'Will Hayward')] },
      { id: 'where', name: 'Places', who: 'whoever built the fire {x}', is: 'built his fire {x}', isnt: "didn't build his fire {x}", items: [
        it('butts', 'at the Butts'), it('common', 'on the common'), it('green', "on the green by St Mary's"), it('bridge', 'at the bridge end')] },
      { id: 'height', name: 'Heights', who: 'whoever built the fire {x} high', is: 'built a fire {x} high', isnt: "didn't build a fire {x} high",
        ordered: { values: [5, 6, 8, 10] }, items: [it('f5', 'five feet'), it('f6', 'six feet'), it('f8', 'eight feet'), it('f10', 'ten feet')] }
    ],
    clues: [
      { text: 'Tom Webbe built his fire at the Butts, behind the Swan.', logic: ['is', 'tom', 'butts'] },
      { text: 'The highest fire was the one at the Butts.', logic: ['is', 'butts', 'f10'] },
      { text: "Will Hayward's fire was the lowest.", logic: ['is', 'will', 'f5'] },
      { text: 'Roger Thatcher built on the common.', logic: ['is', 'roger', 'common'] },
      { text: 'The fire on the green was six feet high.', logic: ['is', 'green', 'f6'] }
    ],
    solution: { tom: ['butts', 'f10'], ralph: ['green', 'f6'], roger: ['common', 'f8'], will: ['bridge', 'f5'] },
    epilogue: "Tom Webbe's fire at the Butts was the highest, at ten feet, and Roger Thatcher's on the common came next. Hob jumped Ralph Smith's fire on the green at midnight and left a shoe in it. Brother Clement went round all four in the morning with a bucket, and only Ralph's was still warm."
  });

  // 32 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-32-mill-case',
    chapter: 6, number: 32,
    title: 'The Mill Case',
    place: 'Mardle Hall',
    characters: ['Hob', 'Walter Crane', 'Father Simon', 'Roger Thatcher', 'Dame Isabel', 'Abbot Gervase'],
    size: '4×4',
    grade: 'Journeyman',
    intro: "The mill case came back to the hallmote at Midsummer, and the steward had four people say in turn how far Hob's weir ought to go back and what Hob ought to give the abbey, and then he asked the Abbot. I was to write it all down. Hob stood at my elbow the whole time telling me what each of them really meant, and I find that some of what I wrote is what Hob said they meant.",
    task: 'Can you work out the order in which they spoke, how far each wanted the weir moved, and what each asked for?',
    categories: [
      { id: 'who', name: 'Speakers', items: [it('walter', 'Walter Crane'), it('simon', 'Father Simon'), it('roger', 'Roger Thatcher'), it('isabel', 'Dame Isabel')] },
      { id: 'turn', name: 'Spoke', who: 'whoever spoke {x}', is: 'spoke {x}', isnt: "didn't speak {x}",
        ordered: { values: [1, 2, 3, 4] }, items: [it('s1', 'first'), it('s2', 'second'), it('s3', 'third'), it('s4', 'fourth')] },
      { id: 'yards', name: 'Weir moved', who: 'whoever wanted the weir moved {x}', is: 'wanted the weir moved {x}', isnt: "didn't want the weir moved {x}",
        ordered: { values: [2, 3, 5, 8] }, items: [it('y2', 'two yards'), it('y3', 'three yards'), it('y5', 'five yards'), it('y8', 'eight yards')] },
      { id: 'ask', name: 'Asked for', who: 'whoever asked for {x}', is: 'asked for {x}', isnt: "didn't ask for {x}", items: [
        it('sixpence', 'sixpence'), it('nothing', 'nothing'), it('twosticks', 'two sticks of eels'), it('stick', 'a stick of eels')] }
    ],
    clues: [
      { text: 'Dame Isabel spoke last, and the Abbot, who agrees with whoever spoke last, agreed with her.', logic: ['is', 'isabel', 's4'] },
      { text: 'Walter Crane spoke first, in the matter of the weir.', logic: ['is', 'walter', 's1'] },
      { text: 'Father Simon, who will take anybody\'s side against the abbey, asked for nothing.', logic: ['is', 'simon', 'nothing'] },
      { text: 'The two sticks of eels were asked for straight before Dame Isabel spoke.', logic: ['cmp', 'twosticks', 'isabel', 'turn', '=+', -1] },
      { text: 'Walter Crane asked for sixpence, for the manor.', logic: ['is', 'walter', 'sixpence'] },
      { text: 'Whoever asked for two sticks of eels wanted the weir moved two yards further than Dame Isabel did.', logic: ['cmp', 'twosticks', 'isabel', 'yards', '=+', 2] },
      { text: 'Father Simon wanted the weir moved less than anybody.', logic: ['is', 'simon', 'y2'] }
    ],
    solution: { walter: ['s1', 'y8', 'sixpence'], simon: ['s2', 'y2', 'nothing'], roger: ['s3', 'y5', 'twosticks'], isabel: ['s4', 'y3', 'stick'] },
    epilogue: "Dame Isabel spoke last and the Abbot agreed with her, and Hob is to move his weir three yards and give the abbey a stick of eels a year. Walter Crane paced it afterwards and says the weir is still a yard over the line."
  });

  // 33 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-33-haymaking',
    chapter: 6, number: 33,
    title: 'Haymaking',
    place: 'the water meadow',
    characters: ['Will Hayward', 'Hob', 'Roger Thatcher', 'Ralph Smith', 'Tom Webbe', 'Joan Fletcher', 'Agnes Sutor', 'Margery Baxter', 'Emma Dyer', 'Cecily Tolley', 'Brother Clement'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "The abbey's hay is mown in five strips, numbered from the river, and the mowers are paid by the load, so the Prior had me count the loads into the tithe barn while Brother Clement stood in the barn door with a cloth over his face and sneezed. I wrote on my tablet all afternoon, and by the time I came to check it the mowers and their rakers had all gone to the Swan.",
    task: 'Can you work out which strip each man mowed, how many loads he brought in, and who raked for him?',
    categories: [
      { id: 'who', name: 'Mowers', items: [it('will', 'Will Hayward'), it('hob', 'Hob'), it('roger', 'Roger Thatcher'), it('ralph', 'Ralph Smith'), it('tom', 'Tom Webbe')] },
      { id: 'strip', name: 'Strips', who: 'whoever mowed {x}', is: 'mowed {x}', isnt: "didn't mow {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('st1', 'strip 1'), it('st2', 'strip 2'), it('st3', 'strip 3'), it('st4', 'strip 4'), it('st5', 'strip 5')] },
      { id: 'loads', name: 'Loads', who: 'whoever brought in {x}', is: 'brought in {x}', isnt: "didn't bring in {x}",
        ordered: { values: [2, 3, 4, 5, 6] }, items: [it('l2', 'two loads'), it('l3', 'three loads'), it('l4', 'four loads'), it('l5', 'five loads'), it('l6', 'six loads')] },
      { id: 'raker', name: 'Rakers', who: 'the man {x} raked for', is: 'had {x} raking for him', isnt: "didn't have {x} raking for him", items: [
        it('joan', 'Joan Fletcher'), it('agnes', 'Agnes Sutor'), it('margery', 'Margery Baxter'), it('emma', 'Emma Dyer'), it('cecily', 'Cecily Tolley')] }
    ],
    clues: [
      { text: 'Hob mowed strip 1, the wet one nearest the river.', logic: ['is', 'hob', 'st1'] },
      { text: 'Will Hayward brought in the most loads.', logic: ['is', 'will', 'l6'] },
      { text: 'Margery Baxter raked for the man who brought in three loads.', logic: ['is', 'margery', 'l3'] },
      { text: "Agnes Sutor raked the strip next to Hob's.", logic: ['cmp', 'agnes', 'hob', 'strip', 'adj'] },
      { text: 'Joan Fletcher raked further from the river than Emma Dyer.', logic: ['cmp', 'joan', 'emma', 'strip', '>'] },
      { text: 'Of Ralph Smith and the man Emma Dyer raked for, one mowed strip 4 and the other brought in five loads.', logic: ['pairOr', 'ralph', 'emma', 'st4', 'l5'] },
      { text: "Emma Dyer didn't rake for Hob.", logic: ['not', 'emma', 'hob'] },
      { text: 'Tom Webbe, who sang the whole afternoon, brought in the fewest loads.', logic: ['is', 'tom', 'l2'] },
      { text: "Tom Webbe's strip was further from the river than Ralph Smith's.", logic: ['cmp', 'tom', 'ralph', 'strip', '>'] },
      { text: 'Cecily Tolley raked the strip furthest from the river.', logic: ['is', 'cecily', 'st5'] }
    ],
    solution: { hob: ['st1', 'l3', 'margery'], will: ['st2', 'l6', 'agnes'], roger: ['st3', 'l5', 'emma'], ralph: ['st4', 'l4', 'joan'], tom: ['st5', 'l2', 'cecily'] },
    epilogue: "Will Hayward brought in six loads off strip 2 with Agnes Sutor raking, and Hob brought in three off the strip by the river. Hob says the river is partly in his strip. Brother Clement counted from the barn door too, and his count was one more than mine."
  });

  // 34 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-34-abbots-pears',
    chapter: 6, number: 34,
    title: "The Abbot's Pears",
    place: "the Abbot's pear orchard",
    characters: ['Abbot Gervase', 'Prior Hamo', 'Kit', 'Brother Odo', 'Brother Anselm'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "Somebody was at the Abbot's pear trees every day last week, Monday to Friday, a different tree each day, and the Abbot counts his pears, so he knew how many had gone from each tree. The Prior sent me to the orchard to ask him which tree had lost what, and on which day. He told me while he counted what was left on the trees, and each time I asked him something he lost his count and began again at the first tree.",
    task: 'Can you work out who took pears from which tree, on which day, and how many?',
    categories: [
      { id: 'who', name: 'Takers', items: [it('kit', 'Kit'), it('mule', 'Bishop, the mule'), it('odo', 'Brother Odo'), it('anselm', 'Brother Anselm'), it('abbot', 'the Abbot')] },
      { id: 'tree', name: 'Trees', who: 'whoever took from the tree {x}', is: 'took from the tree {x}', isnt: "didn't take from the tree {x}", items: [
        it('gate', 'by the gate'), it('wall', 'by the wall'), it('well', 'by the well'), it('skeps', 'by the bee skeps'), it('infirmary', 'by the infirmary')] },
      { id: 'day', name: 'Days', who: 'whoever took pears on {x}', is: 'took pears on {x}', isnt: "didn't take pears on {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('mon', 'Monday'), it('tue', 'Tuesday'), it('wed', 'Wednesday'), it('thu', 'Thursday'), it('fri', 'Friday')] },
      { id: 'pears', name: 'Pears', who: 'whoever took {x}', is: 'took {x}', isnt: "didn't take {x}",
        ordered: { values: [2, 3, 5, 7, 12] }, items: [it('n2', 'two pears'), it('n3', 'three pears'), it('n5', 'five pears'), it('n7', 'seven pears'), it('n12', 'twelve pears')] }
    ],
    clues: [
      { text: 'Kit went first, on the Monday.', logic: ['is', 'kit', 'mon'] },
      { text: 'Kit took his from the tree by the gate.', logic: ['is', 'kit', 'gate'] },
      { text: 'The tree by the infirmary lost the most.', logic: ['is', 'infirmary', 'n12'] },
      { text: 'The fewest pears went on the Tuesday.', logic: ['is', 'n2', 'tue'] },
      { text: 'Brother Anselm took more than Brother Odo.', logic: ['cmp', 'anselm', 'odo', 'pears', '>'] },
      { text: 'The tree by the bee skeps was stripped the day before the tree by the infirmary.', logic: ['cmp', 'skeps', 'infirmary', 'day', '=+', -1] },
      { text: 'Of the Abbot and whoever took pears on Wednesday, one took from the tree by the infirmary and the other took five.', logic: ['pairOr', 'abbot', 'wed', 'infirmary', 'n5'] },
      { text: 'Kit took fewer than Brother Odo.', logic: ['cmp', 'kit', 'odo', 'pears', '<'] },
      { text: 'Brother Odo took his from the tree by the well, for a tart.', logic: ['is', 'odo', 'well'] },
      { text: 'Brother Anselm, who keeps the bees, took from the tree by the skeps.', logic: ['is', 'anselm', 'skeps'] }
    ],
    solution: { kit: ['gate', 'mon', 'n3'], mule: ['wall', 'tue', 'n2'], odo: ['well', 'wed', 'n5'], anselm: ['skeps', 'thu', 'n7'], abbot: ['infirmary', 'fri', 'n12'] },
    epilogue: "The Abbot took twelve off the infirmary tree on Friday, to see if they were ready, and they were not. Kit says he was promised pears at Christmas. The Prior wrote Brother Odo, Brother Anselm and the mule in his book."
  });

  // 35 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-35-st-alnoth',
    chapter: 6, number: 35,
    title: "St Alnoth's Day",
    place: 'the market square',
    characters: ['Kit', 'Father Simon', 'Brother Odo', 'Margery Baxter', 'Hal Sutor', 'Piers Carter'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "On St Alnoth's Day the recast bell was rung from the tower for the first time, and it rang all the while the procession went from the town to the abbey. Five people had something to carry or lead in the procession, and each joined it at a different place. I had the second banner again, as at Rogation, and the wind had it over my head from the Swan to the bridge, so I have put this together from what I saw under it.",
    task: 'Can you work out where each walked in the procession, what each had, and where each joined it?',
    categories: [
      { id: 'who', name: 'People', items: [it('hal', 'Hal Sutor'), it('simon', 'Father Simon'), it('odo', 'Brother Odo'), it('margery', 'Margery Baxter'), it('kit', 'Kit')] },
      { id: 'place', name: 'Places in the procession', who: 'whoever walked {x}', is: 'walked {x}', isnt: "didn't walk {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: ORD5 },
      { id: 'had', name: 'Had', who: 'whoever had {x}', is: 'had {x}', isnt: "didn't have {x}", items: [
        it('cross', 'the cross'), it('water', 'the holy water'), it('banner', 'the first banner'), it('candles', 'the candles'), it('cart', 'the cart')] },
      { id: 'joined', name: 'Joined', who: 'whoever joined {x}', is: 'joined {x}', isnt: "didn't join {x}", items: [
        it('swan', 'at the Swan'), it('stmarys', "at St Mary's"), it('gate', 'at the abbey gate'), it('mcross', 'at the market cross'), it('bridge', 'at the Long Bridge')] }
    ],
    clues: [
      { text: "Father Simon joined at St Mary's, his own church.", logic: ['is', 'simon', 'stmarys'] },
      { text: 'Kit and the cart came last.', logic: [['is', 'kit', 'p5'], ['is', 'kit', 'cart']] },
      { text: 'Brother Odo had the first banner, which wants a man his size in any wind.', logic: ['is', 'odo', 'banner'] },
      { text: 'The candles came straight after whoever joined at the abbey gate.', logic: ['cmp', 'candles', 'gate', 'place', '=+', 1] },
      { text: 'Of Hal Sutor and whoever joined at the market cross, one had the cross and the other walked fourth.', logic: ['pairOr', 'hal', 'mcross', 'cross', 'p4'] },
      { text: "Whoever joined at the Swan walked nearer the front than whoever joined at St Mary's.", logic: ['cmp', 'swan', 'stmarys', 'place', '<'] },
      { text: 'Brother Odo walked straight after Father Simon.', logic: ['cmp', 'odo', 'simon', 'place', '=+', 1] },
      { text: 'Whoever joined at the abbey gate walked third.', logic: ['is', 'gate', 'p3'] }
    ],
    solution: { hal: ['p1', 'cross', 'swan'], simon: ['p2', 'water', 'stmarys'], odo: ['p3', 'banner', 'gate'], margery: ['p4', 'candles', 'mcross'], kit: ['p5', 'cart', 'bridge'] },
    epilogue: "Kit walked last with the cart and the dole loaves, and none were missing, though Brother Odo counted them twice. The new bell rang the whole way with no crack in it. The Abbot blessed it after Vespers, and Father Simon stood on his left side and asked again about the mule's name."
  });

  // 36 ------------------------------------------------------------------
  STORY.push({
    id: 'ch6-36-lammas',
    chapter: 6, number: 36,
    title: 'Lammas',
    place: 'the scriptorium',
    characters: ['Hob', 'Ralph Smith', 'Agnes Sutor', 'Joan Fletcher', 'Margery Baxter', 'Brother Anselm', 'Prior Hamo'],
    size: '4×5',
    grade: 'Master',
    intro: "The Prior had my gatherings bound in the week before Lammas, and the things for the binding came from the town, one a day from Monday to Friday, each brought by somebody who wanted one thing in the chronicle put right in return. I wrote each thing on a slip. Brother Anselm, who does the binding, used the slips to pack the spine, humming, so this is from memory. Margery Baxter baked the Lammas loaf for St Mary's that week, and the crust had her thumbprint in it.",
    task: 'Can you work out what each person brought, on which day, and what each wanted put right?',
    categories: [
      { id: 'who', name: 'Givers', items: [it('hob', 'Hob'), it('ralph', 'Ralph Smith'), it('agnes', 'Agnes Sutor'), it('joan', 'Joan Fletcher'), it('margery', 'Margery Baxter')] },
      { id: 'gift', name: 'Brought', who: 'whoever brought {x}', is: 'brought {x}', isnt: "didn't bring {x}", items: [
        it('boards', 'the boards'), it('clasp', 'the clasp'), it('leather', 'the leather'), it('thread', 'the thread'), it('paste', 'the paste')] },
      { id: 'day', name: 'Days', who: 'whoever came on {x}', is: 'came on {x}', isnt: "didn't come on {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('mon', 'Monday'), it('tue', 'Tuesday'), it('wed', 'Wednesday'), it('thu', 'Thursday'), it('fri', 'Friday')] },
      { id: 'fix', name: 'Wanted written', who: 'whoever wanted it written {x}', is: 'wanted it written {x}', isnt: "didn't want it written {x}", items: [
        it('stone', 'that the stone had moved'), it('fire', 'that the fire on the green was highest'), it('cellar', "that the Sutors' cellar took least water"), it('peg', 'that the peg counted'), it('flour', 'that the flour had been wet')] }
    ],
    clues: [
      { text: 'The paste came on the Friday.', logic: ['is', 'paste', 'fri'] },
      { text: 'Ralph Smith came the day after Hob.', logic: ['cmp', 'ralph', 'hob', 'day', '=+', 1] },
      { text: 'Whoever wanted it written that the peg counted came the day after the leather.', logic: ['cmp', 'peg', 'leather', 'day', '=+', 1] },
      { text: 'Of Agnes Sutor and whoever came on Tuesday, one brought the leather and the other wanted it written that the fire on the green was highest.', logic: ['pairOr', 'agnes', 'tue', 'leather', 'fire'] },
      { text: "Agnes Sutor didn't want anything written about the flour.", logic: ['not', 'agnes', 'flour'] },
      { text: 'The clasp came earlier in the week than the thread.', logic: ['cmp', 'clasp', 'thread', 'day', '<'] },
      { text: 'Whoever wanted it written that the stone had moved came on the Monday.', logic: ['is', 'stone', 'mon'] },
      { text: 'Joan Fletcher wanted it written either that the peg counted or that the fire on the green was highest.', logic: ['either', 'joan', ['peg', 'fire']] },
      { text: "Ralph Smith made the clasp out of the old bell's clapper.", logic: ['is', 'ralph', 'clasp'] },
      { text: 'Whoever wanted it written that the peg counted came later than Hob and earlier than Margery Baxter.', logic: [['cmp', 'peg', 'hob', 'day', '>'], ['cmp', 'peg', 'margery', 'day', '<']] }
    ],
    solution: { hob: ['boards', 'mon', 'stone'], ralph: ['clasp', 'tue', 'fire'], agnes: ['leather', 'wed', 'cellar'], joan: ['thread', 'thu', 'peg'], margery: ['paste', 'fri', 'flour'] },
    epilogue: "So the chronicle is bound in the boards of Hob's old weir, sewn with Joan's thread under Agnes Sutor's leather, and Ralph's clasp shuts it. The Prior allowed one correction, Margery's, and I wrote it in the margin of the hallmote entry. Brother Anselm put the book on the shelf by the cloister door to let the paste dry."
  });
})();
