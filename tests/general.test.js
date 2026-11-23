import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneralPrompt, clampPages, parseGeneral } from '../src/general.js';
import { newPart, withPart } from '../src/fiches.js';

const fiche = (chapitre, resume) => ({ chapitre, genre: 'Essai', resume: [resume], idees_cles: [{ titre: 'Idée', texte: 'x' }], personnages: [], citations: [] });

test('résumé général : la demande contient toutes les fiches terminées, dans l’ordre, et la longueur', () => {
  let b = withPart({ id: 'L', title: 'La dette', author: 'A. Auteur' }, newPart({ fiche: fiche('Chapitre 1. Début', 'Résumé un.') }));
  b = withPart(b, newPart({ fiche: null }));
  b = withPart(b, newPart({ fiche: fiche('Chapitre 3. Fin', 'Résumé trois.') }));
  const p = buildGeneralPrompt(b, 3);
  assert.match(p, /3 pages A4/);
  assert.match(p, /environ 1130 mots/);
  assert.match(p, /MES FICHES \(2 chapitres\)/);
  assert.ok(p.indexOf('Résumé un.') < p.indexOf('Résumé trois.'));
  assert.match(p, /=== Chapitre 1 : Début ===/);
  assert.match(p, /### Premier intertitre/);
  assert.doesNotMatch(buildGeneralPrompt(b, 1), /###/);
  assert.equal(clampPages('0'), 1);
  assert.equal(clampPages(50), 20);
});

test('résumé général : lecture d’une réponse avec intertitres, texte autour et idées clés', () => {
  const r = parseGeneral(`Voici le résumé général demandé :

## **RÉSUMÉ GÉNÉRAL**
### 1. Les origines
Premier paragraphe
sur deux lignes.

Deuxième *paragraphe*.

**Le tournant**
Troisième paragraphe.

## IDÉES CLÉS
- **La dette** : un outil.
- **L'impôt** — instrument
  de cohésion.
3. Sans titre gras : explication.

Souhaitez-vous autre chose ?`);
  assert.ok(r.ok);
  assert.deepEqual(r.sections.map((s) => s.titre), ['1. Les origines', 'Le tournant']);
  assert.deepEqual(r.sections[0].paragraphes, ['Premier paragraphe sur deux lignes.', 'Deuxième paragraphe.']);
  assert.deepEqual(r.idees, [
    { titre: 'La dette', texte: 'un outil.' },
    { titre: "L'impôt", texte: 'instrument de cohésion.' },
    { titre: 'Sans titre gras', texte: 'explication.' },
  ]);
  assert.ok(r.mots > 10);
});

test('résumé général : sans titres, tout le texte est le résumé ; vide = erreur', () => {
  const r = parseGeneral('Un paragraphe.\n\nUn autre.');
  assert.ok(r.ok);
  assert.deepEqual(r.sections, [{ titre: '', paragraphes: ['Un paragraphe.', 'Un autre.'] }]);
  assert.equal(parseGeneral('   ').ok, false);
});
