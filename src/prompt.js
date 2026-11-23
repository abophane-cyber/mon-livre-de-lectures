// Préparation de la demande pour Claude, et lecture / vérification de sa réponse.
// La fiche est demandée en texte à titres (Claude le fait naturellement sur claude.ai) ;
// l'ancien format JSON reste accepté.
import { normalizeQuote } from './util.js';
import { readBibliographie, readNotice } from './notice.js';
import { parseTextAnswer } from './answer.js';

export const LANGUES = ['français', 'anglais', 'espagnol', 'allemand', 'italien', 'portugais'];

export const LONGUEURS = {
  court: { label: 'Court', resume: '2 paragraphes (150 mots environ)', idees: '3', notions: '3', citations: '2 à 3' },
  moyen: { label: 'Moyen', resume: '3 paragraphes (220 mots environ)', idees: '4', notions: '3', citations: '3 à 5' },
  detaille: { label: 'Détaillé', resume: '4 paragraphes (320 mots environ)', idees: '5', notions: '4', citations: '5 à 8' },
};

const MODELE = `CHAPITRE : [titre exact du chapitre, ou rien]
GENRE : Essai

## RÉSUMÉ
Premier paragraphe.

Deuxième paragraphe.

## IDÉES CLÉS
- **Titre court** : explication en 2 à 4 phrases.
- **Autre idée** : explication.

## NOTIONS CLÉS
- **Notion** : explication en 1 à 2 phrases.`;

const MODELE_NOTICE = `## NOTICE
- Éditeur :
- Collection :
- Édition :
- Traduction :
- ISBN :
- Nombre de pages :
- Date de parution :

## BIBLIOGRAPHIE
- Auteur, Titre, Éditeur ou revue, année.`;

const CONSIGNES_NOTICE = `- Si mes captures ou mon texte montrent les informations du livre (page de copyright, quatrième de couverture, fiche du livre), remplis la rubrique NOTICE uniquement avec ce qui y est écrit : éditeur, collection, édition (par exemple « Points, 2024 »), traduction (« traduit de l'anglais par … »), ISBN, nombre de pages, date de première parution. Laisse vide ce qui n'est pas visible. N'invente jamais un ISBN ni un éditeur.
- Rubrique BIBLIOGRAPHIE : mets-y UNIQUEMENT des références d'ouvrages, d'articles ou d'autres sources (auteur, titre, éditeur ou revue, année, pages), une par ligne avec un tiret, sous la forme « Auteur, Titre, Éditeur ou revue, année. » Les notes de bas de page ne sont PAS une bibliographie : quand une note contient une explication, une définition, un exemple ou un commentaire, ne la recopie pas. Si une note mélange une explication et une référence (par exemple « … Voir Anne-Laure Delatte, « Faut-il abandonner l'euro ? », Esprit, mars/avril 2014. »), garde seulement la référence (« Anne-Laure Delatte, « Faut-il abandonner l'euro ? », Esprit, mars/avril 2014. »). Ne garde que les références assez complètes pour retrouver la source (au moins un auteur ou un titre précis). Ne mets jamais deux fois la même référence. N'en invente aucune et n'ajoute pas tes propres suggestions de lecture : s'il n'y en a pas, laisse la rubrique vide.
- Ces informations ne font pas partie du texte à résumer : ne les utilise pas pour le résumé.`;

export const CONSIGNE_NEUTRE = `Résume fidèlement et de façon neutre. Ne donne JAMAIS ton avis et n'ajoute aucun commentaire : pas d'appréciation (« passionnant », « remarquable »…), pas d'analyse critique, pas de points forts ou faibles, pas de citations, pas de rubrique « à retenir » ou « pour qui », pas d'introduction ni de conclusion de ta part, pas de question à la fin.`;

const CONSIGNE_FORMAT = `Réponds directement dans la conversation, en texte simple : pas de document, pas d'artefact, pas de canvas, pas de bloc de code, pas de JSON. Suis exactement ce modèle, avec ces titres en majuscules et dans cet ordre, sans rien ajouter avant « GENRE » ni après la dernière rubrique :`;

/** Texte complet à coller dans l'IA. Avec `book.captures`, l'IA résume le texte des captures d'écran jointes. */
export function buildPrompt(book) {
  const L = LONGUEURS[book.length] || LONGUEURS.moyen;
  const langue = book.lang || 'français';
  const captures = !!book.captures;
  const texte = (book.passages || []).join('\n\n');
  const source = captures ? 'LE TEXTE DE MES CAPTURES (et mon texte écrit ci-dessous, s\'il y en a)' : 'MON TEXTE ci-dessous';
  const debut = captures
    ? `TA TÂCHE : je t'envoie des captures d'écran de pages du livre ci-dessous (jointes à ce message, ou dans mon prochain message). Lis le texte visible sur ces images, puis rédige un résumé de ce texte, en suivant exactement les consignes et le modèle ci-dessous.
Si tu ne vois encore aucune image, réponds seulement : « Envoyez-moi vos captures d'écran. » et attends-les ; dès que tu les reçois, rédige directement le résumé, sans rien demander d'autre.`
    : `TA TÂCHE : rédiger le résumé du texte que je te donne ci-dessous, pour ma fiche de lecture personnelle.`;
  return `${debut}

LIVRE
- Titre : ${book.title || '(inconnu)'}
- Auteur : ${book.author || '(inconnu)'}
- Date de parution : ${book.pubDate || '(non précisée)'}
${captures ? `
CAPTURES D'ÉCRAN (pages du livre : liseuse, appli Kindle ou photo de page)
a. Lis TOUT le texte du livre visible sur les captures, dans l'ordre des captures, qu'il soit surligné ou non. C'est ce texte que tu dois résumer.
b. Ignore tout ce qui n'est pas le texte du livre : menus, boutons, heure, batterie, numéros de page ou d'emplacement, titres de l'appli.
c. Si un mot est illisible, ne l'invente pas.
d. Les captures de la page d'informations du livre ou de la bibliographie servent à la NOTICE et à la BIBLIOGRAPHIE (règle 6), pas au résumé.
` : ''}
RÈGLES
1. Appuie-toi sur ${source}. Tu peux compléter avec ta connaissance du livre seulement si tu le connais bien. N'invente jamais rien. En cas de doute, reste sur ce que dit le texte.
2. Rédige en ${langue}.
3. Titre du chapitre : si le texte ou les captures montrent un titre de chapitre (par exemple « Chapitre 3. La dette publique »), recopie-le exactement sur la ligne CHAPITRE. S'il n'y en a pas, écris « CHAPITRE : » sans rien après. Ne mets ni le titre du livre, ni l'auteur, ni la date dans le résumé : je les ai déjà.
4. Longueur (tout doit tenir sur une page A4) : résumé de ${L.resume}, ${L.idees} idées clés d’une phrase chacune, et ${L.notions} notions principales expliquées en une phrase courte (ou les personnages principaux pour un roman : remplace alors « ## NOTIONS CLÉS » par « ## PERSONNAGES »).
5. ${CONSIGNE_NEUTRE}
6. Notice et références bibliographiques (elles iront au verso de ma fiche, seulement s'il y en a) :
${CONSIGNES_NOTICE}
7. ${CONSIGNE_FORMAT}

${MODELE}

${MODELE_NOTICE}

MON TEXTE${captures ? ' ÉCRIT (EN PLUS DE MES CAPTURES)' : ''}
${texte || (captures ? '(aucun : tout est dans mes captures)' : '(aucun texte)')}`;
}

/** La fiche déjà faite, remise en texte à titres (pour la redonner à l'IA). */
export function ficheAsText(fiche) {
  if (!fiche) return '';
  const out = [`CHAPITRE : ${fiche.chapitre || ''}`, `GENRE : ${fiche.genre || ''}`, '', '## RÉSUMÉ', (fiche.resume || []).join('\n\n')];
  if (fiche.idees_cles?.length) {
    out.push('', '## IDÉES CLÉS', ...fiche.idees_cles.map((i) => `- **${i.titre}**${i.texte ? ` : ${i.texte}` : ''}`));
  }
  if (fiche.personnages?.length) {
    const titre = /^personnages$/i.test(fiche.personnages_titre || '') ? 'PERSONNAGES' : 'NOTIONS CLÉS';
    out.push('', `## ${titre}`, ...fiche.personnages.map((p) => `- **${p.nom}**${p.role ? ` : ${p.role}` : ''}`));
  }
  return out.join('\n');
}

/**
 * Demande « suite du chapitre » : l'IA limite le nombre de captures par message (10 pour ChatGPT).
 * On lui redonne le résumé déjà fait du début du chapitre, plus les nouvelles captures,
 * et elle renvoie une seule fiche pour tout le chapitre (qui remplace l'ancienne).
 */
export function buildContinuationPrompt(book) {
  const L = LONGUEURS[book.length] || LONGUEURS.moyen;
  const langue = book.lang || 'français';
  const texte = (book.passages || []).join('\n\n');
  return `TA TÂCHE : je fais la fiche de lecture d'un chapitre trop long pour être envoyé en une seule fois. Tu trouveras ci-dessous LE RÉSUMÉ DU DÉBUT DU CHAPITRE (déjà fait). Je t'envoie maintenant des captures d'écran de LA SUITE de ce chapitre (jointes à ce message, ou dans mon prochain message). Lis le texte visible sur ces captures, puis rédige UNE SEULE fiche qui couvre TOUT le chapitre : le début (d'après le résumé ci-dessous) ET la suite (d'après mes captures).
Si tu ne vois encore aucune image, réponds seulement : « Envoyez-moi vos captures d'écran. » et attends-les ; dès que tu les reçois, rédige directement la fiche complète, sans rien demander d'autre.

LIVRE
- Titre : ${book.title || '(inconnu)'}
- Auteur : ${book.author || '(inconnu)'}
- Date de parution : ${book.pubDate || '(non précisée)'}

CAPTURES D'ÉCRAN (la suite du chapitre)
a. Lis TOUT le texte du livre visible sur les captures, dans l'ordre des captures, qu'il soit surligné ou non.
b. Ignore tout ce qui n'est pas le texte du livre : menus, boutons, heure, batterie, numéros de page ou d'emplacement, titres de l'appli.
c. Si un mot est illisible, ne l'invente pas.
d. Les captures de la page d'informations du livre ou de la bibliographie servent à la NOTICE et à la BIBLIOGRAPHIE (règle 6), pas au résumé.

RÈGLES
1. Garde tout l'essentiel du résumé du début : ne le raccourcis pas trop. Ajoute à la suite ce que racontent mes captures, dans l'ordre du chapitre, avec des transitions naturelles. Le lecteur ne doit pas voir que la fiche a été faite en deux fois. N'invente jamais rien.
2. Rédige en ${langue}.
3. Ligne CHAPITRE : garde le titre du chapitre déjà indiqué ci-dessous (s'il est vide et que les captures montrent un titre de chapitre, recopie-le exactement). Ne mets ni le titre du livre, ni l'auteur, ni la date dans le résumé.
4. Longueur (tout doit tenir sur une page A4) : résumé de ${L.resume}, plus 1 ou 2 paragraphes si la suite apporte beaucoup de choses nouvelles ; ${L.idees} à ${Number(L.idees) + 2} idées clés pour tout le chapitre (garde celles du début et ajoute celles de la suite), d’une phrase chacune ; ${L.notions} à ${Number(L.notions) + 2} notions principales (ou personnages principaux pour un roman) en une phrase courte.
5. ${CONSIGNE_NEUTRE}
6. Notice et références bibliographiques (elles iront au verso de ma fiche, seulement s'il y en a) :
${CONSIGNES_NOTICE}
7. ${CONSIGNE_FORMAT}

${MODELE}

${MODELE_NOTICE}

LE RÉSUMÉ DU DÉBUT DU CHAPITRE (déjà fait)
${ficheAsText(book.fiche)}
${texte ? `\nMON TEXTE ÉCRIT (EN PLUS DE MES CAPTURES)\n${texte}\n` : ''}`;
}

/** Message court à envoyer avec les captures si l'IA n'a pas compris quoi en faire. */
export function buildCapturesReminder(book) {
  return `Voici les captures d'écran du livre « ${book.title || '(inconnu)'} ». Lis le texte visible sur ces images et rédige maintenant le résumé en suivant exactement ma demande précédente : fidèle et neutre, sans avis ni commentaire, en texte simple avec les titres en majuscules (CHAPITRE, GENRE, ## RÉSUMÉ, ## IDÉES CLÉS, ## NOTIONS CLÉS ou ## PERSONNAGES, ## NOTICE, ## BIBLIOGRAPHIE).`;
}

/** Demande courte : seulement la notice et la bibliographie, depuis des captures (la fiche n'est pas refaite). */
export function buildNoticePrompt(book) {
  return `TA TÂCHE : je t'envoie des captures d'écran concernant le livre « ${book.title || '(inconnu)'} »${book.author ? ` de ${book.author}` : ''} (jointes à ce message, ou dans mon prochain message). Si tu ne vois encore aucune image, réponds seulement « Envoyez-moi vos captures d'écran. » et attends-les.
Ne rédige pas de résumé. Lis seulement les captures et complète ma notice bibliographique :
${CONSIGNES_NOTICE}

N'ajoute aucun commentaire. Réponds directement dans la conversation, en texte simple (pas de document, pas de canvas, pas de bloc de code), en suivant exactement ce modèle :

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
  // Un vrai objet JSON est lu comme JSON ; sinon, lecture du texte à titres.
  const data = json || parseTextAnswer(text);
  if (!data) {
    return { ok: false, errors: ['Le texte collé est vide ou trop court. Copiez toute la réponse de l’IA.'] };
  }
  const notice = readNotice(data.notice);
  const bibliographie = readBibliographie(data.bibliographie);
  // Réponse « notice seulement » : aucune rubrique de fiche, seulement notice et/ou bibliographie.
  if (!FICHE_KEYS.some((k) => k in data) && ('notice' in data || 'bibliographie' in data)) {
    return { ok: true, partial: true, fiche: null, passages: [], notice, bibliographie };
  }
  const fiche = {
    chapitre: str(data.chapitre),
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
  // Seul le résumé est indispensable ; les autres rubriques manquantes donnent un simple avertissement.
  if (!fiche.resume.length) {
    return { ok: false, errors: ['Je ne trouve pas de résumé dans ce texte. Vérifiez que vous avez copié toute la réponse de l’IA.'] };
  }
  // Seules les rubriques encore demandées comptent (accroche, citations, « à retenir », « pour qui » ne le sont plus).
  const missing = [[!fiche.idees_cles.length, 'IDÉES CLÉS']]
    .filter(([absent]) => absent)
    .map(([, name]) => name);
  const warnings = [];
  if (data._fallback) warnings.push("Je n'ai pas reconnu les rubriques : tout le texte de la réponse a été mis dans le résumé. Vous pouvez le retoucher avec « Modifier le texte ».");
  else if (missing.length) warnings.push(`Rubriques absentes de la réponse : ${missing.join(', ')}.`);
  // Passages recopiés par Claude (ancien format, facultatif).
  const passages = (Array.isArray(data.passages) ? data.passages : [])
    .map((p) => (typeof p === 'string' ? p : str(p?.texte)))
    .map((p) => stripQuotes(p).replace(/\s+/g, ' '))
    .filter(Boolean);
  return { ok: true, fiche, passages, notice, bibliographie, warnings, missing };
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
    'Renvoie le résumé complet corrigé, sans aucun commentaire ni avis de ta part, directement dans la conversation (pas de document ni de bloc de code), en suivant exactement le modèle demandé : CHAPITRE, GENRE, puis les rubriques ## RÉSUMÉ, ## IDÉES CLÉS, ## NOTIONS CLÉS (ou ## PERSONNAGES), ## NOTICE, ## BIBLIOGRAPHIE.',
  );
  return lines.join('\n');
}
