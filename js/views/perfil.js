// Perfil y objetivo: datos para estimar tu gasto y a dónde te lleva el plan.
import { html } from '../lib.js';
import { db, useLive, getSetting, setSetting } from '../db.js';
import { fmt } from '../nutri.js';
import { Num, Seg } from '../ui.js';
import { ACTIVIDAD, OBJETIVOS, gastoFormula } from '../balance.js';

const VACIO = { sexo: 'h', edad: null, altura: null, actividad: 1.725, objetivo: 0 };

export function Perfil({ go }) {
  const guardado = useLive(() => getSetting('perfil', null), []);
  const ultimo = useLive(() => db.weights.orderBy('date').last(), []);
  if (guardado === undefined || ultimo === undefined) return html`<div class="loading">Cargando…</div>`;
  const p = { ...VACIO, ...(guardado || {}) };
  const set = (k, v) => setSetting('perfil', { ...p, [k]: v });
  const gasto = gastoFormula(p, ultimo?.kg);

  return html`
    <div class="page">
      <button class="link back" onClick=${() => go('mas')}>‹ Más</button>
      <header class="top"><h1>Perfil y objetivo</h1></header>

      <section class="card form">
        <label>Sexo
          <${Seg} value=${p.sexo} onChange=${v => set('sexo', v)} options=${[{ value: 'h', label: 'Hombre' }, { value: 'm', label: 'Mujer' }]} />
        </label>
        <div class="grid2">
          <label>Edad<${Num} value=${p.edad} onChange=${v => set('edad', v)} suffix="años" /></label>
          <label>Altura<${Num} value=${p.altura} onChange=${v => set('altura', v)} suffix="cm" /></label>
        </div>
        <p class="muted small">Peso: ${ultimo?.kg ? html`<b>${fmt(ultimo.kg, 1)} kg</b> (el último que apuntaste en Más)` : 'apúntalo en Más → Peso corporal.'}</p>
      </section>

      <section class="card form">
        <h3>Nivel de actividad</h3>
        <div class="list">
          ${ACTIVIDAD.map(a => html`
            <button class="row" onClick=${() => set('actividad', a.value)}>
              <span class=${'check' + (p.actividad === a.value ? ' on' : '')}></span>
              <span class="grow">${a.label}<br /><small class="muted">${a.hint}</small></span>
            </button>`)}
        </div>
        <p class="muted small">Si estás lesionado y entrenas menos, baja un nivel: gastas menos esos días.</p>
      </section>

      <section class="card form">
        <h3>Tu objetivo</h3>
        <div class="list">
          ${OBJETIVOS.map(o => html`
            <button class="row" onClick=${() => set('objetivo', o.value)}>
              <span class=${'check' + (p.objetivo === o.value ? ' on' : '')}></span><span class="grow">${o.label}</span>
            </button>`)}
        </div>
        <p class="muted small">El objetivo no cambia tu plan: la app te dirá si el plan te lleva hacia él y, si no, cuánto habría que ajustar
          para que lo hables con tu nutricionista. Para rendir en CrossFit no conviene bajar más de 0,5 kg por semana.</p>
      </section>

      ${gasto && html`
        <section class="card">
          <p>Tu gasto estimado: <b>${fmt(gasto)} kcal al día</b>.</p>
          <p class="muted small">Es una estimación con fórmula (Mifflin-St Jeor). Cuando lleves unas semanas registrando comida y peso,
            la app calculará tu gasto real con tus datos, que es mucho más fiable.</p>
          <button class="btn secondary" onClick=${() => go('progreso')}>Ver a dónde me lleva el plan</button>
        </section>`}
    </div>`;
}
