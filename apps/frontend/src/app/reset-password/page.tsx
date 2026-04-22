'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type VerifyStatus = 'loading' | 'valid' | 'invalid';

const REASON_MESSAGES: Record<string, string> = {
  expired: 'Esse link já expirou. Solicite um novo.',
  used: 'Esse link já foi utilizado. Solicite um novo se ainda precisar.',
  not_found: 'Link inválido. Solicite uma nova recuperação.',
  wrong_type: 'Link inválido. Solicite uma nova recuperação.',
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params]);

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(token ? 'loading' : 'invalid');
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [verifyMessage, setVerifyMessage] = useState<string>(
    token ? '' : 'Link inválido. Solicite uma nova recuperação.',
  );

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current || !token) return;
    verifiedRef.current = true;

    (async () => {
      try {
        const res = await apiFetch(
          `${apiUrl}/auth/reset-password/verify?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => ({}))) as {
          valid?: boolean;
          reason?: string;
          maskedEmail?: string;
        };
        if (data.valid && data.maskedEmail) {
          setMaskedEmail(data.maskedEmail);
          setVerifyStatus('valid');
        } else {
          setVerifyStatus('invalid');
          setVerifyMessage(
            REASON_MESSAGES[data.reason ?? 'not_found'] ??
              'Link inválido. Solicite uma nova recuperação.',
          );
        }
      } catch {
        setVerifyStatus('invalid');
        setVerifyMessage('Erro de rede ao validar o link. Tente novamente em instantes.');
      }
    })();
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Senha e confirmação não conferem.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        throw new Error(data.message || 'Não foi possível redefinir sua senha. O link pode ter expirado.');
      }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
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
          <h1 className='text-2xl font-semibold tracking-tight'>Redefinir senha</h1>

          {verifyStatus === 'loading' ? (
            <p className='mt-4 text-sm text-white/60'>Validando seu link, aguarde...</p>
          ) : null}

          {verifyStatus === 'invalid' ? (
            <>
              <div className='mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200'>
                {verifyMessage}
              </div>
              <Link
                href='/forgot-password'
                className='mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]'
              >
                Solicitar novo link
              </Link>
            </>
          ) : null}

          {verifyStatus === 'valid' ? (
            <>
              <p className='mt-2 text-sm text-white/50'>Você está redefinindo a senha da conta:</p>
              <p className='mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white'>
                {maskedEmail}
              </p>

              {success ? (
                <div className='mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100'>
                  Senha redefinida com sucesso! Redirecionando para o login...
                </div>
              ) : (
                <form className='mt-5 space-y-3' onSubmit={handleSubmit}>
                  <input
                    className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                    type='password'
                    placeholder='Nova senha (mínimo 8 caracteres)'
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    autoComplete='new-password'
                    required
                  />
                  <input
                    className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                    type='password'
                    placeholder='Confirmar nova senha'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    autoComplete='new-password'
                    required
                  />
                  <button
                    disabled={loading}
                    className='w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:pointer-events-none'
                  >
                    {loading ? 'Salvando...' : 'Redefinir senha'}
                  </button>
                  {error ? (
                    <p className='rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200'>{error}</p>
                  ) : null}
                </form>
              )}
            </>
          ) : null}

          <div className='mt-6 text-center text-sm text-white/50'>
            <Link href='/login' className='text-white/70 hover:text-white transition-colors'>
              Voltar ao login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
