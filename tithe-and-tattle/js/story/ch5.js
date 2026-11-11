/* Chapter V. Easter to May: The Visitation (puzzles 25-30). See AUTHORING.md for the format.
 * chapterIntro on the first puzzle of the chapter is Wystan's opening for the chapter leaf. */
window.STORY = window.STORY || [];
(function () {
  function it(id, name) { return { id: id, name: name }; }

  // 25 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-25-pace-eggs',
    chapter: 5, number: 25,
    title: 'Pace Eggs',
    place: 'the abbey kitchen',
    characters: ['Kit', 'Emma Dyer', 'Margery Baxter', 'Widow Tolley', 'Alys Pennock', 'Brother Odo'],
    size: '3×4',
    grade: 'Apprentice',
    chapterIntro: "The water went down after Lady Day and left the meadow grey, with a boat in it that nobody owns. The Long Bridge is two ends and a plank. The bell went to the founder at Lynn on Piers Carter's cart by the ford, and Piers came back without the receipt. Then the Bishop wrote, and the Prior read the letter twice and walked round the cloister until Compline.",
    intro: "Eggs may be eaten again at Easter, and four households in Mardle sent the abbey coloured eggs for the Easter table. Kit carried them over in one basket for a farthing and told me at the kitchen door who had sent which. I know now that Kit was paid a second farthing by somebody on the way to say their eggs were the most, and I don't know who, and Kit says he doesn't either.",
    task: 'Can you work out how many eggs each household sent and what each coloured them with?',
    categories: [
      { id: 'who', name: 'Senders', items: [it('emma', 'Emma Dyer'), it('margery', 'Margery Baxter'), it('tolley', 'Widow Tolley'), it('alys', 'Alys Pennock')] },
      { id: 'eggs', name: 'Eggs', who: 'whoever sent {x}', is: 'sent {x}', isnt: "didn't send {x}",
        ordered: { values: [4, 6, 8, 12] }, items: [it('e4', 'four eggs'), it('e6', 'six eggs'), it('e8', 'eight eggs'), it('e12', 'twelve eggs')] },
      { id: 'dye', name: 'Coloured with', who: 'whoever coloured them with {x}', is: 'coloured them with {x}', isnt: "didn't colour them with {x}", items: [
        it('woad', 'woad'), it('onion', 'onion skins'), it('gorse', 'gorse flowers'), it('madder', 'madder')] }
    ],
    clues: [
      { text: "Emma Dyer's eggs came out of her woad vat, as blue as her arms.", logic: ['is', 'emma', 'woad'] },
      { text: 'Margery Baxter sent the most eggs.', logic: ['is', 'margery', 'e12'] },
      { text: 'There were eight eggs coloured with madder.', logic: ['is', 'madder', 'e8'] },
      { text: "Widow Tolley didn't use madder.", logic: ['not', 'tolley', 'madder'] },
      { text: 'There were more onion-skin eggs than gorse eggs.', logic: ['cmp', 'onion', 'gorse', 'eggs', '>'] },
      { text: 'Emma Dyer sent fewer eggs than Widow Tolley.', logic: ['cmp', 'emma', 'tolley', 'eggs', '<'] }
    ],
    solution: { emma: ['e4', 'woad'], margery: ['e12', 'onion'], tolley: ['e6', 'gorse'], alys: ['e8', 'madder'] },
    epilogue: "Margery Baxter sent twelve eggs done in onion skins, and Emma Dyer four blue ones, and Brother Odo would not eat the blue ones. The Prior asked Kit who had paid him the second farthing. Kit said it was Margery, and then the Widow, and then that he had found it."
  });

  // 26 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-26-hocktide',
    chapter: 5, number: 26,
    title: 'Hocktide',
    place: 'the market square',
    characters: ['Widow Tolley', 'Joan Fletcher', 'Alys Pennock', 'Agnes Sutor', 'Margery Baxter', 'Tom Webbe', 'Walter Crane', 'Piers Carter', 'Hob', 'Father Simon'],
    size: '4×4',
    grade: 'Journeyman',
    intro: "On Hock Tuesday the women of Mardle go out with ropes and catch the men, and a man is let go when he pays, and the money goes to St Mary's for the roof. Father Simon asked the abbey to write it down, since the money never comes to what he was told. Widow Tolley saw all of it from her door and told me, calling each man by another man's name, though she had the day right and the prices, a penny to fourpence.",
    task: 'Can you work out which man each woman caught, where, and what he paid?',
    categories: [
      { id: 'who', name: 'Women', items: [it('joan', 'Joan Fletcher'), it('alys', 'Alys Pennock'), it('agnes', 'Agnes Sutor'), it('margery', 'Margery Baxter')] },
      { id: 'man', name: 'Men', who: 'the woman who caught {x}', is: 'caught {x}', isnt: "didn't catch {x}", items: [
        it('tom', 'Tom Webbe'), it('walter', 'Walter Crane'), it('piers', 'Piers Carter'), it('hob', 'Hob')] },
      { id: 'where', name: 'Places', who: 'the woman who made her catch {x}', is: 'made her catch {x}', isnt: "didn't make her catch {x}", items: [
        it('cross', 'at the market cross'), it('swan', 'in the Swan yard'), it('porch', "in St Mary's porch"), it('millgate', 'at the mill gate')] },
      { id: 'paid', name: 'Paid', who: 'the woman whose man paid {x}', is: 'had her man pay {x}', isnt: "didn't have her man pay {x}",
        ordered: { values: [1, 2, 3, 4] }, items: [it('d1', 'a penny'), it('d2', 'twopence'), it('d3', 'threepence'), it('d4', 'fourpence')] }
    ],
    clues: [
      { text: 'Joan Fletcher caught Tom Webbe, who sang until she let him go cheaper than any other man.', logic: [['is', 'joan', 'tom'], ['is', 'tom', 'd1']] },
      { text: 'Hob, who was caught at the mill gate, his own, paid a penny less than Piers Carter.', logic: [['is', 'hob', 'millgate'], ['cmp', 'hob', 'piers', 'paid', '=+', -1]] },
      { text: 'Alys Pennock caught either Walter Crane or Hob.', logic: ['either', 'alys', ['walter', 'hob']] },
      { text: "Margery Baxter didn't catch anybody in St Mary's porch.", logic: ['not', 'margery', 'porch'] },
      { text: 'Walter Crane paid fourpence and cut a notch for it on his own stick.', logic: ['is', 'walter', 'd4'] },
      { text: 'Joan Fletcher made her catch at the market cross.', logic: ['is', 'joan', 'cross'] },
      { text: 'Alys Pennock made her catch in the Swan yard, which is hers.', logic: ['is', 'alys', 'swan'] }
    ],
    solution: { joan: ['tom', 'cross', 'd1'], alys: ['walter', 'swan', 'd4'], agnes: ['piers', 'porch', 'd3'], margery: ['hob', 'millgate', 'd2'] },
    epilogue: "Joan Fletcher caught Tom Webbe at the cross and let him go for a penny, and he went on singing. Alys had Walter Crane in the Swan yard for fourpence and wrote it off his slate. Father Simon counted tenpence in the roof box, which is what Widow Tolley said, though she said it was Hob who paid fourpence."
  });

  // 27 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-27-bishops-letter',
    chapter: 5, number: 27,
    title: "The Bishop's Letter",
    place: 'the cloister',
    characters: ['Prior Hamo', 'Brother Odo', 'Brother Clement', 'Brother Anselm', 'Brother Wystan', 'Abbot Gervase'],
    size: '4×4',
    grade: 'Journeyman',
    intro: "The Bishop will visit on the Friday before May Day. The Prior gave each of us a job for one day, Monday to Thursday, and a thing we were not to mention to the Bishop, and he gave them out walking round the cloister, three times round, because he does not sit. I walked behind him writing on my tablet. Brother Anselm walked behind me humming.",
    task: "Can you work out each monk's job, his day, and what he was not to mention?",
    categories: [
      { id: 'who', name: 'Monks', items: [it('odo', 'Brother Odo'), it('clement', 'Brother Clement'), it('anselm', 'Brother Anselm'), it('wystan', 'Brother Wystan')] },
      { id: 'job', name: 'Jobs', who: 'the monk given {x}', is: 'was given {x}', isnt: "wasn't given {x}", items: [
        it('vats', 'scouring the brewhouse vats'), it('limewash', 'limewashing the guest house'), it('weeding', 'weeding the herb garden'), it('skeps', 'moving the bee skeps')] },
      { id: 'day', name: 'Days', who: 'the monk working on {x}', is: 'worked on {x}', isnt: "didn't work on {x}",
        ordered: { values: [1, 2, 3, 4] }, items: [it('mon', 'Monday'), it('tue', 'Tuesday'), it('wed', 'Wednesday'), it('thu', 'Thursday')] },
      { id: 'hush', name: 'Not to mention', who: 'the monk told not to mention {x}', is: 'was told not to mention {x}', isnt: "wasn't told not to mention {x}", items: [
        it('bell', 'the bell'), it('ale', 'the ale'), it('pears', 'the pears'), it('eels', 'the eels')] }
    ],
    clues: [
      { text: 'Brother Odo, who will not go within a field of the bees, was given the vats, which he says will do his back no good.', logic: ['is', 'odo', 'vats'] },
      { text: 'The vats were scoured the day before the monk told not to mention the eels started work.', logic: ['cmp', 'vats', 'eels', 'day', '=+', -1] },
      { text: "Brother Clement wasn't told not to mention the bell or the ale.", logic: [['not', 'clement', 'bell'], ['not', 'clement', 'ale']] },
      { text: 'Of Brother Anselm and the monk who worked on Tuesday, one was told not to mention the bell and the other was given the weeding.', logic: ['pairOr', 'anselm', 'tue', 'bell', 'weeding'] },
      { text: 'Brother Odo worked on the Monday.', logic: ['is', 'odo', 'mon'] },
      { text: "Brother Anselm didn't move the skeps.", logic: ['not', 'anselm', 'skeps'] },
      { text: 'Brother Clement worked on the Thursday.', logic: ['is', 'clement', 'thu'] }
    ],
    solution: { odo: ['vats', 'mon', 'ale'], clement: ['skeps', 'thu', 'pears'], anselm: ['limewash', 'wed', 'bell'], wystan: ['weeding', 'tue', 'eels'] },
    epilogue: "I weeded the herbs on Tuesday and was not to mention the eels, and Brother Clement moved the bees on Thursday and was not to mention the pears. The Abbot asked me on Wednesday what I was not to mention, and I told him the eels, on his left side, and he went to look at his pear trees."
  });

  // 28 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-28-visitation',
    chapter: 5, number: 28,
    title: 'The Visitation',
    place: 'the chapter house',
    characters: ['the Bishop', 'Prior Hamo', 'Brother Odo', 'Brother Clement', 'Brother Anselm', 'Brother Wystan', 'Abbot Gervase'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "The Bishop sat in the chapter house and had us in one at a time, first to fifth, and asked each of us whose faults we knew of, and he said our own faults counted as well. I took my tablet in to write the answers, and the Bishop's clerk took it off me at the door and gave it back to me at Vespers with the wax smoothed flat. So what follows is what the others told me afterwards in the cloister, and what I remember of my own.",
    task: 'Can you work out the order in which they were questioned, whom each spoke about, and what fault was reported?',
    categories: [
      { id: 'who', name: 'Questioned', items: [it('odo', 'Brother Odo'), it('clement', 'Brother Clement'), it('anselm', 'Brother Anselm'), it('wystan', 'Brother Wystan'), it('prior', 'the Prior')] },
      { id: 'about', name: 'Spoke about', who: 'the monk who spoke about {x}', is: 'spoke about {x}', isnt: "didn't speak about {x}", items: [
        it('aOdo', 'Brother Odo'), it('aClement', 'Brother Clement'), it('aAnselm', 'Brother Anselm'), it('aWystan', 'Brother Wystan'), it('aPrior', 'the Prior')] },
      { id: 'fault', name: 'Faults', who: 'the monk who reported {x}', is: 'reported {x}', isnt: "didn't report {x}", items: [
        it('humming', 'humming in choir'), it('standing', 'eating standing up'), it('sleeping', 'sleeping at Matins'), it('talking', 'talking in the cloister'), it('crossing', 'crossing out an entry in the book of faults')] },
      { id: 'turn', name: 'Questioned', who: 'the monk questioned {x}', is: 'was questioned {x}', isnt: "wasn't questioned {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('q1', 'first'), it('q2', 'second'), it('q3', 'third'), it('q4', 'fourth'), it('q5', 'fifth')] }
    ],
    clues: [
      { text: 'Brother Clement went in first, because the infirmary is nearest the chapter house.', logic: ['is', 'clement', 'q1'] },
      { text: 'Brother Odo was questioned earlier than Brother Anselm.', logic: ['cmp', 'odo', 'anselm', 'turn', '<'] },
      { text: 'I spoke about either Brother Clement or Brother Odo.', logic: ['either', 'wystan', ['aClement', 'aOdo']] },
      { text: 'Of Brother Anselm and me, one reported the sleeping at Matins and the other was questioned fourth.', logic: ['pairOr', 'anselm', 'wystan', 'sleeping', 'q4'] },
      { text: 'The crossing out was reported last.', logic: ['is', 'crossing', 'q5'] },
      { text: 'The humming was reported by the monk questioned straight before the one who reported the sleeping at Matins.', logic: ['cmp', 'humming', 'sleeping', 'turn', '=+', -1] },
      { text: "I didn't report the sleeping at Matins.", logic: ['not', 'wystan', 'sleeping'] },
      { text: 'Whoever spoke about the Prior was questioned later than whoever spoke about me.', logic: ['cmp', 'aPrior', 'aWystan', 'turn', '>'] },
      { text: 'Brother Anselm spoke about me.', logic: ['is', 'anselm', 'aWystan'] },
      { text: 'Brother Clement spoke about Brother Odo, whose back he treats.', logic: ['is', 'clement', 'aOdo'] },
      { text: "Brother Clement didn't report the talking in the cloister.", logic: ['not', 'clement', 'talking'] }
    ],
    solution: { odo: ['aAnselm', 'humming', 'q2'], clement: ['aOdo', 'standing', 'q1'], anselm: ['aWystan', 'sleeping', 'q3'], wystan: ['aClement', 'talking', 'q4'], prior: ['aPrior', 'crossing', 'q5'] },
    epilogue: "The Prior went in last and gave the Bishop his book of faults, and the Bishop found the line under the crossed-out one, which says in the Prior's own hand that the Prior crossed out an entry. The Bishop asked what the crossed-out entry had said."
  });

  // 29 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-29-may-day',
    chapter: 5, number: 29,
    title: 'May Day at the Butts',
    place: 'the Butts',
    characters: ['Joan Fletcher', 'Tom Webbe', 'Will Hayward', 'Roger Thatcher', 'Ralph Smith', 'Walter Crane', 'Alys Pennock'],
    size: '4×5',
    grade: 'Journeyman',
    intro: "Five shot at the Butts behind the Swan on May Day, first to fifth, six arrows each, and Walter Crane kept the score and gave the prize to the highest. A peg was pushed into the middle of the butt, and Joan Fletcher had Walter measure each archer's nearest arrow from it, in inches, with a knotted string. Joan and Tom Webbe each gave me all five scores and all five measures afterwards, and they agreed about nobody but Roger Thatcher.",
    task: "Can you work out the order they shot in, each archer's score, and how near each one's best arrow came to the peg?",
    categories: [
      { id: 'who', name: 'Archers', items: [it('joan', 'Joan Fletcher'), it('tom', 'Tom Webbe'), it('will', 'Will Hayward'), it('roger', 'Roger Thatcher'), it('ralph', 'Ralph Smith')] },
      { id: 'turn', name: 'Shot', who: 'the archer who shot {x}', is: 'shot {x}', isnt: "didn't shoot {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('s1', 'first'), it('s2', 'second'), it('s3', 'third'), it('s4', 'fourth'), it('s5', 'fifth')] },
      { id: 'score', name: 'Scores', who: 'the archer who scored {x}', is: 'scored {x}', isnt: "didn't score {x}",
        ordered: { values: [4, 6, 7, 9, 10] }, items: [it('p4', '4'), it('p6', '6'), it('p7', '7'), it('p9', '9'), it('p10', '10')] },
      { id: 'near', name: 'Nearest arrow', who: 'the archer whose best arrow was {x} from the peg', is: 'had a best arrow {x} from the peg', isnt: "didn't have a best arrow {x} from the peg",
        ordered: { values: [2, 3, 5, 8, 12] }, items: [it('n2', 'two inches'), it('n3', 'three inches'), it('n5', 'five inches'), it('n8', 'eight inches'), it('n12', 'twelve inches')] }
    ],
    clues: [
      { text: 'Tom Webbe scored higher than anyone.', logic: ['is', 'tom', 'p10'] },
      { text: 'Roger Thatcher, who is the only thing Joan and Tom agree about, scored 4.', logic: ['is', 'roger', 'p4'] },
      { text: 'The archer whose best arrow was twelve inches from the peg shot straight after Tom Webbe.', logic: ['cmp', 'n12', 'tom', 'turn', '=+', 1] },
      { text: 'Will Hayward shot first.', logic: ['is', 'will', 's1'] },
      { text: "Ralph Smith's best arrow was nearer the peg than Will Hayward's.", logic: ['cmp', 'ralph', 'will', 'near', '<'] },
      { text: 'The archer who scored 7 shot straight before the one who scored 9.', logic: ['cmp', 'p7', 'p9', 'turn', '=+', -1] },
      { text: 'Of Will Hayward and Ralph Smith, one scored 6 and the other had a best arrow three inches from the peg.', logic: ['pairOr', 'will', 'ralph', 'p6', 'n3'] },
      { text: "Tom Webbe's best arrow was further from the peg than Will Hayward's.", logic: ['cmp', 'tom', 'will', 'near', '>'] },
      { text: 'Joan Fletcher shot last.', logic: ['is', 'joan', 's5'] }
    ],
    solution: { will: ['s1', 'p6', 'n5'], tom: ['s2', 'p10', 'n8'], roger: ['s3', 'p4', 'n12'], ralph: ['s4', 'p7', 'n3'], joan: ['s5', 'p9', 'n2'] },
    epilogue: "Tom Webbe scored 10 and had the prize, a pair of gloves, and Joan Fletcher scored 9 with an arrow two inches from the peg. Joan asked Walter what the peg was for, then. Tom wore the gloves to the Swan."
  });

  // 30 ------------------------------------------------------------------
  STORY.push({
    id: 'ch5-30-rogation',
    chapter: 5, number: 30,
    title: 'Beating the Bounds',
    place: 'the parish bounds',
    characters: ['Father Simon', 'Kit', 'Hob', 'Walter Crane', 'Will Hayward', 'Tom Webbe', 'Piers Carter', 'Brother Wystan'],
    size: '4×5',
    grade: 'Master',
    intro: "In Rogation week Father Simon walks the bounds of the parish with a cross and the town behind him, and at each mark a boy is bumped on the stone so that he will remember where it is when he is old. The abbey sent me to carry the second banner, which needs two hands. I wrote the list that night from memory, and from Walter Crane, who had the five marks, first to fifth, cut on his stick, but not the boys.",
    task: 'Can you work out which boy was bumped at each mark, in what order the marks came, and who did the bumping?',
    categories: [
      { id: 'who', name: 'Boys', items: [it('kit', 'Kit'), it('hal', 'Hal Sutor'), it('jack', 'Jack Thatcher'), it('davy', 'Davy Crane'), it('ned', 'Ned Smith')] },
      { id: 'mark', name: 'Marks', who: 'the boy bumped at {x}', is: 'was bumped at {x}', isnt: "wasn't bumped at {x}", items: [
        it('bridge', 'the bridge-end stone'), it('oak', 'the oak on the common'), it('weir', 'the stone by the weir'), it('woodcross', 'the cross at the wood gate'), it('dyke', 'the dyke corner')] },
      { id: 'stop', name: 'Order', who: 'the boy bumped at the {x}', is: 'was bumped at the {x}', isnt: "wasn't bumped at the {x}",
        ordered: { values: [1, 2, 3, 4, 5] }, items: [it('m1', 'first mark'), it('m2', 'second mark'), it('m3', 'third mark'), it('m4', 'fourth mark'), it('m5', 'fifth mark')] },
      { id: 'by', name: 'Bumped by', who: 'the boy bumped by {x}', is: 'was bumped by {x}', isnt: "wasn't bumped by {x}", items: [
        it('walter', 'Walter Crane'), it('will', 'Will Hayward'), it('hob', 'Hob'), it('tom', 'Tom Webbe'), it('piers', 'Piers Carter')] }
    ],
    clues: [
      { text: 'Hob did the bumping at the stone by his own weir.', logic: ['is', 'hob', 'weir'] },
      { text: 'Piers Carter, who was late, caught up in time to bump the boy at the last mark.', logic: ['is', 'piers', 'm5'] },
      { text: 'The procession reached the oak on the common straight after the bridge-end stone.', logic: ['cmp', 'oak', 'bridge', 'stop', '=+', 1] },
      { text: 'Of Jack Thatcher and Ned Smith, one was bumped by Will Hayward and the other at the dyke corner.', logic: ['pairOr', 'jack', 'ned', 'will', 'dyke'] },
      { text: 'Ned Smith was bumped later than Kit.', logic: ['cmp', 'ned', 'kit', 'stop', '>'] },
      { text: 'The cross at the wood gate came straight after the stone by the weir.', logic: ['cmp', 'woodcross', 'weir', 'stop', '=+', 1] },
      { text: 'Of Davy Crane and the boy bumped at the oak, one was bumped by Tom Webbe and the other was bumped second.', logic: ['pairOr', 'davy', 'oak', 'tom', 'm2'] },
      { text: "The boy bumped by Hob was bumped two marks after Hal Sutor.", logic: ['cmp', 'hob', 'hal', 'stop', '=+', 2] }
    ],
    solution: { hal: ['bridge', 'm1', 'walter'], jack: ['oak', 'm2', 'will'], kit: ['weir', 'm3', 'hob'], davy: ['woodcross', 'm4', 'tom'], ned: ['dyke', 'm5', 'piers'] },
    epilogue: "It was Hob who bumped Kit at the stone by the weir, and Kit said afterwards that it was the hardest of the day. Walter Crane paced it out from the stone to the weir and said the weir was four yards over the line."
  });
})();
