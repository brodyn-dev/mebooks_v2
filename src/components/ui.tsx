import { ReactNode, useEffect } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Cover({ src, title, className = '' }: { src: string; title: string; className?: string }) {
  if (src) {
    return <img src={src} alt={title} loading="lazy" className={`object-cover bg-slate-200 ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-2xl text-slate-500 ${className}`}>
      📖
    </div>
  );
}

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (src) return <img src={src} alt="" className={`${dim} rounded-full object-cover`} />;
  return (
    <div className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 font-bold text-white`}>
      {(name[0] || '?').toUpperCase()}
    </div>
  );
}

export function Spinner() {
  return <div className="py-12 text-center text-slate-400">Memuat…</div>;
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

export function StatusPill({ status }: { status: 'want' | 'reading' | 'finished' }) {
  const map = {
    want: ['📋 Nak baca', 'bg-amber-100 text-amber-800'],
    reading: ['📖 Sedang baca', 'bg-blue-100 text-blue-800'],
    finished: ['✅ Dah habis', 'bg-emerald-100 text-emerald-800'],
  } as const;
  const [label, cls] = map[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function Stars({ value, onChange }: { value: number | null; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-0.5" aria-label={value ? `${value} bintang` : 'Tiada rating'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`text-xl leading-none ${(value ?? 0) >= n ? 'text-amber-400' : 'text-slate-300'} ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru je';
  if (m < 60) return `${m} min lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
