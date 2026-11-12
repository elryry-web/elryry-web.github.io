// App shell: scaling, start screen, home, activity runner, captions, replay, session timer, break screen.
import { initVoice, preloadClips, sayParts, stop, onTalking, onCaption } from './voice.js';
import { createGuide, setTalking } from './guide.js';
import { h, holdButton, sleep } from './ui.js';
import { ACTIVITIES } from './activities/registry.js';
import { levelFor, loadSettings, saveSettings } from './progress.js';
import { toggleGrownUp, isGrownUpOpen, closeGrownUp } from './grownup.js';
import * as fb from './feedback.js';

class Abort extends Error {}

const stage = document.getElementById('stage');
const main = document.getElementById('main');
const overlay = document.getElementById('overlay');

const app = {
  run: null,          // the running activity: {def, alive, rejecters, keyHandler}
  instruction: [],    // parts the replay button repeats
  settings: loadSettings(),
  elapsed: 0,         // seconds of activity play this session
  breakAt: 0,
  doneOpen: false,
  started: false,
};
app.breakAt = app.settings.sessionMin * 60;

// ---------- scale the 900px-tall stage to fill the window ----------
function fit() {
  const W = Math.round(Math.max(1400, Math.min(2000, (innerWidth / innerHeight) * 900)));
  const s = Math.min(innerWidth / W, innerHeight / 900);
  stage.style.width = `${W}px`;
  stage.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - 900 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---------- side column: Pip, home, replay ----------
const homeBtn = document.getElementById('home-btn');
const replayBtn = document.getElementById('replay-btn');
document.getElementById('guide-slot').append(createGuide('guide-main'));

// Pip's head bobs while audio plays, or briefly while a caption is fresh.
let audioTalk = false;
let capTalkTimer = null;
const refreshTalk = () => setTalking(audioTalk || capTalkTimer !== null);
onTalking((on) => { audioTalk = on; refreshTalk(); });

// ---------- captions ----------
const caption = document.getElementById('caption');
const capNow = caption.querySelector('.cap-now');
const capPrev = caption.querySelector('.cap-prev');
let capTime = 0;
onCaption((text, opts) => {
  const now = Date.now();
  capPrev.textContent = now - capTime < 6000 && capNow.textContent !== text ? capNow.textContent : '';
  capNow.textContent = text;
  capTime = now;
  caption.hidden = !app.settings.captions || !text;
  caption.classList.toggle('small', !!opts.small || app.captionSmall);
  caption.classList.remove('fresh');
  void caption.offsetWidth;
  caption.classList.add('fresh');
  clearTimeout(capTalkTimer);
  capTalkTimer = setTimeout(() => { capTalkTimer = null; refreshTalk(); }, Math.min(2500, 700 + text.length * 35));
  refreshTalk();
});

export function replay() {
  if (!app.instruction.length) return;
  capTime = 0; // replay shows the line on its own
  sayParts(app.instruction);
}
replayBtn.addEventListener('click', replay);
homeBtn.addEventListener('click', () => goHome());
hoverSpeak(homeBtn, ['ui-home-btn']);

// Speak a target's name after the pointer rests on it briefly.
export function hoverSpeak(el, parts, delay = 550) {
  let t = null;
  el.addEventListener('pointerenter', () => { t = setTimeout(() => sayParts(parts), delay); });
  el.addEventListener('pointerleave', () => clearTimeout(t));
  el.addEventListener('click', () => clearTimeout(t));
}

// ---------- grown-up corner ----------
const guBtn = document.getElementById('grownup-btn');
holdButton(guBtn, 2000, () => openPanel());
function openPanel() {
  stop();
  toggleGrownUp(grownUpApi());
}
function grownUpApi() {
  return {
    current: app.run ? app.run.def : null,
    activities: ACTIVITIES,
    levelFor,
    settings: app.settings,
    elapsed: app.elapsed,
    breakOpen: app.doneOpen,
    saveSettings: (s) => {
      Object.assign(app.settings, s);
      saveSettings(app.settings);
      app.breakAt = Math.max(app.elapsed + 60, app.settings.sessionMin * 60);
      if (!app.settings.captions) caption.hidden = true;
    },
    resetTimer: () => { app.elapsed = 0; app.breakAt = app.settings.sessionMin * 60; },
    keepPlaying: () => continueFromBreak(),
  };
}

// ---------- keyboard ----------
addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (e.shiftKey && key === 'g') { e.preventDefault(); openPanel(); return; }
  if (isGrownUpOpen()) { if (key === 'escape') closeGrownUp(); return; }
  if (!app.started || app.doneOpen || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (app.run && app.run.keyHandler && app.run.keyHandler(key)) { e.preventDefault(); return; }
  if (key === 'r') replay();
});

// ---------- session timer and break screen ----------
setInterval(() => {
  if (app.started && app.run && !app.doneOpen && !document.hidden) app.elapsed++;
}, 1000);

let resumeBreak = null;
function maybeBreak() {
  if (!app.settings.sessionMin || app.elapsed < app.breakAt) return Promise.resolve();
  app.doneOpen = true;
  stop();
  const keep = h('button', { class: 'gu-hold', title: 'Grown-up: hold for 2 seconds' }, 'Grown-up: hold to keep playing');
  holdButton(keep, 2000, continueFromBreak);
  overlay.replaceChildren(h('div', { class: 'done-screen' },
    h('div', { class: 'done-guide' }, createGuide('guide-big')),
    h('h1', {}, 'All done for today'),
    keep));
  overlay.hidden = false;
  caption.classList.add('over');
  capTime = 0;
  app.instruction = ['ui-break'];
  sayParts(app.instruction);
  return new Promise((resolve) => { resumeBreak = resolve; });
}
function continueFromBreak() {
  if (!app.doneOpen) return;
  app.doneOpen = false;
  app.breakAt = app.elapsed + Math.max(5, Math.round(app.settings.sessionMin / 2)) * 60;
  overlay.hidden = true;
  overlay.replaceChildren();
  caption.classList.remove('over');
  closeGrownUp();
  const r = resumeBreak;
  resumeBreak = null;
  sayParts(['ui-back']).then(() => r && r());
}

// ---------- activity runner ----------
function stopRun() {
  if (!app.run) return;
  app.run.alive = false;
  for (const rej of [...app.run.rejecters]) rej(new Abort());
  app.run = null;
  app.captionSmall = false;
  stop();
}

// Returns the promise, with a no-op catch attached so un-awaited calls don't report an Abort.
function quiet(fn) { const p = fn(); p.catch(() => {}); return p; }

function makeCtx(run, root) {
  const check = () => { if (!run.alive) throw new Abort(); };
  const ctx = {
    root,
    stage,
    level: levelFor(run.def),
    fb,
    get alive() { return run.alive; },
    // Shows the caption and plays the clip if recorded. Resolves at once when there is no clip.
    // Safe to call without await: an Abort is then ignored.
    say(parts) { return quiet(async () => { check(); const r = await sayParts(parts); check(); return r; }); },
    // Like say, but takes at least `ms`, for pacing that must not rush (counting one by one).
    sayPaced(parts, ms) { return quiet(async () => { check(); await Promise.all([sayParts(parts), sleep(ms)]); check(); }); },
    // Sets the line the replay button repeats, then says it.
    instruct(parts) { if (run.alive) app.instruction = parts; return ctx.say(parts); },
    setInstruction(parts) { app.instruction = parts; },
    async wait(ms) { check(); await sleep(ms); check(); },
    // Smaller captions, e.g. while she plays alone with Pip.
    smallCaptions(on) { app.captionSmall = on; caption.classList.toggle('small', on); },
    // Wait for a click on one of the targets, or a key the activity accepts.
    // keys: function(key) -> value, or undefined to ignore the key.
    pick({ targets = [], keys = null }) {
      check();
      return new Promise((resolve, reject) => {
        const handlers = [];
        const cleanup = () => {
          handlers.forEach(([el, fn]) => el.removeEventListener('click', fn));
          if (run.keyHandler === onKey) run.keyHandler = null;
          run.rejecters.delete(rej);
        };
        const rej = (err) => { cleanup(); reject(err); };
        for (const t of targets) {
          const fn = () => { cleanup(); resolve(t.value); };
          t.el.addEventListener('click', fn);
          handlers.push([t.el, fn]);
        }
        const onKey = (key) => {
          if (!keys) return false;
          const v = keys(key);
          if (v === undefined) return false;
          cleanup();
          resolve(v);
          return true;
        };
        run.keyHandler = onKey;
        run.rejecters.add(rej);
      });
    },
    hover: hoverSpeak,
    celebrate() { fb.maybeCelebrate(stage); },
    // Call at the end of every round. Shows the break screen when time is up.
    async roundEnd() { check(); await maybeBreak(); check(); },
    // True when play has run `extraMin` minutes past the break point (for long rounds).
    overTime(extraMin = 0) { return app.settings.sessionMin > 0 && app.elapsed >= app.breakAt + extraMin * 60; },
  };
  return ctx;
}

function startActivity(def) {
  stopRun();
  const run = { def, alive: true, rejecters: new Set(), keyHandler: null };
  app.run = run;
  const root = h('div', { class: `activity act-${def.id}` });
  main.replaceChildren(root);
  stage.dataset.screen = def.id;
  homeBtn.hidden = false;
  capTime = 0; // a new game starts with a clean caption
  app.instruction = [];
  def.run(makeCtx(run, root)).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
}

// ---------- home ----------
function goHome(greet = false) {
  stopRun();
  stage.dataset.screen = 'home';
  homeBtn.hidden = true;
  const grid = h('div', { class: 'home-grid' });
  for (const def of ACTIVITIES) {
    const b = h('button', { class: 'home-card target', 'aria-label': def.label },
      h('div', { class: 'home-pic' }, def.icon()),
      h('div', { class: 'home-label' }, def.label));
    hoverSpeak(b, [def.nameKey]);
    b.addEventListener('click', () => { fb.tok(); startActivity(def); });
    grid.append(b);
  }
  main.replaceChildren(h('div', { class: 'home' }, grid));
  app.instruction = ['ui-pick'];
  sayParts(greet ? ['ui-hello', 'ui-pick'] : ['ui-pick']);
}

// ---------- start screen (one click unlocks audio) ----------
function startScreen() {
  const go = h('button', { class: 'start-btn target', 'aria-label': 'Start' });
  go.innerHTML = '<svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true"><path d="M36 24 L78 50 L36 76 Z" fill="#fffaf0" stroke="#fffaf0" stroke-width="8" stroke-linejoin="round"/></svg>';
  overlay.replaceChildren(h('div', { class: 'start-screen' },
    h('div', { class: 'start-guide' }, createGuide('guide-big')),
    h('h1', {}, 'Acorn & Abacus'),
    go));
  overlay.hidden = false;
  go.addEventListener('click', () => {
    fb.unlockAudio();
    preloadClips();
    overlay.hidden = true;
    overlay.replaceChildren();
    app.started = true;
    goHome(true);
  });
}

initVoice();
startScreen();

// For testing from the console.
window.__aa = { app, goHome, startActivity, ACTIVITIES, levelFor };
