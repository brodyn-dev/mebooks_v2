import { useEffect, useState } from 'react';
import { fetchFollowers, fetchFollowing, MiniProfile } from '../lib/api';
import { Avatar, ErrorBox, Modal, Spinner } from './ui';

export default function FollowListModal({
  kind,
  profileId,
  onOpenProfile,
  onClose,
}: {
  kind: 'followers' | 'following';
  profileId: string;
  onOpenProfile: (profileId: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<MiniProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    setError(null);
    const fn = kind === 'followers' ? fetchFollowers : fetchFollowing;
    fn(profileId)
      .then(setList)
      .catch((err) => setError(err.message || 'Gagal muat senarai'));
  }, [kind, profileId]);

  return (
    <Modal title={kind === 'followers' ? 'Pengikut' : 'Mengikut'} onClose={onClose}>
      <ErrorBox message={error} />
      {!error && list === null && <Spinner />}
      {list && list.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          {kind === 'followers' ? 'Belum ada pengikut.' : 'Belum mengikut sesiapa.'}
        </p>
      )}
      {list && list.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpenProfile(p.id)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50">
                <Avatar name={p.display_name} src={p.avatar_url} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{p.display_name}</span>
                  <span className="block truncate text-sm text-slate-500">@{p.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
