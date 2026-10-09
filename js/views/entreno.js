// Entreno: pegas lo que te manda la entrenadora, lo ves ordenado, usas el reloj y apuntas pesos y resultados.
import { html, useState, useMemo } from '../lib.js';
import { db, useLive } from '../db.js';
import { fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Sheet, Num, Seg, Empty, Icon, toast } from '../ui.js';
import { parsearEntreno, textoFormato, norm } from '../entreno/parser.js';
import { LEVANTAMIENTOS, BENCHMARKS } from '../entreno/datos.js';
import { RelojActivo, Relojes } from './reloj.js';

const ES_WOD = ['fortime', 'amrap', 'emom', 'intervalos', 'rondas'];

export function Entreno({ go }) {
  const [vista, setVista] = useState('dia');
  const [date, setDate] = useState(todayStr());
  const [reloj, setReloj] = useState(null); // { cfg, onResultado }
  const workouts = useLive(() => db.workouts.where('date').equals(date).toArray(), [date]);
  const marcas = useLive(() => db.marcas.toArray(), []);

  if (!workouts || !marcas) return html`<div class="loading">Cargando…</div>`;
  if (reloj) return html`<${RelojActivo} cfg=${reloj.cfg} onResultado=${reloj.onResultado} onCerrar=${() => setReloj(null)} />`;
  const isToday = date === todayStr();

  return html`
    <div class="page">
      <header class="top"><h1>Entreno</h1></header>
      <${Seg} value=${vista} onChange=${setVista} options=${[
        { value: 'dia', label: 'Día' }, { value: 'marcas', label: 'Marcas' },
        { value: 'ejercicios', label: 'Ejercicios' }, { value: 'relojes', label: 'Relojes' }]} />

      ${vista === 'dia' && html`
        <div class="day-nav">
          <button class="icon-btn" onClick=${() => setDate(addDays(date, -1))} aria-label="Día anterior"><${Icon} name="left" /></button>
          <button class="top-title" onClick=${() => setDate(todayStr())}>${isToday ? 'Hoy' : fmtDate(date, { weekday: 'long' })}
            <small>${fmtDate(date, { day: 'numeric', month: 'long' })}</small></button>
          <button class="icon-btn" onClick=${() => setDate(addDays(date, 1))} aria-label="Día siguiente"><${Icon} name="right" /></button>
        </div>
        ${workouts.length === 0 && html`<${Pegar} date=${date} />`}
        ${workouts.map(w => html`<${Workout} key=${w.id} w=${w} marcas=${marcas} onReloj=${setReloj} />`)}`}
      ${vista === 'marcas' && html`<${Marcas} marcas=${marcas} />`}
      ${vista === 'ejercicios' && html`<${Ejercicios} />`}
      ${vista === 'relojes' && html`<section class="card"><${Relojes} onIniciar=${cfg => setReloj({ cfg })} /></section>`}
    </div>`;
}

// ---------- Pegar el entreno ----------
function Pegar({ date, inicial = '', id, onDone }) {
  const [txt, setTxt] = useState(inicial);
  const vista = useMemo(() => (txt.trim() ? parsearEntreno(txt) : null), [txt]);
  const guardar = async () => {
    const datos = { date, texto: txt, parsed: vista, ts: Date.now() };
    if (id) await db.workouts.update(id, datos);
    else await db.workouts.add({ ...datos, resultados: {} });
    toast('Entreno guardado ✓');
    onDone?.();
  };
  return html`
    <section class="card form">
      <h3>${id ? 'Editar entreno' : 'Pega el entreno de tu entrenadora'}</h3>
      <p class="muted small">Copia el mensaje tal cual (WhatsApp, notas…) y pégalo aquí. La app lo ordena en secciones y prepara los relojes.</p>
      <textarea rows="10" value=${txt} onInput=${e => setTxt(e.target.value)} placeholder=${'FUERZA\nBack Squat\n5x3 @ 75%\n\nWOD\nEMOM x 12min\n1) 12 Cal row\n2) 10 Burpees'}></textarea>
      ${vista && html`<p class="muted small">Entendido: ${vista.secciones.map(s => s.titulo + (s.formato ? ` (${textoFormato(s.formato)})` : '')).join(' · ')}</p>`}
      <button class="btn" disabled=${!txt.trim()} onClick=${guardar}>Guardar entreno</button>
      ${onDone && html`<button class="btn secondary" onClick=${onDone}>Cancelar</button>`}
    </section>`;
}

// ---------- Un entreno ----------
function Workout({ w, marcas, onReloj }) {
  const [editando, setEditando] = useState(false);
  if (editando) return html`<${Pegar} date=${w.date} inicial=${w.texto} id=${w.id} onDone=${() => setEditando(false)} />`;
  const res = w.resultados || {};
  const guardarRes = async (si, cambios) => {
    const actual = (await db.workouts.get(w.id)).resultados || {};
    await db.workouts.update(w.id, { resultados: { ...actual, [si]: { ...(actual[si] || {}), ...cambios } } });
  };
  const hechas = w.parsed.secciones.filter((s, i) => res[i]?.hecho).length;

  return html`
    <p class="muted small center">${hechas}/${w.parsed.secciones.length} secciones hechas</p>
    ${w.parsed.secciones.map((s, si) => html`
      <${Seccion} key=${si} s=${s} si=${si} r=${res[si] || {}} marcas=${marcas} onReloj=${onReloj}
        onGuardar=${c => guardarRes(si, c)} />`)}
    <div class="inline">
      <button class="btn secondary" onClick=${() => setEditando(true)}><${Icon} name="pen" size=${16} /> Editar texto</button>
      <button class="btn danger" onClick=${() => confirm('¿Borrar este entreno y sus resultados?') && db.workouts.delete(w.id)}><${Icon} name="trash" size=${16} /> Borrar</button>
    </div>`;
}

function Seccion({ s, si, r, marcas, onReloj, onGuardar }) {
  const esWod = s.formato && ES_WOD.includes(s.formato.tipo);
  const relojSeccion = s.formato && {
    cfg: s.formato,
    onResultado: esWod ? x => onGuardar({
      tiempo: s.formato.tipo === 'fortime' || s.formato.tipo === 'rondas' ? mmss(x.segundos) : r.tiempo,
      rondas: x.rondas || r.rondas, hecho: true,
    }) : null,
  };
  return html`
    <section class=${'card seccion' + (r.hecho ? ' hecha' : '')}>
      <header class="meal-head">
        <div><h3>${s.titulo}</h3>${s.formato && html`<small class="muted">${textoFormato(s.formato)}</small>`}</div>
        ${relojSeccion && html`<button class="btn small" onClick=${() => onReloj(relojSeccion)}><${Icon} name="bolt" size=${16} /> Reloj</button>`}
      </header>
      ${s.partes.map((p, pi) => html`
        <div class="parte">
          ${(p.titulo || (p.formato && p.formato !== s.formato)) && html`
            <div class="parte-tit">
              <b>${p.titulo}</b>
              ${p.formato && p.formato !== s.formato && html`
                <button class="chip" onClick=${() => onReloj({ cfg: p.formato })}><${Icon} name="bolt" size=${13} /> ${textoFormato(p.formato)}</button>`}
            </div>`}
          ${p.lineas.map((l, li) => html`
            <${Linea} l=${l} clave=${`${pi}-${li}`} r=${r} marcas=${marcas} onGuardar=${onGuardar} />`)}
          ${p.links?.map(u => html`<a class="video" href=${u} target="_blank" rel="noopener">▶ Ver vídeo</a>`)}
        </div>`)}
      <${Resultado} s=${s} r=${r} esWod=${esWod} onGuardar=${onGuardar} />
    </section>`;
}

function Linea({ l, clave, r, marcas, onGuardar }) {
  const rm = l.base ? mejor1RM(marcas, l.base.id) : null;
  const kgSugerido = i => {
    if (l.kg) return l.kg;
    if (!rm || !l.pct) return null;
    const p = l.pct.length === l.series ? l.pct[i] : l.pct[0];
    return Math.round((rm * p) / 100);
  };
  const rango = rm && l.pct ? l.pct.map(p => Math.round((rm * p) / 100)) : null;
  return html`
    <div class="linea">
      <div>${l.texto}${l.prescripcion && html` <b>${l.prescripcion}</b>`}</div>
      ${l.pct && l.base && html`<small class=${rm ? 'pct' : 'muted'}>
        ${rm ? `${l.pct.join('-')}% de tu ${nombreLev(l.base.id)} (${rm} kg) = ${[...new Set(rango)].join('-')} kg`
             : `Apunta tu 1RM de ${nombreLev(l.base.id)} en Marcas para calcular los kilos`}</small>`}
      ${l.links?.map(u => html` <a class="video" href=${u} target="_blank" rel="noopener">▶ vídeo</a>`)}
      ${l.series && html`<${Series} l=${l} clave=${clave} r=${r} kgSugerido=${kgSugerido} marcas=${marcas} onGuardar=${onGuardar} />`}
    </div>`;
}

// Apuntar los kilos de cada serie (y detectar récords)
function Series({ l, clave, r, kgSugerido, marcas, onGuardar }) {
  const guardadas = r.series?.[clave];
  const [abierto, setAbierto] = useState(false);
  // kg: null = usar el sugerido (se recalcula si cambia tu 1RM)
  const [filas, setFilas] = useState(() => guardadas
    || Array.from({ length: l.series }, () => ({ kg: null, reps: l.reps })));
  const kgDe = (f, i) => f.kg ?? kgSugerido(i);
  const set = (i, k, v) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  if (!abierto) {
    return html`
      <div class="series-resumen">
        ${guardadas ? html`<small class="pct">✓ ${guardadas.filter(f => f.kg).map(f => `${fmt(f.kg, 1)}×${f.reps}`).join(' · ')}</small>` : ''}
        <button class="chip" onClick=${() => setAbierto(true)}>${guardadas ? 'Editar kilos' : `Apuntar kilos (${l.series} series)`}</button>
      </div>`;
  }
  const guardar = async () => {
    const final = filas.map((f, i) => ({ kg: kgDe(f, i), reps: f.reps }));
    await onGuardar({ series: { ...(r.series || {}), [clave]: final } });
    setAbierto(false);
    const filas_ = final;
    // ¿Récord? Solo si el ejercicio es el levantamiento "puro" (un Squat Snatch cuenta para Snatch)
    if (l.base?.puro) {
      for (const f of filas_) {
        if (!f.kg || !f.reps) continue;
        const prev = Math.max(0, ...marcas.filter(m => m.ejercicio === l.base.id && m.reps === f.reps).map(m => m.kg));
        if (f.kg > prev) {
          await db.marcas.add({ tipo: 'fuerza', ejercicio: l.base.id, kg: f.kg, reps: f.reps, date: todayStr() });
          toast(`🏆 ¡Récord! ${nombreLev(l.base.id)} ${f.reps}RM: ${fmt(f.kg, 1)} kg`);
          return;
        }
      }
    }
    toast('Series guardadas ✓');
  };
  return html`
    <div class="series">
      ${filas.map((f, i) => html`
        <div class="serie">
          <span class="muted small">S${i + 1}</span>
          <${Num} value=${kgDe(f, i)} onChange=${v => set(i, 'kg', v)} suffix="kg" />
          <${Num} value=${f.reps} onChange=${v => set(i, 'reps', v)} suffix="reps" />
        </div>`)}
      <button class="btn small secondary" onClick=${guardar}>${guardadas ? 'Actualizar series' : 'Guardar series'}</button>
    </div>`;
}

// Resultado de la sección: tiempo / rondas, esfuerzo (RPE) y notas
function Resultado({ s, r, esWod, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return html`
    <div class="resultado-linea">
      ${r.hecho ? html`<span class="tag ok">✓ Hecho</span>` : ''}
      ${r.tiempo && html`<span class="tag">${r.tiempo}</span>`}
      ${r.rondas ? html`<span class="tag">${r.rondas} rondas${r.reps ? ` + ${r.reps}` : ''}</span>` : ''}
      ${r.rpe && html`<span class="tag">RPE ${r.rpe}</span>`}
      <button class="link" onClick=${() => setAbierto(true)}>${r.hecho ? 'Editar resultado' : 'Apuntar resultado'}</button>
    </div>`;
  const tipo = s.formato?.tipo;
  return html`
    <div class="form resultado">
      ${esWod && (tipo === 'fortime' || tipo === 'rondas' || tipo === 'intervalos') && html`
        <label>Tiempo (mm:ss)<input value=${r.tiempo || ''} placeholder="12:34" inputmode="numeric" onInput=${e => onGuardar({ tiempo: e.target.value })} /></label>`}
      ${esWod && tipo === 'amrap' && html`
        <div class="grid2">
          <label>Rondas<${Num} value=${r.rondas} onChange=${v => onGuardar({ rondas: v })} /></label>
          <label>+ Reps<${Num} value=${r.reps} onChange=${v => onGuardar({ reps: v })} /></label>
        </div>`}
      <label>¿Cómo de duro fue? (RPE 1-10)
        <div class="chips wrap">${[5, 6, 7, 8, 9, 10].map(n => html`
          <button class=${'chip' + (r.rpe === n ? ' on' : '')} onClick=${() => onGuardar({ rpe: n })}>${n}</button>`)}</div>
      </label>
      <label>Notas<textarea rows="2" value=${r.notas || ''} placeholder="Escalado, molestias, sensaciones…" onInput=${e => onGuardar({ notas: e.target.value })}></textarea></label>
      <button class="btn" onClick=${() => { onGuardar({ hecho: true }); setAbierto(false); toast('¡Hecho! ✓'); }}>Marcar como hecho</button>
    </div>`;
}

// ---------- Marcas: 1RM y benchmarks ----------
function Marcas({ marcas }) {
  const [tab, setTab] = useState('fuerza');
  const [sel, setSel] = useState(null);
  const lista = tab === 'fuerza' ? LEVANTAMIENTOS : BENCHMARKS;
  return html`
    <${Seg} value=${tab} onChange=${setTab} options=${[{ value: 'fuerza', label: 'Fuerza (RM)' }, { value: 'bench', label: 'Benchmarks' }]} />
    <section class="card list">
      ${lista.map(x => {
        const mias = marcas.filter(m => m.ejercicio === x.id);
        const valor = tab === 'fuerza' ? (mejor1RM(marcas, x.id) ? `${fmt(mejor1RM(marcas, x.id), 1)} kg` : mias.length ? 'sin 1RM' : '—')
          : mejorBench(mias, x.tipo) || '—';
        return html`
          <button class="row" onClick=${() => setSel(x)}>
            <span class="grow">${x.name}${tab === 'bench' ? html`<br /><small class="muted">${x.desc}</small>` : ''}</span>
            <b>${valor}</b>
          </button>`;
      })}
    </section>
    <${Sheet} open=${!!sel} onClose=${() => setSel(null)} title=${sel?.name}>
      ${sel && html`<${MarcaDetalle} x=${sel} tipo=${tab} marcas=${marcas.filter(m => m.ejercicio === sel.id)} />`}
    <//>`;
}

function MarcaDetalle({ x, tipo, marcas }) {
  const [kg, setKg] = useState(null), [reps, setReps] = useState(1), [resultado, setResultado] = useState(''), [fecha, setFecha] = useState(todayStr());
  const add = async () => {
    if (tipo === 'fuerza') await db.marcas.add({ tipo: 'fuerza', ejercicio: x.id, kg, reps, date: fecha });
    else await db.marcas.add({ tipo: 'bench', ejercicio: x.id, resultado, valor: valorBench(resultado, x.tipo), date: fecha });
    setKg(null); setResultado('');
    toast('Marca guardada ✓');
  };
  const rm = tipo === 'fuerza' ? mejor1RM(marcas, x.id) : null;
  return html`
    <div class="form">
      ${x.desc && html`<p class="muted small">${x.desc}</p>`}
      ${rm && html`
        <div class="preview"><b>Tus porcentajes (1RM ${fmt(rm, 1)} kg)</b>
          <div class="pct-grid">${[50, 60, 65, 70, 75, 80, 85, 90, 95, 100].map(p => html`<span>${p}%<b>${Math.round((rm * p) / 100)}</b></span>`)}</div>
        </div>`}
      <h4>Nueva marca</h4>
      ${tipo === 'fuerza' ? html`
        <div class="grid2">
          <label>Kilos<${Num} value=${kg} onChange=${setKg} suffix="kg" /></label>
          <label>Repeticiones<${Num} value=${reps} onChange=${setReps} suffix="RM" /></label>
        </div>` : html`
        <label>${x.tipo === 'amrap' ? 'Rondas + reps (ej: 18+5)' : 'Tiempo (ej: 4:35)'}<input value=${resultado} onInput=${e => setResultado(e.target.value)} /></label>`}
      <label>Fecha<input type="date" value=${fecha} onInput=${e => setFecha(e.target.value)} /></label>
      <button class="btn" disabled=${tipo === 'fuerza' ? !kg || !reps : !resultado.trim()} onClick=${add}>Guardar</button>
      <h4>Historial</h4>
      ${marcas.length === 0 && html`<p class="muted small">Aún no hay marcas.</p>`}
      <table class="ntable">
        ${[...marcas].sort((a, b) => b.date.localeCompare(a.date)).map(m => html`
          <tr><td>${fmtDate(m.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
            <td>${tipo === 'fuerza' ? `${fmt(m.kg, 1)} kg × ${m.reps}` : m.resultado}</td>
            <td><button class="icon-btn" aria-label="Borrar" onClick=${() => db.marcas.delete(m.id)}><${Icon} name="trash" size=${14} /></button></td></tr>`)}
      </table>
    </div>`;
}

// ---------- Ejercicios: todo lo que has hecho, con vídeos y pesos ----------
function Ejercicios() {
  const workouts = useLive(() => db.workouts.toArray(), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  if (!workouts) return html`<div class="loading">Cargando…</div>`;
  const mapa = {};
  for (const w of workouts) {
    w.parsed.secciones.forEach((s, si) => s.partes.forEach((p, pi) => p.lineas.forEach((l, li) => {
      for (const nombre of l.ejercicios || []) {
        const k = norm(nombre);
        const e = mapa[k] ||= { nombre, veces: 0, ultima: '', links: new Set(), historial: [] };
        e.veces++;
        if (w.date > e.ultima) e.ultima = w.date;
        (l.links || []).forEach(u => e.links.add(u));
        const series = w.resultados?.[si]?.series?.[`${pi}-${li}`];
        e.historial.push({ date: w.date, texto: l.texto + (l.prescripcion ? ' ' + l.prescripcion : ''), series });
      }
    })));
  }
  const lista = Object.values(mapa).filter(e => norm(e.nombre).includes(norm(q))).sort((a, b) => b.veces - a.veces);
  if (!workouts.length) return html`<${Empty}>Cuando pegues entrenos, aquí aparecerán todos tus ejercicios con sus vídeos y los kilos que usaste.<//>`;
  return html`
    <input class="search" placeholder="Buscar ejercicio…" value=${q} onInput=${e => setQ(e.target.value)} />
    <section class="card list">
      ${lista.map(e => html`
        <button class="row" onClick=${() => setSel(e)}>
          <span class="grow">${e.nombre}${e.links.size ? html` <span class="tag">vídeo</span>` : ''}</span>
          <small class="muted">${e.veces}× · ${fmtDate(e.ultima, { day: 'numeric', month: 'short' })}</small>
        </button>`)}
    </section>
    <${Sheet} open=${!!sel} onClose=${() => setSel(null)} title=${sel?.nombre}>
      ${sel && html`
        <div class="form">
          ${[...sel.links].map(u => html`<a class="btn secondary" href=${u} target="_blank" rel="noopener">▶ Ver vídeo</a>`)}
          <h4>Historial</h4>
          <table class="ntable">
            ${[...sel.historial].sort((a, b) => b.date.localeCompare(a.date)).map(h => html`
              <tr><td>${fmtDate(h.date, { day: 'numeric', month: 'short' })}</td>
                <td>${h.texto}${h.series ? html`<br /><small class="pct">${h.series.filter(x => x.kg).map(x => `${fmt(x.kg, 1)}×${x.reps}`).join(' · ')}</small>` : ''}</td></tr>`)}
          </table>
        </div>`}
    <//>`;
}

// ---------- utilidades ----------
export function mejor1RM(marcas, id) {
  const v = marcas.filter(m => m.tipo === 'fuerza' && m.ejercicio === id && m.reps === 1).map(m => m.kg);
  return v.length ? Math.max(...v) : null;
}
const nombreLev = id => LEVANTAMIENTOS.find(L => L.id === id)?.name || id;
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function valorBench(txt, tipo) {
  if (tipo === 'amrap') { const [r, e] = txt.split('+').map(x => parseInt(x) || 0); return r * 1000 + e; }
  const [m, s] = txt.split(':').map(x => parseInt(x) || 0);
  return m * 60 + s;
}
function mejorBench(mias, tipo) {
  if (!mias.length) return null;
  const best = [...mias].sort((a, b) => (tipo === 'amrap' ? b.valor - a.valor : a.valor - b.valor))[0];
  return best.resultado;
}
