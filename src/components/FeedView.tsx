import { useEffect, useState } from 'react';
import { fetchFeed } from '../lib/api';
import type { ActivityEvent } from '../lib/types';
import { Avatar, Cover, ErrorBox, Spinner, Stars, timeAgo } from './ui';

export default function FeedView({
  onOpenProfile,
  onOpenBook,
  onFindPeople,
}: {
  onOpenProfile: (profileId: string) => void;
  onOpenBook: (userBookId: string) => void;
  onFindPeople: () => void;
}) {
  const [items, setItems] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFeed()
      .then(setItems)
      .catch((err) => setError(err.message || 'Gagal muat feed'));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (items === null) return <Spinner />;

  if (items.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="mb-4 text-5xl">🔔</div>
        <h3 className="text-lg font-bold text-slate-900">Feed masih kosong</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
          Ikut kawan-kawan untuk nampak apa yang mereka baca. Progres bacaan mereka akan muncul di sini.
        </p>
        <button onClick={onFindPeople} className="btn-primary mt-6">Cari kawan</button>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((ev) => (
        <li key={ev.id} className="card p-4">
          <div className="flex gap-3">
            <button onClick={() => onOpenProfile(ev.profile.id)} className="flex-shrink-0">
              <Avatar name={ev.profile.display_name} src={ev.profile.avatar_url} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-slate-700">
                <button onClick={() => onOpenProfile(ev.profile.id)} className="font-semibold text-slate-900 hover:underline">
                  {ev.profile.display_name}
                </button>{' '}
                <EventText ev={ev} />
              </p>
              {ev.kind === 'reviewed' && ev.body && (
                <blockquote className="mt-2 border-l-4 border-purple-200 pl-3 text-sm italic text-slate-600">
                  “{ev.body}”
                </blockquote>
              )}
              <button onClick={() => onOpenBook(ev.user_book_id)} className="mt-2 flex w-full items-center gap-3 rounded-xl bg-slate-50 p-2.5 text-left transition hover:bg-slate-100">
                <Cover src={ev.book.cover_url} title={ev.book.title} className="h-14 w-10 flex-shrink-0 rounded" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 block text-sm font-medium text-slate-900">{ev.book.title}</span>
                  {ev.book.authors && <span className="line-clamp-1 block text-xs text-slate-500">{ev.book.authors}</span>}
                  {ev.kind === 'progress' || ev.kind === 'started' || ev.kind === 'finished' ? (
                    <ProgressBar page={ev.page ?? 0} total={ev.book.page_count} />
                  ) : null}
                </span>
              </button>
              <p className="mt-2 text-xs text-slate-400">{timeAgo(ev.created_at)}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EventText({ ev }: { ev: ActivityEvent }) {
  switch (ev.kind) {
    case 'started':
      return <span className="text-blue-600">📖 mula baca</span>;
    case 'progress':
      return (
        <span className="text-slate-600">
          📖 baca sampai muka surat <strong>{ev.page}</strong>
        </span>
      );
    case 'finished':
      return <span className="text-emerald-600">✅ habis baca</span>;
    case 'reviewed':
      return <span className="text-purple-600">💬 tulis review</span>;
    case 'rated':
      return (
        <span className="inline-flex items-center gap-2 text-amber-600">
          ⭐ beri rating
          <Stars value={ev.rating} />
        </span>
      );
  }
}

function ProgressBar({ page, total }: { page: number; total: number }) {
  if (!total) return <span className="mt-1 block text-xs text-slate-500">muka surat {page}</span>;
  const pct = Math.min(100, Math.round((page / total) * 100));
  return (
    <span className="mt-1.5 block">
      <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-500">{page}/{total} ({pct}%)</span>
    </span>
  );
}
