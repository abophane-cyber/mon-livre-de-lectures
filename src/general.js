// Résumé général d'un livre : une synthèse de toutes ses fiches (chapitres), sur un nombre de pages
// choisi. Demande à coller dans l'IA, puis lecture de sa réponse. Fonctions pures (testables).
import { CONSIGNE_NEUTRE, ficheAsText } from './prompt.js';
import { chapterOf, partsOf } from './fiches.js';
import { normalize } from './util.js';

/**
 * Nombre de mots à demander pour `pages` pages A4. Mesuré sur la mise en page du PDF : une page
 * contient environ 355 mots. On en demande à peine moins (345 par page) : l'IA écrit souvent moins
 * que demandé ; si elle écrit trop, le PDF réduit un peu le texte pour tenir dans les pages.
 */
export const motsPour = (pages) => 330 + (Math.max(1, pages) - 1) * 345;
export const PAGES_MIN = 1;
export const PAGES_MAX = 20;

export const clampPages = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && String(n).trim() !== "" ? Math.min(PAGES_MAX, Math.max(PAGES_MIN, v)) : 2;
};

/** Nombre d'idées clés demandé selon la longueur. */
export const ideesPour = (pages) => Math.min(12, 2 + pages * 2);

/** Texte complet à coller dans l'IA : toutes les fiches terminées du livre, dans l'ordre. */
export function buildGeneralPrompt(book, pages) {
  const n = clampPages(pages);
  const parts = partsOf(book);
  const done = parts.map((p, i) => ({ p, i })).filter(({ p }) => p.fiche);
  const mots = motsPour(n);
  // Une partie par page, avec un nombre de mots pour chacune : l'IA respecte mieux la longueur.
  const nIdees = ideesPour(n);
  const parPartie = Math.round((mots - nIdees * 22) / n / 10) * 10;
  const langue = book.lang || 'français';
  const fiches = done
    .map(({ p, i }) => {
      const ch = chapterOf(p.fiche, i, parts.length);
      const titre = [ch.label || `Fiche ${i + 1}`, ch.titre].filter(Boolean).join(' : ');
      const partie = p.fiche.partie ? ` (${p.fiche.partie})` : '';
      return `=== ${titre}${partie} ===\n${ficheAsText(p.fiche).replace(/^PARTIE :.*\n/, '').replace(/^CHAPITRE :.*\n(GENRE :.*\n)?\n?/, '')}`;
    })
    .join('\n\n');
  return `TA TÂCHE : rédiger le RÉSUMÉ GÉNÉRAL du livre ci-dessous, à partir des fiches de lecture de ses chapitres que je te donne (je les ai déjà faites). C'est une synthèse de tout le livre, qui doit tenir sur ${n} page${n > 1 ? 's' : ''} A4.

LIVRE
- Titre : ${book.title || '(inconnu)'}
- Auteur : ${book.author || '(inconnu)'}
- Date de parution : ${book.pubDate || '(non précisée)'}

RÈGLES
1. Appuie-toi uniquement sur mes fiches ci-dessous. N'invente rien. Couvre tout le livre, du début à la fin, en suivant l'ordre des chapitres, de façon équilibrée.
2. Rédige en ${langue}, avec des phrases complètes et des transitions naturelles : un vrai texte suivi, pas une liste de résumés de chapitres mis bout à bout.
3. Longueur : environ ${mots} mots au total (${n} page${n > 1 ? 's' : ''} A4), idées clés comprises. C'est important : ne fais pas plus court, sinon le résumé ne remplira pas ses ${n} page${n > 1 ? 's' : ''}. Compte tes mots avant de répondre.
4. ${n > 1 ? `Organise le résumé en ${n} grandes parties, chacune avec un intertitre court sur sa propre ligne, commençant par « ### ». Chaque partie fait environ ${parPartie} mots (2 à 4 paragraphes).` : `Pas d'intertitres : environ ${parPartie} mots en paragraphes.`}
5. Termine par ${nIdees} idées clés de tout le livre, une phrase d'environ 20 mots chacune.
6. ${CONSIGNE_NEUTRE}
7. Réponds directement dans la conversation, en texte simple : pas de document, pas d'artefact, pas de canvas, pas de bloc de code. Suis exactement ce modèle, sans rien ajouter avant « ## RÉSUMÉ GÉNÉRAL » ni après la dernière idée clé :

## RÉSUMÉ GÉNÉRAL
${n > 1 ? '### Premier intertitre\n' : ''}Premier paragraphe.

Deuxième paragraphe.
${n > 1 ? '\n### Deuxième intertitre\nParagraphe.\n' : ''}
## IDÉES CLÉS
- **Titre court** : explication en une phrase.
- **Autre idée** : explication.

MES FICHES (${done.length} chapitre${done.length > 1 ? 's' : ''})

${fiches}`;
}

const clean = (s) =>
  String(s ?? '')
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

/** Titre « ## … », « ### … », « **…** » seul sur sa ligne, ou « RÉSUMÉ GÉNÉRAL : ». Renvoie { level, text } ou null. */
function headingOf(line) {
  const t = line.trim();
  let m = t.match(/^(#{1,6})\s*(.+?)\s*#*$/);
  if (m) return { level: m[1].length, text: clean(m[2]).replace(/[\s:：]+$/, '') };
  m = t.match(/^\*\*([^*]{2,80})\*\*\s*:?$/);
  if (m) return { level: 3, text: clean(m[1]).replace(/[\s:：]+$/, '') };
  return null;
}
const isResume = (txt) => /^(le )?(resume|synthese)( general| d ensemble| global| du livre)*$/.test(normalize(txt));
const isIdees = (txt) => /^(les )?(\w+ )?(idees?|points?|themes?|enseignements?)( (cles|principales?|essentielles?|a retenir|du livre))*$/.test(normalize(txt));
const LIST_MARK = /^\s*(?:[-*•–]|\d+[.)])\s+/;

/**
 * Lit la réponse collée. Renvoie { ok: true, sections: [{ titre, paragraphes }], idees: [{ titre, texte }], mots }
 * ou { ok: false, errors }.
 */
export function parseGeneral(text) {
  const raw = String(text ?? '').replace(/\r/g, '').replace(/```[a-z]*\n?/gi, '');
  const lines = raw.split('\n');
  // Début : le titre « RÉSUMÉ GÉNÉRAL » (sinon, tout le texte).
  let start = lines.findIndex((l) => {
    const h = headingOf(l) || (/^[^a-z]*r[ée]sum[ée]\s+g[ée]n[ée]ral\s*:?\s*$/i.test(l.trim()) ? { text: l } : null);
    return h && isResume(h.text.replace(/[:：]/g, ''));
  });
  start = start === -1 ? 0 : start + 1;
  const sections = [];
  const idees = [];
  let cur = { titre: '', paragraphes: [] };
  let buf = [];
  let mode = 'resume';
  let idee = null;
  const flush = () => {
    const p = clean(buf.join(' '));
    if (p) cur.paragraphes.push(p);
    buf = [];
  };
  const pushIdee = () => {
    if (idee && (idee.titre || idee.texte)) idees.push(idee);
    idee = null;
  };
  for (const line of lines.slice(start)) {
    const h = headingOf(line);
    if (h && isIdees(h.text)) {
      flush();
      mode = 'idees';
      continue;
    }
    if (mode === 'resume') {
      if (h) {
        flush();
        if (cur.titre || cur.paragraphes.length) sections.push(cur);
        cur = { titre: h.text, paragraphes: [] };
      } else if (!line.trim()) flush();
      else buf.push(line);
      continue;
    }
    // Idées clés : une par ligne de liste (une ligne qui suit sans tiret prolonge la précédente).
    if (h) break;
    if (LIST_MARK.test(line)) {
      pushIdee();
      const body = line.replace(LIST_MARK, '');
      const m = body.match(/^\*\*(.+?)\*\*\s*[:：—–-]?\s*(.*)$/) || body.match(/^([^:：]{2,60})\s*[:：]\s+(.*)$/);
      idee = m ? { titre: clean(m[1]).replace(/[\s:：]+$/, ''), texte: clean(m[2]) } : { titre: clean(body), texte: '' };
    } else if (line.trim() && idee) {
      idee.texte = clean(`${idee.texte} ${line}`);
    } else if (!line.trim()) pushIdee();
  }
  flush();
  pushIdee();
  if (cur.titre || cur.paragraphes.length) sections.push(cur);
  const kept = sections.filter((s) => s.paragraphes.length);
  if (!kept.length) {
    return { ok: false, errors: ['Je ne trouve pas de résumé dans ce texte. Vérifiez que vous avez copié toute la réponse de l’IA.'] };
  }
  const mots = [...kept.flatMap((s) => s.paragraphes), ...idees.map((i) => `${i.titre} ${i.texte}`)]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return { ok: true, sections: kept, idees, mots };
}
