// RM (repetición máxima): de qué marca sacar los kilos de un porcentaje y cómo guardar récords.
import { LEVANTAMIENTOS } from './datos.js';
import { claveEjercicio, levantamientoBase } from './parser.js';

const LEV = Object.fromEntries(LEVANTAMIENTOS.map(L => [L.id, L]));

// Id con el que se guardan las marcas de un ejercicio:
// levantamientos conocidos por su id ("hang-power-clean"); cualquier otro, "x:" + su nombre normalizado.
export function idRM(nombre) {
  const b = levantamientoBase(nombre);
  return b?.puro ? b.id : 'x:' + claveEjercicio(nombre);
}

export const nombreRM = (id, marcas = []) =>
  LEV[id]?.name || marcas.find(m => m.ejercicio === id && m.nombre)?.nombre || id.replace(/^x:/, '');

// Mejor 1RM de un ejercicio. Si solo hay marcas de varias repeticiones (3RM, 5RM…),
// lo estima con la fórmula de Epley: 1RM ≈ kilos × (1 + reps / 30).
export function mejorRM(marcas, id) {
  const mias = marcas.filter(m => m.tipo === 'fuerza' && m.ejercicio === id && m.kg);
  const unas = mias.filter(m => m.reps === 1).map(m => m.kg);
  if (unas.length) return { kg: Math.max(...unas), estimado: false };
  if (!mias.length) return null;
  const est = mias.map(m => ({ kg: m.kg * (1 + m.reps / 30), m })).sort((a, b) => b.kg - a.kg)[0];
  return { kg: Math.round(est.kg * 2) / 2, estimado: true, desde: `${est.m.kg} kg × ${est.m.reps}` };
}

// Para una línea del entreno: ¿sobre qué RM se calcula su %?
// 1) el que diga el texto ("70% de Hang Power Clean")  2) el del propio ejercicio
// 3) su levantamiento base y luego los "padres" (Hang Power Clean → Power Clean → Clean → Clean & Jerk)
export function rmParaLinea(l, marcas) {
  const candidatos = [];
  const cadena = id => { for (let x = id; x; x = LEV[x]?.padre) candidatos.push(x); };
  if (l.pctDe) { candidatos.push(idRM(l.pctDe)); cadena(levantamientoBase(l.pctDe)?.id); }
  if (l.ejercicios?.[0]) candidatos.push(idRM(l.ejercicios[0]));
  cadena(l.base?.id);
  const unicos = [...new Set(candidatos.filter(Boolean))];
  for (const id of unicos) {
    const rm = mejorRM(marcas, id);
    if (rm) return { ...rm, id, nombre: nombreRM(id, marcas), esPropio: id === unicos[0] };
  }
  const preferido = unicos.find(id => LEV[id]) || unicos[0];
  return preferido ? { kg: null, id: preferido, nombre: nombreRM(preferido, marcas) } : null;
}

// ---------- v3: referencia, Training Max, estimado aceptado y redondeo ----------
// Ajustes (settings.entreno): { redondeo: 1, modo: 'cercano'|'abajo', usarTM: false, tm: { id: kg }, estimados: { id: true } }
export const CFG_ENTRENO = { redondeo: 1, modo: 'cercano', usarTM: false, tm: {}, estimados: {} };
export const cfgEntreno = c => ({ ...CFG_ENTRENO, ...(c || {}) });

// Redondea a una carga que se puede montar (paso en kg; 0 = sin redondear)
export function redondear(kg, paso = 1, modo = 'cercano') {
  if (kg == null) return null;
  if (!paso) return Math.round(kg * 100) / 100;
  const f = modo === 'abajo' ? Math.floor : Math.round;
  return Math.round(f(kg / paso + 1e-9) * paso * 100) / 100;
}

// Candidatos a RM de referencia de una línea, en orden (sin inventar nada)
export function candidatosRM(l) {
  const out = [];
  const cadena = id => { for (let x = id; x; x = LEV[x]?.padre) out.push(x); };
  if (l.pctDe) { out.push(idRM(l.pctDe)); cadena(levantamientoBase(l.pctDe)?.id); }
  if (l.tipo === 'complejo') for (const n of l.ejercicios || []) { out.push(idRM(n)); cadena(levantamientoBase(n)?.id); }
  else {
    if (l.ejercicios?.[0]) out.push(idRM(l.ejercicios[0]));
    cadena(l.base?.id);
  }
  return [...new Set(out.filter(Boolean))];
}

// Base de una línea para calcular los %: { id, nombre, kg|null, fuente: 'rm'|'tm'|'estimado', dudosa, estimado, propia, sinRM }
//  - Lo que elegiste tú (elegida) manda.
//  - "% del RM de X" → X. Un complejo SIN referencia en el texto → hay que elegirla (no se adivina).
//  - Un 1RM estimado (de un 3RM/5RM) solo se usa si lo aceptaste para ese levantamiento.
//  - Con "Usar Training Max" y un TM apuntado, se usa el TM.
export function referenciaLinea(l, marcas, cfg = CFG_ENTRENO, elegida = null) {
  const c = cfgEntreno(cfg);
  const cand = candidatosRM(l);
  const lista = elegida ? [elegida] : cand;
  const dudosa = !elegida && l.tipo === 'complejo' && !l.pctDe;
  const valor = id => {
    if (c.usarTM && c.tm?.[id]) return { kg: c.tm[id], fuente: 'tm' };
    const rm = mejorRM(marcas, id);
    if (!rm) return null;
    if (rm.estimado && !c.estimados?.[id]) return { kg: null, estimado: rm };
    return { kg: rm.kg, fuente: rm.estimado ? 'estimado' : 'rm', desde: rm.desde };
  };
  if (dudosa) return { id: null, nombre: null, kg: null, dudosa: true, candidatos: cand };
  for (const id of lista) {
    const v = valor(id);
    if (v?.kg) return { id, nombre: nombreRM(id, marcas), ...v, propia: id === lista[0], candidatos: cand };
    if (v?.estimado && id === lista[0]) return { id, nombre: nombreRM(id, marcas), kg: null, estimado: v.estimado, candidatos: cand };
  }
  const id = lista.find(x => LEV[x]) || lista[0] || null;
  return { id, nombre: id ? nombreRM(id, marcas) : null, kg: null, sinRM: true, candidatos: cand };
}

// Plan de cada serie: { pct, pctHasta?, teorico, teoricoHasta?, kg, reps }
export function planSeries(l, ref, cfg = CFG_ENTRENO) {
  const c = cfgEntreno(cfg);
  const n = l.series || (l.tipo === 'complejo' ? l.pct?.length : 0) || 0;
  if (!n) return null;
  const pcts = l.pct || [];
  const deSerie = i => {
    if (l.pctModo === 'rango') return [pcts[0], pcts[1]];
    if (l.pctModo === 'serie' || l.pctModo === 'dudoso') return [pcts[Math.min(i, pcts.length - 1)]];
    return pcts.length ? [pcts[0]] : [];
  };
  return Array.from({ length: n }, (_, i) => {
    const [p, p2] = deSerie(i);
    if (l.kg && !p) return { kg: l.kg, teorico: l.kg, reps: l.reps };
    const teorico = ref?.kg && p ? (ref.kg * p) / 100 : null;
    const teoricoHasta = ref?.kg && p2 ? (ref.kg * p2) / 100 : null;
    return { pct: p ?? null, pctHasta: p2 ?? null, teorico, teoricoHasta, kg: redondear(teorico, c.redondeo, c.modo), kgHasta: redondear(teoricoHasta, c.redondeo, c.modo), reps: l.reps };
  });
}
