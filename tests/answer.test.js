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
    { texte: 'La richesse est une construction collective.', commentaire: '' },
    { texte: "Rien n'est inévitable.", commentaire: '' },
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
    { texte: 'Il faut se défier des rêves.', commentaire: '' },
    { texte: 'Ils trompent.', commentaire: '' },
  ]);
});

test('rubrique manquante : la fiche est acceptée avec un avertissement', () => {
  const r = parseAnswer(AFFICHE.replace(/POUR QUI \?[\s\S]*$/, ''));
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, ['POUR QUI ?']);
  assert.match(r.warnings[0], /POUR QUI/);
  assert.equal(parseAnswer('').ok, false);
});

// 3. Fiche « à la Claude » : ses propres titres, emoji, numéros, gras avec deux-points (cas réel de l'utilisateur).
const LIBRE = `# Fiche de lecture : *Riches ensemble !* d'Anne-Laure Delatte

*Un essai qui raconte comment l'État s'est mis à dépendre des marchés.*

## 📖 1. Résumé du livre

### Le contexte
Dans les années 1980, avec le retour du libéralisme, l'État français cesse de se financer surtout par des circuits administrés.

- **Maastricht et l'euro (années 1990) :** le traité fixe un plafond de dette (60 % du PIB).

## 💡 Les idées principales

1. **La dette n'est pas un fardeau :** c'est un choix politique.
2. **Les marchés gouvernent :** les États dépendent des investisseurs.

## Concepts clés
- **Dette publique** — ce que l'État doit.

## ✍️ Citations marquantes
- « L'État s'est mis entre les mains des marchés. » : une phrase qui résume la thèse.

## 🎯 Ce qu'il faut retenir
La dépendance aux marchés n'est pas une fatalité.

## 👥 À qui s'adresse ce livre ?
À tous les citoyens curieux d'économie.

## 📚 Références bibliographiques
- Piketty, T., *Le Capital au XXIe siècle*, Seuil, 2013.
- Lemoine, B., *L'Ordre de la dette*, La Découverte, 2016.

## Notice
- Éditeur : Fayard
- ISBN : non visible`;

test('titres libres de Claude (emoji, numéros, variantes)', () => {
  const r = parseAnswer(LIBRE);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const f = r.fiche;
  assert.equal(f.accroche, "Un essai qui raconte comment l'État s'est mis à dépendre des marchés.");
  assert.equal(f.resume.length, 3);
  assert.match(f.resume[1], /^Dans les années 1980/);
  assert.match(f.resume[2], /^Maastricht et l'euro/);
  assert.deepEqual(f.idees_cles.map((i) => i.titre), ["La dette n'est pas un fardeau", 'Les marchés gouvernent']);
  assert.equal(f.personnages_titre, 'Notions clés');
  assert.deepEqual(f.personnages, [{ nom: 'Dette publique', role: "ce que l'État doit." }]);
  assert.deepEqual(f.citations, [{ texte: "L'État s'est mis entre les mains des marchés.", commentaire: '' }]);
  assert.equal(f.a_retenir, "La dépendance aux marchés n'est pas une fatalité.");
  assert.equal(f.pour_qui, "À tous les citoyens curieux d'économie.");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.bibliographie, ['Piketty, T., Le Capital au XXIe siècle, Seuil, 2013.', "Lemoine, B., L'Ordre de la dette, La Découverte, 2016."]);
  assert.deepEqual(r.notice, { editeur: 'Fayard' });
});

test('les avis et commentaires de l’IA sont ignorés', () => {
  const r = parseAnswer(`## Résumé
Le livre retrace l'histoire de la dette française depuis 1980.

## Points forts et points faibles
Un livre passionnant mais parfois répétitif.

## Citations
> « Rien n'est inévitable. »
Commentaire : une phrase magnifique.

## Mon avis
J'ai adoré ce livre !

## À retenir
La dette est un choix politique.

## Bibliographie
- Piketty, Le Capital, 2013.

Souhaitez-vous que je développe une partie ?`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.fiche.resume, ["Le livre retrace l'histoire de la dette française depuis 1980."]);
  assert.deepEqual(r.fiche.citations, [{ texte: "Rien n'est inévitable.", commentaire: '' }]);
  assert.equal(r.fiche.a_retenir, 'La dette est un choix politique.');
  assert.deepEqual(r.bibliographie, ['Piketty, Le Capital, 2013.']);
  assert.ok(!JSON.stringify(r.fiche).includes('adoré'));
  assert.ok(!JSON.stringify(r.fiche).includes('passionnant'));
});

test('la demande interdit les avis', () => {
  const p = buildPrompt({ title: 'T', passages: ['x'] });
  assert.match(p, /Ne donne JAMAIS ton avis/);
  assert.doesNotMatch(p, /Commentaire :/);
});

test('aucun titre reconnu : tout le texte devient le résumé', () => {
  const r = parseAnswer(`Voici ma fiche :

## Introduction
Ce livre retrace l'histoire de la dette française.

## Développement
Il montre le rôle croissant des marchés.`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.fiche.resume, ['Introduction', "Ce livre retrace l'histoire de la dette française.", 'Développement', 'Il montre le rôle croissant des marchés.']);
  assert.match(r.warnings[0], /tout le texte de la réponse a été mis dans le résumé/);
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
