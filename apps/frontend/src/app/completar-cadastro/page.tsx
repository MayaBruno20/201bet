'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { getPostAuthPath, getStoredUser, setStoredUser, type SessionUser } from '@/lib/auth';
import { apiFetch, parseApiErrorMessage } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';
import { BirthdateInput } from '@/components/forms/birthdate-input';
import { isAdult } from '@/lib/birthdate';
import { maskCPF, unmaskCPF } from '@/lib/masks';

const apiUrl = getPublicApiUrl();

export default function CompletarCadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      if (!getStoredUser()) {
        router.replace('/login');
        return;
      }
      try {
        const res = await apiFetch(`${apiUrl}/auth/me`, { method: 'GET' });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) return;
        const me = (await res.json()) as { profileComplete?: boolean; role?: SessionUser['role'] };
        if (me.profileComplete) {
          router.replace(getPostAuthPath(me as SessionUser));
        }
      } catch {
        // mantém a tela
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const cpfDigits = unmaskCPF(cpf);
    if (cpfDigits.length !== 11) {
      setError('CPF deve conter 11 dígitos.');
      setLoading(false);
      return;
    }
    if (!birthDate || !isAdult(birthDate)) {
      setError('Informe a data de nascimento completa. É necessário ter 18 anos ou mais.');
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch(`${apiUrl}/auth/complete-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfDigits, birthDate }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(parseApiErrorMessage(text, 'Não foi possível salvar.'));
      }
      const data = JSON.parse(text) as { user: SessionUser };
      const prev = getStoredUser();
      setStoredUser({ ...prev, ...data.user, profileComplete: true } as SessionUser);
      router.push(getPostAuthPath({ ...data.user, profileComplete: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Completar cadastro</h1>
          <p className='mt-2 text-sm text-white/50'>
            Informe CPF e data de nascimento para apostar, depositar e sacar.
          </p>
          <form className='mt-6 space-y-4' onSubmit={handleSubmit}>
            <input
              className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
              type='text'
              inputMode='numeric'
              placeholder='CPF'
              value={maskCPF(cpf)}
              onChange={(e) => setCpf(unmaskCPF(e.target.value).slice(0, 11))}
              required
            />
            <BirthdateInput value={birthDate} onChange={setBirthDate} id='completar-birth' />
            <button
              type='submit'
              disabled={loading}
              className='w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.01] disabled:opacity-50 disabled:pointer-events-none'
            >
              {loading ? 'Salvando...' : 'Continuar'}
            </button>
          </form>
          {error ? (
            <p className='mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200'>{error}</p>
          ) : null}
          <p className='mt-4 text-center text-sm text-white/40'>
            <Link href='/login' className='text-white/70 hover:text-white transition-colors'>
              Voltar ao login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
