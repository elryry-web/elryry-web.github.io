// Mistfold: the game loop, scene changes, dialogue context, and the panels that sit between.
import * as THREE from 'three';
import { Renderer, IsoCamera } from './render.js';
import { audio } from './audio.js';
import { ui, ICONS } from './ui.js';
import { state, save, load, hasSave, reset, flag, setFlag, LAND_INFO, KEEPSAKES, KINSHIPS, SETTLERS, PAGES, CHARMS, mailWaiting } from './state.js';
import { storyObjective, pagePanel } from './story.js';
import { Land } from './land.js';
import { LANDS } from './lands.js';
import { WorldMap } from './worldmap.js';
import { sleep } from './util.js';

class Input {
  constructor() {
    this.down = new Set(); this.just = new Set();
    addEventListener('keydown', (e) => {
      if (e.key === 'Tab') e.preventDefault();
      const k = e.key.toLowerCase();
      if (!e.repeat) this.just.add(k);
      this.down.add(k);
    });
    addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.down.clear());
    addEventListener('pointerdown', (e) => {
      if (e.target.id !== 'game') return;
      if (e.button === 0) { this.just.add('mouse0'); this.down.add('mouse0'); }
      if (e.button === 2) this.just.add('mouse2');
    });
    addEventListener('pointerup', (e) => { if (e.button === 0) this.down.delete('mouse0'); });
    addEventListener('contextmenu', (e) => { if (e.target.id === 'game') e.preventDefault(); });
  }
  axis() {
    const d = this.down;
    let x = 0, y = 0;
    if (d.has('a') || d.has('arrowleft')) x -= 1;
    if (d.has('d') || d.has('arrowright')) x += 1;
    if (d.has('w') || d.has('arrowup')) y += 1;
    if (d.has('s') || d.has('arrowdown')) y -= 1;
    return { x, y };
  }
  pressed(a) {
    const j = this.just;
    if (a === 'attack') return j.has(' ') || j.has('j') || j.has('mouse0');
    if (a === 'flare') return j.has('f') || j.has('l') || j.has('mouse2');
    if (a === 'dash') return j.has('shift') || j.has('k');
    if (a === 'interact') return j.has('e') || j.has('enter');
    if (a === 'map') return j.has('m');
    if (a === 'journal') return j.has('tab') || j.has('q');
    return false;
  }
  held(a) {
    const d = this.down;
    if (a === 'attack') return d.has(' ') || d.has('j') || d.has('mouse0');
    return false;
  }
  endFrame() { this.just.clear(); }
}

class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('game'));
    this.cam = new IsoCamera(22);
    this.renderer.onResize = (a) => this.cam.setAspect(a);
    this.input = new Input();
    this.state = state;
    this.mode = 'title';
    this.hitstop = 0;
    this.slowmo = 0;
    this.interactCooldown = 0;
    this.last = performance.now();
    this.time = 0;
    this.fps = 60;
    this.tweens = [];
    requestAnimationFrame((t) => this.loop(t));
  }
  // ---------- title ----------
  async title() {
    const had = load();
    this.renderer.painterly = state.painterly;
    if (!had) reset();
    this.map = new WorldMap(this);
    this.map.build();
    this.map.dispose(); // decorative only on the title screen
    this.scene = this.map.scene;
    this.mode = 'title';
    this.cam.zoomGoal = this.cam.zoom = 0.8; this.cam.setAspect(this.cam.aspect);
    ui.hud('title');
    const el = document.getElementById('title');
    el.classList.add('show');
    const cont = document.getElementById('btn-continue');
    cont.style.display = hasSave() ? 'block' : 'none';
    audio.setTheme('title');
    const begin = async (fresh) => {
      audio.init();
      if (fresh) { reset(); state.painterly = this.renderer.painterly; }
      el.classList.remove('show');
      await this.fade(1, 0.8);
      if (fresh || !hasSave()) { this.enterLand('home', true); }
      else this.toMap(true);
    };
    // ask twice in the page itself rather than with a browser dialog
    const newBtn = document.getElementById('btn-new');
    newBtn.onclick = () => {
      if (hasSave() && !newBtn.dataset.armed) { newBtn.dataset.armed = '1'; newBtn.textContent = 'Forget this map and start over?'; return; }
      begin(true);
    };
    cont.onclick = () => begin(false);
    document.addEventListener('pointerdown', () => audio.init(), { once: true });
  }
  // ---------- transitions ----------
  // game-clock timers, so transitions follow the frame loop
  tween(sec, fn) {
    return new Promise((res) => this.tweens.push({ t: 0, sec, fn, res }));
  }
  wait(sec) { return this.tween(sec, () => {}); }
  fade(to, sec) {
    const u = this.renderer.post.uniforms.fade;
    const from = u.value;
    return this.tween(sec, (k) => (u.value = from + (to - from) * k));
  }
  async toMap(skipFadeOut) {
    if (this.transitioning) return;
    this.transitioning = true;
    audio.sfx('open');
    if (!skipFadeOut) await this.fade(1, 0.6);
    if (this.land) { this.land.dispose(); this.land = null; state.day++; }
    if (this.map) this.map.dispose();
    ui.bossBar(null); ui.timer(null);
    this.map = new WorldMap(this);
    this.map.build();
    this.scene = this.map.scene;
    this.mode = 'map';
    audio.setTheme('map');
    ui.hud('map', { where: 'The Map' });
    save();
    await this.fade(0, 0.8);
    this.transitioning = false;
    if (mailWaiting()) ui.toast('✉ The mailbox at Hearthstead has its flag up.', 4500);
    if (flag('ending') && !flag('ending.mapseen')) { setFlag('ending.mapseen'); ui.toast(`<div class="kin-title">${state.mapName}</div><div>written in a small, careful hand across the top of the map.</div>`, 7000, 'kin'); }
  }
  async enterLand(id, skipFadeOut) {
    this.transitioning = true;
    if (!skipFadeOut) await this.fade(1, 0.6);
    if (this.map) { this.map.dispose(); this.map = null; }
    if (this.land) this.land.dispose();
    ui.bossBar(null); ui.timer(null);
    state.current = id;
    state.visits[id] = (state.visits[id] || 0) + 1;
    this.spawnAt = null;
    this.buildLand(id);
    this.mode = 'land';
    audio.setTheme(LAND_INFO[id].theme);
    await this.fade(0, 0.9);
    this.transitioning = false;
    const ph = ['Morning', 'Midday', 'Dusk', 'Night'][state.day % 4];
    ui.titleCard(LAND_INFO[id].name, state.visits[id] === 1 ? LAND_INFO[id].blurb : ph);
    if (this.land.def.onEnter) this.land.def.onEnter(this.land);
    save();
  }
  buildLand(id) {
    this.land = new Land(this, LANDS[id]);
    this.land.build();
    this.scene = this.land.scene;
    this.cam.viewSize = 18;
    this.cam.zoom = this.cam.zoomGoal = 1;
    this.cam.setAspect(this.cam.aspect);
    const p = this.land.player;
    this.cam.snap(new THREE.Vector3(p.x, this.land.heightAt(p.x, p.z) * 0.6 + 0.5, p.z));
    // saves from before Pell gave out his light at the start
    if (flag('intro') && !flag('flare')) { setFlag('flare'); ui.toast('✦ <b>Pell\'s Light</b>: every hit you land fills the bar under your hearts. When it\'s full, press <b>F</b> (or right-click) to let it all out.', 8000, 'kin'); }
    ui.hud('land', { where: LAND_INFO[id].name });
  }
  // rebuild the current land in place, with a flash: the land changing because of you
  async transformLand() {
    const u = this.renderer.post.uniforms.flash;
    const p = this.land.player;
    this.spawnAt = { x: p.x, z: p.z, face: p.face };
    audio.sfx('unfold');
    await this.tween(0.22, (k) => (u.value = k));
    const id = this.land.id;
    this.land.dispose();
    this.buildLand(id);
    this.spawnAt = null;
    this.land.fx.burst(p.x, 1.5, p.z, 60, { color: [0xfff0b0, 0xffffff, 0xd8f0ff], size: 0.6, speed: 6, life: 1.6, grav: 1 });
    await this.tween(0.6, (k) => (u.value = 1 - k));
    u.value = 0;
    save();
  }
  // ---------- dialogue ----------
  canInteract() { return this.interactCooldown <= 0 && !ui.busy && !this.transitioning; }
  dialogCtx(npc) {
    const g = this;
    const D = {
      npc, land: this.land,
      say: (t) => ui.say(npc.name, t, { voice: npc.voice, color: npc.color }),
      as: (name, t, voice, color) => ui.say(name, t, { voice, color }),
      narrate: (t) => ui.say('', t, { voice: { pitch: 1.6, wave: 'sine' } }),
      choose: (o) => ui.choose(o),
      poem: (title, lines) => ui.poem(title, lines),
      lumen: (n) => { state.lumen += n; audio.sfx('pickup'); ui.toast(`+${n} lumen`); },
      heart: () => { state.maxHearts++; state.hp = state.maxHearts * 2; audio.sfx('item'); ui.toast('♥ Your heart feels bigger. <b>+1 heart</b>', 4500); ui.hud('land', { where: LAND_INFO[state.current].name }); },
      give: (k) => g.giveKeepsake(k),
      settle: (id) => g.settle(id),
      transform: async () => { ui.closeDialog(); await g.transformLand(); D.land = g.land; },
      shop: () => g.shop(),
      ending: () => g.ending(),
    };
    return D;
  }
  async talk(npc) {
    if (ui.busy || this.talking) return;
    this.talking = true;
    npc.talking = true;
    try { await npc.talk(this.dialogCtx(npc)); } catch (e) { console.error(e); }
    npc.talking = false;
    ui.closeDialog();
    this.talking = false;
    this.interactCooldown = 0.35;
    save();
  }
  async narrate(text) {
    if (this.talking) return;
    this.talking = true;
    await ui.say('', text, { voice: { pitch: 1.6, wave: 'sine' } });
    ui.closeDialog();
    this.talking = false;
    this.interactCooldown = 0.35;
  }
  giveKeepsake(k) {
    if (!state.keepsakes.includes(k) && !Object.keys(state.placed).includes(KEEPSAKES[k].land)) state.keepsakes.push(k);
    audio.sfx('item');
    ui.toast(`<div class="gift"><span class="kicon big">${ICONS[k]}</span><div><div class="kin-title">${KEEPSAKES[k].name}</div><div>${KEEPSAKES[k].desc}</div><small>Set it on the map to unfold a new land.</small></div></div>`, 7000, 'kin');
    save();
  }
  settle(id) {
    if (state.settlers[id] || state.pendingSettlers.includes(id)) return;
    state.pendingSettlers.push(id);
    ui.toast(`🏡 <b>${SETTLERS[id].name}</b> would like a home: ${SETTLERS[id].needText}. Choose a land from the map.`, 6500);
    save();
  }
  // ---------- home things ----------
  async rest() {
    if (this.talking) return;
    this.talking = true;
    await ui.say('', 'The cottage is warm. The bed has the shape of you in it already.', { voice: { pitch: 1.6 } });
    const c = await ui.choose(['Sleep a while', 'Not yet']);
    ui.closeDialog();
    this.talking = false;
    this.interactCooldown = 0.4;
    if (c !== 0) return;
    this.transitioning = true;
    await this.fade(1, 0.9);
    state.day++;
    state.hp = state.maxHearts * 2;
    audio.sfx('heal');
    this.land.dispose();
    this.spawnAt = { x: -1.4, z: -1.6, face: 0.8 };
    this.buildLand('home');
    this.spawnAt = null;
    await this.fade(0, 1.2);
    this.transitioning = false;
    ui.titleCard('Hearthstead', ['Morning', 'Midday', 'Dusk', 'Night'][state.day % 4]);
    save();
  }
  async readMail() {
    if (this.talking) return;
    const ready = state.letters.filter((l) => !l.read && l.arrive <= state.day);
    if (!ready.length) {
      await this.narrate(['Nothing. A snail has been in, though, and left a shiny line round the inside.', 'Empty. It smells faintly of rain and envelopes.', 'No post today. A moth is asleep in there. You let it be.'][state.day % 3]);
      return;
    }
    for (const l of ready) { l.read = true; await this.letterPanel(l); }
    save();
    if (this.land && this.land.id === 'home') await this.transformQuiet();
  }
  async transformQuiet() {
    const p = this.land.player;
    this.spawnAt = { x: p.x, z: p.z, face: p.face };
    this.land.dispose(); this.buildLand('home'); this.spawnAt = null;
  }
  letterPanel(l) {
    audio.sfx('item');
    return ui.panel(`<div class="letter"><div class="letter-from">${l.title}</div><div class="letter-body">${l.text.replace(/\n/g, '<br>')}</div><div class="letter-sig">from ${l.from}</div></div>`);
  }
  async shop() {
    const items = [
      { id: 'heart', name: 'Spare Heart in a Shell', desc: '+1 heart. "Between you and me, it\'s a very good shell."', price: 60, max: 2 },
      { id: 'staff', name: 'Sharpened Staff Tip', desc: 'Your staff hits harder. He sharpened it on his own claw.', price: 80, max: 1 },
      { id: 'biscuit', name: 'Honey Biscuit', desc: 'Restores all your hearts. Slightly sandy.', price: 8, max: 99 },
      { id: 'sand', name: 'Very Good Sand', desc: 'It is sand.', price: 3, max: 99 },
    ];
    const disc = state.flags.pocketsDiscount ? 0.75 : 1;
    const render = (el, close) => {
      const list = items.map((it) => {
        const bought = state.flags['shop.' + it.id] || 0;
        const price = Math.ceil(it.price * disc);
        const sold = bought >= it.max;
        return `<div class="shopitem"><div><b>${it.name}</b><br><small>${it.desc}</small></div><button data-id="${it.id}" ${sold || state.lumen < price ? 'disabled' : ''}>${sold ? 'Sold out' : price + ' lumen'}</button></div>`;
      }).join('');
      el.querySelector('.panel-inner').innerHTML = `<h2>Mister Pockets' Wares</h2><p class="sub">You have <b>${state.lumen}</b> lumen.</p>${list}<button class="close" id="pclose">Close <small>(Esc)</small></button>`;
      el.querySelector('#pclose').onclick = () => close();
      el.querySelectorAll('.shopitem button').forEach((b) => (b.onclick = () => {
        const it = items.find((x) => x.id === b.dataset.id);
        const price = Math.ceil(it.price * disc);
        if (state.lumen < price) return;
        state.lumen -= price;
        state.flags['shop.' + it.id] = (state.flags['shop.' + it.id] || 0) + 1;
        audio.sfx('pickup');
        if (it.id === 'heart') { state.maxHearts++; state.hp = state.maxHearts * 2; }
        if (it.id === 'staff') state.power++;
        if (it.id === 'biscuit') state.hp = state.maxHearts * 2;
        if (it.id === 'sand' && state.flags['shop.sand'] === 3) { state.lumen += 25; ui.toast('"Three bags of sand. Nobody\'s ever done that. Between you and me, have a pearl." <b>+25 lumen</b>', 5000); }
        ui.hud('land', { where: LAND_INFO[state.current].name });
        render(el, close);
        save();
      }));
    };
    await ui.panel('', { onMount: render });
  }
  // ---------- journal ----------
  async journal() {
    if (ui.busy || this.transitioning) return;
    const people = [
      ['Pell', 'intro', 'The old lantern by your door.'],
      ['Marrow Quell', 'shore.met', flag('shore.lit') ? 'Keeps the light on now.' : 'Wants the catch-glasses turned so the sun reaches her lamp.'],
      ['Sir Thimble Haybright', 'orchard.met', flag('orchard.poem') ? 'Finished his poem.' : 'Lost three words to the critics in the dead tree.'],
      ['Auntie Brine', 'marsh.met', flag('marsh.done') ? 'Ferries the lights again.' : 'Three lights are lost in the reeds.'],
      ['Quillon Ashby', 'archive.met', flag('archive.done') ? 'Remembers his books.' : 'Forgets what his books are called. Remembers how they begin.'],
      ['The Mumbleroots', 'morel.met', state.settlers.mumbleroots ? `Living in ${LAND_INFO[state.settlers.mumbleroots.land].name}.` : flag('puffball.found') ? 'Need a rooty place to live.' : 'Their littlest, Puffball, is hiding.'],
      ['Madame Saucerelle', 'tea.invite', flag('tea.party') ? 'Had her party.' : 'Wants three guests for tea.'],
      ['Gus Postwick', 'gus.met', 'Delivers to "the one with the satchel".'],
      ['Ummoth', 'giant.met', flag('giant.sung') ? 'Sleeps the good sleep.' : 'Wants the stones played in the order of his song.'],
      ['Bellamy Tock', 'bellamy.wound', state.settlers.bellamy ? `Stopped, at last, in ${LAND_INFO[state.settlers.bellamy.land].name}.` : 'Wants somewhere quiet under a good moon.'],
      ['Flicker', 'marsh.wisp.flicker', state.settlers.flicker ? `Has a window in ${LAND_INFO[state.settlers.flicker.land].name}.` : 'Wants to be a light in a window.'],
      ['Mister Pockets', 'pockets.met', state.settlers.pockets ? `Trading in ${LAND_INFO[state.settlers.pockets.land].name}.` : 'Wants a busy, wet spot for his shop.'],
      ['Ines Vellum', flag('ending') ? 'ending' : 'margin.met', 'Drew the world, the first time.'],
      ['Smudge', 'smudge.down', flag('smudge.home') ? "Ines's eraser. Lives at Hearthstead now, and tidies only the bits that ask." : "Ines's eraser."],
      ['Mote', 'intro', flag('mote.hide') ? `Has gone visiting, in ${LAND_INFO[flag('mote.hide')].name}.` : 'The cat. Came with the cottage, or the other way round.'],
    ].filter(([, f]) => flag(f));
    const pages = PAGES.map((pg, i) => (state.pages.includes(pg.id) ? `<button class="jpage" data-p="${pg.id}">${i + 1}. ${pg.title}</button>` : `<button class="jpage unk" disabled>${i + 1}. <i>a torn-out page</i></button>`)).join('');
    const charms = state.charms.map((c) => `<div class="jcharm"><b>✦ ${CHARMS[c].name}</b><br><small>${CHARMS[c].desc}</small></div>`).join('') || '<p class="sub">None yet. People give them to you when you help with the little things.</p>';
    const ks = state.keepsakes.map((k) => `<div class="jk"><span class="kicon">${ICONS[k]}</span><div><b>${KEEPSAKES[k].name}</b><br><small>${KEEPSAKES[k].desc}</small></div></div>`).join('') || '<p class="sub">Empty. Every keepsake is out on the map.</p>';
    const kins = KINSHIPS.map((k) => (state.kinships.includes(k.id) ? `<div class="jkin"><b>✦ ${k.name}</b><br><small>${k.text}</small></div>` : `<div class="jkin unk"><b>✦ ???</b><br><small>${LAND_INFO[k.a].name.split(' ').pop()} and … ?</small></div>`)).join('');
    const letters = state.letters.filter((l) => l.read).map((l, i) => `<button class="jletter" data-i="${state.letters.indexOf(l)}">✉ ${l.title} <small>— ${l.from}</small></button>`).join('') || '<p class="sub">No letters yet.</p>';
    await ui.panel(`<h2>Journal${state.mapName ? ` · <i>${state.mapName}</i>` : ''}</h2>
      <p class="objective">${storyObjective()}</p>
      <div class="jgrid"><div><h4>Satchel</h4>${ks}<h4>Ines's Sketchbook ${state.pages.length}/${PAGES.length}</h4>${pages}<h4>Charms</h4>${charms}<h4>Letters</h4>${letters}</div>
      <div><h4>People</h4>${people.map(([n, , d]) => `<div class="jp"><b>${n}</b> <small>${d}</small></div>`).join('')}
      <h4>Kinships ${state.kinships.length}/${KINSHIPS.length}</h4>${kins}</div></div>
      <p class="sub controls">WASD move · Space attack, hold to charge a spin · Shift dash (dodge at the last moment for a perfect dodge)${flag('flare') ? ' · F lantern flare' : ''} · E talk · M map · Tab journal · P painterly ${this.renderer.painterly ? 'on' : 'off'} · N sound</p>`, { wide: true, onMount: (el, close) => {
      el.querySelectorAll('.jletter').forEach((b) => (b.onclick = async () => { const l = state.letters[+b.dataset.i]; close(); setTimeout(() => this.letterPanel(l), 50); }));
      el.querySelectorAll('.jpage[data-p]').forEach((b) => (b.onclick = async () => { const pg = PAGES.find((x) => x.id === b.dataset.p); close(); setTimeout(() => pagePanel(pg), 50); }));
    } });
    this.journalBlock = this.time + 0.3;
  }
  // ---------- hurt & faint ----------
  hurtFlash() {
    const el = document.getElementById('hurt');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    ui.hud('land', { where: LAND_INFO[state.current].name });
  }
  async faint() {
    this.transitioning = true;
    await this.wait(0.5);
    await this.fade(1, 1.2);
    const lost = Math.floor(state.lumen * 0.25);
    state.lumen -= lost;
    ui.bossBar(null); ui.timer(null);
    state.hp = state.maxHearts * 2;
    state.day++;
    this.land.dispose();
    this.spawnAt = { x: -1.4, z: -1.6, face: 0.8 };
    state.current = 'home';
    this.buildLand('home');
    this.spawnAt = null;
    audio.setTheme('home');
    await this.fade(0, 1.2);
    this.transitioning = false;
    await this.narrate(`The mist caught you, gently, and set you down at home. Pell pretends not to have been worried.${lost ? ` (${lost} lumen slipped out of your pockets.)` : ''}`);
  }
  async ending() {
    this.transitioning = true;
    audio.setTheme('title');
    await this.wait(0.6);
    const el = document.getElementById('ending');
    el.innerHTML = `<div class="end-inner"><div class="tc-line"></div><h1>${state.mapName}</h1><p>The map has a name now. The Smudge has somewhere to be, and the people in it have someone who visits.</p><p class="small">This is the end of the first unfolding. The mist is still out there, and there's still more of the world folded up in it than out. Everyone you helped is where you left them, and they'd like to see you.</p><div class="tc-line"></div><button id="endbtn">Keep wandering</button></div>`;
    el.classList.add('show');
    await new Promise((r) => (document.getElementById('endbtn').onclick = r));
    el.classList.remove('show');
    this.transitioning = false;
    save();
  }
  // ---------- helpers ----------
  toScreen(v) {
    const p = v.clone().project(this.cam.cam);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, on: p.z < 1 && p.z > -1 };
  }
  floatText(text, x, y, z, cls) { const s = this.toScreen(new THREE.Vector3(x, y, z)); ui.float(text, s.x, s.y, cls); }
  hud() { if (this.mode === 'land' && this.land) ui.hud('land', { where: LAND_INFO[this.land.id].name }); }
  // a hint shown once, the first time it's useful
  tip(id, html, ms = 6500) {
    if (flag('tip.' + id)) return;
    setFlag('tip.' + id);
    ui.toast(html, ms);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.frame(dt);
  }
  // advance the game synchronously (handy when the tab is in the background)
  step(frames = 1, dt = 1 / 60) { for (let i = 0; i < frames; i++) this.frame(dt, i < frames - 1); }
  frame(dt, skipRender = false) {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.sec);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    this.interactCooldown -= dt;
    let gdt = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; gdt = dt * 0.05; }
    else if (this.slowmo > 0) { this.slowmo -= dt; gdt = dt * 0.3; }
    const fl = this.renderer.post.uniforms.flash;
    if (!this.transitioning && fl.value > 0) fl.value = Math.max(0, fl.value - dt * 1.5);
    const inp = this.input;
    if (inp.just.has('p')) { this.renderer.painterly = !this.renderer.painterly; state.painterly = this.renderer.painterly; ui.toast(`Painterly filter ${this.renderer.painterly ? 'on' : 'off'}`, 1500); }
    if (inp.just.has('n')) { audio.setMuted(!audio.muted); ui.toast(audio.muted ? 'Sound off' : 'Sound on', 1500); }
    const wantJournal = inp.pressed('journal') && this.time > (this.journalBlock || 0);
    if (this.mode === 'land' && this.land) {
      if (inp.pressed('map') && !ui.busy && !this.transitioning && !this.land.cutscene && !this.talking) {
        if (this.land.arena) ui.toast('The grey is all round you. There is no map in here.', 2500);
        else if (this.land.def.waystone) this.land.def.waystone.action();
        else this.toMap();
      }
      if (wantJournal) this.journal();
      this.land.update(gdt);
      if (Math.random() < 0.1) ui.hud('land', { where: LAND_INFO[this.land.id].name });
    } else if (this.mode === 'map' && this.map) {
      if (wantJournal) this.journal();
      this.map.update(dt);
    } else if (this.mode === 'title' && this.map) {
      this.map.update(dt);
      this.cam.goal.x += dt * 0.4;
    }
    this.cam.update(dt);
    inp.endFrame();
    if (this.scene && !skipRender) this.renderer.render(this.scene, this.cam.cam, this.time);
  }
}

const game = new Game();
window.game = game;
window.dbg = { ui, state, audio };
game.title();
if (location.search.includes('dev')) import('./dev.js');
