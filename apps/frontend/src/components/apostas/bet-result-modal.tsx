'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X as XIcon, AlertCircle, Sparkles } from 'lucide-react';

/**
 * 201bet · /apostas — BetResultModal
 * Centered overlay shown after submitting a slip.
 */

export type BetResultSide = 'LEFT' | 'RIGHT';

export interface BetResult {
  duelId: string;
  label: string;
  side: BetResultSide;
  ok: boolean;
  message: string;
  potentialWin?: number;
}

export interface BetResultModalProps {
  results?: BetResult[];
  onClose: () => void;
  open?: boolean;
  className?: string;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BetResultModal({
  results = [],
  onClose,
  open = true,
  className = '',
}: BetResultModalProps) {
  const okCount = results.filter((r) => r.ok).length;
  const total = results.length;
  const allOk = okCount === total && total > 0;
  const noneOk = okCount === 0 && total > 0;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const successPotential = results
    .filter((r) => r.ok && typeof r.potentialWin === 'number')
    .reduce((acc, r) => acc + (r.potentialWin ?? 0), 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='backdrop'
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-modal='true'
          role='dialog'
          aria-labelledby='bet-result-title'
        >
          <button
            type='button'
            aria-label='Fechar'
            onClick={onClose}
            className='absolute inset-0 bg-black/70 backdrop-blur-sm'
          />

          <motion.div
            key='panel'
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className='
              relative w-full max-w-md rounded-3xl
              border border-white/10 bg-[#101525]
              shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)]
              overflow-hidden
            '
          >
            <div className={`h-px w-full ${allOk ? 'bg-[linear-gradient(90deg,transparent,rgba(33,217,122,0.7),transparent)]' : noneOk ? 'bg-[linear-gradient(90deg,transparent,rgba(255,90,108,0.7),transparent)]' : 'bg-[linear-gradient(90deg,transparent,rgba(255,176,40,0.7),transparent)]'}`} />

            <div className='relative p-5 sm:p-6'>
              <button
                type='button'
                onClick={onClose}
                aria-label='Fechar'
                className='absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-[#b8bcc9] hover:bg-white/[0.08] hover:text-white transition-colors'
              >
                <XIcon className='h-4 w-4' />
              </button>

              <div className='flex items-center gap-3 mb-2'>
                <HeroBadge allOk={allOk} noneOk={noneOk} />
                <div>
                  <div className='text-[11px] uppercase tracking-[0.18em] text-[#767b8a] font-semibold'>
                    {allOk ? 'Bilhete enviado' : noneOk ? 'Nenhuma confirmada' : 'Bilhete parcial'}
                  </div>
                  <h2
                    id='bet-result-title'
                    className='font-display text-xl sm:text-2xl font-bold tracking-tight text-[#f1f3f8] leading-tight'
                  >
                    {okCount} de {total} apostas confirmadas
                  </h2>
                </div>
              </div>

              {okCount > 0 && successPotential > 0 && (
                <div className='mt-4 rounded-2xl bg-[#0b0e18] border border-white/[0.06] p-3.5 flex items-center justify-between'>
                  <div>
                    <div className='text-[11px] uppercase tracking-wider text-[#767b8a]'>Retorno potencial total</div>
                    <div className='font-mono text-2xl font-semibold tabular-nums text-[#21d97a] leading-tight'>
                      {formatBRL(successPotential)}
                    </div>
                  </div>
                  <Sparkles className='h-5 w-5 text-[#21d97a]' />
                </div>
              )}
            </div>

            <ul className='px-5 sm:px-6 pb-4 max-h-[50vh] overflow-y-auto space-y-2 [-ms-overflow-style:none] [scrollbar-width:thin]'>
              {results.map((r) => (
                <ResultRow key={r.duelId} result={r} />
              ))}
            </ul>

            <div className='border-t border-white/[0.06] p-5 sm:p-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between'>
              <p className='text-[11px] text-[#767b8a] leading-relaxed max-w-xs'>
                Você pode acompanhar o andamento em <span className='text-[#b8bcc9] font-medium'>Meus bilhetes</span>.
              </p>
              <button
                type='button'
                onClick={onClose}
                className='h-11 px-5 rounded-xl font-display font-semibold text-[14px] text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] shadow-[0_10px_26px_-10px_rgba(255,138,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-[1.04] active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60'
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HeroBadge({ allOk, noneOk }: { allOk: boolean; noneOk: boolean }) {
  if (allOk) {
    return (
      <span className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(33,217,122,0.12)] text-[#21d97a] ring-1 ring-[rgba(33,217,122,0.35)]'>
        <Check className='h-5 w-5' strokeWidth={2.4} />
      </span>
    );
  }
  if (noneOk) {
    return (
      <span className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(255,90,108,0.12)] text-[#ff5a6c] ring-1 ring-[rgba(255,90,108,0.35)]'>
        <AlertCircle className='h-5 w-5' strokeWidth={2.4} />
      </span>
    );
  }
  return (
    <span className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(255,176,40,0.12)] text-[#ffb028] ring-1 ring-[rgba(255,176,40,0.35)]'>
      <AlertCircle className='h-5 w-5' strokeWidth={2.4} />
    </span>
  );
}

function ResultRow({ result }: { result: BetResult }) {
  const isLeft = result.side === 'LEFT';
  const sideText = isLeft ? 'text-[#60a5fa]' : 'text-[#fb923c]';
  const sideLabel = isLeft ? 'Piloto A' : 'Piloto B';
  return (
    <li
      className={`
        rounded-xl border p-3
        ${result.ok
          ? 'border-[rgba(33,217,122,0.20)] bg-[rgba(33,217,122,0.04)]'
          : 'border-[rgba(255,90,108,0.20)] bg-[rgba(255,90,108,0.04)]'}
      `}
    >
      <div className='flex items-start gap-3'>
        <span
          className={`
            inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0
            ${result.ok ? 'bg-[rgba(33,217,122,0.15)] text-[#21d97a]' : 'bg-[rgba(255,90,108,0.15)] text-[#ff5a6c]'}
          `}
          aria-hidden
        >
          {result.ok ? <Check className='h-3.5 w-3.5' strokeWidth={3} /> : <XIcon className='h-3.5 w-3.5' strokeWidth={3} />}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 mb-0.5'>
            <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${sideText}`}>
              {sideLabel}
            </span>
            <span className='text-[10px] uppercase tracking-wider text-[#767b8a]'>
              {result.ok ? 'confirmada' : 'falhou'}
            </span>
          </div>
          <div className='text-[14px] text-[#f1f3f8] font-medium leading-tight truncate' title={result.label}>
            {result.label}
          </div>
          <div className='text-[12px] text-[#767b8a] mt-0.5'>{result.message}</div>
        </div>
        {result.ok && typeof result.potentialWin === 'number' && (
          <div className='text-right shrink-0'>
            <div className='text-[10px] uppercase tracking-wider text-[#767b8a]'>retorno</div>
            <div className='font-mono text-[15px] font-semibold tabular-nums text-[#21d97a]'>
              {formatBRL(result.potentialWin)}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export default BetResultModal;
