// Un livre peut contenir plusieurs fiches (par exemple une par chapitre).
// Le livre garde le titre, l'auteur, la notice et la bibliographie ; chaque fiche a son texte et son résumé.
// Fonctions pures : aucune dépendance au navigateur, pour pouvoir les tester.
import { newId } from './util.js';

const PART_KEYS = ['passages', 'captures', 'fiche', 'ficheEditedByHand'];

/** Convertit un livre de l'ancien format (une seule fiche) au format à plusieurs fiches. */
export function normalizeBook(book) {
  if (!book || book.deleted || Array.isArray(book.fiches)) return book;
  // Livre tout neuf (pas encore de fiche) : rien à convertir.
  if (!book.id || !PART_KEYS.some((k) => k in book)) return { ...book, fiches: [] };
  const rest = { ...book };
  for (const k of PART_KEYS) delete rest[k];
  return {
    ...rest,
    fiches: [
      {
        // Identifiant fixe : les deux appareils convertissent le même livre de la même façon.
        id: 'p-' + book.id,
        passages: book.passages || [],
        captures: !!book.captures,
        fiche: book.fiche || null,
        ficheEditedByHand: !!book.ficheEditedByHand,
        createdAt: book.createdAt || 0,
        updatedAt: book.updatedAt || 0,
      },
    ],
  };
}

/** Retire d'un livre les champs propres à une fiche (cas d'un objet « aplati »). */
export function bookOnly(book) {
  const rest = { ...normalizeBook(book) };
  for (const k of [...PART_KEYS, 'ficheId', 'ficheIndex', 'ficheCount', 'bibliographieGenerale']) delete rest[k];
  return rest;
}

/** Les fiches du livre (sans celles supprimées), dans l'ordre. */
export function partsOf(book) {
  // « p-undefined » : fiche vide créée par erreur avec les livres neufs (ancienne version de l'appli).
  return (normalizeBook(book)?.fiches || [])
    .filter((p) => !p.deleted && !(p.id === 'p-undefined' && !p.fiche && !p.passages?.length))
    .map((p) => (p.fiche ? { ...p, fiche: unescapeFiche(p.fiche) } : p));
}

/**
 * Une fiche vue comme un livre à une seule fiche : c'est ce qu'attendent la demande à l'IA,
 * la fiche A4 et le PDF. `id` reste celui du livre, `ficheId` est celui de la fiche.
 */
export function flatten(book, part) {
  const parts = partsOf(book);
  return {
    ...bookOnly(book),
    passages: part.passages || [],
    captures: !!part.captures,
    fiche: unescapeFiche(part.fiche) || null,
    ficheEditedByHand: !!part.ficheEditedByHand,
    // La bibliographie du chapitre (celle de la fiche) ; celle du livre devient « générale ».
    bibliographie: part.bibliographie || [],
    bibliographieGenerale: book.bibliographie || [],
    ficheId: part.id,
    ficheIndex: parts.findIndex((p) => p.id === part.id),
    ficheCount: parts.length,
  };
}

/**
 * Enlève les « \ » laissés par certaines IA (« \- Dette publique ») dans les fiches déjà enregistrées.
 */
function unescapeFiche(v) {
  // Un texte de fiche n'a jamais besoin de « \ » : on les enlève tous (après « \- » en début de ligne).
  if (typeof v === 'string') return v.replace(/^\\[-*+]\s*/, '').replace(/\\/g, '').trim();
  if (Array.isArray(v)) return v.map(unescapeFiche);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unescapeFiche(x)]));
  return v;
}

/** Toutes les fiches terminées des livres donnés, dans l'ordre des livres. */
export function readyFiches(books) {
  return books.flatMap((b) => partsOf(b).filter((p) => p.fiche).map((p) => flatten(b, p)));
}

/** Le livre n'a plus de fiche sans résumé ? */
export function isComplete(book) {
  const parts = partsOf(book);
  return parts.length > 0 && parts.every((p) => p.fiche);
}

/** Nouvelle fiche vide (pas encore enregistrée). */
export function newPart(extra = {}) {
  const now = Date.now();
  return { id: newId(), passages: [], captures: false, fiche: null, ficheEditedByHand: false, createdAt: now, updatedAt: now, ...extra };
}

/** Ajoute la fiche au livre, ou la remplace si elle y est déjà. */
export function withPart(book, part) {
  const b = bookOnly(book);
  const rec = { ...part, updatedAt: Date.now() };
  const list = b.fiches || [];
  const fiches = list.some((p) => p.id === rec.id) ? list.map((p) => (p.id === rec.id ? rec : p)) : [...list, rec];
  return { ...b, fiches };
}

/** Supprime une fiche du livre (garde une trace pour la synchronisation). */
export function withoutPart(book, partId) {
  const b = bookOnly(book);
  return { ...b, fiches: (b.fiches || []).map((p) => (p.id === partId ? { id: p.id, deleted: true, createdAt: p.createdAt, updatedAt: Date.now() } : p)) };
}

/** Réunit les fiches d'un même livre venant de deux appareils : pour chaque fiche, la plus récente l'emporte. */
export function mergeParts(a = [], b = []) {
  const byId = new Map();
  for (const p of [...a, ...b]) {
    const cur = byId.get(p.id);
    if (!cur || (p.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

const ROMAINS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20 };

/**
 * Le chapitre d'une fiche : chaque fiche d'un livre est un chapitre.
 * « Chapitre 2 : Le retour des marchés » → { num: '2', titre: 'Le retour des marchés' } ;
 * « Une dette à faire peur » (sans numéro) → le numéro est celui de la fiche dans le livre.
 * `label` est vide pour un livre à une seule fiche sans titre de chapitre (la fiche résume tout le livre).
 */
const ORDINAUX = { premiere: 1, premier: 1, deuxieme: 2, seconde: 2, second: 2, troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6, septieme: 7, huitieme: 8, neuvieme: 9, dixieme: 10 };
const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Partie du livre à laquelle appartient une fiche (« Première partie. Les origines »,
 * « Partie II : … », « Livre 1 – … ») → { label: 'Partie 1', titre: 'Les origines', key }.
 * Sans partie : null. `key` sert à regrouper les fiches d'une même partie.
 */
export function partOf(fiche) {
  const p = String(fiche?.partie || '').trim();
  if (!p) return null;
  const sep = '\\s*[.:：–—-]?\\s*(.*)$';
  const num = (n) => {
    const k = sansAccents(n);
    return /^\d+$/.test(k) ? String(parseInt(k, 10)) : ORDINAUX[k] ? String(ORDINAUX[k]) : String(ROMAINS[k] || n.toUpperCase());
  };
  let m = p.match(new RegExp(`^(partie|livre|section)\\s+(\\d+|[ivxlc]+\\b|[a-zà-ÿ]+i[eè]me|premi[eè]re?|seconde?)${sep}`, 'i'));
  let label = '';
  let titre = p;
  if (m) {
    label = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${num(m[2])}`;
    titre = m[3].trim();
  } else if ((m = p.match(new RegExp(`^([a-zà-ÿ]+i[eè]me|premi[eè]re?|seconde?)\\s+(partie|livre|section)${sep}`, 'i')))) {
    label = `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${num(m[1])}`;
    titre = m[3].trim();
  } else if ((m = p.match(new RegExp(`^(\\d+|[IVXLC]+)\\s*[.:：–—-]\\s*(.+)$`)))) {
    label = `Partie ${num(m[1])}`;
    titre = m[2].trim();
  }
  return { label, titre, key: sansAccents(p).replace(/[^a-z0-9]+/g, ' ').trim() };
}

export function chapterOf(fiche, index = 0, count = 1) {
  const c = String(fiche?.chapitre || '').trim();
  const m = c.match(/^chapitre\s+(\d+|[ivxlc]+\b|premier|première)\s*[.:：–—-]?\s*(.*)$/i);
  let num = String(index + 1);
  let titre = c;
  if (m) {
    const n = m[1].toLowerCase();
    num = /^\d+$/.test(n) ? String(parseInt(n, 10)) : n.startsWith('premi') ? '1' : String(ROMAINS[n] || m[1].toUpperCase());
    titre = m[2].trim();
  }
  const label = c || count > 1 ? `Chapitre ${num}` : '';
  return { num, titre, label };
}
