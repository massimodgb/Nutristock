// Guía de uso: cómo hacer cada cosa, en lenguaje sencillo.
import { html } from '../lib.js';

const GUIAS = [
  {
    t: '🚀 Empezar (una sola vez)',
    p: [
      'Más → Mi plan → Cargar plan: sube el PDF de tu nutricionista.',
      'Más → Perfil y objetivo: edad, altura, actividad y tu objetivo.',
      'Entreno → Marcas: apunta tus 1RM principales (Snatch, Clean, Back Squat…).',
      'Despensa → +: añade lo que tienes en casa.',
      'Más → Exportar copia de seguridad de vez en cuando (hasta que tengamos la nube).',
    ],
  },
  {
    t: '🍽️ Registrar comida rápido',
    p: [
      'Pesa la comida ya cocinada: la app calcula sola el peso en crudo y las calorías.',
      'Toca un bloque de tu plan (por ejemplo "Proteína" en Comida), elige el alimento y pon los gramos.',
      'Si comes casi siempre lo mismo: registra un día bien y pulsa "Guardar hoy como mi día habitual". Desde entonces, cada día: "Mi día habitual" → cambia los gramos que hayan variado → Añadir.',
      '"Copiar ayer" y "Repetir lo de ayer" (en cada comida) funcionan igual: puedes editar antes de añadir.',
      'Comidas libres: "Fuera del plan" → busca "hamburguesa", "Big Mac", "pizza", "arepa"… Hay platos generales y de cadenas (McDonald’s, Burger King, KFC, Five Guys, Telepizza, Subway, Starbucks) y venezolanos. Elige la ración (½, 1, 2…).',
      'Si no está, "Crear a medida": pon las calorías aproximadas y la app lo recuerda para la próxima vez.',
      'Para corregir algo, toca el registro: puedes cambiar los gramos o borrarlo (el stock se devuelve solo).',
    ],
  },
  {
    t: '📊 Calorías y objetivo',
    p: [
      'Arriba en Hoy: Objetivo − Comido = Te quedan. El objetivo es la media de tu plan; si eliges opciones más calóricas (ternera, wrap, macadamia) es normal pasarse un poco.',
      'Toca el resumen para ver el desglose por comida y por macros.',
      'Progreso → "¿A dónde te lleva tu plan?": compara tu gasto, tu plan y lo que comes de verdad, y te dice si vas a subir, bajar o mantener.',
      'Con 2-3 semanas registrando comida y peso, la app calcula tu gasto REAL (más fiable que la fórmula).',
      'Pésate cada mañana (Peso de hoy, en Hoy). Fíjate en la media de 7 días, no en un día suelto.',
    ],
  },
  {
    t: '💡 Ideas y recetas',
    p: [
      'Hoy → "Ideas y recetas" (o Más → Ideas y recetas). Eliges la comida (Desayuno, Comida, Cena…) y ves recetas que encajan en tu plan, con las cantidades de tu plan.',
      'Primero salen las que puedes hacer con lo que tienes en casa ("Tienes todo ✓"); en las demás te dice qué falta.',
      'Dentro de una receta: "Registrar en Comida de hoy" apunta todos los ingredientes de golpe y los descuenta de la despensa. "Añadir lo que falta a la compra" lo pasa a tu lista.',
      'Nada lleva pescado ni marisco. Si quieres más recetas, pídeselas a Claude.',
    ],
  },
  {
    t: '🛒 Despensa por envases',
    p: [
      'Cada cosa se cuenta en envases (bolsa, paquete, bote…). Al añadir, dices cuántos nuevos tienes y si hay uno ya abierto (y cuánto le queda).',
      'Al registrar comidas se descuenta solo, empezando por el envase abierto. Cuando se acaba, empieza el siguiente.',
      'Si la cuenta no cuadra (se cayó, lo regalaste, calculó mal): abre el producto en Despensa y pulsa "Se terminó" en ese envase, o corrige los gramos que quedan.',
      'Toca un producto → "Avisar cuando queden X" y "comprar Y". Ej.: almendras en bolsas de 500 g, compras 3 → avisar cuando quede 1, comprar 3. Cuando baje, aparece solo en Compra.',
      'Al añadir: peso de cada envase (si el escáner lo sabe ya viene puesto), cuántos tienes sin abrir y si hay uno ya abierto. Todo en la misma pantalla.',
      'Lo que escaneas se clasifica solo ("Queso ricotta Hacendado" cuenta como Ricotta) para que te salga al registrar tu plan. Si alguno no sale en un bloque, abajo tienes "Otros productos de tu despensa".',
      'Para borrar algo de la despensa: tócalo → "Quitar de la despensa" (sigue en tu biblioteca).',
      'Cosas que no son comida (toallitas, papel, detergente): + → "Crear producto nuevo" → activa "No es comida". Se cuentan por paquetes y pulsas "Se terminó" cuando acabas uno.',
      'Especias y salsas: en Básicos, solo "Tengo / Poco / No".',
    ],
  },
  {
    t: '📷 Escanear productos',
    p: [
      'Despensa → + → Escanear. Pon el código dentro del recuadro, a unos 15-20 cm, con buena luz. Pita al leerlo.',
      'Si no lo lee: estira la bolsa para que el código quede plano, prueba "Hacer foto del código" o escribe los números de debajo de las barras.',
      'Si el producto no está en la base de datos (pasa con algunos de marca blanca): "Pegar etiqueta" → haz foto a la tabla → en Fotos mantén el dedo sobre el texto → Copiar → pega. Solo se hace una vez.',
      'En la ficha del producto, "Cuenta como" une un producto de marca con tu plan (Pechuga Hacendado = Pechuga de pollo).',
    ],
  },
  {
    t: '🏋️ Entreno',
    p: [
      'Entreno → pega el mensaje de tu entrenadora tal cual. La app lo ordena en secciones y prepara los relojes.',
      'Botón Reloj: EMOM, AMRAP, For Time, varios bloques con descanso, Tabata… Quita el modo silencio para oír los pitidos.',
      'Cada ejercicio muestra en verde lo que te toca: "Clean: 3 × 5 · 75 kg" (si la entrenadora pone %, se calcula con tu RM; si pone "con 70 kg" o "@60kg", se usa ese peso).',
      'Si lo hiciste tal cual: "✓ Hecho así" / "✓ Hecho con 70 kg". Si cambiaste algo: "Cambiar kilos" u "Otro peso".',
      'Al pulsar "Marcar como hecho" en una sección, se guardan solos los pesos de la pauta que no hayas tocado.',
      'Cualquier otro ejercicio con peso (Bulgarian Split Squat, Hip Thrust…): "+ kg" para guardar el peso. La próxima vez verás "Última vez: …".',
      'Al terminar una sección: "Apuntar resultado" (tiempo, rondas, lo duro que fue, notas) y "Marcar como hecho".',
    ],
  },
  {
    t: '🏆 RM y porcentajes',
    p: [
      'Tus RM se guardan solos cuando apuntas kilos y superas tu marca (te avisa con 🏆). También puedes añadirlos en Marcas → +.',
      'Si solo tienes un 3RM o 5RM, la app estima tu 1RM (lo verás con "≈").',
      'Si la entrenadora pone "70% de hang power clean", se usa ese RM. Si no lo tienes, usa el más parecido (Power Clean → Clean) y te lo dice.',
      'En Marcas, toca un levantamiento para ver tu tabla de porcentajes (50-95%).',
      'Entreno → Ejercicios: todos tus ejercicios con sus vídeos y los pesos que usaste cada día. "DB" = 1 mancuerna y "DBs" = 2 mancuernas.',
    ],
  },
  {
    t: '📅 Plan nuevo cada mes',
    p: [
      'Más → Mi plan → Nuevo plan → elige el PDF. Revisa la vista previa y pulsa "Usar este plan".',
      'Tu historial no cambia: cada día guarda sus calorías.',
      'Si algo sale raro en la vista previa, pásale el PDF a Claude.',
    ],
  },
];

export function Guia({ go }) {
  return html`
    <div class="page">
      <button class="link back" onClick=${() => go('mas')}>‹ Más</button>
      <header class="top"><h1>Cómo se usa</h1></header>
      ${GUIAS.map(g => html`
        <details class="card guia">
          <summary>${g.t}</summary>
          <ul>${g.p.map(x => html`<li>${x}</li>`)}</ul>
        </details>`)}
    </div>`;
}
