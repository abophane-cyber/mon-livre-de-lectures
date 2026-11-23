// Fiche de lecture A4 : le résumé au recto, les références bibliographiques au verso (s'il y en a).
// Si le résumé est trop long pour le recto, il continue au verso (suivi des références) :
// l'ensemble tient toujours sur une feuille recto-verso. La taille du texte s'ajuste toute seule.

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

/**
 * Le verso n'existe que s'il y a des références : la bibliographie du chapitre, et pour la dernière
 * fiche du livre (`full`), la bibliographie générale. La notice (éditeur, ISBN…) n'est pas sur les
 * fiches : elle est dans les informations du livre (page de présentation).
 */
export function hasVerso(book, full = true) {
  return !!(book.bibliographie?.length || (full && book.bibliographieGenerale?.length));
}

/**
 * Verso : références bibliographiques (bibliographie du chapitre ; bibliographie générale si `full`).
 * `inline` : à la suite du résumé qui a débordé au verso (pas d'en-tête de page, un filet avant).
 */
export function verso(book, s = 1, full = true, inline = false) {
  const out = inline
    ? [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 56, y2: 0, lineWidth: 2, lineColor: ACCENT }], margin: [0, 16 * s, 0, 12 * s] }]
    : [...header(s, 'Références bibliographiques')];

  const chap = book.bibliographie || [];
  const gen = full ? book.bibliographieGenerale || [] : [];
  const list = (title, refs, last) => {
    out.push(label(title, s, { margin: [0, 0, 0, 7 * s] }));
    out.push({
      ul: refs.map((r) => ({ text: r, fontSize: 9.8 * s, lineHeight: 1.32, margin: [0, 0, 0, 4 * s] })),
      markerColor: ACCENT,
      margin: [0, 0, 0, last ? 0 : 14 * s],
    });
  };
  if (chap.length) list('Bibliographie', chap, !gen.length);
  if (gen.length) list(chap.length ? 'Bibliographie générale du livre' : 'Bibliographie', gen, true);
  return out;
}

/** Page de présentation du livre : titre, auteur, date de parution, genre, notice, date de lecture. */
export function presentation(book) {
  const f = book.fiche || {};
  const details = [
    book.pubDate && ['Date de parution', book.pubDate],
    f.genre && ['Genre', f.genre],
    ...NOTICE_FIELDS.filter(([k]) => k !== 'dateLecture' && book[k]).map(([k, l]) => [l, book[k]]),
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
  // Plusieurs fiches d'un même livre à la suite : une seule page de présentation (avant la première).
  // Chaque fiche a au verso la bibliographie de son chapitre ; la dernière, aussi la bibliographie
  // générale du livre.
  const same = (a, b) => !!a && !!b && a.book.id != null && a.book.id === b.book.id;
  items.forEach(({ book, r = 1, v = 1, flow = false }, i) => {
    const first = !same(items[i - 1], items[i]);
    const last = !same(items[i], items[i + 1]);
    if (withPresentation && first) {
      content.push({ stack: presentation(book), pageBreak: i ? 'beforeOdd' : undefined });
      content.push({ stack: recto(book, r), pageBreak: 'beforeOdd' });
    } else {
      content.push({ stack: recto(book, r), pageBreak: i ? 'beforeOdd' : undefined });
    }
    // Résumé qui déborde : les références suivent directement, sur le verso.
    if (hasVerso(book, last)) content.push(flow ? { stack: verso(book, r, last, true) } : { stack: verso(book, v, last), pageBreak: 'before' });
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
 * Trouve, pour chaque fiche, la plus grande taille de texte possible, sur une feuille recto-verso :
 * - d'abord le résumé seul au recto (on accepte de réduire un peu le texte pour cela) ;
 * - sinon le résumé continue au verso, suivi des références, en gardant le texte assez grand.
 * `countPages(doc)` calcule le nombre de pages d'un document (pdfmake).
 */
/** En dessous de cette taille, on préfère laisser le résumé continuer au verso. */
const MIN_RECTO_SEUL = 0.88;

export async function fitItems(books, countPages) {
  const pages = (content) => countPages({ pageSize: 'A4', pageMargins: MARGINS, content, defaultStyle: { font: 'Literata' } });
  const fit = async (side, book, scales = SCALES) => {
    for (const s of scales) if ((await pages(side(book, s))) <= 1) return { scale: s, ok: true };
    return { scale: SCALES[SCALES.length - 1], ok: false };
  };
  const items = [];
  const tooLong = [];
  for (const [i, book] of books.entries()) {
    // Dernière fiche de son livre dans la liste : le verso porte aussi la bibliographie générale.
    const next = books[i + 1];
    const last = !(next && book.id != null && next.id === book.id);
    const refs = hasVerso(book, last);
    const verseFit = () => (refs ? fit((b, x) => verso(b, x, last), book) : { scale: 1, ok: true });

    // 1. Résumé seul au recto, texte normal ou à peine réduit.
    const r = await fit(recto, book, SCALES.filter((s) => s >= MIN_RECTO_SEUL));
    if (r.ok) {
      const v = await verseFit();
      if (!v.ok) tooLong.push(book.title);
      items.push({ book, r: r.scale, v: v.scale });
      continue;
    }
    // 2. Le résumé continue au verso, suivi des références : le tout sur deux pages.
    let flow = null;
    for (const s of SCALES) {
      const content = [...recto(book, s), ...(refs ? verso(book, s, last, true) : [])];
      if ((await pages(content)) <= 2) { flow = s; break; }
    }
    if (flow != null) {
      items.push({ book, r: flow, v: flow, flow: true });
      continue;
    }
    // 3. Vraiment trop long : le plus petit texte, signalé.
    tooLong.push(book.title);
    items.push({ book, r: SCALES[SCALES.length - 1], v: SCALES[SCALES.length - 1], flow: true });
  }
  return { items, tooLong };
}

/**
 * Résumé général d'un livre, sur plusieurs pages A4 : titre du livre et auteur, intertitres,
 * paragraphes, puis les idées clés. `s` réduit un peu le texte pour tenir dans le nombre de pages voulu.
 */
export function buildGeneralA4Doc(book, s = 1) {
  const g = book.resumeGeneral || { sections: [], idees: [] };
  const content = [
    ...header(s, 'Résumé général', book.title),
    book.author ? { text: [book.author, book.pubDate].filter(Boolean).join(' · '), italics: true, color: GREY, fontSize: 11 * s, margin: [0, -6 * s, 0, 14 * s] } : '',
  ];
  for (const sec of g.sections || []) {
    if (sec.titre) content.push({ text: sec.titre, bold: true, fontSize: 13 * s, color: ACCENT, margin: [0, 8 * s, 0, 5 * s], headlineLevel: 1 });
    for (const p of sec.paragraphes) {
      content.push({ text: p, fontSize: 11.5 * s, lineHeight: 1.36, alignment: 'justify', margin: [0, 0, 0, 7 * s] });
    }
  }
  if (g.idees?.length) {
    content.push(label('Idées clés du livre', s, { margin: [0, 12 * s, 0, 7 * s], headlineLevel: 1 }));
    g.idees.forEach((i, k) => {
      content.push({
        columns: [
          { text: String(k + 1), width: 16 * s, fontSize: 11 * s, bold: true, color: ACCENT },
          { text: [{ text: i.titre, bold: true }, i.texte ? { text: ` — ${i.texte}` } : ''], fontSize: 10.8 * s, lineHeight: 1.32 },
        ],
        unbreakable: true,
        margin: [0, 0, 0, 6 * s],
      });
    });
  }
  return {
    pageSize: 'A4',
    pageMargins: [MARGINS[0], MARGINS[1], MARGINS[2], 56],
    info: { title: `Résumé général — ${book.title}` },
    content,
    // Un intertitre ne reste jamais seul en bas de page.
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.getFollowingNodesOnPage().length === 0,
    footer: (page, count) => (count > 1 ? { text: `${page} / ${count}`, alignment: 'center', fontSize: 9, color: GREY, margin: [0, 22, 0, 0] } : null),
    defaultStyle: { font: 'Literata', fontSize: 11.5, color: '#1d1d1d' },
  };
}
