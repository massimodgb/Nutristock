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
  { k: 'o3', name: 'Omega 3 total', unit: 'mg', dec: 0 },
  { k: 'epa', name: 'EPA', unit: 'mg', dec: 0 },
  { k: 'dha', name: 'DHA', unit: 'mg', dec: 0 },
];
const porClave = Object.fromEntries([...MICROS, ...SUPL_EXTRA].map(m => [m.k, m]));
// Orden en el que se piden en el formulario (lo más habitual en suplementos deportivos primero)
export const NUTR_SUPL = ['mg', 'k', 'na', 'ca', 'zn', 'fe', 'vd', 'vc', 'b12', 'o3', 'epa', 'dha'].map(k => porClave[k]);
// Lo que se resume en "te aporta" (EPA y DHA ya van dentro del omega 3)
const NUTR_RESUMEN = NUTR_SUPL.filter(m => m.k !== 'epa' && m.k !== 'dha');

// Energía y macros (los suplementos NO siempre tienen 0 kcal: gominolas, electrolitos con azúcar, aceites…).
// Si un suplemento las tiene, al marcarlo en Hoy se suman a tus calorías del día.
export const MACROS_SUPL_INFO = [
  { k: 'kcal', name: 'Calorías', unit: 'kcal', dec: 0 }, { k: 'prot', name: 'Proteína', unit: 'g', dec: 1 },
  { k: 'carb', name: 'Hidratos', unit: 'g', dec: 1 }, { k: 'sug', name: '· azúcares', unit: 'g', dec: 1 },
  { k: 'fat', name: 'Grasas', unit: 'g', dec: 1 },
];
const MACRO_CLAVES = MACROS_SUPL_INFO.map(m => m.k);
export const tieneMacros = s => MACRO_CLAVES.some(k => s?.valores?.[k] > 0);

// Formas de tomarlo: [clave, singular, plural, abreviatura]
export const UNIDADES = [
  ['capsula', 'cápsula', 'cápsulas', 'cáps.'],
  ['comprimido', 'comprimido', 'comprimidos', 'comp.'],
  ['scoop', 'cacito', 'cacitos', 'cacitos'],
  ['sobre', 'sobre', 'sobres', 'sobres'],
  ['g', 'g', 'g', 'g'],
  ['ml', 'ml', 'ml', 'ml'],
  ['gota', 'gota', 'gotas', 'gotas'],
  ['gominola', 'gominola', 'gominolas', 'gomin.'],
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
  return NUTR_RESUMEN.filter(m => a[m.k] > 0).slice(0, max)
    .map(m => `${m.name.charAt(0).toLowerCase() + m.name.slice(1)} ${num(a[m.k], m.dec)} ${m.unit}`).join(' · ');
}

export const listaSupl = () => getSetting('suplementos', SUPL_INICIALES);
export const guardarListaSupl = lista => setSetting('suplementos', lista);
export const tomadosDia = fecha => getSetting('supl:' + fecha, {});

// Apunta lo que tomaste ese día (cant = 0 o null lo quita)
export async function marcarSupl(fecha, id, cant) {
  const t = { ...(await tomadosDia(fecha)) };
  if (cant > 0) t[id] = { t: Date.now(), cant }; else delete t[id];
  const s = (await listaSupl()).find(x => x.id === id);
  await db.transaction('rw', db.settings, db.logs, async () => {
    await setSetting('supl:' + fecha, t);
    await sincronizarRegistroSupl(fecha, s || { id }, cant);
  });
}

// Si el suplemento tiene calorías o macros, lo tomado se apunta como un registro del día (comida "supl"),
// así suma en Hoy, Progreso e informes. Sin calorías/macros no se apunta nada. Desmarcar lo quita.
export async function sincronizarRegistroSupl(fecha, s, cant) {
  const previos = (await db.logs.where('date').equals(fecha).toArray()).filter(l => l.suplId === s.id);
  const a = cant > 0 && tieneMacros(s) && s.porcion ? MACRO_CLAVES.reduce((o, k) => ({ ...o, [k]: (s.valores[k] || 0) * cant / s.porcion }), {}) : null;
  if (!a) { if (previos.length) await db.logs.bulkDelete(previos.map(l => l.id)); return; }
  const n = { kcal: a.kcal, prot: a.prot, carb: a.carb, sug: a.sug, fat: a.fat, sat: 0, fib: 0, salt: 0 };
  const redondo = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round((v || 0) * 10) / 10]));
  const datos = {
    date: fecha, mealId: 'supl', name: `${s.nombre}${s.marca ? ' · ' + s.marca : ''} (${textoCant(cant, s.unidad || 'capsula')})`,
    n: redondo, suplId: s.id, cant, fuente: 'suplemento', deducted: [], ts: Date.now(), ...(s.valores?.kcal == null ? { faltan: ['kcal'] } : {}),
  };
  if (previos.length) {
    await db.logs.update(previos[0].id, datos);
    if (previos.length > 1) await db.logs.bulkDelete(previos.slice(1).map(l => l.id));
  } else await db.logs.add(datos);
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
// Devuelve { valores, porcion, unidad, detalles, dudas }:
//   detalles = de qué línea sale cada dato (para que lo compruebes), dudas = lo que conviene revisar.
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
// El aceite de pescado NO es omega 3: es el aceite entero (2000 mg de aceite ≈ 600 mg de EPA + DHA)
const ACEITE = /aceite|fish\s*oil|\boil\b|krill/;
const NUM_UNIDAD = /(\d+(?:[.,]\d+)?)\s*(mg|µg|μg|ug|mcg|g|ui|iu)\b/;
// Formas de tomarlo escritas en la etiqueta (español e inglés)
const UNIDAD_TEXTO = 'c[aá]psulas?|capsules?|caps|softgels?|perlas?|comprimidos?|tabletas?|tablets?|sobres?|sachets?|sticks?|cacitos?|scoops?|cazos?|gominolas?|gummies|gummy|gotas?|drops?|g|ml';
const unidadDeTexto = u => (/c[aá]psula|capsule|caps|softgel|perla/.test(u) ? 'capsula' : /comprimido|tableta|tablet/.test(u) ? 'comprimido'
  : /sobre|sachet|stick/.test(u) ? 'sobre' : /cacito|scoop|cazo/.test(u) ? 'scoop' : /gominola|gumm/.test(u) ? 'gominola' : /gota|drop/.test(u) ? 'gota' : u);

// Pasa el número a la unidad del nutriente (mg o µg); la vitamina D también puede venir en UI (40 UI = 1 µg)
function convertir(valor, unidad, destino) {
  const u = unidad.replace(/μ|mc/, 'µ').replace(/^ug$/, 'µg');
  if (u === 'ui' || u === 'iu') return destino === 'µg' ? valor / 40 : null;
  const enMg = u === 'g' ? valor * 1000 : u === 'µg' ? valor / 1000 : valor;
  return destino === 'µg' ? enMg * 1000 : enMg;
}

// ¿Está esta posición dentro de un paréntesis? "Vitamina C (ascorbato de sodio)": el sodio no es un dato aparte
const dentroDeParentesis = (l, pos) => (l.slice(0, pos).match(/\(/g) || []).length > (l.slice(0, pos).match(/\)/g) || []).length;

// Energía y macros de un suplemento (gominolas, electrolitos con azúcar, aceite de pescado…). No se inventan:
// si la etiqueta no trae las calorías, se quedan vacías y se avisa.
const MACROS_SUPL = [
  ['fat', /^(?:total\s+)?(?:fat|grasas?|l[ií]pidos)\b/], ['carb', /^(?:total\s+)?(?:carbohydrates?|carbs?|hidratos(?:\s+de\s+carbono)?|carbohidratos)\b/],
  ['sug', /^(?:(?:de\s+los\s+cuales|de\s+las\s+cuales|of\s+which|incl(?:\.|udes)?)\s*:?\s+)?(?:total\s+)?(?:sugars?|az[uú]cares)\b/], ['prot', /^(?:protein|prote[ií]nas?)\b/],
];

export function parseEtiquetaSupl(texto) {
  const lineas = String(texto || '').toLowerCase().split(/\n+/).map(l => l.trim()).filter(Boolean);
  const hallados = {}; // clave → { v, elemental, linea }
  const dudas = [];
  let aceiteVisto = null, enUI = false;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // Aceite de pescado: se ignora como omega 3 (se avisa)
    if (ACEITE.test(l) && !/\b(epa|dha)\b/.test(l)) {
      const m = l.match(NUM_UNIDAD);
      if (m) aceiteVisto = `${m[1]} ${m[2]}`;
      if (!/total\s+omega|omega[\s-]*3\s+(?:total|fatty)/.test(l)) continue;
    }
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
      const destino = porClave[k]?.unit || 'mg';
      const v = m ? convertir(parseNum(m[1]), m[2], destino) : null;
      if (v == null) return;
      if (/^(ui|iu)$/.test(m[2])) enUI = true;
      const elemental = ELEMENTAL.test(l.slice(0, pos + tramo.length));
      // Nos quedamos con la primera, salvo que luego aparezca la del mineral "elemental"
      if (!hallados[k] || (elemental && !hallados[k].elemental)) hallados[k] = { v, elemental, linea: lineas[i] };
    });
    // Sal en vez de sodio (electrolitos): 1 g de sal = 400 mg de sodio
    if (!hallados.na && /^(sal|salt)\b/.test(l)) {
      const m = l.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
      if (m) hallados.sal = { v: parseNum(m[1]) * 400, linea: l };
    }
    // Energía
    if (!hallados.kcal) {
      const k1 = l.match(/(\d+(?:[.,]\d+)?)\s*kcal/) || (/^(calories|calor[ií]as|energ)/.test(l) && !/kj/.test(l) && l.match(/^(?:calories|calor[ií]as|energ[a-zíé]*)\s*:?\s*(\d+(?:[.,]\d+)?)\b/));
      if (k1) hallados.kcal = { v: parseNum(k1[1]), linea: l };
      else { const kj = l.match(/(\d+(?:[.,]\d+)?)\s*kj/); if (kj) hallados.kcal = { v: Math.round(parseNum(kj[1]) / 4.184), linea: l, desdeKj: true }; }
    }
    for (const [k, re] of MACROS_SUPL) {
      if (hallados[k] || !re.test(l)) continue;
      const m = l.match(/(\d+(?:[.,]\d+)?)\s*(g|mg)\b/);
      if (m) hallados[k] = { v: m[2] === 'mg' ? parseNum(m[1]) / 1000 : parseNum(m[1]), linea: l };
    }
  }
  const valores = {}, detalles = [];
  for (const [k, h] of Object.entries(hallados)) {
    if (!porClave[k] && !MACRO_CLAVES.includes(k)) continue;
    valores[k] = Math.round(h.v * 10) / 10;
    detalles.push({ k, v: valores[k], linea: h.linea });
  }
  if (valores.na == null && hallados.sal) { valores.na = Math.round(hallados.sal.v); detalles.push({ k: 'na', v: valores.na, linea: hallados.sal.linea }); }
  // Omega 3: si la etiqueta da el total, ese; si no, EPA + DHA
  if (hallados.o3 == null && (hallados.epa || hallados.dha)) valores.o3 = Math.round((hallados.epa?.v || 0) + (hallados.dha?.v || 0));
  if (hallados.o3 && (hallados.epa || hallados.dha)) {
    const suma = (hallados.epa?.v || 0) + (hallados.dha?.v || 0);
    if (Math.abs(suma - hallados.o3.v) > 1) dudas.push(`El omega 3 total (${Math.round(hallados.o3.v)} mg) no es EPA + DHA (${Math.round(suma)} mg): lleva otros omega 3. Uso el total.`);
  }
  if (aceiteVisto) dudas.push(`"${aceiteVisto}" de aceite de pescado NO es omega 3: no lo he contado (lo que cuenta es EPA y DHA).`);
  if (enUI) dudas.push('La vitamina D venía en UI: la he pasado a µg (40 UI = 1 µg).');
  if (hallados.kcal?.desdeKj) dudas.push('Las calorías venían en kJ: las he pasado a kcal.');
  if (!hallados.kcal && (hallados.fat || hallados.carb || hallados.prot)) dudas.push('Trae grasas, hidratos o proteína pero no las calorías: escríbelas si aparecen en la etiqueta (no las calculo).');
  // "Serving size 2 softgels", "Tamaño de la porción: 1 cápsula", "Por dosis diaria (2 cápsulas)", "por sobre", "each softgel"…
  let porcion = null, unidad = null;
  const todo = lineas.join(' \n ');
  const p = todo.match(new RegExp(`(?:serving\\s*size|tama[ñn]o\\s+de\\s+(?:la\\s+)?(?:porci[oó]n|raci[oó]n|dosis)|dosis\\s+diaria(?:\\s+recomendada)?|cantidad\\s+diaria|daily\\s+dose|porci[oó]n|raci[oó]n|\\bpor|\\bper|\\beach|\\bcada)\\s*:?\\s+(?:dosis(?:\\s+diaria)?|toma|porci[oó]n|raci[oó]n|serving|daily\\s+dose)?\\s*[(:]?\\s*(?:de\\s+)?(\\d+(?:[.,]\\d+)?)?\\s*(${UNIDAD_TEXTO})\\b`));
  if (p) { porcion = p[1] ? parseNum(p[1]) : 1; unidad = unidadDeTexto(p[2]); }
  if (!porcion && Object.keys(valores).length) dudas.push('No encuentro para cuántas cápsulas, sobres o gramos son los números: revisa "Los números de la etiqueta son por".');
  if (/por\s*100\s*g|per\s*100\s*g/.test(todo) && unidad !== 'g') dudas.push('La etiqueta tiene una columna "por 100 g": comprueba que he cogido la de la dosis.');
  return { valores, porcion, unidad, detalles, dudas };
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
  const epa = leer('epa', 'eicosapentaenoic-acid', 'serving'), dha = leer('dha', 'docosahexaenoic-acid', 'serving');
  if (epa) porRacion.epa = Math.round(epa);
  if (dha) porRacion.dha = Math.round(dha);
  if (porRacion.o3 == null && (epa || dha)) porRacion.o3 = Math.round((epa || 0) + (dha || 0));
  // Energía y macros por ración (en kcal y g)
  const macroOFF = { kcal: 'energy-kcal', prot: 'proteins', carb: 'carbohydrates', sug: 'sugars', fat: 'fat' };
  for (const [k, campo] of Object.entries(macroOFF)) {
    const x = Number(nu[campo + '_serving']);
    if (Number.isFinite(x) && nu[campo + '_serving'] !== '' && nu[campo + '_serving'] != null) porRacion[k] = Math.round(x * 10) / 10;
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
