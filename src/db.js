// Stockage local dans le navigateur (IndexedDB). Les fiches ne quittent jamais l'appareil.
import { openDB } from 'idb';
import { reconcileOrder } from './sync.js';
import { bookKey, newId } from './util.js';

const dbPromise = openDB('mon-livre-de-lectures', 1, {
  upgrade(db) {
    db.createObjectStore('books', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
});

export const DEFAULT_SETTINGS = { titreLivre: 'Mon livre de lectures', nom: '' };

let askedPersist = false;
function askPersistence() {
  if (askedPersist) return;
  askedPersist = true;
  // Demande au navigateur de ne pas effacer ces données en cas de manque de place.
  navigator.storage?.persist?.().catch(() => {});
}

export async function allBooks() {
  return (await dbPromise).getAll('books');
}

export async function liveBooks() {
  return (await allBooks()).filter((b) => !b.deleted);
}

export async function getBook(id) {
  const b = await (await dbPromise).get('books', id);
  return b && !b.deleted ? b : null;
}

export async function findBookByKey(title, author) {
  const key = bookKey(title, author);
  return (await liveBooks()).find((b) => bookKey(b.title, b.author) === key) || null;
}

export async function saveBook(book) {
  askPersistence();
  const now = Date.now();
  const rec = {
    passages: [],
    fiche: null,
    ficheEditedByHand: false,
    lang: 'français',
    length: 'moyen',
    pubDate: '',
    ...book,
    id: book.id || newId(),
    createdAt: book.createdAt || now,
    updatedAt: now,
    deleted: false,
  };
  await (await dbPromise).put('books', rec);
  return rec;
}

export async function deleteBook(id) {
  await (await dbPromise).put('books', { id, deleted: true, updatedAt: Date.now() });
  const order = await getOrder();
  await setOrder(order.filter((x) => x !== id));
}

async function getMeta(key) {
  return (await (await dbPromise).get('meta', key)) || { key, value: null, updatedAt: 0 };
}

async function setMeta(key, value, updatedAt = Date.now()) {
  await (await dbPromise).put('meta', { key, value, updatedAt });
}

/** Ordre personnalisé des chapitres (identifiants), complété des livres manquants. */
export async function getOrder() {
  const [meta, books] = await Promise.all([getMeta('order'), liveBooks()]);
  return reconcileOrder(meta.value || [], books);
}

export async function setOrder(ids) {
  await setMeta('order', ids);
}

export async function getSettings() {
  const meta = await getMeta('settings');
  return { ...DEFAULT_SETTINGS, ...(meta.value || {}) };
}

export async function setSettings(patch) {
  const cur = await getSettings();
  await setMeta('settings', { ...cur, ...patch });
}

/** Tout le contenu, pour la sauvegarde. */
export async function dumpAll() {
  const [books, order, settings] = await Promise.all([allBooks(), getMeta('order'), getMeta('settings')]);
  return {
    books,
    order: { value: order.value || [], updatedAt: order.updatedAt },
    settings: { value: settings.value || {}, updatedAt: settings.updatedAt },
  };
}

/** Écrit le résultat d'une fusion. */
export async function writeMerged({ books, order, settings }) {
  const db = await dbPromise;
  const tx = db.transaction(['books', 'meta'], 'readwrite');
  for (const b of books) tx.objectStore('books').put(b);
  tx.objectStore('meta').put({ key: 'order', value: order.value, updatedAt: order.updatedAt });
  if (settings) tx.objectStore('meta').put({ key: 'settings', value: settings.value, updatedAt: settings.updatedAt });
  await tx.done;
}
