/* =====================================================================
   Tips — small parchment notes that point at one thing at a time.
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
  const firstCell = f => World.cells.find(f);
  // the small circle whose sign points the wind from the orb toward the font
  const slotToFont = () => {
    const b = orb(), f = font(); if (!b || !f) return 1;
    const dx = f.x + 0.5 - b.x, dy = f.y + 0.5 - b.y, L = Math.hypot(dx, dy) || 1;
    let best = 1, bd = -2;
    for (let k = 0; k < 8; k++) { const d = pageToWorldDir(Math.cos(k * TAU / 8), Math.sin(k * TAU / 8)), dot = (d.x * dx + d.y * dy) / L; if (dot > bd) { bd = dot; best = k; } }
    return best;
  };

  /* ---------- when ---------- */
  const lv = name => Game.level && Game.level.name === name;
  const play = () => Game.state === 'play' && !document.querySelector('.screen.show,.card.show');
  const page = () => Game.state === 'draw' && Grim.open && !Game.notesOpen() && !Game.satchelOpen();
  const D = () => Grim.draft.a;
  const spell = () => { const a = D(); return a.seal && a.sigil && a.sigil.ok && !buildSpell(Grim.draft, lessonRules()).err; };
  const maxBarbs = () => Math.max(0, ...D().signs.map(s => s.barbs));
  // an empty small circle of the given timing (red 'now', blue 'along', green 'arrive'), the most squarely placed one
  const slotOf = rel => {
    let best = null, bs = -1;
    for (let k = 0; k < 8; k++) {
      if (Grim.slotRel(k) !== rel || D().signs.some(x => x.pos === k) || D().sats.some(x => x.slot === k)) continue;
      let sx = 0, sy = 0; for (const x of D().signs) { sx += Math.cos(x.pos * TAU / 8); sy += Math.sin(x.pos * TAU / 8); }
      const c = Math.cos(k * TAU / 8 - Math.atan2(sy, sx)), sc = rel === 'arrive' ? c : rel === 'now' ? -c : 1 - Math.abs(c);
      if (sc > bs) { bs = sc; best = k; }
    }
    return best;
  };
  const satNow = () => { const sp = buildSpell(Grim.draft, lessonRules()); if (sp.err) return ''; const m = describeSpell(sp).match(/\+ [^·]+/); return m ? ` (${m[0].trim()})` : ''; };
  const sigilIs = id => !!(D().sigil && D().sigil.ok && D().sigil.id === id);
  // the shape the page is naming right now, e.g. " (a 2-tile wall ↘)"
  const shapeNow = () => { const sp = buildSpell(Grim.draft, lessonRules()); const part = !sp.err && describeSpell(sp).split(' · ')[1]; return part ? ` (${part})` : ''; };
  // the tiles a held placing spell will fill, where it is aimed
  const heldRect = () => {
    if (!Game.aim || !Game.held) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of spellCells(Game.held, Game.aim.x, Game.aim.y)) {
      const c = cellI(x, y), z = c.void ? 0 : surfaceTop(c);
      for (const [px, py] of [proj(x, y, z), proj(x + 1, y, z), proj(x + 1, y + 1, z), proj(x, y + 1, z)]) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    }
    return x1 > x0 ? { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 } : null;
  };
  const touch = () => isTouch();
  let restT = 0; // how long the orb has lain still after a cast, short of the font

  /* ---------- the tips, in the order they may appear ---------- */
  const T = [
    // the world, first lesson
    { id: 'orb', when: () => play() && lv('First Breath') && !Game.casts, at: orbRect,
      text: 'This is the orb, a mote of light fallen from its font.' },
    { id: 'font', when: () => play() && lv('First Breath') && !Game.casts, at: () => cellRect(font()),
      text: 'And this is the font. Bring the orb home to it to finish the lesson.' },
    { id: 'aims', when: () => play() && lv('First Breath') && !Game.casts, at: () => elRect('#objs'),
      text: 'What each lesson asks of you is written here. Each line lights up when it is done.' },
    { id: 'grimoire', when: () => play() && !Game.casts, at: () => elRect('#bGrimoire'),
      text: () => 'Spells are drawn, not chosen. Open the grimoire to write one' + (touch() ? '.' : ' (or press Space).'),
      done: () => Game.state === 'draw' },

    // the page
    { id: 'page.codex', when: () => page() && !Grim.L.single && !D().seal, at: () => Grim.anchor('codex:gale'),
      text: 'The left page holds the lesson and every sigil you have learned. Tap one to see it traced faintly inside the seal.' },
    { id: 'page.notes', when: () => page() && Grim.L.single && !D().seal, at: () => elRect('#pNotes'),
      text: 'Notes turns to the lesson and the sigils you have learned. Tap a sigil there to see it traced inside the seal.' },
    { id: 'page.seal', when: () => page() && !D().seal, at: () => Grim.anchor('guide'),
      text: () => D().loneSigil ? 'Now the seal: one closed circle around your sigil, drawn roughly on the dotted ring.' : 'Begin with the seal: one closed circle, drawn roughly on the dotted ring. (The sigil may come first or after.)',
      done: () => !!D().seal },
    { id: 'page.sigil', when: () => page() && D().seal && !(D().sigil && D().sigil.ok), at: () => Grim.anchor('centre'),
      enter: () => { if (lv('First Breath') && !Grim.ghost) { Grim.ghost = 'gale'; Grim.inkDirty = true; } },
      text: () => lv('First Breath') ? 'Inside the seal, draw the sigil. Ventus is a spiral: follow its faint trace.' : 'Inside the seal, draw a sigil. Tap one you have learned to see its trace.',
      done: () => !!(D().sigil && D().sigil.ok) },
    { id: 'page.sign', when: () => page() && D().sigil && D().sigil.ok && D().sigil.id === 'gale' && !D().signs.length, at: () => Grim.anchor('slot:' + slotToFont()),
      text: 'Now the sign: one stroke from the ring outward, through one of the small circles. The wind blows that way, so point it toward the font.',
      done: () => D().signs.length > 0 },
    { id: 'page.status', when: () => page() && spell(), at: () => Grim.anchor('status'),
      text: 'The page reads your spell back to you here: what it is, how strong, and which way. Read it before you cast.' },
    { id: 'page.inscribe', when: () => page() && spell(), at: () => elRect('#pInscribe'),
      text: () => 'Inscribe takes the spell up, ready to cast' + (touch() ? '.' : ' (or press Enter).'),
      done: () => Game.state === 'aim' },

    // aiming
    { id: 'aim', when: () => Game.state === 'aim' && Game.held && Game.held.sigil === 'gale', at: orbRect,
      text: () => touch() ? 'Now choose where it falls. The wind takes what lies inside its circle: drag onto the orb, then press Cast here.'
        : 'Now choose where it falls. The wind takes what lies inside its circle, so click right on the orb.',
      done: () => Game.state !== 'aim' },

    // a cast that fell short
    { id: 'rewind', when: () => play() && Game.casts > 0 && restT > 1.2 && Game.level.sigils.length === 1, at: () => elRect('#bRewind'),
      text: () => 'Fell short? Rewind takes back your last seal; Restart begins the lesson afresh' + (touch() ? '.' : ' (Z and R).') },
    { id: 'recall', when: () => page() && !Grim.draft.strokes.length && Grim.lastStrokes, at: () => elRect('#pRecall'),
      text: 'Recall lays your last spell back on the page, so you need only change what was wrong.',
      done: () => Grim.draft.strokes.length > 0 },

    // barbs: The Long Meadow and The Rift
    { id: 'barb', when: () => page() && lv('The Long Meadow') && D().signs.length && D().sigil && D().sigil.id === 'gale' && maxBarbs() === 0, at: () => Grim.anchor('sign'),
      text: 'Cross the sign with one short stroke, a barb. Each barb makes the wind firmer.',
      done: () => maxBarbs() >= 1 },
    { id: 'barb2', when: () => page() && lv('The Rift') && D().signs.length && D().sigil && D().sigil.id === 'gale' && maxBarbs() === 1, at: () => Grim.anchor('sign'),
      text: 'A sign can bear a second barb: the strongest wind of all.',
      done: () => maxBarbs() >= 2 },

    // placing spells: Petra's lesson shows that a sign is an arm of the shape, not a push
    { id: 'petra.sign', when: () => page() && lv('From the Abyss') && sigilIs('stone') && !D().signs.length, at: () => Grim.anchor('slot:' + slotToFont()),
      text: 'For Petra a sign is not a push. It is an arm of stone, running out from your mark the way it points. Draw one toward the far island.',
      done: () => D().signs.length > 0 },
    { id: 'petra.read', when: () => page() && sigilIs('stone') && D().signs.length && spell(), at: () => Grim.anchor('status'),
      text: () => `The page names the shape the stone will take${shapeNow()}. A sign reaches one stone beyond your mark; each barb on it, one more.` },
    { id: 'petra.rows', when: () => page() && sigilIs('stone') && D().signs.length && spell(), at: () => Grim.anchor('sign'),
      text: 'The slanted circles (about 2, 4, 8 and 10 o’clock) run along the rows of tiles. Straight up, down, left or right runs corner to corner across them instead.' },
    { id: 'petra.aim', when: () => Game.state === 'aim' && Game.held && Game.held.sigil === 'stone', at: () => heldRect() || elRect('#aimbar'),
      text: () => 'The glowing tiles show where the stone will rise' + (lv('From the Abyss') ? '. Set your mark at the near edge of the gap, so the arm reaches across.' : '.'),
      done: () => Game.state !== 'aim' },
    ...['flame', 'frost', 'tide'].map(id => ({ id: 'placed.' + id, when: () => page() && sigilIs(id) && D().signs.length && spell(), at: () => Grim.anchor('sign'),
      text: () => `${SIGILS[id].name} is placed as Petra is: each sign is an arm of ${{ flame: 'fire', frost: 'ice', tide: 'water' }[id]} running from your mark.` })),

    // Luna: its outer circle doubles the float; its sign only aims what rides on its ring
    { id: 'luna.ring2', when: () => page() && lv('Featherfall II') && sigilIs('luna') && !D().amp, at: () => Grim.anchor('area'),
      text: 'The far island is more than 10 tiles off, farther than an unadorned float carries. Draw a second, larger circle around the whole seal, beyond the small circles, to double it to 20.',
      done: () => !!D().amp },
    // (never in Featherfall: the outer circle is Featherfall II's lesson — shown a lesson early, the player draws it
    // at once and solves the same puzzle twice)
    { id: 'luna.ring', when: () => page() && sigilIs('luna') && !D().amp && !lv('Featherfall') && ringTaught(), at: () => Grim.anchor('area'),
      text: 'What Luna lifts hangs until it has been carried 10 tiles, then settles. A second, larger circle around the whole seal, beyond the small circles, doubles that to 20.' },
    { id: 'luna.hang', when: () => { const b = orb(); return play() && b && b.lev > 0 && b.levRange != null && (b.levAge || 0) > 1.5 && Math.hypot(b.vx, b.vy) < 0.1; }, at: orbRect,
      text: () => `It hangs where the wind left it, with ${Math.max(0, Math.round(orb().levRange))} tiles of float left. Push it again; it waits for you.` },
    { id: 'luna.sign', when: () => page() && sigilIs('luna') && D().signs.length && !D().sats.length, at: () => Grim.anchor('sign'),
      text: 'Luna’s sign moves nothing by itself: it aims only what rides on Luna’s ring. Luna just lifts.' },

    // the satchel, once the player has a few spells behind them
    { id: 'keep', when: () => page() && spell() && sigilIs('gale') && maxBarbs() >= 2, at: () => elRect('#pKeep'),
      text: 'A strong gust is the spell you will cast most. Keep tucks it into your satchel, to cast again later without drawing it anew.' },
    { id: 'hotbar', when: () => play() && Satchel.list.length > 0, at: () => elRect('#hotbar .slot'),
      text: () => 'Kept spells wait here. ' + (touch() ? 'Tap one' : 'Click one, or press its number,') + ' to cast it at once.' },

    // things in the world, the first time each appears
    { id: 'brazier', when: () => play() && World.braziers.some(b => !b.lit), at: () => cellRect(World.braziers.find(b => !b.lit)),
      text: 'A brazier. Every brazier must burn before the lesson is done.' },
    { id: 'bramble', when: () => play() && firstCell(c => c.feat === 'bramble'), at: () => cellRect(firstCell(c => c.feat === 'bramble')),
      text: 'Bramble. Nothing rolls through it, but it burns.' },
    { id: 'crate', when: () => play() && World.bodies.some(b => b.kind === 'crate' && b.alive), at: () => { const b = World.bodies.find(b => b.kind === 'crate' && b.alive); return b && worldRect(b.x, b.y, b.z + 0.4, 30 * cam.s + 8); },
      text: 'A crate: heavy, but the wind can move it, gently.' },
    { id: 'gate', when: () => play() && firstCell(c => c.feat === 'gate'), at: () => cellRect(firstCell(c => c.feat === 'gate')),
      text: 'A rune gate. It sinks only when every brazier burns.' },
    { id: 'stream', when: () => play() && firstCell(c => c.flow && c.water != null && !c.ice), at: () => cellRect(firstCell(c => c.flow && c.water != null && !c.ice)),
      text: 'This stream races toward the edge of the world, and carries off whatever falls in.' },
    { id: 'inkwell', when: () => play() && Game.level && Game.level.ink, at: () => elRect('#inkwell'),
      text: () => 'Your inkwell: each seal you cast spends one drop. When it runs dry, rewind or restart.' },
    // the second folio: ring-sigils, and the colours that tell when each would act
    { id: 'ring.intro', when: () => page() && Game.level && Game.level.combos && D().seal && !D().signs.length, at: () => Grim.anchor('slot:' + ((slotToFont() + 4) % 8)),
      text: 'In this folio a small sigil drawn inside one of these small circles joins your spell. Draw your sign first: the circles then take colours that tell when a sigil in each would act.' },
    ...[['now', 'Red, behind your sign: a sigil here acts at once, as the spell is cast.'],
        ['along', 'Blue, beside your sign: a sigil here acts along the way, while the spell is still moving.'],
        ['arrive', 'Green, ahead of your sign: a sigil here acts on arrival, where the spell comes to rest.']].map(([rel, text]) => ({
      id: 'ring.' + rel, when: () => page() && Game.level && Game.level.combos && slotOf(rel) != null, at: () => Grim.anchor('slot:' + slotOf(rel)), text })),
    { id: 'ring.placed', when: () => page() && Game.level && Game.level.combos && D().sats.some(x => x.ok), at: () => Grim.anchor('slot:' + D().sats.find(x => x.ok).slot),
      text: () => `The page reads it back${satNow()}. Each small circle holds one mark: a sign or a ring-sigil, never both.` },
  ];
  // a new sigil, the first lesson it appears in
  for (const id of ['stone', 'flame', 'tide', 'frost', 'luna']) {
    T.push({ id: 'sigil.' + id, when: () => page() && Game.level && Game.level.sigils.includes(id) && !D().seal,
      at: () => Grim.L.single ? elRect('#pNotes') : Grim.anchor('codex:' + id),
      text: () => `A new sigil: ${SIGILS[id].name}. ${Grim.L.single ? 'Open Notes and tap it' : 'Tap it'} to see its shape traced inside the seal.` });
  }

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
    // how long a cast orb has lain still, short of home
    const b = orb();
    if (Game.state === 'play' && Game.casts > 0 && b && !b.captured && b.lev <= 0 && Math.hypot(b.vx, b.vy) < 0.05) restT += dt; else restT = 0;
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
