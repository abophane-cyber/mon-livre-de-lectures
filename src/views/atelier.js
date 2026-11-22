// Vue « Nouvelle fiche » / « Compléter une fiche » : passages → demande pour Claude → réponse.
import { findBookByKey, getBook, saveBook } from '../db.js';
import { parseClippings } from '../clippings.js';
import { LANGUES, LONGUEURS, buildFixPrompt, buildPrompt, checkCitations, parseAnswer } from '../prompt.js';
import { copyText } from '../download.js';
import { NOTICE_FIELDS } from '../fichea4.js';
import { bookKey, esc, joinPassages, mergePassages, pluralize, splitPassages } from '../util.js';
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

export async function renderAtelier(view, params) {
  let book = params.id ? await getBook(params.id) : null;
  if (params.id && !book) {
    view.innerHTML = '<section class="page"><p>Cette fiche n\'existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  let draftKey = book ? book.id : 'nouveau';
  const draft = loadDraft(draftKey) || {};
  const v = {
    title: draft.title ?? book?.title ?? '',
    author: draft.author ?? book?.author ?? '',
    pubDate: draft.pubDate ?? book?.pubDate ?? '',
    lang: draft.lang ?? book?.lang ?? 'français',
    length: draft.length ?? book?.length ?? 'moyen',
    captures: draft.captures ?? book?.captures ?? false,
    passages: draft.passages ?? joinPassages(book?.passages),
    answer: draft.answer ?? '',
    ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, draft[k] ?? book?.[k] ?? ''])),
  };
  const hasNotice = NOTICE_FIELDS.some(([k]) => v[k]);
  const ia = currentIa();

  view.innerHTML = `<section class="page atelier">
    <h1>${book ? `Compléter « ${esc(book.title)} »` : 'Nouvelle fiche'}</h1>
    ${book?.fiche ? '<p class="petit">Ajoutez vos nouveaux passages à la fin de la liste, puis refaites le résumé : la nouvelle réponse remplacera la fiche actuelle.</p>' : ''}

    <div class="etape">
      <h2><span class="pastille">1</span> Le livre et vos passages</h2>
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
      <div class="champs">
        <label>Titre du livre<input id="f-title" required value="${esc(v.title)}" autocomplete="off"></label>
        <label>Auteur<input id="f-author" value="${esc(v.author)}" autocomplete="off"></label>
        <label>Date de parution<input id="f-pubDate" value="${esc(v.pubDate)}" placeholder="par exemple 1857" autocomplete="off"></label>
        <label>Langue du résumé
          <select id="f-lang">${LANGUES.map((l) => `<option${l === v.lang ? ' selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </div>
      <details class="notice"${hasNotice ? ' open' : ''}>
        <summary>Notice du livre (facultatif) : éditeur, ISBN, date de lecture…</summary>
        <div class="champs">
          ${NOTICE_FIELDS.map(([k, l]) => `<label>${l}<input id="f-${k}" value="${esc(v[k])}" autocomplete="off"${k === 'isbn' ? ' inputmode="numeric"' : ''}></label>`).join('')}
        </div>
      </details>
      <fieldset class="segment">
        <legend>Longueur</legend>
        ${Object.entries(LONGUEURS)
          .map(
            ([k, L]) => `<label><input type="radio" name="f-length" value="${k}"${k === v.length ? ' checked' : ''}><span>${L.label}</span></label>`,
          )
          .join('')}
      </fieldset>
      <label class="bloc">Vos passages surlignés <span class="petit" id="compte"></span>
        <textarea id="f-passages" rows="12" placeholder="Collez ici votre sélection. Séparez les passages par une ligne vide.">${esc(v.passages)}</textarea>
      </label>
      <label class="case-simple captures"><input type="checkbox" id="f-captures"${v.captures ? ' checked' : ''}>
        <span>J'ai des <strong>captures d'écran</strong> de mes passages (je les joindrai dans ${esc(ia.label)})</span></label>
      <p class="petit" id="aide-captures" ${v.captures ? '' : 'hidden'}>Avec des captures, la zone de texte ci-dessus est facultative. ${esc(ia.label)} recopiera lui-même les passages surlignés de vos captures, et l'appli les ajoutera à cette fiche.</p>
      <button class="lien" id="enregistrer">Enregistrer pour plus tard</button>
    </div>

    <div class="etape">
      <h2><span class="pastille">2</span> Demander le résumé à ${esc(ia.label)}</h2>
      <p class="petit" id="aide-sans-captures" ${v.captures ? 'hidden' : ''}>L'appli copie une demande complète (avec vos règles et vos passages) et ouvre ${esc(ia.label)}. Là-bas, collez-la (appui long puis « Coller » sur le téléphone, Ctrl+V sur l'ordinateur) et envoyez.</p>
      <ol class="petit instructions" id="aide-avec-captures" ${v.captures ? '' : 'hidden'}>
        <li>Touchez le bouton ci-dessous : la demande est copiée et ${esc(ia.label)} s'ouvre.</li>
        <li>Dans ${esc(ia.label)}, touchez <strong>+</strong> (ou le trombone 📎), puis choisissez vos captures d'écran dans vos photos (20 au maximum par message).</li>
        <li>Collez la demande dans la zone de message (appui long puis « Coller »), puis envoyez.</li>
      </ol>
      <button class="btn primaire" id="copier">Copier la demande et ouvrir ${esc(ia.label)}</button>
      <div id="secours" hidden>
        <p class="petit">La copie automatique n'a pas marché : sélectionnez tout le texte ci-dessous et copiez-le.</p>
        <textarea id="demande" rows="8" readonly></textarea>
      </div>
    </div>

    <div class="etape">
      <h2><span class="pastille">3</span> Coller la réponse de ${esc(ia.label)}</h2>
      <p class="petit">Dans ${esc(ia.label)}, copiez toute la réponse (bouton « Copier » sous le bloc de code), revenez ici et collez-la.</p>
      <textarea id="f-answer" rows="8" placeholder="Collez ici la réponse de ${esc(ia.label)}">${esc(v.answer)}</textarea>
      <div class="rangee">
        ${navigator.clipboard?.readText ? '<button class="btn" id="coller">Coller</button>' : ''}
        <button class="btn primaire" id="ajouter">Ajouter à mon livre</button>
      </div>
      <div id="erreurs" class="erreurs" hidden></div>
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
    $('#compte', view).textContent = `(${pluralize(splitPassages(el.passages.value).length, 'passage', 'passages')})`;
  };
  updateCount();
  view.oninput = () => {
    saveDraft(draftKey, readForm());
    updateCount();
  };
  $('#f-captures', view).addEventListener('change', (e) => {
    const on = e.target.checked;
    $('#aide-captures', view).hidden = !on;
    $('#aide-avec-captures', view).hidden = !on;
    $('#aide-sans-captures', view).hidden = on;
    saveDraft(draftKey, readForm());
  });

  /** Enregistre le livre (création, ou ajout au livre existant du même titre et auteur). */
  async function persist() {
    const f = readForm();
    if (!f.title) {
      toast('Indiquez le titre du livre.', 'erreur');
      el.title.focus();
      return null;
    }
    const passages = splitPassages(f.passages);
    if (!passages.length && !f.captures) {
      toast("Collez au moins un passage, ou cochez « J'ai des captures d'écran ».", 'erreur', 6000);
      el.passages.focus();
      return null;
    }
    const meta = {
      title: f.title,
      author: f.author,
      pubDate: f.pubDate,
      lang: f.lang,
      length: f.length,
      captures: f.captures,
      ...Object.fromEntries(NOTICE_FIELDS.map(([k]) => [k, f[k]])),
    };
    if (!book) {
      const twin = await findBookByKey(f.title, f.author);
      if (twin) {
        book = twin;
        // Ne pas effacer ce qui était déjà renseigné (date, ISBN…) avec des champs laissés vides.
        const filled = Object.fromEntries(Object.entries(meta).filter(([, val]) => val !== ''));
        book = await saveBook({ ...twin, ...filled, passages: mergePassages(twin.passages, passages) });
        toast(`Ce livre avait déjà une fiche : vos passages y ont été ajoutés.`, 'info', 6000);
      } else {
        book = await saveBook({ ...meta, passages });
      }
    } else {
      book = await saveBook({ ...book, ...meta, passages });
    }
    if (draftKey !== book.id) {
      clearDraft(draftKey);
      draftKey = book.id;
      history.replaceState(null, '', '#/livre/' + book.id);
    }
    el.passages.value = joinPassages(book.passages);
    saveDraft(draftKey, readForm());
    updateCount();
    return book;
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
    await renderAtelier(view, params.id ? params : book ? { id: book.id } : {});
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
    if (!sameBook && !confirm(`Ajouter les passages de « ${chosen.title} » à « ${el.title.value} » ?`)) return;
    const before = splitPassages(el.passages.value);
    const merged = mergePassages(before, chosen.passages);
    el.passages.value = joinPassages(merged);
    saveDraft(draftKey, readForm());
    updateCount();
    toast(`${pluralize(merged.length - before.length, 'nouveau passage ajouté', 'nouveaux passages ajoutés')}.`, 'ok');
  });

  $('#enregistrer', view).addEventListener('click', async () => {
    if (await persist()) toast('Enregistré. Vous retrouverez cette fiche « à terminer » dans votre livre.', 'ok');
  });

  $('#copier', view).addEventListener('click', async () => {
    const saved = await persist();
    if (!saved) return;
    const prompt = buildPrompt(saved);
    const ok = await copyText(prompt);
    if (ok) {
      $('#secours', view).hidden = true;
      window.open(ia.url, '_blank', 'noopener');
      toast(`Demande copiée ✓ Collez-la dans ${ia.label}, puis revenez ici avec la réponse.`, 'ok', 8000);
    } else {
      $('#secours', view).hidden = false;
      $('#demande', view).value = prompt;
      $('#demande', view).select();
    }
  });

  $('#coller', view)?.addEventListener('click', async () => {
    try {
      el.answer.value = await navigator.clipboard.readText();
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
    if (saved.fiche && saved.ficheEditedByHand &&
      !confirm('Vous aviez modifié cette fiche à la main. La remplacer par cette nouvelle réponse ?')) return;
    // Passages recopiés par Claude depuis les captures d'écran : ajoutés à ceux de la fiche.
    const allPassages = mergePassages(saved.passages, result.passages);
    const fromCaptures = allPassages.length - saved.passages.length;
    const missing = checkCitations(result.fiche, allPassages);
    await saveBook({ ...saved, passages: allPassages, fiche: result.fiche, ficheEditedByHand: false });
    clearDraft(draftKey);
    const extra = fromCaptures > 0 ? ` ${pluralize(fromCaptures, 'passage recopié', 'passages recopiés')} depuis vos captures.` : '';
    if (missing) {
      toast(`Fiche ajoutée.${extra} ${missing > 1 ? `${missing} citations ne figurent` : '1 citation ne figure'} pas mot pour mot dans vos passages : ${missing > 1 ? 'elles sont signalées' : 'elle est signalée'} en orange.`, 'attention', 9000);
    } else {
      toast(`Fiche ajoutée à votre livre ✓${extra}`, 'ok', 6000);
    }
    if (saved.captures && !result.passages.length) {
      toast("Fiche ajoutée, mais Claude n'a pas recopié les passages de vos captures : les citations n'ont pas pu être vérifiées.", 'attention', 9000);
    }
    location.hash = '#/?ch=' + saved.id;
  });
}
