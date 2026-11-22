// Lecture du fichier « My Clippings.txt » de la liseuse Kindle.
import { bookKey, mergePassages } from './util.js';

const SEPARATOR = /^={5,}\s*$/m;
const BOOKMARK = /signet|bookmark|marcador|lesezeichen|segnalibro/i;
const NOTE = /\bnote\b|\bnota\b|notiz/i;

/** Sépare « Titre (Auteur) » ; gère les parenthèses dans le titre et « Nom, Prénom ». */
export function parseTitleLine(line) {
  const clean = line.replace(/^﻿/, '').trim();
  const m = clean.match(/^(.*)\(([^()]*)\)\s*$/);
  let title = clean;
  let author = '';
  if (m && m[1].trim()) {
    title = m[1].trim();
    author = m[2].trim();
  }
  title = title
    .replace(/\s*\((french|english)\s+edition\)\s*$/i, '')
    .replace(/\s*\(édition française\)\s*$/i, '')
    .trim();
  const parts = author.split(',').map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1] && !author.includes(';')) {
    author = `${parts[1]} ${parts[0]}`;
  }
  return { title, author };
}

/** Numéro d'emplacement (ou de page) pour remettre les passages dans l'ordre du livre. */
function locationOf(infoLine) {
  const loc = infoLine.match(/(?:emplacement|location|position|posición|posizione)\s*:?\s*(\d+)/i);
  if (loc) return parseInt(loc[1], 10);
  const page = infoLine.match(/(?:page|página|pagina|seite)\s*:?\s*(\d+)/i);
  if (page) return parseInt(page[1], 10) * 1000;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Renvoie la liste des livres trouvés : [{ key, title, author, passages: [texte] }],
 * triée par titre. Signets et notes personnelles ignorés, doublons supprimés.
 */
export function parseClippings(text) {
  const books = new Map();
  const entries = String(text ?? '').replace(/\r\n?/g, '\n').split(SEPARATOR);
  for (const entry of entries) {
    const lines = entry.split('\n').map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length < 2) continue;
    const titleLine = lines[0];
    const infoLine = lines[1];
    if (BOOKMARK.test(infoLine) || NOTE.test(infoLine)) continue;
    const body = lines.slice(2).join(' ').replace(/\s+/g, ' ').trim();
    if (!body) continue;
    const { title, author } = parseTitleLine(titleLine);
    const key = bookKey(title, author);
    if (!books.has(key)) books.set(key, { key, title, author, items: [] });
    books.get(key).items.push({ text: body, loc: locationOf(infoLine) });
  }
  return [...books.values()]
    .map((b) => ({
      key: b.key,
      title: b.title,
      author: b.author,
      passages: mergePassages(
        b.items.sort((x, y) => x.loc - y.loc).map((i) => i.text),
      ),
    }))
    .filter((b) => b.passages.length)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
}
