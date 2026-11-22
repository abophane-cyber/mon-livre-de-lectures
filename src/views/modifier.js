// Vue « Modifier » : retoucher à la main le texte d'une fiche.
import { getBook, saveBook } from '../db.js';
import { checkCitations, stripQuotes } from '../prompt.js';
import { esc } from '../util.js';
import { $, $$, toast } from '../ui.js';

const LISTS = {
  idees_cles: { titre: 'Idées clés', a: ['titre', 'Titre'], b: ['texte', 'Explication'] },
  personnages: { titre: 'Personnages ou notions', a: ['nom', 'Nom'], b: ['role', 'Rôle / explication'] },
  citations: { titre: 'Citations', a: ['texte', 'Citation (mot pour mot)'], b: ['commentaire', 'Commentaire'] },
};

const emptyFiche = () => ({
  genre: '', accroche: '', resume: [], idees_cles: [], personnages_titre: 'Personnages',
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
  const f = { ...emptyFiche(), ...(book.fiche || {}) };

  view.innerHTML = `<form class="page modifier" id="form">
    <h1>Modifier « ${esc(book.title)} »</h1>
    <div class="champs">
      <label>Titre<input name="title" required value="${esc(book.title)}"></label>
      <label>Auteur<input name="author" value="${esc(book.author)}"></label>
      <label>Date de parution<input name="pubDate" value="${esc(book.pubDate)}"></label>
      <label>Genre<input name="genre" value="${esc(f.genre)}"></label>
    </div>
    <label class="bloc">Accroche (une phrase)<textarea name="accroche" rows="2">${esc(f.accroche)}</textarea></label>
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
    <label class="bloc">Pour qui ?<textarea name="pour_qui" rows="3">${esc(f.pour_qui)}</textarea></label>
    <div class="rangee collante">
      <a class="btn" href="#/?ch=${esc(book.id)}">Annuler</a>
      <button class="btn primaire" type="submit">Enregistrer</button>
    </div>
  </form>`;

  const form = $('#form', view);
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
    const fiche = {
      genre: val('genre'),
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
    checkCitations(fiche, book.passages);
    await saveBook({
      ...book,
      title: val('title') || book.title,
      author: val('author'),
      pubDate: val('pubDate'),
      fiche,
      ficheEditedByHand: true,
    });
    toast('Modifications enregistrées ✓', 'ok');
    location.hash = '#/?ch=' + book.id;
  });
}
