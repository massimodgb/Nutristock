# NutriStock v3 · Fase 0: auditoría y plan

> 19 de octubre de 2026 · Estado de partida: **v35** publicada, `main` limpio (solo archivos sin seguimiento).
> Nada de este documento ha cambiado código ni datos. Las pruebas se hicieron importando los módulos
> en el navegador de pruebas, sin escribir en la base de datos.

---

## 1. Diagnóstico de la situación actual

**Arquitectura** (sin cambios desde v35): PWA sin compilación (Preact + htm, Dexie/IndexedDB esquema v5,
pdf.js, ZXing). Datos solo en el iPhone + copia en la nube (Supabase, tabla única `registros`).
Pruebas: `herramientas/comprobar.html` (86 comprobaciones en el navegador; no hay Node).

**Cómo funciona hoy lo que vamos a tocar**

| Área | Cómo funciona | Dónde |
|---|---|---|
| Calorías | Valores por 100 g "tal como se compra". Lo registrado en cocido se pasa a crudo con un **factor fijo** por alimento (`toRaw`) y se calcula sobre el crudo (`nutrFor`). Cada registro guarda una copia de sus nutrientes (`log.n`). | `js/nutri.js`, `js/views/hoy.js` (`saveLog`, `LogDetail`) |
| Despensa | Cada envase es un lote (`lots`) con gramos. Comer descuenta los gramos en crudo (`deductStock`), primero el abierto. Borrar un registro devuelve lo descontado. "Se terminó" pone el envase a 0. | `js/db.js`, `js/views/stock.js` |
| Variantes | Un producto escaneado "cuenta como" un alimento base (`genericId`): dos yogures distintos ya tienen sus propios valores y comparten familia. | `js/db.js` (`candidateIds`) |
| Preparaciones | **Ya existe** "Cociné una receta": ingredientes en crudo + peso total cocinado → un alimento con valores por 100 g cocinados y un táper en la despensa. Comer del táper no vuelve a descontar los ingredientes. | `js/views/receta.js` |
| Entreno | El texto se relee siempre con la última versión del lector (`leer(w)`). Los kilos de cada serie salen de `pautaLinea` (RM × %). Los resultados se guardan **por posición** de la línea (`parte-línea`). | `js/entreno/parser.js`, `rm.js`, `js/views/entreno.js` |
| Relojes | Ya están hechos como una **cadena de tramos** (preparación, trabajo, descanso). Pitidos con Web Audio (onda suave, volumen 0,25). | `js/views/reloj.js` |
| Peso | Una fila por día (`weights`, clave = fecha). No existen medidas corporales. | `js/db.js` |
| Informes | Nutricionista y entrenadora en HTML/PDF/CSV, desde los datos guardados. | `js/views/informes.js` |

---

## 2. Problemas confirmados (con prueba)

### Nutrición y despensa
1. **Patata/boniato al airfryer o al horno salen con la mitad de calorías.** Tienen factor 1,0 (pensado para hervir). 300 g crudos → 150 g asados: la app calcula 150 g de patata cruda (≈115 kcal) en vez de 300 g (≈231 kcal) y deja 150 g ficticios en la despensa. Mismo fallo de fondo para cualquier alimento cuyo método de cocción no coincida con el factor fijo.
2. **Etiquetas con la columna "por ración" primero** (frecuente en inglés): el lector toma el primer número como si fuera por 100 g. Prueba: etiqueta de 370 kcal/100 g con ración de 30 g → se guardó **111 kcal por 100 g** (3,3 veces menos).
3. **Nutrientes desconocidos cuentan como 0** (`nutrFor` usa `|| 0`). Un producto de Open Food Facts sin dato de grasa o de kcal suma 0 sin avisar. (Ya lo señaló la primera auditoría de Codex.)
4. **"Cocinar otra vez" una receta reutiliza el mismo producto** y sobrescribe sus valores: si queda táper de la tanda anterior, se mezcla con los valores nuevos.
5. **Editar los gramos de un registro antiguo recalcula con los valores actuales del producto** (si corregiste la etiqueta después, el día pasado cambia en silencio).
6. **Envase de 120 g del que comes 110 g**: quedan 10 g ficticios. "Se terminó" existe en la ficha del producto, pero (a) no está en el flujo de registrar, y (b) no apunta esos 10 g como merma: simplemente desaparecen.
7. **No existe registrar para varias comidas/fechas a la vez** (meal prep). "Añadir comida" trabaja con una sola comida de un solo día.
8. **No hay transparencia por registro**: no se ve la fuente del dato (base, Open Food Facts, etiqueta, manual, receta, estimado) ni el factor aplicado de un vistazo.

### Entreno (probado con el lector real)
9. `Clean 5x3 @45%-50%-55%-60%-62.5%` → lee **45, 50, 55, 60** (pierde el 62,5 porque no entiende decimales) y, como 4 ≠ 5 series, pone **las 5 series a 52 kg**. Es exactamente lo que viste.
10. `Clean 5x3 @45-50-55-60-62.5%` → **no lee ningún porcentaje**.
11. `Back Squat 4x3 @ 100-110%` (rango) → usa solo el 100 %.
12. Los kilos se redondean a 1 kg y se pierde el valor teórico; no hay redondeo a discos montables.
13. `Clean Deficit Deadlift 3x3 @35-40-45% del RM de Clean` → **sí usa el RM de Clean** (40/46/52 kg), pero por casualidad: el lector interpreta "RM de Clean" como nombre y su ejercicio base sale como "Deadlift". Funciona, pero es frágil.
14. **Complejos no existen**: "Complex de Snatch / Cada 1:30 x 6 sets / 1 Power Snatch / 1 Squat Snatch / 1 OHS / 35-40-…-60%" se lee como 5 ejercicios sueltos. Peor: **"Cada 1:30 x 6 sets" se interpreta como 30 series de 6**, "Complex de Snatch" y "Cada 1" salen como ejercicios con su "+ kg", y la línea de porcentajes queda huérfana.
15. **WOD por minutos** (`Min 0-8 AMRAP / Min 8-10 Rest / Min 10-20 AMRAP`) → lo lee como un único **AMRAP de 10 min**, y "Min : AMRAP" / "Min : Rest" salen como ejercicios.
16. **Descansos** ("Rest: 90 seg") no se leen.
17. **El campo de tiempo usa teclado numérico** (`inputmode="numeric"`): en el iPhone no hay ":" → "1540". Se guarda como texto, no en segundos.
18. **Series**: solo kilos y repeticiones. No hay serie fallida/incompleta, notas por serie, "serie actual" ni descanso al completar.
19. **No hay reloj de descanso de fuerza** ni editor libre de tramos (aunque el motor de tramos ya existe).
20. Los RM estimados (Epley desde un 3RM/5RM) se usan automáticamente; se indica "estimado", pero no se pide confirmación.

### Suplementos (probado con el lector real)
21. Etiquetas en inglés: **"Serving Size 2 Softgels" y "1 stick" no se detectan** (la porción queda vacía).
22. Las **calorías, grasas y carbohidratos** de un suplemento se ignoran (un sobre de electrolitos con 2 g de azúcar o el aceite del omega 3 cuentan 0 kcal).
23. EPA y DHA se suman en "omega 3" pero **no se guardan por separado**.

### Medidas
24. **No existen medidas corporales** (cintura, cadera…). El peso admite un valor por día.

---

## 3. Lo que necesita una comprobación adicional

| Tema | Qué falta | Cómo lo comprobamos |
|---|---|---|
| **Diferencia con MyFitnessPal (≈3.000 frente a ≈2.400)** | No se sabe cuál acierta: las capturas eran de días distintos. Candidatos ya confirmados que restan calorías en NutriStock: patata/boniato asados (punto 1), etiquetas por ración (2), nutrientes vacíos (3). Candidatos que suman en MyFitnessPal: fichas de arroz/pasta en seco usadas en cocido, aceite de cocinar apuntado allí y no aquí. | Con **una copia exportada** (Más → Tus datos → Exportar copia) y una captura de MyFitnessPal **del mismo día**, comparar alimento por alimento. Lo analizo en local, sin subir nada. |
| Factores de carne (0,75) | Tu picada real: 500 → 390 g = 0,78. Varía según cocción. | La precisión real llega con el modo "lote de preparación" (pesas antes y después). |
| Sonido con música en el iPhone | Depende de iOS: no se puede probar desde el ordenador. | Prototipo con varias opciones y prueba tuya en el iPhone (ver 5.4). |
| Datos históricos afectados | Registros antiguos de patata/boniato asados o de productos con etiqueta mal leída. | Generar una lista de "registros sospechosos" para que decidas; **no se corrige nada sin tu permiso**. |

---

## 4. Plan por fases

Regla para todas: rama de trabajo `v3` (en tu ordenador; la app publicada no cambia hasta que digas "publica"),
cambios aditivos, `comprobar.html` en verde + pruebas nuevas de cada caso del documento, `PROGRESS.md` al cerrar cada fase.

### Fase 1 · Precisión nutricional
- **Método de cocción por alimento**: hervido / airfryer-horno / plancha… con su factor, y "calibrar" en el momento (crudo → cocinado) que quede guardado como tu factor para ese método.
- **Lote de preparación sencillo**: "Cociné 300 g de patata → pesan 150 g" en 2 campos. Descuenta los 300 g crudos una vez y crea el táper de 150 g con los valores correctos. La receta completa actual se mantiene para guisos.
- **Cada tanda es un táper propio** (no sobrescribe la anterior).
- **"Sin dato" ≠ 0**: los nutrientes vacíos se marcan y el total del día avisa ("faltan datos de grasa en 1 producto").
- **Etiquetas**: detectar columna por 100 g / por ración (español e inglés) y preguntar si hay duda.
- **Transparencia**: en cada registro, cantidad, cocido/crudo, gramos en crudo, factor, kcal/100 g usadas y fuente. Pantalla "Revisar el día" para comparar con MyFitnessPal.
- Editar un registro antiguo conserva los valores con los que se apuntó (salvo que elijas "actualizar con la ficha nueva").
- Lista de registros históricos sospechosos (solo informativa).

### Fase 2 · Despensa y meal prep
- Al registrar un producto envasado: **"Terminé el envase"** en el mismo paso. Lo que sobra se apunta como **merma** del envase (no como comida).
- Ajuste rápido de lo que queda ("quedan 40 g").
- **"Se acabó, compré otro parecido"**: copia la ficha (familia, envase, aviso) y te pide solo lo que cambia (sabor, código, etiqueta). Valores siempre separados por variante.
- Despensa de un vistazo: abiertos, se agotan, a comprar y "lo necesitarás estos días según tu plan", con filtros y búsqueda (sin rediseñar la estética).
- **Varias comidas a la vez**: elegir "Cena de hoy + Comida de mañana (+ las que quieras)" y poner los gramos de cada ingrediente en cada una (229 g / 230 g), sin repartos automáticos. Un solo guardado, despensa y calorías al día. Integrado con el lote de preparación (el táper se reparte entre esas comidas).

### Fase 3 · Entrenos
- Lector: porcentajes con decimales, uno por serie, rangos, "del RM de X", descansos, "cada 1:30 x 6", complejos (movimientos unidos con sus series), tramos por minutos, y encabezados/instrucciones que dejan de ser ejercicios (sin quitar el "+ kg" mientras haya duda).
- **Pantalla de revisión antes de guardar** el entreno pegado (qué entendió, y elegir el RM de referencia si no está claro).
- RM: elegir la referencia del complejo, Training Max opcional, aviso claro de "sin RM: no calculo", y el estimado solo si lo aceptas.
- **Redondeo a discos** (manteniendo el teórico: "71,9 kg → 72,5 kg").
- **Series una a una**: serie actual, kilos y reps reales, fallida/incompleta, notas, plan frente a hecho, cifras grandes.
- **Protección de lo ya guardado**: hoy los resultados van por posición de línea; si el lector cambia, se descolocarían. Antes de tocar el lector, los entrenos con resultados guardan su estructura tal como se leyó ("congelada"). Informe de entrenadora: mismo formato, más datos.

### Fase 4 · Relojes
- **Descanso de fuerza** unido a "Completar serie": empieza solo, pausa, +15 s, saltar, aviso. Distingue "cada 1:30" (intervalo fijo) de "descansa 1:30" (desde que terminas).
- **Editor de tramos** (trabajo, descanso, preparación, nombre y duración) + favoritos; pocos modos clásicos editables en vez de muchos botones.
- **Tiempo de resultado en minutos y segundos** por separado, guardado en segundos, mostrado "15:40" en historial e informes (los textos antiguos se siguen leyendo).
- Sonido: ver 5.4.

### Fase 5 · Suplementos y etiquetas
- Porción en inglés y español (softgel, stick, scoop…), EPA/DHA por separado, aceite de pescado ≠ omega 3, calorías y macros del suplemento cuando los tenga, unidades (mg, g, µg, UI) con dudas marcadas.
- Revisión antes de guardar con los valores dudosos resaltados.
- Fotografía: ver 5.5.

### Fase 6 · Medidas y progreso
- Tabla nueva `medidas` (aditiva): cintura, cadera y otras; varias tomas en la misma sesión, eliges la representativa, notas.
- Gráficas de peso (real + media semanal + tendencia, claramente distinguidas) y de cintura/cadera; cambios semanales y mensuales.
- Informe semanal para nutricionista con peso, tendencia, medidas, variación y adherencia, con apartados que se pueden activar o quitar cuando opine.

### Fase 7 · Validación general
Regresión completa en `comprobar.html`, todos los casos obligatorios del documento, iPhone emulado (claro/oscuro), y lista de lo que solo puedes probar tú en el iPhone.

---

## 5. Riesgos, dependencias y decisiones

### 5.1 Dependencias
- Fase 2 (meal prep) se apoya en el lote de preparación de la Fase 1.
- Fase 4 (descanso al completar serie) se apoya en las series de la Fase 3.
- Fase 6 informe usa las medidas de la Fase 6; el informe de entrenadora usa los datos de la Fase 3.
- Las Fases 3-4 son independientes de 1-2: se pueden adelantar.

### 5.2 Riesgos técnicos y cómo se protegen
| Riesgo | Protección |
|---|---|
| Cambiar el lector descoloca resultados de entrenos antiguos | Congelar la estructura de los entrenos que ya tienen resultados antes de cambiar el lector; prueba con entrenos reales. |
| Tabla nueva (`medidas`) rompe restaurar copias antiguas (hoy se exigen todas las tablas salvo Whoop) | Marcarla opcional en `validarCopia`, añadirla a copias y nube, esquema v6 solo aditivo (Dexie no borra nada al subir de versión). |
| Mermas y "terminar envase" desajustan stock al borrar un registro | Todo en una transacción; la merma se guarda en el propio envase y se deshace con él; pruebas de borrar y editar. |
| Recalcular registros antiguos | Nunca automático: lista de sospechosos y corrección solo con tu permiso, con copia interna antes. |
| Sincronización en la nube con campos nuevos | El motor sube filas completas (JSON): los campos nuevos viajan solos; se prueba con la nube simulada. |
| Volver atrás | Rama `v3` + copia interna antes de cada cambio de esquema; publicar es un paso aparte que autorizas tú. |

### 5.3 Decisiones que necesito de ti
1. **Discos**: ¿con qué saltos montas la barra? (p. ej. discos de 1,25 kg por lado → saltos de 2,5 kg; o tienes de 0,5 kg). ¿Redondear al más cercano o siempre hacia abajo?
2. **Comparación con MyFitnessPal**: ¿me pasas una copia exportada y una captura de MyFitnessPal del mismo día? (Lo analizo en local; no se sube.)
3. **Comidas de mañana registradas hoy** (meal prep): ¿cuentan ya como comidas normales de mañana, o prefieres que salgan como "preparada, pendiente de comer" hasta ese día?
4. **Orden**: ¿empezamos por la Fase 1 como pediste, o adelantamos tres arreglos pequeños de entreno que usas a diario (porcentajes con decimales, "cada 1:30 x 6", tiempo en mm:ss)?

### 5.4 Sonido con música en iPhone (lo que es posible)
- Hoy los pitidos son suaves y de volumen bajo: con música se pierden.
- Opciones a probar en tu iPhone: pitidos más fuertes y "cortantes" (onda cuadrada + compresor), **Audio Session de Safari** (`navigator.audioSession`, iOS 17+) en modo que baje la música un momento, y voz para la cuenta atrás ("3, 2, 1").
- **Límites reales de iOS**: con la pantalla bloqueada o la app en segundo plano, una web no puede seguir pitando con fiabilidad; el botón de silencio también puede callarla. Alternativa: la pantalla se mantiene encendida (ya lo hace) + destello de color a pantalla completa en cada cambio. Vibración: Safari en iPhone no la permite.

### 5.5 Registro por foto (sin costes)
- **Gratis ya**: Live Text del iPhone (copiar el texto de la foto y pegarlo), que mejoraremos con el lector nuevo de etiquetas.
- **Gratis dentro de la app**: Tesseract.js (lee la foto en el propio iPhone, sin enviar nada fuera). Contras: descarga de unos 10-20 MB la primera vez y peor precisión que Live Text en tablas.
- **De pago (desactivado)**: IA con visión (céntimos al mes). Solo con tu autorización expresa.
- Recomendación: Live Text + lector mejorado primero; Tesseract como opción si Live Text se queda corto.
