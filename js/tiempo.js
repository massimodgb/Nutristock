// Duraciones (tiempos de un WOD, descansos): se guardan en SEGUNDOS y se enseñan como 15:40 o 1:05:20.
// No son horas del día: 75 minutos y 5 segundos son 1:15:05.

export function fmtTiempo(seg) {
  if (seg == null || !Number.isFinite(seg)) return '';
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const z = n => String(n).padStart(2, '0');
  return h ? `${h}:${z(m)}:${z(r)}` : `${m}:${z(r)}`;
}

// Lee un tiempo escrito: "15:40", "1:05:20", "15.40", "15'40", "15m40s", "940s".
// Si solo son 3-4 cifras ("1540", lo que salía con el teclado numérico del iPhone) se lee como mm ss,
// pero se marca como DUDOSO para que lo revises.
export function leerTiempo(txt) {
  const t = String(txt ?? '').trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (m && +m[2] < 60 && +m[3] < 60) return { s: +m[1] * 3600 + +m[2] * 60 + +m[3] };
  m = t.match(/^(\d+)\s*[:.'’m]\s*(\d{1,2})\s*(?:s|''|")?$/);
  if (m && +m[2] < 60) return { s: +m[1] * 60 + +m[2] };
  m = t.match(/^(\d+)\s*(?:s|seg|segundos)$/);
  if (m) return { s: +m[1] };
  m = t.match(/^(\d+)\s*(?:min|m|'|’)$/);
  if (m) return { s: +m[1] * 60 };
  m = t.match(/^(\d{1,2})(\d{2})$/);
  if (m && +m[2] < 60) return { s: +m[1] * 60 + +m[2], dudoso: true };
  return null;
}

// Minutos y segundos por separado (lo que escribes en las dos casillas) → segundos. null si no es válido.
export function aSegundos(min, seg) {
  const mi = min == null || min === '' ? 0 : Number(min), se = seg == null || seg === '' ? 0 : Number(seg);
  if (!Number.isFinite(mi) || !Number.isFinite(se) || mi < 0 || se < 0 || se > 59 || !Number.isInteger(se)) return null;
  if ((min == null || min === '') && (seg == null || seg === '')) return null;
  return Math.round(mi * 60 + se);
}

// El tiempo de un resultado, venga de donde venga (los nuevos guardan tiempoS; los antiguos, solo texto)
export function tiempoDe(r) {
  if (r?.tiempoS != null) return { s: r.tiempoS };
  return r?.tiempo ? leerTiempo(r.tiempo) : null;
}
export function textoTiempoResultado(r) {
  const t = tiempoDe(r);
  if (!t) return r?.tiempo || '';
  return t.dudoso ? `${fmtTiempo(t.s)} (?)` : fmtTiempo(t.s);
}
