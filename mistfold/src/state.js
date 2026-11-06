// Game state, save/load, and the static tables: keepsakes, kinships, settlers, auras.

export const ELEMENTS = ['sun', 'moon', 'tide', 'root'];
export const ELEMENT_INFO = {
  sun: { name: 'Sun', color: '#e8b04a', hex: 0xe8b04a, word: 'warm' },
  moon: { name: 'Moon', color: '#a99ad8', hex: 0xa99ad8, word: 'dreaming' },
  tide: { name: 'Tide', color: '#5fb3b8', hex: 0x5fb3b8, word: 'wet' },
  root: { name: 'Root', color: '#7aa35a', hex: 0x7aa35a, word: 'old and growing' },
};
export const PHASES = ['morning', 'day', 'dusk', 'night'];

// Map info for every land. Detailed builders live in lands.js.
export const LAND_INFO = {
  home: { name: 'Hearthstead', aura: { sun: 1, root: 1 }, tile: 0x8fae6a, theme: 'home', blurb: 'A cottage, a lantern, a cat. Where you woke up.' },
  shore: { name: 'Saltglass Shore', aura: { tide: 2, sun: 1 }, tile: 0xe6d3a8, theme: 'shore', blurb: 'A beach of worn sea-glass and a lighthouse gone dark.' },
  orchard: { name: 'Lantern Orchard', aura: { sun: 2, root: 1 }, tile: 0x9fbf5e, theme: 'orchard', blurb: 'Trees that fruit in little lanterns. Someone is reciting.' },
  marsh: { name: 'Gloamwillow Marsh', aura: { moon: 2, tide: 1 }, tile: 0x6f7f6a, theme: 'marsh', blurb: 'Willows, boards over black water, lights that wander.' },
  archive: { name: 'The Hollow Archive', aura: { root: 2, moon: 1 }, tile: 0x8a8a6e, theme: 'archive', blurb: 'A library the forest has been reading for centuries.' },
  teacup: { name: 'Teacup Crossing', aura: { sun: 1, tide: 1, moon: 1 }, tile: 0xe8c8b8, theme: 'teacup', blurb: 'Where the roads used to meet for tea.' },
  giant: { name: "Ummoth's Rest", aura: { root: 2, sun: 1, moon: 1 }, tile: 0x7f9a62, theme: 'giant', blurb: 'A hill that breathes, very slowly.' },
  margin: { name: 'The Last Margin', aura: { sun: 1, moon: 1, tide: 1, root: 1 }, tile: 0xf3efe4, theme: 'margin', blurb: 'The unfinished edge of an old map.' },
  // not on the map: you get there in Brine's ferry
  farbank: { name: 'The Far Bank', hidden: true, aura: { moon: 2 }, tile: 0x5a6a8a, theme: 'farbank', blurb: 'Where the little lights go to rest.' },
};

// Pages torn from Ines Vellum's sketchbook, in the order she wrote them.
export const PAGES = [
  { id: 'p1', title: 'The First Page', where: 'In your satchel from the start', text: 'New map, begun today. I am drawing it all again, every lane, while I still can. My eyes are going, so I am going slowly.\n\nSmudge is helping. Smudge rubs out my wobbles so neatly you would never know they had been there. It is very proud of itself. I am a little proud of it too.' },
  { id: 'p2', title: 'The Lighthouse, Third Try', where: 'Saltglass Shore', text: 'Drew the lighthouse today. It took three tries; Smudge took the first two away before I had finished looking at them.\n\nA man called Tobiah came to see. He says I have drawn the sea too small, and he is going out in a boat to check. I told him the edge of the paper is not the edge of anything. He said that was exactly what he meant.' },
  { id: 'p3', title: 'Mornings', where: 'Lantern Orchard', text: 'My hand shakes in the mornings now. Smudge has been very busy.\n\nI told it: you are not to rub anything out unless I say so. It went and sat under the desk. Can an eraser sulk? This one can. I gave it a lantern-apple to make up, and it rubbed the apple out, which I think was meant as thanks.' },
  { id: 'p4', title: 'Wrong Lights', where: 'Gloamwillow Marsh', text: 'Drew the marsh from memory, as I cannot see the far side of the page any more. The lights came out wrong. They wander.\n\nSmudge wanted them gone. I said no, leave them, they are lovely wrong. Some things are better for not being quite where you meant them.' },
  { id: 'p5', title: 'What the Doctor Said', where: 'The Hollow Archive', text: 'The doctor says it is the eyes, and it will not get better, and would I like a biscuit.\n\nI have been leaving the pencil down for days at a time. Smudge waits by the paper. I do not think it knows what it is for, when I am not drawing. I am not sure I know either.' },
  { id: 'p6', title: 'Someone to Go Round', where: "Ummoth's Rest", text: 'Drew one more thing in the margin today. Someone to go round the places when I cannot. A satchel, so they can carry what people give them. A stick, for jackdaws.\n\nI did not give them a face. I will let them find one. I think they will find it in the people.' },
  { id: 'p7', title: 'Note, Pinned to the Desk', where: 'Teacup Crossing', text: 'SMUDGE.\n\nI am going to bed. Do not rub anything out while I am asleep. NOTHING on this map is a mistake. Not the wandering lights, not the wobbly coast, not the person in the margin. Especially not them.\n\n— I.\n\n(The pin went through the address. It was never delivered.)' },
  { id: 'p8', title: 'For Keeps', where: 'The Last Margin', text: 'A small drawing in the corner of the margin: someone with a satchel and a walking-stick, looking back over their shoulder as if somebody had just called their name.\n\nUnder it, in a hand gone very shaky:\n\nThis one is for keeps.' },
];

// Small trinkets people give you. Each one changes how you fight.
export const CHARMS = {
  seaglass: { name: 'Sea-glass Charm', from: 'Marrow Quell', desc: 'Your dash cuts through anything in its way.' },
  wick: { name: 'Lantern Wick', from: 'the tiny door', desc: 'Foes you beat sometimes leave a little warmth behind.' },
  wisp: { name: 'Rested Light', from: 'the Far Bank', desc: 'A small light circles you and nips at anything that comes close.' },
  quill: { name: "Quillon's Quill", from: 'Quillon Ashby', desc: 'Your charged spin is ready twice as fast.' },
  spoon: { name: 'Sugar Spoon', from: 'Madame Saucerelle', desc: 'A perfect dodge mends half a heart.' },
  knot: { name: "Ummoth's Beard-Knot", from: 'Ummoth', desc: 'The last blow of a combo sends foes flying, dizzy.' },
  bell: { name: "Mote's Bell", from: 'Mote', desc: 'The lantern flare fills faster, and lumen finds you from further off.' },
};

export const KEEPSAKES = {
  seed: { name: 'Lantern Seed', land: 'orchard', desc: 'A seed that is warm in the palm and glows when nobody is looking.' },
  jar: { name: 'Jar of Cold Seawater', land: 'shore', desc: 'It never warms up. If you hold it to your ear it is very quiet.' },
  bell: { name: 'Drowned Bell', land: 'marsh', desc: 'Full of marsh water. It hums at night, a little flat.' },
  bookmark: { name: 'Bookmark with No Book', land: 'archive', desc: 'Pressed flowers in waxed paper. It is keeping someone’s place.' },
  teacup: { name: 'Chipped Teacup', land: 'teacup', desc: 'Someone drank their last tea from this, and they liked it.' },
  button: { name: "Giant's Button", land: 'giant', desc: 'Big as a cartwheel, worn smooth by a thumb the size of a door.' },
  pencil: { name: "Cartographer's Pencil", land: 'margin', desc: 'Short, sharp, and chewed at the end. It wants to draw coastlines.' },
};

// Adjacent pairs that wake something between them.
export const KINSHIPS = [
  { id: 'sea-apples', a: 'shore', b: 'orchard', name: 'Sea-Apples', text: 'Salt wind reaches the orchard. Some lanterns ripen blue, and the tide brings their light out to the shore.', reward: { heart: 1 } },
  { id: 'frog-chorus', a: 'marsh', b: 'archive', name: 'The Frog Chorus', text: 'Frogs have wandered up from the marsh into the Archive. They sit on the open books and read aloud, badly.', reward: { lumen: 40 } },
  { id: 'tea-at-home', a: 'teacup', b: 'home', name: 'Tea at Home', text: 'The smell of tea drifts over to Hearthstead. Pell has been given a tea cosy and will not take it off.', reward: { lumen: 30 } },
  { id: 'giants-garden', a: 'giant', b: 'orchard', name: "The Giant's Garden", text: 'Lantern seeds have blown onto Ummoth. Little lights grow in his beard now.', reward: { heart: 1 } },
  { id: 'brackish-lights', a: 'marsh', b: 'shore', name: 'Brackish Lights', text: 'Marsh-lights drift out over the sea at night. A pale ship sometimes sails out past the breakers, and nobody minds.', reward: { lumen: 40 } },
  { id: 'old-stories', a: 'archive', b: 'giant', name: 'Old Stories', text: 'The Archive has a whole shelf about Ummoth. He likes to have it read to him, and asks for the bit about the river twice.', reward: { lumen: 40 } },
];

export const SETTLERS = {
  flicker: { name: 'Flicker', from: 'marsh', needText: 'somewhere warm, with a window (Sun 2+)', need: (a) => a.sun >= 2, bonus: 'sun' },
  mumbleroots: { name: 'The Mumbleroots', from: 'archive', needText: 'somewhere rooty and old (Root 3+)', need: (a) => a.root >= 3, bonus: 'root' },
  pockets: { name: 'Mister Pockets', from: 'shore', needText: 'somewhere wet with foot traffic (Tide 2+, two or more neighbours)', need: (a, n) => a.tide >= 2 && n >= 2, bonus: 'tide' },
  bellamy: { name: 'Bellamy Tock', from: 'giant', needText: 'somewhere quiet, under a good moon (Moon 2+)', need: (a) => a.moon >= 2, bonus: 'moon' },
};

export function newState() {
  return {
    v: 1,
    day: 0,
    lumen: 0,
    maxHearts: 3,
    hp: 6,
    power: 1,
    placed: { home: { q: 0, r: 0 } },
    keepsakes: ['seed', 'jar'],
    flags: {},
    settlers: {},
    pendingSettlers: [],
    letters: [],
    kinships: [],
    current: 'home',
    visits: {},
    mapName: null,
    pages: ['p1'],
    charms: [],
    flare: 0,
    painterly: true,
    muted: false,
  };
}

export const state = newState();
const KEY = 'mistfold-save-v1';
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ }
}
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) { Object.assign(state, newState(), s); return true; }
  } catch (e) { /* ignore */ }
  return false;
}
export function reset() { Object.assign(state, newState()); }

export const flag = (k) => state.flags[k];
export const setFlag = (k, v = true) => { state.flags[k] = v; };
export const phase = () => PHASES[state.day % 4];
export const hasCharm = (id) => state.charms.includes(id);
export const hasPage = (id) => state.pages.includes(id);

// ---------- hex geometry & auras ----------
export const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export function landAt(q, r) {
  for (const [id, p] of Object.entries(state.placed)) if (p.q === q && p.r === r) return id;
  return null;
}
export function neighbours(id, placed = state.placed) {
  const p = placed[id]; if (!p) return [];
  const out = [];
  for (const [dq, dr] of HEX_DIRS) {
    for (const [oid, op] of Object.entries(placed)) if (op.q === p.q + dq && op.r === p.r + dr) out.push(oid);
  }
  return out;
}
export function effectiveAura(id, placed = state.placed) {
  const a = { sun: 0, moon: 0, tide: 0, root: 0 };
  const base = LAND_INFO[id].aura;
  for (const e of ELEMENTS) a[e] = base[e] || 0;
  for (const n of neighbours(id, placed)) {
    const nb = LAND_INFO[n].aura;
    for (const e of ELEMENTS) if ((nb[e] || 0) >= 2) a[e] += 1;
  }
  for (const [sid, s] of Object.entries(state.settlers)) if (s.land === id) a[SETTLERS[sid].bonus] += 1;
  return a;
}
export function dominant(a) {
  let best = 'root', bv = -1;
  for (const e of ELEMENTS) if (a[e] > bv) { bv = a[e]; best = e; }
  return best;
}
export function settlersIn(id) {
  return Object.entries(state.settlers).filter(([, s]) => s.land === id).map(([k, s]) => ({ id: k, ...s, age: state.day - s.day }));
}
export function addLetter(id, from, title, text, delay = 1) {
  if (state.letters.find((l) => l.id === id)) return;
  state.letters.push({ id, from, title, text, arrive: state.day + delay, read: false });
}
export const mailWaiting = () => state.letters.some((l) => !l.read && l.arrive <= state.day);
