// Vue « Mon livre » : sommaire puis toutes les fiches, comme un livre.
import { deleteBook, getOrder, getSettings, liveBooks, saveBook, setOrder } from '../db.js';
import { chapterOf, flatten, isComplete, partOf, partsOf, readyFiches, withoutPart } from '../fiches.js';
import { SORTS, allThemes, hasTheme, searchBook, sortBooks, themesOf } from '../books.js';
import { buildFixPrompt } from '../prompt.js';
import { NOTICE_FIELDS } from '../notice.js';
import { copyText } from '../download.js';
import { isDesktopApp } from '../native.js';
import { esc, pluralize } from '../util.js';
import { $, $$, currentIa, getPrefs, icons, setPrefs, toast } from '../ui.js';

let searchQuery = '';
let filtresOuverts = false;
let sortable;

// Fiches dépliées dans la page par « Tout déplier » (gardé pendant la session). Par défaut,
// tout est replié : un clic sur un chapitre l'ouvre dans la fenêtre de lecture.
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
const isOpen = (id) => openState[id] ?? false;

/** Fenêtre de lecture : le contenu d'un chapitre (ou du résumé général) s'y affiche, par-dessus la page.
 *  Le contenu y est déplacé tel quel (ses boutons marchent comme dans la page), puis remis à sa place
 *  à la fermeture (« ✕ Fermer », touche Échap ou clic à côté). */
function ouvrirLecture(view, details) {
  const corps = details.querySelector(':scope > .fiche-corps');
  if (!corps) return;
  const tete = details.querySelector(':scope > .fiche-tete');
  const dlg = document.createElement('dialog');
  dlg.className = 'lecture';
  dlg.setAttribute('aria-label', tete.textContent.replace(/\s+/g, ' ').trim());
  dlg.innerHTML = `<header class="lecture-tete">
      <div class="lecture-titre">${tete.innerHTML}</div>
      <button type="button" class="lecture-fermer" data-lecture="fermer">✕ Fermer</button>
    </header>
    <div class="lecture-corps" tabindex="-1"></div>`;
  dlg.querySelector('.lecture-titre .badge')?.remove();
  dlg.querySelector('.lecture-corps').append(corps);
  view.append(dlg);
  // Remet le contenu à sa place dans la page, puis retire la fenêtre (une seule fois).
  const fermer = () => {
    if (!dlg.isConnected) return;
    if (details.isConnected) details.append(corps);
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('click', (e) => {
    // Clic sur le fond sombre (hors de la fenêtre) ou sur « Fermer ».
    if (e.target === dlg || e.target.closest('[data-lecture="fermer"]')) fermer();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fermer();
    }
  });
  dlg.addEventListener('close', fermer);
  dlg.showModal();
  dlg.querySelector('.lecture-corps').focus({ preventScroll: true });
}

export const FILTRES = { tous: 'Tous les livres', encours: 'En cours', termines: 'Terminés' };
/** Livres terminés : marqués « Livre terminé » et sans fiche en attente. */
export const isFinished = (b) => !!b.termine && isComplete(b);

/** Boutons rarement utilisés, rangés dans un petit menu « ⋯ Plus ». */
const plusMenu = (items) =>
  items.filter(Boolean).length
    ? `<details class="plus"><summary class="btn" aria-label="Plus d’actions">⋯ Plus</summary><div class="plus-menu">${items.filter(Boolean).join('')}</div></details>`
    : '';

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
      ${plusMenu([
        part.fiche ? `<a class="btn" href="#/livre/${q}">Compléter (suite du chapitre) / refaire le résumé</a>` : '',
        `<button class="btn danger" data-action="supprimer-fiche" data-id="${esc(book.id)}" data-fi="${esc(part.id)}">Supprimer cette fiche</button>`,
      ])}
    </div>
    </div>
  </details>`;
}

/** Intitulé d'une partie : « Partie 1 · Les origines », ou le titre tel quel. */
function partHeading(pt) {
  return [pt.label, pt.titre].filter(Boolean).map(esc).join(' · ');
}

/** Pour chaque fiche : la partie à afficher juste avant elle (quand on entre dans une nouvelle partie), ou null. */
function partStarts(parts) {
  let prev = null;
  return parts.map((p) => {
    const pt = partOf(p.fiche);
    const start = pt && pt.key !== prev ? pt : null;
    prev = pt ? pt.key : null;
    return start;
  });
}

/** Les fiches du livre, avec le titre de chaque partie avant son premier chapitre. */
function renderParts(book, parts) {
  const starts = partStarts(parts);
  return parts
    .map((p, i) => `${starts[i] ? `<h3 class="partie-livre">${partHeading(starts[i])}</h3>` : ''}${renderPart(book, p, i, parts.length)}`)
    .join('');
}

/** Sommaire : les chapitres (fiches) du livre, sous son titre. */
function tocChapters(book) {
  const parts = partsOf(book);
  const items = parts
    .map((p, i) => ({ p, ch: chapterOf(p.fiche, i, parts.length) }))
    .filter(({ ch }) => ch.label);
  if (!items.length) return '';
  const starts = new Map(partStarts(parts).map((pt, i) => [parts[i].id, pt]));
  const key = `s-${book.id}`;
  return `<details class="toc-details" data-fi="${esc(key)}"${isOpen(key, 0) ? ' open' : ''}>
    <summary class="sommaire-titre toc-sommaire">Sommaire <span class="toc-nb">(${pluralize(items.length, 'chapitre', 'chapitres')})</span></summary>
    <ol class="toc-chapitres">${items
    .map(({ p, ch }) => {
      const pt = starts.get(p.id);
      return `${pt ? `<li class="toc-partie">${partHeading(pt)}</li>` : ''}<li><a href="#/?ch=${esc(book.id)}&fi=${esc(p.id)}"><span class="c">${esc(ch.label)}</span>${ch.titre ? ` ${esc(ch.titre)}` : ''}</a></li>`;
    })
    .join('')}</ol></details>`;
}

/** « (5p) » : nombre de pages du PDF (le nombre demandé tant qu'il n'est pas compté). */
const pagesLabel = (g) => `(${g.pagesPdf || g.pages}p)`;

/** Résumés généraux faits avant que l'appli compte les pages : on les compte une fois, puis on les garde. */
async function countMissingPages(view, books) {
  const todo = books.filter((b) => b.resumeGeneral?.sections?.length && !b.resumeGeneral.pagesPdf);
  if (!todo.length) return;
  const { countGeneralPages } = await import('../pdf.js');
  for (const b of todo) {
    try {
      const pagesPdf = await countGeneralPages(b);
      await saveBook({ ...b, resumeGeneral: { ...b.resumeGeneral, pagesPdf } });
      const span = view.querySelector(`.nb-pages[data-general="${CSS.escape(b.id)}"]`);
      if (span) span.textContent = pagesLabel({ pagesPdf });
    } catch (err) {
      console.error(err);
    }
  }
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
      <span class="partie-num">Tout le livre</span>
      <span class="chapitre-resume">Résumé général <span class="nb-pages" data-general="${esc(book.id)}" title="Nombre de pages du PDF">${pagesLabel(g)}</span></span>
    </summary>
    <div class="fiche-corps">
      ${body}
      ${idees}
      <div class="actions">
        <button class="btn primaire" data-action="generalA4" data-id="${esc(book.id)}">PDF</button>
        ${plusMenu([
          `<a class="btn" href="#/general/${esc(book.id)}">Refaire (autre longueur, nouvelles fiches)</a>`,
          `<button class="btn danger" data-action="supprimer-general" data-id="${esc(book.id)}">Supprimer le résumé général</button>`,
        ])}
      </div>
    </div>
  </details>`;
}

function renderBook(book) {
  const parts = partsOf(book);
  const genre = parts.find((p) => p.fiche?.genre)?.fiche.genre;
  const meta = [book.author, book.pubDate, genre].filter(Boolean).map(esc).join(' · ');
  const ready = parts.filter((p) => p.fiche).length;
  const replie = openState[`livre-${book.id}`] === false;
  return `<article class="chapitre page${replie ? ' replie' : ''}" id="ch-${esc(book.id)}">
    <div class="livre-boutons">
      <button type="button" class="replier-livre" data-action="replier-livre" data-id="${esc(book.id)}" aria-expanded="${!replie}">${replie ? '▾ Déplier' : '▴ Replier'}</button>
      <a class="fermer-livre" href="#/" title="Fermer ce livre" aria-label="Fermer ce livre">✕ Fermer</a>
    </div>
    <div class="tete-livre">
      ${book.cover ? `<a href="#/modifier/${esc(book.id)}?notice=1" title="Couverture et informations du livre"><img class="couv-livre" src="${esc(book.cover)}" alt="Couverture de « ${esc(book.title)} »"></a>` : ''}
      <div>
        <h2 data-action="replier-livre" data-id="${esc(book.id)}" title="Replier ou déplier ce livre">${esc(book.title)}</h2>
        ${meta ? `<p class="meta">${meta}</p>` : ''}
        ${renderInfos(book)}
      </div>
    </div>
    <hr class="filet">
    ${parts.length > 1
      ? `<div class="replier"><button class="lien" data-action="deplier" data-id="${esc(book.id)}">Tout déplier</button> · <button class="lien" data-action="replier" data-id="${esc(book.id)}">Tout replier</button></div>`
      : ''}
    ${renderGeneralBlock(book)}
    ${parts.length ? renderParts(book, parts) :'<p class="attente">Ce livre n\'a pas encore de fiche.</p>'}
    ${renderNotice(book)}
    ${book.termine ? `<p class="livre-termine">✓ Livre terminé${book.dateLecture ? ` — lu le ${esc(book.dateLecture)}` : ''}</p>` : ''}
    <div class="actions actions-livre">
      ${isComplete(book) && !book.termine ? `<button class="btn primaire" data-action="terminer" data-id="${esc(book.id)}">✓ Livre terminé</button>` : ''}
      ${book.termine
        ? `<button class="btn" data-action="rouvrir" data-id="${esc(book.id)}">Rouvrir le livre (ajouter une fiche)</button>`
        : `<a class="btn${isComplete(book) ? '' : ' primaire'}" href="#/livre/${esc(book.id)}?f=nouvelle">+ Ajouter une fiche${parts.length ? " (autre chapitre)" : ""}</a>`}
      ${ready > 1 ? `<button class="btn" data-action="fichea4" data-id="${esc(book.id)}">Toutes les fiches A4 du livre (${ready})</button>` : ''}
      ${ready && !book.resumeGeneral ? `<a class="btn" href="#/general/${esc(book.id)}">Résumé général de toutes les fiches</a>` : ''}
      ${plusMenu([
        `<a class="btn" href="#/modifier/${esc(book.id)}?notice=1">Informations du livre (ISBN, éditeur…)</a>`,
        `<button class="btn danger" data-action="supprimer" data-id="${esc(book.id)}">${parts.length > 1 ? 'Supprimer le livre et ses fiches' : parts.length ? 'Supprimer le livre et sa fiche' : 'Supprimer le livre'}</button>`,
      ])}
    </div>
  </article>`;
}

export async function renderLivre(view, params) {
  const [books, order, settings] = await Promise.all([liveBooks(), getOrder(), getSettings()]);
  const prefs = getPrefs();
  const mode = SORTS[prefs.sort] ? prefs.sort : 'perso';
  const filtre = FILTRES[prefs.filtre] ? prefs.filtre : 'tous';
  if (params.fi) setOpen(params.fi, false); // il s'ouvrira dans la fenêtre de lecture
  // Seul le livre demandé (clic dans la liste) est ouvert sous la liste. Quand la page se redessine
  // (recherche, tri…), le livre ouvert reste celui de l'adresse.
  const ch = params.ch || new URLSearchParams(location.hash.split('?')[1] || '').get('ch') || '';

  if (!books.length) {
    view.innerHTML = `<section class="page vide">
      <h1>${esc(settings.titreLivre)}</h1>
      <p>Votre livre est encore vide. Chaque fiche de lecture que vous créerez deviendra un chapitre.</p>
      <a class="btn primaire" href="#/nouveau">${icons.plus} Ajouter mon premier livre</a>
      <p class="petit">Vous avez déjà des fiches sur un autre appareil ? <a href="#/sauvegarde">Importez votre sauvegarde</a>.</p>
    </section>`;
    return;
  }

  const themes = allThemes(books);
  const theme = themes.find((t) => t === prefs.filtreTheme) || '';
  const sorted = sortBooks(books, order, mode);
  // Recherche dans tout le contenu : on garde les extraits trouvés pour les montrer sous le livre.
  const found = new Map();
  for (const b of sorted) {
    const r = searchBook(b, searchQuery);
    if (r) found.set(b.id, r.hits);
  }
  const shown = sorted.filter((b) =>
    found.has(b.id) &&
    (!theme || hasTheme(b, theme)) &&
    (filtre === 'termines' ? isFinished(b) : filtre === 'encours' ? !isFinished(b) : true),
  );
  const nbFiltres = (mode !== 'perso') + !!theme + (filtre !== 'tous');
  const canDrag = mode === 'perso' && !searchQuery && filtre === 'tous' && !theme;
  const tags = (b) => {
    const list = themesOf(b);
    return list.length
      ? `<span class="themes">${list.map((t) => `<button type="button" class="theme${theme === t ? ' actif' : ''}" data-theme="${esc(t)}" title="Afficher les livres de ce thème">${esc(t)}</button>`).join('')}</span>`
      : '';
  };
  const hitsHtml = (b) => {
    const hits = searchQuery ? found.get(b.id) || [] : [];
    return hits.length
      ? `<ul class="extraits">${hits.map((h) => `<li><a href="#/?ch=${esc(b.id)}${h.fi ? `&fi=${esc(h.fi)}` : ''}"><span class="ou">${esc(h.where)}</span>
          ${esc(h.before)}<mark>${esc(h.match)}</mark>${esc(h.after)}</a></li>`).join('')}</ul>`
      : '';
  };
  const week = 7 * 24 * 3600 * 1000;
  // Logiciel Windows : la sauvegarde automatique (dans Téléchargements) compte comme une sauvegarde.
  const lastSave = Math.max(prefs.lastExport || 0, isDesktopApp && prefs.autoBackup !== false ? prefs.lastAuto || 0 : 0);
  // « Plus tard » : le rappel se tait 3 jours.
  const reminder = Date.now() - lastSave > week && Date.now() - (prefs.rappelPlusTard || 0) > 3 * 24 * 3600 * 1000;

  view.innerHTML = `
    ${reminder ? `<div class="bandeau rappel" role="status"><span>${lastSave ? 'Dernière sauvegarde il y a plus d’une semaine.' : 'Vos fiches ne sont pas encore sauvegardées.'}</span>
      <a class="btn" href="#/sauvegarde">Sauvegarder</a><button class="lien" type="button" data-action="plus-tard">Plus tard</button></div>` : ''}
    <section class="page sommaire">
      <h1>${esc(settings.titreLivre)}</h1>
      <div class="outils">
        <input type="search" id="recherche" placeholder="Rechercher un livre, un mot, un thème…" value="${esc(searchQuery)}" aria-label="Rechercher">
        <button type="button" class="btn btn-filtres${nbFiltres ? ' actif' : ''}" id="btn-filtres" aria-expanded="${filtresOuverts}" aria-controls="filtres">${icons.filtre} Trier et filtrer${nbFiltres ? ` (${nbFiltres})` : ''}</button>
      </div>
      <div class="filtres" id="filtres"${filtresOuverts ? '' : ' hidden'}>
        <label class="tri">Trier par
          <select id="tri">${Object.entries(SORTS)
            .map(([k, v]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>
        </label>
        ${themes.length ? `<label class="tri">Thème
          <select id="filtre-theme"><option value="">Tous les thèmes</option>${themes
            .map((t) => `<option${t === theme ? ' selected' : ''}>${esc(t)}</option>`)
            .join('')}</select>
        </label>` : ''}
        <label class="tri">Afficher
          <select id="filtre">${Object.entries(FILTRES)
            .map(([k, v]) => `<option value="${k}"${k === filtre ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>
        </label>
        ${nbFiltres ? '<button type="button" class="lien" id="effacer-filtres">Tout effacer</button>' : ''}
      </div>
      ${canDrag && shown.length > 1 ? '<p class="petit aide">Pour changer l\'ordre, faites glisser la poignée ⠿ (au doigt ou à la souris).</p>' : ''}
      <ol class="toc${canDrag ? ' deplacable' : ''}" id="toc">
        ${shown
          .map(
            (b, i) => `<li data-id="${esc(b.id)}"${b.id === ch ? ' class="ouvert"' : ''}>
              ${canDrag ? `<span class="poignee" aria-label="Déplacer">${icons.grip}</span>` : ''}
              <a class="toc-couv" href="#/?ch=${esc(b.id)}" tabindex="-1" aria-hidden="true">${b.cover
                ? `<img src="${esc(b.cover)}" alt="" loading="lazy">`
                : `<span class="couv-vide">${esc((b.title || '?').trim().charAt(0).toUpperCase())}</span>`}</a>
              <div class="toc-corps">
                <div class="toc-tete">
                  <a href="#/?ch=${esc(b.id)}"><span class="num">${i + 1}.</span>
                    <span class="t">${esc(b.title)}</span>
                    <span class="a">${[b.author, b.pubDate].filter(Boolean).map(esc).join(' · ')}</span></a>
                  ${isComplete(b) ? (b.termine ? '<span class="badge badge-ok">terminé ✓</span>' : '') : '<span class="badge">à terminer</span>'}
                  ${tags(b)}
                </div>
                ${hitsHtml(b)}
                ${tocChapters(b)}
              </div>
            </li>`,
          )
          .join('')}
      </ol>
      ${shown.length
        ? ''
        : searchQuery
          ? '<p>Aucune fiche ne contient ces mots. Essayez avec moins de mots, ou un mot plus court (« économ » trouve aussi « économie »).</p>'
          : theme
          ? `<p>Aucun livre du thème « ${esc(theme)} » ici. <button class="lien" type="button" data-theme="">Voir tous les thèmes</button></p>`
          : `<p>${filtre === 'termines' ? 'Aucun livre terminé pour l’instant. En bas d’un livre dont toutes les fiches sont faites, touchez « ✓ Livre terminé ».' : 'Aucun livre en cours : ils sont tous terminés.'}</p>`}
      <p class="petit">${pluralize(books.length, 'livre', 'livres')} et ${pluralize(books.reduce((n, b) => n + partsOf(b).length, 0), 'fiche', 'fiches')} dans votre livre de lectures.</p>
    </section>
    <div id="chapitres">${books.filter((b) => b.id === ch).map((b) => renderBook(b)).join('')}</div>`;

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
  $('#btn-filtres', view).addEventListener('click', () => {
    filtresOuverts = !filtresOuverts;
    $('#filtres', view).hidden = !filtresOuverts;
    $('#btn-filtres', view).setAttribute('aria-expanded', String(filtresOuverts));
  });
  $('#effacer-filtres', view)?.addEventListener('click', () => {
    setPrefs({ sort: 'perso', filtreTheme: '', filtre: 'tous' });
    renderLivre(view, {});
  });
  $('#tri', view).addEventListener('change', (e) => {
    setPrefs({ sort: e.target.value });
    renderLivre(view, {});
  });
  $('#filtre-theme', view)?.addEventListener('change', (e) => {
    setPrefs({ filtreTheme: e.target.value });
    renderLivre(view, {});
  });
  $('#filtre', view).addEventListener('change', (e) => {
    setPrefs({ filtre: e.target.value });
    renderLivre(view, {});
  });
  for (const d of $$('details.fiche-partie, details.toc-details', view)) {
    d.addEventListener('toggle', () => setOpen(d.dataset.fi, d.open));
  }
  // Un chapitre fermé s'ouvre dans la fenêtre de lecture (un chapitre déplié dans la page,
  // par « Tout déplier », se replie normalement).
  for (const s of $$('details.fiche-partie > summary.fiche-tete', view)) {
    s.addEventListener('click', (e) => {
      const d = s.parentElement;
      if (d.open) return;
      e.preventDefault();
      ouvrirLecture(view, d);
    });
  }
  countMissingPages(view, books);

  view.onclick = async (e) => {
    // Menus « ⋯ Plus » : un clic ailleurs (ou sur un de leurs boutons) les referme.
    for (const d of $$('details.plus[open]', view)) {
      if (!d.contains(e.target) || e.target.closest('.plus-menu')) d.open = false;
    }
    if (e.target.closest('[data-action="plus-tard"]')) {
      setPrefs({ rappelPlusTard: Date.now() });
      e.target.closest('.bandeau').hidden = true;
      return;
    }
    // Clic sur un thème : n'afficher que les livres de ce thème (re-clic : tous).
    const th = e.target.closest('[data-theme]');
    if (th) {
      setPrefs({ filtreTheme: th.dataset.theme === theme ? '' : th.dataset.theme });
      await renderLivre(view, {});
      window.scrollTo(0, 0);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const book = books.find((b) => b.id === btn.dataset.id);
    if (!book) return;
    const part = btn.dataset.fi ? partsOf(book).find((p) => p.id === btn.dataset.fi) : null;
    if (btn.dataset.action === 'replier-livre') {
      // Replier le livre : il ne reste que son titre (re-clic : tout revient).
      const art = btn.closest('.chapitre');
      const replie = art.classList.toggle('replie');
      setOpen(`livre-${book.id}`, !replie);
      const b = art.querySelector('.replier-livre');
      b.textContent = replie ? '▾ Déplier' : '▴ Replier';
      b.setAttribute('aria-expanded', String(!replie));
      return;
    }
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
    const target = (params.fi && document.getElementById('fi-' + params.fi)) || document.getElementById('ch-' + ch);
    requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    // Lien du sommaire ou de la recherche vers un chapitre : il s'ouvre dans la fenêtre de lecture.
    if (params.fi && target?.matches('details.fiche-partie:not([open])')) ouvrirLecture(view, target);
  }
}
