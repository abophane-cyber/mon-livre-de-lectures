// Un livre peut contenir plusieurs fiches (par exemple une par chapitre).
// Le livre garde le titre, l'auteur, la notice et la bibliographie ; chaque fiche a son texte et son résumé.
// Fonctions pures : aucune dépendance au navigateur, pour pouvoir les tester.
import { newId } from './util.js';

const PART_KEYS = ['passages', 'captures', 'fiche', 'ficheEditedByHand'];

/** Convertit un livre de l'ancien format (une seule fiche) au format à plusieurs fiches. */
export function normalizeBook(book) {
  if (!book || book.deleted || Array.isArray(book.fiches)) return book;
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
  for (const k of [...PART_KEYS, 'ficheId', 'ficheIndex', 'ficheCount']) delete rest[k];
  return rest;
}

/** Les fiches du livre (sans celles supprimées), dans l'ordre. */
export function partsOf(book) {
  return (normalizeBook(book)?.fiches || []).filter((p) => !p.deleted);
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
    fiche: part.fiche || null,
    ficheEditedByHand: !!part.ficheEditedByHand,
    ficheId: part.id,
    ficheIndex: parts.findIndex((p) => p.id === part.id),
    ficheCount: parts.length,
  };
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
