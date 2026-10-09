// Convierte el PDF del nutricionista en un plan, directamente en el iPhone y gratis.
// Está hecho para la plantilla de Strong Nutrition:
//   COMIDA (15:00h) → líneas que terminan en ◉ (cada una es un bloque)
//   "OPCIÓN ..." → opciones a elegir dentro de una comida
//   "o" separa alternativas; cada alternativa puede llevar sus propios gramos.
// Lo que no reconoce lo devuelve en "avisos" para que lo revises.

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nombres que usa el nutricionista → alimentos de la biblioteca.
// El orden importa: los más específicos primero. "ctx" = solo si la frase contiene esa palabra.
const ALIAS = [
  ['pechuga de pavo', ['pavo-fiambre'], 'loncha'],
  ['lomo', ['lomo-embuchado'], 'loncha'],
  ['atun', ['atun-lata'], 'lata'],
  ['solomillo de pollo', ['pollo-solomillo']],
  ['pechuga de pollo', ['pollo-pechuga']],
  ['solomillo de cerdo', ['cerdo-solomillo']],
  ['lomo de cerdo', ['cerdo-solomillo']],
  ['filete de ternera', ['ternera-filete']],
  ['carne picada', ['picada-ternera', 'picada-pollo', 'picada-pavo']],
  ['pechuga de pavo', ['pavo-pechuga']],
  ['pavo', ['pavo-pechuga']],
  ['pollo', ['pollo-pechuga']],
  ['ternera', ['ternera-filete']],
  ['merluza', ['merluza']], ['dorada', ['dorada']], ['lubina', ['lubina']], ['atun', ['atun-fresco']],
  ['salmon', ['salmon']], ['sardina', ['sardina']], ['anchoa', ['anchoa']], ['boqueron', ['anchoa']],
  ['bacalao', ['bacalao']], ['sepia', ['sepia']], ['calamar', ['calamar']], ['pulpo', ['pulpo']],
  ['mejillon', ['mejillones']], ['gamba', ['gambas']], ['langostino', ['langostinos']],
  ['huevo', ['huevo']], ['clara', ['huevo']],
  ['jamon dulce', ['jamon-cocido']], ['jamon cocido', ['jamon-cocido']], ['jamon york', ['jamon-cocido']],
  ['jamon serrano', ['jamon-serrano']], ['jamon iberico', ['jamon-serrano']], ['cecina', ['cecina']],
  ['queso fresco', ['queso-fresco-ligero']], ['queso de cabra', ['queso-cabra-fresco']], ['havarti', ['queso-havarti-light']],
  ['mozzarella', ['mozzarella-light']], ['burgos', ['queso-burgos']], ['requeson', ['requeson']],
  ['ricota', ['ricotta']], ['ricotta', ['ricotta']], ['mato', ['queso-mato']], ['feta', ['queso-feta']], ['cottage', ['queso-cottage']],
  ['queso batido', ['queso-batido']], ['yogurt', ['yogur-proteico']], ['yogur', ['yogur-proteico']], ['skyr', ['yogur-proteico']],
  ['pan', ['pan-integral']], ['copos de avena', ['copos-avena']], ['avena', ['copos-avena']],
  ['espelta inflada', ['espelta-inflada']], ['copos de maiz', ['corn-flakes']], ['corn flakes', ['corn-flakes']],
  ['cereales', ['cereales-integrales']], ['muesli', ['muesli']],
  ['arroz', ['arroz-integral']], ['pasta', ['pasta-integral']], ['quinoa', ['quinoa']], ['cuscus', ['cuscus']],
  ['noqui', ['noquis']], ['gnocchi', ['noquis']], ['lenteja', ['lentejas']], ['alubia', ['alubias']],
  ['garbanzo', ['garbanzos']], ['boniato', ['boniato']], ['batata', ['boniato']], ['patata', ['patata']],
  ['wrap', ['wrap-integral']],
  ['aceite de oliva', ['aceite-oliva']], ['aceite', ['aceite-oliva']], ['aguacate', ['aguacate']],
  ['oliva', ['aceitunas']], ['aceituna', ['aceitunas']],
  ['chocolate', ['chocolate-85']], ['crema de cacahuete', ['crema-cacahuete']], ['crema de frutos secos', ['crema-cacahuete']],
  ['creatina', ['creatina']],
  ['crema de verdura', ['crema-verduras']], ['sopa', ['crema-verduras']], ['gazpacho', ['crema-verduras']],
];

// Para las listas de colores (verde, naranja, amarilla)
const ALIAS_LISTA = {
  'nuez de castilla': 'nueces', nuez: 'nueces', 'nuez de macadamia': 'macadamia', 'nuez de brasil': 'nuez-brasil',
  'pipas de girasol': 'pipas-girasol', pipas: 'pipas-girasol', judias: 'judias-verdes', 'judias verdes': 'judias-verdes',
  champinones: 'setas', setas: 'setas', fresas: 'fresa', moras: 'mora', uva: 'uvas',
};
const COLOR_GRUPO = { verde: 'verdura', naranja: 'fruta', amarilla: 'grasa', roja: 'proteina', azul: 'lacteo' };
const NOMBRE_GRUPO = {
  lacteo: 'Lácteo', verdura: 'Verduras', fruta: 'Fruta', almidon: 'Almidón',
  proteina: 'Proteína', grasa: 'Grasa', suplemento: 'Suplemento', otro: 'Otro',
};

const MEAL_RE = /(DESAYUNO|MEDIA MA[ÑN]ANA|MEDIA TARDE|MERIENDA(?: DE LA TARDE)?|ALMUERZO|COMIDA|CENA|RECENA|PRE-? ?ENTRENO|POST-? ?ENTRENO)\s*\(\s*(\d{1,2})[:.](\d{2})\s*h?\s*\)/g;
const ENTRENO_RE = /-*\s*ENTRENAMIENTO[^(]*\(([^)]*)\)\s*/i;

// ---------- Leer el texto del PDF ----------
export async function textoDePdf(buffer) {
  const pdfjs = await import('https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  let txt = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    for (const it of content.items) txt += it.str + (it.hasEOL ? '\n' : '');
    txt += '\n';
  }
  return txt;
}

// ---------- Convertir el texto en plan ----------
export function planDesdeTexto(texto, foods, nombreArchivo = '') {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const avisos = [];
  const plano = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ');

  // Fecha: "25 de septiembre de 2026" o la del nombre del archivo "25-09-26"
  const fecha = buscarFecha(plano, nombreArchivo);

  // Cortamos el texto en comidas
  const marcas = [...plano.matchAll(MEAL_RE)];
  if (!marcas.length) throw new Error('No encontré comidas con horario (ej. "DESAYUNO (7:15h)"). ¿Es el PDF del plan?');
  const comidas = [];
  let entreno = null;
  marcas.forEach((m, i) => {
    let cuerpo = plano.slice(m.index + m[0].length, i + 1 < marcas.length ? marcas[i + 1].index : undefined);
    const ent = cuerpo.match(ENTRENO_RE);
    if (ent) {
      entreno = { despuesDe: null, texto: limpiarEntreno(ent[1]), _idx: i };
      cuerpo = cuerpo.replace(ENTRENO_RE, ' ');
    }
    const nombre = titulo(m[1]);
    const id = slug(nombre);
    comidas.push({ id, nombre, hora: `${m[2].padStart(2, '0')}:${m[3]}`, ...bloquesDeComida(cuerpo, byId, avisos, nombre) });
  });
  if (entreno) { entreno.despuesDe = comidas[entreno._idx].id; delete entreno._idx; }

  const listas = listasDeColores(plano, foods);
  // Las listas que usan los bloques deben existir
  for (const c of comidas) for (const b of todosLosBloques(c)) for (const a of b.alimentos) {
    if (a.lista && !listas[a.lista]) {
      listas[a.lista] = foods.filter(f => f.source === 'base' && f.group === COLOR_GRUPO[a.lista] && f.id !== 'crema-verduras' && !['aceite-oliva', 'aguacate', 'aceitunas', 'chocolate-85', 'crema-cacahuete'].includes(f.id)).map(f => f.id);
    }
  }

  return {
    plan: {
      formato: 1,
      id: fecha || new Date().toISOString().slice(0, 10),
      nombre: 'Plan de alimentación',
      fecha: fecha || new Date().toISOString().slice(0, 10),
      nutricionista: buscarNutricionista(plano),
      nota: 'Todos los alimentos se pesan en cocido, no en crudo. Horarios orientativos.',
      entreno,
      listas,
      aderezos: [],
      comidas,
      origen: 'pdf',
    },
    avisos,
  };
}

function bloquesDeComida(cuerpo, byId, avisos, comida) {
  const bloques = [];
  const opciones = [];
  let actual = bloques;
  let prefijo = '';
  // Separamos por líneas para encontrar las cabeceras "OPCIÓN ...", y por ◉ para los bloques
  for (const linea of cuerpo.replace(/SELECCIONA S[ÓO]LO UNA \(1\) OPCI[ÓO]N:?/gi, '').split('\n')) {
    const op = linea.match(/^\s*OPCI[ÓO]N\s+(.*)$/i);
    if (op) {
      const o = { id: '', nombre: nombreOpcion(op[1]), bloques: [] };
      o.id = slug(o.nombre) || 'opcion-' + (opciones.length + 1);
      opciones.push(o);
      actual = o.bloques;
      prefijo = '';
      continue;
    }
    prefijo += ' ' + linea;
    while (prefijo.includes('◉')) {
      const k = prefijo.indexOf('◉');
      const frase = prefijo.slice(0, k).trim();
      prefijo = prefijo.slice(k + 1);
      if (frase) for (const b of fraseABloques(frase, byId, avisos, comida)) {
        b.id = idUnico(b.id, actual);
        actual.push(b);
      }
    }
  }
  return { bloques, opciones };
}

// Una frase terminada en ◉ → uno o varios bloques ("A + B" son dos bloques)
function fraseABloques(frase, byId, avisos, comida) {
  let esPostre = false;
  frase = frase.replace(/^POSTRE:?\s*/i, () => { esPostre = true; return ''; }).trim();
  const partes = frase.split(/\s\+\s/);
  return partes.map(parte => {
    const alimentos = [];
    let gPrevio = null;
    for (const alt of dividir(parte, ' o ')) {
      for (const trozo of dividir(alt, ',')) {
        const lista = trozo.match(/lista\s+(verde|naranja|amarilla|roja|azul)/i);
        let g = gramos(trozo, byId);
        if (g == null) g = gPrevio; else gPrevio = g;
        // Un alimento concreto ("crema de frutos secos") gana a la lista que lo acompaña
        const ids = reconocer(trozo, norm(parte));
        if (!ids.length && lista) {
          const color = lista[1].toLowerCase();
          if (!alimentos.some(a => a.lista === color)) alimentos.push({ lista: color, g: g ?? 100 });
          continue;
        }
        if (!ids.length) {
          const limpio = sinParentesis(trozo).trim();
          if (limpio && !/^(sin |no |preferible)/i.test(limpio)) avisos.push(`${comida}: no reconocí "${limpio}"`);
          continue;
        }
        for (const id of ids) {
          const gg = gramosPorUnidad(trozo, byId[id]) ?? g;
          if (!alimentos.some(a => a.f === id)) alimentos.push({ f: id, g: gg ?? 100 });
          if (gg == null && g == null) avisos.push(`${comida}: sin gramos para "${byId[id]?.name || id}" (puse 100 g)`);
        }
      }
    }
    const grupo = alimentos[0]?.lista ? COLOR_GRUPO[alimentos[0].lista] : byId[alimentos[0]?.f]?.group || 'otro';
    // "atún + huevos": dos bloques del mismo grupo → se nombran por su alimento
    const nombre = esPostre ? 'Postre' : alimentos[0]?.f === 'creatina' ? 'Creatina'
      : partes.length > 1 && alimentos.length <= 3 && alimentos[0]?.f ? byId[alimentos[0].f].name.split(/[(,]/)[0].trim()
      : NOMBRE_GRUPO[grupo];
    return { id: slug(nombre), nombre, grupo, texto: resumen(parte), alimentos };
  }).filter(b => b.alimentos.length);
}

function reconocer(trozo, fraseNorm) {
  let t = ' ' + norm(sinParentesis(trozo)) + ' ';
  const ids = [];
  for (const [patron, destino, ctx] of ALIAS) {
    if (ctx && !fraseNorm.includes(ctx)) continue;
    const re = new RegExp(`\\b${patron}(e?s)?\\b`, 'g');
    if (re.test(t)) {
      for (const id of destino) if (!ids.includes(id)) ids.push(id);
      t = t.replace(re, m => ' '.repeat(m.length)); // ya usado: que no lo vuelva a encontrar otro alias
    }
  }
  return ids;
}

// "240g", "(60g)", "-15g", "(3cc)", "2 rebanadas (30g c/u)"
function gramos(trozo) {
  const cu = trozo.match(/(\d+)\s*(?:g|gr|cc|ml)\s*c\/u/i);
  if (cu) {
    const n = trozo.match(/^\s*(\d+)/);
    return Number(cu[1]) * (n ? Number(n[1]) : 1);
  }
  const m = trozo.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos|cc|ml)\b/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

// "3 huevos", "8 olivas": cantidad × peso de la unidad
function gramosPorUnidad(trozo, food) {
  if (!food?.unitG || gramos(trozo) != null) return null;
  const m = norm(trozo).match(/(\d+)\s+(?:[a-z]+\s+){0,2}?(huevo|oliva|aceituna|rebanada)/);
  return m ? Number(m[1]) * food.unitG : null;
}

function listasDeColores(texto, foods) {
  const base = foods.filter(f => f.source === 'base');
  const listas = { verde: [], naranja: [], amarilla: [] };
  const tokens = texto.split(/[•\n]/).map(t => norm(t).trim()).filter(t => t && t.length < 30);
  for (const t of tokens) {
    const id = ALIAS_LISTA[t] || base.find(f => {
      const n = norm(f.name);
      return n === t || n.split(/[ /(]/)[0] === t || n.split(/[ /(]/)[0] === t.replace(/s$/, '') || n.split(/[ /(]/)[0].replace(/s$/, '') === t;
    })?.id;
    const f = id && base.find(x => x.id === id);
    if (!f) continue;
    const color = f.group === 'verdura' ? 'verde' : f.group === 'fruta' ? 'naranja' : f.group === 'grasa' ? 'amarilla' : null;
    if (color && !listas[color].includes(id)) listas[color].push(id);
  }
  for (const k of Object.keys(listas)) if (listas[k].length < 4) delete listas[k]; // no la encontró bien
  return listas;
}

// ---------- utilidades ----------
function dividir(s, sep) {
  // Divide por el separador solo fuera de paréntesis
  const out = [];
  let prof = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') prof++;
    if (c === ')') prof = Math.max(0, prof - 1);
    if (prof === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const sinParentesis = s => s.replace(/\([^)]*\)?/g, ' ');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titulo = s => s.charAt(0) + s.slice(1).toLowerCase().replace(/ de la tarde/, '');
function idUnico(id, lista) {
  let k = id, n = 2;
  while (lista.some(b => b.id === k)) k = `${id}-${n++}`;
  return k;
}
function todosLosBloques(c) {
  return [...c.bloques, ...c.opciones.flatMap(o => o.bloques)];
}
function nombreOpcion(s) {
  const num = s.match(/#\s*(\d+)/);
  if (num) return `Opción ${num[1]}`;
  const m = s.match(/^([^(]+)(?:\(([^-)]+))?/);
  const a = (m?.[1] || s).trim(), b = m?.[2]?.trim();
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  return b ? `${cap(a)} · ${b.toLowerCase()}` : cap(a);
}
function resumen(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 90 ? t.slice(0, 88) + '…' : t;
}
function limpiarEntreno(s) {
  return s.replace(/(\d{1,2})[:.](\d{2})\s*h/gi, '$1:$2').replace(/\s+/g, ' ').trim()
    .replace(/^([A-ZÁÉÍÓÚÑ]+)/, w => w.charAt(0) + w.slice(1).toLowerCase());
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function buscarFecha(texto, archivo) {
  const m = norm(texto).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (m && MESES.includes(m[2])) return `${m[3]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const a = archivo.match(/(\d{2})-(\d{2})-(\d{2,4})/);
  if (a) return `${a[3].length === 2 ? '20' + a[3] : a[3]}-${a[2]}-${a[1]}`;
  return null;
}
function buscarNutricionista(texto) {
  const m = texto.match(/(?:MsC\.?|Lic\.?|Dr\.?a?\.?)\s*([A-ZÁÉÍÓÚÑ ]{5,40})\./);
  if (!m) return 'Nutricionista';
  const nombre = m[1].trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  return `${nombre}${/strong/i.test(texto) ? ' · Strong Nutrition' : ''}`;
}

// A qué alimento base se parece un producto por su nombre ("Queso ricotta Hacendado" → ricotta).
// Lo usan el escáner y la biblioteca para clasificar solos lo que compras.
export function alimentoPorNombre(nombre) {
  if (!nombre) return null;
  return reconocer(nombre, norm(nombre))[0] || null;
}
