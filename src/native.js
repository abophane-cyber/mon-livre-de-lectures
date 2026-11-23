// Versions installées de l'appli (logiciel Windows .exe, appli Android .apk).
// Dans le navigateur, rien ne change : ces fonctions ne servent que dans les versions installées.

import { Capacitor } from '@capacitor/core';

/** Appli Android installée par l'.apk (Capacitor). */
export const isAndroidApp = Capacitor.getPlatform() === 'android';
/** Logiciel Windows installé par le .exe (Electron). */
export const isDesktopApp = /\bElectron\//.test(navigator.userAgent);
/** L'une ou l'autre des versions installées. */
export const isNativeApp = isAndroidApp || isDesktopApp;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function withSuffix(filename, n) {
  if (!n) return filename;
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? `${filename.slice(0, dot)} (${n})${filename.slice(dot)}` : `${filename} (${n})`;
}

/**
 * Android : enregistre le fichier dans le dossier « Download » du téléphone (comme le ferait Chrome).
 * Si un fichier du même nom existe déjà et ne peut pas être remplacé, ajoute « (1) », « (2) »…
 * Renvoie le nom finalement utilisé.
 */
export async function androidSaveToDownloads(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    // Utile seulement pour Android 10 et avant ; ensuite, aucune autorisation n'est demandée.
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* ignore */
  }
  const data = await blobToBase64(blob);
  let lastError;
  for (let n = 0; n < 20; n++) {
    const name = withSuffix(filename, n);
    try {
      await Filesystem.writeFile({ path: `Download/${name}`, data, directory: Directory.ExternalStorage, recursive: true });
      return name;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Android : ouvre le menu « Partager » (Quick Share, Drive, e-mail…) avec ce fichier. */
export async function androidShare(blob, filename, title) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: `partage/${filename}`, data, directory: Directory.Cache, recursive: true });
  await Share.share({ title, files: [uri], dialogTitle: title });
}

export async function androidCopy(text) {
  const { Clipboard } = await import('@capacitor/clipboard');
  await Clipboard.write({ string: text });
}

export async function androidPaste() {
  const { Clipboard } = await import('@capacitor/clipboard');
  const { value } = await Clipboard.read();
  return value || '';
}

/** Android : ouvre l'adresse dans l'appli correspondante (ChatGPT, Claude…) ou dans le navigateur. */
export async function androidOpenUrl(url) {
  const { AppLauncher } = await import('@capacitor/app-launcher');
  await AppLauncher.openUrl({ url });
}
