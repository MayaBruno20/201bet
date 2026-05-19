'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, Plus, Zap } from 'lucide-react';

/**
 * 201bet — QuickBetPanel
 * 2-click betting widget. Pick a side, set stake, see potential return.
 */

export interface QuickBetDriver {
  name: string;
  odd: number;
  poolShare: number;
}

export interface QuickBetDuel {
  id: string;
  leftDriver: QuickBetDriver;
  rightDriver: QuickBetDriver;
  eventName: string;
}

export type QuickBetSide = 'LEFT' | 'RIGHT';

export interface QuickBetPanelProps {
  duel?: QuickBetDuel;
  minBet?: number;
  onPlaceBet?: (side: QuickBetSide, stake: number) => void | Promise<void>;
  userLoggedIn?: boolean;
  className?: string;
}

const DEFAULT_DUEL: QuickBetDuel = {
  id: 'duel-mock-1',
  eventName: 'Embate Curitiba · Final',
  leftDriver: { name: 'Caio "Trovão" Marques', odd: 1.9, poolShare: 50 },
  rightDriver: { name: 'Pedro "Diesel" Lima', odd: 1.85, poolShare: 50 },
};

const QUICK_AMOUNTS = [5, 10, 50, 100];

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function QuickBetPanel({
  duel = DEFAULT_DUEL,
  minBet = 10,
  onPlaceBet,
  userLoggedIn = false,
  className = '',
}: QuickBetPanelProps) {
  const [side, setSide] = React.useState<QuickBetSide | null>(null);
  const [stake, setStake] = React.useState<number>(minBet);
  const [submitting, setSubmitting] = React.useState(false);

  const chosenDriver = side === 'LEFT' ? duel.leftDriver : side === 'RIGHT' ? duel.rightDriver : null;
  const potentialReturn = chosenDriver ? stake * chosenDriver.odd : 0;

  const handleAddAmount = (amt: number) =>
    setStake((s) => Math.max(minBet, Math.min(99999, s + amt)));

  const handleSubmit = async () => {
    if (!side || submitting) return;
    setSubmitting(true);
    try {
      await onPlaceBet?.(side, stake);
    } finally {
      setSubmitting(false);
    }
  };

  const isLeft = side === 'LEFT';
  const isRight = side === 'RIGHT';

  return (
    <div
      className={`
        relative w-full max-w-md rounded-3xl overflow-hidden
        border border-white/10 bg-[#101525]/95 backdrop-blur-xl
        shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)]
        ${className}
      `}
    >
      <div className='h-px w-full bg-[linear-gradient(90deg,transparent,#ffb028,transparent)] opacity-70' />

      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 opacity-60'
        style={{
          background:
            'radial-gradient(120% 60% at 50% -10%, rgba(255,176,40,0.10), transparent 60%)',
        }}
      />

      <div className='relative p-5 sm:p-6'>
        <div className='flex items-center justify-between gap-3 mb-4'>
          <div className='flex items-center gap-2'>
            <span className='relative inline-flex h-2.5 w-2.5'>
              <span className='absolute inset-0 rounded-full bg-[#ff5a6c] animate-ping opacity-50' />
              <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5a6c]' />
            </span>
            <span className='text-[11px] uppercase tracking-[0.18em] text-[#ff8294] font-semibold'>
              Ao vivo agora
            </span>
          </div>
          <span className='text-[12px] text-[#b8bcc9] truncate max-w-[55%]'>{duel.eventName}</span>
        </div>

        <div className='grid grid-cols-2 gap-3'>
          <SideButton
            label='Piloto A'
            driver={duel.leftDriver}
            side='LEFT'
            selected={isLeft}
            dimmed={isRight}
            onClick={() => setSide((s) => (s === 'LEFT' ? null : 'LEFT'))}
          />
          <SideButton
            label='Piloto B'
            driver={duel.rightDriver}
            side='RIGHT'
            selected={isRight}
            dimmed={isLeft}
            onClick={() => setSide((s) => (s === 'RIGHT' ? null : 'RIGHT'))}
          />
        </div>

        <AnimatePresence initial={false}>
          {side && (
            <motion.div
              key='stake'
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className='overflow-hidden'
            >
              <div className='pt-5'>
                <label className='block text-[11px] uppercase tracking-[0.16em] text-[#767b8a] mb-2'>
                  Sua aposta
                </label>
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
                      className='
                        w-full h-11 rounded-xl bg-[#0b0e18] border border-white/10
                        pl-10 pr-3 font-mono text-[#f1f3f8] tabular-nums text-lg
                        focus:outline-none focus:border-[#ffb028]/60 focus:ring-2 focus:ring-[rgba(255,176,40,0.18)]
                        [appearance:textfield]
                        [&::-webkit-outer-spin-button]:appearance-none
                        [&::-webkit-inner-spin-button]:appearance-none
                      '
                      aria-label='Valor da aposta em reais'
                    />
                  </div>
                </div>
                <div className='mt-2.5 flex flex-wrap gap-1.5'>
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type='button'
                      onClick={() => handleAddAmount(amt)}
                      className='
                        inline-flex items-center gap-1 rounded-lg
                        bg-white/[0.04] border border-white/10 text-[#b8bcc9]
                        px-2.5 h-8 text-[12px] font-mono
                        hover:bg-white/[0.08] hover:border-white/20 hover:text-white
                        transition-colors
                      '
                    >
                      <Plus className='h-3 w-3' />
                      R${amt}
                    </button>
                  ))}
                </div>

                <div className='mt-4 flex items-center justify-between rounded-2xl
                                bg-[#0b0e18] border border-white/5 px-4 py-3'>
                  <div>
                    <div className='text-[11px] uppercase tracking-wider text-[#767b8a]'>
                      Retorno se fechasse agora*
                    </div>
                    <div className='font-mono text-[22px] font-semibold tabular-nums text-[#ffb028] leading-tight'>
                      {formatBRL(potentialReturn)}
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-[11px] uppercase tracking-wider text-[#767b8a]'>das apostas</div>
                    <div className='font-mono text-base text-[#f1f3f8] tabular-nums'>
                      {chosenDriver?.poolShare.toFixed(0)}%
                    </div>
                  </div>
                </div>

                <button
                  type='button'
                  onClick={handleSubmit}
                  disabled={submitting || stake < minBet}
                  className={`
                    mt-4 w-full h-12 rounded-2xl font-display font-semibold text-[15px]
                    flex items-center justify-center gap-2
                    transition-[transform,filter,box-shadow]
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
                    ${userLoggedIn
                      ? 'text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] shadow-[0_14px_36px_-12px_rgba(255,138,42,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-[1.04] active:translate-y-px'
                      : 'text-white bg-white/[0.06] border border-white/15 hover:bg-white/[0.10]'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {submitting ? (
                    <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
                  ) : userLoggedIn ? (
                    <Zap className='h-4 w-4' aria-hidden />
                  ) : (
                    <Lock className='h-4 w-4' aria-hidden />
                  )}
                  {userLoggedIn
                    ? submitting ? 'Confirmando...' : 'Confirmar aposta'
                    : 'Entrar para apostar'}
                </button>

                <p className='mt-3 text-[11px] leading-relaxed text-[#767b8a]'>
                  * Pari-mutuel: o pote total é dividido entre quem acertar. Valor final só sai no fechamento — pode
                  subir conforme o outro lado aposta. Use com critério. <span className='text-[#b8bcc9]'>+18</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!side && (
          <p className='mt-4 text-center text-[12px] text-[#767b8a]'>
            Escolha um lado para apostar em 2 cliques
          </p>
        )}
      </div>
    </div>
  );
}

interface SideButtonProps {
  label: string;
  driver: QuickBetDriver;
  side: QuickBetSide;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}

function SideButton({ label, driver, side, selected, dimmed, onClick }: SideButtonProps) {
  const isLeft = side === 'LEFT';
  const accent = isLeft
    ? {
        text: 'text-[#60a5fa]',
        border: 'border-[#3b82f6]/60',
        glow: 'shadow-[0_0_0_1px_rgba(59,130,246,0.5),0_18px_44px_-16px_rgba(59,130,246,0.55)]',
        bg: 'bg-[rgba(59,130,246,0.10)]',
        ring: 'ring-[rgba(59,130,246,0.15)]',
      }
    : {
        text: 'text-[#fb923c]',
        border: 'border-[#f97316]/60',
        glow: 'shadow-[0_0_0_1px_rgba(249,115,22,0.5),0_18px_44px_-16px_rgba(249,115,22,0.55)]',
        bg: 'bg-[rgba(249,115,22,0.10)]',
        ring: 'ring-[rgba(249,115,22,0.15)]',
      };

  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={selected}
      className={`
        group relative text-left rounded-2xl border
        p-4 transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
        ${selected
          ? `${accent.border} ${accent.bg} ${accent.glow}`
          : `border-white/10 bg-white/[0.02] ring-1 ${accent.ring} hover:bg-white/[0.05]`}
        ${dimmed ? 'opacity-40 hover:opacity-60' : ''}
      `}
    >
      <div className='flex items-center justify-between mb-2'>
        <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${accent.text}`}>
          {label}
        </span>
        {selected && (
          <span className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#21d97a]/20 text-[#21d97a] text-[10px]'>
            ✓
          </span>
        )}
      </div>
      <div className='text-[13px] text-[#f1f3f8] font-medium leading-tight min-h-[2.2em] line-clamp-2'>
        {driver.name}
      </div>
      <div className='mt-3 flex items-end justify-between'>
        <span className='text-[10px] uppercase tracking-wider text-[#767b8a]'>das apostas</span>
        <span className={`font-mono text-2xl font-bold tabular-nums ${accent.text}`}>
          {driver.poolShare.toFixed(0)}%
        </span>
      </div>
    </button>
  );
}

export default QuickBetPanel;
