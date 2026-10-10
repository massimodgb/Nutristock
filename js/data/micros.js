// Vitaminas y minerales por 100 g TAL COMO SE COMPRA (crudo o seco), igual que el resto de valores.
// Aproximados (USDA / BEDCA redondeados). Sirven para ver tendencias, no como análisis de laboratorio.
// Orden: [hierro mg, magnesio mg, potasio mg, calcio mg, vitamina C mg, vitamina D µg, vitamina B12 µg]

// Referencias de la EFSA para un hombre adulto (las que usa España/Europa). Un deportista puede necesitar algo más.
export const MICROS = [
  { k: 'fe', name: 'Hierro', unit: 'mg', ref: 11, dec: 1 },
  { k: 'mg', name: 'Magnesio', unit: 'mg', ref: 350, dec: 0 },
  { k: 'k', name: 'Potasio', unit: 'mg', ref: 3500, dec: 0 },
  { k: 'ca', name: 'Calcio', unit: 'mg', ref: 950, dec: 0 },
  { k: 'vc', name: 'Vitamina C', unit: 'mg', ref: 110, dec: 0 },
  { k: 'vd', name: 'Vitamina D', unit: 'µg', ref: 15, dec: 1 },
  { k: 'b12', name: 'Vitamina B12', unit: 'µg', ref: 4, dec: 1 },
];

export const MICRO_DATA = {
  // Proteínas (carne cruda)
  'pollo-pechuga': [0.4, 28, 334, 5, 0, 0.1, 0.2],
  'pollo-solomillo': [0.4, 28, 334, 5, 0, 0.1, 0.2],
  'pavo-pechuga': [0.5, 28, 290, 8, 0, 0.1, 0.4],
  'cerdo-solomillo': [1, 27, 399, 5, 0, 0.5, 0.5],
  'ternera-filete': [2, 22, 330, 6, 0, 0.1, 1.5],
  'picada-ternera': [2.2, 18, 270, 15, 0, 0.1, 2.5],
  'picada-pollo': [0.8, 23, 300, 8, 0, 0.1, 0.4],
  'picada-pavo': [1.1, 24, 270, 20, 0, 0.3, 1.2],
  'huevo': [1.8, 12, 138, 56, 0, 2, 0.9],
  // Del mar (oculto si lo excluyes)
  'merluza': [0.4, 30, 330, 30, 0, 1, 1], 'dorada': [0.6, 30, 350, 20, 0, 8, 2.5], 'lubina': [0.3, 40, 250, 10, 0, 8, 3],
  'atun-fresco': [1, 50, 250, 4, 0, 2, 9.4], 'salmon': [0.3, 29, 363, 12, 0, 11, 3.2], 'sardina': [2.5, 35, 380, 60, 0, 5, 9],
  'anchoa': [3.3, 41, 383, 147, 0, 1.7, 0.6], 'bacalao': [0.4, 32, 413, 16, 1, 0.9, 0.9], 'sepia': [6, 30, 350, 90, 5, 0, 3],
  'calamar': [0.7, 33, 246, 32, 4.7, 0.1, 1.3], 'pulpo': [5.3, 30, 350, 53, 5, 0, 20], 'mejillones': [4, 34, 320, 26, 8, 0, 12],
  'gambas': [0.5, 35, 250, 64, 0, 0, 1.1], 'langostinos': [0.5, 35, 250, 64, 0, 0, 1.1], 'atun-lata': [1, 27, 240, 11, 0, 1.7, 2.5],
  // Fiambres
  'pavo-fiambre': [0.8, 25, 350, 10, 0, 0, 0.4],
  'jamon-cocido': [0.9, 20, 300, 8, 0, 0.5, 0.4],
  'jamon-serrano': [2, 20, 450, 12, 0, 0.5, 1],
  'cecina': [4, 25, 400, 10, 0, 0, 2],
  'lomo-embuchado': [1.5, 25, 450, 10, 0, 0.5, 1],
  // Lácteos
  'queso-fresco-ligero': [0.2, 10, 120, 250, 0, 0.1, 0.5],
  'queso-burgos': [0.2, 10, 120, 250, 0, 0.1, 0.5],
  'queso-cabra-fresco': [0.5, 15, 80, 140, 0, 0.4, 0.2],
  'queso-havarti-light': [0.2, 25, 80, 700, 0, 0.3, 1],
  'mozzarella-light': [0.2, 20, 90, 500, 0, 0.3, 0.7],
  'requeson': [0.1, 8, 100, 90, 0, 0.1, 0.4],
  'ricotta': [0.4, 11, 105, 207, 0, 0.2, 0.3],
  'queso-mato': [0.2, 8, 100, 100, 0, 0.1, 0.3],
  'queso-feta': [0.7, 19, 62, 493, 0, 0.4, 1.7],
  'queso-cottage': [0.1, 8, 104, 83, 0, 0.1, 0.4],
  'yogur-proteico': [0.1, 12, 150, 150, 0, 0, 0.5],
  'queso-batido': [0.1, 10, 150, 110, 0, 0, 0.4],
  // Almidones (seco o crudo)
  'pan-integral': [2.5, 75, 250, 100, 0, 0, 0],
  'copos-avena': [4.3, 138, 362, 52, 0, 0, 0],
  'espelta-inflada': [4, 130, 390, 30, 0, 0, 0],
  'cereales-integrales': [4, 100, 350, 40, 0, 0, 0],
  'corn-flakes': [8, 15, 100, 5, 0, 4.2, 0.8], // suelen venir enriquecidos
  'muesli': [4, 110, 450, 60, 0, 0, 0],
  'arroz-integral': [1.5, 143, 223, 23, 0, 0, 0],
  'pasta-integral': [3.6, 143, 215, 40, 0, 0, 0],
  'quinoa': [4.6, 197, 563, 47, 0, 0, 0],
  'cuscus': [1.1, 44, 166, 24, 0, 0, 0],
  'noquis': [0.4, 15, 200, 10, 5, 0, 0],
  'lentejas': [6.5, 47, 677, 35, 4.5, 0, 0],
  'alubias': [8, 160, 1400, 150, 0, 0, 0],
  'garbanzos': [4.3, 79, 718, 57, 4, 0, 0],
  'patata': [0.8, 23, 425, 12, 20, 0, 0],
  'boniato': [0.6, 25, 337, 30, 2.4, 0, 0],
  'wrap-integral': [2.5, 70, 250, 100, 0, 0, 0],
  // Grasas y frutos secos
  'aceite-oliva': [0.6, 0, 1, 1, 0, 0, 0],
  'aguacate': [0.6, 29, 485, 12, 10, 0, 0],
  'aceitunas': [0.5, 11, 42, 52, 0, 0, 0],
  'chocolate-85': [12, 230, 715, 73, 0, 0, 0.3],
  'crema-cacahuete': [1.9, 170, 560, 45, 0, 0, 0],
  'almendras': [3.7, 270, 733, 269, 0, 0, 0],
  'anacardos': [6.7, 292, 660, 37, 0.5, 0, 0],
  'avellanas': [4.7, 163, 680, 114, 6.3, 0, 0],
  'cacahuetes': [4.6, 168, 705, 92, 0, 0, 0],
  'nueces': [2.9, 158, 441, 98, 1.3, 0, 0],
  'macadamia': [3.7, 130, 368, 85, 1.2, 0, 0],
  'nuez-brasil': [2.4, 376, 659, 160, 0.7, 0, 0],
  'pinones': [5.5, 251, 597, 16, 0.8, 0, 0],
  'pipas-girasol': [5.3, 325, 645, 78, 1.4, 0, 0],
  'pistachos': [3.9, 121, 1025, 105, 5.6, 0, 0],
  // Frutas
  'arandanos': [0.3, 6, 77, 6, 9.7, 0, 0], 'cerezas': [0.4, 11, 222, 13, 7, 0, 0], 'ciruela': [0.2, 7, 157, 6, 9.5, 0, 0],
  'frambuesas': [0.7, 22, 151, 25, 26, 0, 0], 'fresa': [0.4, 13, 153, 16, 59, 0, 0], 'kiwi': [0.3, 17, 312, 34, 93, 0, 0],
  'mandarina': [0.2, 12, 166, 37, 27, 0, 0], 'mango': [0.2, 10, 168, 11, 36, 0, 0], 'manzana': [0.1, 5, 107, 6, 4.6, 0, 0],
  'melocoton': [0.3, 9, 190, 6, 6.6, 0, 0], 'melon': [0.2, 12, 267, 9, 37, 0, 0], 'mora': [0.6, 20, 162, 29, 21, 0, 0],
  'naranja': [0.1, 10, 181, 40, 53, 0, 0], 'nectarina': [0.3, 9, 201, 6, 5.4, 0, 0], 'nispero': [0.3, 12, 266, 16, 1, 0, 0],
  'pera': [0.2, 7, 116, 9, 4.3, 0, 0], 'pina': [0.3, 12, 109, 13, 48, 0, 0], 'platano': [0.3, 27, 358, 5, 8.7, 0, 0],
  'sandia': [0.2, 10, 112, 7, 8.1, 0, 0], 'uvas': [0.4, 7, 191, 10, 3.2, 0, 0],
  // Verduras
  'acelgas': [1.8, 81, 379, 51, 30, 0, 0], 'alcachofas': [1.3, 60, 370, 44, 12, 0, 0], 'berenjena': [0.2, 14, 229, 9, 2.2, 0, 0],
  'berros': [0.2, 21, 330, 120, 43, 0, 0], 'brocoli': [0.7, 21, 316, 47, 89, 0, 0], 'calabacin': [0.4, 18, 261, 16, 18, 0, 0],
  'calabaza': [0.8, 12, 340, 21, 9, 0, 0], 'canonigos': [2.2, 13, 459, 38, 38, 0, 0], 'coliflor': [0.4, 15, 299, 22, 48, 0, 0],
  'endivias': [0.8, 15, 314, 52, 6.5, 0, 0], 'esparragos': [2.1, 14, 202, 24, 5.6, 0, 0], 'espinacas': [2.7, 79, 558, 99, 28, 0, 0],
  'guisantes': [1.5, 33, 244, 25, 40, 0, 0], 'judias-verdes': [1, 25, 211, 37, 12, 0, 0], 'lechuga': [0.9, 13, 194, 33, 9, 0, 0],
  'pepino': [0.3, 13, 147, 16, 2.8, 0, 0], 'pimientos': [0.4, 12, 211, 7, 128, 0, 0], 'puerros': [2.1, 28, 180, 59, 12, 0, 0],
  'remolacha': [0.8, 23, 325, 16, 4.9, 0, 0], 'rucula': [1.5, 47, 369, 160, 15, 0, 0], 'setas': [0.5, 9, 318, 3, 2, 0.2, 0],
  'tomate': [0.3, 11, 237, 10, 14, 0, 0], 'zanahoria': [0.3, 12, 320, 33, 5.9, 0, 0], 'crema-verduras': [0.4, 8, 150, 15, 5, 0, 0],
  // Suplementos del plan
  'creatina': [0, 0, 0, 0, 0, 0, 0],
};

// Vitaminas y minerales de lo que comiste: del propio producto (si la etiqueta los trae) o de su alimento base
export function microsDe(food, rawG, byId) {
  if (!food || !rawG) return null;
  const propios = food.micros && MICROS.some(m => food.micros[m.k] != null) ? food.micros : null;
  const tabla = MICRO_DATA[food.id] || (food.genericId && MICRO_DATA[food.genericId]);
  if (!propios && !tabla) return null;
  const out = {};
  MICROS.forEach((m, i) => {
    const por100 = propios?.[m.k] ?? (tabla ? tabla[i] : 0);
    out[m.k] = (por100 || 0) * rawG / 100;
  });
  return out;
}

// Media diaria de los días registrados + qué parte de lo comido tiene datos (lo de fuera del plan no los tiene)
export function microsMedios(logs, byId) {
  const porDia = {};
  let kcalCon = 0, kcalTotal = 0;
  for (const l of logs) {
    const d = porDia[l.date] ||= Object.fromEntries(MICROS.map(m => [m.k, 0]));
    kcalTotal += l.n?.kcal || 0;
    const m = l.foodId && l.rawG ? microsDe(byId[l.foodId], l.rawG, byId) : null;
    if (!m) continue;
    kcalCon += l.n?.kcal || 0;
    for (const k of Object.keys(m)) d[k] += m[k];
  }
  const dias = Object.keys(porDia).length;
  const media = Object.fromEntries(MICROS.map(m => [m.k, dias ? Object.values(porDia).reduce((s, d) => s + d[m.k], 0) / dias : 0]));
  return { media, dias, cobertura: kcalTotal ? kcalCon / kcalTotal : 0, porDia };
}
