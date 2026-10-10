// Una sola lista de la compra: lo que pide tu plan + los avisos de tu despensa, sin repetir nada.
// La mozzarella que pide el plan y la mozzarella "quedan pocas" de la despensa son UNA fila.
// Cada fila se identifica por su alimento base ("f:mozzarella") o por su lista de color ("l:verde").
import { necesidadesPlan } from './compra-plan.js';
import { estadoCompra, plural, nombreEnvase } from './views/stock.js';
import { fmtG, fmt } from './nutri.js';

const ORDEN = ['proteina', 'lacteo', 'verdura', 'fruta', 'almidon', 'grasa', 'suplemento', 'otro', 'hogar', undefined];

export function construirLista({ plan, foods, lots, logs = [], elecciones = [], prefs = {}, dias = 7, ocultos = {}, ajustes = {}, hoy }) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const items = new Map();

  // 1) Lo que pide el plan para los próximos días, menos lo que hay en casa
  if (plan) {
    for (const x of necesidadesPlan({ plan, foods, lots, logs, elecciones, prefs, dias })) {
      if (x.falta < 1) continue;
      items.set(x.clave, { clave: x.clave, nombre: x.nombre, group: x.group, foodId: x.foodId || null, lista: x.lista || null, ids: x.ids || null,
        g: x.falta, necesita: x.necesita, hay: x.hay, motivos: ['plan'] });
    }
  }
  // 2) Los avisos de la despensa ("avísame cuando quede 1 bolsa"): se unen con lo del plan si es el mismo alimento
  for (const f of foods) {
    const e = estadoCompra(f, lots);
    if (!e.necesita) continue;
    const raiz = f.genericId || f.id;
    const clave = 'f:' + raiz;
    const gAviso = f.group === 'hogar' ? e.comprar : f.packG ? e.comprar * f.packG : f.minG || 0;
    const it = items.get(clave);
    if (it) {
      if (!it.motivos.includes('aviso')) it.motivos.push('aviso');
      it.g = Math.max(it.g, gAviso);
      it.productoAviso = f;
    } else {
      items.set(clave, { clave, nombre: (byId[raiz] || f).name, group: f.group, foodId: raiz, lista: null, ids: null,
        g: gAviso, hogar: f.group === 'hogar', envasesAviso: e.comprar, productoAviso: f, motivos: ['aviso'] });
    }
  }

  const out = [];
  for (const it of items.values()) {
    if (ocultos[it.clave] && ocultos[it.clave] >= hoy) continue; // lo quitaste
    const aj = ajustes[it.clave];
    if (aj && aj.hasta >= hoy && aj.g > 0) { it.gPlan = it.g; it.g = aj.g; it.ajustado = true; }
    it.producto = productoHabitual(it, foods, lots);
    out.push(it);
  }
  return out.sort((a, b) => ORDEN.indexOf(a.group) - ORDEN.indexOf(b.group) || a.nombre.localeCompare(b.nombre));
}

// Productos que sirven para esta fila: los tuyos primero (el último que compraste arriba), luego el genérico
export function candidatos(it, foods, lots) {
  const ids = it.lista ? new Set(it.ids || []) : new Set([it.foodId]);
  const sirve = f => ids.has(f.id) || (f.genericId && ids.has(f.genericId));
  const ultimaCompra = id => Math.max(0, ...lots.filter(l => l.foodId === id).map(l => l.addedAt || 0));
  return foods.filter(sirve).sort((a, b) =>
    (a.source === 'base') - (b.source === 'base') || ultimaCompra(b.id) - ultimaCompra(a.id) || a.name.localeCompare(b.name));
}

export function productoHabitual(it, foods, lots) {
  if (it.productoAviso) return it.productoAviso;
  const c = candidatos(it, foods, lots);
  return c.find(f => f.source !== 'base' && f.packG) || c.find(f => f.packG) || (it.foodId && foods.find(f => f.id === it.foodId)) || c[0] || null;
}

// Cantidad en lo que entiendes al comprar: envases, rebanadas, huevos… y los gramos debajo
export function textoCantidad(it, g = it.g, producto = it.producto) {
  if (it.hogar) {
    const n = Math.max(1, Math.round(g));
    return { principal: `${n} ${plural(nombreEnvase(producto || {}), n)}`, detalle: '' };
  }
  if (producto?.packG) {
    const n = Math.max(1, Math.ceil(g / producto.packG - 0.05));
    return { principal: `${n} ${plural(nombreEnvase(producto), n)}`, detalle: `${fmtG(Math.round(g))} · envase de ${fmt(producto.packG)} g`, n };
  }
  if (producto?.unitG) {
    const n = Math.max(1, Math.round(g / producto.unitG));
    return { principal: `${n} ${plural(producto.unitName || 'unidad', n)}`, detalle: fmtG(Math.round(g)), n };
  }
  return { principal: fmtG(Math.round(g)), detalle: '' };
}
