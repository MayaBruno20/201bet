'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { VerificationBanner } from '@/components/site/verification-banner';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();
const QUICK_VALUES = [20, 50, 100, 200, 500, 1000];

type Step = 'valor' | 'pix' | 'confirmado';

export default function DepositoPage() {
  const [sessionOk, setSessionOk] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('valor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // PIX data from Valut
  const [pixQrCode, setPixQrCode] = useState('');
  const [pixBase64, setPixBase64] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [summaryRes, meRes] = await Promise.all([
          apiFetch(`${apiUrl}/payments/summary`, { cache: 'no-store' }),
          apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' }),
        ]);
        if (!summaryRes.ok) {
          clearClientSession();
          setSessionOk(false);
          return;
        }
        setSessionOk(true);
        const data = await summaryRes.json();
        setBalance(data.balance);
        if (meRes.ok) {
          const me = (await meRes.json()) as { emailVerified?: boolean };
          setEmailVerified(me.emailVerified ?? false);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const numericAmount = parseFloat(amount.replace(',', '.')) || 0;

  function handleAmountChange(value: string) {
    setAmount(value.replace(/[^\d,]/g, ''));
    setError('');
  }

  function selectQuickValue(val: number) {
    setAmount(val.toFixed(2).replace('.', ','));
    setError('');
  }

  const startPolling = useCallback((pId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`${apiUrl}/payments/deposit/${pId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'APPROVED') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (typeof data.balance === 'number') setBalance(data.balance);
          setStep('confirmado');
          if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
        } else if (data.status === 'FAILED' || data.status === 'CANCELED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(data.status === 'FAILED' ? 'Pagamento falhou. Gere um novo PIX.' : 'Pagamento cancelado.');
          setStep('valor');
        }
      } catch { /* ignore */ }
    }, 5000);
  }, []);

  async function handleGeneratePix() {
    if (numericAmount < 20) { setError('Depósito mínimo de R$ 20,00'); return; }
    if (numericAmount > 1000) { setError('Depósito máximo de R$ 1.000,00 por operação'); return; }
    if (!sessionOk) return;

    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${apiUrl}/payments/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: numericAmount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 403 && body?.code === 'EMAIL_NOT_VERIFIED') {
          setEmailVerified(false);
          throw new Error(body.message || 'Confirme seu e-mail para liberar depósitos.');
        }
        throw new Error(body?.message || 'Falha ao gerar PIX');
      }
      const data = await res.json();
      setPaymentId(data.paymentId);
      setPixQrCode(data.qrcode);
      setPixBase64(data.base64);
      setStep('pix');
      startPolling(data.paymentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  }

  async function copyPixCode() {
    try {
      await navigator.clipboard.writeText(pixQrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  if (!sessionOk) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-3xl border border-white/10 bg-amber-500/5 p-4 sm:p-6 backdrop-blur-md'>
            <h1 className='text-2xl font-semibold'>Login necessário</h1>
            <p className='mt-2 text-white/50'>Entre com sua conta para depositar.</p>
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

        <VerificationBanner hidden={emailVerified !== false} />

        {/* Header */}
        <div className='flex items-center gap-3 mb-6'>
          <a href='/carteira?tab=transacoes' className='flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10'>
            <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
            </svg>
          </a>
          <h1 className='text-2xl font-bold tracking-tight'>Depositar via PIX</h1>
        </div>

        {/* Balance Card */}
        <div className='rounded-2xl border border-white/10 bg-[#101525] p-5 flex items-center justify-between mb-6'>
          <span className='text-sm text-white/50'>Saldo</span>
          <span className='text-2xl font-bold'>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}
          </span>
        </div>

        {/* Steps Indicator */}
        <div className='flex items-center justify-center gap-0 mb-6'>
          {[
            { key: 'valor', label: 'Valor', num: 1 },
            { key: 'pix', label: 'PIX', num: 2 },
            { key: 'confirmado', label: 'Confirmado', num: 3 },
          ].map((s, i) => {
            const isActive = s.key === step;
            const isPast = (step === 'pix' && s.key === 'valor') || (step === 'confirmado' && s.key !== 'confirmado');
            return (
              <div key={s.key} className='flex items-center'>
                {i > 0 && <div className={`h-px w-10 sm:w-16 ${isPast || isActive ? 'bg-[#00d0a2]' : 'bg-white/10'}`} />}
                <div className='flex items-center gap-2'>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isActive ? 'bg-[#00d0a2] text-[#04111d]' : isPast ? 'bg-[#00d0a2]/20 text-[#00d0a2]' : 'bg-white/10 text-white/40'}`}>
                    {isPast ? (
                      <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}><path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' /></svg>
                    ) : s.num}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-white/40'}`}>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Valor */}
        {step === 'valor' && (
          <section className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
            <div className='flex items-center gap-2 mb-5'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d0a2]/10'>
                <svg className='h-4 w-4 text-[#00d0a2]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
              </div>
              <h2 className='text-lg font-semibold'>Selecione o valor</h2>
            </div>

            <label className='block text-sm text-white/50 mb-2'>Valor do depósito (R$)</label>
            <div className='mb-4 flex items-center gap-2 rounded-[0.625rem] border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors focus-within:border-white/30 focus-within:bg-white/[0.07]'>
              <span className='text-sm text-white/40 font-medium select-none'>R$</span>
              <input
                type='text'
                inputMode='decimal'
                className='flex-1 min-w-0 bg-transparent text-lg text-white outline-none placeholder:text-white/40'
                placeholder='0,00'
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
              />
            </div>

            <div className='grid grid-cols-3 gap-2 mb-5'>
              {QUICK_VALUES.map((val) => (
                <button key={val} type='button' onClick={() => selectQuickValue(val)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${numericAmount === val ? 'border-[#00d0a2]/40 bg-[#00d0a2]/10 text-[#00d0a2]' : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]'}`}>
                  R$ {val}
                </button>
              ))}
            </div>

            <div className='flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-5'>
              <svg className='h-4 w-4 text-amber-400 shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              <p className='text-xs text-amber-400/80'>Depósito mínimo de R$ 20,00 e máximo de R$ 1.000,00 por operação.</p>
            </div>

            {error && <p className='text-sm text-red-400 mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2'>{error}</p>}

            <button type='button' onClick={handleGeneratePix} className='w-full rounded-xl bg-[#d4a843] px-6 py-3.5 text-base font-bold text-[#04111d] transition-all hover:bg-[#e0b84d] disabled:opacity-50' disabled={numericAmount < 20 || loading || emailVerified === false}>
              {loading ? 'Gerando PIX...' : emailVerified === false ? 'Confirme o e-mail para depositar' : 'Gerar PIX'}
            </button>
          </section>
        )}

        {/* Step 2: PIX QR Code */}
        {step === 'pix' && (
          <section className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
            <div className='flex items-center gap-2 mb-5'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d0a2]/10'>
                <svg className='h-4 w-4 text-[#00d0a2]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' />
                </svg>
              </div>
              <h2 className='text-lg font-semibold'>Pague o PIX</h2>
            </div>

            <div className='rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4 text-center'>
              <p className='text-sm text-white/50 mb-1'>Valor do depósito</p>
              <p className='text-2xl font-bold text-[#00d0a2]'>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericAmount)}
              </p>
            </div>

            {/* QR Code Image */}
            {pixBase64 && (
              <div className='flex justify-center mb-4'>
                <div className='rounded-2xl bg-white p-4'>
                  <img src={`data:image/png;base64,${pixBase64}`} alt='QR Code PIX' className='h-48 w-48' />
                </div>
              </div>
            )}

            {/* Copia e Cola */}
            <div className='rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4'>
              <p className='text-sm text-white/50 mb-2'>PIX Copia e Cola</p>
              <p className='break-all text-xs text-white/70 font-mono leading-relaxed'>{pixQrCode}</p>
            </div>

            <button type='button' onClick={copyPixCode} className='w-full rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold transition-all hover:bg-white/10 mb-3'>
              {copied ? 'Copiado!' : 'Copiar código PIX'}
            </button>

            {/* Polling indicator */}
            <div className='flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-3'>
              <div className='h-2 w-2 rounded-full bg-amber-400 animate-pulse' />
              <p className='text-xs text-amber-400/80'>Aguardando confirmação do pagamento...</p>
            </div>

            {error && <p className='text-sm text-red-400 mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2'>{error}</p>}

            <button type='button' onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep('valor'); setError(''); }} className='w-full rounded-xl border border-white/10 bg-transparent px-6 py-3 text-sm font-medium text-white/50 transition-all hover:bg-white/5'>
              Cancelar e voltar
            </button>
          </section>
        )}

        {/* Step 3: Confirmado */}
        {step === 'confirmado' && (
          <section className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6 text-center'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00d0a2]/10'>
              <svg className='h-8 w-8 text-[#00d0a2]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
              </svg>
            </div>
            <h2 className='text-xl font-bold mb-2'>Depósito confirmado!</h2>
            <p className='text-white/50 mb-1'>
              Valor: <span className='text-[#00d0a2] font-semibold'>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericAmount)}</span>
            </p>
            <p className='text-white/50 mb-6'>
              Novo saldo: <span className='text-white font-semibold'>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}</span>
            </p>
            <div className='flex flex-col gap-2'>
              <a href='/deposito' className='rounded-xl bg-[#d4a843] px-6 py-3 text-base font-bold text-[#04111d] transition-all hover:bg-[#e0b84d]'>Novo depósito</a>
              <a href='/carteira?tab=transacoes' className='rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold transition-all hover:bg-white/10'>Ver transações</a>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
