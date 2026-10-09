// Plan del nutricionista: verlo y cargar uno nuevo cada mes.
import { html, useState } from '../lib.js';
import { db, useLive, getPrefs, activePlan, setSetting } from '../db.js';
import { GROUPS, blockFoods, blockRef, visibleFood, sumN, planRef, planRango, fmt, fmtDate } from '../nutri.js';
import { Sheet, Dot, MacroLine, Icon, Num, toast } from '../ui.js';

export function Plan({ go }) {
  const plan = useLive(activePlan, []);
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [importar, setImportar] = useState(false);
  const [editar, setEditar] = useState(null); // { tipo: 'bloque', mealId, optId, idx } | { tipo: 'comida', mealId }

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
          <p class="muted small">✏️ Toca el lápiz de cualquier bloque o comida para corregir el plan a mano (gramos, alimentos, horas).${plan.editado ? ` Última edición: ${fmtDate(plan.editado, { day: 'numeric', month: 'short' })}.` : ''}</p>
          <div class="preview"><span class="muted small">Estimación diaria (media):</span> <${MacroLine} n=${planRef(plan, byId, prefs)} />
            <div class="muted small">Según lo que elijas, un día va de <b>${fmt(planRango(plan, byId, prefs).min)}</b> a <b>${fmt(planRango(plan, byId, prefs).max)} kcal</b>.
              Por ejemplo, 240 g de carne picada de ternera tiene casi el doble de calorías que 240 g de pollo.</div></div>
        </section>
        ${plan.comidas.map(m => html`
          <section class="card meal">
            <header class="meal-head"><div><h3>${m.nombre}</h3><small>${m.hora}</small></div>
              <button class="icon-btn" aria-label="Editar comida" onClick=${() => setEditar({ tipo: 'comida', mealId: m.id })}><${Icon} name="pen" size=${18} /></button></header>
            ${(m.bloques || []).map((b, idx) => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs}
              onEditar=${() => setEditar({ tipo: 'bloque', mealId: m.id, optId: null, idx })} />`)}
            ${(m.opciones || []).length > 0 && html`
              <p class="muted small">Elige una opción:</p>
              ${m.opciones.map(o => html`
                <div class="opcion">
                  <strong>${o.nombre}</strong>
                  ${o.bloques.map((b, idx) => html`<${BloquePlan} b=${b} plan=${plan} byId=${byId} prefs=${prefs}
                    onEditar=${() => setEditar({ tipo: 'bloque', mealId: m.id, optId: o.id, idx })} />`)}
                </div>`)}`}
          </section>
          ${plan.entreno?.despuesDe === m.id && html`<div class="training"><${Icon} name="bolt" size=${16} /> ${plan.entreno.texto}</div>`}`)}
        ${plan.aderezos?.length > 0 && html`
          <section class="card"><h3>Aderezos libres</h3><p class="small">${plan.aderezos.join(' · ')}</p></section>`}`}

      <${Sheet} open=${!!editar} onClose=${() => setEditar(null)} title=${editar?.tipo === 'comida' ? 'Editar comida' : 'Editar bloque'}>
        ${editar?.tipo === 'bloque' && html`<${EditarBloque} plan=${plan} donde=${editar} foods=${foods} byId=${byId} onDone=${() => setEditar(null)} />`}
        ${editar?.tipo === 'comida' && html`<${EditarComida} plan=${plan} mealId=${editar.mealId} onDone=${() => setEditar(null)} />`}
      <//>
      <${Sheet} open=${importar} onClose=${() => setImportar(false)} title="Cargar plan">
        ${importar && html`<${Importar} onDone=${() => setImportar(false)} />`}
      <//>
    </div>`;
}

function BloquePlan({ b, plan, byId, prefs, onEditar }) {
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
      ${onEditar && html`<button class="icon-btn" aria-label="Editar bloque" onClick=${e => { e.stopPropagation(); onEditar(); }}><${Icon} name="pen" size=${18} /></button>`}
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

// ---------- Editar el plan a mano ----------
// Guarda una copia modificada del plan (los días ya registrados no cambian: guardan sus propias calorías)
async function guardarPlan(plan, cambiar) {
  const copia = JSON.parse(JSON.stringify(plan));
  cambiar(copia);
  copia.editado = new Date().toISOString().slice(0, 10);
  await db.plans.put(copia);
  toast('Plan actualizado ✓');
}

const NOMBRE_LISTA = { verde: 'verduras (lista verde)', naranja: 'frutas (lista naranja)', amarilla: 'frutos secos (lista amarilla)' };

function EditarBloque({ plan, donde, foods, byId, onDone }) {
  const meal = plan.comidas.find(m => m.id === donde.mealId);
  const bloques = donde.optId ? meal.opciones.find(o => o.id === donde.optId).bloques : meal.bloques;
  const original = bloques[donde.idx];
  const [b, setB] = useState(() => JSON.parse(JSON.stringify(original)));
  const [q, setQ] = useState('');
  const setAl = (i, cambios) => setB(prev => ({ ...prev, alimentos: prev.alimentos.map((a, j) => (j === i ? { ...a, ...cambios } : a)) }));
  const quitar = i => setB(prev => ({ ...prev, alimentos: prev.alimentos.filter((_, j) => j !== i) }));
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ya = new Set(b.alimentos.map(a => a.f).filter(Boolean));
  const res = q.trim().length < 2 ? [] : foods
    .filter(f => f.group !== 'hogar' && !ya.has(f.id) && norm(`${f.name} ${f.brand || ''}`).includes(norm(q.trim())))
    .slice(0, 12);
  const nombre = a => (a.lista ? `Cualquiera de ${NOMBRE_LISTA[a.lista] || 'la lista ' + a.lista} (${plan.listas?.[a.lista]?.length || 0})` : byId[a.f]?.name || a.f);
  const guardar = async () => {
    await guardarPlan(plan, p => {
      const m = p.comidas.find(x => x.id === donde.mealId);
      const bl = donde.optId ? m.opciones.find(o => o.id === donde.optId).bloques : m.bloques;
      bl[donde.idx] = b;
    });
    onDone();
  };
  return html`
    <div class="form">
      <p class="muted small">${meal.nombre}${donde.optId ? ` · ${meal.opciones.find(o => o.id === donde.optId).nombre}` : ''}. Los gramos son en cocido, como en tu plan.</p>
      <div class="grid2">
        <label>Nombre del bloque<input value=${b.nombre} onInput=${e => setB({ ...b, nombre: e.target.value })} /></label>
        <label>Descripción<input value=${b.texto || ''} onInput=${e => setB({ ...b, texto: e.target.value })} /></label>
      </div>
      <h4>Alimentos y cantidades</h4>
      <div class="list">
        ${b.alimentos.map((a, i) => html`
          <div class="row editar-al">
            <span class="grow">${nombre(a)}</span>
            <div class="copiar-g"><${Num} value=${a.g} onChange=${v => setAl(i, { g: v })} suffix="g" /></div>
            <button class="icon-btn" aria-label="Quitar" onClick=${() => quitar(i)}><${Icon} name="trash" size=${16} /></button>
          </div>`)}
      </div>
      <label>Añadir un alimento a este bloque<input class="search" placeholder="Busca: patata, arroz, ricotta…" value=${q} onInput=${e => setQ(e.target.value)} /></label>
      ${res.length > 0 && html`<div class="list">
        ${res.map(f => html`
          <button class="row" onClick=${() => { setB(prev => ({ ...prev, alimentos: [...prev.alimentos, { f: f.id, g: prev.alimentos[0]?.g || 100 }] })); setQ(''); }}>
            <${Dot} group=${f.group} /><span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}</span><${Icon} name="plus" size=${16} />
          </button>`)}
      </div>`}
      <button class="btn" disabled=${!b.alimentos.length || b.alimentos.some(a => !a.g)} onClick=${guardar}>Guardar cambios</button>
      <button class="link" onClick=${() => setB(JSON.parse(JSON.stringify(original)))}>Deshacer lo que he cambiado aquí</button>
    </div>`;
}

function EditarComida({ plan, mealId, onDone }) {
  const meal = plan.comidas.find(m => m.id === mealId);
  const [nombre, setNombre] = useState(meal.nombre);
  const [hora, setHora] = useState(meal.hora);
  return html`
    <div class="form">
      <label>Nombre<input value=${nombre} onInput=${e => setNombre(e.target.value)} /></label>
      <label>Hora<input type="time" value=${hora} onInput=${e => setHora(e.target.value)} /></label>
      <button class="btn" disabled=${!nombre.trim() || !hora} onClick=${async () => {
        await guardarPlan(plan, p => { const m = p.comidas.find(x => x.id === mealId); m.nombre = nombre.trim(); m.hora = hora; });
        onDone();
      }}>Guardar</button>
    </div>`;
}
