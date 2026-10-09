// Punto de entrada: carga datos base y dibuja la app con la barra de pestañas.
import { html, render, useState, useEffect } from './lib.js';
import { seed } from './db.js';
import { copiaDiaria } from './copias.js';
import { Icon } from './ui.js';
import { Hoy } from './views/hoy.js';
import { Despensa } from './views/despensa.js';
import { Biblioteca } from './views/biblioteca.js';
import { Plan } from './views/plan.js';
import { Mas } from './views/mas.js';
import { Progreso } from './views/progreso.js';
import { Perfil } from './views/perfil.js';
import { Entreno } from './views/entreno.js';
import { Guia } from './views/guia.js';
import { Ideas } from './views/ideas.js';
import { Informes } from './views/informes.js';

// "oculta": se abre desde otra pantalla (el plan, desde Más)
const TABS = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', View: Hoy },
  { id: 'entreno', label: 'Entreno', icon: 'pesa', View: Entreno },
  { id: 'despensa', label: 'Despensa', icon: 'despensa', View: Despensa },
  { id: 'progreso', label: 'Progreso', icon: 'chart', View: Progreso },
  { id: 'mas', label: 'Más', icon: 'mas', View: Mas },
  { id: 'biblioteca', label: 'Productos', icon: 'biblio', View: Biblioteca, oculta: true, padre: 'despensa' },
  { id: 'plan', label: 'Plan', icon: 'plan', View: Plan, oculta: true, padre: 'mas' },
  { id: 'perfil', label: 'Perfil', icon: 'mas', View: Perfil, oculta: true, padre: 'mas' },
  { id: 'guia', label: 'Guía', icon: 'mas', View: Guia, oculta: true, padre: 'mas' },
  { id: 'ideas', label: 'Ideas', icon: 'hoy', View: Ideas, oculta: true, padre: 'hoy' },
  { id: 'informes', label: 'Informes', icon: 'plan', View: Informes, oculta: true, padre: 'mas' },
  { id: 'ejercicios', label: 'Ejercicios', icon: 'pesa', View: p => html`<${Entreno} ...${p} inicial="ejercicios" />`, oculta: true, padre: 'entreno' },
];

function App() {
  const [tab, setTab] = useState(location.hash.slice(1) || 'hoy');
  useEffect(() => {
    const onHash = () => setTab(location.hash.slice(1) || 'hoy');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = id => { location.hash = id; window.scrollTo(0, 0); };
  const actual = TABS.find(t => t.id === tab) || TABS[0];
  const { View } = actual;

  return html`
    <main><${View} go=${go} /></main>
    <nav class="tabbar">
      ${TABS.filter(t => !t.oculta).map(t => html`
        <button class=${t.id === (actual.padre || actual.id) ? 'on' : ''} onClick=${() => go(t.id)}>
          <${Icon} name=${t.icon} /><span>${t.label}</span>
        </button>`)}
    </nav>`;
}

seed()
  .then(() => {
    // Quitamos el "Cargando…" inicial: si no, se queda pegado al final de cada pantalla
    const raiz = document.getElementById('app');
    raiz.textContent = '';
    render(html`<${App} />`, raiz);
    window.__arrancada = true;
    copiaDiaria(); // copia interna automática, una al día
  })
  .catch(e => {
    document.getElementById('app').innerHTML = `<p class="error" style="padding:24px">Error al iniciar: ${e.message}</p>`;
    console.error(e);
  });

// iPhone: al cerrar el teclado, la barra de pestañas se quedaba flotando a media pantalla.
// Mientras escribes la escondemos, y al cerrar el teclado obligamos a iOS a recolocar todo.
const conTeclado = () => document.body.classList.toggle('teclado',
  !!window.visualViewport && window.visualViewport.height < window.innerHeight * 0.8 ||
  /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !/^(checkbox|radio|file|date|button)$/.test(document.activeElement.type));
document.addEventListener('focusin', conTeclado);
const alSalir = () => setTimeout(() => {
  conTeclado();
  if (!document.body.classList.contains('teclado')) window.scrollTo(window.scrollX, window.scrollY);
}, 120);
document.addEventListener('focusout', alSalir);
document.addEventListener('blur', alSalir, true);
window.visualViewport?.addEventListener('resize', conTeclado);
document.addEventListener('touchstart', () => document.body.classList.contains('teclado') && conTeclado(), { passive: true });

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  // updateViaCache: 'none' = comprobar siempre si hay versión nueva de la app
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
}
