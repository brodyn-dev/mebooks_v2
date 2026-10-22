import { parseCsv } from './csv';
import { toIsbn13 } from './isbn';

export interface ImportRow {
  line: number;
  title: string;
  authors: string;
  isbn13: string | null;
  publisher: string;
  published_year: string;
  page_count: number;
  status: 'want' | 'reading' | 'finished';
  current_page: number;
  rating: number | null;
  review: string;
  note: string;
  added_at: string | null;
  finished_at: string | null;
}

export interface ParseResult {
  rows: ImportRow[];
  skipped: { line: number; reason: string }[];
}

/** Goodreads bungkus ISBN dalam ="..." */
function unwrapIsbn(v: string): string {
  const m = v.match(/^="?(.*?)"?$/);
  return (m ? m[1] : v).trim();
}

function parseGoodreadsDate(v: string): string | null {
  const m = v.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString();
}

export function parseGoodreadsCsv(text: string): ParseResult {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length < 2) {
    return { rows: [], skipped: [{ line: 0, reason: 'Fail kosong atau tiada data' }] };
  }

  const header = table[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const C = {
    title: col('Title'),
    author: col('Author'),
    isbn: col('ISBN'),
    isbn13: col('ISBN13'),
    shelf: col('Exclusive Shelf'),
    rating: col('My Rating'),
    review: col('My Review'),
    note: col('Private Notes'),
    pages: col('Number of Pages'),
    added: col('Date Added'),
    read: col('Date Read'),
    publisher: col('Publisher'),
    year: col('Year Published'),
    origYear: col('Original Publication Year'),
  };
  if (C.title < 0) {
    return { rows: [], skipped: [{ line: 1, reason: 'Lajur "Title" tak dijumpai. Pastikan ini fail export Goodreads.' }] };
  }

  const get = (r: string[], idx: number) => (idx >= 0 && r[idx] ? r[idx].trim() : '');
  const rows: ImportRow[] = [];
  const skipped: ParseResult['skipped'] = [];

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const title = get(r, C.title).slice(0, 300);
    if (!title) {
      skipped.push({ line, reason: 'Tiada tajuk' });
      continue;
    }

    const isbnRaw = unwrapIsbn(get(r, C.isbn13)) || unwrapIsbn(get(r, C.isbn));
    const isbn13 = isbnRaw ? toIsbn13(isbnRaw) : null;

    const shelf = get(r, C.shelf).toLowerCase();
    const status: ImportRow['status'] =
      shelf === 'read' ? 'finished' : shelf === 'currently-reading' ? 'reading' : 'want';

    const pages = Math.min(10000, Math.max(0, parseInt(get(r, C.pages) || '0', 10) || 0));
    const finished = status === 'finished';
    const ratingN = parseInt(get(r, C.rating) || '0', 10);

    const yearRaw = get(r, C.year) || get(r, C.origYear);

    rows.push({
      line,
      title,
      authors: get(r, C.author).slice(0, 300),
      isbn13,
      publisher: get(r, C.publisher).slice(0, 200),
      published_year: (yearRaw.match(/\d{4}/) || [''])[0],
      page_count: pages,
      status,
      current_page: finished ? pages : 0,
      rating: ratingN >= 1 && ratingN <= 5 ? ratingN : null,
      review: get(r, C.review).slice(0, 5000),
      note: get(r, C.note).slice(0, 5000),
      added_at: parseGoodreadsDate(get(r, C.added)),
      finished_at: finished ? parseGoodreadsDate(get(r, C.read)) : null,
    });
  }

  return { rows, skipped };
}
