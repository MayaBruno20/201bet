'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Receipt, Trash2, Wallet, X, Zap, Lock } from 'lucide-react';

/**
 * 201bet · /apostas — BetSlipDrawer
 * Sticky bottom drawer. Empty → hidden. Expanded → full slip with per-item stake.
 */

export type BetSlipSide = 'LEFT' | 'RIGHT';

export interface BetSlipItem {
  duelId: string;
  side: BetSlipSide;
  label: string;
  oppLabel: string;
  odd: number;
  stake: number;
}

export interface BetSlipDrawerProps {
  items?: BetSlipItem[];
  totalStake?: number;
  totalReturn?: number;
  balance?: number;
  balanceAfter?: number;
  minBet?: number;
  submitting?: boolean;
  userLoggedIn?: boolean;
  onStakeChange?: (duelId: string, stake: number) => void;
  onRemove?: (duelId: string) => void;
  onClear?: () => void;
  onSubmit?: () => void;
  defaultExpanded?: boolean;
  className?: string;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BetSlipDrawer({
  items = [],
  totalStake = 0,
  totalReturn = 0,
  balance = 0,
  balanceAfter = balance - totalStake,
  minBet = 10,
  submitting = false,
  userLoggedIn = false,
  onStakeChange,
  onRemove,
  onClear,
  onSubmit,
  defaultExpanded = true,
  className = '',
}: BetSlipDrawerProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const count = items.length;
  const canSubmit = count > 0 && totalStake >= minBet && balanceAfter >= 0 && userLoggedIn;

  if (count === 0) return null;

  return (
    <div
      className={`
        fixed left-0 right-0 bottom-0 z-40
        ${className}
      `}
      role='region'
      aria-label='Bilhete de apostas'
    >
      <div className='h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,176,40,0.6),transparent)]' />

      <div className='relative bg-[#0b0f1c]/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.85)]'>
        {/* Header bar: toggle (left) e SubmitButton (right) são botões IRMÃOS,
            nunca aninhados — HTML proíbe <button> dentro de <button>. */}
        <div className='w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 h-14'>
          <button
            type='button'
            onClick={() => setExpanded((e) => !e)}
            className='flex-1 flex items-center gap-3 sm:gap-4 text-left focus:outline-none min-w-0'
            aria-expanded={expanded}
            aria-label={expanded ? 'Minimizar bilhete' : 'Expandir bilhete'}
          >
            <span className='relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,176,40,0.12)] text-[#ffb028] shrink-0'>
              <Receipt className='h-4 w-4' />
              <span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ffb028] text-[#1a1305] font-mono text-[10px] font-bold flex items-center justify-center tabular-nums'>
                {count}
              </span>
            </span>

            <div className='flex-1 min-w-0'>
              <div className='text-[11px] uppercase tracking-[0.14em] text-[#767b8a] font-semibold'>
                Bilhete
              </div>
              <div className='font-display text-[13px] sm:text-[14px] text-[#f1f3f8] truncate'>
                {count} {count === 1 ? 'embate' : 'embates'} ·{' '}
                <span className='font-mono tabular-nums'>{formatBRL(totalStake)}</span>{' '}
                <span className='text-[#767b8a]'>→</span>{' '}
                <span className='font-mono text-[#21d97a] tabular-nums'>{formatBRL(totalReturn)}</span>
              </div>
            </div>

            <span className='inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 text-[#b8bcc9] shrink-0'>
              {expanded ? <ChevronDown className='h-4 w-4' /> : <ChevronUp className='h-4 w-4' />}
            </span>
          </button>

          {!expanded && (
            <SubmitButton
              count={count}
              totalStake={totalStake}
              userLoggedIn={userLoggedIn}
              submitting={submitting}
              disabled={!canSubmit}
              compact
              onClick={() => onSubmit?.()}
            />
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key='body'
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className='overflow-hidden'
            >
              <div className='px-4 sm:px-6 pb-4 sm:pb-5'>
                <div className='flex items-center justify-between mb-3'>
                  <div className='text-[11px] uppercase tracking-[0.14em] text-[#767b8a] font-semibold'>
                    Seleções
                  </div>
                  <button
                    type='button'
                    onClick={onClear}
                    className='inline-flex items-center gap-1 text-[12px] text-[#767b8a] hover:text-[#ff5a6c] transition-colors'
                  >
                    <Trash2 className='h-3 w-3' />
                    Limpar
                  </button>
                </div>

                <ul className='space-y-2 max-h-[40vh] overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin]'>
                  {items.map((item) => (
                    <BetSlipRow
                      key={item.duelId}
                      item={item}
                      minBet={minBet}
                      onStakeChange={(v) => onStakeChange?.(item.duelId, v)}
                      onRemove={() => onRemove?.(item.duelId)}
                    />
                  ))}
                </ul>

                <div className='mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2'>
                  <SlipStat label='Seleções' value={String(count)} />
                  <SlipStat label='Total apostado' value={formatBRL(totalStake)} accent='muted' />
                  <SlipStat label='Retorno agora*' value={formatBRL(totalReturn)} accent='emerald' />
                  <SlipStat
                    label='Saldo após'
                    value={formatBRL(balanceAfter)}
                    accent={balanceAfter < 0 ? 'rose' : 'muted'}
                  />
                </div>

                <div className='mt-4'>
                  <SubmitButton
                    count={count}
                    totalStake={totalStake}
                    userLoggedIn={userLoggedIn}
                    submitting={submitting}
                    disabled={!canSubmit}
                    onClick={() => onSubmit?.()}
                  />
                  <p className='mt-2.5 text-[11px] leading-relaxed text-[#767b8a]'>
                    * O retorno final é definido só no fechamento das apostas — sistema pari-mutuel, o pote é dividido
                    entre quem acertar. Quanto mais gente do lado oposto, maior seu retorno. Use com critério.{' '}
                    <Wallet className='inline h-3 w-3 align-[-2px]' /> saldo{' '}
                    <span className='font-mono text-[#b8bcc9] tabular-nums'>{formatBRL(balance)}</span>{' '}
                    · <span className='text-[#b8bcc9]'>+18</span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface BetSlipRowProps {
  item: BetSlipItem;
  minBet: number;
  onStakeChange: (stake: number) => void;
  onRemove: () => void;
}

function BetSlipRow({ item, minBet, onStakeChange, onRemove }: BetSlipRowProps) {
  const isLeft = item.side === 'LEFT';
  const accent = isLeft ? { text: 'text-[#60a5fa]', label: 'Piloto A' } : { text: 'text-[#fb923c]', label: 'Piloto B' };
  const estimate = item.stake * item.odd;
  return (
    <li className='rounded-xl border border-white/10 bg-[#101525] p-3'>
      <div className='flex items-start justify-between gap-3 mb-2'>
        <div className='min-w-0'>
          <div className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${accent.text}`}>
            {accent.label}
          </div>
          <div className='text-[13px] text-[#f1f3f8] font-medium leading-tight truncate' title={item.label}>
            {item.label}
          </div>
          <div className='text-[11px] text-[#767b8a] truncate'>vs {item.oppLabel}</div>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <button
            type='button'
            onClick={onRemove}
            className='inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#767b8a] hover:bg-white/[0.05] hover:text-[#ff5a6c] transition-colors'
            aria-label='Remover do bilhete'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <div className='relative flex-1'>
          <span className='absolute left-2.5 top-1/2 -translate-y-1/2 text-[#767b8a] font-mono text-xs'>R$</span>
          <input
            type='number'
            min={minBet}
            step={1}
            value={Number.isFinite(item.stake) ? item.stake : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onStakeChange(Number.isFinite(v) ? v : 0);
            }}
            className='w-full h-9 rounded-lg bg-[#0b0e18] border border-white/10 pl-8 pr-2 font-mono text-[#f1f3f8] tabular-nums text-[14px] focus:outline-none focus:border-[#ffb028]/60 focus:ring-2 focus:ring-[rgba(255,176,40,0.18)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
            aria-label={`Valor para ${item.label}`}
          />
        </div>
        <div className='text-right shrink-0 min-w-[100px]'>
          <div className='text-[10px] uppercase tracking-wider text-[#767b8a]'>retorno agora*</div>
          <div className='font-mono text-[13px] font-semibold tabular-nums text-[#21d97a] leading-tight'>
            {formatBRL(estimate)}
          </div>
        </div>
      </div>
    </li>
  );
}

function SlipStat({
  label,
  value,
  accent = 'muted',
}: {
  label: string;
  value: string;
  accent?: 'muted' | 'emerald' | 'amber' | 'rose';
}) {
  const cls = {
    muted: 'text-[#f1f3f8]',
    emerald: 'text-[#21d97a]',
    amber: 'text-[#ffb028]',
    rose: 'text-[#ff5a6c]',
  }[accent];
  return (
    <div className='rounded-xl border border-white/[0.06] bg-[#0b0e18] px-3 py-2'>
      <div className='text-[10px] uppercase tracking-wider text-[#767b8a]'>{label}</div>
      <div className={`font-mono text-[15px] font-semibold tabular-nums leading-tight ${cls}`}>{value}</div>
    </div>
  );
}

interface SubmitButtonProps {
  count: number;
  totalStake: number;
  userLoggedIn: boolean;
  submitting: boolean;
  disabled: boolean;
  compact?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

function SubmitButton({ count, totalStake, userLoggedIn, submitting, disabled, compact, onClick }: SubmitButtonProps) {
  const label = userLoggedIn
    ? submitting
      ? 'Enviando...'
      : compact
        ? `Apostar · ${formatBRL(totalStake)}`
        : `Apostar ${count} ${count === 1 ? 'embate' : 'embates'} · ${formatBRL(totalStake)}`
    : 'Entrar para apostar';
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled || submitting}
      className={`
        ${compact ? 'h-9 px-4 text-[13px]' : 'h-12 w-full text-[15px]'}
        rounded-xl font-display font-semibold
        inline-flex items-center justify-center gap-2 whitespace-nowrap
        transition-[transform,filter,box-shadow]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
        ${userLoggedIn
          ? 'text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] shadow-[0_14px_36px_-12px_rgba(255,138,42,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-[1.04] active:translate-y-px'
          : 'text-white bg-white/[0.06] border border-white/15 hover:bg-white/[0.10]'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {submitting ? <Loader2 className='h-4 w-4 animate-spin' /> : userLoggedIn ? <Zap className='h-4 w-4' /> : <Lock className='h-4 w-4' />}
      {label}
    </button>
  );
}

export default BetSlipDrawer;
