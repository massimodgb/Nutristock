// Añadir comida a CUALQUIER comida del día (aunque no esté en el plan): una manzana en el almuerzo,
// un cheat meal en la cena o un buffet con varios platos. Todo se busca en un solo sitio y se va sumando
// en una "cesta" con el total abajo. Varios platos se guardan como UNA comida (mismo "grupo").
// El plan no se toca: estos registros no ocupan ningún bloque del plan.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getSetting, deleteLog, round1 } from '../db.js';
import { sumN, nutrFor, toRaw, visibleFood, fmt, todayStr, addDays, cookFactor } from '../nutri.js';
import { medidasDe, nombreMetodo } from '../precision.js';
import { Num, Seg, Dot, Icon, toast } from '../ui.js';
import { COMIDAS_FUERA } from '../data/restaurantes.js';
import { COMIDAS_FUERA_2, SINONIMOS } from '../data/restaurantes2.js';
import { PLATOS_BUFFET, TAMANOS_PLATO, CATS_BUFFET } from '../data/platos-buffet.js';
import { saveLog, cambiarGramosLog } from './hoy.js';

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'un', 'una', 'unos', 'unas', 'mi', 'su', 'al', 'a', 'por',
  'bar', 'restaurante', 'casa', 'sitio', 'local', 'tipo', 'algo', 'como', 'muy', 'plato', 'racion', 'buffet']);
const raiz = w => w.replace(/(es|s)$/, '');
const palabrasDe = q => norm(q).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !VACIAS.has(w));
// Cada palabra que escribes, con sus sinónimos (dona = donut, papa = patata…)
const variantes = q => palabrasDe(q).map(o => { const w = raiz(o); return [w, ...(SINONIMOS[w] || SINONIMOS[o] || []).map(norm)]; });
const coincide = (texto, vs) => vs.filter(v => v.some(x => norm(texto).includes(x))).length;

// Rango orientativo de un plato aproximado (los de cadena varían poco; los generales, mucho)
export const rangoDe = x => x.rango || (x.m && x.m !== 'Venezuela'
  ? [x.kcal * 0.95, x.kcal * 1.05] : [x.kcal * 0.75, x.kcal * 1.3]);

// Nutrientes de una línea de la cesta
export function calcularLinea(it, byId) {
  if (it.tipo === 'food') {
    const g = it.porUnidad ? it.n * it.food.unitG : it.g;
    const rawG = it.crudo ? g || 0 : it.factor ? (g || 0) / it.factor : toRaw(it.food, g || 0, false, byId);
    const n = nutrFor(it.food, rawG);
    return { n, g, rawG, aprox: false, rango: [n.kcal, n.kcal] };
  }
  if (it.tipo === 'web') {
    const f = (it.g || 0) / 100;
    const n = sumN([{ kcal: it.p.n100.kcal * f, prot: it.p.n100.prot * f, carb: it.p.n100.carb * f, fat: it.p.n100.fat * f }]);
    return { n, g: it.g, aprox: true, rango: [n.kcal * 0.9, n.kcal * 1.1] };
  }
  const tam = TAMANOS_PLATO.find(t => t.id === it.tam) || TAMANOS_PLATO[1];
  const f = (it.p.buffet ? tam.f : 1) * (it.n || 0);
  const n = sumN([{ kcal: it.p.kcal * f, prot: it.p.prot * f, carb: it.p.carb * f, fat: it.p.fat * f }]);
  const [a, b] = rangoDe(it.p);
  return { n, aprox: true, rango: [a * f, b * f] };
}

const nombreLinea = it => {
  if (it.tipo === 'food') return it.food.name + (it.food.brand ? ` · ${it.food.brand}` : '');
  if (it.tipo === 'web') return `${it.p.n}${it.p.m ? ` · ${it.p.m}` : ''} (${fmt(it.g)} g)`;
  const tam = TAMANOS_PLATO.find(t => t.id === it.tam);
  return it.p.buffet
    ? `${it.p.n}${it.n !== 1 ? ` ×${fmt(it.n, 1)}` : ''} (${(tam?.nombre || 'Mediano').toLowerCase()})`
    : `${it.p.n}${it.p.m ? ` · ${it.p.m}` : ''}${it.n !== 1 ? ` ×${fmt(it.n, 1)}` : ''}`;
};

// Gramos por defecto al añadir un alimento: lo que pide el plan si es una pieza de fruta, o 100 g
const gramosPorDefecto = f => (f.group === 'fruta' ? 150 : f.group === 'verdura' ? 200 : 100);

export function comidasDelDia(plan) {
  return [...(plan?.comidas || []).map(m => ({ id: m.id, nombre: m.nombre })), { id: 'extra', nombre: 'Extra' }];
}

// ---------- La pantalla ----------
export function AnadirComida({ plan, foods, byId, stock, prefs, date, mealId: mealInicial = 'extra', grupo: grupoExistente, grupoNombre: nombreExistente, onDone }) {
  const [mealId, setMealId] = useState(mealInicial);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [cesta, setCesta] = useState([]);
  const [nombre, setNombre] = useState(nombreExistente || '');
  const [guardando, setGuardando] = useState(false);
  const propios = useLive(() => getSetting('fueraPropios', []), []) || [];
  const coccion = useLive(() => getSetting('coccion', {}), []) || {};
  const recientes = useLive(() => db.logs.where('date').aboveOrEqual(addDays(todayStr(), -30)).toArray(), []) || [];
  const enInternet = useInternet(q);

  const comidas = comidasDelDia(plan);
  const vs = variantes(q);
  const texto = q.trim();
  // Resultados
  const alimentos = texto.length < 2 ? [] : foods
    .filter(f => visibleFood(f, prefs) && vs.length && vs.every(v => v.some(x => norm(`${f.name} ${f.brand || ''}`).includes(x))))
    .sort((a, b) => ((stock[b.id]?.g || 0) > 0) - ((stock[a.id]?.g || 0) > 0) || (a.source === 'base') - (b.source === 'base'))
    .slice(0, 12);
  const todosPlatos = [...propios.map(p => ({ ...p, propio: true })), ...PLATOS_BUFFET, ...COMIDAS_FUERA, ...COMIDAS_FUERA_2]
    .filter(x => !(prefs.excluirMar && x.mar));
  const platos = texto.length < 2 ? [] : todosPlatos
    .map(x => ({ x, p: coincide(`${x.n} ${x.m || ''}`, vs) })).filter(r => r.p > 0)
    .sort((a, b) => b.p - a.p || (!!b.x.buffet - !!a.x.buffet) || (!!a.x.m - !!b.x.m)).slice(0, 15).map(r => r.x);
  // Frecuentes (tus alimentos de las últimas 4 semanas)
  const cuenta = {};
  for (const l of recientes) if (l.foodId && byId[l.foodId]) cuenta[l.foodId] = (cuenta[l.foodId] || 0) + 1;
  const frecuentes = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => byId[id]).filter(f => visibleFood(f, prefs));

  const anadir = it => {
    setCesta(c => [...c, { ...it, key: Date.now() + Math.random() }]);
    setQ(''); // listo para buscar lo siguiente (y la cesta queda a la vista)
    if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
  };
  // Formas de cocinarlo: la de la tabla y las que hayas medido tú (se propone la última que usaste)
  const metodosDe = f => {
    if (f.source === 'receta') return null; // un táper ya está cocinado
    const tabla = cookFactor(f, byId), { propias, base } = medidasDe(f, coccion);
    const list = [...(tabla != null ? [{ id: '', label: `Cocinado (tabla ×${fmt(tabla, 2)})`, factor: null }] : []),
      ...Object.entries(propias).map(([m, x]) => ({ id: m, label: `${nombreMetodo(m)} ×${fmt(x, 2)}`, factor: x })),
      ...Object.entries(base).filter(([m]) => !propias[m]).map(([m, x]) => ({ id: m, label: `${nombreMetodo(m)} ×${fmt(x, 2)} (de ${byId[f.genericId]?.name || 'su base'})`, factor: x }))];
    return list.length ? [...list, { id: 'crudo', label: 'Pesado en crudo', factor: null }] : null;
  };
  const addFood = f => {
    const metodos = metodosDe(f), ult = medidasDe(f, coccion).ultimo, m = ult && metodos?.find(x => x.id === ult);
    anadir({ tipo: 'food', food: f, porUnidad: !!f.unitG, n: 1, g: gramosPorDefecto(f), descontar: (stock[f.id]?.g || 0) > 0,
      metodos, metodo: m?.id || null, factor: m?.factor || null });
  };
  const addPlato = p => anadir({ tipo: 'plato', p, n: 1, tam: 'mediano' });
  const addWeb = p => anadir({ tipo: 'web', p, g: p.gramos || 100 });
  const cambiar = (key, cambios) => setCesta(c => c.map(x => (x.key === key ? { ...x, ...cambios } : x)));
  const quitar = key => setCesta(c => c.filter(x => x.key !== key));

  const calcs = cesta.map(it => calcularLinea(it, byId));
  const total = sumN(calcs.map(c => c.n));
  const aprox = calcs.some(c => c.aprox);
  const rango = calcs.reduce((r, c) => [r[0] + c.rango[0], r[1] + c.rango[1]], [0, 0]);
  const nombreComida = comidas.find(c => c.id === mealId)?.nombre || 'Extra';
  const varios = cesta.length > 1 || grupoExistente;

  const registrar = async () => {
    if (!cesta.length || guardando) return;
    setGuardando(true);
    const grupo = grupoExistente || (cesta.length > 1 ? 'g' + Date.now().toString(36) : null);
    const gNombre = grupo ? (nombre.trim() || nombreExistente || 'Comida libre') : null;
    const extra = grupo ? { grupo, grupoNombre: gNombre } : {};
    try {
      await db.transaction('rw', db.lots, db.logs, async () => {
        for (let i = 0; i < cesta.length; i++) {
          const it = cesta[i], c = calcs[i];
          if (it.tipo === 'food') {
            await saveLog({ date, mealId, food: it.food, g: round1(c.g), crudo: !!it.crudo, rawG: c.rawG, n: c.n, deduct: !!it.descontar, foods,
              metodo: it.metodo, factor: it.factor, extra });
          } else {
            const nr = Object.fromEntries(Object.entries(c.n).map(([k, v]) => [k, round1(v)]));
            await db.logs.add({ date, mealId, optionId: null, blockId: null, name: nombreLinea(it), n: nr, aprox: true, deducted: [],
              ts: Date.now(), ...extra, ...(it.tipo === 'web' ? { g: it.g } : { racion: { p: it.p, n: it.n, tam: it.tam } }) });
          }
        }
      });
      toast(`Registrado en ${nombreComida} ✓ ${aprox ? '≈ ' : ''}${fmt(total.kcal)} kcal`);
      onDone?.();
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar: ' + (e.message || e));
      setGuardando(false);
    }
  };

  return html`
    <div class="anadir">
      <div class="anadir-comida">
        <small class="muted">¿En qué comida?</small>
        <div class="chips">${comidas.map(c => html`
          <button class=${'chip' + (mealId === c.id ? ' on' : '')} onClick=${() => setMealId(c.id)}>${c.nombre}</button>`)}</div>
      </div>

      <div class="anadir-busca">
        <${Icon} name="plus" size=${18} />
        <input type="search" placeholder="Busca: manzana, arroz frito, hamburguesa…" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Buscar alimento o plato" />
      </div>

      ${cesta.length > 0 && html`
        <div class="cesta" aria-live="polite">
          <h4>${grupoExistente ? 'Añadir a esta comida' : 'Vas a registrar'}</h4>
          ${varios && html`<input class="cesta-nombre" placeholder="Nombre (opcional): buffet asiático, cena con amigos…" value=${nombre} onInput=${e => setNombre(e.target.value)} />`}
          ${cesta.map((it, i) => html`<${LineaCesta} key=${it.key} it=${it} c=${calcs[i]} stock=${stock} onCambiar=${x => cambiar(it.key, x)} onQuitar=${() => quitar(it.key)} />`)}
        </div>`}

      ${!texto && html`
        ${frecuentes.length > 0 && html`
          <div class="anadir-sec">
            <h4>Tus alimentos frecuentes</h4>
            <div class="chips wrap">${frecuentes.map(f => html`<button class="chip" onClick=${() => addFood(f)}><${Dot} group=${f.group} /> ${f.name}</button>`)}</div>
          </div>`}
        <div class="anadir-sec">
          <h4>Platos de buffet y restaurante</h4>
          <small class="muted">Toca un plato para añadirlo; luego eliges tamaño y cuántos.</small>
          <div class="chips">${CATS_BUFFET.map(c => html`<button class=${'chip' + ((cat || CATS_BUFFET[0]) === c ? ' on' : '')} onClick=${() => setCat(c)}>${c}</button>`)}</div>
          <div class="platos-grid">
            ${PLATOS_BUFFET.filter(p => p.cat === (cat || CATS_BUFFET[0]) && !(prefs.excluirMar && p.mar)).map(p => html`
              <button class="plato-btn" onClick=${() => addPlato(p)}>
                <span>${p.n}</span><small>≈ ${fmt(p.kcal)} kcal</small>
              </button>`)}
          </div>
        </div>`}

      ${texto && html`
        ${alimentos.length > 0 && html`
          <div class="anadir-sec"><h4>Tus alimentos</h4>
            <div class="list">${alimentos.map(f => html`
              <button class="row" onClick=${() => addFood(f)}>
                <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}
                  ${(stock[f.id]?.g || 0) > 0 ? html` <span class="tag ok">en casa</span>` : ''}</span>
                <span class="mas-btn"><${Icon} name="plus" size=${18} /></span>
              </button>`)}</div></div>`}
        ${platos.length > 0 && html`
          <div class="anadir-sec"><h4>Platos (aproximados)</h4>
            <div class="list">${platos.map(p => html`
              <button class="row" onClick=${() => addPlato(p)}>
                <span class="grow">${p.n}${p.m ? html` <span class="tag">${p.m}</span>` : ''}${p.propio ? html` <span class="tag ok">mío</span>` : ''}
                  <br /><small class="muted">≈ ${fmt(p.kcal)} kcal ${p.buffet ? 'el plato mediano' : 'la ración'}</small></span>
                <span class="mas-btn"><${Icon} name="plus" size=${18} /></span>
              </button>`)}</div></div>`}
        ${enInternet.length > 0 && html`
          <div class="anadir-sec"><h4>Supermercado (internet)</h4>
            <div class="list">${enInternet.map(p => html`
              <button class="row" onClick=${() => addWeb(p)}>
                <span class="grow">${p.n}${p.m ? html` <span class="tag">${p.m}</span>` : ''}<br /><small class="muted">${fmt(p.n100.kcal)} kcal por 100 g</small></span>
                <span class="mas-btn"><${Icon} name="plus" size=${18} /></span>
              </button>`)}</div></div>`}
        ${!alimentos.length && !platos.length && !enInternet.length && html`
          <p class="muted small">No encuentro "${texto}". Prueba con otra palabra (por ejemplo, "arroz" o "pollo") o elige un plato de buffet por tipo.</p>`}`}

      ${cesta.length > 0 && html`
        <div class="cesta-total">
          <div class="grow">
            <b>${aprox ? '≈ ' : ''}${fmt(total.kcal)} kcal</b>
            <small>${aprox ? `entre ${fmt(rango[0])} y ${fmt(rango[1])} · ` : ''}P ${fmt(total.prot)} · C ${fmt(total.carb)} · G ${fmt(total.fat)}</small>
          </div>
          <button class="btn small" disabled=${guardando} onClick=${registrar}>Registrar en ${nombreComida}</button>
        </div>`}
    </div>`;
}

// Una línea de la cesta con su cantidad (unidades, gramos o tamaño de plato)
function LineaCesta({ it, c, stock, onCambiar, onQuitar }) {
  const stepper = (valor, poner, paso = 1, min = 0.5) => html`
    <div class="stepper peq">
      <button class="icon-btn suave" aria-label="Menos" disabled=${valor <= min} onClick=${() => poner(Math.max(min, Math.round((valor - paso) * 10) / 10))}>−</button>
      <b>${fmt(valor, 1)}</b>
      <button class="icon-btn suave" aria-label="Más" onClick=${() => poner(Math.round((valor + paso) * 10) / 10)}>+</button>
    </div>`;
  return html`
    <div class="linea-cesta">
      <div class="lc-top">
        <span class="grow"><b>${it.tipo === 'food' ? it.food.name : it.p.n}</b>
          <small class="muted">${c.aprox ? '≈ ' : ''}${fmt(c.n.kcal)} kcal · P ${fmt(c.n.prot)} · C ${fmt(c.n.carb)} · G ${fmt(c.n.fat)}</small></span>
        <button class="icon-btn" aria-label="Quitar" onClick=${onQuitar}><${Icon} name="trash" size=${16} /></button>
      </div>
      ${it.tipo === 'food' && html`
        <div class="lc-cant">
          ${it.porUnidad ? html`
            ${stepper(it.n, n => onCambiar({ n }), 1, 1)}<span class="muted small">${it.food.unitName || 'unidad'}${it.n !== 1 ? 's' : ''} · ${fmt(c.g)} g</span>
            <button class="link small" onClick=${() => onCambiar({ porUnidad: false, g: c.g })}>en gramos</button>` : html`
            <div class="lc-g"><${Num} value=${it.g} onChange=${g => onCambiar({ g: g || 0 })} suffix="g" /></div>
            <div class="chips">${[50, 100, 150, 200].map(g => html`<button class=${'chip' + (it.g === g ? ' on' : '')} onClick=${() => onCambiar({ g })}>${g}</button>`)}</div>`}
        </div>
        ${it.metodos && html`
          <select class="lc-metodo" aria-label="Cómo lo cocinaste" value=${it.crudo ? 'crudo' : it.metodo || ''}
            onChange=${e => { const m = it.metodos.find(x => x.id === e.target.value); onCambiar({ crudo: m.id === 'crudo', metodo: m.id && m.id !== 'crudo' ? m.id : null, factor: m.factor }); }}>
            ${it.metodos.map(m => html`<option value=${m.id}>${m.label}</option>`)}
          </select>`}
        ${(stock[it.food.id]?.g || 0) > 0 && html`
          <label class="lc-desc"><input type="checkbox" checked=${it.descontar} onChange=${e => onCambiar({ descontar: e.target.checked })} />
            Descontar de la despensa</label>`}`}
      ${it.tipo === 'plato' && html`
        <div class="lc-cant">
          ${it.p.buffet && html`<${Seg} value=${it.tam} onChange=${tam => onCambiar({ tam })} options=${TAMANOS_PLATO.map(t => ({ value: t.id, label: t.nombre }))} />`}
          ${stepper(it.n, n => onCambiar({ n }))}<span class="muted small">${it.p.buffet ? (it.n === 1 ? 'plato' : 'platos') : (it.n === 1 ? 'ración' : 'raciones')}</span>
        </div>`}
      ${it.tipo === 'web' && html`
        <div class="lc-cant"><div class="lc-g"><${Num} value=${it.g} onChange=${g => onCambiar({ g: g || 0 })} suffix="g" /></div></div>`}
    </div>`;
}

// ---------- Ver y editar una comida de varios platos (un "grupo") ----------
export function GrupoDetalle({ logs, byId, foods, onAnadir, onDone }) {
  const nombre = logs[0]?.grupoNombre || 'Comida libre';
  const total = sumN(logs.map(l => l.n));
  const aprox = logs.some(l => l.aprox);
  const cambiarRaciones = async (l, n) => {
    if (!l.racion || n <= 0) return;
    const it = { tipo: 'plato', p: l.racion.p, n, tam: l.racion.tam };
    const c = calcularLinea(it, byId);
    await db.logs.update(l.id, { n: Object.fromEntries(Object.entries(c.n).map(([k, v]) => [k, round1(v)])), name: nombreLinea(it), racion: { ...l.racion, n } });
  };
  const cambiarGramos = async (l, g) => {
    const food = byId[l.foodId];
    if (!food || !g) return;
    await cambiarGramosLog(l, g, food, foods, byId);
  };
  const renombrar = async v => { for (const l of logs) await db.logs.update(l.id, { grupoNombre: v.trim() || 'Comida libre' }); };
  return html`
    <div class="form">
      <input value=${nombre} onChange=${e => renombrar(e.target.value)} aria-label="Nombre de la comida" />
      <div class="cesta-total estatico">
        <div class="grow"><b>${aprox ? '≈ ' : ''}${fmt(total.kcal)} kcal</b>
          <small>${platosDe(logs)} ${platosDe(logs) === 1 ? 'plato' : 'platos'} · P ${fmt(total.prot)} · C ${fmt(total.carb)} · G ${fmt(total.fat)}</small></div>
      </div>
      ${aprox && html`<p class="muted small">Es una estimación: cada sitio sirve distinto. Para ver cómo va tu semana es suficiente.</p>`}
      ${logs.map(l => html`
        <div class="linea-cesta" key=${l.id}>
          <div class="lc-top">
            <span class="grow"><b>${l.racion ? l.racion.p.n : l.name}</b>
              <small class="muted">${l.aprox ? '≈ ' : ''}${fmt(l.n.kcal)} kcal${l.g ? ` · ${fmt(l.g)} g` : ''}</small></span>
            <button class="icon-btn" aria-label="Quitar" onClick=${async () => { await deleteLog(l); toast('Quitado'); if (logs.length === 1) onDone(); }}><${Icon} name="trash" size=${16} /></button>
          </div>
          ${l.racion && html`
            <div class="lc-cant">
              <div class="stepper peq">
                <button class="icon-btn suave" aria-label="Menos" disabled=${l.racion.n <= 0.5} onClick=${() => cambiarRaciones(l, Math.max(0.5, l.racion.n - 1))}>−</button>
                <b>${fmt(l.racion.n, 1)}</b>
                <button class="icon-btn suave" aria-label="Más" onClick=${() => cambiarRaciones(l, l.racion.n + 1)}>+</button>
              </div>
              <span class="muted small">${l.racion.p.buffet ? `plato ${(TAMANOS_PLATO.find(t => t.id === l.racion.tam)?.nombre || '').toLowerCase()}` : 'ración'}</span>
            </div>`}
          ${l.foodId && byId[l.foodId] && html`
            <${GramosEditables} g=${l.g} onGuardar=${g => cambiarGramos(l, g)} />`}
        </div>`)}
      <button class="btn secondary" onClick=${onAnadir}><${Icon} name="plus" size=${18} /> Añadir más platos</button>
      <button class="btn danger" onClick=${async () => {
        if (!confirm(`¿Borrar "${nombre}" entera?`)) return;
        for (const l of logs) await deleteLog(l);
        toast('Comida borrada'); onDone();
      }}><${Icon} name="trash" size=${18} /> Borrar toda la comida</button>
    </div>`;
}

// Gramos de un alimento ya registrado: se guardan al pulsar "Guardar" (no a cada número que tecleas)
function GramosEditables({ g: inicial, onGuardar }) {
  const [g, setG] = useState(inicial);
  return html`
    <div class="lc-cant">
      <div class="lc-g"><${Num} value=${g} onChange=${setG} suffix="g" /></div>
      ${g && g !== inicial && html`<button class="btn small" onClick=${async () => { await onGuardar(g); toast('Actualizado ✓'); }}>Guardar</button>`}
    </div>`;
}

// Cuántos platos son de verdad (2 platos de arroz cuentan como 2)
export const platosDe = logs => Math.round(logs.reduce((t, l) => t + (l.racion?.n || 1), 0));

// Agrupa los registros: los de una misma comida libre van juntos
export function agrupar(logs) {
  const out = [], vistos = {};
  for (const l of [...logs].sort((a, b) => (a.ts || 0) - (b.ts || 0))) {
    if (l.grupo) {
      if (!vistos[l.grupo]) { vistos[l.grupo] = { tipo: 'grupo', grupo: l.grupo, nombre: l.grupoNombre || 'Comida libre', logs: [] }; out.push(vistos[l.grupo]); }
      vistos[l.grupo].logs.push(l);
    } else out.push({ tipo: 'log', log: l });
  }
  return out;
}

// Productos de supermercado de Open Food Facts (gratis), con una pequeña espera mientras escribes
function useInternet(q) {
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3 || !navigator.onLine) { setRes([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      try {
        const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10&lc=es'
          + '&fields=product_name,product_name_es,brands,nutriments,serving_quantity&search_terms=' + encodeURIComponent(t);
        const d = await (await fetch(url)).json();
        const lista = (d.products || []).map(p => {
          const nu = p.nutriments || {};
          const kcal = nu['energy-kcal_100g'];
          const nombre = (p.product_name_es || p.product_name || '').trim();
          if (!nombre || kcal == null) return null;
          return { n: nombre, m: (p.brands || '').split(',')[0].trim(), n100: { kcal: +kcal, prot: +(nu.proteins_100g || 0), carb: +(nu.carbohydrates_100g || 0), fat: +(nu.fat_100g || 0) },
            gramos: p.serving_quantity >= 10 ? Math.round(p.serving_quantity) : 100 };
        }).filter(Boolean).slice(0, 6);
        if (vivo) setRes(lista);
      } catch { if (vivo) setRes([]); }
    }, 700);
    return () => { vivo = false; clearTimeout(id); };
  }, [q]);
  return res;
}
