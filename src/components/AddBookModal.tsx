import { FormEvent, useCallback, useState } from 'react';
import { addBookToShelf } from '../lib/api';
import { isValidIsbn, toIsbn13 } from '../lib/isbn';
import { BookLookup, lookupByIsbn } from '../lib/lookup';
import type { UserBook } from '../lib/types';
import IsbnScanner from './IsbnScanner';
import { Cover, ErrorBox, Modal } from './ui';

type Step =
  | { kind: 'choose' }
  | { kind: 'scan' }
  | { kind: 'looking'; isbn13: string }
  | { kind: 'preview'; isbn13: string; info: BookLookup }
  | { kind: 'notfound'; isbn13: string }
  | { kind: 'manual' };

const EMPTY_MANUAL: BookLookup = {
  title: '',
  authors: '',
  publisher: '',
  published_year: '',
  cover_url: '',
  description: '',
  genre: '',
  page_count: 0,
};

/** Tambah buku ke rak: scan ISBN → maklumat auto → terus simpan. */
export default function AddBookModal({
  userId,
  onAdded,
  onClose,
}: {
  userId: string;
  onAdded: (ub: UserBook) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [isbnInput, setIsbnInput] = useState('');
  const [pages, setPages] = useState('');
  const [manual, setManual] = useState<BookLookup>(EMPTY_MANUAL);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // ISBN yang dah dicuba tapi tak dijumpai: dikekalkan bila isi manual
  const [manualIsbn, setManualIsbn] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    setError(null);
    const isbn13 = toIsbn13(raw);
    if (!isbn13 || !isValidIsbn(raw)) {
      setError('ISBN tidak sah. Semak semula digit (ISBN-10 atau ISBN-13).');
      return;
    }
    setStep({ kind: 'looking', isbn13 });
    let info: BookLookup | null;
    try {
      info = await lookupByIsbn(isbn13);
    } catch (err: any) {
      setError(err.message || 'Gagal cari buku');
      setStep({ kind: 'choose' });
      return;
    }
    if (info && info.title) {
      setPages(info.page_count ? String(info.page_count) : '');
      setStep({ kind: 'preview', isbn13, info });
    } else {
      setStep({ kind: 'notfound', isbn13 });
    }
  };

  const onDetected = useCallback((isbn13: string) => {
    void lookup(isbn13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (input: BookLookup & { isbn13: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      const pageCount = Math.max(0, Math.min(10000, Number(pages) || 0));
      const ub = await addBookToShelf(userId, { ...input, page_count: pageCount });
      onAdded(ub);
    } catch (err: any) {
      setError(err.message || 'Gagal simpan buku');
      setSaving(false);
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!manual.title.trim()) {
      setError('Tajuk diperlukan');
      return;
    }
    void save({ ...manual, title: manual.title.trim(), isbn13: manualIsbn });
  };

  // ---- Langkah: pilih cara ----
  if (step.kind === 'choose') {
    return (
      <Modal title="Tambah buku ke rak" onClose={onClose}>
        <div className="space-y-3">
          <button onClick={() => setStep({ kind: 'scan' })} className="card flex w-full items-center gap-4 p-4 text-left hover:border-indigo-300">
            <span className="text-3xl">📷</span>
            <span>
              <span className="block font-semibold text-slate-900">Imbas barcode ISBN</span>
              <span className="text-sm text-slate-500">Paling pantas. Maklumat buku auto-isi.</span>
            </span>
          </button>

          <div className="card space-y-2 p-4">
            <label className="block text-sm font-semibold text-slate-900">Taip ISBN</label>
            <div className="flex gap-2">
              <input
                className="input"
                inputMode="numeric"
                placeholder="cth: 9780134685991"
                value={isbnInput}
                onChange={(e) => setIsbnInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && isbnInput.trim() && lookup(isbnInput)}
              />
              <button className="btn-primary" disabled={!isbnInput.trim()} onClick={() => lookup(isbnInput)}>
                Cari
              </button>
            </div>
            <ErrorBox message={error} />
          </div>

          <button onClick={() => { setManualIsbn(null); setStep({ kind: 'manual' }); }} className="w-full py-2 text-sm font-semibold text-indigo-600 hover:underline">
            Tiada ISBN? Isi secara manual
          </button>
        </div>
      </Modal>
    );
  }

  if (step.kind === 'scan') {
    return <IsbnScanner onDetected={onDetected} onClose={() => setStep({ kind: 'choose' })} />;
  }

  if (step.kind === 'looking') {
    return (
      <Modal title="Mencari buku…" onClose={onClose}>
        <p className="py-8 text-center text-sm text-slate-500">ISBN {step.isbn13}</p>
      </Modal>
    );
  }

  if (step.kind === 'notfound') {
    return (
      <Modal title="Buku tidak dijumpai" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">ISBN <span className="font-mono">{step.isbn13}</span> tiada dalam Google Books atau Open Library. Isi maklumat secara manual.</p>
          <button className="btn-primary w-full" onClick={() => { setManual({ ...EMPTY_MANUAL }); setManualIsbn(step.isbn13); setStep({ kind: 'manual' }); }}>
            Isi secara manual
          </button>
          <button className="btn-ghost w-full" onClick={() => setStep({ kind: 'choose' })}>Cuba ISBN lain</button>
        </div>
      </Modal>
    );
  }

  if (step.kind === 'preview') {
    const info = step.info;
    return (
      <Modal title="Buku dijumpai" onClose={onClose}>
        <div className="space-y-5">
          <div className="flex gap-4">
            <Cover src={info.cover_url} title={info.title} className="h-36 w-24 flex-shrink-0 rounded-lg shadow" />
            <div className="min-w-0">
              <h3 className="font-bold leading-snug text-slate-900">{info.title}</h3>
              {info.authors && <p className="mt-1 text-sm text-slate-600">{info.authors}</p>}
              <p className="mt-2 text-xs text-slate-400">
                {[info.publisher, info.published_year].filter(Boolean).join(' • ')}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">ISBN {step.isbn13}</p>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Jumlah muka surat</span>
            <input className="input mt-1" type="number" min={0} max={10000} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Tak diketahui" />
            <span className="mt-1 block text-xs text-slate-400">Perlu untuk track progres. Boleh ubah kemudian.</span>
          </label>

          <ErrorBox message={error} />
          <button className="btn-primary w-full" disabled={saving} onClick={() => save({ ...info, isbn13: step.isbn13 })}>
            {saving ? 'Menyimpan…' : '+ Tambah ke rak saya'}
          </button>
        </div>
      </Modal>
    );
  }

  // ---- Manual ----
  return (
    <Modal title="Tambah manual" onClose={onClose}>
      <form onSubmit={submitManual} className="space-y-3">
        {manualIsbn && (
          <p className="text-xs text-slate-500">ISBN <span className="font-mono">{manualIsbn}</span> akan disimpan bersama buku ini.</p>
        )}
        <input className="input" placeholder="Tajuk *" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} required maxLength={300} />
        <input className="input" placeholder="Penulis" value={manual.authors} onChange={(e) => setManual({ ...manual, authors: e.target.value })} maxLength={300} />
        <input className="input" type="number" min={0} max={10000} placeholder="Jumlah muka surat" value={pages} onChange={(e) => setPages(e.target.value)} />
        <ErrorBox message={error} />
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Tambah ke rak saya'}
        </button>
      </form>
    </Modal>
  );
}
