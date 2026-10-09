// Ideas y recetas: qué puedes cocinar para cada comida de tu plan con lo que tienes en casa.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, activePlan, getSetting, setSetting, stockMap } from '../db.js';
import { mealBlocks, blockFoods, visibleFood, toRaw, nutrFor, sumN, fmt, todayStr } from '../nutri.js';
import { Sheet, MacroLine, Dot, Empty, Icon, toast } from '../ui.js';
import { RECETAS } from '../data/recetas.js';
import { saveLog } from './hoy.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ¿Encaja la receta en esta comida del plan? Si sí: qué alimento usar en cada ingrediente
// (el que tengas en casa), con la cantidad que marca tu plan, y qué te falta.
export function evaluarReceta(r, meal, plan, byId, prefs, stock, basicos) {
  const opciones = meal.opciones?.length ? meal.opciones : [null];
  let mejor = null;
  for (const o of opciones) {
    const blocks = mealBlocks(meal, o?.id);
    const usados = new Set();
    const items = [];
    let encaja = true;
    for (const ing of r.ingredientes) {
      const cands = ing.f.filter(id => visibleFood(byId[id], prefs));
      let hit = null;
      for (const b of blocks) {
        if (usados.has(b)) continue;
        const permit = blockFoods(b, plan).filter(x => cands.includes(x.id));
        if (permit.length) { hit = { b, permit }; break; }
      }
      if (!hit) { encaja = false; break; }
      usados.add(hit.b);
      // Preferimos lo que tienes en casa (en el orden de la receta)
      const ordenados = cands.map(id => hit.permit.find(x => x.id === id)).filter(Boolean);
      const enCasa = ordenados.find(x => (stock[x.id]?.g || 0) >= toRaw(byId[x.id], x.g, false, byId) * 0.9);
      const el = enCasa || ordenados[0];
      items.push({ ing, block: hit.b, enOpcion: !(meal.bloques || []).includes(hit.b), food: byId[el.id], g: el.g, enCasa: !!enCasa });
    }
    if (!encaja) continue;
    const faltan = items.filter(i => !i.enCasa);
    if (!mejor || faltan.length < mejor.faltan.length) mejor = { optionId: o?.id || null, items, faltan };
  }
  if (!mejor) return null;
  mejor.extrasFaltan = r.extras.filter(e => basicos.some(b => norm(b.name) === norm(e) && b.status === 'no'));
  mejor.n = sumN(mejor.items.map(i => nutrFor(i.food, toRaw(i.food, i.g, false, byId))));
  return mejor;
}

export function Ideas({ go }) {
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const lots = useLive(() => db.lots.toArray(), []);
  const basicos = useLive(() => db.basicos.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [comidaId, setComidaId] = useState(null);
  const [sel, setSel] = useState(null);

  if ([plan, foods, lots, basicos, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  if (!plan) return html`<div class="page"><button class="link back" onClick=${() => go('hoy')}>‹ Hoy</button>
    <${Empty}>Carga primero el plan de tu nutricionista (Más → Mi plan) y aquí verás recetas adaptadas.<//></div>`;

  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const stock = stockMap(lots, foods);
  // Por defecto, la próxima comida según la hora
  const ahora = new Date().toTimeString().slice(0, 5);
  const meal = plan.comidas.find(m => m.id === comidaId) || plan.comidas.find(m => m.hora >= ahora) || plan.comidas[0];
  const ideas = RECETAS.map(r => ({ r, e: evaluarReceta(r, meal, plan, byId, prefs, stock, basicos) }))
    .filter(x => x.e)
    .sort((a, b) => a.e.faltan.length - b.e.faltan.length);

  return html`
    <div class="page">
      <button class="link back" onClick=${() => go('hoy')}>‹ Hoy</button>
      <header class="top"><h1>Ideas con lo que tienes</h1></header>
      <div class="chips">
        ${plan.comidas.map(m => html`
          <button class=${'chip' + (m.id === meal.id ? ' on' : '')} onClick=${() => setComidaId(m.id)}>${m.nombre} · ${m.hora}</button>`)}
      </div>
      <p class="muted small">Recetas que encajan en tu plan para ${meal.nombre.toLowerCase()}, con las cantidades de tu plan (en cocido). Primero las que puedes hacer con lo que tienes.</p>
      ${ideas.length === 0 && html`<${Empty}>No tengo recetas para esta comida todavía. Pídele a Claude ideas nuevas y las añade.<//>`}
      <section class="card list">
        ${ideas.map(({ r, e }) => html`
          <button class="row" onClick=${() => setSel({ r, e })}>
            <span class="grow"><b>${r.nombre}</b>
              <br /><small class="muted">${r.tiempo} · ≈${fmt(e.n.kcal)} kcal · P ${fmt(e.n.prot)} g</small>
              <br />${e.faltan.length === 0
                ? html`<span class="tag ok">Tienes todo ✓</span>`
                : html`<span class="tag warn">Te falta: ${e.faltan.map(i => i.ing.nombre.toLowerCase()).join(', ')}</span>`}</span>
            <${Icon} name="right" size=${16} />
          </button>`)}
      </section>
      <${Sheet} open=${!!sel} onClose=${() => setSel(null)} title=${sel?.r.nombre}>
        ${sel && html`<${Receta} r=${sel.r} e=${sel.e} meal=${meal} foods=${foods} stock=${stock} onDone=${() => setSel(null)} />`}
      <//>
    </div>`;
}

function Receta({ r, e, meal, foods, stock, onDone }) {
  const date = todayStr();
  const registrar = async () => {
    for (const it of e.items) {
      const rawG = toRaw(it.food, it.g, false, Object.fromEntries(foods.map(f => [f.id, f])));
      await saveLog({
        date, mealId: meal.id, optionId: it.enOpcion ? e.optionId : null, blockId: it.block.id, food: it.food,
        g: it.g, crudo: false, rawG, n: nutrFor(it.food, rawG), deduct: (stock[it.food.id]?.g || 0) > 0, foods,
      });
    }
    if (e.optionId) {
      const el = await getSetting('opciones:' + date, {});
      await setSetting('opciones:' + date, { ...el, [meal.id]: e.optionId });
    }
    toast(`${r.nombre}: registrado en ${meal.nombre} ✓`);
    onDone();
  };
  const aCompra = async () => {
    const nombres = [...e.faltan.map(i => i.food.name), ...e.extrasFaltan];
    for (const n of nombres) await db.shopping.add({ name: n, done: 0 });
    toast(`Añadido a la compra: ${nombres.join(', ')}`);
  };
  return html`
    <div class="form">
      <p class="muted small">${r.tiempo} · para tu ${meal.nombre.toLowerCase()} · cantidades de tu plan, pesadas en cocido</p>
      <div class="preview"><${MacroLine} n=${e.n} /></div>
      <h4>Ingredientes</h4>
      <div class="list">
        ${e.items.map(it => html`
          <div class="row">
            <${Dot} group=${it.food.group} />
            <span class="grow">${it.food.name}<br /><small class="muted">${it.ing.nombre}</small></span>
            <b>${fmt(it.g)} g</b>
            <span class=${'tag ' + (it.enCasa ? 'ok' : 'warn')}>${it.enCasa ? 'en casa' : 'falta'}</span>
          </div>`)}
      </div>
      ${r.extras.length > 0 && html`<p class="small">Además: ${r.extras.join(', ')}${e.extrasFaltan.length ? html` <span class="tag warn">se te acabó: ${e.extrasFaltan.join(', ')}</span>` : ''}</p>`}
      <h4>Cómo se hace</h4>
      <ol class="steps">${r.pasos.map(p => html`<li>${p}</li>`)}</ol>
      <button class="btn" onClick=${registrar}><${Icon} name="check" size=${18} /> Registrar en ${meal.nombre} de hoy</button>
      ${(e.faltan.length > 0 || e.extrasFaltan.length > 0) && html`
        <button class="btn secondary" onClick=${aCompra}><${Icon} name="plus" size=${18} /> Añadir lo que falta a la compra</button>`}
    </div>`;
}
