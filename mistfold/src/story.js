// The thread through everything: the grey patches, Ines's pages, the charms people give you, and the Smudge itself.
import * as THREE from 'three';
import * as M from './models.js';
import { mulberry32, lerp, clamp } from './util.js';
import { state, flag, setFlag, save, addLetter, hasCharm, PAGES, CHARMS, LAND_INFO, KEEPSAKES } from './state.js';
import { audio } from './audio.js';
import { ui } from './ui.js';

// ---------- pages & charms ----------
export async function givePage(game, id) {
  if (state.pages.includes(id)) return;
  state.pages.push(id);
  audio.sfx('item');
  save();
  const pg = PAGES.find((p) => p.id === id);
  await pagePanel(pg);
  ui.toast(`A page from Ines's sketchbook. <b>${state.pages.length}/${PAGES.length}</b> <small>(Tab to read them again)</small>`, 5000);
}
export function pagePanel(pg) {
  audio.sfx('open');
  const n = PAGES.indexOf(pg) + 1;
  return ui.panel(`<div class="letter page"><div class="page-num">page ${n}</div><div class="letter-from">${pg.title}</div><div class="letter-body">${pg.text.replace(/\n/g, '<br>')}</div>${pg.id === 'p8' ? SELF_SKETCH : ''}</div>`);
}
// the drawing on the last page
const SELF_SKETCH = `<svg class="sketch" viewBox="0 0 120 120"><g fill="none" stroke="#5a4a42" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M60 30c-9 0-14 7-14 15s6 14 14 14 14-6 14-14-5-15-14-15z"/><path d="M47 40c4-9 22-11 27 0"/><path d="M50 60c-6 4-9 16-9 32h38c0-16-3-28-9-32"/><path d="M41 92l-3 14M79 92l3 14"/><path d="M48 64c8 8 18 10 30 4"/><rect x="70" y="66" width="14" height="16" rx="3"/><path d="M38 64l-8 44"/><path d="M28 104c3-1 5 1 4 4"/><path d="M53 46c1 1 2 1 3 0M64 46c1 1 2 1 3 0" stroke-width="1.2"/></g><text x="60" y="118" font-size="7" text-anchor="middle" fill="#8a7a6a" font-style="italic">for keeps</text></svg>`;
export function giveCharm(game, id) {
  if (state.charms.includes(id)) return;
  state.charms.push(id);
  audio.sfx('item');
  const c = CHARMS[id];
  ui.toast(`<div class="kin-title">✦ ${c.name}</div><div>${c.desc}</div><div class="kin-reward">a charm, from ${c.from}</div>`, 7000, 'kin');
  save();
  if (game.land) game.land.refreshCompanion?.();
}

// ---------- the grey ----------
// what each erasure throws at you, by how many you've already won back
const WAVES = [
  [[['smudgeling', 4]], [['smudgeling', 2], ['inkblot', 2]]],
  [[['smudgeling', 3], ['inkblot', 1]], [['ruler', 1], ['smudgeling', 2]]],
  [[['inkblot', 2], ['smudgeling', 3]], [['ruler', 2], ['inkblot', 1]]],
  [[['ruler', 1], ['inkblot', 2], ['smudgeling', 2]], [['ruler', 2], ['smudgeling', 3]]],
  [[['ruler', 2], ['smudgeling', 3]], [['ruler', 2], ['inkblot', 2], ['smudgeling', 2]]],
];
export const erasuresCleared = () => Object.keys(state.flags).filter((k) => /^erase\.\w+\.clear$/.test(k)).length;
export function activeErasures() {
  return Object.keys(state.flags).filter((k) => /^erase\.\w+\.from$/.test(k)).map((k) => k.split('.')[1])
    .filter((id) => !flag(`erase.${id}.clear`) && state.day >= flag(`erase.${id}.from`));
}
const SMUDGE_LETTERS = {
  1: ['smudge1', 'dear the one with the satchel,\n\nyou keep putting things back. i keep taking them away. one of us is doing it wrong.\n\ni think it might be me. i don\'t know how to stop. nobody ever told me how to stop. i was only ever told to tidy.\n\nsorry.\n\n— S'],
  3: ['smudge2', 'dear the one with the satchel,\n\ni watched you with my crumbs. you hit them very politely, mostly.\n\nshe used to draw me little faces in the margin so i\'d have something to look at while she worked. i rubbed those out too. i didn\'t mean to. it\'s the only thing i know how to do with my hands, and i haven\'t got hands.\n\n— S'],
  5: ['smudge3', 'i know where she is. she\'s at the edge, in the margin. i haven\'t gone in.\n\ni\'m frightened that if i go in i\'ll tidy her.\n\nif you go, will you go first?\n\n— S'],
};

// a soft grey scribble, drawn once and shared
let _greyTex;
function greyTexture() {
  if (_greyTex) return _greyTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = mulberry32(17);
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(190,182,192,0.92)'); grad.addColorStop(0.7, 'rgba(200,192,200,0.8)'); grad.addColorStop(1, 'rgba(210,204,210,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 128, 0, 6.29); g.fill();
  // rubbing marks, back and forth
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28, d = r() * 90, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, ang = r() * 3.14, len = 20 + r() * 40;
    g.strokeStyle = `rgba(${120 + r() * 50},${112 + r() * 40},${126 + r() * 40},${0.15 + r() * 0.3})`;
    g.lineWidth = 2 + r() * 6;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const t = (k / 5 - 0.5) * len, w = (k % 2 ? 1 : -1) * 6; g.lineTo(x + Math.cos(ang) * t + Math.cos(ang + 1.57) * w, y + Math.sin(ang) * t + Math.sin(ang + 1.57) * w); }
    g.stroke();
  }
  _greyTex = new THREE.CanvasTexture(c);
  _greyTex.colorSpace = THREE.SRGBColorSpace;
  return _greyTex;
}
function greyPatch(L, x, z, r) {
  const geo = new THREE.CircleGeometry(r, 40, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, L.groundAt(x + p.getX(i), z + p.getZ(i)) + 0.06);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: greyTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, 0, z);
  return m;
}
// the outline of something that's been rubbed out: pencil lines where it used to be
function ghostOf(obj) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x6a6070, transparent: true, opacity: 0.55 });
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), mat);
    o.matrixWorld.decompose(e.position, e.quaternion, e.scale);
    g.add(e);
  });
  return g;
}

function setupErasure(L) {
  const E = L.def.erasure, id = L.id, game = L.game;
  if (!E || !E.ready()) return;
  const key = `erase.${id}`;
  const placeReal = () => {
    const o = E.model(L);
    L.place(o, E.x, E.z, { r: E.r || 1, rot: E.rot ?? Math.PI / 4 });
    L.interact({ x: E.x, z: E.z, r: (E.r || 1) + 1.4, label: E.label || 'Look', action: () => game.narrate(E.line) });
    if (E.after) E.after(L, o);
    return o;
  };
  if (flag(key + '.clear')) { placeReal(); return; }
  // the grey comes the day after you've mended a place
  if (flag(key + '.from') == null) { setFlag(key + '.from', state.day + 1); return; }
  if (state.day < flag(key + '.from')) return;

  const R = 4.4;
  const patch = greyPatch(L, E.x, E.z, R); L.scene.add(patch);
  const proto = E.model(L);
  proto.position.set(E.x, L.heightAt(E.x, E.z), E.z); proto.rotation.y = E.rot ?? Math.PI / 4;
  const ghost = ghostOf(proto); L.scene.add(ghost);
  game.wait(2.4).then(() => { if (game.land === L) ui.toast(`Something grey has been at ${LAND_INFO[id].name}. Something is missing.`, 5000); });
  let started = false, done = false, wave = 0, gap = 0, wall = null;
  const tier = WAVES[Math.min(erasuresCleared(), WAVES.length - 1)];
  const spawnWave = (i) => {
    const list = tier[i];
    let n = 0;
    const total = list.reduce((s, [, c]) => s + c, 0);
    for (const [kind, count] of list) for (let k = 0; k < count; k++) {
      const a = (n / total) * Math.PI * 2 + i * 0.7 + L.t, d = 4.5 + (n % 2) * 1.2;
      const e = L.enemy(kind, E.x + Math.cos(a) * d, E.z + Math.sin(a) * d, { always: true, erasure: true });
      L.dust.burst(e.x, L.heightAt(e.x, e.z) + 0.5, e.z, 14, { color: [0xc8c0c8, 0xe8e0e8], size: 0.6, speed: 2, life: 0.9, grav: -0.5, up: 1 });
      e.state = 'chase'; e.timer = 0.6 + n * 0.15;
      if (kind === 'inkblot') game.tip('ink', 'Ink-blots lob from a distance. Watch for the dark ring on the ground and step out of it.');
      if (kind === 'ruler') game.tip('ruler', 'The pencil-knight hides behind its ruler. Get round the side, or <b>hold attack</b> and release a spin to break its guard.');
      n++;
    }
    audio.sfx('erase');
  };
  const start = () => {
    started = true;
    L.arena = { x: E.x, z: E.z, r: 7.5 };
    audio.setTheme('erasure'); audio.sfx('grey');
    game.cam.shake = 0.6;
    // a wall of grey, like the edge of a rubbed-out patch
    const wm = new THREE.MeshBasicMaterial({ color: 0xb8b0bc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    wall = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 3.2, 56, 1, true), wm);
    wall.position.set(E.x, L.heightAt(E.x, E.z) + 1.4, E.z);
    L.scene.add(wall);
    L.effects.push({ obj: new THREE.Group(), t: 0, update: (t) => { wm.opacity = Math.min(0.32, t * 0.5); return t < 1; } });
    game.tip('charge', '<b>Hold attack</b> to charge a spin. <b>Dash</b> just as something strikes for a perfect dodge.', 7000);
    spawnWave(0);
  };
  const finish = async () => {
    done = true;
    setFlag(key + '.clear');
    L.arena = null;
    audio.sfx('restore');
    audio.setTheme(LAND_INFO[id].theme);
    game.renderer.post.uniforms.flash.value = 0.5;
    if (wall) { const wm = wall.material; L.effects.push({ obj: wall, t: 0, update: (t) => { wm.opacity = 0.32 * (1 - t); wall.scale.y = 1 + t; return t < 1; } }); }
    L.scene.remove(patch); L.scene.remove(ghost);
    const real = placeReal();
    real.scale.setScalar(0.01);
    L.effects.push({ obj: new THREE.Group(), t: 0, update: (t) => { const k = Math.min(1, t / 0.7); real.scale.setScalar(0.01 + (1 - Math.pow(1 - k, 3)) * 0.99 + Math.sin(k * Math.PI) * 0.12); return k < 1; } });
    L.fx.burst(E.x, L.heightAt(E.x, E.z) + 1, E.z, 60, { color: [0xfff0b0, 0xffffff, LAND_INFO[id].tile], size: 0.55, speed: 5, life: 1.4, grav: 0.5, up: 2 });
    smudgeGlimpse(L, E.x, E.z);
    const n = erasuresCleared();
    if (SMUDGE_LETTERS[n]) addLetter(SMUDGE_LETTERS[n][0], 'S.', ['A smudged letter', 'Another smudged letter', 'A very smudged letter'][[1, 3, 5].indexOf(n)], SMUDGE_LETTERS[n][1], 1);
    await game.wait(1.2);
    if (game.land !== L) return;
    L.pickup(M.makePage(), E.x + 1.4, E.z + 1.4, () => givePage(game, E.page), { y: 0.9 });
    ui.toast(`${E.name} has come back. There was something papery underneath.`, 4500);
    save();
  };
  L.updaters.push((dt) => {
    if (done) return;
    if (Math.random() < dt * 10) { const a = Math.random() * 6.28, d = Math.random() * R; L.dust.emit(E.x + Math.cos(a) * d, L.heightAt(E.x, E.z) + 0.1, E.z + Math.sin(a) * d, { vy: 0.6, color: 0xc8c0c8, size: 0.3, life: 1.6, grav: -0.1, kind: 3 }); }
    ghost.children.forEach((c, i) => (c.material.opacity = 0.4 + Math.sin(L.t * 2 + i) * 0.15));
    const p = L.player;
    if (!started) { if (Math.hypot(p.x - E.x, p.z - E.z) < R * 0.8 && !ui.busy && !game.transitioning) start(); return; }
    if (L.enemies.some((e) => e.erasure)) return;
    gap += dt;
    if (gap < 1) return;
    gap = 0;
    if (wave === 0) { wave = 1; spawnWave(1); } else finish();
  });
}
// the Smudge, seen for a moment at the edge of things, shrinking away
function smudgeGlimpse(L, x, z) {
  const p = L.player;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
  let gx = x + (dx / d) * 9, gz = z + (dz / d) * 9;
  [gx, gz] = L.nearestWalkable(gx, gz, 1);
  const s = M.makeSmudge(1.3);
  s.position.set(gx, L.heightAt(gx, gz), gz); s.rotation.y = Math.atan2(p.x - gx, p.z - gz);
  L.scene.add(s);
  L.effects.push({ obj: s, t: 0, update: (t) => {
    const k = clamp((t - 2.2) / 1.6, 0, 1);
    s.scale.setScalar(1.3 * (1 - k));
    s.position.y = L.heightAt(gx, gz) - k * 0.5;
    if (Math.random() < 0.3) L.dust.emit(gx + (Math.random() - 0.5) * 2, L.heightAt(gx, gz) + 0.4, gz + (Math.random() - 0.5) * 2, { vy: 0.5, color: 0xc8c0c8, size: 0.5, life: 1.2, grav: -0.1 });
    const sc = L.game.toScreen(new THREE.Vector3(gx, L.heightAt(gx, gz) + 2.8, gz));
    ui.bubble('smudge-glimpse', sc.x, sc.y, t < 1.6 ? '…sorry.' : '…', t < 3.6 && sc.on);
    return t < 3.8;
  } });
}

// ---------- Mote, who goes visiting ----------
export function moteHiding() { return flag('mote.hide') || null; }
export function maybeStartMoteHide() {
  if (!flag('intro') || (flag('mote.finds') || 0) >= 3 || moteHiding()) return;
  if (state.day < (flag('mote.next') || 4)) return;
  const lands = Object.keys(state.placed).filter((k) => k !== 'home' && k !== 'margin');
  if (lands.length < 2) return;
  setFlag('mote.hide', lands[(state.day * 7 + (flag('mote.finds') || 0) * 3) % lands.length]);
}
const MOTE_FOUND = [
  'Mote is sitting under a fern as though it had booked the spot in advance. It allows itself to be found.',
  'Mote is here, of course, washing one paw with great concentration. It looks up at you as if you are the one who is late.',
  'Mote has been waiting for you. There is a small brass bell in its mouth, which it drops at your feet with enormous ceremony.',
];
function setupMote(L) {
  if (moteHiding() !== L.id) return;
  const r = mulberry32(state.day * 31 + 7);
  const sp = L.def.spawn || [0, 8];
  let x = 0, z = 0;
  for (let k = 0; k < 80; k++) {
    const a = r() * 6.28, d = 6 + r() * 9;
    x = Math.cos(a) * d; z = Math.sin(a) * d;
    if (Math.hypot(x - sp[0], z - sp[1]) > 7 && L.free(x, z, 1) && L.walkable(x, z, 0.5)) break;
  }
  const n = L.npc({ id: 'mote-away', name: 'Mote', model: M.makeCat(0xe0a060), x, z, face: r() * 6, r: 0.35, blob: 0.7, label: 'Scoop up Mote', voice: { pitch: 2 }, bubble: () => '?', talk: async (D) => {
    const i = flag('mote.finds') || 0;
    audio.sfx('purr');
    await D.narrate(MOTE_FOUND[i]);
    setFlag('mote.finds', i + 1); setFlag('mote.hide', null); setFlag('mote.next', state.day + 2);
    L.scene.remove(n.obj); if (n.obj.userData.blob) L.scene.remove(n.obj.userData.blob);
    L.npcs.splice(L.npcs.indexOf(n), 1); L.interacts = L.interacts.filter((it) => it.npc !== n); L.colliders = L.colliders.filter((c) => c !== n.col);
    ui.bubble(n.bubbleKey, 0, 0, '', false);
    D.lumen(8 + i * 4);
    if (i + 1 >= 3) giveCharm(L.game, 'bell');
    else ui.toast('Mote will make its own way home. Cats do.', 4000);
  } });
}

// ---------- the little light from the Far Bank ----------
function setupCompanion(L) {
  L.refreshCompanion = () => {
    if (!hasCharm('wisp') || L.companion) return;
    const g = M.glow(0xffe0a0, 1.1, 0.9);
    const core = new THREE.Mesh(M.G.sph(0.08, 6, 4), M.basic(0xfff6d8)); g.add(core);
    L.scene.add(g);
    L.companion = { obj: g, cd: 1, a: 0 };
  };
  L.refreshCompanion();
  L.updaters.push((dt, t) => {
    const c = L.companion; if (!c) return;
    const p = L.player;
    c.a += dt * 2.2; c.cd -= dt;
    c.obj.position.set(p.x + Math.cos(c.a) * 1.1, L.heightAt(p.x, p.z) + 1.5 + Math.sin(t * 3) * 0.12, p.z + Math.sin(c.a) * 1.1);
    if (c.cd > 0 || L.peaceful && !L.enemies.some((e) => e.always)) return;
    let best = null, bd = 3.8;
    for (const e of L.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    c.cd = 2.6;
    const from = c.obj.position.clone(), to = new THREE.Vector3(best.x, L.heightAt(best.x, best.z) + (best.st.fly ? 1.4 : 0.7), best.z);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 1 }));
    L.scene.add(line);
    L.effects.push({ obj: line, t: 0, update: (tt) => { line.material.opacity = 1 - tt / 0.2; return tt < 0.2; } });
    audio.sfx('blip', { pitch: 3, wave: 'sine' });
    L.damageEnemy(best, 1, { kb: 0.3, noFlare: true, color: [0xfff0b0, 0xffffff] });
  });
}

export function setupStory(L) {
  setupErasure(L);
  setupMote(L);
  setupCompanion(L);
}

// ---------- what to do next, in a sentence ----------
export function storyObjective() {
  const pages = state.pages.length;
  if (!flag('intro')) return 'Talk to Pell, the lantern by the cottage door.';
  if (flag('ending') && !flag('smudge.down')) return 'Ines has something she didn\'t tell you. She is in the Last Margin.';
  if (flag('ending')) return `Keep wandering. Visit people.${pages < PAGES.length ? ` ${PAGES.length - pages} of Ines's pages are still out there.` : ''}`;
  if (flag('margin.met')) return 'The Smudge is waiting in the Last Margin. Ines is with it.';
  if (state.placed.margin) return 'Someone is waiting at the edge of the map, in the Last Margin.';
  if (state.keepsakes.includes('pencil')) return 'Set the Cartographer\'s Pencil down on the map. It wants to draw the edge.';
  const grey = activeErasures();
  if (grey.length) return `Something grey is rubbing out places you've mended: ${grey.map((g) => LAND_INFO[g].name).join(', ')}. Win them back.`;
  if (state.keepsakes.length) return `Set out the ${state.keepsakes.length === 1 ? KEEPSAKES[state.keepsakes[0]].name : 'keepsakes in your satchel'} on the map.`;
  return 'Help the people in the lands you\'ve unfolded. Each of them has something to give.';
}

// ---------- the Smudge ----------
export class SmudgeBoss {
  constructor(L, x, z, onDown) {
    this.L = L; this.boss = true; this.kind = 'smudge';
    this.st = { hp: 60, fly: 0, lumen: 0 };
    this.max = this.hp = 60 + (state.power - 1) * 15;
    this.x = x; this.z = z; this.face = 0; this.t = 0;
    this.state = 'intro'; this.timer = 1.8; this.last = null;
    this.flash = 0; this.dizzy = 0; this.stun = 0; this.threat = false; this.onDown = onDown;
    this.obj = M.makeSmudge(1.6);
    this.mats = [];
    this.obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if ('emissive' in o.material) this.mats.push(o.material); } });
    this.obj.scale.setScalar(0.01);
    L.scene.add(this.obj);
    L.shadowBlob(this.obj, 3.2);
    // the line it's about to rub along
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 16), new THREE.MeshBasicMaterial({ color: 0x8a6a7a, transparent: true, opacity: 0, depthWrite: false }));
    this.lane.rotation.x = -Math.PI / 2;
    L.scene.add(this.lane);
    ui.bossBar('Smudge', 1);
  }
  get phase() { return this.hp / this.max > 0.6 ? 1 : this.hp / this.max > 0.3 ? 2 : 3; }
  hit(dmg) {
    if (this.state === 'down' || this.state === 'intro') return false;
    this.hp -= dmg;
    this.flash = 0.12;
    ui.bossBar('Smudge', Math.max(0, this.hp / this.max));
    if (this.hp <= 0) this.down();
    return false;
  }
  stagger() { if (this.state !== 'down' && this.state !== 'intro') { this.state = 'dazed'; this.timer = 2.6; this.threat = false; this.lane.material.opacity = 0; } }
  down() {
    this.state = 'down'; this.threat = false; this.lane.material.opacity = 0;
    const L = this.L;
    L.enemies.splice(L.enemies.indexOf(this), 1);
    ui.bossBar(null);
    this.onDown(this);
  }
  pick() {
    const crumbs = this.L.enemies.filter((e) => e.kind === 'smudgeling').length;
    const opts = ['rub', 'rub'];
    if (crumbs < 4 && this.last !== 'crumbs') opts.push('crumbs');
    if (this.phase >= 2 && this.last !== 'shavings') opts.push('shavings', 'shavings');
    const a = opts[Math.floor(Math.random() * opts.length)];
    this.last = a;
    if (a === 'rub') { this.state = 'windup'; this.timer = this.phase === 3 ? 0.7 : 0.95; this.second = false; }
    else if (a === 'crumbs') { this.state = 'crumbs'; this.timer = 0.9; }
    else { this.state = 'shavings'; this.timer = 0.8; }
  }
  update(dt) {
    const L = this.L, p = L.player;
    this.t += dt; this.timer -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz) || 0.001;
    const body = this.obj.userData.parts.body;
    let wob = 0, tilt = 0, lift = 0;
    switch (this.state) {
      case 'intro': {
        const k = clamp(1 - this.timer / 1.8, 0, 1);
        this.obj.scale.setScalar(1.6 * (1 - Math.pow(1 - k, 3)));
        this.face = Math.atan2(dx, dz);
        if (Math.random() < 0.5) L.dust.emit(this.x + (Math.random() - 0.5) * 3, L.heightAt(this.x, this.z) + 0.3, this.z + (Math.random() - 0.5) * 3, { vy: 1, color: 0xc8c0c8, size: 0.7, life: 1.4, grav: -0.1 });
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1.2; }
        break;
      }
      case 'idle':
        this.face = lerpAngle(this.face, Math.atan2(dx, dz), dt * 3);
        if (dist > 5) this.move((dx / dist) * 1.3 * dt, (dz / dist) * 1.3 * dt);
        if (this.timer <= 0) this.pick();
        break;
      case 'windup': {
        if (this.timer > 0.35) { this.dir = [dx / dist, dz / dist]; this.face = Math.atan2(dx, dz); }
        wob = Math.sin(this.t * 40) * 0.08;
        this.threat = this.timer < 0.35;
        const ln = this.lane;
        ln.position.set(this.x + this.dir[0] * 8, L.groundAt(this.x + this.dir[0] * 8, this.z + this.dir[1] * 8) + 0.07, this.z + this.dir[1] * 8);
        ln.rotation.z = -Math.atan2(this.dir[0], this.dir[1]);
        ln.material.opacity = 0.18 + (1 - this.timer) * 0.25 + Math.sin(this.t * 20) * 0.05;
        if (this.timer <= 0) { this.state = 'rub'; this.timer = 1.05; this.hitDone = false; ln.material.opacity = 0; audio.sfx('erase'); }
        break;
      }
      case 'rub': {
        const sp = this.phase === 3 ? 15 : 12.5;
        const moved = this.move(this.dir[0] * sp * dt, this.dir[1] * sp * dt);
        tilt = 0.25; wob = Math.sin(this.t * 30) * 0.05;
        L.erasePaper?.(this.x, this.z, 1.9);
        L.game.cam.shake = Math.max(L.game.cam.shake, 0.25);
        if (Math.random() < 0.6) L.dust.emit(this.x - this.dir[0] * 1.5, L.heightAt(this.x, this.z) + 0.2, this.z - this.dir[1] * 1.5, { vx: (Math.random() - 0.5) * 3, vy: 1.5, vz: (Math.random() - 0.5) * 3, color: 0xd0c0c4, size: 0.4, life: 0.8, grav: 4 });
        if (!this.hitDone && dist < 2.1 && !p.inv) { L.hurtPlayer(2, this.x, this.z); this.hitDone = true; }
        if (this.timer <= 0 || !moved) {
          this.threat = false;
          if (this.phase === 3 && !this.second) { this.second = true; this.state = 'windup'; this.timer = 0.6; }
          else { this.state = 'dazed'; this.timer = 1.7; L.game.cam.shake = 0.6; audio.sfx('door'); }
        }
        break;
      }
      case 'dazed':
        wob = Math.sin(this.t * 6) * 0.12;
        if (Math.random() < dt * 8) L.fx.emit(this.x + (Math.random() - 0.5), L.heightAt(this.x, this.z) + 2.8, this.z + (Math.random() - 0.5), { color: 0xfff0a0, size: 0.35, life: 0.6, vy: 0.6 });
        L.game.tip('smudge-dazed', 'It\'s dazed. Now\'s your chance.', 3000);
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1.1; }
        break;
      case 'crumbs':
        wob = Math.sin(this.t * 50) * 0.1;
        if (this.timer <= 0) {
          for (let i = 0; i < 3; i++) {
            const a = this.face + (i - 1) * 0.9 + Math.PI;
            const e = L.enemy('smudgeling', this.x + Math.sin(a) * 2.6, this.z + Math.cos(a) * 2.6, { always: true });
            e.state = 'chase'; e.timer = 0.5;
            L.dust.burst(e.x, L.heightAt(e.x, e.z) + 0.5, e.z, 10, { color: 0xd8c8c8, size: 0.5, speed: 2, life: 0.7, grav: -0.5 });
          }
          audio.sfx('poof');
          this.state = 'idle'; this.timer = 1.4;
        }
        break;
      case 'shavings':
        lift = Math.min(1, (0.8 - this.timer) / 0.8) * 1.2;
        if (this.timer <= 0) {
          const n = this.phase === 3 ? 8 : 6;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.28, d = i === 0 ? 0 : 1.5 + Math.random() * 3.5;
            L.shoot(this.x, this.z, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, { dmg: 1, r: 1.2, dur: 0.9 + i * 0.12, color: 0x8a7a8a });
          }
          audio.sfx('spit');
          this.state = 'idle'; this.timer = 1.8;
        }
        break;
      case 'down': {
        wob = Math.sin(this.t * 2) * 0.03;
        break;
      }
    }
    // bump: it's soft, but it's big
    if (this.state !== 'down' && this.state !== 'dazed' && this.state !== 'intro' && dist < 1.9 && !p.inv) L.hurtPlayer(1, this.x, this.z);
    const gy = L.heightAt(this.x, this.z);
    this.obj.position.set(this.x, gy, this.z);
    this.obj.rotation.set(tilt, this.face, wob);
    body.position.y = lift + (this.state === 'idle' ? Math.abs(Math.sin(this.t * 3)) * 0.08 : 0);
    const sq = this.state === 'windup' ? 0.85 : 1 + Math.sin(this.t * 2.5) * 0.02;
    body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (this.obj.userData.blob) this.obj.userData.blob.position.set(this.x, gy + 0.03, this.z);
    this.flash -= dt;
    const f = this.flash > 0 ? 0.8 : this.state === 'windup' ? 0.25 + Math.sin(this.t * 30) * 0.15 : 0;
    for (const m of this.mats) m.emissive.setRGB(f, f * (this.state === 'windup' ? 0.3 : 0.95), f * (this.state === 'windup' ? 0.3 : 0.9));
  }
  move(mx, mz) {
    const L = this.L, a = L.arena;
    const nx = this.x + mx, nz = this.z + mz;
    if (a && Math.hypot(nx - a.x, nz - a.z) > a.r - 1.6) return false;
    if (L.mask(nx, nz) < 0.7) return false;
    this.x = nx; this.z = nz;
    return true;
  }
}
function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, k); }
