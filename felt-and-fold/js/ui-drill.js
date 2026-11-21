/* Felt & Fold UI: the preflop drill screen (UI.Drill). The logic lives in js/drill.js (FF.Drill).
   It never writes to History, Stats, the Coach or the live coach; its own keys are ff.drill.*. */
(function () {
  'use strict';
  const FF = window.FF, UI = FF.UI, DR = FF.Drill;
  let S = null, sp = null, box = null, wired = false;

  const bb = x => DR.fmtBB(x);
  const pct = x => Math.round(x * 100) + '%';
  function actCls(s, a) {
    if (a === 'fold') return 'm-fold';
    if (a === 'call') return s.labels.call === 'Check' ? 'm-check' : 'm-call';
    return s.labels.raise === 'All in' ? 'm-allin' : 'm-raise';
  }

  // ---------------------------------------------------------------- the spot
  const RAISE_WORD = ['raises to', '3-bets to', '4-bets to', '5-bets to'];
  function actionLine(s) {
    let raises = 0;
    const parts = [];
    s.actions.forEach(a => {
      if (a.type === 'fold') return;
      const who = a.pos === s.hero ? 'You' : a.pos, you = a.pos === s.hero;
      if (a.type === 'raise') { parts.push(who + ' ' + (you ? RAISE_WORD[raises].replace('raises', 'raise').replace('-bets', '-bet') : RAISE_WORD[raises]) + ' ' + bb(a.toBB) + '.'); raises++; }
      else if (a.type === 'limp') parts.push(who + (you ? ' limp.' : ' limps.'));
      else parts.push(who + (you ? ' call ' : ' calls ') + bb(a.toBB) + '.');
    });
    if (!parts.length) return s.hero === 'UTG' ? 'You are first to act.' : 'It folds to you in the ' + s.hero + '.';
    const lastIn = s.actions.reduce((j, a, i) => (a.type !== 'fold' ? i : j), -1);
    return parts.join(' ') + (s.actions.slice(lastIn + 1).some(a => a.type === 'fold') ? ' The others fold to you.' : '');
  }
  function seatState(s, pos) {
    let last = null, raises = 0, word = '';
    s.actions.forEach(a => {
      if (a.type === 'raise') raises++;
      if (a.pos === pos) { last = a; word = a.type === 'raise' ? (raises === 1 ? 'Open' : raises + '-bet') : a.type === 'limp' ? 'Limp' : a.type === 'call' ? 'Call' : 'Fold'; }
    });
    const blind = pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0;
    if (last && last.type === 'fold') return { cls: 'folded', top: 'Fold', amt: '' };
    if (last) return { cls: 'in', top: word, amt: bb(last.toBB || 1) };
    if (blind) return { cls: 'blind', top: 'Blind', amt: bb(blind) };
    return { cls: 'wait', top: '', amt: '' };
  }
  function seatsHtml(s) {
    return '<div class="dseats">' + DR.POS.map(p => {
      const st = seatState(s, p), me = p === s.hero;
      return '<div class="dseat ' + st.cls + (me ? ' hero' : '') + '"><b>' + p + '</b><span>' + (me ? 'You' : UI.esc(st.top) || '&nbsp;') + '</span><em>' + (st.amt || '&nbsp;') + '</em></div>';
    }).join('') + '</div>';
  }
  function priceLine(s) {
    if (s.type === 'rfi') return 'Pot ' + bb(s.pot) + ' (the blinds) · No one has opened';
    return 'Pot ' + bb(s.pot) + (s.toCall > 0 ? ' · To call ' + bb(s.toCall) + ' · Pot odds ' + pct(s.need) : ' · Nothing to call');
  }
  function spotHtml(s) {
    return '<div class="dspotcard">' +
      '<div class="dtop"><span class="dtype">' + UI.esc(DR.TYPE_NAME[s.type]) + '</span>' + (s.again ? '<span class="dagain">Review</span>' : '') + '<span class="muted small">100bb · 6-max</span></div>' +
      seatsHtml(s) +
      '<div class="dhand"><div class="dcards">' + UI.cardsHtml(s.cards) + '</div><div class="dinfo"><p class="dline">' + UI.esc(actionLine(s)) + '</p><p class="dprice">' + UI.esc(priceLine(s)) + '</p></div></div>' +
      '</div>';
  }
  function actsHtml(s) {
    const key = { fold: 'F', call: 'C', raise: 'R' };
    return '<div class="dacts">' + s.options.map(a =>
      '<button class="btn big dact ' + a + '" data-act="' + a + '"' + (s.result ? ' disabled' : '') + (s.result && s.result.act === a ? ' aria-pressed="true"' : '') + '>' + UI.esc(DR.actLabel(s, a)) + '<kbd>' + key[a] + '</kbd></button>').join('') + '</div>';
  }

  // ---------------------------------------------------------------- the result
  function mixHtml(s) {
    const r = s.result, rows = r.split;
    const youRow = rows.find(x => x.act === r.act);
    let left = 0, at = null;
    const segs = rows.map(x => { const mid = left + x.pct / 2; if (x.act === r.act) at = mid; left += x.pct; return '<i class="' + actCls(s, x.act) + (x.act === r.act ? ' you' : '') + '" style="width:' + x.pct + '%"></i>'; }).join('');
    if (at == null) at = r.act === 'fold' ? 100 : 0; // your play is not in the chart's mix at all
    return '<div class="mixrow"><span class="mixlab">Chart</span><div class="mixcol marked"><span class="youmark" style="left:' + Math.min(92, Math.max(8, at)) + '%">You</span><span class="youcaret" style="left:' + at + '%"></span>' +
      '<div class="mixbar">' + segs + '</div></div></div>' +
      '<div class="mixlegend">' + rows.map(x => '<span' + (x.act === r.act ? ' class="you"' : '') + '><b class="dot ' + actCls(s, x.act) + '"></b>' + UI.esc(x.label) + ' ' + x.pct + '%</span>').join('') +
      (youRow ? '' : '<span class="you"><b class="dot dot-you"></b>' + UI.esc(s.labels[r.act]) + ' 0%</span>') + '</div>';
  }
  function gridHtml(s) {
    const cells = DR.grid(s), tot = DR.totals(s);
    const col = a => 'var(--' + actCls(s, a) + ')';
    return '<div class="dgrid" role="img" aria-label="Range chart for this spot. Your hand ' + s.hand + ' is outlined.">' + cells.map((c, i) => {
      const r = c.raise * 100, k = r + c.call * 100;
      const bg = 'linear-gradient(to right,' + col('raise') + ' 0 ' + r + '%,' + col('call') + ' ' + r + '% ' + k + '%,' + col('fold') + ' ' + k + '% 100%)';
      return '<span class="dcell' + (i === s.cls ? ' me' : '') + (c.live ? '' : ' dead') + '" style="background:' + bg + '">' + c.name + '</span>';
    }).join('') + '</div>' +
      '<div class="mixlegend">' + ['raise', 'call', 'fold'].filter(a => tot[a] >= 0.005 && s.labels[a]).map(a => '<span><b class="dot ' + actCls(s, a) + '"></b>' + UI.esc(s.labels[a]) + ' ' + pct(tot[a]) + '</span>').join('') +
      (cells.some(c => !c.live) ? '<span class="muted">Faded: hands you would not hold here</span>' : '') + '</div>';
  }
  function resultHtml(s) {
    const r = s.result;
    return '<div class="dresult ' + (r.ok ? 'ok' : 'miss') + '">' +
      '<div class="dgrade"><span class="grade ' + (r.ok ? 'g-good' : 'g-mistake') + '">' + (r.ok ? 'Right' : 'Miss') + '</span> <span class="dyou">You: ' + UI.esc(DR.actLabel(s, r.act)) + '</span></div>' +
      '<p class="dsplit">Chart for ' + UI.esc(s.hand) + ': ' + UI.esc(r.splitText) + '</p>' +
      mixHtml(s) +
      '<p class="dreason">' + UI.Review.termsHtml(UI.esc(r.text), r.concepts) + '</p>' +
      gridHtml(s) +
      '</div>' +
      '<div class="dnext"><button class="btn primary big" id="d-next">Next spot <kbd>Enter</kbd></button></div>';
  }

  // ---------------------------------------------------------------- filters and score
  function filtersHtml() {
    const f = S.filters, n = f.types.length + f.pos.length, all = DR.TYPES.length + DR.POS.length;
    return '<details class="dfilters"' + (n < all ? ' open' : '') + '><summary>Spots: ' + (n === all ? 'all' : f.types.length + ' of ' + DR.TYPES.length + ' types, ' + f.pos.length + ' of 6 seats') + '</summary>' +
      '<div class="dchips">' + DR.TYPES.map(t => '<button class="btn sm opt' + (f.types.indexOf(t) >= 0 ? ' on' : '') + '" data-ft="' + t + '" aria-pressed="' + (f.types.indexOf(t) >= 0) + '">' + UI.esc(DR.TYPE_NAME[t]) + '</button>').join('') + '</div>' +
      '<div class="dchips">' + DR.POS.map(p => '<button class="btn sm opt' + (f.pos.indexOf(p) >= 0 ? ' on' : '') + '" data-fp="' + p + '" aria-pressed="' + (f.pos.indexOf(p) >= 0) + '">' + p + '</button>').join('') + '</div></details>';
  }
  const rate = o => o && o.n ? o.ok + '/' + o.n + ' <small>' + pct(o.ok / o.n) + '</small>' : '<span class="muted">–</span>';
  function scoreHtml() {
    const se = S.session, li = S.lifetime();
    return '<details class="dscore"><summary>Score: this session ' + (se.n ? pct(se.ok / se.n) : '–') + ' · all time ' + (li.n ? pct(li.ok / li.n) : '–') + '</summary>' +
      '<table class="dtable"><thead><tr><th></th><th>Session</th><th>All time</th></tr></thead><tbody>' +
      '<tr class="dall"><td>All spots</td><td>' + rate(se) + '</td><td>' + rate(li) + '</td></tr>' +
      DR.TYPES.map(t => '<tr><td>' + UI.esc(DR.TYPE_NAME[t]) + '</td><td>' + rate(se.types[t]) + '</td><td>' + rate(li.types[t]) + '</td></tr>').join('') +
      '<tr class="dsep"><td colspan="3">By seat</td></tr>' +
      DR.POS.map(p => '<tr><td>' + p + '</td><td>' + rate(se.pos[p]) + '</td><td>' + rate(li.pos[p]) + '</td></tr>').join('') +
      '</tbody></table>' +
      '<p class="muted small">' + S.queue().items.length + ' missed spots waiting for review. A miss comes back after ' + DR.GAP + ' spots until you get it right.</p>' +
      '<button class="btn sm danger" id="d-reset">Reset all-time score</button></details>';
  }
  function headScore() {
    const h = UI.$('#drill-score'), se = S.session;
    if (h) h.textContent = se.n ? se.ok + '/' + se.n : '';
  }

  // ---------------------------------------------------------------- render and flow
  function render() {
    const keepScore = UI.$('.dscore', box), scoreOpen = keepScore && keepScore.open;
    const body = sp ? spotHtml(sp) + actsHtml(sp) + (sp.result ? resultHtml(sp) : '') :
      '<div class="dempty"><p>No spots match these filters.</p><p class="muted small">Pick at least one spot type and one seat. Some pairs never happen: the BB never faces a 3-bet after opening, for example.</p></div>';
    box.innerHTML = filtersHtml() + body + scoreHtml();
    if (scoreOpen) UI.$('.dscore', box).open = true;
    headScore();
  }
  function deal() { sp = S.next(); render(); window.scrollTo(0, 0); }
  function answer(a) {
    if (!sp || sp.result || sp.options.indexOf(a) < 0) return;
    S.answer(sp, a);
    render();
    const res = UI.$('.dresult', box);
    if (res && window.innerWidth <= 640) res.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function toggle(list, v, all) {
    const i = list.indexOf(v), out = list.slice();
    if (i >= 0) out.splice(i, 1); else out.push(v);
    return all.filter(x => out.indexOf(x) >= 0);
  }
  function wire() {
    if (wired) return;
    wired = true;
    box.addEventListener('click', async ev => {
      const t = ev.target;
      const act = t.closest('[data-act]'), ft = t.closest('[data-ft]'), fp = t.closest('[data-fp]');
      if (act) { answer(act.dataset.act); return; }
      if (ft || fp) {
        const f = S.filters;
        S.setFilters(ft ? { types: toggle(f.types, ft.dataset.ft, DR.TYPES), pos: f.pos } : { types: f.types, pos: toggle(f.pos, fp.dataset.fp, DR.POS) });
        // a spot already answered stays on screen; an unanswered one is swapped for one that fits
        if (!sp || !sp.result || !S.pool().some(x => x.sid === sp.sid)) sp = S.next();
        render();
        UI.$('.dfilters', box).open = true;
        return;
      }
      if (t.closest('#d-next')) { deal(); return; }
      if (t.closest('#d-reset')) {
        const v = await UI.modal('Reset the all-time score?', '<p>This clears the drill\'s all-time score and its review queue. Your filters stay. Hand history and stats are not touched.</p>', [{ label: 'Reset', value: 1, cls: 'danger' }, { label: 'Cancel', value: 0 }]);
        if (v) { S.resetLifetime(); render(); UI.$('.dscore', box).open = true; }
        return;
      }
    });
    // after a grade, a tap anywhere else on the screen deals the next spot
    UI.$('#scr-drill').addEventListener('click', ev => {
      if (!sp || !sp.result) return;
      const t = ev.target;
      if (t.closest('button, a, summary, details, .dgrid, .termdef, .mixrow, input, select, .lobby-head')) return;
      deal();
    });
    document.addEventListener('keydown', ev => {
      if (document.body.dataset.screen !== 'drill' || UI.$('.modal-back') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = ev.key.toLowerCase();
      if (sp && !sp.result && (k === 'f' || k === 'c' || k === 'r')) {
        const a = { f: 'fold', c: 'call', r: 'raise' }[k];
        if (sp.options.indexOf(a) >= 0) { ev.preventDefault(); answer(a); }
      } else if (sp && sp.result && (k === 'enter' || k === ' ') && !(ev.target && ev.target.closest && ev.target.closest('button.term, summary'))) {
        ev.preventDefault(); deal();
      }
    });
  }
  function enter() {
    box = UI.$('#drill-body');
    if (!S) S = DR.create();
    wire();
    if (!sp || sp.result) sp = S.next(); // a fresh spot on entry; an unanswered one waits
    render();
  }

  UI.Drill = { enter: enter, session: () => S, current: () => sp };
})();
