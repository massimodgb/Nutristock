// Biblioteca de alimentos y productos: escanear, pegar etiqueta (Live Text) o crear a mano.
import { html, useState, useEffect, useMemo, useRef } from '../lib.js';
import { db, useLive, getPrefs, round1 } from '../db.js';
import { NUTRS, GROUPS, fmt, parseNum, todayStr } from '../nutri.js';
import { Sheet, Num, Toggle, Dot, Empty, Icon, toast } from '../ui.js';
import { buscarCodigo, parseEtiqueta, iniciarEscaner, leerCodigoDeFoto } from '../importar.js';
import { CantidadStock } from './stock.js';
import { alimentoPorNombre } from '../plan-pdf.js';

export function Biblioteca({ go }) {
  const foods = useLive(() => db.foods.toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  const [sheet, setSheet] = useState(null); // {type:'scan'|'paste'|'form', food?, aviso?}

  if (!foods || !prefs) return html`<div class="loading">Cargando…</div>`;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = foods
    .filter(f => (!grupo || f.group === grupo) && norm(`${f.name} ${f.brand || ''} ${f.barcode || ''}`).includes(norm(q)))
    .filter(f => !(prefs.excluirMar && f.mar) || q)
    .sort((a, b) => (a.source === 'base') - (b.source === 'base') || a.name.localeCompare(b.name));

  const onCode = async code => {
    setSheet({ type: 'loading', code });
    const r = await resolverCodigo(code, foods);
    if (r.estado === 'mio' || r.estado === 'off') setSheet({ type: 'form', food: r.food || r.draft, aviso: r.aviso });
    else setSheet({ type: 'noencontrado', r });
  };

  return html`
    <div class="page">
      <button class="link back" onClick=${() => go('despensa')}>‹ Despensa</button>
      <header class="top"><h1>Productos</h1></header>
      <div class="actions3">
        <button class="action" onClick=${() => setSheet({ type: 'scan' })}><${Icon} name="scan" /><span>Escanear</span></button>
        <button class="action" onClick=${() => setSheet({ type: 'paste' })}><${Icon} name="paste" /><span>Pegar etiqueta</span></button>
        <button class="action" onClick=${() => setSheet({ type: 'form', food: { n: {} } })}><${Icon} name="pen" /><span>A mano</span></button>
      </div>
      <input class="search" placeholder="Buscar…" value=${q} onInput=${e => setQ(e.target.value)} />
      <div class="chips">
        <button class=${'chip' + (!grupo ? ' on' : '')} onClick=${() => setGrupo('')}>Todos</button>
        ${Object.entries(GROUPS).map(([k, g]) => html`
          <button class=${'chip' + (grupo === k ? ' on' : '')} onClick=${() => setGrupo(k)}><${Dot} group=${k} /> ${g.name}</button>`)}
      </div>
      <div class="card list">
        ${list.length === 0 && html`<${Empty}>No hay resultados</${Empty}>`}
        ${list.map(f => html`
          <button class="row" key=${f.id} onClick=${() => setSheet({ type: 'form', food: f })}>
            <${Dot} group=${f.group} />
            <span class="grow">${f.name}${f.brand ? html` <small class="muted">${f.brand}</small>` : ''}
              ${f.source !== 'base' && html` <span class="tag">mío</span>`}${f.mar ? html` <span class="tag">mar</span>` : ''}</span>
            <small class="muted">${fmt(f.n.kcal)} kcal · P ${fmt(f.n.prot)}</small>
          </button>`)}
      </div>

      <${Sheet} open=${sheet?.type === 'scan'} onClose=${() => setSheet(null)} title="Escanear código">
        ${sheet?.type === 'scan' && html`<${Escaner} onCode=${onCode} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'loading'} onClose=${() => setSheet(null)} title="Buscando…">
        <p class="muted">Código leído: <b>${sheet?.code}</b>. Buscando el producto en Open Food Facts…</p>
      <//>
      <${Sheet} open=${sheet?.type === 'noencontrado'} onClose=${() => setSheet(null)} title="Producto nuevo">
        ${sheet?.type === 'noencontrado' && html`<${NoEncontrado} r=${sheet.r}
          onPegar=${() => setSheet({ type: 'paste', draft: sheet.r.draft })}
          onMano=${() => setSheet({ type: 'form', food: sheet.r.draft })}
          onReintentar=${() => onCode(sheet.r.code)}
          onOtro=${() => setSheet({ type: 'scan' })} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'paste'} onClose=${() => setSheet(null)} title="Pegar etiqueta">
        ${sheet?.type === 'paste' && html`<${PegarEtiqueta} onDone=${n => setSheet({ type: 'form',
          food: { ...(sheet.draft || {}), n, source: 'livetext' }, aviso: 'Revisa que los números coincidan con la etiqueta.' })} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'form'} onClose=${() => setSheet(null)} title=${sheet?.food?.id ? 'Editar' : 'Nuevo producto'}>
        ${sheet?.type === 'form' && html`<${FoodForm} key=${sheet.food?.id || 'nuevo'} initial=${sheet.food} aviso=${sheet.aviso}
          foods=${foods} onDone=${() => setSheet(null)}
          onSaved=${f => (sheet.food?.id ? setSheet(null) : setSheet({ type: 'cantidad', food: f }))} />`}
      <//>
      <${Sheet} open=${sheet?.type === 'cantidad'} onClose=${() => setSheet(null)} title="¿Cuánto tienes en casa?">
        ${sheet?.type === 'cantidad' && html`<${CantidadStock} food=${sheet.food} onDone=${() => setSheet(null)} />
          <button class="link" onClick=${() => setSheet(null)}>Ahora no tengo</button>`}
      <//>
    </div>`;
}

// Busca un código: primero en tu biblioteca, luego en Open Food Facts.
// estado: 'mio' (ya lo tenías) | 'off' (encontrado) | 'nuevo' (no está) | 'error' (sin conexión)
export async function resolverCodigo(code, foods) {
  const mine = foods.find(f => f.barcode === code);
  if (mine) return { estado: 'mio', code, food: mine, aviso: 'Ya lo tenías en tu biblioteca.' };
  try {
    const draft = await buscarCodigo(code);
    // Está en Open Food Facts pero sin tabla nutricional (o sin lo básico): no sirve tal cual
    if (draft && (draft.n.kcal == null || draft.n.prot == null || draft.n.carb == null || draft.n.fat == null)) {
      return { estado: 'incompleto', code, draft };
    }
    if (draft) {
      // Clasificarlo solo: "Queso ricotta X" cuenta como Ricotta (así aparece al registrar tu plan)
      const gen = alimentoPorNombre(draft.name);
      const g = gen && foods.find(f => f.id === gen);
      if (g) { draft.genericId = gen; draft.group = g.group; if (g.factor) draft.factor = g.factor; }
    }
    if (draft) return {
      estado: 'off', code, draft,
      aviso: draft.name
        ? 'Encontrado en Open Food Facts. Revisa los datos y elige a qué equivale en tu plan.'
        : 'Encontrado en Open Food Facts con sus calorías y macros, pero sin nombre: escríbelo tú (por ejemplo, "Muesli Hacendado").',
    };
    return { estado: 'nuevo', code, draft: { barcode: code, n: {} } };
  } catch {
    return { estado: 'error', code, draft: { barcode: code, n: {} } };
  }
}

// Pantalla clara para cuando el producto no está o no hay internet
export function NoEncontrado({ r, onPegar, onMano, onReintentar, onOtro }) {
  const sinRed = r.estado === 'error', incompleto = r.estado === 'incompleto';
  const nombre = [r.draft?.name, r.draft?.brand].filter(Boolean).join(' · ');
  return html`
    <div class="resultado-scan">
      <div class=${'res-icon ' + (sinRed ? 'warn' : 'info')}>${sinRed ? '!' : '?'}</div>
      <h3>${sinRed ? 'No hay conexión' : incompleto ? 'Producto sin tabla nutricional' : 'Este producto no está en la base de datos'}</h3>
      ${nombre && html`<p><b>${nombre}</b></p>`}
      <p class="muted">Código leído: <b>${r.code}</b></p>
      <p class="small">${sinRed
        ? 'El código se leyó bien, pero no pude buscarlo porque falla internet. Prueba otra vez cuando tengas cobertura, o rellénalo tú.'
        : incompleto
          ? 'Está en Open Food Facts, pero nadie ha subido sus calorías y macros. Hazle una foto a la tabla y pégala: solo tendrás que hacerlo esta vez.'
          : 'El código se leyó bien, pero nadie lo ha subido todavía a Open Food Facts. Cárgalo una vez y quedará guardado para siempre.'}</p>
      ${sinRed && html`<button class="btn" onClick=${onReintentar}>Reintentar</button>`}
      <button class=${'btn' + (sinRed ? ' secondary' : '')} onClick=${onPegar}><${Icon} name="paste" size=${18} /> Pegar etiqueta (foto de la tabla)</button>
      <button class="btn secondary" onClick=${onMano}><${Icon} name="pen" size=${18} /> Rellenar a mano</button>
      <button class="link" onClick=${onOtro}>Escanear otro producto</button>
    </div>`;
}

export function Escaner({ onCode }) {
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const [lento, setLento] = useState(false);
  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const video = useRef(null);
  useEffect(() => {
    let stop, vivo = true;
    iniciarEscaner(video.current, code => { stop?.(); onCode(code); })
      .then(s => { stop = s; if (!vivo) s(); })
      .catch(e => setErr(e?.message || String(e)));
    // Si en 8 segundos no lee nada, damos consejos
    const t = setTimeout(() => setLento(true), 8000);
    return () => { vivo = false; clearTimeout(t); stop?.(); };
  }, []);

  const foto = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLeyendoFoto(true);
    const code = await leerCodigoDeFoto(file);
    setLeyendoFoto(false);
    if (code) onCode(code);
    else toast('No encontré un código en la foto. Prueba más de cerca y con buena luz.');
  };

  return html`
    <div class="scan-vista">
      <video ref=${video} playsinline muted></video>
      <div class="scan-guia"></div>
      <div class="scan-texto">Pon el código dentro del recuadro</div>
    </div>
    ${err && html`<p class="error">No se pudo abrir la cámara: ${err}. Revisa los permisos de cámara (Ajustes → Safari → Cámara), o usa la foto o el número de abajo.</p>`}
    ${!err && html`<p class="muted small">A unos 15-20 cm, que se vean todas las barras. Cuando lo lea, sonará un pitido.</p>`}
    ${(lento || err) && html`
      <div class="notice">
        <b>¿No lo lee?</b>
        <ul class="steps">
          <li>Aleja un poco el móvil (unos 15-20 cm) y deja que enfoque.</li>
          <li>Si es una bolsa, estírala para que el código quede plano.</li>
          <li>Busca buena luz y evita reflejos.</li>
          <li>O hazle una foto al código, o escribe los números que hay debajo de las barras.</li>
        </ul>
      </div>`}
    <label class="btn secondary">
      <${Icon} name="scan" size=${18} /> ${leyendoFoto ? 'Leyendo la foto…' : 'Hacer foto del código'}
      <input type="file" accept="image/*" capture="environment" hidden onChange=${foto} />
    </label>
    <p class="muted small">O escribe el número que hay debajo de las barras (8 o 13 cifras):</p>
    <div class="inline">
      <input inputmode="numeric" placeholder="8480000…" value=${manual} onInput=${e => setManual(e.target.value.replace(/\D/g, ''))} />
      <button class="btn small" disabled=${manual.length < 6} onClick=${() => onCode(manual)}>Buscar</button>
    </div>`;
}

export function PegarEtiqueta({ onDone }) {
  const [txt, setTxt] = useState('');
  return html`
    <ol class="steps">
      <li>Haz una foto a la tabla nutricional.</li>
      <li>En Fotos, mantén el dedo sobre el texto de la tabla → <b>Seleccionar todo</b> → <b>Copiar</b>.</li>
      <li>Pégalo aquí abajo.</li>
    </ol>
    <textarea rows="8" placeholder="Valor energético 1046 kJ / 250 kcal&#10;Grasas 10 g&#10;…" value=${txt}
      onInput=${e => setTxt(e.target.value)}></textarea>
    <button class="btn" disabled=${!txt.trim()} onClick=${() => {
      const n = parseEtiqueta(txt);
      const found = Object.values(n).filter(v => v != null).length;
      toast(found ? `Leídos ${found} valores` : 'No reconocí valores, rellénalos a mano');
      onDone(n);
    }}>Leer etiqueta</button>`;
}

export function FoodForm({ initial, aviso, foods, onDone, onSaved }) {
  const [f, setF] = useState(() => ({
    name: '', brand: '', group: '', barcode: '', packG: null, unitG: null, unitName: '',
    factor: null, genericId: '', mar: false, minG: null, ...initial, n: { ...(initial?.n || {}) },
  }));
  const [cocido, setCocido] = useState(!!initial?.factor);
  const [cal, setCal] = useState({ crudo: null, cocido: null });
  const esNuevo = !initial?.id;
  const hogar = f.group === 'hogar';
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const setN = (k, v) => setF(prev => ({ ...prev, n: { ...prev.n, [k]: v } }));

  const bases = useMemo(() => foods.filter(x => x.source === 'base').sort((a, b) => a.name.localeCompare(b.name)), [foods]);
  const generic = foods.find(x => x.id === f.genericId);
  const factorHeredado = !f.factor && generic?.factor;

  const save = async () => {
    const food = {
      ...f,
      id: f.id || 'p-' + Date.now().toString(36),
      source: f.source || 'manual',
      group: f.group || generic?.group || 'otro',
      factor: cocido ? f.factor || null : null,
      n: Object.fromEntries(NUTRS.map(({ k }) => [k, f.n[k] ?? 0])),
    };
    if (hogar) { food.factor = null; food.genericId = ''; food.mar = false; }
    if (food.source === 'base') food.edited = true;
    await db.foods.put(food);
    toast('Guardado ✓');
    // Si quien abrió la ficha quiere seguir (por ejemplo, para decir cuánto tienes), le pasamos el producto
    if (onSaved) onSaved(food); else onDone();
  };

  const borrar = async () => {
    if (!confirm(`¿Borrar "${f.name}" de tu biblioteca? También se borra su stock.`)) return;
    await db.lots.where('foodId').equals(f.id).delete();
    await db.foods.delete(f.id);
    toast('Borrado');
    onDone();
  };

  return html`
    <div class="form">
      ${aviso && html`<p class="notice">${aviso}</p>`}
      <label>Nombre<input value=${f.name} onInput=${e => set('name', e.target.value)} placeholder=${hogar ? 'Ej: Toallitas húmedas' : 'Ej: Pechuga de pollo fileteada'} /></label>
      <${Toggle} label="No es comida" hint="Casa, limpieza, higiene: toallitas, papel, detergente…"
        checked=${hogar} onChange=${v => set('group', v ? 'hogar' : '')} />
      <div class="grid2">
        <label>Marca<input value=${f.brand || ''} onInput=${e => set('brand', e.target.value)} placeholder="Hacendado" /></label>
        ${!hogar && html`<label>Grupo
          <select value=${f.group || generic?.group || ''} onChange=${e => set('group', e.target.value)}>
            <option value="">—</option>
            ${Object.entries(GROUPS).filter(([k]) => k !== 'hogar').map(([k, g]) => html`<option value=${k}>${g.name}</option>`)}
          </select>
        </label>`}
      </div>
      ${!hogar && !f.genericId && alimentoPorNombre(f.name) && html`
        <button class="chip on" onClick=${() => {
          const g = foods.find(x => x.id === alimentoPorNombre(f.name));
          setF(prev => ({ ...prev, genericId: g.id, group: prev.group && prev.group !== 'otro' ? prev.group : g.group }));
        }}>Parece "${foods.find(x => x.id === alimentoPorNombre(f.name))?.name}": tocar para que cuente como eso en tu plan</button>`}
      ${!hogar && html`<label>Cuenta como (en tu plan)
        <select value=${f.genericId || ''} onChange=${e => set('genericId', e.target.value)}>
          <option value="">— Ninguno —</option>
          ${bases.filter(b => b.id !== f.id).map(b => html`<option value=${b.id}>${b.name}</option>`)}
        </select>
        <small class="muted">Así, cuando tu plan diga "Pechuga de pollo", te ofrecerá este producto y descontará su stock.</small>
      </label>`}

      ${!hogar && html`<h4>Por 100 g (como viene en la etiqueta)</h4>
      <div class="grid2">
        ${NUTRS.map(({ k, name, unit }) => html`
          <label>${name.replace('· ', '')}<${Num} value=${f.n[k]} onChange=${v => setN(k, v)} suffix=${unit} /></label>`)}
      </div>`}

      <h4>Envase</h4>
      <div class="grid2">
        ${!hogar && html`<label>Peso de cada envase<${Num} value=${f.packG} onChange=${v => set('packG', v)} suffix="g" /></label>`}
        <label>El envase se llama<input value=${f.envase || ''} onInput=${e => set('envase', e.target.value)} placeholder=${hogar ? 'paquete, rollo, bote…' : 'bolsa, paquete, bote…'} /></label>
        ${!hogar && html`
          <label>Peso de cada unidad<${Num} value=${f.unitG} onChange=${v => set('unitG', v)} suffix="g" /></label>
          <label>La unidad se llama<input value=${f.unitName || ''} onInput=${e => set('unitName', e.target.value)} placeholder="rebanada, yogur, huevo…" /></label>`}
        <label>Código de barras<input inputmode="numeric" value=${f.barcode || ''} onInput=${e => set('barcode', e.target.value.trim())} /></label>
      </div>
      ${!hogar && html`<small class="muted">Ej.: pan de molde → envase "bolsa" de 450 g, unidad "rebanada" de 30 g. Yogures → envase "pack" de 500 g, unidad "yogur" de 125 g.</small>`}

      ${!hogar && html`<h4>Cocción</h4>`}
      ${!hogar && html`<${Toggle} label="Lo peso cocinado" checked=${cocido} onChange=${setCocido}
        hint=${factorHeredado && !cocido ? `Usa el factor de ${generic.name}: ×${fmt(generic.factor, 2)}` : 'Para arroz, pasta, carnes…'} />
      ${cocido && html`
        <label>Factor (peso cocido ÷ peso crudo)<${Num} value=${f.factor} onChange=${v => set('factor', v)} suffix="×" /></label>
        <div class="calib">
          <small>Calibrar con tu cocina: pesa en crudo, cocina y vuelve a pesar.</small>
          <div class="grid2">
            <${Num} value=${cal.crudo} onChange=${v => setCal({ ...cal, crudo: v })} suffix="g crudo" />
            <${Num} value=${cal.cocido} onChange=${v => setCal({ ...cal, cocido: v })} suffix="g cocido" />
          </div>
          ${cal.crudo && cal.cocido && html`
            <button class="btn small" onClick=${() => set('factor', Math.round((cal.cocido / cal.crudo) * 100) / 100)}>
              Usar factor ×${fmt(cal.cocido / cal.crudo, 2)}
            </button>`}
        </div>`}`}

      ${!hogar && html`<${Toggle} label="Es comida del mar" checked=${!!f.mar} onChange=${v => set('mar', v)} />`}
      ${esNuevo && html`<p class="muted small">Al guardar podrás decir cuántos tienes en casa.</p>`}

      <button class="btn" disabled=${!f.name || (!hogar && f.n.kcal == null)} onClick=${save}>Guardar</button>
      ${!esNuevo && f.source !== 'base' && html`<button class="btn danger" onClick=${borrar}><${Icon} name="trash" size=${18} /> Borrar producto</button>`}
    </div>`;
}
