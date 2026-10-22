import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/library';
import { isValidIsbn, toIsbn13 } from '../lib/isbn';
import { Modal } from './ui';

/** Kamera scan barcode ISBN. Panggil onDetected dengan ISBN-13 yang sah. */
export default function IsbnScanner({
  onDetected,
  onClose,
}: {
  onDetected: (isbn13: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (!result || cancelled) return;
          const text = result.getText();
          if (!isValidIsbn(text)) return;
          const isbn13 = toIsbn13(text);
          if (!isbn13) return;
          cancelled = true;
          controlsRef.current?.stop();
          onDetected(isbn13);
        },
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else {
          controlsRef.current = controls;
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Tak dapat akses kamera. Sila benarkan akses kamera atau taip ISBN secara manual.');
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <Modal title="Imbas barcode ISBN" onClose={onClose}>
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-indigo-400" />
        </div>
        <p className="text-center text-sm text-slate-500">
          {error ? '' : ready ? 'Halakan barcode di belakang buku ke dalam kotak.' : 'Memulakan kamera…'}
        </p>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
