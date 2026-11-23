// Téléchargement d'un fichier, y compris sur Android (Chrome et Samsung Internet),
// et dans les versions installées de l'appli (voir native.js).

import { androidCopy, androidOpenUrl, androidPaste, androidSaveToDownloads, androidShare, isAndroidApp } from './native.js';

/** Enregistre le fichier dans le dossier Téléchargements. Renvoie le nom du fichier enregistré. */
export async function downloadBlob(blob, filename) {
  if (isAndroidApp) return androidSaveToDownloads(blob, filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisser le temps au téléchargement de démarrer avant de libérer le fichier.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return filename;
}

/** Partage (Android : Quick Share, Drive, e-mail…) si le navigateur le permet. */
export async function shareBlob(blob, filename, title) {
  if (isAndroidApp) {
    try {
      await androidShare(blob, filename, title);
      return true;
    } catch (e) {
      // L'utilisateur a fermé le menu de partage : ce n'est pas une erreur.
      return /cancel/i.test(String(e?.message || e));
    }
  }
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return true;
    return false;
  }
}

export function canShareFiles() {
  if (isAndroidApp) return true;
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}h${p(date.getMinutes())}`;
}

/** Copie un texte dans le presse-papiers, avec une solution de secours. */
export async function copyText(text) {
  if (isAndroidApp) {
    try {
      await androidCopy(text);
      return true;
    } catch {
      /* solution de secours ci-dessous */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Le bouton « Coller » peut-il lire le presse-papiers ? */
export function canPaste() {
  return isAndroidApp || !!navigator.clipboard?.readText;
}

/** Lit le texte du presse-papiers (lève une erreur si c'est refusé). */
export async function pasteText() {
  if (isAndroidApp) return androidPaste();
  return navigator.clipboard.readText();
}

/** Ouvre le site de l'IA (dans l'appli : dans le navigateur ou l'appli de l'IA). */
export function openExternal(url) {
  if (isAndroidApp) {
    androidOpenUrl(url).catch(() => window.open(url, '_blank', 'noopener'));
    return;
  }
  // Logiciel Windows : la fenêtre est ouverte dans le navigateur habituel (voir electron/main.cjs).
  window.open(url, '_blank', 'noopener');
}
