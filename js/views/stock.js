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

// Formulario para añadir stock de un producto: todo en una pantalla.
// 1) peso de cada envase (si el escáner lo sabe, ya viene puesto)  2) cuántos sin abrir  3) uno ya abierto
export function CantidadStock({ food, onDone }) {
  const hogar = esHogar(food);
  const [packG, setPackG] = useState(food.packG || null);
  const [envNombre, setEnvNombre] = useState(food.envase || '');
  const [envases, setEnvases] = useState(food.comprar || 1);
  const [hayAbierto, setHayAbierto] = useState(false);
  const [abiertoG, setAbiertoG] = useState(null);
  const [expiry, setExpiry] = useState('');
  const env = envNombre.trim() || nombreEnvase(food);
  const peso = hogar ? 1 : packG;

  const resumen = [
    envases > 0 && `${envases} ${plural(env, envases)} ${conGenero(env, 'nuev', envases)}`,
    hayAbierto && (hogar ? `1 ${conGenero(env, 'empezad')}` : abiertoG && `1 ${conGenero(env, 'abiert')} con ${fmtG(abiertoG)}`),
  ].filter(Boolean).join(' + ');
  const falta = !hogar && !packG ? 'Pon cuánto pesa cada envase' : !resumen ? 'Indica cuántos tienes' : '';

  const anadir = async () => {
    // Guardamos en el producto cómo viene, para no volver a preguntarlo
    const cambios = { envase: envNombre.trim() || food.envase || null, ...(hogar ? {} : { packG }), ...(food.source === 'base' ? { edited: true } : {}) };
    await db.foods.update(food.id, cambios);
    const n = await anadirStock({ ...food, ...cambios }, { envases, abiertoG: hayAbierto ? (hogar ? 1 : abiertoG) : null, expiry: expiry || null });
    toast(n ? `Añadido: ${resumen} ✓` : 'No se añadió nada');
    onDone?.();
  };

  return html`
    <div class="form">
      <h4><${Dot} group=${food.group} /> ${food.name}${food.brand ? ` · ${food.brand}` : ''}</h4>
      ${!hogar && html`
        <div class="grid2">
          <label>Peso de cada envase<${Num} value=${packG} onChange=${setPackG} suffix="g" /></label>
          <label>El envase es un/a<input value=${envNombre} onInput=${e => setEnvNombre(e.target.value)} placeholder="paquete, bote, bolsa…" /></label>
        </div>
        ${!food.packG && html`<small class="muted">Viene en la etiqueta (ej. "250 g"). Solo se pregunta la primera vez.</small>`}`}
      ${hogar && html`<label>Se cuenta por<input value=${envNombre} onInput=${e => setEnvNombre(e.target.value)} placeholder="paquete, rollo, bote…" /></label>`}
      <label>¿Cuántos tienes sin abrir?
        <${Num} value=${envases} onChange=${v => setEnvases(v || 0)} suffix=${plural(env, envases === 1 ? 1 : 2)} /></label>
      <div class="chips">${[0, 1, 2, 3, 4, 6].map(n => html`
        <button class=${'chip' + (envases === n ? ' on' : '')} onClick=${() => setEnvases(n)}>${n}</button>`)}</div>
      <${Toggle} label=${`Además tengo un${fem(env) ? 'a' : ''} ${env} ya ${conGenero(env, hogar ? 'empezad' : 'abiert')}`}
        checked=${hayAbierto} onChange=${setHayAbierto} />
      ${hayAbierto && !hogar && html`
        <label>¿Cuánto le queda?</label>
        <div class="chips">
          ${[[0.75, 'Casi lleno'], [0.5, 'La mitad'], [0.25, 'Poco']].map(([p, t]) => html`
            <button class=${'chip' + (peso && abiertoG === Math.round(peso * p) ? ' on' : '')} disabled=${!peso}
              onClick=${() => setAbiertoG(Math.round(peso * p))}>${t}</button>`)}
        </div>
        <${Num} value=${abiertoG} onChange=${setAbiertoG} suffix="g que quedan" />
        ${food.unitG && abiertoG ? html`<small class="muted">≈ ${fmt(abiertoG / food.unitG)} ${plural(food.unitName || 'ud', 2)}</small>` : ''}`}
      ${!hogar && html`<label>Caduca (opcional)<input type="date" min=${todayStr()} value=${expiry} onInput=${e => setExpiry(e.target.value)} /></label>`}
      <button class="btn" disabled=${!!falta} onClick=${anadir}>${falta || `Añadir ${resumen}`}</button>
    </div>`;
}

// Ficha de stock de un producto: envases, el abierto, "se terminó", aviso y cuántos comprar
export function FichaStock({ food, lots, onAdd, onQuitar }) {
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
      <button class="btn danger" onClick=${async () => {
        if (!confirm(`¿Quitar "${food.name}" de tu despensa? Se borra lo que tienes registrado y deja de vigilarse para la compra. El producto sigue en tu biblioteca.`)) return;
        await db.lots.where('foodId').equals(food.id).delete();
        await db.foods.update(food.id, { aviso: null, minG: null });
        toast('Quitado de la despensa');
        onQuitar?.();
      }}><${Icon} name="trash" size=${18} /> Quitar de la despensa</button>

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
