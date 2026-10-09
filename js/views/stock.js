// Despensa por envases: cuántas bolsas/paquetes/botes tienes, cuál está abierto,
// cuándo avisar y cuántos comprar. Lo usan la Despensa y la Biblioteca.
import { html, useState } from '../lib.js';
import { db, resumenStock, round1 } from '../db.js';
import { fmt, fmtG, todayStr } from '../nutri.js';
import { Num, Toggle, Dot, Icon, toast } from '../ui.js';

export const esHogar = f => f.group === 'hogar';

// "bolsa" → "bolsas", "unidad" → "unidades", "pack" → "packs"
export const plural = (nombre, n) => (Math.abs(n) === 1 ? nombre : /[dlrn]$/.test(nombre) ? nombre + 'es' : nombre + 's');
export const nombreEnvase = f => f.envase || (esHogar(f) ? 'paquete' : 'envase');
// Femenino o masculino según el nombre del envase: "bolsa abierta", "paquete abierto"
export const fem = env => /(a|d|ón)$/.test(env || '');
export const conGenero = (env, palabra, n = 1) => palabra + (fem(env) ? 'a' : 'o') + (n === 1 ? '' : 's');

// Texto corto de cuánto tienes: "2 bolsas + 1 abierta (250 g)", "3 paquetes", "750 g"
export function textoStock(food, lots) {
  const r = resumenStock(food, lots);
  if (!r.mios.length) return 'no queda';
  const env = nombreEnvase(food);
  if (esHogar(food)) {
    const n = r.mios.length;
    return `${n} ${plural(env, n)}${r.abiertos.length ? ` (1 ${conGenero(env, 'empezad')})` : ''}`;
  }
  const unidades = food.unitG ? ` · ≈${fmt(r.total / food.unitG)} ${plural(food.unitName || 'ud', Math.round(r.total / food.unitG))}` : '';
  if (!food.packG) return fmtG(r.total) + unidades;
  const partes = [];
  if (r.cerrados) partes.push(`${r.cerrados} ${plural(env, r.cerrados)}`);
  if (r.abiertos.length) partes.push(`${r.abiertos.length} ${conGenero(env, 'abiert', r.abiertos.length)} (${fmtG(r.abiertos.reduce((s, l) => s + l.g, 0))})`);
  return partes.join(' + ') + unidades;
}

// ¿Hay que comprarlo? Si tiene aviso en envases, se compara con los envases que quedan;
// si no, con el mínimo en gramos (lo antiguo).
export function estadoCompra(food, lots) {
  const r = resumenStock(food, lots);
  const restantes = esHogar(food) ? r.mios.length : r.envases;
  if (food.aviso != null && restantes != null) {
    return { necesita: restantes <= food.aviso, restantes, comprar: food.comprar || 1 };
  }
  if (food.minG) return { necesita: r.total < food.minG, restantes: null, comprar: food.comprar || 1 };
  return { necesita: false };
}

// Añade a la despensa: N envases nuevos y, si quieres, uno ya abierto con lo que le queda
export async function anadirStock(food, { envases = 0, abiertoG = null, g = null, expiry = null }) {
  const ahora = Date.now();
  const filas = [];
  if (esHogar(food)) {
    for (let i = 0; i < envases; i++) filas.push({ foodId: food.id, g: 1, abierto: false, expiry, addedAt: ahora + i });
    if (abiertoG) filas.push({ foodId: food.id, g: 1, abierto: true, expiry, addedAt: ahora - 1 });
  } else if (food.packG) {
    for (let i = 0; i < envases; i++) filas.push({ foodId: food.id, g: food.packG, abierto: false, expiry, addedAt: ahora + i });
    if (abiertoG) filas.push({ foodId: food.id, g: round1(abiertoG), abierto: true, expiry, addedAt: ahora - 1 });
  } else if (g) {
    filas.push({ foodId: food.id, g: round1(g), abierto: false, expiry, addedAt: ahora });
  }
  if (filas.length) await db.lots.bulkAdd(filas);
  return filas.length;
}

// Formulario para añadir stock de un producto (después de comprar o la primera vez que lo cargas)
export function CantidadStock({ food: inicial, onDone }) {
  const [food, setFood] = useState(inicial);
  const hogar = esHogar(food);
  const env = nombreEnvase(food);
  const [envases, setEnvases] = useState(food.comprar || 1);
  const [hayAbierto, setHayAbierto] = useState(false);
  const [abiertoG, setAbiertoG] = useState(null);
  const [g, setG] = useState(null);
  const [expiry, setExpiry] = useState('');
  // Si el producto aún no sabe cómo viene (peso del envase), se lo decimos aquí
  const [packG, setPackG] = useState(food.packG || null);
  const [envNombre, setEnvNombre] = useState(food.envase || '');

  const conEnvase = hogar || food.packG;
  const guardarEnvase = async () => {
    const cambios = { packG, envase: envNombre.trim() || null, ...(food.source === 'base' ? { edited: true } : {}) };
    await db.foods.update(food.id, cambios);
    setFood({ ...food, ...cambios });
  };

  const resumen = conEnvase
    ? [envases > 0 && `${envases} ${plural(env, envases)} ${conGenero(env, 'nuev', envases)}`,
      hayAbierto && (hogar ? `1 ${conGenero(env, 'empezad')}` : abiertoG && `1 ${conGenero(env, 'abiert')} con ${fmtG(abiertoG)}`)].filter(Boolean).join(' + ')
    : g ? fmtG(g) : '';

  return html`
    <div class="form">
      <h4><${Dot} group=${food.group} /> ${food.name}${food.brand ? ` · ${food.brand}` : ''}</h4>
      ${!conEnvase && html`
        <div class="notice">
          <b>¿Cómo viene?</b> Si dices cuánto pesa cada envase, la app cuenta bolsas/paquetes y sabe cuál tienes abierto.
          <div class="grid2" style=${{ marginTop: '8px' }}>
            <label>Peso de cada envase<${Num} value=${packG} onChange=${setPackG} suffix="g" /></label>
            <label>Se llama<input value=${envNombre} onInput=${e => setEnvNombre(e.target.value)} placeholder="bolsa, paquete, bote…" /></label>
          </div>
          <button class="btn small" disabled=${!packG} onClick=${guardarEnvase}>Usar envases</button>
        </div>`}
      ${conEnvase ? html`
        <label>${plural(env, 2).charAt(0).toUpperCase() + plural(env, 2).slice(1)} ${conGenero(env, 'nuev', 2)} sin abrir${hogar ? '' : ` (de ${fmtG(food.packG)} cada un${fem(env) ? 'a' : 'o'})`}
          <${Num} value=${envases} onChange=${v => setEnvases(v || 0)} suffix=${plural(env, envases || 2)} /></label>
        <${Toggle} label=${`Además tengo un${fem(env) ? 'a' : ''} ${env} ya ${conGenero(env, hogar ? 'empezad' : 'abiert')}`}
          checked=${hayAbierto} onChange=${setHayAbierto} />
        ${hayAbierto && !hogar && html`
          <label>¿Cuánto le queda?</label>
          <div class="chips">
            ${[[0.75, 'Casi lleno'], [0.5, 'La mitad'], [0.25, 'Poco']].map(([p, t]) => html`
              <button class=${'chip' + (abiertoG === Math.round(food.packG * p) ? ' on' : '')} onClick=${() => setAbiertoG(Math.round(food.packG * p))}>${t}</button>`)}
          </div>
          <${Num} value=${abiertoG} onChange=${setAbiertoG} suffix="g" />
          ${food.unitG && html`<small class="muted">${abiertoG ? `≈ ${fmt(abiertoG / food.unitG)} ${plural(food.unitName || 'ud', 2)}` : ''}</small>`}`}` : html`
        <label>Cantidad<${Num} value=${g} onChange=${setG} suffix="g" /></label>
        ${food.unitG && html`<div class="chips">${[4, 6, 10, 12].map(u => html`
          <button class="chip" onClick=${() => setG(u * food.unitG)}>${u} ${plural(food.unitName || 'ud', u)}</button>`)}</div>`}`}
      ${!hogar && html`<label>Caduca (opcional)<input type="date" min=${todayStr()} value=${expiry} onInput=${e => setExpiry(e.target.value)} /></label>`}
      <button class="btn" disabled=${!resumen} onClick=${async () => {
        const n = await anadirStock(food, { envases: conEnvase ? envases : 0, abiertoG: hayAbierto ? (hogar ? 1 : abiertoG) : null, g, expiry: expiry || null });
        toast(n ? `Añadido: ${resumen} ✓` : 'No se añadió nada');
        onDone?.();
      }}>${resumen ? `Añadir ${resumen}` : 'Indica cuánto añadir'}</button>
    </div>`;
}

// Ficha de stock de un producto: envases, el abierto, "se terminó", aviso y cuántos comprar
export function FichaStock({ food, lots, onAdd }) {
  const hogar = esHogar(food);
  const env = nombreEnvase(food);
  const mios = lots.filter(l => l.foodId === food.id && l.g > 0).sort((a, b) => (!!b.abierto - !!a.abierto) || (a.expiry || '9').localeCompare(b.expiry || '9') || a.addedAt - b.addedAt);
  const set = cambios => db.foods.update(food.id, { ...cambios, ...(food.source === 'base' ? { edited: true } : {}) });
  const terminar = async l => {
    await db.lots.update(l.id, { g: 0, abierto: false, terminado: Date.now() });
    toast(`${env.charAt(0).toUpperCase() + env.slice(1)} ${conGenero(env, 'terminad')}. ${mios.length > 1 ? 'Empieza la siguiente unidad.' : 'Ya no queda.'}`);
  };
  const est = estadoCompra(food, lots);
  return html`
    <div class="form">
      <p class="stock-total"><b>${textoStock(food, lots)}</b></p>
      ${est.necesita && html`<p class="aviso warn">Está en tu lista de la compra (comprar ${est.comprar} ${plural(env, est.comprar)}).</p>`}
      ${!hogar && html`<p class="muted small">Cantidades como se compran (en crudo). Al registrar comidas en cocido se descuenta lo equivalente, primero del envase abierto.</p>`}
      ${mios.length === 0 && html`<p class="muted">No queda nada.</p>`}
      ${mios.map(l => html`
        <div class=${'lot' + (l.abierto ? ' abierto' : '')} key=${l.id}>
          <div class="grow">
            <b>${l.abierto ? conGenero(env, hogar ? 'Empezad' : 'Abiert') : food.packG && !hogar ? conGenero(env, 'Cerrad') : hogar ? 'Sin empezar' : 'Cantidad'}</b>
            ${!hogar && html`<${Num} value=${l.g} onChange=${v => v != null && db.lots.update(l.id, { g: round1(v), abierto: !food.packG || v < food.packG })} suffix="g" />`}
            <small class="muted">${l.expiry ? `Caduca ${new Date(l.expiry + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}
              ${!hogar && food.unitG ? ` · ≈${fmt(l.g / food.unitG)} ${plural(food.unitName || 'ud', 2)}` : ''}</small>
          </div>
          <button class="btn small secondary" onClick=${() => terminar(l)}>Se terminó</button>
        </div>`)}
      <button class="btn" onClick=${onAdd}><${Icon} name="plus" size=${18} /> Añadir más</button>

      <h4>Lista de la compra</h4>
      ${(food.packG || hogar) ? html`
        <div class="grid2">
          <label>Avisar cuando queden<${Num} value=${food.aviso} onChange=${v => set({ aviso: v })} suffix=${plural(env, 2)} /></label>
          <label>Y comprar<${Num} value=${food.comprar} onChange=${v => set({ comprar: v })} suffix=${plural(env, 2)} /></label>
        </div>
        <small class="muted">Ej.: compras 3 bolsas de almendras → avisar cuando quede 1 y comprar 3. Puedes poner medios (0,5 = media bolsa).</small>`
      : html`
        <label>Avisar cuando queden menos de<${Num} value=${food.minG} onChange=${v => set({ minG: v })} suffix="g" /></label>
        <small class="muted">Consejo: pon el peso de cada envase (al pulsar "Añadir más") y podrás contar en bolsas o paquetes.</small>`}
    </div>`;
}
