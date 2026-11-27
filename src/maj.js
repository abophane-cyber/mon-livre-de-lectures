// Appli Android (.apk) : au démarrage, regarde sur le site publié s'il existe une version plus récente,
// et propose de la télécharger. L'installation reste faite par l'utilisateur (Android la demande),
// par-dessus l'ancienne : les livres et les fiches sont gardés.
// Rien n'est envoyé : c'est une simple lecture du fichier version-apk.json du site.

import { androidOpenUrl } from './native.js';
import { esc } from './util.js';

export const VERSION_INSTALLEE = __APK_VERSION__;
export const VERSION_NOM = __APK_VERSION_NAME__;
const ADRESSE = 'https://abophane-cyber.github.io/mon-livre-de-lectures/version-apk.json';
const CLE_PLUS_TARD = 'lectures-maj-plus-tard';

/** Renvoie la version publiée si elle est plus récente que celle installée, sinon null. */
export function versionPlusRecente(publiee, installee = VERSION_INSTALLEE) {
  if (!publiee || !Number.isInteger(publiee.versionCode) || typeof publiee.url !== 'string') return null;
  if (!/^https:\/\/github\.com\//.test(publiee.url)) return null;
  return publiee.versionCode > installee ? publiee : null;
}

/** Lit la version publiée (null si pas de connexion ou réponse inattendue). */
export async function lireVersionPubliee() {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), 8000);
  try {
    const rep = await fetch(`${ADRESSE}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    return rep.ok ? await rep.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

function afficherBandeau(maj) {
  document.getElementById('bandeau-maj')?.remove();
  const el = document.createElement('div');
  el.id = 'bandeau-maj';
  el.className = 'bandeau rappel maj';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>Nouvelle version de l'appli disponible (${esc(maj.versionName)}).${maj.notes ? ` ${esc(maj.notes)}` : ''}</span>
    <button class="btn primaire" data-maj="telecharger">Télécharger</button>
    <button class="btn lien" data-maj="plus-tard">Plus tard</button>`;
  el.onclick = async (e) => {
    const action = e.target.closest('[data-maj]')?.dataset.maj;
    if (action === 'plus-tard') {
      localStorage.setItem(CLE_PLUS_TARD, String(maj.versionCode));
      el.remove();
    }
    if (action === 'telecharger') {
      await ouvrirTelechargement(maj);
      el.querySelector('span').textContent =
        "Une fois le téléchargement fini, touchez le fichier pour l'installer (« Mettre à jour »). Vos fiches sont gardées.";
    }
  };
  document.getElementById('view').before(el);
}

export async function ouvrirTelechargement(maj) {
  await androidOpenUrl(maj.url);
}

/**
 * Au démarrage : affiche le bandeau si une version plus récente existe
 * (sauf si l'utilisateur a déjà répondu « Plus tard » pour cette version).
 */
export async function verifierMiseAJour() {
  const maj = versionPlusRecente(await lireVersionPubliee());
  if (!maj) return;
  if (localStorage.getItem(CLE_PLUS_TARD) === String(maj.versionCode)) return;
  afficherBandeau(maj);
}
