// Tri et recherche des fiches.
import { authorSortKey, normalize, yearOf } from './util.js';

export const SORTS = {
  perso: 'Mon ordre',
  ajout: "Date d'ajout",
  auteur: 'Auteur',
  parution: 'Date de parution',
};

const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });

export function sortBooks(books, orderIds, mode) {
  const list = [...books];
  if (mode === 'ajout') return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (mode === 'auteur') {
    return list.sort((a, b) => authorSortKey(a.author).localeCompare(authorSortKey(b.author), 'fr') || byTitle(a, b));
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

export function filterBooks(books, query) {
  const q = normalize(query);
  if (!q) return books;
  return books.filter((b) => normalize(`${b.title} ${b.author}`).includes(q));
}
