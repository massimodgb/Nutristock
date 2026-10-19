// Meal prep (v3, Fase 2): cocinar hoy para varias comidas (la cena de hoy, la comida de mañana…).
//
// Tres estados de una comida del plan:
//   planificada = lo que pide el plan, aún sin nada · preparada = tiene porciones cocinadas esperando
//   · consumida = ya registrada (cuenta en tus calorías).
//
// Cómo funciona:
//   1. Cada ingrediente cocinado se convierte en un LOTE (un táper): lo crudo se descuenta de la despensa UNA vez.
//   2. Cada comida elegida recibe una PORCIÓN de ese lote (gramos cocinados, independientes en cada comida).
//      Las porciones NO cuentan como comido: se ven en el día que toca como "preparadas".
//   3. Al confirmar, la porción se convierte en un registro normal y se descuenta del lote (nunca de lo crudo).
//      Cancelarla deja esos gramos libres en el lote (o, si lo tiraste, como merma).
import { db, getSetting, setSetting, mermarLote, round1, stockDisponible, FaltaStock } from './db.js';
import { mealBlocks, blockFoods, nutrFor, sumN } from './nutri.js';
import { conMedida } from './precision.js';
import { crearLote } from './views/receta.js';
import { saveLog } from './views/hoy.js';

// Bloque del plan en el que encaja un alimento (o el lote de un alimento) dentro de una comida
export function bloqueDe(meal, optionId, food, plan, byId) {
  if (!meal || !food) return null;
  const blocks = mealBlocks(meal, optionId);
  const ids = new Set([food.id, food.genericId, food.equivale, byId?.[food.equivale]?.genericId].filter(Boolean));
  const b = blocks.find(x => blockFoods(x, plan).some(a => ids.has(a.id))) || blocks.find(x => x.grupo === food.group);
  return b?.id || null;
}

// Gramos (cocinados) que pide el plan para ese alimento en ese bloque, para proponerlos
export function gramosPlan(meal, optionId, blockId, food, plan, byId) {
  const b = mealBlocks(meal, optionId).find(x => x.id === blockId);
  if (!b) return null;
  const ids = new Set([food.id, food.genericId, food.equivale, byId?.[food.equivale]?.genericId].filter(Boolean));
  return blockFoods(b, plan).find(a => ids.has(a.id))?.g || null;
}

// Lo que aporta una porción (con los valores fijos de su lote)
export const nPorcion = (p, byId) => nutrFor(byId[p.foodId] || { n: {} }, p.g || 0);
export const totalPorciones = (ps, byId) => sumN(ps.map(p => nPorcion(p, byId)));

// Gramos de cada lote ya asignados a comidas (lo demás del táper está libre)
export function asignadoPorLote(porciones) {
  const out = {};
  for (const p of porciones) out[p.foodId] = round1((out[p.foodId] || 0) + (p.g || 0));
  return out;
}

// ---------- Reglas de cantidades (en los datos, no solo en la pantalla) ----------
// Lo que queda en un táper y lo que ya está reservado para otras comidas
export async function estadoLote(foodId, exceptoPorcion = null) {
  const total = await stockDisponible([foodId]);
  const asignado = round1((await db.porciones.where('foodId').equals(foodId).toArray())
    .filter(p => p.id !== exceptoPorcion).reduce((s, p) => s + (p.g || 0), 0));
  return { total, asignado, libre: round1(total - asignado) };
}
const TOL = 0.05; // margen por redondeos de 1 decimal
const comprobarG = g => { if (!(g > 0) || !Number.isFinite(g)) throw new Error('La cantidad tiene que ser mayor que 0'); };

// Guarda una preparación entera (todo o nada).
//   comidas: [{ date, mealId, optionId }]
//   items:   [{ food, modo, metodo, factor, crudoG, cocidoG, gramos: [g para cada comida] }]
//     modo 'lote'  = el ingrediente ya es un táper (no se crea nada ni se descuenta lo crudo)
//     modo 'tanda' = pesaste toda la tanda: crudoG → cocidoG (lo que no asignes queda libre en el táper)
//     modo 'factor'= sin pesar la tanda: cocinado = suma de lo asignado, crudo = cocinado ÷ factor
//     modo 'tal'   = no se cocina (yogur, pan…): crudo = cocinado = lo asignado
export async function guardarPreparado({ comidas, items, foods, plan, dias = 3 }) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const medidas = [];
  const creadas = [];
  const prepId = 'prep-' + Date.now().toString(36);
  await db.transaction('rw', db.foods, db.lots, db.porciones, async () => {
    for (const it of items) {
      const asignado = (it.gramos || []).reduce((s, g) => s + (g > 0 ? g : 0), 0);
      if (!asignado) continue;
      for (const g of it.gramos || []) if (g != null && g !== 0 && !(g > 0)) comprobarG(g);
      let lote = it.food;
      // Del táper que ya tenías: solo lo que está libre (lo reservado para otras comidas no se puede volver a asignar)
      if (it.modo === 'lote') {
        const e = await estadoLote(it.food.id);
        if (asignado > e.libre + TOL) throw new Error(`${it.food.name}: en el táper quedan ${e.libre} g libres y has asignado ${round1(asignado)} g.`);
      }
      if (it.modo !== 'lote') {
        let crudoG, cocidoG;
        if (it.modo === 'tanda') { crudoG = it.crudoG; cocidoG = it.cocidoG; }
        else if (it.modo === 'factor' && it.factor) { cocidoG = asignado; crudoG = round1(asignado / it.factor); }
        else { cocidoG = asignado; crudoG = asignado; }
        if (!(crudoG > 0) || !(cocidoG > 0)) throw new Error(`Faltan los pesos de ${it.food.name}`);
        // No se puede repartir más cocinado del que salió de la tanda
        if (asignado > cocidoG + TOL) throw new Error(`${it.food.name}: la tanda pesa ${round1(cocidoG)} g cocinados y has repartido ${round1(asignado)} g.`);
        lote = await crearLote({ food: it.food, foods, crudoG, cocidoG, metodo: it.metodo || null, descontar: it.descontar !== false, dias });
        byId[lote.id] = lote;
        if (it.modo === 'tanda' && it.metodo) medidas.push({ food: it.food, metodo: it.metodo, crudoG, cocidoG });
      }
      for (let i = 0; i < comidas.length; i++) {
        const g = it.gramos[i];
        if (!(g > 0)) continue;
        const c = comidas[i];
        const meal = plan?.comidas.find(m => m.id === c.mealId);
        const p = {
          date: c.date, mealId: c.mealId, optionId: c.optionId || null,
          blockId: meal ? bloqueDe(meal, c.optionId, lote, plan, byId) : null,
          foodId: lote.id, g: round1(g), prepId, creada: Date.now(),
        };
        p.id = await db.porciones.add(p);
        creadas.push(p);
      }
    }
  });
  // Lo medido al pesar la tanda queda guardado para ese producto
  if (medidas.length) {
    let c = await getSetting('coccion', {});
    for (const m of medidas) c = conMedida(c, m.food, m.metodo, m.crudoG, m.cocidoG);
    await setSetting('coccion', c);
  }
  return creadas;
}

// "Me lo comí": la porción pasa a ser un registro normal (descuenta del táper, no de lo crudo).
// Con g distinto de la porción = consumo parcial: lo que no comiste sigue libre en el táper.
export async function confirmarPorcion(p, { g = p.g, foods, restoTirado = false } = {}) {
  comprobarG(g);
  const lote = await db.foods.get(p.foodId);
  if (!lote) throw new Error('El táper de esta porción ya no existe');
  const lista = foods || await db.foods.toArray();
  await db.transaction('rw', db.lots, db.logs, db.porciones, async () => {
    const actual = await db.porciones.get(p.id);
    if (!actual) throw new Error('Esta porción ya se apuntó o se canceló');
    if (g > actual.g + TOL) throw new Error(`Preparaste ${actual.g} g: no puedes apuntar ${round1(g)} g. Si comiste más, cambia antes los gramos de la porción.`);
    const disponible = await stockDisponible([actual.foodId]);
    if (g > disponible + TOL) throw new FaltaStock(lote.name, g, disponible);
    await saveLog({
      date: actual.date, mealId: actual.mealId, optionId: actual.optionId, blockId: actual.blockId, food: lote, g, crudo: false,
      rawG: g, n: nutrFor(lote, g), deduct: true, exacto: true, foods: lista, extra: { prepId: actual.prepId || null },
    });
    // Comiste menos y tiraste el resto: ese resto es merma del táper (no comida)
    if (restoTirado && g < actual.g - TOL) await mermarDeLote(actual.foodId, actual.g - g, 'resto tirado');
    await db.porciones.delete(actual.id);
  });
}

// Tirar gramos de un táper: se apuntan como merma (no son comida)
export async function mermarDeLote(foodId, g, motivo = 'tirado') {
  await db.transaction('rw', db.lots, async () => {
    let falta = g;
    const lots = (await db.lots.where('foodId').equals(foodId).toArray()).filter(l => l.g > 0);
    for (const l of lots) {
      if (falta <= 0) break;
      const m = await mermarLote(l.id, falta, motivo);
      falta -= m?.g || 0;
    }
  });
}

// Cancelar una porción: los gramos vuelven a estar libres en el táper; si lo tiraste, se apuntan como merma
export async function cancelarPorcion(p, { tirado = false } = {}) {
  await db.transaction('rw', db.lots, db.porciones, async () => {
    const actual = await db.porciones.get(p.id);
    if (!actual) throw new Error('Esta porción ya se apuntó o se canceló');
    if (tirado) await mermarDeLote(actual.foodId, actual.g, 'porción tirada');
    await db.porciones.delete(actual.id);
  });
}

// Cambiar gramos, día o comida de una porción (el bloque se vuelve a calcular)
// Más gramos de los que había solo si están libres en el táper (lo reservado para otras comidas no cuenta)
export async function moverPorcion(p, { g, date, mealId, optionId }, plan, byId) {
  await db.transaction('rw', db.lots, db.porciones, async () => {
    const actual = await db.porciones.get(p.id);
    if (!actual) throw new Error('Esta porción ya se apuntó o se canceló');
    const nuevo = { g: g ?? actual.g, date: date || actual.date, mealId: mealId || actual.mealId, optionId: optionId !== undefined ? optionId : actual.optionId };
    comprobarG(nuevo.g);
    const e = await estadoLote(actual.foodId, actual.id);
    if (nuevo.g > e.libre + TOL) throw new Error(`En el táper quedan ${Math.max(0, e.libre)} g para esta porción (el resto está reservado o ya se comió).`);
    const meal = plan?.comidas.find(m => m.id === nuevo.mealId);
    nuevo.blockId = meal ? bloqueDe(meal, nuevo.optionId, byId?.[actual.foodId], plan, byId) : null;
    await db.porciones.update(actual.id, { ...nuevo, g: round1(nuevo.g) });
  });
}

// Opción elegida de una comida en un día (la que marcaste ese día o la primera)
export async function opcionDe(plan, mealId, date) {
  const elegidas = await getSetting('opciones:' + date, {});
  const meal = plan?.comidas.find(m => m.id === mealId);
  return elegidas[mealId] || meal?.opciones?.[0]?.id || null;
}
