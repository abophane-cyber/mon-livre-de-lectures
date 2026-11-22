// Chiffrement des fichiers de sauvegarde avec un mot de passe (Web Crypto, intégré au navigateur).
// AES-GCM 256 bits ; clé dérivée du mot de passe par PBKDF2-SHA-256.
// Sans le mot de passe, le fichier est illisible : il n'existe aucun moyen de le récupérer.

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncrypted(data) {
  return !!data && data.encrypted === true && typeof data.data === 'string';
}

/** Chiffre un objet. `header` (non secret) est recopié tel quel et protégé contre la modification. */
export async function encryptJson(value, password, header = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const envelope = {
    ...header,
    encrypted: true,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
  };
  const aad = enc.encode(JSON.stringify(envelope));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, enc.encode(JSON.stringify(value)));
  return { ...envelope, data: toB64(ct) };
}

/** Déchiffre ; lance une erreur claire si le mot de passe est faux ou le fichier abîmé. */
export async function decryptJson(envelope, password) {
  const { data, ...rest } = envelope;
  const iterations = rest.kdf?.iterations;
  if (rest.kdf?.name !== 'PBKDF2' || rest.cipher?.name !== 'AES-GCM' || !(iterations >= 100_000 && iterations <= 10_000_000)) {
    throw new Error('Format de sauvegarde chiffrée inconnu.');
  }
  const key = await deriveKey(password, fromB64(rest.kdf.salt), iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(rest.cipher.iv), additionalData: enc.encode(JSON.stringify(rest)) },
      key,
      fromB64(data),
    );
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Mot de passe incorrect (ou fichier abîmé).');
  }
}
