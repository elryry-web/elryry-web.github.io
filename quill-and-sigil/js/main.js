'use strict';
/* =====================================================================
   QUILL & SIGIL — main.js
   Audio, lessons, UI flow and the main loop
   ===================================================================== */

/* ---------------- Audio (all synthesized) ---------------- */
const Sfx = {
  ctx: null, muted: false, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.5; this.rev.connect(rg).connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // pen scratch loop
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    this.penF = ctx.createBiquadFilter(); this.penF.type = 'bandpass'; this.penF.frequency.value = 2600; this.penF.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    this.penG = ctx.createGain(); this.penG.gain.value = 0;
    src.connect(this.penF).connect(hp).connect(this.penG).connect(this.master); src.start();
    this.music();
  },
  music() {
    const scale = [293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784];
    const tick = () => {
      if (this.ctx && !this.muted && !document.hidden && Math.random() < 0.7) {
        const f = scale[Math.floor(Math.random() * scale.length)];
        this.tone(f, 2.4, { type: 'sine', vol: 0.03, rev: 1, attack: 0.02 });
        if (Math.random() < 0.3) this.tone(f * 1.5, 2.4, { type: 'sine', vol: 0.015, rev: 1, t: 0.25 });
      }
      setTimeout(tick, 1600 + Math.random() * 2600);
    };
    setTimeout(tick, 1200);
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); },
  tone(f, dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (o.t || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    const v = o.vol || 0.15, a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    if (o.rev) { const rg = c.createGain(); rg.gain.value = o.rev; g.connect(rg).connect(this.rev); }
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },
  noise(dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (o.t || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t0); f.Q.value = o.q || 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    const g = c.createGain(), v = o.vol || 0.2, a = o.attack || 0.01;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    if (o.rev) { const rg = c.createGain(); rg.gain.value = o.rev; g.connect(rg).connect(this.rev); }
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  },
  pen(speed) {
    if (!this.ctx) return;
    const v = speed > 0 ? Math.min(0.11, 0.02 + speed * 0.05) : 0;
    this.penG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    this.penF.frequency.setTargetAtTime(1800 + Math.min(3, speed) * 900, this.ctx.currentTime, 0.03);
  },
  play(name, arg) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 55) return;
    this.last[name] = now;
    switch (name) {
      case 'page': this.noise(0.35, { type: 'highpass', f: 2500, vol: 0.06, attack: 0.05 }); this.noise(0.2, { f: 700, vol: 0.04, t: 0.12 }); break;
      case 'tick': this.tone(1320, 0.12, { vol: 0.06, rev: 0.3 }); break;
      case 'seal': [523.3, 659.3, 784].forEach((f, i) => this.tone(f, 1.6, { vol: 0.07, rev: 0.8, t: i * 0.02 })); break;
      case 'sigil': { const base = { gale: 587, stone: 392, flame: 523, tide: 440, frost: 784, luna: 659 }[arg] || 523; [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, 1.4, { vol: 0.06, rev: 0.9, t: i * 0.07 })); break; }
      case 'sign': this.tone(1046, 0.4, { vol: 0.05, rev: 0.6 }); this.tone(1568, 0.3, { vol: 0.03, rev: 0.6, t: 0.04 }); break;
      case 'smudge': this.noise(0.18, { f: 900, vol: 0.05 }); break;
      case 'fizzle': this.tone(330, 0.5, { type: 'sawtooth', vol: 0.04, f2: 110 }); this.noise(0.4, { type: 'lowpass', f: 600, vol: 0.08 }); break;
      case 'inscribe': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 1.2, { vol: 0.05, rev: 1, t: i * 0.05 })); this.noise(0.6, { type: 'highpass', f: 4000, f2: 9000, vol: 0.04 }); break;
      case 'cast': this.noise(0.9, { f: 300, f2: 2000, vol: 0.06, q: 2, attack: 0.2, rev: 0.4 }); this.tone(196, 1.4, { vol: 0.05, rev: 1, attack: 0.1 }); break;
      case 'gale': this.noise(1.4, { f: 400, f2: 1600, q: 1.5, vol: 0.18, attack: 0.3, rev: 0.4, t: 0.35 }); this.noise(1.0, { f: 1500, f2: 500, q: 3, vol: 0.08, attack: 0.2, t: 0.6 }); break;
      case 'stone': this.tone(80, 0.9, { f2: 38, vol: 0.4, t: 0.42 }); this.noise(1.0, { type: 'lowpass', f: 500, f2: 120, vol: 0.25, attack: 0.02, t: 0.42 }); break;
      case 'flame': this.noise(1.2, { type: 'lowpass', f: 1600, f2: 400, vol: 0.2, attack: 0.08, t: 0.4, rev: 0.2 }); for (let i = 0; i < 9; i++) this.noise(0.04, { type: 'highpass', f: 3000, vol: 0.06, t: 0.45 + Math.random() * 0.9 }); break;
      case 'tide': this.noise(1.4, { type: 'lowpass', f: 700, f2: 1800, vol: 0.18, attack: 0.3, t: 0.35, rev: 0.4 }); for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 500, 0.12, { f2: 900, vol: 0.04, t: 0.5 + i * 0.09 }); break;
      case 'frost': for (let i = 0; i < 9; i++) this.tone(1800 + Math.random() * 2600, 0.6, { vol: 0.035, rev: 1, t: 0.4 + i * 0.05 }); this.noise(0.8, { type: 'highpass', f: 5000, vol: 0.05, t: 0.4 }); break;
      case 'luna': [392, 494, 587, 740].forEach((f, i) => this.tone(f, 2.2, { type: 'triangle', vol: 0.04, rev: 1, attack: 0.15, t: 0.4 + i * 0.08 })); break;
      case 'bump': this.tone(110 + Math.random() * 30, 0.15, { vol: 0.12 * (arg || 0.5), f2: 60 }); this.noise(0.06, { type: 'lowpass', f: 800, vol: 0.06 * (arg || 0.5) }); break;
      case 'catch': this.noise(0.4, { type: 'bandpass', f: 900, f2: 300, vol: 0.06, attack: 0.03 }); break;
      case 'kindle': this.noise(0.8, { type: 'lowpass', f: 400, f2: 1400, vol: 0.12, attack: 0.1 }); this.tone(330, 1.5, { vol: 0.05, rev: 1 }); this.tone(494, 1.5, { vol: 0.04, rev: 1, t: 0.1 }); break;
      case 'gate': this.tone(55, 2.2, { vol: 0.3, f2: 45, attack: 0.3 }); this.noise(2.0, { type: 'lowpass', f: 300, vol: 0.12, attack: 0.3 }); [293.7, 440, 587.3].forEach((f, i) => this.tone(f, 2.5, { vol: 0.05, rev: 1, t: 0.4 + i * 0.15 })); break;
      case 'capture': [659, 880, 1046, 1318].forEach((f, i) => this.tone(f, 1.6, { vol: 0.06, rev: 1, t: i * 0.06 })); break;
      case 'lost': this.tone(880, 1.2, { vol: 0.06, f2: 220, rev: 1 }); break;
      case 'reform': [440, 554, 659].forEach((f, i) => this.tone(f, 1, { vol: 0.05, rev: 1, t: i * 0.05 })); break;
      case 'win': [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 1.8, { type: i % 2 ? 'triangle' : 'sine', vol: 0.07, rev: 1, t: i * 0.13 })); break;
      case 'rewind': this.tone(600, 0.5, { vol: 0.05, f2: 300, rev: 0.6 }); this.noise(0.4, { type: 'highpass', f: 3000, f2: 800, vol: 0.05 }); break;
    }
  },
};

/* ---------------- Lessons ---------------- */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX'];
const LEVELS = [
  {
    name: 'First Breath', sigils: ['gale'], par: 1, opens: 'The First Folio',
    lesson: 'Every spell begins with a seal: one circle, drawn closed. Within it goes the sigil. Ventus, the spiral, calls the wind. Draw a stroke leading out from the ring, through one of the eight small circles around it, and the wind will blow that way. Inscribe the page, then cast it on the orb.',
    hint: 'Circle, a spiral inside, then one stroke out from the ring toward the lower right, the way the font lies from the orb. Cast it right on the orb.',
    t: [' 000000 ', '00000000', '00000000', '00000000', ' 000000 '],
    o: ['........', '........', '.O....G.', '........', '........'],
  },
  // II and III teach barbs on Ventus alone: a plain gust rolls the orb about 5 tiles, one barb about 8, two about 12
  {
    name: 'The Long Meadow', sigils: ['gale'], par: 1,
    lesson: 'The font lies farther off now, and the other way: draw your sign toward it. A plain gust dies in the grass before the orb arrives, so cross your sign with one short stroke, a barb, and the wind blows firmer. If a cast falls short, Rewind takes it back, and Recall lays your last spell on the page again.',
    hint: 'Circle, spiral, and a sign toward the upper left (about 10 o’clock, through the small circle there), then one short stroke across the sign, near its tip. Cast it right on the orb.',
    t: [' 00000000 ', '0000000000', '0000000000', '0000000000', ' 00000000 '],
    o: ['..........', '..........', '.G......O.', '..........', '..........'],
  },
  {
    name: 'The Rift', sigils: ['gale'], par: 1,
    lesson: 'A crack splits the meadow. A gentle gust stops short of it and a firm one rolls the orb in; only a strong wind carries it across in one bound. A sign bears two barbs at most, the strongest wind Ventus can make.',
    hint: 'Ventus with a sign toward the upper right (about 2 o’clock, through the small circle there), crossed by two short barbs. Cast it right on the orb.',
    t: [' 000 ', '00000', '00000', '00000', '     ', '00000', '00000', '00000', '00000', '00000', '00000', ' 000 '],
    o: ['.....', '..G..', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '..O..', '.....'],
  },
  {
    name: 'From the Abyss', sigils: ['gale', 'stone'], par: 2,
    lesson: 'Petra, the square, raises stone, even out of empty air. Unadorned, it sets one pillar on your mark. Here a sign is no push, as it was for the wind: it is an arm of stone, running out from your mark the way it points, and each barb adds a stone. Opposite signs raise one wall through your mark; signs at right angles, the block between them. Fire, ice and water are placed the same way.',
    hint: 'Petra with one sign toward the lower right, cast on the near side of the gap. Then Ventus on the orb, its sign crossed by one barb.',
    t: [' 000  0000 ', '0000  00000', '0000  00000', '0000  00000', ' 000  0000 '],
    o: ['...........', '...........', '.O.......G.', '...........', '...........'],
  },
  {
    name: 'Thornwall', sigils: ['gale', 'stone', 'flame'], par: 2,
    lesson: 'Ignis, the triangle, wakes fire. Bramble burns, and fire spreads along whatever will burn, so mind where it leads. The brazier must also be lit before this lesson is done.',
    hint: 'A single Ignis on the hedge: the flames crawl along it to the brazier by themselves. Then Ventus with a twice-barbed sign.',
    t: ['  00000000  ', ' 0000000000 ', '000000000000', ' 0000000000 ', '  00000000  '],
    o: ['.......#B...', '.......#....', '.O.....#..G.', '.......#....', '.......#....'],
  },
  {
    name: 'Keystone', sigils: ['gale', 'flame'], par: 3,
    lesson: 'A crate fits a trench as a keystone fits an arch, and Ventus moves heavy things as well as light ones, though only gently. The crate is wood, and wood burns.',
    hint: 'One sign of Ventus nudges the crate into the trench. Burn the hedge (away from the crate!), then a sign with two barbs carries the orb across.',
    t: [' 00000_0000 ', '000000_00000', '000000_00000', '000000_00000', ' 00000_0000 '],
    o: ['........#...', '........#...', '.O...C..#.G.', '........#...', '........#...'],
  },
  {
    name: 'The Sunken Orb', sigils: ['gale', 'tide'], par: 2,
    lesson: 'Unda, the wave, calls water, as much as the shape you give it: each tile of your spell brings one tile of water, one step deep. It runs to the lowest place and spreads across the whole hollow, and whatever is light enough rises with it. Pour too little and the hollow is only part full; too much and the rest spills away.',
    hint: 'The hollow is four tiles wide and one step deep, so it wants four tiles of water: Unda with two signs at right angles along the tiles (2 and 4 o’clock), cast on the hollow. When the orb floats level with the ground, Ventus with a sign and one barb.',
    t: [' 00000000 ', '00__000000', '00__000000', '0000000000', ' 00000000 '],
    o: ['..........', '..........', '...O....G.', '..........', '..........'],
  },
  {
    name: 'The Rushing Stream', sigils: ['gale', 'tide', 'frost'], par: 2,
    lesson: 'Gelu, the star, stills what moves. Frozen water bears weight, and ice runs swift beneath a rolling orb.',
    hint: 'Gelu cast on the middle of the stream with two opposite signs along the orb’s way (lower right and upper left): a path of ice three tiles long, bank to bank. Then Ventus with a sign and one or two barbs.',
    t: ['0000~~~00000', '0000~~~00000', '0000~~~00000', '0000~~~00000', '0000~~~00000'],
    o: ['............', '............', '.O........G.', '............', '............'],
    flows: [{ x0: 4, x1: 6, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  {
    name: 'Featherfall', sigils: ['gale', 'luna'], par: 2,
    lesson: 'Luna, the crescent, lifts what rests, and only lifts. A floating thing hangs where it rose until wind or water moves it, then glides, untroubled by the ground below, and settles once it has been carried ten tiles.',
    hint: 'Luna on the orb. While it floats, Ventus on the orb with a barbed sign toward the island (lower right). A gentle gust leaves it hanging short in the air; push it again.',
    t: [' 0000    111 ', '00000    1111', '00000    1111', '00000    1111', ' 0000    111 '],
    o: ['.............', '.............', '.O........G..', '.............', '.............'],
  },
  {
    name: 'Featherfall II', sigils: ['gale', 'luna'], par: 3,
    lesson: 'What Luna lifts hangs where the wind leaves it, and settles only once it has been carried ten tiles. The far island lies farther off than that. Draw a second, larger circle around Luna’s seal and the float carries twice as far. Then push the orb as often as you need; it waits in the air for you.',
    hint: 'Luna on the orb, with a second, larger circle around the seal. Then Ventus on the floating orb toward the far island (lower right), with a barbed sign, and again when it stops short.',
    t: ['000           000 ', '000           0000', '000           0000', '000           0000', '000           000 '],
    o: ['..................', '..................', '.O.............G..', '..................', '..................'],
  },
  {
    name: 'The Rune Gate', sigils: ['gale', 'stone', 'flame', 'frost'], par: 3,
    lesson: 'The rune gate sinks only when every brazier burns. Fire melts ice.',
    hint: 'Ignis cast on the ice beside the orb, with a sign toward the thorns (lower right): it melts the ice and kindles the hedge at once, and the fire runs to both braziers. Gelu on the stream with a sign the same way, then Ventus with a twice-barbed sign.',
    t: ['00000~~00000', '00000~~00000', '00000~~00222', '00000~~00002', '00000~~00222', '00000~~00000', '00000~~00000'],
    o: ['...B........', '...#........', '..I#........', '.OI#.....DG.', '..I#........', '...#........', '...B........'],
    flows: [{ x0: 5, x1: 6, y0: 0, y1: 6, dx: 0, dy: 1, s: 3 }],
  },
  {
    name: 'The Broad Water', sigils: ['gale', 'frost'], par: 2, ring: true,
    lesson: 'Around Luna the second circle made the float last longer; around other seals it spreads the spell wider: a broader gust, a path of frost three tiles wide, a wall three stones thick. It adds breadth, not strength. An unadorned Gelu stills a single tile, or three by three with the ring, and this river is broader still.',
    hint: 'Gelu cast in the middle of the river with two opposite signs across it (lower right and upper left), each crossed by one barb, and a second, larger circle around the whole seal: a path of ice from bank to bank, three wide. Then Ventus with a twice-barbed sign.',
    t: ['0000~~~~~0000', '0000~~~~~0000', '0000~~~~~0000', '0000~~~~~0000', '0000~~~~~0000'],
    o: ['.............', '.............', '.O.........G.', '.............', '.............'],
    flows: [{ x0: 4, x1: 8, y0: 0, y1: 4, dx: 0, dy: 1, s: 3.5 }],
  },
  {
    name: 'Skyward', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 7,
    folioEnd: { title: 'The First Folio is Complete', text: 'The light is home. The master turns to a second folio, where small sigils wait in the margins.' },
    lesson: 'The last page of the first folio. It takes everything you have learned, in the order the land needs it. Read the land before you draw.',
    hint: 'Unda with a 2×2 pool (signs at 2 and 4 o’clock) floats the orb from its four-tile hollow. Burn the hedge, freeze the stream (Gelu with a sign along the orb’s way), and roll the orb gently (one barb, no more) to the low wall. Light the island brazier, then lift the orb with Luna and let a gentle Ventus carry it through the gate.',
    t: [' 000000~~001    ', '2222000~~001 111', '2112000~~001 333', '2112000~~001 113', '2222000~~001 333', '0000000~~001 111', '0000000~~001 111', ' 000000~~001    '],
    o: ['.....#..........', '.....#..........', '.....#..........', '..O..#.......DG.', '.....#..........', '.....#........B.', '.....#..........', '.....#..........'],
    flows: [{ x0: 7, x1: 8, y0: 0, y1: 7, dx: 0, dy: 1, s: 3 }],
  },
  {
    name: 'Torchbearer', sigils: ['gale', 'flame'], par: 1, ink: 1, combos: true, opens: 'The Second Folio',
    lesson: 'The second folio: ring-sigils. Draw a small sigil inside one of the eight slots around your seal and it infuses the spell: the centre acts first, then the ring. Ventus carrying Ignis sends a burning orb that sets alight whatever it touches. From now on your inkwell is measured, and each cast spends a seal’s worth: here you have ink for one seal only.',
    hint: 'Ventus in the centre with a sign toward the font crossed by two barbs, and a small Ignis in the slot opposite the sign (behind = at once).',
    t: [' 000000000000 ', '01111011111110', '00000000000000', '01111111111110', ' 000000000000 '],
    o: ['..............', '.....B........', '.O.#..#.#.G...', '..............', '..............'],
  },
  {
    name: 'Rime Road', sigils: ['gale', 'frost'], par: 1, ink: 1, combos: true,
    lesson: 'Whatever Ventus moves carries its ring-sigils with it. An orb that carries Gelu freezes the water beneath it as it rolls.',
    hint: 'Ventus in the centre, a twice-barbed sign toward the font, and Gelu on the ring behind the sign.',
    t: ['0000~~~~~000', '0000~~~~~000', '0000~~~~~000', '0000~~~~~000', '0000~~~~~000'],
    o: ['............', '............', '.O........G.', '............', '............'],
    flows: [{ x0: 4, x1: 8, y0: 0, y1: 4, dx: 0, dy: 1, s: 3.5 }],
  },
  {
    name: 'The Ferry', sigils: ['gale', 'stone', 'luna'], centers: ['gale'], sats: ['stone', 'luna'], par: 1, ink: 1, combos: true,
    lesson: 'Ventus with Luna and Petra both on its ring, behind the sign where they act at once, raises a slab of floating stone beneath what you touch, and the wind sails it the way of your sign, rider and all. A slab sails on at an even pace where a floating orb soon slows in the air. In this lesson Petra and Luna can only go on the ring.',
    hint: 'Ventus in the centre, cast right on the orb, its sign toward the far island crossed by two barbs. On the ring, in two of the red circles behind the sign: a small Luna and a small Petra.',
    t: ['000             000', '000             0000', '000             0000', '000             0000', '000             000 '],
    o: ['...................', '...................', '.O...............G.', '...................', '...................'],
  },
  {
    name: 'The Lantern', sigils: ['gale', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'Where a ring-sigil sits matters. Behind your sign it acts at once; beside it, along the way; ahead of it, on arrival. Each place on the ring holds only one mark. Fire lit too soon will melt the ice road beneath you.',
    hint: 'Ventus with a twice-barbed sign toward the font, and Ignis in a slot just beside the sign on its forward side (AHEAD): it bursts into flame only when the orb arrives.',
    t: ['0000***0000000', '0000***0000000', '0000***0000000', '0000***0000000', '0000***0000000'],
    o: ['..............', '...........B..', '.O.........G..', '..............', '..............'],
    flows: [{ x0: 4, x1: 6, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  {
    name: 'Confluence', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 1, ink: 2, combos: true,
    lesson: 'One seal can carry several sigils. Write a single spell that carries the orb over thorn, water and sky, and kindles the brazier the moment it arrives.',
    hint: 'Ventus in the centre with a twice-barbed sign toward the font. On the ring: Luna behind the sign (float at once) and Ignis in a slot beside the sign on its forward side (burn on arrival).',
    t: ['0000~~~~~0   000', '0000~~~~~0   000', '0000~~~~~0   000', '0000~~~~~0   000', '0000~~~~~0   000'],
    o: ['.........#......', '.........#....B.', '.O.......#....G.', '.........#......', '.........#......'],
    flows: [{ x0: 4, x1: 8, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  // Skyward's land again, solved by one compound seal. The hollow's rim throws back any Ventus-centred gust, so Luna must
  // lift first (Luna in the centre, Ventus on its ring); the font is 12 tiles off (outer circle); the brazier on the near
  // bank opens the gate, so Ignis must burn along the way (on arrival is too late). Fire on the orb lasts 5s: a gentle
  // wind's flame dies before the brazier, one or two barbs arrive in time. Simulated at 15 cast offsets each.
  {
    name: 'Skyward Redux', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 1, ink: 2, combos: true,
    folioEnd: { title: 'The Second Folio is Complete', text: 'The same land, in a single seal. The master sets the second folio aside and opens a third, whose lands take stranger shapes.' },
    lesson: 'The last page of the first folio, written once more. Seven seals carried the orb home then; your inkwell holds two. Any gust only throws the orb against the rim of its hollow, so whatever lifts it must act first, and the rune gate will not wait for a fire that comes on arrival.',
    hint: 'Luna in the centre, cast on the orb, with a second, larger circle around the seal: the font is more than 10 tiles off. Its sign toward the font (lower right), crossed by one or two barbs. On the ring: a small Ventus behind the sign (red: it bears the orb at once) and a small Ignis beside it (blue: the orb burns along the way and kindles the brazier as it passes).',
    t: [' 000000~~001    ', '2222000~~001 111', '2112000~~001 333', '2112000~~001 113', '2222000~~001 333', '0000000~~001 111', '0000000~~001 111', ' 000000~~001    '],
    o: ['.....#..........', '.....#..........', '.....#..........', '..O..#.......DG.', '.....#...B......', '.....#..........', '.....#..........', '.....#..........'],
    flows: [{ x0: 7, x1: 8, y0: 0, y1: 7, dx: 0, dy: 1, s: 3 }],
  },
  /* ---------- The Third Folio: lands of strange shape ----------
     Each lesson was simulated (world.js in Node) with its intended seals at nine cast offsets: all win 9/9.
     The notes say which shortcuts were checked and fail. */
  // Beads touching only at their corners, along the land's diagonal (a sign straight across the page). Two beads are
  // missing: Petra with one plain sign to the right, cast on the nearer gap, sets both. The gust needs two barbs (9.9 tiles);
  // Petra cast on a standing bead raises it into a bump the orb cannot climb.
  {
    name: 'The Bead Chain', sigils: ['gale', 'stone'], par: 2, ink: 2, combos: true, opens: 'The Third Folio',
    lesson: 'The third folio, and the land grows strange. Here it is strung like beads, each touching the next only at a corner, and two beads have fallen from the string. A sign drawn straight across the page runs along the land’s diagonal, from corner to corner, for stone as well as wind.',
    hint: 'Petra with one plain sign straight to the right (3 o’clock), cast on the nearer empty place: it sets two beads, corner to corner. Then Ventus on the orb with a sign to the right, crossed by two barbs.',
    t: ['        00', '        00', '       0  ', '      0   ', '          ', '          ', '   0      ', '  0       ', '00        ', '00        '],
    o: ['..........', '........G.', '..........', '..........', '..........', '..........', '..........', '..........', '.O........', '..........'],
  },
  // A crescent shore around still water; the font on the far horn, a brazier beside it. One seal: Ventus down the page with
  // Gelu at once (an ice road; any strength wins) and Ignis on arrival. Ignis along the way melts the road; without Ignis, no fire.
  {
    name: 'The Crescent Lagoon', sigils: ['gale', 'frost', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'A crescent of shore curls around still water, and the font waits on the far horn beside a cold brazier. Your ink holds a single seal: let it freeze the way as the orb goes, and kindle the fire only once it has come.',
    hint: 'Ventus on the orb with a sign straight down the page (6 o’clock), toward the far horn. On the ring: a small Gelu opposite the sign (red: at once, so the orb freezes the water beneath it as it rolls) and a small Ignis just beside the sign on its forward side (green: on arrival).',
    t: ['     ~~~     ', '   0~~~~~~   ', '  00~~~~~~~  ', ' 000~~~~~~~~ ', ' 000~~~~~~~~ ', '0000~~~~~~~~~', '00000~~~~~~~~', '00000~~~~~~~~', ' 000000~~~~~ ', ' 00000000000 ', '  000000000  ', '   0000000   ', '     000     '],
    o: ['.............', '...O.........', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '...........G.', '..........B..', '.............', '.............'],
  },
  // Two round isles and a one-tile bridge with its last stone missing, right before the font. Ventus with two barbs and
  // Petra on arrival: as the orb rolls off the broken edge, stone rises beneath it. Measured: no plain gust leaps the gap
  // (0/15 offsets), one barb never reaches it, and Petra behind or beside the sign does not help.
  {
    name: 'The Broken Causeway', sigils: ['gale', 'stone'], par: 1, ink: 1, combos: true,
    lesson: 'One stone is missing from the causeway, just short of the font, too near the end for any wind to leap, for the orb has slowed by then. On arrival means when the orb comes to rest; it also means the moment the ground runs out beneath it.',
    hint: 'Ventus on the orb, its sign toward the font (lower right) crossed by two barbs, and a small Petra just beside the sign on its forward side (green: on arrival). As the orb rolls off the broken edge, stone rises beneath it.',
    t: ['                ', ' 00             ', '0000        00  ', '0000000000 0000 ', '0000       0000 ', ' 00         00  ', '                '],
    o: ['................', '................', '................', '.O.........G....', '................', '................', '................'],
  },
  // A ring around an empty eye; the font sealed on an islet by four gates; braziers on opposite sides of the ring, 5 tiles
  // from the font. Ignis with opposite two-barbed signs reaches 3 tiles each way, 5 with a Ventus on its ring. Then any
  // float or the ferry carries the orb in. (Ignis + Luna wisps, with or without Ventus, also light both braziers.)
  {
    name: 'The Eye', sigils: ['gale', 'stone', 'flame', 'luna'], par: 2, ink: 2, combos: true,
    lesson: 'A ring of land around an empty eye, and in the eye a sealed font. Its gates open when both braziers on opposite sides of the ring burn, and your ink holds two seals. Ventus set upon the ring of stone, fire, ice or water carries every arm of it two tiles farther.',
    hint: 'Ignis cast on the font itself, with two opposite signs along the tile rows toward the braziers (lower right and upper left), each crossed by two barbs, and a small Ventus in any slot: one line of fire from brazier to brazier. Then the ferry: Ventus on the orb with a sign toward the font (upper right), and a small Luna and a small Petra behind the sign.',
    t: ['    00000    ', '   0000000   ', '  00     00  ', ' 00       00 ', '00         00', '00   202   00', '00   000   00', '00   202   00', '00         00', ' 00       00 ', '  00     00  ', '   0000000   ', '    00000    '],
    o: ['.............', '.............', '.............', '.............', '.............', '......D......', '.B...DGD...B.', '......D......', '.............', '.............', '.............', '......O......', '.............'],
  },
  // Isles one step higher each, two tiles of air between them, the font 12 tiles off. Only Luna in the centre with the outer
  // circle and Ventus on its ring wins: the float rides 1.3 above the ground and climbs each step. A bare float runs out,
  // the Ventus + Luna glide falls short, and the ferry's slab cannot climb.
  {
    name: 'The Stair of Isles', sigils: ['gale', 'stone', 'luna'], par: 1, ink: 1, combos: true,
    lesson: 'Isles climb into the sky like steps, each a stone higher than the last, too far apart to roll and too high to leap. What Luna lifts floats a little above whatever lies beneath it, and rises when the ground rises. A slab of stone keeps to its own level.',
    hint: 'Luna in the centre, cast on the orb, with a second, larger circle around the seal: the font is more than 10 tiles off. Its sign toward the high isles (upper right), and a small Ventus behind the sign: the wind bears the orb up the stair.',
    t: ['       ', '   3   ', '  333  ', '   3   ', '       ', '   2   ', '  222  ', '   2   ', '       ', '   1   ', '  111  ', '   1   ', '  000  ', ' 00000 ', ' 00000 ', ' 00000 ', '  000  '],
    o: ['.......', '.......', '...G...', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '...O...', '.......', '.......'],
  },
  // An eight-pointed rose: four straight arms, four arms of corner-touching beads. The font sealed at the heart, braziers at
  // the ends of one straight arm, 7 tiles off (Ignis with two-barbed signs and two Ventus on its ring). The orb comes down a
  // bead arm with one bead missing: Ventus with two barbs and Petra on arrival. Order matters: an orb sent first stops at the
  // shut gate. (A Luna float or the Ventus + Luna glide also carry it in once the gates are open.)
  {
    name: 'The Compass Rose', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 2, ink: 2, combos: true,
    lesson: 'The last page of the third folio: a rose of eight points, four of solid ground and four of beads. Its font is sealed at the heart, and the gates open when the braziers at the two farthest points burn. Mind the order of your seals: an orb that reaches a shut gate only waits there.',
    hint: 'First the fire: Ignis on the font with two-barbed signs toward both braziers (lower right and upper left) and two small Ventus on its ring, so each arm reaches seven tiles. Then Ventus on the orb with a sign straight down the page (6 o’clock), crossed by two barbs, and a small Petra just beside it on its forward side (green): stone fills the missing bead as the orb rolls over the gap.',
    t: ['0      0      0', ' 0     0     0 ', '  0    0    0  ', '   0   0   0   ', '    0  0  0    ', '      0000     ', '     00000     ', '000000000000000', '     00000     ', '     00000     ', '    0  0  0    ', '   0   0   0   ', '  0    0    0  ', ' 0     0     0 ', '0      0      0'],
    o: ['O..............', '...............', '...............', '...............', '...............', '...............', '.......D.......', 'B.....DGD.....B', '.......D.......', '...............', '...............', '...............', '...............', '...............', '...............'],
  },
];
LEVELS.forEach((l, i) => l.roman = ROMAN[i]);
const TITLE_LEVEL = {
  name: 'Title', sigils: [], par: 0, lesson: '', hint: '',
  t: ['  00000  ', ' 0011000 ', '001210~~0', '00110~~00', ' 000~~00 ', '  000~0  '],
  o: ['.........', '.B.......', '....#....', '...#...G.', '.......B.', '.........'],
  flows: [{ x0: 4, x1: 7, y0: 2, y1: 5, dx: 0, dy: 1, s: 1.2 }],
};

/* ---------------- Progress ---------------- */
const Save = {
  data: { unlocked: 1, stars: {}, v: 5 },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('quillsigil.v1'));
      if (!s || !s.unlocked) return;
      // v50 added The Long Meadow and The Rift after the first lesson: older saves move up two places
      if (!s.v) {
        const stars = {};
        for (const k in s.stars) stars[+k === 0 ? 0 : +k + 2] = s.stars[k];
        s.stars = stars; if (s.unlocked >= 2) s.unlocked = Math.min(LEVELS.length, s.unlocked + 2);
        s.v = 2; this.data = s; this.save(); // saved at once, so it never shifts twice
      }
      // v63 added Featherfall II after Featherfall (index 8): lessons from index 9 on move up one
      if (s.v === 2) {
        const stars = {};
        for (const k in s.stars) stars[+k >= 9 ? +k + 1 : +k] = s.stars[k];
        s.stars = stars; if (s.unlocked >= 10) s.unlocked = Math.min(LEVELS.length, s.unlocked + 1);
        s.v = 3; this.data = s; this.save();
      }
      // v66 added Skyward Redux at the end (XIX): a save that already beat Confluence (index 17) was capped at 18 lessons
      if (s.v === 3) {
        if (s.stars[17]) s.unlocked = Math.max(s.unlocked, 19);
        s.v = 4; this.data = s; this.save();
      }
      // v67 added the third folio after Skyward Redux (index 18): a save that had beaten it was capped at 19 lessons
      if (s.v === 4) {
        if (s.stars[18]) s.unlocked = Math.max(s.unlocked, 20);
        s.v = 5; this.data = s; this.save();
      }
      this.data = s;
    } catch (e) { }
  },
  save() { try { localStorage.setItem('quillsigil.v1', JSON.stringify(this.data)); } catch (e) { } },
};

/* ---------------- Game flow ---------------- */
const $ = s => document.querySelector(s);
const Game = {
  state: 'title', idx: 0, level: null, casts: 0, history: [], held: null, aim: null, winT: 0, objKey: '',
  aimDown: false,

  showScreen(id) {
    for (const el of document.querySelectorAll('.screen,.card')) el.classList.toggle('show', el.id === id);
    this.coverAt = id === 'win' || id === 'note' || id === 'levels' ? performance.now() : 0;
  },
  title() {
    this.state = 'title'; this.level = null;
    loadWorld(TITLE_LEVEL);
    for (const c of World.cells) if (c.feat === 'brazier') c.lit = true;
    const f = World.fonts[0], b = makeBody('orb', f.x + 0.5, f.y + 0.5, 1);
    b.captured = { x: f.x, y: f.y, h: f.h }; World.bodies.push(b);
    fitCamera(innerWidth, innerHeight);
    $('#hud').classList.remove('show');
    this.showScreen('title');
    $('#bContinue').style.display = Save.data.unlocked > 1 ? '' : 'none';
  },
  lessons() {
    this.state = 'menu';
    const box = $('#lessonGrid'); box.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = i >= Save.data.unlocked, st = Save.data.stars[i] || 0;
      if (L.opens) { const h = document.createElement('div'); h.className = 'fhead'; h.textContent = L.opens; box.appendChild(h); }
      const el = document.createElement('button');
      el.className = 'lcard' + (locked ? ' locked' : '');
      el.innerHTML = `<div class="lr">${L.roman}</div><div class="ln">${locked ? '· sealed ·' : L.name}</div><div class="ls">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}"></i>`).join('')}</div>`;
      if (!locked) el.onclick = () => { Sfx.init(); this.start(i); };
      box.appendChild(el);
    });
    $('#hud').classList.remove('show');
    this.showScreen('levels');
  },
  start(i) {
    // Restarting (or replaying) the same lesson keeps the last drawing for Recall.
    if (i !== this.idx) Grim.lastStrokes = null;
    this.idx = i; this.level = LEVELS[i]; this.casts = 0; this.history = []; this.winT = 0; this.held = null;
    Grim.draft.clear(); Grim.ghost = null; Grim.bookDirty = true; Grim.inkDirty = true;
    parts.length = 0;
    loadWorld(this.level);
    fitCamera(innerWidth, innerHeight);
    $('#lnum').textContent = `Lesson ${this.level.roman}`;
    $('#ltitle').textContent = this.level.name;
    $('#par').textContent = this.level.par;
    this.updateCasts();
    $('#hud').classList.add('show');
    this.state = 'play';
    this.renderSatchel();
    this.note();
  },
  note() {
    const L = this.level;
    $('#noteNum').textContent = `Lesson ${L.roman}`;
    $('#noteTitle').textContent = L.name;
    $('#noteText').textContent = L.lesson;
    $('#noteHint').textContent = L.hint; $('#noteHint').classList.remove('show'); $('#bHint').style.display = '';
    const ringOnly = id => L.centers && !L.centers.includes(id);
    $('#noteSigils').innerHTML = L.sigils.map(id => `<span class="chip" style="--c:${SIGILS[id].color}"><img src="${glyphIcon(id)}" alt="">${SIGILS[id].name}${ringOnly(id) ? ' <small>(ring only)</small>' : ''}</span>`).join('') + (L.ink ? `<span class="chip ink">ink for ${L.ink} seal${L.ink > 1 ? 's' : ''}</span>` : '');
    this.showScreen('note'); this.state = 'note';
  },
  closeNote() { this.showScreen(null); this.state = 'play'; },
  reset() { if (!this.level) return; Sfx.play('rewind'); this.start(this.idx); this.closeNote(); },
  rewind() {
    if (!this.history.length || this.state === 'won') { this.toast('Nothing to rewind.'); return; }
    restore(this.history.pop()); this.casts = Math.max(0, this.casts - 1); this.updateCasts();
    parts.length = 0; Sfx.play('rewind'); this.toast('The page turns back.');
  },
  updateCasts() {
    $('#casts').textContent = this.casts;
    const L = this.level, w = $('#inkwell');
    if (L && L.ink) { w.style.display = ''; w.innerHTML = 'ink ' + Array.from({ length: L.ink }, (_, k) => `<i class="${k < L.ink - this.casts ? 'on' : ''}"></i>`).join(''); }
    else w.style.display = 'none';
  },
  inkLeft() { return this.level && this.level.ink ? this.level.ink - this.casts : Infinity; },
  dry() {
    if (this.inkLeft() > 0) return false;
    this.toast(isTouch() ? 'Your inkwell is dry. Rewind a cast or restart.' : 'Your inkwell is dry. Rewind a cast (Z) or restart (R).'); Sfx.play('fizzle'); return true;
  },
  openGrimoire() {
    if (this.state !== 'play' || this.dry()) return;
    Sfx.init();
    this.state = 'draw'; Grim.show();
    $('#bGrimoire').classList.add('hidden');
  },
  closeGrimoire() {
    if (this.state !== 'draw') return;
    this.closeSatchel();
    Grim.hide(); this.state = 'play'; $('#bGrimoire').classList.remove('hidden');
  },
  holdSpell(sp) {
    this.closeSatchel();
    Grim.hide();
    this.held = sp; this.state = 'aim';
    this.aim = null; this.aimReady();
    $('#aimbar').classList.add('show');
    $('#aimDesc').textContent = describeSpell(sp, true);
  },
  aimReady() { $('#aCast').disabled = !this.aim; },
  backToPage() {
    if (this.state !== 'aim') return;
    $('#aimbar').classList.remove('show');
    this.state = 'draw';
    if (Grim.lastStrokes) { Grim.draft.clear(); for (const s of Grim.lastStrokes) Grim.draft.add(JSON.parse(JSON.stringify(s))); }
    Grim.inkDirty = true; Grim.show();
  },
  cast() {
    if (this.state !== 'aim' || !this.aim) return;
    this.history.push(snapshot());
    if (this.history.length > 40) this.history.shift();
    this.casts++; this.updateCasts();
    castSpell(this.held, this.aim.x, this.aim.y, this.aim.z);
    this.held = null; this.state = 'play';
    $('#aimbar').classList.remove('show'); $('#bGrimoire').classList.remove('hidden');
  },
  toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 3600);
  },
  objectives() {
    const out = [];
    if (World.fonts.length) {
      const done = World.bodies.some(b => b.kind === 'orb' && b.alive && b.captured);
      out.push({ t: 'Guide the orb into the font', done });
    }
    if (World.braziers.length) {
      const lit = World.braziers.filter(b => b.lit).length;
      out.push({ t: `Light the braziers (${lit}/${World.braziers.length})`, done: lit === World.braziers.length });
    }
    return out;
  },
  update(dt) {
    if (!this.level || this.state === 'title' || this.state === 'menu') return;
    const objs = this.objectives(), key = JSON.stringify(objs);
    if (key !== this.objKey) {
      this.objKey = key;
      $('#objs').innerHTML = objs.map(o => `<li class="${o.done ? 'done' : ''}"><span class="box"></span>${o.t}</li>`).join('');
    }
    if (this.state === 'won') return;
    const orbDone = World.bodies.some(b => b.kind === 'orb' && b.alive && b.captured && b.cap > 0.9);
    if (orbDone && objs.every(o => o.done)) {
      this.winT += dt;
      if (this.winT > 0.4) this.win();
    } else this.winT = 0;
  },
  win() {
    this.state = 'won';
    if (Grim.open) Grim.hide();
    $('#aimbar').classList.remove('show');
    Sfx.play('win');
    const f = World.fonts[0];
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * TAU, sp = 1 + Math.random() * 4;
      emit({ x: f.x + .5, y: f.y + .5, z: f.h + 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 2 + Math.random() * 7, grav: 4, drag: 0.8, life: 2 + Math.random(), size: 4 + Math.random() * 4, color: ['#ffd27a', '#8ff4ff', '#ffffff', '#cdb0ff'][i % 4], kind: 'glow' });
    }
    const L = this.level, par = L.par;
    const stars = this.casts <= par ? 3 : this.casts <= par + 2 ? 2 : 1;
    Save.data.stars[this.idx] = Math.max(Save.data.stars[this.idx] || 0, stars);
    Save.data.unlocked = Math.max(Save.data.unlocked, Math.min(LEVELS.length, this.idx + 2));
    Save.save();
    const last = this.idx === LEVELS.length - 1, wonIdx = this.idx;
    setTimeout(() => {
      if (this.state !== 'won' || this.idx !== wonIdx) return; // the player has already moved on
      // the last lesson of each folio says so; the very last closes the book
      const end = L.folioEnd || (last && { title: 'The Folio is Complete', text: 'Your seals have carried the light across the sky. The master closes the folio.' });
      $('#winTitle').textContent = end ? end.title : 'Lesson Complete';
      $('#winText').textContent = end
        ? `${end.text} (${this.casts} seal${this.casts === 1 ? '' : 's'} cast; the master's mark is ${par}.)`
        : `${L.name} — ${this.casts} seal${this.casts === 1 ? '' : 's'} cast. The master's mark is ${par}.`;
      $('#winStars').innerHTML = [0, 1, 2].map(k => `<i class="${k < stars ? 'on' : ''}" style="animation-delay:${0.3 + k * 0.25}s"></i>`).join('');
      $('#bNext').style.display = last ? 'none' : '';
      this.showScreen('win');
    }, 1300);
  },
  next() { if (this.idx < LEVELS.length - 1) this.start(this.idx + 1); else this.lessons(); },

  /* ----- the satchel of kept spells ----- */
  renderSatchel() {
    const allowed = lessonRules();
    const list = $('#satList'), bar = $('#hotbar');
    list.innerHTML = ''; bar.innerHTML = '';
    $('#satCount').textContent = Satchel.list.length || '';
    if (!Satchel.list.length) list.innerHTML = '<div class="empty">Your satchel is empty. Draft a spell on the page, then keep it here to cast again without redrawing.</div>';
    Satchel.list.forEach((e, i) => {
      const inf = Satchel.info(i), ok = !allowed || !Satchel.spell(i, allowed).err;
      const item = document.createElement('div'); item.className = 'sat';
      item.innerHTML = `<button class="load" style="--c:${inf.color || '#e8c27a'}" title="Lay this spell on the page"><img src="${inf.img}" alt=""><span class="k">${i + 1}</span></button>
        <div class="lbl ${ok ? '' : 'off'}">${inf.label}</div><button class="del" title="Let this spell go">×</button>`;
      item.querySelector('.load').onclick = () => { Grim.loadStrokes(Satchel.list[i].strokes); this.closeSatchel(); };
      item.querySelector('.del').onclick = () => { Satchel.remove(i); Sfx.play('smudge'); this.renderSatchel(); };
      list.appendChild(item);
      const s = document.createElement('button');
      s.className = 'slot' + (ok ? '' : ' off'); s.style.setProperty('--c', inf.color || '#e8c27a');
      s.title = ok ? `${inf.label} — cast at once (${i + 1})` : `${inf.label} — not yet learned in this lesson`;
      s.innerHTML = `<img src="${inf.img}" alt=""><span class="k">${i + 1}</span>`;
      s.onclick = e => { Sfx.init(); this.quick(i); e.currentTarget.blur(); };
      bar.appendChild(s);
    });
  },
  /* ----- the Notes leaf (phones): the lesson, the sigils and how signs work ----- */
  openNotes() {
    if (this.state !== 'draw' || !this.level) return;
    const L = this.level, ringOnly = id => L.centers && !L.centers.includes(id);
    $('#nNum').textContent = `Lesson ${L.roman}`;
    $('#nTitle').textContent = L.name;
    $('#nText').textContent = L.lesson;
    const box = $('#nSigils'); box.innerHTML = '';
    for (const id of SIGIL_ORDER) {
      const S = SIGILS[id], known = L.sigils.includes(id);
      const b = document.createElement('button');
      b.className = 'nsig' + (known ? '' : ' off') + (Grim.ghost === id ? ' on' : '');
      b.innerHTML = `<img src="${glyphIcon(id)}" alt="" style="background:${known ? S.color : 'transparent'}"><div><b>${S.name}</b><em>${S.en}</em>` +
        `<span>${known ? (ringOnly(id) ? 'Ring only, this lesson. ' : '') + S.desc : 'Not yet learned.'}</span></div>`;
      if (known) b.onclick = () => { Grim.ghost = Grim.ghost === id ? null : id; Sfx.play('tick'); this.closeNotes(); };
      else b.disabled = true;
      box.appendChild(b);
    }
    $('#nSigns').textContent = signNotes(L);
    $('#nHint').textContent = L.hint; $('#nHint').classList.remove('show'); $('#nHintB').style.display = '';
    $('#notes .sheet').scrollTop = 0;
    $('#notes').classList.add('show'); Sfx.play('page');
    $('#pNotes').classList.remove('beckon');
    try { localStorage.setItem('quillsigil.notesSeen', '1'); } catch (e) { }
  },
  closeNotes() { if (this.notesOpen()) { $('#notes').classList.remove('show'); Sfx.play('page'); } },
  notesOpen() { return $('#notes').classList.contains('show'); },
  openSatchel() { if (this.state !== 'draw') return; this.renderSatchel(); $('#satchel').classList.add('show'); Sfx.play('page'); },
  closeSatchel() { $('#satchel').classList.remove('show'); },
  satchelOpen() { return $('#satchel').classList.contains('show'); },
  keep() { if (Grim.keep()) this.renderSatchel(); },
  quick(i) {
    if (this.state !== 'play' || !Satchel.list[i] || this.dry()) return;
    const sp = Satchel.spell(i, lessonRules());
    if (sp.err) { this.toast(sp.err); Sfx.play('fizzle'); return; }
    Grim.lastStrokes = JSON.parse(JSON.stringify(Satchel.list[i].strokes));
    Sfx.play('inscribe');
    $('#bGrimoire').classList.add('hidden');
    this.holdSpell(sp);
  },
};

function glyphIcon(id) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#2a1830'; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 28, 0, TAU); g.stroke();
  drawGlyph(g, id, 32, 32, 22, '#2a1830', 3);
  return c.toDataURL();
}

/* ---------------- Aim preview overlay ---------------- */
function aimOverlay(g, t) {
  if (Game.state !== 'aim' || !Game.aim || !Game.held) return;
  const sp = Game.held, A = Game.aim, s = cam.s;
  const cells = (isLine(sp) || sp.sigil === 'stone' || sp.sigil === 'flame' || sp.sigil === 'frost' || sp.sigil === 'tide') ? spellCells(sp, A.x, A.y) : [];
  g.save();
  // Unda's tiles only measure out the water; it runs to the lowest of them. So its footprint is drawn flat, at the
  // highest of its tiles (drawn each at its own height, tiles down in a hollow slid under the ones beside it and the
  // shape looked broken), and the pool it will really make is drawn below — and named in the aim bar
  const tide = sp.sigil === 'tide';
  const zFlat = tide ? Math.max(0, ...cells.map(([x, y]) => cellI(x, y)).filter(c => !c.void).map(surfaceTop)) : 0;
  for (const [x, y] of cells) {
    const c = cellI(x, y), z = tide ? zFlat : c.void ? 0 : surfaceTop(c);
    const P = [proj(x, y, z), proj(x + 1, y, z), proj(x + 1, y + 1, z), proj(x, y + 1, z)];
    g.fillStyle = hexA(sp.color, (tide ? 0.08 : 0.16) + 0.08 * Math.sin(t * 5)); poly(g, P); g.fill();
    g.strokeStyle = hexA(sp.color, tide ? 0.6 : 0.8); g.lineWidth = 1.2; g.setLineDash(c.void || tide ? [4, 4] : []); poly(g, P); g.stroke();
  }
  g.setLineDash([]);
  let note = '';
  if (tide && cells.length) {
    const F = planFlood(cells.map(([x, y]) => cellI(x, y)).filter(c => !c.void), cells.length); // as baseSpell pours it
    if (F && F.ok) {
      for (const c of F.region) {
        const P = [proj(c.x, c.y, F.lvl), proj(c.x + 1, c.y, F.lvl), proj(c.x + 1, c.y + 1, F.lvl), proj(c.x, c.y + 1, F.lvl)];
        g.fillStyle = hexA('#6fc2ff', 0.55 + 0.12 * Math.sin(t * 4)); poly(g, P); g.fill();
        g.strokeStyle = 'rgba(220,244,255,0.95)'; g.lineWidth = 1.6; poly(g, P); g.stroke();
      }
      const where = F.wet ? 'the pool' : 'the hollow', f = (F.lvl - F.h0) / (F.rim - F.h0);
      // kept short: the aim bar must not cover the world on a phone
      note = F.want > F.rim + 0.3 ? `brims over ${where}` : f > 0.97 ? `fills ${where}`
        : f < 0.13 ? `barely wets ${where}` : `fills ${where} ${['¼', '¼', '½', '¾', 'nearly'][Math.round(f * 4)]}`;
    } else if (F) note = 'runs off here';
  }
  const desc = describeSpell(sp, true) + (note ? ' · ' + note : '');
  if ($('#aimDesc').textContent !== desc) $('#aimDesc').textContent = desc;
  const R = spellRadius(sp);
  if (R > 0 && !isLine(sp)) {
    const [cx, cy] = proj(A.x, A.y, A.z);
    g.strokeStyle = hexA(sp.color, 0.7); g.lineWidth = 1.5; g.setLineDash([6, 5]); g.lineDashOffset = -t * 20;
    g.beginPath(); g.ellipse(cx, cy, R * TW * 0.7071 * s, R * TH * 0.7071 * s, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  }
  // affected bodies
  if (sp.sigil === 'gale' || sp.sigil === 'luna' || sp.sigil === 'tide') {
    for (const b of spellBodies(sp, A.x, A.y)) {
      const [bx, by] = proj(b.x, b.y, b.z + b.hgt + 0.2);
      g.fillStyle = hexA(sp.color, 0.9); g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx + 5, by - 12); g.lineTo(bx - 5, by - 12); g.closePath(); g.fill();
    }
  }
  // direction arrow
  if (sp.dir && (!isLine(sp) || tideCurrent(sp)) && sp.sigil !== 'stone') { // Unda's arrow only when Ventus on its ring makes it flow
    const L = 1.4 + sp.s * 0.4;
    const a = proj(A.x, A.y, A.z + 0.05), b = proj(A.x + sp.dir.x * L, A.y + sp.dir.y * L, A.z + 0.05);
    g.strokeStyle = hexA(sp.color, 0.95); g.lineWidth = 3 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - Math.cos(ang - 0.5) * 12 * s, b[1] - Math.sin(ang - 0.5) * 12 * s);
    g.moveTo(b[0], b[1]); g.lineTo(b[0] - Math.cos(ang + 0.5) * 12 * s, b[1] - Math.sin(ang + 0.5) * 12 * s); g.stroke();
  }
  g.restore();
  g.save(); g.globalCompositeOperation = 'lighter';
  drawSeal(g, sp, A.x, A.y, A.z + 0.04, Math.max(0.8, R || 0.7), 0.55 + 0.2 * Math.sin(t * 4), t * 0.5, 1, t);
  g.restore();
}

/* ---------------- Boot ---------------- */
const wc = document.getElementById('world'), wg = wc.getContext('2d');
// the sky on its own canvas behind the world's: repainted about 25 times a second, at no more than 1.25x resolution
const skc = document.getElementById('sky'), skg = skc.getContext('2d', { alpha: false });
const SKYP = { dpr: 1, last: -1e9 };
const PACE = { last: 0, iv: 16.7, n: 0, full: false, win: 0, wn: 0, probeAt: 0, backoff: 6000 };
SKY_LAYER = wc;
let DPR = 1;
/* Quality steps, tried in turn when frames come too slowly (on phones, mostly): first the soft glow goes, then the
   world is drawn at a lower resolution. The step reached is remembered for next time. */
// (never below 1.5: on a sharp phone screen anything less looks blurred and blocky)
const QUALITY = [{ dpr: 2, bloom: true }, { dpr: 2, bloom: false }, { dpr: 1.75, bloom: false }, { dpr: 1.5, bloom: false }];
// phones start without the soft glow (it copies the whole frame each frame, which phones feel most)
const COARSE = matchMedia('(pointer: coarse)').matches;
let qTier = COARSE ? 1 : 0;
// (a new name: steps remembered under the old one were taken too eagerly, and are let go)
try { const q = localStorage.getItem('quillsigil.quality3'); if (q != null) qTier = clamp(Math.round(+q || 0), 0, QUALITY.length - 1); } catch (e) { }
// (block[k]: until when step k isn't tried again after it proved too slow; wait[k]: how long the next wait is)
const PERF = { n: 0, sum: 0, last: 0, hold: 0, good: 0, bad: 0, block: [], wait: [], mode: '' };
// phones never try the soft glow (the step above 1) by themselves
const QMIN = COARSE ? 1 : 0;
function setQuality(k, now) {
  qTier = k; PERF.hold = now + 1500; PERF.n = 0; PERF.sum = 0; PERF.good = 0;
  try { localStorage.setItem('quillsigil.quality3', String(k)); } catch (e) { }
  resize();
}
// ?debug in the address shows frame timings in a corner (to see what a given phone is doing)
const DEBUG = /[?&]debug(=|&|$)/.test(location.search);
const GAME_VERSION = (() => { const s = document.querySelector('script[src*="main.js"]'); const m = s && /[?&]v=(\d+)/.exec(s.getAttribute('src')); return m ? m[1] : '?'; })();
const DBG = { el: null, n: 0, iv: 0, rd: 0, worst: 0, last: 0 };
function debugFrame(now, renderMs) {
  if (!DEBUG) return;
  if (!DBG.el) {
    DBG.el = document.createElement('div'); DBG.el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;font:11px/1.35 monospace;color:#cfe;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:4px;white-space:pre;cursor:pointer';
    document.body.appendChild(DBG.el);
    // tapping the readout leaves out one part of the scene after another, to see what the phone spends its time on;
    // holding it runs through them all by itself (about 3 s each) and lists what each one costs
    DBG.el.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      clearTimeout(DBG.press); DBG.long = false;
      DBG.press = setTimeout(() => { DBG.long = true; benchStart(); }, 650);
    });
    DBG.el.addEventListener('pointerup', e => {
      e.stopPropagation(); e.preventDefault(); clearTimeout(DBG.press);
      if (DBG.long) return;
      DBG.bench = null; DBG.mode = ((DBG.mode || 0) + 1) % DBG_MODES.length; dbgMode(DBG_MODES[DBG.mode]);
    });
    // count the drawing calls (and the clips among them) made on the world's canvas
    DBG.ops = 0; DBG.clips = 0;
    for (const m of ['fill', 'stroke', 'drawImage', 'fillRect', 'clip', 'fillText']) { const f = wg[m]; wg[m] = function (...a) { DBG.ops++; if (m === 'clip') DBG.clips++; return f.apply(this, a); }; }
  }
  const dt = DBG.last ? now - DBG.last : 0; DBG.last = now;
  if (DBG.bench) { benchFrame(now, dt, renderMs); return; }
  DBG.n++; DBG.iv += dt; DBG.rd += renderMs; DBG.worst = Math.max(DBG.worst, dt);
  if (DBG.n < 30) return;
  const cached = TC.map.size, tiles = World.cells.filter(c => !c.void).length;
  const off = Object.keys(DBGOFF).find(k => DBGOFF[k]);
  DBG.el.textContent = (DBG.table ? DBG.table + '\n' : '') + `v${GAME_VERSION}  ${off ? 'no ' + off : 'all on'}  ops ${Math.round(DBG.ops / DBG.n)}  clips ${Math.round(DBG.clips / DBG.n)}\n${(1000 / (DBG.iv / DBG.n)).toFixed(0)} fps  frame ${(DBG.iv / DBG.n).toFixed(1)}ms  worst ${DBG.worst.toFixed(0)}ms
draw ${(DBG.rd / DBG.n).toFixed(1)}ms  quality ${qTier}  dpr ${DPR}  ${PACE.iv < 11 ? (PACE.full ? '120Hz' : '60 of 120Hz') : ''}
tiles ${cached}/${tiles}  particles ${parts.length}`;
  DBG.n = 0; DBG.iv = 0; DBG.rd = 0; DBG.worst = 0; DBG.ops = 0; DBG.clips = 0;
}
const DBG_MODES = ['all', 'particles', 'sky', 'water', 'vines', 'lights', 'land', 'world'];
function dbgMode(m) {
  for (const k in DBGOFF) DBGOFF[k] = k === m;
  DBG.n = 0; DBG.iv = 0; DBG.rd = 0; DBG.worst = 0; DBG.ops = 0; DBG.clips = 0; SKYP.last = -1e9;
}
// the run-through: each part left out in turn, timed for 2 s after 1 s to settle, then the list stays on screen
function benchStart() {
  DBG.bench = { i: 0, t0: performance.now(), n: 0, iv: 0, rd: 0, ops: 0, rows: [] };
  DBG.table = ''; dbgMode(DBG_MODES[0]);
  DBG.el.textContent = 'timing each part… (about 25 s)';
}
function benchFrame(now, dt, renderMs) {
  const B = DBG.bench, el = now - B.t0;
  PERF.hold = Math.max(PERF.hold, now + 3000); // (the quality isn't changed while timing)
  PACE.full = true; PACE.wn = 0; PACE.win = 0; // (and every refresh is drawn, so each part's real cost shows)
  if (el > 1000) { B.n++; B.iv += dt; B.rd += renderMs; B.ops += DBG.ops; }
  DBG.ops = 0; DBG.clips = 0;
  if (el < 3000) return;
  const m = DBG_MODES[B.i], fr = B.iv / Math.max(1, B.n);
  B.rows.push(`${(m === 'all' ? 'all on' : 'no ' + m).padEnd(12)}${(1000 / fr).toFixed(0).padStart(3)} fps ${fr.toFixed(1).padStart(5)}ms  draw ${(B.rd / Math.max(1, B.n)).toFixed(1)}  ops ${Math.round(B.ops / Math.max(1, B.n))}`);
  B.i++; B.t0 = now; B.n = 0; B.iv = 0; B.rd = 0; B.ops = 0;
  DBG.el.textContent = B.rows.join('\n') + '\ntiming each part…';
  if (B.i < DBG_MODES.length) { dbgMode(DBG_MODES[B.i]); return; }
  DBG.table = `v${GAME_VERSION} q${qTier} dpr ${DPR}  ${Game.state} ${Game.idx}\n` + B.rows.join('\n');
  DBG.bench = null; DBG.mode = 0; dbgMode('all'); PACE.probeAt = 0;
}
// called each frame: `drew` is whether the world was drawn this frame
function perfWatch(now, drew) {
  const dt = now - PERF.last; PERF.last = now;
  // a change of scene (a lesson starting, a card, the grimoire opening or closing, the window resizing) brings a few
  // slow frames of its own: those aren't held against the phone
  const mode = `${Game.state}|${Game.coverAt ? 1 : 0}|${Grim.open ? 1 : 0}|${innerWidth}x${innerHeight}|${Game.idx}`;
  if (mode !== PERF.mode) { PERF.mode = mode; PERF.hold = Math.max(PERF.hold, now + 2500); }
  if (!drew || document.hidden || dt > 250 || now < PERF.hold) { PERF.n = 0; PERF.sum = 0; return; }
  PERF.n++; PERF.sum += dt;
  if (PERF.n < 60) return;
  const avg = PERF.sum / PERF.n; PERF.n = 0; PERF.sum = 0;
  // two slow spells running before stepping down
  PERF.bad = avg > 22 ? PERF.bad + 1 : 0;
  if (PERF.bad >= 2 && qTier < QUALITY.length - 1) {
    // the step that was too slow isn't tried again for a while (twice as long each time it fails)
    const w = PERF.wait[qTier] || 30000; PERF.block[qTier] = now + w; PERF.wait[qTier] = Math.min(w * 2, 600000);
    PERF.good = 0; PERF.bad = 0; setQuality(qTier + 1, now); return;
  }
  // after a steady spell, the next step up is tried (a step remembered from a slower moment, or one the phone has
  // grown able for), unless it failed lately
  PERF.good = avg < 17.5 ? PERF.good + 1 : 0;
  if (PERF.good >= 6 && qTier > QMIN && now > (PERF.block[qTier - 1] || 0)) { PERF.good = 0; setQuality(qTier - 1, now); }
}
function resize() {
  const Q = QUALITY[qTier];
  BLOOM.on = Q.bloom;
  DPR = Math.min(Q.dpr, window.devicePixelRatio || 1);
  PARTICLE_CAP = qTier >= 2 ? 120 : qTier >= 1 ? 200 : 3000;
  // phones spend less of a frame painting tiles into the cache
  TC_BUDGET = matchMedia('(pointer: coarse)').matches ? 5 : 10;
  SKYP.dpr = Math.min(DPR, 1.25); SKYP.last = -1e9;
  skc.width = Math.round(innerWidth * SKYP.dpr); skc.height = Math.round(innerHeight * SKYP.dpr);
  wc.width = Math.round(innerWidth * DPR); wc.height = Math.round(innerHeight * DPR);
  Grim.resize();
  fitCamera(innerWidth, innerHeight);
}
window.addEventListener('resize', resize);
// coming back to the page (or the browser restoring a lost canvas): every kept drawing is made afresh, in case the
// browser wiped them while the page was away
function refreshAll() { try { refreshCanvases(); } catch (e) { console.warn(e); } Grim.bookDirty = true; Grim.inkDirty = true; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
wc.addEventListener('contextrestored', refreshAll);

// ?touch makes the game behave as on a touch screen even with a mouse (the desktop phone preview uses it)
const QP = new URLSearchParams(location.search);
const FORCE_TOUCH = QP.has('touch');
if (QP.has('framed')) document.body.classList.add('framed');
const mouseAim = e => e.pointerType === 'mouse' && !FORCE_TOUCH;

// Mouse: the preview follows the pointer and a click casts.
// Finger: touch and drag to place the preview; it stays where you lift, and the Cast button in the aim bar sends it.
wc.addEventListener('pointermove', e => {
  if (Game.state !== 'aim') return;
  if (mouseAim(e) || Game.aimDown) { Game.aim = pick(e.clientX, e.clientY); Game.aimReady(); }
});
wc.addEventListener('pointerdown', e => {
  Sfx.init();
  if (Game.state === 'aim') {
    if (e.button === 2) { Game.backToPage(); return; }
    try { wc.setPointerCapture(e.pointerId); } catch (err) { }
    Game.aim = pick(e.clientX, e.clientY); Game.aimDown = true; Game.aimReady();
  } else if (Game.state === 'play' && e.button === 0) {
    Game.toast(isTouch() ? 'Open the grimoire to draft a spell.' : 'Open the grimoire (Space) to draft a spell.');
  }
});
wc.addEventListener('pointerup', e => {
  if (Game.state === 'aim' && Game.aimDown && e.button !== 2) {
    Game.aim = pick(e.clientX, e.clientY); Game.aimReady();
    if (mouseAim(e)) Game.cast();
  }
  Game.aimDown = false;
});
wc.addEventListener('pointercancel', () => { Game.aimDown = false; });
// which kind of hand is holding the quill: hides keyboard hints and switches the aiming style
function setTouch(on) { document.body.classList.toggle('touch', on || FORCE_TOUCH); }
setTouch(matchMedia('(hover: none) and (pointer: coarse)').matches);
window.addEventListener('pointerdown', e => setTouch(e.pointerType !== 'mouse'), true);
wc.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  const k = e.key;
  if (Game.state === 'note' && (k === 'Enter' || k === ' ' || k === 'Escape')) { e.preventDefault(); Game.closeNote(); return; }
  const digit = /^[1-9]$/.test(k) ? +k - 1 : -1;
  if (Game.state === 'draw' && Game.notesOpen()) {
    if (k === 'Escape') { e.preventDefault(); Game.closeNotes(); }
    return;
  }
  if (Game.state === 'draw' && Game.satchelOpen()) {
    if (k === 'Escape') { e.preventDefault(); Game.closeSatchel(); }
    else if (digit >= 0 && Satchel.list[digit]) { Grim.loadStrokes(Satchel.list[digit].strokes); Game.closeSatchel(); }
    else if (k === 'k' || k === 'K') Game.keep();
    return;
  }
  if (Game.state === 'play') {
    if (digit >= 0) Game.quick(digit);
    else if (k === ' ' || k === 'Tab') { e.preventDefault(); Game.openGrimoire(); }
    else if (k === 'z' || k === 'Z') Game.rewind();
    else if (k === 'r' || k === 'R') Game.reset();
    else if (k === 'g' || k === 'G') toggleLook();
  } else if (Game.state === 'draw') {
    if (k === 'Enter') { e.preventDefault(); Grim.inscribe(); }
    else if (k === 'Escape' || k === 'Tab') { e.preventDefault(); Game.closeGrimoire(); }
    else if (k === 'Backspace' || ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z'))) { e.preventDefault(); Grim.undo(); }
    else if (k === 'Delete') Grim.blot();
    else if (k === 'k' || k === 'K') Game.keep();
    else if (digit >= 0 && Satchel.list[digit]) Grim.loadStrokes(Satchel.list[digit].strokes);
  } else if (Game.state === 'aim') {
    if (k === 'Escape') Game.backToPage();
  } else if (Game.state === 'won' && k === 'Enter') Game.next();
});

function bind(id, fn) { $(id).addEventListener('click', e => { Sfx.init(); fn(e); e.currentTarget.blur(); }); }
bind('#bBegin', () => { Game.start(Math.min(Save.data.unlocked - 1, 0)); });
bind('#bContinue', () => Game.lessons());
bind('#bLessonsT', () => Game.lessons());
bind('#bBackTitle', () => Game.title());
bind('#bGrimoire', () => Game.openGrimoire());
bind('#bRewind', () => Game.rewind());
bind('#bReset', () => Game.reset());
bind('#bTipsAgain', e => { Tips.reset(); Sfx.play('tick'); e.currentTarget.textContent = '✓ The tips will show again'; });
bind('#bNote', () => { if (Game.state === 'play') Game.note(); });
bind('#bLessons', () => { if (Grim.open) Grim.hide(); Game.lessons(); });
bind('#bSound', () => { Sfx.setMuted(!Sfx.muted); $('#bSound').classList.toggle('off', Sfx.muted); });
// the look before the paintings and the painted look, side by side in time (button, G, or ?classic in the address)
function toggleLook(quiet) {
  setClassic(!CLASSIC.on); SKYP.last = -1e9;
  $('#bLook').classList.toggle('off', CLASSIC.on);
  if (!quiet) Game.toast(CLASSIC.on ? 'The old look, before the paintings' : 'The painted look');
}
bind('#bLook', () => toggleLook());
if (/[?&]classic(=|&|$)/.test(location.search)) toggleLook(true);
bind('#bStart', () => Game.closeNote());
bind('#bHint', () => { $('#noteHint').classList.add('show'); $('#bHint').style.display = 'none'; });
bind('#bNext', () => Game.next());
bind('#bReplay', () => { Game.start(Game.idx); Game.closeNote(); });
bind('#bWinMenu', () => Game.lessons());
bind('#pInscribe', () => Grim.inscribe());
bind('#pUndo', () => Grim.undo());
bind('#pBlot', () => Grim.blot());
bind('#pRecall', () => Grim.recall());
bind('#pClose', () => Game.closeGrimoire());
bind('#pKeep', () => Game.keep());
bind('#pSatchel', () => Game.openSatchel());
bind('#sKeep', () => Game.keep());
bind('#sClose', () => Game.closeSatchel());
$('#satchel').addEventListener('pointerdown', e => { if (e.target.id === 'satchel') Game.closeSatchel(); });
bind('#pNotes', () => Game.openNotes());
bind('#nBack', () => Game.closeNotes());
bind('#nHintB', () => { $('#nHint').classList.add('show'); $('#nHintB').style.display = 'none'; });
$('#notes').addEventListener('pointerdown', e => { if (e.target.id === 'notes') Game.closeNotes(); });
try { if (!localStorage.getItem('quillsigil.notesSeen')) $('#pNotes').classList.add('beckon'); } catch (e) { }
bind('#aCast', () => Game.cast());
bind('#aBack', () => Game.backToPage());

/* ---------------- Phones: full screen, pausing, offline ---------------- */
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const fsEl = document.documentElement;
const canFull = !standalone && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
if (!canFull) $('#bFull').style.display = 'none';
bind('#bFull', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else { const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => Game.toast('This page may not go full screen here.')); }
});
// hush the music while the game is in the background (switching apps, screen off)
document.addEventListener('visibilitychange', () => {
  if (!Sfx.ctx) return;
  if (document.hidden) Sfx.ctx.suspend(); else if (!PV.isOpen) Sfx.ctx.resume();
});
/* ---------------- Desktop phone preview ----------------
   The game again, in a phone-sized frame, told to behave as on a touch screen.
   Screen in CSS pixels, like a recent Pixel Pro; "browser bars" takes away Chrome's status, address and gesture bars. */
const PV = {
  W: 412, H: 915, land: false, bars: true, isOpen: false,
  open() {
    this.isOpen = true; $('#phoneview').classList.add('show');
    if (Sfx.ctx) Sfx.ctx.suspend();
    if (!$('#pvFrame').src) this.reload();
    this.apply();
  },
  close() {
    this.isOpen = false; $('#phoneview').classList.remove('show');
    $('#pvFrame').removeAttribute('src'); // stop the game inside, and its music
    if (Sfx.ctx && !document.hidden) Sfx.ctx.resume();
  },
  reload() {
    const u = new URL(location.href);
    u.searchParams.set('touch', '1'); u.searchParams.set('framed', '1'); u.searchParams.set('pv', Date.now());
    $('#pvFrame').src = u.href;
  },
  apply() {
    const sw = this.land ? this.H : this.W, sh = this.land ? this.W : this.H;
    const scr = $('#pvScreen'), ph = $('#pvPhone');
    scr.style.width = sw + 'px'; scr.style.height = sh + 'px';
    scr.classList.toggle('land', this.land); scr.classList.toggle('full', !this.bars);
    $('#pvBars').classList.toggle('on', this.bars);
    $('#pvBars').textContent = this.bars ? 'Browser bars: on' : 'Full screen (installed)';
    const stage = $('#phoneview .pv-stage').getBoundingClientRect();
    const k = Math.min(1, (stage.width - 24) / (sw + 22), (stage.height - 12) / (sh + 22));
    ph.style.transform = `scale(${k})`;
    // tell the player the size the game really sees
    requestAnimationFrame(() => { const f = $('#pvFrame'); $('#pvName').textContent = `Pixel Pro · game sees ${f.clientWidth} × ${f.clientHeight}`; });
  },
};
bind('#bPhone', () => PV.open());
bind('#pvClose', () => PV.close());
bind('#pvRotate', () => { PV.land = !PV.land; PV.apply(); });
bind('#pvBars', () => { PV.bars = !PV.bars; PV.apply(); });
bind('#pvReload', () => PV.reload());
window.addEventListener('resize', () => { if (PV.isOpen) PV.apply(); });

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window.self) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

// ornament dividers for the HTML cards
(function () {
  const c = document.createElement('canvas'); c.width = 520; c.height = 60;
  const g = c.getContext('2d');
  fleuron(g, 260, 30, 1.4, '#4a2e1a', '#b8893e');
  g.strokeStyle = '#4a2e1a'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(20, 30); g.lineTo(165, 30); g.moveTo(355, 30); g.lineTo(500, 30); g.stroke();
  g.strokeStyle = '#b8893e'; g.lineWidth = 0.6;
  g.beginPath(); g.moveTo(40, 34); g.lineTo(165, 34); g.moveTo(355, 34); g.lineTo(480, 34); g.stroke();
  document.documentElement.style.setProperty('--divider', `url(${c.toDataURL()})`);
  const c2 = document.createElement('canvas'); c2.width = 640; c2.height = 90;
  const g2 = c2.getContext('2d');
  fleuron(g2, 320, 45, 2.2, '#e8c27a', '#fff0c8');
  g2.strokeStyle = 'rgba(232,194,122,0.8)'; g2.lineWidth = 1.2;
  g2.beginPath(); g2.moveTo(20, 45); g2.lineTo(170, 45); g2.moveTo(470, 45); g2.lineTo(620, 45); g2.stroke();
  for (const x of [20, 620]) { g2.fillStyle = '#e8c27a'; g2.beginPath(); g2.arc(x, 45, 3, 0, TAU); g2.fill(); }
  document.documentElement.style.setProperty('--divider-gold', `url(${c2.toDataURL()})`);
})();

Save.load();
Satchel.load();
Grim.init(document.getElementById('page'));
resize();
Game.title();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Grim.bookDirty = true; });
['700 30px "Cinzel Decorative"', '30px "Pinyon Script"', 'italic 16px "IM Fell English"', '600 12px Cinzel'].forEach(f => { try { document.fonts.load(f).then(() => { Grim.bookDirty = true; }); } catch (e) { } });

let lastT = performance.now(), acc = 0;
const WORLD_PAUSED = new Set(['menu', 'note', 'draw', 'aim']);
const FIXED = 1 / 120;
function loop(now) {
  if (!PV.isOpen) tick(now); else lastT = now; // the phone preview covers this game: let it rest
  requestAnimationFrame(loop);
}
function tick(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05); lastT = Math.max(lastT, now);
  const t = now / 1000;
  // the world holds still while you read, draft in the grimoire, or choose where a seal will fall
  if (!WORLD_PAUSED.has(Game.state)) {
    acc += dt;
    let n = 0;
    while (acc >= FIXED && n < 8) {
      for (const b of World.bodies) { b._px = b.x; b._py = b.y; b._pz = b.z; }
      worldStep(FIXED); acc -= FIXED; n++;
    }
    if (n >= 8) acc = 0;
  }
  for (const S of World.seals) S.t += dt;
  for (let i = World.seals.length - 1; i >= 0; i--) if (World.seals[i].t > 1.6) World.seals.splice(i, 1);
  updateParticles(dt); ambient(dt);
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  wg.setTransform(DPR, 0, 0, DPR, 0, 0);
  // The world moves in fixed 1/120 s steps, but screens refresh at 60, 90 or 120 Hz with a little jitter, so a frame
  // may hold 0, 1 or 2 steps. Drawn as-is, motion stutters (worst at 90 Hz: steps of 1, 1, 2). So bodies are drawn
  // between their last two steps, by how far time has run into the next one; a jump (a respawn) is drawn as it is.
  // once a card has settled over the world, the world behind it holds still and isn't redrawn (it saves the phone's
  // strength, and a canvas busy redrawing under the card can leave holes in it on some phones)
  // (and likewise while the grimoire lies open over it: the world is paused then anyway)
  const covered = (Game.coverAt && now - Game.coverAt > 700) || (Grim.open && Grim.anim >= 1);
  // under a card, the world's buffers are let go too, so the phone has the memory to draw the card whole
  if (covered && Game.coverAt && !Game.released) { Game.released = true; releaseBuffers(); Grim.releaseLayers(); }
  if (!covered) Game.released = false;
  let r0 = 0;
  // On a 120 Hz screen the world is drawn on every refresh while the phone keeps up; when it can't (a frame that
  // misses 8 ms drops Chrome toward a ragged 30-60) it is drawn every other refresh, a steady 60, and full speed is
  // tried again a while later (less often each time it fails). The world steps every refresh either way.
  const rdt = now - PACE.last; PACE.last = now;
  // (the screen's own rate is read while every other frame is skipped, when the refreshes come unhindered)
  if (!PACE.full && rdt > 0 && rdt < 250) PACE.iv = PACE.iv * 0.95 + rdt * 0.05;
  PACE.n++;
  let skipDraw = false;
  if (PACE.iv < 11) {
    if (PACE.full) {
      if (rdt > 0 && rdt < 250) { PACE.win += rdt; PACE.wn++; }
      if (PACE.wn >= 40) {
        const avg = PACE.win / PACE.wn; PACE.win = 0; PACE.wn = 0;
        if (avg > PACE.iv * 1.3) { PACE.full = false; PACE.probeAt = now + PACE.backoff; PACE.backoff = Math.min(PACE.backoff * 2, 60000); }
      }
    } else {
      skipDraw = PACE.n % 2 === 1;
      if (now > PACE.probeAt && !covered && !skipDraw) { PACE.full = true; PACE.win = 0; PACE.wn = 0; }
    }
  } else PACE.full = false;
  if (!covered && !skipDraw) {
    const k = WORLD_PAUSED.has(Game.state) ? 1 : acc / FIXED, held = [];
    if (k < 1) for (const b of World.bodies) {
      if (b._px == null || Math.abs(b.x - b._px) + Math.abs(b.y - b._py) + Math.abs(b.z - b._pz) > 1) continue;
      held.push(b, b.x, b.y, b.z);
      b.x = b._px + (b.x - b._px) * k; b.y = b._py + (b.y - b._py) * k; b.z = b._pz + (b.z - b._pz) * k;
    }
    if (now - SKYP.last >= (qTier >= 2 ? 66 : 38)) {
      SKYP.last = now; skg.setTransform(SKYP.dpr, 0, 0, SKYP.dpr, 0, 0);
      if (DBGOFF.sky) { skg.fillStyle = '#1a1430'; skg.fillRect(0, 0, innerWidth, innerHeight); } else drawSky(skg, innerWidth, innerHeight, t);
    }
    r0 = DEBUG ? performance.now() : 0;
    try { render(wg, innerWidth, innerHeight, t, aimOverlay); }
    finally { for (let i = 0; i < held.length; i += 4) { const b = held[i]; b.x = held[i + 1]; b.y = held[i + 2]; b.z = held[i + 3]; } }
  }
  if (!skipDraw) perfWatch(now, !covered && !PV.isOpen);
  if (DEBUG && !skipDraw) debugFrame(now, covered ? 0 : performance.now() - r0);
  Grim.frame(dt, t);
  Game.update(dt);
  try { Tips.update(dt); } catch (e) { console.error(e); } // a tip must never stop the game
  document.body.classList.toggle('aiming', Game.state === 'aim');
  if (document.body.dataset.state !== Game.state) document.body.dataset.state = Game.state;
}
requestAnimationFrame(loop);

// debug / test hooks
window.QS = { Game, World, Grim, LEVELS, buildSpell, recognize, castSpell, applySpell, Draft, tick, Satchel };
