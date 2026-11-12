// Pip's recorder: a page for Ryan to record every line in js/script.js.
// It writes audio/<key>.webm into the folder he picks and keeps audio/manifest.json up to date.
// Needs the File System Access API (Chrome or Edge on a computer). ?nofs=1 fakes its absence.
//
// Silence: a take is played back once with the silence trimmed off (the same rule as voice.js,
// and the first and last moments are ignored so the Space key's click doesn't count). That
// playback is recorded again, so the saved file is the trimmed take.
import { SCRIPT } from './script.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FS_OK = 'showDirectoryPicker' in window && params.get('nofs') !== '1';
const REC_OK = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const MIME = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';

// ---------- the lines, core first ----------
const sections = [
  { title: 'Record these first', sub: 'She needs these to play on her own.', groups: SCRIPT.map((g) => ({ group: g.group, lines: g.lines.filter((l) => l.core) })) },
  { title: 'Everything else', sub: 'Until these are recorded, she needs a grown-up to read the captions.', groups: SCRIPT.map((g) => ({ group: g.group, lines: g.lines.filter((l) => !l.core) })) },
];
const FIRST = ['Numbers', 'Letters'];
const rank = (g) => (FIRST.includes(g.group) ? FIRST.indexOf(g.group) : FIRST.length);
sections[0].groups.sort((a, b) => rank(a) - rank(b));
sections.forEach((s) => { s.groups = s.groups.filter((g) => g.lines.length); });
const order = sections.flatMap((s) => s.groups.flatMap((g) => g.lines));
const isCore = new Set(order.filter((l) => l.core).map((l) => l.key));

// ---------- state ----------
let clips = {};          // key -> file name (the manifest)
let folder = null;       // the audio directory handle
let sel = 0;
let rows = [];
let state = 'idle';      // idle | rec | play | take | saving
let take = null;         // { buf, from, to, peak, blob: Promise<Blob|null> }
let stream = null;
let ac = null;
let analyser = null;
let recorder = null;
let playing = null;

// ---------- small IndexedDB store for the folder handle ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('aa-recorder', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  try {
    const db = await idb();
    return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
  } catch { return undefined; }
}
async function idbSet(k, v) {
  try {
    const db = await idb();
    await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; });
  } catch { /* the handle just isn't remembered */ }
}

// ---------- folder and manifest ----------
async function useFolder(h) {
  let dir = h;
  if (h.name !== 'audio') { try { dir = await h.getDirectoryHandle('audio'); } catch { /* use what he picked */ } }
  const files = new Set();
  for await (const [name, e] of dir.entries()) if (e.kind === 'file') files.add(name);
  if (!files.has('manifest.json')) {
    showErr(`"${dir.name}" has no manifest.json. Choose the audio folder inside acorn-and-abacus.`);
    return false;
  }
  folder = dir;
  let listed = {};
  try { listed = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text()).clips || {}; } catch { listed = {}; }
  // The files on disk are the truth: drop entries whose file is gone, add files that aren't listed.
  clips = {};
  for (const [k, f] of Object.entries(listed)) if (files.has(f)) clips[k] = f;
  for (const l of order) if (!clips[l.key] && files.has(`${l.key}.webm`)) clips[l.key] = `${l.key}.webm`;
  if (JSON.stringify(clips) !== JSON.stringify(listed)) await writeManifest();
  await idbSet('folder', h);
  showErr('');
  $('pick').textContent = 'Choose another folder';
  $('reconnect').hidden = true;
  $('folder').textContent = `Saving to: ${dir.name}`;
  rows.forEach(updateRow);
  updateCounts();
  return true;
}

async function writeManifest() {
  const ordered = {};
  for (const l of order) if (clips[l.key]) ordered[l.key] = clips[l.key];
  for (const [k, f] of Object.entries(clips)) if (!(k in ordered)) ordered[k] = f;
  const w = await (await folder.getFileHandle('manifest.json', { create: true })).createWritable();
  await w.write(JSON.stringify({ clips: ordered }, null, 1) + '\n');
  await w.close();
}

async function pickFolder() {
  try {
    const h = await window.showDirectoryPicker({ id: 'aa-audio', mode: 'readwrite' });
    await useFolder(h);
  } catch (e) { if (e.name !== 'AbortError') showErr(`Couldn't open the folder: ${e.message}`); }
}

async function restoreFolder() {
  const h = await idbGet('folder');
  if (!h) return;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { await useFolder(h); return; }
  const b = $('reconnect');
  b.hidden = false;
  b.textContent = `Reconnect to "${h.name}"`;
  b.onclick = async () => {
    if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') await useFolder(h);
  };
}

// ---------- audio ----------
async function mic() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  ac ??= new AudioContext();
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  ac.createMediaStreamSource(stream).connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const bar = $('meter');
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    bar.firstChild.style.width = `${Math.min(100, Math.sqrt(peak) * 100)}%`;
    bar.classList.toggle('hot', peak > 0.95);
    requestAnimationFrame(tick);
  };
  tick();
}

// Where the sound starts and ends. The first 80 ms and last 150 ms are skipped (key clicks).
function trimSpan(buf) {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const lo = Math.floor(sr * 0.08);
  const hi = d.length - Math.floor(sr * 0.15);
  let peak = 0;
  for (let i = lo; i < hi; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = Math.max(0.008, peak * 0.05);
  let a = lo;
  let b = hi - 1;
  while (a < hi && Math.abs(d[a]) < thr) a++;
  while (b > a && Math.abs(d[b]) < thr) b--;
  if (b <= a) return { from: 0, to: buf.duration, peak };
  return { from: Math.max(0, a - sr * 0.04) / sr, to: Math.min(d.length, b + sr * 0.08) / sr, peak };
}

function stopPlaying() {
  if (playing) { playing(); playing = null; }
}

// Play a span of a buffer. With record=true the playback is also encoded; resolves to the Blob.
function playSpan(buf, from, to, record) {
  stopPlaying();
  return new Promise((resolve) => {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    let rec = null;
    const chunks = [];
    let cancelled = false;
    const finish = () => {
      if (playing === cancel) playing = null;
      if (rec && rec.state !== 'inactive') setTimeout(() => rec.stop(), 120);
      else resolve(null);
    };
    const cancel = () => { cancelled = true; try { src.stop(); } catch { /* not started */ } };
    playing = cancel;
    src.onended = finish;
    if (record) {
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      rec = new MediaRecorder(dest.stream, { mimeType: MIME, audioBitsPerSecond: 128000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(cancelled ? null : new Blob(chunks, { type: 'audio/webm' }));
      rec.start();
      setTimeout(() => { if (!cancelled) src.start(ac.currentTime + 0.03, from, to - from); else rec.stop(); }, 80);
    } else {
      src.start(0, from, to - from);
    }
  });
}

async function startRecording() {
  if (!REC_OK) return;
  stopPlaying();
  take = null;
  try { await mic(); } catch (e) { showErr(`The microphone didn't start: ${e.message}`); return; }
  if (ac.state === 'suspended') await ac.resume();
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: 128000 });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => gotTake(new Blob(chunks, { type: 'audio/webm' }));
  recorder.start();
  setState('rec');
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
}

async function gotTake(raw) {
  let buf;
  try { buf = await ac.decodeAudioData(await raw.arrayBuffer()); } catch { showErr('That take could not be read. Try again.'); setState('idle'); return; }
  const { from, to, peak } = trimSpan(buf);
  const t = { buf, from, to, peak };
  take = t;
  setState('play');
  t.blob = playSpan(buf, from, to, true);
  const blob = await t.blob;
  if (take === t && state === 'play') setState(blob ? 'take' : 'idle');
}

async function keepTake() {
  if (!take) return;
  if (!folder) { showErr(FS_OK ? 'Choose the audio folder first.' : 'Nothing can be saved in this browser.'); return; }
  const t = take;
  setState('saving');
  const blob = await t.blob;
  if (!blob) { setState('idle'); return; }
  const key = order[sel].key;
  const name = `${key}.webm`;
  try {
    const w = await (await folder.getFileHandle(name, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
    clips[key] = name;
    await writeManifest();
  } catch (e) { showErr(`Saving failed: ${e.message}`); setState('take'); return; }
  take = null;
  updateRow(rows[sel]);
  updateCounts();
  const next = nextUnrecorded(sel);
  select(next ?? sel);
  setState('idle', next == null ? 'Every line is recorded.' : 'Saved.');
}

function nextUnrecorded(from) {
  for (let i = 1; i <= order.length; i++) {
    const j = (from + i) % order.length;
    if (!clips[order[j].key]) return j;
  }
  return null;
}

async function playSaved(key) {
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') await ac.resume();
    let data;
    if (folder) data = await (await (await folder.getFileHandle(clips[key])).getFile()).arrayBuffer();
    else data = await (await fetch(`audio/${clips[key]}`)).arrayBuffer();
    const buf = await ac.decodeAudioData(data);
    playSpan(buf, 0, buf.duration, false);
  } catch (e) { showErr(`Couldn't play ${key}: ${e.message}`); }
}

// ---------- page ----------
function showErr(text) { $('err').hidden = !text; $('err').textContent = text; }

function setState(s, note) {
  state = s;
  const done = !!clips[order[sel].key];
  const quiet = take && take.peak < 0.08 ? ' It was quiet: move a little closer.' : '';
  const loud = take && take.peak > 0.98 ? ' It was too loud: move back a little.' : '';
  const msg = {
    idle: note || (done ? 'Recorded. Space records it again.' : 'Not recorded yet. Press Space to start.'),
    rec: 'Recording. Press Space to stop.',
    play: 'Playing it back…',
    take: `Enter keeps it. Backspace records it again.${quiet}${loud}`,
    saving: 'Saving…',
  }[s];
  $('msg').textContent = msg;
  $('state').className = `state ${s}`;
}

function updateCounts() {
  const all = order.filter((l) => clips[l.key]).length;
  const core = order.filter((l) => isCore.has(l.key) && clips[l.key]).length;
  $('counts').textContent = `First lines: ${core} of ${isCore.size} · All lines: ${all} of ${order.length}`;
}

function updateRow(r) {
  const done = !!clips[r.line.key];
  r.el.classList.toggle('done', done);
  r.play.disabled = !done;
  r.el.title = done ? 'Recorded' : 'Not recorded';
}

function select(i) {
  if (state === 'rec') stopRecording();
  stopPlaying();
  take = null;
  sel = Math.max(0, Math.min(order.length - 1, i));
  rows.forEach((r, j) => r.el.classList.toggle('sel', j === sel));
  const l = order[sel];
  $('now-text').textContent = l.text;
  $('now-note').textContent = l.note || '';
  $('now-key').textContent = `${l.key}.webm${l.caption ? ` · shown as ${l.caption}` : ''}`;
  rows[sel].el.scrollIntoView({ block: 'nearest' });
  // Keep the row clear of the sticky header.
  const top = rows[sel].el.getBoundingClientRect().top;
  const head = document.querySelector('header').getBoundingClientRect().bottom;
  if (top < head + 8) window.scrollBy(0, top - head - 8);
  setState('idle');
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function build() {
  const list = $('list');
  for (const s of sections) {
    list.append(el('h2', null, s.title), el('div', 'n', s.sub));
    for (const g of s.groups) {
      list.append(el('h3', null, g.group));
      for (const line of g.lines) {
        const i = rows.length;
        const row = el('div', 'line');
        const body = el('div');
        const t = el('div', 't', line.text);
        t.append(el('span', 'k', line.key));
        body.append(t);
        if (line.note) body.append(el('div', 'n', line.note));
        const play = el('button', null, 'Play');
        play.addEventListener('click', (e) => { e.stopPropagation(); playSaved(line.key); });
        row.append(el('span', 'dot'), body, play);
        row.addEventListener('click', () => select(i));
        list.append(row);
        rows.push({ el: row, line, play });
      }
    }
  }
  rows.forEach(updateRow);
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'rec') stopRecording();
    else if (state !== 'saving') startRecording();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (state === 'take' || state === 'play') keepTake();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    if (state !== 'saving' && state !== 'rec') startRecording();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (state !== 'saving') select(sel + (e.key === 'ArrowDown' ? 1 : -1));
  }
});

build();
updateCounts();
$('nofs').hidden = FS_OK;
$('norec').hidden = REC_OK;
$('pick').hidden = !FS_OK;
$('pick').addEventListener('click', pickFolder);
if (FS_OK) restoreFolder();
else {
  // Without a folder, show what the server already has.
  fetch('audio/manifest.json', { cache: 'no-cache' }).then((r) => r.json()).then((m) => {
    clips = m.clips || {};
    rows.forEach(updateRow);
    updateCounts();
    setState(state);
  }).catch(() => {});
}
select(0);
