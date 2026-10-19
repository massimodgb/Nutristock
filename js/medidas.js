// Medidas corporales (cintura, cadera y las que añadas) y cálculos del peso: media semanal, cambios y tendencia.
//
// Cada medida es una fila de la tabla "medidas": { id, fecha, tipo, valor, unidad, sesion, representativa, nota }
//   - Puedes medir varias veces en la misma sesión (87,5 y 85,5 cm): se guardan TODAS.
//   - Tú eliges cuál es la representativa (la que va a las gráficas e informes). No se hace la media sola.
//   - Si en una sesión no hay ninguna marcada, la gráfica enseña las tomas sueltas, sin inventar un valor.
// Lo calculado (medias, tendencias) siempre se distingue de lo medido.
import { db, getSetting } from './db.js';
import { addDays } from './nutri.js';
import { tendenciaPeso } from './balance.js';

export const TIPOS_BASE = [
  { id: 'cintura', nombre: 'Cintura', unidad: 'cm' },
  { id: 'cadera', nombre: 'Cadera', unidad: 'cm' },
];
export async function tiposMedida() {
  return [...TIPOS_BASE, ...(await getSetting('tiposMedida', []))];
}
export const idTipo = nombre => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'medida';

// Agrupa las filas de un tipo por sesión: [{ sesion, fecha, tomas: [...], rep: fila|null, nota }]
export function sesionesDe(filas, tipo) {
  const por = {};
  for (const f of filas.filter(x => x.tipo === tipo)) (por[f.sesion || f.id] ||= []).push(f);
  return Object.entries(por).map(([sesion, tomas]) => {
    tomas.sort((a, b) => (a.ts || a.id) - (b.ts || b.id));
    const marcada = tomas.find(t => t.representativa);
    return { sesion, fecha: tomas[0].fecha, tomas, rep: marcada || (tomas.length === 1 ? tomas[0] : null), nota: tomas.find(t => t.nota)?.nota || '' };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Serie para la gráfica: una sesión = un punto (la representativa); sin representativa, solo sus tomas sueltas
export const serieDe = (filas, tipo) => sesionesDe(filas, tipo).map(s => ({ fecha: s.fecha, valor: s.rep?.valor ?? null, tomas: s.tomas.map(t => t.valor) }));

// Cambio frente a la medición anterior y frente a la de hace ~1 mes (solo con valores representativos)
export function cambiosMedida(serie) {
  const con = serie.filter(p => p.valor != null);
  if (!con.length) return null;
  const ult = con[con.length - 1], ant = con[con.length - 2] || null;
  const mes = [...con].reverse().find(p => p.fecha <= addDays(ult.fecha, -25)) || null;
  return { ultima: ult, vsAnterior: ant ? ult.valor - ant.valor : null, anterior: ant, vsMes: mes ? ult.valor - mes.valor : null, mes };
}

// Guarda una sesión de medidas (todo o nada). tomas: [{ valor, representativa }]. Sustituye la sesión si ya existía.
export async function guardarSesion({ sesion, fecha, tipo, unidad = 'cm', tomas, nota = '' }) {
  const validas = tomas.filter(t => t.valor > 0);
  if (!validas.length) throw new Error('Pon al menos una medida');
  const id = sesion || `${fecha}-${tipo}-${Date.now().toString(36)}`;
  await db.transaction('rw', db.medidas, async () => {
    if (sesion) await db.medidas.where('tipo').equals(tipo).filter(f => f.sesion === sesion).delete();
    let ts = Date.now();
    for (const t of validas) {
      await db.medidas.add({ fecha, tipo, valor: Math.round(t.valor * 10) / 10, unidad, sesion: id, representativa: !!t.representativa, nota: nota.trim() || null, ts: ts++ });
    }
  });
  return id;
}
export async function borrarSesion(tipo, sesion) {
  await db.medidas.where('tipo').equals(tipo).filter(f => f.sesion === sesion).delete();
}

// ---------- Peso ----------
// Lunes de la semana de una fecha
export function lunesDe(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  const dia = (d.getDay() + 6) % 7;
  return addDays(fecha, -dia);
}
// Media de cada semana (lunes a domingo) con al menos `min` pesajes: [{ semana, media, n }]
export function mediasSemanales(weights, min = 2) {
  const por = {};
  for (const w of weights) (por[lunesDe(w.date)] ||= []).push(w.kg);
  return Object.entries(por).map(([semana, kgs]) => ({ semana, media: kgs.reduce((a, b) => a + b, 0) / kgs.length, n: kgs.length }))
    .filter(s => s.n >= min).sort((a, b) => a.semana.localeCompare(b.semana));
}
const mediaEntre = (weights, desde, hasta) => {
  const v = weights.filter(w => w.date >= desde && w.date <= hasta).map(w => w.kg);
  return v.length >= 2 ? { media: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
};
// Resumen del peso a una fecha: media de 7 días, cambio semanal y mensual (de medias de 7 días), tendencia
// y la comparación con tu objetivo. Si faltan datos, el valor es null (no se inventa).
export function resumenPeso(weights, hoy, objetivoSemana = null) {
  const orden = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const ahora = mediaEntre(orden, addDays(hoy, -6), hoy);
  const semanaAntes = mediaEntre(orden, addDays(hoy, -13), addDays(hoy, -7));
  const mesAntes = mediaEntre(orden, addDays(hoy, -34), addDays(hoy, -28));
  const ult28 = orden.filter(w => w.date >= addDays(hoy, -27));
  const tend = tendenciaPeso(ult28);
  return {
    ultimo: orden[orden.length - 1] || null,
    media7: ahora?.media ?? null,
    cambioSemana: ahora && semanaAntes ? ahora.media - semanaAntes.media : null,
    cambioMes: ahora && mesAntes ? ahora.media - mesAntes.media : null,
    tendencia: tend ? tend.kgSemana : null,
    objetivo: objetivoSemana,
    frenteObjetivo: tend && objetivoSemana != null ? tend.kgSemana - objetivoSemana : null,
  };
}
