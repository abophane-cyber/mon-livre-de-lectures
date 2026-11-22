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

test('sans références : une seule page ; avec bibliographie : recto-verso', async () => {
  const sans = { ...book(2, 3, 0) };
  delete sans.isbn;
  const { items } = await fitItems([sans], countPages);
  assert.equal(await countPages(buildFicheA4Doc(items)), 1);
  const avec = { ...sans, bibliographie: ['Piketty, Le Capital, 2013.'] };
  const fit2 = await fitItems([avec], countPages);
  assert.equal(await countPages(buildFicheA4Doc(fit2.items)), 2);
});

test('la fiche A4 ne montre ni titre du livre, ni auteur, ni date ; le chapitre oui', async () => {
  const { recto, verso } = await import('../src/fichea4.js');
  const b = { ...book(1, 1, 0), fiche: { ...book(1, 1, 0).fiche, chapitre: 'Chapitre 3. La dette' }, bibliographie: ['Réf.'] };
  const txt = JSON.stringify([recto(b), verso(b)]);
  assert.ok(!txt.includes('Madame Bovary'));
  assert.ok(!txt.includes('Gustave Flaubert'));
  assert.ok(!txt.includes('1857'));
  assert.ok(txt.includes('Chapitre 3. La dette'));
});

test('page de présentation : seule sur sa feuille, puis le résumé sur une page impaire', async () => {
  const { items } = await fitItems([book(1, 2, 0)], countPages);
  // présentation (1) + dos blanc (2) + recto (3) + verso références (4)
  assert.equal(await countPages(buildFicheA4Doc(items, null, { presentation: true })), 4);
  const sans = { ...book(1, 2, 0) };
  delete sans.isbn;
  const fit2 = await fitItems([sans, sans], countPages);
  // 2 × (présentation + dos blanc + recto + dos blanc), le dernier dos blanc n'est pas ajouté
  assert.equal(await countPages(buildFicheA4Doc(fit2.items, null, { presentation: true })), 7);
});
