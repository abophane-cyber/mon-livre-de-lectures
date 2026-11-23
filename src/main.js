import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { applyTheme, icons } from './ui.js';
import { renderLivre } from './views/livre.js';
import { renderAtelier } from './views/atelier.js';
import { renderModifier } from './views/modifier.js';
import { renderGeneral } from './views/general.js';
import { renderSauvegarde } from './views/sauvegarde.js';
import { renderPdf } from './views/pdfview.js';
import { renderReglages } from './views/reglages.js';

const NAV = [
  ['#/', 'Mon livre', icons.book],
  ['#/nouveau', 'Nouvelle', icons.plus],
  ['#/sauvegarde', 'Sauvegarde', icons.sync],
  ['#/pdf', 'PDF', icons.pdf],
  ['#/reglages', 'Réglages', icons.gear],
];

document.getElementById('app').innerHTML = `
  <header class="entete">
    <a href="#/" class="marque">Mon livre <em>de lectures</em></a>
    <nav class="nav-haut" aria-label="Navigation">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
  </header>
  <main id="view" tabindex="-1"></main>
  <nav class="nav-bas" aria-label="Navigation">${NAV.map(([h, l, i]) => `<a href="${h}">${i}<span>${l}</span></a>`).join('')}</nav>`;

const view = document.getElementById('view');

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', id: parts[1], params };
}

async function route() {
  const { name, id, params } = parseRoute();
  view.onclick = view.oninput = view.onchange = null;
  const active = name === 'livre' || name === 'modifier' || name === 'general' ? '' : name;
  document.querySelectorAll('.nav-haut a, .nav-bas a').forEach((a) => {
    a.classList.toggle('actif', a.getAttribute('href') === `#/${active}`);
  });
  try {
    if (name === 'nouveau') await renderAtelier(view, {});
    else if (name === 'livre' && id) await renderAtelier(view, { id, f: params.f });
    else if (name === 'modifier' && id) await renderModifier(view, { id, f: params.f });
    else if (name === 'general' && id) await renderGeneral(view, { id });
    else if (name === 'sauvegarde') await renderSauvegarde(view);
    else if (name === 'pdf') await renderPdf(view);
    else if (name === 'reglages') await renderReglages(view);
    else await renderLivre(view, params);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<section class="page"><h1>Oups</h1><p>Un problème est survenu. Rechargez la page.</p></section>`;
  }
  if (!params.ch && !params.fi) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
applyTheme();
route();

// Fonctionne hors connexion et se met à jour toute seule.
registerSW({ immediate: true });
