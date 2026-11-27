// Grands écrans : chaque panneau (la page crème, et le livre ouvert sous la liste de l'accueil)
// peut être déplacé avec la poignée du haut, et agrandi ou réduit en tirant son bord droit, son
// bord bas ou son coin. Position et taille sont gardées dans les préférences de cet appareil :
// une pour les pages, une pour le livre ouvert. Double-clic sur la poignée : retour au centre.
// Les poignées sont dans un calque à part, recalé sur le panneau : elles ne défilent pas avec son contenu.
import { getPrefs, setPrefs } from './ui.js';

const GRAND = window.matchMedia('(min-width: 820px)');
const LARG_MIN = 420;
const HAUT_MIN = 320;
let view;
/** Panneau suivi → son calque de poignées. */
const calques = new Map();
const suivi = new ResizeObserver(() => recalerTout());

/** Le livre ouvert sous la liste a ses propres réglages ; toutes les autres pages partagent les leurs. */
const cle = (page) => (page.classList.contains('chapitre') ? 'livre' : 'page');

function tousReglages() {
  const r = getPrefs().pageAjust;
  // Ancien format (un seul réglage pour la page) : il devient celui des pages.
  return r && !r.page && !r.livre && 'dx' in r ? { page: r } : r || {};
}

function lire(k) {
  return { dx: 0, dy: 0, larg: null, haut: null, ...(tousReglages()[k] || {}) };
}

function garder(k, p) {
  const { largActuelle, hautActuelle, ...garde } = p;
  setPrefs({ pageAjust: { ...tousReglages(), [k]: garde } });
}

function appliquer(page, p = lire(cle(page))) {
  const s = page.style;
  s.setProperty('--page-dx', `${p.dx}px`);
  s.setProperty('--page-dy', `${p.dy}px`);
  if (p.larg) s.setProperty('--page-larg', `${p.larg}px`);
  else s.removeProperty('--page-larg');
  if (p.haut) s.setProperty('--page-haut', `${p.haut}px`);
  else s.removeProperty('--page-haut');
  page.classList.toggle('page-hauteur-fixe', !!p.haut);
  recalerTout();
}

/** Place chaque calque de poignées exactement sur son panneau. */
function recalerTout() {
  for (const [page, calque] of calques) {
    if (!page.isConnected || !GRAND.matches) {
      calque.hidden = true;
      continue;
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
}

/** Tous les panneaux reviennent au centre, à leur taille d'origine. */
export function reinitialiserPage() {
  setPrefs({ pageAjust: null });
  for (const page of calques.keys()) appliquer(page);
}

function reinitialiserUne(page) {
  const k = cle(page);
  const r = { ...tousReglages() };
  delete r[k];
  setPrefs({ pageAjust: r });
  appliquer(page);
}

const borne = (v, min, max) => Math.max(min, Math.min(max, v));

/** Glisser depuis une poignée : `faire(depart, ecartX, ecartY)` renvoie la nouvelle position/taille. */
function glisser(poignee, page, faire) {
  poignee.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const k = cle(page);
    const depart = { ...lire(k), largActuelle: page.offsetWidth, hautActuelle: page.offsetHeight };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let p = depart;
    poignee.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('page-en-cours');
    const bouge = (ev) => {
      p = faire(depart, ev.clientX - x0, ev.clientY - y0);
      appliquer(page, p);
    };
    const fin = () => {
      poignee.removeEventListener('pointermove', bouge);
      document.documentElement.classList.remove('page-en-cours');
      garder(k, p);
    };
    poignee.addEventListener('pointermove', bouge);
    poignee.addEventListener('pointerup', fin, { once: true });
    poignee.addEventListener('pointercancel', fin, { once: true });
  });
}

function creerCalque(page) {
  const calque = document.createElement('div');
  calque.className = 'page-calque';
  calque.hidden = true;
  calque.innerHTML = `
    <div class="page-poignee" title="Glisser pour déplacer (double-clic : remettre au centre)"></div>
    <div class="page-bord page-bord-droit" title="Tirer pour changer la largeur"></div>
    <div class="page-bord page-bord-bas" title="Tirer pour changer la hauteur"></div>
    <div class="page-bord page-coin" title="Tirer pour changer la taille"></div>`;
  document.body.append(calque);
  const [deplacer, droite, bas, coin] = calque.children;

  deplacer.addEventListener('dblclick', () => reinitialiserUne(page));
  glisser(deplacer, page, (d, x, y) => ({ ...d, dx: d.dx + x, dy: d.dy + y }));
  // Le bord gauche reste en place : la largeur prend l'écart, le centre ne bouge que de moitié.
  const largeur = (d, x) => {
    const larg = borne(d.largActuelle + x, LARG_MIN, window.innerWidth - 24);
    return { larg, dx: d.dx + (larg - d.largActuelle) / 2 };
  };
  const hauteur = (d, y) => ({ haut: Math.max(HAUT_MIN, d.hautActuelle + y) });
  glisser(droite, page, (d, x) => ({ ...d, ...largeur(d, x) }));
  glisser(bas, page, (d, x, y) => ({ ...d, ...hauteur(d, y) }));
  glisser(coin, page, (d, x, y) => ({ ...d, ...largeur(d, x), ...hauteur(d, y) }));
  return calque;
}

/** Les panneaux affichés : la page, et le livre ouvert sous la liste (pas ce qui est dans une fenêtre). */
function suivrePages() {
  const pages = new Set([...view.querySelectorAll('.page')].filter((p) => !p.closest('dialog')));
  for (const [page, calque] of calques) {
    if (!pages.has(page)) {
      suivi.unobserve(page);
      calque.remove();
      calques.delete(page);
    }
  }
  for (const page of pages) {
    if (calques.has(page)) continue;
    calques.set(page, creerCalque(page));
    suivi.observe(page);
    appliquer(page);
  }
  recalerTout();
}

export function activerAjustementPage(conteneur) {
  view = conteneur;
  new MutationObserver(suivrePages).observe(view, { childList: true, subtree: true });
  window.addEventListener('resize', recalerTout);
  GRAND.addEventListener('change', recalerTout);
  suivrePages();
}
