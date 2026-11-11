/* Sample story puzzle. A worked example of the format for the puzzle writers; see AUTHORING.md.
 * sample:true keeps it out of the chapter list. */
window.STORY = window.STORY || [];
STORY.push({
  id: 'sample-market-stalls',
  sample: true,
  chapter: 0,
  number: 0,
  title: 'Four Stalls by the Cross',
  place: 'the market square',
  characters: ['Margery Baxter', 'Agnes Sutor', 'Tom Webbe', 'Isolda Brewer', 'Widow Tolley'],
  size: '3×4',
  grade: 'Journeyman',
  intro: "The Prior wanted the stall money from the four pitches nearest the cross, and he wanted to know who had stood where, because the pitch by the cross pays a halfpenny more. I wrote it all down on my tablet, but Widow Tolley stopped me to tell me about the fair of 1309, when a bear got loose, and by the time she had finished the bear I had lost track of which stall was which.",
  task: 'Can you work out what each stallholder sold and which pitch each had?',
  categories: [
    { id: 'who', name: 'Stallholders', items: [
      { id: 'margery', name: 'Margery Baxter' }, { id: 'agnes', name: 'Agnes Sutor' },
      { id: 'tom', name: 'Tom Webbe' }, { id: 'isolda', name: 'Isolda Brewer' }] },
    { id: 'ware', name: 'Wares', who: 'the stallholder who sold {x}', is: 'sold {x}', isnt: "didn't sell {x}", items: [
      { id: 'candles', name: 'candles' }, { id: 'pies', name: 'eel pies' },
      { id: 'honey', name: 'honey' }, { id: 'cloth', name: 'woollen cloth' }] },
    { id: 'pitch', name: 'Pitches', who: 'the stallholder at {x}', is: 'was at {x}', isnt: "wasn't at {x}",
      ordered: { values: [1, 2, 3, 4] }, items: [
      { id: 'p1', name: 'pitch 1' }, { id: 'p2', name: 'pitch 2' },
      { id: 'p3', name: 'pitch 3' }, { id: 'p4', name: 'pitch 4' }] }
  ],
  clues: [
    { text: 'Agnes Sutor had the pitch nearest the cross.', logic: ['is', 'agnes', 'p1'] },
    { text: "Tom Webbe had a pitch further from the cross than Margery Baxter, and Tom didn't sell woollen cloth.",
      logic: [['cmp', 'tom', 'margery', 'pitch', '>'], ['not', 'tom', 'cloth']] },
    { text: 'The honey was sold at pitch 4.', logic: ['is', 'honey', 'p4'] },
    { text: "Isolda Brewer didn't sell eel pies.", logic: ['not', 'isolda', 'pies'] },
    { text: 'Margery Baxter had a pitch further from the cross than Isolda Brewer.', logic: ['cmp', 'margery', 'isolda', 'pitch', '>'] },
    { text: 'The candles were sold at the pitch next to Tom Webbe.', logic: ['cmp', 'candles', 'tom', 'pitch', 'adj'] }
  ],
  solution: { margery: ['candles', 'p3'], agnes: ['pies', 'p1'], tom: ['honey', 'p4'], isolda: ['cloth', 'p2'] },
  epilogue: "So it was Agnes Sutor at the cross with her eel pies, and she paid the extra halfpenny without a word. Tom Webbe sold the last of his honey before None and sang on the way home, and Widow Tolley said the bear had been quieter."
});
