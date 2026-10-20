// Copias de seguridad: exportar a un archivo (OneDrive/Archivos), copias automáticas internas y restaurar con seguridad.
//
// OJO, para no engañarnos:
// - Las copias INTERNAS viven en el mismo iPhone/app que los datos: protegen de errores (restaurar mal,
//   un fallo de la app), pero NO de que iOS borre la app o sus datos.
// - Lo que protege de verdad es EXPORTAR el archivo y guardarlo fuera (OneDrive/Archivos), y la nube (Supabase, desde v19).
// - Restaurar es estricto (desde v31): una copia incompleta o con datos que no cuadran se rechaza ANTES de borrar nada.
import { Dexie } from './lib.js';
import { db, getSetting, setSetting, exportAll, importAll } from './db.js';
import { todayStr } from './nutri.js';
import { permitirBorradoMasivo, retirarBorradoMasivo } from './nube.js';

// Base de datos aparte para las copias internas
const respaldos = new Dexie('nutristock-respaldos');
respaldos.version(1).stores({ copias: '++id, fecha' });
const MAX_INTERNAS = 7;

const TABLAS = ['foods', 'lots', 'basicos', 'shopping', 'plans', 'logs', 'weights', 'settings', 'workouts', 'marcas', 'ejercicios', 'whoop', 'porciones', 'medidas'];
// Tablas que añadió una versión posterior: una copia antigua puede no traerlas. Al restaurar quedan VACÍAS
// (la copia manda), y si ahora tienes datos en ellas se pide confirmación antes de borrarlos.
const OPCIONALES = ['whoop', 'porciones', 'medidas'];
const NOMBRE_OPCIONAL = { whoop: 'datos de Whoop', porciones: 'porciones preparadas', medidas: 'medidas corporales' };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_WHOOP = ['ciclo', 'recuperacion', 'sueno', 'entreno'];

// ---------- Whoop: ¿es una fila de verdad? ----------
// Desde v22 cada fila es { id: 'tipo:<id de Whoop>', tipo, fecha, d } y `d` es el registro TAL CUAL lo manda Whoop
// (js/whoop.js). Lo que la app necesita de cada tipo:
//   ciclo        d.id (número o texto) = lo que va tras 'ciclo:'; d.start (fecha y hora)
//   recuperacion d.cycle_id = lo que va tras 'recuperacion:' (su fecha es la de su ciclo)
//   sueno        d.id = lo que va tras 'sueno:'; d.start o d.end
//   entreno      d.id = lo que va tras 'entreno:'; d.start
// Opcional (Whoop solo lo manda cuando ya ha puntuado): `score`, `end`, `nap`, `sport_name`… Si vienen, con su tipo.
// Devuelve el motivo del problema, o null si la fila está bien.
const NUM_SCORE = ['strain', 'kilojoule', 'recovery_score', 'hrv_rmssd_milli', 'resting_heart_rate', 'sleep_performance_percentage'];
const idValido = x => (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.trim() !== '');
const horaValida = x => typeof x === 'string' && !Number.isNaN(Date.parse(x));
export function problemaWhoop(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return 'no es un registro';
  if (!TIPOS_WHOOP.includes(w.tipo)) return 'tipo desconocido';
  if (typeof w.id !== 'string' || !w.id.startsWith(w.tipo + ':')) return 'identificador que no es de su tipo';
  if (!FECHA.test(w.fecha || '') || Number.isNaN(Date.parse(w.fecha))) return 'sin fecha válida';
  const d = w.d;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'sin contenido';
  // El identificador de dentro tiene que ser el mismo que el de fuera (si no, es otro registro)
  const interno = w.tipo === 'recuperacion' ? d.cycle_id : d.id;
  if (!idValido(interno)) return 'contenido vacío o sin su identificador de Whoop';
  if (String(interno) !== w.id.slice(w.tipo.length + 1)) return 'el identificador no corresponde a su contenido';
  // Fechas y horas
  for (const k of ['start', 'end', 'created_at']) if (d[k] != null && !horaValida(d[k])) return `hora "${k}" no válida`;
  const hora = w.tipo === 'ciclo' || w.tipo === 'entreno' ? d.start : w.tipo === 'sueno' ? d.end || d.start : null;
  if (w.tipo !== 'recuperacion' && !hora) return 'sin hora de inicio';
  // La fecha guardada sale de esa hora (con la zona horaria): como mucho un día de diferencia
  if (hora && Math.abs(Date.parse(w.fecha) - Date.parse(hora.slice(0, 10))) > 864e5) return 'la fecha no corresponde a su hora';
  // Lo que se usa para calcular (si viene)
  if (d.score != null) {
    if (typeof d.score !== 'object' || Array.isArray(d.score)) return 'puntuación dañada';
    for (const k of NUM_SCORE) if (d.score[k] != null && !(typeof d.score[k] === 'number' && Number.isFinite(d.score[k]))) return `"${k}" no es un número`;
  }
  if (d.nap != null && typeof d.nap !== 'boolean') return 'dato de siesta dañado';
  return null;
}
const CLAVE = { foods: 'id', lots: 'id', basicos: 'id', shopping: 'id', plans: 'id', logs: 'id', weights: 'date', settings: 'key', workouts: 'id', marcas: 'id', ejercicios: 'id', whoop: 'id', porciones: 'id', medidas: 'id' };

// ---------- Exportar a archivo ----------
export async function exportarCopia() {
  const datos = await exportAll();
  const name = `nutristock-${todayStr()}.json`;
  const file = new File([JSON.stringify(datos)], name, { type: 'application/json' });
  let hecho = false;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia NutriStock' }); hecho = true; }
    catch (e) { if (e?.name === 'AbortError') return false; } // la cancelaste: no cuenta como copia
  }
  if (!hecho) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    hecho = true;
  }
  // Solo apuntamos la fecha cuando la copia se ha entregado (compartida o descargada)
  await setSetting('ultimaCopia', { fecha: new Date().toISOString(), registros: datos.logs.length });
  return true;
}

// ¿Toca recordar hacer copia? Si nunca se hizo, o hace más de 7 días y hay registros nuevos desde entonces
export async function estadoCopia() {
  const ultima = await getSetting('ultimaCopia', null);
  const registros = await db.logs.count();
  const dias = ultima ? Math.floor((Date.now() - new Date(ultima.fecha)) / 864e5) : null;
  const recordar = registros > 0 && (!ultima || (dias >= 7 && registros !== ultima.registros));
  return { ultima, dias, recordar };
}

// ---------- Copias internas automáticas ----------
export async function copiaInterna(motivo = 'diaria') {
  const datos = await exportAll();
  await respaldos.copias.add({ fecha: new Date().toISOString(), motivo, registros: datos.logs.length, datos });
  const todas = await respaldos.copias.orderBy('fecha').toArray();
  for (const c of todas.slice(0, Math.max(0, todas.length - MAX_INTERNAS))) await respaldos.copias.delete(c.id);
}

// Una al día, al abrir la app
export async function copiaDiaria() {
  try {
    const ultima = await respaldos.copias.orderBy('fecha').last();
    if (!ultima || ultima.fecha.slice(0, 10) !== new Date().toISOString().slice(0, 10)) await copiaInterna('diaria');
  } catch (e) { console.error('Copia interna', e); }
}

export const listarInternas = () => respaldos.copias.orderBy('fecha').reverse().toArray();
export const leerInterna = id => respaldos.copias.get(id);

// ---------- Validar y restaurar ----------
// Comprueba el archivo ANTES de borrar nada. Devuelve un resumen, la lista de problemas (impiden restaurar)
// y avisos (no impiden, pero conviene saberlos).
export function validarCopia(d) {
  const errores = [], avisos = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, errores: ['El archivo no se puede leer como copia.'], avisos };
  if (d.app !== 'nutristock') errores.push('No es una copia de NutriStock.');
  if (d.version !== 1) errores.push('La copia es de una versión de la app que no se reconoce.');
  for (const t of TABLAS) {
    if (d[t] === undefined) { if (!OPCIONALES.includes(t)) errores.push(`Le falta una parte entera ("${t}"): la copia está incompleta.`); }
    else if (!Array.isArray(d[t])) errores.push(`La parte "${t}" está dañada.`);
  }
  // Solo miramos dentro de las partes que son listas (si una está rota, ya se ha avisado arriba)
  const lista = t => (Array.isArray(d[t]) ? d[t] : []);
  for (const t of TABLAS) {
    const k = CLAVE[t];
    const filas = lista(t);
    if (filas.some(f => !f || typeof f !== 'object' || f[k] == null || f[k] === '')) errores.push(`Hay datos sin identificador en "${t}".`);
    const ids = filas.map(f => f?.[k]);
    if (new Set(ids).size !== ids.length) errores.push(`Hay datos repetidos en "${t}".`);
  }
  if (!lista('foods').length) errores.push('No tiene alimentos (la copia parece vacía o incompleta).');
  if (lista('foods').some(f => f && !f.name)) errores.push('Hay productos sin nombre.');
  if (lista('logs').some(l => l && (!/^\d{4}-\d{2}-\d{2}$/.test(l.date || '') || !l.n))) errores.push('Hay registros de comida dañados.');
  if (lista('weights').some(w => w && typeof w.kg !== 'number')) errores.push('Hay pesos dañados.');
  // Referencias entre partes
  const foodIds = new Set(lista('foods').map(f => f?.id));
  const sinProducto = lista('lots').filter(l => l && !foodIds.has(l.foodId)).length;
  if (sinProducto) avisos.push(`${sinProducto} envases de la despensa son de productos que no están en la copia (no se verán).`);
  const planActivo = lista('settings').find(x => x?.key === 'planActivo')?.value;
  if (planActivo && !lista('plans').some(pl => pl?.id === planActivo)) avisos.push('El plan activo no está en la copia: tendrás que volver a elegir o cargar tu plan.');
  const logsHuerfanos = lista('logs').filter(l => l?.foodId && !foodIds.has(l.foodId)).length;
  if (logsHuerfanos) avisos.push(`${logsHuerfanos} registros de comida son de productos que ya no están en tu biblioteca (se conservan con sus calorías).`);
  // Porciones preparadas (V3): de un táper que esté en la copia, con fecha, comida y gramos válidos
  const porcionMala = lista('porciones').filter(p => p && (!foodIds.has(p.foodId) || !FECHA.test(p.date || '') || !p.mealId || !(typeof p.g === 'number' && p.g > 0))).length;
  if (porcionMala) errores.push(`Hay ${porcionMala} porciones preparadas dañadas (sin táper, sin fecha o sin gramos).`);
  // Whoop: cada fila tiene que ser un registro completo y coherente (ver problemaWhoop). Una sola mala rechaza
  // la copia entera: no se restaura a medias ni se quitan filas en silencio.
  const whoopMalos = lista('whoop').map(w => [w?.id, problemaWhoop(w)]).filter(([, m]) => m);
  if (whoopMalos.length) errores.push(`Hay ${whoopMalos.length} datos de Whoop dañados (p. ej. ${String(whoopMalos[0][0] ?? 'sin id')}: ${whoopMalos[0][1]}).`);
  // Medidas corporales (V3): fecha, tipo y un valor positivo
  const medidaMala = lista('medidas').filter(m => m && (!FECHA.test(m.fecha || '') || !m.tipo || !(typeof m.valor === 'number' && m.valor > 0))).length;
  if (medidaMala) errores.push(`Hay ${medidaMala} medidas corporales dañadas (sin fecha, tipo o valor).`);
  // Partes que la copia no trae (es de una versión anterior): al restaurar se quedarán vacías
  const faltanTablas = OPCIONALES.filter(t => d[t] === undefined);
  if (faltanTablas.length) avisos.push(`Es una copia de una versión anterior: no trae ${faltanTablas.map(t => NOMBRE_OPCIONAL[t]).join(', ')}. Al restaurar, eso quedará vacío, como en la copia.`);
  const resumen = {
    fecha: typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 10) : '¿?',
    registros: lista('logs').length,
    productos: lista('foods').filter(f => f && f.source !== 'base').length,
    despensa: lista('lots').filter(l => l && l.g > 0).length,
    pesos: lista('weights').length,
    entrenos: lista('workouts').length,
    planes: lista('plans').length,
  };
  return { ok: errores.length === 0, errores, avisos, resumen, faltanTablas };
}

// Lo que tienes AHORA y se borrará porque la copia no lo trae (p. ej. medidas al restaurar una copia de antes de V3)
export async function seBorranAlRestaurar(d) {
  const r = [];
  for (const t of OPCIONALES) {
    if (d?.[t] !== undefined) continue;
    const n = await db[t].count();
    if (n) r.push({ tabla: t, n, nombre: NOMBRE_OPCIONAL[t] });
  }
  return r;
}

// Restaurar: valida, pide confirmación si se borra algo que la copia no trae, guarda antes una copia interna
// de lo que hay ahora ("antes de restaurar", para poder volver atrás) y reemplaza todo de una vez.
export async function restaurarCopia(d, { confirmarBorrado = false } = {}) {
  const v = validarCopia(d);
  if (!v.ok) throw new Error('No se ha cambiado nada. ' + v.errores.join(' '));
  const borra = await seBorranAlRestaurar(d);
  if (borra.length && !confirmarBorrado) {
    throw new Error(`No se ha cambiado nada. Esta copia no trae ${borra.map(b => `${b.nombre} (tienes ${b.n})`).join(', ')}: confirma que quieres borrarlos.`);
  }
  await copiaInterna('antes de restaurar'); // si no se puede guardar, no se sigue
  // Lo que desaparezca al restaurar es a propósito: la nube también debe quitarlo. Se marca antes y después
  // (por si una sincronización en marcha gasta el permiso a mitad). Si la restauración falla, se retira:
  // los datos no han cambiado y la nube no debe borrar nada.
  permitirBorradoMasivo();
  try { await importAll(d); }
  catch (e) { retirarBorradoMasivo(); throw new Error('No se ha cambiado nada: ' + (e.message || e)); }
  permitirBorradoMasivo();
  return v.resumen;
}
