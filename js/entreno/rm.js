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
