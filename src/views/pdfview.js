// Vue « PDF » : choisir les fiches et télécharger le livre à imprimer.
import { getOrder, getSettings, liveBooks, setSettings } from '../db.js';
import { sortBooks } from '../books.js';
import { canShareFiles, shareBlob } from '../download.js';
import { esc, formatDate, normalize, pluralize } from '../util.js';
import { $, $$, getPrefs, toast } from '../ui.js';

export async function renderPdf(view) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const sorted = sortBooks(books, order, getPrefs().sort);
  const ready = sorted.filter((b) => b.fiche);
  const date = formatDate(Date.now());

  view.innerHTML = `<section class="page pdf">
    <h1>Télécharger le PDF</h1>
    <p class="petit">Format A4, prêt à imprimer : couverture, sommaire avec numéros de page, puis une fiche par page.</p>
    <div class="champs">
      <label>Titre du livre (couverture)<input id="titreLivre" value="${esc(settings.titreLivre)}"></label>
      <label>Votre nom<input id="nom" value="${esc(settings.nom)}" placeholder="Prénom Nom"></label>
    </div>
    <p class="petit">Date sur la couverture : ${esc(date)}</p>

    <fieldset class="choix-fiches">
      <legend>Fiches à inclure</legend>
      ${ready.length
        ? `<div class="rangee"><button class="lien" id="tout">Tout cocher</button><button class="lien" id="rien">Tout décocher</button></div>
           ${ready
             .map(
               (b) => `<label class="case"><input type="checkbox" value="${esc(b.id)}" checked>
                 <span>${esc(b.title)}${b.author ? ` <em>— ${esc(b.author)}</em>` : ''}</span></label>`,
             )
             .join('')}`
        : '<p>Aucune fiche terminée pour le moment.</p>'}
      ${sorted.length > ready.length
        ? `<p class="petit">${pluralize(sorted.length - ready.length, 'fiche à terminer n\'est pas incluse', 'fiches à terminer ne sont pas incluses')}.</p>`
        : ''}
    </fieldset>
    <p class="petit">Les fiches suivent l'ordre choisi dans « Mon livre ».</p>
    <div class="rangee">
      <button class="btn primaire" id="telecharger" ${ready.length ? '' : 'disabled'}>Télécharger le PDF</button>
      <button class="btn" id="partager" hidden>Partager le PDF…</button>
    </div>
    <p id="etat" class="petit" aria-live="polite"></p>
  </section>`;

  const save = () =>
    setSettings({ titreLivre: $('#titreLivre', view).value.trim() || 'Mon livre de lectures', nom: $('#nom', view).value.trim() });
  $('#titreLivre', view).addEventListener('change', save);
  $('#nom', view).addEventListener('change', save);

  const boxes = () => $$('.choix-fiches input[type="checkbox"]', view);
  const updateLabel = () => {
    const n = boxes().filter((b) => b.checked).length;
    const btn = $('#telecharger', view);
    btn.textContent = `Télécharger le PDF (${pluralize(n, 'fiche', 'fiches')})`;
    btn.disabled = n === 0;
  };
  if (ready.length) {
    updateLabel();
    view.onchange = (e) => e.target.type === 'checkbox' && updateLabel();
    $('#tout', view).onclick = () => (boxes().forEach((b) => (b.checked = true)), updateLabel());
    $('#rien', view).onclick = () => (boxes().forEach((b) => (b.checked = false)), updateLabel());
  }

  let lastBlob = null;
  let lastName = '';
  $('#telecharger', view).addEventListener('click', async () => {
    await save();
    const ids = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
    const chosen = ready.filter((b) => ids.has(b.id));
    const cover = { titreLivre: $('#titreLivre', view).value.trim() || 'Mon livre de lectures', nom: $('#nom', view).value.trim(), date };
    const btn = $('#telecharger', view);
    const etat = $('#etat', view);
    btn.disabled = true;
    etat.textContent = 'Préparation du PDF… (quelques secondes)';
    try {
      const { downloadPdf } = await import('../pdf.js');
      lastName = `${normalize(cover.titreLivre).replace(/ /g, '-') || 'mon-livre-de-lectures'}.pdf`;
      lastBlob = await downloadPdf(chosen, cover, lastName);
      etat.textContent = 'Le PDF est dans votre dossier Téléchargements ✓';
      if (canShareFiles()) $('#partager', view).hidden = false;
    } catch (err) {
      console.error(err);
      etat.textContent = '';
      toast("Le PDF n'a pas pu être créé. Réessayez ; si le problème continue, rechargez la page.", 'erreur', 8000);
    } finally {
      updateLabel();
    }
  });

  $('#partager', view).addEventListener('click', async () => {
    if (lastBlob && !(await shareBlob(lastBlob, lastName, cover().titreLivre))) {
      toast("Le partage n'est pas disponible sur ce navigateur.", 'erreur');
    }
  });
  const cover = () => ({ titreLivre: $('#titreLivre', view).value.trim() });
}
