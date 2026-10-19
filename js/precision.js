// Precisión de los cálculos (v3, Fase 1):
// - método de cocción con su factor (el de la tabla o el que TÚ mides: airfryer, horno…)
// - nutrientes que faltan (no se cuentan como 0 en silencio)
// - de dónde sale cada dato (tabla, etiqueta, Open Food Facts, receta, estimación)
// - editar un registro antiguo sin cambiar los valores con los que se apuntó
// - lista de registros y productos que conviene revisar (solo informa, no cambia nada)
import { cookFactor, round1Obj } from './nutri.js';

// Formas de cocinar. Solo "tabla" trae factor de serie; las demás se miden una vez
// (pesas en crudo, cocinas y vuelves a pesar) y la app lo recuerda para ese alimento.
export const METODOS = [
  { id: 'hervido', name: 'Hervido / cocido' },
  { id: 'plancha', name: 'Plancha / sartén' },
  { id: 'horno', name: 'Horno' },
  { id: 'airfryer', name: 'Airfryer' },
  { id: 'guiso', name: 'Guisado' },
  { id: 'micro', name: 'Microondas' },
];
export const nombreMetodo = id => METODOS.find(m => m.id === id)?.name || 'Factor de la ficha';

// Las medidas se guardan por PRODUCTO (su id): medir "Patata" no cambia "Patatas gajo congeladas X".
// Ajuste: settings.coccion = { [idProducto]: { metodos: { airfryer: 0.5 }, ultimo: 'airfryer' } }
// Un producto de marca sin medida propia puede USAR la de su alimento base, pero solo si la eliges tú.
// Los tápers y recetas (ya cocinados) nunca llevan factor.
export const raizDe = food => food?.genericId || food?.id;

export function medidasDe(food, coccion = {}) {
  if (!food || food.source === 'receta') return { propias: {}, base: {}, ultimo: null };
  const propias = coccion[food.id]?.metodos || {};
  const base = food.genericId && food.genericId !== food.id ? coccion[food.genericId]?.metodos || {} : {};
  return { propias, base, ultimo: propias[coccion[food.id]?.ultimo] ? coccion[food.id].ultimo : null };
}

// Factor a usar con un método: el medido para ESTE producto, o el de su alimento base si lo has elegido,
// o (sin método) el de la ficha / alimento base de la tabla
export function factorPara(food, byId, metodo, coccion = {}) {
  const { propias, base } = medidasDe(food, coccion);
  if (metodo && propias[metodo]) return { factor: propias[metodo], medido: true, de: 'propio' };
  if (metodo && base[metodo]) return { factor: base[metodo], medido: true, de: 'base' };
  return { factor: food?.source === 'receta' ? null : cookFactor(food, byId), medido: false };
}

export function rawDe(food, g, { crudo, metodo, coccion, byId }) {
  if (crudo) return g;
  const { factor } = factorPara(food, byId, metodo, coccion);
  return factor ? g / factor : g;
}

// Guarda un factor medido (peso cocinado ÷ peso crudo) para ese producto y método
export function conMedida(coccion = {}, food, metodo, crudoG, cocidoG) {
  return conFactor(coccion, food.id, metodo, Math.round((cocidoG / crudoG) * 100) / 100, true);
}
// Cambia (o borra, con factor null) el factor de un método de un producto
export function conFactor(coccion = {}, foodId, metodo, factor, marcarUltimo = false) {
  const actual = coccion[foodId] || { metodos: {} };
  const metodos = { ...actual.metodos };
  if (factor > 0) metodos[metodo] = factor; else delete metodos[metodo];
  const ultimo = marcarUltimo ? metodo : metodos[actual.ultimo] ? actual.ultimo : null;
  return { ...coccion, [foodId]: { metodos, ultimo } };
}

// ---------- Datos que faltan ----------
// Solo los cuatro principales: un producto sin grasa o sin kcal descuadra el día.
export const PRINCIPALES = ['kcal', 'prot', 'carb', 'fat'];
const vacio = v => v == null || v === '' || !Number.isFinite(Number(v));
export function faltanDatos(food) {
  if (!food) return [];
  const f = new Set(food.faltan || []);
  for (const k of PRINCIPALES) if (vacio(food.n?.[k])) f.add(k);
  return PRINCIPALES.filter(k => f.has(k));
}
export const NOMBRE_NUT = { kcal: 'calorías', prot: 'proteína', carb: 'carbohidratos', fat: 'grasas' };
export const textoFaltan = ks => ks.map(k => NOMBRE_NUT[k]).join(', ');

// Faltan datos en un registro: lo que se guardó al apuntarlo o, en los antiguos, lo que le falta hoy al producto
export const faltanLog = (log, byId) => (log.aprox ? [] : log.faltan || faltanDatos(byId[log.foodId]));

// ---------- De dónde sale el dato ----------
export function fuenteDe(food, log) {
  if (log?.aprox) return { texto: 'Estimación de un plato típico', certeza: 'estimado' };
  if (!food) return { texto: 'Producto borrado (se usan los valores que se guardaron)', certeza: 'guardado' };
  switch (food.source) {
    case 'base': return { texto: 'Tabla de la app (BEDCA / USDA, redondeado)', certeza: 'aproximado' };
    case 'off': return { texto: 'Open Food Facts (base de datos abierta)', certeza: 'etiqueta' };
    case 'livetext': return { texto: 'Tu etiqueta (texto pegado)', certeza: 'etiqueta' };
    case 'manual': return { texto: 'Escrito a mano por ti', certeza: 'etiqueta' };
    case 'receta': return food.ingredientes?.length === 1
      ? { texto: 'Tu preparación (pesada en crudo y cocinada)', certeza: 'medido' }
      : { texto: 'Tu receta (calculada con sus ingredientes)', certeza: 'medido' };
    default: return { texto: 'Producto tuyo', certeza: 'etiqueta' };
  }
}

// Factor que se usó en un registro (los nuevos lo guardan; los antiguos se deducen de sus gramos)
export function factorDeLog(log) {
  if (log.crudo || !log.g || !log.rawG) return null;
  if (log.factor) return log.factor;
  const f = log.g / log.rawG;
  return Math.abs(f - 1) < 0.005 ? null : Math.round(f * 100) / 100;
}

// kcal por 100 g (en crudo / como se compra) con las que se calculó
export const kcal100DeLog = log => (log.rawG ? (log.n?.kcal || 0) * 100 / log.rawG : null);

// ---------- Editar sin cambiar la historia ----------
// Cambiar los gramos de un registro escala SUS valores (los de cuando se apuntó) y mantiene su factor.
// Si no se puede (registro sin gramos), devuelve null.
export function escalarLog(log, g) {
  if (!log.g || !log.rawG || !g) return null;
  const rawG = log.crudo ? g : g * (log.rawG / log.g);
  const k = rawG / log.rawG;
  const n = Object.fromEntries(Object.entries(log.n || {}).map(([key, v]) => [key, (v || 0) * k]));
  return { rawG, n: round1Obj(n) };
}

// ¿La ficha del producto cambió desde que se apuntó? (más de un 3 % en kcal por 100 g)
export function fichaCambiada(log, food) {
  if (!food || log.aprox || !log.rawG) return false;
  const antes = kcal100DeLog(log), ahora = food.n?.kcal;
  if (vacio(ahora) || !antes) return false;
  return Math.abs(antes - ahora) / Math.max(antes, ahora) > 0.03;
}

// ---------- Revisión del historial (solo informa) ----------
// Productos cuyas kcal declaradas no cuadran con sus macros (4/4/9 + 2 por g de fibra).
// NO se sustituyen: solo se avisa, porque la diferencia puede tener motivo (fibra, polialcoholes…).
export function kcalNoCuadran(food) {
  const n = food?.n;
  if (!n || PRINCIPALES.some(k => vacio(n[k])) || !n.kcal) return null;
  const est = 4 * n.prot + 4 * n.carb + 9 * n.fat + 2 * (Number(n.fib) || 0);
  const dif = (n.kcal - est) / n.kcal;
  return Math.abs(dif) > 0.25 && Math.abs(n.kcal - est) > 25 ? Math.round(est) : null;
}

const ASADOS = ['patata', 'boniato']; // factor 1 = hervido; al horno o airfryer pierden mucha agua

export function revisarHistorial(logs, foods) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const registros = [];
  for (const l of logs) {
    if (l.aprox || !l.foodId) continue;
    const food = byId[l.foodId];
    const motivos = [];
    const falta = faltanLog(l, byId);
    if (falta.length) motivos.push(`Sin dato de ${textoFaltan(falta)}: cuenta como 0`);
    if (food && ASADOS.includes(raizDe(food)) && !l.crudo && !l.metodo && !factorDeLog(l)) {
      motivos.push('Si fue al horno o en airfryer, se contó como hervida (pesa la mitad y tiene el doble por gramo)');
    }
    if (fichaCambiada(l, food)) motivos.push(`La ficha cambió después: se apuntó con ${Math.round(kcal100DeLog(l))} kcal/100 g y ahora tiene ${Math.round(food.n.kcal)}`);
    if (motivos.length) registros.push({ log: l, motivos });
  }
  const productos = foods.filter(f => f.source !== 'base' && f.group !== 'hogar').map(f => {
    const motivos = [];
    const falta = faltanDatos(f);
    if (falta.length) motivos.push(`Sin dato de ${textoFaltan(falta)}`);
    const est = kcalNoCuadran(f);
    if (est != null) motivos.push(`Dice ${Math.round(f.n.kcal)} kcal/100 g, pero sus macros dan unas ${est}: ¿columna por ración o error al copiar?`);
    return motivos.length ? { food: f, motivos } : null;
  }).filter(Boolean);
  return { registros: registros.sort((a, b) => b.log.date.localeCompare(a.log.date)), productos };
}

