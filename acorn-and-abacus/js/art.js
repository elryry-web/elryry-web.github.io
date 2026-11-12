// Pictures of her favourite things, as small inline SVGs (or emoji where Segoe UI Emoji has one).
// Bugs are drawn the same size and colour within a kind, compact and round-ish, so they count like dots.

const BUGS = {
  ladybug: `<svg viewBox="0 0 100 100"><circle cx="50" cy="22" r="13" fill="#2e2016"/>
    <ellipse cx="50" cy="58" rx="36" ry="34" fill="#d8402f" stroke="#2e2016" stroke-width="5"/>
    <path d="M50 26 V92" stroke="#2e2016" stroke-width="5"/>
    <circle cx="34" cy="50" r="7" fill="#2e2016"/><circle cx="66" cy="50" r="7" fill="#2e2016"/>
    <circle cx="36" cy="74" r="6" fill="#2e2016"/><circle cx="64" cy="74" r="6" fill="#2e2016"/></svg>`,
  ant: `<svg viewBox="0 0 100 100"><g fill="#3a2a20"><circle cx="50" cy="20" r="12"/><ellipse cx="50" cy="44" rx="11" ry="13"/><ellipse cx="50" cy="74" rx="18" ry="22"/></g>
    <path d="M40 44 L18 34 M40 48 L16 56 M42 54 L22 74 M60 44 L82 34 M60 48 L84 56 M58 54 L78 74 M44 10 L36 0 M56 10 L64 0"
      stroke="#3a2a20" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`,
  butterfly: `<svg viewBox="0 0 100 100"><g fill="#f08a2c" stroke="#5a3d26" stroke-width="4" stroke-linejoin="round">
    <path d="M48 46 C30 8 4 14 8 40 C10 54 30 56 48 50 Z"/><path d="M52 46 C70 8 96 14 92 40 C90 54 70 56 52 50 Z"/>
    <path d="M48 54 C28 56 14 74 26 88 C36 96 46 80 48 62 Z"/><path d="M52 54 C72 56 86 74 74 88 C64 96 54 80 52 62 Z"/></g>
    <ellipse cx="50" cy="56" rx="5" ry="26" fill="#5a3d26"/>
    <path d="M48 32 L40 16 M52 32 L60 16" stroke="#5a3d26" stroke-width="3" stroke-linecap="round"/></svg>`,
  moth: `<svg viewBox="0 0 100 100"><g fill="#b9a68a" stroke="#5f5040" stroke-width="4" stroke-linejoin="round">
    <path d="M48 36 C30 26 6 40 8 62 C10 78 34 72 48 58 Z"/><path d="M52 36 C70 26 94 40 92 62 C90 78 66 72 52 58 Z"/></g>
    <circle cx="28" cy="54" r="5" fill="#5f5040"/><circle cx="72" cy="54" r="5" fill="#5f5040"/>
    <ellipse cx="50" cy="56" rx="7" ry="24" fill="#8a7860" stroke="#5f5040" stroke-width="3"/>
    <path d="M47 34 C42 20 34 18 28 20 M53 34 C58 20 66 18 72 20" stroke="#5f5040" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
};
export const BUG_KINDS = Object.keys(BUGS);

const MONSTER_TRUCK = `<svg viewBox="0 0 120 100"><path d="M14 52 V36 H50 L60 18 H88 L98 36 H110 V52 Z" fill="#2f7fc4" stroke="#1f3b55" stroke-width="5" stroke-linejoin="round"/>
  <path d="M64 24 H85 L91 36 H60 Z" fill="#cfe8f7" stroke="#1f3b55" stroke-width="3"/>
  <circle cx="34" cy="72" r="22" fill="#2e2a28"/><circle cx="34" cy="72" r="9" fill="#9a9a9a"/>
  <circle cx="90" cy="72" r="22" fill="#2e2a28"/><circle cx="90" cy="72" r="9" fill="#9a9a9a"/></svg>`;

const PICS = { ...BUGS, 'monster-truck': MONSTER_TRUCK };

// pic(name) returns an element: an SVG from this file, or emoji text otherwise.
export function pic(name, cls = 'pic') {
  const el = document.createElement('span');
  el.className = cls;
  if (PICS[name]) { el.innerHTML = PICS[name]; el.classList.add('svgpic'); }
  else { el.textContent = name; el.classList.add('emoji'); }
  return el;
}
