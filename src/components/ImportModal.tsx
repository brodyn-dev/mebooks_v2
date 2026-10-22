import { useState } from 'react';
import { importGoodreadsRows, ImportResult } from '../lib/api';
import { parseGoodreadsCsv, ParseResult } from '../lib/goodreads';
import { ErrorBox, Modal } from './ui';

export default function ImportModal({
  userId,
  onFinished,
  onClose,
}: {
  userId: string;
  onFinished: () => void;
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setResult(null);
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const res = parseGoodreadsCsv(text);
      if (res.rows.length === 0 && res.skipped.length > 0 && res.skipped[0].line <= 1) {
        setError(res.skipped[0].reason);
        return;
      }
      setParsed(res);
    } catch {
      setError('Tak dapat baca fail. Pastikan ia fail CSV.');
    }
  };

  const count = (fn: (r: ParseResult['rows'][number]) => boolean) => parsed?.rows.filter(fn).length ?? 0;

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importGoodreadsRows(userId, parsed.rows, (done, total) => setProgress({ done, total }));
      setResult(res);
      onFinished();
    } catch (err: any) {
      setError(err.message || 'Import gagal. Cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Modal title="Import dari Goodreads" onClose={busy ? () => {} : onClose} wide>
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Cara dapat fail:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Buka Goodreads di desktop → <strong>My Books</strong> → <strong>Import and export</strong>.</li>
            <li>Klik <strong>Export Library</strong>, kemudian muat turun fail CSV.</li>
            <li>Pilih fail itu di bawah.</li>
          </ol>
        </div>

        {!result && (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Fail CSV Goodreads</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </label>
        )}

        <ErrorBox message={error} />

        {parsed && !result && (
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-sm font-semibold text-slate-800">{fileName}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat label="Jumlah buku" value={parsed.rows.length} />
                <Stat label="Dah habis" value={count((r) => r.status === 'finished')} />
                <Stat label="Sedang baca" value={count((r) => r.status === 'reading')} />
                <Stat label="Nak baca" value={count((r) => r.status === 'want')} />
                <Stat label="Ada rating" value={count((r) => r.rating !== null)} />
                <Stat label="Ada review" value={count((r) => !!r.review)} />
                <Stat label="Ada nota" value={count((r) => !!r.note)} />
                <Stat label="Tiada ISBN" value={count((r) => !r.isbn13)} />
              </div>
              {parsed.skipped.length > 0 && (
                <p className="mt-3 text-xs text-amber-700">
                  {parsed.skipped.length} baris akan dilangkau (tiada tajuk).
                </p>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Buku yang dah ada dalam rak awak tak akan ditindih. Buku import ditanda <strong>peribadi</strong> (tak awam) dan tak akan muncul dalam feed. Awak boleh tukar kepada awam bila-bila dalam butiran buku.
            </p>

            {progress && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{progress.done}/{progress.total} diproses…</p>
              </div>
            )}

            <button className="btn-primary w-full" disabled={busy || parsed.rows.length === 0} onClick={run}>
              {busy ? 'Mengimport…' : `Import ${parsed.rows.length} buku`}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Import siap ✅</p>
              <ul className="mt-2 list-disc pl-5">
                <li>{result.added} buku ditambah ke rak</li>
                <li>{result.alreadyInShelf} buku dah ada dalam rak (dilangkau)</li>
                {result.failed > 0 && <li className="text-red-700">{result.failed} buku gagal</li>}
              </ul>
            </div>
            <button className="btn-ghost w-full" onClick={onClose}>Tutup</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
