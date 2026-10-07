# NutriStock: diseño y hoja de ruta

## Principios

- **iPhone primero.** Se usa el 99% del tiempo desde el móvil, con una mano.
- **Coste cero.** Nada de servicios de pago.
- **El plan del nutricionista es el eje.** Se registra por bloques del plan, se compra según el plan y se sugieren recetas que encajen en él.
- **Se pesa en cocido.** Las calorías y el stock se calculan en crudo mediante factores de cocción.
- **Nada del mar.** Pescado y marisco quedan ocultos aunque el plan los permita (se puede cambiar en Más).
- **Datos precisos para el nutricionista.** Cada registro guarda una copia de sus valores nutricionales, así que el historial no cambia aunque cambie el plan.

## Modelo de datos (IndexedDB en el teléfono)

| Tabla | Contenido |
|---|---|
| `foods` | Alimentos base y productos propios: valores por 100 g, `factor`, `genericId` ("cuenta como…"), `packG`, `unitG`, `minG`, `mar` |
| `lots` | Lotes de despensa: `foodId`, gramos en crudo, caducidad |
| `basicos` | Especias y salsas: tengo / poco / no |
| `shopping` | Lista de la compra manual |
| `plans` | Planes mensuales: comidas → bloques fijos + opciones → alimentos o listas con gramos |
| `logs` | Diario: alimento, gramos pesados, gramos en crudo, copia de los nutrientes, lo descontado de la despensa |
| `weights` | Peso diario |

## Fases

**Fase 1 (hecha):** plan cargado, registro en cocido con descuento de despensa, biblioteca (código de barras, Live Text o a mano), despensa con caducidades y mínimos, básicos, lista de la compra, comidas fuera del plan (aproximadas o precisas), peso, avisos y sugerencia de la próxima comida, copia de seguridad.

**Fase 2:**
- Sincronización con Supabase, gratis: copia en la nube y preparada para compartir el "hogar".
- Notificaciones push: falta algo, caduca algo, "hoy podrías cocinar…".
- Compra semanal calculada desde el plan (lo que pide el plan menos lo que hay en stock).
- Recetario adaptado al plan y sin comida del mar.

**Fase 3:**
- Whoop: recuperación, strain, sueño y gasto. Se reutiliza `whoop_app/`.
- Correlaciones entre lo que comes y la recuperación del día siguiente.
- Micronutrientes completos (USDA/BEDCA).

**Fase 4:**
- Informe para el nutricionista en PDF y Excel: adherencia, macros por comida, evolución del peso y datos de Whoop cruzados.
