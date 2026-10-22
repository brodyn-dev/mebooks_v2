import { useEffect, useState } from 'react';
import {
  deleteUserBook,
  fetchNote,
  fetchReadingLogs,
  logProgress,
  saveNote,
  updateUserBook,
} from '../lib/api';
import type { ReadingLog, UserBook } from '../lib/types';
import { Cover, ErrorBox, Modal, Stars, StatusPill, timeAgo } from './ui';

export default function BookDetail({
  ub,
  isOwner,
  onChange,
  onDeleted,
  onClose,
}: {
  ub: UserBook;
  isOwner: boolean;
  onChange: (next: UserBook) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [pageInput, setPageInput] = useState(String(ub.current_page));
  const [pageCountInput, setPageCountInput] = useState(String(ub.page_count || ''));
  const [review, setReview] = useState(ub.review);
  const [note, setNote] = useState('');
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const pct = ub.page_count ? Math.min(100, Math.round((ub.current_page / ub.page_count) * 100)) : 0;

  useEffect(() => {
    setPageInput(String(ub.current_page));
    setReview(ub.review);
  }, [ub.id, ub.current_page, ub.review]);

  useEffect(() => {
    if (!isOwner) return;
    fetchReadingLogs(ub.id).then(setLogs).catch(() => setLogs([]));
    fetchNote(ub.id).then(setNote).catch(() => setNote(''));
  }, [ub.id, isOwner]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || 'Ralat berlaku');
    } finally {
      setBusy(false);
    }
  };

  const setPage = (page: number) =>
    run(async () => {
      const updated = await logProgress(ub.id, page);
      onChange(updated);
      if (isOwner) fetchReadingLogs(ub.id).then(setLogs).catch(() => {});
    });

  const submitPageInput = () => {
    const n = Math.floor(Number(pageInput));
    if (!Number.isFinite(n) || n < 0) return setError('Masukkan nombor muka surat yang sah');
    setPage(n);
  };

  const saveMeta = () =>
    run(async () => {
      const count = Math.max(0, Math.min(10000, Math.floor(Number(pageCountInput) || 0)));
      await updateUserBook(ub.id, { page_count: count });
      onChange({ ...ub, page_count: count });
      setSavedMsg('Disimpan');
    });

  const saveReview = () =>
    run(async () => {
      await updateUserBook(ub.id, { review: review.trim() });
      onChange({ ...ub, review: review.trim() });
      setSavedMsg('Review disimpan');
    });

  const saveRating = (rating: number) =>
    run(async () => {
      await updateUserBook(ub.id, { rating });
      onChange({ ...ub, rating });
    });

  const togglePublic = () =>
    run(async () => {
      const next = !ub.is_public;
      await updateUserBook(ub.id, { is_public: next });
      onChange({ ...ub, is_public: next });
    });

  const saveNoteNow = () =>
    run(async () => {
      await saveNote(ub.id, ub.user_id, note);
      setSavedMsg('Nota peribadi disimpan');
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm(`Padam "${ub.book.title}" dari rak?`)) return;
      await deleteUserBook(ub.id);
      onDeleted(ub.id);
      onClose();
    });

  const b = ub.book;

  return (
    <Modal title={b.title} onClose={onClose} wide>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex gap-4">
          <Cover src={b.cover_url} title={b.title} className="h-40 w-28 flex-shrink-0 rounded-xl shadow-md" />
          <div className="min-w-0 space-y-2">
            <h3 className="text-lg font-bold leading-snug text-slate-900">{b.title}</h3>
            <p className="text-sm text-slate-600">{b.authors || 'Penulis tidak diketahui'}</p>
            <p className="text-xs text-slate-400">{[b.publisher, b.published_year].filter(Boolean).join(' • ')}</p>
            <StatusPill status={ub.status} />
            <div className="pt-1">
              <Stars value={ub.rating} onChange={isOwner ? saveRating : undefined} />
            </div>
          </div>
        </div>

        <ErrorBox message={error} />

        {/* Progres */}
        <section className="card space-y-4 p-4">
          <div className="flex items-end justify-between">
            <h4 className="font-semibold text-slate-900">Progres bacaan</h4>
            <span className="text-sm text-slate-500">
              {ub.page_count ? `${ub.current_page} / ${ub.page_count} (${pct}%)` : `Muka surat: ${ub.current_page}`}
            </span>
          </div>

          {ub.page_count > 0 && (
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}

          {isOwner ? (
            <>
              <div className="flex flex-wrap gap-2">
                {ub.current_page === 0 && (
                  <button className="btn-primary" disabled={busy} onClick={() => setPage(1)}>▶ Mula baca</button>
                )}
                {[5, 10, 20].map((n) => {
                  const atEnd = ub.page_count > 0 && ub.current_page >= ub.page_count;
                  return (
                    <button
                      key={n}
                      className="btn-ghost"
                      disabled={busy || atEnd}
                      onClick={() =>
                        setPage(ub.page_count > 0 ? Math.min(ub.page_count, ub.current_page + n) : ub.current_page + n)
                      }
                    >
                      +{n} muka
                    </button>
                  );
                })}
                {ub.page_count > 0 && ub.current_page < ub.page_count && (
                  <button className="btn-ghost" disabled={busy} onClick={() => setPage(ub.page_count)}>✅ Dah habis</button>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={ub.page_count || undefined}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitPageInput()}
                  aria-label="Muka surat semasa"
                />
                <button className="btn-ghost whitespace-nowrap" disabled={busy} onClick={submitPageInput}>Kemas kini</button>
              </div>
              <p className="text-xs text-slate-400">Setiap kemas kini muncul dalam feed kawan-kawan kau (jika buku ini awam).</p>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-sm">
                <label className="col-span-2 text-slate-700">
                  Jumlah muka surat
                  <div className="mt-1 flex gap-2">
                    <input className="input" type="number" min={0} max={10000} value={pageCountInput} onChange={(e) => setPageCountInput(e.target.value)} />
                    <button className="btn-ghost whitespace-nowrap" disabled={busy} onClick={saveMeta}>Simpan</button>
                  </div>
                </label>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {ub.status === 'finished' ? 'Dah habis dibaca.' : ub.status === 'reading' ? 'Sedang dibaca.' : 'Nak baca.'}
            </p>
          )}
        </section>

        {/* Review (awam) */}
        <section className="space-y-2">
          <h4 className="font-semibold text-slate-900">Review</h4>
          {isOwner ? (
            <>
              <textarea className="input min-h-24" maxLength={5000} placeholder="Apa pendapat kau tentang buku ni?" value={review} onChange={(e) => setReview(e.target.value)} />
              <div className="flex items-center gap-3">
                <button className="btn-primary" disabled={busy || review.trim() === ub.review} onClick={saveReview}>Simpan review</button>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={ub.is_public} onChange={togglePublic} disabled={busy} className="h-4 w-4 accent-indigo-600" />
                  Papar dalam profil & feed
                </label>
              </div>
            </>
          ) : ub.review ? (
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{ub.review}</p>
          ) : (
            <p className="text-sm text-slate-400">Tiada review.</p>
          )}
          {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
        </section>

        {/* Nota peribadi & sejarah (pemilik sahaja) */}
        {isOwner && (
          <>
            <section className="space-y-2">
              <h4 className="font-semibold text-slate-900">🔒 Nota peribadi</h4>
              <textarea className="input min-h-20" maxLength={5000} placeholder="Nota untuk diri sendiri. Tak akan dipaparkan kepada sesiapa." value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-ghost" disabled={busy} onClick={saveNoteNow}>Simpan nota</button>
            </section>

            <section className="space-y-2">
              <h4 className="font-semibold text-slate-900">Sejarah bacaan</h4>
              {logs.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada rekod.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {logs.map((l) => (
                    <li key={l.id} className="flex justify-between py-2">
                      <span className="text-slate-700">
                        {l.from_page} → <strong>{l.to_page}</strong>
                      </span>
                      <span className="text-slate-400">{timeAgo(l.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-t border-slate-100 pt-4">
              <button onClick={remove} disabled={busy} className="text-sm font-semibold text-red-600 hover:underline">
                Padam dari rak
              </button>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
