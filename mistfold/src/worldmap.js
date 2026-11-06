// The world map: floating hex islands over a sea of mist, where keepsakes unfold into lands.
import * as THREE from 'three';
import * as M from './models.js';
import { mulberry32, hashStr, easeOutBack, easeOut, lerp } from './util.js';
import { state, LAND_INFO, KEEPSAKES, KINSHIPS, SETTLERS, HEX_DIRS, landAt, neighbours, effectiveAura, dominant, ELEMENT_INFO, phase, save, settlersIn } from './state.js';
import { PALETTES, makeMistPlane, Particles } from './land.js';
import { miniFor } from './lands.js';
import { audio } from './audio.js';
import { ui, ICONS, elementPips } from './ui.js';

const S = 3.2; // hex size
const SQ3 = Math.sqrt(3);
const MAX_R = 3;
export const hexToWorld = (q, r) => [S * SQ3 * (q + r / 2), S * 1.5 * r];
function worldToHex(x, z) {
  const q = ((SQ3 / 3) * x - (1 / 3) * z) / S, r = ((2 / 3) * z) / S;
  let cx = q, cz = r, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}
const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

export class WorldMap {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.tiles = new Map();
    this.t = 0;
    this.selectedKeepsake = null;
    this.settleMode = null;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9, -9);
    this.hover = null;
    this.busy = false;
  }
  build() {
    const ph = phase();
    const pal = PALETTES[ph];
    this.scene.background = new THREE.Color(pal.bg);
    this.scene.fog = new THREE.Fog(pal.bg, 70, 140);
    this.scene.add(new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiI * 1.05));
    const sun = new THREE.DirectionalLight(pal.sun, pal.sunI);
    sun.position.set(...pal.dir.map((v) => v * 50));
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.game.renderer.setGrade(pal.grade[0], pal.grade[1]);
    this.mist = makeMistPlane(500, pal.mist);
    this.mist.position.y = -6;
    this.scene.add(this.mist);
    this.night = ph === 'night';
    this.fx = new Particles(1200, true); this.scene.add(this.fx.points);
    this.puffs = new Particles(300, false); this.scene.add(this.puffs.points);
    // cloud puffs drifting low over the mist
    this.clouds = [];
    for (let i = 0; i < 18; i++) {
      const r = mulberry32(i * 31);
      const parts = [];
      for (let k = 0; k < 4; k++) parts.push(M.paint(M.xf(M.blobGeo(1.5 + r() * 1.2, i + k, 0.15, 10, 8), [k * 1.6 - 2.4, r() * 0.6, (r() - 0.5) * 1.5], [0, 0, 0], [1, 0.55, 1]), this.night ? 0x6a7098 : 0xfbf6f0, { jitter: 0.05, cool: 0.4 }));
      const c = M.vmesh(parts, { shadow: false });
      c.material = this.cloudMat || (this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: this.night ? 0x202438 : 0x8a8088 }));
      c.position.set((r() - 0.5) * 120, -3.5 - r() * 2, (r() - 0.5) * 120);
      c.userData.speed = 0.6 + r() * 0.8;
      this.scene.add(c); this.clouds.push(c);
    }
    // slots and tiles
    this.slotGroup = new THREE.Group(); this.scene.add(this.slotGroup);
    this.slotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    for (const id of Object.keys(state.placed)) this.addTile(id, false);
    this.refreshSlots();
    // the traveller standing on the current tile
    this.pawn = M.makePlayer();
    this.pawn.scale.setScalar(0.55);
    this.scene.add(this.pawn);
    this.placePawn(state.current, false);
    // the mist-whale
    this.whale = makeWhale();
    this.whale.visible = false;
    this.scene.add(this.whale);
    this.whaleT = 8;
    this.centerCamera(true);
    this.bindDom();
    this.renderTray();
    this.renderSettlerCard();
  }
  addTile(id, animate) {
    const [x, z] = hexToWorld(state.placed[id].q, state.placed[id].r);
    const info = LAND_INFO[id];
    const rng = mulberry32(hashStr(id) + 5);
    const g = new THREE.Group();
    const top = M.paint(M.xf(new THREE.CylinderGeometry(S * 0.96, S * 0.9, 0.7, 6, 1), [0, 0.35, 0]), info.tile, { jitter: 0.12, nscale: 0.8 });
    // darker earth band on the sides
    const band = M.paint(M.xf(new THREE.CylinderGeometry(S * 0.9, S * 0.82, 0.6, 6, 1), [0, -0.25, 0]), id === 'margin' ? 0xe8e0d0 : 0x8a6a52, { jitter: 0.2 });
    const under = M.paint(M.xf(new THREE.ConeGeometry(S * 0.82, 4.2 + rng() * 1.5, 6, 3), [0, -2.65, 0], [Math.PI, 0, 0]), id === 'margin' ? 0xd8d0c0 : 0x9a8470, { jitter: 0.25, cool: 0.6 });
    const bits = [];
    for (let i = 0; i < 4; i++) { const a = rng() * 6.28; bits.push(M.paint(M.xf(new THREE.ConeGeometry(0.4 + rng() * 0.3, 1.5 + rng(), 5), [Math.cos(a) * S * 0.55, -1.2 - rng(), Math.sin(a) * S * 0.55], [Math.PI, 0, 0]), 0x8a7462, { cool: 0.6 })); }
    g.add(M.vmesh([top, band, under, ...bits]));
    const mini = miniFor(id, rng);
    mini.position.y = 0.7;
    g.add(mini);
    // residents' little houses
    settlersIn(id).forEach((s, i) => {
      const h = s.age >= 3 ? ({ flicker: () => M.makeCottage({ lit: true, w: 2.2, d: 2, h: 1.6 }), mumbleroots: () => M.makeMushroomHouse(0xc8553f, true), pockets: () => M.makeShellShop(), bellamy: () => M.makeClockTower(true) })[s.id]() : M.makeTent();
      h.scale.setScalar(0.22); h.position.set(1.6 - i * 0.6, 0.7, 1.2 + i * 0.4); g.add(h);
    });
    g.position.set(x, 0, z);
    this.scene.add(g);
    const tile = { id, group: g, x, z, q: state.placed[id].q, r: state.placed[id].r, t: rng() * 10 };
    // aura motes
    tile.aura = effectiveAura(id);
    this.tiles.set(id, tile);
    if (animate) {
      g.position.y = -14; g.scale.setScalar(0.3); g.rotation.y = Math.PI * 2;
      tile.anim = 0;
    }
    return tile;
  }
  refreshSlots() {
    this.slotGroup.clear();
    this.slots = [];
    const seen = new Set();
    for (const p of Object.values(state.placed)) for (const [dq, dr] of HEX_DIRS) {
      const q = p.q + dq, r = p.r + dr, k = q + ',' + r;
      if (seen.has(k) || landAt(q, r) || hexDist(q, r) > MAX_R) continue;
      seen.add(k);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.88, S * 0.88, 0.06, 6), this.slotMat);
      const [x, z] = hexToWorld(q, r);
      m.position.set(x, 0.1, z);
      m.visible = !!this.selectedKeepsake;
      this.slotGroup.add(m);
      this.slots.push({ q, r, mesh: m });
    }
  }
  placePawn(id, animate) {
    const t = this.tiles.get(id);
    if (!t) return;
    const tx = t.x + 1.0, tz = t.z + 1.4;
    if (!animate) { this.pawn.position.set(tx, 0.72, tz); this.pawn.rotation.y = 0.8; return Promise.resolve(); }
    const sx = this.pawn.position.x, sz = this.pawn.position.z;
    return new Promise((resolve) => {
      let k = 0;
      this.pawnAnim = (dt) => {
        k = Math.min(1, k + dt / 0.9);
        const e = k * k * (3 - 2 * k);
        this.pawn.position.set(lerp(sx, tx, e), 0.72 + Math.sin(e * Math.PI) * 2.5, lerp(sz, tz, e));
        this.pawn.rotation.y = Math.atan2(tx - sx, tz - sz) || 0.8;
        if (k >= 1) { this.pawnAnim = null; resolve(); }
      };
    });
  }
  centerCamera(snap) {
    let cx = 0, cz = 0, n = 0;
    for (const t of this.tiles.values()) { cx += t.x; cz += t.z; n++; }
    cx /= n; cz /= n;
    let maxd = 0;
    for (const t of this.tiles.values()) maxd = Math.max(maxd, Math.hypot(t.x - cx, t.z - cz));
    const cam = this.game.cam;
    cam.viewSize = Math.max(26, maxd * 2 + 18);
    cam.goal.set(cx, 0, cz);
    if (snap) { cam.zoom = cam.zoomGoal = 1; cam.setAspect(cam.aspect); cam.snap(cam.goal); }
  }
  bindDom() {
    const c = this.game.renderer.canvas;
    this.onMove = (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    this.onClick = (e) => { if (e.button === 0 && !ui.busy && this.game.mode === 'map') this.click(); };
    this.onWheel = (e) => { const cam = this.game.cam; cam.zoomGoal = Math.min(1.8, Math.max(0.65, cam.zoomGoal * (e.deltaY > 0 ? 0.9 : 1.1))); };
    this.onKey = (e) => {
      if (this.game.mode !== 'map' || ui.busy) return;
      if (e.key === 'Escape') { this.selectKeepsake(null); this.settleMode = null; this.select(null); this.renderSettlerCard(); }
      if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && this.selected) this.enter(this.selected);
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= state.keepsakes.length) this.selectKeepsake(state.keepsakes[n - 1]);
    };
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerdown', this.onClick);
    c.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('keydown', this.onKey);
  }
  dispose() {
    const c = this.game.renderer.canvas;
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerdown', this.onClick);
    c.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('keydown', this.onKey);
    document.getElementById('maptray').innerHTML = '';
    document.getElementById('mapinfo').classList.remove('show');
    document.getElementById('settlercard').classList.remove('show');
    document.getElementById('maphint').classList.remove('show');
  }
  // ---------- UI ----------
  renderTray() {
    const tray = document.getElementById('maptray');
    if (!state.keepsakes.length) { tray.innerHTML = ''; this.hint(this.settleMode ? '' : 'Click a land to travel there.'); return; }
    tray.innerHTML = `<div class="tray-label">Your satchel</div>` + state.keepsakes.map((k, i) => `<button class="keepsake ${this.selectedKeepsake === k ? 'sel' : ''}" data-k="${k}" title="${KEEPSAKES[k].desc}"><span class="kicon">${ICONS[k]}</span><span class="kname">${KEEPSAKES[k].name}</span><span class="knum">${i + 1}</span></button>`).join('');
    tray.querySelectorAll('.keepsake').forEach((b) => (b.onclick = () => this.selectKeepsake(b.dataset.k === this.selectedKeepsake ? null : b.dataset.k)));
    this.hint(this.selectedKeepsake ? `Choose where to set the <b>${KEEPSAKES[this.selectedKeepsake].name}</b>. Neighbours share their strongest nature.` : 'Pick a keepsake from your satchel, or click a land to travel there.');
  }
  hint(html) { const h = document.getElementById('maphint'); h.innerHTML = html; h.classList.toggle('show', !!html); }
  selectKeepsake(k) {
    if (this.busy) return;
    this.selectedKeepsake = k; this.settleMode = null;
    if (k) { audio.sfx('select'); this.select(null); }
    for (const s of this.slots) s.mesh.visible = !!k;
    if (!k) { this.ghost && this.scene.remove(this.ghost); this.ghost = null; }
    this.renderTray();
    this.renderSettlerCard();
  }
  renderSettlerCard() {
    const el = document.getElementById('settlercard');
    const id = state.pendingSettlers[0];
    if (!id || this.selectedKeepsake) { el.classList.remove('show'); return; }
    const s = SETTLERS[id];
    el.innerHTML = this.settleMode
      ? `<b>${s.name}</b> would like ${s.needText}.<br><small>Lands that suit them are glowing. Click one, or press Esc.</small>`
      : `<b>${s.name}</b> is looking for a home: ${s.needText}. <button id="settlebtn">Choose a land</button>`;
    el.classList.add('show');
    const b = document.getElementById('settlebtn');
    if (b) b.onclick = () => { this.settleMode = id; this.select(null); this.renderSettlerCard(); audio.sfx('select'); if (!this.eligible(id).length) ui.toast(`No land suits ${s.name} yet. Try placing lands so their natures overlap.`, 5000); };
  }
  eligible(sid) {
    const s = SETTLERS[sid];
    return [...this.tiles.keys()].filter((id) => id !== 'margin' && s.need(effectiveAura(id), neighbours(id).length));
  }
  select(id) {
    this.selected = id;
    const el = document.getElementById('mapinfo');
    if (!id) { el.classList.remove('show'); return; }
    const info = LAND_INFO[id], a = effectiveAura(id);
    const res = settlersIn(id).map((s) => SETTLERS[s.id].name);
    const kins = KINSHIPS.filter((k) => state.kinships.includes(k.id) && (k.a === id || k.b === id)).map((k) => k.name);
    el.innerHTML = `<h3>${info.name}</h3><p class="blurb">${info.blurb}</p><div class="pips">${elementPips(a)}</div>${res.length ? `<p class="res">Living here: ${res.join(', ')}</p>` : ''}${kins.length ? `<p class="res">✦ ${kins.join(', ')}</p>` : ''}<button id="enterbtn">${id === state.current ? 'Go back in' : 'Travel here'} <small>(E)</small></button>`;
    el.classList.add('show');
    document.getElementById('enterbtn').onclick = () => this.enter(id);
  }
  async enter(id) {
    if (this.busy) return;
    this.busy = true;
    audio.sfx('select');
    document.getElementById('mapinfo').classList.remove('show');
    await this.placePawn(id, id !== state.current);
    this.game.enterLand(id);
  }
  previewSlot(slot) {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    const el = document.getElementById('mapinfo');
    if (!slot) { if (!this.selected) el.classList.remove('show'); return; }
    const land = KEEPSAKES[this.selectedKeepsake].land;
    const info = LAND_INFO[land];
    const g = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.94, S * 0.88, 0.7, 6), new THREE.MeshBasicMaterial({ color: info.tile, transparent: true, opacity: 0.45, depthWrite: false }));
    const [x, z] = hexToWorld(slot.q, slot.r);
    g.position.set(x, 0.45, z);
    this.scene.add(g); this.ghost = g;
    // what would this land become here?
    const placed = { ...state.placed, [land]: { q: slot.q, r: slot.r } };
    const a = effectiveAura(land, placed);
    const kinHints = KINSHIPS.filter((k) => !state.kinships.includes(k.id) && (k.a === land || k.b === land)).filter((k) => { const other = k.a === land ? k.b : k.a; return neighbours(land, placed).includes(other); });
    const nb = neighbours(land, placed).map((n) => LAND_INFO[n].name);
    el.innerHTML = `<h3>${info.name}</h3><p class="blurb">${info.blurb}</p><div class="pips">${elementPips(a)}</div>${nb.length ? `<p class="res">Beside: ${nb.join(', ')}</p>` : ''}${kinHints.length ? `<p class="kinhint">✦ Something stirs between these places…</p>` : ''}<p class="res"><small>Click to unfold it here.</small></p>`;
    el.classList.add('show');
  }
  click() {
    if (this.busy) return;
    const hit = this.pick();
    if (!hit) return;
    const [q, r] = hit;
    const id = landAt(q, r);
    if (this.selectedKeepsake) {
      const slot = this.slots.find((s) => s.q === q && s.r === r);
      if (slot) this.unfold(this.selectedKeepsake, q, r);
      return;
    }
    if (this.settleMode && id) { this.trySettle(this.settleMode, id); return; }
    if (id) { audio.sfx('select'); if (this.selected === id) this.enter(id); else this.select(id); }
    else this.select(null);
  }
  trySettle(sid, id) {
    const s = SETTLERS[sid];
    if (!this.eligible(sid).includes(id)) {
      audio.sfx('blip', { pitch: 0.6 });
      ui.toast(`${s.name} doesn't think ${LAND_INFO[id].name} quite suits. They'd like ${s.needText}.`, 4500);
      return;
    }
    state.settlers[sid] = { land: id, day: state.day };
    state.pendingSettlers = state.pendingSettlers.filter((k) => k !== sid);
    this.settleMode = null;
    audio.sfx('kinship');
    const t = this.tiles.get(id);
    this.fx.burst(t.x, 1.5, t.z, 50, { color: [0xffe0a0, 0xffffff], size: 0.6, speed: 4, life: 1.5, grav: 1 });
    ui.toast(`🏡 <b>${s.name}</b> will settle in ${LAND_INFO[id].name}. Their home will take shape over the next few days.`, 6000);
    this.scene.remove(t.group); this.tiles.delete(id); this.addTile(id, false);
    save();
    this.renderSettlerCard();
  }
  pick() {
    this.ray.setFromCamera(this.mouse, this.game.cam.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, p)) return null;
    return worldToHex(p.x, p.z);
  }
  async unfold(k, q, r) {
    this.busy = true;
    const land = KEEPSAKES[k].land;
    state.placed[land] = { q, r };
    state.keepsakes = state.keepsakes.filter((x) => x !== k);
    this.selectedKeepsake = null;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    document.getElementById('mapinfo').classList.remove('show');
    for (const s of this.slots) s.mesh.visible = false;
    this.renderTray();
    const tile = this.addTile(land, true);
    audio.sfx('unfold');
    this.game.cam.shake = 0.8;
    // a swirl of light rising out of the mist
    for (let i = 0; i < 80; i++) { const a = Math.random() * 6.28, d = Math.random() * S; this.fx.emit(tile.x + Math.cos(a) * d, -4 + Math.random() * 2, tile.z + Math.sin(a) * d, { vy: 4 + Math.random() * 5, color: [0xfff0b0, 0xffffff, LAND_INFO[land].tile][i % 3], size: 0.5, life: 1.6, grav: 1 }); }
    for (let i = 0; i < 30; i++) this.puffs.emit(tile.x + (Math.random() - 0.5) * S * 2, -1, tile.z + (Math.random() - 0.5) * S * 2, { vy: 1.5, vx: (Math.random() - 0.5) * 2, color: 0xffffff, size: 2.4, life: 2, grav: 0 });
    await new Promise((res) => { tile.onDone = res; });
    this.game.renderer.post.uniforms.flash.value = 0.6;
    ui.titleCard(LAND_INFO[land].name, LAND_INFO[land].blurb);
    // the garden at home knows
    this.refreshSlots();
    // re-evaluate neighbours (their auras changed)
    for (const n of neighbours(land)) { const t = this.tiles.get(n); this.scene.remove(t.group); this.tiles.delete(n); this.addTile(n, false); }
    this.centerCamera(false);
    await this.game.wait(1.6);
    // kinships
    for (const kn of KINSHIPS) {
      if (state.kinships.includes(kn.id)) continue;
      if (!state.placed[kn.a] || !state.placed[kn.b]) continue;
      if (!neighbours(kn.a).includes(kn.b)) continue;
      state.kinships.push(kn.id);
      audio.sfx('kinship');
      this.ribbon(kn.a, kn.b);
      let reward = '';
      if (kn.reward.heart) { state.maxHearts += kn.reward.heart; state.hp = state.maxHearts * 2; reward = '+1 heart'; }
      if (kn.reward.lumen) { state.lumen += kn.reward.lumen; reward = `+${kn.reward.lumen} lumen`; }
      ui.toast(`<div class="kin-title">✦ Kinship: ${kn.name}</div><div>${kn.text}</div><div class="kin-reward">${reward}</div>`, 8000, 'kin');
      await this.game.wait(1.5);
    }
    if (Object.keys(state.placed).length === 2) setTimeout(() => ui.toast('Click the new land to travel there. Lands change as you help the people in them.', 6000), 600);
    save();
    this.busy = false;
    this.renderTray();
    this.renderSettlerCard();
  }
  ribbon(a, b) {
    const A = this.tiles.get(a), B = this.tiles.get(b);
    const col = ELEMENT_INFO[dominant(LAND_INFO[a].aura)].hex;
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      setTimeout(() => {
        const x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t), y = 1.5 + Math.sin(t * Math.PI) * 3;
        this.fx.emit(x, y, z, { color: i % 2 ? col : 0xffffff, size: 0.7, life: 1.8, vy: 0.3, kind: 3 });
      }, i * 25);
    }
  }
  // ---------- frame ----------
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.mist.material.uniforms.uTime.value = t;
    for (const c of this.clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 70) c.position.x = -70; }
    for (const tile of this.tiles.values()) {
      tile.t += dt;
      const g = tile.group;
      if (tile.anim !== undefined) {
        tile.anim = Math.min(1, tile.anim + dt / 1.8);
        const e = easeOutBack(tile.anim);
        g.position.y = lerp(-14, 0, e);
        g.scale.setScalar(lerp(0.3, 1, easeOut(tile.anim)));
        g.rotation.y = (1 - easeOut(tile.anim)) * Math.PI * 2;
        if (Math.random() < 0.6) this.fx.emit(tile.x + (Math.random() - 0.5) * 4, g.position.y - 1, tile.z + (Math.random() - 0.5) * 4, { vy: -1, color: 0xfff0b0, size: 0.35, life: 1, grav: 0 });
        if (tile.anim >= 1) { delete tile.anim; g.rotation.y = 0; if (tile.onDone) tile.onDone(); }
      } else {
        g.position.y = Math.sin(tile.t * 0.6) * 0.18;
      }
      // a few motes in each land's strongest colour
      if (Math.random() < dt * 3) {
        const e = dominant(tile.aura);
        this.fx.emit(tile.x + (Math.random() - 0.5) * S * 1.4, 1 + Math.random(), tile.z + (Math.random() - 0.5) * S * 1.4, { vy: 0.4, color: ELEMENT_INFO[e].hex, size: 0.35, life: 2.5, kind: 3 });
      }
      const lh = tile.group.children[1]?.userData?.lighthouse;
      if (lh && lh.userData.beam) lh.userData.beam.rotation.y += dt * 0.8;
    }
    // pawn idle hop
    if (this.pawnAnim) this.pawnAnim(dt);
    else {
      const cur = this.tiles.get(state.current);
      if (cur) this.pawn.position.y = cur.group.position.y + 0.72 + Math.abs(Math.sin(t * 2)) * 0.05;
    }
    const parts = this.pawn.userData.parts;
    parts.tail.forEach((s, i) => { s.rotation.x = 0.2 + Math.sin(t * 5 - i) * 0.2; });
    // slots pulse
    this.slotMat.opacity = 0.18 + Math.sin(t * 3) * 0.08;
    // hover
    if (!ui.busy && !this.busy) {
      const h = this.pick();
      const key = h ? h.join(',') : null;
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        if (this.selectedKeepsake) this.previewSlot(h && this.slots.find((s) => s.q === h[0] && s.r === h[1]));
        document.body.style.cursor = h && (landAt(...h) || (this.selectedKeepsake && this.slots.find((s) => s.q === h[0] && s.r === h[1]))) ? 'pointer' : 'default';
      }
    }
    // settle mode glow
    if (this.settleMode) {
      const el = this.eligible(this.settleMode);
      for (const id of el) if (Math.random() < dt * 20) { const tl = this.tiles.get(id); const a = Math.random() * 6.28; this.fx.emit(tl.x + Math.cos(a) * S * 0.9, 1, tl.z + Math.sin(a) * S * 0.9, { vy: 1.5, color: 0xffe08a, size: 0.5, life: 1.2, kind: 3 }); }
    }
    // whale
    this.whaleT -= dt;
    if (this.whaleT < 0 && !this.whale.visible) { this.whale.visible = true; this.whale.userData.k = 0; const side = Math.random() > 0.5 ? 1 : -1; this.whale.userData.from = new THREE.Vector3(-60 * side, -4.5, -20 + Math.random() * 30); this.whale.userData.to = new THREE.Vector3(60 * side, -4.5, 10 + Math.random() * 20); }
    if (this.whale.visible) {
      const u = this.whale.userData; u.k += dt / 40;
      this.whale.position.lerpVectors(u.from, u.to, u.k);
      this.whale.position.y = -5 + Math.sin(u.k * Math.PI) * 1.6 + Math.sin(t * 0.8) * 0.3;
      this.whale.lookAt(u.to.x, this.whale.position.y, u.to.z);
      u.tail.rotation.x = Math.sin(t * 1.2) * 0.3;
      if (Math.random() < dt * 0.5) for (let i = 0; i < 12; i++) this.puffs.emit(this.whale.position.x, this.whale.position.y + 2.5, this.whale.position.z, { vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5, color: 0xffffff, size: 0.9, life: 1.6, grav: 2.5 });
      if (u.k >= 1) { this.whale.visible = false; this.whaleT = 50 + Math.random() * 40; }
    }
    // shooting stars at night
    if (this.night && Math.random() < dt * 0.3) { const x = (Math.random() - 0.5) * 60, z = -30 + Math.random() * 10; for (let i = 0; i < 14; i++) this.fx.emit(x + i * 0.5, 14 - i * 0.2, z + i * 0.3, { vx: 12, vy: -3, color: 0xffffff, size: 0.5 - i * 0.02, life: 0.5 + i * 0.03, grav: 0 }); }
    this.fx.update(dt, t); this.puffs.update(dt, t);
    const scale = (innerHeight * this.game.renderer.pixelRatio) / (this.game.cam.viewSize / this.game.cam.zoom);
    this.fx.mat.uniforms.uScale.value = scale; this.puffs.mat.uniforms.uScale.value = scale;
  }
}

function makeWhale() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xe8eef8, transparent: true, opacity: 0.55, emissive: 0x303848, depthWrite: false });
  const body = new THREE.Mesh(M.blobGeo(2, 9, 0.06, 16, 12), mat);
  body.scale.set(1, 0.7, 3.2);
  g.add(body);
  const tail = new THREE.Group(); tail.position.z = -6;
  const fl = new THREE.Mesh(M.G.box(4, 0.15, 1.4), mat); fl.position.z = -0.6; tail.add(fl);
  g.add(tail);
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(M.G.box(2.2, 0.12, 0.9), mat); fin.position.set(s * 2.2, -0.6, 1.5); fin.rotation.z = s * -0.5; g.add(fin); }
  g.userData.tail = tail;
  return g;
}
