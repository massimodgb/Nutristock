// Platos típicos de buffet y restaurante, por PLATO MEDIANO de buffet (lo que te sirves en un plato normal).
// Valores APROXIMADOS (kcal, proteína, carbohidratos, grasa). Al registrar eliges pequeño / mediano / grande y cuántos.
// mar = lleva pescado o marisco (se oculta si lo excluyes en Más → Preferencias).
const P = (n, cat, kcal, prot, carb, fat, extra = {}) => ({ n, cat, kcal, prot, carb, fat, buffet: true, ...extra });

export const TAMANOS_PLATO = [
  { id: 'pequeno', nombre: 'Pequeño', f: 0.6 },
  { id: 'mediano', nombre: 'Mediano', f: 1 },
  { id: 'grande', nombre: 'Grande', f: 1.5 },
];

export const PLATOS_BUFFET = [
  // Arroces y pasta
  P('Arroz blanco', 'Arroz y fideos', 195, 4, 43, 0.5),
  P('Arroz frito / tres delicias', 'Arroz y fideos', 270, 7, 38, 10),
  P('Fideos salteados (yakisoba, chow mein)', 'Arroz y fideos', 300, 9, 42, 10),
  P('Fideos de arroz salteados', 'Arroz y fideos', 280, 6, 48, 7),
  P('Pasta con salsa de tomate', 'Arroz y fideos', 280, 9, 50, 5),
  P('Pasta a la carbonara / con nata', 'Arroz y fideos', 450, 15, 48, 22),
  // Carnes
  P('Ternera salteada con salsa', 'Carne y pollo', 260, 22, 8, 15),
  P('Carne de cerdo agridulce', 'Carne y pollo', 340, 15, 30, 17),
  P('Pollo frito / rebozado', 'Carne y pollo', 330, 20, 22, 18),
  P('Pollo agridulce', 'Carne y pollo', 320, 18, 30, 14),
  P('Pollo teriyaki o a la plancha', 'Carne y pollo', 220, 27, 9, 8),
  P('Pollo al curry', 'Carne y pollo', 300, 22, 10, 19),
  P('Costillas con salsa barbacoa', 'Carne y pollo', 420, 26, 15, 28),
  P('Albóndigas con salsa', 'Carne y pollo', 330, 18, 14, 22),
  P('Pato laqueado', 'Carne y pollo', 380, 20, 10, 28),
  // Verduras y acompañamientos
  P('Verduras salteadas', 'Verduras y guarniciones', 90, 3, 10, 4),
  P('Ensalada (con aliño)', 'Verduras y guarniciones', 110, 2, 6, 8),
  P('Patatas fritas', 'Verduras y guarniciones', 370, 4, 45, 19),
  P('Tempura de verduras', 'Verduras y guarniciones', 220, 3, 24, 12),
  P('Edamame', 'Verduras y guarniciones', 120, 11, 9, 5),
  P('Sopa (miso, wantán…)', 'Verduras y guarniciones', 70, 4, 8, 2),
  // Entrantes y dim sum
  P('Rollitos de primavera (2)', 'Entrantes', 220, 5, 26, 10),
  P('Gyozas de pollo o cerdo (4)', 'Entrantes', 200, 9, 24, 7),
  P('Dim sum / empanadillas al vapor (4)', 'Entrantes', 180, 8, 24, 5),
  P('Pan bao (1)', 'Entrantes', 230, 9, 32, 7),
  // Sushi (6 piezas por plato mediano)
  P('Sushi vegetal: maki de pepino o aguacate (6 piezas)', 'Sushi', 180, 4, 36, 3),
  P('California roll sin pescado (6 piezas)', 'Sushi', 250, 6, 38, 8),
  P('Sushi variado con pescado (6 piezas)', 'Sushi', 280, 13, 40, 7, { mar: true }),
  P('Sashimi de salmón (6 piezas)', 'Sushi', 230, 24, 0, 14, { mar: true }),
  P('Uramaki con tempura o queso crema (6 piezas)', 'Sushi', 330, 9, 42, 14),
  // Pizza y otros
  P('Pizza (2 porciones)', 'Otros', 560, 22, 66, 22),
  P('Nuggets / alitas de pollo (6)', 'Otros', 400, 22, 18, 26),
  // Postres
  P('Helado (2 bolas)', 'Postres', 280, 5, 32, 14),
  P('Tarta o pastel (1 porción)', 'Postres', 350, 5, 45, 16),
  P('Fruta variada', 'Postres', 70, 1, 16, 0),
  P('Bolas de sésamo / dulce asiático', 'Postres', 250, 4, 35, 10),
];

// Categorías en el orden en que se enseñan
export const CATS_BUFFET = ['Arroz y fideos', 'Carne y pollo', 'Verduras y guarniciones', 'Entrantes', 'Sushi', 'Otros', 'Postres'];
