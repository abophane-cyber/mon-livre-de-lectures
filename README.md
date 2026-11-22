# Mon livre de lectures

Appli personnelle qui transforme mes surlignements Kindle en fiches de lecture, rassemblées dans un livre exportable en PDF pour l'impression. Elle s'installe sur l'écran d'accueil du téléphone et fonctionne hors connexion.

## Comment ça marche

1. **Nouvelle fiche** : je colle mes passages, ou j'importe `My Clippings.txt` depuis la liseuse (branchée en USB, dossier `documents`) et je choisis un livre.
2. **Copier la demande et ouvrir Claude** : je colle la demande dans Claude (gratuit), j'envoie.
3. Je copie la réponse de Claude, je la colle dans l'appli, puis **Ajouter à mon livre**.

Un livre = une fiche. Si j'ajoute des passages à un livre qui existe déjà, ils s'ajoutent aux anciens et je refais le résumé.

## Mes données

Les fiches restent **uniquement dans le navigateur de chaque appareil** : rien n'est envoyé en ligne, et ce dépôt ne contient aucune fiche.

Pour passer de l'ordinateur au téléphone : **Sauvegarde → Exporter**, je copie le fichier par câble USB, puis **Sauvegarde → Importer** sur l'autre appareil. Les deux versions sont fusionnées, rien n'est écrasé.

⚠️ « Effacer les données de navigation » supprime les fiches : je fais des sauvegardes régulières.

## Pour la personne qui maintient le code

```
npm install
npm run dev      # aperçu local
npm test         # tests (import Kindle, lecture de la réponse, fusion des sauvegardes)
npm run build    # version à publier, dans dist/
```

Chaque envoi sur la branche `main` publie automatiquement l'appli sur GitHub Pages (`.github/workflows/deploy.yml`).

Technique : Vite, JavaScript sans framework, IndexedDB (`idb`), SortableJS, pdfmake (PDF créé dans le navigateur), polices Literata et Inter (fichiers locaux), vite-plugin-pwa.
