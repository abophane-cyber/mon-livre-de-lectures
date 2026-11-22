// Vue « Mon livre » : sommaire puis toutes les fiches, comme un livre.
import { deleteBook, getOrder, getSettings, liveBooks, saveBook, setOrder } from '../db.js';
import { chapterOf, flatten, isComplete, partsOf, readyFiches, withoutPart } from '../fiches.js';
import { SORTS, filterBooks, sortBooks } from '../books.js';
import { buildFixPrompt } from '../prompt.js';
import { NOTICE_FIELDS } from '../notice.js';
import { copyText } from '../download.js';
import { esc, pluralize } from '../util.js';
import { $, $$, currentIa, getPrefs, icons, setPrefs, toast } from '../ui.js';

let searchQuery = '';
let sortable;

/** Le contenu d'une fiche (book = livre « aplati » sur cette fiche). */
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
      <button class="lien" data-action="corriger" data-id="${esc(book.id)}" data-fi="${esc(book.ficheId)}">Copier une demande de correction pour ${esc(currentIa().label)}</button></p>`,
    );
  }
  if (f.a_retenir) parts.push(`<h3 class="section">À retenir</h3><p>${esc(f.a_retenir)}</p>`);
  if (f.pour_qui) parts.push(`<h3 class="section">Pour qui ?</h3><p>${esc(f.pour_qui)}</p>`);
  return parts.join('');
}

/** Notice et bibliographie : une seule fois par livre, après toutes ses fiches. */
function renderNotice(book) {
  const parts = [];
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

function renderPart(book, part, i, n) {
  const fb = flatten(book, part);
  const q = `${esc(book.id)}?f=${esc(part.id)}`;
  const ch = chapterOf(part.fiche, i, n);
  const body = part.fiche
    ? renderFiche(fb)
    : `<div class="attente"><p>Cette fiche attend encore son résumé${part.passages?.length ? ' (texte enregistré)' : ''}.</p>
       <a class="btn primaire" href="#/livre/${q}">Terminer la fiche</a></div>`;
  return `<section class="fiche-partie" id="fi-${esc(part.id)}">
    ${ch.label ? `<p class="partie-num">${esc(ch.label)}</p>` : ''}
    ${ch.titre ? `<h3 class="chapitre-resume">${esc(ch.titre)}</h3>` : ''}
    ${body}
    <div class="actions">
      ${part.fiche ? `<button class="btn primaire" data-action="fichea4" data-id="${esc(book.id)}" data-fi="${esc(part.id)}">Fiche A4</button>` : ''}
      ${part.fiche ? `<a class="btn" href="#/modifier/${q}">Modifier le texte</a>` : ''}
      <a class="btn" href="#/livre/${q}">Compléter le texte / refaire le résumé</a>
      ${n > 1 ? `<button class="btn danger" data-action="supprimer-fiche" data-id="${esc(book.id)}" data-fi="${esc(part.id)}">Supprimer cette fiche</button>` : ''}
    </div>
  </section>`;
}

function renderBook(book) {
  const parts = partsOf(book);
  const genre = parts.find((p) => p.fiche?.genre)?.fiche.genre;
  const meta = [book.author, book.pubDate, genre].filter(Boolean).map(esc).join(' · ');
  const ready = parts.filter((p) => p.fiche).length;
  return `<article class="chapitre page" id="ch-${esc(book.id)}">
    <h2>${esc(book.title)}</h2>
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    <hr class="filet">
    ${parts.length ? parts.map((p, i) => renderPart(book, p, i, parts.length)).join('') : '<p class="attente">Ce livre n\'a pas encore de fiche.</p>'}
    ${renderNotice(book)}
    <div class="actions actions-livre">
      <a class="btn primaire" href="#/livre/${esc(book.id)}?f=nouvelle">+ Ajouter une fiche (autre chapitre)</a>
      ${ready > 1 ? `<button class="btn" data-action="fichea4" data-id="${esc(book.id)}">Toutes les fiches A4 du livre (${ready})</button>` : ''}
      ${!parts.some((p) => p.fiche) ? `<a class="btn" href="#/modifier/${esc(book.id)}">Modifier titre et notice</a>` : ''}
      <button class="btn danger" data-action="supprimer" data-id="${esc(book.id)}">${parts.length > 1 ? 'Supprimer le livre et ses fiches' : 'Supprimer'}</button>
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
                <span class="a">${[b.author, b.pubDate, partsOf(b).length > 1 ? pluralize(partsOf(b).length, 'fiche', 'fiches') : ''].filter(Boolean).map(esc).join(' · ')}</span></a>
              ${isComplete(b) ? '' : '<span class="badge">à terminer</span>'}
            </li>`,
          )
          .join('')}
      </ol>
      ${shown.length ? '' : '<p>Aucune fiche ne correspond à votre recherche.</p>'}
      <p class="petit">${pluralize(books.length, 'livre', 'livres')} et ${pluralize(books.reduce((n, b) => n + partsOf(b).length, 0), 'fiche', 'fiches')} dans votre livre de lectures.</p>
    </section>
    <div id="chapitres">${shown.map((b) => renderBook(b)).join('')}</div>`;

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
    const part = btn.dataset.fi ? partsOf(book).find((p) => p.id === btn.dataset.fi) : null;
    if (btn.dataset.action === 'supprimer') {
      const n = partsOf(book).length;
      if (!confirm(n > 1 ? `Supprimer définitivement le livre « ${book.title} » et ses ${n} fiches ?` : `Supprimer définitivement la fiche « ${book.title} » ?`)) return;
      await deleteBook(book.id);
      toast(`« ${book.title} » a été supprimé.`);
      renderLivre(view, {});
    }
    if (btn.dataset.action === 'supprimer-fiche' && part) {
      const i = partsOf(book).indexOf(part) + 1;
      const c = chapterOf(part.fiche, i - 1, partsOf(book).length);
      const nom = c.titre ? `« ${c.titre} »` : `n° ${i}`;
      if (!confirm(`Supprimer définitivement la fiche ${nom} du livre « ${book.title} » ? Les autres fiches du livre sont gardées.`)) return;
      await saveBook(withoutPart(book, part.id));
      toast(`La fiche ${nom} a été supprimée.`);
      renderLivre(view, { ch: book.id });
    }
    if (btn.dataset.action === 'fichea4') {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Préparation…';
      try {
        const { downloadFichesA4, slug } = await import('../pdf.js');
        const list = part ? [flatten(book, part)] : readyFiches([book]);
        const name = part && partsOf(book).length > 1 ? `fiche-${slug(book.title)}-${partsOf(book).indexOf(part) + 1}.pdf` : `fiche-${slug(book.title)}.pdf`;
        const { small } = await downloadFichesA4(list, name, { presentation: getPrefs().presentationA4 !== false });
        toast(
          small.length
            ? 'Fiche A4 téléchargée ✓ Le texte est long : il est imprimé en petits caractères. Choisissez la longueur « Court » ou « Moyen » pour une fiche plus lisible.'
            : 'Fiche A4 téléchargée ✓ S’il y a des références au verso, imprimez en recto-verso (retourner sur le bord long).',
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
    if (btn.dataset.action === 'corriger' && part?.fiche) {
      const bad = part.fiche.citations.filter((c) => c.introuvable).map((c) => c.texte);
      const ok = await copyText(buildFixPrompt({ badCitations: bad }));
      toast(ok ? `Demande copiée. Collez-la dans la conversation ${currentIa().label} de ce livre, puis recollez la réponse dans « Compléter le texte / refaire le résumé ».` : 'La copie a échoué.', ok ? 'ok' : 'erreur', 8000);
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
    const target = (params.fi && document.getElementById('fi-' + params.fi)) || document.getElementById('ch-' + params.ch);
    requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
  }
}
