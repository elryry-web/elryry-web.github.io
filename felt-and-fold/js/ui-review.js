/* Felt & Fold UI: hand review panel, hand history, stats (this session or all saved hands), the Coach. */
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
  const HKEY = 'history', HMAX = 200, HBYTES = 600000, HMATH = 25; // number tokens are saved for the newest 25 hands only
  const r2 = x => Math.round(x * 100) / 100;
  // a hand's number tokens, saved without the fields the popover does not show
  function packMath(m) {
    if (!m) return null;
    const out = {};
    Object.keys(m).forEach(id => { const t = m[id]; out[id] = { title: t.title, words: t.words, formula: t.formula, note: t.note || '', source: t.source || '', meaning: t.meaning || '' }; });
    return out;
  }
  function packDecision(d, math) {
    return { street: d.street, boardStr: d.boardStr, grade: d.grade, evLost: d.evLost, source: d.source, spot: d.spot, pot: d.pot, toCall: d.toCall,
      did: { action: d.did.action, toBB: d.did.toBB, addBB: d.did.addBB }, hand: d.hand, leak: d.leak, text: d.text, concepts: d.concepts || [],
      mix: d.mix.filter(m => m.freq >= 0.005).map(m => ({ action: m.action, sizeLabel: m.sizeLabel, freq: r2(m.freq), toBB: m.toBB })),
      exploit: d.exploit ? { gradedBy: d.exploit.gradedBy, name: d.exploit.name, best: d.exploit.best, baseGrade: d.exploit.baseGrade, state: d.exploit.state, plan: d.exploit.plan || null } : null,
      later: d.later || '', tm: math && d.tm ? d.tm : undefined, math: math && d.tm ? packMath(d.math) : undefined };
  }
  function pack(e, math) {
    const rv = e.rv, rc = rv.recap;
    return { n: e.n, at: e.at, label: e.meta.label || '', rv: { handId: rv.handId, mode: rv.mode, bb: rv.bb, seats: rv.seats || undefined, heroPos: rv.heroPos, heroCards: rv.heroCards, board: rv.board,
      net: rv.net, blind: rv.blind || null, excluded: rv.excluded || undefined, worst: rv.worst, clean: rv.clean, evLost: rv.evLost, solved: rv.solved || 0,
      recap: rc ? { villains: rc.villains.map(v => ({ name: v.name, pos: v.pos, cards: v.cards, made: v.made, text: v.text, rangeText: v.rangeText, thinking: v.thinking,
        tm: math && v.tm ? v.tm : undefined, math: math && v.tm ? packMath(v.math) : undefined })) } : null,
      decisions: rv.decisions.map(d => packDecision(d, math)) } };
  }
  function saveHistory() {
    const keep = R.entries.slice(-HMAX);
    let list = keep.map((e, i) => pack(e, i >= keep.length - HMATH)), str = JSON.stringify(list);
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
    rv.seats = h.order ? h.order.length : null; // the table size, for the Coach's preflop targets
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
    sheet().classList.remove('open'); R.shown = null; drawn = null;
    const r = resolveClose; resolveClose = null; if (r) r();
  };
  R.isOpen = () => !!R.shown;

  // Amounts in the chosen unit for one review: rv.bb is that hand's big blind in table chips (older saved hands lack it: bb only)
  function unitsOf(rv) {
    const bb = rv && rv.bb, mode = rv && rv.mode;
    return { amt: (x, signed) => UI.bbAmt(x, bb, mode, signed), text: t => UI.bbText(t, bb, mode) };
  }
  // Action colours never reuse a grade colour (green, yellow, orange, red): check slate, call blue, bets and raises violet
  // (lighter for smaller sizes), all in deep violet, fold dark grey.
  const AGG_SHADES = ['#cbb8f7', '#a98bec', '#8a66dd'];
  const isAgg = a => a === 'bet' || a === 'raise';
  // the segment that is the player's own play: same action, and for a bet or raise the nearest size within 0.55-1.7x
  function heroIndex(rows, did) {
    let best = -1, bd = Infinity;
    rows.forEach((r, i) => {
      if (r.m.action !== did.action) return;
      const x = isAgg(did.action) && r.m.toBB > 0 && did.toBB > 0 ? Math.abs(Math.log(did.toBB / r.m.toBB)) : 0;
      if (x < bd) { bd = x; best = i; }
    });
    return best >= 0 && bd <= Math.log(1.7) ? best : -1;
  }
  function mixBar(d, u) {
    const rows = FF.Review.mixPct(d.mix); // whole percentages that add up to 100
    const agg = rows.map((r, i) => i).filter(i => isAgg(rows[i].m.action)).sort((a, b) => (rows[a].m.toBB || 0) - (rows[b].m.toBB || 0));
    const shade = {};
    agg.forEach((i, k) => { shade[i] = AGG_SHADES[agg.length === 1 ? 1 : Math.round(k * 2 / (agg.length - 1))]; });
    const you = d.did ? heroIndex(rows, d.did) : -1;
    const style = (i, extra) => ' style="' + (shade[i] ? 'background:' + shade[i] + ';' : '') + (extra || '') + '"';
    const name = r => ACT_NAME[r.m.action] + (r.m.sizeLabel && r.m.action !== 'allin' ? ' ' + UI.esc(u.text(r.m.sizeLabel)) : '');
    const segs = rows.map((r, i) => '<i class="' + (ACT_CLS[r.m.action] || '') + (i === you ? ' you' : '') + '"' + style(i, 'width:' + r.pct + '%') + '></i>').join('');
    let at = 0, mid = null;
    rows.forEach((r, i) => { if (i === you) mid = at + r.pct / 2; at += r.pct; });
    // the caret tip sits at the segment's exact centre (kept 3px inside the ends); only the "You" text is held back from the edges
    const mark = mid != null ? '<span class="youmark" style="left:clamp(12px,' + mid + '%,calc(100% - 12px))">You</span>' +
      '<span class="youcaret" style="left:clamp(3px,' + mid + '%,calc(100% - 3px))"></span>' : '';
    const mine = d.did ? UI.esc(didText(d, u).replace(/ \([^)]*\)$/, '')) : '';
    // a bet of pot matched to the 3/4-pot bucket names both: "You: Bet pot (closest baseline size: three-quarters pot, 3%)"
    const youText = r => mine && isAgg(r.m.action) && r.m.sizeLabel && mine !== name(r) && Math.abs(d.did.toBB - r.m.toBB) > 0.02 * r.m.toBB
      ? 'You: ' + mine + ' (closest baseline size: ' + UI.esc(u.text(r.m.sizeLabel)) + ', ' + r.pct + '%)'
      : 'You: ' + name(r) + ' ' + r.pct + '%';
    let legend = rows.map((r, i) => '<span' + (i === you ? ' class="you"' : '') + '><b class="dot ' + (ACT_CLS[r.m.action] || '') + '"' + style(i) + '></b>' +
      (i === you ? youText(r) : name(r) + ' ' + r.pct + '%') + '</span>').join('');
    if (you < 0 && d.did) legend += '<span class="you"><b class="dot dot-you"></b>You: ' + mine + ' (0%)</span>';
    return '<div class="mixrow"><span class="mixlab">Baseline:</span><div class="mixcol' + (mark ? ' marked' : '') + '">' + mark + '<div class="mixbar">' + segs + '</div></div></div>' +
      '<div class="mixlegend">' + legend + '</div>';
  }
  // the baseline bar, and under it the plan the grade follows when the player's real play wants something else
  function planHtml(d, u) {
    const x = d.exploit, p = x && x.gradedBy === 'exploit' && x.plan;
    if (!p) return mixBar(d, u);
    return mixBar(d, u) + '<div class="ddid"><span class="muted">vs ' + UI.esc(x.name) + ':</span> <b>' + UI.esc(u.text(p.label)) + '</b></div>';
  }
  // "Bet half pot (6.5 bb)", "Raise to 3x (19.5 bb)", "All-in (48 bb)"; preflop "Raise to 4.7 bb" (see FF.Review.didLabel)
  function didText(d, u) { return FF.Review.didLabel(d, x => u ? u.amt(x) : UI.trim(x, 1) + ' bb'); }
  function decisionHtml(d, entry) {
    const u = unitsOf(entry.rv), pending = entry.solving && d.source === 'Estimate' && d.street !== 'preflop';
    const board = d.boardStr ? '<span class="dboard">' + UI.cardsText(d.boardStr) + '</span>' : '';
    return '<div class="decision">' +
      '<div class="dhead"><span class="street">' + d.street.charAt(0).toUpperCase() + d.street.slice(1) + '</span>' + board +
      '<span class="grade ' + GRADE_CLS[d.grade] + '">' + d.grade + '</span>' +
      (d.evLost > 0 ? '<span class="evlost">-' + evAmt(d.evLost, u) + '</span>' : '') +
      '<span class="src src-' + d.source.toLowerCase() + '" title="' + UI.esc(SOURCE_TIP[d.source] || '') + '">' + d.source + '</span>' +
      (pending ? '<span class="solving">solving…</span>' : '') + '</div>' +
      '<div class="dspot">' + termsHtml(UI.esc(u.text(d.spot))) + '. Pot ' + u.amt(d.pot) + (d.toCall ? ', ' + u.amt(d.toCall) + ' to call' : '') + '.</div>' +
      '<div class="ddid">You: <b>' + UI.esc(didText(d, u)) + '</b>' + (d.hand ? ' with ' + UI.esc(d.hand) : '') + '</div>' +
      planHtml(d, u) +
      '<p class="dtext">' + mathHtml(d.text, d.tm, d.math, u, d.concepts) + '</p>' +
      (d.later ? '<p class="dlater">' + termsHtml(UI.esc(u.text(d.later))) + '</p>' : '') + '</div>';
  }
  // an EV figure: two decimals in bb, the unit's own rounding otherwise
  function evAmt(x, u) { return UI.settings.units === 'bb' ? UI.trim(x, 2) + ' bb' : u.amt(x);
  }
  // the first mention of each glossary term in a paragraph becomes a button that opens its definition in place
  // (the reason's own concepts claim their phrases first; matching lives in FF.Review.linkTerms)
  function termsHtml(html, keys) {
    const R = FF.Review;
    if (!R || !R.linkTerms) return html;
    return R.linkTerms(html, keys || [], (all, k) => '<button type="button" class="term" data-k="' + k + '" aria-expanded="false">' + all + '</button>');
  }
  // ---------------------------------------------------------------- show the math
  // review.js marks each derived number in tm as \uE000 id \uE001 text \uE002, with its working in math[id];
  // the marks pass through esc, the units switch and the glossary links, then become buttons. Old saved hands have no tm.
  let MATH = [];
  function mathHtml(plain, tm, math, u, keys) {
    if (!tm || !math) return termsHtml(UI.esc(u.text(plain)), keys);
    const at = MATH.push({ math: math, u: u }) - 1;
    return termsHtml(UI.esc(u.text(tm)), keys).replace(/\uE000(\w+)\uE001([^\uE002]*)\uE002/g, (all, id, txt) => math[id]
      ? '<button type="button" class="num" data-m="' + at + '" data-id="' + id + '" aria-expanded="false">' + txt + '</button>' : txt);
  }
  // the block under a paragraph (a glossary definition or a math popover); one at a time per paragraph
  function closeBelow(para) {
    const nx = para.nextElementSibling;
    if (nx && (nx.classList.contains('termdef') || nx.classList.contains('mathpop'))) nx.remove();
    para.querySelectorAll(':scope > .termdef, :scope > .mathpop').forEach(x => x.remove());
    para.normalize();
    para.querySelectorAll('button.term[aria-expanded="true"], button.num[aria-expanded="true"]').forEach(x => x.setAttribute('aria-expanded', 'false'));
  }
  function closeMath() {
    let any = false;
    document.querySelectorAll('.mathpop').forEach(x => { const host = x.parentElement.closest('p') || x.previousElementSibling; if (host) closeBelow(host); else x.remove(); any = true; });
    return any;
  }
  // the block opens under the sentence that holds the link, so the sentence stays whole; after the whole paragraph
  // it could land a screen or more below the tap on a phone. The paragraph's end is the fallback.
  function placeBelow(b, para, s) {
    const w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    w.currentNode = b.lastChild || b;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (t.parentElement.closest('button')) continue;
      const m = /[.!?](?=\s|$)/.exec(t.data);
      if (!m) continue;
      if (m.index + 1 < t.data.length || t.nextSibling) { t.splitText(m.index + 1).before(s); break; }
      break; // the sentence ends the paragraph
    }
    if (!s.isConnected) para.after(s);
    s.scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('click', ev => {
    const t = ev.target && ev.target.closest ? ev.target : null;
    const b = t && t.closest('button.num');
    if (!b) { if (t && !t.closest('.mathpop') && !t.closest('button.term')) closeMath(); return; }
    const reg = MATH[+b.dataset.m], tk = reg && reg.math[b.dataset.id];
    if (!tk) return;
    const para = b.closest('p') || b.parentElement, wasOpen = b.getAttribute('aria-expanded') === 'true';
    closeMath(); closeBelow(para); // one popover on the sheet at a time
    if (wasOpen) return;
    const v = FF.Review.mathView ? FF.Review.mathView(tk, reg.u.text) : tk;
    const s = document.createElement('div');
    s.className = 'mathpop';
    s.setAttribute('role', 'note');
    s.innerHTML = '<b>' + UI.esc(v.title || 'How this was worked out') + '</b>' +
      (v.words ? '<div class="mwords">' + UI.esc(v.words) + '</div>' : '') +
      '<div class="mform">' + UI.esc(v.formula) + '</div>' +
      (v.note ? '<div class="mnote">' + UI.esc(v.note) + '</div>' : '') +
      (v.source ? '<div class="msrc">Source: ' + UI.esc(v.source) + '</div>' : '') +
      (v.meaning ? '<div class="mmean">' + UI.esc(v.meaning) + '</div>' : '');
    placeBelow(b, para, s);
    b.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', ev => {
    const b = ev.target && ev.target.closest ? ev.target.closest('button.term') : null;
    if (!b) return;
    const G = FF.Review && FF.Review.GLOSSARY, g = G && G[b.dataset.k];
    if (!g) return;
    // one definition block per paragraph, placed under the link's sentence (placeBelow)
    const para = b.closest('p') || b.parentElement;
    const wasOpen = b.getAttribute('aria-expanded') === 'true';
    closeBelow(para);
    if (wasOpen) return;
    const s = document.createElement('div');
    s.className = 'termdef';
    s.setAttribute('role', 'note');
    s.innerHTML = '<b>' + UI.esc(g.term.charAt(0).toUpperCase() + g.term.slice(1)) + '.</b> ' + UI.esc(g.def);
    placeBelow(b, para, s);
    b.setAttribute('aria-expanded', 'true');
  });
  function recapHtml(rv) {
    const rc = rv.recap; if (!rc || !rc.villains.length) return '';
    return '<div class="recap"><h4>Recap</h4>' + rc.villains.map(v =>
      '<div class="villain"><div class="vhead"><b>' + UI.esc(String(v.name || '').split(' ')[0]) + '</b> <span class="pos">' + UI.esc(v.pos) + '</span>' +
      (v.cards ? ' <span class="vcards">' + UI.cardsText(v.cards) + '</span> <span class="made">' + UI.esc(v.made || '') + '</span>' : v.text ? '' : ' <span class="muted">cards not shown</span>') + '</div>' +
      // v.text is the plain-words paragraph (0.8.4 on); older saved hands keep their range and thinking lines
      (v.text ? '<p>' + mathHtml(v.text, v.tm, v.math, unitsOf(rv)) + '</p>' : '') +
      (v.rangeText ? '<p>' + termsHtml(UI.esc(v.rangeText)) + '</p>' : '') +
      (v.thinking ? '<p class="thinking">' + termsHtml(UI.esc(v.thinking)) + '</p>' : '') + '</div>').join('') + '</div>';
  }
  // the hand's result: green or red, or muted grey with '(blind)' when only the forced chips were lost
  function netHtml(rv, label, row) {
    const txt = unitsOf(rv).text(FF.Review.netLabel ? FF.Review.netLabel(rv) : UI.bbs(rv.net));
    return '<span class="net ' + (rv.blind ? 'muted' : rv.net >= 0 ? 'pos-net' : 'neg-net') + '">' +
      (label ? '<span class="muted" style="font-weight:400">Result</span> ' : '') + (row && rv.blind ? blindSplit(txt, rv.blind) : UI.esc(txt)) + '</span>';
  }
  // a history row's '(blind)': inline on desktop, a small tag under the amount on phones (the CSS shows one of the two)
  function blindSplit(txt, kind) {
    const tail = ' (' + kind + ')', i = txt.lastIndexOf(tail);
    if (i < 0) return UI.esc(txt);
    return UI.esc(txt.slice(0, i)) + '<span class="bl-long">' + UI.esc(tail) + '</span><span class="bl-short">' + UI.esc(kind) + '</span>';
  }
  // a re-render (the solver finishing, the units switch) keeps the sheet's scroll and reopens the open note
  // when the same link is still in the same place
  let drawn = null; // the entry the sheet shows now
  function openNote() {
    const bs = UI.$$('button.num, button.term', sheet()), i = bs.findIndex(b => b.getAttribute('aria-expanded') === 'true');
    return i < 0 ? null : { i: i, t: bs[i].textContent };
  }
  R.render = function () {
    const entry = R.shown; if (!entry) return;
    const same = drawn === entry, bodyEl = same && sheet().querySelector('.rv-body'), top = bodyEl ? bodyEl.scrollTop : 0, note = same ? openNote() : null;
    drawn = entry;
    MATH = []; // the popover registry belongs to the sheet being drawn
    const rv = entry.rv, m = entry.meta;
    const head = '<div class="rv-head"><div><h3>Hand ' + entry.n + '</h3><div class="rv-sub">' + UI.esc(m.label || '') + '</div></div>' +
      '<button class="btn close-x" id="rv-x" aria-label="Close">✕</button></div>' +
      '<div class="rv-sum"><span class="pos">' + rv.heroPos + '</span> <span class="vcards">' + UI.cardsText(rv.heroCards) + '</span>' +
      (rv.board ? ' <span class="muted">board</span> <span class="vcards">' + UI.cardsText(rv.board) + '</span>' : '') +
      netHtml(rv, true) + '</div>' +
      '<div class="rv-grade"><span class="grade ' + GRADE_CLS[rv.worst] + '">' + (rv.clean ? 'Clean hand' : 'Worst: ' + rv.worst) + '</span>' +
      (rv.evLost > 0 ? '<span class="evlost">EV lost ' + evAmt(rv.evLost, unitsOf(rv)) + '</span>' : '') +
      (entry.solving ? '<span class="solving">Checking with the solver…</span>' : rv.solved ? '<span class="muted">' + rv.solved + ' solver answer' + (rv.solved > 1 ? 's' : '') + '</span>' : '') +
      // a misclick hand can be left out of Stats and the Coach; the chips stay as they fell
      '<button class="btn rv-excl" id="rv-excl" aria-pressed="' + !!rv.excluded + '">' + (rv.excluded ? 'Include again' : 'Exclude') + '</button>' +
      (rv.excluded ? '<span class="muted small rv-exnote">Left out of Stats and the Coach.</span>' : '') + '</div>';
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
    UI.$('#rv-excl').onclick = () => { rv.excluded = !rv.excluded || undefined; saveHistory(); R.render(); refreshLists(); };
    if (bodyEl) sheet().querySelector('.rv-body').scrollTop = top;
    if (note) { const b = UI.$$('button.num, button.term', sheet())[note.i]; if (b && b.textContent === note.t) b.click(); }
  };

  // ---------------------------------------------------------------- history and stats drawers
  const drawer = () => UI.$('#drawer');
  let drawerKind = null;
  function refreshLists() { if (drawerKind === 'history') R.openHistory(); else if (drawerKind === 'stats') R.openStats(); else if (drawerKind === 'coach') R.openCoach(); }
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
      return '<button class="hrow' + (rv.excluded ? ' hx' : '') + '" data-n="' + e.n + '"><span class="hn">' + e.n + '</span><span class="pos">' + rv.heroPos + '</span><span class="vcards">' + UI.cardsText(rv.heroCards) + '</span>' +
        netHtml(rv, false, true) +
        '<span class="grade ' + GRADE_CLS[rv.worst] + '">' + (rv.clean ? 'Clean' : rv.worst) + '</span>' + (rv.excluded ? '<span class="xtag">excluded</span>' : '') + (e.solving ? '<span class="solving">…</span>' : '') + '</button>';
    }).join('');
    openDrawer('history', 'Hand history', rows ? '<p class="muted">Your last ' + HMAX + ' hands are kept on this device.</p>' + rows : '<p class="muted">No hands yet.</p>');
    bindRows();
  };
  // a tap on a hand row (History or a Coach example) opens that hand's review over the drawer
  function bindRows() {
    UI.$$('.hrow', drawer()).forEach(b => b.onclick = () => {
      const e = byN(+b.dataset.n); if (!e) return;
      if (R.isOpen()) { R.shown = e; e.expanded = true; R.render(); sheet().scrollTop = 0; }
      else { e.expanded = true; R.open(e, 'Close'); }
    });
  }
  // amounts for a set of hands: dollars or chips need one table's big blind. Hands from one cash stake share it;
  // tournament levels and mixed tables add up hand by hand for the net, and EV figures stay in bb.
  function unitsFor(rvs) {
    const sameBB = !!rvs.length && rvs.every(r => r.bb && r.mode === rvs[0].mode && (r.mode !== 'cash' || r.bb === rvs[0].bb));
    const want = UI.settings.units !== 'bb', evConv = want && sameBB && rvs[0].mode === 'cash';
    let note = '';
    if (want && rvs.length && !evConv) note = rvs.some(r => !r.bb) ? 'Some amounts stay in bb. Older saved hands do not store the stakes.'
      : !sameBB ? 'Some amounts stay in bb. These hands come from different tables.' : 'EV figures stay in bb in tournaments.';
    return { sameBB, evConv, note,
      ev: x => evConv ? UI.amt(Math.round(x * rvs[0].bb), rvs[0].bb, 'cash', true) : UI.trim(x, 1) + ' bb',
      text: t => sameBB ? UI.bbText(t, rvs[0].bb, rvs[0].mode) : t };
  }
  // "This session" or "All saved hands", remembered per viewer (ff.statsView)
  const exLine = n => n ? '<p class="muted small">' + n + ' hand' + (n > 1 ? 's' : '') + ' excluded. Tap a hand in History to include it again.</p>' : '';
  const statsView = () => UI.load('statsView', 'session') === 'all' ? 'all' : 'session';
  R.openStats = function () {
    const view = statsView(), all = R.entries.map(e => e.rv), sess = R.entries.filter(e => !e.saved).map(e => e.rv);
    const pick = view === 'all' ? all : sess, s = FF.Review.session(pick), rvs = pick.filter(r => !r.excluded), u = unitsFor(rvs); // session() skips excluded hands
    let html = '<div class="seg" role="group" aria-label="Which hands">' +
      '<button class="btn segb' + (view === 'session' ? ' on' : '') + '" data-v="session" aria-pressed="' + (view === 'session') + '">This session</button>' +
      '<button class="btn segb' + (view === 'all' ? ' on' : '') + '" data-v="all" aria-pressed="' + (view === 'all') + '">All saved hands (' + all.length + ')</button></div>';
    if (!rvs.length) {
      html += '<p class="muted">' + (view === 'session' ? 'No hands this session yet.' + (all.length ? ' Tap All saved hands to see your history.' : '') : 'No saved hands yet.') + '</p>';
    } else {
      let netTxt = UI.bbs(s.net);
      if (UI.settings.units !== 'bb' && u.sameBB) {
        const chips = rvs.reduce((a, r) => a + r.net * r.bb, 0);
        netTxt = (chips > 0 ? '+' : '') + UI.amt(Math.round(chips), rvs[0].bb, rvs[0].mode, true);
      }
      // a saved hand from an old version may lack leak tags: the leak list leaves those decisions out and says so
      const untagged = rvs.reduce((a, r) => a + r.decisions.filter(d => d.grade !== 'Good' && !('leak' in d)).length, 0);
      html += '<div class="stats-grid">' +
        '<div><b>' + s.hands + '</b><span>hands reviewed</span></div>' +
        '<div><b class="' + (s.net >= 0 ? 'pos-net' : 'neg-net') + '">' + netTxt + '</b><span>net</span></div>' +
        '<div><b>' + u.ev(s.evLostPer100) + '</b><span>EV lost per 100 hands</span></div>' +
        '<div><b>' + s.clean + '</b><span>clean hands</span></div></div>' +
        '<div class="gradecount">' + ['Good', 'Inaccuracy', 'Mistake', 'Blunder'].map(g => '<span class="grade ' + GRADE_CLS[g] + '">' + g + ' ' + s.grades[g] + '</span>').join('') + '</div>';
      html += '<h4>Top leaks</h4>' + (s.leaks.length ? '<ol class="leaks">' + s.leaks.slice(0, 5).map(x => '<li>' + UI.esc(u.text(x.text)) + '</li>').join('') + '</ol>' : '<p class="muted">No leaks found yet.</p>');
      if (untagged) html += '<p class="muted small">Leaks: — for ' + untagged + ' older decision' + (untagged > 1 ? 's' : '') + '. Hands saved before leak tags have none.</p>';
      if (s.exploitLeaks.length) html += '<h4>Against this table&rsquo;s players</h4><ol class="leaks">' + s.exploitLeaks.slice(0, 3).map(x => '<li>' + UI.esc(u.text(x.text)) + '</li>').join('') + '</ol>';
      if (u.note) html += '<p class="muted small">' + UI.esc(u.note) + '</p>';
    }
    html += exLine(s.excluded);
    openDrawer('stats', 'Stats', html);
    UI.$$('.segb', drawer()).forEach(b => b.onclick = () => { UI.save('statsView', b.dataset.v); R.openStats(); });
  };

  // ---------------------------------------------------------------- the Coach: patterns over all saved hands (FF.Coach)
  // bars in one neutral sand colour: never a grade colour or a baseline-bar colour
  function barsHtml(title, rows, u, name) {
    const max = Math.max(0, ...rows.map(r => r.evLost));
    return '<div class="cbars"><h5>' + title + '</h5>' + rows.map(r => '<div class="cbar"><span class="cl">' + UI.esc(name ? name(r) : r.label) + '</span>' +
      '<span class="ct"><i style="width:' + (max > 0 ? Math.max(r.evLost > 0 ? 2 : 0, Math.round(100 * r.evLost / max)) : 0) + '%"></i></span><span class="cv">' + u.ev(r.evLost) + '</span></div>').join('') + '</div>';
  }
  const para = t => '<p>' + termsHtml(UI.esc(t)) + '</p>';
  R.openCoach = function () {
    const rvs = R.entries.map(e => e.rv).filter(r => !r.excluded), u = unitsFor(rvs);
    const c = FF.Coach.analyze(R.entries.map(e => ({ n: e.n, rv: e.rv })));
    let html = '<p class="muted">From your last ' + c.hands + ' saved hand' + (c.hands === 1 ? '' : 's') + '.</p><h4>Work on this</h4>';
    if (c.focus) {
      const f = c.focus;
      html += '<div class="coach-focus"><p class="ctitle"><b>' + UI.esc(f.title) + '</b></p>' + para(f.why) +
        '<p>You lost about <b>' + u.ev(f.evLost) + '</b> in ' + f.count + ' spots. That is about ' + u.ev(f.avg) + ' each time.</p>' +
        '<p class="crule"><b>Rule of thumb:</b> ' + termsHtml(UI.esc(f.rule)) + '</p>' +
        '<div class="cex"><span class="muted small">Example hands. Tap one to review it.</span>' + f.examples.filter(x => byN(x.n)).map(x =>
          '<button class="hrow" data-n="' + x.n + '"><span class="hn">' + x.n + '</span><span class="pos">' + UI.esc(x.heroPos) + '</span><span class="vcards">' + UI.cardsText(x.heroCards) + '</span>' +
          '<span class="cst">' + UI.esc(x.street) + '</span><span class="net neg-net">-' + u.ev(x.evLost) + '</span></button>').join('') + '</div></div>';
    } else if (!c.hands) {
      html += '<p class="muted">No saved hands yet. Play some hands and come back.</p>';
    } else {
      const n = c.need;
      html += '<p>There is not enough data yet. The Coach names a leak once it has ' + FF.Coach.MIN + ' examples.' +
        (n.closest ? ' The closest is &ldquo;' + UI.esc(n.closest) + '&rdquo; with ' + n.count + '.' : '') + ' Play about ' + n.more + ' more hands.</p>';
    }
    if (c.also.length) html += '<h4>Also watch</h4><ul class="leaks">' + c.also.map(x => '<li><b>' + UI.esc(x.title) + '</b>: ' + x.count + ' spots, about ' + u.ev(x.evLost) + ' lost.</li>').join('') + '</ul>';
    if (c.mistakes) {
      const GW = { Inaccuracy: 'Inaccuracies', Mistake: 'Mistakes', Blunder: 'Blunders' };
      html += '<h4>Where the EV goes</h4>' + barsHtml('By position', c.byPos, u) + barsHtml('By street', c.byStreet, u) +
        barsHtml('By grade', c.byGrade, u, r => GW[r.key]) + barsHtml('By action', c.byAction, u);
    }
    const hb = c.habits;
    html += '<h4>Preflop habits</h4>';
    if (!hb.hands) html += '<p class="muted">No preflop decisions yet.</p>';
    else {
      html += '<p class="muted small">Targets for ' + (hb.seats === 6 ? 'a 6-max table' : 'tables of ' + hb.tableName) + ' against weak players. From ' + hb.hands + ' hands.</p>' +
        hb.stats.map(st => '<div class="habit"><div class="hline"><b>' + st.name + '</b> <span class="hv">' + (st.value == null ? '—' : Math.round(st.value) + '%') + '</span>' +
          ' <span class="muted small">target ' + st.band[0] + '–' + st.band[1] + '%</span>' + (st.state === 'ok' ? ' <span class="hok">on target</span>' : st.state === 'none' ? '' : ' <span class="hoff">' + st.state + '</span>') + '</div>' +
          para(st.line) + '</div>').join('');
    }
    const tr = c.trend;
    if (tr) {
      html += '<h4>Trend</h4><p>Your last 50 hands against the ' + tr.prev.hands + ' before: <b>' + tr.verdict + '</b>.</p>' +
        '<p>EV lost per 100 hands: ' + u.ev(tr.last.per100) + ' now, ' + u.ev(tr.prev.per100) + ' before. Mistakes: ' + tr.last.mistakes + ' now, ' + tr.prev.mistakes + ' before' +
        (tr.prev.hands !== 50 ? ' (' + tr.prev.mistakesPer100 + ' per 100 hands)' : '') + '.</p>';
    }
    if (u.note) html += '<p class="muted small">' + UI.esc(u.note) + '</p>';
    html += exLine(c.excluded);
    openDrawer('coach', 'Coach', '<div class="coach">' + html + '</div>');
    bindRows();
  };
  UI.unitListeners.push(() => { if (R.shown) R.render(); refreshLists(); });
  R.reset = function () { R.entries.forEach(e => { e.saved = true; }); }; // starts a fresh session; the saved history stays
  R.sessionCount = () => R.entries.filter(e => !e.saved).length;
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { if (closeMath()) return; if (R.isOpen()) R.close(); else if (drawerKind) R.closeDrawer(); }
  });
})();
