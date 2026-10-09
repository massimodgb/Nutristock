// Base de datos local (vive en el teléfono). Más adelante se sincronizará con Supabase.
import { Dexie, liveQuery, useState, useEffect } from './lib.js';
import { FOODS, BASICOS } from './data/foods.js';

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

// Descuenta gramos en crudo de la despensa: primero lo que caduca antes.
// Devuelve qué se descontó de cada lote para poder deshacerlo.
export async function deductStock(foodIds, rawG) {
  const deducted = [];
  await db.transaction('rw', db.lots, async () => {
    const lots = (await db.lots.where('foodId').anyOf(foodIds).toArray())
      .filter(l => l.g > 0)
      .sort((a, b) => {
        const pa = foodIds.indexOf(a.foodId), pb = foodIds.indexOf(b.foodId);
        if (pa !== pb) return pa - pb;
        return (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.addedAt - b.addedAt;
      });
    let left = rawG;
    for (const l of lots) {
      if (left <= 0) break;
      const take = Math.min(l.g, left);
      await db.lots.update(l.id, { g: round1(l.g - take) });
      deducted.push({ lotId: l.id, g: take });
      left -= take;
    }
  });
  return deducted;
}

export async function restoreStock(deducted = []) {
  await db.transaction('rw', db.lots, async () => {
    for (const d of deducted) {
      const l = await db.lots.get(d.lotId);
      if (l) await db.lots.update(l.id, { g: round1(l.g + d.g) });
    }
  });
}

export async function deleteLog(log) {
  await restoreStock(log.deducted);
  await db.logs.delete(log.id);
}

// ---------- Copia de seguridad ----------
const TABLES = ['foods', 'lots', 'basicos', 'shopping', 'plans', 'logs', 'weights', 'settings', 'workouts', 'marcas'];

export async function exportAll() {
  const out = { app: 'nutristock', version: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) out[t] = await db[t].toArray();
  return out;
}

export async function importAll(data) {
  if (data?.app !== 'nutristock') throw new Error('Este archivo no es una copia de NutriStock');
  await db.transaction('rw', TABLES.map(t => db[t]), async () => {
    for (const t of TABLES) {
      await db[t].clear();
      if (data[t]?.length) await db[t].bulkPut(data[t]);
    }
  });
}

// ---------- utilidades ----------
export const round1 = x => Math.round(x * 10) / 10;
export function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
