'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApiFetch } from '@/lib/admin-api-request';
import { getStoredAdminUser } from '@/lib/admin-auth';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type Status = { enabled: boolean; backupCodesRemaining: number };
type SetupResponse = { otpauthUrl: string; qrPng: string; secret: string };

export default function AdminSecurityPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Setup state
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Disable state
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  // Regenerate backup codes
  const [regenCode, setRegenCode] = useState('');

  useEffect(() => {
    if (!getStoredAdminUser()) {
      router.replace('/admin/login');
      return;
    }
    void loadStatus();
  }, [router]);

  async function loadStatus() {
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/2fa/status`);
      if (!res.ok) return;
      setStatus((await res.json()) as Status);
    } catch { /* ignore */ }
  }

  async function startSetup() {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/2fa/setup`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        throw new Error((body as { message?: string } | null)?.message ?? 'Falha ao iniciar setup');
      }
      setSetupData((await res.json()) as SetupResponse);
      setBackupCodes(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally { setLoading(false); }
  }

  async function confirmSetup() {
    if (!verifyCode) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        throw new Error((body as { message?: string } | null)?.message ?? 'Código inválido');
      }
      const data = (await res.json()) as { backupCodes: string[] };
      setBackupCodes(data.backupCodes);
      setSetupData(null);
      setVerifyCode('');
      void loadStatus();
      setMessage('2FA ativado com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally { setLoading(false); }
  }

  async function disable2fa() {
    if (!disablePassword || !disableCode) return;
    if (!confirm('Tem certeza que quer desativar o 2FA? Isso enfraquece a segurança da conta.')) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword, code: disableCode.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        throw new Error((body as { message?: string } | null)?.message ?? 'Falha ao desativar');
      }
      setDisablePassword(''); setDisableCode('');
      void loadStatus();
      setMessage('2FA desativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally { setLoading(false); }
  }

  async function regenerateBackupCodes() {
    if (!regenCode) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await adminApiFetch(`${apiUrl}/admin/auth/2fa/regenerate-backup-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: regenCode.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null as unknown);
        throw new Error((body as { message?: string } | null)?.message ?? 'Falha');
      }
      const data = (await res.json()) as { backupCodes: string[] };
      setBackupCodes(data.backupCodes);
      setRegenCode('');
      void loadStatus();
      setMessage('Backup codes regenerados — guarde a nova lista.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally { setLoading(false); }
  }

  return (
    <main className='min-h-screen bg-[#070a11] text-white'>
      <div className='mx-auto max-w-3xl px-4 py-6 sm:px-6'>
        <div className='flex items-center gap-3 mb-6'>
          <a href='/admin' className='flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10'>
            <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
            </svg>
          </a>
          <h1 className='text-2xl font-bold'>Segurança da conta admin</h1>
        </div>

        {message && (
          <div className='mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'>{message}</div>
        )}
        {error && (
          <div className='mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300'>{error}</div>
        )}

        {/* Status banner */}
        <div className={`rounded-2xl border p-5 mb-6 ${
          status?.enabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
        }`}>
          <div className='flex items-center gap-3'>
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              status?.enabled ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            }`}>
              <svg className={`w-5 h-5 ${status?.enabled ? 'text-emerald-400' : 'text-amber-400'}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' />
              </svg>
            </div>
            <div>
              <p className='font-bold text-base'>
                {status?.enabled ? 'Autenticação em 2 fatores ativa' : 'Sua conta NÃO tem 2FA'}
              </p>
              <p className='text-xs text-white/60 mt-0.5'>
                {status?.enabled
                  ? `${status.backupCodesRemaining} backup code(s) restantes`
                  : 'Recomendado: ative 2FA TOTP (Google Authenticator, Authy, 1Password, etc.)'}
              </p>
            </div>
          </div>
        </div>

        {/* Setup flow */}
        {!status?.enabled && !setupData && !backupCodes && (
          <section className='rounded-2xl border border-white/10 bg-[#101525] p-5 mb-6'>
            <h2 className='font-semibold mb-2'>Ativar 2FA</h2>
            <p className='text-xs text-white/60 mb-4'>
              Ao clicar abaixo, geramos um secret TOTP. Você escaneia o QR code com seu app autenticador
              e confirma com o primeiro código de 6 dígitos.
            </p>
            <button onClick={startSetup} disabled={loading} className='rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50'>
              {loading ? 'Gerando...' : 'Iniciar setup'}
            </button>
          </section>
        )}

        {setupData && (
          <section className='rounded-2xl border border-blue-500/30 bg-blue-500/[0.03] p-5 mb-6 space-y-4'>
            <h2 className='font-semibold'>Escaneie o QR code</h2>
            <div className='flex justify-center'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setupData.qrPng} alt='QR code 2FA' className='w-56 h-56 bg-white rounded-lg' />
            </div>
            <div className='rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2.5'>
              <p className='text-[10px] uppercase tracking-widest text-white/40'>Não consegue escanear? Cole este código manualmente</p>
              <p className='mt-1 font-mono text-xs break-all text-white/80'>{setupData.secret}</p>
            </div>
            <div>
              <label className='block text-xs font-semibold text-white/60 mb-1'>Código gerado pelo app (6 dígitos)</label>
              <input
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                inputMode='numeric'
                placeholder='123456'
                className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2.5 text-center font-mono text-lg tracking-widest text-white outline-none focus:border-white/30'
              />
            </div>
            <div className='flex gap-2'>
              <button onClick={confirmSetup} disabled={loading || !verifyCode} className='flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50'>
                {loading ? 'Verificando...' : 'Confirmar e ativar'}
              </button>
              <button onClick={() => { setSetupData(null); setVerifyCode(''); }} className='rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10'>
                Cancelar
              </button>
            </div>
          </section>
        )}

        {backupCodes && (
          <section className='rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-5 mb-6'>
            <div className='flex items-center gap-2 mb-3'>
              <svg className='w-5 h-5 text-amber-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              <h2 className='font-bold text-amber-200'>Salve estes backup codes AGORA</h2>
            </div>
            <p className='text-xs text-amber-100/80 mb-3'>
              Cada code só pode ser usado 1 vez. <strong>Esta tela não vai aparecer de novo.</strong> Imprima,
              guarde no gerenciador de senhas, ou anote em local seguro. Use eles se perder seu celular.
            </p>
            <div className='grid grid-cols-2 gap-2 mb-3'>
              {backupCodes.map((c) => (
                <div key={c} className='rounded-md bg-black/30 px-3 py-2 font-mono text-sm text-amber-100 text-center'>
                  {c}
                </div>
              ))}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
              className='rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 mr-2'
            >
              Copiar todos
            </button>
            <button onClick={() => setBackupCodes(null)} className='rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400'>
              Já salvei, fechar
            </button>
          </section>
        )}

        {status?.enabled && !setupData && (
          <>
            <section className='rounded-2xl border border-white/10 bg-[#101525] p-5 mb-6'>
              <h2 className='font-semibold mb-3'>Regenerar backup codes</h2>
              <p className='text-xs text-white/60 mb-3'>
                Gera uma nova lista. Os anteriores são invalidados.
              </p>
              <div className='flex gap-2'>
                <input
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value)}
                  placeholder='Código TOTP atual'
                  inputMode='numeric'
                  className='flex-1 rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30'
                />
                <button onClick={regenerateBackupCodes} disabled={loading || !regenCode} className='rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-50'>
                  Regenerar
                </button>
              </div>
            </section>

            <section className='rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5 mb-6'>
              <h2 className='font-semibold mb-3 text-red-300'>Desativar 2FA</h2>
              <p className='text-xs text-white/60 mb-3'>
                Requer senha + código TOTP atual. Não recomendado.
              </p>
              <div className='space-y-2'>
                <input
                  type='password'
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder='Sua senha'
                  className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2 text-sm text-white outline-none focus:border-white/30'
                />
                <input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder='Código TOTP atual'
                  inputMode='numeric'
                  className='w-full rounded-lg border border-white/10 bg-[#0a0f1a] px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30'
                />
                <button onClick={disable2fa} disabled={loading || !disablePassword || !disableCode} className='w-full rounded-lg bg-red-500/80 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50'>
                  Desativar 2FA
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
