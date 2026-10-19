// Recetas propias con peso total cocinado (guisos, comida para varios días).
// Pones los ingredientes en crudo (como los echas a la olla) y cuánto pesa todo ya cocinado.
// La app calcula los valores por 100 g COCINADOS, descuenta los ingredientes de la despensa
// y guarda la receta en la despensa con su peso: al comer 300 g, se descuentan del táper.
import { html, useState } from '../lib.js';
import { db, useLive, getSetting, setSetting, getPrefs, candidateIds, deductStockExacto, anadirCompraFaltante, round1 } from '../db.js';
import { NUTRS, sumN, nutrFor, fmt, fmtG, todayStr, addDays, fmtDate, visibleFood } from '../nutri.js';
import { METODOS, nombreMetodo, raizDe, medidasDe, conMedida, faltanDatos, textoFaltan } from '../precision.js';
import { MICROS, microsDe } from '../data/micros.js';
import { Num, Icon, Dot, Toggle, toast } from '../ui.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Valores por 100 g cocinados a partir de los ingredientes y del peso final
// Aviso cuando en la despensa consta MENOS de lo que vas a descontar. No se guarda nada hasta que elijas:
// "lo compré y no lo apunté" (añade a la despensa justo lo que falta, como una compra) o "no descontar esta vez".
export function FaltaEnCasa({ food, necesario, disponible, onNoDescontar }) {
  const [ocupado, setOcupado] = useState(false); // un toque cada vez (además, los datos no añaden dos veces)
  const faltan = round1(necesario - disponible);
  const anadir = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const ids = candidateIds(food, await db.foods.toArray());
      const g = await anadirCompraFaltante({ foodId: food.id, ids, necesario });
      toast(g ? `${fmtG(g)} de ${food.name} añadidos a la despensa ✓` : `${food.name}: ya hay bastante en la despensa`);
    } catch (e) { toast(e.message); }
    setOcupado(false);
  };
  return html`
    <div class="aviso warn pila falta-casa" role="alert">
      <span><b>${food.name}: no hay bastante en casa.</b> Constan ${fmtG(disponible)} y vas a usar ${fmtG(necesario)} en crudo.</span>
      <div class="inline">
        <button class="btn small secondary" disabled=${ocupado} onClick=${anadir}>Lo compré y no lo apunté: añadir ${fmtG(faltan)}</button>
        <button class="btn small secondary" onClick=${onNoDescontar}>No descontar esta vez</button>
      </div>
    </div>`;
}

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
  const stockDe = f => { const ids = candidateIds(f, foods); return round1(lots.filter(l => ids.includes(l.foodId)).reduce((s, l) => s + Math.max(0, l.g), 0)); };
  // Ingredientes de los que no hay bastante en casa (solo importa si se descuentan)
  const faltas = descontar ? items.filter(i => i.g > 0 && byId[i.foodId] && i.g > stockDe(byId[i.foodId]) + 0.05) : [];
  const listo = nombre.trim() && items.some(i => i.g > 0) && totalG > 0 && !faltas.length;

  const guardar = async () => {
    const grupoPrincipal = (() => {
      const kcal = {};
      for (const i of items) { const f = byId[i.foodId]; if (f) kcal[f.group] = (kcal[f.group] || 0) + nutrFor(f, i.g).kcal; }
      return Object.entries(kcal).sort((a, b) => b[1] - a[1])[0]?.[0] || 'otro';
    })();
    // Cada tanda es un producto NUEVO: si queda táper de la anterior, conserva sus propios valores
    const id = 'r-' + Date.now().toString(36);
    const recetaDe = inicial?.recetaDe || inicial?.id || id;
    const faltan = [...new Set(items.filter(i => i.g > 0).flatMap(i => faltanDatos(byId[i.foodId])))];
    const comida = {
      id, source: 'receta', recetaDe, brand: nombreTanda(), name: nombre.trim(), group: grupoPrincipal,
      n: r.n, micros: r.micros, factor: null, genericId: '',
      ingredientes: items.filter(i => i.g > 0).map(i => ({ foodId: i.foodId, g: i.g })),
      ultimoTotalG: totalG, ...(faltan.length ? { faltan } : {}),
    };
    if (!descontar) comida.sinDescontar = true; // queda apuntado que esta tanda no descontó la despensa
    try {
      // Todo o nada: si falta algún ingrediente en casa, no se crea el táper ni se descuenta nada
      await db.transaction('rw', db.foods, db.lots, async () => {
        await db.foods.put(comida);
        if (descontar) for (const i of comida.ingredientes) await deductStockExacto(candidateIds(byId[i.foodId], foods), i.g, byId[i.foodId]?.name);
        await db.lots.add({ foodId: id, g: round1(totalG), abierto: true, expiry: dias ? addDays(todayStr(), dias) : null, addedAt: Date.now() });
      });
    } catch (e) { toast(e.message); return; }
    await archivarTandasVacias(recetaDe, id);
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
      ${faltas.map(i => html`<${FaltaEnCasa} key=${i.foodId} food=${byId[i.foodId]} necesario=${i.g} disponible=${stockDe(byId[i.foodId])} onNoDescontar=${() => setDescontar(false)} />`)}
      <label>Se conserva en la nevera unos
        <div class="chips">${[3, 4, 5, 0].map(d => html`<button class=${'chip' + (dias === d ? ' on' : '')} onClick=${() => setDias(d)}>${d ? `${d} días` : 'Congelado / sin fecha'}</button>`)}</div>
      </label>
      <button class="btn" disabled=${!listo} onClick=${guardar}>${listo ? `Guardar ${fmtG(totalG)} en la despensa` : faltas.length ? 'Resuelve lo que falta en casa' : 'Pon nombre, ingredientes y peso total'}</button>
    </div>`;
}

// Nombre de la tanda ("Tanda 19 oct") para distinguir tápers de la misma receta
const nombreTanda = () => 'Tanda ' + fmtDate(todayStr(), { day: 'numeric', month: 'short' });

// Al cocinar una tanda nueva, las anteriores de la misma receta que ya no tienen nada en la despensa
// se archivan (dejan de salir en las búsquedas; los registros antiguos las siguen usando).
async function archivarTandasVacias(recetaDe, nuevaId) {
  const tandas = await db.foods.filter(f => f.source === 'receta' && f.id !== nuevaId && (f.recetaDe || f.id) === recetaDe && !f.archivado).toArray();
  for (const t of tandas) {
    const queda = (await db.lots.where('foodId').equals(t.id).toArray()).some(l => l.g > 0);
    if (!queda) await db.foods.update(t.id, { archivado: true });
  }
}

// ---------- Preparación sencilla: UN alimento pesado en crudo y ya cocinado ----------
// Guarda el táper (todo o nada): producto con valores por 100 g COCINADOS + envase en la despensa,
// y descuenta lo crudo una sola vez. Devuelve el producto del táper.
export async function guardarPreparacion({ food, foods, crudoG, cocidoG, metodo, descontar, dias }) {
  let taper;
  await db.transaction('rw', db.foods, db.lots, async () => {
    taper = await crearLote({ food, foods, crudoG, cocidoG, metodo, descontar, dias });
  });
  // El factor medido queda para las próximas veces (se lee justo antes para no pisar otras medidas)
  if (metodo) await setSetting('coccion', conMedida(await getSetting('coccion', {}), food, metodo, crudoG, cocidoG));
  return taper;
}

// Crea el producto del táper/lote y su envase, y descuenta lo crudo (sin transacción propia:
// quien la llama la mete en la suya, que debe incluir foods y lots).
export async function crearLote({ food, foods, crudoG, cocidoG, metodo, descontar, dias, nombre }) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const id = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const total = nutrFor(food, crudoG), k = 100 / cocidoG;
  const m = microsDe(food, crudoG, byId);
  const falta = faltanDatos(food);
  const cocinado = crudoG !== cocidoG || metodo;
  const taper = {
    id, source: 'receta', recetaDe: id, brand: nombreTanda(),
    name: nombre || `${food.name.split(' · ')[0]} ${metodo ? `(${nombreMetodo(metodo).toLowerCase()})` : cocinado ? 'cocinado' : '(preparado)'}`,
    group: food.group, mar: !!food.mar, factor: null, genericId: '', equivale: raizDe(food), metodo: metodo || null,
    n: Object.fromEntries(NUTRS.map(({ k: key }) => [key, round1((total[key] || 0) * k)])),
    micros: m ? Object.fromEntries(Object.entries(m).map(([key, v]) => [key, Math.round(v * k * 100) / 100])) : null,
    ingredientes: [{ foodId: food.id, g: crudoG }], ultimoTotalG: cocidoG,
    ...(falta.length ? { faltan: falta } : {}), ...(descontar ? {} : { sinDescontar: true }),
  };
  // Primero se descuenta (exacto: si no hay bastante, se lanza el aviso y no se crea nada)
  if (descontar) await deductStockExacto(candidateIds(food, foods), crudoG, food.name);
  await db.foods.put(taper);
  await db.lots.add({ foodId: id, g: round1(cocidoG), abierto: true, expiry: dias ? addDays(todayStr(), dias) : null, addedAt: Date.now() });
  return taper;
}

// Ej.: 300 g de patata cruda → 150 g en airfryer. Descuenta los 300 g crudos UNA vez y guarda un táper
// de 150 g con los valores de los 300 g crudos. Comer del táper ya no vuelve a descontar la patata.
// Además guarda el factor medido (0,50) para cuando registres ese alimento sin táper.
export function Preparacion({ foods, food: inicial, onDone }) {
  const lots = useLive(() => db.lots.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const coccion = useLive(() => getSetting('coccion', {}), []);
  const [food, setFood] = useState(inicial || null);
  const [q, setQ] = useState('');
  const [crudoG, setCrudoG] = useState(null);
  const [cocidoG, setCocidoG] = useState(null);
  const [elegido, setMetodo] = useState(undefined); // undefined = el último método que usaste con este alimento
  const [descontar, setDescontar] = useState(null); // null = sí si hay en casa
  const [dias, setDias] = useState(4);
  const [guardando, setGuardando] = useState(false);
  if (!lots || !prefs || coccion === undefined) return html`<p class="muted">Cargando…</p>`;

  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const stockDe = f => { const ids = candidateIds(f, foods); return lots.filter(l => ids.includes(l.foodId)).reduce((s, l) => s + Math.max(0, l.g), 0); };

  if (!food) {
    const enCasa = id => lots.some(l => l.foodId === id && l.g > 0);
    const res = foods
      .filter(f => f.source !== 'receta' && visibleFood(f, prefs) && (q.trim().length < 2 ? enCasa(f.id) : norm(`${f.name} ${f.brand || ''}`).includes(norm(q))))
      .sort((a, b) => enCasa(b.id) - enCasa(a.id) || (a.source === 'base') - (b.source === 'base')).slice(0, 20);
    return html`
      <div class="form">
        <p class="small muted">¿Qué cocinaste? (por ejemplo patata, carne picada, arroz)</p>
        <input class="search" placeholder="Buscar alimento" value=${q} onInput=${e => setQ(e.target.value)} />
        ${q.trim().length < 2 && res.length > 0 && html`<small class="muted">En tu despensa:</small>`}
        <div class="list">${res.map(f => html`
          <button class="row" onClick=${() => { setFood(f); setMetodo(undefined); }}>
            <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
            ${enCasa(f.id) && html`<small class="muted">en casa</small>`}
          </button>`)}</div>
      </div>`;
  }

  const metodo = elegido === undefined ? medidasDe(food, coccion).ultimo : elegido;
  const stockG = stockDe(food);
  const desc = descontar ?? stockG > 0;
  const faltaCasa = desc && crudoG > stockG + 0.05;
  const listo = crudoG > 0 && cocidoG > 0 && !faltaCasa;
  const total = listo ? nutrFor(food, crudoG) : null;
  const falta = faltanDatos(food);
  const factorMedido = listo ? Math.round((cocidoG / crudoG) * 100) / 100 : null;

  const guardar = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    let taper;
    try { taper = await guardarPreparacion({ food, foods, crudoG, cocidoG, metodo, descontar: desc, dias }); }
    catch (e) { toast(e.message); setGuardando(false); return; }
    toast(`${taper.name}: ${fmtG(cocidoG)} guardados como táper ✓`);
    onDone?.({ food: taper, g: cocidoG });
  };

  return html`
    <div class="form receta">
      <div class="inline"><${Dot} group=${food.group} /><b class="grow">${food.name}</b>
        ${!inicial && html`<button class="link small" onClick=${() => setFood(null)}>Cambiar</button>`}</div>
      <label>¿Cómo lo cocinaste?
        <div class="chips wrap">${METODOS.map(x => html`
          <button class=${'chip' + (metodo === x.id ? ' on' : '')} onClick=${() => setMetodo(metodo === x.id ? null : x.id)}>${x.name}</button>`)}</div>
      </label>
      <div class="inline">
        <label class="grow">Pesaba en crudo<${Num} value=${crudoG} onChange=${setCrudoG} suffix="g" /></label>
        <label class="grow">Pesa ya cocinado<${Num} value=${cocidoG} onChange=${setCocidoG} suffix="g" /></label>
      </div>
      <small class="muted">Pesa todo lo cocinado junto (sin el recipiente).${stockG > 0 ? ` En casa constan ${fmtG(stockG, food)}.` : ''}</small>
      ${listo && html`
        <div class="preview small">
          <b>Toda la tanda: ${fmt(total.kcal)} kcal</b> · P ${fmt(total.prot)} · C ${fmt(total.carb)} · G ${fmt(total.fat)}<br />
          Cada 100 g cocinados: ${fmt(total.kcal * 100 / cocidoG)} kcal · P ${fmt(total.prot * 100 / cocidoG, 1)} g.
          <span class="muted"> Factor medido ×${fmt(factorMedido, 2)}${metodo ? `: lo recordaré para ${nombreMetodo(metodo).toLowerCase()}` : ''}.</span>
        </div>`}
      ${falta.length > 0 && html`<p class="aviso warn small">${food.name} no tiene ${textoFaltan(falta)}: el táper tampoco lo tendrá.</p>`}
      <${Toggle} label="Descontar lo crudo de la despensa" checked=${desc} onChange=${setDescontar}
        hint=${!desc ? (stockG > 0 ? 'No se descuenta nada de la despensa' : 'No consta en la despensa: no se descuenta nada') : `Se descontarán ${fmt(crudoG || 0)} g una sola vez`} />
      ${faltaCasa && html`<${FaltaEnCasa} food=${food} necesario=${crudoG} disponible=${stockG} onNoDescontar=${() => setDescontar(false)} />`}
      <label>Se conserva unos
        <div class="chips">${[3, 4, 5, 0].map(d => html`<button class=${'chip' + (dias === d ? ' on' : '')} onClick=${() => setDias(d)}>${d ? `${d} días` : 'Sin fecha'}</button>`)}</div>
      </label>
      <button class="btn" disabled=${!listo || guardando} onClick=${guardar}>${listo ? `Guardar táper de ${fmtG(cocidoG)}` : faltaCasa ? 'Resuelve lo que falta en casa' : 'Pon el peso en crudo y el cocinado'}</button>
    </div>`;
}
