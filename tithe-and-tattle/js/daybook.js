/* Tithe & Tattle: the Day Book, endless generated puzzles.
 * UMD: window.DAYBOOK in the browser (load js/logic.js first), require('./daybook.js') in node.
 *
 *   DAYBOOK.generate({cats: 3|4|5, items: 3..6, grade: 'Apprentice'|'Journeyman'|'Master',
 *                     seed: number|string, theme: themeId (optional)})
 *     -> a full puzzle object in the story format (see AUTHORING.md), plus
 *        daybook: {seed, theme, attempts, ms, gradeHit, targetGrade}
 *   Same options and seed give the same puzzle.
 *   DAYBOOK.themes -> [{id, title}]
 *   DAYBOOK.sampleClues(seed, count) -> array of random clue sentences (for proofreading)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.DAYBOOK = factory(root.LOGIC);
})(typeof self !== 'undefined' ? self : this, function (LOGIC) {
  'use strict';

  // ---------------------------------------------------------------- random
  function hashSeed(s) {
    if (typeof s === 'number' && isFinite(s)) return s >>> 0;
    s = String(s); var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function Rng(seed) {
    var r = mulberry32(hashSeed(seed));
    var R = {
      next: r,
      int: function (n) { return Math.floor(r() * n); },
      pick: function (a) { return a[Math.floor(r() * a.length)]; },
      shuffle: function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
      sample: function (a, k) { return R.shuffle(a).slice(0, k); },
      weighted: function (pairs) { // [[weight, value], ...]
        var tot = 0; pairs.forEach(function (p) { tot += p[0]; });
        var x = r() * tot;
        for (var i = 0; i < pairs.length; i++) { x -= pairs[i][0]; if (x < 0) return pairs[i][1]; }
        return pairs[pairs.length - 1][1];
      }
    };
    return R;
  }

  // ---------------------------------------------------------------- words
  var NUM = ['nought', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function count(k, one, many) { return (k === 1 ? 'one ' + one : NUM[k] + ' ' + many); }
  function pence(k) {
    return ['', 'a penny', 'twopence', 'threepence', 'fourpence', 'fivepence', 'sixpence', 'sevenpence',
      'eightpence', 'ninepence', 'tenpence', 'elevenpence', 'twelvepence'][k];
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function listAnd(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function listOr(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]; }
  function fill(t, x) { return t.replace('{x}', x); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function range(a, b, step) { var o = []; for (var v = a; v <= b; v += (step || 1)) o.push(v); return o; }

  var HOURS = ['Matins', 'Lauds', 'Prime', 'Terce', 'Sext', 'None', 'Vespers', 'Compline'];
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

  // Ordered value helpers. Each returns {values, names} for n items, chosen with R.
  function window_(names, from, to) { // consecutive run from names[from..to]
    return function (R, n) {
      var start = from + R.int(to - from - n + 2);
      var vals = range(start, start + n - 1);
      return { values: vals, names: vals.map(function (v) { return names[v]; }) };
    };
  }
  function firstN(nameFn) { return function (R, n) { var v = range(1, n); return { values: v, names: v.map(nameFn) }; }; }
  function subset(pool, nameFn) {
    return function (R, n) {
      var v = R.sample(pool, n).sort(function (a, b) { return a - b; });
      return { values: v, names: v.map(nameFn) };
    };
  }

  // ---------------------------------------------------------------- themes
  // Category fields used by logic.js: id, name, who, is, isnt (with {x} for the item name).
  // Ordered categories also give: pick(R, n), lt, gt ({a}, {b} noun phrases), optional
  // more/less with {k} and diff(k) for exact differences, adj/nadj for neighbours (only for
  // categories whose values run 1, 2, 3...), top/bottom predicates for the highest/lowest item.
  // task: the phrase for the task line.
  var THEMES = [
    {
      id: 'market', title: 'Market Day', place: 'the market square',
      key: { id: 'who', name: 'Stallholders', task: null, kind: 'people',
        pool: ['Agnes Sutor', 'Margery Baxter', 'Roger Thatcher', 'Emma Dyer', 'Isolda Brewer', 'Ralph Smith', 'Tom Webbe', 'Joan Fletcher', 'Sim Shepherd'] },
      cats: [
        { id: 'ware', name: 'Wares', task: 'what each stallholder sold', who: 'the stallholder who sold {x}', is: 'sold {x}', isnt: "didn't sell {x}",
          pool: ['candles', 'eel pies', 'honey', 'woollen cloth', 'cheese', 'knives', 'salt', 'onions', 'wooden bowls', 'leather belts', 'cabbages'] },
        { id: 'pitch', name: 'Pitches', task: 'which pitch each had', who: 'the stallholder at {x}', is: 'was at {x}', isnt: "wasn't at {x}",
          pick: firstN(function (v) { return 'pitch ' + v; }),
          lt: '{a} had a pitch nearer the cross than {b}', gt: '{a} had a pitch further from the cross than {b}',
          diff: function (k) { return count(k, 'pitch', 'pitches'); },
          more: '{a} was {k} further from the cross than {b}', less: '{a} was {k} nearer the cross than {b}',
          adj: '{a} and {b} had pitches side by side', nadj: "{a} and {b} didn't have pitches side by side",
          bottom: 'had the pitch nearest the cross', top: 'had the pitch furthest from the cross' },
        { id: 'takings', name: 'Takings', task: 'how much each took', who: 'the stallholder who took {x}', is: 'took {x}', isnt: "didn't take {x}",
          pick: subset(range(2, 12), pence),
          lt: '{a} took less than {b}', gt: '{a} took more than {b}',
          diff: pence, more: '{a} took {k} more than {b}', less: '{a} took {k} less than {b}',
          top: 'took the most', bottom: 'took the least' },
        { id: 'first', name: 'First customers', task: 'who was first to buy from each', who: 'the stallholder whose first customer was {x}', is: 'served {x} first', isnt: "didn't serve {x} first",
          pool: ['Widow Tolley', 'Father Simon', 'Kit', 'Walter Crane', 'Alys Pennock', 'Piers Carter', 'Dame Isabel', 'Brother Odo'] }
      ],
      intros: [
        "It was market day on the square and the Prior sent me to write down who had which pitch, so that the abbey could have its stall money. Widow Tolley sat at her door and told me the date of every fair since 1290. I have {n} stallholders on my tablet, and the rest of it went somewhere between her door and the cross.",
        "I was meant to be noting the {n} stallholders on the square and what each of them did, but a goose got loose from somebody's basket and I drew it in the margin instead. The Prior says a margin is for corrections. I have the names in a column down the side and everything else in a heap.",
        "Market days I keep the stall roll, and today Kit helped me, by which I mean he followed me with a cabbage he had found and told me things. Some of what he told me was true. I have put down everything, and I am sorry to say I no longer know which parts came from Kit."
      ]
    },
    {
      id: 'eels', title: 'Rent at the Gate', place: 'the abbey gate',
      key: { id: 'who', name: 'Tenants', kind: 'people',
        pool: ['Hob', 'Will Hayward', 'Sim Shepherd', 'Roger Thatcher', 'Emma Dyer', 'Ralph Smith', 'Cecily Tolley', 'Piers Carter'] },
      cats: [
        { id: 'sticks', name: 'Eels', task: 'how many sticks of eels each tenant brought', who: 'the tenant who brought {x}', is: 'brought {x}', isnt: "didn't bring {x}",
          pick: subset(range(1, 9), function (v) { return count(v, 'stick', 'sticks'); }),
          lt: '{a} brought fewer sticks than {b}', gt: '{a} brought more sticks than {b}',
          diff: function (k) { return count(k, 'stick', 'sticks'); }, more: '{a} brought {k} more than {b}', less: '{a} brought {k} fewer than {b}',
          top: 'brought the most eels', bottom: 'brought the fewest eels' },
        { id: 'hour', name: 'Hours', task: 'the hour each came', who: 'the tenant who came at {x}', is: 'came at {x}', isnt: "didn't come at {x}",
          pick: window_(HOURS, 1, 6),
          lt: '{a} came earlier than {b}', gt: '{a} came later than {b}',
          diff: function (k) { return k === 1 ? 'one hour' : NUM[k] + ' hours'; }, more: '{a} came {k} after {b}', less: '{a} came {k} before {b}',
          adj: '{a} and {b} came at neighbouring hours',
          bottom: 'came first', top: 'came last' },
        { id: 'water', name: 'Waters', task: 'which water each fished', who: 'the tenant who fished {x}', is: 'fished {x}', isnt: "didn't fish {x}",
          pool: ['the mill pool', 'Sallow Reach', 'Fen End', 'the withy beds', "Crane's Dyke", 'Mardle Lode', 'the Long Bridge pool', 'the old cut'] },
        { id: 'extra', name: 'Extras', task: 'what else each brought', who: 'the tenant who also brought {x}', is: 'also brought {x}', isnt: "didn't also bring {x}",
          pool: ['a goose', 'a cheese', 'a basket of withies', 'a sack of turves', 'a pot of honey', 'a dozen eggs', 'a bundle of reeds', 'a pair of mittens'] }
      ],
      intros: [
        "{N} of the fen tenants pay their rent in eels, counted in sticks of twenty-five, and the Prior had me keep the tally at the gate. Brother Odo stood beside me all morning telling me about his barley, so I have the names and I have the eels, and I couldn't swear to you which went with which.",
        "Rent day at the gate again, and the eels came in baskets and buckets and once in a hat. I counted every stick twice, as the Prior likes, and wrote each tenant down as they came, but the ink went thick in the horn before Terce and I finished in charcoal, which has since rubbed.",
        "The porter keeps a list of who comes through the gate and I keep a list of the eels, and today the two lists did not agree about anything, not even the weather. I have put down what I am sure of, which is the names of the {n} tenants, and everything else I am only nearly sure of."
      ]
    },
    {
      id: 'butts', title: 'Sunday at the Butts', place: 'the Butts',
      key: { id: 'who', name: 'Archers', kind: 'people',
        pool: ['Joan Fletcher', 'Tom Webbe', 'Will Hayward', 'Sim Shepherd', 'Ralph Smith', 'Roger Thatcher', 'Piers Carter', 'Emma Dyer'] },
      cats: [
        { id: 'hits', name: 'Hits', task: 'how many hits each archer made', who: 'the archer who made {x}', is: 'made {x}', isnt: "didn't make {x}",
          pick: subset(range(1, 12), function (v) { return count(v, 'hit', 'hits'); }),
          lt: '{a} made fewer hits than {b}', gt: '{a} made more hits than {b}',
          diff: function (k) { return count(k, 'hit', 'hits'); }, more: '{a} made {k} more than {b}', less: '{a} made {k} fewer than {b}',
          top: 'made the most hits', bottom: 'made the fewest hits' },
        { id: 'turn', name: 'Turns', task: 'the order they shot in', who: 'the archer who shot {x}', is: 'shot {x}', isnt: "didn't shoot {x}",
          pick: firstN(function (v) { return ORDINAL[v]; }),
          lt: '{a} shot before {b}', gt: '{a} shot after {b}',
          diff: function (k) { return k === 1 ? 'straight' : NUM[k] + ' turns'; }, more: '{a} shot {k} after {b}', less: '{a} shot {k} before {b}',
          adj: '{a} and {b} shot one after the other',
          bottom: 'shot first', top: 'shot last' },
        { id: 'bow', name: 'Bows', task: 'whose bow was made of what', who: 'the archer with the {x} bow', is: 'shot with the {x} bow', isnt: "didn't shoot with the {x} bow",
          pool: ['yew', 'elm', 'ash', 'hazel', 'wych elm', 'holly', 'hornbeam', 'maple'] },
        { id: 'stake', name: 'Wagers', task: 'what each had wagered', who: 'the archer who wagered {x}', is: 'wagered {x}', isnt: "didn't wager {x}",
          pool: ['a capon', 'a pair of gloves', 'a whetstone', 'a jug of ale', 'a dozen eggs', 'a cheese', 'a new bowstring', 'a cabbage'] }
      ],
      intros: [
        "On Sunday after Mass the men and women of Mardle shot at the Butts, as the law says they must, and I was sent to write down the hits because Walter Crane had lost his tally stick in the nettles. Joan Fletcher checked my figures and took them off to argue with Tom Webbe, and the figures came back in a different order.",
        "{N} archers shot at the Butts this Sunday and I stood well back by the hawthorn with my tablet, which is where the Prior said a monk should stand. From the hawthorn you can hear the arrows but not always the names. I have written down everything I was told, and a good deal of it was shouted.",
        "The Abbot asked me to watch the shooting and tell him about it after, because from his window he can only see the backs of people. I tried to watch everything at once. I have {n} names and a great many arrows, and somewhere in the middle of it Will Hayward's dog ran off with a glove."
      ]
    },
    {
      id: 'swan', title: 'The Ale-Conner at the Swan', place: 'the Swan',
      key: { id: 'who', name: 'Brewsters', kind: 'people',
        pool: ['Isolda Brewer', 'Alys Pennock', 'Margery Baxter', 'Emma Dyer', 'Agnes Sutor', 'Cecily Tolley', 'Joan Fletcher'] },
      cats: [
        { id: 'price', name: 'Prices', task: 'what each brewster charged a gallon', who: 'the brewster who charged {x} a gallon', is: 'charged {x} a gallon', isnt: "didn't charge {x} a gallon",
          pick: subset(range(1, 8), pence),
          lt: '{a} charged less than {b}', gt: '{a} charged more than {b}',
          diff: pence, more: '{a} charged {k} more than {b}', less: '{a} charged {k} less than {b}',
          top: 'charged the most', bottom: 'charged the least' },
        { id: 'order', name: 'Tasting order', task: 'the order the barrels were tasted in', who: 'the brewster who came {x} in the tasting', is: 'came {x} in the tasting', isnt: "didn't come {x} in the tasting",
          pick: firstN(function (v) { return ORDINAL[v]; }),
          lt: '{a} came before {b} in the tasting', gt: '{a} came after {b} in the tasting',
          diff: function (k) { return k === 1 ? 'straight' : NUM[k] + ' places'; }, more: '{a} came {k} after {b} in the tasting', less: '{a} came {k} before {b} in the tasting',
          adj: '{a} and {b} came one after the other in the tasting',
          bottom: 'came first in the tasting', top: 'came last in the tasting' },
        { id: 'verdict', name: 'Verdicts', task: "what Walter said of each ale", who: 'the brewster whose ale Walter called {x}', is: 'had her ale called {x}', isnt: "didn't have her ale called {x}",
          pool: ['thin', 'sound', 'cloudy', 'sour', 'smoky', 'strong', 'sweet', 'flat'] },
        { id: 'herb', name: 'Herbs', task: 'which herb each put in', who: 'the brewster who used {x}', is: 'used {x}', isnt: "didn't use {x}",
          pool: ['bog myrtle', 'ground ivy', 'yarrow', 'rosemary', 'heather', 'sage', 'alecost', 'tansy'] }
      ],
      intros: [
        "Walter Crane tasted the Swan's ale today, which as ale-conner he says is his duty, and I went with him to write down what he said of each brewster's barrel. He said a great deal. Alys Pennock kept filling his cup between barrels to rinse it, she said, and by the end his remarks and my notes had come apart.",
        "Brother Odo asked me to find out what Walter Crane thought of the Swan's ale, so that he could tell the Abbot his own is better. I sat in the corner by the fire while Walter tasted. Kit told me which barrel was which, and Kit, as everyone knows, says whatever comes to him first.",
        "The Swan buys from {n} brewsters, and once a quarter the ale-conner tastes them all in a row. I was there to write it down. Walter takes a long time over each cup and a longer time over what he says about it, and I am afraid I started drawing the dog under the bench."
      ]
    },
    {
      id: 'guests', title: 'The Guest Roll', place: 'the guest house',
      key: { id: 'who', name: 'Guests', kind: 'people',
        pool: ['Master Geoffrey', 'Dame Maud', 'Sir Hugh', 'Gilbert of Lynn', 'Mother Ide', 'Brother Paulinus', 'Nicholas the mercer', 'Hawise of Ely'] },
      cats: [
        { id: 'nights', name: 'Nights', task: 'how many nights each guest stayed', who: 'the guest who stayed {x}', is: 'stayed {x}', isnt: "didn't stay {x}",
          pick: subset(range(1, 8), function (v) { return count(v, 'night', 'nights'); }),
          lt: '{a} stayed fewer nights than {b}', gt: '{a} stayed more nights than {b}',
          diff: function (k) { return count(k, 'night', 'nights'); }, more: '{a} stayed {k} longer than {b}', less: '{a} stayed {k} fewer than {b}',
          top: 'stayed longest', bottom: 'stayed the fewest nights' },
        { id: 'from', name: 'Homes', task: 'where each came from', who: 'the guest from {x}', is: 'came from {x}', isnt: "didn't come from {x}",
          pool: ['Ely', 'Lynn', 'Norwich', 'Peterborough', 'Cambridge', 'Thetford', 'Wisbech', 'Bury'] },
        { id: 'day', name: 'Days', task: 'the day each arrived', who: 'the guest who arrived on {x}', is: 'arrived on {x}', isnt: "didn't arrive on {x}",
          pick: window_(DAYS, 0, 5),
          lt: '{a} arrived earlier in the week than {b}', gt: '{a} arrived later in the week than {b}',
          diff: function (k) { return k === 1 ? 'the day' : NUM[k] + ' days'; }, more: '{a} arrived {k} after {b}', less: '{a} arrived {k} before {b}',
          adj: '{a} and {b} arrived on following days',
          bottom: 'arrived first', top: 'arrived last' },
        { id: 'errand', name: 'Errands', task: 'what each came for', who: 'the guest who came {x}', is: 'came {x}', isnt: "didn't come {x}",
          pool: ['to see the relics', 'to sell wool', 'to buy eels', "on the bishop's business", 'to settle a will', 'to fetch a horse', 'about the bell', 'to see the Abbot'] }
      ],
      intros: [
        "The guest house had {n} guests this week and it is my task to enter them in the guest roll, with where they came from and why, because the Prior likes to know who has eaten the abbey's bread. Brother Anselm took the details at the door, humming, and gave them to me on a slate that somebody then leaned against.",
        "I write up the guest roll on Saturdays, but this week the guests left their names with Brother Anselm, Brother Anselm told Brother Odo, and Brother Odo told me while he was rolling a barrel. I have {n} names. I have other facts as well, in the order Odo said them, which I now think was the order of the barrels.",
        "The Abbot asked me who was staying in the guest house, because somebody had been in his pear trees, and I found I could not tell him. I had all of it written down. I had written it on the same page as the infirmary list, though, and Brother Clement's sneezes are in there among the guests."
      ]
    },
    {
      id: 'pannage', title: 'Pannage', place: "the Abbot's Wood",
      key: { id: 'who', name: 'Pigs', kind: 'pigs',
        pool: ['Gristle', 'Old Nan', 'Dumpling', 'Tansy', 'Cob', 'Pudding', 'Bramble', 'Ginger', 'Mallow'] },
      cats: [
        { id: 'owner', name: 'Owners', task: 'whose pig was whose', who: 'the pig owned by {x}', is: 'belonged to {x}', isnt: "didn't belong to {x}",
          pool: ['Hob', 'Widow Tolley', 'Margery Baxter', 'Roger Thatcher', 'Sim Shepherd', 'Agnes Sutor', 'Ralph Smith', 'Father Simon'] },
        { id: 'fee', name: 'Fees', task: 'what each pig paid', who: 'the pig whose pannage was {x}', is: 'paid {x}', isnt: "didn't pay {x}",
          pick: subset(range(1, 8), pence),
          lt: '{a} paid less than {b}', gt: '{a} paid more than {b}',
          diff: pence, more: '{a} paid {k} more than {b}', less: '{a} paid {k} less than {b}',
          top: 'paid the most', bottom: 'paid the least' },
        { id: 'weight', name: 'Weights', task: 'what each weighed', who: 'the pig that weighed {x}', is: 'weighed {x}', isnt: "didn't weigh {x}",
          pick: subset(range(4, 14), function (v) { return NUM[v] + ' stone'; }),
          lt: '{a} was lighter than {b}', gt: '{a} was heavier than {b}',
          diff: function (k) { return NUM[k] + ' stone'; }, more: '{a} weighed {k} more than {b}', less: '{a} weighed {k} less than {b}',
          top: 'was the heaviest', bottom: 'was the lightest' },
        { id: 'mark', name: 'Marks', task: 'how each was marked', who: 'the pig with {x}', is: 'had {x}', isnt: "didn't have {x}",
          pool: ['a notched left ear', 'a slit right ear', 'a cropped tail', 'a red daub', 'a ring in its nose', 'a white blaze', 'a tar spot'] }
      ],
      intros: [
        "At pannage time the town's pigs go into the abbey woods for the acorns, and every pig pays. Will Hayward drove them in and called their names to me over the gate, and I wrote as fast as I could, but pigs do not keep still to be written down and I think one or two of them answered to the wrong name.",
        "Will Hayward keeps the common, and he keeps the pannage list in his head and nowhere else. He told me the pigs and their owners and their fees while we walked to the woods, and I wrote it all on my tablet as I walked, which I do not recommend. The Prior has asked for a fair copy by Vespers.",
        "{N} pigs went into the Abbot's Wood this morning. I know it was {n} because I counted them through the gate twice and got the same answer both times, which pleased me. Everything else about them I had from their owners, who all talked at once and all said their own pig was the best behaved."
      ]
    },
    {
      id: 'scriptorium', title: 'In the Scriptorium', place: 'the scriptorium',
      key: { id: 'who', name: 'Brothers', kind: 'people',
        pool: ['Brother Clement', 'Brother Odo', 'Brother Anselm', 'Brother Martin', 'Brother Jocelin', 'Brother Hugh', 'Brother Ralph', 'Brother Paul'] },
      cats: [
        { id: 'book', name: 'Books', task: 'what each brother was copying', who: 'the brother copying {x}', is: 'was copying {x}', isnt: "wasn't copying {x}",
          pool: ['a psalter', 'the Rule', 'a gospel book', "Bede's history", 'a herbal', 'a bestiary', 'a missal', 'the cartulary'] },
        { id: 'leaves', name: 'Leaves', task: 'how many leaves each copied', who: 'the brother who copied {x}', is: 'copied {x}', isnt: "didn't copy {x}",
          pick: subset(range(2, 12), function (v) { return NUM[v] + ' leaves'; }),
          lt: '{a} copied fewer leaves than {b}', gt: '{a} copied more leaves than {b}',
          diff: function (k) { return k === 1 ? 'one leaf' : NUM[k] + ' leaves'; }, more: '{a} copied {k} more than {b}', less: '{a} copied {k} fewer than {b}',
          top: 'copied the most', bottom: 'copied the least' },
        { id: 'desk', name: 'Desks', task: 'where each sat', who: 'the brother at {x}', is: 'sat at {x}', isnt: "didn't sit at {x}",
          pick: firstN(function (v) { return 'desk ' + v; }),
          lt: '{a} sat nearer the window than {b}', gt: '{a} sat further from the window than {b}',
          diff: function (k) { return count(k, 'desk', 'desks'); }, more: '{a} sat {k} further from the window than {b}', less: '{a} sat {k} nearer the window than {b}',
          adj: '{a} and {b} sat at neighbouring desks',
          bottom: 'sat nearest the window', top: 'sat furthest from the window' },
        { id: 'ink', name: 'Inks', task: 'which ink each used', who: 'the brother using {x} ink', is: 'used {x} ink', isnt: "didn't use {x} ink",
          pool: ['red', 'black', 'blue', 'green', 'brown', 'purple', 'yellow'] }
      ],
      intros: [
        "The Prior asked me how much copying each brother had done this week, because the vellum is going faster than the work. I went round the desks and wrote it all down, and then Brother Clement opened the window for the smell of the glue and my page went across the floor. I picked it up in the wrong order.",
        "In the scriptorium we are meant to keep silence, so I asked my questions on a slate and the brothers wrote their answers underneath, each in his own hand and some in very small hands. Brother Anselm wiped the slate clean at None, humming, before I had copied half of it out.",
        "{N} of the brothers are copying this month, and I am to keep the account of it, though I am also copying, and so I kept the account in the margin of my own leaf, beside a snail I had drawn. The snail is better than the account. I have every fact in there, only not where it belongs."
      ]
    },
    {
      id: 'bridge', title: 'Toll on the Long Bridge', place: 'the Long Bridge',
      key: { id: 'who', name: 'Travellers', kind: 'people',
        pool: ['Piers Carter', 'Walter Crane', 'Tom Webbe', 'Joan Fletcher', 'Roger Thatcher', 'Sim Shepherd', 'Will Hayward', 'Ralph Smith', 'Margery Baxter'] },
      cats: [
        { id: 'toll', name: 'Tolls', task: 'what toll each traveller paid', who: 'the traveller who paid {x}', is: 'paid {x}', isnt: "didn't pay {x}",
          pick: subset(range(1, 8), pence),
          lt: '{a} paid less than {b}', gt: '{a} paid more than {b}',
          diff: pence, more: '{a} paid {k} more than {b}', less: '{a} paid {k} less than {b}',
          top: 'paid the most', bottom: 'paid the least' },
        { id: 'load', name: 'Loads', task: 'what each was carrying', who: 'the traveller with {x}', is: 'had {x}', isnt: "didn't have {x}",
          pool: ['two geese', 'a cart of turves', 'a sack of malt', 'a load of withies', 'a barrel of herrings', 'a crate of hens', 'a millstone', 'a bale of wool'] },
        { id: 'hour', name: 'Hours', task: 'the hour each crossed', who: 'the traveller who crossed at {x}', is: 'crossed at {x}', isnt: "didn't cross at {x}",
          pick: window_(HOURS, 1, 6),
          lt: '{a} crossed earlier than {b}', gt: '{a} crossed later than {b}',
          diff: function (k) { return k === 1 ? 'one hour' : NUM[k] + ' hours'; }, more: '{a} crossed {k} after {b}', less: '{a} crossed {k} before {b}',
          adj: '{a} and {b} crossed at neighbouring hours',
          bottom: 'crossed first', top: 'crossed last' },
        { id: 'bound', name: 'Destinations', task: 'where each was going', who: 'the traveller bound for {x}', is: 'was bound for {x}', isnt: "wasn't bound for {x}",
          pool: ['the abbey', 'Ely', 'Lynn market', 'the mill', 'the Swan', 'the fen', 'the manor', "St Mary's"] }
      ],
      intros: [
        "Kit kept the toll at the Long Bridge on Thursday while the bridge-warden was at the Swan, and he gave me his account of who crossed, which he had partly in his head and partly in a song. The warden only empties the toll box at the quarter days, so there was no telling Thursday's money from the rest of what was in it. I have written down what Kit said as carefully as I could.",
        "I sat on the parapet of the Long Bridge for a morning so that the Prior might have a true account of the toll, and Piers Carter's mule Bishop stood in the middle of the bridge for most of it, so that everyone who crossed had to go round him and argue. I wrote down the travellers, and some of the arguing got into the notes.",
        "{N} people crossed the Long Bridge before Vespers, and I had it all on my tablet until I leaned on the parapet to watch a heron. The heron caught nothing. The tablet survived, but the wax had warmed in the sun, and now the names and the rest of it have slid together at the bottom."
      ]
    }
  ];
  // ---------------------------------------------------------------- epilogues
  // Pronouns for the people in the pools. Anyone missing (and every pig) gets their name again.
  var PRON = {};
  ['Hob', 'Will Hayward', 'Sim Shepherd', 'Roger Thatcher', 'Ralph Smith', 'Piers Carter', 'Tom Webbe', 'Kit',
    'Walter Crane', 'Father Simon', 'Master Geoffrey', 'Sir Hugh', 'Gilbert of Lynn', 'Nicholas the mercer',
    'Brother Paulinus', 'Brother Clement', 'Brother Odo', 'Brother Anselm', 'Brother Martin', 'Brother Jocelin',
    'Brother Hugh', 'Brother Ralph', 'Brother Paul'].forEach(function (n) { PRON[n] = 'm'; });
  ['Agnes Sutor', 'Margery Baxter', 'Emma Dyer', 'Isolda Brewer', 'Joan Fletcher', 'Cecily Tolley', 'Alys Pennock',
    'Widow Tolley', 'Dame Isabel', 'Dame Maud', 'Mother Ide', 'Hawise of Ely'].forEach(function (n) { PRON[n] = 'f'; });

  // Each epilogue names the categories it needs and builds its text from the solved grid through c:
  //   c.any(skip) a random row, c.top(cat)/c.bot(cat) the row with the highest/lowest item,
  //   c.N(r) the key name, c.v(r, cat) the row's item name, c.not(r2, cat, r) row r2's name, stating
  //   that r2 doesn't have row r's item, c.pred(r, cat) the category's own "is" phrase,
  //   c.he/He/him/his(row or name). Every fact used is recorded in c.facts.
  function E(needs, f) { return { needs: needs, f: f }; }
  var EPILOGUES = {
    market: [
      E(['pitch'], function (c) { var r = c.any(), r2 = c.any([r]);
        return 'It was ' + c.N(r) + ' who was at ' + c.v(r, 'pitch') + ', which I had down as ' + c.not(r2, 'pitch', r) + "'s, and " + c.N(r2) + ' came and read it over my shoulder and said ' + c.he(r2) + ' had never wanted that pitch in any case.'; }),
      E(['takings'], function (c) { var r = c.top('takings');
        return c.N(r) + ' took the most, ' + c.v(r, 'takings') + ', and counted it out onto my page a farthing at a time so that I could see it was all there. I added it up twice, and the second time it came to a farthing short.'; }),
      E(['ware', 'first'], function (c) { var r = c.any(), f = c.v(r, 'first');
        return f + ' was the first to buy from ' + c.N(r) + ', who sold ' + c.v(r, 'ware') + ', so that is what ' + c.he(f) + ' went away with, though when I asked ' + c.him(f) + ' about it ' + c.he(f) + ' said ' + c.he(f) + ' had only been looking.'; }),
      E(['ware', 'pitch'], function (c) { var r = c.top('pitch');
        return c.N(r) + ' sold ' + c.v(r, 'ware') + ' from ' + c.v(r, 'pitch') + ', the pitch furthest from the cross, and not from beside the cross where my first copy had ' + c.him(r) + '. I scraped that copy, and there is a thin place in the page now.'; }),
      E(['takings'], function (c) { var r = c.bot('takings');
        return 'Of all of them ' + c.N(r) + ' took the least, ' + c.v(r, 'takings') + ', and said it was because of where I had told people ' + c.he(r) + ' was standing, and I could not say for certain that it wasn\'t.'; }),
      E(['first'], function (c) { var r = c.any(), r2 = c.any([r]), f = c.v(r, 'first');
        return c.N(r) + "'s first customer was " + f + ' and ' + c.N(r2) + "'s was " + c.v(r2, 'first') + ', and I had them the other way about until ' + f + ' heard the roll read back and said ' + c.he(f) + ' never buys from ' + c.N(r2) + ' if ' + c.he(f) + ' can help it.'; })
    ],
    eels: [
      E(['hour'], function (c) { var r = c.bot('hour'), r2 = c.top('hour');
        return c.N(r) + ' was first at the gate, at ' + c.v(r, 'hour') + ', and ' + c.N(r2) + ' was last, at ' + c.v(r2, 'hour') + ', and by then the stew pond was so full that the last of the eels went into a barrel by the kitchen door.'; }),
      E(['sticks'], function (c) { var r = c.top('sticks');
        return 'It was ' + c.N(r) + ' who brought the most, ' + c.v(r, 'sticks') + ', in two baskets and a pail, and the porter carried the pail in for ' + c.him(r) + ' and has not given it back.'; }),
      E(['water', 'sticks'], function (c) { var r = c.any(), w = c.v(r, 'water');
        return c.N(r) + ' fished ' + w + ' and brought ' + c.v(r, 'sticks') + ' from it, and the Prior has asked me to find out what ' + w + ' paid in other years, which means a morning in the muniment chest with the mice.'; }),
      E(['extra'], function (c) { var r = c.any();
        return c.N(r) + ' also brought ' + c.v(r, 'extra') + ', which was not owed, and I wrote it into the rent roll because I could not think where else to put it. The Prior has drawn a line through it, very neatly, and written "gift" above the line.'; }),
      E(['sticks'], function (c) { var r = c.bot('sticks'), r2 = c.any([r]);
        return 'When it was all sorted out, ' + c.N(r) + ' had brought the fewest, ' + c.v(r, 'sticks') + ', and not ' + c.not(r2, 'sticks', r) + ', whose name I had put beside that number in the morning. ' + c.N(r2) + ' has asked for a mark in the margin to show the mistake was mine.'; }),
      E(['hour', 'water'], function (c) { var r = c.any();
        return 'At ' + c.v(r, 'hour') + ' it was ' + c.N(r) + ', with the eels from ' + c.v(r, 'water') + ', and I had put ' + c.him(r) + ' at another hour altogether because the ink had gone thick in the horn. I have written it again in good ink and left the charcoal where it was.'; })
    ],
    butts: [
      E(['hits'], function (c) { var r = c.top('hits');
        return c.N(r) + ' made the most, ' + c.v(r, 'hits') + ', and went to pull ' + c.his(r) + ' arrows out of the butt before anyone could count them again, though I had already counted them twice.'; }),
      E(['water'], function (c) { var r = c.any(), w = c.v(r, 'water');
        return c.N(r) + "'s eels came out of " + w + ', and I had written the name of that water three different ways down the page, and the porter, who has lived beside it all his life, says none of them is right.'; }),
      E(['turn'], function (c) { var r = c.bot('turn'), r2 = c.top('turn');
        return c.N(r) + ' shot first and ' + c.N(r2) + ' shot last, and the order in between is as I have it here. The Abbot asked me twice who had shot first, and I told him twice, and he went back to his window.'; }),
      E(['stake'], function (c) { var r = c.any(c.has('hits') ? [c.rowAt('hits', 'top')] : []);
        return c.N(r) + ' had wagered ' + c.v(r, 'stake') + ' and lost it before the light went, and the winner did not want it, so it is in the porter\'s lodge, and the porter says it is not his either.'; }),
      E(['bow', 'hits'], function (c) { var r = c.any();
        return c.N(r) + ' shot with the ' + c.v(r, 'bow') + ' bow and made ' + c.v(r, 'hits') + ', and says the bow did most of the work, and the bowyer, who was standing next to me, asked me to write that down.'; }),
      E(['turn', 'bow'], function (c) { var r = c.any();
        return 'The ' + c.v(r, 'bow') + ' bow went to the line ' + c.v(r, 'turn') + ', in ' + c.N(r) + "'s hands, though my notes had given it to somebody else entirely, and " + c.N(r) + ' has asked whether I was watching the shooting or the hawthorn.'; }),
      E(['bow'], function (c) { var r = c.any();
        return 'Of all the bows on the line, ' + c.N(r) + "'s was the " + c.v(r, 'bow') + ', and the bowyer stood behind ' + c.him(r) + ' for every arrow and has asked me to write down that it was only lent.'; }),
      E(['hits'], function (c) { var r = c.bot('hits');
        return 'I have ' + c.N(r) + ' down for ' + c.v(r, 'hits') + ' now, the fewest, and ' + c.he(r) + ' came to the gate to tell me the wind had been in ' + c.his(r) + ' face all afternoon, so I have written that down as well, in the margin.'; })
    ],
    swan: [
      E(['price'], function (c) { var r = c.top('price');
        return c.N(r) + ' charged the most, ' + c.v(r, 'price') + ' a gallon, and the ale-conner said that in the matter of the price he had no remarks, and then made several, and I have them all on the back of the page.'; }),
      E(['verdict'], function (c) { var r = c.any();
        return 'It was ' + c.N(r) + "'s ale that the ale-conner called " + c.v(r, 'verdict') + ', and ' + c.N(r) + ' came up to the abbey the next day to have me read the word back to ' + c.him(r) + ', and then read it again, slower.'; }),
      E(['herb', 'order'], function (c) { var r = c.any(), h = c.v(r, 'herb');
        return c.N(r) + ' came ' + c.v(r, 'order') + ' in the tasting, with ' + h + ' in the barrel, and I had put the ' + h + ' against somebody else, which ' + c.N(r) + ' says ' + c.he(r) + ' could have told me if anyone had asked ' + c.him(r) + '.'; }),
      E(['order'], function (c) { var r = c.top('order');
        return 'Last in the tasting came ' + c.N(r) + ', whose ale was poured when the ale-conner had stopped speaking and only nodded, and I have written the nods down as well in case the Prior asks.'; }),
      E(['price'], function (c) { var r = c.bot('price'), r2 = c.any([r]);
        return 'The cheapest ale was ' + c.N(r) + "'s, at " + c.v(r, 'price') + ' a gallon, though in the morning I had it as ' + c.not(r2, 'price', r) + "'s, and " + c.N(r2) + ' heard about it before I had finished the fair copy.'; }),
      E(['herb', 'verdict'], function (c) { var r = c.any();
        return c.N(r) + ' put ' + c.v(r, 'herb') + ' in ' + c.his(r) + ' ale and the ale-conner called it ' + c.v(r, 'verdict') + ', and those two things had got onto different leaves of my notes, one of them under the bench with the dog.'; })
    ],
    guests: [
      E(['nights'], function (c) { var r = c.top('nights');
        return c.N(r) + ' stayed longest, ' + c.v(r, 'nights') + ', and ate fish on every one of them, and the Prior has added up the fish in red at the foot of the roll.'; }),
      E(['errand'], function (c) { var r = c.any();
        return c.N(r) + ' came ' + c.v(r, 'errand') + ', and I had written that against another guest altogether, who has since gone home, and the Prior says the correction can wait until they come again.'; }),
      E(['day'], function (c) { var r = c.bot('day'), r2 = c.top('day');
        return c.N(r) + ' arrived first, on ' + c.v(r, 'day') + ', and ' + c.N(r2) + ' last, on ' + c.v(r2, 'day') + ', and the slate with all of it on is hanging on a nail by the door now, where nobody can lean on it.'; }),
      E(['from', 'errand'], function (c) { var r = c.any();
        return 'It was ' + c.N(r) + ', from ' + c.v(r, 'from') + ', who came ' + c.v(r, 'errand') + ', and I put ' + c.him(r) + ' into the roll twice by mistake while I was putting it right, and the Prior crossed one of them out.'; }),
      E(['nights', 'from'], function (c) { var r = c.bot('nights');
        return 'From ' + c.v(r, 'from') + ' came ' + c.N(r) + ', who stayed only ' + c.v(r, 'nights') + ', the fewest of anyone, and left before I could ask ' + c.him(r) + ' how ' + c.he(r) + ' spelled ' + c.his(r) + ' name, so I have spelled it two ways.'; }),
      E(['day'], function (c) { var r = c.any(), r2 = c.any([r]);
        return c.N(r) + ' arrived on ' + c.v(r, 'day') + ' and not ' + c.not(r2, 'day', r) + ', whatever my first page says, and ' + c.N(r2) + ' has mentioned it to me at every meal since.'; })
    ],
    pannage: [
      E(['weight'], function (c) { var r = c.top('weight');
        return c.N(r) + ' was the heaviest at ' + c.v(r, 'weight') + ', and was found at dusk asleep in the ditch by the pear trees, and the hayward says ' + c.N(r) + ' was not there for the pears.'; }),
      E(['owner'], function (c) { var r = c.any(), o = c.v(r, 'owner');
        return c.N(r) + ' belonged to ' + o + ' all along, though it answered to two other names on the way in, and ' + o + ' says it will answer to anything if you are holding an apple.'; }),
      E(['owner', 'fee'], function (c) { var r = c.any(), o = c.v(r, 'owner');
        return o + "'s pig " + c.N(r) + ' paid ' + c.v(r, 'fee') + ', and ' + o + ' asked for a receipt, and I wrote one, and then the Prior had me write it again with the date on.'; }),
      E(['mark'], function (c) { var r = c.any();
        return 'The pig with ' + c.v(r, 'mark') + ' was ' + c.N(r) + ', and I had given that mark to another pig entirely, and when I called ' + c.N(r) + ' by the right name it came over to the gate at once.'; }),
      E(['weight'], function (c) { var r = c.bot('weight'), r2 = c.any([r]);
        return 'I had ' + c.not(r2, 'weight', r) + ' as the lightest, but it was ' + c.N(r) + ', at ' + c.v(r, 'weight') + ', and anyone who has stood next to ' + c.N(r2) + ' in a gateway could have told me so.'; }),
      E(['fee'], function (c) { var r = c.bot('fee');
        return 'The least was paid for ' + c.N(r) + ', ' + c.v(r, 'fee') + ', and ' + c.N(r) + ' then ate more acorns than any pig in the wood, which I have not put in the roll, because there is no column for it.'; })
    ],
    scriptorium: [
      E(['leaves'], function (c) { var r = c.top('leaves');
        return c.N(r) + ' copied the most, ' + c.v(r, 'leaves') + ', and asked for more vellum, and the Prior gave ' + c.him(r) + ' half of what ' + c.he(r) + ' asked for and wrote the other half in his book.'; }),
      E(['ink'], function (c) { var r = c.any();
        return 'The ' + c.v(r, 'ink') + ' ink was ' + c.N(r) + "'s, which accounts for " + c.his(r) + ' fingers, and I have written the account out fair and scraped my own drawing out of the margin, mostly.'; }),
      E(['desk'], function (c) { var r = c.bot('desk');
        return c.N(r) + ' sat nearest the window, at ' + c.v(r, 'desk') + ', and was the one who shut it when my page went across the floor, which I had not thanked ' + c.him(r) + ' for until today.'; }),
      E(['book', 'desk'], function (c) { var r = c.any(), b = c.v(r, 'book'), d = c.v(r, 'desk');
        return c.N(r) + ' was copying ' + b + ' at ' + d + ', and I had the two at opposite ends of the room, so that in my first account ' + b + ' was being copied by nobody and ' + d + ' had two brothers at it.'; }),
      E(['leaves'], function (c) { var r = c.bot('leaves'), r2 = c.any([r]);
        return 'It was ' + c.N(r) + ' who copied the fewest, ' + c.v(r, 'leaves') + ', and not ' + c.not(r2, 'leaves', r) + ', who asked me to make that very clear and stood behind me while I did it.'; }),
      E(['book', 'ink'], function (c) { var r = c.any(), k = c.v(r, 'ink');
        return c.N(r) + ' was copying ' + c.v(r, 'book') + ' in ' + k + ' ink, which is not how the Prior likes it done, and he has asked me who gave ' + c.N(r) + ' the ' + k + ', and I am fairly sure it was me.'; })
    ],
    bridge: [
      E(['toll'], function (c) { var r = c.top('toll');
        return c.N(r) + ' paid the most, ' + c.v(r, 'toll') + ', and asked where it went. I said the toll box, which the warden empties at the quarter days.'; }),
      E(['load'], function (c) { var r = c.any();
        return c.N(r) + ' had ' + c.v(r, 'load') + ' and took most of the morning getting it over, and the bridge-warden\'s boy helped with the wheel and would not take anything for it, though he has mentioned it to me since.'; }),
      E(['hour'], function (c) { var r = c.bot('hour'), r2 = c.top('hour');
        return c.N(r) + ' crossed first, at ' + c.v(r, 'hour') + ', and ' + c.N(r2) + ' last, at ' + c.v(r2, 'hour') + ', and the bridge-warden came back from the alehouse somewhere in between and asked me what he had missed.'; }),
      E(['load', 'bound'], function (c) { var r = c.any();
        return 'It was ' + c.N(r) + ' with ' + c.v(r, 'load') + ', bound for ' + c.v(r, 'bound') + ', and I had sent ' + c.him(r) + ' somewhere else entirely in my notes, which ' + c.N(r) + ' said was further than ' + c.he(r) + ' had meant to go.'; }),
      E(['toll'], function (c) { var r = c.bot('toll'), r2 = c.any([r]);
        return 'The smallest toll was ' + c.N(r) + "'s, " + c.v(r, 'toll') + ', though I had put it against ' + c.not(r2, 'toll', r) + ' in the morning, and ' + c.N(r2) + ' came back over the bridge to see it put right, and paid again.'; }),
      E(['hour', 'bound'], function (c) { var r = c.any();
        return 'At ' + c.v(r, 'hour') + ' it was ' + c.N(r) + ' who crossed, bound for ' + c.v(r, 'bound') + ', and that was the hour I spent watching the heron, so I had it from the bridge-warden\'s boy, who says he is never wrong.'; })
    ]
  };
  // for a puzzle whose categories none of its theme's epilogues need
  var FALLBACK_EPILOGUES = [
    function (c, ids) { var r = c.any();
      return 'It was ' + c.N(r) + ' who ' + c.pred(r, ids[0]) + ', which is the part I had most wrong, and I have copied the whole of it out fair and given it to the Prior, who read it standing up.'; },
    function (c, ids) { var r = c.any(), r2 = c.any([r]);
      return c.N(r) + ' ' + c.pred(r, ids[0]) + ' and ' + c.N(r2) + ' ' + c.pred(r2, ids[ids.length - 1]) + ', and that is the true account. I have rubbed out the wrong one, though the Prior says you can still read it if you hold the page up to the window.'; }
  ];
  var GRADES = ['Apprentice', 'Journeyman', 'Master'];

  // ---------------------------------------------------------------- building a puzzle shell
  function buildCats(theme, C, n, R, needOrdered) {
    var others;
    for (var tries = 0; tries < 50; tries++) {
      others = R.sample(theme.cats, C - 1);
      if (!needOrdered || others.some(function (c) { return c.pick; })) break;
    }
    // keep theme order so the grid always reads the same way for a theme
    others.sort(function (a, b) { return theme.cats.indexOf(a) - theme.cats.indexOf(b); });
    var used = {};
    function items(catId, names) {
      return names.map(function (nm) {
        used[nm] = 1;
        var sl = slug(nm);
        return { id: sl.indexOf(catId + '-') === 0 ? sl : catId + '-' + sl, name: nm };
      });
    }
    var keyNames = R.sample(theme.key.pool, n);
    var cats = [{ id: theme.key.id, name: theme.key.name, items: items(theme.key.id, keyNames) }];
    others.forEach(function (spec) {
      var c = { id: spec.id, name: spec.name, who: spec.who, is: spec.is, isnt: spec.isnt };
      if (spec.pick) {
        var p = spec.pick(R, n);
        c.items = items(spec.id, p.names);
        c.ordered = { values: p.values };
      } else {
        var pool = spec.pool.filter(function (x) { return !used[x]; });
        c.items = items(spec.id, R.sample(pool, n));
      }
      cats.push(c);
    });
    return { cats: cats, specs: [theme.key].concat(others) };
  }

  // ---------------------------------------------------------------- candidate clues
  // A world W: W.cats (logic categories), W.specs, W.row[c][i] = row of item i of category c,
  // W.at[c][r] = item index in row r.
  function makeWorld(shell, R) {
    var C = shell.cats.length, n = shell.cats[0].items.length, W = { cats: shell.cats, specs: shell.specs, C: C, n: n, row: [], at: [] };
    for (var c = 0; c < C; c++) {
      var perm = c === 0 ? range(0, n - 1) : R.shuffle(range(0, n - 1)); // perm[r] = item in row r
      W.at[c] = perm; W.row[c] = [];
      perm.forEach(function (i, r) { W.row[c][i] = r; });
    }
    return W;
  }
  function itm(W, c, i) { return { c: c, i: i, it: W.cats[c].items[i] }; }
  function rowOf(W, x) { return W.row[x.c][x.i]; }
  var MAX_CLUE_WORDS = 30;
  function wordCount(s) { return (s.match(/[A-Za-z0-9'’-]+/g) || []).length; }
  function nounOf(W, x) { var cat = W.cats[x.c]; return x.c === 0 ? x.it.name : fill(cat.who, x.it.name); }
  function predOf(W, x, pos) { var cat = W.cats[x.c]; return fill(x.c === 0 ? (pos ? 'was {x}' : "wasn't {x}") : (pos ? cat.is : cat.isnt), x.it.name); }
  function randItem(W, R, notCats) {
    var cs = range(0, W.C - 1).filter(function (c) { return !notCats || notCats.indexOf(c) < 0; });
    return itm(W, R.pick(cs), R.int(W.n));
  }
  function inRow(W, c, r) { return itm(W, c, W.at[c][r]); }
  function valOf(W, x, O) { var cat = W.cats[O]; return cat.ordered.values[W.at[O][rowOf(W, x)]]; }
  function idxOf(W, x, O) { return W.at[O][rowOf(W, x)]; }
  function orderedCats(W) { return range(0, W.C - 1).filter(function (c) { return W.cats[c].ordered; }); }
  function subjectFirst(W, R, a, b) { // prefer key or lower category as the subject most of the time
    if (b.c === 0 || (a.c !== 0 && b.c < a.c && R.next() < 0.7)) return [b, a];
    return [a, b];
  }

  var MAKERS = {
    is: function (W, R) {
      var a = randItem(W, R), c2 = R.pick(range(0, W.C - 1).filter(function (c) { return c !== a.c; }));
      var b = inRow(W, c2, rowOf(W, a)), sp = subjectFirst(W, R, a, b);
      return { text: cap(nounOf(W, sp[0]) + ' ' + predOf(W, sp[1], true)) + '.', logic: ['is', a.it.id, b.it.id] };
    },
    not: function (W, R) {
      var a = randItem(W, R), c2 = R.pick(range(0, W.C - 1).filter(function (c) { return c !== a.c; }));
      var r = (rowOf(W, a) + 1 + R.int(W.n - 1)) % W.n, b = inRow(W, c2, r), sp = subjectFirst(W, R, a, b);
      return { text: cap(nounOf(W, sp[0]) + ' ' + predOf(W, sp[1], false)) + '.', logic: ['not', a.it.id, b.it.id] };
    },
    neither: function (W, R) { // neither a nor b had z (a, b in different rows, neither row has z)
      if (W.n < 3) return null;
      var z = randItem(W, R), rows = R.shuffle(range(0, W.n - 1).filter(function (r) { return r !== rowOf(W, z); })).slice(0, 2);
      var cs = range(0, W.C - 1).filter(function (c) { return c !== z.c; });
      var a = inRow(W, R.pick(cs), rows[0]), b = inRow(W, R.pick(cs), rows[1]);
      if (b.c === 0 && a.c !== 0) { var t = a; a = b; b = t; }
      return { text: 'Neither ' + nounOf(W, a) + ' nor ' + nounOf(W, b) + ' ' + predOf(W, z, true) + '.', logic: [['not', a.it.id, z.it.id], ['not', b.it.id, z.it.id]] };
    },
    eitherSame: function (W, R) { // a had x or y (same category)
      var a = randItem(W, R), c2 = R.pick(range(0, W.C - 1).filter(function (c) { return c !== a.c && c !== 0; }));
      if (c2 === undefined) return null;
      var good = inRow(W, c2, rowOf(W, a)), r = (rowOf(W, a) + 1 + R.int(W.n - 1)) % W.n, bad = inRow(W, c2, r);
      var opts = R.shuffle([good, bad]);
      if (W.cats[c2].ordered) opts.sort(function (p, q) { return p.i - q.i; });
      var names = opts.map(function (o) { return o.it.name; });
      return { text: cap(nounOf(W, a) + ' ' + fill(W.cats[c2].is, listOr(names))) + '.', logic: ['either', a.it.id, opts.map(function (o) { return o.it.id; })] };
    },
    eitherCross: function (W, R) { // a either P(x) or P(y), x and y in two other categories, exactly one true
      if (W.C < 3) return null;
      var a = randItem(W, R), cs = R.sample(range(0, W.C - 1).filter(function (c) { return c !== a.c && c !== 0; }), 2);
      if (cs.length < 2) return null;
      var good = inRow(W, cs[0], rowOf(W, a)), r = (rowOf(W, a) + 1 + R.int(W.n - 1)) % W.n, bad = inRow(W, cs[1], r);
      var opts = R.shuffle([good, bad]);
      if (/^was(n't)? /.test(predOf(W, opts[0], true))) opts.reverse(); // "either was copying" reads badly
      return { text: cap(nounOf(W, a) + ' either ' + predOf(W, opts[0], true) + ' or ' + predOf(W, opts[1], true)) + '.', logic: ['either', a.it.id, [opts[0].it.id, opts[1].it.id]] };
    },
    pairOr: function (W, R) { // of a and b, one P(x) and the other P(y)
      if (W.C < 3 || W.n < 3) return null;
      var cA = R.pick(range(0, W.C - 1)), rows = R.sample(range(0, W.n - 1), 2);
      var cB = R.next() < 0.6 ? cA : R.pick(range(0, W.C - 1));
      var a = inRow(W, cA, rows[0]), b = inRow(W, cB, rows[1]);
      var rest = range(0, W.C - 1).filter(function (c) { return c !== cA && c !== cB; });
      if (!rest.length) return null;
      var cX = R.pick(rest), cY = R.next() < 0.5 ? cX : R.pick(rest);
      var x = inRow(W, cX, rows[0]), y = inRow(W, cY, rows[1]);
      if (R.next() < 0.5) { var t = x; x = y; y = t; }
      if (b.c === 0 && a.c !== 0) { var t2 = a; a = b; b = t2; }
      var text = 'Of ' + nounOf(W, a) + ' and ' + nounOf(W, b) + ', one ' + predOf(W, x, true) + ' and the other ' + predOf(W, y, true) + '.';
      if (wordCount(text) > MAX_CLUE_WORDS) return null;
      return { text: text, logic: ['pairOr', a.it.id, b.it.id, x.it.id, y.it.id] };
    },
    allDiff: function (W, R) {
      if (W.C < 3) return null;
      var k = Math.min(W.n, W.C, R.next() < 0.6 ? 3 : 4);
      if (k < 3) return null;
      var rows = R.sample(range(0, W.n - 1), k), cs = R.sample(range(0, W.C - 1), k);
      var xs = rows.map(function (r, j) { return inRow(W, cs[j], r); });
      xs.sort(function (p, q) { return p.c - q.c; });
      var kind = W.specs[0].kind === 'pigs' ? 'pigs' : 'people';
      var text = cap(listAnd(xs.map(function (x) { return nounOf(W, x); }))) + ' were ' + NUM[k] + ' different ' + kind + '.';
      if (wordCount(text) > 25) { // too long to hold in the head: name the predicates instead
        var ps = xs.map(function (x) { return predOf(W, x, true); });
        text = 'Of ' + NUM[k] + ' different ' + W.cats[0].name.toLowerCase() + ', one ' + ps[0] + ', another ' + ps[1] +
          (k === 4 ? ', another ' + ps[2] + ' and the fourth ' + ps[3] : ' and the third ' + ps[2]) + '.';
      }
      if (wordCount(text) > MAX_CLUE_WORDS) return null;
      return { text: text, logic: ['allDiff', xs.map(function (x) { return x.it.id; })] };
    },
    cmp: function (W, R, grade) {
      var Os = orderedCats(W); if (!Os.length) return null;
      var O = R.pick(Os), spec = W.specs[O], rows = R.sample(range(0, W.n - 1), 2);
      var cs = range(0, W.C - 1).filter(function (c) { return c !== O; });
      var a = inRow(W, R.pick(cs), rows[0]), b = inRow(W, R.pick(cs), rows[1]);
      var va = valOf(W, a, O), vb = valOf(W, b, O), ia = idxOf(W, a, O), ib = idxOf(W, b, O);
      var opts = [[3, va < vb ? 'lt' : 'gt']];
      var k = va - vb;
      if (spec.more && grade !== 'Apprentice' && Math.abs(k) <= 4 && (spec.adj ? Math.abs(k) <= 2 : true)) opts.push([2, 'plus']);
      if (spec.adj && Math.abs(ia - ib) === 1 && grade !== 'Apprentice') opts.push([2, 'adj']);
      if (spec.nadj && Math.abs(ia - ib) > 1 && grade !== 'Apprentice') opts.push([0.5, 'nadj']);
      var kind = R.weighted(opts), tpl, logic;
      if (kind === 'lt') { tpl = spec.lt; logic = ['cmp', a.it.id, b.it.id, W.cats[O].id, '<']; }
      else if (kind === 'gt') { tpl = spec.gt; logic = ['cmp', a.it.id, b.it.id, W.cats[O].id, '>']; }
      else if (kind === 'plus') { tpl = (k > 0 ? spec.more : spec.less).replace('{k}', spec.diff(Math.abs(k))); logic = ['cmp', a.it.id, b.it.id, W.cats[O].id, '=+', k]; }
      else if (kind === 'adj') { tpl = spec.adj; logic = ['cmp', a.it.id, b.it.id, W.cats[O].id, 'adj']; }
      else { tpl = spec.nadj; logic = ['cmp', a.it.id, b.it.id, W.cats[O].id, '!adj']; }
      if ((kind === 'adj' || kind === 'nadj') && b.c === 0 && a.c !== 0) { var t = a; a = b; b = t; }
      return { text: cap(tpl.replace('{a}', nounOf(W, a)).replace('{b}', nounOf(W, b))) + '.', logic: logic };
    },
    extreme: function (W, R) {
      var Os = orderedCats(W); if (!Os.length) return null;
      var O = R.pick(Os), spec = W.specs[O], top = R.next() < 0.5;
      var x = itm(W, O, top ? W.n - 1 : 0);
      var cs = range(0, W.C - 1).filter(function (c) { return c !== O; });
      var a = inRow(W, R.pick(cs), rowOf(W, x));
      return { text: cap(nounOf(W, a) + ' ' + (top ? spec.top : spec.bottom)) + '.', logic: ['is', a.it.id, x.it.id] };
    },
    ifThen: function (W, R) { // if a P(x) (false), then b P(y)
      if (W.n < 3) return null;
      var a = randItem(W, R), c2 = R.pick(range(0, W.C - 1).filter(function (c) { return c !== a.c; }));
      var x = inRow(W, c2, (rowOf(W, a) + 1 + R.int(W.n - 1)) % W.n);
      var b = randItem(W, R), c3 = R.pick(range(0, W.C - 1).filter(function (c) { return c !== b.c; }));
      var y = inRow(W, c3, R.int(W.n));
      var ids = [a.it.id, x.it.id];
      if (ids.indexOf(b.it.id) >= 0 || ids.indexOf(y.it.id) >= 0 || rowOf(W, b) === rowOf(W, a)) return null;
      var pos = rowOf(W, b) === rowOf(W, y);
      return { text: 'If ' + nounOf(W, a) + ' ' + predOf(W, x, true) + ', then ' + nounOf(W, b) + ' ' + predOf(W, y, pos) + '.',
        logic: ['ifThen', ['is', a.it.id, x.it.id], [pos ? 'is' : 'not', b.it.id, y.it.id]] };
    }
  };
  var WEIGHTS = {
    Apprentice: [[3, 'is'], [6, 'not'], [2, 'neither'], [2, 'eitherSame'], [1, 'extreme'], [2, 'cmp']],
    Journeyman: [[0.6, 'is'], [3, 'not'], [2, 'neither'], [2, 'eitherSame'], [2, 'eitherCross'], [2.5, 'pairOr'], [1, 'allDiff'], [4, 'cmp'], [0.6, 'extreme'], [0.4, 'ifThen']],
    Master: [[0.3, 'is'], [2.5, 'not'], [2, 'neither'], [1.5, 'eitherSame'], [2, 'eitherCross'], [3, 'pairOr'], [1, 'allDiff'], [5, 'cmp'], [0.3, 'extreme'], [0.5, 'ifThen']]
  };
  function candidates(W, R, grade, count) {
    var out = [], seen = {}, guard = 0;
    while (out.length < count && guard++ < count * 6) {
      var kind = R.weighted(WEIGHTS[grade]), cl = MAKERS[kind](W, R, grade);
      if (!cl || wordCount(cl.text) > MAX_CLUE_WORDS) continue;
      var key = JSON.stringify(cl.logic);
      if (seen[key]) continue;
      seen[key] = 1; cl.kind = kind; out.push(cl);
    }
    return out;
  }

  // ---------------------------------------------------------------- generation
  function solutionOf(W) {
    var sol = {};
    for (var r = 0; r < W.n; r++) {
      var key = W.cats[0].items[W.at[0][r]].id;
      sol[key] = [];
      for (var c = 1; c < W.C; c++) sol[key].push(W.cats[c].items[W.at[c][r]].id);
    }
    return sol;
  }
  function trySolve(W, sol, clues, maxTier) {
    var pz = { categories: W.cats, clues: clues.map(function (c) { return { text: c.text, logic: c.logic }; }), solution: sol };
    return LOGIC.solve(pz, { maxTier: maxTier, skipCount: true, quiet: true });
  }
  var CAP = { Apprentice: 2, Journeyman: 3, Master: 4 };

  function attempt(theme, C, n, grade, R) {
    var shell = buildCats(theme, C, n, R, grade !== 'Apprentice');
    var W = makeWorld(shell, R), sol = solutionOf(W);
    var buildTier = grade === 'Master' ? 3 : CAP[grade], pruneTier = CAP[grade];
    var pool = candidates(W, R, grade, 40 + 12 * C * n), clues = [], res = null;
    var minClues = Math.max(2, Math.floor(n * (C - 1) / 2));
    for (var i = 0; i < pool.length; i++) {
      clues.push(pool[i]);
      if (clues.length < minClues) continue;
      res = trySolve(W, sol, clues, buildTier);
      if (res.finished) break;
    }
    if (!res || !res.finished) return null;
    // prune: drop clues the solver can do without, plainest clues first for harder grades
    var order = R.shuffle(range(0, clues.length - 1));
    if (grade !== 'Apprentice') {
      var rank = { is: 0, extreme: 0, not: 1, neither: 1, eitherSame: 2 };
      order.sort(function (p, q) { return (rank[clues[p].kind] === undefined ? 3 : rank[clues[p].kind]) - (rank[clues[q].kind] === undefined ? 3 : rank[clues[q].kind]); });
    }
    var keep = clues.map(function () { return true; });
    order.forEach(function (j) {
      keep[j] = false;
      var rest = clues.filter(function (c, k) { return keep[k]; });
      if (!trySolve(W, sol, rest, pruneTier).finished) keep[j] = true;
    });
    clues = R.shuffle(clues.filter(function (c, k) { return keep[k]; }));
    var full = trySolve(W, sol, clues, 4);
    if (!full.finished) return null;
    return { W: W, shell: shell, sol: sol, clues: clues, grade: full.grade, steps: full.steps.length, tierCounts: full.tierCounts };
  }

  function epilogueCtx(W, R) {
    function ci(id) { for (var c = 0; c < W.C; c++) if (W.cats[c].id === id) return c; return -1; }
    function key(r) { return W.cats[0].items[W.at[0][r]]; }
    function item(id, r) { var O = ci(id); return W.cats[O].items[W.at[O][r]]; }
    function extreme(id, top) { var O = ci(id); return W.row[O][top ? W.n - 1 : 0]; }
    function name(x) { return typeof x === 'number' ? key(x).name : x; }
    var c = {
      facts: [],
      has: function (id) { return ci(id) > 0; },
      any: function (skip) { return R.pick(range(0, W.n - 1).filter(function (r) { return !skip || skip.indexOf(r) < 0; })); },
      rowAt: function (id, end) { return extreme(id, end === 'top'); },
      top: function (id) { var r = extreme(id, true); c.facts.push(['top', key(r).id, id]); return r; },
      bot: function (id) { var r = extreme(id, false); c.facts.push(['bottom', key(r).id, id]); return r; },
      N: function (r) { return key(r).name; },
      v: function (r, id) { var it = item(id, r); c.facts.push(['is', key(r).id, it.id]); return it.name; },
      not: function (r2, id, r) { c.facts.push(['not', key(r2).id, item(id, r).id]); return key(r2).name; },
      pred: function (r, id) { var it = item(id, r); c.facts.push(['is', key(r).id, it.id]); return fill(W.cats[ci(id)].is, it.name); },
      he: function (x) { var n = name(x); return PRON[n] === 'm' ? 'he' : PRON[n] === 'f' ? 'she' : n; },
      him: function (x) { var n = name(x); return PRON[n] === 'm' ? 'him' : PRON[n] === 'f' ? 'her' : n; },
      his: function (x) { var n = name(x); return PRON[n] === 'm' ? 'his' : PRON[n] === 'f' ? 'her' : n + "'s"; }
    };
    return c;
  }
  // pick an epilogue whose categories are all in the puzzle and write it from the solution
  function writeEpilogue(theme, W, R) {
    var c = epilogueCtx(W, R);
    var fits = (EPILOGUES[theme.id] || []).filter(function (e) { return e.needs.every(c.has); });
    var text;
    if (fits.length) text = R.pick(fits).f(c);
    else text = R.pick(FALLBACK_EPILOGUES)(c, W.cats.slice(1).map(function (k) { return k.id; }));
    return { text: text, facts: c.facts };
  }

  function finish(theme, a, grade, R, meta) {
    var W = a.W, n = W.n;
    var intro = R.pick(theme.intros).replace(/\{n\}/g, NUM[n]).replace(/\{N\}/g, cap(NUM[n]));
    var specs = a.shell.specs.slice(1);
    var task = 'Can you work out ' + listAnd(specs.map(function (s) { return s.task; })) + '?';
    var epi = writeEpilogue(theme, W, R);
    return {
      id: 'daybook-' + meta.seed + '-' + W.C + 'x' + n + '-' + grade.charAt(0),
      daybook: { seed: meta.seed, theme: theme.id, targetGrade: grade, gradeHit: a.grade === grade, attempts: meta.attempts, ms: meta.ms, epilogueFacts: epi.facts },
      title: theme.title, place: theme.place, size: W.C + '×' + n, grade: a.grade,
      intro: intro, task: task,
      categories: W.cats,
      clues: a.clues.map(function (c) { return { text: c.text, logic: c.logic }; }),
      solution: a.sol,
      epilogue: epi.text,
      steps: a.steps
    };
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // opts: {cats, items, grade, seed, theme, maxAttempts (default 200), timeLimit ms (default 600; stops early once any puzzle is in hand)}
  function generate(opts) {
    opts = opts || {};
    var C = Math.max(3, Math.min(5, opts.cats || 3)), n = Math.max(3, Math.min(6, opts.items || 4));
    var grade = GRADES.indexOf(opts.grade) >= 0 ? opts.grade : 'Apprentice';
    var seed = opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 1e9);
    var R = Rng(String(seed) + '|' + C + 'x' + n + '|' + grade + '|' + (opts.theme || ''));
    var theme = null;
    THEMES.forEach(function (t) { if (t.id === opts.theme) theme = t; });
    if (!theme) theme = R.pick(THEMES);
    var t0 = now(), maxAttempts = opts.maxAttempts || 200, limit = opts.timeLimit || 600;
    var best = null, bestDist = 9, attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      var a = attempt(theme, C, n, grade, R);
      if (a) {
        var d = Math.abs(GRADES.indexOf(a.grade) - GRADES.indexOf(grade));
        if (d < bestDist) { best = a; bestDist = d; }
        if (d === 0) break;
      }
      if (best && now() - t0 > limit) break;
    }
    if (!best) return null;
    return finish(theme, best, grade, R, { seed: seed, attempts: attempts, ms: Math.round(now() - t0) });
  }

  // random clue sentences across every theme and kind, for proofreading
  function sampleClues(seed, count) {
    var R = Rng('clues|' + seed), out = [];
    var kinds = Object.keys(MAKERS);
    while (out.length < count) {
      var theme = R.pick(THEMES), C = 3 + R.int(3), n = 3 + R.int(4);
      var shell = buildCats(theme, C, n, R, true), W = makeWorld(shell, R);
      var kind = kinds[out.length % kinds.length], cl = MAKERS[kind](W, R, 'Master');
      if (cl) out.push('[' + theme.id + ' ' + kind + '] ' + cl.text);
    }
    return out;
  }

  return {
    generate: generate,
    sampleClues: sampleClues,
    themes: THEMES.map(function (t) { return { id: t.id, title: t.title }; }),
    GRADES: GRADES,
    _themes: THEMES,
    _epilogues: EPILOGUES,
    _rng: Rng
  };
});
