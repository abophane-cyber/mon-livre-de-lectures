// Génère et télécharge le PDF dans le navigateur (chargé seulement quand on en a besoin).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff?url';
import literata700 from '@fontsource/literata/files/literata-latin-700-normal.woff?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff?url';
import literata700i from '@fontsource/literata/files/literata-latin-700-italic.woff?url';
import { buildDocDefinition } from './pdfdoc.js';
import { downloadBlob } from './download.js';

let pdfMakePromise;

async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = import('pdfmake/build/pdfmake').then((mod) => {
      const pdfMake = mod.default || mod;
      const abs = (u) => new URL(u, window.location.href).href;
      // N'autoriser que les fichiers de l'appli elle-même.
      pdfMake.setUrlAccessPolicy((url) => url.startsWith(window.location.origin));
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
