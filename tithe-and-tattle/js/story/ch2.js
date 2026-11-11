/* Tithe & Tattle, Chapter II: Martinmas and Advent, The New Bell (puzzles 7-12).
 * chapterIntro on the first puzzle is Wystan's opening for the chapter. */
window.STORY = window.STORY || [];

STORY.push({
  id: 'ch2-07-pannage',
  chapter: 2, number: 7,
  title: 'Pannage',
  place: 'Mardle Wood',
  characters: ['Brother Wystan', 'Will Hayward', 'Brother Odo', 'Father Simon', 'Hob', 'Margery Baxter'],
  size: '3×4',
  grade: 'Apprentice',
  chapterIntro: "The old bell has been cracked since before I came, and has been struck with a mallet on the rim, which Brother Odo says is the same thing. In November word came that the new bell was waiting on the quay at Lynn, cast and paid for, mostly, and Piers Carter said he would fetch it the week after Martinmas, once the pigs were in.",
  intro: "Will Hayward keeps the hedges and the common. From Michaelmas to Martinmas he also watches the pigs that go into Mardle Wood for the acorns, and takes the pannage for Dame Isabel by a rule of his own, a penny for a hog, a halfpenny for a young one and something else again for a sow. I asked him to say it twice and wrote it down differently both times. On the last day four owners came to fetch their pigs home.",
  task: 'Can you work out how many pigs each owner had in the wood, and what each paid?',
  categories: [
    { id: 'who', name: 'Owners', items: [
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'simon', name: 'Father Simon', short: 'Simon' },
      { id: 'hob', name: 'Hob', short: 'Hob' },
      { id: 'margery', name: 'Margery Baxter', short: 'Margery' }] },
    { id: 'pigs', name: 'Pigs', who: 'the owner of {x}', is: 'had {x}', isnt: "didn't have {x}",
      ordered: { values: [3, 4, 5, 6] }, items: [
      { id: 'p3', name: 'three pigs', short: '3 pigs' },
      { id: 'p4', name: 'four pigs', short: '4 pigs' },
      { id: 'p5', name: 'five pigs', short: '5 pigs' },
      { id: 'p6', name: 'six pigs', short: '6 pigs' }] },
    { id: 'fee', name: 'Fees', who: 'the owner who paid {x}', is: 'paid {x}', isnt: "didn't pay {x}",
      ordered: { values: [2, 3, 4, 5] }, items: [
      { id: 'f2', name: 'twopence', short: '2d' },
      { id: 'f3', name: 'threepence', short: '3d' },
      { id: 'f4', name: 'fourpence', short: '4d' },
      { id: 'f5', name: 'fivepence', short: '5d' }] }
  ],
  clues: [
    { text: "Brother Odo, driving the abbey's pigs, had more in the wood than anyone.", logic: ['is', 'odo', 'p6'] },
    { text: 'Margery Baxter paid the most, and told everyone in the lane.', logic: ['is', 'margery', 'f5'] },
    { text: 'Whoever paid fivepence had five pigs.', logic: ['is', 'f5', 'p5'] },
    { text: 'Hob paid the least, after a long talk with Will about otters.', logic: ['is', 'hob', 'f2'] },
    { text: 'Whoever had three pigs paid threepence, which is the only part of the reckoning I followed.', logic: ['is', 'p3', 'f3'] }
  ],
  solution: { odo: ['p6', 'f4'], simon: ['p3', 'f3'], hob: ['p4', 'f2'], margery: ['p5', 'f5'] },
  epilogue: "Brother Odo drove the abbey's six pigs home for fourpence and Margery Baxter paid fivepence for her five, and Hob paid twopence for four, after a long talk about otters. Father Simon paid threepence for three and asked why the abbey's pigs came cheaper than his, and Will explained it again."
});

STORY.push({
  id: 'ch2-08-pig-killing',
  chapter: 2, number: 8,
  title: 'The Killing Week',
  place: 'the square outside the abbey gate',
  mapPlace: 'square',
  characters: ['Brother Wystan', 'Widow Tolley', 'Brother Odo', 'Alys Pennock', 'Margery Baxter', 'Agnes Sutor'],
  size: '4×4',
  grade: 'Apprentice',
  intro: "After Martinmas the pigs that came home from the wood are killed, because there is not enough fodder to keep them on through the winter. This year four were killed outside the abbey gate on four days of the next week, Monday to Thursday, each by a different hand, and each went mostly into one thing. I was in the scriptorium all week, so I asked Widow Tolley, who watches the square from her door. She had every day right and called Agnes Sutor the Baxter girl throughout.",
  task: 'Can you work out who cut up each pig, on which day, and what they made of it?',
  categories: [
    { id: 'who', name: 'Cooks', items: [
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'alys', name: 'Alys Pennock', short: 'Alys' },
      { id: 'margery', name: 'Margery Baxter', short: 'Margery' },
      { id: 'agnes', name: 'Agnes Sutor', short: 'Agnes' }] },
    { id: 'made', name: 'Made', who: 'whoever made {x}', is: 'made {x}', isnt: "didn't make {x}", items: [
      { id: 'bacon', name: 'the bacon', short: 'bacon' },
      { id: 'puddings', name: 'the black puddings', short: 'puddings' },
      { id: 'lard', name: 'the lard', short: 'lard' },
      { id: 'brawn', name: 'the brawn', short: 'brawn' }] },
    { id: 'pig', name: 'Pigs', who: 'whoever cut up {x}', is: 'cut up {x}', isnt: "didn't cut up {x}", items: [
      { id: 'boar', name: 'the boar', short: 'boar' },
      { id: 'oldsow', name: 'the old sow', short: 'old sow' },
      { id: 'runt', name: 'the runt', short: 'runt' },
      { id: 'spotted', name: 'the spotted sow', short: 'spotted' }] },
    { id: 'day', name: 'Days', who: 'whoever worked on {x}', is: 'worked on {x}', isnt: "didn't work on {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'mon', name: 'Monday', short: 'Mon' },
      { id: 'tue', name: 'Tuesday', short: 'Tue' },
      { id: 'wed', name: 'Wednesday', short: 'Wed' },
      { id: 'thu', name: 'Thursday', short: 'Thu' }] }
  ],
  clues: [
    { text: 'Alys Pennock made the black puddings, and had them on sale at the Swan by evening.', logic: ['is', 'alys', 'puddings'] },
    { text: 'The black puddings came from the boar.', logic: ['is', 'puddings', 'boar'] },
    { text: 'The boar was killed on the Monday.', logic: ['is', 'boar', 'mon'] },
    { text: 'Margery Baxter worked on the last day.', logic: ['is', 'margery', 'thu'] },
    { text: 'Brother Odo made the bacon, as he has every year since he was a novice.', logic: ['is', 'odo', 'bacon'] },
    { text: 'The runt went into the lard.', logic: ['is', 'runt', 'lard'] },
    { text: "Agnes Sutor didn't make the lard.", logic: ['not', 'agnes', 'lard'] },
    { text: "Brother Odo didn't cut up the spotted sow.", logic: ['not', 'odo', 'spotted'] },
    { text: "The spotted sow wasn't killed on the Tuesday.", logic: ['not', 'spotted', 'tue'] }
  ],
  solution: { odo: ['bacon', 'oldsow', 'tue'], alys: ['puddings', 'boar', 'mon'], margery: ['lard', 'runt', 'thu'], agnes: ['brawn', 'spotted', 'wed'] },
  epilogue: "Alys had the boar on Monday and black puddings at the Swan by Vespers, and Brother Odo made bacon of the old sow on Tuesday. On Wednesday Agnes Sutor made brawn of the spotted sow, and on Thursday Margery Baxter rendered the runt for lard. Hob came past daily to say his pig had been the biggest."
});

STORY.push({
  id: 'ch2-09-bell-from-lynn',
  chapter: 2, number: 9,
  title: 'The Bell from Lynn',
  place: 'the Lynn road',
  characters: ['Brother Wystan', 'Piers Carter', 'Kit', 'Isolda Brewer', 'Ralph Smith', 'Dame Isabel de Mardle', 'Sim Shepherd'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "Piers Carter brought the new bell home from the quay at Lynn on his cart, with Bishop the mule, and Kit rode on top of the bell the whole way, which nobody had allowed. The journey's four stages, in order from Lynn, are the quay, the Lynn road, the causeway over the fen and the ford below Mardle. At each one Piers met somebody and was held up, and he has a reason for each. Kit has told me the journey three times and once put the ford first.",
  task: 'Can you work out whom Piers met at each stage, how long he was held up there, and his reason?',
  categories: [
    { id: 'who', name: 'Met', items: [
      { id: 'isolda', name: 'Isolda Brewer', short: 'Isolda' },
      { id: 'ralph', name: 'Ralph Smith', short: 'Ralph' },
      { id: 'dame', name: 'Dame Isabel', short: 'Isabel' },
      { id: 'sim', name: 'Sim Shepherd', short: 'Sim' }] },
    { id: 'stage', name: 'Stages', who: 'whoever Piers met at {x}', is: 'was met at {x}', isnt: "wasn't met at {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'quay', name: 'the quay', short: 'quay' },
      { id: 'road', name: 'the Lynn road', short: 'road' },
      { id: 'causeway', name: 'the causeway', short: 'causeway' },
      { id: 'ford', name: 'the ford', short: 'ford' }] },
    { id: 'delay', name: 'Delays', who: 'whoever Piers met when held up {x}', is: 'was met when Piers was held up {x}', isnt: "wasn't met when Piers was held up {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'h1', name: 'an hour', short: '1 hour' },
      { id: 'h2', name: 'two hours', short: '2 hours' },
      { id: 'h3', name: 'three hours', short: '3 hours' },
      { id: 'h4', name: 'four hours', short: '4 hours' }] },
    { id: 'why', name: 'Reasons', who: 'whoever Piers met over {x}', is: 'was met over {x}', isnt: "wasn't met over {x}", items: [
      { id: 'ale', name: 'a cup of ale', short: 'ale' },
      { id: 'pin', name: 'a lost wheel pin', short: 'pin' },
      { id: 'mule', name: 'Bishop lying down', short: 'mule' },
      { id: 'mist', name: 'the mist', short: 'mist' }] }
  ],
  clues: [
    { text: 'The longest hold-up was on the causeway.', logic: ['is', 'causeway', 'h4'] },
    { text: 'Piers met Isolda Brewer at an earlier stage than Ralph Smith.', logic: ['cmp', 'isolda', 'ralph', 'stage', '<'] },
    { text: 'Piers met Dame Isabel at an earlier stage than Sim Shepherd.', logic: ['cmp', 'dame', 'sim', 'stage', '<'] },
    { text: 'Piers was held up two hours longer at the ford than on the Lynn road.', logic: ['cmp', 'ford', 'road', 'delay', '=+', 2] },
    { text: 'Of Dame Isabel and Sim Shepherd, one was there when Bishop lay down and the other was met at the ford.',
      logic: ['pairOr', 'dame', 'sim', 'mule', 'ford'] },
    { text: 'The mist came down at a later stage than the cup of ale.', logic: ['cmp', 'mist', 'ale', 'stage', '>'] },
    { text: 'Piers was held up longer with Isolda Brewer than over the wheel pin.', logic: ['cmp', 'isolda', 'pin', 'delay', '>'] }
  ],
  solution: { isolda: ['quay', 'h2', 'ale'], ralph: ['road', 'h1', 'pin'], dame: ['causeway', 'h4', 'mule'], sim: ['ford', 'h3', 'mist'] },
  epilogue: "Piers lost two hours at the quay over Isolda Brewer's ale and one on the Lynn road while Ralph Smith made a wheel pin. On the causeway Bishop lay down for four hours with Dame Isabel watching, and the ford took three, in mist, with Sim Shepherd. Father Simon wants the mule renamed before the bell is blessed."
});

STORY.push({
  id: 'ch2-10-hanging-the-bell',
  chapter: 2, number: 10,
  title: 'Hanging the Bell',
  place: 'the bell tower',
  characters: ['Brother Wystan', 'Abbot Gervase', 'Brother Odo', 'Brother Anselm', 'Walter Crane', 'Ralph Smith'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "The bell went up on Saturday in four turns, one at each of Terce, Sext, None and Vespers, in that order, each turn a different man on a different rope at a different job. I was to write it all down, but I was holding the Abbot's ladder and saw mostly his feet. Afterwards I asked the Abbot who had held which rope, and he told me the Warden pears had come through the frost better than the others. Brother Odo told me the rest, and Walter Crane corrected him.",
  task: 'Can you work out which rope each man held, what his job was, and at which hour?',
  categories: [
    { id: 'who', name: 'Men', items: [
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'anselm', name: 'Brother Anselm', short: 'Anselm' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' },
      { id: 'ralph', name: 'Ralph Smith', short: 'Ralph' }] },
    { id: 'rope', name: 'Ropes', who: 'whoever held {x}', is: 'held {x}', isnt: "didn't hold {x}", items: [
      { id: 'hemp', name: 'the hemp rope', short: 'hemp' },
      { id: 'well', name: 'the old well rope', short: 'well' },
      { id: 'cart', name: "Piers's cart rope", short: 'cart' },
      { id: 'newrope', name: 'the new rope', short: 'new' }] },
    { id: 'job', name: 'Jobs', who: 'whoever did {x}', is: 'did {x}', isnt: "didn't do {x}", items: [
      { id: 'haul', name: 'the hauling', short: 'hauling' },
      { id: 'steady', name: 'the steadying', short: 'steady' },
      { id: 'count', name: 'the counting', short: 'counting' },
      { id: 'pin', name: 'the pinning', short: 'pinning' }] },
    { id: 'hour', name: 'Hours', who: 'whoever worked at {x}', is: 'worked at {x}', isnt: "didn't work at {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'terce', name: 'Terce', short: 'Terce' },
      { id: 'sext', name: 'Sext', short: 'Sext' },
      { id: 'none', name: 'None', short: 'None' },
      { id: 'vespers', name: 'Vespers', short: 'Vespers' }] }
  ],
  clues: [
    { text: 'Ralph Smith did the pinning, because the headstock is iron.', logic: ['is', 'ralph', 'pin'] },
    { text: 'Walter Crane did the counting, on his tally stick, at a later hour than Brother Odo worked.', logic: [['is', 'walter', 'count'], ['cmp', 'walter', 'odo', 'hour', '>']] },
    { text: 'The hauling was done at an earlier hour than the steadying.', logic: ['cmp', 'haul', 'steady', 'hour', '<'] },
    { text: 'Whoever held the old well rope worked the hour after whoever held the hemp rope.', logic: ['cmp', 'well', 'hemp', 'hour', '=+', 1] },
    { text: "Ralph Smith didn't hold Piers's cart rope.", logic: ['not', 'ralph', 'cart'] },
    { text: 'Brother Odo worked at an earlier hour than Ralph Smith.', logic: ['cmp', 'odo', 'ralph', 'hour', '<'] },
    { text: 'The new rope was in use at None.', logic: ['is', 'newrope', 'none'] },
    { text: "Brother Odo didn't do the hauling.", logic: ['not', 'odo', 'haul'] }
  ],
  solution: { odo: ['well', 'steady', 'sext'], anselm: ['hemp', 'haul', 'terce'], walter: ['cart', 'count', 'vespers'], ralph: ['newrope', 'pin', 'none'] },
  epilogue: "Brother Anselm hauled on the hemp rope at Terce, and at Sext Brother Odo steadied it with the old well rope and talked about his back. Ralph Smith pinned the headstock at None on the new rope, and at Vespers Walter Crane counted the pulls on Piers's cart rope. The Abbot blessed the bell from the bottom of the ladder."
});

STORY.push({
  id: 'ch2-11-ringing-week',
  chapter: 2, number: 11,
  title: 'The First Week of Ringing',
  place: 'the bell tower',
  characters: ['Brother Wystan', 'Prior Hamo', 'Brother Odo', 'Brother Clement', 'Brother Anselm', 'Kit', 'Alys Pennock', 'Hob', 'Father Simon', 'Widow Tolley', 'Walter Crane'],
  size: '4×5',
  grade: 'Journeyman',
  intro: "The office has eight hours, which are Matins, Lauds, Prime, Terce, Sext, None, Vespers and Compline, in that order through the day and night. In the first week the Prior gave the new bell to a different ringer on each day from Monday to Friday, for one of the day hours, and each day somebody different came to the gate to complain about it. I kept the week in two columns, and Brother Clement, who was helping, wrote the complaints in Latin in the column for the hours.",
  task: 'Can you work out who rang on each day, at which hour, and who came to complain?',
  categories: [
    { id: 'who', name: 'Ringers', items: [
      { id: 'wystan', name: 'Brother Wystan', short: 'Wystan' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'clement', name: 'Brother Clement', short: 'Clement' },
      { id: 'anselm', name: 'Brother Anselm', short: 'Anselm' },
      { id: 'kit', name: 'Kit', short: 'Kit' }] },
    { id: 'day', name: 'Days', who: 'whoever rang on {x}', is: 'rang on {x}', isnt: "didn't ring on {x}",
      ordered: { values: [1, 2, 3, 4, 5] }, items: [
      { id: 'mon', name: 'Monday', short: 'Mon' },
      { id: 'tue', name: 'Tuesday', short: 'Tue' },
      { id: 'wed', name: 'Wednesday', short: 'Wed' },
      { id: 'thu', name: 'Thursday', short: 'Thu' },
      { id: 'fri', name: 'Friday', short: 'Fri' }] },
    { id: 'hour', name: 'Hours', who: 'whoever rang {x}', is: 'rang {x}', isnt: "didn't ring {x}",
      ordered: { values: [1, 2, 3, 4, 5] }, items: [
      { id: 'prime', name: 'Prime', short: 'Prime' },
      { id: 'terce', name: 'Terce', short: 'Terce' },
      { id: 'sext', name: 'Sext', short: 'Sext' },
      { id: 'none', name: 'None', short: 'None' },
      { id: 'vespers', name: 'Vespers', short: 'Vespers' }] },
    { id: 'moan', name: 'Complaints', who: 'whoever rang on the day {x} complained', is: 'rang on the day {x} complained', isnt: "didn't ring on the day {x} complained", items: [
      { id: 'alys', name: 'Alys Pennock', short: 'Alys' },
      { id: 'hob', name: 'Hob', short: 'Hob' },
      { id: 'simon', name: 'Father Simon', short: 'Simon' },
      { id: 'tolley', name: 'Widow Tolley', short: 'Tolley' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' }] }
  ],
  clues: [
    { text: 'Kit rang on the Wednesday, which the Prior allowed once, for a farthing.', logic: ['is', 'kit', 'wed'] },
    { text: 'Brother Anselm rang the day after Kit.', logic: ['cmp', 'anselm', 'kit', 'day', '=+', 1] },
    { text: 'Father Simon came to complain the day before Alys Pennock did.', logic: ['cmp', 'simon', 'alys', 'day', '=+', -1] },
    { text: 'Brother Clement rang Prime.', logic: ['is', 'clement', 'prime'] },
    { text: 'Widow Tolley came on the day the bell was rung for Vespers.', logic: ['is', 'tolley', 'vespers'] },
    { text: 'Walter Crane came on the last day.', logic: ['is', 'walter', 'fri'] },
    { text: 'I rang a later hour than Brother Anselm did.', logic: ['cmp', 'wystan', 'anselm', 'hour', '>'] },
    { text: 'Father Simon came on the day Terce was rung.', logic: ['is', 'simon', 'terce'] },
    { text: 'Alys Pennock came on the day Prime was rung.', logic: ['is', 'alys', 'prime'] }
  ],
  solution: { odo: ['mon', 'terce', 'simon'], clement: ['tue', 'prime', 'alys'], kit: ['wed', 'vespers', 'tolley'], anselm: ['thu', 'sext', 'hob'], wystan: ['fri', 'none', 'walter'] },
  epilogue: "Brother Odo rang Terce on Monday and Father Simon said it drowned St Mary's. Kit rang Vespers on Wednesday, twice, and Widow Tolley came about the second time. On Friday I rang None, and Walter Crane came in the matter of the Swan. At Compline the bell was rung again by nobody on the list, and it cracked."
});

STORY.push({
  id: 'ch2-12-compline',
  chapter: 2, number: 12,
  title: 'Who Rang It Last',
  place: 'the abbey at Compline',
  characters: ['Brother Wystan', 'Abbot Gervase', 'Prior Hamo', 'Brother Odo', 'Brother Clement', 'Brother Anselm'],
  size: '4×5',
  grade: 'Master',
  intro: "The bell cracked at Compline on Friday. Five of the house were out of choir, the Prior among them, and he had each of the five say where he had been, what he heard and what he had in his hands. Afterwards he let me copy it all, which he has not done before. Brother Anselm hummed through his whole account. The Abbot answered every question and then asked whether the founder at Lynn would take the bell back.",
  task: 'Can you work out where each of them was at Compline, what he heard, and what he carried?',
  categories: [
    { id: 'who', name: 'Monks', items: [
      { id: 'abbot', name: 'the Abbot', short: 'Abbot' },
      { id: 'prior', name: 'the Prior', short: 'Prior' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'clement', name: 'Brother Clement', short: 'Clement' },
      { id: 'anselm', name: 'Brother Anselm', short: 'Anselm' }] },
    { id: 'place', name: 'Places', who: 'the monk in {x}', is: 'was in {x}', isnt: "wasn't in {x}", items: [
      { id: 'tower', name: 'the bell tower', short: 'tower' },
      { id: 'cloister', name: 'the cloister', short: 'cloister' },
      { id: 'cellar', name: 'the cellar', short: 'cellar' },
      { id: 'infirmary', name: 'the infirmary', short: 'infirmry' },
      { id: 'orchard', name: 'the pear orchard', short: 'orchard' }] },
    { id: 'heard', name: 'Heard', who: 'the monk who heard {x}', is: 'heard {x}', isnt: "didn't hear {x}", items: [
      { id: 'faint', name: 'the bell, faintly', short: 'faintly' },
      { id: 'crack', name: 'the crack', short: 'crack' },
      { id: 'singing', name: 'Tom Webbe singing', short: 'singing' },
      { id: 'dog', name: "Hob's dog", short: 'dog' },
      { id: 'nothing', name: 'nothing', short: 'nothing' }] },
    { id: 'carried', name: 'Carried', who: 'the monk with {x}', is: 'carried {x}', isnt: "didn't carry {x}", items: [
      { id: 'pear', name: 'a pear', short: 'pear' },
      { id: 'book', name: 'the little book', short: 'book' },
      { id: 'jug', name: 'a jug', short: 'jug' },
      { id: 'candle', name: 'a candle', short: 'candle' },
      { id: 'lantern', name: 'a lantern', short: 'lantern' }] }
  ],
  clues: [
    { text: 'Of the Prior and Brother Odo, one heard the crack and the other was in the cellar.', logic: ['pairOr', 'prior', 'odo', 'crack', 'cellar'] },
    { text: "Brother Anselm heard either nothing or Hob's dog, and he was humming, so the Prior doubts the dog.", logic: ['either', 'anselm', ['nothing', 'dog']] },
    { text: 'The monk in the bell tower had no light with him, and not the little book either.', logic: [['not', 'tower', 'lantern'], ['not', 'tower', 'candle'], ['not', 'tower', 'book']] },
    { text: "Whoever carried the candle heard Hob's dog.", logic: ['is', 'candle', 'dog'] },
    { text: 'Brother Clement carried either the candle or the jug.', logic: ['either', 'clement', ['candle', 'jug']] },
    { text: "Brother Clement wasn't in the cloister or the orchard, because of the night air.", logic: [['not', 'clement', 'cloister'], ['not', 'clement', 'orchard']] },
    { text: "Neither the Abbot nor Brother Anselm had the little book.", logic: [['not', 'abbot', 'book'], ['not', 'anselm', 'book']] },
    { text: 'The monk with the lantern heard either nothing or the crack.', logic: ['either', 'lantern', ['nothing', 'crack']] },
    { text: 'If the Prior had the little book, he was in the cloister.', logic: ['ifThen', ['is', 'prior', 'book'], ['is', 'prior', 'cloister']] },
    { text: "If Brother Odo didn't carry the jug, he carried the candle.", logic: ['ifThen', ['not', 'odo', 'jug'], ['is', 'odo', 'candle']] },
    { text: 'Whoever heard Tom Webbe singing was in the cellar.', logic: ['is', 'singing', 'cellar'] }
  ],
  solution: { abbot: ['tower', 'faint', 'pear'], prior: ['cloister', 'crack', 'book'], odo: ['cellar', 'singing', 'jug'], clement: ['infirmary', 'dog', 'candle'], anselm: ['orchard', 'nothing', 'lantern'] },
  epilogue: "The Abbot was in the tower with a pear and heard the bell faintly. He had the rope over his shoulder when the Prior found him, and says the old bell was louder. The Prior wrote it in his book and then crossed it out, which Brother Odo has never seen him do. The bell comes down again after Christmas."
});
