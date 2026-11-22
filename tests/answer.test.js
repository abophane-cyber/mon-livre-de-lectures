import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, buildPrompt, buildNoticePrompt } from '../src/prompt.js';

// 1. Réponse copiée avec le bouton « Copier » de Claude (titres « ## », gras, citation « > »), avec du texte autour.
const MARKDOWN = `Voici la fiche de lecture demandée :

GENRE : Essai économique
ACCROCHE : Un plaidoyer pour une richesse partagée.

## RÉSUMÉ
Anne-Laure Delatte part d'un constat :
les inégalités se creusent.

Elle propose ensuite des pistes concrètes.

## IDÉES CLÉS
- **La dette publique** : un outil, pas un fardeau.
- **L'impôt** — instrument de cohésion
  qui finance les services publics.

## NOTIONS CLÉS
- **Bien commun** : ce qui appartient à tous.

## CITATIONS
> « La richesse est une construction collective. »
Commentaire : idée centrale du livre.

> « Rien n'est inévitable. »

Commentaire : une phrase d'espoir.

## À RETENIR
Un essai accessible.

## POUR QUI ?
Pour qui s'intéresse à l'économie.

J'espère que cette fiche vous sera utile !`;

test('réponse en texte à titres (bouton Copier)', () => {
  const r = parseAnswer(MARKDOWN);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const f = r.fiche;
  assert.equal(f.genre, 'Essai économique');
  assert.equal(f.accroche, 'Un plaidoyer pour une richesse partagée.');
  assert.deepEqual(f.resume, ["Anne-Laure Delatte part d'un constat : les inégalités se creusent.", 'Elle propose ensuite des pistes concrètes.']);
  assert.deepEqual(f.idees_cles, [
    { titre: 'La dette publique', texte: 'un outil, pas un fardeau.' },
    { titre: "L'impôt", texte: 'instrument de cohésion qui finance les services publics.' },
  ]);
  assert.equal(f.personnages_titre, 'Notions clés');
  assert.deepEqual(f.personnages, [{ nom: 'Bien commun', role: 'ce qui appartient à tous.' }]);
  assert.deepEqual(f.citations, [
    { texte: 'La richesse est une construction collective.', commentaire: 'idée centrale du livre.' },
    { texte: "Rien n'est inévitable.", commentaire: "une phrase d'espoir." },
  ]);
  assert.equal(f.a_retenir, 'Un essai accessible.');
  assert.equal(f.pour_qui, "Pour qui s'intéresse à l'économie.");
});

// 2. Même réponse copiée en sélectionnant le texte affiché : plus de « # », plus de puces ni de « > ».
const AFFICHE = `GENRE : Roman
ACCROCHE : Une femme qui confond la vie et les romans.

RÉSUMÉ
Emma épouse Charles.

Elle s'ennuie.

IDÉES CLÉS
Le bovarysme : se rêver autre.
La province : un lieu d'ennui.

PERSONNAGES
Emma Bovary : héroïne rêveuse.
Charles Bovary : son mari.

CITATIONS
« Il faut se défier des rêves. »
Commentaire : avertissement.
« Ils trompent. » — Une mise en garde.

À RETENIR
Un chef-d'œuvre.

POUR QUI ?
Pour les amateurs de classiques.`;

test('réponse copiée depuis l’affichage (sans # ni puces)', () => {
  const r = parseAnswer(AFFICHE);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.fiche.resume, ['Emma épouse Charles.', "Elle s'ennuie."]);
  assert.equal(r.fiche.idees_cles.length, 2);
  assert.equal(r.fiche.idees_cles[1].titre, 'La province');
  assert.equal(r.fiche.personnages_titre, 'Personnages');
  assert.equal(r.fiche.personnages.length, 2);
  assert.deepEqual(r.fiche.citations, [
    { texte: 'Il faut se défier des rêves.', commentaire: 'avertissement.' },
    { texte: 'Ils trompent.', commentaire: 'Une mise en garde.' },
  ]);
});

test('rubrique manquante : message clair', () => {
  const r = parseAnswer(AFFICHE.replace(/POUR QUI \?[\s\S]*$/, ''));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('POUR QUI')));
  assert.equal(parseAnswer('Bonjour, je ne peux pas lire les images.').ok, false);
});

test('réponse « notice et bibliographie » en texte', () => {
  const r = parseAnswer(`## NOTICE
- Éditeur : Seuil
- Collection :
- Édition : 2026
- Traduction : non visible
- ISBN : 978-2-02-123456-7
- Nombre de pages : 288
- Date de parution : 2026

## BIBLIOGRAPHIE
- Piketty, T., Le Capital au XXIe siècle, Seuil, 2013.
- Graeber, D., Dette : 5000 ans d'histoire, LLL, 2013.`);
  assert.equal(r.ok, true);
  assert.equal(r.partial, true);
  assert.deepEqual(r.notice, { editeur: 'Seuil', edition: '2026', isbn: '978-2-02-123456-7', pages: '288', pubDate: '2026' });
  assert.equal(r.bibliographie.length, 2);
  assert.match(r.bibliographie[1], /^Graeber/);
});

test('la demande réclame le texte à titres, pas de JSON', () => {
  const p = buildPrompt({ title: 'T', author: 'A', passages: ['Mon texte.'] });
  assert.match(p, /## RÉSUMÉ/);
  assert.match(p, /pas de JSON/);
  assert.doesNotMatch(p, /```json/);
  assert.match(buildPrompt({ title: 'T', captures: true }), /## NOTICE/);
  assert.match(buildNoticePrompt({ title: 'T' }), /## BIBLIOGRAPHIE/);
});
