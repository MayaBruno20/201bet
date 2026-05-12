'use client';

import * as React from 'react';

/**
 * 201bet · /apostas — EventSelector
 * Horizontal pill row with available events. Mobile: horizontal scroll w/ fade edges.
 * LIVE events show a pulsing green dot.
 */

export type EventStatus = 'LIVE' | 'SCHEDULED' | 'FINISHED';

export interface BetEvent {
  id: string;
  name: string;
  status: EventStatus;
  startAt: string;
}

export interface EventSelectorProps {
  events?: BetEvent[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

const DEFAULT_EVENTS: BetEvent[] = [
  { id: 'curitiba-final',  name: 'Embate Curitiba · Final', status: 'LIVE',      startAt: new Date().toISOString() },
  { id: 'top-rei-41',      name: 'Top Rei 41',              status: 'LIVE',      startAt: new Date().toISOString() },
  { id: 'armageddon',      name: 'Armageddon Nacional',     status: 'SCHEDULED', startAt: new Date(Date.now() + 90 * 60_000).toISOString() },
  { id: 'lista-11-semi',   name: 'Lista 11 · Semifinal',    status: 'SCHEDULED', startAt: new Date(Date.now() + 4 * 3600_000).toISOString() },
  { id: 'recife-quartas',  name: 'Embate Recife · Quartas', status: 'FINISHED',  startAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
];

function formatStartHint(status: EventStatus, startAt: string): string {
  if (status === 'LIVE') return 'agora';
  if (status === 'FINISHED') return 'encerrado';
  const ms = new Date(startAt).getTime() - Date.now();
  if (ms <= 0) return 'iniciando';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `em ${min}min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `em ${h}h` : `em ${h}h ${rem}m`;
}

export function EventSelector({
  events = DEFAULT_EVENTS,
  selectedId,
  onSelect,
  className = '',
}: EventSelectorProps) {
  const effectiveSelectedId = selectedId ?? events[0]?.id;

  return (
    <div
      className={`relative ${className}`}
      role='tablist'
      aria-label='Eventos disponíveis'
    >
      <div className='pointer-events-none absolute inset-y-0 left-0 w-8 bg-[linear-gradient(90deg,#090b11,transparent)] z-10' />
      <div className='pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(270deg,#090b11,transparent)] z-10' />

      <div className='flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory'>
        {events.map((event) => {
          const isActive = event.id === effectiveSelectedId;
          const isLive = event.status === 'LIVE';
          const isFinished = event.status === 'FINISHED';
          return (
            <button
              key={event.id}
              type='button'
              role='tab'
              aria-selected={isActive}
              onClick={() => onSelect?.(event.id)}
              className={`
                group snap-start shrink-0
                inline-flex items-center gap-2
                rounded-full h-10 px-4 text-sm whitespace-nowrap
                transition-all duration-200 ease-out
                focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
                ${isActive
                  ? 'bg-white text-[#0a0d14] shadow-[0_8px_22px_-10px_rgba(255,255,255,0.45),inset_0_1px_0_rgba(0,0,0,0.05)] font-semibold'
                  : 'bg-white/[0.04] text-[#b8bcc9] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'}
                ${isFinished ? 'opacity-60' : ''}
              `}
            >
              {isLive ? (
                <span className='relative inline-flex h-2 w-2'>
                  <span className='absolute inset-0 rounded-full bg-[#21d97a] animate-ping opacity-60' />
                  <span className='relative inline-flex h-2 w-2 rounded-full bg-[#21d97a]' />
                </span>
              ) : isFinished ? (
                <span className='inline-block h-1.5 w-1.5 rounded-full bg-[#4a4f5d]' />
              ) : (
                <span className='inline-block h-1.5 w-1.5 rounded-full bg-[#ffb028]' />
              )}
              <span>{event.name}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${isActive ? 'text-[#767b8a]' : 'text-[#4a4f5d]'}`}
              >
                {formatStartHint(event.status, event.startAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default EventSelector;
