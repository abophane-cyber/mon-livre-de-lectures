// Lecture d'une réponse de Claude écrite en texte à titres (le format demandé),
// avec ou sans les « # » (selon la façon dont elle a été copiée), avec du texte autour.
import { normalize } from './util.js';

/** Rubriques reconnues : libellé normalisé → clé. */
const SECTIONS = {
  genre: 'genre',
  accroche: 'accroche',
  resume: 'resume',
  'resume du livre': 'resume',
  'idees cles': 'idees_cles',
  'idees principales': 'idees_cles',
  idees: 'idees_cles',
  personnages: 'personnages',
  'personnages principaux': 'personnages',
  'notions cles': 'notions',
  notions: 'notions',
  'personnages ou notions cles': 'personnages',
  citations: 'citations',
  'citations commentees': 'citations',
  'a retenir': 'a_retenir',
  'pour qui': 'pour_qui',
  notice: 'notice',
  'notice bibliographique': 'notice',
  bibliographie: 'bibliographie',
  references: 'bibliographie',
  'references bibliographiques': 'bibliographie',
};

const NOTICE_LABELS = {
  editeur: 'editeur',
  'maison d edition': 'editeur',
  collection: 'collection',
  edition: 'edition',
  traduction: 'traduction',
  traducteur: 'traduction',
  'traduit par': 'traduction',
  isbn: 'isbn',
  pages: 'pages',
  'nombre de pages': 'pages',
  'date de parution': 'date_parution',
  'premiere parution': 'date_parution',
  parution: 'date_parution',
};

const EMPTY_VALUE = /^(?:-+|—|–|\.+|aucune?|non visible|non indiqu[ée]e?|non pr[ée]cis[ée]e?|inconnue?|n\/?a|vide|\(.*\))$/i;
const LIST_MARK = /^\s*(?:[-*•–]|\d+[.)])\s+/;

const stripEmphasis = (s) => s.replace(/\*\*|__/g, '').replace(/^\*(.+)\*$/, '$1').replace(/^_(.+)_$/, '$1').trim();

/** Si la ligne est un titre de rubrique, renvoie { key, rest } (rest = texte après « : » sur la même ligne). */
function headingOf(line) {
  const hashed = /^\s*#{1,6}\s*/.test(line);
  const raw = line.replace(/^\s*#{1,6}\s*/, '').trim();
  const bare = stripEmphasis(raw.replace(/^\*\*(.+?)\*\*/, '$1'));
  const m = bare.match(/^([^:：]{1,40}?)\s*[:：]\s*(.*)$/);
  const label = normalize(m ? m[1] : bare);
  const key = SECTIONS[label];
  if (!key) return null;
  // Sans « # », on n'accepte qu'une ligne courte (le titre seul, ou « Genre : … »).
  if (!hashed && !m && bare.length > 40) return null;
  return { key, rest: m ? stripEmphasis(m[2]) : '', notions: key === 'notions' };
}

const paragraphs = (lines) =>
  lines
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => stripEmphasis(l.replace(LIST_MARK, '').replace(/^>\s?/, ''))).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** Découpe une rubrique en éléments de liste (« - », « 1. », « ### »). */
function items(lines) {
  const out = [];
  // Texte copié depuis l'affichage : les puces ont pu disparaître. Chaque ligne devient alors un élément,
  // sauf une ligne sans « : » qui suit un titre seul (titre sur une ligne, explication dessous).
  const hasMarkers = lines.some((l) => LIST_MARK.test(l) || /^\s*#{3,6}\s/.test(l));
  for (const line of lines) {
    if (!line.trim()) continue;
    const prev = out[out.length - 1];
    const startsItem = hasMarkers
      ? LIST_MARK.test(line) || /^\s*#{3,6}\s/.test(line) || !prev
      : !prev || /[:：]|\s[—–]\s/.test(line) || prev.length > 1 || /[:：]|\s[—–]\s/.test(prev[0]);
    if (startsItem) out.push([line.replace(LIST_MARK, '').replace(/^\s*#{3,6}\s*/, '')]);
    else prev.push(line.trim());
  }
  return out;
}

/** « **Titre** : texte », « Titre — texte », ou titre sur une ligne puis texte. */
function pair(itemLines) {
  const first = itemLines[0].trim();
  const rest = itemLines.slice(1).join(' ').trim();
  let a;
  let b;
  const bold = first.match(/^\*\*(.+?)\*\*\s*[:：—–-]?\s*(.*)$/);
  if (bold) {
    a = bold[1];
    b = bold[2];
  } else {
    const m = first.match(/^(.{1,80}?)\s*(?:[:：]|\s[—–-]\s)\s*(.+)$/);
    if (m) [, a, b] = m;
    else [a, b] = [first, ''];
  }
  b = [b, rest].filter(Boolean).join(' ');
  return [stripEmphasis(a).replace(/[:：.]$/, '').trim(), stripEmphasis(b)];
}

const QUOTE_START = /^[«"“„]/;

function citations(lines) {
  const out = [];
  let cur = null;
  let lastWasQuote = false;
  const push = () => cur && (cur.texte || cur.commentaire) && out.push(cur);
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) {
      lastWasQuote = false;
      continue;
    }
    const isList = LIST_MARK.test(line);
    if (isList) line = line.replace(LIST_MARK, '');
    const isQuote = line.startsWith('>');
    if (isQuote) line = line.replace(/^>\s?/, '').trim();
    line = stripEmphasis(line);
    const comment = line.match(/^(?:commentaire|pourquoi|analyse)\s*[:：]\s*(.*)$/i);
    if (comment) {
      if (cur) cur.commentaire = [cur.commentaire, comment[1]].filter(Boolean).join(' ');
      lastWasQuote = false;
      continue;
    }
    const startsQuote = isQuote || QUOTE_START.test(line);
    if (isList || (startsQuote && (!cur || cur.commentaire || !lastWasQuote))) {
      push();
      cur = { texte: '', commentaire: '' };
    }
    if (startsQuote || (isQuote && cur)) {
      // « citation » — commentaire sur la même ligne
      const m = line.match(/^[«"“„](.+?)[»"”]\s*[—–:-]?\s*(.*)$/);
      if (m && !isQuote) {
        cur.texte = [cur.texte, m[1]].filter(Boolean).join(' ');
        if (m[2]) cur.commentaire = [cur.commentaire, stripEmphasis(m[2]).replace(/^\((.*)\)$/, '$1')].filter(Boolean).join(' ');
      } else {
        cur.texte = [cur.texte, line].filter(Boolean).join(' ');
      }
      lastWasQuote = true;
    } else if (cur) {
      if (cur.texte) cur.commentaire = [cur.commentaire, line].filter(Boolean).join(' ');
      else cur.texte = line;
      lastWasQuote = false;
    }
  }
  push();
  return out;
}

function notice(lines) {
  const out = {};
  for (const line of lines) {
    const m = stripEmphasis(line.replace(LIST_MARK, '')).match(/^\**([^:：]{1,40}?)\**\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const key = NOTICE_LABELS[normalize(m[1])];
    const value = stripEmphasis(m[2]).trim();
    if (key && value && !EMPTY_VALUE.test(value)) out[key] = value;
  }
  return out;
}

/**
 * Transforme la réponse texte en objet du même modèle que l'ancien JSON
 * (seules les rubriques trouvées sont présentes). Renvoie null si aucune rubrique n'est reconnue.
 */
export function parseTextAnswer(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*```/.test(l) && !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l));
  const buckets = {};
  let current = null;
  let notionsTitle = false;
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      const key = h.key === 'notions' ? 'personnages' : h.key;
      if (h.notions) notionsTitle = true;
      current = key;
      buckets[key] = buckets[key] || [];
      if (h.rest) buckets[key].push(h.rest);
      continue;
    }
    if (current) buckets[current].push(line);
  }
  if (!Object.keys(buckets).length) return null;

  const data = {};
  const one = (k) => buckets[k] && paragraphs(buckets[k]).join(' ');
  if (buckets.genre) data.genre = one('genre').replace(/\.$/, '');
  if (buckets.accroche) data.accroche = one('accroche');
  if (buckets.resume) data.resume = paragraphs(buckets.resume);
  if (buckets.idees_cles) data.idees_cles = items(buckets.idees_cles).map(pair).map(([titre, texte]) => ({ titre, texte }));
  if (buckets.personnages) {
    data.personnages_titre = notionsTitle ? 'Notions clés' : 'Personnages';
    data.personnages = items(buckets.personnages).map(pair).map(([nom, role]) => ({ nom, role }));
  }
  if (buckets.citations) data.citations = citations(buckets.citations);
  if (buckets.a_retenir) data.a_retenir = one('a_retenir');
  // Dernière rubrique : on ne garde que le premier paragraphe (Claude ajoute parfois une phrase de conclusion).
  if (buckets.pour_qui) data.pour_qui = paragraphs(buckets.pour_qui)[0] || '';
  if (buckets.notice) data.notice = notice(buckets.notice);
  if (buckets.bibliographie) {
    data.bibliographie = items(buckets.bibliographie)
      .map((it) => stripEmphasis(it.join(' ')))
      .filter((r) => r && !EMPTY_VALUE.test(r));
  }
  return data;
}
