// Cruces comida ↔ Whoop: ¿cómo se relaciona lo que haces un día con tu recuperación del día siguiente?
// Solo cálculos (sin pantalla), para poder probarlos en herramientas/comprobar.html.
// Ojo: son relaciones, no pruebas de causa. También influyen el entreno, el estrés, el alcohol, la luz…
import { addDays } from './nutri.js';

export const MIN_DIAS = 8; // por debajo de esto, cualquier diferencia es casualidad

// Cada factor dice de dónde sale el dato (x) para el día en que se mide la recuperación (y)
export const FACTORES = [
  { id: 'carb', nombre: 'Carbohidratos', corto: 'carbos', cuando: 'el día anterior', unidad: 'g', dec: 0, de: (c, w) => c.ayer?.n.carb },
  { id: 'kcal', nombre: 'Calorías', corto: 'calorías', cuando: 'el día anterior', unidad: 'kcal', dec: 0, de: (c, w) => c.ayer?.n.kcal },
  { id: 'prot', nombre: 'Proteína', corto: 'proteína', cuando: 'el día anterior', unidad: 'g', dec: 0, de: (c, w) => c.ayer?.n.prot },
  { id: 'cena', nombre: 'Hora de la cena', corto: 'cenar', cuando: 'la noche anterior', unidad: 'h', dec: 1, hora: true, de: (c, w) => c.ayer?.horaCena },
  { id: 'fuera', nombre: 'Fuera del plan', corto: 'comida fuera del plan', cuando: 'el día anterior', unidad: 'kcal', dec: 0, de: (c, w) => c.ayer ? c.ayer.fuera : undefined },
  { id: 'strain', nombre: 'Esfuerzo', corto: 'esfuerzo', cuando: 'el día anterior', unidad: '', dec: 1, de: (c, w) => w.ayer?.strain },
  { id: 'sueno', nombre: 'Horas de sueño', corto: 'dormir', cuando: 'esa noche', unidad: 'h', dec: 1, de: (c, w) => w.hoy?.horas },
];

// Hora con decimales a texto: 22,5 → "22:30"
export const textoHora = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
export const textoValor = (f, v) => f.hora ? textoHora(v)
  : `${v.toLocaleString('es-ES', { maximumFractionDigits: f.dec })}${f.unidad ? ' ' + f.unidad : ''}`;

// comida[fecha] = { n, fuera, horaCena } (solo días registrados) · whoop[fecha] = resumenWhoop(...)
export function paresCruce({ fechas, comida, whoop, factor }) {
  const out = [];
  for (const fecha of fechas) {
    const rec = whoop[fecha]?.recuperacion;
    if (rec == null) continue;
    const ayer = addDays(fecha, -1);
    const x = factor.de({ ayer: comida[ayer], hoy: comida[fecha] }, { ayer: whoop[ayer], hoy: whoop[fecha] });
    if (x == null || Number.isNaN(x)) continue;
    out.push({ fecha, x, y: rec });
  }
  return out;
}

// Parte los días en dos mitades (valor bajo / alto) y compara la recuperación media de cada una
export function compararMitades(pares) {
  if (pares.length < MIN_DIAS) return null;
  const orden = [...pares].sort((a, b) => a.x - b.x);
  const mitad = Math.floor(orden.length / 2);
  const bajo = orden.slice(0, mitad), alto = orden.slice(mitad);
  const media = l => l.reduce((s, p) => s + p.y, 0) / l.length;
  const r = {
    umbral: (orden[mitad - 1].x + orden[mitad].x) / 2,
    bajo: { n: bajo.length, media: media(bajo) },
    alto: { n: alto.length, media: media(alto) },
  };
  r.dif = r.alto.media - r.bajo.media;
  return r;
}

// Frase en lenguaje normal con el resultado
export function fraseCruce(factor, c) {
  const pct = v => `${Math.round(v)} %`;
  const masDe = factor.hora ? `cenar después de las ${textoHora(c.umbral)}` : factor.id === 'sueno'
    ? `dormir más de ${textoValor(factor, c.umbral)}` : `más de ${textoValor(factor, c.umbral)} de ${factor.corto} ${factor.cuando}`;
  if (Math.abs(c.dif) < 5) return `No se ve una diferencia clara: ${pct(c.alto.media)} frente a ${pct(c.bajo.media)} de recuperación media.`;
  const resto = factor.hora ? 'cenando antes' : factor.id === 'sueno' ? 'durmiendo menos' : 'con menos';
  return `Tras ${masDe}, tu recuperación media fue del ${pct(c.alto.media)}; ${resto}, del ${pct(c.bajo.media)}.`;
}
