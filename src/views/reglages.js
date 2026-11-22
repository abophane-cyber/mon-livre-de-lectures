// Vue « Réglages » : thème, IA utilisée, couverture, installation.
import { getSettings, setSettings } from '../db.js';
import { esc } from '../util.js';
import { $, IA, applyTheme, getPrefs, setPrefs, toast } from '../ui.js';

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
      ${[['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']]
        .map(([k, l]) => `<label><input type="radio" name="theme" value="${k}"${prefs.theme === k ? ' checked' : ''}><span>${l}</span></label>`)
        .join('')}
    </fieldset>

    <label class="bloc">IA utilisée pour les résumés
      <select id="ia">${Object.entries(IA)
        .map(([k, v]) => `<option value="${k}"${prefs.ia === k ? ' selected' : ''}>${v.label}</option>`)
        .join('')}</select>
    </label>

    <div class="champs">
      <label>Titre de votre livre de lectures<input id="titreLivre" value="${esc(settings.titreLivre)}"></label>
      <label>Votre nom (couverture du PDF)<input id="nom" value="${esc(settings.nom)}"></label>
    </div>

    <div class="etape">
      <h2>Installer l'appli sur l'écran d'accueil</h2>
      ${installed
        ? '<p>L\'appli est installée ✓</p>'
        : `<button class="btn primaire" id="installer" ${installEvent ? '' : 'hidden'}>Installer l'appli</button>
           <p class="petit">Sinon : dans Chrome, menu <strong>⋮</strong> → <strong>Ajouter à l'écran d'accueil</strong> (ou « Installer l'application »).
           Dans Samsung Internet : menu <strong>≡</strong> → <strong>Ajouter la page à</strong> → <strong>Écran d'accueil</strong>.</p>`}
    </div>

    <div class="etape">
      <h2>Vos données</h2>
      <p class="petit">Vos fiches sont enregistrées uniquement dans ce navigateur, sur cet appareil. Elles ne sont envoyées nulle part.
      Attention : « Effacer les données de navigation » (cookies et données de sites) les supprimerait. Faites des sauvegardes régulières.</p>
    </div>
  </section>`;

  view.onchange = async (e) => {
    if (e.target.name === 'theme') {
      setPrefs({ theme: e.target.value });
      applyTheme();
    }
    if (e.target.id === 'ia') {
      setPrefs({ ia: e.target.value });
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

  $('#installer', view)?.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    renderReglages(view);
  });
}
