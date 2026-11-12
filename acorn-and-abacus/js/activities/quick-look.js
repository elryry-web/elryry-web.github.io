// Quick Look: subitizing (Clements & Sarama). Bugs flash in a dice pattern or a ten-frame and hide;
// she says how many with a numeral button or a number key. Later: which leaf has more, which number is bigger.
import { h, rand, num } from '../ui.js';
import { pic, BUG_KINDS } from '../art.js';

const STEPS = [
  { label: '1 to 3 bugs, dice patterns', kind: 'look', lo: 1, hi: 3 },
  { label: '1 to 5 bugs, dice patterns', kind: 'look', lo: 1, hi: 5 },
  { label: 'Which leaf has more? Far apart', kind: 'more', lo: 1, hi: 8, gapMin: 4, gapMax: 7 },
  { label: '6 to 10 bugs on a ten-frame', kind: 'look', frame: true, lo: 6, hi: 10 },
  { label: 'Which leaf has more? Close', kind: 'more', lo: 3, hi: 9, gapMin: 1, gapMax: 2 },
  { label: 'Which number is bigger? To 20', kind: 'nums', hi: 20 },
  { label: 'Which number is bigger? To 99, like 14 and 41', kind: 'nums', hi: 99 },
];

// Dice positions as % of the card.
const DICE = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

function icon() {
  const grid = h('div', { class: 'pic-bugs' });
  [1, 0, 1, 0, 1, 0, 1, 0, 1].forEach((on) => grid.append(on ? pic('ladybug') : h('span')));
  return grid;
}

function bug(kind, x, y) {
  const b = h('span', { class: 'bug' }, pic(kind));
  b.style.left = `${x}%`;
  b.style.top = `${y}%`;
  return b;
}

// The picture to flash: a dice card (1-6) or a ten-frame (6-10). Returns {el, bugs}.
function makePicture(n, kind, frame) {
  if (frame) {
    const el = h('div', { class: 'frame' });
    const bugs = [];
    for (let i = 0; i < 10; i++) {
      const p = i < n ? pic(kind) : null;
      if (p) bugs.push(p);
      el.append(h('div', { class: 'cell' }, p));
    }
    return { el, bugs };
  }
  const el = h('div', { class: 'card' });
  const bugs = DICE[n].map(([x, y]) => bug(kind, x, y));
  el.append(...bugs);
  return { el, bugs };
}

const LEAF = `<svg class="leafbg" viewBox="0 0 520 420" aria-hidden="true">
  <path d="M30 230 C80 60 300 10 500 40 C510 220 380 400 150 390 C90 385 50 320 30 230 Z" fill="#b9d98e" stroke="#557a3a" stroke-width="6" stroke-linejoin="round"/>
  <path d="M40 240 C160 220 330 140 480 55" stroke="#557a3a" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;

// Scatter n bugs inside the leaf without overlaps. Positions in %.
function scatter(n) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const pts = [];
    let tries = 0;
    while (pts.length < n && tries < 600) {
      tries++;
      const x = rand(22, 84);
      const y = rand(24, 78);
      // keep inside the leaf shape roughly: an ellipse tilted with the leaf
      const dx = (x - 53) / 34;
      const dy = (y - 52) / 30 + (x - 53) / 90;
      if (dx * dx + dy * dy > 1) continue;
      if (pts.some(([a, b]) => Math.hypot((a - x) * 5.2, (b - y) * 4.2) < 88)) continue;
      pts.push([x, y]);
    }
    if (pts.length === n) return pts;
  }
  return Array.from({ length: n }, (_, i) => [25 + (i % 4) * 16, 32 + Math.floor(i / 4) * 18]);
}

const keyToNumber = (k) => (k === '0' ? 10 : /^[1-9]$/.test(k) ? Number(k) : undefined);

async function lookItem(ctx, cfg, n, round) {
  const { level, fb } = ctx;
  const kind = BUG_KINDS[rand(0, BUG_KINDS.length - 1)];
  const flashMs = level.extra.flashMs ?? 2000;
  const show = h('div', { class: 'ql-show' });
  const cover = h('div', { class: 'ql-cover' });
  const values = [];
  for (let v = cfg.frame ? cfg.lo : 1; v <= cfg.hi; v++) values.push(v);
  const btns = values.map((v) => ({ el: h('button', { class: 'numbtn target' }, v), value: v }));
  ctx.root.replaceChildren(h('div', { class: 'ql-wrap' }, show, h('div', { class: 'ql-choices' }, btns.map((b) => b.el))));

  const picture = makePicture(n, kind, cfg.frame);
  let hideTimer = null;
  const flash = () => {
    clearTimeout(hideTimer);
    show.replaceChildren(picture.el);
    hideTimer = setTimeout(() => { if (ctx.alive) show.replaceChildren(cover); }, flashMs);
  };
  const keys = (k) => (values.includes(keyToNumber(k)) ? keyToNumber(k) : undefined);

  flash();
  ctx.instruct(['ql-look']);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ targets: btns, keys });
    if (v === n) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      await ctx.say(['ql-look-again']);
      flash();
      ctx.setInstruction(['ql-how-many']);
    } else if (misses === 2) {
      clearTimeout(hideTimer);
      show.replaceChildren(picture.el);
      await ctx.sayPaced(['ql-count-together'], 900);
      for (let i = 0; i < picture.bugs.length; i++) {
        picture.bugs[i].classList.add('counted');
        await ctx.sayPaced([num(i + 1)], 750);
      }
      fb.glow(btns.find((b) => b.value === n).el, true);
      ctx.instruct(['ui-click', num(n, '.')]);
    }
  }
  clearTimeout(hideTimer);
  fb.tok();
  btns.forEach((b) => fb.glow(b.el, false));
  show.replaceChildren(picture.el);
  const right = misses === 0;
  level.record(right, `ql-${round}`);
  level.extra.flashMs = right ? Math.max(900, flashMs - 150) : Math.min(3000, flashMs + 300);
  level.saveExtra();
  if (right) {
    if (cfg.frame) {
      await ctx.say(n === 10 ? [num(10, '!'), 'praise-ql-frame-full'] : [num(n, '!'), 'praise-ql-frame-a', num(n - 5), 'praise-ql-frame-b']);
    } else {
      await ctx.say([num(n, '!'), fb.vary('ql-dots', ['praise-ql-dots-1', 'praise-ql-dots-2'])]);
    }
    ctx.celebrate();
  }
  await ctx.wait(1600);
}

async function moreItem(ctx, cfg, round) {
  const { level, fb } = ctx;
  let a;
  let b;
  do {
    a = rand(cfg.lo, cfg.hi);
    b = a + (Math.random() < 0.5 ? -1 : 1) * rand(cfg.gapMin, cfg.gapMax);
  } while (b < cfg.lo || b > cfg.hi || a === b);
  const kind = BUG_KINDS[rand(0, BUG_KINDS.length - 1)];
  const leaves = [a, b].map((n) => {
    const el = h('button', { class: 'ql-leaf target', 'aria-label': 'Leaf' });
    el.innerHTML = LEAF;
    const bugs = scatter(n).map(([x, y]) => bug(kind, x, y));
    el.append(...bugs);
    return { el, value: n, bugs };
  });
  const big = Math.max(a, b);
  ctx.root.replaceChildren(h('div', { class: 'ql-leaves' }, leaves.map((l) => l.el)));
  ctx.instruct(['ql-more-q']);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ targets: leaves });
    if (v === big) break;
    misses++;
    fb.softMiss();
    if (misses === 1) ctx.instruct(['ql-more-again']);
    else if (misses === 2) {
      // Count each leaf together, then light up the one with more.
      for (const [i, leaf] of leaves.entries()) {
        for (let k = 0; k < leaf.bugs.length; k++) {
          leaf.bugs[k].classList.add('counted');
          await ctx.sayPaced([num(k + 1)], 650);
        }
        leaf.el.append(h('div', { class: 'count' }, leaf.value));
        await ctx.sayPaced([i === 0 ? 'ql-this-leaf' : 'ql-that-leaf', num(leaf.value, '.')], 1400);
      }
      fb.glow(leaves.find((l) => l.value === big).el, true);
      ctx.instruct(['ql-click-more']);
    }
  }
  fb.tok();
  leaves.forEach((l) => fb.glow(l.el, false));
  level.record(misses === 0, `ql-${round}`);
  if (misses === 0) {
    await ctx.say([fb.vary('ql-more', ['praise-ql-more-1', 'praise-ql-more-2'])]);
    ctx.celebrate();
  }
  await ctx.wait(1600);
}

function numberPair(hi) {
  if (hi > 20 && Math.random() < 0.5) {
    // a digit swap, like 14 and 41
    let t;
    let o;
    do { t = rand(1, 9); o = rand(1, 9); } while (t === o);
    return [t * 10 + o, o * 10 + t];
  }
  const lo = hi > 20 ? 10 : 1;
  let a;
  let b;
  do { a = rand(lo, hi); b = rand(lo, hi); } while (a === b);
  return [a, b];
}

async function numsItem(ctx, cfg, round) {
  const { level, fb } = ctx;
  const [a, b] = numberPair(cfg.hi);
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const cards = [a, b].map((v) => ({ el: h('button', { class: 'ql-numcard target' }, v), value: v }));
  ctx.root.replaceChildren(h('div', { class: 'ql-nums' }, cards.map((c) => c.el)));
  ctx.instruct(['ql-bigger-q']);
  let misses = 0;
  for (;;) {
    const v = await ctx.pick({ targets: cards });
    if (v === big) break;
    misses++;
    fb.softMiss();
    if (misses === 1) ctx.instruct(['ql-look-again', 'ql-which-bigger']);
    else {
      fb.glow(cards.find((c) => c.value === big).el, true);
      ctx.instruct([num(big), 'ql-is-bigger-than', num(small, '.'), 'ls-click-it']);
    }
  }
  fb.tok();
  cards.forEach((c) => fb.glow(c.el, false));
  level.record(misses === 0, `ql-${round}`);
  if (misses === 0) {
    await ctx.say(big > 20 ? ['praise-ql-tens'] : [num(big), 'ql-is-bigger-than', num(small, '.'), 'praise-ql-later']);
    ctx.celebrate();
  }
  await ctx.wait(1600);
}

export default {
  id: 'quick-look',
  nameKey: 'act-quick-look',
  label: 'Quick Look',
  icon,
  steps: STEPS,
  grownUp: {
    ask: '"How did you know so fast? What shape did they make?"',
    offscreen: 'Roll a die at dinner and say the number before counting the dots.',
  },
  async run(ctx) {
    let last = 0;
    for (let round = 0; ; round++) {
      const cfg = ctx.level.cfg;
      if (cfg.kind === 'look') {
        let n;
        do { n = rand(cfg.lo, cfg.hi); } while (n === last && cfg.hi > cfg.lo);
        last = n;
        await lookItem(ctx, cfg, n, round);
      } else if (cfg.kind === 'more') await moreItem(ctx, cfg, round);
      else await numsItem(ctx, cfg, round);
      await ctx.roundEnd();
    }
  },
};
