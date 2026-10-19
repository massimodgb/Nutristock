// "Preparar comidas" (meal prep): cocinas una vez para varias comidas de días distintos.
// 1) Eliges las comidas (cena de hoy, comida de mañana…)  2) buscas cada ingrediente UNA vez
// 3) pones los gramos cocinados de cada comida por separado  4) guardas: lo crudo se descuenta una vez
// y cada comida queda "Preparada" (no cuenta como comido hasta que la confirmes en Hoy).
import { html, useState } from '../lib.js';
import { db, useLive, getSetting, candidateIds, round1 } from '../db.js';
import { nutrFor, sumN, cookFactor, visibleFood, fmt, fmtG, todayStr, addDays, fmtDate } from '../nutri.js';
import { Num, Dot, Icon, Toggle, toast } from '../ui.js';
import { METODOS, medidasDe, nombreMetodo, faltanDatos, textoFaltan } from '../precision.js';
import { guardarPreparado, bloqueDe, gramosPlan, asignadoPorLote } from '../mealprep.js';
import { FaltaEnCasa } from './receta.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = c => `${c.date}|${c.mealId}`;
const ahoraHHMM = () => new Date().toTimeString().slice(0, 5);

// Nombre corto de una comida en un día: "Hoy · Cena", "Mañana · Comida", "jue 23 · Cena"
export function nombreComidaDia(date, mealId, plan) {
  const hoy = todayStr();
  const dia = date === hoy ? 'Hoy' : date === addDays(hoy, 1) ? 'Mañana' : date === addDays(hoy, -1) ? 'Ayer' : fmtDate(date, { weekday: 'short', day: 'numeric' });
  const m = plan?.comidas.find(x => x.id === mealId);
  return `${dia} · ${m ? m.nombre : mealId === 'extra' ? 'Extra' : mealId}`;
}

export function PrepararComidas({ plan, foods, lots, prefs, onDone }) {
  const hoy = todayStr();
  const coccion = useLive(() => getSetting('coccion', {}), []);
  const porciones = useLive(() => db.porciones.toArray(), []);
  const opciones = useLive(() => db.settings.where('key').startsWith('opciones:').toArray()
    .then(r => Object.fromEntries(r.map(x => [x.key.slice(9), x.value]))), []);
  const [dias, setDias] = useState([hoy, addDays(hoy, 1)]);
  const [comidas, setComidas] = useState(() => {
    // Por defecto: la próxima comida de hoy según la hora
    const sig = plan?.comidas.find(m => (m.hora || '99') >= ahoraHHMM());
    return sig ? [{ date: hoy, mealId: sig.id }] : [];
  });
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState(false);
  if ([coccion, porciones, opciones].includes(undefined)) return html`<p class="muted">Cargando…</p>`;
  if (!plan) return html`<p class="muted">Carga el plan de tu nutricionista para preparar comidas.</p>`;

  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const optDe = c => opciones[c.date]?.[c.mealId] || plan.comidas.find(m => m.id === c.mealId)?.opciones?.[0]?.id || null;
  const stockDe = f => { const ids = candidateIds(f, foods); return lots.filter(l => ids.includes(l.foodId)).reduce((s, l) => s + Math.max(0, l.g), 0); };
  const asignado = asignadoPorLote(porciones);
  const libreLote = f => Math.max(0, round1(stockDe(f) - (asignado[f.id] || 0)));
  // Descontar de la despensa: por defecto sí si consta algo en casa; si no consta nada, no (no se inventa stock)
  const descDe = it => it.descontar ?? stockDe(it.food) > 0;
  const elegida = c => comidas.some(x => clave(x) === clave(c));
  // Gramos que pide el plan para un ingrediente en una comida (se proponen; los cambias si quieres)
  const sugerido = (f, c) => {
    const meal = plan.comidas.find(x => x.id === c.mealId);
    return gramosPlan(meal, optDe(c), bloqueDe(meal, optDe(c), f, plan, byId), f, plan, byId);
  };
  const alternar = c => {
    if (elegida(c)) { setComidas(comidas.filter(x => clave(x) !== clave(c))); return; }
    setComidas([...comidas, c].sort((a, b) => a.date.localeCompare(b.date) || plan.comidas.findIndex(m => m.id === a.mealId) - plan.comidas.findIndex(m => m.id === b.mealId)));
    setItems(items.map(it => (it.gramos[clave(c)] !== undefined ? it : { ...it, gramos: { ...it.gramos, [clave(c)]: sugerido(it.food, c) } })));
  };

  // Forma de cocinar por defecto de un ingrediente: táper / lo último que mediste / tabla / no se cocina
  const modosDe = f => {
    if (f.source === 'receta') return [{ id: 'lote', label: 'Táper ya cocinado' }];
    const tabla = cookFactor(f, byId), { propias, base } = medidasDe(f, coccion);
    return [
      ...(tabla != null ? [{ id: 'tabla', label: `Tabla ×${fmt(tabla, 2)}`, modo: 'factor', factor: tabla, metodo: null }] : []),
      ...Object.entries(propias).map(([m, x]) => ({ id: 'm:' + m, label: `${nombreMetodo(m)} ×${fmt(x, 2)}`, modo: 'factor', factor: x, metodo: m })),
      ...Object.entries(base).filter(([m]) => !propias[m]).map(([m, x]) => ({ id: 'b:' + m, label: `${nombreMetodo(m)} ×${fmt(x, 2)} (de ${byId[f.genericId]?.name || 'su base'})`, modo: 'factor', factor: x, metodo: null })),
      { id: 'tanda', label: 'Pesé la tanda', modo: 'tanda' },
      { id: 'tal', label: tabla != null ? 'Lo pesé en crudo' : 'No se cocina', modo: 'tal' },
    ];
  };
  const anadir = f => {
    const modos = modosDe(f), ult = medidasDe(f, coccion).ultimo;
    // Por defecto: lo último que mediste, si no la tabla, si no "no se cocina" (pesar la tanda es opcional)
    const m = modos.find(x => x.id === 'm:' + ult) || modos.find(x => x.id === 'tabla' || x.id === 'lote') || modos.find(x => x.id === 'tal') || modos[0];
    const gramos = Object.fromEntries(comidas.map(c => [clave(c), sugerido(f, c)]));
    setItems([...items, { food: f, modoId: m.id, gramos, crudoG: null, cocidoG: null, metodoTanda: ult || null }]);
    setQ('');
  };
  const cambiar = (i, cambios) => setItems(items.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  // Cálculo de cada ingrediente: modo, crudo que se descuenta, lo que aporta cada comida
  const calc = it => {
    const m = modosDe(it.food).find(x => x.id === it.modoId) || modosDe(it.food)[0];
    const gs = comidas.map(c => it.gramos[clave(c)] || 0);
    const asign = gs.reduce((s, g) => s + g, 0);
    let crudoG = null, cocidoG = null, valores = it.food; // valores = alimento con el que se calcula 1 g cocinado
    if (m.id === 'lote') { cocidoG = libreLote(it.food); }
    else if (m.modo === 'tanda') { crudoG = it.crudoG; cocidoG = it.cocidoG; }
    else if (m.modo === 'factor') { crudoG = asign / m.factor; cocidoG = asign; }
    else { crudoG = asign; cocidoG = asign; }
    const kPorG = m.id === 'lote' ? 1 : crudoG > 0 && cocidoG > 0 ? crudoG / cocidoG : null; // gramos crudos por gramo cocinado
    const nDe = g => (kPorG ? nutrFor(valores, g * kPorG) : null);
    const libre = cocidoG != null ? round1(cocidoG - asign) : null;
    // Si se descuenta y en casa consta menos crudo del necesario, hay que decidir antes de guardar
    const st = round1(stockDe(it.food)), desc = m.id !== 'lote' && descDe(it);
    const faltaCasa = desc && crudoG > 0 && crudoG > st + 0.05;
    return { m, gs, asign, crudoG, cocidoG, nDe, libre, st, desc, faltaCasa,
      ok: !faltaCasa && asign > 0 && (m.id === 'lote' ? asign <= cocidoG + 0.05 : crudoG > 0 && cocidoG > 0 && (m.modo !== 'tanda' || asign <= cocidoG + 0.05)) };
  };
  const calcs = items.map(calc);
  const totalesComida = comidas.map((c, i) => sumN(calcs.map(k => k.nDe(k.gs[i]) || {})));
  const listo = comidas.length > 0 && items.length > 0 && calcs.every(k => k.ok || k.asign === 0) && calcs.some(k => k.asign > 0);
  const nPorciones = calcs.reduce((s, k) => s + k.gs.filter(g => g > 0).length, 0);
  const hayFaltas = calcs.some(k => k.faltaCasa && k.asign > 0);

  const guardar = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    try {
      const cs = comidas.map(c => ({ ...c, optionId: optDe(c) }));
      await guardarPreparado({
        comidas: cs, foods, plan,
        items: items.map((it, i) => {
          const k = calcs[i];
          return {
            food: it.food, modo: k.m.id === 'lote' ? 'lote' : k.m.modo, factor: k.m.factor,
            metodo: k.m.modo === 'tanda' ? it.metodoTanda : k.m.metodo, crudoG: it.crudoG, cocidoG: it.cocidoG,
            gramos: k.gs, descontar: k.desc,
          };
        }),
      });
      toast(`Preparado ✓ ${nPorciones} ${nPorciones === 1 ? 'porción' : 'porciones'}: las verás en cada comida como «Preparada»`);
      onDone?.();
    } catch (e) { toast(e.message); setGuardando(false); }
  };

  const res = q.trim().length < 2 ? [] : foods
    .filter(f => visibleFood(f, prefs) && !items.some(x => x.food.id === f.id) && norm(`${f.name} ${f.brand || ''}`).includes(norm(q)))
    .map(f => ({ f, st: f.source === 'receta' ? libreLote(f) : stockDe(f) }))
    .filter(x => x.f.source !== 'receta' || x.st > 0)
    .sort((a, b) => (b.f.source === 'receta') - (a.f.source === 'receta') || (b.st > 0) - (a.st > 0) || (a.f.source === 'base') - (b.f.source === 'base'))
    .slice(0, 15);
  const tapersLibres = foods.filter(f => f.source === 'receta' && !f.archivado && libreLote(f) > 0 && !items.some(x => x.food.id === f.id));

  return html`
    <div class="form preparar">
      <h4>¿Para qué comidas?</h4>
      ${dias.map(d => html`
        <div class="prep-dia" key=${d}>
          <small class="muted">${d === hoy ? 'Hoy' : d === addDays(hoy, 1) ? 'Mañana' : fmtDate(d, { weekday: 'long', day: 'numeric' })}</small>
          <div class="chips wrap">${plan.comidas.map(m => {
            const c = { date: d, mealId: m.id };
            return html`<button class=${'chip' + (elegida(c) ? ' on' : '')} aria-pressed=${elegida(c)} onClick=${() => alternar(c)}>${m.nombre}</button>`;
          })}</div>
        </div>`)}
      <label class="prep-otro">Otro día
        <input type="date" min=${hoy} onChange=${e => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !dias.includes(v)) setDias([...dias, v].sort()); }} />
      </label>

      ${comidas.length > 0 && html`
        <h4>Ingredientes</h4>
        <small class="muted">Busca cada ingrediente una vez y pon los gramos ya cocinados de cada comida.</small>
        ${tapersLibres.length > 0 && html`
          <div class="chips wrap">${tapersLibres.map(f => html`
            <button class="chip" onClick=${() => anadir(f)}>+ ${f.name} <small>(${fmtG(libreLote(f))} libres)</small></button>`)}</div>`}
        <input class="search" placeholder="Buscar ingrediente (carne picada, verduras, arroz…)" value=${q} onInput=${e => setQ(e.target.value)} />
        ${res.length > 0 && html`<div class="list">${res.map(({ f, st }) => html`
          <button class="row" onClick=${() => anadir(f)}>
            <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
            ${st > 0 && html`<small class="muted">${f.source === 'receta' ? `táper · ${fmtG(st)} libres` : `en casa ${fmtG(st, f)}`}</small>`}
          </button>`)}</div>`}`}

      ${items.map((it, i) => {
        const k = calcs[i], modos = modosDe(it.food), falta = faltanDatos(it.food), st = k.st;
        return html`
          <section class="prep-item" key=${it.food.id}>
            <div class="inline"><${Dot} group=${it.food.group} /><b class="grow">${it.food.name}</b>
              <button class="icon-btn" aria-label=${'Quitar ' + it.food.name} onClick=${() => setItems(items.filter((_, j) => j !== i))}><${Icon} name="trash" size=${15} /></button></div>
            ${modos.length > 1 && html`
              <div class="chips wrap">${modos.map(m => html`
                <button class=${'chip' + (k.m.id === m.id ? ' on' : '')} onClick=${() => cambiar(i, { modoId: m.id })}>${m.label}</button>`)}</div>`}
            ${k.m.modo === 'tanda' && html`
              <div class="chips wrap">${METODOS.map(x => html`
                <button class=${'chip' + (it.metodoTanda === x.id ? ' on' : '')} onClick=${() => cambiar(i, { metodoTanda: it.metodoTanda === x.id ? null : x.id })}>${x.name}</button>`)}</div>
              <div class="inline">
                <label class="grow">Crudo<${Num} value=${it.crudoG} onChange=${v => cambiar(i, { crudoG: v })} suffix="g" /></label>
                <label class="grow">Cocinado (toda la tanda)<${Num} value=${it.cocidoG} onChange=${v => cambiar(i, { cocidoG: v })} suffix="g" /></label>
              </div>`}
            <div class="prep-gramos">${comidas.map((c, j) => {
              const n = k.nDe(k.gs[j]);
              return html`
                <div class="prep-g" key=${clave(c)}>
                  <span class="grow">${nombreComidaDia(c.date, c.mealId, plan)}<br /><small class="muted">${!k.gs[j] ? 'Sin asignar' : n ? `${fmt(n.kcal)} kcal · P ${fmt(n.prot)} g` : 'Falta el peso de la tanda'}</small></span>
                  <div class="prep-num"><${Num} value=${it.gramos[clave(c)]} onChange=${v => cambiar(i, { gramos: { ...it.gramos, [clave(c)]: v } })} suffix="g" /></div>
                </div>`;
            })}</div>
            <small class=${k.ok || !k.asign ? 'muted' : 'aviso-rm'}>
              ${k.m.id === 'lote' ? `Del táper: ${fmt(k.asign)} de ${fmtG(k.cocidoG)} libres${k.asign > k.cocidoG + 0.05 ? ' — no hay suficiente' : ''}.`
                : k.m.modo === 'tanda' ? (it.crudoG > 0 && it.cocidoG > 0 ? `${k.desc ? `Se descuentan ${fmtG(it.crudoG)} crudos.` : 'No se descuenta de la despensa.'} ${k.libre >= 0 ? `Quedan ${fmtG(k.libre)} libres en el táper.` : 'Has asignado más de lo cocinado.'}` : 'Pon el peso crudo y el cocinado de toda la tanda.')
                : !k.asign ? 'Pon los gramos de cada comida.'
                : k.desc ? `Se descuentan ${fmtG(k.crudoG)} ${k.m.modo === 'tal' ? '' : 'crudos '}de la despensa (una sola vez).`
                : st > 0 ? 'No se descuenta de la despensa.' : 'No consta en la despensa: no se descuenta nada.'}
            </small>
            ${k.m.id !== 'lote' && (st > 0 || k.desc) && html`<${Toggle} label="Descontar de la despensa" checked=${k.desc} onChange=${v => cambiar(i, { descontar: v })} />`}
            ${k.faltaCasa && html`<${FaltaEnCasa} food=${it.food} necesario=${round1(k.crudoG)} disponible=${st} onNoDescontar=${() => cambiar(i, { descontar: false })} />`}
            ${falta.length > 0 && html`<small class="aviso-rm">Sin dato de ${textoFaltan(falta)}: contará como 0.</small>`}
          </section>`;
      })}

      ${items.length > 0 && html`
        <div class="prep-resumen">
          ${comidas.map((c, j) => html`<div class="inline" key=${clave(c)}><span class="grow">${nombreComidaDia(c.date, c.mealId, plan)}</span><b>${fmt(totalesComida[j].kcal)} kcal</b></div>`)}
          <small class="muted">Quedarán como «Preparada»: no cuentan como comido hasta que lo confirmes en cada comida.</small>
        </div>
        <button class="btn" disabled=${!listo || guardando} onClick=${guardar}>
          ${listo ? `Guardar preparación (${nPorciones} ${nPorciones === 1 ? 'porción' : 'porciones'})` : hayFaltas ? 'Resuelve lo que falta en casa' : 'Completa los gramos de cada ingrediente'}</button>`}
    </div>`;
}
