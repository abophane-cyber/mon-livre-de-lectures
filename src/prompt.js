// Préparation de la demande pour Claude, et lecture / vérification de sa réponse.
import { normalizeQuote } from './util.js';
import { readBibliographie, readNotice } from './notice.js';

export const LANGUES = ['français', 'anglais', 'espagnol', 'allemand', 'italien', 'portugais'];

export const LONGUEURS = {
  court: { label: 'Court', resume: '1 à 2 paragraphes', idees: '3', citations: '2 à 3' },
  moyen: { label: 'Moyen', resume: '3 à 4 paragraphes', idees: '4 à 5', citations: '3 à 5' },
  detaille: { label: 'Détaillé', resume: '5 à 8 paragraphes', idees: '6 à 8', citations: '5 à 8' },
};

const EXEMPLE = `{
  "genre": "Roman",
  "accroche": "Une seule phrase qui donne envie de lire le livre.",
  "resume": ["Premier paragraphe.", "Deuxième paragraphe."],
  "idees_cles": [{ "titre": "Titre court", "texte": "Explication en 2 à 4 phrases." }],
  "personnages_titre": "Personnages",
  "personnages": [{ "nom": "Nom", "role": "Qui il est et son rôle dans le livre." }],
  "citations": [{ "texte": "Extrait recopié mot pour mot de mes passages.", "commentaire": "Pourquoi ce passage compte." }],
  "a_retenir": "Ce qu'il faut garder du livre, en 2 à 4 phrases.",
  "pour_qui": "À qui je recommanderais ce livre, en 1 à 2 phrases."
}`;

const EXEMPLE_NOTICE = `"notice": { "editeur": "", "collection": "", "edition": "", "traduction": "", "isbn": "", "pages": "", "date_parution": "" },
  "bibliographie": ["Référence recopiée telle quelle depuis une capture."]`;

const EXEMPLE_CAPTURES = EXEMPLE.replace('{\n', `{\n  ${EXEMPLE_NOTICE},\n`).replace(
  'Extrait recopié mot pour mot de mes passages.',
  'Extrait recopié mot pour mot depuis le texte de mes captures.',
);

const CONSIGNES_NOTICE = `- Si une capture montre les informations du livre (page de copyright, quatrième de couverture, fiche du livre), remplis "notice" uniquement avec ce qui y est écrit : éditeur, collection, édition (par exemple « Points, 2024 »), traduction (« traduit de l'anglais par … »), ISBN, nombre de pages, date de première parution. Laisse "" tout ce qui n'est pas visible. N'invente jamais un ISBN ni un éditeur.
- Si une capture montre une bibliographie, des références ou des sources, recopie chaque référence telle quelle dans "bibliographie" (un élément par référence).
- Ces informations ne font pas partie du texte à résumer : ne les utilise pas pour le résumé ni pour les citations.`;

/** Texte complet à coller dans Claude. Avec `book.captures`, Claude résume le texte des captures d'écran jointes. */
export function buildPrompt(book) {
  const L = LONGUEURS[book.length] || LONGUEURS.moyen;
  const langue = book.lang || 'français';
  const captures = !!book.captures;
  const passages = (book.passages || []).map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
  const source = captures ? 'LE TEXTE DE MES CAPTURES (et mes passages écrits ci-dessous, s\'il y en a)' : 'MES PASSAGES ci-dessous';
  const citeFrom = captures ? 'depuis le texte de mes captures ou mes passages écrits' : 'depuis mes passages';
  return `Tu rédiges une fiche de lecture pour mon livre de lectures personnel, à partir ${
    captures ? 'du texte de mes captures d\'écran' : 'des passages que j\'ai surlignés'
  }.

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
1. Appuie-toi d'abord sur ${source}. Tu peux compléter avec ta connaissance du livre seulement si tu le connais bien. N'invente jamais d'intrigue, de personnage ou d'événement. En cas de doute, reste sur ce que dit ${captures ? 'le texte' : 'mes passages'}.
2. Les citations doivent être recopiées MOT POUR MOT ${citeFrom}, et uniquement de là (tu peux en prendre un extrait, sans rien changer à l'intérieur). Garde leur langue d'origine.
3. Rédige tout le reste de la fiche en ${langue}.
4. Longueur : résumé de ${L.resume}, ${L.idees} idées clés, ${L.citations} citations (moins si mes passages ne suffisent pas).
5. Pour un essai ou un livre sans personnages, mets "personnages_titre": "Notions clés" et présente les notions principales dans "personnages" (nom = la notion, role = son explication).
6. Réponds UNIQUEMENT avec un objet JSON valide, dans un bloc de code \`\`\`json, sans aucun texte avant ou après. Utilise exactement ces clés :

${captures ? EXEMPLE_CAPTURES : EXEMPLE}

MES PASSAGES ${captures ? 'ÉCRITS (EN PLUS DE MES CAPTURES)' : 'SURLIGNÉS'}
${passages || (captures ? '(aucun : tout est dans mes captures)' : '(aucun passage)')}`;
}

/** Demande courte : seulement la notice et la bibliographie, depuis des captures (la fiche n'est pas refaite). */
export function buildNoticePrompt(book) {
  return `J'ai joint à ce message des captures d'écran concernant le livre « ${book.title || '(inconnu)'} »${book.author ? ` de ${book.author}` : ''}.
Ne rédige pas de résumé. Lis seulement les captures et complète ma notice bibliographique :
${CONSIGNES_NOTICE}

Réponds UNIQUEMENT avec un objet JSON valide, dans un bloc de code \`\`\`json, sans aucun texte avant ou après, avec exactement ces clés :

{
  ${EXEMPLE_NOTICE}
}`;
}

/** Extrait l'objet JSON d'une réponse (avec ou sans bloc de code, avec du texte autour). */
function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('aucun objet JSON trouvé');
  return JSON.parse(body.slice(start, end + 1));
}

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const asParas = (v) =>
  (Array.isArray(v) ? v.map(str) : str(v).split(/\n\s*\n/).map((s) => s.trim())).filter(Boolean);
/** Retire les guillemets autour d'une citation (l'appli ajoute les siens). */
export const stripQuotes = (s) => str(s).replace(/^[«"“„'\s ]+/, '').replace(/[»"”'\s ]+$/, '');
const asList = (v, a, b) =>
  (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string' ? { [a]: x, [b]: '' } : { [a]: str(x?.[a]), [b]: str(x?.[b]) }))
    .filter((x) => x[a] || x[b]);

/**
 * Lit la réponse collée. Renvoie { ok: true, fiche } ou { ok: false, errors: [...] }.
 */
export function parseAnswer(text) {
  let data;
  try {
    data = extractJson(text);
  } catch (e) {
    return { ok: false, errors: [`La réponse ne contient pas de JSON lisible (${e.message}).`] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['La réponse doit être un objet JSON { ... }.'] };
  }
  const notice = readNotice(data.notice);
  const bibliographie = readBibliographie(data.bibliographie);
  // Réponse « notice seulement » : aucune rubrique de fiche, seulement notice et/ou bibliographie.
  const ficheKeys = ['accroche', 'resume', 'idees_cles', 'citations', 'a_retenir', 'pour_qui'];
  if (!ficheKeys.some((k) => k in data) && ('notice' in data || 'bibliographie' in data)) {
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
  if (!fiche.accroche) errors.push('Il manque « accroche ».');
  if (!fiche.resume.length) errors.push('Il manque « resume ».');
  if (!fiche.idees_cles.length) errors.push('Il manque « idees_cles ».');
  if (!Array.isArray(data.citations)) errors.push('Il manque « citations » (une liste).');
  if (!fiche.a_retenir) errors.push('Il manque « a_retenir ».');
  if (!fiche.pour_qui) errors.push('Il manque « pour_qui ».');
  if (errors.length) return { ok: false, errors };
  // Passages recopiés par Claude depuis les captures d'écran (facultatif).
  const passages = (Array.isArray(data.passages) ? data.passages : [])
    .map((p) => (typeof p === 'string' ? p : str(p?.texte)))
    .map((p) => stripQuotes(p).replace(/\s+/g, ' '))
    .filter(Boolean);
  return { ok: true, fiche, passages, notice, bibliographie };
}

/** Marque les citations qui ne figurent pas mot pour mot dans les passages. */
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
    lines.push('- Ces citations ne figurent pas mot pour mot dans mes passages :');
    for (const c of badCitations) lines.push(`  « ${c} »`);
    lines.push('  Remplace-les par des extraits recopiés exactement depuis mes passages.');
  }
  lines.push('', 'Renvoie la fiche complète corrigée, uniquement en JSON valide dans un bloc ```json, avec les mêmes clés.');
  return lines.join('\n');
}
