// Grown-up corner: talk prompt, levels, captions and recordings, session timer. Opened by holding the
// corner button for 2 seconds or pressing Shift+G. Written for an adult reader.
import { h } from './ui.js';
import { coreStatus } from './voice.js';
import { GUIDE_NAME } from './script.js';

const layer = () => document.getElementById('grownup-layer');
let open = false;

export const isGrownUpOpen = () => open;

export function closeGrownUp() {
  open = false;
  layer().hidden = true;
  layer().replaceChildren();
}

export function toggleGrownUp(api) {
  if (open) { closeGrownUp(); return; }
  open = true;
  layer().hidden = false;
  render(api);
}

const HOME_TALK = {
  ask: 'Sit beside her and let her drive the mouse. Ask: "Which game shall we play?"',
  offscreen: 'Ten to fifteen minutes is plenty. The break screen comes after the time set below.',
};

function render(api) {
  const cur = api.current;
  const talk = cur ? cur.grownUp : HOME_TALK;

  const levelRows = api.activities.map((def) => {
    const lvl = api.levelFor(def);
    const label = h('span', { class: 'gu-step' }, `Step ${lvl.step + 1} of ${lvl.steps.length}: ${lvl.cfg.label}`);
    const nudge = (d) => { lvl.set(lvl.step + d); label.textContent = `Step ${lvl.step + 1} of ${lvl.steps.length}: ${lvl.cfg.label}`; };
    return h('div', { class: 'gu-level' },
      h('strong', {}, def.label),
      label,
      h('button', { class: 'gu-small', onclick: () => nudge(-1), title: 'Easier' }, '−'),
      h('button', { class: 'gu-small', onclick: () => nudge(1), title: 'Harder' }, '+'));
  });

  const capBox = h('input', { type: 'checkbox', checked: api.settings.captions !== false });
  capBox.addEventListener('change', () => api.saveSettings({ captions: capBox.checked }));
  const core = coreStatus();

  const mins = [0, 8, 10, 12, 15, 20];
  const timer = h('select', { class: 'gu-select' },
    mins.map((m) => h('option', { value: m, selected: m === api.settings.sessionMin }, m ? `${m} minutes` : 'Off')));
  timer.addEventListener('change', () => api.saveSettings({ sessionMin: Number(timer.value) }));
  const played = Math.floor(api.elapsed / 60);

  const panel = h('div', { class: 'gu-panel', role: 'dialog', 'aria-label': 'Grown-up corner' },
    h('div', { class: 'gu-head' },
      h('h2', {}, 'Grown-up corner'),
      h('button', { class: 'gu-close', onclick: closeGrownUp }, 'Close')),
    h('section', {},
      h('h3', {}, cur ? `Talk prompt: ${cur.label}` : 'Talk prompt'),
      h('p', {}, h('b', {}, 'Ask: '), talk.ask),
      h('p', {}, h('b', {}, 'Away from the screen: '), talk.offscreen)),
    h('section', {},
      h('h3', {}, 'Levels'),
      h('p', { class: 'gu-note' }, 'The game moves up after 4 right of the last 5, and down after 2 misses in a row. Nudge it here if it feels wrong. Changes apply from the next round.'),
      levelRows),
    h('section', {},
      h('h3', {}, 'Words on screen'),
      h('label', { class: 'gu-check' }, capBox, ' Show captions (every line is shown for you to read aloud)'),
      h('p', {}, `Core clips recorded (numbers, letter sounds, word endings): ${core.recorded} of ${core.total}.`),
      h('p', {}, h('a', { href: 'recorder.html', target: '_blank', class: 'gu-link' }, 'Open the recorder'),
        ' (Chrome or Edge on a computer) to record lines for ', GUIDE_NAME, '.')),
    h('section', {},
      h('h3', {}, 'Session timer'),
      h('p', {}, `Played this session: ${played} min. ${GUIDE_NAME} suggests a break at the end of a round after:`),
      timer,
      h('button', { class: 'gu-small wide', onclick: () => { api.resetTimer(); closeGrownUp(); } }, 'Restart timer'),
      api.breakOpen ? h('button', { class: 'gu-small wide', onclick: () => api.keepPlaying() }, 'Keep playing') : null));
  layer().replaceChildren(panel);
}

