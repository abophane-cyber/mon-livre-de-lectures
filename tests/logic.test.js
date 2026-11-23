import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClippings, parseTitleLine } from '../src/clippings.js';
import { parseAnswer, checkCitations, buildPrompt, buildNoticePrompt } from '../src/prompt.js';
import { applyNotice } from '../src/notice.js';
import { mergeBackup } from '../src/sync.js';
import { chapterOf, flatten, mergeParts, normalizeBook, partsOf, readyFiches, withPart, withoutPart } from '../src/fiches.js';
import { mergePassages, splitPassages, yearOf } from '../src/util.js';

const CLIPPINGS = `﻿Madame Bovary (French Edition) (Flaubert, Gustave)
- Votre surlignement sur la page 12 | emplacement 180-182 | Ajouté le lundi 3 mars 2025 21:04:11

Elle aurait voulu que ce nom de Bovary fût illustre.
==========
Madame Bovary (French Edition) (Flaubert, Gustave)
- Votre signet à l'emplacement 200 | Ajouté le lundi 3 mars 2025 21:05:00


==========
Madame Bovary (French Edition) (Flaubert, Gustave)
- Votre surlignement sur la page 5 | emplacement 70-71 | Ajouté le lundi 3 mars 2025 20:00:00

Il faut, au contraire, se défier des rêves.
==========
Madame Bovary (French Edition) (Flaubert, Gustave)
- Votre surlignement sur la page 5 | emplacement 70-72 | Ajouté le lundi 3 mars 2025 20:01:00

Il faut, au contraire, se défier des rêves. Ils trompent.
==========
Madame Bovary (French Edition) (Flaubert, Gustave)
- Votre note sur la page 5 | emplacement 72 | Ajouté le lundi 3 mars 2025 20:02:00

ma note perso
==========
Sapiens (A Brief History) (Yuval Noah Harari)
- Your Highlight on page 3 | Location 40-41 | Added on Monday, March 3, 2025

The cognitive revolution.
==========
`;

test('parseClippings : livres, ordre, signets, notes et doublons', () => {
  const books = parseClippings(CLIPPINGS);
  assert.equal(books.length, 2);
  const bovary = books[0];
  assert.equal(bovary.title, 'Madame Bovary');
  assert.equal(bovary.author, 'Gustave Flaubert');
  assert.deepEqual(bovary.passages, [
    'Il faut, au contraire, se défier des rêves. Ils trompent.',
    'Elle aurait voulu que ce nom de Bovary fût illustre.',
  ]);
  assert.equal(books[1].title, 'Sapiens (A Brief History)');
  assert.equal(books[1].author, 'Yuval Noah Harari');
});

test('parseTitleLine sans auteur', () => {
  assert.deepEqual(parseTitleLine('Mon document'), { title: 'Mon document', author: '' });
});

test('parseAnswer : JSON entouré de texte et de ```json', () => {
  const r = parseAnswer('Voici :\n```json\n{"genre":"Roman","accroche":"A","resume":"P1\\n\\nP2","idees_cles":[{"titre":"T","texte":"X"}],"personnages":[],"citations":[{"texte":"Ils trompent.","commentaire":"c"}],"a_retenir":"R","pour_qui":"Q"}\n```\nBonne lecture');
  assert.equal(r.ok, true);
  assert.deepEqual(r.fiche.resume, ['P1', 'P2']);
  assert.equal(r.fiche.personnages_titre, 'Personnages');
});

test('parseAnswer : erreurs claires', () => {
  assert.equal(parseAnswer('pas de json').ok, false);
  const r = parseAnswer('{"genre":"Roman"}');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('résumé')));
});

test('checkCitations : guillemets, apostrophes courbes et coupures […]', () => {
  const fiche = { citations: [
    { texte: '« Il faut, au contraire, se défier des rêves. »' },
    { texte: 'Il faut […] se défier des rêves' },
    { texte: 'Une phrase inventée.' },
    { texte: "L’homme" },
  ] };
  const missing = checkCitations(fiche, ['Il faut, au contraire, se défier des rêves.', "L'homme est là."]);
  assert.equal(missing, 1);
  assert.equal(fiche.citations[2].introuvable, true);
});

test('buildPrompt contient les règles et les passages', () => {
  const p = buildPrompt({ title: 'T', author: 'A', passages: ['un', 'deux'], length: 'court', lang: 'français' });
  assert.match(p, /Ne donne JAMAIS ton avis/);
  assert.match(p, /MON TEXTE\nun\n\ndeux/);
});

test('captures d\'écran : la demande et la lecture des passages recopiés', () => {
  const p = buildPrompt({ title: 'T', author: 'A', passages: [], captures: true });
  assert.match(p, /CAPTURES D'ÉCRAN/);
  assert.match(p, /TOUT le texte du livre visible/);
  assert.doesNotMatch(p, /## NOTICE/);
  assert.doesNotMatch(p, /"passages": \[/);
  assert.match(p, /tout est dans mes captures/);
  assert.doesNotMatch(buildPrompt({ title: 'T', passages: ['x'] }), /CAPTURES/);
  const r = parseAnswer(JSON.stringify({
    passages: ['« Il faut se défier des rêves. »', '  Ils   trompent. '],
    accroche: 'A', resume: ['P'], idees_cles: [{ titre: 'T', texte: 'X' }], citations: [{ texte: 'Ils trompent.' }], a_retenir: 'R', pour_qui: 'Q',
  }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.passages, ['Il faut se défier des rêves.', 'Ils trompent.']);
  assert.equal(checkCitations(r.fiche, r.passages), 0);
  assert.deepEqual(parseAnswer('{"accroche":"A","resume":["P"],"idees_cles":[{"titre":"T"}],"citations":[],"a_retenir":"R","pour_qui":"Q"}').passages, []);
});

test('notice et bibliographie : lecture, réponse partielle, sans écraser ce qui est rempli', () => {
  const r = parseAnswer('```json\n{"notice":{"editeur":"Seuil","isbn":"978-2-02-1","pages":"320","date_parution":"2026","inconnu":"x"},"bibliographie":["Piketty, Le Capital, 2013.","  "]}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.partial, true);
  assert.deepEqual(r.notice, { editeur: 'Seuil', isbn: '978-2-02-1', pages: '320', pubDate: '2026' });
  assert.deepEqual(r.bibliographie, ['Piketty, Le Capital, 2013.']);
  const book = { editeur: 'Éditeur déjà saisi', pubDate: '', bibliographie: ['Piketty, Le Capital, 2013.'] };
  const { patch, changed } = applyNotice(book, r.notice, [...r.bibliographie, 'Autre référence.']);
  assert.deepEqual(patch, { isbn: '978-2-02-1', pages: '320', pubDate: '2026', bibliographie: ['Piketty, Le Capital, 2013.', 'Autre référence.'] });
  assert.equal(changed, 4);
  assert.equal(buildNoticePrompt({ title: 'T' }).includes('Ne rédige pas de résumé'), true);
});

test('utilitaires', () => {
  assert.deepEqual(splitPassages('a\nb\n\n\nc'), ['a b', 'c']);
  assert.deepEqual(mergePassages(['abc'], ['abc def', 'x']), ['abc def', 'x']);
  assert.equal(yearOf('1857'), 1857);
  assert.equal(yearOf('vers 400 av. J.-C.'), -400);
  assert.equal(yearOf(''), null);
});

const book = (id, extra) => ({ id, title: 'Titre ' + id, author: 'Auteur', passages: ['p'], fiche: null, createdAt: 1, updatedAt: 1, ...extra });

test('mergeBackup : ajout, mise à jour, suppression', () => {
  const local = { books: [book('a'), book('b', { updatedAt: 5 }), book('c')], order: { value: ['c', 'b', 'a'], updatedAt: 10 } };
  const incoming = { books: [
    book('a', { updatedAt: 9, passages: ['nouveau'] }),
    book('b', { updatedAt: 2 }),
    { id: 'c', deleted: true, updatedAt: 3 },
    book('d', { createdAt: 7 }),
  ], order: { value: ['a'], updatedAt: 1 } };
  const r = mergeBackup(local, incoming);
  assert.deepEqual(r.report, { ajoutees: 1, misesAJour: 1, supprimees: 1, reunies: 0 });
  assert.deepEqual(partsOf(r.books.find((b) => b.id === 'a'))[0].passages, ['nouveau']);
  assert.deepEqual(r.order.value, ['b', 'a', 'd']);
});

test('mergeBackup : même livre créé sur les deux appareils, dans les deux sens', () => {
  const pc = { books: [book('x1', { title: 'Bovary', passages: ['un'] })], order: { value: ['x1'], updatedAt: 1 } };
  const tel = { books: [book('y9', { title: 'Bovary', passages: ['deux'], updatedAt: 4 })], order: { value: ['y9'], updatedAt: 2 } };
  const onPc = mergeBackup(pc, tel);
  assert.equal(onPc.report.reunies, 1);
  const live = onPc.books.filter((b) => !b.deleted);
  assert.equal(live.length, 1);
  assert.equal(live[0].id, 'x1');
  // Les deux fiches sont gardées dans le même livre.
  assert.deepEqual(partsOf(live[0]).map((p) => p.passages), [['un'], ['deux']]);
  assert.deepEqual(onPc.order.value, ['x1']);
  // Le téléphone importe ensuite la sauvegarde du PC.
  const onTel = mergeBackup(tel, { books: onPc.books, order: onPc.order });
  const liveTel = onTel.books.filter((b) => !b.deleted);
  assert.equal(liveTel.length, 1);
  assert.equal(liveTel[0].id, 'x1');
  assert.deepEqual(partsOf(liveTel[0]).map((p) => p.passages), [['un'], ['deux']]);
});

test('plusieurs fiches par livre : ancien format, ajout, suppression, aplatissement', () => {
  const old = book('b1', { fiche: { resume: ['R'] }, captures: true, isbn: '123' });
  const n = normalizeBook(old);
  assert.equal(n.fiche, undefined);
  assert.equal(n.passages, undefined);
  assert.deepEqual(partsOf(n).map((p) => p.id), ['p-b1']);
  assert.equal(partsOf(n)[0].captures, true);
  const deux = withPart(n, { id: 'c2', passages: ['chap 2'], fiche: null, createdAt: 5 });
  assert.equal(partsOf(deux).length, 2);
  const f2 = flatten(deux, partsOf(deux)[1]);
  assert.deepEqual([f2.id, f2.ficheId, f2.ficheIndex, f2.ficheCount, f2.isbn], ['b1', 'c2', 1, 2, '123']);
  assert.deepEqual(f2.passages, ['chap 2']);
  assert.equal(readyFiches([deux]).length, 1);
  // Remplacer une fiche ne touche pas aux autres.
  const remplie = withPart(f2, { ...partsOf(deux)[1], fiche: { resume: ['R2'] } });
  assert.equal(remplie.fiche, undefined);
  assert.deepEqual(readyFiches([remplie]).map((x) => x.fiche.resume[0]), ['R', 'R2']);
  const sans = withoutPart(remplie, 'p-b1');
  assert.deepEqual(partsOf(sans).map((p) => p.id), ['c2']);
  assert.equal(sans.fiches.length, 2);
});

test('mergeBackup : fiches ajoutées au même livre sur les deux appareils', () => {
  const base = normalizeBook(book('L', { fiche: { resume: ['R'] } }));
  const pc = withPart(base, { id: 'pc', passages: ['chap 2'], createdAt: 10 });
  const tel = { ...withPart(base, { id: 'tel', passages: ['chap 3'], createdAt: 20 }), updatedAt: 99 };
  const r = mergeBackup({ books: [{ ...pc, updatedAt: 50 }], order: { value: ['L'], updatedAt: 1 } }, { books: [tel], order: { value: ['L'], updatedAt: 1 } });
  const L = r.books.find((b) => b.id === 'L');
  assert.deepEqual(partsOf(L).map((p) => p.id), ['p-L', 'pc', 'tel']);
  assert.equal(r.report.misesAJour, 1);
  // Fiche supprimée sur un appareil : la suppression plus récente l'emporte.
  const a = [{ id: 'x', passages: ['v1'], createdAt: 1, updatedAt: 1 }];
  const b = [{ id: 'x', deleted: true, createdAt: 1, updatedAt: 2 }];
  assert.equal(mergeParts(a, b)[0].deleted, true);
  assert.equal(mergeParts(b, a)[0].deleted, true);
});

test('chaque fiche d’un livre est un chapitre, numéroté dans l’ordre', () => {
  assert.deepEqual(chapterOf({ chapitre: 'Une dette à faire peur' }, 0, 2), { num: '1', titre: 'Une dette à faire peur', label: 'Chapitre 1' });
  assert.deepEqual(chapterOf({ chapitre: '' }, 1, 2), { num: '2', titre: '', label: 'Chapitre 2' });
  assert.deepEqual(chapterOf({ chapitre: 'Chapitre 2 : Le retour des marchés' }, 1, 2), { num: '2', titre: 'Le retour des marchés', label: 'Chapitre 2' });
  assert.deepEqual(chapterOf({ chapitre: 'CHAPITRE IV – La crise' }, 0, 1), { num: '4', titre: 'La crise', label: 'Chapitre 4' });
  // Une seule fiche sans titre de chapitre : elle résume tout le livre, pas de « Chapitre 1 ».
  assert.equal(chapterOf({ chapitre: '' }, 0, 1).label, '');
});
