// Recetas propias con peso total cocinado (guisos, comida para varios días).
// Pones los ingredientes en crudo (como los echas a la olla) y cuánto pesa todo ya cocinado.
// La app calcula los valores por 100 g COCINADOS, descuenta los ingredientes de la despensa
// y guarda la receta en la despensa con su peso: al comer 300 g, se descuentan del táper.
import { html, useState } from '../lib.js';
import { db, candidateIds, deductStock, round1 } from '../db.js';
import { NUTRS, sumN, nutrFor, fmt, fmtG, todayStr, addDays, visibleFood } from '../nutri.js';
import { MICROS, microsDe } from '../data/micros.js';
import { Num, Icon, Dot, Toggle, toast } from '../ui.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Valores por 100 g cocinados a partir de los ingredientes y del peso final
export function calcularReceta(items, totalG, byId) {
  const validos = items.filter(i => byId[i.foodId] && i.g > 0);
  const total = sumN(validos.map(i => nutrFor(byId[i.foodId], i.g)));
  const microsTot = Object.fromEntries(MICROS.map(m => [m.k, 0]));
  for (const i of validos) {
    const m = microsDe(byId[i.foodId], i.g, byId);
    if (m) for (const k of Object.keys(m)) microsTot[k] += m[k];
  }
  const f = totalG > 0 ? 100 / totalG : 0;
  const n = Object.fromEntries(NUTRS.map(({ k }) => [k, round1((total[k] || 0) * f)]));
  const micros = Object.fromEntries(MICROS.map(m => [m.k, Math.round(microsTot[m.k] * f * 100) / 100]));
  return { total, n, micros, crudoG: validos.reduce((s, i) => s + i.g, 0) };
}

export function Receta({ foods, lots, prefs, inicial, onDone }) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const [nombre, setNombre] = useState(inicial?.name || '');
  const [items, setItems] = useState(inicial?.ingredientes?.map(i => ({ ...i })) || []);
  const [totalG, setTotalG] = useState(null);
  const [q, setQ] = useState('');
  const [descontar, setDescontar] = useState(true);
  const [dias, setDias] = useState(4);
  const enCasa = id => lots.some(l => l.foodId === id && l.g > 0);

  const res = q.trim().length < 2 ? [] : foods
    .filter(f => f.source !== 'receta' && visibleFood(f, prefs) && norm(`${f.name} ${f.brand || ''}`).includes(norm(q)))
    .sort((a, b) => enCasa(b.id) - enCasa(a.id) || (a.source === 'base') - (b.source === 'base')).slice(0, 12);
  const r = calcularReceta(items, totalG, byId);
  const cambiar = (i, g) => setItems(items.map((x, j) => (j === i ? { ...x, g } : x)));
  const listo = nombre.trim() && items.some(i => i.g > 0) && totalG > 0;

  const guardar = async () => {
    const grupoPrincipal = (() => {
      const kcal = {};
      for (const i of items) { const f = byId[i.foodId]; if (f) kcal[f.group] = (kcal[f.group] || 0) + nutrFor(f, i.g).kcal; }
      return Object.entries(kcal).sort((a, b) => b[1] - a[1])[0]?.[0] || 'otro';
    })();
    const id = inicial?.id || 'r-' + Date.now().toString(36);
    const comida = {
      ...(inicial || {}), id, source: 'receta', name: nombre.trim(), group: grupoPrincipal,
      n: r.n, micros: r.micros, factor: null, genericId: '',
      ingredientes: items.filter(i => i.g > 0).map(i => ({ foodId: i.foodId, g: i.g })),
      ultimoTotalG: totalG,
    };
    await db.transaction('rw', db.foods, db.lots, async () => {
      await db.foods.put(comida);
      if (descontar) for (const i of comida.ingredientes) await deductStock(candidateIds(byId[i.foodId], foods), i.g);
      await db.lots.add({ foodId: id, g: round1(totalG), abierto: true, expiry: dias ? addDays(todayStr(), dias) : null, addedAt: Date.now() });
    });
    toast(`${comida.name}: ${fmtG(totalG)} guardados en tu despensa ✓`);
    onDone?.();
  };

  return html`
    <div class="form receta">
      <label>¿Qué cocinaste?<input value=${nombre} onInput=${e => setNombre(e.target.value)} placeholder="Guiso de lentejas, pollo al curry…" /></label>

      <h4>Ingredientes (en crudo, como los echas a la olla)</h4>
      ${items.length === 0 && html`<p class="small muted">Busca y añade cada ingrediente con lo que pesa antes de cocinar.</p>`}
      ${items.map((it, i) => {
        const f = byId[it.foodId];
        return html`
          <div class="inline receta-ing" key=${it.foodId + i}>
            <${Dot} group=${f?.group} /><span class="grow">${f?.name || '¿?'}${enCasa(it.foodId) ? html` <small class="muted">en casa</small>` : ''}</span>
            <div class="receta-g"><${Num} value=${it.g} onChange=${v => cambiar(i, v || 0)} suffix="g" /></div>
            <button class="icon-btn" aria-label=${'Quitar ' + (f?.name || '')} onClick=${() => setItems(items.filter((_, j) => j !== i))}><${Icon} name="trash" size=${15} /></button>
          </div>`;
      })}
      <input class="search" placeholder="Añadir ingrediente (ej: lentejas)" value=${q} onInput=${e => setQ(e.target.value)} />
      ${res.length > 0 && html`<div class="list">${res.map(f => html`
        <button class="row" onClick=${() => { setItems([...items, { foodId: f.id, g: null }]); setQ(''); }}>
          <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
          ${enCasa(f.id) && html`<small class="muted">en casa</small>`}
        </button>`)}</div>`}

      <h4>Peso total ya cocinado</h4>
      <${Num} value=${totalG} onChange=${setTotalG} suffix="g en total" />
      <small class="muted">Pesa la olla o el táper con todo (sin el recipiente).${r.crudoG ? ` En crudo eran ${fmtG(r.crudoG)}.` : ''}</small>

      ${totalG > 0 && items.some(i => i.g > 0) && html`
        <div class="preview small">
          <b>Cada 100 g cocinados:</b> ${fmt(r.n.kcal)} kcal · P ${fmt(r.n.prot)} g · C ${fmt(r.n.carb)} g · G ${fmt(r.n.fat)} g<br />
          <span class="muted">Toda la olla: ${fmt(r.total.kcal)} kcal. Una ración de 300 g ≈ ${fmt(r.n.kcal * 3)} kcal y ${fmt(r.n.prot * 3)} g de proteína.</span>
        </div>`}

      <${Toggle} label="Descontar los ingredientes de la despensa" checked=${descontar} onChange=${setDescontar} />
      <label>Se conserva en la nevera unos
        <div class="chips">${[3, 4, 5, 0].map(d => html`<button class=${'chip' + (dias === d ? ' on' : '')} onClick=${() => setDias(d)}>${d ? `${d} días` : 'Congelado / sin fecha'}</button>`)}</div>
      </label>
      <button class="btn" disabled=${!listo} onClick=${guardar}>${listo ? `Guardar ${fmtG(totalG)} en la despensa` : 'Pon nombre, ingredientes y peso total'}</button>
    </div>`;
}
