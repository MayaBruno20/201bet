'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type Status = 'loading' | 'success' | 'error' | 'already';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailFallback() {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Confirmação de e-mail</h1>
          <p className='mt-4 text-sm text-white/60'>Carregando...</p>
        </section>
      </div>
    </main>
  );
}

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'error');
  const [message, setMessage] = useState<string>(
    token ? '' : 'Link inválido. Solicite um novo e-mail de confirmação.',
  );
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current || !token) return;
    attemptedRef.current = true;

    (async () => {
      try {
        const res = await apiFetch(`${apiUrl}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          alreadyVerified?: boolean;
          message?: string;
        };
        if (!res.ok) {
          setStatus('error');
          setMessage(data.message || 'Não foi possível confirmar seu e-mail. O link pode ter expirado.');
          return;
        }
        if (data.alreadyVerified) {
          setStatus('already');
          setMessage('Seu e-mail já havia sido confirmado anteriormente.');
        } else {
          setStatus('success');
          setMessage('E-mail confirmado com sucesso! Sua conta está pronta para depósitos, saques e apostas.');
        }
      } catch {
        setStatus('error');
        setMessage('Erro de rede. Tente novamente em alguns instantes.');
      }
    })();
  }, [token]);

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Confirmação de e-mail</h1>

          {status === 'loading' ? (
            <p className='mt-4 text-sm text-white/60'>Validando seu link, aguarde...</p>
          ) : null}

          {status === 'success' ? (
            <div className='mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100'>
              {message}
            </div>
          ) : null}

          {status === 'already' ? (
            <div className='mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100'>
              {message}
            </div>
          ) : null}

          {status === 'error' ? (
            <div className='mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200'>
              {message}
            </div>
          ) : null}

          <div className='mt-6 flex flex-col gap-2'>
            <Link
              href='/carteira'
              className='w-full rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]'
            >
              Ir para a carteira
            </Link>
            <Link
              href='/login'
              className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/70 transition-all hover:bg-white/10 hover:text-white'
            >
              Voltar ao login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
