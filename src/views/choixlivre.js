// Vue « Nouvelle fiche » : d'abord choisir le livre, puis on ouvre ses écrans (le texte, la demande…).
// #/fiche : la liste des livres. #/fiche/<livre>?cree=1 : juste après « Nouveau livre ».
import { getBook, getOrder, liveBooks } from '../db.js';
import { partsOf } from '../fiches.js';
import { sortBooks } from '../books.js';
import { esc, pluralize } from '../util.js';
import { $, $$, icons } from '../ui.js';

/** Minuscules, sans accents : « Misérables » se trouve en tapant « miserables ». */
const plier = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const couv = (b) =>
  b.cover
    ? `<img src="${esc(b.cover)}" alt="" loading="lazy">`
    : `<span class="couv-vide">${esc((b.title || '?').trim().charAt(0).toUpperCase())}</span>`;

export async function renderChoixLivre(view, params) {
  // Livre tout juste ajouté : on propose d'écrire sa première fiche.
  if (params.id && params.cree) {
    const book = await getBook(params.id);
    if (book) {
      view.innerHTML = `<section class="page choix-livre">
        <div class="livre-ajoute">
          <span class="toc-couv">${couv(book)}</span>
          <div>
            <h1>« ${esc(book.title)} » est dans votre bibliothèque ✓</h1>
            <p>Voulez-vous écrire sa première fiche maintenant ?</p>
            <div class="rangee">
              <a class="btn primaire" href="#/livre/${esc(book.id)}?f=nouvelle">${icons.plus} Écrire la première fiche</a>
              <a class="btn" href="#/?ch=${esc(book.id)}">Plus tard</a>
            </div>
          </div>
        </div>
      </section>`;
      return;
    }
  }

  const [books, order] = await Promise.all([liveBooks(), getOrder()]);
  if (!books.length) {
    view.innerHTML = `<section class="page vide">
      <h1>Nouvelle fiche</h1>
      <p>Une fiche résume un livre (ou un chapitre). Commencez par ajouter le livre à votre bibliothèque.</p>
      <a class="btn primaire" href="#/nouveau">${icons.plus} Ajouter un livre</a>
    </section>`;
    return;
  }
  const sorted = sortBooks(books, order, 'perso');
  view.innerHTML = `<section class="page choix-livre">
    <h1>Nouvelle fiche</h1>
    <p>Pour quel livre ?</p>
    ${books.length > 6 ? '<input type="search" id="chercher-livre" placeholder="Chercher un livre (titre ou auteur)" aria-label="Chercher un livre">' : ''}
    <ul class="liste-livres" id="liste-livres">
      ${sorted
        .map((b) => {
          const n = partsOf(b).length;
          return `<li data-cle="${esc(plier(`${b.title} ${b.author || ''}`))}">
            <a href="#/livre/${esc(b.id)}?f=nouvelle">
              <span class="toc-couv">${couv(b)}</span>
              <span class="choix-texte"><span class="t">${esc(b.title)}</span>
                <span class="a">${[b.author, n ? pluralize(n, 'fiche', 'fiches') : 'pas encore de fiche'].filter(Boolean).map(esc).join(' · ')}</span></span>
              <span class="choix-fleche" aria-hidden="true">›</span>
            </a>
          </li>`;
        })
        .join('')}
    </ul>
    <p class="petit" id="aucun-livre" hidden>Aucun livre ne correspond.</p>
    <p class="choix-autre">Le livre n'est pas dans la liste ? <a class="btn" href="#/nouveau">${icons.plus} Ajouter un nouveau livre</a></p>
  </section>`;

  const search = $('#chercher-livre', view);
  search?.addEventListener('input', () => {
    const q = plier(search.value);
    let shown = 0;
    for (const li of $$('#liste-livres li', view)) {
      li.hidden = !!q && !li.dataset.cle.includes(q);
      if (!li.hidden) shown++;
    }
    $('#aucun-livre', view).hidden = shown > 0;
  });
}
