// Couverture du livre : trouvée par l'ISBN dans les images d'Amazon (très complètes pour les livres
// français), sinon dans Open Library (seul l'ISBN est envoyé),
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

/** ISBN-13 (978…) → ISBN-10, utilisé par les images d'Amazon. */
export function isbn10(isbn) {
  const id = String(isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(id)) return id;
  if (!/^978\d{10}$/.test(id)) return '';
  const body = id.slice(3, 12);
  const sum = [...body].reduce((n, d, i) => n + (10 - i) * Number(d), 0);
  const c = (11 - (sum % 11)) % 11;
  return body + (c === 10 ? 'X' : String(c));
}

/** Télécharge une image ; null si absente (Amazon renvoie une petite image vide quand il n'a rien). */
async function tryImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size < 1500) return null;
    return await blobToCover(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cherche la couverture d'après l'ISBN. Renvoie { cover, coverRatio } ou null. */
export async function fetchCover(isbn) {
  const id = String(isbn || '').replace(/[^0-9X]/gi, '');
  if (!/^(\d{9}[\dX]|\d{13})$/i.test(id)) return null;
  const i10 = isbn10(id);
  return (i10 && (await tryImage(`https://m.media-amazon.com/images/P/${i10}.01.LZZZZZZZ.jpg`))) ||
    (await tryImage(`https://covers.openlibrary.org/b/isbn/${id}-L.jpg?default=false`));
}
