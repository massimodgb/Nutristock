// Balance energético: cuánto gastas, qué pasará con tu peso con el plan y qué haría falta para tu objetivo.
// Todo orientado al plan del nutricionista: la app no cambia el plan, te explica a dónde lleva.
import { sumN, addDays, todayStr } from './nutri.js';

export const KCAL_POR_KG = 7700; // ≈ calorías que equivalen a 1 kg de peso corporal

export const ACTIVIDAD = [
  { value: 1.375, label: 'Ligera', hint: '1-3 entrenos suaves por semana' },
  { value: 1.55, label: 'Moderada', hint: '3-5 entrenos por semana' },
  { value: 1.725, label: 'Alta', hint: 'CrossFit 5-6 días, trabajo sentado' },
  { value: 1.9, label: 'Muy alta', hint: 'Doble sesión o trabajo físico' },
];

export const OBJETIVOS = [
  { value: -0.5, label: 'Bajar 0,5 kg/sem' },
  { value: -0.25, label: 'Bajar 0,25 kg/sem' },
  { value: 0, label: 'Mantener' },
  { value: 0.25, label: 'Subir 0,25 kg/sem' },
];

// Gasto diario estimado con la fórmula de Mifflin-St Jeor × nivel de actividad
export function gastoFormula(perfil, kg) {
  if (!perfil?.altura || !perfil?.edad || !kg) return null;
  const base = 10 * kg + 6.25 * perfil.altura - 5 * perfil.edad + (perfil.sexo === 'm' ? -161 : 5);
  return base * (perfil.actividad || 1.725);
}

// Tendencia del peso en kg por semana (recta que mejor encaja con tus pesajes)
export function tendenciaPeso(weights) {
  if (weights.length < 3) return null;
  const t0 = new Date(weights[0].date).getTime();
  const pts = weights.map(w => [(new Date(w.date).getTime() - t0) / 864e5, w.kg]);
  const dias = pts[pts.length - 1][0];
  if (dias < 7) return null;
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const num = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return { kgSemana: (num / den) * 7, dias };
}

// Junta todo: gasto (fórmula y, si hay datos suficientes, el real), proyecciones y explicación
export function calcularBalance({ perfil, plan, weights, logs, dias = 21 }) {
  const hoy = todayStr(), desde = addDays(hoy, -(dias - 1));
  const pesos = weights.filter(w => w.date >= desde).sort((a, b) => a.date.localeCompare(b.date));
  const ultimos = weights.filter(w => w.date >= addDays(hoy, -6));
  const kg = ultimos.length ? ultimos.reduce((s, w) => s + w.kg, 0) / ultimos.length
    : weights.length ? [...weights].sort((a, b) => b.date.localeCompare(a.date))[0].kg : null;

  // Lo que comiste de verdad (solo días con registros: si un día no apuntas, no cuenta como 0)
  const porDia = {};
  for (const l of logs) if (l.date >= desde && l.date <= hoy) (porDia[l.date] ||= []).push(l);
  const diasReg = Object.values(porDia).map(ls => ({
    kcal: sumN(ls.map(l => l.n)).kcal,
    fuera: sumN(ls.filter(l => l.mealId === 'extra').map(l => l.n)).kcal,
  })).filter(d => d.kcal > 300);
  const comido = diasReg.length ? diasReg.reduce((s, d) => s + d.kcal, 0) / diasReg.length : null;
  const fuera = diasReg.length ? diasReg.reduce((s, d) => s + d.fuera, 0) / diasReg.length : 0;

  const formula = gastoFormula(perfil, kg);
  const tend = tendenciaPeso(pesos);
  // Gasto real = lo que comes − lo que cambió tu peso (si subes, comiste por encima de tu gasto)
  const real = comido && tend && diasReg.length >= 10 && tend.dias >= 10
    ? comido - (tend.kgSemana * KCAL_POR_KG) / 7 : null;
  const gasto = real || formula;

  const planKcal = plan?.kcal || null;
  const proy = kcal => (gasto && kcal ? ((kcal - gasto) * 7) / KCAL_POR_KG : null);
  const ritmo = perfil?.objetivo ?? null;
  const kcalObjetivo = gasto != null && ritmo != null ? gasto + (ritmo * KCAL_POR_KG) / 7 : null;

  return {
    kg, formula, real, gasto, fuenteGasto: real ? 'real' : formula ? 'formula' : null,
    comido, fuera, diasRegistrados: diasReg.length, tendencia: tend,
    planKcal, proyPlan: proy(planKcal), proyComido: proy(comido),
    ritmo, kcalObjetivo, difObjetivo: kcalObjetivo && planKcal ? kcalObjetivo - planKcal : null,
  };
}

// Frase corta: "subir ~0,2 kg por semana"
export function fraseCambio(kgSem) {
  if (kgSem == null) return '';
  const a = Math.abs(kgSem);
  if (a < 0.08) return 'mantener tu peso';
  const n = a.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${kgSem > 0 ? 'subir' : 'bajar'} unos ${n} kg por semana`;
}
