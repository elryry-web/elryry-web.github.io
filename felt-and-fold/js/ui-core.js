/* Felt & Fold UI core: settings, storage (ff.* keys only), formatting, cards, small DOM helpers, sound. */
(function () {
  'use strict';
  const FF = window.FF = window.FF || {};
  const UI = FF.UI = FF.UI || {};

  // ---------------------------------------------------------------- storage: named ff.* keys only, never clear()
  UI.load = function (key, def) {
    try { const v = localStorage.getItem('ff.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  };
  UI.save = function (key, val) { try { localStorage.setItem('ff.' + key, JSON.stringify(val)); } catch (e) { /* private mode */ } };
  UI.remove = function (key) { try { localStorage.removeItem('ff.' + key); } catch (e) { /* ignore */ } };

  const DEFAULTS = { speed: 'normal', chat: true, hud: false, sound: false, units: 'bb', fourColor: true, autoSkip: true, cardBack: 'oxblood' };
  UI.settings = Object.assign({}, DEFAULTS, UI.load('settings', {}));
  UI.saveSettings = function () { UI.save('settings', UI.settings); UI.applySettings(); };
  UI.applySettings = function () {
    document.body.classList.toggle('four-color', !!UI.settings.fourColor);
    document.body.classList.toggle('hud-on', !!UI.settings.hud);
    if (UI.Art) UI.Art.applyBack();
  };
  const SPEED = { slow: 1.25, normal: 0.8, fast: 0.4, instant: 0.06 };
  UI.speed = function () { return SPEED[UI.settings.speed] || 0.8; };
  UI.sleep = function (ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); };
  UI.wait = function (ms) { return UI.sleep(ms * UI.speed()); };

  // ---------------------------------------------------------------- DOM
  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  UI.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); };
  UI.el = function (html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  UI.toast = function (msg, ms) {
    const box = UI.$('#toasts'); if (!box) return;
    const t = UI.el('<div class="toast">' + UI.esc(msg) + '</div>');
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms || 2600);
    setTimeout(() => t.remove(), (ms || 2600) + 400);
  };
  // a simple modal: buttons [{label, value, cls}] -> Promise(value)
  UI.modal = function (title, bodyHtml, buttons) {
    return new Promise(res => {
      const m = UI.el('<div class="modal-back"><div class="modal" role="dialog" aria-modal="true"><h3>' + UI.esc(title) + '</h3><div class="modal-body">' + bodyHtml +
        '</div><div class="modal-btns"></div></div></div>');
      const row = UI.$('.modal-btns', m);
      (buttons || [{ label: 'OK', value: true }]).forEach(b => {
        const btn = UI.el('<button class="btn ' + (b.cls || '') + '">' + UI.esc(b.label) + '</button>');
        btn.onclick = () => { m.remove(); res(b.value); };
        row.appendChild(btn);
      });
      document.body.appendChild(m);
      const first = UI.$('.btn', row); if (first) first.focus();
    });
  };

  // ---------------------------------------------------------------- formatting
  // chips are cents at cash tables and plain chips in tournaments
  UI.round1 = x => Math.round(x * 10) / 10;
  UI.trim = function (x, d) { const s = x.toFixed(d); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; };
  UI.money = function (cents) { const d = cents / 100; return (d < 0 ? '-$' : '$') + (Math.abs(d) >= 1000 || Math.abs(d) === Math.round(Math.abs(d)) ? Math.abs(d).toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.abs(d).toFixed(2)); };
  UI.dollars = function (d) { return (d < 0 ? '-$' : '$') + Math.abs(d).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  // amount in table chips -> text, in bb or chips per setting
  UI.amt = function (chips, bb, mode, forceChips) {
    if (UI.settings.units === 'bb' && !forceChips && bb) return UI.trim(chips / bb, 1) + ' bb';
    if (mode === 'cash') return UI.money(chips);
    return Math.round(chips).toLocaleString('en-US');
  };
  UI.bbs = function (x) { return (x > 0 ? '+' : '') + UI.trim(x, 1) + ' bb'; };

  // ---------------------------------------------------------------- cards
  const SUIT_SYM = ['♣', '♦', '♥', '♠'], SUIT_CLS = ['c', 'd', 'h', 's'], RANK_TXT = '23456789TJQKA';
  UI.rankTxt = r => r === 8 ? '10' : RANK_TXT[r];
  UI.cardHtml = function (c, cls) {
    if (c == null || c < 0) return '<div class="card back ' + (cls || '') + '"></div>';
    const r = c >> 2, s = c & 3;
    return '<div class="card s-' + SUIT_CLS[s] + ' ' + (cls || '') + '"><span class="cr">' + UI.rankTxt(r) + '</span><span class="cs">' + SUIT_SYM[s] + '</span></div>';
  };
  UI.cardsHtml = function (arr, cls) { return (arr || []).map(c => UI.cardHtml(c, cls)).join(''); };
  // inline text cards: "Kh Js" -> coloured spans
  UI.cardsText = function (str) {
    if (!str) return '';
    return String(str).split(/\s+/).filter(Boolean).map(t => {
      const s = 'cdhs'.indexOf(t[1]); if (s < 0) return UI.esc(t);
      return '<span class="ct s-' + SUIT_CLS[s] + '">' + (t[0] === 'T' ? '10' : t[0]) + SUIT_SYM[s] + '</span>';
    }).join('');
  };

  // ---------------------------------------------------------------- painted art (art/), with the drawn look as the fallback
  // Each group is test-loaded once; until it loads (or if it fails) the CSS and code-drawn versions stay.
  // body.art-<group> turns on the CSS uses (felt, title, backs, markers); Art.ok[group] gates the <img> uses.
  const Art = UI.Art = { ok: {}, BACKS: ['oxblood', 'vines', 'rosette', 'deco'] };
  const ART_TEST = { felt: 'felt.webp', title: 'title.webp', backs: 'backs/oxblood.webp', markers: 'markers/dealer.webp',
    chips: 'chips/ivory.webp', stacks: 'stacks/pile-s.webp', portraits: 'portraits/p01.webp' };
  Art.load = function (onChange) {
    Object.keys(ART_TEST).forEach(k => {
      const im = new Image();
      im.onload = () => { Art.ok[k] = true; document.body.classList.add('art-' + k); if (onChange) onChange(k); };
      im.src = 'art/' + ART_TEST[k];
    });
    Art.rail();
  };

  // Leather rail: art/rail.webp is the rail's cross-section (outer edge on top, walnut at the bottom).
  // It is swept around the felt's rounded shape (read from .felt::before) into a canvas once per size,
  // tiled along the length, and set as #felt's background. Until then the drawn box-shadow rail shows.
  Art.rail = function () {
    const felt = document.getElementById('felt');
    if (!felt || !window.ResizeObserver) return;
    const tex = new Image();
    let url = null, lastKey = '', timer = 0;
    const draw = () => {
      const fw = felt.clientWidth, fh = felt.clientHeight;
      if (fw < 50 || fh < 50) return;
      const cs = getComputedStyle(felt, '::before');
      const L = parseFloat(cs.left), T = parseFloat(cs.top), R = parseFloat(cs.right), B = parseFloat(cs.bottom);
      const w = fw - L - R, h = fh - T - B;
      if (!(w > 20 && h > 20)) return;
      const rad = (v, full) => /%$/.test(v) ? parseFloat(v) / 100 * full : parseFloat(v);
      const parts = (cs.borderTopLeftRadius || '0').split(' ');
      let rx = rad(parts[0], w), ry = rad(parts[1] || parts[0], h);
      const f = Math.min(1, w / (2 * rx), h / (2 * ry));   // CSS scales radii that overflow the box
      rx *= f; ry *= f;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const th = Math.max(9, Math.min(22, Math.round(Math.min(w, h) * 0.034)));
      const key = [fw, fh, L, T, w, h, rx, ry, dpr].map(Math.round).join(',');
      if (key === lastKey) return;
      lastKey = key;
      // boundary of the rounded rect, densely sampled, then walked by arc length
      const pts = [], cx = L + w / 2, cy = T + h / 2, hx = w / 2 - rx, hy = h / 2 - ry;
      const N = 2400;
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        // corner centres; straight sides come from the clamp
        pts.push([cx + Math.sign(c) * hx + rx * c, cy + Math.sign(s) * hy + ry * s]);
      }
      // insert straight sides between the corner arcs (the sign flips at the axes)
      const poly = [];
      for (let i = 0; i < N; i++) {
        const p = pts[i], q = pts[(i + 1) % N];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(d));
        for (let j = 0; j < n; j++) poly.push([p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n]);
      }
      let per = 0;
      const sAt = [0];
      for (let i = 1; i <= poly.length; i++) {
        const p = poly[i - 1], q = poly[i % poly.length];
        per += Math.hypot(q[0] - p[0], q[1] - p[1]);
        sAt.push(per);
      }
      const tileLen = per / Math.max(1, Math.round(per / (th * tex.width / tex.height)));
      const cv = document.createElement('canvas');
      cv.width = Math.round(fw * dpr); cv.height = Math.round(fh * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      // drop shadow under the whole table
      g.save();
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40 * dpr; g.shadowOffsetY = 18 * dpr;
      g.fillStyle = '#4a1c20';
      g.beginPath();
      g.roundRect ? g.roundRect(L - th + 2, T - th + 2, w + 2 * th - 4, h + 2 * th - 4, [{ x: rx + th - 2, y: ry + th - 2 }]) : g.rect(L, T, w, h);
      g.fill();
      g.restore();
      const scale = tex.width / tileLen, step = 1;
      for (let i = 0; i < poly.length; i += step) {
        const p = poly[i], q = poly[(i + 2) % poly.length], o = poly[(i - 2 + poly.length) % poly.length];
        let tx = q[0] - o[0], ty = q[1] - o[1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        // the path runs clockwise on screen, so the outward normal is (ty, -tx); local y points inward
        const nx = ty, ny = -tx;
        const u = sAt[i] % tileLen;
        const sx = u * scale, sw = 2.6 * scale, cut = Math.min(sw, tex.width - sx);
        g.setTransform(tx * dpr, ty * dpr, -nx * dpr, -ny * dpr, p[0] * dpr, p[1] * dpr);
        if (cut > 0.01) g.drawImage(tex, sx, 0, cut, tex.height, -0.3, -th, cut / scale, th + 2);
        // a slice that runs past the tile's end carries on from its start
        if (cut < sw) g.drawImage(tex, 0, 0, sw - cut, tex.height, cut / scale - 0.3, -th, (sw - cut) / scale, th + 2);
      }
      cv.toBlob(b => {
        if (!b) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(b);
        felt.style.backgroundImage = 'url(' + url + ')';
        document.body.classList.add('art-rail');
      });
    };
    tex.onload = () => {
      draw();
      new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 120); }).observe(felt);
      window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
    };
    tex.src = 'art/rail.webp';
  };
  // a broken single image hides itself; the drawn version underneath shows through
  Art.onerr = ' onerror="this.remove()"';
  // chip ladder in big blinds: ivory 1/2, oxblood 1, green 5, charcoal 25, plum 100, mustard 500
  Art.LADDER = [[500, 'mustard'], [100, 'plum'], [25, 'charcoal'], [5, 'green'], [1, 'oxblood'], [0.5, 'ivory']];
  Art.chipList = function (amount, bb, max) {
    let x = bb ? amount / bb : 0;
    const out = [];
    for (const d of Art.LADDER) {
      while (x >= d[0] - 1e-9 && out.length < (max || 5)) { out.push(d[1]); x -= d[0]; }
    }
    if (!out.length) out.push('ivory');
    return out;
  };
  Art.chipsHtml = function (amount, bb) {
    if (!Art.ok.chips) return '<i class="chip"></i>';
    return '<span class="chips">' + Art.chipList(amount, bb).map(c => '<img src="art/chips/' + c + '.webp" alt=""' + Art.onerr + '>').join('') + '</span>';
  };
  Art.pileHtml = function (amount, bb) {
    if (!Art.ok.stacks || !(amount > 0)) return '';
    const x = amount / bb, f = x < 10 ? 'pile-s' : x < 40 ? 'pile-m' : 'pile-l';
    return '<img class="pile" src="art/stacks/' + f + '.webp" alt=""' + Art.onerr + '>';
  };
  Art.stackHtml = function (amount, bb, mode) {
    if (!Art.ok.stacks || !(amount > 0) || !bb) return '';
    const x = amount / bb, n = x < 15 ? 2 : x < 40 ? 4 : x < 80 ? 7 : 10;
    return '<img class="pstk" src="art/stacks/' + (mode === 'cash' ? 'red-' : 'dark-') + n + '.webp" alt=""' + Art.onerr + '>';
  };
  Art.icon = function (name, cls) {
    return Art.ok.markers ? '<img class="' + (cls || 'ico') + '" src="art/markers/' + name + '.webp" alt=""' + Art.onerr + '>' : '';
  };
  // 16 portraits. Each AI gets one from a hash of its name; a clash at the table moves to the next free face.
  // The choice is kept per table (map[id]) so a face never changes mid-session.
  Art.PORTRAITS = 24;
  function hashName(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  Art.portraitIx = function (map, id, name, seatedIds) {
    if (map[id] != null && !seatedIds.some(o => o !== id && map[o] === map[id])) return map[id];
    const used = {};
    seatedIds.forEach(o => { if (o !== id && map[o] != null) used[map[o]] = 1; });
    let ix = hashName(String(name || id)) % Art.PORTRAITS;
    for (let k = 0; k < Art.PORTRAITS && used[ix]; k++) ix = (ix + 1) % Art.PORTRAITS;
    return (map[id] = ix);
  };
  Art.portraitHtml = function (ix) {
    return Art.ok.portraits ? '<img class="portrait" src="art/portraits/p' + String(ix + 1).padStart(2, '0') + '.webp" alt=""' + Art.onerr + '>' : '';
  };
  Art.applyBack = function () {
    const b = Art.BACKS.indexOf(UI.settings.cardBack) >= 0 ? UI.settings.cardBack : 'oxblood';
    document.body.dataset.back = b;
  };

  // ---------------------------------------------------------------- sound: off by default, made on demand
  let ctx = null;
  UI.beep = function (kind) {
    if (!UI.settings.sound) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      ctx = ctx || new A();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      const f = { turn: 660, chip: 320, deal: 900, win: 520 }[kind] || 440;
      o.frequency.value = f; o.type = 'triangle';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.14);
    } catch (e) { /* no audio */ }
  };

  // ---------------------------------------------------------------- HUD stats from hand logs (per player id)
  UI.hud = {};
  UI.hudObserve = function (h) {
    const seen = {};
    let raises = 0;
    h.order.forEach(s => { const id = h.players[s].id; const x = UI.hud[id] || (UI.hud[id] = { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, agg: 0, calls: 0 }); x.hands++; seen[id] = {}; });
    h.log.forEach(e => {
      if (e.ev !== 'act') return;
      const id = h.players[e.seat].id, x = UI.hud[id], f = seen[id];
      if (e.street === 'preflop') {
        if (raises === 1 && !f.tbOpp) { f.tbOpp = 1; x.tbOpp++; }
        if ((e.type === 'call' || e.type === 'raise' || e.type === 'bet') && !f.vpip) { f.vpip = 1; x.vpip++; }
        if (e.type === 'raise' || e.type === 'bet') { if (!f.pfr) { f.pfr = 1; x.pfr++; } if (raises === 1 && !f.tb) { f.tb = 1; x.tb++; } raises++; }
      } else {
        if (e.type === 'bet' || e.type === 'raise') x.agg++;
        else if (e.type === 'call') x.calls++;
      }
    });
  };
  UI.hudText = function (id) {
    const x = UI.hud[id]; if (!x || !x.hands) return '';
    const p = (a, b) => b ? Math.round(100 * a / b) : 0;
    const af = x.calls ? UI.trim(x.agg / x.calls, 1) : (x.agg ? x.agg + '' : '0');
    return p(x.vpip, x.hands) + '/' + p(x.pfr, x.hands) + '/' + p(x.tb, x.tbOpp) + ' AF ' + af + ' (' + x.hands + ')';
  };
})();
