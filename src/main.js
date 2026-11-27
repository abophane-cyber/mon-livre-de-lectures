import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { applyTheme, appliquerTaille, icons } from './ui.js';
import { renderLivre } from './views/livre.js';
import { renderAtelier } from './views/atelier.js';
import { renderChoixLivre } from './views/choixlivre.js';
import { renderModifier } from './views/modifier.js';
import { renderGeneral } from './views/general.js';
import { receiveFile, renderSauvegarde } from './views/sauvegarde.js';
import { renderPdf } from './views/pdfview.js';
import { renderReglages } from './views/reglages.js';
import { startAutoBackup } from './autobackup.js';
import { appliquerFond } from './fond.js';
import { activerAjustementPage } from './pageajust.js';
import { isAndroidApp } from './native.js';
import { verifierMiseAJour } from './maj.js';

// Chaque fonction a sa couleur (voir style.css, --c-livre, --c-nouveau…).
const NAV = [
  ['#/', 'Mon livre', icons.book, 'livre'],
  ['#/nouveau', 'Nouveau livre', icons.bookPlus, 'nouveau'],
  ['#/fiche', 'Nouvelle fiche', icons.plus, 'fiche'],
  ['#/sauvegarde', 'Sauvegarde', icons.sync, 'sauvegarde'],
  ['#/pdf', 'PDF', icons.pdf, 'pdf'],
  ['#/reglages', 'Réglages', icons.gear, 'reglages'],
];

document.getElementById('app').innerHTML = `
  <header class="entete">
    <a href="#/" class="marque">Mon livre <em>de lectures</em></a>
    <nav class="nav-haut" aria-label="Navigation">${NAV.map(([h, l, , c]) => `<a href="${h}" data-couleur="${c}">${l}</a>`).join('')}</nav>
  </header>
  <main id="view" tabindex="-1"></main>
  <nav class="nav-bas" aria-label="Navigation">${NAV.map(([h, l, i, c]) => `<a href="${h}" data-couleur="${c}">${i}<span>${l}</span></a>`).join('')}</nav>`;

const view = document.getElementById('view');
activerAjustementPage(view);

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
  // La couleur de la page suit la fonction ouverte (« Modifier » et « Compléter » ont la leur).
  document.body.dataset.couleur = name === 'livre' ? 'fiche' : name === 'modifier' ? 'modifier'
    : name === 'general' ? 'general' : NAV.find(([h]) => h === `#/${active}`)?.[3] || 'livre';
  document.querySelectorAll('.nav-haut a, .nav-bas a').forEach((a) => {
    a.classList.toggle('actif', a.getAttribute('href') === `#/${active}`);
  });
  try {
    if (name === 'nouveau') await renderAtelier(view, { livreSeul: true });
    else if (name === 'fiche') await renderChoixLivre(view, { id, ...params });
    else if (name === 'livre' && id) await renderAtelier(view, { id, f: params.f });
    else if (name === 'modifier' && id) await renderModifier(view, { id, f: params.f, notice: params.notice === '1' });
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
appliquerTaille();
appliquerFond();
route();
startAutoBackup();

// Appli Android : un fichier de sauvegarde ouvert avec l'appli (Mes fichiers, Quick Share, Partager)
// est lu tout de suite dans la page Sauvegarde.
function checkReceivedFile() {
  const raw = window.LecturesAndroid?.takeFile?.();
  if (!raw) return;
  try {
    const { name, text } = JSON.parse(raw);
    receiveFile(new File([text], name || 'sauvegarde.json', { type: 'application/json' }));
    if (location.hash === '#/sauvegarde') route();
    else location.hash = '#/sauvegarde';
  } catch (err) {
    console.error(err);
  }
}
checkReceivedFile();
window.addEventListener('fichier-recu', checkReceivedFile);

// Fonctionne hors connexion et se met à jour toute seule.
// (Inutile dans les versions installées .exe et .apk, qui contiennent déjà tout.)
if (import.meta.env.MODE !== 'native') registerSW({ immediate: true });

// Appli Android : propose la nouvelle version quand il y en a une (voir maj.js).
if (isAndroidApp) verifierMiseAJour().catch(() => {});
