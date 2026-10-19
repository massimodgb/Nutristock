// Avisos de los relojes: pitidos, voz, destello y vibración.
//
// Lo que permite el iPhone (Safari / app instalada), dicho claro:
//  - Con la app ABIERTA y la pantalla encendida, los pitidos suenan aunque haya música. La app mantiene
//    la pantalla encendida mientras corre un reloj.
//  - Con "Bajar la música un momento" se pide a iOS que baje la música mientras pita (Audio Session de Safari,
//    iOS 16.4 o posterior). Si tu iPhone no lo admite, suena igualmente mezclado con la música.
//  - Con la pantalla BLOQUEADA o la app en segundo plano, una web NO puede pitar con fiabilidad: iOS la duerme.
//  - El interruptor de silencio del iPhone puede callar los pitidos.
//  - La vibración no existe en Safari del iPhone (solo en Android): por eso hay destello en pantalla.
export const DEF_SONIDO = { volumen: 'alto', musica: 'bajar', cuenta: true, voz: false, destello: true, vibrar: true };
let cfg = { ...DEF_SONIDO };
let ctx = null;
let parar = null;

export const cfgSonido = () => cfg;
// Tipo de sesión de audio que se pide a Safari según lo que elijas con la música
export function tipoSesion(c = cfg) {
  return c.musica === 'mezclar' ? 'ambient' : c.musica === 'pausar' ? 'transient-solo' : 'transient';
}
function aplicarSesion() {
  try { if (navigator.audioSession) navigator.audioSession.type = tipoSesion(); } catch {}
}
export function configurarSonido(c) { cfg = { ...DEF_SONIDO, ...(c || {}) }; aplicarSesion(); }

// Hay que "despertar" el audio con un toque tuyo (al pulsar Empezar o Completar serie): iOS lo exige
export function desbloquearAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    aplicarSesion();
    if (ctx.state !== 'running') ctx.resume();
    // Un sonido mudo y cortísimo deja el audio listo para luego
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch {}
}

// Un pitido. Con volumen alto se usa una onda más "cortante" (se distingue mejor encima de la música)
export function pitido(freq = 880, dur = 0.12, fuerza = 1) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    aplicarSesion();
    if (ctx.state !== 'running') ctx.resume();
    clearTimeout(parar);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    o.type = cfg.volumen === 'alto' ? 'square' : 'sine';
    o.frequency.value = freq;
    const vol = (cfg.volumen === 'alto' ? 0.55 : 0.25) * fuerza;
    // Subida y bajada rápidas (sin "clic")
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(comp).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    // Al terminar se "suelta" el audio para que la música vuelva a su volumen
    if (cfg.musica !== 'mezclar') parar = setTimeout(() => { try { ctx.suspend(); } catch {} }, (dur + 0.4) * 1000);
  } catch {}
}

export function decir(texto) {
  if (!cfg.voz || !texto || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES'; u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

const vibrar = patron => { if (cfg.vibrar) try { navigator.vibrate?.(patron); } catch {} };
// Destello a pantalla completa (lo pinta quien escuche este evento: reloj y descanso)
const destello = tipo => { if (cfg.destello) window.dispatchEvent(new CustomEvent('ns-destello', { detail: tipo })); };

// Avisos con nombre: así reloj y descanso suenan igual
export function avisar(tipo, texto) {
  switch (tipo) {
    case 'cuenta': if (cfg.cuenta) { pitido(880, 0.1); vibrar(60); } break;          // 3, 2, 1
    case 'cambio': pitido(1320, 0.35, 1.1); vibrar([120, 60, 120]); destello('cambio'); decir(texto); break; // nuevo tramo / minuto
    case 'fin': pitido(1320, 0.8, 1.2); vibrar([300, 100, 300]); destello('fin'); decir(texto || 'Terminado'); break;
    case 'inicio': pitido(660, 0.08); break;
    case 'ronda': pitido(1000, 0.05, 0.8); break;
    default: break;
  }
}

// "Probar sonido" en los ajustes: así compruebas con tu música puesta cómo se oye
export function probarSonido() {
  desbloquearAudio();
  avisar('cuenta'); setTimeout(() => avisar('cuenta'), 500); setTimeout(() => avisar('cambio', 'Siguiente serie'), 1000);
}
