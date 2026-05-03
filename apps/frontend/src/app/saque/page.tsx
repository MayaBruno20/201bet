'use client';

import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { VerificationBanner } from '@/components/site/verification-banner';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type Withdrawal = { id: string; amount: number; status: string; createdAt: string };

const PIX_KEY_TYPES = [
  { value: 'document', label: 'CPF / CNPJ' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'evp', label: 'Chave aleatória' },
] as const;

function traduzirStatus(status: string) {
  const mapa: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovado', FAILED: 'Falhou', CANCELED: 'Cancelado' };
  return mapa[status] ?? status;
}

function statusClass(status: string) {
  switch (status) {
    case 'APPROVED': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'PENDING': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    case 'CANCELED': case 'FAILED': return 'bg-red-500/15 text-red-400 border-red-500/20';
    default: return 'bg-white/10 text-white/50 border-white/10';
  }
}

export default function SaquePage() {
  const [sessionOk, setSessionOk] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(0);
  const [confirmedDeposits, setConfirmedDeposits] = useState(0);
  const [amount, setAmount] = useState('');
  const [pixKeyType, setPixKeyType] = useState('document');
  const [pixKey, setPixKey] = useState('');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void loadData();
    // Polling automatico para refresh de status de saques pendentes
    const interval = setInterval(() => { void loadData(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [summaryRes, withdrawRes, meRes] = await Promise.all([
        apiFetch(`${apiUrl}/payments/summary`, { cache: 'no-store' }),
        apiFetch(`${apiUrl}/payments/withdrawals`, { cache: 'no-store' }),
        apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' }),
      ]);
      if (!summaryRes.ok) {
        clearClientSession();
        setSessionOk(false);
        return;
      }
      setSessionOk(true);
      const summary = await summaryRes.json();
      setBalance(summary.balance);
      setConfirmedDeposits(summary.confirmedDeposits);
      if (withdrawRes.ok) setWithdrawals(await withdrawRes.json());
      if (meRes.ok) {
        const me = (await meRes.json()) as { emailVerified?: boolean };
        setEmailVerified(me.emailVerified ?? false);
      }
    } catch { /* ignore */ }
    finally { setSessionChecked(true); }
  }

  const numericAmount = parseFloat(amount.replace(',', '.')) || 0;

  function handleAmountChange(value: string) {
    setAmount(value.replace(/[^\d,]/g, ''));
    setError(''); setSuccess('');
  }

  function pixKeyPlaceholder() {
    switch (pixKeyType) {
      case 'document': return '000.000.000-00';
      case 'phone': return '+5511999999999';
      case 'email': return 'seu@email.com';
      case 'evp': return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
      default: return '';
    }
  }

  async function handleWithdraw() {
    if (!sessionOk) return;
    if (numericAmount < 20) { setError('Saque mínimo de R$ 20,00'); return; }
    if (numericAmount > balance) { setError('Saldo insuficiente'); return; }
    if (!pixKey.trim()) { setError('Informe sua chave PIX'); return; }

    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await apiFetch(`${apiUrl}/payments/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numericAmount, pixKeyType, pixKey: pixKey.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 403 && body?.code === 'EMAIL_NOT_VERIFIED') {
          setEmailVerified(false);
          throw new Error(body.message || 'Confirme seu e-mail para liberar saques.');
        }
        throw new Error(body?.message || 'Falha ao solicitar saque');
      }
      const data = await res.json();
      setBalance(data.balance);
      setAmount(''); setPixKey('');
      setSuccess('Saque solicitado com sucesso! O PIX será enviado em instantes.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar saque');
    } finally {
      setLoading(false);
    }
  }

  if (!sessionChecked) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
          <MainNav />
          <div className='mt-16 flex flex-col items-center justify-center gap-3 text-white/50'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
            <p className='text-sm'>Carregando...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!sessionOk) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-3xl border border-white/10 bg-amber-500/5 p-4 sm:p-6 backdrop-blur-md'>
            <h1 className='text-2xl font-semibold'>Login necessário</h1>
            <p className='mt-2 text-white/50'>Entre com sua conta para solicitar saque.</p>
            <a href='/login' className='mt-4 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]'>Ir para login</a>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-[#090b11] pb-10 text-white'>
      <div className='mx-auto max-w-2xl px-4 py-6 sm:px-6'>
        <MainNav />

        <VerificationBanner hidden={emailVerified !== false} message='Depósitos, saques e apostas ficam bloqueados até você confirmar o e-mail.' />

        {/* Header */}
        <div className='flex items-center gap-3 mb-6'>
          <a href='/carteira?tab=transacoes' className='flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10'>
            <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
            </svg>
          </a>
          <h1 className='text-2xl font-bold tracking-tight'>Solicitar Saque</h1>
        </div>

        {/* Balance Card */}
        <div className='rounded-2xl border border-white/10 bg-[#101525] p-5 mb-6'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-sm text-white/50'>Saldo disponível para saque</span>
            <span className='text-xl font-bold text-[#00d0a2]'>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}
            </span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-sm text-white/50'>Depósitos confirmados (PIX/manual)</span>
            <span className='text-lg font-bold'>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(confirmedDeposits)}
            </span>
          </div>
        </div>

        {/* Withdraw Form */}
        <section className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6 mb-6'>
          <label className='block text-sm text-white/50 mb-2'>Valor do saque (R$)</label>
          <input type='text' inputMode='decimal' className='field text-lg mb-4' placeholder='0,00' value={amount} onChange={(e) => handleAmountChange(e.target.value)} />

          <label className='block text-sm text-white/50 mb-2'>Tipo de chave PIX</label>
          <div className='grid grid-cols-2 gap-2 mb-4'>
            {PIX_KEY_TYPES.map((kt) => (
              <button
                key={kt.value}
                type='button'
                onClick={() => { setPixKeyType(kt.value); setPixKey(''); }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                  pixKeyType === kt.value
                    ? 'border-[#00d0a2]/40 bg-[#00d0a2]/10 text-[#00d0a2]'
                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                {kt.label}
              </button>
            ))}
          </div>

          <label className='block text-sm text-white/50 mb-2'>Chave PIX</label>
          <input type='text' className='field mb-3' placeholder={pixKeyPlaceholder()} value={pixKey} onChange={(e) => { setPixKey(e.target.value); setError(''); setSuccess(''); }} />

          <div className='flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 mb-5'>
            <svg className='h-4 w-4 text-red-400 shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
            <p className='text-xs text-red-300 leading-relaxed'>
              <strong className='font-semibold text-red-200'>Atenção:</strong> a chave PIX informada precisa estar cadastrada no <strong>mesmo CPF da sua conta na 201Bet</strong>. Saques para chaves vinculadas a outro CPF serão recusados.
            </p>
          </div>

          {error && <p className='text-sm text-red-400 mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2'>{error}</p>}
          {success && <p className='text-sm text-emerald-400 mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2'>{success}</p>}

          <button type='button' onClick={handleWithdraw} disabled={loading || numericAmount < 20 || !pixKey.trim() || emailVerified === false} className='w-full rounded-xl bg-[#d4a843] px-6 py-3.5 text-base font-bold text-[#04111d] transition-all hover:bg-[#e0b84d] disabled:opacity-50 flex items-center justify-center gap-2'>
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M19 14l-7 7m0 0l-7-7m7 7V3' />
            </svg>
            {loading ? 'Processando...' : emailVerified === false ? 'Confirme o e-mail para sacar' : 'Solicitar saque'}
          </button>
        </section>

        {/* Withdrawal History */}
        <section className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
          <h2 className='text-lg font-semibold mb-4'>Histórico de saques</h2>
          {!withdrawals.length ? (
            <div className='rounded-2xl border border-dashed border-white/10 p-8 text-center'>
              <p className='text-white/40'>Nenhum saque registrado.</p>
            </div>
          ) : (
            <div className='space-y-3'>
              {withdrawals.map((w) => (
                <div key={w.id} className='flex items-center justify-between rounded-xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-4 transition-colors hover:border-white/15'>
                  <div>
                    <p className='text-base font-semibold text-red-400'>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(w.amount)}
                    </p>
                    <p className='text-xs text-white/40 mt-0.5'>
                      {new Date(w.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(w.status)}`}>
                    {traduzirStatus(w.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
