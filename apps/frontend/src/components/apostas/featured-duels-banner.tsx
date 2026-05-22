'use client';

import * as React from 'react';
import { Star, Trophy } from 'lucide-react';
import { getPublicApiUrl } from '@/lib/env-public';
import type { MarketSnapshot } from '@/types/market';

export type FeaturedCustomDuel = {
  id: string;
  eventId: string;
  eventName: string;
  title: string;
  bannerUrl: string | null;
  startsAt: string;
  bookingCloseAt: string;
  status: 'SCHEDULED' | 'BOOKING_OPEN' | 'BOOKING_CLOSED' | 'FINISHED' | 'CANCELED';
  leftCar: { label: string; photoUrl: string | null; driverName: string };
  rightCar: { label: string; photoUrl: string | null; driverName: string };
  market: { id: string; odds: Array<{ id: string; label: string; value: number }> } | null;
  pool: { left: number; right: number; tickets: number } | null;
};

const ASSET_BASE = (() => {
  const base = getPublicApiUrl();
  return base.replace(/\/api\/?$/, '');
})();

function resolveAsset(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${ASSET_BASE}${url}`;
}

type Props = {
  duels: FeaturedCustomDuel[];
  /** Snapshots ao vivo do socket — usados pra atualizar odds/pool em tempo real. */
  snapshots: Record<string, MarketSnapshot>;
  onSelect: (duel: FeaturedCustomDuel) => void;
};

export const FeaturedDuelsBanner: React.FC<Props> = ({ duels, snapshots, onSelect }) => {
  if (!duels.length) return null;

  return (
    <section className='mt-5'>
      <div className='mb-3 flex items-center gap-2'>
        <Star className='h-4 w-4 text-amber-400' fill='currentColor' />
        <h2 className='font-display text-sm font-bold uppercase tracking-[0.18em] text-amber-400'>
          Embates em Destaque
        </h2>
        <span className='text-xs text-white/40'>
          {duels.length} embate{duels.length !== 1 ? 's' : ''} marcado{duels.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
        {duels.map((d) => {
          const banner = resolveAsset(d.bannerUrl);
          const leftPhoto = resolveAsset(d.leftCar.photoUrl);
          const rightPhoto = resolveAsset(d.rightCar.photoUrl);

          // Snapshot ao vivo tem prioridade sobre o payload inicial do REST.
          const snap = snapshots[d.id];
          const leftOdd = snap?.duel.left.odd ?? d.market?.odds[0]?.value ?? 1.0;
          const rightOdd = snap?.duel.right.odd ?? d.market?.odds[1]?.value ?? 1.0;
          const leftPool = snap?.duel.left.pool ?? d.pool?.left ?? 0;
          const rightPool = snap?.duel.right.pool ?? d.pool?.right ?? 0;
          const totalPool = snap?.totalPool ?? (leftPool + rightPool);
          const leftShare = totalPool > 0 ? Math.round((leftPool / totalPool) * 100) : 50;
          const rightShare = totalPool > 0 ? 100 - leftShare : 50;
          const tickets = snap
            ? snap.duel.left.tickets + snap.duel.right.tickets
            : d.pool?.tickets ?? 0;

          return (
            <button
              key={d.id}
              type='button'
              onClick={() => onSelect(d)}
              className='group relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#1c1409] to-[#101525] text-left transition hover:border-amber-400/60 hover:shadow-[0_8px_32px_-12px_rgba(255,197,90,0.4)]'
            >
              {banner && (
                <div className='absolute inset-0'>
                  <img src={banner} alt={d.title} className='h-full w-full object-cover opacity-40 transition group-hover:opacity-50' />
                  <div className='absolute inset-0 bg-gradient-to-t from-[#0a0d18] via-[#0a0d18]/85 to-transparent' />
                </div>
              )}

              <div className='relative p-4'>
                <div className='flex items-center gap-2'>
                  <span className='inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300'>
                    <Star className='h-2.5 w-2.5' fill='currentColor' /> Destaque
                  </span>
                  <span className='inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60'>
                    <Trophy className='h-2.5 w-2.5' /> {d.eventName}
                  </span>
                </div>

                <h3 className='mt-2 font-display text-lg font-bold leading-tight text-white'>{d.title}</h3>

                <div className='mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3'>
                  <CarSide
                    label={d.leftCar.label}
                    driverName={d.leftCar.driverName}
                    photo={leftPhoto}
                    odd={leftOdd}
                    share={leftShare}
                    alignRight
                  />
                  <div className='font-display text-[10px] font-bold tracking-[0.2em] text-white/40'>VS</div>
                  <CarSide
                    label={d.rightCar.label}
                    driverName={d.rightCar.driverName}
                    photo={rightPhoto}
                    odd={rightOdd}
                    share={rightShare}
                  />
                </div>

                {/* Barra de % do pote agregada — visual igual ao DuelCard */}
                <div className='mt-3'>
                  <div className='mb-1 flex items-center justify-between text-[10px] text-white/40'>
                    <span>{leftShare}% das apostas</span>
                    <span>{rightShare}%</span>
                  </div>
                  <div className='flex h-1.5 overflow-hidden rounded-full bg-white/5'>
                    <div className='h-full bg-amber-400/70' style={{ width: `${leftShare}%` }} />
                    <div className='h-full bg-amber-300/40' style={{ width: `${rightShare}%` }} />
                  </div>
                </div>

                <div className='mt-2.5 flex items-center justify-between text-[11px] text-white/50'>
                  <span>Início: {new Date(d.startsAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  {totalPool > 0 && (
                    <span>R$ {totalPool.toFixed(2)} · {tickets} {tickets === 1 ? 'aposta' : 'apostas'}</span>
                  )}
                </div>

                <div className='mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 transition group-hover:gap-2'>
                  Apostar agora →
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

const CarSide: React.FC<{
  label: string;
  driverName: string;
  photo: string | null;
  odd: number;
  share: number;
  alignRight?: boolean;
}> = ({ label, driverName, photo, odd, share, alignRight }) => (
  <div className={`flex items-center gap-2 min-w-0 ${alignRight ? 'flex-row-reverse text-right' : ''}`}>
    <div className='h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5'>
      {photo ? <img src={photo} alt={label} className='h-full w-full object-cover' /> : <div className='h-full w-full' />}
    </div>
    <div className='min-w-0 flex-1'>
      <div className='truncate text-sm font-semibold text-white'>{label}</div>
      <div className='truncate text-[10.5px] text-white/50'>{driverName}</div>
      <div className='mt-0.5 flex items-center gap-1.5'>
        <span className='font-mono text-[11px] font-bold text-amber-300'>{odd.toFixed(2)}x</span>
        <span className='text-[10px] text-white/40'>· {share}%</span>
      </div>
    </div>
  </div>
);
