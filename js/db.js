// Base de datos local (vive en el teléfono). Más adelante se sincronizará con Supabase.
import { Dexie, liveQuery, useState, useEffect } from './lib.js';
import { FOODS, BASICOS } from './data/foods.js';
import { alimentoPorNombre } from './plan-pdf.js';

export const db = new Dexie('nutristock');

db.version(1).stores({
  foods: 'id, name, group, barcode, genericId', // biblioteca: alimentos base + productos tuyos
  lots: '++id, foodId, expiry',                  // despensa: cada compra/paquete es un "lote"
  basicos: 'id, status',                         // sal, especias...: tengo / poco / no
  shopping: '++id, done',                        // lista de la compra (lo que añades a mano)
  plans: 'id',                                   // planes del nutricionista
  logs: '++id, date',                            // diario: cada cosa que comes
  weights: 'date',                               // peso corporal por día
  settings: 'key',                               // preferencias varias
});
// v2: buscar registros por alimento (para recordar el último peso que usaste)
db.version(2).stores({ logs: '++id, date, foodId' });
// v3: entrenos pegados de la entrenadora y marcas (récords de fuerza y benchmarks)
db.version(3).stores({ workouts: '++id, date', marcas: '++id, ejercicio, date' });
// v4: biblioteca de ejercicios (los que añades a mano, y nombres, vídeos y notas que editas)
db.version(4).stores({ ejercicios: 'id' });
// v5: datos de Whoop (recuperación, ciclos, sueño, entrenos), uno por registro
db.version(5).stores({ whoop: 'id, tipo, fecha' });
// v6 (v3, Fase 2): porciones PREPARADAS y pendientes de comer (meal prep). Solo añade una tabla: no toca nada de lo anterior.
// Cada porción = unos gramos de un táper/lote asignados a una comida de un día. No cuentan como comidas
// hasta que las confirmas (entonces se convierten en un registro normal y se descuentan del táper).
db.version(6).stores({ porciones: 'id, date, foodId' });
// v7 (v3, Fase 6): medidas corporales (cintura, cadera…). Varias tomas por sesión; tú eliges la representativa.
db.version(7).stores({ medidas: 'id, fecha, tipo' });

// Números únicos para los registros nuevos (en vez de 1, 2, 3…): así dos aparatos nunca crean el mismo número.
// Es la hora en microsegundos + un poco de azar. Los registros que ya existían conservan su número.
let ultimoId = 0;
export function nuevoId() {
  const id = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), ultimoId + 1);
  ultimoId = id;
  return id;
}
for (const t of ['lots', 'shopping', 'logs', 'workouts', 'marcas', 'porciones', 'medidas']) {
  db[t].hook('creating', function (pk, obj) {
    if (pk == null && obj.id == null) { const id = nuevoId(); obj.id = id; return id; }
  });
}

// Carga los alimentos base la primera vez y los actualiza si cambian en una versión nueva
// (sin pisar los que hayas editado tú, por ejemplo al calibrar un factor de cocción).
export async function seed() {
  await db.transaction('rw', db.foods, db.basicos, async () => {
    const existing = new Map((await db.foods.toArray()).map(f => [f.id, f]));
    const toPut = FOODS.filter(f => {
      const cur = existing.get(f.id);
      return !cur || (cur.source === 'base' && !cur.edited);
    });
    await db.foods.bulkPut(toPut);
    // Productos tuyos sin clasificar (por ejemplo, escaneados antes de que existiera esto)
    const todos = await db.foods.toArray();
    for (const f of todos) {
      if (f.source === 'base' || f.source === 'receta' || f.genericId || f.group === 'hogar') continue;
      const gen = alimentoPorNombre(f.name);
      const g = gen && todos.find(x => x.id === gen);
      if (g) await db.foods.update(f.id, { genericId: gen, ...(!f.group || f.group === 'otro' ? { group: g.group } : {}) });
    }
    if ((await db.basicos.count()) === 0) {
      await db.basicos.bulkAdd(BASICOS.map(name => ({ id: slug(name), name, status: 'tengo' })));
    }
  });
  // Pide al iPhone que no borre los datos aunque falte espacio
  try { await navigator.storage?.persist?.(); } catch {}
}

// ---------- Ajustes ----------
export async function getSetting(key, def) {
  const row = await db.settings.get(key);
  return row ? row.value : def;
}
export const setSetting = (key, value) => db.settings.put({ key, value });

export const DEFAULT_PREFS = { excluirMar: true, avisoCaducaDias: 3, aguaObjetivo: 3000, aguaVaso: 250 };
export async function getPrefs() {
  return { ...DEFAULT_PREFS, ...(await getSetting('prefs', {})) };
}

export async function activePlan() {
  const id = await getSetting('planActivo', null);
  return id ? db.plans.get(id) : null;
}

// ---------- Hook: datos que se actualizan solos cuando cambia la base de datos ----------
export function useLive(query, deps = []) {
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: e => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

// ---------- Despensa ----------
// Lotes que sirven para un alimento: los suyos y los de productos "equivalentes"
// (ej. "Pechuga de pollo Mercadona" cuenta como "Pechuga de pollo").
export function candidateIds(food, foods) {
  const root = food.genericId || food.id;
  const ids = foods.filter(f => f.id === root || f.genericId === root).map(f => f.id);
  // primero el propio alimento elegido
  return [food.id, ...ids.filter(id => id !== food.id)];
}

export function stockMap(lots, foods) {
  // Gramos disponibles por alimento, y también agregados por alimento base
  const byFood = {};
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  for (const l of lots) {
    if (l.g <= 0) continue;
    for (const key of new Set([l.foodId, byId[l.foodId]?.genericId].filter(Boolean))) {
      const s = byFood[key] ||= { g: 0, nextExpiry: null, lots: 0 };
      s.g += l.g;
      s.lots++;
      if (l.expiry && (!s.nextExpiry || l.expiry < s.nextExpiry)) s.nextExpiry = l.expiry;
    }
  }
  return byFood;
}

// Cada "lote" es un envase (una bolsa, un paquete, un bote) o, si el producto no tiene envase, una cantidad suelta.
// Orden de gasto: primero el envase ABIERTO, luego el que caduca antes, luego el más antiguo.
export function ordenGasto(a, b) {
  return (!!b.abierto - !!a.abierto) || (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.addedAt - b.addedAt;
}

// Descuenta gramos en crudo de la despensa. Cuando un envase se acaba, se marca como terminado
// y el siguiente pasa a estar abierto. Devuelve qué se descontó de cada lote para poder deshacerlo.
export async function deductStock(foodIds, rawG) {
  const deducted = [];
  await db.transaction('rw', db.lots, async () => {
    const lots = (await db.lots.where('foodId').anyOf(foodIds).toArray())
      .filter(l => l.g > 0)
      .sort((a, b) => {
        const pa = foodIds.indexOf(a.foodId), pb = foodIds.indexOf(b.foodId);
        return pa !== pb ? pa - pb : ordenGasto(a, b);
      });
    let left = rawG;
    for (const l of lots) {
      if (left <= 0) break;
      const take = Math.min(l.g, left);
      const queda = round1(l.g - take);
      await db.lots.update(l.id, { g: queda, abierto: queda > 0, ...(queda <= 0 ? { terminado: Date.now() } : {}) });
      deducted.push({ lotId: l.id, g: take, estabaAbierto: !!l.abierto });
      left -= take;
    }
  });
  return deducted;
}

// No hay bastante en la despensa para descontar lo que se pide (se lanza ANTES de tocar nada)
export class FaltaStock extends Error {
  constructor(nombre, necesario, disponible) {
    super(`${nombre ? nombre + ': ' : ''}en la despensa constan ${round1(disponible)} g y hacen falta ${round1(necesario)} g.`);
    this.name = 'FaltaStock';
    this.necesario = round1(necesario);
    this.disponible = round1(disponible);
    this.faltan = round1(necesario - disponible);
  }
}
// Gramos que hay ahora en la despensa de unos productos
export async function stockDisponible(foodIds) {
  const lots = await db.lots.where('foodId').anyOf(foodIds).toArray();
  return round1(lots.reduce((s, l) => s + Math.max(0, l.g || 0), 0));
}
// Descuento EXACTO: o hay suficiente y se descuenta todo, o no se toca nada y se avisa de lo que falta.
// (deductStock, el de siempre, descuenta lo que haya: se sigue usando al registrar comida normal, donde
// la app avisa de que "se descontará lo que hay".) Las preparaciones y los tápers usan este.
export async function deductStockExacto(foodIds, rawG, nombre = '') {
  let deducted;
  await db.transaction('rw', db.lots, async () => {
    const disponible = await stockDisponible(foodIds);
    if (disponible + 0.05 < rawG) throw new FaltaStock(nombre, rawG, disponible);
    deducted = await deductStock(foodIds, rawG);
  });
  return deducted;
}

// "Lo compré y no lo apunté": añade a la despensa SOLO lo que falte en ese momento (se recalcula dentro de la
// operación). Un doble toque o un reintento no duplican la compra: si ya hay bastante, no añade nada (devuelve 0).
export async function anadirCompraFaltante({ foodId, ids, necesario, origen = 'compra sin apuntar (al cocinar)' }) {
  let anadido = 0;
  await db.transaction('rw', db.lots, async () => {
    const faltan = round1(necesario - await stockDisponible(ids?.length ? ids : [foodId]));
    if (faltan <= 0.05) return;
    await db.lots.add({ foodId, g: faltan, abierto: false, addedAt: Date.now(), origen, compraFaltante: { necesario: round1(necesario), g: faltan } });
    anadido = faltan;
  });
  return anadido;
}

export async function restoreStock(deducted = []) {
  await db.transaction('rw', db.lots, async () => {
    for (const d of deducted) {
      const l = await db.lots.get(d.lotId);
      if (l) await db.lots.update(l.id, { g: round1(l.g + d.g), abierto: d.estabaAbierto ?? l.abierto, terminado: null });
    }
  });
}

// Merma: lo que sobra o se tira de un envase. NO es comida (no suma calorías), pero queda apuntado en el envase.
// Devuelve lo que se quitó, para poder deshacerlo (por ejemplo si borras el registro que lo cerró).
export async function mermarLote(lotId, g, motivo = 'tirado') {
  const l = await db.lots.get(lotId);
  if (!l || !(g > 0) || !(l.g > 0)) return null;
  const quita = round1(Math.min(l.g, g)), queda = round1(l.g - quita), ts = Date.now();
  await db.lots.update(lotId, {
    g: queda, abierto: queda > 0, ...(queda <= 0 ? { terminado: ts } : {}),
    mermas: [...(l.mermas || []), { g: quita, motivo, ts }],
  });
  return { lotId, g: quita, ts, estabaAbierto: !!l.abierto };
}
export async function deshacerMermas(mermas = []) {
  for (const m of mermas) {
    const l = await db.lots.get(m.lotId);
    if (l) await db.lots.update(l.id, { g: round1(l.g + m.g), abierto: m.estabaAbierto || l.abierto, terminado: null, mermas: (l.mermas || []).filter(x => x.ts !== m.ts) });
  }
}
// "Terminé el envase": lo que quede en el último envase usado pasa a merma
export async function terminarEnvase(deducted = []) {
  const ultimo = deducted[deducted.length - 1];
  if (!ultimo) return [];
  const m = await mermarLote(ultimo.lotId, Infinity, 'sobrante al terminar');
  return m ? [m] : [];
}

// Resumen del stock de un producto en envases: "2 cerrados + 1 abierto (320 g)"
export function resumenStock(food, lots) {
  const mios = lots.filter(l => l.foodId === food.id && l.g > 0);
  const total = mios.reduce((s, l) => s + l.g, 0);
  const pack = food.packG;
  if (!pack) return { total, envases: null, cerrados: 0, abiertos: [], mios };
  const abiertos = mios.filter(l => l.abierto || l.g < pack * 0.98);
  const cerrados = mios.length - abiertos.length;
  return { total, envases: total / pack, cerrados, abiertos, mios };
}

export async function deleteLog(log) {
  // Devolver a la despensa (y deshacer el "terminé el envase") y borrar el registro: todo o nada
  await db.transaction('rw', db.lots, db.logs, async () => {
    await deshacerMermas(log.merma);
    await restoreStock(log.deducted);
    await db.logs.delete(log.id);
  });
}

// ---------- Copia de seguridad ----------
const TABLES = ['foods', 'lots', 'basicos', 'shopping', 'plans', 'logs', 'weights', 'settings', 'workouts', 'marcas', 'ejercicios', 'whoop', 'porciones', 'medidas'];

export async function exportAll() {
  const out = { app: 'nutristock', version: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) out[t] = await db[t].toArray();
  return out;
}

// Restaurar = dejar los datos EXACTAMENTE como en la copia: se vacían TODAS las tablas (también las que una copia
// antigua no trae, como las porciones o medidas de V3) y se cargan las de la copia. Todo en una sola operación:
// si algo falla o se cierra la app a medias, no cambia nada.
export async function importAll(data) {
  if (data?.app !== 'nutristock') throw new Error('Este archivo no es una copia de NutriStock');
  await db.transaction('rw', TABLES.map(t => db[t]), async () => {
    for (const t of TABLES) {
      await db[t].clear();
      if (Array.isArray(data[t]) && data[t].length) await db[t].bulkPut(data[t]);
    }
  });
}

// ---------- utilidades ----------
export const round1 = x => Math.round(x * 10) / 10;
export function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
