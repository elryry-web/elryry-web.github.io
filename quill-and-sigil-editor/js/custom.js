'use strict';
/* =====================================================================
   QUILL & SIGIL — custom.js (v177; moved out of the game after v179; v183: the codec moved into the game)
   The level editor's side of custom levels. Since v183 the game plays shared levels itself: the editor's Share link is
   the game's own address, quill-and-sigil/#level=<code>, and the game keeps them in its folio (Shared Levels). The
   codec (the level format, its checks, the link's code) lives in the game's js/shared.js (LevelCode), which both pages
   that use this file load first; Custom is LevelCode plus what the editor and its test play need:
   - on the editor page (no Game there): the codec, and WON_KEY, where a test play records a win;
   - on play.html, which writes the game's own index.html into itself (its scripts loaded from ../quill-and-sigil/) and
     adds this file after main.js: test play (#level=<code>&edit=1). The level is played by the game's Game.startShared
     with no code, so it never joins the player's shared levels; the player's save is never written, and every way out
     (the title, the folio, the win card's button) goes back to the editor. play.html without edit=1 is an old shared
     link, and play.html sends it on to the game before this file is ever loaded.
   ===================================================================== */
const Custom = (() => {
  const WON_KEY = 'quillsigil.editor.won';
  const API = Object.assign({}, LevelCode, { WON_KEY });

  /* ---------------- the play page's side (play.html, with the game loaded into it) ---------------- */
  if (typeof Game === 'undefined' || typeof LEVELS === 'undefined' || typeof Save === 'undefined') return API;

  const C = { on: false, L: null, code: '', busy: 0 };
  const start0 = Game.start, show0 = Game.showScreen;
  // this page never writes the player's save, nor the game's "lesson in play" for a reload: those belong to the game
  Save.save = function () { };
  Game.playing = function () { };

  const toEditor = () => { C.on = false; location.href = new URL('index.html', location.href).href; };

  Game.start = function (i) {
    if (i === -1 && C.L && this.shared) {
      C.on = true;
      start0.call(this, -1);
      document.getElementById('lnum').textContent = 'Custom level · test play';
      if (!document.getElementById('bCustBack')) {
        const b = document.createElement('button');
        b.className = 'btn ghost'; b.id = 'bCustBack'; b.title = 'Back to the level editor (your work is kept)';
        b.innerHTML = '✎ <span>Editor</span>';
        b.addEventListener('click', toEditor);
        const tools = document.getElementById('tools'); tools.insertBefore(b, tools.firstChild);
      }
      return;
    }
    toEditor(); // (a lesson of the game is played in the game)
  };
  Game.title = toEditor;
  Game.lessons = toEditor;
  Game.next = toEditor;
  const win0 = Game.win;
  Game.win = function () {
    const r = win0.apply(this, arguments); // (a test play has no code, so the game's shared list is not touched)
    if (C.on) try { localStorage.setItem(WON_KEY, JSON.stringify({ fp: LevelCode.fingerprint(C.L), casts: this.casts, at: Date.now() })); } catch (e) { }
    return r;
  };
  // the win card of a test play: its own title, and the way back to the editor
  Game.showScreen = function (id) {
    const r = show0.apply(this, arguments);
    if (id === 'win' && C.on) {
      document.getElementById('winTitle').innerHTML = decoHTML('Test Play Complete');
      const wt = document.getElementById('winText'); wt.textContent += ' Sharing is open in the editor.';
      const nx = document.getElementById('bNext'); nx.style.display = '';
      nx.textContent = '✎ Back to the Editor';
      const fm = document.getElementById('bWinMenu'); if (fm) fm.style.display = 'none'; // (the folio is the game's)
    }
    return r;
  };

  // a link that cannot be played: said at the top, with the way back to the editor
  function note(msg) {
    let el = document.getElementById('custNote');
    if (!el) {
      el = document.createElement('div'); el.id = 'custNote';
      el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:99;max-width:min(92vw,520px);padding:10px 16px;border-radius:10px;background:rgba(20,12,36,.92);color:#f3e7cc;border:1px solid rgba(232,194,122,.5);font:15px "IM Fell English",serif;text-align:center';
      document.body.append(el);
    }
    el.textContent = msg + ' ';
    const a = document.createElement('a'); a.href = new URL('index.html', location.href).href;
    a.textContent = 'Back to the editor'; a.style.color = '#e8c27a';
    el.append(a); el.style.display = '';
  }
  async function boot() {
    const code = LevelCode.codeFromHash(location.hash);
    if (!code) { note('This page test-plays a level from the editor, and this link holds no level.'); return; }
    const n = ++C.busy;
    try {
      const L = await LevelCode.decode(code);
      if (n !== C.busy) return;
      C.L = L; C.code = code;
      const el = document.getElementById('custNote'); if (el) el.style.display = 'none';
      Game.startShared(L, null);
    } catch (e) {
      console.warn('custom level', e);
      note(`This test play link could not be opened (${e.message || 'damaged'}).`);
    }
  }
  window.addEventListener('hashchange', boot);
  boot();
  API.state = C;
  return API;
})();
