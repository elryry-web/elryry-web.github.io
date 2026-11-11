/* Chapter IV. Lent: High Water (puzzles 19-24). See AUTHORING.md for the format.
 * chapterIntro on the first puzzle of the chapter is Wystan's opening for the chapter leaf. */
window.STORY = window.STORY || [];
(function () {
  function it(id, name) { return { id: id, name: name }; }
  var DAYS4 = { id: 'day', name: 'Days', who: 'the cellar that flooded on {x}', is: 'flooded on {x}', isnt: "didn't flood on {x}",
    ordered: { values: [1, 2, 3, 4] }, items: [it('mon', 'Monday'), it('tue', 'Tuesday'), it('wed', 'Wednesday'), it('thu', 'Thursday')] };

  // 19 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-19-lenten-fish',
    chapter: 4, number: 19,
    title: 'Lenten Fish',
    place: 'the abbey gate',
    characters: ['Piers Carter', 'Brother Odo', 'Alys Pennock', 'Father Simon', 'Dame Isabel'],
    size: '3×4',
    grade: 'Apprentice',
    chapterIntro: "Lent began on the fourth of March, and the Abbot said a new season wants a new gathering, so this is the new gathering. The cracked bell is still down from the tower, on trestles in the tithe barn, and anybody who goes in for straw knocks on it to hear the crack. It began to rain in the second week of Lent. I will put down when it stopped.",
    intro: "Piers Carter brings the Lent fish up from Lynn, and every year there is an argument about who ordered what, so this year the Prior had me write it down at the gate. Piers had a list made by a clerk on the quay at Lynn and Brother Odo had a list he made himself, and the two lists do not agree. I have put down only what is on both, and Piers's mule, Bishop, ate the corner of the clerk's list while we were comparing them.",
    task: 'Can you work out which fish each of them ordered and how much each paid?',
    categories: [
      { id: 'who', name: 'Buyers', items: [it('odo', 'Brother Odo'), it('alys', 'Alys Pennock'), it('simon', 'Father Simon'), it('isabel', 'Dame Isabel')] },
      { id: 'fish', name: 'Fish', who: 'whoever ordered {x}', is: 'ordered {x}', isnt: "didn't order {x}", items: [
        it('stock', 'stockfish'), it('herring', 'red herrings'), it('eels', 'salt eels'), it('pike', 'a pike')] },
      { id: 'paid', name: 'Paid', who: 'whoever paid {x}', is: 'paid {x}', isnt: "didn't pay {x}",
        ordered: { values: [4, 8, 10, 12] }, items: [it('d4', 'fourpence'), it('d8', 'eightpence'), it('d10', 'tenpence'), it('d12', 'twelvepence')] }
    ],
    clues: [
      { text: 'Brother Odo, who says stockfish must be beaten with a mallet for an hour before it will soak, paid more than anyone else.', logic: ['is', 'odo', 'd12'] },
      { text: 'Father Simon paid the least.', logic: ['is', 'simon', 'd4'] },
      { text: 'Alys Pennock ordered neither the pike nor the stockfish.', logic: [['not', 'alys', 'pike'], ['not', 'alys', 'stock']] },
      { text: 'The salt eels cost fourpence, which Odo says is a scandal with the fen full of eels.', logic: ['is', 'eels', 'd4'] },
      { text: 'Only Father Simon paid less than Alys Pennock.', logic: ['is', 'alys', 'd8'] },
      { text: 'The pike cost less than the stockfish.', logic: ['cmp', 'pike', 'stock', 'paid', '<'] }
    ],
    solution: { odo: ['stock', 'd12'], alys: ['herring', 'd8'], simon: ['eels', 'd4'], isabel: ['pike', 'd10'] },
    epilogue: "Brother Odo paid twelvepence for the stockfish and beat it in the kitchen yard most of Thursday, and Dame Isabel's pike came up the road alive in a tub. Alys had the red herrings for the Swan. While Odo was beating the fish it began to rain, and it went on raining."
  });

  // 20 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-20-four-cellars',
    chapter: 4, number: 20,
    title: 'Four Cellars',
    place: 'the market square',
    characters: ['Walter Crane', 'Alys Pennock', 'Agnes Sutor', 'Margery Baxter', 'Widow Tolley', 'Tom Webbe'],
    size: '4×4',
    grade: 'Journeyman',
    intro: "The rain began on a Monday, and from Monday to Thursday a cellar on the square went under each day. Walter Crane went round with his tally stick, the one he keeps the Swan's debts on, and at each cellar he stood the stick in the water and cut a notch where it came to. So the depths of four cellars are on that stick among what Tom Webbe owes for ale, and Walter says he knows which notch is which, though he read them to me differently each time.",
    task: 'Can you work out what was spoiled in each cellar, how deep the water was, and on which day it came in?',
    categories: [
      { id: 'who', name: 'Householders', items: [it('alys', 'Alys Pennock'), it('agnes', 'Agnes Sutor'), it('margery', 'Margery Baxter'), it('tolley', 'Widow Tolley')] },
      { id: 'lost', name: 'Spoiled', who: 'the cellar where the {x} were kept', is: 'lost the {x}', isnt: "didn't lose the {x}", items: [
        it('malt', 'malt'), it('hides', 'hides'), it('flour', 'flour'), it('turves', 'turves')] },
      { id: 'depth', name: 'Depth', who: 'the cellar with {x} of water', is: 'had {x} of water', isnt: "didn't have {x} of water",
        ordered: { values: [3, 6, 9, 12] }, items: [it('in3', 'three inches'), it('in6', 'six inches'), it('in9', 'nine inches'), it('in12', 'twelve inches')] },
      DAYS4
    ],
    clues: [
      { text: "The flour was spoiled the day before Agnes Sutor's cellar flooded.", logic: ['cmp', 'flour', 'agnes', 'day', '=+', -1] },
      { text: "Widow Tolley's cellar flooded later in the week than Agnes Sutor's, and it wasn't the deepest.", logic: [['cmp', 'tolley', 'agnes', 'day', '>'], ['not', 'tolley', 'in12']] },
      { text: 'The water over the malt was six inches deeper than the water in the cellar that flooded on Wednesday.', logic: ['cmp', 'malt', 'wed', 'depth', '=+', 6] },
      { text: 'Of Margery Baxter and the householder whose cellar flooded on Thursday, one had nine inches of water and the other kept malt.', logic: ['pairOr', 'margery', 'thu', 'in9', 'malt'] },
      { text: 'Agnes Sutor had the least water.', logic: ['is', 'agnes', 'in3'] },
      { text: 'The turves were spoiled later in the week than the hides.', logic: ['cmp', 'turves', 'hides', 'day', '>'] }
    ],
    solution: { alys: ['malt', 'in12', 'thu'], agnes: ['hides', 'in3', 'tue'], margery: ['flour', 'in9', 'mon'], tolley: ['turves', 'in6', 'wed'] },
    epilogue: "The Swan's malt was under twelve inches of water from Thursday, and Brother Odo came across to look at it and told Alys that the abbey's malt was dry. Widow Tolley lost her turves on the Wednesday and gave me the date of every flood since 1290. On the Friday the Long Bridge went."
  });

  // 21 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-21-long-bridge',
    chapter: 4, number: 21,
    title: 'The Long Bridge',
    place: 'the Long Bridge',
    characters: ['Piers Carter', 'Kit', 'Hob', 'Walter Crane', 'Margery Baxter', 'Brother Clement', 'Father Simon', 'Joan Fletcher'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "The Long Bridge went in the night, all but the two ends, and the toll box on the town end had not been emptied since Candlemas. Piers Carter borrowed Hob's eel boat and took people over the Lumm for whatever they would give him, with Kit bailing. I stood on the bank and wrote down each trip, the first to the fifth, on a page I kept under my scapular, and the rain got under the scapular, and now half of every line is a brown cloud.",
    task: 'Can you work out the order of the five trips, and what each passenger carried and paid?',
    categories: [
      { id: 'who', name: 'Passengers', items: [it('walter', 'Walter Crane'), it('joan', 'Joan Fletcher'), it('margery', 'Margery Baxter'), it('clement', 'Brother Clement'), it('simon', 'Father Simon')] },
      { id: 'trip', name: 'Trips', who: 'the passenger on the {x}', is: 'crossed on the {x}', isnt: "didn't cross on the {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('t1', 'first trip'), it('t2', 'second trip'), it('t3', 'third trip'), it('t4', 'fourth trip'), it('t5', 'fifth trip')] },
      { id: 'cargo', name: 'Carried', who: 'the passenger with {x}', is: 'carried {x}', isnt: "didn't carry {x}", items: [
        it('box', 'the toll box'), it('arrows', 'a sheaf of arrows'), it('flour', 'a sack of flour'), it('grease', 'a pot of goose grease'), it('eggs', 'a basket of eggs')] },
      { id: 'fare', name: 'Fares', who: 'the passenger who paid {x}', is: 'paid {x}', isnt: "didn't pay {x}", items: [
        it('nothing', 'nothing'), it('penny', 'a penny'), it('loaf', 'a loaf'), it('half', 'a halfpenny'), it('twopence', 'twopence')] }
    ],
    clues: [
      { text: 'Walter Crane carried the toll box, which he had fished out of the reeds, and it went over on the first trip.', logic: [['is', 'walter', 'box'], ['is', 'box', 't1']] },
      { text: 'The arrows crossed on the trip straight after the one that carried the passenger who paid nothing.', logic: ['cmp', 'arrows', 'nothing', 'trip', '=+', 1] },
      { text: 'Of Joan Fletcher and Brother Clement, one paid a halfpenny and the other carried the arrows.', logic: ['pairOr', 'joan', 'clement', 'half', 'arrows'] },
      { text: 'Margery Baxter crossed later than Joan Fletcher but earlier than Father Simon.', logic: [['cmp', 'margery', 'joan', 'trip', '>'], ['cmp', 'margery', 'simon', 'trip', '<']] },
      { text: 'The eggs, which nobody may eat until Easter, went over on the trip straight after Brother Clement.', logic: ['cmp', 'eggs', 'clement', 'trip', '=+', 1] },
      { text: 'Margery Baxter paid with a loaf.', logic: ['is', 'margery', 'loaf'] },
      { text: 'The goose grease crossed after the flour and before the eggs.', logic: [['cmp', 'grease', 'flour', 'trip', '>'], ['cmp', 'grease', 'eggs', 'trip', '<']] },
      { text: "Joan Fletcher, who said the fare was robbery, didn't pay twopence.", logic: ['not', 'joan', 'twopence'] }
    ],
    solution: { walter: ['t1', 'box', 'nothing'], joan: ['t2', 'arrows', 'penny'], margery: ['t3', 'flour', 'loaf'], clement: ['t4', 'grease', 'half'], simon: ['t5', 'eggs', 'twopence'] },
    epilogue: "Walter Crane went first with the toll box and paid nothing, and Father Simon went last with the Easter eggs and paid twopence. On the far bank Walter broke the toll box open to count it. There was ninepence in it and a good deal of the Lumm, and he cut the ninepence on his stick."
  });

  // 22 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-22-guest-house',
    chapter: 4, number: 22,
    title: 'The Guest House',
    place: 'the abbey guest house',
    characters: ['Abbot Gervase', 'Joan Fletcher', 'Tom Webbe', 'Widow Tolley', 'Agnes Sutor', 'Brother Anselm'],
    size: '4×4',
    grade: 'Journeyman',
    intro: "The people whose houses were wet came over to the abbey guest house, which has four beds, and the Abbot gave out the beds. Everyone wanted the bed by the fire, and he promised it to each of them as they asked, so it was promised four times. The beds are numbered from the door, so bed 4 is the one by the fire.",
    task: 'Can you work out who slept in each bed, what each brought and what each complained about?',
    categories: [
      { id: 'who', name: 'Guests', items: [it('agnes', 'Agnes Sutor'), it('tom', 'Tom Webbe'), it('joan', 'Joan Fletcher'), it('tolley', 'Widow Tolley')] },
      { id: 'bed', name: 'Beds', who: 'the guest in {x}', is: 'slept in {x}', isnt: "didn't sleep in {x}",
        ordered: { values: [1, 2, 3, 4] }, items: [it('b1', 'bed 1'), it('b2', 'bed 2'), it('b3', 'bed 3'), it('b4', 'bed 4')] },
      { id: 'brought', name: 'Brought', who: 'the guest who brought {x}', is: 'brought {x}', isnt: "didn't bring {x}", items: [
        it('lantern', 'a lantern'), it('bolster', 'a feather bolster'), it('honey', 'a pot of honey'), it('hen', 'a hen')] },
      { id: 'moan', name: 'Complaints', who: 'the guest who complained about {x}', is: 'complained about {x}', isnt: "didn't complain about {x}", items: [
        it('draught', 'the draught'), it('humming', 'the humming'), it('ofhen', 'the hen'), it('singing', 'the singing')] }
    ],
    clues: [
      { text: 'The guest who brought the hen slept nearer the fire than the guest who complained about it.', logic: ['cmp', 'hen', 'ofhen', 'bed', '>'] },
      { text: "Tom Webbe, who sang until Matins, complained either about Brother Anselm's humming or about the draught.", logic: ['either', 'tom', ['humming', 'draught']] },
      { text: "Joan Fletcher's bed was next to Widow Tolley's.", logic: ['cmp', 'joan', 'tolley', 'bed', 'adj'] },
      { text: "Agnes Sutor brought neither the honey nor the bolster.", logic: [['not', 'agnes', 'honey'], ['not', 'agnes', 'bolster']] },
      { text: 'Widow Tolley slept further from the door than Tom Webbe.', logic: ['cmp', 'tolley', 'tom', 'bed', '>'] },
      { text: 'The draught was complained about from bed 1.', logic: ['is', 'draught', 'b1'] },
      { text: 'Widow Tolley brought the hen, which she says lays better by a fire.', logic: ['is', 'tolley', 'hen'] },
      { text: 'Agnes Sutor slept nearer the door than Tom Webbe.', logic: ['cmp', 'agnes', 'tom', 'bed', '<'] },
      { text: 'The feather bolster was nearer the door than the honey.', logic: ['cmp', 'bolster', 'honey', 'bed', '<'] }
    ],
    solution: { agnes: ['b1', 'lantern', 'draught'], tom: ['b2', 'bolster', 'humming'], joan: ['b3', 'honey', 'ofhen'], tolley: ['b4', 'hen', 'singing'] },
    epilogue: "Widow Tolley had the fire and her hen, and Joan Fletcher lay next to them and complained about the hen all night. The Widow complained about the singing. Tom complained about the humming. Hob would not come. He sent word that the abbey's water was in his mill."
  });

  // 23 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-23-mill-wheel',
    chapter: 4, number: 23,
    title: 'The Mill Wheel',
    place: "Hob's mill",
    characters: ['Hob', 'Kit', 'Will Hayward', 'Brother Anselm', 'Roger Thatcher', 'Walter Crane'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "Hob's wheel jammed every day from Monday to Friday, and each day somebody had to go down into the race and pull something out of it. I have the whole week from Hob, who told it in his doorway with the water round his boots. The Prior wants a plain account because the abbey says the flood came over the meadow at Hob's weir, and Hob blames a different thing every time he is asked.",
    task: 'Can you work out who cleared the wheel on each day, what was caught in it, and what Hob blamed?',
    categories: [
      { id: 'who', name: 'Cleared by', items: [it('will', 'Will Hayward'), it('hob', 'Hob'), it('kit', 'Kit'), it('anselm', 'Brother Anselm'), it('roger', 'Roger Thatcher')] },
      { id: 'day', name: 'Days', who: 'whoever cleared it on {x}', is: 'cleared it on {x}', isnt: "didn't clear it on {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('mon', 'Monday'), it('tue', 'Tuesday'), it('wed', 'Wednesday'), it('thu', 'Thursday'), it('fri', 'Friday')] },
      { id: 'jam', name: 'Caught', who: 'whoever pulled out {x}', is: 'pulled out {x}', isnt: "didn't pull out {x}", items: [
        it('hurdle', 'a hurdle'), it('plank', 'a plank of the bridge'), it('sheep', 'a drowned sheep'), it('trap', 'an abbey eel trap'), it('door', 'a cellar door')] },
      { id: 'blame', name: 'Hob blamed', who: 'the day Hob blamed {x}', is: 'was there when Hob blamed {x}', isnt: "wasn't there when Hob blamed {x}", items: [
        it('rain', 'the rain'), it('reeve', 'the reeve'), it('otters', 'the otters'), it('abbey', 'the abbey'), it('bkit', 'Kit')] }
    ],
    clues: [
      { text: "The abbey's own eel trap came out of the wheel the day after the drowned sheep.", logic: ['cmp', 'trap', 'sheep', 'day', '=+', 1] },
      { text: 'Hob blamed the otters for the sheep.', logic: ['is', 'otters', 'sheep'] },
      { text: 'Hob cleared his own wheel the day before Kit did.', logic: ['cmp', 'hob', 'kit', 'day', '=+', -1] },
      { text: 'Will Hayward cleared it the day before Hob did.', logic: ['cmp', 'will', 'hob', 'day', '=+', -1] },
      { text: 'Hob blamed the reeve either for the plank, which he says Walter Crane should have mended, or for the cellar door.', logic: ['either', 'reeve', ['plank', 'door']] },
      { text: 'Brother Anselm, whom the Prior sent down to watch, pulled out either the eel trap or the hurdle.', logic: ['either', 'anselm', ['trap', 'hurdle']] },
      { text: 'Hob blamed the rain on the Monday.', logic: ['is', 'rain', 'mon'] },
      { text: "Roger Thatcher didn't pull out the hurdle.", logic: ['not', 'roger', 'hurdle'] },
      { text: 'Brother Anselm went down the day after Kit.', logic: ['cmp', 'anselm', 'kit', 'day', '=+', 1] },
      { text: 'The cellar door came out later in the week than the plank.', logic: ['cmp', 'door', 'plank', 'day', '>'] },
      { text: 'Hob blamed Kit for the cellar door, which Kit says is Widow Tolley\'s.', logic: ['is', 'bkit', 'door'] }
    ],
    solution: { will: ['mon', 'hurdle', 'rain'], hob: ['tue', 'plank', 'reeve'], kit: ['wed', 'sheep', 'otters'], anselm: ['thu', 'trap', 'abbey'], roger: ['fri', 'door', 'bkit'] },
    epilogue: "So it was the abbey's own eel trap in Hob's wheel on Thursday, and Brother Anselm who pulled it out, and Hob blamed the abbey for it. Kit had the sheep out on Wednesday for a farthing. The Prior has written to Dame Isabel's steward, and the weir is to go before the hallmote."
  });

  // 24 ------------------------------------------------------------------
  STORY.push({
    id: 'ch4-24-hallmote',
    chapter: 4, number: 24,
    title: 'The Hallmote',
    place: 'Mardle Hall',
    characters: ['Dame Isabel', 'Will Hayward', 'Walter Crane', 'Father Simon', 'Margery Baxter', 'Prior Hamo', 'Hob', 'Alys Pennock', 'Piers Carter'],
    size: '4×5',
    grade: 'Master',
    intro: "The hallmote sat in Dame Isabel's hall when the water went down, with her steward to hear the cases and the jury on a bench beside the dogs. I was put at the back next to the Dame's hawk on its perch, and whenever I leaned out to see who was speaking, the hawk leaned out as well. Five cases were heard, the first to the fifth, and each had its fine, or none.",
    task: 'Can you work out the order of the cases, who brought each one, and the fine?',
    categories: [
      { id: 'who', name: 'Brought by', items: [it('will', 'Will Hayward'), it('walter', 'Walter Crane'), it('simon', 'Father Simon'), it('margery', 'Margery Baxter'), it('prior', 'the Prior')] },
      { id: 'case', name: 'Cases', who: 'whoever brought {x}', is: 'brought {x}', isnt: "didn't bring {x}", items: [
        it('hedge', 'the broken hedge'), it('ale', 'the weak ale'), it('mule', 'the mule in the churchyard'), it('flour', 'the short flour'), it('weir', "Hob's weir")] },
      { id: 'heard', name: 'Heard', who: 'the case heard {x}', is: 'was heard {x}', isnt: "wasn't heard {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('h1', 'first'), it('h2', 'second'), it('h3', 'third'), it('h4', 'fourth'), it('h5', 'fifth')] },
      { id: 'fine', name: 'Fines', who: 'the case fined {x}', is: 'was fined {x}', isnt: "wasn't fined {x}",
        ordered: { values: [0, 2, 4, 6, 12] }, items: [it('f0', 'nothing'), it('f2', 'twopence'), it('f4', 'fourpence'), it('f6', 'sixpence'), it('f12', 'twelvepence')] }
    ],
    clues: [
      { text: "Hob's weir was put off until Midsummer, so nothing was fined in that case.", logic: ['is', 'weir', 'f0'] },
      { text: 'The weak ale was heard straight after the broken hedge.', logic: ['cmp', 'ale', 'hedge', 'heard', '=+', 1] },
      { text: 'Father Simon brought either the mule or the hedge.', logic: ['either', 'simon', ['mule', 'hedge']] },
      { text: "Margery Baxter's case was fined more than Walter Crane's, and Walter Crane's more than Will Hayward's.", logic: [['cmp', 'margery', 'walter', 'fine', '>'], ['cmp', 'walter', 'will', 'fine', '>']] },
      { text: "Of Will Hayward and the Prior, one brought the hedge and the other's case was heard last.", logic: ['pairOr', 'will', 'prior', 'hedge', 'h5'] },
      { text: "Walter Crane's case was heard before Margery Baxter's.", logic: ['cmp', 'walter', 'margery', 'heard', '<'] },
      { text: 'The twopenny fine came later in the day than the weak ale.', logic: ['cmp', 'f2', 'ale', 'heard', '>'] },
      { text: "The mule and the weir weren't heard one straight after the other.", logic: ['cmp', 'mule', 'weir', 'heard', '!adj'] },
      { text: "The Prior's case wasn't heard first.", logic: ['not', 'prior', 'h1'] }
    ],
    solution: { will: ['hedge', 'h1', 'f4'], walter: ['ale', 'h2', 'f6'], simon: ['mule', 'h3', 'f2'], margery: ['flour', 'h4', 'f12'], prior: ['weir', 'h5', 'f0'] },
    epilogue: "The Prior's case came last and was put off until Midsummer. Margery Baxter's case, the short flour, was the dearest, and Hob paid the twelvepence, saying the flour had got wet. Alys paid sixpence for the weak ale and then told Walter Crane, in front of the jury, what he owed her."
  });
})();
