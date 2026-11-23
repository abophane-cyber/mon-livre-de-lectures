import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractIsbn, fromOpenLibrary, lookupBook, mergeNotices, normalizeIsbn } from '../src/booklookup.js';

test('ISBN 10 et 13, avec ou sans tirets', () => {
  assert.equal(normalizeIsbn('2070360024'), '9782070360024');
  assert.equal(normalizeIsbn('978-2-07-036002-4'), '9782070360024');
  assert.equal(normalizeIsbn('0-8044-2957-X'), '9780804429573');
  assert.equal(normalizeIsbn('9782070360025'), '');
});

test('ISBN trouvé dans un lien', () => {
  assert.deepEqual(extractIsbn('https://www.amazon.fr/L%C3%A9tranger-Albert-Camus/dp/2070360024/ref=sr_1_1'), { isbn: '9782070360024' });
  assert.deepEqual(extractIsbn('https://www.amazon.fr/gp/product/2070360024?tag=x'), { isbn: '9782070360024' });
  assert.deepEqual(extractIsbn('https://www.decitre.fr/livres/l-etranger-9782070360024.html'), { isbn: '9782070360024' });
  assert.deepEqual(extractIsbn(''), { isbn: '' });
  assert.match(extractIsbn('https://www.amazon.fr/dp/B0CXYZ1234').error, /Kindle/);
  assert.match(extractIsbn('https://www.fnac.com/a123456/livre').error, /ne contient pas/);
  assert.match(extractIsbn('12345').error, /pas un ISBN/);
});

test('Notice Open Library', () => {
  const n = fromOpenLibrary({
    publishers: ['Gallimard'], publish_date: '1984', series: ['Collection Folio No. 2'], number_of_pages: 185,
    isbn_10: ['2070360024'], by_statement: "Albert Camus ; traduit de l'anglais par Jean Dupont.",
  });
  assert.deepEqual(n, {
    editeur: 'Gallimard', collection: 'Folio No. 2', edition: 'Folio No. 2, 1984', pages: '185',
    traduction: "traduit de l'anglais par Jean Dupont", isbn: '9782070360024',
  });
  assert.equal(fromOpenLibrary({ contributions: ['Marie Martin (Translator)'] }).traduction, 'traduit par Marie Martin');
});

test('Fusion : la première source gagne, collection dans l’édition', () => {
  assert.deepEqual(mergeNotices({ editeur: 'A' }, { editeur: 'B', edition: 'B, 2020', collection: 'Points' }), {
    editeur: 'A', edition: 'Points, 2020', collection: 'Points',
  });
});

test('Recherche par ISBN et par titre (réseau simulé)', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('openlibrary.org/isbn/9782070360024')) return { publishers: ['Gallimard'], number_of_pages: 185 };
    if (url.includes('googleapis') && url.includes('intitle')) {
      return { items: [{ volumeInfo: { publisher: 'Gallimard', publishedDate: '1972-01-01', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782070360024' }] } }] };
    }
    return null;
  };
  const a = await lookupBook({ query: '2070360024' }, fake);
  assert.equal(a.notice.editeur, 'Gallimard');
  assert.equal(a.notice.isbn, '9782070360024');
  const b = await lookupBook({ title: "L'étranger", author: 'Camus' }, fake);
  assert.equal(b.byTitle, true);
  assert.equal(b.notice.pages, '185');
  assert.equal(b.notice.edition, 'Gallimard, 1972');
  assert.match((await lookupBook({}, fake)).error, /titre/);
});
