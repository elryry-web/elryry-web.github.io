// Small DOM helpers shared by every screen.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const num = (n, punct = '') => `num-${n}${punct}`;

// Hold-to-activate for grown-up controls: fills over `ms`, fires once.
export function holdButton(el, ms, onDone) {
  let timer = null;
  const cancel = () => { clearTimeout(timer); el.classList.remove('holding'); };
  el.style.setProperty('--hold-ms', `${ms}ms`);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.classList.add('holding');
    timer = setTimeout(() => { el.classList.remove('holding'); onDone(); }, ms);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, cancel));
}
