import { supabase } from './supabase';

export interface BookLookup {
  title: string;
  authors: string;
  publisher: string;
  published_year: string;
  cover_url: string;
  description: string;
  genre: string;
  page_count: number;
}

const TIMEOUT_MS = 8000;

/** Ralat sambungan (timeout, offline). Berbeza dengan "buku tak wujud". */
class NetworkError extends Error {}

async function getJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null; // 404 dll: buku tak wujud di sumber ini
    return await res.json();
  } catch {
    throw new NetworkError('sambungan gagal');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cari buku ikut ISBN-13:
 * 1) Katalog MeBooks (buku yang user lain dah tambah)
 * 2) Google Books
 * 3) Open Library
 * Kalau semua gagal kerana sambungan, lempar ralat (bukan "tak jumpa").
 */
export async function lookupByIsbn(isbn13: string): Promise<BookLookup | null> {
  const local = await fromCatalog(isbn13);
  if (local) return local;

  let networkFailed = false;
  for (const source of [fromGoogle, fromOpenLibrary]) {
    try {
      const found = await source(isbn13);
      if (found) return found;
    } catch (err) {
      if (err instanceof NetworkError) networkFailed = true;
      else throw err;
    }
  }

  // Sumber tambahan: ralat diabaikan supaya tak menyekat aliran "tak jumpa"
  for (const source of [fromWikidata, fromArchive]) {
    try {
      const found = await source(isbn13);
      if (found) return found;
    } catch {
      /* abaikan */
    }
  }

  if (networkFailed) throw new Error('Gagal sambung ke pangkalan data buku. Semak internet dan cuba lagi.');
  return null;
}

/** Wikidata (percuma, tanpa kunci): sifat P212 = ISBN-13. */
async function fromWikidata(isbn: string): Promise<BookLookup | null> {
  const query = `SELECT ?title ?authorLabel ?pages ?pubLabel ?date WHERE {
    ?item wdt:P212 "${isbn}" .
    OPTIONAL { ?item wdt:P1476 ?title . }
    OPTIONAL { ?item wdt:P50 ?author . }
    OPTIONAL { ?item wdt:P1104 ?pages . }
    OPTIONAL { ?item wdt:P123 ?pub . }
    OPTIONAL { ?item wdt:P577 ?date . }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ms". }
  } LIMIT 1`;
  const data = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const b = data?.results?.bindings?.[0];
  if (!b?.title?.value) return null;
  const label = (v: string | undefined) => (v && !/^Q\d+$/.test(v) ? v : '');
  return {
    title: b.title.value,
    authors: label(b.authorLabel?.value),
    publisher: label(b.pubLabel?.value),
    published_year: String(b.date?.value || '').match(/\d{4}/)?.[0] || '',
    cover_url: '',
    description: '',
    genre: '',
    page_count: Number(b.pages?.value) || 0,
  };
}

/** Internet Archive (percuma, tanpa kunci untuk carian). */
async function fromArchive(isbn: string): Promise<BookLookup | null> {
  const params = new URLSearchParams({
    q: `isbn:${isbn}`,
    rows: '1',
    page: '1',
    output: 'json',
  });
  ['identifier', 'title', 'creator', 'date', 'publisher'].forEach((f) => params.append('fl[]', f));
  const data = await getJson(`https://archive.org/advancedsearch.php?${params.toString()}`);
  const doc = data?.response?.docs?.[0];
  if (!doc) return null;
  const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
  const title = first(doc.title);
  if (!title) return null;
  const creator = Array.isArray(doc.creator) ? doc.creator.join(', ') : first(doc.creator);
  return {
    title,
    authors: creator,
    publisher: first(doc.publisher),
    published_year: first(doc.date).match(/\d{4}/)?.[0] || '',
    cover_url: doc.identifier ? `https://archive.org/services/img/${first(doc.identifier)}` : '',
    description: '',
    genre: '',
    page_count: 0,
  };
}

async function fromCatalog(isbn: string): Promise<BookLookup | null> {
  const res = await supabase
    .from('books')
    .select('title, authors, publisher, published_year, cover_url, description, genre, page_count')
    .eq('isbn13', isbn)
    .maybeSingle();
  if (res.error || !res.data || !res.data.title) return null;
  const b = res.data as Record<string, unknown>;
  return {
    title: String(b.title ?? ''),
    authors: String(b.authors ?? ''),
    publisher: String(b.publisher ?? ''),
    published_year: String(b.published_year ?? ''),
    cover_url: String(b.cover_url ?? ''),
    description: String(b.description ?? ''),
    genre: String(b.genre ?? ''),
    page_count: Number(b.page_count) || 0,
  };
}

async function fromGoogle(isbn: string): Promise<BookLookup | null> {
  const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const item = data?.items?.[0]?.volumeInfo;
  if (!item) return null;
  const links = item.imageLinks || {};
  const cover = (links.thumbnail || links.smallThumbnail || '').replace('http://', 'https://');
  return {
    title: item.title || '',
    authors: (item.authors || []).join(', '),
    publisher: item.publisher || '',
    published_year: (item.publishedDate || '').slice(0, 4),
    cover_url: cover,
    description: (item.description || '').slice(0, 2000),
    genre: item.categories?.[0] || '',
    page_count: Number(item.pageCount) || 0,
  };
}

async function fromOpenLibrary(isbn: string): Promise<BookLookup | null> {
  const data = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!data?.title) return null;

  let authors = '';
  const key = data.authors?.[0]?.key;
  if (key) {
    const a = await getJson(`https://openlibrary.org${key}.json`);
    authors = a?.name || '';
  }

  const desc = typeof data.description === 'string' ? data.description : data.description?.value || '';
  const cover = data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg` : '';
  return {
    title: data.title,
    authors,
    publisher: data.publishers?.[0] || '',
    published_year: String(data.publish_date || '').match(/\d{4}/)?.[0] || '',
    cover_url: cover,
    description: desc.slice(0, 2000),
    genre: data.subjects?.[0] || '',
    page_count: Number(data.number_of_pages) || 0,
  };
}
