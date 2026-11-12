// Voice layer.
// Every line is shown as a caption (for a grown-up to read aloud). If Ryan has recorded
// the clip(s) for it in audio/, they play too. With no clip, say() resolves at once:
// no chime, no fake pause. Web Speech is a developer-only fallback, on with ?tts=1.
//
// say(key) / sayParts([parts]) resolve when the audio ends (true) or is cut off (false).
// A part is a key ("num-8"), or a key with trailing punctuation for the caption ("num-8.").
// Clips are listed in audio/manifest.json: { "clips": { "<key>": "<key>.webm", ... } }.
import { LINES } from './script.js';
import { audioCtx } from './feedback.js';

export const TTS = new URLSearchParams(location.search).get('tts') === '1';

let clips = {};                 // key -> file name, from the manifest
const buffers = new Map();      // key -> Promise<{buf, from, to} | null>
let active = [];                // playing AudioBufferSourceNodes
let seq = 0;
let wake = null;
const talkListeners = new Set();
const captionListeners = new Set();
const synth = TTS ? window.speechSynthesis : null;
let ttsVoice = null;

export const onTalking = (fn) => talkListeners.add(fn);
export const onCaption = (fn) => captionListeners.add(fn);
const setTalk = (on) => talkListeners.forEach((fn) => fn(on));

export const hasClip = (key) => key in clips;
export function coreStatus() {
  const core = Object.values(LINES).filter((l) => l.core);
  return { recorded: core.filter((l) => hasClip(l.key)).length, total: core.length };
}

// ---------- loading ----------
export async function initVoice() {
  try {
    const r = await fetch('audio/manifest.json', { cache: 'no-cache' });
    if (r.ok) clips = (await r.json()).clips || {};
  } catch { clips = {}; }
  if (synth) { pickTtsVoice(); synth.addEventListener('voiceschanged', pickTtsVoice); }
}

// Call after the first click (the audio context needs a user gesture). Decodes every clip.
export function preloadClips() { Object.keys(clips).forEach(loadClip); }

function loadClip(key) {
  if (!buffers.has(key)) {
    const p = fetch(`audio/${clips[key]}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? audioCtx().decodeAudioData(ab) : null))
      .then((buf) => (buf ? trimmed(buf) : null))
      .catch(() => null);
    buffers.set(key, p);
  }
  return buffers.get(key);
}

// Find where sound starts and ends so joined clips ("seventy" + "three") play with no gap.
function trimmed(buf) {
  const d = buf.getChannelData(0);
  const thr = 0.02;
  let a = 0;
  let b = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < thr) a++;
  while (b > a && Math.abs(d[b]) < thr) b--;
  const pad = Math.floor(buf.sampleRate * 0.03);
  const from = Math.max(0, a - pad) / buf.sampleRate;
  const to = Math.min(d.length, b + pad) / buf.sampleRate;
  return to > from ? { buf, from, to } : { buf, from: 0, to: buf.duration };
}

// ---------- parts ----------
// A part "~600" is a 600 ms pause: silence in the audio and "…" in the caption.
const PAUSE = /^~(\d+)$/;

function parse(part) {
  const pm = PAUSE.exec(part);
  if (pm) return { key: part, punct: '', pause: Number(pm[1]), line: { key: part, text: '…' } };
  let key = part;
  let punct = '';
  if (!(key in LINES) && /[.!?,]$/.test(key)) { punct = key.slice(-1); key = key.slice(0, -1); }
  const line = LINES[key];
  if (!line && !/^num-\d+$/.test(key)) console.warn('voice: unknown line key', key); // 21-99 are built from two clips
  return { key, punct, line: line || { key, text: '' } };
}

// 21-99 (not tens) are played as tens + ones clips.
function clipKeysFor(key) {
  const m = /^num-(\d+)$/.exec(key);
  if (m) {
    const n = Number(m[1]);
    if (n > 20 && n < 100 && n % 10) return [`num-${n - (n % 10)}`, `num-${n % 10}`];
  }
  return [key];
}

function captionOf(item) {
  const m = /^num-(\d+)$/.exec(item.key);
  const text = m ? m[1] : (item.line.caption ?? item.line.text);
  return text + item.punct;
}

// ---------- speaking ----------
export function stop() {
  seq++;
  for (const s of active) { try { s.stop(); } catch { /* already stopped */ } }
  active = [];
  if (synth) synth.cancel();
  if (wake) { const w = wake; wake = null; w(); }
  setTalk(false);
}

function waitFor(start, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (wake === fin) wake = null;
      resolve();
    };
    const timer = setTimeout(fin, timeoutMs);
    wake = fin;
    start(fin);
  });
}

// keys: clip keys, or numbers for pauses in ms.
async function playClips(keys, my) {
  const parts = await Promise.all(keys.map((k) => (typeof k === 'number' ? { pause: k } : loadClip(k))));
  if (my !== seq || parts.some((p) => !p)) return;
  const c = audioCtx();
  let t = c.currentTime + 0.02;
  const srcs = parts.flatMap((p) => {
    if (p.pause) { t += p.pause / 1000; return []; }
    const s = c.createBufferSource();
    s.buffer = p.buf;
    s.connect(c.destination);
    s.start(t, p.from, p.to - p.from);
    t += p.to - p.from;
    return s;
  });
  active = srcs;
  setTalk(true);
  await waitFor((fin) => { srcs[srcs.length - 1].onended = fin; }, (t - c.currentTime) * 1000 + 600);
}

export function say(key) { return sayParts([key]); }

export async function sayParts(parts, opts = {}) {
  stop();
  const my = seq;
  const items = (Array.isArray(parts) ? parts : [parts]).map(parse);
  // Word clips are lower case ("pig"): a sentence in the caption still starts with a capital.
  // A pause shows as "…" between sounds, but not after a full stop.
  const shown = items.filter((it, i) => !(it.pause && (i === 0 || /[.!?,]$/.test(captionOf(items[i - 1])))));
  const caption = shown.map(captionOf).join(' ').replace(/(^|[.!?] )([a-z])/g, (_, p, c) => p + c.toUpperCase());
  captionListeners.forEach((fn) => fn(caption, opts));
  // Optional clips (anchor words) are skipped when missing; everything else must be recorded.
  const keys = items.filter((i) => !(i.line.optional && !hasClip(i.key)))
    .flatMap((i) => (i.pause ? [i.pause] : clipKeysFor(i.key)));
  const clipKeys = keys.filter((k) => typeof k === 'string');
  try {
    if (clipKeys.length && clipKeys.every(hasClip)) await playClips(keys, my);
    else if (synth) await speakTts(items, my);
  } finally {
    if (my === seq) setTalk(false);
  }
  return my === seq;
}

// ---------- developer TTS fallback (?tts=1) ----------
function pickTtsVoice() {
  const rank = (v) => {
    const nat = /Natural|Online/i.test(v.name);
    if (nat && /Aria|Jenny|Ava|Emma/i.test(v.name)) return 0;
    if (nat && /en-US/i.test(v.lang)) return 1;
    if (/Google US English/i.test(v.name)) return 2;
    return /en-US/i.test(v.lang) ? 3 : 4;
  };
  ttsVoice = synth.getVoices().filter((v) => /^en/i.test(v.lang)).sort((a, b) => rank(a) - rank(b))[0] || null;
}

async function speakTts(items, my) {
  const segs = [];
  for (const it of items) {
    if (it.pause) { segs.push({ pause: it.pause }); continue; }
    const m = /^num-(\d+)$/.exec(it.key);
    const raw = m ? m[1] : (it.line.tts ?? it.line.text);
    const list = (Array.isArray(raw) ? raw : [raw]).map((s) => (typeof s === 'string' ? { t: s } : { ...s }));
    if (it.punct && list.length) list[list.length - 1].t += it.punct;
    for (const s of list) {
      const last = segs[segs.length - 1];
      if (last && !last.rate && !s.rate && !last.pause) last.t += ' ' + s.t; else segs.push(s);
    }
  }
  setTalk(true);
  for (const s of segs) {
    if (my !== seq) return;
    if (s.pause) { await waitFor(() => {}, s.pause); continue; }
    await waitFor((fin) => {
      const u = new SpeechSynthesisUtterance(s.t);
      if (ttsVoice) { u.voice = ttsVoice; u.lang = ttsVoice.lang; }
      u.rate = 0.88 * (s.rate || 1);
      u.pitch = 1.05;
      u.onend = fin;
      u.onerror = fin;
      synth.speak(u);
    }, 3000 + s.t.length * 120);
  }
}
