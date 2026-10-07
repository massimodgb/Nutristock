// Pantalla "Hoy": resumen del día, avisos y registro de comidas según tu plan.
import { html, useState, useMemo } from '../lib.js';
import {
  db, useLive, getSetting, setSetting, getPrefs, activePlan, stockMap, candidateIds,
  deductStock, restoreStock, deleteLog, round1,
} from '../db.js';
import {
  NUTRS, GROUPS, sumN, planRef, mealBlocks, blockFoods, visibleFood, cookFactor, toRaw, nutrFor,
  fmt, fmtG, todayStr, addDays, fmtDate, daysUntil,
} from '../nutri.js';
import { Sheet, Num, Toggle, Seg, Dot, MacroLine, Bar, Empty, Icon, toast } from '../ui.js';
import { PRESETS_FUERA } from '../data/foods.js';

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

      <${Resumen} total=${total} objetivo=${ref} />
      <${Agua} date=${date} prefs=${prefs} />
      ${isToday && html`<${Avisos} ...${ctx} basicos=${basicos} choice=${choice} logs=${logs} go=${go} />`}

      ${!plan && html`
        <div class="card">
          <p>Todavía no has cargado el plan de tu nutricionista.</p>
          <button class="btn" onClick=${() => go('plan')}>Cargar plan</button>
        </div>`}

      ${plan?.comidas.map(m => html`
        <${MealCard} key=${m.id} meal=${m} ...${ctx} logs=${logs} option=${choice[m.id]}
          ayer=${ayer.filter(l => l.mealId === m.id && l.foodId)}
          onRepetir=${async ayerLogs => {
            const opt = ayerLogs.find(l => l.optionId)?.optionId;
            if (opt) await setChoice(m.id, opt);
            for (const l of ayerLogs) {
              const food = byId[l.foodId];
              if (!food) continue;
              const rawG = toRaw(food, l.g, l.crudo, byId);
              await saveLog({ date, mealId: m.id, optionId: l.optionId, blockId: l.blockId, food, g: l.g, crudo: l.crudo,
                rawG, n: nutrFor(food, rawG), deduct: (stock[food.id]?.g || 0) > 0, foods });
            }
            toast(`${m.nombre}: repetido de ayer ✓`);
          }}
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

      <${Sheet} open=${sheet?.type === 'block'} onClose=${() => setSheet(null)} title=${sheet?.block?.nombre}>
        ${sheet?.type === 'block' && html`<${BlockSheet} ...${ctx} ...${sheet} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'log'} onClose=${() => setSheet(null)} title="Registro">
        ${sheet?.type === 'log' && html`<${LogDetail} log=${sheet.log} byId=${byId} foods=${foods} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'extra'} onClose=${() => setSheet(null)} title="Fuera del plan">
        ${sheet?.type === 'extra' && html`<${ExtraSheet} ...${ctx} onDone=${() => setSheet(null)} />`}
      <//>
    </div>`;
}

function Resumen({ total, objetivo: ref }) {
  const kcalPct = ref?.kcal ? Math.min(100, (total.kcal / ref.kcal) * 100) : 0;
  return html`
    <section class="card resumen">
      <div class="kcal-ring" style=${{ '--pct': kcalPct }}>
        <div><b>${fmt(total.kcal)}</b><small>${ref ? `de ≈${fmt(ref.kcal)}` : 'kcal'}</small></div>
      </div>
      <div class="bars">
        <${Bar} label="Proteína" value=${total.prot} target=${ref?.prot} color="var(--prot)" />
        <${Bar} label="Carbohidratos" value=${total.carb} target=${ref?.carb} color="var(--carb)" />
        <${Bar} label="Grasas" value=${total.fat} target=${ref?.fat} color="var(--fat)" />
        <div class="mini-n">
          <span>Fibra ${fmt(total.fib)} g</span><span>Azúcar ${fmt(total.sug)} g</span>
          <span>Sat. ${fmt(total.sat, 1)} g</span><span>Sal ${fmt(total.salt, 1)} g</span>
        </div>
      </div>
    </section>`;
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
