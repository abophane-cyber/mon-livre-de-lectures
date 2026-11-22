// Vue « Sauvegarde » : exporter / importer pour passer d'un appareil à l'autre par câble USB.
// Le fichier de sauvegarde est chiffré avec un mot de passe choisi par l'utilisateur.
import { dumpAll, liveBooks, writeMerged } from '../db.js';
import { partsOf } from '../fiches.js';
import { BACKUP_APP, BACKUP_VERSION, makeBackup, mergeBackup, validateBackup } from '../sync.js';
import { decryptJson, encryptJson, isEncrypted } from '../crypto.js';
import { canShareFiles, downloadBlob, shareBlob, stamp } from '../download.js';
import { formatDate, pluralize } from '../util.js';
import { $, getPrefs, readFileText, setPrefs, toast } from '../ui.js';

const MIN_LENGTH = 8;

/** Vérifie le mot de passe choisi ; renvoie un message d'erreur ou null. */
function checkNewPassword(pw, confirm) {
  if (pw.length < MIN_LENGTH) return `Choisissez un mot de passe d'au moins ${MIN_LENGTH} caractères.`;
  if (pw !== confirm) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}

async function encryptedBackupBlob(password) {
  const data = makeBackup(await dumpAll());
  const envelope = await encryptJson(data, password, { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: data.exportedAt });
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

export async function renderSauvegarde(view) {
  const books = await liveBooks();
  const prefs = getPrefs();
  const share = canShareFiles();
  let pendingFile = null; // sauvegarde chiffrée en attente du mot de passe

  view.innerHTML = `<section class="page sauvegarde">
    <h1>Sauvegarde et mise à jour</h1>
    <p>Vos fiches sont enregistrées <strong>uniquement sur cet appareil</strong> (${pluralize(books.length, 'livre', 'livres')}, ${pluralize(books.reduce((n, b) => n + partsOf(b).length, 0), 'fiche', 'fiches')}).
      Pour retrouver les mêmes fiches sur l'ordinateur et sur le téléphone, on passe par un fichier de sauvegarde
      <strong>protégé par un mot de passe</strong>.</p>
    <p class="petit">Dernière sauvegarde : ${prefs.lastExport ? formatDate(prefs.lastExport, true) : 'jamais'} ·
      Dernière importation : ${prefs.lastImport ? formatDate(prefs.lastImport, true) : 'jamais'}</p>

    <form class="etape" id="form-export" autocomplete="on">
      <h2><span class="pastille">1</span> Sur l'appareil où vous avez travaillé</h2>
      <input type="text" name="username" value="Mon livre de lectures — sauvegarde" autocomplete="username" hidden readonly>
      <div class="champs">
        <label>Mot de passe de la sauvegarde
          <input type="password" id="mdp" autocomplete="new-password" minlength="${MIN_LENGTH}" required></label>
        <label>Retapez le mot de passe
          <input type="password" id="mdp2" autocomplete="new-password" minlength="${MIN_LENGTH}" required></label>
      </div>
      <label class="case-simple"><input type="checkbox" id="voir"> Afficher le mot de passe</label>
      <p class="petit avertissement">⚠ Notez ce mot de passe en lieu sûr. <strong>Sans lui, la sauvegarde est illisible</strong>, et personne ne peut le retrouver. Utilisez le même sur vos deux appareils.</p>
      <div class="rangee">
        <button class="btn primaire" type="submit">Exporter la sauvegarde</button>
        ${share ? '<button class="btn" type="button" id="partager">Partager la sauvegarde…</button>' : ''}
      </div>
      <p class="petit">Un fichier <code>mon-livre-de-lectures_….json</code> est créé dans le dossier <strong>Téléchargements</strong>.</p>
    </form>

    <div class="etape">
      <h2><span class="pastille">2</span> Copier le fichier avec le câble USB</h2>
      <ol class="instructions">
        <li>Branchez le téléphone à l'ordinateur et <strong>déverrouillez-le</strong>.</li>
        <li>Sur le téléphone, touchez la notification « USB » et choisissez <strong>Transfert de fichiers</strong>.</li>
        <li>Sur l'ordinateur, ouvrez l'<strong>Explorateur de fichiers</strong> → <strong>Ce PC</strong> → <strong>Galaxy S24+</strong> → <strong>Phone</strong> (ou « Stockage interne ») → <strong>Download</strong>.</li>
        <li>Copiez le fichier le plus récent <em>du téléphone vers l'ordinateur</em> (glissez-le dans votre dossier Téléchargements), ou dans l'autre sens.</li>
      </ol>
    </div>

    <div class="etape">
      <h2><span class="pastille">3</span> Sur l'autre appareil</h2>
      <label class="btn primaire" for="fichier-sauvegarde">Importer la sauvegarde</label>
      <input type="file" id="fichier-sauvegarde" accept=".json,application/json" hidden>
      <form id="form-import" class="deverrouiller" hidden>
        <p><strong id="nom-fichier"></strong> est protégé par un mot de passe.</p>
        <input type="text" name="username" value="Mon livre de lectures — sauvegarde" autocomplete="username" hidden readonly>
        <label>Mot de passe de la sauvegarde
          <input type="password" id="mdp-import" autocomplete="current-password" required></label>
        <div class="rangee">
          <button class="btn primaire" type="submit">Déverrouiller et importer</button>
          <button class="btn" type="button" id="annuler-import">Annuler</button>
        </div>
      </form>
      <p class="petit">Rien n'est écrasé : les deux versions sont <strong>fusionnées</strong>. Pour une même fiche, la version modifiée le plus récemment est gardée.</p>
      <div id="bilan" class="bilan" hidden></div>
    </div>
  </section>`;

  const pw = $('#mdp', view);
  const pw2 = $('#mdp2', view);
  $('#voir', view).addEventListener('change', (e) => {
    pw.type = pw2.type = e.target.checked ? 'text' : 'password';
  });

  async function exportWith(action) {
    const error = checkNewPassword(pw.value, pw2.value);
    if (error) {
      toast(error, 'erreur', 6000);
      (pw.value.length < MIN_LENGTH ? pw : pw2).focus();
      return;
    }
    const btns = view.querySelectorAll('#form-export button');
    btns.forEach((b) => (b.disabled = true));
    try {
      const blob = await encryptedBackupBlob(pw.value);
      const name = `mon-livre-de-lectures_${stamp()}.json`;
      if (action === 'share') {
        if (!(await shareBlob(blob, name, 'Mon livre de lectures'))) {
          toast("Le partage n'est pas disponible. Utilisez « Exporter la sauvegarde ».", 'erreur');
          return;
        }
      } else {
        downloadBlob(blob, name);
        toast('Sauvegarde protégée enregistrée dans Téléchargements ✓', 'ok');
      }
      setPrefs({ lastExport: Date.now() });
      pw.value = pw2.value = '';
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  $('#form-export', view).addEventListener('submit', (e) => {
    e.preventDefault();
    exportWith('download');
  });
  $('#partager', view)?.addEventListener('click', () => exportWith('share'));

  async function importData(incomingRaw) {
    const incoming = validateBackup(incomingRaw);
    const merged = mergeBackup(await dumpAll(), incoming);
    await writeMerged(merged);
    setPrefs({ lastImport: Date.now() });
    const r = merged.report;
    const lines = [
      r.ajoutees && pluralize(r.ajoutees, 'fiche ajoutée', 'fiches ajoutées'),
      r.misesAJour && pluralize(r.misesAJour, 'fiche mise à jour', 'fiches mises à jour'),
      r.supprimees && pluralize(r.supprimees, 'fiche supprimée', 'fiches supprimées'),
      r.reunies && pluralize(r.reunies, 'livre présent des deux côtés réuni', 'livres présents des deux côtés réunis'),
    ].filter(Boolean);
    await renderSauvegarde(view);
    const bilan = $('#bilan', view);
    bilan.hidden = false;
    bilan.innerHTML = `<p><strong>Importation réussie ✓</strong></p><p>${
      lines.length ? lines.join(' · ') : 'Tout était déjà à jour.'
    }</p><a class="btn" href="#/">Voir mon livre</a>`;
    bilan.scrollIntoView({ block: 'center' });
  }

  const formImport = $('#form-import', view);
  $('#fichier-sauvegarde', view).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      if (isEncrypted(data)) {
        if (data.app !== BACKUP_APP) throw new Error("Ce fichier n'est pas une sauvegarde de « Mon livre de lectures ».");
        pendingFile = data;
        $('#nom-fichier', view).textContent = file.name;
        formImport.hidden = false;
        $('#mdp-import', view).focus();
      } else {
        // Ancienne sauvegarde non protégée : acceptée, mais on conseille d'en refaire une protégée.
        await importData(data);
        toast('Sauvegarde importée. Pensez à supprimer ce fichier non protégé de vos Téléchargements.', 'attention', 9000);
      }
    } catch (err) {
      toast(err instanceof SyntaxError ? "Ce fichier est abîmé ou n'est pas une sauvegarde." : err.message, 'erreur', 8000);
    }
  });

  formImport.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingFile) return;
    const btn = formImport.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Déverrouillage…';
    try {
      const data = await decryptJson(pendingFile, $('#mdp-import', view).value);
      pendingFile = null;
      await importData(data);
    } catch (err) {
      toast(err.message, 'erreur', 7000);
      btn.disabled = false;
      btn.textContent = 'Déverrouiller et importer';
      $('#mdp-import', view).select();
    }
  });

  $('#annuler-import', view).addEventListener('click', () => {
    pendingFile = null;
    formImport.hidden = true;
    $('#mdp-import', view).value = '';
  });
}
