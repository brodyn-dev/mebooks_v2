import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchFollowState,
  fetchProfile,
  fetchShelf,
  follow,
  FollowState,
  unfollow,
  updateMyProfile,
} from '../lib/api';
import type { Profile, UserBook } from '../lib/types';
import ShelfView from './ShelfView';
import { Avatar, ErrorBox, Spinner } from './ui';

export default function ProfileView({
  profileId,
  onOpenBook,
  onBack,
  onAdd,
}: {
  profileId: string;
  onOpenBook: (ub: UserBook) => void;
  onBack: () => void;
  onAdd?: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const isMe = user?.id === profileId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shelf, setShelf] = useState<UserBook[] | null>(null);
  const [follows, setFollows] = useState<FollowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: '', bio: '', is_private: false });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([fetchProfile(profileId), fetchShelf(profileId)]);
      setProfile(p);
      setShelf(s);
      setForm({ display_name: p.display_name, bio: p.bio, is_private: p.is_private });
      if (user) setFollows(await fetchFollowState(user.id, profileId));
    } catch (err: any) {
      setError(err.message || 'Gagal muat profil');
    }
  };

  useEffect(() => {
    setShelf(null);
    setProfile(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, user?.id]);

  const toggleFollow = async () => {
    if (!user || !follows) return;
    setBusy(true);
    try {
      if (follows.following) await unfollow(user.id, profileId);
      else await follow(user.id, profileId);
      setFollows(await fetchFollowState(user.id, profileId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await updateMyProfile(user.id, {
        display_name: form.display_name.trim() || profile?.username || '',
        bio: form.bio.trim(),
        is_private: form.is_private,
      });
      await refreshProfile();
      setEditing(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !profile) return <ErrorBox message={error} />;
  if (!profile || shelf === null) return <Spinner />;

  const blocked = !isMe && profile.is_private && follows && !follows.following;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm font-semibold text-indigo-600 hover:underline">← Kembali</button>

      <div className="card p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar name={profile.display_name} src={profile.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">
              {profile.display_name}
              {profile.is_private && <span className="ml-2 align-middle text-sm font-normal text-slate-400">🔒 Privat</span>}
            </h2>
            <p className="text-sm text-slate-500">@{profile.username}</p>
            {profile.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{profile.bio}</p>}
            <div className="mt-3 flex justify-center gap-5 text-sm sm:justify-start">
              <span><strong className="text-slate-900">{shelf.length}</strong> <span className="text-slate-500">buku</span></span>
              <span><strong className="text-slate-900">{follows?.followers ?? 0}</strong> <span className="text-slate-500">pengikut</span></span>
              <span><strong className="text-slate-900">{follows?.followingCount ?? 0}</strong> <span className="text-slate-500">mengikut</span></span>
            </div>
          </div>
          <div className="flex-shrink-0">
            {isMe ? (
              <button className="btn-ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Batal' : 'Edit profil'}
              </button>
            ) : follows ? (
              <button className={follows.following ? 'btn-ghost' : 'btn-primary'} disabled={busy} onClick={toggleFollow}>
                {follows.following ? 'Mengikut ✓' : '+ Ikut'}
              </button>
            ) : null}
          </div>
        </div>

        {isMe && editing && (
          <form onSubmit={saveProfile} className="mt-6 space-y-3 border-t border-slate-100 pt-6">
            <input className="input" maxLength={60} placeholder="Nama paparan" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            <textarea className="input min-h-20" maxLength={280} placeholder="Bio ringkas" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
              <span>
                <span className="font-semibold text-slate-800">Akaun privat</span>
                <span className="block text-slate-500">Hanya pengikut boleh lihat rak dan aktiviti kau.</span>
              </span>
            </label>
            <button className="btn-primary" disabled={busy}>Simpan profil</button>
          </form>
        )}
      </div>

      <ErrorBox message={error} />

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">{isMe ? 'Rak saya' : 'Rak'}</h3>
        {blocked ? (
          <div className="card px-6 py-12 text-center text-sm text-slate-500">
            🔒 Akaun ini privat. Ikut untuk lihat rak dan aktiviti mereka.
          </div>
        ) : (
          <ShelfView books={shelf} onOpen={onOpenBook} onAdd={isMe ? onAdd : undefined} readOnly={!isMe} />
        )}
      </section>
    </div>
  );
}
