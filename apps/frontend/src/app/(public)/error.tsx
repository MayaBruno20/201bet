'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary do grupo (public) — substitui a tela genérica "Application error"
 * do Next por uma página utilizável caso algum componente client quebre em runtime.
 * Loga no console pra debugar e expõe um botão de retry (reset do React).
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[201bet] runtime error:', error);
  }, [error]);

  return (
    <main className='min-h-screen bg-[#090b11] text-white flex items-center justify-center px-6'>
      <div className='max-w-md w-full rounded-3xl border border-white/10 bg-[#101525]/95 p-8 text-center backdrop-blur-xl'>
        <div className='mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400'>
          <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
            <path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' />
          </svg>
        </div>
        <h1 className='font-display text-xl font-bold tracking-tight'>
          Algo deu errado por aqui.
        </h1>
        <p className='mt-2 text-sm text-white/60'>
          Uma falha temporária na tela. Sua conta e seu saldo continuam intactos.
        </p>
        {error.digest && (
          <p className='mt-3 font-mono text-[10px] text-white/30'>ref: {error.digest}</p>
        )}
        <div className='mt-6 flex flex-col sm:flex-row gap-2 justify-center'>
          <button
            type='button'
            onClick={() => reset()}
            className='rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-[0.97]'
          >
            Tentar de novo
          </button>
          <Link
            href='/'
            className='rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10'
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
