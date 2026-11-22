// Vue « Mon livre » : sommaire puis toutes les fiches, comme un livre.
import { deleteBook, getOrder, getSettings, liveBooks, setOrder } from '../db.js';
import { SORTS, filterBooks, sortBooks } from '../books.js';
import { buildFixPrompt } from '../prompt.js';
import { NOTICE_FIELDS } from '../notice.js';
import { copyText } from '../download.js';
import { esc, pluralize } from '../util.js';
import { $, $$, getPrefs, icons, setPrefs, toast } from '../ui.js';

let searchQuery = '';
let sortable;

function renderFiche(book) {
  const f = book.fiche;
  const parts = [];
  if (f.accroche) parts.push(`<p class="accroche">${esc(f.accroche)}</p>`);
  if (f.resume?.length) {
    parts.push(`<h3 class="section">Résumé</h3>${f.resume.map((p) => `<p>${esc(p)}</p>`).join('')}`);
  }
  if (f.idees_cles?.length) {
    parts.push(
      `<h3 class="section">Idées clés</h3>${f.idees_cles
        .map((i) => `<div class="idee"><h4>${esc(i.titre)}</h4><p>${esc(i.texte)}</p></div>`)
        .join('')}`,
    );
  }
  if (f.personnages?.length) {
    parts.push(
      `<h3 class="section">${esc(f.personnages_titre || 'Personnages')}</h3><ul class="personnages">${f.personnages
        .map((p) => `<li><strong>${esc(p.nom)}</strong>${p.role ? ` — ${esc(p.role)}` : ''}</li>`)
        .join('')}</ul>`,
    );
  }
  const bad = (f.citations || []).filter((c) => c.introuvable);
  if (f.citations?.length) {
    parts.push(
      `<h3 class="section">Citations</h3>${f.citations
        .map(
          (c) => `<figure class="citation${c.introuvable ? ' suspecte' : ''}">
            <blockquote><mark>« ${esc(c.texte)} »</mark></blockquote>
            ${c.commentaire ? `<figcaption>${esc(c.commentaire)}</figcaption>` : ''}
            ${c.introuvable ? '<p class="alerte">⚠ Cette citation ne figure pas mot pour mot dans votre texte.</p>' : ''}
          </figure>`,
        )
        .join('')}`,
    );
  }
  if (bad.length) {
    parts.push(
      `<p class="note-alerte">${pluralize(bad.length, 'citation est', 'citations sont')} à vérifier.
      <button class="lien" data-action="corriger" data-id="${esc(book.id)}">Copier une demande de correction pour Claude</button></p>`,
    );
  }
  if (f.a_retenir) parts.push(`<h3 class="section">À retenir</h3><p>${esc(f.a_retenir)}</p>`);
  if (f.pour_qui) parts.push(`<h3 class="section">Pour qui ?</h3><p>${esc(f.pour_qui)}</p>`);
  const notice = NOTICE_FIELDS.filter(([k]) => book[k]);
  if (notice.length) {
    parts.push(
      `<h3 class="section">Notice</h3><dl class="notice-liste">${notice
        .map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(book[k])}</dd>`)
        .join('')}</dl>`,
    );
  }
  if (book.bibliographie?.length) {
    parts.push(`<h3 class="section">Bibliographie</h3><ul class="biblio">${book.bibliographie.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  }
  return parts.join('');
}

function renderChapter(book, index) {
  const meta = [book.author, book.pubDate, book.fiche?.genre].filter(Boolean).map(esc).join(' · ');
  const body = book.fiche
    ? renderFiche(book)
    : `<div class="attente"><p>Cette fiche attend encore son résumé${book.passages.length ? ' (texte enregistré)' : ''}.</p>
       <a class="btn primaire" href="#/livre/${esc(book.id)}">Terminer la fiche</a></div>`;
  return `<article class="chapitre page" id="ch-${esc(book.id)}">
    <p class="chapitre-num">Chapitre ${index + 1}</p>
    <h2>${esc(book.title)}</h2>
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    <hr class="filet">
    ${body}
    <div class="actions">
      ${book.fiche ? `<button class="btn primaire" data-action="fichea4" data-id="${esc(book.id)}">Fiche A4 recto-verso</button>` : ''}
      <a class="btn" href="#/modifier/${esc(book.id)}">Modifier le texte</a>
      <a class="btn" href="#/livre/${esc(book.id)}">Compléter le texte / refaire le résumé</a>
      <button class="btn danger" data-action="supprimer" data-id="${esc(book.id)}">Supprimer</button>
    </div>
  </article>`;
}

export async function renderLivre(view, params) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const prefs = getPrefs();
  const mode = SORTS[prefs.sort] ? prefs.sort : 'perso';

  if (!books.length) {
    view.innerHTML = `<section class="page vide">
      <h1>${esc(settings.titreLivre)}</h1>
      <p>Votre livre est encore vide. Chaque fiche de lecture que vous créerez deviendra un chapitre.</p>
      <a class="btn primaire" href="#/nouveau">${icons.plus} Créer ma première fiche</a>
      <p class="petit">Vous avez déjà des fiches sur un autre appareil ? <a href="#/sauvegarde">Importez votre sauvegarde</a>.</p>
    </section>`;
    return;
  }

  const sorted = sortBooks(books, order, mode);
  const shown = filterBooks(sorted, searchQuery);
  const canDrag = mode === 'perso' && !searchQuery;
  const week = 7 * 24 * 3600 * 1000;
  const reminder = Date.now() - (prefs.lastExport || 0) > week;

  view.innerHTML = `
    ${reminder ? `<div class="bandeau">Pensez à faire une sauvegarde : vos fiches ne sont enregistrées que sur cet appareil. <a href="#/sauvegarde">Sauvegarder</a></div>` : ''}
    <section class="page sommaire">
      <h1>${esc(settings.titreLivre)}</h1>
      <div class="outils">
        <input type="search" id="recherche" placeholder="Rechercher un titre ou un auteur" value="${esc(searchQuery)}" aria-label="Rechercher">
        <label class="tri">Trier par
          <select id="tri">${Object.entries(SORTS)
            .map(([k, v]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>
        </label>
      </div>
      <h2 class="sommaire-titre">Sommaire</h2>
      ${canDrag && shown.length > 1 ? '<p class="petit aide">Pour changer l\'ordre, faites glisser la poignée ⠿ (au doigt ou à la souris).</p>' : ''}
      <ol class="toc${canDrag ? ' deplacable' : ''}" id="toc">
        ${shown
          .map(
            (b, i) => `<li data-id="${esc(b.id)}">
              ${canDrag ? `<span class="poignee" aria-label="Déplacer">${icons.grip}</span>` : ''}
              <a href="#/?ch=${esc(b.id)}"><span class="num">${i + 1}.</span>
                <span class="t">${esc(b.title)}</span>
                <span class="a">${[b.author, b.pubDate].filter(Boolean).map(esc).join(' · ')}</span></a>
              ${b.fiche ? '' : '<span class="badge">à terminer</span>'}
            </li>`,
          )
          .join('')}
      </ol>
      ${shown.length ? '' : '<p>Aucune fiche ne correspond à votre recherche.</p>'}
      <p class="petit">${pluralize(books.length, 'fiche', 'fiches')} dans votre livre.</p>
    </section>
    <div id="chapitres">${shown.map(renderChapter).join('')}</div>`;

  const search = $('#recherche', view);
  search.addEventListener('input', () => {
    searchQuery = search.value;
    const pos = search.selectionStart;
    renderLivre(view, {}).then(() => {
      const s = $('#recherche', view);
      s.focus();
      s.setSelectionRange(pos, pos);
    });
  });
  $('#tri', view).addEventListener('change', (e) => {
    setPrefs({ sort: e.target.value });
    renderLivre(view, {});
  });

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const book = books.find((b) => b.id === btn.dataset.id);
    if (!book) return;
    if (btn.dataset.action === 'supprimer') {
      if (!confirm(`Supprimer définitivement la fiche « ${book.title} » ?`)) return;
      await deleteBook(book.id);
      toast(`La fiche « ${book.title} » a été supprimée.`);
      renderLivre(view, {});
    }
    if (btn.dataset.action === 'fichea4') {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Préparation…';
      try {
        const { downloadFichesA4, slug } = await import('../pdf.js');
        const { small } = await downloadFichesA4([book], `fiche-${slug(book.title)}.pdf`);
        toast(
          small.length
            ? 'Fiche A4 téléchargée ✓ Le texte est long : il est imprimé en petits caractères. Choisissez la longueur « Court » ou « Moyen » pour une fiche plus lisible.'
            : 'Fiche A4 téléchargée ✓ Imprimez-la en recto-verso (retourner sur le bord long).',
          small.length ? 'attention' : 'ok',
          9000,
        );
      } catch (err) {
        console.error(err);
        toast("La fiche n'a pas pu être créée. Réessayez.", 'erreur');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
    if (btn.dataset.action === 'corriger') {
      const bad = book.fiche.citations.filter((c) => c.introuvable).map((c) => c.texte);
      const ok = await copyText(buildFixPrompt({ badCitations: bad }));
      toast(ok ? 'Demande copiée. Collez-la dans la conversation Claude de ce livre, puis recollez la réponse dans « Compléter le texte / refaire le résumé ».' : 'La copie a échoué.', ok ? 'ok' : 'erreur', 8000);
    }
  };

  sortable?.destroy();
  sortable = null;
  if (canDrag && shown.length > 1) {
    const { default: Sortable } = await import('sortablejs');
    sortable = Sortable.create($('#toc', view), {
      handle: '.poignee',
      animation: 160,
      ghostClass: 'fantome',
      // Même comportement à la souris et au doigt (Chrome, Samsung Internet).
      forceFallback: true,
      fallbackTolerance: 3,
      onEnd: async () => {
        const ids = $$('#toc li', view).map((li) => li.dataset.id);
        await setOrder(ids);
        renderLivre(view, {});
      },
    });
  }

  if (params.ch) {
    requestAnimationFrame(() => document.getElementById('ch-' + params.ch)?.scrollIntoView({ block: 'start' }));
  }
}
