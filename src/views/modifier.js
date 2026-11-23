// Vue « Modifier » : retoucher à la main le texte d'une fiche (#/modifier/<livre>?f=<fiche>) et la notice du livre.
import { getBook, saveBook } from '../db.js';
import { checkCitations, stripQuotes } from '../prompt.js';
import { NOTICE_FIELDS } from '../fichea4.js';
import { partsOf, withPart } from '../fiches.js';
import { esc } from '../util.js';
import { remplirHtml, wireRemplir } from './remplir.js';
import { $, $$, toast } from '../ui.js';

const LISTS = {
  idees_cles: { titre: 'Idées clés', a: ['titre', 'Titre'], b: ['texte', 'Explication'] },
  personnages: { titre: 'Personnages ou notions', a: ['nom', 'Nom'], b: ['role', 'Rôle / explication'] },
  citations: { titre: 'Citations', a: ['texte', 'Citation (mot pour mot)'], b: ['commentaire', 'Commentaire'] },
};

const emptyFiche = () => ({
  partie: '', chapitre: '', genre: '', accroche: '', resume: [], idees_cles: [], personnages_titre: 'Personnages',
  personnages: [], citations: [], a_retenir: '', pour_qui: '',
});

function row(listName, item = {}) {
  const L = LISTS[listName];
  return `<div class="ligne" data-list="${listName}">
    <label>${L.a[1]}<textarea rows="${listName === 'citations' ? 3 : 1}" data-f="${L.a[0]}">${esc(item[L.a[0]])}</textarea></label>
    <label>${L.b[1]}<textarea rows="2" data-f="${L.b[0]}">${esc(item[L.b[0]])}</textarea></label>
    <button type="button" class="lien danger" data-retirer>Retirer</button>
  </div>`;
}

export async function renderModifier(view, params) {
  const book = await getBook(params.id);
  if (!book) {
    view.innerHTML = '<section class="page"><p>Cette fiche n\'existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  const parts = partsOf(book);
  const part = parts.find((p) => p.id === params.f) || (params.f ? null : parts.find((p) => p.fiche)) || null;
  if (params.f && !part) {
    view.innerHTML = '<section class="page"><p>Cette fiche n’existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  // Sans fiche terminée : seuls le titre, l'auteur et la notice du livre sont modifiables.
  const withFiche = !!part?.fiche;
  const f = { ...emptyFiche(), ...(part?.fiche || {}) };
  const num = parts.length > 1 && part ? ` — fiche ${parts.indexOf(part) + 1} sur ${parts.length}` : '';

  view.innerHTML = `<form class="page modifier" id="form">
    <h1>Modifier « ${esc(book.title)} »${esc(num)}</h1>
    ${parts.length > 1 ? '<p class="petit">Le titre, l’auteur, la date et la notice sont communs à toutes les fiches de ce livre.</p>' : ''}
    <div class="champs">
      <label>Titre<input name="title" required value="${esc(book.title)}"></label>
      <label>Auteur<input name="author" value="${esc(book.author)}"></label>
      <label>Date de parution<input name="pubDate" value="${esc(book.pubDate)}"></label>
      ${withFiche ? `<label>Genre<input name="genre" value="${esc(f.genre)}"></label>
      <label>Partie du livre <span class="petit">(facultatif, par exemple « Première partie. Les origines »)</span><input name="partie" list="parties-livre" value="${esc(f.partie)}" autocomplete="off"></label>
      <datalist id="parties-livre">${[...new Set(parts.map((p) => p.fiche?.partie).filter(Boolean))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <label>Titre du chapitre <span class="petit">(en haut de la fiche A4)</span><input name="chapitre" value="${esc(f.chapitre)}"></label>` : ''}
    </div>
    <fieldset>
      <legend>Informations sur le livre <span class="petit">(page de présentation, pas dans les fiches ; facultatif)</span></legend>
      ${remplirHtml()}
      <div class="champs">
        ${NOTICE_FIELDS.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(book[k])}"${k === 'isbn' ? ' inputmode="numeric"' : ''}></label>`).join('')}
      </div>
      ${part ? `<label class="bloc">Bibliographie de ce chapitre <span class="petit">(une référence par ligne ; au verso de la fiche A4 de ce chapitre)</span>
        <textarea name="bibliographieChapitre" rows="5">${esc((part.bibliographie || []).join('\n'))}</textarea></label>` : ''}
      ${!part || book.bibliographie?.length
        ? `<label class="bloc">${part ? 'Bibliographie générale du livre' : 'Bibliographie'} <span class="petit">(une référence par ligne${part ? ' ; pour la mettre dans ce chapitre, déplacez les lignes dans le cadre au-dessus' : ''})</span>
        <textarea name="bibliographie" rows="5">${esc((book.bibliographie || []).join('\n'))}</textarea></label>`
        : ''}
    </fieldset>
    ${withFiche ? `<label class="bloc">Accroche (une phrase)<textarea name="accroche" rows="2">${esc(f.accroche)}</textarea></label>
    <label class="bloc">Résumé <span class="petit">(une ligne vide entre les paragraphes)</span>
      <textarea name="resume" rows="10">${esc(f.resume.join('\n\n'))}</textarea></label>
    ${Object.entries(LISTS)
      .map(
        ([name, L]) => `<fieldset class="liste">
          <legend>${L.titre}</legend>
          ${name === 'personnages'
            ? `<label class="petit">Titre de la rubrique
                <select name="personnages_titre">
                  ${['Personnages', 'Notions clés'].map((t) => `<option${t === f.personnages_titre ? ' selected' : ''}>${t}</option>`).join('')}
                </select></label>`
            : ''}
          <div class="lignes" data-lignes="${name}">${f[name].map((it) => row(name, it)).join('')}</div>
          <button type="button" class="btn" data-ajouter="${name}">+ Ajouter</button>
        </fieldset>`,
      )
      .join('')}
    <label class="bloc">À retenir<textarea name="a_retenir" rows="4">${esc(f.a_retenir)}</textarea></label>
    <label class="bloc">Pour qui ?<textarea name="pour_qui" rows="3">${esc(f.pour_qui)}</textarea></label>` : ''}
    <div class="rangee collante">
      <a class="btn" href="#/?ch=${esc(book.id)}${part ? `&fi=${esc(part.id)}` : ''}">Annuler</a>
      <button class="btn primaire" type="submit">Enregistrer</button>
    </div>
  </form>`;

  const form = $('#form', view);
  wireRemplir(form, {
    field: (k) => form.elements[k],
    context: () => ({ title: form.elements.title.value, author: form.elements.author.value }),
  });
  // Entrée dans la case « lien ou ISBN » : lancer la recherche, pas enregistrer le formulaire.
  $('#remplir-source', form).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#remplir-btn', form).click();
    }
  });
  form.addEventListener('click', (e) => {
    const add = e.target.closest('[data-ajouter]');
    if (add) {
      const name = add.dataset.ajouter;
      $(`[data-lignes="${name}"]`, form).insertAdjacentHTML('beforeend', row(name));
      $(`[data-lignes="${name}"] .ligne:last-child textarea`, form).focus();
    }
    const rm = e.target.closest('[data-retirer]');
    if (rm) rm.closest('.ligne').remove();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = (n) => form.elements[n].value.trim();
    // Liste « une référence par ligne » (undefined si le cadre n'est pas affiché).
    const lines = (n) => form.elements[n]?.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const bookFields = {
      ...book,
      title: val('title') || book.title,
      author: val('author'),
      pubDate: val('pubDate'),
      ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, val(k)])),
      bibliographie: lines('bibliographie') ?? book.bibliographie ?? [],
    };
    const chap = part ? { bibliographie: lines('bibliographieChapitre') ?? part.bibliographie ?? [] } : {};
    const back = '#/?ch=' + book.id + (part ? '&fi=' + part.id : '');
    if (!withFiche) {
      await saveBook(part ? withPart(bookFields, { ...part, ...chap }) : bookFields);
      toast('Modifications enregistrées ✓', 'ok');
      location.hash = back;
      return;
    }
    const fiche = {
      genre: val('genre'),
      partie: val('partie'),
      chapitre: val('chapitre'),
      accroche: val('accroche'),
      resume: val('resume').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
      personnages_titre: val('personnages_titre'),
      a_retenir: val('a_retenir'),
      pour_qui: val('pour_qui'),
    };
    for (const [name, L] of Object.entries(LISTS)) {
      fiche[name] = $$(`[data-lignes="${name}"] .ligne`, form)
        .map((li) => ({
          [L.a[0]]: $(`[data-f="${L.a[0]}"]`, li).value.trim(),
          [L.b[0]]: $(`[data-f="${L.b[0]}"]`, li).value.trim(),
        }))
        .filter((x) => x[L.a[0]] || x[L.b[0]]);
    }
    fiche.citations = fiche.citations.map((c) => ({ ...c, texte: stripQuotes(c.texte) }));
    checkCitations(fiche, part.passages);
    await saveBook(withPart(bookFields, { ...part, ...chap, fiche, ficheEditedByHand: true }));
    toast('Modifications enregistrées ✓', 'ok');
    location.hash = back;
  });
}
