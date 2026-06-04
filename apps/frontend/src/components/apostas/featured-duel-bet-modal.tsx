'use client';

import * as React from 'react';
import { Star, Trophy, X, Check } from 'lucide-react';
import { apiFetch, parseApiErrorMessage } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';
import type { FeaturedCustomDuel } from './featured-duels-banner';
import type { MarketSnapshot } from '@/types/market';

const apiUrl = getPublicApiUrl();

const ASSET_BASE = (() => {
  const base = getPublicApiUrl();
  return base.replace(/\/api\/?$/, '');
})();

function resolveAsset(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${ASSET_BASE}${url}`;
}

type Props = {
  duel: FeaturedCustomDuel;
  /** Saldo atual do usuário logado — null se deslogado. */
  balance: number | null;
  isLoggedIn: boolean;
  minBet: number;
  /** Snapshot ao vivo do socket — atualiza odd, pool e bloqueio em tempo real. */
  snapshot?: MarketSnapshot | null;
  onClose: () => void;
  /** Chamada após aposta confirmada — pra refresh de saldo no parent. */
  onBetPlaced: (result: { potentialWin: number; newBalance: number }) => void;
};

type Side = 'LEFT' | 'RIGHT';

export const FeaturedDuelBetModal: React.FC<Props> = ({
  duel, balance, isLoggedIn, minBet, snapshot, onClose, onBetPlaced,
}) => {
  const [side, setSide] = React.useState<Side | null>(null);
  const [stake, setStake] = React.useState<number>(minBet);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const banner = resolveAsset(duel.bannerUrl);
  const leftPhoto = resolveAsset(duel.leftCar.photoUrl);
  const rightPhoto = resolveAsset(duel.rightCar.photoUrl);

  // Snapshot ao vivo sobrescreve o payload inicial — odds/pool flutuam até o fechamento.
  // Optional chaining em `duel?.left`/`right` protege contra payload parcial.
  const leftOdd = snapshot?.duel?.left?.odd ?? duel.market?.odds[0]?.value ?? 1.0;
  const rightOdd = snapshot?.duel?.right?.odd ?? duel.market?.odds[1]?.value ?? 1.0;
  const leftPool = snapshot?.duel?.left?.pool ?? duel.pool?.left ?? 0;
  const rightPool = snapshot?.duel?.right?.pool ?? duel.pool?.right ?? 0;
  const totalPool = snapshot?.totalPool ?? (leftPool + rightPool);
  const leftShare = totalPool > 0 ? Math.round((leftPool / totalPool) * 100) : 50;
  const rightShare = totalPool > 0 ? 100 - leftShare : 50;
  const tickets = snapshot
    ? (snapshot.duel?.left?.tickets ?? 0) + (snapshot.duel?.right?.tickets ?? 0)
    : duel.pool?.tickets ?? 0;

  // Live status: snapshot vence sobre o payload inicial (booking pode fechar enquanto o modal está aberto).
  const liveStatus = snapshot?.status ?? duel.status;
  const isClosed =
    liveStatus === 'BOOKING_CLOSED' ||
    liveStatus === 'FINISHED' ||
    liveStatus === 'CANCELED' ||
    !!snapshot?.locked;

  const potentialWin = React.useMemo(() => {
    if (!side) return 0;
    const odd = side === 'LEFT' ? leftOdd : rightOdd;
    return stake * odd;
  }, [side, stake, leftOdd, rightOdd]);

  // Fecha com ESC
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!side) { setError('Escolha um lado pra apostar.'); return; }
    if (!stake || stake < minBet) { setError(`Aposta mínima é R$ ${minBet.toFixed(2)}.`); return; }
    if (balance != null && stake > balance) { setError('Saldo insuficiente.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/market/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duelId: duel.id, side, amount: stake }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(parseApiErrorMessage(text, `Erro ${response.status}`));
      }
      const data = (await response.json()) as {
        bet: { id: string; potentialWin: number };
        wallet: { balance: number };
      };
      onBetPlaced({ potentialWin: data.bet.potentialWin, newBalance: data.wallet.balance });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar aposta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm'
      onClick={onClose}
    >
      <div
        className='relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-[#0c1020] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)]'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className='relative h-40 overflow-hidden rounded-t-2xl bg-gradient-to-br from-[#1c1409] to-[#101525]'>
          {banner && (
            <>
              <img src={banner} alt={duel.title} className='absolute inset-0 h-full w-full object-cover' />
              <div className='absolute inset-0 bg-gradient-to-t from-[#0c1020] via-[#0c1020]/30 to-transparent' />
            </>
          )}
          <button
            type='button'
            onClick={onClose}
            className='absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white'
          >
            <X className='h-4 w-4' />
          </button>

          <div className='absolute bottom-3 left-4 right-4'>
            <div className='flex items-center gap-2'>
              <span className='inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300 backdrop-blur'>
                <Star className='h-2.5 w-2.5' fill='currentColor' /> Destaque
              </span>
              <span className='inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur'>
                <Trophy className='h-2.5 w-2.5' /> {duel.eventName}
              </span>
            </div>
            <h2 className='mt-1.5 font-display text-xl font-bold leading-tight text-white drop-shadow'>
              {duel.title}
            </h2>
          </div>
        </div>

        <div className='p-5'>
          {/* Versus */}
          <div className='grid grid-cols-2 gap-3'>
            <SideButton
              car={duel.leftCar}
              photo={leftPhoto}
              odd={leftOdd}
              share={leftShare}
              selected={side === 'LEFT'}
              disabled={isClosed || submitting}
              onClick={() => setSide('LEFT')}
            />
            <SideButton
              car={duel.rightCar}
              photo={rightPhoto}
              odd={rightOdd}
              share={rightShare}
              selected={side === 'RIGHT'}
              disabled={isClosed || submitting}
              onClick={() => setSide('RIGHT')}
            />
          </div>

          {/* Pool agregado + ticket count */}
          {totalPool > 0 && (
            <div className='mt-4 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]'>
              <span className='text-white/40'>Pool atual</span>
              <span className='font-mono text-white/80'>
                R$ {totalPool.toFixed(2)} · {tickets} {tickets === 1 ? 'aposta' : 'apostas'}
              </span>
            </div>
          )}

          {/* Stake input + estimativa */}
          <div className='mt-5'>
            <label className='text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40'>
              Valor da aposta (mínimo R$ {minBet.toFixed(2)})
            </label>
            <div className='mt-1.5 flex items-center gap-2'>
              <div className='relative flex-1'>
                <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40'>R$</span>
                <input
                  type='number'
                  inputMode='decimal'
                  min={minBet}
                  step={1}
                  value={Number.isFinite(stake) ? stake : ''}
                  onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
                  className='w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-10 pr-3 font-mono text-base text-white placeholder:text-white/30 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/30'
                  placeholder='0,00'
                  disabled={isClosed || submitting}
                />
              </div>
              <div className='flex gap-1'>
                {[minBet, minBet * 2, minBet * 5, minBet * 10].map((v) => (
                  <button
                    key={v}
                    type='button'
                    onClick={() => setStake(v)}
                    disabled={isClosed || submitting}
                    className='rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40'
                  >
                    R${v}
                  </button>
                ))}
              </div>
            </div>

            {side && stake >= minBet && (
              <div className='mt-3 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-sm'>
                <span className='text-white/70'>Retorno estimado:</span>
                <span className='font-mono text-base font-bold text-amber-300'>
                  R$ {potentialWin.toFixed(2)}
                </span>
              </div>
            )}

            {balance != null && (
              <div className='mt-2 text-right text-[11.5px] text-white/40'>
                Saldo: <span className='font-mono text-white/70'>R$ {balance.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Microcopy de cotação dinâmica */}
          <p className='mt-3 text-[11px] leading-relaxed text-white/40'>
            Cotação é dinâmica — o retorno final depende do rateio do pote no fechamento. Quem acerta nunca recebe menos que o valor apostado.
          </p>

          {error && (
            <div className='mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'>
              {error}
            </div>
          )}

          {!isLoggedIn && (
            <div className='mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200'>
              Faça login pra confirmar a aposta.
            </div>
          )}

          {isClosed && (
            <div className='mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60'>
              Mercado fechado pra esse embate.
            </div>
          )}

          <div className='mt-5 flex gap-2 border-t border-white/10 pt-4'>
            <button
              type='button'
              onClick={onClose}
              disabled={submitting}
              className='flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50'
            >
              Cancelar
            </button>
            <button
              type='button'
              onClick={() => void submit()}
              disabled={submitting || isClosed || !isLoggedIn || !side}
              className='flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-[#1a1106] transition hover:bg-amber-400 disabled:opacity-40'
            >
              {submitting ? 'Enviando…' : (
                <span className='inline-flex items-center justify-center gap-1.5'>
                  <Check className='h-4 w-4' /> Confirmar aposta
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SideButton: React.FC<{
  car: { label: string; driverName: string };
  photo: string | null;
  odd: number;
  share: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}> = ({ car, photo, odd, share, selected, disabled, onClick }) => (
  <button
    type='button'
    onClick={onClick}
    disabled={disabled}
    className={`relative overflow-hidden rounded-xl border-2 p-3 text-left transition ${
      selected
        ? 'border-amber-400 bg-amber-500/10'
        : 'border-white/10 bg-white/5 hover:border-amber-400/40'
    } disabled:opacity-50`}
  >
    <div className='flex items-center gap-2.5'>
      <div className='h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5'>
        {photo
          ? <img src={photo} alt={car.label} className='h-full w-full object-cover' />
          : <div className='h-full w-full' />}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-semibold text-white'>{car.label}</div>
        <div className='truncate text-[10.5px] text-white/50'>{car.driverName}</div>
      </div>
    </div>
    <div className='mt-2 flex items-baseline justify-between'>
      <span className='text-[10px] uppercase tracking-[0.14em] text-white/40'>Odd</span>
      <span className={`font-mono text-lg font-bold ${selected ? 'text-amber-300' : 'text-white'}`}>
        {odd.toFixed(2)}x
      </span>
    </div>
    <div className='mt-1.5'>
      <div className='mb-0.5 flex items-center justify-between text-[10px] text-white/40'>
        <span>{share}% das apostas</span>
      </div>
      <div className='h-1 overflow-hidden rounded-full bg-white/10'>
        <div className={`h-full ${selected ? 'bg-amber-400' : 'bg-white/30'}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  </button>
);
