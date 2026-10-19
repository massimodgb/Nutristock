// Informes para la nutricionista y la entrenadora: ver / guardar como PDF / compartir, y datos para Excel (CSV).
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getSetting, setSetting, getPrefs, activePlan } from '../db.js';
import { sumN, mealBlocks, blockFoods, visibleFood, planRef, fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Seg, Icon, toast } from '../ui.js';
import { calcularBalance, fraseCambio } from '../balance.js';
import { leer } from './entreno.js';
import { textoFormato } from '../entreno/parser.js';
import { mejorRM, nombreRM } from '../entreno/rm.js';
import { textoTiempoResultado } from '../tiempo.js';
import { BENCHMARKS } from '../entreno/datos.js';
import { resumenWhoop } from '../whoop.js';
import { listaSupl, tomadosEntre, cantTomada, textoCant, textoDosis, aporteDia, aporteMedio, aporteSupl, cantHabitual, textoAporte, tieneDatos, NUTR_SUPL, SUPL_EXTRA } from '../suplementos.js';
import { MICROS, microsMedios } from '../data/micros.js';
import { tiposMedida, sesionesDe, mediasSemanales, resumenPeso } from '../medidas.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = (x, d = 0) => fmt(x || 0, d);
const COMIDA_NOMBRE = (plan, id) => (id === 'extra' ? 'Fuera del plan' : id === 'supl' ? 'Suplementos' : plan?.comidas.find(m => m.id === id)?.nombre || id);

// ---------- Reunir todos los datos del periodo ----------
export async function reunir(desde, hasta) {
  const [logs, pesosTodos, plan, foods, prefs, perfil, workouts, marcas, aguas, whoopFilas, supl, suplTomados] = await Promise.all([
    db.logs.where('date').between(desde, hasta, true, true).toArray(),
    db.weights.toArray(),
    activePlan(),
    db.foods.toArray(),
    getPrefs(),
    getSetting('perfil', null),
    db.workouts.where('date').between(desde, hasta, true, true).toArray(),
    db.marcas.toArray(),
    db.settings.where('key').between('agua:' + desde, 'agua:' + hasta, true, true).toArray(),
    db.whoop.where('fecha').between(desde, hasta, true, true).toArray(),
    listaSupl(),
    tomadosEntre(desde, hasta),
  ]);
  const [medidasTodas, tipos] = await Promise.all([db.medidas.toArray(), tiposMedida()]);
  // Whoop por día (si está conectado)
  const porFechaW = {};
  for (const f of whoopFilas) (porFechaW[f.fecha] ||= []).push(f);
  const whoop = Object.fromEntries(Object.entries(porFechaW).map(([f, fs]) => [f, resumenWhoop(fs)]));
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const ref = plan ? planRef(plan, byId, prefs) : null;
  const agua = Object.fromEntries(aguas.map(a => [a.key.slice(5), a.value]));
  const pesos = Object.fromEntries(pesosTodos.map(w => [w.date, w.kg]));
  const fechas = [];
  for (let d = desde; d <= hasta; d = addDays(d, 1)) fechas.push(d);

  const dias = fechas.map(date => {
    const dl = logs.filter(l => l.date === date);
    let total = 0, hechos = 0;
    if (plan) for (const m of plan.comidas) {
      const opt = dl.find(l => l.mealId === m.id && l.optionId)?.optionId;
      for (const b of mealBlocks(m, opt)) {
        if (!blockFoods(b, plan).some(x => visibleFood(byId[x.id], prefs))) continue;
        total++;
        if (dl.some(l => l.mealId === m.id && l.blockId === b.id)) hechos++;
      }
    }
    const ws = workouts.filter(w => w.date === date);
    const rpes = ws.flatMap(w => Object.values(w.resultados || {}).map(r => r.rpe).filter(Boolean));
    return {
      date, n: sumN(dl.map(l => l.n)), registros: dl.length,
      fuera: sumN(dl.filter(l => l.mealId === 'extra').map(l => l.n)).kcal,
      cumplimiento: dl.length && total ? hechos / total : null,
      agua: agua[date] || 0, peso: pesos[date] ?? null,
      entreno: ws.length > 0, rpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
      w: whoop[date] || null,
      supl: supl.filter(x => suplTomados[date]?.[x.id]).map(x => x.nombre + (x.unidad ? ` (${textoCant(cantTomada(x, suplTomados[date][x.id]), x.unidad)})` : '')),
      suplN: aporteDia(supl, suplTomados[date]),
    };
  });
  const conDatos = dias.filter(d => d.registros);
  const media = f => (conDatos.length ? conDatos.reduce((s, d) => s + f(d), 0) / conDatos.length : 0);
  const medias = Object.fromEntries(['kcal', 'prot', 'carb', 'fat', 'fib', 'sug', 'sat', 'salt'].map(k => [k, media(d => d.n[k])]));
  medias.cumplimiento = media(d => d.cumplimiento || 0);
  medias.agua = media(d => d.agua);

  // Por comida: kcal media y hora habitual de registro
  const porComida = {};
  for (const l of logs) {
    const c = porComida[l.mealId] ||= { kcal: 0, prot: 0, dias: new Set(), horas: [] };
    c.kcal += l.n.kcal || 0; c.prot += l.n.prot || 0; c.dias.add(l.date);
    if (l.ts > 1e12) c.horas.push(new Date(l.ts).getHours() + new Date(l.ts).getMinutes() / 60);
  }
  // Alimentos más frecuentes
  const frec = {};
  for (const l of logs.filter(l => l.foodId)) {
    const k = l.name.split(' · ')[0];
    const f = frec[k] ||= { veces: 0, g: 0 };
    f.veces++; f.g += l.g || 0;
  }
  const masFrecuentes = Object.entries(frec).sort((a, b) => b[1].veces - a[1].veces).slice(0, 15);
  const balance = calcularBalance({ perfil, plan: ref, weights: pesosTodos, logs: await db.logs.where('date').aboveOrEqual(addDays(hasta, -27)).toArray() });
  const pesosPeriodo = pesosTodos.filter(w => w.date >= desde && w.date <= hasta).sort((a, b) => a.date.localeCompare(b.date));
  // Medias de Whoop (los días que hay dato)
  const mediaW = (k, soloCompletos) => {
    const v = dias.map(d => d.w).filter(w => w && w[k] != null && (!soloCompletos || !w.enCurso)).map(w => w[k]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const whoopMedias = { rec: mediaW('recuperacion'), horas: mediaW('horas'), sueno: mediaW('sueno'), strain: mediaW('strain'), kcal: mediaW('kcal', true), hrv: mediaW('hrv'), fc: mediaW('fcReposo'), dias: dias.filter(d => d.w?.recuperacion != null).length };
  const suplResumen = supl.map(x => ({ ...x, dias: dias.filter(d => suplTomados[d.date]?.[x.id]).length }));
  const micros = microsMedios(logs, byId);
  micros.supl = aporteMedio(supl, suplTomados, Object.keys(micros.porDia));
  // Peso y medidas: lo del periodo y el periodo anterior de la misma duración (para ver la variación)
  const largo = Math.round((new Date(hasta) - new Date(desde)) / 864e5) + 1;
  const prevDesde = addDays(desde, -largo), prevHasta = addDays(desde, -1);
  const mediaKg = ws => (ws.length ? ws.reduce((a, w) => a + w.kg, 0) / ws.length : null);
  const pesosPrev = pesosTodos.filter(w => w.date >= prevDesde && w.date <= prevHasta);
  const cuerpo = {
    resumen: resumenPeso(pesosTodos.filter(w => w.date <= hasta), hasta, perfil?.objetivo ?? null),
    semanas: mediasSemanales(pesosPeriodo, 1),
    media: mediaKg(pesosPeriodo), mediaPrev: mediaKg(pesosPrev), nPrev: pesosPrev.length,
    medidas: tipos.map(t => {
      const ses = sesionesDe(medidasTodas, t.id);
      const enPeriodo = ses.filter(x => x.fecha >= desde && x.fecha <= hasta);
      const antes = [...ses].reverse().find(x => x.fecha < desde && x.rep);
      return { t, sesiones: enPeriodo, antes };
    }).filter(m => m.sesiones.length || m.antes),
  };
  return { desde, hasta, logs, dias, conDatos, medias, ref, plan, byId, porComida, masFrecuentes, balance, pesosPeriodo, workouts, marcas, perfil, whoopMedias, suplResumen, micros, cuerpo };
}

// ---------- Informe para la nutricionista ----------
// Partes del informe de la nutricionista (se pueden quitar o poner según lo que le resulte útil)
export const SECCIONES_NUTRI = [
  ['adherencia', 'Adherencia al plan'], ['resumen', 'Resumen de calorías y macros'], ['peso', 'Peso y tendencia'], ['medidas', 'Medidas (cintura, cadera…)'],
  ['micros', 'Vitaminas y minerales'], ['whoop', 'Whoop'], ['suplementos', 'Suplementos'], ['diaADia', 'Día a día'],
  ['porComida', 'Por comida'], ['frecuentes', 'Alimentos más frecuentes'], ['fuera', 'Fuera del plan'], ['registro', 'Registro completo'],
];

// Gráfica sencilla en SVG para el informe (se ve en el PDF y en cualquier navegador)
function svgLinea(puntos, { unidad = '', sueltos = [] } = {}) {
  const todos = [...puntos, ...sueltos];
  if (todos.length < 2) return '';
  const W = 520, H = 150, P = 22;
  const ts = todos.map(p => new Date(p.f).getTime()), vs = todos.map(p => p.v);
  const t0 = Math.min(...ts), t1 = Math.max(...ts), min = Math.min(...vs) - 0.3, max = Math.max(...vs) + 0.3;
  const x = f => P + (W - 2 * P) * ((new Date(f).getTime() - t0) / Math.max(864e5, t1 - t0));
  const y = v => P + (H - 2 * P) * (1 - (v - min) / Math.max(0.1, max - min));
  const linea = puntos.length > 1 ? `<path d="${puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.f).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="#1f9d63" stroke-width="2"/>` : '';
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="${y(max) + 10}" font-size="10" fill="#666">${n1(max, 1)} ${unidad}</text><text x="2" y="${y(min) - 3}" font-size="10" fill="#666">${n1(min, 1)} ${unidad}</text>
    ${sueltos.map(p => `<circle cx="${x(p.f).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="none" stroke="#999"/>`).join('')}
    ${linea}${puntos.map(p => `<circle cx="${x(p.f).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="#2f6fd8"><title>${p.f}: ${n1(p.v, 1)}</title></circle>`).join('')}
    ${puntos.map(p => `<text x="${x(p.f).toFixed(1)}" y="${H - 4}" font-size="9" fill="#666" text-anchor="middle">${fmtDate(p.f, { day: 'numeric', month: 'short' })}</text>`).join('')}
  </svg>`;
}
const signo = (v, dec = 1) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${n1(Math.abs(v), dec)}`);

function htmlPeso(D) {
  const c = D.cuerpo, r = c.resumen, ps = D.pesosPeriodo;
  if (!ps.length) return '<h2>Peso</h2><p>Sin pesajes en el periodo.</p>';
  const variacion = c.media != null && c.mediaPrev != null ? `${signo(c.media - c.mediaPrev)} kg frente al periodo anterior (media ${n1(c.mediaPrev, 1)} kg, ${c.nPrev} pesajes)` : 'Sin pesajes suficientes en el periodo anterior para comparar.';
  return `<h2>Peso</h2>
  <p>Pesajes: <b>${ps.length}</b> (del ${fmtDate(ps[0].date)} al ${fmtDate(ps.at(-1).date)}). Media del periodo: <b>${n1(c.media, 1)} kg</b>; ${variacion}.<br>
  ${r.tendencia != null ? `Tendencia de las últimas 4 semanas: <b>${signo(r.tendencia, 2)} kg/semana</b>${r.objetivo != null ? ` (objetivo indicado: ${signo(r.objetivo, 2)} kg/semana)` : ''}.` : 'Aún no hay pesajes suficientes (2 semanas) para calcular una tendencia fiable.'}
  ${r.cambioSemana != null ? `<br>Media de 7 días frente a la semana anterior: ${signo(r.cambioSemana)} kg.` : ''}${r.cambioMes != null ? ` Frente a hace un mes: ${signo(r.cambioMes)} kg.` : ''}</p>
  ${c.semanas.length > 1 ? `<p class="nota">Media de cada semana (línea) y pesajes reales (círculos):</p>${svgLinea(c.semanas.map(x => ({ f: x.semana, v: x.media })), { unidad: 'kg', sueltos: ps.map(w => ({ f: w.date, v: w.kg })) })}` : ''}
  ${c.semanas.length ? `<table><tr><th>Semana</th><th>Media</th><th>Pesajes</th></tr>${c.semanas.map(x => `<tr><td>del ${fmtDate(x.semana, { day: 'numeric', month: 'short' })}</td><td>${n1(x.media, 1)} kg</td><td>${x.n}</td></tr>`).join('')}</table>` : ''}
  ${D.balance.gasto ? `<p>Gasto estimado: ${n1(D.balance.gasto)} kcal/día (${D.balance.fuenteGasto === 'real' ? 'calculado con sus datos de comida y peso' : 'fórmula Mifflin-St Jeor × actividad'}).${D.balance.gasto && D.balance.planKcal ? ` Con el plan medio: ${fraseCambio(D.balance.proyPlan)}; con lo que come de verdad: ${fraseCambio(D.balance.proyComido)}.` : ''}</p>` : ''}`;
}

function htmlMedidas(D) {
  const ms = D.cuerpo.medidas;
  if (!ms.length) return '<h2>Medidas</h2><p>Sin medidas corporales registradas.</p>';
  return `<h2>Medidas</h2>${ms.map(({ t, sesiones, antes }) => {
    const reps = sesiones.filter(x => x.rep);
    const ult = reps.at(-1);
    const cambio = ult && antes ? `${signo(ult.rep.valor - antes.rep.valor)} ${t.unidad} frente a la última medida anterior al periodo (${n1(antes.rep.valor, 1)} ${t.unidad}, ${fmtDate(antes.fecha)})` : '';
    return `<h3>${esc(t.nombre)}</h3>
    ${sesiones.length ? `<table><tr><th>Fecha</th><th>Medida elegida</th><th>Todas las tomas</th><th>Observaciones</th></tr>
      ${sesiones.map(x => `<tr><td>${fmtDate(x.fecha)}</td><td>${x.rep ? `<b>${n1(x.rep.valor, 1)} ${t.unidad}</b>` : 'sin elegir'}</td><td>${x.tomas.map(m => n1(m.valor, 1)).join(' · ')} ${t.unidad}</td><td>${esc(x.nota || '')}</td></tr>`).join('')}</table>` : '<p>Sin mediciones en el periodo.</p>'}
    ${cambio ? `<p>${cambio}.</p>` : ''}
    ${reps.length + (antes ? 1 : 0) > 1 ? svgLinea([...(antes ? [{ f: antes.fecha, v: antes.rep.valor }] : []), ...reps.map(x => ({ f: x.fecha, v: x.rep.valor }))], { unidad: t.unidad }) : ''}`;
  }).join('')}<p class="nota">Cuando hay varias tomas el mismo día, la "medida elegida" es la que marcó él como representativa (no es una media).</p>`;
}

function htmlAdherencia(D) {
  const { conDatos, dias, medias, ref } = D;
  if (conDatos.length < 3) return `<h2>Adherencia al plan</h2><p>Solo hay ${conDatos.length} ${conDatos.length === 1 ? 'día' : 'días'} con comida registrada: no es suficiente para valorar la adherencia.</p>`;
  const dif = (a, b) => (b ? `${signo(((a - b) / b) * 100, 0)} %` : '—');
  return `<h2>Adherencia al plan</h2>
  <p>Registró la comida <b>${conDatos.length} de ${dias.length} días</b>. Completó de media el <b>${n1(medias.cumplimiento * 100)} %</b> de los bloques del plan.
  ${ref ? `Calorías: ${dif(medias.kcal, ref.kcal)} frente al plan · proteína: ${dif(medias.prot, ref.prot)} · hidratos: ${dif(medias.carb, ref.carb)} · grasas: ${dif(medias.fat, ref.fat)}.` : ''}</p>`;
}

export function htmlNutricion(D, sec = {}) {
  const ver = k => sec[k] !== false;
  const { plan, ref, medias, dias, conDatos, logs, balance } = D;
  const fila = (t, v, o) => `<tr><td>${t}</td><td>${v}</td><td>${o ?? ''}</td></tr>`;
  const fuera = logs.filter(l => l.mealId === 'extra');
  const h = d => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`;
  return `
  <h1>Informe de alimentación</h1>
  <p><b>Massimo Di Giuseppe</b> · del ${fmtDate(D.desde, { day: 'numeric', month: 'long', year: 'numeric' })} al ${fmtDate(D.hasta, { day: 'numeric', month: 'long', year: 'numeric' })}<br>
  ${plan ? `Plan: ${esc(plan.nutricionista || '')} · desde ${fmtDate(plan.fecha, { day: 'numeric', month: 'long' })}${plan.editado ? ` (editado a mano el ${fmtDate(plan.editado, { day: 'numeric', month: 'short' })})` : ''}` : 'Sin plan cargado'}<br>
  Días con comida registrada: <b>${conDatos.length} de ${dias.length}</b>. Todo se pesa en cocido; las calorías se calculan sobre el equivalente en crudo.</p>

  ${ver('adherencia') ? htmlAdherencia(D) : ''}
  ${ver('resumen') ? `<h2>Resumen (media de los días registrados)</h2>
  <table><tr><th></th><th>Media diaria</th><th>Plan (media de opciones)</th></tr>
  ${fila('Calorías', `${n1(medias.kcal)} kcal`, ref ? `${n1(ref.kcal)} kcal` : '')}
  ${fila('Proteína', `${n1(medias.prot)} g`, ref ? `${n1(ref.prot)} g` : '')}
  ${fila('Carbohidratos', `${n1(medias.carb)} g`, ref ? `${n1(ref.carb)} g` : '')}
  ${fila('Grasas', `${n1(medias.fat)} g`, ref ? `${n1(ref.fat)} g` : '')}
  ${fila('Fibra', `${n1(medias.fib)} g`, ref ? `${n1(ref.fib)} g` : '')}
  ${fila('Azúcares', `${n1(medias.sug)} g`)}
  ${fila('Grasas saturadas', `${n1(medias.sat, 1)} g`)}
  ${fila('Sal', `${n1(medias.salt, 1)} g`)}
  ${fila('Agua', `${n1(medias.agua / 1000, 1)} L`)}
  ${fila('Cumplimiento del plan', `${n1(medias.cumplimiento * 100)} % de los bloques`)}
  ${fila('Fuera del plan', `${n1(fuera.reduce((s, l) => s + (l.n.kcal || 0), 0))} kcal en el periodo (${fuera.length} registros)`)}
  </table>` : ''}

  ${ver('peso') ? htmlPeso(D) : ''}
  ${ver('medidas') ? htmlMedidas(D) : ''}

  ${ver('micros') ? htmlMicros(D) : ''}
  ${ver('whoop') ? htmlWhoop(D, true) : ''}
  ${ver('suplementos') ? htmlSupl(D) : ''}

  ${ver('diaADia') ? `<h2>Día a día</h2>
  <table class="peq"><tr><th>Día</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Fibra</th><th>Sal</th><th>Agua</th><th>Peso</th><th>Plan</th><th>Fuera</th><th>Entreno</th>${D.whoopMedias.dias ? '<th>Recup.</th><th>Gasto Whoop</th>' : ''}</tr>
  ${dias.map(d => `<tr><td>${fmtDate(d.date)}</td><td>${d.registros ? n1(d.n.kcal) : '—'}</td><td>${d.registros ? n1(d.n.prot) : ''}</td><td>${d.registros ? n1(d.n.carb) : ''}</td><td>${d.registros ? n1(d.n.fat) : ''}</td><td>${d.registros ? n1(d.n.fib) : ''}</td><td>${d.registros ? n1(d.n.salt, 1) : ''}</td><td>${d.agua ? n1(d.agua / 1000, 1) + ' L' : ''}</td><td>${d.peso ? n1(d.peso, 1) : ''}</td><td>${d.cumplimiento != null ? n1(d.cumplimiento * 100) + '%' : ''}</td><td>${d.fuera ? n1(d.fuera) : ''}</td><td>${d.entreno ? 'Sí' + (d.rpe ? ` (RPE ${n1(d.rpe, 1)})` : '') : ''}</td>${D.whoopMedias.dias ? `<td>${d.w?.recuperacion != null ? n1(d.w.recuperacion) + '%' : ''}</td><td>${d.w?.kcal && !d.w.enCurso ? n1(d.w.kcal) : ''}</td>` : ''}</tr>`).join('')}
  </table>` : ''}

  ${ver('porComida') ? `<h2>Por comida</h2>
  <table><tr><th>Comida</th><th>Hora del plan</th><th>Hora media de registro</th><th>kcal media</th><th>Proteína media</th></tr>
  ${Object.entries(D.porComida).map(([id, c]) => {
    const m = plan?.comidas.find(x => x.id === id);
    const nd = c.dias.size || 1;
    return `<tr><td>${esc(COMIDA_NOMBRE(plan, id))}</td><td>${m?.hora || ''}</td><td>${c.horas.length ? h(c.horas.reduce((a, b) => a + b, 0) / c.horas.length) : ''}</td><td>${n1(c.kcal / nd)}</td><td>${n1(c.prot / nd)} g</td></tr>`;
  }).join('')}
  </table>` : ''}

  ${ver('frecuentes') ? `<h2>Alimentos más frecuentes</h2>
  <table><tr><th>Alimento</th><th>Veces</th><th>Cantidad media (cocido)</th></tr>
  ${D.masFrecuentes.map(([k, f]) => `<tr><td>${esc(k)}</td><td>${f.veces}</td><td>${n1(f.g / f.veces)} g</td></tr>`).join('')}
  </table>` : ''}

  ${ver('fuera') && fuera.length ? `<h2>Comidas fuera del plan</h2><table><tr><th>Día</th><th>Qué</th><th>kcal</th><th>P / C / G</th></tr>
  ${fuera.map(l => `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.name)}${l.aprox ? ' (aprox.)' : ''}</td><td>${n1(l.n.kcal)}</td><td>${n1(l.n.prot)} / ${n1(l.n.carb)} / ${n1(l.n.fat)}</td></tr>`).join('')}</table>` : ''}

  ${ver('registro') ? `<h2>Registro completo</h2>
  <table class="peq"><tr><th>Día</th><th>Comida</th><th>Alimento</th><th>Gramos</th><th>kcal</th><th>P</th><th>C</th><th>G</th></tr>
  ${[...D.logs].sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0)).map(l => `<tr><td>${fmtDate(l.date)}</td><td>${esc(COMIDA_NOMBRE(plan, l.mealId))}</td><td>${esc(l.name)}</td><td>${l.g ? n1(l.g) + (l.crudo ? ' (crudo)' : '') : ''}</td><td>${n1(l.n.kcal)}</td><td>${n1(l.n.prot)}</td><td>${n1(l.n.carb)}</td><td>${n1(l.n.fat)}</td></tr>`).join('')}
  </table>` : ''}
  <p class="nota">Generado con NutriStock el ${fmtDate(todayStr(), { day: 'numeric', month: 'long', year: 'numeric' })}. Valores aproximados (tablas BEDCA/USDA y etiquetas de los productos).</p>`;
}

// ---------- Informe para la entrenadora ----------
export function htmlEntreno(D) {
  const { workouts, marcas, dias, pesosPeriodo } = D;
  const sesiones = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  // Mejores marcas de fuerza por ejercicio
  const ids = [...new Set(marcas.filter(m => m.tipo === 'fuerza').map(m => m.ejercicio))];
  const rms = ids.map(id => {
    const mias = marcas.filter(m => m.ejercicio === id && m.tipo === 'fuerza');
    const porReps = {};
    for (const m of mias) if (!porReps[m.reps] || m.kg > porReps[m.reps].kg) porReps[m.reps] = m;
    return { nombre: nombreRM(id, marcas), rm: mejorRM(marcas, id), porReps: Object.values(porReps).sort((a, b) => a.reps - b.reps) };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const bench = BENCHMARKS.map(b => ({ b, mias: marcas.filter(m => m.ejercicio === b.id) })).filter(x => x.mias.length);
  const con = dias.filter(d => d.registros);
  return `
  <h1>Informe de entrenamiento</h1>
  <p><b>Massimo Di Giuseppe</b> · del ${fmtDate(D.desde, { day: 'numeric', month: 'long', year: 'numeric' })} al ${fmtDate(D.hasta, { day: 'numeric', month: 'long', year: 'numeric' })}<br>
  Sesiones registradas: <b>${sesiones.length}</b>.
  ${pesosPeriodo.length ? ` Peso corporal: ${n1(pesosPeriodo[0].kg, 1)} → ${n1(pesosPeriodo.at(-1).kg, 1)} kg.` : ''}
  ${con.length ? ` Nutrición media: ${n1(D.medias.kcal)} kcal, ${n1(D.medias.prot)} g de proteína y ${n1(D.medias.carb)} g de carbohidratos al día.` : ''}</p>

  ${htmlWhoop(D, false)}

  <h2>Sesiones</h2>
  ${sesiones.length === 0 ? '<p>No hay entrenos registrados en el periodo.</p>' : sesiones.map(w => {
    const p = leer(w);
    const r = w.resultados || {};
    const dia = dias.find(d => d.date === w.date);
    return `<div class="sesion"><h3>${fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      ${dia?.registros ? `<p class="nota">Ese día: ${n1(dia.n.kcal)} kcal · P ${n1(dia.n.prot)} g · C ${n1(dia.n.carb)} g</p>` : ''}
      ${dia?.w?.recuperacion != null ? `<p class="nota">Whoop: recuperación ${n1(dia.w.recuperacion)} %${dia.w.horas != null ? ` · durmió ${n1(dia.w.horas, 1)} h` : ''}${dia.w.strain != null ? ` · esfuerzo del día ${n1(dia.w.strain, 1)}` : ''}</p>` : ''}
      ${p.secciones.map((s, si) => {
        const rs = r[si] || {};
        const res = [rs.hecho ? '✓ hecho' : 'no marcado', (rs.tiempo || rs.tiempoS != null) && `tiempo ${esc(textoTiempoResultado(rs))}`, rs.porBloque && `bloques: ${esc(rs.porBloque)}`,
          rs.rondas && `${rs.rondas} rondas${rs.reps ? ' + ' + rs.reps : ''}`, rs.rpe && `RPE ${rs.rpe}`].filter(Boolean).join(' · ');
        const cargas = s.partes.flatMap((pa, pi) => pa.lineas.map((l, li) => {
          const k = `${pi}-${li}`;
          const sets = (rs.series?.[k] || (rs.pesos?.[k] ? [rs.pesos[k]] : null))?.filter(x => x && x.kg != null);
          return sets?.length && l.ejercicios?.[0] ? `${esc(nombreLinea(l))}: ${sets.map(textoSerie).join(', ')}` : null;
        })).filter(Boolean);
        return `<p><b>${esc(s.titulo)}</b>${s.formato ? ` (${esc(textoFormato(s.formato))})` : ''} — ${res}</p>
          ${cargas.length ? `<ul>${cargas.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}
          ${rs.notas ? `<p class="nota">Notas: ${esc(rs.notas)}</p>` : ''}`;
      }).join('')}
      <details><summary>Texto original del entreno</summary><pre>${esc(w.texto)}</pre></details></div>`;
  }).join('')}

  <h2>Marcas de fuerza</h2>
  ${rms.length ? `<table><tr><th>Ejercicio</th><th>1RM</th><th>Mejores marcas</th></tr>
  ${rms.map(x => `<tr><td>${esc(x.nombre)}</td><td>${x.rm ? `${x.rm.estimado ? '≈' : ''}${n1(x.rm.kg, 1)} kg` : '—'}</td><td>${x.porReps.map(m => `${m.reps}RM ${n1(m.kg, 1)} kg (${fmtDate(m.date, { day: 'numeric', month: 'short' })})`).join(' · ')}</td></tr>`).join('')}</table>` : '<p>Sin marcas registradas.</p>'}

  ${bench.length ? `<h2>Benchmarks</h2><table><tr><th>WOD</th><th>Resultados</th></tr>
  ${bench.map(({ b, mias }) => `<tr><td>${esc(b.name)}</td><td>${mias.sort((a, c) => a.date.localeCompare(c.date)).map(m => `${esc(m.resultado)} (${fmtDate(m.date, { day: 'numeric', month: 'short' })})`).join(' · ')}</td></tr>`).join('')}</table>` : ''}

  <h2>Día a día</h2>
  <table class="peq"><tr><th>Día</th><th>Entreno</th><th>RPE medio</th>${D.whoopMedias.dias ? '<th>Recup.</th><th>Sueño</th><th>Esfuerzo</th>' : ''}<th>Peso</th><th>kcal</th><th>Proteína</th><th>Carbohidratos</th></tr>
  ${dias.map(d => `<tr><td>${fmtDate(d.date)}</td><td>${d.entreno ? 'Sí' : ''}</td><td>${d.rpe ? n1(d.rpe, 1) : ''}</td>${D.whoopMedias.dias ? `<td>${d.w?.recuperacion != null ? n1(d.w.recuperacion) + '%' : ''}</td><td>${d.w?.horas != null ? n1(d.w.horas, 1) + ' h' : ''}</td><td>${d.w?.strain != null ? n1(d.w.strain, 1) : ''}</td>` : ''}<td>${d.peso ? n1(d.peso, 1) : ''}</td><td>${d.registros ? n1(d.n.kcal) : ''}</td><td>${d.registros ? n1(d.n.prot) + ' g' : ''}</td><td>${d.registros ? n1(d.n.carb) + ' g' : ''}</td></tr>`).join('')}
  </table>
  <p class="nota">Generado con NutriStock el ${fmtDate(todayStr(), { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`;
}

// Bloque de Whoop (para los dos informes)
function htmlWhoop(D, nutricion) {
  const W = D.whoopMedias;
  if (!W.dias) return '';
  const comido = D.medias.kcal;
  return `<h2>Recuperación y gasto (Whoop)</h2>
  <table><tr><th></th><th>Media del periodo</th></tr>
  ${W.rec != null ? `<tr><td>Recuperación</td><td>${n1(W.rec)} % (${W.dias} días con dato)</td></tr>` : ''}
  ${W.hrv != null ? `<tr><td>VFC / pulso en reposo</td><td>${n1(W.hrv)} ms / ${n1(W.fc)} ppm</td></tr>` : ''}
  ${W.horas != null ? `<tr><td>Sueño</td><td>${n1(W.horas, 1)} h${W.sueno != null ? ` (rendimiento del sueño ${n1(W.sueno)} %)` : ''}</td></tr>` : ''}
  ${W.strain != null ? `<tr><td>Esfuerzo (strain, 0-21)</td><td>${n1(W.strain, 1)}</td></tr>` : ''}
  ${W.kcal != null ? `<tr><td>Gasto total según Whoop</td><td>${n1(W.kcal)} kcal/día${nutricion && comido ? ` · come ${n1(comido)} kcal, ${comido < W.kcal ? 'déficit' : 'superávit'} de ${n1(Math.abs(W.kcal - comido))} kcal/día (estimación de Whoop)` : ''}</td></tr>` : ''}
  </table>`;
}

// Vitaminas y minerales (media de los días registrados): comida + suplementos
function htmlMicros(D) {
  const M = D.micros;
  if (!M?.dias) return '';
  const S = M.supl || {};
  const conSupl = NUTR_SUPL.some(m => S[m.k] > 0);
  const extras = SUPL_EXTRA.filter(m => S[m.k] > 0);
  return `<h2>Vitaminas y minerales (media diaria)</h2>
  <table><tr><th></th><th>Comida</th>${conSupl ? '<th>Suplementos</th><th>Total</th>' : ''}<th>Referencia EFSA (hombre adulto)</th><th>%</th></tr>
  ${MICROS.map(m => {
    const total = M.media[m.k] + (S[m.k] || 0);
    return `<tr><td>${m.name}</td><td>${n1(M.media[m.k], m.dec)} ${m.unit}</td>${conSupl ? `<td>${S[m.k] ? n1(S[m.k], m.dec) + ' ' + m.unit : '—'}</td><td>${n1(total, m.dec)} ${m.unit}</td>` : ''}<td>${n1(m.ref)} ${m.unit}</td><td>${n1(total / m.ref * 100)} %</td></tr>`;
  }).join('')}
  ${extras.map(m => `<tr><td>${m.name}</td><td>—</td><td>${n1(S[m.k], m.dec)} ${m.unit}</td><td>${n1(S[m.k], m.dec)} ${m.unit}</td><td></td><td></td></tr>`).join('')}
  </table>
  <p class="nota">Comida: calculado con el ${n1(M.cobertura * 100)} % de las calorías registradas (los platos aproximados fuera del plan no traen estos datos). Valores de tablas USDA/BEDCA o de la etiqueta.${conSupl ? ' Suplementos: según su etiqueta y lo que marcó cada día.' : ''}</p>`;
}

// Suplementos: marca, cuánto toma, qué aporta y cuántos días lo tomó
function htmlSupl(D) {
  if (!D.suplResumen.length) return '';
  return `<h2>Suplementos</h2>
  <table><tr><th>Suplemento</th><th>Marca</th><th>Toma habitual</th><th>Aporta al día</th><th>Días tomado</th></tr>
  ${D.suplResumen.map(x => `<tr><td>${esc(x.nombre)}${x.notas ? `<br><small>${esc(x.notas)}</small>` : ''}</td><td>${esc(x.marca || '')}</td><td>${esc(textoDosis(x))}</td><td>${tieneDatos(x) ? esc(textoAporte(aporteSupl(x, cantHabitual(x)))) : '—'}</td><td>${x.dias} de ${D.dias.length}</td></tr>`).join('')}
  </table>`;
}

// ---------- CSV para Excel ----------
// Excel en español: separador ";" y coma decimal. El BOM hace que lea bien las tildes.
const celda = v => {
  if (v == null) return '';
  if (typeof v === 'number') return String(Math.round(v * 10) / 10).replace('.', ',');
  const t = String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (cab, filas) => '﻿' + [cab, ...filas].map(f => f.map(celda).join(';')).join('\r\n');

function csvNutricion(D) {
  const { plan, dias, logs } = D;
  return [
    ['nutricion_por_dia.csv', csv(['fecha', 'kcal', 'proteina_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'azucares_g', 'saturadas_g', 'sal_g', 'agua_ml', 'peso_kg', 'fuera_plan_kcal', 'cumplimiento_plan_pct', 'entreno', 'rpe_medio', 'recuperacion_pct', 'sueno_h', 'esfuerzo', 'gasto_whoop_kcal', 'suplementos', ...MICROS.map(m => `${m.name.toLowerCase().replace(/ /g, '_')}_${m.unit === 'µg' ? 'ug' : m.unit}`), ...NUTR_SUPL.map(m => `${m.name.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '_').replace(/_$/, '')}_suplementos_${m.unit === 'µg' ? 'ug' : m.unit}`)],
      dias.map(d => [d.date, d.registros ? d.n.kcal : null, d.registros ? d.n.prot : null, d.registros ? d.n.carb : null, d.registros ? d.n.fat : null, d.registros ? d.n.fib : null, d.registros ? d.n.sug : null, d.registros ? d.n.sat : null, d.registros ? d.n.salt : null, d.agua || null, d.peso, d.fuera || null, d.cumplimiento != null ? d.cumplimiento * 100 : null, d.entreno ? 'si' : '', d.rpe, d.w?.recuperacion ?? null, d.w?.horas ?? null, d.w?.strain ?? null, d.w?.kcal && !d.w.enCurso ? d.w.kcal : null, d.supl.join(', '), ...MICROS.map(m => D.micros.porDia[d.date]?.[m.k] ?? null), ...NUTR_SUPL.map(m => d.suplN[m.k] ?? null)]))],
    ['nutricion_registros.csv', csv(['fecha', 'hora', 'comida', 'alimento', 'gramos', 'pesado_en', 'gramos_crudo', 'kcal', 'proteina_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'azucares_g', 'saturadas_g', 'sal_g', 'aproximado'],
      [...logs].sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0)).map(l => [l.date, l.ts > 1e12 ? new Date(l.ts).toTimeString().slice(0, 5) : '', COMIDA_NOMBRE(plan, l.mealId), l.name, l.g, l.g ? (l.crudo ? 'crudo' : 'cocido') : '', l.rawG, l.n.kcal, l.n.prot, l.n.carb, l.n.fat, l.n.fib, l.n.sug, l.n.sat, l.n.salt, l.aprox ? 'si' : '']))],
    ['peso.csv', csv(['fecha', 'peso_kg'], D.pesosPeriodo.map(w => [w.date, w.kg]))],
    ['medidas.csv', csv(['fecha', 'medida', 'valor', 'unidad', 'elegida', 'observaciones'], D.cuerpo.medidas.flatMap(({ t, sesiones }) => sesiones.flatMap(x => x.tomas.map(m => [x.fecha, t.nombre, m.valor, t.unidad, m.representativa ? 'si' : '', x.nota || '']))))],
  ];
}

// Nombre de la línea en el informe (un complejo se escribe con sus movimientos)
const nombreLinea = l => (l.tipo === 'complejo' && l.movimientos?.length ? 'Complejo ' + l.movimientos.map(m => `${m.reps || ''} ${m.nombre}`.trim()).join(' + ') : l.ejercicios?.[0] || l.texto);
// "52,5 kg × 3", "60 kg × 2 (incompleta; plan 57,5)", "62,5 kg × 3 (fallida)" + nota
function textoSerie(x) {
  const extra = [x.estado && x.estado !== 'hecha' ? x.estado : null, x.plan?.kg != null && Math.abs(x.plan.kg - x.kg) >= 0.05 ? `plan ${n1(x.plan.kg, 1)}` : null].filter(Boolean);
  return `${n1(x.kg, 1)} kg${x.reps ? ' × ' + x.reps : ''}${extra.length ? ` (${extra.join('; ')})` : ''}${x.nota ? ` — ${esc(x.nota)}` : ''}`;
}

function csvEntreno(D) {
  const ses = [], series = [];
  for (const w of [...D.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = leer(w), r = w.resultados || {};
    p.secciones.forEach((s, si) => {
      const rs = r[si] || {};
      ses.push([w.date, s.titulo, s.formato ? textoFormato(s.formato) : '', rs.hecho ? 'si' : '', textoTiempoResultado(rs), rs.porBloque, rs.rondas, rs.reps, rs.rpe, rs.notas]);
      s.partes.forEach((pa, pi) => pa.lineas.forEach((l, li) => {
        const k = `${pi}-${li}`;
        const sets = rs.series?.[k] || (rs.pesos?.[k] ? [rs.pesos[k]] : null);
        (sets || []).forEach((x, i) => x?.kg != null && series.push([w.date, s.titulo, nombreLinea(l), i + 1, x.kg, x.reps, x.estado || 'hecha', x.plan?.kg ?? '', x.plan?.pct ?? '', x.nota || '']));
      }));
    });
  }
  const marcas = D.marcas.filter(m => m.tipo === 'fuerza').map(m => [nombreRM(m.ejercicio, D.marcas), m.reps, m.kg, m.date]);
  const bench = D.marcas.filter(m => m.tipo === 'bench').map(m => [BENCHMARKS.find(b => b.id === m.ejercicio)?.name || m.ejercicio, m.resultado, m.date]);
  return [
    ['entreno_sesiones.csv', csv(['fecha', 'seccion', 'formato', 'hecho', 'tiempo', 'resultado_bloques', 'rondas', 'reps_extra', 'rpe', 'notas'], ses)],
    ['entreno_series_y_pesos.csv', csv(['fecha', 'seccion', 'ejercicio', 'serie', 'kg', 'reps', 'estado', 'kg_planificado', 'porcentaje', 'nota'], series)],
    ['marcas_fuerza.csv', csv(['ejercicio', 'repeticiones', 'kg', 'fecha'], marcas)],
    ['benchmarks.csv', csv(['wod', 'resultado', 'fecha'], bench)],
    ['peso.csv', csv(['fecha', 'peso_kg'], D.pesosPeriodo.map(w => [w.date, w.kg]))],
    ...(D.whoopMedias.dias ? [['whoop.csv', csv(['fecha', 'recuperacion_pct', 'vfc_ms', 'pulso_reposo', 'sueno_h', 'sueno_pct', 'esfuerzo', 'gasto_kcal', 'entrenos_whoop'],
      D.dias.filter(d => d.w).map(d => [d.date, d.w.recuperacion, d.w.hrv, d.w.fcReposo, d.w.horas, d.w.sueno, d.w.strain, d.w.enCurso ? null : d.w.kcal, d.w.entrenos.map(e => `${e.deporte || 'entreno'} ${Math.round((e.strain || 0) * 10) / 10}`).join(', ')]))]] : []),
  ];
}

// ---------- Compartir archivos ----------
async function compartir(archivos, titulo) {
  const files = archivos.map(([nombre, contenido, tipo]) => new File([contenido], nombre, { type: tipo || 'text/csv' }));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: titulo }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
  }
}

const ESTILO_INFORME = `.grafico{width:100%;max-width:560px;height:auto;display:block;margin:6px 0}body{font:14px -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:24px;line-height:1.4}
h1{font-size:22px;margin:0 0 6px}h2{font-size:17px;margin:22px 0 8px;border-bottom:2px solid #16a34a;padding-bottom:3px}h3{font-size:15px;margin:14px 0 4px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f2f2f2}table.peq{font-size:12px}.nota{color:#666;font-size:12px}pre{white-space:pre-wrap;font:12px monospace;background:#f6f6f6;padding:8px}
.sesion{border-left:3px solid #16a34a;padding-left:10px;margin:10px 0}`;

// ---------- Pantalla ----------
export function Informes({ go }) {
  const [para, setPara] = useState('nutri');
  const [dias, setDias] = useState(14);
  const [desde, setDesde] = useState(addDays(todayStr(), -13));
  const [hasta, setHasta] = useState(todayStr());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const secciones = useLive(() => getSetting('informeNutri', {}), []) || {};
  const alternar = async k => setSetting('informeNutri', { ...(await getSetting('informeNutri', {})), [k]: secciones[k] === false });

  const elegirDias = n => { setDias(n); setDesde(addDays(todayStr(), -(n - 1))); setHasta(todayStr()); };
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    reunir(desde, hasta).then(d => { if (vivo) { setDatos(d); setCargando(false); } });
    return () => { vivo = false; };
  }, [desde, hasta]);

  const cuerpo = datos ? (para === 'nutri' ? htmlNutricion(datos, secciones) : htmlEntreno(datos)) : '';
  const titulo = para === 'nutri' ? 'Informe de alimentación' : 'Informe de entrenamiento';
  const nombreBase = `${para === 'nutri' ? 'nutricion' : 'entreno'}_${desde}_a_${hasta}`;
  const htmlCompleto = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><style>${ESTILO_INFORME}</style></head><body>${cuerpo}</body></html>`;

  return html`
    <div class="page">
      <button class="link back no-print" onClick=${() => go('mas')}>‹ Más</button>
      <header class="top no-print"><h1>Informes</h1></header>
      <section class="card form no-print">
        <${Seg} value=${para} onChange=${setPara} options=${[{ value: 'nutri', label: 'Para la nutricionista' }, { value: 'entreno', label: 'Para la entrenadora' }]} />
        <div class="chips">${[7, 14, 30, 90].map(n => html`
          <button class=${'chip' + (dias === n ? ' on' : '')} onClick=${() => elegirDias(n)}>${n === 7 ? 'Semanal (7 días)' : `Últimos ${n} días`}</button>`)}</div>
        ${para === 'nutri' && html`
          <details class="incluir"><summary>Qué incluir en el informe</summary>
            <div class="chips wrap">${SECCIONES_NUTRI.map(([k, t]) => html`
              <button class=${'chip' + (secciones[k] !== false ? ' on' : '')} aria-pressed=${secciones[k] !== false} onClick=${() => alternar(k)}>${t}</button>`)}</div>
            <small class="muted">Se recuerda para la próxima vez. Cuando tu nutricionista te diga qué le sirve, quita lo demás.</small>
          </details>`}
        <div class="grid2">
          <label>Desde<input type="date" value=${desde} max=${hasta} onInput=${e => { setDias(null); setDesde(e.target.value); }} /></label>
          <label>Hasta<input type="date" value=${hasta} min=${desde} max=${todayStr()} onInput=${e => { setDias(null); setHasta(e.target.value); }} /></label>
        </div>
        <button class="btn" disabled=${!datos} onClick=${() => window.print()}><${Icon} name="plan" size=${18} /> Guardar como PDF / imprimir</button>
        <small class="muted">En el iPhone: se abre "Imprimir" → toca "Compartir" (arriba) → "Guardar en Archivos" o envíalo por WhatsApp o correo como PDF.</small>
        <button class="btn secondary" disabled=${!datos} onClick=${() => compartir([[nombreBase + '.html', htmlCompleto, 'text/html']], titulo)}>Compartir informe (se abre en cualquier navegador)</button>
        <button class="btn secondary" disabled=${!datos} onClick=${async () => { await compartir(para === 'nutri' ? csvNutricion(datos) : csvEntreno(datos), titulo + ' (Excel)'); toast('Listo ✓'); }}>
          Datos para Excel (${para === 'nutri' ? '4' : '5'} archivos CSV)</button>
      </section>
      ${cargando && html`<p class="muted no-print">Preparando…</p>`}
      ${datos && html`<article class="informe" dangerouslySetInnerHTML=${{ __html: cuerpo }}></article>`}
    </div>`;
}
