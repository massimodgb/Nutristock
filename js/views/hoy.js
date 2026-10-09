// Pantalla "Hoy": resumen del día, avisos y registro de comidas según tu plan.
import { html, useState, useMemo } from '../lib.js';
import {
  db, useLive, getSetting, setSetting, getPrefs, activePlan, stockMap, candidateIds,
  deductStock, restoreStock, deleteLog, round1,
} from '../db.js';
import {
  NUTRS, GROUPS, sumN, planRef, blockRef, mealBlocks, blockFoods, visibleFood, cookFactor, toRaw, nutrFor,
  fmt, fmtG, todayStr, addDays, fmtDate, daysUntil,
} from '../nutri.js';
import { Sheet, Num, Toggle, Seg, Dot, MacroLine, Bar, Empty, Icon, toast } from '../ui.js';
import { PRESETS_FUERA } from '../data/foods.js';
import { leer } from './entreno.js';

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
  const [sheet, setSheet] = useState(null);

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
        ${sheet?.type === 'block' && html`<${BlockSheet} ...${ctx} ...${sheet} onDone=${() => setSheet(null)} />`}
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
  const kcalPct = ref?.kcal ? Math.min(100, (total.kcal / ref.kcal) * 100) : 0;
  const quedan = ref ? ref.kcal - total.kcal : null;
  return html`
    <section class="card resumen tocable" onClick=${onClick}>
      <div class="kcal-ring" style=${{ '--pct': kcalPct }}>
        <div><b>${fmt(total.kcal)}</b><small>${ref ? `de ≈${fmt(ref.kcal)}` : 'kcal'}</small>
          ${quedan != null && html`<small class=${quedan < 0 ? 'over' : ''}>${quedan >= 0 ? `quedan ${fmt(quedan)}` : `+${fmt(-quedan)} de más`}</small>`}</div>
      </div>
      <div class="bars">
        <${Bar} label="Proteína" value=${total.prot} target=${ref?.prot} color="var(--prot)" />
        <${Bar} label="Carbohidratos" value=${total.carb} target=${ref?.carb} color="var(--carb)" />
        <${Bar} label="Grasas" value=${total.fat} target=${ref?.fat} color="var(--fat)" />
        <div class="mini-n">
          <span>Fibra ${fmt(total.fib)} g</span><span>Azúcar ${fmt(total.sug)} g</span>
          <span>Sat. ${fmt(total.sat, 1)} g</span><span>Sal ${fmt(total.salt, 1)} g</span>
        </div>
        <small class="ver-mas">Toca para ver el desglose ›</small>
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
  for (const f of foods) {
    const g = stock[f.id]?.g || 0;
    if (f.minG && g < f.minG) items.push({ tipo: 'warn', txt: `Queda poco: ${f.name} (${fmtG(g, f)})`, to: 'despensa' });
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

// Elegir alimento y cantidad para un bloque del plan
function BlockSheet({ meal, block, optionId, plan, foods, byId, stock, prefs, date, onDone }) {
  const opciones = useMemo(() => {
    const list = [];
    for (const { id, g } of blockFoods(block, plan)) {
      const base = byId[id];
      if (!visibleFood(base, prefs)) continue;
      list.push({ food: base, g, st: stock[id]?.g || 0 });
      for (const p of foods) if (p.genericId === id) list.push({ food: p, g, st: stock[p.id]?.g || 0, branded: true });
    }
    return list.sort((a, b) => (b.st > 0) - (a.st > 0));
  }, [block.id]);
  const [sel, setSel] = useState(null);

  if (sel) {
    return html`
      <button class="link back" onClick=${() => setSel(null)}>‹ Elegir otro</button>
      <${AmountForm} food=${sel.food} defaultG=${sel.g} byId=${byId} foods=${foods} stockG=${sel.st}
        onSave=${async r => {
          await saveLog({ ...r, date, mealId: meal.id, optionId, blockId: block.id, foods });
          toast('Registrado ✓');
          onDone();
        }} />`;
  }
  return html`
    <p class="muted small">${block.texto}${block.nota ? ` · ${block.nota}` : ''}. Pesa en cocido.</p>
    <div class="list">
      ${opciones.map(o => html`
        <button class="row" onClick=${() => setSel(o)}>
          <${Dot} group=${o.food.group} />
          <span class="grow">${o.food.name}${o.food.brand ? html` <small class="muted">${o.food.brand}</small>` : ''}</span>
          ${o.st > 0 && html`<span class="tag ok">en casa ${fmtG(o.st, o.food)}</span>`}
          <small class="muted">${o.g} g</small>
        </button>`)}
    </div>`;
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

async function saveLog({ date, mealId, optionId, blockId, food, g, crudo, rawG, n, deduct, foods }) {
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
  const [modo, setModo] = useState('biblio');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [ap, setAp] = useState({ name: '', kcal: null, prot: null, carb: null, fat: null });

  if (sel) {
    return html`
      <button class="link back" onClick=${() => setSel(null)}>‹ Elegir otro</button>
      <${AmountForm} food=${sel} defaultG=${null} byId=${byId} stockG=${stock[sel.id]?.g || 0}
        onSave=${async r => { await saveLog({ ...r, date, mealId: 'extra', foods }); toast('Registrado ✓'); onDone(); }} />`;
  }
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const res = foods.filter(f => visibleFood(f, prefs) && norm(f.name + ' ' + (f.brand || '')).includes(norm(q))).slice(0, 40);

  return html`
    <${Seg} value=${modo} onChange=${setModo}
      options=${[{ value: 'biblio', label: 'De mi biblioteca' }, { value: 'aprox', label: 'Aproximado' }]} />
    ${modo === 'biblio' ? html`
      <input class="search" placeholder="Buscar alimento…" value=${q} onInput=${e => setQ(e.target.value)} />
      <div class="list">
        ${res.map(f => html`
          <button class="row" onClick=${() => setSel(f)}>
            <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
            <small class="muted">${fmt(f.n.kcal)} kcal/100 g</small>
          </button>`)}
      </div>` : html`
      <p class="muted small">Toca algo parecido y ajusta los números si sabes más. Cuanto más preciso, mejor sale tu resumen semanal.</p>
      <div class="chips wrap">
        ${PRESETS_FUERA.map(p => html`<button class="chip" onClick=${() => setAp({ ...p })}>${p.name}</button>`)}
      </div>
      <div class="form">
        <input placeholder="¿Qué comiste?" value=${ap.name} onInput=${e => setAp({ ...ap, name: e.target.value })} />
        <div class="grid2">
          <label>Calorías<${Num} value=${ap.kcal} onChange=${v => setAp({ ...ap, kcal: v })} suffix="kcal" /></label>
          <label>Proteína<${Num} value=${ap.prot} onChange=${v => setAp({ ...ap, prot: v })} suffix="g" /></label>
          <label>Carbohidratos<${Num} value=${ap.carb} onChange=${v => setAp({ ...ap, carb: v })} suffix="g" /></label>
          <label>Grasas<${Num} value=${ap.fat} onChange=${v => setAp({ ...ap, fat: v })} suffix="g" /></label>
        </div>
        <button class="btn" disabled=${!ap.name || !ap.kcal} onClick=${async () => {
          const n = sumN([{ kcal: ap.kcal, prot: ap.prot || 0, carb: ap.carb || 0, fat: ap.fat || 0 }]);
          await db.logs.add({ date, mealId: 'extra', name: ap.name, n, aprox: true, deducted: [], ts: Date.now() });
          toast('Registrado ✓'); onDone();
        }}>Guardar</button>
      </div>`}`;
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
