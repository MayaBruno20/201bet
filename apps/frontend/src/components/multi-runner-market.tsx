'use client';

import { useState } from 'react';
import { MultiRunnerSnapshot } from '@/types/market';

const MARKET_TYPE_LABELS: Record<string, string> = {
  WINNER: 'Vencedor Geral',
  BEST_REACTION: 'Melhor Reação',
  FALSE_START: 'Queimada',
};

const BAR_COLORS = [
  'bg-blue-500', 'bg-orange-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-yellow-500', 'bg-pink-500', 'bg-cyan-500', 'bg-red-500',
  'bg-indigo-500', 'bg-lime-500',
];

const ACCENT_COLORS = [
  'text-blue-400', 'text-orange-400', 'text-emerald-400', 'text-purple-400',
  'text-yellow-400', 'text-pink-400', 'text-cyan-400', 'text-red-400',
  'text-indigo-400', 'text-lime-400',
];

const RUNNER_COLORS = [
  'from-blue-500/20 to-blue-500/5 border-blue-500/30',
  'from-orange-500/20 to-orange-500/5 border-orange-500/30',
  'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
  'from-purple-500/20 to-purple-500/5 border-purple-500/30',
  'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30',
  'from-pink-500/20 to-pink-500/5 border-pink-500/30',
  'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
  'from-red-500/20 to-red-500/5 border-red-500/30',
  'from-indigo-500/20 to-indigo-500/5 border-indigo-500/30',
  'from-lime-500/20 to-lime-500/5 border-lime-500/30',
];

type Props = {
  snapshot: MultiRunnerSnapshot;
  me: { id: string; name: string; wallet?: { balance: number | string } } | null;
  stake: number;
  setStake: (v: number) => void;
  onPlaceBet: (oddId: string) => void;
  placingBet: boolean;
};

export function MultiRunnerMarket({ snapshot, me, stake, setStake, onPlaceBet, placingBet }: Props) {
  const [selectedOddId, setSelectedOddId] = useState<string>('');

  const selectedRunner = snapshot.runners.find((r) => r.oddId === selectedOddId);
  const expectedReturn = selectedRunner ? stake * selectedRunner.odd : 0;
  const currentBalance = Number(me?.wallet?.balance ?? 0);
  const balanceAfterBet = currentBalance - stake;
  const canBet = !!me && !!selectedRunner && stake >= 10 && currentBalance >= stake;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-end justify-between border-b border-white/5 pb-4'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70'>
            {MARKET_TYPE_LABELS[snapshot.marketType] ?? snapshot.marketType}
          </p>
          <h2 className='mt-1 text-2xl font-semibold tracking-tight'>{snapshot.marketName}</h2>
          <p className='mt-1 text-xs text-white/50'>
            Pote: <strong className='text-white/80'>R$ {formatMoney(snapshot.totalPool)}</strong>
            <span className='mx-2'>•</span>
            Comissão: <strong className='text-white/80'>{snapshot.rakePercent}%</strong>
            <span className='mx-2'>•</span>
            <strong className='text-white/80'>{snapshot.runners.length}</strong> opções
          </p>
        </div>
      </div>

      {/* Pool distribution bar */}
      {snapshot.totalPool > 0 && (
        <div>
          <div className='flex h-3 rounded-full overflow-hidden gap-[2px]'>
            {snapshot.runners.map((r, i) => (
              <div
                key={r.oddId}
                className={`${BAR_COLORS[i % BAR_COLORS.length]} transition-all duration-500 ${r.poolShare < 1 ? 'min-w-[3px]' : ''}`}
                style={{ width: `${Math.max(r.poolShare, 0.5)}%` }}
                title={`${r.label}: ${r.poolShare.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className='flex flex-wrap gap-3 mt-2'>
            {snapshot.runners.map((r, i) => (
              <span key={r.oddId} className='flex items-center gap-1.5 text-[10px] text-white/50'>
                <span className={`h-2 w-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                {r.label} ({r.poolShare.toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Runner cards */}
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {snapshot.runners.map((runner, idx) => {
          const isSelected = selectedOddId === runner.oddId;
          const colorClass = RUNNER_COLORS[idx % RUNNER_COLORS.length];
          const accentClass = ACCENT_COLORS[idx % ACCENT_COLORS.length];

          return (
            <button
              key={runner.oddId}
              type='button'
              className={`group relative text-left rounded-2xl border p-5 transition-all duration-300 outline-none
                ${isSelected ? `bg-gradient-to-br ${colorClass} scale-[1.02] shadow-xl` : 'bg-white/[0.02] border-white/8 hover:bg-white/5 hover:border-white/15'}`}
              onClick={() => setSelectedOddId(runner.oddId)}
            >
              <div className='flex items-center justify-between mb-3'>
                <p className='font-medium text-white/90'>{runner.label}</p>
                {isSelected && <div className='h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' />}
              </div>

              <div className='flex items-end justify-between'>
                <div>
                  <p className='text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1'>Cotação</p>
                  <div className='flex items-baseline gap-1'>
                    <span className={`text-lg font-medium ${accentClass}`}>@</span>
                    <span className='text-3xl font-bold tracking-tighter text-white'>
                      {runner.odd > 0 ? runner.odd.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
                <div className='text-right'>
                  <p className='text-[10px] text-white/30 mb-0.5'>R$ {formatMoney(runner.pool)}</p>
                  <p className='text-[10px] text-white/25'>{runner.tickets} apostas</p>
                </div>
              </div>

              {/* Share bar */}
              <div className='mt-3 h-1 rounded-full bg-white/5 overflow-hidden'>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                  style={{ width: `${runner.poolShare}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Bet form */}
      <div className='rounded-2xl border border-white/8 bg-white/[0.02] p-6'>
        <div className='grid gap-6 lg:grid-cols-2'>
          <div className='space-y-1 text-sm'>
            <p className='text-white/40'>Sua seleção</p>
            <p className='text-lg font-medium'>{selectedRunner?.label ?? 'Selecione uma opção acima'}</p>
            {selectedRunner && (
              <p className='text-sm text-white/50'>Cotação: <span className='text-white font-medium'>@{selectedRunner.odd.toFixed(2)}</span></p>
            )}
            <div className='h-2' />
            <div className='flex justify-between border-b border-white/5 pb-2 text-white/60'>
              <span>Saldo</span>
              <span className='font-medium text-white'>R$ {formatMoney(currentBalance)}</span>
            </div>
            <div className='flex justify-between border-b border-white/5 py-2 text-white/60'>
              <span>Saldo após aposta</span>
              <span className={`font-medium ${balanceAfterBet < 0 ? 'text-red-400' : 'text-white'}`}>R$ {formatMoney(balanceAfterBet)}</span>
            </div>
            <div className='flex justify-between py-2 text-white/60'>
              <span>Retorno bruto</span>
              <span className='font-semibold text-emerald-400'>R$ {formatMoney(expectedReturn)}</span>
            </div>
            {!me && <p className='mt-3 text-xs text-amber-400'>Faça login para apostar.</p>}
            {stake < 10 && <p className='mt-1 text-xs text-amber-400'>Valor mínimo: R$ 10,00.</p>}
            {me && currentBalance < stake && <p className='mt-1 text-xs text-red-400'>Saldo insuficiente.</p>}
          </div>

          <div className='flex flex-col justify-end gap-3'>
            <div className='relative'>
              <span className='absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium'>R$</span>
              <input
                className='w-full rounded-2xl border border-white/10 bg-[#090b11]/50 py-4 pl-12 pr-4 text-2xl font-semibold text-white focus:border-white/30 focus:outline-none'
                type='number' min={10} step={10} value={stake}
                onChange={(e) => setStake(Number(e.target.value || 0))}
              />
            </div>
            <button
              type='button'
              className='w-full rounded-2xl bg-white px-4 py-4 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 disabled:opacity-50 disabled:pointer-events-none'
              disabled={!canBet || placingBet}
              onClick={() => selectedOddId && onPlaceBet(selectedOddId)}
            >
              {placingBet ? 'Processando...' : 'Confirmar Bilhete ->'}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      {snapshot.history.length > 0 && (
        <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Histórico de cotações</p>
          <div className='max-h-48 space-y-1.5 overflow-auto pr-1'>
            {snapshot.history.slice().reverse().slice(0, 20).map((point, i) => (
              <div key={`${point.at}-${i}`} className='flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs'>
                <span className='text-white/30 tabular-nums'>
                  {new Date(point.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <div className='flex gap-2 flex-wrap'>
                  {snapshot.runners.slice(0, 5).map((r, ri) => (
                    <span key={r.oddId}>
                      <span className={`${ACCENT_COLORS[ri % ACCENT_COLORS.length]}`}>@</span>
                      <strong>{(point.odds[r.oddId] ?? 0).toFixed(2)}</strong>
                    </span>
                  ))}
                </div>
                <span className='text-white/25 tabular-nums hidden sm:block'>R$ {formatMoney(point.totalPool)}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0,00';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
