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
      case 'pop': this.tone(700, 0.09, { f2: 1600, vol: 0.05, rev: 0.3 }); this.noise(0.05, { type: 'highpass', f: 3000, vol: 0.025 }); break; // Unda + Luna's bubble lets go
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
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV', 'XXXVI', 'XXXVII', 'XXXVIII', 'XXXIX', 'XL', 'XLI', 'XLII', 'XLIII', 'XLIV', 'XLV', 'XLVI', 'XLVII', 'XLVIII', 'XLIX', 'L', 'LI', 'LII', 'LIII', 'LIV', 'LV'];
const LEVELS = [
  {
    id: 'first-breath', name: 'First Breath', sigils: ['gale'], par: 1, opens: 'The First Folio',
    lesson: 'A seal is one closed circle with a sigil inside: Ventus, the spiral, calls the wind. A sign, one stroke out from the ring through a small circle, points it. Inscribe the page, then cast it on the orb.',
    hint: 'Circle, a spiral inside, then one stroke out from the ring toward the lower right, the way the font lies from the orb. Cast it right on the orb.',
    t: [' 000000 ', '00000000', '00000000', '00000000', ' 000000 '],
    o: ['........', '........', '.O....G.', '........', '........'],
  },
  // II and III teach barbs on Ventus alone: a plain gust rolls the orb about 5 tiles, one barb about 8, two about 12
  {
    id: 'long-meadow', name: 'The Long Meadow', sigils: ['gale'], par: 1,
    lesson: 'The font lies farther off, the other way. A plain gust dies in the grass, so cross your sign with one short stroke, a barb: the wind blows firmer. Rewind takes back a cast; Recall brings back your last spell.',
    hint: 'Circle, spiral, and a sign toward the upper left (about 10 o’clock, through the small circle there), then one short stroke across the sign, near its tip. Cast it right on the orb.',
    t: [' 00000000 ', '0000000000', '0000000000', '0000000000', ' 00000000 '],
    o: ['..........', '..........', '.G......O.', '..........', '..........'],
  },
  {
    id: 'rift', name: 'The Rift', sigils: ['gale'], par: 1,
    lesson: 'A crack splits the meadow. A firm gust rolls the orb into it; only the strongest wind carries it across in one bound. A sign bears two barbs at most.',
    hint: 'Ventus with a sign toward the upper right (about 2 o’clock, through the small circle there), crossed by two short barbs. Cast it right on the orb.',
    t: [' 000 ', '00000', '00000', '00000', '     ', '00000', '00000', '00000', '00000', '00000', '00000', ' 000 '],
    o: ['.....', '..G..', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '..O..', '.....'],
  },
  {
    id: 'from-the-abyss', name: 'From the Abyss', sigils: ['gale', 'stone'], par: 2,
    lesson: 'Petra, the square, raises stone, even out of empty air: unadorned, one pillar on your mark. Here a sign is an arm of stone running out the way it points; each barb adds a stone.',
    hint: 'Petra with one sign toward the lower right, cast on the near side of the gap. Then Ventus on the orb, its sign crossed by one barb.',
    t: [' 000  0000 ', '0000  00000', '0000  00000', '0000  00000', ' 000  0000 '],
    o: ['...........', '...........', '.O.......G.', '...........', '...........'],
  },
  {
    id: 'thornwall', name: 'Thornwall', sigils: ['gale', 'stone', 'flame'], par: 2,
    lesson: 'Ignis, the triangle, wakes fire. Bramble burns, and fire spreads along whatever will burn, so mind where it leads. The brazier must also be lit before this lesson is done.',
    hint: 'A single Ignis on the hedge: the flames crawl along it to the brazier by themselves. Then Ventus with a twice-barbed sign.',
    t: ['  0  ', ' 000 ', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '00000', ' 000 ', '  0  '],
    o: ['.....', '..O..', '.....', '.....', '.....', '.....', '.....', '#####', 'B....', '.....', '..G..', '.....'],
  },
  {
    id: 'keystone', name: 'Keystone', sigils: ['gale', 'flame'], par: 3,
    lesson: 'A crate fits a trench as a keystone fits an arch, and Ventus moves heavy things as well as light ones, though only gently. The crate is wood, and wood burns.',
    hint: 'One sign of Ventus nudges the crate into the trench. Burn the hedge (away from the crate!), then a sign with two barbs carries the orb across.',
    t: [' 00000_0000 ', '000000_00000', '000000_00000', '000000_00000', ' 00000_0000 '],
    o: ['........#...', '........#...', '.O...C..#.G.', '........#...', '........#...'],
  },
  {
    id: 'sunken-orb', name: 'The Sunken Orb', sigils: ['gale', 'tide'], par: 2,
    lesson: 'Unda, the wave, calls water: one tile of water, one step deep, for each tile of your spell. It fills the lowest place first, and whatever is light rises with it. Too little leaves the hollow part full.',
    hint: 'The hollow holds four tiles of water: Unda cast on it with two signs at right angles along the tiles (2 and 4 o’clock). When the orb floats level with the ground, Ventus with a sign and one barb.',
    t: [' 000 ', '00000', '00000', '00000', '00000', '00000', '00__0', '00__0', '00000', ' 000 '],
    o: ['.....', '..G..', '.....', '.....', '.....', '.....', '..O..', '.....', '.....', '.....'],
  },
  {
    id: 'rushing-stream', name: 'The Rushing Stream', sigils: ['gale', 'tide', 'frost'], par: 2,
    lesson: 'Gelu, the star, stills what moves. Frozen water bears weight, and ice runs swift beneath a rolling orb.',
    hint: 'Gelu on the middle of the stream, two opposite signs along the orb’s way (lower right and upper left): ice three tiles long, bank to bank. Then Ventus with a sign and one or two barbs.',
    t: ['0000~~~00000', '0000~~~00000', '0000~~~00000', '0000~~~00000', '0000~~~00000'],
    o: ['............', '............', '.O........G.', '............', '............'],
    flows: [{ x0: 4, x1: 6, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  // IX, the First Folio's capstone (v177): the road home, every sigil of the folio once, in the order the land asks.
  // The orb sits in a 2x2 hollow (x1-2, rows 2-3); a stream (x4-6) flows across the way; a void gap (x8-9); a hedge (x11)
  // with its brazier at the top (11,0); a crate beside the hedge (12,3); a one-wide trench (x13) just before the font (14,3).
  // Intended (par 6): Unda 2x2 on the hollow (signs at 2 and 4 o'clock), the orb floats level; a plain Ventus (lower right)
  // on the crate nudges it into the trench; Ignis on the hedge away from the crate, the fire runs to the brazier; Gelu
  // across the stream (lower right + upper left, no barbs); Petra, one sign lower right, on the gap's near side: two
  // stones; Ventus with two barbs on the orb. Sim (scratchpad v177s2/cap2.mjs, map b): 9/9 cast offsets.
  // Fails: a one-barb last gust stops short (~x11.3); fire before the crate burns the crate and the orb drops into the
  // trench; leaving out any one step fails with a last gust of 0, 1 or 2 barbs, and with two 2-barb gusts; Petra on the
  // stream instead of Gelu is too slow (stone does not run like ice). No single seal both moves the orb and lights the
  // brazier (no ring here). Creative alternates, same par: Petra lifts the hollow floor instead of Unda; burn first and
  // fill the trench with Petra where the crate stood.
  // Taught in: The Sunken Orb VII (Unda), Keystone VI (crate, wood burns), Thornwall V (brazier), The Rushing Stream VIII
  // (Gelu), From the Abyss IV (Petra over air), The Rift III (two barbs).
  {
    id: 'homeward', name: 'Homeward', sigils: ['gale', 'stone', 'flame', 'tide', 'frost'], par: 6,
    folioEnd: { title: 'The First Folio is Complete', text: 'Water, wind, fire, ice and stone, each in its turn, and the light is home. The master turns to a second folio, where the orb leaves the ground.' },
    lesson: 'The last page of the first folio: every sigil you know, each in its turn. Read the whole road before you draw.',
    hint: 'Unda fills the hollow (signs at 2 and 4 o’clock). A plain gust nudges the crate into the trench, then Ignis on the hedge, away from it. Gelu across the stream, Petra over the gap, then Ventus with two barbs.',
    t: [' 000~~~0  000_0 ', '0000~~~0  000_00', '0__0~~~0  000_00', '0__0~~~0  000_00', '0000~~~0  000_00', '0000~~~0  000_00', ' 000~~~0  000_0 '],
    o: ['...........B....', '...........#....', '...........#....', '..O........#C.G.', '...........#....', '...........#....', '...........#....'],
    flows: [{ x0: 4, x1: 6, y0: 0, y1: 6, dx: 0, dy: 1, s: 3 }],
  },
  {
    id: 'featherfall', name: 'Featherfall', sigils: ['gale', 'luna'], par: 2, opens: 'The Second Folio',
    lesson: 'Luna, the crescent, lifts what rests, and only lifts. A floating orb hangs in the air until wind or water moves it, glides over low ground and open air alike, and settles once it has been carried ten tiles.',
    hint: 'Luna on the orb. While it floats, Ventus on the orb with a barbed sign toward the island (lower left). A gentle gust leaves it hanging short in the air; push it again.',
    t: [' 000 ', '00000', '00000', '00000', '00000', '     ', '     ', '     ', '     ', '11111', '11111', '11111', ' 111 '],
    o: ['.....', '..O..', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '..G..', '.....', '.....'],
  },
  {
    id: 'featherfall-ii', name: 'Featherfall II', sigils: ['gale', 'luna'], par: 3,
    lesson: 'The far island lies more than ten tiles off. Draw an outer circle around the whole seal and Luna’s float carries twice as far. Push the orb as often as you need; it waits in the air.',
    hint: 'Luna on the orb, with an outer circle around the seal. Then Ventus on the floating orb toward the far island (lower right), with a barbed sign, and again when it stops short.',
    t: ['000           000 ', '000           0000', '000           0000', '000           0000', '000           000 '],
    o: ['..................', '..................', '.O.............G..', '..................', '..................'],
  },
  {
    id: 'rune-gate', name: 'The Rune Gate', sigils: ['gale', 'stone', 'flame', 'frost'], par: 3,
    lesson: 'The rune gate sinks only when every brazier burns. Until then nothing passes it, not even a floating orb. Fire melts ice.',
    hint: 'Ignis on the ice beside the orb, sign toward the thorns (upper left): it melts the ice and lights the hedge, which burns to both braziers. Then Gelu on the stream, sign the same way, and Ventus with two barbs.',
    t: ['00000~~00000', '00000~~00000', '22200~~00000', '20000~~00000', '22200~~00000', '00000~~00000', '00000~~00000'],
    o: ['........B...', '........#...', '........#I..', '.GD.....#IO.', '........#I..', '........#...', '........B...'],
    flows: [{ x0: 5, x1: 6, y0: 0, y1: 6, dx: 0, dy: -1, s: 3 }],
  },
  {
    id: 'broad-water', name: 'The Broad Water', sigils: ['gale', 'frost'], par: 4, ring: true,
    lesson: 'An outer circle makes any spell broader, not stronger: a path of ice three tiles wide, a wall three stones thick. The font lies on this bank, past the rocks: the orb must cross the river and come back.',
    hint: 'Gelu on the middle of the river, signs lower right and upper left with a barb each, inside an outer circle. Then three gusts: lower right across, upper right up the ledge, upper left back to the font.',
    // v177: there and back. The orb (1,3) and the font (1,1) share the near bank, but a rock ridge (row 2) parts them
    // (the orb sits in front of the ridge: behind it, at row 1, the camera lost it); the far bank is a walled ledge
    // (x9-10, rows 1-3). Intended: Gelu with the outer circle, signs 1 and 5 one barb, on (6,2): ice x4-8, rows 1-3;
    // Ventus east (it stops at the ledge wall), north (stops at the ledge's end), west home.
    // Sim (scratchpad v177s2/bw2f.mjs): 9/9 offsets, gust barbs 0/0/0 to 2/0/2. A plain Gelu (one or two signs, any barbs,
    // cast anywhere on the river) + three gusts: 0/6925, since one line carries the orb over or back, never both.
    // Creative alternate (bw3f.mjs, 23/375): a plain Gelu with three or four signs is the same block. Two plain lines: par + 1.
    t: ['0000~~~~~222', '0000~~~~~002', '2222~~~~~002', '0000~~~~~002', '0000~~~~~222'],
    o: ['............', '.G..........', '............', '.O..........', '............'],
    flows: [{ x0: 4, x1: 8, y0: 0, y1: 4, dx: 0, dy: 1, s: 3.5 }],
  },
  {
    id: 'skyward', name: 'Skyward', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 7,
    folioEnd: { title: 'The Second Folio is Complete', text: 'The light is home. The master turns to a third folio, where small sigils wait in the margins.' },
    lesson: 'The last page of the second folio. It takes everything you have learned, in the order the land needs it. Read the land before you draw.',
    hint: 'Unda (a 2×2 pool) floats the orb out. Burn the hedge, freeze the stream, and roll the orb to the low wall (one barb, no more). Light the island brazier, then Luna and a gentle gust through the gate.',
    t: [' 000000~~001    ', '2222000~~001 111', '2112000~~001 333', '2112000~~001 113', '2222000~~001 333', '0000000~~001 111', '0000000~~001 111', ' 000000~~001    '],
    o: ['.....#..........', '.....#..........', '.....#..........', '..O..#.......DG.', '.....#..........', '.....#........B.', '.....#..........', '.....#..........'],
    flows: [{ x0: 7, x1: 8, y0: 0, y1: 7, dx: 0, dy: 1, s: 3 }],
  },
  {
    id: 'torchbearer', name: 'Torchbearer', sigils: ['gale', 'flame'], par: 1, ink: 1, combos: true, opens: 'The Third Folio',
    lesson: 'A ring-sigil, a small sigil in one of the eight slots, rides with the spell. Beside the sign (blue) it acts along the way: Ignis there makes a burning orb that lights what it passes. Your ink holds one seal.',
    hint: 'Ventus in the centre, its sign toward the font crossed by two barbs, and a small Ignis in a blue slot beside the sign.',
    t: [' 000000000000 ', '01111011111110', '00000000000000', '01111111111110', ' 000000000000 '],
    o: ['..............', '.....B........', '.O.#..#.#.G...', '..............', '..............'],
  },
  // Rime Road (v177): the river bends into the road itself. It comes up from the bottom (x10-11), turns and runs west down
  // the orb's row against it (x2-11, rows 2-3), then turns up and off the top beside the orb (x2-3). A plain gust drops
  // the orb in and the current sweeps it back and away. Gelu beside the sign (along the way) freezes each tile under the
  // orb as it rolls, an ice road the whole length of the river: gust 0/1/2 barbs with Gelu along x1-3 all win 9/9 cast
  // offsets. Fails 0/9: plain gust 1/2 (and with the outer circle), Gelu at once x1/x3 (its burst round the start never
  // reaches past the first bank), Gelu on arrival x1/x3, Ventus x3 on the ring, Gelu at once x3 + Ventus. Brute (single
  // signs, outer circle or not, up to two ring groups, Ventus or Gelu centre): 180 wins, every one Ventus + Gelu along.
  {
    id: 'rime-road', name: 'Rime Road', sigils: ['gale', 'frost'], par: 1, ink: 1, combos: true,
    lesson: 'Gelu beside the sign rides with the orb, along the way, and freezes the water under it as it rolls. Here the river runs down the road itself.',
    hint: 'Ventus in the centre, its sign toward the font, and a small Gelu in a blue slot beside the sign. The orb freezes its own road as it goes.',
    t: ['00~~0000000000', '00~~0000000000', '00~~~~~~~~~~00', '00~~~~~~~~~~00', '0000000000~~00', '0000000000~~00'],
    o: ['..............', '..............', '.O..........G.', '..............', '..............', '..............'],
    flows: [{ x0: 10, x1: 11, y0: 4, y1: 5, dx: 0, dy: -1, s: 3.5 }, { x0: 4, x1: 11, y0: 2, y1: 3, dx: -1, dy: 0, s: 3.5 }, { x0: 2, x1: 3, y0: 0, y1: 3, dx: 0, dy: -1, s: 3.5 }],
  },
  {
    id: 'ferry', name: 'The Ferry', sigils: ['gale', 'stone', 'luna'], centers: ['gale'], sats: ['stone', 'luna'], par: 1, ink: 1, combos: true,
    lesson: 'Ventus with Luna and Petra behind the sign (at once) raises a floating slab of stone under what you touch, and the wind sails it the way of your sign, rider and all, at an even pace.',
    hint: 'Ventus in the centre, cast right on the orb, its sign toward the far island crossed by two barbs. On the ring, in two of the red circles behind the sign: a small Luna and a small Petra.',
    t: ['000             000', '000             0000', '000             0000', '000             0000', '000             000 '],
    o: ['...................', '...................', '.O...............G.', '...................', '...................'],
  },
  {
    id: 'lantern', name: 'The Lantern', sigils: ['gale', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'Where a ring-sigil sits sets its time: behind the sign, at once; beside it, along the way; ahead of it, on arrival, where the orb comes to rest. Fire lit too soon melts the ice road beneath you.',
    hint: 'Ventus with a twice-barbed sign toward the font, and Ignis in a slot just beside the sign on its forward side (AHEAD): it bursts into flame only when the orb arrives.',
    t: ['0000***0000000', '0000***0000000', '0000***0000000', '0000***0000000', '0000***0000000'],
    o: ['..............', '...........B..', '.O.........G..', '..............', '..............'],
    flows: [{ x0: 4, x1: 6, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  // The Hearth (v177, a burst at once that is not Luna): the brazier stands right behind the orb. Ignis behind the sign
  // (at once) flares where the orb stands as it sets off and kindles it; along the way never touches the tile the orb
  // started on, and on arrival bursts at the far end. Gust 1/2 barbs + Ignis at once x1-3 win 9/9 cast offsets (also with
  // the outer circle); no barbs stops short. Fails 0/9: plain gust, Ignis along x1/x3, Ignis on arrival x1/x3, a gust
  // into the brazier with Ignis along or at once. Brute (single signs, outer circle or not, two ring groups): the only
  // other wins are a bank shot, a sign into the brazier with Ventus x2-3 on arrival throwing the orb back toward the font
  // and Ignis bursting by the brazier (kept as a creative alternate). No Ignis-centre seal wins.
  {
    id: 'hearth', name: 'The Hearth', sigils: ['gale', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'Behind the sign (red), a ring-sigil acts at once: one burst where the orb stands, before it has moved. The brazier is at the orb’s back; kindle it as the orb sets off.',
    hint: 'Ventus in the centre, its sign toward the font crossed by two barbs, and a small Ignis in a red slot behind the sign: it flares where the orb starts.',
    t: [' 0000000000 ', '000000000000', '000000000000', '000000000000', ' 0000000000 '],
    o: ['............', '............', '.BO.......G.', '............', '............'],
  },
  // Confluence (v165): Luna on a ring floats ten tiles per Luna, so the orb starts at x4 (the river now x5-8) and the font
  // (x14) is ten tiles on. Ventus 2 barbs + Luna behind + Ignis ahead (on arrival) wins 9/9 cast offsets (Luna along also
  // 9/9; one barb 1/9, no barbs 0/9). Fails: no Ignis, Ignis at once or along (v165: fire on the orb goes out once it comes
  // to rest, and the glide stops short of the brazier; Ignis at once won 9/9 while it lasted ten tiles), a plain gust. Creative: two Luna
  // (20 tiles, passes over the font) 9/9; Luna in the centre with the outer circle, Ventus and Ignis on arrival 9/9.
  {
    id: 'confluence', name: 'Confluence', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 1, ink: 2, combos: true,
    lesson: 'One seal can carry several sigils. Write a single spell that carries the orb over thorn, water and sky, and kindles the brazier the moment it arrives.',
    hint: 'Ventus in the centre with a twice-barbed sign toward the font. On the ring: Luna behind the sign (float at once) and Ignis in a slot beside the sign on its forward side (burn on arrival).',
    t: ['00000~~~~0   000', '00000~~~~0   000', '00000~~~~0   000', '00000~~~~0   000', '00000~~~~0   000'],
    o: ['.........#......', '.........#....B.', '....O....#....G.', '.........#......', '.........#......'],
    flows: [{ x0: 5, x1: 8, y0: 0, y1: 4, dx: 0, dy: 1, s: 3 }],
  },
  // The Steady Wind (v177): the drift, the glide turned round. Luna in the centre lifts the orb and Ventus on its ring
  // bears it at a steady pace with no air to slow it, for Luna's ten tiles, twenty with the outer circle. The font is 18
  // tiles off over open air, with an islet (x11-15) where the shorter tries come down. Luna + the outer circle, any barbs,
  // Ventus behind or beside the sign (x1-3) wins 9/9 cast offsets. Fails 0/9: no outer circle (ten tiles, down on the
  // islet), Ventus on arrival, every glide (Ventus centre, 0-2 barbs, outer circle or not, Luna x1-3 at once or along:
  // at most 13.4 tiles; the air fades it). Bans, each proved by a sim: Ventus on a gust's ring pushes a glide 18-22 tiles
  // (2 barbs, Luna x2, Ventus x2 wins 9/9), and Luna on Luna's ring floats twenty tiles with no outer circle (wins 9/9).
  // Brute with the bans (single signs, outer circle or not, two ring groups): 45 wins, all Luna + outer circle + Ventus.
  {
    id: 'steady-wind', name: 'The Steady Wind', sigils: ['gale', 'luna'], par: 1, ink: 1, combos: true, ringOf: { gale: ['luna'], luna: ['gale'] },
    lesson: 'A glide fades, slowed by the air. For a drift, Luna in the centre lifts the orb and Ventus on its ring bears it at a steady pace for the whole float, twenty tiles with the outer circle.',
    hint: 'Luna in the centre, cast on the orb, with the outer circle. Its sign toward the font, and a small Ventus in a red slot behind the sign.',
    t: ['000               0000', '000        00000  0000', '000        00000  0000', '000        00000  0000', '000               0000'],
    o: ['......................', '......................', '.O.................G..', '......................', '......................'],
  },
  // Skyward's land again, solved by one compound seal. The hollow's rim throws back a plain Ventus gust, so Luna must
  // lift first (Luna in the centre, Ventus on its ring); the font is 12 tiles off (outer circle); the brazier on the near
  // bank opens the gate, so Ignis must burn along the way (on arrival is too late). Fire on the orb lasts until it comes to
  // rest (v165; v161-164 ten tiles), so even an unbarbed sign carries it to the brazier (b0/1/2 9/9). Simulated at 15 cast offsets each.
  // Since v138 Luna behind a Ventus sign lifts before the gust blows (LIFT_BEAT), so Ventus in the centre with two barbs,
  // Luna behind and Ignis beside also won (9/9); since v165 (Luna on a ring floats ten tiles per Luna) that needs two Luna
  // behind the sign (one runs out short of the 12-tile font). A shut gate can no longer be floated over.
  // v165 (one float-height rule: a float keeps the height it rose from): the float now crosses at the rim's height, so
  // the brazier stands on a two-high plinth (9,4) where the burning orb passes close enough to kindle it.
  // v177: the drift is taught just before (The Steady Wind), so Luna may no longer go on Ventus's ring here: the glide
  // (two barbs, Luna x2 or x3 behind, Ignis beside) won 9/9 and skipped it. The drift still wins 9/9 at 0/1/2 barbs, Ventus
  // at once or along. Two seals still win off par (Featherfall's way: Luna alone with the outer circle, then a gust of two
  // barbs with Ignis along; or Luna alone, then a gust with Ventus x2 on its ring): kept, they cost the star.
  {
    id: 'skyward-redux', name: 'Skyward Redux', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 1, ink: 2, combos: true, ringOf: { gale: ['stone', 'flame', 'tide', 'frost', 'gale'] },
    folioEnd: { title: 'The Third Folio is Complete', text: 'The same land, in a single seal. The master sets the third folio aside and opens a fourth, whose lands take stranger shapes.' },
    lesson: 'The second folio’s last page, written once more. A gust only throws the orb against the rim of its hollow, so the lift must come first, and the rune gate will not wait for fire on arrival.',
    hint: 'Luna in the centre, cast on the orb, with the outer circle (the font is over ten tiles off), sign toward the font. On its ring: Ventus behind the sign, Ignis beside it to light the brazier in passing.',
    t: [' 000000~~001    ', '2222000~~001 111', '2112000~~001 333', '2112000~~001 113', '2222000~~201 333', '0000000~~001 111', '0000000~~001 111', ' 000000~~001    '],
    o: ['.....#..........', '.....#..........', '.....#..........', '..O..#.......DG.', '.....#...B......', '.....#..........', '.....#..........', '.....#..........'],
    flows: [{ x0: 7, x1: 8, y0: 0, y1: 7, dx: 0, dy: 1, s: 3 }],
  },
  /* ---------- The Fourth Folio: lands of strange shape ----------
     Each lesson was simulated (world.js in Node) with its intended seals at nine cast offsets: all win 9/9.
     The notes say which shortcuts were checked and fail. */
  // Beads touching only at their corners, along the land's diagonal (a sign straight across the page). Two beads are
  // missing: Petra with one plain sign to the right, cast on the nearer gap, sets both. The gust needs two barbs (9.9 tiles);
  // Petra cast on a standing bead raises it into a bump the orb cannot climb.
  {
    id: 'bead-chain', name: 'The Bead Chain', sigils: ['gale', 'stone'], par: 2, ink: 2, combos: true, opens: 'The Fourth Folio',
    lesson: 'The land is strung like beads, each touching the next only at a corner, and two beads have fallen. A sign straight across the page runs along the land’s diagonal, corner to corner, for stone as well as wind.',
    hint: 'Petra with one plain sign straight to the right (3 o’clock), cast on the nearer empty place: it sets two beads, corner to corner. Then Ventus on the orb with a sign to the right, crossed by two barbs.',
    t: ['        00', '        00', '       0  ', '      0   ', '          ', '          ', '   0      ', '  0       ', '00        ', '00        '],
    o: ['..........', '........G.', '..........', '..........', '..........', '..........', '..........', '..........', '.O........', '..........'],
  },
  // A crescent shore around still water. v177: its own twist, the three timings sharing one trip. The brazier stands at the
  // orb's back (diagonal, 1.4 tiles), and a rune gate guards the font on the far horn. One seal: Ventus with a plain sign
  // down the diagonal (6 o'clock), Ignis behind the sign (at once: the burst at the start kindles the brazier as the orb
  // sets off) and Gelu beside it (along the way: an ice road). The gate takes 1.6s to sink once the brazier burns (lit at
  // 0.42s, clear at 1.77s): a plain sign reaches it at ~2.2s and wins 9/9 (Ignis x1-3, Gelu x1-2, outer circle too); one or
  // two barbs reach it at 1.3-1.5s, glance off the still-sinking gate and slide into the void (0/9). That is the second
  // aha: no "more power". Fails 0/9 at 0-2 barbs: plain; Gelu alone; Ignis along (melts the road, never reaches behind the
  // start); Ignis on arrival (burst far from the brazier, the orb stopped at the gate); Gelu at once or on arrival (no road).
  // Brute (gust on the orb, every sign, 0-2 barbs, outer circle or not, up to two Ignis/Gelu/Ventus groups): only the
  // intended seal wins (18/14304, all Ventus 6 o'clock, plain sign, Ignis at once + Gelu along).
  {
    id: 'crescent-lagoon', name: 'The Crescent Lagoon', sigils: ['gale', 'frost', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'The brazier stands at the orb’s back; a rune gate guards the font across the water. One seal: fire as the orb sets off, ice along the way. A gate sinks slowly, so do not hurry.',
    hint: 'Ventus on the orb with a plain sign down the page (6 o’clock), no barbs. On the ring: Ignis behind the sign (red: at once, lights the brazier) and Gelu beside it (blue: along the way, the ice road).',
    t: ['  0  ~~~     ', '  00~~~~~~   ', '  00~~~~~~~  ', ' 000~~~~~~~~ ', ' 000~~~~~~~~ ', '0000~~~~~~~~~', '00000~~~~~~~~', '00000~~~~~~~~', ' 000000~~~0~ ', ' 00000000000 ', '  000000000  ', '   0000000   ', '     000     '],
    o: ['..B..........', '...O.........', '.............', '.............', '.............', '.............', '.............', '.............', '..........D..', '...........G.', '.............', '.............', '.............'],
  },
  // Two round isles and a one-tile bridge with its last stone missing, right before the font. Ventus with two barbs and
  // Petra on arrival: as the orb rolls off the broken edge, stone rises beneath it. Measured: no plain gust leaps the gap
  // (0/15 offsets), one barb never reaches it, and Petra behind or beside the sign does not help.
  {
    id: 'broken-causeway', name: 'The Broken Causeway', sigils: ['gale', 'stone'], par: 1, ink: 1, combos: true,
    lesson: 'One stone is missing just short of the font, where the orb has slowed too much to leap. On arrival means where the orb comes to rest, and also the moment the ground runs out beneath it.',
    hint: 'Ventus on the orb, its sign toward the font (lower right) crossed by two barbs, and a small Petra in a green slot ahead of the sign (on arrival). As the orb rolls off the edge, stone rises beneath it.',
    t: ['                ', ' 00             ', '0000        00  ', '0000000000 0000 ', '0000       0000 ', ' 00         00  ', '                '],
    o: ['................', '................', '................', '.O.........G....', '................', '................', '................'],
  },
  // A ring around an empty eye; the font sealed on an islet by four gates; braziers on opposite sides of the ring, 5 tiles
  // from the font. Ignis with opposite two-barbed signs reaches 3 tiles each way, 5 with a Ventus on its ring. Then any
  // float or the ferry carries the orb in.
  {
    id: 'eye', name: 'The Eye', sigils: ['gale', 'stone', 'flame', 'luna'], par: 2, ink: 2, combos: true,
    lesson: 'A sealed font sits in an empty eye; its gates open when both braziers burn. Ventus on the ring of stone, fire, ice or water carries every arm two tiles farther.',
    hint: 'Ignis on the font, two-barbed signs toward both braziers (lower right and upper left), a small Ventus in any slot. Then the ferry: Ventus on the orb toward the font (upper right), Luna and Petra behind the sign.',
    t: ['    00000    ', '   0000000   ', '  00     00  ', ' 00       00 ', '00         00', '00   202   00', '00   000   00', '00   202   00', '00         00', ' 00       00 ', '  00     00  ', '   0000000   ', '    00000    '],
    o: ['.............', '.............', '.............', '.............', '.............', '......D......', '.B...DGD...B.', '......D......', '.............', '.............', '.............', '......O......', '.............'],
  },
  // Isles one step higher each, two tiles of air between them, the font 12 tiles off. Only Luna in the centre with the outer
  // circle and Ventus on its ring wins: the float rides 1.3 above the height it rose from and climbs each step (v165: it never sinks). A bare float runs out,
  // the Ventus + Luna glide falls short, and the ferry's slab cannot climb. (Since v138 the Ventus + Luna glide with two
  // barbs also won: Luna behind the sign lifts before the gust; since v165 it needs two Luna, as one carries only ten tiles.)
  // v177: closed the same way as Skyward Redux: Ventus's ring takes no Luna, so the glide and the ferry cannot be drawn and
  // the drift taught in The Steady Wind is needed.
  {
    id: 'stair-of-isles', name: 'The Stair of Isles', sigils: ['gale', 'stone', 'luna'], par: 1, ink: 1, combos: true, ringOf: { gale: ['stone', 'gale'] },
    lesson: 'Isles climb like steps, each one higher, too far apart to roll and too high to leap. A floating orb never sinks, but where the ground rises beneath it, it rises too; a floating slab does not.',
    hint: 'Luna in the centre, cast on the orb, with the outer circle (the font is over ten tiles off). Its sign toward the high isles (upper right), and a small Ventus behind the sign: a drift up the stair.',
    t: ['       ', '   3   ', '  333  ', '   3   ', '       ', '   2   ', '  222  ', '   2   ', '       ', '   1   ', '  111  ', '   1   ', '  000  ', ' 00000 ', ' 00000 ', ' 00000 ', '  000  '],
    o: ['.......', '.......', '...G...', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '...O...', '.......', '.......'],
  },
  // An eight-pointed rose: four straight arms, four arms of corner-touching beads. The font sealed at the heart, braziers at
  // the ends of one straight arm, 7 tiles off (Ignis with two-barbed signs and two Ventus on its ring). The orb comes down a
  // bead arm with one bead missing: Ventus with two barbs and Petra on arrival. Order matters: an orb sent first stops at the
  // shut gate. (A Luna float or the Ventus + Luna glide also carry it in once the gates are open.)
  {
    id: 'compass-rose', name: 'The Compass Rose', sigils: ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'], par: 2, ink: 2, combos: true,
    lesson: 'The fourth folio’s last page: a rose of eight points, its font sealed at the heart until the braziers at the two farthest points burn. Mind the order of your seals: an orb at a shut gate only waits.',
    hint: 'First Ignis on the font: two-barbed signs toward both braziers, two small Ventus on its ring. Then Ventus on the orb down the page (6 o’clock), two barbs, and Petra in a green slot: stone fills the missing bead.',
    t: ['0      0      0', ' 0     0     0 ', '  0    0    0  ', '   0   0   0   ', '    0  0  0    ', '      0000     ', '     00000     ', '000000000000000', '     00000     ', '     00000     ', '    0  0  0    ', '   0   0   0   ', '  0    0    0  ', ' 0     0     0 ', '0      0      0'],
    o: ['O..............', '...............', '...............', '...............', '...............', '...............', '.......D.......', 'B.....DGD.....B', '.......D.......', '...............', '...............', '...............', '...............', '...............', '...............'],
    folioEnd: { title: 'The Fourth Folio is Complete', text: 'The light rests at the heart of the rose. The master sets the fourth folio aside and opens a fifth, where water runs and ice moves.' },
  },
  /* ---------- The Fifth Folio: water and ice in motion ---------- */
  // A dry millrace, its floor rimed, 12 tiles long; the orb lies at its head and the font on the bank just past its end.
  // One seal: Unda with the outer circle and a two-barbed sign down the race (a run 3 wide, 4 long: 12 tiles of water, the
  // race exactly brimful), Ventus anywhere on its ring (any timing, 1-3 of them): the whole race flows at 3.9 tiles/s and
  // floats the orb out onto the font in about 3s. Less water fails: outer circle + one barb leaves the level at -0.25, so the
  // orb is carried the whole way but sticks under the far lip; no outer circle = 4 tiles of water, far too low. A plain gust
  // cannot climb out of the race. Ventus with Unda behind the sign floats the orb, but still water stops it 4 tiles on
  // (x 6.5); a second push from Ventus ahead (green) gets it to x 12.4 at best (font at 14.5). The rime makes a dry gust
  // slam into the far end and bounce back, so Unda + Ventus on arrival flood the race and then push the orb the wrong way
  // (without the rime, one barb + Unda ahead + three Ventus ahead won). All 672 Ventus-centre seals with Unda/Ventus on the
  // ring fail. Unda without Ventus is still water; right-angle signs make a slanting current that pushes the orb out over the side bank.
  {
    id: 'millrace', name: 'The Millrace', sigils: ['gale', 'tide'], par: 1, ink: 1, combos: true, opens: 'The Fifth Folio',
    lesson: 'A dry millrace, too deep to roll out of, runs from the orb to the font. Unda with Ventus on its ring flows the way of its sign, carrying what floats; fill the race to the brim.',
    hint: 'Unda cast on the orb with the outer circle: the race wants twelve tiles of water. Its sign down the race (lower right), two barbs: a run three wide and four long. Ventus in any slot makes it flow.',
    t: [' 000       0000 ', '0000000000000000', '00____________00', '0000000000000000', ' 000       0000 '],
    o: ['................', '................', '..OfffffffffffG.', '................', '................'],
  },
  // v177 (plan call 8): Unda on a gust's ring. The orb lies in a dry well one tile wide (floor -1); the font is 10 tiles
  // east on the meadow. On a gust's ring Unda behind the sign pours at once, before the wind blows (the lift beat, as Luna
  // does in the glide): the well fills, the orb floats to the brim, and the gust carries it out. Intended: Ventus toward the
  // font (lower right), two barbs, Unda at once x1-3: 9/9. Fails 0/9: a plain, one-barb or two-barb gust (thrown against the
  // wall), the outer circle on a two-barb gust; one barb + Unda at once (out of the well, but short of the font); Unda along
  // the way (never on the start tile, so the well never fills); Ventus x3 on the ring; Unda in the centre with Ventus on its
  // ring (a current; the orb floats but the water stays in the well). A wider well (3x3) never brims: it must be one tile.
  {
    id: 'dry-well', name: 'The Dry Well', sigils: ['gale', 'tide'], par: 1, ink: 1, combos: true,
    lesson: 'The orb lies at the bottom of a dry well, and a gust only throws it against the wall. On a gust’s ring, Unda behind the sign pours at once, before the wind blows: what floats rises with the water.',
    hint: 'Ventus on the orb, its sign toward the font (lower right) crossed by two barbs, and a small Unda behind the sign (red: at once). The well fills, the orb floats to the brim, and the gust carries it out.',
    t: [' 0000000000000', '00000000000000', '00000000000000', '00_00000000000', '00000000000000', '00000000000000', ' 0000000000000'],
    o: ['..............', '..............', '..............', '..O.........G.', '..............', '..............', '..............'],
  },
  // A fast millrace (current 10, three tiles wide) between the meadow and the mill wall; the font sits in a gap in the wall
  // at the level of the channel bed. Intended: Ventus toward the font with two barbs and a small Petra beside the sign
  // (along the way). The heavy orb sinks, the current cannot move it, and it rolls along the bed into the font (9/9).
  // v176: Petra at once now only raises stone under the orb's start and fails 0/9. The water still brakes a heavy orb: with one
  // barb it stops 0.7 tiles short on the bed and, light again once at rest (v165), never reaches the font (0/9).
  // Fail 0/9 at every barb count: plain gust (swept 2+ tiles downstream into the wall, then over the fall); gust toward the
  // upper right (aimed upstream, never gets across); gust toward the lower left; Petra on arrival (n 1–3: it raises the
  // first channel tile as the orb leaves the bank, and the orb still floats over the other two).
  // A sign-less or opposite-signed gust cast beside the orb can aim at any angle: at current 8 it won within 0.15 tile at
  // ~26° upstream; at current 10 no angle or distance wins. Ventus on its own ring adds speed along that angle and won at
  // 10–20° upstream even at current 10, so the ring takes only Petra. Gelu along the way (the Rime Road ice road) crosses any
  // current (9/9 even with one barb), and Luna would float over, so neither is in this lesson's sigils (no ferry either).
  {
    id: 'mill-wall', name: 'The Mill Wall', sigils: ['gale', 'stone'], sats: ['stone'], par: 1, ink: 1, combos: true,
    lesson: 'Fast water sweeps anything floating over the edge; the font sits level with the channel bed. Petra along the way on a gust’s ring turns the orb to stone until it rests: it sinks, and the current cannot take it.',
    hint: 'Ventus on the orb, its sign toward the font (lower right) crossed by two barbs, and a small Petra in a blue slot beside the sign. The heavy orb sinks and rolls across the bed. Fewer barbs stop short.',
    t: ['  000~~~11 ', ' 0000~~~111', '00000~~~111', '00000~~~111', '00000~~~_11', '00000~~~111', '00000~~~111', ' 0000~~~111', '  000~~~11 ', '     ~~~   ', '     ~~~   '],
    o: ['...........', '...........', '...........', '...........', '...O....G..', '...........', '...........', '...........', '...........', '...........', '...........'],
    flows: [{ x0: 5, x1: 7, y0: 0, y1: 10, dx: 0, dy: 1, s: 10 }],
  },
  // A dry millpond (5×4, floor -1) drains into a race two tiles wide that runs down and cuts the road. A raised sill
  // closes the race's foot. Two crates sit side by side in the pond, in line with the race. Seal 1: Unda with one sign
  // down the race and Ventus on its ring. The water fills the whole floor (34 tiles, so a 2-tile shape gives a level of
  // -0.94) and flows. The crates are carried 9 tiles and stop together against the sill, a two-tile bridge at
  // crate-top -0.14. Seal 2: Ventus with two barbs on the orb. 9/9 at nine offsets, whether Unda is cast on the pond or
  // the race, has 0/1/2 barbs, the outer circle, or Ventus in any slot. The crates take ~4.6s with a plain sign; a gust
  // cast 4s after the current is in time. Fails: one-barb gust 0/9 (rolls 8.4 tiles, font is 10). Plain two-barb gust
  // 0/9: the 2-tile race cannot be leapt. Gusting the crates: amp + two barbs moves them 4 tiles, and with 3 Ventus on
  // arrival 4.8 (9.2 needed). Ventus + Unda behind the sign + 2 Ventus beside it, cast on the crates, moves them 3.3.
  // Brimming the race with a 25-tile Unda (still or flowing) only reaches -0.26; the orb floats at -0.39 and cannot
  // climb out. A diagonal current jams the crates on the pond corner. A current toward the font leaves them in the pond.
  // No Petra, Luna or Gelu here (Petra on the race, or a Luna float, would cross it).
  {
    id: 'timber-run', name: 'The Timber Run', sigils: ['gale', 'tide'], par: 2, ink: 2, combos: true,
    lesson: 'A dry race, two tiles wide, cuts the road: too broad for any gust to leap. Two timber crates wait in the pond, beyond the wind’s reach. Timber floats, and flowing water carries it to the race’s end.',
    hint: 'Unda on the dry pond, one sign down the race (lower left, 7:30), a small Ventus in any slot: the crates float to the race’s foot. When they rest, Ventus on the orb toward the font (lower right), two barbs.',
    t: ['     0000000  ', '     0_____0  ', '     0_____0  ', '     0_____0  ', '     0_____0  ', '     000__00  ', '       0__0   ', '       0__0   ', '       0__0   ', '       0__0   ', '00000000__0000', '00000000__0000', '        11    '],
    o: ['..............', '..............', '........CC....', '..............', '..............', '..............', '..............', '..............', '..............', '..............', '..............', '..O.........G.', '..............'],
  },
  // A frozen millrace, the font on a rock islet in it, ringed by eight ice blocks. One seal: Ventus toward the font
  // (lower right) with Petra along the way (beside the sign): the heavy orb crosses the ice and smashes the wall (no barb,
  // 1 or 2 barbs: each 9/9). v176: Petra at once only raises stone under the orb's start (0/9). Checked, all 0/9 at 0–2
  // barbs: plain gust (bounces off the wall); Ignis at once,
  // along or on arrival (the burning orb thaws the race and the current carries it over the falls); Petra on arrival;
  // Ignis or Petra on arrival plus Ventus on arrival; three Ventus on the ring; Petra along plus Ignis along (the heavy
  // orb sinks in the thawed race); Ignis or Petra placed east from the orb with 1–3 Ventus on the ring.
  // Two seals (Ignis on the islet, then a gust) win, but ink is 1. No Luna here, so no float or ferry.
  // v177 alternate, kept: two barbs, Ignis along + Petra on arrival (9/9): the fire melts the blocks and the arrival stone
  // stops the orb before the thawed race sweeps it past. Ignis along alone 0/9; with one barb or none 0/9; Petra at once 1/9.
  // The ice blocks stand on the rock. (An ice block on frozen water ('*') blocks from the ice's top; since v144 it is drawn there too.)
  {
    id: 'icebound-font', name: 'The Icebound Font', sigils: ['gale', 'stone', 'flame'], par: 1, ink: 1, combos: true,
    lesson: 'The font stands on a rock in the frozen race, walled in by ice. Fire would thaw the race too. A stone orb (Petra along the way, on a gust’s ring) smashes ice in its way.',
    hint: 'Ventus on the orb toward the font (lower right), one barb, and a small Petra in a blue slot beside the sign. The heavy orb rolls over the frozen race and smashes the ice around the font.',
    t: ['  00000000   ', ' 000******0  ', '0000******00 ', '0000**000*000', '0000**000*000', '0000**000*000', ' 000******00 ', '  00******0  ', '   0******   ', '    ******   '],
    o: ['.............', '.............', '.............', '......III....', '.O....IGI....', '......III....', '.............', '.............', '.............', '.............'],
    flows: [{ x0: 4, x1: 9, y0: 1, y1: 9, dx: 0, dy: 1, s: 2.5 }],
  },
  // The orb (2,5) is cut off from the font (14,5) by an ice block, a frozen race four wide (current 12, south over the
  // falls), a dam (8,5) and an open leat (current 5 east) ending at a shut gate; braziers at both ends of the row.
  // Seal 1: Ventus toward the font with Petra beside the sign (along the way; v176: at once only raises stone under the
  // orb's start, so it no longer wins; the heavy orb still smashes the block next to its start, since what it breaks is
  // always the tile it moves into): the heavy orb smashes the ice block, crosses
  // the frozen race and waits at the gate (x 11.8), light again once it stops (v165: whatever rides on the orb lasts until
  // it comes to rest, in any slot; v161-164 Petra behind the sign lasted ten tiles, kept the orb heavy and failed). v165:
  // 0, 1 or 2 barbs, either slot, fire 1.5, 3 or 5s later, each 9/9 cast offsets; fire first 0/56 gusts; one gust 0/40. Seal 2: Ignis on the dam, two opposite two-barbed signs along the row
  // and two Ventus on its ring (7 tiles each way): both braziers light, the race thaws behind the orb and the leat carries it
  // through the opening gate (9/9, cast 1.5–5s after seal 1). Fire first fails 0/4 at every barb for every gust tried
  // (plain, amp, Ventus ×3 at any timing, heavy at once or beside, Petra on arrival): the thawed race sweeps it over the
  // falls, or the heavy orb sinks in its bed. A burning orb first goes over the falls; a plain gust bounces off the ice
  // block. Luna, Gelu and Unda are left out: fire then a Luna glide or ferry, fire then Ventus + Gelu (refreezes the race),
  // and fire then an Unda current all win. The dam keeps a heavy orb from rolling along the race bed into the leat.
  {
    id: 'thaw', name: 'The Thaw', sigils: ['gale', 'stone', 'flame'], par: 2, ink: 2, combos: true,
    lesson: 'A frozen race lies between the meadow and the mill; thawed, it sweeps anything over the falls. A stone orb is light again once it rests; an orb at a shut gate only waits. Mind the order of your seals.',
    hint: 'Ventus on the orb toward the font (lower right), Petra beside the sign: the heavy orb crosses and waits at the gate. Then Ignis on the dam, two-barbed signs lower right and upper left, two Ventus on its ring.',
    t: ['    ****        ', '    ****        ', '   1****1       ', ' 001****1000    ', '0001****100001  ', '0000****0~~~~000', '0001****100001  ', ' 001****1000    ', '   1****1       ', '    ****        ', '    ****        '],
    o: ['................', '................', '................', '................', '................', '.BOI.........DGB', '................', '................', '................', '................', '................'],
    flows: [{ x0: 4, x1: 7, y0: 0, y1: 10, dx: 0, dy: 1, s: 12 }, { x0: 9, x1: 12, y0: 5, y1: 5, dx: 1, dy: 0, s: 5 }],
  },
  // The fifth folio's capstone: fire, water, a crate bridge and a heavy orb. A dry millpond (x 5–11, rows 1–4, floor -1)
  // holds four crates (8–11, 2); four ice blocks (8–11, 5) dam its mouth, and a brazier stands on the wall just east of
  // them (12,5). Below them a dry channel four wide (x 8–11) runs down to a sill at the road (row 12), cutting the road
  // between the orb (6,11) and a race two wide (x 13–14, current 20 south over the falls). The font sits in the race's far
  // bank at bed level (15,11), and a rune gate stands in the race in front of it (14,11), shut until the brazier burns.
  // Seal 1 (The Icebound Font, The Eye): Ignis on the left block (8.5,5.5), sign toward the lower right, two barbs, Ventus
  // on its ring: the arm reaches five tiles, so all four blocks melt and the brazier lights (without the Ventus the arm
  // stops at the last block: 0/9). Also lit by W0/E2 on the second block or E1/W1 on the third.
  // Seal 2 (The Millrace, The Timber Run): Unda in the pond (8.5,3.5), one sign down the channel (lower left), Ventus on its
  // ring: the 56-tile pool flows and carries the crates to the sill, a bridge across the channel. The current alone carries
  // them (v165: Ventus on a ring pushes nothing; the crates still reach the sill by t+6, 9/9).
  // Seal 3 (The Mill Wall): Ventus on the orb toward the font, two barbs, Petra beside the sign (along the way; v176): the heavy orb rolls over
  // the crates, along the race bed and through the open gate into the font.
  // v165 (brazier + gate): intended 9/9 at nine offsets; one-barb heavy gust 0/9, light two-barb gust 0/9.
  // The old two-seal shortcut (Petra raising the channel at the road, then the heavy gust) now stops at the shut gate; fire
  // cast after it fails too (the orb's stone wears off at the gate and the race sweeps it over the falls).
  // One seal: 579 cases (every placing seal that lights the brazier, alone; gusts on the orb with Ignis, Petra and Ventus on
  // the ring): none win. Two seals: 702 pairs (Petra lines on the road, the channel and the race, Petra under the orb, a
  // Ventus gust first, then 18 gusts): only the rectangle below wins.
  // Kept on purpose as a creative route (Ryan, 2026-11-08): two seals win when one Petra seal also carries the fire.
  // Petra cast on the channel at the road with right-angle signs (up the page and right), Ignis and 2–3 Ventus on its
  // ring, raises a block of ground from the road to the brazier's row and lights the brazier; then a precise heavy gust
  // wins (1/18 second seals cast at 8.5,11.5, 5/18 at 10.5,11.5; Ignis centred with Petra on its ring, the same). v165:
  // unchanged after Ventus on Petra's ring stopped shoving the orb (the same rates).
  // Three seals that skip the water (allowed as creative routes): any Ignis that lights the brazier, then Petra across
  // the channel at the road, then the heavy gust (9/9).
  {
    id: 'mill-pond', name: 'The Mill Pond', sigils: ['gale', 'tide', 'flame', 'stone'], par: 3, ink: 3, combos: true,
    lesson: 'Ice dams the millpond, where four crates wait, and a dry channel below cuts the road, too wide to leap. The font lies in the fast race beyond, level with its bed; its gate opens when the dam’s brazier burns.',
    hint: 'Ignis on the left ice block: sign lower right, two barbs, Ventus on its ring. Unda in the pond: one sign lower left, Ventus on its ring. Last, Ventus on the orb: two barbs, Petra beside the sign.',
    t: [
      '    000000000~~111', '    0_______0~~111', '    0_______0~~111', '    0_______0~~111', '    0_______0~~111', '    0000____0~~111',
      '       0____0~~111', '       0____0~~111', '       0____0~~111', '       0____0~~111', '00000000____0~~111', '00000000____0~~_11',
      '        1111 ~~   '],
    o: ['..................', '..................', '........CCCC......', '..................', '..................', '........IIIIB.....',
      '..................', '..................', '..................', '..................', '..................', '......O.......DG..',
      '..................'],
    flows: [{ x0: 13, x1: 14, y0: 0, y1: 12, dx: 0, dy: 1, s: 20 }],
    folioEnd: { title: 'The Fifth Folio is Complete', text: 'The millwheel turns again. The master sets the fifth folio aside and opens a sixth, where small sigils ride on stone and water.' },
  },
  /* ---------- The Sixth Folio: sigils upon the placing rings ---------- */
  // Each lesson here says which ring-sigils each centre may carry (ringOf): Ventus carries nothing, so no glide, ferry or
  // heavy orb, and each lesson keeps to the one pairing it teaches.
  // v177 (call 3: a hanging stone's top sits one step above the ground beneath it, over empty air the ground nearest the
  // mark). The orb's land is high (3, x 0-2, orb at 1,3); then a low bank (1, x 3-4), a chasm of void (x 5-7), a low bank
  // (1, x 8-9) and the far land (2, x 10-13, font at 11,3), every row. Seal 1: Petra cast on the near bank, its sign toward
  // the font, Luna and Ventus on its ring (an arm of six covers the bank, the chasm and the far bank): its stones hang
  // with their tops at 2, level with the far land, and the orb drops a step onto them. Seal 2: Ventus on the orb toward the
  // font, two barbs (one barb also carries it). Plain Petra cannot level the way. Stone raised over the chasm comes up level
  // with the mark: cast on a bank or the chasm (mark 1) the chasm sits at 1, below the raised banks; cast on the orb's land
  // (mark 3) the chasm is at 3 and the banks only rise to 2, so the orb drops into them and meets the chasm as a wall; cast
  // back from the far land, the tile before the font rises to 3, a wall. Luna's stones cast from the high land hang at 4
  // over the chasm, and the orb drops beneath them. The stepping stone of v175 is gone. Checker routes in scratchpad
  // checker/solutions.json (hanging-stones).
  {
    id: 'hanging-stones', name: 'The Hanging Stones', sigils: ['gale', 'stone', 'luna'], centers: ['gale', 'stone'], ringOf: { gale: [], stone: ['luna', 'gale'] },
    par: 2, ink: 2, combos: true, opens: 'The Sixth Folio',
    lesson: 'Stone raised over empty air comes up level with the ground you aim at: from the low banks, a step below the far land. Luna on Petra’s ring hangs it a step higher; Ventus stretches the arm.',
    hint: 'Petra on the near low bank, its sign toward the font (lower right), one barb, with a small Luna and two small Ventus on its ring. Then Ventus on the orb toward the font, two barbs.',
    t: [' 3311   11222 ', '33311   112222', '33311   112222', '33311   112222', '33311   112222', '33311   112222', ' 3311   11222 '],
    o: ['..............', '..............', '..............', '.O.........G..', '..............', '..............', '..............'],
  },
  // The orb sits in a sunken pool (3×3 at -1) on an upper isle; the font lies on a lower-left isle across eight rows of void
  // (v165: Luna floats ten tiles per Luna, so the font is 14 tiles off). One seal: Unda on the orb, its sign toward the font
  // (lower left), two or three Luna on its ring: the pool fills, the bubble lifts the orb out and drifts it ten tiles per
  // Luna the way of the sign, passing over the font (9/9 cast offsets, any barbs, with or without the outer circle).
  // Fails: one Luna (the bubble ends at ten tiles over the void, 0/9); a sign any other way; any gust (cannot leave the pool); Unda alone or with the outer
  // circle (still water); Unda + one Luna. Ventus on Unda's ring with Luna gave shortcuts, so Unda takes only Luna here.
  {
    id: 'moon-pool', name: 'The Moon Pool', sigils: ['gale', 'tide', 'luna'], centers: ['gale', 'tide'], ringOf: { gale: [], tide: ['luna'] },
    par: 1, ink: 1, combos: true,
    lesson: 'The orb rests in a sunken pool, too deep for any wind. Luna on Unda’s ring blows a bubble: it lifts what floats into the air and drifts the way of Unda’s sign, ten tiles for each Luna.',
    hint: 'Unda on the orb, its sign toward the font (lower left), with two small Luna on its ring. The bubble lifts the orb out and drifts it over the gap to the font. One Luna falls short.',
    t: [' 00000 ', '0000000', '00___00', '00___00', '00___00', '0000000', ' 00000 ', '       ', '       ', '       ', '       ', '       ', '       ', '       ', '       ', ' 00000 ', '0000000', '0000000', '0000000', ' 00000 '],
    o: ['.......', '.......', '.......', '...O...', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '...G...', '.......', '.......'],
  },
  // A trench one tile wide and four long (x 5–8, row 2, floor -1) cut across the only way to the font, in a neck of land
  // three rows wide; the orb (2,2) cannot climb out of it once in. (The walls beside it went in v161: they only hid the
  // cut. No pair of gusts, nor Unda on the orb then a gust, gets round it on the flat sides; Unda + Gelu cast on the orb
  // with a two-barbed sign toward the font also fills the trench, the same idea.) Seal 1: Unda cast in the trench with Gelu on its ring and a
  // sign crossed by one or two barbs (any direction), or the outer circle: the water freezes as it pours, a slick floor at
  // -0.25 to 0. Seal 2: Ventus on the orb toward the font, two barbs: it glides over the glass to the font (one barb
  // sometimes). Fails: plain gust (stuck in the trench); Unda without Gelu (the orb floats and stops in still water);
  // the gust first; an unbarbed pour (ice at -0.75 or -0.5, too low to climb out of).
  {
    id: 'glass-floor', name: 'The Glass Floor', sigils: ['gale', 'tide', 'frost'], centers: ['gale', 'tide'], ringOf: { gale: [], tide: ['frost'] },
    par: 2, ink: 2, combos: true,
    lesson: 'A narrow trench cuts the only way to the font, and an orb that rolls in cannot climb out. Gelu on Unda’s ring freezes the water as it pours: a floor of ice at the height the water reached.',
    hint: 'Unda cast in the trench, a small Gelu on its ring, its sign (any way) crossed by a barb or two: the trench fills and freezes nearly to the brim. Then Ventus toward the font (lower right), two barbs.',
    t: [' 0000      00000  ', '000000000000000000', '00000____000000000', '000000000000000000', ' 0000      00000  '],
    o: ['..................', '..................', '..O............G..', '..................', '..................'],
  },
  // A long isle with the orb (2,1) seven rows before the void (rows 1-7, a runway), eight rows of void (8-15), then a
  // broad low isle (-1, rows 16-23) with the font (2,20). Seal 1: Petra cast on the first void tile (2.5,8.5), its sign
  // toward the font (lower left), Gelu and Ventus on its ring: an ice bridge. Seal 2 (once it has risen): Ventus on the orb
  // toward the font, two barbs. v165 sim (9 cast offsets): b1V2, b1V3, b2V2, b2V3, b0V3 bridges then gust 2 win 9/9;
  // b0V2, b2V1 1/9; b1V1, b0V1 0/9; any bridge with a one-barb gust 0/9; the ice bridge cast from the orb, then a gust, never.
  // v165 (Ryan): Ventus on Petra's ring no longer shoves an orb on the new stone, and the runway went from 3 rows to 7, which
  // together close the "boring and obvious" stone ways: a plain stone bridge cast on the orb or at the void's edge, then a
  // gust; two Petras cast on the orb; a gust, then Petra cast on the rolling orb. 221 such cases tried, none wins (the orb
  // slows on stone and stops short). An overshooting bridge only raises the low isle's tiles to 0.
  {
    id: 'glass-bridge', name: 'The Glass Bridge', sigils: ['gale', 'stone', 'frost'], centers: ['gale', 'stone'], ringOf: { gale: [], stone: ['frost', 'gale'] },
    par: 2, ink: 2, combos: true,
    lesson: 'A stone bridge could reach the far isle, but the orb slows on stone and stops short. Gelu on Petra’s ring raises the stone as ice, and on ice the orb keeps its speed.',
    hint: 'Petra on the first empty tile past the orb’s isle, its sign toward the font (lower left), one barb, with a small Gelu and two small Ventus on its ring. Then Ventus on the orb toward the font, two barbs.',
    t: [' 000 ', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '     ', '     ', '     ', '     ', '     ', '     ', '     ', '     ', ' ___ ', '_____', '_____', '_____', '_____', '_____', '_____', ' ___ '],
    o: ['.....', '..O..', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '..G..', '.....', '.....', '.....'],
  },
  // v177 (call 9): The Glass Road is gone. Its point (water fills a pit in one pour where stone takes a Petra a step) was
  // told in its text rather than found, its glass floor is The Glass Floor's and its ice bridge The Glass Bridge's, and The
  // Moon Road already joins this folio's sigils. Saves that reached it open The Moon Road (Save.load, GONE).
  // The orb (2,2) sits in a sunken pool (x 1-3, rows 1-3, floor 1) in a block at 2 above a road (x 0-7, rows 11-13, height 2);
  // a chasm of void seven tiles wide (x 8-14), then a far bank at 2 (x 15-21) with the font (19,12) in a one-tile hollow at 0.
  // v177 (step 5): Ryan's solve is the intended one. Three seals, the first two in either order: Unda on the orb, its sign
  // toward the road (lower left), one Luna on its ring (the bubble sets the orb down on the road, 2.5,12.6); Petra cast on
  // the empty air past the road's end (8.5,12.5), its sign toward the font, one barb, Gelu and two Ventus on its ring:
  // stone from empty air comes up level with the nearest ground (the road, 2), so the ice lies level with the road, x 8-14;
  // then Ventus on the orb toward the font, two barbs (one barb also carries it). Also 9/9: b2 V1 or b2 V2 at x8, b2 V1 at
  // x9, Ryan's two signs at x11. The hollow font closes the bubble shortcut (two or three Luna from the pool or the road): a
  // float rides at 3.3 and the font in its hollow catches only up to 2.4, so the bubble passes over it. Fails: the ice cast
  // on the road's end (it rises to 3, a wall); a plain stone bridge (the orb slows and stops); Luna on Petra's ring (since
  // v177 a hanging stone sits a step above the road, at 3, and the orb rolls beneath it into the void; the old hanging-ice
  // answer is gone); any single seal or pair on the orb. Creative route: the ferry (taught in The Ferry). Checker routes in
  // scratchpad checker/solutions.json (moon-road).
  // Taught in: the bubble, The Moon Pool; Ventus lengthening Petra's arm, The Hanging Stones; ice on Petra's ring and stone
  // from empty air, The Glass Bridge; barbs and signed gusts, the first folios.
  {
    id: 'moon-road', name: 'The Moon Road', sigils: ['gale', 'stone', 'tide', 'frost', 'luna'], centers: ['gale', 'stone', 'tide'],
    ringOf: { gale: [], stone: ['luna', 'frost', 'gale'], tide: ['luna'] },
    par: 3, ink: 3, combos: true,
    lesson: 'The font sits low in a hollow, below anything that floats. Stone raised on the road’s end sits a step too high; over empty air it comes up level.',
    hint: 'Unda on the orb toward the road (lower left), one Luna on its ring. Petra past the road’s end, toward the font (lower right), one barb, Gelu and two Ventus on its ring. Ventus toward the font, two barbs.',
    t: [' 222                  ', '21112                 ', '21112                 ', '21112                 ', '22222                 ', '22222                 ', '22222                 ', '22222                 ', '22222                 ', '22222                 ', '22222                 ', '22222222       2222222', '22222222       2222022', ' 2222222       222222 '],
    o: ['......................', '......................', '..O...................', '......................', '......................', '......................', '......................', '......................', '......................', '......................', '......................', '......................', '...................G..', '......................'],
    folioEnd: { title: 'The Sixth Folio is Complete', text: 'A bubble out of the pool, a road of ice over the gap, and the light is home. The master sets the sixth folio aside and opens a seventh, where one gust carries several sigils, each in its own time.' },
  },
  /* ---------- The Seventh Folio: several sigils, several timings, one seal ---------- */
  // The road runs east from the orb (1,2), past a brazier beside its start (1,1) and a brazier by the road (6,1), and breaks
  // one tile short of the font (gap x10, font x11). One seal teaches all three timings: Ventus toward the font (lower right),
  // two barbs, Ignis behind the sign (at once: flares where the orb lies and lights the start brazier), Ignis beside it
  // (along the way: the burning orb lights the road brazier as it passes; it never touches its starting tile) and Petra ahead
  // (on arrival: stone rises as the road runs out) 9/9 cast offsets; two Petra ahead also 9/9 (v176; the brute sweep of 6768
  // seals finds only these shapes). Fails 0/9: the old answer, Ignis along + Petra ahead (the start brazier stays dark);
  // Ignis at once + Petra ahead (the road brazier stays dark); Ignis at once and along without Petra; three Ignis at once or
  // three along; Ignis on arrival instead of along; Petra along or at once instead of ahead; one barb.
  {
    id: 'lamplighters-road', name: 'The Lamplighter’s Road', sigils: ['gale', 'flame', 'stone'], centers: ['gale'], ringOf: { gale: ['flame', 'stone'] },
    par: 1, ink: 1, combos: true, opens: 'The Seventh Folio',
    lesson: 'One brazier stands by the orb, one by the road, and the road ends a stone short of the font. One ring can carry several sigils, even the same sigil twice, each in its own place and time.',
    hint: 'Ventus toward the font (lower right), two barbs. On its ring: Ignis behind the sign (at once, the brazier by the orb), Ignis beside it (along the way, the road brazier) and Petra ahead (on arrival, the gap).',
    t: ['             ', '000  000     ', '0000000000 00', '000          ', '             '],
    o: ['.............', '.B....B......', '.O.........G.', '.............', '.............'] },
  // v177 step 6: the fire height rule's lesson. A mere between two shores; the orb floats along row 2 past two braziers
  // in row 1: one on an islet one step up (6,1), one on a plinth two steps up (10,1) beside the font (11,2). Passing fire
  // lights the islet but not the plinth; the burst on arrival at the font reaches the plinth. One seal: Ventus toward
  // the font (lower right), two barbs, Luna behind, Ignis beside and Ignis ahead 9/9 (Luna along also 9/9). Fails 0/9:
  // Ignis along alone or twice (with the plinth one step up instead, that wins 9/9: the height is what stops it), Ignis on
  // arrival alone or twice, Ignis at once + arrival, the swap, Ventus on the ring in place of Luna. No ringOf: Ventus on
  // its own ring wins nothing here (checked). A falling orb counts from the ground it last rolled on (world.js fireReaches).
  {
    id: 'brazier-on-the-isle', name: 'The Brazier on the Isle', sigils: ['gale', 'flame', 'luna'], centers: ['gale'],
    par: 1, ink: 1, combos: true,
    lesson: 'Passing fire (along the way) lights a brazier on the ground or one step up. A burst (at once or on arrival) reaches one up to two steps high. The islet is one step up, the plinth two.',
    hint: 'Ventus toward the font (lower right), two barbs. On its ring: Luna behind the sign (the orb rises at once), Ignis beside it (passing fire lights the islet) and Ignis ahead (the burst on arrival reaches the plinth).',
    t: ['000~~~~~~~~000', '000~~~1~~~2000', '000~~~~~~~~000', '000~~~~~~~~000', '000~~~~~~~~000'],
    o: ['..............', '......B...B...', '.O.........G..', '..............', '..............'] },
  // The orb's shore (x0-2) faces a far shore (x11-13) across a mere; the brazier is on a plinth two steps high (12,0), the font
  // four rows down that shore (11,5). Ventus toward the far shore (lower right), two barbs, Luna behind and Ignis ahead: the
  // float runs out at x11.6-11.9 and the fire on arrival lights the plinth. Then Ventus toward the font (lower left), any
  // barbs: 9/9. Fails 0/9: the swap (Ignis behind, Luna ahead), Luna and Ignis both on the way, two Ignis at once, Luna
  // alone, one barb, two Luna, Luna beside (v176: it rises only once the orb leaves its tile and counts its ten tiles from
  // there, so the fire on arrival no longer flares by the plinth; v175 9/9). No single seal wins (6768 swept).
  // v176 creative route (taught timings only): Luna behind alone on the first gust, then the gust toward the font with Ignis
  // behind its sign: the fire flares at once where the orb stands, beside the plinth, and lights it (9/9).
  {
    id: 'far-shore', name: 'The Far Shore', sigils: ['gale', 'flame', 'luna'], centers: ['gale'],
    par: 2, ink: 2, combos: true,
    lesson: 'The brazier stands high on the far shore, out of reach of any passing flame, and the font lies farther down that shore. A floating orb settles once it has been carried ten tiles.',
    hint: 'Ventus toward the far shore (lower right), two barbs, with Luna behind the sign (at once) and Ignis ahead (where the float sets it down, the burst reaches the high brazier). Then Ventus toward the font (lower left).',
    t: ['000~~~~~~~~020', '000~~~~~~~~000', '000~~~~~~~~000', '~~~~~~~~~~~000', '~~~~~~~~~~~000', '~~~~~~~~~~~000', '~~~~~~~~~~~000'],
    o: ['............B.', '.O............', '..............', '..............', '..............', '...........G..', '..............'] },
  // v177 step 6: one seal (the channel and plinth went: that second leg repeated The Far Shore). A ledge (x0-3) with a
  // brazier sunk two steps in a hollow (3,1), a chasm nine tiles wide, the font on the far side (14,2). Ventus toward the
  // chasm (lower right), two barbs, Ignis beside and Luna ahead: the rolling orb lights the hollow brazier, floats from the
  // edge and comes down in the font 9/9 (two Luna ahead also 9/9). Fails 0/9: the swap, Luna at once (a floating orb passes
  // over the hollow brazier), Ignis at once, either sigil alone, one barb, Ventus on the ring in place of Luna. No ringOf.
  {
    id: 'leap', name: 'The Leap', sigils: ['gale', 'flame', 'luna'], centers: ['gale'],
    par: 1, ink: 1, combos: true,
    lesson: 'No gust can leap this chasm. The brazier sits low in a hollow by the edge, below anything that floats.',
    hint: 'Ventus toward the chasm (lower right), two barbs. On its ring: Ignis beside the sign (along the way, the rolling orb lights the low brazier) and Luna ahead (on arrival, the orb floats from the edge).',
    t: ['0000         0000', '000=         0000', '0000         0000', '0000         0000'],
    o: ['.................', '...B.............', '.O............G..', '.................'] },
  // The Leap's ledge and chasm, then a longer channel and a road home along the bottom: a brazier on a plinth (15,12), a brazier
  // sunk in the road (9,13), a missing stone (x5) and the font in a pit at the road's end (3,12). Three seals, three orders:
  // Ventus lower right, two barbs, Ignis beside + Luna ahead (leap); Ventus lower left, two barbs, Luna behind + Ignis ahead
  // (lands at 14.2,12.8 and lights the plinth); Ventus upper left, two barbs, Ignis beside + Petra ahead (lights the road brazier,
  // stone fills the gap, the orb rolls into the pit). 9/9. Fails 0/9: each swap, Luna and Ignis both at once on any leg, a
  // leap on the last leg, one barb, ferries on the first two legs; v176 also Luna beside on the second leg (it counts its ten
  // tiles from leaving the tile, so the landing moves off the plinth's reach) and Ignis behind on the third (it flares at the start, far from
  // the road brazier), both 9/9 in v175.
  // Creative: on the last leg a ferry (Luna and Petra behind, Ignis beside) wins whenever the tap lands on the orb's tile.
  {
    id: 'long-round', name: 'The Long Round', sigils: ['gale', 'flame', 'luna', 'stone'], centers: ['gale'], ringOf: { gale: ['flame', 'luna', 'stone'] },
    par: 3, ink: 3, combos: true,
    lesson: 'Over the chasm, down across the water, and home along the road. Three braziers must burn, two low in hollows and one high on a plinth, and the road home is missing a stone. Each crossing wants its own sigils.',
    hint: 'Ventus, two barbs, three times. Toward the chasm (lower right): Ignis beside the sign, Luna ahead. Toward the water (lower left): Luna behind, Ignis ahead. Toward the font (upper left): Ignis beside, Petra ahead.',
    t: ['0000         0000', '000=         0000', '0000         0000', '0000         0000', '             ~~~~', '             ~~~~', '             ~~~~', '             ~~~~', '             ~~~~', '             ~~~~', '             ~~~~', '             ~~~~', '   =0 00000000020', '   00 000=0000000'],
    o: ['.................', '...B.............', '.O...............', '.................', '.................', '.................', '.................', '.................', '.................', '.................', '.................', '.................', '...G...........B.', '.........B.......'],
    folioEnd: { title: 'The Seventh Folio is Complete', text: 'Fire on the way, moonlight at the edge, stone at the last step, and the light is home. The master sets the seventh folio aside.' } },
];
LEVELS.forEach((l, i) => l.roman = ROMAN[i]);
// The Hint button's first step: a nudge toward the idea, short of the answer (the master's hint, `hint`, is the second step)
const NUDGES = {
  'First Breath': 'The wind blows the way your sign points. Which way does the font lie from the orb?',
  'The Long Meadow': 'If the orb stops short, the wind was too gentle. A short stroke across the sign makes it firmer.',
  'The Rift': 'A firm gust only rolls the orb into the crack. It must leap: give the sign all the strength it can bear.',
  'From the Abyss': 'Nothing rolls across empty air, so give the orb ground first. On Petra a sign is an arm of stone: which way must it reach, and from where?',
  'Thornwall': 'You need not burn the whole hedge yourself. Fire travels along whatever will burn.',
  'Keystone': 'The trench must be filled before the orb can cross it. What here is heavy enough to fill it, and what must the fire not touch?',
  'The Sunken Orb': 'No wind lifts the orb out of that hollow. Fill the hollow and the orb rises with the water: count how many tiles it needs.',
  'The Rushing Stream': 'The stream carries off whatever falls in. Make it something the orb can roll across.',
  'Homeward': 'Out of the hollow first, and the crate before the fire: a burning hedge takes the crate with it.',
  'Featherfall': 'Lift first, then push. A floating orb waits in the air for your next gust.',
  'Featherfall II': 'The island lies beyond what an unadorned float can carry. Something drawn around the whole seal carries it farther.',
  'The Rune Gate': 'The gate wants both braziers, and the ice is in the way. One fire, set in the right place, can do several things together.',
  'The Broad Water': 'One line of ice carries the orb over or back, never both. The outer circle makes a spell broader.',
  'Skyward': 'One step at a time, in the order the land asks: out of the hollow, past the hedge, over the stream, then up to the gate.',
  'Torchbearer': 'Let the orb carry the fire to what it touches. A sigil beside the sign travels with the orb.',
  'Rime Road': 'The river runs down the road, against you, and you have one seal. What if the orb froze the water as it rolled?',
  'The Ferry': 'A floating orb soon slows in the air, but a slab of stone sails on at an even pace. Raise one beneath the orb.',
  'The Lantern': 'Fire lit too soon melts the ice road. Where on the ring does a sigil wait until the orb arrives?',
  'The Hearth': 'The brazier is behind the orb, and the orb only goes forward. What flares before it has left?',
  'Confluence': 'The orb must float over thorn and water, then kindle the brazier once it is there. Two ring-sigils, each with its own timing.',
  'The Steady Wind': 'A glide fades, and the font lies far. What if the float came first, and the wind only bore it?',
  'Skyward Redux': 'The orb must rise out of its hollow before anything carries it, and the brazier is passed on the way, not at the end. Mind how far the font lies.',
  'The Bead Chain': 'The beads touch only at their corners. A sign straight across the page runs corner to corner, for stone as well as wind.',
  'The Crescent Lagoon': 'The brazier is behind the orb and the water ahead: two ring-sigils, two timings. If the orb meets the gate still standing, it came too fast.',
  'The Broken Causeway': 'No wind leaps the gap that late. What if the missing stone rose beneath the orb just as the ground ran out?',
  'The Eye': 'Light both braziers first: a shut gate stops even a floating orb. One line of fire can reach them both, if something makes it longer.',
  'The Stair of Isles': 'A Luna float rises when the ground rises. But the font is farther than an unadorned float can carry.',
  'The Compass Rose': 'Fire first: the gates must be open before the orb arrives. Then mind the missing bead on the orb’s arm.',
  'The Millrace': 'Still water only lifts the orb, and a gust soon dies in it. Make the water itself move, and pour enough to fill the race to the brim: count its tiles.',
  'The Dry Well': 'No gust lifts the orb out of the well, but water would. What on a gust’s ring acts before the wind blows?',
  'The Mill Wall': 'Whatever floats here is swept away, and no angle of wind beats the current. What would the orb need to be for the water to leave it where it is?',
  'The Timber Run': 'No wind carries the crates that far, but moving water will. Where does the race end, and what would lie there?',
  'The Icebound Font': 'Fire would melt the wall, and the frozen race under the orb with it. Something heavy breaks ice without melting it.',
  'The Thaw': 'The fire must cross the race to reach both braziers, and a thawed race carries everything over the falls. Cross while it is still frozen.',
  'The Mill Pond': 'The channel is too wide to leap, and the ice holds back anything the water could carry. What could lie across the gap, and what has to go first?',
  'The Hanging Stones': 'Plain stone over the chasm sits level with the low banks, a step below the far land. Something on Petra’s ring could hang it a step higher. Then a gust with two barbs.',
  'The Moon Pool': 'No wind lifts the orb out of its pool, but water would. What could carry the water’s float on across the gap?',
  'The Glass Floor': 'Once in the trench, the orb never climbs out. Fill the trench, and make what fills it hold still.',
  'The Glass Bridge': 'A long enough bridge is not enough: the orb slows on stone and stops before it arrives. What would keep it from slowing?',
  'The Moon Road': 'A bubble out of the pool, a bridge, then a gust. The bridge must lie level with the road, and the orb must not slow on it. Aim it at the empty air.',
  'The Lamplighter’s Road': 'One brazier stands by the orb where it lies, one is passed on the road, and the broken stone is met last. One ring can hold all three, each in its own place.',
  'The Brazier on the Isle': 'The orb passes both braziers, but passing fire only reaches one step up. Which fire reaches two?',
  'The Far Shore': 'Fire that rides with a floating orb stops short of the high brazier. Where does the float set the orb down, and what could flare there?',
  'The Leap': 'A floating orb passes over the low brazier. What if it rolls past the brazier first, and only takes to the air where the ground runs out?',
  'The Long Round': 'Take it one crossing at a time. Whether a brazier sits low or high decides when the fire must burn, and whether the orb may float past it.',
};
LEVELS.forEach(l => l.nudge = NUDGES[l.name] || '');
/* the hint, in two steps: a nudge, then the master's hint. Shown the same in the lesson card and the Notes leaf. */
function renderHint(box, btn, L, step) {
  if (!L.nudge && !L.hint) { box.classList.remove('show'); btn.style.display = 'none'; return; }
  if (step <= 0) { box.classList.remove('show'); box.textContent = ''; btn.textContent = L.nudge ? 'A Nudge' : 'The Master’s Hint'; btn.style.display = ''; return; }
  box.innerHTML = '';
  if (L.nudge) { const n = document.createElement('div'); n.className = 'nudge'; n.textContent = L.nudge; box.append(n); }
  if (step >= 2 || !L.nudge) { const h = document.createElement('div'); h.className = 'master'; h.textContent = L.hint; box.append(h); }
  box.classList.add('show');
  btn.textContent = 'The Master’s Hint'; btn.style.display = step >= 2 || !L.nudge ? 'none' : '';
}
const TITLE_LEVEL = {
  name: 'Title', sigils: [], par: 0, lesson: '', hint: '',
  t: ['  00000  ', ' 0011000 ', '001210~~0', '00110~~00', ' 000~~00 ', '  000~0  '],
  o: ['.........', '.B.......', '....#....', '...#...G.', '.......B.', '.........'],
  flows: [{ x0: 4, x1: 7, y0: 2, y1: 5, dx: 0, dy: 1, s: 1.2 }],
};

/* ---------------- Progress ---------------- */
// (v177) progress is kept by lesson id, not by place in the book, so a lesson put in between never shifts anyone's
// stars. A lesson is open when it comes no later than one past the furthest lesson won, or than the furthest lesson
// the player had reached (reach), so adding a lesson never locks a player out of one already open.
const lessonId = L => L.id || L.name;
// the lessons in their v176 order: the place-keyed saves (v10 and older) are read through this list once
const V10_ORDER = ['first-breath', 'long-meadow', 'rift', 'from-the-abyss', 'thornwall', 'keystone', 'sunken-orb', 'rushing-stream',
  'featherfall', 'featherfall-ii', 'rune-gate', 'broad-water', 'skyward', 'torchbearer', 'rime-road', 'ferry', 'lantern', 'confluence',
  'skyward-redux', 'bead-chain', 'crescent-lagoon', 'broken-causeway', 'eye', 'stair-of-isles', 'compass-rose', 'millrace', 'mill-wall',
  'timber-run', 'icebound-font', 'thaw', 'mill-pond', 'hanging-stones', 'moon-pool', 'glass-floor', 'glass-bridge', 'glass-road',
  'moon-road', 'lamplighters-road', 'brazier-on-the-isle', 'far-shore', 'leap', 'long-round'];
// lessons taken out of the book, and the lesson a save that had reached one now opens on
const GONE = { 'glass-road': 'moon-road' };
const Save = {
  data: { stars: {}, v: 11 },
  idOf(i) { return LEVELS[i] ? lessonId(LEVELS[i]) : undefined; },
  indexOf(id) { return id == null ? -1 : LEVELS.findIndex(L => lessonId(L) === id); },
  starsAt(i) { return (this.data.stars && this.data.stars[this.idOf(i)]) || 0; },
  // how many lessons, from the first, are open
  unlocked() {
    let far = Math.max(0, this.indexOf(this.data.reach));
    LEVELS.forEach((L, i) => { if (this.data.stars[lessonId(L)]) far = Math.max(far, i + 1); });
    return Math.min(LEVELS.length, far + 1);
  },
  won(i, stars) {
    const d = this.data, id = this.idOf(i);
    d.stars[id] = Math.max(d.stars[id] || 0, stars);
    const next = Math.min(LEVELS.length - 1, i + 1);
    if (next > this.indexOf(d.reach)) d.reach = this.idOf(next);
  },
  // (v178) the sigils whose reveal (the sheet that brings a new sigil in) has been shown, by sigil id. A save from
  // before v178 has no list: it counts as seen every sigil a lesson it has already won uses
  seen() {
    const d = this.data;
    if (!Array.isArray(d.seenSigils)) d.seenSigils = [...new Set(LEVELS.flatMap(L => d.stars[lessonId(L)] ? L.sigils : []))];
    return d.seenSigils;
  },
  see(ids) { const s = this.seen(); for (const id of ids) if (!s.includes(id)) s.push(id); this.save(); },
  load() {
    this.read();
    if (Array.isArray(this.data.seenSigils)) return;
    this.seen();
    try { if (localStorage.getItem('quillsigil.v1')) this.save(); } catch (e) { } // (a fresh game saves nothing until it must)
  },
  read() {
    try {
      const s = JSON.parse(localStorage.getItem('quillsigil.v1'));
      if (!s || (s.v >= 11 ? !s.stars : !s.unlocked)) return;
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
      // v144 added the fourth folio after The Compass Rose (index 24): a save that had beaten it was capped at 25 lessons
      if (s.v === 5) {
        if (s.stars[24]) s.unlocked = Math.max(s.unlocked, 26);
        s.v = 6; this.data = s; this.save();
      }
      // v155 added the fifth folio after The Thaw (index 29): a save that had beaten it was capped at 30 lessons
      if (s.v === 6) {
        if (s.stars[29]) s.unlocked = Math.max(s.unlocked, 31);
        s.v = 7; this.data = s; this.save();
      }
      // v165 added The Mill Pond after The Thaw (index 29): the fifth folio moves up one place
      if (s.v === 7) {
        const stars = {};
        for (const k in s.stars) stars[+k >= 30 ? +k + 1 : +k] = s.stars[k];
        s.stars = stars; if (s.unlocked >= 31) s.unlocked = Math.min(LEVELS.length, s.unlocked + 1);
        s.v = 8; this.data = s; this.save();
      }
      // v165 also added The Moon Road after The Glass Road (index 35): a save that had beaten it was capped at 36 lessons
      if (s.v === 8) {
        if (s.stars[35]) s.unlocked = Math.max(s.unlocked, 37);
        s.v = 9; this.data = s; this.save();
      }
      // v10: the Sixth Folio follows The Moon Road; a player who has finished it finds the folio open
      if (s.v === 9) {
        if (s.stars[36]) s.unlocked = Math.max(s.unlocked, 38);
        s.v = 10; this.data = s; this.save();
      }
      // v11 (v177): stars, the furthest lesson open and the lesson last opened are kept by lesson id
      if (s.v === 10) {
        const stars = {}, n = Math.min(V10_ORDER.length, Math.max(1, +s.unlocked || 1));
        for (const k in s.stars) if (V10_ORDER[+k] && s.stars[k]) stars[V10_ORDER[+k]] = s.stars[k];
        const t = { v: 11, stars, reach: V10_ORDER[n - 1] };
        if (Number.isInteger(s.at) && V10_ORDER[s.at]) t.at = V10_ORDER[s.at];
        if (GONE[t.reach]) t.reach = GONE[t.reach];
        if (GONE[t.at]) t.at = GONE[t.at];
        this.data = t; this.save(); return;
      }
      if (!s.stars || typeof s.stars !== 'object') s.stars = {};
      if (GONE[s.reach]) s.reach = GONE[s.reach];
      if (GONE[s.at]) s.at = GONE[s.at];
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
    if (id) this.closeNote();
    this.coverAt = id === 'win' || id === 'note' || id === 'levels' ? performance.now() : 0;
  },
  title() {
    this.state = 'title'; this.level = null; this.playing(null);
    loadWorld(TITLE_LEVEL);
    for (const c of World.cells) if (c.feat === 'brazier') c.lit = true;
    const f = World.fonts[0], b = makeBody('orb', f.x + 0.5, f.y + 0.5, 1);
    b.captured = { x: f.x, y: f.y, h: f.h }; World.bodies.push(b);
    VIEW.z = 1; fitCamera(innerWidth, innerHeight);
    $('#hud').classList.remove('show');
    this.showScreen('title');
    // with lessons won, the big button carries on from the furthest one open (a phone that reloads the page, as
    // Safari does when it runs short of memory or has put the tab away, lands here and would otherwise start at I)
    const at = this.resumeAt();
    $('#bBegin').textContent = at > 0 ? `Continue: Lesson ${LEVELS[at].roman}` : 'Begin the Lessons';
    $('#bContinue').style.display = Save.unlocked() > 1 ? '' : 'none';
  },
  // (v175) the lesson last opened (or the one after the last won), if it is still open; else the furthest one open
  resumeAt() {
    const far = Save.unlocked() - 1, at = Save.indexOf(Save.data.at);
    return Number.isInteger(at) && at >= 0 && at <= far ? at : far;
  },
  // (v175) the lesson in play, kept for this tab only: a reload of the page (the browser putting a heavy tab away and
  // bringing it back, or a refresh) opens that lesson again rather than the title. null: none in play.
  playing(i) {
    try { if (i == null) sessionStorage.removeItem('quillsigil.playing'); else sessionStorage.setItem('quillsigil.playing', Save.idOf(i)); } catch (e) { }
  },
  wasPlaying() {
    try {
      // (kept by lesson id since v177; a number is a place from before, in the v176 order)
      const s = sessionStorage.getItem('quillsigil.playing'), i = s == null ? -1 : Save.indexOf(/^\d+$/.test(s) ? V10_ORDER[+s] : s);
      return i >= 0 && i < Save.unlocked() ? i : -1;
    } catch (e) { return -1; }
  },
  lessons() {
    // the button at the head of the folio goes back to the lesson you were on: one left mid-play carries on where it
    // stood, one just won goes on to the next, and from the title page it is the furthest lesson open
    const from = this.state;
    if (from !== 'menu') {
      this.resumeMid = !!this.level && from !== 'won'; // (the title page has no lesson loaded)
      this.resumeTo = this.resumeMid ? this.idx : from === 'won' ? Math.min(LEVELS.length - 1, this.idx + 1) : this.resumeAt();
    }
    const L0 = LEVELS[this.resumeTo];
    $('#bResume').textContent = `${this.resumeMid ? '↩ Back to' : 'On to'} Lesson ${L0.roman}: ${L0.name}`;
    $('#aimbar').classList.remove('show'); this.held = null; // a seal being aimed is put down
    this.state = 'menu';
    $('#hud').classList.remove('show');
    this.showScreen('levels');
    // the folio is an open book, turned by a swipe, the arrows or the arrow keys; it opens on the lesson ahead
    Folio.build(this.resumeTo);
  },
  resumeLesson() {
    if (!(this.resumeMid && this.level && this.idx === this.resumeTo)) { this.start(this.resumeTo); return; }
    // left mid-play: the page is as it was (its seals cast, its rewinds kept); only the HUD comes back
    this.state = 'play';
    $('#bGrimoire').classList.remove('hidden'); $('#hud').classList.add('show');
    this.showScreen(null);
  },
  start(i) {
    // a restart can come while the grimoire is open or a spell is being aimed (the R key, the button, a lost orb)
    if (Grim.open) Grim.hide();
    Reveal.drop(); // (v178) a sheet left open by a lesson that is being replaced (a custom level opened over a resumed lesson)
    this.closeSatchel(); this.closeNotes();
    $('#aimbar').classList.remove('show'); $('#bGrimoire').classList.remove('hidden');
    // Restarting (or replaying) the same lesson keeps the last drawing for Recall.
    if (i !== this.idx) { Grim.lastStrokes = null; this.hint = 0; } // (the hint already shown stays shown on a restart)
    this.tapped = false;
    this.idx = i; this.level = LEVELS[i]; this.casts = 0; this.history = []; this.winT = 0; this.held = null;
    // (v175) remembered at once, so the title's Continue and a reload of the page both come back to this lesson
    if (Save.data.at !== Save.idOf(i)) { Save.data.at = Save.idOf(i); Save.save(); }
    this.playing(i);
    Grim.draft.clear(); Grim.ghost = null; Grim.bookDirty = true; Grim.inkDirty = true;
    parts.length = 0;
    loadWorld(this.level);
    $('#note').classList.remove('show');
    VIEW.z = 1; fitCamera(innerWidth, innerHeight);
    $('#lnum').textContent = `Lesson ${this.level.roman}`;
    $('#par').textContent = this.level.par;
    $('#ltitle').innerHTML = decoHTML(this.level.name);
    this.updateCasts();
    $('#hud').classList.add('show');
    this.state = 'play';
    this.renderSatchel();
    this.showScreen(null);
    Reveal.maybe(i); // (v178) the first lesson to bring in a sigil opens on its sheet (never a custom level: i is -1)
  },
  note() {
    const L = this.level;
    $('#noteText').textContent = L.lesson;
    this.leafHint();
    $('#noteKeys').style.display = this.idx === 0 ? '' : 'none';
    // (v177) a lesson with ring rules shows them as a legend under the chips, so the chips no longer say "(ring only)";
    // sigils the drawn centre won't take on its ring are greyed
    const R = ringRules(L), ringOnly = id => !R && L.centers && !L.centers.includes(id);
    $('#noteSigils').innerHTML = L.sigils.map(id => `<span class="chip${Grim.ringRefuses(id) ? ' no' : ''}" style="--c:${SIGILS[id].color}"><img src="${glyphIcon(id)}" alt="">${SIGILS[id].name}${ringOnly(id) ? ' <small>(ring only)</small>' : ''}</span>`).join('') + (L.ink ? `<span class="chip ink">ink for ${L.ink} seal${L.ink > 1 ? 's' : ''}</span>` : '');
    $('#noteRings').innerHTML = ringLegendHTML(L);
    $('#noteIn').scrollTop = 0;
    $('#note').classList.add('show');
    fitLand(true);
  },
  closeNote() { if (!this.noteOpen()) return; $('#note').classList.remove('show'); fitLand(true); },
  noteOpen() { return $('#note').classList.contains('show'); },
  // the leaf offers the hint only once it has been asked for (the HUD's Hint button or H)
  leafHint() {
    renderHint($('#noteHint'), $('#bHint'), this.level, this.hint || 0);
    if (!this.hint) $('#bHint').style.display = 'none';
  },
  // one step further into the hint: a nudge first, then the master's hint
  moreHint() {
    const L = this.level; if (!L) return;
    this.hint = Math.min(2, (this.hint || 0) + 1); Sfx.play('page');
    this.leafHint(); renderHint($('#nHint'), $('#nHintB'), L, this.hint);
    if (this.noteOpen()) { fitLand(true); $('#noteIn').scrollTop = $('#noteHint').offsetTop - 10; }
  },
  // the HUD's Hint button: the lesson card, open at the nudge (or as far as the hint has gone)
  openHint() { if (this.state !== 'play') return; this.note(); if (!this.hint) this.moreHint(); },
  reset() { if (!this.level) return; Sfx.play('rewind'); this.start(this.idx); },
  /* the orb fell into the abyss (0.9s ago): the page turns back to before the cast that lost it, as Rewind does, ink
     given back (the toast already said so). h is how many casts were kept when it fell: any cast since is taken back
     too, so the page is never turned back to one where the orb is already falling. Lost before any cast: begin again. */
  lostRewind(h) {
    if (!this.level || this.state === 'won') return;
    if (!(h > 0) || this.history.length < h) { this.start(this.idx); return; }
    while (this.history.length > h) { this.history.pop(); this.casts = Math.max(0, this.casts - 1); }
    restore(this.history.pop()); this.casts = Math.max(0, this.casts - 1); this.updateCasts();
    parts.length = 0; Sfx.play('rewind');
  },
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
    Sfx.init(); this.closeNote();
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
    castSpell(this.held, this.aim.x, this.aim.y, this.aim.z, !!this.aim.air);
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
    $('#aimbar').classList.remove('show'); this.closeNote();
    Sfx.play('win');
    const f = World.fonts[0];
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * TAU, sp = 1 + Math.random() * 4;
      emit({ x: f.x + .5, y: f.y + .5, z: f.h + 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 2 + Math.random() * 7, grav: 4, drag: 0.8, life: 2 + Math.random(), size: 4 + Math.random() * 4, color: ['#ffd27a', '#8ff4ff', '#ffffff', '#cdb0ff'][i % 4], kind: 'glow' });
    }
    const L = this.level, par = L.par;
    const stars = this.casts <= par ? 3 : this.casts <= par + 2 ? 2 : 1;
    Save.won(this.idx, stars);
    // (v175) where the player left off is now the lesson after this one; a reload on the win card goes to the title
    Save.data.at = Save.idOf(Math.min(LEVELS.length - 1, this.idx + 1)); Game.playing(null);
    Save.save();
    const last = this.idx === LEVELS.length - 1, wonIdx = this.idx;
    // (the lesson's wax seal, as its folio entry shows it, fetched now so it is ready when the card stamps it)
    const seal = sealLook(wonIdx), sealSrc = `art/seal-${seal.n + 1}.png?v=2`; new Image().src = sealSrc;
    setTimeout(() => {
      if (this.state !== 'won' || this.idx !== wonIdx) return; // the player has already moved on
      // the last lesson of each folio says so; the very last closes the book
      const end = L.folioEnd || (last && { title: 'The Folio is Complete', text: 'Your seals have carried the light across the sky. The master closes the folio.' });
      $('#winTitle').innerHTML = decoHTML(end ? end.title : 'Lesson Complete');
      const tally = `${this.casts} seal${this.casts === 1 ? '' : 's'} cast. The master's mark is ${par}.`;
      $('#winText').textContent = end ? `${end.text} ${tally}` : tally;
      $('#bNext').style.display = last ? 'none' : '';
      // the seal pressed into the divider (CSS: #win .stamp.go, #win .sheet.thud), started afresh on every win, with a
      // soft thud as it lands (560ms: the press's contact in stampPress)
      const st = $('#winSeal'), sh = $('#win .sheet');
      st.classList.remove('go'); sh.classList.remove('thud');
      st.style.backgroundImage = `url(${sealSrc})`; st.style.setProperty('--tilt', seal.tilt + 'deg'); st.style.setProperty('--sz', seal.size);
      void st.offsetWidth;
      st.classList.add('go'); sh.classList.add('thud');
      this.showScreen('win');
      setTimeout(() => { if (this.state === 'won' && this.idx === wonIdx) Sfx.play('bump', 0.7); }, 560);
    }, 1300);
  },
  next() { if (this.idx < LEVELS.length - 1) this.start(this.idx + 1); else this.lessons(); },

  /* ----- the satchel of kept spells ----- */
  renderSatchel() {
    const allowed = lessonRules();
    const list = $('#satList'), bar = $('#hotbar');
    list.innerHTML = ''; bar.innerHTML = '';
    $('#satCount').textContent = Satchel.list.length || '';
    Grim.fitButtons(); // (the count can crowd the upright plaque's label)
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
      s.title = ok ? `${inf.label}: cast right away (${i + 1})` : `${inf.label}: not used in this lesson`;
      s.innerHTML = `<img src="${inf.img}" alt=""><span class="k">${i + 1}</span>`;
      s.onclick = e => { Sfx.init(); this.quick(i); e.currentTarget.blur(); };
      bar.appendChild(s);
    });
  },
  /* ----- the Notes leaf (phones): the lesson, the sigils and how signs work ----- */
  openNotes() {
    if (this.state !== 'draw' || !this.level) return;
    const L = this.level, R = ringRules(L), ringOnly = id => !R && L.centers && !L.centers.includes(id);
    // the painted look dresses the leaf as the codex page (the old look ◐ keeps the plain sheet)
    const illum = !(typeof CLASSIC !== 'undefined' && CLASSIC.on) && !!GART.page;
    $('#notes').classList.toggle('illum', illum);
    $('#nNum').textContent = `Lesson ${L.roman}`;
    $('#nTitle span').innerHTML = decoHTML(L.name); $('#nTitle span').style.fontSize = '';
    const nt = $('#nText'); nt.textContent = illum ? L.lesson.slice(1) : L.lesson;
    // (the drop cap's capital is chiselled gold drawn on a canvas, as on the desktop page; its lapis field is 50px)
    if (illum) { const c = document.createElement('span'); c.className = 'cap'; c.append(goldCapCanvas(L.lesson[0], 50)); nt.prepend(c); }
    const box = $('#nSigils'); box.innerHTML = '';
    let ahead = 0;
    for (const id of SIGIL_ORDER) {
      const S = SIGILS[id], known = L.sigils.includes(id);
      // (v178) a sigil the player has not met yet is not shown or named: one row at the end counts them
      if (!known && !sigilKnown(id, L)) { ahead++; continue; }
      const b = document.createElement('button');
      b.className = 'nsig' + (known ? '' : ' off') + (known && Grim.ringRefuses(id) ? ' no' : '') + (Grim.ghost === id ? ' on' : '');
      const im = `<img src="${glyphIcon(id)}" alt="" style="background:${known ? S.color : 'transparent'}">`;
      b.innerHTML = (illum ? `<span class="rd">${im}</span>` : im) + `<div><b>${S.name}</b><em>${S.en}</em>` +
        `<span>${known ? (ringOnly(id) ? 'Ring only, this lesson. ' : '') + S.desc : 'Unused this lesson.'}</span></div>`;
      if (known) b.onclick = () => { Grim.ghost = Grim.ghost === id ? null : id; Sfx.play('tick'); this.closeNotes(); };
      else b.disabled = true;
      box.appendChild(b);
    }
    if (ahead) {
      const b = document.createElement('button'); b.className = 'nsig off'; b.disabled = true;
      const im = `<img src="${blankIcon()}" alt="" style="background:transparent">`;
      b.innerHTML = (illum ? `<span class="rd">${im}</span>` : im) + `<div><b>Not yet learned</b><span>${ahead === 1 ? 'One more sigil waits' : ['', '', 'Two', 'Three', 'Four', 'Five'][ahead] + ' more sigils wait'} in later lessons.</span></div>`;
      box.appendChild(b);
    }
    $('#nRings').innerHTML = ringLegendHTML(L); $('#nRingsH').style.display = R ? '' : 'none';
    $('#nSigns').textContent = signNotes(L);
    renderHint($('#nHint'), $('#nHintB'), L, this.hint || 0);
    $('#notes .sheet').scrollTop = 0; $('#notes .nin').scrollTop = 0;
    $('#notes').classList.add('show'); Sfx.play('page');
    if (illum) this.fitNotes();
  },
  // the leaf's painted page and border, drawn to its size (again whenever it changes: a hint shown, the phone turned),
  // and the lesson's name fitted to the cartouche's cream panel (the middle 60% of it)
  fitNotes() {
    const sh = $('#notes .sheet'), t = $('#nTitle'), sp = $('#nTitle span');
    if (!this._notesRO && window.ResizeObserver) {
      this._notesRO = new ResizeObserver(() => { if ($('#notes').classList.contains('illum')) this.fitNotes(); });
      this._notesRO.observe(sh);
    }
    const room = t.clientWidth * 0.5; let fs = Math.min(22, t.clientHeight * 0.36);
    sp.style.fontSize = fs + 'px';
    if (sp.offsetWidth > room) { fs = Math.max(9, fs * room / sp.offsetWidth); sp.style.fontSize = fs + 'px'; }
    // the line box centres the font's em box, and Cinzel's capitals sit high in it: the name is moved down by the
    // difference, so its ink is centred on the panel
    const mg = this._mg || (this._mg = document.createElement('canvas').getContext('2d')), cs = getComputedStyle(sp);
    mg.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const m = mg.measureText(sp.textContent), base = (fs - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
    const drop = fs / 2 - (base - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    sp.style.transform = isFinite(drop) ? `translateY(${drop.toFixed(2)}px)` : '';
    const e =Grim.notesBackdrop($('#nBg'), $('#nFr'));
    if (e) {
      sh.style.setProperty('--nb', Math.round(e + 12) + 'px');
      sh.style.setProperty('--nk', Math.round(Math.max(Grim.notesBoss || 0, e + 1)) + 'px');
    }
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

// (v177) the lesson's ring rules as HTML: each centre's icon, then a dashed ring holding the small icons it takes on its
// ring ("none" when it takes nothing), and last the sigils that may only go on a ring. Empty when the lesson has no rules.
// The groups wrap, so a long combos list stays readable at phone width
function ringLegendHTML(L) {
  const R = ringRules(L); if (!R) return '';
  const ic = (id, cls) => `<img class="${cls}" src="${glyphIcon(id)}" alt="${SIGILS[id].name}" title="${SIGILS[id].name}" style="background:${SIGILS[id].color}">`;
  const groups = R.rows.map(r => `<span class="rg">${ic(r.id, 'rc')}<span class="rp">${r.takes.length ? r.takes.map(id => ic(id, 'rs')).join('') : '<i>none</i>'}</span></span>`);
  if (R.ringOnly.length) groups.push(`<span class="rg">${R.ringOnly.map(id => ic(id, 'rc')).join('')}<i>ring only</i></span>`);
  return `<span class="rl">On each ring</span>${groups.join('')}`;
}
// (v177) the Terms sheet, opened from the folio screen: one short line for each word the lessons lean on. A term shows
// once the lesson that teaches it is open (at); a clause with its own lesson (more) joins it once that lesson is open
const TERMS = [
  { at: 'first-breath', t: 'Seal', d: 'One closed circle with a sigil inside. Inscribe it on the page, then cast it.' },
  { at: 'first-breath', t: 'Sign', d: 'A stroke out from the seal through a small circle. It points the spell.' },
  { at: 'long-meadow', t: 'Barb', d: 'A short stroke across a sign. Each barb makes the spell stronger.', more: ['rift', ' A sign takes two at most.'] },
  { at: 'long-meadow', t: 'Rewind and Recall', d: 'Rewind takes back your last cast. Recall lays your last spell on the page again.' },
  { at: 'from-the-abyss', t: 'Arm', d: 'With stone, ice or water, a sign raises a line running out the way it points; each barb adds a tile. Unadorned, with no sign, one tile.' },
  { at: 'featherfall', t: 'Float', d: 'What Luna gives: the orb hangs in the air, glides over low ground and open air, and settles after ten tiles.' },
  { at: 'featherfall-ii', t: 'Outer circle', d: 'A circle drawn around the whole seal. Around Luna, the float carries twice as far.', more: ['broad-water', ' Around anything else, the spell grows broader, not stronger.'] },
  { at: 'torchbearer', t: 'Ring and slots', d: 'The eight small circles around a seal. A small sigil in a slot, a ring-sigil, rides with the spell.' },
  { at: 'torchbearer', t: 'Ink', d: 'How many seals a lesson lets you cast.' },
  { at: 'torchbearer', t: 'Along the way', d: 'A ring-sigil beside the sign (blue slot) acts all through the journey.' },
  { at: 'ferry', t: 'At once', d: 'A ring-sigil behind the sign (red slot) acts as the spell sets off, before the orb moves.' },
  { at: 'ferry', t: 'On each ring', d: 'The list on a lesson card: what each centre sigil takes on its ring. Anything else is greyed out.' },
  { at: 'lantern', t: 'On arrival', d: 'A ring-sigil ahead of the sign (green slot) acts where the orb comes to rest.', more: ['broken-causeway', ' It also acts the moment the ground runs out beneath it.'] },
  { at: 'hearth', t: 'Burst', d: 'Fire at once or on arrival: one flare where the orb is. Along the way, fire lights what the orb passes instead.' },
  { at: 'steady-wind', t: 'Glide', d: 'A floating orb pushed by wind. It fades, slowed by the air.' },
  { at: 'steady-wind', t: 'Drift', d: 'Luna in the centre with Ventus on its ring: the orb goes at a steady pace for the whole float.' },
  { at: 'eye', t: 'Gold slots', d: 'Only a Ventus or Luna seal keeps time. Around any other sigil the slots stay gold, and any slot will do.' },
  { at: 'brazier-on-the-isle', t: 'Brazier height', d: 'Passing fire lights a brazier on the ground or one step up. A burst reaches two steps up.' },
];
function renderTerms() {
  const open = id => { const i = Save.indexOf(id); return i >= 0 && i < Save.unlocked(); };
  $('#termList').innerHTML = TERMS.filter(T => open(T.at))
    .map(T => `<dt>${T.t}</dt><dd>${T.d}${T.more && open(T.more[0]) ? T.more[1] : ''}</dd>`).join('');
}
function openTerms() { renderTerms(); $('#terms').classList.add('show'); Sfx.play('page'); }
function closeTerms() { $('#terms').classList.remove('show'); }
const termsOpen = () => $('#terms').classList.contains('show');
// (v178) the empty circle that stands for the sigils still to come
function blankIcon() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.strokeStyle = '#2a1830'; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 28, 0, TAU); g.stroke();
  return c.toDataURL();
}
function glyphIcon(id) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#2a1830'; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 28, 0, TAU); g.stroke();
  drawGlyph(g, id, 32, 32, 22, '#2a1830', 3);
  return c.toDataURL();
}

/* ---------------- (v178) The new-sigil sheet ----------------
   The first time a player opens the lesson that first brings in a sigil (found from the order of the lessons), a sheet
   of the satchel's paper shows it: the seal and the sigil draw themselves stroke by stroke in ink, then take the
   sigil's colour, over its name and one plain line. Tap, Enter or Space finishes the drawing, then turns to the next
   sigil or begins the lesson; Escape begins at once. Seen once per sigil (Save.seen), never in a custom level. */
const REVEAL_LINES = {
  gale: 'Wind that pushes everything inside its seal, the way its sign points.',
  stone: 'Raises stone where you cast it, even out of empty air.',
  flame: 'Wakes fire where you cast it. Fire spreads along whatever will burn.',
  tide: 'Calls water. It fills the lowest place first, and light things rise with it.',
  frost: 'Stills what moves. Frozen water bears weight, and the orb rolls fast on ice.',
  luna: 'Lifts what rests. A floating orb waits in the air until wind moves it.',
};
const SHAPE_NAMES = { spiral: 'the spiral', square: 'the square', triangle: 'the triangle', wave: 'the wave', star: 'the star', moon: 'the crescent' };
// the sigils lesson i is the first to use
function newSigilsAt(i) {
  const L = LEVELS[i]; if (!L || i < 0) return [];
  return L.sigils.filter(id => !LEVELS.slice(0, i).some(l => l.sigils.includes(id)));
}
const Reveal = {
  open: false, queue: [], k: 0, t0: 0, raf: 0, drawn: false,
  SEAL: 0.55, INK: 1.25, GILD: 0.45, // seconds: the circle, then the sigil, then its colour (2.25 s in all)
  maybe(i) {
    if (!(i >= 0)) return;
    const seen = Save.seen(), ids = newSigilsAt(i).filter(id => !seen.includes(id));
    if (ids.length) this.show(ids);
  },
  show(ids) {
    Tips.hide();
    this.queue = ids; this.k = 0; this.open = true;
    $('#reveal').classList.add('show');
    this.page();
  },
  page() {
    const id = this.queue[this.k], S = SIGILS[id], last = this.k === this.queue.length - 1;
    $('#rvNum').textContent = this.queue.length > 1 ? `a new sigil · ${this.k + 1} of ${this.queue.length}` : 'a new sigil';
    $('#rvName').textContent = S.name;
    $('#rvEn').textContent = `${S.en} · ${SHAPE_NAMES[S.glyph] || ''}`;
    $('#rvLine').textContent = REVEAL_LINES[id] || '';
    $('#rvGo').textContent = last ? 'Begin' : 'Next';
    const where = document.body.classList.contains('touch') ? 'Tap anywhere' : 'Click anywhere or press Enter';
    $('#rvKeys').textContent = `${where} ${last ? 'to begin' : 'for the next sigil'}.`;
    cancelAnimationFrame(this.raf); this.drawn = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.finish(); return; }
    this.t0 = performance.now();
    const step = now => {
      const t = (now - this.t0) / 1000;
      if (t >= this.SEAL + this.INK + this.GILD) { this.finish(); return; }
      this.draw(t); this.raf = requestAnimationFrame(step);
    };
    this.draw(0); this.raf = requestAnimationFrame(step);
  },
  finish() { cancelAnimationFrame(this.raf); this.raf = 0; this.drawn = true; this.draw(99); },
  // t seconds into the drawing: the seal's circle, the sigil's lines (each in turn, by length), then its colour
  draw(t) {
    const c = $('#rvGlyph'), dpr = Math.min(2, devicePixelRatio || 1), n = Math.round((c.clientWidth || 150) * dpr);
    if (c.width !== n) c.width = c.height = n;
    const g = c.getContext('2d'), S = SIGILS[this.queue[this.k]], R = n / 2 - 4 * dpr, r = R * 0.78, cx = n / 2, cy = n / 2;
    g.clearRect(0, 0, n, n); g.lineCap = 'round'; g.lineJoin = 'round';
    const u = v => Math.max(0, Math.min(1, v)), ease = v => 1 - (1 - v) * (1 - v);
    const us = ease(u(t / this.SEAL)), ui = u((t - this.SEAL) / this.INK), ug = ease(u((t - this.SEAL - this.INK) / this.GILD));
    const ink = '#2a1830';
    g.strokeStyle = ink; g.lineWidth = 2.5 * dpr; // the seal: one circle, from the top, clockwise
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * us); g.stroke();
    const ox = cx + (GLYPH_NUDGE[S.glyph] || 0) * r;
    const lines = glyphLines(S.glyph).map(L => L.map(([x, y]) => [ox + x * r, cy + y * r]));
    const segs = lines.map(L => L.map((p, i) => i ? Math.hypot(p[0] - L[i - 1][0], p[1] - L[i - 1][1]) : 0));
    const lens = segs.map(d => d.reduce((a, b) => a + b, 0)), total = lens.reduce((a, b) => a + b, 0) || 1;
    let head = null;
    const strokeAll = (len, col, w) => { // the first len of the sigil's lines, end to end
      g.strokeStyle = col; g.lineWidth = w; let left = len;
      lines.forEach((L, i) => {
        if (left <= 0) return;
        g.beginPath(); g.moveTo(L[0][0], L[0][1]);
        for (let j = 1; j < L.length && left > 0; j++) {
          const d = segs[i][j];
          if (d <= left) { g.lineTo(L[j][0], L[j][1]); left -= d; head = L[j]; }
          else { const f = left / d; head = [L[j - 1][0] + (L[j][0] - L[j - 1][0]) * f, L[j - 1][1] + (L[j][1] - L[j - 1][1]) * f]; g.lineTo(head[0], head[1]); left = 0; }
        }
        g.stroke();
      });
    };
    if (ug > 0) { g.globalAlpha = 0.55 * ug; strokeAll(total, S.color, 9 * dpr); g.globalAlpha = 1; }
    if (ui > 0) {
      strokeAll(total * ui, ink, 4 * dpr);
      if (ui < 1 && head) { g.fillStyle = ink; g.beginPath(); g.arc(head[0], head[1], 3.4 * dpr, 0, TAU); g.fill(); } // the wet nib
    }
    if (ug > 0) { g.globalAlpha = ug; strokeAll(total, '#c9a24a', 1.3 * dpr); g.globalAlpha = 1; }
  },
  tap() { if (!this.drawn) { this.finish(); return; } this.next(); },
  next() {
    Save.see([this.queue[this.k]]);
    if (this.k < this.queue.length - 1) { this.k++; this.page(); } else this.close();
  },
  close() { if (this.open) { Save.see(this.queue); this.drop(); } },
  // put away without counting the sigils as seen
  drop() {
    if (!this.open) return;
    cancelAnimationFrame(this.raf); this.raf = 0; this.open = false;
    $('#reveal').classList.remove('show');
  },
};
$('#reveal').addEventListener('click', e => { if (e.target.closest('#rvGo')) return; Sfx.init(); Reveal.tap(); });
$('#rvGo').addEventListener('click', e => { Sfx.init(); Reveal.next(); e.currentTarget.blur(); });
// while the sheet is open it takes every key, so nothing reaches the lesson beneath it
window.addEventListener('keydown', e => {
  if (!Reveal.open) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  if (e.key === 'Escape') Reveal.close();
  else if (e.key === 'Enter' || e.key === ' ') Reveal.tap();
}, true);

/* ---------------- Aim preview overlay ---------------- */
function aimOverlay(g, t) {
  if (Game.state !== 'aim' || !Game.aim || !Game.held) return;
  const sp = Game.held, A = Game.aim, s = cam.s;
  const cells = (isLine(sp) || sp.sigil === 'stone' || sp.sigil === 'flame' || sp.sigil === 'frost' || sp.sigil === 'tide') ? spellCells(sp, A.x, A.y) : [];
  g.save();
  // the seal sits on top of what stands on the aimed tile (standTop), or at the picked point itself (empty air, a
  // resting orb or crate)
  const zTop = A.c && !A.body && !A.air ? standTop(A.c) : A.z;
  const tide = sp.sigil === 'tide';
  // stone out of the void comes up or hangs level with the mark, plain or hanging (Luna on Petra's ring), on ground or from
  // empty air (voidStoneZ, world.js; until v175 plain stone from empty air came up at level 0)
  const hangs = sp.sigil === 'stone' && (sp.sats || []).some(s => s.id === 'luna');
  // (v177: a hanging stone's top sits one step above the ground, raiseSlab)
  const zVoid = hangs ? A.z + 1 : sp.sigil !== 'stone' ? A.z : Math.round(voidStoneZ({ air: A.air }, A.z));
  // the whole shape is drawn flat at the seal's height, over the land, so a line or a rectangle reads as one piece:
  // drawn each at its own height, it stepped up onto ice blocks, braziers and gates and down onto ice, and looked
  // broken (v175). Where what a tile's square would stand on (its ground or what stands there, standTop, the way pick
  // aims at it; for stone out of the void, where it will come up) is above or below the plane, a faint line drops to a
  // dot on it. Unda has no dots: its water runs to the lowest of its tiles, and the pool it will make is drawn below
  // and named in the aim bar. Tiles the stone won't touch (raiseSlab, castSpell) are left out
  const shown = [];
  for (const [x, y] of cells) {
    const c = cellI(x, y);
    if (sp.sigil === 'stone' && c.feat && (hangs ? c.feat !== 'font' : c.feat === 'brazier' || c.feat === 'gate' || c.feat === 'font')) continue;
    shown.push([x, y, c, c.void ? zVoid : hangs ? surfaceTop(c) + 1 : standTop(c)]);
  }
  if (!tide) {
    g.strokeStyle = hexA(sp.color, 0.5); g.fillStyle = hexA(sp.color, 0.85); g.lineWidth = 1.2;
    for (const [x, y, , zr] of shown) {
      if (Math.abs(zr - zTop) < 0.05) continue;
      const a = proj(x + 0.5, y + 0.5, zTop), b = proj(x + 0.5, y + 0.5, zr);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.beginPath(); g.ellipse(b[0], b[1], 3 * s, 1.6 * s, 0, 0, TAU); g.fill();
    }
  }
  for (const [x, y, c] of shown) {
    const P = [proj(x, y, zTop), proj(x + 1, y, zTop), proj(x + 1, y + 1, zTop), proj(x, y + 1, zTop)];
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
  // a placed shape keeps its length wherever it is aimed, but the tiles past the map's edge aren't drawn (or cast),
  // so say how many of them land: every tile inside the map counts, void ones (drawn dashed) included
  let fit = '';
  if (cells.length) {
    const whole = spellCells(sp, A.x, A.y, true).length;
    if (whole > cells.length) fit = `${cells.length} of ${whole} tiles on the map`;
  }
  const desc = describeSpell(sp, true) + (fit ? ' · ' + fit : '') + (note ? ' · ' + note : '');
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
    const a = proj(A.x, A.y, zTop + 0.05), b = proj(A.x + sp.dir.x * L, A.y + sp.dir.y * L, zTop + 0.05);
    g.strokeStyle = hexA(sp.color, 0.95); g.lineWidth = 3 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - Math.cos(ang - 0.5) * 12 * s, b[1] - Math.sin(ang - 0.5) * 12 * s);
    g.moveTo(b[0], b[1]); g.lineTo(b[0] - Math.cos(ang + 0.5) * 12 * s, b[1] - Math.sin(ang + 0.5) * 12 * s); g.stroke();
  }
  g.restore();
  g.save(); g.globalCompositeOperation = 'lighter';
  drawSeal(g, sp, A.x, A.y, zTop + 0.04, Math.max(0.8, R || 0.7), 0.55 + 0.2 * Math.sin(t * 4), t * 0.5, 1, t);
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
  fitLand();
}
window.addEventListener('resize', resize);
// the land's frame. While the lesson leaf is out the land is fitted into the room beside it: above it on a phone held
// upright, to its right on wide screens and sideways phones (eased there and back when the leaf comes and goes)
function fitLand(ease) {
  const leaf = $('#note'), open = leaf.classList.contains('show');
  // under the land, the leaf stands just above the grimoire button and the kept-spell slots, however tall they wrap
  leaf.style.setProperty('--above', innerHeight - $('#bottom').getBoundingClientRect().top + 10 + 'px');
  // (v174) a leaf that spans the screen (a phone held upright) stands under the land; a narrow column (wide screens, a
  // phone on its side) beside it. Told apart by the leaf's top (to v173), a tall leaf on an upright phone (large text) counted as
  // "beside", and the land was fitted to the right of a leaf that fills the width: off the screen's edge.
  const top = leaf.offsetTop, under = leaf.offsetWidth > innerWidth * 0.5; // (offset*: the leaf's place without its slide-in)
  const pads = !open ? undefined : under ? [null, innerHeight - top + 12] : [null, null, leaf.offsetLeft + leaf.offsetWidth + 8];
  const from = ease && cam.b && { ...cam.b };
  fitCamera(innerWidth, innerHeight, pads);
  if (from && cam.b) { cam.goal = { ...cam.b }; Object.assign(cam.b, from); applyView(); }
  leafMore();
}
// a leaf too long for its room says so: a soft fade at its foot while more lies below (gone once read to the end)
// (the writing scrolls inside the leaf's still paper, v173)
function leafMore() { const n = $('#noteIn'); $('#note').classList.toggle('more', n.scrollHeight - n.clientHeight - n.scrollTop > 6); }
$('#noteIn').addEventListener('scroll', leafMore, { passive: true });
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
// Two fingers on the land pinch to zoom it and drag to move it; the wheel zooms it under a mouse. A pinch never aims:
// the preview goes back to where it was before the fingers came down.
const FING = new Map(), PINCH = { on: false, used: false, d: 0, mx: 0, my: 0, aim: null };
function pinchSpan() { const [a, b] = [...FING.values()]; return [Math.hypot(a.x - b.x, a.y - b.y) || 1, (a.x + b.x) / 2, (a.y + b.y) / 2]; }
wc.addEventListener('pointermove', e => {
  if (FING.has(e.pointerId)) FING.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (PINCH.on && FING.size >= 2) {
    const [d, mx, my] = pinchSpan();
    zoomView(d / PINCH.d, PINCH.mx, PINCH.my, mx - PINCH.mx, my - PINCH.my);
    PINCH.d = d; PINCH.mx = mx; PINCH.my = my;
    return;
  }
  if (PINCH.used) return;
  if (Game.state !== 'aim') return;
  if (mouseAim(e) || Game.aimDown) { Game.aim = pick(e.clientX, e.clientY); Game.aimReady(); }
});
wc.addEventListener('pointerdown', e => {
  Sfx.init();
  if (e.pointerType === 'touch') {
    // a primary touch means no other finger is down: drop any finger whose pointerup never came, or every later touch is a pinch
    if (e.isPrimary && FING.size) { FING.clear(); PINCH.on = false; }
    if (!FING.size) { PINCH.used = false; PINCH.aim = Game.aim; }
    FING.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (FING.size >= 2) {
      if (!PINCH.on && Game.state === 'aim') { Game.aim = PINCH.aim; Game.aimDown = false; Game.aimReady(); }
      PINCH.on = PINCH.used = true; [PINCH.d, PINCH.mx, PINCH.my] = pinchSpan();
      return;
    }
  }
  if (Game.state === 'aim') {
    if (e.button === 2) { Game.backToPage(); return; }
    try { wc.setPointerCapture(e.pointerId); } catch (err) { }
    Game.aim = pick(e.clientX, e.clientY); Game.aimDown = true; Game.aimReady();
  } else if (Game.state === 'play' && e.button === 0 && !isTouch() && !Game.tapped) {
    Game.tapped = true; Game.toast('Open the grimoire (Space) to draft a spell.');
  }
});
function fingerUp(e) {
  FING.delete(e.pointerId);
  if (FING.size < 2) PINCH.on = false;
  // a lone tap on the land while nothing is being aimed (a pinch is not a tap)
  if (!FING.size && !PINCH.used && e.type === 'pointerup' && Game.state === 'play' && isTouch() && !Game.tapped) { Game.tapped = true; Game.toast('Open the grimoire to draft a spell. Pinch to zoom the land.'); }
}
wc.addEventListener('pointerup', e => {
  if (e.pointerType === 'touch') fingerUp(e);
  if (Game.state === 'aim' && Game.aimDown && e.button !== 2 && !PINCH.used) {
    Game.aim = pick(e.clientX, e.clientY); Game.aimReady();
    if (mouseAim(e)) Game.cast();
  }
  Game.aimDown = false;
});
wc.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') fingerUp(e); Game.aimDown = false; });
wc.addEventListener('wheel', e => {
  if (Game.state !== 'play' && Game.state !== 'aim') return;
  e.preventDefault();
  zoomView(Math.exp(-clamp(e.deltaY, -120, 120) * 0.0015), e.clientX, e.clientY);
}, { passive: false });
// which kind of hand is holding the quill: hides keyboard hints and switches the aiming style
function setTouch(on) { document.body.classList.toggle('touch', on || FORCE_TOUCH); }
setTouch(matchMedia('(hover: none) and (pointer: coarse)').matches);
window.addEventListener('pointerdown', e => setTouch(e.pointerType !== 'mouse'), true);
wc.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  const k = e.key;
  if (termsOpen()) { if (k === 'Escape') { e.preventDefault(); closeTerms(); } return; }
  if (Game.state === 'play' && Game.noteOpen() && k === 'Escape') { e.preventDefault(); Game.closeNote(); return; }
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
    else if (k === 'h' || k === 'H') Game.openHint();
  } else if (Game.state === 'draw') {
    if (k === 'Enter') { e.preventDefault(); Grim.inscribe(); }
    else if (k === 'Escape' || k === 'Tab') { e.preventDefault(); Game.closeGrimoire(); }
    else if (k === 'Backspace' || ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z'))) { e.preventDefault(); Grim.undo(); }
    else if (k === 'Delete') Grim.blot();
    else if (k === 'k' || k === 'K') Game.keep();
    else if (digit >= 0 && Satchel.list[digit]) Grim.loadStrokes(Satchel.list[digit].strokes);
  } else if (Game.state === 'aim') {
    if (k === 'Escape') Game.backToPage();
  } else if (Game.state === 'menu' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
    e.preventDefault(); Folio.go(Folio.at + (k === 'ArrowRight' ? 1 : -1));
  } else if (Game.state === 'won' && k === 'Enter') Game.next();
});

// ---------- the folio of lessons: an open book (v167) ----------
// A wide screen shows the spread (two leaves side by side, the lessons running on from the left page to the right), an
// upright phone one page with the spine down its left edge. The art is a border-image, so its corners keep their shape
// and only the middle stretches; BOOK is in the full-size painting's pixels (2752 x 1536; the phone page is cut from
// x 1290). Each view is a sheet. A turn shows the new sheet beneath, the old one clipped back to the fold, and the
// turning leaf folded flat over the fold line (its back is parchment; in a spread it carries the new left page).
// 2D only: positions and clip-path (a 3D layer split on Firefox for Android and showed the canvas through it).
const BOOK = {
  spread: { w: 2752, b: [230, 332, 236, 335], spine: 1375, outer: 2635, cols: [[335, 1219], [1532, 2420]], rule: [1494, 2464] },
  single: { w: 1462, b: [230, 332, 236, 250], spine: 85, outer: 1345, cols: [[250, 1130]], rule: [204, 1174] },
  h: 1536, top: 52, bot: 1466, ruleY: [171, 1357], ruleIn: 13,
  foot: 1411, // the page number, centred in the margin band between the ruled border and the page's edge
};
const NUM_W = { I: 66, V: 155, X: 153, L: 125 }; // the illuminated letters, 160px tall
const numHTML = r => [...r].map(c => `<img src="art/num-${c}.png?v=1" width="${NUM_W[c]}" height="160" alt="">`).join('');
// a finished lesson's wax seal, pressed by hand: one of six painted seals (all one crimson wax and one gold), a tilt and a
// size, all from a hash of the lesson's name (not its place in the list), so a lesson always gets the same seal. A lesson whose pick
// matches the lesson before it in the same folio steps on to the next seal, so neighbours differ.
const SEAL_N = 6, sealLooks = [];
function sealLook(i) {
  if (sealLooks[i]) return sealLooks[i];
  let h = 0x811c9dc5;
  for (const ch of LEVELS[i].name) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  const next = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return h / 4294967296; };
  let n = Math.floor(next() * SEAL_N);
  if (i > 0 && !LEVELS[i].opens && sealLook(i - 1).n === n) n = (n + 1) % SEAL_N;
  const lerp = (a, b) => a + (b - a) * next();
  return (sealLooks[i] = { n, tilt: lerp(-8, 8).toFixed(1), size: lerp(0.95, 1.03).toFixed(3) });
}
const sealHTML = i => {
  const k = sealLook(i);
  return `<i class="seal" title="Finished" style="background-image:url(art/seal-${k.n + 1}.png?v=2);--tilt:${k.tilt}deg;--sz:${k.size}"></i>`;
};
const Folio = {
  views: [], sheets: [], at: 0, mode: 'single', anim: null, turn: null, resumeTo: 0,
  build(resumeTo) { this.resumeTo = resumeTo; this.finish(); this.render(); this.go(this.viewOf(resumeTo), true); },
  render() { this.layout(); this.paginate(); },
  // the book's size, its border widths and the sizes of the writing, from the room the screen gives it
  layout() {
    const lv = $('#levels'), book = $('#book'), h2 = lv.querySelector('h2');
    const vw = lv.clientWidth, vh = lv.clientHeight, spread = vw >= 600 && vw > vh * 1.1;
    this.mode = spread ? 'spread' : 'single';
    lv.classList.toggle('spread', spread); lv.classList.toggle('single', !spread); lv.classList.toggle('roomy', vh >= 900);
    h2.style.display = (spread ? vh >= 560 : vh >= 820) ? '' : 'none';
    book.className = this.mode; book.style.width = book.style.height = '0px';
    const top = book.getBoundingClientRect().top - lv.getBoundingClientRect().top + lv.scrollTop;
    const reserve = spread && vh >= 560 ? $('#levelsFoot').offsetHeight + 12 + vh * 0.04 : 8;
    const availH = Math.max(spread ? 200 : 380, vh - top - reserve), g = BOOK[this.mode];
    let W, H, s;
    if (spread) {
      H = Math.min(availH, 820); W = Math.min(vw - 128, H * 1.95, 1300);
      if (W < H * 1.45) H = W / 1.45;
      s = Math.min(W / g.w, H / BOOK.h) * (H < 400 ? 0.8 : 1);
    } else {
      W = Math.min(vw - 12, 540); H = Math.min(Math.max(availH, W * 1.05), W * 1.9);
      s = W / g.w * 0.72; // a phone keeps the margins narrow: the writing needs the width
    }
    W = Math.round(W); H = Math.round(H);
    const [bt, br, bb, bl] = g.b.map(v => v * s);
    const mx = (W - bl - br) / (g.w - g.b[3] - g.b[1]), my = (H - bt - bb) / (BOOK.h - g.b[0] - g.b[2]);
    Object.assign(this, { g, W, H, s, mx, my, bt, br, bb, bl });
    const st = book.style;
    st.width = W + 'px'; st.height = H + 'px';
    const colW = (g.cols[0][1] - g.cols[0][0]) * mx, colH = H - bt - bb;
    // the seal about 90px on an upright phone; the numbers and names in proportion
    const seal = Math.round(clamp(Math.min(colW * 0.32, colH * 0.2, 96), 50, 96));
    // the bottom corners that turn the leaf when tapped (v170): a square at each bottom corner of the book, 56-72px on
    // a phone, scaled with the book in a spread; cxn / cxp / cy place the hover hint on the painted page's own corner
    const cz = spread ? Math.max(56, Math.round(240 * s)) : clamp(Math.round(340 * s), 56, 72);
    const vars = { bt, br, bb, bl, seal, numh: Math.round(seal * 0.42), namefs: clamp(Math.round(seal * 0.25), 14, 23),
      headfs: clamp(Math.round(colW * 0.074), 16, 30), epad: Math.round(seal * 0.08), cz, tip: Math.round(cz * 0.3),
      cxn: Math.round(W - this.x(g.outer)), cxp: Math.round(this.x(spread ? g.w - g.outer : g.spine)), cy: Math.round(H - this.y(BOOK.bot)) };
    for (const k in vars) st.setProperty('--' + k, vars[k] + 'px');
  },
  // painting x / y to the book on screen (the border slices scale by s, the middle by mx / my)
  x(px) { const g = this.g; return px <= g.b[3] ? px * this.s : px >= g.w - g.b[1] ? this.W - (g.w - px) * this.s : this.bl + (px - g.b[3]) * this.mx; },
  y(py) { const g = this.g; return py <= g.b[0] ? py * this.s : py >= BOOK.h - g.b[2] ? this.H - (BOOK.h - py) * this.s : this.bt + (py - g.b[0]) * this.my; },
  entryHTML(i) {
    const L = LEVELS[i], locked = i >= Save.unlocked(), done = !!Save.starsAt(i);
    const label = `Lesson ${L.roman}: ${locked ? 'locked' : L.name}${done ? ', finished' : ''}`;
    return `<button class="lentry${locked ? ' locked' : ''}${done ? ' done' : ''}${i === this.resumeTo ? ' here' : ''}" data-i="${i}" aria-label="${label}"${locked ? ' aria-disabled="true"' : ''}>`
      + `<span class="ltext"><span class="lnum">${numHTML(L.roman)}</span><span class="lname">${locked ? '· locked ·' : L.name}</span></span>`
      + `${done ? sealHTML(i) : '<i></i>'}</button>`;
  },
  // the lessons written onto leaves: each folio starts a new leaf under its title (in a spread that may be the right
  // page) and fills it before going on to the next, under a running head; only a folio's last leaf is left part empty.
  // Each leaf is measured whole as it fills (title, lessons, page number), and a lesson goes on only while the leaf
  // stays FIT_PAD px short of the page, so no row is ever cut off and a pixel or two of screen does not change the book
  paginate() {
    // the column runs down to just above the inner ruled line (the page number sits below the ruled border)
    const book = $('#book'), g = this.g, colW = (g.cols[0][1] - g.cols[0][0]) * this.mx;
    const ext = Math.max(0, (BOOK.ruleY[1] - BOOK.ruleIn - 6 - (BOOK.h - g.b[2])) * this.s), colH = this.H - this.bt - this.bb + ext;
    const FIT_PAD = 4, room = colH - FIT_PAD, footTop = this.y(BOOK.foot) - this.bt;
    book.innerHTML = '';
    const m = document.createElement('div'); m.className = 'bk-col bk-measure';
    m.style.cssText = `width:${colW}px;bottom:auto`; book.appendChild(m);
    const folios = [];
    LEVELS.forEach((L, i) => { if (L.opens || !folios.length) folios.push({ title: L.opens || 'The Folio', items: [] }); folios[folios.length - 1].items.push(i); });
    const leaves = [];
    for (const F of folios) {
      for (let j = 0; j < F.items.length;) {
        const first = j === 0, items = [];
        m.innerHTML = (first ? `<div class="bk-head">${decoHTML(F.title)}</div>` : `<div class="bk-run">${F.title}</div>`)
          + '<div class="bk-list"></div>';
        const list = m.querySelector('.bk-list');
        // (a leaf always takes at least one lesson, however tall)
        while (j < F.items.length) {
          list.insertAdjacentHTML('beforeend', this.entryHTML(F.items[j]));
          if (items.length && m.getBoundingClientRect().height > room) { list.lastElementChild.remove(); break; }
          items.push(F.items[j++]);
        }
        leaves.push({ title: F.title, first, items });
      }
    }
    m.remove();
    const per = this.mode === 'spread' ? 2 : 1, nv = Math.ceil(leaves.length / per);
    this.views = []; this.sheets = [];
    // each view's bottom corners turn the leaf when tapped (none on the first leaf's back corner or the last leaf's
    // forward one). They lie under the writing, which lets taps through to them except on a lesson, so a lesson wins.
    // Out of the tab order: the arrow buttons and the arrow keys already turn the leaves.
    const corner = (cls, label) => `<button type="button" class="bk-corner ${cls}" tabindex="-1" aria-label="${label}"></button>`;
    for (let v = 0; v < nv; v++) {
      const sh = document.createElement('div'); sh.className = 'bk-sheet'; sh.hidden = true;
      const ls = leaves.slice(v * per, v * per + per);
      sh.innerHTML = (v > 0 ? corner('prev', 'Previous page') : '') + (v < nv - 1 ? corner('next', 'Next page') : '') + ls.map((lf, c) => {
        const at = g.cols[c], no = v * per + c + 1;
        const pos = `left:${(at[0] - g.b[3]) * this.mx}px;width:${(at[1] - at[0]) * this.mx}px`;
        return `<div class="bk-col" style="${pos};bottom:${-ext}px">`
          + (lf.first ? `<div class="bk-head">${decoHTML(lf.title)}</div>` : `<div class="bk-run">${lf.title}</div>`)
          + `<div class="bk-list">${lf.items.map(i => this.entryHTML(i)).join('')}</div></div>`
          + `<div class="bk-foot" style="${pos};top:${footTop}px">· ${no} ·</div>`;
      }).join('');
      book.appendChild(sh); this.sheets.push(sh); this.views.push(ls.flatMap(lf => lf.items));
    }
    // the turning leaf and the shadows it throws
    book.insertAdjacentHTML('beforeend', '<div class="bk-flap" hidden><i class="bk-rule"></i><i class="bk-rule"></i><i class="bk-shade"></i></div><i class="bk-cast" hidden></i><i class="bk-cast" hidden></i>');
    this.flap = book.querySelector('.bk-flap'); this.casts = book.querySelectorAll('.bk-cast');
  },
  viewOf(i) { return Math.max(0, this.views.findIndex(v => v.includes(i))); },
  // one view at rest
  show(k) {
    this.sheets.forEach((sh, j) => { sh.hidden = j !== k; sh.style.clipPath = ''; sh.style.zIndex = ''; sh.inert = false; });
    this.under(null);
    this.flap.hidden = true; this.casts.forEach(c => { c.hidden = true; });
    $('#book').classList.remove('turning');
  },
  go(k, instant) {
    const n = this.views.length; if (!n) return;
    if (this.anim) this.finish();
    k = clamp(k, 0, n - 1);
    const from = this.at; this.at = k; this.ui();
    if (instant || k === from || Math.abs(k - from) > 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.turn = null; this.show(k); return; }
    // forward: the old view's leaf turns away (t 0 to 1); back: the same turn run backwards
    if (k > from) this.animate(from, k, 0, 1, () => this.show(k));
    else this.animate(k, from, 1, 0, () => this.show(k));
  },
  ui() {
    const n = this.views.length, k = this.at;
    $('#fPrev').disabled = k === 0; $('#fNext').disabled = k === n - 1;
    $('#folioNum').textContent = `Leaf ${k + 1} of ${n}`;
  },
  // the leaf of view A lifted from its outer edge (t 0) and laid flat on the far side of the spine (t 1), view B beneath
  startTurn(A, B) {
    if (this.turn && this.turn.A === A && this.turn.B === B) return;
    const g = this.g, S = this.x(g.spine), R = this.x(g.outer), P = R - S, top = this.y(BOOK.top), ph = this.y(BOOK.bot) - top;
    this.turn = { A, B, S, R, P, top, ph };
    this.sheets.forEach((sh, j) => { sh.hidden = j !== A && j !== B; sh.style.clipPath = ''; sh.style.zIndex = j === A ? 2 : 1; sh.inert = true; });
    // in a spread the leaf carries view B's left page; the real one under it is hidden, so where the leaf's paper fades
    // at the ends of the turn its writing stays solid and never shows twice (the two are a little apart until it lies flat)
    this.under(this.mode === 'spread' ? B : null);
    $('#book').classList.add('turning');
    const fl = this.flap; fl.hidden = false;
    Object.assign(fl.style, { top: top + 'px', height: ph + 'px', backgroundSize: `${P}px ${ph}px` });
    // the back of the leaf: the right page's ruled border mirrored, and in a spread the new left page
    const ro = R - this.x(g.rule[1]), rw = this.x(g.rule[1]) - this.x(g.rule[0]), r0 = this.y(BOOK.ruleY[0]) - top;
    const rh = this.y(BOOK.ruleY[1]) - this.y(BOOK.ruleY[0]), d = BOOK.ruleIn * this.s;
    const [o, i] = fl.querySelectorAll('.bk-rule');
    Object.assign(o.style, { left: ro + 'px', top: r0 + 'px', width: rw + 'px', height: rh + 'px' });
    Object.assign(i.style, { left: ro + d + 'px', top: r0 + d + 'px', width: rw - 2 * d + 'px', height: rh - 2 * d + 'px' });
    fl.querySelectorAll('.bk-col, .bk-foot').forEach(el => el.remove());
    if (this.mode === 'spread') {
      const col = this.sheets[B].querySelector('.bk-col').cloneNode(true), foot = this.sheets[B].querySelector('.bk-foot').cloneNode(true);
      col.style.visibility = foot.style.visibility = '';
      col.style.left = this.bl + parseFloat(col.style.left) - (2 * S - R) + 'px';
      col.style.top = this.bt - top + 'px'; col.style.bottom = 'auto';
      col.style.height = this.H - this.bt - this.bb - parseFloat(this.sheets[B].querySelector('.bk-col').style.bottom) + 'px';
      foot.style.left = col.style.left; foot.style.top = this.bt + parseFloat(foot.style.top) - top + 'px';
      fl.insertBefore(foot, fl.firstChild); fl.insertBefore(col, fl.firstChild);
    }
  },
  under(B) {
    this.sheets.forEach((sh, j) => ['.bk-col', '.bk-foot'].forEach(q => sh.querySelectorAll(':scope > ' + q).forEach((el, c) => { el.style.visibility = j === B && c === 0 ? 'hidden' : ''; })));
  },
  draw(t) {
    const { R, P, top, ph, A } = this.turn, f = R - t * P, fl = this.flap, e = 2 * f - R, lift = Math.sin(Math.PI * clamp(t, 0, 1));
    // the old view shows only left of the leaf: under the leaf lies the new view, so while the leaf fades in or out at
    // either end of the turn (t near 0 or 1) the page seen through it is already the new one. (Clipped at the fold f,
    // the old left page showed through the fading leaf for the last part of a spread's turn, then the new one replaced
    // it: the flash of the old page.)
    this.sheets[A].style.clipPath = `inset(0 ${this.W - Math.max(0, e)}px 0 0)`;
    fl.style.left = e + 'px'; fl.style.width = Math.max(0, R - f) + 'px';
    // the leaf fades in as it lifts and out as it lies flat; in a spread only its paper fades out (into the new left page's
    // own paper beneath), its writing stays, and at the swap the real writing takes its place on the same spot
    const lifts = clamp(t / 0.02, 0, 1), lies = clamp((1 - t) / 0.08, 0, 1), spread = this.mode === 'spread';
    fl.style.opacity = spread ? lifts : lifts * lies;
    fl.style.setProperty('--paper', spread ? lies : 1);
    const fw = Math.max(1, R - f);
    fl.lastChild.style.background = `linear-gradient(to left, rgba(70,40,12,${.3 * lift}) 0, rgba(255,246,222,${.32 * lift}) ${Math.min(fw * .12, 26)}px, rgba(255,246,222,0) ${Math.min(fw * .45, 120)}px, rgba(60,34,10,${.16 * lift}) 100%)`;
    // the shadow of the lifted leaf on the page it uncovers, and a thin one where its edge lies on the other page
    const [c1, c2] = this.casts, cw = Math.min(70, P * .22) * lift;
    c1.hidden = !(cw > 1 && f < R - 1);
    Object.assign(c1.style, { left: f + 'px', top: top + 'px', height: ph + 'px', width: cw + 'px', background: `linear-gradient(to right, rgba(20,10,0,${.42 * lift}), rgba(20,10,0,0))` });
    c2.hidden = !(cw > 1 && e > 0);
    Object.assign(c2.style, { left: e - cw * .4 + 'px', top: top + 'px', height: ph + 'px', width: cw * .4 + 'px', background: `linear-gradient(to left, rgba(20,10,0,${.3 * lift}), rgba(20,10,0,0))` });
  },
  animate(A, B, t0, t1, done) {
    this.startTurn(A, B); this.draw(t0);
    const dur = 160 + 560 * Math.abs(t1 - t0), start = performance.now();
    this.animDone = () => { this.turn = null; done(); };
    const step = now => {
      const u = Math.min(1, (now - start) / dur), e = 0.5 - Math.cos(Math.PI * u) / 2;
      this.draw(t0 + (t1 - t0) * e);
      if (u < 1) this.anim = requestAnimationFrame(step); else { this.anim = null; const d = this.animDone; this.animDone = null; d(); }
    };
    this.anim = requestAnimationFrame(step);
  },
  finish() { if (this.anim) cancelAnimationFrame(this.anim); this.anim = null; const d = this.animDone; this.animDone = null; if (d) d(); },
};
// a sideways swipe (finger or mouse) turns the leaf under the finger; an upright one is left to scroll the screen
(() => {
  const book = $('#book');
  let id = null, x0 = 0, y0 = 0, dx = 0, mode = 0, swallow = false, dir = 0; // mode: 0 undecided, 1 turning, -1 not ours
  let t0 = 0, moved = 0; // for a tap on a page corner: how long the press lasted and how far it wandered
  book.addEventListener('pointerdown', e => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; mode = 0; swallow = false; dir = 0; t0 = performance.now(); moved = 0;
  });
  book.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    moved = Math.max(moved, Math.hypot(mx, my));
    if (mode < 0) return;
    if (!mode) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) { mode = -1; return; }
      mode = 1; swallow = true; Folio.finish();
      try { book.setPointerCapture(id); } catch (_) { /* (the pointer may already be gone) */ }
    }
    dx = mx;
    const k = Folio.at, d = dx < 0 ? 1 : -1, n = Folio.views.length;
    // the first and last leaves stay put
    if ((d > 0 && k >= n - 1) || (d < 0 && k <= 0)) { if (dir) { Folio.turn = null; Folio.show(k); dir = 0; } return; }
    if (d !== dir) { Folio.turn = null; dir = d; }
    // the fold follows the finger: forward from the outer edge, back from the spine
    const u = clamp(Math.abs(dx) / (Folio.x(Folio.g.outer) - Folio.x(Folio.g.spine)), 0, 1);
    if (d > 0) { Folio.startTurn(k, k + 1); Folio.draw(u); } else { Folio.startTurn(k - 1, k); Folio.draw(1 - u); }
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null; t0 = e.type === 'pointerup' ? performance.now() - t0 : Infinity; // (t0 is now the press's length)
    if (mode !== 1 || !dir || !Folio.turn) { dir = 0; return; }
    const far = e.type === 'pointerup' && Math.abs(dx) > Math.min(70, Folio.W * 0.18), k = Folio.at;
    const u = clamp(Math.abs(dx) / Folio.turn.P, 0, 1), { A, B } = Folio.turn;
    const to = dir > 0 ? (far ? k + 1 : k) : (far ? k - 1 : k);
    Folio.at = to; Folio.ui();
    if (dir > 0) Folio.animate(A, B, u, far ? 1 : 0, () => Folio.show(to));
    else Folio.animate(A, B, 1 - u, far ? 0 : 1, () => Folio.show(to));
    dir = 0;
  };
  book.addEventListener('pointerup', end); book.addEventListener('pointercancel', end);
  // a swipe that ends over a lesson is not a tap on it
  book.addEventListener('click', e => { if (swallow) { swallow = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  // a tap on a bottom corner turns the leaf that way: back on the left, on through the right. Only a tap (a short press
  // that hardly moved; a swipe from the corner is a swipe, and its click is swallowed above). While a leaf is still
  // turning the pages take no taps, so a quick second tap is found by where it fell, and turns one leaf more.
  // (v175) the folio answers only while it is open: hidden, it lay over the land and the grimoire, and a tap through
  // the grimoire opened whichever lesson sat under the finger
  book.addEventListener('click', e => { if (Game.state !== 'menu') { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  book.addEventListener('click', e => {
    let d = 0;
    const c = e.target.closest('.bk-corner');
    if (c) d = c.classList.contains('next') ? 1 : -1;
    else if (e.target === book && Folio.anim) {
      const r = book.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, z = parseFloat(book.style.getPropertyValue('--cz')) || 0;
      if (y > r.height - z) d = x < z ? -1 : x > r.width - z ? 1 : 0;
    }
    if (!d) return;
    if (e.detail && (t0 > 600 || moved > 10)) return; // (detail 0: a screen reader's or the keyboard's click)
    Folio.go(Folio.at + d);
  });
  book.addEventListener('click', e => {
    const el = e.target.closest('.lentry');
    if (!el || el.classList.contains('locked') || Folio.anim) return;
    Sfx.init(); Game.start(+el.dataset.i);
  });
  // a new size of screen lays the book out again, on the leaf that holds the lessons shown now
  let rt = 0;
  const refit = () => {
    if (Game.state !== 'menu' || !Folio.views.length) return;
    const first = (Folio.views[Folio.at] || [])[0];
    Folio.finish(); Folio.render(); Folio.go(first == null ? 0 : Folio.viewOf(first), true);
  };
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(refit, 120); });
  if (document.fonts) document.fonts.ready.then(refit);
})();

function bind(id, fn) { $(id).addEventListener('click', e => { Sfx.init(); fn(e); e.currentTarget.blur(); }); }
bind('#bBegin', () => Game.start(Game.resumeAt()));
bind('#bContinue', () => Game.lessons());
bind('#bLessonsT', () => Game.lessons());
bind('#bBackTitle', () => Game.title());
bind('#fPrev', () => Folio.go(Folio.at - 1));
bind('#fNext', () => Folio.go(Folio.at + 1));
bind('#bResume', () => Game.resumeLesson());
bind('#bGrimoire', () => Game.openGrimoire());
bind('#bRewind', () => Game.rewind());
bind('#bReset', () => Game.reset());
bind('#bTipsAgain', e => { Tips.reset(); Save.data.seenSigils = []; Save.save(); // (v178) the new-sigil sheets show again too
  Sfx.play('tick'); e.currentTarget.textContent = '✓ The tips will show again'; });
bind('#bNote', () => { if (Game.state === 'play') Game.noteOpen() ? Game.closeNote() : Game.note(); });
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
bind('#bHint', () => Game.moreHint());
bind('#bHintHud', () => Game.openHint());
bind('#bNext', () => Game.next());
bind('#bReplay', () => Game.start(Game.idx));
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
bind('#bTerms', () => openTerms());
bind('#tClose', () => closeTerms());
$('#terms').addEventListener('pointerdown', e => { if (e.target.id === 'terms') closeTerms(); });
$('#satchel').addEventListener('pointerdown', e => { if (e.target.id === 'satchel') Game.closeSatchel(); });
bind('#pNotes', () => Game.openNotes());
bind('#nBack', () => Game.closeNotes());
bind('#nHintB', () => Game.moreHint());
$('#notes').addEventListener('pointerdown', e => { if (e.target.id === 'notes') Game.closeNotes(); });
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

/* (v175) A new edition never swaps or reloads the page under the player. Its worker waits (sw.js) until the game is
   next started fresh, or until the player taps the quiet "A new edition is ready" line, shown only on the title page
   and in the folio. Only that tap reloads, and the reload comes back to the lesson in play (Game.playing). */
const Edition = {
  waiting: null, going: false,
  watch(reg) {
    const found = w => {
      if (!w || !navigator.serviceWorker.controller) return; // (the first visit's worker replaces nothing)
      const ready = () => { if (w.state === 'installed') { this.waiting = w; document.body.classList.add('edition-ready'); } };
      ready(); w.addEventListener('statechange', ready);
    };
    found(reg.waiting); // (one found on an earlier visit, still waiting)
    reg.addEventListener('updatefound', () => found(reg.installing));
    // a tab left open for hours asks again when it comes back into view (at most every ten minutes)
    let asked = performance.now();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || performance.now() - asked < 600000) return;
      asked = performance.now(); reg.update().catch(() => { });
    });
  },
  go() {
    if (this.going) return;
    this.going = true;
    if (!this.waiting) { location.reload(); return; }
    this.waiting.postMessage('skipWaiting');
    setTimeout(() => location.reload(), 3000); // (should the new worker never say it has taken over)
  },
};
for (const el of document.querySelectorAll('.edition')) el.addEventListener('click', () => Edition.go());
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window.self) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (Edition.going) location.reload(); });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(reg => Edition.watch(reg)).catch(() => { }));
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
  // (the Lesson Complete card's: the same lines, a wider gap between them where its wax seal is pressed)
  const c3 = document.createElement('canvas'); c3.width = 520; c3.height = 60;
  const g3 = c3.getContext('2d');
  g3.strokeStyle = '#4a2e1a'; g3.lineWidth = 1.2;
  g3.beginPath(); g3.moveTo(20, 30); g3.lineTo(150, 30); g3.moveTo(370, 30); g3.lineTo(500, 30); g3.stroke();
  g3.strokeStyle = '#b8893e'; g3.lineWidth = 0.6;
  g3.beginPath(); g3.moveTo(40, 34); g3.lineTo(150, 34); g3.moveTo(370, 34); g3.lineTo(480, 34); g3.stroke();
  document.documentElement.style.setProperty('--divider-seal', `url(${c3.toDataURL()})`);
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
{
  // (v175) a reload in the middle of a lesson (Firefox for Android or Safari putting the tab away, a refresh, a new
  // edition opened) comes straight back to that lesson; a fresh visit opens on the title page
  const back = Game.wasPlaying();
  Game.title();
  if (back >= 0) Game.start(back);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Grim.bookDirty = true; Grim.fitButtons(); });
['700 30px "Cinzel Decorative"', '30px "Pinyon Script"', 'italic 16px "IM Fell English"', '600 12px Cinzel', '700 30px Cinzel'].forEach(f => { try { document.fonts.load(f).then(() => { Grim.bookDirty = true; }); } catch (e) { } });

let lastT = performance.now(), acc = 0;
const WORLD_PAUSED = new Set(['menu', 'draw', 'aim']);
const FIXED = 1 / 120;
function loop(now) {
  requestAnimationFrame(loop); // asked for first, so one frame that throws can never stop the game for good
  try { if (!PV.isOpen) tick(now); else lastT = now; } // the phone preview covers this game: let it rest
  catch (err) { console.error(err); }
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
