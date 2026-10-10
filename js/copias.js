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
import { permitirBorradoMasivo } from './nube.js';

// Base de datos aparte para las copias internas
const respaldos = new Dexie('nutristock-respaldos');
respaldos.version(1).stores({ copias: '++id, fecha' });
const MAX_INTERNAS = 7;

const TABLAS = ['foods', 'lots', 'basicos', 'shopping', 'plans', 'logs', 'weights', 'settings', 'workouts', 'marcas', 'ejercicios', 'whoop'];
// Tablas que añadió una versión posterior: una copia antigua puede no traerlas (y entonces NO se tocan al restaurar)
const OPCIONALES = ['whoop'];
const CLAVE = { foods: 'id', lots: 'id', basicos: 'id', shopping: 'id', plans: 'id', logs: 'id', weights: 'date', settings: 'key', workouts: 'id', marcas: 'id', ejercicios: 'id', whoop: 'id' };

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
  if (d.whoop === undefined) avisos.push('Es una copia anterior a Whoop: tus datos de Whoop actuales no se tocan.');
  const resumen = {
    fecha: typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 10) : '¿?',
    registros: lista('logs').length,
    productos: lista('foods').filter(f => f && f.source !== 'base').length,
    despensa: lista('lots').filter(l => l && l.g > 0).length,
    pesos: lista('weights').length,
    entrenos: lista('workouts').length,
    planes: lista('plans').length,
  };
  return { ok: errores.length === 0, errores, avisos, resumen };
}

// Restaurar: valida, guarda antes una copia interna de lo que hay ahora, y reemplaza todo de una vez
export async function restaurarCopia(d) {
  const v = validarCopia(d);
  if (!v.ok) throw new Error('No se ha cambiado nada. ' + v.errores.join(' '));
  await copiaInterna('antes de restaurar');
  permitirBorradoMasivo(); // lo que desaparezca al restaurar es a propósito: la nube también debe quitarlo
  await importAll(d);
  return v.resumen;
}
