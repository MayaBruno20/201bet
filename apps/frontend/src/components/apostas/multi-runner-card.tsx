'use client';

import * as React from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, Plus, Wallet, Lock } from 'lucide-react';

import { CountdownPill } from '@/components/home/countdown-pill';

/**
 * 201bet · /apostas — MultiRunnerCard
 * Market with 3+ competing runners (Vencedor Geral / Reação / Queimada).
 */

export type MultiRunnerMarketType = 'WINNER' | 'BEST_REACTION' | 'FALSE_START';

export interface Runner {
  oddId: string;
  label: string;
  odd: number;
  pool: number;
  /** 0–1 — fraction of total pool sitting on this runner */
  poolShare: number;
  tickets: number;
  photoUrl?: string | null;
}

export interface MultiRunnerMarket {
  id: string;
  marketName: string;
  marketType: MultiRunnerMarketType;
  totalPool: number;
  status: string;
  closeInSeconds: number;
  runners: Runner[];
}

export interface MultiRunnerCardProps {
  market: MultiRunnerMarket;
  selectedOddId?: string | null;
  onPick?: (oddId: string) => void;
  onPlaceBet?: (oddId: string, stake: number) => void | Promise<void>;
  userLoggedIn?: boolean;
  minBet?: number;
  className?: string;
}

const QUICK_AMOUNTS = [5, 10, 50, 100];

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatBRLShort(n: number): string {
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return formatBRL(n);
}
function formatOdd(odd: number): string {
  return `@${odd.toFixed(2).replace('.', ',')}`;
}

const MARKET_TYPE_LABEL: Record<MultiRunnerMarketType, string> = {
  WINNER: 'Vencedor geral',
  BEST_REACTION: 'Melhor reação',
  FALSE_START: 'Queima de largada',
};

function AnimatedOdd({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (latest: number) => formatOdd(latest));
  React.useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className={className}>{display as unknown as React.ReactNode}</motion.span>;
}

export function MultiRunnerCard({
  market,
  selectedOddId,
  onPick,
  onPlaceBet,
  userLoggedIn = false,
  minBet = 10,
  className = '',
}: MultiRunnerCardProps) {
  const [stake, setStake] = React.useState<number>(minBet);
  const [submitting, setSubmitting] = React.useState(false);

  const closeAt = React.useMemo(
    () => new Date(Date.now() + market.closeInSeconds * 1000),
    [market.closeInSeconds, market.id],
  );

  const selectedRunner = market.runners.find((r) => r.oddId === selectedOddId) ?? null;
  const potentialReturn = selectedRunner ? stake * selectedRunner.odd : 0;

  const handleAdd = (amt: number) =>
    setStake((s) => Math.max(minBet, Math.min(99999, s + amt)));

  const handleSubmit = async () => {
    if (!selectedRunner || submitting) return;
    setSubmitting(true);
    try {
      await onPlaceBet?.(selectedRunner.oddId, stake);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`
        relative rounded-2xl border border-white/10 bg-[#101525]
        overflow-hidden
        ${className}
      `}
    >
      <div className='flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-white/[0.06]'>
        <div className='min-w-0'>
          <div className='text-[10px] uppercase tracking-[0.18em] text-[#ffb028] font-semibold mb-1'>
            {MARKET_TYPE_LABEL[market.marketType]}
          </div>
          <h3 className='font-display text-lg sm:text-xl font-semibold text-[#f1f3f8] tracking-tight truncate'>
            {market.marketName}
          </h3>
          <div className='mt-1 flex items-center gap-2 text-[11px] text-[#767b8a]'>
            <span>
              Pote{' '}
              <span className='font-mono text-[#b8bcc9] tabular-nums'>
                {formatBRLShort(market.totalPool)}
              </span>
            </span>
            <span className='text-white/15'>·</span>
            <span>{market.runners.length} pilotos</span>
          </div>
        </div>
        <CountdownPill targetDate={closeAt} label='fecha em' />
      </div>

      <ul className='divide-y divide-white/[0.05]'>
        {market.runners.map((runner) => {
          const isSelected = runner.oddId === selectedOddId;
          return (
            <li key={runner.oddId}>
              <button
                type='button'
                onClick={() => onPick?.(runner.oddId)}
                aria-pressed={isSelected}
                className={`
                  group w-full flex items-center gap-3 sm:gap-4
                  px-4 sm:px-5 py-3 text-left
                  transition-colors
                  ${isSelected
                    ? 'bg-[rgba(255,176,40,0.08)]'
                    : 'hover:bg-white/[0.03]'}
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-inset
                `}
              >
                <RunnerAvatar label={runner.label} photoUrl={runner.photoUrl} />

                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2 mb-1'>
                    <span className='text-[14px] text-[#f1f3f8] font-medium truncate'>
                      {runner.label}
                    </span>
                    {isSelected && (
                      <span className='inline-flex h-1.5 w-1.5 rounded-full bg-[#ffb028]' aria-hidden />
                    )}
                  </div>
                  <PoolShareBar share={runner.poolShare} />
                  <div className='mt-1 flex items-center gap-3 text-[11px] text-[#767b8a]'>
                    <span className='font-mono tabular-nums'>
                      {(runner.poolShare * 100).toFixed(0)}% do pote
                    </span>
                    <span className='text-white/15'>·</span>
                    <span className='font-mono tabular-nums'>
                      {runner.tickets} apostas
                    </span>
                    <span className='text-white/15'>·</span>
                    <span className='font-mono tabular-nums'>{formatBRLShort(runner.pool)}</span>
                  </div>
                </div>

                <div className='text-right shrink-0'>
                  <div className={`font-mono text-xl sm:text-[22px] font-bold tabular-nums ${isSelected ? 'text-[#ffb028]' : 'text-[#f1f3f8] group-hover:text-[#ffb028]'} transition-colors`}>
                    <AnimatedOdd value={runner.odd} />
                  </div>
                  <div className='text-[10px] uppercase tracking-wider text-[#767b8a]'>cotação</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className='grid transition-[grid-template-rows,opacity] duration-300 ease-out'
        style={{ gridTemplateRows: selectedRunner ? '1fr' : '0fr', opacity: selectedRunner ? 1 : 0 }}
      >
        <div className='overflow-hidden'>
          {selectedRunner && (
            <div className='border-t border-white/[0.06] bg-[#0b0f1c] p-4 sm:p-5'>
              <div className='flex items-center justify-between gap-3 mb-3'>
                <div className='text-[12px] text-[#b8bcc9]'>
                  Apostando em{' '}
                  <span className='text-[#f1f3f8] font-medium'>{selectedRunner.label}</span>{' '}
                  <span className='font-mono text-[#ffb028] tabular-nums'>
                    {formatOdd(selectedRunner.odd)}
                  </span>
                </div>
              </div>

              <div className='flex items-stretch gap-2'>
                <div className='relative flex-1'>
                  <span className='absolute left-3 top-1/2 -translate-y-1/2 text-[#767b8a] font-mono text-sm'>
                    R$
                  </span>
                  <input
                    type='number'
                    min={minBet}
                    step={1}
                    value={Number.isFinite(stake) ? stake : ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setStake(Number.isFinite(v) ? v : 0);
                    }}
                    onBlur={() => setStake((s) => Math.max(minBet, s || minBet))}
                    className='w-full h-11 rounded-xl bg-[#0b0e18] border border-white/10 pl-10 pr-3 font-mono text-[#f1f3f8] tabular-nums text-lg focus:outline-none focus:border-[#ffb028]/60 focus:ring-2 focus:ring-[rgba(255,176,40,0.18)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                    aria-label='Valor da aposta em reais'
                  />
                </div>

                <button
                  type='button'
                  onClick={handleSubmit}
                  disabled={submitting || stake < minBet}
                  className={`
                    h-11 px-5 rounded-xl font-display font-semibold text-[14px]
                    inline-flex items-center justify-center gap-2 whitespace-nowrap
                    transition-[transform,filter,box-shadow]
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
                    ${userLoggedIn
                      ? 'text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] shadow-[0_10px_26px_-10px_rgba(255,138,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-[1.04] active:translate-y-px'
                      : 'text-white bg-white/[0.06] border border-white/15 hover:bg-white/[0.10]'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {submitting ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : userLoggedIn ? (
                    <Wallet className='h-4 w-4' />
                  ) : (
                    <Lock className='h-4 w-4' />
                  )}
                  {userLoggedIn ? 'Apostar' : 'Entrar'}
                </button>
              </div>

              <div className='mt-2.5 flex flex-wrap gap-1.5'>
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type='button'
                    onClick={() => handleAdd(amt)}
                    className='inline-flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/10 text-[#b8bcc9] px-2.5 h-8 text-[12px] font-mono hover:bg-white/[0.08] hover:border-white/20 hover:text-white transition-colors'
                  >
                    <Plus className='h-3 w-3' />R${amt}
                  </button>
                ))}
              </div>

              <div className='mt-3 flex items-center justify-between text-[12px] text-[#767b8a]'>
                <span>Retorno potencial</span>
                <span className='font-mono text-[#ffb028] font-semibold tabular-nums text-[15px]'>
                  {formatBRL(potentialReturn)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RunnerAvatarProps {
  label: string;
  photoUrl?: string | null;
}

function RunnerAvatar({ label, photoUrl }: RunnerAvatarProps) {
  const initials = React.useMemo(() => {
    return label
      .replace(/["“”']/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  }, [label]);
  if (photoUrl) {
    return <img src={photoUrl} alt='' className='h-9 w-9 rounded-full object-cover ring-2 ring-black/40 shrink-0' />;
  }
  return (
    <span
      className='h-9 w-9 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/10 text-[#b8bcc9] shrink-0'
      aria-hidden
    >
      <span className='text-[11px] font-display font-semibold'>{initials}</span>
    </span>
  );
}

function PoolShareBar({ share }: { share: number }) {
  const clamped = Math.max(0, Math.min(1, share));
  return (
    <div className='relative h-1 rounded-full bg-white/[0.05] overflow-hidden'>
      <div
        className='absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,rgba(255,176,40,0.6),#ffb028)] transition-[width] duration-500 ease-out'
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

export default MultiRunnerCard;
