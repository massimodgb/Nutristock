// Nube (Supabase): guarda una copia de TODO en internet y la mantiene al día sola.
//
// Cómo funciona, en simple:
// - El iPhone sigue siendo lo principal: la app funciona igual sin conexión.
// - Cuando cambias algo, a los pocos segundos se sube a la nube lo que ha cambiado.
// - En la nube hay una sola tabla, "registros": una fila por cada cosa (un registro de comida, un envase, un peso…).
// - Al borrar algo, en la nube NO se borra: se marca como "borrado" (así siempre se puede recuperar).
// - En un móvil nuevo, al entrar con tu cuenta, se descarga todo.
// - Seguridad: si de golpe "desaparecen" muchas cosas (por ejemplo, iOS borró los datos), NO se borran en la nube:
//   al contrario, se vuelven a bajar al iPhone.
//
// Seguridad (desde v31, tras la revisión de Codex):
// - Primera vez en un aparato con datos en la nube Y en el aparato: NO se pisa nada; se pregunta qué conservar.
// - Si desaparecen de golpe datos importantes de una tabla (planes, pesos, entrenos…), no se borran en la nube:
//   se pregunta "recuperar" o "lo borré yo".
// - Los registros nuevos usan números únicos (db.js → nuevoId), así no chocan entre aparatos.
//   Aun así, la forma recomendada de uso sigue siendo UN móvil a la vez.
import { Dexie } from './lib.js';
import { db } from './db.js';

export const NUBE_URL = 'https://bublielinhboyngelmwg.supabase.co';
// Clave PÚBLICA (está pensada para ir dentro de la app). Los datos los protege la seguridad por filas de Supabase.
export const NUBE_CLAVE = 'sb_publishable_q1agUK4AXhIrUqM6ZdEZTw_zMRmfm-G';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const TABLAS = ['foods', 'lots', 'basicos', 'shopping', 'plans', 'logs', 'weights', 'settings', 'workouts', 'marcas', 'ejercicios', 'whoop'];
const LOTE = 500;
// Cuánto tiene que desaparecer de cada tabla para preguntarte antes de borrarlo en la nube.
// min = filas perdidas a partir de las que se pregunta (y además ≥ 30 % de la tabla). soloVacia = solo si se vacía entera.
export const PROTECCION = {
  plans: { min: 1 }, weights: { min: 3 }, workouts: { min: 2 }, marcas: { min: 3 }, foods: { min: 3 },
  ejercicios: { min: 3 }, logs: { min: 10, vacia: 5 }, lots: { soloVacia: true, vacia: 3 }, basicos: { soloVacia: true, vacia: 5 }, whoop: { min: 20 },
};
// (shopping y settings cambian a menudo a propósito: no se vigilan)

// Pura: ¿qué tablas han perdido demasiado? antes/ahora = listas de ids "tabla|clave"
export function detectarPerdidas(antes, ahora) {
  const cuenta = ids => { const c = {}; for (const id of ids) { const t = id.split('|')[0]; c[t] = (c[t] || 0) + 1; } return c; };
  const a = cuenta(antes), h = cuenta(ahora);
  const out = [];
  for (const [tabla, cfg] of Object.entries(PROTECCION)) {
    const n0 = a[tabla] || 0, n1 = h[tabla] || 0, perdidas = n0 - n1;
    if (perdidas <= 0) continue;
    const vaciada = n1 === 0 && n0 >= (cfg.vacia || cfg.min || 1);
    const mucho = !cfg.soloVacia && perdidas >= cfg.min && perdidas >= n0 * 0.3;
    if (vaciada || mucho) out.push({ tabla, antes: n0, ahora: n1 });
  }
  return out;
}

// Pura: filas "tuyas" (no lo que trae la app de fábrica) para saber si este aparato ya tiene datos propios
export function filasPropias(ids) {
  return ids.filter(id => !/^(basicos|settings)\|/.test(id)).length;
}

// Memoria local de la sincronización (base aparte: no se sube a la nube)
const memo = new Dexie('nutristock-nube');
memo.version(1).stores({ huellas: 'id', meta: 'k' });

// ---------- utilidades ----------
// Texto estable de un objeto (mismas claves en el mismo orden), para saber si algo cambió
export function estable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
}
export function huella(v) {
  const s = estable(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return h.toString(36) + ':' + s.length;
}
const clavePrimaria = t => db[t].schema.primKey.keyPath;
// Los alimentos base que no has tocado vienen con la app: no hace falta subirlos
const subible = (t, fila) => !(t === 'foods' && fila.source === 'base' && !fila.edited);

// ---------- estado (para la pantalla) ----------
const oyentes = new Set();
let estado = { conectado: false, email: null, ocupado: false, ultima: null, error: null, aviso: null, conflicto: null, perdida: null };
const cambiar = cambios => { estado = { ...estado, ...cambios }; oyentes.forEach(f => f(estado)); };
export const estadoNube = () => estado;
export const escucharNube = f => { oyentes.add(f); return () => oyentes.delete(f); };

// ---------- conexión con Supabase (se carga solo si la usas) ----------
let cliente = null;
async function sb() {
  if (!cliente) {
    const { createClient } = await import(LIB);
    cliente = createClient(NUBE_URL, NUBE_CLAVE, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nutristock-nube' } });
  }
  return cliente;
}
const haySesionGuardada = () => { try { return !!localStorage.getItem('nutristock-nube'); } catch { return false; } };

// Lo que el motor necesita de la nube (separado para poder probarlo sin internet)
function transporteSupabase(c, userId) {
  return {
    async subir(filas) {
      for (let i = 0; i < filas.length; i += LOTE) {
        const { error } = await c.from('registros')
          .upsert(filas.slice(i, i + LOTE).map(f => ({ ...f, user_id: userId, borrado: false })), { onConflict: 'user_id,tabla,clave' });
        if (error) throw error;
      }
    },
    async marcarBorrados(tabla, claves) {
      for (let i = 0; i < claves.length; i += LOTE) {
        const { error } = await c.from('registros').update({ borrado: true }).eq('tabla', tabla).in('clave', claves.slice(i, i + LOTE));
        if (error) throw error;
      }
    },
    async bajar(desde) {
      const todas = [];
      for (let i = 0; ; i += 1000) {
        let q = c.from('registros').select('tabla,clave,datos,borrado,actualizado').order('actualizado').order('clave').range(i, i + 999);
        if (desde) q = q.gt('actualizado', desde);
        const { data, error } = await q;
        if (error) throw error;
        todas.push(...data);
        if (data.length < 1000) break;
      }
      return todas;
    },
  };
}

// ---------- el motor ----------
let aplicando = false; // mientras bajamos datos de la nube, no programamos otra subida

async function leerLocal() {
  const local = new Map();
  for (const tabla of TABLAS) {
    const kp = clavePrimaria(tabla);
    for (const fila of await db[tabla].toArray()) {
      if (!subible(tabla, fila)) continue;
      const clave = String(fila[kp]);
      local.set(tabla + '|' + clave, { tabla, clave, datos: fila, h: huella(fila) });
    }
  }
  return local;
}

export async function sincronizarCon(t, { permitirBorrado = false, primera = null, perdida = null } = {}) {
  // ---- Primera vez en este aparato ----
  if (!(await memo.meta.get('desde'))) {
    const nube = (await t.bajar(null)).filter(f => !f.borrado && f.datos && TABLAS.includes(f.tabla));
    const local = await leerLocal();
    const propiasAqui = filasPropias([...local.keys()]);
    const propiasNube = filasPropias(nube.map(f => f.tabla + '|' + f.clave));
    if (propiasNube > 0 && propiasAqui > 0 && !primera) {
      // Hay datos en los dos sitios: no tocamos nada hasta que elijas
      return { conflicto: { nube: resumenFilas(nube.map(f => f.tabla)), aqui: resumenFilas([...local.values()].map(f => f.tabla)) } };
    }
    if (primera === 'nube' || primera === 'movil') {
      const { copiaInterna } = await import('./copias.js');
      await copiaInterna(primera === 'nube' ? 'antes de usar los datos de la nube' : 'antes de subir este móvil a la nube');
    }
    if (primera === 'movil') {
      // Manda este móvil: lo de la nube que no está aquí se marca como borrado (sigue recuperable) y se sube todo
      const porTabla = {};
      for (const f of nube) if (!local.has(f.tabla + '|' + f.clave)) (porTabla[f.tabla] ||= []).push(f.clave);
      for (const [tabla, claves] of Object.entries(porTabla)) await t.marcarBorrados(tabla, claves);
      await memo.meta.put({ k: 'desde', v: '1970-01-01T00:00:00Z' });
    } else {
      // Manda la nube (o no había conflicto): se usa lo de la nube
      if (primera === 'nube') {
        aplicando = true;
        try { await db.transaction('rw', TABLAS.map(x => db[x]), async () => { for (const x of TABLAS) await db[x].clear(); }); }
        finally { aplicando = false; }
      }
      await bajarYAplicar(t, null, await leerLocal(), null, nube);
    }
  }

  const huellas = new Map((await memo.huellas.toArray()).map(h => [h.id, h.h]));
  // 1) Lo que hay en el iPhone
  const local = await leerLocal();
  // 2) Qué ha cambiado y qué se ha borrado desde la última vez
  const cambios = [...local.values()].filter(f => huellas.get(f.tabla + '|' + f.clave) !== f.h);
  let borrados = [...huellas.keys()].filter(id => !local.has(id));
  let recuperar = null;
  const perdidas = permitirBorrado ? [] : detectarPerdidas([...huellas.keys()], [...local.keys()]);
  if (perdidas.length) {
    const tablas = new Set(perdidas.map(x => x.tabla));
    if (perdida === 'recuperar') recuperar = tablas;
    // Mientras no decidas (o si eliges recuperar), lo de esas tablas NO se borra en la nube
    if (perdida !== 'borrar') borrados = borrados.filter(id => !tablas.has(id.split('|')[0]));
  }
  // 3) Subir
  if (cambios.length) await t.subir(cambios.map(({ tabla, clave, datos }) => ({ tabla, clave, datos })));
  const porTabla = {};
  for (const id of borrados) { const [tabla, ...r] = id.split('|'); (porTabla[tabla] ||= []).push(r.join('|')); }
  for (const [tabla, claves] of Object.entries(porTabla)) await t.marcarBorrados(tabla, claves);
  await memo.transaction('rw', memo.huellas, async () => {
    await memo.huellas.bulkPut(cambios.map(f => ({ id: f.tabla + '|' + f.clave, h: f.h })));
    await memo.huellas.bulkDelete(borrados);
  });

  // 4) Bajar lo que haya cambiado en la nube (todo, si hay que recuperar)
  const desde = recuperar ? null : (await memo.meta.get('desde'))?.v || null;
  const bajados = await bajarYAplicar(t, desde, local, recuperar);
  const pendiente = perdidas.length && !perdida ? perdidas : null;
  return { subidos: cambios.length, borrados: borrados.length, bajados, recuperado: !!recuperar, perdida: pendiente };
}

const NOMBRES = { logs: 'registros de comida', lots: 'envases en la despensa', foods: 'productos', plans: 'planes', weights: 'pesos', workouts: 'entrenos', marcas: 'marcas', whoop: 'datos de Whoop', ejercicios: 'ejercicios', basicos: 'básicos', shopping: 'cosas de la lista', settings: 'ajustes' };
export const nombreTabla = t => NOMBRES[t] || t;
function resumenFilas(tablas) {
  const c = {};
  for (const t of tablas) if (t !== 'settings' && t !== 'basicos') c[t] = (c[t] || 0) + 1;
  return c;
}

// recuperar: conjunto de tablas en las que se vuelve a bajar lo que falte aquí. filas: si ya las tenemos, no se piden otra vez
async function bajarYAplicar(t, desde, local, recuperar, filasYa) {
  const filas = filasYa || await t.bajar(desde);
  let bajados = 0, ultimo = desde;
  aplicando = true;
  try {
    for (const f of filas) {
      if (!ultimo || f.actualizado > ultimo) ultimo = f.actualizado;
      if (!TABLAS.includes(f.tabla)) continue;
      if (recuperar && !recuperar.has(f.tabla)) continue;
      const id = f.tabla + '|' + f.clave;
      if (f.borrado) {
        // Borrado en otro aparato: solo lo quitamos si lo teníamos tal cual estaba sincronizado
        const loc = local.get(id);
        if (!recuperar && loc && (await memo.huellas.get(id))?.h === loc.h) {
          await db[f.tabla].delete(loc.datos[clavePrimaria(f.tabla)]);
          await memo.huellas.delete(id);
          bajados++;
        }
        continue;
      }
      if (!f.datos) continue;
      const h = huella(f.datos);
      const loc = local.get(id);
      if (loc && loc.h === h) { await memo.huellas.put({ id, h }); continue; }
      if (recuperar && loc) continue; // al recuperar, solo se trae lo que falta
      await db[f.tabla].put(f.datos);
      await memo.huellas.put({ id, h });
      bajados++;
    }
  } finally { aplicando = false; }
  // Aunque la nube esté vacía, queda apuntado que este aparato ya hizo su primera bajada
  if (!recuperar) await memo.meta.put({ k: 'desde', v: ultimo || '1970-01-01T00:00:00Z' });
  return bajados;
}

// ---------- uso normal ----------
let enMarcha = null, otraVez = false, temporizador = null;

let decision = { primera: null, perdida: null };
// Lo que eliges cuando la app pregunta (primera vez con datos en los dos sitios, o datos que faltan)
export async function decidirNube(cambios) {
  decision = { ...decision, ...cambios };
  if (cambios.perdida === 'borrar') permitirBorradoMasivo();
  cambiar({ conflicto: null, perdida: null });
  return sincronizar();
}

export async function sincronizar() {
  if (!estado.conectado) return null;
  if (enMarcha) { otraVez = true; return enMarcha; }
  let permitir = false;
  try { const p = +localStorage.getItem('nube-permitir-borrado'); permitir = p && Date.now() - p < 10 * 60e3; } catch {}
  cambiar({ ocupado: true, error: null });
  enMarcha = (async () => {
    try {
      const c = await sb();
      const { data } = await c.auth.getSession();
      if (!data.session) { cambiar({ conectado: false, email: null }); return null; }
      const r = await sincronizarCon(transporteSupabase(c, data.session.user.id), { permitirBorrado: permitir, ...decision });
      const usada = decision;
      decision = { primera: null, perdida: null };
      if (r.conflicto) { cambiar({ conflicto: r.conflicto }); return r; }
      try { localStorage.removeItem('nube-permitir-borrado'); } catch {}
      await memo.meta.put({ k: 'ultima', v: new Date().toISOString() });
      cambiar({ ultima: new Date().toISOString(), perdida: r.perdida || null,
        aviso: r.recuperado ? 'Se han recuperado desde la nube los datos que faltaban.' : usada.primera ? 'Listo: la nube y este móvil ya tienen los mismos datos.' : estado.aviso });
      return r;
    } catch (e) {
      console.error('Nube', e);
      cambiar({ error: navigator.onLine === false ? 'Sin conexión: se subirá cuando vuelva internet.' : (e.message || String(e)) });
      return null;
    } finally {
      cambiar({ ocupado: false });
      enMarcha = null;
      if (otraVez) { otraVez = false; programar(1000); }
    }
  })();
  return enMarcha;
}

export function programar(ms = 4000) {
  if (!estado.conectado || aplicando || estado.conflicto) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(sincronizar, ms);
}

// Antes de restaurar una copia: avisa de que los borrados que vengan son a propósito
export function permitirBorradoMasivo() {
  try { localStorage.setItem('nube-permitir-borrado', String(Date.now())); } catch {}
}

// Se llama al arrancar la app
export async function iniciarNube() {
  for (const t of TABLAS) {
    const avisar = () => { if (!aplicando) setTimeout(() => programar(), 0); };
    db[t].hook('creating', avisar);
    db[t].hook('updating', avisar);
    db[t].hook('deleting', avisar);
  }
  document.addEventListener('visibilitychange', () => {
    // Al salir de la app, subir ya; al volver, traer lo nuevo
    if (estado.conectado) sincronizar();
  });
  addEventListener('online', () => estado.conectado && sincronizar());
  const ultima = (await memo.meta.get('ultima'))?.v || null;
  cambiar({ ultima });
  if (!haySesionGuardada()) return;
  try {
    const c = await sb();
    const { data } = await c.auth.getSession();
    if (data.session) { cambiar({ conectado: true, email: data.session.user.email }); sincronizar(); }
  } catch (e) { console.error('Nube', e); }
}

// ---------- cuenta ----------
const traducir = m => /Invalid login credentials/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /Email not confirmed/i.test(m) ? 'Aún no has confirmado tu correo: abre el email de Supabase y toca el enlace.'
  : /already registered/i.test(m) ? 'Ese correo ya tiene cuenta: pulsa "Entrar".'
  : /Password should be at least/i.test(m) ? 'La contraseña tiene que tener al menos 6 caracteres.'
  : /rate limit/i.test(m) ? 'Demasiados intentos seguidos: espera unos minutos.'
  : m;

export async function crearCuenta(email, clave) {
  const c = await sb();
  const { data, error } = await c.auth.signUp({ email, password: clave, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(traducir(error.message));
  if (data.session) { cambiar({ conectado: true, email }); await sincronizar(); return 'dentro'; }
  return 'confirmar';
}

export async function entrar(email, clave) {
  const c = await sb();
  const { data, error } = await c.auth.signInWithPassword({ email, password: clave });
  if (error) throw new Error(traducir(error.message));
  cambiar({ conectado: true, email: data.user.email, aviso: null });
  return sincronizar();
}

export async function salir() {
  await sincronizar();
  const c = await sb();
  await c.auth.signOut();
  await memo.huellas.clear();
  await memo.meta.clear();
  cambiar({ conectado: false, email: null, ultima: null, aviso: null, conflicto: null, perdida: null });
}

// Llamar a una función del servidor (por ejemplo "whoop") con tu sesión
export async function llamarFuncion(nombre, body) {
  if (!estado.conectado) throw new Error('Entra primero con tu cuenta en Más → Nube.');
  const c = await sb();
  const { data, error } = await c.functions.invoke(nombre, { body });
  if (error) {
    let m = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) m = j.error; } catch {}
    if (/Failed to send|not found|404/i.test(m)) m = 'La función de Whoop aún no está instalada en Supabase.';
    throw new Error(m);
  }
  return data;
}
