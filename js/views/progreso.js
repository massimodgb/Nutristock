// Progreso: primero la respuesta ("¿voy bien con el plan?"), luego el detalle.
// Orden: veredicto → media frente al plan → gráfico por día → a dónde te lleva (línea de gasto)
//        → recuperación y comida (cruces con Whoop) → peso → tabla plegada.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getPrefs, getSetting, activePlan } from '../db.js';
import { calcularBalance, fraseCambio, OBJETIVOS } from '../balance.js';
import { sumN, planRef, mealBlocks, blockFoods, visibleFood, fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Seg, Empty } from '../ui.js';
import { resumenWhoop, colorRecuperacion } from '../whoop.js';
import { FACTORES, MIN_DIAS, paresCruce, compararMitades, fraseCruce, textoValor } from '../cruces.js';

const DIAS_CRUCES = 60;
const MACROS = [
  { k: 'kcal', nombre: 'Calorías', unidad: '', color: 'var(--accent)' },
  { k: 'prot', nombre: 'Proteína', unidad: ' g', color: 'var(--prot)' },
  { k: 'carb', nombre: 'Carbohidratos', unidad: ' g', color: 'var(--carb)' },
  { k: 'fat', nombre: 'Grasas', unidad: ' g', color: 'var(--fat)' },
];

export function Progreso({ go }) {
  const [dias, setDias] = useState(7);
  const [sel, setSel] = useState(null);
  const [metrica, setMetrica] = useState('kcal');
  const hoy = todayStr();
  const desde = addDays(hoy, -(dias - 1));
  const desdeCruces = addDays(hoy, -(DIAS_CRUCES - 1));
  const logs = useLive(() => db.logs.where('date').between(addDays(desdeCruces, -1), hoy, true, true).toArray(), []);
  const weights = useLive(() => db.weights.where('date').between(addDays(desde, -6), hoy, true, true).toArray(), [dias]);
  const agua = useLive(() => db.settings.where('key').between('agua:' + desde, 'agua:' + hoy, true, true).toArray(), [dias]);
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const perfil = useLive(() => getSetting('perfil', null), []);
  const pesosTodos = useLive(() => db.weights.toArray(), []);
  const whoopFilas = useLive(() => db.whoop.where('fecha').between(addDays(desdeCruces, -1), hoy, true, true).toArray(), []);

  const listo = ![logs, weights, agua, plan, foods, prefs, perfil, pesosTodos, whoopFilas].includes(undefined);
  // Desde la tarjeta de Whoop en Hoy se llega directo a los cruces (cuando la pantalla ya está dibujada)
  useEffect(() => {
    let ir = null;
    try { ir = sessionStorage.getItem('irA'); } catch {}
    if (!listo || ir !== 'cruces') return;
    try { sessionStorage.removeItem('irA'); } catch {}
    setTimeout(() => document.getElementById('cruces')?.scrollIntoView({ block: 'start' }), 80);
  }, [listo]);

  if (!listo) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const ref = plan ? planRef(plan, byId, prefs) : null;
  const aguaPor = Object.fromEntries(agua.map(a => [a.key.slice(5), a.value]));
  const logs28 = logs.filter(l => l.date >= addDays(hoy, -27));

  // Un resumen por día del periodo elegido
  const fechas = Array.from({ length: dias }, (_, i) => addDays(desde, i));
  const porDia = fechas.map(date => {
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
    return {
      date, n: sumN(dl.map(l => l.n)), registros: dl.length,
      fuera: sumN(dl.filter(l => l.mealId === 'extra').map(l => l.n)).kcal,
      adherencia: total ? hechos / total : null, agua: aguaPor[date] || 0,
    };
  });
  const conDatos = porDia.filter(d => d.registros > 0);
  const media = k => conDatos.length ? conDatos.reduce((s, d) => s + (k === 'adh' ? d.adherencia || 0 : d.n[k]), 0) / conDatos.length : 0;
  const medias = sumN([]);
  for (const k of Object.keys(medias)) medias[k] = media(k);
  const fueraTotal = porDia.reduce((s, d) => s + d.fuera, 0);
  const diaSel = porDia.find(d => d.date === sel);

  // Whoop por día (para cruces y para el gasto)
  const whoopPor = {};
  const agrupadas = {};
  for (const f of whoopFilas) (agrupadas[f.fecha] ||= []).push(f);
  for (const [f, filas] of Object.entries(agrupadas)) whoopPor[f] = resumenWhoop(filas);
  const balance = calcularBalance({ perfil, plan: ref, weights: pesosTodos, logs: logs28 });
  const gastosWhoop = Object.entries(whoopPor).filter(([f, w]) => f >= addDays(hoy, -20) && w.kcal && !w.enCurso).map(([, w]) => w.kcal);
  const gastoWhoop = gastosWhoop.length >= 3 ? gastosWhoop.reduce((a, b) => a + b, 0) / gastosWhoop.length : null;

  return html`
    <div class="page progreso">
      <header class="top"><h1>Progreso</h1></header>
      <${Seg} value=${dias} onChange=${d => { setDias(d); setSel(null); }}
        options=${[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }]} />

      ${conDatos.length === 0 ? html`<${Empty}>Aún no hay comidas registradas en estos ${dias} días. Empieza en la pestaña Hoy.<//>` : html`
        <section class="card pg-veredicto">
          <p class="pg-frase">${frase(medias.kcal, ref?.kcal, dias)}</p>
          <p class="small muted">Registraste ${conDatos.length} de ${dias} días${ref ? ` · cumpliste el ${fmt(media('adh') * 100)} % de los bloques del plan` : ''}${fueraTotal > 0 ? ` · ${fmt(fueraTotal)} kcal fuera del plan` : ''}.</p>
          <${MediaFrentePlan} medias=${medias} objetivo=${ref} />
          <p class="pg-micros small muted">Fibra ${fmt(medias.fib)} g · azúcar ${fmt(medias.sug)} g · saturadas ${fmt(medias.sat, 1)} g · sal ${fmt(medias.salt, 1)} g (media al día)</p>
        </section>

        <section class="card">
          <h3>Día a día</h3>
          <div class="pg-metricas" role="tablist" aria-label="Qué ver en el gráfico">
            ${MACROS.map(m => html`<button role="tab" aria-selected=${metrica === m.k} class=${'chip' + (metrica === m.k ? ' on' : '')} onClick=${() => setMetrica(m.k)}>${m.nombre}</button>`)}
          </div>
          <${GraficoBarras} dias=${porDia} metrica=${MACROS.find(m => m.k === metrica)} objetivo=${ref?.[metrica]} sel=${sel} onSel=${setSel} />
          <p class="muted small">${ref ? 'La raya es lo que marca tu plan. ' : ''}Un punto gris es un día sin registrar (no cuenta en las medias). Toca un día para ver el detalle.</p>
          ${diaSel && html`
            <div class="preview pg-dia">
              <strong>${fmtDate(diaSel.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
              ${diaSel.registros ? html`
                <div class="pg-dia-n">${MACROS.map(m => html`<span><b>${fmt(diaSel.n[m.k])}${m.unidad}</b> ${m.nombre.toLowerCase()}</span>`)}</div>
                <small class="muted">${diaSel.adherencia != null ? `Plan ${fmt(diaSel.adherencia * 100)} % · ` : ''}fuera del plan ${fmt(diaSel.fuera)} kcal · agua ${fmt(diaSel.agua / 1000, 1)} L</small>
                ${whoopPor[diaSel.date]?.recuperacion != null && html`<small class="muted">Whoop: recuperación ${fmt(whoopPor[diaSel.date].recuperacion)} % · esfuerzo ${fmt(whoopPor[diaSel.date].strain, 1)}</small>`}`
                : html`<small class="muted">Este día no registraste comida.</small>`}
            </div>`}
        </section>`}

      <${Balance} b=${balance} plan=${plan} gastoWhoop=${gastoWhoop} go=${go} />

      <${Cruces} logs=${logs} whoopPor=${whoopPor} hoy=${hoy} desde=${desdeCruces} />

      <section class="card">
        <h3>Peso</h3>
        <${GraficoPeso} weights=${weights} desde=${desde} hoy=${hoy} />
      </section>

      ${conDatos.length > 0 && html`
        <details class="card pg-tabla">
          <summary>Ver la tabla día a día</summary>
          <table class="ntable dias">
            <tr class="muted"><td>Día</td><td>kcal</td><td>Prot.</td><td>Plan</td></tr>
            ${[...porDia].reverse().filter(d => d.registros).map(d => html`
              <tr><td>${fmtDate(d.date)}</td><td>${fmt(d.n.kcal)}</td><td>${fmt(d.n.prot)} g</td>
                <td>${d.adherencia != null ? fmt(d.adherencia * 100) + ' %' : '—'}</td></tr>`)}
          </table>
        </details>`}
    </div>`;
}

// Frase principal: lo que comes frente al plan
function frase(kcal, plan, dias) {
  const periodo = `En los últimos ${dias} días`;
  if (!plan) return `${periodo} comes de media ${fmt(kcal)} kcal al día.`;
  const dif = kcal - plan;
  if (Math.abs(dif) <= plan * 0.05) return `${periodo} comes ${fmt(kcal)} kcal al día: justo lo que marca tu plan.`;
  return `${periodo} comes ${fmt(kcal)} kcal al día, ${fmt(Math.abs(dif))} ${dif < 0 ? 'menos' : 'más'} que tu plan.`;
}

// Tabla "media frente a plan" con una barra por macro (la raya vertical es el 100 % del plan)
function MediaFrentePlan({ medias, objetivo }) {
  const TOPE = 1.3; // la barra llega hasta el 130 % del plan
  return html`
    <div class="pg-ledger">
      ${MACROS.map(m => {
        const plan = objetivo?.[m.k];
        const pct = plan ? medias[m.k] / plan : null;
        const estado = pct == null ? '' : Math.abs(pct - 1) <= 0.1 ? 'ok' : pct > 1 ? 'alto' : 'bajo';
        return html`
          <div class="pg-fila">
            <span class="pg-nombre">${m.nombre}</span>
            <span class="pg-num"><b>${fmt(medias[m.k])}</b>${plan ? html`<span class="muted"> / ${fmt(plan)}${m.unidad}</span>` : m.unidad}</span>
            ${plan ? html`
              <div class="pg-track" aria-hidden="true">
                <div class="pg-fill" style=${{ width: Math.min(pct / TOPE, 1) * 100 + '%', background: m.color }}></div>
                <div class="pg-meta" style=${{ left: (1 / TOPE) * 100 + '%' }}></div>
              </div>
              <span class=${'pg-pct ' + estado}>${fmt(pct * 100)} %</span>` : html`<span></span><span></span>`}
          </div>`;
      })}
    </div>`;
}

// Barras por día con la raya del plan. Los días sin registro se ven como un punto (no como un cero).
function GraficoBarras({ dias, metrica, objetivo, sel, onSel }) {
  const W = 340, H = 150, top = 14, bottom = 20;
  const valor = d => d.n[metrica.k];
  const max = Math.max(objetivo || 0, ...dias.map(valor), 1) * 1.12;
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const paso = W / dias.length;
  const ancho = Math.max(3, Math.min(26, paso - 4));
  const etiqueta = (d, i) => dias.length <= 7
    ? fmtDate(d.date, { weekday: 'narrow' })
    : (i % 5 === 0 || i === dias.length - 1) ? fmtDate(d.date, { day: 'numeric' }) : '';
  return html`
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`${metrica.nombre} por día`}>
      <line x1="0" x2=${W} y1=${y(0)} y2=${y(0)} class="axis" />
      ${dias.map((d, i) => {
        const x = i * paso + (paso - ancho) / 2;
        const h = Math.max(0, y(0) - y(valor(d)));
        const r = Math.min(4, ancho / 2, h);
        return html`
          <g class=${'bar-g' + (sel && sel !== d.date ? ' dim' : '')} onClick=${() => onSel(sel === d.date ? null : d.date)}>
            <rect x=${i * paso} y=${top} width=${paso} height=${H - top} fill="transparent" />
            ${d.registros
              ? h > 0 && html`<path d=${`M${x},${y(0)} V${y(0) - h + r} q0,-${r} ${r},-${r} H${x + ancho - r} q${r},0 ${r},${r} V${y(0)} Z`} fill=${metrica.color} />`
              : html`<circle cx=${x + ancho / 2} cy=${y(0) - 5} r="2.5" class="sin-dato"><title>Sin registrar</title></circle>`}
            ${sel === d.date && d.registros && html`<text x=${x + ancho / 2} y=${y(valor(d)) - 4} text-anchor="middle" class="tick valor">${fmt(valor(d))}</text>`}
            <text x=${x + ancho / 2} y=${H - 5} text-anchor="middle" class="tick">${etiqueta(d, i)}</text>
          </g>`;
      })}
      ${objetivo && html`
        <line x1="0" x2=${W} y1=${y(objetivo)} y2=${y(objetivo)} class="target" />
        <text x=${W} y=${y(objetivo) - 4} text-anchor="end" class="tick">plan ${fmt(objetivo)}${metrica.unidad}</text>`}
    </svg>`;
}

// Peso diario (puntos) y media de 7 días (línea)
function GraficoPeso({ weights, desde, hoy }) {
  const visibles = weights.filter(w => w.date >= desde).sort((a, b) => a.date.localeCompare(b.date));
  if (visibles.length < 2) return html`<p class="muted small">Apunta tu peso en Hoy (o conecta Whoop) durante unos días para ver la tendencia.</p>`;
  const mediaDe = date => {
    const w = weights.filter(x => x.date >= addDays(date, -6) && x.date <= date);
    return w.reduce((s, x) => s + x.kg, 0) / w.length;
  };
  const W = 340, H = 140, pad = 14;
  const dias = Math.round((new Date(hoy) - new Date(desde)) / 864e5) || 1;
  const kgs = visibles.flatMap(w => [w.kg, mediaDe(w.date)]);
  const min = Math.min(...kgs) - 0.3, max = Math.max(...kgs) + 0.3;
  const x = date => pad + (W - 2 * pad) * ((new Date(date) - new Date(desde)) / 864e5) / dias;
  const y = kg => pad + (H - 2 * pad) * (1 - (kg - min) / (max - min));
  const linea = visibles.map((w, i) => `${i ? 'L' : 'M'}${x(w.date)},${y(mediaDe(w.date))}`).join(' ');
  const ultima = visibles[visibles.length - 1];
  const cambio = mediaDe(ultima.date) - mediaDe(visibles[0].date);
  return html`
    <p class="pg-frase pequena">${fmt(mediaDe(ultima.date), 1)} kg de media, ${Math.abs(cambio) < 0.05 ? 'sin cambios' : `${cambio > 0 ? '+' : '−'}${fmt(Math.abs(cambio), 1)} kg`} en el periodo.</p>
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolución del peso">
      <text x="0" y=${y(max) + 10} class="tick">${fmt(max, 1)}</text>
      <text x="0" y=${y(min) - 2} class="tick">${fmt(min, 1)}</text>
      ${visibles.map(w => html`<circle cx=${x(w.date)} cy=${y(w.kg)} r="4" class="peso-dot"><title>${fmtDate(w.date)}: ${fmt(w.kg, 1)} kg</title></circle>`)}
      <path d=${linea} class="peso-line" />
    </svg>
    <p class="muted small">Puntos: peso de cada día · línea: media de 7 días (fíjate en la línea).</p>`;
}

// ¿A dónde te lleva? Todo sobre una misma línea: a la izquierda de tu gasto bajas, a la derecha subes.
function Balance({ b, plan, gastoWhoop, go }) {
  if (!b.gasto) return html`
    <section class="card"><h3>¿A dónde te lleva tu plan?</h3>
      <p class="small">${b.kg == null ? 'Apunta tu peso (en Hoy) para poder calcular lo que gastas.' : 'Completa tu altura, edad y actividad para calcular lo que gastas.'}</p>
      <button class="btn" onClick=${() => go('perfil')}>Completar mi perfil</button>
    </section>`;

  const puntos = [
    b.planKcal && { id: 'plan', label: 'Tu plan', v: b.planKcal, nota: fraseCambio(b.proyPlan) },
    b.comido && { id: 'comes', label: 'Lo que comes', v: b.comido, nota: `${fraseCambio(b.proyComido)} (media de ${b.diasRegistrados} días)` },
    b.kcalObjetivo && { id: 'objetivo', label: 'Tu objetivo', v: b.kcalObjetivo, nota: (OBJETIVOS.find(o => o.value === b.ritmo)?.label || '').toLowerCase() },
    gastoWhoop && { id: 'whoop', label: 'Gasto según Whoop', v: gastoWhoop, nota: 'media de tus días completos', esGasto: true },
  ].filter(Boolean);
  const valores = [b.gasto, ...puntos.map(p => p.v)];
  const lo = Math.min(...valores), hi = Math.max(...valores);
  const margen = Math.max((hi - lo) * 0.15, 150);
  const min = lo - margen, max = hi + margen;
  const W = 340, pos = v => 10 + (W - 20) * (v - min) / (max - min);
  const porque = razones(b, plan);

  return html`
    <section class="card pg-balance">
      <h3>¿A dónde te lleva tu plan?</h3>
      ${b.planKcal && html`<p class="pg-frase">Con este plan vas a ${fraseCambio(b.proyPlan)}.</p>`}
      <svg class="chart pg-linea" viewBox=${`0 0 ${W} 92`} role="img" aria-label="Tu plan, lo que comes y tu objetivo frente a lo que gastas">
        <text x="10" y="14" class="tick zona-txt">← por debajo: bajas</text>
        <text x=${W - 10} y="14" text-anchor="end" class="tick zona-txt">por encima: subes →</text>
        <rect x="10" y="38" width=${Math.max(0, pos(b.gasto) - 10)} height="12" rx="6" class="zona-baja" />
        <rect x=${pos(b.gasto)} y="38" width=${Math.max(0, W - 10 - pos(b.gasto))} height="12" rx="6" class="zona-sube" />
        <line x1=${pos(b.gasto)} x2=${pos(b.gasto)} y1="26" y2="62" class="gasto" />
        <text x=${Math.min(Math.max(pos(b.gasto), 40), W - 40)} y="80" text-anchor="middle" class="tick fuerte">gastas ${fmt(b.gasto)}</text>
        ${puntos.map(p => html`<circle cx=${pos(p.v)} cy="44" r=${p.esGasto ? 5 : 9} class=${'pt ' + p.id}><title>${p.label}: ${fmt(p.v)} kcal</title></circle>`)}
      </svg>
      <div class="pg-leyenda">
        ${puntos.map(p => html`
          <div class="pg-ley">
            <span class=${'pg-punto ' + p.id}></span>
            <span class="grow">${p.label}<br /><small class="muted">${p.nota}</small></span>
            <span class="pg-num"><b>${fmt(p.v)}</b> kcal</span>
          </div>`)}
      </div>
      ${b.tendencia && html`<p class="small">Tu peso real: <b>${b.tendencia.kgSemana >= 0 ? '+' : ''}${fmt(b.tendencia.kgSemana, 2)} kg por semana</b> <span class="muted">(últimos ${Math.round(b.tendencia.dias)} días)</span>.</p>`}
      ${gastoWhoop && Math.abs(gastoWhoop - b.gasto) > 300 && html`<p class="small muted">Whoop calcula que gastas ${fmt(gastoWhoop)} kcal, ${fmt(Math.abs(gastoWhoop - b.gasto))} ${gastoWhoop > b.gasto ? 'más' : 'menos'} que la app. Whoop suele pasarse un poco; la cifra de la app ${b.fuenteGasto === 'real' ? 'sale de tu peso real, así que es más fiable' : 'es una fórmula y se afinará con 2-3 semanas de datos'}.</p>`}
      ${b.difObjetivo != null && Math.abs(b.difObjetivo) > 100 && html`
        <p class="notice">Para tu objetivo necesitarías unas <b>${fmt(b.kcalObjetivo)} kcal</b> al día: ${fmt(Math.abs(b.difObjetivo))} ${b.difObjetivo < 0 ? 'menos' : 'más'} que tu plan. Coméntalo con tu nutricionista antes de cambiar nada.</p>`}
      ${porque.length > 0 && html`
        <details class="porque"><summary>¿Por qué puede no cuadrar con la báscula?</summary>
          <ul>${porque.map(r => html`<li>${r}</li>`)}</ul></details>`}
      <p class="muted small">${b.fuenteGasto === 'real'
        ? 'Tu gasto sale de comparar lo que has comido con cómo ha cambiado tu peso: es lo más fiable.'
        : 'Tu gasto es una estimación con fórmula. Con unas 2-3 semanas registrando comida y peso, la app calculará tu gasto real.'}</p>
      <button class="link" onClick=${() => go('perfil')}>Cambiar perfil y objetivo</button>
    </section>`;
}

function razones(b, plan) {
  const out = [];
  if (b.comido && b.planKcal && b.comido > b.planKcal + 100) {
    out.push(html`Comes de media <b>${fmt(b.comido - b.planKcal)} kcal más</b> que el plan al día${b.fuera > 50 ? html`, sobre todo fuera del plan (≈${fmt(b.fuera)} kcal/día)` : ''}.`);
  }
  if (b.tendencia && b.tendencia.kgSemana > 0.1 && b.proyPlan != null && b.proyPlan < 0) {
    out.push('Según el plan deberías bajar, pero tu peso sube: o comes más de lo que apuntas, o gastas menos de lo que estima la fórmula.');
  }
  out.push('Si entrenas menos de lo normal (por ejemplo, con una lesión), gastas menos: el mismo plan que antes te hacía bajar puede ahora mantenerte o hacerte subir.');
  if (plan && JSON.stringify(plan).includes('creatina')) {
    out.push('Tomas creatina: hace que el músculo guarde agua (1-2 kg las primeras semanas). Ese peso no es grasa.');
  }
  out.push('Un día con más carbohidratos o sal puede sumar 0,5-1 kg de agua al día siguiente. Por eso hay que fijarse en la media de 7 días, no en el número de un día.');
  if (b.diasRegistrados < 10) out.push(`Solo hay ${b.diasRegistrados} días con comida registrada en las últimas 3 semanas: cuantos más registres, más preciso será todo.`);
  return out;
}

// ---------- Recuperación y comida (Whoop) ----------
function Cruces({ logs, whoopPor, hoy, desde }) {
  const [fid, setFid] = useState('carb');
  const [punto, setPunto] = useState(null);
  const conRec = Object.values(whoopPor).filter(w => w.recuperacion != null);
  if (!conRec.length) return html`
    <section class="card" id="cruces">
      <h3>Recuperación y comida</h3>
      <p class="small muted">Conecta Whoop en Más y aquí verás cómo se relaciona lo que comes, cómo duermes y cuánto entrenas con tu recuperación del día siguiente.</p>
    </section>`;

  // Lo que comiste cada día (solo días con registro real)
  const comida = {};
  const porFecha = {};
  for (const l of logs) (porFecha[l.date] ||= []).push(l);
  for (const [f, ls] of Object.entries(porFecha)) {
    const n = sumN(ls.map(l => l.n));
    if (n.kcal < 300) continue;
    const cena = ls.filter(l => l.mealId === 'cena' && l.ts).map(l => new Date(l.ts));
    const ultima = cena.length ? new Date(Math.max(...cena)) : null;
    comida[f] = {
      n, fuera: sumN(ls.filter(l => l.mealId === 'extra').map(l => l.n)).kcal,
      // Solo vale si la apuntaste ese mismo día por la tarde-noche
      horaCena: ultima && todayStr(ultima) === f && ultima.getHours() >= 17 ? ultima.getHours() + ultima.getMinutes() / 60 : undefined,
    };
  }
  const fechas = [];
  for (let f = desde; f <= hoy; f = addDays(f, 1)) fechas.push(f);
  const factor = FACTORES.find(x => x.id === fid);
  const pares = paresCruce({ fechas, comida, whoop: whoopPor, factor });
  const c = compararMitades(pares);
  const media = k => { const v = Object.entries(whoopPor).filter(([f, w]) => f >= addDays(hoy, -6) && w[k] != null).map(([, w]) => w[k]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rec7 = media('recuperacion'), horas7 = media('horas'), strain7 = media('strain');
  const pSel = pares.find(p => p.fecha === punto);

  return html`
    <section class="card pg-cruces" id="cruces">
      <h3>Recuperación y comida</h3>
      <p class="pg-frase pequena">${rec7 != null ? `En los últimos 7 días te recuperas de media un ${fmt(rec7)} %` : 'En los últimos 7 días no hay datos de recuperación'}${horas7 != null ? `, duermes ${fmt(horas7, 1)} h` : ''}${strain7 != null ? ` y tu esfuerzo medio es ${fmt(strain7, 1)}` : ''}.</p>
      <p class="small muted">Elige qué comparar con tu recuperación del día siguiente:</p>
      <div class="pg-metricas" role="tablist" aria-label="Qué comparar">
        ${FACTORES.map(f => html`<button role="tab" aria-selected=${fid === f.id} class=${'chip' + (fid === f.id ? ' on' : '')} onClick=${() => { setFid(f.id); setPunto(null); }}>${f.nombre}</button>`)}
      </div>
      <${Dispersion} pares=${pares} factor=${factor} umbral=${c?.umbral} sel=${punto} onSel=${setPunto} />
      ${pSel && html`<p class="preview small"><b>${fmtDate(pSel.fecha, { weekday: 'long', day: 'numeric', month: 'short' })}</b>: recuperación ${fmt(pSel.y)} %, con ${textoValor(factor, pSel.x)} de ${factor.nombre.toLowerCase()} ${factor.cuando}.</p>`}
      ${c ? html`
        <p class="pg-resultado">${fraseCruce(factor, c)}</p>
        <small class="muted">${c.alto.n} días frente a ${c.bajo.n}, en los últimos ${DIAS_CRUCES} días. Es una relación, no una prueba: también influyen el entreno, el estrés, el alcohol o una mala noche.</small>`
        : html`<p class="small">Para sacar una conclusión hacen falta al menos ${MIN_DIAS} días con ${factor.id === 'strain' || factor.id === 'sueno' ? 'datos de Whoop' : 'comida registrada y Whoop'}; ahora hay ${pares.length}. Sigue registrando y aparecerá solo.</p>`}
      <details class="porque">
        <summary>¿Qué significa cada dato?</summary>
        <ul>
          <li><b>Recuperación</b> (0-100 %): lo preparado que está tu cuerpo hoy. Verde (67 % o más): puedes apretar. Amarillo (34-66 %): normal. Rojo (menos de 34 %): mejor suave.</li>
          <li><b>VFC</b> (variabilidad del pulso): cuanto más alta respecto a lo normal en ti, mejor recuperado. Compárala contigo mismo, no con otros.</li>
          <li><b>Esfuerzo</b> (strain, de 0 a 21): cuánto ha trabajado tu cuerpo en el día. Un entreno fuerte de CrossFit suele dejarlo entre 14 y 18.</li>
          <li><b>Calorías gastadas</b>: todo lo que gasta tu cuerpo en el día, entreno incluido. Es una estimación de Whoop.</li>
        </ul>
      </details>
    </section>`;
}

// Puntos: cada uno es un día (abajo, el factor; a la izquierda, la recuperación del día siguiente)
function Dispersion({ pares, factor, umbral, sel, onSel }) {
  if (!pares.length) return html`<p class="small muted pg-vacio">Aún no hay días con los dos datos para este cruce.</p>`;
  const W = 340, H = 170, izq = 26, abajo = 22, arriba = 8;
  const xs = pares.map(p => p.x);
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.08; lo -= m; hi += m;
  const x = v => izq + (W - izq - 8) * (v - lo) / (hi - lo);
  const y = v => arriba + (H - arriba - abajo) * (1 - v / 100);
  return html`
    <svg class="chart pg-disp" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`Recuperación según ${factor.nombre.toLowerCase()}`}>
      <rect x=${izq} y=${y(100)} width=${W - izq - 8} height=${y(67) - y(100)} class="banda ok" />
      <rect x=${izq} y=${y(34)} width=${W - izq - 8} height=${y(0) - y(34)} class="banda bad" />
      ${[0, 34, 67, 100].map(v => html`<text x=${izq - 4} y=${y(v) + 3} text-anchor="end" class="tick">${v}</text>`)}
      <line x1=${izq} x2=${W - 8} y1=${y(0)} y2=${y(0)} class="axis" />
      ${umbral != null && html`<line x1=${x(umbral)} x2=${x(umbral)} y1=${arriba} y2=${y(0)} class="target" />`}
      <text x=${izq} y=${H - 4} class="tick">${textoValor(factor, lo + m)}</text>
      <text x=${W - 8} y=${H - 4} text-anchor="end" class="tick">${textoValor(factor, hi - m)}</text>
      ${pares.map(p => html`
        <g class="pg-pt" onClick=${() => onSel(sel === p.fecha ? null : p.fecha)}>
          <circle cx=${x(p.x)} cy=${y(p.y)} r="12" fill="transparent" />
          <circle cx=${x(p.x)} cy=${y(p.y)} r=${sel === p.fecha ? 6.5 : 4.5} class=${'rec ' + colorRecuperacion(p.y) + (sel === p.fecha ? ' sel' : '')}><title>${fmtDate(p.fecha)}: ${fmt(p.y)} %</title></circle>
        </g>`)}
    </svg>
    <p class="muted small">Cada punto es un día. Arriba, mejor recuperación. Toca uno para ver qué día fue${umbral != null ? '; la raya separa los días con menos y con más' : ''}.</p>`;
}
