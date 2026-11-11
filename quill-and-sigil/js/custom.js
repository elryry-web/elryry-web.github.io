'use strict';
/* =====================================================================
   QUILL & SIGIL — custom.js (v177)
   Custom levels: made in the level editor (editor.html) and shared as a link that holds the whole level
   (index.html#level=<code>). The code is the level's JSON, deflated and written in base64url ("1…"), or plain ("0…")
   where the browser has no CompressionStream.
   In the game a custom level plays outside the folio, as LEVELS[-1] (an array property, so LEVELS.length, the folio and
   every lesson index are untouched), and it never touches the player's save: Save.save is held off while it is in play,
   and Save.data is put back exactly as it was when the custom level is left.
   The editor loads this file too, for the codec only (no Game there).
   ===================================================================== */
const Custom = (() => {
  const SIG = ['gale', 'stone', 'flame', 'tide', 'frost', 'luna'];
  const T_OK = /^[ 0-9_=~*]*$/, O_OK = /^[.#IBDGfOC]*$/;
  const MAXW = 32, MAXH = 32;
  const WON_KEY = 'quillsigil.editor.won';

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
  const API = { sanitize, wire, encode, decode, fingerprint, codeFromHash, WON_KEY, SIG };

  /* ---------------- the game's side (index.html only) ---------------- */
  if (typeof Game === 'undefined' || typeof LEVELS === 'undefined' || typeof Save === 'undefined') return API;

  const C = { on: false, L: null, edit: false, code: '', keep: null, busy: 0 };
  const save0 = Save.save, start0 = Game.start, win0 = Game.win, lessons0 = Game.lessons, title0 = Game.title,
    next0 = Game.next, playing0 = Game.playing, show0 = Game.showScreen;
  Save.save = function () { if (C.on) return; return save0.apply(this, arguments); };
  Game.playing = function (i) { if (i === -1 || C.on) return; return playing0.apply(this, arguments); };
  // a custom level counts as coming after every lesson: the outer circle is taught (ringTaught, ink.js) and a sigil it
  // leaves out reads "unused this lesson", not "not yet learned"
  const indexOf0 = LEVELS.indexOf;
  LEVELS.indexOf = function (x) { return x && x === this[-1] ? this.length : indexOf0.apply(this, arguments); };

  function enter() {
    if (!C.on) { C.keep = JSON.stringify(Save.data); C.on = true; }
    LEVELS[-1] = C.L;
  }
  function leave() {
    if (!C.on) return;
    C.on = false;
    try { Save.data = JSON.parse(C.keep); } catch (e) { }
    delete LEVELS[-1];
    const b = document.getElementById('bCustBack'); if (b) b.remove();
    const w = document.getElementById('bCustWin'); if (w) w.remove();
    if (codeFromHash(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
  }
  const toEditor = () => { leave(); location.href = 'editor.html'; };

  Game.start = function (i) {
    if (i === -1 && C.L) {
      enter();
      start0.call(this, -1);
      document.getElementById('lnum').textContent = C.edit ? 'Custom level · test play' : 'Custom level';
      if (C.edit && !document.getElementById('bCustBack')) {
        const b = document.createElement('button');
        b.className = 'btn ghost'; b.id = 'bCustBack'; b.title = 'Back to the level editor (your work is kept)';
        b.innerHTML = '✎ <span>Editor</span>';
        b.addEventListener('click', toEditor);
        const tools = document.getElementById('tools'); tools.insertBefore(b, tools.firstChild);
      }
      return;
    }
    leave();
    return start0.apply(this, arguments);
  };
  Game.title = function () { leave(); return title0.apply(this, arguments); };
  Game.lessons = function () {
    // from a custom level the folio opens on the lesson the player was last on, as it would from the title page
    if (C.on) { leave(); this.level = null; this.state = 'title'; }
    return lessons0.apply(this, arguments);
  };
  Game.next = function () { if (C.on) { if (C.edit) toEditor(); else this.lessons(); return; } return next0.apply(this, arguments); };
  Game.win = function () {
    if (!C.on) return win0.apply(this, arguments);
    const r = win0.apply(this, arguments); // (its Save.won and Save.data.at land in the copy put back on leaving)
    if (C.edit) try { localStorage.setItem(WON_KEY, JSON.stringify({ fp: fingerprint(C.L), casts: this.casts, at: Date.now() })); } catch (e) { }
    return r;
  };
  // the win card of a custom level: its own title, no next lesson, and the way back to the editor after a test play
  Game.showScreen = function (id) {
    const r = show0.apply(this, arguments);
    if (id === 'win' && C.on) {
      document.getElementById('winTitle').innerHTML = decoHTML(C.edit ? 'Test Play Complete' : 'Custom Level Complete');
      const tally = `${this.casts} seal${this.casts === 1 ? '' : 's'} cast. The maker's mark is ${C.L.par}.`;
      document.getElementById('winText').textContent = C.edit ? `${tally} Sharing is open in the editor.` : tally;
      const nx = document.getElementById('bNext'); nx.style.display = '';
      nx.textContent = C.edit ? '✎ Back to the Editor' : 'To the Lessons →';
    } else if (id === 'win') document.getElementById('bNext').textContent = 'Next Lesson →';
    return r;
  };

  function note(msg) {
    let el = document.getElementById('custNote');
    if (!el) {
      el = document.createElement('div'); el.id = 'custNote';
      el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:99;max-width:min(92vw,520px);padding:10px 16px;border-radius:10px;background:rgba(20,12,36,.92);color:#f3e7cc;border:1px solid rgba(232,194,122,.5);font:15px "IM Fell English",serif;text-align:center';
      document.body.append(el);
    }
    el.textContent = msg; el.style.display = '';
    clearTimeout(note.t); note.t = setTimeout(() => { el.style.display = 'none'; }, 6000);
  }
  async function boot() {
    const code = codeFromHash(location.hash); if (!code) return;
    const n = ++C.busy;
    try {
      const L = await decode(code);
      if (n !== C.busy) return;
      C.L = L; C.code = code; C.edit = /[#&]edit=1/.test(location.hash);
      Game.start(-1);
    } catch (e) {
      console.warn('custom level', e);
      note(`This custom level link could not be opened (${e.message || 'damaged'}).`);
    }
  }
  window.addEventListener('hashchange', boot);
  boot();
  API.state = C;
  return API;
})();
