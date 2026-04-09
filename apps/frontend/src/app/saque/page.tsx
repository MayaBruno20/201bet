'use client';

import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { getAuthToken, clearAuthToken } from '@/lib/auth';
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
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [confirmedDeposits, setConfirmedDeposits] = useState(0);
  const [amount, setAmount] = useState('');
  const [pixKeyType, setPixKeyType] = useState('document');
  const [pixKey, setPixKey] = useState('');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { setToken(getAuthToken()); }, []);
  useEffect(() => { if (token) void loadData(); }, [token]);

  async function loadData() {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, withdrawRes] = await Promise.all([
        fetch(`${apiUrl}/payments/summary`, { headers, cache: 'no-store' }),
        fetch(`${apiUrl}/payments/withdrawals`, { headers, cache: 'no-store' }),
      ]);
      if (!summaryRes.ok) { clearAuthToken(); setToken(null); return; }
      const summary = await summaryRes.json();
      setBalance(summary.balance);
      setConfirmedDeposits(summary.confirmedDeposits);
      if (withdrawRes.ok) setWithdrawals(await withdrawRes.json());
    } catch { /* ignore */ }
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
    if (!token) return;
    if (numericAmount < 20) { setError('Saque mínimo de R$ 20,00'); return; }
    if (numericAmount > balance) { setError('Saldo insuficiente'); return; }
    if (!pixKey.trim()) { setError('Informe sua chave PIX'); return; }

    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${apiUrl}/payments/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: numericAmount, pixKeyType, pixKey: pixKey.trim() }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Falha ao solicitar saque');
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

  if (!token) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-3xl border border-white/10 bg-amber-500/5 p-6 backdrop-blur-md'>
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
        <section className='rounded-2xl border border-white/10 bg-[#101525] p-6 mb-6'>
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
          <input type='text' className='field mb-5' placeholder={pixKeyPlaceholder()} value={pixKey} onChange={(e) => { setPixKey(e.target.value); setError(''); setSuccess(''); }} />

          {error && <p className='text-sm text-red-400 mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2'>{error}</p>}
          {success && <p className='text-sm text-emerald-400 mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2'>{success}</p>}

          <button type='button' onClick={handleWithdraw} disabled={loading || numericAmount < 20 || !pixKey.trim()} className='w-full rounded-xl bg-[#d4a843] px-6 py-3.5 text-base font-bold text-[#04111d] transition-all hover:bg-[#e0b84d] disabled:opacity-50 flex items-center justify-center gap-2'>
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M19 14l-7 7m0 0l-7-7m7 7V3' />
            </svg>
            {loading ? 'Processando...' : 'Solicitar saque'}
          </button>
        </section>

        {/* Withdrawal History */}
        <section className='rounded-2xl border border-white/10 bg-[#101525] p-6'>
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
