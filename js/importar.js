// Formas gratuitas de meter productos en la biblioteca:
// 1) Código de barras → Open Food Facts (base de datos abierta y gratuita)
// 2) Texto de la etiqueta copiado con Live Text del iPhone → lo interpretamos aquí
import { parseNum } from './nutri.js';

// ---------- Open Food Facts ----------
export async function buscarCodigo(barcode) {
  const fields = 'product_name,product_name_es,brands,quantity,product_quantity,nutriments,categories_tags';
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) return null;
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
    source: 'off',
  };
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
let libPromise;
function cargarLib() {
  libPromise ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = () => ok(window.Html5Qrcode);
    s.onerror = () => fail(new Error('No se pudo cargar el escáner (¿sin conexión?)'));
    document.head.appendChild(s);
  });
  return libPromise;
}

export async function iniciarEscaner(elementId, onCode) {
  const Html5Qrcode = await cargarLib();
  const F = window.Html5QrcodeSupportedFormats;
  const scanner = new Html5Qrcode(elementId, {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128],
    verbose: false,
  });
  let done = false;
  await scanner.start(
    { facingMode: 'environment' },
    { fps: 12, qrbox: (w, h) => ({ width: Math.min(300, w * 0.85), height: Math.min(160, h * 0.5) }) },
    code => { if (!done) { done = true; onCode(code); } },
    () => {},
  );
  return async () => { try { await scanner.stop(); scanner.clear(); } catch {} };
}
