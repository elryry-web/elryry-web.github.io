// First Sounds: phoneme identity (Byrne & Fielding-Barnsley 1991; Ehri et al. 2001; NELP 2008).
// "Which one starts with /mmm/?" She clicks one of three pictures. Held sounds come first, then
// stops, then sound-alike distractors. The last steps turn it round: she sees a picture, hears its
// name and clicks its first letter. Pointing at a picture says its name.
import { h, rand, shuffle } from '../ui.js';
import { pic } from '../art.js';
import { WORDS } from '../script.js';

const HELD = 'msflrn';
const STOPS = 'btckdpg';
const MORE = 'hwvzae';

const STEPS = [
  { label: 'Held sounds M S F L R N, 3 pictures', pool: HELD },
  { label: '+ B T C K D P G, 3 pictures', pool: HELD + STOPS },
  { label: '+ H W V Z and short A E, 3 pictures', pool: HELD + STOPS + MORE },
  { label: 'Sound-alike pictures together (m/n, b/p, d/t)', pool: HELD + STOPS + MORE, close: true },
  { label: 'Picture to letter, 2 letters', pool: HELD + STOPS, letters: 2 },
  { label: 'Picture to letter, 3 letters', pool: HELD + STOPS + MORE, letters: 3, close: true },
];

// C and K share a sound: treat them as one sound and never show them together.
const soundOf = (ch) => (ch === 'k' ? 'c' : ch);
const CLASH = [['c', 'g'], ['m', 'n'], ['b', 'p'], ['b', 'd'], ['d', 't'], ['f', 'v'], ['s', 'z'], ['t', 'p'], ['a', 'e']];
const clashes = (x, y) => CLASH.some(([p, q]) => (soundOf(x) === p && soundOf(y) === q) || (soundOf(x) === q && soundOf(y) === p));
const sameSound = (x, y) => soundOf(x) === soundOf(y);
// The word's picture could be named with this first sound (race car: "car").
const mistakable = (w, ch) => [...(w.avoid || '')].some((a) => sameSound(a, ch));

const byFirst = (pool) => Object.values(WORDS).filter((w) => pool.includes(w.first));

function icon() {
  return h('div', { class: 'pic-first' }, pic('moth'), h('span', { class: 'fs-ic-sound' }, 'm…'));
}

const LETTER_CARD = (ch) => h('button', { class: 'ls-card fs-letter target', 'aria-label': ch.toUpperCase() },
  h('div', { class: 'pair' }, ch.toUpperCase() + ch));

// Three pictures: the target word and two words with other first sounds.
function choosePictures(cfg, target) {
  const t = target.first;
  const others = shuffle(byFirst(cfg.pool).filter((w) => !sameSound(w.first, t) && !mistakable(w, t)));
  const picked = [target];
  if (cfg.close) {
    const near = others.find((w) => clashes(w.first, t));
    if (near) picked.push(near);
  }
  for (const w of others) {
    if (picked.length >= 3) break;
    if (picked.includes(w)) continue;
    if (picked.some((p) => sameSound(p.first, w.first))) continue;
    if (!cfg.close && picked.some((p) => clashes(p.first, w.first))) continue;
    if (picked.some((p) => mistakable(w, p.first) || mistakable(p, w.first))) continue;
    picked.push(w);
  }
  return shuffle(picked);
}

function chooseLetters(cfg, target) {
  const t = target.first;
  const others = shuffle([...cfg.pool].filter((c) => !sameSound(c, t) && !mistakable(target, c)));
  const picked = [t];
  if (cfg.close) { const near = others.find((c) => clashes(c, t)); if (near) picked.push(near); }
  for (const c of others) {
    if (picked.length >= cfg.letters) break;
    if (picked.includes(c) || picked.some((p) => sameSound(p, c))) continue;
    if (!cfg.close && picked.some((p) => clashes(p, c))) continue;
    picked.push(c);
  }
  return shuffle(picked);
}

async function pictureItem(ctx, cfg, target) {
  const { fb, level } = ctx;
  const t = target.first;
  const words = choosePictures(cfg, target);
  const cards = words.map((w) => {
    const el = h('button', { class: 'fs-card target', 'aria-label': w.text }, pic(w.pic));
    ctx.hover(el, [`word-${w.id}`]);
    return { el, value: w };
  });
  ctx.root.replaceChildren(h('div', { class: 'fs-cards' }, cards.map((c) => c.el)));
  const ask = ['fs-which', `letter-pure-${t}?`];
  ctx.instruct(ask);
  let misses = 0;
  for (;;) {
    const w = await ctx.pick({ targets: cards });
    if (w === target) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say([`word-${w.id}`, 'fs-starts-with', `letter-pure-${w.first}.`, 'ui-listen', `letter-pure-${t}.`]);
      ctx.setInstruction(ask);
    } else {
      fb.glow(cards.find((c) => c.value === target).el, true);
      ctx.instruct([`word-${target.id}`, 'fs-starts-with', `letter-pure-${t}.`, 'ls-click-it']);
    }
  }
  fb.tok();
  cards.forEach((c) => { fb.glow(c.el, false); c.el.classList.toggle('dim', c.value !== target); });
  level.record(misses === 0, `fs-${target.id}`);
  const fact = [`word-${target.id}`, 'fs-starts-with', `letter-pure-${t}!`];
  if (misses === 0) { await ctx.say([...fact, fb.vary('fs', ['praise-fs-1', 'praise-fs-2'])]); ctx.celebrate(); }
  else await ctx.say(fact);
  await ctx.wait(1800);
}

async function letterItem(ctx, cfg, target) {
  const { fb, level } = ctx;
  const t = target.first;
  const letters = chooseLetters(cfg, target);
  const cards = letters.map((ch) => ({ el: LETTER_CARD(ch), value: ch }));
  const shown = h('div', { class: 'fs-shown', 'aria-label': target.text }, pic(target.pic));
  ctx.hover(shown, [`word-${target.id}`]);
  ctx.root.replaceChildren(h('div', { class: 'fs-letter-wrap' }, shown, h('div', { class: 'fs-letters' }, cards.map((c) => c.el))));
  const ask = [`word-${target.id}.`, 'fs-which-letter'];
  ctx.instruct(ask);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ targets: cards, keys: (k) => (letters.includes(k) ? k : undefined) });
    if (v === t) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say(['ls-thats', `letter-name-${v}.`, 'ls-it-says', `letter-pure-${v}.`, `word-${target.id}`, 'fs-starts-with', `letter-pure-${t}.`]);
      ctx.setInstruction(ask);
    } else {
      fb.glow(cards.find((c) => c.value === t).el, true);
      ctx.instruct([`letter-name-${t}`, 'ls-says', `letter-pure-${t}.`, 'ls-click-it']);
    }
  }
  fb.tok();
  cards.forEach((c) => fb.glow(c.el, false));
  level.record(misses === 0, `fs-${target.id}`);
  const fact = [`word-${target.id}`, 'fs-starts-with', `letter-name-${t}!`];
  if (misses === 0) { await ctx.say([...fact, 'praise-fs-letter']); ctx.celebrate(); }
  else await ctx.say(fact);
  await ctx.wait(1800);
}

export default {
  id: 'first-sounds',
  nameKey: 'act-first-sounds',
  label: 'First Sounds',
  icon,
  steps: STEPS,
  grownUp: {
    ask: 'Stretch the first sound: "mmmoth". "What else starts like that?"',
    offscreen: 'I-spy with sounds: "I spy something that starts with sss."',
  },
  async run(ctx) {
    const recent = [];
    for (;;) {
      const cfg = ctx.level.cfg;
      const pool = byFirst(cfg.pool);
      let target;
      do { target = pool[rand(0, pool.length - 1)]; } while (recent.some((r) => r === target || sameSound(r.first, target.first)) && pool.length > 6);
      recent.push(target);
      if (recent.length > 3) recent.shift();
      if (cfg.letters) await letterItem(ctx, cfg, target);
      else await pictureItem(ctx, cfg, target);
      await ctx.roundEnd();
    }
  },
};
