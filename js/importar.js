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

export function parseEtiqueta(texto) {
  const n = {};
  const lineas = texto.toLowerCase().split(/\n+/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // Energía: buscamos el número junto a "kcal"
    if (n.kcal == null) {
      const m = l.match(/(\d+[.,]?\d*)\s*kcal/) || (/(energ|valor energ)/.test(l) && lineas[i + 1]?.match(/(\d+[.,]?\d*)\s*kcal/));
      if (m) { n.kcal = parseNum(m[1]); continue; }
    }
    for (const [k, re] of REGLAS) {
      if (n[k] != null || !re.test(l)) continue;
      // número en la misma línea o, si Live Text lo separó, en la siguiente
      const num = l.match(/(\d+[.,]?\d*)\s*g\b/) || l.match(/(\d+[.,]?\d*)/) || lineas[i + 1]?.match(/^(?:<\s*)?(\d+[.,]?\d*)/);
      if (num) n[k] = parseNum(num[1]);
      break;
    }
  }
  // Si no venían las kcal pero sí kJ, convertimos
  if (n.kcal == null) {
    const kj = texto.toLowerCase().match(/(\d+[.,]?\d*)\s*kj/);
    if (kj) n.kcal = Math.round(parseNum(kj[1]) / 4.184);
  }
  return n;
}

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
