// Punto de entrada: carga datos base y dibuja la app con la barra de pestañas.
import { html, render, useState, useEffect } from './lib.js';
import { seed } from './db.js';
import { Icon } from './ui.js';
import { Hoy } from './views/hoy.js';
import { Despensa } from './views/despensa.js';
import { Biblioteca } from './views/biblioteca.js';
import { Plan } from './views/plan.js';
import { Mas } from './views/mas.js';

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', View: Hoy },
  { id: 'despensa', label: 'Despensa', icon: 'despensa', View: Despensa },
  { id: 'biblioteca', label: 'Biblioteca', icon: 'biblio', View: Biblioteca },
  { id: 'plan', label: 'Plan', icon: 'plan', View: Plan },
  { id: 'mas', label: 'Más', icon: 'mas', View: Mas },
];

function App() {
  const [tab, setTab] = useState(location.hash.slice(1) || 'hoy');
  useEffect(() => {
    const onHash = () => setTab(location.hash.slice(1) || 'hoy');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = id => { location.hash = id; window.scrollTo(0, 0); };
  const { View } = TABS.find(t => t.id === tab) || TABS[0];

  return html`
    <main><${View} go=${go} /></main>
    <nav class="tabbar">
      ${TABS.map(t => html`
        <button class=${t.id === tab ? 'on' : ''} onClick=${() => go(t.id)}>
          <${Icon} name=${t.icon} /><span>${t.label}</span>
        </button>`)}
    </nav>`;
}

seed()
  .then(() => render(html`<${App} />`, document.getElementById('app')))
  .catch(e => {
    document.getElementById('app').innerHTML = `<p class="error" style="padding:24px">Error al iniciar: ${e.message}</p>`;
    console.error(e);
  });

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('./sw.js');
}
