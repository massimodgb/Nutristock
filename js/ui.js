// Piezas de interfaz reutilizables
import { html, useEffect, useState } from './lib.js';
import { GROUPS, fmt, parseNum } from './nutri.js';

// Hoja que sube desde abajo (estilo iOS)
export function Sheet({ open, onClose, title, children, actions }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [open]);
  if (!open) return null;
  return html`
    <div class="sheet-bg" onClick=${onClose}>
      <div class="sheet" onClick=${e => e.stopPropagation()}>
        <div class="sheet-head">
          <button class="link" onClick=${onClose}>Cerrar</button>
          <strong>${title}</strong>
          <span class="sheet-actions">${actions || ''}</span>
        </div>
        <div class="sheet-body">
          ${children}
          <button class="btn secondary cerrar-abajo" onClick=${onClose}>Cerrar</button>
        </div>
      </div>
    </div>`;
}

// Campo numérico que acepta coma decimal y abre el teclado numérico del iPhone
export function Num({ value, onChange, suffix, placeholder, autofocus }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    if (parseNum(txt) !== value) setTxt(value == null ? '' : String(value).replace('.', ','));
  }, [value]);
  return html`
    <label class="num">
      <input inputmode="decimal" value=${txt} placeholder=${placeholder || '0'} autofocus=${autofocus}
        onInput=${e => { setTxt(e.target.value); onChange(parseNum(e.target.value)); }}
        onFocus=${e => e.target.select()} />
      ${suffix && html`<span>${suffix}</span>`}
    </label>`;
}

export function Toggle({ checked, onChange, label, hint }) {
  return html`
    <label class="toggle-row">
      <span><span>${label}</span>${hint && html`<small>${hint}</small>`}</span>
      <input type="checkbox" class="switch" checked=${checked} onChange=${e => onChange(e.target.checked)} />
    </label>`;
}

export function Seg({ options, value, onChange }) {
  return html`
    <div class="seg">
      ${options.map(o => html`
        <button class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
    </div>`;
}

export const Dot = ({ group }) =>
  html`<span class="dot" style=${{ background: GROUPS[group]?.color || '#888' }}></span>`;

export function MacroLine({ n, small }) {
  return html`
    <span class=${'macros' + (small ? ' small' : '')}>
      <b>${fmt(n.kcal)} kcal</b>
      <span class="p">P ${fmt(n.prot)}</span>
      <span class="c">C ${fmt(n.carb)}</span>
      <span class="g">G ${fmt(n.fat)}</span>
    </span>`;
}

export function Bar({ label, value, target, color, unit = 'g' }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target && value > target * 1.1;
  return html`
    <div class="bar">
      <div class="bar-top"><span>${label}</span>
        <span class=${over ? 'over' : ''}>${fmt(value)}${target ? html` / ${fmt(target)}` : ''} ${unit}</span></div>
      <div class="bar-track"><div class="bar-fill" style=${{ width: pct + '%', background: color }}></div></div>
    </div>`;
}

export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;

// Mensaje breve que aparece abajo
export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

// Iconos (trazos simples, heredan el color del texto)
const P = {
  hoy: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  despensa: 'M5 3h14v18H5zM5 10h14M9 6.5h2M9 13.5h2',
  biblio: 'M4 4h6v16H4zM10 4h4v16h-4zM15 5l4 -1 3 15 -4 1z',
  plan: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  mas: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1',
  scan: 'M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8',
  paste: 'M8 4h8v3H8zM6 5H5v16h14V5h-1M9 12h6M9 16h4',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  pesa: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
};
export const Icon = ({ name, size = 22 }) => html`
  <svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d=${P[name]} />
  </svg>`;
