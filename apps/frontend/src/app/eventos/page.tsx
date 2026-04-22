'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ApiEvent } from '@/types/events';

import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type BrazilListLiveEvent = {
  id: string;
  name: string;
  scheduledAt: string;
  status: 'IN_PROGRESS' | 'FINISHED' | 'DRAFT' | 'CANCELED';
  list: { id: string; areaCode: number; name: string; format: 'TOP_10' | 'TOP_20' };
  matchups: Array<{
    id: string;
    roundNumber: number;
    roundType: 'ODD' | 'EVEN' | 'SHARK_TANK';
    order: number;
    leftPosition: number | null;
    rightPosition: number | null;
    leftDriverName: string | null;
    rightDriverName: string | null;
    winnerSide: 'LEFT' | 'RIGHT' | null;
    marketOpen: boolean;
  }>;
};

export default function EventosPage() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [listEvents, setListEvents] = useState<BrazilListLiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/events`).then(async (r) => {
        if (!r.ok) throw new Error(`Falha ao carregar eventos (${r.status})`);
        return (await r.json()) as ApiEvent[];
      }),
      fetch(`${apiUrl}/brazil-lists/live-events`).then(async (r) => {
        if (!r.ok) return [] as BrazilListLiveEvent[];
        return (await r.json()) as BrazilListLiveEvent[];
      }),
    ])
      .then(([eventsData, listEventsData]) => {
        setEvents(eventsData);
        setListEvents(listEventsData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const statusMap: Record<string, { label: string; color: string }> = {
    SCHEDULED: { label: 'Agendado', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    LIVE: { label: 'Ao Vivo', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    FINISHED: { label: 'Encerrado', color: 'bg-white/10 text-white/50 border-white/10' },
    OPEN: { label: 'Aberto', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    BOOKING_OPEN: { label: 'Booking Aberto', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    BOOKING_CLOSED: { label: 'Booking Fechado', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    SUSPENDED: { label: 'Suspenso', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  };

  function getStatus(status: string) {
    return statusMap[status] ?? { label: status, color: 'bg-white/10 text-white/50 border-white/10' };
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        {/* Hero Header */}
        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
          <h1 className='text-2xl font-semibold sm:text-3xl'>Eventos e Embates</h1>
          <p className='mt-2 text-sm text-white/50'>Veja todos os eventos cadastrados, mercados ativos e embates programados.</p>
          <div className='mt-4 flex items-center gap-3'>
            <span className='inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60'>
              <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
                <line x1='16' y1='2' x2='16' y2='6' /><line x1='8' y1='2' x2='8' y2='6' />
                <line x1='3' y1='10' x2='21' y2='10' />
              </svg>
              {events.length + listEvents.length} evento{(events.length + listEvents.length) !== 1 ? 's' : ''}
            </span>
            {listEvents.length > 0 && (
              <span className='inline-flex items-center gap-2 rounded-full bg-[#d4a843]/10 border border-[#d4a843]/20 px-3 py-1.5 text-xs font-medium text-[#d4a843]'>
                🏁 {listEvents.length} Listas Brasil
              </span>
            )}
          </div>
        </section>

        {loading && (
          <div className='mt-8 flex flex-col items-center justify-center py-16'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
            <p className='mt-4 text-sm text-white/40'>Carregando eventos...</p>
          </div>
        )}

        {error && (
          <div className='mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4'>
            <p className='text-sm text-red-200'>{error}</p>
          </div>
        )}

        {/* Listas Brasil live events */}
        {listEvents.length > 0 && (
          <div className='mt-6 space-y-4'>
            <p className='text-[10px] font-bold uppercase tracking-widest text-[#d4a843]'>Listas Brasil — eventos ativos</p>
            {listEvents.map((le) => {
              const open = le.matchups.filter((m) => m.marketOpen).length;
              const total = le.matchups.length;
              return (
                <Link
                  key={le.id}
                  href={`/listas/${le.list.areaCode}`}
                  className='block group rounded-3xl border border-[#d4a843]/20 bg-[#101525] overflow-hidden transition-colors hover:border-[#d4a843]/40'
                >
                  <div className='relative p-6 pb-5'>
                    <div className='absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#d4a843]/5 blur-3xl' />
                    <div className='relative flex flex-wrap items-start justify-between gap-4'>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 mb-2'>
                          <span className='inline-flex items-center rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#d4a843]'>
                            DDD {le.list.areaCode} · {le.list.format}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${le.status === 'IN_PROGRESS' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-white/10 text-white/50 border-white/10'}`}>
                            {le.status === 'IN_PROGRESS' ? 'Em andamento' : 'Encerrado'}
                          </span>
                          {open > 0 && (
                            <span className='inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold tracking-wider text-blue-300'>
                              {open} mercado{open !== 1 ? 's' : ''} aberto{open !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <h2 className='text-xl font-semibold tracking-tight'>{le.name}</h2>
                        <p className='mt-1 text-xs text-white/50'>{le.list.name}</p>
                        <div className='mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40'>
                          <span className='inline-flex items-center gap-1.5'>
                            {new Date(le.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </span>
                          <span className='h-1 w-1 rounded-full bg-white/20' />
                          <span>{new Date(le.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {total > 0 && (
                            <>
                              <span className='h-1 w-1 rounded-full bg-white/20' />
                              <span>{total} confronto{total !== 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {le.matchups.length > 0 && (
                    <div className='border-t border-white/5 p-6'>
                      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-4'>Embates</p>
                      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                        {le.matchups.slice(0, 6).map((m) => (
                          <div key={m.id} className='flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2'>
                            <span className='text-[10px] font-bold text-white/30'>#{m.order}</span>
                            <span className={`flex-1 truncate text-sm ${m.winnerSide === 'LEFT' ? 'text-emerald-300 font-bold' : 'text-white/80'}`}>
                              {m.leftPosition ? <span className='mr-1 text-[10px] text-white/40'>[{m.leftPosition}]</span> : null}
                              {m.leftDriverName ?? '—'}
                            </span>
                            <span className='text-[10px] text-white/30'>×</span>
                            <span className={`flex-1 truncate text-right text-sm ${m.winnerSide === 'RIGHT' ? 'text-emerald-300 font-bold' : 'text-white/80'}`}>
                              {m.rightDriverName ?? '—'}
                              {m.rightPosition ? <span className='ml-1 text-[10px] text-white/40'>[{m.rightPosition}]</span> : null}
                            </span>
                            {m.marketOpen && (
                              <span className='rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-300'>AO VIVO</span>
                            )}
                          </div>
                        ))}
                        {le.matchups.length > 6 && (
                          <div className='sm:col-span-2 text-center text-xs text-white/40 py-2'>+{le.matchups.length - 6} confrontos — ver lista completa</div>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <div className='mt-6 space-y-6'>
          {events.length > 0 && listEvents.length > 0 && (
            <p className='text-[10px] font-bold uppercase tracking-widest text-white/40'>Outros eventos</p>
          )}
          {events.map((event) => {
            const evStatus = getStatus(event.status);
            return (
              <article key={event.id} className='group rounded-3xl border border-white/10 bg-[#101525] overflow-hidden transition-colors hover:border-white/15'>
                {/* Event Header */}
                <div className='relative p-6 pb-5'>
                  <div className='absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl' />
                  
                  <div className='relative flex flex-wrap items-start justify-between gap-4'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-3 mb-2'>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${evStatus.color}`}>
                          {evStatus.label}
                        </span>
                      </div>
                      <h2 className='text-xl font-semibold tracking-tight'>{event.name}</h2>
                      <div className='mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40'>
                        <span className='inline-flex items-center gap-1.5'>
                          <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
                          </svg>
                          {new Date(event.startAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </span>
                        <span className='h-1 w-1 rounded-full bg-white/20' />
                        <span className='inline-flex items-center gap-1.5'>
                          <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                          </svg>
                          {new Date(event.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className='h-1 w-1 rounded-full bg-white/20' />
                        <span className='rounded-full bg-white/5 px-2 py-0.5 text-white/50'>{event.sport}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duels Section */}
                {event.duels.length > 0 && (
                  <div className='border-t border-white/5 p-6'>
                    <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-4'>Embates</p>
                    <div className='space-y-3'>
                      {event.duels.map((duel) => {
                        const duelStatus = getStatus(duel.status);
                        return (
                          <div key={duel.id} className='rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 transition-colors hover:border-white/15'>
                            {/* Matchup Layout */}
                            <div className='flex items-center gap-3'>
                              {/* Left Side */}
                              <div className='flex-1 text-right'>
                                <p className='font-medium text-white/90 truncate'>{duel.left.carName}</p>
                                <p className='text-xs text-white/40 truncate'>{duel.left.driverName}</p>
                                <p className='text-[10px] text-white/25 mt-0.5'>{duel.left.category}</p>
                              </div>

                              {/* VS Badge */}
                              <div className='flex flex-col items-center shrink-0'>
                                <div className='h-10 w-10 rounded-full bg-gradient-to-br from-blue-500/20 to-orange-500/20 border border-white/10 flex items-center justify-center'>
                                  <span className='text-[10px] font-bold tracking-widest text-white/70'>VS</span>
                                </div>
                              </div>

                              {/* Right Side */}
                              <div className='flex-1'>
                                <p className='font-medium text-white/90 truncate'>{duel.right.carName}</p>
                                <p className='text-xs text-white/40 truncate'>{duel.right.driverName}</p>
                                <p className='text-[10px] text-white/25 mt-0.5'>{duel.right.category}</p>
                              </div>
                            </div>

                            {/* Duel Footer */}
                            <div className='mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2'>
                              <div className='flex items-center gap-2 text-xs text-white/40'>
                                <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                                  <path strokeLinecap='round' strokeLinejoin='round' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                                </svg>
                                Fecha: {new Date(duel.bookingCloseAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${duelStatus.color}`}>
                                {duelStatus.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Markets Section */}
                {event.markets.length > 0 && (
                  <div className='border-t border-white/5 p-6'>
                    <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-4'>Mercados ativos</p>
                    <div className='space-y-3'>
                      {event.markets.map((market) => {
                        const mktStatus = getStatus(market.status);
                        return (
                          <div key={market.id} className='rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 transition-colors hover:border-white/15'>
                            <div className='flex items-center justify-between gap-3 mb-3'>
                              <p className='font-medium text-white/90'>{market.name}</p>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${mktStatus.color}`}>
                                {mktStatus.label}
                              </span>
                            </div>
                            
                            {/* Odds as styled pills */}
                            <div className='grid grid-cols-2 gap-2'>
                              {market.odds.map((odd, idx) => {
                                const isBlue = idx === 0;
                                return (
                                  <div key={odd.id} className={`rounded-xl p-3 ${isBlue ? 'bg-gradient-to-br from-[#121c2d] to-[#0d1320]' : 'bg-gradient-to-br from-[#2d1c12] to-[#1d100a]'}`}>
                                    <p className='text-xs text-white/50 truncate'>{odd.label}</p>
                                    <div className='flex items-baseline gap-1 mt-1'>
                                      <span className={`text-sm ${isBlue ? 'text-blue-400' : 'text-orange-400'}`}>@</span>
                                      <span className='text-xl font-bold tracking-tighter'>{odd.value.toFixed(2)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {!loading && events.length === 0 && listEvents.length === 0 && !error && (
            <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
              <svg className='mx-auto h-10 w-10 text-white/15' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1} d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
              </svg>
              <p className='mt-3 text-sm text-white/40'>Nenhum evento encontrado</p>
              <p className='mt-1 text-xs text-white/25'>Execute o seed do banco para popular dados iniciais.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
