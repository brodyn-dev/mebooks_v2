import { useMemo, useState } from 'react';
import type { Status, UserBook } from '../lib/types';
import { Cover, StatusPill } from './ui';

type Filter = 'all' | Status;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'reading', label: '📖 Sedang baca' },
  { value: 'want', label: '📋 Nak baca' },
  { value: 'finished', label: '✅ Dah habis' },
];

export default function ShelfView({
  books,
  onOpen,
  onAdd,
  readOnly = false,
}: {
  books: UserBook[];
  onOpen: (ub: UserBook) => void;
  onAdd?: () => void;
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

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
    return books.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (!q) return true;
      return (
        b.book.title.toLowerCase().includes(q) ||
        b.book.authors.toLowerCase().includes(q) ||
        b.book.genre.toLowerCase().includes(q)
      );
    });
  }, [books, filter, query]);

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
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Tiada buku sepadan dengan carian.</p>
      ) : (
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
      )}
    </div>
  );
}
