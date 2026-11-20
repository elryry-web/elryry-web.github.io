/* Felt & Fold UI: hand review panel, session hand history, session stats. */
(function () {
  'use strict';
  const FF = window.FF, UI = FF.UI;
  const R = UI.Review = { entries: [], shown: null };
  const GRADE_CLS = { Good: 'g-good', Inaccuracy: 'g-inacc', Mistake: 'g-mistake', Blunder: 'g-blunder' };
  const SOURCE_TIP = {
    Solved: 'Solved live for this exact spot, from the start of this street.',
    Library: 'Read from a solved flop with the same structure. Suits are mapped onto your board.',
    Estimate: 'A heuristic estimate from equity, ranges and pot odds. Not a solver answer.',
    Chart: 'From the preflop chart for this position and stack depth.',
    Nash: 'From the Nash push/fold ranges for 15bb and under.'
  };
  const ACT_CLS = { fold: 'm-fold', check: 'm-check', call: 'm-call', bet: 'm-bet', raise: 'm-raise', allin: 'm-allin' };
  const ACT_NAME = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
  let resolveClose = null;

  // ---------------------------------------------------------------- saved history: the last 200 reviews, under one ff. key
  const HKEY = 'history', HMAX = 200, HBYTES = 600000;
  const r2 = x => Math.round(x * 100) / 100;
  function packDecision(d) {
    return { street: d.street, boardStr: d.boardStr, grade: d.grade, evLost: d.evLost, source: d.source, spot: d.spot, pot: d.pot, toCall: d.toCall,
      did: { action: d.did.action, toBB: d.did.toBB, addBB: d.did.addBB }, hand: d.hand, leak: d.leak, text: d.text, concepts: d.concepts || [],
      mix: d.mix.filter(m => m.freq >= 0.005).map(m => ({ action: m.action, sizeLabel: m.sizeLabel, freq: r2(m.freq) })),
      exploit: d.exploit ? { gradedBy: d.exploit.gradedBy, name: d.exploit.name, best: d.exploit.best, baseGrade: d.exploit.baseGrade, state: d.exploit.state } : null,
      later: d.later || '' };
  }
  function pack(e) {
    const rv = e.rv, rc = rv.recap;
    return { n: e.n, at: e.at, label: e.meta.label || '', rv: { handId: rv.handId, heroPos: rv.heroPos, heroCards: rv.heroCards, board: rv.board,
      net: rv.net, worst: rv.worst, clean: rv.clean, evLost: rv.evLost, solved: rv.solved || 0,
      recap: rc ? { villains: rc.villains.map(v => ({ name: v.name, pos: v.pos, cards: v.cards, made: v.made, text: v.text, rangeText: v.rangeText, thinking: v.thinking })) } : null,
      decisions: rv.decisions.map(packDecision) } };
  }
  function saveHistory() {
    let list = R.entries.slice(-HMAX).map(pack), str = JSON.stringify(list);
    while (str.length > HBYTES && list.length > 1) { list = list.slice(Math.ceil(list.length / 10)); str = JSON.stringify(list); } // size guard: drop the oldest
    try { localStorage.setItem('ff.' + HKEY, str); } catch (err) { /* full or private mode: keep the page copy only */ }
  }
  function loadHistory() {
    const list = UI.load(HKEY, []);
    return Array.isArray(list) ? list.filter(p => p && p.rv && Array.isArray(p.rv.decisions))
      .map(p => ({ n: p.n, rv: p.rv, h: null, meta: { label: p.label }, solving: false, at: p.at, saved: true })) : [];
  }
  R.entries = loadHistory();
  const byN = n => R.entries.filter(e => e.n === n)[0];

  // ---------------------------------------------------------------- review an engine hand
  R.add = function (h, heroSeat, meta) {
    if (FF.SolverProvider) FF.SolverProvider.remember(h);
    const m = meta || {};
    const rv = FF.Review.hand(h, heroSeat, { reads: m.reads || null, profiles: m.profiles || null });
    const last = R.entries[R.entries.length - 1];
    const entry = { n: last ? last.n + 1 : 1, rv: rv, h: h, meta: meta || {}, solving: false, at: Date.now() };
    R.entries.push(entry);
    if (R.entries.length > HMAX) R.entries = R.entries.slice(-HMAX);
    if (FF.Strategy.hasSolver() && rv.decisions.some(d => d.street !== 'preflop')) {
      entry.solving = true;
      rv.upgrade(() => { if (R.shown === entry) R.render(); })
        .catch(e => { console.warn('review upgrade failed', e); })
        .then(() => { entry.solving = false; if (R.shown === entry) R.render(); refreshLists(); saveHistory(); });
    }
    saveHistory();
    refreshLists();
    return entry;
  };

  // ---------------------------------------------------------------- panel
  const sheet = () => UI.$('#review');
  R.open = function (entry, closeLabel) {
    R.shown = entry; R.closeLabel = closeLabel || 'Close';
    R.render();
    sheet().classList.add('open');
    sheet().scrollTop = 0;
    return new Promise(res => { resolveClose = res; });
  };
  R.close = function () {
    sheet().classList.remove('open'); R.shown = null;
    const r = resolveClose; resolveClose = null; if (r) r();
  };
  R.isOpen = () => !!R.shown;

  function mixBar(mix) {
    const rows = FF.Review.mixPct(mix); // whole percentages that add up to 100
    const segs = rows.map(r => '<i class="' + (ACT_CLS[r.m.action] || '') + '" style="width:' + r.pct + '%"></i>').join('');
    const legend = rows.map(r => '<span><b class="dot ' + (ACT_CLS[r.m.action] || '') + '"></b>' + ACT_NAME[r.m.action] +
      (r.m.sizeLabel && r.m.action !== 'allin' ? ' ' + UI.esc(r.m.sizeLabel) : '') + ' ' + r.pct + '%</span>').join('');
    return '<div class="mixbar">' + segs + '</div><div class="mixlegend">' + legend + '</div>';
  }
  // "Bet half pot (6.5 bb)", "Raise to 3x (19.5 bb)", "All-in (48 bb)"; preflop "Raise to 4.7 bb" (see FF.Review.didLabel)
  function didText(d) { return FF.Review.didLabel(d, x => UI.trim(x, 1) + ' bb'); }
  function decisionHtml(d, entry) {
    const pending = entry.solving && d.source === 'Estimate' && d.street !== 'preflop';
    const board = d.boardStr ? '<span class="dboard">' + UI.cardsText(d.boardStr) + '</span>' : '';
    return '<div class="decision">' +
      '<div class="dhead"><span class="street">' + d.street.charAt(0).toUpperCase() + d.street.slice(1) + '</span>' + board +
      '<span class="grade ' + GRADE_CLS[d.grade] + '">' + d.grade + '</span>' +
      (d.evLost > 0 ? '<span class="evlost">-' + UI.trim(d.evLost, 2) + ' bb</span>' : '') +
      '<span class="src src-' + d.source.toLowerCase() + '" title="' + UI.esc(SOURCE_TIP[d.source] || '') + '">' + d.source + '</span>' +
      (pending ? '<span class="solving">solving…</span>' : '') + '</div>' +
      '<div class="dspot">' + UI.esc(d.spot) + '. Pot ' + UI.trim(d.pot, 1) + ' bb' + (d.toCall ? ', ' + UI.trim(d.toCall, 1) + ' bb to call' : '') + '.</div>' +
      '<div class="ddid">You: <b>' + UI.esc(didText(d)) + '</b>' + (d.hand ? ' with ' + UI.esc(d.hand) : '') + '</div>' +
      mixBar(d.mix) +
      '<p class="dtext">' + termsHtml(UI.esc(d.text), d.concepts) + '</p>' +
      (d.later ? '<p class="dlater">' + UI.esc(d.later) + '</p>' : '') + '</div>';
  }
  // the first mention of each concept the reason names becomes a button that opens its definition in place
  function termsHtml(html, keys) {
    const G = FF.Review && FF.Review.GLOSSARY;
    if (!G || !keys || !keys.length) return html;
    const byPhrase = {}, phrases = [];
    keys.forEach(k => { if (G[k]) G[k].phrases.forEach(p => { if (!byPhrase[p.toLowerCase()]) { byPhrase[p.toLowerCase()] = k; phrases.push(p); } }); });
    if (!phrases.length) return html;
    phrases.sort((a, b) => b.length - a.length);
    const re = new RegExp('\\b(' + phrases.map(p => p.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&')).join('|') + ')(s|es|ing|ed)?\\b', 'gi');
    const used = {};
    return html.replace(re, (all, p) => {
      const k = byPhrase[p.toLowerCase()];
      if (!k || used[k]) return all;
      used[k] = true;
      return '<button type="button" class="term" data-k="' + k + '" aria-expanded="false">' + all + '</button>';
    });
  }
  document.addEventListener('click', ev => {
    const b = ev.target && ev.target.closest ? ev.target.closest('button.term') : null;
    if (!b) return;
    const G = FF.Review && FF.Review.GLOSSARY, g = G && G[b.dataset.k];
    if (!g) return;
    // one definition block per paragraph, placed after the paragraph so the sentence stays whole
    const para = b.closest('p') || b.parentElement;
    const open = para.nextElementSibling && para.nextElementSibling.classList.contains('termdef') ? para.nextElementSibling : null;
    const wasOpen = b.getAttribute('aria-expanded') === 'true';
    para.querySelectorAll('button.term[aria-expanded="true"]').forEach(x => x.setAttribute('aria-expanded', 'false'));
    if (open) open.remove();
    if (wasOpen) return;
    const s = document.createElement('div');
    s.className = 'termdef';
    s.setAttribute('role', 'note');
    s.innerHTML = '<b>' + UI.esc(g.term.charAt(0).toUpperCase() + g.term.slice(1)) + '.</b> ' + UI.esc(g.def);
    para.after(s);
    b.setAttribute('aria-expanded', 'true');
  });
  function recapHtml(rv) {
    const rc = rv.recap; if (!rc || !rc.villains.length) return '';
    return '<div class="recap"><h4>Recap</h4>' + rc.villains.map(v =>
      '<div class="villain"><div class="vhead"><b>' + UI.esc(String(v.name || '').split(' ')[0]) + '</b> <span class="pos">' + UI.esc(v.pos) + '</span>' +
      (v.cards ? ' <span class="vcards">' + UI.cardsText(v.cards) + '</span> <span class="made">' + UI.esc(v.made || '') + '</span>' : v.text ? '' : ' <span class="muted">cards not shown</span>') + '</div>' +
      // v.text is the plain-words paragraph (0.8.4 on); older saved hands keep their range and thinking lines
      (v.text ? '<p>' + UI.esc(v.text) + '</p>' : '') +
      (v.rangeText ? '<p>' + UI.esc(v.rangeText) + '</p>' : '') +
      (v.thinking ? '<p class="thinking">' + UI.esc(v.thinking) + '</p>' : '') + '</div>').join('') + '</div>';
  }
  R.render = function () {
    const entry = R.shown; if (!entry) return;
    const rv = entry.rv, m = entry.meta;
    const head = '<div class="rv-head"><div><h3>Hand ' + entry.n + '</h3><div class="rv-sub">' + UI.esc(m.label || '') + '</div></div>' +
      '<button class="btn close-x" id="rv-x" aria-label="Close">✕</button></div>' +
      '<div class="rv-sum"><span class="pos">' + rv.heroPos + '</span> <span class="vcards">' + UI.cardsText(rv.heroCards) + '</span>' +
      (rv.board ? ' <span class="muted">board</span> <span class="vcards">' + UI.cardsText(rv.board) + '</span>' : '') +
      '<span class="net ' + (rv.net >= 0 ? 'pos-net' : 'neg-net') + '">' + UI.bbs(rv.net) + '</span></div>' +
      '<div class="rv-grade"><span class="grade ' + GRADE_CLS[rv.worst] + '">' + (rv.clean ? 'Clean hand' : 'Worst: ' + rv.worst) + '</span>' +
      (rv.evLost > 0 ? '<span class="evlost">EV lost ' + UI.trim(rv.evLost, 2) + ' bb</span>' : '') +
      (entry.solving ? '<span class="solving">Checking with the solver…</span>' : rv.solved ? '<span class="muted">' + rv.solved + ' solver answer' + (rv.solved > 1 ? 's' : '') + '</span>' : '') + '</div>';
    let body;
    if (rv.clean && !entry.expanded) {
      body = '<div class="clean-line">Every decision was fine. <button class="btn link" id="rv-more">Show the decisions</button></div>';
    } else {
      body = rv.decisions.map(d => decisionHtml(d, entry)).join('') + recapHtml(rv);
    }
    const foot = '<div class="rv-foot"><button class="btn primary" id="rv-next">' + UI.esc(R.closeLabel) + '</button></div>';
    sheet().innerHTML = '<div class="sheet">' + head + '<div class="rv-body">' + body + '</div>' + foot + '</div>';
    UI.$('#rv-x').onclick = R.close;
    UI.$('#rv-next').onclick = R.close;
    const more = UI.$('#rv-more'); if (more) more.onclick = () => { entry.expanded = true; R.render(); };
  };

  // ---------------------------------------------------------------- history and stats drawers
  const drawer = () => UI.$('#drawer');
  let drawerKind = null;
  function refreshLists() { if (drawerKind === 'history') R.openHistory(); else if (drawerKind === 'stats') R.openStats(); }
  function openDrawer(kind, title, html) {
    drawerKind = kind;
    drawer().innerHTML = '<div class="sheet"><div class="rv-head"><h3>' + UI.esc(title) + '</h3><button class="btn close-x" id="dr-x" aria-label="Close">✕</button></div><div class="rv-body">' + html + '</div></div>';
    drawer().classList.add('open');
    UI.$('#dr-x').onclick = R.closeDrawer;
  }
  R.closeDrawer = function () { drawerKind = null; drawer().classList.remove('open'); };
  R.openHistory = function () {
    const rows = R.entries.slice().reverse().map(e => {
      const rv = e.rv;
      return '<button class="hrow" data-n="' + e.n + '"><span class="hn">' + e.n + '</span><span class="pos">' + rv.heroPos + '</span><span class="vcards">' + UI.cardsText(rv.heroCards) + '</span>' +
        '<span class="net ' + (rv.net >= 0 ? 'pos-net' : 'neg-net') + '">' + UI.bbs(rv.net) + '</span>' +
        '<span class="grade ' + GRADE_CLS[rv.worst] + '">' + (rv.clean ? 'Clean' : rv.worst) + '</span>' + (e.solving ? '<span class="solving">…</span>' : '') + '</button>';
    }).join('');
    openDrawer('history', 'Hand history', rows ? '<p class="muted">Your last ' + HMAX + ' hands are kept on this device.</p>' + rows : '<p class="muted">No hands yet.</p>');
    UI.$$('.hrow', drawer()).forEach(b => b.onclick = () => {
      const e = byN(+b.dataset.n); if (!e) return;
      if (R.isOpen()) { R.shown = e; e.expanded = true; R.render(); sheet().scrollTop = 0; }
      else { e.expanded = true; R.open(e, 'Close'); }
    });
  };
  R.openStats = function () {
    const s = FF.Review.session(R.entries.filter(e => !e.saved).map(e => e.rv)); // this visit only; older hands stay in the history
    let html = '<div class="stats-grid">' +
      '<div><b>' + s.hands + '</b><span>hands reviewed</span></div>' +
      '<div><b class="' + (s.net >= 0 ? 'pos-net' : 'neg-net') + '">' + UI.bbs(s.net) + '</b><span>net</span></div>' +
      '<div><b>' + UI.trim(s.evLostPer100, 1) + ' bb</b><span>EV lost per 100 hands</span></div>' +
      '<div><b>' + s.clean + '</b><span>clean hands</span></div></div>' +
      '<div class="gradecount">' + ['Good', 'Inaccuracy', 'Mistake', 'Blunder'].map(g => '<span class="grade ' + GRADE_CLS[g] + '">' + g + ' ' + s.grades[g] + '</span>').join('') + '</div>';
    html += '<h4>Top leaks</h4>' + (s.leaks.length ? '<ol class="leaks">' + s.leaks.slice(0, 5).map(x => '<li>' + UI.esc(x.text) + '</li>').join('') + '</ol>' : '<p class="muted">No leaks found yet.</p>');
    if (s.exploitLeaks.length) html += '<h4>Against this table&rsquo;s players</h4><ol class="leaks">' + s.exploitLeaks.slice(0, 3).map(x => '<li>' + UI.esc(x.text) + '</li>').join('') + '</ol>';
    openDrawer('stats', 'Session stats', html);
  };
  R.reset = function () { R.entries.forEach(e => { e.saved = true; }); }; // starts a fresh session; the saved history stays
  R.sessionCount = () => R.entries.filter(e => !e.saved).length;
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { if (R.isOpen()) R.close(); else if (drawerKind) R.closeDrawer(); }
  });
})();
