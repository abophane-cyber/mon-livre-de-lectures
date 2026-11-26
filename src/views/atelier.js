// Vue « Nouvelle fiche » / « Compléter une fiche » : passages → demande pour Claude → réponse.
// Un livre peut avoir plusieurs fiches (une par chapitre) : #/livre/<livre>?f=<fiche> ou ?f=nouvelle.
import { findBookByKey, getBook, saveBook } from '../db.js';
import { parseClippings } from '../clippings.js';
import { LANGUES, LONGUEURS, buildCapturesReminder, buildContinuationPrompt,buildFixPrompt, buildNoticePrompt, buildPrompt, checkCitations, parseAnswer } from '../prompt.js';
import { applyNotice } from '../notice.js';
import { canPaste, copyText, openExternal, pasteText } from '../download.js';
import { NOTICE_FIELDS } from '../fichea4.js';
import { flatten, newPart, partsOf, withPart } from '../fiches.js';
import { bookKey, esc, joinPassages, mergePassages, pluralize, splitPassages } from '../util.js';
import { remplirHtml, wireRemplir } from './remplir.js';
import { couvertureHtml, wireCouverture } from './couverture.js';
import { $, clearDraft, currentIa, loadDraft, readFileText, saveDraft, toast } from '../ui.js';

// Livres trouvés dans le dernier My Clippings.txt importé. Gardés pendant la session, même si
// le téléphone recharge la page en revenant de Claude.
const CLIP_KEY = 'mll:clippings';
let clippingsBooks = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(CLIP_KEY) || '[]');
  } catch {
    return [];
  }
})();
function rememberClippings(list) {
  clippingsBooks = list;
  try {
    sessionStorage.setItem(CLIP_KEY, JSON.stringify(list));
  } catch {
    /* fichier trop gros pour être mémorisé : on le garde seulement en mémoire */
  }
}

// La page est découpée en 4 écrans. L'écran affiché est retenu pendant la session, pour
// retomber au bon endroit quand le téléphone recharge la page en revenant de l'IA.
const ETAPES = ['Le livre', 'Le texte', 'La demande', 'La réponse'];
const ETAPE_KEY = 'mll:etape:';
function savedStep(key) {
  try {
    return Number(sessionStorage.getItem(ETAPE_KEY + key)) || 0;
  } catch {
    return 0;
  }
}
function saveStep(key, n) {
  try {
    if (n) sessionStorage.setItem(ETAPE_KEY + key, String(n));
    else sessionStorage.removeItem(ETAPE_KEY + key);
  } catch {
    /* rien */
  }
}

export async function renderAtelier(view, params) {
  let book = params.id ? await getBook(params.id) : null;
  if (params.id && !book) {
    view.innerHTML = '<section class="page"><p>Cette fiche n\'existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  const parts = book ? partsOf(book) : [];
  // La fiche à compléter ; aucune quand on ajoute une nouvelle fiche (autre chapitre) au livre.
  let part = book && params.f !== 'nouvelle' ? parts.find((p) => p.id === params.f) || (params.f ? null : parts[0]) || null : null;
  if (book && params.f && params.f !== 'nouvelle' && !part) {
    view.innerHTML = '<section class="page"><p>Cette fiche n’existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  const adding = !!book && !part;
  const keyOf = () => (book ? `${book.id}:${part ? part.id : 'nouvelle'}` : 'nouveau');
  let draftKey = keyOf();
  const draft = loadDraft(draftKey) || {};
  const lastPart = parts[parts.length - 1];
  const v = {
    title: draft.title ?? book?.title ?? '',
    author: draft.author ?? book?.author ?? '',
    pubDate: draft.pubDate ?? book?.pubDate ?? '',
    lang: draft.lang ?? book?.lang ?? 'français',
    length: draft.length ?? book?.length ?? 'moyen',
    captures: draft.captures ?? part?.captures ?? lastPart?.captures ?? false,
    passages: draft.passages ?? joinPassages(part?.passages),
    answer: draft.answer ?? '',
    ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, draft[k] ?? book?.[k] ?? ''])),
  };
  const hasNotice = NOTICE_FIELDS.some(([k]) => v[k]);
  const ia = currentIa();

  view.innerHTML = `<section class="page atelier">
    <h1>${adding ? `Nouvelle fiche pour « ${esc(book.title)} »` : book ? `Compléter « ${esc(book.title)} »` : 'Nouvelle fiche'}</h1>
    ${part?.fiche?.chapitre ? `<p class="meta">${esc(part.fiche.chapitre)}</p>` : ''}
    ${adding ? `<p class="petit">Ce livre a déjà ${pluralize(parts.length, 'fiche', 'fiches')}. Donnez le texte d'un autre chapitre (ou joignez ses captures) : il aura sa propre fiche, à la suite des autres.</p>` : ''}
    ${part?.fiche ? '<p class="petit">Ajoutez du texte à la fin si vous voulez, puis refaites le résumé : la nouvelle réponse remplacera cette fiche (les autres fiches du livre ne changent pas).</p>' : ''}

    <ol class="etapes-nav" aria-label="Étapes">
      ${ETAPES.map((t, i) => `<li><button type="button" data-aller="${i + 1}"><span class="pastille">${i + 1}</span><span class="etapes-nom">${t}</span></button></li>`).join('')}
    </ol>

    <div class="etape" data-etape="1">
      <h2><span class="pastille">1</span> Le livre</h2>
      <div class="champs">
        <label>Titre du livre<input id="f-title" required value="${esc(v.title)}" autocomplete="off"></label>
        <label>Auteur<input id="f-author" value="${esc(v.author)}" autocomplete="off"></label>
        <label>Date de parution<input id="f-pubDate" value="${esc(v.pubDate)}" placeholder="par exemple 1857" autocomplete="off"></label>
      </div>
      <details class="notice"${hasNotice ? ' open' : ''}>
        <summary>Informations sur le livre (facultatif, communes à toutes ses fiches) : éditeur, ISBN, date de lecture…</summary>
        ${remplirHtml()}
        ${couvertureHtml()}
        <div class="champs">
          ${NOTICE_FIELDS.map(([k, l]) => `<label>${l}<input id="f-${k}" value="${esc(v[k])}" autocomplete="off"${k === 'isbn' ? ' inputmode="numeric"' : ''}></label>`).join('')}
        </div>
        <button class="btn primaire" id="ajouter-notice" type="button">Enregistrer les informations du livre</button>
        <p class="petit">Enregistre seulement ces informations, sans créer de fiche. Elles apparaîtront sur la page de présentation du livre dans les PDF. Vous les retrouvez aussi sous le livre : bouton « Informations du livre ».</p>
      </details>
      <div class="etape-suite"><span></span><button class="btn primaire" type="button" data-aller="2">Suivant : le texte →</button></div>
    </div>

    <div class="etape" data-etape="2">
      <h2><span class="pastille">2</span> Le texte à résumer</h2>
      <div class="import">
        <label class="btn" for="fichier-clippings">Importer My Clippings.txt</label>
        <input type="file" id="fichier-clippings" accept=".txt,text/plain" hidden>
        <select id="choix-livre" ${clippingsBooks.length ? '' : 'hidden'} aria-label="Choisir un livre">
          <option value="">— Choisissez un livre (${clippingsBooks.length}) —</option>
          ${clippingsBooks
            .map((b, i) => `<option value="${i}">${esc(b.title)}${b.author ? ' — ' + esc(b.author) : ''} (${b.passages.length})</option>`)
            .join('')}
        </select>
      </div>
      <label class="langue">Langue du résumé
        <select id="f-lang">${LANGUES.map((l) => `<option${l === v.lang ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <fieldset class="segment">
        <legend>Longueur</legend>
        ${Object.entries(LONGUEURS)
          .map(
            ([k, L]) => `<label><input type="radio" name="f-length" value="${k}"${k === v.length ? ' checked' : ''}><span>${L.label}</span></label>`,
          )
          .join('')}
      </fieldset>
      <label class="case-simple captures"><input type="checkbox" id="f-captures"${v.captures ? ' checked' : ''}>
        <span>J'ai des <strong>captures d'écran</strong> du texte à résumer (je les joindrai dans ${esc(ia.label)})</span></label>
      <p class="petit" id="aide-captures" ${v.captures ? '' : 'hidden'}>${esc(ia.label)} résumera <strong>tout le texte visible</strong> sur vos captures, surligné ou non. Ajoutez aussi, si vous voulez, une capture de la page d'informations du livre (éditeur, ISBN) ou de la bibliographie du chapitre : elles iront au verso de la fiche A4 de ce chapitre.</p>
      <button class="lien" id="montrer-passages" type="button" ${v.captures && !v.passages.trim() ? '' : 'hidden'}>+ Ajouter aussi du texte copié-collé</button>
      <label class="bloc" id="bloc-passages" ${v.captures && !v.passages.trim() ? 'hidden' : ''}>Le texte à résumer <span class="petit" id="compte"></span>
        <textarea id="f-passages" rows="12" placeholder="Collez ici le texte à résumer : un extrait, un chapitre, vos passages préférés…">${esc(v.passages)}</textarea>
      </label>
      <button class="lien" id="enregistrer">Enregistrer pour plus tard</button>
      <div class="etape-suite"><button class="btn" type="button" data-aller="1">← Le livre</button><button class="btn primaire" type="button" data-aller="3">Suivant : la demande →</button></div>
    </div>

    <div class="etape" data-etape="3">
      <h2><span class="pastille">3</span> Demander le résumé à ${esc(ia.label)}</h2>
      <p class="petit" id="aide-sans-captures" ${v.captures ? 'hidden' : ''}>L'appli copie une demande complète (avec vos règles et votre texte) et ouvre ${esc(ia.label)}. Là-bas, collez-la (appui long puis « Coller » sur le téléphone, Ctrl+V sur l'ordinateur) et envoyez.</p>
      <ol class="petit instructions" id="aide-avec-captures" ${v.captures ? '' : 'hidden'}>
        <li>Touchez le bouton ci-dessous : la demande est copiée et ${esc(ia.label)} s'ouvre.</li>
        <li>Dans ${esc(ia.label)}, touchez <strong>+</strong> (ou l'icône photo), puis choisissez vos captures d'écran.</li>
        <li><strong>Avant d'envoyer</strong>, collez la demande dans la zone de message (appui long puis « Coller »). Les captures et la demande doivent partir <strong>dans le même message</strong>.</li>
        <li>Envoyez une seule fois.</li>
      </ol>
      <button class="btn primaire" id="copier">Copier la demande et ouvrir ${esc(ia.label)}</button>
      <div class="rappel-captures" id="bloc-rappel" ${v.captures ? '' : 'hidden'}>
        <p class="petit"><strong>${esc(ia.label)} n'a pas compris quoi faire des captures</strong> (il les décrit, ou pose une question) ? Touchez ce bouton, puis dans la même conversation, joignez à nouveau vos captures, collez ce message et envoyez.</p>
        <button class="btn" id="copier-rappel">Copier le message pour les captures</button>
      </div>
      ${part?.fiche
        ? `<div class="notice-seule" id="bloc-suite">
            <p class="petit"><strong>La suite du chapitre, avec d'autres captures ?</strong> (par exemple quand ${esc(ia.label)} n'accepte que 10 captures à la fois). Touchez ce bouton : la demande contient le résumé déjà fait. Dans <strong>une nouvelle conversation</strong> ${esc(ia.label)}, joignez les captures suivantes, collez la demande dans le même message, envoyez, puis recollez la réponse à l'étape 4. Vous obtiendrez une seule fiche A4 pour tout le chapitre (elle remplace celle-ci).</p>
            <button class="btn" id="copier-suite">Copier la demande « suite du chapitre »</button>
          </div>
          <div class="notice-seule">
            <p class="petit"><strong>Seulement la notice et la bibliographie ?</strong> Sans refaire le résumé : touchez ce bouton, joignez dans ${esc(ia.label)} vos captures de la page d'informations du livre (éditeur, ISBN…) ou de la bibliographie, collez, envoyez, puis recollez la réponse à l'étape 4.</p>
            <button class="btn" id="copier-notice">Copier la demande « notice et bibliographie »</button>
          </div>`
        : ''}
      <div id="secours" hidden>
        <p class="petit">La copie automatique n'a pas marché : sélectionnez tout le texte ci-dessous et copiez-le.</p>
        <textarea id="demande" rows="8" readonly></textarea>
      </div>
      <div class="etape-suite"><button class="btn" type="button" data-aller="2">← Le texte</button><button class="btn" type="button" data-aller="4">J'ai la réponse →</button></div>
    </div>

    <div class="etape" data-etape="4">
      <h2><span class="pastille">4</span> Coller la réponse de ${esc(ia.label)}</h2>
      <p class="petit">Dans ${esc(ia.label)}, copiez toute la réponse avec le bouton <strong>Copier</strong> (les deux petits carrés sous la réponse), revenez ici et collez-la. Une phrase en plus avant ou après ne gêne pas.</p>
      <textarea id="f-answer" rows="8" placeholder="Collez ici la réponse de ${esc(ia.label)}">${esc(v.answer)}</textarea>
      <div class="rangee">
        ${canPaste() ? '<button class="btn" id="coller">Coller</button>' : ''}
        <button class="btn primaire" id="ajouter">Ajouter à mon livre</button>
      </div>
      <div id="erreurs" class="erreurs" hidden></div>
      <div class="etape-suite"><button class="btn" type="button" data-aller="3">← La demande</button><span></span></div>
    </div>
  </section>`;

  const el = {
    title: $('#f-title', view),
    author: $('#f-author', view),
    pubDate: $('#f-pubDate', view),
    lang: $('#f-lang', view),
    passages: $('#f-passages', view),
    answer: $('#f-answer', view),
  };
  const readForm = () => ({
    title: el.title.value.trim(),
    author: el.author.value.trim(),
    pubDate: el.pubDate.value.trim(),
    lang: el.lang.value,
    length: $('input[name="f-length"]:checked', view)?.value || 'moyen',
    passages: el.passages.value,
    answer: el.answer.value,
    captures: $('#f-captures', view).checked,
    ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, $(`#f-${k}`, view).value.trim()])),
  });
  const updateCount = () => {
    const mots = el.passages.value.trim() ? el.passages.value.trim().split(/\s+/).length : 0;
    $('#compte', view).textContent = mots ? `(${pluralize(mots.toLocaleString('fr-FR'), 'mot', 'mots')})` : '';
  };
  updateCount();
  const couv = wireCouverture(view, {
    initial: book?.cover ? { cover: book.cover, coverRatio: book.coverRatio } : null,
    isbn: () => $('#f-isbn', view).value,
    label: () => ({ title: el.title.value, author: el.author.value }),
    saveWord: 'Enregistrer les informations du livre',
    onChange: () => updateNoticeBtn(),
  });
  el.title.addEventListener('input', () => couv.refresh());
  el.author.addEventListener('input', () => couv.refresh());
  wireRemplir(view, {
    field: (k) => $(`#f-${k}`, view),
    context: () => ({ title: el.title.value, author: el.author.value }),
    onChange: () => {
      saveDraft(draftKey, readForm());
      updateNoticeBtn();
      // Après « Remplir automatiquement » : chercher aussi la couverture s'il n'y en a pas.
      if (!couv.get()) couv.search(true);
    },
  });
  // Bouton « Enregistrer les informations du livre » : grisé tant que rien n'a changé depuis
  // le dernier enregistrement ; il redevient actif dès qu'on modifie une case.
  const INFO_KEYS = ['title', 'author', 'pubDate', ...NOTICE_FIELDS.map(([k]) => k)];
  const noticeBtn = $('#ajouter-notice', view);
  function updateNoticeBtn() {
    const f = readForm();
    const saved = !!book && INFO_KEYS.every((k) => (f[k] || '') === String(book[k] ?? '').trim()) &&
      (couv.get()?.cover || '') === (book.cover || '');
    noticeBtn.disabled = saved;
    noticeBtn.textContent = saved ? 'Informations du livre enregistrées ✓' : 'Enregistrer les informations du livre';
  }
  updateNoticeBtn();
  view.oninput = () => {
    saveDraft(draftKey, readForm());
    updateCount();
    updateNoticeBtn();
  };
  $('#f-captures', view).addEventListener('change', (e) => {
    const on = e.target.checked;
    $('#aide-captures', view).hidden = !on;
    $('#aide-avec-captures', view).hidden = !on;
    $('#aide-sans-captures', view).hidden = on;
    $('#bloc-rappel', view).hidden = !on;
    // En mode captures, la zone de texte est masquée (sauf si elle contient déjà du texte).
    const empty = !el.passages.value.trim();
    $('#bloc-passages', view).hidden = on && empty;
    $('#montrer-passages', view).hidden = !(on && empty);
    saveDraft(draftKey, readForm());
  });
  $('#montrer-passages', view).addEventListener('click', () => {
    $('#bloc-passages', view).hidden = false;
    $('#montrer-passages', view).hidden = true;
    el.passages.focus();
  });

  // Écrans : un seul visible à la fois. Livre déjà connu : on commence au texte.
  let step = 1;
  function goTo(n, { scroll = true } = {}) {
    step = Math.min(4, Math.max(1, n));
    for (const d of view.querySelectorAll('.etape[data-etape]')) d.hidden = Number(d.dataset.etape) !== step;
    view.querySelectorAll('.etapes-nav li').forEach((li, i) => {
      li.classList.toggle('actif', i + 1 === step);
      li.classList.toggle('fait', i + 1 < step);
      li.querySelector('button').setAttribute('aria-current', i + 1 === step ? 'step' : 'false');
    });
    saveStep(draftKey, step);
    if (scroll) window.scrollTo({ top: 0 });
  }
  /** Peut-on quitter l'écran actuel vers l'écran n ? (on peut toujours revenir en arrière) */
  function canLeave(n) {
    const f = readForm();
    if (n > 1 && !f.title) {
      goTo(1);
      toast('Indiquez d’abord le titre du livre.', 'erreur');
      el.title.focus();
      return false;
    }
    if (n > 2 && !f.passages.trim() && !f.captures) {
      goTo(2);
      toast("Collez le texte à résumer, ou cochez « J'ai des captures d'écran ».", 'erreur', 6000);
      el.passages.focus();
      return false;
    }
    return true;
  }
  $('.atelier', view).addEventListener('click', (e) => {
    const b = e.target.closest('[data-aller]');
    if (!b) return;
    const n = Number(b.dataset.aller);
    if (n > step && !canLeave(n)) return;
    goTo(n);
  });
  goTo(savedStep(draftKey) || (v.answer.trim() ? 4 : book ? 2 : 1), { scroll: false });

  /**
   * Enregistre le livre et la fiche en cours (création, ou nouvelle fiche dans le livre existant
   * du même titre et auteur). Renvoie la fiche « aplatie » (livre + fiche), ou null.
   */
  async function persist() {
    const f = readForm();
    if (!f.title) {
      goTo(1);
      toast('Indiquez le titre du livre.', 'erreur');
      el.title.focus();
      return null;
    }
    const passages = splitPassages(f.passages);
    if (!passages.length && !f.captures) {
      goTo(2);
      toast("Collez le texte à résumer, ou cochez « J'ai des captures d'écran ».", 'erreur', 6000);
      el.passages.focus();
      return null;
    }
    const meta = {
      title: f.title,
      author: f.author,
      pubDate: f.pubDate,
      lang: f.lang,
      length: f.length,
      ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, f[k]])),
      cover: couv.get()?.cover || '',
      coverRatio: couv.get()?.coverRatio || 0,
    };
    let base;
    if (!book) {
      const twin = await findBookByKey(f.title, f.author);
      if (twin) {
        // Ne pas effacer ce qui était déjà renseigné (date, ISBN…) avec des champs laissés vides.
        const filled = Object.fromEntries(Object.entries(meta).filter(([, val]) => val !== ''));
        base = { ...twin, ...filled };
        toast(`Ce livre est déjà dans votre livre de lectures : cette fiche y est ajoutée, à la suite des autres.`, 'info', 7000);
      } else {
        base = meta;
      }
    } else {
      base = { ...book, ...meta };
    }
    const rec = { ...(part || newPart()), passages, captures: f.captures };
    // Une nouvelle fiche dans un livre marqué « terminé » : le livre redevient en cours.
    if (!part && base.termine) base = { ...base, termine: 0 };
    book = await saveBook(withPart(base, rec));
    couv.markSaved();
    updateNoticeBtn();
    part = partsOf(book).find((p) => p.id === rec.id);
    if (draftKey !== keyOf()) {
      clearDraft(draftKey);
      saveStep(draftKey, 0);
      draftKey = keyOf();
      saveStep(draftKey, step);
      history.replaceState(null, '', `#/livre/${book.id}?f=${part.id}`);
    }
    el.passages.value = joinPassages(part.passages);
    saveDraft(draftKey, readForm());
    updateCount();
    return flatten(book, part);
  }

  $('#fichier-clippings', view).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let found = [];
    try {
      found = parseClippings(await readFileText(file));
    } catch {
      found = [];
    }
    if (found.length) rememberClippings(found);
    else clippingsBooks = [];
    if (!clippingsBooks.length) {
      toast("Aucun surlignement trouvé dans ce fichier. Est-ce bien « My Clippings.txt » ?", 'erreur', 7000);
      return;
    }
    saveDraft(draftKey, readForm());
    toast(`${pluralize(clippingsBooks.length, 'livre trouvé', 'livres trouvés')}. Choisissez-en un dans la liste.`, 'ok');
    await renderAtelier(view, book ? { id: book.id, f: part ? part.id : 'nouvelle' } : {});
    $('#choix-livre', view)?.focus();
  });

  $('#choix-livre', view).addEventListener('change', (e) => {
    const chosen = clippingsBooks[Number(e.target.value)];
    if (!chosen) return;
    const sameBook = !el.title.value || bookKey(el.title.value, el.author.value) === chosen.key;
    if (!book && !el.title.value) {
      el.title.value = chosen.title;
      el.author.value = chosen.author;
    }
    if (!sameBook && !confirm(`Ajouter le texte de « ${chosen.title} » à « ${el.title.value} » ?`)) return;
    const before = splitPassages(el.passages.value);
    const merged = mergePassages(before, chosen.passages);
    el.passages.value = joinPassages(merged);
    saveDraft(draftKey, readForm());
    updateCount();
    toast(`${pluralize(merged.length - before.length, 'nouvel extrait ajouté', 'nouveaux extraits ajoutés')}.`, 'ok');
  });

  // Enregistre seulement le livre (titre, auteur, informations) : aucune fiche n'est créée.
  $('#ajouter-notice', view).addEventListener('click', async () => {
    const f = readForm();
    if (!f.title) {
      toast('Indiquez le titre du livre.', 'erreur');
      el.title.focus();
      return;
    }
    const meta = {
      title: f.title,
      author: f.author,
      pubDate: f.pubDate,
      lang: f.lang,
      length: f.length,
      ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, f[k]])),
      cover: couv.get()?.cover || '',
      coverRatio: couv.get()?.coverRatio || 0,
    };
    let base;
    if (book) {
      base = { ...((await getBook(book.id)) || book), ...meta };
    } else {
      const twin = await findBookByKey(f.title, f.author);
      // Livre déjà présent : ne pas effacer ce qui y était déjà renseigné avec des cases vides.
      base = twin ? { ...twin, ...Object.fromEntries(Object.entries(meta).filter(([, val]) => val !== '')) } : meta;
    }
    book = await saveBook(base);
    if (draftKey !== keyOf()) {
      clearDraft(draftKey);
      saveStep(draftKey, 0);
      draftKey = keyOf();
      saveStep(draftKey, step);
      history.replaceState(null, '', `#/livre/${book.id}?f=${part ? part.id : 'nouvelle'}`);
    }
    saveDraft(draftKey, readForm());
    couv.markSaved();
    updateNoticeBtn();
    toast('Informations du livre enregistrées ✓ (aucune fiche créée). Elles seront sur la page de présentation des PDF.', 'ok', 7000);
  });

  $('#enregistrer', view).addEventListener('click', async () => {
    if (await persist()) toast('Enregistré. Vous retrouverez cette fiche « à terminer » dans votre livre.', 'ok');
  });

  async function copyAndOpen(prompt, message) {
    const ok = await copyText(prompt);
    if (ok) {
      $('#secours', view).hidden = true;
      openExternal(ia.url);
      toast(message, 'ok', 8000);
      // Au retour de l'IA, on arrive directement sur l'écran où coller la réponse.
      goTo(4, { scroll: false });
    } else {
      $('#secours', view).hidden = false;
      $('#demande', view).value = prompt;
      $('#demande', view).select();
    }
  }

  $('#copier', view).addEventListener('click', async () => {
    const saved = await persist();
    if (!saved) return;
    await copyAndOpen(buildPrompt(saved), `Demande copiée ✓ Collez-la dans ${ia.label}, puis revenez ici avec la réponse.`);
  });

  $('#copier-rappel', view).addEventListener('click', async () => {
    const f = readForm();
    const ok = await copyText(buildCapturesReminder({ title: f.title || book?.title }));
    toast(
      ok
        ? `Message copié ✓ Dans la même conversation ${ia.label} : joignez vos captures, collez ce message, envoyez.`
        : 'La copie a échoué.',
      ok ? 'ok' : 'erreur',
      8000,
    );
  });

  $('#copier-suite', view)?.addEventListener('click', async () => {
    // Garde le résumé existant ; enregistre seulement les réglages (titre, longueur…) et le texte.
    const f = readForm();
    if (!f.captures) $('#f-captures', view).click();
    const saved = await persist();
    if (!saved) return;
    await copyAndOpen(
      buildContinuationPrompt(saved),
      `Demande copiée ✓ Dans une nouvelle conversation ${ia.label} : joignez les captures suivantes, collez la demande, envoyez, puis recollez la réponse à l'étape 4.`,
    );
  });

  $('#copier-notice', view)?.addEventListener('click', async () => {
    await copyAndOpen(
      buildNoticePrompt(book),
      `Demande copiée ✓ Dans ${ia.label}, joignez vos captures (page d'informations, bibliographie), collez, envoyez, puis recollez la réponse à l'étape 4.`,
    );
  });

  $('#coller', view)?.addEventListener('click', async () => {
    try {
      el.answer.value = await pasteText();
      saveDraft(draftKey, readForm());
    } catch {
      toast('Le navigateur a refusé. Faites un appui long dans la zone puis « Coller ».', 'erreur', 6000);
    }
  });

  $('#ajouter', view).addEventListener('click', async () => {
    const box = $('#erreurs', view);
    box.hidden = true;
    const result = parseAnswer(el.answer.value);
    if (!result.ok) {
      box.hidden = false;
      box.innerHTML = `<p><strong>La réponse n'est pas au bon format.</strong></p>
        <ul>${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <p class="petit">Vérifiez que vous avez copié toute la réponse. Sinon, demandez à ${esc(ia.label)} de corriger :</p>
        <button class="btn" id="copier-correction">Copier une demande de correction</button>`;
      $('#copier-correction', view).onclick = async () => {
        const ok = await copyText(buildFixPrompt({ errors: result.errors }));
        toast(ok ? `Copié. Collez ce message dans la même conversation ${ia.label}.` : 'La copie a échoué.', ok ? 'ok' : 'erreur', 7000);
      };
      return;
    }
    const saved = await persist();
    if (!saved) return;
    // `saved` est la fiche aplatie : sa bibliographie est celle du chapitre, où vont les nouvelles références.
    const { patch: { bibliographie: chapBiblio, ...patch }, changed } = applyNotice(saved, result.notice, result.bibliographie);
    const chap = chapBiblio ? { bibliographie: chapBiblio } : {};
    const noticeMsg = changed ? ` Notice complétée (${pluralize(changed, 'information', 'informations')}).` : '';

    // Réponse « notice et bibliographie seulement » : la fiche n'est pas touchée.
    if (result.partial) {
      book = await saveBook(withPart({ ...book, ...patch }, { ...part, ...chap }));
      clearDraft(draftKey);
      saveStep(draftKey, 0);
      toast(
        changed
          ? `Notice et bibliographie mises à jour ✓${noticeMsg}`
          : `Rien de nouveau : ${ia.label} n'a trouvé aucune information de notice ou de bibliographie dans vos captures (ou elles étaient déjà là).`,
        changed ? 'ok' : 'attention',
        8000,
      );
      location.hash = `#/?ch=${saved.id}&fi=${part.id}`;
      return;
    }

    if (saved.fiche && saved.ficheEditedByHand &&
      !confirm('Vous aviez modifié cette fiche à la main. La remplacer par cette nouvelle réponse ?')) return;
    // Passages recopiés par Claude depuis les captures d'écran : ajoutés à ceux de la fiche.
    const allPassages = mergePassages(saved.passages, result.passages);
    const fromCaptures = allPassages.length - saved.passages.length;
    // Avec des captures, le texte source est dans les images : les citations ne peuvent pas être vérifiées.
    const missing = saved.captures ? 0 : checkCitations(result.fiche, allPassages);
    // Pas de partie dans la réponse : on garde celle de la fiche, sinon celle du chapitre précédent.
    if (!result.fiche.partie) {
      const all = book ? partsOf(book) : [];
      const at = all.findIndex((p) => p.id === part.id);
      const before = (at >= 0 ? all.slice(0, at) : all).reverse();
      result.fiche.partie = part.fiche?.partie || before.find((p) => p.fiche?.partie)?.fiche.partie || '';
    }
    book = await saveBook(withPart({ ...book, ...patch }, { ...part, ...chap, passages: allPassages, fiche: result.fiche, ficheEditedByHand: false }));
    clearDraft(draftKey);
    saveStep(draftKey, 0);
    const lien = `#/?ch=${book.id}&fi=${part.id}`;
    const extra = (fromCaptures > 0 ? ` ${pluralize(fromCaptures, 'extrait recopié', 'extraits recopiés')} depuis vos captures.` : '') + noticeMsg;
    if (missing) {
      toast(`Fiche ajoutée.${extra} ${missing > 1 ? `${missing} citations ne figurent` : '1 citation ne figure'} pas mot pour mot dans votre texte : ${missing > 1 ? 'elles sont signalées' : 'elle est signalée'} en orange.`, 'attention', 9000);
    } else if (result.warnings?.length) {
      toast(`Fiche ajoutée ✓ ${result.warnings.join(' ')}`, 'attention', 10000);
    } else {
      toast(`Fiche ajoutée à votre livre ✓${extra} Pour un autre chapitre : bouton « + Ajouter une fiche » sous le livre.`, 'ok', 8000);
    }
    location.hash = lien;
  });
}
