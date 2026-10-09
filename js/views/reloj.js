// Relojes de entreno (estilo SmartWOD): For Time, AMRAP, EMOM, varios bloques con descanso, intervalos/Tabata y cuenta atrás.
// Pitidos en los últimos 3 segundos de cada tramo, contador de rondas y pantalla siempre encendida.
import { html, useState, useEffect, useRef } from '../lib.js';
import { Num, Seg, Icon } from '../ui.js';
import { textoFormato } from '../entreno/parser.js';

const PREP = 10; // segundos de preparación
const CUENTA_RONDAS = ['amrap', 'fortime', 'rondas', 'bloques'];

// Convierte la configuración en tramos: [{ label, dur, tipo: 'prep'|'trabajo'|'descanso', sube?, bloque? }]
function tramos(cfg) {
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
    case 'intervalos':
      for (let i = 0; i < cfg.rondas; i++) {
        t.push({ label: `Ronda ${i + 1}/${cfg.rondas}`, dur: cfg.trabajo, tipo: 'trabajo' });
        if (i < cfg.rondas - 1 && cfg.descanso) t.push({ label: 'Descanso', dur: cfg.descanso, tipo: 'descanso' });
      }
      break;
  }
  return t;
}

// ---------- Sonido ----------
let ctx;
function pitido(freq = 880, dur = 0.12, vol = 0.25) {
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {}
}

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
    pitido(660, 0.08);
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
    if (seg <= 3 && seg >= 1 && !tramo.sube) pitido(880, 0.1);
    if (st.ultimoSeg != null && seg > st.ultimoSeg) pitido(1320, 0.35, 0.35);
    st.ultimoSeg = seg;
  }
  if (terminado && !st.sonoFin) { st.sonoFin = true; st.fin = true; st.finEn = Math.min(trans, totalDur); pitido(1320, 0.8, 0.4); }

  const trabajoTotal = trans - PREP;
  const enTrabajo = tramo.tipo === 'trabajo' && tramo.bloque != null;
  const rondasBloque = b => st.rondas.filter(r => r.bloque === b);
  const pausar = () => {
    if (st.pausadoEn) { st.pausado += performance.now() - st.pausadoEn; st.pausadoEn = null; }
    else st.pausadoEn = performance.now();
    refrescar(x => x + 1);
  };
  const ronda = () => { st.rondas.push({ t: enTramo, bloque: tramo.bloque }); pitido(1000, 0.05); refrescar(x => x + 1); };
  const terminar = () => {
    if (cfg.tipo === 'bloques') {
      // Terminaste este bloque antes del límite: apuntamos el tiempo y saltamos al descanso
      st.tiempos[tramo.bloque] = enTramo;
      st.inicio -= quedan * 1000;
      st.ultimoSeg = null;
    } else { st.fin = true; st.finEn = trans; st.sonoFin = true; }
    pitido(1320, 0.5);
    refrescar(x => x + 1);
  };
  const nBloques = cfg.tipo === 'bloques' ? cfg.rondas : 1;
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
      <div class="reloj-centro">
        <div class="reloj-label">${terminado ? '¡Terminado!' : tramo.label}</div>
        ${tramo.sub && !terminado && html`<div class="reloj-sub">${tramo.sub}</div>`}
        ${terminado
          ? (cfg.tipo === 'bloques'
            ? html`<div class="reloj-resumen">${resumen.map((r, b) => html`
                <div>${cfg.sub === 'fortime' ? 'For Time' : 'AMRAP'} ${b + 1}: <b>${cfg.sub === 'fortime'
                  ? (r.tiempo != null ? mmss(r.tiempo) : 'sin terminar') + (r.rondas ? ` · ${r.rondas} rondas` : '')
                  : `${r.rondas} rondas`}</b></div>`)}</div>`
            : html`<div class="reloj-num">${mmss(cfg.tipo === 'fortime' || cfg.tipo === 'rondas' ? trabajoTotal : totalDur - PREP)}</div>`)
          : html`<div class="reloj-num">${principal}</div>`}
        ${!terminado && lista[idx + 1] && tramo.tipo !== 'prep' && html`<div class="reloj-next">Después: ${lista[idx + 1].label}${lista[idx + 1].sub ? ` · ${lista[idx + 1].sub}` : ''}</div>`}
        ${CUENTA_RONDAS.includes(cfg.tipo) && enTrabajo && !terminado && html`
          <div class="reloj-rondas">Rondas: <b>${rb.length}</b>${rb.length ? html` <small>(última ${mmss(rb[rb.length - 1].t - (rb[rb.length - 2]?.t || 0))})</small>` : ''}</div>`}
        ${terminado && cfg.tipo !== 'bloques' && st.rondas.length > 0 && html`<div class="reloj-rondas">Rondas: <b>${st.rondas.length}</b></div>`}
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

// Atajos con los formatos más usados
const ATAJOS = [
  { label: '3 × AMRAP 5′ · 2′ descanso', cfg: { tipo: 'bloques', sub: 'amrap', rondas: 3, trabajo: 300, descanso: 120 } },
  { label: '4 × AMRAP 4′ · 1′ descanso', cfg: { tipo: 'bloques', sub: 'amrap', rondas: 4, trabajo: 240, descanso: 60 } },
  { label: '2 × For Time 12′ · 3′ descanso', cfg: { tipo: 'bloques', sub: 'fortime', rondas: 2, trabajo: 720, descanso: 180 } },
  { label: 'Tabata 8 × 20/10', cfg: { tipo: 'intervalos', rondas: 8, trabajo: 20, descanso: 10 } },
  { label: 'EMOM 10′', cfg: { tipo: 'emom', intervalo: 60, total: 600 } },
  { label: 'E2MOM 10′', cfg: { tipo: 'emom', intervalo: 120, total: 600 } },
  { label: 'AMRAP 20′', cfg: { tipo: 'amrap', total: 1200 } },
];

// Configurar un reloj a mano (pestaña Relojes)
export function Relojes({ onIniciar }) {
  const [tipo, setTipo] = useState('bloques');
  const [min, setMin] = useState(12);
  const [intervalo, setIntervalo] = useState(1);
  const [rondas, setRondas] = useState(3);
  const [trabajo, setTrabajo] = useState(5);
  const [descanso, setDescanso] = useState(2);
  const [sub, setSub] = useState('amrap');
  const [trabajoS, setTrabajoS] = useState(20);
  const [descansoS, setDescansoS] = useState(10);
  const [rondasS, setRondasS] = useState(8);
  const [cap, setCap] = useState(null);

  const cfg = {
    bloques: { tipo: 'bloques', sub, rondas: rondas || 1, trabajo: Math.round((trabajo || 1) * 60), descanso: Math.round((descanso || 0) * 60) },
    emom: { tipo: 'emom', intervalo: Math.round((intervalo || 1) * 60), total: Math.round((min || 1) * 60) },
    amrap: { tipo: 'amrap', total: Math.round((min || 1) * 60) },
    fortime: { tipo: 'fortime', cap: cap ? Math.round(cap * 60) : null },
    intervalos: { tipo: 'intervalos', rondas: rondasS || 1, trabajo: trabajoS || 1, descanso: descansoS || 0 },
    tiempo: { tipo: 'tiempo', total: Math.round((min || 1) * 60) },
  }[tipo];

  return html`
    <div class="form">
      <h4>Atajos</h4>
      <div class="chips wrap">
        ${ATAJOS.map(a => html`<button class="chip" onClick=${() => onIniciar(a.cfg)}><${Icon} name="bolt" size=${13} /> ${a.label}</button>`)}
      </div>
      <h4>Hacer uno a medida</h4>
      <div class="chips wrap">
        ${[['bloques', 'Varios bloques con descanso'], ['emom', 'EMOM'], ['amrap', 'AMRAP'], ['fortime', 'For Time'], ['intervalos', 'Intervalos / Tabata'], ['tiempo', 'Cuenta atrás']].map(([v, l]) => html`
          <button class=${'chip' + (tipo === v ? ' on' : '')} onClick=${() => setTipo(v)}>${l}</button>`)}
      </div>
      ${tipo === 'bloques' && html`
        <${Seg} value=${sub} onChange=${setSub} options=${[{ value: 'amrap', label: 'AMRAP' }, { value: 'fortime', label: 'For Time (con límite)' }]} />
        <div class="grid2">
          <label>Bloques<${Num} value=${rondas} onChange=${setRondas} /></label>
          <label>${sub === 'amrap' ? 'Minutos por bloque' : 'Límite por bloque'}<${Num} value=${trabajo} onChange=${setTrabajo} suffix="min" /></label>
        </div>
        <label>Descanso entre bloques<${Num} value=${descanso} onChange=${setDescanso} suffix="min" /></label>
        <p class="muted small">Puedes poner medios minutos: 1,5 = 1:30.</p>`}
      ${(tipo === 'emom' || tipo === 'amrap' || tipo === 'tiempo') && html`<label>Duración<${Num} value=${min} onChange=${setMin} suffix="min" /></label>`}
      ${tipo === 'emom' && html`<label>Cada<${Num} value=${intervalo} onChange=${setIntervalo} suffix="min" /></label>`}
      ${tipo === 'fortime' && html`<label>Tiempo límite (opcional)<${Num} value=${cap} onChange=${setCap} suffix="min" /></label>`}
      ${tipo === 'intervalos' && html`
        <label>Rondas<${Num} value=${rondasS} onChange=${setRondasS} /></label>
        <div class="grid2">
          <label>Trabajo<${Num} value=${trabajoS} onChange=${setTrabajoS} suffix="seg" /></label>
          <label>Descanso<${Num} value=${descansoS} onChange=${setDescansoS} suffix="seg" /></label>
        </div>`}
      <button class="btn" onClick=${() => onIniciar(cfg)}><${Icon} name="bolt" size=${18} /> Empezar ${textoFormato(cfg)}</button>
      <p class="muted small">Empieza con 10 segundos para prepararte. Pita en los 3 últimos segundos de cada tramo.
        Con el iPhone en silencio no suena: quita el modo silencio para oír los pitidos.</p>
    </div>`;
}
