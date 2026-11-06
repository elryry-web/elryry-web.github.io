// DOM overlay: dialogue, choices, toasts, title cards, HUD, panels, floating text.
import { audio } from './audio.js';
import { state, ELEMENTS, ELEMENT_INFO } from './state.js';

const $ = (id) => document.getElementById(id);

// Hand-drawn keepsake icons.
export const ICONS = {
  seed: `<svg viewBox="0 0 48 48"><defs><radialGradient id="gs" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#fff3c0"/><stop offset=".6" stop-color="#f0b84a"/><stop offset="1" stop-color="#b8702a"/></radialGradient></defs><circle cx="24" cy="26" r="15" fill="#ffd77a" opacity=".25"/><path d="M24 10c8 6 11 12 11 18a11 11 0 0 1-22 0c0-6 3-12 11-18z" fill="url(#gs)" stroke="#6a4a2a" stroke-width="1.5"/><path d="M24 10c-1 4 0 8 3 11" stroke="#6a4a2a" stroke-width="1.2" fill="none"/></svg>`,
  jar: `<svg viewBox="0 0 48 48"><rect x="15" y="8" width="18" height="6" rx="2" fill="#a07a52" stroke="#5a4030"/><path d="M14 16h20v20a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#cfe9ef" stroke="#4a6a7a" stroke-width="1.5"/><path d="M15 27c4-3 7 3 11 0s5-2 7 0v9a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6z" fill="#5fb3b8" opacity=".85"/><path d="M18 19v8" stroke="#fff" stroke-width="2" opacity=".7"/></svg>`,
  bell: `<svg viewBox="0 0 48 48"><path d="M24 8a3 3 0 0 1 3 3c7 2 9 9 9 16l3 7H9l3-7c0-7 2-14 9-16a3 3 0 0 1 3-3z" fill="#c79a4a" stroke="#6a4a2a" stroke-width="1.5"/><path d="M12 31c5-2 9 2 13 0s8-2 11 0l3 3H9z" fill="#6f7f6a" opacity=".8"/><circle cx="24" cy="38" r="3" fill="#8a6a3a"/><path d="M17 20c1-4 3-6 6-7" stroke="#fff3c0" stroke-width="1.5" fill="none" opacity=".7"/></svg>`,
  bookmark: `<svg viewBox="0 0 48 48"><path d="M16 6h16v36l-8-6-8 6z" fill="#f3ead6" stroke="#8a6a4a" stroke-width="1.5"/><circle cx="24" cy="17" r="3.5" fill="#d8869a"/><circle cx="21" cy="21" r="2.5" fill="#e8a8b8"/><circle cx="27" cy="22" r="2.5" fill="#c8a0d8"/><path d="M24 22v10" stroke="#6a9a4a" stroke-width="1.5"/><path d="M24 28c3-2 4-1 5 0" stroke="#6a9a4a" stroke-width="1.2" fill="none"/></svg>`,
  teacup: `<svg viewBox="0 0 48 48"><path d="M8 18h26v6a13 13 0 0 1-26 0z" fill="#e9c9c0" stroke="#8a5a4a" stroke-width="1.5"/><path d="M34 21a5 5 0 0 1 0 9" fill="none" stroke="#8a5a4a" stroke-width="2.5"/><ellipse cx="21" cy="38" rx="15" ry="3" fill="#f3efe8" stroke="#8a5a4a"/><path d="M24 18l3 4 2-4" fill="#fdf8f0" stroke="#8a5a4a"/><path d="M17 9c-2 3 2 4 0 7M23 7c-2 3 2 4 0 8" stroke="#bfc8d8" stroke-width="1.5" fill="none"/></svg>`,
  button: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#a07a52" stroke="#5a4030" stroke-width="2"/><circle cx="24" cy="24" r="12" fill="none" stroke="#7a5a3a" stroke-width="1.5"/><circle cx="20" cy="20" r="2.4" fill="#4a3424"/><circle cx="28" cy="20" r="2.4" fill="#4a3424"/><circle cx="20" cy="28" r="2.4" fill="#4a3424"/><circle cx="28" cy="28" r="2.4" fill="#4a3424"/><path d="M12 18a13 13 0 0 1 8-7" stroke="#e8c898" stroke-width="2" fill="none" opacity=".6"/></svg>`,
  pencil: `<svg viewBox="0 0 48 48"><path d="M10 38l4-11 20-20 7 7-20 20z" fill="#e8b04a" stroke="#6a4a2a" stroke-width="1.5"/><path d="M10 38l4-11 7 7z" fill="#f3e2c0" stroke="#6a4a2a" stroke-width="1.2"/><path d="M10 38l2-5 3 3z" fill="#3a3a44"/><path d="M34 7l7 7 2-2a2 2 0 0 0 0-3l-4-4a2 2 0 0 0-3 0z" fill="#d88a8a" stroke="#6a4a2a"/></svg>`,
};
export const elementPips = (a) => ELEMENTS.filter((e) => a[e] > 0).map((e) => `<span class="pip" style="--c:${ELEMENT_INFO[e].color}" title="${ELEMENT_INFO[e].name}">${ELEMENT_INFO[e].name} ${'●'.repeat(a[e])}</span>`).join('');

class UI {
  constructor() {
    this.dialogOpen = false;
    this.bubbles = new Map();
    this.waiters = [];
    document.addEventListener('keydown', (e) => {
      if (['e', 'E', ' ', 'Enter'].includes(e.key)) this.advance();
      if (this.choiceOpen) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= this.choiceButtons.length) this.choiceButtons[n - 1].click();
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.moveChoice(1);
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.moveChoice(-1);
      }
    });
    $('dialog').addEventListener('pointerdown', () => this.advance());
  }
  get busy() { return this.dialogOpen || this.panelOpen; }

  // ---------- dialogue ----------
  async say(name, text, { voice = {}, color = '#6a4a3a' } = {}) {
    this.dialogOpen = true;
    const box = $('dialog');
    box.classList.add('show');
    $('dname').textContent = name || '';
    $('dname').style.display = name ? 'block' : 'none';
    $('dname').style.background = color;
    const body = $('dtext');
    body.innerHTML = '';
    $('dnext').style.opacity = 0;
    const chars = [...text];
    const spans = chars.map((ch) => { const s = document.createElement('span'); s.textContent = ch; s.className = 'ch'; body.appendChild(s); return s; });
    let i = 0, skip = false;
    this._skip = () => { skip = true; };
    await new Promise((resolve) => {
      const tick = () => {
        if (skip) { spans.forEach((s) => s.classList.add('on')); i = spans.length; }
        if (i >= spans.length) return resolve();
        const s = spans[i++];
        s.classList.add('on');
        if (i % 2 === 0 && /\S/.test(chars[i - 1])) audio.sfx('blip', voice);
        const pause = /[.,!?…—]/.test(chars[i - 1]) && !/[.,!?…]/.test(chars[i] || '') ? 90 : 22;
        setTimeout(tick, pause);
      };
      tick();
    });
    $('dnext').style.opacity = 1;
    await new Promise((resolve) => { this._skip = null; this._next = resolve; });
    this._next = null;
  }
  advance() {
    if (this.choiceOpen) { const b = this.choiceButtons[this.choiceIdx]; if (b && this._choiceReady) b.click(); return; }
    if (this._skip) { this._skip(); return; }
    if (this._next) { audio.sfx('select'); this._next(); }
  }
  closeDialog() { this.dialogOpen = false; $('dialog').classList.remove('show'); }
  async choose(options) {
    const wrap = $('choices');
    wrap.innerHTML = '';
    this.choiceOpen = true; this.choiceIdx = 0; this._choiceReady = false;
    setTimeout(() => (this._choiceReady = true), 250);
    const res = await new Promise((resolve) => {
      this.choiceButtons = options.map((o, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `<span class="num">${i + 1}</span>${o}`;
        b.onclick = (ev) => { ev && ev.stopPropagation(); resolve(i); };
        b.onmouseenter = () => { this.choiceIdx = i; this.paintChoice(); };
        wrap.appendChild(b);
        return b;
      });
      wrap.classList.add('show');
      this.paintChoice();
    });
    audio.sfx('select');
    wrap.classList.remove('show');
    this.choiceOpen = false;
    return res;
  }
  moveChoice(d) { this.choiceIdx = (this.choiceIdx + d + this.choiceButtons.length) % this.choiceButtons.length; this.paintChoice(); audio.sfx('blip', { pitch: 2 }); }
  paintChoice() { this.choiceButtons.forEach((b, i) => b.classList.toggle('sel', i === this.choiceIdx)); }

  async poem(title, lines) {
    this.panelOpen = true;
    const el = $('poem');
    el.innerHTML = `<h3>${title}</h3>` + lines.map((l, i) => `<p style="animation-delay:${0.6 + i * 0.9}s">${l}</p>`).join('') + `<div class="hint" style="animation-delay:${1 + lines.length * 0.9}s">press E</div>`;
    el.classList.add('show');
    audio.duck(0.25);
    await new Promise((r) => setTimeout(r, 1000 + lines.length * 900));
    await this.waitKey();
    el.classList.remove('show');
    audio.duck(1);
    this.panelOpen = false;
  }
  waitKey() {
    return new Promise((resolve) => {
      const h = (e) => { if (e.type === 'pointerdown' || ['e', 'E', ' ', 'Enter', 'Escape'].includes(e.key)) { document.removeEventListener('keydown', h); document.removeEventListener('pointerdown', h); resolve(); } };
      setTimeout(() => { document.addEventListener('keydown', h); document.addEventListener('pointerdown', h); }, 200);
    });
  }

  // ---------- notices ----------
  toast(html, ms = 4200, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = html;
    $('toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 800); }, ms);
  }
  titleCard(name, sub) {
    const el = $('titlecard');
    el.innerHTML = `<div class="tc-line"></div><h2>${name}</h2><p>${sub || ''}</p><div class="tc-line"></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.remove('show'); return; }
    el.innerHTML = text;
    el.classList.add('show');
  }
  float(text, x, y, cls = '') {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('floats').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  bubble(key, x, y, text, show = true) {
    let el = this.bubbles.get(key);
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; $('bubbles').appendChild(el); this.bubbles.set(key, el); }
    if (el._t !== text) { el.textContent = text; el._t = text; }
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    el.style.display = show ? 'block' : 'none';
  }
  clearBubbles() { for (const el of this.bubbles.values()) el.remove(); this.bubbles.clear(); }

  // ---------- HUD ----------
  hud(mode, info = {}) {
    const h = $('hud');
    h.style.display = mode === 'title' ? 'none' : 'flex';
    let hearts = '';
    for (let i = 0; i < state.maxHearts; i++) {
      const v = Math.max(0, Math.min(2, state.hp - i * 2));
      hearts += `<span class="heart h${v}"></span>`;
    }
    $('hearts').innerHTML = mode === 'land' ? hearts : '';
    // Pell's light, filling as you fight
    const fl = $('flare');
    if (mode === 'land' && state.flags.flare) {
      if (!fl.querySelector('.flare-bar')) fl.innerHTML = '<span class="flare-lamp"><span></span></span><span class="flare-col"><span class="flare-label"></span><span class="flare-bar"><span class="flare-fill"></span></span></span>';
      const v = Math.round(state.flare), ready = v >= 100;
      fl.style.display = 'flex';
      fl.classList.toggle('ready', ready);
      fl.querySelector('.flare-lamp span').style.height = v + '%';
      fl.querySelector('.flare-fill').style.width = v + '%';
      fl.querySelector('.flare-label').innerHTML = ready ? 'Pell\'s Light · <b>press F</b>' : `Pell's Light · ${v}%`;
      if (this._flareV != null && v > this._flareV && !ready) { fl.classList.remove('tick'); void fl.offsetWidth; fl.classList.add('tick'); }
      this._flareV = v;
    } else fl.style.display = 'none';
    $('lumen').innerHTML = `<span class="lumdot"></span>${state.lumen}`;
    const ph = ['Morning', 'Midday', 'Dusk', 'Night'][state.day % 4];
    $('daytime').textContent = `Day ${Math.floor(state.day / 4) + 1} · ${ph}`;
    $('where').textContent = info.where || '';
  }

  // pressing F before the light is full: a little shake so you know why nothing happened
  flareNudge() {
    const fl = $('flare');
    fl.classList.remove('nudge'); void fl.offsetWidth; fl.classList.add('nudge');
  }

  bossBar(name, frac) {
    const el = $('bossbar');
    if (name == null) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.innerHTML = `<div class="boss-name">${name}</div><div class="boss-track"><span style="width:${Math.round(frac * 100)}%"></span></div>`;
  }
  timer(text) {
    const el = $('timer');
    el.style.display = text ? 'block' : 'none';
    if (text) el.innerHTML = text;
  }

  // ---------- panels ----------
  async panel(html, { wide = false, onMount } = {}) {
    this.panelOpen = true;
    audio.sfx('open');
    const el = $('panel');
    el.className = 'show' + (wide ? ' wide' : '');
    el.innerHTML = `<div class="panel-inner">${html}<button class="close" id="pclose">Close <small>(Esc)</small></button></div>`;
    let done;
    const p = new Promise((r) => (done = r));
    const close = (v) => { el.className = ''; this.panelOpen = false; document.removeEventListener('keydown', kh); audio.sfx('close'); done(v); };
    const kh = (e) => { if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); } };
    setTimeout(() => document.addEventListener('keydown', kh), 50);
    $('pclose').onclick = () => close();
    if (onMount) onMount(el, close);
    return p;
  }
}
export const ui = new UI();
