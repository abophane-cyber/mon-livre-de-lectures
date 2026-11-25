// Vue « Sauvegarde » : passer ses fiches d'un appareil à l'autre avec un fichier.
// Deux gestes seulement : « Créer le fichier » sur un appareil, « Lire le fichier » sur l'autre.
// Le fichier est chiffré par un mot de passe, demandé une seule fois puis mémorisé sur l'appareil.
import { dumpAll, liveBooks, restoreBooks, writeMerged } from '../db.js';
import { partsOf } from '../fiches.js';
import { BACKUP_APP, BACKUP_VERSION, makeBackup, mergeBackup, validateBackup } from '../sync.js';
import { decryptJson, encryptJson, isEncrypted } from '../crypto.js';
import { canShareFiles, downloadBlob, shareBlob } from '../download.js';
import { isAndroidApp, isDesktopApp } from '../native.js';
import { AUTO_FOLDER, autoBackupSupported, runAutoBackup } from '../autobackup.js';
import { esc, formatDate, newId, pluralize } from '../util.js';
import { $, getPrefs, readFileText, setPrefs, toast } from '../ui.js';

const MIN_LENGTH = 8;
/** Titre utilisé dans le nom de la sauvegarde : le titre du livre (ex. « RICHES ENSEMBLE »),
 *  ou les titres des livres s'il y en a plusieurs (« A + B + C et 2 autres »). */
export function backupTitle(books) {
  const titres = books.map((b) => String(b.title || '').trim()).filter(Boolean);
  if (titres.length <= 3) return titres.join(' + ');
  return `${titres.slice(0, 3).join(' + ')} et ${titres.length - 3} autres`;
}

/** Nom du fichier : « titre du livre_jour-mois-année-heure », ex. « RICHES ENSEMBLE_23-11-2026-14h05.json ». */
export function backupFileName(titre, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const propre = String(titre || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '') || 'Mon livre de lectures';
  return `${propre}_${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()}-${p(date.getHours())}h${p(date.getMinutes())}.json`;
}

/** Fichier ouvert avec l'appli Android (voir main.js) : lu dès l'affichage de la page Sauvegarde. */
let receivedFile = null;
export function receiveFile(file) {
  receivedFile = file;
}

const isPhone = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const deviceName = () => (isPhone() ? 'telephone' : 'ordinateur');
const deviceLabel = (d) => (d === 'telephone' ? 'le téléphone' : d === 'ordinateur' ? "l'ordinateur" : "l'autre appareil");

/** Identifiant de cet appareil, pour reconnaître un fichier créé ici même. */
function deviceId() {
  let id = getPrefs().deviceId;
  if (!id) {
    id = newId();
    setPrefs({ deviceId: id });
  }
  return id;
}

/** Vérifie le mot de passe choisi ; renvoie un message d'erreur ou null. */
function checkNewPassword(pw, confirm) {
  if (pw.length < MIN_LENGTH) return `Choisissez un mot de passe d'au moins ${MIN_LENGTH} caractères.`;
  if (pw !== confirm) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}

export async function encryptedBackupBlob(password, dump) {
  const data = makeBackup(dump || (await dumpAll()));
  const envelope = await encryptJson(data, password, {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt,
    device: deviceName(),
    deviceId: deviceId(),
  });
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

const USB_STEP = `Branchez le téléphone à l'ordinateur avec le câble, <strong>déverrouillez-le</strong>, touchez la notification « USB » et choisissez <strong>Transfert de fichiers</strong>.`;

function afterCreateHtml(name) {
  if (isPhone()) {
    return `<p><strong>Fichier créé ✓</strong> <code>${esc(name)}</code> est dans le dossier <strong>Téléchargements</strong> du téléphone.</p>
      <p>Pour le lire sur l'ordinateur :</p>
      <ol class="instructions">
        <li>${USB_STEP}</li>
        <li>Sur l'ordinateur, ouvrez l'appli, page <strong>Sauvegarde</strong>, et cliquez sur <strong>Lire le fichier de l'autre appareil</strong>.</li>
      </ol>`;
  }
  return `<p><strong>Fichier créé ✓</strong> <code>${esc(name)}</code> est dans le dossier <strong>Téléchargements</strong> de l'ordinateur.</p>
    <p>Pour le lire sur le téléphone :</p>
    <ol class="instructions">
      <li>${USB_STEP}</li>
      <li>Sur l'ordinateur, ouvrez l'<strong>Explorateur de fichiers</strong> → <strong>Téléchargements</strong> et faites glisser le fichier
        vers <strong>Ce PC</strong> → <strong>Galaxy S24+</strong> → <strong>Phone</strong> → <strong>Download</strong>.</li>
      <li>Sur le téléphone, ouvrez l'appli, page <strong>Sauvegarde</strong>, et touchez <strong>Lire le fichier de l'autre appareil</strong>.</li>
    </ol>`;
}

/** Ordinateur : après « Envoyer par Quick Share… », comment finir l'envoi vers le téléphone. */
function quickSharePcHtml(name) {
  const ouvrir = isDesktopApp
    ? `L'<strong>Explorateur de fichiers</strong> vient de s'ouvrir sur le dossier <strong>Téléchargements</strong>, avec le fichier déjà sélectionné.`
    : `Ouvrez l'<strong>Explorateur de fichiers</strong> → <strong>Téléchargements</strong> et trouvez ce fichier.`;
  return `<p><strong>Fichier prêt ✓</strong> <code>${esc(name)}</code> est dans le dossier <strong>Téléchargements</strong> de l'ordinateur.</p>
    <p>Pour l'envoyer au téléphone sans câble :</p>
    <ol class="instructions">
      <li>Sur le téléphone, allumez le <strong>Wi-Fi</strong> et le <strong>Bluetooth</strong>, et déverrouillez-le.</li>
      <li>${ouvrir}</li>
      <li>Faites un <strong>clic droit</strong> sur le fichier → <strong>Envoyer avec Quick Share</strong>
        (si vous ne le voyez pas : <strong>Afficher d'autres options</strong> d'abord), puis choisissez votre <strong>Galaxy</strong>.
        Vous pouvez aussi faire glisser le fichier dans la fenêtre de l'appli <strong>Quick Share</strong>.</li>
      <li>Sur le téléphone, acceptez la réception, puis ouvrez l'appli, page <strong>Sauvegarde</strong>,
        et touchez <strong>Lire le fichier de l'autre appareil</strong>.</li>
    </ol>
    <p class="petit">Quick Share n'est pas installé sur l'ordinateur ? Ouvrez le <strong>Microsoft Store</strong>, cherchez
      « Quick Share », installez l'application de Google et connectez-vous avec le même compte Google que sur le téléphone.</p>`;
}

function readHelpHtml() {
  if (isPhone()) {
    return `<p class="petit">Touchez le bouton, puis <strong>Téléchargements</strong> (ou « Download »), et choisissez le fichier
      le plus récent (la date et l'heure sont dans son nom).</p>
      <p class="petit">Reçu par <strong>Quick Share</strong> ? Il est dans <strong>Download</strong> → <strong>Quick Share</strong>.</p>
      <p class="petit">Le fichier vient de l'ordinateur ? Envoyez-le d'abord au téléphone avec <strong>Quick Share</strong>
      ou par le câble (voir « Créer le fichier » sur l'ordinateur).</p>`;
  }
  return `<ol class="instructions petit">
      <li>${USB_STEP}</li>
      <li>Cliquez sur le bouton. Dans la fenêtre qui s'ouvre, allez dans <strong>Ce PC</strong> → <strong>Galaxy S24+</strong> →
        <strong>Phone</strong> → <strong>Download</strong> et choisissez le fichier le plus récent (la date et l'heure sont dans son nom).</li>
    </ol>
    <p class="petit">Le fichier a été reçu par <strong>Quick Share</strong> ? Pas besoin de câble : cliquez sur le bouton
      et choisissez-le dans le dossier <strong>Téléchargements</strong> de l'ordinateur.</p>
    <p class="petit">Le téléphone n'apparaît pas dans la fenêtre ? Ouvrez ce même dossier dans l'<strong>Explorateur de fichiers</strong>
      et <strong>faites glisser le fichier</strong> dans le cadre ci-dessus.</p>`;
}

/** Encadré « Sauvegarde automatique » (logiciel Windows et appli Android). */
function autoHtml(prefs, savedPw) {
  const where = isDesktopApp
    ? `<strong>Téléchargements</strong> → <strong>${esc(AUTO_FOLDER)}</strong>`
    : `<strong>Download</strong> → <strong>${esc(AUTO_FOLDER)}</strong>`;
  let etat;
  if (!savedPw) {
    etat = `<p><strong>Pas encore active.</strong> Elle démarrera dès que vous aurez créé votre premier fichier de sauvegarde
      ci-dessus (c'est là que vous choisissez le mot de passe qui protège vos fichiers).</p>`;
  } else if (prefs.autoBackup === false) {
    etat = `<p><strong>Arrêtée.</strong></p>`;
  } else {
    etat = `<p><strong>Active ✓</strong> Dernière sauvegarde automatique :
      <span id="auto-date">${prefs.lastAuto ? formatDate(prefs.lastAuto, true) : 'pas encore (dans quelques secondes)'}</span>.</p>
      ${prefs.autoError ? `<p class="petit">⚠️ La dernière tentative n'a pas marché (${esc(prefs.autoError)}). Elle sera refaite au prochain changement.</p>` : ''}`;
  }
  return `<div class="etape">
      <h2><span class="pastille">✓</span> Sauvegarde automatique</h2>
      ${etat}
      <p class="petit">À chaque changement dans vos fiches, l'appli enregistre toute seule un fichier de sauvegarde protégé
        par votre mot de passe, dans ${where}. Les 10 plus récents sont gardés.
        Si l'appli est un jour effacée ou réinstallée, lisez le plus récent avec « Lire le fichier de l'autre appareil ».</p>
      ${isAndroidApp ? `<p class="petit">Ces fichiers restent sur le téléphone : s'il est perdu, ils le sont aussi.
        Pensez à copier de temps en temps une sauvegarde sur l'ordinateur.</p>` : ''}
      <div class="rangee">
        ${isDesktopApp ? '<button class="btn" type="button" id="ouvrir-dossier">Ouvrir le dossier des sauvegardes</button>' : ''}
        ${savedPw ? `<button class="lien" type="button" id="auto-onoff">${prefs.autoBackup === false ? 'Réactiver la sauvegarde automatique' : 'Arrêter la sauvegarde automatique'}</button>` : ''}
      </div>
    </div>`;
}

export async function renderSauvegarde(view) {
  const books = await liveBooks();
  const prefs = getPrefs();
  const savedPw = prefs.backupPw || '';
  // Téléphone : menu « Partager » d'Android. Ordinateur : fichier dans Téléchargements + mode d'emploi Quick Share.
  const share = isPhone() ? canShareFiles() : true;
  const other = isPhone() ? "l'ordinateur" : 'le téléphone';
  let pendingFile = null; // sauvegarde chiffrée en attente du mot de passe
  let pendingFrom = null;

  view.innerHTML = `<section class="page sauvegarde">
    <h1>Sauvegarde</h1>
    <p>Vos fiches sont enregistrées <strong>sur cet appareil</strong>
      (${pluralize(books.length, 'livre', 'livres')}, ${pluralize(books.reduce((n, b) => n + partsOf(b).length, 0), 'fiche', 'fiches')}).
      Pour les avoir aussi sur ${other} : <strong>créez le fichier ici</strong>, puis <strong>lisez-le là-bas</strong>.
      Rien n'est écrasé : les fiches des deux appareils sont réunies.</p>

    <div class="etape">
      <h2><span class="pastille">1</span> Créer le fichier de sauvegarde</h2>
      <form id="form-export" autocomplete="on">
        <input type="text" name="username" value="Mon livre de lectures — sauvegarde" autocomplete="username" hidden readonly>
        ${savedPw ? '' : `<div class="deverrouiller">
          <p><strong>Première fois sur cet appareil :</strong> choisissez un mot de passe qui protégera vos fichiers.
            Il sera retenu ici, vous n'aurez plus à le taper. <strong>Prenez le même sur le téléphone et sur l'ordinateur</strong>, et notez-le.</p>
          <div class="champs">
            <label>Mot de passe
              <input type="password" id="mdp" autocomplete="new-password" minlength="${MIN_LENGTH}" required></label>
            <label>Retapez-le
              <input type="password" id="mdp2" autocomplete="new-password" minlength="${MIN_LENGTH}" required></label>
          </div>
          <label class="case-simple"><input type="checkbox" id="voir"> Afficher le mot de passe</label>
        </div>`}
        <div class="rangee">
          <button class="btn primaire" type="submit">Créer le fichier de sauvegarde</button>
          ${share ? '<button class="btn" type="button" id="partager">Envoyer par Quick Share…</button>' : ''}
        </div>
      </form>
      <div id="apres-creation" class="bilan" hidden></div>
      <p class="petit">Dernier fichier créé ici : ${prefs.lastExport ? formatDate(prefs.lastExport, true) : 'jamais'}</p>
    </div>

    <div class="etape">
      <h2><span class="pastille">2</span> Lire le fichier de l'autre appareil</h2>
      <label class="zone-depot" for="fichier-sauvegarde" id="zone-depot">
        <span class="btn primaire">Lire le fichier de l'autre appareil</span>
        ${isPhone() ? '' : '<span class="petit">ou faites glisser le fichier ici</span>'}
      </label>
      <input type="file" id="fichier-sauvegarde" ${isAndroidApp ? '' : 'accept=".json,application/json"'} hidden>
      ${readHelpHtml()}
      <form id="form-import" class="deverrouiller" hidden>
        <p><strong id="nom-fichier"></strong> est protégé par un mot de passe. Tapez celui choisi sur l'autre appareil
          (il sera ensuite retenu ici).</p>
        <input type="text" name="username" value="Mon livre de lectures — sauvegarde" autocomplete="username" hidden readonly>
        <label>Mot de passe
          <input type="password" id="mdp-import" autocomplete="current-password" required></label>
        <div class="rangee">
          <button class="btn primaire" type="submit">Lire le fichier</button>
          <button class="btn" type="button" id="annuler-import">Annuler</button>
        </div>
      </form>
      <div id="bilan" class="bilan" hidden></div>
      <p class="petit">Dernier fichier lu ici : ${prefs.lastImport ? formatDate(prefs.lastImport, true) : 'jamais'}</p>
    </div>

    ${autoBackupSupported() ? autoHtml(prefs, savedPw) : ''}

    ${savedPw ? `<p class="petit">Mot de passe des sauvegardes retenu sur cet appareil.
      <button class="lien" type="button" id="oublier-mdp">Changer de mot de passe</button></p>` : ''}
  </section>`;

  // --- Créer le fichier ---
  const pw = $('#mdp', view);
  const pw2 = $('#mdp2', view);
  $('#voir', view)?.addEventListener('change', (e) => {
    pw.type = pw2.type = e.target.checked ? 'text' : 'password';
  });

  async function exportWith(action) {
    let password = savedPw;
    if (!password) {
      const error = checkNewPassword(pw.value, pw2.value);
      if (error) {
        toast(error, 'erreur', 6000);
        (pw.value.length < MIN_LENGTH ? pw : pw2).focus();
        return;
      }
      password = pw.value;
    }
    if (!books.length) {
      toast("Il n'y a aucune fiche sur cet appareil : il n'y a rien à sauvegarder.", 'erreur', 8000);
      return;
    }
    const btns = view.querySelectorAll('#form-export button');
    btns.forEach((b) => (b.disabled = true));
    try {
      const blob = await encryptedBackupBlob(password);
      const name = backupFileName(backupTitle(await liveBooks()));
      let savedName = name;
      if (action === 'share' && !isPhone()) {
        savedName = window.lecturesPC?.saveAndShow
          ? await window.lecturesPC.saveAndShow(name, await blob.text())
          : await downloadBlob(blob, name);
      } else if (action === 'share') {
        if (!(await shareBlob(blob, name, 'Mon livre de lectures'))) {
          toast("L'envoi n'est pas disponible. Utilisez « Créer le fichier de sauvegarde ».", 'erreur');
          return;
        }
      } else {
        savedName = await downloadBlob(blob, name);
      }
      setPrefs({ lastExport: Date.now(), backupPw: password });
      await runAutoBackup(); // le mot de passe est maintenant connu : la sauvegarde automatique démarre
      await renderSauvegarde(view);
      const box = $('#apres-creation', view);
      box.hidden = false;
      box.innerHTML =
        action === 'share' && !isPhone()
          ? quickSharePcHtml(savedName)
          : action === 'share' ? `<p><strong>Fichier envoyé ✓</strong> Sur ${other}, lisez-le avec « Lire le fichier de l'autre appareil ».</p>` : afterCreateHtml(savedName);
      box.scrollIntoView({ block: 'center' });
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  $('#form-export', view).addEventListener('submit', (e) => {
    e.preventDefault();
    exportWith('download');
  });
  $('#partager', view)?.addEventListener('click', () => exportWith('share'));

  // Sauvegarde automatique en cours : afficher sa date dès qu'elle est finie.
  Promise.resolve(runAutoBackup()).then(() => {
    const el = $('#auto-date', view);
    if (el && getPrefs().lastAuto) el.textContent = formatDate(getPrefs().lastAuto, true);
  });
  $('#ouvrir-dossier', view)?.addEventListener('click', () => window.lecturesPC?.openBackupFolder());
  $('#auto-onoff', view)?.addEventListener('click', async () => {
    const on = getPrefs().autoBackup === false;
    setPrefs({ autoBackup: on, autoSig: '' });
    if (on) await runAutoBackup();
    await renderSauvegarde(view);
  });

  $('#oublier-mdp', view)?.addEventListener('click', async () => {
    setPrefs({ backupPw: '' });
    await renderSauvegarde(view);
    $('#mdp', view)?.focus();
  });

  // --- Lire le fichier ---
  async function importData(incomingRaw, from) {
    const incoming = validateBackup(incomingRaw);
    const inBooks = incoming.books.filter((b) => !b.deleted);
    if (!inBooks.length) {
      toast("Ce fichier est vide : il ne contient aucune fiche. Vérifiez que vous avez choisi le bon fichier.", 'erreur', 10000);
      return;
    }
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
    const when = incoming.exportedAt ? ` le ${formatDate(incoming.exportedAt, true)}` : '';
    bilan.innerHTML = `<p><strong>Fichier lu ✓</strong></p>
      <p>Ce fichier a été créé sur ${deviceLabel(from)}${when}. Il contient ${pluralize(inBooks.length, 'livre', 'livres')} :
        ${inBooks.slice(0, 8).map((b) => `<em>${esc(b.title || 'Sans titre')}</em>`).join(', ')}${inBooks.length > 8 ? '…' : ''}.</p>
      <p>${lines.length ? lines.join(' · ') : merged.deletedHere.length ? 'Rien de nouveau à ajouter.' : 'Tout était déjà sur cet appareil : rien à ajouter.'}</p>
      ${merged.deletedHere.length ? `<div class="deverrouiller">
        <p>${merged.deletedHere.length > 1
          ? "Ces livres avaient été <strong>supprimés sur cet appareil</strong> après leur dernière modification, alors ils n'ont pas été remis :"
          : "Ce livre avait été <strong>supprimé sur cet appareil</strong> après sa dernière modification, alors il n'a pas été remis :"}
          ${merged.deletedHere.map((b) => `<em>${esc(b.title || 'Sans titre')}</em>`).join(', ')}.</p>
        <button class="btn primaire" type="button" id="remettre">${merged.deletedHere.length > 1 ? 'Remettre ces livres' : 'Remettre ce livre'}</button>
      </div>` : ''}
      <a class="btn primaire" href="#/">Voir mon livre</a>`;
    $('#remettre', bilan)?.addEventListener('click', async () => {
      await restoreBooks(merged.deletedHere);
      toast(merged.deletedHere.length > 1 ? 'Livres remis ✓' : 'Livre remis ✓');
      location.hash = '#/';
    });
    bilan.scrollIntoView({ block: 'center' });
  }

  const formImport = $('#form-import', view);

  async function openFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      if (!isEncrypted(data)) {
        // Ancienne sauvegarde non protégée : acceptée.
        await importData(data);
        return;
      }
      if (data.app !== BACKUP_APP) throw new Error("Ce fichier n'est pas une sauvegarde de « Mon livre de lectures ».");
      if (data.deviceId && data.deviceId === getPrefs().deviceId) {
        toast(
          isPhone()
            ? "Ce fichier a été créé sur ce téléphone. Choisissez celui qui vient de l'ordinateur (son nom contient « ordinateur »)."
            : "Ce fichier a été créé sur cet ordinateur. Choisissez celui du téléphone : Ce PC → Galaxy S24+ → Phone → Download (son nom contient « telephone »).",
          'erreur',
          12000,
        );
        return;
      }
      pendingFrom = data.device;
      // On essaie d'abord le mot de passe retenu sur cet appareil.
      if (savedPw) {
        try {
          const plain = await decryptJson(data, savedPw);
          await importData(plain, data.device);
          return;
        } catch {
          /* mot de passe différent : on le demande */
        }
      }
      pendingFile = data;
      $('#nom-fichier', view).textContent = file.name;
      formImport.hidden = false;
      $('#mdp-import', view).focus();
    } catch (err) {
      toast(err instanceof SyntaxError ? "Ce fichier est abîmé ou n'est pas une sauvegarde." : err.message, 'erreur', 8000);
    }
  }

  $('#fichier-sauvegarde', view).addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    openFile(file);
  });

  const zone = $('#zone-depot', view);
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('survol');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('survol');
    openFile(e.dataTransfer?.files?.[0]);
  });

  formImport.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingFile) return;
    const btn = formImport.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Lecture…';
    const password = $('#mdp-import', view).value;
    try {
      const data = await decryptJson(pendingFile, password);
      pendingFile = null;
      setPrefs({ backupPw: password });
      await importData(data, pendingFrom);
    } catch (err) {
      toast(err.message, 'erreur', 7000);
      btn.disabled = false;
      btn.textContent = 'Lire le fichier';
      $('#mdp-import', view).select();
    }
  });

  if (receivedFile) {
    const file = receivedFile;
    receivedFile = null;
    openFile(file);
  }

  $('#annuler-import', view).addEventListener('click', () => {
    pendingFile = null;
    formImport.hidden = true;
    $('#mdp-import', view).value = '';
  });
}
