// Despensa: stock por envases (comida y cosas de casa), básicos y lista de la compra.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getPrefs, getSetting, setSetting, resumenStock, slug, activePlan } from '../db.js';
import { GROUPS, daysUntil, fmt, fmtG, todayStr, addDays, fmtDate } from '../nutri.js';
import { DIAS_HISTORIAL } from '../compra-plan.js';
import { construirLista, candidatos, textoCantidad } from '../lista-compra.js';
import { Sheet, Seg, Dot, Empty, Icon, Num, toast } from '../ui.js';
import { Escaner, resolverCodigo, FoodForm, NoEncontrado, PegarEtiqueta } from './biblioteca.js';
import { Receta } from './receta.js';
import { CantidadStock, FichaStock, textoStock, estadoCompra, plural, nombreEnvase, anadirStock } from './stock.js';

export function Despensa({ go }) {
  const [tab, setTab] = useState('stock');
  const foods = useLive(() => db.foods.toArray(), []);
  const lots = useLive(() => db.lots.toArray(), []);
  const basicos = useLive(() => db.basicos.toArray(), []);
  const shopping = useLive(() => db.shopping.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [sheet, setSheet] = useState(null);
  const [dias, setDias] = useState(7);
  const hoy = todayStr();
  const desde = addDays(hoy, -DIAS_HISTORIAL);
  const plan = useLive(() => activePlan().then(p => p || null), []);
  const logs = useLive(() => db.logs.where('date').aboveOrEqual(desde).toArray(), [desde]);
  const elecciones = useLive(() => db.settings.where('key').startsWith('opciones:').toArray()
    .then(r => r.filter(x => x.key.slice(9) >= desde).map(x => ({ date: x.key.slice(9), v: x.value }))), [desde]);
  const ocultos = useLive(() => getSetting('compraOculta', {}), []);
  const ajustes = useLive(() => getSetting('compraAjuste', {}), []);
  const forzados = useLive(() => getSetting('compraForzada', {}), []);
  // Lo que antes se añadía a "Mi lista" desde el plan ya está en la lista única: se limpia una vez
  useEffect(() => { db.shopping.filter(x => !!x.dePlan).delete(); }, []);

  if ([foods, lots, basicos, shopping, prefs, plan, logs, elecciones, ocultos, ajustes, forzados].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const lista = construirLista({ plan, foods, lots, logs, elecciones, prefs, dias, ocultos, ajustes, forzados, hoy });
  const ctx = { foods, byId, lots, basicos, shopping, prefs, setSheet, plan, lista, dias, setDias, ocultos, ajustes };
  const manuales = shopping.filter(x => !x.dePlan);
  const enCompra = lista.length + basicos.filter(b => b.status !== 'tengo').length + manuales.filter(x => !x.done).length;

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
      <${Sheet} open=${sheet?.type === 'comprar'} onClose=${() => setSheet(null)} title=${sheet?.item?.nombre}>
        ${sheet?.type === 'comprar' && html`<${Comprado} item=${sheet.item} foods=${foods} lots=${lots} dias=${dias} onDone=${() => setSheet(null)} />`}
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
      Tu despensa está vacía. Escanea los productos o elígelos de tu biblioteca; también cosas de casa (toallitas, papel…).
      <br /><button class="btn" style=${{ marginTop: '12px' }} onClick=${() => setSheet({ type: 'add' })}><${Icon} name="plus" size=${18} /> Añadir mi primera compra</button>
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

function AddStock({ foods, lots, prefs, food: inicial, onDone }) {
  const [food, setFood] = useState(inicial || null);
  const [modo, setModo] = useState(inicial ? 'cantidad' : 'buscar'); // buscar | escanear | cargando | noencontrado | pegar | nuevo | cantidad | receta
  const [receta, setReceta] = useState(null);
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
  if (modo === 'receta') return html`<${Receta} foods=${foods} lots=${lots} prefs=${prefs} inicial=${receta} onDone=${onDone} />`;
  const recetas = foods.filter(f => f.source === 'receta');

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
      <${Icon} name="pen" size=${18} /> Crear producto nuevo (comida o de casa)</button>
    <button class="btn secondary" onClick=${() => { setReceta(null); setModo('receta'); }}>
      <${Icon} name="bolt" size=${18} /> Cociné una receta (guiso, comida para varios días)</button>
    ${recetas.length > 0 && html`
      <small class="muted">Cocinar otra vez:</small>
      <div class="chips wrap">${recetas.map(f => html`<button class="chip" onClick=${() => { setReceta(f); setModo('receta'); }}>${f.name}</button>`)}</div>`}`;
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

// ---------- La lista de la compra (una sola) ----------
// Lo que pide tu plan + los avisos de la despensa (sin repetir), los básicos que se acabaron y lo que apuntas a mano.
function Compra({ lista, basicos, shopping, plan, dias, setDias, setSheet }) {
  const [nuevo, setNuevo] = useState('');
  const faltanBasicos = basicos.filter(b => b.status !== 'tengo');
  const manuales = shopping.filter(x => !x.dePlan);
  const add = async () => {
    if (!nuevo.trim()) return;
    await db.shopping.add({ name: nuevo.trim(), done: 0 });
    setNuevo('');
  };
  const nada = !lista.length && !faltanBasicos.length && !manuales.length;
  return html`
    <section class="card list compra">
      <div class="compra-cab">
        <h3>Lista de la compra</h3>
        ${plan && html`<${Seg} value=${dias} onChange=${setDias} options=${[3, 7, 14].map(d => ({ value: d, label: `${d} días` }))} />`}
      </div>
      <p class="muted small">${plan ? `Lo que pide tu plan para ${dias} días menos lo que tienes en casa, y lo que se te acaba.` : 'Lo que se te acaba en la despensa.'} Toca el círculo cuando lo compres.</p>
      ${nada && html`<p class="aviso ok small">No te falta nada ✓</p>`}
      ${lista.map(it => {
        const c = textoCantidad(it);
        return html`
          <div class="row compra-fila" key=${it.clave}>
            <button class="check-btn" aria-label=${'Lo he comprado: ' + it.nombre} onClick=${() => setSheet({ type: 'comprar', item: it })}><span class="check"></span></button>
            <button class="compra-txt" onClick=${() => setSheet({ type: 'comprar', item: it })}>
              <span class="compra-nombre"><${Dot} group=${it.group} /> ${it.nombre}</span>
              <small class="muted">${[it.motivos.includes('plan') && 'para tu plan', it.motivos.includes('aviso') && 'se te acaba', it.motivos.includes('tú') && 'lo pusiste tú'].filter(Boolean).join(' · ')}${it.ajustado ? ' · cantidad tuya' : ''}${it.producto && it.producto.source !== 'base' ? ` · ${it.producto.name}` : ''}</small>
            </button>
            <span class="compra-cant"><b>${c.principal}</b>${c.detalle ? html`<small class="muted">${c.detalle}</small>` : ''}</span>
          </div>`;
      })}
      ${faltanBasicos.map(b => html`
        <div class="row compra-fila" key=${'b' + b.id}>
          <button class="check-btn" aria-label=${'Comprado: ' + b.name} onClick=${() => { db.basicos.update(b.id, { status: 'tengo' }); toast(`${b.name}: comprado ✓`); }}><span class="check"></span></button>
          <span class="compra-txt"><span class="compra-nombre">${b.name}</span><small class="muted">básico · ${b.status === 'no' ? 'se acabó' : 'queda poco'}</small></span>
        </div>`)}
      ${manuales.map(x => html`
        <div class=${'row compra-fila' + (x.done ? ' done' : '')} key=${'m' + x.id}>
          <button class="check-btn" aria-pressed=${!!x.done} aria-label=${(x.done ? 'Desmarcar: ' : 'Comprado: ') + x.name} onClick=${() => db.shopping.update(x.id, { done: x.done ? 0 : 1 })}><span class=${'check' + (x.done ? ' on' : '')}></span></button>
          <span class="compra-txt grow"><span class="compra-nombre">${x.name}</span><small class="muted">apuntado a mano</small></span>
          <button class="icon-btn" aria-label=${'Borrar ' + x.name} onClick=${() => db.shopping.delete(x.id)}><${Icon} name="trash" size=${15} /></button>
        </div>`)}
      <div class="inline compra-anadir">
        <input placeholder="Apuntar algo más (ej: servilletas)" value=${nuevo} onInput=${e => setNuevo(e.target.value)} onKeyDown=${e => e.key === 'Enter' && add()} />
        <button class="btn small" disabled=${!nuevo.trim()} onClick=${add}>Añadir</button>
      </div>
      ${manuales.some(x => x.done) && html`<button class="link small" onClick=${() => db.shopping.where('done').equals(1).delete()}>Quitar lo apuntado que ya compraste</button>`}
    </section>
    <${Quitados} />`;
}

async function quitarForzado(clave) {
  const f = await getSetting('compraForzada', {});
  if (f[clave]) { const o = { ...f }; delete o[clave]; await setSetting('compraForzada', o); }
}

// Lo que dijiste que no ibas a comprar (por si cambias de idea)
function Quitados() {
  const ocultos = useLive(() => getSetting('compraOculta', {}), []);
  const foods = useLive(() => db.foods.toArray(), []);
  const [ver, setVer] = useState(false);
  if (!ocultos || !foods) return null;
  const hoy = todayStr();
  const activos = Object.entries(ocultos).filter(([, hasta]) => hasta >= hoy);
  if (!activos.length) return null;
  const nombre = clave => clave.startsWith('l:') ? `Lista ${clave.slice(2)}` : foods.find(f => f.id === clave.slice(2))?.name || clave;
  const volver = async clave => { const o = { ...ocultos }; delete o[clave]; await setSetting('compraOculta', o); };
  return html`
    <section class="card list">
      <button class="link small" onClick=${() => setVer(!ver)}>${ver ? 'Ocultar' : 'Ver'} lo que quitaste de la lista (${activos.length})</button>
      ${ver && activos.map(([clave, hasta]) => html`
        <div class="row" key=${clave}>
          <span class="grow muted">${nombre(clave)}<br /><small>quitado hasta el ${fmtDate(hasta, { day: 'numeric', month: 'short' })}</small></span>
          <button class="btn small secondary" onClick=${() => volver(clave)}>Volver a ponerlo</button>
        </div>`)}
    </section>`;
}

// "Lo he comprado": qué producto (o escanea otra marca) y cuántos envases / unidades. Se guarda en la despensa.
function Comprado({ item: it, foods, lots, dias, onDone }) {
  const opciones = candidatos(it, foods, lots);
  const [prod, setProd] = useState(it.producto || opciones[0] || null);
  const [modo, setModo] = useState('cantidad'); // cantidad | escanear | cargando | noencontrado | pegar | nuevo | ajustar
  const [r, setR] = useState(null);
  const raizBase = it.lista ? null : it.foodId;
  const base = raizBase && foods.find(f => f.id === raizBase);

  // Producto escaneado: queda unido a este alimento (cuenta como él en tu plan y en la lista)
  const unir = async f => {
    if (raizBase && f.id !== raizBase && f.genericId !== raizBase && f.group !== 'hogar') {
      const cambios = { genericId: raizBase, ...(base?.factor && !f.factor ? { factor: base.factor } : {}), ...(!f.group || f.group === 'otro' ? { group: base?.group || it.group } : {}) };
      await db.foods.update(f.id, cambios);
      f = { ...f, ...cambios };
    }
    setProd(f);
    setModo('cantidad');
  };
  const leer = async code => {
    setModo('cargando');
    const res = await resolverCodigo(code, foods);
    setR(res);
    if (res.food) { toast(res.food.name); await unir(res.food); return; }
    if (res.estado === 'off' || res.estado === 'incompleto' || res.estado === 'nuevo') {
      // Lo dejamos ya clasificado como este alimento
      if (raizBase) res.draft = { ...res.draft, genericId: raizBase, group: res.draft.group || base?.group || it.group };
      setR(res);
      setModo(res.estado === 'off' ? 'nuevo' : 'noencontrado');
      return;
    }
    setModo('noencontrado');
  };

  if (modo === 'escanear') return html`<${Escaner} onCode=${leer} />`;
  if (modo === 'cargando') return html`<p class="muted">Buscando el producto…</p>`;
  if (modo === 'noencontrado') return html`<${NoEncontrado} r=${r} onPegar=${() => setModo('pegar')}
    onMano=${() => { setR({ ...r, aviso: '' }); setModo('nuevo'); }} onReintentar=${() => leer(r.code)} onOtro=${() => setModo('escanear')} />`;
  if (modo === 'pegar') return html`<${PegarEtiqueta} onDone=${n => { setR({ ...r, draft: { ...r.draft, n, source: 'livetext' }, aviso: 'Revisa que los números coincidan con la etiqueta.' }); setModo('nuevo'); }} />`;
  if (modo === 'nuevo') return html`<${FoodForm} initial=${r?.draft || { n: {}, genericId: raizBase || '' }}
    aviso=${(r?.aviso ? r.aviso + ' ' : '') + (base ? `Contará como ${base.name}.` : '')} foods=${foods} onSaved=${unir} onDone=${() => setModo('cantidad')} />`;
  if (modo === 'ajustar') return html`<${Ajustar} it=${it} dias=${dias} onDone=${onDone} onVolver=${() => setModo('cantidad')} />`;

  return html`
    <div class="form">
      <p class="small">${it.motivos.includes('plan') ? `Tu plan pide ${fmtG(Math.round(it.necesita || it.g))} para ${dias} días y te faltan ${fmtG(Math.round(it.gPlan || it.g))}.` : it.motivos.includes('aviso') ? 'Se te está acabando.' : 'Lo pusiste tú en la lista.'}</p>
      <label>¿Qué compraste?</label>
      <div class="chips wrap">
        ${opciones.slice(0, 8).map(f => html`<button class=${'chip' + (prod?.id === f.id ? ' on' : '')} onClick=${() => setProd(f)}>${f.name}${f.brand ? ` · ${f.brand}` : ''}</button>`)}
      </div>
      <button class="btn secondary" onClick=${() => setModo('escanear')}><${Icon} name="scan" size=${18} /> Es otra marca: escanear el código</button>
      ${prod && html`<${CuantoCompre} key=${prod.id} it=${it} prod=${prod} onDone=${async () => { await quitarForzado(it.clave); onDone(); }} />`}
      <div class="compra-mas">
        <button class="link small" onClick=${() => setModo('ajustar')}>Necesito otra cantidad o no lo voy a comprar</button>
      </div>
    </div>`;
}

// Cuántos envases / unidades / gramos compraste del producto elegido
function CuantoCompre({ it, prod, onDone }) {
  const hogar = prod.group === 'hogar';
  const sugerido = textoCantidad(it, it.g, prod).n || 1;
  const [packG, setPackG] = useState(prod.packG || null);
  const [envase, setEnvase] = useState(prod.envase || '');
  const [suelto, setSuelto] = useState(false);
  const [n, setN] = useState(hogar ? Math.max(1, Math.round(it.g)) : sugerido);
  const [g, setG] = useState(Math.round(it.g));
  const [expiry, setExpiry] = useState('');
  const porUnidad = !hogar && !prod.packG && prod.unitG && !suelto;
  const nombreUd = hogar ? nombreEnvase(prod) : porUnidad ? (prod.unitName || 'unidad') : (envase.trim() || nombreEnvase(prod));
  const necesitaPeso = !hogar && !porUnidad && !suelto && !packG;
  const total = hogar ? n : suelto ? g : porUnidad ? n * prod.unitG : n * (packG || 0);

  const guardar = async () => {
    const cambios = {};
    if (!hogar && !porUnidad && !suelto) { cambios.packG = packG; if (envase.trim()) cambios.envase = envase.trim(); }
    if (Object.keys(cambios).length) { if (prod.source === 'base') cambios.edited = true; await db.foods.update(prod.id, cambios); }
    const f = { ...prod, ...cambios };
    const filas = hogar || (!porUnidad && !suelto)
      ? await anadirStock(f, { envases: n, expiry: expiry || null })
      : await anadirStock({ ...f, packG: null }, { g: total, expiry: expiry || null });
    toast(filas ? `${prod.name}: guardado en la despensa ✓` : 'No se guardó nada');
    onDone();
  };
  return html`
    <div class="form compra-cuanto">
      ${!hogar && !porUnidad && !suelto && html`
        <div class="grid2">
          <label>Cada envase pesa<${Num} value=${packG} onChange=${setPackG} suffix="g" /></label>
          <label>Y es un/a<input value=${envase} onInput=${e => setEnvase(e.target.value)} placeholder="bolsa, bandeja…" /></label>
        </div>
        ${!prod.packG && html`<small class="muted">Viene en la etiqueta. Solo se pregunta la primera vez.</small>`}`}
      ${suelto ? html`<label>¿Cuántos gramos compraste?<${Num} value=${g} onChange=${v => setG(v || 0)} suffix="g" /></label>` : html`
        <label>¿Cuántos ${plural(nombreUd, 2)} compraste?</label>
        <div class="stepper">
          <button class="icon-btn" aria-label="Uno menos" disabled=${n <= 1} onClick=${() => setN(Math.max(1, n - 1))}>−</button>
          <b>${n}</b><span class="muted">${plural(nombreUd, n)}</span>
          <button class="icon-btn" aria-label="Uno más" onClick=${() => setN(n + 1)}>+</button>
        </div>`}
      ${!hogar && html`<button class="link small" onClick=${() => setSuelto(!suelto)}>${suelto ? 'Lo compré en envases o unidades' : 'Lo compré suelto, a peso'}</button>`}
      ${!hogar && html`<label>Caduca (opcional)<input type="date" min=${todayStr()} value=${expiry} onInput=${e => setExpiry(e.target.value)} /></label>`}
      <button class="btn" disabled=${necesitaPeso || !total} onClick=${guardar}>
        ${necesitaPeso ? 'Pon cuánto pesa cada envase' : `Guardar en la despensa${hogar ? '' : ` (${fmtG(Math.round(total))})`}`}</button>
    </div>`;
}

// Cambiar cuánto necesitas o quitarlo de la lista
function Ajustar({ it, dias, onDone, onVolver }) {
  const [g, setG] = useState(Math.round(it.g));
  const hasta = addDays(todayStr(), dias - 1);
  const guardar = async () => {
    await setSetting('compraAjuste', { ...(await getSetting('compraAjuste', {})), [it.clave]: { g, hasta } });
    toast('Cantidad cambiada ✓'); onDone();
  };
  const quitar = async () => {
    await setSetting('compraOculta', { ...(await getSetting('compraOculta', {})), [it.clave]: hasta });
    await quitarForzado(it.clave);
    toast(`${it.nombre}: quitado de la lista`); onDone();
  };
  const c = textoCantidad(it, g);
  return html`
    <div class="form">
      <label>¿Cuánto quieres comprar?<${Num} value=${g} onChange=${v => setG(v || 0)} suffix="g" /></label>
      <small class="muted">Son ${c.principal}${c.detalle ? ` (${c.detalle})` : ''}. Vale para estos ${dias} días.</small>
      <button class="btn" disabled=${!g} onClick=${guardar}>Usar esta cantidad</button>
      <button class="btn secondary danger-text" onClick=${quitar}>No lo voy a comprar: quitar de la lista</button>
      <button class="link small" onClick=${onVolver}>Volver</button>
    </div>`;
}
