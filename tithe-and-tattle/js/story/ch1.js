/* Tithe & Tattle, Chapter I: Michaelmas, The Eel Rents (puzzles 1-6).
 * chapterIntro on the first puzzle is Wystan's opening for the chapter. */
window.STORY = window.STORY || [];

STORY.push({
  id: 'ch1-01-rent-at-the-gate',
  chapter: 1, number: 1,
  title: 'Rent at the Gate',
  place: 'the abbey gatehouse',
  characters: ['Brother Wystan', 'Prior Hamo', 'Brother Odo', 'Hob', 'Roger Thatcher', 'Emma Dyer'],
  size: '3×3',
  grade: 'Apprentice',
  chapterIntro: "On the eve of Michaelmas the Abbot told me to keep a true chronicle of the year in Mardle, the town and the abbey both, and the Prior gave me a new tablet and a quire of parchment and said he would read whatever I had written on Saturdays after Chapter. I write down everything I am told. It is not always told to me in the order it happened.",
  intro: "Three of the fen tenants pay their Michaelmas rent in eels, counted in sticks of twenty-five, and the Prior put me at the gate to take the tally while Brother Odo carried the baskets down to the fishponds. I scratched the sticks on my tablet and kept the hours in my head, which the Prior says is the one place nothing should be kept. The tenants came at Prime, Terce and Sext, one at each, and those hours come in that order, Prime first.",
  task: 'Can you work out how many sticks each tenant brought, and the hour each came?',
  categories: [
    { id: 'who', name: 'Tenants', items: [
      { id: 'hob', name: 'Hob', short: 'Hob' },
      { id: 'roger', name: 'Roger Thatcher', short: 'Roger' },
      { id: 'emma', name: 'Emma Dyer', short: 'Emma' }] },
    { id: 'eels', name: 'Eels', who: 'the tenant who brought {x}', is: 'brought {x}', isnt: "didn't bring {x}",
      ordered: { values: [2, 3, 4] }, items: [
      { id: 's2', name: 'two sticks', short: '2 sticks' },
      { id: 's3', name: 'three sticks', short: '3 sticks' },
      { id: 's4', name: 'four sticks', short: '4 sticks' }] },
    { id: 'hour', name: 'Hours', who: 'the tenant who came at {x}', is: 'came at {x}', isnt: "didn't come at {x}",
      ordered: { values: [1, 2, 3] }, items: [
      { id: 'prime', name: 'Prime', short: 'Prime' },
      { id: 'terce', name: 'Terce', short: 'Terce' },
      { id: 'sext', name: 'Sext', short: 'Sext' }] }
  ],
  clues: [
    { text: 'Roger Thatcher was not at the gate by Prime, but he still came before Hob.',
      logic: [['not', 'roger', 'prime'], ['cmp', 'hob', 'roger', 'hour', '>']] },
    { text: 'The tenant who came at Terce brought three sticks.', logic: ['is', 'terce', 's3'] },
    { text: 'Emma Dyer brought the most eels.', logic: ['is', 'emma', 's4'] }
  ],
  solution: { hob: ['s2', 'sext'], roger: ['s3', 'terce'], emma: ['s4', 'prime'] },
  epilogue: "Emma Dyer came first, at Prime, with four sticks, and Hob came last, at Sext, with two, though he owes four. He said his eels were so fat that two sticks were worth four. Brother Odo weighed one and agreed. The Prior asked Hob which water he had caught them in."
});

STORY.push({
  id: 'ch1-02-michaelmas-fair',
  chapter: 1, number: 2,
  title: 'The Michaelmas Fair',
  place: 'the market square',
  characters: ['Widow Tolley', 'Joan Fletcher', 'Tom Webbe', 'Will Hayward', 'Cecily Tolley', 'Walter Crane'],
  size: '3×4',
  grade: 'Apprentice',
  intro: "Widow Tolley watched the whole fair from her door, and afterwards she told me who had the four pitches along the north side of the square. Pitch 1 is nearest the cross and pitch 4 nearest the Swan. She can give you the date of every fair since 1290, but she is no good with names. She called Joan Fletcher \"the Fletcher boy\", her own granddaughter Cecily \"Agnes\", and Tom Webbe \"the singing one\". I have put the right names in.",
  task: 'Can you work out what each stallholder sold, and which pitch each had?',
  categories: [
    { id: 'who', name: 'Stallholders', items: [
      { id: 'joan', name: 'Joan Fletcher', short: 'Joan' },
      { id: 'tom', name: 'Tom Webbe', short: 'Tom' },
      { id: 'will', name: 'Will Hayward', short: 'Will' },
      { id: 'cecily', name: 'Cecily Tolley', short: 'Cecily' }] },
    { id: 'ware', name: 'Wares', who: 'the stallholder who sold {x}', is: 'sold {x}', isnt: "didn't sell {x}", items: [
      { id: 'geese', name: 'geese', short: 'geese' },
      { id: 'cheeses', name: 'cheeses', short: 'cheeses' },
      { id: 'rushlights', name: 'rushlights', short: 'rushlts' },
      { id: 'onions', name: 'onions', short: 'onions' }] },
    { id: 'pitch', name: 'Pitches', who: 'the stallholder at {x}', is: 'was at {x}', isnt: "wasn't at {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'p1', name: 'pitch 1', short: 'pitch 1' },
      { id: 'p2', name: 'pitch 2', short: 'pitch 2' },
      { id: 'p3', name: 'pitch 3', short: 'pitch 3' },
      { id: 'p4', name: 'pitch 4', short: 'pitch 4' }] }
  ],
  clues: [
    { text: 'Will Hayward sold onions.', logic: ['is', 'will', 'onions'] },
    { text: 'The rushlights were sold at pitch 2.', logic: ['is', 'rushlights', 'p2'] },
    { text: "Joan Fletcher didn't sell cheeses, and she would like it known that she makes arrows.", logic: ['not', 'joan', 'cheeses'] },
    { text: 'Tom Webbe sold the rushlights.', logic: ['is', 'tom', 'rushlights'] },
    { text: "Cecily's pitch was further from the cross than Will Hayward's.", logic: ['cmp', 'cecily', 'will', 'pitch', '>'] },
    { text: "Will Hayward's pitch was further from the cross than Joan Fletcher's.", logic: ['cmp', 'will', 'joan', 'pitch', '>'] }
  ],
  solution: { joan: ['geese', 'p1'], tom: ['rushlights', 'p2'], will: ['onions', 'p3'], cecily: ['cheeses', 'p4'] },
  epilogue: "Joan Fletcher had the pitch by the cross and sold out of geese by Terce, and Tom Webbe sang beside her at pitch 2 over his rushlights. Joan told Walter Crane that nobody had said anything about Tom when she paid for the pitch. Walter cut a notch in his tally stick and said he would look into it."
});

STORY.push({
  id: 'ch1-03-goose-dinner',
  chapter: 1, number: 3,
  title: 'Goose at the Swan',
  place: 'the Swan',
  characters: ['Alys Pennock', 'Kit', 'Walter Crane', 'Piers Carter', 'Father Simon', 'Brother Odo'],
  size: '4×4',
  grade: 'Apprentice',
  intro: "Four men ate at the Swan on Michaelmas night, in seats 1 to 4, seat 1 nearest the fire. Alys Pennock chalks what each man pays on the beam over the long bench. That takes in his ale and any old debt, so the man who paid most need not have had the goose. I went to copy the beam next morning, and Kit, her nephew, had wiped half of it with his sleeve. He told me what it had said. Alys says he made most of that up.",
  task: 'Can you work out where each man sat, what he ate and what he paid?',
  categories: [
    { id: 'who', name: 'Diners', items: [
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'walter', name: 'Walter Crane', short: 'Walter' },
      { id: 'piers', name: 'Piers Carter', short: 'Piers' },
      { id: 'simon', name: 'Father Simon', short: 'Simon' }] },
    { id: 'seat', name: 'Seats', who: 'the man in {x}', is: 'sat in {x}', isnt: "didn't sit in {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'seat1', name: 'seat 1', short: 'seat 1' },
      { id: 'seat2', name: 'seat 2', short: 'seat 2' },
      { id: 'seat3', name: 'seat 3', short: 'seat 3' },
      { id: 'seat4', name: 'seat 4', short: 'seat 4' }] },
    { id: 'dish', name: 'Dishes', who: 'the man who ate {x}', is: 'ate {x}', isnt: "didn't eat {x}", items: [
      { id: 'goose', name: 'the roast goose', short: 'goose' },
      { id: 'giblet', name: 'the giblet pie', short: 'giblets' },
      { id: 'eelpie', name: 'the eel pie', short: 'eel pie' },
      { id: 'pottage', name: 'the pease pottage', short: 'pottage' }] },
    { id: 'paid', name: 'Paid', who: 'the man who paid {x}', is: 'paid {x}', isnt: "didn't pay {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'd1', name: 'a penny', short: '1d' },
      { id: 'd2', name: 'twopence', short: '2d' },
      { id: 'd3', name: 'threepence', short: '3d' },
      { id: 'd4', name: 'fourpence', short: '4d' }] }
  ],
  clues: [
    { text: 'Brother Odo, who says his back wants the heat, sat nearest the fire.', logic: ['is', 'odo', 'seat1'] },
    { text: 'Father Simon sat as far from Brother Odo as the bench allowed.', logic: ['is', 'simon', 'seat4'] },
    { text: 'The man who ate the giblet pie paid threepence.', logic: ['is', 'giblet', 'd3'] },
    { text: 'Walter Crane paid a penny, which he says is all an ale-conner should be asked to pay.', logic: ['is', 'walter', 'd1'] },
    { text: 'Piers Carter paid less than Brother Odo.', logic: ['cmp', 'piers', 'odo', 'paid', '<'] },
    { text: "Walter Crane sat second from the fire, at Brother Odo's elbow, as he always does when the abbey is paying.", logic: ['is', 'walter', 'seat2'] },
    { text: 'Father Simon had the eel pie.', logic: ['is', 'simon', 'eelpie'] },
    { text: 'The man who ate the roast goose paid more than Father Simon.', logic: ['cmp', 'goose', 'simon', 'paid', '>'] }
  ],
  solution: { odo: ['seat1', 'goose', 'd4'], walter: ['seat2', 'pottage', 'd1'], piers: ['seat3', 'giblet', 'd3'], simon: ['seat4', 'eelpie', 'd2'] },
  epilogue: "Brother Odo had the roast goose by the fire for fourpence and said the Swan's ale was thin. Walter Crane had pottage for a penny and two more cups of ale, to test it, he said. Father Simon asked who had given the abbey leave to sell ale, and they argued till Alys put the shutters up."
});

STORY.push({
  id: 'ch1-04-empty-traps',
  chapter: 1, number: 4,
  title: 'The Traps on the Bank',
  place: 'the fen',
  characters: ['Brother Anselm', 'Will Hayward', 'Kit', 'Hob'],
  size: '3×4',
  grade: 'Journeyman',
  intro: "Someone pulled four of the abbey's eel traps out of the drain in the night and left them on the bank with the eels still in. The drain runs from the sluice by the abbey wall, out past the willow and then the reed bed, to the black pool by Hob's mill. Four people found one trap each, and I counted the eels at the gatehouse. Then I left my tablet on the step in the sun. The gatehouse cat slept on it until the wax smudged under her.",
  task: 'Can you work out who found the trap at each place, and how many eels were in it?',
  categories: [
    { id: 'who', name: 'Finders', items: [
      { id: 'anselm', name: 'Brother Anselm', short: 'Anselm' },
      { id: 'will', name: 'Will Hayward', short: 'Will' },
      { id: 'kit', name: 'Kit', short: 'Kit' },
      { id: 'hob', name: 'Hob', short: 'Hob' }] },
    { id: 'trap', name: 'Traps', who: 'whoever found the trap at {x}', is: 'found the trap at {x}', isnt: "didn't find the trap at {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'sluice', name: 'the sluice', short: 'sluice' },
      { id: 'willow', name: 'the willow', short: 'willow' },
      { id: 'reeds', name: 'the reed bed', short: 'reed bed' },
      { id: 'pool', name: 'the black pool', short: 'blk pool' }] },
    { id: 'eels', name: 'Eels', who: 'whoever found {x}', is: 'found {x}', isnt: "didn't find {x}",
      ordered: { values: [10, 15, 20, 25] }, items: [
      { id: 'e10', name: 'ten eels', short: '10' },
      { id: 'e15', name: 'fifteen eels', short: '15' },
      { id: 'e20', name: 'twenty eels', short: '20' },
      { id: 'e25', name: 'twenty-five eels', short: '25' }] }
  ],
  clues: [
    { text: 'Of Hob and Brother Anselm, one found the trap at the sluice and the other found fifteen eels.',
      logic: ['pairOr', 'hob', 'anselm', 'sluice', 'e15'] },
    { text: 'The trap Will Hayward found was the next one along the drain from the trap at the sluice.',
      logic: ['cmp', 'will', 'sluice', 'trap', 'adj'] },
    { text: 'Kit found more eels than Will Hayward did.', logic: ['cmp', 'kit', 'will', 'eels', '>'] },
    { text: "Hob's trap was further from the abbey than the one Kit found.", logic: ['cmp', 'hob', 'kit', 'trap', '>'] },
    { text: 'The trap at the black pool held five more eels than the trap at the sluice.',
      logic: ['cmp', 'pool', 'sluice', 'eels', '=+', 5] }
  ],
  solution: { anselm: ['sluice', 'e10'], will: ['willow', 'e20'], kit: ['reeds', 'e25'], hob: ['pool', 'e15'] },
  epilogue: "Kit found the reed-bed trap with a whole stick of eels in it, twenty-five. Hob found fifteen at the black pool and said he had gone out to see to his own traps. The Prior asked Kit what he had been doing on the abbey's drain at dawn. Kit said he had heard the eels were going missing."
});

STORY.push({
  id: 'ch1-05-reeves-tally',
  chapter: 1, number: 5,
  title: "The Reeve's Tally",
  place: 'the Swan',
  characters: ['Walter Crane', 'Hob', 'Joan Fletcher', 'Tom Webbe', 'Piers Carter'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "Walter Crane keeps what the town owes on tally sticks, a notch for every penny. He read them out to me at the Swan, for the debts falling due this autumn on St Luke's Day, All Saints, Martinmas and St Andrew's Day, which come in that order. I wrote it in Latin because the Prior prefers it. Afterwards I found I had put the saints in the column meant for the pence. Walter has gone to Lynn until Saturday.",
  task: 'Can you work out what each person owes, what for, and on which feast it falls due?',
  categories: [
    { id: 'who', name: 'Debtors', items: [
      { id: 'hob', name: 'Hob', short: 'Hob' },
      { id: 'joan', name: 'Joan Fletcher', short: 'Joan' },
      { id: 'tom', name: 'Tom Webbe', short: 'Tom' },
      { id: 'piers', name: 'Piers Carter', short: 'Piers' }] },
    { id: 'for', name: 'Owed for', who: 'whoever owes {x}', is: 'owes {x}', isnt: "doesn't owe {x}", items: [
      { id: 'heap', name: 'the dung-heap fine', short: 'dungheap' },
      { id: 'stall', name: 'the stall toll', short: 'stall' },
      { id: 'pig', name: 'the stray-pig fine', short: 'pig' },
      { id: 'bridge', name: 'the bridge toll', short: 'bridge' }] },
    { id: 'amt', name: 'Amounts', who: 'whoever owes {x}', is: 'owes {x}', isnt: "doesn't owe {x}",
      ordered: { values: [2, 4, 6, 8] }, items: [
      { id: 'd2', name: 'twopence', short: '2d' },
      { id: 'd4', name: 'fourpence', short: '4d' },
      { id: 'd6', name: 'sixpence', short: '6d' },
      { id: 'd8', name: 'eightpence', short: '8d' }] },
    { id: 'due', name: 'Due', who: 'whoever must pay by {x}', is: 'must pay by {x}', isnt: "needn't pay by {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'luke', name: "St Luke's Day", short: 'St Luke' },
      { id: 'saints', name: 'All Saints', short: 'AllSts' },
      { id: 'martin', name: 'Martinmas', short: 'Martnms' },
      { id: 'andrew', name: "St Andrew's Day", short: 'St Andr' }] }
  ],
  clues: [
    { text: 'Joan Fletcher owes less than Tom Webbe, as she has told him more than once.', logic: ['cmp', 'joan', 'tom', 'amt', '<'] },
    { text: "The debt due on St Andrew's Day is the largest.", logic: ['is', 'andrew', 'd8'] },
    { text: "Of Piers Carter and Hob, one owes the bridge toll and the other's debt falls due at Martinmas.",
      logic: ['pairOr', 'piers', 'hob', 'bridge', 'martin'] },
    { text: 'The stray-pig fine falls due at the feast after the one for the stall toll.', logic: ['cmp', 'pig', 'stall', 'due', '=+', 1] },
    { text: 'The dung-heap fine is twopence more than the stray-pig fine.', logic: ['cmp', 'heap', 'pig', 'amt', '=+', 2] },
    { text: "Tom Webbe doesn't owe the stall toll.", logic: ['not', 'tom', 'stall'] },
    { text: "Hob's debt isn't for the stray pig.", logic: ['not', 'hob', 'pig'] },
    { text: "Hob's debt falls due at Martinmas.", logic: ['is', 'hob', 'martin'] }
  ],
  solution: { hob: ['heap', 'd6', 'martin'], joan: ['stall', 'd2', 'luke'], tom: ['pig', 'd4', 'saints'], piers: ['bridge', 'd8', 'andrew'] },
  epilogue: "Piers Carter owes eightpence in bridge toll by St Andrew's Day, and says he will pay it into the toll box when somebody empties the toll box. Hob owes sixpence for the dung heap by Martinmas. He told Walter the heap was the abbey's fault, since everything wrong at the mill starts with the abbey's water."
});

STORY.push({
  id: 'ch1-06-watching-traps',
  chapter: 1, number: 6,
  title: 'Watching the Traps',
  place: 'the fen',
  characters: ['Brother Clement', 'Brother Anselm', 'Brother Odo', 'Kit', 'Hob'],
  size: '4×4',
  grade: 'Journeyman',
  intro: "The Prior set four of us to watch the eel water, one each night from Monday to Thursday, each at a different place along the drain, from the sluice by the abbey wall past the willow and the reed bed to the black pool by Hob's mill. Each of us saw one thing. We all told it at Chapter at once, so the Prior made us go again one at a time while I wrote. Brother Odo told his longest, though he had slept through most of his night.",
  task: 'Can you work out which night each monk watched, where he watched from, and what he saw?',
  categories: [
    { id: 'who', name: 'Watchers', items: [
      { id: 'wystan', name: 'Brother Wystan', short: 'Wystan' },
      { id: 'odo', name: 'Brother Odo', short: 'Odo' },
      { id: 'clement', name: 'Brother Clement', short: 'Clement' },
      { id: 'anselm', name: 'Brother Anselm', short: 'Anselm' }] },
    { id: 'night', name: 'Nights', who: 'the monk who watched on {x}', is: 'watched on {x}', isnt: "didn't watch on {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'mon', name: 'Monday', short: 'Mon' },
      { id: 'tue', name: 'Tuesday', short: 'Tue' },
      { id: 'wed', name: 'Wednesday', short: 'Wed' },
      { id: 'thu', name: 'Thursday', short: 'Thu' }] },
    { id: 'place', name: 'Places', who: 'the monk at {x}', is: 'watched from {x}', isnt: "didn't watch from {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'sluice', name: 'the sluice', short: 'sluice' },
      { id: 'willow', name: 'the willow', short: 'willow' },
      { id: 'reeds', name: 'the reed bed', short: 'reed bed' },
      { id: 'pool', name: 'the black pool', short: 'blk pool' }] },
    { id: 'saw', name: 'Seen', who: 'the monk who saw {x}', is: 'saw {x}', isnt: "didn't see {x}", items: [
      { id: 'nothing', name: 'nothing', short: 'nothing' },
      { id: 'otter', name: 'an otter', short: 'otter' },
      { id: 'kit', name: 'Kit with a sack', short: 'Kit' },
      { id: 'traps', name: "Hob's traps", short: 'Hob trap' }] }
  ],
  clues: [
    { text: 'Brother Odo watched the night before Brother Clement.', logic: ['cmp', 'odo', 'clement', 'night', '=+', -1] },
    { text: 'Whoever saw the otter watched from the reed bed.', logic: ['is', 'otter', 'reeds'] },
    { text: 'Brother Anselm watched from further from the abbey than Brother Wystan.', logic: ['cmp', 'anselm', 'wystan', 'place', '>'] },
    { text: 'Brother Wystan watched later in the week than Brother Odo.', logic: ['cmp', 'wystan', 'odo', 'night', '>'] },
    { text: "Hob's traps were seen on the last night.", logic: ['is', 'traps', 'thu'] },
    { text: 'The monk at the sluice watched on an earlier night than the monk who saw Kit with a sack.', logic: ['cmp', 'sluice', 'kit', 'night', '<'] },
    { text: 'Of Brother Clement and Brother Wystan, one watched on Wednesday and the other watched from the reed bed.',
      logic: ['pairOr', 'clement', 'wystan', 'wed', 'reeds'] }
  ],
  solution: { wystan: ['wed', 'willow', 'kit'], odo: ['mon', 'sluice', 'nothing'], clement: ['tue', 'reeds', 'otter'], anselm: ['thu', 'pool', 'traps'] },
  epilogue: "Brother Clement saw an otter at the reed bed on Tuesday and called it lutra. I saw Kit with a sack at the willow on Wednesday. On Thursday Brother Anselm saw Hob setting his traps at the black pool, ten yards inside the abbey's water. The Prior went to the mill on Friday, and Hob said the water had moved."
});
