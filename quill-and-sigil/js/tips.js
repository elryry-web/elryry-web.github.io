/* =====================================================================
   Tips — small parchment notes that point at one thing at a time (First Breath only, since v141).
   Each tip has: when() — may it show now; at() — the screen rect it points at;
   done() — finished by doing what it asks (else it has a "Got it" button).
   A tip is remembered once finished (localStorage quillsigil.tips); one whose moment passes
   unfinished (the grimoire closes, say) simply waits for its moment to come again.
   The Folio screen's "Show the tips again" forgets them all.
   ===================================================================== */
const Tips = (() => {
  const KEY = 'quillsigil.tips', OFF = 'quillsigil.tipsOff';
  let seen = new Set(), off = false;
  try { seen = new Set(JSON.parse(localStorage.getItem(KEY)) || []); off = localStorage.getItem(OFF) === '1'; } catch (e) { }
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify([...seen])); localStorage.setItem(OFF, off ? '1' : ''); } catch (e) { } };

  /* ---------- what the tips can point at ---------- */
  const elRect = sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const worldRect = (x, y, z, rad = 26) => { const [px, py] = proj(x, y, z); return { x: px - rad, y: py - rad, w: rad * 2, h: rad * 2, round: true }; };
  const orb = () => World.bodies.find(b => b.kind === 'orb' && b.alive);
  const orbRect = () => { const b = orb(); return b && worldRect(b.x, b.y, b.z + (b.hgt || 0.5) * 0.5, 30 * cam.s + 8); };
  const cellRect = c => c && worldRect(c.x + 0.5, c.y + 0.5, (c.h || 0) + 0.4, 30 * cam.s + 8);
  const font = () => World.fonts[0];
  // the small circle whose sign points the wind from the orb toward the font
  const slotToFont = () => {
    const b = orb(), f = font(); if (!b || !f) return 1;
    const dx = f.x + 0.5 - b.x, dy = f.y + 0.5 - b.y, L = Math.hypot(dx, dy) || 1;
    let best = 1, bd = -2;
    for (let k = 0; k < 8; k++) { const d = pageToWorldDir(Math.cos(k * TAU / 8), Math.sin(k * TAU / 8)), dot = (d.x * dx + d.y * dy) / L; if (dot > bd) { bd = dot; best = k; } }
    return best;
  };

  /* ---------- when ---------- */
  // Only the first lesson has tips: a walk through drawing and casting one spell. Everything later is taught by the
  // lesson notes, and the Hint button (a nudge, then the master's hint) helps on demand.
  const first = () => !!(Game.level && Game.level.name === 'First Breath');
  const play = () => first() && Game.state === 'play' && !document.querySelector('.screen.show,.card.show');
  const page = () => first() && Game.state === 'draw' && Grim.open && !Game.notesOpen() && !Game.satchelOpen();
  const D = () => Grim.draft.a;
  const spell = () => { const a = D(); return a.seal && a.sigil && a.sigil.ok && !buildSpell(Grim.draft, lessonRules()).err; };
  const touch = () => isTouch();

  /* ---------- the tips, in the order they may appear ---------- */
  const T = [
    { id: 'orb', when: () => play() && !Game.casts, at: orbRect,
      text: 'This is the orb, a mote of light fallen from its font.' },
    { id: 'font', when: () => play() && !Game.casts, at: () => cellRect(font()),
      text: 'And this is the font. Bring the orb home to it to finish the lesson.' },
    { id: 'grimoire', when: () => play() && !Game.casts, at: () => elRect('#bGrimoire'),
      text: () => 'Spells are drawn, not chosen. Open the grimoire to write one' + (touch() ? '.' : ' (or press Space).'),
      done: () => Game.state === 'draw' },
    { id: 'page.seal', when: () => page() && !D().seal, at: () => Grim.anchor('guide'),
      text: () => D().loneSigil ? 'Now the seal: one closed circle around your sigil, drawn roughly on the dotted ring.' : 'Begin with the seal: one closed circle, drawn roughly on the dotted ring. (The sigil may come first or after.)',
      done: () => !!D().seal },
    { id: 'page.sigil', when: () => page() && D().seal && !(D().sigil && D().sigil.ok), at: () => Grim.anchor('centre'),
      enter: () => { if (!Grim.ghost) { Grim.ghost = 'gale'; Grim.inkDirty = true; } },
      text: 'Inside the seal, draw the sigil. Ventus is a spiral: follow its faint trace.',
      done: () => !!(D().sigil && D().sigil.ok) },
    { id: 'page.sign', when: () => page() && D().sigil && D().sigil.ok && D().sigil.id === 'gale' && !D().signs.length, at: () => Grim.anchor('slot:' + slotToFont()),
      text: 'Now the sign: one stroke from the ring outward, through one of the small circles. The wind blows that way, so point it toward the font.',
      done: () => D().signs.length > 0 },
    { id: 'page.inscribe', when: () => page() && spell(), at: () => elRect('#pInscribe'),
      text: () => 'The line under the seal reads your spell back to you. Inscribe takes it up, ready to cast' + (touch() ? '.' : ' (or press Enter).'),
      done: () => Game.state === 'aim' },
    { id: 'aim', when: () => first() && Game.state === 'aim' && Game.held && Game.held.sigil === 'gale', at: orbRect,
      text: () => touch() ? 'Now choose where it falls. The wind takes what lies inside its circle: drag onto the orb, then press Cast here.'
        : 'Now choose where it falls. The wind takes what lies inside its circle, so click right on the orb.',
      done: () => Game.state !== 'aim' },
  ];

  /* ---------- the note and its ring ---------- */
  let cur = null, waitT = 0, box, ring, txt, okBtn;
  function build() {
    box = document.createElement('div'); box.id = 'tip';
    box.innerHTML = '<div class="tiptext"></div><div class="tiprow"><button class="tipskip">no more tips</button><button class="btn tipok">Got it</button></div><i class="tiparrow"></i>';
    ring = document.createElement('div'); ring.id = 'tipring';
    document.body.append(ring, box);
    txt = box.querySelector('.tiptext'); okBtn = box.querySelector('.tipok');
    okBtn.onclick = () => { finish(); Sfx.play('tick'); };
    box.querySelector('.tipskip').onclick = () => { off = true; store(); hide(); };
  }
  function finish() { if (!cur) return; seen.add(cur.id); store(); hide(); }
  function hide() { cur = null; if (box) { box.classList.remove('show'); ring.classList.remove('show'); } }
  function show(tip) {
    cur = tip; if (tip.enter) tip.enter();
    txt.textContent = typeof tip.text === 'function' ? tip.text() : tip.text;
    okBtn.style.display = tip.done ? 'none' : '';
    box.classList.add('show'); ring.classList.add('show');
    Sfx.play('tick');
  }
  // the place for the note: beside its target, inside the screen, clear of the target and (on the page) of the drawing circle
  function place(R) {
    const vw = innerWidth, vh = innerHeight, m = 10, gap = 16;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    // on the page, keep off the seal itself (where the ink goes); the ring of small circles may be covered a little
    const gd = page() ? Grim.anchor('guide') : null, avoid = gd && { x: gd.x - gd.w * 0.12, y: gd.y - gd.h * 0.12, w: gd.w * 1.24, h: gd.h * 1.24 };
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const cands = [
      ['below', cx - bw / 2, R.y + R.h + gap], ['above', cx - bw / 2, R.y - gap - bh],
      ['right', R.x + R.w + gap, cy - bh / 2], ['left', R.x - gap - bw, cy - bh / 2],
    ];
    // on the page, the note may also stand clear of the whole drawing circle, above or below it (upright phones)
    if (avoid) cands.push(['above', cx - bw / 2, avoid.y - gap - bh], ['below', cx - bw / 2, avoid.y + avoid.h + gap]);
    // a phone on its side: the column beside the drawing circle
    const SD = page() && Grim.L.side;
    if (SD) cands.push(['right', SD.x + (SD.w - bw) / 2, SD.y + 4]);
    const over = (ax, ay, aw, ah, b) => !b ? 0 : Math.max(0, Math.min(ax + aw, b.x + b.w) - Math.max(ax, b.x)) * Math.max(0, Math.min(ay + ah, b.y + b.h) - Math.max(ay, b.y));
    let best = null;
    for (const [side, x0, y0] of cands) {
      const x = clamp(x0, m, vw - bw - m), y = clamp(y0, m, vh - bh - m);
      // and stay near what it points at
      const far = Math.hypot(Math.max(0, R.x - (x + bw), x - (R.x + R.w)), Math.max(0, R.y - (y + bh), y - (R.y + R.h)));
      const score = over(x, y, bw, bh, R) * 3 + over(x, y, bw, bh, avoid) + (Math.abs(x - x0) + Math.abs(y - y0)) * 2 + far * 40;
      if (!best || score < best.score) best = { side, x, y, score };
    }
    box.style.left = best.x + 'px'; box.style.top = best.y + 'px';
    box.dataset.side = best.side;
    const ar = box.querySelector('.tiparrow');
    if (best.side === 'below' || best.side === 'above') { ar.style.left = clamp(cx - best.x, 18, bw - 18) + 'px'; ar.style.top = ''; }
    else { ar.style.top = clamp(cy - best.y, 18, bh - 18) + 'px'; ar.style.left = ''; }
    const pad = 6;
    Object.assign(ring.style, { left: R.x - pad + 'px', top: R.y - pad + 'px', width: R.w + pad * 2 + 'px', height: R.h + pad * 2 + 'px', borderRadius: R.round ? '50%' : '10px' });
  }

  function update(dt) {
    if (!box) build();
    if (off || !Game.level || Game.state === 'won' || Game.state === 'title' || Game.state === 'menu') { if (cur) hide(); return; }
    if (cur) {
      if (cur.done && cur.done()) { finish(); waitT = 0; return; }
      const R = cur.when() ? cur.at() : null;
      if (!R) { hide(); return; }
      const t = typeof cur.text === 'function' ? cur.text() : cur.text; // a note may change its words as you draw
      if (txt.textContent !== t) txt.textContent = t;
      place(R);
      return;
    }
    // a short pause before the next note, so they do not tumble out on top of one another
    const next = T.find(t => !seen.has(t.id) && t.when() && t.at());
    if (!next) { waitT = 0; return; }
    waitT += dt;
    if (waitT < 0.45) return;
    waitT = 0; show(next); place(next.at());
  }
  function reset() { seen = new Set(); off = false; store(); hide(); }
  return { update, reset, hide, get current() { return cur && cur.id; }, list: T };
})();
