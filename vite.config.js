import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Barrière anti-fuite (Content Security Policy) : l'appli ne peut charger du code et des
// fichiers que depuis sa propre adresse, et ne peut envoyer de données à aucun autre site.
// Ajoutée seulement à la version publiée (l'aperçu de développement a besoin d'une connexion en direct).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityHeaders = {
  name: 'barriere-anti-fuite',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(
        '<meta charset="utf-8">',
        `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="referrer" content="no-referrer">`,
      );
    },
  },
};

export default defineConfig({
  // Chemins relatifs : l'appli marche quelle que soit l'adresse de publication (GitHub Pages).
  base: './',
  // assetsInlineLimit: 0 → les polices restent des fichiers (la barrière anti-fuite refuse les polices « data: »).
  build: { chunkSizeWarningLimit: 3000, assetsInlineLimit: 0 },
  plugins: [
    securityHeaders,
    VitePWA({
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
});
