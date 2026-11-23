// Sauvegarde automatique (versions installées seulement : logiciel Windows et appli Android).
// Dès que les fiches changent, un fichier de sauvegarde chiffré (même mot de passe que les
// sauvegardes manuelles) est écrit sans rien demander :
//  - Windows : Téléchargements\Mon livre de lectures - sauvegardes
//  - Android : Download/Mon livre de lectures - sauvegardes
// Les 10 fichiers les plus récents sont gardés. Il faut qu'un mot de passe ait déjà été choisi
// (première sauvegarde manuelle) : sans lui, rien n'est écrit.
import { dumpAll } from './db.js';
import { isAndroidApp, isDesktopApp } from './native.js';
import { getPrefs, setPrefs } from './ui.js';
import { backupFileName, encryptedBackupBlob } from './views/sauvegarde.js';

export const AUTO_PREFIX = 'Sauvegarde automatique_';
export const AUTO_FOLDER = 'Mon livre de lectures - sauvegardes';
const KEEP = 10;

export const autoBackupSupported = () => (isDesktopApp && !!window.lecturesPC) || isAndroidApp;

/** Empreinte des données : on n'écrit un fichier que si quelque chose a changé. */
async function signature(dump) {
  const bytes = new TextEncoder().encode(JSON.stringify(dump) + '|' + (getPrefs().backupPw || ''));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function androidWrite(name, blob) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const dir = `Download/${AUTO_FOLDER}`;
  await Filesystem.writeFile({ path: `${dir}/${name}`, data, directory: Directory.ExternalStorage, recursive: true });
  // Ne garder que les plus récents (seulement les fichiers créés par l'appli).
  try {
    const { files } = await Filesystem.readdir({ path: dir, directory: Directory.ExternalStorage });
    const old = files
      .filter((f) => f.name.startsWith(AUTO_PREFIX) && f.name.endsWith('.json'))
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0) || b.name.localeCompare(a.name))
      .slice(KEEP);
    for (const f of old) await Filesystem.deleteFile({ path: `${dir}/${f.name}`, directory: Directory.ExternalStorage }).catch(() => {});
  } catch {
    /* le tri des anciens fichiers n'est pas indispensable */
  }
}

let running = null;

/** Écrit une sauvegarde si les fiches ont changé depuis la dernière. Ne lève jamais d'erreur. */
export function runAutoBackup() {
  if (!autoBackupSupported() || running) return running;
  running = (async () => {
    try {
      const prefs = getPrefs();
      if (!prefs.backupPw || prefs.autoBackup === false) return;
      const dump = await dumpAll();
      if (!dump.books.some((b) => !b.deleted)) return;
      const sig = await signature(dump);
      if (sig === prefs.autoSig) return;
      const blob = await encryptedBackupBlob(prefs.backupPw, dump);
      const name = backupFileName('Sauvegarde automatique');
      if (isDesktopApp) await window.lecturesPC.saveBackup(name, await blob.text());
      else await androidWrite(name, blob);
      setPrefs({ autoSig: sig, lastAuto: Date.now(), autoError: '' });
    } catch (e) {
      console.error('Sauvegarde automatique', e);
      setPrefs({ autoError: String(e?.message || e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer = null;
/** Lance une sauvegarde automatique quelques secondes après un changement de page. */
export function scheduleAutoBackup(delay = 3000) {
  if (!autoBackupSupported()) return;
  clearTimeout(timer);
  timer = setTimeout(runAutoBackup, delay);
}

/** Démarrage : une sauvegarde au lancement, puis après chaque page et quand l'appli passe en arrière-plan. */
export function startAutoBackup() {
  if (!autoBackupSupported()) return;
  scheduleAutoBackup(5000);
  window.addEventListener('hashchange', () => scheduleAutoBackup());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') runAutoBackup();
  });
  setInterval(runAutoBackup, 5 * 60 * 1000);
}
