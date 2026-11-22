import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildFicheA4Doc, fitItems } from '../src/fichea4.js';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const f = new URL('../node_modules/@fontsource/literata/files/literata-latin-', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
pdfmake.setLocalAccessPolicy?.(() => true);
pdfmake.setUrlAccessPolicy?.(() => false);
pdfmake.addFonts({
  Literata: { normal: f + '400-normal.woff', bold: f + '700-normal.woff', italics: f + '400-italic.woff', bolditalics: f + '700-italic.woff' },
});

const countPages = async (doc) => {
  let n = 0;
  await pdfmake.createPdf({ ...doc, footer: (p, c) => ((n = c), null) }).getBuffer();
  return n;
};

const para = 'Emma rêve d’une vie romanesque que la province ne peut lui offrir, et son mariage la plonge dans l’ennui. ';
const book = (paras, ideas, cits) => ({
  title: 'Madame Bovary',
  author: 'Gustave Flaubert',
  pubDate: '1857',
  isbn: '978-2-07-041311-9',
  fiche: {
    genre: 'Roman',
    accroche: 'Une accroche.',
    resume: Array.from({ length: paras }, () => para.repeat(4)),
    idees_cles: Array.from({ length: ideas }, (_, i) => ({ titre: 'Idée ' + i, texte: para })),
    personnages: [{ nom: 'Emma', role: 'héroïne' }],
    citations: Array.from({ length: cits }, () => ({ texte: 'Il faut se défier des rêves.', commentaire: 'Commentaire.' })),
    a_retenir: 'À retenir.',
    pour_qui: 'Pour qui.',
  },
});

test('fiche courte : taille normale, exactement 2 pages', async () => {
  const { items, tooLong } = await fitItems([book(2, 3, 3)], countPages);
  assert.deepEqual(tooLong, []);
  assert.equal(items[0].r, 1);
  assert.equal(await countPages(buildFicheA4Doc(items)), 2);
});

test('fiche longue : texte réduit pour tenir sur une page par face', async () => {
  const { items } = await fitItems([book(6, 8, 6)], countPages);
  assert.ok(items[0].r < 1);
  assert.equal(await countPages(buildFicheA4Doc(items)), 2);
});

test('plusieurs fiches : chaque recto commence sur une page impaire', async () => {
  const { items } = await fitItems([book(2, 3, 3), book(3, 4, 2), book(1, 2, 1)], countPages);
  assert.equal(await countPages(buildFicheA4Doc(items)), 6);
});
