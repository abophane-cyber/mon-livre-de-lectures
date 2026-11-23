// Tri et recherche des fiches.
import { authorSortKey, normalize, yearOf } from './util.js';
import { chapterOf, partsOf } from './fiches.js';
import { NOTICE_FIELDS } from './notice.js';

export const SORTS = {
  perso: 'Mon ordre',
  ajout: "Date d'ajout",
  auteur: 'Auteur',
  parution: 'Date de parution',
  theme: 'Thème',
};

const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });

export function sortBooks(books, orderIds, mode) {
  const list = [...books];
  if (mode === 'ajout') return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (mode === 'auteur') {
    return list.sort((a, b) => authorSortKey(a.author).localeCompare(authorSortKey(b.author), 'fr') || byTitle(a, b));
  }
  if (mode === 'theme') {
    // Par premier thème (ordre alphabétique), les livres sans thème à la fin.
    const first = (b) => themesOf(b)[0] || '';
    return list.sort((a, b) => {
      const ta = first(a);
      const tb = first(b);
      if (!ta !== !tb) return ta ? -1 : 1;
      return ta.localeCompare(tb, 'fr', { sensitivity: 'base' }) || byTitle(a, b);
    });
  }
  if (mode === 'parution') {
    return list.sort((a, b) => {
      const ya = yearOf(a.pubDate);
      const yb = yearOf(b.pubDate);
      if (ya === null && yb === null) return byTitle(a, b);
      if (ya === null) return 1;
      if (yb === null) return -1;
      return ya - yb || byTitle(a, b);
    });
  }
  const pos = new Map(orderIds.map((id, i) => [id, i]));
  return list.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
}

// --- Thèmes ---

const cleanTheme = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

/** Lit les thèmes tapés (séparés par des virgules ou des points-virgules), sans doublon. */
export function parseThemes(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(/[,;]/)
    .map(cleanTheme)
    .filter((t) => t && !seen.has(normalize(t)) && seen.add(normalize(t)));
}

/** Thèmes d'un livre : ceux choisis par l'utilisateur, puis le genre de ses fiches (Essai, Roman…). */
export function themesOf(book) {
  const seen = new Set();
  const genres = partsOf(book).map((p) => p.fiche?.genre);
  return [...(Array.isArray(book.themes) ? book.themes : []), ...genres]
    .map(cleanTheme)
    .filter((t) => t && !seen.has(normalize(t)) && seen.add(normalize(t)))
    .map((t) => t[0].toUpperCase() + t.slice(1));
}

/** Tous les thèmes utilisés, par ordre alphabétique (le premier écrit l'emporte pour l'orthographe). */
export function allThemes(books) {
  const byKey = new Map();
  for (const b of books) for (const t of themesOf(b)) if (!byKey.has(normalize(t))) byKey.set(normalize(t), t);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export const hasTheme = (book, theme) => themesOf(book).some((t) => normalize(t) === normalize(theme));

// --- Recherche dans tout le contenu ---

/** Chaque caractère « plié » (minuscule, sans accent) : même longueur que le texte d'origine. */
function fold(text) {
  let out = '';
  for (const c of text) {
    const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] || ' ';
    out += /[a-z0-9]/.test(f) ? f : ' ';
    if (c.length === 2) out += ' '; // caractère sur deux unités (emoji…) : garder les positions
  }
  return out;
}

/** Les endroits d'un livre où chercher : { where, fi, text }. */
function places(book) {
  const out = [];
  const add = (where, text, fi) => {
    const t = String(text ?? '').trim();
    if (t) out.push({ where, text: t, fi });
  };
  add('Titre', book.title);
  add('Auteur', book.author);
  for (const t of themesOf(book)) add('Thème', t);
  for (const [k, l] of NOTICE_FIELDS) add(l, book[k]);
  for (const r of book.bibliographie || []) add('Bibliographie', r);
  const parts = partsOf(book);
  parts.forEach((p, i) => {
    const f = p.fiche;
    if (!f) return;
    const ch = chapterOf(f, i, parts.length);
    const where = parts.length > 1 ? [ch.label, ch.titre].filter(Boolean).join(' — ') || `Fiche ${i + 1}` : 'Fiche';
    add(where, f.partie, p.id);
    add(where, f.chapitre, p.id);
    add(where, f.accroche, p.id);
    for (const x of f.resume || []) add(where, x, p.id);
    for (const x of f.idees_cles || []) add(where, `${x.titre}. ${x.texte || ''}`, p.id);
    for (const x of f.personnages || []) add(where, `${x.nom}${x.role ? ` — ${x.role}` : ''}`, p.id);
    for (const x of f.citations || []) add(where, `« ${x.texte} » ${x.commentaire || ''}`, p.id);
    add(where, f.a_retenir, p.id);
    add(where, f.pour_qui, p.id);
    for (const r of p.bibliographie || []) add(where, r, p.id);
  });
  for (const sec of book.resumeGeneral?.sections || []) {
    add('Résumé général', sec.titre);
    for (const x of sec.paragraphes || []) add('Résumé général', x);
  }
  for (const x of book.resumeGeneral?.idees || []) add('Résumé général', `${x.titre}. ${x.texte || ''}`);
  return out;
}

/** Extrait autour du mot trouvé : { before, match, after }. */
function snippet(text, start, len, radius = 70) {
  let a = Math.max(0, start - radius);
  let b = Math.min(text.length, start + len + radius);
  if (a > 0) a = text.indexOf(' ', a) + 1 || a;
  if (b < text.length) b = text.lastIndexOf(' ', b) > start + len ? text.lastIndexOf(' ', b) : b;
  return {
    before: (a > 0 ? '…' : '') + text.slice(a, start),
    match: text.slice(start, start + len),
    after: text.slice(start + len, b) + (b < text.length ? '…' : ''),
  };
}

/**
 * Cherche dans tout le livre (titre, auteur, thèmes, informations, contenu des fiches, résumé général).
 * Tous les mots tapés doivent s'y trouver (pas forcément au même endroit), sans tenir compte des
 * accents ni des majuscules. Renvoie null, ou { hits: [{ where, fi, before, match, after }] } :
 * quelques extraits du contenu (pas du titre ni de l'auteur, déjà affichés).
 */
export function searchBook(book, query, maxHits = 3) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return { hits: [] };
  const list = places(book).map((p) => ({ ...p, folded: fold(p.text) }));
  const all = list.map((p) => p.folded).join(' | ');
  if (!words.every((w) => all.includes(w))) return null;
  // Extraits : le mot le plus long (le plus parlant), là où il apparaît.
  const key = [...words].sort((a, b) => b.length - a.length)[0];
  const hits = [];
  for (const p of list) {
    if (hits.length >= maxHits) break;
    if (p.where === 'Titre' || p.where === 'Auteur') continue;
    const i = p.folded.indexOf(key);
    if (i >= 0) hits.push({ where: p.where, fi: p.fi, ...snippet(p.text, i, key.length) });
  }
  return { hits };
}

export function filterBooks(books, query) {
  if (!normalize(query)) return books;
  return books.filter((b) => searchBook(b, query));
}
