# Mon livre de lectures

Appli personnelle qui transforme le texte que je lui donne (copié-collé, captures d'écran ou `My Clippings.txt` de la Kindle) en fiches de lecture, rassemblées dans un livre exportable en PDF pour l'impression, ou en fiches A4 recto-verso. Elle s'installe sur l'écran d'accueil du téléphone et fonctionne hors connexion.

## Comment ça marche

1. **Nouvelle fiche** : je colle le texte à résumer, ou je coche « captures d'écran » (je les joindrai dans Claude), ou j'importe `My Clippings.txt` depuis la liseuse (branchée en USB, dossier `documents`) et je choisis un livre.
2. **Copier la demande et ouvrir Claude** : je colle la demande dans Claude (gratuit), j'envoie.
3. Je copie la réponse de Claude, je la colle dans l'appli, puis **Ajouter à mon livre**.

Un livre = une fiche. Si j'ajoute du texte à un livre qui existe déjà, il s'ajoute à l'ancien et je refais le résumé.

## Mes données

Les fiches restent **uniquement dans le navigateur de chaque appareil** : rien n'est envoyé en ligne, et ce dépôt ne contient aucune fiche.

Pour passer d'un appareil à l'autre : **Sauvegarde → Créer le fichier de sauvegarde** sur le premier, je branche le téléphone à l'ordinateur par câble USB, puis **Sauvegarde → Lire le fichier de l'autre appareil** sur le second. Le mot de passe des sauvegardes n'est demandé qu'une fois par appareil. Les deux versions sont fusionnées, rien n'est écrasé.

⚠️ « Effacer les données de navigation » supprime les fiches : je fais des sauvegardes régulières.

## Sécurité

- **Sauvegardes chiffrées** : le fichier est protégé par un mot de passe (AES-GCM 256 bits, clé dérivée par PBKDF2-SHA-256, 600 000 itérations). Sans le mot de passe, il est illisible et ne peut pas être récupéré.
- **Barrière anti-fuite** (Content Security Policy) : la version publiée ne peut charger du code que depuis sa propre adresse et ne peut envoyer de données à aucun autre site.
- Aucun secret dans le code (ni clé API, ni mot de passe). Les textes collés sont toujours affichés comme du texte, jamais exécutés.
- Le compte GitHub qui publie l'appli doit avoir la **double authentification** activée : c'est lui qui contrôle les mises à jour.

## Pour la personne qui maintient le code

```
npm install
npm run dev      # aperçu local
npm test         # tests (import Kindle, lecture de la réponse, fusion des sauvegardes)
npm run build    # version à publier, dans dist/
```

Chaque envoi sur la branche `main` publie automatiquement l'appli sur GitHub Pages (`.github/workflows/deploy.yml`).

Technique : Vite, JavaScript sans framework, IndexedDB (`idb`), SortableJS, pdfmake (PDF créé dans le navigateur), polices Literata et Inter (fichiers locaux), vite-plugin-pwa.
