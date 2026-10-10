// Compra calculada desde el plan: lo que pide tu plan para los próximos días MENOS lo que ya tienes en casa.
//
// Cómo decide qué vas a comer:
// - En las comidas con opciones (desayuno salado/dulce, cena 1/2/3) usa cuántas veces elegiste cada una
//   en las últimas 4 semanas. Sin historial, la primera opción.
// - En cada bloque usa lo que SUELES poner de verdad (por ejemplo, picada + ricotta), con los gramos que sueles registrar.
//   Sin historial: lo que tengas en casa de lo que permite el plan, o lo primero de la lista.
// - Las verduras, frutas y frutos secos sin historial salen como grupo ("Verduras de la lista verde"), porque da igual cuál.
// Todo en crudo / como se compra (240 g de pollo cocido = 320 g crudo).
import { blockFoods, visibleFood, mealBlocks, toRaw } from './nutri.js';
import { stockMap } from './db.js';

export const DIAS_HISTORIAL = 28;
const LISTAS_GRUPO = {
  verde: 'Verduras (lista verde)',
  naranja: 'Fruta (lista naranja)',
  amarilla: 'Frutos secos (lista amarilla)',
};

export function necesidadesPlan({ plan, foods, lots, logs = [], elecciones = [], prefs = {}, dias = 7 }) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const raiz = id => byId[id]?.genericId || id;
  const stock = stockMap(lots, foods);
  const tengo = id => stock[id]?.g || 0;
  const items = new Map(); // clave → { clave, nombre, group, foodId, lista, g }
  const sumar = (clave, datos, g) => {
    const it = items.get(clave) || { clave, g: 0, ...datos };
    it.g += g;
    items.set(clave, it);
  };

  for (const meal of plan.comidas || []) {
    // Reparto entre opciones según lo que sueles elegir
    let reparto = [[null, 1]];
    if (meal.opciones?.length) {
      const validas = new Set(meal.opciones.map(o => o.id));
      // Días en que comiste cada opción (por lo registrado; si no, por lo que marcaste en Hoy)
      const porDia = {};
      for (const e of elecciones) if (validas.has(e?.v?.[meal.id])) porDia[e.date] = e.v[meal.id];
      for (const l of logs) if (l.mealId === meal.id && validas.has(l.optionId)) porDia[l.date] = l.optionId;
      const cuenta = {};
      for (const id of Object.values(porDia)) cuenta[id] = (cuenta[id] || 0) + 1;
      const total = Object.values(cuenta).reduce((a, b) => a + b, 0);
      reparto = total ? Object.entries(cuenta).map(([id, n]) => [id, n / total]) : [[meal.opciones[0].id, 1]];
    }
    const comunes = new Set((meal.bloques || []).map(b => b.id));
    const hechos = new Set();
    for (const [optId, parte] of reparto) {
      for (const block of mealBlocks(meal, optId)) {
        // Los bloques comunes (sin opción) se cuentan una sola vez con todo el peso
        const comun = comunes.has(block.id);
        if (comun && hechos.has(block.id)) continue;
        if (comun) hechos.add(block.id);
        const peso = comun ? 1 : parte;
        const permitidos = blockFoods(block, plan).filter(x => visibleFood(byId[x.id], prefs));
        if (!permitidos.length) continue; // por ejemplo, el atún si excluyes lo del mar

        // ¿Qué sueles poner en este bloque?
        const hist = logs.filter(l => l.mealId === meal.id && l.blockId === block.id && (comun || l.optionId === optId) && l.foodId && byId[l.foodId] && visibleFood(byId[l.foodId], prefs));
        const fechas = new Set(hist.map(l => l.date));
        if (fechas.size) {
          const porRaiz = {};
          for (const l of hist) porRaiz[raiz(l.foodId)] = (porRaiz[raiz(l.foodId)] || 0) + (l.rawG || 0);
          for (const [id, g] of Object.entries(porRaiz)) {
            const f = byId[id];
            if (f) sumar('f:' + id, { nombre: f.name, group: f.group, foodId: id }, (g / fechas.size) * peso * dias);
          }
          continue;
        }
        // Sin historial
        const primero = block.alimentos?.[0];
        if (primero?.lista && LISTAS_GRUPO[primero.lista]) {
          const ids = (plan.listas?.[primero.lista] || []).filter(id => visibleFood(byId[id], prefs));
          sumar('l:' + primero.lista, { nombre: LISTAS_GRUPO[primero.lista], group: byId[ids[0]]?.group, lista: primero.lista, ids }, primero.g * peso * dias);
          continue;
        }
        const elegido = [...permitidos].sort((a, b) => tengo(b.id) - tengo(a.id))[0];
        const f = byId[elegido.id];
        sumar('f:' + elegido.id, { nombre: f.name, group: f.group, foodId: elegido.id }, toRaw(f, elegido.g, false, byId) * peso * dias);
      }
    }
  }

  // Comparar con lo que hay en casa
  return [...items.values()].map(it => {
    const hay = it.lista ? it.ids.reduce((s, id) => s + tengo(id), 0) : tengo(it.foodId);
    const falta = Math.max(0, it.g - hay);
    // Envase con el que lo sueles comprar (un producto tuyo que cuenta como este alimento)
    const producto = it.foodId && [it.foodId, ...foods.filter(f => f.genericId === it.foodId).map(f => f.id)]
      .map(id => byId[id]).filter(f => f?.packG).sort((a, b) => (b.source !== 'base') - (a.source !== 'base'))[0];
    const envases = producto && falta > 0 ? Math.ceil(falta / producto.packG) : 0;
    return { ...it, necesita: it.g, hay, falta, producto, envases, food: it.foodId ? byId[it.foodId] : null };
  }).sort((a, b) => (b.falta > 0) - (a.falta > 0) || b.falta - a.falta);
}
