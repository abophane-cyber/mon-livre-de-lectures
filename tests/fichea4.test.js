import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildFicheA4Doc, buildGeneralA4Doc, fitItems } from '../src/fichea4.js';

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

// Une fiche avec des références a un verso (la notice, elle, n'est pas sur les fiches).
const avecRefs = (b) => ({ ...b, bibliographie: ['Flaubert, Correspondance, Gallimard, 1973.'] });

test('fiche courte : taille normale, exactement 2 pages', async () => {
  const { items, tooLong } = await fitItems([avecRefs(book(2, 3, 3))], countPages);
  assert.deepEqual(tooLong, []);
  assert.equal(items[0].r, 1);
  assert.equal(await countPages(buildFicheA4Doc(items)), 2);
});

test('fiche longue : le résumé continue au verso, suivi des références, sur une seule feuille', async () => {
  const { items, tooLong } = await fitItems([avecRefs(book(6, 8, 6))], countPages);
  assert.deepEqual(tooLong, []);
  assert.equal(items[0].flow, true);
  assert.ok(items[0].r >= 0.85, 'texte gardé assez grand');
  const doc = buildFicheA4Doc(items);
  assert.equal(await countPages(doc), 2);
  assert.ok(JSON.stringify(doc).includes('Correspondance'));
});

test('fiche très longue sans références : deux pages au plus', async () => {
  const { items } = await fitItems([book(9, 10, 0)], countPages);
  assert.equal(await countPages(buildFicheA4Doc(items)), 2);
});

test('plusieurs fiches : chaque recto commence sur une page impaire', async () => {
  const { items } = await fitItems([book(2, 3, 3), book(3, 4, 2), book(1, 2, 1)].map(avecRefs), countPages);
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
  assert.ok(txt.includes('CHAPITRE 3 · RÉSUMÉ'));
  assert.ok(txt.includes('"La dette"'));
});

test('page de présentation : seule sur sa feuille, puis le résumé sur une page impaire', async () => {
  const { items } = await fitItems([book(1, 2, 0)], countPages);
  // présentation (1) + dos blanc (2) + recto (3) : la notice est sur la présentation, pas au verso
  const doc1 = buildFicheA4Doc(items, null, { presentation: true });
  assert.equal(await countPages(doc1), 3);
  assert.ok(JSON.stringify(doc1.content[0]).includes('ISBN'));
  const sans = { ...book(1, 2, 0) };
  delete sans.isbn;
  const fit2 = await fitItems([sans, sans], countPages);
  // 2 × (présentation + dos blanc + recto + dos blanc), le dernier dos blanc n'est pas ajouté
  assert.equal(await countPages(buildFicheA4Doc(fit2.items, null, { presentation: true })), 7);
});

test('deux fiches du même livre : une seule présentation, bibliographie générale après la dernière', () => {
  const b = { ...book(1, 1, 0), id: 'L', bibliographieGenerale: ['Réf.'] };
  const doc = buildFicheA4Doc([{ book: b }, { book: b }, { book: { ...b, id: 'M' } }], null, { presentation: true });
  // L : présentation, recto, recto, verso ; M : présentation, recto, verso.
  assert.equal(doc.content.length, 7);
  const n = buildFicheA4Doc([{ book: b }, { book: b }], null, { presentation: false });
  assert.equal(n.content.length, 3);
});

test('bibliographie d’un chapitre : au verso de sa propre fiche, jamais la notice', () => {
  const base = { ...book(1, 1, 0), id: 'L' };
  const ch1 = { ...base, bibliographie: ['Réf. du chapitre 1'] };
  const ch2 = { ...base, bibliographie: [] };
  const doc = buildFicheA4Doc([{ book: ch1 }, { book: ch2 }]);
  // recto 1, verso 1 (bibliographie du chapitre 1), recto 2 (pas de verso : la notice n'est pas sur les fiches)
  assert.equal(doc.content.length, 3);
  const v1 = JSON.stringify(doc.content[1]);
  assert.ok(v1.includes('Réf. du chapitre 1'));
  assert.ok(!JSON.stringify(doc.content).includes('ISBN'));
});

test('résumé général : environ 450 mots par page A4', async () => {
  // Texte français ordinaire (longueur moyenne des mots réaliste).
  const fr = "Le livre montre que la dette publique n'est pas un fardeau mais un outil politique qui permet de financer les services publics et la transition écologique sans sacrifier les plus fragiles".split(' ');
  const words = (n) => Array.from({ length: n }, (_, i) => fr[i % fr.length]).join(' ') + '.';
  const gen = (pages) => {
    const total = 330 + (pages - 1) * 400;
    const idees = Array.from({ length: Math.min(12, 2 + pages * 2) }, (_, i) => ({ titre: 'Idée ' + i, texte: words(15) }));
    const reste = total - idees.length * 17;
    const nSec = pages > 1 ? pages + 1 : 1;
    const sections = Array.from({ length: nSec }, (_, k) => ({
      titre: pages > 1 ? 'Partie ' + (k + 1) : '',
      paragraphes: Array.from({ length: 3 }, () => words(Math.round(reste / nSec / 3))),
    }));
    return { title: 'Le livre', author: 'Auteur', resumeGeneral: { pages, sections, idees } };
  };
  for (const p of [1, 2, 4]) {
    // Comme au téléchargement : le texte peut être réduit jusqu'à 85 % pour tenir.
    const n1 = await countPages(buildGeneralA4Doc(gen(p)));
    const n = await countPages(buildGeneralA4Doc(gen(p), 0.85));
    console.log(`  ${p} page(s) demandée(s) → ${n1} (100 %), ${n} (85 %)`);
    assert.ok(n >= p - 1 && n <= p, `${p} → ${n}`);
  }
});

test('PDF livre complet : informations du livre sous le titre', async () => {
  const { noticeBlock, buildDocDefinition } = await import('../src/pdfdoc.js');
  assert.deepEqual(noticeBlock({ title: 'X' }), []);
  const [block] = noticeBlock({ editeur: 'Seuil', collection: 'Documents', isbn: '9782021611014', pages: '219', dateLecture: 'novembre 2026' });
  const txt = block.text.map((t) => t.text).join('');
  assert.match(txt, /ÉDITEUR Seuil/);
  assert.match(txt, /COLLECTION Documents/);
  assert.match(txt, /ISBN 9782021611014/);
  assert.match(txt, /LU EN novembre 2026/);
  const doc = buildDocDefinition([{ id: 'a', title: 'Riches ensemble !', editeur: 'Seuil', fiche: { resume: ['Texte.'] } }], { titreLivre: 'T', date: '' });
  assert.ok(JSON.stringify(doc.content).includes('Seuil'));
});
