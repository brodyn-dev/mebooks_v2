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

  if (networkFailed) throw new Error('Gagal sambung ke pangkalan data buku. Semak internet dan cuba lagi.');
  return null;
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
