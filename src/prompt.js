// Préparation de la demande pour Claude, et lecture / vérification de sa réponse.
// La fiche est demandée en texte à titres (Claude le fait naturellement sur claude.ai) ;
// l'ancien format JSON reste accepté.
import { normalizeQuote } from './util.js';
import { readBibliographie, readNotice } from './notice.js';
import { parseTextAnswer } from './answer.js';

export const LANGUES = ['français', 'anglais', 'espagnol', 'allemand', 'italien', 'portugais'];

export const LONGUEURS = {
  court: { label: 'Court', resume: '1 à 2 paragraphes', idees: '3', citations: '2 à 3' },
  moyen: { label: 'Moyen', resume: '3 à 4 paragraphes', idees: '4 à 5', citations: '3 à 5' },
  detaille: { label: 'Détaillé', resume: '5 à 8 paragraphes', idees: '6 à 8', citations: '5 à 8' },
};

const MODELE = `GENRE : Roman
ACCROCHE : Une seule phrase qui donne envie de lire le livre.

## RÉSUMÉ
Premier paragraphe.

Deuxième paragraphe.

## IDÉES CLÉS
- **Titre court** : explication en 2 à 4 phrases.
- **Autre idée** : explication.

## PERSONNAGES
- **Nom** : qui il est et son rôle dans le livre.

## CITATIONS
> « Extrait recopié mot pour mot. »
Commentaire : pourquoi cet extrait compte.

> « Autre extrait. »
Commentaire : …

## À RETENIR
Ce qu'il faut garder du livre, en 2 à 4 phrases.

## POUR QUI ?
À qui je recommanderais ce livre, en 1 à 2 phrases.`;

const MODELE_NOTICE = `## NOTICE
- Éditeur :
- Collection :
- Édition :
- Traduction :
- ISBN :
- Nombre de pages :
- Date de parution :

## BIBLIOGRAPHIE
- Référence recopiée telle quelle.`;

const CONSIGNES_NOTICE = `- Si une capture montre les informations du livre (page de copyright, quatrième de couverture, fiche du livre), remplis la rubrique NOTICE uniquement avec ce qui y est écrit : éditeur, collection, édition (par exemple « Points, 2024 »), traduction (« traduit de l'anglais par … »), ISBN, nombre de pages, date de première parution. Laisse vide ce qui n'est pas visible. N'invente jamais un ISBN ni un éditeur.
- Si une capture montre une bibliographie, des références ou des sources, recopie chaque référence telle quelle dans la rubrique BIBLIOGRAPHIE (une par ligne).
- Ces informations ne font pas partie du texte à résumer : ne les utilise pas pour le résumé ni pour les citations.`;

const CONSIGNE_FORMAT = `Réponds directement dans la conversation, en texte simple : pas de document, pas d'artefact, pas de bloc de code, pas de JSON. Suis exactement ce modèle, avec ces titres en majuscules et dans cet ordre, sans rien ajouter avant « GENRE » ni après la dernière rubrique :`;

/** Texte complet à coller dans Claude. Avec `book.captures`, Claude résume le texte des captures d'écran jointes. */
export function buildPrompt(book) {
  const L = LONGUEURS[book.length] || LONGUEURS.moyen;
  const langue = book.lang || 'français';
  const captures = !!book.captures;
  const texte = (book.passages || []).join('\n\n');
  const source = captures ? 'LE TEXTE DE MES CAPTURES (et mon texte écrit ci-dessous, s\'il y en a)' : 'MON TEXTE ci-dessous';
  const citeFrom = captures ? 'depuis le texte de mes captures ou mon texte écrit' : 'depuis mon texte';
  return `Tu rédiges une fiche de lecture pour mon livre de lectures personnel, à partir ${
    captures ? 'du texte de mes captures d\'écran' : 'du texte que je te donne ci-dessous'
  }. C'est ce texte que tu résumes.

LIVRE
- Titre : ${book.title || '(inconnu)'}
- Auteur : ${book.author || '(inconnu)'}
- Date de parution : ${book.pubDate || '(non précisée)'}
${captures ? `
CAPTURES D'ÉCRAN
J'ai joint à ce message des captures d'écran de pages du livre (liseuse, appli Kindle ou photo de page).
a. Lis TOUT le texte du livre visible sur les captures, dans l'ordre des captures, qu'il soit surligné ou non. C'est ce texte que tu dois résumer.
b. Ignore tout ce qui n'est pas le texte du livre : menus, boutons, heure, batterie, numéros de page ou d'emplacement, titres de l'appli.
c. Ne recopie pas tout le texte dans ta réponse : résume-le. Seules les citations sont recopiées mot pour mot.
d. Si un mot est illisible, ne l'invente pas.
e. Notice et bibliographie :
${CONSIGNES_NOTICE}
` : ''}
RÈGLES
1. Appuie-toi d'abord sur ${source}. Tu peux compléter avec ta connaissance du livre seulement si tu le connais bien. N'invente jamais d'intrigue, de personnage ou d'événement. En cas de doute, reste sur ce que dit le texte.
2. Les citations doivent être recopiées MOT POUR MOT ${citeFrom}, et uniquement de là (tu peux en prendre un extrait, sans rien changer à l'intérieur). Garde leur langue d'origine.
3. Rédige tout le reste de la fiche en ${langue}.
4. Longueur : résumé de ${L.resume}, ${L.idees} idées clés, ${L.citations} citations (moins si le texte ne suffit pas).
5. Pour un essai ou un livre sans personnages, remplace le titre « ## PERSONNAGES » par « ## NOTIONS CLÉS » et présente les notions principales.
6. ${CONSIGNE_FORMAT}

${MODELE}${captures ? `\n\n${MODELE_NOTICE}` : ''}

MON TEXTE${captures ? ' ÉCRIT (EN PLUS DE MES CAPTURES)' : ''}
${texte || (captures ? '(aucun : tout est dans mes captures)' : '(aucun texte)')}`;
}

/** Demande courte : seulement la notice et la bibliographie, depuis des captures (la fiche n'est pas refaite). */
export function buildNoticePrompt(book) {
  return `J'ai joint à ce message des captures d'écran concernant le livre « ${book.title || '(inconnu)'} »${book.author ? ` de ${book.author}` : ''}.
Ne rédige pas de résumé. Lis seulement les captures et complète ma notice bibliographique :
${CONSIGNES_NOTICE}

Réponds directement dans la conversation, en texte simple (pas de document, pas de bloc de code), en suivant exactement ce modèle :

${MODELE_NOTICE}`;
}

/** Essaie de lire un objet JSON (ancien format). Renvoie null si ce n'en est pas un. */
function tryJson(text) {
  const raw = String(text ?? '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const data = JSON.parse(body.slice(start, end + 1));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const asParas = (v) =>
  (Array.isArray(v) ? v.map(str) : str(v).split(/\n\s*\n/).map((s) => s.trim())).filter(Boolean);
/** Retire les guillemets autour d'une citation (l'appli ajoute les siens). */
export const stripQuotes = (s) => str(s).replace(/^[«"“„'\s ]+/, '').replace(/[»"”'\s ]+$/, '');
const asList = (v, a, b) =>
  (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string' ? { [a]: x, [b]: '' } : { [a]: str(x?.[a]), [b]: str(x?.[b]) }))
    .filter((x) => x[a] || x[b]);

const FICHE_KEYS = ['accroche', 'resume', 'idees_cles', 'citations', 'a_retenir', 'pour_qui'];

/**
 * Lit la réponse collée (texte à titres, ou JSON).
 * Renvoie { ok: true, fiche, passages, notice, bibliographie } (partial: true si seulement notice/bibliographie),
 * ou { ok: false, errors: [...] }.
 */
export function parseAnswer(text) {
  const json = tryJson(text);
  const data = json && [...FICHE_KEYS, 'notice', 'bibliographie'].some((k) => k in json) ? json : parseTextAnswer(text);
  if (!data) {
    return {
      ok: false,
      errors: ["Je ne reconnais pas de fiche dans ce texte : aucune rubrique (RÉSUMÉ, IDÉES CLÉS…) n'a été trouvée."],
    };
  }
  const notice = readNotice(data.notice);
  const bibliographie = readBibliographie(data.bibliographie);
  // Réponse « notice seulement » : aucune rubrique de fiche, seulement notice et/ou bibliographie.
  if (!FICHE_KEYS.some((k) => k in data) && ('notice' in data || 'bibliographie' in data)) {
    return { ok: true, partial: true, fiche: null, passages: [], notice, bibliographie };
  }
  const fiche = {
    genre: str(data.genre),
    accroche: str(data.accroche),
    resume: asParas(data.resume),
    idees_cles: asList(data.idees_cles, 'titre', 'texte'),
    personnages_titre: str(data.personnages_titre) || 'Personnages',
    personnages: asList(data.personnages, 'nom', 'role'),
    citations: asList(data.citations, 'texte', 'commentaire').map((c) => ({ ...c, texte: stripQuotes(c.texte) })),
    a_retenir: Array.isArray(data.a_retenir) ? data.a_retenir.map(str).join(' ') : str(data.a_retenir),
    pour_qui: str(data.pour_qui),
  };
  const errors = [];
  if (!fiche.accroche) errors.push('Il manque la rubrique « ACCROCHE ».');
  if (!fiche.resume.length) errors.push('Il manque la rubrique « RÉSUMÉ ».');
  if (!fiche.idees_cles.length) errors.push('Il manque la rubrique « IDÉES CLÉS ».');
  if (!('citations' in data)) errors.push('Il manque la rubrique « CITATIONS ».');
  if (!fiche.a_retenir) errors.push('Il manque la rubrique « À RETENIR ».');
  if (!fiche.pour_qui) errors.push('Il manque la rubrique « POUR QUI ? ».');
  if (errors.length) return { ok: false, errors };
  // Passages recopiés par Claude (ancien format, facultatif).
  const passages = (Array.isArray(data.passages) ? data.passages : [])
    .map((p) => (typeof p === 'string' ? p : str(p?.texte)))
    .map((p) => stripQuotes(p).replace(/\s+/g, ' '))
    .filter(Boolean);
  return { ok: true, fiche, passages, notice, bibliographie };
}

/** Marque les citations qui ne figurent pas mot pour mot dans le texte donné. */
export function checkCitations(fiche, passages) {
  const haystack = normalizeQuote((passages || []).join(' \n '));
  let missing = 0;
  for (const c of fiche.citations) {
    const needle = normalizeQuote(c.texte).replace(/^(\.\.\.|\[\.\.\.\])\s*/, '').replace(/\s*(\.\.\.|\[\.\.\.\])$/, '');
    const parts = needle.split(/\s*(?:\[\.\.\.\]|\(\.\.\.\)|\.\.\.)\s*/).filter(Boolean);
    c.introuvable = !parts.length || !parts.every((p) => haystack.includes(p));
    if (c.introuvable) missing++;
  }
  return missing;
}

/** Message à renvoyer à Claude quand la réponse ne convient pas. */
export function buildFixPrompt({ errors = [], badCitations = [] }) {
  const lines = ['Ta réponse ne convient pas encore :'];
  for (const e of errors) lines.push(`- ${e}`);
  if (badCitations.length) {
    lines.push('- Ces citations ne figurent pas mot pour mot dans mon texte :');
    for (const c of badCitations) lines.push(`  « ${c} »`);
    lines.push('  Remplace-les par des extraits recopiés exactement depuis mon texte.');
  }
  lines.push(
    '',
    'Renvoie la fiche complète corrigée, directement dans la conversation (pas de document ni de bloc de code), en suivant exactement le modèle demandé : GENRE, ACCROCHE, puis les rubriques ## RÉSUMÉ, ## IDÉES CLÉS, ## PERSONNAGES (ou ## NOTIONS CLÉS), ## CITATIONS, ## À RETENIR, ## POUR QUI ?',
  );
  return lines.join('\n');
}
