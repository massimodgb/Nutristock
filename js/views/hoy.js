// Pantalla "Hoy": resumen del día, avisos y registro de comidas según tu plan.
import { html, useState, useMemo, useEffect } from '../lib.js';
import {
  db, useLive, getSetting, setSetting, getPrefs, activePlan, stockMap, candidateIds,
  deductStock, restoreStock, deleteLog, round1,
} from '../db.js';
import {
  NUTRS, GROUPS, sumN, planRef, blockRef, mealBlocks, blockFoods, visibleFood, cookFactor, toRaw, nutrFor,
  fmt, fmtG, todayStr, addDays, fmtDate, daysUntil,
} from '../nutri.js';
import { Sheet, Num, Toggle, Seg, Dot, MacroLine, Bar, Empty, Icon, toast, hojaRecienCerrada } from '../ui.js';
import { COMIDAS_FUERA } from '../data/restaurantes.js';
import { COMIDAS_FUERA_2, SINONIMOS } from '../data/restaurantes2.js';
import { leer } from './entreno.js';
import { estadoCompra, textoStock } from './stock.js';

export function Hoy({ go }) {
  const [date, setDate] = useState(todayStr());
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const lots = useLive(() => db.lots.toArray(), []);
  const basicos = useLive(() => db.basicos.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const logs = useLive(() => db.logs.where('date').equals(date).toArray(), [date]);
  const elecciones = useLive(() => getSetting('opciones:' + date, {}), [date]);
  const ayer = useLive(() => db.logs.where('date').equals(addDays(date, -1)).toArray(), [date]);
  const [sheet, setSheetRaw] = useState(null);
  // En el iPhone, el toque que cierra una hoja puede "atravesarla" y abrir otra: lo ignoramos
  const setSheet = v => { if (v && hojaRecienCerrada()) return; setSheetRaw(v); };

  if ([plan, foods, lots, basicos, prefs, logs, elecciones, ayer].includes(undefined)) {
    return html`<div class="loading">Cargando…</div>`;
  }

  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const stock = stockMap(lots, foods);
  const ctx = { plan, foods, byId, stock, prefs, date, lots };

  // Opción elegida en cada comida: la que marcaste, la que ya registraste, o la primera
  const choice = {};
  if (plan) for (const m of plan.comidas) {
    choice[m.id] = elecciones[m.id] || logs.find(l => l.mealId === m.id && l.optionId)?.optionId
      || m.opciones?.[0]?.id;
  }
  const setChoice = (mealId, optId) => setSetting('opciones:' + date, { ...elecciones, [mealId]: optId });

  const total = sumN(logs.map(l => l.n));
  const ref = plan ? planRef(plan, byId, prefs, choice) : null;
  const extras = logs.filter(l => l.mealId === 'extra');
  const isToday = date === todayStr();

  return html`
    <div class="page">
      <header class="top">
        <button class="icon-btn" onClick=${() => setDate(addDays(date, -1))} aria-label="Día anterior"><${Icon} name="left" /></button>
        <button class="top-title" onClick=${() => setDate(todayStr())}>
          ${isToday ? 'Hoy' : fmtDate(date, { weekday: 'long' })}
          <small>${fmtDate(date, { day: 'numeric', month: 'long' })}</small>
        </button>
        <button class="icon-btn" onClick=${() => setDate(addDays(date, 1))} aria-label="Día siguiente"><${Icon} name="right" /></button>
      </header>

      <${Resumen} total=${total} objetivo=${ref} onClick=${() => setSheet({ type: 'desglose' })} />
      <${Rapido} date=${date} logs=${logs} ayer=${ayer}
        onCopiar=${(titulo, entradas) => setSheet({ type: 'copiar', titulo, entradas })}
        onOtroDia=${() => setSheet({ type: 'otrodia' })} />
      <${Agua} date=${date} prefs=${prefs} />
      ${isToday && html`<${PesoHoy} date=${date} />`}
      <${EntrenoHoy} date=${date} go=${go} />
      ${isToday && plan && html`
        <button class="card idea-link" onClick=${() => go('ideas')}>
          <${Icon} name="bolt" size=${20} /><span class="grow"><b>Ideas y recetas</b><br /><small class="muted">Qué cocinar con lo que tienes en casa y tu plan</small></span><${Icon} name="right" size=${16} />
        </button>`}
      ${isToday && html`<${Avisos} ...${ctx} basicos=${basicos} choice=${choice} logs=${logs} go=${go} />`}

      ${!plan && html`
        <div class="card">
          <p>Todavía no has cargado el plan de tu nutricionista.</p>
          <button class="btn" onClick=${() => go('plan')}>Cargar plan</button>
        </div>`}

      ${plan?.comidas.map(m => html`
        <${MealCard} key=${m.id} meal=${m} ...${ctx} logs=${logs} option=${choice[m.id]}
          ayer=${ayer.filter(l => l.mealId === m.id && l.foodId)}
          onRepetir=${ayerLogs => setSheet({ type: 'copiar', titulo: `${m.nombre} de ayer`, entradas: ayerLogs.map(plantilla) })}
          onOption=${o => setChoice(m.id, o)}
          onBlock=${(block, optionId) => setSheet({ type: 'block', meal: m, block, optionId })}
          onLog=${log => setSheet({ type: 'log', log })} />
        ${plan.entreno?.despuesDe === m.id && html`
          <div class="training"><${Icon} name="bolt" size=${16} /> ${plan.entreno.texto}</div>`}
      `)}

      <section class="card meal">
        <header class="meal-head">
          <div><h3>Fuera del plan</h3><small>Comidas libres, restaurante, extras</small></div>
          <button class="icon-btn accent" onClick=${() => setSheet({ type: 'extra' })} aria-label="Añadir"><${Icon} name="plus" /></button>
        </header>
        ${extras.length === 0 && html`<p class="muted small">Nada registrado.</p>`}
        ${extras.map(l => html`
          <button class="row" onClick=${() => setSheet({ type: 'log', log: l })}>
            <span class="grow">${l.name}${l.aprox && html` <span class="tag">aprox.</span>`}
              ${l.g ? html`<small> · ${fmt(l.g)} g</small>` : ''}</span>
            <span class="muted">${fmt(l.n.kcal)} kcal</span>
          </button>`)}
      </section>

      <${Sheet} open=${sheet?.type === 'desglose'} onClose=${() => setSheet(null)} title="Desglose del día">
        ${sheet?.type === 'desglose' && html`<${Desglose} ...${ctx} logs=${logs} choice=${choice} total=${total} objetivo=${ref} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'block'} onClose=${() => setSheet(null)} title=${sheet?.block?.nombre}>
        ${sheet?.type === 'block' && html`<${BlockSheet} ...${ctx} ...${sheet} logs=${logs} onDone=${() => setSheetRaw(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'log'} onClose=${() => setSheet(null)} title="Registro">
        ${sheet?.type === 'log' && html`<${LogDetail} log=${sheet.log} byId=${byId} foods=${foods} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'copiar'} onClose=${() => setSheet(null)} title=${sheet?.titulo}>
        ${sheet?.type === 'copiar' && html`<${CopiarSheet} ...${ctx} entradas=${sheet.entradas} elecciones=${elecciones} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'otrodia'} onClose=${() => setSheet(null)} title="Copiar otro día">
        ${sheet?.type === 'otrodia' && html`<${OtroDia} ...${ctx} elecciones=${elecciones} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'extra'} onClose=${() => setSheet(null)} title="Fuera del plan">
        ${sheet?.type === 'extra' && html`<${ExtraSheet} ...${ctx} onDone=${() => setSheet(null)} />`}
      <//>
    </div>`;
}

function Resumen({ total, objetivo: ref, onClick }) {
  const pct = ref?.kcal ? (total.kcal / ref.kcal) * 100 : 0;
  const quedan = ref ? ref.kcal - total.kcal : null;
  return html`
    <section class="card resumen-dia tocable" onClick=${onClick}>
      ${ref ? html`
        <div class="ecuacion">
          <div><b>${fmt(ref.kcal)}</b><small>Objetivo</small></div><span>−</span>
          <div><b>${fmt(total.kcal)}</b><small>Comido</small></div><span>=</span>
          <div class=${quedan < 0 ? 'over' : 'ok'}><b>${fmt(Math.abs(quedan))}</b><small>${quedan >= 0 ? 'Te quedan' : 'Te pasaste'}</small></div>
        </div>
        <div class="bar-track grande"><div class="bar-fill" style=${{ width: Math.min(100, pct) + '%', background: pct > 110 ? 'var(--danger)' : 'var(--accent)' }}></div></div>
        <small class="muted">Llevas el ${fmt(pct)}% de las calorías de tu plan de hoy.</small>` : html`
        <div class="ecuacion"><div><b>${fmt(total.kcal)}</b><small>Comido hoy (kcal)</small></div></div>`}
      <div class="bars">
        <${Bar} label="Proteína" value=${total.prot} target=${ref?.prot} color="var(--prot)" />
        <${Bar} label="Carbohidratos" value=${total.carb} target=${ref?.carb} color="var(--carb)" />
        <${Bar} label="Grasas" value=${total.fat} target=${ref?.fat} color="var(--fat)" />
        <div class="mini-n">
          <span>Fibra ${fmt(total.fib)} g</span><span>Azúcar ${fmt(total.sug)} g</span>
          <span>Sat. ${fmt(total.sat, 1)} g</span><span>Sal ${fmt(total.salt, 1)} g</span>
        </div>
        <small class="ver-mas">Toca para ver el desglose por comida ›</small>
      </div>
    </section>`;
}

// Desglose del día, al estilo MyFitnessPal: objetivo − comido = te queda
function Desglose({ plan, byId, prefs, logs, choice, total, objetivo: ref }) {
  if (!plan || !ref) return html`<p class="muted">Carga el plan de tu nutricionista para ver tus objetivos.</p>`;
  const quedan = ref.kcal - total.kcal;
  const macros = [
    { k: 'prot', name: 'Proteína', color: 'var(--prot)', kcalG: 4 },
    { k: 'carb', name: 'Carbohidratos', color: 'var(--carb)', kcalG: 4 },
    { k: 'fat', name: 'Grasas', color: 'var(--fat)', kcalG: 9 },
  ];
  // De dónde vienen tus calorías de hoy (y las del plan)
  const reparto = n => {
    const t = macros.reduce((s, m) => s + n[m.k] * m.kcalG, 0) || 1;
    return Object.fromEntries(macros.map(m => [m.k, Math.round((n[m.k] * m.kcalG / t) * 100)]));
  };
  const rHoy = reparto(total), rPlan = reparto(ref);
  const comidas = plan.comidas.map(m => ({
    m,
    obj: sumN(mealBlocks(m, choice[m.id]).map(b => blockRef(b, plan, byId, prefs))),
    hecho: sumN(logs.filter(l => l.mealId === m.id).map(l => l.n)),
  }));
  const fuera = sumN(logs.filter(l => l.mealId === 'extra').map(l => l.n));

  return html`
    <div class="ecuacion">
      <div><b>${fmt(ref.kcal)}</b><small>Objetivo</small></div><span>−</span>
      <div><b>${fmt(total.kcal)}</b><small>Comido</small></div><span>=</span>
      <div class=${quedan < 0 ? 'over' : 'ok'}><b>${fmt(Math.abs(quedan))}</b><small>${quedan >= 0 ? 'Te quedan' : 'Te pasaste'}</small></div>
    </div>

    <h4>Macros</h4>
    <table class="ntable desg">
      <tr class="th"><td></td><td>Llevas</td><td>Objetivo</td><td>Faltan</td></tr>
      ${macros.map(m => html`
        <tr><td><span class="dot" style=${{ background: m.color }}></span>${m.name}</td>
          <td>${fmt(total[m.k])} g</td><td>${fmt(ref[m.k])} g</td>
          <td class=${total[m.k] > ref[m.k] * 1.1 ? 'over' : ''}>${total[m.k] >= ref[m.k] ? '✓' : fmt(ref[m.k] - total[m.k]) + ' g'}</td></tr>`)}
      <tr><td>Fibra</td><td>${fmt(total.fib)} g</td><td>${fmt(ref.fib)} g</td><td>${total.fib >= ref.fib ? '✓' : fmt(ref.fib - total.fib) + ' g'}</td></tr>
      <tr><td>Azúcares</td><td>${fmt(total.sug)} g</td><td colspan="2" class="muted">—</td></tr>
      <tr><td>Saturadas</td><td>${fmt(total.sat, 1)} g</td><td colspan="2" class="muted">—</td></tr>
      <tr><td>Sal</td><td>${fmt(total.salt, 1)} g</td><td colspan="2" class="muted">máx. 5 g (OMS)</td></tr>
    </table>
    <p class="muted small">Proteína por kg: ${html`<${ProtKg} total=${total} ref=${ref} />`}</p>

    <h4>De dónde salen tus calorías</h4>
    <div class="reparto">
      ${macros.map(m => html`<span style=${{ width: rHoy[m.k] + '%', background: m.color }}></span>`)}
    </div>
    <p class="muted small">Hoy: proteína ${rHoy.prot}% · carbos ${rHoy.carb}% · grasas ${rHoy.fat}%.
      Tu plan: ${rPlan.prot}% · ${rPlan.carb}% · ${rPlan.fat}%.</p>

    <h4>Por comida</h4>
    <table class="ntable desg">
      <tr class="th"><td></td><td>Comido</td><td>Plan</td><td>P / C / G</td></tr>
      ${comidas.map(({ m, obj, hecho }) => html`
        <tr><td>${m.nombre}<br /><small class="muted">${m.hora}</small></td>
          <td>${hecho.kcal ? fmt(hecho.kcal) : '—'}</td><td>${fmt(obj.kcal)}</td>
          <td class="small">${hecho.kcal ? `${fmt(hecho.prot)} / ${fmt(hecho.carb)} / ${fmt(hecho.fat)}` : '—'}</td></tr>`)}
      ${fuera.kcal > 0 && html`
        <tr><td>Fuera del plan</td><td>${fmt(fuera.kcal)}</td><td>0</td>
          <td class="small">${fmt(fuera.prot)} / ${fmt(fuera.carb)} / ${fmt(fuera.fat)}</td></tr>`}
    </table>

    <h4>¿De dónde sale el objetivo?</h4>
    <div class="explica">
      <p>No es una fórmula de "quiero bajar X kilos" como en MyFitnessPal. <b>Es lo que suma el plan de tu nutricionista</b>:
        la app coge cada bloque de cada comida (por ejemplo, 240 g de pollo cocido o 200 g de arroz integral cocido)
        y calcula sus calorías. Como cada bloque te deja elegir, usa la <b>media</b> de todas las opciones. Por eso pone "≈":
        un día con carne picada de ternera, aguacate y frutos secos de macadamia sale bastante más alto que uno con pollo y aceite.</p>
      <p>Si tu nutricionista pensó el plan para mantenerte, para ganar músculo o para definir, eso lo decide él con tus datos;
        la app te dice si lo estás cumpliendo.</p>
      <p><b>¿Estoy en déficit o en mantenimiento?</b> Para saberlo hay que comparar lo que comes con lo que gastas.
        Cuando conectemos Whoop, la app pondrá al lado tu gasto del día (incluido el CrossFit) y te dirá si ese día comiste por debajo,
        igual o por encima. Mientras, la pista más fiable es tu peso medio de la semana en Progreso: si se mantiene estable comiendo
        lo del plan, el plan es de mantenimiento para ti.</p>
    </div>`;
}

// Proteína por kilo de peso corporal (si tienes el peso registrado)
function ProtKg({ total, ref }) {
  const w = useLive(() => db.weights.orderBy('date').last(), []);
  if (!w?.kg) return html`apunta tu peso en Más para verla.`;
  return html`llevas ${fmt(total.prot / w.kg, 1)} g/kg, el plan da ${fmt(ref.prot / w.kg, 1)} g/kg (con ${fmt(w.kg, 1)} kg).`;
}

function Avisos({ lots, foods, byId, stock, basicos, prefs, plan, choice, logs, go }) {
  const items = [];
  for (const l of lots) {
    if (l.g <= 0 || !l.expiry) continue;
    const d = daysUntil(l.expiry);
    if (d > prefs.avisoCaducaDias) continue;
    const name = byId[l.foodId]?.name || 'Producto';
    items.push({ tipo: d < 0 ? 'mal' : 'warn', txt: d < 0 ? `${name} caducó` : d === 0 ? `${name} caduca hoy` : `${name} caduca en ${d} día${d > 1 ? 's' : ''}`, to: 'despensa' });
  }
  const aComprar = foods.filter(f => estadoCompra(f, lots).necesita);
  if (aComprar.length) {
    items.push({ tipo: 'warn', txt: `A la lista de la compra: ${aComprar.map(f => `${f.name} (quedan ${textoStock(f, lots)})`).join(', ')}`, to: 'despensa' });
  }
  const sin = basicos.filter(b => b.status === 'no').map(b => b.name);
  if (sin.length) items.push({ tipo: 'warn', txt: `Se acabó: ${sin.join(', ')}`, to: 'despensa' });

  // Sugerencia para la próxima comida con lo que tienes en casa
  if (plan && lots.some(l => l.g > 0)) {
    const ahora = new Date().toTimeString().slice(0, 5);
    const meal = plan.comidas.find(m => m.hora >= ahora && !logs.some(l => l.mealId === m.id));
    if (meal) {
      const tienes = [], faltan = [];
      for (const b of mealBlocks(meal, choice[meal.id])) {
        const vis = blockFoods(b, plan).filter(x => visibleFood(byId[x.id], prefs));
        if (!vis.length) continue;
        const hay = vis.find(x => (stock[x.id]?.g || 0) >= toRaw(byId[x.id], x.g, false, byId) * 0.9);
        if (hay) tienes.push(byId[hay.id].name); else faltan.push(b.nombre.toLowerCase());
      }
      items.unshift({
        tipo: faltan.length ? 'info' : 'ok',
        txt: `${meal.nombre} (${meal.hora}): ${tienes.length ? `podrías usar ${tienes.join(', ')}` : 'no hay nada del plan en casa'}${faltan.length ? `. Te falta: ${faltan.join(', ')}` : ' ✓'}`,
      });
    }
  }
  if (!items.length) return null;
  return html`
    <section class="card avisos">
      ${items.slice(0, 6).map(a => html`
        <button class=${'aviso ' + a.tipo} onClick=${() => a.to && go(a.to)}>
          <${Icon} name="bell" size=${16} /><span>${a.txt}</span>
        </button>`)}
    </section>`;
}

function MealCard({ meal, plan, byId, prefs, logs, option, ayer, onOption, onBlock, onLog, onRepetir }) {
  const mealLogs = logs.filter(l => l.mealId === meal.id);
  const opt = meal.opciones?.find(o => o.id === option);
  const blocks = [
    ...(meal.bloques || []).map(b => ({ b, optionId: null })),
    ...(opt?.bloques || []).map(b => ({ b, optionId: opt.id })),
  ];
  const doneCount = blocks.filter(({ b }) => mealLogs.some(l => l.blockId === b.id)).length;
  const kcal = sumN(mealLogs.map(l => l.n)).kcal;

  return html`
    <section class="card meal">
      <header class="meal-head">
        <div><h3>${meal.nombre}</h3><small>${meal.hora}</small></div>
        <span class="muted small">${kcal ? `${fmt(kcal)} kcal · ` : ''}${doneCount}/${blocks.length}</span>
      </header>
      ${mealLogs.length === 0 && ayer.length > 0 && html`
        <button class="chip repetir" onClick=${() => onRepetir(ayer)}>
          <${Icon} name="repeat" size=${15} /> Repetir lo de ayer (${ayer.map(l => l.name.split(' · ')[0]).join(', ')})
        </button>`}
      ${meal.opciones?.length > 1 && html`
        <div class="chips">
          ${meal.opciones.map(o => html`
            <button class=${'chip' + (o.id === option ? ' on' : '')} onClick=${() => onOption(o.id)}>${o.nombre}</button>`)}
        </div>`}
      ${blocks.map(({ b, optionId }) => {
        const bl = mealLogs.filter(l => l.blockId === b.id);
        const vis = blockFoods(b, plan).some(x => visibleFood(byId[x.id], prefs));
        return html`
          <div class=${'block' + (bl.length ? ' done' : '') + (vis ? '' : ' off')} key=${b.id}
            onClick=${() => vis && onBlock(b, optionId)}>
            <${Dot} group=${b.grupo} />
            <div class="grow">
              <div class="b-name">${b.nombre} <small class="muted">${b.texto}</small></div>
              ${!vis && html`<small class="muted">Excluido por tus preferencias (comida del mar)</small>`}
              ${bl.map(l => html`
                <button class="b-log" onClick=${e => { e.stopPropagation(); onLog(l); }}>
                  ${l.name} · ${fmt(l.g)} g${l.crudo ? ' (crudo)' : ''} · ${fmt(l.n.kcal)} kcal
                </button>`)}
            </div>
            <span class="b-state">${bl.length ? html`<${Icon} name="check" size=${18} />` : vis ? html`<${Icon} name="plus" size=${18} />` : ''}</span>
          </div>`;
      })}
    </section>`;
}

// Elegir alimento(s) para un bloque del plan. Se pueden COMBINAR varios (200 g de carne picada + ricotta):
// la hoja enseña cuánto llevas del bloque y sugiere cuánto poner del siguiente para completarlo.
function BlockSheet({ meal, block, optionId, plan, foods, byId, stock, prefs, date, logs, onDone }) {
  const [sel, setSel] = useState(null);
  const [verOtros, setVerOtros] = useState(false);
  const permitidos = blockFoods(block, plan);
  const ref = blockRef(block, plan, byId, prefs);
  const esProteina = block.grupo === 'proteina';
  // Cantidad del plan para un alimento (o para el alimento base al que equivale)
  const gPlan = f => (permitidos.find(x => x.id === f.id) || permitidos.find(x => x.id === f.genericId))?.g || null;
  // Qué parte del bloque cubre un registro: por gramos si está en el plan; si no, por proteína (o calorías)
  const fraccion = l => {
    const f = byId[l.foodId];
    const gp = f && gPlan(f);
    if (gp && l.g) return l.g / gp;
    return esProteina ? (l.n.prot || 0) / (ref.prot || 1) : (l.n.kcal || 0) / (ref.kcal || 1);
  };
  const enBloque = logs.filter(l => l.mealId === meal.id && l.blockId === block.id);
  const llevas = Math.min(1.5, enBloque.reduce((s, l) => s + fraccion(l), 0));
  const queda = Math.max(0, 1 - llevas);
  // Gramos (en cocido) que harían falta de un alimento para completar lo que queda
  const sugerir = f => {
    const gp = gPlan(f);
    if (!enBloque.length) return gp || null;
    if (gp) return Math.max(5, Math.round((queda * gp) / 5) * 5);
    const factor = cookFactor(f, byId) || 1;
    const porGramo = esProteina ? (f.n.prot || 0) / 100 / factor : (f.n.kcal || 0) / 100 / factor;
    if (!porGramo) return null;
    return Math.max(5, Math.round((queda * (esProteina ? ref.prot : ref.kcal)) / porGramo / 5) * 5);
  };

  const opciones = useMemo(() => {
    const list = [];
    for (const { id, g } of permitidos) {
      const base = byId[id];
      if (!visibleFood(base, prefs)) continue;
      list.push({ food: base, st: stock[id]?.g || 0 });
      for (const p of foods) if (p.genericId === id) list.push({ food: p, st: stock[p.id]?.g || 0, branded: true });
    }
    // Productos tuyos en casa del mismo tipo aunque no estén clasificados como este bloque
    const ya = new Set(list.map(o => o.food.id));
    for (const f of foods) {
      if (ya.has(f.id) || !visibleFood(f, prefs) || !(stock[f.id]?.g > 0)) continue;
      if (f.group === block.grupo) list.push({ food: f, st: stock[f.id].g, otro: true });
    }
    return list;
  }, [block.id]);
  const enCasa = opciones.filter(o => o.st > 0);
  const resto = opciones.filter(o => !(o.st > 0));
  const otrosGrupos = useMemo(() => {
    const ya = new Set(opciones.map(o => o.food.id));
    return foods.filter(f => !ya.has(f.id) && visibleFood(f, prefs) && (stock[f.id]?.g || 0) > 0)
      .map(f => ({ food: f, st: stock[f.id].g, otro: true }))
      .sort((a, b) => a.food.name.localeCompare(b.food.name));
  }, [block.id]);

  if (sel) {
    return html`
      <button class="link back" onClick=${() => setSel(null)}>‹ Elegir otro</button>
      ${enBloque.length > 0 && html`<p class="notice">Llevas el ${fmt(llevas * 100)}% del bloque. Te sugiero ${fmt(sugerir(sel.food) || 0)} g para completarlo.</p>`}
      <${AmountForm} food=${sel.food} defaultG=${sugerir(sel.food)} byId=${byId} foods=${foods} stockG=${sel.st}
        onSave=${async r => {
          await saveLog({ ...r, date, mealId: meal.id, optionId, blockId: block.id, foods });
          // Si era un producto sin clasificar, lo clasificamos con el grupo de este bloque
          if (sel.otro && (!sel.food.group || sel.food.group === 'otro')) await db.foods.update(sel.food.id, { group: block.grupo });
          toast('Añadido ✓ Puedes añadir otra cosa a este bloque o pulsar Listo');
          setSel(null);
        }} />`;
  }

  const fila = o => {
    const sug = sugerir(o.food);
    return html`
      <button class="row" onClick=${() => setSel(o)}>
        <${Dot} group=${o.food.group} />
        <span class="grow">${o.food.name}${o.food.brand ? html` <small class="muted">${o.food.brand}</small>` : ''}
          ${o.st > 0 ? html`<br /><small class="muted">en casa ${fmtG(o.st, o.food)}</small>` : ''}</span>
        ${sug ? html`<small class="muted">${enBloque.length ? '≈' : ''}${fmt(sug)} g</small>` : ''}
      </button>`;
  };

  return html`
    <p class="muted small">${block.texto}${block.nota ? ` · ${block.nota}` : ''}. Pesa en cocido. Puedes combinar varias cosas.</p>
    ${enBloque.length > 0 && html`
      <div class="progreso-bloque">
        <div class="bar-top"><span>Llevas del bloque</span><b>${fmt(llevas * 100)}%</b></div>
        <div class="bar-track"><div class="bar-fill" style=${{ width: Math.min(100, llevas * 100) + '%', background: llevas > 1.1 ? 'var(--danger)' : 'var(--accent)' }}></div></div>
        <small class="muted">${enBloque.map(l => `${l.name.split(' · ')[0]} ${fmt(l.g || 0)} g`).join(' + ')}</small>
        <button class="btn" onClick=${onDone}><${Icon} name="check" size=${18} /> Listo</button>
      </div>`}
    ${enCasa.length > 0 && html`
      <h4 class="group-title">En tu despensa</h4>
      <div class="list">${enCasa.map(fila)}</div>`}
    <h4 class="group-title">${enCasa.length ? 'Otras opciones de tu plan' : 'Opciones de tu plan'}</h4>
    <div class="list">${resto.map(fila)}</div>
    ${otrosGrupos.length > 0 && html`
      <button class="link" onClick=${() => setVerOtros(!verOtros)}>${verOtros ? 'Ocultar' : `Otras cosas de tu despensa (${otrosGrupos.length})`}</button>
      ${verOtros && html`<div class="list">${otrosGrupos.map(fila)}</div>`}`}`;
}

// Cantidad + vista previa de lo que aporta. Común a plan y "fuera del plan".
function AmountForm({ food, defaultG, byId, stockG, onSave }) {
  const [g, setG] = useState(defaultG ?? null);
  const [crudo, setCrudo] = useState(false);
  const [deduct, setDeduct] = useState(stockG > 0);
  const factor = cookFactor(food, byId);
  const rawG = g ? toRaw(food, g, crudo, byId) : 0;
  const n = nutrFor(food, rawG);
  const ultimo = useLive(() => db.logs.where('foodId').equals(food.id).last(), [food.id]);

  return html`
    <div class="form">
      <h4><${Dot} group=${food.group} /> ${food.name}</h4>
      <${Num} value=${g} onChange=${setG} suffix="g" autofocus />
      ${ultimo?.g && ultimo.g !== g && html`
        <button class="chip" onClick=${() => { setG(ultimo.g); setCrudo(!!ultimo.crudo); }}>
          Última vez: ${fmt(ultimo.g)} g${ultimo.crudo ? ' (crudo)' : ''}
        </button>`}
      ${food.unitG && html`
        <div class="chips">
          ${[1, 2, 3, 4].map(u => html`
            <button class="chip" onClick=${() => setG(u * food.unitG)}>${u} ${food.unitName || 'ud'}${u > 1 ? 's' : ''}</button>`)}
        </div>`}
      ${factor && factor !== 1 && html`
        <${Toggle} label="Lo pesé en crudo" checked=${crudo} onChange=${setCrudo}
          hint=${crudo ? '' : `${fmt(g || 0)} g cocido ≈ ${fmt(rawG)} g en crudo (factor ${fmt(factor, 2)})`} />`}
      <${Toggle} label="Descontar de la despensa" checked=${deduct} onChange=${setDeduct}
        hint=${stockG > 0 ? `En casa: ${fmtG(stockG, food)} → se descontarán ${fmt(rawG)} g` : 'No hay stock registrado'} />
      <div class="preview"><${MacroLine} n=${n} /></div>
      <button class="btn" disabled=${!g} onClick=${() => onSave({ food, g, crudo, rawG, n, deduct })}>Guardar</button>
    </div>`;
}

export async function saveLog({ date, mealId, optionId, blockId, food, g, crudo, rawG, n, deduct, foods }) {
  const deducted = deduct ? await deductStock(candidateIds(food, foods), rawG) : [];
  const nr = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, round1(v)]));
  await db.logs.add({
    date, mealId, optionId: optionId || null, blockId: blockId || null,
    foodId: food.id, name: food.name + (food.brand ? ` · ${food.brand}` : ''), group: food.group,
    g, crudo, rawG: round1(rawG), n: nr, deducted, ts: Date.now(),
  });
}

function LogDetail({ log, byId, foods, onDone }) {
  const descontado = (log.deducted || []).reduce((s, d) => s + d.g, 0);
  const food = log.foodId && byId[log.foodId];
  const [g, setG] = useState(log.g);
  const guardar = async () => {
    // Devolvemos lo descontado, recalculamos y volvemos a descontar con el peso nuevo
    await restoreStock(log.deducted);
    const rawG = toRaw(food, g, log.crudo, byId);
    const deducted = descontado > 0 ? await deductStock(candidateIds(food, foods), rawG) : [];
    const n = Object.fromEntries(Object.entries(nutrFor(food, rawG)).map(([k, v]) => [k, round1(v)]));
    await db.logs.update(log.id, { g, rawG: round1(rawG), n, deducted });
    toast('Actualizado ✓');
    onDone();
  };
  return html`
    <div class="form">
      <h4>${log.name}${log.aprox ? html` <span class="tag">aprox.</span>` : ''}</h4>
      ${food && html`
        <div class="inline">
          <${Num} value=${g} onChange=${setG} suffix=${log.crudo ? 'g crudo' : 'g'} />
          <button class="btn small" disabled=${!g || g === log.g} onClick=${guardar}>Cambiar</button>
        </div>`}
      ${log.g ? html`<p class="muted">${fmt(log.g)} g ${log.crudo ? 'en crudo' : 'pesado'}${log.rawG !== log.g ? ` · ${fmt(log.rawG)} g en crudo` : ''}</p>` : ''}
      <table class="ntable">
        ${NUTRS.map(({ k, name, unit }) => html`<tr><td>${name}</td><td>${fmt(log.n[k] || 0, 1)} ${unit}</td></tr>`)}
      </table>
      ${descontado > 0 && html`<p class="muted small">Se descontaron ${fmt(descontado)} g de la despensa. Si lo borras, se devuelven.</p>`}
      <button class="btn danger" onClick=${async () => { await deleteLog(log); toast('Borrado'); onDone(); }}>
        <${Icon} name="trash" size=${18} /> Borrar registro
      </button>
    </div>`;
}

function ExtraSheet({ foods, byId, stock, prefs, date, onDone }) {
  const [modo, setModo] = useState('fuera');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [plato, setPlato] = useState(null); // plato de restaurante elegido (o a medida)

  if (sel) {
    return html`
      <button class="link back" onClick=${() => setSel(null)}>‹ Elegir otro</button>
      <${AmountForm} food=${sel} defaultG=${null} byId=${byId} stockG=${stock[sel.id]?.g || 0}
        onSave=${async r => { await saveLog({ ...r, date, mealId: 'extra', foods }); toast('Registrado ✓'); onDone(); }} />`;
  }
  if (plato) return html`<${plato.por100 ? ProductoFuera : PlatoFuera} plato=${plato} date=${date} onBack=${() => setPlato(null)} onDone=${onDone} />`;

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const res = foods.filter(f => visibleFood(f, prefs) && norm(f.name + ' ' + (f.brand || '')).includes(norm(q))).slice(0, 40);

  return html`
    <${Seg} value=${modo} onChange=${setModo}
      options=${[{ value: 'fuera', label: 'Restaurante / capricho' }, { value: 'biblio', label: 'De mi biblioteca' }]} />
    ${modo === 'biblio' ? html`
      <input class="search" placeholder="Buscar alimento…" value=${q} onInput=${e => setQ(e.target.value)} />
      <div class="list">
        ${res.map(f => html`
          <button class="row" onClick=${() => setSel(f)}>
            <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
            <small class="muted">${fmt(f.n.kcal)} kcal/100 g</small>
          </button>`)}
      </div>` : html`<${BuscarFuera} prefs=${prefs} onElegir=${setPlato} />`}`;
}

// Buscador de comidas fuera del plan. Escribes lo que comiste como te salga ("hamburguesa del bar de mi casa")
// y te propone lo más parecido con un PROMEDIO y su rango. Si no reconoce nada, eliges el tamaño.
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'un', 'una', 'unos', 'unas', 'mi', 'su',
  'bar', 'restaurante', 'casa', 'sitio', 'local', 'tipo', 'algo', 'como', 'muy', 'grande', 'pequena', 'mediana', 'normal', 'cerca', 'al', 'a', 'por']);
const raiz = w => w.replace(/(es|s)$/, '');

// Si no sabes ni qué ponerle: elige el tamaño de la comida
const TAMANOS = [
  { n: 'Comida ligera (ensalada, sándwich, bowl…)', kcal: 450, prot: 20, carb: 45, fat: 20, rango: [300, 600] },
  { n: 'Comida normal de restaurante', kcal: 800, prot: 35, carb: 80, fat: 35, rango: [600, 1000] },
  { n: 'Comida copiosa / menú completo', kcal: 1200, prot: 45, carb: 120, fat: 55, rango: [1000, 1600] },
  { n: 'Tapeo / picoteo para compartir', kcal: 600, prot: 20, carb: 45, fat: 35, rango: [400, 900] },
  { n: 'Postre o dulce', kcal: 350, prot: 5, carb: 45, fat: 16, rango: [200, 500] },
  { n: 'Copa / bebida con alcohol', kcal: 180, prot: 0, carb: 15, fat: 0, rango: [100, 250] },
];

// Rango orientativo: los platos generales varían mucho según el sitio; los de cadena, poco
export const rangoPlato = x => x.rango || (x.m && x.m !== 'Venezuela'
  ? [Math.round(x.kcal * 0.95), Math.round(x.kcal * 1.05)]
  : [Math.round((x.kcal * 0.75) / 10) * 10, Math.round((x.kcal * 1.3) / 10) * 10]);

function BuscarFuera({ prefs, onElegir }) {
  const [q, setQ] = useState('');
  const propios = useLive(() => getSetting('fueraPropios', []), []) || [];
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const todos = [...propios.map(p => ({ ...p, propio: true })), ...COMIDAS_FUERA, ...COMIDAS_FUERA_2].filter(x => !(prefs.excluirMar && x.mar));
  // Palabras que importan de lo que escribiste (sin "del bar de mi casa"), con sus sinónimos ("donas" = donut)
  const originales = norm(q).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !PALABRAS_VACIAS.has(w));
  const palabras = originales.map(raiz);
  const variantes = originales.map(o => {
    const w = raiz(o);
    const sin = SINONIMOS[w] || SINONIMOS[o] || SINONIMOS[o.replace(/s$/, '')] || [];
    return [w, ...sin.map(x => norm(x))];
  });
  const puntuar = x => {
    const t = norm(`${x.n} ${x.m || ''}`);
    return variantes.filter(vs => vs.some(v => t.includes(v))).length;
  };
  const enInternet = useInternet(q);
  const res = palabras.length
    ? todos.map(x => ({ x, p: puntuar(x) })).filter(r => r.p > 0)
      // más palabras coincidentes primero; a igualdad, los tuyos y los generales antes que las cadenas
      .sort((a, b) => b.p - a.p || (!!b.x.propio - !!a.x.propio) || (!!a.x.m - !!b.x.m)).slice(0, 30).map(r => r.x)
    : todos.filter(x => x.propio || !x.m).slice(0, 20);
  const texto = q.trim();
  const elegir = x => onElegir({ ...x, comoLoLlamo: texto && palabras.length ? texto : '' });

  return html`
    <input class="search" placeholder="¿Qué comiste? Ej: hamburguesa del bar, pizza, arepa…" value=${q} onInput=${e => setQ(e.target.value)} />
    ${!texto && html`<p class="muted small">Escríbelo como te salga. No hace falta saber las calorías: la app te da un promedio.</p>`}
    <div class="list">
      ${res.map(x => {
        const [a, b] = rangoPlato(x);
        return html`
          <button class="row" onClick=${() => elegir(x)}>
            <span class="grow">${x.n}${x.m ? html` <span class="tag">${x.m}</span>` : ''}${x.propio ? html` <span class="tag ok">mío</span>` : ''}
              <br /><small class="muted">entre ${fmt(a)} y ${fmt(b)} kcal</small></span>
            <b>≈${fmt(x.kcal)}</b>
          </button>`;
      })}
    </div>
    ${enInternet.length > 0 && html`
      <h4 class="group-title">Productos de supermercado (internet)</h4>
      <div class="list">
        ${enInternet.map(x => html`
          <button class="row" onClick=${() => onElegir(x)}>
            <span class="grow">${x.n}${x.m ? html` <span class="tag">${x.m}</span>` : ''}
              <br /><small class="muted">${fmt(x.n100.kcal)} kcal por 100 g</small></span>
            <${Icon} name="right" size=${16} />
          </button>`)}
      </div>`}
    ${texto && html`
      <div class="card tamanos">
        <p class="small"><b>${res.length ? '¿No es ninguno?' : 'No lo reconozco.'}</b> Elige el tamaño y te pongo un promedio:</p>
        <div class="list">
          ${TAMANOS.map(t => html`
            <button class="row" onClick=${() => onElegir({ ...t, m: '', comoLoLlamo: texto, tamano: true })}>
              <span class="grow">${t.n}<br /><small class="muted">entre ${fmt(t.rango[0])} y ${fmt(t.rango[1])} kcal</small></span>
              <b>≈${fmt(t.kcal)}</b>
            </button>`)}
        </div>
      </div>`}
    <button class="link" onClick=${() => onElegir({ n: texto, m: '', kcal: null, prot: null, carb: null, fat: null, nuevo: true })}>
      Sé las calorías exactas: ponerlas a mano</button>`;
}

// Confirmar: ración y "Registrar". Los números solo si quieres ajustarlos.
function PlatoFuera({ plato, date, onBack, onDone }) {
  const [racion, setRacion] = useState(1);
  const [ajustar, setAjustar] = useState(!!plato.nuevo);
  const [v, setV] = useState({ n: plato.comoLoLlamo || plato.n, kcal: plato.kcal, prot: plato.prot, carb: plato.carb, fat: plato.fat });
  const set = (k, x) => setV(prev => ({ ...prev, [k]: x }));
  const total = k => (v[k] || 0) * racion;
  const [a, b] = plato.nuevo ? [null, null] : rangoPlato(plato);
  const guardar = async () => {
    const n = sumN([{ kcal: total('kcal'), prot: total('prot'), carb: total('carb'), fat: total('fat') }]);
    const base = plato.comoLoLlamo ? `${v.n} (≈ ${plato.tamano ? plato.n.split(' (')[0].toLowerCase() : plato.n})` : v.n;
    const nombre = `${base}${plato.m && !plato.comoLoLlamo ? ` · ${plato.m}` : ''}${racion !== 1 ? ` ×${fmt(racion, 1)}` : ''}`;
    await db.logs.add({ date, mealId: 'extra', name: nombre, n, aprox: true, deducted: [], ts: Date.now() });
    // Lo que creas a mano (o ajustas) se recuerda para la próxima vez
    const cambiado = ['kcal', 'prot', 'carb', 'fat'].some(k => v[k] !== plato[k]);
    if (plato.nuevo || (ajustar && cambiado)) {
      const propios = (await getSetting('fueraPropios', [])).filter(p => p.n !== v.n);
      await setSetting('fueraPropios', [{ n: v.n, m: '', kcal: v.kcal, prot: v.prot || 0, carb: v.carb || 0, fat: v.fat || 0 }, ...propios].slice(0, 60));
    }
    toast('Registrado ✓');
    onDone();
  };
  return html`
    <button class="link back" onClick=${onBack}>‹ Buscar otro</button>
    <div class="form">
      ${plato.nuevo
        ? html`<label>¿Qué comiste?<input value=${v.n} onInput=${e => set('n', e.target.value)} placeholder="Ej: Hamburguesa del bar Pepe" /></label>`
        : html`
          <h4>${v.n}</h4>
          ${plato.comoLoLlamo && html`<p class="muted small">Calculado como: ${plato.n}${plato.m ? ` (${plato.m})` : ''}</p>`}
          <div class="estimacion">
            <b>≈ ${fmt(total('kcal'))} kcal</b>
            <small>entre ${fmt(a * racion)} y ${fmt(b * racion)} kcal · P ${fmt(total('prot'))} · C ${fmt(total('carb'))} · G ${fmt(total('fat'))}</small>
          </div>
          <p class="muted small">Es un promedio: cada sitio lo hace distinto, pero para ver cómo va tu semana es suficiente.</p>`}
      <label>¿Cuánto comiste?
        <div class="chips">${[[0.5, 'La mitad'], [1, '1 ración'], [1.5, 'Ración y media'], [2, '2'], [3, '3']].map(([x, t]) => html`
          <button class=${'chip' + (racion === x ? ' on' : '')} onClick=${() => setRacion(x)}>${t}</button>`)}</div>
      </label>
      ${!plato.nuevo && !ajustar && html`<button class="link" onClick=${() => setAjustar(true)}>Ajustar los números (opcional)</button>`}
      ${ajustar && html`
        <div class="grid2">
          <label>Calorías (1 ración)<${Num} value=${v.kcal} onChange=${x => set('kcal', x)} suffix="kcal" /></label>
          <label>Proteína<${Num} value=${v.prot} onChange=${x => set('prot', x)} suffix="g" /></label>
          <label>Carbohidratos<${Num} value=${v.carb} onChange=${x => set('carb', x)} suffix="g" /></label>
          <label>Grasas<${Num} value=${v.fat} onChange=${x => set('fat', x)} suffix="g" /></label>
        </div>`}
      <button class="btn" disabled=${!v.n || !v.kcal} onClick=${guardar}>Registrar ${v.kcal ? `≈ ${fmt(total('kcal'))} kcal` : ''}</button>
    </div>`;
}

// Agua del día: se suma por vasos
function Agua({ date, prefs }) {
  const ml = useLive(() => getSetting('agua:' + date, 0), [date]) || 0;
  const meta = prefs.aguaObjetivo, vaso = prefs.aguaVaso;
  const set = v => setSetting('agua:' + date, Math.max(0, v));
  return html`
    <section class="card agua">
      <span class="agua-icon"><${Icon} name="drop" size=${20} /></span>
      <div class="grow">
        <div class="bar-top"><span>Agua</span><span>${fmt(ml / 1000, 2)} / ${fmt(meta / 1000, 1)} L</span></div>
        <div class="bar-track"><div class="bar-fill" style=${{ width: Math.min(100, (ml / meta) * 100) + '%', background: 'var(--fat)' }}></div></div>
      </div>
      <button class="icon-btn" aria-label="Quitar un vaso" disabled=${!ml} onClick=${() => set(ml - vaso)}>−</button>
      <button class="icon-btn accent" aria-label="Añadir un vaso" onClick=${() => set(ml + vaso)}><${Icon} name="plus" size=${18} /></button>
    </section>`;
}

// Entreno del día (lo que pegaste en la pestaña Entreno)
function EntrenoHoy({ date, go }) {
  const ws = useLive(() => db.workouts.where('date').equals(date).toArray(), [date]);
  if (!ws) return null;
  if (!ws.length) {
    return date === todayStr() ? html`
      <button class="card entreno-hoy vacio" onClick=${() => go('entreno')}>
        <${Icon} name="pesa" size=${20} /><span class="grow">¿Entrenas hoy? Pega el entreno de tu entrenadora</span><${Icon} name="right" size=${16} />
      </button>` : null;
  }
  const w = ws[0], secs = leer(w).secciones, hechas = secs.filter((s, i) => w.resultados?.[i]?.hecho).length;
  return html`
    <button class="card entreno-hoy" onClick=${() => go('entreno')}>
      <${Icon} name="pesa" size=${20} />
      <span class="grow"><b>Entreno</b> · ${secs.map(s => s.titulo).join(' · ')}<br />
        <small class="muted">${hechas}/${secs.length} secciones hechas</small></span>
      <${Icon} name="right" size=${16} />
    </button>`;
}

// ---------- Registro rápido: copiar ayer, tu día habitual u otro día ----------
// Guarda solo lo necesario para poder repetir un registro otro día
const plantilla = l => ({
  mealId: l.mealId, optionId: l.optionId || null, blockId: l.blockId || null, foodId: l.foodId || null,
  name: l.name, g: l.g || null, crudo: !!l.crudo, aprox: !!l.aprox, n: l.n,
});

function Rapido({ date, logs, ayer, onCopiar, onOtroDia }) {
  const habitual = useLive(() => getSetting('diaHabitual', null), []);
  if (habitual === undefined) return null;
  return html`
    <section class="card rapido">
      <div class="chips wrap">
        ${ayer.length > 0 && html`<button class="chip" onClick=${() => onCopiar('Copiar ayer', ayer.map(plantilla))}>
          <${Icon} name="repeat" size=${14} /> Copiar ayer (${ayer.length})</button>`}
        ${habitual?.length > 0 && html`<button class="chip" onClick=${() => onCopiar('Mi día habitual', habitual)}>
          <${Icon} name="check" size=${14} /> Mi día habitual (${habitual.length})</button>`}
        <button class="chip" onClick=${onOtroDia}>Otro día…</button>
      </div>
      ${logs.length > 0 && html`
        <button class="link small" onClick=${async () => {
          await setSetting('diaHabitual', logs.map(plantilla));
          toast('Guardado como tu día habitual ✓');
        }}>Guardar ${date === todayStr() ? 'hoy' : 'este día'} como mi día habitual</button>`}
    </section>`;
}

function OtroDia({ date, onDone, ...ctx }) {
  const [origen, setOrigen] = useState(addDays(date, -2));
  const ls = useLive(() => db.logs.where('date').equals(origen).toArray(), [origen]);
  return html`
    <label class="form">Copiar lo que comí el día<input type="date" max=${todayStr()} value=${origen} onInput=${e => e.target.value && setOrigen(e.target.value)} /></label>
    ${ls && (ls.length
      ? html`<${CopiarSheet} key=${origen} ...${ctx} date=${date} entradas=${ls.map(plantilla)} onDone=${onDone} />`
      : html`<p class="muted">Ese día no tiene nada registrado.</p>`)}`;
}

// Lista editable: cambias gramos o quitas algo y lo añades todo de una vez
function CopiarSheet({ entradas, plan, foods, byId, stock, date, elecciones, onDone }) {
  const [filas, setFilas] = useState(() => entradas.map(e => ({ ...e, incluir: true })));
  const set = (i, k, v) => setFilas(prev => prev.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const calcular = f => {
    const food = f.foodId && byId[f.foodId];
    if (!food || !f.g) return { food: null, n: f.n, rawG: 0 };
    const rawG = toRaw(food, f.g, f.crudo, byId);
    return { food, rawG, n: nutrFor(food, rawG) };
  };
  const elegidas = filas.filter(f => f.incluir);
  const total = sumN(elegidas.map(f => calcular(f).n));
  const nombreComida = id => (id === 'extra' ? 'Fuera del plan' : plan?.comidas.find(m => m.id === id)?.nombre || id);
  const orden = id => (id === 'extra' ? 99 : plan?.comidas.findIndex(m => m.id === id) ?? 50);
  const indices = filas.map((f, i) => i).sort((a, b) => orden(filas[a].mealId) - orden(filas[b].mealId));

  const anadir = async () => {
    const opciones = { ...(elecciones || {}) };
    for (const f of elegidas) {
      const { food, rawG, n } = calcular(f);
      if (f.optionId) opciones[f.mealId] = f.optionId;
      if (food) {
        await saveLog({ date, mealId: f.mealId, optionId: f.optionId, blockId: f.blockId, food, g: f.g, crudo: f.crudo,
          rawG, n, deduct: (stock[food.id]?.g || 0) > 0, foods });
      } else {
        await db.logs.add({ date, mealId: f.mealId, name: f.name, n: f.n, aprox: f.aprox, deducted: [], ts: Date.now() });
      }
    }
    await setSetting('opciones:' + date, opciones);
    toast(`Añadidos ${elegidas.length} alimentos ✓`);
    onDone();
  };

  let comidaPrevia = null;
  return html`
    <p class="muted small">Cambia los gramos si hoy fue distinto, o quita lo que no comiste.</p>
    <div class="copiar-lista">
      ${indices.map(i => {
        const f = filas[i], cab = f.mealId !== comidaPrevia;
        comidaPrevia = f.mealId;
        return html`
          ${cab && html`<h4 class="group-title">${nombreComida(f.mealId)}</h4>`}
          <div class=${'copiar-fila' + (f.incluir ? '' : ' fuera')}>
            <input type="checkbox" class="caja" checked=${f.incluir} onChange=${e => set(i, 'incluir', e.target.checked)} />
            <span class="grow">${f.name}${f.aprox ? html` <span class="tag">aprox.</span>` : ''}
              <small class="muted"> · ${fmt(calcular(f).n.kcal)} kcal</small></span>
            ${f.foodId && f.g ? html`<div class="copiar-g"><${Num} value=${f.g} onChange=${v => set(i, 'g', v)} suffix=${f.crudo ? 'g cr.' : 'g'} /></div>` : ''}
          </div>`;
      })}
    </div>
    <div class="preview"><${MacroLine} n=${total} /></div>
    <button class="btn" disabled=${!elegidas.length} onClick=${anadir}>Añadir ${elegidas.length} alimento${elegidas.length === 1 ? '' : 's'}</button>`;
}

// Peso de hoy, a mano (hasta que lo traigamos de Whoop)
function PesoHoy({ date }) {
  const w = useLive(() => db.weights.get(date).then(x => x || null), [date]);
  const [kg, setKg] = useState(null);
  const [editando, setEditando] = useState(false);
  if (w === undefined) return null;
  if (w && !editando) return html`
    <button class="card peso-hoy" onClick=${() => { setKg(w.kg); setEditando(true); }}>
      <span class="grow">Peso de hoy</span><b>${fmt(w.kg, 1)} kg</b><small class="muted">editar</small>
    </button>`;
  return html`
    <section class="card peso-hoy">
      <span class="grow">Peso de hoy</span>
      <div class="copiar-g"><${Num} value=${kg} onChange=${setKg} suffix="kg" /></div>
      <button class="btn small" disabled=${!kg} onClick=${async () => {
        await db.weights.put({ date, kg });
        setEditando(false);
        toast('Peso guardado ✓');
      }}>Guardar</button>
    </section>`;
}

// Productos de supermercado de Open Food Facts (gratis): para lo que no está en la lista
function useInternet(q) {
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3 || !navigator.onLine) { setRes([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      try {
        const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=12&lc=es'
          + '&fields=product_name,product_name_es,brands,nutriments,serving_quantity&search_terms=' + encodeURIComponent(t);
        const d = await (await fetch(url)).json();
        const lista = (d.products || []).map(p => {
          const nu = p.nutriments || {};
          const kcal = nu['energy-kcal_100g'];
          const nombre = (p.product_name_es || p.product_name || '').trim();
          if (!nombre || kcal == null) return null;
          return {
            n: nombre, m: (p.brands || '').split(',')[0].trim(), por100: true,
            n100: { kcal: +kcal, prot: +(nu.proteins_100g || 0), carb: +(nu.carbohydrates_100g || 0), fat: +(nu.fat_100g || 0) },
            gramos: p.serving_quantity >= 10 ? Math.round(p.serving_quantity) : 100,
          };
        }).filter(Boolean).slice(0, 8);
        if (vivo) setRes(lista);
      } catch { if (vivo) setRes([]); }
    }, 600);
    return () => { vivo = false; clearTimeout(id); };
  }, [q]);
  return res;
}

// Producto con valores por 100 g: eliges cuántos gramos
function ProductoFuera({ plato, date, onBack, onDone }) {
  const [g, setG] = useState(plato.gramos || 100);
  const t = k => ((plato.n100[k] || 0) * (g || 0)) / 100;
  const n = { kcal: t('kcal'), prot: t('prot'), carb: t('carb'), fat: t('fat') };
  return html`
    <button class="link back" onClick=${onBack}>‹ Buscar otro</button>
    <div class="form">
      <h4>${plato.n}${plato.m ? html` <span class="tag">${plato.m}</span>` : ''}</h4>
      <p class="muted small">Datos de la etiqueta (Open Food Facts): ${fmt(plato.n100.kcal)} kcal por 100 g.</p>
      <label>¿Cuántos gramos?
        <div class="chips">${[25, 50, 100, 150, 200].map(x => html`
          <button class=${'chip' + (g === x ? ' on' : '')} onClick=${() => setG(x)}>${x} g</button>`)}</div>
      </label>
      <${Num} value=${g} onChange=${setG} suffix="g" />
      <div class="estimacion"><b>≈ ${fmt(n.kcal)} kcal</b><small>P ${fmt(n.prot)} · C ${fmt(n.carb)} · G ${fmt(n.fat)}</small></div>
      <button class="btn" disabled=${!g} onClick=${async () => {
        await db.logs.add({ date, mealId: 'extra', name: `${plato.n}${plato.m ? ` · ${plato.m}` : ''} (${fmt(g)} g)`, g, n: sumN([n]), aprox: true, deducted: [], ts: Date.now() });
        toast('Registrado ✓');
        onDone();
      }}>Registrar ≈ ${fmt(n.kcal)} kcal</button>
    </div>`;
}
