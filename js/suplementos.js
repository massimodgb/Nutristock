// Suplementos: tu lista (magnesio, omega 3, electrolitos, creatina…) y lo que tomaste cada día.
// Se guarda en ajustes: 'suplementos' = la lista, 'supl:FECHA' = { id: hora en que lo marcaste }.
import { getSetting, setSetting, db } from './db.js';

export const SUPL_INICIALES = [
  { id: 'creatina', nombre: 'Creatina', dosis: '7 g' },
  { id: 'magnesio', nombre: 'Magnesio', dosis: '' },
  { id: 'omega-3', nombre: 'Omega 3', dosis: '' },
  { id: 'electrolitos', nombre: 'Electrolitos', dosis: '' },
];

export const listaSupl = () => getSetting('suplementos', SUPL_INICIALES);
export const guardarListaSupl = lista => setSetting('suplementos', lista);
export const tomadosDia = fecha => getSetting('supl:' + fecha, {});

export async function marcarSupl(fecha, id, tomado) {
  const t = { ...(await tomadosDia(fecha)) };
  if (tomado) t[id] = Date.now(); else delete t[id];
  await setSetting('supl:' + fecha, t);
}

// Para informes: { fecha: { id: hora } } entre dos fechas
export async function tomadosEntre(desde, hasta) {
  const filas = await db.settings.where('key').between('supl:' + desde, 'supl:' + hasta, true, true).toArray();
  return Object.fromEntries(filas.map(f => [f.key.slice(5), f.value || {}]));
}

export const idSupl = nombre => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'supl-' + Date.now();
