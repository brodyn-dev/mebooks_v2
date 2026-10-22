import { useEffect, useState } from 'react';
import { searchProfiles } from '../lib/api';
import type { Profile } from '../lib/types';
import { Avatar, ErrorBox } from './ui';

export default function SearchPeople({
  selfId,
  onOpenProfile,
}: {
  selfId: string;
  onOpenProfile: (profileId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchProfiles(query, selfId)
        .then((r) => !cancelled && setResults(r))
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selfId]);

  return (
    <div className="space-y-4">
      <input
        className="input"
        autoFocus
        placeholder="Cari username atau nama…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ErrorBox message={error} />
      {loading && <p className="text-center text-sm text-slate-400">Mencari…</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Tiada pengguna dijumpai.</p>
      )}
      {!query.trim() && (
        <p className="py-10 text-center text-sm text-slate-400">Taip username kawan kau untuk ikut mereka.</p>
      )}
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {results.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpenProfile(p.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
              <Avatar name={p.display_name} src={p.avatar_url} />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{p.display_name}</span>
                <span className="block truncate text-sm text-slate-500">@{p.username}{p.is_private ? ' · 🔒' : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
