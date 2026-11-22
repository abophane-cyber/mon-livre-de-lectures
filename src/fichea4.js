// Fiche de lecture A4 : le résumé au recto, les références bibliographiques au verso (s'il y en a).
// Chaque face doit tenir sur une seule page : la taille du texte s'ajuste toute seule.

const ACCENT = '#8a5a14';
const GREY = '#5c5c5c';
const BOX = '#f6efe0';
const RULE = '#e4dccb';

/** Échelles essayées, de la plus grande à la plus petite, pour faire tenir une face sur une page. */
export const SCALES = Array.from({ length: 14 }, (_, i) => Math.round((1 - i * 0.03) * 100) / 100); // 1, 0.97 … 0.61
const MARGINS = [44, 40, 44, 40];

import { NOTICE_FIELDS } from './notice.js';
import { chapterOf } from './fiches.js';

export { NOTICE_FIELDS };

function label(text, s, extra = {}) {
  return { text: text.toUpperCase(), fontSize: 8 * Math.max(s, 0.85), bold: true, color: ACCENT, characterSpacing: 1.5, ...extra };
}

/**
 * En-tête d'une face : un petit intitulé, éventuellement un titre (le titre du chapitre), puis un filet.
 * Pas de titre du livre, d'auteur ni de date : ils sont déjà sur la page de présentation.
 */
function header(s, kicker, title) {
  return [
    label(kicker, s),
    title ? { text: title, fontSize: 20 * s, bold: true, lineHeight: 1.15, margin: [0, 8 * s, 0, 0] } : '',
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 507, y2: 0, lineWidth: 0.5, lineColor: RULE },
        { type: 'line', x1: 0, y1: 0, x2: 56, y2: 0, lineWidth: 2, lineColor: ACCENT },
      ],
      margin: [0, 9 * s, 0, 14 * s],
    },
  ];
}

/** Recto : titre du chapitre (s'il y en a un), résumé, idées clés, notions ou personnages. Sans commentaire. */
export function recto(book, s = 1) {
  const f = book.fiche;
  const body = { fontSize: 10.5 * s, lineHeight: 1.32 };
  const ch = chapterOf(f, book.ficheIndex || 0, book.ficheCount || 1);
  const out = [...header(s, ch.label ? `${ch.label} · Résumé` : 'Résumé', ch.titre)];
  if (f.resume?.length) {
    f.resume.forEach((p, k) => {
      out.push({
        text: p,
        ...body,
        fontSize: (k === 0 ? 13 : 12.5) * s,
        lineHeight: 1.36,
        alignment: 'justify',
        margin: [0, 0, 0, 7 * s],
      });
    });
  }

  if (f.idees_cles?.length) {
    out.push(label('Idées clés', s, { margin: [0, 10 * s, 0, 7 * s] }));
    const cell = (i, n) => ({
      columns: [
        { text: String(n), width: 16 * s, fontSize: 11 * s, bold: true, color: ACCENT },
        {
          stack: [
            { text: i.titre, bold: true, fontSize: 11.5 * s, margin: [0, 0, 0, 1] },
            i.texte ? { text: i.texte, fontSize: 10.8 * s, lineHeight: 1.32 } : '',
          ],
        },
      ],
      columnGap: 4,
      margin: [0, 0, 0, 8 * s],
    });
    // Deux colonnes : les idées impaires à gauche, les paires à droite.
    const left = [];
    const right = [];
    f.idees_cles.forEach((i, k) => (k % 2 ? right : left).push(cell(i, k + 1)));
    out.push({ columns: [{ stack: left }, { stack: right }], columnGap: 18 });
  }

  if (f.personnages?.length) {
    out.push(label(f.personnages_titre || 'Personnages', s, { margin: [0, 6 * s, 0, 6 * s] }));
    out.push({
      table: {
        widths: ['*'],
        body: [[{
          stack: f.personnages.map((p) => ({
            text: [{ text: p.nom, bold: true }, p.role ? { text: ` — ${p.role}` } : ''],
            fontSize: 10.8 * s,
            lineHeight: 1.3,
            margin: [0, 0, 0, 4 * s],
          })),
          fillColor: BOX,
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i) => (i === 0 ? 2 : 0),
        vLineColor: () => ACCENT,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 9 * s,
        paddingBottom: () => 5 * s,
      },
    });
  }
  return out;
}

/** Champs de notice qui viennent du livre lui-même (la date de lecture seule ne justifie pas un verso). */
const PUBLICATION_FIELDS = NOTICE_FIELDS.filter(([k]) => k !== 'dateLecture');

/** Le verso n'existe que s'il y a des références : bibliographie ou informations d'édition. */
export function hasVerso(book) {
  return !!(book.bibliographie?.length || PUBLICATION_FIELDS.some(([k]) => book[k]));
}

/** Verso : références bibliographiques (notice d'édition et bibliographie). */
export function verso(book, s = 1) {
  const out = [...header(s, 'Références bibliographiques')];

  // Informations d'édition seulement (titre, auteur et date sont sur la page de présentation).
  const rows = NOTICE_FIELDS.map(([k, l]) => [l, book[k]]).filter(([, v]) => v);
  if (rows.length) out.push(label('Notice', s, { margin: [0, 0, 0, 4 * s] }));
  if (rows.length) out.push({
    table: {
      widths: [110, '*'],
      body: rows.map(([l, v]) => [
        { text: l, fontSize: 9 * s, color: GREY },
        { text: v, fontSize: 10.5 * s },
      ]),
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      hLineColor: () => RULE,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingTop: () => 4 * s,
      paddingBottom: () => 4 * s,
    },
    margin: [0, 0, 0, 16 * s],
  });

  if (book.bibliographie?.length) {
    out.push(label('Bibliographie', s, { margin: [0, 0, 0, 7 * s] }));
    out.push({
      ul: book.bibliographie.map((r) => ({ text: r, fontSize: 9.8 * s, lineHeight: 1.32, margin: [0, 0, 0, 4 * s] })),
      markerColor: ACCENT,
    });
  }
  return out;
}

/** Page de présentation du livre : titre, auteur, date de parution, genre, date de lecture. */
export function presentation(book) {
  const f = book.fiche || {};
  const details = [
    book.pubDate && ['Date de parution', book.pubDate],
    f.genre && ['Genre', f.genre],
    book.editeur && ['Éditeur', book.editeur],
    book.dateLecture && ['Lu en', book.dateLecture],
  ].filter(Boolean);
  return [
    {
      stack: [
        { text: 'FICHE DE LECTURE', fontSize: 9, bold: true, color: ACCENT, characterSpacing: 3, alignment: 'center' },
        { text: book.title, fontSize: 30, bold: true, lineHeight: 1.12, alignment: 'center', margin: [0, 22, 0, 0] },
        book.author ? { text: book.author, fontSize: 16, italics: true, alignment: 'center', margin: [0, 14, 0, 0] } : '',
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 70, y2: 0, lineWidth: 1.5, lineColor: ACCENT }],
          alignment: 'center',
          margin: [0, 26, 0, 26],
        },
        ...details.map(([l, v]) => ({
          text: [{ text: `${l.toUpperCase()}   `, fontSize: 8.5, color: GREY, characterSpacing: 1.2 }, { text: v, fontSize: 12 }],
          alignment: 'center',
          margin: [0, 0, 0, 9],
        })),
      ],
      margin: [0, 210, 0, 0],
    },
  ];
}

/**
 * Document : pour chaque livre, éventuellement la page de présentation (seule sur sa feuille),
 * puis le recto (toujours sur une page impaire), puis le verso s'il y a des références.
 */
export function buildFicheA4Doc(items, onPageCount, { presentation: withPresentation = false } = {}) {
  const content = [];
  // Plusieurs fiches d'un même livre à la suite : une seule page de présentation (avant la première)
  // et les références bibliographiques au verso de la dernière seulement.
  const same = (a, b) => !!a && !!b && a.book.id != null && a.book.id === b.book.id;
  items.forEach(({ book, r = 1, v = 1 }, i) => {
    const first = !same(items[i - 1], items[i]);
    const last = !same(items[i], items[i + 1]);
    if (withPresentation && first) {
      content.push({ stack: presentation(book), pageBreak: i ? 'beforeOdd' : undefined });
      content.push({ stack: recto(book, r), pageBreak: 'beforeOdd' });
    } else {
      content.push({ stack: recto(book, r), pageBreak: i ? 'beforeOdd' : undefined });
    }
    if (last && hasVerso(book)) content.push({ stack: verso(book, v), pageBreak: 'before' });
  });
  return {
    pageSize: 'A4',
    pageMargins: MARGINS,
    info: { title: items.length === 1 ? `Fiche — ${items[0].book.title}` : 'Fiches de lecture' },
    content,
    footer: (page, count) => {
      onPageCount?.(count);
      return null;
    },
    defaultStyle: { font: 'Literata', fontSize: 10.5, color: '#1d1d1d' },
  };
}

/**
 * Trouve, pour chaque face, la plus grande taille de texte qui tient sur une page.
 * `countPages(doc)` calcule le nombre de pages d'un document (pdfmake).
 */
export async function fitItems(books, countPages) {
  const fit = async (side, book) => {
    for (const s of SCALES) {
      const n = await countPages({
        pageSize: 'A4',
        pageMargins: MARGINS,
        content: side(book, s),
        defaultStyle: { font: 'Literata' },
      });
      if (n <= 1) return { scale: s, ok: true };
    }
    return { scale: SCALES[SCALES.length - 1], ok: false };
  };
  const items = [];
  const tooLong = [];
  for (const book of books) {
    const r = await fit(recto, book);
    const v = hasVerso(book) ? await fit(verso, book) : { scale: 1, ok: true };
    if (!r.ok || !v.ok) tooLong.push(book.title);
    items.push({ book, r: r.scale, v: v.scale });
  }
  return { items, tooLong };
}
