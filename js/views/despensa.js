// Despensa: stock de comida (en gramos, crudo), básicos y lista de la compra.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, stockMap, round1, slug } from '../db.js';
import { GROUPS, fmt, fmtG, daysUntil, fmtDate, todayStr, visibleFood } from '../nutri.js';
import { Sheet, Num, Seg, Dot, Empty, Icon, toast } from '../ui.js';
import { Escaner, resolverCodigo, FoodForm } from './biblioteca.js';

export function Despensa() {
  const [tab, setTab] = useState('comida');
  const foods = useLive(() => db.foods.toArray(), []);
  const lots = useLive(() => db.lots.toArray(), []);
  const basicos = useLive(() => db.basicos.toArray(), []);
  const shopping = useLive(() => db.shopping.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [sheet, setSheet] = useState(null);

  if ([foods, lots, basicos, shopping, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const ctx = { foods, byId, lots, basicos, shopping, prefs, setSheet };

  return html`
    <div class="page">
      <header class="top">
        <h1>Despensa</h1>
        ${tab === 'comida' && html`<button class="icon-btn accent" onClick=${() => setSheet({ type: 'add' })} aria-label="Añadir compra"><${Icon} name="plus" /></button>`}
      </header>
      <${Seg} value=${tab} onChange=${setTab} options=${[
        { value: 'comida', label: 'Comida' }, { value: 'basicos', label: 'Básicos' }, { value: 'compra', label: 'Compra' }]} />
      ${tab === 'comida' && html`<${Comida} ...${ctx} />`}
      ${tab === 'basicos' && html`<${Basicos} ...${ctx} />`}
      ${tab === 'compra' && html`<${Compra} ...${ctx} />`}

      <${Sheet} open=${sheet?.type === 'add'} onClose=${() => setSheet(null)} title="Añadir a la despensa">
        ${sheet?.type === 'add' && html`<${AddStock} ...${ctx} food=${sheet.food} onDone=${() => setSheet(null)} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'food'} onClose=${() => setSheet(null)} title=${sheet?.food?.name}>
        ${sheet?.type === 'food' && html`<${FoodStock} food=${sheet.food} lots=${lots} onAdd=${() => setSheet({ type: 'add', food: sheet.food })} />`}
      <//>
    </div>`;
}

function Comida({ foods, byId, lots, setSheet }) {
  const stock = {};
  for (const l of lots) {
    if (l.g <= 0) continue;
    const s = stock[l.foodId] ||= { g: 0, exp: null };
    s.g += l.g;
    if (l.expiry && (!s.exp || l.expiry < s.exp)) s.exp = l.expiry;
  }
  // Lo que tiene stock + lo que tiene mínimo configurado aunque esté a 0
  const items = foods.filter(f => stock[f.id] || f.minG).map(f => ({ f, s: stock[f.id] || { g: 0 } }));
  if (!items.length) return html`
    <${Empty}>
      Tu despensa está vacía.<br />Toca <b>+</b> para añadir tu compra escaneando los productos o eligiéndolos de la biblioteca.
    <//>`;
  const grupos = Object.keys(GROUPS).filter(g => items.some(i => (i.f.group || 'otro') === g));
  return grupos.map(g => html`
    <section class="card list">
      <h3 class="group-title"><${Dot} group=${g} /> ${GROUPS[g].name}</h3>
      ${items.filter(i => (i.f.group || 'otro') === g).sort((a, b) => a.f.name.localeCompare(b.f.name)).map(({ f, s }) => {
        const d = s.exp ? daysUntil(s.exp) : null;
        const low = f.minG && s.g < f.minG;
        return html`
          <button class="row" key=${f.id} onClick=${() => setSheet({ type: 'food', food: f })}>
            <span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}
              ${d != null && d <= 3 && html` <span class=${'tag ' + (d < 0 ? 'bad' : 'warn')}>${d < 0 ? 'caducado' : d === 0 ? 'caduca hoy' : `${d} d`}</span>`}
              ${low && html` <span class="tag warn">poco</span>`}</span>
            <span class=${s.g ? '' : 'muted'}>${fmtG(s.g, f)}</span>
          </button>`;
      })}
    </section>`);
}

function FoodStock({ food, lots, onAdd }) {
  const mine = lots.filter(l => l.foodId === food.id && l.g > 0).sort((a, b) => (a.expiry || '9').localeCompare(b.expiry || '9'));
  const setMin = v => db.foods.update(food.id, { minG: v, ...(food.source === 'base' ? { edited: true } : {}) });
  return html`
    <div class="form">
      <p class="muted small">Cantidades en crudo / como se compra. Al registrar comidas en cocido se descuenta lo equivalente.</p>
      ${mine.length === 0 && html`<p class="muted">No queda nada.</p>`}
      ${mine.map(l => html`
        <div class="lot" key=${l.id}>
          <div class="grow">
            <${Num} value=${l.g} onChange=${v => v != null && db.lots.update(l.id, { g: round1(v) })} suffix="g" />
            <small class="muted">Añadido ${fmtDate(todayStr(new Date(l.addedAt)))}${l.expiry ? ` · caduca ${fmtDate(l.expiry)}` : ''}</small>
          </div>
          <button class="icon-btn" aria-label="Se acabó" onClick=${() => { db.lots.delete(l.id); toast('Quitado'); }}><${Icon} name="trash" size=${18} /></button>
        </div>`)}
      <label>Avisarme si queda menos de<${Num} value=${food.minG} onChange=${setMin} suffix="g" /></label>
      <button class="btn" onClick=${onAdd}><${Icon} name="plus" size=${18} /> Añadir más</button>
    </div>`;
}

function AddStock({ foods, prefs, food: inicial, onDone }) {
  const [food, setFood] = useState(inicial || null);
  const [modo, setModo] = useState(inicial ? 'cantidad' : 'buscar'); // buscar | escanear | nuevo | cantidad
  const [nuevo, setNuevo] = useState(null);
  const [q, setQ] = useState('');
  const [envases, setEnvases] = useState(1);
  const [g, setG] = useState(null);
  const [expiry, setExpiry] = useState('');

  if (modo === 'escanear') {
    return html`<${Escaner} onCode=${async code => {
      setModo('cargando');
      const r = await resolverCodigo(code, foods);
      if (r.food) { setFood(r.food); setModo('cantidad'); toast(r.food.name); }
      else { setNuevo(r); setModo('nuevo'); }
    }} />`;
  }
  if (modo === 'cargando') return html`<p class="muted">Buscando el producto…</p>`;
  if (modo === 'nuevo') {
    return html`<${FoodForm} initial=${nuevo.draft} aviso=${nuevo.aviso} foods=${foods} onDone=${onDone} />`;
  }
  if (modo === 'cantidad' && food) {
    const total = food.packG ? food.packG * (envases || 0) : g;
    return html`
      <div class="form">
        <h4><${Dot} group=${food.group} /> ${food.name}${food.brand ? ` · ${food.brand}` : ''}</h4>
        ${food.packG
          ? html`<label>Envases<${Num} value=${envases} onChange=${setEnvases} suffix=${`× ${fmt(food.packG)} g`} autofocus /></label>
                 <button class="link" onClick=${() => db.foods.update(food.id, { packG: null }).then(() => setFood({ ...food, packG: null }))}>Introducir gramos en vez de envases</button>`
          : html`<label>Cantidad<${Num} value=${g} onChange=${setG} suffix="g" autofocus /></label>
                 ${food.unitG && html`<div class="chips">${[6, 10, 12, 24].map(u => html`
                   <button class="chip" onClick=${() => setG(u * food.unitG)}>${u} ${food.unitName || 'ud'}s</button>`)}</div>`}`}
        <label>Caduca (opcional)<input type="date" min=${todayStr()} value=${expiry} onInput=${e => setExpiry(e.target.value)} /></label>
        <button class="btn" disabled=${!total} onClick=${async () => {
          await db.lots.add({ foodId: food.id, g: total, expiry: expiry || null, addedAt: Date.now() });
          toast(`+${fmtG(total, food)} de ${food.name}`);
          onDone();
        }}>Añadir ${total ? fmtG(total, food) : ''}</button>
      </div>`;
  }
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const res = foods.filter(f => visibleFood(f, prefs) && norm(`${f.name} ${f.brand || ''}`).includes(norm(q)))
    .sort((a, b) => (a.source === 'base') - (b.source === 'base')).slice(0, 40);
  return html`
    <button class="btn" onClick=${() => setModo('escanear')}><${Icon} name="scan" size=${18} /> Escanear código de barras</button>
    <input class="search" placeholder="…o busca en tu biblioteca" value=${q} onInput=${e => setQ(e.target.value)} />
    <div class="list">
      ${res.map(f => html`
        <button class="row" onClick=${() => { setFood(f); setModo('cantidad'); }}>
          <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span>
        </button>`)}
    </div>`;
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
    <p class="muted small">Especias, salsas y cosas que no merece la pena pesar.</p>
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

function Compra({ foods, lots, basicos, shopping, setSheet }) {
  const [nuevo, setNuevo] = useState('');
  const stock = stockMap(lots, foods);
  const bajos = foods.filter(f => f.minG && (stock[f.id]?.g || 0) < f.minG);
  const faltan = basicos.filter(b => b.status !== 'tengo');
  const add = async () => {
    if (!nuevo.trim()) return;
    await db.shopping.add({ name: nuevo.trim(), done: 0 });
    setNuevo('');
  };
  return html`
    <section class="card list">
      <h3 class="group-title">Automático</h3>
      ${!bajos.length && !faltan.length && html`<p class="muted small">Nada por ahora. Configura un mínimo en tus productos para que aparezcan aquí cuando bajen.</p>`}
      ${bajos.map(f => html`
        <button class="row" onClick=${() => setSheet({ type: 'add', food: f })}>
          <${Dot} group=${f.group} /><span class="grow">${f.name}</span>
          <small class="muted">quedan ${fmtG(stock[f.id]?.g || 0, f)} · mín. ${fmtG(f.minG, f)}</small>
        </button>`)}
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
