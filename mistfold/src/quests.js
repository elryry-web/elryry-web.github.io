// The errands that aren't fights: catch-glasses, lamp-talk, critics, windfalls, call slips, walking shelves, a lullaby and moss-lambs.
// Each one is set up from its land's build() and keeps its own little state machine in an updater.
import * as THREE from 'three';
import * as M from './models.js';
import { state, flag, setFlag } from './state.js';
import { audio } from './audio.js';
import { ui } from './ui.js';

const FACE = Math.PI / 4;
const DIRS = (k) => [Math.sin((k * Math.PI) / 4), Math.cos((k * Math.PI) / 4)];
const idle = (L) => !ui.busy && !L.game.transitioning && !L.game.talking && !L.cutscene;
const near = (L, x, z, r) => Math.hypot(L.player.x - x, L.player.z - z) < r;

// a ray of painted light from a to b, as a bright core and a soft halo
function beam(color = 0xfff0b0) {
  const g = new THREE.Group();
  for (const [w, o] of [[0.14, 0.75], [0.55, 0.16]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(m);
  }
  return g;
}
function aimBeam(g, a, b) {
  const len = a.distanceTo(b);
  g.position.copy(a).lerp(b, 0.5);
  g.children.forEach((m) => m.scale.set(1, 1, len));
  g.lookAt(b);
}
// a little scene that runs while the dialogue box is up
async function scene(L, fn) {
  const g = L.game;
  if (g.talking) return;
  g.talking = true;
  try { await fn(g.dialogCtx({ name: '', voice: { pitch: 1.6, wave: 'sine' } })); } catch (e) { console.error(e); }
  ui.closeDialog();
  g.talking = false;
  g.interactCooldown = 0.4;
}

// ================================================================ SALTGLASS SHORE
// The lamp was never oil. Tobiah set catch-glasses down the beach to carry the evening sun up to it,
// and the crabs have been turning them about to look at themselves.
const DISH = { x: -8, z: 7, k: 2 };
const GLASSES = [{ x: -1, z: 7, want: 4, start: 1 }, { x: -1, z: 0, want: 3, start: 6 }, { x: 5, z: -6, want: 4, start: 1 }];
const TOWER = { x: 5, z: -12.5 };
function makeCatchGlass() {
  const g = new THREE.Group();
  g.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.07, 0.1, 1.5, 6), [0, 0.75, 0]), 0x6a5a4a), M.paint(M.xf(M.G.box(0.55, 0.14, 0.55), [0, 0.07, 0]), 0x8a8478)]));
  const head = new THREE.Group(); head.position.y = 1.55; g.add(head);
  head.add(M.vmesh([M.paint(M.G.tor(0.42, 0.07, 6, 18), 0xc8a050, { jitter: 0.05 }), M.paint(M.xf(M.G.cone(0.08, 0.22, 5), [0, 0.55, 0]), 0xc8a050)], { shadow: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: 0xbcd4e0, side: THREE.DoubleSide }));
  head.add(disc);
  g.userData.head = head; g.userData.disc = disc;
  return g;
}
export function catchGlasses(L, { lit, onLight }) {
  const y = (x, z) => L.heightAt(x, z) + 1.55;
  // the dish that holds the day's sun
  const dish = new THREE.Group();
  dish.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.1, 0.14, 1.4, 6), [0, 0.7, 0]), 0x6a5a4a), M.paint(M.xf(new THREE.SphereGeometry(0.75, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), [0, 1.55, 0], [-Math.PI / 2, 0, 0], [1, 0.5, 1]), 0xd8a848, { jitter: 0.06 })]));
  const sun = M.glow(0xffd870, 2.6, 0.9); sun.position.set(0, 1.55, 0.25); dish.add(sun);
  L.place(dish, DISH.x, DISH.z, { r: 0.5, rot: Math.PI / 2 });
  L.interact({ x: DISH.x, z: DISH.z, r: 1.6, label: 'Look at the brass dish', action: () => L.game.narrate('A brass dish, warm to the touch, holding a puddle of sun the way a bowl holds rain. It pours its light east, along the beach, to whatever will catch it.') });
  const gl = GLASSES.map((d) => {
    const obj = makeCatchGlass();
    L.place(obj, d.x, d.z, { r: 0.35, rot: 0 });
    const s = { ...d, obj, k: lit ? d.want : flag('shore.glassk' + GLASSES.indexOf(d)) ?? d.start };
    obj.userData.head.rotation.y = (s.k * Math.PI) / 4;
    return s;
  });
  const lampY = L.lighthouse.position.y + L.lighthouse.userData.lampY;
  let beams = [], reached = lit;
  const lampGlow = M.glow(0xfff1b8, 4, 0); lampGlow.position.set(TOWER.x, lampY, TOWER.z); L.scene.add(lampGlow);
  function trace() {
    beams.forEach((b) => L.scene.remove(b)); beams = [];
    gl.forEach((g) => g.obj.userData.disc.material.color.setHex(0xbcd4e0));
    let x = DISH.x, z = DISH.z, k = DISH.k, hit = false;
    const pts = [new THREE.Vector3(x, y(x, z), z)], seen = new Set();
    for (let step = 0; step < 6; step++) {
      const [dx, dz] = DIRS(k);
      let best = null, bt = 16;
      for (const g of gl) {
        if (seen.has(g)) continue;
        const ox = g.x - x, oz = g.z - z, t = ox * dx + oz * dz;
        if (t > 0.5 && t < bt && Math.abs(ox * dz - oz * dx) < 0.7) { bt = t; best = g; }
      }
      const ox = TOWER.x - x, oz = TOWER.z - z, t = ox * dx + oz * dz;
      if (t > 0.5 && t < bt && Math.abs(ox * dz - oz * dx) < 1.6) { pts.push(new THREE.Vector3(TOWER.x, lampY, TOWER.z)); hit = true; break; }
      if (!best) { pts.push(new THREE.Vector3(x + dx * bt, y(x, z), z + dz * bt)); break; }
      seen.add(best); best.obj.userData.disc.material.color.setHex(0xfff4c8);
      x = best.x; z = best.z; k = best.k;
      pts.push(new THREE.Vector3(x, y(x, z), z));
    }
    for (let i = 0; i < pts.length - 1; i++) { const b = beam(); aimBeam(b, pts[i], pts[i + 1]); L.scene.add(b); beams.push(b); }
    lampGlow.material.opacity = hit ? 0.9 : 0;
    return hit;
  }
  trace();
  L.updaters.push((dt, t) => { const k = 0.85 + Math.sin(t * 3) * 0.15; beams.forEach((b) => (b.children[1].material.opacity = 0.16 * k)); sun.material.opacity = 0.75 + Math.sin(t * 2) * 0.15; });
  if (lit) return;
  gl.forEach((g, i) => L.interact({ x: g.x, z: g.z, r: 1.5, label: 'Turn the catch-glass', action: () => {
    g.k = (g.k + 1) % 8; setFlag('shore.glassk' + i, g.k);
    const from = g.obj.userData.head.rotation.y, to = (g.k * Math.PI) / 4 + (g.k === 0 ? Math.PI * 2 : 0);
    L.game.tween(0.25, (e) => (g.obj.userData.head.rotation.y = from + (to - from) * e)).then(() => { g.obj.userData.head.rotation.y = (g.k * Math.PI) / 4; });
    audio.sfx('clink'); audio.sfx('blip', { pitch: 0.7 + g.k * 0.05, wave: 'sine' });
    L.game.tip('glass', 'Each glass throws the light the way it faces. Follow the beam from the brass dish.', 5000);
    if (trace() && !reached) { reached = true; onLight(); }
  } }));
}

// Lamp-talk: a light out on the water flashes short and long, and you answer it. Tap for short, hold for long.
const SIGNALS = ['.-.', '-..-', '.--..'];
const SHORT = 0.28, LONG = 0.8;
export function lampTalk(L, { x, z, far, onRound }) {
  const post = M.makeLamppost(false, 0xfff1b8);
  L.place(post, x, z, { r: 0.25, rot: FACE });
  const mine = M.glow(0xfff1b8, 2.4, 0); mine.position.set(x, L.heightAt(x, z) + 2.4, z); L.scene.add(mine);
  const them = M.glow(0xfff1b8, 3.2, 0.12); them.position.set(far[0], 1.4, far[1]); L.scene.add(them);
  const S = { mode: 'off', round: flag('shore.talk') || 0, show: [], t: 0, entered: '', fails: 0, down: null, quiet: 0, since: 0 };
  const show = (delay = 0.9) => {
    S.mode = 'show'; S.t = -delay; S.entered = '';
    let at = 0; S.show = [];
    for (const c of SIGNALS[S.round]) { const d = c === '.' ? SHORT : LONG; S.show.push([at, at + d]); at += d + 0.4; }
    S.end = at + 0.4;
  };
  const stop = () => { S.mode = 'off'; L.cutscene = false; ui.timer(null); mine.material.opacity = 0; L.game.interactCooldown = 0.4; };
  const pretty = (s) => s.replace(/\./g, '•').replace(/-/g, '—');
  L.interact({ x, z, r: 1.6, label: 'Take up the signal lamp', enabled: () => S.mode === 'off' && S.round < SIGNALS.length, action: () => {
    L.cutscene = true; S.since = L.t; S.fails = 0;
    audio.sfx('open');
    L.game.tip('lamptalk', 'Watch the far light. Then answer it: <b>tap</b> attack for a short flash, <b>hold</b> it for a long one. <b>E</b> puts the lamp down.', 7000);
    show(1.2);
  } });
  L.updaters.push((dt) => {
    if (S.mode === 'off') { them.material.opacity = 0.1 + Math.random() * 0.03; return; }
    if (ui.busy || L.game.transitioning) return;
    const inp = L.game.input;
    if (L.t - S.since > 0.3 && (inp.pressed('interact') || inp.pressed('dash'))) { stop(); return; }
    S.t += dt;
    if (S.mode === 'show') {
      const on = S.show.some(([a, b]) => S.t >= a && S.t < b);
      them.material.opacity = on ? 1 : 0.1;
      ui.timer(`💡 Watch the far light… <b>${S.round + 1}/${SIGNALS.length}</b>`);
      if (S.t > S.end) { S.mode = 'listen'; S.quiet = 0; S.down = null; }
      return;
    }
    if (S.mode === 'pause') { ui.timer('💡 …'); if (S.t > 0) S.round < SIGNALS.length ? show(0.2) : stop(); return; }
    // listening: time each press of the attack button
    const held = inp.held('attack');
    if (held && S.down == null) { S.down = S.t; audio.sfx('blip', { pitch: 1.4, wave: 'sine' }); }
    mine.material.opacity = held ? 1 : 0;
    if (!held && S.down != null) {
      const sym = S.t - S.down < 0.38 ? '.' : '-';
      S.down = null; S.quiet = 0; S.entered += sym;
      const want = SIGNALS[S.round];
      if (!want.startsWith(S.entered)) {
        S.fails++;
        audio.sfx('blip', { pitch: 0.4, wave: 'square' });
        ui.toast(S.fails >= 2 ? `The far light waits, then says it again, slowly. <b>${pretty(want)}</b>` : 'The far light waits, then says it again, patiently.', 3500);
        S.mode = 'pause'; S.t = -1.2;
        return;
      }
      if (S.entered === want) {
        S.round++; S.fails = 0;
        setFlag('shore.talk', S.round);
        audio.sfx('kinship');
        L.fx.burst(far[0], 1.4, far[1], 30, { color: [0xfff1b8, 0xffffff], size: 0.6, speed: 3, life: 1.4, grav: -0.5 });
        S.mode = 'pause'; S.t = -2;
        onRound(S.round);
        return;
      }
    }
    if (S.down == null) S.quiet += dt;
    if (S.entered && S.quiet > 4) { S.mode = 'pause'; S.t = -0.5; }
    ui.timer(`💡 Answer it: <b>${pretty(S.entered) || '…'}</b> <span class="hint">tap • · hold —</span>`);
  });
  return S;
}

// ================================================================ LANTERN ORCHARD
// The critics sit together in the dead tree with the stolen words. You can't fight a critic.
// You can only catch one off guard: creep up while they preen, and keep still when they look.
const SHOO = [
  '"We SAW that," says a critic. The whole tree flaps at you.',
  '"Derivative," says one. "Clumsy," says another. A gust of wings pushes you back.',
  '"Approaching a critic? Bold. Unearned." They flap until you retreat.',
  '"Too eager." "Far too eager." The tree shrieks with wings.',
];
export function critics(L, { x, z }) {
  const tree = M.makeTree(L.rng, { kind: 'dead', trunk: 0x6a5a4a, size: 1.5 });
  L.place(tree, x, z, { r: 0.6, rot: FACE });
  const birds = [[-0.7, 2.6, 0.2], [0.6, 3.1, -0.3], [0.1, 3.7, 0.4]].map(([bx, by, bz], i) => {
    const b = M.makeEnemy('jackdaw');
    b.position.set(x + bx, L.heightAt(x, z) + by - 1.1, z + bz);
    L.scene.add(b);
    return b;
  });
  const words = [0, 1, 2].filter((i) => !flag('orchard.word' + i));
  const eye = M.glow(0xff8a6a, 2, 0); eye.position.set(x, L.heightAt(x, z) + 4.6, z); L.scene.add(eye);
  const S = L.critics = { mode: 'preen', t: 2.5, shoos: 0, done: !words.length, lx: null, lz: null };
  const sees = () => {
    const p = L.player, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    // a tree trunk between you and them hides you
    for (const c of L.colliders) {
      if (c.r < 0.5 || (c.x === x && c.z === z)) continue;
      const t = ((c.x - x) * dx + (c.z - z) * dz) / (d * d);
      if (t <= 0 || t >= 1) continue;
      if (Math.hypot(x + dx * t - c.x, z + dz * t - c.z) < c.r * 0.9) return false;
    }
    return true;
  };
  L.updaters.push((dt, t) => {
    const p = L.player, d = Math.hypot(p.x - x, p.z - z);
    birds.forEach((b, i) => {
      const at = Math.atan2(p.x - b.position.x, p.z - b.position.z);
      const want = S.done || S.mode === 'preen' ? at + Math.PI + Math.sin(t * 1.3 + i * 2) * 0.6 : at;
      b.rotation.y += (Math.atan2(Math.sin(want - b.rotation.y), Math.cos(want - b.rotation.y))) * Math.min(1, dt * (S.mode === 'watch' ? 14 : 4));
      const bob = S.mode === 'preen' || S.done ? Math.abs(Math.sin(t * 5 + i)) * 0.35 : 0;
      b.userData.parts.body.rotation.x = bob;
      b.userData.parts.wings.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * (S.flap > 0 ? Math.sin(t * 30) * 0.9 : 0.1)));
    });
    S.flap = Math.max(0, (S.flap || 0) - dt);
    if (S.done || !idle(L)) { if (S.done) ui.timer(null); return; }
    const moved = S.lx != null && Math.hypot(p.x - S.lx, p.z - S.lz) / Math.max(dt, 1e-3) > 0.6;
    S.lx = p.x; S.lz = p.z;
    const close = d < 16;
    S.t -= dt;
    if (S.mode === 'preen' && S.t <= 0) { S.mode = 'tell'; S.t = 0.65; if (close) audio.sfx('blip', { pitch: 0.5, wave: 'square' }); }
    else if (S.mode === 'tell' && S.t <= 0) { S.mode = 'watch'; S.t = 1.8 + Math.random() * 1.2; }
    else if (S.mode === 'watch' && S.t <= 0) { S.mode = 'preen'; S.t = 1.6 + Math.random() * 1.6; }
    eye.material.opacity = S.mode === 'watch' ? 0.85 : S.mode === 'tell' ? 0.35 : 0;
    if (!close) { ui.timer(null); return; }
    ui.timer(S.mode === 'watch' ? '👁 The critics are <b>watching</b>. Keep still.' : S.mode === 'tell' ? '🐦 A critic lifts its head…' : '🐦 The critics are preening. <b>Creep closer.</b>');
    L.game.tip('critics', 'Move while the critics preen. Freeze when they look up. A tree trunk between you and them hides you.', 6000);
    if (S.mode === 'watch' && moved && d > 1.6 && sees()) {
      S.flap = 0.8; S.mode = 'preen'; S.t = 2.2;
      audio.sfx('blip', { pitch: 0.6, wave: 'square' }); audio.sfx('dash');
      const a = Math.atan2(p.z - z, p.x - x);
      p.knock = { x: Math.cos(a) * 34, z: Math.sin(a) * 34 };
      L.dust.burst(p.x, L.heightAt(p.x, p.z) + 0.8, p.z, 18, { color: [0x3a3a4a, 0x5a5a6a], size: 0.4, speed: 4, life: 0.7 });
      ui.toast(SHOO[S.shoos++ % SHOO.length], 3500);
      return;
    }
    if (d < 2.2) {
      // caught them off guard
      S.done = true; S.flap = 1.4;
      ui.timer(null); eye.material.opacity = 0;
      audio.sfx('poof');
      L.game.cam.shake = 0.4;
      words.forEach((i, k) => {
        const a = FACE + (k - 1) * 0.9;
        L.pickup(M.makeLetterGlyph(0xffe0a0), x + Math.sin(a) * 1.6, z + Math.cos(a) * 1.6, () => {
          setFlag('orchard.word' + i); audio.sfx('item');
          const n = [0, 1, 2].filter((j) => flag('orchard.word' + j)).length;
          ui.toast(`✦ A lost word: <i>“${['ember', 'after', '…'][i]}”</i> <b>${n}/3</b>${n === 3 ? ' — Sir Thimble will want these.' : ''}`);
        }, { y: 0.6, delay: 0.4 });
      });
      ui.toast('The critics leap up in a clatter. "We were only BORROWING them!" Three words flutter down.', 4500);
    }
  });
}

// Windfalls: shake the old tree and catch the lantern-apples before they bruise. Six good ones will do.
export function windfalls(L, { x, z, onDone }) {
  const t = M.makeTree(L.rng, { kind: 'round', leaf: 0x7a9a4a, size: 1.6, fruit: 0xffc860, fruitGlow: true });
  const gl = M.glow(0xffc860, 4.4, 0.35); gl.position.y = 3.2; t.add(gl);
  L.place(t, x, z, { r: 0.9, sway: true });
  // so it stands out among all the other glowing trees: a basket at its foot, and an apple bobbing over it while it's ready
  const basket = M.vmesh([M.paint(M.xf(M.G.cyl(0.42, 0.3, 0.38, 10), [0, 0.19, 0]), 0xb8864a, { jitter: 0.15 }), M.paint(M.xf(M.G.tor(0.4, 0.05, 4, 12), [0, 0.38, 0], [Math.PI / 2, 0, 0]), 0x8a5a2a), M.paint(M.xf(M.G.tor(0.36, 0.035, 4, 10, Math.PI), [0, 0.4, 0]), 0x8a5a2a)]);
  L.place(basket, x + 1.3, z + 0.9, { rot: 0.4 });
  const marker = M.makeLanternApple(); marker.scale.setScalar(1.6); L.scene.add(marker);
  const S = { on: false, cool: 0, falling: [], left: 0, caught: 0, next: 0, regrow: false };
  const NEED = 6, TOTAL = 10;
  const ready = () => !S.on && S.cool <= 0 && !flag('orchard.windfalls');
  const shake = () => {
    if (!ready()) return;
    S.on = true; S.left = TOTAL; S.caught = 0; S.next = 0.6;
    t.rotation.z = 0.15; L.game.tween(0.8, (k) => (t.rotation.z = Math.sin(k * 20) * 0.15 * (1 - k)));
    L.dust.burst(x, L.heightAt(x, z) + 3, z, 20, { color: [0x7a9a4a, 0xa8c060], size: 0.35, speed: 2.5, life: 1.2, grav: 2 });
    audio.sfx('blip', { pitch: 1.8, wave: 'sine' });
    L.game.tip('windfall', 'Stand in the shadow of a falling apple to catch it. Dash if you must.', 5000);
  };
  L.interact({ x, z, r: 2.2, label: 'Shake the old tree', enabled: ready, action: shake });
  // a good knock with your stick does it too
  L.hittable({ x, z, r: 0.9, soft: true, onHit: shake });
  L.updaters.push((dt, time) => {
    S.cool -= dt;
    marker.visible = ready();
    marker.position.set(x, L.heightAt(x, z) + 5.2 + Math.sin(time * 2) * 0.2, z);
    marker.rotation.y = time;
    if (S.regrow && S.cool <= 0) { S.regrow = false; audio.sfx('pickup'); ui.toast('The old tree has filled up with lantern-apples again. Give it another shake.', 3500); }
    if (!S.on || !idle(L)) return;
    S.next -= dt;
    if (S.left > 0 && S.next <= 0) {
      const pair = S.left <= 5 && Math.random() < 0.5;
      for (let n = 0; n < (pair ? 2 : 1) && S.left > 0; n++) {
        let ax = x, az = z;
        for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, r = 1.8 + Math.random() * 3.4; ax = x + Math.cos(a) * r; az = z + Math.sin(a) * r; if (L.walkable(ax, az, 0.3)) break; }
        const apple = M.makeLanternApple(); L.scene.add(apple);
        const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x2a1e18, transparent: true, opacity: 0.4, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.set(ax, L.heightAt(ax, az) + 0.05, az); L.scene.add(sh);
        S.falling.push({ x: ax, z: az, t: 0, dur: 1.5 - Math.min(0.4, (TOTAL - S.left) * 0.04), apple, sh });
        S.left--;
      }
      S.next = 0.85 + Math.random() * 0.45;
    }
    for (const f of [...S.falling]) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), gy = L.heightAt(f.x, f.z);
      f.apple.position.set(f.x, gy + 0.4 + (1 - k * k) * 5, f.z);
      f.sh.scale.setScalar(0.3 + k * 0.7);
      if (k < 1) continue;
      L.scene.remove(f.apple); L.scene.remove(f.sh); S.falling.splice(S.falling.indexOf(f), 1);
      if (near(L, f.x, f.z, 1.0)) {
        S.caught++; audio.sfx('pickup');
        L.fx.burst(f.x, gy + 1, f.z, 12, { color: [0xffd27a, 0xffffff], size: 0.35, speed: 2, life: 0.7, grav: -0.5 });
      } else {
        audio.sfx('blip', { pitch: 0.5, wave: 'triangle' });
        L.dust.burst(f.x, gy + 0.2, f.z, 10, { color: [0xffc860, 0xc8803a], size: 0.3, speed: 2, life: 0.6, grav: 4 });
      }
    }
    ui.timer(`🍎 <b>${S.caught}</b> caught, ${NEED} needed · ${S.left + S.falling.length} still up there`);
    if (!S.left && !S.falling.length) {
      S.on = false; S.cool = 3; ui.timer(null);
      if (S.caught >= NEED) { setFlag('orchard.windfalls'); audio.sfx('item'); ui.toast(`✦ <b>${S.caught}</b> unbruised windfalls. Take them to the tiny red door at the foot of a tree on the far side of the orchard from the windmill. Follow the floating apple.`, 6000); onDone && onDone(); }
      else { S.regrow = true; ui.toast(`${S.caught === 1 ? 'Only one good one' : `Only ${S.caught} good ones`}, and you need six. The rest are bruised. The tree is already growing more.`, 4000); }
    }
  });
}

// ================================================================ THE HOLLOW ARCHIVE
// Quillon has forgotten what his books are called, but not what they were like to read.
// He writes what he remembers on a call slip, and you find the book that matches by reading how each one begins.
export const BOOKS = {
  rains: { title: 'The Book of Small Rains', cover: 0x5a7a9a, first: 'It rained on the small ones first: the moss, the ants, the inside of a thimble somebody left out on the step.', wrong: 'Oh, the Book of Small Rains. I used to read it at the window. It isn\'t the one I wrote down, though.' },
  atlas: { title: 'Arabella\'s Atlas', cover: 0x9a6a3a, first: 'This is a map of everywhere I meant to go. I have coloured them all in anyway.', wrong: 'Arabella\'s Atlas. She never went to any of it, you know. Not the one I meant. Lovely, though.' },
  soup: { title: 'Soup for One', cover: 0xb85a4a, first: 'Begin with an onion, and with being on your own. Both are easier than they look, and both make you cry a little at first.', wrong: 'Soup for One. I know this one far too well. It isn\'t the one on the slip, I don\'t think.' },
  ladders: { title: 'A Treatise on Ladders', cover: 0x6a8a4a, first: 'Every ladder is a promise that up is somewhere. Most of them keep it.', wrong: 'A Treatise on Ladders! I\'d forgotten that I\'d forgotten this. It isn\'t the one, though. Put it with the others.' },
  knots: { title: 'Ninety-Nine Knots', cover: 0x8a6a9a, first: 'A knot is only a rope that has made up its mind.', wrong: 'Ninety-Nine Knots. There are ninety-eight, I counted once. No, not this one.' },
  ferry: { title: 'The Long Way Round', cover: 0x3a6a6a, first: 'The ferryman\'s daughter never once took the bridge, though it was right there, and dry.', wrong: 'The Long Way Round. A sad book with a nice boat in it. Not the one on the slip, reader.' },
};
export const SLIPS = [
  { book: 'rains', text: 'The one about weather. Only the small weather, mind, the kind that happens to beetles. It made me want to stand at a window.' },
  { book: 'atlas', text: 'A book full of places that nobody went to. It isn\'t sad, exactly. It\'s more the opposite of sad, only facing the same way.' },
  { book: 'soup', text: 'A cookery book. The loneliest one there is. I think I read it every evening, for the company, which is the joke of it.' },
];
const LECTERNS = [['atlas', -2, -9], ['ladders', 5.5, -9.5], ['rains', -10, -5], ['knots', 9.5, -4.5], ['soup', -6, 10], ['ferry', 2, -7]];
function makeLectern(cover) {
  const g = new THREE.Group();
  g.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.08, 0.12, 1.1, 6), [0, 0.55, 0]), 0x5e4334), M.paint(M.xf(M.G.box(0.6, 0.1, 0.5), [0, 0.05, 0]), 0x5e4334), M.paint(M.xf(M.G.box(0.7, 0.06, 0.55), [0, 1.15, 0], [-0.45, 0, 0]), 0x6a4a36)]));
  const book = M.vmesh([M.paint(M.xf(M.G.box(0.62, 0.05, 0.44), [0, 1.22, 0.02], [-0.45, 0, 0]), cover), M.paint(M.xf(M.G.box(0.27, 0.04, 0.4), [-0.15, 1.25, 0.02], [-0.45, 0, 0.06]), 0xf3ead6), M.paint(M.xf(M.G.box(0.27, 0.04, 0.4), [0.15, 1.25, 0.02], [-0.45, 0, -0.06]), 0xf3ead6)], { shadow: false });
  g.add(book); g.userData.book = book;
  return g;
}
export function callSlips(L) {
  L.lecterns = LECTERNS.map(([id, lx, lz]) => {
    const [x, z] = L.nearestWalkable(lx, lz, 0.6);
    const g = makeLectern(BOOKS[id].cover);
    L.place(g, x, z, { r: 0.4, rot: FACE });
    const s = { id, x, z, obj: g };
    L.interact({ x, z, r: 1.5, label: () => (L.carrying ? 'Put the book back' : 'Read the open book'), enabled: () => !L.carrying || L.carrying.id === id, action: () => readLectern(L, s) });
    return s;
  });
}
async function readLectern(L, s) {
  if (L.carrying) { putBack(L); audio.sfx('close'); return; }
  const b = BOOKS[s.id];
  await scene(L, async (D) => {
    await D.narrate(`The book is open at the first page. It begins: “${b.first}”`);
    const c = await D.choose(['Take it to Quillon', 'Leave it open']);
    if (c !== 0) return;
    s.obj.userData.book.visible = false;
    const held = M.makeColorBook(b.cover); held.position.set(0, 2.1, 0); L.pObj.add(held);
    L.carrying = { id: s.id, held, from: s };
    audio.sfx('pickup');
  });
}
export function putBack(L) {
  const c = L.carrying; if (!c) return;
  L.pObj.remove(c.held); c.from.obj.userData.book.visible = true; L.carrying = null;
}

// The shelves walked in the night, as they do when nobody reads them. Shove them back onto their footprints.
// A small grid: columns along x, rows along z. Solvable in ten shoves.
const SH = { cols: 5, rows: 4, x0: -4, z0: 4, dx: 2, dz: 1.5, excl: ['0,0', '4,3'], pillar: [2, 1], start: [[3, 2], [1, 3], [1, 0]], goals: [[0, 2], [4, 0], [4, 2]] };
const cellX = (c) => SH.x0 + c * SH.dx, cellZ = (r) => SH.z0 + r * SH.dz;
export function walkingShelves(L, { onDone }) {
  const onBoard = (c, r) => c >= 0 && r >= 0 && c < SH.cols && r < SH.rows && !SH.excl.includes(c + ',' + r);
  // footprints in the dust
  const fp = new THREE.MeshBasicMaterial({ color: 0x6a5a4a, transparent: true, opacity: 0.45, depthWrite: false });
  for (const [c, r] of SH.goals) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.7), fp); m.rotation.x = -Math.PI / 2; m.position.set(cellX(c), L.heightAt(cellX(c), cellZ(r)) + 0.03, cellZ(r)); L.scene.add(m); }
  const pil = M.vmesh([0, 1, 2, 3, 4].map((i) => M.paint(M.xf(M.G.box(0.6 - i * 0.04, 0.16, 0.45), [0, 0.08 + i * 0.16, 0], [0, i * 0.4, 0]), [0x8a3b3b, 0x3b5a8a, 0x5c7a3a, 0xc9a24a, 0x6a4a7a][i])));
  L.place(pil, cellX(SH.pillar[0]), cellZ(SH.pillar[1]), { r: 0.45, rot: 0.3 });
  const shelves = SH.start.map(([c, r], i) => {
    const obj = M.makeBookshelf(L.rng, 2.3);
    L.place(obj, cellX(c), cellZ(r), { rot: 0 });
    const cols = [-0.55, 0.55].map((o) => { const k = { x: cellX(c) + o, z: cellZ(r), r: 0.5, o }; L.colliders.push(k); return k; });
    const s = { i, c, r, obj, cols, moving: false };
    s.h = L.hittable({ x: cellX(c), z: cellZ(r), r: 1.0, soft: true, onHit: () => shove(s) });
    return s;
  });
  let solved = false;
  const at = (c, r) => shelves.find((s) => s.c === c && s.r === r) || (c === SH.pillar[0] && r === SH.pillar[1]);
  function move(s, c, r, dur) {
    const fx = s.obj.position.x, fz = s.obj.position.z, tx = cellX(c), tz = cellZ(r);
    s.c = c; s.r = r; s.moving = true;
    s.cols.forEach((k) => { k.x = tx + k.o; k.z = tz; });
    s.h.x = tx; s.h.z = tz;
    return L.game.tween(dur, (e) => { s.obj.position.x = fx + (tx - fx) * e; s.obj.position.z = fz + (tz - fz) * e; s.obj.position.y = L.heightAt(s.obj.position.x, s.obj.position.z) - 0.05; }).then(() => { s.moving = false; });
  }
  function shove(s) {
    if (solved || s.moving) return;
    const p = L.player;
    // only the nearest shelf in front of you moves, even if the swing caught two
    const ax = Math.sin(p.face), az = Math.cos(p.face);
    const dist = (k) => Math.hypot(k.obj.position.x - p.x, k.obj.position.z - p.z);
    const front = shelves.filter((k) => { const d = dist(k); return d <= 1 || ((k.obj.position.x - p.x) * ax + (k.obj.position.z - p.z) * az) / d >= 0.1; });
    if (front.reduce((a, b) => (dist(b) < dist(a) ? b : a), s) !== s) return;
    const gx = (s.obj.position.x - p.x) / SH.dx, gz = (s.obj.position.z - p.z) / SH.dz;
    const [dc, dr] = Math.abs(gx) > Math.abs(gz) ? [Math.sign(gx), 0] : [0, Math.sign(gz)];
    const c = s.c + dc, r = s.r + dr;
    L.game.tip('shelves', 'Strike a shelf to shove it away from you. They only go in straight lines. The sign by the desk starts them over.', 6000);
    if (!onBoard(c, r) || at(c, r)) { audio.sfx('door'); L.game.cam.shake = 0.15; return; }
    audio.sfx('door'); audio.sfx('blip', { pitch: 0.5, wave: 'triangle' });
    L.dust.burst(s.obj.position.x, L.heightAt(s.obj.position.x, s.obj.position.z) + 0.2, s.obj.position.z, 12, { color: [0xc8b8a0, 0x9a8a78], size: 0.4, speed: 1.5, life: 0.8 });
    move(s, c, r, 0.3).then(check);
  }
  function check() {
    const home = shelves.filter((s) => SH.goals.some(([c, r]) => c === s.c && r === s.r)).length;
    if (home < 3 || solved) return;
    solved = true;
    setFlag('archive.shelves');
    audio.sfx('restore');
    for (const s of shelves) L.fx.burst(s.obj.position.x, L.heightAt(s.obj.position.x, s.obj.position.z) + 1.6, s.obj.position.z, 20, { color: [0xfff0c0, 0xc8e8a8], size: 0.4, speed: 2, life: 1.2, grav: -0.6 });
    ui.toast('The shelves settle onto their footprints with a long, wooden sigh, like old men sitting down.', 5000);
    onDone && onDone();
  }
  L.place(M.makeSignpost(L.rng), 1.5, 2.4, { r: 0.2, rot: 0.4 });
  L.interact({ x: 1.5, z: 2.4, r: 1.5, label: 'Read the sign', enabled: () => !solved, action: async () => {
    await L.game.narrate('A sign, newly chalked: SHELVES WILL RETURN TO THEIR PLACES WHEN ASKED NICELY. You ask nicely. The shelves shuffle back to where they were standing when you came in.');
    shelves.forEach((s) => move(s, SH.start[s.i][0], SH.start[s.i][1], 0.6));
  } });
}

// ================================================================ UMMOTH'S REST
// The stones only sing the song if it's played to them in order. Ummoth hums the start of it; you find the notes.
export const PHRASE = [196, 247, 294, 247, 196];
const BAR = { 196: '▁', 247: '▄', 294: '█' };
export const phraseBars = (n = -1) => PHRASE.map((f, i) => (n < 0 || i < n ? BAR[f] : '·')).join(' ');
export async function hum(L, head) {
  const m = head.userData.mouth.getWorldPosition(new THREE.Vector3());
  audio.duck(0.3);
  ui.toast(`Ummoth hums: <b class="bars">${phraseBars()}</b>`, 5500);
  for (const f of PHRASE) {
    audio.sfx('stone', { freq: f / 2 });
    L.fx.burst(m.x, m.y + 0.5, m.z, 10, { color: 0x9ff2e0, size: 0.6 + (f - 196) / 160, speed: 1.5, life: 1.4, grav: -1.2 });
    L.game.cam.shake = 0.15;
    await L.game.wait(0.6);
  }
  audio.duck(1);
}

// Moss-lambs: the little ones that live in Ummoth's beard. Frightened of everything. Herd them home.
function makeMossLamb() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const parts = [];
  for (let i = 0; i < 7; i++) { const a = i * 0.9; parts.push(M.paint(M.xf(M.blobGeo(0.22, i, 0.2, 7, 5), [Math.cos(a) * 0.18, 0.42 + (i % 2) * 0.12, Math.sin(a) * 0.22]), i % 3 ? 0xe4eec4 : 0xc4dc98, { jitter: 0.12 })); }
  parts.push(M.paint(M.xf(M.G.sph(0.15, 8, 6), [0, 0.45, 0.33], [0, 0, 0], [1, 0.9, 1.1]), 0x4a3a30));
  for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) parts.push(M.paint(M.xf(M.G.cyl(0.035, 0.035, 0.3, 4), [lx, 0.15, lz]), 0x4a3a30));
  body.add(M.vmesh(parts));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(M.G.sph(0.03, 4, 3), M.basic(0xf3e7cf)); e.position.set(s * 0.06, 0.5, 0.46); body.add(e); }
  const gl = M.glow(0xf4ffd8, 1.6, 0.4); gl.position.y = 0.5; g.add(gl);
  g.userData.parts = { body };
  return g;
}
export function mossLambs(L, { spots, pen, home, onHome }) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(pen.r - 0.15, pen.r, 40), new THREE.MeshBasicMaterial({ color: 0xc8f0a8, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pen.x, L.heightAt(pen.x, pen.z) + 0.06, pen.z); L.scene.add(ring);
  const lambs = spots.map(([sx, sz], i) => {
    if (flag('giant.lamb' + i)) return null;
    const [x, z] = L.nearestWalkable(sx, sz, 0.4);
    const obj = makeMossLamb(); L.place(obj, x, z, { rot: Math.random() * 6 });
    L.shadowBlob(obj, 0.8);
    return { i, x, z, obj, h: Math.random() * 6.28, wander: 0, speed: 0, hop: 0, gone: false };
  }).filter(Boolean);
  // they're small enough to slip between roots and trunks; only something as big as Ummoth stops them
  const open = (x, z) => L.mask(x, z) >= 0.62 && L.colliders.every((c) => c.r < 1.5 || Math.hypot(x - c.x, z - c.z) > c.r + 0.3);
  L.updaters.push((dt, t) => {
    ring.material.opacity = 0.3 + Math.sin(t * 2) * 0.15;
    if (!idle(L)) return;
    const p = L.player;
    for (const m of lambs) {
      if (m.gone) continue;
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      let want = 0;
      const toPen = Math.atan2(pen.x - m.x, pen.z - m.z), dPen = Math.hypot(pen.x - m.x, pen.z - m.z);
      if (dPen < pen.r + 4) {
        // close enough to smell home: it trots the rest of the way itself
        m.h = toPen; want = 2.2;
      } else if (d < 3.8) {
        // away from you, but leaning homeward: they want to go back, they're only frightened
        const away = Math.atan2(m.x - p.x, m.z - p.z) + Math.sin(t * 3 + m.i) * 0.3;
        m.h = Math.atan2(Math.sin(away) + Math.sin(toPen) * 0.45, Math.cos(away) + Math.cos(toPen) * 0.45);
        want = p.dash > 0 && d < 3 ? 5.2 : 3.3;
        if (!m.scared) { m.scared = true; audio.sfx('blip', { pitch: 2.4 + m.i * 0.2, wave: 'sine' }); }
      } else {
        m.scared = false;
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 1.5 + Math.random() * 2.5; m.h += (Math.random() - 0.5) * 2.4; m.amble = Math.random() > 0.5 ? 0.5 : 0; }
        want = m.amble || 0;
      }
      m.speed += (want - m.speed) * Math.min(1, dt * 6);
      // look for a way round whatever's in the way
      if (m.speed > 0.05) {
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
          const a = m.h + off, nx = m.x + Math.sin(a) * m.speed * dt, nz = m.z + Math.cos(a) * m.speed * dt;
          if (open(nx, nz)) { m.x = nx; m.z = nz; m.h = a; break; }
        }
      }
      m.hop += dt * (4 + m.speed * 3);
      m.obj.position.set(m.x, L.heightAt(m.x, m.z) + (m.speed > 0.3 ? Math.abs(Math.sin(m.hop)) * 0.25 : 0), m.z);
      m.obj.rotation.y = m.h;
      m.obj.userData.parts.body.rotation.z = m.speed < 0.3 ? Math.sin(t * 1.5 + m.i) * 0.06 : 0;
      if (m.obj.userData.blob) m.obj.userData.blob.position.set(m.x, L.heightAt(m.x, m.z) + 0.03, m.z);
      if (Math.hypot(m.x - pen.x, m.z - pen.z) < pen.r) {
        m.gone = true;
        setFlag('giant.lamb' + m.i);
        audio.sfx('pickup'); audio.sfx('blip', { pitch: 2.8, wave: 'sine' });
        if (m.obj.userData.blob) L.scene.remove(m.obj.userData.blob);
        const fx = m.x, fz = m.z, fy = m.obj.position.y;
        L.game.tween(0.9, (e) => { m.obj.position.set(fx + (home.x - fx) * e, fy + (home.y - fy) * e + Math.sin(e * Math.PI) * 2, fz + (home.z - fz) * e); m.obj.scale.setScalar(1 - e * 0.5); }).then(() => {
          L.scene.remove(m.obj);
          L.fx.burst(home.x, home.y, home.z, 14, { color: [0xc8f0a8, 0xffffff], size: 0.4, speed: 2, life: 1, grav: -0.6 });
          onHome([0, 1, 2].filter((k) => flag('giant.lamb' + k)).length);
        });
      }
    }
  });
}
