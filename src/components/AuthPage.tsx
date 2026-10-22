import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'register') {
      const uname = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
        setError('Username 3–20 aksara: huruf kecil, nombor atau _');
        return;
      }
      if (password.length < 8) {
        setError('Kata laluan sekurang-kurangnya 8 aksara');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim().toLowerCase(), display_name: displayName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo('Akaun dicipta. Sila semak email untuk sahkan, kemudian log masuk.');
          setMode('login');
        }
      }
    } catch (err: any) {
      const msg: string = err?.message || 'Ralat berlaku';
      setError(msg.includes('duplicate key') && msg.includes('username') ? 'Username ini sudah diambil' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl shadow-lg">📚</div>
          <h1 className="text-2xl font-bold text-slate-900">MeBooks</h1>
          <p className="mt-1 text-sm text-slate-500">Rekod bacaan kau, ikut kawan-kawan.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 transition ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {m === 'login' ? 'Log masuk' : 'Daftar'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <>
              <input className="input" placeholder="Username (cth: ali_reader)" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input className="input" placeholder="Nama paparan" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </>
          )}
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <input
            className="input"
            type="password"
            placeholder={mode === 'register' ? 'Kata laluan (min 8 aksara)' : 'Kata laluan'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Sebentar…' : mode === 'login' ? 'Log masuk' : 'Cipta akaun'}
          </button>
        </form>
      </div>
    </div>
  );
}
