// Whoop: conectar tu cuenta y traer recuperación, sueño, esfuerzo (strain), calorías gastadas, entrenos y peso.
// La conexión pasa por la función "whoop" de tu Supabase (allí está la clave secreta de Whoop, nunca en la app).
// Los datos se guardan en la tabla local "whoop" (y viajan a la nube con lo demás).
import { db, getSetting, setSetting } from './db.js';
import { todayStr } from './nutri.js';
import { llamarFuncion, escucharNube, estadoNube } from './nube.js';

const CADA = 30 * 60e3; // como mucho, una actualización cada 30 minutos (salvo que la pidas tú)

// Fecha del día según la hora local del registro ("+02:00")
export function fechaLocal(iso, offset) {
  if (!iso) return null;
  const m = /([+-])(\d{2}):?(\d{2})/.exec(offset || '');
  const min = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : -new Date(iso).getTimezoneOffset();
  return new Date(Date.parse(iso) + min * 60e3).toISOString().slice(0, 10);
}

export const estadoWhoop = () => getSetting('whoop', { conectado: false });

export async function conectarWhoop() {
  const r = await llamarFuncion('whoop', { accion: 'iniciar' });
  await setSetting('whoop', { ...(await estadoWhoop()), pendiente: Date.now() });
  location.href = r.url; // se abre Whoop; al aceptar, vuelve a una página que dice "conectado"
}

// Tras volver de Whoop: ¿quedó conectado?
export async function comprobarWhoop() {
  const r = await llamarFuncion('whoop', { accion: 'estado' });
  const est = await estadoWhoop();
  await setSetting('whoop', { ...est, conectado: r.conectado, pendiente: null, reconectar: false });
  if (r.conectado) await sincronizarWhoop({ forzar: true });
  return r.conectado;
}

export async function desconectarWhoop() {
  await llamarFuncion('whoop', { accion: 'desconectar' });
  await setSetting('whoop', { ...(await estadoWhoop()), conectado: false });
}

let enMarcha = null;
export function sincronizarWhoop(op) {
  if (!enMarcha) enMarcha = traer(op).finally(() => { enMarcha = null; });
  return enMarcha;
}

async function traer({ forzar = false } = {}) {
  const est = await estadoWhoop();
  if (!est.conectado || !estadoNube().conectado) return null;
  if (!forzar && est.ultima && Date.now() - Date.parse(est.ultima) < CADA) return null;
  // Se piden unos días hacia atrás: Whoop termina de puntuar el sueño y la recuperación más tarde
  const desde = new Date(est.ultima ? Date.parse(est.ultima) - 4 * 864e5 : Date.now() - 60 * 864e5).toISOString();
  const r = await llamarFuncion('whoop', { accion: 'datos', desde });
  if (!r?.conectado) {
    await setSetting('whoop', { ...est, conectado: false, reconectar: !!r?.reconectar });
    return null;
  }
  const filas = [];
  const fechaCiclo = {};
  for (const c of r.ciclos || []) {
    const f = fechaLocal(c.start, c.timezone_offset);
    fechaCiclo[c.id] = f;
    filas.push({ id: 'ciclo:' + c.id, tipo: 'ciclo', fecha: f, d: c });
  }
  for (const x of r.recuperaciones || []) {
    const f = fechaCiclo[x.cycle_id] || (await db.whoop.get('ciclo:' + x.cycle_id))?.fecha || fechaLocal(x.created_at);
    filas.push({ id: 'recuperacion:' + x.cycle_id, tipo: 'recuperacion', fecha: f, d: x });
  }
  for (const s of r.suenos || []) filas.push({ id: 'sueno:' + s.id, tipo: 'sueno', fecha: fechaLocal(s.end || s.start, s.timezone_offset), d: s });
  for (const w of r.entrenos || []) filas.push({ id: 'entreno:' + w.id, tipo: 'entreno', fecha: fechaLocal(w.start, w.timezone_offset), d: w });
  if (filas.length) await db.whoop.bulkPut(filas);

  // Peso: solo si en Whoop cambió (si no, apuntaríamos cada día el mismo número viejo)
  const kg = r.cuerpo?.weight_kilogram ? Math.round(r.cuerpo.weight_kilogram * 10) / 10 : null;
  let pesoWhoop = est.pesoWhoop ?? null;
  if (kg && kg !== est.pesoWhoop) {
    if (!(await db.weights.get(todayStr()))) await db.weights.put({ date: todayStr(), kg, fuente: 'whoop' });
    pesoWhoop = kg;
  }
  await setSetting('whoop', { ...est, conectado: true, reconectar: false, ultima: new Date().toISOString(), pesoWhoop,
    alturaM: r.cuerpo?.height_meter ?? est.alturaM ?? null, fcMax: r.cuerpo?.max_heart_rate ?? est.fcMax ?? null });
  return filas.length;
}

// Lo de un día, ya resumido
export function resumenWhoop(filas) {
  const de = t => filas.filter(f => f.tipo === t).map(f => f.d);
  const ciclo = de('ciclo').sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0];
  const rec = de('recuperacion')[0];
  const sueno = de('sueno').filter(s => !s.nap).sort((a, b) => (b.end || '').localeCompare(a.end || ''))[0];
  const st = sueno?.score?.stage_summary;
  const dormido = st ? (st.total_in_bed_time_milli - st.total_awake_time_milli) / 3.6e6 : null;
  return {
    recuperacion: rec?.score?.recovery_score ?? null,
    hrv: rec?.score?.hrv_rmssd_milli ?? null,
    fcReposo: rec?.score?.resting_heart_rate ?? null,
    sueno: sueno?.score?.sleep_performance_percentage ?? null,
    horas: dormido,
    strain: ciclo?.score?.strain ?? null,
    kcal: ciclo?.score?.kilojoule ? ciclo.score.kilojoule / 4.184 : null,
    enCurso: ciclo ? !ciclo.end : false,
    entrenos: de('entreno').map(w => ({ deporte: w.sport_name, strain: w.score?.strain, kcal: w.score?.kilojoule ? w.score.kilojoule / 4.184 : null, inicio: w.start })),
  };
}

export const colorRecuperacion = r => r == null ? '' : r >= 67 ? 'ok' : r >= 34 ? 'warn' : 'bad';

// Al arrancar: actualizar cuando haya sesión, y al volver a la app
export function iniciarWhoop() {
  escucharNube(e => { if (e.conectado) sincronizarWhoop().catch(err => console.error('Whoop', err)); });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !estadoNube().conectado) return;
    const est = await estadoWhoop();
    // Volviste de conectar Whoop: comprobarlo solo
    if (est.pendiente && Date.now() - est.pendiente < 30 * 60e3) comprobarWhoop().catch(err => console.error('Whoop', err));
    else sincronizarWhoop().catch(err => console.error('Whoop', err));
  });
}
