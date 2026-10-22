import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isConfigured } from './lib/supabase';
import { fetchShelf, fetchUserBookById } from './lib/api';
import type { UserBook } from './lib/types';
import AuthPage from './components/AuthPage';
import AddBookModal from './components/AddBookModal';
import BookDetail from './components/BookDetail';
import FeedView from './components/FeedView';
import ProfileView from './components/ProfileView';
import SearchPeople from './components/SearchPeople';
import ShelfView from './components/ShelfView';
import { ErrorBox, Spinner } from './components/ui';

type Tab = 'shelf' | 'feed' | 'search' | 'me';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'shelf', label: 'Rak', icon: '📚' },
  { id: 'feed', label: 'Feed', icon: '🔔' },
  { id: 'search', label: 'Cari', icon: '🔍' },
  { id: 'me', label: 'Saya', icon: '👤' },
];

function SetupScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-6 text-sm text-slate-700">
        <h1 className="mb-2 text-lg font-bold text-slate-900">Konfigurasi belum lengkap</h1>
        <p>Salin <code>.env.example</code> kepada <code>.env</code> dan isi <code>VITE_SUPABASE_URL</code> serta <code>VITE_SUPABASE_ANON_KEY</code>. Kemudian mulakan semula <code>npm run dev</code>.</p>
      </div>
    </div>
  );
}

function MainApp() {
  const { user, profile, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('shelf');
  const [shelf, setShelf] = useState<UserBook[] | null>(null);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<UserBook | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Naik bila butiran buku ditutup supaya profil dimuat semula (progres terkini)
  const [reloadKey, setReloadKey] = useState(0);

  const userId = user?.id;

  const loadShelf = useCallback(async () => {
    if (!userId) return;
    try {
      setShelf(await fetchShelf(userId));
      setShelfError(null);
    } catch (err: any) {
      setShelfError(err.message || 'Gagal muat rak');
    }
  }, [userId]);

  useEffect(() => {
    void loadShelf();
  }, [loadShelf]);

  const upsertLocal = (ub: UserBook) => {
    // Hanya rak sendiri disimpan dalam state shelf (buku orang lain hanya dipapar)
    if (ub.user_id === userId) {
      setShelf((prev) => {
        if (!prev) return [ub];
        const exists = prev.some((x) => x.id === ub.id);
        return exists ? prev.map((x) => (x.id === ub.id ? ub : x)) : [ub, ...prev];
      });
    }
    setOpenBook((cur) => (cur && cur.id === ub.id ? ub : cur));
  };

  const removeLocal = (id: string) => {
    setShelf((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
  };

  const openBookById = async (id: string) => {
    try {
      setOpenBook(await fetchUserBookById(id));
    } catch (err: any) {
      setShelfError(err.message || 'Buku tidak dapat dibuka');
    }
  };

  const goProfile = (id: string) => {
    setOpenBook(null);
    setProfileId(id);
  };

  if (loading) return <Spinner />;

  const showProfile = profileId !== null;

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button onClick={() => { setProfileId(null); setTab('shelf'); }} className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg shadow-sm">📚</span>
            <span className="text-lg font-bold text-slate-900">MeBooks</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setAddOpen(true)} className="btn-primary !px-3.5">＋ Tambah</button>
            <button onClick={signOut} className="rounded-xl px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-100" title={profile ? `Log keluar @${profile.username}` : 'Log keluar'}>
              ⎋
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {showProfile && userId ? (
          <ProfileView
            key={`${profileId}-${reloadKey}`}
            profileId={profileId!}
            onOpenBook={setOpenBook}
            onBack={() => setProfileId(null)}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <>
            {tab === 'shelf' && (
              <>
                <ErrorBox message={shelfError} />
                {shelf === null && !shelfError ? (
                  <Spinner />
                ) : (
                  <ShelfView books={shelf ?? []} onOpen={setOpenBook} onAdd={() => setAddOpen(true)} />
                )}
              </>
            )}
            {tab === 'feed' && (
              <FeedView onOpenProfile={goProfile} onOpenBook={openBookById} onFindPeople={() => setTab('search')} />
            )}
            {tab === 'search' && userId && <SearchPeople selfId={userId} onOpenProfile={goProfile} />}
            {tab === 'me' && userId && (
              <ProfileView key={`me-${userId}-${reloadKey}`} profileId={userId} onOpenBook={setOpenBook} onBack={() => setTab('shelf')} onAdd={() => setAddOpen(true)} />
            )}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4">
          {TABS.map((t) => {
            const active = !showProfile && tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setProfileId(null); setTab(t.id); }}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${active ? 'text-indigo-600' : 'text-slate-500'}`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {addOpen && userId && (
        <AddBookModal
          userId={userId}
          onAdded={(ub) => {
            upsertLocal(ub);
            setAddOpen(false);
            setTab('shelf');
            setProfileId(null);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {openBook && userId && (
        <BookDetail
          ub={openBook}
          isOwner={openBook.user_id === userId}
          onChange={upsertLocal}
          onDeleted={removeLocal}
          onClose={() => {
            setOpenBook(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <AuthPage />;
  return <MainApp />;
}
