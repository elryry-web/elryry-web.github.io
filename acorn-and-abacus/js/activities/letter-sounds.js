// Letter Sounds (NELP 2008; Piasta & Wagner 2010b). "Which letter says /mmm/?" She clicks the card,
// and later presses the real key. Letters come in the order of how well their name holds the sound.
import { h, rand, shuffle } from '../ui.js';
import { pic } from '../art.js';
import { LETTERS } from '../script.js';

const START = 'tkjvz';     // sound at the start of the name (B, D, P held back as confusable)
const END = 'fmlnrsx';     // sound at the end of the name
const REST = 'hwygc';      // names that don't hold the sound
const VOWELS = 'aeiou';    // short vowels
const LATE = 'bdpq';       // the mirror letters

const STEPS = [
  { label: 'T K J V Z, 2 cards, with pictures', pool: START, cards: 2, pics: true },
  { label: '+ F M L N R S X, 3 cards, with pictures', pool: START + END, cards: 3, pics: true },
  { label: '+ H W Y G C, 3 cards', pool: START + END + REST, cards: 3 },
  { label: '+ short vowels, 3 cards', pool: START + END + REST + VOWELS, cards: 3 },
  { label: '+ B D P Q, 4 cards, look-alikes together', pool: START + END + REST + VOWELS + LATE, cards: 4, close: true },
  { label: 'Press the letter on the keyboard', pool: START + END + REST + VOWELS + LATE, keyboard: true },
];

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
// Pairs that sound alike: never shown together before the last card step.
const CLASH = [['c', 'k'], ['c', 'q'], ['k', 'q'], ['m', 'n'], ['b', 'p'], ['b', 'd'], ['d', 't'], ['f', 'v'], ['s', 'z']];
const clashes = (a, b) => CLASH.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
const SAME_SOUND = [['c', 'k']]; // same pure sound: never together at all

function icon() {
  return h('div', { class: 'pic-letter' }, 'Mm', pic('moth'));
}

// The anchor picture shows on the first two steps. After that it is hidden until she answers,
// then shows on the right card as feedback, so the picture never gives the answer away.
const card = (ch, pics) => h('button', { class: 'ls-card target', 'aria-label': ch.toUpperCase() },
  h('div', { class: 'pair' }, ch.toUpperCase() + ch), pic(LETTERS[ch].pic, pics ? 'pic' : 'pic hide'));
const reveal = (el) => el.querySelector('.pic.hide')?.classList.remove('hide');

function chooseCards(cfg, target) {
  const others = shuffle([...cfg.pool].filter((c) => c !== target
    && !SAME_SOUND.some(([x, y]) => (c === x && target === y) || (c === y && target === x))));
  const picked = [target];
  if (cfg.close && LATE.includes(target)) {
    // put a look-alike or sound-alike next to it
    const near = others.filter((c) => LATE.includes(c) || clashes(c, target));
    if (near.length) picked.push(near[0]);
  }
  for (const c of others) {
    if (picked.length >= cfg.cards) break;
    if (picked.includes(c)) continue;
    if (!cfg.close && picked.some((p) => clashes(p, c))) continue;
    if (picked.some((p) => SAME_SOUND.some(([x, y]) => (p === x && c === y) || (p === y && c === x)))) continue;
    picked.push(c);
  }
  return shuffle(picked);
}

const praiseFor = (fb, ch, keyboard) => [
  `letter-name-${ch}`, 'ls-says', `letter-pure-${ch},`, `letter-word-${ch}`,
  keyboard ? fb.vary('ls-key', ['praise-ls-key-1', 'praise-ls-key-2']) : fb.vary('ls', ['praise-ls-1', 'praise-ls-2']),
];

async function cardItem(ctx, cfg, target, round) {
  const { fb, level } = ctx;
  const letters = chooseCards(cfg, target);
  const cards = letters.map((ch) => ({ el: card(ch, cfg.pics), value: ch }));
  ctx.root.replaceChildren(h('div', { class: 'ls-cards' }, cards.map((c) => c.el)));
  const ask = ['ls-which', `letter-pure-${target}?`];
  ctx.instruct(ask);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ targets: cards });
    if (v === target) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say(['ls-thats', `letter-name-${v}.`, 'ls-it-says', `letter-pure-${v}.`, 'ui-listen', `letter-pure-${target}.`, 'ls-which-one']);
      ctx.setInstruction(ask);
    } else {
      fb.glow(cards.find((c) => c.value === target).el, true);
      ctx.instruct(['ls-this-one', `letter-pure-${target}.`, 'ls-click-it']);
    }
  }
  fb.tok();
  cards.forEach((c) => fb.glow(c.el, false));
  reveal(cards.find((c) => c.value === target).el);
  level.record(misses === 0, `ls-${round}`);
  if (misses === 0) {
    await ctx.say(praiseFor(fb, target, false));
    ctx.celebrate();
  } else {
    await ctx.say([`letter-name-${target}`, 'ls-says', `letter-pure-${target},`, `letter-word-${target}`]);
  }
  await ctx.wait(2000);
}

async function keyItem(ctx, target, round) {
  const { fb, level } = ctx;
  const rowText = KB_ROWS.find((r) => r.includes(target));
  const keys = {};
  const shown = h('div', { class: 'ls-card' }, h('div', { class: 'pair' }, target.toUpperCase() + target), pic(LETTERS[target].pic, 'pic hide'));
  const row = h('div', { class: 'kb-row' }, [...rowText].map((ch) => (keys[ch] = h('div', { class: 'kb-key' }, ch.toUpperCase()))));
  ctx.root.replaceChildren(h('div', { class: 'ls-key-wrap' },
    shown,
    h('div', { class: 'kb' }, row)));
  const ask = [`letter-pure-${target}.`, 'ls-key-find'];
  ctx.instruct(ask);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ keys: (k) => (/^[a-z]$/.test(k) ? k : undefined) });
    if (v === target) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say(['ls-thats', `letter-name-${v}.`, 'ls-it-says', `letter-pure-${v}.`, 'ls-look-for']);
      ctx.setInstruction(ask);
    } else {
      fb.glow(keys[target], true);
      ctx.instruct(['ls-key-glow']);
    }
  }
  fb.tok();
  fb.glow(keys[target], false);
  reveal(shown);
  level.record(misses === 0, `ls-${round}`);
  if (misses === 0) { await ctx.say(praiseFor(fb, target, true)); ctx.celebrate(); }
  else await ctx.say([`letter-name-${target}`, 'ls-says', `letter-pure-${target}.`]);
  await ctx.wait(2000);
}

export default {
  id: 'letter-sounds',
  nameKey: 'act-letter-sounds',
  label: 'Letter Sounds',
  icon,
  steps: STEPS,
  grownUp: {
    ask: '"What else starts with that sound?" Say the sound, not the letter name.',
    offscreen: 'Find three things in the kitchen that start with /m/. Write the letter M on paper together.',
  },
  async run(ctx) {
    const recent = [];
    for (let round = 0; ; round++) {
      const cfg = ctx.level.cfg;
      const pool = [...cfg.pool];
      // Favour the newest letters at this step, never the same target twice running.
      let target;
      do {
        target = Math.random() < 0.4 ? pool[rand(Math.max(0, pool.length - 7), pool.length - 1)] : pool[rand(0, pool.length - 1)];
      } while (recent.includes(target) && pool.length > 3);
      recent.push(target);
      if (recent.length > 2) recent.shift();
      if (cfg.keyboard) await keyItem(ctx, target, round);
      else await cardItem(ctx, cfg, target, round);
      await ctx.roundEnd();
    }
  },
};
