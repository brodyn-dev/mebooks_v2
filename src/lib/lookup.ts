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

async function getJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cari buku ikut ISBN-13: Google Books dahulu, kemudian Open Library. */
export async function lookupByIsbn(isbn13: string): Promise<BookLookup | null> {
  return (await fromGoogle(isbn13)) ?? (await fromOpenLibrary(isbn13));
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
