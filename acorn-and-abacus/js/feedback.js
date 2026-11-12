// Feedback: soft sounds, varied praise, rare surprise celebrations, gentle highlights.
import { hop, dropLeaf } from './guide.js';

let ac = null;
export function audioCtx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(f1, f2, dur, type, peak) {
  const c = audioCtx();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// A low, soft "hmm" for a wrong answer. Never a buzzer.
export const softMiss = () => tone(262, 220, 0.5, 'sine', 0.1);
// A small wooden "tok" for a right click.
export const tok = () => tone(620, 520, 0.14, 'triangle', 0.07);

export function unlockAudio() { audioCtx(); }

// Pick one of several lines, never the same one twice running.
const lastPick = new Map();
export function vary(tag, options) {
  let i = Math.floor(Math.random() * options.length);
  if (options.length > 1 && i === lastPick.get(tag)) i = (i + 1) % options.length;
  lastPick.set(tag, i);
  return options[i];
}

// About 1 in 6 right answers: Pip hops, or a leaf drifts down. Never expected, never counted.
export function maybeCelebrate(container) {
  if (Math.random() >= 1 / 6) return;
  if (Math.random() < 0.5) hop();
  else dropLeaf(container);
}

export function glow(el, on = true) { el.classList.toggle('glow', on); }
