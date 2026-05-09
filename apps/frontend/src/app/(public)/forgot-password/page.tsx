'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok && res.status !== 200) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || 'Não foi possível processar sua solicitação.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Recuperar senha</h1>
          <p className='mt-2 text-sm text-white/50'>
            Informe o e-mail da sua conta. Se ele existir, enviaremos um link para redefinir sua senha.
          </p>

          {submitted ? (
            <div className='mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100'>
              Se existir uma conta associada a esse e-mail, enviamos um link para redefinição. Verifique sua caixa de entrada
              e a pasta de spam. O link expira em 30 minutos.
            </div>
          ) : (
            <form className='mt-5 space-y-3' onSubmit={handleSubmit}>
              <input
                className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                type='email'
                placeholder='E-mail'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                disabled={loading}
                className='w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:pointer-events-none'
              >
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
              {error ? (
                <p className='rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200'>{error}</p>
              ) : null}
            </form>
          )}

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
