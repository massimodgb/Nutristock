// "Más": peso corporal, preferencias y copias de seguridad.
import { html, useState, useEffect } from '../lib.js';
import { db, useLive, getPrefs, setSetting, exportAll, importAll } from '../db.js';
import { fmt, todayStr, fmtDate, addDays } from '../nutri.js';
import { Num, Toggle, Icon, toast } from '../ui.js';

export function Mas({ go }) {
  const weights = useLive(() => db.weights.orderBy('date').reverse().limit(60).toArray(), []);
  const prefs = useLive(getPrefs, []);
  const [peso, setPeso] = useState(null);
  const [persist, setPersist] = useState(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersist); }, []);

  if (!weights || !prefs) return html`<div class="loading">Cargando…</div>`;
  const setPref = (k, v) => setSetting('prefs', { ...prefs, [k]: v });

  // Media de 7 días: el peso diario oscila mucho (agua, sal, carbohidratos), la media no
  const media = date => {
    const desde = addDays(date, -6);
    const w = weights.filter(x => x.date >= desde && x.date <= date);
    return w.length ? w.reduce((s, x) => s + x.kg, 0) / w.length : null;
  };


  const exportar = async () => {
    const data = JSON.stringify(await exportAll());
    const name = `nutristock-${todayStr()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Copia NutriStock' }); return; } catch {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
  };

  return html`
    <div class="page">
      <header class="top"><h1>Más</h1></header>

      <section class="card list">
        <button class="row" onClick=${() => go('plan')}>
          <${Icon} name="plan" /><span class="grow">Mi plan de alimentación</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('perfil')}>
          <${Icon} name="chart" /><span class="grow">Perfil y objetivo</span><${Icon} name="right" size=${18} />
        </button>
        <button class="row" onClick=${() => go('biblioteca')}>
          <${Icon} name="biblio" /><span class="grow">Biblioteca de productos</span><${Icon} name="right" size=${18} />
        </button>
      </section>

      <section class="card">
        <h3>Peso corporal</h3>
        <div class="inline">
          <${Num} value=${peso} onChange=${setPeso} suffix="kg" placeholder="Peso de hoy" />
          <button class="btn small" disabled=${!peso} onClick=${async () => {
            await db.weights.put({ date: todayStr(), kg: peso });
            setPeso(null); toast('Peso guardado ✓');
          }}>Guardar</button>
        </div>
        <p class="muted small">Pésate en ayunas, después del baño. Fíjate en la media de 7 días, no en el número de cada día.</p>
        <table class="ntable">
          ${weights.slice(0, 14).map(w => html`
            <tr><td>${fmtDate(w.date)}</td><td>${fmt(w.kg, 1)} kg</td><td class="muted">media ${fmt(media(w.date), 1)}</td>
              <td><button class="icon-btn" aria-label="Borrar" onClick=${() => db.weights.delete(w.date)}><${Icon} name="trash" size=${14} /></button></td></tr>`)}
        </table>
      </section>

      <section class="card form">
        <h3>Preferencias</h3>
        <${Toggle} label="Excluir comida del mar" checked=${prefs.excluirMar} onChange=${v => setPref('excluirMar', v)}
          hint="Oculta pescado y marisco del plan, sugerencias y búsquedas" />
        <label>Avisar caducidad con
          <${Num} value=${prefs.avisoCaducaDias} onChange=${v => v != null && setPref('avisoCaducaDias', v)} suffix="días" />
        </label>
        <div class="grid2">
          <label>Agua al día<${Num} value=${prefs.aguaObjetivo} onChange=${v => v && setPref('aguaObjetivo', v)} suffix="ml" /></label>
          <label>Tamaño del vaso<${Num} value=${prefs.aguaVaso} onChange=${v => v && setPref('aguaVaso', v)} suffix="ml" /></label>
        </div>
      </section>

      <section class="card">
        <h3>Tus datos</h3>
        <p class="muted small">Ahora mismo todo se guarda en este iPhone${persist ? ' (protegido contra borrado ✓)' : ''}.
          Haz una copia de vez en cuando y guárdala en OneDrive o Archivos.</p>
        <button class="btn" onClick=${exportar}>Exportar copia de seguridad</button>
        <label class="btn secondary">
          Restaurar copia
          <input type="file" accept=".json,application/json" hidden onChange=${async e => {
            const f = e.target.files[0];
            if (!f || !confirm('Esto reemplaza TODOS los datos actuales por los de la copia. ¿Seguir?')) return;
            try { await importAll(JSON.parse(await f.text())); toast('Copia restaurada ✓'); }
            catch (err) { alert(err.message); }
          }} />
        </label>
      </section>

      <p class="muted small center">NutriStock · Fase 1</p>
    </div>`;
}
