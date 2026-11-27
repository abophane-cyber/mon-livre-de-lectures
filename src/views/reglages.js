// Vue « Réglages » : thème, IA utilisée, couverture, installation.
import { isAndroidApp, isNativeApp } from '../native.js';
import { getSettings, setSettings } from '../db.js';
import { esc } from '../util.js';
import { VERSION_NOM, lireVersionPubliee, ouvrirTelechargement, versionPlusRecente } from '../maj.js';
import { $, IA, applyTheme, currentIaKey, getPrefs, setPrefs, toast } from '../ui.js';

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
});

export async function renderReglages(view) {
  const prefs = getPrefs();
  const settings = await getSettings();
  const installed = window.matchMedia('(display-mode: standalone)').matches;

  view.innerHTML = `<section class="page reglages">
    <h1>Réglages</h1>

    <fieldset class="segment">
      <legend>Apparence</legend>
      ${[['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre'], ['nature', 'Nature']]
        .map(([k, l]) => `<label><input type="radio" name="theme" value="${k}"${prefs.theme === k ? ' checked' : ''}><span>${l}</span></label>`)
        .join('')}
    </fieldset>

    <label class="bloc">IA utilisée pour les résumés
      <select id="ia">${Object.entries(IA)
        .map(([k, v]) => `<option value="${k}"${currentIaKey() === k ? ' selected' : ''}>${v.label}</option>`)
        .join('')}</select>
    </label>

    <div class="champs">
      <label>Titre de votre livre de lectures<input id="titreLivre" value="${esc(settings.titreLivre)}"></label>
      <label>Votre nom (couverture du PDF)<input id="nom" value="${esc(settings.nom)}"></label>
    </div>

    ${isNativeApp ? '' : `<div class="etape">
      <h2>Installer l'appli sur l'écran d'accueil</h2>
      ${installed
        ? '<p>L\'appli est installée ✓</p>'
        : `<button class="btn primaire" id="installer" ${installEvent ? '' : 'hidden'}>Installer l'appli</button>
           <p class="petit">Sinon : dans Chrome, menu <strong>⋮</strong> → <strong>Ajouter à l'écran d'accueil</strong> (ou « Installer l'application »).
           Dans Samsung Internet : menu <strong>≡</strong> → <strong>Ajouter la page à</strong> → <strong>Écran d'accueil</strong>.</p>`}
    </div>`}

    ${isAndroidApp ? `<div class="etape">
      <h2>Mises à jour</h2>
      <p class="petit">Version installée : ${esc(VERSION_NOM)}. L'appli vérifie à chaque ouverture s'il en existe une plus récente.</p>
      <button class="btn" id="verifierMaj">Vérifier maintenant</button>
    </div>` : ''}

    <div class="etape">
      <h2>Vos données</h2>
      <p class="petit">${isNativeApp
        ? `Vos fiches sont enregistrées uniquement dans cette appli, sur cet appareil. Elles ne sont envoyées nulle part.
      ${isAndroidApp
        ? "Attention : désinstaller l'appli (ou « Effacer les données » dans ses paramètres Android) les supprimerait."
        : 'Elles restent sur ce PC même si vous désinstallez puis réinstallez le logiciel.'} Faites des sauvegardes régulières.`
        : `Vos fiches sont enregistrées uniquement dans ce navigateur, sur cet appareil. Elles ne sont envoyées nulle part.
      Attention : « Effacer les données de navigation » (cookies et données de sites) les supprimerait. Faites des sauvegardes régulières.`}</p>
    </div>
  </section>`;

  view.onchange = async (e) => {
    if (e.target.name === 'theme') {
      setPrefs({ theme: e.target.value });
      applyTheme();
    }
    if (e.target.id === 'ia') {
      setPrefs({ ia: e.target.value, iaChoisie: true });
      toast(`Les résumés se feront avec ${IA[e.target.value].label}.`, 'ok');
    }
    if (e.target.id === 'titreLivre' || e.target.id === 'nom') {
      await setSettings({
        titreLivre: $('#titreLivre', view).value.trim() || 'Mon livre de lectures',
        nom: $('#nom', view).value.trim(),
      });
      toast('Enregistré ✓', 'ok');
    }
  };

  $('#verifierMaj', view)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const publiee = await lireVersionPubliee();
    e.target.disabled = false;
    if (!publiee) return toast('Impossible de vérifier : pas de connexion Internet ?', 'attention');
    const maj = versionPlusRecente(publiee);
    if (!maj) return toast('Vous avez la dernière version ✓', 'ok');
    if (confirm(`Nouvelle version disponible (${maj.versionName}). La télécharger ?`)) {
      await ouvrirTelechargement(maj);
      toast("Une fois le téléchargement fini, touchez le fichier pour l'installer. Vos fiches sont gardées.", 'info', 9000);
    }
  });

  $('#installer', view)?.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    renderReglages(view);
  });
}
