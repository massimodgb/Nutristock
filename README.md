# NutriStock

App personal para iPhone: calorías y macros según el plan de tu nutricionista, despensa con descuento automático y biblioteca de productos. Es una web instalable (PWA): no pasa por la App Store y funciona sin conexión.

Todo es gratis: Open Food Facts para los códigos de barras, Live Text del iPhone para las etiquetas y GitHub Pages para publicarla.

## Cómo funciona por dentro

| Archivo | Qué hace |
|---|---|
| `index.html` | La página que abre el iPhone |
| `js/app.js` | Arranca la app y dibuja la barra de pestañas |
| `js/db.js` | Base de datos en el teléfono (despensa, diario, plan…) |
| `js/nutri.js` | Cálculos: cocido → crudo, calorías, estimación del plan |
| `js/importar.js` | Open Food Facts, lector de etiquetas y escáner |
| `js/plan-pdf.js` | Lee el PDF del nutricionista y lo convierte en plan |
| `js/data/foods.js` | Alimentos base con valores por 100 g y factor de cocción |
| `js/views/*.js` | Cada pantalla: hoy, despensa, biblioteca, plan, más |
| `sw.js` | Permite abrirla sin conexión. **Cambia `VERSION` al publicar cambios** |
| `privado/` | Tu plan en `.json`. No se sube a internet |

### La regla del cocido

Tú pesas en **cocido**, pero las etiquetas dan los valores en **crudo**. Cada alimento tiene un `factor` (peso cocido ÷ peso crudo):

- Registras 240 g de pollo cocido. Con factor 0,75 son 320 g en crudo.
- Las calorías se calculan sobre esos 320 g.
- De la despensa se descuentan 320 g.

Puedes calibrar tu propio factor en Biblioteca → producto → "Calibrar".

## Probarla en el ordenador

```bash
py herramientas/servidor.py
```

Luego abre http://localhost:5180

## Plan nuevo cada mes

En el iPhone: Más → Mi plan → Nuevo plan → elige el **PDF** que te manda el nutricionista.

La app lo lee en el propio teléfono (`js/plan-pdf.js`) y te enseña una vista previa antes de guardarlo. Si el nutricionista cambia la plantilla y algo no se entiende bien, pásale el PDF a Claude: te dará un `.json`, que también se puede subir ahí.

Si aparece un alimento nuevo que no reconoce, se añade a la lista `ALIAS` de `js/plan-pdf.js`.
