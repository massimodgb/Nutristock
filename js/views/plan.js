// Plan del nutricionista: verlo y cargar uno nuevo cada mes.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, activePlan, setSetting } from '../db.js';
import { GROUPS, blockFoods, blockRef, visibleFood, sumN, planRef, fmt, fmtDate } from '../nutri.js';
import { Sheet, Dot, MacroLine, Icon, toast } from '../ui.js';

export function Plan({ go }) {
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [importar, setImportar] = useState(false);

  if ([plan, foods, prefs].includes(undefined)) return html`<div class="loading">Cargando…</div>`;
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));

  return html`
    <div class="page">
      <button class="link back" onClick=${() => go('mas')}>‹ Más</button>
      <header class="top">
        <h1>Plan</h1>
        <button class="btn small" onClick=${() => setImportar(true)}>${plan ? 'Nuevo plan' : 'Cargar plan'}</button>
      </header>
      ${!plan && html`
        <div class="card">
          <p>Sube el PDF que te manda tu nutricionista cada mes con <b>Cargar plan</b>.</p>
          <p class="muted small">Puedes elegirlo desde Archivos, OneDrive o el correo (Guardar en Archivos).</p>
        </div>`}
      ${plan && html`
        <section class="card">
          <h3>${plan.nombre}</h3>
          <p class="muted small">${plan.nutricionista} · desde ${fmtDate(plan.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          ${plan.nota && html`<p class="notice">${plan.nota}</p>`}
          <div class="preview"><span class="muted small">Estimación diaria:</span> <${MacroLine} n=${planRef(plan, byId, prefs)} /></div>
        </section>
        ${plan.comidas.map(m => html`
          <section class="card meal">
            <header class="meal-head"><div><h3>${m.nombre}</h3><small>${m.hora}</small></div></header>
            ${(m.bloques || []).map(b => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs} />`)}
            ${(m.opciones || []).length > 0 && html`
              <p class="muted small">Elige una opción:</p>
              ${m.opciones.map(o => html`
                <div class="opcion">
                  <strong>${o.nombre}</strong>
                  ${o.bloques.map(b => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs} />`)}
                </div>`)}`}
          </section>
          ${plan.entreno?.despuesDe === m.id && html`<div class="training"><${Icon} name="bolt" size=${16} /> ${plan.entreno.texto}</div>`}`)}
        ${plan.aderezos?.length > 0 && html`
          <section class="card"><h3>Aderezos libres</h3><p class="small">${plan.aderezos.join(' · ')}</p></section>`}`}

      <${Sheet} open=${importar} onClose=${() => setImportar(false)} title="Cargar plan">
        ${importar && html`<${Importar} onDone=${() => setImportar(false)} />`}
      <//>
    </div>`;
}

function BloquePlan({ b, plan, byId, prefs }) {
  const [abierto, setAbierto] = useState(false);
  const items = blockFoods(b, plan);
  const vis = items.filter(x => visibleFood(byId[x.id], prefs));
  const ocultos = items.length - vis.length;
  return html`
    <div class="block" onClick=${() => setAbierto(!abierto)}>
      <${Dot} group=${b.grupo} />
      <div class="grow">
        <div class="b-name">${b.nombre} <small class="muted">${b.texto}</small></div>
        ${abierto
          ? html`<small>${vis.map(x => `${byId[x.id]?.name || x.id} (${x.g} g)`).join(' · ')}</small>`
          : html`<small class="muted">${vis.length} opciones${ocultos ? ` · ${ocultos} del mar ocultas` : ''} · ≈${fmt(blockRef(b, plan, byId, prefs).kcal)} kcal</small>`}
      </div>
    </div>`;
}

function Importar({ onDone }) {
  const [estado, setEstado] = useState(null); // null | 'leyendo' | { plan, avisos, byId, prefs }
  const [err, setErr] = useState('');
  const [txt, setTxt] = useState('');

  const guardar = async plan => {
    await db.plans.put({ ...plan, cargado: Date.now() });
    await setSetting('planActivo', plan.id);
    toast('Plan cargado ✓');
    onDone();
  };

  const desdeArchivo = async file => {
    setErr('');
    try {
      const foods = await db.foods.toArray();
      const prefs = await getPrefs();
      const byId = Object.fromEntries(foods.map(f => [f.id, f]));
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        setEstado('leyendo');
        const { textoDePdf, planDesdeTexto } = await import('../plan-pdf.js');
        const texto = await textoDePdf(await file.arrayBuffer());
        setEstado({ ...planDesdeTexto(texto, foods, file.name), byId, prefs });
      } else {
        const plan = validarJson(await file.text(), byId);
        setEstado({ plan, avisos: [], byId, prefs });
      }
    } catch (e) {
      setEstado(null);
      setErr(e.message);
    }
  };

  if (estado === 'leyendo') return html`<p class="muted">Leyendo el PDF…</p>`;
  if (estado) return html`<${Vista} ...${estado} onOk=${() => guardar(estado.plan)} onCancel=${() => setEstado(null)} />`;

  return html`
    <div class="form">
      <p class="small">Sube el <b>PDF que te manda tu nutricionista</b> tal cual. Lo leo aquí mismo y antes de guardarlo te enseño lo que entendí.</p>
      <label class="btn">
        <${Icon} name="plan" size=${18} /> Elegir PDF del plan
        <input type="file" accept=".pdf,application/pdf,.json,application/json" hidden onChange=${e => {
          const file = e.target.files[0];
          e.target.value = '';
          if (file) desdeArchivo(file);
        }} />
      </label>
      ${err && html`<p class="error">${err}</p>`}
      <p class="muted small">Si alguna vez el nutricionista cambia el formato del PDF y no lo entiende bien, pásaselo a Claude y te dará un .json que también puedes subir aquí, o pegarlo:</p>
      <textarea rows="3" value=${txt} onInput=${e => setTxt(e.target.value)} placeholder="Contenido .json (opcional)"></textarea>
      ${txt.trim() && html`<button class="btn secondary" onClick=${async () => {
        try { await guardar(validarJson(txt, Object.fromEntries((await db.foods.toArray()).map(f => [f.id, f])))); }
        catch (e) { setErr(e.message); }
      }}>Cargar .json pegado</button>`}
      <p class="muted small">Tu historial no se pierde: los registros anteriores guardan sus calorías.</p>
    </div>`;
}

function validarJson(texto, byId) {
  let plan;
  try { plan = JSON.parse(texto); } catch { throw new Error('El archivo no es un .json válido'); }
  if (!plan.id || !Array.isArray(plan.comidas)) throw new Error('El archivo no tiene el formato de un plan');
  return plan;
}

// Vista previa de lo que se entendió del PDF, antes de guardarlo
function Vista({ plan, avisos, byId, prefs, onOk, onCancel }) {
  const ref = planRef(plan, byId, prefs);
  const nombres = b => blockFoods(b, plan).filter(x => visibleFood(byId[x.id], prefs))
    .map(x => byId[x.id]?.name.split(' (')[0]).slice(0, 4).join(', ');
  const fila = b => html`
    <div class="vista-b"><${Dot} group=${b.grupo} /><span><b>${b.nombre}</b> <small class="muted">${b.alimentos[0]?.g} g · ${nombres(b)}${blockFoods(b, plan).length > 4 ? '…' : ''}</small></span></div>`;
  return html`
    <div class="form">
      <p class="notice">Revisa que esté bien. Fecha: <b>${fmtDate(plan.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}</b> · ${plan.nutricionista}</p>
      <div class="preview"><span class="muted small">Estimación diaria:</span> <${MacroLine} n=${ref} /></div>
      ${avisos.length > 0 && html`
        <div class="aviso warn"><span><b>No entendí ${avisos.length} cosa${avisos.length > 1 ? 's' : ''}:</b><br />${avisos.slice(0, 8).map(a => html`· ${a}<br />`)}
          <small>Si es importante, pásale el PDF a Claude.</small></span></div>`}
      ${plan.comidas.map(c => html`
        <div class="vista-c">
          <strong>${c.nombre}</strong> <small class="muted">${c.hora}</small>
          ${c.bloques.map(fila)}
          ${c.opciones.map(o => html`<div class="opcion"><small><b>${o.nombre}</b></small>${o.bloques.map(fila)}</div>`)}
        </div>
        ${plan.entreno?.despuesDe === c.id && html`<div class="training"><${Icon} name="bolt" size=${14} /> ${plan.entreno.texto}</div>`}`)}
      <button class="btn" onClick=${onOk}>Usar este plan</button>
      <button class="btn secondary" onClick=${onCancel}>Cancelar</button>
    </div>`;
}
