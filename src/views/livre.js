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

// Fiches dépliées / repliées (gardé pendant la session). Par défaut : dépliée seulement
// si c'est la seule fiche du livre.
const OPEN_KEY = 'mll:fiches-ouvertes';
const openState = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}');
  } catch {
    return {};
  }
})();
function setOpen(id, open) {
  openState[id] = open;
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(openState));
  } catch {
    /* rien */
  }
}
const isOpen = (id, n) => openState[id] ?? n === 1;

export const FILTRES = { tous: 'Tous les livres', encours: 'En cours', termines: 'Terminés' };
/** Livres terminés : marqués « Livre terminé » et sans fiche en attente. */
export const isFinished = (b) => !!b.termine && isComplete(b);

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
  if (book.bibliographie?.length) {
    const titre = partsOf(book).some((p) => p.bibliographie?.length) || partsOf(book).length > 1 ? 'Bibliographie générale du livre' : 'Bibliographie';
    parts.push(`<h3 class="section">${titre}</h3><ul class="biblio">${book.bibliographie.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  }
  return parts.join('');
}

/** Notice : informations générales du livre (éditeur, ISBN…), sous son titre, pas dans une fiche. */
function renderInfos(book) {
  const notice = NOTICE_FIELDS.filter(([k]) => k !== 'dateLecture' && book[k]);
  if (!notice.length) return '';
  return `<dl class="notice-liste infos-livre">${notice.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(book[k])}</dd>`).join('')}</dl>`;
}

/** Bibliographie générale : une seule fois par livre, après toutes ses fiches. */
function renderNotice(book) {
  const parts = [];
  if (book.bibliographie?.length) {
    const titre = partsOf(book).some((p) => p.bibliographie?.length) || partsOf(book).length > 1 ? 'Bibliographie générale du livre' : 'Bibliographie';
    parts.push(`<h3 class="section">${titre}</h3><ul class="biblio">${book.bibliographie.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
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
  const tete = ch.label || ch.titre ? '' : 'Fiche';
  return `<details class="fiche-partie" id="fi-${esc(part.id)}" data-fi="${esc(part.id)}"${isOpen(part.id, n) ? ' open' : ''}>
    <summary class="fiche-tete">
      ${ch.label ? `<span class="partie-num">${esc(ch.label)}</span>` : ''}
      ${ch.titre ? `<span class="chapitre-resume">${esc(ch.titre)}</span>` : ''}
      ${tete ? `<span class="chapitre-resume">${tete}</span>` : ''}
      ${part.fiche ? '' : '<span class="badge">à terminer</span>'}
    </summary>
    <div class="fiche-corps">
    ${body}
    <div class="actions">
      ${part.fiche ? `<button class="btn primaire" data-action="fichea4" data-id="${esc(book.id)}" data-fi="${esc(part.id)}">Fiche A4</button>` : ''}
      ${part.fiche ? `<a class="btn" href="#/modifier/${q}">Modifier le texte</a>` : ''}
      <a class="btn" href="#/livre/${q}">Compléter (suite du chapitre) / refaire le résumé</a>
      <button class="btn danger" data-action="supprimer-fiche" data-id="${esc(book.id)}" data-fi="${esc(part.id)}">Supprimer cette fiche</button>
    </div>
    </div>
  </details>`;
}

/** Sommaire : les chapitres (fiches) du livre, sous son titre. */
function tocChapters(book) {
  const parts = partsOf(book);
  const items = parts
    .map((p, i) => ({ p, ch: chapterOf(p.fiche, i, parts.length) }))
    .filter(({ ch }) => ch.label);
  if (!items.length) return '';
  return `<p class="sommaire-titre toc-sommaire">Sommaire</p><ol class="toc-chapitres">${items
    .map(({ p, ch }) => `<li><a href="#/?ch=${esc(book.id)}&fi=${esc(p.id)}"><span class="c">${esc(ch.label)}</span>${ch.titre ? ` ${esc(ch.titre)}` : ''}</a></li>`)
    .join('')}</ol>`;
}

/** Résumé général du livre (synthèse de toutes ses fiches), replié par défaut, avant les chapitres. */
function renderGeneralBlock(book) {
  const g = book.resumeGeneral;
  if (!g?.sections?.length) return '';
  const key = `g-${book.id}`;
  const body = g.sections
    .map((s) => `${s.titre ? `<h4 class="intertitre">${esc(s.titre)}</h4>` : ''}${s.paragraphes.map((p) => `<p>${esc(p)}</p>`).join('')}`)
    .join('');
  const idees = g.idees?.length
    ? `<h3 class="section">Idées clés du livre</h3>${g.idees.map((i) => `<div class="idee"><h4>${esc(i.titre)}</h4>${i.texte ? `<p>${esc(i.texte)}</p>` : ''}</div>`).join('')}`
    : '';
  return `<details class="fiche-partie resume-general" id="fi-${esc(key)}" data-fi="${esc(key)}"${isOpen(key, 2) ? ' open' : ''}>
    <summary class="fiche-tete">
      <span class="partie-num">Tout le livre · ${pluralize(g.pages, 'page', 'pages')}</span>
      <span class="chapitre-resume">Résumé général</span>
    </summary>
    <div class="fiche-corps">
      ${body}
      ${idees}
      <div class="actions">
        <button class="btn primaire" data-action="generalA4" data-id="${esc(book.id)}">Résumé général A4</button>
        <a class="btn" href="#/general/${esc(book.id)}">Refaire (autre longueur, nouvelles fiches)</a>
        <button class="btn danger" data-action="supprimer-general" data-id="${esc(book.id)}">Supprimer le résumé général</button>
      </div>
    </div>
  </details>`;
}

function renderBook(book) {
  const parts = partsOf(book);
  const genre = parts.find((p) => p.fiche?.genre)?.fiche.genre;
  const meta = [book.author, book.pubDate, genre].filter(Boolean).map(esc).join(' · ');
  const ready = parts.filter((p) => p.fiche).length;
  return `<article class="chapitre page" id="ch-${esc(book.id)}">
    <h2>${esc(book.title)}</h2>
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    ${renderInfos(book)}
    <hr class="filet">
    ${parts.length > 1
      ? `<div class="replier"><button class="lien" data-action="deplier" data-id="${esc(book.id)}">Tout déplier</button> · <button class="lien" data-action="replier" data-id="${esc(book.id)}">Tout replier</button></div>`
      : ''}
    ${renderGeneralBlock(book)}
    ${parts.length ? parts.map((p, i) => renderPart(book, p, i, parts.length)).join('') : '<p class="attente">Ce livre n\'a pas encore de fiche.</p>'}
    ${renderNotice(book)}
    ${book.termine ? `<p class="livre-termine">✓ Livre terminé${book.dateLecture ? ` — lu le ${esc(book.dateLecture)}` : ''}</p>` : ''}
    <div class="actions actions-livre">
      ${isComplete(book) && !book.termine ? `<button class="btn primaire" data-action="terminer" data-id="${esc(book.id)}">✓ Livre terminé</button>` : ''}
      ${book.termine
        ? `<button class="btn" data-action="rouvrir" data-id="${esc(book.id)}">Rouvrir le livre (ajouter une fiche)</button>`
        : `<a class="btn${isComplete(book) ? '' : ' primaire'}" href="#/livre/${esc(book.id)}?f=nouvelle">+ Ajouter une fiche${parts.length ? " (autre chapitre)" : ""}</a>`}
      ${ready > 1 ? `<button class="btn" data-action="fichea4" data-id="${esc(book.id)}">Toutes les fiches A4 du livre (${ready})</button>` : ''}
      ${ready && !book.resumeGeneral ? `<a class="btn" href="#/general/${esc(book.id)}">Résumé général de toutes les fiches</a>` : ''}
      ${!parts.some((p) => p.fiche) ? `<a class="btn" href="#/modifier/${esc(book.id)}">Modifier titre et notice</a>` : ''}
      <button class="btn danger" data-action="supprimer" data-id="${esc(book.id)}">${parts.length > 1 ? 'Supprimer le livre et ses fiches' : parts.length ? 'Supprimer le livre et sa fiche' : 'Supprimer le livre'}</button>
    </div>
  </article>`;
}

export async function renderLivre(view, params) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const prefs = getPrefs();
  const mode = SORTS[prefs.sort] ? prefs.sort : 'perso';
  const filtre = FILTRES[prefs.filtre] ? prefs.filtre : 'tous';
  if (params.fi) setOpen(params.fi, true);

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
  const shown = filterBooks(sorted, searchQuery).filter((b) =>
    filtre === 'termines' ? isFinished(b) : filtre === 'encours' ? !isFinished(b) : true,
  );
  const canDrag = mode === 'perso' && !searchQuery && filtre === 'tous';
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
        <label class="tri">Afficher
          <select id="filtre">${Object.entries(FILTRES)
            .map(([k, v]) => `<option value="${k}"${k === filtre ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>
        </label>
      </div>
      ${canDrag && shown.length > 1 ? '<p class="petit aide">Pour changer l\'ordre, faites glisser la poignée ⠿ (au doigt ou à la souris).</p>' : ''}
      <ol class="toc${canDrag ? ' deplacable' : ''}" id="toc">
        ${shown
          .map(
            (b, i) => `<li data-id="${esc(b.id)}">
              ${canDrag ? `<span class="poignee" aria-label="Déplacer">${icons.grip}</span>` : ''}
              <a href="#/?ch=${esc(b.id)}"><span class="num">${i + 1}.</span>
                <span class="t">${esc(b.title)}</span>
                <span class="a">${[b.author, b.pubDate].filter(Boolean).map(esc).join(' · ')}</span></a>
              ${isComplete(b) ? (b.termine ? '<span class="badge badge-ok">terminé ✓</span>' : '') : '<span class="badge">à terminer</span>'}
              ${tocChapters(b)}
            </li>`,
          )
          .join('')}
      </ol>
      ${shown.length
        ? ''
        : searchQuery
          ? '<p>Aucune fiche ne correspond à votre recherche.</p>'
          : `<p>${filtre === 'termines' ? 'Aucun livre terminé pour l’instant. En bas d’un livre dont toutes les fiches sont faites, touchez « ✓ Livre terminé ».' : 'Aucun livre en cours : ils sont tous terminés.'}</p>`}
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
  $('#filtre', view).addEventListener('change', (e) => {
    setPrefs({ filtre: e.target.value });
    renderLivre(view, {});
  });
  for (const d of $$('details.fiche-partie', view)) {
    d.addEventListener('toggle', () => setOpen(d.dataset.fi, d.open));
  }

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const book = books.find((b) => b.id === btn.dataset.id);
    if (!book) return;
    const part = btn.dataset.fi ? partsOf(book).find((p) => p.id === btn.dataset.fi) : null;
    if (btn.dataset.action === 'deplier' || btn.dataset.action === 'replier') {
      const open = btn.dataset.action === 'deplier';
      for (const d of $$(`#ch-${CSS.escape(book.id)} details.fiche-partie`, view)) d.open = open;
    }
    if (btn.dataset.action === 'supprimer') {
      const n = partsOf(book).length;
      if (!confirm(n > 1 ? `Supprimer définitivement le livre « ${book.title} » et ses ${n} fiches ?` : n ? `Supprimer définitivement le livre « ${book.title} » et sa fiche ?` : `Supprimer définitivement le livre « ${book.title} » ?`)) return;
      await deleteBook(book.id);
      toast(`« ${book.title} » a été supprimé.`);
      renderLivre(view, {});
    }
    if (btn.dataset.action === 'supprimer-general') {
      if (!confirm(`Supprimer le résumé général de « ${book.title} » ? Les fiches des chapitres sont gardées.`)) return;
      await saveBook({ ...book, resumeGeneral: null });
      toast('Résumé général supprimé.');
      renderLivre(view, { ch: book.id });
    }
    if (btn.dataset.action === 'generalA4' && book.resumeGeneral) {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Préparation…';
      try {
        const { downloadGeneralA4, slug } = await import('../pdf.js');
        const { pages } = await downloadGeneralA4(book, `resume-general-${slug(book.title)}.pdf`);
        const voulu = book.resumeGeneral.pages;
        toast(
          pages === voulu
            ? `Résumé général A4 téléchargé ✓ (${pluralize(pages, 'page', 'pages')}).`
            : `Résumé général A4 téléchargé ✓ Il fait ${pluralize(pages, 'page', 'pages')} au lieu de ${voulu} : ${pages > voulu ? 'le texte de l’IA est un peu long' : 'le texte de l’IA est un peu court'}. Vous pouvez le refaire si besoin.`,
          pages === voulu ? 'ok' : 'attention',
          9000,
        );
      } catch (err) {
        console.error(err);
        toast("Le PDF n'a pas pu être créé. Réessayez.", 'erreur');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
    if (btn.dataset.action === 'terminer') {
      // La date de lecture (fiche A4) est remplie avec la date du jour si elle était vide.
      const dateLecture = book.dateLecture || new Date().toLocaleDateString('fr-FR');
      await saveBook({ ...book, termine: Date.now(), dateLecture });
      toast(`Bravo ! « ${book.title} » est terminé ✓`, 'ok', 6000);
      renderLivre(view, { ch: book.id });
    }
    if (btn.dataset.action === 'rouvrir') {
      await saveBook({ ...book, termine: 0 });
      toast(`« ${book.title} » est de nouveau en cours : vous pouvez lui ajouter des fiches.`, 'ok', 6000);
      renderLivre(view, { ch: book.id });
    }
    if (btn.dataset.action === 'supprimer-fiche' && part) {
      const i = partsOf(book).indexOf(part) + 1;
      const c = chapterOf(part.fiche, i - 1, partsOf(book).length);
      const nom = c.titre ? `« ${c.titre} »` : `n° ${i}`;
      const seule = partsOf(book).length === 1;
      if (!confirm(`Supprimer définitivement la fiche ${nom} du livre « ${book.title} » ? ${seule ? 'Le livre reste dans votre livre de lectures (titre, auteur, notice), sans fiche : vous pourrez lui en ajouter une nouvelle.' : 'Les autres fiches du livre sont gardées.'}`)) return;
      await saveBook(withoutPart(book, part.id));
      toast(`La fiche ${nom} a été supprimée.${seule ? ' Le livre est gardé : « + Ajouter une fiche » pour en refaire une.' : ''}`, 'ok', 7000);
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
      toast(ok ? `Demande copiée. Collez-la dans la conversation ${currentIa().label} de ce livre, puis recollez la réponse dans « Compléter (suite du chapitre) / refaire le résumé ».` : 'La copie a échoué.', ok ? 'ok' : 'erreur', 8000);
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
        const ids = $$('#toc > li', view).map((li) => li.dataset.id);
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
