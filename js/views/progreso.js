// Progreso: medias de la semana / mes, cumplimiento del plan, calorías por día y peso.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, activePlan } from '../db.js';
import { sumN, planRef, mealBlocks, blockFoods, visibleFood, fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Seg, Bar, MacroLine, Empty } from '../ui.js';

export function Progreso() {
  const [dias, setDias] = useState(7);
  const [sel, setSel] = useState(null);
  const hoy = todayStr();
  const desde = addDays(hoy, -(dias - 1));
  const logs = useLive(() => db.logs.where('date').between(desde, hoy, true, true).toArray(), [dias]);
  const weights = useLive(() => db.weights.where('date').between(addDays(desde, -6), hoy, true, true).toArray(), [dias]);
  const agua = useLive(() => db.settings.where('key').between('agua:' + desde, 'agua:' + hoy, true, true).toArray(), [dias]);
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);

  if ([logs, weights, agua, plan, foods, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const ref = plan ? planRef(plan, byId, prefs) : null;
  const aguaPor = Object.fromEntries(agua.map(a => [a.key.slice(5), a.value]));

  // Un resumen por día
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

  return html`
    <div class="page">
      <header class="top"><h1>Progreso</h1></header>
      <${Seg} value=${dias} onChange=${d => { setDias(d); setSel(null); }}
        options=${[{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }]} />

      ${conDatos.length === 0 ? html`<${Empty}>Aún no hay registros en estos días. Empieza en la pestaña Hoy.<//>` : html`
        <div class="tiles">
          <div class="tile"><small>Media diaria</small><b>${fmt(medias.kcal)}</b><span>kcal${ref ? ` de ≈${fmt(ref.kcal)}` : ''}</span></div>
          <div class="tile"><small>Cumplimiento del plan</small><b>${fmt(media('adh') * 100)}%</b><span>de los bloques</span></div>
          <div class="tile"><small>Proteína media</small><b>${fmt(medias.prot)} g</b><span>${ref ? `de ≈${fmt(ref.prot)} g` : 'al día'}</span></div>
          <div class="tile"><small>Fuera del plan</small><b>${fmt(fueraTotal)}</b><span>kcal en total</span></div>
        </div>

        <section class="card">
          <h3>Calorías por día</h3>
          <p class="muted small">Toca una barra para ver el detalle${ref ? '. La línea es lo que marca tu plan' : ''}.</p>
          <${GraficoKcal} dias=${porDia} objetivo=${ref?.kcal} sel=${sel} onSel=${setSel} />
          ${diaSel && html`
            <div class="preview">
              <strong>${fmtDate(diaSel.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><br />
              <${MacroLine} n=${diaSel.n} />
              <div class="muted small">
                ${diaSel.adherencia != null ? `Plan: ${fmt(diaSel.adherencia * 100)}% · ` : ''}Fuera del plan: ${fmt(diaSel.fuera)} kcal · Agua: ${fmt(diaSel.agua / 1000, 1)} L
              </div>
            </div>`}
        </section>

        <section class="card">
          <h3>Macros (media de los días registrados)</h3>
          <div class="bars">
            <${Bar} label="Proteína" value=${medias.prot} target=${ref?.prot} color="var(--prot)" />
            <${Bar} label="Carbohidratos" value=${medias.carb} target=${ref?.carb} color="var(--carb)" />
            <${Bar} label="Grasas" value=${medias.fat} target=${ref?.fat} color="var(--fat)" />
            <div class="mini-n">
              <span>Fibra ${fmt(medias.fib)} g</span><span>Azúcar ${fmt(medias.sug)} g</span>
              <span>Sat. ${fmt(medias.sat, 1)} g</span><span>Sal ${fmt(medias.salt, 1)} g</span>
            </div>
          </div>
        </section>`}

      <section class="card">
        <h3>Peso</h3>
        <${GraficoPeso} weights=${weights} desde=${desde} hoy=${hoy} />
      </section>

      ${conDatos.length > 0 && html`
        <section class="card">
          <h3>Día a día</h3>
          <table class="ntable dias">
            <tr class="muted"><td>Día</td><td>kcal</td><td>Prot.</td><td>Plan</td></tr>
            ${[...porDia].reverse().filter(d => d.registros).map(d => html`
              <tr><td>${fmtDate(d.date)}</td><td>${fmt(d.n.kcal)}</td><td>${fmt(d.n.prot)} g</td>
                <td>${d.adherencia != null ? fmt(d.adherencia * 100) + '%' : '—'}</td></tr>`)}
          </table>
        </section>`}
    </div>`;
}

// Barras de calorías por día con la línea del objetivo
function GraficoKcal({ dias, objetivo, sel, onSel }) {
  const W = 340, H = 150, top = 12, bottom = 20;
  const max = Math.max(objetivo || 0, ...dias.map(d => d.n.kcal), 1) * 1.1;
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const paso = W / dias.length;
  const ancho = Math.max(3, Math.min(28, paso - 4));
  const etiqueta = (d, i) => dias.length <= 7
    ? fmtDate(d.date, { weekday: 'narrow' })
    : (i % 5 === 0 || i === dias.length - 1) ? fmtDate(d.date, { day: 'numeric' }) : '';
  return html`
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Calorías por día">
      <line x1="0" x2=${W} y1=${y(0)} y2=${y(0)} class="axis" />
      ${dias.map((d, i) => {
        const x = i * paso + (paso - ancho) / 2;
        const h = Math.max(0, y(0) - y(d.n.kcal));
        const r = Math.min(4, ancho / 2, h);
        return html`
          <g class=${'bar-g' + (sel && sel !== d.date ? ' dim' : '')} onClick=${() => onSel(sel === d.date ? null : d.date)}>
            <rect x=${i * paso} y=${top} width=${paso} height=${H - top} fill="transparent" />
            ${h > 0 && html`<path d=${`M${x},${y(0)} V${y(0) - h + r} q0,-${r} ${r},-${r} H${x + ancho - r} q${r},0 ${r},${r} V${y(0)} Z`} fill="var(--accent)" />`}
            <text x=${x + ancho / 2} y=${H - 5} text-anchor="middle" class="tick">${etiqueta(d, i)}</text>
          </g>`;
      })}
      ${objetivo && html`
        <line x1="0" x2=${W} y1=${y(objetivo)} y2=${y(objetivo)} class="target" />
        <text x=${W} y=${y(objetivo) - 4} text-anchor="end" class="tick">${fmt(objetivo)}</text>`}
    </svg>`;
}

// Peso diario (puntos) y media de 7 días (línea)
function GraficoPeso({ weights, desde, hoy }) {
  const visibles = weights.filter(w => w.date >= desde).sort((a, b) => a.date.localeCompare(b.date));
  if (visibles.length < 2) return html`<p class="muted small">Registra tu peso en Más durante unos días para ver la tendencia.</p>`;
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
    <p class="small">Media actual <b>${fmt(mediaDe(ultima.date), 1)} kg</b>
      <span class="muted"> · ${cambio >= 0 ? '+' : ''}${fmt(cambio, 1)} kg en el periodo</span></p>
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolución del peso">
      <text x="0" y=${y(max) + 10} class="tick">${fmt(max, 1)}</text>
      <text x="0" y=${y(min) - 2} class="tick">${fmt(min, 1)}</text>
      ${visibles.map(w => html`<circle cx=${x(w.date)} cy=${y(w.kg)} r="4" class="peso-dot"><title>${fmtDate(w.date)}: ${fmt(w.kg, 1)} kg</title></circle>`)}
      <path d=${linea} class="peso-line" />
    </svg>
    <p class="muted small">Puntos: peso de cada día · línea: media de 7 días.</p>`;
}
