'use strict';
/* =====================================================================
   QUILL & SIGIL — shared.js (v183)
   Levels other people made in the level editor (quill-and-sigil-editor/) and shared as a link. The link holds the whole
   level: quill-and-sigil/#level=<code>, the code being the level's JSON, deflated and written in base64url ("1…"), or
   plain ("0…") where the browser has no CompressionStream.
   - LevelCode: the codec (check, write, read a level). The editor page loads this file for it too, so the format
     exists once, here; the editor's custom.js adds only what test play needs.
   - Shared: the player's shared levels (localStorage quillsigil.shared.v1, oldest first), opening a link or a pasted
     code, and the boot that reads #level= from the game's own address. The Shared Levels pages of the folio are drawn by
     Folio (main.js); a shared level is played by Game.startShared (main.js), as LEVELS[-1], outside the campaign save.
   Nothing here runs at load but the codec's definitions, so the editor (no Game, no folio) can load it as it is.
   ===================================================================== */
const LevelCode = (() => {
  const SIG = ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'];
  const T_OK = /^[ 0-9_=~*]*$/, O_OK = /^[.#IBDGfOC]*$/;
  const MAXW = 32, MAXH = 32;

  const b64u = {
    enc(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
      const b = atob(str), u = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return u;
    },
  };
  async function pipe(bytes, stream) {
    const r = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await r.arrayBuffer());
  }
  const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f]/g, '').slice(0, n) : '';
  const int = (v, lo, hi, d) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d;

  /* a level from anywhere (a link, pasted JSON, the editor's store) made safe and complete, or an Error thrown */
  function sanitize(o) {
    if (!o || typeof o !== 'object') throw new Error('not a level');
    const t = Array.isArray(o.t) ? o.t.map(r => String(r)) : null;
    if (!t || !t.length || t.length > MAXH) throw new Error('the map is missing');
    const W = Math.max(...t.map(r => r.length));
    if (!(W >= 1 && W <= MAXW)) throw new Error('the map is the wrong size');
    if (!t.every(r => T_OK.test(r))) throw new Error('the map holds unknown ground');
    const H = t.length;
    const tt = t.map(r => r.padEnd(W, ' '));
    const oo = [];
    for (let y = 0; y < H; y++) {
      const r = Array.isArray(o.o) && typeof o.o[y] === 'string' ? o.o[y] : '';
      if (!O_OK.test(r)) throw new Error('the map holds unknown things');
      oo.push(r.slice(0, W).padEnd(W, '.'));
    }
    const all = oo.join('');
    if ((all.match(/O/g) || []).length !== 1) throw new Error('a level needs one orb');
    if (!/G/.test(all)) throw new Error('a level needs a font');
    const sigils = SIG.filter(id => Array.isArray(o.sigils) && o.sigils.includes(id));
    if (!sigils.length) throw new Error('a level needs at least one sigil');
    const L = {
      id: 'custom', name: str(o.name, 40).trim() || 'A Custom Lesson', lesson: str(o.lesson, 700), hint: str(o.hint, 400),
      sigils, par: int(o.par, 1, 30, 1), t: tt, o: oo, custom: true,
    };
    const ink = int(o.ink, 0, 30, 0); if (ink) L.ink = Math.max(ink, 1);
    if (o.combos) {
      L.combos = true;
      if (Array.isArray(o.centers)) { const c = sigils.filter(id => o.centers.includes(id)); if (c.length) L.centers = c; }
      if (o.ringOf && typeof o.ringOf === 'object') {
        const r = {};
        for (const id of sigils) if (Array.isArray(o.ringOf[id])) r[id] = sigils.filter(s => o.ringOf[id].includes(s));
        if (Object.keys(r).length) L.ringOf = r;
      }
    }
    if (Array.isArray(o.flows)) {
      L.flows = o.flows.slice(0, 400).filter(f => f && typeof f === 'object').map(f => ({
        x0: int(f.x0, 0, W - 1, 0), x1: int(f.x1, 0, W - 1, 0), y0: int(f.y0, 0, H - 1, 0), y1: int(f.y1, 0, H - 1, 0),
        dx: int(f.dx, -1, 1, 0), dy: int(f.dy, -1, 1, 0), s: Math.max(0.5, Math.min(12, +f.s || 3)),
      })).filter(f => f.dx || f.dy);
      if (!L.flows.length) delete L.flows;
    }
    return L;
  }
  /* the level as it travels: the lesson format's own keys, nothing the game adds (id, roman, nudge) */
  function wire(L) {
    const w = { name: L.name, lesson: L.lesson || undefined, hint: L.hint || undefined, sigils: L.sigils, par: L.par, ink: L.ink || undefined };
    if (L.combos) { w.combos = true; if (L.centers) w.centers = L.centers; if (L.ringOf) w.ringOf = L.ringOf; }
    w.t = L.t; w.o = L.o; if (L.flows && L.flows.length) w.flows = L.flows;
    return JSON.parse(JSON.stringify(w));
  }
  async function encode(L) {
    const raw = new TextEncoder().encode(JSON.stringify(wire(L)));
    if (typeof CompressionStream === 'function') {
      try { return '1' + b64u.enc(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) { }
    }
    return '0' + b64u.enc(raw);
  }
  async function decode(code) {
    code = String(code || '').trim();
    const k = code[0], bytes = b64u.dec(code.slice(1));
    let raw;
    if (k === '1') {
      if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot open the link');
      raw = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (k === '0') raw = bytes;
    else throw new Error('the link is not a level');
    return sanitize(JSON.parse(new TextDecoder().decode(raw)));
  }
  /* what a test play proves: the map and the rules, not the words or the par (so setting the par to the maker's own
     count, or retitling, keeps sharing open) */
  function fingerprint(L) {
    const s = JSON.stringify([L.sigils, L.combos || false, L.centers || null, L.ringOf || null, L.ink || 0, L.t, L.o, L.flows || null]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36) + '.' + s.length.toString(36);
  }
  const codeFromHash = h => { const m = /[#&]level=([A-Za-z0-9_-]+)/.exec(h || ''); return m ? m[1] : null; };
  // a pasted link (any address with #level=) or a bare code
  const codeFrom = text => {
    const s = String(text || '').trim();
    return codeFromHash(s) || (/^[01][A-Za-z0-9_-]{8,}$/.test(s) ? s : null);
  };
  return { SIG, sanitize, wire, encode, decode, fingerprint, codeFromHash, codeFrom };
})();

const Shared = (() => {
  const KEY = 'quillsigil.shared.v1';
  const PLAYING = 'quillsigil.playing.shared'; // (sessionStorage) the shared level in play, for a reload, as main.js keeps a lesson's
  const BAD = 'That level link is damaged or incomplete.';
  let list = null; // [{ code, name, added, won, best }], oldest first; read on first use
  const levels = new Map(); // code -> the level, decoded once
  const S = { msg: '', busy: 0 };

  function all() {
    if (list) return list;
    list = [];
    try {
      const a = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(a)) for (const e of a) {
        if (!e || typeof e.code !== 'string' || !/^[01][A-Za-z0-9_-]+$/.test(e.code) || list.some(q => q.code === e.code)) continue;
        list.push({ code: e.code, name: String(e.name || 'A Custom Lesson').slice(0, 40), added: +e.added || 0, won: !!e.won, best: e.won ? Math.max(0, Math.round(+e.best || 0)) : 0 });
      }
    } catch (e) { }
    return list;
  }
  function save() {
    try { if (list && list.length) localStorage.setItem(KEY, JSON.stringify(list)); else localStorage.removeItem(KEY); } catch (e) { }
  }
  const indexOf = code => all().findIndex(e => e.code === code);
  async function level(code) {
    if (levels.has(code)) return levels.get(code);
    let L;
    try { L = await LevelCode.decode(code); } catch (e) {
      throw new Error(/browser/.test(e && e.message) ? 'This browser cannot open that level link.' : BAD);
    }
    levels.set(code, L);
    return L;
  }
  // the folio, open at the Shared Levels page that holds `item` ('s' + place in the list, or 'add'), with S.msg under
  // the Add a level line
  function showFolio(item) {
    if (Game.state === 'menu') Folio.reopen(item);
    else Game.lessons(item);
  }
  function fail(msg) { S.msg = msg; Sfx.play('fizzle'); showFolio('add'); }
  /* a link or a pasted code: the level goes into the list (once; a code already there just opens) and is played */
  async function open(text) {
    const code = LevelCode.codeFrom(text), n = ++S.busy;
    if (!code) { fail(String(text || '').trim() ? BAD : 'Paste a level link or code first.'); return false; }
    let L;
    try { L = await level(code); } catch (e) { if (n === S.busy) fail(e.message); return false; }
    if (n !== S.busy) return false;
    let k = indexOf(code);
    if (k < 0) { all().push({ code, name: L.name, added: Date.now(), won: false, best: 0 }); save(); k = list.length - 1; }
    S.msg = '';
    Game.startShared(L, code);
    return true;
  }
  /* a level of the list, tapped in the folio */
  async function play(k) {
    const e = all()[k]; if (!e) return;
    const n = ++S.busy;
    let L;
    try { L = await level(e.code); } catch (er) { if (n === S.busy) fail(er.message); return; }
    if (n !== S.busy) return;
    S.msg = '';
    Game.startShared(L, e.code);
  }
  function won(code, casts) {
    const e = all()[indexOf(code)]; if (!e) return;
    e.best = e.won ? Math.min(e.best, casts) : casts; e.won = true;
    save();
  }
  function remove(k) { if (all()[k]) { list.splice(k, 1); save(); } }
  /* the address's #level=: read once at start (after the game's own boot) and whenever it changes in an open tab. The
     link is taken off the address at once, so a reload or a bookmark opens the game as usual. The editor's test play
     page (play.html) sets QS_PLAY_PAGE and plays its level itself. */
  function playing(code) {
    try { if (code) sessionStorage.setItem(PLAYING, code); else sessionStorage.removeItem(PLAYING); } catch (e) { }
  }
  function fromHash() {
    const h = location.hash;
    if (!/[#&]level=/.test(h)) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    open(LevelCode.codeFromHash(h) || '').catch(e => console.warn('shared level', e));
  }
  function boot() {
    if (window.QS_PLAY_PAGE) return;
    window.addEventListener('hashchange', fromHash);
    if (/[#&]level=/.test(location.hash)) { fromHash(); return; }
    // a reload in the middle of a shared level (a phone putting the tab away, a refresh) opens it again
    let c = null;
    try { c = sessionStorage.getItem(PLAYING); } catch (e) { }
    if (!c) return;
    if (Game.state === 'title' && indexOf(c) >= 0) play(indexOf(c)); else playing(null);
  }
  return {
    KEY, state: S, all, indexOf, open, play, won, remove, boot, playing,
    item: code => { const k = indexOf(code); return k < 0 ? 'add' : 's' + k; },
  };
})();
