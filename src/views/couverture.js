// Bloc « Couverture du livre » (aperçu + boutons), partagé par les vues Atelier et Modifier.
import { blobToCover, fetchCover } from '../cover.js';
import { esc } from '../util.js';
import { $, toast } from '../ui.js';

export const couvertureHtml = () => `<div class="couverture-bloc">
    <div class="couverture-apercu" id="couv-apercu"></div>
    <div class="couverture-texte">
      <p><strong>Couverture du livre</strong></p>
      <p class="petit" id="couv-statut"></p>
      <div class="rangee">
        <button type="button" class="btn primaire" id="couv-chercher">Chercher la couverture</button>
        <label class="btn">Choisir une image…<input type="file" id="couv-fichier" accept="image/*" hidden></label>
        <button type="button" class="lien danger" id="couv-retirer">Retirer</button>
      </div>
      <p class="petit" id="couv-etat" role="status" hidden></p>
    </div>
  </div>`;

/**
 * @param root    élément qui contient le bloc
 * @param initial { cover, coverRatio } déjà enregistrée, ou null
 * @param isbn    () → ISBN tapé dans le formulaire
 * @param label   () → { title, author } pour l'aperçu sans image
 * @param saveWord nom du bouton qui enregistre (« Enregistrer »…)
 * @param onChange appelé quand la couverture change
 * Renvoie { get, search } : get() → { cover, coverRatio } ou null ; search(quiet) cherche par l'ISBN.
 */
export function wireCouverture(root, { initial = null, isbn, label, saveWord = 'Enregistrer', onChange = () => {} }) {
  let cover = initial?.cover ? initial : null;
  let saved = cover?.cover || '';
  const etat = $('#couv-etat', root);
  const say = (msg) => {
    etat.hidden = !msg;
    etat.textContent = msg || '';
  };
  const show = () => {
    const { title, author } = label();
    $('#couv-apercu', root).innerHTML = cover
      ? `<img src="${esc(cover.cover)}" alt="Couverture du livre">`
      : `<div class="couverture-defaut" title="Couverture par défaut"><small>Fiche de lecture</small><span>${esc(title)}</span><em>${esc(author)}</em><hr></div>`;
    $('#couv-statut', root).textContent = cover
      ? (cover.cover === saved ? 'Couverture enregistrée ✓ Elle sera en première page de la fiche A4.' : `Nouvelle couverture : cliquez sur « ${saveWord} » pour la garder.`)
      : "Pas encore d'image : à la place, la page d'informations du livre (à bande verte, ci-contre) servira de couverture. Avec l'ISBN, « Chercher la couverture » la trouve en général.";
    $('#couv-retirer', root).hidden = !cover;
  };
  const set = (c, msg) => {
    cover = c;
    show();
    say(msg);
    onChange();
  };
  async function search(quiet = false) {
    if (!String(isbn() || '').replace(/[^0-9X]/gi, '')) {
      if (!quiet) toast("Indiquez d'abord l'ISBN, ou utilisez « Remplir automatiquement » plus haut.", 'erreur', 7000);
      return;
    }
    const btn = $('#couv-chercher', root);
    btn.disabled = true;
    say('Recherche de la couverture…');
    const found = await fetchCover(isbn());
    btn.disabled = false;
    if (found) set(found, 'Couverture trouvée ✓');
    else say("Aucune couverture trouvée pour cet ISBN. Vous pouvez choisir une image : photo du livre, ou image enregistrée depuis le site d'une librairie.");
  }
  $('#couv-chercher', root).addEventListener('click', () => search());
  $('#couv-fichier', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      set(await blobToCover(file), 'Image choisie ✓');
    } catch {
      toast('Cette image ne peut pas être lue. Essayez une photo JPEG ou PNG.', 'erreur', 7000);
    }
  });
  $('#couv-retirer', root).addEventListener('click', () => set(null, ''));
  show();
  return {
    get: () => cover,
    search,
    refresh: show,
    /** À appeler après l'enregistrement. */
    markSaved: () => {
      saved = cover?.cover || '';
      show();
      say('');
    },
  };
}
