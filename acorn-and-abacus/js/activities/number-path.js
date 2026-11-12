// Number Path: a linear board game (Siegler & Ramani). Spin, then click each next square;
// every square says its number. Play with a grown-up beside her, or with Pip.
import { h, rand, shuffle, num } from '../ui.js';
import { pic } from '../art.js';

const STEPS = [
  { label: '1 to 20 in one row, spinner 1-2', size: 20, spin: 2 },
  { label: '1 to 20 in one row, spinner 1-3', size: 20, spin: 3 },
  { label: '1 to 20, guess where you will land', size: 20, spin: 3, predict: true },
  { label: '1 to 50 in rows of ten, spinner 1-5', size: 50, spin: 5 },
  { label: '1 to 100 in rows of ten, spinner 1-10', size: 100, spin: 10 },
];

const TOKENS = [
  { pic: '🏎️', key: 'np-tok-car', label: 'Race car' },
  { pic: 'monster-truck', key: 'np-tok-truck', label: 'Monster truck' },
  { pic: '🦄', key: 'np-tok-unicorn', label: 'Unicorn' },
];

function icon() {
  const path = h('div', { class: 'pic-path' });
  [1, 2, 3, 4, 5].forEach((n) => path.append(h('span', { class: `sq${n === 3 ? ' on' : ''}` }, n === 3 ? pic('🏎️') : null, n)));
  return path;
}

// A still spinner: N numbered slices; the chosen slice and the middle show the result.
function spinnerSvg(N, chosen) {
  const R = 100;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2;
    const am = (a0 + a1) / 2;
    const fill = i + 1 === chosen ? '#f2c84b' : i % 2 ? '#e2efcf' : '#fffcf2';
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const d = N === 1 ? `M0 -${R} A${R} ${R} 0 1 1 -0.01 -${R} Z`
      : `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${big} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
    parts.push(`<path d="${d}" fill="${fill}" stroke="#8a6a45" stroke-width="2.5"/>`);
    parts.push(`<text x="${70 * Math.cos(am)}" y="${70 * Math.sin(am) + 9}" font-size="${N > 6 ? 24 : 30}" text-anchor="middle" font-weight="700" fill="#5a4126">${i + 1}</text>`);
  }
  parts.push(`<circle r="38" fill="#fffcf2" stroke="#8a6a45" stroke-width="3"/>`);
  if (chosen) parts.push(`<text y="20" font-size="58" text-anchor="middle" font-weight="700" fill="#5a4126">${chosen}</text>`);
  else parts.push(`<path d="M-4 -20 L4 -20 L4 8 L14 8 L0 26 L-14 8 L-4 8 Z" fill="#8a6a45"/>`);
  return `<svg viewBox="-104 -104 208 208">${parts.join('')}</svg>`;
}

async function chooseMode(ctx) {
  const gu = h('button', { class: 'np-mode target' }, h('div', { class: 'faces' }, pic('🐞')), h('small', {}, 'With a grown-up'));
  const pip = h('button', { class: 'np-mode target' }, h('div', { class: 'faces' }, pic('🐈')), h('small', {}, 'With Pip'));
  ctx.root.replaceChildren(h('div', { class: 'np-choose' }, gu, pip));
  ctx.hover(gu, ['np-with-grownup']);
  ctx.hover(pip, ['np-with-guide']);
  ctx.instruct(['np-who']);
  const v = await ctx.pick({ targets: [{ el: gu, value: 'gu' }, { el: pip, value: 'pip' }] });
  ctx.fb.tok();
  return v;
}

async function chooseToken(ctx) {
  const btns = TOKENS.map((t) => {
    const b = h('button', { class: 'np-token target', 'aria-label': t.label }, pic(t.pic), h('small', {}, t.label));
    ctx.hover(b, [t.key]);
    return { el: b, value: t };
  });
  ctx.root.replaceChildren(h('div', { class: 'np-choose' }, btns.map((b) => b.el)));
  ctx.instruct(['np-pick-token']);
  const t = await ctx.pick({ targets: btns });
  ctx.fb.tok();
  return t;
}

async function playGame(ctx, mode, token) {
  const { level, fb } = ctx;
  const cfg = level.cfg; // the board stays the same for the whole game
  const size = cfg.size;
  const paged = size > 50;
  const kid = { kind: 'kid', name: 'You', tok: token.pic, pos: 0, done: false };
  const other = mode === 'pip'
    ? { kind: 'pip', name: 'Pip', tok: '🐈', pos: 0, done: false }
    : { kind: 'gu', name: 'Grown-up', tok: '🐞', pos: 0, done: false };
  const players = [kid, other];

  // ---- top: players, spinner, answer buttons ----
  const rows = players.map((p) => {
    const where = h('span', {}, '');
    const el = h('div', { class: 'np-player' }, pic(p.tok), h('span', {}, p.name, ': ', where));
    return { p, el, where };
  });
  const spinner = h('button', { class: 'np-spinner target waiting', 'aria-label': 'Spinner' });
  spinner.innerHTML = spinnerSvg(cfg.spin, 0);
  const choices = h('div', { class: 'np-choices' });
  const board = h('div', { class: 'np-board' });
  ctx.root.replaceChildren(
    h('div', { class: 'np-top' }, h('div', { class: 'np-players' }, rows.map((r) => r.el)), spinner, choices),
    board);

  // ---- board ----
  const sq = [];
  const visited = new Set();
  let page = -1;
  let offMark = null; // the chip at the page edge for a player on the other page
  function drawBoard(pg) {
    const turned = page >= 0 && pg !== page;
    const forward = pg > page;
    page = pg;
    sq.length = 0;
    offMark = null;
    if (size <= 20) {
      const row = h('div', { class: 'np-row' });
      for (let n = 0; n <= size; n++) row.append(square(n));
      board.replaceChildren(row);
    } else {
      const lo = pg * 50;
      const grid = h('div', { class: `np-grid${paged ? ' paged' : ''}` });
      offMark = paged ? h('div', { class: 'np-off' }) : null;
      for (let r = 0; r < 5; r++) {
        if (r === 0) grid.append(square(lo));
        // Page 2: the chip for a player still on page 1 sits under the dashed 50, before the first square.
        else if (r === 1 && pg === 1) grid.append(offMark);
        else grid.append(h('div'));
        for (let c = 1; c <= 10; c++) grid.append(square(lo + r * 10 + c));
        // Page 1: the chip for a player already on page 2 sits beyond 50, the last square.
        if (paged) grid.append(r === 4 && pg === 0 ? offMark : h('div'));
      }
      if (turned) grid.classList.add(forward ? 'turn-fwd' : 'turn-back');
      board.replaceChildren(grid, h('div', { class: 'np-page' }, paged ? (pg === 0 ? '1 to 50' : '51 to 100') : ''));
    }
    drawTokens();
  }
  function square(n) {
    const first = n === 0 || (paged && n === page * 50);
    const cls = ['np-sq'];
    if (first) cls.push('start'); else cls.push('target');
    if (n === size) cls.push('end');
    if (Math.floor((n - 1) / (size <= 20 ? 1 : 10)) % 2) cls.push('alt');
    if (visited.has(n) && !first) cls.push('visited');
    const el = h('div', { class: cls.join(' ') }, h('div', { class: 'toks' }), n === 0 ? 'Start' : n);
    sq[n] = el;
    return el;
  }
  function drawTokens() {
    for (const el of sq) if (el) el.querySelector('.toks').replaceChildren();
    for (const p of players) if (sq[p.pos]) sq[p.pos].querySelector('.toks').append(pic(p.tok));
    for (const r of rows) r.where.textContent = r.p.pos ? String(r.p.pos) : 'Start';
    if (offMark) {
      const away = players.filter((p) => !sq[p.pos]);
      offMark.replaceChildren(...away.map((p) => h('div', { class: 'np-off-chip' }, pic(p.tok),
        h('span', {}, page === 0 ? `${p.name} ${p.pos} →` : `← ${p.name} ${p.pos}`))));
    }
  }
  const pageFor = (n) => (paged && n > 50 ? 1 : 0);
  // Mid-count: let her see the token land on 50, then turn the page for 51.
  async function showSquare(n) {
    if (pageFor(n) === page) return;
    await ctx.wait(700);
    drawBoard(pageFor(n));
    await ctx.wait(450);
  }
  // A turn starts on the page of the player whose turn it is (on 50, the second page, where 50 is the doorway).
  async function showTurn(p) {
    const pg = paged && p.pos >= 50 ? 1 : 0;
    if (pg === page) return;
    drawBoard(pg);
    await ctx.wait(450);
  }
  const setActive = (p) => rows.forEach((r) => r.el.classList.toggle('active', r.p === p));
  drawBoard(0);
  if (window.__aa) window.__aa.np = { kid, other, showTurn, drawBoard, get page() { return page; } }; // testing handle

  // Spin: show the result on the still spinner.
  const doSpin = (p) => {
    const n = Math.min(rand(1, cfg.spin), size - p.pos);
    spinner.innerHTML = spinnerSvg(cfg.spin, Math.min(n, cfg.spin));
    return n;
  };
  const resetSpinner = () => { spinner.innerHTML = spinnerSvg(cfg.spin, 0); };

  // Click each square from p.pos+1 for n squares. Returns the number of wrong clicks.
  async function countOn(p, n, hints) {
    let misses = 0;
    for (let i = 0; i < n; i++) {
      const target = p.pos + 1;
      await showSquare(target);
      let tries = 0;
      for (;;) {
        const targets = sq.map((el, k) => (el && k !== page * 50 ? { el, value: k } : null)).filter(Boolean);
        const v = await ctx.pick({ targets });
        if (v === target) break;
        tries++;
        misses++;
        fb.softMiss();
        if (!hints) continue;
        if (tries === 1) ctx.say(p.pos === 0 ? ['np-at-start'] : ['np-youre-on', num(p.pos, '.'), 'np-what-next']);
        else {
          fb.glow(sq[target], true);
          ctx.instruct(['np-together', 'ui-click', num(target, '.')]);
        }
      }
      fb.glow(sq[target], false);
      fb.tok();
      p.pos = target;
      visited.add(target);
      sq[target].classList.add('visited');
      drawTokens();
      ctx.say([num(target)]).catch(() => {});
    }
    return misses;
  }

  // Her turn: spin, maybe predict, count on. One level record per turn.
  async function kidTurn() {
    setActive(kid);
    await showTurn(kid);
    spinner.classList.remove('waiting');
    resetSpinner();
    ctx.instruct(['np-your-turn']);
    await ctx.pick({ targets: [{ el: spinner, value: 1 }] });
    spinner.classList.add('waiting');
    const n = doSpin(kid);
    const from = kid.pos;
    const countLine = from === 0 ? ['np-count-from-start'] : ['np-count-on'];
    let ok = true;
    if (cfg.predict && from + n <= size) {
      const land = from + n;
      const opts = shuffle([...new Set([land, land - 1, land + 1, land + 2].filter((x) => x > from && x <= size))].slice(0, 3));
      if (!opts.includes(land)) opts[0] = land;
      const btns = shuffle(opts).map((v) => ({ el: h('button', { class: 'np-choice target' }, v), value: v }));
      choices.replaceChildren(...btns.map((b) => b.el));
      ctx.instruct(['np-you-spun', num(n, '.'), 'np-predict-q']);
      const v = await ctx.pick({ targets: btns });
      if (v === land) {
        fb.tok();
        ctx.say(['np-land-yes']);
      } else {
        ok = false;
        fb.softMiss();
        btns.forEach((b) => fb.glow(b.el, b.value === land));
        ctx.say(['np-start-on', num(from, '.'), 'np-count', num(n), 'np-more']);
      }
      ctx.setInstruction(countLine);
    } else {
      ctx.instruct(['np-you-spun', num(n, '.'), ...countLine]);
    }
    const misses = await countOn(kid, n, true);
    choices.replaceChildren();
    ok = ok && misses === 0;
    level.record(ok, `np-${from}-${n}-${Math.random()}`);
    await ctx.wait(500);
    if (ok) {
      if (cfg.predict) await ctx.say(['praise-np-predict']);
      else if (from === 0) await ctx.say([fb.vary('np-start', ['praise-np-start-1', 'praise-np-start-2'])]);
      else await ctx.say([fb.vary('np-from', ['praise-np-from-1', 'praise-np-from-2']), num(from, '.')]);
      ctx.celebrate();
      await ctx.wait(1300);
    }
  }

  async function grownUpTurn() {
    setActive(other);
    await showTurn(other);
    spinner.classList.remove('waiting');
    resetSpinner();
    ctx.instruct(['np-gu-turn']);
    await ctx.pick({ targets: [{ el: spinner, value: 1 }] });
    spinner.classList.add('waiting');
    const n = doSpin(other);
    ctx.instruct(['np-gu-spun', num(n, '.'), ...(other.pos === 0 ? ['np-count-from-start'] : ['np-count-on'])]);
    await countOn(other, n, true);
    await ctx.wait(700);
  }

  async function pipTurn() {
    setActive(other);
    await showTurn(other);
    resetSpinner();
    await ctx.sayPaced(['np-my-turn'], 1100);
    const n = doSpin(other);
    await ctx.sayPaced(['np-i-spun', num(n, '.')], 1500);
    for (let i = 0; i < n; i++) {
      const target = other.pos + 1;
      await showSquare(target);
      other.pos = target;
      drawTokens();
      await ctx.sayPaced([num(target)], 800);
    }
    await ctx.wait(600);
  }

  const reached = async (p) => {
    p.done = true;
    const key = p.kind === 'kid' ? 'np-reached-you' : p.kind === 'gu' ? 'np-reached-gu' : 'np-reached-me';
    await ctx.sayPaced([key, num(size, '.')], 1600);
  };

  // The game runs until she reaches the end. If the other player gets there first, they wait there.
  while (!kid.done) {
    await kidTurn();
    if (kid.pos >= size) { await reached(kid); break; }
    if (ctx.overTime(3)) break; // well past the break time: finish calmly here
    if (!other.done) {
      if (other.kind === 'pip') await pipTurn(); else await grownUpTurn();
      if (other.pos >= size) await reached(other);
    }
  }
  setActive(null);
  await ctx.sayPaced(['np-good-game'], 2600);
}

export default {
  id: 'number-path',
  nameKey: 'act-number-path',
  label: 'Number Path',
  icon,
  steps: STEPS,
  grownUp: {
    ask: 'Point at both tokens. "Which number is bigger, where you are or where I am? How do you know?"',
    offscreen: 'Count the stairs together. Then start from the third step and count on.',
  },
  async run(ctx) {
    const mode = await chooseMode(ctx);
    ctx.smallCaptions(mode === 'pip');
    for (;;) {
      const token = await chooseToken(ctx);
      await playGame(ctx, mode, token);
      await ctx.roundEnd();
    }
  },
};
