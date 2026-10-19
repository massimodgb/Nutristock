// Formas de cocinar medidas de un producto (airfryer ×0,50, plancha ×0,78…): verlas, cambiarlas o borrarlas.
// Cada medida es SOLO de ese producto (ver precision.js).
import { html } from '../lib.js';
import { useLive, getSetting, setSetting } from '../db.js';
import { fmt } from '../nutri.js';
import { Num, Icon, toast } from '../ui.js';
import { medidasDe, conFactor, nombreMetodo } from '../precision.js';

export function FactoresMedidos({ food }) {
  const coccion = useLive(() => getSetting('coccion', {}), []);
  if (coccion === undefined || !food?.id) return null;
  const { propias, base } = medidasDe(food, coccion);
  const cambiar = async (metodo, factor) => {
    // Se lee justo antes de guardar para no pisar otra medida guardada mientras tanto
    await setSetting('coccion', conFactor(await getSetting('coccion', {}), food.id, metodo, factor));
    if (!factor) toast(`${nombreMetodo(metodo)}: medida borrada`);
  };
  const lista = Object.entries(propias);
  return html`
    <div class="factores-medidos">
      ${lista.length === 0 && html`<small class="muted">Aún no has medido ninguna forma de cocinar este producto.</small>`}
      ${lista.map(([m, f]) => html`
        <div class="inline factor-medido" key=${m}>
          <span class="grow">${nombreMetodo(m)}</span>
          <div class="factor-num"><${Num} value=${f} onChange=${v => v > 0 && v <= 5 && cambiar(m, v)} suffix="×" /></div>
          <button class="icon-btn" aria-label=${'Borrar la medida de ' + nombreMetodo(m)} onClick=${() => cambiar(m, null)}><${Icon} name="trash" size=${15} /></button>
        </div>`)}
      ${Object.keys(base).length > 0 && html`
        <small class="muted">De su alimento base (solo se usan si las eliges al registrar): ${Object.entries(base).map(([m, f]) => `${nombreMetodo(m).toLowerCase()} ×${fmt(f, 2)}`).join(', ')}.</small>`}
      <small class="muted">Factor = peso cocinado ÷ peso crudo. Para medirlo de nuevo, usa "+ Otro método (medir)" al registrar.</small>
    </div>`;
}
