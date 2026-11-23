// Notice du livre (informations générales et page de présentation) et bibliographie.

/** [clé, libellé, rempli par Claude depuis les captures ?] */
export const NOTICE_FIELDS = [
  ['editeur', 'Éditeur', true],
  ['collection', 'Collection', true],
  ['edition', 'Édition', true],
  ['traduction', 'Traduction', true],
  ['isbn', 'ISBN', true],
  ['pages', 'Nombre de pages', true],
  ['dateLecture', 'Date de lecture', false],
];

const clean = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '');

/** Lit l'objet « notice » renvoyé par Claude (clés inconnues ignorées). */
export function readNotice(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, , fromClaude] of NOTICE_FIELDS) if (fromClaude && clean(raw[k])) out[k] = clean(raw[k]);
  if (clean(raw.date_parution)) out.pubDate = clean(raw.date_parution);
  return out;
}

export function readBibliographie(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((x) => clean(typeof x === 'string' ? x : x?.texte))
    .filter(Boolean);
}

/**
 * Complète un livre avec la notice et la bibliographie lues par Claude.
 * Ce que l'utilisateur a déjà rempli n'est jamais remplacé ; la bibliographie s'ajoute sans doublon.
 * Renvoie { patch, changed } (changed = nombre d'informations ajoutées).
 */
export function applyNotice(book, notice = {}, bibliographie = []) {
  const patch = {};
  let changed = 0;
  for (const [k, v] of Object.entries(notice)) {
    if (v && !clean(book[k])) {
      patch[k] = v;
      changed++;
    }
  }
  const current = Array.isArray(book.bibliographie) ? book.bibliographie : [];
  const seen = new Set(current.map((x) => x.toLowerCase()));
  const added = bibliographie.filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  if (added.length) {
    patch.bibliographie = [...current, ...added];
    changed += added.length;
  }
  return { patch, changed };
}
