// Descanso entre series de fuerza: empieza al pulsar "Completar serie" y cuenta hacia atrás.
// Se calcula con la HORA (no con un contador), así no se desajusta aunque la pantalla se refresque
// o vuelvas a la app tras mirar otra cosa.
//
// Ojo, son dos cosas distintas:
//  - DESCANSO: "rest 1:30" → 1:30 desde que TERMINAS la serie (esto).
//  - INTERVALO FIJO: "cada 1:30 x 6" → cada serie EMPIEZA cada 1:30, acabes cuando acabes (eso es un reloj EMOM).

export const crearDescanso = (dur, ahora = Date.now(), info = {}) => ({ inicio: ahora, dur, pausadoEn: null, pausado: 0, extra: 0, ...info });

export function restante(d, ahora = Date.now()) {
  if (!d) return 0;
  const fin = d.pausadoEn ?? ahora;
  const pasado = (fin - d.inicio - d.pausado) / 1000;
  return Math.max(0, d.dur + d.extra - pasado);
}
export const pausar = (d, ahora = Date.now()) => (d.pausadoEn ? d : { ...d, pausadoEn: ahora });
export const seguir = (d, ahora = Date.now()) => (d.pausadoEn ? { ...d, pausado: d.pausado + (ahora - d.pausadoEn), pausadoEn: null } : d);
export const sumar = (d, s) => ({ ...d, extra: d.extra + s });
// Progreso de 0 a 1 (para la barra)
export const progreso = (d, ahora = Date.now()) => (d ? 1 - restante(d, ahora) / Math.max(1, d.dur + d.extra) : 0);

export const OPCIONES_DESCANSO = [0, 45, 60, 90, 120, 150, 180, 240, 300];
