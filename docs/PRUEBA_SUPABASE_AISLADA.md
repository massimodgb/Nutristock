# Prueba de restaurar + sincronizar con un Supabase aislado (antes de publicar V3)

**Estado: PENDIENTE.** Esta prueba no se ha hecho. Las comprobaciones de `herramientas/comprobar.html` solo cubren
la parte del móvil (validación, guardado de una sola vez y el permiso de borrado de 10 minutos). Una simulación
local NO sustituye esta prueba. Es condición previa para publicar V3.

## Qué queremos saber

Tras restaurar una copia buena con la nube conectada:
1. Qué filas de la nube quedan marcadas como borradas, y que sean exactamente las que no están en la copia.
2. Qué filas se conservan.
3. Que no cambia nada de otro usuario.
4. Que no hay borrados de más.
5. Que la copia «antes de restaurar» devuelve los datos anteriores.
6. Qué pasa al sincronizar otra vez y si algo borrado reaparece.
7. Qué pasa si se corta la conexión durante la sincronización.
8. Que una copia dañada no cambia nada, ni en el móvil ni en la nube.

## Reglas de seguridad (comprobarlas antes de empezar)

- **Proyecto de Supabase NUEVO y solo para pruebas**: otra dirección `https://<otro-id>.supabase.co`, distinta de la de producción (`js/nube.js`, `NUBE_URL`). Sin datos reales.
- **Dos cuentas ficticias** (A y B), con correos de prueba. Nunca el correo ni la contraseña de la cuenta real.
- **Carpeta desechable**: copiar la carpeta del proyecto (rama `v3`) fuera del repositorio, por ejemplo a `C:\pruebas\nutristock-nube`. Cambiar `NUBE_URL` y `NUBE_CLAVE` SOLO en esa copia, con la clave **pública** (publishable) del proyecto de pruebas. El repositorio no se toca.
- **Otro origen en el navegador**: servir la copia con `py herramientas/servidor.py 5190` y, para el «segundo móvil», con `5191`. Cada puerto tiene su propio almacenamiento, separado del de la app real. **No usar el iPhone con la app real.**
- **Nunca** pegar la clave secreta (service_role) en la app ni en el chat.

Si alguna de estas condiciones no se cumple, no se hace la prueba.

## Preparación

1. En el proyecto de pruebas: SQL Editor → pegar `herramientas/supabase.sql` → Run. Authentication → Site URL: `http://127.0.0.1:5190`.
2. Crear las cuentas A y B desde la app de pruebas (Más → Nube → Crear cuenta) y confirmarlas.
3. Para mirar la nube, en el SQL Editor del proyecto de pruebas:
   ```sql
   select u.email, r.tabla, r.clave, r.borrado, r.actualizado
   from public.registros r join auth.users u on u.id = r.user_id
   order by u.email, r.tabla, r.clave;
   ```
   Guardar el resultado (copiar a un texto) después de cada paso: es la prueba de lo que pasó.

## Pasos

1. **B (puerto 5191)**: entrar con B, añadir 2 alimentos a la despensa y 1 registro de comida. Sincronizar. Anotar las filas de B.
2. **A (puerto 5190)**: entrar con A, añadir alimentos, envases, 3 registros de comida, 2 pesos y los 4 tipos de Whoop (con una copia de ejemplo que los traiga). Sincronizar.
3. **A**: Más → Tus datos → Exportar copia → guardarla como `copia-A1.json`.
4. **A**: añadir 2 registros de comida y 1 peso más (los que NO están en `copia-A1`). Sincronizar. Anotar las filas.
5. **A**: restaurar `copia-A1.json` (aceptar el aviso) y esperar a que sincronice (Más → Nube → «Sincronizar ahora»).
   - **Debe pasar**: los 3 datos añadidos en el paso 4 quedan con `borrado = true`. Todo lo demás de A sigue con `borrado = false`. **Las filas de B no cambian ni su `actualizado`**.
   - Si la app pregunta «Recuperarlos de la nube / Los borré yo a propósito», anotarlo (no debería salir en los 10 minutos tras restaurar) y elegir «Los borré yo a propósito».
6. **Volver atrás**: Más → Tus datos → copias automáticas → «antes de restaurar» → restaurar → sincronizar. **Debe pasar**: los 3 datos del paso 4 vuelven con `borrado = false` y no hay nada más borrado.
7. **Sincronizar dos veces más** sin cambiar nada. **Debe pasar**: la nube no cambia (mismos `borrado` y ninguna fila nueva).
8. **Copia dañada**: editar una copia de `copia-A1.json` con un editor de texto y poner `"d": {}` en una fila de Whoop. Restaurarla. **Debe pasar**: la app dice que la copia no se puede restaurar. No se crea ninguna copia «antes de restaurar» nueva. La nube no cambia.
9. **Corte de conexión**: en A, añadir 1 registro, abrir las herramientas del navegador (F12) → Network → Offline, pulsar «Sincronizar ahora», volver a Online y sincronizar. **Debe pasar**: el registro aparece una sola vez y no se marca nada como borrado.
10. **Segundo dispositivo de A**: entrar con A en el puerto 5191 (después de salir de B). En 5191 crear un registro **sin sincronizar**. En 5190 restaurar `copia-A1.json` y sincronizar. Después sincronizar 5191. Anotar qué versión gana y si reaparece algo que la restauración había borrado. (Riesgo conocido: la app está pensada para un móvil a la vez; esto documenta el comportamiento, no tiene que «pasar».)

## Resultado

- Pasos 5 a 9 correctos → se puede publicar (con el permiso de Massimo).
- Cualquier borrado de más, cualquier cambio en B o una copia dañada que cambie algo → **no publicar** y avisar a Claude/Codex con el resultado de la consulta SQL.
- Al terminar: borrar el proyecto de pruebas y la carpeta desechable.
