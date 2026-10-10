// NutriStock · Función "whoop" de Supabase (se pega en Supabase → Edge Functions → nombre: whoop).
// Hace de intermediario con Whoop, porque la clave secreta de Whoop NO puede ir dentro de la app.
//   - GET  (vuelta desde Whoop tras aceptar): cambia el código por las llaves y las guarda.
//   - POST { accion: 'iniciar' }      → devuelve la dirección de Whoop para conectar.
//   - POST { accion: 'estado' }       → ¿está conectado?
//   - POST { accion: 'datos', desde } → recuperación, ciclos (esfuerzo y calorías), sueño, entrenos y peso.
//   - POST { accion: 'desconectar' }  → borra las llaves.
// Secretos necesarios (Edge Functions → Secrets): WHOOP_CLIENT_ID y WHOOP_CLIENT_SECRET.
// Importante: en los ajustes de la función, desactivar "Verify JWT" (Whoop vuelve sin sesión; la sesión se comprueba aquí).
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const WHOOP = 'https://api.prod.whoop.com';
const APP = 'https://massimodgb.github.io/Nutristock/';
const SCOPES = 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const REDIRECT = `${SUPABASE_URL}/functions/v1/whoop`;
const CLIENT_ID = Deno.env.get('WHOOP_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET') || '';
// Llave del servidor: la nueva (SUPABASE_SECRET_KEYS, un diccionario) o la antigua (service_role)
function llaveServidor() {
  try {
    const d = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const k = d.default || Object.values(d)[0];
    if (k) return k as string;
  } catch { /* sin llaves nuevas */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const admin = createClient(SUPABASE_URL, llaveServidor(), { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const volver = (estado: string) => Response.redirect(`${APP}whoop.html?estado=${estado}`, 302);

async function pedirLlaves(params: Record<string, string>) {
  const r = await fetch(`${WHOOP}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  if (!r.ok) throw new Error(`Whoop no dio las llaves (${r.status}): ${await r.text()}`);
  return await r.json();
}

async function guardarLlaves(userId: string, t: any, anterior?: string) {
  const { error } = await admin.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: t.access_token,
    refresh_token: t.refresh_token || anterior,
    expires_at: new Date(Date.now() + (Number(t.expires_in || 3600) - 120) * 1000).toISOString(),
    scope: t.scope || SCOPES,
    actualizado: new Date().toISOString(),
  });
  if (error) throw error;
}

// Llave de acceso vigente (la renueva sola si caducó)
async function llave(userId: string) {
  const { data } = await admin.from('whoop_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() > Date.now()) return data.access_token as string;
  try {
    const t = await pedirLlaves({ grant_type: 'refresh_token', refresh_token: data.refresh_token, scope: 'offline' });
    await guardarLlaves(userId, t, data.refresh_token);
    return t.access_token as string;
  } catch (e) {
    // La llave ya no vale (por ejemplo, se quitó el permiso en Whoop): hay que volver a conectar
    await admin.from('whoop_tokens').delete().eq('user_id', userId);
    throw new Error('reconectar');
  }
}

async function todos(token: string, ruta: string, desde: string) {
  const out: unknown[] = [];
  let next = '';
  for (let pagina = 0; pagina < 40; pagina++) {
    const q = new URLSearchParams({ limit: '25', start: desde });
    if (next) q.set('nextToken', next);
    const r = await fetch(`${WHOOP}/developer${ruta}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) { await new Promise(res => setTimeout(res, 2000)); pagina--; continue; }
    if (!r.ok) throw new Error(`Whoop ${ruta}: ${r.status}`);
    const b = await r.json();
    out.push(...(b.records || []));
    next = b.next_token || '';
    if (!next) break;
  }
  return out;
}

async function uno(token: string, ruta: string) {
  const r = await fetch(`${WHOOP}/developer${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? await r.json() : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  // ---- Vuelta desde Whoop ----
  if (req.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    if (!code) return volver('cancelado');
    const { data: st } = await admin.from('whoop_estados').select('*').eq('state', state).maybeSingle();
    await admin.from('whoop_estados').delete().eq('state', state);
    if (!st || Date.now() - new Date(st.creado).getTime() > 15 * 60e3) return volver('caducado');
    try {
      const t = await pedirLlaves({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
      await guardarLlaves(st.user_id, t);
      return volver('ok');
    } catch (e) {
      console.error(e);
      return volver('error');
    }
  }

  // ---- Peticiones de la app (con tu sesión de NutriStock) ----
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Faltan los secretos WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET en Supabase.' }, 500);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const { data: u } = await admin.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: 'Entra primero con tu cuenta en Más → Nube.' }, 401);
  const { accion, desde } = await req.json().catch(() => ({}));

  try {
    if (accion === 'iniciar') {
      const state = crypto.randomUUID().replace(/-/g, '');
      await admin.from('whoop_estados').insert({ state, user_id: user.id });
      const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, scope: SCOPES, state });
      return json({ url: `${WHOOP}/oauth/oauth2/auth?${q}` });
    }
    if (accion === 'estado') {
      const { data } = await admin.from('whoop_tokens').select('user_id').eq('user_id', user.id).maybeSingle();
      return json({ conectado: !!data });
    }
    if (accion === 'desconectar') {
      await admin.from('whoop_tokens').delete().eq('user_id', user.id);
      return json({ ok: true });
    }
    if (accion === 'datos') {
      const token = await llave(user.id);
      if (!token) return json({ conectado: false });
      const inicio = desde || new Date(Date.now() - 30 * 864e5).toISOString();
      const [ciclos, recuperaciones, suenos, entrenos, cuerpo, perfil] = await Promise.all([
        todos(token, '/v2/cycle', inicio),
        todos(token, '/v2/recovery', inicio),
        todos(token, '/v2/activity/sleep', inicio),
        todos(token, '/v2/activity/workout', inicio),
        uno(token, '/v2/user/measurement/body'),
        uno(token, '/v2/user/profile/basic'),
      ]);
      return json({ conectado: true, ciclos, recuperaciones, suenos, entrenos, cuerpo, perfil });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    if ((e as Error).message === 'reconectar') return json({ conectado: false, reconectar: true });
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
