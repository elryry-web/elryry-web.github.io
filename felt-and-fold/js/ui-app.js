/* Felt & Fold UI: screens (title, lobbies, settings, about), the table top bar, and boot. */
(function () {
  'use strict';
  const FF = window.FF, UI = FF.UI;

  // ---------------------------------------------------------------- screens
  const ENTER = {
    cash: () => UI.Cash.lobby(),
    tour: () => UI.Tourney.lobby(),
    custom: () => UI.Custom.lobby(),
    settings: () => renderSettings(UI.$('#settings-body')),
    title: () => renderTitle()
  };
  UI.show = function (name) {
    UI.$$('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
    document.body.dataset.screen = name;
    if (name === 'table' && UI.unitLabel) UI.unitLabel();
    if (ENTER[name]) ENTER[name]();
    window.scrollTo(0, 0);
  };

  function renderTitle() {
    const n = UI.Review.entries.length;
    UI.$('#title-session').innerHTML = n ? '<button class="btn link" id="t-hist">Hand history (' + n + ')</button> <button class="btn link" id="t-stats">Stats</button> <button class="btn link" id="t-coach">Coach</button>' : '';
    if (n) { UI.$('#t-hist').onclick = UI.Review.openHistory; UI.$('#t-stats').onclick = UI.Review.openStats; UI.$('#t-coach').onclick = UI.Review.openCoach; }
  }

  // ---------------------------------------------------------------- settings (a screen, and a modal during play)
  const OPTS = [
    { k: 'speed', label: 'Animation speed', type: 'select', opts: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']] },
    { k: 'units', label: 'Show amounts in', type: 'select', opts: [['bb', 'Big blinds'], ['chips', 'Chips or dollars']] },
    { k: 'chat', label: 'Table chat', type: 'check' },
    { k: 'hud', label: 'HUD stats (VPIP / PFR / 3-bet, AF)', type: 'check' },
    { k: 'reads', label: 'Show player reads', type: 'check' },
    { k: 'liveCoach', label: 'Live coach', type: 'check' }, // its own key, ff.livecoach (UI.LiveCoach)
    { k: 'fourColor', label: 'Four-colour deck', type: 'check' },
    { k: 'cardBack', label: 'Card backs', type: 'select', opts: [['oxblood', 'Oxblood lattice'], ['vines', 'Green vines'], ['rosette', 'Navy rosette'], ['deco', 'Charcoal deco']] },
    { k: 'autoSkip', label: 'Skip the review of clean hands', type: 'check' },
    { k: 'sound', label: 'Sound', type: 'check' }
  ];
  function renderSettings(box) {
    const s = Object.assign({}, UI.settings, { liveCoach: !UI.LiveCoach || UI.LiveCoach.state.on });
    box.innerHTML = '<div class="settings">' + OPTS.map(o => {
      if (o.type === 'check') return '<label class="srow"><span>' + o.label + '</span><input type="checkbox" data-k="' + o.k + '"' + (s[o.k] ? ' checked' : '') + '></label>';
      return '<label class="srow"><span>' + o.label + '</span><select data-k="' + o.k + '">' + o.opts.map(v => '<option value="' + v[0] + '"' + (s[o.k] === v[0] ? ' selected' : '') + '>' + v[1] + '</option>').join('') + '</select></label>';
    }).join('') + '</div><p class="muted small">Settings are saved in this browser.</p>';
    UI.$$('[data-k]', box).forEach(el => el.onchange = () => {
      if (el.dataset.k === 'liveCoach') { if (UI.LiveCoach) UI.LiveCoach.setOn(el.checked); return; }
      UI.settings[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      UI.saveSettings();
      if (el.dataset.k === 'units') UI.unitListeners.forEach(f => f()); else UI.Table.render();
    });
  }
  UI.openSettings = function () {
    const p = UI.modal('Settings', '<div id="modal-settings"></div>', [{ label: 'Done', value: 1, cls: 'primary' }]);
    renderSettings(UI.$('#modal-settings'));
    return p;
  };

  // ---------------------------------------------------------------- table top bar
  function wireTableBar() {
    UI.$('#tb-menu').onclick = async () => {
      const g = UI.Game.current();
      if (!g) { UI.show('title'); return; }
      const v = await UI.modal('Leave this table?', g.mode === 'tourney' && !g.practice
        ? '<p>Your chips stay in and get blinded away. Your finish counts.</p>'
        : g.mode === 'cash' && !g.practice ? '<p>Your stack goes back to your bankroll.</p>' : '<p>The practice table closes.</p>',
        [{ label: 'Leave', value: 1, cls: 'danger' }, { label: 'Stay', value: 0 }]);
      if (v) UI.Game.leave();
    };
    // bb or $ (chips in a tournament): one tap flips the setting and every amount on screen
    const ub = UI.$('#tb-units');
    const unitLabel = () => { const g = UI.Game.current(); ub.textContent = UI.unitName(g ? g.mode : 'cash'); ub.setAttribute('aria-label', 'Amounts in ' + (ub.textContent === 'bb' ? 'big blinds' : ub.textContent === '$' ? 'dollars' : 'chips') + '. Tap to switch.'); };
    ub.onclick = UI.toggleUnits;
    UI.unitListeners.push(unitLabel, () => UI.Table.render());
    UI.unitLabel = unitLabel;
    unitLabel();
    UI.$('#tb-hist').onclick = UI.Review.openHistory;
    UI.$('#tb-stats').onclick = UI.Review.openStats;
    UI.$('#tb-coach').onclick = UI.Review.openCoach;
    UI.$('#tb-set').onclick = UI.openSettings;
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    UI.applySettings();
    UI.Art.load(() => { if (UI.Table.current()) UI.Table.render(); });
    try { FF.Ranges.equity169(); } catch (e) { console.error(e); }
    if (FF.SolverProvider) FF.SolverProvider.install();
    UI.Table.mount();
    UI.Cash.restore();
    UI.$$('[data-go]').forEach(b => b.onclick = () => UI.show(b.dataset.go));
    wireTableBar();
    UI.show('title');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
