// Formas gratuitas de meter productos en la biblioteca:
// 1) Código de barras → Open Food Facts (base de datos abierta y gratuita)
// 2) Texto de la etiqueta copiado con Live Text del iPhone → lo interpretamos aquí
import { parseNum } from './nutri.js';

// ---------- Open Food Facts ----------
// Devuelve el producto, o null si no está en la base de datos.
// Si falla internet, lanza un error (para poder decir "no hay conexión" en vez de "no existe").
export async function buscarCodigo(barcode) {
  const fields = 'product_name,product_name_es,brands,quantity,product_quantity,nutriments,categories_tags';
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Open Food Facts no responde (' + res.status + ')');
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product, nu = p.nutriments || {};
  const v = k => {
    const x = nu[k + '_100g'];
    return x === undefined || x === '' ? null : Math.round(Number(x) * 10) / 10;
  };
  let kcal = v('energy-kcal');
  if (kcal == null && v('energy') != null) kcal = Math.round(v('energy') / 4.184); // viene en kJ
  return {
    name: (p.product_name_es || p.product_name || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    barcode,
    packG: Number(p.product_quantity) || parseNum(p.quantity) || null,
    n: {
      kcal, prot: v('proteins'), carb: v('carbohydrates'), sug: v('sugars'),
      fat: v('fat'), sat: v('saturated-fat'), fib: v('fiber'),
      salt: v('salt') ?? (v('sodium') != null ? Math.round(v('sodium') * 2.5 * 100) / 100 : null),
    },
    micros: microsOFF(nu),
    source: 'off',
  };
}

// Vitaminas y minerales si la etiqueta los trae (Open Food Facts los da en gramos por 100 g)
function microsOFF(nu) {
  const g = k => { const x = Number(nu[k + '_100g']); return Number.isFinite(x) && nu[k + '_100g'] !== '' ? x : null; };
  const out = {};
  const pon = (k, x, factor, dec) => { if (x != null) out[k] = Math.round(x * factor * 10 ** dec) / 10 ** dec; };
  pon('fe', g('iron'), 1000, 2); pon('mg', g('magnesium'), 1000, 1); pon('k', g('potassium'), 1000, 0);
  pon('ca', g('calcium'), 1000, 0); pon('vc', g('vitamin-c'), 1000, 1); pon('vd', g('vitamin-d'), 1e6, 2); pon('b12', g('vitamin-b12'), 1e6, 2);
  return Object.keys(out).length ? out : null;
}

// ---------- Texto de etiqueta (Live Text) ----------
// Busca cada nutriente por su nombre y coge el primer número que aparece después.
// Las reglas más específicas van primero ("saturadas" antes que "grasas").
const REGLAS = [
  ['sat', /(saturad|saturated)/],
  ['sug', /(az[uú]car|sugar)/],
  ['fib', /(fibra|fibre|fiber)/],
  ['salt', /(\bsal\b|salt)/],
  ['prot', /(prote[ií]n)/],
  ['carb', /(hidratos|carbohidrat|carbohydrat)/],
  ['fat', /(grasa|l[ií]pid|\bfat\b)/],
];

// Lee una etiqueta pegada y devuelve { n, nota, duda }:
// - n: valores POR 100 g (si la etiqueta pone primero la ración, se coge la columna de 100 g;
//   si solo trae ración y dice cuánto pesa, se pasa a 100 g)
// - nota: qué ha hecho la app, para que lo revises; duda: true si conviene mirarlo con calma
const RACION = /(raci[oó]n|porci[oó]n|serving|portion|dosis|toma|per pack|por envase)/;
const CIEN = /(100\s*(g|ml))/;

export function parseEtiquetaInfo(texto) {
  const t = String(texto || '').toLowerCase().replace(/\r/g, '');
  const lineas = t.split(/\n+/).map(l => l.trim()).filter(Boolean);
  // ¿En qué columna está "por 100 g"? Se mira la línea que nombra las dos cosas ("por 100 g | por ración (30 g)")
  const cab = lineas.find(l => CIEN.test(l) && RACION.test(l));
  const mR = t.match(/(?:raci[oó]n|porci[oó]n|serving(?:\s*size)?|portion|dosis)[^\d\n]{0,20}(\d+[.,]?\d*)\s*(g|ml)\b/);
  const racionG = mR ? parseNum(mR[1]) : null;
  let col = 0, escala = 1, nota = null, duda = false;
  if (cab) {
    col = cab.search(CIEN) < cab.search(RACION) ? 0 : 1;
    if (col === 1) nota = 'La etiqueta pone primero la ración: he cogido la columna "por 100 g".';
  } else if (!CIEN.test(t) && RACION.test(t)) {
    if (racionG) { escala = 100 / racionG; nota = `Solo traía valores por ración (${fmtNum(racionG)} g): los he pasado a 100 g.`; }
    else { nota = 'Parece que los valores son por ración y no dice cuánto pesa: revisa que sean por 100 g.'; duda = true; }
  }
  // Todos los números de una línea con su unidad (sin los % de "valor diario")
  const conUnidad = (l, re) => [...l.matchAll(re)].map(m => parseNum(m[1]));
  const elegir = vals => (vals.length > col ? vals[col] : vals[0]);

  const n = {};
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (n.kcal == null) {
      let ks = conUnidad(l, /(\d+[.,]?\d*)\s*kcal/g);
      if (!ks.length && /(energ|valor energ|calor[ií]as|calories)/.test(l)) {
        ks = conUnidad(lineas[i + 1] || '', /(\d+[.,]?\d*)\s*kcal/g);
        // "Calories 20" (etiquetas de EE. UU.): número sin unidad
        if (!ks.length && /(calor[ií]as|calories)\s+\d/.test(l)) ks = [parseNum(l.match(/(calor[ií]as|calories)\s+(\d+[.,]?\d*)/)[2])];
      }
      if (ks.length) { n.kcal = elegir(ks); continue; }
    }
    for (const [k, re] of REGLAS) {
      if (n[k] != null || !re.test(l)) continue;
      // número(s) en la misma línea o, si Live Text lo separó, en la siguiente
      const gs = conUnidad(l, /(\d+[.,]?\d*)\s*g\b/g);
      if (gs.length) n[k] = elegir(gs);
      else {
        const num = l.match(/(\d+[.,]?\d*)/) || lineas[i + 1]?.match(/^(?:<\s*)?(\d+[.,]?\d*)/);
        if (num) n[k] = parseNum(num[1]);
      }
      break;
    }
    // Sodio en mg (etiquetas de EE. UU.) si no hay sal: sal = sodio × 2,5
    if (n.salt == null && /(sodio|sodium)/.test(l)) {
      const mg = conUnidad(l, /(\d+[.,]?\d*)\s*mg\b/g);
      if (mg.length) n.salt = Math.round(elegir(mg) * 2.5) / 1000;
    }
  }
  // Si no venían las kcal pero sí kJ, convertimos
  if (n.kcal == null) {
    const kj = conUnidad(t, /(\d+[.,]?\d*)\s*kj/g);
    if (kj.length) n.kcal = Math.round(elegir(kj) / 4.184);
  }
  if (escala !== 1) for (const k of Object.keys(n)) n[k] = Math.round(n[k] * escala * 10) / 10;
  // Aviso (sin cambiar nada) si las kcal no cuadran con los macros
  if (n.kcal && n.prot != null && n.carb != null && n.fat != null) {
    const est = 4 * n.prot + 4 * n.carb + 9 * n.fat + 2 * (n.fib || 0);
    if (Math.abs(n.kcal - est) / n.kcal > 0.25 && Math.abs(n.kcal - est) > 25) {
      nota = (nota ? nota + ' ' : '') + `Ojo: ${fmtNum(n.kcal)} kcal no cuadran con los macros (darían unas ${Math.round(est)}). Revisa la columna.`;
      duda = true;
    }
  }
  return { n, nota, duda };
}

export const parseEtiqueta = texto => parseEtiquetaInfo(texto).n;
const fmtNum = x => String(Math.round(x * 10) / 10).replace('.', ',');

// ---------- Escáner de código de barras ----------
// Motor ZXing (zxing-cpp en WebAssembly): gratis, muy fiable y funciona en el iPhone,
// donde Safari no trae lector de códigos propio. Se descarga la primera vez y queda guardado.
const ZXING = 'https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.4/dist/es/reader/index.js';
const OPCIONES = { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128'], tryHarder: true, maxNumberOfSymbols: 1 };
let motor;
const cargarMotor = () => (motor ||= import(ZXING));

async function leerImagen(imageData) {
  const { readBarcodes } = await cargarMotor();
  const r = await readBarcodes(imageData, OPCIONES);
  return r.find(x => x.isValid && x.text)?.text || null;
}

// Cámara en vivo: analiza la franja central varias veces por segundo (y de vez en cuando la imagen entera)
export async function iniciarEscaner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  await cargarMotor();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let vivo = true, vuelta = 0;
  const parar = () => { vivo = false; stream.getTracks().forEach(t => t.stop()); };
  const tick = async () => {
    if (!vivo) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const vw = video.videoWidth, vh = video.videoHeight;
      // 3 de cada 4 veces, la franja central (más rápido); 1 de cada 4, la imagen entera
      const entera = vuelta++ % 4 === 3;
      const cw = entera ? vw : Math.round(vw * 0.9), ch = entera ? vh : Math.round(vh * 0.45);
      const escala = Math.min(1, 1280 / Math.max(cw, ch));
      canvas.width = Math.round(cw * escala); canvas.height = Math.round(ch * escala);
      ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
      try {
        const code = await leerImagen(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (code && vivo) { parar(); avisarLectura(); onCode(code); return; }
      } catch {}
    }
    setTimeout(tick, 80);
  };
  tick();
  return parar;
}

// Lee el código desde una foto (la cámara normal del iPhone enfoca mejor de cerca)
export async function leerCodigoDeFoto(file) {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0, c.width, c.height);
    const code = await leerImagen(x.getImageData(0, 0, c.width, c.height));
    if (code) avisarLectura();
    return code;
  } catch {
    return null;
  }
}

// Pitido corto (y vibración en Android; el iPhone no deja vibrar desde una web)
let audio;
addEventListener('touchend', () => {
  // Safari solo deja sonar si el audio se "despierta" con un toque del usuario
  try { audio ||= new AudioContext(); audio.resume(); } catch {}
}, { passive: true });

function avisarLectura() {
  try { navigator.vibrate?.(80); } catch {}
  try {
    audio ||= new AudioContext();
    const osc = audio.createOscillator(), vol = audio.createGain();
    osc.frequency.value = 1400;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.12);
  } catch {}
}
