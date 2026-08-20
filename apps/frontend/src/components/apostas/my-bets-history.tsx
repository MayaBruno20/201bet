'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Trophy, X as XIcon, Clock, Ban, type LucideIcon } from 'lucide-react';

/**
 * 201bet · /apostas — MyBetsHistory
 * User's recent tickets with a status filter pill row.
 */

export type BetHistoryStatus = 'OPEN' | 'WON' | 'LOST' | 'CANCELED';

export interface BetHistoryItem {
  id: string;
  status: BetHistoryStatus;
  stake: number;
  potentialWin: number;
  /** Retorno potencial pelo rateio ATUAL (bilhetes abertos). Null = pote vazio. */
  currentPotential?: number | null;
  /** @deprecated exibição descontinuada — o pagamento é pari-mutuel, não odd fixa. */
  oddAtPlacement: number;
  eventName: string;
  marketName: string;
  oddLabel: string;
  createdAt: string;
}

export interface MyBetsHistoryProps {
  bets?: BetHistoryItem[];
  title?: string;
  className?: string;
}

type FilterId = 'ALL' | BetHistoryStatus;
interface FilterDef {
  id: FilterId;
  label: string;
}

const FILTERS: FilterDef[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'OPEN', label: 'Em aberto' },
  { id: 'WON', label: 'Ganhos' },
  { id: 'LOST', label: 'Perdidos' },
];

const STATUS_CONFIG: Record<BetHistoryStatus, { label: string; cls: string; icon: LucideIcon }> = {
  OPEN: {
    label: 'EM ABERTO',
    cls: 'bg-[rgba(96,165,250,0.10)] text-[#60a5fa] border-[rgba(96,165,250,0.25)]',
    icon: Clock,
  },
  WON: {
    label: 'GANHO',
    cls: 'bg-[rgba(33,217,122,0.10)] text-[#21d97a] border-[rgba(33,217,122,0.25)]',
    icon: Trophy,
  },
  LOST: {
    label: 'PERDIDO',
    cls: 'bg-white/[0.04] text-[#767b8a] border-white/10',
    icon: XIcon,
  },
  CANCELED: {
    label: 'CANCELADO',
    cls: 'bg-[rgba(255,90,108,0.10)] text-[#ff5a6c] border-[rgba(255,90,108,0.25)]',
    icon: Ban,
  },
};

const DEFAULT_BETS: BetHistoryItem[] = [
  {
    id: 'b1', status: 'OPEN', stake: 50, potentialWin: 95,
    oddAtPlacement: 1.9, eventName: 'Embate Curitiba · Final',
    marketName: 'Passou na frente', oddLabel: 'Caio "Trovão" Marques',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
];

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function MyBetsHistory({
  bets = DEFAULT_BETS,
  title = 'Meus bilhetes',
  className = '',
}: MyBetsHistoryProps) {
  const [filter, setFilter] = React.useState<FilterId>('ALL');

  const counts = React.useMemo(() => {
    return bets.reduce<Record<FilterId, number>>(
      (acc, b) => {
        acc.ALL += 1;
        acc[b.status] = (acc[b.status] ?? 0) + 1;
        return acc;
      },
      { ALL: 0, OPEN: 0, WON: 0, LOST: 0, CANCELED: 0 },
    );
  }, [bets]);

  const visible = React.useMemo(() => {
    if (filter === 'ALL') return bets;
    return bets.filter((b) => b.status === filter);
  }, [bets, filter]);

  return (
    <section className={`relative ${className}`} aria-label={title}>
      <header className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4'>
        <div className='flex items-center gap-2.5'>
          <span className='inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(255,176,40,0.12)] text-[#ffb028]'>
            <History className='h-4 w-4' />
          </span>
          <h2 className='font-display text-xl sm:text-2xl font-semibold text-[#f1f3f8] tracking-tight'>
            {title}
          </h2>
        </div>
        <div className='flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          {FILTERS.map((f) => {
            const isActive = f.id === filter;
            return (
              <button
                key={f.id}
                type='button'
                onClick={() => setFilter(f.id)}
                className={`
                  inline-flex items-center gap-1.5 h-8 px-3 rounded-full whitespace-nowrap
                  text-[12px] transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
                  ${isActive
                    ? 'bg-white text-[#0a0d14] font-semibold'
                    : 'bg-white/[0.04] border border-white/10 text-[#b8bcc9] hover:bg-white/[0.08] hover:text-white'}
                `}
              >
                {f.label}
                <span className={`font-mono text-[10px] tabular-nums ${isActive ? 'text-[#767b8a]' : 'text-[#4a4f5d]'}`}>
                  {counts[f.id]}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className='space-y-2 max-h-[560px] overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin]'>
          <AnimatePresence initial={false}>
            {visible.map((bet) => (
              <motion.li
                key={bet.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <HistoryRow bet={bet} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function HistoryRow({ bet }: { bet: BetHistoryItem }) {
  const status = STATUS_CONFIG[bet.status];
  const Icon = status.icon;
  return (
    <div className='rounded-2xl border border-white/[0.08] bg-[#101525] p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4'>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2 mb-1.5'>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-display font-semibold uppercase tracking-[0.12em] ${status.cls}`}>
            <Icon className='h-3 w-3' />
            {status.label}
          </span>
          <span className='text-[11px] text-[#767b8a] font-mono truncate'>
            {bet.eventName}
          </span>
        </div>
        <div className='text-[14px] text-[#f1f3f8] font-medium leading-tight truncate' title={bet.oddLabel}>
          {bet.oddLabel}
        </div>
        <div className='text-[12px] text-[#767b8a] mt-0.5'>
          {bet.marketName}{' '}
          <span className='text-white/15'>·</span>{' '}
          aposta <span className='font-mono text-[#b8bcc9] tabular-nums'>{formatBRL(bet.stake)}</span>
        </div>
      </div>
      <div className='flex sm:flex-col sm:items-end sm:text-right justify-between sm:justify-center gap-1 shrink-0 min-w-[120px]'>
        <div className='text-[10px] uppercase tracking-wider text-[#767b8a]'>
          {bet.status === 'WON' ? 'recebeu' : bet.status === 'LOST' ? 'perdeu' : 'retorno potencial'}
        </div>
        <div
          className={`font-mono text-lg font-semibold tabular-nums leading-tight ${
            bet.status === 'WON'
              ? 'text-[#21d97a]'
              : bet.status === 'LOST'
                ? 'text-[#767b8a] line-through decoration-1'
                : bet.status === 'CANCELED'
                  ? 'text-[#ff5a6c]'
                  : 'text-[#21d97a]'
          }`}
        >
          {/* Pari-mutuel: aberto mostra o rateio ATUAL (dinâmico), não a odd
              travada. Liquidados mostram o valor real. */}
          {bet.status === 'OPEN'
            ? bet.currentPotential != null
              ? formatBRL(bet.currentPotential)
              : '—'
            : formatBRL(bet.potentialWin)}
        </div>
        {bet.status === 'OPEN' && (
          <div className='text-[10px] text-[#767b8a] leading-tight sm:max-w-[140px]'>
            pelo rateio do pote · valor final no fechamento
          </div>
        )}
        <div className='text-[11px] text-[#4a4f5d] font-mono sm:mt-0.5'>
          {formatRelative(bet.createdAt)}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterId }) {
  const copy =
    filter === 'OPEN'
      ? 'Nenhum bilhete em aberto. Quando você apostar, ele aparece aqui.'
      : filter === 'WON'
        ? 'Sem ganhos no recorte atual. Bora pra próxima.'
        : filter === 'LOST'
          ? 'Sem derrotas nesse recorte. Boa.'
          : 'Você ainda não fez nenhuma aposta. Escolha um embate e mande.';
  return (
    <div className='rounded-2xl border border-dashed border-white/10 bg-[#0d1320] p-8 sm:p-10 text-center'>
      <div className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-[#767b8a] mx-auto mb-3'>
        <History className='h-5 w-5' />
      </div>
      <p className='text-[14px] text-[#b8bcc9] max-w-sm mx-auto leading-relaxed'>{copy}</p>
    </div>
  );
}

export default MyBetsHistory;
