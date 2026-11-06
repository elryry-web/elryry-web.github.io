// All sound is synthesized: a small generative harp-and-pad band plus sound effects.
import { mulberry32 } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const THEMES = {
  title:   { root: 62, mode: [0, 2, 4, 7, 9], tempo: 76, chords: [0, 5, 3, 4], lead: 'bell', pad: 0.5, bass: 0.0, density: 0.45, seed: 3 },
  map:     { root: 62, mode: [0, 2, 4, 5, 7, 9, 11], tempo: 84, chords: [0, 3, 5, 4], lead: 'harp', pad: 0.45, bass: 0.35, density: 0.55, seed: 11 },
  home:    { root: 65, mode: [0, 2, 4, 7, 9], tempo: 80, chords: [0, 3, 0, 4], lead: 'harp', pad: 0.4, bass: 0.35, density: 0.6, seed: 5 },
  shore:   { root: 64, mode: [0, 2, 4, 5, 7, 9, 11], tempo: 72, chords: [0, 3, 4, 0], lead: 'flute', pad: 0.55, bass: 0.3, density: 0.45, seed: 21 },
  orchard: { root: 67, mode: [0, 2, 4, 7, 9], tempo: 96, chords: [0, 4, 5, 3], lead: 'harp', pad: 0.35, bass: 0.45, density: 0.7, seed: 8 },
  marsh:   { root: 62, mode: [0, 2, 3, 5, 7, 9, 10], tempo: 66, chords: [0, 3, 6, 0], lead: 'bell', pad: 0.6, bass: 0.3, density: 0.35, seed: 14 },
  archive: { root: 60, mode: [0, 2, 3, 5, 7, 8, 10], tempo: 70, chords: [0, 5, 3, 4], lead: 'bell', pad: 0.55, bass: 0.25, density: 0.4, seed: 30 },
  teacup:  { root: 65, mode: [0, 2, 4, 5, 7, 9, 11], tempo: 112, chords: [0, 3, 4, 0], lead: 'harp', pad: 0.3, bass: 0.55, density: 0.8, seed: 41, swing: 0.18 },
  giant:   { root: 57, mode: [0, 2, 4, 7, 9], tempo: 60, chords: [0, 3, 5, 3], lead: 'flute', pad: 0.65, bass: 0.4, density: 0.3, seed: 52 },
  margin:  { root: 64, mode: [0, 2, 4, 6, 7, 9, 11], tempo: 64, chords: [0, 4, 5, 1], lead: 'bell', pad: 0.5, bass: 0.2, density: 0.3, seed: 77 },
  farbank: { root: 69, mode: [0, 2, 4, 7, 9], tempo: 58, chords: [0, 5, 3, 4], lead: 'bell', pad: 0.7, bass: 0.1, density: 0.25, seed: 90 },
  // the grey: minor, hurried, still a bit sweet, because the Smudge isn't cruel
  erasure: { root: 57, mode: [0, 2, 3, 5, 7, 8, 10], tempo: 124, chords: [0, 5, 3, 6], lead: 'harp', pad: 0.45, bass: 0.7, density: 0.75, seed: 63 },
  smudge:  { root: 52, mode: [0, 2, 3, 5, 7, 8, 11], tempo: 132, chords: [0, 5, 6, 4], lead: 'bell', pad: 0.55, bass: 0.8, density: 0.8, seed: 99 },
};

export class AudioEngine {
  constructor() { this.ctx = null; this.theme = null; this.muted = false; this.musicVol = 0.5; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.45;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol;
    this.music.connect(this.master); this.music.connect(this.reverb);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master); this.sfxBus.connect(this.reverb);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.step = 0; this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
    if (this.pending) { const p = this.pending; this.pending = null; this.setTheme(p); }
  }
  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1); }
  setTheme(name) {
    if (!this.ctx) { this.pending = name; return; }
    if (this.themeName === name) return;
    this.themeName = name;
    const th = THEMES[name] || THEMES.map;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.25);
    setTimeout(() => {
      this.theme = th; this.rng = mulberry32(th.seed); this.step = 0; this.motif = null;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.music.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.6);
    }, 650);
  }
  // A mood can push the music softer (e.g. during sad dialogue).
  duck(amount, sec = 1) { if (!this.ctx) return; this.music.gain.setTargetAtTime(this.musicVol * amount, this.ctx.currentTime, sec); }

  scale(th, deg, oct = 0) {
    const m = th.mode, n = m.length;
    const o = Math.floor(deg / n);
    return th.root + m[((deg % n) + n) % n] + 12 * (o + oct);
  }
  makeMotif() {
    const r = this.rng, th = this.theme;
    const steps = [];
    let deg = Math.floor(r() * 3) + th.mode.length;
    for (let i = 0; i < 16; i++) {
      const strong = i % 4 === 0;
      if (!strong && r() > th.density) { steps.push(null); continue; }
      deg += Math.floor((r() - 0.5) * 4.2);
      deg = Math.max(th.mode.length - 2, Math.min(th.mode.length * 2 + 2, deg));
      steps.push({ deg, len: r() > 0.7 ? 2 : 1 });
    }
    return steps;
  }
  schedule() {
    if (!this.theme || !this.ctx) return;
    const th = this.theme, ctx = this.ctx;
    const eighth = 60 / th.tempo / 2;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const step = this.step, bar = Math.floor(step / 8), inBar = step % 8;
      const phrase = Math.floor(bar / 2) % 4; // A A' B A
      if (step % 16 === 0) {
        if (!this.motif || phrase === 0 && bar % 8 === 0) this.motif = this.makeMotif();
        if (phrase === 2) this.motifB = this.makeMotif();
      }
      const chordDeg = th.chords[bar % th.chords.length];
      let t = this.nextTime;
      if (th.swing && step % 2 === 1) t += eighth * th.swing;
      if (inBar === 0) {
        if (th.pad > 0) for (const d of [0, 2, 4]) this.pad(mtof(this.scale(th, chordDeg + d, -1)), t, eighth * 8, th.pad * 0.05);
        if (th.bass > 0) this.pluck(mtof(this.scale(th, chordDeg, -2)), t, 1.6, th.bass * 0.22, 'sine');
      }
      if (inBar === 4 && th.bass > 0) this.pluck(mtof(this.scale(th, chordDeg + (this.rng() > 0.5 ? 4 : 0), -2)), t, 1.2, th.bass * 0.15, 'sine');
      const src = phrase === 2 ? this.motifB : this.motif;
      const n = src && src[step % 16];
      if (n) {
        let deg = n.deg;
        if (phrase === 1 && step % 16 > 11) deg += this.rng() > 0.5 ? 1 : -1;
        // pull strong beats toward the chord
        if (inBar % 4 === 0) { const ct = [chordDeg, chordDeg + 2, chordDeg + 4]; let best = deg, bd = 99; for (const c of ct) for (const o of [-7, 0, 7]) { const dd = Math.abs(c + o - deg); if (dd < bd) { bd = dd; best = c + o; } } deg = best; }
        const f = mtof(this.scale(th, deg));
        const dur = eighth * n.len * 2.2;
        if (th.lead === 'bell') this.bell(f, t, dur * 1.6, 0.1);
        else if (th.lead === 'flute') this.flute(f, t, dur, 0.07);
        else this.pluck(f, t, dur * 1.4, 0.12, 'triangle');
      }
      // sparkle arpeggio on the last bar of a phrase pair
      if (bar % 4 === 3 && inBar >= 4 && this.rng() > 0.4) this.bell(mtof(this.scale(th, chordDeg + (inBar - 4) * 2, 2)), t, 1.2, 0.025);
      this.nextTime += eighth;
      this.step++;
    }
  }
  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  pluck(f, t, dur, vol, type = 'triangle', bus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.001;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus || this.music);
    this.env(g, t, 0.005, vol, dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  bell(f, t, dur, vol, bus) {
    const ctx = this.ctx;
    for (const [ratio, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * ratio;
      o.connect(g); g.connect(bus || this.music);
      this.env(g, t, 0.004, vol * v, dur / ratio * 1.3);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  flute(f, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    lfo.frequency.value = 5; lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.35); lfo.stop(t + dur + 0.35);
  }
  pad(f, t, dur, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    lp.connect(g); g.connect(this.music);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.2);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.1);
  }
  noise(t, dur, vol, { type = 'bandpass', f0 = 1200, f1 = 400, q = 1 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = type; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    s.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    this.env(g, t, 0.01, vol, dur);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  sweep(t, f0, f1, dur, vol, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    this.env(g, t, 0.005, vol, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  sfx(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    const th = this.theme || THEMES.map;
    const pent = (i, o = 0) => mtof(this.scale({ ...th, mode: [0, 2, 4, 7, 9] }, i, o));
    switch (name) {
      case 'swing': this.noise(t, 0.18, 0.25, { f0: 600 + (opt.combo || 0) * 300, f1: 2400, q: 1.5 }); break;
      case 'hit': this.sweep(t, 180, 60, 0.15, 0.5); this.noise(t, 0.06, 0.4, { type: 'highpass', f0: 2000, f1: 4000 }); break;
      case 'hurt': this.sweep(t, 440, 150, 0.3, 0.2, 'square'); this.noise(t, 0.2, 0.25, { f0: 800, f1: 200 }); break;
      case 'poof': this.noise(t, 0.4, 0.35, { f0: 3000, f1: 300 }); for (let i = 0; i < 3; i++) this.bell(pent(i * 2, 1), t + 0.05 + i * 0.06, 0.6, 0.06, this.sfxBus); break;
      case 'pickup': for (let i = 0; i < 3; i++) this.bell(pent(i + 4, 1), t + i * 0.07, 0.8, 0.08, this.sfxBus); break;
      case 'lumen': this.bell(pent(7 + Math.floor(Math.random() * 3), 1), t, 0.4, 0.03, this.sfxBus); break;
      case 'item': for (let i = 0; i < 6; i++) this.bell(pent(i * 2, 0), t + i * 0.09, 1.6, 0.09, this.sfxBus); break;
      case 'unfold':
        for (let i = 0; i < 14; i++) this.pluck(pent(i, -1), t + i * 0.07, 2.2, 0.12, 'triangle', this.sfxBus);
        for (const d of [0, 2, 4]) this.bell(pent(d + 5, 0), t + 1.0, 3, 0.07, this.sfxBus);
        this.noise(t, 1.6, 0.12, { f0: 300, f1: 6000, q: 0.6 });
        break;
      case 'kinship': for (const [i, d] of [[0, 0], [1, 2], [2, 4], [3, 7]]) this.bell(pent(d + 3, 0), t + i * 0.16, 3, 0.09, this.sfxBus); break;
      case 'blip': {
        const p = opt.pitch || 1;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = opt.wave || 'triangle'; o.frequency.value = 330 * p * (0.94 + Math.random() * 0.12);
        o.connect(g); g.connect(this.sfxBus);
        this.env(g, t, 0.004, 0.05, 0.06);
        o.start(t); o.stop(t + 0.08);
        break;
      }
      case 'select': this.bell(pent(5, 1), t, 0.3, 0.05, this.sfxBus); break;
      case 'open': this.bell(pent(2, 1), t, 0.5, 0.05, this.sfxBus); this.bell(pent(4, 1), t + 0.06, 0.5, 0.05, this.sfxBus); break;
      case 'close': this.bell(pent(4, 1), t, 0.5, 0.04, this.sfxBus); this.bell(pent(2, 1), t + 0.06, 0.5, 0.04, this.sfxBus); break;
      case 'dash': this.noise(t, 0.22, 0.2, { f0: 400, f1: 1600, q: 0.8 }); break;
      case 'stone': this.bell(opt.freq || 220, t, 4, 0.18, this.sfxBus); this.bell((opt.freq || 220) * 1.5, t + 0.02, 3, 0.05, this.sfxBus); break;
      case 'purr': {
        const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
        const g = this.ctx.createGain(), am = this.ctx.createOscillator(), amg = this.ctx.createGain();
        am.frequency.value = 24; amg.gain.value = 0.25; am.connect(amg); amg.connect(g.gain);
        s.connect(lp); lp.connect(g); g.connect(this.sfxBus);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.6);
        s.start(t); am.start(t); s.stop(t + 1.7); am.stop(t + 1.7);
        break;
      }
      case 'splash': this.noise(t, 0.5, 0.2, { f0: 2000, f1: 500, q: 0.5 }); break;
      case 'heal': for (let i = 0; i < 4; i++) this.bell(pent(i * 2 + 2, 1), t + i * 0.05, 1, 0.05, this.sfxBus); break;
      case 'door': this.noise(t, 0.3, 0.15, { type: 'lowpass', f0: 400, f1: 200 }); break;
      case 'charge': this.sweep(t, 220, 660, 0.5, 0.06, 'triangle'); break;
      case 'charged': for (let i = 0; i < 3; i++) this.bell(pent(i * 2 + 5, 1), t + i * 0.04, 0.7, 0.07, this.sfxBus); break;
      case 'spin': this.noise(t, 0.4, 0.35, { f0: 500, f1: 3200, q: 1.2 }); this.sweep(t, 300, 900, 0.3, 0.12, 'triangle'); break;
      case 'perfect': this.sweep(t, 1400, 500, 0.5, 0.1, 'sine'); for (let i = 0; i < 4; i++) this.bell(pent(9 - i, 1), t + i * 0.05, 1.2, 0.06, this.sfxBus); break;
      case 'flare': this.noise(t, 1.2, 0.3, { f0: 200, f1: 5000, q: 0.5 }); for (let i = 0; i < 6; i++) this.bell(pent(i * 2, 0), t + i * 0.03, 2.4, 0.08, this.sfxBus); break;
      case 'clink': this.bell(1800, t, 0.25, 0.08, this.sfxBus); this.bell(2600, t + 0.01, 0.2, 0.05, this.sfxBus); break;
      case 'ink': this.noise(t, 0.35, 0.25, { type: 'lowpass', f0: 900, f1: 120, q: 2 }); this.sweep(t, 160, 70, 0.3, 0.2); break;
      case 'spit': this.sweep(t, 300, 900, 0.12, 0.1, 'square'); break;
      case 'erase': this.noise(t, 0.6, 0.25, { f0: 1200, f1: 2600, q: 3 }); this.noise(t + 0.2, 0.6, 0.2, { f0: 2400, f1: 1000, q: 3 }); break;
      case 'grey': this.sweep(t, 220, 110, 1.4, 0.15, 'sawtooth'); this.noise(t, 1.2, 0.15, { f0: 600, f1: 200 }); break;
      case 'restore': for (let i = 0; i < 10; i++) this.pluck(pent(i, 0), t + i * 0.06, 1.8, 0.1, 'triangle', this.sfxBus); this.bell(pent(9, 1), t + 0.7, 3, 0.08, this.sfxBus); break;
    }
  }
}
export const audio = new AudioEngine();
