import { useEffect, useMemo, useState } from 'react';
import { fetchAllProfiles, fetchMyFollowingIds, follow, unfollow } from '../lib/api';
import type { Profile } from '../lib/types';
import { Avatar, ErrorBox, Spinner } from './ui';

export default function SearchPeople({
  selfId,
  onOpenProfile,
}: {
  selfId: string;
  onOpenProfile: (profileId: string) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAllProfiles(selfId), fetchMyFollowingIds(selfId)])
      .then(([p, ids]) => {
        setProfiles(p);
        setFollowing(new Set(ids));
      })
      .catch((err) => setError(err.message || 'Gagal muat senarai pengguna'));
  }, [selfId]);

  const visible = useMemo(() => {
    if (!profiles) return [];
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) => p.username.includes(q) || p.display_name.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  const toggle = async (p: Profile) => {
    const isFollowing = following.has(p.id);
    setBusyId(p.id);
    setError(null);
    // Kemas kini dahulu (optimistic), rollback jika gagal
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    try {
      if (isFollowing) await unfollow(selfId, p.id);
      else await follow(selfId, p.id);
    } catch (err: any) {
      setError(err.message || 'Gagal kemas kini ikutan');
      setFollowing((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(p.id);
        else next.delete(p.id);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  };

  if (profiles === null && !error) return <Spinner />;

  return (
    <div className="space-y-4">
      <input
        className="input"
        placeholder={`Tapis ${profiles?.length ?? 0} pengguna…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ErrorBox message={error} />

      {profiles && profiles.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Belum ada pengguna lain lagi.</p>
      )}
      {profiles && profiles.length > 0 && visible.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Tiada pengguna sepadan dengan carian.</p>
      )}

      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {visible.map((p) => {
          const isFollowing = following.has(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 p-3 sm:p-4">
              <button onClick={() => onOpenProfile(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={p.display_name} src={p.avatar_url} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{p.display_name}</span>
                  <span className="block truncate text-sm text-slate-500">
                    @{p.username}
                    {p.is_private ? ' · 🔒' : ''}
                  </span>
                </span>
              </button>
              <button
                onClick={() => toggle(p)}
                disabled={busyId === p.id}
                className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  isFollowing
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
                }`}
              >
                {isFollowing ? 'Mengikut ✓' : '+ Ikut'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
