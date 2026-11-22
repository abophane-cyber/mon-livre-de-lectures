// Génère et télécharge les PDF dans le navigateur (chargé seulement quand on en a besoin).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff?url';
import literata700 from '@fontsource/literata/files/literata-latin-700-normal.woff?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff?url';
import literata700i from '@fontsource/literata/files/literata-latin-700-italic.woff?url';
import { buildDocDefinition } from './pdfdoc.js';
import { buildFicheA4Doc, fitItems } from './fichea4.js';
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
  downloadBlob(blob, filename);
  return blob;
}

export const slug = (s) => normalize(s).replace(/ /g, '-').slice(0, 60) || 'fiche';

/**
 * Fiches A4 recto-verso. Renvoie { blob, tooLong, small } :
 * tooLong = fiches qui débordent même en petit, small = fiches imprimées en petits caractères.
 */
export async function createFichesA4Blob(books) {
  const pdfMake = await loadPdfMake();
  const countPages = async (doc) => {
    let n = 0;
    await pdfMake.createPdf({ ...doc, footer: (p, c) => ((n = c), null) }).getBuffer();
    return n;
  };
  const { items, tooLong } = await fitItems(books, countPages);
  const small = items.filter((i) => Math.min(i.r, i.v) < 0.75).map((i) => i.book.title);
  const blob = await pdfMake.createPdf(buildFicheA4Doc(items)).getBlob();
  return { blob, tooLong, small };
}

export async function downloadFichesA4(books, filename) {
  const result = await createFichesA4Blob(books);
  downloadBlob(result.blob, filename);
  return result;
}
