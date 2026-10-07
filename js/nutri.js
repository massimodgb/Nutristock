// Cálculos de nutrición y utilidades del plan.

export const NUTRS = [
  { k: 'kcal', name: 'Calorías', unit: 'kcal' },
  { k: 'prot', name: 'Proteína', unit: 'g' },
  { k: 'carb', name: 'Carbohidratos', unit: 'g' },
  { k: 'sug', name: '· azúcares', unit: 'g' },
  { k: 'fat', name: 'Grasas', unit: 'g' },
  { k: 'sat', name: '· saturadas', unit: 'g' },
  { k: 'fib', name: 'Fibra', unit: 'g' },
  { k: 'salt', name: 'Sal', unit: 'g' },
];

// Los 7 grupos de tu plan con su color
export const GROUPS = {
  lacteo: { name: 'Lácteos', color: '#3b82f6' },
  verdura: { name: 'Verduras', color: '#22c55e' },
  fruta: { name: 'Frutas', color: '#f97316' },
  almidon: { name: 'Almidones', color: '#a16207' },
  proteina: { name: 'Proteínas', color: '#ef4444' },
  grasa: { name: 'Grasas', color: '#eab308' },
  suplemento: { name: 'Suplementos', color: '#a855f7' },
  otro: { name: 'Otros', color: '#8b8b8b' },
};

// Factor de cocción: el propio o el del alimento base al que equivale
export function cookFactor(food, byId) {
  if (food.factor) return food.factor;
  const gen = food.genericId && byId[food.genericId];
  return gen?.factor || null;
}

// Convierte lo que pesaste en el plato a gramos "como se compra" (crudo/seco)
export function toRaw(food, grams, pesadoCrudo, byId) {
  const f = cookFactor(food, byId);
  return f && !pesadoCrudo ? grams / f : grams;
}

export function nutrFor(food, rawG) {
  const out = {};
  for (const { k } of NUTRS) out[k] = ((food.n?.[k] || 0) * rawG) / 100;
  return out;
}

export function sumN(list) {
  const out = Object.fromEntries(NUTRS.map(({ k }) => [k, 0]));
  for (const n of list) for (const { k } of NUTRS) out[k] += n?.[k] || 0;
  return out;
}

// Alimentos que permite un bloque del plan → [{ id, g }]
export function blockFoods(block, plan) {
  const out = [];
  for (const a of block.alimentos || []) {
    if (a.lista) for (const id of plan.listas?.[a.lista] || []) out.push({ id, g: a.g });
    else out.push({ id: a.f, g: a.g });
  }
  return out;
}

export function visibleFood(food, prefs) {
  return food && !(prefs.excluirMar && food.mar);
}

// Bloques de una comida según la opción elegida
export function mealBlocks(meal, optionId) {
  const opt = meal.opciones?.find(o => o.id === optionId) || meal.opciones?.[0];
  return [...(meal.bloques || []), ...(opt?.bloques || [])];
}

// Estimación de lo que aporta el plan (usa el primer alimento visible de cada bloque)
export function blockRef(block, plan, byId, prefs) {
  const first = blockFoods(block, plan).find(x => visibleFood(byId[x.id], prefs));
  if (!first) return sumN([]);
  const food = byId[first.id];
  return nutrFor(food, toRaw(food, first.g, false, byId));
}

export function planRef(plan, byId, prefs, choices = {}) {
  return sumN(plan.comidas.map(m =>
    sumN(mealBlocks(m, choices[m.id]).map(b => blockRef(b, plan, byId, prefs)))));
}

// ---------- formato ----------
export const fmt = (x, d = 0) =>
  (x ?? 0).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function fmtG(g, food) {
  if (food?.unitG && g >= food.unitG) {
    const u = g / food.unitG;
    return `${fmt(g)} g · ${fmt(u, u < 10 ? 1 : 0)} ${food.unitName || 'ud'}${u >= 2 && !food.unitName?.endsWith('s') ? 's' : ''}`;
  }
  return g >= 1000 ? `${fmt(g / 1000, 2)} kg` : `${fmt(g)} g`;
}

export const parseNum = s => {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

export function todayStr(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
export function daysUntil(dateStr) {
  return Math.round((new Date(dateStr + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 864e5);
}
export function fmtDate(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', opts);
}
