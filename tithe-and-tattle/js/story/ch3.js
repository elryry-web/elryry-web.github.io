/* Tithe & Tattle, Chapter III: Christmas, The Boy Bishop (puzzles 13-18).
 * chapterIntro on the first puzzle is Wystan's opening for the chapter. */
window.STORY = window.STORY || [];

STORY.push({
  id: 'ch3-13-boy-bishop',
  chapter: 3, number: 13,
  title: "St Nicholas's Eve",
  place: "the vestry of St Mary's",
  characters: ['Brother Wystan', 'Father Simon', 'Kit', 'Hal Sutor', 'Dickon Baxter', 'Wat Dyer'],
  size: '3×4',
  grade: 'Apprentice',
  chapterIntro: "In Mardle, as in most places, the choirboys choose one of themselves at St Nicholas to be bishop until Holy Innocents, and he wears a mitre and gives orders and people mostly do as he says, because it is Christmas. The cracked bell is to hang where it is until after Twelfth Night, and the Abbot has been asked not to ring it, and rings it only on feast days.",
  intro: "On the eve of St Nicholas the choirboys of St Mary's chose their bishop in the vestry, and Father Simon asked me to keep the count, because he says a priest should not know who voted for whom. Four boys stood, each with a promise, and the others made their marks on my wax tablet, which I put down by the brazier while I trimmed the candle. When I picked it up the marks had run together, and I put the count back from what the boys remembered.",
  task: 'Can you work out how many votes each boy got, and what each promised?',
  categories: [
    { id: 'who', name: 'Boys', items: [
      { id: 'kit', name: 'Kit', short: 'Kit' },
      { id: 'hal', name: 'Hal Sutor', short: 'Hal' },
      { id: 'dickon', name: 'Dickon Baxter', short: 'Dickon' },
      { id: 'wat', name: 'Wat Dyer', short: 'Wat' }] },
    { id: 'votes', name: 'Votes', who: 'the boy who got {x}', is: 'got {x}', isnt: "didn't get {x}",
      ordered: { values: [2, 3, 4, 5] }, items: [
      { id: 'v2', name: 'two votes', short: '2 votes' },
      { id: 'v3', name: 'three votes', short: '3 votes' },
      { id: 'v4', name: 'four votes', short: '4 votes' },
      { id: 'v5', name: 'five votes', short: '5 votes' }] },
    { id: 'promise', name: 'Promises', who: 'the boy who promised {x}', is: 'promised {x}', isnt: "didn't promise {x}", items: [
      { id: 'cakes', name: 'honey cakes', short: 'Cakes' },
      { id: 'nolatin', name: 'no Latin for a week', short: 'No Latin' },
      { id: 'goose', name: 'a goose', short: 'Goose' },
      { id: 'pears', name: "the Abbot's pears", short: 'Pears' }] }
  ],
  clues: [
    { text: 'Kit got the most votes, though he joined the choir a week ago and knows none of the words.', logic: ['is', 'kit', 'v5'] },
    { text: 'The boy who promised honey cakes got four votes.', logic: ['is', 'cakes', 'v4'] },
    { text: 'Dickon Baxter promised a goose, which was news to his mother.', logic: ['is', 'dickon', 'goose'] },
    { text: "Wat Dyer promised neither honey cakes nor the Abbot's pears.", logic: [['not', 'wat', 'cakes'], ['not', 'wat', 'pears']] },
    { text: 'Wat Dyer got more votes than Dickon.', logic: ['cmp', 'wat', 'dickon', 'votes', '>'] }
  ],
  solution: { kit: ['v5', 'pears'], hal: ['v4', 'cakes'], dickon: ['v2', 'goose'], wat: ['v3', 'nolatin'] },
  epilogue: "Kit got five votes for the Abbot's pears, which are not his to promise, and Hal Sutor four for honey cakes. Wat Dyer got three for no Latin, and Dickon two for the goose. Kit had the mitre, and in the morning he asked for the pears on the Abbot's deaf side, and the Abbot said yes."
});

STORY.push({
  id: 'ch3-14-decrees',
  chapter: 3, number: 14,
  title: "The Bishop's Orders",
  place: 'about the town',
  mapPlace: 'square',
  characters: ['Brother Wystan', 'Kit', 'the Prior', 'Brother Odo', 'Walter Crane', 'Father Simon'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "A boy bishop may give orders to his elders while he reigns, within reason. Kit gave four orders to four grown men on four feasts, St Nicholas, St Lucy, St Thomas and Holy Innocents, which come in that order through December, and each in a different place. He asked me to copy them out fair, but he can't write, so he drew them for me, and his drawing of Walter looks very like his drawing of the mule.",
  task: 'Can you work out what Kit ordered each man to do, on which feast, and where?',
  categories: [
    { id: 'who', name: 'Men', items: [
      { id: 'prior', name: 'the Prior', short: 'Prior' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' },
      { id: 'simon', name: 'Father Simon', short: 'Simon' }] },
    { id: 'order', name: 'Orders', who: 'the man ordered to {x}', is: 'was ordered to {x}', isnt: "wasn't ordered to {x}", items: [
      { id: 'sit', name: 'sit down', short: 'Sit' },
      { id: 'praise', name: "praise the Swan's ale", short: 'Praise' },
      { id: 'mule', name: 'call the mule my lord', short: 'Mule' },
      { id: 'train', name: "carry the bishop's train", short: 'Train' }] },
    { id: 'day', name: 'Feasts', who: 'the man given his order on {x}', is: 'was given his order on {x}', isnt: "wasn't given his order on {x}",
      ordered: { values: [6, 13, 21, 28] }, items: [
      { id: 'nicholas', name: "St Nicholas's Day", short: 'Nicholas' },
      { id: 'lucy', name: "St Lucy's Day", short: 'Lucy' },
      { id: 'thomas', name: "St Thomas's Day", short: 'Thomas' },
      { id: 'innocents', name: "Holy Innocents' Day", short: 'Innocent' }] },
    { id: 'place', name: 'Places', who: 'the man given his order in {x}', is: 'was given his order in {x}', isnt: "wasn't given his order in {x}", items: [
      { id: 'cloister', name: 'the cloister', short: 'Cloister' },
      { id: 'swan', name: 'the Swan', short: 'Swan' },
      { id: 'square', name: 'the square', short: 'Square' },
      { id: 'stmarys', name: "St Mary's", short: "St Mary" }] }
  ],
  clues: [
    { text: 'The Prior was ordered either to sit down or to carry the train, and says neither is fitting.', logic: ['either', 'prior', ['sit', 'train']] },
    { text: "Brother Odo's order came later in December than Father Simon's.", logic: ['cmp', 'odo', 'simon', 'day', '>'] },
    { text: 'The order to call the mule my lord was given at the Swan, where Piers keeps the mule while he drinks.', logic: ['is', 'swan', 'mule'] },
    { text: 'Of Walter and the Prior, one had his order on St Nicholas\'s Day and the other had his in the cloister.', logic: ['pairOr', 'walter', 'prior', 'nicholas', 'cloister'] },
    { text: "The order given at St Mary's came before the one given in the square.", logic: ['cmp', 'stmarys', 'square', 'day', '<'] },
    { text: "Brother Odo wasn't at the Swan for his.", logic: ['not', 'odo', 'swan'] },
    { text: "The man ordered to carry the train had his order on St Nicholas's Day, the first of Kit's reign.", logic: ['is', 'train', 'nicholas'] },
    { text: 'The Prior had his order later in December than Brother Odo.', logic: ['cmp', 'prior', 'odo', 'day', '>'] }
  ],
  solution: { prior: ['sit', 'innocents', 'cloister'], odo: ['praise', 'thomas', 'square'], walter: ['train', 'nicholas', 'stmarys'], simon: ['mule', 'lucy', 'swan'] },
  epilogue: "Walter carried the train round St Mary's on St Nicholas's Day and notched his stick for every boy who trod on it. Father Simon called the mule my lord at the Swan, and Brother Odo praised Alys's ale in the square. On Holy Innocents the Prior sat down in the cloister for one psalm."
});

STORY.push({
  id: 'ch3-15-mummers',
  chapter: 3, number: 15,
  title: 'The Mummers',
  place: 'the Swan',
  characters: ['Brother Wystan', 'Alys Pennock', 'Joan Fletcher', 'Tom Webbe', 'Piers Carter', 'Roger Thatcher'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "Mummers come into a house at Christmas in disguise and play at dice with whoever keeps it, without speaking a word, and the dice are made to fall so that the house wins, which Alys says is the whole courtesy of it. Four came into the Swan in Christmas week, each in a costume borrowed from somebody in the town. Since they never spoke and nobody saw a face, Alys asked them all the next morning which one each had been, and all four said the bear.",
  task: 'Can you work out which part each mummer played, what the costume was, and who lent it?',
  categories: [
    { id: 'who', name: 'Mummers', items: [
      { id: 'joan', name: 'Joan Fletcher', short: 'Joan' },
      { id: 'tom', name: 'Tom Webbe', short: 'Tom' },
      { id: 'piers', name: 'Piers Carter', short: 'Piers' },
      { id: 'roger', name: 'Roger Thatcher', short: 'Roger' }] },
    { id: 'part', name: 'Parts', who: 'the mummer who played {x}', is: 'played {x}', isnt: "didn't play {x}", items: [
      { id: 'king', name: 'the king', short: 'King' },
      { id: 'devil', name: 'the devil', short: 'Devil' },
      { id: 'bear', name: 'the bear', short: 'Bear' },
      { id: 'wildman', name: 'the wild man', short: 'Wild man' }] },
    { id: 'dress', name: 'Costumes', who: 'the mummer in {x}', is: 'wore {x}', isnt: "didn't wear {x}", items: [
      { id: 'gown', name: 'an old blue gown', short: 'Gown' },
      { id: 'curtain', name: 'a red bed curtain', short: 'Curtain' },
      { id: 'skins', name: 'sheepskins', short: 'Skins' },
      { id: 'sacks', name: 'flour sacks', short: 'Sacks' }] },
    { id: 'lender', name: 'Lenders', who: 'the mummer whose costume {x} lent', is: 'borrowed from {x}', isnt: "didn't borrow from {x}", items: [
      { id: 'isabel', name: 'Dame Isabel', short: 'Isabel' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'tolley', name: 'Widow Tolley', short: 'Tolley' },
      { id: 'hob', name: 'Hob', short: 'Hob' }] }
  ],
  clues: [
    { text: 'Whoever wore the sheepskins played the bear, which is only sensible.', logic: ['is', 'skins', 'bear'] },
    { text: 'The flour sacks were lent by Hob, of course.', logic: ['is', 'hob', 'sacks'] },
    { text: 'Of Tom Webbe and Roger Thatcher, one was the king and the other wore a costume lent by Hob.', logic: ['pairOr', 'tom', 'roger', 'king', 'hob'] },
    { text: 'Tom Webbe, the devil and the mummer in flour sacks were three different people.', logic: ['allDiff', ['tom', 'devil', 'sacks']] },
    { text: 'Piers Carter was either the bear or the wild man.', logic: ['either', 'piers', ['bear', 'wildman']] },
    { text: 'If Tom Webbe was the king, he wore the old blue gown.', logic: ['ifThen', ['is', 'tom', 'king'], ['is', 'tom', 'gown']] },
    { text: 'Whatever Brother Odo lent went to either the devil or the wild man.', logic: ['either', 'odo', ['devil', 'wildman']] },
    { text: 'Piers Carter, the mummer who borrowed from Dame Isabel and the one in flour sacks were three different people.', logic: ['allDiff', ['piers', 'isabel', 'sacks']] }
  ],
  solution: { joan: ['devil', 'curtain', 'odo'], tom: ['king', 'gown', 'isabel'], piers: ['bear', 'skins', 'tolley'], roger: ['wildman', 'sacks', 'hob'] },
  epilogue: "Tom Webbe was the king in Dame Isabel's old gown and lost to Alys. Joan was the devil in the red curtain from our guest house, lent by Brother Odo without asking the Prior. Piers was the bear in Widow Tolley's sheepskins, and Roger the wild man in Hob's flour sacks."
});

STORY.push({
  id: 'ch3-16-mardle-feast',
  chapter: 3, number: 16,
  title: 'Christmas at Mardle Hall',
  place: 'Mardle Hall',
  characters: ['Brother Wystan', 'Dame Isabel', 'the Abbot', 'the Prior', 'Father Simon', 'Walter Crane', 'Alys Pennock'],
  size: '4×5',
  grade: 'Journeyman',
  intro: "Dame Isabel keeps Christmas at Mardle Hall with a dinner for the abbey and the town, and she gives her gifts at the table, though gifts are for New Year, because she says by New Year people have forgotten who gave them what. Five guests sat at her table. Her steward writes the seating in French, and I read French slowly, so I have the places counted outward from her chair and the rest only roughly.",
  task: 'Can you work out where each guest sat, which dish was set before each, and what Dame Isabel gave them?',
  categories: [
    { id: 'who', name: 'Guests', items: [
      { id: 'abbot', name: 'the Abbot', short: 'Abbot' },
      { id: 'prior', name: 'the Prior', short: 'Prior' },
      { id: 'simon', name: 'Father Simon', short: 'Simon' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' },
      { id: 'alys', name: 'Alys Pennock', short: 'Alys' }] },
    { id: 'seat', name: 'Seats', who: 'the guest in {x}', is: 'sat in {x}', isnt: "didn't sit in {x}",
      ordered: { values: [1, 2, 3, 4, 5] }, items: [
      { id: 's1', name: 'the first place from her', short: '1st' },
      { id: 's2', name: 'the second place', short: '2nd' },
      { id: 's3', name: 'the third place', short: '3rd' },
      { id: 's4', name: 'the fourth place', short: '4th' },
      { id: 's5', name: 'the fifth place', short: '5th' }] },
    { id: 'dish', name: 'Dishes', who: 'the guest with {x}', is: 'had {x}', isnt: "didn't have {x}", items: [
      { id: 'brawn', name: 'brawn with mustard', short: 'Brawn' },
      { id: 'swan', name: 'roast swan', short: 'Swan' },
      { id: 'frumenty', name: 'frumenty with venison', short: 'Frumenty' },
      { id: 'pike', name: 'pike in galentine', short: 'Pike' },
      { id: 'capon', name: 'capon pie', short: 'Capon' }] },
    { id: 'gift', name: 'Gifts', who: 'the guest given {x}', is: 'was given {x}', isnt: "wasn't given {x}", items: [
      { id: 'gloves', name: 'gloves', short: 'Gloves' },
      { id: 'knife', name: 'a knife', short: 'Knife' },
      { id: 'purse', name: 'a purse', short: 'Purse' },
      { id: 'wax', name: 'a pound of wax', short: 'Wax' },
      { id: 'hood', name: 'a hood', short: 'Hood' }] }
  ],
  clues: [
    { text: 'The Prior sat one place further from Dame Isabel than Father Simon.', logic: ['cmp', 'prior', 'simon', 'seat', '=+', 1] },
    { text: 'Whoever had the roast swan was given the gloves.', logic: ['is', 'swan', 'gloves'] },
    { text: 'Alys had the frumenty.', logic: ['is', 'alys', 'frumenty'] },
    { text: 'The brawn was set further from Dame Isabel than the capon pie.', logic: ['cmp', 'brawn', 'capon', 'seat', '>'] },
    { text: 'The guest at the far end was given a hood, against the draught from the door.', logic: ['is', 's5', 'hood'] },
    { text: 'Of Walter and the Prior, one was given the purse and the other had the capon pie.', logic: ['pairOr', 'walter', 'prior', 'purse', 'capon'] },
    { text: 'The Abbot sat nearer Dame Isabel than anyone.', logic: ['is', 'abbot', 's1'] },
    { text: 'Walter sat further from Dame Isabel than the Prior.', logic: ['cmp', 'walter', 'prior', 'seat', '>'] },
    { text: 'The Abbot, the guest given the knife and the one with the capon pie were three different people.', logic: ['allDiff', ['abbot', 'knife', 'capon']] }
  ],
  solution: { abbot: ['s1', 'swan', 'gloves'], simon: ['s2', 'pike', 'knife'], prior: ['s3', 'capon', 'wax'], walter: ['s4', 'brawn', 'purse'], alys: ['s5', 'frumenty', 'hood'] },
  epilogue: "Alys sat at the far end with the frumenty and wore the hood home over her coif. Walter was given the purse and counted what was in it under the table. The Prior had the capon pie and the wax, and weighed it at home, and it was a pound."
});

STORY.push({
  id: 'ch3-17-wassail',
  chapter: 3, number: 17,
  title: 'The Wassail Bowl',
  place: 'the doors of Mardle',
  mapPlace: 'gate',
  characters: ['Brother Wystan', 'Walter Crane', 'Joan Fletcher', 'Tom Webbe', 'Kit', 'the Abbot'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "Walter says Mardle has always carried the wassail bowl round at Christmas, and he has carried it since he was a boy, so I suppose that is always. At each door the bearer says 'wassail', the house answers 'drinkhail' and drinks, and the bowl is filled again. This year it went to four doors on four nights, St Stephen's, St John's, Holy Innocents' and St Thomas's, in that order, with a different song at each. Joan Fletcher and Tom Webbe each told me separately that they had led all four.",
  task: 'Can you work out which night the bowl went to each door, who led the singing, and what was sung?',
  categories: [
    { id: 'who', name: 'Doors', items: [
      { id: 'abbot', name: 'the abbey gate', short: 'Abbey' },
      { id: 'isabel', name: "Dame Isabel's hall", short: 'Isabel' },
      { id: 'swan', name: 'the Swan', short: 'Swan' },
      { id: 'glebe', name: "Father Simon's house", short: 'Simon' }] },
    { id: 'night', name: 'Nights', who: 'the door the bowl went to on {x}', is: 'had the bowl on {x}', isnt: "didn't have the bowl on {x}",
      ordered: { values: [26, 27, 28, 29] }, items: [
      { id: 'd26', name: "St Stephen's night", short: 'Stephen' },
      { id: 'd27', name: "St John's night", short: 'John' },
      { id: 'd28', name: "Holy Innocents' night", short: 'Innocnts' },
      { id: 'd29', name: "St Thomas's night", short: 'Thomas' }] },
    { id: 'lead', name: 'Leaders', who: 'the door where {x} led', is: 'had {x} leading the song', isnt: "didn't have {x} leading the song", items: [
      { id: 'joan', name: 'Joan Fletcher', short: 'Joan' },
      { id: 'tom', name: 'Tom Webbe', short: 'Tom' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' },
      { id: 'kit', name: 'Kit', short: 'Kit' }] },
    { id: 'song', name: 'Songs', who: 'the door where they sang {x}', is: 'heard {x}', isnt: "didn't hear {x}", items: [
      { id: 'angelus', name: "'Angelus ad virginem'", short: 'Angelus' },
      { id: 'sumer', name: "'Sumer is icumen in'", short: 'Sumer' },
      { id: 'lullay', name: 'a lullay', short: 'Lullay' },
      { id: 'edi', name: "'Edi beo thu'", short: 'Edi' }] }
  ],
  clues: [
    { text: "Tom Webbe led 'Sumer is icumen in', in December.", logic: ['is', 'sumer', 'tom'] },
    { text: "'Angelus ad virginem' was sung the night before the lullay.", logic: ['cmp', 'angelus', 'lullay', 'night', '=+', -1] },
    { text: "The bowl went to Dame Isabel's hall on an earlier night than to the Swan.", logic: ['cmp', 'isabel', 'swan', 'night', '<'] },
    { text: "Kit led on Holy Innocents' night, his last night as bishop.", logic: ['is', 'kit', 'd28'] },
    { text: "Kit led either at Father Simon's house or at Dame Isabel's hall.", logic: ['either', 'kit', ['glebe', 'isabel']] },
    { text: "'Edi beo thu' and 'Sumer is icumen in' were sung on nights next to each other.", logic: ['cmp', 'edi', 'sumer', 'night', 'adj'] },
    { text: "The door where Joan led, the one where 'Sumer is icumen in' was sung and the Swan were three different doors.", logic: ['allDiff', ['joan', 'sumer', 'swan']] },
    { text: 'Joan led the night before Walter did.', logic: ['cmp', 'joan', 'walter', 'night', '=+', -1] }
  ],
  solution: { abbot: ['d29', 'tom', 'sumer'], isabel: ['d26', 'joan', 'angelus'], swan: ['d27', 'walter', 'lullay'], glebe: ['d28', 'kit', 'edi'] },
  epilogue: "On St Thomas's night Tom Webbe led 'Sumer is icumen in' at the abbey gate, and they sang it as a round until the porter opened. The Abbot sent out a jug of the cellar ale and stood in the gateway in his blanket while they drank it."
});

STORY.push({
  id: 'ch3-18-twelfth-cake',
  chapter: 3, number: 18,
  title: 'The Twelfth Night Cake',
  place: 'the abbey guest house',
  characters: ['Brother Wystan', 'the Abbot', 'the Prior', 'Brother Odo', 'Hob', 'Kit'],
  size: '4×5',
  grade: 'Master',
  intro: "Dame Isabel sent a Twelfth Night cake to the abbey guest house with a bean baked inside, and whoever finds the bean is king of the feast until morning, though hers have a pea in as well, for a queen, which is her own idea. Five sat along the bench, counted from the fire, and each cut his own slice in turn while I poured. Kit, who has liked giving orders since December, says he found the bean and the pea both.",
  task: 'Can you work out where each guest sat, in which turn he cut his slice, and what he found in it?',
  categories: [
    { id: 'who', name: 'Guests', items: [
      { id: 'abbot', name: 'the Abbot', short: 'Abbot' },
      { id: 'prior', name: 'the Prior', short: 'Prior' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'hob', name: 'Hob', short: 'Hob' },
      { id: 'kit', name: 'Kit', short: 'Kit' }] },
    { id: 'seat', name: 'Seats', who: 'the guest in {x}', is: 'sat in {x}', isnt: "didn't sit in {x}",
      ordered: { values: [1, 2, 3, 4, 5] }, items: [
      { id: 's1', name: 'the place nearest the fire', short: '1st' },
      { id: 's2', name: 'the second place', short: '2nd' },
      { id: 's3', name: 'the third place', short: '3rd' },
      { id: 's4', name: 'the fourth place', short: '4th' },
      { id: 's5', name: 'the fifth place', short: '5th' }] },
    { id: 'cut', name: 'Turns', who: 'the guest who cut {x}', is: 'cut {x}', isnt: "didn't cut {x}",
      ordered: { values: [1, 2, 3, 4, 5] }, items: [
      { id: 'c1', name: 'first', short: '1st cut' },
      { id: 'c2', name: 'second', short: '2nd cut' },
      { id: 'c3', name: 'third', short: '3rd cut' },
      { id: 'c4', name: 'fourth', short: '4th cut' },
      { id: 'c5', name: 'fifth', short: '5th cut' }] },
    { id: 'found', name: 'Finds', who: 'the guest who found {x}', is: 'found {x}', isnt: "didn't find {x}", items: [
      { id: 'bean', name: 'the bean', short: 'Bean' },
      { id: 'pea', name: 'the pea', short: 'Pea' },
      { id: 'clove', name: 'a clove', short: 'Clove' },
      { id: 'crust', name: 'a burnt crust', short: 'Crust' },
      { id: 'nothing', name: 'nothing', short: 'Nothing' }] }
  ],
  clues: [
    { text: 'The Abbot sat next to Brother Odo.', logic: ['cmp', 'abbot', 'odo', 'seat', 'adj'] },
    { text: 'Whoever sat nearest the fire cut first.', logic: ['is', 'c1', 's1'] },
    { text: 'Hob cut before the Prior.', logic: ['cmp', 'hob', 'prior', 'cut', '<'] },
    { text: 'The Abbot sat at one end of the bench or the other.', logic: ['either', 'abbot', ['s1', 's5']] },
    { text: 'Brother Odo sat one place nearer the fire than Kit.', logic: ['cmp', 'odo', 'kit', 'seat', '=+', -1] },
    { text: 'Kit found either nothing or the pea.', logic: ['either', 'kit', ['nothing', 'pea']] },
    { text: 'If Hob found the bean, the Prior found the pea.', logic: ['ifThen', ['is', 'hob', 'bean'], ['is', 'prior', 'pea']] },
    { text: 'Of Hob and Brother Odo, one found the bean and the other cut last.', logic: ['pairOr', 'hob', 'odo', 'bean', 'c5'] },
    { text: 'The Abbot, the finder of the pea, the finder of the burnt crust and the one who found nothing were four different people.', logic: ['allDiff', ['abbot', 'pea', 'crust', 'nothing']] },
    { text: "Whoever sat in the third place didn't cut third.", logic: ['not', 's3', 'c3'] },
    { text: 'Whoever found the pea sat one place nearer the fire than whoever cut second.', logic: ['cmp', 'pea', 'c2', 'seat', '=+', -1] }
  ],
  solution: { abbot: ['s1', 'c1', 'clove'], odo: ['s2', 'c5', 'crust'], kit: ['s3', 'c4', 'nothing'], prior: ['s4', 'c3', 'pea'], hob: ['s5', 'c2', 'bean'] },
  epilogue: "Hob found the bean and was king, and his first order was that the weir stays where it is, and the Abbot said that seemed fair. The Prior found the pea and was queen, and gave no orders. He asked Hob how long a king's word lasts. Until morning, Hob said."
});
