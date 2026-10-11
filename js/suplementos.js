// Suplementos: tu lista (magnesio, omega 3, electrolitos, creatina…) con su marca y lo que aporta cada toma
// (copiado de la etiqueta), y lo que tomaste cada día.
// Se guarda en ajustes:
//   'suplementos' = la lista: { id, nombre, marca, unidad, porcion, habitual, valores, notas }
//       porcion  = la cantidad a la que se refieren los números de la etiqueta (ej.: 2 cápsulas)
//       valores  = lo que aporta esa cantidad: { mg: 200, k: 300, … } (claves de NUTR_SUPL)
//       habitual = lo que tomas normalmente al día (ej.: 1 cápsula); es lo que se marca con un toque en Hoy
//       (las listas antiguas solo tenían { id, nombre, dosis } en texto: siguen funcionando, sin números)
//   'supl:FECHA' = { id: { t: hora, cant: cuánto tomaste } }
//       (las antiguas guardaban solo la hora: cuentan como la cantidad habitual)
import { getSetting, setSetting, db } from './db.js';
import { MICROS } from './data/micros.js';
import { parseNum } from './nutri.js';

export const SUPL_INICIALES = [
  { id: 'creatina', nombre: 'Creatina', marca: '', unidad: 'g', porcion: 7, habitual: 7, valores: {} },
  { id: 'magnesio', nombre: 'Magnesio', dosis: '' },
  { id: 'omega-3', nombre: 'Omega 3', dosis: '' },
  { id: 'electrolitos', nombre: 'Electrolitos', dosis: '' },
];

// Nutrientes que solo se cuentan desde los suplementos (la comida no los tiene calculados)
export const SUPL_EXTRA = [
  { k: 'na', name: 'Sodio', unit: 'mg', dec: 0 },
  { k: 'zn', name: 'Zinc', unit: 'mg', dec: 1 },
  { k: 'o3', name: 'Omega 3 (EPA + DHA)', unit: 'mg', dec: 0 },
];
const porClave = Object.fromEntries([...MICROS, ...SUPL_EXTRA].map(m => [m.k, m]));
// Orden en el que se piden en el formulario (lo más habitual en suplementos deportivos primero)
export const NUTR_SUPL = ['mg', 'k', 'na', 'ca', 'zn', 'fe', 'vd', 'vc', 'b12', 'o3'].map(k => porClave[k]);

// Formas de tomarlo: [clave, singular, plural, abreviatura]
export const UNIDADES = [
  ['capsula', 'cápsula', 'cápsulas', 'cáps.'],
  ['comprimido', 'comprimido', 'comprimidos', 'comp.'],
  ['scoop', 'cacito', 'cacitos', 'cacitos'],
  ['sobre', 'sobre', 'sobres', 'sobres'],
  ['g', 'g', 'g', 'g'],
  ['ml', 'ml', 'ml', 'ml'],
  ['gota', 'gota', 'gotas', 'gotas'],
];
const unidadDe = u => UNIDADES.find(x => x[0] === u) || UNIDADES[0];
const num = (v, dec = 1) => {
  const r = Math.round(v * 10 ** dec) / 10 ** dec;
  return String(r).replace('.', ',');
};

// "cápsula" / "cápsulas" según la cantidad
export const nombreUnidad = (cant, unidad) => unidadDe(unidad)[cant === 1 ? 1 : 2];

// "2 cápsulas", "1 sobre", "7 g"
export function textoCant(cant, unidad) {
  const [, uno, varios] = unidadDe(unidad);
  return `${num(cant)} ${cant === 1 ? uno : varios}`;
}

// Lo que tomas normalmente, en texto (o la dosis antigua escrita a mano)
export function textoDosis(s) {
  if (s.unidad) return textoCant(cantHabitual(s), s.unidad);
  return s.dosis || '';
}

export const cantHabitual = s => s.habitual ?? s.porcion ?? 1;
export const tieneDatos = s => !!(s.porcion && s.valores && Object.values(s.valores).some(v => v > 0));

// Cuánto tomaste según lo guardado ese día (las marcas antiguas = la cantidad habitual)
export function cantTomada(s, v) {
  if (v == null) return 0;
  if (typeof v === 'object') return v.cant ?? cantHabitual(s);
  return cantHabitual(s);
}

// Lo que aporta una cantidad: { mg: 200, … } (null si no hay datos de la etiqueta)
export function aporteSupl(s, cant) {
  if (!tieneDatos(s) || !cant) return null;
  const out = {};
  for (const [k, v] of Object.entries(s.valores)) if (v > 0) out[k] = v * cant / s.porcion;
  return out;
}

// Suma de lo que aportan los suplementos de un día: { mg: 200, k: 300, … }
export function aporteDia(lista, tomados) {
  const total = {};
  for (const s of lista || []) {
    const a = aporteSupl(s, cantTomada(s, tomados?.[s.id]));
    if (a) for (const [k, v] of Object.entries(a)) total[k] = (total[k] || 0) + v;
  }
  return total;
}

// Media diaria de lo que aportan los suplementos en unos días concretos (los mismos días que cuentan para la comida)
export function aporteMedio(lista, tomadosPorFecha, fechas) {
  const media = {};
  if (!fechas.length) return media;
  for (const f of fechas) {
    for (const [k, v] of Object.entries(aporteDia(lista, tomadosPorFecha[f]))) media[k] = (media[k] || 0) + v / fechas.length;
  }
  return media;
}

// "magnesio 200 mg · potasio 300 mg"
export function textoAporte(a, max = 99) {
  if (!a) return '';
  return NUTR_SUPL.filter(m => a[m.k] > 0).slice(0, max)
    .map(m => `${m.name.charAt(0).toLowerCase() + m.name.slice(1)} ${num(a[m.k], m.dec)} ${m.unit}`).join(' · ');
}

export const listaSupl = () => getSetting('suplementos', SUPL_INICIALES);
export const guardarListaSupl = lista => setSetting('suplementos', lista);
export const tomadosDia = fecha => getSetting('supl:' + fecha, {});

// Apunta lo que tomaste ese día (cant = 0 o null lo quita)
export async function marcarSupl(fecha, id, cant) {
  const t = { ...(await tomadosDia(fecha)) };
  if (cant > 0) t[id] = { t: Date.now(), cant }; else delete t[id];
  await setSetting('supl:' + fecha, t);
}

// Para informes y Progreso: { fecha: { id: … } } entre dos fechas
export async function tomadosEntre(desde, hasta) {
  const filas = await db.settings.where('key').between('supl:' + desde, 'supl:' + hasta, true, true).toArray();
  return Object.fromEntries(filas.map(f => [f.key.slice(5), f.value || {}]));
}

export const idSupl = nombre => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'supl-' + Date.now();

// ---------- Leer la etiqueta pegada (Live Text del iPhone) ----------
// Busca cada mineral o vitamina y el número con su unidad que va DETRÁS de su nombre (en la misma línea,
// o en la siguiente, porque Live Text a veces separa las columnas). Entiende español e inglés.
// Devuelve { valores, porcion, unidad } con lo que encuentre.
const REGLAS_SUPL = [
  ['mg', /magnesi/g], ['k', /potasi|potassium/g], ['na', /sodio|sodium/g], ['ca', /calci/g],
  ['zn', /\b(zinc|cinc)\b/g], ['fe', /hierro|\biron\b/g],
  ['vd', /vitamina?\s*d\s*3?\b|vit\.?\s*d\s*3?\b|colecalciferol|cholecalciferol/g],
  ['vc', /vitamina?\s*c\b|vit\.?\s*c\b|[aá]cido\s+asc[oó]rbico|ascorbic\s+acid/g],
  ['b12', /b\s?12\b|cobalamina|cobalamin\b/g],
  ['epa', /\bepa\b|e[i]?cosapenta[e]?no/g], ['dha', /\bdha\b|docosahexa[e]?no/g], ['o3', /omega[\s-]*3/g],
];
// Líneas que dicen la cantidad del mineral "de verdad" (no la del compuesto: bisglicinato, citrato…)
const ELEMENTAL = /elemental|de los cuales|de las cuales|aporta|equivalente|que proporciona|providing|provides/;
const NUM_UNIDAD = /(\d+(?:[.,]\d+)?)\s*(mg|µg|μg|ug|mcg|g|ui|iu)\b/;
// Formas de tomarlo escritas en la etiqueta (español e inglés)
const UNIDAD_TEXTO = 'c[aá]psulas?|capsules?|softgels?|perlas?|comprimidos?|tabletas?|tablets?|sobres?|sachets?|cacitos?|scoops?|gotas?|drops?|g|ml';
const unidadDeTexto = u => (/c[aá]psula|capsule|softgel|perla/.test(u) ? 'capsula' : /comprimido|tableta|tablet/.test(u) ? 'comprimido'
  : /sobre|sachet/.test(u) ? 'sobre' : /cacito|scoop/.test(u) ? 'scoop' : /gota|drop/.test(u) ? 'gota' : u);

// Pasa el número a la unidad del nutriente (mg o µg); la vitamina D también puede venir en UI (40 UI = 1 µg)
function convertir(valor, unidad, destino) {
  const u = unidad.replace(/μ|mc/, 'µ').replace(/^ug$/, 'µg');
  if (u === 'ui' || u === 'iu') return destino === 'µg' ? valor / 40 : null;
  const enMg = u === 'g' ? valor * 1000 : u === 'µg' ? valor / 1000 : valor;
  return destino === 'µg' ? enMg * 1000 : enMg;
}

// ¿Está esta posición dentro de un paréntesis? "Vitamina C (ascorbato de sodio)": el sodio no es un dato aparte
const dentroDeParentesis = (l, pos) => (l.slice(0, pos).match(/\(/g) || []).length > (l.slice(0, pos).match(/\)/g) || []).length;

export function parseEtiquetaSupl(texto) {
  const lineas = String(texto || '').toLowerCase().split(/\n+/).map(l => l.trim()).filter(Boolean);
  const hallados = {}; // clave → { v, elemental }
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // Todos los nombres de nutrientes de la línea (fuera de paréntesis), en orden
    const marcas = [];
    for (const [k, re] of REGLAS_SUPL) for (const m of l.matchAll(re)) if (!dentroDeParentesis(l, m.index)) marcas.push([k, m.index]);
    marcas.sort((a, b) => a[1] - b[1]);
    marcas.forEach(([k, pos], j) => {
      if (j > 0 && marcas[j - 1][0] === k) return; // el mismo nutriente dos veces seguidas: ya contado
      // El número va entre este nombre y el siguiente ("Calcio 800 mg Magnesio 300 mg")
      const tramo = l.slice(pos, marcas[j + 1]?.[1] ?? l.length);
      let m = tramo.match(NUM_UNIDAD);
      if (!m && j === marcas.length - 1) m = lineas[i + 1]?.match(new RegExp('^' + NUM_UNIDAD.source));
      const v = m ? convertir(parseNum(m[1]), m[2], porClave[k]?.unit || 'mg') : null;
      if (v == null) return;
      const elemental = ELEMENTAL.test(l.slice(0, pos + tramo.length));
      // Nos quedamos con la primera, salvo que luego aparezca la del mineral "elemental"
      if (!hallados[k] || (elemental && !hallados[k].elemental)) hallados[k] = { v, elemental };
    });
    // Sal en vez de sodio (electrolitos): 1 g de sal = 400 mg de sodio
    if (!hallados.na && /^sal\b/.test(l)) {
      const m = l.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
      if (m) hallados.sal = { v: parseNum(m[1]) * 400 };
    }
  }
  const valores = {};
  for (const [k, { v }] of Object.entries(hallados)) if (porClave[k]) valores[k] = Math.round(v * 10) / 10;
  if (valores.na == null && hallados.sal) valores.na = Math.round(hallados.sal.v);
  // Omega 3: lo que cuenta es EPA + DHA; si vienen por separado, se suman
  if (hallados.epa || hallados.dha) valores.o3 = Math.round((hallados.epa?.v || 0) + (hallados.dha?.v || 0));
  // "Por dosis diaria (2 cápsulas)", "por sobre", "each softgel provides", "per 2 tablets"…
  let porcion = null, unidad = null;
  const p = lineas.join(' ').match(new RegExp(`(?:\\bpor|\\bper|\\beach|\\bcada)\\s+(?:dosis(?:\\s+diaria)?|toma|porci[oó]n|raci[oó]n|serving|daily\\s+dose)?\\s*[(:]?\\s*(?:de\\s+)?(\\d+(?:[.,]\\d+)?)?\\s*(${UNIDAD_TEXTO})\\b`));
  if (p) { porcion = p[1] ? parseNum(p[1]) : 1; unidad = unidadDeTexto(p[2]); }
  return { valores, porcion, unidad };
}

// "2 capsules", "1 softgel (1 g)", "5 g" (lo que Open Food Facts llama ración) → { porcion, unidad }
export function porcionDeTexto(texto) {
  const m = String(texto || '').toLowerCase().match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIDAD_TEXTO})\\b`));
  return m ? { porcion: parseNum(m[1]), unidad: unidadDeTexto(m[2]) } : null;
}

// ---------- Código de barras → Open Food Facts ----------
// Muchos suplementos están (nombre y marca), pero pocos traen los números de minerales y vitaminas:
// se usan si vienen (por ración o en el texto de la etiqueta) y, si no, toca pegar la etiqueta.
// Devuelve null si no está; lanza un error si no hay conexión.
const OFF_SUPL = { mg: 'magnesium', k: 'potassium', na: 'sodium', ca: 'calcium', zn: 'zinc', fe: 'iron', vd: 'vitamin-d', vc: 'vitamin-c', b12: 'vitamin-b12', o3: 'omega-3-fat' };
export async function buscarSuplemento(codigo) {
  const campos = 'product_name,product_name_es,brands,serving_size,ingredients_text,ingredients_text_es,nutriments';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json?fields=${campos}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Open Food Facts no responde (' + res.status + ')');
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product, nu = p.nutriments || {};
  // 1) Números por ración (Open Food Facts los guarda en gramos)
  const porRacion = {}, por100 = {};
  const leer = (k, campo, destino) => {
    const unidad = porClave[k].unit;
    const x = Number(nu[campo + '_' + destino]);
    return Number.isFinite(x) && x > 0 && nu[campo + '_' + destino] !== '' ? convertir(x, 'g', unidad) : null;
  };
  for (const [k, campo] of Object.entries(OFF_SUPL)) {
    const s = leer(k, campo, 'serving'); if (s != null) porRacion[k] = Math.round(s * 10) / 10;
    const c = leer(k, campo, '100g'); if (c != null) por100[k] = Math.round(c * 10) / 10;
  }
  if (porRacion.o3 == null) {
    const epa = leer('o3', 'eicosapentaenoic-acid', 'serving'), dha = leer('o3', 'docosahexaenoic-acid', 'serving');
    if (epa || dha) porRacion.o3 = Math.round((epa || 0) + (dha || 0));
  }
  const racion = porcionDeTexto(p.serving_size);
  // 2) Lo que diga el texto de la etiqueta
  const texto = parseEtiquetaSupl(p.ingredients_text_es || p.ingredients_text || '');
  let valores = {}, porcion = null, unidad = null;
  if (Object.keys(porRacion).length && racion) { valores = porRacion; porcion = racion.porcion; unidad = racion.unidad; }
  else if (Object.keys(texto.valores).length) { valores = texto.valores; porcion = texto.porcion || racion?.porcion || null; unidad = texto.unidad || racion?.unidad || null; }
  else if (Object.keys(por100).length) { valores = por100; porcion = 100; unidad = 'g'; } // polvos (electrolitos): por 100 g
  return {
    nombre: (p.product_name_es || p.product_name || '').trim(),
    marca: (p.brands || '').split(',')[0].trim(),
    codigo, valores, porcion, unidad,
  };
}
