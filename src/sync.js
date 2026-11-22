// Sauvegarde et fusion entre l'ordinateur et le téléphone (par fichier, via le câble USB).
// Fonctions pures : aucune dépendance au navigateur, pour pouvoir les tester.
import { bookKey } from './util.js';
import { mergeParts, normalizeBook } from './fiches.js';

export const BACKUP_APP = 'mon-livre-de-lectures';
// Version 2 : un livre peut contenir plusieurs fiches.
export const BACKUP_VERSION = 2;

export function makeBackup({ books, order, settings }) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    books,
    order: order || { value: [], updatedAt: 0 },
    settings: settings || { value: {}, updatedAt: 0 },
  };
}

export function validateBackup(data) {
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.books)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de « Mon livre de lectures ».");
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'appli. Mettez l'appli à jour sur cet appareil.");
  }
  return data;
}

/** Combine deux fiches du même livre créées séparément sur les deux appareils. */
function combine(keep, other) {
  const newer = (other.updatedAt || 0) > (keep.updatedAt || 0) ? other : keep;
  return {
    ...newer,
    id: keep.id,
    createdAt: Math.min(keep.createdAt || Infinity, other.createdAt || Infinity),
    fiches: mergeParts(keep.fiches, other.fiches),
    updatedAt: Math.max(keep.updatedAt || 0, other.updatedAt || 0),
    deleted: false,
  };
}

/** Ordre final : ordre le plus récent, puis les livres manquants par date d'ajout. */
export function reconcileOrder(orderIds, liveBooks) {
  const live = new Map(liveBooks.map((b) => [b.id, b]));
  const result = (orderIds || []).filter((id, i, arr) => live.has(id) && arr.indexOf(id) === i);
  const missing = liveBooks
    .filter((b) => !result.includes(b.id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((b) => b.id);
  return [...result, ...missing];
}

/**
 * Fusionne la sauvegarde importée avec les données locales.
 * - Même fiche (même identifiant) : la version modifiée le plus récemment l'emporte.
 * - Fiche supprimée d'un côté : la suppression l'emporte si elle est plus récente.
 * - Même livre modifié des deux côtés : ses fiches sont réunies (pour chaque fiche, la plus récente l'emporte).
 * - Même livre créé séparément sur les deux appareils : ses fiches sont réunies dans un seul livre.
 * Renvoie { books, order, settings, report }.
 */
export function mergeBackup(local, incoming) {
  const report = { ajoutees: 0, misesAJour: 0, supprimees: 0, reunies: 0 };
  const byId = new Map(local.books.map((b) => [b.id, normalizeBook({ ...b })]));
  const keyOf = (b) => bookKey(b.title, b.author);

  const sortedIncoming = incoming.books.map((b) => normalizeBook(b)).sort((a, b) => Number(!!a.deleted) - Number(!!b.deleted));
  for (const inc of sortedIncoming) {
    const cur = byId.get(inc.id);
    if (inc.deleted) {
      if (cur && !cur.deleted && (inc.updatedAt || 0) >= (cur.updatedAt || 0)) {
        const target = inc.mergedInto && byId.get(inc.mergedInto);
        if (target && !target.deleted) {
          byId.set(target.id, combine(target, cur));
        } else {
          report.supprimees++;
        }
        byId.set(inc.id, { ...inc });
      } else if (!cur) {
        byId.set(inc.id, { ...inc });
      }
      continue;
    }
    if (cur) {
      const newer = (inc.updatedAt || 0) > (cur.updatedAt || 0);
      if (cur.deleted) {
        if (newer) {
          report.ajoutees++;
          byId.set(inc.id, { ...inc });
        }
        continue;
      }
      // Fiches ajoutées des deux côtés au même livre : on garde tout.
      const fiches = mergeParts(cur.fiches, inc.fiches);
      if (newer || JSON.stringify(fiches) !== JSON.stringify(cur.fiches)) {
        report.misesAJour++;
        byId.set(inc.id, { ...(newer ? inc : cur), fiches, updatedAt: Math.max(inc.updatedAt || 0, cur.updatedAt || 0) });
      }
      continue;
    }
    const twin = [...byId.values()].find((b) => !b.deleted && keyOf(b) === keyOf(inc));
    if (twin) {
      // Même livre, identifiants différents : on garde l'identifiant le plus petit sur les deux appareils.
      const [keep, drop] = twin.id < inc.id ? [twin, inc] : [inc, twin];
      byId.set(keep.id, combine(keep, drop));
      byId.set(drop.id, { id: drop.id, deleted: true, mergedInto: keep.id, updatedAt: Date.now() });
      report.reunies++;
      continue;
    }
    byId.set(inc.id, { ...inc });
    report.ajoutees++;
  }

  const books = [...byId.values()];
  const liveBooks = books.filter((b) => !b.deleted);
  const order = (incoming.order?.updatedAt || 0) > (local.order?.updatedAt || 0) ? incoming.order : local.order;
  const settings =
    (incoming.settings?.updatedAt || 0) > (local.settings?.updatedAt || 0) ? incoming.settings : local.settings;
  return {
    books,
    order: { value: reconcileOrder(order?.value, liveBooks), updatedAt: order?.updatedAt || 0 },
    settings: settings || { value: {}, updatedAt: 0 },
    report,
  };
}
