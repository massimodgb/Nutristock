// Comidas fuera del plan (cheat meals): platos generales y de cadenas conocidas.
// Valores APROXIMADOS por ración (kcal, proteína, carbohidratos, grasa), a partir de la información
// nutricional publicada por las cadenas (España) y de tablas de referencia. Pueden variar según el local.
// m = marca/cadena (vacío = plato general). mar = lleva pescado o marisco.

const R = (n, m, kcal, p, c, g, extra = {}) => ({ n, m, kcal, prot: p, carb: c, fat: g, ...extra });

export const COMIDAS_FUERA = [
  // ---------- Generales ----------
  R('Hamburguesa con patatas (restaurante)', '', 1100, 45, 95, 58),
  R('Hamburguesa sola (restaurante)', '', 650, 35, 40, 38),
  R('Hamburguesa gourmet doble (Goiko, TGB…)', '', 1000, 55, 50, 62),
  R('Hamburguesa casera', '', 550, 30, 35, 30),
  R('Pizza individual entera', '', 1000, 40, 120, 38),
  R('Porción de pizza', '', 280, 12, 32, 11),
  R('Kebab en pan de pita', '', 700, 35, 65, 32),
  R('Dürüm / kebab enrollado', '', 850, 40, 80, 38),
  R('Plato de kebab con patatas', '', 1100, 50, 90, 60),
  R('Tacos (3)', '', 650, 30, 60, 30),
  R('Burrito', '', 900, 40, 100, 35),
  R('Nachos con queso (para compartir, entero)', '', 900, 25, 80, 55),
  R('Perrito caliente', '', 330, 12, 30, 18),
  R('Bocadillo de jamón serrano', '', 450, 25, 55, 14),
  R('Bocadillo de lomo con queso', '', 650, 35, 60, 28),
  R('Sándwich mixto', '', 350, 18, 30, 17),
  R('Pincho de tortilla de patatas', '', 250, 7, 18, 16),
  R('Patatas bravas (ración)', '', 550, 6, 50, 35),
  R('Croquetas (6)', '', 450, 13, 36, 28),
  R('Alitas de pollo (8)', '', 650, 50, 10, 45),
  R('Costillas BBQ (ración)', '', 900, 55, 30, 62),
  R('Pollo asado (1/4 con piel)', '', 450, 45, 0, 30),
  R('Plato de pasta carbonara', '', 800, 30, 90, 35),
  R('Plato de pasta boloñesa', '', 700, 32, 90, 22),
  R('Lasaña (ración)', '', 600, 30, 45, 32),
  R('Paella de pollo (ración)', '', 600, 30, 75, 18),
  R('Ensalada César con pollo', '', 550, 35, 20, 36),
  R('Menú del día (primero + segundo + postre)', '', 1300, 55, 130, 55),
  R('Comida china (arroz tres delicias + pollo)', '', 1000, 40, 120, 38),
  R('Poke bowl de pollo', '', 650, 35, 75, 22),
  R('Sushi (12 piezas)', '', 550, 22, 90, 10, { mar: true }),
  R('Calamares a la romana (ración)', '', 600, 30, 40, 35, { mar: true }),
  // Postres y dulces
  R('Tarta de queso (porción)', '', 450, 8, 35, 30),
  R('Tiramisú', '', 450, 7, 40, 28),
  R('Brownie', '', 400, 5, 50, 20),
  R('Helado (2 bolas)', '', 300, 5, 35, 15),
  R('Donut', '', 250, 4, 30, 13),
  R('Croissant', '', 270, 5, 30, 14),
  R('Churros (6) con chocolate', '', 650, 9, 80, 32),
  R('Tableta de chocolate con leche (100 g)', '', 540, 7, 57, 31),
  // Bebidas
  R('Caña de cerveza (200 ml)', '', 85, 1, 7, 0),
  R('Tercio de cerveza (330 ml)', '', 140, 1, 11, 0),
  R('Copa de vino', '', 120, 0, 4, 0),
  R('Tinto de verano', '', 150, 0, 18, 0),
  R('Gin tonic', '', 200, 0, 16, 0),
  R('Ron con cola', '', 220, 0, 25, 0),
  R('Mojito', '', 220, 0, 25, 0),
  R('Refresco (330 ml)', '', 140, 0, 35, 0),

  // ---------- McDonald's ----------
  R('Big Mac', "McDonald's", 508, 26, 42, 26),
  R('Cuarto de Libra con queso', "McDonald's", 518, 30, 37, 27),
  R('McRoyal Deluxe', "McDonald's", 540, 28, 39, 30),
  R('Big Tasty', "McDonald's", 840, 45, 48, 52),
  R('McPollo', "McDonald's", 470, 18, 45, 23),
  R('Hamburguesa con queso', "McDonald's", 301, 15, 31, 12),
  R('Hamburguesa', "McDonald's", 250, 12, 30, 8.5),
  R('Chicken McNuggets (6)', "McDonald's", 260, 15, 16, 15),
  R('Chicken McNuggets (9)', "McDonald's", 390, 23, 24, 23),
  R('Patatas fritas pequeñas', "McDonald's", 230, 2.5, 29, 11),
  R('Patatas fritas medianas', "McDonald's", 330, 3.5, 42, 16),
  R('Patatas fritas grandes', "McDonald's", 440, 5, 56, 21),
  R('McFlurry Oreo', "McDonald's", 340, 7, 54, 10),
  R('Sundae de caramelo', "McDonald's", 300, 6, 50, 9),
  R('Menú Big Mac (patatas medianas + refresco mediano)', "McDonald's", 1010, 30, 126, 42),

  // ---------- Burger King ----------
  R('Whopper', 'Burger King', 660, 28, 49, 40),
  R('Whopper Junior', 'Burger King', 330, 15, 29, 18),
  R('Doble Whopper', 'Burger King', 900, 48, 49, 57),
  R('Big King', 'Burger King', 530, 29, 38, 29),
  R('Long Chicken', 'Burger King', 640, 24, 58, 35),
  R('Patatas medianas', 'Burger King', 330, 4, 42, 16),
  R('Nuggets (9)', 'Burger King', 410, 19, 27, 25),

  // ---------- KFC ----------
  R('Pieza de pollo Original', 'KFC', 250, 23, 8, 14),
  R('Tiras de pollo (3)', 'KFC', 330, 25, 18, 17),
  R('Zinger Burger', 'KFC', 450, 25, 45, 19),
  R('Bucket para uno (4 piezas + patatas)', 'KFC', 1350, 95, 75, 75),

  // ---------- Five Guys ----------
  R('Hamburguesa (doble carne)', 'Five Guys', 840, 47, 39, 55),
  R('Little Hamburger (una carne)', 'Five Guys', 540, 27, 39, 31),
  R('Cheeseburger (doble)', 'Five Guys', 980, 55, 40, 66),
  R('Patatas pequeñas', 'Five Guys', 530, 8, 72, 23),
  R('Patatas regulares', 'Five Guys', 950, 15, 131, 41),

  // ---------- Pizzas a domicilio ----------
  R('Pizza mediana barbacoa (entera)', "Telepizza / Domino's", 1800, 80, 200, 70),
  R('Pizza mediana barbacoa (1 porción de 8)', "Telepizza / Domino's", 225, 10, 25, 9),
  R('Pizza mediana 4 quesos (entera)', "Telepizza / Domino's", 1900, 85, 190, 85),
  R('Pizza mediana pepperoni (entera)', "Telepizza / Domino's", 1850, 80, 185, 85),

  // ---------- Otros ----------
  R('Sub 15 cm de pavo', 'Subway', 280, 18, 46, 3.5),
  R('Sub 15 cm Italiano BMT', 'Subway', 410, 20, 46, 16),
  R('Montadito (media)', '100 Montaditos', 160, 7, 20, 6),
  R('Frappuccino de caramelo grande', 'Starbucks', 380, 5, 59, 15),
  R('Latte grande (leche entera)', 'Starbucks', 220, 12, 18, 11),
  R('Crunchy Taco', 'Taco Bell', 170, 8, 13, 9),
  R('Burrito Supreme', 'Taco Bell', 390, 15, 51, 14),

  // ---------- Venezuela ----------
  R('Arepa sola', 'Venezuela', 220, 4, 44, 2),
  R('Arepa reina pepiada', 'Venezuela', 450, 22, 45, 20),
  R('Arepa con carne mechada y queso', 'Venezuela', 550, 30, 48, 25),
  R('Arepa de pabellón', 'Venezuela', 650, 30, 75, 24),
  R('Empanada de carne (frita)', 'Venezuela', 300, 10, 30, 16),
  R('Empanada de queso (frita)', 'Venezuela', 320, 9, 30, 18),
  R('Tequeños (5)', 'Venezuela', 400, 14, 36, 22),
  R('Cachapa con queso de mano', 'Venezuela', 650, 25, 75, 28),
  R('Pabellón criollo', 'Venezuela', 900, 45, 100, 35),
  R('Hallaca', 'Venezuela', 500, 18, 45, 28),
  R('Perro caliente venezolano', 'Venezuela', 550, 18, 50, 30),
  R('Pepito de carne', 'Venezuela', 1000, 50, 90, 50),
  R('Patacón', 'Venezuela', 900, 40, 85, 45),
  R('Tostón / tajadas (ración)', 'Venezuela', 350, 2, 50, 16),
];
