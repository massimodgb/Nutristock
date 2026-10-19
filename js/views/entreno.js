// Entreno: pegas lo que te manda la entrenadora, lo ves ordenado, usas el reloj y apuntas pesos y resultados.
import { html, useState, useMemo } from '../lib.js';
import { db, useLive, getSetting, setSetting } from '../db.js';
import { fmt, todayStr, addDays, fmtDate } from '../nutri.js';
import { Sheet, Num, Seg, Empty, Icon, toast } from '../ui.js';
import { parsearEntreno, textoFormato, norm, claveEjercicio, implemento, modoPct } from '../entreno/parser.js';
import { parsearEntrenoV1 } from '../entreno/parser-v1.js';
import { LEVANTAMIENTOS, BENCHMARKS } from '../entreno/datos.js';
import { RelojActivo, Relojes } from './reloj.js';
import { idRM, nombreRM, mejorRM, referenciaLinea, planSeries, cfgEntreno, redondear } from '../entreno/rm.js';

const ES_WOD = ['fortime', 'amrap', 'emom', 'intervalos', 'rondas', 'bloques', 'segmentos'];

export function Entreno({ go, inicial }) {
  const [vista, setVista] = useState(inicial || 'dia');
  const [date, setDate] = useState(todayStr());
  const [reloj, setReloj] = useState(null); // { cfg, onResultado }
  const workouts = useLive(() => db.workouts.where('date').equals(date).toArray(), [date]);
  const marcas = useLive(() => db.marcas.toArray(), []);
  const todos = useLive(() => db.workouts.toArray(), []);
  const propios = useLive(() => db.ejercicios.toArray(), []);
  const ajustes = useLive(() => getSetting('entreno', {}), []);

  if (!workouts || !marcas || !todos || !propios || !ajustes) return html`<div class="loading">Cargando…</div>`;
  const hist = historialPesos(todos, alias(propios));
  if (reloj) return html`<${RelojActivo} cfg=${reloj.cfg} onResultado=${reloj.onResultado} onCerrar=${() => setReloj(null)} />`;
  const isToday = date === todayStr();
  const cfg = cfgEntreno(ajustes);

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
        <${Semana} date=${date} todos=${todos} onDia=${setDate} />
        ${workouts.length === 0 && html`<${Pegar} date=${date} marcas=${marcas} cfg=${cfg} />`}
        ${workouts.map(w => html`<${Workout} key=${w.id} w=${w} marcas=${marcas} hist=${hist} cfg=${cfg} onReloj=${setReloj} />`)}`}
      ${vista === 'marcas' && html`<${Marcas} marcas=${marcas} cfg=${cfg} />`}
      ${vista === 'ejercicios' && html`<${Ejercicios} />`}
      ${vista === 'relojes' && html`<section class="card"><${Relojes} onIniciar=${cfg => setReloj({ cfg })} /></section>`}
    </div>`;
}

// ---------- Pegar el entreno (con revisión antes de guardar) ----------
function Pegar({ date, inicial = '', id, tieneRes, marcas = [], cfg, onDone }) {
  const [txt, setTxt] = useState(inicial);
  const [refs, setRefs] = useState({});
  const vista = useMemo(() => (txt.trim() ? parsearEntreno(txt) : null), [txt]);
  const guardar = async () => {
    // Si ya tenía resultados, se congela la lectura nueva para que no se muevan al volver a leer
    const datos = { date, texto: txt, parsed: vista, ts: Date.now(), estructura: tieneRes ? vista : null };
    if (id) await db.workouts.update(id, { ...datos, refs: { ...((await db.workouts.get(id))?.refs || {}), ...refs } });
    else await db.workouts.add({ ...datos, resultados: {}, refs });
    toast('Entreno guardado ✓');
    onDone?.();
  };
  return html`
    <section class="card form">
      <h3>${id ? 'Editar entreno' : 'Pega el entreno de tu entrenadora'}</h3>
      <p class="muted small">Copia el mensaje tal cual (WhatsApp, notas…) y pégalo aquí. Antes de guardar verás cómo lo he entendido.</p>
      <textarea rows="10" value=${txt} onInput=${e => setTxt(e.target.value)} placeholder=${'FUERZA\nBack Squat\n5x3 @ 75%\n\nWOD\nEMOM x 12min\n1) 12 Cal row\n2) 10 Burpees'}></textarea>
      ${id && tieneRes && html`<p class="aviso warn small">Este entreno ya tiene resultados apuntados. Si cambias el orden de las líneas, revisa luego que cada peso siga en su ejercicio.</p>`}
      ${vista && html`<${Revision} p=${vista} marcas=${marcas} cfg=${cfg} refs=${refs} onRef=${(k, v) => setRefs({ ...refs, [k]: v })} />`}
      <button class="btn" disabled=${!txt.trim()} onClick=${guardar}>${vista ? 'Está bien: guardar entreno' : 'Guardar entreno'}</button>
      ${onDone && html`<button class="btn secondary" onClick=${onDone}>Cancelar</button>`}
    </section>`;
}

// Cómo ha entendido el texto: secciones, tipo de cada línea, series, % y kilos, y avisos
const ETIQ_TIPO = { ejercicio: 'Ejercicio', complejo: 'Complejo', instruccion: 'Instrucción', encabezado: 'Título', formato: 'Formato' };
function Revision({ p, marcas, cfg, refs, onRef }) {
  return html`
    <div class="revision">
      <h4>Así lo he entendido</h4>
      ${p.secciones.map((s, si) => html`
        <div class="rev-sec" key=${si}>
          <b>${s.titulo}</b>${s.formato && html` <small class="muted">· ${textoFormato(s.formato)}</small>`}
          ${s.partes.map((pa, pi) => pa.lineas.map((l, li) => {
            const key = `${si}-${pi}-${li}`;
            const ref = l.pct?.length ? referenciaLinea(l, marcas, cfg, refs[key]) : null;
            const plan = (l.series || l.tipo === 'complejo') ? planSeries(l, ref, cfg) : null;
            return html`
              <div class=${'rev-l ' + l.tipo} key=${key}>
                <span class="rev-tipo">${ETIQ_TIPO[l.tipo] || 'Ejercicio'}</span>
                <span class="grow">${l.tipo === 'complejo' ? (l.movimientos || []).map(m => `${m.reps || ''} ${m.nombre}`.trim()).join(' + ') : l.texto}
                  ${l.series ? html`<small class="muted"> · ${l.series} × ${l.reps || '?'}</small>` : ''}
                  ${l.descanso ? html`<small class="muted"> · descanso ${mmss(l.descanso)}</small>` : ''}
                  ${l.pct?.length ? html`<br /><small>${textoPct(l)}${ref?.kg ? ` de ${ref.nombre} (${fmt(ref.kg, 1)} kg)` : ''}${plan?.some(x => x.kg) ? ` → ${[...new Set(plan.map(x => fmt(x.kg, 1)))].join(' / ')} kg` : ''}</small>` : ''}
                  ${l.pctModo === 'dudoso' ? html`<br /><small class="aviso-rm">${l.pct.length} porcentajes para ${l.series} series: revisa la pauta.</small>` : ''}
                  ${ref && html`<${AvisoRef} base=${ref} l=${l} marcas=${marcas} elegida=${refs[key]} onRef=${v => onRef(key, v)} compacto=${true} />`}
                </span>
              </div>`;
          }))}
        </div>`)}
    </div>`;
}

const textoPct = l => (l.pctModo === 'rango' ? `${fmt(l.pct[0], 1)}-${fmt(l.pct[1], 1)}%` : `${l.pct.map(x => fmt(x, 1)).join(' / ')}%`);

// ---------- Un entreno ----------
const tieneResultados = w => Object.values(w.resultados || {}).some(r => r && Object.keys(r).length);
function Workout({ w, marcas, hist, cfg, onReloj }) {
  const [editando, setEditando] = useState(false);
  if (editando) return html`<${Pegar} date=${w.date} inicial=${w.texto} id=${w.id} tieneRes=${tieneResultados(w)} marcas=${marcas} cfg=${cfg} onDone=${() => setEditando(false)} />`;
  const res = w.resultados || {};
  const lectura = leer(w);
  const guardarRes = async (si, cambios) => {
    const actual = await db.workouts.get(w.id);
    const r = actual.resultados || {};
    // Al apuntar el primer resultado se congela la lectura: así los pesos no se descolocan si el lector cambia
    await db.workouts.update(w.id, {
      resultados: { ...r, [si]: { ...(r[si] || {}), ...cambios } },
      ...(actual.estructura ? {} : { estructura: lectura }),
    });
  };
  const ponerRef = async (key, id) => {
    const actual = await db.workouts.get(w.id);
    await db.workouts.update(w.id, { refs: { ...(actual.refs || {}), [key]: id }, ...(actual.estructura ? {} : { estructura: lectura }) });
  };
  const hechas = lectura.secciones.filter((s, i) => res[i]?.hecho).length;

  return html`
    <p class="muted small center">${hechas}/${lectura.secciones.length} secciones hechas</p>
    ${lectura.secciones.map((s, si) => html`
      <${Seccion} key=${si} s=${s} si=${si} r=${res[si] || {}} marcas=${marcas} hist=${hist} date=${w.date} cfg=${cfg} refs=${w.refs || {}}
        onRef=${ponerRef} onReloj=${onReloj} onGuardar=${c => guardarRes(si, c)} />`)}
    <div class="inline">
      <button class="btn secondary" onClick=${() => setEditando(true)}><${Icon} name="pen" size=${16} /> Editar texto</button>
      <button class="btn danger" onClick=${() => confirm('¿Borrar este entreno y sus resultados?') && db.workouts.delete(w.id)}><${Icon} name="trash" size=${16} /> Borrar</button>
    </div>`;
}

function Seccion({ s, si, r, marcas, hist, date, cfg, refs, onRef, onReloj, onGuardar }) {
  const esWod = s.formato && ES_WOD.includes(s.formato.tipo);
  const relojSeccion = s.formato && {
    cfg: s.formato,
    onResultado: !esWod ? null : s.formato.tipo === 'bloques' || s.formato.tipo === 'segmentos'
      // Varios bloques: guardamos el resultado de cada uno ("9:41 · 11:02" o "5 · 4 · 4 rondas")
      ? x => onGuardar({
        porBloque: s.formato.sub === 'fortime'
          ? x.bloques.map(b => (b.tiempo != null ? mmss(b.tiempo) : 'cap')).join(' · ')
          : x.bloques.map(b => b.rondas).join(' · ') + ' rondas', // AMRAP en bloques o tramos por minutos
        hecho: true,
      })
      : x => onGuardar({
        tiempo: s.formato.tipo === 'fortime' || s.formato.tipo === 'rondas' ? mmss(x.segundos) : r.tiempo,
        rondas: x.rondas || r.rondas, hecho: true,
      }),
  };
  // Al marcar la sección como hecha, se guardan como hechas las series de la pauta que no hayas apuntado
  const completar = async () => {
    const series = { ...(r.series || {}) }, pesos = { ...(r.pesos || {}) };
    const nuevos = [];
    s.partes.forEach((p, pi) => p.lineas.forEach((l, li) => {
      const k = `${pi}-${li}`, nombre = l.ejercicios?.[0];
      if (!nombre || l.tipo === 'instruccion' || l.tipo === 'encabezado') return;
      const pa = pautaLinea(l, marcas, cfg, refs[`${si}-${k}`]);
      const guardadas = series[k] || [];
      if (pa.series && pa.series.every(x => x.kg)) {
        const filas = pa.series.map((plan, i) => guardadas[i] || { kg: plan.kg, reps: plan.reps, estado: 'hecha', plan: planGuardado(plan) });
        if (filas.some((f, i) => f !== guardadas[i])) { series[k] = filas; if (l.tipo !== 'complejo') nuevos.push([nombre, filas]); }
      } else if (!l.series && l.tipo !== 'complejo' && pa.kg && !pesos[k]) {
        pesos[k] = { kg: pa.kg, reps: l.repsLinea || null };
        if (l.repsLinea) nuevos.push([nombre, [pesos[k]]]);
      }
    }));
    await onGuardar({ series, pesos, hecho: true });
    for (const [n, f] of nuevos) await registrarRecords(n, f, marcas);
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
            <${Linea} l=${l} clave=${`${pi}-${li}`} r=${r} marcas=${marcas} hist=${hist} date=${date} cfg=${cfg}
              elegida=${refs[`${si}-${pi}-${li}`]} onRef=${id => onRef(`${si}-${pi}-${li}`, id)} onGuardar=${onGuardar} />`)}
          ${p.links?.map(u => html`<a class="video" href=${u} target="_blank" rel="noopener">▶ Ver vídeo</a>`)}
        </div>`)}
      <${Resultado} s=${s} r=${r} esWod=${esWod} onGuardar=${onGuardar} onHecho=${completar} />
    </section>`;
}

// Lo que te toca levantar en una línea: base de los % (RM, TM o la que elijas), kilos de cada serie
// (valor teórico y redondeado a lo que se puede montar) o el peso que pone el texto
export function pautaLinea(l, marcas, cfg, elegida) {
  const linea = l.pctModo || !l.pct?.length ? l : { ...l, pctModo: modoPct(l.pct, l.series, false) }; // entrenos leídos con el lector antiguo
  const ref = linea.pct?.length ? referenciaLinea(linea, marcas, cfg, elegida) : null;
  const series = (linea.series || (linea.tipo === 'complejo' && linea.pct?.length)) ? planSeries(linea, ref, cfg) : null;
  return { rm: ref, series, kg: linea.series ? null : linea.kg || null };
}
const planGuardado = p => ({ kg: p.kg ?? null, teorico: p.teorico != null ? Math.round(p.teorico * 100) / 100 : null, pct: p.pct ?? null, reps: p.reps ?? null });

// Aviso y elección de la base de los %: sin RM, solo estimado, complejo sin referencia, o RM de otro levantamiento
// (la prop se llama "base" y no "ref": Preact reserva "ref")
function AvisoRef({ base: ref, l, marcas, elegida, onRef, compacto }) {
  const [kg, setKg] = useState(null);
  const [cambiar, setCambiar] = useState(false);
  const chips = html`
    <div class="chips wrap">${(ref.candidatos || []).map(id => {
      const rm = mejorRM(marcas, id);
      return html`<button class=${'chip' + ((elegida || ref.id) === id ? ' on' : '')} onClick=${() => { onRef(id); setCambiar(false); }}>
        ${nombreRM(id, marcas)}${rm ? ` · ${rm.estimado ? '≈' : ''}${fmt(rm.kg, 1)} kg` : ' · sin RM'}</button>`;
    })}</div>`;
  if (ref.dudosa) return html`<div class="ref-aviso"><small>¿Sobre qué RM se calculan los %? El texto no lo dice: elígelo.</small>${chips}</div>`;
  const guardarRM = async () => {
    await db.marcas.add({ tipo: 'fuerza', ejercicio: ref.id, nombre: ref.nombre, kg, reps: 1, date: todayStr() });
    toast(`RM de ${ref.nombre}: ${fmt(kg, 1)} kg guardado ✓`);
  };
  const aceptarEstimado = async () => {
    const c = await getSetting('entreno', {});
    await setSetting('entreno', { ...c, estimados: { ...(c.estimados || {}), [ref.id]: true } });
    toast(`Usaré el 1RM estimado de ${ref.nombre}`);
  };
  return html`
    <div class="ref-aviso">
      ${ref.kg ? html`<small class="muted">${ref.fuente === 'tm' ? 'Training Max' : ref.fuente === 'estimado' ? '1RM estimado' : 'RM'} de ${ref.nombre}: <b>${fmt(ref.kg, 1)} kg</b>${ref.fuente === 'estimado' && ref.desde ? ` (de ${ref.desde})` : ''}</small>
        ${!ref.propia && !elegida && l.ejercicios?.[0] && !l.pctDe ? html`<br /><small class="aviso-rm">No tienes RM de ${l.ejercicios[0]}: uso el de ${ref.nombre}.</small>` : ''}`
      : ref.estimado ? html`<small class="aviso-rm">Solo tienes un 1RM estimado de ${ref.nombre}: ≈ ${fmt(ref.estimado.kg, 1)} kg (de ${ref.estimado.desde}). No lo uso sin tu permiso.</small>
          <button class="chip" onClick=${aceptarEstimado}>Usar el estimado</button>`
      : html`<small class="aviso-rm">No tienes RM de ${ref.nombre || 'este ejercicio'}: no calculo los kilos (no me los invento).</small>
          ${!compacto && ref.id && html`<div class="inline ref-rm"><${Num} value=${kg} onChange=${setKg} suffix="kg 1RM" /><button class="btn small" disabled=${!(kg > 0)} onClick=${guardarRM}>Guardar RM</button></div>`}`}
      ${(ref.candidatos || []).length > 1 && (cambiar ? chips : html`<button class="link small" onClick=${() => setCambiar(true)}>Cambiar la referencia</button>`)}
    </div>`;
}

function Linea({ l, clave, r, marcas, hist, date, cfg, elegida, onRef, onGuardar }) {
  if (l.tipo === 'instruccion') return html`<div class="linea instruccion">${l.texto}</div>`;
  if (l.tipo === 'encabezado') return html`<div class="linea encabezado">${l.texto}</div>`;
  if (l.tipo === 'formato') return html`<div class="linea formato">${l.texto}${l.descanso ? html` <span class="tag">descanso ${mmss(l.descanso)}</span>` : ''}</div>`;
  const pauta = pautaLinea(l, marcas, cfg, elegida);
  const rm = pauta.rm;
  const propio = l.ejercicios?.[0];
  const nombre = l.tipo === 'complejo' ? (l.movimientos || []).map(m => `${m.reps || ''} ${m.nombre}`.trim()).join(' + ') : null;
  const carga = !pauta.series && pauta.kg ? `${l.repsLinea ? `${l.repsLinea} reps  ·  ` : ''}${fmt(pauta.kg, 1)} kg` : null;
  return html`
    <div class=${'linea' + (l.tipo === 'complejo' ? ' complejo' : '')}>
      ${l.tipo === 'complejo'
        ? html`<div><span class="tag">Complejo</span> <b>${nombre}</b>${l.series ? html` <small class="muted">· ${l.series} series${l.intervalo ? ` · cada ${mmss(l.intervalo)}` : ''}</small>` : ''}</div>`
        : html`<div>${l.texto}${l.prescripcion && html` <b>${l.prescripcion}</b>`}</div>`}
      ${l.descanso && html`<small class="muted">Descanso ${mmss(l.descanso)} entre series</small>`}
      ${carga && html`<div class="carga"><${Icon} name="pesa" size=${16} /> <b>${propio ? `${propio}: ` : ''}${carga}</b></div>`}
      ${l.pct?.length > 0 && html`<small class="pct">${textoPct(l)}${l.pctModo === 'dudoso' ? html` <span class="aviso-rm">(${l.pct.length} % para ${l.series} series: revisa)</span>` : ''}</small>`}
      ${rm && html`<${AvisoRef} base=${rm} l=${l} marcas=${marcas} elegida=${elegida} onRef=${onRef} />`}
      ${l.links?.map(u => html` <a class="video" href=${u} target="_blank" rel="noopener">▶ vídeo</a>`)}
      ${propio && l.tipo !== 'complejo' && html`<${UltimaVez} lista=${hist[claveEjercicio(propio)]} date=${date} />`}
      ${pauta.series && html`<${Series} l=${l} clave=${clave} r=${r} plan=${pauta.series} marcas=${marcas} onGuardar=${onGuardar} />`}
      ${!pauta.series && propio && l.tipo !== 'complejo' && html`<${PesoLinea} l=${l} clave=${clave} r=${r} marcas=${marcas} ultimo=${hist[claveEjercicio(propio)]?.find(h => h.date < date)} onGuardar=${onGuardar} />`}
    </div>`;
}

// Series una a una: la serie actual destacada, kilos y reps reales, hecha / incompleta / fallida, nota.
// Se guarda cada serie al momento (con su plan) para ver planificado frente a hecho.
const estadoDe = f => (!f ? null : f.estado || (f.kg != null ? 'hecha' : null)); // las antiguas {kg, reps} cuentan como hechas
const ESTADOS = [{ id: 'hecha', label: 'Hecha' }, { id: 'incompleta', label: 'Incompleta' }, { id: 'fallida', label: 'Fallida' }];
function Series({ l, clave, r, plan, marcas, onGuardar }) {
  const guardadas = r.series?.[clave] || [];
  const [edit, setEdit] = useState(null); // { i, kg, reps, estado, nota }
  const complejo = l.tipo === 'complejo';
  const actual = plan.findIndex((_, i) => !estadoDe(guardadas[i]));
  const guardarSerie = async (i, datos) => {
    const arr = Array.from({ length: Math.max(plan.length, guardadas.length) }, (_, j) => guardadas[j] || null);
    arr[i] = datos ? { ...datos, plan: planGuardado(plan[i]) } : null;
    await onGuardar({ series: { ...(r.series || {}), [clave]: arr } });
    setEdit(null);
    if (datos?.estado === 'hecha' && !complejo && l.ejercicios?.[0] && datos.kg && datos.reps) {
      if (!(await registrarRecords(l.ejercicios[0], [datos], marcas))) toast(`Serie ${i + 1} ✓`);
    } else toast(datos ? `Serie ${i + 1}: ${ESTADOS.find(e => e.id === datos.estado)?.label.toLowerCase()}` : 'Serie borrada');
  };
  const todasAsi = async () => {
    const arr = plan.map((p, i) => guardadas[i] || { kg: p.kg, reps: p.reps, estado: 'hecha', plan: planGuardado(p) });
    await onGuardar({ series: { ...(r.series || {}), [clave]: arr } });
    if (!complejo && l.ejercicios?.[0] && !(await registrarRecords(l.ejercicios[0], arr, marcas))) toast('Series guardadas ✓');
  };
  const abrir = i => {
    const g = guardadas[i], p = plan[i];
    setEdit({ i, kg: g?.kg ?? p.kg, reps: g?.reps ?? p.reps, estado: estadoDe(g) || 'hecha', nota: g?.nota || '' });
  };
  const completas = plan.every(p => p.kg);
  return html`
    <div class="series-v3">
      ${plan.map((p, i) => {
        const g = guardadas[i], est = estadoDe(g);
        const distinto = g && (g.kg !== p.kg || (g.reps !== p.reps && !complejo));
        return html`
          <button class=${'sv-fila' + (i === actual ? ' actual' : '') + (est ? ' ' + est : '')} key=${i} onClick=${() => abrir(i)}
            aria-label=${`Serie ${i + 1}${est ? ', ' + est : ''}`}>
            <span class="sv-n">S${i + 1}${p.pct ? html`<small>${fmt(p.pct, 1)}${p.pctHasta ? `-${fmt(p.pctHasta, 1)}` : ''}%</small>` : ''}</span>
            <span class="sv-kg">${p.kg != null ? html`<b>${fmt(p.kg, 1)}${p.kgHasta ? `–${fmt(p.kgHasta, 1)}` : ''}</b><small> kg × ${p.reps ?? '?'}</small>` : html`<small class="muted">${p.pct ? 'sin RM' : 'kg'} × ${p.reps ?? '?'}</small>`}
              ${p.teorico != null && Math.abs(p.teorico - p.kg) >= 0.05 ? html`<br /><small class="muted">teórico ${fmt(p.teorico, 2)}</small>` : ''}
              ${g && distinto ? html`<br /><small class="sv-real">hecho: ${fmt(g.kg, 1)} kg${complejo ? '' : ` × ${g.reps}`}</small>` : ''}
              ${g?.nota ? html`<br /><small class="muted">${g.nota}</small>` : ''}</span>
            <span class="sv-est">${est === 'hecha' ? html`<${Icon} name="check" size=${20} />` : est === 'fallida' ? '✗' : est === 'incompleta' ? '½' : ''}</span>
          </button>
          ${edit?.i === i && html`
            <div class="sv-edit">
              <div class="inline">
                <${Num} value=${edit.kg} onChange=${v => setEdit({ ...edit, kg: v })} suffix="kg" />
                ${!complejo && html`<${Num} value=${edit.reps} onChange=${v => setEdit({ ...edit, reps: v })} suffix="reps" />`}
              </div>
              <div class="chips">${ESTADOS.map(e => html`<button class=${'chip' + (edit.estado === e.id ? ' on' : '')} onClick=${() => setEdit({ ...edit, estado: e.id })}>${e.label}</button>`)}</div>
              <input value=${edit.nota} placeholder="Nota (opcional): técnica, molestias…" onInput=${ev => setEdit({ ...edit, nota: ev.target.value })} />
              <div class="inline">
                <button class="btn small" onClick=${() => guardarSerie(i, { kg: edit.kg, reps: complejo ? p.reps : edit.reps, estado: edit.estado, nota: edit.nota.trim() || null })}>Guardar serie ${i + 1}</button>
                ${g && html`<button class="link small" onClick=${() => guardarSerie(i, null)}>Borrar</button>`}
                <button class="link small" onClick=${() => setEdit(null)}>Cerrar</button>
              </div>
            </div>`}`;
      })}
      ${actual >= 0 && !edit && html`
        <div class="sv-acciones">
          ${plan[actual].kg != null && html`<button class="btn sv-completar" onClick=${() => guardarSerie(actual, { kg: plan[actual].kg, reps: plan[actual].reps, estado: 'hecha', nota: null })}>
            <${Icon} name="check" size=${18} /> Completar S${actual + 1} · ${fmt(plan[actual].kg, 1)} kg${complejo ? '' : ` × ${plan[actual].reps ?? '?'}`}</button>`}
          ${plan[actual].kg == null && html`<button class="btn secondary" onClick=${() => abrir(actual)}>Apuntar S${actual + 1}</button>`}
          ${!guardadas.some(Boolean) && completas && plan.length > 1 && html`<button class="link small" onClick=${todasAsi}>Hice todas así</button>`}
        </div>`}
    </div>`;
}

// Resultado de la sección: tiempo / rondas, esfuerzo (RPE) y notas
function Resultado({ s, r, esWod, onGuardar, onHecho }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return html`
    <div class="resultado-linea">
      ${r.hecho ? html`<span class="tag ok">✓ Hecho</span>` : ''}
      ${r.tiempo && html`<span class="tag">${r.tiempo}</span>`}
      ${r.porBloque && html`<span class="tag">${r.porBloque}</span>`}
      ${r.rondas ? html`<span class="tag">${r.rondas} rondas${r.reps ? ` + ${r.reps}` : ''}</span>` : ''}
      ${r.rpe && html`<span class="tag">RPE ${r.rpe}</span>`}
      <button class="link" onClick=${() => setAbierto(true)}>${r.hecho ? 'Editar resultado' : 'Apuntar resultado'}</button>
    </div>`;
  const tipo = s.formato?.tipo;
  return html`
    <div class="form resultado">
      ${esWod && (tipo === 'fortime' || tipo === 'rondas' || tipo === 'intervalos') && html`
        <label>Tiempo (mm:ss)<input value=${r.tiempo || ''} placeholder="12:34" inputmode="numeric" onInput=${e => onGuardar({ tiempo: e.target.value })} /></label>`}
      ${esWod && (tipo === 'bloques' || tipo === 'segmentos') && html`
        <label>Resultado de cada bloque<input value=${r.porBloque || ''} placeholder=${s.formato.sub === 'fortime' ? '9:41 · 11:02' : '5 · 4 rondas'}
          onInput=${e => onGuardar({ porBloque: e.target.value })} /></label>`}
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
      <button class="btn" onClick=${async () => { setAbierto(false); await onHecho(); toast('¡Hecho! ✓ Pesos de la pauta guardados'); }}>Marcar como hecho</button>
      <small class="muted">Se guardan solos los pesos de la pauta que no hayas cambiado.</small>
    </div>`;
}

// ---------- Marcas: RM de cualquier ejercicio y benchmarks ----------
// Cómo se calculan las cargas: redondeo a discos, Training Max
function CalculoCargas({ cfg }) {
  const guardar = async cambios => setSetting('entreno', { ...(await getSetting('entreno', {})), ...cambios });
  return html`
    <section class="card form">
      <h3>Cálculo de cargas</h3>
      <label>Redondear los kilos a
        <div class="chips wrap">${[[0, 'Exacto'], [0.5, '0,5 kg'], [1, '1 kg'], [2, '2 kg'], [2.5, '2,5 kg'], [5, '5 kg']].map(([v, t]) => html`
          <button class=${'chip' + (cfg.redondeo === v ? ' on' : '')} onClick=${() => guardar({ redondeo: v })}>${t}</button>`)}</div>
      </label>
      <div class="chips">${[['cercano', 'Al más cercano'], ['abajo', 'Siempre hacia abajo']].map(([v, t]) => html`
        <button class=${'chip' + (cfg.modo === v ? ' on' : '')} onClick=${() => guardar({ modo: v })}>${t}</button>`)}</div>
      <small class="muted">Ej.: 62,5 % de 115 kg = 71,875 kg → ${fmt(redondear(71.875, cfg.redondeo, cfg.modo), 2)} kg. El valor teórico se sigue viendo debajo.</small>
      <label class="inline"><input type="checkbox" checked=${cfg.usarTM} onChange=${e => guardar({ usarTM: e.target.checked })} /> Usar mi Training Max cuando lo tenga (se pone en cada levantamiento)</label>
    </section>`;
}

function Marcas({ marcas, cfg }) {
  const [tab, setTab] = useState('fuerza');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(false);
  // Fuerza: los levantamientos conocidos + cualquier otro ejercicio del que tengas marcas
  const otros = [...new Set(marcas.filter(m => m.tipo === 'fuerza' && m.ejercicio.startsWith('x:')).map(m => m.ejercicio))]
    .map(id => ({ id, name: nombreRM(id, marcas) }));
  const fuerza = [...LEVANTAMIENTOS, ...otros]
    .filter(x => norm(x.name).includes(norm(q)))
    // primero los que tienen marca
    .sort((a, b) => (!!mejorRM(marcas, b.id)) - (!!mejorRM(marcas, a.id)));
  const lista = tab === 'fuerza' ? fuerza : BENCHMARKS;
  return html`
    <${Seg} value=${tab} onChange=${setTab} options=${[{ value: 'fuerza', label: 'Fuerza (RM)' }, { value: 'bench', label: 'Benchmarks' }]} />
    ${tab === 'fuerza' && html`<${CalculoCargas} cfg=${cfg} />`}
    ${tab === 'fuerza' && html`
      <div class="inline">
        <input class="search" placeholder="Buscar levantamiento…" value=${q} onInput=${e => setQ(e.target.value)} />
        <button class="btn small" onClick=${() => setNuevo(true)}><${Icon} name="plus" size=${16} /></button>
      </div>
      <p class="muted small">Tus RM también se guardan solos cuando apuntas kilos en las series de un entreno. Con + añades el RM de cualquier otro ejercicio.</p>`}
    <section class="card list">
      ${lista.map(x => {
        const mias = marcas.filter(m => m.ejercicio === x.id);
        const rm = tab === 'fuerza' ? mejorRM(marcas, x.id) : null;
        const valor = tab === 'fuerza' ? (rm ? `${rm.estimado ? '≈' : ''}${fmt(rm.kg, 1)} kg` : '—') : mejorBench(mias, x.tipo) || '—';
        return html`
          <button class="row" onClick=${() => setSel(x)}>
            <span class="grow">${x.name}${tab === 'bench' ? html`<br /><small class="muted">${x.desc}</small>` : ''}
              ${LEVANTAMIENTOS.find(L => L.id === x.id)?.padre && !rm ? html`<br /><small class="muted">si no lo tienes, uso ${nombreRM(LEVANTAMIENTOS.find(L => L.id === x.id).padre)}</small>` : ''}</span>
            <b>${valor}</b>
          </button>`;
      })}
    </section>
    <${Sheet} open=${!!sel} onClose=${() => setSel(null)} title=${sel?.name}>
      ${sel && html`<${MarcaDetalle} x=${sel} tipo=${tab} cfg=${cfg} marcas=${marcas.filter(m => m.ejercicio === sel.id)} />`}
    <//>
    <${Sheet} open=${nuevo} onClose=${() => setNuevo(false)} title="RM de otro ejercicio">
      ${nuevo && html`<${NuevoRM} onDone=${x => { setNuevo(false); setSel(x); }} />`}
    <//>`;
}

function NuevoRM({ onDone }) {
  const [nombre, setNombre] = useState('');
  const propios = useLive(() => db.ejercicios.toArray(), []);
  const sugerencias = [...LEVANTAMIENTOS.map(L => L.name), ...(propios || []).map(p => p.nombre)];
  const id = nombre.trim() ? idRM(nombre) : null;
  return html`
    <div class="form">
      <label>Ejercicio<input list="ejs-rm" value=${nombre} onInput=${e => setNombre(e.target.value)} placeholder="Ej: Front Rack Lunge, DBs Clean…" /></label>
      <datalist id="ejs-rm">${sugerencias.map(s => html`<option value=${s} />`)}</datalist>
      ${id && html`<p class="muted small">${id.startsWith('x:') ? 'Ejercicio nuevo: se guardará con este nombre.' : `Es el levantamiento "${nombreRM(id)}".`}</p>`}
      <button class="btn" disabled=${!id} onClick=${() => onDone({ id, name: id.startsWith('x:') ? nombre.trim() : nombreRM(id) })}>Continuar</button>
    </div>`;
}

function MarcaDetalle({ x, tipo, marcas, cfg = {} }) {
  const guardarCfg = async cambios => setSetting('entreno', { ...(await getSetting('entreno', {})), ...cambios });
  const ponerTM = async v => { const c = await getSetting('entreno', {}); const tm = { ...(c.tm || {}) }; if (v > 0) tm[x.id] = v; else delete tm[x.id]; await guardarCfg({ tm }); };
  const ponerEstimado = async v => { const c = await getSetting('entreno', {}); await guardarCfg({ estimados: { ...(c.estimados || {}), [x.id]: v } }); };
  const [kg, setKg] = useState(null), [reps, setReps] = useState(1), [resultado, setResultado] = useState(''), [fecha, setFecha] = useState(todayStr());
  const add = async () => {
    if (tipo === 'fuerza') await db.marcas.add({ tipo: 'fuerza', ejercicio: x.id, nombre: x.name, kg, reps, date: fecha });
    else await db.marcas.add({ tipo: 'bench', ejercicio: x.id, resultado, valor: valorBench(resultado, x.tipo), date: fecha });
    setKg(null); setResultado('');
    toast('Marca guardada ✓');
  };
  const rm = tipo === 'fuerza' ? mejorRM(marcas, x.id) : null;
  // Mejor marca por nº de repeticiones (1RM, 3RM, 5RM…)
  const porReps = {};
  for (const m of marcas) if (m.tipo === 'fuerza' && (!porReps[m.reps] || m.kg > porReps[m.reps].kg)) porReps[m.reps] = m;
  return html`
    <div class="form">
      ${x.desc && html`<p class="muted small">${x.desc}</p>`}
      ${rm && html`
        <div class="preview"><b>Tus porcentajes (1RM ${rm.estimado ? '≈' : ''}${fmt(rm.kg, 1)} kg)</b>
          ${rm.estimado && html`<div class="muted small">1RM estimado a partir de tu ${rm.desde}. Apunta un 1RM real cuando lo hagas.</div>`}
          <div class="pct-grid">${[50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map(p => html`<span>${p}%<b>${Math.round((rm.kg * p) / 100)}</b></span>`)}</div>
        </div>`}
      ${tipo === 'fuerza' && html`
        <div class="tm-caja">
          <label>Training Max (opcional)<${Num} value=${cfg.tm?.[x.id] ?? null} onChange=${ponerTM} suffix="kg" /></label>
          <small class="muted">${cfg.usarTM ? 'Se usa en vez del RM para calcular los %.' : 'Actívalo en "Cálculo de cargas" para usarlo en los %.'}</small>
          ${rm?.estimado && html`<label class="inline"><input type="checkbox" checked=${!!cfg.estimados?.[x.id]} onChange=${e => ponerEstimado(e.target.checked)} /> Usar el 1RM estimado (${fmt(rm.kg, 1)} kg) para calcular los %</label>`}
        </div>`}
      ${tipo === 'fuerza' && Object.keys(porReps).length > 0 && html`
        <div class="chips wrap">${Object.values(porReps).sort((a, b) => a.reps - b.reps).map(m => html`<span class="tag">${m.reps}RM: <b>${fmt(m.kg, 1)} kg</b></span>`)}</div>`}
      ${marcas.length >= 2 && html`
        <h4>Evolución</h4>
        ${tipo === 'fuerza'
          ? html`<${Evolucion} puntos=${evolucionRM(marcas)} unidad="kg" nota="1RM (o estimado de tus series de varias repeticiones) de cada día." />`
          : html`<${Evolucion} puntos=${[...marcas].sort((a, b) => a.date.localeCompare(b.date)).map(m => ({ date: m.date, v: m.valor, texto: m.resultado }))}
              menorMejor=${x.tipo !== 'amrap'} nota=${x.tipo === 'amrap' ? 'Rondas: más arriba, mejor.' : 'Tiempo: más arriba, más rápido.'} formato=${v => x.tipo === 'amrap' ? `${Math.floor(v / 1000)}+${v % 1000}` : mmss(v)} />`}`}
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

// ---------- Ejercicios: todo lo que has hecho (se añaden solos al pegar entrenos) + los que añadas a mano ----------
function Ejercicios() {
  const workouts = useLive(() => db.workouts.toArray(), []);
  const propios = useLive(() => db.ejercicios.toArray(), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  if (!workouts || !propios) return html`<div class="loading">Cargando…</div>`;

  const unidos = alias(propios);
  const mapa = {};
  const entrada = (clave, nombre) => (mapa[clave] ||= { clave, nombre, veces: 0, ultima: '', links: new Set(), historial: [], variantes: new Set() });
  for (const w of workouts) {
    leer(w).secciones.forEach((s, si) => s.partes.forEach((p, pi) => p.lineas.forEach((l, li) => {
      for (const nombre of l.ejercicios || []) {
        const original = claveEjercicio(nombre);
        const e = entrada(unidos[original] || original, nombre);
        if (unidos[original]) e.variantes.add(nombre);
        e.veces++;
        if (w.date > e.ultima) e.ultima = w.date;
        (l.links || []).forEach(u => e.links.add(u));
        const series = w.resultados?.[si]?.series?.[`${pi}-${li}`] || (w.resultados?.[si]?.pesos?.[`${pi}-${li}`] ? [w.resultados[si].pesos[`${pi}-${li}`]] : null);
        e.historial.push({ date: w.date, texto: l.texto + (l.prescripcion ? ' ' + l.prescripcion : ''), series });
      }
    })));
  }
  // Lo que has añadido o editado a mano (nombre, vídeo, notas) manda sobre lo automático
  for (const p of propios) {
    if (p.uneCon) continue; // es una variante unida a otro
    const e = entrada(p.id, p.nombre);
    e.nombre = p.nombre || e.nombre;
    e.notas = p.notas;
    (p.videos || []).forEach(u => e.links.add(u));
    e.propio = true;
  }
  const lista = Object.values(mapa).filter(e => norm(e.nombre).includes(norm(q)))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre));

  return html`
    <div class="inline">
      <input class="search" placeholder="Buscar ejercicio…" value=${q} onInput=${e => setQ(e.target.value)} />
      <button class="btn small" onClick=${() => setNuevo(true)}><${Icon} name="plus" size=${16} /></button>
    </div>
    <p class="muted small">Se añaden solos cada vez que pegas un entreno. También puedes añadirlos a mano con su vídeo.</p>
    ${lista.length === 0 && html`<${Empty}>Aún no hay ejercicios. Pega un entreno o añade uno con +.<//>`}
    <section class="card list">
      ${lista.map(e => html`
        <button class="row" onClick=${() => setSel(e)}>
          <span class="grow">${e.nombre}${implemento(e.nombre) ? html` <span class="tag">${implemento(e.nombre)}</span>` : ''}${e.links.size ? html` <span class="tag">vídeo</span>` : ''}</span>
          <small class="muted">${e.veces ? `${e.veces}× · ${fmtDate(e.ultima, { day: 'numeric', month: 'short' })}` : 'añadido a mano'}</small>
        </button>`)}
    </section>
    <${Sheet} open=${!!sel} onClose=${() => setSel(null)} title=${sel?.nombre}>
      ${sel && html`<${EjercicioDetalle} e=${sel} todos=${Object.values(mapa)} propios=${propios} onDone=${() => setSel(null)} />`}
    <//>
    <${Sheet} open=${nuevo} onClose=${() => setNuevo(false)} title="Nuevo ejercicio">
      ${nuevo && html`<${EjercicioDetalle} e=${{ clave: '', nombre: '', links: new Set(), historial: [], variantes: new Set() }} todos=${[]} propios=${propios} onDone=${() => setNuevo(false)} />`}
    <//>`;
}

function EjercicioDetalle({ e, todos = [], propios = [], onDone }) {
  const [nombre, setNombre] = useState(e.nombre);
  const [video, setVideo] = useState('');
  const [notas, setNotas] = useState(e.notas || '');
  const [unir, setUnir] = useState('');
  const otros = todos.filter(x => x.clave !== e.clave).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const variantesUnidas = propios.filter(p => p.uneCon === e.clave);
  // Unir: este ejercicio pasa a contar como el elegido (sus sesiones y pesos se suman allí)
  const hacerUnion = async () => {
    const destino = otros.find(x => x.clave === unir);
    if (!destino || !e.clave) return;
    const prev = (await db.ejercicios.get(e.clave)) || {};
    await db.ejercicios.put({ ...prev, id: e.clave, nombre: e.nombre, uneCon: destino.clave });
    toast(`${e.nombre} ahora cuenta como ${destino.nombre} ✓`);
    onDone();
  };
  const separar = async id => {
    const prev = await db.ejercicios.get(id);
    if (prev) await db.ejercicios.put({ ...prev, uneCon: null });
    toast('Separado ✓');
  };
  const sesiones = sesionesConPeso(e.historial);
  const guardar = async () => {
    const id = e.clave || claveEjercicio(nombre);
    const prev = (await db.ejercicios.get(id)) || {};
    const videos = [...new Set([...(prev.videos || []), ...(video.trim() ? [video.trim()] : [])])];
    await db.ejercicios.put({ ...prev, id, nombre: nombre.trim(), notas, videos });
    toast('Ejercicio guardado ✓');
    onDone();
  };
  return html`
    <div class="form">
      <label>Nombre<input value=${nombre} onInput=${ev => setNombre(ev.target.value)} placeholder="Ej: Cat Dog" /></label>
      ${[...e.links].map(u => html`<a class="btn secondary" href=${u} target="_blank" rel="noopener">▶ Ver vídeo</a>`)}
      <label>Añadir vídeo (enlace de YouTube, Instagram…)<input value=${video} onInput=${ev => setVideo(ev.target.value)} placeholder="https://youtube.com/…" /></label>
      <label>Notas (técnica, escalado, molestias…)<textarea rows="3" value=${notas} onInput=${ev => setNotas(ev.target.value)}></textarea></label>
      <button class="btn" disabled=${!nombre.trim()} onClick=${guardar}>Guardar</button>
      ${sesiones.length >= 2 && html`
        <h4>Evolución</h4>
        <${Evolucion} puntos=${sesiones} unidad="kg" nota="El peso más alto que usaste en cada sesión." />`}
      ${(e.variantes?.size > 0 || variantesUnidas.length > 0) && html`
        <h4>Variantes unidas aquí</h4>
        ${variantesUnidas.map(v => html`<div class="inline"><span class="grow">${v.nombre}</span><button class="btn small secondary" onClick=${() => separar(v.id)}>Separar</button></div>`)}`}
      ${e.clave && otros.length > 0 && html`
        <h4>¿Es el mismo ejercicio que otro?</h4>
        <small class="muted">Por ejemplo, "Cal row" y "Cal Row". Al unirlos, sus sesiones y pesos se juntan en uno.</small>
        <div class="inline">
          <select aria-label="Unir con" value=${unir} onChange=${ev => setUnir(ev.target.value)}>
            <option value="">Elige el ejercicio…</option>
            ${otros.map(x => html`<option value=${x.clave}>${x.nombre}</option>`)}
          </select>
          <button class="btn small" disabled=${!unir} onClick=${hacerUnion}>Unir</button>
        </div>`}
      ${e.historial.length > 0 && html`
        <h4>Historial</h4>
        <table class="ntable">
          ${[...e.historial].sort((a, b) => b.date.localeCompare(a.date)).map(h => html`
            <tr><td>${fmtDate(h.date, { day: 'numeric', month: 'short' })}</td>
              <td>${h.texto}${h.series ? html`<br /><small class="pct">${h.series.filter(x => x.kg).map(x => `${fmt(x.kg, 1)}×${x.reps}`).join(' · ')}</small>` : ''}</td></tr>`)}
        </table>`}
    </div>`;
}

// ---------- utilidades ----------
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

// Cómo se lee un entreno:
//  - si ya tiene la lectura CONGELADA (se congela al apuntar el primer resultado), esa;
//  - si tiene resultados de antes de v3 (sin congelar), con el lector antiguo, para que cada peso siga en su línea;
//  - si no, con el lector actual (así los entrenos sin resultados aprovechan las mejoras).
const cacheLectura = new Map();
export function leer(w) {
  if (w.estructura?.secciones) return w.estructura;
  const conRes = Object.values(w.resultados || {}).some(r => r && Object.keys(r).length);
  const k = w.id + ':' + w.texto + (conRes ? ':v1' : ':v2');
  if (!cacheLectura.has(k)) cacheLectura.set(k, conRes ? parsearEntrenoV1(w.texto) : parsearEntreno(w.texto));
  return cacheLectura.get(k);
}

// Guarda tu mejor marca de un ejercicio para cada nº de repeticiones (sirve para cualquier ejercicio,
// tenga o no RM "oficial"). Devuelve true si hubo récord (y lo avisa).
async function registrarRecords(nombre, filas, marcas) {
  filas = filas.filter(f => f && f.estado !== 'fallida' && f.estado !== 'incompleta');
  const id = idRM(nombre);
  const nombreBonito = id.startsWith('x:') ? nombre : nombreRM(id, marcas);
  const records = [];
  for (const reps of [...new Set(filas.filter(f => f.kg && f.reps).map(f => f.reps))]) {
    const kg = Math.max(...filas.filter(f => f.reps === reps && f.kg).map(f => f.kg));
    const prev = Math.max(0, ...marcas.filter(m => m.ejercicio === id && m.reps === reps).map(m => m.kg));
    if (kg > prev) {
      await db.marcas.add({ tipo: 'fuerza', ejercicio: id, nombre: nombreBonito, kg, reps, date: todayStr() });
      records.push(`${reps}RM ${fmt(kg, 1)} kg`);
    }
  }
  if (records.length) toast(`🏆 ¡Récord en ${nombreBonito}! ${records.join(' · ')}`);
  return records.length > 0;
}

// Todos los pesos que has usado en cada ejercicio (de las series y de "+ kg"), del más reciente al más antiguo
function historialPesos(workouts, unidos = {}) {
  const h = {};
  for (const w of workouts) {
    const res = w.resultados || {};
    leer(w).secciones.forEach((s, si) => s.partes.forEach((p, pi) => p.lineas.forEach((l, li) => {
      const nombre = l.ejercicios?.[0];
      if (!nombre) return;
      const k = `${pi}-${li}`;
      const usados = res[si]?.series?.[k] || (res[si]?.pesos?.[k] ? [res[si].pesos[k]] : null);
      const conKg = (usados || []).filter(x => x && x.kg && x.estado !== 'fallida');
      const c = claveEjercicio(nombre);
      if (conKg.length) (h[unidos[c] || c] ||= []).push({ date: w.date, sets: conKg });
    })));
  }
  for (const k of Object.keys(h)) h[k].sort((a, b) => b.date.localeCompare(a.date));
  return h;
}

// "Última vez: 20 kg × 10 (3 oct)"
function UltimaVez({ lista, date }) {
  const prev = lista?.find(h => h.date < date);
  if (!prev) return null;
  const max = Math.max(...prev.sets.map(x => x.kg));
  const txt = prev.sets.map(x => `${fmt(x.kg, 1)} kg${x.reps ? ' × ' + x.reps : ''}`).join(' · ');
  return html`<small class="muted">${`Última vez: ${txt} (${fmtDate(prev.date, { day: 'numeric', month: 'short' })})${prev.sets.length > 1 ? ` · máx. ${fmt(max, 1)} kg` : ''}`}</small>`;
}

// Apuntar el peso de un ejercicio que no viene en series (Bulgarian Split Squat, Hip Thrust…)
function PesoLinea({ l, clave, r, marcas, ultimo, onGuardar }) {
  const guardado = r.pesos?.[clave];
  const [abierto, setAbierto] = useState(false);
  const [kg, setKg] = useState(guardado?.kg ?? l.kg ?? (ultimo ? Math.max(...ultimo.sets.map(x => x.kg)) : null));
  const [reps, setReps] = useState(guardado?.reps ?? l.repsLinea ?? null);
  const rapido = async (kgR, repsR) => {
    await onGuardar({ pesos: { ...(r.pesos || {}), [clave]: { kg: kgR, reps: repsR } } });
    if (!(repsR && await registrarRecords(l.ejercicios[0], [{ kg: kgR, reps: repsR }], marcas))) toast('Peso guardado ✓');
  };
  const ultimoKg = ultimo ? Math.max(...ultimo.sets.map(x => x.kg)) : null;
  if (!abierto) return html`
    <div class="series-resumen">
      ${guardado && html`<small class="pct">✓ ${fmt(guardado.kg, 1)} kg${guardado.reps ? ` × ${guardado.reps}` : ''}</small>`}
      ${!guardado && l.kg && html`<button class="chip on" onClick=${() => rapido(l.kg, l.repsLinea || null)}>✓ Hecho con ${fmt(l.kg, 1)} kg</button>`}
      ${!guardado && !l.kg && ultimoKg && html`<button class="chip on" onClick=${() => rapido(ultimoKg, l.repsLinea || null)}>✓ Igual que la última (${fmt(ultimoKg, 1)} kg)</button>`}
      <button class="chip" onClick=${() => setAbierto(true)}>${guardado ? 'Editar peso' : l.kg || ultimoKg ? 'Otro peso' : '+ kg'}</button>
    </div>`;
  return html`
    <div class="serie">
      <span></span>
      <${Num} value=${kg} onChange=${setKg} suffix="kg" />
      <${Num} value=${reps} onChange=${setReps} suffix="reps" />
    </div>
    <div class="inline">
      <button class="btn small" disabled=${!kg} onClick=${async () => {
        await onGuardar({ pesos: { ...(r.pesos || {}), [clave]: { kg, reps } } });
        setAbierto(false);
        if (!(reps && await registrarRecords(l.ejercicios[0], [{ kg, reps }], marcas))) toast('Peso guardado ✓');
      }}>Guardar peso</button>
      <button class="link" onClick=${() => setAbierto(false)}>Cancelar</button>
    </div>`;
}

// ---------- Ejercicios unidos: "Cal row" → "Cal Row" ----------
export function alias(propios) {
  return Object.fromEntries((propios || []).filter(p => p.uneCon).map(p => [p.id, p.uneCon]));
}

// Mejor 1RM de cada día (real o estimado con la fórmula de Epley)
export function evolucionRM(marcas) {
  const porDia = {};
  for (const m of marcas) {
    if (!m.kg || !m.reps) continue;
    const est = m.reps === 1 ? m.kg : m.kg * (1 + m.reps / 30);
    if (!porDia[m.date] || est > porDia[m.date].v) porDia[m.date] = { date: m.date, v: est, texto: `${fmt(m.kg, 1)} kg × ${m.reps}` };
  }
  return Object.values(porDia).sort((a, b) => a.date.localeCompare(b.date));
}

// Peso máximo de cada sesión de un ejercicio
export function sesionesConPeso(historial = []) {
  const porDia = {};
  for (const h of historial) {
    const max = Math.max(0, ...(h.series || []).map(x => x.kg || 0));
    if (max && (!porDia[h.date] || max > porDia[h.date].v)) porDia[h.date] = { date: h.date, v: max, texto: `${fmt(max, 1)} kg` };
  }
  return Object.values(porDia).sort((a, b) => a.date.localeCompare(b.date));
}

// Gráfica de evolución: puntos por fecha y línea de "lo mejor hasta ese día"
function Evolucion({ puntos, unidad = '', menorMejor = false, nota, formato }) {
  const [sel, setSel] = useState(null);
  if (puntos.length < 2) return null;
  const W = 340, H = 140, izq = 34, der = 8, arriba = 10, abajo = 22;
  const vs = puntos.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.12; lo -= m; hi += m;
  const t0 = new Date(puntos[0].date), t1 = new Date(puntos.at(-1).date);
  const span = Math.max(1, t1 - t0);
  const x = d => izq + (W - izq - der) * ((new Date(d) - t0) / span);
  // Si menor es mejor (tiempos), lo de arriba es lo más rápido
  const y = v => arriba + (H - arriba - abajo) * (menorMejor ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo));
  let mejor = null;
  const escalon = puntos.map((p, i) => {
    mejor = mejor == null ? p.v : menorMejor ? Math.min(mejor, p.v) : Math.max(mejor, p.v);
    return `${i ? 'L' : 'M'}${x(p.date)},${y(mejor)}`;
  }).join(' ');
  const txt = v => formato ? formato(v) : `${fmt(v, 1)}${unidad ? ' ' + unidad : ''}`;
  const ps = puntos.find(p => p.date === sel);
  const ini = puntos[0].v, fin = mejor;
  const cambio = menorMejor ? ini - fin : fin - ini;
  return html`
    <svg class="chart evolucion" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolución">
      <text x=${izq - 4} y=${y(menorMejor ? lo : hi) + 4} text-anchor="end" class="tick">${txt(menorMejor ? lo + m : hi - m)}</text>
      <text x=${izq - 4} y=${y(menorMejor ? hi : lo)} text-anchor="end" class="tick">${txt(menorMejor ? hi - m : lo + m)}</text>
      <line x1=${izq} x2=${W - der} y1=${H - abajo} y2=${H - abajo} class="axis" />
      <text x=${izq} y=${H - 5} class="tick">${fmtDate(puntos[0].date, { day: 'numeric', month: 'short' })}</text>
      <text x=${W - der} y=${H - 5} text-anchor="end" class="tick">${fmtDate(puntos.at(-1).date, { day: 'numeric', month: 'short' })}</text>
      <path d=${escalon} class="peso-line" />
      ${puntos.map(p => html`
        <g class="pg-pt" onClick=${() => setSel(sel === p.date ? null : p.date)}>
          <circle cx=${x(p.date)} cy=${y(p.v)} r="11" fill="transparent" />
          <circle cx=${x(p.date)} cy=${y(p.v)} r=${sel === p.date ? 6 : 4} class="peso-dot"><title>${fmtDate(p.date)}: ${p.texto || txt(p.v)}</title></circle>
        </g>`)}
    </svg>
    ${ps ? html`<p class="small"><b>${fmtDate(ps.date, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}</b>: ${ps.texto || txt(ps.v)}</p>`
      : html`<p class="small">${cambio > 0 ? `Has mejorado ${txt(Math.abs(cambio)).replace(/^0:/, '0:')} desde ${fmtDate(puntos[0].date, { month: 'long' })}.` : 'Aún sin mejora respecto a la primera vez.'}</p>`}
    <small class="muted">${nota} La línea es tu mejor marca hasta cada día. Toca un punto para ver la fecha.</small>`;
}

// ---------- La semana de entreno ----------
function Semana({ date, todos, onDia }) {
  const d = new Date(date + 'T12:00');
  const lunes = addDays(date, -((d.getDay() + 6) % 7));
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const hoy = todayStr();
  const deDia = f => todos.filter(w => w.date === f);
  const estado = f => {
    const ws = deDia(f);
    if (!ws.length) return '';
    const secs = ws.flatMap(w => leer(w).secciones.map((s, i) => !!w.resultados?.[i]?.hecho));
    return secs.length && secs.every(Boolean) ? 'hecho' : secs.some(Boolean) ? 'parcial' : 'pegado';
  };
  const semana = dias.flatMap(deDia);
  const rpes = semana.flatMap(w => Object.values(w.resultados || {}).map(x => x.rpe).filter(Boolean));
  return html`
    <section class="card semana">
      <div class="semana-dias">
        ${dias.map(f => html`
          <button class=${'semana-dia' + (f === date ? ' sel' : '') + (f === hoy ? ' hoy' : '')} onClick=${() => onDia(f)} aria-label=${fmtDate(f, { weekday: 'long', day: 'numeric' }) + (estado(f) ? ', entreno' : '')}>
            <small>${fmtDate(f, { weekday: 'narrow' })}</small>
            <b>${new Date(f + 'T12:00').getDate()}</b>
            <span class=${'semana-punto ' + estado(f)}></span>
          </button>`)}
      </div>
      <small class="muted">${semana.length ? `${new Set(semana.map(w => w.date)).size} ${new Set(semana.map(w => w.date)).size === 1 ? 'día' : 'días'} de entreno esta semana${rpes.length ? ` · RPE medio ${fmt(rpes.reduce((a, b) => a + b, 0) / rpes.length, 1)}` : ''}.` : 'Esta semana aún no hay entrenos.'} Punto lleno: hecho; medio: a medias; hueco: pegado sin hacer.</small>
    </section>`;
}
