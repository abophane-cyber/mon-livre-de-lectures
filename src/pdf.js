// Génère et télécharge les PDF dans le navigateur (chargé seulement quand on en a besoin).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff?url';
import literata700 from '@fontsource/literata/files/literata-latin-700-normal.woff?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff?url';
import literata700i from '@fontsource/literata/files/literata-latin-700-italic.woff?url';
import { buildDocDefinition } from './pdfdoc.js';
import { SCALES, buildFicheA4Doc, buildGeneralA4Doc, fitItems } from './fichea4.js';
import { downloadBlob } from './download.js';
import { normalize } from './util.js';

let pdfMakePromise;

async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = import('pdfmake/build/pdfmake').then((mod) => {
      const pdfMake = mod.default || mod;
      const abs = (u) => new URL(u, window.location.href).href;
      // N'autoriser que les fichiers de l'appli elle-même.
      pdfMake.setUrlAccessPolicy((url) => url.startsWith(window.location.origin));
      // Les polices sont téléchargées une seule fois, même si on crée plusieurs documents.
      pdfMake.setUrlResourceCaching?.(true);
      pdfMake.addFonts({
        Literata: {
          normal: abs(literata400),
          bold: abs(literata700),
          italics: abs(literata400i),
          bolditalics: abs(literata700i),
        },
      });
      return pdfMake;
    });
  }
  return pdfMakePromise;
}

export async function createPdfBlob(books, cover) {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf(buildDocDefinition(books, cover)).getBlob();
}

export async function downloadPdf(books, cover, filename) {
  const blob = await createPdfBlob(books, cover);
  await downloadBlob(blob, filename);
  return blob;
}

export const slug = (s) => normalize(s).replace(/ /g, '-').slice(0, 60) || 'fiche';

/**
 * Fiches A4 recto-verso. Renvoie { blob, tooLong, small } :
 * tooLong = fiches qui débordent même en petit, small = fiches imprimées en petits caractères.
 */
export async function createFichesA4Blob(books, options = {}) {
  const pdfMake = await loadPdfMake();
  const countPages = async (doc) => {
    let n = 0;
    await pdfMake.createPdf({ ...doc, footer: (p, c) => ((n = c), null) }).getBuffer();
    return n;
  };
  // Les résumés généraux sont mis en page à part, puis remis à leur place (avant les fiches du livre).
  const fiches = books.filter((b) => !b.general);
  const { items: fitted, tooLong } = await fitItems(fiches, countPages);
  const items = [];
  for (const b of books) {
    items.push(b.general ? { book: b, r: await fitGeneral(b, countPages), general: true } : fitted.shift());
  }
  const small = items.filter((i) => !i.general && Math.min(i.r, i.v) < 0.75).map((i) => i.book.title);
  const blob = await pdfMake.createPdf(buildFicheA4Doc(items, null, options)).getBlob();
  return { blob, tooLong, small };
}

export async function downloadFichesA4(books, filename, options = {}) {
  const result = await createFichesA4Blob(books, options);
  await downloadBlob(result.blob, filename);
  return result;
}

/**
 * Résumé général A4. Le texte est un peu réduit (jusqu'à 79 %) s'il dépasse le nombre
 * de pages demandé. Renvoie { blob, pages }.
 */
/** Le résumé général peut être réduit jusqu'à 79 % pour tenir dans le nombre de pages demandé. */
const MIN_GENERAL = 0.79;

async function fitGeneralPages(book, countPages) {
  const voulu = book.resumeGeneral?.pages || 1;
  let scale = 1;
  let pages = await countPages(buildGeneralA4Doc(book, 1));
  for (const s of SCALES.filter((x) => x < 1 && x >= MIN_GENERAL)) {
    if (pages <= voulu) break;
    const n = await countPages(buildGeneralA4Doc(book, s));
    if (n < pages) {
      scale = s;
      pages = n;
    }
  }
  return { scale, pages };
}

/** Taille du texte du résumé général (1 = normale). */
async function fitGeneral(book, countPages) {
  return (await fitGeneralPages(book, countPages)).scale;
}

/** Nombre de pages du PDF du résumé général (sans créer le fichier). */
export async function countGeneralPages(book) {
  const pdfMake = await loadPdfMake();
  const countPages = async (doc) => {
    let n = 0;
    await pdfMake.createPdf({ ...doc, footer: (p, c) => ((n = c), null) }).getBuffer();
    return n;
  };
  return (await fitGeneralPages(book, countPages)).pages;
}

export async function createGeneralA4Blob(book) {
  const pdfMake = await loadPdfMake();
  const countPages = async (doc) => {
    let n = 0;
    await pdfMake.createPdf({ ...doc, footer: (p, c) => ((n = c), null) }).getBuffer();
    return n;
  };
  const { scale, pages } = await fitGeneralPages(book, countPages);
  const blob = await pdfMake.createPdf(buildGeneralA4Doc(book, scale)).getBlob();
  return { blob, pages };
}

export async function downloadGeneralA4(book, filename) {
  const result = await createGeneralA4Blob(book);
  await downloadBlob(result.blob, filename);
  return result;
}
