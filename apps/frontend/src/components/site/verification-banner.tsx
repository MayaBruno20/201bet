'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type Props = {
  /** Quando true, esconde o banner (ex.: já verificado). */
  hidden?: boolean;
  /** Mensagem customizada. Default avisa sobre depósitos/saques/apostas bloqueados. */
  message?: string;
};

export function VerificationBanner({ hidden, message }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  async function handleResend() {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/auth/resend-verification`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadyVerified?: boolean;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message || 'Não foi possível reenviar o e-mail agora. Tente novamente em alguns minutos.');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className='mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <p className='font-medium'>Confirme seu e-mail para liberar a conta</p>
          <p className='mt-1 text-amber-100/80'>
            {message ?? 'Depósitos, saques e apostas ficam bloqueados até você confirmar o e-mail de cadastro.'}
          </p>
        </div>
        <button
          type='button'
          onClick={handleResend}
          disabled={sending || sent}
          className='rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-amber-300 disabled:opacity-60 disabled:pointer-events-none'
        >
          {sent ? 'E-mail enviado' : sending ? 'Enviando...' : 'Reenviar e-mail'}
        </button>
      </div>
      {error ? <p className='mt-2 text-red-200'>{error}</p> : null}
      {sent ? (
        <p className='mt-2 text-emerald-100'>
          Se o endereço ainda não foi confirmado, verifique sua caixa de entrada e a pasta de spam.
        </p>
      ) : null}
    </div>
  );
}
