import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

// Numéro de version de l'appli Android (.apk) : voir public/version-apk.json et scripts/publier-apk.mjs.
const APK = JSON.parse(readFileSync(new URL('./public/version-apk.json', import.meta.url), 'utf8'));
// Adresse où l'appli Android vérifie s'il existe une version plus récente (le site publié sur GitHub Pages).
const SITE = 'https://abophane-cyber.github.io';

// Barrière anti-fuite (Content Security Policy) : l'appli ne peut charger du code et des
// fichiers que depuis sa propre adresse, et ne peut envoyer de données à aucun autre site,
// sauf aux trois bases de livres ouvertes (BnF, Open Library, Google Books) du bouton « Remplir automatiquement » (qui ne reçoivent
// que l'ISBN, ou le titre et l'auteur), et aux images de couvertures d'Amazon et d'Open Library (rangées chez
// archive.org), qui ne reçoivent que l'ISBN.
// Ajoutée seulement à la version publiée (l'aperçu de développement a besoin d'une connexion en direct).
const csp = (native) => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${native ? ` ${SITE}` : ''} https://catalogue.bnf.fr https://openlibrary.org https://www.googleapis.com https://covers.openlibrary.org https://archive.org https://*.archive.org https://m.media-amazon.com`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// Version installée (mode native) : elle peut en plus lire version-apk.json sur le site, pour
// savoir s'il existe une appli Android plus récente (rien n'est envoyé, c'est une simple lecture).
const securityHeaders = (native) => ({
  name: 'barriere-anti-fuite',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(
        '<meta charset="utf-8">',
        `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${csp(native)}">\n    <meta name="referrer" content="no-referrer">`,
      );
    },
  },
});

// « npm run build:app » (mode native) : version pour le logiciel Windows et l'appli Android, dans dist-native/.
export default defineConfig(({ mode }) => ({
  // Chemins relatifs : l'appli marche quelle que soit l'adresse de publication (GitHub Pages).
  base: './',
  // assetsInlineLimit: 0 → les polices restent des fichiers (la barrière anti-fuite refuse les polices « data: »).
  build: { chunkSizeWarningLimit: 3000, assetsInlineLimit: 0, outDir: mode === 'native' ? 'dist-native' : 'dist' },
  define: { __APK_VERSION__: JSON.stringify(APK.versionCode), __APK_VERSION_NAME__: JSON.stringify(APK.versionName) },
  plugins: [
    securityHeaders(mode === 'native'),
    VitePWA({
      disable: mode === 'native',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Mon livre de lectures',
        short_name: 'Lectures',
        description: 'Mes fiches de lecture, à partir de mes surlignements Kindle.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f3ea',
        theme_color: '#f7f3ea',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Pas besoin des alphabets grec, cyrillique, vietnamien hors connexion.
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*', '**/inter-*.woff', '**/literata-latin-ext-*.woff'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
}));
