// Petites fonctions utilitaires partagées (sans dépendance au navigateur).

/** Échappe un texte pour l'insérer sans danger dans du HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Clé qui identifie un livre : titre + auteur normalisés. */
export function bookKey(title, author) {
  return normalize(title) + '|' + normalize(author);
}

/** Normalise un texte pour comparer des citations (guillemets, espaces, apostrophes). */
export function normalizeQuote(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»„"]/g, '')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Découpe un texte collé en passages (séparés par une ligne vide). */
export function splitPassages(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export function joinPassages(passages) {
  return (passages || []).join('\n\n');
}

/**
 * Fusionne des listes de passages en gardant l'ordre, sans doublon,
 * et en supprimant un passage déjà contenu dans un passage plus long.
 */
export function mergePassages(...lists) {
  const all = [];
  const seen = new Set();
  for (const list of lists) {
    for (const p of list || []) {
      const t = String(p).trim();
      const k = normalizeQuote(t);
      if (!t || seen.has(k)) continue;
      seen.add(k);
      all.push({ t, k });
    }
  }
  return all
    .filter((a) => !all.some((b) => b !== a && b.k.length > a.k.length && b.k.includes(a.k)))
    .map((a) => a.t);
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Année approximative d'une date de parution libre (« 1857 », « vers 1600 », « IVe s. av. J.-C. »). */
export function yearOf(pubDate) {
  const s = String(pubDate ?? '');
  const m = s.match(/-?\d{1,4}/);
  if (!m) return null;
  let y = parseInt(m[0], 10);
  if (/av\.?\s*j|bc|bce|avant/i.test(s) && y > 0) y = -y;
  return y;
}

/** Nom de famille approximatif (dernier mot) pour trier par auteur. */
export function authorSortKey(author) {
  const words = normalize(author).split(' ').filter(Boolean);
  return words.length ? words[words.length - 1] + ' ' + words.join(' ') : '';
}

export function formatDate(ts, withTime = false) {
  if (!ts) return '';
  const d = new Date(ts);
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', opts);
}

export function pluralize(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}
