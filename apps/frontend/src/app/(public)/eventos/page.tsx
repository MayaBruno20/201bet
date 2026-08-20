'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ApiEvent } from '@/types/events';
import { EventBanner } from '@/components/event-banner';

import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

/** Foto do lado do embate: avatar do piloto → foto do carro → iniciais.
 *  `/api/images/:id` (re-hospedado) resolve no mesmo domínio via nginx. */
function DuelPhoto({ side }: { side: ApiEvent['duels'][number]['left'] }) {
  const url = side.avatarUrl || side.carPhotoUrl || null;
  const initials =
    side.driverName
      .replace(/["“”']/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={side.driverName}
      className='h-11 w-11 sm:h-12 sm:w-12 rounded-full object-cover border border-white/10 shrink-0'
    />
  ) : (
    <span className='h-11 w-11 sm:h-12 sm:w-12 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/15 to-orange-500/15 border border-white/10 text-white/60 text-[12px] font-bold shrink-0'>
      {initials}
    </span>
  );
}

export default function EventosPage() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${apiUrl}/events`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Falha ao carregar eventos (${r.status})`);
        return (await r.json()) as ApiEvent[];
      })
      // Filtro defensivo: backend já filtra CANCELED + FINISHED. Mantemos a barreira
      // aqui pra evitar que qualquer evento órfão (com Event.status não propagado)
      // vaze pra UI. Eventos finalizados têm página dedicada em /eventos/finalizados.
      .then((eventsData) => setEvents(eventsData.filter((e) => e.status !== 'CANCELED' && e.status !== 'FINISHED')))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpanded = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

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
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        {/* Hero Header */}
        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-4 sm:p-6'>
          <h1 className='text-2xl font-semibold sm:text-3xl'>Eventos e Embates</h1>
          <p className='mt-2 text-sm text-white/50'>Veja todos os eventos cadastrados, mercados ativos e embates programados.</p>
          <div className='mt-4 flex items-center gap-3 flex-wrap'>
            <span className='inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60'>
              <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
                <line x1='16' y1='2' x2='16' y2='6' /><line x1='8' y1='2' x2='8' y2='6' />
                <line x1='3' y1='10' x2='21' y2='10' />
              </svg>
              {events.length} evento{events.length !== 1 ? 's' : ''}
            </span>
            <Link
              href='/eventos/finalizados'
              className='inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors'
            >
              <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              Eventos finalizados
              <span className='ml-1 transition-transform group-hover:translate-x-0.5'>&rarr;</span>
            </Link>
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

        <div className='mt-6 space-y-6'>
          {events.map((event) => {
            const evStatus = getStatus(event.status);
            return (
              <article key={event.id} className='group rounded-3xl border border-white/10 bg-[#101525] overflow-hidden transition-colors hover:border-white/15'>
                {/* Banner do evento (imagem ou vídeo Vimeo/YouTube) */}
                {event.bannerUrl && (
                  <div className='relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[300px] overflow-hidden'>
                    <EventBanner url={event.bannerUrl} alt={event.name} className='absolute inset-0 w-full h-full object-cover' />
                    <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-[#101525] via-[#101525]/40 to-transparent' />
                    {event.featured && (
                      <span className='absolute top-3 right-3 inline-flex items-center rounded-full bg-[#d4a843]/30 backdrop-blur-md border border-[#d4a843]/50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#d4a843]'>
                        ⭐ DESTAQUE
                      </span>
                    )}
                  </div>
                )}

                {/* Event Header */}
                <div className='relative p-4 sm:p-6 pb-5'>
                  {!event.bannerUrl && (
                    <div className='absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl' />
                  )}

                  <div className='relative flex flex-wrap items-start justify-between gap-4'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-3 mb-2'>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${evStatus.color}`}>
                          {evStatus.label}
                        </span>
                        {event.featured && !event.bannerUrl && (
                          <span className='inline-flex items-center rounded-full bg-[#d4a843]/15 border border-[#d4a843]/30 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#d4a843]'>
                            ⭐ DESTAQUE
                          </span>
                        )}
                      </div>
                      <h2 className='text-xl sm:text-2xl font-semibold tracking-tight'>{event.name}</h2>
                      {event.description && (
                        <p className='mt-1 text-sm text-white/60 line-clamp-2'>{event.description}</p>
                      )}
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
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action bar: Apostar agora + toggle Embates */}
                {event.duels.length > 0 && (() => {
                  const isOpen = !!expanded[event.id];
                  const liveDuels = event.duels.filter((d) => d.status === 'BOOKING_OPEN' || d.status === 'BOOKING_CLOSED').length;
                  return (
                    <div className='border-t border-white/5 px-4 py-3 sm:px-6 flex flex-wrap items-center gap-2'>
                      <Link
                        href={event.customDuelId
                          ? `/apostas?duelId=${encodeURIComponent(event.customDuelId)}`
                          : `/apostas?eventId=${encodeURIComponent(event.id)}`}
                        className='inline-flex items-center gap-2 rounded-xl bg-[#d4a843] px-4 py-2.5 text-sm font-bold text-[#04111d] transition-all hover:bg-[#e0b84d]'
                      >
                        <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
                          <path strokeLinecap='round' strokeLinejoin='round' d='M13 10V3L4 14h7v7l9-11h-7z' />
                        </svg>
                        Apostar agora
                      </Link>
                      <button
                        type='button'
                        onClick={() => toggleExpanded(event.id)}
                        aria-expanded={isOpen}
                        className='inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/10'
                      >
                        Embates
                        <span className='rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70'>
                          {event.duels.length}
                        </span>
                        {liveDuels > 0 && (
                          <span className='inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300'>
                            <span className='h-1 w-1 rounded-full bg-emerald-400 animate-pulse' />
                            {liveDuels} ao vivo
                          </span>
                        )}
                        <svg
                          className={`h-4 w-4 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}
                        >
                          <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
                        </svg>
                      </button>
                    </div>
                  );
                })()}

                {/* Duels Section (colapsável) */}
                {event.duels.length > 0 && expanded[event.id] && (
                  <div className='border-t border-white/5 p-4 sm:p-6'>
                    <div className='space-y-3'>
                      {event.duels.map((duel) => {
                        const duelStatus = getStatus(duel.status);
                        return (
                          <div key={duel.id} className='rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-4 transition-colors hover:border-white/15'>
                            {/* Matchup Layout */}
                            <div className='flex items-center gap-2 sm:gap-3'>
                              {/* Left Side */}
                              <div className='flex-1 min-w-0 text-right'>
                                <p className='font-medium text-white/90 truncate'>{duel.left.driverName}</p>
                                {duel.left.carName?.trim() && (
                                  <p className='text-xs text-white/40 truncate'>{duel.left.carName}</p>
                                )}
                                {duel.left.category && duel.left.category !== 'LISTAS_BRASIL' && duel.left.category !== 'QUICK' && (
                                  <p className='text-[10px] text-white/25 mt-0.5'>{duel.left.category}</p>
                                )}
                              </div>

                              <DuelPhoto side={duel.left} />

                              {/* VS */}
                              <span className='shrink-0 text-[10px] font-bold tracking-widest text-white/40'>VS</span>

                              <DuelPhoto side={duel.right} />

                              {/* Right Side */}
                              <div className='flex-1 min-w-0'>
                                <p className='font-medium text-white/90 truncate'>{duel.right.driverName}</p>
                                {duel.right.carName?.trim() && (
                                  <p className='text-xs text-white/40 truncate'>{duel.right.carName}</p>
                                )}
                                {duel.right.category && duel.right.category !== 'LISTAS_BRASIL' && duel.right.category !== 'QUICK' && (
                                  <p className='text-[10px] text-white/25 mt-0.5'>{duel.right.category}</p>
                                )}
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
              </article>
            );
          })}

          {!loading && events.length === 0 && !error && (
            <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
              <svg className='mx-auto h-10 w-10 text-white/15' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1} d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
              </svg>
              <p className='mt-3 text-sm text-white/40'>Nenhum evento agendado no momento</p>
              <p className='mt-1 text-xs text-white/25'>Volte em instantes — novos embates aparecem aqui assim que os mercados abrem.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
