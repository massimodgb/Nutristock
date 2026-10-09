// Convierte el texto que manda la entrenadora (WhatsApp, notas…) en un entreno ordenado:
//   secciones (Calentamiento, FUERZA, WOD, Opcional…) → partes (separadas por líneas en blanco) → líneas.
// Detecta formatos (EMOM, AMRAP, For Time, rondas, bloques con descanso, Tabata), series x reps,
// porcentajes, cargas (@60kg), esquemas 15-12-9 y enlaces de YouTube.
import { LEVANTAMIENTOS, ABREV } from './datos.js';

export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
  const sr = (l.prescripcion || l.texto).match(/\b(\d+)\s*x\s*(\d+)\b/i);
  if (sr) { out.series = +sr[1]; out.reps = +sr[2]; }
  const pct = todo.match(/(\d{2,3}(?:\s*[-–]\s*\d{2,3})*)\s*%/);
  if (pct) out.pct = pct[1].split(/[-–]/).map(x => +x.trim());
  const carga = todo.match(/@\s*(\d+(?:[.,]\d+)?)\s*(kg|lb)/i);
  if (carga) out.kg = +carga[1].replace(',', '.') * (carga[2].toLowerCase() === 'lb' ? 0.4536 : 1);
  out.estacion = (l.texto.match(/^(\d+)\)\s*/) || [])[1] ? +l.texto.match(/^(\d+)\)/)[1] : null;
  // Las líneas que solo dicen el formato ("EMOM x 18min", "3 Rondas:", "Rest: 3 min") no son ejercicios
  const sinFormato = l.texto.replace(/\([^)]*\)|\d+|emom|amrap|rondas?|rounds?|min|for time|bloques?|trabajo|rest|cada uno|time cap|[x:+]/gi, '').trim();
  out.esFormato = /^(rest|descanso)\b/i.test(l.texto) || (!!detectarFormato(l.texto) && sinFormato.length < 3);
  out.ejercicios = out.esFormato ? [] : nombresEjercicio(l.texto);
  out.base = out.ejercicios.length ? levantamientoBase(out.ejercicios[0]) : null;
  return out;
}

// Saca el nombre del ejercicio quitando números, cargas, paréntesis…
export function nombresEjercicio(texto) {
  return texto
    .replace(/^\d+\)\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/@\s*[\d.,]+\s*(kg|lb|%)?/gi, ' ')
    .replace(/\b\d+(\s*[-–]\s*\d+)+\b/g, ' ')
    .split(/\s\+\s/)
    .map(p => p
      .replace(/^\s*\d+(?:[.,]\d+)?\s*[’'"]?(?:\s*\/\s*\d+\s*[’'"]?)?\s*(?:m|km|cal|seg|s|min)?(?=\s|$)\s*/i, m => (/cal/i.test(m) ? 'Cal ' : ''))
      .replace(/^\s*x\s*lado\s*/i, '')
      .replace(/\s+(?:por|x)\s+lado$/i, '')
      .replace(/\b\d+\s*x\s*\d+\b.*$/i, '')
      .replace(/[:]+$/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .map(p => ABREV[norm(p)] || p.split(' ').map(w => ABREV[norm(w)] || w).join(' '))
    .filter(p => p && /[a-záéíóúñ]{2}/i.test(p) && !/^(rest|descanso|rondas?|rounds?|bloques?)\b/i.test(p));
}

// ¿Sobre qué 1RM se calcula el %? "Squat Snatch desde déficit" → Snatch
export function levantamientoBase(nombre) {
  const t = norm(nombre);
  const puro = LEVANTAMIENTOS.find(L => L.puros.includes(t));
  if (puro) return { id: puro.id, puro: true };
  const orden = [
    ['power snatch', 'power-snatch'], ['snatch', 'snatch'], ['clean and jerk', 'clean-jerk'], ['clean & jerk', 'clean-jerk'],
    ['power clean', 'power-clean'], ['clean', 'clean'], ['jerk', 'jerk'], ['front squat', 'front-squat'],
    ['overhead squat', 'ohs'], ['back squat', 'back-squat'], ['push press', 'push-press'], ['bench', 'bench'],
    ['deadlift', 'deadlift'], ['peso muerto', 'deadlift'], ['thruster', 'thruster'],
  ];
  const hit = orden.find(([k]) => t.includes(k));
  return hit ? { id: hit[1], puro: false } : null;
}

export function detectarFormato(texto, lineas = []) {
  const t = norm(texto);
  let m;
  const estaciones = lineas.filter(l => l.estacion).map(l => l.texto.replace(/^\d+\)\s*/, ''));
  if ((m = t.match(/e(\d+)mom\s*(?:x\s*)?(\d+)/))) return { tipo: 'emom', intervalo: +m[1] * 60, total: +m[2] * 60, estaciones };
  if ((m = t.match(/emom\s*(?:x\s*)?(\d+)/))) return { tipo: 'emom', intervalo: 60, total: +m[1] * 60, estaciones };
  if ((m = t.match(/amrap\s*(?:x\s*)?(\d+)/))) return { tipo: 'amrap', total: +m[1] * 60 };
  if (/tabata/.test(t)) return { tipo: 'intervalos', rondas: 8, trabajo: 20, descanso: 10 };
  if ((m = t.match(/(\d+)\s*bloques?\s*\(\s*(\d+)\s*min[^+]*\+\s*(\d+)\s*min/))) {
    return { tipo: 'intervalos', rondas: +m[1], trabajo: +m[2] * 60, descanso: +m[3] * 60 };
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
  const min = s => `${Math.round(s / 60)} min`;
  switch (f.tipo) {
    case 'emom': return f.intervalo === 60 ? `EMOM ${min(f.total)}` : `E${f.intervalo / 60}MOM ${min(f.total)}`;
    case 'amrap': return `AMRAP ${min(f.total)}`;
    case 'intervalos': return f.trabajo === 20 && f.descanso === 10 ? 'Tabata' : `${f.rondas} × (${min(f.trabajo)} + ${min(f.descanso)} descanso)`;
    case 'fortime': return f.cap ? `For Time (cap ${min(f.cap)})` : 'For Time';
    case 'rondas': return `${f.rondas} rondas`;
    case 'tiempo': return min(f.total);
    default: return '';
  }
}
