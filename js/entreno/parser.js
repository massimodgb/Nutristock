// Convierte el texto que manda la entrenadora (WhatsApp, notas…) en un entreno ordenado:
//   secciones (Calentamiento, FUERZA, WOD, Opcional…) → partes (separadas por líneas en blanco) → líneas.
// Detecta formatos (EMOM, AMRAP, For Time, rondas, bloques con descanso, Tabata), series x reps,
// porcentajes, cargas (@60kg), esquemas 15-12-9 y enlaces de YouTube.
import { LEVANTAMIENTOS, ABREV, PALABRAS, IMPLEMENTO } from './datos.js';

export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
      p.formato = detectarFormato([p.titulo, ...p.lineas.map(l => l.texto)].join('\n'), p.lineas);
    }
    s.formato = s.partes.find(p => p.formato && p.formato.tipo !== 'tiempo')?.formato || null;
  }
  return { secciones: secciones.filter(s => s.partes.length) };
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
    if (/^\d+\s*x\s*\d+\b/i.test(t) && out.length && !/^\d+\s*x\s*\d+/i.test(out[out.length - 1].texto)) {
      const prev = out[out.length - 1];
      prev.prescripcion = t;
      if (lineas[i].links) (prev.links ||= []).push(...lineas[i].links);
      continue;
    }
    out.push({ ...lineas[i] });
  }
  return out;
}

function analizarLinea(l) {
  const todo = `${l.texto} ${l.prescripcion || ''}`;
  const out = { ...l };
  const sr = (l.prescripcion || l.texto).match(/\b(\d+)\s*(?:x|series?\s+de)\s*(\d+)\b/i);
  if (sr) { out.series = +sr[1]; out.reps = +sr[2]; }
  const rl = l.texto.match(/^\s*(?:\d+\)\s*)?(\d+)\s*(?:reps?|repes|x)?\s+[a-záéíóúñ]/i);
  if (rl && !sr) out.repsLinea = +rl[1];
  // Porcentajes en cualquier forma: "@ 100-110%", "(80-85-90%)", "60%-65%-70%", "con 70%"
  const pcts = [...todo.matchAll(/(\d{2,3}(?:\s*[-–\/]\s*\d{2,3})*)\s*%/g)].flatMap(m => m[1].split(/[-–\/]/).map(x => +x.trim()));
  if (pcts.length) out.pct = pcts;
  // "70% de Hang Power Clean" / "80% del clean" / "75% of snatch": el % es de ESE levantamiento
  const de = todo.match(/%\s*(?:de|del|of)\s+(?:tu\s+|su\s+|el\s+|la\s+)?(?:1\s*rm\s+(?:del?\s+)?)?([a-záéíóúñ&][a-záéíóúñ&\s-]{1,40}?)\s*(?=$|[,.;:()@]|\s\d)/i);
  if (de) out.pctDe = de[1].trim();
  // Kilos escritos de cualquier forma: "@60kg", "con 70 kg", "a 70 kilos", "60/40kg" (hombre/mujer: el primero)
  const carga = todo.match(/(\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(kg|kgs|kilos?|lbs?)\b/i);
  if (carga) out.kg = Math.round(+carga[1].replace(',', '.') * (/^lb/i.test(carga[2]) ? 0.4536 : 1) * 10) / 10;
  out.estacion = (l.texto.match(/^(\d+)\)\s*/) || [])[1] ? +l.texto.match(/^(\d+)\)/)[1] : null;
  // Las líneas que solo dicen el formato ("EMOM x 18min", "3 Rondas:", "Rest: 3 min") no son ejercicios
  const sinFormato = l.texto.replace(/\([^)]*\)|\d+|emom|amraps?|rondas?|rounds?|min|for time|bloques?|trabajo|rest|descanso|cada uno|time cap|\b(con|de|y|entre)\b|[x:+'’,.]/gi, '').trim();
  out.esFormato = /^(rest|descanso)\b/i.test(l.texto) || (!!detectarFormato(l.texto) && sinFormato.length < 3);
  out.ejercicios = out.esFormato ? [] : nombresEjercicio(l.texto);
  out.base = out.ejercicios.length ? levantamientoBase(out.ejercicios[0]) : null;
  return out;
}

// Saca el nombre del ejercicio quitando números, cargas, paréntesis…
export function nombresEjercicio(texto) {
  return texto
    .replace(/^\d+\)\s*/, '')
    // "5x3 Clean 75%" / "5 series de 3 clean": las series DELANTE del nombre se quitan sin borrar el nombre
    .replace(/^\s*\d+\s*(?:x|series?\s+de)\s*\d+\s*/i, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/@\s*[\d.,]+\s*(kg|lb|%)?/gi, ' ')
    // "con 70kg", "a 70 kilos", "60/40kg": la carga no es parte del nombre
    .replace(/\b(?:con|a|al)?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:kg|kgs|kilos?|lbs?)\b/gi, ' ')
    // "con 70% de" / "al 80%" / "60%-65%-70%": fuera del nombre
    .replace(/\b(?:con|al|a)?\s*\d{2,3}\s*%(?:\s*[-–\/]\s*\d{2,3}\s*%?)*(?:\s*(?:de|del|of)\s+(?:tu\s+|su\s+)?)?/gi, ' ')
    .replace(/\b\d+(\s*[-–]\s*\d+)+\b/g, ' ')
    .split(/\s\+\s/)
    .map(p => p
      .replace(/^\s*\d+(?:[.,]\d+)?\s*[’'"]?(?:\s*\/\s*\d+\s*[’'"]?)?\s*(?:m|km|cal|seg|s|min)?(?=\s|$)\s*/i, m => (/cal/i.test(m) ? 'Cal ' : ''))
      .replace(/^\s*x\s*lado\s*/i, '')
      .replace(/^\s*(?:reps?|repes|repeticiones)\s+(?:de\s+)?/i, '')
      .replace(/\s+(?:por|x)\s+lado$/i, '')
      .replace(/\b\d+\s*x\s*\d+\b.*$/i, '')
      .replace(/[:\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .map(p => ABREV[norm(p)] || p.split(' ').map(w => PALABRAS[norm(w)] || ABREV[norm(w)] || w).join(' '))
    .filter(p => p && /[a-záéíóúñ]{2}/i.test(p) && !/^(rest|descanso|rondas?|rounds?|bloques?)\b/i.test(p));
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
    case 'emom': return f.intervalo === 60 ? `EMOM ${min(f.total)}` : `E${f.intervalo / 60}MOM ${min(f.total)}`;
    case 'amrap': return `AMRAP ${min(f.total)}`;
    case 'intervalos': return f.trabajo === 20 && f.descanso === 10 ? 'Tabata' : `${f.rondas} × (${min(f.trabajo)} + ${min(f.descanso)} descanso)`;
    case 'fortime': return f.cap ? `For Time (cap ${min(f.cap)})` : 'For Time';
    case 'rondas': return `${f.rondas} rondas`;
    case 'tiempo': return min(f.total);
    default: return '';
  }
}
