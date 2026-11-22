// Vue « Sauvegarde » : exporter / importer pour passer d'un appareil à l'autre par câble USB.
import { dumpAll, liveBooks, writeMerged } from '../db.js';
import { makeBackup, mergeBackup, validateBackup } from '../sync.js';
import { canShareFiles, downloadBlob, shareBlob, stamp } from '../download.js';
import { formatDate, pluralize } from '../util.js';
import { $, getPrefs, readFileText, setPrefs, toast } from '../ui.js';

async function backupBlob() {
  const data = makeBackup(await dumpAll());
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function renderSauvegarde(view) {
  const books = await liveBooks();
  const prefs = getPrefs();
  const share = canShareFiles();

  view.innerHTML = `<section class="page sauvegarde">
    <h1>Sauvegarde et mise à jour</h1>
    <p>Vos fiches sont enregistrées <strong>uniquement sur cet appareil</strong> (${pluralize(books.length, 'fiche', 'fiches')}).
      Pour retrouver les mêmes fiches sur l'ordinateur et sur le téléphone, on passe par un fichier de sauvegarde.</p>
    <p class="petit">Dernière sauvegarde : ${prefs.lastExport ? formatDate(prefs.lastExport, true) : 'jamais'} ·
      Dernière importation : ${prefs.lastImport ? formatDate(prefs.lastImport, true) : 'jamais'}</p>

    <div class="etape">
      <h2><span class="pastille">1</span> Sur l'appareil où vous avez travaillé</h2>
      <button class="btn primaire" id="exporter">Exporter la sauvegarde</button>
      ${share ? '<button class="btn" id="partager">Partager la sauvegarde…</button>' : ''}
      <p class="petit">Un fichier <code>mon-livre-de-lectures_….json</code> est créé dans le dossier <strong>Téléchargements</strong>.</p>
    </div>

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
      <p class="petit">Rien n'est écrasé : les deux versions sont <strong>fusionnées</strong>. Pour une même fiche, la version modifiée le plus récemment est gardée.</p>
      <div id="bilan" class="bilan" hidden></div>
    </div>
  </section>`;

  $('#exporter', view).addEventListener('click', async () => {
    downloadBlob(await backupBlob(), `mon-livre-de-lectures_${stamp()}.json`);
    setPrefs({ lastExport: Date.now() });
    toast('Sauvegarde enregistrée dans Téléchargements ✓', 'ok');
  });

  $('#partager', view)?.addEventListener('click', async () => {
    const ok = await shareBlob(await backupBlob(), `mon-livre-de-lectures_${stamp()}.json`, 'Mon livre de lectures');
    if (ok) setPrefs({ lastExport: Date.now() });
    else toast("Le partage n'est pas disponible. Utilisez « Exporter la sauvegarde ».", 'erreur');
  });

  $('#fichier-sauvegarde', view).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = validateBackup(JSON.parse(await readFileText(file)));
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
    } catch (err) {
      toast(err instanceof SyntaxError ? "Ce fichier est abîmé ou n'est pas une sauvegarde." : err.message, 'erreur', 8000);
    }
  });
}
