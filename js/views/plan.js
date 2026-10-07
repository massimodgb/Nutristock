// Plan del nutricionista: verlo y cargar uno nuevo cada mes.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, activePlan, setSetting } from '../db.js';
import { GROUPS, blockFoods, blockRef, visibleFood, sumN, planRef, fmt, fmtDate } from '../nutri.js';
import { Sheet, Dot, MacroLine, Icon, toast } from '../ui.js';

export function Plan() {
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [importar, setImportar] = useState(false);

  if ([plan, foods, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));

  return html`
    <div class="page">
      <header class="top">
        <h1>Plan</h1>
        <button class="btn small" onClick=${() => setImportar(true)}>${plan ? 'Nuevo plan' : 'Cargar plan'}</button>
      </header>
      ${!plan && html`
        <div class="card">
          <p>Cada mes, pásale el PDF de tu nutricionista a Claude y te dará un archivo <b>.json</b> con el plan.</p>
          <p class="muted small">Guárdalo en OneDrive o Archivos y cárgalo aquí con "Cargar plan".</p>
        </div>`}
      ${plan && html`
        <section class="card">
          <h3>${plan.nombre}</h3>
          <p class="muted small">${plan.nutricionista} · desde ${fmtDate(plan.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          ${plan.nota && html`<p class="notice">${plan.nota}</p>`}
          <div class="preview"><span class="muted small">Estimación diaria:</span> <${MacroLine} n=${planRef(plan, byId, prefs)} /></div>
        </section>
        ${plan.comidas.map(m => html`
          <section class="card meal">
            <header class="meal-head"><div><h3>${m.nombre}</h3><small>${m.hora}</small></div></header>
            ${(m.bloques || []).map(b => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs} />`)}
            ${(m.opciones || []).length > 0 && html`
              <p class="muted small">Elige una opción:</p>
              ${m.opciones.map(o => html`
                <div class="opcion">
                  <strong>${o.nombre}</strong>
                  ${o.bloques.map(b => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs} />`)}
                </div>`)}`}
          </section>
          ${plan.entreno?.despuesDe === m.id && html`<div class="training"><${Icon} name="bolt" size=${16} /> ${plan.entreno.texto}</div>`}`)}
        ${plan.aderezos?.length > 0 && html`
          <section class="card"><h3>Aderezos libres</h3><p class="small">${plan.aderezos.join(' · ')}</p></section>`}`}

      <${Sheet} open=${importar} onClose=${() => setImportar(false)} title="Cargar plan">
        ${importar && html`<${Importar} onDone=${() => setImportar(false)} />`}
      <//>
    </div>`;
}

function BloquePlan({ b, plan, byId, prefs }) {
  const [abierto, setAbierto] = useState(false);
  const items = blockFoods(b, plan);
  const vis = items.filter(x => visibleFood(byId[x.id], prefs));
  const ocultos = items.length - vis.length;
  return html`
    <div class="block" onClick=${() => setAbierto(!abierto)}>
      <${Dot} group=${b.grupo} />
      <div class="grow">
        <div class="b-name">${b.nombre} <small class="muted">${b.texto}</small></div>
        ${abierto
          ? html`<small>${vis.map(x => `${byId[x.id]?.name || x.id} (${x.g} g)`).join(' · ')}</small>`
          : html`<small class="muted">${vis.length} opciones${ocultos ? ` · ${ocultos} del mar ocultas` : ''} · ≈${fmt(blockRef(b, plan, byId, prefs).kcal)} kcal</small>`}
      </div>
    </div>`;
}

function Importar({ onDone }) {
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  const cargar = async texto => {
    try {
      const plan = JSON.parse(texto);
      if (!plan.id || !Array.isArray(plan.comidas)) throw new Error('El archivo no tiene el formato de un plan');
      const foods = new Set((await db.foods.toArray()).map(f => f.id));
      const faltan = new Set();
      for (const m of plan.comidas) {
        for (const b of [...(m.bloques || []), ...(m.opciones || []).flatMap(o => o.bloques)]) {
          for (const x of blockFoods(b, plan)) if (!foods.has(x.id)) faltan.add(x.id);
        }
      }
      await db.plans.put({ ...plan, cargado: Date.now() });
      await setSetting('planActivo', plan.id);
      toast('Plan cargado ✓');
      if (faltan.size) alert(`Aviso: estos alimentos del plan no están en tu biblioteca y no aparecerán: ${[...faltan].join(', ')}`);
      onDone();
    } catch (e) {
      setErr(e.message);
    }
  };
  return html`
    <div class="form">
      <label class="btn">
        <${Icon} name="plan" size=${18} /> Elegir archivo .json
        <input type="file" accept=".json,application/json" hidden onChange=${async e => {
          const file = e.target.files[0];
          if (file) cargar(await file.text());
        }} />
      </label>
      <p class="muted small">…o pega aquí el contenido:</p>
      <textarea rows="6" value=${txt} onInput=${e => setTxt(e.target.value)}></textarea>
      <button class="btn" disabled=${!txt.trim()} onClick=${() => cargar(txt)}>Cargar</button>
      ${err && html`<p class="error">${err}</p>`}
      <p class="muted small">Tu historial no se pierde: los registros anteriores guardan sus calorías.</p>
    </div>`;
}
