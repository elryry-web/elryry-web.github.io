// The guide: a friendly cat, drawn as inline SVG. Rename her by changing GUIDE_NAME in script.js.
// Only the head and mouth move, and only while a line is shown or spoken.
// A one-off hop is the occasional, unpredictable celebration.

const SVG = `
<svg viewBox="0 0 200 230" aria-hidden="true">
  <g class="guide-body">
    <path d="M150 208 C196 204 200 150 172 132 C160 124 152 136 162 144 C178 156 172 190 146 192 Z"
          fill="#e9a25a" stroke="#6b4423" stroke-width="4" stroke-linejoin="round"/>
    <path d="M58 214 C46 168 62 128 100 126 C138 128 154 168 142 214 Z" fill="#f0b16b" stroke="#6b4423" stroke-width="4" stroke-linejoin="round"/>
    <path d="M80 214 C76 180 86 150 100 150 C114 150 124 180 120 214 Z" fill="#fbe6c8"/>
    <ellipse cx="78" cy="214" rx="18" ry="9" fill="#f0b16b" stroke="#6b4423" stroke-width="3.5"/>
    <ellipse cx="122" cy="214" rx="18" ry="9" fill="#f0b16b" stroke="#6b4423" stroke-width="3.5"/>
    <path d="M66 160 C72 156 76 158 78 164 M134 160 C128 156 124 158 122 164" stroke="#c9813f" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <g class="guide-head">
    <path d="M50 74 L56 22 L90 52 Z" fill="#f0b16b" stroke="#6b4423" stroke-width="4" stroke-linejoin="round"/>
    <path d="M150 74 L144 22 L110 52 Z" fill="#f0b16b" stroke="#6b4423" stroke-width="4" stroke-linejoin="round"/>
    <path d="M60 60 L62 36 L80 52 Z M140 60 L138 36 L120 52 Z" fill="#f3c2b0"/>
    <ellipse cx="100" cy="88" rx="56" ry="48" fill="#f0b16b" stroke="#6b4423" stroke-width="4"/>
    <path d="M88 44 L92 58 M100 42 L100 58 M112 44 L108 58" stroke="#c9813f" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="100" cy="106" rx="30" ry="22" fill="#fbe6c8"/>
    <ellipse cx="78" cy="84" rx="7" ry="9" fill="#2e2016"/>
    <ellipse cx="122" cy="84" rx="7" ry="9" fill="#2e2016"/>
    <circle cx="80" cy="81" r="2.4" fill="#fff"/><circle cx="124" cy="81" r="2.4" fill="#fff"/>
    <path d="M93 98 L107 98 L100 106 Z" fill="#d9767a" stroke="#6b4423" stroke-width="2" stroke-linejoin="round"/>
    <path class="guide-smile" d="M88 112 Q94 118 100 110 Q106 118 112 112" fill="none" stroke="#6b4423" stroke-width="3" stroke-linecap="round"/>
    <ellipse class="guide-mouth" cx="100" cy="115" rx="7" ry="6" fill="#8e3b33"/>
    <path d="M60 102 L36 98 M60 110 L36 114 M140 102 L164 98 M140 110 L164 114" stroke="#6b4423" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="68" cy="104" rx="7" ry="4" fill="#e98f7f" opacity=".55"/>
    <ellipse cx="132" cy="104" rx="7" ry="4" fill="#e98f7f" opacity=".55"/>
  </g>
</svg>`;

const all = new Set();

export function createGuide(extraClass = '') {
  const wrap = document.createElement('div');
  wrap.className = `guide ${extraClass}`;
  wrap.innerHTML = SVG;
  all.add(wrap);
  return wrap;
}

export function setTalking(on) {
  for (const g of all) {
    if (!g.isConnected) { all.delete(g); continue; }
    g.classList.toggle('talking', on);
  }
}

export function hop() {
  for (const g of all) {
    if (!g.isConnected) continue;
    g.classList.remove('hop');
    void g.offsetWidth;
    g.classList.add('hop');
    setTimeout(() => g.classList.remove('hop'), 800);
  }
}

// A single leaf drifting down once, used as a rare surprise.
export function dropLeaf(container) {
  const leaf = document.createElement('div');
  leaf.className = 'leaf-drift';
  leaf.style.left = `${20 + Math.random() * 60}%`;
  leaf.innerHTML = `<svg viewBox="0 0 60 40" width="70" height="46"><path d="M4 22 C14 2 44 0 56 18 C44 36 16 40 4 22 Z" fill="#9cc26a" stroke="#55703f" stroke-width="3"/><path d="M6 22 L50 19" stroke="#55703f" stroke-width="2.5"/></svg>`;
  container.append(leaf);
  setTimeout(() => leaf.remove(), 4200);
}
