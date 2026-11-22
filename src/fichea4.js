// Fiche de lecture A4 recto-verso : le résumé au recto, les références au verso.
// Chaque face doit tenir sur une seule page : la taille du texte s'ajuste toute seule.

const ACCENT = '#8a5a14';
const GREY = '#5c5c5c';
const HIGHLIGHT = '#fff0a0';
const BOX = '#f6efe0';
const RULE = '#e4dccb';

/** Échelles essayées, de la plus grande à la plus petite, pour faire tenir une face sur une page. */
export const SCALES = [1, 0.94, 0.88, 0.82, 0.77, 0.72, 0.67, 0.62];
const MARGINS = [50, 46, 50, 46];

export const NOTICE_FIELDS = [
  ['editeur', 'Éditeur'],
  ['collection', 'Collection'],
  ['isbn', 'ISBN'],
  ['dateLecture', 'Date de lecture'],
];

const byline = (b) => [b.author, b.pubDate].filter(Boolean).join(' · ');

function label(text, s, extra = {}) {
  return { text: text.toUpperCase(), fontSize: 8 * Math.max(s, 0.85), bold: true, color: ACCENT, characterSpacing: 1.5, ...extra };
}

function header(book, s, kicker) {
  const f = book.fiche;
  return [
    {
      columns: [
        label(kicker, s),
        { text: (f.genre || '').toUpperCase(), fontSize: 8 * Math.max(s, 0.85), color: GREY, characterSpacing: 1.2, alignment: 'right' },
      ],
    },
    { text: book.title, fontSize: 24 * s, bold: true, lineHeight: 1.1, margin: [0, 8 * s, 0, 2 * s] },
    byline(book) ? { text: byline(book), fontSize: 11 * s, italics: true, color: GREY } : '',
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: RULE },
        { type: 'line', x1: 0, y1: 0, x2: 56, y2: 0, lineWidth: 2, lineColor: ACCENT },
      ],
      margin: [0, 10 * s, 0, 12 * s],
    },
  ];
}

/** Recto : accroche, résumé, idées clés, personnages, et l'encadré « À retenir / Pour qui ? ». */
export function recto(book, s = 1) {
  const f = book.fiche;
  const body = { fontSize: 10.5 * s, lineHeight: 1.32 };
  const out = [...header(book, s, 'Fiche de lecture')];
  if (f.accroche) out.push({ text: f.accroche, fontSize: 13 * s, italics: true, lineHeight: 1.3, margin: [0, 0, 0, 12 * s] });

  if (f.resume?.length) {
    out.push(label('Résumé', s, { margin: [0, 0, 0, 6 * s] }));
    for (const p of f.resume) out.push({ text: p, ...body, alignment: 'justify', margin: [0, 0, 0, 6 * s] });
  }

  if (f.idees_cles?.length) {
    out.push(label('Idées clés', s, { margin: [0, 8 * s, 0, 6 * s] }));
    const cell = (i, n) => ({
      columns: [
        { text: String(n), width: 16 * s, fontSize: 11 * s, bold: true, color: ACCENT },
        {
          stack: [
            { text: i.titre, bold: true, fontSize: 10.5 * s, margin: [0, 0, 0, 1] },
            { text: i.texte, fontSize: 9.8 * s, lineHeight: 1.28 },
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
    out.push(label(f.personnages_titre || 'Personnages', s, { margin: [0, 4 * s, 0, 5 * s] }));
    out.push({
      text: f.personnages.flatMap((p, k) => [
        k ? { text: '   ·   ', color: ACCENT } : '',
        { text: p.nom, bold: true },
        p.role ? { text: ` — ${p.role}` } : '',
      ]),
      ...body,
      fontSize: 9.8 * s,
      margin: [0, 0, 0, 10 * s],
    });
  }

  const boxCol = (title, text) => ({
    stack: [label(title, s, { margin: [0, 0, 0, 4] }), { text, fontSize: 9.8 * s, lineHeight: 1.3 }],
  });
  const cols = [f.a_retenir && boxCol('À retenir', f.a_retenir), f.pour_qui && boxCol('Pour qui ?', f.pour_qui)].filter(Boolean);
  if (cols.length) {
    out.push({
      table: { widths: ['*'], body: [[{ columns: cols, columnGap: 20, fillColor: BOX }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i) => (i === 0 ? 2 : 0),
        vLineColor: () => ACCENT,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 10 * s,
        paddingBottom: () => 10 * s,
      },
      margin: [0, 6 * s, 0, 0],
      unbreakable: true,
    });
  }
  return out;
}

/** Verso : notice du livre, puis les citations commentées. */
export function verso(book, s = 1) {
  const f = book.fiche;
  const out = [...header(book, s, 'Références')];

  const rows = [
    ['Titre', book.title],
    ['Auteur', book.author],
    ['Date de parution', book.pubDate],
    ['Genre', f.genre],
    ...NOTICE_FIELDS.map(([k, l]) => [l, book[k]]),
  ].filter(([, v]) => v);
  out.push(label('Notice', s, { margin: [0, 0, 0, 4 * s] }));
  out.push({
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
    margin: [0, 0, 0, 14 * s],
  });

  if (f.citations?.length) {
    out.push(label('Citations', s, { margin: [0, 0, 0, 8 * s] }));
    for (const c of f.citations) {
      out.push({
        stack: [
          { text: [{ text: `« ${c.texte} »`, background: HIGHLIGHT, italics: true }], fontSize: 10.5 * s, lineHeight: 1.42 },
          c.commentaire ? { text: c.commentaire, fontSize: 9.3 * s, color: GREY, lineHeight: 1.28, margin: [0, 3, 0, 0] } : '',
        ],
        unbreakable: true,
        margin: [10, 0, 0, 11 * s],
      });
    }
  }
  return out;
}

/** Document : pour chaque livre, recto (toujours sur une page impaire) puis verso. */
export function buildFicheA4Doc(items, onPageCount) {
  const content = [];
  items.forEach(({ book, r = 1, v = 1 }, i) => {
    content.push({ stack: recto(book, r), pageBreak: i ? 'beforeOdd' : undefined });
    content.push({ stack: verso(book, v), pageBreak: 'before' });
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
    const v = await fit(verso, book);
    if (!r.ok || !v.ok) tooLong.push(book.title);
    items.push({ book, r: r.scale, v: v.scale });
  }
  return { items, tooLong };
}
