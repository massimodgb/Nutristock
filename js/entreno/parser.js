// Convierte el texto que manda la entrenadora (WhatsApp, notas…) en un entreno ordenado:
//   secciones (Calentamiento, FUERZA, WOD, Opcional…) → partes (separadas por líneas en blanco) → líneas.
// Cada línea tiene un TIPO: 'ejercicio' | 'complejo' | 'instruccion' | 'encabezado' | 'formato'.
// Detecta formatos (EMOM, "cada 1:30 x 6", AMRAP, For Time, rondas, bloques, tramos por minutos, Tabata),
// series x reps, porcentajes (uno por serie, con decimales, rangos), "del RM de X", cargas (@60kg),
// descansos, complejos ("1 Power Snatch + 1 Squat Snatch + 1 OHS"), esquemas 15-12-9 y enlaces de YouTube.
//
// v3: los entrenos que ya tenían resultados antes de este lector se siguen leyendo con parser-v1.js (congelado).
import { LEVANTAMIENTOS, ABREV, PALABRAS, IMPLEMENTO } from './datos.js';

export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = s => parseFloat(String(s).replace(',', '.'));

// Clave para juntar el mismo ejercicio escrito distinto: "Cal Row" = "cal row", "Lunges" = "Lunge"
// "DB Clean" (1 mancuerna) y "DBs Clean" (2 mancuernas) son ejercicios DISTINTOS.
export function claveEjercicio(nombre) {
  const t = norm(nombre).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const w = t[i], sig = IMPLEMENTO[t[i + 1]];
    if (/^(single|una|un|1)$/.test(w) && sig) continue; // "single DB" = DB
    if (/^(double|dual|doble|dos|2)$/.test(w) && sig) { out.push(sig.replace('1', '2')); i++; continue; }
    out.push(IMPLEMENTO[w] || (w.length > 3 ? w.replace(/s$/, '') : w));
  }
  return out.join(' ');
}

// Etiqueta legible del implemento, para la biblioteca de ejercicios
export function implemento(nombre) {
  const c = claveEjercicio(nombre);
  return /\bdb2\b/.test(c) ? '2 mancuernas' : /\bdb1\b/.test(c) ? '1 mancuerna'
    : /\bkb2\b/.test(c) ? '2 kettlebells' : /\bkb1\b/.test(c) ? '1 kettlebell' : '';
}

const CABECERAS = /^(calentamiento|warm[\s-]?up|movilidad|activacion|fuerza|strength|tecnica|skill|wod|metcon|accesorios?|opcional|core|cool[\s-]?down|vuelta a la calma|gimnastic[oa]s?|halterofilia|cardio|engine|finisher|bonus|extra)\s*:?$/;
const COMPLEJO = /\b(complex|complejo)\b/i;

// Palabras de movimientos: si una frase larga sin números no tiene ninguna, es una instrucción, no un ejercicio
const VOCAB = new Set([
  ...LEVANTAMIENTOS.flatMap(L => L.puros.flatMap(p => norm(p).split(/\s+/))),
  ...Object.keys(ABREV), ...Object.values(ABREV).flatMap(v => norm(v).split(/[\s-]+/)), ...Object.keys(PALABRAS),
  ...'squat press pull push row run bike burpee burpees lunge lunges jump jumps swing swings deadlift thruster thrusters wall ball pullup pullups pull-up dip dips plank carry situp situps sit-up rope climb box step steps curl raise hold hang ski erg bridge thrust walk sprint crunch v-up toes chest handstand pistol pistols muscle ring rings bar kettlebell dumbbell barbell farmer sled assault echo airbike calorias cal cals air goblet split bulgarian good morning hip ghd'.split(' '),
  ...'sentadilla sentadillas zancada zancadas remo salto saltos plancha flexion flexiones dominada dominadas carrera correr comba cuerda peso muerto puente caminar estocada estocadas abdominales burpee press banca hombro hombros gluteo isquios fondos subida cajon bicicleta trineo'.split(' '),
].filter(Boolean));

export function parsearEntreno(texto) {
  const secciones = [];
  let sec = null, parte = null;
  const nuevaSeccion = titulo => { sec = { titulo, partes: [] }; secciones.push(sec); parte = null; };
  const nuevaParte = titulo => {
    if (!sec) nuevaSeccion('Calentamiento');
    parte = { titulo: titulo || '', lineas: [], links: [] };
    sec.partes.push(parte);
  };

  for (const bruta of texto.replace(/\r/g, '').split('\n')) {
    const linea = bruta.replace(/^[\s•·*\-–]+/, '').replace(/\s+/g, ' ').trim();
    if (!linea) { parte = null; continue; }
    const links = linea.match(/https?:\/\/\S+/g);
    if (links) {
      const destino = parte?.lineas[parte.lineas.length - 1] || parte || sec?.partes[sec.partes.length - 1];
      if (destino) (destino.links ||= []).push(...links);
      const resto = linea.replace(/https?:\/\/\S+/g, '').trim();
      if (!resto) continue;
    }
    if (esCabecera(linea)) { nuevaSeccion(tituloBonito(linea)); continue; }
    if (/^bloque\s+\S+/i.test(linea)) { nuevaParte(linea.replace(/:\s*$/, '')); continue; }
    if (!parte) nuevaParte('');
    parte.lineas.push({ texto: linea });
  }

  for (const s of secciones) {
    s.partes = s.partes.filter(p => p.lineas.length || p.titulo);
    for (const p of s.partes) {
      p.lineas = unirLineas(p.lineas).map(analizarLinea);
      const tramos = tramosPorMinuto(p.lineas);
      p.formato = tramos || detectarFormato([p.titulo, ...p.lineas.map(l => l.texto)].join('\n'), p.lineas);
      p.lineas = agruparComplejo(p, p.lineas);
      // El descanso de la parte ("Rest: 2 min entre series") vale para sus ejercicios de fuerza
      const desc = p.lineas.find(l => l.tipo === 'formato' && l.descanso)?.descanso;
      if (desc) for (const l of p.lineas) if ((l.series || l.tipo === 'complejo') && !l.descanso) l.descanso = desc;
    }
    s.formato = s.partes.find(p => p.formato && p.formato.tipo !== 'tiempo')?.formato || null;
  }
  return { secciones: secciones.filter(s => s.partes.length), lector: 2 };
}

function esCabecera(linea) {
  const t = norm(linea).replace(/[:.]$/, '').trim();
  if (CABECERAS.test(t)) return true;
  // Línea corta en MAYÚSCULAS sin números ("FUERZA", "WOD")
  return linea.length <= 25 && !/\d/.test(linea) && linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(linea);
}
const tituloBonito = l => {
  const t = l.replace(/:$/, '').trim();
  return t.length <= 4 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

// "15-12-9" en una línea y el ejercicio en la siguiente → una sola línea.
// "4x3 @ 100-110%" debajo del nombre del ejercicio → se une al ejercicio.
function unirLineas(lineas) {
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].texto;
    if (/^\d+(\s*-\s*\d+)+$/.test(t) && lineas[i + 1]) {
      out.push({ texto: `${t} ${lineas[i + 1].texto}`, esquema: t.replace(/\s/g, ''), links: lineas[i + 1].links });
      i++;
      continue;
    }
    if (/^\d+\s*x\s*\d+\b/i.test(t) && out.length && !/^\d+\s*x\s*\d+/i.test(out[out.length - 1].texto) && !COMPLEJO.test(out[out.length - 1].texto)) {
      const prev = out[out.length - 1];
      prev.prescripcion = t;
      if (lineas[i].links) (prev.links ||= []).push(...lineas[i].links);
      continue;
    }
    out.push({ ...lineas[i] });
  }
  return out;
}

// ---------- Porcentajes ----------
// "@45%-50%-55%-60%-62.5%", "@45-50-55-60-62.5%", "(80-85-90%)", "100-110%", "@ 70%", "62,5%"
const PCT = /(?:\d{1,3}(?:[.,]\d+)?\s*%?\s*[-–\/]\s*)*\d{1,3}(?:[.,]\d+)?\s*%/g;
export function leerPorcentajes(texto) {
  const grupos = [...texto.matchAll(PCT)].map(m => m[0]);
  const pct = grupos.flatMap(g => g.split(/[-–\/]/).map(x => num(x.replace('%', ''))).filter(x => x > 0 && x <= 150));
  // Un rango "100-110%" (dos números y una sola raya) es "entre", no dos series
  const rango = grupos.length === 1 && /^\s*\d{1,3}(?:[.,]\d+)?\s*%?\s*[-–]\s*\d{1,3}(?:[.,]\d+)?\s*%\s*$/.test(grupos[0]);
  return { pct, rango };
}
// Cómo se reparten los % entre las series: 'serie' (uno por serie) | 'rango' | 'unico' | 'dudoso'
export function modoPct(pct, series, rango) {
  if (!pct?.length) return null;
  if (pct.length === 1) return 'unico';
  if (series && pct.length === series) return 'serie';
  if (pct.length === 2 && rango) return 'rango';
  return series ? 'dudoso' : 'serie';
}

// "% del RM de Clean", "70% de Hang Power Clean", "80% del clean", "75% of snatch", "60% del 1RM de Front Squat"
function leerPctDe(todo) {
  const m = todo.match(/%\s*\)?\s*(?:de|del|of)\s+(?:(?:tu|su|el|la|your|my|the)\s+)?(?:(?:1\s*)?rm\s+(?:(?:de|del|of)\s+)?(?:(?:tu|su|el|la|your)\s+)?)?([a-záéíóúñ&][a-záéíóúñ&\s-]{1,40}?)\s*(?=$|[,.;:()@]|\s\d|\s(?:rest|descanso))/i);
  if (!m) return null;
  const n = m[1].trim().replace(/\s+(rm|1rm)$/i, '');
  return /^(rm|1rm|tu|su)$/i.test(n) ? null : n;
}

// Descanso en segundos: "(Rest: 90 seg)", "rest 2 min", "descanso 1:30", "90'' rest", "2' descanso"
export function leerDescanso(texto) {
  const t = norm(texto);
  let m = t.match(/(?:rest|descanso|desc\.?|recuperacion)\s*:?\s*(\d+):(\d{2})/) || t.match(/(\d+):(\d{2})\s*(?:de\s*)?(?:rest|descanso)/);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/(?:rest|descanso|desc\.?|recuperacion)\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)\s*(seg|segundos|sec|s\b|''|"|min|minutos|'|’)?/)
    || t.match(/(\d+(?:[.,]\d+)?)\s*(seg|segundos|sec|s\b|''|"|min|minutos|'|’)\s*(?:de\s*)?(?:rest|descanso)/);
  if (!m) return null;
  const v = num(m[1]), u = m[2] || '';
  if (/^(seg|segundos|sec|s|''|")$/.test(u)) return Math.round(v);
  if (/^(min|minutos|'|’)$/.test(u)) return Math.round(v * 60);
  return v <= 10 ? Math.round(v * 60) : Math.round(v); // sin unidad: "rest 2" = 2 min, "rest 90" = 90 s
}

function analizarLinea(l) {
  const todo = `${l.texto} ${l.prescripcion || ''}`;
  const out = { ...l };
  // Series x reps ("5x3", "5 series de 3"), sin confundir "1:30 x 6" (un tiempo) con series
  const sr = (l.prescripcion || l.texto).match(/(?<![:\d.,])\b(\d+)\s*(?:x|series?\s+de)\s*(\d+)\b(?!\s*(?:min|'|’|seg|s\b))/i);
  const esCada = /\b(cada|every)\b|\be\d+mom\b/i.test(todo);
  if (sr && !esCada) { out.series = +sr[1]; out.reps = +sr[2]; }
  const rl = l.texto.match(/^\s*(?:\d+\)\s*)?(\d+)\s*(?:reps?|repes|x)?\s+[a-záéíóúñ]/i);
  if (rl && !out.series) out.repsLinea = +rl[1];
  const { pct, rango } = leerPorcentajes(todo);
  if (pct.length) { out.pct = pct; out.pctRango = rango; out.pctModo = modoPct(pct, out.series, rango); }
  const de = leerPctDe(todo);
  if (de) out.pctDe = de;
  // Kilos escritos de cualquier forma: "@60kg", "con 70 kg", "a 70 kilos", "60/40kg" (hombre/mujer: el primero)
  const carga = todo.match(/(\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(kg|kgs|kilos?|lbs?)\b/i);
  if (carga) out.kg = Math.round(num(carga[1]) * (/^lb/i.test(carga[2]) ? 0.4536 : 1) * 10) / 10;
  const desc = leerDescanso(todo);
  if (desc) out.descanso = desc;
  out.estacion = (l.texto.match(/^(\d+)\)\s*/) || [])[1] ? +l.texto.match(/^(\d+)\)/)[1] : null;
  // Las líneas que solo dicen el formato ("EMOM x 18min", "3 Rondas:", "Rest: 3 min", "Cada 1:30 x 6 sets") no son ejercicios
  const sinFormato = l.texto.replace(/\([^)]*\)|\d+([.,:]\d+)?|emom|amraps?|rondas?|rounds?|min(utos?)?|seg(undos)?|for time|bloques?|trabajo|rest|descanso|cada uno|time cap|cada|every|sets?|series|veces|durante|\b(con|de|y|entre|por|x|s)\b|[x:+'’",.%@-]/gi, '').trim();
  const soloPct = !!pct.length && !/[a-z]{3}/i.test(l.texto.replace(/%|@|de|del|rm/gi, ''));
  out.esFormato = /^(rest|descanso)\b/i.test(l.texto) || (!!detectarFormato(l.texto) && sinFormato.length < 3) || soloPct;
  out.ejercicios = out.esFormato ? [] : nombresEjercicio(l.texto);
  out.tipo = out.esFormato ? 'formato' : tipoTexto(l.texto, out);
  if (out.tipo !== 'ejercicio') out.ejercicios = out.tipo === 'complejo' ? out.ejercicios : [];
  out.base = out.ejercicios.length ? levantamientoBase(out.ejercicios[0]) : null;
  // Varios movimientos con "+" y carga o series = complejo en una línea ("1 Power Snatch + 1 Squat Snatch @60%")
  const xSets = l.texto.match(/\sx\s*(\d+)\s*(?:sets?|series|rondas|rounds)?\s*(?=@|\(|$)/i);
  const esComplejo = COMPLEJO.test(l.texto) || out.ejercicios.length > 1;
  if (out.tipo === 'ejercicio' && esComplejo && /\+/.test(l.texto) && (pct.length || out.series || xSets)) {
    out.tipo = 'complejo';
    out.movimientos = movimientosDe(l.texto);
    out.ejercicios = out.movimientos.map(m => m.nombre);
    if (!out.series && xSets) out.series = +xSets[1];
    if (!out.series && pct.length > 1) out.series = pct.length;
    out.reps = out.movimientos.map(m => m.reps || 1).join('+');
    out.base = null;
    if (pct.length) out.pctModo = modoPct(pct, out.series, out.pctRango);
  }
  return out;
}

// ¿Encabezado, instrucción o ejercicio? En la duda, ejercicio (para no quitarte el "+ kg").
function tipoTexto(texto, l) {
  const t = texto.trim();
  if (COMPLEJO.test(t) && !/\+/.test(t)) return 'encabezado';
  if (/:$/.test(t) && !/\d/.test(t)) return 'encabezado';
  if (/^(nota|note|notas|objetivo|tip|importante|focus|enfoque|ojo|recuerda|intenta|mantener|mant[eé]n|sin perder|idea|stimulus|est[ií]mulo)\b/i.test(norm(t))) return 'instruccion';
  const palabras = norm(t).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!/\d/.test(t) && palabras.length >= 5 && !palabras.some(w => VOCAB.has(w) || VOCAB.has(w.replace(/s$/, '')))) return 'instruccion';
  if (!l.ejercicios?.length) return 'instruccion';
  return 'ejercicio';
}

// "1 Power Snatch + 1 Squat Snatch + 1 OHS" → [{ reps: 1, nombre: 'Power Snatch' }, …]
function movimientosDe(texto) {
  // "Snatch complex: 2 Snatch Pull + 1 Hang Snatch": lo de antes de ":" es el nombre del complejo
  return texto.replace(/^[^:+]*:\s*/, '').replace(/@.*$|\([^)]*\)/g, '').replace(/\s+x\s*\d+\s*(?:sets?|series|rondas|rounds)?\s*$/i, '').split(/\s\+\s/).map(p => {
    const r = p.match(/^\s*(?:\d+\s*x\s*\d+\s*)?(\d+)\s+/);
    const nombre = nombresEjercicio(p)[0];
    return nombre ? { reps: r ? +r[1] : null, nombre } : null;
  }).filter(Boolean);
}

// Una parte con "Complex"/"Complejo": sus movimientos van JUNTOS en una sola línea con sus series y %.
function agruparComplejo(p, lineas) {
  const iCab = lineas.findIndex(l => COMPLEJO.test(l.texto));
  const titulo = COMPLEJO.test(p.titulo || '');
  if (iCab < 0 && !titulo) return lineas;
  const cab = iCab >= 0 ? lineas[iCab] : null;
  // Si la cabecera ya trae los movimientos con "+", es un complejo de una línea
  if (cab?.tipo === 'complejo') return lineas;
  const movs = lineas.filter((l, i) => i !== iCab && l.tipo === 'ejercicio' && !l.series);
  if (movs.length < 2) return lineas;
  const fuentes = lineas.filter(l => l === cab || movs.includes(l) || l.tipo === 'formato');
  const pctL = fuentes.find(l => l.pct?.length);
  const deL = fuentes.find(l => l.pctDe);
  const fmt = p.formato;
  const nSets = fmt?.tipo === 'emom' ? Math.round(fmt.total / fmt.intervalo)
    : fmt?.tipo === 'rondas' ? fmt.rondas
    : +(fuentes.map(l => l.texto.match(/\b(\d+)\s*(?:sets?|series|rondas|rounds)\b/i)?.[1]).find(Boolean) || 0) || pctL?.pct.length || null;
  const movimientos = movs.map(l => ({ reps: l.repsLinea || 1, nombre: l.ejercicios[0] }));
  const complejo = {
    tipo: 'complejo', texto: cab?.texto || p.titulo, movimientos, ejercicios: movimientos.map(m => m.nombre),
    series: nSets, reps: movimientos.map(m => m.reps).join('+'),
    pct: pctL?.pct || null, pctRango: pctL?.pctRango, pctDe: deL?.pctDe || null,
    descanso: fuentes.find(l => l.descanso)?.descanso || null,
    intervalo: fmt?.tipo === 'emom' ? fmt.intervalo : null, base: null,
    links: fuentes.flatMap(l => l.links || []),
  };
  complejo.pctModo = modoPct(complejo.pct, complejo.series, complejo.pctRango);
  const usadas = new Set([cab, ...movs, ...(pctL && pctL.tipo === 'formato' ? [pctL] : [])].filter(Boolean));
  const resto = lineas.filter(l => !usadas.has(l));
  const pos = cab ? lineas.indexOf(cab) : 0;
  // El complejo ocupa el sitio de su cabecera; el resto (formato, instrucciones) se queda como estaba
  const antes = resto.filter(l => lineas.indexOf(l) < pos), despues = resto.filter(l => lineas.indexOf(l) > pos);
  return [...antes, complejo, ...despues];
}

// "Min 0-8: AMRAP" / "Min 8-10: Rest" / "Min 10-20: AMRAP" → tramos del reloj
function tramosPorMinuto(lineas) {
  const re = /^(?:min(?:uto)?s?\.?\s*)(\d+)\s*(?:-|–|a|al)\s*(\d+)\s*(?:min|'|’)?\s*[:.\-–]?\s*(.*)$|^(\d+)\s*(?:-|–)\s*(\d+)\s*(?:min|'|’)\s*[:.\-–]?\s*(.*)$/i;
  const tramos = [];
  for (const l of lineas) {
    const m = l.texto.match(re);
    if (!m) continue;
    const desde = +(m[1] ?? m[4]), hasta = +(m[2] ?? m[5]), label = (m[3] ?? m[6] ?? '').trim();
    if (!(hasta > desde)) continue;
    tramos.push({ desde, hasta, label: label || `Min ${desde}-${hasta}`, descanso: /^(rest|descanso)\b/i.test(norm(label)) });
    l.tipo = 'encabezado'; l.esFormato = true; l.ejercicios = []; l.base = null; l.tramo = tramos.length - 1;
  }
  return tramos.length >= 2 ? { tipo: 'segmentos', tramos: tramos.sort((a, b) => a.desde - b.desde) } : null;
}

// Saca el nombre del ejercicio quitando números, cargas, paréntesis…
export function nombresEjercicio(texto) {
  return texto
    .replace(/^\d+\)\s*/, '')
    // "5x3 Clean 75%" / "5 series de 3 clean": las series DELANTE del nombre se quitan sin borrar el nombre
    .replace(/^\s*\d+\s*(?:x|series?\s+de)\s*\d+\s*/i, ' ')
    .replace(/\([^)]*\)/g, ' ')
    // "@45%-50%-62.5%", "@60kg"
    .replace(/@\s*(?:[\d.,]+\s*%?\s*[-–\/]\s*)*[\d.,]+\s*(kg|lb|%)?/gi, ' ')
    // "del RM de Clean" / "de tu RM" detrás de un %: no es parte del nombre
    .replace(/\s(?:del?|of)\s+(?:(?:tu|su|el|la|your)\s+)?(?:1\s*)?rm\b.*$/i, ' ')
    // "con 70kg", "a 70 kilos", "60/40kg": la carga no es parte del nombre
    .replace(/\b(?:con|a|al)?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:kg|kgs|kilos?|lbs?)\b/gi, ' ')
    // "con 70% de" / "al 80%" / "60%-65%-70%": fuera del nombre
    .replace(/\b(?:con|al|a)?\s*\d{1,3}(?:[.,]\d+)?\s*%(?:\s*[-–\/]\s*\d{1,3}(?:[.,]\d+)?\s*%?)*(?:\s*(?:de|del|of)\s+(?:tu\s+|su\s+)?)?/gi, ' ')
    .replace(/\b(?:rest|descanso)\b.*$/i, ' ')
    .replace(/\b\d+(\s*[-–]\s*\d+)+\b/g, ' ')
    .split(/\s\+\s/)
    .map(p => p
      .replace(/^\s*\d+(?:[.,]\d+)?\s*[’'"]?(?:\s*\/\s*\d+\s*[’'"]?)?\s*(?:m|km|cal|seg|s|min)?(?=\s|$)\s*/i, m => (/cal/i.test(m) ? 'Cal ' : ''))
      .replace(/^\s*x\s*lado\s*/i, '')
      .replace(/^\s*(?:reps?|repes|repeticiones)\s+(?:de\s+)?/i, '')
      .replace(/\s+(?:por|x)\s+lado$/i, '')
      .replace(/\b\d+\s*x\s*\d+\b.*$/i, '')
      .replace(/\s+x\s*\d+\s*(?:sets?|series|rondas|rounds)?\s*$/i, '')
      .replace(/[:\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .map(p => ABREV[norm(p)] || p.split(' ').map(w => PALABRAS[norm(w)] || ABREV[norm(w)] || w).join(' '))
    .filter(p => p && /[a-záéíóúñ]{2}/i.test(p) && !/^(rest|descanso|rondas?|rounds?|bloques?|cada|every|sets?)\b/i.test(p));
}

// ¿Sobre qué 1RM se calcula el %? "Squat Snatch desde déficit" → Snatch
// puro = es exactamente ese levantamiento ("Squat Snatch" = Snatch, "Overhead Squats" = OHS);
// si no, el levantamiento más parecido que contenga ("Snatch Deadlift con pausa…" → Snatch Deadlift).
export function levantamientoBase(nombre) {
  const c = claveEjercicio(nombre);
  const puro = LEVANTAMIENTOS.find(L => L.puros.some(p => claveEjercicio(p) === c));
  if (puro) return { id: puro.id, puro: true };
  const t = ` ${c} `;
  let mejor = null;
  for (const L of LEVANTAMIENTOS) {
    for (const p of L.puros) {
      const k = claveEjercicio(p);
      if (k.length > 2 && t.includes(` ${k} `) && (!mejor || k.length > mejor.k.length)) mejor = { id: L.id, k };
    }
  }
  return mejor ? { id: mejor.id, puro: false } : null;
}

export function detectarFormato(texto, lineas = []) {
  const t = norm(texto);
  let m;
  const estaciones = lineas.filter(l => l.estacion).map(l => l.texto.replace(/^\d+\)\s*/, ''));
  if ((m = t.match(/e(\d+)mom\s*(?:x\s*)?(\d+)/))) return { tipo: 'emom', intervalo: +m[1] * 60, total: +m[2] * 60, estaciones };
  if ((m = t.match(/emom\s*(?:x\s*)?(\d+)/))) return { tipo: 'emom', intervalo: 60, total: +m[1] * 60, estaciones };
  // "Cada 1:30 x 6 sets", "every 2 min x 5", "cada 90'' x 6", "cada 2' durante 10 min" → un intervalo fijo que empieza cada X
  if ((m = t.match(/\b(?:cada|every)\s*(\d+)(?::(\d{2}))?\s*(min(?:utos?)?|'|’|seg(?:undos)?|''|"|s\b)?\s*(?:x|por|durante|for)\s*(\d+)\s*(min(?:utos?)?|'|’)?/))) {
    const enSeg = /^(seg|''|"|s)/.test(m[3] || '');
    const intervalo = m[2] ? +m[1] * 60 + +m[2] : enSeg ? +m[1] : +m[1] * 60;
    const total = m[5] ? +m[4] * 60 : +m[4] * intervalo;
    return { tipo: 'emom', intervalo, total, estaciones };
  }
  // Varios AMRAP seguidos: "3 x AMRAP 5 min", "3 AMRAPs de 5'", "AMRAP 5 min x 3" (+ "2 min descanso")
  const desc = t.match(/(\d+(?:[.,]\d+)?)\s*(?:min|')\s*(?:de\s*)?(?:rest|descanso)|(?:rest|descanso)\s*:?\s*(\d+(?:[.,]\d+)?)/);
  const minDesc = desc ? parseFloat((desc[1] || desc[2]).replace(',', '.')) : 0;
  if ((m = t.match(/(\d+)\s*(?:x\s*)?amraps?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/)) && +m[1] > 1) {
    return { tipo: 'bloques', sub: 'amrap', rondas: +m[1], trabajo: parseFloat(m[2].replace(',', '.')) * 60, descanso: minDesc * 60 };
  }
  if ((m = t.match(/amrap\s*(\d+(?:[.,]\d+)?)\s*(?:min|')?\s*x\s*(\d+)/))) {
    return { tipo: 'bloques', sub: 'amrap', rondas: +m[2], trabajo: parseFloat(m[1].replace(',', '.')) * 60, descanso: minDesc * 60 };
  }
  if ((m = t.match(/amrap\s*(?:x\s*)?(\d+)/))) return { tipo: 'amrap', total: +m[1] * 60 };
  if (/tabata/.test(t)) return { tipo: 'intervalos', rondas: 8, trabajo: 20, descanso: 10 };
  // "2 Bloques (12 min de trabajo + 3 min rest cada uno)": cada bloque es un For Time con límite
  if ((m = t.match(/(\d+)\s*bloques?\s*\(\s*(\d+)\s*min[^+]*\+\s*(\d+)\s*min/))) {
    return { tipo: 'bloques', sub: 'fortime', rondas: +m[1], trabajo: +m[2] * 60, descanso: +m[3] * 60 };
  }
  if (/for time|por tiempo/.test(t)) {
    const cap = t.match(/(?:time cap|cap|tc)\s*:?\s*(\d+)/);
    return { tipo: 'fortime', cap: cap ? +cap[1] * 60 : null };
  }
  if ((m = t.match(/(?:^|\n)\s*(\d+)\s*(?:rondas|rounds|rds|vueltas)\b/))) return { tipo: 'rondas', rondas: +m[1] };
  if ((m = t.match(/(?:^|\n)\s*(\d+)\s*(?:min|')\s*[a-z]/))) return { tipo: 'tiempo', total: +m[1] * 60 };
  return null;
}

export function textoFormato(f) {
  if (!f) return '';
  const min = s => (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s / 60} min`);
  switch (f.tipo) {
    case 'bloques': return `${f.rondas} × ${f.sub === 'fortime' ? 'For Time' : 'AMRAP'} ${min(f.trabajo)}${f.descanso ? ` (${min(f.descanso)} descanso)` : ''}`;
    case 'emom': return f.intervalo === 60 ? `EMOM ${min(f.total)}` : f.intervalo % 60 === 0 ? `E${f.intervalo / 60}MOM ${min(f.total)}` : `Cada ${min(f.intervalo)} × ${Math.round(f.total / f.intervalo)}`;
    case 'amrap': return `AMRAP ${min(f.total)}`;
    case 'intervalos': return f.trabajo === 20 && f.descanso === 10 ? 'Tabata' : `${f.rondas} × (${min(f.trabajo)} + ${min(f.descanso)} descanso)`;
    case 'fortime': return f.cap ? `For Time (cap ${min(f.cap)})` : 'For Time';
    case 'rondas': return `${f.rondas} rondas`;
    case 'tiempo': return min(f.total);
    case 'segmentos': return f.tramos.map(x => `${x.desde}-${x.hasta}' ${x.descanso ? 'descanso' : x.label}`).join(' · ');
    default: return '';
  }
}
