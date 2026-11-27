// Fond d'écran : image ou vidéo (lecture auto, en boucle, sans le son), plus un voile
// qui l'assombrit. Le fichier est gardé sur cet appareil (IndexedDB), le voile dans les préférences.
import { getFond } from './db.js';
import { getPrefs } from './ui.js';

export const VOILE_DEFAUT = 0.35;
let urlActuelle = null;

function conteneur() {
  let el = document.getElementById('fond');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fond';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="fond-media"></div><div class="fond-voile"></div>';
    document.body.prepend(el);
  }
  return el;
}

export function appliquerVoile() {
  const voile = document.querySelector('#fond .fond-voile');
  if (voile) voile.style.opacity = String(getPrefs().voile ?? VOILE_DEFAUT);
}

export async function appliquerFond() {
  const fond = await getFond().catch(() => null);
  const root = document.documentElement;
  if (urlActuelle) URL.revokeObjectURL(urlActuelle);
  urlActuelle = null;
  if (!fond?.blob) {
    root.classList.remove('avec-fond');
    document.getElementById('fond')?.remove();
    return;
  }
  const el = conteneur();
  const place = el.querySelector('.fond-media');
  urlActuelle = URL.createObjectURL(fond.blob);
  if (fond.blob.type.startsWith('video/')) {
    const v = document.createElement('video');
    Object.assign(v, { autoplay: true, loop: true, muted: true, defaultMuted: true, playsInline: true });
    v.setAttribute('muted', '');
    v.src = urlActuelle;
    place.replaceChildren(v);
    v.play().catch(() => {});
  } else {
    const img = document.createElement('img');
    img.alt = '';
    img.src = urlActuelle;
    place.replaceChildren(img);
  }
  appliquerVoile();
  root.classList.add('avec-fond');
}
