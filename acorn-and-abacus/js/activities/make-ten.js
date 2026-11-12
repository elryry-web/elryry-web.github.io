// Make Ten: composing numbers (Frye et al. 2013 rec. 1; Clements & Sarama 2008).
// Ladybugs sit in a five-frame or ten-frame; she says how many more fill it, out of 3 numbers.
// Each pair she finds lights its arc over a 0-10 number line ("rainbow facts"): 1 and 9, 2 and 8...
// All the pairs make a whole rainbow, which ends the round. The last step drops the frame:
// "7 and how many make 10?" with the number line to count on along.
import { h, rand, shuffle, num } from '../ui.js';
import { pic } from '../art.js';

const STEPS = [
  { label: 'Make 5 on a five-frame', total: 5 },
  { label: 'Make 10 on a ten-frame, from 5 or more', total: 10, from: 'big' },
  { label: 'Make 10 on a ten-frame, from any number', total: 10, from: 'any' },
  { label: 'Make 10 said aloud: "7 and how many make 10?"', total: 10, from: 'any', sum: true },
];

// Outer arc to inner arc.
const COLOURS = {
  5: ['#e2493f', '#f2c84b', '#3f8fd8'],
  10: ['#e2493f', '#f28c28', '#f2c84b', '#5aa452', '#3f8fd8', '#8a5cc7'],
};

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function icon() {
  const s = svgEl('svg', { viewBox: '0 0 300 170', width: 300, height: 170 });
  const x = (n) => 25 + n * 25;
  COLOURS[10].forEach((c, i) => {
    const r = (10 - 2 * i) * 12.5;
    const d = i === 5 ? `M${x(5) - 9} 130 A9 9 0 0 1 ${x(5) + 9} 130` : `M${x(i)} 130 A${r} ${r} 0 0 1 ${x(10 - i)} 130`;
    s.append(svgEl('path', { d, fill: 'none', stroke: c, 'stroke-width': 12, 'stroke-linecap': 'round' }));
  });
  s.append(svgEl('line', { x1: 15, y1: 140, x2: 285, y2: 140, stroke: '#8a6a45', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  for (let n = 0; n <= 10; n++) s.append(svgEl('circle', { cx: x(n), cy: 140, r: 5, fill: '#8a6a45' }));
  return h('div', { class: 'pic-rainbow' }, s);
}

// The rainbow over a number line 0..T. Returns { el, light(pair), mark(n, on), full() }.
function makeRainbow(T) {
  const W = 560;
  const sp = (W - 60) / T;
  const base = sp * T / 2 + 40;
  const H = base + 64;
  const x = (n) => 30 + n * sp;
  const band = Math.min(sp * 0.78, 64); // wide bands, so the lit arcs read as one rainbow
  const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mt-rainbow' });
  const pairs = [];
  for (let a = 0; a <= T / 2; a++) pairs.push([a, T - a]);
  const arcs = pairs.map(([a, b], i) => {
    const r = a === b ? sp * 0.42 : (b - a) * sp / 2;
    const d = a === b ? `M${x(a) - r} ${base} A${r} ${r} 0 0 1 ${x(a) + r} ${base}` : `M${x(a)} ${base} A${r} ${r} 0 0 1 ${x(b)} ${base}`;
    s.append(svgEl('path', { d, class: 'mt-slot', 'stroke-width': 4 }));
    const arc = svgEl('path', { d, class: 'mt-arc', stroke: COLOURS[T][i], 'stroke-width': a === b ? sp * 0.5 : band, pathLength: 1 });
    s.append(arc);
    return arc;
  });
  s.append(svgEl('line', { x1: 12, y1: base, x2: W - 12, y2: base, class: 'mt-line' }));
  const ticks = [];
  for (let n = 0; n <= T; n++) {
    const g = svgEl('g', { class: 'mt-tick' });
    g.append(svgEl('circle', { cx: x(n), cy: base, r: 9 }));
    const t = svgEl('text', { x: x(n), y: base + 50, 'text-anchor': 'middle' });
    t.textContent = n;
    g.append(t);
    s.append(g);
    ticks.push(g);
  }
  return {
    el: s,
    pairs,
    light(i) { arcs[i].classList.add('on'); ticks[pairs[i][0]].classList.add('paired'); ticks[pairs[i][1]].classList.add('paired'); },
    mark(n, on) { ticks[n].classList.toggle('mark', on); },
    clearMarks() { ticks.forEach((t) => t.classList.remove('mark')); },
    full() { s.classList.add('full'); },
  };
}

function frameEl(T, k) {
  const el = h('div', { class: `frame mt-frame${T === 5 ? ' five' : ''}` });
  const cells = [];
  for (let i = 0; i < T; i++) {
    const c = h('div', { class: `cell${i >= k ? ' empty target' : ''}` }, i < k ? pic('ladybug') : null);
    el.append(c);
    cells.push(c);
  }
  return { el, cells };
}

function choicesFor(m, T) {
  const near = shuffle([m - 1, m + 1, m - 2, m + 2].filter((v) => v >= 1 && v <= T && v !== m));
  return shuffle([m, near[0], near[1]]);
}

const keyToNumber = (k) => (k === '0' ? 10 : /^[1-9]$/.test(k) ? Number(k) : undefined);

async function pairItem(ctx, cfg, rb, idx, first) {
  const { fb, level } = ctx;
  const T = cfg.total;
  const [a, b] = rb.pairs[idx];
  // a is the smaller part. Pose 0|T as "0 and how many", never "T and how many".
  let k;
  if (a === 0) k = 0;
  else if (cfg.from === 'big') k = b;
  else k = Math.random() < 0.5 ? a : b;
  const m = T - k;

  const left = h('div', { class: 'mt-left' });
  let frame = null;
  let sumQ = null;
  if (cfg.sum) {
    sumQ = h('span', { class: 'q' }, '?');
    left.append(h('div', { class: 'mt-sum' }, h('span', {}, k), ' + ', sumQ, ' = ', h('span', {}, T)));
  } else {
    frame = frameEl(T, k);
    left.append(frame.el);
  }
  const btns = choicesFor(m, T).map((v) => ({ el: h('button', { class: 'numbtn target' }, v), value: v }));
  left.append(h('div', { class: 'mt-choices' }, btns.map((x) => x.el)));
  ctx.root.replaceChildren(h('div', { class: 'mt-wrap' }, left, h('div', { class: 'mt-right' }, rb.el)));
  rb.clearMarks();
  rb.mark(k, true);

  const ask = cfg.sum ? [num(k), 'mt-and-how-many', num(T, '?')] : ['mt-fill-q'];
  ctx.instruct(first ? ['mt-new-rainbow', ...ask] : ask);

  let added = 0; // butterflies she has put in by clicking empty squares
  const fillNext = () => {
    const c = frame.cells[k + added];
    c.classList.remove('empty', 'target');
    c.append(pic('butterfly'));
    added++;
  };
  const keys = (key) => { const v = keyToNumber(key); return btns.some((x) => x.value === v) ? v : undefined; };
  let misses = 0;
  for (;;) {
    const cellTargets = frame ? frame.cells.slice(k + added).map((el) => ({ el, value: 'cell' })) : [];
    const v = await ctx.pick({ targets: [...btns, ...cellTargets], keys });
    if (v === 'cell') {
      // Clicking an empty square fills the next one and counts it: a way to work it out.
      fb.tok();
      fillNext();
      ctx.say([num(added)]);
      continue;
    }
    if (v === m) break;
    misses++;
    fb.softMiss();
    if (misses === 1) {
      ctx.say(cfg.sum ? ['mt-count-on-from', num(k, '.')] : ['mt-click-empty']);
      ctx.setInstruction(ask);
    } else {
      // Count the missing part together, one at a time, then light the answer.
      if (cfg.sum) {
        for (let j = k + 1; j <= T; j++) { rb.mark(j, true); await ctx.sayPaced([num(j)], 750); }
        await ctx.sayPaced(['mt-thats', num(m), 'mt-more'], 1300);
      } else {
        await ctx.sayPaced(['ql-count-together'], 900);
        for (let j = 0; j < m; j++) {
          frame.cells[k + j].classList.add('counted');
          await ctx.sayPaced([num(j + 1)], 750);
        }
      }
      fb.glow(btns.find((x) => x.value === m).el, true);
      ctx.instruct(['ui-click', num(m, '.')]);
    }
  }
  fb.tok();
  btns.forEach((x) => fb.glow(x.el, false));
  if (frame) while (added < m) fillNext();
  if (sumQ) { sumQ.textContent = m; sumQ.classList.add('done'); }
  rb.light(idx);
  level.record(misses === 0, `mt-${T}-${k}`);
  const fact = [num(k), 'mt-and', num(m), 'mt-make', num(T, '.')];
  if (misses === 0) {
    await ctx.say([...fact, fb.vary('mt', ['praise-mt-1', 'praise-mt-2'])]);
    ctx.celebrate();
  } else await ctx.say(fact);
  await ctx.wait(1500);
}

export default {
  id: 'make-ten',
  nameKey: 'act-make-ten',
  label: 'Make Ten',
  icon,
  steps: STEPS,
  grownUp: {
    ask: 'Point at an arc. "Which two numbers does this one join? What do they make?"',
    offscreen: 'Hold up ten fingers. Fold some down: "How many are hiding?"',
  },
  async run(ctx) {
    for (;;) {
      const cfg = ctx.level.cfg; // one rainbow keeps its step to the end
      const rb = makeRainbow(cfg.total);
      const order = shuffle(rb.pairs.map((_, i) => i));
      for (const [n, idx] of order.entries()) await pairItem(ctx, cfg, rb, idx, n === 0);
      rb.clearMarks();
      rb.full();
      await ctx.sayPaced(['mt-rainbow', 'mt-every-pair', num(cfg.total, '.')], 2600);
      await ctx.wait(3000);
      await ctx.roundEnd();
    }
  },
};
