import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allThemes, filterBooks, hasTheme, parseThemes, searchBook, sortBooks, themesOf } from '../src/books.js';

const bovary = {
  id: 'b1', title: 'Madame Bovary', author: 'Gustave Flaubert', themes: ['Roman réaliste'],
  fiches: [{ id: 'p1', fiche: { genre: 'Roman', resume: ['Emma rêve d’une vie romanesque ; son mariage la plonge dans l’ennui.'],
    idees_cles: [{ titre: 'La dette', texte: 'Lheureux ruine Emma peu à peu.' }] } }],
};
const riches = {
  id: 'b2', title: 'Riches ensemble !', author: 'Anne-Laure Delatte', themes: ['Économie'],
  fiches: [{ id: 'p2', fiche: { genre: 'Essai', resume: ["L'État a soutenu les entreprises sans contrepartie."] } }],
};

test('Recherche dans le contenu des fiches, sans accents ni majuscules', () => {
  const r = searchBook(bovary, 'ENNUI');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].fi, 'p1');
  assert.equal(r.hits[0].match, 'ennui');
  assert.ok(searchBook(riches, 'etat entreprises'));
  assert.equal(searchBook(riches, 'ennui'), null);
  // Tous les mots doivent être dans le livre.
  assert.equal(searchBook(bovary, 'dette publique'), null);
  assert.deepEqual(filterBooks([bovary, riches], 'économie').map((b) => b.id), ['b2']);
  assert.deepEqual(filterBooks([bovary, riches], '').map((b) => b.id), ['b1', 'b2']);
});

test('Thèmes : saisie, genre des fiches, filtre et tri', () => {
  assert.deepEqual(parseThemes('Économie, histoire ; économie,  '), ['Économie', 'histoire']);
  assert.deepEqual(themesOf(bovary), ['Roman réaliste', 'Roman']);
  assert.deepEqual(allThemes([bovary, riches]), ['Économie', 'Essai', 'Roman', 'Roman réaliste']);
  assert.ok(hasTheme(riches, 'economie'));
  assert.ok(!hasTheme(bovary, 'Économie'));
  const sans = { id: 'b3', title: 'Sans thème', fiches: [] };
  assert.deepEqual(sortBooks([sans, bovary, riches], [], 'theme').map((b) => b.id), ['b2', 'b1', 'b3']);
});
