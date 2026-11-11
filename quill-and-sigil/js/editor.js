'use strict';
/* =====================================================================
   QUILL & SIGIL — editor.js (v177)
   The level editor (editor.html, desktop only). It draws the level with the game's own renderer (world.js: loadWorld,
   render) and picks tiles with the game's own aim pick (pick), so what is built here is what plays. A level is the
   lesson format of main.js (t / o rows, flows, sigils, ring rules, par, ink); Custom (custom.js) checks it, writes it
   into a link, and tells the editor when the maker has beaten it in test play (which opens sharing).
   The work in progress lives in localStorage (quillsigil.editor); nothing here touches the game's save.
   ===================================================================== */
// world.js plays sounds only while the world steps, which never happens here; DPR as the game's own
const Sfx = { play() {}, init() {} };
let DPR = Math.min(2, window.devicePixelRatio || 1);

const Editor = (() => {
  const KEY = 'quillsigil.editor', MAXW = 32, MAXH = 32;
  const $ = id => document.getElementById(id);
  const cv = $('view'), g = cv.getContext('2d');

  /* ---------------- the level being made ---------------- */
  // doc: the level's own keys, plus fl (the river, one entry per tile "x,y": [dx, dy, s]) and parAuto (the par follows
  // the maker's own winning count until they type one)
  let doc = null;
  const blank = () => ({
    name: '', lesson: '', hint: '', sigils: ['gale', 'stone'], combos: false, centers: null, ringOf: {},
    par: 1, parAuto: true, ink: 0,
    t: ['        ', ' 000000 ', ' 000000 ', ' 000000 ', ' 000000 ', '        '],
    o: ['........', '........', '.O....G.', '........', '........', '........'],
    fl: {},
  });
  const W = () => doc.t[0].length, H = () => doc.t.length;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W() && y < H();
  const T = (x, y) => doc.t[y][x], O = (x, y) => doc.o[y][x];
  const put = (rows, x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  const setT = (x, y, ch) => put(doc.t, x, y, ch), setO = (x, y, ch) => put(doc.o, x, y, ch);
  const count = ch => doc.o.join('').split(ch).length - 1;

  // the river as the lesson format writes it: runs of tiles along x that flow alike
  function flowsOf(fl) {
    const out = [];
    for (let y = 0; y < H(); y++) {
      let run = null;
      for (let x = 0; x <= W(); x++) {
        const f = x < W() && fl[x + ',' + y], k = f && f.join();
        if (run && k === run.k) { run.x1 = x; continue; }
        if (run) out.push({ x0: run.x0, x1: run.x1, y0: y, y1: y, dx: run.f[0], dy: run.f[1], s: run.f[2] });
        run = f ? { k, f, x0: x, x1: x } : null;
      }
    }
    return out;
  }
  function flOf(flows, w, h) {
    const fl = {};
    for (const f of flows || []) for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++)
      if (x >= 0 && y >= 0 && x < w && y < h) fl[x + ',' + y] = [f.dx, f.dy, f.s];
    return fl;
  }
  // the level in the lesson format (unchecked); the river only on water, as the game reads it
  function build() {
    for (const k in doc.fl) { const [x, y] = k.split(',').map(Number); if (!inside(x, y) || !'~*'.includes(T(x, y))) delete doc.fl[k]; }
    const L = { name: doc.name, lesson: doc.lesson, hint: doc.hint, sigils: doc.sigils.slice(), par: doc.par, ink: doc.ink, t: doc.t.slice(), o: doc.o.slice() };
    if (doc.combos) {
      L.combos = true;
      const cen = doc.sigils.filter(s => !doc.centers || doc.centers.includes(s));
      if (cen.length < doc.sigils.length) L.centers = cen;
      const r = {};
      for (const c of cen) if (doc.ringOf[c]) { const k = doc.sigils.filter(s => doc.ringOf[c].includes(s)); if (k.length < doc.sigils.length) r[c] = k; }
      if (Object.keys(r).length) L.ringOf = r;
    }
    const fl = flowsOf(doc.fl); if (fl.length) L.flows = fl;
    return L;
  }
  function checked() { try { return Custom.sanitize(build()); } catch (e) { return null; } }
  function fromLevel(L) {
    const d = blank();
    Object.assign(d, {
      name: L.name === 'A Custom Lesson' ? '' : L.name || '', lesson: L.lesson || '', hint: L.hint || '', sigils: L.sigils.slice(),
      combos: !!L.combos, centers: L.centers ? L.centers.slice() : null, ringOf: JSON.parse(JSON.stringify(L.ringOf || {})),
      par: L.par || 1, parAuto: false, ink: L.ink || 0, t: L.t.slice(), o: L.o.slice(),
    });
    d.fl = flOf(L.flows, d.t[0].length, d.t.length);
    return d;
  }

  /* ---------------- keeping it: localStorage, undo ---------------- */
  function store() { try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) { } }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.t) && d.t.length && Array.isArray(d.o) && Array.isArray(d.sigils)) return Object.assign(blank(), d);
    } catch (e) { }
    return null;
  }
  const undo = [], redo = [];
  function mark() { undo.push(JSON.stringify(doc)); if (undo.length > 200) undo.shift(); redo.length = 0; syncUndo(); }
  function stepBack(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(doc)); doc = JSON.parse(from.pop());
    changed(true); fillSettings(); syncUndo();
  }
  const syncUndo = () => { $('bUndo').disabled = !undo.length; $('bRedo').disabled = !redo.length; };

  // every change: the world is built again from the level, and the work is kept
  let lvNow = null;
  function changed(refit) {
    lvNow = build();
    try { loadWorld(lvNow); } catch (e) { console.warn(e); }
    store();
    if (refit) fit();
    $('mapW').value = W(); $('mapH').value = H(); $('mapSize').textContent = `${W()} × ${H()}`;
    checks();
  }

  /* ---------------- the view ---------------- */
  let vw = 0, vh = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * DPR); cv.height = Math.round(vh * DPR);
    document.body.classList.toggle('narrow', vw < 900 || matchMedia('(pointer: coarse)').matches);
  }
  // the whole grid (air too) between the panels
  function fit() {
    const w = W(), h = H(); let mz = 1;
    for (const r of doc.t) for (const ch of r) if (/[0-9]/.test(ch)) mz = Math.max(mz, +ch);
    const x0 = -h * TW / 2, x1 = w * TW / 2, y0 = -mz * TZ - 20, y1 = (w + h) * TH / 2 + 2.5 * TZ;
    const L = 256, R = vw - 364, Tp = 66, B = vh - 44;
    const s = clamp(Math.min((R - L - 40) / (x1 - x0), (B - Tp - 40) / (y1 - y0)), 0.3, 1.6);
    cam.s = s; cam.ox = (L + R) / 2 - (x0 + x1) / 2 * s; cam.oy = (Tp + B) / 2 - (y0 + y1) / 2 * s;
  }
  function zoomAt(mx, my, f) {
    const s = clamp(cam.s * f, 0.25, 3); f = s / cam.s;
    cam.ox = mx - (mx - cam.ox) * f; cam.oy = my - (my - cam.oy) * f; cam.s = s;
  }

  // the tile under the pointer, as the game's aim finds it; over air, the air tile the game's mark would stand on
  function pickCell(sx, sy) {
    if (!World.W) return null;
    const p = pick(sx, sy);
    if (p.c) return { x: p.c.x, y: p.c.y };
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return inside(x, y) ? { x, y } : null;
  }

  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function diamond(x, y, z) {
    const a = proj(x, y, z), b = proj(x + 1, y, z), c = proj(x + 1, y + 1, z), d = proj(x, y + 1, z);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
  }
  const zOf = (x, y) => { const c = cellI(x, y); return !c || c.void ? airMarkZ(x + 0.5, y + 0.5) : surfaceTop(c); };
  function overlay() {
    g.save();
    g.lineWidth = 1;
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) {
      const c = cellI(x, y); if (!c) continue;
      diamond(x, y, zOf(x, y));
      if (c.void) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(232,194,122,0.32)'; g.stroke(); g.setLineDash([]); }
      else if (grid) { g.strokeStyle = 'rgba(255,240,210,0.16)'; g.stroke(); }
    }
    // the river's arrows
    g.strokeStyle = 'rgba(220,245,255,0.9)'; g.fillStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = 2;
    for (const k in doc.fl) {
      const [x, y] = k.split(',').map(Number), f = doc.fl[k], c = cellI(x, y); if (!c || c.water == null) continue;
      const z = surfaceTop(c) + 0.02, a = proj(x + 0.5 - f[0] * 0.3, y + 0.5 - f[1] * 0.3, z), b = proj(x + 0.5 + f[0] * 0.3, y + 0.5 + f[1] * 0.3, z);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = 7 * Math.min(1.4, cam.s + 0.3);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - hl * Math.cos(ang - 0.5), b[1] - hl * Math.sin(ang - 0.5)); g.lineTo(b[0] - hl * Math.cos(ang + 0.5), b[1] - hl * Math.sin(ang + 0.5)); g.fill();
    }
    if (hover && !panning) {
      diamond(hover.x, hover.y, zOf(hover.x, hover.y) + 0.01);
      g.fillStyle = 'rgba(255,215,130,0.22)'; g.fill();
      g.strokeStyle = '#ffd98a'; g.lineWidth = 2; g.stroke();
    }
    g.restore();
  }
  let last = performance.now(), grid = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try {
      updateParticles(dt);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      render(g, vw, vh, now / 1000, overlay);
    } catch (e) { console.warn(e); }
    requestAnimationFrame(frame);
  }

  /* ---------------- the tools ---------------- */
  // [id, label, key, swatch]
  const GROUND = [['raise', 'Raise', 'R', '#c9a46a'], ['lower', 'Lower', 'L', '#7d6440'], ['void', 'Air (gap)', 'V', '#0b0716'],
    ['water', 'Water', 'W', '#3f8fd6'], ['icepool', 'Ice pool', 'I', '#cfefff'], ['erase', 'Clear thing', 'E', '#555']];
  const THINGS = [['orb', 'Orb', 'O', '#ffe7a8'], ['font', 'Font', 'G', '#8fe3ff'], ['crate', 'Crate', 'C', '#a0703a'],
    ['brazier', 'Brazier', 'B', '#ff8a3a'], ['gate', 'Rune gate', 'D', '#b58cff'], ['hedge', 'Hedge', 'H', '#3c8a3c'],
    ['iceblock', 'Ice block', 'K', '#bfe8ff'], ['frost', 'Frost', 'S', '#e8f8ff']];
  const RIVER = [['river', 'River', 'N', '#6fc2ff']];
  const OBJ = { crate: 'C', brazier: 'B', gate: 'D', hedge: '#', iceblock: 'I', frost: 'f' };
  const TIPS = {
    raise: 'Raise: click a tile to lift it one step (air becomes ground). Right-click lowers.',
    lower: 'Lower: click a tile to sink it one step, down to a pit two deep. Right-click raises.',
    void: 'Air: click to open a gap. Right-click fills it with ground.',
    water: 'Water: a pool, level with the ground at 0. Right-click makes it ground.',
    icepool: 'Ice pool: frozen water. Right-click makes it ground.',
    erase: 'Clear: click to take a thing or a current off a tile. Right-click opens a gap.',
    orb: 'Orb: click to move the orb there. A level has one.',
    font: 'Font: click to add a font (the orb\'s goal). Right-click takes one away.',
    brazier: 'Brazier: stands on its tile\'s height (raise or lower the tile under it). Every brazier lit sinks the rune gate.',
    gate: 'Rune gate: sinks once every brazier burns.',
    river: 'River: drag across water to set its current. A click turns it. Right-click stills it.',
  };
  let tool = 'raise', height = 1;
  function toolBtn([id, label, key, col]) {
    return `<button class="tool" data-tool="${id}" title="${TIPS[id] || label}"><i style="background:${col}"></i><span>${label}</span><kbd>${key}</kbd></button>`;
  }
  function buildPalette() {
    $('heights').innerHTML = [...'0123456789'].map(d => `<button class="tool" data-tool="h${d}" title="Land of height ${d} (key ${d}). Right-click opens a gap.">${d}</button>`).join('');
    $('groundTools').innerHTML = GROUND.map(toolBtn).join('');
    $('thingTools').innerHTML = THINGS.map(toolBtn).join('');
    $('riverTools').innerHTML = RIVER.map(toolBtn).join('');
    $('palette').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  }
  function setTool(id) {
    tool = id;
    for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === id);
    $('flowOpt').style.opacity = id === 'river' ? 1 : 0.5;
    const label = id[0] === 'h' && id.length === 2 ? `Land ${id[1]}` : ([...GROUND, ...THINGS, ...RIVER].find(t => t[0] === id) || [, id])[1];
    say(TIPS[id] || `${label}: click or drag to paint. Right-click opens a gap.`);
  }

  const ground = (x, y) => { if (T(x, y) === ' ') setT(x, y, '0'); };
  // one tile, one tool; alt is the right button. Returns false when nothing changed
  function apply(x, y, alt, from) {
    const t0 = T(x, y), o0 = O(x, y), f0 = doc.fl[x + ',' + y];
    const isOrb = o0 === 'O', lastFont = o0 === 'G' && count('G') === 1;
    const keep = what => { say(`The level needs its ${what}: place it elsewhere first.`); };
    let id = tool;
    if (id[0] === 'h' && id.length === 2) {
      if (alt) id = 'void';
      else { setT(x, y, id[1]); }
    }
    if (id === 'raise' || id === 'lower') {
      const up = (id === 'raise') !== alt, d = t0;
      if (up) setT(x, y, d === ' ' ? '0' : d === '=' ? '_' : d === '_' || d === '~' || d === '*' ? '0' : d === '9' ? '9' : String(+d + 1));
      else setT(x, y, d === ' ' ? ' ' : d === '=' ? '=' : d === '_' || d === '~' || d === '*' ? (d === '_' ? '=' : '_') : d === '0' ? '_' : String(+d - 1));
    } else if (id === 'void') {
      if (alt) ground(x, y);
      else if (isOrb) keep('orb');
      else if (lastFont) keep('font');
      else { setT(x, y, ' '); setO(x, y, '.'); }
    } else if (id === 'water' || id === 'icepool') {
      setT(x, y, alt ? '0' : id === 'water' ? '~' : '*');
    } else if (id === 'erase') {
      if (alt) { if (isOrb) keep('orb'); else if (lastFont) keep('font'); else { setT(x, y, ' '); setO(x, y, '.'); } }
      else { delete doc.fl[x + ',' + y]; if (isOrb) keep('orb'); else if (lastFont) keep('font'); else setO(x, y, '.'); }
    } else if (id === 'orb') {
      if (alt) return false;
      if (lastFont) { keep('font'); return false; }
      for (let yy = 0; yy < H(); yy++) doc.o[yy] = doc.o[yy].replace('O', '.');
      ground(x, y); setO(x, y, 'O');
    } else if (id === 'font') {
      if (alt) { if (o0 === 'G') { if (lastFont) keep('font'); else setO(x, y, '.'); } }
      else if (isOrb) keep('orb');
      else { ground(x, y); setO(x, y, 'G'); }
    } else if (OBJ[id]) {
      const ch = OBJ[id];
      if (alt) { if (o0 === ch) setO(x, y, '.'); }
      else if (isOrb) keep('orb');
      else if (lastFont) keep('font');
      else { ground(x, y); setO(x, y, ch); }
    } else if (id === 'river') {
      const k = x + ',' + y;
      if (alt) delete doc.fl[k];
      else {
        if (!'~*'.includes(t0)) setT(x, y, '~');
        const s = +$('flowS').value;
        let d = from && (Math.abs(x - from.x) + Math.abs(y - from.y) === 1) ? [x - from.x, y - from.y] : null;
        if (from && d) doc.fl[from.x + ',' + from.y] = [d[0], d[1], s]; // a drag points the tile it left, too
        if (!d) { const i = f0 ? DIRS.findIndex(q => q[0] === f0[0] && q[1] === f0[1]) : -1; d = from ? (f0 || DIRS[0]) : DIRS[(i + 1) % 4]; }
        doc.fl[k] = [d[0], d[1], s];
      }
    }
    return T(x, y) !== t0 || O(x, y) !== o0 || JSON.stringify(doc.fl[x + ',' + y]) !== JSON.stringify(f0) || id === 'river';
  }

  /* ---------------- the mouse and the keys ---------------- */
  let hover = null, stroke = null, panning = null, space = false;
  const pos = e => [e.clientX, e.clientY];
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    const [sx, sy] = pos(e);
    if (e.button === 1 || (e.button === 0 && space)) { e.preventDefault(); panning = { sx, sy, ox: cam.ox, oy: cam.oy }; cv.classList.add('pan'); return; }
    if (e.button !== 0 && e.button !== 2) return;
    const c = pickCell(sx, sy); if (!c) return;
    const before = JSON.stringify(doc);
    stroke = { alt: e.button === 2, seen: new Set(), last: null, before };
    paint(c);
  });
  function paint(c) {
    const k = c.x + ',' + c.y;
    if (stroke.seen.has(k) && tool !== 'river') return;
    if (tool === 'river' && stroke.last && stroke.last.x === c.x && stroke.last.y === c.y) return;
    stroke.seen.add(k);
    if (apply(c.x, c.y, stroke.alt, stroke.last)) changed(false);
    stroke.last = c;
  }
  addEventListener('mousemove', e => {
    const [sx, sy] = pos(e);
    if (panning) { cam.ox = panning.ox + sx - panning.sx; cam.oy = panning.oy + sy - panning.sy; return; }
    if (e.target !== cv && !stroke) { hover = null; showHover(); return; }
    hover = pickCell(sx, sy); showHover();
    if (stroke && hover) paint(hover);
  });
  addEventListener('mouseup', () => {
    if (panning) { panning = null; cv.classList.remove('pan'); }
    if (stroke) {
      if (JSON.stringify(doc) !== stroke.before) { undo.push(stroke.before); if (undo.length > 200) undo.shift(); redo.length = 0; syncUndo(); }
      stroke = null;
    }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function showHover() {
    const c = hover && cellI(hover.x, hover.y);
    if (!c) { $('hover').textContent = ''; return; }
    const tc = T(c.x, c.y), oc = O(c.x, c.y);
    const ground = tc === ' ' ? 'air' : tc === '~' ? 'water' : tc === '*' ? 'ice pool' : `height ${tc === '_' ? -1 : tc === '=' ? -2 : tc}`;
    const thing = { O: 'orb', G: 'font', C: 'crate', B: 'brazier', D: 'rune gate', '#': 'hedge', I: 'ice block', f: 'frost' }[oc];
    const f = doc.fl[c.x + ',' + c.y];
    $('hover').textContent = `x ${c.x}, y ${c.y} · ${ground}${thing ? ' · ' + thing : ''}${f && '~*'.includes(tc) ? ` · current ${'→↓←↑'[DIRS.findIndex(q => q[0] === f[0] && q[1] === f[1])]} ${f[2]}` : ''}`;
  }
  const KEYS = { r: 'raise', l: 'lower', v: 'void', w: 'water', i: 'icepool', e: 'erase', o: 'orb', g: 'font', c: 'crate', b: 'brazier', d: 'gate', h: 'hedge', k: 'iceblock', s: 'frost', n: 'river' };
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if ($('modal').classList.contains('show')) { if (e.key === 'Escape') closeModal(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); stepBack(undo, redo); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); stepBack(redo, undo); }
      return;
    }
    if (e.altKey) return;
    if (e.key === ' ') { space = true; e.preventDefault(); return; }
    if (/^[0-9]$/.test(e.key)) setTool('h' + e.key);
    else if (KEYS[k]) setTool(KEYS[k]);
    else if (k === 'p') testPlay();
    else if (k === 'f') fit();
    else if (k === 'x') grid = !grid;
  });
  addEventListener('keyup', e => { if (e.key === ' ') space = false; });

  /* ---------------- the map's size ---------------- */
  function resizeMap(w, h) {
    w = clamp(Math.round(w) || 1, 1, MAXW); h = clamp(Math.round(h) || 1, 1, MAXH);
    if (w === W() && h === H()) return;
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) if ((x >= w || y >= h) && (O(x, y) === 'O')) { say('That would cut off the orb. Move it first.'); $('mapW').value = W(); $('mapH').value = H(); return; }
    mark();
    const t = [], o = [];
    for (let y = 0; y < h; y++) {
      t.push(y < H() ? doc.t[y].slice(0, w).padEnd(w, ' ') : ' '.repeat(w));
      o.push(y < H() ? doc.o[y].slice(0, w).padEnd(w, '.') : '.'.repeat(w));
    }
    doc.t = t; doc.o = o;
    if (!/G/.test(o.join(''))) { say('The font was cut off: place a new one.'); }
    changed(true);
  }
  function growEdge(e) {
    if ((e[0] === 'x' ? W() : H()) >= (e[0] === 'x' ? MAXW : MAXH)) { say('The map is at its largest (32 × 32).'); return; }
    mark();
    if (e === 'x1') { resizeMapRaw(W() + 1, H()); }
    else if (e === 'y1') { resizeMapRaw(W(), H() + 1); }
    else {
      const fl = {};
      for (const k in doc.fl) { const [x, y] = k.split(',').map(Number); fl[e === 'x0' ? (x + 1) + ',' + y : x + ',' + (y + 1)] = doc.fl[k]; }
      doc.fl = fl;
      if (e === 'x0') { doc.t = doc.t.map(r => ' ' + r); doc.o = doc.o.map(r => '.' + r); }
      else { doc.t.unshift(' '.repeat(W())); doc.o.unshift('.'.repeat(W())); }
    }
    changed(true);
  }
  function resizeMapRaw(w, h) {
    doc.t = Array.from({ length: h }, (_, y) => (doc.t[y] || '').slice(0, w).padEnd(w, ' '));
    doc.o = Array.from({ length: h }, (_, y) => (doc.o[y] || '').slice(0, w).padEnd(w, '.'));
  }
  function trim() {
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) if (T(x, y) !== ' ' || O(x, y) !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return;
    if (x0 === 0 && y0 === 0 && x1 === W() - 1 && y1 === H() - 1) { say('The map already ends at its land.'); return; }
    mark();
    doc.t = doc.t.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)); doc.o = doc.o.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1));
    const fl = {};
    for (const k in doc.fl) { const [x, y] = k.split(',').map(Number); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) fl[(x - x0) + ',' + (y - y0)] = doc.fl[k]; }
    doc.fl = fl;
    changed(true);
  }

  /* ---------------- the settings ---------------- */
  // the ring legend as the game's lesson card draws it (main.js ringLegendHTML / glyphIcon)
  const icons = {};
  function glyphIcon(id) {
    if (icons[id]) return icons[id];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const q = c.getContext('2d');
    q.strokeStyle = '#2a1830'; q.lineWidth = 2.5; q.beginPath(); q.arc(32, 32, 28, 0, TAU); q.stroke();
    drawGlyph(q, id, 32, 32, 22, '#2a1830', 3);
    return (icons[id] = c.toDataURL());
  }
  const ic = (id, cls, extra = '') => `<img class="${cls}" src="${glyphIcon(id)}" alt="${SIGILS[id].name}" title="${SIGILS[id].name}" style="background:${SIGILS[id].color}"${extra}>`;
  function ringLegendHTML(L) {
    const R = ringRules(L); if (!R) return '';
    const groups = R.rows.map(r => `<span class="rg">${ic(r.id, 'rc')}<span class="rp">${r.takes.length ? r.takes.map(id => ic(id, 'rs')).join('') : '<i>none</i>'}</span></span>`);
    if (R.ringOnly.length) groups.push(`<span class="rg">${R.ringOnly.map(id => ic(id, 'rc')).join('')}<i>ring only</i></span>`);
    return `<span class="rl">On each ring</span>${groups.join('')}`;
  }
  function fillSettings() {
    $('fName').value = doc.name; $('fLesson').value = doc.lesson; $('fHint').value = doc.hint;
    $('fPar').value = doc.par; $('fInk').value = doc.ink || 0; $('fCombos').checked = doc.combos;
    sigilsUI(); counts();
  }
  function counts() { $('cName').textContent = `${doc.name.length}/40`; $('cLesson').textContent = `${doc.lesson.length}/700`; $('cHint').textContent = `${doc.hint.length}/400`; }
  function sigilsUI() {
    $('sigs').innerHTML = Custom.SIG.map(id => `<span class="sig${doc.sigils.includes(id) ? '' : ' off'}" data-sig="${id}" title="${SIGILS[id].desc}">${ic(id, '')}${SIGILS[id].name}</span>`).join('');
    $('ringBox').style.display = doc.combos ? '' : 'none';
    const on = doc.sigils;
    $('ringTable').innerHTML = doc.combos ? on.map(c => {
      const cen = !doc.centers || doc.centers.includes(c), of = doc.ringOf[c];
      return `<tr><td class="c"><label class="chk" style="margin:0" title="May ${SIGILS[c].name} be a centre?"><input type="checkbox" data-cen="${c}"${cen ? ' checked' : ''}>${ic(c, '')}${SIGILS[c].name}</label></td><td>${cen
        ? on.map(s => ic(s, !of || of.includes(s) ? '' : 'off', ` data-ring="${c}" data-sat="${s}"`)).join('')
        : '<i style="color:var(--dim)">ring only</i>'}</td></tr>`;
    }).join('') : '';
    $('legend').innerHTML = doc.combos ? ringLegendHTML(build()) : '';
    $('legendBox').classList.toggle('none', !$('legend').innerHTML);
  }
  function bindSettings() {
    const text = (id, key, max) => {
      const el = $(id);
      el.addEventListener('focus', () => { el._mark = false; });
      el.addEventListener('input', () => { if (!el._mark) { mark(); el._mark = true; } doc[key] = el.value.slice(0, max); counts(); store(); checks(); });
    };
    text('fName', 'name', 40); text('fLesson', 'lesson', 700); text('fHint', 'hint', 400);
    $('sigs').addEventListener('click', e => {
      const b = e.target.closest('[data-sig]'); if (!b) return;
      const id = b.dataset.sig; mark();
      doc.sigils = doc.sigils.includes(id) ? doc.sigils.filter(s => s !== id) : Custom.SIG.filter(s => s === id || doc.sigils.includes(s));
      sigilsUI(); changed(false);
    });
    $('fCombos').addEventListener('change', e => { mark(); doc.combos = e.target.checked; sigilsUI(); changed(false); });
    $('ringTable').addEventListener('change', e => {
      const c = e.target.dataset.cen; if (!c) return;
      mark();
      const cen = doc.centers ? doc.centers.slice() : Custom.SIG.slice();
      doc.centers = e.target.checked ? Custom.SIG.filter(s => s === c || cen.includes(s)) : cen.filter(s => s !== c);
      sigilsUI(); changed(false);
    });
    $('ringTable').addEventListener('click', e => {
      const b = e.target.closest('[data-ring]'); if (!b) return;
      mark();
      const c = b.dataset.ring, s = b.dataset.sat, of = doc.ringOf[c] ? doc.ringOf[c].slice() : Custom.SIG.slice();
      doc.ringOf[c] = of.includes(s) ? of.filter(q => q !== s) : Custom.SIG.filter(q => q === s || of.includes(q));
      if (Custom.SIG.every(q => doc.ringOf[c].includes(q))) delete doc.ringOf[c];
      sigilsUI(); changed(false);
    });
    $('fPar').addEventListener('change', e => { mark(); doc.par = clamp(Math.round(+e.target.value) || 1, 1, 30); doc.parAuto = false; e.target.value = doc.par; changed(false); });
    $('fInk').addEventListener('change', e => { mark(); doc.ink = clamp(Math.round(+e.target.value) || 0, 0, 30); e.target.value = doc.ink; changed(false); });
    $('flowS').addEventListener('input', e => { $('flowSpd').textContent = e.target.value; });
    $('mapW').addEventListener('change', () => resizeMap(+$('mapW').value, H()));
    $('mapH').addEventListener('change', () => resizeMap(W(), +$('mapH').value));
    for (const b of document.querySelectorAll('[data-grow]')) b.addEventListener('click', () => growEdge(b.dataset.grow));
    $('bTrim').addEventListener('click', trim);
    $('bFit').addEventListener('click', fit);
    $('bUndo').addEventListener('click', () => stepBack(undo, redo));
    $('bRedo').addEventListener('click', () => stepBack(redo, undo));
    $('bNew').addEventListener('click', () => {
      if (!confirm('Start a new level? (Undo brings this one back.)')) return;
      mark(); doc = blank(); fillSettings(); changed(true);
    });
    $('bPlay').addEventListener('click', testPlay);
    $('bShare').addEventListener('click', share);
    $('bExport').addEventListener('click', exportJSON);
    $('bImport').addEventListener('click', importUI);
  }

  /* ---------------- checks, test play, sharing ---------------- */
  function wonRecord() { try { return JSON.parse(localStorage.getItem(Custom.WON_KEY) || 'null'); } catch (e) { return null; } }
  function beaten(L) { const w = wonRecord(); return !!(L && w && w.fp === Custom.fingerprint(L)) && w; }
  function checks() {
    const all = doc.o.join(''), L = checked(), w = beaten(L);
    let err = ''; try { Custom.sanitize(build()); } catch (e) { err = e.message; }
    const row = (ok, txt) => `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${txt}</div>`;
    $('checks').innerHTML = [
      row(count('O') === 1, 'One orb'),
      row(/G/.test(all), 'A font for it to reach'),
      row(doc.sigils.length > 0, 'At least one sigil'),
      err && !/orb|font|sigil/.test(err) ? row(false, err[0].toUpperCase() + err.slice(1)) : '',
      row(!!w, w ? `Beaten in test play, in ${w.casts} seal${w.casts === 1 ? '' : 's'}: ready to share` : 'Beat it in test play to share it'),
    ].join('');
    $('bShare').disabled = !w;
    $('bShare').title = w ? 'Make a link that plays this level' : 'Beat the level in test play to share it';
    $('bPlay').disabled = !L;
  }
  async function testPlay() {
    let L; try { L = Custom.sanitize(build()); } catch (e) { say(`Not ready to play: ${e.message}.`); return; }
    store();
    location.href = 'index.html#level=' + await Custom.encode(L) + '&edit=1';
  }
  // back from a winning test play: the maker's count becomes the par, unless they set one themselves
  function takeWin() {
    const L = checked(), w = beaten(L);
    if (w && doc.parAuto && doc.par !== w.casts) { doc.par = clamp(w.casts, 1, 30); $('fPar').value = doc.par; store(); say(`Won in ${w.casts} seal${w.casts === 1 ? '' : 's'}: that is the par now. Sharing is open.`); }
    else if (w) say('Won in test play. Sharing is open.');
    checks();
  }
  async function share() {
    const L = checked(); if (!beaten(L)) return;
    const url = new URL('index.html#level=' + await Custom.encode(L), location.href).href;
    modal(`<h2>Share this level</h2><p>Anyone with this link plays it, on a phone too. The level is inside the link itself (${url.length} letters).</p>
      <input class="link" id="mLink" readonly value="${url.replace(/"/g, '&quot;')}">
      <div class="row"><span class="err" id="mErr"></span><a class="btn" href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">Open it</a><button class="btn primary" id="mCopy">Copy link</button><button class="btn" id="mClose">Close</button></div>`);
    $('mLink').select();
    $('mCopy').onclick = () => copy(url);
  }
  function copy(text) {
    const done = () => { $('mErr').style.color = '#9fe0b0'; $('mErr').textContent = 'Copied.'; };
    const fail = () => { $('mErr').textContent = 'Could not copy: select it and press Ctrl+C.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail();
  }
  function exportJSON() {
    const json = JSON.stringify(Custom.wire(build()), null, 1).replace(/\n {2,}/g, ' ').replace(/\n \]/g, ' ]');
    modal(`<h2>Export</h2><p>The level as the lesson format writes it. Keep it, or open it again with Import.</p><textarea id="mText" readonly spellcheck="false"></textarea>
      <div class="row"><span class="err" id="mErr"></span><button class="btn" id="mSave">Save file</button><button class="btn primary" id="mCopy">Copy</button><button class="btn" id="mClose">Close</button></div>`);
    $('mText').value = json;
    $('mCopy').onclick = () => copy(json);
    $('mSave').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = (doc.name || 'custom-level').replace(/[^\w -]+/g, '').trim().replace(/ +/g, '-').toLowerCase() + '.json';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }
  function importUI() {
    modal(`<h2>Import</h2><p>Paste a level's JSON or a shared link, or open a saved file.</p><textarea id="mText" spellcheck="false" placeholder='{"name": …}  or  https://…/index.html#level=…'></textarea>
      <div class="row"><span class="err" id="mErr"></span><label class="btn">Open file<input type="file" id="mFile" accept=".json,application/json,text/plain" hidden></label><button class="btn primary" id="mOpen">Import</button><button class="btn" id="mClose">Close</button></div>`);
    $('mFile').onchange = async e => { const f = e.target.files[0]; if (f) $('mText').value = (await f.text()).slice(0, 200000); };
    $('mOpen').onclick = async () => {
      const s = $('mText').value.trim();
      try {
        const code = Custom.codeFromHash(s) || (/^[01][A-Za-z0-9_-]+$/.test(s) ? s : null);
        const L = code ? await Custom.decode(code) : Custom.sanitize(JSON.parse(s));
        mark(); doc = fromLevel(L); fillSettings(); changed(true); closeModal(); say(`Opened “${L.name}”.`);
      } catch (e) { $('mErr').textContent = `That is not a level (${e.message}).`; }
    };
  }
  function modal(html) {
    $('mbox').innerHTML = html; $('modal').classList.add('show');
    $('mClose').onclick = closeModal;
  }
  function closeModal() { $('modal').classList.remove('show'); }
  $('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) closeModal(); });

  let sayT = 0;
  function say(m) { $('msg').textContent = m; clearTimeout(sayT); sayT = setTimeout(() => { $('msg').textContent = ''; }, 6000); }

  /* ---------------- start ---------------- */
  function boot() {
    resize();
    addEventListener('resize', () => { resize(); fit(); });
    buildPalette(); bindSettings();
    doc = restore() || blank();
    fillSettings(); changed(true); setTool('raise'); syncUndo();
    takeWin();
    // back from test play by the browser's back button, the page may come from its cache: read the win again
    addEventListener('pageshow', e => { if (e.persisted) takeWin(); });
    requestAnimationFrame(frame);
  }
  boot();
  return { get doc() { return doc; }, build, checked, apply, pickCell, fit };
})();
