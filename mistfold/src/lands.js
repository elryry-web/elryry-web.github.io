// The lands: their shapes, what grows in them, who lives there, and what they say.
import * as THREE from 'three';
import * as M from './models.js';
import { fbm, noise2, clamp, smooth, lerp, mulberry32 } from './util.js';
import { state, flag, setFlag, mailWaiting, hasCharm, LAND_INFO, KINSHIPS, SETTLERS, PAGES, addLetter } from './state.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { givePage, giveCharm, erasuresCleared, activeErasures, maybeStartMoteHide, moteHiding, SmudgeBoss } from './story.js';
import { catchGlasses, lampTalk, critics, windfalls, callSlips, putBack, BOOKS, SLIPS, walkingShelves, PHRASE, phraseBars, hum, mossLambs } from './quests.js';

const col = (a) => new THREE.Color(a);
const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
const kin = (id) => state.kinships.includes(id);
const helped = (id) => !!state.settlers[id] || state.pendingSettlers.includes(id);
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}
function polyDist(x, z, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i], pts[i + 1])); return d; }
const FACE = Math.PI / 4; // facing the camera

// shared voices
const V = {
  pell: { pitch: 0.85, wave: 'sine' },
  marrow: { pitch: 0.95, wave: 'triangle' },
  thimble: { pitch: 1.25, wave: 'square' },
  brine: { pitch: 0.6, wave: 'sine' },
  quillon: { pitch: 1.5, wave: 'sine' },
  sauce: { pitch: 1.7, wave: 'triangle' },
  gus: { pitch: 1.15, wave: 'square' },
  ummoth: { pitch: 0.35, wave: 'sine' },
  ines: { pitch: 1.1, wave: 'sine' },
  flicker: { pitch: 2.6, wave: 'sine' },
  morel: { pitch: 0.75, wave: 'triangle' },
  tock: { pitch: 0.5, wave: 'sine' },
  pockets: { pitch: 1.4, wave: 'square' },
  smudge: { pitch: 0.9, wave: 'sine' },
};
// a count of flags with a shared prefix, e.g. how many sea-glass you've found
const countFlags = (prefix, n) => Array.from({ length: n }, (_, i) => i).filter((i) => flag(prefix + i)).length;

// Ask a helped person to the tea party, if there's an invitation going.
async function teaInvite(D, who, line) {
  if (!flag('tea.invite') || flag('tea.guest.' + who) || flag('tea.party')) return false;
  await D.narrate(`You have one of Madame Saucerelle's invitations in your pocket. It smells faintly of bergamot.`);
  const c = await D.choose(['Invite them to tea at Teacup Crossing', 'Not today']);
  if (c === 0) { setFlag('tea.guest.' + who); await D.say(line); ui.toast(`✉ ${D.npc.name} will come to tea.`); return true; }
  return false;
}
function quietWords(L, n, list) { return list[(state.day + n) % list.length]; }

// ---------------------------------------------------------------- HEARTHSTEAD
const homePath = [[4, 5], [2, 2], [-1.5, -1.5], [-3, -3.5]];
const home = {
  id: 'home', radius: 15, spawn: [4, 5], peaceful: true,
  cliff: 0x9a8470, cliff2: 0x6a5a68,
  height: (x, z) => 0.6 + fbm(x * 0.08, z * 0.08, 3) * 1.1 - Math.hypot(x, z) * 0.025,
  color: (x, z, h) => {
    const p = polyDist(x, z, homePath);
    const g = mixc(0x86a85a, 0xa8b860, noise2(x * 0.2, z * 0.2) + 0.5);
    if (p < 1.1) return mixc(0xc8a878, g, smooth(0.6, 1.1, p));
    if (noise2(x * 0.9, z * 0.9) > 0.45) return mixc(g, 0xe8d8f0, 0.4);
    return g;
  },
  paved: (x, z) => smooth(1.15, 0.5, polyDist(x, z, homePath)),
  keepClear: (x, z) => polyDist(x, z, homePath) < 1.4,
  ambient: ['butterflies', 'motes', 'petals'],
  settleSpots: [[7, -6], [-9, 5]],
  build(L) {
    maybeStartMoteHide();
    const lit = L.night || L.phase === 'dusk';
    const cot = M.makeCottage({ lit });
    L.place(cot, -4, -5, { r: 2.4, rot: FACE });
    // chimney smoke
    L.updaters.push((dt) => {
      if (Math.random() < dt * 4) {
        const p = cot.userData.chimney.clone().applyMatrix4(cot.matrixWorld);
        L.dust.emit(p.x, p.y, p.z, { vy: 0.8, vx: 0.3, color: 0xe8e2dc, size: 0.7, life: 3, grav: -0.05 });
      }
    });
    L.interact({ x: -1.6, z: -2.6, r: 1.6, label: 'Rest in the cottage', action: () => L.game.rest() });
    // Pell
    const pellModel = M.makePell(true);
    if (kin('tea-at-home')) {
      pellModel.userData.parts.body.add(M.vmesh([M.paint(M.xf(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.85, 0], [0, 0, 0], [1, 1.1, 1]), 0xd86a8a, { jitter: 0.15 }), M.paint(M.xf(M.G.sph(0.14, 6, 5), [0, 2.4, 0]), 0xf3e7cf)]));
      L.place(M.makeTable(), 1.8, -5, { r: 1.3 });
    }
    const pell = L.npc({ id: 'pell', name: 'Pell', model: pellModel, x: -0.6, z: -1.2, face: FACE, voice: V.pell, color: '#8a7a5a', r: 0.6, noHeadBob: true,
      bubble: () => (!flag('intro') || mailWaiting() || state.pendingSettlers.length || (erasuresCleared() > 0 && !flag('pell.grey')) || (moteHiding() && !flag('mote.told.' + (flag('mote.finds') || 0))) ? '!' : null),
      talk: pellTalk });
    L.pell = pell;
    // mailbox
    const mb = M.makeMailbox(mailWaiting());
    L.place(mb, 1.8, -2.4, { r: 0.4, rot: FACE });
    L.interact({ x: 1.8, z: -2.4, r: 1.6, label: () => (mailWaiting() ? 'Check the mailbox ✉' : 'Check the mailbox'), action: () => L.game.readMail() });
    // the cat, unless the cat is out
    if (!moteHiding()) L.npc({ id: 'mote', name: 'Mote', model: M.makeCat(0xe0a060), x: -6.2, z: -1.4, face: 1.2, r: 0.35, blob: 0.7, wander: 0.5, speed: 0.6, label: 'Pet Mote', voice: { pitch: 2 }, talk: catTalk, noHeadBob: false });
    else { L.interact({ x: -6.2, z: -1.4, r: 1.4, label: 'Look at the warm spot', action: () => L.game.narrate(`There is a warm, cat-shaped dent in the grass where Mote usually sits. Mote has gone visiting, in ${LAND_INFO[moteHiding()].name}.`) }); }
    // the Smudge, small now, tidying very carefully
    if (flag('smudge.home')) L.npc({ id: 'smudge', name: 'Smudge', model: M.makeSmudge(0.32), x: 3.2, z: -3.4, face: FACE, voice: V.smudge, color: '#8a7a8a', r: 0.4, blob: 0.8, wander: 0.5, speed: 0.4, talk: async (D) => { await D.say(quietWords(D.land, 11, [
      'i tidied the mailbox. i only rubbed out the snail line. the snail said i could.',
      'pell lets me sit by the lamp in the evenings. i\'m warmer than i\'ve ever been. erasers aren\'t usually warm.',
      'i went out to the edge of the map and rubbed at the mist a bit. there was a hedge under it. i left the hedge.',
      'i\'ve started keeping a list of things that are not mistakes. it\'s a very long list. you\'re on it twice.',
    ])); } });
    // garden: one plant for every land on the map
    L.place(M.makeGardenPlot(), -8.5, 0.5, { r: 1.7, rot: FACE });
    const ids = Object.keys(state.placed).filter((k) => k !== 'home');
    ids.forEach((id, i) => {
      const gx = -8.5 + ((i % 4) - 1.5) * 0.65, gz = 0.5 + (Math.floor(i / 4) - 0.5) * 0.7;
      const r = mulberry32(i + 3);
      const plant = M.makeFlower(r, LAND_INFO[id].tile, 0xfff0a0, 1.8);
      L.place(plant, gx + gz * 0.3, gz - gx * 0.0 + 0, { y: L.heightAt(gx, gz) + 0.25 });
    });
    L.interact({ x: -8.5, z: 0.5, r: 2.2, label: 'Look at the garden', action: () => gardenLook(L, ids.length) });
    // signpost
    L.place(M.makeSignpost(L.rng), 7.2, 4.5, { r: 0.3, rot: 0.4 });
    L.interact({ x: 7.2, z: 4.5, r: 1.6, label: 'Read the signpost', action: async () => { await L.game.narrate('The signpost has three arms. All three say THE MIST, in three different hands, and one of them has added "(lovely)".'); } });
    // trees, fence, flowers
    L.scatter(20, (x, z, r) => L.place(M.makeTree(r, { kind: r() > 0.7 ? 'birch' : 'round', leaf: r() > 0.5 ? 0x6f9a52 : 0x86a84a }), x, z, { r: 0.7, sway: true }), { r: 1.6, region: (x, z) => Math.hypot(x, z) > 8 });
    L.scatter(14, (x, z, r) => L.place(M.makeBush(r, 0x6a9a4a), x, z, { r: 0.6 }), { r: 1 });
    L.scatter(60, (x, z, r) => L.place(M.makeFlower(r, [0xf2b6c8, 0xfff0a8, 0xc8b8f0, 0xffffff][Math.floor(r() * 4)], 0xffe08a), x, z), { r: 0.2 });
    for (let i = 0; i < 9; i++) L.place(M.makeFencePost(L.rng), -11 + i * 0.9, -7.5 + i * 0.25, { r: 0.12, rot: 0 });
    L.grass(2600, (p, r) => (r() > 0.5 ? 0x8ab05a : 0x9cbc64));
  },
  onEnter(L) { if (!flag('intro')) L.game.wait(1.8).then(() => L.game.talk(L.pell)); },
};
async function pellTalk(D) {
  if (!flag('intro')) {
    await D.say('Oh, now. You\'re awake, and I was halfway through telling the mailbox about you, which it didn\'t mind, it\'s a very patient mailbox.');
    await D.say('I\'m Pell. I\'ve been the lantern by this door for, oh, a good while. Since before the door, I think, though the door would tell you otherwise.');
    await D.say('You\'ll want to know where everything\'s gone. I would. The world wore thin, dear, the way a sleeve goes at the elbow, and then one day it was mostly mist.');
    await D.say('What\'s left is kept in things. People loved certain places so much that the places got stuck in their belongings, in a cup or a bell or a jar of water.');
    await D.say('And you\'ve a satchel full of them. I don\'t know where you got it. You came up the path with it the way the tide comes in, as if you\'d always been coming.');
    const c = await D.choose(['What happens if I use one?', 'I don\'t remember anything.']);
    if (c === 1) await D.say('No, well. Neither do I, really, and I\'ve had much longer to try, so I wouldn\'t fret. Remembering is mostly something you do with other people anyway.');
    await D.say('If you set a keepsake out on the mist, the place inside it remembers itself. It unfolds. I saw it happen once, long ago, and I cried oil for a week.');
    await D.say('The Waystone by the path will show you the map. Put a land wherever feels right. Where you put it does matter, mind, lands lean on their neighbours.');
    await D.say('Oh, and here. Hold out your hand, there, like you\'re catching rain. A lantern is mostly something to be carried, so carry a bit of me.');
    setFlag('flare'); state.flare = 0;
    audio.sfx('flare');
    D.land.fx.burst(D.land.player.x, D.land.heightAt(D.land.player.x, D.land.player.z) + 1.2, D.land.player.z, 40, { color: [0xfff0b0, 0xffd27a], size: 0.5, speed: 3, life: 1.2, grav: -1 });
    await D.say('It fills up as you go, when you\'re knocked about or doing the knocking. When it\'s bright, let it all out at once. Don\'t worry about me, dear. I\'ve been saving it up for years, for someone.');
    await D.say('Off you go, then. And come home now and again, dear, would you? It\'s nice for a lantern to have someone to be lit for.');
    setFlag('intro');
    ui.hud('land', { where: LAND_INFO.home.name });
    ui.toast('✦ <b>Pell\'s Light</b>: hits fill the bar under your hearts. When it\'s full, press <b>F</b>.<br>Walk to the <b>Waystone</b> and press <b>E</b> to open the map.', 8000);
    return;
  }
  if (flag('ending')) {
    await D.say(quietWords(D.land, 0, [
      'You\'ve put it back. Well, some of it. Some of it is more than enough, I think, for a first go at a world.',
      'I keep thinking I can see the edge of the mist from here, and then it moves off a bit, politely, like a guest who knows it\'s late.',
      'The mailbox says hello. It doesn\'t, but it would, if it were the type.',
    ]));
    return;
  }
  // the first time you come home with the grey on you
  if (erasuresCleared() > 0 && !flag('pell.grey')) {
    setFlag('pell.grey');
    await D.say('You\'ve been in the grey. I can smell it on you, like a rubbed-out pencil line. Oh, dear. Come here.');
    await D.say('Something\'s been tidying the world away, I think. Not the mist. Something with a purpose to it, which is worse. A mist doesn\'t mean anything by it.');
    await D.say('Hold your hand out again. There. I\'ve topped you up. It burns brighter against grey, my light, it always did.');
    state.flare = 100;
    audio.sfx('flare');
    D.land.fx.burst(D.land.player.x, D.land.heightAt(D.land.player.x, D.land.player.z) + 1.2, D.land.player.z, 40, { color: [0xfff0b0, 0xffd27a], size: 0.5, speed: 3, life: 1.2, grav: -1 });
    ui.hud('land', { where: LAND_INFO.home.name });
    return;
  }
  if (moteHiding() && !flag('mote.told.' + (flag('mote.finds') || 0))) {
    setFlag('mote.told.' + (flag('mote.finds') || 0));
    await D.say(`Mote's gone off again. Mote likes to go and sit somewhere with a view of you arriving. I'd look in ${LAND_INFO[moteHiding()].name}, if I were looking, which I am, a bit.`);
    return;
  }
  if (state.keepsakes.includes('pencil')) { await D.say('A pencil. Oh, now, I know that pencil. I don\'t know how I know it. Put it down somewhere with room around it, would you, dear?'); return; }
  if (mailWaiting()) { await D.say('The mailbox has been fidgeting all morning. When the little flag\'s up there\'s something in it for you, that\'s how it works, or how it used to.'); return; }
  if (state.pendingSettlers.length) {
    const s = SETTLERS[state.pendingSettlers[0]];
    await D.say(`${s.name} is looking for somewhere to live, I hear. They'd like ${s.needText.replace(/\s*\(.*\)/, '')}. Open the map and have a look at what each land's like.`);
    await D.say('If nowhere suits, try putting the lands closer together. A land soaks up a bit of what\'s strong in its neighbours. I\'ve watched it happen with the moss on my roof.');
    return;
  }
  if (state.keepsakes.length && Object.keys(state.placed).length < 3) { await D.say('There\'s still something in your satchel, I can hear it rattling. Take it out to the Waystone and set it down on the mist.'); return; }
  if (activeErasures().length) { await D.say(`There's grey on ${LAND_INFO[activeErasures()[0]].name}, I hear. Somewhere you'd already mended. That's the cruel part, isn't it, it waits until a thing's been put right.`); return; }
  await D.say(quietWords(D.land, 1, [
    'Lands lean on their neighbours. A wet place next to a warm one, you get mist in the mornings and good tomatoes. I\'m told. I\'ve never had a tomato.',
    'That\'s Mote, by the garden. Mote came with the cottage, or the cottage came with Mote. It\'s hard to say which of them was here first.',
    'Each time you unfold a land, something comes up in the garden. I don\'t water it. It seems to be watered by something else entirely.',
    'Do you know, I think the people out there have been waiting a very long time for someone to visit. Waiting is tiring. Visiting helps.',
    'If you get knocked about, come and rest in the cottage. The bed is good. It was mine, before I was a lantern, I think, or it\'s just a good bed.',
  ]));
}
async function catTalk(D) {
  const L = D.land;
  audio.sfx('purr');
  for (let i = 0; i < 6; i++) L.fx.emit(D.npc.x + (Math.random() - 0.5) * 0.6, L.heightAt(D.npc.x, D.npc.z) + 0.8, D.npc.z, { vy: 1.2, color: 0xff9ab0, size: 0.4, life: 1.2, grav: 0 });
  const healed = !flag('mote.day' + state.day) && state.hp < state.maxHearts * 2;
  setFlag('mote.day' + state.day);
  if (healed) state.hp = state.maxHearts * 2;
  await D.narrate(quietWords(L, 2, [
    'Mote leans into your hand with the full weight of a much larger cat.',
    'Mote purrs like a kettle that has decided not to boil. It is very calming.',
    'Mote allows this. Mote has allowed a great many things over the years.',
    'Mote looks at you as if you have been gone a long time, which you have, and as if that\'s fine, which it is.',
  ]) + (healed ? ' You feel better.' : ''));
}
async function gardenLook(L, n) {
  if (n === 0) await L.game.narrate('Bare soil, turned and waiting. Pell says something comes up here each time you unfold a land.');
  else await L.game.narrate(`${n} ${n === 1 ? 'plant has' : 'plants have'} come up, one for each land on your map, each the colour of its place. The newest is still shaking off its seed.`);
}

// ---------------------------------------------------------------- SALTGLASS SHORE
const shore = {
  id: 'shore', radius: 21, spawn: [-4, 5], water: 0,
  lush: { region: (x, z) => shore.height(x, z) > 1.15, flowers: [0xf0d060, 0xffffff, 0xd890a8, 0x8ac0e0], leaf: [0x6a9a4a, 0x7aa850, 0x8aa858], density: 0.6 },
  waterDeep: 0x2a6a8a, waterShallow: 0x8fd8d0,
  cliff: 0xa89070, cliff2: 0x6a6a7a,
  height: (x, z) => 1.6 - (x + 3) * 0.16 + fbm(x * 0.07, z * 0.07, 3) * 0.8 + 2.8 * Math.exp(-((x - 5) ** 2 + (z + 12) ** 2) / 14) + 0.5 * Math.exp(-((x + 7) ** 2 + (z + 10) ** 2) / 20),
  color: (x, z, h) => {
    const head = Math.exp(-((x - 5) ** 2 + (z + 12) ** 2) / 14);
    if (head > 0.45) return mixc(0x9a9488, 0x8a9a7a, noise2(x, z) + 0.5);
    if (h < 0.15) return col(0xc8b08a);
    if (h < 1.1) {
      const s = noise2(x * 4.1, z * 4.1);
      if (s > 0.43) return col([0x7fd0c0, 0xe8b070, 0xd890a8, 0xa8d8f0][Math.floor((noise2(x * 9, z * 9) + 1) * 2) % 4]);
      return mixc(0xead8b0, 0xe0c898, noise2(x * 0.5, z * 0.5) + 0.5);
    }
    return mixc(0xc8c088, 0x9aaa6a, smooth(1.1, 2.4, h));
  },
  ambient: ['sparkle', 'motes'],
  settleSpots: [[-11, -2], [-12, 5]],
  keepClear: (x, z) => Math.hypot(x + 5, z + 3) < 2.5,
  erasure: {
    x: -5, z: -3, r: 1.1, page: 'p2', name: 'Marrow and Tobiah\'s bench', label: 'Sit on the bench',
    ready: () => !!flag('shore.lit'),
    model: () => { const g = new THREE.Group(); g.add(M.makeBench(0x7a6a5a)); const lp = M.makeLamppost(true, 0xfff1b8); lp.position.set(1.3, 0, -0.2); g.add(lp); return g; },
    line: 'A bench for two, facing the sea. Someone has carved M + T into the armrest and then, smaller, underneath: AND WHOEVER ELSE.',
  },
  build(L) {
    const lit = !!flag('shore.lit');
    L.lighthouse = M.makeLighthouse(lit);
    L.place(L.lighthouse, 5, -12.5, { r: 1.7, rot: 0 });
    L.place(M.makeCottage({ wall: 0xe0d8c8, roofC: 0x4f6a7a, lit: L.night || L.phase === 'dusk', w: 2.6, d: 2.2, h: 1.7 }), -7, -10, { r: 2, rot: FACE });
    const wreck = M.makeBoat(0x8a6a4a); L.place(wreck, 2, 3, { r: 1.4, rot: 1.2 }); wreck.rotation.z = 0.35;
    const wreck2 = M.makeBoat(0x6a7a8a); L.place(wreck2, 0.5, 10.5, { r: 1.4, rot: -0.4 }); wreck2.rotation.z = -0.25;
    L.interact({ x: 2, z: 3, r: 2, label: 'Look at the boat', action: () => L.game.narrate('A boat with its name painted out. Underneath, if you squint, someone has written it again in pencil: TOBIAH\'S, DON\'T TOUCH.') });
    L.scatter(10, (x, z, r) => { const d = M.makeTree(r, { kind: 'dead', trunk: 0xb8a890 }); d.rotation.z = Math.PI / 2 - 0.15; return L.place(d, x, z, { r: 0.5, y: L.heightAt(x, z) + 0.15 }); }, { r: 1.2, region: (x, z) => shore.height(x, z) < 1 && shore.height(x, z) > 0.2 });
    L.scatter(16, (x, z, r) => L.place(M.makeRock(r, 0x9a948a, 0.6 + r() * 1.2), x, z, { r: 0.6 }), { r: 0.9, region: (x, z) => shore.height(x, z) < 0.6 });
    L.scatter(8, (x, z, r) => L.place(M.makeTree(r, { kind: 'pine', leaf: 0x5a7a5a }), x, z, { r: 0.7, sway: true }), { r: 1.6, region: (x) => x < -9 });
    L.grass(1800, (p, r) => (r() > 0.5 ? 0xc8c070 : 0xa8b060), (x, z) => shore.height(x, z) > 1.0, 0.7);
    // Marrow
    L.marrow = L.npc({ id: 'marrow', name: 'Marrow Quell', model: M.makePerson({ skin: 0xe8c0a0, cloth: 0xd8b040, hair: 0xd8d4cc, bun: true, height: 0.9 }), x: 0.8, z: -8.5, face: FACE, voice: V.marrow, color: '#a8862a',
      bubble: () => (!flag('shore.met') || (flag('shore.beam') && !lit) || ((flag('shore.talk') || 0) >= 3 && !hasCharm('seaglass')) ? '!' : flag('tea.invite') && lit && !flag('tea.guest.marrow') ? '✉' : null), talk: marrowTalk });
    // the catch-glasses that carry the sun up to the lamp
    catchGlasses(L, { lit, onLight: () => {
      setFlag('shore.beam');
      audio.sfx('restore');
      L.game.cam.shake = 0.5;
      ui.toast('The light runs glass to glass to glass, and up the lighthouse wall, and catches. Somewhere up the stair, Marrow shouts.', 5000);
      L.game.wait(1.6).then(() => L.game.talk(L.marrow));
    } });
    const extra = lit ? [[-4, 4], [3, -1]] : [[-5, 4], [1, -2], [8, 1], [3, 5], [7, -3]];
    extra.forEach(([x, z]) => L.enemy('crab', x, z));
    if (!lit) { L.enemy('mistling', -3, -5); L.enemy('mistling', -10, 2); }
    // after the light: boats, a crab merchant, a bottle
    if (lit) {
      for (let i = 0; i < 6; i++) {
        const b = M.makePaperBoat([0xf6f0e2, 0xf3d8c8, 0xd8e8f0][i % 3]);
        const bx = 10 + (i % 3) * 2.6, bz = -6 + i * 2.6;
        L.place(b, bx, bz, { y: 0 });
        L.updaters.push((dt, t) => { b.position.y = Math.sin(t * 1.5 + i) * 0.06; b.rotation.z = Math.sin(t * 1.2 + i) * 0.08; b.position.x = bx + Math.sin(t * 0.2 + i) * 1.5; });
      }
      if (!helped('pockets')) {
        L.place(M.makeStall(0x5a8aa8), -9, 3, { r: 1.2, rot: FACE });
        L.npc({ id: 'pockets', name: 'Mister Pockets', model: M.makeHermitCrab(), x: -7.6, z: 4.4, face: FACE, voice: V.pockets, color: '#c86a4a', bubble: () => (!flag('pockets.met') ? '!' : null), talk: pocketsTalk });
      }
      // somebody out on the water is talking with a lamp
      if (!hasCharm('seaglass')) {
        const [lx, lz] = L.nearestWalkable(5.5, -1, 0.4);
        lampTalk(L, { x: lx, z: lz, far: [14, -3], onRound: (n) => {
          if (n >= 3) { ui.toast('The far light goes very still. Then it blinks once more, slowly, the way you would wave from a boat.', 5000); L.game.wait(2.5).then(() => L.game.talk(L.marrow)); }
          else ui.toast(n === 1 ? 'The far light flickers back, pleased with you. Then it says something new.' : 'Another answer. The far light waits a long moment, as if deciding something.', 4000);
        } });
      }
      if (state.day >= (flag('shore.litDay') || 0) + 6 && !flag('shore.bottle')) {
        const bottle = new THREE.Group();
        bottle.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.12, 0.15, 0.45, 8), [0, 0, 0], [0, 0, Math.PI / 2.3]), 0x8fd0b8), M.paint(M.xf(M.G.cyl(0.05, 0.06, 0.15, 6), [0.28, 0.1, 0], [0, 0, Math.PI / 2.3]), 0x6a4a36)]));
        bottle.add(M.glow(0xfff0c0, 1.4, 0.5));
        L.pickup(bottle, 6.5, 2.5, () => tobiahLetter(L), { y: 0.3 });
      }
    }
    if (kin('brackish-lights') && (L.night || L.phase === 'dusk')) {
      const ghost = M.makeBoat(0xe8f0ff);
      ghost.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0.35 }); });
      ghost.scale.setScalar(2);
      L.place(ghost, 16, 0, { y: 0 });
      L.updaters.push((dt, t) => { ghost.position.z = Math.sin(t * 0.05) * 14; ghost.rotation.y = Math.cos(t * 0.05) > 0 ? 0 : Math.PI; });
    }
    if (kin('sea-apples')) for (let i = 0; i < 8; i++) {
      const g = M.glow(0x8fd8ff, 1.2, 0.8); const bx = 9 + (i % 4) * 2.5, bz = -2 + Math.floor(i / 4) * 5;
      L.place(g, bx, bz, { y: 0.3 });
      L.updaters.push((dt, t) => { g.position.y = 0.25 + Math.sin(t * 2 + i) * 0.08; });
    }
  },
  update(L, dt) {
    const b = L.lighthouse.userData.beam;
    if (b) b.rotation.y += dt * 0.6;
  },
};
async function marrowTalk(D) {
  const lit = flag('shore.lit');
  if (!flag('shore.met')) {
    setFlag('shore.met');
    await D.say('Right. You\'re not a crab. That\'s a start.');
    await D.say('I\'m Marrow. I keep the light. I\'ve kept it dark for sixty-one years, which is the same work with less oil.');
    await D.say('It never took oil, mind. It\'s a sun-lamp. My brother Tobiah set catch-glasses down the beach to carry the evening up to it, the week before he sailed. He wanted to see where the mist stops.');
    await D.say('The crabs have been at the glasses since. They turn them about to look at themselves in. Vain things. They\'ve nothing to be vain about, so.');
    const c = await D.choose(['I\'ll turn them back.', 'Why light it, if he\'s gone?']);
    if (c === 1) await D.say('A light\'s for whoever\'s out there. I don\'t get to pick who that is. Nobody does. That\'s the point of a light.');
    await D.say('There\'s a brass dish at the top of the beach with the sun in it. Turn the glasses so it carries all the way here. I don\'t expect him back. I\'d like the light on anyway.');
    return;
  }
  if (!lit) {
    if (!flag('shore.beam')) { await D.say('Start at the brass dish, up the west end. The light goes whichever way a glass is facing. Follow it along and it\'ll show you where it\'s stuck. Mind the crabs, they pinch for a long while after they\'ve decided to stop.'); return; }
    await D.say('Did you hear that? That\'s the lamp catching. Sixty-one years and it still catches like it\'s surprised.');
    await D.say('Stand back from the stair. The lens wants turning by hand the first time. It\'s stiff. It\'s like me, it\'s been sat a long while.');
    setFlag('shore.lit'); setFlag('shore.litDay', state.day);
    await D.transform();
    await D.say('There. It sweeps the same as it did. I\'d forgotten the noise it makes, like somebody turning over in their sleep.');
    await D.say('I found this in my nets a while back. A bell full of marsh water. It\'s no use to me and it hums at night, flat, so I\'ve not been sleeping. Take it.');
    D.give('bell');
    addLetter('marrow1', 'Marrow Quell', 'From the lighthouse', 'The light is on every night. I go up at six and come down at six. I had forgotten how many stairs there are. There are a hundred and twelve.\n\nThe paper boats have started coming. I don\'t know who folds them. They come in on the tide and sit by the rocks like they\'re waiting to be told off.\n\nCome and have tea. I have tea now. — M.', 2);
    return;
  }
  if ((flag('shore.talk') || 0) >= 3 && !hasCharm('seaglass')) {
    await D.say('Short, long, long, short, short. Is that what it said? Say it again. No, don\'t. I heard it.');
    await D.say('That\'s ours. That\'s what we used to flash across the bay when Mam was calling us in. It means leave it on.');
    await D.say(flag('shore.bottle') ? 'It\'s him, so. He said in his letter he was keeping a light. He\'s answering. The stubborn old article is answering.' : 'There\'s one person knows that. One, and he\'s out past the mist somewhere, being stubborn about it.');
    await D.say('He used to make me things out of sea-glass when we were small. I kept the one. Here. It\'s sharp at the edges. Most things are, that are worth keeping. Wear it when you\'re in a hurry.');
    giveCharm(D.land.game, 'seaglass');
    return;
  }
  if (await teaInvite(D, 'marrow', 'A tea party. In a teacup. Right. I\'ll put my good coat on, so.')) return;
  if (!flag('shore.talk.told') && !hasCharm('seaglass')) { setFlag('shore.talk.told'); await D.say('There\'s a light out on the water. Past the wrecks. It blinks, short and long. Tobiah and I used to talk like that with lamps, when we were small.'); await D.say('There\'s a hand-lamp on the post down by the water. Answer it for me, would you? My hands shake now. It all comes out as nonsense.'); return; }
  if (flag('shore.talk') && !hasCharm('seaglass')) { await D.say('Keep at it. It\'s slow, lamp-talk. You can\'t shout with a lamp, that\'s the best thing about it.'); return; }
  if (flag('shore.bottle')) { await D.say('He found the edge, then. More people past it. He\'s stopped to keep a light for them, so. That\'s like him. That\'s exactly like him.'); return; }
  await D.say(quietWords(D.land, 3, [
    'The light\'s on. I sleep better. I didn\'t know I wasn\'t sleeping until I was.',
    'There\'s a crab down the beach with a shop. Don\'t buy the sand. He\'ll try and sell you the sand.',
    'Somebody folds those paper boats. I\'ve sat up three nights to see who and I\'ve fallen asleep three nights, so.',
    'A hundred and twelve stairs. I counted again. Still a hundred and twelve, which is a comfort.',
  ]));
}
async function tobiahLetter(L) {
  setFlag('shore.bottle');
  audio.sfx('item');
  await L.game.letterPanel({ from: 'Tobiah Quell', title: 'A letter in a bottle', text: 'Marrow,\n\nI got to the edge. It isn\'t an edge. It\'s more people, in a place that was folded up smaller than ours, and they\'ve no light at all, so I\'ve been keeping one for them, which I suppose you\'ll find funny.\n\nI saw ours come on, last week. Sixty-one years and I\'d know it anywhere. It\'s the only one that stutters on the turn.\n\nDon\'t wait up. But leave it on.\n\n— Tobiah' });
  ui.toast('You keep the bottle. Marrow should hear about this.');
}
async function pocketsTalk(D) {
  if (!flag('pockets.met')) {
    setFlag('pockets.met');
    await D.say('Customer! Between you and me, you\'re my first since the mist. Pockets is the name. Mister Pockets. I sell things, and now and again I sell them twice.');
    await D.say('The trouble is this beach. Everyone\'s a crab. And crabs, between you and me, are very stabby, they come up to the stall and stab the stock.');
    await D.say('I want a spot with foot traffic. Somewhere wet, for the shell, but busy, with neighbours on more than one side. You don\'t know a place like that?');
    const c = await D.choose(['I\'ll find you somewhere.', 'Can I see what you\'ve got first?']);
    if (c === 1) await D.shop();
    D.settle('pockets');
    return;
  }
  await D.say('Still here, still looking, still open for business. No, no, I\'m always open. Closing is for people with doors.');
  await D.shop();
}

// ---------------------------------------------------------------- LANTERN ORCHARD
const orchardPath = [[4, 7], [3, 4], [-1, -1], [-2.5, -3], [-8, -6], [-11, -8]];
const orchard = {
  id: 'orchard', radius: 21, spawn: [4, 7],
  lush: { flowers: [0xf8c070, 0xfff0a8, 0xe8704a, 0xffffff, 0xd85a6a] },
  cliff: 0xa88a60, cliff2: 0x7a5a5a,
  height: (x, z) => 0.6 + fbm(x * 0.055, z * 0.055, 3) * 2.2,
  color: (x, z, h) => {
    const p = polyDist(x, z, orchardPath);
    const g = mixc(0x8aa858, 0xb4b06a, noise2(x * 0.15, z * 0.15) + 0.5);
    if (p < 1.2) return mixc(0xc8a070, g, smooth(0.7, 1.2, p));
    return g;
  },
  paved: (x, z) => smooth(1.25, 0.55, polyDist(x, z, orchardPath)),
  // the path, Thimble, the windmill, the swing, and a clear view of the tiny door from the camera's side
  keepClear: (x, z) => polyDist(x, z, orchardPath) < 1.6 || Math.hypot(x + 2, z + 4) < 3.5 || Math.hypot(x + 11, z + 8) < 3 || Math.hypot(x + 7, z - 6) < 3 || polyDist(x, z, [[10.5, -8.5], [16, -3]]) < 2.2,
  erasure: {
    x: -7, z: 6, r: 1.4, page: 'p3', name: 'The swing', label: 'Look at the swing', rot: 0.3,
    ready: () => !!flag('orchard.poem'),
    model: () => M.makeSwing(),
    after: (L, o) => L.updaters.push((dt, t) => (o.userData.seat.rotation.x = Math.sin(t * 1.4) * 0.35)),
    line: 'A swing, hung from a beam that was plainly made for the purpose. It is still moving a little, as if someone has only just got off.',
  },
  ambient: ['leaves', 'butterflies', 'motes'],
  moteColor: 0xffe0a0,
  tint: { dusk: 0xffb070, amount: 0.15 },
  settleSpots: [[9, -2], [-12, 4]],
  build(L) {
    const done = !!flag('orchard.poem');
    const glowFruit = done || kin('giants-garden');
    L.windmill = M.makeWindmill();
    L.place(L.windmill, -11, -8, { r: 1.7, rot: FACE });
    L.interact({ x: -11, z: -8, r: 2.6, label: 'Knock on the windmill door', action: () => L.game.narrate('Nobody answers. The windmill\'s door is an ordinary, people-sized door. Somewhere on the far side of the orchard, by the edge, there is a much smaller one, set into the foot of a tree with a lantern lit beside it.') });
    // the critics' tree, and after the poem the heavy old tree: placed first, so the rows grow round them
    if (!done) critics(L, { x: 2, z: -12 });
    if (done && !hasCharm('wick') && !flag('orchard.windfalls')) { const [wx, wz] = L.free(7.5, -1, 1.4) ? [7.5, -1] : L.nearestWalkable(7.5, -1, 1.4); windfalls(L, { x: wx, z: wz }); }
    // rows of lantern trees
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const x = i * 4.3 + (L.rng() - 0.5) * 1.2 + 1, z = j * 4.3 + (L.rng() - 0.5) * 1.2;
      if (!L.free(x, z, 1.4)) continue;
      const blue = kin('sea-apples') && L.rng() > 0.6;
      const t = M.makeTree(L.rng, { kind: 'round', leaf: L.rng() > 0.5 ? 0x7a9a4a : 0x8aa850, fruit: blue ? 0x8fd8ff : glowFruit ? 0xffc860 : 0xb8803a, fruitGlow: glowFruit || blue });
      L.place(t, x, z, { r: 0.7, sway: true });
      if (L.rng() > 0.85) { const lad = M.vmesh([M.paint(M.xf(M.G.box(0.5, 2.6, 0.08), [0.6, 1.2, 0], [0, 0, -0.35]), 0x9a7a52)]); L.place(lad, x, z, { rot: L.rng() * 6 }); }
    }
    // the little door
    const doorTree = M.makeTree(L.rng, { kind: 'round', leaf: 0x6a8a44, size: 1.5 });
    // a front step, a red door, a lit round window and a lantern the size of a thimble, all facing the path
    doorTree.add(M.vmesh([
      M.paint(M.xf(M.G.cyl(0.42, 0.48, 0.1, 10), [0, 0.05, 0.45]), 0x9a948a),
      M.paint(M.xf(M.G.box(0.34, 0.5, 0.08), [0, 0.3, 0.5]), 0xc8483a),
      M.paint(M.xf(M.G.cyl(0.17, 0.17, 0.08, 10), [0, 0.55, 0.5], [Math.PI / 2, 0, 0]), 0xc8483a),
      M.paint(M.xf(M.G.sph(0.035, 5, 4), [0.1, 0.3, 0.56]), 0xe8c84a),
    ]));
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), M.basic(0xffd27a)); win.position.set(0.32, 0.75, 0.47); doorTree.add(win);
    const lamp = M.glow(0xffc860, 1.4, 0.9); lamp.position.set(-0.3, 0.6, 0.6); doorTree.add(lamp);
    const warm = M.glow(0xffb860, 3, 0.35); warm.position.set(0, 0.5, 0.7); doorTree.add(warm);
    L.place(doorTree, 10, -9, { r: 0.9, rot: FACE });
    L.interact({ x: 10, z: -9, r: 2.7, label: 'Knock on the tiny door', action: () => tinyDoor(L) });
    // once you've windfalls for them, an apple bobs over the door to show the way
    if (done && !hasCharm('wick')) {
      const mk = M.makeLanternApple(); mk.scale.setScalar(1.6); L.scene.add(mk);
      L.updaters.push((dt, t) => { mk.visible = !!flag('orchard.windfalls') && !hasCharm('wick'); mk.position.set(10, L.heightAt(10, -9) + 7.8 + Math.sin(t * 2) * 0.2, -9); mk.rotation.y = t; });
    }
    // Sir Thimble
    if (done) L.place(M.vmesh([M.paint(M.xf(M.G.box(3.2, 0.35, 2.2), [0, 0.17, 0]), 0x9a7a52), M.paint(M.xf(M.G.box(3.4, 0.08, 0.3), [0, 0.37, 1.0]), 0xb85a4a)]), -2, -4, { r: 0, rot: FACE });
    const sc = M.makeScarecrow();
    const thimble = L.npc({ id: 'thimble', name: 'Sir Thimble Haybright', model: sc, x: -2, z: -4, face: FACE, voice: V.thimble, color: '#7a8a3a', y: done ? 0.35 : 0,
      bubble: () => (!flag('orchard.met') || (wordCount() === 3 && !done) ? '!' : flag('tea.invite') && done && !flag('tea.guest.thimble') ? '✉' : null), talk: thimbleTalk });
    thimble.y = done ? 0.35 : 0;
    if (done) {
      // the critics, reformed, perched on his arms
      for (const s of [-1, 1]) {
        const jd = M.makeEnemy('jackdaw');
        jd.scale.setScalar(0.7);
        jd.position.set(s * 0.75, 0.25, 0); jd.rotation.y = s * 0.4;
        sc.add(jd);
        L.updaters.push((dt, t) => { jd.userData.parts.body.rotation.z = Math.sin(t * 2 + s) * 0.1; jd.userData.parts.wings.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * (0.2 + Math.max(0, Math.sin(t * 0.7 + s)) * 0.3))); });
      }
    }
    const roots = done ? [[8, 3], [-6, 8]] : [[8, 3], [-6, 8], [-10, -2], [4, -8]];
    roots.forEach(([x, z]) => L.enemy('rootling', x, z));
    if (!done) { L.enemy('jackdaw', -4, 9); L.enemy('jackdaw', 6, -5); }
    L.grass(2400, (p, r) => (r() > 0.5 ? 0xa8c060 : 0xb8c868));
    L.scatter(40, (x, z, r) => L.place(M.makeFlower(r, [0xfff0a8, 0xf8c070, 0xffffff][Math.floor(r() * 3)], 0xffa040), x, z), { r: 0.2 });
  },
  update(L, dt) { L.windmill.userData.blades.rotation.z += dt * (flag('orchard.poem') ? 0.9 : 0.15); },
};
const wordCount = () => [0, 1, 2].filter((i) => flag('orchard.word' + i)).length;
async function thimbleTalk(D) {
  const done = flag('orchard.poem');
  if (!flag('orchard.met')) {
    setFlag('orchard.met');
    await D.say('Ah! A reader! Or a listener, at least, which is what readers were before they could afford books. Sir Thimble Haybright, poet, at your disposal.');
    await D.say('I was composing the finest poem this orchard has ever grown, my friend, and then my critics came down on me and carried off the best words.');
    await D.say('The jackdaws, I mean. Black coats, sharp opinions. They took "ember", and they took "after", and the third one I can\'t remember, which is rather the trouble.');
    await D.say('They\'ve gone and sat in the dead tree at the south end, all three, and they won\'t come down. Without the words the poem has holes in it, and the holes are in all the important places.');
    await D.say('You can\'t fight a critic, my friend. I\'ve tried. You can only catch one off guard. Creep up while they\'re preening, and keep very still when they look up.');
    return;
  }
  if (!done) {
    if (wordCount() < 3) { await D.say(wordCount() === 0 ? 'They\'re in the dead tree to the south. Critics never look up from themselves for long, but they do look up. Use the trees, my friend. A critic can\'t see through a trunk, whatever it says.' : 'Oh, you\'ve got one! Alas, I still can\'t finish without the others. A poem\'s like a ladder, if I may, you notice the missing rungs.'); return; }
    await D.say('Ember, after, and... home. Home! Of course it was home. Alas, I\'d been trying "loam" in that spot for two years, and nothing rhymes with loam that you\'d want in a poem.');
    await D.say('Please, stand just there, where the light is good. I\'ve never had an audience with a face before. The trees have faces, but only if you squint.');
    await D.poem('The Orchard, After', [
      'The orchard kept its lanterns lit',
      'for hands that used to gather it.',
      'The pickers left, the ladders stayed,',
      'the apples glowed, and were afraid',
      'that no one after them would come.',
      'I\'m made of straw. I have no home.',
      'But ember-light on every bough',
      'says someone\'s walking through it now.',
    ]);
    setFlag('orchard.poem');
    await D.transform();
    await D.say('Well. I\'ll stop there. The jackdaws are clapping, I think, or that\'s their beaks, but I choose to hear it as clapping.');
    await D.say('Take this, my friend. I used it to keep my place in the poem. I don\'t need to keep my place any more, I\'ve got the whole thing, start to finish.');
    D.give('bookmark');
    addLetter('thimble1', 'Sir Thimble Haybright', 'A second poem (draft)', 'My friend,\n\nI am at work on a second poem. It is about you, which is embarrassing for both of us, so I\'ve made it vague. Here is the start:\n\n   Someone came up through the rows\n   with a satchel and a walking-stick,\n   and where they\'d been, the lantern glows\n\nI can\'t find a rhyme for stick that isn\'t "tick" or "sick" or "brick". The critics suggest "lunatic". I have asked them to leave.\n\n— Sir T. H.', 1);
    return;
  }
  if (await teaInvite(D, 'thimble', 'Tea! I accept! I\'ll compose a toast. A short one. My critics have views about length.')) return;
  if (!hasCharm('wick') && !flag('orchard.windfalls') && !flag('orchard.apple.told')) { setFlag('orchard.apple.told'); await D.say('The little folk behind the tiny door have been asking after windfalls, my friend. The old tree by the east path has grown heavy since the poem.'); await D.say('It\'s the big one with the basket under it. Give it a shake, or a knock with your stick, and catch what falls. Bruised ones won\'t do, they say. They\'re very particular, for people the size of a cork.'); return; }
  await D.say(quietWords(D.land, 4, [
    'I\'m working on a second poem. It\'s about you, which is a bit embarrassing for both of us, so I\'ve kept it vague.',
    'The jackdaws and I have reached an understanding. They sit on my arms and I don\'t write about them. It\'s very like publishing.',
    'Someone knocked on the little door in the old tree yesterday and was told to go away. I find that very encouraging. It means someone\'s in.',
    'Do you know, the windmill turns faster when I recite? I don\'t think it\'s the poem. I think I\'m standing in the wind.',
  ]));
}
async function tinyDoor(L) {
  if (flag('orchard.poem') && !hasCharm('wick')) {
    audio.sfx('door');
    if (!flag('orchard.windfalls')) { await L.game.narrate('Knock knock. A tiny voice: "Have you brought windfalls? From the old tree, the big one with the basket? We need six, and not a bruise on them. We\'re making a lamp. It\'s a very big lamp, for us."'); return; }
    await L.game.narrate('Knock knock. The door opens properly this time. Six small pairs of hands take the six windfalls, one each, with great care.');
    await L.game.narrate('A moment later one small hand comes back out with a twist of wick, still warm. "For when you\'re cold," says the voice. "Don\'t tell the poet."');
    giveCharm(L.game, 'wick');
    return;
  }
  const i = (flag('tinydoor') || 0);
  setFlag('tinydoor', i + 1);
  audio.sfx('door');
  const lines = [
    'Knock knock. A tiny voice, from inside: "Nobody\'s home! ...Is it raining? Don\'t tell us, we\'re not home."',
    'Knock knock. "Go away, please, we\'re having soup." There is a smell of very small soup.',
    flag('orchard.poem') ? 'Knock knock. "Is that the poet? Tell him we liked the one about the lanterns. Don\'t tell him we said so."' : 'Knock knock. "Is the scarecrow still doing the poem with the holes in? We\'ve been listening. It\'s mostly holes."',
    'Knock knock. The door opens a crack. Something the size of a thimble looks at you for a long moment, then shuts it again, satisfied.',
  ];
  await L.game.narrate(lines[i % lines.length]);
  if (i === 3) { L.lumenMote(10, -8.5, 5); }
}

// ---------------------------------------------------------------- GLOAMWILLOW MARSH
const walks = [
  [[4.5, 8.5], [3, 4], [-2, 0], [-6, -5], [-9, -8]],
  [[-2, 0], [3, -4], [6, -6]],
  [[-2, 0], [-8, 4], [-12, 7]],
  [[3, 4], [9, 6], [12, 9]],
  [[-6, -5], [-5, -11], [-3, -14]],
];
const onWalk = (x, z) => walks.some((w) => polyDist(x, z, w) < 0.85);
const marsh = {
  id: 'marsh', radius: 21, spawn: [4.5, 8.5], water: 0,
  lush: { region: (x, z) => marsh.height(x, z) > 0.3, leaf: [0x46684a, 0x56784e, 0x4a6a58], flowers: [0xc8b8f0, 0xf2b6d8, 0x9ad8e8], density: 0.8 },
  waterDeep: 0x4a6a7a, waterShallow: 0x8aaaa0,
  cliff: 0x6a6a5a, cliff2: 0x4a4258,
  height: (x, z) => -0.12 + fbm(x * 0.09 + 3, z * 0.09, 3) * 1.6 + 1.4 * Math.exp(-((x + 9) ** 2 + (z + 9) ** 2) / 22) + 0.9 * Math.exp(-((x - 4.5) ** 2 + (z - 9) ** 2) / 10) + 0.7 * Math.exp(-((x - 7) ** 2 + (z + 5) ** 2) / 8),
  color: (x, z, h) => (h < 0.1 ? col(0x6a7a52) : mixc(0x7a9a5a, 0x9a9a6a, noise2(x * 0.3, z * 0.3) + 0.5)),
  bridge: onWalk,
  keepClear: (x, z) => walks.some((w) => polyDist(x, z, w) < 1.4),
  ambient: ['fireflies', 'spores'],
  fireflyColor: 0xb8f0ff,
  tint: { all: 0x6a5a8a, amount: 0.35 },
  mist: (ph) => (ph === 'night' ? [0x3a3a60, 0x22223a] : [0xb8a8c8, 0x6a6a8a]),
  settleSpots: [[-10, -3], [9, 0]],
  erasure: {
    x: -8.5, z: -3, r: 1.2, page: 'p4', name: 'The little shrine', label: 'Look at the shrine',
    ready: () => !!flag('marsh.done'),
    model: () => M.makeShrine(),
    line: 'A little shrine with a blue bell in it, for the lights that lose their way. It rings very softly when you stand near, as if to say: this way.',
  },
  build(L) {
    const done = !!flag('marsh.done');
    // boardwalks
    const plank = [];
    for (const w of walks) for (let i = 0; i < w.length - 1; i++) {
      const a = w[i], b = w[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < len; s += 0.55) {
        const x = a[0] + (b[0] - a[0]) * (s / len), z = a[1] + (b[1] - a[1]) * (s / len);
        const y = Math.max(L.baseH(x, z), 0) + 0.12;
        plank.push(M.paint(M.xf(M.G.box(1.5, 0.08, 0.45), [x, y, z], [0, ang + Math.PI / 2 + (L.rng() - 0.5) * 0.08, 0]), L.rng() > 0.5 ? 0x8a6a4a : 0x7a5a3e, { jitter: 0.15 }));
        if (Math.floor(s / 0.55) % 5 === 0) for (const sd of [-0.7, 0.7]) plank.push(M.paint(M.xf(M.G.cyl(0.06, 0.07, 0.9, 5), [x + Math.cos(ang) * sd, y - 0.3, z - Math.sin(ang) * sd]), 0x5a4030));
      }
    }
    L.scene.add(M.vmesh(plank));
    // lanterns along the walks
    [[3, 4], [-2, 0], [-6, -5], [3, -4], [-8, 4], [9, 6], [-5, -11]].forEach(([x, z], i) => L.place(M.makeLamppost(done || L.night, 0x9fe0ff), x + 0.9, z + 0.6, { r: 0.15 }));
    // chapel ruin and its bell tower
    L.place(M.makeArch(0x9a948a), -9, -7, { r: 0, rot: FACE });
    L.place(M.makeRuinWall(L.rng, 4, 2.6), -12, -9, { r: 0.5, rot: FACE + Math.PI / 2 });
    L.place(M.makeRuinWall(L.rng, 3, 2), -8, -12, { r: 0.5, rot: FACE });
    const tower = new THREE.Group();
    tower.add(M.vmesh([M.paint(M.xf(M.G.box(1.8, 5, 1.8), [0, 2.5, 0]), 0x9a948a, { jitter: 0.15 }), M.paint(M.xf(M.G.cone(1.5, 1.4, 4), [0, 6.5, 0], [0, Math.PI / 4, 0]), 0x5a5a6a)]));
    for (const c of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) tower.add(M.vmesh([M.paint(M.xf(M.G.box(0.3, 1, 0.3), [c[0], 5.5, c[1]]), 0x9a948a)]));
    if (done) { const bell = M.makeBell(); bell.position.y = 4.95; bell.scale.setScalar(0.9); tower.add(bell); const gl = M.glow(0xffe0a0, 2.5, 0.4); gl.position.y = 5.4; tower.add(gl); L.bell = bell; }
    L.place(tower, -11.5, -11.5, { r: 1.4, rot: FACE });
    // Brine and the ferry
    L.place(M.vmesh([M.paint(M.xf(M.G.box(2.5, 0.15, 3), [0, 0.35, 0]), 0x7a5a3e)]), 7.5, -7, { rot: FACE });
    L.ferry = M.makeBoat(0x5a4a3a);
    L.place(L.ferry, 9.5, -9, { y: 0, rot: FACE });
    const fl = M.makeLamppost(true, 0x9fe0ff); fl.scale.setScalar(0.6); fl.position.set(0, 0.4, 1.2); L.ferry.add(fl);
    // once the lights are home, Brine will take you over to see them
    if (done) L.interact({ x: 8.6, z: -8.2, r: 2, label: 'Ask Brine to row you across', action: async () => {
      if (L.game.talking) return;
      await L.game.narrate('Brine rows you out over the black water. Neither of you says anything. It is the good kind of quiet, the kind after the washing up.');
      L.game.enterLand('farbank');
    } });
    L.brine = L.npc({ id: 'brine', name: 'Auntie Brine', model: M.makeToad(), x: 6.5, z: -6.2, face: FACE, voice: V.brine, color: '#5a6a4a', r: 0.9, blob: 1.4,
      bubble: () => (!flag('marsh.met') || (marshReady() && !done) ? '!' : flag('tea.invite') && done && !flag('tea.guest.brine') ? '✉' : null), talk: brineTalk });
    // willows, reeds, pads
    L.scatter(14, (x, z, r) => L.place(M.makeTree(r, { kind: 'willow', leaf: r() > 0.5 ? 0x6a8a5a : 0x7a8a6a, trunk: 0x4a3a30 }), x, z, { r: 0.8, sway: true }), { r: 2, region: (x, z) => marsh.height(x, z) > 0.3 });
    L.scatter(30, (x, z, r) => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) g.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.02, 0.03, 1.2 + r() * 0.6, 3), [(r() - 0.5) * 0.8, 0.6, (r() - 0.5) * 0.8], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3]), 0x6a7a4a), M.paint(M.xf(M.G.cyl(0.05, 0.05, 0.25, 5), [(r() - 0.5) * 0.8, 1.3, (r() - 0.5) * 0.8]), 0x6a4a30)], { shadow: false })); return L.place(g, x, z); }, { r: 0.3, region: (x, z) => Math.abs(marsh.height(x, z)) < 0.25 });
    const padM = M.lambert(0x5a8a4a, { side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      const x = (L.rng() - 0.5) * 36, z = (L.rng() - 0.5) * 36;
      if (L.mask(x, z) < 0.8 || marsh.height(x, z) > -0.15 || onWalk(x, z)) continue;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35 + L.rng() * 0.3, 10, 0.3, Math.PI * 1.8), padM);
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = L.rng() * 6; pad.position.set(x, 0.03, z);
      L.scene.add(pad);
      if (L.rng() > 0.7) { const f = M.makeFlower(L.rng, 0xf2b6d8, 0xffe08a, 1.2); f.position.set(x, -0.15, z); L.scene.add(f); }
    }
    // frogs that hop off when you come close
    for (let i = 0; i < 6; i++) frog(L, ...[[1, 2], [-4, -2], [-7, 3], [4, -3], [-3, -8], [10, 7]][i]);
    // the lost lights
    L.wisps = [];
    const W = [['a', 0xbfe8ff, -12, 7.5], ['b', 0xd8c8ff, -3, -14.5], ['flicker', 0xffd890, 12.5, 9.5]];
    for (const [id, c, x, z] of W) {
      if (flag('marsh.wisp.' + id)) continue;
      const m = M.makeWisp(c);
      L.place(m, x, z, { rot: FACE });
      L.wisps.push({ id, obj: m, x, z, follow: false, t: Math.random() * 5 });
    }
    if (flag('marsh.wisp.flicker') && !state.settlers.flicker) {
      L.npc({ id: 'flicker', name: 'Flicker', model: M.makeWisp(0xffd890), x: 5, z: -5, face: FACE, voice: V.flicker, color: '#7a9ac8', noCollide: true, noBlob: true, talk: async (D) => { await D.say('is there a window yet? i\'m not in a hurry. well, i am a bit. i\'ve never had a hurry before, it\'s exciting.'); } });
    }
    const mires = done ? [[-4, 6], [8, 2]] : [[-4, 6], [8, 2], [-8, 0], [0, -9], [-10, 6], [9, 7]];
    mires.forEach(([x, z]) => { if (L.walkable(x, z)) L.enemy('mireling', x, z); else L.enemy('mireling', x * 0.8, z * 0.8); });
    if (done || kin('brackish-lights')) for (let i = 0; i < 14; i++) {
      const g = M.glow(i % 2 ? 0x9fe0ff : 0xffe0a0, 1.0, 0.8);
      const bx = (L.rng() - 0.5) * 30, bz = (L.rng() - 0.5) * 30;
      if (marsh.height(bx, bz) > -0.1 || L.mask(bx, bz) < 0.8) continue;
      L.place(g, bx, bz, { y: 0.25 });
      L.updaters.push((dt, t) => { g.position.y = 0.25 + Math.sin(t * 1.5 + i) * 0.1; });
    }
    L.grass(1400, (p, r) => (r() > 0.5 ? 0x6a8a5a : 0x7a8a5a), (x, z) => marsh.height(x, z) > 0.15, 0.6);
  },
  update(L, dt) {
    const p = L.player;
    let k = 0;
    for (const w of L.wisps) {
      w.t += dt;
      const body = w.obj.userData.parts.body;
      body.position.y = 0.3 + Math.sin(w.t * 2) * 0.15;
      if (w.crossing) {
        w.ct += dt;
        w.x = lerp(w.sx, 15, w.ct / 5); w.z = lerp(w.sz, -15, w.ct / 5);
        w.obj.position.set(w.x, Math.max(0, L.baseH(w.x, w.z)) + w.ct * 0.6, w.z);
        w.obj.scale.setScalar(Math.max(0.01, 1 - w.ct / 5));
        if (w.ct > 5) { L.scene.remove(w.obj); w.gone = true; }
        continue;
      }
      // already handed over to Brine: it stays put, and mustn't start following you again
      if (w.home) { w.obj.position.set(w.x, L.groundAt(w.x, w.z), w.z); continue; }
      if (!w.follow && Math.hypot(p.x - w.x, p.z - w.z) < 2.2) {
        w.follow = true; audio.sfx('pickup');
        ui.toast(w.id === 'flicker' ? 'A warm little light starts following you.' : 'A lost light starts following you.');
      }
      if (w.follow) {
        const behind = 1.3 + k * 0.9;
        const tx = p.x - Math.sin(p.face) * behind, tz = p.z - Math.cos(p.face) * behind;
        w.x = lerp(w.x, tx, 1 - Math.pow(0.05, dt)); w.z = lerp(w.z, tz, 1 - Math.pow(0.05, dt));
        k++;
        if (Math.hypot(w.x - L.brine.x, w.z - L.brine.z) < 3.4 && !L.game.transitioning && !ui.busy && !L.game.talking && !L.cutscene) deliverWisp(L, w);
      }
      w.obj.position.set(w.x, L.groundAt(w.x, w.z), w.z);
      if (Math.random() < dt * 8) L.fx.emit(w.x, L.groundAt(w.x, w.z) + 1.3, w.z, { color: 0xd8f0ff, size: 0.2, life: 0.8, vy: 0.3, kind: 3 });
    }
    L.wisps = L.wisps.filter((w) => !w.gone);
    if (L.bell) L.bell.rotation.z = Math.sin(L.t * 1.2) * 0.12;
  },
};
const marshReady = () => flag('marsh.wisp.a') && flag('marsh.wisp.b') && flag('marsh.wisp.flicker');
function frog(L, x, z) {
  const g = new THREE.Group();
  g.add(M.vmesh([M.paint(M.xf(M.blobGeo(0.2, 2, 0.05, 8, 6), [0, 0.15, 0], [0, 0, 0], [1.1, 0.7, 1.2]), 0x6a9a4a), M.paint(M.xf(M.G.sph(0.06, 5, 4), [-0.08, 0.27, 0.12]), 0x8aba5a), M.paint(M.xf(M.G.sph(0.06, 5, 4), [0.08, 0.27, 0.12]), 0x8aba5a)]));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(M.G.sph(0.03, 4, 3), M.lambert(0x201a18)); e.position.set(s * 0.08, 0.3, 0.16); g.add(e); }
  const f = { x, z, hop: 0, cd: 0 };
  L.place(g, x, z, { sink: 0 });
  L.updaters.push((dt) => {
    const p = L.player, d = Math.hypot(p.x - f.x, p.z - f.z);
    f.cd -= dt;
    if (d < 2.2 && f.hop <= 0 && f.cd <= 0) { f.hop = 0.5; f.cd = 1; const a = Math.atan2(f.z - p.z, f.x - p.x) + (Math.random() - 0.5); f.vx = Math.cos(a) * 3.5; f.vz = Math.sin(a) * 3.5; g.rotation.y = Math.atan2(f.vx, f.vz); audio.sfx('blip', { pitch: 0.4, wave: 'square' }); }
    if (f.hop > 0) { f.hop -= dt; f.x += f.vx * dt; f.z += f.vz * dt; if (L.mask(f.x, f.z) < 0.7) { f.x -= f.vx * dt; f.z -= f.vz * dt; } if (f.hop <= 0) L.dust.burst(f.x, 0.05, f.z, 4, { color: 0xc8e0f0, size: 0.2, speed: 1, life: 0.4, up: 1 }); }
    g.position.set(f.x, L.groundAt(f.x, f.z) + (f.hop > 0 ? Math.sin((f.hop / 0.5) * Math.PI) * 0.6 : 0), f.z);
  });
}
async function deliverWisp(L, w) {
  if (w.id === 'flicker') {
    w.follow = false; w.home = true; w.x = L.brine.x - 1.5; w.z = L.brine.z + 1.2;
    L.cutscene = true;
    const D = L.game.dialogCtx({ name: 'Flicker', voice: V.flicker, color: '#7a9ac8' });
    await D.say('um. i don\'t want to go across. is that allowed? i don\'t really know how allowed works.');
    await D.say('i used to be the light in someone\'s window. a kitchen one. it was warm and there was always soup, i think. can i do that again instead?');
    await D.as('Auntie Brine', 'Hmm. Well. I don\'t see why not, duckling. A light in a kitchen window does the same job as one on the far bank, near enough. You go and find this one somewhere warm.', V.brine, '#5a6a4a');
    ui.closeDialog();
    setFlag('marsh.wisp.flicker');
    L.game.settle('flicker');
    L.cutscene = false;
    L.game.interactCooldown = 0.5;
    L.scene.remove(w.obj); w.gone = true;
    L.npc({ id: 'flicker', name: 'Flicker', model: M.makeWisp(0xffd890), x: 5, z: -5, face: FACE, voice: V.flicker, color: '#7a9ac8', noCollide: true, noBlob: true, talk: async (D2) => { await D2.say('is there a window yet? i\'m not in a hurry. well, i am a bit. i\'ve never had a hurry before.'); } });
    return;
  }
  w.follow = false; w.crossing = true; w.ct = 0; w.sx = w.x; w.sz = w.z;
  setFlag('marsh.wisp.' + w.id);
  audio.sfx('kinship');
  L.fx.burst(w.x, 1.2, w.z, 30, { color: [0xbfe8ff, 0xffffff], size: 0.4, speed: 2, life: 1.4, grav: -1 });
  const n = ['a', 'b'].filter((k) => flag('marsh.wisp.' + k)).length;
  const D = L.game.dialogCtx({ name: 'Auntie Brine', voice: V.brine, color: '#5a6a4a' });
  L.cutscene = true;
  await D.say(n === 1 ? 'There now. In you go. Off across the water, that\'s it, they always go a bit faster once they\'ve seen the other bank.' : 'There now. That\'s another one home. Hmm. You\'re good at this, duckling, they like you.');
  ui.closeDialog();
  L.cutscene = false;
  L.game.interactCooldown = 0.5;
}
async function brineTalk(D) {
  const done = flag('marsh.done');
  if (!flag('marsh.met')) {
    setFlag('marsh.met');
    await D.say('Hmm. A warm one. You\'ll want to keep to the boards, duckling. The marsh takes boots and it doesn\'t give them back.');
    await D.say('I\'m Brine. I ferry the little lights across to the far bank, where they rest. That\'s all the far bank\'s for, resting. It\'s very nice over there.');
    await D.say('The bell in the old chapel used to call them down to the water. Since it went quiet they\'ve been wandering, and three of them are lost out in the reeds.');
    await D.say('Go and find them, would you? They\'ll follow a warm one home. Mind the mirelings. They\'re only sad mud, but sad mud bites.');
    return;
  }
  if (!done) {
    if (!marshReady()) { await D.say('Walk close to a light and it\'ll follow you. Bring it down here by the ferry and I\'ll see to the rest. There\'s nothing to it, really, there\'s only the finding.'); return; }
    await D.say('That\'s them seen to. Listen. Hear that? They\'re settling on the far side like birds on a wire, all in a row, and complaining a bit.');
    setFlag('marsh.done');
    await D.transform();
    await D.say('And there\'s the bell, back where it belongs. It rings itself, mind. Nobody\'s pulled that rope in a long while.');
    await D.say('One of them left this in my ferry. A teacup, chipped at the lip. Someone drank their last tea from it, and they liked it. You can tell by the way it sits.');
    D.give('teacup');
    addLetter('brine1', 'Auntie Brine', 'From the ferry', 'Duckling,\n\nThe lights come down to the water on their own now, when the bell goes. I only have to row. Rowing is the easy part. I have always thought so.\n\nThe little warm one sends its love. It asked me to write that. It asked me to write it twice, so: its love.\n\n— B.', 2);
    return;
  }
  if (await teaInvite(D, 'brine', 'Tea, hmm? I\'ve not been to a party since the bell went quiet. I\'ll bring a cake. It\'ll be a marsh cake, so don\'t ask what\'s in it.')) return;
  if (!flag('farbank.seen')) { await D.say('You\'ve not been across yet, have you? Hop in the ferry when you like, duckling. They\'d like to see you. They don\'t get visitors. They\'re mostly the visit.'); return; }
  await D.say(quietWords(D.land, 5, [
    'It\'s quieter since. Not the bad quiet. The good one, after the washing up.',
    'The frogs have taken to singing at the bell. The bell doesn\'t mind. The bell has heard worse.',
    'I rowed a light across last night that told me a joke the whole way. I didn\'t get it. I laughed anyway, it seemed to matter to it.',
  ]));
}

// ---------------------------------------------------------------- THE HOLLOW ARCHIVE
const floor = (x, z) => Math.abs(x) < 12 && Math.abs(z) < 12;
const archive = {
  id: 'archive', radius: 20, spawn: [5, 9],
  lush: { region: (x, z) => !floor(x, z), leaf: [0x3f6a3a, 0x4f7a44, 0x5a8448], flowers: [0xc8553f, 0xd8a04a, 0xa070d0, 0xf0e0c0] },
  cliff: 0x8a7a6a, cliff2: 0x5a4a5a,
  height: (x, z) => (floor(x, z) ? 0.35 + noise2(x * 0.3, z * 0.3) * 0.04 : 0.35 + fbm(x * 0.08, z * 0.08, 3) * 1.4 * smooth(11, 15, Math.max(Math.abs(x), Math.abs(z)))),
  color: (x, z, h) => {
    if (floor(x, z)) {
      const chk = (Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1;
      const base = chk ? 0xb8ae98 : 0x9a9080;
      const moss = noise2(x * 0.25, z * 0.25) + 0.15;
      return mixc(base, 0x6a8a4a, smooth(0.0, 0.5, moss));
    }
    return mixc(0x5a7a42, 0x7a8a4a, noise2(x * 0.2, z * 0.2) + 0.5);
  },
  ambient: ['motes', 'ash', 'spores'],
  moteColor: 0xfff4d0,
  tint: { all: 0x9aa070, amount: 0.15 },
  settleSpots: [[13, -6], [-13, -5]],
  // the desk, the arrival spot, and the Mumbleroots' camp (open on the camera side so they can be seen)
  keepClear: (x, z) => Math.hypot(x, z + 1.5) < 4 || Math.hypot(x - 5, z - 9) < 3 || Math.hypot(x - 11.5, z - 3) < 4.5 || Math.hypot(x + 5.5, z) < 2.5,
  erasure: {
    x: -5.5, z: 0, r: 1.2, page: 'p5', name: 'The reading chair', label: 'Sit in the reading chair', rot: 0.6,
    ready: () => !!flag('archive.done'),
    model: () => M.makeReadingNook(),
    line: 'A reading chair, a lamp, and a cold cup of tea on a little table. Somebody was halfway through a book. The bookmark is still in it, waiting.',
  },
  build(L) {
    const done = !!flag('archive.done');
    // walls with holes, columns
    for (const [x, z, r, w] of [[0, -12.5, 0, 9], [-12.5, -4, Math.PI / 2, 10], [-12.5, 8, Math.PI / 2, 5], [12.5, -6, Math.PI / 2, 9]]) L.place(M.makeRuinWall(L.rng, w, 3.2), x, z, { r: 0, rot: r });
    for (const x of [-12.5]) for (let z = -9; z <= 10; z += 0.62) if (z < 1 || z > 5.5) L.colliders.push({ x, z, r: 0.4 });
    for (let x = -4.5; x <= 4.5; x += 0.62) L.colliders.push({ x, z: -12.5, r: 0.4 });
    for (let z = -10.5; z <= -1.5; z += 0.62) L.colliders.push({ x: 12.5, z, r: 0.4 });
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [-9, 0], [9, 0]]) {
      const broken = L.rng() > 0.5;
      const h = broken ? 2 + L.rng() * 1.5 : 4.5;
      L.place(M.vmesh([M.paint(M.xf(M.G.cyl(0.45, 0.5, h, 10), [0, h / 2, 0]), 0xc8beaa, { jitter: 0.1 }), M.paint(M.xf(M.G.box(1.2, 0.3, 1.2), [0, 0.15, 0]), 0xa89e8a)]), x, z, { r: 0.6 });
    }
    // aisles of shelves
    const walking = done && !hasCharm('quill') && !flag('archive.shelves');
    for (const x of [-7, -4, 4, 7]) for (const z of [-8, -5, 4, 7]) {
      if (x === -7 && z === 4) continue; // the poetry corner opening
      if (walking && ((x === -4 && z === 7) || (x === 4 && z > 0))) continue; // these three have wandered off
      L.place(M.makeBookshelf(L.rng), x, z, { r: 1.1, rot: 0 });
    }
    L.place(M.makeSignpost(L.rng), -10.5, 2, { r: 0.2, rot: 0.5 });
    L.interact({ x: -10.5, z: 2, r: 1.5, label: 'Read the sign', action: () => L.game.narrate('POETRY. Someone has added, underneath, in a very small hand: AND HIDING.') });
    L.scatter(30, (x, z, r) => L.place(M.makeBook(r), x, z), { r: 0.3, region: floor });
    L.scatter(3, (x, z, r) => L.place(M.makeTree(r, { kind: 'round', leaf: 0x5a8a44, size: 2.0 }), x, z, { r: 1.2, sway: true }), { r: 3, region: (x, z) => !floor(x, z) || Math.abs(x) > 9 });
    L.scatter(18, (x, z, r) => L.place(M.makeTree(r, { kind: r() > 0.5 ? 'pine' : 'round', leaf: 0x4f7a44 }), x, z, { r: 0.8, sway: true }), { r: 1.6, region: (x, z) => !floor(x, z) });
    L.scatter(26, (x, z, r) => L.place(M.makeMushroom(r, [0xc8553f, 0xd8a04a][Math.floor(r() * 2)], 0.8 + r()), x, z), { r: 0.3 });
    // desk
    L.place(M.vmesh([M.paint(M.xf(M.G.box(2.4, 0.15, 1.2), [0, 1.0, 0]), 0x6a4a36), M.paint(M.xf(M.G.box(0.15, 1, 1), [-1.05, 0.5, 0]), 0x5a3e2e), M.paint(M.xf(M.G.box(0.15, 1, 1), [1.05, 0.5, 0]), 0x5a3e2e), M.paint(M.xf(M.G.box(0.7, 0.3, 0.5), [0.4, 1.22, 0]), 0xf3ead6), M.paint(M.xf(M.G.cyl(0.06, 0.06, 0.25, 6), [-0.7, 1.2, 0]), 0xf3ead6)]), 0, -1.5, { r: 1.2, rot: FACE });
    const candle = M.glow(0xffd27a, 1.5, 0.7); L.place(candle, -0.45, -2.0, { y: L.heightAt(0, -1.5) + 1.4 });
    L.npc({ id: 'quillon', name: 'Quillon Ashby', model: M.makeGhost(done ? 1 : 0), x: -1.2, z: -3.6, face: FACE, voice: V.quillon, color: '#6a7aa8',
      bubble: () => (!flag('archive.met') || (L.carrying && !done) || (flag('archive.shelves') && !hasCharm('quill')) ? '!' : flag('tea.invite') && done && !flag('tea.guest.quillon') ? '✉' : null), talk: quillonTalk });
    // lamps
    for (const [x, z] of [[-3, 1.6], [3, 1.6], [-5.5, -1.5], [5.5, -1.5]]) L.place(M.makeLamppost(done || L.night, 0xffd27a), x, z, { r: 0.2 });
    if (done) {
      const books = [];
      for (let i = 0; i < 9; i++) { const b = M.makeBook(L.rng); b.add(M.glow(0xfff0c0, 0.9, 0.35)); L.scene.add(b); books.push(b); }
      L.updaters.push((dt, t) => books.forEach((b, i) => { const a = t * 0.3 + (i / books.length) * Math.PI * 2; b.position.set(Math.cos(a) * (3 + (i % 2)), L.heightAt(0, 0) + 2.3 + Math.sin(t + i) * 0.3, -1.5 + Math.sin(a) * (3 + (i % 2))); b.rotation.set(Math.sin(t + i) * 0.3, a, 0.2); }));
    }
    if (kin('frog-chorus')) for (let i = 0; i < 4; i++) {
      const x = -2 + i * 1.3, z = 1.2;
      L.place(M.makeBook(L.rng), x, z);
      frogStatue(L, x, z, i);
    }
    if (kin('old-stories')) {
      const b = M.makeBookshelf(mulberry32(9), 1.6);
      L.place(b, 10, 5, { r: 1.1, rot: Math.PI / 2 });
      b.add(M.glow(0xc8e8a8, 3, 0.4));
      L.interact({ x: 10, z: 5, r: 1.8, label: 'Browse the glowing shelf', action: () => L.game.narrate('UMMOTH: A LIFE, volumes one to forty. Volume eleven is just the word "river" written very large, over and over, in different hands.') });
    }
    // the Mumbleroots, if they haven't found a home yet
    if (!state.settlers.mumbleroots) {
      L.place(M.makeTent(0xb89a6a), 11, -0.8, { r: 1.3, rot: FACE });
      L.npc({ id: 'morel', name: 'Papa Morel', model: M.makeMushroomFolk(0xc8553f, 1.2), x: 9.8, z: 1.8, face: FACE, voice: V.morel, color: '#a8553f', bubble: () => (!flag('morel.met') || (flag('puffball.found') && !helped('mumbleroots')) ? '!' : null), talk: morelTalk });
      L.npc({ id: 'chanterelle', name: 'Chanterelle', model: M.makeMushroomFolk(0xd8a04a, 0.75), x: 11.3, z: 1.3, face: FACE, voice: { pitch: 1.8 }, color: '#a8553f', r: 0.35, blob: 0.6, talk: async (D) => { await D.say(flag('puffball.found') ? 'Puffball says the poetry section was "very loud". It\'s a library. Nothing\'s loud. Puffball is strange.' : 'Puffball\'s in the poetry section. Puffball\'s always in the poetry section, because nobody goes in there.'); } });
      if (flag('puffball.found')) L.npc({ id: 'puffball', name: 'Puffball', model: M.makeMushroomFolk(0xf3ead6, 0.55), x: 12.3, z: 0.4, face: FACE, voice: { pitch: 2.3 }, color: '#a8553f', r: 0.3, blob: 0.5, talk: async (D) => { await D.say(helped('mumbleroots') ? '...i wasn\'t lost. i knew where i was. i was in the poetry section.' : '...papa wants you. he\'s the big one. he\'s been practising what to say, so you have to listen to all of it.'); } });
      else L.npc({ id: 'puffball', name: '...a very round mushroom', model: M.makeMushroomFolk(0xf3ead6, 0.55), x: -10.6, z: 3.6, face: 1.2, voice: { pitch: 2.3 }, color: '#a8553f', r: 0.3, blob: 0.5, label: 'Look at the round mushroom', talk: puffballTalk });
    }
    // after the Index: three shelves have walked off their footprints
    if (walking) walkingShelves(L, {});
    // before it: the books lie open on lecterns, waiting to be recognised by how they begin
    if (!done) {
      callSlips(L);
      [[-5.5, -10], [10, 8], [-10, 9]].forEach(([x, z]) => L.enemy('moth', x, z));
    }
    (done ? [[7, 11]] : [[3, 9], [-3, 8], [0, -9]]).forEach(([x, z]) => L.enemy('rootling', x, z));
    if (!done) L.enemy('moth', 2, -10);
    L.grass(1200, (p, r) => (r() > 0.5 ? 0x5a8a44 : 0x6a9a4a), (x, z) => !floor(x, z) || noise2(x * 0.25, z * 0.25) > 0.25, 0.55);
  },
};
const slipNo = () => flag('archive.slip') || 0;
const readSlip = (D) => D.narrate(`Call slip ${slipNo() + 1} of ${SLIPS.length}, in a wandering hand: “${SLIPS[slipNo()].text}”`);
const FOUND = [
  'Oh. Oh, that\'s it. The Book of Small Rains. I can see the window I read it at. There was a cat on the sill, and the cat was reading it as well, I think.',
  'Arabella\'s Atlas. She drew every road she never took and coloured them all in. I remember now. I helped with the blue.',
  'Soup for One. Yes. I\'d make it on Sundays and read the next recipe while it cooked, and the next one was always soup for one as well.',
];
function frogStatue(L, x, z, i) {
  const g = new THREE.Group();
  g.add(M.vmesh([M.paint(M.xf(M.blobGeo(0.2, i, 0.05, 8, 6), [0, 0.15, 0], [0, 0, 0], [1.1, 0.8, 1.2]), 0x6a9a4a)]));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(M.G.sph(0.035, 4, 3), M.lambert(0x201a18)); e.position.set(s * 0.08, 0.3, 0.14); g.add(e); }
  L.place(g, x, z, { y: L.heightAt(x, z) + 0.12, rot: FACE });
  L.updaters.push((dt, t) => { const s = 1 + Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.15; g.scale.set(1, s, 1); if (Math.sin(t * 3 + i * 1.7) > 0.995 && Math.hypot(L.player.x - x, L.player.z - z) < 6) audio.sfx('blip', { pitch: 0.35 + i * 0.05, wave: 'square' }); });
}
async function quillonTalk(D) {
  const done = flag('archive.done');
  if (!flag('archive.met')) {
    setFlag('archive.met');
    await D.say('Shh. No, sorry, you\'re allowed to talk, it\'s only habit. Welcome to the Archive, reader. Do mind the floor. It\'s mostly ceiling now.');
    await D.say('I\'m Quillon Ashby, the librarian. Or I was, when there were more of the, ah. The papery things. With the, the insides. Books. That\'s the word.');
    await D.say('I\'ve been forgetting them, you see. The titles go first. Then the books get up and fly off as moths, and I\'m left holding the cover.');
    await D.say('I can\'t remember what any of them are called. But I remember what they were like. I\'ve been writing that down on call slips, so I don\'t lose that as well.');
    await D.say('If you could find the books the slips mean, I could write out the Index again. They\'re lying open on the lecterns. You\'ll know them by how they begin.');
    const c = await D.choose(['What\'s in the Index?', 'Show me the first slip.']);
    if (c === 0) await D.say('Everything we kept, in order. It\'s a list of what people thought was worth saving, you see, and I find that the most comforting kind of list there is.');
    await readSlip(D);
    return;
  }
  if (!done) {
    const L = D.land, n = slipNo();
    if (!L.carrying) { await D.say(n === 0 ? 'Read how they begin, reader. That\'s all I\'ve kept of them, how they begin and how they made me feel.' : `${n} on the Index already. I keep reading them over. It's like finding your own handwriting in a coat pocket.`); await readSlip(D); return; }
    const id = L.carrying.id;
    if (id !== SLIPS[n].book) {
      await D.say(BOOKS[id].wrong);
      putBack(L); audio.sfx('close');
      await D.narrate('The book flutters out of your hands and back to its lectern, like a bird that knows the way.');
      await readSlip(D);
      return;
    }
    L.pObj.remove(L.carrying.held); L.carrying = null;
    audio.sfx('item');
    setFlag('archive.slip', n + 1);
    await D.say(FOUND[n]);
    if (n + 1 < SLIPS.length) { await D.say('There. That\'s one more on the Index. Here, I\'ve written the next.'); await readSlip(D); return; }
    await D.say('The Index. Oh. Oh, it\'s all coming back. Arabella\'s Atlas, the Book of Small Rains, a Treatise on Ladders... I\'d forgotten that I\'d forgotten the ladders.');
    setFlag('archive.done');
    await D.transform();
    await D.say('Look at my hands, reader. I can nearly see them. I think remembering things must be good for the complexion.');
    await D.say('There\'s an entry here under B. "Button, enormous." It was being used as a paperweight on the whole of section nine. I think you ought to have it.');
    D.give('button');
    addLetter('quillon1', 'Quillon Ashby', 'Overdue notice (affectionate)', 'Dear reader,\n\nThis is to let you know that you have borrowed nothing, and so owe nothing, which is the first time I have been able to write that to anybody in four hundred years.\n\nI have started reading aloud to the shelves in the evenings. They don\'t say anything, of course, but the moths have stopped leaving.\n\nWith regards, and with, ah, the other thing. Fondness.\n— Q. Ashby, Librarian', 2);
    return;
  }
  if (flag('archive.shelves') && !hasCharm('quill')) {
    await D.say('Back on their footprints. Listen to them creak. That\'s contentment, that is, in a shelf.');
    await D.say('Here. This is the quill I wrote the Index with. It\'s quick. It\'s quicker than me, at any rate. It gets to the end of a thought before I\'ve started it.');
    giveCharm(D.land.game, 'quill');
    return;
  }
  if (!hasCharm('quill') && !flag('archive.shelf.told')) { setFlag('archive.shelf.told'); await D.say('Three of the shelves walked off in the night. They do that, when nobody reads them. They go looking for someone who will.'); await D.say('Would you shove them back onto their footprints? You can see the marks in the dust. They\'re heavy, but they\'re willing. Mostly willing.'); return; }
  if (await teaInvite(D, 'quillon', 'Tea? With other people? I\'ve only got the one cardigan, and it\'s see-through. I\'ll come. I\'ll come anyway.')) return;
  await D.say(quietWords(D.land, 6, [
    'I\'ve started reading aloud to the shelves. They don\'t say anything, but the moths have stopped leaving.',
    kin('frog-chorus') ? 'The frogs are reading Arabella\'s Atlas. They\'ve been on page one for three days. I don\'t like to rush them.' : 'Somebody should write down the lands you\'ve been putting back, reader. I\'d do it, but I\'d only forget where I put the pen.',
    'I found a book under the desk called "Things That Were Here". It\'s very long. It isn\'t finished. I think it\'s meant not to be.',
  ]));
}
async function morelTalk(D) {
  if (!flag('morel.met')) {
    setFlag('morel.met');
    await D.say('Evening. Or whatever it is. Us lot have been camped by this wall since the old log went soft. It\'s a nice wall, but it isn\'t a home.');
    await D.say('And now our littlest has gone and hidden. Puffball. Hides when it\'s worried, which is always. If you see a cap that\'s a bit too round, that\'s Puffball.');
    return;
  }
  if (!flag('puffball.found')) { await D.say('No sign of the little one? Puffball can\'t have gone far. Its legs don\'t go far. Try somewhere nobody else would think to look.'); return; }
  if (!helped('mumbleroots')) {
    await D.say('There. All of us, under one tent. Now all we need is a proper patch of ground. Somewhere rooty, and old, and a bit damp, if you know a place.');
    await D.say('We\'re not fussy. Well. We are a bit fussy. Mushrooms are, it\'s in the spores. But if you find somewhere that suits, us lot will go.');
    D.settle('mumbleroots');
    return;
  }
  await D.say('Any luck finding us a patch? Somewhere with plenty of root in it. You\'ll see it on the map, I\'m told, if you look at how a place is.');
}
async function puffballTalk(D) {
  await D.as('Puffball', '...is it safe? are there moths? i\'m not hiding. i\'m being a mushroom.', { pitch: 2.3 }, '#a8553f');
  await D.as('Puffball', '...papa sent you? oh. i suppose i can stop being a mushroom for a bit, then.', { pitch: 2.3 }, '#a8553f');
  setFlag('puffball.found');
  audio.sfx('pickup');
  await D.transform();
}

// ---------------------------------------------------------------- TEACUP CROSSING
const teacup = {
  id: 'teacup', radius: 18, spawn: [5, 7], peaceful: true,
  lush: { region: (x, z) => Math.hypot(x, z) > 10.5, flowers: [0xf8c8d8, 0xffffff, 0xc8d8f8, 0xfff0a8, 0xe890b8] },
  cliff: 0xb89a8a, cliff2: 0x8a6a7a,
  height: (x, z) => { const pl = Math.hypot(x, z); return 0.4 + fbm(x * 0.07, z * 0.07, 3) * 0.9 * smooth(7, 12, pl); },
  color: (x, z, h) => {
    const pl = Math.hypot(x, z);
    if (pl < 9.5) {
      const cx = Math.floor(x / 0.9 + noise2(x, z) * 0.6), cz = Math.floor(z / 0.9 + noise2(z, x) * 0.6);
      const k = ((cx * 7 + cz * 13) % 5 + 5) % 5;
      return col([0xe8d0c0, 0xdcc0b0, 0xf0dcc8, 0xd8b8b0, 0xe8c8b8][k]);
    }
    return mixc(0x9ab868, 0xb8c878, noise2(x * 0.2, z * 0.2) + 0.5);
  },
  paved: (x, z) => smooth(9.9, 9.0, Math.hypot(x, z)),
  ambient: ['petals', 'butterflies', 'motes'],
  petalColor: 0xf8c8d8,
  keepClear: (x, z) => Math.hypot(x, z) < 3.2 || Math.hypot(x + 3, z - 4) < 3.2,
  settleSpots: [[11, -3], [-12, 1]],
  build(L) {
    const lit = L.night || L.phase === 'dusk';
    const houses = [
      [M.makeTeapotHouse({ body: 0x8fb7c9, lit }), -9, -6], [M.makeTeapotHouse({ body: 0xc98fa8, trim: 0xf6efe4, lit }), 7, -9],
      [M.makeTeapotHouse({ body: 0xb8c98f, lit }), -11, 5], [M.makeCupHouse({ body: 0xe9c9c0 }), -2, -12],
      [M.makeCupHouse({ body: 0xc9d8e8, trim: 0x6a8ab8 }), 12, 1], [M.makeCupHouse({ body: 0xf3e0a8, trim: 0xc8904a }), -12, -1],
    ];
    const chimneys = [];
    for (const [h, x, z] of houses) { L.place(h, x, z, { r: 2.2, rot: FACE + (L.rng() - 0.5) * 0.4 }); if (h.userData.chimney) chimneys.push(h); }
    L.updaters.push((dt) => {
      for (const h of chimneys) if (Math.random() < dt * 3) { const p = h.userData.chimney.clone().applyMatrix4(h.matrixWorld); L.dust.emit(p.x, p.y, p.z, { vy: 0.7, vx: 0.2, color: 0xf6f2ee, size: 0.6, life: 2.5, grav: -0.05 }); }
    });
    // tea fountain
    const ft = M.makeCupHouse({ body: 0xf3efe8, trim: 0x8fb7c9 });
    ft.scale.setScalar(0.65);
    L.place(ft, 0, 0, { r: 1.6, rot: FACE });
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), M.lambert(0x9a6a3a)); tea.rotation.x = -Math.PI / 2; tea.position.y = 1.5; ft.add(tea);
    L.updaters.push((dt) => { if (Math.random() < dt * 20) L.fx.emit((Math.random() - 0.5) * 0.6, L.heightAt(0, 0) + 1.7, (Math.random() - 0.5) * 0.6, { vx: (Math.random() - 0.5) * 2, vy: 3, vz: (Math.random() - 0.5) * 2, color: 0xc89a6a, size: 0.25, life: 0.7, grav: 7 }); if (Math.random() < dt * 4) L.dust.emit(0, L.heightAt(0, 0) + 2, 0, { vy: 0.6, color: 0xffffff, size: 0.9, life: 2, grav: -0.1 }); });
    L.interact({ x: 0, z: 0, r: 2.6, label: 'Look at the fountain', action: () => L.game.narrate('A fountain of tea, still hot after all this time. Someone has left a sign: PLEASE DO NOT ADD MILK TO THE FOUNTAIN. Under it: WE KNOW IT WAS YOU, GERALD.') });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; L.place(M.makeLamppost(lit, 0xffd8a8), Math.cos(a) * 8.5, Math.sin(a) * 8.5, { r: 0.2 }); }
    L.place(M.makeStall(0xd06a8a), 5, -5, { r: 1.2, rot: FACE });
    L.place(M.makeStall(0x6a9ad0), -6, -2, { r: 1.2, rot: FACE + 0.5 });
    L.place(M.makeSignpost(L.rng), 8, 6, { r: 0.2, rot: 0.6 });
    L.interact({ x: 8, z: 6, r: 1.5, label: 'Read the signpost', action: () => L.game.narrate('THE ROADS. North, south, east and west have all been crossed out, and someone has written HERE on every arm, which is true.') });
    L.scatter(14, (x, z, r) => L.place(M.makeTree(r, { kind: 'round', leaf: [0xd8a8c8, 0x9ab868, 0xe8c0d0][Math.floor(r() * 3)] }), x, z, { r: 0.7, sway: true }), { r: 1.5, region: (x, z) => Math.hypot(x, z) > 11 });
    L.scatter(50, (x, z, r) => L.place(M.makeFlower(r, [0xf8c8d8, 0xffffff, 0xc8d8f8, 0xfff0a8][Math.floor(r() * 4)], 0xffe08a), x, z), { r: 0.2, region: (x, z) => Math.hypot(x, z) > 10 });
    L.grass(1400, (p, r) => (r() > 0.5 ? 0xa8c070 : 0xb8c880), (x, z) => Math.hypot(x, z) > 10, 0.5);
    // the long table
    const party = !!flag('tea.party') || partyGuests().length >= 3;
    L.place(M.makeTable(), -3, 4, { r: 1.5, rot: 0 });
    L.npc({ id: 'sauce', name: 'Madame Saucerelle', model: M.makeTeapotLady(), x: 2.8, z: -3, face: FACE, voice: V.sauce, color: '#b05a7a',
      bubble: () => (!flag('tea.invite') || (party && !flag('tea.party')) || (teaLeg() >= ROUND.length && !hasCharm('spoon')) ? '!' : !L.tea && teaLeg() < ROUND.length ? '☕' : null), talk: sauceTalk });
    L.updaters.push((dt) => { const n = L.npcs.find((k) => k.id === 'sauce'); if (n && Math.random() < dt * 5) { const p = new THREE.Vector3(0.55, 1.25, 0).applyMatrix4(n.obj.matrixWorld); L.dust.emit(p.x, p.y, p.z, { vy: 0.6, color: 0xffffff, size: 0.35, life: 1.4, grav: -0.1 }); } });
    L.npc({ id: 'gus', name: 'Gus Postwick', model: M.makeMailboxMan(), x: -4, z: -5, face: FACE, voice: V.gus, color: '#4f78a8', wander: 1.2, speed: 1.2, bubble: () => (!flag('gus.met') ? '!' : null), talk: gusTalk });
    if (party) {
      const seats = partyGuests();
      const models = { marrow: () => M.makePerson({ skin: 0xe8c0a0, cloth: 0xd8b040, hair: 0xd8d4cc, bun: true, height: 0.9 }), thimble: () => M.makeScarecrow(), quillon: () => M.makeGhost(1), brine: () => M.makeToad() };
      const names = { marrow: 'Marrow Quell', thimble: 'Sir Thimble Haybright', quillon: 'Quillon Ashby', brine: 'Auntie Brine' };
      const lines = {
        marrow: 'I\'ve had one scone. Two. It\'s a party, so. I\'m allowed. Don\'t tell the light, it\'ll think I\'ve gone soft.',
        thimble: 'I\'ve composed a toast! "To the teapot." It\'s short. My critics wanted it shorter, but I couldn\'t lose either word.',
        quillon: 'I\'d forgotten what other people sound like when they\'re all talking at once. It\'s like a library with the books open.',
        brine: 'Have some marsh cake, duckling. No, don\'t look at it, just eat it. That\'s the trick with marsh cake.',
      };
      seats.forEach((g, i) => {
        const a = (i / seats.length) * Math.PI * 2 + 0.5;
        const x = -3 + Math.cos(a) * 2.3, z = 4 + Math.sin(a) * 2.3;
        L.npc({ id: 'guest-' + g, name: names[g], model: models[g](), x, z, face: Math.atan2(-3 - x, 4 - z), voice: V[g], color: '#8a6a5a', r: 0.5, talk: async (D) => { await D.say(lines[g]); } });
      });
      L.updaters.push((dt) => { if (Math.random() < dt * 3) L.fx.emit(-3 + (Math.random() - 0.5) * 2, L.heightAt(-3, 4) + 1.4, 4 + (Math.random() - 0.5) * 2, { vy: 1, color: [0xffd27a, 0xf8c8d8, 0xc8e8ff][Math.floor(Math.random() * 3)], size: 0.3, life: 1.5, grav: 0, kind: 3 }); });
    }
    sugarCube(L);
    teaRound(L);
  },
};
// Madame Saucerelle's round: carry a cup to each door before it goes cold. Don't run, you'll spill it.
const ROUND = [
  { x: -9, z: -6, door: [-6.9, -3.9], who: 'the blue teapot house', reply: 'A very old voice from inside: "Is it hot? Oh, it\'s hot. Tell Saucerelle she\'s forgiven for the thing with the scones." You decide not to ask.' },
  { x: 12, z: 1, door: [13.7, 3.3], who: 'the blue cup house', reply: 'Two identical faces at the window. They take the cup together and argue about who gets the first sip. They give you a small coin of light each, to make up for it.' },
  { x: -2, z: -12, door: [0, -10], who: 'the sorting office', reply: null },
];
const teaLeg = () => flag('tearound.leg') || 0;
function teaRound(L) {
  const g = L.game;
  ROUND.forEach((h, i) => {
    L.interact({ x: h.door[0], z: h.door[1], r: 1.8, label: 'Deliver the tea', enabled: () => !!L.tea && L.tea.leg === i, action: () => deliverTea(L, i) });
  });
  L.updaters.push((dt) => {
    const t = L.tea;
    if (!t) return;
    if (!ui.busy && !g.transitioning) t.time -= dt;
    const p = L.player;
    if (Math.random() < dt * 5) { const hp = new THREE.Vector3(); t.cup.getWorldPosition(hp); L.dust.emit(hp.x, hp.y + 0.3, hp.z, { vy: 0.6, color: 0xffffff, size: 0.3, life: 1, grav: -0.1 }); }
    ui.timer(`☕ ${ROUND[t.leg].who} · <b>${Math.max(0, Math.ceil(t.time))}</b>`);
    const spilled = p.dash > 0;
    if (t.time <= 0 || spilled) {
      L.pObj.remove(t.cup); L.tea = null; ui.timer(null);
      audio.sfx(spilled ? 'splash' : 'blip', { pitch: 0.6 });
      ui.toast(spilled ? 'You dashed, and the tea went everywhere. Madame Saucerelle will pour another.' : 'The tea has gone cold. Madame Saucerelle will pour another.', 4000);
    }
  });
}
function startTea(L) {
  const cup = M.makeTeaCup(); cup.position.set(0.35, 0.95, 0.35); L.pObj.add(cup);
  L.tea = { leg: teaLeg(), time: 16, cup };
  L.game.tip('tea', 'Walk it over, don\'t dash: you\'ll spill it.', 4000);
}
async function deliverTea(L, i) {
  const t = L.tea; if (!t) return;
  L.pObj.remove(t.cup); L.tea = null; ui.timer(null);
  setFlag('tearound.leg', i + 1);
  audio.sfx('pickup');
  const D = L.game.dialogCtx({ name: '', voice: { pitch: 1.6 } });
  L.game.talking = true;
  if (ROUND[i].reply) { await D.narrate(ROUND[i].reply); L.lumenMote(L.player.x, L.player.z, 6); }
  else {
    await D.as('Gus Postwick', 'Tea! At the office! Righto. Nobody\'s ever brought tea to the office, sort of thing, it\'s usually the other way round.', V.gus, '#4f78a8');
    await D.as('Gus Postwick', 'While you\'re here. This has been in the dead-letter sack for ever so long. Addressed to "SMUDGE, THE DESK". I never could find the desk. You go more places than I do.', V.gus, '#4f78a8');
    ui.closeDialog();
    await givePage(L.game, 'p7');
  }
  ui.closeDialog();
  L.game.talking = false;
  L.game.interactCooldown = 0.4;
  if (i + 1 < ROUND.length) ui.toast('Back to Madame Saucerelle for the next cup.', 3500);
  else ui.toast('That\'s the whole round. Madame Saucerelle will want to hear.', 3500);
}
const partyGuests = () => ['marrow', 'thimble', 'quillon', 'brine'].filter((g) => flag('tea.guest.' + g));
function sugarCube(L) {
  const g = new THREE.Group();
  g.add(M.vmesh([M.paint(M.G.box(0.35, 0.35, 0.35), 0xfdfaf4, { jitter: 0.04 })]));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(M.G.sph(0.03, 4, 3), M.lambert(0x201a18)); e.position.set(s * 0.07, 0.05, 0.18); g.add(e); }
  const c = { x: -6, z: 7, caught: 0, vx: 0, vz: 0, t: 0 };
  L.place(g, c.x, c.z, { sink: -0.17 });
  L.updaters.push((dt, t) => {
    const p = L.player, d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < 4.5) { const a = Math.atan2(c.z - p.z, c.x - p.x) + Math.sin(t * 3) * 0.6; c.vx = Math.cos(a) * 4.3; c.vz = Math.sin(a) * 4.3; }
    else { c.vx *= 0.9; c.vz *= 0.9; }
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    if (L.walkable(nx, nz, 0.3)) { c.x = nx; c.z = nz; } else { c.vx = -c.vx; c.vz = -c.vz; c.x += c.vz * dt * 3; }
    const moving = Math.hypot(c.vx, c.vz) > 0.5;
    g.position.set(c.x, L.heightAt(c.x, c.z) + 0.17 + (moving ? Math.abs(Math.sin(t * 16)) * 0.15 : 0), c.z);
    if (moving) g.rotation.y = Math.atan2(c.vx, c.vz);
    if (d < 0.8 && c.caught < 3) {
      c.caught++;
      audio.sfx('blip', { pitch: 3, wave: 'sine' }); audio.sfx('pickup');
      ui.toast(['The sugar cube squeaks and gives you a small, sweet coin of light.', 'Caught again! It seems to enjoy this, honestly.', 'The sugar cube flops over, exhausted and pleased. That\'s enough for one day.'][c.caught - 1]);
      L.lumenMote(c.x, c.z, 4);
      const a = Math.random() * 6.28; c.x = Math.cos(a) * 7; c.z = Math.sin(a) * 7;
    }
  });
}
async function sauceTalk(D) {
  if (!flag('tea.invite')) {
    setFlag('tea.invite');
    await D.say('A guest! A real guest with legs! Darling, sit, sit, no, not there, that\'s the sugar bowl, everyone makes that mistake, the sugar never forgives them.');
    await D.say('I\'m Madame Saucerelle and this is Teacup Crossing, where all the roads used to meet for tea. Now the roads don\'t come, and I\'ve been pouring for nobody.');
    await D.say('Do you know how long tea stays hot when nobody drinks it? Forever, darling. I\'ve checked. It\'s very sad and also a little bit impressive.');
    await D.say('Bring me guests! Anyone you\'ve been kind to, I\'m not fussy. Well. I\'m enormously fussy, but about cups, darling, never about people.');
    ui.toast('✉ Invite people you\'ve helped to tea. Three guests makes a party.', 6000);
    return;
  }
  const g = partyGuests().length;
  if (g >= 3 && !flag('tea.party')) {
    setFlag('tea.party');
    await D.say(partyGuests().includes('marrow')
      ? 'Darling, look! People! At my table! Marrow\'s had four scones and is pretending she\'s had one, and nobody has the heart to count!'
      : 'Darling, look! People! At my table! Somebody sat on the sugar bowl and the sugar forgave them, that\'s how good a party this is!');
    await D.say('I\'ve been pouring for nobody for so long, darling, I\'d forgotten that tea is mostly an excuse. It was never really about the tea. Don\'t tell the tea.');
    await D.say('Here. A present from the whole table. It\'s a heart, darling, a spare one, everyone ought to carry a spare. Mine\'s in the sugar bowl.');
    D.heart();
    return;
  }
  // the round
  const leg = teaLeg();
  if (leg >= ROUND.length && !hasCharm('spoon')) {
    await D.say('Every door, darling! Hot! Do you know how long it\'s been since anyone in this town had a cup of tea that somebody else made them? Neither do I. Too long, I expect.');
    await D.say('Take this. It\'s my best spoon. It\'s been in every cup in Teacup Crossing at least once. It\'s very sweet. It can\'t help it.');
    giveCharm(D.land.game, 'spoon');
    return;
  }
  if (leg < ROUND.length && !D.land.tea) {
    if (!flag('tearound.asked')) {
      setFlag('tearound.asked');
      await D.say('Darling, while you\'re standing about looking useful. Would you take a cup round? Nobody comes to the fountain any more, so the tea has to go to them.');
    }
    const c = await D.choose([`Take a cup to ${ROUND[leg].who}`, 'Not just now']);
    if (c === 0) { await D.say(leg === 0 ? 'Quickly, darling, but no running. Tea is like gossip. It goes cold if you rush it and it spills if you run.' : 'Same again! Don\'t dawdle. Don\'t dash. There\'s a whole art to the bit in between.'); startTea(D.land); return; }
  }
  if (flag('tea.party')) { await D.say(quietWords(D.land, 7, ['Same time next week? I\'ll keep the pot on. I always keep the pot on, darling, that\'s the whole of my philosophy.', 'Gus delivered a letter to the fountain this morning. It was addressed "to whoever is hot and wet". It was from the rain, I think.', 'I\'ve started a guest book! You\'re on every page. There haven\'t been many pages.'])); return; }
  await D.say(g === 0 ? 'No guests yet? Go on, darling, ask! People love to be asked. They pretend they don\'t, and then they put on their good coats.' : `${g} ${g === 1 ? 'guest' : 'guests'} coming! I've polished every cup twice. One of the cups asked me to stop. Bring me a third and we'll have a proper party.`);
}
async function gusTalk(D) {
  if (!flag('gus.met')) {
    setFlag('gus.met');
    await D.say('Oh! Hello! Gus Postwick, post, sort of thing. You wouldn\'t happen to know where Number Four Willow Lane went? I\'ve had a parcel for it for ninety years.');
    await D.say('Nobody has addresses any more. Places keep turning up wherever someone puts them, which is lovely, of course, but it\'s murder on a route.');
    await D.say('Righto, wait, it\'s you, isn\'t it? Who\'s been putting places down? I\'ve been delivering to "the one with the satchel" and it\'s been arriving, which is a relief.');
    await D.say('Here, actually, you take the parcel. You go more places than I do. If you ever find Number Four, sort of thing, you\'ll know what to do.');
    setFlag('gus.parcel');
    audio.sfx('item');
    ui.toast('📦 You carry a small, very old parcel for <b>Number Four, Willow Lane</b>.', 5000);
    return;
  }
  await D.say(quietWords(D.land, 8, [
    'Righto, the round today: one letter for a fountain, one for a sugar cube, three for you. It\'s mostly you, these days, if I\'m honest.',
    'I used to have a bicycle. I don\'t know what happened to it. I think it went where the roads went, sort of thing.',
    'Every letter I\'ve delivered this week has said "thank you" in it somewhere. That\'s unusual, for post. Usually it\'s bills.',
  ]));
}

// ---------------------------------------------------------------- UMMOTH'S REST
const stones = [[7, -3, 196], [-11, 4, 247], [3, 7, 294]];
const giant = {
  id: 'giant', radius: 22, spawn: [7, 8],
  cliff: 0x8a8070, cliff2: 0x5a5a6a,
  height: (x, z) => 0.8 + fbm(x * 0.05, z * 0.05, 4) * 2.4 + 1.5 * Math.exp(-((x + 5) ** 2 + (z + 7) ** 2) / 60),
  color: (x, z, h) => mixc(mixc(0x7f9a5a, 0x9aaa62, noise2(x * 0.15, z * 0.15) + 0.5), 0xb8b070, smooth(2.5, 4, h)),
  keepClear: (x, z) => Math.hypot(x + 5, z + 7) < 8.5 || stones.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 2.5) || Math.hypot(x - 8, z + 11) < 3,
  erasure: {
    x: 8, z: -11, r: 0.8, page: 'p6', name: 'The cairn', label: 'Look at the cairn',
    ready: () => !!flag('giant.sung'),
    model: (L) => M.makeCairn(L.rng),
    line: 'A cairn of stones, one for each person who ever rode across a river on Ummoth\'s shoulders. There is a fresh one on top. It might have been you. It might be for you.',
  },
  ambient: ['leaves', 'butterflies', 'motes'],
  settleSpots: [[12, -6], [-12, 10]],
  build(L) {
    const sung = !!flag('giant.sung');
    const head = M.makeGiantHead();
    if (kin('giants-garden')) for (let i = 0; i < 16; i++) { const a = -1.2 + (i / 15) * 2.4; const g = M.glow(0xffc860, 1.2, 0.8); g.position.set(Math.sin(a) * 5.6, -0.6 + Math.cos(i * 1.7) * 0.4, Math.cos(a) * 6); head.add(g); }
    L.headModel = head;
    const hy = L.heightAt(-5, -7) - 0.6;
    const um = L.npc({ id: 'ummoth', name: 'Ummoth', model: head, x: -5, z: -7, face: FACE, voice: V.ummoth, color: '#5a7a4a', r: 6.3, talkR: 8.8, noBlob: true, noHeadBob: true, bubbleY: 6.5, y: 0.4,
      bubble: () => (!flag('giant.met') || (sung && !state.keepsakes.includes('pencil') && !flag('giant.gave')) || (countFlags('giant.lamb', 3) === 3 && !hasCharm('knot')) ? '!' : null), talk: ummothTalk,
      anim: (n, dt, L2) => { const br = 1 + Math.sin(L2.t * 0.6) * 0.015; head.scale.set(1, br, 1); n.face = FACE; } });
    L.ummoth = um;
    if (sung) head.userData.mouth.rotation.z = 0;
    // the moss-lambs that live in his beard have wandered off
    if (sung && !hasCharm('knot')) {
      const pen = { x: -5 + Math.sin(FACE) * 7.6, z: -7 + Math.cos(FACE) * 7.6, r: 2 };
      const hx = -5 + Math.sin(FACE) * 5.5, hz = -7 + Math.cos(FACE) * 5.5;
      mossLambs(L, { spots: [[10, 3], [-13, 6], [5, -15]], pen, home: { x: hx, y: L.heightAt(pen.x, pen.z) + 1.2, z: hz }, onHome: (n) => {
        L.game.cam.shake = 0.3;
        ui.toast(n < 3 ? `The moss-lamb burrows into the beard and goes still, the way a cat does on a warm lap. <b>${n}/3</b>` : 'The last moss-lamb tucks itself in. Ummoth\'s whole beard settles, like a field after wind.', 4500);
      } });
      L.game.tip('lambs', 'Moss-lambs run from you. Walk round behind one and it will run the other way.', 6000);
    }
    // the singing stones
    L.hum = 0;
    L.stones = stones.map(([x, z, f], i) => {
      const lit = sung;
      const s = M.makeStandingStone(L.rng, lit);
      L.place(s, x, z, { r: 0.8, rot: FACE });
      const st = { i, x, z, f, obj: s, lit };
      L.hittable({ x, z, r: 0.8, onHit: () => ringStone(L, st) });
      if (!sung) L.enemy('beetle', x + 1.6, z + 1.2);
      return st;
    });
    // forest grown on a sleeper
    L.scatter(34, (x, z, r) => L.place(M.makeTree(r, { kind: r() > 0.45 ? 'pine' : 'round', leaf: r() > 0.5 ? 0x5a8a4a : 0x6a9a50 }), x, z, { r: 0.8, sway: true }), { r: 1.7 });
    L.scatter(10, (x, z, r) => L.place(M.makeRock(r, 0x9a9488, 0.8 + r()), x, z, { r: 0.7 }), { r: 1 });
    L.grass(2600, (p, r) => (r() > 0.5 ? 0x8aa85a : 0x9ab860));
    if (sung) L.scatter(120, (x, z, r) => L.place(M.makeFlower(r, [0xf2b6c8, 0xfff0a8, 0xc8b8f0, 0xffffff, 0xf8a070][Math.floor(r() * 5)], 0xffe08a, 1.3), x, z), { r: 0.2 });
    // Bellamy, if he hasn't found his quiet place yet
    if (!state.settlers.bellamy) L.npc({ id: 'bellamy', name: 'Bellamy Tock', model: M.makeTortoise(), x: 3, z: 10, face: FACE, voice: V.tock, color: '#8a7a4a', wander: 0.4, speed: 0.25, bubble: () => (!flag('bellamy.met') ? '!' : null), talk: bellamyTalk,
      anim: (n) => { n.obj.userData.parts.key.rotation.y += 0.02 * (flag('bellamy.wound') ? 3 : 0.3); } });
    if (kin('old-stories')) { L.place(M.makeBook(L.rng), -0.5, -1.5); L.interact({ x: -0.5, z: -1.5, r: 1.4, label: 'Pick up the book', action: () => L.game.narrate('A book from the Archive, left open at the bit about the river. Somebody has been reading it to him. The page is damp, as though it were read in the rain, or cried on.') }); }
    (sung ? [[-12, -6]] : [[-12, -6], [9, -10]]).forEach(([x, z]) => L.enemy('mistling', x, z));
  },
};
// light or darken a stone's rune
function runeLit(st, on) {
  const rune = st.obj.userData.rune;
  rune.material = on ? M.basic(0x9ff2e0) : M.lambert(0x6e6a64);
  if (on && !st.glow) { st.glow = M.glow(0x8ff0d8, 2.2, 0.6); st.glow.position.copy(rune.position); st.obj.add(st.glow); }
  if (!on && st.glow) { st.obj.remove(st.glow); st.glow = null; }
}
async function ringStone(L, st) {
  audio.sfx('stone', { freq: st.f });
  L.fx.burst(st.x, L.heightAt(st.x, st.z) + 1.7, st.z, 18, { color: [0x9ff2e0, 0xffffff], size: 0.4, speed: 2.5, life: 1, grav: -0.5 });
  L.game.cam.shake = 0.3;
  if (st.lit || flag('giant.sung') || L.cutscene) return;
  // the song only works played in order
  if (st.f !== PHRASE[L.hum]) {
    L.game.wait(0.12).then(() => audio.sfx('stone', { freq: st.f * 1.06 }));
    ui.toast(L.hum ? `The note sits wrong against the last one, and the stones go quiet. Ummoth frowns in his sleep. <b class="bars">${phraseBars(0)}</b>` : `That isn't how the song starts. Ummoth will hum it for you if you ask. <b class="bars">${phraseBars(0)}</b>`, 4000);
    L.hum = 0;
    L.stones.forEach((s) => runeLit(s, false));
    return;
  }
  L.hum++;
  runeLit(st, true);
  if (L.hum < PHRASE.length) { ui.toast(`<b class="bars">${phraseBars(L.hum)}</b>`, 2500); return; }
  // the lullaby
  L.stones.forEach((s) => runeLit(s, true));
  L.cutscene = true;
  audio.duck(0.15);
  const seq = [196, 247, 294, 247, 196, 247, 294, 392, 294, 247, 196];
  for (let i = 0; i < seq.length; i++) {
    await L.game.wait(0.42);
    audio.sfx('stone', { freq: seq[i] });
    const s = L.stones[i % 3];
    L.fx.burst(s.x, L.heightAt(s.x, s.z) + 2, s.z, 10, { color: 0x9ff2e0, size: 0.4, speed: 2, life: 1.2, grav: -1 });
  }
  setFlag('giant.sung');
  audio.duck(1);
  await L.game.transformLand();
  L.cutscene = false;
  L.game.talk(L.game.land.ummoth);
}
async function ummothTalk(D) {
  if (!flag('giant.met')) {
    setFlag('giant.met');
    await D.say('Hmmmm. A small one. Walking on my cheek. It tickles. I don\'t mind.');
    await D.say('I am Ummoth. I carried people, once. Over rivers. Up the hills. They sat on my shoulders, and they sang.');
    await D.say('Now I sleep. A forest grew on me while I slept. It is a good forest. I am careful of it. I try not to roll over.');
    await D.say('The singing stones have gone quiet. There are three. Beetles sit on them now. Without the song, I dream badly, small one.');
    await D.say('Strike them with your stick. But in the order of the song. Out of order it is only noise, and I have enough noise. Listen. It starts like this.');
    await hum(D.land, D.land.headModel);
    await D.say('Low, and up, and down again. Like walking over a hill. Each stone knows one note. You will have to listen for which.');
    return;
  }
  if (!flag('giant.sung')) {
    await D.say('Hmm. You want the start of it again. Listen.');
    await hum(D.land, D.land.headModel);
    await D.say('The beetles will not like it. Beetles do not like anything. It is how they are made.');
    return;
  }
  if (!flag('giant.gave')) {
    setFlag('giant.gave');
    await D.say('Ahhh. That is the song. They used to hum it, walking. Out of step. All of them out of step, and it did not matter.');
    await D.say('Small one. I found something in my beard. Long ago. It is small and sharp and it draws lines. I think it wants to be used.');
    D.give('pencil');
    return;
  }
  if (countFlags('giant.lamb', 3) === 3 && !hasCharm('knot')) {
    D.land.game.cam.shake = 1.2; audio.sfx('stone', { freq: 98 });
    await D.say('Hrrrmmm-hm-hm. That is laughing. I have not done it in a long while. They are all home. They are warm, and they are chewing. It tickles. I do not mind.');
    await D.say('Take this. It was the knot at the end of my beard. It held so tight, so long, it became a thing. It knows how to hold on, and how to let go hard.');
    giveCharm(D.land.game, 'knot');
    return;
  }
  if (!hasCharm('knot') && !flag('giant.lamb.told')) { setFlag('giant.lamb.told'); await D.say('Small one. The moss-lambs have wandered out of my beard. Three. They live there. While I dreamed badly they ran off, and now they are afraid of everything.'); await D.say('Even you. Especially you. They will run from you. So do not chase. Walk behind, and they will go the other way, and the other way can be home. Under my chin.'); return; }
  await D.say(quietWords(D.land, 9, [
    'Sleep is good now. If I snore, step lightly. The forest gets seasick.',
    'I dreamed of a river. You were standing in it. You were very small and the river was very big, and you were not afraid.',
    kin('old-stories') ? 'Someone reads to me now. The bit about the river. Twice. I like it twice.' : 'The flowers came up when you rang the stones. I can feel them. It is like being smiled at, all over.',
  ]));
}
async function bellamyTalk(D) {
  if (!flag('bellamy.met')) {
    setFlag('bellamy.met');
    await D.say('Good... afternoon. Or. Possibly. Morning. I have been. Winding down. For about. A decade.');
    let turns = 0;
    while (turns < 3) {
      const c = await D.choose([turns === 0 ? 'Wind the key on his back' : 'Keep winding', 'Leave him be']);
      if (c === 1) { await D.say('Ah. Well. Another. Decade. Then.'); setFlag('bellamy.met', false); return; }
      turns++;
      audio.sfx('blip', { pitch: 0.8 + turns * 0.3, wave: 'square' }); audio.sfx('blip', { pitch: 1 + turns * 0.3, wave: 'square' });
      if (turns === 1) await D.say('Oh. Oh, that is. Rather nice. Do go on.');
      if (turns === 2) await D.say('Ah, yes, there it is, I can feel the gears again, it\'s like stretching after a long nap, except the nap was the reign of three kings.');
    }
    setFlag('bellamy.wound');
    await D.say('Ahh. That\'s better. Bellamy Tock, at your service. I have been walking for three hundred and twelve years, give or take a nap.');
    await D.say('I was looking for the place Ummoth used to set me down after a crossing. A quiet bank, under the moon. It isn\'t here. Nothing\'s where it was, is it.');
    await D.say('If you have a quiet place, with a good moon over it, I\'d stop there. I\'d like to stop. I\'ve never once tried stopping on purpose.');
    D.settle('bellamy');
    return;
  }
  await D.say('Somewhere quiet. With a good moon. You\'ll know it. I\'ll be. Here. I\'m very good at being here. It\'s my best thing.');
}

// ---------------------------------------------------------------- THE LAST MARGIN
const margin = {
  id: 'margin', radius: 16, spawn: [4, 6], peaceful: true, paper: true,
  cliff: 0xe8e2d4, cliff2: 0xc8c0b0,
  height: (x, z) => 0.5 + fbm(x * 0.07, z * 0.07, 3) * 1.2,
  color: (x, z, h) => {
    const n = noise2(x * 0.18, z * 0.18);
    if (n > 0.3) return mixc(0xd88ab8, 0xf0c060, noise2(x, z) + 0.5);
    if (n < -0.35) return col(0x6ab8c8);
    return mixc(0x7ab858, 0xa8c860, noise2(x * 0.4, z * 0.4) + 0.5);
  },
  keepClear: (x, z) => Math.hypot(x, z + 4) < 4 || Math.hypot(x, z - 4.5) < 10.5,
  ambient: ['ash', 'motes'],
  mist: () => [0xf6f2e8, 0xe0d8c8],
  tint: { all: 0xf3efe4, amount: 0.7 },
  build(L) {
    // the drawing table, with your map on it
    const tbl = new THREE.Group();
    tbl.add(M.vmesh([M.paint(M.xf(M.G.box(5, 0.2, 3.4), [0, 1.0, 0]), 0x8a6a4a), ...[[-2.3, -1.5], [2.3, -1.5], [-2.3, 1.5], [2.3, 1.5]].map(([x, z]) => M.paint(M.xf(M.G.box(0.2, 1, 0.2), [x, 0.5, z]), 0x6a4a36)), M.paint(M.xf(M.G.box(4.6, 0.04, 3), [0, 1.12, 0]), 0xf3ead6)]));
    for (const [id, p] of Object.entries(state.placed)) {
      const hx = 0.22 * Math.sqrt(3) * (p.q + p.r / 2), hz = 0.22 * 1.5 * p.r;
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6), M.basic(LAND_INFO[id].tile));
      hex.position.set(hx, 1.16, hz);
      tbl.add(hex);
    }
    L.place(tbl, 0, -5, { r: 2.6, rot: FACE });
    L.interact({ x: 0, z: -5, r: 3.2, label: 'Look at the drawing table', action: () => L.game.narrate('Your map, drawn small, in a hand that isn\'t yours. Every land you\'ve unfolded is on it, in the right place, coloured in.') });
    L.npc({ id: 'ines', name: 'Ines Vellum', model: M.makePaperWoman(), x: 3.8, z: -4.2, face: FACE, voice: V.ines, color: '#8a8070', bubble: () => (!flag('smudge.down') && !L.boss ? '!' : null), talk: inesTalk });
    L.scatter(20, (x, z, r) => L.place(M.makeTree(r, { kind: r() > 0.5 ? 'round' : 'birch', leaf: [0x7ab858, 0xd88ab8, 0xf0c060][Math.floor(r() * 3)] }), x, z, { r: 0.7, sway: true }), { r: 1.6 });
    L.scatter(50, (x, z, r) => L.place(M.makeFlower(r, [0xf2b6c8, 0xfff0a8, 0xc8b8f0, 0x8fd8ff][Math.floor(r() * 4)], 0xffe08a, 1.3), x, z), { r: 0.2 });
    L.scatter(8, (x, z, r) => L.place(M.makeRock(r, 0xb8b0a0, 0.8 + r()), x, z, { r: 0.7 }), { r: 1 });
  },
  onEnter(L) { if (!flag('ending')) L.game.wait(2.5).then(() => ui.toast('The colour follows you. Walk a little.', 4000)); },
};
const ARENA = { x: 0, z: 4.5, r: 9.5 };
async function inesTalk(D) {
  if (flag('ending') && !flag('smudge.down')) {
    // a map finished before the Smudge came: it still gets to come
    if (!flag('margin.met')) {
      setFlag('margin.met');
      await D.say('I didn\'t tell you everything, the first time. I couldn\'t see you properly, and I didn\'t want to frighten you.');
      await D.say('The grey isn\'t the world wearing out. It\'s Smudge, my eraser. I told it to rub out my mistakes, and then I stopped drawing, and it couldn\'t tell any more what was a mistake. It always comes back to the margin.');
      await smudgeArrives(D, false);
      return;
    }
  } else if (flag('ending')) {
    await D.say(quietWords(D.land, 10, [
      'I\'m still here. It turns out it takes a long while for paper to finish. I\'m glad. I\'d like to see what you put down next.',
      'Somebody walked through the margin this morning and coloured in a whole hedge without noticing. That was you, I expect. It usually is.',
      `${state.mapName}. I like reading it at the top of the page. I go and look at it, sometimes, the way you check a kettle.`,
    ]));
    return;
  }
  if (flag('margin.met')) {
    await D.say('It\'ll be back. It always comes back to the margin. It thinks the margin is where the mistakes go, and in a way it\'s right, that\'s where I put the things I hadn\'t finished.');
    const c = await D.choose(['I\'m ready.', 'Not yet.']);
    if (c === 1) { await D.say('No hurry. Paper\'s patient. It\'s the one thing it\'s good at.'); return; }
    await smudgeArrives(D, true);
    return;
  }
  setFlag('margin.met');
  await D.say('There you are. I wondered who\'d been drawing on my map. You\'ve a heavier hand than I had, but you don\'t lift the pencil, and I like that.');
  await D.say('I\'m Ines. I drew the world, the first time. Every coast and every lane. Then my eyes went, and I put the pencil down, and the lines began to go.');
  await D.say('The grey isn\'t the world wearing out, you know. It\'s Smudge. My eraser. I told it to rub out my mistakes, and then I stopped drawing, and it couldn\'t tell any more what was a mistake. So it started on everything.');
  await D.say('It isn\'t wicked. It\'s tidy. That\'s worse, in a way. Tidiness never knows when to stop.');
  if (flag('gus.parcel')) {
    await D.say('Is that... that\'s my handwriting. Number Four, Willow Lane. Oh, that was my house. I sent my reading glasses off to be mended and the street went before they came back.');
    audio.sfx('pickup');
    await D.say('Look. They\'re still in the box, with a note from the mender. "Good as new." Ninety years. I\'ll put them on. Oh, now I can see you properly. Hello.');
    await D.say('...Oh. Oh, I know you. I drew you. In the corner, on the last good morning. I never gave you a face. You\'ve found one.');
  } else if (state.pages.length >= 6) {
    await D.say('You\'ve been reading my sketchbook. I can tell. You\'ve the look people get when they\'ve found out what they\'re for.');
  } else {
    await D.say('You\'ve a look about you I almost know. My eyes, you see. Everybody\'s a little bit somebody.');
  }
  await smudgeArrives(D, false);
}
async function smudgeArrives(D, again) {
  const L = D.land, g = L.game;
  L.cutscene = true;
  audio.sfx('grey'); audio.duck(0.3);
  g.cam.shake = 1;
  const p = L.player;
  const sx = p.x, sz = p.z;
  await g.tween(0.6, (k) => { p.x = lerp(sx, 0, k); p.z = lerp(sz, 1, k); p.face = Math.PI; });
  await D.narrate(again ? 'The edge of the paper lifts again.' : 'The edge of the paper lifts, the way a page does when someone who isn\'t there is about to turn it.');
  const boss = new SmudgeBoss(L, 0, 9.5, (b) => smudgeDown(L, b));
  L.enemies.push(boss); L.boss = boss;
  await g.wait(1.6);
  const S = (t) => D.as('Smudge', t, V.smudge, '#8a7a8a');
  if (!again) {
    await S('you came. you keep coming. i rub and i rub and you put it all back again.');
    await S('she said fix the mistakes. so i am fixing the mistakes. the last one is the one with the satchel.');
    await D.as('Ines Vellum', state.pages.includes('p7') ? 'Smudge, love, no. Nothing\'s a mistake. I wrote you a note. It never got to you. It\'s in their satchel, look.' : 'Smudge, love, no. Nothing\'s a mistake. I wrote you a note. Didn\'t you get my note?', V.ines, '#8a8070');
    await S(state.pages.includes('p7') ? 'i can\'t read. i\'m an eraser. i only know how to take the words off.' : 'what note.');
  } else await S('still here. still a mistake. sorry. hold still.');
  ui.closeDialog();
  audio.duck(1); audio.setTheme('smudge');
  L.arena = ARENA;
  L.cutscene = false;
  g.tip('smudge', 'It\'s soft but heavy. Watch for the grey lane before it charges, dodge out of it, then hit it while it\'s dazed.', 7000);
}
async function smudgeDown(L, boss) {
  const g = L.game;
  L.cutscene = true; L.arena = null; L.boss = null;
  for (const e of [...L.enemies]) L.killEnemy(e);
  for (const s of L.shots) s.dead = true;
  audio.setTheme('margin'); audio.sfx('restore');
  g.renderer.post.uniforms.flash.value = 0.6;
  await g.tween(1.8, (k) => boss.obj.scale.setScalar(1.6 * (1 - k * 0.8)));
  setFlag('smudge.down');
  const D = g.dialogCtx({ name: 'Smudge', voice: V.smudge, color: '#8a7a8a' });
  const I = (t) => D.as('Ines Vellum', t, V.ines, '#8a8070');
  await D.say('oh. i\'m smaller. that\'s all right. erasers get smaller. it\'s how you can tell they\'ve been used.');
  await D.say('she stopped drawing and i didn\'t know what my days were for. so i did the only thing i know how to do. i\'m sorry about the lighthouse. and the orchard. and all of it, really.');
  await I('Oh, Smudge. You were only ever meant to help. That\'s my fault, not yours. I never told you what to do when there wasn\'t anything to fix.');
  const c = await D.choose(['Come home with me, Smudge.', 'There\'s still mist out there that could use rubbing out.']);
  if (c === 0) await D.say('home. i\'ve never had one. i lived in a pencil case. it was mostly pencils.');
  else await D.say('the mist? oh. i could rub that out. nobody would mind. i\'d be rubbing out the nothing, and leaving room for things.');
  await D.say('i\'ll start at the lantern\'s house. pell, is it? i\'ll be ever so quiet. i\'ll only tidy the bits that ask.');
  setFlag('smudge.home');
  const named = flag('ending');
  await I('There\'s one more page. I tore it out a long while ago and kept it up my sleeve, which is where you keep the things you can\'t look at yet. It\'s you.');
  ui.closeDialog();
  await givePage(g, 'p8');
  if (named) {
    await I(`${state.mapName} is safe now, I think. Go on. Go and visit people. That was always the whole job.`);
    ui.closeDialog();
  } else {
    await I('I won\'t be here very long, I think. Paper doesn\'t last. It isn\'t meant to. It\'s meant to be written on and then read.');
    await I('A map is only a list of places somebody loved enough to write down. You\'ve been writing them down. That\'s all it ever was, really.');
    await finishMap(D, I);
  }
  L.cutscene = false;
}
async function finishMap(D, I) {
  const say = I || ((t) => D.say(t));
  await say('Would you give it a name? The map. I never named mine. I thought there\'d be time later, and there wasn\'t, and now there is.');
  const names = ['The Kept Places', 'Mistfold', 'Pell\'s Map', 'Home, Roughly'];
  const c = await D.choose(names);
  state.mapName = names[c];
  await say(`${state.mapName}. Yes. That's a good one. I'll write it at the top, where people put the names they're proud of.`);
  await say('Keep going, after this. Put things back. Visit people. That\'s the whole job, really, the visiting. The map is just how you find your way to them.');
  setFlag('ending');
  setFlag('margin.colored');
  ui.closeDialog();
  await D.ending();
}

// ---------------------------------------------------------------- THE FAR BANK
const farbank = {
  id: 'farbank', radius: 13, spawn: [3, 6], peaceful: true, water: 0, phase: 'night',
  lush: { flowers: [0xd8e8ff, 0xc8b8f0, 0xffffff], leaf: [0x4a6a5a, 0x5a7a6a], density: 0.7 },
  waterDeep: 0x3a5a8a, waterShallow: 0x8ab0d0,
  cliff: 0x7a7a8a, cliff2: 0x4a4a5a,
  height: (x, z) => 0.5 + fbm(x * 0.1, z * 0.1, 3) * 0.7 - Math.max(0, Math.hypot(x, z) - 8) * 0.25,
  color: (x, z, h) => (h < 0.2 ? col(0x9aaabb) : mixc(0x7aa08a, 0x9ab0b0, noise2(x * 0.3, z * 0.3) + 0.5)),
  ambient: ['fireflies', 'motes'],
  fireflyColor: 0xffe8b0, moteColor: 0xd8e8ff,
  tint: { all: 0x5a6aa0, amount: 0.25 },
  mist: () => [0x6a74a8, 0x3a4270],
  keepClear: (x, z) => Math.hypot(x, z) < 3.5,
  waystone: { label: 'Row back with Brine', action: () => window.game.enterLand('marsh') },
  build(L) {
    setFlag('farbank.seen');
    // moonlit, but bright enough to see the faces of things
    L.hemi.intensity = 3.6; L.hemi.color.setHex(0xc8d4ff); L.sun.intensity = 2.4;
    L.place(M.makeBoat(0x5a4a3a), 6, 8.5, { y: 0, rot: FACE });
    // the resting lights, in rows like birds on a wire
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, d = 5.5 + (i % 3) * 1.6;
      const gl = M.glow([0xbfe8ff, 0xd8c8ff, 0xffe0a0][i % 3], 0.9, 0.85);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      L.place(gl, x, z, { y: L.heightAt(x, z) + 0.8 });
      L.updaters.push((dt, t) => { gl.position.y = L.heightAt(x, z) + 0.8 + Math.sin(t * 1.3 + i) * 0.15; });
    }
    const lights = [
      ['A pale light', 0xbfe8ff, -5, -3, 'we rest here. it isn\'t sleeping. it\'s more like being remembered, slowly, by the water.'],
      ['A violet light', 0xd8c8ff, 4.5, -4, 'i was the light in the archive window. the grey rubbed the window out. i minded less than you\'d think. i\'d seen everything through it twice.'],
      ['A warm light', 0xffe0a0, -4, 4, state.settlers.flicker ? 'the little warm one went to live in a window. we\'re all very proud. we tell each other about it, in turns.' : 'one of us wanted a window instead of the far bank. imagine. we think it\'s very brave.'],
      ['A faint light', 0xe8f0ff, 5.5, 2, 'there\'s a lady at the edge who drew all of us. she drew us wrong on purpose. we wander because of her. we like it.'],
    ];
    lights.forEach(([name, c, x, z, line], i) => L.npc({ id: 'light' + i, name, model: M.makeWisp(c), x, z, face: FACE, voice: V.flicker, color: '#5a6a9a', noCollide: true, noBlob: true, talk: async (D) => { await D.say(line); } }));
    // a stone lantern in the middle, and something waiting by it
    const lantern = M.vmesh([M.paint(M.xf(M.G.box(0.8, 0.3, 0.8), [0, 0.15, 0]), 0x8a8a90), M.paint(M.xf(M.G.cyl(0.18, 0.22, 0.9, 6), [0, 0.75, 0]), 0x8a8a90), M.paint(M.xf(M.G.box(0.7, 0.55, 0.7), [0, 1.45, 0]), 0x9a9aa0), M.paint(M.xf(M.G.cone(0.6, 0.45, 4), [0, 1.95, 0], [0, Math.PI / 4, 0]), 0x7a7a84)]);
    const lg = M.glow(0xffe0a0, 2.2, 0.8); lg.position.y = 1.45; lantern.add(lg);
    L.place(lantern, 0, 0, { r: 0.6, rot: FACE });
    L.interact({ x: 0, z: 0, r: 2, label: 'Sit by the stone lantern', action: async () => {
      if (hasCharm('wisp')) { await L.game.narrate('You sit for a while. Nobody asks you for anything. Across the water, very small, you can see the boards of the marsh and Brine\'s lamp, waiting.'); return; }
      await L.game.narrate('You sit by the lantern for a while. One of the lights detaches itself from the others and comes to settle on your shoulder, as if it has decided something.');
      await L.game.narrate('It is very small and very warm, and it doesn\'t seem to want to rest just yet. It would like to come and see things. It would like to help.');
      giveCharm(L.game, 'wisp');
    } });
    L.place(M.makeBench(0x6a6a74), -2.5, 7, { r: 0.9, rot: Math.PI + 0.3 });
    L.scatter(10, (x, z, r) => L.place(M.makeTree(r, { kind: 'willow', leaf: 0x5a7a7a, trunk: 0x3a3a40 }), x, z, { r: 0.8, sway: true }), { r: 1.8, region: (x, z) => Math.hypot(x, z) > 6 });
    L.scatter(30, (x, z, r) => L.place(M.makeFlower(r, [0xd8e8ff, 0xc8b8f0, 0xffffff][Math.floor(r() * 3)], 0xfff0c0, 1.1), x, z), { r: 0.2 });
    L.grass(900, (p, r) => (r() > 0.5 ? 0x7a9a8a : 0x8aaa9a), null, 0.5);
  },
};

export const LANDS = { home, shore, orchard, marsh, archive, teacup, giant, margin, farbank };

// Little dioramas for the world map tiles.
export function miniFor(id, rng) {
  const g = new THREE.Group();
  const add = (o, x, z, s = 0.3, y = 0) => { o.position.set(x, y, z); o.scale.multiplyScalar(s); g.add(o); return o; };
  const trees = (n, opts, s = 0.28) => { for (let i = 0; i < n; i++) { const a = rng() * 6.28, d = 1 + rng() * 1.6; add(M.makeTree(rng, opts), Math.cos(a) * d, Math.sin(a) * d, s); } };
  switch (id) {
    case 'home': add(M.makeCottage({ lit: true }), -0.3, -0.3, 0.32).rotation.y = FACE; add(M.makePell(true), 0.8, 0.3, 0.32); trees(4, { kind: 'round' }); break;
    case 'shore': { const lh = add(M.makeLighthouse(flag('shore.lit')), -0.6, -0.6, 0.22); const w = new THREE.Mesh(new THREE.CircleGeometry(1.6, 6, 0, Math.PI), M.lambert(0x5fb3b8)); w.rotation.x = -Math.PI / 2; w.rotation.z = -FACE; w.position.y = 0.03; g.add(w); add(M.makeBoat(), 1.1, 0.6, 0.25); g.userData.lighthouse = lh; break; }
    case 'orchard': for (let i = 0; i < 6; i++) add(M.makeTree(rng, { kind: 'round', leaf: 0x8aa850, fruit: 0xffc860, fruitGlow: true }), -1.2 + (i % 3) * 1.2, -0.6 + Math.floor(i / 3) * 1.2, 0.25); add(M.makeWindmill(), 1.4, -1.2, 0.2); break;
    case 'marsh': { const w = new THREE.Mesh(new THREE.CircleGeometry(1.8, 12), M.lambert(0x3a4a5a)); w.rotation.x = -Math.PI / 2; w.position.y = 0.03; g.add(w); trees(4, { kind: 'willow', leaf: 0x6a8a5a }, 0.25); add(M.glow(0x9fe0ff, 0.8, 0.8), 0.3, 0.2, 1, 0.5); break; }
    case 'archive': add(M.makeRuinWall(rng, 3, 2.5), -0.3, -0.8, 0.35).rotation.y = FACE; add(M.makeBookshelf(rng), 0.6, 0.4, 0.3).rotation.y = FACE; trees(3, { kind: 'round', leaf: 0x5a8a44 }, 0.3); break;
    case 'teacup': add(M.makeTeapotHouse(), -0.4, -0.4, 0.28); add(M.makeCupHouse(), 1.0, 0.5, 0.25); trees(2, { kind: 'round', leaf: 0xd8a8c8 }); break;
    case 'giant': add(M.makeGiantHead(), -0.2, -0.2, 0.17, 0.2).rotation.y = FACE; trees(5, { kind: 'pine', leaf: 0x5a8a4a }, 0.22); break;
    case 'margin': add(M.makePaperWoman(), 0.3, 0.3, 0.45); trees(3, { kind: 'birch', leaf: 0xd88ab8 }); break;
  }
  return g;
}
