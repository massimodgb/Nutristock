// Progreso físico: peso (real, media de 7 días, media semanal y tendencia) y medidas (cintura, cadera…).
// En las gráficas: PUNTOS = lo que mediste; LÍNEAS = lo calculado (medias y tendencia), y se dice cuál es cuál.
import { html, useState } from '../lib.js';
import { db, useLive, getSetting, setSetting } from '../db.js';
import { fmt, fmtDate, addDays, todayStr } from '../nutri.js';
import { Sheet, Num, Icon, toast } from '../ui.js';
import { tiposMedida, idTipo, sesionesDe, serieDe, cambiosMedida, guardarSesion, borrarSesion, mediasSemanales, resumenPeso } from '../medidas.js';

const RANGOS = [[30, '1 mes'], [90, '3 meses'], [180, '6 meses'], [0, 'Todo']];
const signo = (v, dec = 1, u = '') => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), dec)}${u}`);

export function Cuerpo({ pesos, perfil }) {
  const medidas = useLive(() => db.medidas.toArray(), []);
  const tipos = useLive(tiposMedida, []);
  const [rango, setRango] = useState(90);
  const [form, setForm] = useState(null); // { tipo, sesion? }
  if (!medidas || !tipos) return null;
  const hoy = todayStr();
  const orden = [...pesos].sort((a, b) => a.date.localeCompare(b.date));
  const desde = rango ? addDays(hoy, -(rango - 1)) : orden[0]?.date || hoy;
  const r = resumenPeso(orden, hoy, perfil?.objetivo ?? null);
  const semanas = mediasSemanales(orden.filter(w => w.date >= addDays(desde, -6)));
  const conDatos = tipos.filter(t => medidas.some(m => m.tipo === t.id));

  return html`
    <section class="card cuerpo">
      <div class="sec-head"><h3>Peso</h3>
        <div class="chips">${RANGOS.map(([v, t]) => html`<button class=${'chip' + (rango === v ? ' on' : '')} onClick=${() => setRango(v)}>${t}</button>`)}</div></div>
      ${orden.length < 2 ? html`<p class="muted small">Apunta tu peso en Hoy (o conecta Whoop) durante unos días para ver la evolución.</p>` : html`
        <div class="cuerpo-stats">
          <div><small>Media 7 días</small><b>${r.media7 != null ? `${fmt(r.media7, 1)} kg` : '—'}</b></div>
          <div><small>Cambio semanal</small><b>${signo(r.cambioSemana, 1, ' kg')}</b></div>
          <div><small>Cambio mensual</small><b>${signo(r.cambioMes, 1, ' kg')}</b></div>
          <div><small>Tendencia</small><b>${r.tendencia != null ? `${signo(r.tendencia, 2)} kg/sem` : '—'}</b></div>
        </div>
        ${r.objetivo != null && html`<p class="small">${r.tendencia == null ? `Tu objetivo: ${signo(r.objetivo, 2)} kg/semana. Hacen falta más pesajes (2 semanas) para compararlo con tu tendencia.`
          : `Tu objetivo: ${signo(r.objetivo, 2)} kg/semana · tu tendencia de las últimas 4 semanas: ${signo(r.tendencia, 2)} kg/semana${Math.abs(r.frenteObjetivo) < 0.1 ? ' (en línea con el objetivo).' : r.frenteObjetivo > 0 ? ' (por encima de lo buscado).' : ' (por debajo de lo buscado).'}`}</p>`}
        <${GraficoPeso} pesos=${orden} desde=${desde} hasta=${hoy} />
        ${semanas.length > 0 && html`
          <details class="semanas"><summary>Media de cada semana (${semanas.length})</summary>
            <table class="ntable">${[...semanas].reverse().map((s, i, a) => html`
              <tr><td>Semana del ${fmtDate(s.semana, { day: 'numeric', month: 'short' })}</td><td>${fmt(s.media, 1)} kg</td>
                <td class="muted">${a[i + 1] ? signo(s.media - a[i + 1].media, 1, ' kg') : ''}</td><td class="muted">${s.n} pesajes</td></tr>`)}</table>
          </details>`}`}
    </section>

    <section class="card cuerpo">
      <div class="sec-head"><h3>Medidas</h3>
        <button class="btn small" onClick=${() => setForm({ tipo: 'cintura' })}><${Icon} name="plus" size=${16} /> Añadir</button></div>
      ${conDatos.length === 0 && html`<p class="muted small">Apunta tu cintura y tu cadera (por ejemplo, una vez por semana, en ayunas). Puedes medir varias veces y elegir la buena.</p>`}
      ${conDatos.map(t => html`<${MedidaTipo} key=${t.id} t=${t} filas=${medidas} onEditar=${s => setForm({ tipo: t.id, sesion: s })} />`)}
    </section>

    <${Sheet} open=${!!form} onClose=${() => setForm(null)} title=${form?.sesion ? 'Editar medida' : 'Añadir medidas'}>
      ${form && html`<${MedidasForm} key=${form.tipo + (form.sesion?.sesion || '')} tipos=${tipos} inicial=${form} filas=${medidas}
        onSiguiente=${tipo => setForm({ tipo })} onDone=${() => setForm(null)} />`}
    <//>`;
}

function MedidaTipo({ t, filas, onEditar }) {
  const serie = serieDe(filas, t.id);
  const c = cambiosMedida(serie);
  const sesiones = sesionesDe(filas, t.id);
  return html`
    <div class="medida">
      <div class="medida-top"><b>${t.nombre}</b>
        ${c ? html`<span><b>${fmt(c.ultima.valor, 1)} ${t.unidad}</b> <small class="muted">${fmtDate(c.ultima.fecha, { day: 'numeric', month: 'short' })}</small></span>` : html`<small class="muted">elige la medida buena de cada sesión</small>`}</div>
      ${c && html`<small class="muted">Frente a la anterior: ${signo(c.vsAnterior, 1, ' ' + t.unidad)}${c.mes ? ` · frente a hace un mes: ${signo(c.vsMes, 1, ' ' + t.unidad)}` : ''}</small>`}
      ${serie.length > 1 && html`<${GraficoSerie} serie=${serie} unidad=${t.unidad} etiqueta=${t.nombre} />`}
      <details><summary>Todas las mediciones (${sesiones.length})</summary>
        <div class="list">${[...sesiones].reverse().map(s => html`
          <button class="row" key=${s.sesion} onClick=${() => onEditar(s)}>
            <span class="grow">${fmtDate(s.fecha, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}
              <br /><small>${s.tomas.map(x => html`<span class=${'toma' + (x.representativa ? ' rep' : '')}>${x.representativa ? '★ ' : ''}${fmt(x.valor, 1)}</span> `)}${t.unidad}</small>
              ${s.nota && html`<br /><small class="muted">${s.nota}</small>`}
              ${!s.rep && s.tomas.length > 1 ? html`<br /><small class="aviso-rm">Sin elegir la buena: no sale en la gráfica</small>` : ''}</span>
            <small class="muted">Editar</small>
          </button>`)}</div>
      </details>
    </div>`;
}

// Añadir o editar una sesión: varias tomas, eliges la representativa, nota
function MedidasForm({ tipos, inicial, onSiguiente, onDone }) {
  const s0 = inicial.sesion;
  const [fecha, setFecha] = useState(s0?.fecha || todayStr());
  const [tipo, setTipo] = useState(inicial.tipo);
  const [tomas, setTomas] = useState(s0 ? s0.tomas.map(t => ({ valor: t.valor, representativa: !!t.representativa })) : [{ valor: null, representativa: true }]);
  const [nota, setNota] = useState(s0?.nota || '');
  const [nuevo, setNuevo] = useState('');
  const t = tipos.find(x => x.id === tipo) || { id: tipo, nombre: tipo, unidad: 'cm' };
  const set = (i, c) => setTomas(tomas.map((x, j) => (j === i ? { ...x, ...c } : c.representativa ? { ...x, representativa: false } : x)));
  const validas = tomas.filter(x => x.valor > 0);
  const guardar = async siguiente => {
    try {
      await guardarSesion({ sesion: s0?.sesion, fecha, tipo, unidad: t.unidad, tomas, nota });
      toast(`${t.nombre} guardada ✓`);
      if (siguiente) { const otro = tipos.find(x => x.id !== tipo && x.id === (tipo === 'cintura' ? 'cadera' : 'cintura')) || tipos.find(x => x.id !== tipo); onSiguiente(otro?.id || tipo); }
      else onDone();
    } catch (e) { toast(e.message); }
  };
  const crearTipo = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const id = idTipo(nombre);
    const propios = await getSetting('tiposMedida', []);
    if (!tipos.some(x => x.id === id)) await setSetting('tiposMedida', [...propios, { id, nombre, unidad: 'cm' }]);
    setTipo(id); setNuevo('');
  };
  return html`
    <div class="form medidas-form">
      <label>Fecha<input type="date" value=${fecha} max=${todayStr()} onChange=${e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setFecha(e.target.value)} /></label>
      ${!s0 && html`
        <div class="chips wrap">${tipos.map(x => html`<button class=${'chip' + (tipo === x.id ? ' on' : '')} onClick=${() => setTipo(x.id)}>${x.nombre}</button>`)}</div>
        <div class="inline"><input value=${nuevo} placeholder="Otra medida (brazo, muslo…)" aria-label="Nombre de otra medida" onInput=${e => setNuevo(e.target.value)} />
          <button class="btn small secondary" disabled=${!nuevo.trim()} onClick=${crearTipo}>Añadir</button></div>`}
      <h4>${t.nombre}</h4>
      <small class="muted">Si mides varias veces, apunta todas y marca con ★ la que consideras buena (es la que va a las gráficas). No se hace la media.</small>
      ${tomas.map((x, i) => html`
        <div class="inline toma-fila" key=${i}>
          <div class="grow"><${Num} value=${x.valor} onChange=${v => set(i, { valor: v })} suffix=${t.unidad} /></div>
          <button class=${'chip' + (x.representativa ? ' on' : '')} aria-pressed=${x.representativa} onClick=${() => set(i, { representativa: true })}>★ La buena</button>
          ${tomas.length > 1 && html`<button class="icon-btn" aria-label="Quitar medición" onClick=${() => setTomas(tomas.filter((_, j) => j !== i))}><${Icon} name="trash" size=${14} /></button>`}
        </div>`)}
      <button class="link small" onClick=${() => setTomas([...tomas, { valor: null, representativa: false }])}>+ Otra medición</button>
      <label>Observaciones (opcional)<input value=${nota} placeholder="Ej.: después de entrenar, tras comer…" onInput=${e => setNota(e.target.value)} /></label>
      ${validas.length > 1 && !validas.some(x => x.representativa) && html`<p class="aviso warn small">No has marcado la buena: se guardan todas, pero no saldrá en la gráfica hasta que elijas una.</p>`}
      <button class="btn" disabled=${!validas.length} onClick=${() => guardar(false)}>Guardar</button>
      ${!s0 && html`<button class="btn secondary" disabled=${!validas.length} onClick=${() => guardar(true)}>Guardar y medir otra cosa</button>`}
      ${s0 && html`<button class="btn danger" onClick=${async () => { if (confirm('¿Borrar esta medición?')) { await borrarSesion(tipo, s0.sesion); toast('Borrada'); onDone(); } }}>Borrar esta medición</button>`}
    </div>`;
}

// ---------- Gráficas (SVG sencillo, sin librerías) ----------
const W = 340, H = 150, P = 16;
function escalas(fechas, valores, desde, hasta) {
  const d0 = new Date(desde || fechas[0]).getTime(), d1 = new Date(hasta || fechas[fechas.length - 1]).getTime();
  const min = Math.min(...valores) - 0.3, max = Math.max(...valores) + 0.3;
  const x = f => P + (W - 2 * P) * ((new Date(f).getTime() - d0) / Math.max(864e5, d1 - d0));
  const y = v => P + (H - 2 * P) * (1 - (v - min) / Math.max(0.1, max - min));
  return { x, y, min, max };
}

// Peso: puntos = pesajes reales; línea continua = media de 7 días; línea discontinua = tendencia (recta)
export function GraficoPeso({ pesos, desde, hasta }) {
  const vis = pesos.filter(w => w.date >= desde && w.date <= hasta);
  if (vis.length < 2) return html`<p class="muted small">Pocos pesajes en este rango para dibujar la gráfica.</p>`;
  const media = f => { const w = pesos.filter(x => x.date >= addDays(f, -6) && x.date <= f); return w.reduce((s, x) => s + x.kg, 0) / w.length; };
  const medias = vis.map(w => ({ f: w.date, v: media(w.date) }));
  // Recta de tendencia del rango (mínimos cuadrados), solo si hay al menos una semana de datos
  const t0 = new Date(vis[0].date).getTime();
  const pts = vis.map(w => [(new Date(w.date).getTime() - t0) / 864e5, w.kg]);
  let recta = null;
  if (pts[pts.length - 1][0] >= 7 && pts.length >= 3) {
    const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    recta = [[vis[0].date, my + b * (0 - mx)], [vis[vis.length - 1].date, my + b * (pts[pts.length - 1][0] - mx)]];
  }
  const { x, y, min, max } = escalas(vis.map(w => w.date), [...vis.map(w => w.kg), ...medias.map(m => m.v), ...(recta ? recta.map(r => r[1]) : [])], vis[0].date, hasta);
  return html`
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolución del peso">
      <text x="0" y=${y(max) + 10} class="tick">${fmt(max, 1)}</text>
      <text x="0" y=${y(min) - 2} class="tick">${fmt(min, 1)}</text>
      ${vis.map(w => html`<circle cx=${x(w.date)} cy=${y(w.kg)} r="3.5" class="peso-dot"><title>${fmtDate(w.date)}: ${fmt(w.kg, 1)} kg</title></circle>`)}
      <path d=${medias.map((m, i) => `${i ? 'L' : 'M'}${x(m.f)},${y(m.v)}`).join(' ')} class="peso-line" />
      ${recta && html`<path d=${`M${x(recta[0][0])},${y(recta[0][1])} L${x(recta[1][0])},${y(recta[1][1])}`} class="tendencia-line" />`}
    </svg>
    <p class="muted small leyenda"><span class="ley-dot"></span> pesajes reales · <span class="ley-line"></span> media de 7 días (calculada)${recta ? html` · <span class="ley-trend"></span> tendencia (calculada)` : ''}</p>`;
}

// Una medida: puntos = la medida buena de cada sesión (unidos); huecos = otras tomas de esa sesión
function GraficoSerie({ serie, unidad, etiqueta }) {
  const todos = serie.flatMap(p => p.tomas);
  const { x, y, min, max } = escalas(serie.map(p => p.fecha), todos);
  const reps = serie.filter(p => p.valor != null);
  return html`
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${'Evolución de ' + etiqueta}>
      <text x="0" y=${y(max) + 10} class="tick">${fmt(max, 1)}</text>
      <text x="0" y=${y(min) - 2} class="tick">${fmt(min, 1)}</text>
      ${serie.flatMap(p => p.tomas.filter(v => v !== p.valor).map(v => html`<circle cx=${x(p.fecha)} cy=${y(v)} r="3" class="toma-dot"><title>${fmtDate(p.fecha)}: ${fmt(v, 1)} ${unidad} (otra toma)</title></circle>`))}
      ${reps.length > 1 && html`<path d=${reps.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha)},${y(p.valor)}`).join(' ')} class="medida-line" />`}
      ${reps.map(p => html`<circle cx=${x(p.fecha)} cy=${y(p.valor)} r="4" class="peso-dot"><title>${fmtDate(p.fecha)}: ${fmt(p.valor, 1)} ${unidad}</title></circle>`)}
    </svg>
    <p class="muted small leyenda"><span class="ley-dot"></span> medida que elegiste · <span class="ley-hueco"></span> otras tomas del mismo día</p>`;
}
