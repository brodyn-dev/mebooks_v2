import type { UserBook } from './types';

const STATUS_LABEL: Record<UserBook['status'], string> = {
  want: 'Nak baca',
  reading: 'Sedang baca',
  finished: 'Dah habis',
};

/** Elak formula Excel: sel yang bermula dengan = + - @ diawal dengan ' */
function safe(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(value: string | number | null | undefined): string {
  const s = safe(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildShelfCsv(books: UserBook[]): string {
  const header = [
    'Tajuk',
    'Penulis',
    'ISBN',
    'Genre',
    'Penerbit',
    'Tahun',
    'Status',
    'Muka surat semasa',
    'Jumlah muka surat',
    'Rating (1-5)',
    'Review',
    'Awam',
    'Tarikh ditambah',
    'Tarikh mula baca',
    'Tarikh habis baca',
  ];

  const rows = books.map((ub) => [
    ub.book.title,
    ub.book.authors,
    ub.book.isbn13 ?? '',
    ub.book.genre,
    ub.book.publisher,
    ub.book.published_year,
    STATUS_LABEL[ub.status],
    ub.current_page,
    ub.page_count,
    ub.rating ?? '',
    ub.review,
    ub.is_public ? 'Ya' : 'Tidak',
    ub.created_at.slice(0, 10),
    ub.started_at ? ub.started_at.slice(0, 10) : '',
    ub.finished_at ? ub.finished_at.slice(0, 10) : '',
  ]);

  // BOM (﻿) supaya Excel baca aksara Melayu/Unicode dengan betul
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadShelfCsv(books: UserBook[], username: string) {
  const blob = new Blob([buildShelfCsv(books)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mebooks-${username}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
