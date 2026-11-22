// Préparation de la demande pour Claude, et lecture / vérification de sa réponse.
import { normalizeQuote } from './util.js';

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

/** Texte complet à coller dans Claude. */
export function buildPrompt(book) {
  const L = LONGUEURS[book.length] || LONGUEURS.moyen;
  const langue = book.lang || 'français';
  const passages = (book.passages || []).map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
  return `Tu rédiges une fiche de lecture pour mon livre de lectures personnel, à partir des passages que j'ai surlignés.

LIVRE
- Titre : ${book.title || '(inconnu)'}
- Auteur : ${book.author || '(inconnu)'}
- Date de parution : ${book.pubDate || '(non précisée)'}

RÈGLES
1. Appuie-toi d'abord sur MES PASSAGES ci-dessous. Tu peux compléter avec ta connaissance du livre seulement si tu le connais bien. N'invente jamais d'intrigue, de personnage ou d'événement. En cas de doute, reste sur ce que disent mes passages.
2. Les citations doivent être recopiées MOT POUR MOT depuis mes passages, et uniquement depuis eux (tu peux en prendre un extrait, sans rien changer à l'intérieur). Garde leur langue d'origine.
3. Rédige tout le reste de la fiche en ${langue}.
4. Longueur : résumé de ${L.resume}, ${L.idees} idées clés, ${L.citations} citations (moins si mes passages ne suffisent pas).
5. Pour un essai ou un livre sans personnages, mets "personnages_titre": "Notions clés" et présente les notions principales dans "personnages" (nom = la notion, role = son explication).
6. Réponds UNIQUEMENT avec un objet JSON valide, dans un bloc de code \`\`\`json, sans aucun texte avant ou après. Utilise exactement ces clés :

${EXEMPLE}

MES PASSAGES SURLIGNÉS
${passages || '(aucun passage)'}`;
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
  return { ok: true, fiche };
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
