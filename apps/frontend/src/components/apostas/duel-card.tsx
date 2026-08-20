'use client';

import * as React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Check, ChevronDown, Crown, Info, Trophy } from 'lucide-react';

/**
 * 201bet · /apostas — DuelCard
 * Central betting unit: a 1×1 duel between two pilots.
 *
 * Display: mostra "% das apostas" por lado em vez de odd cravada.
 * Cotação dinâmica (pote dividido entre vencedores), então a odd flutua
 * até o fechamento — mostrar uma odd fixa criava expectativa de retorno X que
 * virava Y no pagamento. A % mostra a distribuição atual sem prometer payout.
 */

export type DuelStatus = 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELED';
export type DuelSide = 'LEFT' | 'RIGHT';

export interface DuelSideData {
  label: string;
  /** Nome do carro (linha de cima do card). Fallback: `label`. */
  carName?: string;
  /** Nome do piloto (linha de baixo do card). */
  driverName?: string;
  odd: number;
  poolShare: number; // 0-100, distribuição atual das apostas no lado
  photoUrl?: string | null;
}

export interface DuelData {
  id: string;
  status: DuelStatus;
  totalPool: number;
  isSuperFinal?: boolean;
  left: DuelSideData;
  right: DuelSideData;
  settlement?: { winnerSide: DuelSide };
  isInitialOdds?: boolean;
}

export interface DuelCardProps {
  duel: DuelData;
  selectedSide?: DuelSide | null;
  /** @deprecated não é mais usado — display público não mostra retorno estimado por odd */
  stakeForEstimate?: number;
  onSelect?: (side: DuelSide) => void;
  className?: string;
}

function formatBRLShort(n: number): string {
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatShare(share: number): string {
  return `${share.toFixed(0).replace('.', ',')}%`;
}

const STATUS_PILL: Record<DuelStatus, { label: string; cls: string }> = {
  OPEN:    { label: 'ABERTO',    cls: 'text-[#21d97a]' },
  CLOSED:  { label: 'FECHADO',   cls: 'text-[#ffb028]' },
  SETTLED: { label: 'AUDITADO',  cls: 'text-[#b8bcc9]' },
  CANCELED:{ label: 'CANCELADO', cls: 'text-[#ff5a6c]' },
};

function AnimatedShare({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (latest: number) => formatShare(latest));
  React.useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className={className}>{display as unknown as React.ReactNode}</motion.span>;
}

export function DuelCard({
  duel,
  selectedSide = null,
  onSelect,
  className = '',
}: DuelCardProps) {
  const [infoOpen, setInfoOpen] = React.useState(false);
  const isSettled = duel.status === 'SETTLED' && !!duel.settlement;
  const isCanceled = duel.status === 'CANCELED';
  const isInteractive = duel.status === 'OPEN';
  const statusInfo = STATUS_PILL[duel.status];
  const winnerSide = isSettled ? duel.settlement?.winnerSide : null;

  return (
    <motion.div
      whileHover={isInteractive ? { y: -2 } : undefined}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`
        relative rounded-2xl border bg-[#101525]
        ${duel.isSuperFinal
          ? 'border-[rgba(255,176,40,0.35)] shadow-[0_0_0_1px_rgba(255,176,40,0.10),0_20px_60px_-30px_rgba(255,138,42,0.4)]'
          : 'border-white/[0.08]'}
        p-4 sm:p-5
        ${isCanceled ? 'opacity-55 grayscale' : ''}
        ${className}
      `}
      aria-label={`Embate ${duel.left.label} vs ${duel.right.label}`}
    >
      {duel.isSuperFinal && (
        <div className='absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] text-[#1a1305] text-[10px] font-bold uppercase tracking-[0.12em] shadow-[0_8px_18px_-8px_rgba(255,138,42,0.7)]'>
          <Crown className='h-3 w-3' />
          Super Final
        </div>
      )}

      <div className='flex items-center justify-between mb-4'>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-display font-semibold uppercase tracking-[0.16em] ${statusInfo.cls}`}>
          {duel.status === 'OPEN' ? (
            <span className='relative inline-flex h-1.5 w-1.5'>
              <span className='absolute inset-0 rounded-full bg-[#21d97a] animate-ping opacity-60' />
              <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-[#21d97a]' />
            </span>
          ) : (
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
              duel.status === 'CLOSED' ? 'bg-[#ffb028]' : duel.status === 'CANCELED' ? 'bg-[#ff5a6c]' : 'bg-[#767b8a]'
            }`} />
          )}
          {statusInfo.label}
        </span>
        <span className='font-mono text-[11px] tabular-nums text-[#767b8a]'>
          Pote {formatBRLShort(duel.totalPool)}
        </span>
      </div>

      <div className='grid grid-cols-2 gap-2.5'>
        <SideButton
          side='LEFT'
          data={duel.left}
          selected={selectedSide === 'LEFT'}
          isWinner={winnerSide === 'LEFT'}
          isLoser={isSettled && winnerSide !== 'LEFT'}
          interactive={isInteractive}
          onSelect={() => isInteractive && onSelect?.('LEFT')}
        />
        <SideButton
          side='RIGHT'
          data={duel.right}
          selected={selectedSide === 'RIGHT'}
          isWinner={winnerSide === 'RIGHT'}
          isLoser={isSettled && winnerSide !== 'RIGHT'}
          interactive={isInteractive}
          onSelect={() => isInteractive && onSelect?.('RIGHT')}
        />
      </div>

      {isInteractive && (
        <div className='mt-3'>
          <button
            type='button'
            onClick={() => setInfoOpen((v) => !v)}
            className='inline-flex items-center gap-1.5 text-[11px] text-[#767b8a] hover:text-[#b8bcc9] transition-colors focus:outline-none'
            aria-expanded={infoOpen}
            aria-label='Como funciona o retorno'
          >
            <Info className='h-3 w-3' />
            Como funciona o retorno
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${infoOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {infoOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className='overflow-hidden'
              >
                <p className='mt-2 text-[11px] text-[#767b8a] leading-snug rounded-lg border border-white/[0.06] bg-[#0b0e18] px-3 py-2'>
                  % indica a distribuição atual das apostas. O pote total é dividido entre quem acertar,
                  proporcional à aposta. Quanto mais gente no lado oposto, maior seu retorno. O valor final
                  só é definido no fechamento.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {(duel.status === 'CLOSED' || isSettled || isCanceled) && (
        <div className='mt-3 text-[11px] text-[#767b8a] leading-tight'>
          {duel.status === 'CLOSED' && <span>Apostas encerradas. Aguardando auditoria.</span>}
          {isSettled && (
            <span className='inline-flex items-center gap-1 text-[#21d97a]'>
              <Trophy className='h-3 w-3' />
              Vencedor: {winnerSide === 'LEFT' ? duel.left.label : duel.right.label}
            </span>
          )}
          {isCanceled && <span>Embate cancelado. Apostas serão estornadas.</span>}
        </div>
      )}
    </motion.div>
  );
}

interface SideButtonProps {
  side: DuelSide;
  data: DuelSideData;
  selected: boolean;
  isWinner: boolean;
  isLoser: boolean;
  interactive: boolean;
  onSelect: () => void;
}

function SideButton({ side, data, selected, isWinner, isLoser, interactive, onSelect }: SideButtonProps) {
  const isLeft = side === 'LEFT';
  const accent = isLeft
    ? {
        text: 'text-[#60a5fa]',
        bar: 'bg-[#3b82f6]',
        selectedBg: 'bg-[rgba(59,130,246,0.10)]',
        selectedBorder: 'border-[#3b82f6]/55',
        selectedGlow: 'shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_14px_36px_-18px_rgba(59,130,246,0.40)]',
      }
    : {
        text: 'text-[#fb923c]',
        bar: 'bg-[#f97316]',
        selectedBg: 'bg-[rgba(249,115,22,0.10)]',
        selectedBorder: 'border-[#f97316]/55',
        selectedGlow: 'shadow-[0_0_0_1px_rgba(249,115,22,0.45),0_14px_36px_-18px_rgba(249,115,22,0.40)]',
      };

  return (
    <button
      type='button'
      onClick={onSelect}
      disabled={!interactive}
      aria-pressed={selected}
      aria-label={`${isLeft ? 'Piloto A' : 'Piloto B'}: ${data.label} — ${formatShare(data.poolShare)} das apostas`}
      className={`
        group relative text-left rounded-xl border
        pl-3.5 pr-3 py-3 sm:py-3.5
        transition-all duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
        ${selected
          ? `${accent.selectedBorder} ${accent.selectedBg} ${accent.selectedGlow}`
          : `border-white/[0.06] bg-white/[0.015] ${interactive ? 'hover:bg-white/[0.04] hover:border-white/[0.12] hover:-translate-y-px' : ''}`}
        ${isWinner ? 'border-[#21d97a]/45 bg-[rgba(33,217,122,0.06)] shadow-[0_0_0_1px_rgba(33,217,122,0.25),0_14px_36px_-18px_rgba(33,217,122,0.30)]' : ''}
        ${isLoser ? 'opacity-50' : ''}
        ${!interactive ? 'cursor-default' : ''}
      `}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${accent.bar} ${selected ? 'opacity-100' : 'opacity-70'}`}
      />

      {(selected || isWinner) && (
        <span
          className={`absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full ${
            isWinner ? 'bg-[#21d97a]/20 text-[#21d97a]' : 'bg-[#21d97a]/20 text-[#21d97a]'
          }`}
          aria-hidden
        >
          {isWinner ? <Trophy className='h-3 w-3' /> : <Check className='h-3 w-3' strokeWidth={3} />}
        </span>
      )}

      {data.carName ? (
        // Carro em cima (destaque), piloto embaixo.
        <div className='pr-5 min-h-[2.3em]' title={data.label}>
          <div className='text-[13px] sm:text-[14px] text-[#f1f3f8] font-semibold leading-tight line-clamp-1'>
            {data.carName}
          </div>
          {data.driverName && (
            <div className='mt-0.5 text-[11.5px] sm:text-[12px] text-[#8b90a0] leading-tight line-clamp-1'>
              {data.driverName}
            </div>
          )}
        </div>
      ) : (
        <div
          className='text-[13px] sm:text-[14px] text-[#f1f3f8] font-medium leading-snug line-clamp-2 pr-5 min-h-[2.3em]'
          title={data.label}
        >
          {data.label}
        </div>
      )}

      <div className='mt-3 flex items-baseline justify-between gap-2'>
        <span className={`font-mono text-[26px] sm:text-[28px] font-bold tabular-nums leading-none ${accent.text}`}>
          <AnimatedShare value={data.poolShare} />
        </span>
        <span className='font-mono text-[10px] uppercase tracking-[0.12em] text-[#767b8a] whitespace-nowrap'>
          das apostas
        </span>
      </div>
    </button>
  );
}

export default DuelCard;
