// Recetario adaptado al plan del nutricionista (sin nada del mar).
// Cada ingrediente da una lista de alimentos posibles (ids de la biblioteca): la app elige el que tengas en casa
// y usa la CANTIDAD que marque tu plan para ese bloque. Una receta aparece en las comidas del plan
// donde encajan todos sus ingredientes (así sirve aunque el plan cambie cada mes).
// extras = aderezos y básicos (sal, ajo, soja…), que no cuentan calorías.

const P = ['pollo-pechuga', 'pollo-solomillo'];
const PAVO = ['pavo-pechuga', 'picada-pavo'];
const PICADA = ['picada-ternera', 'picada-pavo', 'picada-pollo'];
const VERDE_SALTEADO = ['brocoli', 'pimientos', 'zanahoria', 'calabacin', 'setas', 'judias-verdes'];
const ENSALADA = ['lechuga', 'tomate', 'pepino', 'rucula', 'canonigos', 'espinacas'];
const GRASA = ['aceite-oliva', 'aguacate', 'aceitunas'];
const LONCHAS = ['pavo-fiambre', 'jamon-cocido', 'jamon-serrano', 'queso-fresco-ligero', 'queso-burgos', 'mozzarella-light', 'requeson', 'ricotta', 'queso-cottage'];
const FRUTOS = ['almendras', 'nueces', 'avellanas', 'cacahuetes', 'anacardos', 'pistachos', 'crema-cacahuete'];
const LACTEO = ['yogur-proteico', 'queso-batido'];
const CEREAL = ['muesli', 'copos-avena', 'espelta-inflada', 'cereales-integrales', 'corn-flakes'];

const R = (id, nombre, tiempo, ingredientes, extras, pasos) => ({ id, nombre, tiempo, ingredientes, extras, pasos });
const I = (nombre, f) => ({ nombre, f });

export const RECETAS = [
  // ---------- Desayuno ----------
  R('tostadas-pavo-aguacate', 'Tostadas de pavo y aguacate', '5 min',
    [I('Pan integral', ['pan-integral']), I('Lonchas', ['pavo-fiambre', 'jamon-cocido', 'queso-fresco-ligero']), I('Aguacate', ['aguacate', 'aceite-oliva'])],
    ['Sal', 'Pimienta'],
    ['Tuesta el pan.', 'Machaca el aguacate con sal y pimienta y úntalo.', 'Pon encima las lonchas.']),
  R('tostadas-serrano-tomate', 'Tostadas con jamón y tomate', '5 min',
    [I('Pan integral', ['pan-integral']), I('Jamón', ['jamon-serrano', 'cecina', 'lomo-embuchado', 'jamon-cocido']), I('Aceite', ['aceite-oliva'])],
    ['Tomate', 'Sal'],
    ['Tuesta el pan.', 'Ralla tomate por encima, un chorrito del aceite medido y una pizca de sal.', 'Añade el jamón.']),
  R('tostadas-queso-fresco', 'Tostadas de queso fresco con aceite y orégano', '5 min',
    [I('Pan integral', ['pan-integral']), I('Queso', ['queso-fresco-ligero', 'queso-burgos', 'requeson', 'ricotta', 'queso-cottage', 'mozzarella-light']), I('Aceite', ['aceite-oliva'])],
    ['Orégano'],
    ['Tuesta el pan.', 'Pon el queso, el aceite medido y orégano.']),
  R('tortitas-avena', 'Tortitas de avena con frutos secos', '10 min',
    [I('Avena', ['copos-avena']), I('Huevos', ['huevo']), I('Frutos secos', FRUTOS)],
    ['Canela'],
    ['Tritura la avena con los huevos (y canela si quieres).', 'Haz las tortitas en sartén antiadherente a fuego medio, 2 min por lado.', 'Sirve con los frutos secos picados o la crema por encima.']),

  // ---------- Media mañana / merienda ----------
  R('bowl-yogur', 'Bowl de yogur proteico con fruta, cereales y frutos secos', '3 min',
    [I('Yogur', LACTEO), I('Fruta', ['platano', 'fresa', 'arandanos', 'frambuesas', 'manzana', 'kiwi', 'mango', 'melocoton']), I('Cereales', CEREAL), I('Frutos secos', FRUTOS)],
    [],
    ['Pon el yogur en un bol.', 'Añade la fruta troceada, los cereales y los frutos secos.']),
  R('yogur-frutos-rojos', 'Yogur proteico con frutos rojos', '2 min',
    [I('Yogur', LACTEO), I('Frutos rojos', ['fresa', 'frambuesas', 'arandanos', 'mora', 'cerezas'])],
    [],
    ['Mezcla el yogur con los frutos rojos.']),
  R('batido-platano', 'Batido de yogur y plátano', '3 min',
    [I('Yogur', LACTEO), I('Fruta', ['platano', 'mango', 'fresa', 'melocoton'])],
    ['Canela'],
    ['Tritura el yogur con la fruta y un poco de agua o hielo.']),

  // ---------- Comida / cena ----------
  R('bowl-pollo-teriyaki', 'Bowl de pollo teriyaki con arroz y verduras', '20 min',
    [I('Pollo', P), I('Arroz', ['arroz-integral', 'quinoa']), I('Verduras', VERDE_SALTEADO), I('Aceite', ['aceite-oliva'])],
    ['Salsa de soja', 'Ajo'],
    ['Cuece el arroz.', 'Saltea el pollo en tiras con el aceite medido y el ajo.', 'Añade las verduras y un chorrito de soja; 5 min más.', 'Sirve sobre el arroz.']),
  R('pasta-bolonesa', 'Pasta integral boloñesa casera', '25 min',
    [I('Carne picada', PICADA), I('Pasta', ['pasta-integral']), I('Verduras', ['tomate', 'zanahoria', 'setas', 'calabacin', 'pimientos']), I('Aceite', ['aceite-oliva'])],
    ['Cebolla', 'Ajo', 'Orégano'],
    ['Cuece la pasta.', 'Sofríe cebolla, ajo y la verdura picada con el aceite medido.', 'Añade la carne, dórala, y luego tomate triturado y orégano; 10 min.', 'Mezcla con la pasta.']),
  R('wrap-ternera', 'Wrap de ternera con pimientos y aguacate', '15 min',
    [I('Ternera', ['ternera-filete', 'picada-ternera']), I('Wrap', ['wrap-integral']), I('Verduras', ['pimientos', 'lechuga', 'tomate', 'cebolla']), I('Aguacate', ['aguacate', 'aceite-oliva'])],
    ['Pimentón', 'Comino'],
    ['Haz la ternera en tiras con pimentón y comino.', 'Saltea los pimientos.', 'Rellena el wrap con todo y el aguacate.']),
  R('fajitas-pollo', 'Fajitas de pollo', '15 min',
    [I('Pollo', P), I('Wrap', ['wrap-integral']), I('Pimientos', ['pimientos', 'lechuga', 'tomate']), I('Aguacate', ['aguacate', 'aceite-oliva'])],
    ['Pimentón', 'Comino', 'Limón'],
    ['Corta el pollo en tiras y saltéalo con las especias.', 'Saltea los pimientos.', 'Monta las fajitas con el aguacate y unas gotas de limón.']),
  R('ensalada-garbanzos-pollo', 'Ensalada templada de garbanzos con pollo', '15 min',
    [I('Pollo', P), I('Garbanzos', ['garbanzos', 'alubias', 'lentejas']), I('Verduras', ENSALADA), I('Aliño', ['aceite-oliva', 'aceitunas', 'aguacate'])],
    ['Limón', 'Sal', 'Comino'],
    ['Haz el pollo a la plancha y córtalo.', 'Mezcla los garbanzos cocidos con la verdura.', 'Aliña con el aceite medido, limón y comino.']),
  R('cerdo-boniato', 'Solomillo de cerdo con boniato asado y espárragos', '35 min',
    [I('Solomillo de cerdo', ['cerdo-solomillo']), I('Boniato', ['boniato', 'patata']), I('Verdura', ['esparragos', 'judias-verdes', 'brocoli']), I('Aceite', ['aceite-oliva'])],
    ['Sal', 'Pimienta', 'Romero'],
    ['Asa el boniato en dados a 200 °C unos 25 min.', 'Marca el solomillo y termínalo al horno 10 min.', 'Saltea los espárragos con el aceite medido.']),
  R('quinoa-pavo', 'Quinoa salteada con pavo y verduras', '20 min',
    [I('Pavo', PAVO), I('Quinoa', ['quinoa', 'cuscus', 'arroz-integral']), I('Verduras', ['calabacin', 'pimientos', 'zanahoria', 'setas']), I('Aceite', ['aceite-oliva'])],
    ['Ajo', 'Salsa de soja'],
    ['Cuece la quinoa.', 'Saltea el pavo y las verduras con el aceite medido.', 'Mezcla todo con un toque de soja.']),
  R('lentejas-pollo', 'Lentejas con verduras y pollo', '30 min',
    [I('Lentejas', ['lentejas', 'alubias', 'garbanzos']), I('Pollo', P), I('Verduras', ['zanahoria', 'puerros', 'pimientos', 'calabaza']), I('Aceite', ['aceite-oliva'])],
    ['Cebolla', 'Ajo', 'Pimentón', 'Comino'],
    ['Sofríe cebolla, ajo y verduras con el aceite medido.', 'Añade pimentón, comino, las lentejas y agua; 20 min.', 'Sirve con el pollo a la plancha en dados.']),
  R('cuscus-pollo', 'Cuscús con pollo especiado y verduras asadas', '20 min',
    [I('Cuscús', ['cuscus', 'quinoa']), I('Pollo', P), I('Verduras', ['calabacin', 'berenjena', 'pimientos', 'zanahoria']), I('Aceite', ['aceite-oliva'])],
    ['Comino', 'Pimentón', 'Limón'],
    ['Hidrata el cuscús con agua caliente 5 min.', 'Asa o saltea las verduras.', 'Haz el pollo con comino y pimentón y mezcla todo con limón.']),
  R('hamburguesa-casera', 'Hamburguesa casera de ternera con patatas al horno', '30 min',
    [I('Carne picada', ['picada-ternera', 'picada-pollo', 'picada-pavo']), I('Patata', ['patata', 'boniato']), I('Ensalada', ['lechuga', 'tomate', 'rucula']), I('Aceite', ['aceite-oliva'])],
    ['Sal', 'Pimienta', 'Mostaza'],
    ['Forma la hamburguesa con sal y pimienta.', 'Patatas en gajos al horno 25 min con el aceite medido.', 'Haz la hamburguesa a la plancha y sirve con ensalada y mostaza.']),
  R('noquis-pollo-espinacas', 'Ñoquis con pollo y espinacas', '15 min',
    [I('Ñoquis', ['noquis', 'pasta-integral']), I('Pollo', P), I('Verdura', ['espinacas', 'setas', 'calabacin']), I('Aceite', ['aceite-oliva'])],
    ['Ajo', 'Pimienta'],
    ['Cuece los ñoquis 2-3 min.', 'Saltea el pollo con ajo y el aceite medido.', 'Añade las espinacas hasta que se ablanden y mezcla.']),
  R('pollo-curry', 'Pollo al curry con arroz', '25 min',
    [I('Pollo', P), I('Arroz', ['arroz-integral']), I('Verduras', ['pimientos', 'calabacin', 'coliflor', 'zanahoria']), I('Aceite', ['aceite-oliva'])],
    ['Curry', 'Cebolla', 'Ajo'],
    ['Cuece el arroz.', 'Sofríe cebolla y ajo, añade el pollo y las verduras.', 'Añade curry y un poco de agua o yogur proteico; 10 min.']),
  R('crema-calabaza-pollo', 'Crema de calabaza con pollo a la plancha y patata', '30 min',
    [I('Crema / verdura', ['crema-verduras', 'calabaza', 'zanahoria', 'puerros']), I('Pollo', P), I('Patata', ['patata', 'boniato']), I('Aceite', ['aceite-oliva'])],
    ['Cebolla', 'Sal'],
    ['Cuece la calabaza con cebolla y tritura (sin patata dentro, como pide tu plan).', 'Patata cocida o asada aparte.', 'Pollo a la plancha con el aceite medido.']),
  R('tortilla-espinacas', 'Tortilla de espinacas con lonchas y patata', '15 min',
    [I('Huevos', ['huevo']), I('Lonchas', LONCHAS), I('Patata', ['patata', 'boniato', 'pan-integral']), I('Verdura', ['espinacas', 'setas', 'calabacin', 'pimientos']), I('Aceite', ['aceite-oliva'])],
    ['Sal'],
    ['Saltea la verdura con el aceite medido.', 'Bate los huevos y cuaja la tortilla con la verdura.', 'Acompaña con las lonchas y la patata.']),
  R('huevos-duros-ensalada', 'Ensalada completa con huevos duros', '15 min',
    [I('Huevos', ['huevo']), I('Verduras', ENSALADA), I('Patata / arroz', ['patata', 'arroz-integral', 'quinoa']), I('Aliño', ['aceite-oliva', 'aceitunas', 'aguacate'])],
    ['Sal', 'Vinagre'],
    ['Cuece los huevos 10 min.', 'Mezcla la verdura con la patata o el arroz.', 'Añade los huevos y aliña.']),
  R('ternera-plancha-arroz', 'Filete de ternera con arroz y verduras salteadas', '20 min',
    [I('Ternera', ['ternera-filete']), I('Arroz', ['arroz-integral', 'quinoa', 'patata']), I('Verduras', VERDE_SALTEADO), I('Aceite', ['aceite-oliva'])],
    ['Ajo', 'Sal'],
    ['Cuece el arroz.', 'Saltea las verduras con ajo y el aceite medido.', 'Haz la ternera a la plancha al punto.']),
  R('alubias-cerdo', 'Alubias con solomillo y verduras', '25 min',
    [I('Alubias', ['alubias', 'garbanzos']), I('Cerdo', ['cerdo-solomillo', 'pollo-pechuga']), I('Verduras', ['pimientos', 'zanahoria', 'puerros', 'espinacas']), I('Aceite', ['aceite-oliva'])],
    ['Cebolla', 'Ajo', 'Pimentón'],
    ['Sofríe cebolla, ajo y verduras con el aceite medido.', 'Añade las alubias cocidas y pimentón; 10 min.', 'Sirve con el solomillo a la plancha.']),
];
