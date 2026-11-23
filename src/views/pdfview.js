// Vue « PDF » : choisir le format et les fiches, puis télécharger le PDF à imprimer.
import { getOrder, getSettings, liveBooks, setSettings } from '../db.js';
import { sortBooks } from '../books.js';
import { chapterOf, partsOf, readyFiches } from '../fiches.js';
import { canShareFiles, shareBlob } from '../download.js';
import { esc, formatDate, pluralize } from '../util.js';
import { $, $$, getPrefs, setPrefs, toast } from '../ui.js';

// La fiche A4 recto-verso est le format principal (choisi par défaut).
const FORMATS = {
  a4: {
    label: 'Fiches A4 recto-verso',
    aide: "Une feuille par fiche : le résumé au recto (avec le titre du chapitre s'il y en a un) ; au verso, les références bibliographiques, seulement s'il y en a. Imprimez en recto-verso (« retourner sur le bord long »).",
  },
  livre: {
    label: 'Livre complet',
    aide: 'Couverture, sommaire avec numéros de page, puis une fiche par page. Sous le titre de chaque livre : éditeur, collection, ISBN… (s\'ils sont renseignés).',
  },
};

export async function renderPdf(view) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const sorted = sortBooks(books, order, getPrefs().sort);
  // Une case par fiche terminée (un livre peut en avoir plusieurs, une par chapitre).
  const ready = readyFiches(sorted);
  const keyOf = (b) => `${b.id}:${b.ficheId}`;
  const waiting = sorted.reduce((n, b) => n + partsOf(b).filter((p) => !p.fiche).length, 0);
  const date = formatDate(Date.now());
  let format = FORMATS[getPrefs().pdfFormat] ? getPrefs().pdfFormat : 'a4';

  view.innerHTML = `<section class="page pdf">
    <h1>Télécharger le PDF</h1>
    <fieldset class="segment">
      <legend>Format</legend>
      ${Object.entries(FORMATS)
        .map(([k, f]) => `<label><input type="radio" name="format" value="${k}"${k === format ? ' checked' : ''}><span>${f.label}</span></label>`)
        .join('')}
    </fieldset>
    <p class="petit" id="aide-format"></p>
    <label class="case-simple" id="bloc-presentation"><input type="checkbox" id="presentation"${getPrefs().presentationA4 !== false ? " checked" : ""}>
      <span>Ajouter une <strong>page de présentation</strong> avant chaque résumé : le titre, l'auteur, la date de parution, le genre, l'éditeur, l'ISBN… Si le livre a une couverture, elle est au recto et ces informations au verso.</span></label>
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
               (b) => `<label class="case"><input type="checkbox" value="${esc(keyOf(b))}" checked>
                 <span>${esc(b.title)}${b.ficheCount > 1 ? ` — ${esc([chapterOf(b.fiche, b.ficheIndex, b.ficheCount).label, chapterOf(b.fiche, b.ficheIndex, b.ficheCount).titre].filter(Boolean).join(' : '))}` : ''}${b.author || b.pubDate ? ` <em>— ${[b.author, b.pubDate].filter(Boolean).map(esc).join(' · ')}</em>` : ''}</span></label>`,
             )
             .join('')}`
        : '<p>Aucune fiche terminée pour le moment.</p>'}
      ${waiting
        ? `<p class="petit">${pluralize(waiting, 'fiche à terminer n\'est pas incluse', 'fiches à terminer ne sont pas incluses')}.</p>`
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
    $('#bloc-presentation', view).hidden = format !== 'a4';
  };
  update();
  view.onchange = (e) => {
    if (e.target.id === 'presentation') setPrefs({ presentationA4: e.target.checked });
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
    const chosen = ready.filter((b) => ids.has(keyOf(b)));
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
        const { blob, small } = await pdf.downloadFichesA4(chosen, lastName, { presentation: $("#presentation", view).checked });
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
