// « npm run publier-apk » (ou « npm run publier-apk -- "Ce qui change" ») :
// publie une nouvelle version de l'appli Android, que les téléphones proposeront ensuite d'installer.
//  1. augmente le numéro de version dans public/version-apk.json ;
//  2. fabrique l'.apk (npm run apk) et la copie dans installateurs/ ;
//  3. la dépose sur GitHub (une « Release », téléchargeable par tous) ;
//  4. enregistre et envoie version-apk.json sur GitHub : une fois le site republié (1 à 2 min),
//     les appli installées affichent « Nouvelle version disponible ».
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FICHIER = 'public/version-apk.json';
const DEPOT = 'abophane-cyber/mon-livre-de-lectures';
const NOM_APK = 'Mon-livre-de-lectures.apk';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

const avant = readFileSync(FICHIER, 'utf8');
const ancienne = JSON.parse(avant);
const code = ancienne.versionCode + 1;
const [majeur, mineur = 0] = String(ancienne.versionName).split('.').map(Number);
const nouvelle = {
  versionCode: code,
  versionName: `${majeur}.${mineur + 1}`,
  notes: process.argv.slice(2).join(' ').trim(),
  url: `https://github.com/${DEPOT}/releases/download/apk-v${code}/${NOM_APK}`,
};
const tag = `apk-v${code}`;

writeFileSync(FICHIER, `${JSON.stringify(nouvelle, null, 2)}\n`);
console.log(`\n→ Version ${nouvelle.versionName} (n° ${code})\n`);

try {
  run('npm run apk');
  mkdirSync('installateurs', { recursive: true });
  copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'installateurs/Mon livre de lectures.apk');
  copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', `android/app/build/${NOM_APK}`);
  const notes = nouvelle.notes || `Version ${nouvelle.versionName} de l'appli Android.`;
  run(`gh release create ${tag} "android/app/build/${NOM_APK}" --repo ${DEPOT} --title "Appli Android ${nouvelle.versionName}" --notes ${JSON.stringify(notes)}`);
} catch (err) {
  writeFileSync(FICHIER, avant);
  console.error(`\n✗ Échec : rien n'a été annoncé aux téléphones (version remise à ${ancienne.versionName}).`);
  process.exit(1);
}

run(`git commit -m "Appli Android ${nouvelle.versionName} publiée" -- ${FICHIER}`);
run('git push');
console.log(`\n✓ Version ${nouvelle.versionName} publiée. Les téléphones la proposeront d'ici 1 à 2 minutes.`);
