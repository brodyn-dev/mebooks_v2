import { useMemo, useState } from 'react';
import { fetchAllNotes } from '../lib/api';
import type { Status, UserBook } from '../lib/types';
import { Cover, StatusPill, Stars } from './ui';
import { downloadShelfCsv } from '../lib/csv';

type Filter = 'all' | Status;
type ViewMode = 'grid' | 'list';
type SortKey = 'added_desc' | 'added_asc' | 'title' | 'author';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'reading', label: '📖 Sedang baca' },
  { value: 'want', label: '📋 Nak baca' },
  { value: 'finished', label: '✅ Dah habis' },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'added_desc', label: 'Terbaru ditambah' },
  { value: 'added_asc', label: 'Paling lama ditambah' },
  { value: 'title', label: 'Tajuk (A–Z)' },
  { value: 'author', label: 'Penulis (A–Z)' },
];

// Simpan pilihan paparan dalam browser (keutamaan peribadi, bukan data penting)
function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan jika storan disekat */
  }
}

export default function ShelfView({
  books,
  onOpen,
  onAdd,
  readOnly = false,
  exportUser,
}: {
  books: UserBook[];
  onOpen: (ub: UserBook) => void;
  onAdd?: () => void;
  readOnly?: boolean;
  /** Diisi hanya untuk rak sendiri: pemilik untuk eksport */
  exportUser?: { id: string; username: string };
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [withNotes, setWithNotes] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewMode>(() => readPref('mebooks-view', ['grid', 'list'] as const, 'grid'));
  const [sort, setSort] = useState<SortKey>(() =>
    readPref('mebooks-sort', ['added_desc', 'added_asc', 'title', 'author'] as const, 'added_desc'),
  );

  const counts = useMemo(
    () => ({
      reading: books.filter((b) => b.status === 'reading').length,
      want: books.filter((b) => b.status === 'want').length,
      finished: books.filter((b) => b.status === 'finished').length,
    }),
    [books],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = books.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (!q) return true;
      return (
        b.book.title.toLowerCase().includes(q) ||
        b.book.authors.toLowerCase().includes(q) ||
        b.book.genre.toLowerCase().includes(q)
      );
    });

    const byTime = (a: UserBook, b: UserBook) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    const byTitle = (a: UserBook, b: UserBook) => a.book.title.localeCompare(b.book.title, 'ms', { sensitivity: 'base' });
    const byAuthor = (a: UserBook, b: UserBook) =>
      (a.book.authors || '￿').localeCompare(b.book.authors || '￿', 'ms', { sensitivity: 'base' }) || byTitle(a, b);

    const sorted = [...filtered];
    switch (sort) {
      case 'added_desc':
        sorted.sort((a, b) => byTime(b, a));
        break;
      case 'added_asc':
        sorted.sort(byTime);
        break;
      case 'title':
        sorted.sort(byTitle);
        break;
      case 'author':
        sorted.sort(byAuthor);
        break;
    }
    return sorted;
  }, [books, filter, query, sort]);

  const doExport = async () => {
    if (!exportUser) return;
    setExporting(true);
    try {
      const notes = withNotes ? await fetchAllNotes(exportUser.id) : undefined;
      downloadShelfCsv(books, exportUser.username, notes);
    } catch (err) {
      console.error('Eksport gagal', err);
      window.alert('Eksport gagal. Cuba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const changeView = (v: ViewMode) => {
    setView(v);
    writePref('mebooks-view', v);
  };
  const changeSort = (s: SortKey) => {
    setSort(s);
    writePref('mebooks-sort', s);
  };

  if (books.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="mb-4 text-5xl">📚</div>
        <h3 className="text-lg font-bold text-slate-900">{readOnly ? 'Rak masih kosong' : 'Rak kau masih kosong'}</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
          {readOnly ? 'Belum ada buku awam di sini.' : 'Scan ISBN pada buku untuk tambah dalam beberapa saat.'}
        </p>
        {onAdd && (
          <button onClick={onAdd} className="btn-primary mt-6">
            📷 Scan buku pertama
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Jumlah', value: books.length, cls: 'text-slate-900' },
          { label: 'Sedang baca', value: counts.reading, cls: 'text-blue-600' },
          { label: 'Nak baca', value: counts.want, cls: 'text-amber-600' },
          { label: 'Dah habis', value: counts.finished, cls: 'text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <div className={`text-xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-[11px] text-slate-500 sm:text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <input className="input" placeholder="Cari tajuk, penulis, genre…" value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === f.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Susun ikut"
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortKey)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 sm:flex-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="flex shrink-0 rounded-xl bg-slate-100 p-1 text-sm" role="group" aria-label="Paparan">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {v === 'grid' ? '▦ Grid' : '☰ Senarai'}
              </button>
            ))}
          </div>

          {exportUser && (
            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500" title="Nota peribadi hanya untuk awak. Hanya masuk dalam fail yang awak muat turun.">
                <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-600" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} />
                Nota peribadi
              </label>
              <button
                onClick={doExport}
                disabled={exporting}
                className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Muat turun rak sebagai fail CSV (boleh buka dalam Excel)"
              >
                {exporting ? '…' : '⬇ CSV'}
              </button>
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Tiada buku sepadan dengan carian.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((ub) => {
            const pct = ub.page_count ? Math.min(100, Math.round((ub.current_page / ub.page_count) * 100)) : 0;
            return (
              <button key={ub.id} onClick={() => onOpen(ub)} className="card group overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-md">
                <Cover src={ub.book.cover_url} title={ub.book.title} className="aspect-[2/3] w-full" />
                <div className="space-y-1.5 p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{ub.book.title}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{ub.book.authors || 'Penulis tidak diketahui'}</p>
                  <StatusPill status={ub.status} />
                  {ub.status === 'reading' && ub.page_count > 0 && (
                    <div className="pt-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {ub.current_page}/{ub.page_count} muka surat ({pct}%)
                      </p>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {visible.map((ub) => {
            const pct = ub.page_count ? Math.min(100, Math.round((ub.current_page / ub.page_count) * 100)) : 0;
            return (
              <li key={ub.id}>
                <button onClick={() => onOpen(ub)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 sm:gap-4 sm:p-4">
                  <Cover src={ub.book.cover_url} title={ub.book.title} className="h-16 w-11 flex-shrink-0 rounded sm:h-20 sm:w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-semibold text-slate-900">{ub.book.title}</p>
                    <p className="line-clamp-1 text-sm text-slate-500">{ub.book.authors || 'Penulis tidak diketahui'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusPill status={ub.status} />
                      {ub.status === 'reading' && ub.page_count > 0 && (
                        <span className="text-xs text-slate-400">{ub.current_page}/{ub.page_count} ({pct}%)</span>
                      )}
                      {ub.rating ? <Stars value={ub.rating} /> : null}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
