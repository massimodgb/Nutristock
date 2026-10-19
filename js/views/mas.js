// "Más": peso corporal, preferencias y copias de seguridad.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getPrefs, setSetting } from '../db.js';
import { estadoNube, escucharNube, crearCuenta, entrar, salir, sincronizar, decidirNube, nombreTabla } from '../nube.js';
import { listaSupl, guardarListaSupl, idSupl, UNIDADES, NUTR_SUPL, MACROS_SUPL_INFO, textoCant, textoDosis, textoAporte, aporteSupl, cantHabitual, tieneDatos, parseEtiquetaSupl, buscarSuplemento } from '../suplementos.js';
import { Escaner } from './biblioteca.js';
import { estadoWhoop, conectarWhoop, comprobarWhoop, desconectarWhoop, sincronizarWhoop } from '../whoop.js';
import { exportarCopia, estadoCopia, listarInternas, leerInterna, validarCopia, restaurarCopia, seBorranAlRestaurar } from '../copias.js';
import { fmt, todayStr, fmtDate, addDays } from '../nutri.js';
import { Num, Toggle, Icon, Sheet, toast, FotoEtiqueta } from '../ui.js';
import { revisarHistorial } from '../precision.js';

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

      <h2 class="mas-grupo">Mi seguimiento</h2>
      <section class="card list">
        <button class="row" onClick=${() => go('informes')}>
          <${Icon} name="plan" /><span class="grow"><b>Informes</b> para nutricionista y entrenadora</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('perfil')}>
          <${Icon} name="chart" /><span class="grow">Perfil y objetivo</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('guia')}>
          <${Icon} name="check" /><span class="grow">Cómo se usa (guías)</span><${Icon} name="right" size=${18} />
        </button>
      </section>

      <h2 class="mas-grupo">Plan y bibliotecas</h2>
      <section class="card list">
        <button class="row" onClick=${() => go('ideas')}>
          <${Icon} name="bolt" /><span class="grow">Ideas y recetas</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('plan')}>
          <${Icon} name="plan" /><span class="grow">Mi plan de alimentación</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('biblioteca')}>
          <${Icon} name="biblio" /><span class="grow">Biblioteca de productos</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('ejercicios')}>
          <${Icon} name="pesa" /><span class="grow">Biblioteca de ejercicios</span><${Icon} name="right" size=${18} />
        </button>
      </section>

      <h2 class="mas-grupo">Cuerpo y ajustes</h2>
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

      <${ListaSuplementos} />

      <h2 class="mas-grupo">Conexiones</h2>
      <${Nube} />
      <${Whoop} />

      <h2 class="mas-grupo">Datos y seguridad</h2>
      <${TusDatos} persist=${persist} />

      <p class="muted small center">NutriStock · Fase 1</p>
    </div>`;
}

// ---------- Nube: tu cuenta y la sincronización ----------
function Nube() {
  const [e, setE] = useState(estadoNube());
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => escucharNube(setE), []);
  const hace = e.ultima ? Math.round((Date.now() - new Date(e.ultima)) / 60000) : null;
  const accion = async fn => {
    setMsg(null); setTrabajando(true);
    try { await fn(); } catch (err) { setMsg({ error: true, texto: err.message }); }
    setTrabajando(false);
  };

  const lista = c => Object.entries(c || {}).map(([t, n]) => `${n} ${nombreTabla(t)}`).join(', ') || 'nada';
  if (e.conectado && e.conflicto) return html`
    <section class="card form" id="nube">
      <h3>Nube: elige qué datos conservar</h3>
      <p class="aviso warn small">Hay datos <b>en la nube</b> y también <b>en este móvil</b>. Para no mezclar ni perder nada, no se ha tocado ninguno hasta que elijas.</p>
      <p class="small"><b>En la nube:</b> ${lista(e.conflicto.nube)}.</p>
      <p class="small"><b>En este móvil:</b> ${lista(e.conflicto.aqui)}.</p>
      <button class="btn" disabled=${trabajando} onClick=${() => confirm('Este móvil se reemplaza por lo que hay en la nube. Antes se guarda una copia interna de este móvil. ¿Seguir?') && accion(() => decidirNube({ primera: 'nube' }))}>Usar los datos de la nube</button>
      <button class="btn secondary" disabled=${trabajando} onClick=${() => confirm('La nube pasa a tener lo de este móvil. Lo que solo estaba en la nube se marca como borrado (se puede recuperar). Antes se guarda una copia interna. ¿Seguir?') && accion(() => decidirNube({ primera: 'movil' }))}>Usar los datos de este móvil</button>
      <small class="muted">Si dudas, exporta antes una copia en "Tus datos" (aquí abajo). La forma recomendada es usar la app en un solo móvil.</small>
      ${msg && html`<p class="error small">${msg.texto}</p>`}
    </section>`;

  if (e.conectado) return html`
    <section class="card form">
      <h3>Nube</h3>
      ${e.perdida && html`
        <div class="aviso warn small">
          <span><b>Faltan datos en este móvil</b> respecto a la nube: ${e.perdida.map(x => `${x.antes - x.ahora} de ${x.antes} ${nombreTabla(x.tabla)}`).join(', ')}. No se han borrado en la nube.</span>
        </div>
        <button class="btn" disabled=${trabajando} onClick=${() => accion(() => decidirNube({ perdida: 'recuperar' }))}>Recuperarlos de la nube</button>
        <button class="btn secondary danger-text" disabled=${trabajando} onClick=${() => confirm('Se borrarán también en la nube (quedan marcados como borrados y se pueden recuperar desde Supabase). ¿Seguir?') && accion(() => decidirNube({ perdida: 'borrar' }))}>Los borré yo a propósito</button>`}
      <div class=${'aviso ' + (e.error ? 'warn' : 'ok')}>
        <span>${e.ocupado ? 'Sincronizando…' : e.error ? html`<b>No se pudo sincronizar.</b> ${e.error}`
          : html`<b>Tus datos están guardados en la nube ✓</b> Última vez: ${hace == null ? '—' : hace < 1 ? 'ahora mismo' : hace < 60 ? `hace ${hace} min` : new Date(e.ultima).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`}</span>
      </div>
      ${e.aviso && html`<p class="aviso warn small">${e.aviso}</p>`}
      <p class="small muted">Cuenta: ${e.email}. Cada cambio se sube solo a los pocos segundos. Si cambias de móvil o se borra la app, entra con tu cuenta y se recupera todo.</p>
      <button class="btn secondary" disabled=${e.ocupado} onClick=${() => sincronizar().then(r => r && toast('Sincronizado ✓'))}>Sincronizar ahora</button>
      <button class="link small" onClick=${() => confirm('¿Salir de tu cuenta en este iPhone? Tus datos siguen aquí y en la nube.') && accion(salir)}>Salir de la cuenta</button>
    </section>`;

  return html`
    <section class="card form">
      <h3>Nube</h3>
      <p class="small">Guarda una copia de todo en internet, sola y al momento. Así no pierdes nada aunque se borre la app o cambies de móvil.</p>
      <label>Correo<input type="email" autocomplete="email" value=${email} onInput=${ev => setEmail(ev.target.value.trim())} /></label>
      <label>Contraseña<input type="password" autocomplete="current-password" value=${clave} onInput=${ev => setClave(ev.target.value)} /></label>
      ${msg && html`<p class=${msg.error ? 'error small' : 'aviso ok small'}>${msg.texto}</p>`}
      <div class="grid2">
        <button class="btn" disabled=${trabajando || !email || !clave} onClick=${() => accion(async () => { await entrar(email, clave); setClave(''); toast('Conectado ✓'); })}>Entrar</button>
        <button class="btn secondary" disabled=${trabajando || !email || clave.length < 6} onClick=${() => accion(async () => {
          const r = await crearCuenta(email, clave);
          if (r === 'confirmar') setMsg({ texto: 'Cuenta creada. Te ha llegado un correo de Supabase: toca el enlace para confirmarlo y luego vuelve aquí y pulsa "Entrar".' });
          else { setClave(''); toast('Conectado ✓'); }
        })}>Crear cuenta</button>
      </div>
      <small class="muted">La primera vez pulsa "Crear cuenta" (contraseña de 6 caracteres o más). Después, siempre "Entrar".</small>
    </section>`;
}

// ---------- Suplementos: tu lista ----------
// Cada suplemento con su marca, cuánto tomas y lo que aporta (de la etiqueta), para sumarlo a las vitaminas y minerales
function ListaSuplementos() {
  const lista = useLive(listaSupl, []);
  const [editar, setEditar] = useState(null); // índice en la lista, o 'nuevo'
  if (!lista) return null;
  const guardar = s => {
    if (editar === 'nuevo') {
      let id = idSupl(s.nombre);
      while (lista.some(x => x.id === id)) id += '-2';
      guardarListaSupl([...lista, { ...s, id }]);
    } else guardarListaSupl(lista.map((x, j) => (j === editar ? { ...x, ...s, dosis: undefined } : x)));
    setEditar(null);
    toast('Suplemento guardado ✓');
  };
  const quitar = () => {
    const s = lista[editar];
    if (!confirm(`¿Quitar ${s.nombre} de tu lista? Los días que ya marcaste no se borran.`)) return;
    guardarListaSupl(lista.filter((_, j) => j !== editar));
    setEditar(null);
  };
  return html`
    <section class="card">
      <h3>Suplementos</h3>
      <p class="small muted">Los que tomas aparecen en Hoy para marcarlos con un toque. Si pones lo que dice la etiqueta, su magnesio, potasio, vitamina D… se suman a lo que comes en Progreso y en el informe.</p>
      <div class="list supl-lista">
        ${lista.map((s, i) => html`
          <button class="row supl-row" key=${s.id} onClick=${() => setEditar(i)}>
            <span class="grow">
              <b>${s.nombre}</b>${s.marca ? html` <span class="muted">· ${s.marca}</span>` : ''}
              <small class="muted">${textoDosis(s) ? textoDosis(s) + ' al día' : 'Sin cantidad'}${tieneDatos(s) ? ' · ' + textoAporte(aporteSupl(s, cantHabitual(s)), 3) : ''}</small>
              ${!tieneDatos(s) && s.id !== 'creatina' && html`<small class="supl-falta">Sin datos de la etiqueta: tócalo para añadirlos</small>`}
            </span>
            <${Icon} name="right" size=${18} />
          </button>`)}
      </div>
      <button class="btn secondary" onClick=${() => setEditar('nuevo')}><${Icon} name="plus" size=${18} /> Añadir suplemento</button>
      <${Sheet} open=${editar != null} onClose=${() => setEditar(null)} title=${editar === 'nuevo' ? 'Nuevo suplemento' : 'Suplemento'}>
        ${editar != null && html`<${FichaSupl} key=${editar} inicial=${editar === 'nuevo' ? null : lista[editar]}
          onGuardar=${guardar} onQuitar=${editar === 'nuevo' ? null : quitar} />`}
      <//>
    </section>`;
}

// Ficha de un suplemento: nombre, marca, lo que dice la etiqueta y cuánto tomas
function FichaSupl({ inicial, onGuardar, onQuitar }) {
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [marca, setMarca] = useState(inicial?.marca || '');
  const [unidad, setUnidad] = useState(inicial?.unidad || 'capsula');
  const [porcion, setPorcion] = useState(inicial?.porcion ?? 1);
  const [habitual, setHabitual] = useState(inicial?.habitual ?? inicial?.porcion ?? 1);
  const [valores, setValores] = useState(inicial?.valores || {});
  const [notas, setNotas] = useState(inicial?.notas || inicial?.dosis || '');
  const [etiqueta, setEtiqueta] = useState('');
  const [leido, setLeido] = useState(null); // { n, detalles, dudas, porcion, unidad }
  const [codigo, setCodigo] = useState(inicial?.codigo || null);
  const [escanear, setEscanear] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState(null); // lo que encontró el código de barras

  const [, uno, varios] = UNIDADES.find(u => u[0] === unidad);
  const ficha = { nombre: nombre.trim(), marca: marca.trim(), unidad, porcion, habitual, valores, notas: notas.trim(), codigo };
  const aporte = aporteSupl(ficha, habitual);
  // Lee la etiqueta pegada y enseña DE DÓNDE sale cada número y lo que conviene revisar (no guarda nada solo)
  const leer = () => {
    const r = parseEtiquetaSupl(etiqueta);
    const n = Object.keys(r.valores).length;
    if (n) setValores(antes => ({ ...antes, ...r.valores }));
    if (r.porcion) { setPorcion(r.porcion); setUnidad(r.unidad); if (!inicial?.habitual) setHabitual(r.porcion); }
    setLeido({ n, detalles: r.detalles, dudas: r.dudas, porcion: r.porcion, unidad: r.unidad });
  };
  const INFO = Object.fromEntries([...NUTR_SUPL, ...MACROS_SUPL_INFO].map(m => [m.k, m]));
  // Código de barras → Open Food Facts: nombre y marca casi siempre; los números, solo si los tiene
  const leerCodigo = async cod => {
    setEscanear(false);
    setBuscando(true);
    setAviso(null);
    try {
      const r = await buscarSuplemento(cod);
      setCodigo(cod);
      if (!r) { setAviso({ ok: false, texto: `El código ${cod} no está en la base de datos gratuita. Pega la etiqueta o escribe los números abajo.` }); return; }
      if (r.marca) setMarca(r.marca);
      if (r.nombre && !nombre.trim()) setNombre(r.nombre);
      else if (r.nombre && !notas.trim()) setNotas(r.nombre);
      const n = Object.keys(r.valores).length;
      if (n) {
        setValores(antes => ({ ...antes, ...r.valores }));
        if (r.porcion) { setPorcion(r.porcion); setUnidad(r.unidad); if (!inicial?.habitual) setHabitual(r.porcion); }
      }
      const prod = [r.nombre, r.marca].filter(Boolean).join(' · ') || 'el producto';
      setAviso(n
        ? { ok: true, texto: `Encontrado: ${prod}. He puesto ${n} ${n === 1 ? 'dato' : 'datos'} de la base de datos: ${n === 1 ? 'compáralo' : 'compáralos'} con tu etiqueta.` }
        : { ok: false, texto: `Encontrado: ${prod}, pero la base de datos no tiene sus números. Pega la etiqueta (abajo) o escríbelos a mano.` });
    } catch {
      setAviso({ ok: false, texto: 'No hay conexión para buscar el código. Inténtalo luego o pega la etiqueta.' });
    } finally {
      setBuscando(false);
    }
  };
  const cambiarValor = (k, v) => setValores(antes => {
    const nv = { ...antes };
    if (v > 0) nv[k] = v; else delete nv[k];
    return nv;
  });

  return html`
    <div class="form supl-ficha">
      <div class="grid2">
        <label>Nombre<input value=${nombre} placeholder="Magnesio" onInput=${e => setNombre(e.target.value)} /></label>
        <label>Marca<input value=${marca} placeholder="Ej.: Solgar" onInput=${e => setMarca(e.target.value)} /></label>
      </div>

      ${escanear
        ? html`<${Escaner} onCode=${leerCodigo} /><button class="btn secondary" onClick=${() => setEscanear(false)}>Cancelar</button>`
        : html`<button class="btn secondary" disabled=${buscando} onClick=${() => setEscanear(true)}><${Icon} name="scan" size=${18} /> ${buscando ? 'Buscando…' : codigo ? 'Escanear otra vez' : 'Escanear el código de barras'}</button>`}
      ${aviso && html`<p class=${'small supl-aviso' + (aviso.ok ? ' ok' : '')} role="status">${aviso.texto}</p>`}

      <details class="supl-pegar" open=${!inicial || !tieneDatos(inicial)}>
        <summary>Pegar la etiqueta (lo más rápido)</summary>
        <p class="small muted">En Fotos, mantén el dedo sobre la tabla de la etiqueta → Copiar, y pégala aquí.</p>
        <textarea rows="5" value=${etiqueta} placeholder=${'Por dosis diaria (2 cápsulas)\nMagnesio 375 mg 100 %\nVitamina B6 1,4 mg'} onInput=${e => setEtiqueta(e.target.value)}></textarea>
        <${FotoEtiqueta} />
        <button class="btn secondary" disabled=${!etiqueta.trim()} onClick=${leer}>Leer la etiqueta</button>
        ${leido && html`
          <div class="revision-etq" role="status">
            <p class="small"><b>${leido.n ? `He leído ${leido.n} ${leido.n === 1 ? 'dato' : 'datos'}${leido.porcion ? ` por ${textoCant(leido.porcion, leido.unidad)}` : ''}` : 'No he encontrado números'}.</b>
              ${leido.n ? ' Compruébalos con la etiqueta antes de guardar:' : ' Escríbelos abajo a mano.'}</p>
            ${leido.detalles.length > 0 && html`<ul class="small">${leido.detalles.map(d => html`
              <li><b>${INFO[d.k]?.name || d.k} ${String(d.v).replace('.', ',')} ${INFO[d.k]?.unit || ''}</b> <span class="muted">← «${d.linea}»</span></li>`)}</ul>`}
            ${leido.dudas.map(t => html`<p class="aviso warn small">${t}</p>`)}
          </div>`}
      </details>

      <div>
        <p class="supl-paso">¿Cómo lo tomas?</p>
        <div class="chips wrap">
          ${UNIDADES.map(([k, u1, u2]) => html`<button class=${'chip' + (unidad === k ? ' on' : '')} aria-pressed=${unidad === k} onClick=${() => setUnidad(k)}>${u2}</button>`)}
        </div>
      </div>

      <label>Los números de la etiqueta son por
        <${Num} value=${porcion} onChange=${v => v > 0 && setPorcion(v)} suffix=${porcion === 1 ? uno : varios} />
      </label>

      <div>
        <p class="supl-paso">Qué aporta esa cantidad</p>
        <p class="small muted">Pon el mineral en sí ("magnesio", "de los cuales magnesio"), no el compuesto (bisglicinato, citrato…). Deja vacío lo que no traiga.</p>
        <div class="grid2 supl-valores">
          ${NUTR_SUPL.map(m => html`
            <label key=${m.k}>${m.name}<${Num} value=${valores[m.k] ?? null} placeholder="—" onChange=${v => cambiarValor(m.k, v)} suffix=${m.unit} /></label>`)}
        </div>
      </div>

      <label>Cuánto tomas normalmente al día
        <${Num} value=${habitual} onChange=${v => v > 0 && setHabitual(v)} suffix=${habitual === 1 ? uno : varios} />
      </label>
      <details class="supl-macros" open=${MACROS_SUPL_INFO.some(m => valores[m.k] != null)}>
        <summary>Calorías y macros (si los tiene: gominolas, sobres con azúcar, aceites…)</summary>
        <p class="small muted">No todos los suplementos tienen 0 kcal. Si los pones, al marcarlo en Hoy se suman a tus calorías del día. Deja vacío lo que no traiga la etiqueta.</p>
        <div class="grid2 supl-valores">
          ${MACROS_SUPL_INFO.map(m => html`
            <label key=${m.k}>${m.name.replace('· ', '')}<${Num} value=${valores[m.k] ?? null} placeholder="—" onChange=${v => cambiarValor(m.k, v)} suffix=${m.unit} /></label>`)}
        </div>
      </details>
      ${aporte && html`<p class="supl-resumen">Cada día te aporta: ${textoAporte(aporte)}${aporte.kcal ? ` · ${Math.round(aporte.kcal)} kcal` : ''}</p>`}

      <label>Notas (opcional)<input value=${notas} placeholder="Ej.: bisglicinato, por la noche" onInput=${e => setNotas(e.target.value)} /></label>

      <button class="btn" disabled=${!nombre.trim()} onClick=${() => onGuardar(ficha)}>Guardar</button>
      ${onQuitar && html`<button class="btn danger" onClick=${onQuitar}>Quitar de mi lista</button>`}
    </div>`;
}

// ---------- Whoop ----------
function Whoop() {
  const [nube, setNube] = useState(estadoNube());
  const est = useLive(estadoWhoop, []);
  const [msg, setMsg] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => escucharNube(setNube), []);
  if (!est) return null;
  const accion = async (fn, ok) => {
    setMsg(null); setTrabajando(true);
    try { const r = await fn(); if (ok) setMsg({ texto: ok(r) }); } catch (err) { setMsg({ error: true, texto: err.message }); }
    setTrabajando(false);
  };
  const ultima = est.ultima ? new Date(est.ultima).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return html`
    <section class="card form">
      <h3>Whoop</h3>
      ${!nube.conectado ? html`<p class="small muted">Para conectar Whoop, primero entra con tu cuenta en "Nube" (aquí arriba).</p>`
        : est.conectado ? html`
          <div class="aviso ok"><span><b>Whoop conectado ✓</b> ${ultima ? `Última actualización: ${ultima}.` : ''}</span></div>
          <p class="small muted">Recuperación, sueño, esfuerzo y calorías gastadas aparecen en Hoy. Se actualiza solo al abrir la app. Si cambias tu peso en Whoop, se apunta solo.</p>
          <button class="btn secondary" disabled=${trabajando} onClick=${() => accion(() => sincronizarWhoop({ forzar: true }), n => n == null ? 'Actualizado.' : `Actualizado ✓ (${n} datos)`)}>${trabajando ? 'Actualizando…' : 'Actualizar ahora'}</button>
          <button class="link small" onClick=${() => confirm('¿Desconectar Whoop? Los datos ya traídos se quedan.') && accion(desconectarWhoop)}>Desconectar Whoop</button>`
        : html`
          ${est.reconectar && html`<p class="aviso warn small">Whoop pidió volver a conectar (el permiso caducó o se quitó).</p>`}
          <p class="small">Trae tu recuperación, sueño, esfuerzo (strain), calorías gastadas, entrenos y peso.</p>
          <button class="btn" disabled=${trabajando} onClick=${() => accion(conectarWhoop)}>Conectar Whoop</button>
          <small class="muted">Se abre Whoop: entra con tu cuenta y pulsa "Allow / Permitir". Después vuelve a NutriStock.</small>
          ${est.pendiente && html`<button class="btn secondary" disabled=${trabajando} onClick=${() => accion(comprobarWhoop, ok => ok ? 'Whoop conectado ✓' : 'Todavía no aparece conectado. Prueba otra vez "Conectar Whoop".')}>Ya lo he conectado: comprobar</button>`}`}
      ${msg && html`<p class=${msg.error ? 'error small' : 'aviso ok small'}>${msg.texto}</p>`}
    </section>`;
}

// ---------- Revisar registros y productos antiguos (solo informa: no cambia nada) ----------
// Busca datos que pueden descuadrar las calorías: productos sin kcal o macros, kcal que no cuadran
// con los macros (¿columna por ración?), patata o boniato asados contados como hervidos, fichas que cambiaron.
function RevisarHistorial() {
  const [abierto, setAbierto] = useState(false);
  const [r, setR] = useState(null);
  useEffect(() => {
    (async () => setR(revisarHistorial(await db.logs.toArray(), await db.foods.toArray())))();
  }, [abierto]);
  if (!r) return null;
  const total = r.registros.length + r.productos.length;
  return html`
    <h4>Revisar mis datos</h4>
    <button class="row" onClick=${() => setAbierto(true)}>
      <span class="grow">${total ? `A revisar: ${[r.productos.length && `${r.productos.length} ${r.productos.length === 1 ? 'producto' : 'productos'}`, r.registros.length && `${r.registros.length} ${r.registros.length === 1 ? 'registro' : 'registros'}`].filter(Boolean).join(' y ')}` : 'No veo nada raro en tus productos ni en tus registros ✓'}
        <br /><small class="muted">Datos que faltan o no cuadran. Solo informa: no se cambia nada.</small></span>
      ${total > 0 && html`<small class="muted">Ver</small>`}
    </button>
    <${Sheet} open=${abierto} onClose=${() => setAbierto(false)} title="Revisar mis datos">
      ${abierto && html`
        <div class="form">
          <p class="small muted">Nada de esto se ha cambiado. Corrige el producto en Biblioteca y, si quieres, el registro desde Hoy (al tocarlo verás "Recalcular con la ficha actual").</p>
          ${r.productos.length > 0 && html`
            <h4>Productos (${r.productos.length})</h4>
            <div class="list">${r.productos.map(x => html`
              <div class="row"><span class="grow"><b>${x.food.name}</b>${x.food.brand ? html` <small class="muted">${x.food.brand}</small>` : ''}
                ${x.motivos.map(m => html`<br /><small class="muted">· ${m}</small>`)}</span></div>`)}</div>`}
          ${r.registros.length > 0 && html`
            <h4>Registros (${r.registros.length})</h4>
            <div class="list">${r.registros.slice(0, 150).map(x => html`
              <div class="row"><span class="grow"><b>${x.log.name}</b> <small class="muted">${fmtDate(x.log.date)} · ${x.log.g ? fmt(x.log.g) + ' g · ' : ''}${fmt(x.log.n?.kcal)} kcal</small>
                ${x.motivos.map(m => html`<br /><small class="muted">· ${m}</small>`)}</span></div>`)}</div>
            ${r.registros.length > 150 && html`<small class="muted">…y ${r.registros.length - 150} más.</small>`}`}
          ${!total && html`<p>No hay nada que revisar ✓</p>`}
        </div>`}
    <//>`;
}

// ---------- Tus datos: copias y restauración ----------
function TusDatos({ persist }) {
  const [estado, setEstado] = useState(null);
  const [internas, setInternas] = useState([]);
  const [revisar, setRevisar] = useState(null); // { datos, v, origen, borra }
  const [aceptoBorrar, setAceptoBorrar] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  // Antes de enseñar la copia, mira qué se borrará que la copia no trae
  const abrirRevision = async (datos, origen) => {
    const v = validarCopia(datos);
    const borra = v.ok ? await seBorranAlRestaurar(datos) : [];
    setAceptoBorrar(false);
    setRevisar({ datos, v, origen, borra });
  };
  const recargar = async () => { setEstado(await estadoCopia()); setInternas(await listarInternas()); };
  useEffect(() => { recargar(); }, []);

  const exportar = async () => { if (await exportarCopia()) { toast('Copia guardada ✓'); recargar(); } };
  const abrirArchivo = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let datos = null;
    try { datos = JSON.parse(await f.text()); } catch {}
    await abrirRevision(datos, f.name);
  };
  const abrirInterna = async id => {
    const c = await leerInterna(id);
    await abrirRevision(c.datos, `copia automática del ${new Date(c.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
  };
  const restaurar = async () => {
    if (restaurando) return;
    setRestaurando(true);
    try {
      await restaurarCopia(revisar.datos, { confirmarBorrado: aceptoBorrar });
      toast('Copia restaurada ✓ Si te arrepientes: copias automáticas → «antes de restaurar»');
      setRevisar(null);
      setTimeout(() => location.reload(), 1500);
    } catch (err) { alert(err.message); setRestaurando(false); }
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

      <${RevisarHistorial} />

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
              ${revisar.v.resumen.despensa} envases en la despensa · ${revisar.v.resumen.pesos} pesos · ${revisar.v.resumen.entrenos} entrenos · ${revisar.v.resumen.planes} planes
              ${revisar.v.resumen.fecha !== '¿?' ? html`<br />Exportada el ${revisar.v.resumen.fecha}.` : ''}
            </div>
            ${revisar.v.avisos?.length > 0 && html`<ul class="small muted">${revisar.v.avisos.map(x => html`<li>${x}</li>`)}</ul>`}
            <p class="aviso warn">Restaurar <b>reemplaza todo</b> lo que tienes ahora por esta copia. Antes, la app guarda sola una copia automática de lo actual («antes de restaurar»), por si te arrepientes.</p>
            ${revisar.borra?.length > 0 && html`
              <div class="aviso warn pila" role="alert">
                <span><b>Esta copia no trae:</b> ${revisar.borra.map(b => `${b.nombre} (ahora tienes ${b.n})`).join(', ')}. Al restaurar se borrarán.</span>
                <${Toggle} label="Entiendo: borrarlos y dejarlo todo como en la copia" checked=${aceptoBorrar} onChange=${setAceptoBorrar} />
              </div>`}
            <button class="btn danger" disabled=${restaurando || (revisar.borra?.length > 0 && !aceptoBorrar)} onClick=${restaurar}>Reemplazar mis datos por esta copia</button>` : html`
            <p class="error"><b>Este archivo no se puede restaurar.</b> No se ha cambiado nada.</p>
            <ul class="small">${revisar.v.errores.map(e => html`<li>${e}</li>`)}</ul>`}
        </div>`}
    <//>`;
}
