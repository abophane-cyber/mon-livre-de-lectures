// Fiche de lecture A4 : le résumé au recto, les références bibliographiques au verso (s'il y en a).
// Chaque face doit tenir sur une seule page : la taille du texte s'ajuste toute seule.

const ACCENT = '#8a5a14';
const GREY = '#5c5c5c';
const BOX = '#f6efe0';
const RULE = '#e4dccb';

/** Échelles essayées, de la plus grande à la plus petite, pour faire tenir une face sur une page. */
export const SCALES = [1, 0.94, 0.88, 0.82, 0.77, 0.72, 0.67, 0.62];
const MARGINS = [50, 46, 50, 46];

import { NOTICE_FIELDS } from './notice.js';

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
        { type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: RULE },
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
  const out = [...header(s, 'Résumé', f.chapitre)];
  if (f.resume?.length) {
    f.resume.forEach((p, k) => {
      out.push({
        text: p,
        ...body,
        fontSize: (k === 0 ? 11.5 : 10.8) * s,
        lineHeight: 1.4,
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
            { text: i.titre, bold: true, fontSize: 10.5 * s, margin: [0, 0, 0, 1] },
            i.texte ? { text: i.texte, fontSize: 9.8 * s, lineHeight: 1.3 } : '',
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
            fontSize: 9.8 * s,
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

/** Document : pour chaque livre, le recto (toujours sur une page impaire), puis le verso s'il y a des références. */
export function buildFicheA4Doc(items, onPageCount) {
  const content = [];
  items.forEach(({ book, r = 1, v = 1 }, i) => {
    content.push({ stack: recto(book, r), pageBreak: i ? 'beforeOdd' : undefined });
    if (hasVerso(book)) content.push({ stack: verso(book, v), pageBreak: 'before' });
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
