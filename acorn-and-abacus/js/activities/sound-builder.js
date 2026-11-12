// Sound Builder: oral blending, the stretch goal (NELP 2008; Ehri et al. 2001).
// She hears a word in parts, /sss/ … -un, later /k/ … /a/ … /t/, and clicks its picture.
// It starts with two parts and a held first sound, then three sounds, then pictures that share
// sounds (cat, hat, bat). The gaps between sounds grow as she goes up. A miss replays the sounds
// closer together, nearly a whole word. The sounds are the letter-sound clips; "~600" is a pause.
import { h, rand, shuffle } from '../ui.js';
import { pic } from '../art.js';
import { WORDS } from '../script.js';

const HELD = 'mslfrnvz';
const SB_WORDS = Object.values(WORDS).filter((w) => w.sounds);
const HELD_WORDS = SB_WORDS.filter((w) => HELD.includes(w.first));

const STEPS = [
  { label: 'Two parts, held first sound (sss … un), 2 pictures', words: HELD_WORDS.filter((w) => w.rime), rime: true, choices: 2, gap: 500 },
  { label: 'Three sounds, held first sound (m … a … p), 2 pictures', words: HELD_WORDS, choices: 2, gap: 550 },
  { label: 'Three sounds, any word, 3 pictures', words: SB_WORDS, choices: 3, gap: 650 },
  { label: 'Pictures that share sounds (cat, hat, bat), 3 pictures', words: SB_WORDS, choices: 3, gap: 800, close: true },
];

const vowel = (w) => w.sounds[1];
const shares = (a, b) => a.sounds.some((s, i) => b.sounds[i] === s);

// The word in parts, with a pause between each. The last part ends the sentence in the caption.
function parts(w, gap, rime) {
  const segs = rime ? [`letter-pure-${w.sounds[0]}`, `sb-r-${w.rime}`] : w.sounds.map((s) => `letter-pure-${s}`);
  segs[segs.length - 1] += '.';
  return segs.flatMap((s, i) => (i ? [`~${gap}`, s] : [s]));
}

function icon() {
  return h('div', { class: 'pic-builder' },
    h('span', { class: 'sb-ic-dots' }, h('i'), h('i'), h('i')), pic('🐈'));
}

function chooseWords(cfg, target) {
  const others = shuffle(cfg.words.filter((w) => w !== target && w.first !== target.first));
  if (cfg.close) {
    const alike = others.filter((w) => shares(w, target));
    const rest = others.filter((w) => !shares(w, target));
    return shuffle([target, ...[...alike, ...rest].slice(0, cfg.choices - 1)]);
  }
  // Very different pictures: no shared first sound or vowel.
  const far = others.filter((w) => vowel(w) !== vowel(target));
  const picked = [target];
  for (const w of far) {
    if (picked.length >= cfg.choices) break;
    if (picked.some((p) => p.first === w.first || vowel(p) === vowel(w))) continue;
    picked.push(w);
  }
  for (const w of others) if (picked.length < cfg.choices && !picked.includes(w)) picked.push(w);
  return shuffle(picked);
}

async function item(ctx, cfg, target) {
  const { fb, level } = ctx;
  const words = chooseWords(cfg, target);
  const cards = words.map((w) => {
    const el = h('button', { class: 'fs-card target', 'aria-label': w.text }, pic(w.pic));
    ctx.hover(el, [`word-${w.id}`]);
    return { el, value: w };
  });
  ctx.root.replaceChildren(h('div', { class: 'fs-cards' }, cards.map((c) => c.el)));
  const ask = ['ui-listen', '~300', ...parts(target, cfg.gap, cfg.rime), '~400', 'sb-which'];
  await ctx.instruct(ask);
  let misses = 0;
  for (;;) {
    const w = await ctx.pick({ targets: cards });
    if (w === target) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say(['sb-again', '~300', ...parts(target, 180, cfg.rime)]);
      ctx.setInstruction(ask);
    } else {
      fb.glow(cards.find((c) => c.value === target).el, true);
      ctx.instruct([...parts(target, 80, cfg.rime), '~200', `word-${target.id}.`, 'ls-click-it']);
    }
  }
  fb.tok();
  cards.forEach((c) => { fb.glow(c.el, false); c.el.classList.toggle('dim', c.value !== target); });
  level.record(misses === 0, `sb-${target.id}`);
  const whole = [...parts(target, 120, cfg.rime), '~200', `word-${target.id}!`];
  if (misses === 0) { await ctx.say([...whole, fb.vary('sb', ['praise-sb-1', 'praise-sb-2'])]); ctx.celebrate(); }
  else await ctx.say(whole);
  await ctx.wait(1800);
}

export default {
  id: 'sound-builder',
  nameKey: 'act-sound-builder',
  label: 'Sound Builder',
  icon,
  steps: STEPS,
  grownUp: {
    ask: 'Say a word in robot talk: "d … o … g". Let her say the whole word.',
    offscreen: 'Robot-talk a toy: "Can you find the b … u … s?"',
  },
  async run(ctx) {
    const recent = [];
    for (;;) {
      const cfg = ctx.level.cfg;
      let target;
      do { target = cfg.words[rand(0, cfg.words.length - 1)]; } while (recent.includes(target) && cfg.words.length > 3);
      recent.push(target);
      if (recent.length > 3) recent.shift();
      await item(ctx, cfg, target);
      await ctx.roundEnd();
    }
  },
};
