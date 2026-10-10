// Despensa: stock por envases (comida y cosas de casa), básicos y lista de la compra.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, resumenStock, slug, activePlan } from '../db.js';
import { GROUPS, daysUntil, fmt, fmtG, todayStr, addDays } from '../nutri.js';
import { necesidadesPlan, DIAS_HISTORIAL } from '../compra-plan.js';
import { Sheet, Seg, Dot, Empty, Icon, toast } from '../ui.js';
import { Escaner, resolverCodigo, FoodForm, NoEncontrado, PegarEtiqueta } from './biblioteca.js';
import { CantidadStock, FichaStock, textoStock, estadoCompra, plural, nombreEnvase } from './stock.js';

export function Despensa({ go }) {
  const [tab, setTab] = useState('stock');
  const foods = useLive(() => db.foods.toArray(), []);
  const lots = useLive(() => db.lots.toArray(), []);
  const basicos = useLive(() => db.basicos.toArray(), []);
  const shopping = useLive(() => db.shopping.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [sheet, setSheet] = useState(null);

  if ([foods, lots, basicos, shopping, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const ctx = { foods, byId, lots, basicos, shopping, prefs, setSheet };
  const enCompra = foods.filter(f => estadoCompra(f, lots).necesita).length + basicos.filter(b => b.status !== 'tengo').length
    + shopping.filter(s => !s.done).length;

  return html`
    <div class="page">
      <header class="top">
        <h1>Despensa</h1>
        <button class="btn small secondary" onClick=${() => go('biblioteca')}>Productos</button>
        <button class="icon-btn accent" onClick=${() => setSheet({ type: 'add' })} aria-label="Añadir compra"><${Icon} name="plus" /></button>
      </header>
      <${Seg} value=${tab} onChange=${setTab} options=${[
        { value: 'stock', label: 'Lo que tengo' }, { value: 'basicos', label: 'Básicos' },
        { value: 'compra', label: `Compra${enCompra ? ` (${enCompra})` : ''}` }]} />
      ${tab === 'stock' && html`<${Stock} ...${ctx} />`}
      ${tab === 'basicos' && html`<${Basicos} ...${ctx} />`}
      ${tab === 'compra' && html`<${Compra} ...${ctx} />`}

      <${Sheet} open=${sheet?.type === 'add'} onClose=${() => setSheet(null)} title="Añadir a la despensa">
        ${sheet?.type === 'add' && html`<${AddStock} ...${ctx} food=${sheet.food} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'food'} onClose=${() => setSheet(null)} title=${sheet?.food?.name}>
        ${sheet?.type === 'food' && html`<${FichaStock} food=${byId[sheet.food.id] || sheet.food} lots=${lots} onAdd=${() => setSheet({ type: 'add', food: byId[sheet.food.id] || sheet.food })} onQuitar=${() => setSheet(null)} />`}
      <//>
    </div>`;
}

function Stock({ foods, lots, setSheet }) {
  const conStock = new Set(lots.filter(l => l.g > 0).map(l => l.foodId));
  // Lo que tienes + lo que vigilas (con aviso) aunque se haya acabado
  const items = foods.filter(f => conStock.has(f.id));
  // Lo que se acabó pero vigilas para la compra va aparte, al final
  const acabados = foods.filter(f => !conStock.has(f.id) && (f.aviso != null || f.minG));
  if (!items.length && !acabados.length) return html`
    <${Empty}>
      Tu despensa está vacía.<br />Toca <b>+</b> para añadir tu compra: escanea los productos o elígelos de tu biblioteca.
      También puedes añadir cosas de casa (toallitas, papel, detergente…).
    <//>`;
  const grupos = Object.keys(GROUPS).filter(g => items.some(f => (f.group || 'otro') === g));
  return html`${grupos.map(g => html`
    <section class="card list">
      <h3 class="group-title"><${Dot} group=${g} /> ${GROUPS[g].name}</h3>
      ${items.filter(f => (f.group || 'otro') === g).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
        const r = resumenStock(f, lots);
        const exp = r.mios.map(l => l.expiry).filter(Boolean).sort()[0];
        const d = exp ? daysUntil(exp) : null;
        const compra = estadoCompra(f, lots).necesita;
        return html`
          <button class="row" key=${f.id} onClick=${() => setSheet({ type: 'food', food: f })}>
            <span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}
              ${d != null && d <= 3 && html` <span class=${'tag ' + (d < 0 ? 'bad' : 'warn')}>${d < 0 ? 'caducado' : d === 0 ? 'caduca hoy' : `${d} d`}</span>`}
              ${compra && html` <span class="tag warn">a la compra</span>`}
              <br /><small class=${r.mios.length ? '' : 'muted'}>${textoStock(f, lots)}</small></span>
            <${Icon} name="right" size=${16} />
          </button>`;
      })}
    </section>`)}
    ${acabados.length > 0 && html`
      <details class="card acabados">
        <summary>Se acabaron (${acabados.length}) · están en tu lista de la compra</summary>
        <div class="list">${acabados.map(f => html`
          <button class="row" onClick=${() => setSheet({ type: 'food', food: f })}>
            <span class="grow">${f.name}</span><small class="muted">no queda</small>
          </button>`)}</div>
      </details>`}`;
}

function AddStock({ foods, prefs, food: inicial, onDone }) {
  const [food, setFood] = useState(inicial || null);
  const [modo, setModo] = useState(inicial ? 'cantidad' : 'buscar'); // buscar | escanear | cargando | noencontrado | pegar | nuevo | cantidad
  const [nuevo, setNuevo] = useState(null);
  const [q, setQ] = useState('');

  const buscar = async code => {
    setNuevo({ code });
    setModo('cargando');
    const r = await resolverCodigo(code, foods);
    setNuevo(r);
    if (r.food) { setFood(r.food); setModo('cantidad'); toast(r.food.name); }
    else setModo(r.estado === 'off' ? 'nuevo' : 'noencontrado');
  };
  if (modo === 'escanear') return html`<${Escaner} onCode=${buscar} />`;
  if (modo === 'cargando') return html`<p class="muted">Código leído: <b>${nuevo?.code || ''}</b>. Buscando el producto…</p>`;
  if (modo === 'noencontrado') {
    return html`<${NoEncontrado} r=${nuevo}
      onPegar=${() => setModo('pegar')}
      onMano=${() => { setNuevo({ ...nuevo, aviso: '' }); setModo('nuevo'); }}
      onReintentar=${() => buscar(nuevo.code)}
      onOtro=${() => setModo('escanear')} />`;
  }
  if (modo === 'pegar') {
    return html`<${PegarEtiqueta} onDone=${n => {
      setNuevo({ ...nuevo, draft: { ...nuevo.draft, n, source: 'livetext' }, aviso: 'Revisa que los números coincidan con la etiqueta.' });
      setModo('nuevo');
    }} />`;
  }
  // Producto nuevo: primero su ficha y, al guardarla, cuánto tienes
  if (modo === 'nuevo') {
    return html`<${FoodForm} initial=${nuevo?.draft || { n: {} }} aviso=${nuevo?.aviso} foods=${foods}
      onSaved=${f => { setFood(f); setModo('cantidad'); }} onDone=${() => {}} />`;
  }
  if (modo === 'cantidad' && food) return html`<${CantidadStock} food=${food} onDone=${onDone} />`;

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const res = foods.filter(f => (f.group === 'hogar' || !(prefs.excluirMar && f.mar)) && norm(`${f.name} ${f.brand || ''}`).includes(norm(q)))
    .sort((a, b) => (a.source === 'base') - (b.source === 'base')).slice(0, 40);
  return html`
    <button class="btn" onClick=${() => setModo('escanear')}><${Icon} name="scan" size=${18} /> Escanear código de barras</button>
    <input class="search" placeholder="…o busca en tu biblioteca" value=${q} onInput=${e => setQ(e.target.value)} />
    <div class="list">
      ${res.map(f => html`
        <button class="row" onClick=${() => { setFood(f); setModo('cantidad'); }}>
          <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
        </button>`)}
    </div>
    <button class="btn secondary" onClick=${() => { setNuevo({ draft: { n: {}, name: q } }); setModo('nuevo'); }}>
      <${Icon} name="pen" size=${18} /> Crear producto nuevo (comida o de casa)</button>`;
}

const ESTADOS = [{ value: 'tengo', label: 'Tengo' }, { value: 'poco', label: 'Poco' }, { value: 'no', label: 'No' }];

function Basicos({ basicos }) {
  const [nuevo, setNuevo] = useState('');
  const orden = { no: 0, poco: 1, tengo: 2 };
  const add = async () => {
    const name = nuevo.trim();
    if (!name) return;
    await db.basicos.put({ id: slug(name), name, status: 'tengo' });
    setNuevo('');
  };
  return html`
    <p class="muted small">Especias, salsas y cosas que no merece la pena contar. Para contar paquetes (toallitas, papel…), créalas como producto "de casa" con +.</p>
    <div class="inline">
      <input placeholder="Añadir (ej: Curry)" value=${nuevo} onInput=${e => setNuevo(e.target.value)} onKeyDown=${e => e.key === 'Enter' && add()} />
      <button class="btn small" onClick=${add}>Añadir</button>
    </div>
    <section class="card list">
      ${[...basicos].sort((a, b) => orden[a.status] - orden[b.status] || a.name.localeCompare(b.name)).map(b => html`
        <div class="row basico" key=${b.id}>
          <span class="grow">${b.name}</span>
          <${Seg} options=${ESTADOS} value=${b.status} onChange=${s => db.basicos.update(b.id, { status: s })} />
          <button class="icon-btn" aria-label="Quitar" onClick=${() => confirm(`¿Quitar ${b.name}?`) && db.basicos.delete(b.id)}><${Icon} name="trash" size=${16} /></button>
        </div>`)}
    </section>`;
}

// Compra para los próximos días según tu plan, menos lo que ya tienes
function CompraPlan({ foods, lots, prefs, shopping }) {
  const [dias, setDias] = useState(7);
  const [verTodo, setVerTodo] = useState(false);
  const desde = addDays(todayStr(), -DIAS_HISTORIAL);
  const plan = useLive(() => activePlan().then(p => p || null), []);
  const logs = useLive(() => db.logs.where('date').aboveOrEqual(desde).toArray(), [desde]);
  const elecciones = useLive(() => db.settings.where('key').startsWith('opciones:').toArray()
    .then(r => r.filter(x => x.key.slice(9) >= desde).map(x => ({ date: x.key.slice(9), v: x.value }))), [desde]);
  if ([plan, logs, elecciones].includes(undefined)) return null;
  if (!plan) return html`<section class="card"><h3>Para tu plan</h3><p class="muted small">Carga tu plan en Más → Mi plan y aquí verás qué comprar para la semana.</p></section>`;

  const lista = necesidadesPlan({ plan, foods, lots, logs, elecciones, prefs, dias });
  const faltan = lista.filter(x => x.falta >= 1);
  const tienes = lista.filter(x => x.falta < 1);
  const cantidad = (g, food) => fmtG(Math.round(g), food);
  const textoFalta = x => cantidad(x.falta, x.food) + (x.envases ? ` (≈ ${x.envases} ${x.envases === 1 ? nombreEnvase(x.producto) : plural(nombreEnvase(x.producto), x.envases)} de ${fmt(x.producto.packG)} g)` : '');
  const anadir = async () => {
    // Quita lo que se añadió antes desde aquí (sin marcar) para no repetir
    await db.transaction('rw', db.shopping, async () => {
      await db.shopping.filter(s => s.dePlan && !s.done).delete();
      await db.shopping.bulkAdd(faltan.map(x => ({ name: `${x.nombre}: ${textoFalta(x)}`, done: 0, dePlan: 1 })));
    });
    toast(`${faltan.length} cosas añadidas a Mi lista ✓`);
  };
  const fila = x => html`
    <div class="row" key=${x.clave}>
      <${Dot} group=${x.group} />
      <span class="grow">${x.nombre}<br />
        <small class="muted">tu plan pide ${cantidad(x.necesita, x.food)} · tienes ${x.hay ? cantidad(x.hay, x.food) : 'nada'}</small></span>
      ${x.falta >= 1 ? html`<span class="tag warn">comprar ${textoFalta(x)}</span>` : html`<span class="tag ok">tienes ✓</span>`}
    </div>`;

  return html`
    <section class="card list">
      <h3 class="group-title">Para tu plan</h3>
      <${Seg} value=${dias} onChange=${setDias} options=${[3, 5, 7, 14].map(d => ({ value: d, label: `${d} días` }))} />
      <p class="muted small">Lo que pide tu plan para los próximos ${dias} días menos lo que ya tienes en casa. Usa lo que sueles comer de verdad (últimas 4 semanas). Cantidades en crudo, como se compran.</p>
      ${!faltan.length && html`<p class="aviso ok small">Tienes todo lo que pide tu plan para estos días ✓</p>`}
      ${faltan.map(fila)}
      ${faltan.length > 0 && html`<button class="btn" onClick=${anadir}>Añadir lo que falta a Mi lista</button>`}
      ${tienes.length > 0 && html`
        <button class="link small" onClick=${() => setVerTodo(!verTodo)}>${verTodo ? 'Ocultar' : 'Ver'} lo que ya tienes (${tienes.length})</button>
        ${verTodo && tienes.map(fila)}`}
    </section>`;
}

function Compra({ foods, lots, basicos, shopping, prefs, setSheet }) {
  const [nuevo, setNuevo] = useState('');
  const auto = foods.map(f => ({ f, e: estadoCompra(f, lots) })).filter(x => x.e.necesita);
  const faltan = basicos.filter(b => b.status !== 'tengo');
  const add = async () => {
    if (!nuevo.trim()) return;
    await db.shopping.add({ name: nuevo.trim(), done: 0 });
    setNuevo('');
  };
  return html`
    <${CompraPlan} foods=${foods} lots=${lots} prefs=${prefs} shopping=${shopping} />
    <section class="card list">
      <h3 class="group-title">Automático</h3>
      ${!auto.length && !faltan.length && html`<p class="muted small">Nada por ahora. En cada producto de tu despensa puedes elegir "Avisar cuando queden X" y "comprar Y": cuando baje, aparecerá aquí solo.</p>`}
      ${auto.map(({ f, e }) => html`
        <button class="row" onClick=${() => setSheet({ type: 'add', food: f })}>
          <${Dot} group=${f.group} />
          <span class="grow">${f.name}<br /><small class="muted">quedan ${textoStock(f, lots)}</small></span>
          <span class="tag warn">comprar ${e.comprar} ${plural(nombreEnvase(f), e.comprar)}</span>
        </button>`)}
      ${auto.length > 0 && html`<p class="muted small">Toca un producto cuando lo compres para añadirlo a la despensa: sale de la lista solo.</p>`}
      ${faltan.map(b => html`
        <button class="row" onClick=${() => { db.basicos.update(b.id, { status: 'tengo' }); toast(`${b.name}: comprado ✓`); }}>
          <span class="check"></span><span class="grow">${b.name}</span>
          <small class="muted">${b.status === 'no' ? 'se acabó' : 'queda poco'}</small>
        </button>`)}
    </section>
    <section class="card list">
      <h3 class="group-title">Mi lista</h3>
      <div class="inline">
        <input placeholder="Añadir a la lista" value=${nuevo} onInput=${e => setNuevo(e.target.value)} onKeyDown=${e => e.key === 'Enter' && add()} />
        <button class="btn small" onClick=${add}>Añadir</button>
      </div>
      ${shopping.map(s => html`
        <button class=${'row' + (s.done ? ' done' : '')} key=${s.id} onClick=${() => db.shopping.update(s.id, { done: s.done ? 0 : 1 })}>
          <span class=${'check' + (s.done ? ' on' : '')}></span><span class="grow">${s.name}</span>
        </button>`)}
      ${shopping.some(s => s.done) && html`
        <button class="link" onClick=${() => db.shopping.where('done').equals(1).delete()}>Borrar comprados</button>`}
    </section>`;
}
