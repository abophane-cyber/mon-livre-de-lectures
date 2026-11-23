// Remplissage automatique de la notice (éditeur, collection, pages…) à partir d'un ISBN,
// d'un lien vers une librairie en ligne (Amazon, Decitre…) ou du titre et de l'auteur.
// Sources gratuites et ouvertes : la BnF (la plus complète pour les livres français),
// Open Library et Google Books. Seuls l'ISBN, ou le titre et
// l'auteur, sont envoyés ; aucune fiche ni aucun texte du livre.

const digits = (s) => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();

export function isValidIsbn13(s) {
  const d = digits(s);
  if (!/^97[89]\d{10}$/.test(d)) return false;
  const sum = [...d].reduce((acc, c, i) => acc + Number(c) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

export function isValidIsbn10(s) {
  const d = digits(s);
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  const sum = [...d].reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

/** ISBN-10 → ISBN-13 (978…). */
export function isbn10to13(s) {
  const core = '978' + digits(s).slice(0, 9);
  const sum = [...core].reduce((acc, c, i) => acc + Number(c) * (i % 2 ? 3 : 1), 0);
  return core + ((10 - (sum % 10)) % 10);
}

/** ISBN-13 sans tirets, ou '' si le texte n'est pas un ISBN valable. */
export function normalizeIsbn(s) {
  if (isValidIsbn13(s)) return digits(s);
  if (isValidIsbn10(s)) return isbn10to13(s);
  return '';
}

/**
 * Trouve un ISBN dans ce que l'utilisateur a collé : un ISBN (10 ou 13 chiffres, avec ou sans
 * tirets) ou un lien (Amazon : …/dp/2070360024, Decitre, Cultura, Leslibraires…).
 * Renvoie { isbn } ou { error }.
 */
export function extractIsbn(input) {
  const text = decodeURIComponent(String(input || '').trim().replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
  if (!text) return { isbn: '' };
  // ISBN-13 : 978 ou 979 suivi de 10 chiffres, éventuellement séparés par des tirets ou espaces.
  for (const m of text.matchAll(/97[89](?:[-\s]?\d){10}/g)) {
    const n = normalizeIsbn(m[0]);
    if (n) return { isbn: n };
  }
  // ISBN-10 (Amazon le met après /dp/ ou /gp/product/).
  for (const m of text.matchAll(/(?:^|[^0-9A-Za-z])(\d(?:[-\s]?\d){8}[-\s]?[\dXx])(?![0-9A-Za-z])/g)) {
    const n = normalizeIsbn(m[1]);
    if (n) return { isbn: n };
  }
  if (/amazon\./i.test(text) && /\/(?:dp|gp\/product)\/B0/i.test(text)) {
    return { error: "Ce lien Amazon est celui d'un livre Kindle : il ne contient pas d'ISBN. Tapez plutôt l'ISBN du livre papier, ou videz la case pour chercher avec le titre et l'auteur." };
  }
  if (/^[a-z]+:\/\//i.test(text) || /^www\./i.test(text)) {
    return { error: "Ce lien ne contient pas d'ISBN. Essayez un lien Amazon (livre papier) ou Decitre, tapez l'ISBN, ou videz la case pour chercher avec le titre et l'auteur." };
  }
  return { error: "Ce n'est pas un ISBN valable (10 ou 13 chiffres). Vérifiez-le, ou videz la case pour chercher avec le titre et l'auteur." };
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const yearOf = (s) => (String(s || '').match(/\b(1[5-9]\d\d|20\d\d)\b/) || [])[0] || '';

/** Notice lue dans une édition Open Library (/books/…json). */
export function fromOpenLibrary(ed) {
  if (!ed || typeof ed !== 'object') return {};
  const out = {};
  const publisher = clean(ed.publishers?.[0]);
  if (publisher) out.editeur = publisher;
  const series = clean(ed.series?.[0]).replace(/^collection\s+/i, '').replace(/[\s;,.]+$/, '');
  if (series) out.collection = series;
  const year = yearOf(ed.publish_date);
  if (year) out.edition = `${series || publisher ? `${series || publisher}, ` : ''}${year}`;
  if (Number(ed.number_of_pages) > 0) out.pages = String(ed.number_of_pages);
  // Traduction : « traduit de l'anglais par … » dans la mention d'auteur, ou un contributeur traducteur.
  const by = clean(ed.by_statement);
  const t = by.match(/tradu\w*.*$/i);
  if (t) out.traduction = t[0].replace(/[\s;,.]+$/, '');
  else {
    const who = (ed.contributions || []).concat((ed.contributors || []).map((c) => `${c?.name} (${c?.role})`))
      .map(clean)
      .find((c) => /translat|tradu/i.test(c));
    if (who) out.traduction = `traduit par ${who.replace(/\s*\((?:translator|traduct\w*|trad\.?)\)\s*/i, '').trim()}`;
  }
  const isbn = normalizeIsbn(ed.isbn_13?.[0]) || normalizeIsbn(ed.isbn_10?.[0]);
  if (isbn) out.isbn = isbn;
  return out;
}

/** Notice lue dans un résultat Google Books (volumeInfo). */
export function fromGoogleBooks(info) {
  if (!info || typeof info !== 'object') return {};
  const out = {};
  const publisher = clean(info.publisher);
  if (publisher) out.editeur = publisher;
  const year = yearOf(info.publishedDate);
  if (year) out.edition = publisher ? `${publisher}, ${year}` : year;
  if (Number(info.pageCount) > 0) out.pages = String(info.pageCount);
  const ids = info.industryIdentifiers || [];
  const isbn = normalizeIsbn(ids.find((x) => x.type === 'ISBN_13')?.identifier) ||
    normalizeIsbn(ids.find((x) => x.type === 'ISBN_10')?.identifier);
  if (isbn) out.isbn = isbn;
  return out;
}

/** Fusionne plusieurs notices : la première source qui a une information l'emporte. */
export function mergeNotices(...list) {
  const out = {};
  for (const n of list) for (const [k, v] of Object.entries(n || {})) if (v && !out[k]) out[k] = v;
  // « Édition » : préférer la collection à l'éditeur quand on la connaît (« Folio, 1984 »).
  if (out.collection && out.edition && !out.edition.startsWith(out.collection)) {
    const year = yearOf(out.edition);
    if (year) out.edition = `${out.collection}, ${year}`;
  }
  return out;
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENT[e] ?? m);

/** Notices Dublin Core d'une réponse SRU de la BnF : [{ title: [...], publisher: [...], … }]. */
export function parseBnf(xml) {
  return String(xml || '')
    .split(/<srw:record>/)
    .slice(1)
    .map((rec) => {
      const out = {};
      for (const m of rec.matchAll(/<dc:(\w+)>([^<]*)<\/dc:\1>/g)) (out[m[1]] ||= []).push(clean(unxml(m[2])));
      return out;
    });
}

/** Notice lue dans une notice BnF (Dublin Core). */
export function fromBnf(rec) {
  if (!rec) return {};
  const out = {};
  const publisher = clean((rec.publisher?.[0] || '').replace(/\s*\([^)]*\)\s*$/, ''));
  if (publisher) out.editeur = publisher;
  const coll = (rec.description || []).map((d) => d.match(/^Collection\s*:\s*(.+)$/i)?.[1]).find(Boolean);
  if (coll) out.collection = clean(coll.replace(/^collection\s+/i, ''));
  const year = yearOf(rec.date?.[0]);
  if (year) out.edition = `${out.collection || publisher ? `${out.collection || publisher}, ` : ''}${year}`;
  const pages = (rec.format?.[0] || '').match(/(\d+)\s*p\b/);
  if (pages) out.pages = pages[1];
  const t = (rec.title?.[0] || '').match(/tradu[^;/]*/i);
  if (t) out.traduction = clean(t[0]).replace(/[\s,.]+$/, '');
  else {
    const who = (rec.contributor || []).find((c) => /traduct/i.test(c));
    const name = who?.match(/^([^,(]+),\s*([^(.]+)/);
    if (name) out.traduction = `traduit par ${clean(name[2])} ${clean(name[1])}`;
  }
  const isbn = (rec.identifier || []).map((i) => normalizeIsbn(i.match(/^ISBN\s+(.+)$/i)?.[1])).find(Boolean);
  if (isbn) out.isbn = isbn;
  return out;
}

async function defaultFetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!res.ok) return null;
    // La BnF répond en XML : renvoyé tel quel (texte).
    return url.startsWith(BNF) ? await res.text() : await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const OL = 'https://openlibrary.org';
const GB = 'https://www.googleapis.com/books/v1/volumes';
const BNF = 'https://catalogue.bnf.fr/api/SRU';
const bnfUrl = (cql, max) =>
  `${BNF}?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=${max}&query=${encodeURIComponent(cql)}`;
const cqlText = (s) => s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();

async function byIsbn(isbn, fetchJson) {
  const [bnf, ol, gb] = await Promise.all([
    fetchJson(bnfUrl(`bib.isbn adj "${isbn}"`, 5)),
    fetchJson(`${OL}/isbn/${isbn}.json`),
    fetchJson(`${GB}?q=isbn:${isbn}&maxResults=1`),
  ]);
  // La BnF a souvent deux notices pour un même livre (annonce et notice définitive) : on les combine.
  return mergeNotices(...parseBnf(bnf).map(fromBnf), fromOpenLibrary(ol), fromGoogleBooks(gb?.items?.[0]?.volumeInfo), { isbn });
}

async function byTitle(title, author, fetchJson) {
  const q = (s) => encodeURIComponent(s.replace(/["()]/g, ' ').trim());
  // Google Books : éditions en français d'abord.
  const gbQuery = `intitle:${q(title)}${author ? `+inauthor:${q(author)}` : ''}`;
  const bnfQuery = `bib.title all "${cqlText(title)}"${author ? ` and bib.author all "${cqlText(author)}"` : ''} and bib.doctype any "a"`;
  const [gb, bnf] = await Promise.all([
    fetchJson(`${GB}?q=${gbQuery}&langRestrict=fr&maxResults=10&printType=books`),
    fetchJson(bnfUrl(bnfQuery, 30)),
  ]);
  const items = (gb?.items || []).map((x) => x.volumeInfo || {});
  // Une édition avec ISBN et éditeur, de préférence.
  const best = items.find((i) => fromGoogleBooks(i).isbn && i.publisher) || items.find((i) => fromGoogleBooks(i).isbn) || items[0];
  const fromGb = fromGoogleBooks(best);
  if (fromGb.isbn) return mergeNotices(await byIsbn(fromGb.isbn, fetchJson), fromGb);
  // BnF : l'édition la plus récente qui a un ISBN.
  const recent = parseBnf(bnf).map(fromBnf).filter((n) => n.isbn)
    .sort((a, b) => (yearOf(b.edition) || 0) - (yearOf(a.edition) || 0))[0];
  if (recent) return mergeNotices(await byIsbn(recent.isbn, fetchJson), recent);
  // Dernier recours : Open Library.
  const olQuery = `title:"${title.replace(/"/g, ' ')}"${author ? ` author:(${author.replace(/[()"]/g, ' ')})` : ''} language:fre`;
  const ol = await fetchJson(`${OL}/search.json?q=${encodeURIComponent(olQuery)}&limit=1&fields=key,editions,editions.key`);
  const edKey = ol?.docs?.[0]?.editions?.docs?.[0]?.key;
  const ed = edKey ? await fetchJson(`${OL}${edKey}.json`) : null;
  return mergeNotices(fromOpenLibrary(ed), fromGb);
}

/**
 * Cherche la notice d'un livre. `query` : ISBN ou lien (facultatif) ; sinon titre et auteur.
 * Renvoie { notice, byTitle } ou { error }.
 */
export async function lookupBook({ query = '', title = '', author = '' }, fetchJson = defaultFetchJson) {
  if (clean(query)) {
    const { isbn, error } = extractIsbn(query);
    if (error) return { error };
    return { notice: await byIsbn(isbn, fetchJson), byTitle: false };
  }
  if (!clean(title)) return { error: "Indiquez d'abord le titre du livre (et si possible l'auteur), ou collez un ISBN ou un lien." };
  return { notice: await byTitle(clean(title), clean(author), fetchJson), byTitle: true };
}
