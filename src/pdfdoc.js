// Mise en page du PDF à imprimer (A4). Fonction pure : décrit le document pour pdfmake.
import { chapterOf, partOf } from './fiches.js';
import { NOTICE_FIELDS } from './notice.js';

const ACCENT = '#8a5a14';
const GREY = '#5c5c5c';
const HIGHLIGHT = '#fff0a0';

const section = (label) => ({
  text: label.toUpperCase(),
  style: 'section',
  headlineLevel: 1,
});

/** « Auteur · date de parution » (ce qui est renseigné). */
const byline = (book) => [book.author, book.pubDate].filter(Boolean).join(' · ');

/**
 * Informations sur le livre (éditeur, collection, ISBN…) sous le titre, sur la première page du livre :
 * « ÉDITEUR Seuil   COLLECTION Documents   … », en petit.
 */
export function noticeBlock(book) {
  const items = NOTICE_FIELDS.filter(([k]) => String(book[k] || '').trim()).map(([k, l]) => [k === 'dateLecture' ? 'Lu en' : l, book[k]]);
  if (!items.length) return [];
  return [
    {
      text: items.flatMap(([l, v], i) => [
        { text: `${i ? '     ' : ''}${l.toUpperCase()} `, fontSize: 7.5, color: GREY, characterSpacing: 1 },
        { text: String(v), fontSize: 9.5 },
      ]),
      lineHeight: 1.5,
      margin: [0, 8, 0, 0],
    },
  ];
}

/** Deux fiches consécutives du même livre ? (un livre peut avoir plusieurs fiches) */
const sameBook = (a, b) => !!a && !!b && a.id != null && a.id === b.id;

/**
 * Une fiche. La première fiche d'un livre ouvre le chapitre (titre, sommaire) ;
 * les suivantes commencent sur une nouvelle page ; chacune finit par la bibliographie de son chapitre.
 */
function chapter(book, { first = true, last = true } = {}) {
  const f = book.fiche;
  const ch = chapterOf(f, book.ficheIndex || 0, book.ficheCount || 1);
  const meta = [book.author, book.pubDate, f.genre].filter(Boolean).join(' · ');
  const rule = {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 60, y2: 0, lineWidth: 1.2, lineColor: ACCENT }],
    margin: [0, 10, 0, 14],
  };
  const out = !first
    ? [
        { text: book.title, style: 'meta', margin: [0, 0, 0, 0], pageBreak: 'before' },
        rule,
      ]
    : [
    // Ligne invisible qui sert uniquement d'entrée au sommaire : titre, puis auteur et date de parution.
    {
      text: [
        { text: book.title, bold: true },
        ...(byline(book) ? [{ text: `\n${byline(book)}`, italics: true, color: GREY, fontSize: 9.5 }] : []),
      ],
      pageBreak: 'before',
      tocItem: true,
      tocStyle: 'tocTitle',
      tocMargin: [0, 0, 0, 8],
      fontSize: 0.5,
      lineHeight: 0.1,
      color: '#ffffff',
      opacity: 0,
    },
    { text: book.title, style: 'title' },
    { text: meta, style: 'meta' },
    ...noticeBlock(book),
    rule,
  ];
  // Partie du livre, avant le chapitre : « PARTIE 1 · LES ORIGINES ».
  const pt = partOf(f);
  const partie = pt ? [pt.label, pt.titre].filter(Boolean).join(' · ') : '';
  if (ch.label || partie) out.push({ text: [partie, ch.label].filter(Boolean).join(' — ').toUpperCase(), style: 'chapterLabel' });
  if (ch.titre) out.push({ text: ch.titre, style: 'chapterTitle' });
  if (f.accroche) out.push({ text: f.accroche, style: 'accroche' });

  if (f.resume?.length) {
    out.push(section('Résumé'));
    for (const p of f.resume) out.push({ text: p, style: 'body' });
  }
  if (f.idees_cles?.length) {
    out.push(section('Idées clés'));
    for (const i of f.idees_cles) {
      out.push({
        stack: [
          { text: i.titre, bold: true, margin: [0, 0, 0, 2] },
          { text: i.texte, style: 'body', margin: [0, 0, 0, 0] },
        ],
        unbreakable: true,
        margin: [0, 0, 0, 8],
      });
    }
  }
  if (f.personnages?.length) {
    out.push(section(f.personnages_titre || 'Personnages'));
    for (const p of f.personnages) {
      out.push({
        text: [{ text: p.nom, bold: true }, p.role ? { text: ` — ${p.role}` } : ''],
        style: 'body',
        margin: [0, 0, 0, 5],
      });
    }
  }
  if (f.citations?.length) {
    out.push(section('Citations'));
    for (const c of f.citations) {
      out.push({
        stack: [
          { text: [{ text: `« ${c.texte} »`, background: HIGHLIGHT, italics: true }], lineHeight: 1.45 },
          c.commentaire ? { text: c.commentaire, style: 'comment' } : '',
        ],
        unbreakable: true,
        margin: [12, 2, 0, 12],
      });
    }
  }
  if (f.a_retenir) {
    out.push(section('À retenir'));
    out.push({ text: f.a_retenir, style: 'body' });
  }
  if (f.pour_qui) {
    out.push(section('Pour qui ?'));
    out.push({ text: f.pour_qui, style: 'body' });
  }
  const refs = (list) => ({ ul: list.map((r) => ({ text: r, fontSize: 9.5, margin: [0, 0, 0, 3] })), markerColor: ACCENT });
  // Bibliographie du chapitre à la fin de sa fiche ; bibliographie générale après la dernière fiche du livre.
  if (book.bibliographie?.length) {
    out.push(section('Bibliographie'));
    out.push(refs(book.bibliographie));
  }
  if (last && book.bibliographieGenerale?.length) {
    out.push(section(book.ficheCount > 1 || book.bibliographie?.length ? 'Bibliographie générale du livre' : 'Bibliographie'));
    out.push(refs(book.bibliographieGenerale));
  }
  return out;
}

/**
 * @param {Array} books fiches à imprimer, dans l'ordre (chacune avec book.fiche)
 * @param {{titreLivre: string, nom: string, date: string}} cover
 */
export function buildDocDefinition(books, cover) {
  const content = [
    {
      stack: [
        { text: cover.titreLivre || 'Mon livre de lectures', style: 'coverTitle' },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 1.5, lineColor: ACCENT }],
          alignment: 'center',
          margin: [0, 18, 0, 18],
        },
        cover.nom ? { text: cover.nom, style: 'coverName' } : '',
        { text: cover.date || '', style: 'coverDate' },
        { text: `${books.length} fiche${books.length > 1 ? 's' : ''} de lecture`, style: 'coverDate' },
      ],
      margin: [0, 200, 0, 0],
    },
    {
      toc: {
        title: { text: 'Sommaire', style: 'tocHeading' },
        numberStyle: 'tocNumber',
      },
      pageBreak: 'before',
    },
    ...books.flatMap((b, i) => chapter(b, { first: !sameBook(books[i - 1], b), last: !sameBook(b, books[i + 1]) })),
  ];

  return {
    pageSize: 'A4',
    // Marges confortables pour l'impression (environ 2,5 cm, 2,8 cm en bas pour le numéro).
    pageMargins: [72, 68, 72, 80],
    info: { title: cover.titreLivre || 'Mon livre de lectures', author: cover.nom || '' },
    content,
    footer: (page) =>
      page === 1
        ? null
        : { text: String(page), alignment: 'center', fontSize: 9, color: GREY, margin: [0, 34, 0, 0] },
    // Ne jamais laisser un titre de rubrique seul en bas de page.
    pageBreakBefore: (node, rest) => {
      if (node.headlineLevel !== 1) return false;
      const following = rest.getFollowingNodesOnPage ? rest.getFollowingNodesOnPage() : rest.followingNodesOnPage;
      return Array.isArray(following) && following.length === 0;
    },
    defaultStyle: { font: 'Literata', fontSize: 10.5, lineHeight: 1.35, color: '#1d1d1d' },
    styles: {
      coverTitle: { fontSize: 32, bold: true, alignment: 'center', lineHeight: 1.1 },
      coverName: { fontSize: 15, alignment: 'center', margin: [0, 0, 0, 8] },
      coverDate: { fontSize: 11, alignment: 'center', color: GREY, margin: [0, 0, 0, 4] },
      tocHeading: { fontSize: 22, bold: true, margin: [0, 0, 0, 20] },
      tocTitle: { fontSize: 11 },
      tocNumber: { fontSize: 11, color: GREY },
      chapterLabel: { fontSize: 8.5, color: ACCENT, characterSpacing: 2, margin: [0, 0, 0, 6] },
      title: { fontSize: 22, bold: true, lineHeight: 1.15 },
      chapterTitle: { fontSize: 15, bold: true, lineHeight: 1.2, margin: [0, 0, 0, 10] },
      meta: { fontSize: 10.5, italics: true, color: GREY, margin: [0, 4, 0, 0] },
      accroche: { fontSize: 12.5, italics: true, lineHeight: 1.4, margin: [0, 0, 0, 6] },
      section: { fontSize: 8.5, bold: true, color: ACCENT, characterSpacing: 1.6, margin: [0, 16, 0, 7] },
      body: { alignment: 'justify', margin: [0, 0, 0, 7] },
      comment: { fontSize: 9.5, color: GREY, margin: [0, 4, 0, 0] },
    },
  };
}
