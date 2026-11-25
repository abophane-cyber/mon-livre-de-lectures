// Vue « Résumé général » (#/general/<livre>) : synthèse de toutes les fiches du livre,
// sur un nombre de pages choisi. Même principe que les fiches : demande copiée → IA → réponse collée.
import { getBook, saveBook } from '../db.js';
import { partsOf } from '../fiches.js';
import { motsPour, PAGES_MAX, PAGES_MIN, buildGeneralPrompt, clampPages, parseGeneral } from '../general.js';
import { canPaste, copyText, openExternal, pasteText } from '../download.js';
import { esc, pluralize } from '../util.js';
import { $, clearDraft, currentIa, loadDraft, saveDraft, toast } from '../ui.js';

export async function renderGeneral(view, params) {
  const book = await getBook(params.id);
  if (!book) {
    view.innerHTML = '<section class="page"><p>Ce livre n’existe plus.</p><a class="btn" href="#/">Retour au livre</a></section>';
    return;
  }
  const parts = partsOf(book);
  const done = parts.filter((p) => p.fiche).length;
  const waiting = parts.length - done;
  const draftKey = `general:${book.id}`;
  const draft = loadDraft(draftKey) || {};
  const pages = clampPages(draft.pages ?? book.resumeGeneral?.pages ?? 2);
  const ia = currentIa();
  const back = `#/?ch=${book.id}&fi=g-${book.id}`;

  if (!done) {
    view.innerHTML = `<section class="page"><h1>Résumé général de « ${esc(book.title)} »</h1>
      <p>Ce livre n’a pas encore de fiche avec un résumé. Faites d’abord les fiches de ses chapitres : le résumé général est fait à partir d’elles.</p>
      <a class="btn" href="#/?ch=${esc(book.id)}">Retour au livre</a></section>`;
    return;
  }

  view.innerHTML = `<section class="page atelier">
    <h1>Résumé général de « ${esc(book.title)} »</h1>
    <p class="petit">Une synthèse de tout le livre, faite par ${esc(ia.label)} à partir de vos ${pluralize(done, 'fiche', 'fiches')}${waiting ? ` (${pluralize(waiting, 'fiche sans résumé n’est pas prise', 'fiches sans résumé ne sont pas prises')} en compte)` : ''}.
      ${book.resumeGeneral ? '<strong>La nouvelle réponse remplacera le résumé général actuel.</strong>' : ''}</p>

    <div class="etape">
      <h2><span class="pastille">1</span> Choisir la longueur</h2>
      <label class="pages-choix">Nombre de pages A4
        <span class="rangee">
          <button class="btn" type="button" id="moins" aria-label="Une page de moins">−</button>
          <input id="pages" type="number" inputmode="numeric" min="${PAGES_MIN}" max="${PAGES_MAX}" value="${pages}">
          <button class="btn" type="button" id="plus" aria-label="Une page de plus">+</button>
        </span>
      </label>
      <p class="petit" id="mots"></p>
    </div>

    <div class="etape">
      <h2><span class="pastille">2</span> Demander le résumé général à ${esc(ia.label)}</h2>
      <p class="petit">L’appli copie une demande qui contient toutes vos fiches, et ouvre ${esc(ia.label)}. Là-bas, dans une <strong>nouvelle conversation</strong>, collez-la (appui long puis « Coller » sur le téléphone, Ctrl+V sur l’ordinateur) et envoyez. Pas besoin de captures.</p>
      <button class="btn primaire" id="copier">Copier la demande et ouvrir ${esc(ia.label)}</button>
      <div id="secours" hidden>
        <p class="petit">La copie automatique n’a pas marché : sélectionnez tout le texte ci-dessous et copiez-le.</p>
        <textarea id="demande" rows="8" readonly></textarea>
      </div>
    </div>

    <div class="etape">
      <h2><span class="pastille">3</span> Coller la réponse de ${esc(ia.label)}</h2>
      <p class="petit">Dans ${esc(ia.label)}, copiez toute la réponse avec le bouton <strong>Copier</strong> (les deux petits carrés sous la réponse), revenez ici et collez-la.</p>
      <textarea id="reponse" rows="8" placeholder="Collez ici la réponse de ${esc(ia.label)}">${esc(draft.answer || '')}</textarea>
      <div class="rangee">
        ${canPaste() ? '<button class="btn" id="coller">Coller</button>' : ''}
        <button class="btn primaire" id="enregistrer">Enregistrer le résumé général</button>
      </div>
      <div id="erreurs" class="erreurs" hidden></div>
    </div>
    <a class="lien" href="${esc(back)}">Retour au livre</a>
  </section>`;

  const input = $('#pages', view);
  const answer = $('#reponse', view);
  const save = () => saveDraft(draftKey, { pages: clampPages(input.value), answer: answer.value });
  const showWords = () => {
    const n = clampPages(input.value);
    $('#mots', view).textContent = `Environ ${motsPour(n).toLocaleString('fr-FR')} mots.${n > 1 ? ' Le résumé sera organisé en grandes parties avec des intertitres.' : ''}`;
  };
  showWords();
  const step = (d) => {
    input.value = clampPages(clampPages(input.value) + d);
    showWords();
    save();
  };
  $('#moins', view).onclick = () => step(-1);
  $('#plus', view).onclick = () => step(1);
  input.addEventListener('input', () => {
    showWords();
    save();
  });
  input.addEventListener('change', () => {
    input.value = clampPages(input.value);
    showWords();
  });
  answer.addEventListener('input', save);

  $('#copier', view).addEventListener('click', async () => {
    input.value = clampPages(input.value);
    save();
    const prompt = buildGeneralPrompt(book, clampPages(input.value));
    if (await copyText(prompt)) {
      $('#secours', view).hidden = true;
      openExternal(ia.url);
      toast(`Demande copiée ✓ Collez-la dans une nouvelle conversation ${ia.label}, puis revenez ici avec la réponse.`, 'ok', 8000);
    } else {
      $('#secours', view).hidden = false;
      $('#demande', view).value = prompt;
      $('#demande', view).select();
    }
  });

  $('#coller', view)?.addEventListener('click', async () => {
    try {
      answer.value = await pasteText();
      save();
    } catch {
      toast('Le navigateur a refusé. Faites un appui long dans la zone puis « Coller ».', 'erreur', 6000);
    }
  });

  $('#enregistrer', view).addEventListener('click', async () => {
    const box = $('#erreurs', view);
    box.hidden = true;
    const r = parseGeneral(answer.value);
    if (!r.ok) {
      box.hidden = false;
      box.innerHTML = `<p><strong>La réponse n’est pas au bon format.</strong></p><ul>${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      return;
    }
    const n = clampPages(input.value);
    const fresh = await getBook(book.id);
    const resumeGeneral = { pages: n, sections: r.sections, idees: r.idees, mots: r.mots, createdAt: Date.now() };
    // Nombre de pages du PDF, affiché à côté du titre « Résumé général ».
    try {
      const { countGeneralPages } = await import('../pdf.js');
      resumeGeneral.pagesPdf = await countGeneralPages({ ...fresh, resumeGeneral });
    } catch (err) {
      console.error(err);
    }
    await saveBook({ ...fresh, resumeGeneral });
    clearDraft(draftKey);
    const ecart = r.mots / motsPour(n);
    toast(
      ecart < 0.7 || ecart > 1.3
        ? `Résumé général enregistré ✓ Il fait ${r.mots.toLocaleString('fr-FR')} mots, pour ${pluralize(n, 'page demandée', 'pages demandées')} (environ ${motsPour(n).toLocaleString('fr-FR')}). Si la longueur ne vous convient pas, refaites la demande.`
        : `Résumé général enregistré ✓ (${r.mots.toLocaleString('fr-FR')} mots).`,
      ecart < 0.7 || ecart > 1.3 ? 'attention' : 'ok',
      9000,
    );
    location.hash = back;
  });
}
