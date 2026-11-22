// Lecture d'une réponse de Claude écrite en texte à titres (le format demandé),
// avec ou sans les « # » (selon la façon dont elle a été copiée), avec du texte autour.
import { normalize } from './util.js';

/**
 * Rubriques reconnues, testées dans l'ordre sur le titre normalisé (sans accents, sans emoji, sans numéro).
 * Claude invente souvent ses propres titres : on accepte de nombreuses variantes.
 */
const SECTION_RULES = [
  // Rubriques d'avis ou de commentaires de l'IA : ignorées (l'utilisateur ne veut que le résumé).
  ['_ignore', /^(mon |notre )?(avis( personnel| critique)?|analyse( critique| personnelle)?|critique|commentaires?( personnels?)?|appreciation( personnelle)?|evaluation|note( globale| finale)?|points? forts?( et (points? )?faibles?)?|points? faibles?|forces et (faiblesses|limites)|limites( du livre)?|pourquoi lire ce livre|ressenti|mon ressenti|impressions?|verdict|recommandation|conclusion( personnelle)?|en conclusion|bilan|pour aller plus loin|suggestions? de lecture|lectures? complementaires?|questions? (de reflexion|pour aller plus loin|de discussion))$/],
  ['chapitre', /^(chapitre|titre du chapitre|chapitre resume|chapitre concerne)$/],
  ['genre', /^(genre|type de livre|categorie)$/],
  ['accroche', /^(accroche|en une phrase|en bref|le livre en une phrase|pitch)$/],
  ['notice', /^(notice|notice bibliographique|informations? (sur le livre|bibliographiques?|editoriales?))$/],
  ['bibliographie', /^(la )?(bibliographie|references?|sources?|notes et references|ouvrages? (cites|de reference)|livres? cites)( (bibliographiques?|selective|indicative|du livre|de l ouvrage|citees?|utilisees?))?$/],
  ['citations', /^(les )?(citations?|extraits?|passages? (cles|marquants?|importants?))( (marquantes?|cles|commentees?|choisies|importantes?|a retenir|du livre))?$/],
  ['a_retenir', /^(a retenir|ce qu il faut retenir|l essentiel|essentiel a retenir|points? a retenir|idees? a retenir)$/],
  ['pour_qui', /^(pour qui|pour quels? lecteurs?|a qui s adresse (ce livre|cet ouvrage)|a qui le recommander|public( vise)?|lecteurs? cibles?|recommande pour)$/],
  ['notions', /^(les )?(notions?|concepts?)( (cles|principa\w*|essenti\w*|importants?|du livre))?$/],
  ['personnages', /^(les )?(principaux )?personnages( (principaux|cles|du livre))?$/],
  ['personnages', /^personnages ou notions( cles)?$/],
  ['idees_cles', /^(les )?(\w+ )?(idees?|themes?|points?|arguments?|messages?|enseignements?|lecons?|axes?|grandes idees)( (cles|principa\w*|essenti\w*|forts?|importants?|majeurs?|du livre|developpes?))?$/],
  ['resume', /^(le )?(resume|synthese|contenu|presentation)( (du livre|de l ouvrage|detaille|general|de l essai|du texte|des captures))?$/],
  ['resume', /^(de quoi (parle|traite) (le livre|l ouvrage|ce livre)|en resume)$/],
];

/** Nettoie un titre : « ## 📖 1. **Résumé du livre :** » → « resume du livre ». */
function headingLabel(text) {
  const t = stripEmphasis(text)
    .replace(/^[^\p{L}\d]+/u, '')
    .replace(/^(?:\d+|[IVX]+)\s*[.)\-–]\s*/i, '')
    .replace(/[\s:：.!?]+$/, '');
  return normalize(t);
}

function sectionOf(label) {
  if (!label || label.split(' ').length > 8) return null;
  for (const [key, re] of SECTION_RULES) if (re.test(label)) return key;
  return null;
}

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

const stripEmphasis = (s) =>
  s
    .replace(/\*\*|__/g, '')
    .replace(/^\*(.+)\*$/, '$1')
    .replace(/^_(.+)_$/, '$1')
    // italique au milieu d'une phrase : « *Le Capital* » → « Le Capital »
    .replace(/(^|[\s(«"“])[*_]([^*_\n]+?)[*_](?=[\s,.;:!?)»"”]|$)/g, '$1$2')
    .trim();

/**
 * Si la ligne est un titre, renvoie { key, rest, hashed } :
 * key = rubrique reconnue (ou null pour un titre « # » inconnu), rest = texte après « : » sur la même ligne.
 * Renvoie null pour une ligne ordinaire.
 */
function headingOf(line) {
  if (LIST_MARK.test(line) || /^\s*>/.test(line)) return null;
  const hashed = /^\s*#{1,6}\s/.test(line);
  const raw = line.replace(/^\s*#{1,6}\s*/, '').trim();
  if (!raw) return null;
  const wholeBold = /^\*\*[^*]+\*\*\s*[:：]?\s*$/.test(raw);
  // « **Titre :** suite » ou « Titre : suite »
  const bold = raw.match(/^\*\*([^*]+?)\*\*\s*[:：]?\s*(.*)$/);
  const plain = raw.match(/^([^:：]{1,60}?)\s*[:：]\s*(.*)$/);
  const head = bold ? bold[1] : plain ? plain[1] : raw;
  const rest = bold ? bold[2] : plain ? plain[2] : '';
  // « ## Chapitre 3 : La dette » ou « CHAPITRE 3 – La dette » : tout le titre est le titre du chapitre.
  if (/^chapitre\s+(\d+|[ivxlc]+|premier|[a-z]+)\b/.test(headingLabel(raw)) && (hashed || wholeBold || bold)) {
    return { key: 'chapitre', rest: stripEmphasis(raw.replace(/^\*\*|\*\*$/g, '')).replace(/[\s:：]+$/, ''), hashed };
  }
  let key = sectionOf(headingLabel(head));
  // « Commentaire : … » sous une citation n'est pas un titre : seule une vraie ligne de titre ouvre une rubrique ignorée.
  if (key === '_ignore' && !hashed && !wholeBold) key = null;
  if (key) {
    // Sans « # » ni gras, il faut une ligne courte (titre seul) ou « Libellé : texte ».
    if (!hashed && !bold && !plain && raw.length > 60) return null;
    return { key, rest: stripEmphasis(rest), hashed };
  }
  if (hashed || wholeBold) return { key: null, rest: '', hashed };
  return null;
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
  // _pre = texte avant le premier titre ; _autre = rubriques que l'on ne reconnaît pas.
  const buckets = { _pre: [], _autre: [], _ignore: [] };
  let current = '_pre';
  let level = 99;
  let notionsTitle = false;
  const levelOf = (line) => (line.match(/^\s*(#{1,6})\s/)?.[1].length ?? 7);
  for (const line of lines) {
    const h = headingOf(line);
    const known = current !== '_pre' && current !== '_autre';
    if (h && h.key) {
      const key = h.key === 'notions' ? 'personnages' : h.key;
      if (h.key === 'notions') notionsTitle = true;
      current = key;
      level = levelOf(line);
      buckets[key] = buckets[key] || [];
      if (h.rest) buckets[key].push(h.rest);
      continue;
    }
    if (h && h.hashed && !(known && levelOf(line) > level)) {
      // Titre inconnu (« # Fiche de lecture… », « ## Le contexte »…) : son contenu est gardé à part.
      current = '_autre';
      level = 99;
      buckets._autre.push('', line.replace(/^\s*#{1,6}\s*/, ''), '');
      continue;
    }
    // Sous-titre dans une rubrique connue (ex. « ### Le contexte » dans le résumé) : on le garde comme paragraphe.
    buckets[current].push(h && h.hashed ? `\n${line.replace(/^\s*#{1,6}\s*/, '')}\n` : line);
  }

  const data = {};
  const knownKeys = Object.keys(buckets).filter((k) => !k.startsWith('_'));
  // Solution de secours : pas de rubrique « résumé » reconnue → tout le texte libre devient le résumé.
  const noticeOnly = knownKeys.length && knownKeys.every((k) => k === 'notice' || k === 'bibliographie');
  if (!buckets.resume && !noticeOnly) {
    const chat = /^(voici|bien s[uû]r|d.accord|avec plaisir|je vous|j.ai (lu|r[ée]dig)|excellent|parfait)\b|[:：]$/i;
    const free = paragraphs([...buckets._pre, '', ...buckets._autre]).filter((p) => !chat.test(p));
    // Au moins quelques phrases, pour ne pas transformer un message d'erreur de Claude en fiche.
    if (free.join(' ').length >= 80) {
      data.resume = free;
      data._fallback = true;
    }
  }
  if (!knownKeys.length && !data.resume) return null;

  const one = (k) => buckets[k] && paragraphs(buckets[k]).join(' ');
  if (buckets.chapitre) {
    const c = (paragraphs(buckets.chapitre)[0] || '').replace(/\.$/, '');
    // Ligne laissée vide, ou consigne du modèle recopiée telle quelle : pas de titre de chapitre.
    if (c && !EMPTY_VALUE.test(c) && !/tel qu.il appara|laisse vide|ou rien|pas de (titre|chapitre)|aucun titre|^\[.*\]$/i.test(c)) data.chapitre = c;
  }
  if (buckets.genre) data.genre = one('genre').replace(/\.$/, '');
  if (buckets.accroche) data.accroche = one('accroche');
  if (buckets.resume) data.resume = paragraphs(buckets.resume);
  if (!data.accroche) {
    // « Accroche » parfois écrite en italique juste sous le titre, avant la première rubrique.
    const italic = [...buckets._pre, ...buckets._autre].map((l) => l.trim()).find((l) => /^[*_][^*_].{10,}[*_]$/.test(l));
    if (italic) data.accroche = stripEmphasis(italic.replace(/^[*_]|[*_]$/g, ''));
  }
  if (buckets.idees_cles) data.idees_cles = items(buckets.idees_cles).map(pair).map(([titre, texte]) => ({ titre, texte }));
  if (buckets.personnages) {
    data.personnages_titre = notionsTitle ? 'Notions clés' : 'Personnages';
    data.personnages = items(buckets.personnages).map(pair).map(([nom, role]) => ({ nom, role }));
  }
  // Citations seules : les commentaires ajoutés par l'IA sous les citations ne sont pas gardés.
  if (buckets.citations) data.citations = citations(buckets.citations).map((c) => ({ texte: c.texte, commentaire: '' }));
  if (buckets.a_retenir) data.a_retenir = one('a_retenir');
  // Dernière rubrique : on ne garde que le premier paragraphe (Claude ajoute parfois une phrase de conclusion).
  if (buckets.pour_qui) data.pour_qui = paragraphs(buckets.pour_qui)[0] || '';
  if (buckets.notice) data.notice = notice(buckets.notice);
  if (buckets.bibliographie) {
    // Pas de phrase de l'IA à la fin (« Souhaitez-vous… ? », « N'hésitez pas… »).
    const chat = /\?\s*$|^(souhaitez|voulez|n.h[ée]sitez|j.esp[èe]re|si vous|bonne lecture|je peux|dites-moi)/i;
    data.bibliographie = items(buckets.bibliographie.filter((l) => !chat.test(l.trim())))
      .map((it) => stripEmphasis(it.join(' ')))
      .filter((r) => r && !EMPTY_VALUE.test(r) && !chat.test(r));
  }
  return data;
}
