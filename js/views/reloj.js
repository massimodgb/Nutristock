// Relojes de entreno (estilo SmartWOD): For Time, AMRAP, EMOM, varios bloques con descanso, intervalos/Tabata y cuenta atrás.
// Pitidos en los últimos 3 segundos de cada tramo, contador de rondas y pantalla siempre encendida.
import { html, useState, useEffect, useRef } from '../lib.js';
import { useLive, getSetting, setSetting } from '../db.js';
import { Num, Seg, Icon, toast, Destello } from '../ui.js';
import { textoFormato } from '../entreno/parser.js';
import { avisar, desbloquearAudio, configurarSonido, probarSonido, DEF_SONIDO } from '../sonido.js';
import { fmtTiempo } from '../tiempo.js';

const PREP = 10; // segundos de preparación
const CUENTA_RONDAS = ['amrap', 'fortime', 'rondas', 'bloques', 'segmentos', 'personalizado'];
const POR_BLOQUES = ['bloques', 'segmentos', 'personalizado'];

// Convierte la configuración en tramos: [{ label, dur, tipo: 'prep'|'trabajo'|'descanso', sube?, bloque? }]
export function tramos(cfg) {
  const t = [{ label: 'Prepárate', dur: PREP, tipo: 'prep' }];
  switch (cfg.tipo) {
    case 'fortime': t.push({ label: 'For Time', dur: cfg.cap || 99 * 60, tipo: 'trabajo', sube: true, bloque: 0 }); break;
    case 'rondas': t.push({ label: `${cfg.rondas} rondas`, dur: 99 * 60, tipo: 'trabajo', sube: true, bloque: 0 }); break;
    case 'amrap': t.push({ label: 'AMRAP', dur: cfg.total, tipo: 'trabajo', bloque: 0 }); break;
    case 'tiempo': t.push({ label: 'Tiempo', dur: cfg.total, tipo: 'trabajo' }); break;
    case 'emom': {
      const n = Math.round(cfg.total / cfg.intervalo), est = cfg.estaciones || [];
      for (let i = 0; i < n; i++) {
        const e = est.length ? est[i % est.length] : '';
        t.push({ label: `${cfg.intervalo === 60 ? 'Minuto' : 'Intervalo'} ${i + 1}/${n}`, sub: e, dur: cfg.intervalo, tipo: /^rest|descanso/i.test(e) ? 'descanso' : 'trabajo' });
      }
      break;
    }
    // Varios AMRAP / For Time seguidos, con descanso entre ellos
    case 'bloques':
      for (let i = 0; i < cfg.rondas; i++) {
        const nombre = cfg.sub === 'fortime' ? 'For Time' : 'AMRAP';
        t.push({ label: `${nombre} ${i + 1}/${cfg.rondas}`, dur: cfg.trabajo, tipo: 'trabajo', sube: cfg.sub === 'fortime', bloque: i });
        if (i < cfg.rondas - 1 && cfg.descanso) t.push({ label: 'Descanso', dur: cfg.descanso, tipo: 'descanso' });
      }
      break;
    // Tramos por minutos: "0-8 trabajo, 8-10 descanso, 10-20 trabajo" (cada tramo de trabajo cuenta sus rondas)
    case 'segmentos': {
      let b = 0;
      for (const x of cfg.tramos || []) {
        const dur = (x.hasta - x.desde) * 60;
        if (x.descanso) t.push({ label: 'Descanso', sub: `Min ${x.desde}-${x.hasta}`, dur, tipo: 'descanso' });
        else t.push({ label: x.label, sub: `Min ${x.desde}-${x.hasta}`, dur, tipo: 'trabajo', bloque: b++ });
      }
      break;
    }
    // A medida: tramos con nombre (trabajo, descanso, preparación), y repetir todo N veces
    case 'personalizado': {
      let b = 0;
      const n = Math.max(1, cfg.repetir || 1);
      for (let r = 0; r < n; r++) {
        for (const x of cfg.bloques || []) {
          const sub = n > 1 ? `Vuelta ${r + 1} de ${n}` : '';
          const label = x.nombre || (x.tipo === 'descanso' ? 'Descanso' : x.tipo === 'prep' ? 'Prepárate' : 'Trabajo');
          if (x.tipo === 'trabajo') t.push({ label, sub, dur: x.dur, tipo: 'trabajo', bloque: b++ });
          else t.push({ label, sub, dur: x.dur, tipo: x.tipo === 'prep' ? 'prep' : 'descanso' });
        }
      }
      break;
    }
    case 'intervalos':
      for (let i = 0; i < cfg.rondas; i++) {
        t.push({ label: `Ronda ${i + 1}/${cfg.rondas}`, dur: cfg.trabajo, tipo: 'trabajo' });
        if (i < cfg.rondas - 1 && cfg.descanso) t.push({ label: 'Descanso', dur: cfg.descanso, tipo: 'descanso' });
      }
      break;
  }
  return t;
}

// ---------- Sonido: ver sonido.js (pitidos, voz, destello, vibración) ----------

const mmss = s => {
  s = Math.max(0, Math.round(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Pantalla completa del reloj en marcha
export function RelojActivo({ cfg, onCerrar, onResultado }) {
  const lista = useRef(tramos(cfg)).current;
  const totalDur = lista.reduce((s, x) => s + x.dur, 0);
  const [, refrescar] = useState(0);
  // rondas: [{ t, bloque }] · tiempos: tiempo de cada bloque For Time terminado antes del límite
  const st = useRef({ inicio: performance.now(), pausadoEn: null, pausado: 0, ultimoSeg: null, fin: false, rondas: [], tiempos: {} }).current;
  const wake = useRef(null);

  useEffect(() => {
    desbloquearAudio(); // se abre tras tu toque en "Empezar": iOS lo necesita para poder pitar
    avisar('inicio');
    navigator.wakeLock?.request('screen').then(w => { wake.current = w; }).catch(() => {});
    const id = setInterval(() => refrescar(x => x + 1), 100);
    return () => { clearInterval(id); wake.current?.release?.(); };
  }, []);

  const ahora = st.pausadoEn ?? performance.now();
  const trans = st.fin ? st.finEn : (ahora - st.inicio - st.pausado) / 1000;
  // Tramo actual
  let acum = 0, idx = 0;
  while (idx < lista.length - 1 && trans >= acum + lista[idx].dur) { acum += lista[idx].dur; idx++; }
  const tramo = lista[idx];
  const enTramo = trans - acum;
  const quedan = tramo.dur - enTramo;
  const terminado = st.fin || trans >= totalDur;

  // Pitidos: 3-2-1 y uno largo al cambiar de tramo
  const seg = Math.ceil(quedan);
  if (!terminado && !st.pausadoEn && seg !== st.ultimoSeg) {
    if (seg <= 3 && seg >= 1 && !tramo.sube) avisar('cuenta');
    if (st.ultimoSeg != null && seg > st.ultimoSeg) avisar('cambio', tramo.label);
    st.ultimoSeg = seg;
  }
  if (terminado && !st.sonoFin) { st.sonoFin = true; st.fin = true; st.finEn = Math.min(trans, totalDur); avisar('fin'); }

  const trabajoTotal = trans - PREP;
  const enTrabajo = tramo.tipo === 'trabajo' && tramo.bloque != null;
  const rondasBloque = b => st.rondas.filter(r => r.bloque === b);
  const pausar = () => {
    if (st.pausadoEn) { st.pausado += performance.now() - st.pausadoEn; st.pausadoEn = null; }
    else st.pausadoEn = performance.now();
    refrescar(x => x + 1);
  };
  const ronda = () => { st.rondas.push({ t: enTramo, bloque: tramo.bloque }); avisar('ronda'); refrescar(x => x + 1); };
  const terminar = () => {
    if (POR_BLOQUES.includes(cfg.tipo)) {
      // Terminaste este bloque antes del límite: apuntamos el tiempo y saltamos al descanso
      st.tiempos[tramo.bloque] = enTramo;
      st.inicio -= quedan * 1000;
      st.ultimoSeg = null;
    } else { st.fin = true; st.finEn = trans; st.sonoFin = true; }
    avisar('cambio');
    refrescar(x => x + 1);
  };
  const nombresBloque = lista.filter(x => x.bloque != null).map(x => x.label + (x.sub ? ` (${x.sub})` : ''));
  const nBloques = cfg.tipo === 'bloques' ? cfg.rondas : POR_BLOQUES.includes(cfg.tipo) ? nombresBloque.length : 1;
  const resumen = Array.from({ length: nBloques }, (_, b) => ({
    rondas: rondasBloque(b).length,
    tiempo: st.tiempos[b] ?? (cfg.tipo === 'fortime' ? trabajoTotal : null),
  }));
  const resultado = () => {
    onResultado?.({ segundos: Math.max(0, Math.round(trabajoTotal)), rondas: st.rondas.length, bloques: resumen });
    onCerrar();
  };

  const principal = tramo.sube && tramo.tipo === 'trabajo' ? mmss(enTramo) : mmss(quedan);
  const rb = enTrabajo ? rondasBloque(tramo.bloque) : [];
  return html`
    <div class=${'reloj ' + (terminado ? 'fin' : tramo.tipo)}>
      <div class="reloj-top">
        <button class="link" onClick=${onCerrar}>Cerrar</button>
        <span>${textoFormato(cfg)}</span>
        <span>${tramo.tipo !== 'prep' && !terminado ? `Total ${mmss(Math.max(0, trabajoTotal))}` : ''}</span>
      </div>
      <${Destello} />
      <div class="reloj-prog" aria-hidden="true"><i style=${{ transform: `scaleX(${Math.min(1, Math.max(0, trans - PREP) / Math.max(1, totalDur - PREP))})` }}></i></div>
      <div class="reloj-centro">
        <div class="reloj-label">${terminado ? '¡Terminado!' : tramo.label}</div>
        ${tramo.sub && !terminado && html`<div class="reloj-sub">${tramo.sub}</div>`}
        ${terminado
          ? (POR_BLOQUES.includes(cfg.tipo)
            ? html`<div class="reloj-resumen">${resumen.map((r, b) => html`
                <div>${cfg.tipo === 'bloques' ? `${cfg.sub === 'fortime' ? 'For Time' : 'AMRAP'} ${b + 1}` : nombresBloque[b]}: <b>${cfg.sub === 'fortime'
                  ? (r.tiempo != null ? mmss(r.tiempo) : 'sin terminar') + (r.rondas ? ` · ${r.rondas} rondas` : '')
                  : `${r.rondas} rondas`}</b></div>`)}</div>`
            : html`<div class="reloj-num">${mmss(cfg.tipo === 'fortime' || cfg.tipo === 'rondas' ? trabajoTotal : totalDur - PREP)}</div>`)
          : html`<div class="reloj-num">${principal}</div>`}
        ${!terminado && lista[idx + 1] && html`<div class="reloj-next">Después: ${lista[idx + 1].label}${lista[idx + 1].sub ? ` · ${lista[idx + 1].sub}` : ''} (${mmss(lista[idx + 1].dur)})</div>`}
        ${!terminado && tramo.tipo !== 'prep' && html`<div class="reloj-tramo">Tramo ${idx} de ${lista.length - 1} · quedan ${mmss(Math.max(0, totalDur - trans))} en total</div>`}
        ${CUENTA_RONDAS.includes(cfg.tipo) && enTrabajo && !terminado && html`
          <div class="reloj-rondas">Rondas: <b>${rb.length}</b>${rb.length ? html` <small>(última ${mmss(rb[rb.length - 1].t - (rb[rb.length - 2]?.t || 0))})</small>` : ''}</div>`}
        ${terminado && !POR_BLOQUES.includes(cfg.tipo) && st.rondas.length > 0 && html`<div class="reloj-rondas">Rondas: <b>${st.rondas.length}</b></div>`}
      </div>
      <div class="reloj-botones">
        ${terminado ? html`
          ${onResultado && html`<button class="btn" onClick=${resultado}>Guardar resultado</button>`}
          <button class="btn secondary" onClick=${onCerrar}>Salir</button>` : html`
          <button class="btn secondary" onClick=${pausar}>${st.pausadoEn ? 'Seguir' : 'Pausa'}</button>
          ${CUENTA_RONDAS.includes(cfg.tipo) && enTrabajo && html`<button class="btn ronda" onClick=${ronda}>+1 ronda</button>`}
          ${(cfg.tipo === 'fortime' || cfg.tipo === 'rondas' || (cfg.tipo === 'bloques' && cfg.sub === 'fortime')) && enTrabajo && html`
            <button class="btn" onClick=${terminar}>Terminé</button>`}`}
      </div>
    </div>`;
}

// Modos clásicos (pocos y editables) + "Personalizado" por tramos + tus favoritos
const MODOS = [['fortime', 'For Time'], ['amrap', 'AMRAP'], ['emom', 'EMOM / cada X'], ['intervalos', 'Intervalos / Tabata'], ['personalizado', 'Personalizado']];
const TIPOS_BLOQUE = [['trabajo', 'Trabajo'], ['descanso', 'Descanso'], ['prep', 'Preparación']];
// El ejemplo típico: minuto 0 al 8 trabajo A, del 8 al 10 descanso, del 10 al 20 trabajo B
const BLOQUES_EJEMPLO = [
  { tipo: 'trabajo', nombre: 'Trabajo A', dur: 480 },
  { tipo: 'descanso', nombre: 'Descanso', dur: 120 },
  { tipo: 'trabajo', nombre: 'Trabajo B', dur: 600 },
];
export const duracionTotal = cfg => tramos(cfg).reduce((s, t) => s + t.dur, 0) - PREP;

export function Relojes({ onIniciar }) {
  const favs = useLive(() => getSetting('relojesFav', []), []);
  const [tipo, setTipo] = useState('fortime');
  const [min, setMin] = useState(12);
  const [intervalo, setIntervalo] = useState(1);
  const [cap, setCap] = useState(null);
  const [trabajoS, setTrabajoS] = useState(20);
  const [descansoS, setDescansoS] = useState(10);
  const [rondasS, setRondasS] = useState(8);
  const [bloques, setBloques] = useState(BLOQUES_EJEMPLO);
  const [repetir, setRepetir] = useState(1);
  const [nombreFav, setNombreFav] = useState('');
  if (!favs) return null;

  const cfg = {
    fortime: { tipo: 'fortime', cap: cap ? Math.round(cap * 60) : null },
    amrap: { tipo: 'amrap', total: Math.round((min || 1) * 60) },
    emom: { tipo: 'emom', intervalo: Math.round((intervalo || 1) * 60), total: Math.round((min || 1) * 60) },
    intervalos: { tipo: 'intervalos', rondas: rondasS || 1, trabajo: trabajoS || 1, descanso: descansoS || 0 },
    personalizado: { tipo: 'personalizado', bloques: bloques.filter(b => b.dur > 0), repetir: repetir || 1 },
  }[tipo];
  const valido = tipo !== 'personalizado' || cfg.bloques.length > 0;
  const cambiarBloque = (i, c) => setBloques(bloques.map((b, j) => (j === i ? { ...b, ...c } : b)));
  const mover = (i, d) => { const n = [...bloques]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setBloques(n); };
  const guardarFav = async () => {
    const nombre = nombreFav.trim() || textoFormato(cfg);
    await setSetting('relojesFav', [...(await getSetting('relojesFav', [])), { id: Date.now().toString(36), nombre, cfg }]);
    setNombreFav('');
    toast(`"${nombre}" guardado en favoritos ✓`);
  };
  const quitarFav = async id => setSetting('relojesFav', (await getSetting('relojesFav', [])).filter(f => f.id !== id));

  return html`
    <div class="form relojes">
      ${favs.length > 0 && html`
        <h4>Tus favoritos</h4>
        <div class="favs">${favs.map(f => html`
          <div class="fav" key=${f.id}>
            <button class="chip" onClick=${() => onIniciar(f.cfg)}><${Icon} name="bolt" size=${13} /> ${f.nombre}</button>
            <button class="icon-btn" aria-label=${'Quitar ' + f.nombre} onClick=${() => quitarFav(f.id)}><${Icon} name="trash" size=${14} /></button>
          </div>`)}</div>`}
      <h4>Modo</h4>
      <div class="chips wrap">${MODOS.map(([v, l]) => html`
        <button class=${'chip' + (tipo === v ? ' on' : '')} aria-pressed=${tipo === v} onClick=${() => setTipo(v)}>${l}</button>`)}</div>

      ${tipo === 'fortime' && html`<label>Tiempo límite (opcional)<${Num} value=${cap} onChange=${setCap} suffix="min" /></label>`}
      ${(tipo === 'amrap' || tipo === 'emom') && html`<label>Duración total<${Num} value=${min} onChange=${setMin} suffix="min" /></label>`}
      ${tipo === 'emom' && html`<label>Cada<${Num} value=${intervalo} onChange=${setIntervalo} suffix="min" /></label>
        <small class="muted">1,5 = cada 1:30. Es un intervalo fijo: cada serie empieza cuando toca, acabes cuando acabes.</small>`}
      ${tipo === 'intervalos' && html`
        <label>Rondas<${Num} value=${rondasS} onChange=${setRondasS} /></label>
        <div class="grid2">
          <label>Trabajo<${Num} value=${trabajoS} onChange=${setTrabajoS} suffix="seg" /></label>
          <label>Descanso<${Num} value=${descansoS} onChange=${setDescansoS} suffix="seg" /></label>
        </div>
        <button class="link small" onClick=${() => { setRondasS(8); setTrabajoS(20); setDescansoS(10); }}>Poner Tabata (8 × 20/10)</button>`}
      ${tipo === 'personalizado' && html`
        <small class="muted">Encadena tramos con su nombre y duración. Ejemplo: minuto 0-8 trabajo, 8-10 descanso, 10-20 trabajo.</small>
        <div class="tramos-editor">${bloques.map((b, i) => html`
          <div class=${'tramo-ed ' + b.tipo} key=${i}>
            <div class="inline">
              <select value=${b.tipo} aria-label="Tipo de tramo" onChange=${e => cambiarBloque(i, { tipo: e.target.value })}>
                ${TIPOS_BLOQUE.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
              <input value=${b.nombre} placeholder="Nombre" aria-label="Nombre del tramo" onInput=${e => cambiarBloque(i, { nombre: e.target.value })} />
            </div>
            <div class="inline">
              <div class="tramo-t"><${Num} value=${Math.floor(b.dur / 60)} onChange=${v => cambiarBloque(i, { dur: (v || 0) * 60 + (b.dur % 60) })} suffix="min" /></div>
              <div class="tramo-t"><${Num} value=${b.dur % 60} onChange=${v => cambiarBloque(i, { dur: Math.floor(b.dur / 60) * 60 + Math.min(59, v || 0) })} suffix="seg" /></div>
              <button class="icon-btn" disabled=${i === 0} aria-label="Subir" onClick=${() => mover(i, -1)}>↑</button>
              <button class="icon-btn" aria-label="Quitar tramo" onClick=${() => setBloques(bloques.filter((_, j) => j !== i))}><${Icon} name="trash" size=${14} /></button>
            </div>
          </div>`)}</div>
        <div class="inline">
          <button class="btn small secondary" onClick=${() => setBloques([...bloques, { tipo: 'trabajo', nombre: `Trabajo ${String.fromCharCode(65 + bloques.filter(b => b.tipo === 'trabajo').length)}`, dur: 300 }])}>+ Trabajo</button>
          <button class="btn small secondary" onClick=${() => setBloques([...bloques, { tipo: 'descanso', nombre: 'Descanso', dur: 120 }])}>+ Descanso</button>
        </div>
        <label>Repetir todo<${Num} value=${repetir} onChange=${setRepetir} suffix="veces" /></label>`}

      <p class="small"><b>${textoFormato(cfg)}</b>${tipo !== 'fortime' ? html` <span class="muted">· total ${fmtTiempo(duracionTotal(cfg))}</span>` : ''}</p>
      <button class="btn" disabled=${!valido} onClick=${() => onIniciar(cfg)}><${Icon} name="bolt" size=${18} /> Empezar</button>
      <div class="inline">
        <input value=${nombreFav} placeholder="Nombre (opcional)" aria-label="Nombre del favorito" onInput=${e => setNombreFav(e.target.value)} />
        <button class="btn small secondary" disabled=${!valido} onClick=${guardarFav}>Guardar en favoritos</button>
      </div>
    </div>
    <${AjustesSonido} />`;
}

// Cómo suenan los avisos (relojes y descanso entre series)
export function AjustesSonido() {
  const s = useLive(() => getSetting('sonido', {}), []);
  if (!s) return null;
  const c = { ...DEF_SONIDO, ...s };
  const poner = async cambios => { const n = { ...c, ...cambios }; await setSetting('sonido', n); configurarSonido(n); };
  const fila = (k, t) => html`<label class="inline"><input type="checkbox" checked=${!!c[k]} onChange=${e => poner({ [k]: e.target.checked })} /> ${t}</label>`;
  return html`
    <section class="form sonido">
      <h4>Sonido de los avisos</h4>
      <label>Volumen
        <div class="chips wrap">${[['normal', 'Normal'], ['alto', 'Alto (se oye encima de la música)']].map(([v, t]) => html`
          <button class=${'chip' + (c.volumen === v ? ' on' : '')} onClick=${() => poner({ volumen: v })}>${t}</button>`)}</div></label>
      <label>Si tienes música puesta
        <div class="chips wrap">${[['bajar', 'Bajarla un momento al pitar'], ['mezclar', 'Mezclar sin bajarla'], ['pausar', 'Pausarla al pitar']].map(([v, t]) => html`
          <button class=${'chip' + (c.musica === v ? ' on' : '')} onClick=${() => poner({ musica: v })}>${t}</button>`)}</div></label>
      ${fila('cuenta', 'Pitidos de cuenta atrás (3, 2, 1)')}
      ${fila('voz', 'Voz al cambiar de tramo ("Descanso", "Minuto 3"…)')}
      ${fila('destello', 'Destello en la pantalla en cada cambio')}
      ${fila('vibrar', 'Vibrar (solo funciona en Android)')}
      <button class="btn secondary" onClick=${probarSonido}>Probar sonido</button>
      <p class="muted small">Pon tu música y pulsa "Probar sonido" para ver cómo se oye. Funciona con la app abierta y la pantalla encendida
        (la app no deja que se apague mientras corre un reloj). Con la pantalla bloqueada o la app en segundo plano, el iPhone no deja
        que una web pite. El interruptor de silencio también puede callarla.</p>
    </section>`;
}
