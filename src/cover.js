// Couverture du livre : trouvée par l'ISBN dans Open Library (seul l'ISBN est envoyé),
// ou choisie par l'utilisateur (photo, image enregistrée). Elle est réduite puis gardée
// dans le livre (image JPEG), pour marcher hors connexion et dans les sauvegardes.

const MAX_H = 1000;
const MAX_W = 700;

/** Réduit une image (Blob) et la renvoie en JPEG : { cover, coverRatio } (ratio = hauteur / largeur). */
export async function blobToCover(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    if (bmp.width < 40 || bmp.height < 40) throw new Error('Image trop petite');
    const k = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // fond blanc pour les images transparentes (PNG)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return { cover: canvas.toDataURL('image/jpeg', 0.85), coverRatio: Math.round((h / w) * 1000) / 1000 };
  } finally {
    bmp.close?.();
  }
}

/** Cherche la couverture d'après l'ISBN (13 chiffres). Renvoie { cover, coverRatio } ou null. */
export async function fetchCover(isbn) {
  const id = String(isbn || '').replace(/[^0-9X]/gi, '');
  if (!/^(\d{9}[\dX]|\d{13})$/i.test(id)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://covers.openlibrary.org/b/isbn/${id}-L.jpg?default=false`, {
      signal: ctrl.signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') || blob.size < 1500) return null; // image vide ou « pas de couverture »
    return await blobToCover(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
