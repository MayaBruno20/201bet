'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApiFetch } from '@/lib/admin-api-request';
import {
  AdminSessionUser,
  getStoredAdminUser,
  setStoredAdminAccessToken,
  setStoredAdminUser,
} from '@/lib/admin-auth';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getStoredAdminUser()) {
      router.replace('/admin');
    }
  }, [router]);

  // Quando o backend pede 2FA, guardamos o tempToken e mostramos o segundo passo.
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        const message = (body as { message?: string } | null)?.message ?? 'Credenciais inválidas';
        throw new Error(message);
      }
      const data = (await res.json()) as
        | { requires2FA: true; tempToken: string }
        | { user: AdminSessionUser; accessToken?: string };

      if ('requires2FA' in data && data.requires2FA) {
        setTempToken(data.tempToken);
        return;
      }
      const okData = data as { user: AdminSessionUser; accessToken?: string };
      if (okData.accessToken) setStoredAdminAccessToken(okData.accessToken);
      setStoredAdminUser(okData.user);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit2FA(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !tempToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/login/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: twoFactorCode.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        const message = (body as { message?: string } | null)?.message ?? 'Código inválido';
        throw new Error(message);
      }
      const data = (await res.json()) as { user: AdminSessionUser; accessToken?: string };
      if (data.accessToken) setStoredAdminAccessToken(data.accessToken);
      setStoredAdminUser(data.user);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na verificação 2FA');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='min-h-screen flex items-center justify-center bg-[#070a11] p-4'>
      <div className='w-full max-w-sm rounded-2xl border border-white/10 bg-[#101525] p-6 sm:p-8 shadow-2xl'>
        <div className='flex items-center gap-2 mb-1'>
          <span className='inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-300'>
            ADMIN
          </span>
        </div>
        <h1 className='text-xl sm:text-2xl font-bold text-white'>Painel administrativo</h1>
        <p className='mt-1 text-xs text-white/50'>
          Acesso restrito a operadores autorizados. Esta sessão é isolada do site principal.
        </p>

        {!tempToken ? (
          <form onSubmit={handleSubmit} className='mt-6 space-y-3'>
            <div>
              <label className='block text-xs font-semibold text-white/60 mb-1'>E-mail</label>
              <input
                type='email'
                autoComplete='username'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-white/30'
              />
            </div>
            <div>
              <label className='block text-xs font-semibold text-white/60 mb-1'>Senha</label>
              <input
                type='password'
                autoComplete='current-password'
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-white/30'
              />
            </div>

            {error && (
              <p className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading || !email || !password}
              className='w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-black hover:bg-amber-400 disabled:opacity-60'
            >
              {loading ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit2FA} className='mt-6 space-y-3'>
            <div className='rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-200'>
              Senha confirmada. Agora informe o código de 6 dígitos do seu app autenticador
              (ou um backup code).
            </div>
            <div>
              <label className='block text-xs font-semibold text-white/60 mb-1'>Código TOTP / Backup</label>
              <input
                type='text'
                inputMode='numeric'
                autoComplete='one-time-code'
                autoFocus
                required
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder='123456'
                className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2.5 text-center text-lg font-mono tracking-widest text-white outline-none focus:border-white/30'
              />
            </div>

            {error && (
              <p className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading || !twoFactorCode}
              className='w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-black hover:bg-amber-400 disabled:opacity-60'
            >
              {loading ? 'Verificando...' : 'Verificar e entrar'}
            </button>
            <button
              type='button'
              onClick={() => { setTempToken(null); setTwoFactorCode(''); setError(''); }}
              className='w-full text-center text-xs text-white/40 hover:text-white/70'
            >
              ← Voltar e usar outra conta
            </button>
          </form>
        )}

        <p className='mt-4 text-[11px] text-white/40 leading-relaxed'>
          Tentativas de login são auditadas. Cookies httpOnly isolados garantem que sua sessão
          aqui não vaze para o site público (e vice-versa).
        </p>
      </div>
    </main>
  );
}
