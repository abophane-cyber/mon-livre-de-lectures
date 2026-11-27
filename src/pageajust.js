// Grands écrans : la page (le panneau crème) peut être déplacée avec la poignée du haut, et
// agrandie ou réduite en tirant son bord droit, son bord bas ou son coin. Position et taille
// sont gardées dans les préférences de cet appareil. Double-clic sur la poignée : retour au centre.
// Les poignées sont dans un calque à part, recalé sur la page : elles ne défilent pas avec son contenu.
import { getPrefs, setPrefs } from './ui.js';

const GRAND = window.matchMedia('(min-width: 820px)');
const LARG_MIN = 420;
const HAUT_MIN = 320;
let view;
let page = null;
let calque;
const suivi = new ResizeObserver(() => recaler());

function lire() {
  return { dx: 0, dy: 0, larg: null, haut: null, ...(getPrefs().pageAjust || {}) };
}

function appliquer(p = lire()) {
  const s = view.style;
  s.setProperty('--page-dx', `${p.dx}px`);
  s.setProperty('--page-dy', `${p.dy}px`);
  if (p.larg) s.setProperty('--page-larg', `${p.larg}px`);
  else s.removeProperty('--page-larg');
  if (p.haut) s.setProperty('--page-haut', `${p.haut}px`);
  else s.removeProperty('--page-haut');
  view.classList.toggle('page-hauteur-fixe', !!p.haut);
  recaler();
}

/** Place le calque des poignées exactement sur la page. */
function recaler() {
  if (!page || !page.isConnected || !GRAND.matches) {
    calque.hidden = true;
    return;
  }
  const r = page.getBoundingClientRect();
  calque.hidden = false;
  Object.assign(calque.style, {
    left: `${r.left + window.scrollX}px`,
    top: `${r.top + window.scrollY}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
}

export function reinitialiserPage() {
  setPrefs({ pageAjust: null });
  appliquer();
}

const borne = (v, min, max) => Math.max(min, Math.min(max, v));

/** Glisser depuis une poignée : `faire(depart, ecartX, ecartY)` renvoie la nouvelle position/taille. */
function glisser(poignee, faire) {
  poignee.addEventListener('pointerdown', (e) => {
    if (!page || e.button !== 0) return;
    e.preventDefault();
    const depart = { ...lire(), largActuelle: page.offsetWidth, hautActuelle: page.offsetHeight };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let p = depart;
    poignee.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('page-en-cours');
    const bouge = (ev) => {
      p = faire(depart, ev.clientX - x0, ev.clientY - y0);
      appliquer(p);
    };
    const fin = () => {
      poignee.removeEventListener('pointermove', bouge);
      document.documentElement.classList.remove('page-en-cours');
      const { largActuelle, hautActuelle, ...garde } = p;
      setPrefs({ pageAjust: garde });
    };
    poignee.addEventListener('pointermove', bouge);
    poignee.addEventListener('pointerup', fin, { once: true });
    poignee.addEventListener('pointercancel', fin, { once: true });
  });
}

function creerCalque() {
  calque = document.createElement('div');
  calque.className = 'page-calque';
  calque.hidden = true;
  calque.innerHTML = `
    <div class="page-poignee" title="Glisser pour déplacer la page (double-clic : remettre au centre)"></div>
    <div class="page-bord page-bord-droit" title="Tirer pour changer la largeur"></div>
    <div class="page-bord page-bord-bas" title="Tirer pour changer la hauteur"></div>
    <div class="page-bord page-coin" title="Tirer pour changer la taille"></div>`;
  document.body.append(calque);
  const [deplacer, droite, bas, coin] = calque.children;

  deplacer.addEventListener('dblclick', reinitialiserPage);
  glisser(deplacer, (d, x, y) => ({ ...d, dx: d.dx + x, dy: d.dy + y }));
  // Le bord gauche reste en place : la largeur prend l'écart, le centre ne bouge que de moitié.
  const largeur = (d, x) => {
    const larg = borne(d.largActuelle + x, LARG_MIN, window.innerWidth - 24);
    return { larg, dx: d.dx + (larg - d.largActuelle) / 2 };
  };
  const hauteur = (d, y) => ({ haut: Math.max(HAUT_MIN, d.hautActuelle + y) });
  glisser(droite, (d, x) => ({ ...d, ...largeur(d, x) }));
  glisser(bas, (d, x, y) => ({ ...d, ...hauteur(d, y) }));
  glisser(coin, (d, x, y) => ({ ...d, ...largeur(d, x), ...hauteur(d, y) }));
}

function suivrePage() {
  const nouvelle = view.querySelector(':scope > .page');
  if (nouvelle !== page) {
    if (page) suivi.unobserve(page);
    page = nouvelle;
    if (page) suivi.observe(page);
  }
  recaler();
}

export function activerAjustementPage(conteneur) {
  view = conteneur;
  creerCalque();
  appliquer();
  new MutationObserver(suivrePage).observe(view, { childList: true });
  window.addEventListener('resize', recaler);
  GRAND.addEventListener('change', recaler);
  suivrePage();
}
