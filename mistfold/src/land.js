// The runtime for walking around inside a land: terrain, light, player, enemies, people, particles.
import * as THREE from 'three';
import { mulberry32, hashStr, fbm, noise2, lerp, clamp, smooth, dampAngle } from './util.js';
import * as M from './models.js';
import { state, flag, phase, effectiveAura, settlersIn, hasCharm, LAND_INFO, SETTLERS } from './state.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { addPaint, PAINT } from './style.js';
import { wear } from './paint.js';

export const PALETTES = {
  morning: { bg: 0xf0dcd2, hemiSky: 0xfff2e6, hemiGround: 0x9a86a8, hemiI: 2.4, sun: 0xffe8d0, sunI: 2.3, dir: [-0.7, 0.75, 0.45], mist: [0xfaeee6, 0xe2d4e6], grade: [0x8f7ab8, 0xffe2c4] },
  day: { bg: 0xdfe8e6, hemiSky: 0xf4fbff, hemiGround: 0x8a9a7a, hemiI: 2.4, sun: 0xfff4dc, sunI: 2.3, dir: [-0.45, 0.9, 0.35], mist: [0xf2f6f4, 0xd4e0e8], grade: [0x7a88b8, 0xfff0d6] },
  dusk: { bg: 0xe2b8b0, hemiSky: 0xe8d4e0, hemiGround: 0x6a5a8a, hemiI: 2.3, sun: 0xffa878, sunI: 2.2, dir: [0.75, 0.45, -0.2], mist: [0xf6d0c0, 0xc0a8c8], grade: [0x8a70b0, 0xffdcc0] },
  night: { bg: 0x3a4266, hemiSky: 0x9aa8e0, hemiGround: 0x3a3458, hemiI: 2.3, sun: 0xb8ccff, sunI: 1.7, dir: [-0.3, 0.85, -0.5], mist: [0x4a5278, 0x2c3050], grade: [0x5060a0, 0xd8d8ff] },
};

const MIST_FRAG = `
uniform float uTime; uniform vec3 cA; uniform vec3 cB; varying vec2 vW;
float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){
  vec2 p=vW*0.045;
  float f=fb(p+vec2(uTime*0.012,uTime*0.007)+fb(p*1.7-uTime*0.01));
  vec3 c=mix(cB,cA,smoothstep(0.25,0.85,f));
  c+=vec3(1.0,0.98,0.95)*smoothstep(0.62,0.9,f)*0.18;
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;
const MIST_VERT = `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`;
export function makeMistPlane(size, colors) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: MIST_VERT, fragmentShader: MIST_FRAG,
    uniforms: { uTime: { value: 0 }, cA: { value: new THREE.Color(colors[0]) }, cB: { value: new THREE.Color(colors[1]) } },
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- particles ----------
const PVERT = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = size*uScale; }`;
const PFRAG = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA); if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;
export class Particles {
  constructor(max = 800, additive = true) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3); this.s = new Float32Array(max); this.a = new Float32Array(max);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.g = new Float32Array(max);
    this.kind = new Uint8Array(max); this.seed = new Float32Array(max); this.s0 = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG,
      uniforms: { map: { value: M.dotTexture() }, uScale: { value: 30 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.geo = geo;
  }
  // kind: 0 burst (gravity), 1 firefly (wander, blink), 2 drift (sway falling), 3 rise
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, color = 0xffffff, size = 0.3, life = 1, grav = 0, kind = 0 } = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.c[i * 3] = c.r; this.c[i * 3 + 1] = c.g; this.c[i * 3 + 2] = c.b;
    this.s[i] = size; this.s0[i] = size; this.life[i] = life; this.ml[i] = life; this.g[i] = grav; this.kind[i] = kind; this.seed[i] = Math.random() * 100;
  }
  burst(x, y, z, n, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opt.speed || 3) * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, { vx: Math.cos(a) * sp, vy: (opt.up ?? 2) * (0.5 + Math.random()), vz: Math.sin(a) * sp, color: Array.isArray(opt.color) ? opt.color[i % opt.color.length] : opt.color, size: (opt.size || 0.3) * (0.6 + Math.random() * 0.8), life: (opt.life || 0.8) * (0.6 + Math.random() * 0.8), grav: opt.grav ?? 6, kind: 0 });
    }
  }
  update(dt, t) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const k = this.kind[i], sd = this.seed[i];
      if (k === 1) {
        this.v[i * 3] += Math.sin(t * 0.9 + sd) * dt * 0.6; this.v[i * 3 + 2] += Math.cos(t * 0.8 + sd * 1.3) * dt * 0.6;
        this.v[i * 3 + 1] += Math.sin(t * 1.3 + sd * 2) * dt * 0.3;
        this.v[i * 3] *= 0.98; this.v[i * 3 + 1] *= 0.98; this.v[i * 3 + 2] *= 0.98;
      } else if (k === 2) {
        this.v[i * 3] = Math.sin(t * 1.5 + sd) * 0.6; this.v[i * 3 + 2] = Math.cos(t * 1.1 + sd) * 0.3 + 0.2;
      }
      this.v[i * 3 + 1] -= this.g[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const lt = this.life[i] / this.ml[i];
      if (k === 1) this.a[i] = Math.min(1, (1 - lt) * 4, lt * 4) * (0.5 + 0.5 * Math.sin(t * 3 + sd * 5));
      else if (k === 2 || k === 3) this.a[i] = Math.min(1, (1 - lt) * 5, lt * 3);
      else { this.a[i] = Math.min(1, lt * 2.5); this.s[i] = this.s0[i] * (0.4 + lt * 0.6); }
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'pcolor', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.c[i * 3 + k] = this.c[j * 3 + k]; }
    this.s[i] = this.s[j]; this.s0[i] = this.s0[j]; this.a[i] = this.a[j]; this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; this.g[i] = this.g[j]; this.kind[i] = this.kind[j]; this.seed[i] = this.seed[j];
  }
}

// ---------- enemies ----------
export const ENEMY_STATS = {
  mistling: { hp: 3, speed: 2.2, aggro: 6.5, dmg: 1, lunge: 7, lumen: 3 },
  mireling: { hp: 4, speed: 2.0, aggro: 6.5, dmg: 1, lunge: 7.5, lumen: 4 },
  rootling: { hp: 3, speed: 2.6, aggro: 6, dmg: 1, lunge: 7, lumen: 3 },
  crab: { hp: 4, speed: 3.4, aggro: 6, dmg: 1, lunge: 9, lumen: 4 },
  jackdaw: { hp: 3, speed: 3.2, aggro: 7.5, dmg: 1, lunge: 9, lumen: 4, fly: 1.3 },
  moth: { hp: 2, speed: 2.6, aggro: 7, dmg: 1, lunge: 7, lumen: 3, fly: 1.4 },
  beetle: { hp: 7, speed: 1.6, aggro: 5, dmg: 2, lunge: 8, lumen: 7, leash: 5, guard: true },
  // things off Ines's desk
  smudgeling: { hp: 2, speed: 3.1, aggro: 11, dmg: 1, lunge: 8.5, lumen: 1, windup: 0.4 },
  inkblot: { hp: 3, speed: 1.7, aggro: 11, dmg: 1, lunge: 0, lumen: 3, ranged: true },
  ruler: { hp: 6, speed: 1.9, aggro: 11, dmg: 2, lunge: 6.5, lumen: 5, guard: true, windup: 0.75, reach: 1.5 },
};
export class Enemy {
  constructor(L, kind, x, z, opt = {}) {
    this.L = L; this.kind = kind; this.st = ENEMY_STATS[kind];
    this.hp = this.st.hp * (opt.hpMul || 1);
    this.x = x; this.z = z; this.hx = x; this.hz = z;
    this.vx = 0; this.vz = 0; this.face = Math.random() * 6; this.state = 'idle'; this.timer = Math.random() * 2;
    this.flash = 0; this.stun = 0; this.dizzy = 0; this.t = Math.random() * 10;
    this.always = !!opt.always; this.erasure = !!opt.erasure;
    this.carry = opt.carry || null;
    this.obj = M.makeEnemy(kind);
    this.obj.scale.setScalar(opt.scale || 1);
    this.mats = [];
    this.obj.traverse((o) => { if (o.isMesh && o.material && 'emissive' in o.material) { o.material = o.material.clone(); this.mats.push(o.material); } });
    if (this.carry) {
      this.carryObj = this.carry.model();
      this.carryObj.position.y = this.st.fly ? this.obj.userData.parts.body.position.y - 0.4 : 1.25;
      this.carryObj.scale.setScalar(0.7);
      this.obj.add(this.carryObj);
    }
    L.scene.add(this.obj);
  }
  update(dt) {
    const L = this.L, p = L.player, st = this.st;
    this.t += dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz) || 0.001;
    let mvx = 0, mvz = 0;
    const calm = (L.peaceful && !this.always) || p.dead;
    if (this.dizzy > 0) {
      // seeing stars: no guard, no plans
      this.dizzy -= dt;
      if (Math.random() < dt * 6) L.fx.emit(this.x + (Math.random() - 0.5) * 0.6, L.heightAt(this.x, this.z) + (st.fly ? 2 : 1.3), this.z + (Math.random() - 0.5) * 0.6, { color: 0xfff0a0, size: 0.25, life: 0.5, vy: 0.5 });
      if (this.dizzy <= 0) { this.state = 'chase'; }
    }
    if (this.stun > 0) {
      this.stun -= dt;
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.vx *= Math.pow(0.02, dt); this.vz *= Math.pow(0.02, dt);
      if (!L.walkable(this.x, this.z)) { this.x -= this.vx * dt; this.z -= this.vz * dt; this.vx = this.vz = 0; }
    } else if (this.dizzy <= 0) {
      this.timer -= dt;
      const leashed = st.leash && Math.hypot(this.x - this.hx, this.z - this.hz) > st.leash;
      switch (this.state) {
        case 'idle':
          if (this.timer <= 0) { this.timer = 1.5 + Math.random() * 2; this.wa = Math.random() * Math.PI * 2; this.wm = Math.random() > 0.4; }
          if (this.wm) { mvx = Math.cos(this.wa) * st.speed * 0.35; mvz = Math.sin(this.wa) * st.speed * 0.35; }
          if (Math.hypot(this.x - this.hx, this.z - this.hz) > 4) { this.wa = Math.atan2(this.hz - this.z, this.hx - this.x); }
          if (dist < st.aggro && !calm) { this.state = 'chase'; this.timer = 1 + Math.random(); L.alert(this); }
          break;
        case 'chase':
          if (leashed) { this.state = 'return'; break; }
          if (st.ranged) {
            // keep a polite distance and lob ink
            const want = dist < 4 ? -1 : dist > 6.5 ? 1 : 0;
            const side = Math.sin(this.t * 0.7 + this.hx) > 0 ? 1 : -1;
            mvx = (dx / dist) * st.speed * want + (-dz / dist) * st.speed * 0.6 * side;
            mvz = (dz / dist) * st.speed * want + (dx / dist) * st.speed * 0.6 * side;
            if (this.timer <= 0 && dist < 10) { this.state = 'windup'; this.timer = 0.65; }
          } else {
            mvx = (dx / dist) * st.speed; mvz = (dz / dist) * st.speed;
            if (this.kind === 'crab') { const s = Math.sin(this.t * 3) * 0.9; mvx += (-dz / dist) * st.speed * s; mvz += (dx / dist) * st.speed * s; }
            if (dist < (st.fly ? 3.2 : (st.reach || 0.9) + 1.7)) { this.state = 'windup'; this.timer = st.windup || 0.5; this.ld = [dx / dist, dz / dist]; }
          }
          if (dist > st.aggro * 1.8 || calm) this.state = 'idle';
          break;
        case 'return': {
          const rx = this.hx - this.x, rz = this.hz - this.z, rd = Math.hypot(rx, rz) || 1;
          mvx = (rx / rd) * st.speed; mvz = (rz / rd) * st.speed;
          if (rd < 1) this.state = 'idle';
          break;
        }
        case 'windup':
          this.ld = [dx / dist, dz / dist];
          if (this.timer <= 0) {
            if (st.ranged) {
              // aim a little ahead of where you are heading
              const lead = 0.45;
              L.shoot(this.x, this.z, p.x + (p.vxLast || 0) * lead, p.z + (p.vzLast || 0) * lead, { dmg: st.dmg });
              audio.sfx('spit');
              this.state = 'chase'; this.timer = 2.2 + Math.random() * 1.2;
            } else { this.state = 'lunge'; this.timer = 0.32; this.hitDone = false; this.vx = this.ld[0] * st.lunge; this.vz = this.ld[1] * st.lunge; }
          }
          break;
        case 'lunge':
          mvx = this.vx; mvz = this.vz;
          if (!this.hitDone && dist < (st.reach || 0.9) && !p.inv) {
            const front = st.reach ? (dx * Math.sin(this.face) + dz * Math.cos(this.face)) / dist > 0.2 : true;
            if (front) { L.hurtPlayer(st.dmg, this.x, this.z); this.hitDone = true; }
          }
          if (this.timer <= 0) { this.state = 'recover'; this.timer = st.reach ? 0.9 : 0.7; }
          break;
        case 'recover':
          if (this.timer <= 0) { this.state = 'chase'; this.timer = 1 + Math.random(); }
          break;
      }
      if (mvx || mvz) {
        const nx = this.x + mvx * dt, nz = this.z + mvz * dt;
        if (this.canStand(nx, nz)) { this.x = nx; this.z = nz; }
        else if (this.canStand(nx, this.z)) this.x = nx;
        else if (this.canStand(this.x, nz)) this.z = nz;
        else this.wa = (this.wa || 0) + Math.PI * 0.7;
        if (this.state !== 'windup' && !st.ranged) this.face = dampAngle(this.face, Math.atan2(mvx, mvz), 1 - Math.pow(0.001, dt));
      }
      if (this.state === 'windup' || (st.ranged && this.state === 'chase')) this.face = dampAngle(this.face, Math.atan2(dx, dz), 1 - Math.pow(0.001, dt));
      // guards keep their shield turned toward you
      if (st.guard && this.state === 'chase') this.face = dampAngle(this.face, Math.atan2(dx, dz), 1 - Math.pow(0.02, dt));
      // separation from other enemies
      for (const o of L.enemies) if (o !== this && !o.boss) { const ox = this.x - o.x, oz = this.z - o.z, od = Math.hypot(ox, oz); if (od < 0.9 && od > 0.001) { this.x += (ox / od) * (0.9 - od) * 0.5; this.z += (oz / od) * (0.9 - od) * 0.5; } }
    }
    // animate
    const o = this.obj, body = o.userData.parts.body;
    const gy = L.heightAt(this.x, this.z);
    o.position.set(this.x, gy, this.z);
    o.rotation.y = this.face + (this.dizzy > 0 ? Math.sin(this.t * 8) * 0.4 : 0);
    const moving = this.state === 'chase' || this.state === 'lunge' || this.wm;
    if (st.fly) {
      const base = st.fly + Math.sin(this.t * 2.2) * 0.2;
      const target = this.state === 'lunge' ? 0.5 : this.state === 'windup' ? base + 0.4 : base;
      body.position.y = lerp(body.position.y, target, 1 - Math.pow(0.001, dt));
      const flap = Math.sin(this.t * (this.kind === 'moth' ? 18 : 14)) * 0.7;
      const w = o.userData.parts.wings;
      if (w) { w[0].rotation.z = flap; w[1].rotation.z = -flap; }
    } else {
      let sq = 1;
      if (this.state === 'windup') sq = 0.75 + Math.sin(this.t * 30) * 0.04;
      else if (moving) sq = 1 + Math.abs(Math.sin(this.t * 9)) * 0.12;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      body.position.y = this.state === 'lunge' ? Math.sin((0.32 - this.timer) / 0.32 * Math.PI) * (st.reach ? 0.25 : 0.6) : (moving && this.kind !== 'crab' && this.kind !== 'beetle' ? Math.abs(Math.sin(this.t * 9)) * 0.15 : 0);
      const parts = o.userData.parts;
      if (parts.drip) parts.drip.scale.setScalar(this.state === 'windup' ? 1 + (0.65 - this.timer) * 1.6 : 1);
      // the ruler swings round in a wide sweep
      if (parts.shield) parts.shield.rotation.y = this.state === 'lunge' ? -1.6 + (0.32 - this.timer) / 0.32 * 3.2 : this.state === 'windup' ? -1.2 : this.dizzy > 0 ? 0.9 : 0;
    }
    this.flash -= dt;
    const f = this.flash > 0 ? 1 : 0;
    for (const m of this.mats) m.emissive.setRGB(f, f * 0.95, f * 0.9);
    if (this.state === 'windup' && this.dizzy <= 0) for (const m of this.mats) m.emissive.setRGB(0.35 + Math.sin(this.t * 30) * 0.2, 0.1, 0.05);
    if (this.carryObj) { this.carryObj.rotation.y += dt * 2; }
  }
  canStand(x, z) {
    const a = this.L.arena;
    if (a && this.erasure && Math.hypot(x - a.x, z - a.z) > a.r - 0.6) return false;
    return this.L.walkable(x, z, 0.4);
  }
  // true if the blow lands on the guarded side
  guarded(fromX, fromZ) {
    if (!this.st.guard || this.dizzy > 0 || this.stun > 0.05) return false;
    const dx = fromX - this.x, dz = fromZ - this.z, d = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(this.face) + dz * Math.cos(this.face)) / d > 0.35;
  }
  hit(dmg, fromX, fromZ, kbMul = 1) {
    this.hp -= dmg;
    this.flash = 0.12;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    const kb = (this.kind === 'beetle' || this.kind === 'ruler' ? 4 : 9) * kbMul;
    this.vx = (dx / d) * kb; this.vz = (dz / d) * kb;
    this.stun = 0.25;
    if (this.state === 'idle') this.state = 'chase';
    if (this.state === 'windup' && !this.st.guard) this.state = 'recover', this.timer = 0.4;
    return this.hp <= 0;
  }
}

// ---------- the land ----------
export class Land {
  constructor(game, def) {
    this.game = game; this.def = def; this.id = def.id;
    this.info = LAND_INFO[def.id];
    this.scene = new THREE.Scene();
    this.rng = mulberry32(hashStr(def.id));
    this.vr = mulberry32(hashStr(def.id) + state.day * 7919 + 1); // varies per visit
    this.colliders = []; this.npcs = []; this.enemies = []; this.pickups = []; this.interacts = []; this.hittables = [];
    this.updaters = []; this.swayers = []; this.effects = []; this.followers = []; this.shots = []; this.grassFields = [];
    this.arena = null;
    this.t = 0; this.wind = { value: 0 };
    this.phase = def.phase || phase();
    this.night = this.phase === 'night';
    this.aura = effectiveAura(def.id);
    this.settlers = settlersIn(def.id);
    this.peaceful = !!def.peaceful;
  }
  // ----- terrain -----
  mask(x, z) {
    if (this.def.mask) return this.def.mask(x, z);
    const R = this.def.radius || 21;
    const a = Math.atan2(z, x);
    const r = R * (0.9 + 0.12 * fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 3, 3));
    return clamp((r - Math.hypot(x, z)) / 2.2, 0, 1);
  }
  baseH(x, z) { return this.def.height ? this.def.height(x, z, this) : fbm(x * 0.06, z * 0.06, 3) * 1.2; }
  heightAt(x, z) {
    const m = this.mask(x, z), h = this.baseH(x, z);
    if (m >= 0.45) return h;
    return lerp(-3.4, h, smooth(0, 0.45, m));
  }
  groundAt(x, z) { const h = this.heightAt(x, z); return this.water != null ? Math.max(h, this.water - 0.02) : h; }
  walkable(x, z, rad = 0.35) {
    if (this.mask(x, z) < 0.62) return false;
    const h = this.baseH(x, z);
    if (this.water != null && h < this.water - 0.12 && !(this.def.bridge && this.def.bridge(x, z))) return false;
    if (this.def.blocked && this.def.blocked(x, z)) return false;
    for (const c of this.colliders) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + rad) * (c.r + rad)) return false; }
    return true;
  }
  build() {
    const def = this.def, rng = this.rng;
    const pal = PALETTES[this.phase];
    this.pal = pal;
    const bg = new THREE.Color(pal.bg);
    // aura colours the air a little
    if (def.tint) bg.lerp(new THREE.Color(def.tint[this.phase] ?? def.tint.all ?? pal.bg), def.tint.amount ?? 0.35);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 62, 108);
    this.hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiI);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(pal.sun, pal.sunI);
    const d = new THREE.Vector3(...pal.dir).normalize();
    this.sun.position.copy(d.multiplyScalar(45));
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.game.renderer.setGrade(pal.grade[0], pal.grade[1]);

    this.water = def.water ?? null;
    this.buildTerrain();
    const mistCols = def.mist ? def.mist(this.phase) : pal.mist;
    this.mist = makeMistPlane(400, mistCols);
    this.mist.position.y = -2.9;
    this.scene.add(this.mist);
    if (this.water != null) this.buildWater();

    this.fx = new Particles(900, true); this.scene.add(this.fx.points);
    this.dust = new Particles(500, false); this.scene.add(this.dust.points);

    // waystone + spawn
    const sp = def.spawn || [0, 8];
    this.waystone = M.makeWaystone();
    this.place(this.waystone, sp[0], sp[1], { r: 0.6 });
    const ws = def.waystone || { label: 'Unfold the map', action: () => this.game.toMap() };
    this.interact({ x: sp[0], z: sp[1], r: 2, label: ws.label, action: ws.action });
    def.build(this);
    this.buildSettlers();
    this.auraFlora();
    setupStory(this);
    this.lushen();
    // player
    this.player = { x: sp[0] + 1.6, z: sp[1] + 1.4, face: 0.6, vx: 0, vz: 0, atk: 0, combo: 0, comboT: 0, dash: 0, dashCd: 0, inv: 0, hurt: 0, dead: false, moveAmt: 0, t: 0, hold: 0, charge: 0, empower: 0, perfectCd: 0, spinT: 0 };
    if (this.game.spawnAt) { this.player.x = this.game.spawnAt.x; this.player.z = this.game.spawnAt.z; this.player.face = this.game.spawnAt.face; }
    [this.player.x, this.player.z] = this.nearestWalkable(this.player.x, this.player.z, 0.45);
    this.pObj = M.makePlayer();
    this.scene.add(this.pObj);
    this.shadowBlob(this.pObj);
    // the charge ring under your feet
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.chargeRing);
    this.ambient();
    if (def.paper) this.applyPaper();
    wear(this);
  }
  buildTerrain() {
    const def = this.def;
    const S = (def.radius || 21) * 2 + 12, seg = 150;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const m = this.mask(x, z);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const top = this.baseH(x, z);
      if (m < 0.45 || h < top - 0.4) {
        // cliff strata
        const band = Math.sin(h * 2.2 + noise2(x * 0.3, z * 0.3) * 2) * 0.5 + 0.5;
        c.set(def.cliff || 0x9a8470).lerp(new THREE.Color(def.cliff2 || 0x6f5a5a), band * 0.55 + smooth(-0.5, -3, h) * 0.4);
        if (h > top - 0.9 && m > 0.2) c.lerp(new THREE.Color(0x5a7a42), 0.5);
      } else {
        c.set(def.color ? def.color(x, z, top, this) : 0x7fa05a);
      }
      const n = fbm(x * 0.35, z * 0.35, 2) * 0.12 + noise2(x * 1.7, z * 1.7) * 0.05;
      col[i * 3] = c.r * (1 + n); col[i * 3 + 1] = c.g * (1 + n); col[i * 3 + 2] = c.b * (1 + n * 0.6);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // ground style: (kind, how paved this spot is)
    const sty = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { sty[i * 2] = 10; sty[i * 2 + 1] = def.paved ? def.paved(pos.getX(i), pos.getZ(i)) : 0; }
    geo.setAttribute('style', new THREE.BufferAttribute(sty, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, M.VC);
    mesh.receiveShadow = true;
    this.terrain = mesh;
    this.scene.add(mesh);
  }
  buildWater() {
    const def = this.def, R = (def.radius || 21) + 2;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const deep = new THREE.Color(def.waterDeep || 0x2f6f84), shallow = new THREE.Color(def.waterShallow || 0x8fd0c8), foam = new THREE.Color(0xf4f8f0);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const depth = this.water - this.baseH(x, z);
      c.copy(shallow).lerp(deep, smooth(0, 1.6, depth));
      if (depth < 0.07 && depth > -0.1) c.lerp(foam, 0.35);
      const m = this.mask(x, z);
      if (m < 0.5) c.lerp(new THREE.Color(0xe8f4f4), smooth(0.5, 0.1, m) * 0.7);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      // past the island's rim the sea spills over the edge into the mist
      pos.setY(i, m >= 0.5 ? this.water : lerp(this.water, -6, smooth(0.5, 0.05, m)));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, emissive: this.night ? 0x10203a : 0x000000 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.wind;
      sh.vertexShader = 'uniform float uTime;\nvarying vec2 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position.xz; transformed.y += sin(position.x*0.7+uTime*1.3)*0.04 + cos(position.z*0.9+uTime)*0.04;');
      sh.fragmentShader = 'uniform float uTime;\nvarying vec2 vWp;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float ripple = sin(vWp.x*2.1 + sin(vWp.y*1.3+uTime*0.7)*2.0 + uTime*1.1) * sin(vWp.y*1.7 - uTime*0.9);
        diffuseColor.rgb += smoothstep(0.82, 1.0, ripple) * 0.22;`);
      addPaint(sh);
    };
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    // keep water inside the island bowl only
    this.waterMesh = m;
    this.scene.add(m);
  }
  // understory: ferns, big leaves and flowers at the feet of trees and houses, along the rim and in little beds,
  // all merged into one mesh. Walk-through, and kept off paths and away from anything you can talk to or use.
  lushen() {
    const def = this.def, opt = def.lush ?? {};
    if (def.paper || opt === false) return;
    const rng = mulberry32(hashStr(def.id) + 99);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const leaves = opt.leaf || [0x5f9a42, 0x74b04a, 0x88bc52, 0x9ac458];
    const petals = opt.flowers || [0xd85a8a, 0xf0a0c0, 0xa070d0, 0xf0d060, 0xffffff, 0xe8704a];
    const density = opt.density ?? 1;
    const npcCols = new Set(this.npcs.map((n) => n.col));
    const sp = def.spawn || [0, 8];
    const ok = (x, z) => {
      if (this.mask(x, z) < 0.72) return false;
      if (this.water != null && this.baseH(x, z) < this.water + 0.08) return false;
      if (opt.region && !opt.region(x, z)) return false;
      if (def.blocked && def.blocked(x, z)) return false;
      if (def.keepClear && def.keepClear(x, z)) return false;
      if (def.paved && def.paved(x, z) > 0.02) return false;
      for (const c of this.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.15) return false;
      for (const it of this.interacts) if (typeof it.x === 'number' && Math.hypot(x - it.x, z - it.z) < 1.4) return false;
      if (def.erasure && Math.hypot(x - def.erasure.x, z - def.erasure.z) < (def.erasure.r || 1) + 1.5) return false;
      return Math.hypot(x - sp[0], z - sp[1]) > 2.5;
    };
    const parts = [];
    const plant = (kind, x, z, size = 1) => {
      if (!ok(x, z)) return false;
      const g = kind === 'fern' ? M.fernParts(rng, pick(leaves), size)
        : kind === 'broad' ? M.broadleafParts(rng, pick(leaves), size)
        : kind === 'spike' ? M.flowerSpikeParts(rng, pick(leaves), pick(petals), size)
        : M.flowerClumpParts(rng, pick(leaves), pick(petals), size);
      const y = this.heightAt(x, z) - 0.04, rot = rng() * 6.28;
      for (const geo of g) parts.push(M.xf(geo, [x, y, z], [0, rot, 0]));
      return true;
    };
    const kinds = ['fern', 'fern', 'broad', 'clump', 'clump', 'spike'];
    // at the feet of trees, bushes, rocks and houses
    for (const c of [...this.colliders]) {
      if (c.r < 0.5 || npcCols.has(c)) continue;
      const n = Math.round((c.r > 1.2 ? 4 : 1 + rng() * 2) * density);
      for (let i = 0; i < n; i++) { const a = rng() * 6.28, d = c.r + 0.3 + rng() * 0.8; plant(pick(kinds), c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0.8 + rng() * 0.5); }
    }
    // a thick fringe along the island's edge
    const R = def.radius || 21;
    let rim = 0;
    for (let i = 0; i < 900 && rim < 110 * density; i++) {
      const a = rng() * 6.28, d = R * (0.6 + rng() * 0.45), x = Math.cos(a) * d, z = Math.sin(a) * d;
      // only spots within a step or two of the drop-off
      if (this.mask(x * (d + 1.6) / d, z * (d + 1.6) / d) > 0.72) continue;
      if (plant(rng() > 0.4 ? pick(['fern', 'broad']) : pick(['clump', 'spike']), x, z, 0.9 + rng() * 0.6)) rim++;
    }
    // flower beds dotted about
    for (let b = 0; b < 7 * density; b++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * R * 0.85, bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      for (let i = 0; i < 7; i++) plant(rng() > 0.3 ? 'clump' : 'spike', bx + (rng() - 0.5) * 2.4, bz + (rng() - 0.5) * 2.4, 0.8 + rng() * 0.4);
    }
    if (!parts.length) return;
    this.understory = M.vmesh(parts);
    this.scene.add(this.understory);
  }
  shadowBlob(obj, s = 1) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.45 * s, 16), new THREE.MeshBasicMaterial({ color: 0x2a2040, transparent: true, opacity: 0.22, depthWrite: false }));
    b.rotation.x = -Math.PI / 2;
    this.scene.add(b);
    obj.userData.blob = b;
  }
  // ----- placement helpers -----
  place(obj, x, z, { r = 0, rot = null, y = null, sink = 0.05, sway = false } = {}) {
    obj.position.set(x, (y ?? this.heightAt(x, z)) - sink, z);
    obj.rotation.y = rot ?? this.rng() * Math.PI * 2;
    this.scene.add(obj);
    if (r > 0) this.colliders.push({ x, z, r });
    if (sway) this.swayers.push(obj);
    return obj;
  }
  free(x, z, r = 1) {
    if (this.mask(x, z) < 0.75) return false;
    if (this.water != null && this.baseH(x, z) < this.water + 0.05) return false;
    if (this.def.blocked && this.def.blocked(x, z)) return false;
    if (this.def.keepClear && this.def.keepClear(x, z)) return false;
    for (const c of this.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
    for (const n of this.npcs) if (Math.hypot(x - n.x, z - n.z) < r + 1.5) return false;
    const sp = this.def.spawn || [0, 8];
    if (Math.hypot(x - sp[0], z - sp[1]) < r + 3) return false;
    return true;
  }
  scatter(n, fn, { r = 1, tries = 30, region = null } = {}) {
    const R = (this.def.radius || 21);
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < tries; k++) {
        const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * R;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (region && !region(x, z)) continue;
        if (!this.free(x, z, r)) continue;
        out.push(fn(x, z, this.rng));
        break;
      }
    }
    return out;
  }
  grass(count, colorFn, region = null, height = 0.5) {
    const pts = [];
    const R = (this.def.radius || 21);
    for (let i = 0; i < count * 3 && pts.length < count; i++) {
      const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * R;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.mask(x, z) < 0.7) continue;
      const h = this.baseH(x, z);
      if (this.water != null && h < this.water + 0.02) continue;
      if (region && !region(x, z)) continue;
      pts.push([x, h - 0.02, z]);
    }
    const g = M.makeGrassField(pts, { colorFn: colorFn || (() => 0x7fa85a), height, windRef: this.wind });
    this.scene.add(g); this.grassFields.push(g);
    return g;
  }
  npc(o) {
    const n = { face: 0, wander: 0, ...o, hx: o.x, hz: o.z, t: Math.random() * 10, bubbleKey: 'npc-' + o.id };
    n.obj = o.model;
    this.place(n.obj, n.x, n.z, { rot: n.face, sink: 0 });
    if (!o.noCollide) this.colliders.push(n.col = { x: n.x, z: n.z, r: o.r ?? 0.55 });
    if (!o.noBlob) this.shadowBlob(n.obj, o.blob ?? 1);
    this.npcs.push(n);
    this.interact({ x: n.x, z: n.z, r: o.talkR ?? 2.2, label: o.label || `Talk to ${o.name}`, npc: n, action: () => this.game.talk(n) });
    return n;
  }
  interact(o) { this.interacts.push(o); return o; }
  hittable(o) { this.hittables.push(o); return o; }
  // nearest open ground to a point, searching outward in rings
  nearestWalkable(x, z, rad = 0.5) {
    for (let r = 0; r < 12; r += 0.4) {
      for (let a = 0; a < 6.28; a += 0.35) { const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r; if (this.walkable(nx, nz, rad)) return [nx, nz]; }
    }
    return [x, z];
  }
  enemy(kind, x, z, opt) {
    // keep monsters off the arrival point, and on solid ground
    const sp = this.def.spawn || [0, 8];
    const dx = x - sp[0], dz = z - sp[1], d = Math.hypot(dx, dz);
    if (d < 8.5) { const k = 8.5 / (d || 1); x = sp[0] + (d ? dx : 1) * k; z = sp[1] + (d ? dz : 0) * k; }
    [x, z] = this.nearestWalkable(x, z);
    const e = new Enemy(this, kind, x, z, opt); this.enemies.push(e); this.shadowBlob(e.obj, kind === 'beetle' ? 1.4 : 1); return e; }
  pickup(model, x, z, onPick, { y = 0.9, magnet = false, delay = 0 } = {}) {
    const p = { obj: model, x, z, y, onPick, magnet, t: 0, delay, vy: 0 };
    model.position.set(x, this.heightAt(x, z) + y, z);
    this.scene.add(model);
    this.pickups.push(p);
    return p;
  }
  // a little floating "!" over something
  alert(e) { this.fx.emit(e.x, this.heightAt(e.x, e.z) + 1.8, e.z, { color: 0xffd27a, size: 0.5, life: 0.4, vy: 1.5 }); }

  buildSettlers() {
    const spots = this.def.settleSpots || [[-8, -6], [8, -6]];
    this.settlers.forEach((s, i) => {
      const [x, z] = spots[i % spots.length];
      const stage = s.age <= 0 ? 0 : s.age <= 2 ? 1 : 2;
      const def = SETTLER_LOOKS[s.id];
      if (stage === 0) this.place(M.makeTent(def.tent), x, z, { r: 1.4, rot: 0.3 });
      else if (stage === 1) this.place(M.makeScaffold(), x, z, { r: 1.5, rot: 0.3 });
      else this.place(def.house(this.night || this.phase === 'dusk'), x, z, { r: def.r || 2, rot: 0.3 });
      if (stage === 2 && def.extras) def.extras(this, x, z);
      const model = def.model();
      this.npc({ id: s.id, name: SETTLERS[s.id].name, model, x: x + 2.2, z: z + 1.8, face: 0.4, voice: def.voice, color: def.color, wander: 0.6, talk: (D) => def.talk(D, stage, this) });
      if (def.followers) def.followers(this, x + 2.2, z + 1.8, stage);
    });
  }
  auraFlora() {
    const a = this.aura;
    if (this.def.paper) return;
    if (a.sun >= 3) this.scatter(18, (x, z, r) => this.place(sunflower(r), x, z, { sway: true }), { r: 0.6 });
    if (a.moon >= 3) {
      this.scatter(16, (x, z, r) => this.place(M.makeMushroom(r, 0xb8a8ff, 1.2 + r(), true), x, z), { r: 0.5 });
      this.alwaysFireflies = true;
    }
    if (a.tide >= 3) this.scatter(12, (x, z, r) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CircleGeometry(0.8 + r() * 0.8, 14), new THREE.MeshLambertMaterial({ color: 0x8fc8d8, transparent: true, opacity: 0.7 })));
      g.children[0].rotation.x = -Math.PI / 2; g.children[0].position.y = 0.06;
      for (let i = 0; i < 4; i++) g.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.02, 0.03, 1.1, 3), [(r() - 0.5) * 1.2, 0.55, (r() - 0.5) * 1.2], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3]), 0x6a8a4a)], { shadow: false }));
      this.place(g, x, z, { sink: 0 });
    }, { r: 1 });
    if (a.root >= 3) this.scatter(14, (x, z, r) => this.place(M.makeMushroom(r, [0xc8553f, 0xd8a04a, 0xe8d8c0][Math.floor(r() * 3)], 1 + r() * 1.4), x, z), { r: 0.4 });
  }
  ambient() {
    const def = this.def;
    this.amb = def.ambient || ['motes'];
    if (this.night || this.alwaysFireflies) this.amb = [...this.amb, 'fireflies'];
    // butterflies are little meshes
    if (this.amb.includes('butterflies') && !this.night) {
      this.butterflies = [];
      for (let i = 0; i < 7; i++) {
        const g = new THREE.Group();
        const col = [0xf3d27a, 0xf2b6c8, 0xbfe0ff, 0xffffff][i % 4];
        for (const s of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.CircleGeometry(0.13, 6), M.lambert(col, { side: THREE.DoubleSide }));
          w.position.x = s * 0.12; w.rotation.x = -Math.PI / 2; g.add(w);
        }
        g.userData.seed = Math.random() * 100;
        g.userData.home = new THREE.Vector3((this.rng() - 0.5) * 24, 0, (this.rng() - 0.5) * 24);
        this.scene.add(g); this.butterflies.push(g);
      }
    }
  }
  spawnAmbient(dt) {
    const R = this.def.radius || 21;
    const rp = () => { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * R * 0.9; return [this.player.x * 0.5 + Math.cos(a) * d * 0.7, this.player.z * 0.5 + Math.sin(a) * d * 0.7]; };
    for (const k of this.amb) {
      if (k === 'fireflies' && Math.random() < dt * 14 && this.fx.n < 600) { const [x, z] = rp(); this.fx.emit(x, this.heightAt(x, z) + 0.4 + Math.random() * 2.2, z, { color: this.def.fireflyColor || 0xd8ff8a, size: 0.32, life: 4 + Math.random() * 3, kind: 1 }); }
      if (k === 'motes' && Math.random() < dt * 8) { const [x, z] = rp(); this.fx.emit(x, this.heightAt(x, z) + Math.random() * 3, z, { color: this.def.moteColor || 0xfff0c8, size: 0.16, life: 5, vy: 0.15, kind: 3 }); }
      if (k === 'petals' && Math.random() < dt * 10) { const [x, z] = rp(); this.dust.emit(x, this.heightAt(x, z) + 4 + Math.random() * 2, z, { color: this.def.petalColor || 0xf2b6c8, size: 0.18, life: 6, vy: -0.6, kind: 2 }); }
      if (k === 'leaves' && Math.random() < dt * 7) { const [x, z] = rp(); this.dust.emit(x, this.heightAt(x, z) + 4 + Math.random() * 2, z, { color: [0xd8a04a, 0xc8703a, 0xa8b04a][Math.floor(Math.random() * 3)], size: 0.2, life: 6, vy: -0.7, kind: 2 }); }
      if (k === 'spores' && Math.random() < dt * 9) { const [x, z] = rp(); this.fx.emit(x, this.heightAt(x, z) + Math.random() * 1.5, z, { color: 0xc8f0a8, size: 0.14, life: 5, vy: 0.25, kind: 3 }); }
      if (k === 'sparkle' && Math.random() < dt * 10 && this.water != null) { const [x, z] = rp(); if (this.baseH(x, z) < this.water - 0.2) this.fx.emit(x, this.water + 0.05, z, { color: 0xffffff, size: 0.25, life: 0.6, kind: 3 }); }
      if (k === 'ash' && Math.random() < dt * 6) { const [x, z] = rp(); this.dust.emit(x, this.heightAt(x, z) + 4, z, { color: 0xe8e2d4, size: 0.14, life: 6, vy: -0.4, kind: 2 }); }
    }
  }

  // ----- the paper land -----
  applyPaper() {
    const N = 192, W = 60;
    this.paperData = new Uint8Array(N * N * 4);
    const done = flag('margin.colored');
    if (done) this.paperData.fill(255);
    this.paperTex = new THREE.DataTexture(this.paperData, N, N, THREE.RGBAFormat);
    this.paperTex.magFilter = THREE.LinearFilter; this.paperTex.minFilter = THREE.LinearFilter;
    this.paperTex.needsUpdate = true;
    this.paperN = N; this.paperW = W;
    const tex = this.paperTex;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMask = { value: tex };
      sh.vertexShader = 'varying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D uMask;\nvarying vec3 vWorldP;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float mk = texture2D(uMask, vWorldP.xz / ${W.toFixed(1)} + 0.5).r;
        float L = dot(diffuseColor.rgb, vec3(0.3,0.59,0.11));
        float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.12));
        float hatch2 = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.12));
        vec3 paper = vec3(0.97, 0.95, 0.9);
        float ink = (1.0 - smoothstep(0.15, 0.7, L));
        paper -= vec3(0.3,0.3,0.36) * ink * (hatch * 0.5 + hatch2 * step(0.6, ink) * 0.5);
        diffuseColor.rgb = mix(paper, diffuseColor.rgb, smoothstep(0.05, 0.9, mk));`);
    };
    this.scene.traverse((o) => { if (o.isMesh && (o.material === M.VC)) o.material = mat; });
  }
  paintPaper(x, z, r = 4) {
    if (!this.paperData) return;
    const N = this.paperN, W = this.paperW, D = this.paperData;
    const cx = (x / W + 0.5) * N, cz = (z / W + 0.5) * N, cr = (r / W) * N;
    let changed = false;
    for (let j = Math.floor(cz - cr); j <= Math.ceil(cz + cr); j++) for (let i = Math.floor(cx - cr); i <= Math.ceil(cx + cr); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(i - cx, j - cz) / cr;
      if (d > 1) continue;
      const v = Math.floor(255 * smooth(1, 0.4, d));
      const k = (j * N + i) * 4;
      if (v > D[k]) { D[k] = v; changed = true; }
    }
    if (changed) this.paperTex.needsUpdate = true;
  }
  // the Smudge takes the colour back out as it goes
  erasePaper(x, z, r = 2) {
    if (!this.paperData) return;
    const N = this.paperN, W = this.paperW, D = this.paperData;
    const cx = (x / W + 0.5) * N, cz = (z / W + 0.5) * N, cr = (r / W) * N;
    for (let j = Math.floor(cz - cr); j <= Math.ceil(cz + cr); j++) for (let i = Math.floor(cx - cr); i <= Math.ceil(cx + cr); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(i - cx, j - cz) / cr;
      if (d > 1) continue;
      const k = (j * N + i) * 4;
      D[k] = Math.min(D[k], Math.floor(255 * smooth(0.5, 1, d)));
    }
    this.paperTex.needsUpdate = true;
  }
  paintedFraction() {
    if (!this.paperData) return 1;
    let s = 0, n = 0;
    for (let k = 0; k < this.paperData.length; k += 4 * 3) { s += this.paperData[k]; n++; }
    return s / (n * 255);
  }

  // ----- update -----
  update(dt) {
    this.t += dt; this.wind.value = this.t;
    this.mist.material.uniforms.uTime.value = this.t;
    const input = this.game.input, p = this.player;
    const frozen = ui.busy || this.game.transitioning || this.cutscene;
    if (!frozen) this.updatePlayer(dt, input);
    else { p.moveAmt = lerp(p.moveAmt, 0, 0.2); }
    this.animatePlayer(dt);
    if (!frozen) for (const e of [...this.enemies]) e.update(dt);
    if (!frozen) this.updateShots(dt);
    this.updateNPCs(dt);
    this.updatePickups(dt);
    for (const u of this.updaters) u(dt, this.t);
    if (this.def.update) this.def.update(this, dt);
    if (!this.painted) for (const s of this.swayers) { s.rotation.z = Math.sin(this.t * 1.3 + s.position.x * 0.3) * 0.03; }
    for (let i = this.effects.length - 1; i >= 0; i--) { const e = this.effects[i]; e.t += dt; if (e.update(e.t, dt) === false) { this.scene.remove(e.obj); this.effects.splice(i, 1); } }
    if (this.butterflies) for (const b of this.butterflies) {
      const s = b.userData.seed, h = b.userData.home;
      b.position.set(h.x + Math.sin(this.t * 0.4 + s) * 4, 0, h.z + Math.cos(this.t * 0.33 + s * 2) * 4);
      b.position.y = this.heightAt(b.position.x, b.position.z) + 1.0 + Math.sin(this.t * 2 + s) * 0.4;
      b.rotation.y = this.t * 0.4 + s;
      const f = Math.sin(this.t * 16 + s) * 0.9;
      b.children[0].rotation.y = f; b.children[1].rotation.y = -f;
    }
    this.spawnAmbient(dt);
    this.fx.update(dt, this.t); this.dust.update(dt, this.t);
    const scale = (window.innerHeight * this.game.renderer.pixelRatio) / (this.game.cam.viewSize / this.game.cam.zoom);
    this.fx.mat.uniforms.uScale.value = scale; this.dust.mat.uniforms.uScale.value = scale;
    // waystone
    const ws = this.waystone.userData;
    ws.gem.rotation.y += dt * 1.5; ws.gem.position.y = 2.9 + Math.sin(this.t * 2) * 0.12;
    ws.ring.material.opacity = 0.3 + Math.sin(this.t * 2) * 0.15;
    // camera
    const cam = this.game.cam;
    cam.goal.set(p.x, this.heightAt(p.x, p.z) * 0.6 + 0.5, p.z);
    this.sun.target.position.set(0, 0, 0);
    if (this.paperData) this.paintPaper(p.x, p.z, 3.6);
    // the charge ring: grows while you hold, glows gold when it's ready
    const cr = this.chargeRing;
    cr.position.set(p.x, this.groundAt(p.x, p.z) + 0.08, p.z);
    cr.material.opacity = p.charge > 0 ? 0.35 + p.charge * 0.4 + (p.charge >= 1 ? Math.sin(this.t * 20) * 0.15 : 0) : 0;
    cr.material.color.setHex(p.charge >= 1 ? 0xffd870 : 0xd8f0ff);
    cr.scale.setScalar(p.charge >= 1 ? 1.15 : 0.6 + p.charge * 0.5);
    if (p.empower > 0 && Math.random() < dt * 20) this.fx.emit(p.x + (Math.random() - 0.5) * 0.6, this.heightAt(p.x, p.z) + 0.4 + Math.random(), p.z + (Math.random() - 0.5) * 0.6, { color: 0xffd870, size: 0.25, life: 0.5, vy: 1, kind: 3 });
    this.updatePrompts();
  }
  updatePlayer(dt, input) {
    const p = this.player;
    p.t += dt;
    p.inv = Math.max(0, p.inv - dt); p.hurt = Math.max(0, p.hurt - dt);
    p.dashCd -= dt; p.comboT -= dt; p.perfectCd -= dt;
    p.empower = Math.max(0, p.empower - dt); p.spinT = Math.max(0, p.spinT - dt);
    const ax = input.axis();
    const { fwd, right } = this.game.cam.axes();
    let mx = right.x * ax.x + fwd.x * ax.y, mz = right.z * ax.x + fwd.z * ax.y;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    let speed = 5.6;
    if (p.atk > 0) { p.atk -= dt; speed = 1.4; }
    if (p.charge > 0) speed = Math.min(speed, 3);
    if (input.pressed('dash') && p.dashCd <= 0 && p.atk <= 0) {
      p.dash = 0.2; p.dashCd = 0.55; p.inv = Math.max(p.inv, 0.25);
      const dx = ml > 0.1 ? mx : Math.sin(p.face), dz = ml > 0.1 ? mz : Math.cos(p.face);
      p.dvx = dx; p.dvz = dz; p.cut = new Set();
      audio.sfx('dash');
      for (let i = 0; i < 8; i++) this.dust.emit(p.x, this.heightAt(p.x, p.z) + 0.2, p.z, { vx: (Math.random() - 0.5) * 2, vy: Math.random(), vz: (Math.random() - 0.5) * 2, color: this.def.dustColor || 0xd8c8a8, size: 0.35, life: 0.5 });
      this.perfectCheck();
    }
    let vx, vz;
    if (p.dash > 0) { p.dash -= dt; vx = p.dvx * 15; vz = p.dvz * 15; }
    else { vx = mx * speed; vz = mz * speed; }
    // the sea-glass charm: a dash cuts what it passes through
    if (p.dash > 0 && hasCharm('seaglass')) for (const e of [...this.enemies]) if (!p.cut.has(e) && Math.hypot(e.x - p.x, e.z - p.z) < 1.3) { p.cut.add(e); this.damageEnemy(e, 1, { kb: 0.5, breakGuard: true, color: [0x9fe8e0, 0xffffff] }); }
    if (p.knock) { vx += p.knock.x; vz += p.knock.z; p.knock.x *= Math.pow(0.001, dt); p.knock.z *= Math.pow(0.001, dt); if (Math.abs(p.knock.x) + Math.abs(p.knock.z) < 0.1) p.knock = null; }
    p.vxLast = vx; p.vzLast = vz;
    const nx = p.x + vx * dt, nz = p.z + vz * dt;
    if (this.walkable(nx, nz)) { p.x = nx; p.z = nz; }
    else if (this.walkable(nx, p.z)) p.x = nx;
    else if (this.walkable(p.x, nz)) p.z = nz;
    else if (!this.walkable(p.x, p.z) && this.mask(nx, nz) > 0.62) { p.x = nx; p.z = nz; } // already wedged in something: let them walk out
    // inside an erasure the grey closes round you
    if (this.arena) { const a = this.arena, ox = p.x - a.x, oz = p.z - a.z, od = Math.hypot(ox, oz); if (od > a.r) { p.x = a.x + (ox / od) * a.r; p.z = a.z + (oz / od) * a.r; } }
    p.moveAmt = lerp(p.moveAmt, p.dash > 0 ? 1.5 : ml, 1 - Math.pow(0.001, dt));
    if (ml > 0.1 && p.atk <= 0 && p.spinT <= 0) p.face = dampAngle(p.face, Math.atan2(mx, mz), 1 - Math.pow(0.0001, dt));
    if (ml > 0.2 && Math.random() < dt * 6 && p.dash <= 0) this.dust.emit(p.x, this.heightAt(p.x, p.z) + 0.1, p.z, { vy: 0.4, color: this.def.dustColor || 0xd8c8a8, size: 0.25, life: 0.5, grav: 0 });
    // tap to swing; hold to charge a spin
    const holding = input.held('attack');
    if (input.pressed('attack') && p.atk <= 0.1 && p.spinT <= 0) this.swing();
    if (holding && p.atk <= 0 && p.dash <= 0 && p.spinT <= 0) {
      p.hold += dt;
      if (p.hold > 0.2) {
        if (p.charge === 0) audio.sfx('charge');
        const was = p.charge >= 1;
        p.charge = Math.min(1, p.charge + dt / (hasCharm('quill') ? 0.4 : 0.8));
        if (!was && p.charge >= 1) { audio.sfx('charged'); this.fx.burst(p.x, this.heightAt(p.x, p.z) + 0.6, p.z, 14, { color: [0xfff0b0, 0xd8f0ff], size: 0.35, speed: 2.5, life: 0.6, grav: -1 }); }
      }
    } else if (!holding) {
      if (p.charge >= 1) this.spin();
      p.hold = 0; p.charge = 0;
    }
    if (input.pressed('flare')) this.flare();
    if (input.pressed('interact') && this.focus && this.game.canInteract()) { audio.sfx('select'); this.focus.action(); }
  }
  // a little arc of light, drawn and gone
  slashFx(radius, len, color, dir, tilt, life = 0.2) {
    const p = this.player;
    const geo = new THREE.RingGeometry(0.7, radius, 32, 1, -len / 2, len);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const arc = new THREE.Mesh(geo, mat);
    arc.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group(); holder.add(arc);
    holder.position.set(p.x, this.heightAt(p.x, p.z) + 0.7, p.z);
    holder.rotation.y = p.face - Math.PI / 2;
    holder.rotation.z = tilt;
    this.scene.add(holder);
    this.effects.push({ obj: holder, t: 0, update: (t) => { arc.rotation.z = dir * (t * 6 - 0.5); mat.opacity = 0.75 * (1 - t / life); holder.scale.setScalar(1 + t * 1.5); return t < life; } });
  }
  ringFx(x, z, color, to = 6, life = 0.6, y = 0.3) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, this.heightAt(x, z) + y, z);
    this.scene.add(m);
    this.effects.push({ obj: m, t: 0, update: (t) => { const k = t / life; m.scale.setScalar(0.3 + k * to); mat.opacity = 0.8 * (1 - k); return k < 1; } });
  }
  swing() {
    const p = this.player;
    p.combo = p.comboT > 0 ? (p.combo + 1) % 3 : 0;
    p.comboT = 0.55; p.atk = 0.28; p.atkT = 0;
    // aim at the nearest enemy in front if there is one
    let best = null, bd = 3.2;
    for (const e of this.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z) - (e.boss ? 1.6 : 0); if (d < bd) { bd = d; best = e; } }
    if (best) p.face = Math.atan2(best.x - p.x, best.z - p.z);
    const ax = Math.sin(p.face), az = Math.cos(p.face);
    p.knock = { x: ax * 4, z: az * 4 };
    audio.sfx('swing', { combo: p.combo });
    const emp = p.empower > 0;
    const dir = p.combo === 1 ? -1 : 1;
    this.slashFx(2.0, Math.PI * 1.1, emp ? 0xffd870 : p.combo === 2 ? 0xfff0b0 : 0xd8f0ff, dir, p.combo === 2 ? 0 : 0.15 * dir);
    // resolve hits
    const dmg = this.game.state.power + (p.combo === 2 ? 1 : 0) + (emp ? 2 : 0);
    let hitAny = false, blocked = false;
    for (const e of [...this.enemies]) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) - (e.boss ? 1.4 : 0);
      if (d > 2.3) continue;
      const dot = (dx * ax + dz * az) / (Math.hypot(dx, dz) || 1);
      if (d > 0.8 && dot < 0.1) continue;
      const r = this.damageEnemy(e, dmg, { finisher: p.combo === 2 });
      if (r === 'blocked') blocked = true; else hitAny = true;
    }
    hitAny = this.hitThings(ax, az, 1.8) || hitAny;
    if (hitAny) { audio.sfx('hit'); this.game.hitstop = 0.06; this.game.cam.shake = Math.max(this.game.cam.shake, 0.5); }
    else if (blocked) this.game.hitstop = 0.03;
  }
  // stones, brambles, trees: things you can strike that aren't fighting back
  hitThings(ax, az, reach, all = false) {
    const p = this.player;
    let any = false;
    for (const h of this.hittables) {
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
      if (d > (h.r || 1) + reach) continue;
      const dot = (dx * ax + dz * az) / (d || 1);
      if (!all && d > 1 && dot < 0.1) continue;
      if (h.cool && h.cool > this.t) continue;
      h.cool = this.t + 0.35;
      h.onHit(h, this);
      any = any || !h.soft;
    }
    return any;
  }
  spin() {
    const p = this.player;
    p.charge = 0; p.hold = 0; p.spinT = 0.4; p.atk = 0.3; p.combo = 0; p.comboT = 0;
    audio.sfx('spin');
    const emp = p.empower > 0;
    this.slashFx(3.0, Math.PI * 2, emp ? 0xffd870 : 0xfff0c0, 1, 0, 0.3);
    this.ringFx(p.x, p.z, 0xfff0c0, 3.2, 0.35);
    const dmg = this.game.state.power + 2 + (emp ? 2 : 0);
    let hitAny = false;
    for (const e of [...this.enemies]) {
      const d = Math.hypot(e.x - p.x, e.z - p.z) - (e.boss ? 1.4 : 0);
      if (d > 3.1) continue;
      this.damageEnemy(e, dmg, { kb: 1.6, breakGuard: true, stun: 0.9 });
      hitAny = true;
    }
    hitAny = this.hitThings(0, 0, 2.6, true) || hitAny;
    if (hitAny) { audio.sfx('hit'); this.game.hitstop = 0.1; this.game.cam.shake = Math.max(this.game.cam.shake, 0.8); }
  }
  // Pell's light, let out all at once
  flare() {
    const s = this.game.state, p = this.player;
    if (!flag('flare')) return;
    if (s.flare < 100) {
      audio.sfx('blip', { pitch: 0.6 });
      ui.flareNudge();
      if (!this.flareHintT || this.t > this.flareHintT) { this.flareHintT = this.t + 6; ui.toast(`Pell's light is only ${Math.round(s.flare)}% full. Every hit you land fills it a little.`, 3000); }
      return;
    }
    s.flare = 0;
    audio.sfx('flare');
    this.game.renderer.post.uniforms.flash.value = 0.55;
    this.game.cam.shake = 1;
    const y = this.heightAt(p.x, p.z);
    this.ringFx(p.x, p.z, 0xffe0a0, 9, 0.8);
    this.ringFx(p.x, p.z, 0xffffff, 6, 0.5, 0.6);
    this.fx.burst(p.x, y + 1, p.z, 70, { color: [0xfff0b0, 0xffd27a, 0xffffff], size: 0.55, speed: 9, life: 1.1, grav: 0.5, up: 1 });
    for (const e of [...this.enemies]) {
      if (Math.hypot(e.x - p.x, e.z - p.z) > 7.5) continue;
      this.damageEnemy(e, e.boss ? 4 : 2, { kb: 2, breakGuard: true, stun: 2.2, noFlare: true });
    }
    for (const sh of this.shots) sh.dead = true;
    this.game.hud();
  }
  // dodging at the last moment slows the world and sharpens your stick
  perfectCheck() {
    const p = this.player;
    if (p.perfectCd > 0) return;
    let threat = false;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.boss ? e.threat && d < 4.5 : d < 2.8 && (e.state === 'lunge' || (e.state === 'windup' && e.timer < 0.25 && !e.st.ranged))) threat = true;
    }
    for (const s of this.shots) if (s.t > s.dur - 0.4 && Math.hypot(s.tx - p.x, s.tz - p.z) < s.r + 0.6) threat = true;
    if (!threat) return;
    p.perfectCd = 1.2; p.empower = 2.5; p.inv = Math.max(p.inv, 0.6);
    this.game.slowmo = 0.45;
    audio.sfx('perfect');
    const y = this.heightAt(p.x, p.z);
    this.game.floatText('perfect!', p.x, y + 2.2, p.z, 'dmg gold');
    this.ringFx(p.x, p.z, 0xbfe8ff, 4, 0.5);
    this.fx.burst(p.x, y + 0.8, p.z, 20, { color: [0xbfe8ff, 0xffffff], size: 0.4, speed: 3, life: 0.6, grav: -1 });
    const s = this.game.state;
    if (hasCharm('spoon') && s.hp < s.maxHearts * 2) { s.hp++; audio.sfx('heal'); this.game.hud(); }
  }
  damageEnemy(e, dmg, { kb = 1, breakGuard = false, stun = 0, color = null, finisher = false, noFlare = false } = {}) {
    const p = this.player, s = this.game.state;
    const y = this.heightAt(e.x, e.z) + (e.st.fly ? 1.2 : e.boss ? 1.2 : 0.6);
    if (!breakGuard && e.guarded && e.guarded(p.x, p.z)) {
      audio.sfx('clink');
      this.game.floatText('clink', e.x, y + 0.8, e.z, 'dmg block');
      this.fx.burst(e.x, y + 0.2, e.z, 8, { color: [0xffffff, 0xfff0c0], size: 0.25, speed: 4, life: 0.3 });
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
      p.knock = { x: (dx / d) * 7, z: (dz / d) * 7 };
      e.flash = 0.05;
      this.game.tip('guard', 'That one blocks from the front. Get round the side, or <b>hold attack</b> and let go for a spin that breaks guards.');
      return 'blocked';
    }
    if (finisher && hasCharm('knot')) { kb *= 2.4; stun = Math.max(stun, 1); }
    const emp = p.empower > 0;
    this.fx.burst(e.x, y, e.z, 10, { color: color || (emp ? [0xffd870, 0xffffff] : [0xffffff, 0xd8f0ff, 0xffe0a0]), size: 0.35, speed: 4, life: 0.4 });
    this.game.floatText(`${dmg}`, e.x, y + 0.8, e.z, emp ? 'dmg gold' : 'dmg');
    if (flag('flare') && !noFlare) {
      const was = s.flare;
      s.flare = Math.min(100, s.flare + (hasCharm('bell') ? 12 : 8));
      if (was < 100 && s.flare >= 100) { audio.sfx('charged'); this.game.tip('flareready', 'Pell\'s light is full. Press <b>F</b> (or right-click) to let it all out.', 5000); }
      this.game.hud();
    }
    const dead = e.hit(dmg, p.x, p.z, kb);
    if (stun > 0 && !e.boss) { e.dizzy = Math.max(e.dizzy, stun); if (e.state === 'windup' || e.state === 'lunge') { e.state = 'recover'; e.timer = 0.3; } }
    if (stun >= 2 && e.boss && e.stagger) e.stagger();
    if (dead) this.killEnemy(e);
    return dead ? 'dead' : 'hit';
  }
  killEnemy(e) {
    if (!this.enemies.includes(e)) return;
    const y = this.heightAt(e.x, e.z) + 0.5;
    this.fx.burst(e.x, y, e.z, 24, { color: e.erasure ? [0xd8d0d0, 0xb8b0b8, 0xffffff] : this.def.poofColors || [0xffffff, 0xe8e0ff, 0xffe8c0], size: 0.55, speed: 3.5, life: 0.9, grav: 1 });
    this.dust.burst(e.x, y, e.z, 12, { color: 0xf3ead6, size: 0.6, speed: 2, life: 1, grav: -0.5, up: 0.5 });
    audio.sfx('poof');
    this.scene.remove(e.obj);
    if (e.obj.userData.blob) this.scene.remove(e.obj.userData.blob);
    this.enemies.splice(this.enemies.indexOf(e), 1);
    for (let i = 0; i < e.st.lumen + (hasCharm('bell') ? 1 : 0); i++) this.lumenMote(e.x, e.z);
    if (hasCharm('wick') && Math.random() < 0.25) this.heartDrop(e.x, e.z);
    if (e.carry) {
      const c = e.carry;
      const model = c.model();
      this.pickup(model, e.x, e.z, () => c.onPick(), { y: 1, delay: 0.5 });
      this.fx.burst(e.x, y + 0.5, e.z, 20, { color: 0xffe8a0, size: 0.5, speed: 2, life: 1.2, grav: -1 });
    }
    if (this.def.onKill) this.def.onKill(this, e);
  }
  heartDrop(x, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(M.G.sph(0.12, 8, 6), M.basic(0xff8a9a)));
    g.add(M.glow(0xff8a9a, 1.1, 0.8));
    this.pickup(g, x, z, () => { const s = this.game.state; s.hp = Math.min(s.maxHearts * 2, s.hp + 1); audio.sfx('heal'); this.game.hud(); }, { y: 0.5, delay: 0.4 });
  }
  // a glob of ink, lobbed: it lands where the shadow ring was
  shoot(x, z, tx, tz, { dmg = 1, r = 1.1, dur = 0.95, color = 0x2a3060, big = false } = {}) {
    const blob = new THREE.Mesh(M.G.sph(big ? 0.4 : 0.22, 8, 6), new THREE.MeshLambertMaterial({ color, emissive: 0x0a0c20 }));
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 28), new THREE.MeshBasicMaterial({ color: 0x2a2040, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(tx, this.groundAt(tx, tz) + 0.06, tz);
    this.scene.add(blob); this.scene.add(marker);
    this.shots.push({ x0: x, z0: z, y0: this.heightAt(x, z) + 0.8, tx, tz, t: 0, dur, r, dmg, blob, marker, color });
  }
  updateShots(dt) {
    const p = this.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const ty = this.groundAt(s.tx, s.tz);
      s.blob.position.set(lerp(s.x0, s.tx, k), lerp(s.y0, ty, k) + Math.sin(k * Math.PI) * 3.2, lerp(s.z0, s.tz, k));
      s.marker.scale.setScalar(s.r * (0.4 + k * 0.6));
      s.marker.material.opacity = 0.2 + k * 0.5;
      if (k >= 1 || s.dead) {
        this.scene.remove(s.blob); this.scene.remove(s.marker);
        this.shots.splice(i, 1);
        if (s.dead) continue;
        audio.sfx('ink');
        this.dust.burst(s.tx, ty + 0.1, s.tz, 14, { color: [s.color, 0x4a4a80], size: 0.4, speed: 3, life: 0.6, grav: 5, up: 2 });
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(s.r * 0.8, 14), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.6, depthWrite: false }));
        puddle.rotation.x = -Math.PI / 2; puddle.position.set(s.tx, ty + 0.04, s.tz);
        this.scene.add(puddle);
        this.effects.push({ obj: puddle, t: 0, update: (t) => { puddle.material.opacity = 0.6 * (1 - t / 2.5); return t < 2.5; } });
        if (Math.hypot(p.x - s.tx, p.z - s.tz) < s.r && !p.inv) this.hurtPlayer(s.dmg, s.tx, s.tz);
      }
    }
  }
  lumenMote(x, z, n = 1) {
    for (let i = 0; i < n; i++) {
      const g = M.glow(0xfff0a0, 0.6, 0.9);
      const core = new THREE.Mesh(M.G.sph(0.07, 6, 4), M.basic(0xfff6d0)); g.add(core);
      const pk = this.pickup(g, x, z, () => { this.game.state.lumen++; audio.sfx('lumen'); }, { y: 0.6, magnet: true, delay: 0.35 + Math.random() * 0.2 });
      const a = Math.random() * 6.28;
      pk.vx = Math.cos(a) * 3; pk.vz = Math.sin(a) * 3; pk.vy = 4 + Math.random() * 2; pk.mote = true;
      core.material = core.material; core.scale.setScalar(1);
    }
  }
  hurtPlayer(dmg, fx, fz) {
    const p = this.player;
    if (p.inv > 0 || p.dead) return;
    const s = this.game.state;
    s.hp -= dmg;
    if (flag('flare')) { s.flare = Math.min(100, s.flare + 10); this.game.hud(); } // Pell's light burns up when you're knocked about
    p.inv = 1.0; p.hurt = 0.3;
    const dx = p.x - fx, dz = p.z - fz, d = Math.hypot(dx, dz) || 1;
    p.knock = { x: (dx / d) * 10, z: (dz / d) * 10 };
    audio.sfx('hurt');
    this.game.cam.shake = 1;
    this.game.hurtFlash();
    this.fx.burst(p.x, this.heightAt(p.x, p.z) + 0.8, p.z, 12, { color: [0xff8a7a, 0xffd0c0], size: 0.4, speed: 3, life: 0.5 });
    if (s.hp <= 0) { s.hp = 0; p.dead = true; this.game.faint(); }
  }
  animatePlayer(dt) {
    const p = this.player, o = this.pObj, parts = o.userData.parts;
    const gy = this.groundAt(p.x, p.z);
    o.position.set(p.x, gy, p.z);
    o.rotation.y = p.face + (p.spinT > 0 ? (1 - p.spinT / 0.4) * Math.PI * 2 : 0);
    const t = this.t, mv = p.moveAmt;
    const step = Math.sin(t * 13) * mv;
    parts.body.position.y = Math.abs(Math.sin(t * 13)) * 0.09 * mv;
    parts.body.rotation.x = mv * 0.12 + (p.dash > 0 ? 0.3 : 0);
    parts.feet[0].position.z = step * 0.22; parts.feet[1].position.z = -step * 0.22;
    parts.feet[0].position.y = Math.max(0, Math.sin(t * 13)) * 0.12 * mv; parts.feet[1].position.y = Math.max(0, -Math.sin(t * 13)) * 0.12 * mv;
    parts.arms[0].rotation.x = -step * 0.6;
    if (p.atk > 0) {
      const k = 1 - p.atk / 0.28;
      const dir = p.combo === 1 ? -1 : 1;
      parts.arms[1].rotation.x = lerp(-2.4, 0.6, Math.min(1, k * 2.2));
      parts.arms[1].rotation.y = dir * lerp(-0.9, 0.9, Math.min(1, k * 2.2));
      parts.body.rotation.y = dir * lerp(-0.4, 0.4, Math.min(1, k * 2.2));
    } else {
      parts.arms[1].rotation.x = lerp(parts.arms[1].rotation.x, step * 0.6 - 0.3, 0.3);
      parts.arms[1].rotation.y = lerp(parts.arms[1].rotation.y, 0, 0.3);
      parts.body.rotation.y = lerp(parts.body.rotation.y, 0, 0.3);
    }
    // breathing when still
    const br = 1 + Math.sin(t * 2.2) * 0.015 * (1 - Math.min(1, mv));
    parts.body.scale.set(1 / br, br, 1 / br);
    parts.tail.forEach((s, i) => { s.rotation.x = 0.4 * mv + Math.sin(t * 7 - i * 0.9) * (0.12 + mv * 0.25); s.rotation.y = Math.sin(t * 3 - i) * 0.15; });
    o.visible = !(p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0 && p.hurt > -1 && p.inv < 0.98 && p.dash <= 0);
    this.blink(o, dt);
    if (o.userData.blob) o.userData.blob.position.set(p.x, gy + 0.03, p.z);
  }
  blink(o, dt) {
    const ud = o.userData; if (!ud.parts || !ud.parts.eyes) return;
    ud.blink = (ud.blink ?? 3) - dt;
    const closed = ud.blink < 0.12;
    for (const e of ud.parts.eyes) e.scale.y = closed ? 0.15 : 1.25;
    if (ud.blink < 0) ud.blink = 2 + Math.random() * 3;
  }
  updateNPCs(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      n.t += dt;
      const o = n.obj, parts = o.userData.parts;
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      if (n.wander && d > 4 && !ui.busy) {
        n.wt = (n.wt ?? 0) - dt;
        if (n.wt <= 0) { n.wt = 2 + Math.random() * 4; n.wa = Math.random() * 6.28; n.wm = Math.random() > 0.5; if (Math.hypot(n.x - n.hx, n.z - n.hz) > n.wander * 4) n.wa = Math.atan2(n.hz - n.z, n.hx - n.x); }
        if (n.wm) {
          const sp = 1.1 * (n.speed || 1);
          const nx = n.x + Math.cos(n.wa) * sp * dt, nz = n.z + Math.sin(n.wa) * sp * dt;
          if (n.col) { n.col.x = 9999; }
          if (this.walkable(nx, nz, 0.5) && Math.hypot(nx - p.x, nz - p.z) > 1.4) { n.x = nx; n.z = nz; } else n.wt = 0;
          if (n.col) { n.col.x = n.x; n.col.z = n.z; }
          n.face = dampAngle(n.face, Math.atan2(Math.cos(n.wa), Math.sin(n.wa)), 0.1);
        }
        n.moving = n.wm;
      } else n.moving = false;
      if (d < 4.5) n.face = dampAngle(n.face, Math.atan2(p.x - n.x, p.z - n.z), 1 - Math.pow(0.01, dt));
      const gy = this.groundAt(n.x, n.z);
      o.position.set(n.x, gy + (n.y || 0), n.z);
      o.rotation.y = n.face;
      if (parts) {
        if (o.userData.float) parts.body.position.y = 0.3 + Math.sin(n.t * 1.8) * 0.15;
        else if (n.moving) parts.body.position.y = Math.abs(Math.sin(n.t * 10)) * 0.06;
        else { const br = 1 + Math.sin(n.t * 2) * 0.02; parts.body.scale.set(1, br, 1); }
        if (parts.feet && n.moving) { const s = Math.sin(n.t * 10); parts.feet[0].position.z = s * 0.18; parts.feet[1].position.z = -s * 0.18; }
        if (parts.head && !n.noHeadBob) parts.head.rotation.z = Math.sin(n.t * 0.9) * 0.06;
        if (n.talking) parts.body.position.y = Math.abs(Math.sin(n.t * 12)) * 0.05;
        if (parts.tail) parts.tail.rotation.y = Math.sin(n.t * 2) * 0.5;
      }
      if (n.anim) n.anim(n, dt, this);
      this.blink(o, dt);
      if (o.userData.blob) o.userData.blob.position.set(n.x, gy + 0.03, n.z);
    }
  }
  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      const gy = this.heightAt(k.x, k.z);
      if (k.mote) {
        if (k.t < k.delay) { k.x += k.vx * dt; k.z += k.vz * dt; k.vy -= 14 * dt; k.y = Math.max(0.3, k.y + k.vy * dt); }
        else { const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz) || 1; const sp = 6 + k.t * 14; k.x += (dx / d) * sp * dt; k.z += (dz / d) * sp * dt; k.y = lerp(k.y, 0.9, 0.1); }
      } else {
        if (k.spin !== false && k.obj.userData.spin) k.obj.userData.spin.rotation.y += dt * 2;
        k.obj.rotation.y += dt * 0.5;
        k.bob = Math.sin(k.t * 2.5) * 0.15;
      }
      k.obj.position.set(k.x, gy + k.y + (k.bob || 0), k.z);
      if (k.t > k.delay && Math.hypot(p.x - k.x, p.z - k.z) < (k.mote ? 0.6 : 1.1)) {
        this.scene.remove(k.obj);
        this.pickups.splice(i, 1);
        if (!k.mote) { this.fx.burst(k.x, gy + k.y, k.z, 20, { color: [0xfff0b0, 0xffffff], size: 0.4, speed: 3, life: 0.8, grav: -1 }); }
        k.onPick();
      }
    }
  }
  updatePrompts() {
    const p = this.player;
    let best = null, bd = 99;
    for (const it of this.interacts) {
      if (it.enabled && !it.enabled()) continue;
      const x = it.npc ? it.npc.x : it.x, z = it.npc ? it.npc.z : it.z;
      const d = Math.hypot(p.x - x, p.z - z);
      // someone with a "!" wins a near tie, so they can't be crowded out by a neighbour
      const score = it.npc && it.npc.bubble && it.npc.bubble() ? d - 0.9 : d;
      if (d < it.r && score < bd) { bd = score; best = it; }
    }
    this.focus = best;
    ui.prompt(best && !ui.busy && !this.game.transitioning ? `<b>E</b> ${typeof best.label === 'function' ? best.label() : best.label}` : null);
    // speech bubbles over people with something to say
    for (const n of this.npcs) {
      const b = n.bubble ? n.bubble() : null;
      const head = new THREE.Vector3(n.x, this.groundAt(n.x, n.z) + (n.bubbleY || 2.3) + Math.sin(this.t * 3) * 0.06, n.z);
      const s = this.game.toScreen(head);
      ui.bubble(n.bubbleKey, s.x, s.y, b || '', !!b && !ui.busy && s.on);
    }
  }
  dispose() {
    ui.clearBubbles(); ui.prompt(null);
    PAINT.paintOn.value = 0;
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

function sunflower(r) {
  const g = new THREE.Group();
  const h = 1.3 + r() * 0.7;
  g.add(M.vmesh([M.paint(M.xf(M.G.cyl(0.04, 0.06, h, 5), [0, h / 2, 0]), 0x5a8a3a), M.paint(M.xf(M.G.cyl(0.32, 0.32, 0.08, 12), [0, h, 0.05], [1.2, 0, 0]), 0xf3c84a), M.paint(M.xf(M.G.cyl(0.16, 0.16, 0.1, 10), [0, h, 0.09], [1.2, 0, 0]), 0x6a4a2a), M.paint(M.xf(M.G.sph(0.15, 5, 4), [0.1, h * 0.5, 0], [0, 0, 0], [1.5, 0.3, 0.8]), 0x6a9a4a)]));
  return g;
}

// How each settler's home looks and what they say as it grows.
import { SETTLER_LOOKS } from './settlers.js';
import { setupStory } from './story.js';
