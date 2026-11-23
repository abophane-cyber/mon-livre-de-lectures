// Case « Remplir automatiquement » de la notice, partagée par les vues Atelier et Modifier.
import { lookupBook } from '../booklookup.js';
import { NOTICE_FIELDS } from '../notice.js';
import { pluralize } from '../util.js';
import { $, toast } from '../ui.js';

export const remplirHtml = () => `<div class="remplir">
    <label>Lien du livre (Amazon ou autre librairie) ou ISBN <span class="petit">(facultatif : sans rien, l'appli cherche avec le titre et l'auteur)</span>
      <input id="remplir-source" autocomplete="off" placeholder="https://www.amazon.fr/…/dp/2070360024 ou 978-2-07-036002-4"></label>
    <button type="button" class="btn" id="remplir-btn">Remplir automatiquement</button>
    <p class="petit" id="remplir-etat" role="status" hidden></p>
  </div>`;

/**
 * @param root     élément qui contient la case et les champs
 * @param field    (clé) → <input> du champ de notice
 * @param context  () → { title, author }
 * @param onChange appelé après remplissage (pour enregistrer le brouillon)
 */
export function wireRemplir(root, { field, context, onChange = () => {} }) {
  const btn = $('#remplir-btn', root);
  const state = $('#remplir-etat', root);
  const say = (msg) => {
    state.hidden = !msg;
    state.textContent = msg;
  };
  btn.addEventListener('click', async () => {
    const { title, author } = context();
    btn.disabled = true;
    say('Recherche en cours…');
    let res;
    try {
      res = await lookupBook({ query: $('#remplir-source', root).value, title, author });
    } catch {
      res = { error: 'La recherche a échoué. Vérifiez la connexion Internet.' };
    }
    btn.disabled = false;
    if (res.error) {
      say('');
      toast(res.error, 'erreur', 8000);
      return;
    }
    const found = Object.entries(res.notice).filter(([k]) => k !== 'isbn').length;
    if (!found) {
      say(res.byTitle
        ? "Rien trouvé avec le titre et l'auteur. Essayez avec l'ISBN (au dos du livre ou sur la page de la librairie)."
        : "Ce livre n'est pas dans les bases de livres gratuites. Remplissez les cases à la main.");
      return;
    }
    // On ne remplace jamais ce qui est déjà écrit.
    const filled = [];
    for (const [k, label] of NOTICE_FIELDS) {
      const input = field(k);
      const val = res.notice[k];
      if (input && val && !input.value.trim()) {
        input.value = val;
        filled.push(label === label.toUpperCase() ? label : label.toLowerCase());
      }
    }
    onChange();
    const warn = res.byTitle ? " Trouvé avec le titre : vérifiez que c'est bien votre édition (poche, grand format…)." : '';
    say(filled.length
      ? `Rempli : ${filled.join(', ')}.${warn} Les cases restées vides n'ont pas été trouvées.`
      : `Rien de nouveau : les cases trouvées étaient déjà remplies.`);
    if (filled.length) toast(`${pluralize(filled.length, 'information ajoutée', 'informations ajoutées')} ✓`, 'ok');
  });
}
