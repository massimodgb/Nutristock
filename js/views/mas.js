// "Más": peso corporal, preferencias y copias de seguridad.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getPrefs, setSetting } from '../db.js';
import { exportarCopia, estadoCopia, listarInternas, leerInterna, validarCopia, restaurarCopia } from '../copias.js';
import { fmt, todayStr, fmtDate, addDays } from '../nutri.js';
import { Num, Toggle, Icon, Sheet, toast } from '../ui.js';

export function Mas({ go }) {
  const weights = useLive(() => db.weights.orderBy('date').reverse().limit(60).toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [peso, setPeso] = useState(null);
  const [persist, setPersist] = useState(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersist); }, []);

  if (!weights || !prefs) return html`<div class="loading">Cargando…</div>`;
  const setPref = (k, v) => setSetting('prefs', { ...prefs, [k]: v });

  // Media de 7 días: el peso diario oscila mucho (agua, sal, carbohidratos), la media no
  const media = date => {
    const desde = addDays(date, -6);
    const w = weights.filter(x => x.date >= desde && x.date <= date);
    return w.length ? w.reduce((s, x) => s + x.kg, 0) / w.length : null;
  };




  return html`
    <div class="page">
      <header class="top"><h1>Más</h1></header>

      <section class="card list">
        <button class="row" onClick=${() => go('guia')}>
          <${Icon} name="check" /><span class="grow"><b>Cómo se usa (guías)</b></span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('informes')}>
          <${Icon} name="plan" /><span class="grow"><b>Informes</b> para nutricionista y entrenadora</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('ideas')}>
          <${Icon} name="bolt" /><span class="grow">Ideas y recetas</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('plan')}>
          <${Icon} name="plan" /><span class="grow">Mi plan de alimentación</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('perfil')}>
          <${Icon} name="chart" /><span class="grow">Perfil y objetivo</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('biblioteca')}>
          <${Icon} name="biblio" /><span class="grow">Biblioteca de productos</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('ejercicios')}>
          <${Icon} name="pesa" /><span class="grow">Biblioteca de ejercicios</span><${Icon} name="right" size=${18} />
        </button>
      </section>

      <section class="card">
        <h3>Peso corporal</h3>
        <div class="inline">
          <${Num} value=${peso} onChange=${setPeso} suffix="kg" placeholder="Peso de hoy" />
          <button class="btn small" disabled=${!peso} onClick=${async () => {
            await db.weights.put({ date: todayStr(), kg: peso });
            setPeso(null); toast('Peso guardado ✓');
          }}>Guardar</button>
        </div>
        <p class="muted small">Pésate en ayunas, después del baño. Fíjate en la media de 7 días, no en el número de cada día.</p>
        <table class="ntable">
          ${weights.slice(0, 14).map(w => html`
            <tr><td>${fmtDate(w.date)}</td><td>${fmt(w.kg, 1)} kg</td><td class="muted">media ${fmt(media(w.date), 1)}</td>
              <td><button class="icon-btn" aria-label="Borrar" onClick=${() => db.weights.delete(w.date)}><${Icon} name="trash" size=${14} /></button></td></tr>`)}
        </table>
      </section>

      <section class="card form">
        <h3>Preferencias</h3>
        <${Toggle} label="Excluir comida del mar" checked=${prefs.excluirMar} onChange=${v => setPref('excluirMar', v)}
          hint="Oculta pescado y marisco del plan, sugerencias y búsquedas" />
        <label>Avisar caducidad con
          <${Num} value=${prefs.avisoCaducaDias} onChange=${v => v != null && setPref('avisoCaducaDias', v)} suffix="días" />
        </label>
        <div class="grid2">
          <label>Agua al día<${Num} value=${prefs.aguaObjetivo} onChange=${v => v && setPref('aguaObjetivo', v)} suffix="ml" /></label>
          <label>Tamaño del vaso<${Num} value=${prefs.aguaVaso} onChange=${v => v && setPref('aguaVaso', v)} suffix="ml" /></label>
        </div>
      </section>

      <${TusDatos} persist=${persist} />

      <p class="muted small center">NutriStock · Fase 1</p>
    </div>`;
}

// ---------- Tus datos: copias y restauración ----------
function TusDatos({ persist }) {
  const [estado, setEstado] = useState(null);
  const [internas, setInternas] = useState([]);
  const [revisar, setRevisar] = useState(null); // { datos, v, origen }
  const recargar = async () => { setEstado(await estadoCopia()); setInternas(await listarInternas()); };
  useEffect(() => { recargar(); }, []);

  const exportar = async () => { if (await exportarCopia()) { toast('Copia guardada ✓'); recargar(); } };
  const abrirArchivo = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let datos = null;
    try { datos = JSON.parse(await f.text()); } catch {}
    setRevisar({ datos, v: validarCopia(datos), origen: f.name });
  };
  const abrirInterna = async id => {
    const c = await leerInterna(id);
    setRevisar({ datos: c.datos, v: validarCopia(c.datos), origen: `copia automática del ${new Date(c.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` });
  };
  const restaurar = async () => {
    try {
      await restaurarCopia(revisar.datos);
      toast('Copia restaurada ✓');
      setRevisar(null);
      setTimeout(() => location.reload(), 600);
    } catch (err) { alert(err.message); }
  };
  const u = estado?.ultima;

  return html`
    <section class="card form">
      <h3>Tus datos</h3>
      <p class="small">Todo se guarda en este iPhone, dentro de la app. ${persist ? html`<span class="tag ok">protegido contra borrado ✓</span>` : html`<span class="tag warn">iOS podría borrarlos si no usas la app en semanas</span>`}</p>
      <div class=${'aviso ' + (estado?.recordar ? 'warn' : 'ok')}>
        <span>${u
          ? html`Última copia guardada fuera: <b>${estado.dias === 0 ? 'hoy' : estado.dias === 1 ? 'ayer' : `hace ${estado.dias} días`}</b>.`
          : html`<b>Aún no has guardado ninguna copia fuera del iPhone.</b>`}
          ${estado?.recordar ? ' Haz una ahora: es lo que te salva si se borra la app o cambias de móvil.' : ''}</span>
      </div>
      <button class="btn" onClick=${exportar}><${Icon} name="check" size=${18} /> Exportar copia de seguridad</button>
      <small class="muted">Se abre "Compartir": elige "Guardar en Archivos" → OneDrive (o iCloud Drive). Hazlo una vez por semana.</small>

      <h4>Copias automáticas (dentro de la app)</h4>
      <small class="muted">La app guarda sola una copia al día y guarda las 7 últimas (ahora hay ${internas.length}). Sirven si algo sale mal (por ejemplo, restaurar el archivo equivocado), pero no si se borra la app: para eso es la copia de arriba.</small>
      ${internas.length === 0 && html`<p class="muted small">Todavía no hay ninguna (se crea al abrir la app).</p>`}
      <div class="list">
        ${internas.map(c => html`
          <button class="row" onClick=${() => abrirInterna(c.id)}>
            <span class="grow">${new Date(c.fecha).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              <br /><small class="muted">${c.motivo} · ${c.registros} registros</small></span>
            <small class="muted">Ver</small>
          </button>`)}
      </div>

      <label class="btn secondary">
        Restaurar desde un archivo
        <input type="file" accept=".json,application/json" hidden onChange=${abrirArchivo} />
      </label>
    </section>

    <${Sheet} open=${!!revisar} onClose=${() => setRevisar(null)} title="Revisar copia">
      ${revisar && html`
        <div class="form">
          <p class="small">Origen: ${revisar.origen}</p>
          ${revisar.v.ok ? html`
            <div class="preview small">
              <b>La copia está bien.</b> Contiene:<br />
              ${revisar.v.resumen.registros} registros de comida · ${revisar.v.resumen.productos} productos tuyos ·
              ${revisar.v.resumen.despensa} envases en la despensa · ${revisar.v.resumen.pesos} pesos · ${revisar.v.resumen.entrenos} entrenos
              ${revisar.v.resumen.fecha !== '¿?' ? html`<br />Exportada el ${revisar.v.resumen.fecha}.` : ''}
            </div>
            <p class="aviso warn">Restaurar <b>reemplaza todo</b> lo que tienes ahora por esta copia. Antes, la app guarda sola una copia automática de lo actual, por si te arrepientes.</p>
            <button class="btn danger" onClick=${restaurar}>Reemplazar mis datos por esta copia</button>` : html`
            <p class="error"><b>Este archivo no se puede restaurar.</b> No se ha cambiado nada.</p>
            <ul class="small">${revisar.v.errores.map(e => html`<li>${e}</li>`)}</ul>`}
        </div>`}
    <//>`;
}
