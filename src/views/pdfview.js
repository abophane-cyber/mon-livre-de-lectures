// Vue « PDF » : choisir le format et les fiches, puis télécharger le PDF à imprimer.
import { getOrder, getSettings, liveBooks, setSettings } from '../db.js';
import { sortBooks } from '../books.js';
import { canShareFiles, shareBlob } from '../download.js';
import { esc, formatDate, pluralize } from '../util.js';
import { $, $$, getPrefs, setPrefs, toast } from '../ui.js';

const FORMATS = {
  livre: {
    label: 'Livre complet',
    aide: 'Couverture, sommaire avec numéros de page, puis une fiche par page.',
  },
  a4: {
    label: 'Fiches A4 recto-verso',
    aide: "Une feuille par livre : le résumé au recto, la notice et les citations au verso. Imprimez en recto-verso (« retourner sur le bord long »).",
  },
};

export async function renderPdf(view) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const sorted = sortBooks(books, order, getPrefs().sort);
  const ready = sorted.filter((b) => b.fiche);
  const date = formatDate(Date.now());
  let format = FORMATS[getPrefs().pdfFormat] ? getPrefs().pdfFormat : 'livre';

  view.innerHTML = `<section class="page pdf">
    <h1>Télécharger le PDF</h1>
    <fieldset class="segment">
      <legend>Format</legend>
      ${Object.entries(FORMATS)
        .map(([k, f]) => `<label><input type="radio" name="format" value="${k}"${k === format ? ' checked' : ''}><span>${f.label}</span></label>`)
        .join('')}
    </fieldset>
    <p class="petit" id="aide-format"></p>
    <div id="couverture">
      <div class="champs">
        <label>Titre du livre (couverture)<input id="titreLivre" value="${esc(settings.titreLivre)}"></label>
        <label>Votre nom<input id="nom" value="${esc(settings.nom)}" placeholder="Prénom Nom"></label>
      </div>
      <p class="petit">Date sur la couverture : ${esc(date)}</p>
    </div>

    <fieldset class="choix-fiches">
      <legend>Fiches à inclure</legend>
      ${ready.length
        ? `<div class="rangee"><button class="lien" id="tout">Tout cocher</button><button class="lien" id="rien">Tout décocher</button></div>
           ${ready
             .map(
               (b) => `<label class="case"><input type="checkbox" value="${esc(b.id)}" checked>
                 <span>${esc(b.title)}${b.author || b.pubDate ? ` <em>— ${[b.author, b.pubDate].filter(Boolean).map(esc).join(' · ')}</em>` : ''}</span></label>`,
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

  const titreLivre = () => $('#titreLivre', view).value.trim() || 'Mon livre de lectures';
  const save = () => setSettings({ titreLivre: titreLivre(), nom: $('#nom', view).value.trim() });
  $('#titreLivre', view).addEventListener('change', save);
  $('#nom', view).addEventListener('change', save);

  const boxes = () => $$('.choix-fiches input[type="checkbox"]', view);
  const update = () => {
    const n = boxes().filter((b) => b.checked).length;
    const btn = $('#telecharger', view);
    btn.textContent = `Télécharger le PDF (${pluralize(n, 'fiche', 'fiches')})`;
    btn.disabled = n === 0;
    $('#aide-format', view).textContent = FORMATS[format].aide;
    $('#couverture', view).hidden = format !== 'livre';
  };
  update();
  view.onchange = (e) => {
    if (e.target.name === 'format') {
      format = e.target.value;
      setPrefs({ pdfFormat: format });
      $('#partager', view).hidden = true;
    }
    update();
  };
  if (ready.length) {
    $('#tout', view).onclick = () => (boxes().forEach((b) => (b.checked = true)), update());
    $('#rien', view).onclick = () => (boxes().forEach((b) => (b.checked = false)), update());
  }

  let lastBlob = null;
  let lastName = '';
  $('#telecharger', view).addEventListener('click', async () => {
    const ids = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
    const chosen = ready.filter((b) => ids.has(b.id));
    const btn = $('#telecharger', view);
    const etat = $('#etat', view);
    btn.disabled = true;
    etat.textContent = 'Préparation du PDF… (quelques secondes)';
    try {
      const pdf = await import('../pdf.js');
      if (format === 'livre') {
        await save();
        const cover = { titreLivre: titreLivre(), nom: $('#nom', view).value.trim(), date };
        lastName = `${pdf.slug(cover.titreLivre)}.pdf`;
        lastBlob = await pdf.downloadPdf(chosen, cover, lastName);
        etat.textContent = 'Le PDF est dans votre dossier Téléchargements ✓';
      } else {
        lastName = chosen.length === 1 ? `fiche-${pdf.slug(chosen[0].title)}.pdf` : 'fiches-de-lecture-A4.pdf';
        const { blob, small } = await pdf.downloadFichesA4(chosen, lastName);
        lastBlob = blob;
        etat.textContent = `Le PDF est dans votre dossier Téléchargements ✓ (${pluralize(chosen.length, 'feuille', 'feuilles')} recto-verso)`;
        if (small.length) {
          toast(`Texte long imprimé en petits caractères pour : ${small.join(', ')}. La longueur « Court » ou « Moyen » donne une fiche plus lisible.`, 'attention', 10000);
        }
      }
      if (canShareFiles()) $('#partager', view).hidden = false;
    } catch (err) {
      console.error(err);
      etat.textContent = '';
      toast("Le PDF n'a pas pu être créé. Réessayez ; si le problème continue, rechargez la page.", 'erreur', 8000);
    } finally {
      update();
    }
  });

  $('#partager', view).addEventListener('click', async () => {
    if (lastBlob && !(await shareBlob(lastBlob, lastName, titreLivre()))) {
      toast("Le partage n'est pas disponible sur ce navigateur.", 'erreur');
    }
  });
}
