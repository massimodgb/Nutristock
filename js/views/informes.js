// Informes para la nutricionista y la entrenadora: ver / guardar como PDF / compartir, y datos para Excel (CSV).
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getSetting, getPrefs, activePlan } from '../db.js';
import { sumN, mealBlocks, blockFoods, visibleFood, planRef, fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Seg, Icon, toast } from '../ui.js';
import { calcularBalance, fraseCambio } from '../balance.js';
import { leer } from './entreno.js';
import { textoFormato } from '../entreno/parser.js';
import { mejorRM, nombreRM } from '../entreno/rm.js';
import { BENCHMARKS } from '../entreno/datos.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = (x, d = 0) => fmt(x || 0, d);
const COMIDA_NOMBRE = (plan, id) => (id === 'extra' ? 'Fuera del plan' : plan?.comidas.find(m => m.id === id)?.nombre || id);

// ---------- Reunir todos los datos del periodo ----------
async function reunir(desde, hasta) {
  const [logs, pesosTodos, plan, foods, prefs, perfil, workouts, marcas, aguas] = await Promise.all([
    db.logs.where('date').between(desde, hasta, true, true).toArray(),
    db.weights.toArray(),
    activePlan(),
    db.foods.toArray(),
    getPrefs(),
    getSetting('perfil', null),
    db.workouts.where('date').between(desde, hasta, true, true).toArray(),
    db.marcas.toArray(),
    db.settings.where('key').between('agua:' + desde, 'agua:' + hasta, true, true).toArray(),
  ]);
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
  return { desde, hasta, logs, dias, conDatos, medias, ref, plan, byId, porComida, masFrecuentes, balance, pesosPeriodo, workouts, marcas, perfil };
}

// ---------- Informe para la nutricionista ----------
function htmlNutricion(D) {
  const { plan, ref, medias, dias, conDatos, logs, balance } = D;
  const fila = (t, v, o) => `<tr><td>${t}</td><td>${v}</td><td>${o ?? ''}</td></tr>`;
  const fuera = logs.filter(l => l.mealId === 'extra');
  const h = d => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`;
  return `
  <h1>Informe de alimentación</h1>
  <p><b>Massimo Di Giuseppe</b> · del ${fmtDate(D.desde, { day: 'numeric', month: 'long', year: 'numeric' })} al ${fmtDate(D.hasta, { day: 'numeric', month: 'long', year: 'numeric' })}<br>
  ${plan ? `Plan: ${esc(plan.nutricionista || '')} · desde ${fmtDate(plan.fecha, { day: 'numeric', month: 'long' })}${plan.editado ? ` (editado a mano el ${fmtDate(plan.editado, { day: 'numeric', month: 'short' })})` : ''}` : 'Sin plan cargado'}<br>
  Días con comida registrada: <b>${conDatos.length} de ${dias.length}</b>. Todo se pesa en cocido; las calorías se calculan sobre el equivalente en crudo.</p>

  <h2>Resumen (media de los días registrados)</h2>
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
  </table>

  <h2>Peso y balance</h2>
  <p>${D.pesosPeriodo.length ? `Pesajes: ${D.pesosPeriodo.length}. Primero: ${n1(D.pesosPeriodo[0].kg, 1)} kg (${fmtDate(D.pesosPeriodo[0].date)}); último: ${n1(D.pesosPeriodo.at(-1).kg, 1)} kg (${fmtDate(D.pesosPeriodo.at(-1).date)}).` : 'Sin pesajes en el periodo.'}
  ${balance.tendencia ? `<br>Tendencia del peso: <b>${balance.tendencia.kgSemana >= 0 ? '+' : ''}${n1(balance.tendencia.kgSemana, 2)} kg/semana</b>.` : ''}
  ${balance.gasto ? `<br>Gasto estimado: ${n1(balance.gasto)} kcal/día (${balance.fuenteGasto === 'real' ? 'calculado con sus datos de comida y peso' : 'fórmula Mifflin-St Jeor × actividad'}).` : ''}
  ${balance.gasto && balance.planKcal ? `<br>Con el plan medio: ${fraseCambio(balance.proyPlan)}; con lo que come de verdad: ${fraseCambio(balance.proyComido)}.` : ''}</p>

  <h2>Día a día</h2>
  <table class="peq"><tr><th>Día</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Fibra</th><th>Sal</th><th>Agua</th><th>Peso</th><th>Plan</th><th>Fuera</th><th>Entreno</th></tr>
  ${dias.map(d => `<tr><td>${fmtDate(d.date)}</td><td>${d.registros ? n1(d.n.kcal) : '—'}</td><td>${d.registros ? n1(d.n.prot) : ''}</td><td>${d.registros ? n1(d.n.carb) : ''}</td><td>${d.registros ? n1(d.n.fat) : ''}</td><td>${d.registros ? n1(d.n.fib) : ''}</td><td>${d.registros ? n1(d.n.salt, 1) : ''}</td><td>${d.agua ? n1(d.agua / 1000, 1) + ' L' : ''}</td><td>${d.peso ? n1(d.peso, 1) : ''}</td><td>${d.cumplimiento != null ? n1(d.cumplimiento * 100) + '%' : ''}</td><td>${d.fuera ? n1(d.fuera) : ''}</td><td>${d.entreno ? 'Sí' + (d.rpe ? ` (RPE ${n1(d.rpe, 1)})` : '') : ''}</td></tr>`).join('')}
  </table>

  <h2>Por comida</h2>
  <table><tr><th>Comida</th><th>Hora del plan</th><th>Hora media de registro</th><th>kcal media</th><th>Proteína media</th></tr>
  ${Object.entries(D.porComida).map(([id, c]) => {
    const m = plan?.comidas.find(x => x.id === id);
    const nd = c.dias.size || 1;
    return `<tr><td>${esc(COMIDA_NOMBRE(plan, id))}</td><td>${m?.hora || ''}</td><td>${c.horas.length ? h(c.horas.reduce((a, b) => a + b, 0) / c.horas.length) : ''}</td><td>${n1(c.kcal / nd)}</td><td>${n1(c.prot / nd)} g</td></tr>`;
  }).join('')}
  </table>

  <h2>Alimentos más frecuentes</h2>
  <table><tr><th>Alimento</th><th>Veces</th><th>Cantidad media (cocido)</th></tr>
  ${D.masFrecuentes.map(([k, f]) => `<tr><td>${esc(k)}</td><td>${f.veces}</td><td>${n1(f.g / f.veces)} g</td></tr>`).join('')}
  </table>

  ${fuera.length ? `<h2>Comidas fuera del plan</h2><table><tr><th>Día</th><th>Qué</th><th>kcal</th><th>P / C / G</th></tr>
  ${fuera.map(l => `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.name)}${l.aprox ? ' (aprox.)' : ''}</td><td>${n1(l.n.kcal)}</td><td>${n1(l.n.prot)} / ${n1(l.n.carb)} / ${n1(l.n.fat)}</td></tr>`).join('')}</table>` : ''}

  <h2>Registro completo</h2>
  <table class="peq"><tr><th>Día</th><th>Comida</th><th>Alimento</th><th>Gramos</th><th>kcal</th><th>P</th><th>C</th><th>G</th></tr>
  ${[...D.logs].sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0)).map(l => `<tr><td>${fmtDate(l.date)}</td><td>${esc(COMIDA_NOMBRE(plan, l.mealId))}</td><td>${esc(l.name)}</td><td>${l.g ? n1(l.g) + (l.crudo ? ' (crudo)' : '') : ''}</td><td>${n1(l.n.kcal)}</td><td>${n1(l.n.prot)}</td><td>${n1(l.n.carb)}</td><td>${n1(l.n.fat)}</td></tr>`).join('')}
  </table>
  <p class="nota">Generado con NutriStock el ${fmtDate(todayStr(), { day: 'numeric', month: 'long', year: 'numeric' })}. Valores aproximados (tablas BEDCA/USDA y etiquetas de los productos).</p>`;
}

// ---------- Informe para la entrenadora ----------
function htmlEntreno(D) {
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

  <h2>Sesiones</h2>
  ${sesiones.length === 0 ? '<p>No hay entrenos registrados en el periodo.</p>' : sesiones.map(w => {
    const p = leer(w);
    const r = w.resultados || {};
    const dia = dias.find(d => d.date === w.date);
    return `<div class="sesion"><h3>${fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      ${dia?.registros ? `<p class="nota">Ese día: ${n1(dia.n.kcal)} kcal · P ${n1(dia.n.prot)} g · C ${n1(dia.n.carb)} g</p>` : ''}
      ${p.secciones.map((s, si) => {
        const rs = r[si] || {};
        const res = [rs.hecho ? '✓ hecho' : 'no marcado', rs.tiempo && `tiempo ${esc(rs.tiempo)}`, rs.porBloque && `bloques: ${esc(rs.porBloque)}`,
          rs.rondas && `${rs.rondas} rondas${rs.reps ? ' + ' + rs.reps : ''}`, rs.rpe && `RPE ${rs.rpe}`].filter(Boolean).join(' · ');
        const cargas = s.partes.flatMap((pa, pi) => pa.lineas.map((l, li) => {
          const k = `${pi}-${li}`;
          const sets = rs.series?.[k] || (rs.pesos?.[k] ? [rs.pesos[k]] : null);
          return sets && l.ejercicios?.[0] ? `${esc(l.ejercicios[0])}: ${sets.filter(x => x.kg).map(x => `${n1(x.kg, 1)} kg${x.reps ? ' × ' + x.reps : ''}`).join(', ')}` : null;
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
  <table class="peq"><tr><th>Día</th><th>Entreno</th><th>RPE medio</th><th>Peso</th><th>kcal</th><th>Proteína</th><th>Carbohidratos</th></tr>
  ${dias.map(d => `<tr><td>${fmtDate(d.date)}</td><td>${d.entreno ? 'Sí' : ''}</td><td>${d.rpe ? n1(d.rpe, 1) : ''}</td><td>${d.peso ? n1(d.peso, 1) : ''}</td><td>${d.registros ? n1(d.n.kcal) : ''}</td><td>${d.registros ? n1(d.n.prot) + ' g' : ''}</td><td>${d.registros ? n1(d.n.carb) + ' g' : ''}</td></tr>`).join('')}
  </table>
  <p class="nota">Generado con NutriStock el ${fmtDate(todayStr(), { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`;
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
    ['nutricion_por_dia.csv', csv(['fecha', 'kcal', 'proteina_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'azucares_g', 'saturadas_g', 'sal_g', 'agua_ml', 'peso_kg', 'fuera_plan_kcal', 'cumplimiento_plan_pct', 'entreno', 'rpe_medio'],
      dias.map(d => [d.date, d.registros ? d.n.kcal : null, d.registros ? d.n.prot : null, d.registros ? d.n.carb : null, d.registros ? d.n.fat : null, d.registros ? d.n.fib : null, d.registros ? d.n.sug : null, d.registros ? d.n.sat : null, d.registros ? d.n.salt : null, d.agua || null, d.peso, d.fuera || null, d.cumplimiento != null ? d.cumplimiento * 100 : null, d.entreno ? 'si' : '', d.rpe]))],
    ['nutricion_registros.csv', csv(['fecha', 'hora', 'comida', 'alimento', 'gramos', 'pesado_en', 'gramos_crudo', 'kcal', 'proteina_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'azucares_g', 'saturadas_g', 'sal_g', 'aproximado'],
      [...logs].sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0)).map(l => [l.date, l.ts > 1e12 ? new Date(l.ts).toTimeString().slice(0, 5) : '', COMIDA_NOMBRE(plan, l.mealId), l.name, l.g, l.g ? (l.crudo ? 'crudo' : 'cocido') : '', l.rawG, l.n.kcal, l.n.prot, l.n.carb, l.n.fat, l.n.fib, l.n.sug, l.n.sat, l.n.salt, l.aprox ? 'si' : '']))],
    ['peso.csv', csv(['fecha', 'peso_kg'], D.pesosPeriodo.map(w => [w.date, w.kg]))],
  ];
}

function csvEntreno(D) {
  const ses = [], series = [];
  for (const w of [...D.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = leer(w), r = w.resultados || {};
    p.secciones.forEach((s, si) => {
      const rs = r[si] || {};
      ses.push([w.date, s.titulo, s.formato ? textoFormato(s.formato) : '', rs.hecho ? 'si' : '', rs.tiempo, rs.porBloque, rs.rondas, rs.reps, rs.rpe, rs.notas]);
      s.partes.forEach((pa, pi) => pa.lineas.forEach((l, li) => {
        const k = `${pi}-${li}`;
        const sets = rs.series?.[k] || (rs.pesos?.[k] ? [rs.pesos[k]] : null);
        (sets || []).forEach((x, i) => x.kg && series.push([w.date, s.titulo, l.ejercicios?.[0] || l.texto, i + 1, x.kg, x.reps]));
      }));
    });
  }
  const marcas = D.marcas.filter(m => m.tipo === 'fuerza').map(m => [nombreRM(m.ejercicio, D.marcas), m.reps, m.kg, m.date]);
  const bench = D.marcas.filter(m => m.tipo === 'bench').map(m => [BENCHMARKS.find(b => b.id === m.ejercicio)?.name || m.ejercicio, m.resultado, m.date]);
  return [
    ['entreno_sesiones.csv', csv(['fecha', 'seccion', 'formato', 'hecho', 'tiempo', 'resultado_bloques', 'rondas', 'reps_extra', 'rpe', 'notas'], ses)],
    ['entreno_series_y_pesos.csv', csv(['fecha', 'seccion', 'ejercicio', 'serie', 'kg', 'reps'], series)],
    ['marcas_fuerza.csv', csv(['ejercicio', 'repeticiones', 'kg', 'fecha'], marcas)],
    ['benchmarks.csv', csv(['wod', 'resultado', 'fecha'], bench)],
    ['peso.csv', csv(['fecha', 'peso_kg'], D.pesosPeriodo.map(w => [w.date, w.kg]))],
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

const ESTILO_INFORME = `body{font:14px -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:24px;line-height:1.4}
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

  const elegirDias = n => { setDias(n); setDesde(addDays(todayStr(), -(n - 1))); setHasta(todayStr()); };
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    reunir(desde, hasta).then(d => { if (vivo) { setDatos(d); setCargando(false); } });
    return () => { vivo = false; };
  }, [desde, hasta]);

  const cuerpo = datos ? (para === 'nutri' ? htmlNutricion(datos) : htmlEntreno(datos)) : '';
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
          <button class=${'chip' + (dias === n ? ' on' : '')} onClick=${() => elegirDias(n)}>Últimos ${n} días</button>`)}</div>
        <div class="grid2">
          <label>Desde<input type="date" value=${desde} max=${hasta} onInput=${e => { setDias(null); setDesde(e.target.value); }} /></label>
          <label>Hasta<input type="date" value=${hasta} min=${desde} max=${todayStr()} onInput=${e => { setDias(null); setHasta(e.target.value); }} /></label>
        </div>
        <button class="btn" disabled=${!datos} onClick=${() => window.print()}><${Icon} name="plan" size=${18} /> Guardar como PDF / imprimir</button>
        <small class="muted">En el iPhone: se abre "Imprimir" → toca "Compartir" (arriba) → "Guardar en Archivos" o envíalo por WhatsApp o correo como PDF.</small>
        <button class="btn secondary" disabled=${!datos} onClick=${() => compartir([[nombreBase + '.html', htmlCompleto, 'text/html']], titulo)}>Compartir informe (se abre en cualquier navegador)</button>
        <button class="btn secondary" disabled=${!datos} onClick=${async () => { await compartir(para === 'nutri' ? csvNutricion(datos) : csvEntreno(datos), titulo + ' (Excel)'); toast('Listo ✓'); }}>
          Datos para Excel (${para === 'nutri' ? '3' : '5'} archivos CSV)</button>
      </section>
      ${cargando && html`<p class="muted no-print">Preparando…</p>`}
      ${datos && html`<article class="informe" dangerouslySetInnerHTML=${{ __html: cuerpo }}></article>`}
    </div>`;
}
