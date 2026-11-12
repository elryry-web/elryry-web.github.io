// Adaptive levels. Each activity has an ordered list of steps; a Level tracks where she is.
// Up: 4 correct in the last 5 items at this step. Down: 2 misses in a row on different items.
// An item counts as correct only if her first answer was right.

const load = (k) => { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

let itemCounter = 0;

export class Level {
  constructor(id, steps) {
    this.id = id;
    this.steps = steps;
    this.hist = [];
    this.lastMissItem = null;
    this.step = this.clamp(load(`aa-level-${id}`) ?? 0);
    this.extra = load(`aa-extra-${id}`) || {}; // per-activity tuning, e.g. Quick Look's flash time
  }
  clamp(n) { return Math.max(0, Math.min(this.steps.length - 1, n | 0)); }
  get cfg() { return this.steps[this.step]; }
  get max() { return this.steps.length - 1; }

  // Returns 'up', 'down' or null.
  record(correct, item = `item-${itemCounter++}`) {
    let change = null;
    if (correct) {
      this.hist.push(true);
      this.lastMissItem = null;
    } else {
      if (this.lastMissItem !== null && this.lastMissItem !== item) change = 'down';
      this.lastMissItem = item;
      this.hist.push(false);
    }
    this.hist = this.hist.slice(-5);
    if (!change && this.hist.filter(Boolean).length >= 4) change = 'up';
    if (change === 'up' && this.step < this.max) this.set(this.step + 1);
    else if (change === 'down' && this.step > 0) this.set(this.step - 1);
    else if (change) { this.hist = []; this.lastMissItem = null; change = null; }
    return change;
  }

  set(step) {
    this.step = this.clamp(step);
    this.hist = [];
    this.lastMissItem = null;
    save(`aa-level-${this.id}`, this.step);
  }
  saveExtra() { save(`aa-extra-${this.id}`, this.extra); }
}

const levels = {};
export const levelFor = (def) => (levels[def.id] ??= new Level(def.id, def.steps));

export function loadSettings() { return { sessionMin: 12, captions: true, ...(load('aa-settings') || {}) }; }
export function saveSettings(s) { save('aa-settings', s); }
