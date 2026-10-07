// Alimentos base de la app (los de tu plan + algunos comunes).
// Valores por 100 g TAL COMO SE COMPRA (crudo / seco), estilo etiqueta europea:
// los carbohidratos NO incluyen la fibra.
// Fuentes de referencia: BEDCA (España) y USDA FoodData Central, redondeados.
//
// factor = peso cocido / peso crudo. Solo lo tienen los alimentos que pesas
// cocinados. Ej: arroz 2.8 → 100 g de arroz seco quedan en ~280 g cocido.
// Puedes calibrar tu propio factor desde la Biblioteca.

// Orden de los valores: [kcal, proteína, carbohidratos, grasas, azúcares, saturadas, fibra, sal]
const B = (id, name, group, v, extra = {}) => ({
  id, name, group, source: 'base',
  n: { kcal: v[0], prot: v[1], carb: v[2], fat: v[3], sug: v[4], sat: v[5], fib: v[6], salt: v[7] },
  ...extra,
});

export const FOODS = [
  // ---------- Proteínas (se pesan cocidas) ----------
  B('pollo-pechuga', 'Pechuga de pollo', 'proteina', [110, 23, 0, 1.5, 0, 0.4, 0, 0.15], { factor: 0.75 }),
  B('pollo-solomillo', 'Solomillo de pollo', 'proteina', [105, 23, 0, 1.2, 0, 0.3, 0, 0.15], { factor: 0.75 }),
  B('pavo-pechuga', 'Pechuga de pavo (fresca)', 'proteina', [105, 23.5, 0, 1, 0, 0.3, 0, 0.15], { factor: 0.75 }),
  B('cerdo-solomillo', 'Solomillo de cerdo', 'proteina', [120, 21, 0, 4, 0, 1.4, 0, 0.15], { factor: 0.72 }),
  B('ternera-filete', 'Filete de ternera', 'proteina', [125, 21.5, 0, 4.3, 0, 1.8, 0, 0.15], { factor: 0.72 }),
  B('picada-ternera', 'Carne picada de ternera', 'proteina', [190, 19, 0, 12.5, 0, 5.2, 0, 0.2], { factor: 0.75 }),
  B('picada-pollo', 'Carne picada de pollo', 'proteina', [140, 19, 0, 7, 0, 2, 0, 0.2], { factor: 0.75 }),
  B('picada-pavo', 'Carne picada de pavo', 'proteina', [150, 19, 0, 8, 0, 2.3, 0, 0.2], { factor: 0.75 }),
  B('huevo', 'Huevo (M)', 'proteina', [143, 12.6, 0.7, 9.5, 0.4, 3.1, 0, 0.35], { unitG: 50, unitName: 'huevo' }),

  // Del mar (ocultos si tienes activado "excluir comida del mar")
  B('merluza', 'Merluza', 'proteina', [75, 17, 0, 0.8, 0, 0.2, 0, 0.2], { factor: 0.8, mar: true }),
  B('dorada', 'Dorada', 'proteina', [95, 19, 0, 2, 0, 0.5, 0, 0.2], { factor: 0.8, mar: true }),
  B('lubina', 'Lubina', 'proteina', [97, 18.5, 0, 2.5, 0, 0.6, 0, 0.2], { factor: 0.8, mar: true }),
  B('atun-fresco', 'Atún fresco', 'proteina', [110, 24, 0, 1, 0, 0.3, 0, 0.1], { factor: 0.8, mar: true }),
  B('salmon', 'Salmón', 'proteina', [200, 20, 0, 13, 0, 2.5, 0, 0.15], { factor: 0.8, mar: true }),
  B('sardina', 'Sardina', 'proteina', [140, 19, 0, 7, 0, 2, 0, 0.3], { factor: 0.8, mar: true }),
  B('anchoa', 'Anchoa / boquerón', 'proteina', [130, 20, 0, 5, 0, 1.3, 0, 0.3], { factor: 0.8, mar: true }),
  B('bacalao', 'Bacalao', 'proteina', [80, 18, 0, 0.7, 0, 0.1, 0, 0.3], { factor: 0.8, mar: true }),
  B('sepia', 'Sepia', 'proteina', [75, 16, 0.8, 0.7, 0, 0.1, 0, 0.7], { factor: 0.8, mar: true }),
  B('calamar', 'Calamar', 'proteina', [90, 16, 3, 1.4, 0, 0.4, 0, 0.4], { factor: 0.8, mar: true }),
  B('pulpo', 'Pulpo', 'proteina', [80, 15, 2, 1, 0, 0.2, 0, 0.6], { factor: 0.8, mar: true }),
  B('mejillones', 'Mejillones (sin concha)', 'proteina', [85, 12, 3.5, 2.2, 0, 0.4, 0, 0.7], { factor: 0.8, mar: true }),
  B('gambas', 'Gambas', 'proteina', [85, 19, 0, 1, 0, 0.3, 0, 0.6], { factor: 0.8, mar: true }),
  B('langostinos', 'Langostinos', 'proteina', [90, 20, 0, 1, 0, 0.3, 0, 0.6], { factor: 0.8, mar: true }),
  B('atun-lata', 'Atún en lata al natural (escurrido)', 'proteina', [105, 24, 0, 0.8, 0, 0.3, 0, 0.9], { mar: true }),

  // Lonchas y quesos (se pesan tal cual)
  B('pavo-fiambre', 'Pechuga de pavo (fiambre)', 'proteina', [105, 19, 2, 2, 1.5, 0.6, 0, 2]),
  B('jamon-cocido', 'Jamón cocido / dulce', 'proteina', [110, 18, 1.5, 3.5, 1, 1.2, 0, 2]),
  B('jamon-serrano', 'Jamón serrano / ibérico', 'proteina', [240, 30, 0.5, 13, 0, 4.5, 0, 5]),
  B('cecina', 'Cecina', 'proteina', [250, 39, 0.5, 10, 0, 3.5, 0, 4.5]),
  B('lomo-embuchado', 'Lomo embuchado', 'proteina', [250, 38, 1, 10, 0.5, 3.5, 0, 4.5]),
  B('queso-fresco-ligero', 'Queso fresco ligero', 'proteina', [100, 13, 3.5, 3.5, 3.5, 2.3, 0, 0.8]),
  B('queso-burgos', 'Queso de Burgos', 'proteina', [185, 12.5, 3, 14, 3, 9, 0, 0.8]),
  B('queso-cabra-fresco', 'Queso de cabra fresco', 'proteina', [220, 14, 1.5, 18, 1.5, 12, 0, 1.2]),
  B('queso-havarti-light', 'Queso havarti light', 'proteina', [250, 27, 0, 16, 0, 10, 0, 1.5]),
  B('mozzarella-light', 'Mozzarella ligera', 'proteina', [165, 19, 1.5, 9.5, 1.5, 6.5, 0, 0.6]),
  B('requeson', 'Requesón', 'proteina', [100, 11, 3.5, 4.5, 3.5, 3, 0, 0.3]),
  B('ricotta', 'Ricotta', 'proteina', [150, 10, 3.5, 11, 3.5, 7, 0, 0.3]),
  B('queso-mato', 'Queso mató', 'proteina', [110, 8, 4, 7, 4, 4.5, 0, 0.1]),
  B('queso-feta', 'Queso feta', 'proteina', [265, 14, 1, 22, 1, 15, 0, 2.7]),
  B('queso-cottage', 'Queso cottage', 'proteina', [98, 11, 3.4, 4.3, 2.7, 2.7, 0, 0.9]),

  // ---------- Lácteos ----------
  B('yogur-proteico', 'Yogur proteico natural (skyr, +prot)', 'lacteo', [60, 10, 4, 0.2, 4, 0.1, 0, 0.1]),
  B('queso-batido', 'Queso batido 0%', 'lacteo', [46, 8, 3.5, 0.1, 3.5, 0.1, 0, 0.1]),

  // ---------- Almidones ----------
  B('pan-integral', 'Pan integral 100%', 'almidon', [250, 10, 42, 3.5, 3, 0.6, 7, 1.1], { unitG: 30, unitName: 'rebanada' }),
  B('copos-avena', 'Copos de avena', 'almidon', [370, 13.5, 59, 7, 1, 1.3, 10, 0]),
  B('espelta-inflada', 'Espelta inflada', 'almidon', [370, 14, 70, 2.5, 1, 0.4, 8, 0]),
  B('cereales-integrales', 'Cereales integrales sin azúcar', 'almidon', [360, 11, 65, 3, 5, 0.6, 10, 0.6]),
  B('corn-flakes', 'Copos de maíz (corn flakes)', 'almidon', [380, 7, 84, 0.9, 8, 0.2, 3, 1.1]),
  B('muesli', 'Muesli sin azúcar añadido', 'almidon', [360, 10, 60, 6, 15, 1, 8, 0.1]),
  B('arroz-integral', 'Arroz integral', 'almidon', [360, 7.5, 75, 2.7, 0.8, 0.6, 3.5, 0], { factor: 2.8 }),
  B('pasta-integral', 'Pasta integral', 'almidon', [350, 13, 64, 2.5, 3, 0.5, 8, 0], { factor: 2.3 }),
  B('quinoa', 'Quinoa', 'almidon', [368, 14, 57, 6, 0, 0.7, 7, 0], { factor: 2.9 }),
  B('cuscus', 'Cuscús', 'almidon', [360, 12.5, 72, 1.5, 0.5, 0.3, 3.5, 0], { factor: 3 }),
  B('noquis', 'Ñoquis', 'almidon', [150, 3.5, 32, 0.5, 1, 0.1, 1.5, 1], { factor: 1 }),
  B('lentejas', 'Lentejas (secas)', 'almidon', [330, 24, 48, 1.5, 2, 0.2, 11, 0], { factor: 2.8 }),
  B('alubias', 'Alubias (secas)', 'almidon', [330, 22, 45, 1.5, 2.5, 0.2, 16, 0], { factor: 2.5 }),
  B('garbanzos', 'Garbanzos (secos)', 'almidon', [365, 20, 50, 6, 3, 0.6, 12, 0], { factor: 2.2 }),
  B('patata', 'Patata', 'almidon', [77, 2, 17, 0.1, 0.8, 0, 2.2, 0], { factor: 1 }),
  B('boniato', 'Boniato', 'almidon', [86, 1.6, 17, 0.1, 4.2, 0, 3, 0.1], { factor: 1 }),
  B('wrap-integral', 'Wrap integral', 'almidon', [300, 9, 48, 7, 2.5, 2, 6, 1.2]),

  // ---------- Grasas ----------
  B('aceite-oliva', 'Aceite de oliva virgen extra', 'grasa', [884, 0, 0, 100, 0, 14, 0, 0]),
  B('aguacate', 'Aguacate', 'grasa', [160, 2, 1.8, 14.7, 0.7, 2.1, 6.7, 0]),
  B('aceitunas', 'Aceitunas', 'grasa', [145, 1, 0.5, 15, 0, 2, 3.3, 2.5], { unitG: 4, unitName: 'aceituna' }),
  B('chocolate-85', 'Chocolate negro >85%', 'grasa', [590, 11, 14, 50, 11, 30, 12, 0]),
  B('crema-cacahuete', 'Crema de cacahuete 100%', 'grasa', [600, 25, 12, 50, 5, 8, 8, 0]),
  B('almendras', 'Almendras', 'grasa', [579, 21, 9.5, 50, 4.4, 3.8, 12.5, 0]),
  B('anacardos', 'Anacardos', 'grasa', [553, 18, 27, 44, 6, 7.8, 3.3, 0]),
  B('avellanas', 'Avellanas', 'grasa', [628, 15, 7, 61, 4.3, 4.5, 9.7, 0]),
  B('cacahuetes', 'Cacahuetes', 'grasa', [567, 26, 7.6, 49, 4, 6.3, 8.5, 0]),
  B('nueces', 'Nueces', 'grasa', [654, 15, 7, 65, 2.6, 6.1, 6.7, 0]),
  B('macadamia', 'Nueces de macadamia', 'grasa', [718, 8, 5, 76, 4.6, 12, 8.6, 0]),
  B('nuez-brasil', 'Nueces de Brasil', 'grasa', [659, 14, 4.2, 67, 2.3, 15, 7.5, 0]),
  B('pinones', 'Piñones', 'grasa', [673, 14, 9.4, 68, 3.6, 4.9, 3.7, 0]),
  B('pipas-girasol', 'Pipas de girasol', 'grasa', [584, 21, 11, 51, 2.6, 4.5, 8.6, 0]),
  B('pistachos', 'Pistachos', 'grasa', [560, 20, 18, 45, 7.7, 5.9, 10, 0]),

  // ---------- Frutas (peso de la parte comestible) ----------
  B('arandanos', 'Arándanos', 'fruta', [57, 0.7, 12, 0.3, 10, 0, 2.4, 0]),
  B('cerezas', 'Cerezas', 'fruta', [63, 1, 14, 0.2, 12.8, 0, 2.1, 0]),
  B('ciruela', 'Ciruela', 'fruta', [46, 0.7, 10, 0.3, 9.9, 0, 1.4, 0]),
  B('frambuesas', 'Frambuesas', 'fruta', [52, 1.2, 5.4, 0.7, 4.4, 0, 6.5, 0]),
  B('fresa', 'Fresas', 'fruta', [32, 0.7, 5.7, 0.3, 4.9, 0, 2, 0]),
  B('kiwi', 'Kiwi', 'fruta', [61, 1.1, 11.7, 0.5, 9, 0, 3, 0]),
  B('mandarina', 'Mandarina', 'fruta', [53, 0.8, 11.5, 0.3, 10.6, 0, 1.8, 0]),
  B('mango', 'Mango', 'fruta', [60, 0.8, 13.4, 0.4, 13.7, 0.1, 1.6, 0]),
  B('manzana', 'Manzana', 'fruta', [52, 0.3, 11.4, 0.2, 10.4, 0, 2.4, 0]),
  B('melocoton', 'Melocotón', 'fruta', [39, 0.9, 8, 0.3, 8.4, 0, 1.5, 0]),
  B('melon', 'Melón', 'fruta', [34, 0.8, 7.3, 0.2, 7.9, 0, 0.9, 0]),
  B('mora', 'Moras', 'fruta', [43, 1.4, 4.3, 0.5, 4.9, 0, 5.3, 0]),
  B('naranja', 'Naranja', 'fruta', [47, 0.9, 9.4, 0.1, 9.4, 0, 2.4, 0]),
  B('nectarina', 'Nectarina', 'fruta', [44, 1.1, 8.9, 0.3, 7.9, 0, 1.7, 0]),
  B('nispero', 'Níspero', 'fruta', [47, 0.4, 10.4, 0.2, 9, 0, 1.7, 0]),
  B('pera', 'Pera', 'fruta', [57, 0.4, 12, 0.1, 9.8, 0, 3.1, 0]),
  B('pina', 'Piña', 'fruta', [50, 0.5, 11.7, 0.1, 9.9, 0, 1.4, 0]),
  B('platano', 'Plátano', 'fruta', [89, 1.1, 20.2, 0.3, 12.2, 0.1, 2.6, 0]),
  B('sandia', 'Sandía', 'fruta', [30, 0.6, 7.2, 0.2, 6.2, 0, 0.4, 0]),
  B('uvas', 'Uvas', 'fruta', [69, 0.7, 17.2, 0.2, 15.5, 0, 0.9, 0]),

  // ---------- Verduras ----------
  B('acelgas', 'Acelgas', 'verdura', [19, 1.8, 2.1, 0.2, 1.1, 0, 1.6, 0.5]),
  B('alcachofas', 'Alcachofas', 'verdura', [47, 3.3, 5.1, 0.2, 1, 0, 5.4, 0.2]),
  B('berenjena', 'Berenjena', 'verdura', [25, 1, 2.9, 0.2, 3.5, 0, 3, 0]),
  B('berros', 'Berros', 'verdura', [11, 2.3, 0.8, 0.1, 0.2, 0, 0.5, 0.1]),
  B('brocoli', 'Brócoli', 'verdura', [34, 2.8, 4, 0.4, 1.7, 0, 2.6, 0.1]),
  B('calabacin', 'Calabacín', 'verdura', [17, 1.2, 2.1, 0.3, 2.5, 0.1, 1, 0]),
  B('calabaza', 'Calabaza', 'verdura', [26, 1, 6, 0.1, 2.8, 0, 0.5, 0]),
  B('canonigos', 'Canónigos', 'verdura', [21, 2, 2, 0.4, 0.5, 0, 1.6, 0]),
  B('coliflor', 'Coliflor', 'verdura', [25, 1.9, 3, 0.3, 1.9, 0, 2, 0.1]),
  B('endivias', 'Endivias', 'verdura', [17, 1.3, 0.3, 0.2, 0.3, 0, 3.1, 0.1]),
  B('esparragos', 'Espárragos', 'verdura', [20, 2.2, 1.8, 0.1, 1.9, 0, 2.1, 0]),
  B('espinacas', 'Espinacas', 'verdura', [23, 2.9, 1.4, 0.4, 0.4, 0.1, 2.2, 0.2]),
  B('guisantes', 'Guisantes', 'verdura', [81, 5.4, 9, 0.4, 5.7, 0.1, 5.7, 0]),
  B('judias-verdes', 'Judías verdes', 'verdura', [31, 1.8, 4.3, 0.2, 3.3, 0, 2.7, 0]),
  B('lechuga', 'Lechuga', 'verdura', [15, 1.4, 1.6, 0.2, 0.8, 0, 1.3, 0]),
  B('pepino', 'Pepino', 'verdura', [15, 0.7, 3.1, 0.1, 1.7, 0, 0.5, 0]),
  B('pimientos', 'Pimientos', 'verdura', [26, 1, 4, 0.3, 4.2, 0, 2, 0]),
  B('puerros', 'Puerros', 'verdura', [61, 1.5, 12.2, 0.3, 3.9, 0, 1.8, 0]),
  B('remolacha', 'Remolacha', 'verdura', [43, 1.6, 6.8, 0.2, 6.8, 0, 2.8, 0.2]),
  B('rucula', 'Rúcula', 'verdura', [25, 2.6, 2.1, 0.7, 2, 0.1, 1.6, 0.1]),
  B('setas', 'Setas / champiñones', 'verdura', [22, 3.1, 2.3, 0.3, 2, 0, 1, 0]),
  B('tomate', 'Tomate', 'verdura', [18, 0.9, 2.7, 0.2, 2.6, 0, 1.2, 0]),
  B('zanahoria', 'Zanahoria', 'verdura', [41, 0.9, 6.8, 0.2, 4.7, 0, 2.8, 0.2]),
  B('crema-verduras', 'Crema / sopa de verduras casera', 'verdura', [40, 1.5, 5, 1.5, 2.5, 0.2, 1.5, 0.6]),

  // ---------- Suplementos ----------
  B('creatina', 'Creatina monohidratada', 'suplemento', [0, 0, 0, 0, 0, 0, 0, 0]),
];

// Básicos de despensa: no se miden en gramos, solo "tengo / queda poco / se acabó".
// Incluye los aderezos libres de tu plan.
export const BASICOS = [
  'Sal', 'Pimienta', 'Ajo', 'Cebolla', 'Perejil', 'Limón', 'Vinagre', 'Vinagre balsámico',
  'Salsa de soja', 'Mostaza', 'Ajo en polvo', 'Salsa picante', 'Orégano', 'Pimentón', 'Comino',
];

// Comidas fuera del plan: valores aproximados de una ración típica.
export const PRESETS_FUERA = [
  { name: 'Hamburguesa con patatas', kcal: 1100, prot: 45, carb: 95, fat: 58 },
  { name: 'Pizza individual', kcal: 1000, prot: 40, carb: 120, fat: 38 },
  { name: 'Kebab / dürüm', kcal: 850, prot: 40, carb: 80, fat: 38 },
  { name: 'Tacos (3)', kcal: 650, prot: 30, carb: 60, fat: 30 },
  { name: 'Arepa reina pepiada', kcal: 450, prot: 22, carb: 45, fat: 20 },
  { name: 'Arepa con carne mechada y queso', kcal: 550, prot: 30, carb: 48, fat: 25 },
  { name: 'Plato de pasta (restaurante)', kcal: 800, prot: 28, carb: 105, fat: 28 },
  { name: 'Postre / tarta', kcal: 400, prot: 5, carb: 45, fat: 22 },
  { name: 'Cerveza 330 ml', kcal: 140, prot: 1, carb: 11, fat: 0 },
  { name: 'Copa de vino', kcal: 120, prot: 0, carb: 4, fat: 0 },
  { name: 'Refresco 330 ml', kcal: 140, prot: 0, carb: 35, fat: 0 },
];
