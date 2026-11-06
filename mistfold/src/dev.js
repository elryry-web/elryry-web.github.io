// Test helpers, loaded only with ?dev in the URL. Lets a script drive the game frame by frame.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const g = () => window.game;

// capture('home') builds a land at midday and saves its painting guides to art/home/
window.capture = async (id, longSide = 2048) => {
  if (id) window.view(id, 1);
  const { capture } = await import('./paint.js');
  return capture(g(), longSide);
};

window.adv = async (frames = 60) => { for (let i = 0; i < frames / 20; i++) { g().step(20); await sleep(5); } g().step(1); };
window.view = (id, day = 1, x, z) => {
  window.dbg.state.day = day;
  if (g().land) g().land.dispose();
  g().buildLand(id); g().mode = 'land';
  if (x !== undefined) { g().land.player.x = x; g().land.player.z = z; }
  g().step(90);
  return 'ok';
};
window.runDialog = async (choices = [], max = 80) => {
  const log = []; let ci = 0;
  for (let i = 0; i < max; i++) {
    g().step(3);
    const u = window.dbg.ui;
    if (u.choiceOpen) { log.push('CHOICE: ' + [...document.querySelectorAll('.choice')].map((b) => b.textContent).join(' | ')); u._choiceReady = true; u.choiceButtons[choices[ci++] || 0].click(); await sleep(30); continue; }
    if (!u.dialogOpen && !u.panelOpen) { await sleep(30); g().step(30); if (!u.dialogOpen && !u.panelOpen && !g().talking) break; continue; }
    if (u.panelOpen) { const c = document.getElementById('pclose') || document.querySelector('#poem'); log.push('PANEL: ' + (document.getElementById('panel').innerText || document.getElementById('poem').innerText).slice(0, 400)); if (document.getElementById('pclose')) document.getElementById('pclose').click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); await sleep(1200); continue; }
    if (u._skip) u._skip();
    await sleep(40);
    const line = document.getElementById('dname').textContent + ': ' + document.getElementById('dtext').textContent;
    if (log[log.length - 1] !== line) log.push(line);
    if (u._next) u.advance();
    await sleep(20);
  }
  return log;
};
window.talkTo = async (id, choices) => {
  const n = g().land.npcs.find((k) => k.id === id);
  const p = g().land.player; p.x = n.x + 1.5; p.z = n.z + 1.5;
  g().talk(n);
  await sleep(50);
  return (await runDialog(choices)).join('\n');
};
window.killAll = async () => {
  const L = g().land;
  for (const e of [...L.enemies]) { e.hp = 0; L.killEnemy(e); }
  await adv(30);
  for (const k of [...L.pickups]) { L.player.x = k.x; L.player.z = k.z; await adv(20); }
  await adv(60);
  return window.dbg.state.flags;
};
